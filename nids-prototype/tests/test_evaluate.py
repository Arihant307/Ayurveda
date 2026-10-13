"""Tests for metric calculations."""

import numpy as np
import pytest

from src.evaluate import compute_metrics, per_attack_recall


def test_metrics_match_hand_calculation():
    y_true = np.array([0, 0, 0, 0, 1, 1, 1, 1])
    y_prob = np.array([0.1, 0.2, 0.7, 0.3, 0.9, 0.8, 0.4, 0.6])  # 1 FP, 1 FN
    m = compute_metrics(y_true, y_prob, threshold=0.5)
    assert m["confusion_matrix"] == {"tn": 3, "fp": 1, "fn": 1, "tp": 3}
    assert m["accuracy"] == pytest.approx(6 / 8)
    assert m["precision"] == pytest.approx(3 / 4)
    assert m["recall"] == pytest.approx(3 / 4)
    assert m["false_positive_rate"] == pytest.approx(1 / 4)
    assert 0 <= m["roc_auc"] <= 1


def test_per_attack_recall_ignores_benign():
    attacks = np.array(["BENIGN", "DDoS", "DDoS", "Bot", "Bot"])
    y_true = np.array([0, 1, 1, 1, 1])
    preds = {"mlp": np.array([1, 1, 0, 1, 1])}
    table = per_attack_recall(attacks, y_true, preds).set_index("attack_label")
    assert set(table.index) == {"DDoS", "Bot"}
    assert table.loc["DDoS", "recall_mlp"] == 0.5
    assert table.loc["Bot", "missed_by_mlp"] == 0


def test_per_attack_recall_with_no_attacks_is_empty():
    table = per_attack_recall(np.array(["BENIGN"] * 3), np.zeros(3), {"mlp": np.zeros(3)})
    assert table.empty
