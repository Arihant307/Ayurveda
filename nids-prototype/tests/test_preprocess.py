"""Tests for cleaning, splitting, scaling and imbalance handling."""

import numpy as np
import pandas as pd
import pytest

from src.data_loader import ATTACK_COL, TARGET_COL
from src.preprocess import (drop_constant_columns, drop_identifier_columns, handle_invalid_values,
                            remove_duplicates, run_preprocessing, split_data)


def _small_df():
    return pd.DataFrame({
        "a": [1.0, np.inf, 3.0, np.nan, 5.0, -np.inf],
        "b": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0],
        TARGET_COL: [0, 1, 0, 1, 0, 1],
        ATTACK_COL: ["BENIGN", "DDoS", "BENIGN", "DDoS", "BENIGN", "DDoS"],
    })


def test_inf_and_nan_rows_are_dropped():
    out, stats = handle_invalid_values(_small_df(), ["a", "b"], mode="drop")
    assert len(out) == 3
    assert stats["inf_cells"] == 2
    assert stats["nan_cells_original"] == 1
    assert stats["rows_dropped"] == 3
    assert np.isfinite(out[["a", "b"]].to_numpy()).all()


def test_inf_becomes_nan_in_impute_mode():
    out, stats = handle_invalid_values(_small_df(), ["a", "b"], mode="impute")
    assert len(out) == 6  # nothing dropped yet: filled after the split with train medians
    assert out["a"].isna().sum() == 3
    assert not np.isinf(out["a"]).any()
    assert stats["rows_dropped"] == 0


def test_invalid_mode_rejected():
    with pytest.raises(ValueError):
        handle_invalid_values(_small_df(), ["a"], mode="zero")


def test_duplicates_removed():
    df = pd.concat([_small_df(), _small_df().iloc[:2]])
    out, removed = remove_duplicates(df)
    assert removed == 2 and len(out) == 6


def test_identifier_and_constant_columns_dropped():
    df = _small_df().assign(**{"Source IP": "1.2.3.4", "Timestamp": "t", "const": 7.0})
    df, dropped = drop_identifier_columns(df, ["Flow ID", "Source IP", "Timestamp"])
    assert dropped == ["Source IP", "Timestamp"]
    df, const = drop_constant_columns(df, ["a", "b", "const"])
    assert const == ["const"]


def test_split_is_stratified_70_15_15(loaded_flows):
    train, val, test = split_data(loaded_flows, seed=0)
    assert len(train) + len(val) + len(test) == len(loaded_flows)
    assert len(train) == pytest.approx(0.70 * len(loaded_flows), abs=1)
    overall = loaded_flows[TARGET_COL].mean()
    for part in (train, val, test):
        assert part[TARGET_COL].mean() == pytest.approx(overall, abs=0.05)
    # no row appears in two splits
    assert not set(train.index) & set(val.index) and not set(train.index) & set(test.index)


@pytest.mark.parametrize("kind", ["standard", "minmax"])
def test_scaler_is_fitted_on_train_only(loaded_flows, config, kind):
    config["preprocessing"]["scaler"] = kind
    result = run_preprocessing(loaded_flows, config)

    # Rebuild the unscaled training rows from the original data.
    raw_train = loaded_flows.loc[result.train_index, result.feature_names].to_numpy(dtype=float)
    raw_all = loaded_flows[result.feature_names].to_numpy(dtype=float)
    if kind == "standard":
        np.testing.assert_allclose(result.scaler.mean_, raw_train.mean(axis=0), rtol=1e-5)
        assert not np.allclose(result.scaler.mean_, raw_all.mean(axis=0))
        np.testing.assert_allclose(result.X_train.mean(axis=0), 0, atol=1e-4)
    else:
        np.testing.assert_allclose(result.scaler.data_min_, raw_train.min(axis=0))
        np.testing.assert_allclose(result.scaler.data_max_, raw_train.max(axis=0))
    assert result.scaler.n_samples_seen_ == len(result.y_train)  # exactly the training rows
    assert result.scaler.n_features_in_ == len(result.feature_names)


def test_pipeline_drops_constant_column_and_reports_counts(loaded_flows, config):
    result = run_preprocessing(loaded_flows, config)
    assert "Bwd PSH Flags" in result.report["dropped_columns"]["constant"]
    assert "Bwd PSH Flags" not in result.feature_names
    total = sum(s["rows"] for s in result.report["splits"].values())
    assert total == len(loaded_flows)
    assert result.class_weights[1] > result.class_weights[0]  # attacks are the minority here


def test_smote_only_changes_training_set(loaded_flows, config):
    config["imbalance"]["method"] = "smote"
    result = run_preprocessing(loaded_flows, config)
    assert np.bincount(result.y_train)[0] == np.bincount(result.y_train)[1]  # balanced train
    n = len(loaded_flows)
    assert len(result.y_val) + len(result.y_test) == pytest.approx(0.30 * n, abs=2)  # untouched
    assert result.class_weights is None


def test_impute_uses_train_medians(config):
    rng = np.random.default_rng(1)
    df = pd.DataFrame({"x": rng.normal(size=200), "y": rng.normal(size=200),
                       TARGET_COL: [0, 1] * 100, ATTACK_COL: ["BENIGN", "DDoS"] * 100})
    df.loc[::10, "x"] = np.inf
    config["preprocessing"]["invalid_values"] = "impute"
    result = run_preprocessing(df, config)
    assert np.isfinite(result.X_test).all()
    train_x = df.loc[result.train_index, "x"].replace(np.inf, np.nan)
    assert result.fill_values["x"] == pytest.approx(train_x.median())
