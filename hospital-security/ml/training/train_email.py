"""Train the phishing / malicious e-mail text classifier.

    python -m ml.training.train_email [--max-fpr 0.01]

Data: Enron-Spam (Metsis, Androutsopoulos & Paliouras, CEAS 2006), six mailbox
subsets enron1..enron6. The Apache SpamAssassin public corpus is added to the
training data when ``ml/data/raw/spamassassin`` exists.

Leakage control:
  * exact duplicates (after normalisation) are removed across the whole corpus
    before splitting, so the same message can never be in train and test;
  * source-based split: enron1-4 are used for training/validation, enron5 and
    enron6 (different employees' mailboxes and different spam traps) are held
    out entirely as the test set.

Models compared: TF-IDF + Logistic Regression (baseline), TF-IDF + linear SVM
(Platt-calibrated) and TF-IDF + Complement Naive Bayes. The model with the best
validation PR-AUC is kept, and its decision threshold is chosen on validation
data as the lowest threshold whose false-positive rate stays at or below
``--max-fpr``.
"""

from __future__ import annotations

import argparse
import email
import email.policy
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import ComplementNB
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from ml.evaluation.metrics import binary_report, choose_threshold, latency_ms
from ml.preprocessing.email_features import normalize_text
from ml.training import artifacts

RAW = Path(__file__).resolve().parents[1] / "data" / "raw"
# Message counts per subset, in the order build_data_file.py concatenated them
# (ham first, then spam, for enron1..enron6). From the Enron-Spam readme.
ENRON_SUBSETS = [("enron1", 3672, 1500), ("enron2", 4361, 1496), ("enron3", 4012, 1500),
                 ("enron4", 1500, 4500), ("enron5", 1500, 3675), ("enron6", 1500, 4500)]


def load_enron() -> pd.DataFrame:
    path = RAW / "enron_spam" / "enron_spam_data.zip"
    if not path.exists():
        raise SystemExit(f"{path} missing. Run: python -m ml.data.download enron")
    df = pd.read_csv(path).sort_values("Message ID").reset_index(drop=True)
    subset, label = [], []
    for name, n_ham, n_spam in ENRON_SUBSETS:
        subset += [name] * (n_ham + n_spam)
        label += ["ham"] * n_ham + ["spam"] * n_spam
    if len(subset) != len(df) or list(df["Spam/Ham"]) != label:
        raise SystemExit("Enron-Spam CSV does not match the documented subset layout; refusing to guess sources")
    df["source"] = subset
    df["text"] = df["Subject"].fillna("") + " \n " + df["Message"].fillna("")
    df["y"] = (df["Spam/Ham"] == "spam").astype(int)
    return df[["text", "y", "source"]]


def load_spamassassin() -> pd.DataFrame | None:
    base = RAW / "spamassassin"
    if not base.exists():
        return None
    rows = []
    for path in base.glob("*/*/*"):
        if not path.is_file() or path.name == "cmds":
            continue
        msg = email.message_from_bytes(path.read_bytes(), policy=email.policy.compat32)
        parts = [p.get_payload(decode=True) or b"" for p in msg.walk()
                 if p.get_content_maintype() == "text" and not p.is_multipart()]
        body = b"\n".join(parts).decode("latin-1", errors="replace")
        rows.append({"text": f"{msg.get('Subject', '')} \n {body}", "y": int("spam" in path.parent.name),
                     "source": "spamassassin"})
    return pd.DataFrame(rows) if rows else None


def candidates() -> dict[str, Pipeline]:
    def tfidf() -> TfidfVectorizer:
        return TfidfVectorizer(preprocessor=normalize_text, ngram_range=(1, 2), min_df=2, max_df=0.95,
                               max_features=100_000, sublinear_tf=True, dtype=np.float32)

    return {
        "tfidf_logreg": Pipeline([("tfidf", tfidf()), ("clf", LogisticRegression(
            C=8.0, class_weight="balanced", max_iter=2000, solver="liblinear"))]),
        "tfidf_linear_svm": Pipeline([("tfidf", tfidf()), ("clf", CalibratedClassifierCV(
            LinearSVC(C=0.5, class_weight="balanced"), method="sigmoid", cv=3))]),
        "tfidf_complement_nb": Pipeline([("tfidf", tfidf()), ("clf", ComplementNB(alpha=0.3))]),
    }


