"""Serializable wrapper around the selected URL scorer (imported when the artifact is loaded)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from ml.preprocessing.url_features import extract_features, normalize_url


@dataclass
class UrlModel:
    kind: str
    baseline: Any
    xgb: Any
    ngram: Any
    calibrator: Any
    feature_names: list[str]

    def _lexical(self, urls: list[str]) -> np.ndarray:
        return np.array([[extract_features(u)[n] for n in self.feature_names] for u in urls], dtype=np.float32)

    def raw_scores(self, urls: list[str]) -> np.ndarray:
        norm = [normalize_url(u) for u in urls]
        if self.kind == "lexical_logreg_baseline":
            return self.baseline.predict_proba(self._lexical(norm))[:, 1]
        if self.kind == "lexical_xgboost":
            return self.xgb.predict_proba(self._lexical(norm))[:, 1]
        if self.kind == "char_ngram_logreg":
            return self.ngram.predict_proba(norm)[:, 1]
        return (self.xgb.predict_proba(self._lexical(norm))[:, 1] + self.ngram.predict_proba(norm)[:, 1]) / 2

    def predict_proba(self, urls: list[str]) -> np.ndarray:
        return self.calibrator.predict(self.raw_scores(urls))

    def predict_proba_one(self, url: str) -> float:
        return float(self.predict_proba([url])[0])

    def ngram_contributions(self, url: str, top: int = 6) -> list[dict[str, float | str]]:
        """Character n-grams that pushed the logistic-regression score up or down the most."""
        if self.ngram is None:
            return []
        tfidf, clf = self.ngram.named_steps["tfidf"], self.ngram.named_steps["clf"]
        row = tfidf.transform([normalize_url(url)]).tocoo()
        coef = clf.coef_.ravel()
        names = tfidf.get_feature_names_out()
        contrib = sorted(((names[j], float(v * coef[j])) for j, v in zip(row.col, row.data)), key=lambda t: -abs(t[1]))
        # Overlapping n-grams repeat the same evidence; keep the strongest non-nested ones.
        picked: list[tuple[str, float]] = []
        for gram, c in contrib:
            g = gram.strip()
            if len(g) < 3 or any(g in p or p in g for p, _ in picked):
                continue
            picked.append((g, c))
            if len(picked) == top:
                break
        return [{"ngram": g, "contribution": c} for g, c in picked]

    def feature_contributions(self, url: str, top: int = 6) -> list[dict[str, float]]:
        """Per-feature SHAP contributions from the XGBoost component (if the model has one)."""
        if self.xgb is None:
            return []
        import xgboost as xgb

        x = self._lexical([normalize_url(url)])
        contrib = self.xgb.get_booster().predict(xgb.DMatrix(x), pred_contribs=True)[0]
        pairs = sorted(zip(self.feature_names, contrib[:-1], x[0]), key=lambda t: -abs(t[1]))[:top]
        return [{"feature": n, "value": float(v), "contribution": float(c)} for n, c, v in pairs]
