"""Lexical URL feature extraction.

Only the URL string is inspected: nothing here resolves DNS, opens a socket or
fetches the page, so a malicious URL is never visited.

The scheme (http/https) and a leading ``www.`` are dropped during
normalisation. In the training corpus (Sahingoz et al., 2019) many phishing
entries are bare host names while every legitimate entry carries a scheme, so
keeping either would let a model learn how the lists were collected rather than
what makes a URL dangerous.
"""

from __future__ import annotations

import ipaddress
import math
import re
from collections import Counter
from dataclasses import dataclass
from urllib.parse import urlsplit, unquote

import tldextract

# Offline extractor: uses the public-suffix snapshot bundled with tldextract.
_TLD = tldextract.TLDExtract(suffix_list_urls=())

SUSPICIOUS_TOKENS = (
    "login", "log-in", "signin", "sign-in", "verify", "verification", "secure", "account",
    "update", "confirm", "banking", "password", "passwd", "webscr", "ebayisapi", "wp-admin",
    "wp-includes", "wp-content", "billing", "invoice", "unlock", "suspend", "recover", "validate",
    "authenticate", "session", "token", "credential", "support", "alert", "payment", "wallet",
    "office365", "outlook", "webmail", "mailbox", "dropbox", "docusign", "sharepoint", "onedrive",
)
BRANDS = (
    "paypal", "apple", "icloud", "microsoft", "office", "outlook", "google", "gmail", "amazon",
    "netflix", "facebook", "instagram", "whatsapp", "ebay", "chase", "wellsfargo", "bankofamerica",
    "citibank", "hsbc", "santander", "dropbox", "docusign", "adobe", "linkedin", "twitter",
    "yahoo", "dhl", "fedex", "ups", "usps", "irs", "steam", "blockchain", "coinbase", "binance",
    "epic", "cerner", "medicare", "medicaid",
)
SHORTENERS = {
    "bit.ly", "goo.gl", "tinyurl.com", "t.co", "ow.ly", "is.gd", "buff.ly", "adf.ly", "bit.do",
    "cutt.ly", "shorturl.at", "rebrand.ly", "tiny.cc", "lnkd.in", "rb.gy", "v.gd", "x.co", "s.id",
}
# TLDs heavily over-represented in abuse reports (Spamhaus / Interisle reports).
SUSPICIOUS_TLDS = {
    "tk", "ml", "ga", "cf", "gq", "xyz", "top", "work", "click", "link", "loan", "zip", "review",
    "country", "kim", "science", "party", "gdn", "men", "date", "racing", "win", "bid", "stream",
    "download", "online", "site", "website", "space", "info", "ru", "cn", "su", "buzz", "rest",
}
RISKY_EXTENSIONS = (".exe", ".scr", ".zip", ".rar", ".js", ".vbs", ".bat", ".apk", ".msi", ".iso", ".jar", ".hta")

_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://")
_HEX_RE = re.compile(r"%[0-9a-fA-F]{2}")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_TOKEN_SPLIT = re.compile(r"[/.\-_?=&:@~+%#]+")

FEATURE_NAMES: list[str] = [
    "url_length", "host_length", "path_length", "query_length", "num_subdomains", "num_dots",
    "num_hyphens", "num_underscores", "num_slashes", "num_digits", "digit_ratio", "num_special",
    "has_at", "has_ip_host", "has_port", "has_double_slash_path", "num_params", "num_hex_escapes",
    "host_entropy", "url_entropy", "suspicious_tld", "is_shortener", "num_suspicious_tokens",
    "brand_in_subdomain_or_path", "brand_in_domain_not_registered", "has_punycode", "path_depth",
    "longest_token", "host_digit_count", "host_hyphen_count", "risky_extension", "php_in_path",
    "email_in_url", "vowel_ratio_host", "has_path", "has_query",
]


@dataclass(frozen=True)
class ParsedUrl:
    normalized: str
    host: str
    path: str
    query: str
    port: int | None
    subdomain: str
    domain: str
    suffix: str

    @property
    def registered_domain(self) -> str:
        if self.domain and self.suffix:
            return f"{self.domain}.{self.suffix}"
        return self.host


def normalize_url(raw: str) -> str:
    url = raw.strip().strip('"').strip("'")
    url = _SCHEME_RE.sub("", url)
    # Lower-case the authority only; paths are case sensitive.
    slash = url.find("/")
    host_part, rest = (url, "") if slash == -1 else (url[:slash], url[slash:])
    host_part = host_part.lower()
    if host_part.startswith("www."):
        host_part = host_part[4:]
    rest = rest.replace("&amp;", "&")
    if rest == "/":
        rest = ""
    return host_part + rest


def parse_url(raw: str) -> ParsedUrl:
    norm = normalize_url(raw)
    parts = urlsplit("//" + norm)
    host = (parts.hostname or "").strip(".")
    try:
        port = parts.port
    except ValueError:
        port = None
    ext = _TLD(host)
    return ParsedUrl(
        normalized=norm, host=host, path=parts.path, query=parts.query, port=port,
        subdomain=ext.subdomain, domain=ext.domain, suffix=ext.suffix,
    )


def _entropy(s: str) -> float:
    if not s:
        return 0.0
    counts = Counter(s)
    n = len(s)
    return -sum(c / n * math.log2(c / n) for c in counts.values())


def _is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host.strip("[]"))
        return True
    except ValueError:
        pass
    # Hex / integer encoded IPv4 such as 0x7f000001 or 3232235777.
    return bool(re.fullmatch(r"(0x[0-9a-f]+|\d{8,10})", host))


