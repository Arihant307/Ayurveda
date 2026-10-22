"""Serializable wrapper for the network-intrusion classifier."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np


@dataclass
class NetworkModel:
    feature_set: str            # "cic" or "portable"
    features: list[str]
    classes: list[str]          # category names in model output order
    estimator: Any
    attack_threshold: float     # P(attack) = 1 - P(benign) at or above this raises an alert
    kind: str

    def _matrix(self, rows: list[dict[str, float]]) -> np.ndarray:
        x = np.array([[float(r.get(f, 0.0)) for f in self.features] for r in rows], dtype=np.float32)
        return np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)

    def predict_proba(self, rows: list[dict[str, float]]) -> np.ndarray:
        return self.estimator.predict_proba(self._matrix(rows))

    def decide(self, proba: np.ndarray) -> tuple[list[str], np.ndarray]:
        benign = self.classes.index("benign")
        p_attack = 1.0 - proba[:, benign]
        attack_only = proba.copy()
        attack_only[:, benign] = -1
        labels = [self.classes[int(np.argmax(r))] if pa >= self.attack_threshold else "benign"
                  for r, pa in zip(attack_only, p_attack)]
        return labels, p_attack

    def predict(self, rows: list[dict[str, float]]) -> list[dict[str, Any]]:
        proba = self.predict_proba(rows)
        labels, p_attack = self.decide(proba)
        return [{"category": lab, "attack_probability": float(pa),
                 "class_probabilities": {c: float(p) for c, p in zip(self.classes, row)}}
                for lab, pa, row in zip(labels, p_attack, proba)]