def linear_coef(pipe: Pipeline) -> np.ndarray | None:
    clf = pipe.named_steps["clf"]
    if hasattr(clf, "coef_"):
        return np.asarray(clf.coef_).ravel()
    if isinstance(clf, CalibratedClassifierCV):
        return np.mean([np.asarray(c.estimator.coef_).ravel() for c in clf.calibrated_classifiers_], axis=0)
    if isinstance(clf, ComplementNB):
        return (clf.feature_log_prob_[1] - clf.feature_log_prob_[0]).ravel()
    return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-fpr", type=float, default=0.01)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args(argv)

    df = load_enron()
    sa = load_spamassassin()
    sources = ["Enron-Spam (enron1-6)"]
    if sa is not None:
        df = pd.concat([df, sa], ignore_index=True)
        sources.append("Apache SpamAssassin public corpus")
    n_raw = len(df)
    df["norm"] = df["text"].map(normalize_text)
    df = df.drop_duplicates("norm")
    conflicts = df.duplicated("norm", keep=False)
    df = df[~conflicts]
    print(f"{n_raw} messages, {len(df)} after de-duplication")

    test = df[df["source"].isin(["enron5", "enron6"])]
    trainval = df[~df["source"].isin(["enron5", "enron6"])]
    train, val = train_test_split(trainval, test_size=0.15, stratify=trainval["y"], random_state=args.seed)

    results = {}
    fitted = {}
    for name, pipe in candidates().items():
        pipe.fit(train["text"], train["y"])
        val_scores = pipe.predict_proba(val["text"])[:, 1]
        thr = choose_threshold(val["y"].to_numpy(), val_scores, args.max_fpr)
        results[name] = {"validation": binary_report(val["y"], val_scores, thr)}
        test_scores = pipe.predict_proba(test["text"])[:, 1]
        results[name]["test"] = binary_report(test["y"], test_scores, thr)
        results[name]["test_at_0.5"] = binary_report(test["y"], test_scores, 0.5)
        fitted[name] = pipe
        print(name, {k: round(v, 4) for k, v in results[name]["test"].items() if isinstance(v, float)})

    best = max(results, key=lambda n: results[n]["validation"]["pr_auc"])
    pipe = fitted[best]
    threshold = results[best]["validation"]["threshold"]
    sample = test["text"].sample(300, random_state=args.seed).tolist()
    latency = latency_ms(lambda t: pipe.predict_proba([t]), sample)

    version = artifacts.new_version()
    meta = {
        "version": version,
        "task": "binary: malicious/unsolicited e-mail (spam incl. phishing) vs legitimate",
        "selected_model": best,
        "threshold": threshold,
        "threshold_policy": f"lowest threshold with validation FPR <= {args.max_fpr}",
        "datasets": sources,
        "dataset_files": {p: artifacts.file_sha256(RAW / p) for p in ["enron_spam/enron_spam_data.zip"]},
        "split": "source-based: train/val = enron1-4 (85/15 stratified), test = enron5+enron6",
        "rows": {"raw": n_raw, "deduplicated": len(df), "train": len(train), "val": len(val), "test": len(test)},
        "metrics": results[best],
        "latency": latency,
        "limitations": [
            "Enron-Spam labels spam vs ham; phishing is a subset of spam, so the score means 'malicious or "
            "unsolicited', not phishing specifically. Phishing-specific signals come from the rule indicators.",
            "Training mail dates from 1999-2005; modern lures (QR codes, OAuth consent, MFA fatigue) are "
            "under-represented. Re-train on recent, locally labelled mail before production use.",
            "Header features are not model inputs because the preprocessed corpus has no headers.",
        ],
    }
    bundle = {"pipeline": pipe, "coef": linear_coef(pipe)}
    artifacts.save("email_classifier", bundle, meta)

    rows = []
    for name, r in results.items():
        t = r["test"]
        rows.append({"model": name + (" (selected)" if name == best else ""), "val PR-AUC": r["validation"]["pr_auc"],
                     "threshold": t["threshold"], "precision": t["precision"], "recall": t["recall"], "f1": t["f1"],
                     "FPR": t["false_positive_rate"], "ROC-AUC": t["roc_auc"], "PR-AUC": t["pr_auc"]})
    cm = results[best]["test"]["confusion_matrix"]["matrix"]
    md = f"""# E-mail classifier — evaluation report

Version `{version}` · selected model **{best}** · generated by `python -m ml.training.train_email`

Datasets: {', '.join(sources)}. Split: {meta['split']}.
Rows: {meta['rows']}.

## Held-out test (enron5 + enron6, never seen in training)

Threshold chosen on validation data: lowest threshold with validation FPR ≤ {args.max_fpr}.

{artifacts.md_table(rows, ["model", "val PR-AUC", "threshold", "precision", "recall", "f1", "FPR", "ROC-AUC", "PR-AUC"])}

Confusion matrix of the selected model (rows = actual, columns = predicted):

| | predicted legitimate | predicted malicious |
|---|---|---|
| actual legitimate | {cm[0][0]} | {cm[0][1]} |
| actual malicious | {cm[1][0]} | {cm[1][1]} |

Single-message inference latency (feature extraction + model, n={latency['n']}):
mean {latency['mean_ms']:.2f} ms, p95 {latency['p95_ms']:.2f} ms.

## Trade-off

The validation FPR budget is held near {args.max_fpr:.0%} to keep clinicians' legitimate mail
from being flagged, at some cost in recall. At the default 0.5 threshold the selected model
scores recall {results[best]['test_at_0.5']['recall']:.4f} and FPR {results[best]['test_at_0.5']['false_positive_rate']:.4f} on the same test set.

## Limitations

""" + "\n".join(f"- {x}" for x in meta["limitations"]) + "\n"
    artifacts.write_report("email_classifier", version, {"metadata": meta, "all_models": results}, md)
    print(f"saved email_classifier {version} ({best})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
