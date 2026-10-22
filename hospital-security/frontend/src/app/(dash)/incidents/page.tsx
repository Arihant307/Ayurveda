"use client";

import { GitMerge } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertDetail, StatusPill } from "@/components/AlertDetail";
import { useLive, useShell } from "@/components/AppShell";
import { Button, Card, EmptyState, ErrorState, inputCls, Loading, Notice, PageHeader, Pill, SeverityBadge, SimulatedBadge, cx } from "@/components/ui";
import { api, patch } from "@/lib/api";
import { dateTime, label, MODULE_LABEL } from "@/lib/format";
import type { Alert, AlertPage, Incident } from "@/lib/types";
import { useApi } from "@/lib/useApi";

function IncidentView({ incident, onChange }: { incident: Incident; onChange: (i: Incident) => void }) {
  const { user } = useShell();
  const alerts = useApi<AlertPage>(`/alerts?incident_id=${incident.id}&limit=100&sort=oldest`, [incident.updated_at]);
  const [notes, setNotes] = useState(incident.notes);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Alert | null>(null);
  useEffect(() => setNotes(incident.notes), [incident.id, incident.notes]);

  const update = async (status?: string) => {
    setBusy(status ?? "notes");
    setError(null);
    try {
      onChange(await patch<Incident>(`/incidents/${incident.id}`, status ? { status, notes } : { notes }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title={incident.title} subtitle={`Incident #${incident.id} · opened ${dateTime(incident.created_at)}`}
      action={<div className="flex gap-2"><SeverityBadge severity={incident.severity} size="md" /><StatusPill status={incident.status} /></div>}>
      <div className="space-y-5">
        <div className="rounded-xl bg-canvas p-3 text-sm">
          <p className="font-medium text-ink">Why these alerts were grouped</p>
          <p className="mt-1 text-ink-soft">{incident.correlation_reason}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {incident.shared_entities.map((e) => <Pill key={`${e.kind}:${e.value}`}>{e.kind}: <code>{e.value}</code></Pill>)}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Modules: {incident.modules.map((m) => MODULE_LABEL[m] ?? m).join(", ")}. Severity is raised one level when independent modules agree.</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Timeline</p>
          {alerts.loading && !alerts.data && <Loading />}
          {alerts.error && <ErrorState error={alerts.error} />}
          <ol className="relative space-y-3 border-l-2 border-line pl-5">
            {alerts.data?.items.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute top-1.5 -left-[27px] h-3 w-3 rounded-full border-2 border-white bg-primary" />
                <button className="w-full rounded-xl border border-line p-3 text-left hover:bg-primary-soft/40" onClick={() => setSelected(a)}>
                  <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={a.severity} /><span className="text-xs text-ink-muted">{dateTime(a.created_at)} · {MODULE_LABEL[a.module] ?? a.module} · {label(a.category)}</span>{a.is_simulated && <SimulatedBadge />}</div>
                  <p className="mt-1 text-sm font-medium text-ink">{a.title}</p>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-xl border border-line p-4">
          <p className="mb-2 text-sm font-semibold text-ink">Investigation</p>
          <p className="mb-3 text-xs text-ink-muted">Correlation groups evidence; it does not confirm compromise. Only an analyst can mark an incident confirmed.</p>
          {error && <div className="mb-3"><ErrorState error={error} /></div>}
          <textarea className={inputCls} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={user.role === "viewer"} aria-label="Incident notes" />
          {user.role !== "viewer" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" loading={busy === "notes"} onClick={() => update()}>Save notes</Button>
              <Button variant="secondary" loading={busy === "investigating"} onClick={() => update("investigating")}>Investigating</Button>
              <Button variant="danger" loading={busy === "confirmed"} onClick={() => update("confirmed")}>Confirm incident</Button>
              <Button loading={busy === "resolved"} onClick={() => update("resolved")}>Resolve</Button>
              <Button variant="ghost" loading={busy === "dismissed"} onClick={() => update("dismissed")}>Dismiss</Button>
            </div>
          )}
        </div>
      </div>
      {selected && <AlertDetail alert={selected} onClose={() => setSelected(null)} onChange={setSelected} />}
    </Card>
  );
}

function IncidentsInner() {
  const params = useSearchParams();
  const list = useApi<Incident[]>("/incidents?limit=100");
  const [current, setCurrent] = useState<Incident | null>(null);
  useLive((m) => { if (m.type === "incident.created" || m.type === "incident.updated") list.reload(); });

  useEffect(() => {
    const id = Number(params.get("id"));
    if (id) api<Incident>(`/incidents/${id}`).then(setCurrent).catch(() => undefined);
  }, [params]);
  useEffect(() => {
    if (!current && list.data?.length) setCurrent(list.data[0]);
  }, [list.data, current]);

  return (
    <div>
      <PageHeader title="Incidents" description="Alerts from different modules that share an IP, host, user or domain within the correlation window." />
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <Loading />}
      {list.data && !list.data.length && (
        <Card><EmptyState icon={GitMerge} title="No correlated incidents">An incident is opened when two or more active alerts share an observable, e.g. a phishing e-mail and a workstation resolving the same domain.</EmptyState></Card>
      )}
      {list.data && list.data.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-2">
            {list.data.map((i) => (
              <button key={i.id} onClick={() => setCurrent(i)}
                className={cx("w-full rounded-2xl border bg-card p-4 text-left shadow-card", current?.id === i.id ? "border-primary ring-2 ring-primary/20" : "border-line hover:border-secondary")}>
                <div className="flex items-center justify-between gap-2"><SeverityBadge severity={i.severity} /><StatusPill status={i.status} /></div>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-ink">{i.title}</p>
                <p className="mt-1 text-xs text-ink-muted">#{i.id} · {i.alert_ids.length} alerts · {dateTime(i.created_at)}</p>
              </button>
            ))}
          </div>
          <div className="xl:col-span-2">
            {current ? <IncidentView incident={current} onChange={(i) => { setCurrent(i); list.reload(); }} /> : <Notice>Select an incident.</Notice>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function IncidentsPage() {
  return <Suspense fallback={<Loading />}><IncidentsInner /></Suspense>;
}
