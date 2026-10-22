"""Train the malicious (phishing) URL classifier.

    python -m ml.training.train_url [--max-fpr 0.01]

Data: Sahingoz, Buber, Demir & Diri (2019), "Machine learning based phishing
detection from URLs", Expert Systems with Applications 117:345-357. 37,175
phishing URLs (PhishTank) and 36,400 legitimate URLs (Yandex search results),
published by the authors at github.com/ebubekirbbr/pdd.

Leakage control: URLs are normalised (scheme and ``www.`` dropped, see
url_features.py), de-duplicated, and URLs present in both classes are
removed. The split is grouped by registered domain, so no site appears in
more than one of train / validation / test.

Models compared:
  * baseline: logistic regression on the 36 hand-crafted lexical features;
  * XGBoost on the lexical features;
  * character n-gram TF-IDF + logistic regression;
  * blend: mean of the XGBoost and n-gram probabilities.
The best validation PR-AUC wins. Its scores are isotonic-calibrated on the
validation split so that the risk score reads as a probability.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.frozen import FrozenEstimator
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from ml.evaluation.metrics import binary_report, choose_threshold, latency_ms
from ml.preprocessing.url_features import FEATURE_NAMES, extract_features, normalize_url, parse_url
from ml.training import artifacts
from ml.training.url_model import UrlModel

RAW = Path(__file__).resolve().parents[1] / "data" / "raw" / "sahingoz_urls"
FILES = {"data_phishing_37175.json": 1, "data_legitimate_36400.json": 0}


def load() -> pd.DataFrame:
    rows = []
    for name, y in FILES.items():
        path = RAW / name
        if not path.exists():
            raise SystemExit(f"{path} missing. Run: python -m ml.data.download sahingoz")
        rows += [{"url": u, "y": y} for u in json.loads(path.read_text()) if isinstance(u, str) and u.strip()]
    df = pd.DataFrame(rows)
    df["norm"] = df["url"].map(normalize_url)
    return df


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-fpr", type=float, default=0.01)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args(argv)

    df = load()
    n_raw = len(df)
    df = df.drop_duplicates(["norm", "y"])
    df = df[~df.duplicated("norm", keep=False)].reset_index(drop=True)
    df["group"] = df["norm"].map(lambda u: parse_url(u).registered_domain)
    print(f"{n_raw} URLs, {len(df)} after normalisation/de-dup, {df['group'].nunique()} registered domains")

    gss = GroupShuffleSplit(n_splits=1, test_size=0.30, random_state=args.seed)
    tr_idx, rest_idx = next(gss.split(df, df["y"], df["group"]))
    rest = df.iloc[rest_idx]
    gss2 = GroupShuffleSplit(n_splits=1, test_size=0.50, random_state=args.seed)
    va_rel, te_rel = next(gss2.split(rest, rest["y"], rest["group"]))
    train, val, test = df.iloc[tr_idx], rest.iloc[va_rel], rest.iloc[te_rel]
    assert not (set(train.group) & set(test.group)) and not (set(val.group) & set(test.group))

    def lexical(frame: pd.DataFrame) -> np.ndarray:
        return np.array([[extract_features(u)[n] for n in FEATURE_NAMES] for u in frame["norm"]], dtype=np.float32)

    Xtr, Xva, Xte = lexical(train), lexical(val), lexical(test)
    ytr, yva, yte = train["y"].to_numpy(), val["y"].to_numpy(), test["y"].to_numpy()

    baseline = Pipeline([("scale", StandardScaler()), ("clf", LogisticRegression(max_iter=3000, class_weight="balanced"))])
    baseline.fit(Xtr, ytr)
    xgb = XGBClassifier(n_estimators=600, max_depth=7, learning_rate=0.08, subsample=0.9, colsample_bytree=0.8,
                        tree_method="hist", eval_metric="aucpr", early_stopping_rounds=40, random_state=args.seed,
                        n_jobs=4)
    xgb.fit(Xtr, ytr, eval_set=[(Xva, yva)], verbose=False)
    ngram = Pipeline([
        ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=3, max_features=200_000,
                                  sublinear_tf=True, dtype=np.float32)),
        ("clf", LogisticRegression(C=4.0, max_iter=3000, class_weight="balanced", solver="liblinear")),
    ])
    ngram.fit(train["norm"], ytr)

    scores = {
        "lexical_logreg_baseline": (baseline.predict_proba(Xva)[:, 1], baseline.predict_proba(Xte)[:, 1]),
        "lexical_xgboost": (xgb.predict_proba(Xva)[:, 1], xgb.predict_proba(Xte)[:, 1]),
        "char_ngram_logreg": (ngram.predict_proba(val["norm"])[:, 1], ngram.predict_proba(test["norm"])[:, 1]),
    }
    scores["blend_xgb_ngram"] = tuple((a + b) / 2 for a, b in zip(scores["lexical_xgboost"], scores["char_ngram_logreg"]))

    results = {}
    for name, (sv, st) in scores.items():
        thr = choose_threshold(yva, sv, args.max_fpr)
        results[name] = {"validation": binary_report(yva, sv, thr), "test": binary_report(yte, st, thr)}
        print(name, {k: round(v, 4) for k, v in results[name]["test"].items() if isinstance(v, float)})

    best = max(results, key=lambda n: results[n]["validation"]["pr_auc"])
    # Isotonic calibration of the selected scorer on validation data.
    calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0).fit(scores[best][0], yva)
    cal_val = calibrator.predict(scores[best][0])
    cal_test = calibrator.predict(scores[best][1])
    thr = choose_threshold(yva, cal_val, args.max_fpr)
    final = {"validation": binary_report(yva, cal_val, thr), "test": binary_report(yte, cal_test, thr)}

    # Error analysis by URL shape: bare host names vs URLs with a path or query.
    shape = np.where((test["norm"].str.contains("/") | test["norm"].str.contains(r"\?")), "with_path", "host_only")
    by_shape = {}
    for s in ("host_only", "with_path"):
        m = shape == s
        if m.sum() and len(set(yte[m])) > 1:
            by_shape[s] = binary_report(yte[m], cal_test[m], thr)
        else:
            by_shape[s] = {"n": int(m.sum()), "positives": int(yte[m].sum()), "note": "single class in subset"}
            if m.sum():
                pred = cal_test[m] >= thr
                by_shape[s]["recall_or_specificity"] = float((pred == yte[m].astype(bool)).mean())

    model = UrlModel(
        kind=best, baseline=baseline if best == "lexical_logreg_baseline" else None,
        xgb=xgb if best in ("lexical_xgboost", "blend_xgb_ngram") else None,
        ngram=ngram if best in ("char_ngram_logreg", "blend_xgb_ngram") else None,
        calibrator=calibrator, feature_names=FEATURE_NAMES,
    )
    sample = test["url"].sample(300, random_state=args.seed).tolist()
    latency = latency_ms(model.predict_proba_one, sample)

    version = artifacts.new_version()
    meta = {
        "version": version,
        "task": "binary: phishing URL vs legitimate URL (lexical only, URL is never fetched)",
        "selected_model": best,
        "calibration": "isotonic on validation split",
        "threshold": thr,
        "threshold_policy": f"lowest threshold with validation FPR <= {args.max_fpr}",
        "datasets": ["Sahingoz et al. 2019 phishing URL dataset (PhishTank + Yandex)"],
        "dataset_files": {n: artifacts.file_sha256(RAW / n) for n in FILES},
        "split": "GroupShuffleSplit by registered domain: 70% train / 15% val / 15% test",
        "rows": {"raw": n_raw, "deduplicated": len(df), "train": len(train), "val": len(val), "test": len(test)},
        "metrics": final,
        "metrics_by_url_shape": by_shape,
        "latency": latency,
        "feature_names": FEATURE_NAMES,
        "limitations": [
            "Collected in 2017-2018; phishing infrastructure changes quickly, so re-train on fresh feeds "
            "(PhishTank / OpenPhish / URLhaus exports) regularly.",
            "Legitimate URLs come from search-engine results, which are biased toward popular, content-rich "
            "sites; internal hospital portals and vendor URLs may look unusual and score higher.",
            "Lexical analysis cannot see page content, certificates or redirects by design.",
        ],
    }
    artifacts.save("url_classifier", model, meta)

    rows = [{"model": n + (" (selected)" if n == best else ""), "val PR-AUC": r["validation"]["pr_auc"],
             "precision": r["test"]["precision"], "recall": r["test"]["recall"], "f1": r["test"]["f1"],
             "FPR": r["test"]["false_positive_rate"], "ROC-AUC": r["test"]["roc_auc"], "PR-AUC": r["test"]["pr_auc"]}
            for n, r in results.items()]
    t = final["test"]
    cm = t["confusion_matrix"]["matrix"]
    md = f"""# URL classifier — evaluation report

