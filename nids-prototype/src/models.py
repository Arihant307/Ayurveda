"""Model definitions: the Keras MLP and two scikit-learn baselines.

Also contains small helpers to save, load and get probabilities from any of
the three models in the same way.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression

logger = logging.getLogger(__name__)

# Internal name -> name shown in tables and plots.
DISPLAY_NAMES = {
    "logistic_regression": "Logistic Regression",
    "random_forest": "Random Forest",
    "mlp": "MLP (Keras)",
}
# Internal name -> file name inside outputs/models/.
MODEL_FILES = {
    "logistic_regression": "logistic_regression.joblib",
    "random_forest": "random_forest.joblib",
    "mlp": "mlp.keras",
}


def build_logistic_regression(params: dict[str, Any], class_weight: dict[int, float] | None,
                              seed: int = 42) -> LogisticRegression:
    """Baseline 1: a linear model. Shows how far a simple decision boundary gets."""
    return LogisticRegression(
        C=float(params.get("C", 1.0)),
        max_iter=int(params.get("max_iter", 1000)),
        class_weight=class_weight,
        random_state=seed,
    )


def build_random_forest(params: dict[str, Any], class_weight: dict[int, float] | None,
                        seed: int = 42) -> RandomForestClassifier:
    """Baseline 2: an ensemble of decision trees, a strong classic for tabular data."""
    return RandomForestClassifier(
        n_estimators=int(params.get("n_estimators", 100)),
        max_depth=params.get("max_depth"),
        min_samples_leaf=int(params.get("min_samples_leaf", 1)),
        n_jobs=int(params.get("n_jobs", -1)),
        class_weight=class_weight,
        random_state=seed,
    )


def build_mlp(input_dim: int, hidden_units: list[int] | tuple[int, ...] = (128, 64),
              dropout: float = 0.3, activation: str = "relu", learning_rate: float = 1e-3) -> Any:
    """Main model: a fully connected neural network (multi-layer perceptron).

    Default architecture:
        Input -> Dense(128, ReLU) -> Dropout(0.3) -> Dense(64, ReLU) -> Dropout(0.3)
              -> Dense(1, sigmoid)

    The single sigmoid output is the probability that a flow is malicious.
    """
    from tensorflow import keras  # imported lazily: TensorFlow is slow to load

    model = keras.Sequential(name="nids_mlp")
    model.add(keras.Input(shape=(input_dim,), name="flow_features"))
    for i, units in enumerate(hidden_units, start=1):
        model.add(keras.layers.Dense(int(units), activation=activation, name=f"dense_{i}"))
        if dropout > 0:
            model.add(keras.layers.Dropout(float(dropout), name=f"dropout_{i}"))
    model.add(keras.layers.Dense(1, activation="sigmoid", name="malicious_probability"))

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=float(learning_rate)),
        loss="binary_crossentropy",
        metrics=["accuracy", keras.metrics.AUC(name="auc")],
    )
    return model


def save_model(model: Any, name: str, models_dir: str | Path) -> Path:
    """Save a model under its standard file name and return the path."""
    path = Path(models_dir) / MODEL_FILES[name]
    path.parent.mkdir(parents=True, exist_ok=True)
    if name == "mlp":
        model.save(path)
    else:
        joblib.dump(model, path, compress=3)
    logger.info("Saved %s -> %s", DISPLAY_NAMES[name], path)
    return path


def load_model(name: str, models_dir: str | Path) -> Any:
    """Load a model saved with :func:`save_model`."""
    if name not in MODEL_FILES:
        raise ValueError(f"Unknown model '{name}'. Choose from {list(MODEL_FILES)}")
    path = Path(models_dir) / MODEL_FILES[name]
    if not path.exists():
        raise FileNotFoundError(f"{path} not found - run `python -m src.train` first.")
    if name == "mlp":
        from tensorflow import keras

        return keras.models.load_model(path)
    return joblib.load(path)


def predict_proba(model: Any, X: np.ndarray) -> np.ndarray:
    """Probability of the Malicious class (1-D array) for sklearn or Keras models."""
    if hasattr(model, "predict_proba"):  # scikit-learn
        return model.predict_proba(X)[:, 1]
    return model.predict(np.asarray(X, dtype=np.float32), batch_size=4096, verbose=0).ravel()
