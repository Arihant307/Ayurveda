"""Streamlit demo for the NIDS prototype.

Run from the project folder:
    streamlit run app/streamlit_app.py

Pages (choose in the sidebar):
  * Predict        - upload a CSV of flows and classify each one
  * Saved results  - metrics, comparison table, per-attack recall and plots
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import streamlit as st

# Make `src` importable when Streamlit runs this file directly.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.data_loader import read_csv_robust  # noqa: E402
from src.models import DISPLAY_NAMES, MODEL_FILES  # noqa: E402
from src.predict import load_artifacts, predict_flows  # noqa: E402
from src.utils import SYNTHETIC_BANNER, get_path, load_config, load_json  # noqa: E402

st.set_page_config(page_title="NIDS Prototype", page_icon="🛡️", layout="wide")


@st.cache_resource(show_spinner="Loading model ...")
def cached_artifacts(models_dir: str, model_name: str) -> dict:
    """Load scaler + feature list + model once and reuse them between reruns."""
    return load_artifacts(models_dir, model_name)


def synthetic_warning() -> None:
    st.error(f"⚠ {SYNTHETIC_BANNER}: these models/results come from synthetic test data, "
             "not from CIC-IDS2017.")


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
st.sidebar.title("🛡️ NIDS Prototype")
st.sidebar.caption("Deep learning-based network intrusion detection (CIC-IDS2017)")
page = st.sidebar.radio("Page", ["Predict", "Saved results"])
config_path = st.sidebar.text_input("Config file", str(PROJECT_ROOT / "config.yaml"))

try:
    cfg = load_config(config_path)
except FileNotFoundError:
    st.error(f"Config file not found: {config_path}")
    st.stop()

models_dir = get_path(cfg, "models_dir")
output_dir = get_path(cfg, "output_dir")
plots_dir = get_path(cfg, "plots_dir")
threshold = float(cfg.get("evaluation", {}).get("threshold", 0.5))

# ---------------------------------------------------------------------------
# Page 1: predictions on an uploaded CSV
# ---------------------------------------------------------------------------
if page == "Predict":
    st.title("Classify network flows")
    st.write("Upload a CSV with the same columns as the CIC-IDS2017 *MachineLearningCSV* files. "
             "Each flow is labelled **Normal** or **Malicious**.")

    available = [m for m in MODEL_FILES if (models_dir / MODEL_FILES[m]).exists()]
    if not available:
        st.warning("No trained models found. Run `python -m src.train --config config.yaml` first.")
        st.stop()
    model_name = st.selectbox("Model", available, index=available.index("mlp") if "mlp" in available else 0,
                              format_func=lambda m: DISPLAY_NAMES[m])
    uploaded = st.file_uploader("CSV file of flows", type="csv")

    if uploaded is not None:
        try:
            artifacts = cached_artifacts(str(models_dir), model_name)
            df = read_csv_robust(uploaded).dropna(how="all")
            result = predict_flows(df, artifacts, threshold)
        except (ValueError, FileNotFoundError) as e:
            st.error(str(e))
            st.stop()

        if artifacts["is_synthetic"]:
            synthetic_warning()

        counts = result["prediction"].value_counts().reindex(["Normal", "Malicious"], fill_value=0)
        c1, c2, c3 = st.columns(3)
        c1.metric("Flows", f"{len(result):,}")
        c2.metric("Normal", f"{counts['Normal']:,}")
        c3.metric("Malicious", f"{counts['Malicious']:,}")

        st.subheader("Normal vs Malicious")
        st.bar_chart(counts.rename("flows"))

        st.subheader("Predictions")
        only_bad = st.checkbox("Show only malicious flows")
        shown = result[result["prediction"] == "Malicious"] if only_bad else result
        st.dataframe(shown, hide_index=True)
        st.download_button("Download predictions as CSV", result.to_csv(index=False).encode(),
                           "predictions.csv", "text/csv")

# ---------------------------------------------------------------------------
# Page 2: saved metrics and plots
# ---------------------------------------------------------------------------
else:
    st.title("Saved evaluation results")
    metrics_path = output_dir / "metrics.json"
    if not metrics_path.exists():
        st.warning("No results yet. Run `python -m src.train` and then `python -m src.evaluate`.")
        st.stop()

    metrics = load_json(metrics_path)
    if metrics.get("is_synthetic"):
        synthetic_warning()
    t = metrics["test_set"]
    st.write(f"**Data source:** {metrics['data_source']}  ·  **Test set:** {t['total']:,} flows "
             f"({t['Normal']:,} Normal, {t['Malicious']:,} Malicious)")

    st.subheader("Model comparison (test set)")
    st.dataframe(pd.read_csv(output_dir / "model_comparison.csv"), hide_index=True)

    attack_path = output_dir / "per_attack_recall.csv"
    if attack_path.exists():
        st.subheader("Recall per attack type")
        st.dataframe(pd.read_csv(attack_path), hide_index=True)

    st.subheader("Plots")
    plots = sorted(plots_dir.glob("*.png"))
    for i in range(0, len(plots), 2):
        cols = st.columns(2)
        for col, p in zip(cols, plots[i:i + 2]):
            col.image(str(p), caption=p.stem.replace("_", " "))

    report_path = output_dir / "report.md"
    if report_path.exists():
        with st.expander("Full report (report.md)"):
            st.markdown(report_path.read_text(encoding="utf-8"))
