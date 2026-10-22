"""E-mail parsing, normalisation and interpretable phishing indicators.

The classifier is trained on the *preprocessed* Enron-Spam corpus, whose text
is lower-cased with punctuation split into separate tokens and without
headers or HTML. ``normalize_text`` reproduces that format so text seen at
inference time matches the training distribution.

Header-derived checks (display-name impersonation, Reply-To mismatch, SPF/DKIM
results, risky attachments) are rule-based indicators reported alongside the
model score; they are not model inputs because the training corpus has no
headers.
"""

from __future__ import annotations

import email
import email.policy
import html
import re
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import parseaddr

from ml.preprocessing.url_features import BRANDS, SHORTENERS, parse_url

URL_RE = re.compile(r"(?i)\b((?:https?://|www\.)[^\s<>\"')\]]+)")
HREF_RE = re.compile(r"(?is)<a\s[^>]*href\s*=\s*[\"']?([^\"'\s>]+)[^>]*>(.*?)</a>")
TAG_RE = re.compile(r"(?s)<[^>]+>")
_PUNCT_RE = re.compile(r"([!\"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])")
_WS_RE = re.compile(r"\s+")

URGENCY = (
    "urgent", "immediately", "within 24 hours", "within 48 hours", "act now", "final notice",
    "account will be suspended", "suspended", "deactivated", "expire", "expires today",
    "last warning", "action required", "unusual activity", "verify within", "limited time",
)
CREDENTIAL = (
    "password", "verify your account", "confirm your identity", "login details", "log in to",
    "sign in to", "username", "social security", "ssn", "credit card", "bank account", "pin",
    "update your information", "reset your password", "validate your", "credentials",
    "mailbox quota", "re-enter", "billing information",
)
FINANCIAL = ("wire transfer", "gift card", "bitcoin", "invoice attached", "payment overdue", "refund", "remittance")
HEALTHCARE_LURES = (
    "patient record", "lab results", "test results", "covid", "vaccine", "insurance claim",
    "medicare", "medicaid", "ehr", "epic", "cerner", "prescription", "hipaa", "telehealth",
)
RISKY_ATTACHMENTS = (".exe", ".scr", ".js", ".vbs", ".bat", ".cmd", ".hta", ".iso", ".img", ".lnk",
                     ".jar", ".msi", ".ps1", ".docm", ".xlsm", ".pptm", ".zip", ".rar", ".7z", ".html", ".htm")


def normalize_text(text: str) -> str:
    """Match the Enron-Spam 'preprocessed' format: lower case, punctuation spaced out."""
    text = html.unescape(text)
    text = TAG_RE.sub(" ", text)
    text = _PUNCT_RE.sub(r" \1 ", text.lower())
    return _WS_RE.sub(" ", text).strip()


@dataclass
class ParsedEmail:
    subject: str
    body: str
    sender: str = ""
    sender_name: str = ""
    reply_to: str = ""
    return_path: str = ""
    auth_results: str = ""
    html_links: list[tuple[str, str]] = field(default_factory=list)
    attachments: list[str] = field(default_factory=list)


def parse_eml(raw: bytes) -> ParsedEmail:
    """Parse an RFC 822 message. Attachments are listed by name only and never opened."""
    msg: EmailMessage = email.message_from_bytes(raw, policy=email.policy.default)  # type: ignore[assignment]
    body_parts: list[str] = []
    links: list[tuple[str, str]] = []
    attachments: list[str] = []
    for part in msg.walk():
        if part.is_multipart():
            continue
        filename = part.get_filename()
        disposition = (part.get_content_disposition() or "").lower()
        if filename or disposition == "attachment":
            attachments.append(filename or "(unnamed attachment)")
            continue
        ctype = part.get_content_type()
        if ctype not in ("text/plain", "text/html"):
            continue
        try:
            content = part.get_content()
        except (LookupError, UnicodeDecodeError):
            payload = part.get_payload(decode=True) or b""
            content = payload.decode("latin-1", errors="replace")
        if ctype == "text/html":
            links.extend((h.strip(), TAG_RE.sub("", t).strip()) for h, t in HREF_RE.findall(content))
        body_parts.append(content)
    name, addr = parseaddr(str(msg.get("From", "")))
    return ParsedEmail(
        subject=str(msg.get("Subject", "")),
        body="\n".join(body_parts),
        sender=addr.lower(),
        sender_name=name,
        reply_to=parseaddr(str(msg.get("Reply-To", "")))[1].lower(),
        return_path=parseaddr(str(msg.get("Return-Path", "")))[1].lower(),
        auth_results=str(msg.get("Authentication-Results", "")).lower(),
        html_links=links,
        attachments=attachments,
    )


