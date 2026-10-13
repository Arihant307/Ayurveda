"""Feature analysis and selection.

* ``find_constant_columns``      - features with a single value carry no information
* ``find_correlated_features``   - drop one feature from each highly correlated pair
* ``plot_correlation_heatmap``   - visualise feature correlations (training set)
* ``plot_feature_importance``    - Random Forest importances after training
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")  # render to files, no display needed
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from src.utils import stamp_figure

logger = logging.getLogger(__name__)


def find_constant_columns(df: pd.DataFrame, columns: list[str]) -> list[str]:
    """Return the columns that contain only one distinct (non-missing) value."""
    nunique = df[columns].nunique(dropna=True)
    return nunique[nunique <= 1].index.tolist()


def correlation_matrix(X: pd.DataFrame, max_rows: int = 300_000, seed: int = 42) -> pd.DataFrame:
    """Absolute Pearson correlation between features.

    Uses NumPy (fast matrix maths) instead of ``DataFrame.corr``. For very
    large inputs a fixed random subset of ``max_rows`` rows is used, which
    estimates correlations almost exactly while saving a lot of memory.
    Pairs that involve a column with zero variance give NaN, treated as 0.
    """
    if len(X) > max_rows:
        X = X.sample(n=max_rows, random_state=seed)
    with np.errstate(divide="ignore", invalid="ignore"):
        corr = np.corrcoef(X.to_numpy(dtype=np.float64), rowvar=False)
    corr = np.nan_to_num(np.abs(corr), nan=0.0)
    return pd.DataFrame(corr, index=X.columns, columns=X.columns)


def find_correlated_features(X_train: pd.DataFrame, threshold: float = 0.95
                             ) -> tuple[list[str], list[tuple[str, str, float]]]:
    """Pick one feature from every pair with ``|corr| > threshold`` to drop.

    Walks through the features in their original order and drops a feature if
    it is highly correlated with an earlier feature that is being kept. Must be
    called on the TRAINING set only so the test set does not influence the
    choice.

    Returns:
        (columns_to_drop, pairs) where pairs are (kept, dropped, |corr|).
    """
    corr = correlation_matrix(X_train)
    cols = list(X_train.columns)
    to_drop: list[str] = []
    pairs: list[tuple[str, str, float]] = []
    for j, col in enumerate(cols):
        for i in range(j):
            kept = cols[i]
            if kept in to_drop:
                continue
            if corr.iat[i, j] > threshold:
                to_drop.append(col)
                pairs.append((kept, col, round(float(corr.iat[i, j]), 4)))
                break
    return to_drop, pairs


def plot_correlation_heatmap(X_train: pd.DataFrame, path: str | Path,
                             is_synthetic: bool = False) -> None:
    """Save a heatmap of absolute feature correlations on the training set."""
    corr = correlation_matrix(X_train)
    size = max(8, 0.22 * len(corr))
    fig, ax = plt.subplots(figsize=(size, size * 0.85))
    sns.heatmap(corr, cmap="viridis", vmin=0, vmax=1, square=True, ax=ax,
                xticklabels=True, yticklabels=True, cbar_kws={"label": "|Pearson correlation|"})
    ax.tick_params(labelsize=6)
    ax.set_title("Feature correlation (training set, before correlation filter)")
    stamp_figure(fig, is_synthetic)
    fig.tight_layout(rect=(0, 0.04, 1, 1))  # leave room for the SYNTHETIC stamp
    fig.savefig(path, dpi=130)
    plt.close(fig)
    logger.info("Saved correlation heatmap -> %s", path)


def plot_feature_importance(model: Any, feature_names: list[str], path: str | Path,
                            top_n: int = 20, is_synthetic: bool = False) -> pd.DataFrame:
    """Save a bar chart of the ``top_n`` most important Random Forest features.

    Returns the full importance table (sorted, highest first).
    """
    importance = pd.DataFrame({
        "feature": feature_names,
        "importance": model.feature_importances_,
    }).sort_values("importance", ascending=False, ignore_index=True)

    top = importance.head(top_n).iloc[::-1]  # reversed so the largest is on top
    fig, ax = plt.subplots(figsize=(8, max(4, 0.32 * len(top))))
    ax.barh(top["feature"], top["importance"], color="#3a7ca5")
    ax.set_xlabel("Mean decrease in impurity")
    ax.set_title(f"Random Forest - top {len(top)} feature importances")
    stamp_figure(fig, is_synthetic)
    fig.tight_layout(rect=(0, 0.04, 1, 1))  # leave room for the SYNTHETIC stamp
    fig.savefig(path, dpi=130)
    plt.close(fig)
    logger.info("Saved feature importance plot -> %s", path)
    return importance
