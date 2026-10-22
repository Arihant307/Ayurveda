"""API: authentication/authorisation, validation, response schemas, persistence, live updates."""

from __future__ import annotations

import io

import pandas as pd
import pytest

from conftest import ROOT, requires_models

API = "/api/v1"
PHISH = {"subject": "URGENT: mailbox suspended",
         "body": "Unusual activity detected. Verify your account within 24 hours or your account will be suspended. "
                 "Log in to http://198.51.100.23/owa/login.php and confirm your password.",
         "sender": "Microsoft IT <helpdesk@secure-mail-update.ru>"}


class TestAuth:
    def test_health_is_public(self, client):
        r = client.get(f"{API}/health")
        assert r.status_code == 200 and r.json()["database"] == "ok"

    def test_unauthenticated_requests_rejected(self, client):
        client.cookies.clear()
        for method, path in [("get", "/alerts"), ("get", "/metrics"), ("post", "/analyze/url"), ("get", "/models/status")]:
            r = client.post(f"{API}{path}", json={}) if method == "post" else client.get(f"{API}{path}")
            assert r.status_code == 401, path

    def test_bad_password(self, client):
        r = client.post(f"{API}/auth/login", json={"email": "admin@test.local", "password": "wrong"})
        assert r.status_code == 401

    def test_invalid_token(self, client):
        assert client.get(f"{API}/alerts", headers={"Authorization": "Bearer abc.def.ghi"}).status_code == 401

    def test_viewer_cannot_analyse_or_administer(self, client, viewer_headers):
        assert client.get(f"{API}/alerts", headers=viewer_headers).status_code == 200
        assert client.post(f"{API}/analyze/url", headers=viewer_headers, json={"url": "example.com"}).status_code == 403
        assert client.get(f"{API}/audit-logs", headers=viewer_headers).status_code == 403
        assert client.put(f"{API}/settings/thresholds", headers=viewer_headers, json={"value": {}}).status_code == 403

    def test_analyst_cannot_manage_users(self, client, analyst_headers):
        assert client.get(f"{API}/users", headers=analyst_headers).status_code == 403

    def test_cookie_session_requires_csrf_header_for_writes(self, client):
        client.cookies.clear()
        r = client.post(f"{API}/auth/login", json={"email": "admin@test.local", "password": "Admin-Password-123"})
        assert "hs_session" in r.cookies or "hs_session" in client.cookies
        assert client.get(f"{API}/auth/me").status_code == 200
        assert client.post(f"{API}/analyze/url", json={"url": "example.com"}).status_code == 403
        ok = client.post(f"{API}/analyze/url", json={"url": "example.com"}, headers={"X-Requested-With": "XMLHttpRequest"})
        assert ok.status_code in (200, 503)
        client.cookies.clear()

    def test_sensor_api_key(self, client):
        ev = {"events": [{"timestamp": "2026-10-22T10:00:00Z", "user": "x", "outcome": "success"}]}
        assert client.post(f"{API}/ingest/auth", json=ev, headers={"X-API-Key": "wrong"}).status_code == 401
        assert client.post(f"{API}/ingest/auth", json=ev, headers={"X-API-Key": "sensor-key-abcdefghijklmnop"}).status_code == 200

    def test_login_rate_limit(self, client, monkeypatch):
        from app.core import middleware

        monkeypatch.setattr(middleware.limiter, "allow", lambda key, limit, window=60.0:
                            (False, 30) if key.startswith("login:") else (True, 0))
        r = client.post(f"{API}/auth/login", json={"email": "a@b.c", "password": "x"})
        assert r.status_code == 429 and r.headers["Retry-After"] == "30"

    def test_failed_login_is_audited(self, client, admin_headers):
        client.post(f"{API}/auth/login", json={"email": "ghost@test.local", "password": "nope"})
        logs = client.get(f"{API}/audit-logs?action=auth.login", headers=admin_headers).json()
        assert any(entry["outcome"] == "failure" and entry["actor_email"] == "ghost@test.local" for entry in logs)


