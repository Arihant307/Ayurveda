# A Deep Learning-Based Framework for Network Intrusion Detection

B.Tech (CSE – Data Science) project prototype.

The system classifies network flows from the **CIC-IDS2017** dataset as **Normal (0)** or
**Malicious (1)** using a **Multi-Layer Perceptron (MLP)** built with TensorFlow/Keras. It compares the MLP
with two baselines: **Logistic Regression** and **Random Forest**.

```
CSV flows ─► data_loader ─► preprocess ─► train (LR, RF, MLP) ─► evaluate ─► report + plots
                                                      │
                                                      └─► predict.py / Streamlit demo
```

## Features

- Loads and merges the 8 CIC-IDS2017 *MachineLearningCSV* files. It strips the leading spaces in column
  names and handles the badly encoded web-attack file and its empty trailing rows.
- Binary target (`BENIGN` → 0, every attack → 1). The original attack name is kept so recall can be
  reported per attack type.
- Preprocessing designed to avoid leakage. Every value learned from data (medians, the correlation
  filter, the scaler, class weights, SMOTE) comes from the **training split only**.
- MLP with early stopping on validation loss and class weights. All sizes are set in `config.yaml`.
- Test-set evaluation: accuracy, precision, recall, F1, false positive rate, ROC-AUC, confusion
  matrices, ROC curves, training curves and per-attack recall.
- `predict.py` for new CSV files and a Streamlit demo app.

## Folder structure

```
nids-prototype/
  config.yaml            # paths, seed, split ratios, preprocessing options, hyperparameters
  requirements.txt
  data/raw/              # put the CIC-IDS2017 CSVs here (not committed)
  data/processed/        # saved validation/test splits (created by train)
  src/
    data_loader.py       # load + merge CSVs, clean column names, binary labels, --sample-frac
    preprocess.py        # duplicates, inf/NaN, ID columns, constant cols, split, scaling, imbalance
    features.py          # constant/correlated feature selection, heatmap, feature importance
    models.py            # Keras MLP + Logistic Regression + Random Forest
    train.py             # runs preprocessing, trains and saves all models
    evaluate.py          # test-set metrics, plots, comparison table, report.md
    predict.py           # predict on a new CSV of flows
    utils.py             # config, logging, seeding helpers
  app/streamlit_app.py   # demo UI
  outputs/               # metrics, plots, models, reports (created by the pipeline)
  tests/                 # pytest unit tests (tiny synthetic DataFrames)
    fixtures/            # SYNTHETIC CSVs in the CIC-IDS2017 format + their generator
```

## Setup

Requires Python 3.10 or newer.

```bash
cd nids-prototype
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

## Getting the dataset

1. Go to the CIC-IDS2017 page: <https://www.unb.ca/cic/datasets/ids-2017.html>
2. Use the download link at the bottom of the page. A short form asks for your name and email.
3. In the download area open the `CSVs` folder and download **`MachineLearningCSV.zip`**.
4. Unzip it. The files are usually inside a `MachineLearningCVE/` folder. Copy the 8 CSV files
   **directly** into `data/raw/`. Every `*.csv` in that folder is loaded:

```
data/raw/Monday-WorkingHours.pcap_ISCX.csv
data/raw/Tuesday-WorkingHours.pcap_ISCX.csv
data/raw/Wednesday-workingHours.pcap_ISCX.csv
data/raw/Thursday-WorkingHours-Morning-WebAttacks.pcap_ISCX.csv
data/raw/Thursday-WorkingHours-Afternoon-Infilteration.pcap_ISCX.csv
data/raw/Friday-WorkingHours-Morning.pcap_ISCX.csv
data/raw/Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv
data/raw/Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv
```

If `data/raw/` is empty, the scripts print these instructions and stop.

## How to run each stage

Run all commands from the `nids-prototype/` folder.

| Stage | Command |
|---|---|
| (Optional) data report only | `python -m src.preprocess --config config.yaml --sample-frac 0.1` |
| Train (quick, 10 % of rows) | `python -m src.train --config config.yaml --sample-frac 0.1` |
| Train (full dataset) | `python -m src.train --config config.yaml` |
| Train with SMOTE instead of class weights | `python -m src.train --config config.yaml --sample-frac 0.1 --smote` |
| Evaluate on the test set | `python -m src.evaluate --config config.yaml` |
| Predict on a new CSV | `python -m src.predict --config config.yaml --input path/to/flows.csv [--model mlp\|random_forest\|logistic_regression]` |
| Demo app | `streamlit run app/streamlit_app.py` |
| Unit tests | `python -m pytest` |

`train` always runs preprocessing first, so it is the only command needed before `evaluate`.
`--sample-frac` keeps the same fraction of **every attack type**, so rare attacks are not lost.
The full dataset (~2.8 million rows) needs a few GB of RAM. The Random Forest and SMOTE are the
slowest parts.

### Preprocessing steps (in order)

1. Remove exact duplicate rows.
2. Replace `inf`/`-inf` with NaN, then **drop** those rows (default) or **impute** them with
   training-set medians (`preprocessing.invalid_values`).
3. Drop identifier and leakage-prone columns if present (`Flow ID`, IPs, `Timestamp`, `Source Port`).
   The reason for each is given in `src/preprocess.py`.
4. Drop constant (zero-variance) features.
5. Stratified split: 70 % train, 15 % validation, 15 % test (fixed seed).
6. Optionally drop one feature from each pair with |correlation| > 0.95, computed on train only.
7. Fit `StandardScaler` or `MinMaxScaler` on train only, then transform validation and test.
8. Class weights from the training set (default), or SMOTE applied to the training set only.

The row counts at each step, the class distribution before and after cleaning and the final
feature list are saved to `outputs/data_report.md`.

### What gets produced

| File | Content |
|---|---|
| `outputs/data_report.md/.json` | real counts from every preprocessing step |
| `outputs/metrics.json`, `outputs/model_comparison.csv` | test-set metrics for every model |
| `outputs/per_attack_recall.csv` | recall per original attack type |
| `outputs/report.md` | plain-English summary of the data and results |
| `outputs/plots/*.png` | confusion matrices, ROC curves, MLP loss/accuracy, feature importance, correlation heatmap |
| `outputs/models/` | `scaler.joblib`, `feature_list.json`, `fill_values.json`, `logistic_regression.joblib`, `random_forest.joblib`, `mlp.keras`, `mlp_history.json`, `training_summary.json` |

## Synthetic test data

`tests/fixtures/raw/` contains two small **SYNTHETIC** CSV files made by
`tests/fixtures/make_synthetic_data.py`. They use the CIC-IDS2017 column format, but their values are
random. They exist only to check that the pipeline runs end to end:

```bash
python -m src.train --config config.yaml --data-dir tests/fixtures/raw
python -m src.evaluate --config config.yaml
```

Any file whose name starts with `SYNTHETIC` is detected automatically. Every report, plot and app page
built from it is then marked **"SYNTHETIC — NOT REAL RESULTS"**. Retraining on the real data
overwrites these outputs.

## Results

> _Placeholder: fill this section from `outputs/report.md` after training and evaluating on the real
> CIC-IDS2017 data. Do not copy numbers from a synthetic run._

| Model | Accuracy | Precision | Recall | F1 | FPR | ROC-AUC |
|---|---|---|---|---|---|---|
| Logistic Regression | | | | | | |
| Random Forest | | | | | | |
| MLP (Keras) | | | | | | |

## Reproducibility

The seed in `config.yaml` is applied to Python, NumPy, scikit-learn and TensorFlow, and TensorFlow
op determinism is enabled. Re-running with the same config and data on the same machine should give
the same results.
