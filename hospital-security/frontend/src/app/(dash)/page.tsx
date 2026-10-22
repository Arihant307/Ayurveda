"use client";

import { Activity, AlertOctagon, BrainCircuit, GitMerge, Mail, Radio, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useLive } from "@/components/AppShell";
import { categoryColor, HBar, SeverityTrend } from "@/components/charts";
import { Card, EmptyState, ErrorState, Pill, Skeleton, Stat, cx } from "@/components/ui";
import { ago, MODULE_LABEL, num, pct } from "@/lib/format";
import type { Metrics, ModelStatus } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const WINDOWS = ["24h", "7d", "30d"] as const;

export default function OverviewPage() {
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>("24h");
  const [includeSim, setIncludeSim] = useState(true);
  const m = useApi<Metrics>(`/metrics?window=${window}&include_simulated=${includeSim}`);
  const models = useApi<{ models: ModelStatus[] }>("/models/status");
  useLive((msg) => {
    if (msg.type === "alert.created" || msg.type === "incident.created") m.reload();
  });

  const d = m.data;
  const open = d?.totals.open_by_severity ?? {};
  const emailN = d?.analyses_by_kind.email ?? 0;
  const urlN = d?.analyses_by_kind.url ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Security overview</h1>
          <p className="mt-1 text-sm text-ink-soft">Figures are computed from stored analyses, telemetry events and alerts.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="accent-primary" checked={includeSim} onChange={(e) => setIncludeSim(e.target.checked)} />
            Include simulated data
          </label>
          <div className="inline-flex rounded-xl border border-line bg-card p-1" role="group" aria-label="Time window">
            {WINDOWS.map((w) => (
              <button key={w} onClick={() => setWindow(w)} aria-pressed={window === w}
                className={cx("rounded-lg px-3 py-1 text-sm font-medium", window === w ? "bg-primary text-white" : "text-ink-soft hover:bg-primary-soft")}>
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>

      {m.error && <ErrorState error={m.error} onRetry={m.reload} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d ? (
          <>
            <Stat label="Events analysed" icon={Activity} value={num(d.totals.events_analyzed)}
              sub={`${num(d.totals.analyses)} model analyses · ${num(d.totals.telemetry_events)} telemetry events`} />
            <Stat label="Threat alerts" icon={ShieldAlert} tone="high" value={num(d.totals.alerts)}
              sub={`${num(d.totals.alerts_in_window)} in last ${window} · ${num(d.totals.alert_occurrences)} occurrences`} />
            <Stat label="Open critical / high" icon={AlertOctagon} tone="critical"
              value={<span>{num(open.critical ?? 0)} <span className="text-ink-muted">/</span> {num(open.high ?? 0)}</span>}
              sub={`${num(open.medium ?? 0)} medium · ${num(open.low ?? 0)} low open`} />
            <Stat label="Open incidents" icon={GitMerge} value={num(d.totals.open_incidents)}
              sub={d.totals.simulated_alerts ? `${num(d.totals.simulated_alerts)} alerts are from simulated data` : "Correlated alert groups awaiting review"} />
          </>
        ) : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Detections over time" subtitle={`Alerts created per interval, last ${window}, by severity`}>
          {d ? (d.totals.alerts_in_window ? <SeverityTrend data={d.trend} window={window} /> :
            <EmptyState icon={ShieldCheck} title="No alerts in this window">Submit an e-mail, URL or flow file, or connect telemetry.</EmptyState>)
            : <Skeleton className="h-72" />}
        </Card>
        <Card title="Phishing detection" subtitle="User-submitted and telemetry-derived analyses">
          {d ? (
            <dl className="space-y-4 text-sm">
              {[["E-mails analysed", emailN, d.threats_by_kind.email ?? 0, Mail], ["URLs analysed", urlN, d.threats_by_kind.url ?? 0, Radio]].map(([lab, n, t, Icon]) => {
                const I = Icon as typeof Mail;
                return (
                  <div key={String(lab)} className="flex items-center gap-3">
                    <span className="rounded-lg bg-primary-soft p-2 text-primary"><I aria-hidden className="h-4 w-4" /></span>
                    <div className="flex-1">
                      <dt className="text-ink-soft">{String(lab)}</dt>
                      <dd className="tabular text-lg font-semibold text-ink">{num(Number(n))}</dd>
                    </div>
                    <div className="text-right">
                      <p className="tabular font-semibold text-critical">{num(Number(t))} flagged</p>
                      <p className="text-xs text-ink-muted">{Number(n) ? pct(Number(t) / Number(n)) : "—"}</p>
                    </div>
                  </div>
                );
              })}
              <div className="rounded-xl bg-canvas p-3 text-xs text-ink-soft">
                Analyst feedback:{" "}
                {Object.keys(d.feedback).length ? Object.entries(d.feedback).map(([k, v]) => (
                  <span key={k} className="mr-2">{MODULE_LABEL[k] ?? k}: {v.false_positive ?? 0} FP · {v.false_negative ?? 0} FN</span>
                )) : "no labelled outcomes yet"}
              </div>
            </dl>
          ) : <Skeleton className="h-48" />}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Network intrusion categories" subtitle={`Network alerts in last ${window}`}>
          {d ? (() => {
            const rows = Object.entries(d.alerts_by_category).filter(([k]) =>
              ["brute_force", "web_attack", "dos", "ddos", "botnet", "infiltration"].includes(k)).map(([key, value]) => ({ key, value }));
            return rows.length ? <HBar data={rows} colorFor={categoryColor} /> : <EmptyState title="No network-model alerts" />;
          })() : <Skeleton className="h-40" />}
        </Card>
        <Card title="Alerts by module" subtitle={`Last ${window}`}>
          {d ? (Object.keys(d.alerts_by_module).length ?
            <HBar data={Object.entries(d.alerts_by_module).map(([key, value]) => ({ key: MODULE_LABEL[key] ?? key, value }))} />
            : <EmptyState title="No alerts yet" />) : <Skeleton className="h-40" />}
        </Card>
        <Card title="Model health" subtitle="Loaded artifacts and last successful inference"
          action={<Link href="/models" className="text-sm font-medium text-primary hover:underline">Details</Link>}>
          {models.error && <ErrorState error={models.error} />}
          <ul className="space-y-3">
            {models.data?.models.map((mm) => (
              <li key={mm.name} className="flex items-start gap-3 text-sm">
                <BrainCircuit aria-hidden className={cx("mt-0.5 h-4 w-4", mm.ready ? "text-primary" : "text-critical")} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{mm.name}</p>
                  <p className="truncate text-xs text-ink-muted">v{mm.version} · last inference {ago(d?.model_last_inference[mm.name] ?? mm.last_inference_at)}</p>
                </div>
                {mm.ready ? <Pill tone="green">Ready</Pill> : <Pill tone="bad">Unavailable</Pill>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Data freshness & connections" subtitle="Telemetry adapters, pushed sources and threat-intelligence feeds">
        {d ? <Freshness f={d.freshness} /> : <Skeleton className="h-24" />}
      </Card>
    </div>
  );
}

function Freshness({ f }: { f: Metrics["freshness"] }) {
  const none = !f.tailers.length && !f.received_by_source.length;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">File tailers</p>
        {f.tailers.length ? f.tailers.map((t) => (
          <div key={t.name} className="mb-2 flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-ink">{t.name}</span>
            <span className="text-xs text-ink-muted">{num(t.events_total)} events · {ago(t.last_event_at)}</span>
            <Pill tone={t.status === "connected" && !t.stale ? "green" : t.status === "error" ? "bad" : "warn"}>{t.stale ? "stale" : t.status.replace(/_/g, " ")}</Pill>
          </div>
        )) : <p className="text-sm text-ink-muted">No live telemetry configured (set ZEEK_LOG_DIR, SURICATA_EVE_PATH or SYSMON_LOG_PATH).</p>}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Events received by source</p>
        {f.received_by_source.length ? f.received_by_source.map((s) => (
          <div key={s.source} className="mb-2 flex justify-between text-sm">
            <span className="font-medium text-ink capitalize">{s.source}</span>
            <span className="text-xs text-ink-muted">{num(s.events)} · last {ago(s.last_received_at)}</span>
          </div>
        )) : <p className="text-sm text-ink-muted">{none ? "Nothing ingested yet." : "—"}</p>}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Threat-intel feeds</p>
        {f.feeds.length ? f.feeds.map((fd) => (
          <div key={fd.feed} className="mb-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-ink uppercase">{fd.feed}</span>
              <Pill tone={fd.status === "ok" ? "green" : fd.status === "disabled" ? "neutral" : "warn"}>{fd.status.replace(/_/g, " ")}</Pill>
            </div>
            <p className="text-xs text-ink-muted">{num(fd.indicators)} indicators · last success {ago(fd.last_success_at)}</p>
            {fd.last_error && <p className="mt-0.5 line-clamp-2 text-xs text-[#a65410]">{fd.last_error}</p>}
          </div>
        )) : <p className="text-sm text-ink-muted">Feed not polled yet.</p>}
        <p className="mt-2 text-xs text-ink-muted">{f.live_subscribers} live dashboard connection(s)</p>
      </div>
    </div>
  );
}
