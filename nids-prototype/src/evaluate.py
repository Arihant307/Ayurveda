"""Evaluate all trained models on the held-out TEST set and write the report.

Usage:
    python -m src.evaluate --config config.yaml

Outputs (in outputs/):
    metrics.json, model_comparison.csv, per_attack_recall.csv, report.md
    plots/confusion_matrix_<model>.png, plots/roc_curves.png,
    plots/mlp_loss.png, plots/mlp_accuracy.png

Every number written here is computed from the saved test split and models.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Any

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score, precision_score,
                             recall_score, roc_auc_score, roc_curve)

from src.models import DISPLAY_NAMES, MODEL_FILES, load_model, predict_proba
from src.preprocess import md_table, data_report_to_markdown
from src.utils import (SYNTHETIC_BANNER, get_path, load_config, load_json, save_json, stamp_figure,
                       setup_logging)

logger = logging.getLogger(__name__)

METRIC_COLUMNS = ["accuracy", "precision", "recall", "f1", "false_positive_rate", "roc_auc"]


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def compute_metrics(y_true: np.ndarray, y_prob: np.ndarray, threshold: float = 0.5) -> dict[str, Any]:
    """All test-set metrics for one model.

    False positive rate = FP / (FP + TN): the share of normal flows that would
    raise a false alarm.
    """
    y_true = np.asarray(y_true).astype(int)
    y_pred = (np.asarray(y_prob) >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    both_classes = len(np.unique(y_true)) == 2
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "false_positive_rate": float(fp / (fp + tn)) if (fp + tn) else 0.0,
        "roc_auc": float(roc_auc_score(y_true, y_prob)) if both_classes else None,
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "threshold": threshold,
    }


def per_attack_recall(attack_labels: np.ndarray, y_true: np.ndarray,
                      preds: dict[str, np.ndarray], benign_label: str = "BENIGN") -> pd.DataFrame:
    """Recall (detection rate) for every original attack type in the test set.

    For each attack type: the share of its flows that a model flagged as
    Malicious. Benign flows are excluded (their errors are the false positive rate).
    """
    df = pd.DataFrame({"attack_label": attack_labels, "y": y_true})
    for name, p in preds.items():
        df[name] = p
    attacks = df[df["y"] == 1]
    rows = []
    for label, grp in attacks.groupby("attack_label"):
        row: dict[str, Any] = {"attack_label": label, "n_test": len(grp)}
        for name in preds:
            row[f"recall_{name}"] = float(grp[name].mean())
        row["missed_by_mlp"] = int((grp["mlp"] == 0).sum()) if "mlp" in preds else None
        rows.append(row)
    if not rows:  # no attacks in the test set (e.g. a tiny sample)
        return pd.DataFrame(columns=["attack_label", "n_test"])
    table = pd.DataFrame(rows)
    sort_col = "recall_mlp" if "mlp" in preds else table.columns[2]
    return table.sort_values([sort_col, "n_test"], ascending=[True, False], ignore_index=True)


# ---------------------------------------------------------------------------
# Plots
# ---------------------------------------------------------------------------

def plot_confusion_matrix(cm: dict[str, int], title: str, path: Path, is_synthetic: bool) -> None:
    """Confusion matrix with counts and row percentages."""
    mat = np.array([[cm["tn"], cm["fp"]], [cm["fn"], cm["tp"]]])
    row_pct = mat / np.maximum(mat.sum(axis=1, keepdims=True), 1)
    labels = np.array([[f"{mat[i, j]:,}\n({row_pct[i, j]:.2%})" for j in range(2)] for i in range(2)])
    fig, ax = plt.subplots(figsize=(5, 4.4))
    sns.heatmap(mat, annot=labels, fmt="", cmap="Blues", cbar=False, ax=ax,
                xticklabels=["Normal", "Malicious"], yticklabels=["Normal", "Malicious"])
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title(title)
    stamp_figure(fig, is_synthetic)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(path, dpi=130)
    plt.close(fig)


def plot_roc_curves(y_true: np.ndarray, probs: dict[str, np.ndarray], path: Path,
                    is_synthetic: bool) -> None:
    """All models' ROC curves on one plot."""
    fig, ax = plt.subplots(figsize=(6, 5))
    for name, p in probs.items():
        fpr, tpr, _ = roc_curve(y_true, p)
        ax.plot(fpr, tpr, label=f"{DISPLAY_NAMES[name]} (AUC = {roc_auc_score(y_true, p):.4f})")
    ax.plot([0, 1], [0, 1], "k--", lw=1, label="Random guess")
    ax.set_xlabel("False positive rate")
    ax.set_ylabel("True positive rate (recall)")
    ax.set_title("ROC curves - test set")
    ax.legend(loc="lower right")
    stamp_figure(fig, is_synthetic)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(path, dpi=130)
    plt.close(fig)


