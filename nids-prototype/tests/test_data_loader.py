"""Tests for loading, column cleaning and label mapping."""

import pandas as pd
import pytest

from src.data_loader import (ATTACK_COL, TARGET_COL, DatasetNotFoundError, add_binary_label,
                             clean_column_names, find_csv_files, load_dataset, stratified_sample)


def test_column_names_are_stripped():
    df = pd.DataFrame({" Flow Duration": [1], " Label ": ["BENIGN"], "Flow Bytes/s": [2.0]})
    assert list(clean_column_names(df).columns) == ["Flow Duration", "Label", "Flow Bytes/s"]


def test_label_mapping_benign_is_0_and_every_attack_is_1():
    df = pd.DataFrame({"Label": ["BENIGN", "DoS Hulk", "PortScan", " BENIGN ", "benign",
                                 "Web Attack – Brute Force", "Heartbleed"]})
    out = add_binary_label(df)
    assert out[TARGET_COL].tolist() == [0, 1, 1, 0, 0, 1, 1]
    # The original attack name is kept (cleaned) for per-attack analysis
    assert out[ATTACK_COL].tolist()[:3] == ["BENIGN", "DoS Hulk", "PortScan"]
    assert out[ATTACK_COL].iloc[5] == "Web Attack - Brute Force"
    assert "Label" not in out.columns


def test_missing_label_column_raises():
    with pytest.raises(KeyError):
        add_binary_label(pd.DataFrame({"x": [1]}))


def test_empty_raw_folder_gives_helpful_error(tmp_path):
    with pytest.raises(DatasetNotFoundError, match="ids-2017"):
        find_csv_files(tmp_path)


def test_stratified_sample_keeps_every_attack_type(loaded_flows):
    sample = stratified_sample(loaded_flows, 0.1, seed=0)
    assert set(sample[ATTACK_COL]) == set(loaded_flows[ATTACK_COL])
    assert len(sample) < len(loaded_flows)


def test_load_dataset_merges_files_and_drops_empty_rows(tmp_path, raw_flows):
    raw_flows.iloc[:100].to_csv(tmp_path / "day1.csv", index=False)
    second = pd.concat([raw_flows.iloc[100:], pd.DataFrame([[None] * raw_flows.shape[1]],
                                                           columns=raw_flows.columns)])
    second.to_csv(tmp_path / "day2.csv", index=False)

    df, info = load_dataset(tmp_path)
    assert len(df) == len(raw_flows)
    assert info["rows_without_label"] == 1
    assert info["is_synthetic"] is False
    assert "Flow Duration" in df.columns  # names stripped
