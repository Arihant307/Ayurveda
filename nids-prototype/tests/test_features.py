"""Tests for the correlation-based feature filter."""

import numpy as np
import pandas as pd

from src.features import find_correlated_features


def test_one_feature_of_a_correlated_pair_is_dropped():
    rng = np.random.default_rng(0)
    a = rng.normal(size=500)
    X = pd.DataFrame({"a": a, "a_copy": a * 2 + 1, "noise": rng.normal(size=500),
                      "const": np.ones(500)})
    drop, pairs = find_correlated_features(X, threshold=0.95)
    assert drop == ["a_copy"]
    assert pairs[0][:2] == ("a", "a_copy")
