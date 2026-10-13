"""Tests that predict.py returns one prediction per input flow."""

import joblib
import numpy as np
import pytest

from src.models import build_logistic_regression, build_mlp, save_model
from src.predict import load_artifacts, predict_flows
from src.preprocess import run_preprocessing
from src.utils import save_json

from tests.conftest import make_raw_flows


def _save_artifacts(result, models_dir):
    joblib.dump(result.scaler, models_dir / "scaler.joblib")
    save_json(result.feature_names, models_dir / "feature_list.json")
    save_json(result.fill_values, models_dir / "fill_values.json")


@pytest.fixture
def trained_dir(tmp_path, loaded_flows, config):
    result = run_preprocessing(loaded_flows, config)
    _save_artifacts(result, tmp_path)
    lr = build_logistic_regression(config["models"]["logistic_regression"], result.class_weights)
    save_model(lr.fit(result.X_train, result.y_train), "logistic_regression", tmp_path)
    return tmp_path, result


def _new_flows():
    """Unseen flows with shuffled columns, an inf value and a missing value."""
    new = make_raw_flows(n=37, seed=99)
    new = new[new.columns[::-1]].copy()
    new.iloc[0, new.columns.get_loc("Flow Bytes/s")] = np.inf
    new.iloc[1, new.columns.get_loc(" Flow Duration")] = np.nan
    return new


def test_prediction_output_shape(trained_dir):
    models_dir, _ = trained_dir
    artifacts = load_artifacts(models_dir, "logistic_regression")
    new = _new_flows()
    out = predict_flows(new, artifacts)
    assert out.shape == (len(new), 5)  # 4 prediction columns + true_label (input has Label)
    assert list(out.columns[:4]) == ["flow_index", "prediction", "predicted_label", "malicious_probability"]
    assert out["malicious_probability"].between(0, 1).all()
    assert set(out["prediction"]) <= {"Normal", "Malicious"}


def test_prediction_without_label_column(trained_dir):
    models_dir, _ = trained_dir
    new = _new_flows().drop(columns=[" Label"])
    out = predict_flows(new, load_artifacts(models_dir, "logistic_regression"))
    assert out.shape == (len(new), 4)


def test_missing_feature_column_raises(trained_dir):
    models_dir, _ = trained_dir
    new = _new_flows().drop(columns=[" Flow Duration"])
    with pytest.raises(ValueError, match="missing"):
        predict_flows(new, load_artifacts(models_dir, "logistic_regression"))


def test_mlp_prediction_output_shape(trained_dir):
    models_dir, result = trained_dir
    mlp = build_mlp(len(result.feature_names), hidden_units=[8], dropout=0.0)
    mlp.fit(result.X_train, result.y_train, epochs=1, verbose=0)
    save_model(mlp, "mlp", models_dir)
    new = _new_flows()
    out = predict_flows(new, load_artifacts(models_dir, "mlp"))
    assert len(out) == len(new)
    assert out["malicious_probability"].between(0, 1).all()
