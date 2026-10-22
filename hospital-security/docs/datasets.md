# Datasets: sources, licences, availability

Every model in this project was trained and evaluated on the public datasets below. Download them with
`python -m ml.data.download --all`; the script writes a SHA-256 manifest to `ml/data/raw/manifest.json`,
and each model's `metadata.json` records the hashes of the files it was trained on.

## Used for training

| Dataset | Used for | Where it was obtained | Licence / terms | Notes |
|---|---|---|---|---|
| **CSE-CIC-IDS2018** (Canadian Institute for Cybersecurity & Communications Security Establishment) | Network-intrusion models (`network_cic`, `network_portable`) | Official AWS Open Data bucket `s3://cse-cic-ids2018/Processed Traffic Data for ML Algorithms/` (anonymous HTTPS) | Published for research by CIC/UNB; cite Sharafaldin, Lashkari & Ghorbani, ICISSP 2018 | 8 of 10 capture days are used (2.7 GB). The per-day CSVs are truncated at 1,048,575 rows (spreadsheet row limit); Tuesday 20-02 (4 GB, LOIC-HTTP) and Thursday 01-03 are not used, to limit download size. |
| **Enron-Spam** (Metsis, Androutsopoulos & Paliouras, CEAS 2006) | E-mail classifier | CSV build of the official AUEB "preprocessed" archives by [MWiechmann/enron_spam_data](https://github.com/MWiechmann/enron_spam_data) | Research corpus; the CSV repository is GPL-3.0 | The official host (aueb.gr) was not reachable from the build environment. The CSV preserves the six mailbox subsets in order, so the trainer reconstructs them and checks the documented per-subset counts before training. |
| **Phishing URL dataset** (Sahingoz, Buber, Demir & Diri, *Expert Systems with Applications* 117, 2019) | URL classifier | Published by the authors at [ebubekirbbr/pdd](https://github.com/ebubekirbbr/pdd), pinned to commit `90b394d` | No explicit licence in the repository: treat as research use and cite the paper | 37,175 PhishTank phishing URLs and 36,400 legitimate URLs from Yandex search. 51,962 remain after normalisation and de-duplication. |

## Integrated but unavailable in the build environment

| Source | Status | Effect | How to enable |
|---|---|---|---|
| **Apache SpamAssassin public corpus** | `spamassassin.apache.org` was blocked (HTTP 403 from the egress proxy) | The e-mail model was trained on Enron-Spam only | `python -m ml.data.download spamassassin`, then `python -m ml.training.train_email` (the corpus is added to training automatically when present) |
| **URLhaus** (abuse.ch) | Blocked from the build environment; abuse.ch also requires a free Auth-Key | URL scores come from the ML model only; feed status shows `unavailable` / `unauthorized` | Set `URLHAUS_AUTH_KEY`. The feed refreshes every `URLHAUS_REFRESH_MINUTES`, with backoff on 429 and errors |
| **UCI Phishing Websites** | `archive.ics.uci.edu` blocked | Not used. Most of its 30 features also need the page, WHOIS or DNS, which conflicts with "never visit the URL" | — |
| **CIC-IDS2017**, **UNSW-NB15** | `unb.ca` and `research.unsw.edu.au` blocked | Not used; CSE-CIC-IDS2018 was the real alternative | Files can be added under `ml/data/raw/`, but a loader would be needed (different label sets) |

## Data that is *not* used

* No patient data, real or synthetic, is used for training.
* Endpoint/ransomware detection has **no ML model**, because no suitable labelled public Sysmon dataset of
  ransomware behaviour was available. It uses versioned rules validated with synthetic events
  (`tests/test_rules.py`, `scripts/demo_replay.py`). Running ransomware samples to produce data is out of scope.
