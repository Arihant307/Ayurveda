"""Versioned model artifacts.

Layout::

    ml/artifacts/<model_name>/<version>/model.joblib
    ml/artifacts/<model_name>/<version>/metadata.json
    ml/artifacts/<model_name>/LATEST            # contains the active version string

The backend loads ``LATEST`` unless ``MODEL_VERSION_<NAME>`` pins a version.
"""

from __future__ import annotations

import hashlib
import json
import platform
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import sklearn

ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"
REPORTS = Path(__file__).resolve().parents[1] / "reports"


def new_version() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def save(model_name: str, model: Any, metadata: dict[str, Any], root: Path = ARTIFACTS) -> Path:
    version = metadata.setdefault("version", new_version())
    target = root / model_name / version
    target.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, target / "model.joblib", compress=3)
    metadata.update({
        "model_name": model_name,
        "trained_at": datetime.now(UTC).isoformat(),
        "python": platform.python_version(),
        "sklearn": sklearn.__version__,
        "artifact_sha256": file_sha256(target / "model.joblib"),
    })
    (target / "metadata.json").write_text(json.dumps(metadata, indent=2, default=str))
    (root / model_name / "LATEST").write_text(version)
    return target


def load(model_name: str, version: str | None = None, root: Path = ARTIFACTS) -> tuple[Any, dict[str, Any]]:
    base = root / model_name
    version = version or (base / "LATEST").read_text().strip()
    target = base / version
    meta = json.loads((target / "metadata.json").read_text())
    if file_sha256(target / "model.joblib") != meta.get("artifact_sha256"):
        raise ValueError(f"Checksum mismatch for {target / 'model.joblib'}; refusing to load")
    return joblib.load(target / "model.joblib"), meta


def write_report(model_name: str, version: str, report: dict[str, Any], markdown: str) -> None:
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / f"{model_name}.json").write_text(json.dumps(report, indent=2, default=str))
    (REPORTS / f"{model_name}.md").write_text(markdown)
    archive = REPORTS / "history"
    archive.mkdir(exist_ok=True)
    (archive / f"{model_name}-{version}.json").write_text(json.dumps(report, indent=2, default=str))


def md_table(rows: list[dict[str, Any]], cols: list[str]) -> str:
    def fmt(v: Any) -> str:
        if isinstance(v, float):
            return f"{v:.4f}"
        return "—" if v is None else str(v)

    lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    lines += ["| " + " | ".join(fmt(r.get(c)) for c in cols) + " |" for r in rows]
    return "\n".join(lines)