def extract_urls(text: str, html_links: list[tuple[str, str]] | None = None) -> list[str]:
    found = [m.rstrip(".,;:!?") for m in URL_RE.findall(text)]
    found += [h for h, _ in (html_links or []) if h.lower().startswith(("http", "www."))]
    seen: dict[str, None] = {}
    for u in found:
        seen.setdefault(u, None)
    return list(seen)


def _domain_of(addr: str) -> str:
    return addr.rsplit("@", 1)[-1] if "@" in addr else ""


def _hits(text: str, phrases: tuple[str, ...]) -> list[str]:
    return [w for w in phrases if re.search(r"(?<![a-z0-9])" + re.escape(w) + r"(?![a-z0-9])", text)]


def indicators(p: ParsedEmail) -> list[dict[str, str]]:
    text = f"{p.subject}\n{TAG_RE.sub(' ', p.body)}".lower()
    out: list[dict[str, str]] = []

    def add(code: str, severity: str, description: str, evidence: list[str] | None = None) -> None:
        out.append({"code": code, "severity": severity, "description": description,
                    "evidence": ", ".join((evidence or [])[:5])})

    urg = _hits(text, URGENCY)
    if urg:
        add("urgency_language", "medium", "Urgency or threat language pressures the reader to act quickly.", urg)
    cred = _hits(text, CREDENTIAL)
    if cred:
        add("credential_request", "high", "Message asks for credentials or personal/financial details.", cred)
    fin = _hits(text, FINANCIAL)
    if fin:
        add("financial_lure", "medium", "Payment or financial lure detected.", fin)
    hc = _hits(text, HEALTHCARE_LURES)
    if hc and (cred or urg):
        add("healthcare_lure", "medium", "Healthcare-themed lure combined with urgency or a credential request.", hc)

    urls = extract_urls(p.body, p.html_links)
    if urls:
        hosts = {parse_url(u).host for u in urls}
        ip_hosts = [h for h in hosts if re.fullmatch(r"[\d.]+", h or "")]
        if ip_hosts:
            add("ip_link", "high", "Links point directly to IP addresses.", ip_hosts)
        short = [h for h in hosts if parse_url(h).registered_domain in SHORTENERS]
        if short:
            add("shortened_link", "medium", "Shortened links hide their real destination.", short)
    for href, label in p.html_links:
        label_urls = URL_RE.findall(label)
        if label_urls:
            shown = parse_url(label_urls[0]).registered_domain
            real = parse_url(href).registered_domain
            if shown and real and shown != real:
                add("link_text_mismatch", "high", "Visible link text shows a different domain than the actual link.",
                    [f"{shown} -> {real}"])
                break

    sender_domain = _domain_of(p.sender)
    if p.sender_name and sender_domain:
        name_l = p.sender_name.lower()
        spoofed = [b for b in BRANDS if len(b) >= 4 and b in name_l and b not in sender_domain]
        if spoofed:
            add("display_name_impersonation", "high",
                f"Display name mentions {spoofed[0]!r} but the sender domain is {sender_domain!r}.", spoofed)
        if "@" in name_l:
            shown = _domain_of(parseaddr(name_l)[1] or name_l.split()[-1])
            if shown and shown != sender_domain:
                add("display_name_address", "high", "Display name contains a different e-mail address.", [shown])
    if p.reply_to and sender_domain and _domain_of(p.reply_to) != sender_domain:
        add("reply_to_mismatch", "medium", "Reply-To domain differs from the sender domain.", [p.reply_to])
    if p.auth_results:
        failed = [m for m in ("spf=fail", "spf=softfail", "dkim=fail", "dmarc=fail") if m in p.auth_results]
        if failed:
            add("auth_failure", "high", "Sender authentication failed (SPF/DKIM/DMARC).", failed)
    risky = [a for a in p.attachments if a.lower().endswith(RISKY_ATTACHMENTS)]
    if risky:
        add("risky_attachment", "high", "Attachment type is commonly used to deliver malware.", risky)
    return out
