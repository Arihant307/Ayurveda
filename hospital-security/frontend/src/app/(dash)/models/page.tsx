"use client";

import { BrainCircuit, Database } from "lucide-react";
import { useState } from "react";
import { EvalSummary } from "@/components/EvalSummary";
import { ConfusionMatrix } from "@/components/charts";
import { Card, ErrorState, Loading, Notice, PageHeader, Pill, cx } from "@/components/ui";
import { ago, dateTime, num, pct } from "@/lib/format";
import type { ModelStatus, MulticlassReport } from "@/lib/types";
import { useApi } from "@/lib/useApi";

interface BinaryMetrics {
  threshold: number; n: number; positives: number; precision: number; recall: number; f1: number;
  false_positive_rate: number; false_negative_rate: number; roc_auc: number | null; pr_auc: number | null; brier: number;
  confusion_matrix: { labels: string[]; matrix: number[][] };
}
interface Report {
  metadata: {
    version: string; trained_at: string; selected_model: string; task: string; datasets: string[]; split: string;
    rows: Record<string, number>; threshold?: number; attack_threshold?: number; threshold_policy: string;
    latency: { mean_ms: number; p95_ms: number; n: number }; limitations: string[];
    metrics: { test: BinaryMetrics | MulticlassReport; validation: unknown };
  };
  all_models: Record<string, { test: BinaryMetrics | MulticlassReport; validation: { pr_auc?: number; macro_f1?: number } }>;
  report_matches_loaded_model: boolean;
}

const isMulti = (m: BinaryMetrics | MulticlassReport): m is MulticlassReport => "macro_f1" in m;

