"""Download the public datasets used for training.

    python -m ml.data.download --all            # everything that is reachable
    python -m ml.data.download cic2018 enron sahingoz
    python -m ml.data.download spamassassin     # optional, official Apache host

Files land in ml/data/raw/<dataset>/ (git-ignored). A SHA-256 manifest is written
to ml/data/raw/manifest.json so a training run can be tied to exact inputs.
Each source is tried independently: an unreachable host is reported and skipped,
it never stops the other downloads.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tarfile
import time
import urllib.error
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent / "raw"

CIC_BUCKET = "https://cse-cic-ids2018.s3.ca-central-1.amazonaws.com/Processed%20Traffic%20Data%20for%20ML%20Algorithms/"
# Thuesday-20-02-2018 (4 GB, DDoS-LOIC-HTTP) and Thursday-01-03 (Infiltration) are
# left out to keep the download near 2.7 GB; add them here to train on them too.
CIC_FILES = [
    "Wednesday-14-02-2018_TrafficForML_CICFlowMeter.csv",  # FTP / SSH brute force
    "Thursday-15-02-2018_TrafficForML_CICFlowMeter.csv",   # DoS GoldenEye, Slowloris
    "Friday-16-02-2018_TrafficForML_CICFlowMeter.csv",     # DoS SlowHTTPTest, Hulk
    "Wednesday-21-02-2018_TrafficForML_CICFlowMeter.csv",  # DDoS LOIC-UDP, HOIC
    "Thursday-22-02-2018_TrafficForML_CICFlowMeter.csv",   # Web brute force, XSS, SQLi
    "Friday-23-02-2018_TrafficForML_CICFlowMeter.csv",     # Web brute force, XSS, SQLi
    "Wednesday-28-02-2018_TrafficForML_CICFlowMeter.csv",  # Infiltration
    "Friday-02-03-2018_TrafficForML_CICFlowMeter.csv",     # Botnet (Ares)
]

SOURCES: dict[str, list[tuple[str, str]]] = {
    "cic2018": [(CIC_BUCKET + f, f"cic_ids2018/{f}") for f in CIC_FILES],
    # Enron-Spam (Metsis et al., 2006) as one CSV, built by github.com/MWiechmann/enron_spam_data
    # from the official AUEB 'preprocessed' archives. GPL-3.0 (the CSV repository).
    "enron": [("https://github.com/MWiechmann/enron_spam_data/raw/master/enron_spam_data.zip",
               "enron_spam/enron_spam_data.zip")],
    # Sahingoz et al. (2019) phishing URL dataset, published by the authors at github.com/ebubekirbbr/pdd.
    "sahingoz": [
        ("https://raw.githubusercontent.com/ebubekirbbr/pdd/90b394d8f9fb5d5dc48400e8bf46b001ce42999f/input/data_phishing_37175.json",
         "sahingoz_urls/data_phishing_37175.json"),
        ("https://raw.githubusercontent.com/ebubekirbbr/pdd/90b394d8f9fb5d5dc48400e8bf46b001ce42999f/input/data_legitimate_36400.json",
         "sahingoz_urls/data_legitimate_36400.json"),
    ],
    # Apache SpamAssassin public corpus (official host). Optional: the trainer uses it when present.
    "spamassassin": [
        (f"https://spamassassin.apache.org/old/publiccorpus/{name}", f"spamassassin/{name}")
        for name in ("20030228_easy_ham.tar.bz2", "20030228_easy_ham_2.tar.bz2", "20030228_hard_ham.tar.bz2",
                     "20030228_spam.tar.bz2", "20050311_spam_2.tar.bz2")
    ],
}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def fetch(url: str, dest: Path, retries: int = 3, timeout: float = 60.0) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        print(f"  exists  {dest.relative_to(RAW)}")
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "hospital-security-dataset-fetch/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp, tmp.open("wb") as out:
                while chunk := resp.read(1 << 20):
                    out.write(chunk)
            tmp.rename(dest)
            print(f"  fetched {dest.relative_to(RAW)} ({dest.stat().st_size / 1e6:.1f} MB)")
            return True
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            print(f"  attempt {attempt}/{retries} failed for {url}: {exc}", file=sys.stderr)
            time.sleep(2 ** attempt)
    tmp.unlink(missing_ok=True)
    return False


def _unpack_spamassassin() -> None:
    for archive in (RAW / "spamassassin").glob("*.tar.bz2"):
        target = RAW / "spamassassin" / archive.name.removesuffix(".tar.bz2")
        if not target.exists():
            with tarfile.open(archive) as tar:
                tar.extractall(target, filter="data")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("datasets", nargs="*", help=f"any of: {', '.join(SOURCES)}")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args(argv)
    names = list(SOURCES) if args.all or not args.datasets else args.datasets
    unknown = set(names) - set(SOURCES)
    if unknown:
        ap.error(f"unknown dataset(s): {', '.join(sorted(unknown))}")
    failed: list[str] = []
    for name in names:
        print(f"[{name}]")
        ok = all([fetch(url, RAW / rel) for url, rel in SOURCES[name]])
        if not ok:
            failed.append(name)
        elif name == "spamassassin":
            _unpack_spamassassin()
    manifest = {
        str(p.relative_to(RAW)): {"bytes": p.stat().st_size, "sha256": _sha256(p)}
        for p in sorted(RAW.rglob("*")) if p.is_file() and p.suffix in {".csv", ".json", ".zip", ".bz2"}
    }
    (RAW / "manifest.json").write_text(json.dumps(manifest, indent=2))
    if failed:
        print(f"Unavailable: {', '.join(failed)} (see errors above). Training uses whatever is present.")
    return 1 if failed and set(failed) == set(names) else 0


if __name__ == "__main__":
    raise SystemExit(main())
