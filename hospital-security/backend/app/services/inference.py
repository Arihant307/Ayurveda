"""Loads the trained artifacts and runs inference. No prediction is ever produced without a loaded model."""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import numpy as np

from app.core.config import get_settings
from ml.preprocessing.email_features import ParsedEmail, extract_urls, indicators, normalize_text
from ml.preprocessing.url_features import explain_url, extract_features, parse_url
from ml.training import artifacts

log = logging.getLogger("hospital_security.inference")

MODEL_NAMES = ("email_classifier", "url_classifier", "network_cic", "network_portable")


class ModelUnavailable(RuntimeError):
    pass


@dataclass
class LoadedModel:
    name: str
    obj: Any = None
    meta: dict[str, Any] = field(default_factory=dict)
    error: str = ""
    loaded_at: datetime | None = None
    inferences: int = 0
    failures: int = 0
    last_inference_at: datetime | None = None
    total_ms: float = 0.0

    @property
    def ready(self) -> bool:
        return self.obj is not None

    @property
    def version(self) -> str:
        return str(self.meta.get("version", "unavailable"))


class Registry:
    def __init__(self) -> None:
        self.models: dict[str, LoadedModel] = {n: LoadedModel(n) for n in MODEL_NAMES}
        self._lock = threading.Lock()

    def load_all(self) -> None:
        root = get_settings().artifacts_dir
        for name in MODEL_NAMES:
            m = LoadedModel(name)
            try:
                pinned = None
                import os
                pinned = os.environ.get(f"MODEL_VERSION_{name.upper()}") or None
                m.obj, m.meta = artifacts.load(name, pinned, root=root)
                m.loaded_at = datetime.now(UTC)
                log.info("model loaded", extra={"path": f"{name}@{m.version}"})
            except FileNotFoundError:
                m.error = f"No artifact in {root / name}. Train it: see README (Model training)."
                log.warning(m.error)
            except Exception as exc:  # corrupted or incompatible artifact
                m.error = f"Failed to load: {exc}"
                log.exception("model load failed")
            self.models[name] = m

    def get(self, name: str) -> LoadedModel:
        m = self.models[name]
        if not m.ready:
            raise ModelUnavailable(f"Model '{name}' is not available: {m.error}")
        return m

    def _track(self, m: LoadedModel, started: float, ok: bool) -> float:
        ms = (time.perf_counter() - started) * 1000
        with self._lock:
            if ok:
                m.inferences += 1
                m.total_ms += ms
                m.last_inference_at = datetime.now(UTC)
            else:
                m.failures += 1
        return ms

    def status(self) -> list[dict[str, Any]]:
        out = []
        for m in self.models.values():
            meta = m.meta
            out.append({
                "name": m.name, "ready": m.ready, "version": m.version, "error": m.error,
                "selected_model": meta.get("selected_model"), "trained_at": meta.get("trained_at"),
                "datasets": meta.get("datasets", []), "threshold": meta.get("threshold", meta.get("attack_threshold")),
                "loaded_at": m.loaded_at, "inferences": m.inferences, "failures": m.failures,
                "last_inference_at": m.last_inference_at,
                "mean_latency_ms": (m.total_ms / m.inferences) if m.inferences else None,
            })
        return out

    # ---- e-mail -------------------------------------------------------------------------------
    def analyze_email(self, parsed: ParsedEmail) -> dict[str, Any]:
        m = self.get("email_classifier")
        t0 = time.perf_counter()
        try:
            pipe = m.obj["pipeline"]
            text = f"{parsed.subject} \n {parsed.body}"
            score = float(pipe.predict_proba([text])[0, 1])
            tokens = _top_tokens(pipe, m.obj.get("coef"), text)
        except Exception:
            self._track(m, t0, False)
            raise
        ms = self._track(m, t0, True)
        urls = extract_urls(parsed.body, parsed.html_links)
        return {"score": score, "threshold": float(m.meta["threshold"]), "model": m.name, "version": m.version,
                "indicators": indicators(parsed), "urls": urls[:50], "top_terms": tokens, "latency_ms": ms}

    # ---- URL ----------------------------------------------------------------------------------
    def analyze_url(self, url: str) -> dict[str, Any]:
        m = self.get("url_classifier")
        t0 = time.perf_counter()
        try:
            score = m.obj.predict_proba_one(url)
            contributions = m.obj.ngram_contributions(url) if hasattr(m.obj, "ngram_contributions") else []
            shap = m.obj.feature_contributions(url)
        except Exception:
            self._track(m, t0, False)
            raise
        ms = self._track(m, t0, True)
        p = parse_url(url)
        return {"score": score, "threshold": float(m.meta["threshold"]), "model": m.name, "version": m.version,
                "host": p.host, "registered_domain": p.registered_domain, "normalized": p.normalized,
                "features": extract_features(url), "reasons": explain_url(url),
                "ngram_contributions": contributions, "feature_contributions": shap, "latency_ms": ms}

    def score_urls(self, urls: list[str]) -> list[float]:
        m = self.get("url_classifier")
        t0 = time.perf_counter()
        scores = [float(s) for s in m.obj.predict_proba(urls)] if urls else []
        self._track(m, t0, True)
        return scores

    # ---- network ------------------------------------------------------------------------------
    def analyze_flows(self, rows: list[dict[str, float]], feature_set: str) -> tuple[list[dict[str, Any]], LoadedModel, float]:
        name = "network_cic" if feature_set == "cic" else "network_portable"
        m = self.get(name)
        t0 = time.perf_counter()
        try:
            preds = m.obj.predict(rows)
        except Exception:
            self._track(m, t0, False)
            raise
        ms = self._track(m, t0, True)
        return preds, m, ms


def _top_tokens(pipe: Any, coef: np.ndarray | None, text: str, top: int = 8) -> list[dict[str, float | str]]:
    """Terms in this message that pushed the linear score toward 'malicious'."""
    if coef is None:
        return []
    vec = pipe.named_steps["tfidf"]
    row = vec.transform([text]).tocoo()
    names = vec.get_feature_names_out()
    contrib = [(names[j], float(v * coef[j])) for j, v in zip(row.col, row.data)]
    # ComplementNB/LogReg coefficients are oriented so that larger = more malicious.
    contrib.sort(key=lambda t: -t[1])
    return [{"term": t, "weight": round(w, 4)} for t, w in contrib[:top] if w > 0]


def sha256_text(*parts: str) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8", errors="replace"))
        h.update(b"\x00")
    return h.hexdigest()


registry = Registry()
_ = normalize_text  # re-exported for API layer convenience
