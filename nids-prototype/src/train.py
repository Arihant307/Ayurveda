"""Train the two baselines and the MLP, then save everything to outputs/models/.

Usage:
    python -m src.train --config config.yaml --sample-frac 0.1
    python -m src.train --config config.yaml              # full dataset
    python -m src.train --config config.yaml --smote      # SMOTE instead of class weights

This script runs the full preprocessing pipeline first (so one command takes
you from raw CSVs to trained models), saves the scaler / feature list / test
split, and then trains:
    1. Logistic Regression  (baseline)
    2. Random Forest        (baseline)
    3. Keras MLP            (main model, early stopping on validation loss)
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import datetime
from typing import Any

import numpy as np

from src.data_loader import DatasetNotFoundError
from src.features import plot_feature_importance
from src.models import (DISPLAY_NAMES, build_logistic_regression, build_mlp, build_random_forest,
                        save_model)
from src.preprocess import (PreprocessResult, add_common_args, apply_cli_overrides,
                            load_and_preprocess, save_artifacts)
from src.utils import get_path, load_config, save_json, set_seed, setup_logging

logger = logging.getLogger(__name__)


def train_baselines(data: PreprocessResult, cfg: dict[str, Any]) -> dict[str, tuple[Any, float]]:
    """Fit Logistic Regression and Random Forest. Returns name -> (model, seconds)."""
    seed = int(cfg.get("seed", 42))
    params = cfg["models"]
    builders = {
        "logistic_regression": build_logistic_regression(params["logistic_regression"],
                                                         data.class_weights, seed),
        "random_forest": build_random_forest(params["random_forest"], data.class_weights, seed),
    }
    trained: dict[str, tuple[Any, float]] = {}
    for name, model in builders.items():
        logger.info("Training %s on %d rows ...", DISPLAY_NAMES[name], len(data.y_train))
        start = time.perf_counter()
        model.fit(data.X_train, data.y_train)
        seconds = time.perf_counter() - start
        logger.info("  done in %.1f s", seconds)
        trained[name] = (model, seconds)
    return trained


def train_mlp(data: PreprocessResult, cfg: dict[str, Any]) -> tuple[Any, dict[str, list[float]], float]:
    """Build and fit the Keras MLP with early stopping on validation loss.

    Returns:
        (model, history dict, training seconds)
    """
    from tensorflow import keras

    p = cfg["models"]["mlp"]
    model = build_mlp(data.X_train.shape[1], p.get("hidden_units", [128, 64]), p.get("dropout", 0.3),
                      p.get("activation", "relu"), p.get("learning_rate", 1e-3))
    model.summary(print_fn=logger.info)

    early_stop = keras.callbacks.EarlyStopping(
        monitor="val_loss",
        patience=int(p.get("early_stopping_patience", 5)),
        restore_best_weights=True,  # keep the weights from the best validation epoch
        verbose=1,
    )
    logger.info("Training MLP (max %s epochs, batch size %s) ...", p.get("epochs"), p.get("batch_size"))
    start = time.perf_counter()
    history = model.fit(
        data.X_train, data.y_train.astype(np.float32),
        validation_data=(data.X_val, data.y_val.astype(np.float32)),
        epochs=int(p.get("epochs", 50)),
        batch_size=int(p.get("batch_size", 256)),
        class_weight=data.class_weights,  # None when SMOTE / no balancing is used
        callbacks=[early_stop],
        shuffle=True,
        verbose=2,
    )
    seconds = time.perf_counter() - start
    hist = {k: [float(v) for v in vals] for k, vals in history.history.items()}
    logger.info("MLP trained for %d epochs in %.1f s", len(hist["loss"]), seconds)
    return model, hist, seconds


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Train baselines and the MLP for intrusion detection")
    add_common_args(parser)
    args = parser.parse_args(argv)

    setup_logging()
    cfg = apply_cli_overrides(load_config(args.config), args)
    seed = int(cfg.get("seed", 42))
    set_seed(seed, tensorflow=True)

    # ---- data -------------------------------------------------------------
    try:
        data = load_and_preprocess(cfg)
    except DatasetNotFoundError as e:
        logger.error("%s", e)
        return 1
    save_artifacts(data, cfg)
    is_synthetic = data.report["is_synthetic"]

    models_dir = get_path(cfg, "models_dir", create=True)
    plots_dir = get_path(cfg, "plots_dir", create=True)
    output_dir = get_path(cfg, "output_dir", create=True)

    # ---- baselines --------------------------------------------------------
    summary: dict[str, Any] = {"models": {}}
    for name, (model, seconds) in train_baselines(data, cfg).items():
        save_model(model, name, models_dir)
        summary["models"][name] = {"train_seconds": round(seconds, 2)}
        if name == "random_forest":
            importance = plot_feature_importance(model, data.feature_names,
                                                 plots_dir / "feature_importance_rf.png",
                                                 is_synthetic=is_synthetic)
            importance.to_csv(output_dir / "feature_importance_rf.csv", index=False)

    # ---- MLP --------------------------------------------------------------
    mlp, history, seconds = train_mlp(data, cfg)
    save_model(mlp, "mlp", models_dir)
    save_json(history, models_dir / "mlp_history.json")
    best_epoch = int(np.argmin(history["val_loss"])) + 1
    summary["models"]["mlp"] = {
        "train_seconds": round(seconds, 2),
        "epochs_run": len(history["loss"]),
        "best_epoch": best_epoch,
        "best_val_loss": round(min(history["val_loss"]), 6),
    }

    summary.update({
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "data_source": data.report["data_source"],
        "is_synthetic": is_synthetic,
        "sample_frac": cfg["data"].get("sample_frac", 1.0),
        "imbalance_method": data.report["imbalance_method"],
        "class_weights": data.report["class_weights"],
        "n_train_rows": int(len(data.y_train)),
        "n_features": len(data.feature_names),
        "seed": seed,
    })
    save_json(summary, models_dir / "training_summary.json")
    logger.info("All models saved to %s. Next: python -m src.evaluate --config %s",
                models_dir, args.config)
    return 0


if __name__ == "__main__":
    sys.exit(main())
