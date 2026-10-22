"""Model loading, integrity checks and reproducibility of the reported metrics on held-out data."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from conftest import ARTIFACTS, ROOT, requires_models
from ml.evaluation.metrics import binary_report, choose_threshold
from ml.training import artifacts

PROCESSED = ROOT / "ml" / "data" / "processed"
REPORTS = ROOT / "ml" / "reports"


def test_choose_threshold_respects_fpr_budget():
    rng = np.random.default_rng(0)
    y = np.r_[np.zeros(1000), np.ones(200)].astype(int)
    s = np.r_[rng.uniform(0, 0.8, 1000), rng.uniform(0.3, 1, 200)]
    t = choose_threshold(y, s, 0.01)
    r = binary_report(y, s, t)
    assert r["false_positive_rate"] <= 0.01 and r["recall"] > 0.2


def test_binary_report_counts():
    r = binary_report([0, 0, 1, 1], [0.1, 0.9, 0.8, 0.2], 0.5)
    assert r["confusion_matrix"]["matrix"] == [[1, 1], [1, 1]] and r["false_positive_rate"] == 0.5


@requires_models
def test_checksum_mismatch_is_refused(tmp_path: Path):
    src = ARTIFACTS / "url_classifier"
    version = (src / "LATEST").read_text().strip()
    dst = tmp_path / "url_classifier"
    shutil.copytree(src / version, dst / version)
    (dst / "LATEST").write_text(version)
    with open(dst / version / "model.joblib", "ab") as f:
        f.write(b"tampered")
    with pytest.raises(ValueError, match="Checksum mismatch"):
        artifacts.load("url_classifier", root=tmp_path)


@requires_models
@pytest.mark.parametrize("name", ["email_classifier", "url_classifier", "network_cic", "network_portable"])
def test_artifact_metadata_and_report(name: str):
    model, meta = artifacts.load(name)
    assert meta["version"] and meta["datasets"] and meta["metrics"]
    report = json.loads((REPORTS / f"{name}.json").read_text())
    assert report["metadata"]["version"] == meta["version"], "report must belong to the active artifact"


@requires_models
def test_url_model_inference():
    model, meta = artifacts.load("url_classifier")
    p = model.predict_proba(["paypal.com.secure-account-verify.top/webscr/login.php", "en.wikipedia.org/wiki/Nurse"])
    assert 0 <= p[1] < meta["threshold"] <= p[0] <= 1


@requires_models
def test_email_model_inference():
    bundle, meta = artifacts.load("email_classifier")
    p = bundle["pipeline"].predict_proba([
        "urgent verify your account password now or it will be suspended click here",
        "minutes from the ward 4 staff meeting are attached , see you thursday",
    ])[:, 1]
    assert p[0] >= meta["threshold"] > p[1]


@requires_models
@pytest.mark.skipif(not (PROCESSED / "cic2018_test.parquet").exists(), reason="processed CIC-IDS2018 split missing")
def test_network_report_reproducible_on_held_out_flows():
    """Re-score the held-out test flows and compare with the stored report (no hand-entered numbers)."""
    from ml.preprocessing.flow_features import CIC_FEATURES
    from ml.evaluation.metrics import multiclass_report

    model, meta = artifacts.load("network_cic")
    test = pd.read_parquet(PROCESSED / "cic2018_test.parquet")
    proba = model.estimator.predict_proba(test[CIC_FEATURES].to_numpy(np.float32))
    labels, p_attack = model.decide(proba)
    rep = multiclass_report(test["category"].tolist(), labels, model.classes, attack_scores=p_attack)
    assert rep["macro_f1"] == pytest.approx(meta["metrics"]["test"]["macro_f1"], abs=1e-9)
    assert rep["attack_vs_benign"]["false_positive_rate"] == pytest.approx(
        meta["metrics"]["test"]["attack_vs_benign"]["false_positive_rate"], abs=1e-9)


@requires_models
@pytest.mark.skipif(not (ROOT / "ml/data/raw/enron_spam/enron_spam_data.zip").exists(), reason="Enron-Spam missing")
def test_email_report_reproducible_on_held_out_mailboxes():
    from ml.preprocessing.email_features import normalize_text
    from ml.training.train_email import load_enron

    bundle, meta = artifacts.load("email_classifier")
    df = load_enron()
    df["norm"] = df["text"].map(normalize_text)
    df = df.drop_duplicates("norm")
    df = df[~df.duplicated("norm", keep=False)]
    test = df[df["source"].isin(["enron5", "enron6"])]
    scores = bundle["pipeline"].predict_proba(test["text"])[:, 1]
    rep = binary_report(test["y"], scores, meta["threshold"])
    assert rep["n"] == meta["rows"]["test"]
    assert rep["f1"] == pytest.approx(meta["metrics"]["test"]["f1"], abs=1e-9)
