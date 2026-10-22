"""Metric helpers shared by every training script.

All numbers in the reports come from these functions applied to held-out
records. Nothing here is hand-entered.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Sequence
from typing import Any

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)


def choose_threshold(y_true: np.ndarray, scores: np.ndarray, max_fpr: float) -> float:
    """Lowest threshold whose false-positive rate on validation data stays at or below ``max_fpr``.

    The lowest such threshold gives the highest recall under the false-positive budget,
    which is the trade-off we want for a hospital SOC: catch as much harmful activity as
    possible without flooding analysts with false alarms.
    """
    neg = np.sort(scores[y_true == 0])
    if len(neg) == 0:
        return 0.5
    # Index of the score that the allowed number of negatives may reach or exceed.
    allowed = int(np.floor(max_fpr * len(neg)))
    cut = neg[len(neg) - allowed - 1] if allowed < len(neg) else neg[0]
    return float(np.nextafter(cut, np.inf))


def binary_report(y_true: Sequence[int], scores: Sequence[float], threshold: float) -> dict[str, Any]:
    y = np.asarray(y_true).astype(int)
    s = np.asarray(scores, dtype=float)
    pred = (s >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {
        "threshold": float(threshold),
        "n": int(len(y)),
        "positives": int(y.sum()),
        "precision": float(precision_score(y, pred, zero_division=0)),
        "recall": float(recall_score(y, pred, zero_division=0)),
        "f1": float(f1_score(y, pred, zero_division=0)),
        "false_positive_rate": float(fp / (fp + tn)) if fp + tn else 0.0,
        "false_negative_rate": float(fn / (fn + tp)) if fn + tp else 0.0,
        "roc_auc": float(roc_auc_score(y, s)) if len(set(y)) > 1 else None,
        "pr_auc": float(average_precision_score(y, s)) if len(set(y)) > 1 else None,
        "brier": float(brier_score_loss(y, np.clip(s, 0, 1))),
        "confusion_matrix": {"labels": ["negative", "positive"], "matrix": [[int(tn), int(fp)], [int(fn), int(tp)]]},
    }


def multiclass_report(y_true: Sequence[str], y_pred: Sequence[str], labels: list[str],
                      benign_label: str = "benign", attack_scores: Sequence[float] | None = None) -> dict[str, Any]:
    y = np.asarray(y_true)
    p = np.asarray(y_pred)
    present = [lab for lab in labels if lab in set(y) | set(p)]
    cm = confusion_matrix(y, p, labels=present)
    rep = classification_report(y, p, labels=present, output_dict=True, zero_division=0)
    yb = (y != benign_label).astype(int)
    pb = (p != benign_label).astype(int)
    tn, fp, fn, tp = confusion_matrix(yb, pb, labels=[0, 1]).ravel()
    out: dict[str, Any] = {
        "n": int(len(y)),
        "per_class": {k: {m: float(v) for m, v in rep[k].items()} for k in present},
        "macro_f1": float(rep["macro avg"]["f1-score"]),
        "weighted_f1": float(rep["weighted avg"]["f1-score"]),
        "confusion_matrix": {"labels": present, "matrix": cm.astype(int).tolist()},
        "attack_vs_benign": {
            "precision": float(tp / (tp + fp)) if tp + fp else 0.0,
            "recall": float(tp / (tp + fn)) if tp + fn else 0.0,
            "f1": float(2 * tp / (2 * tp + fp + fn)) if tp else 0.0,
            "false_positive_rate": float(fp / (fp + tn)) if fp + tn else 0.0,
            "confusion_matrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
        },
    }
    if attack_scores is not None and len(set(yb)) > 1:
        out["attack_vs_benign"]["roc_auc"] = float(roc_auc_score(yb, attack_scores))
        out["attack_vs_benign"]["pr_auc"] = float(average_precision_score(yb, attack_scores))
    return out


def latency_ms(predict_one: Callable[[Any], Any], samples: Sequence[Any], repeats: int = 1) -> dict[str, float]:
    """Wall-clock latency of single-record inference (feature extraction included)."""
    timings = []
    for _ in range(repeats):
        for sample in samples:
            t0 = time.perf_counter()
            predict_one(sample)
            timings.append((time.perf_counter() - t0) * 1000)
    arr = np.asarray(timings)
    return {"n": int(len(arr)), "mean_ms": float(arr.mean()), "p50_ms": float(np.percentile(arr, 50)),
            "p95_ms": float(np.percentile(arr, 95)), "p99_ms": float(np.percentile(arr, 99))}