class TestValidation:
    def test_malformed_json(self, client, analyst_headers):
        r = client.post(f"{API}/analyze/email", headers={**analyst_headers, "content-type": "application/json"}, content=b"{bad")
        assert r.status_code == 422

    def test_missing_body_field(self, client, analyst_headers):
        r = client.post(f"{API}/analyze/email", headers=analyst_headers, json={"subject": "x"})
        assert r.status_code == 422 and r.json()["detail"] == "Invalid request"

    def test_url_with_whitespace_rejected(self, client, analyst_headers):
        assert client.post(f"{API}/analyze/url", headers=analyst_headers, json={"url": "a b.com"}).status_code == 422

    def test_oversized_body_rejected(self, client, analyst_headers):
        r = client.post(f"{API}/analyze/email", headers=analyst_headers, json={"subject": "x", "body": "a" * 2_100_000})
        assert r.status_code == 413

    def test_field_length_limit(self, client, analyst_headers):
        r = client.post(f"{API}/analyze/email", headers=analyst_headers, json={"subject": "x", "body": "a" * 200_001})
        assert r.status_code == 422

    def test_flow_value_range(self, client, analyst_headers):
        bad = {"flows": [{"dst_port": 70000, "protocol": 6, "duration_us": 1, "fwd_pkts": 1, "bwd_pkts": 1,
                          "fwd_bytes": 1, "bwd_bytes": 1}]}
        assert client.post(f"{API}/analyze/network", headers=analyst_headers, json=bad).status_code == 422

    def test_batch_wrong_schema(self, client, analyst_headers):
        csv = b"foo,bar\n1,2\n"
        r = client.post(f"{API}/analyze/network/batch", headers=analyst_headers, files={"file": ("x.csv", csv, "text/csv")})
        assert r.status_code == 422 and "missing_for_portable" in r.json()["detail"]

    def test_batch_wrong_extension(self, client, analyst_headers):
        r = client.post(f"{API}/analyze/network/batch", headers=analyst_headers, files={"file": ("x.exe", b"MZ", "application/octet-stream")})
        assert r.status_code == 415

    def test_eml_upload_wrong_type(self, client, analyst_headers):
        r = client.post(f"{API}/analyze/email/upload", headers=analyst_headers, files={"file": ("a.pdf", b"%PDF", "application/pdf")})
        assert r.status_code == 415


@requires_models
class TestAnalysis:
    def test_email_phishing_creates_alert(self, client, analyst_headers):
        r = client.post(f"{API}/analyze/email", headers=analyst_headers, json=PHISH)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_threat"] and d["alert_id"] and d["severity"] in ("medium", "high", "critical")
        assert 0 <= d["risk_score"] <= 1 and d["model_version"] and d["raw_content_stored"] is False
        assert {"credential_request", "ip_link", "display_name_impersonation"} <= {i["code"] for i in d["indicators"]}
        alert = client.get(f"{API}/alerts/{d['alert_id']}", headers=analyst_headers).json()
        assert alert["module"] == "email" and alert["analysis_id"] == d["analysis_id"] and not alert["is_simulated"]

    def test_email_content_not_stored_by_default(self, client, analyst_headers):
        client.post(f"{API}/analyze/email", headers=analyst_headers, json=PHISH)
        rows = client.get(f"{API}/analyses?kind=email", headers=analyst_headers).json()
        assert rows and all("Verify your account" not in r["input_summary"] for r in rows)

    def test_legitimate_email(self, client, analyst_headers):
        r = client.post(f"{API}/analyze/email", headers=analyst_headers, json={
            "subject": "Ward 4 rota", "body": "Hi all, the nursing rota for next week is attached. Let me know by Friday "
                                              "if you need swaps. Thanks, Priya", "sender": "priya@hospital.example"})
        assert r.status_code == 200 and r.json()["is_threat"] is False and r.json()["alert_id"] is None

    def test_eml_upload(self, client, analyst_headers):
        raw = (b"From: Payroll <payroll@hospita1-payroll.com>\r\nSubject: Verify your account to receive salary\r\n\r\n"
               b"Your salary is on hold. Verify your account and confirm your password at http://bit.ly/x1 immediately.\r\n")
        r = client.post(f"{API}/analyze/email/upload", headers=analyst_headers, files={"file": ("m.eml", raw, "message/rfc822")})
        assert r.status_code == 200, r.text
        assert "shortened_link" in {i["code"] for i in r.json()["indicators"]}

    def test_url_phishing_and_safety_notice(self, client, analyst_headers):
        r = client.post(f"{API}/analyze/url", headers=analyst_headers,
                        json={"url": "http://paypal.com.account-verify.secure-login.xyz/webscr/cmd=login"})
        d = r.json()
        assert r.status_code == 200 and d["is_threat"] and d["alert_id"] and "not opened" in d["safety_notice"]
        assert d["threat_intel"]["feed"] == "urlhaus" and d["features"]["num_subdomains"] >= 3

    def test_url_benign(self, client, analyst_headers):
        d = client.post(f"{API}/analyze/url", headers=analyst_headers, json={"url": "https://en.wikipedia.org/wiki/Hospital"}).json()
        assert d["is_threat"] is False and d["risk_score"] < d["threshold"]

    def test_network_flows(self, client, analyst_headers):
        r = client.post(f"{API}/analyze/network", headers=analyst_headers, json={"flows": [
            {"dst_port": 443, "protocol": 6, "duration_us": 5e6, "fwd_pkts": 30, "bwd_pkts": 40, "fwd_bytes": 4000, "bwd_bytes": 60000}]})
        d = r.json()
        assert r.status_code == 200 and len(d["predictions"]) == 1
        p = d["predictions"][0]
        assert abs(sum(p["class_probabilities"].values()) - 1) < 1e-4 and p["category"] in p["class_probabilities"]

    @pytest.mark.skipif(not (ROOT / "ml/data/processed/cic2018_test.parquet").exists(), reason="CIC split missing")
    def test_batch_csv_with_ground_truth(self, client, analyst_headers):
        from ml.preprocessing.flow_features import CIC_FEATURES

        test = pd.read_parquet(ROOT / "ml/data/processed/cic2018_test.parquet")
        sample = pd.concat([g.head(40) for _, g in test.groupby("category")])
        buf = io.StringIO()
        sample[CIC_FEATURES + ["Label"]].to_csv(buf, index=False)
        csv = buf.getvalue().encode() + b"not_a_number" + b",0" * (len(CIC_FEATURES) - 1) + b",Benign\n"
        r = client.post(f"{API}/analyze/network/batch", headers=analyst_headers, files={"file": ("flows.csv", csv, "text/csv")})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["feature_set"] == "cic" and d["rows_rejected"] == 1 and d["rows_analyzed"] == len(sample)
        assert d["evaluation"]["rows_with_known_labels"] == len(sample)
        assert d["evaluation"]["confusion_matrix"]["labels"][0] == "benign" and d["alerts_created"]

    def test_feedback_reports_fp_fn(self, client, analyst_headers):
        d = client.post(f"{API}/analyze/url", headers=analyst_headers, json={"url": "https://en.wikipedia.org/wiki/Nurse"}).json()
        fb = client.post(f"{API}/analyze/{d['analysis_id']}/feedback", headers=analyst_headers, json={"label": "threat"}).json()
        assert fb["outcome"] == "false_negative"
        m = client.get(f"{API}/metrics", headers=analyst_headers).json()
        assert m["feedback"]["url"]["false_negative"] >= 1

    def test_metrics_and_model_status(self, client, analyst_headers):
        m = client.get(f"{API}/metrics?window=24h", headers=analyst_headers).json()
        assert m["totals"]["events_analyzed"] >= 1 and len(m["trend"]) == 25
        st = client.get(f"{API}/models/status", headers=analyst_headers).json()
        assert all(x["ready"] for x in st["models"]) and any(x["inferences"] > 0 for x in st["models"])
        rep = client.get(f"{API}/models/network_cic/report", headers=analyst_headers).json()
        assert rep["report_matches_loaded_model"] is True


