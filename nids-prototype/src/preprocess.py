"""Cleaning, splitting, scaling and class-imbalance handling.

The steps run in this order (the order matters to avoid data leakage):

  1. remove exact duplicate rows
  2. replace inf/-inf with NaN, then drop those rows (or impute later)
  3. drop identifier-like / leakage-prone columns
  4. drop constant (zero-variance) features
  5. stratified 70/15/15 train/validation/test split
  6. (impute mode) fill NaN with TRAIN medians
  7. (optional) drop highly correlated features - decided on TRAIN only
  8. fit the scaler on TRAIN only, transform validation and test
  9. class weights from TRAIN, or SMOTE applied to TRAIN only

Everything learned from data (medians, correlated columns, scaler, class
weights, SMOTE samples) uses the training split only, so the validation and
test sets stay truly unseen.

Run on its own to inspect the data report:
    python -m src.preprocess --config config.yaml --sample-frac 0.1
"""

from __future__ import annotations

import argparse
import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.utils.class_weight import compute_class_weight

from src.data_loader import ATTACK_COL, TARGET_COL, DatasetNotFoundError, load_dataset
from src.features import find_constant_columns, find_correlated_features, plot_correlation_heatmap
from src.utils import (SYNTHETIC_BANNER, get_path, load_config, save_json, set_seed,
                       setup_logging)

logger = logging.getLogger(__name__)

CLASS_NAMES = {0: "Normal", 1: "Malicious"}


@dataclass
class PreprocessResult:
    """Everything the training and evaluation stages need."""

    X_train: np.ndarray
    y_train: np.ndarray
    X_val: np.ndarray
    y_val: np.ndarray
    X_test: np.ndarray
    y_test: np.ndarray
    attack_val: np.ndarray
    attack_test: np.ndarray
    feature_names: list[str]
    scaler: Any
    fill_values: dict[str, float]          # train medians, reused by predict.py
    class_weights: dict[int, float] | None
    train_index: np.ndarray                # row ids of the training split (before SMOTE)
    report: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Individual steps (small functions so they can be unit-tested)
# ---------------------------------------------------------------------------

def feature_columns(df: pd.DataFrame, exclude: list[str] | None = None) -> list[str]:
    """All columns except the two label columns (and any in ``exclude``)."""
    skip = {TARGET_COL, ATTACK_COL, *(exclude or [])}
    return [c for c in df.columns if c not in skip]


def class_distribution(y: pd.Series | np.ndarray) -> dict[str, int]:
    """Count Normal / Malicious rows."""
    counts = pd.Series(np.asarray(y)).value_counts()
    return {CLASS_NAMES[k]: int(counts.get(k, 0)) for k in (0, 1)}