function Comparison({ r }: { r: Report }) {
  const rows = Object.entries(r.all_models);
  const multi = isMulti(rows[0][1].test);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead><tr className="border-b border-line text-left text-xs text-ink-muted">
          <th className="py-2 font-medium">Model</th>
          {multi ? ["Macro F1", "Attack precision", "Attack recall", "Benign FPR", "Attack PR-AUC"].map((h) => <th key={h} className="font-medium">{h}</th>)
            : ["Precision", "Recall", "F1", "FPR", "ROC-AUC", "PR-AUC"].map((h) => <th key={h} className="font-medium">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(([name, m]) => {
            const t = m.test;
            const sel = name === r.metadata.selected_model;
            return (
              <tr key={name} className={cx("border-b border-line-soft", sel && "bg-primary-soft/60 font-medium")}>
                <td className="py-2">{name}{sel && <span className="ml-2"><Pill tone="green">selected</Pill></span>}</td>
                {isMulti(t) ? [t.macro_f1, t.attack_vs_benign.precision, t.attack_vs_benign.recall, t.attack_vs_benign.false_positive_rate, t.attack_vs_benign.pr_auc]
                  .map((v, i) => <td key={i} className="tabular">{pct(v ?? null, i === 3 ? 2 : 1)}</td>)
                  : [t.precision, t.recall, t.f1, t.false_positive_rate, t.roc_auc, t.pr_auc].map((v, i) => <td key={i} className="tabular">{pct(v, i === 3 ? 2 : 1)}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-muted">Selection uses validation data only ({multi ? "macro F1" : "PR-AUC"}); the table shows the untouched test split.</p>
    </div>
  );
}

function ReportView({ name }: { name: string }) {
  const rep = useApi<Report>(`/models/${name}/report`);
  if (rep.loading && !rep.data) return <Loading />;
  if (rep.error) return <ErrorState error={rep.error} />;
  if (!rep.data) return null;
  const md = rep.data.metadata;
  const t = md.metrics.test;
  return (
    <div className="space-y-6">
      {!rep.data.report_matches_loaded_model && <Notice tone="warn">This report belongs to a different version than the loaded model. Re-run training or restart the API.</Notice>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Held-out test performance" subtitle={`${md.selected_model} · threshold ${(md.threshold ?? md.attack_threshold ?? 0).toFixed(4)} (${md.threshold_policy})`}>
          {isMulti(t) ? <EvalSummary e={t} /> : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[["Precision", pct(t.precision)], ["Recall", pct(t.recall)], ["F1", pct(t.f1)], ["False-positive rate", pct(t.false_positive_rate, 2)],
                  ["ROC-AUC", pct(t.roc_auc)], ["PR-AUC", pct(t.pr_auc)], ["False-negative rate", pct(t.false_negative_rate, 2)], ["Brier score", t.brier.toFixed(4)]].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-canvas p-3"><p className="text-xs text-ink-muted">{k}</p><p className="tabular text-lg font-semibold text-ink">{v}</p></div>
                ))}
              </div>
              <ConfusionMatrix labels={["legitimate", "malicious"]} matrix={t.confusion_matrix.matrix} />
            </div>
          )}
        </Card>
        <Card title="Provenance" action={<Database aria-hidden className="h-5 w-5 text-primary" />}>
          <dl className="space-y-2.5 text-sm">
            <div><dt className="text-xs text-ink-muted">Version</dt><dd className="font-mono text-ink">{md.version}</dd></div>
            <div><dt className="text-xs text-ink-muted">Trained</dt><dd className="text-ink">{dateTime(md.trained_at)}</dd></div>
            <div><dt className="text-xs text-ink-muted">Task</dt><dd className="text-ink">{md.task}</dd></div>
            <div><dt className="text-xs text-ink-muted">Datasets</dt><dd className="text-ink">{md.datasets.join("; ")}</dd></div>
            <div><dt className="text-xs text-ink-muted">Split</dt><dd className="text-ink">{md.split}</dd></div>
            <div><dt className="text-xs text-ink-muted">Rows</dt><dd className="text-ink">{Object.entries(md.rows).map(([k, v]) => `${k} ${num(v)}`).join(" · ")}</dd></div>
            <div><dt className="text-xs text-ink-muted">Inference latency</dt><dd className="text-ink">mean {md.latency.mean_ms.toFixed(2)} ms · p95 {md.latency.p95_ms.toFixed(2)} ms (n={md.latency.n})</dd></div>
          </dl>
        </Card>
      </div>
      <Card title="Model comparison"><Comparison r={rep.data} /></Card>
      <Card title="Limitations">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-soft">{md.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </Card>
    </div>
  );
}

export default function ModelsPage() {
  const st = useApi<{ models: ModelStatus[]; rulesets: { name: string; version: string; note?: string }[] }>("/models/status");
  const [sel, setSel] = useState("email_classifier");
  return (
    <div>
      <PageHeader title="Model performance" description="Every number on this page is read from the evaluation report written by the training run on held-out data." />
      {st.error && <ErrorState error={st.error} />}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {st.data?.models.map((m) => (
          <button key={m.name} onClick={() => setSel(m.name)} aria-pressed={sel === m.name}
            className={cx("rounded-2xl border bg-card p-4 text-left shadow-card", sel === m.name ? "border-primary ring-2 ring-primary/20" : "border-line hover:border-secondary")}>
            <div className="flex items-center justify-between"><BrainCircuit aria-hidden className="h-5 w-5 text-primary" />{m.ready ? <Pill tone="green">loaded</Pill> : <Pill tone="bad">unavailable</Pill>}</div>
            <p className="mt-2 font-semibold text-ink">{m.name}</p>
            <p className="text-xs text-ink-muted">{m.selected_model ?? m.error}</p>
            <p className="mt-1 text-xs text-ink-muted">{num(m.inferences)} live inferences · last {ago(m.last_inference_at)}</p>
          </button>
        ))}
      </div>
      {st.data?.rulesets && (
        <div className="mb-6"><Notice>Rule sets: {st.data.rulesets.map((r) => `${r.name} ${r.version}`).join(", ")}. {st.data.rulesets.find((r) => r.note)?.note}</Notice></div>
      )}
      <ReportView key={sel} name={sel} />
    </div>
  );
}
