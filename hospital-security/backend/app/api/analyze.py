from __future__ import annotations

import io
import time
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import require_role
from app.models.db_models import Analysis, User
from app.models.schemas import (
    BatchResponse,
    EmailAnalyzeRequest,
    EmailAnalyzeResponse,
    FeedbackRequest,
    NetworkAnalyzeRequest,
    NetworkAnalyzeResponse,
    UrlAnalyzeRequest,
    UrlAnalyzeResponse,
)
from app.services import audit, detection, settings_service
from app.services.alerts import AlertDraft, emit
from app.services.inference import ModelUnavailable, registry
from ml.evaluation.metrics import multiclass_report
from ml.preprocessing.email_features import ParsedEmail, parse_eml
from ml.preprocessing.flow_features import CATEGORY_INFO, CIC_FEATURES, LABEL_TO_CATEGORY, PORTABLE_FEATURES
from email.utils import parseaddr

router = APIRouter(prefix="/analyze", tags=["analysis"])
EML_TYPES = {"message/rfc822", "application/octet-stream", "text/plain", ""}


def _unavailable(exc: ModelUnavailable) -> HTTPException:
    return HTTPException(503, str(exc))


def _email_response(db: Session, analysis: Analysis, alert: Any) -> EmailAnalyzeResponse:
    d = analysis.details
    return EmailAnalyzeResponse(
        analysis_id=analysis.id, kind="email", model_name=analysis.model_name, model_version=analysis.model_version,
        predicted_label=analysis.predicted_label, risk_score=analysis.score, threshold=d["threshold"],
        is_threat=analysis.is_threat, severity=alert.severity if alert else None, alert_id=alert.id if alert else None,
        latency_ms=analysis.latency_ms, created_at=analysis.created_at, indicators=d["indicators"],
        top_terms=d["top_terms"], url_domains=d["url_domains"], url_count=d["url_count"],
        attachments=d["attachments"], raw_content_stored=settings_service.load_all(db)["retention"]["store_raw_email"],
    )


@router.post("/email", response_model=EmailAnalyzeResponse, summary="Classify an e-mail (subject + body)")
def analyze_email(body: EmailAnalyzeRequest, request: Request, user: User = Depends(require_role("analyst")),
                  db: Session = Depends(get_db)) -> EmailAnalyzeResponse:
    name, addr = parseaddr(body.sender)
    parsed = ParsedEmail(subject=body.subject, body=body.body, sender=addr.lower(), sender_name=name,
                         reply_to=parseaddr(body.reply_to)[1].lower())
    try:
        analysis, alert = detection.analyze_email(db, parsed, user=user)
    except ModelUnavailable as exc:
        raise _unavailable(exc) from exc
    audit.record(db, "analyze.email", user=user, request=request, target_type="analysis", target_id=analysis.id,
                 details={"is_threat": analysis.is_threat})
    return _email_response(db, analysis, alert)


@router.post("/email/upload", response_model=EmailAnalyzeResponse, summary="Classify an uploaded .eml message")
async def analyze_email_upload(request: Request, file: UploadFile = File(...),
                               user: User = Depends(require_role("analyst")),
                               db: Session = Depends(get_db)) -> EmailAnalyzeResponse:
    name = (file.filename or "").lower()
    if not name.endswith((".eml", ".txt")) or (file.content_type or "") not in EML_TYPES | {"message/rfc822"}:
        raise HTTPException(415, "Upload an RFC 822 message (.eml). Attachments inside it are listed, never opened.")
    raw = await file.read(5_000_001)
    if len(raw) > 5_000_000:
        raise HTTPException(413, "E-mail files are limited to 5 MB")
    try:
        parsed = parse_eml(raw)
    except Exception as exc:
        raise HTTPException(422, f"Could not parse e-mail: {exc}") from exc
    if not (parsed.subject or parsed.body).strip():
        raise HTTPException(422, "The message has no text content to analyse")
    try:
        from starlette.concurrency import run_in_threadpool

        analysis, alert = await run_in_threadpool(detection.analyze_email, db, parsed, user=user)
    except ModelUnavailable as exc:
        raise _unavailable(exc) from exc
    audit.record(db, "analyze.email_upload", user=user, request=request, target_type="analysis", target_id=analysis.id)
    return _email_response(db, analysis, alert)


