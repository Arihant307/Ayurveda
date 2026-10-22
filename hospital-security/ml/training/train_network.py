"""Train network-intrusion classifiers on CSE-CIC-IDS2018.

    python -m ml.preprocessing.prepare_cic2018      # once
    python -m ml.training.train_network [--max-fpr 0.01]

Two artifacts are produced:
  * ``network_cic``      – 77 CICFlowMeter features, for CSV batch analysis;
  * ``network_portable`` – 12 features computable from Zeek conn.log or
    Suricata EVE flow records, for live telemetry.

For each feature set a simple baseline (log-scaled logistic regression), a
Random Forest and XGBoost are compared; the best validation macro-F1 wins.
Class imbalance is handled with balanced class/sample weights. An alert
threshold on P(attack) = 1 - P(benign) is chosen on validation data as the
lowest threshold whose benign false-positive rate is at or below --max-fpr.
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier

from ml.evaluation.metrics import choose_threshold, latency_ms, multiclass_report
from ml.preprocessing.flow_features import CATEGORY_INFO, CIC_FEATURES, PORTABLE_FEATURES, portable_from_counts
from ml.training import artifacts
from ml.training.network_model import NetworkModel

PROCESSED = Path(__file__).resolve().parents[1] / "data" / "processed"
CLASSES = list(CATEGORY_INFO)


def signed_log1p(x: np.ndarray) -> np.ndarray:
    return np.sign(x) * np.log1p(np.abs(x))


def portable_frame(df: pd.DataFrame) -> pd.DataFrame:
    rows = [portable_from_counts(int(p), int(pr), d / 1e6, int(f), int(b), fb, bb) for p, pr, d, f, b, fb, bb in zip(
        df["Dst Port"], df["Protocol"], df["Flow Duration"], df["Tot Fwd Pkts"], df["Tot Bwd Pkts"],
        df["TotLen Fwd Pkts"], df["TotLen Bwd Pkts"])]
    return pd.DataFrame(rows, columns=PORTABLE_FEATURES).astype("float32")


def models(seed: int) -> dict[str, object]:
    return {
        "baseline_logreg": Pipeline([("log", FunctionTransformer(signed_log1p)), ("scale", StandardScaler()),
                                     ("clf", LogisticRegression(max_iter=300, class_weight="balanced"))]),
        # Size-capped so the artifact stays small enough to version (~tens of MB) and fast per flow.
        "random_forest": RandomForestClassifier(n_estimators=100, max_depth=20, min_samples_leaf=5, n_jobs=4,
                                                class_weight="balanced_subsample", random_state=seed),
        "xgboost": XGBClassifier(n_estimators=400, max_depth=8, learning_rate=0.1, subsample=0.9,
                                 colsample_bytree=0.8, tree_method="hist", objective="multi:softprob",
                                 eval_metric="mlogloss", early_stopping_rounds=30, n_jobs=4, random_state=seed),
    }


def train_feature_set(name: str, cols: list[str], frames: dict[str, pd.DataFrame], y: dict[str, np.ndarray],
                      args: argparse.Namespace, raw_test: pd.DataFrame) -> dict:
    Xtr, Xva, Xte = (frames[s][cols].to_numpy(np.float32) for s in ("train", "val", "test"))
    results, fitted = {}, {}
    weights = compute_sample_weight("balanced", y["train"])
    benign_idx = CLASSES.index("benign")
    for mname, est in models(args.seed).items():
        t0 = time.time()
        if mname == "xgboost":
            est.fit(Xtr, y["train"], sample_weight=weights, eval_set=[(Xva, y["val"])], verbose=False)
        else:
            est.fit(Xtr, y["train"])
        fit_s = time.time() - t0
        if hasattr(est, "n_jobs"):
            est.set_params(n_jobs=1)  # single-record live inference: thread start-up dominates otherwise
        pva, pte = est.predict_proba(Xva), est.predict_proba(Xte)
        thr = choose_threshold((y["val"] != benign_idx).astype(int), 1 - pva[:, benign_idx], args.max_fpr)
        wrapper = NetworkModel(name, cols, CLASSES, est, thr, mname)
        lab_va, pa_va = wrapper.decide(pva)
        lab_te, pa_te = wrapper.decide(pte)
        yv = [CLASSES[i] for i in y["val"]]
        yt = [CLASSES[i] for i in y["test"]]
        results[mname] = {"fit_seconds": fit_s, "attack_threshold": thr,
                          "validation": multiclass_report(yv, lab_va, CLASSES, attack_scores=pa_va),
                          "test": multiclass_report(yt, lab_te, CLASSES, attack_scores=pa_te)}
        fitted[mname] = wrapper
        t = results[mname]["test"]
        print(f"[{name}] {mname}: macro-F1 {t['macro_f1']:.4f} attack recall {t['attack_vs_benign']['recall']:.4f} "
              f"FPR {t['attack_vs_benign']['false_positive_rate']:.4f} ({fit_s:.0f}s)")

    best = max(results, key=lambda m: results[m]["validation"]["macro_f1"])
    model = fitted[best]
    # Per original CIC label recall on test (shows which sub-attacks are missed).
    lab_te, _ = model.decide(model.estimator.predict_proba(Xte))
    per_label = (pd.DataFrame({"label": raw_test["Label"].to_numpy(), "pred": lab_te,
                               "cat": raw_test["category"].to_numpy()})
                 .assign(detected=lambda d: np.where(d.cat == "benign", d.pred == "benign", d.pred != "benign"),
                         exact=lambda d: d.pred == d.cat)
                 .groupby("label").agg(n=("pred", "size"), detected_rate=("detected", "mean"), exact_category_rate=("exact", "mean"))
                 .reset_index().to_dict("records"))
    records = frames["test"][cols].sample(300, random_state=args.seed).to_dict("records")
    latency = latency_ms(lambda r: model.predict([r]), records)
    return {"best": best, "model": model, "results": results, "per_label": per_label, "latency": latency}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-fpr", type=float, default=0.01)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args(argv)
    paths = {s: PROCESSED / f"cic2018_{s}.parquet" for s in ("train", "val", "test")}
    if not all(p.exists() for p in paths.values()):
        raise SystemExit("Processed CIC-IDS2018 splits missing. Run: python -m ml.preprocessing.prepare_cic2018")
    raw = {s: pd.read_parquet(p) for s, p in paths.items()}
    y = {s: raw[s]["category"].map(CLASSES.index).to_numpy() for s in raw}
    summary = (PROCESSED / "cic2018_summary.json").read_text()

    outputs = {}
    for set_name, cols, frames in (
        ("network_cic", CIC_FEATURES, raw),
        ("network_portable", PORTABLE_FEATURES, {s: portable_frame(raw[s]) for s in raw}),
    ):
        out = train_feature_set(set_name, cols, frames, y, args, raw["test"])
        outputs[set_name] = out
        best = out["best"]
        version = artifacts.new_version()
        meta = {
            "version": version,
            "task": "multiclass network-flow classification (benign + 6 attack categories)",
            "feature_set": set_name,
            "features": cols,
            "classes": CLASSES,
            "category_info": CATEGORY_INFO,
            "selected_model": best,
            "attack_threshold": out["model"].attack_threshold,
            "threshold_policy": f"lowest P(attack) threshold with validation benign FPR <= {args.max_fpr}",
            "datasets": ["CSE-CIC-IDS2018 (CIC & CSE), processed CICFlowMeter CSVs from the official AWS bucket"],
            "dataset_files": sorted(raw["train"]["day"].unique().tolist()),
            "split": "time-ordered per (day, label): earliest 70% train, next 15% val, latest 15% test",
            "rows": {s: len(raw[s]) for s in raw},
            "preparation_summary": summary,
            "metrics": out["results"][best],
            "per_label_test": out["per_label"],
            "latency": out["latency"],
            "limitations": [
                "Lab traffic from 2018 (CIC testbed). Hospital networks, medical-device protocols (DICOM, HL7, "
                "IoMT) and modern attacks are not represented.",
                "The official CSVs are truncated at 1,048,575 rows per day, and heavy de-duplication leaves very "
                "few FTP brute-force (46) and SQL-injection flows; recall for those labels is unreliable.",
                "Infiltration flows are largely indistinguishable from benign flows at the flow level (a known "
                "property of this dataset); expect low recall for that category.",
                "Destination port is a strong feature; attacks on non-standard ports may be missed.",
            ] + (["Portable features approximate CICFlowMeter from Zeek/Suricata counters; Suricata byte counts "
                  "include headers and are corrected with a fixed per-packet estimate."]
                 if set_name == "network_portable" else []),
        }
        artifacts.save(set_name, out["model"], meta)
        rows = [{"model": m + (" (selected)" if m == best else ""), "macro F1": r["test"]["macro_f1"],
                 "weighted F1": r["test"]["weighted_f1"], "attack precision": r["test"]["attack_vs_benign"]["precision"],
                 "attack recall": r["test"]["attack_vs_benign"]["recall"],
                 "benign FPR": r["test"]["attack_vs_benign"]["false_positive_rate"],
                 "attack PR-AUC": r["test"]["attack_vs_benign"].get("pr_auc"), "fit s": round(r["fit_seconds"], 1)}
                for m, r in out["results"].items()]
        t = out["results"][best]["test"]
        pc = [{"category": c, **{k: v for k, v in m.items()}} for c, m in t["per_class"].items()]
        cm = t["confusion_matrix"]
        cm_md = "| actual \\ predicted | " + " | ".join(cm["labels"]) + " |\n|" + "---|" * (len(cm["labels"]) + 1) + "\n"
        cm_md += "\n".join(f"| {lab} | " + " | ".join(str(v) for v in row) + " |" for lab, row in zip(cm["labels"], cm["matrix"]))
        md = f"""# {set_name} — evaluation report