def plot_training_curves(history: dict[str, list[float]], plots_dir: Path, is_synthetic: bool) -> list[Path]:
    """MLP training vs validation loss and accuracy per epoch."""
    epochs = np.arange(1, len(history["loss"]) + 1)
    best = int(np.argmin(history["val_loss"])) + 1
    paths = []
    for metric, ylabel in (("loss", "Binary cross-entropy loss"), ("accuracy", "Accuracy")):
        fig, ax = plt.subplots(figsize=(6, 4))
        ax.plot(epochs, history[metric], marker="o", ms=3, label="Training")
        ax.plot(epochs, history[f"val_{metric}"], marker="o", ms=3, label="Validation")
        ax.axvline(best, color="grey", ls=":", label=f"Best epoch ({best})")
        ax.set_xlabel("Epoch")
        ax.set_ylabel(ylabel)
        ax.set_title(f"MLP training - {metric}")
        ax.legend()
        stamp_figure(fig, is_synthetic)
        fig.tight_layout(rect=(0, 0.04, 1, 1))
        path = plots_dir / f"mlp_{metric}.png"
        fig.savefig(path, dpi=130)
        plt.close(fig)
        paths.append(path)
    return paths


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def _fmt(x: Any) -> str:
    return "n/a" if x is None else f"{x:.4f}"