def extract_features(raw: str) -> dict[str, float]:
    p = parse_url(raw)
    url = p.normalized
    lower = unquote(url).lower()
    tokens = [t for t in _TOKEN_SPLIT.split(lower) if t]
    host_tokens = set(_TOKEN_SPLIT.split(p.subdomain.lower())) | set(_TOKEN_SPLIT.split(p.path.lower()))
    vowels = sum(ch in "aeiou" for ch in p.host)
    letters = sum(ch.isalpha() for ch in p.host) or 1
    digits = sum(ch.isdigit() for ch in url)
    path_lower = p.path.lower()
    registered = p.domain.lower()
    return {
        "url_length": len(url),
        "host_length": len(p.host),
        "path_length": len(p.path),
        "query_length": len(p.query),
        "num_subdomains": len([s for s in p.subdomain.split(".") if s]),
        "num_dots": url.count("."),
        "num_hyphens": url.count("-"),
        "num_underscores": url.count("_"),
        "num_slashes": url.count("/"),
        "num_digits": digits,
        "digit_ratio": digits / max(len(url), 1),
        "num_special": sum(url.count(c) for c in "@~%&=?+!*$,;"),
        "has_at": float("@" in url),
        "has_ip_host": float(_is_ip(p.host)),
        "has_port": float(p.port is not None),
        "has_double_slash_path": float("//" in p.path),
        "num_params": len([q for q in p.query.split("&") if q]),
        "num_hex_escapes": len(_HEX_RE.findall(url)),
        "host_entropy": _entropy(p.host),
        "url_entropy": _entropy(url),
        "suspicious_tld": float(p.suffix.split(".")[-1] in SUSPICIOUS_TLDS if p.suffix else 0),
        "is_shortener": float(p.registered_domain in SHORTENERS),
        "num_suspicious_tokens": sum(tok in lower for tok in SUSPICIOUS_TOKENS),
        "brand_in_subdomain_or_path": float(any(b in t for t in host_tokens for b in BRANDS if len(t) >= 3)),
        "brand_in_domain_not_registered": float(
            any(b in registered and registered != b for b in BRANDS if len(b) >= 4)
        ),
        "has_punycode": float("xn--" in p.host),
        "path_depth": len([s for s in p.path.split("/") if s]),
        "longest_token": max((len(t) for t in tokens), default=0),
        "host_digit_count": sum(ch.isdigit() for ch in p.host),
        "host_hyphen_count": p.host.count("-"),
        "risky_extension": float(path_lower.endswith(RISKY_EXTENSIONS)),
        "php_in_path": float(".php" in path_lower),
        "email_in_url": float(bool(_EMAIL_RE.search(lower))),
        "vowel_ratio_host": vowels / letters,
        "has_path": float(len(p.path) > 1),
        "has_query": float(bool(p.query)),
    }


def feature_vector(raw: str) -> list[float]:
    feats = extract_features(raw)
    return [float(feats[name]) for name in FEATURE_NAMES]


def explain_url(raw: str) -> list[dict[str, str]]:
    """Human-readable rule-based indicators, independent of the ML score."""
    p = parse_url(raw)
    f = extract_features(raw)
    reasons: list[dict[str, str]] = []

    def add(code: str, severity: str, text: str) -> None:
        reasons.append({"code": code, "severity": severity, "description": text})

    if f["has_ip_host"]:
        add("ip_host", "high", f"Host is a raw IP address ({p.host}) instead of a domain name.")
    if f["has_at"]:
        add("at_symbol", "high", "URL contains '@', which can hide the real destination host.")
    if f["has_punycode"]:
        add("punycode", "high", "Host uses punycode (xn--), a common look-alike domain technique.")
    if f["brand_in_domain_not_registered"]:
        add("brand_lookalike", "high", f"Registered domain '{p.registered_domain}' embeds a well-known brand name.")
    elif f["brand_in_subdomain_or_path"]:
        add("brand_in_path", "medium", f"A brand name appears in the subdomain or path but the site is '{p.registered_domain}'.")
    if f["num_suspicious_tokens"]:
        hits = [t for t in SUSPICIOUS_TOKENS if t in unquote(p.normalized).lower()]
        add("suspicious_tokens", "medium", "Credential/urgency keywords in URL: " + ", ".join(hits[:6]) + ".")
    if f["suspicious_tld"]:
        add("suspicious_tld", "medium", f"Top-level domain '.{p.suffix}' is frequently abused.")
    if f["is_shortener"]:
        add("shortener", "medium", "URL shortener hides the final destination.")
    if f["num_subdomains"] >= 3:
        add("many_subdomains", "medium", f"{int(f['num_subdomains'])} subdomain levels.")
    if f["url_length"] > 100:
        add("long_url", "low", f"Unusually long URL ({int(f['url_length'])} characters).")
    if f["has_port"]:
        add("explicit_port", "low", f"Explicit port {p.port} in URL.")
    if f["email_in_url"]:
        add("email_in_url", "medium", "An e-mail address is embedded in the URL (typical of targeted phishing kits).")
    if f["risky_extension"]:
        add("risky_download", "high", "URL points to an executable or archive download.")
    if f["num_hex_escapes"] >= 3:
        add("obfuscation", "low", "Heavy percent-encoding may be obfuscating the URL.")
    if f["host_entropy"] > 4.0 and f["host_length"] > 20:
        add("random_host", "low", "Host name looks randomly generated (high character entropy).")
    return reasons
