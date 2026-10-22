"""Behavioural rules for hospital monitoring: authentication abuse, unusual access, outbound policy, exfiltration.

These are deterministic, versioned rules with configurable thresholds (Settings page),
not ML models. Windows are kept in memory per process and keyed on event time, so
replaying historical logs produces the same detections as live ingestion.
"""

from __future__ import annotations

import ipaddress
import threading
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.services.alerts import AlertDraft

RULESET_VERSION = "hospital-rules-1.0"


def _ip(value: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(value)
    except ValueError:
        return None


def in_cidrs(ip: str, cidrs: list[str]) -> bool:
    addr = _ip(ip)
    if addr is None:
        return False
    for c in cidrs:
        try:
            if addr in ipaddress.ip_network(c, strict=False):
                return True
        except ValueError:
            continue
    return False


def is_external(ip: str, internal_cidrs: list[str]) -> bool:
    addr = _ip(ip)
    if addr is None or addr.is_loopback or addr.is_multicast or addr.is_link_local or addr.is_unspecified:
        return False
    return not in_cidrs(ip, internal_cidrs) and addr.is_global


@dataclass
class AuthEvent:
    timestamp: datetime
    user: str
    outcome: str          # success | failure
    source_ip: str = ""
    host: str = ""        # target host / system being logged into
    service: str = ""     # e.g. ssh, rdp, ehr-portal, windows
    source: str = "auth"
    is_simulated: bool = False


class _Windows:
    def __init__(self) -> None:
        self.data: dict[str, deque[tuple[float, str]]] = defaultdict(deque)
        self.lock = threading.Lock()

    def add(self, key: str, ts: float, value: str, window: float) -> list[tuple[float, str]]:
        with self.lock:
            q = self.data[key]
            q.append((ts, value))
            while q and ts - q[0][0] > window:
                q.popleft()
            return list(q)

    def get(self, key: str, ts: float, window: float) -> list[tuple[float, str]]:
        with self.lock:
            q = self.data.get(key, deque())
            return [x for x in q if ts - x[0] <= window]

    def clear(self, key: str) -> None:
        with self.lock:
            self.data.pop(key, None)


class AuthMonitor:
    def __init__(self) -> None:
        self.fail_by_user = _Windows()
        self.fail_by_src = _Windows()
        self.hosts_by_user = _Windows()

    def reset(self) -> None:
        self.__init__()

    def evaluate(self, ev: AuthEvent, rules: dict[str, Any]) -> list[AlertDraft]:
        out: list[AlertDraft] = []
        ts = ev.timestamp.timestamp()
        window = float(rules["auth_failure_window_seconds"])
        threshold = int(rules["auth_failure_threshold"])
        user = ev.user.lower()
        base = dict(source=ev.source, is_simulated=ev.is_simulated, detector_version=RULESET_VERSION,
                    host=ev.host, src_ip=ev.source_ip, user_name=ev.user)
        if ev.outcome == "failure":
            by_user = self.fail_by_user.add(f"u:{user}", ts, ev.source_ip, window)
            by_src = self.fail_by_src.add(f"s:{ev.source_ip}", ts, user, window) if ev.source_ip else []
            if len(by_user) >= threshold:
                out.append(AlertDraft(
                    module="auth", category="brute_force", severity="high", confidence=1.0,
                    title=f"{len(by_user)} failed logins for '{ev.user}' within {int(window)}s",
                    description="Repeated authentication failures for one account (password guessing).",
                    detector="rule.auth.failed_logins_per_user", mitre_technique="T1110.001",
                    evidence={"failures_in_window": len(by_user), "window_seconds": window, "service": ev.service,
                              "source_ips": sorted({s for _, s in by_user if s})[:20]},
                    aggregation_key=f"auth_bf_user|{user}", **base))
            distinct_users = {u for _, u in by_src}
            if ev.source_ip and len(by_src) >= threshold and len(distinct_users) >= 3:
                out.append(AlertDraft(
                    module="auth", category="password_spraying", severity="high", confidence=1.0,
                    title=f"{ev.source_ip} failed logins for {len(distinct_users)} accounts within {int(window)}s",
                    description="One source failing against many accounts (password spraying).",
                    detector="rule.auth.spraying_per_source", mitre_technique="T1110.003",
                    evidence={"failures_in_window": len(by_src), "accounts": sorted(distinct_users)[:20]},
                    aggregation_key=f"auth_spray|{ev.source_ip}", **base))
        elif ev.outcome == "success":
            prior = self.fail_by_user.get(f"u:{user}", ts, window)
            if len(prior) >= threshold:
                out.append(AlertDraft(
                    module="auth", category="brute_force_success", severity="critical", confidence=1.0,
                    title=f"Successful login for '{ev.user}' after {len(prior)} recent failures",
                    description="A login succeeded right after a burst of failures: the password may have been guessed.",
                    detector="rule.auth.success_after_failures", mitre_technique="T1110",
                    evidence={"prior_failures": len(prior), "window_seconds": window, "service": ev.service},
                    aggregation_key=f"auth_bf_success|{user}|{ev.source_ip}", **base))
                self.fail_by_user.clear(f"u:{user}")
            start, end = int(rules["offhours_start_hour"]), int(rules["offhours_end_hour"])
            hour = ev.timestamp.hour
            off = (hour >= start or hour < end) if start > end else (start <= hour < end)
            privileged = {p.lower() for p in rules["privileged_accounts"]}
            if off and user in privileged:
                out.append(AlertDraft(
                    module="auth", category="offhours_privileged_login", severity="medium", confidence=1.0,
                    title=f"Privileged account '{ev.user}' logged in off-hours ({ev.timestamp:%H:%M} UTC)",
                    description="Privileged access outside configured working hours.",
                    detector="rule.auth.offhours_privileged", mitre_technique="T1078",
                    evidence={"hour_utc": hour, "offhours": [start, end], "service": ev.service},
                    aggregation_key=f"auth_offhours|{user}|{ev.timestamp:%Y%m%d}", **base))
            if ev.host:
                hosts = self.hosts_by_user.add(f"h:{user}", ts, ev.host.lower(), 3600.0)
                distinct = {h for _, h in hosts}
                if len(distinct) >= int(rules["auth_distinct_hosts_threshold"]):
                    out.append(AlertDraft(
                        module="auth", category="unusual_access_pattern", severity="medium", confidence=1.0,
                        title=f"'{ev.user}' logged into {len(distinct)} different hosts within 1 hour",
                        description="Rapid access to many systems by one account can indicate lateral movement.",
                        detector="rule.auth.many_hosts", mitre_technique="T1021",
                        evidence={"hosts": sorted(distinct)[:20]},
                        aggregation_key=f"auth_many_hosts|{user}", **base))
        return out


def evaluate_flow_policy(*, src_ip: str, dst_ip: str, dst_port: int, out_bytes: float, in_bytes: float,
                         rules: dict[str, Any], internal_cidrs: list[str], source: str, is_simulated: bool,
                         host: str = "", domain: str = "") -> list[AlertDraft]:
    """Outbound policy and exfiltration indicators for one completed connection."""
    out: list[AlertDraft] = []
    if not (src_ip and dst_ip) or not in_cidrs(src_ip, internal_cidrs) or not is_external(dst_ip, internal_cidrs):
        return out
    base = dict(module="network", source=source, is_simulated=is_simulated, detector_version=RULESET_VERSION,
                src_ip=src_ip, dst_ip=dst_ip, host=host, entities=[("domain", domain)] if domain else [])
    ev = {"dst_port": dst_port, "bytes_out": out_bytes, "bytes_in": in_bytes}
    if rules["clinical_device_cidrs"] and in_cidrs(src_ip, rules["clinical_device_cidrs"]):
        out.append(AlertDraft(
            category="medical_device_external_connection", severity="high", confidence=1.0,
            title=f"Clinical-device network host {src_ip} connected to external {dst_ip}:{dst_port}",
            description="Hosts in the clinical device segment are not expected to reach the internet.",
            detector="rule.net.clinical_device_egress", mitre_technique="T1071", evidence=ev,
            aggregation_key=f"meddev_egress|{src_ip}|{dst_ip}", **base))
    allowed = {int(p) for p in rules["allowed_outbound_ports"]}
    if dst_port and dst_port not in allowed:
        out.append(AlertDraft(
            category="unexpected_outbound_port", severity="low", confidence=1.0,
            title=f"Outbound connection {src_ip} -> {dst_ip}:{dst_port} on a non-approved port",
            description="Destination port is not in the approved outbound list.",
            detector="rule.net.outbound_port", mitre_technique="T1571", evidence=ev,
            aggregation_key=f"outport|{src_ip}|{dst_port}", **base))
    thr = float(rules["exfil_bytes_threshold"])
    ratio = out_bytes / max(in_bytes, 1.0)
    if out_bytes >= thr and ratio >= float(rules["exfil_ratio_threshold"]):
        out.append(AlertDraft(
            category="potential_exfiltration", severity="high", confidence=min(1.0, out_bytes / (thr * 5)),
            title=f"{out_bytes / 1e6:.0f} MB uploaded from {src_ip} to external {dst_ip}",
            description="Large, mostly one-directional upload to an external address. Verify whether this "
                        "is an approved transfer (backups, imaging exchange) before acting.",
            detector="rule.net.large_upload", mitre_technique="T1048", evidence={**ev, "out_in_ratio": ratio},
            aggregation_key=f"exfil|{src_ip}|{dst_ip}", **base))
    return out


auth_monitor = AuthMonitor()
