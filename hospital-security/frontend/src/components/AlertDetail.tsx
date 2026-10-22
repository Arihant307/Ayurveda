"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { patch } from "@/lib/api";
import { dateTime, label, MODULE_LABEL, pct } from "@/lib/format";
import type { Alert } from "@/lib/types";
import { useShell } from "./AppShell";
import { Button, ErrorState, inputCls, Pill, SeverityBadge, SimulatedBadge } from "./ui";

const STATUS_TONE: Record<string, "neutral" | "green" | "warn" | "bad"> = {
  new: "bad", acknowledged: "warn", investigating: "warn", resolved: "green", false_positive: "neutral",
};

export function StatusPill({ status }: { status: string }) {
  return <Pill tone={STATUS_TONE[status] ?? "neutral"}>{status.replace("_", " ")}</Pill>;
}

function Evidence({ evidence }: { evidence: Record<string, unknown> }) {
  const indicators = (evidence.indicators ?? evidence.reasons) as { code: string; severity: string; description: string; evidence?: string }[] | undefined;
  const probs = evidence.class_probabilities as Record<string, number> | undefined;
  const terms = evidence.top_terms as { term: string; weight: number }[] | undefined;
  const rest = Object.fromEntries(Object.entries(evidence).filter(([k]) =>
    !["indicators", "reasons", "class_probabilities", "top_terms", "recent_samples", "features"].includes(k)));
  return (
    <div className="space-y-4">
      {indicators?.length ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">Why it was flagged</p>
          <ul className="space-y-1.5">
            {indicators.map((i) => (
              <li key={i.code} className="rounded-lg bg-canvas px-3 py-2 text-sm">
                <span className="font-medium text-ink">{i.description}</span>
                {i.evidence && <span className="block text-xs text-ink-muted">Evidence: {i.evidence}</span>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {probs && (
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">Model class probabilities</p>
          <ul className="space-y-1">
            {Object.entries(probs).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <li key={k} className="flex items-center gap-2 text-sm">
                <span className="w-28 text-ink-soft">{label(k)}</span>
                <span className="h-2 flex-1 rounded-full bg-line-soft"><span className="block h-2 rounded-full bg-primary" style={{ width: `${v * 100}%` }} /></span>
                <span className="tabular w-14 text-right text-ink">{pct(v)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {terms?.length ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">Terms that raised the score</p>
          <div className="flex flex-wrap gap-1.5">{terms.map((t) => <Pill key={t.term}>{t.term}</Pill>)}</div>
        </div>
      ) : null}
      <details className="rounded-lg border border-line px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-ink-soft">Raw evidence</summary>
        <pre className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap text-ink">{JSON.stringify(rest, null, 2)}</pre>
      </details>
    </div>
  );
}

export function AlertDetail({ alert, onClose, onChange }: { alert: Alert; onClose: () => void; onChange: (a: Alert) => void }) {
  const { user } = useShell();
  const [note, setNote] = useState(alert.resolution_note);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAct = user.role !== "viewer";

  const setStatus = async (status: string) => {
    setBusy(status);
    setError(null);
    try {
      onChange(await patch<Alert>(`/alerts/${alert.id}`, { status, note }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="alert-title">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} aria-hidden />
      <div className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-card shadow-2xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-card px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <SeverityBadge severity={alert.severity} />
              <StatusPill status={alert.status} />
              {alert.is_simulated && <SimulatedBadge />}
            </div>
            <h2 id="alert-title" className="text-base font-semibold text-ink">{alert.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-ink-soft hover:bg-line-soft"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5 px-5 py-4">
          <p className="text-sm text-ink-soft">{alert.description}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              ["Module", MODULE_LABEL[alert.module] ?? alert.module], ["Category", label(alert.category)],
              ["Confidence", pct(alert.confidence)], ["Occurrences", String(alert.occurrences)],
              ["First seen", dateTime(alert.created_at)], ["Last seen", dateTime(alert.last_seen_at)],
              ["Source", alert.source], ["Detector", `${alert.detector} (${alert.detector_version})`],
              ["MITRE ATT&CK", alert.mitre_technique || "—"], ["Host", alert.host || "—"],
              ["Source IP", alert.src_ip || "—"], ["Destination IP", alert.dst_ip || "—"], ["User", alert.user_name || "—"],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-xs text-ink-muted">{k}</dt><dd className="truncate text-ink" title={v}>{v}</dd></div>
            ))}
          </dl>
          {alert.incident_id && (
            <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary-strong">
              Correlated into <Link className="font-semibold underline" href={`/incidents?id=${alert.incident_id}`}>incident #{alert.incident_id}</Link>.
            </p>
          )}
          <Evidence evidence={alert.evidence} />
          <div className="rounded-xl border border-line p-4">
            <p className="mb-2 text-sm font-semibold text-ink">Analyst actions</p>
            <p className="mb-3 text-xs text-ink-muted">An alert is a detection, not a confirmed incident. Any containment must go through approved change control.</p>
            {error && <div className="mb-3"><ErrorState error={error} /></div>}
            <textarea className={inputCls} rows={3} placeholder="Notes (required to resolve or mark as false positive)"
              value={note} onChange={(e) => setNote(e.target.value)} disabled={!canAct} aria-label="Analyst notes" />
            {canAct ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" loading={busy === "acknowledged"} onClick={() => setStatus("acknowledged")}>Acknowledge</Button>
                <Button variant="secondary" loading={busy === "investigating"} onClick={() => setStatus("investigating")}>Investigate</Button>
                <Button loading={busy === "resolved"} onClick={() => setStatus("resolved")}>Resolve</Button>
                <Button variant="ghost" loading={busy === "false_positive"} onClick={() => setStatus("false_positive")}>False positive</Button>
              </div>
            ) : <p className="mt-2 text-xs text-ink-muted">Viewers cannot change alert status.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
