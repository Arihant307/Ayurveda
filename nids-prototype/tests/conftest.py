"""Shared pytest fixtures: tiny synthetic DataFrames (no real dataset needed)."""

from __future__ import annotations

import copy

import numpy as np
import pandas as pd
import pytest

from src.data_loader import ATTACK_COL, TARGET_COL

BASE_CONFIG = {
    "seed": 0,
    "data": {"label_column": "Label", "benign_label": "BENIGN", "sample_frac": 1.0},
    "preprocessing": {
        "invalid_values": "drop",
        "drop_columns": ["Flow ID", "Source IP", "Destination IP", "Timestamp", "Source Port"],
        "scaler": "standard",
        "split": {"train": 0.70, "val": 0.15, "test": 0.15},
    },
    "imbalance": {"method": "class_weight"},
    "features": {"drop_correlated": False, "correlation_threshold": 0.95},
    "models": {"logistic_regression": {"C": 1.0, "max_iter": 500}},
}


@pytest.fixture
def config() -> dict:
    """A fresh copy of a minimal config for each test."""
    return copy.deepcopy(BASE_CONFIG)


def make_raw_flows(n: int = 200, seed: int = 0) -> pd.DataFrame:
    """Tiny DataFrame in the raw CIC-IDS2017 layout (leading spaces, 'Label' column).

    Attacks have larger 'Flow Duration' and 'Fwd Packets' than benign flows so
    simple models can learn something.
    """
    rng = np.random.default_rng(seed)
    labels = rng.choice(["BENIGN", "DoS Hulk", "PortScan"], size=n, p=[0.6, 0.25, 0.15])
    attack = labels != "BENIGN"
    return pd.DataFrame({
        " Destination Port": rng.choice([80, 443, 22], size=n),
        " Flow Duration": rng.normal(100, 20, n) + attack * 80,
        " Total Fwd Packets": rng.poisson(5, n) + attack * 10,
        "Flow Bytes/s": rng.normal(1000, 200, n),
        " Bwd PSH Flags": np.zeros(n),  # constant column, like in the real data
        " Label": labels,
    })


@pytest.fixture
def raw_flows() -> pd.DataFrame:
    return make_raw_flows()


@pytest.fixture
def loaded_flows(raw_flows: pd.DataFrame) -> pd.DataFrame:
    """Raw flows after the loader: clean names + label/attack_label columns."""
    from src.data_loader import add_binary_label, clean_column_names

    df = add_binary_label(clean_column_names(raw_flows))
    assert {TARGET_COL, ATTACK_COL} <= set(df.columns)
    return df
