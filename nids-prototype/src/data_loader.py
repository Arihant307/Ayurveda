"""Load and merge the CIC-IDS2017 MachineLearningCSV files.

Responsibilities of this module:
  * find the per-day CSV files in ``data/raw/``
  * read them (handling the known encoding quirk in the web-attack file)
  * strip the leading spaces from column names
  * create the binary target (0 = Normal, 1 = Malicious) while keeping the
    original attack name for per-attack analysis
  * optionally keep only a stratified fraction of the rows (``--sample-frac``)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.utils import SYNTHETIC_PREFIX

logger = logging.getLogger(__name__)

# Names of the two label columns created by this module.
TARGET_COL = "label"          # 0 = Normal, 1 = Malicious
ATTACK_COL = "attack_label"   # original label text, e.g. "DoS Hulk"

DATASET_HELP = """
No CSV files were found in: {raw_dir}

This project uses the CIC-IDS2017 dataset (Canadian Institute for Cybersecurity):
    https://www.unb.ca/cic/datasets/ids-2017.html

1. Open the page above and follow the download link (a short form is required).
2. Download "MachineLearningCSV.zip" (inside the CSVs folder).
3. Unzip it and copy the 8 per-day CSV files, e.g.
       Monday-WorkingHours.pcap_ISCX.csv
       Tuesday-WorkingHours.pcap_ISCX.csv
       ...
       Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv
   directly into:
       {raw_dir}
4. Run the command again.
"""


class DatasetNotFoundError(FileNotFoundError):
    """Raised when the raw data folder contains no CSV files."""


def find_csv_files(raw_dir: str | Path) -> list[Path]:
    """Return the sorted list of CSV files in ``raw_dir``.

    Raises:
        DatasetNotFoundError: if the folder is missing or has no CSV files.
    """
    raw_dir = Path(raw_dir)
    files = sorted(raw_dir.glob("*.csv")) if raw_dir.is_dir() else []
    if not files:
        raise DatasetNotFoundError(DATASET_HELP.format(raw_dir=raw_dir.resolve()))
    return files


def read_csv_robust(path: str | Path) -> pd.DataFrame:
    """Read a CSV, falling back to Windows/Latin encodings if UTF-8 fails.

    One CIC-IDS2017 file (Thursday web attacks) stores the dash in
    "Web Attack – Brute Force" as a cp1252 byte, which is not valid UTF-8.
    """
    for encoding in ("utf-8", "cp1252", "latin-1"):
        try:
            return pd.read_csv(path, encoding=encoding, low_memory=False)
        except UnicodeDecodeError:
            logger.debug("Could not read %s as %s, trying next encoding", path, encoding)
    raise ValueError(f"Could not decode {path}")  # latin-1 never fails, kept for safety


def clean_column_names(df: pd.DataFrame) -> pd.DataFrame:
    """Strip leading/trailing spaces from all column names (e.g. ' Label' -> 'Label')."""
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    return df


def normalise_label_text(labels: pd.Series) -> pd.Series:
    """Tidy raw label strings so the same attack always has the same name.

    Strips whitespace and replaces the different dash characters that appear in
    the web-attack labels (en-dash, cp1252 byte, Unicode replacement char) with
    a plain '-'.
    """
    out = labels.astype(str).str.strip()
    for bad in ("–", "—", "\x96", "�"):
        out = out.str.replace(bad, "-", regex=False)
    return out.str.replace(r"\s+", " ", regex=True)


def add_binary_label(df: pd.DataFrame, label_col: str = "Label",
                     benign_label: str = "BENIGN") -> pd.DataFrame:
    """Create the binary target and keep the original attack name.

    * ``attack_label`` - cleaned original label text (for per-attack analysis)
    * ``label``        - 0 if the flow is benign, 1 for every attack type

    The original ``label_col`` column is removed afterwards.
    """
    if label_col not in df.columns:
        raise KeyError(f"Label column '{label_col}' not found. Columns: {list(df.columns)[:10]}...")
    df = df.copy()
    df[ATTACK_COL] = normalise_label_text(df[label_col])
    is_benign = df[ATTACK_COL].str.upper() == benign_label.strip().upper()
    df[TARGET_COL] = np.where(is_benign, 0, 1).astype(np.int8)
    return df.drop(columns=[label_col])


def stratified_sample(df: pd.DataFrame, frac: float, seed: int) -> pd.DataFrame:
    """Keep ``frac`` of the rows of every attack type (so rare attacks survive).

    Each attack type keeps at least one row, so very rare classes such as
    Heartbleed are not lost completely when sampling.
    """
    if frac >= 1.0:
        return df
    if not 0.0 < frac < 1.0:
        raise ValueError(f"sample_frac must be in (0, 1], got {frac}")

    parts = []
    for _, group in df.groupby(ATTACK_COL, sort=True):
        n = max(1, int(round(len(group) * frac)))
        parts.append(group.sample(n=n, random_state=seed))
    return pd.concat(parts).sort_index()


def _downcast_numeric(df: pd.DataFrame) -> pd.DataFrame:
    """Store numeric columns as float32 to halve memory (~2.8M rows in the full data)."""
    num_cols = df.select_dtypes(include="number").columns.drop(TARGET_COL, errors="ignore")
    df[num_cols] = df[num_cols].astype(np.float32)
    return df


def load_dataset(raw_dir: str | Path, label_col: str = "Label", benign_label: str = "BENIGN",
                 sample_frac: float = 1.0, seed: int = 42) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Load all CSVs in ``raw_dir`` and merge them into one DataFrame.

    Sampling is applied per file (stratified by attack type) so that a laptop
    never has to hold the full dataset in memory when ``sample_frac < 1``.

    Returns:
        (df, info) where ``info`` holds real row counts for the data report.
    """
    files = find_csv_files(raw_dir)
    is_synthetic = any(f.name.upper().startswith(SYNTHETIC_PREFIX) for f in files)
    logger.info("Found %d CSV file(s) in %s", len(files), raw_dir)

    frames: list[pd.DataFrame] = []
    file_info: list[dict[str, Any]] = []
    for path in files:
        df = clean_column_names(read_csv_robust(path))
        rows_read = len(df)

        # Some files end with thousands of completely empty lines; they have no label.
        df = df.dropna(subset=[label_col])
        rows_no_label = rows_read - len(df)

        df = add_binary_label(df, label_col, benign_label)
        df = stratified_sample(df, sample_frac, seed)
        df = _downcast_numeric(df)

        logger.info("  %-55s rows=%9d  no-label=%6d  kept=%9d",
                    path.name, rows_read, rows_no_label, len(df))
        file_info.append({"file": path.name, "rows_read": rows_read,
                          "rows_without_label": rows_no_label, "rows_kept": len(df)})
        frames.append(df)

    # Files normally share the same columns; concat aligns them by name.
    data = pd.concat(frames, ignore_index=True)
    info = {
        "is_synthetic": is_synthetic,
        "files": file_info,
        "sample_frac": sample_frac,
        "rows_read_total": int(sum(f["rows_read"] for f in file_info)),
        "rows_without_label": int(sum(f["rows_without_label"] for f in file_info)),
        "rows_loaded": len(data),
    }
    logger.info("Loaded %d rows x %d columns in total", data.shape[0], data.shape[1])
    return data, info