@router.post("/url", response_model=UrlAnalyzeResponse, summary="Classify a URL lexically (it is never visited)")
def analyze_url(body: UrlAnalyzeRequest, request: Request, user: User = Depends(require_role("analyst")),
                db: Session = Depends(get_db)) -> UrlAnalyzeResponse:
    try:
        analysis, alert, r = detection.analyze_url(db, body.url, user=user, enrich=body.enrich)
    except ModelUnavailable as exc:
        raise _unavailable(exc) from exc
    audit.record(db, "analyze.url", user=user, request=request, target_type="analysis", target_id=analysis.id,
                 details={"host": r["host"], "is_threat": analysis.is_threat})
    d = analysis.details
    return UrlAnalyzeResponse(
        analysis_id=analysis.id, kind="url", model_name=analysis.model_name, model_version=analysis.model_version,
        predicted_label=analysis.predicted_label, risk_score=analysis.score, threshold=d["threshold"],
        is_threat=analysis.is_threat, severity=alert.severity if alert else None, alert_id=alert.id if alert else None,
        latency_ms=analysis.latency_ms, created_at=analysis.created_at, host=r["host"],
        registered_domain=r["registered_domain"], reasons=[{**x, "evidence": ""} for x in r["reasons"]],
        features=r["features"], ngram_contributions=r["ngram_contributions"], threat_intel=d["intel"],
    )


@router.post("/network", response_model=NetworkAnalyzeResponse, summary="Classify flow records (portable features)")
def analyze_network(body: NetworkAnalyzeRequest, request: Request, user: User = Depends(require_role("analyst")),
                    db: Session = Depends(get_db)) -> NetworkAnalyzeResponse:
    from ml.preprocessing.flow_features import portable_from_counts

    rows = [portable_from_counts(f.dst_port, f.protocol, f.duration_us / 1e6, f.fwd_pkts, f.bwd_pkts,
                                 f.fwd_bytes, f.bwd_bytes) for f in body.flows]
    ctxs = [detection.FlowContext(src_ip=f.src_ip, dst_ip=f.dst_ip, dst_port=f.dst_port) for f in body.flows]
    try:
        preds = detection.analyze_flows(db, rows, ctxs, feature_set="portable", source="user_submission",
                                        is_simulated=False, user=user, raise_alerts=body.raise_alerts)
    except ModelUnavailable as exc:
        raise _unavailable(exc) from exc
    m = registry.get("network_portable")
    audit.record(db, "analyze.network", user=user, request=request, details={"flows": len(rows)})
    return NetworkAnalyzeResponse(model_name=m.name, model_version=m.version,
                                  threshold=float(m.obj.attack_threshold), predictions=preds)


def _read_csv(raw: bytes, max_rows: int) -> pd.DataFrame:
    try:
        df = pd.read_csv(io.BytesIO(raw), nrows=max_rows + 1, low_memory=False, skipinitialspace=True)
    except (pd.errors.ParserError, UnicodeDecodeError, pd.errors.EmptyDataError) as exc:
        raise HTTPException(422, f"Not a valid CSV file: {exc}") from exc
    if len(df) > max_rows:
        raise HTTPException(413, f"CSV has more than {max_rows} rows; split it into smaller files")
    df.columns = [str(c).strip() for c in df.columns]
    return df


@router.post("/network/batch", response_model=BatchResponse,
             summary="Batch-classify a CSV of flows (CICFlowMeter columns or the portable schema)")
async def analyze_network_batch(request: Request, file: UploadFile = File(...),
                                user: User = Depends(require_role("analyst")),
                                db: Session = Depends(get_db)) -> BatchResponse:
    s = get_settings()
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(415, "Upload a .csv file")
    raw = await file.read(s.max_upload_bytes + 1)
    if len(raw) > s.max_upload_bytes:
        raise HTTPException(413, f"File exceeds {s.max_upload_bytes} bytes")
    from starlette.concurrency import run_in_threadpool

    return await run_in_threadpool(_batch, db, raw, user, request, s.max_batch_rows)


