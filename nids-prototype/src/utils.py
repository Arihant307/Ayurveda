"""Small shared helpers: config loading, logging, seeding and plot labelling."""

from __future__ import annotations

import json
import logging
import os
import random
from pathlib import Path
from typing import Any

import numpy as np
import yaml

# Any CSV whose file name starts with this prefix is treated as synthetic test
# data. Everything produced from it is stamped with SYNTHETIC_BANNER so it can
# never be mistaken for real CIC-IDS2017 results.
SYNTHETIC_PREFIX = "SYNTHETIC"
SYNTHETIC_BANNER = "SYNTHETIC — NOT REAL RESULTS"

logger = logging.getLogger(__name__)


def setup_logging(level: int = logging.INFO) -> None:
    """Configure the root logger to write timestamped messages to the console."""
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%H:%M:%S",
        force=True,
    )


def load_config(path: str | Path) -> dict[str, Any]:
    """Read a YAML config file.

    The folder containing the config is remembered so that relative paths
    inside it can be resolved no matter where the command is run from.
    """
    path = Path(path).resolve()
    with open(path, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    cfg["_base_dir"] = str(path.parent)
    return cfg


def get_path(cfg: dict[str, Any], key: str, create: bool = False) -> Path:
    """Return ``cfg['paths'][key]`` as an absolute path (optionally creating it)."""
    p = Path(cfg["paths"][key])
    if not p.is_absolute():
        p = Path(cfg["_base_dir"]) / p
    if create:
        p.mkdir(parents=True, exist_ok=True)
    return p


def set_seed(seed: int, tensorflow: bool = False) -> None:
    """Seed Python, NumPy and (optionally) TensorFlow for reproducible runs."""
    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)
    np.random.seed(seed)
    if tensorflow:
        import tensorflow as tf  # imported lazily: it is slow to load

        tf.keras.utils.set_random_seed(seed)
        # Makes TensorFlow ops deterministic (slightly slower, but repeatable).
        tf.config.experimental.enable_op_determinism()


def save_json(obj: Any, path: str | Path) -> None:
    """Write ``obj`` as pretty-printed JSON, converting NumPy types to Python."""

    def _default(o: Any) -> Any:
        if isinstance(o, np.integer):
            return int(o)
        if isinstance(o, np.floating):
            return float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        raise TypeError(f"Cannot serialise {type(o)}")

    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, default=_default, ensure_ascii=False)


def load_json(path: str | Path) -> Any:
    """Read a JSON file."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def stamp_figure(fig: Any, is_synthetic: bool) -> None:
    """Add a red 'SYNTHETIC' warning to a matplotlib figure when needed."""
    if is_synthetic:
        fig.text(
            0.5, 0.005, SYNTHETIC_BANNER, ha="center", va="bottom",
            color="red", fontsize=11, fontweight="bold",
        )
