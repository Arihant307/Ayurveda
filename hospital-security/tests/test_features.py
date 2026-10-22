"""Feature extraction on synthetic inputs."""

from __future__ import annotations

import pytest

from ml.preprocessing.email_features import extract_urls, indicators, normalize_text, parse_eml
from ml.preprocessing.flow_features import (
    CATEGORY_INFO,
    LABEL_TO_CATEGORY,
    PORTABLE_FEATURES,
    portable_from_counts,
    portable_from_suricata_flow,
    portable_from_zeek_conn,
)
from ml.preprocessing.url_features import FEATURE_NAMES, explain_url, extract_features, normalize_url, parse_url


class TestUrlFeatures:
    def test_normalisation_drops_scheme_and_www(self):
        assert normalize_url("HTTPS://WWW.Example.COM/Path?a=1&amp;b=2") == "example.com/Path?a=1&b=2"
        assert normalize_url("example.com/") == "example.com"

    def test_same_features_with_or_without_scheme(self):
        assert extract_features("http://login-paypal.com/x") == extract_features("login-paypal.com/x")

    def test_ip_host_and_port(self):
        f = extract_features("http://192.168.10.5:8080/admin/login.php")
        assert f["has_ip_host"] == 1 and f["has_port"] == 1 and f["php_in_path"] == 1

    def test_at_symbol_punycode_shortener(self):
        assert extract_features("http://good.com@evil.example/")["has_at"] == 1
        assert extract_features("http://xn--pypal-4ve.com/")["has_punycode"] == 1
        assert extract_features("https://bit.ly/3abc")["is_shortener"] == 1

    def test_subdomains_and_registered_domain(self):
        p = parse_url("http://a.b.c.example.co.uk/x")
        assert p.registered_domain == "example.co.uk"
        assert extract_features("http://a.b.c.example.co.uk/x")["num_subdomains"] == 3

    def test_brand_lookalike_reason(self):
        codes = {r["code"] for r in explain_url("http://paypal-secure-verify.xyz/webscr")}
        assert {"brand_lookalike", "suspicious_tokens", "suspicious_tld"} <= codes

    def test_benign_url_has_no_reasons(self):
        assert explain_url("https://en.wikipedia.org/wiki/Hospital") == []

    def test_feature_vector_complete(self):
        assert set(extract_features("example.com")) == set(FEATURE_NAMES)


class TestEmailFeatures:
    def test_normalize_matches_enron_preprocessed_style(self):
        assert normalize_text("Hello, World! <b>Bold</b>") == "hello , world ! bold"

    def test_indicators_use_word_boundaries(self):
        from ml.preprocessing.email_features import ParsedEmail

        out = indicators(ParsedEmail(subject="Shipping update", body="Your parcel is spinning around the depot"))
        assert not any(i["code"] == "credential_request" for i in out)

    def test_eml_parsing_links_attachments_and_impersonation(self):
        raw = (b"From: Microsoft Support <alerts@m1cr0soft-help.com>\r\n"
               b"Reply-To: collect@other-domain.net\r\n"
               b"Subject: Action required: verify your account\r\n"
               b"Authentication-Results: mx; spf=fail smtp.mailfrom=m1cr0soft-help.com\r\n"
               b"MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=XX\r\n\r\n"
               b"--XX\r\nContent-Type: text/html\r\n\r\n"
               b"<p>Your password expires today.</p><a href='http://203.0.113.9/login'>https://portal.hospital.org</a>\r\n"
               b"--XX\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename=invoice.js\r\n\r\n"
               b"YWxlcnQoMSk=\r\n--XX--\r\n")
        p = parse_eml(raw)
        assert p.sender == "alerts@m1cr0soft-help.com" and p.attachments == ["invoice.js"]
        codes = {i["code"] for i in indicators(p)}
        assert {"reply_to_mismatch", "auth_failure", "risky_attachment", "link_text_mismatch", "ip_link"} <= codes
        assert extract_urls(p.body, p.html_links) == ["http://203.0.113.9/login"] or \
            "http://203.0.113.9/login" in extract_urls(p.body, p.html_links)


class TestFlowFeatures:
    def test_label_mapping_targets_known_categories(self):
        assert set(LABEL_TO_CATEGORY.values()) <= set(CATEGORY_INFO)

    def test_portable_matches_cicflowmeter_definitions(self):
        f = portable_from_counts(22, 6, 2.0, 10, 5, 1000.0, 500.0)
        assert f["duration_us"] == 2e6 and f["bytes_per_s"] == pytest.approx(750.0)
        assert f["pkts_per_s"] == pytest.approx(7.5) and f["fwd_pkt_mean"] == 100.0
        assert f["down_up_ratio"] == 0.0  # CICFlowMeter uses integer division bwd // fwd
        assert list(f) == PORTABLE_FEATURES

    def test_zeek_conn_mapping(self):
        rec = {"id.resp_p": 443, "proto": "tcp", "duration": 1.5, "orig_pkts": 12, "resp_pkts": 10,
               "orig_bytes": 1500, "resp_bytes": 9000}
        f = portable_from_zeek_conn(rec)
        assert f["protocol"] == 6 and f["fwd_bytes"] == 1500 and f["duration_us"] == 1.5e6

    def test_zeek_unset_fields_become_zero(self):
        f = portable_from_zeek_conn({"id.resp_p": 53, "proto": "udp", "duration": None, "orig_bytes": "-"})
        assert f["duration_us"] == 0 and f["fwd_bytes"] == 0 and f["protocol"] == 17

    def test_suricata_flow_header_correction(self):
        ev = {"proto": "TCP", "dest_port": 80, "flow": {"pkts_toserver": 5, "pkts_toclient": 4,
              "bytes_toserver": 700, "bytes_toclient": 2160, "start": "2026-01-01T00:00:00.000000+0000",
              "end": "2026-01-01T00:00:02.000000+0000"}}
        f = portable_from_suricata_flow(ev)
        assert f["fwd_bytes"] == 700 - 5 * 40 and f["bwd_bytes"] == 2160 - 4 * 40 and f["duration_us"] == 2e6