def write_report(path: Path, data_report: dict[str, Any], metrics: dict[str, dict[str, Any]],
                 attack_table: pd.DataFrame, training: dict[str, Any] | None, n_test: dict[str, int]) -> None:
    """Write outputs/report.md. All sentences are generated from computed numbers."""
    synthetic = data_report.get("is_synthetic", False)
    out: list[str] = ["# NIDS prototype - results report\n"]
    if synthetic:
        out.append(f"> **⚠ {SYNTHETIC_BANNER}**\n>\n> These numbers come from a small synthetic "
                   "dataset used only to prove that the code runs end to end. "
                   "Do **not** use them in the presentation.\n")

    # --- summary in plain English ------------------------------------------
    out.append("## Summary\n")
    names = list(metrics)
    best_f1 = max(names, key=lambda n: metrics[n]["f1"])
    lowest_fpr = min(names, key=lambda n: metrics[n]["false_positive_rate"])
    out.append(f"- The test set contains **{n_test['total']:,}** flows "
               f"({n_test['Normal']:,} Normal, {n_test['Malicious']:,} Malicious), never seen during training.")
    out.append(f"- Highest F1-score: **{DISPLAY_NAMES[best_f1]}** (F1 = {metrics[best_f1]['f1']:.4f}).")
    out.append(f"- Lowest false positive rate: **{DISPLAY_NAMES[lowest_fpr]}** "
               f"(FPR = {metrics[lowest_fpr]['false_positive_rate']:.4f}).")
    if "mlp" in metrics:
        m = metrics["mlp"]
        cm = m["confusion_matrix"]
        out.append(f"- The MLP detected {cm['tp']:,} of {cm['tp'] + cm['fn']:,} malicious flows "
                   f"(recall = {m['recall']:.4f}), missed {cm['fn']:,}, and raised {cm['fp']:,} "
                   f"false alarms on {cm['tn'] + cm['fp']:,} normal flows.")
        baselines = [n for n in names if n != "mlp"]
        if baselines:
            best_base = max(baselines, key=lambda n: metrics[n]["f1"])
            diff = m["f1"] - metrics[best_base]["f1"]
            word = "higher" if diff > 0 else "lower" if diff < 0 else "equal to"
            out.append(f"- MLP F1 is {abs(diff):.4f} {word}{' than' if diff else ''} the best baseline "
                       f"({DISPLAY_NAMES[best_base]}, F1 = {metrics[best_base]['f1']:.4f}).")
        if not attack_table.empty:
            weak = attack_table[attack_table["recall_mlp"] < 0.90]
            if weak.empty:
                out.append("- Every attack type in the test set had MLP recall of at least 0.90.")
            else:
                items = ", ".join(f"{r.attack_label} ({r.recall_mlp:.2%} of {r.n_test})"
                                  for r in weak.itertuples())
                out.append(f"- Attack types with MLP recall below 0.90: {items}.")
            tiny = attack_table[attack_table["n_test"] < 10]["attack_label"].tolist()
            if tiny:
                out.append(f"- Fewer than 10 test flows (treat their recall with caution): {', '.join(tiny)}.")

    # --- metrics table -----------------------------------------------------
    out.append("\n## Model comparison (test set)\n")
    rows = [[DISPLAY_NAMES[n]] + [_fmt(metrics[n][c]) for c in METRIC_COLUMNS] for n in names]
    out.append(md_table(rows, ["Model", "Accuracy", "Precision", "Recall", "F1",
                                "False positive rate", "ROC-AUC"]))
    out.append("\n### Confusion matrices\n")
    cm_rows = [[DISPLAY_NAMES[n]] + [f"{metrics[n]['confusion_matrix'][k]:,}" for k in ("tn", "fp", "fn", "tp")]
               for n in names]
    out.append(md_table(cm_rows, ["Model", "TN", "FP", "FN", "TP"]))

    # --- per attack ----------------------------------------------------------
    if not attack_table.empty:
        out.append("\n## Recall per attack type (test set)\n")
        out.append("Share of each attack type's flows that were flagged as Malicious "
                   "(sorted from worst to best for the MLP).\n")
        rec_cols = [c for c in attack_table.columns if c.startswith("recall_")]
        rows = [[r["attack_label"], f"{r['n_test']:,}"] + [f"{r[c]:.4f}" for c in rec_cols]
                + [f"{r['missed_by_mlp']:,}" if pd.notna(r.get("missed_by_mlp")) else "n/a"]
                for _, r in attack_table.iterrows()]
        out.append(md_table(rows, ["Attack", "Test flows"]
                             + [DISPLAY_NAMES[c.removeprefix("recall_")] for c in rec_cols]
                             + ["Missed by MLP"]))

    # --- training ------------------------------------------------------------
    if training:
        out.append("\n## Training\n")
        for n, t in training.get("models", {}).items():
            line = f"- {DISPLAY_NAMES[n]}: trained in {t['train_seconds']} s"
            if n == "mlp":
                line += (f", {t['epochs_run']} epochs run, best epoch {t['best_epoch']} "
                         f"(val loss {t['best_val_loss']}); early stopping restored the best weights")
            out.append(line)
        out.append(f"- Training rows: {training['n_train_rows']:,}; features: {training['n_features']}; "
                   f"imbalance handling: {training['imbalance_method']}; sample fraction: {training['sample_frac']}")

    # --- data report -----------------------------------------------------------
    out.append("\n## Data report\n")
    out.append(data_report_to_markdown(data_report))

    out.append("\n## Plots\n")
    plot_list = ["roc_curves.png", "mlp_loss.png", "mlp_accuracy.png", "feature_importance_rf.png",
                 "correlation_heatmap.png"] + [f"confusion_matrix_{n}.png" for n in names]
    out += [f"- [{p}](plots/{p})" for p in plot_list]
    path.write_text("\n".join(out) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Evaluate trained models on the test set")
    parser.add_argument("--config", default="config.yaml", help="Path to config.yaml")
    args = parser.parse_args(argv)
    setup_logging()
    cfg = load_config(args.config)

    models_dir = get_path(cfg, "models_dir")
    output_dir = get_path(cfg, "output_dir", create=True)
    plots_dir = get_path(cfg, "plots_dir", create=True)
    splits_path = get_path(cfg, "processed_dir") / "splits.joblib"
    if not splits_path.exists():
        logger.error("%s not found - run `python -m src.train --config %s` first.", splits_path, args.config)
        return 1

    splits = joblib.load(splits_path)
    X_test, y_test, attack_test = splits["X_test"], splits["y_test"], splits["attack_test"]
    data_report = load_json(output_dir / "data_report.json")
    synthetic = bool(data_report.get("is_synthetic", False))
    threshold = float(cfg.get("evaluation", {}).get("threshold", 0.5))
    if synthetic:
        logger.warning("*** Evaluating models trained on SYNTHETIC data: %s ***", SYNTHETIC_BANNER)
    logger.info("Evaluating on %d test rows (threshold = %.2f)", len(y_test), threshold)

    metrics: dict[str, dict[str, Any]] = {}
    probs: dict[str, np.ndarray] = {}
    preds: dict[str, np.ndarray] = {}
    for name in MODEL_FILES:
        if not (models_dir / MODEL_FILES[name]).exists():
            logger.warning("Skipping %s: model file not found", name)
            continue
        model = load_model(name, models_dir)
        probs[name] = predict_proba(model, X_test)
        preds[name] = (probs[name] >= threshold).astype(int)
        metrics[name] = compute_metrics(y_test, probs[name], threshold)
        plot_confusion_matrix(metrics[name]["confusion_matrix"], f"{DISPLAY_NAMES[name]} - test set",
                              plots_dir / f"confusion_matrix_{name}.png", synthetic)
        m = metrics[name]
        logger.info("%-20s acc=%.4f prec=%.4f rec=%.4f f1=%.4f fpr=%.4f auc=%s", DISPLAY_NAMES[name],
                    m["accuracy"], m["precision"], m["recall"], m["f1"], m["false_positive_rate"],
                    _fmt(m["roc_auc"]))
    if not metrics:
        logger.error("No trained models found in %s", models_dir)
        return 1

    if len(np.unique(y_test)) == 2:
        plot_roc_curves(y_test, probs, plots_dir / "roc_curves.png", synthetic)
    history_path = models_dir / "mlp_history.json"
    if history_path.exists():
        plot_training_curves(load_json(history_path), plots_dir, synthetic)

    attack_table = per_attack_recall(attack_test, y_test, preds)
    attack_table.to_csv(output_dir / "per_attack_recall.csv", index=False)

    comparison = pd.DataFrame([{"model": DISPLAY_NAMES[n], **{c: metrics[n][c] for c in METRIC_COLUMNS},
                                **metrics[n]["confusion_matrix"]} for n in metrics])
    comparison.to_csv(output_dir / "model_comparison.csv", index=False)

    n_test = {"total": int(len(y_test)), "Normal": int((y_test == 0).sum()), "Malicious": int((y_test == 1).sum())}
    save_json({"data_source": data_report["data_source"], "is_synthetic": synthetic,
               "test_set": n_test, "models": metrics}, output_dir / "metrics.json")

    summary_path = models_dir / "training_summary.json"
    training = load_json(summary_path) if summary_path.exists() else None
    write_report(output_dir / "report.md", data_report, metrics, attack_table, training, n_test)
    logger.info("Saved metrics.json, model_comparison.csv, per_attack_recall.csv and report.md to %s",
                output_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
