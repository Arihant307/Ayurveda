"use client";

import { Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { AlertDetail, StatusPill } from "@/components/AlertDetail";
import { useLive } from "@/components/AppShell";
import { Card, EmptyState, ErrorState, inputCls, Loading, PageHeader, SeverityBadge, SimulatedBadge, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, label, MODULE_LABEL, pct } from "@/lib/format";
import type { Alert, AlertPage } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const SEVS = ["critical", "high", "medium", "low"];
const MODULES = ["email", "url", "network", "endpoint", "auth", "intel"];
const STATUSES = ["new", "acknowledged", "investigating", "resolved", "false_positive"];
const PAGE = 50;

function Chips({ options, value, onChange, render }: { options: string[]; value: string[]; onChange: (v: string[]) => void; render?: (v: string) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cx("rounded-full border px-2.5 py-1 text-xs font-medium capitalize", on ? "border-primary bg-primary text-white" : "border-line bg-white text-ink-soft hover:bg-primary-soft")}>
            {render ? render(o) : o.replace("_", " ")}
          </button>
        );
      })}
    </div>
  );
}

export default function ThreatsPage() {
  const [sev, setSev] = useState<string[]>([]);
  const [mods, setMods] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>(["new", "acknowledged", "investigating"]);
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [q, setQ] = useState("");
  const [sim, setSim] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Alert | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    sev.forEach((s) => p.append("severity", s));
    mods.forEach((m) => p.append("module", m));
    status.forEach((s) => p.append("status", s));
    if (since) p.set("since", new Date(since).toISOString());
    if (until) p.set("until", new Date(until).toISOString());
    if (q.trim()) p.set("q", q.trim());
    p.set("include_simulated", String(sim));
    p.set("limit", String(PAGE));
    p.set("offset", String(offset));
    return p.toString();
  }, [sev, mods, status, since, until, q, sim, offset]);

  const page = useApi<AlertPage>(`/alerts?${qs}`);

  useLive((msg) => {
    if (msg.type === "alert.created") {
      setFresh((f) => new Set(f).add(msg.alert.id));
      if (offset === 0) page.reload();
    } else if (msg.type === "alert.updated" && page.data?.items.some((a) => a.id === msg.alert.id)) {
      page.reload();
    }
  });

  const open = async (a: Alert) => {
    setFresh((f) => { const n = new Set(f); n.delete(a.id); return n; });
    try {
      setSelected(await api<Alert>(`/alerts/${a.id}`));
    } catch {
      setSelected(a);
    }
  };

  return (
    <div>
      <PageHeader title="Threat monitoring" description="Live alert stream from every detection module. New alerts appear as they are created; select one for the evidence and analyst actions." />
      <Card className="mb-5" title="Filters">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div><p className="mb-1 text-xs font-medium text-ink-muted">Severity</p><Chips options={SEVS} value={sev} onChange={(v) => { setSev(v); setOffset(0); }} /></div>
            <div><p className="mb-1 text-xs font-medium text-ink-muted">Category / module</p><Chips options={MODULES} value={mods} render={(m) => MODULE_LABEL[m] ?? m} onChange={(v) => { setMods(v); setOffset(0); }} /></div>
            <div><p className="mb-1 text-xs font-medium text-ink-muted">Status</p><Chips options={STATUSES} value={status} onChange={(v) => { setStatus(v); setOffset(0); }} /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-ink-muted">From<input type="datetime-local" className={cx(inputCls, "mt-1")} value={since} onChange={(e) => { setSince(e.target.value); setOffset(0); }} /></label>
            <label className="text-xs font-medium text-ink-muted">To<input type="datetime-local" className={cx(inputCls, "mt-1")} value={until} onChange={(e) => { setUntil(e.target.value); setOffset(0); }} /></label>
            <label className="text-xs font-medium text-ink-muted sm:col-span-2">Search title, host, IP or user
              <span className="relative mt-1 block"><Search aria-hidden className="absolute top-2.5 left-3 h-4 w-4 text-ink-muted" />
                <input className={cx(inputCls, "pl-9")} value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="e.g. 10.0.5.20 or radiology" /></span>
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" className="accent-primary" checked={sim} onChange={(e) => setSim(e.target.checked)} /> Include simulated</label>
          </div>
        </div>
      </Card>

      <Card title={page.data ? `${page.data.total} alerts` : "Alerts"} subtitle="Newest first">
        {page.error && <ErrorState error={page.error} onRetry={page.reload} />}
        {page.loading && !page.data && <Loading />}
        {page.data && page.data.items.length === 0 && (
          <EmptyState icon={ShieldCheck} title="No alerts match these filters">Clear filters, or analyse an e-mail, URL or flow file to generate detections.</EmptyState>
        )}
        {page.data && page.data.items.length > 0 && (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-5 py-2 font-medium">Severity</th><th className="py-2 font-medium">Alert</th>
                  <th className="py-2 font-medium">Source</th><th className="py-2 font-medium">Confidence</th>
                  <th className="py-2 font-medium">Time</th><th className="px-5 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {page.data.items.map((a) => (
                  <tr key={a.id} onClick={() => open(a)} onKeyDown={(e) => e.key === "Enter" && open(a)} tabIndex={0}
                    className={cx("cursor-pointer border-b border-line-soft hover:bg-primary-soft/50", fresh.has(a.id) && "bg-medium-soft/50")}>
                    <td className="px-5 py-3"><SeverityBadge severity={a.severity} /></td>
                    <td className="max-w-[420px] py-3">
                      <p className="truncate font-medium text-ink">{a.title}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                        {MODULE_LABEL[a.module] ?? a.module} · {label(a.category)}{a.occurrences > 1 && ` · ×${a.occurrences}`}
                        {a.incident_id && <span className="font-medium text-primary">· incident #{a.incident_id}</span>}
                        {a.is_simulated && <SimulatedBadge />}
                        {fresh.has(a.id) && <span className="font-semibold text-[#a65410]">NEW</span>}
                      </p>
                    </td>
                    <td className="py-3 text-ink-soft">{a.source}</td>
                    <td className="tabular py-3 text-ink">{pct(a.confidence, 0)}</td>
                    <td className="py-3 whitespace-nowrap text-ink-soft">{dateTime(a.created_at)}</td>
                    <td className="px-5 py-3"><StatusPill status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {page.data && page.data.total > PAGE && (
          <div className="mt-4 flex items-center justify-between text-sm text-ink-soft">
            <span>{offset + 1}–{Math.min(offset + PAGE, page.data.total)} of {page.data.total}</span>
            <div className="flex gap-2">
              <button className="rounded-lg border border-line px-3 py-1 disabled:opacity-40" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
              <button className="rounded-lg border border-line px-3 py-1 disabled:opacity-40" disabled={offset + PAGE >= page.data.total} onClick={() => setOffset(offset + PAGE)}>Next</button>
            </div>
          </div>
        )}
      </Card>
      {selected && <AlertDetail alert={selected} onClose={() => setSelected(null)} onChange={(a) => { setSelected(a); page.reload(); }} />}
    </div>
  );
}
