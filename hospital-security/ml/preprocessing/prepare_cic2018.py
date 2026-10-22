"""Clean, de-duplicate, sample and split CSE-CIC-IDS2018 CICFlowMeter CSVs.

    python -m ml.preprocessing.prepare_cic2018 [--benign-per-day 60000] [--attack-cap 60000]

Steps per day file:
  1. drop repeated header rows, coerce numerics, drop rows with NaN/inf;
  2. remove exact duplicate flows (feature vector + label), and flows whose
     identical feature vector carries conflicting labels;
  3. cap each label per day (benign and very large attack classes) with a
     fixed seed;
  4. time-ordered split per (day, label): the earliest 70 % of each label's
     flows go to train, the next 15 % to validation and the latest 15 % to
     test, so the test set always lies after the training flows in time.

Output: ml/data/processed/cic2018_{train,val,test}.parquet and a JSON summary.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from ml.preprocessing.flow_features import CIC_FEATURES, LABEL_COLUMN, LABEL_TO_CATEGORY

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "cic_ids2018"
OUT = ROOT / "data" / "processed"


def load_day(path: Path) -> tuple[pd.DataFrame, dict[str, int]]:
    df = pd.read_csv(path, low_memory=False)
    stats = {"raw_rows": len(df)}
    df = df[df[LABEL_COLUMN] != LABEL_COLUMN]  # repeated header lines inside the CSV
    keep = [c for c in CIC_FEATURES if c in df.columns]
    missing = sorted(set(CIC_FEATURES) - set(keep))
    if missing:
        raise ValueError(f"{path.name}: missing columns {missing}")
    df = df[[*CIC_FEATURES, "Timestamp", LABEL_COLUMN]].copy()
    df[CIC_FEATURES] = df[CIC_FEATURES].apply(pd.to_numeric, errors="coerce")
    df["Timestamp"] = pd.to_datetime(df["Timestamp"], format="%d/%m/%Y %H:%M:%S", errors="coerce")
    df = df.replace([np.inf, -np.inf], np.nan).dropna()
    stats["after_clean"] = len(df)
    df = df[df[LABEL_COLUMN].isin(LABEL_TO_CATEGORY)]
    df = df.drop_duplicates(subset=[*CIC_FEATURES, LABEL_COLUMN])
    stats["after_dedup"] = len(df)
    conflict = df.duplicated(subset=CIC_FEATURES, keep=False)
    stats["conflicting_label_rows_dropped"] = int(conflict.sum())
    df = df[~conflict]
    df[CIC_FEATURES] = df[CIC_FEATURES].astype("float32")
    return df, stats


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--benign-per-day", type=int, default=60_000)
    ap.add_argument("--attack-cap", type=int, default=60_000, help="max flows per attack label per day")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args(argv)

    files = sorted(RAW.glob("*_TrafficForML_CICFlowMeter.csv"))
    if not files:
        raise SystemExit(f"No CIC-IDS2018 CSVs in {RAW}. Run: python -m ml.data.download cic2018")
    rng = np.random.default_rng(args.seed)
    splits: dict[str, list[pd.DataFrame]] = {"train": [], "val": [], "test": []}
    summary: dict[str, object] = {"files": {}, "seed": args.seed,
                                  "benign_per_day": args.benign_per_day, "attack_cap": args.attack_cap}
    for path in files:
        df, stats = load_day(path)
        day = path.name.split("_")[0]
        counts: dict[str, int] = {}
        for label, group in df.groupby(LABEL_COLUMN):
            cap = args.benign_per_day if label == "Benign" else args.attack_cap
            if len(group) > cap:
                group = group.iloc[np.sort(rng.choice(len(group), cap, replace=False))]
            group = group.sort_values("Timestamp", kind="stable")
            n = len(group)
            a, b = int(n * 0.70), int(n * 0.85)
            group = group.assign(day=day)
            splits["train"].append(group.iloc[:a])
            splits["val"].append(group.iloc[a:b])
            splits["test"].append(group.iloc[b:])
            counts[str(label)] = n
        stats["sampled_per_label"] = counts
        summary["files"][path.name] = stats  # type: ignore[index]
        print(path.name, stats)
        del df

    OUT.mkdir(parents=True, exist_ok=True)
    for name, parts in splits.items():
        frame = pd.concat(parts, ignore_index=True)
        frame["category"] = frame[LABEL_COLUMN].map(LABEL_TO_CATEGORY)
        frame.to_parquet(OUT / f"cic2018_{name}.parquet", index=False)
        summary[f"{name}_rows"] = len(frame)
        summary[f"{name}_categories"] = frame["category"].value_counts().to_dict()
    (OUT / "cic2018_summary.json").write_text(json.dumps(summary, indent=2, default=str))
    print(json.dumps({k: v for k, v in summary.items() if k != "files"}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
