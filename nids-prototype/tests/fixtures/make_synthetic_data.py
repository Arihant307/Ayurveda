"""Generate a small SYNTHETIC dataset in the CIC-IDS2017 MachineLearningCSV format.

    python tests/fixtures/make_synthetic_data.py

!!! SYNTHETIC — NOT REAL RESULTS !!!
These files only exist to prove the pipeline runs end to end before the real
dataset is available. The values are random numbers drawn from made-up
distributions; any metric computed from them means nothing about real
intrusion detection.

The files copy the quirks of the real CSVs so the cleaning code is exercised:
  * column names with leading spaces and the duplicated "Fwd Header Length"
  * inf / NaN in "Flow Bytes/s" and "Flow Packets/s" for zero-duration flows
  * columns that are always zero (constant features)
  * exact duplicate rows
  * empty lines at the end of a file
  * the web-attack file is cp1252-encoded with an en-dash in its labels
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

OUT_DIR = Path(__file__).resolve().parent / "raw"
SEED = 7

# Header exactly as in the real files (note the leading spaces).
HEADER = [
    " Destination Port", " Flow Duration", " Total Fwd Packets", " Total Backward Packets",
    "Total Length of Fwd Packets", " Total Length of Bwd Packets", " Fwd Packet Length Max",
    " Fwd Packet Length Min", " Fwd Packet Length Mean", " Fwd Packet Length Std",
    "Bwd Packet Length Max", " Bwd Packet Length Min", " Bwd Packet Length Mean",
    " Bwd Packet Length Std", "Flow Bytes/s", " Flow Packets/s", " Flow IAT Mean", " Flow IAT Std",
    " Flow IAT Max", " Flow IAT Min", "Fwd IAT Total", " Fwd IAT Mean", " Fwd IAT Std", " Fwd IAT Max",
    " Fwd IAT Min", "Bwd IAT Total", " Bwd IAT Mean", " Bwd IAT Std", " Bwd IAT Max", " Bwd IAT Min",
    "Fwd PSH Flags", " Bwd PSH Flags", " Fwd URG Flags", " Bwd URG Flags", " Fwd Header Length",
    " Bwd Header Length", "Fwd Packets/s", " Bwd Packets/s", " Min Packet Length",
    " Max Packet Length", " Packet Length Mean", " Packet Length Std", " Packet Length Variance",
    "FIN Flag Count", " SYN Flag Count", " RST Flag Count", " PSH Flag Count", " ACK Flag Count",
    " URG Flag Count", " CWE Flag Count", " ECE Flag Count", " Down/Up Ratio", " Average Packet Size",
    " Avg Fwd Segment Size", " Avg Bwd Segment Size", " Fwd Header Length", "Fwd Avg Bytes/Bulk",
    " Fwd Avg Packets/Bulk", " Fwd Avg Bulk Rate", " Bwd Avg Bytes/Bulk", " Bwd Avg Packets/Bulk",
    "Bwd Avg Bulk Rate", "Subflow Fwd Packets", " Subflow Fwd Bytes", " Subflow Bwd Packets",
    " Subflow Bwd Bytes", "Init_Win_bytes_forward", " Init_Win_bytes_backward", " act_data_pkt_fwd",
    " min_seg_size_forward", "Active Mean", " Active Std", " Active Max", " Active Min", "Idle Mean",
    " Idle Std", " Idle Max", " Idle Min", " Label",
]

# Made-up behaviour profiles. "Bot" is deliberately similar to BENIGN so the
# per-attack table has something to show.
PROFILES = {
    "BENIGN":      dict(ports=[80, 443, 53, 22, 8080], dur=(11.0, 2.5), fwd=6, bwd=6, fsz=(250, 120),
                        bsz=(600, 300), syn=0.3, fin=0.4, psh=0.5, win=[8192, 29200, 65535, -1]),
    "DoS Hulk":    dict(ports=[80], dur=(9.0, 1.5), fwd=4, bwd=3, fsz=(350, 60), bsz=(1500, 400),
                        syn=0.1, fin=0.1, psh=0.9, win=[29200, 251]),
    "PortScan":    dict(ports=list(range(1, 1024)), dur=(3.5, 1.0), fwd=1, bwd=1, fsz=(2, 2), bsz=(4, 3),
                        syn=0.9, fin=0.0, psh=0.0, win=[1024, 29200]),
    "DDoS":        dict(ports=[80], dur=(13.0, 1.5), fwd=3, bwd=4, fsz=(20, 15), bsz=(2500, 800),
                        syn=0.2, fin=0.6, psh=0.4, win=[8192, 256]),
    "FTP-Patator": dict(ports=[21], dur=(14.0, 1.0), fwd=9, bwd=13, fsz=(12, 3), bsz=(18, 4),
                        syn=0.0, fin=0.8, psh=0.9, win=[29200]),
    "Bot":         dict(ports=[8080, 80, 443], dur=(11.5, 2.5), fwd=5, bwd=5, fsz=(230, 120),
                        bsz=(500, 300), syn=0.3, fin=0.4, psh=0.6, win=[8192, 65535]),
    "Web Attack – Brute Force": dict(ports=[80], dur=(15.0, 1.2), fwd=4, bwd=3, fsz=(50, 25),
                                          bsz=(300, 120), syn=0.0, fin=0.5, psh=0.7, win=[29200]),
}

# Two "days", like the real per-day files.
FILES = {
    "SYNTHETIC_Monday-WorkingHours.pcap_ISCX.csv":
        {"BENIGN": 950, "DoS Hulk": 400, "PortScan": 300, "DDoS": 200},
    "SYNTHETIC_Thursday-WorkingHours-WebAttacks.pcap_ISCX.csv":
        {"BENIGN": 950, "FTP-Patator": 90, "Bot": 70, "Web Attack – Brute Force": 40},
}


def make_flows(label: str, n: int, rng: np.random.Generator) -> pd.DataFrame:
    """Create ``n`` synthetic flows following ``PROFILES[label]``."""
    p = PROFILES[label]
    dur = rng.lognormal(*p["dur"], n).round()
    dur[rng.random(n) < 0.02] = 0  # zero-duration flows -> inf/NaN rates, like the real data
    nf = 1 + rng.poisson(p["fwd"], n)
    nb = rng.poisson(p["bwd"], n)
    fmean = np.clip(rng.normal(*p["fsz"], n), 0, None)
    bmean = np.where(nb > 0, np.clip(rng.normal(*p["bsz"], n), 0, None), 0)
    fstd, bstd = fmean * rng.uniform(0, 0.5, n), bmean * rng.uniform(0, 0.5, n)
    ftot, btot = nf * fmean, nb * bmean
    npk = nf + nb
    with np.errstate(divide="ignore", invalid="ignore"):
        bytes_s = (ftot + btot) / dur * 1e6
        pkts_s = npk / dur * 1e6
        fwd_s, bwd_s = nf / dur * 1e6, nb / dur * 1e6
    bytes_s[(dur == 0) & (rng.random(n) < 0.4)] = np.nan  # some 0/0 cases become NaN
    iat = dur / np.maximum(npk - 1, 1)
    iat_std = iat * rng.uniform(0, 1, n)
    pk_mean = (ftot + btot) / npk
    pk_std = (fstd + bstd) / 2
    flag = lambda prob: (rng.random(n) < prob).astype(int)  # noqa: E731
    active = np.where(rng.random(n) < 0.3, rng.lognormal(10, 1, n), 0).round()
    idle = np.where(active > 0, rng.lognormal(15, 1, n), 0).round()
    zeros = np.zeros(n, dtype=int)
    fhdr = nf * 32

    cols = [
        rng.choice(p["ports"], n), dur, nf, nb, ftot.round(), btot.round(), (fmean + 2 * fstd).round(),
        np.clip(fmean - 2 * fstd, 0, None).round(), fmean, fstd, (bmean + 2 * bstd).round(),
        np.clip(bmean - 2 * bstd, 0, None).round(), bmean, bstd, bytes_s, pkts_s, iat, iat_std,
        iat * 3, iat * 0.1, dur, dur / nf, iat_std, dur * 0.8, iat * 0.05,
        np.where(nb > 0, dur, 0), np.where(nb > 0, dur / np.maximum(nb, 1), 0), iat_std * 0.9,
        dur * 0.7, iat * 0.02, flag(p["psh"] * 0.3), zeros, zeros, zeros, fhdr, nb * 32, fwd_s, bwd_s,
        np.minimum(np.clip(fmean - 2 * fstd, 0, None), bmean).round(),
        np.maximum(fmean + 2 * fstd, bmean + 2 * bstd).round(), pk_mean, pk_std, pk_std ** 2,
        flag(p["fin"]), flag(p["syn"]), flag(0.02), flag(p["psh"]), flag(0.7), flag(0.05), zeros,
        flag(0.01), (nb / nf).round(), pk_mean * npk / np.maximum(npk - 1, 1), fmean, bmean, fhdr,
        zeros, zeros, zeros, zeros, zeros, zeros, nf, ftot.round(), nb, btot.round(),
        rng.choice(p["win"], n), rng.choice([-1, 0, 229, 65535], n), np.maximum(nf - 1, 0),
        rng.choice([20, 32], n), active, active * 0.1, active * 1.2, active * 0.8, idle, idle * 0.05,
        idle * 1.1, idle * 0.9, [label] * n,
    ]
    df = pd.DataFrame(dict(zip(range(len(HEADER)), cols)))
    df.columns = HEADER  # set afterwards: HEADER contains a duplicated name
    return df


def main() -> None:
    rng = np.random.default_rng(SEED)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for i, (fname, counts) in enumerate(FILES.items()):
        df = pd.concat([make_flows(lbl, n, rng) for lbl, n in counts.items()], ignore_index=True)
        df = df.sample(frac=1, random_state=SEED).reset_index(drop=True)
        dup = df.sample(n=30, random_state=SEED + i)              # exact duplicates
        df = pd.concat([df, dup], ignore_index=True)
        df = df.round(3)  # keeps the file small; text columns are left untouched
        path = OUT_DIR / fname
        # The real web-attack file is not valid UTF-8 because of the en-dash.
        encoding = "cp1252" if "WebAttacks" in fname else "utf-8"
        df.to_csv(path, index=False, encoding=encoding)
        with open(path, "a", encoding=encoding) as f:          # trailing empty lines
            f.write(("," * (len(HEADER) - 1) + "\n") * 5)
        print(f"Wrote {path.name}: {len(df)} rows (+5 empty lines)  [SYNTHETIC — NOT REAL DATA]")


if __name__ == "__main__":
    main()