Version `{version}` · selected **{best}** (isotonic-calibrated) · generated by `python -m ml.training.train_url`

Dataset: Sahingoz et al. 2019. Split: {meta['split']}. Rows: {meta['rows']}.

## Model comparison on the held-out test domains (uncalibrated scores, validation-chosen thresholds)

{artifacts.md_table(rows, ["model", "val PR-AUC", "precision", "recall", "f1", "FPR", "ROC-AUC", "PR-AUC"])}

## Selected model after calibration

Threshold {thr:.4f} (lowest with validation FPR ≤ {args.max_fpr}).
Precision {t['precision']:.4f} · recall {t['recall']:.4f} · F1 {t['f1']:.4f} · FPR {t['false_positive_rate']:.4f} ·
ROC-AUC {t['roc_auc']:.4f} · PR-AUC {t['pr_auc']:.4f} · Brier {t['brier']:.4f}

| | predicted legitimate | predicted phishing |
|---|---|---|
| actual legitimate | {cm[0][0]} | {cm[0][1]} |
| actual phishing | {cm[1][0]} | {cm[1][1]} |

By URL shape (test): `{json.dumps(by_shape, default=lambda o: round(o, 4) if isinstance(o, float) else o)[:1500]}`

Latency per URL (feature extraction + model, n={latency['n']}): mean {latency['mean_ms']:.2f} ms, p95 {latency['p95_ms']:.2f} ms.

## Limitations

""" + "\n".join(f"- {x}" for x in meta["limitations"]) + "\n"
    artifacts.write_report("url_classifier", version, {"metadata": meta, "all_models": results}, md)
    print(f"saved url_classifier {version} ({best})", json.dumps(final["test"], default=str)[:400])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
