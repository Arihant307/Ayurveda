"""Predict Normal / Malicious for a new CSV of network flows.

Usage:
    python -m src.predict --config config.yaml --input new_flows.csv
    python -m src.predict --config config.yaml --input new_flows.csv --model random_forest \
        --output outputs/predictions.csv

The input CSV must contain the same feature columns as the CIC-IDS2017
MachineLearningCSV files (extra columns such as Label are ignored). The saved
scaler, feature list and training medians are re-used, so new data is
processed exactly like the training data.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from src.data_loader import clean_column_names, normalise_label_text, read_csv_robust
from src.models import MODEL_FILES, load_model, predict_proba
from src.utils import SYNTHETIC_BANNER, get_path, load_config, load_json, setup_logging

logger = logging.getLogger(__name__)


def load_artifacts(models_dir: str | Path, model_name: str = "mlp") -> dict[str, Any]:
    """Load the scaler, feature list, training medians and one trained model."""
    models_dir = Path(models_dir)
    for f in ("scaler.joblib", "feature_list.json", "fill_values.json"):
        if not (models_dir / f).exists():
            raise FileNotFoundError(f"{models_dir / f} not found - run `python -m src.train` first.")
    summary_path = models_dir / "training_summary.json"
    summary = load_json(summary_path) if summary_path.exists() else {}
    return {
        "is_synthetic": bool(summary.get("is_synthetic", False)),
        "scaler": joblib.load(models_dir / "scaler.joblib"),
        "features": load_json(models_dir / "feature_list.json"),
        "fill_values": load_json(models_dir / "fill_values.json"),
        "model": load_model(model_name, models_dir),
        "model_name": model_name,
    }


def prepare_features(df: pd.DataFrame, features: list[str], fill_values: dict[str, float],
                     scaler: Any) -> np.ndarray:
    """Turn a raw flow DataFrame into the scaled matrix the models expect.

    Same steps as training: strip column names, keep the training features in
    the same order, convert inf to NaN, fill missing values with the TRAINING
    medians and apply the TRAINING scaler.
    """
    df = clean_column_names(df)
    missing = [c for c in features if c not in df.columns]
    if missing:
        raise ValueError(f"Input is missing {len(missing)} required feature column(s): {missing[:10]}")
    X = df[features].apply(pd.to_numeric, errors="coerce").astype(np.float64)
    X = X.replace([np.inf, -np.inf], np.nan)
    n_filled = int(X.isna().sum().sum())
    if n_filled:
        logger.info("Filled %d missing/inf values with training medians", n_filled)
    X = X.fillna(fill_values)
    return scaler.transform(X.to_numpy()).astype(np.float32)


def predict_flows(df: pd.DataFrame, artifacts: dict[str, Any], threshold: float = 0.5) -> pd.DataFrame:
    """Predict every flow in ``df``.

    Returns one row per input flow with:
        flow_index, prediction ("Normal"/"Malicious"), predicted_label (0/1),
        malicious_probability, and true_label if the input has a Label column.
    """
    X = prepare_features(df, artifacts["features"], artifacts["fill_values"], artifacts["scaler"])
    prob = predict_proba(artifacts["model"], X)
    pred = (prob >= threshold).astype(int)
    out = pd.DataFrame({
        "flow_index": np.arange(len(df)),
        "prediction": np.where(pred == 1, "Malicious", "Normal"),
        "predicted_label": pred,
        "malicious_probability": np.round(prob.astype(float), 6),
    })
    cleaned = clean_column_names(df)
    if "Label" in cleaned.columns:  # handy when testing on labelled data
        out["true_label"] = normalise_label_text(cleaned["Label"]).to_numpy()
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Predict Normal/Malicious for a CSV of flows")
    parser.add_argument("--config", default="config.yaml", help="Path to config.yaml")
    parser.add_argument("--input", required=True, help="CSV file with flows to classify")
    parser.add_argument("--model", default="mlp", choices=list(MODEL_FILES), help="Which saved model to use")
    parser.add_argument("--output", default=None, help="Where to save predictions (default outputs/predictions.csv)")
    args = parser.parse_args(argv)
    setup_logging()
    cfg = load_config(args.config)

    try:
        artifacts = load_artifacts(get_path(cfg, "models_dir"), args.model)
    except FileNotFoundError as e:
        logger.error("%s", e)
        return 1

    if artifacts["is_synthetic"]:
        logger.warning("*** These models were trained on SYNTHETIC data: %s ***", SYNTHETIC_BANNER)

    df = read_csv_robust(args.input)
    df = df.dropna(how="all")  # skip completely empty lines
    threshold = float(cfg.get("evaluation", {}).get("threshold", 0.5))
    result = predict_flows(df, artifacts, threshold)

    output = Path(args.output) if args.output else get_path(cfg, "output_dir", create=True) / "predictions.csv"
    output.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(output, index=False)
    counts = result["prediction"].value_counts()
    logger.info("Predicted %d flows with %s: Normal=%d, Malicious=%d", len(result), args.model,
                counts.get("Normal", 0), counts.get("Malicious", 0))
    logger.info("Saved predictions -> %s", output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