def remove_duplicates(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Step 1 - remove rows that are exact copies of another row."""
    before = len(df)
    df = df.drop_duplicates().reset_index(drop=True)
    removed = before - len(df)
    logger.info("Step 1: removed %d duplicate rows (%d -> %d)", removed, before, len(df))
    return df, removed


def handle_invalid_values(df: pd.DataFrame, columns: list[str], mode: str = "drop"
                          ) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Step 2 - replace inf/-inf with NaN, then drop rows or leave them for imputation.

    In CIC-IDS2017, 'Flow Bytes/s' and 'Flow Packets/s' become inf/NaN when a
    flow has zero duration. Non-numeric text in a feature column is also turned
    into NaN here.

    Args:
        mode: "drop" removes affected rows now; "impute" keeps them so the
              NaNs can be filled with TRAIN medians after the split.
    """
    if mode not in ("drop", "impute"):
        raise ValueError(f"invalid_values must be 'drop' or 'impute', got {mode!r}")

    df = df.copy()
    # Turn any text in feature columns into numbers (unparseable text -> NaN).
    non_numeric = [c for c in columns if not pd.api.types.is_numeric_dtype(df[c])]
    if non_numeric:
        df[non_numeric] = df[non_numeric].apply(pd.to_numeric, errors="coerce").astype(np.float32)
    X = df[columns]
    nan_before = int(X.isna().sum().sum())
    inf_cells = int(np.isinf(X.to_numpy()).sum())
    X = X.replace([np.inf, -np.inf], np.nan)
    df[columns] = X

    bad_rows = X.isna().any(axis=1)
    per_column = X.isna().sum()
    stats: dict[str, Any] = {
        "mode": mode,
        "inf_cells": inf_cells,
        "nan_cells_original": nan_before,
        "rows_with_inf_or_nan": int(bad_rows.sum()),
        "columns_affected": {c: int(n) for c, n in per_column[per_column > 0].items()},
        "rows_dropped": 0,
    }
    if mode == "drop":
        df = df.loc[~bad_rows].reset_index(drop=True)
        stats["rows_dropped"] = int(bad_rows.sum())

    logger.info("Step 2: %d inf cells and %d NaN cells found in %d rows -> %s (%d rows dropped)",
                inf_cells, nan_before, stats["rows_with_inf_or_nan"],
                "dropped" if mode == "drop" else "kept for train-median imputation",
                stats["rows_dropped"])
    return df, stats


def drop_identifier_columns(df: pd.DataFrame, candidates: list[str]
                            ) -> tuple[pd.DataFrame, list[str]]:
    """Step 3 - drop identifier-like / leakage-prone columns if they exist.

    Why each one is removed:
      * Flow ID          - a unique id built from IPs/ports/protocol; it
                           identifies a flow but says nothing general about it.
      * Source/Dest. IP  - in CIC-IDS2017 the attacker and victim machines are
                           fixed, so a model could learn "this IP = attack" and
                           fail on any other network (shortcut learning).
      * Timestamp        - each attack happened in a specific time window; the
                           model would learn *when* the attack ran, not *what*
                           it looks like.
      * Source Port      - usually a random ephemeral port chosen by the OS,
                           i.e. noise that can still leak tool-specific habits.
    'Destination Port' is kept because it describes the targeted service
    (e.g. 80 = web, 21 = FTP), which is a legitimate signal.
    """
    present = [c for c in candidates if c in df.columns]
    df = df.drop(columns=present)
    logger.info("Step 3: dropped identifier columns: %s", present or "none present")
    return df, present


def drop_constant_columns(df: pd.DataFrame, columns: list[str]) -> tuple[pd.DataFrame, list[str]]:
    """Step 4 - drop features that have the same value in every row."""
    constant = find_constant_columns(df, columns)
    df = df.drop(columns=constant)
    logger.info("Step 4: dropped %d constant columns: %s", len(constant), constant)
    return df, constant


def split_data(df: pd.DataFrame, train: float = 0.70, val: float = 0.15, test: float = 0.15,
               seed: int = 42) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Step 5 - stratified train/validation/test split (keeps the class ratio)."""
    if not np.isclose(train + val + test, 1.0):
        raise ValueError(f"Split ratios must sum to 1, got {train + val + test}")
    train_df, rest = train_test_split(df, test_size=val + test, stratify=df[TARGET_COL],
                                      random_state=seed)
    val_df, test_df = train_test_split(rest, test_size=test / (val + test),
                                       stratify=rest[TARGET_COL], random_state=seed)
    logger.info("Step 5: split -> train=%d, val=%d, test=%d", len(train_df), len(val_df), len(test_df))
    return train_df, val_df, test_df


def train_medians(X_train: pd.DataFrame) -> dict[str, float]:
    """Median of every feature on the training set (0 if a column is all NaN)."""
    med = X_train.median(numeric_only=True).fillna(0.0)
    return {c: float(v) for c, v in med.items()}


def make_scaler(kind: str = "standard") -> StandardScaler | MinMaxScaler:
    """Create the scaler named in the config."""
    if kind == "standard":
        return StandardScaler()
    if kind == "minmax":
        return MinMaxScaler()
    raise ValueError(f"scaler must be 'standard' or 'minmax', got {kind!r}")


def fit_and_scale(X_train: np.ndarray, X_val: np.ndarray, X_test: np.ndarray, kind: str = "standard"
                  ) -> tuple[Any, np.ndarray, np.ndarray, np.ndarray]:
    """Step 8 - fit the scaler on TRAIN only, then transform all three splits."""
    scaler = make_scaler(kind).fit(X_train)
    out = [scaler.transform(X).astype(np.float32) for X in (X_train, X_val, X_test)]
    logger.info("Step 8: fitted %s on %d training rows only", type(scaler).__name__, len(X_train))
    return scaler, out[0], out[1], out[2]


def compute_class_weights(y_train: np.ndarray) -> dict[int, float]:
    """'Balanced' class weights: n_samples / (n_classes * n_samples_in_class)."""
    classes = np.unique(y_train)
    weights = compute_class_weight("balanced", classes=classes, y=y_train)
    return {int(c): float(w) for c, w in zip(classes, weights)}


def apply_smote(X_train: np.ndarray, y_train: np.ndarray, seed: int = 42
                ) -> tuple[np.ndarray, np.ndarray]:
    """Oversample the minority class of the TRAINING set with SMOTE."""
    from imblearn.over_sampling import SMOTE  # optional dependency, imported only when used

    minority = int(np.bincount(y_train).min())
    k = max(1, min(5, minority - 1))  # SMOTE needs k < number of minority samples
    X_res, y_res = SMOTE(k_neighbors=k, random_state=seed).fit_resample(X_train, y_train)
    logger.info("Step 9: SMOTE on train only: %d -> %d rows", len(y_train), len(y_res))
    return X_res.astype(np.float32), np.asarray(y_res)


# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------

def run_preprocessing(df: pd.DataFrame, cfg: dict[str, Any], load_info: dict[str, Any] | None = None,
                      plots_dir: Path | None = None) -> PreprocessResult:
    """Run all preprocessing steps and collect a data report with real counts."""
    seed = int(cfg.get("seed", 42))
    pp = cfg["preprocessing"]
    is_synthetic = bool((load_info or {}).get("is_synthetic", False))

    report: dict[str, Any] = {
        "data_source": SYNTHETIC_BANNER if is_synthetic else "CIC-IDS2017 (MachineLearningCSV)",
        "is_synthetic": is_synthetic,
        "load": load_info or {},
        "steps": [],
    }

    def log_step(name: str, frame: pd.DataFrame) -> None:
        report["steps"].append({"step": name, "rows": int(len(frame)),
                                "feature_columns": len(feature_columns(frame))})

    log_step("Loaded (after sampling)", df)
    report["class_distribution_before_cleaning"] = class_distribution(df[TARGET_COL])
    report["attack_distribution_before_cleaning"] = {
        k: int(v) for k, v in df[ATTACK_COL].value_counts().items()}

    # 1. duplicates
    df, n_dup = remove_duplicates(df)
    report["duplicates_removed"] = n_dup
    log_step("1. Duplicates removed", df)

    # 2. inf / NaN (identifier columns are skipped: they are dropped in step 3)
    id_candidates = list(pp.get("drop_columns", []))
    df, invalid_stats = handle_invalid_values(df, feature_columns(df, exclude=id_candidates),
                                              mode=pp.get("invalid_values", "drop"))
    report["invalid_values"] = invalid_stats
    log_step("2. inf/NaN handled", df)

    # 3. identifier columns
    df, dropped_ids = drop_identifier_columns(df, id_candidates)
    log_step("3. Identifier columns dropped", df)

    # 4. constant columns
    df, dropped_const = drop_constant_columns(df, feature_columns(df))
    log_step("4. Constant columns dropped", df)

    report["class_distribution_after_cleaning"] = class_distribution(df[TARGET_COL])
    report["attack_distribution_after_cleaning"] = {
        k: int(v) for k, v in df[ATTACK_COL].value_counts().items()}

    # 5. split
    split = pp.get("split", {})
    train_df, val_df, test_df = split_data(df, split.get("train", 0.70), split.get("val", 0.15),
                                           split.get("test", 0.15), seed)
    features = feature_columns(df)
    X_train = train_df[features].astype(np.float32)
    X_val = val_df[features].astype(np.float32)
    X_test = test_df[features].astype(np.float32)

    # 6. medians from TRAIN only (used for imputation now, and by predict.py later)
    fill_values = train_medians(X_train)
    if pp.get("invalid_values", "drop") == "impute":
        X_train, X_val, X_test = (X.fillna(fill_values) for X in (X_train, X_val, X_test))
        logger.info("Step 6: filled missing values with training-set medians")

    # 7. optional correlation filter (TRAIN only)
    dropped_corr: list[str] = []
    corr_pairs: list[tuple[str, str, float]] = []
    feat_cfg = cfg.get("features", {})
    if plots_dir is not None:
        plot_correlation_heatmap(X_train, Path(plots_dir) / "correlation_heatmap.png", is_synthetic)
    if feat_cfg.get("drop_correlated", False):
        dropped_corr, corr_pairs = find_correlated_features(
            X_train, float(feat_cfg.get("correlation_threshold", 0.95)))
        X_train, X_val, X_test = (X.drop(columns=dropped_corr) for X in (X_train, X_val, X_test))
        logger.info("Step 7: dropped %d highly correlated features (train only): %s",
                    len(dropped_corr), dropped_corr)
    features = list(X_train.columns)
    fill_values = {c: fill_values[c] for c in features}

    # 8. scaling (fit on TRAIN only)
    scaler, Xtr, Xva, Xte = fit_and_scale(X_train.to_numpy(), X_val.to_numpy(), X_test.to_numpy(),
                                          kind=pp.get("scaler", "standard"))
    y_train = train_df[TARGET_COL].to_numpy(dtype=np.int64)
    y_val = val_df[TARGET_COL].to_numpy(dtype=np.int64)
    y_test = test_df[TARGET_COL].to_numpy(dtype=np.int64)

    report["splits"] = {
        name: {"rows": int(len(y)), **class_distribution(y)}
        for name, y in (("train", y_train), ("validation", y_val), ("test", y_test))
    }

    # 9. class imbalance (TRAIN only)
    method = cfg.get("imbalance", {}).get("method", "class_weight")
    class_weights: dict[int, float] | None = None
    if method == "class_weight":
        class_weights = compute_class_weights(y_train)
        logger.info("Step 9: class weights from training set: %s", class_weights)
    elif method == "smote":
        Xtr, y_train = apply_smote(Xtr, y_train, seed)
        report["train_after_smote"] = {"rows": int(len(y_train)), **class_distribution(y_train)}
    elif method != "none":
        raise ValueError(f"imbalance.method must be class_weight, smote or none, got {method!r}")

    report["imbalance_method"] = method
    report["class_weights"] = {CLASS_NAMES[k]: round(v, 4) for k, v in (class_weights or {}).items()}
    report["scaler"] = type(scaler).__name__
    report["dropped_columns"] = {
        "identifier": dropped_ids,
        "constant": dropped_const,
        "correlated": dropped_corr,
    }
    report["correlated_pairs"] = [{"kept": a, "dropped": b, "abs_corr": c} for a, b, c in corr_pairs]
    report["final_features"] = features
    report["n_final_features"] = len(features)

    return PreprocessResult(
        X_train=Xtr, y_train=y_train, X_val=Xva, y_val=y_val, X_test=Xte, y_test=y_test,
        attack_val=val_df[ATTACK_COL].to_numpy(dtype=str),
        attack_test=test_df[ATTACK_COL].to_numpy(dtype=str),
        feature_names=features, scaler=scaler, fill_values=fill_values,
        class_weights=class_weights, train_index=train_df.index.to_numpy(), report=report,
    )


# ---------------------------------------------------------------------------
# Saving + data report
# ---------------------------------------------------------------------------

def save_artifacts(result: PreprocessResult, cfg: dict[str, Any]) -> None:
    """Save scaler, feature list, fill values, val/test splits and the data report."""
    models_dir = get_path(cfg, "models_dir", create=True)
    processed_dir = get_path(cfg, "processed_dir", create=True)
    output_dir = get_path(cfg, "output_dir", create=True)

    joblib.dump(result.scaler, models_dir / "scaler.joblib")
    save_json(result.feature_names, models_dir / "feature_list.json")
    save_json(result.fill_values, models_dir / "fill_values.json")
    joblib.dump({
        "X_val": result.X_val, "y_val": result.y_val, "attack_val": result.attack_val,
        "X_test": result.X_test, "y_test": result.y_test, "attack_test": result.attack_test,
        "feature_names": result.feature_names,
    }, processed_dir / "splits.joblib", compress=3)

    save_json(result.report, output_dir / "data_report.json")
    (output_dir / "data_report.md").write_text(data_report_to_markdown(result.report), encoding="utf-8")
    logger.info("Saved scaler, feature list and splits to %s and %s", models_dir, processed_dir)
    logger.info("Saved data report -> %s", output_dir / "data_report.md")


def md_table(rows: list[list[Any]], header: list[str]) -> str:
    """Build a simple Markdown table."""
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    lines += ["| " + " | ".join(str(x) for x in r) + " |" for r in rows]
    return "\n".join(lines)


def _pct(part: int, whole: int) -> str:
    return f"{100 * part / whole:.2f}%" if whole else "n/a"


def data_report_to_markdown(r: dict[str, Any]) -> str:
    """Render the data report dictionary as Markdown (all numbers come from ``r``)."""
    out: list[str] = []
    if r.get("is_synthetic"):
        out.append(f"> **⚠ {SYNTHETIC_BANNER}** — generated from synthetic test data.\n")
    out.append(f"**Data source:** {r['data_source']}\n")

    load = r.get("load", {})
    if load.get("files"):
        out.append("### Files loaded\n")
        out.append(md_table([[f["file"], f["rows_read"], f["rows_without_label"], f["rows_kept"]]
                              for f in load["files"]],
                             ["File", "Rows read", "Rows without label", "Rows kept"]))
        out.append(f"\nSample fraction: **{load.get('sample_frac', 1.0)}**\n")

    out.append("### Rows at each step\n")
    out.append(md_table([[s["step"], f"{s['rows']:,}", s["feature_columns"]] for s in r["steps"]],
                         ["Step", "Rows", "Feature columns"]))

    inv = r["invalid_values"]
    out.append(f"\n- Duplicate rows removed: **{r['duplicates_removed']:,}**")
    out.append(f"- inf cells: **{inv['inf_cells']:,}**, NaN cells: **{inv['nan_cells_original']:,}**, "
               f"rows affected: **{inv['rows_with_inf_or_nan']:,}** "
               f"(mode = `{inv['mode']}`, rows dropped = {inv['rows_dropped']:,})")
    if inv["columns_affected"]:
        out.append("- Columns with inf/NaN: " + ", ".join(
            f"`{c}` ({n:,})" for c, n in inv["columns_affected"].items()))

    out.append("\n### Class distribution\n")
    b, a = r["class_distribution_before_cleaning"], r["class_distribution_after_cleaning"]
    nb, na = sum(b.values()), sum(a.values())
    out.append(md_table(
        [[c, f"{b[c]:,}", _pct(b[c], nb), f"{a[c]:,}", _pct(a[c], na)] for c in ("Normal", "Malicious")],
        ["Class", "Before cleaning", "%", "After cleaning", "%"]))

    out.append("\n### Attack types\n")
    ab, aa = r["attack_distribution_before_cleaning"], r["attack_distribution_after_cleaning"]
    out.append(md_table([[k, f"{v:,}", f"{aa.get(k, 0):,}"] for k, v in ab.items()],
                         ["Original label", "Before cleaning", "After cleaning"]))

    out.append("\n### Train / validation / test split\n")
    out.append(md_table([[n, f"{s['rows']:,}", f"{s['Normal']:,}", f"{s['Malicious']:,}"]
                          for n, s in r["splits"].items()],
                         ["Split", "Rows", "Normal", "Malicious"]))
    out.append(f"\n- Imbalance handling: **{r['imbalance_method']}**")
    if r.get("class_weights"):
        out.append(f"- Class weights (from training set): {r['class_weights']}")
    if r.get("train_after_smote"):
        s = r["train_after_smote"]
        out.append(f"- Training set after SMOTE: {s['rows']:,} rows "
                   f"(Normal {s['Normal']:,}, Malicious {s['Malicious']:,})")
    out.append(f"- Scaler: **{r['scaler']}** (fitted on the training set only)")

    d = r["dropped_columns"]
    out.append("\n### Dropped columns\n")
    out.append(f"- Identifier / leakage-prone ({len(d['identifier'])}): {d['identifier'] or 'none present'}")
    out.append(f"- Constant ({len(d['constant'])}): {d['constant'] or 'none'}")
    out.append(f"- Highly correlated ({len(d['correlated'])}): {d['correlated'] or 'none'}")

    out.append(f"\n### Final features ({r['n_final_features']})\n")
    out.append(", ".join(f"`{f}`" for f in r["final_features"]))
    return "\n".join(out) + "\n"


# ---------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------

def load_and_preprocess(cfg: dict[str, Any]) -> PreprocessResult:
    """Load the raw CSVs and run the whole preprocessing pipeline."""
    data_cfg = cfg["data"]
    df, info = load_dataset(get_path(cfg, "raw_dir"), data_cfg.get("label_column", "Label"),
                            data_cfg.get("benign_label", "BENIGN"),
                            float(data_cfg.get("sample_frac", 1.0)), int(cfg.get("seed", 42)))
    if info["is_synthetic"]:
        logger.warning("*** Input files are SYNTHETIC: %s ***", SYNTHETIC_BANNER)
    return run_preprocessing(df, cfg, info, plots_dir=get_path(cfg, "plots_dir", create=True))


def add_common_args(parser: argparse.ArgumentParser) -> None:
    """CLI options shared by preprocess.py and train.py."""
    parser.add_argument("--config", default="config.yaml", help="Path to config.yaml")
    parser.add_argument("--sample-frac", type=float, default=None,
                        help="Use only this fraction of rows (e.g. 0.1) for a quick run")
    parser.add_argument("--data-dir", default=None,
                        help="Override paths.raw_dir (folder containing the CSV files)")
    parser.add_argument("--smote", action="store_true",
                        help="Use SMOTE on the training set instead of class weights")


def apply_cli_overrides(cfg: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    """Apply --sample-frac / --data-dir / --smote to the loaded config."""
    if args.sample_frac is not None:
        cfg["data"]["sample_frac"] = args.sample_frac
    if args.data_dir is not None:
        cfg["paths"]["raw_dir"] = str(Path(args.data_dir).resolve())
    if args.smote:
        cfg.setdefault("imbalance", {})["method"] = "smote"
    return cfg


def main(argv: list[str] | None = None) -> int:
    """Run only the data stage and write the data report."""
    parser = argparse.ArgumentParser(description="Preprocess CIC-IDS2017 and write a data report")
    add_common_args(parser)
    args = parser.parse_args(argv)
    setup_logging()
    cfg = apply_cli_overrides(load_config(args.config), args)
    set_seed(int(cfg.get("seed", 42)))
    try:
        result = load_and_preprocess(cfg)
    except DatasetNotFoundError as e:
        logger.error("%s", e)
        return 1
    save_artifacts(result, cfg)
    logger.info("Final feature count: %d", len(result.feature_names))
    return 0


if __name__ == "__main__":
    sys.exit(main())
