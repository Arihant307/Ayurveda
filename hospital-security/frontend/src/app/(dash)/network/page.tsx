"use client";

import { FileSpreadsheet, Network, Radio } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useShell } from "@/components/AppShell";
import { categoryColor, HBar } from "@/components/charts";
import { EvalSummary } from "@/components/EvalSummary";
import { Button, Card, EmptyState, ErrorState, Loading, Notice, PageHeader, Pill, Stat } from "@/components/ui";
import { post } from "@/lib/api";
import { ago, num } from "@/lib/format";
import type { BatchResult, Freshness, MulticlassReport } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function NetworkPage() {
  const { user } = useShell();
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const report = useApi<{ metadata: { metrics: { test: MulticlassReport }; version: string; selected_model: string } }>("/models/network_cic/report");
  const tel = useApi<Freshness>("/telemetry/status");

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    setError(null);
    try {
      setRes(await post<BatchResult>("/analyze/network/batch", fd));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRes(null);
    } finally {
      setBusy(false);
    }
  };

  const netTailers = tel.data?.tailers.filter((t) => t.kind === "zeek" || t.kind === "suricata") ?? [];
  const pushed = tel.data?.received_by_source.filter((s) => s.source === "zeek" || s.source === "suricata") ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Network intrusion analysis" description="Flow classification with models trained on CSE-CIC-IDS2018: CSV batch analysis and live Zeek/Suricata telemetry." />

      <Card title="Live telemetry" subtitle="Zeek conn/dns/http/ssh/ssl logs and Suricata EVE events"
        action={<Radio aria-hidden className="h-5 w-5 text-primary" />}>
        {tel.loading && !tel.data && <Loading />}
        {tel.error && <ErrorState error={tel.error} />}
        {tel.data && (netTailers.length || pushed.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {netTailers.map((t) => (
              <div key={t.name} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex items-center justify-between"><span className="font-medium text-ink">{t.name}</span>
                  <Pill tone={t.status === "connected" && !t.stale ? "green" : t.status === "error" ? "bad" : "warn"}>{t.stale ? "stale" : t.status.replace(/_/g, " ")}</Pill></div>
                <p className="mt-1 truncate font-mono text-xs text-ink-muted" title={t.path}>{t.path}</p>
                <p className="mt-1 text-xs text-ink-soft">{num(t.events_total)} events · {num(t.duplicates_total)} duplicates skipped · {num(t.errors_total)} errors · last event {ago(t.last_event_at)}</p>
                {t.last_error && <p className="mt-1 text-xs text-[#a65410]">{t.last_error}</p>}
              </div>
            ))}
            {pushed.map((s) => (
              <div key={s.source} className="rounded-xl border border-line p-3 text-sm">
                <span className="font-medium text-ink capitalize">{s.source} (push API)</span>
                <p className="mt-1 text-xs text-ink-soft">{num(s.events)} events · last received {ago(s.last_received_at)}</p>
              </div>
            ))}
          </div>
        ) : (
          <Notice tone="warn">No network telemetry is connected. Set <code>SURICATA_EVE_PATH</code> or <code>ZEEK_LOG_DIR</code> on the backend, or push events to <code>/api/v1/ingest/suricata</code> / <code>/zeek</code> with a sensor API key. Only monitor networks you are authorised to monitor.</Notice>
        ))}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2" title="Batch CSV analysis" subtitle="CICFlowMeter export (CSE-CIC-IDS2018 columns) or the 12-column portable schema. An optional Label column enables evaluation.">
          <form onSubmit={submit} className="space-y-3">
            <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Flow CSV file"
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-primary-strong" />
            <Button type="submit" loading={busy} disabled={!file || user.role === "viewer"}><FileSpreadsheet aria-hidden className="h-4 w-4" /> Validate & analyse</Button>
            <p className="text-xs text-ink-muted">Limits: 50 MB, 200,000 rows. Rows with missing or non-numeric values are rejected and counted.</p>
          </form>
          {error && <div className="mt-4"><ErrorState error={error} /></div>}
        </Card>
        <Card className="xl:col-span-3" title="Detection results" subtitle={res ? `${res.model_name} v${res.model_version} · ${res.feature_set} features · ${res.duration_ms.toFixed(0)} ms` : undefined}>
          {!res ? <EmptyState icon={Network} title="No file analysed yet">Results, the attack-category distribution and (with labels) a confusion matrix appear here.</EmptyState> : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Rows analysed" value={num(res.rows_analyzed)} />
                <Stat label="Rejected" value={num(res.rows_rejected)} />
                <Stat label="Flagged as attack" tone="high" value={num(res.rows_analyzed - (res.category_counts.benign ?? 0))} />
                <Stat label="Alerts created" tone="critical" value={num(res.alerts_created.length)} />
              </div>
              {res.rejected_examples.length > 0 && <Notice tone="warn">{res.rejected_examples.join("; ")}</Notice>}
              <HBar data={Object.entries(res.category_counts).map(([key, value]) => ({ key, value }))} colorFor={categoryColor} unit="flows" />
              {res.alerts_created.length > 0 && <p className="text-sm text-ink-soft">One aggregated alert per detected category was created. <Link href="/threats" className="font-medium text-primary underline">Review alerts</Link>.</p>}
            </div>
          )}
        </Card>
      </div>

      {res?.evaluation && (
        <Card title="Evaluation against the file's labels" subtitle={`${num(res.evaluation.rows_with_known_labels ?? res.evaluation.n)} labelled rows`}>
          <EvalSummary e={res.evaluation} />
        </Card>
      )}

      <Card title="Deployed model: held-out test evaluation" subtitle={report.data ? `network_cic v${report.data.metadata.version} · ${report.data.metadata.selected_model} · time-ordered split, generated by the training run` : undefined}>
        {report.error && <ErrorState error={report.error} />}
        {report.loading && !report.data && <Loading />}
        {report.data && <EvalSummary e={report.data.metadata.metrics.test} />}
      </Card>
    </div>
  );
}