Version `{version}` · selected **{best}** · generated by `python -m ml.training.train_network`

Dataset: CSE-CIC-IDS2018 ({len(meta['dataset_files'])} capture days). Split: {meta['split']}. Rows: {meta['rows']}.
Features: {len(cols)} ({'CICFlowMeter' if set_name == 'network_cic' else 'portable: Zeek/Suricata-compatible'}).

## Model comparison (held-out test, later in time than training flows)

{artifacts.md_table(rows, list(rows[0]))}

## Selected model — per category (test)

{artifacts.md_table(pc, ["category", "precision", "recall", "f1-score", "support"])}

## Confusion matrix (test)

{cm_md}

## Detection rate per original CIC-IDS2018 label (test)

{artifacts.md_table(out['per_label'], ["label", "n", "detected_rate", "exact_category_rate"])}

Alert threshold on P(attack): {out['model'].attack_threshold:.4f}.
Single-flow latency (n={out['latency']['n']}): mean {out['latency']['mean_ms']:.2f} ms, p95 {out['latency']['p95_ms']:.2f} ms.

## Limitations

""" + "\n".join(f"- {x}" for x in meta["limitations"]) + "\n"
        artifacts.write_report(set_name, version, {"metadata": meta, "all_models": out["results"]}, md)
        print(f"saved {set_name} {version} ({best})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