@requires_models
class TestAlertWorkflow:
    def test_status_transitions_and_audit(self, client, analyst_headers, admin_headers):
        aid = client.post(f"{API}/analyze/url", headers=analyst_headers,
                          json={"url": "http://secure-update-apple.id-verify.top/login.php"}).json()["alert_id"]
        assert client.patch(f"{API}/alerts/{aid}", headers=analyst_headers, json={"status": "acknowledged"}).status_code == 200
        assert client.patch(f"{API}/alerts/{aid}", headers=analyst_headers, json={"status": "resolved"}).status_code == 422
        r = client.patch(f"{API}/alerts/{aid}", headers=analyst_headers, json={"status": "false_positive", "note": "test domain"})
        assert r.json()["status"] == "false_positive" and r.json()["resolved_at"]
        logs = client.get(f"{API}/audit-logs?action=alert.status", headers=admin_headers).json()
        assert any(entry["target_id"] == str(aid) for entry in logs)

    def test_filters(self, client, analyst_headers):
        page = client.get(f"{API}/alerts?module=email&severity=critical&severity=high&severity=medium", headers=analyst_headers).json()
        assert all(a["module"] == "email" for a in page["items"])
        assert client.get(f"{API}/alerts?sort=severity&limit=5", headers=analyst_headers).status_code == 200

    def test_websocket_receives_new_alert(self, client, analyst_headers):
        token = analyst_headers["Authorization"].split()[1]
        with client.websocket_connect(f"{API}/ws/alerts?token={token}") as ws:
            assert ws.receive_json()["type"] == "hello"
            client.post(f"{API}/analyze/url", headers=analyst_headers, json={"url": "http://login-chase.verify-acct.click/sign-in"})
            msg = ws.receive_json()
            while msg["type"] not in ("alert.created", "alert.updated"):
                msg = ws.receive_json()
            assert msg["alert"]["module"] in ("url", "intel")

    def test_websocket_rejects_missing_token(self, client):
        from starlette.websockets import WebSocketDisconnect

        client.cookies.clear()
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"{API}/ws/alerts") as ws:
                ws.receive_json()

    def test_settings_threshold_update(self, client, admin_headers):
        r = client.put(f"{API}/settings/thresholds", headers=admin_headers, json={"value": {"url": {"high": 0.95}}})
        assert r.status_code == 200 and r.json()["thresholds"]["url"]["high"] == 0.95
        assert client.put(f"{API}/settings/thresholds", headers=admin_headers,
                          json={"value": {"url": {"high": 7}}}).status_code == 422
        assert client.put(f"{API}/settings/nope", headers=admin_headers, json={"value": {}}).status_code == 404