def _batch(db: Session, raw: bytes, user: User, request: Request, max_rows: int) -> BatchResponse:
    t0 = time.perf_counter()
    df = _read_csv(raw, max_rows)
    if "Label" in df.columns:
        df = df[df["Label"] != "Label"]  # repeated header rows in CIC exports
    if set(CIC_FEATURES) <= set(df.columns):
        feature_set, cols = "cic", CIC_FEATURES
    elif set(PORTABLE_FEATURES) <= set(df.columns):
        feature_set, cols = "portable", PORTABLE_FEATURES
    else:
        missing_cic = sorted(set(CIC_FEATURES) - set(df.columns))
        missing_portable = sorted(set(PORTABLE_FEATURES) - set(df.columns))
        raise HTTPException(422, {"message": "CSV schema not recognised. Provide all CICFlowMeter columns "
                                             "(CSE-CIC-IDS2018 format) or the portable schema.",
                                  "missing_for_cicflowmeter": missing_cic[:20],
                                  "missing_for_portable": missing_portable,
                                  "portable_columns": PORTABLE_FEATURES})
    num = df[cols].apply(pd.to_numeric, errors="coerce").replace([np.inf, -np.inf], np.nan)
    bad = num.isna().any(axis=1)
    rejected = df[bad]
    good = num[~bad]
    if good.empty:
        raise HTTPException(422, "No row had valid numeric values for every required column")
    rows = good.to_dict("records")
    ctx = []
    for _, r in df.loc[good.index].iterrows():
        ctx.append(detection.FlowContext(src_ip=str(r.get("Src IP", r.get("src_ip", "")) or ""),
                                         dst_ip=str(r.get("Dst IP", r.get("dst_ip", "")) or "")))
    try:
        preds = []
        for i in range(0, len(rows), 5000):
            preds += detection.analyze_flows(db, rows[i:i + 5000], ctx[i:i + 5000], feature_set=feature_set,
                                             source="csv_batch", is_simulated=False, user=user,
                                             store_analyses=False, raise_alerts=False)
    except ModelUnavailable as exc:
        raise _unavailable(exc) from exc
    model = registry.get("network_cic" if feature_set == "cic" else "network_portable")
    cats = pd.Series([p["category"] for p in preds])
    counts = cats.value_counts().to_dict()

    evaluation = None
    if "Label" in df.columns:
        truth = df.loc[good.index, "Label"].astype(str).str.strip()
        truth = truth.map(lambda v: LABEL_TO_CATEGORY.get(v, v.lower()))
        known = truth.isin(CATEGORY_INFO).to_numpy()
        if known.any():
            evaluation = multiclass_report(truth[known].tolist(), cats[known].tolist(), list(CATEGORY_INFO),
                                           attack_scores=[p["attack_probability"] for p, k in zip(preds, known) if k])
            evaluation["rows_with_known_labels"] = int(known.sum())

    # One aggregated alert per detected category (a CSV is an investigation artefact, not a live stream).
    alerts = []
    for cat, n in counts.items():
        if cat == "benign":
            continue
        probs = [p["attack_probability"] for p in preds if p["category"] == cat]
        sev = detection.network_severity(db, cat, float(np.median(probs)), float(model.obj.attack_threshold)) or "medium"
        info = CATEGORY_INFO.get(cat, {})
        a = emit(db, AlertDraft(
            module="network", category=cat, severity=sev, confidence=float(np.median(probs)), source="csv_batch",
            detector=model.name, detector_version=model.version, mitre_technique=info.get("mitre", ""),
            title=f"CSV batch: {n} flows classified as {info.get('title', cat)}",
            description="Uploaded flow records analysed in batch. Review the source capture before acting.",
            evidence={"flows": int(n), "median_attack_probability": float(np.median(probs)),
                      "uploaded_by": user.email}, aggregation_key=f"batch|{cat}|{time.time_ns()}"))
        alerts.append(a.id)
    audit.record(db, "analyze.network_batch", user=user, request=request,
                 details={"rows": len(df), "feature_set": feature_set, "alerts": alerts})
    sample = [{**{k: round(float(v), 3) for k, v in list(rows[i].items())[:6]}, "category": preds[i]["category"],
               "attack_probability": round(preds[i]["attack_probability"], 4)} for i in range(min(25, len(rows)))]
    return BatchResponse(
        model_name=model.name, model_version=model.version, feature_set=feature_set, rows_received=len(df),
        rows_analyzed=len(rows), rows_rejected=len(rejected),
        rejected_examples=[f"row {i + 2}: non-numeric or missing value" for i in rejected.index[:5]],
        threshold=float(model.obj.attack_threshold), category_counts={str(k): int(v) for k, v in counts.items()},
        alerts_created=alerts, evaluation=evaluation, sample_predictions=sample,
        duration_ms=(time.perf_counter() - t0) * 1000,
    )


@router.post("/{analysis_id}/feedback", summary="Record analyst ground truth for false-positive/negative reporting")
def feedback(analysis_id: int, body: FeedbackRequest, request: Request, user: User = Depends(require_role("analyst")),
             db: Session = Depends(get_db)) -> dict[str, Any]:
    a = db.get(Analysis, analysis_id)
    if a is None:
        raise HTTPException(404, "Analysis not found")
    a.feedback_label = body.label
    db.commit()
    audit.record(db, "analysis.feedback", user=user, request=request, target_type="analysis", target_id=a.id,
                 details={"label": body.label, "predicted_threat": a.is_threat})
    outcome = ("true_positive" if a.is_threat else "false_negative") if body.label == "threat" else \
              ("false_positive" if a.is_threat else "true_negative")
    return {"analysis_id": a.id, "feedback": body.label, "outcome": outcome}
