"use client";

import { Fingerprint, HardDrive, ServerCog, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AlertDetail, StatusPill } from "@/components/AlertDetail";
import { useLive } from "@/components/AppShell";
import { Card, EmptyState, ErrorState, Loading, Notice, PageHeader, Pill, SeverityBadge, SimulatedBadge } from "@/components/ui";
import { ago, dateTime, label, num } from "@/lib/format";
import type { Alert, AlertPage, Freshness } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const RULES = [
  { area: "Authentication", items: ["Repeated failed logins per account (T1110.001)", "Password spraying from one source (T1110.003)",
    "Successful login right after a failure burst (T1110)", "Privileged account used off-hours (T1078)", "One account on many hosts within an hour (T1021)"] },
  { area: "Network policy", items: ["Large one-way upload to an external address — possible exfiltration (T1048)",
    "Clinical-device subnet talking to the internet (T1071)", "Outbound connection on a non-approved port (T1571)",
    "Host contacted a domain flagged by an e-mail/URL alert or URLhaus (T1204.001)"] },
  { area: "Endpoint / ransomware (Sysmon)", items: ["Shadow-copy deletion, backup-catalog deletion, recovery disabled (T1490)",
    "Mass file writes with ransomware extensions or a uniform new extension (T1486)", "Ransom-note-like file names (T1486)",
    "Event-log clearing (T1070.001) and Defender tampering (T1562.001)", "Office application spawning a shell (T1204.002)", "Encoded PowerShell (T1059.001)"] },
];

function AlertList({ module, icon: Icon, onOpen }: { module: string; icon: typeof Fingerprint; onOpen: (a: Alert) => void }) {
  const page = useApi<AlertPage>(`/alerts?module=${module}&limit=15`);
  useLive((m) => { if (m.type === "alert.created" && m.alert.module === module) page.reload(); });
  if (page.loading && !page.data) return <Loading />;
  if (page.error) return <ErrorState error={page.error} onRetry={page.reload} />;
  if (!page.data?.items.length) return <EmptyState icon={Icon} title="No detections">Detections appear when matching telemetry is ingested.</EmptyState>;
  return (
    <ul className="divide-y divide-line-soft">
      {page.data.items.map((a) => (
        <li key={a.id}>
          <button onClick={() => onOpen(a)} className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-primary-soft/40">
            <SeverityBadge severity={a.severity} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{a.title}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">{label(a.category)} · {a.mitre_technique} · {dateTime(a.created_at)}
                {a.occurrences > 1 && ` · ×${a.occurrences}`}{a.is_simulated && <SimulatedBadge />}</span>
            </span>
            <StatusPill status={a.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function HospitalPage() {
  const [selected, setSelected] = useState<Alert | null>(null);
  const tel = useApi<Freshness>("/telemetry/status");
  const sysmon = tel.data?.tailers.find((t) => t.kind === "sysmon");
  const pushedSysmon = tel.data?.received_by_source.find((s) => s.source === "sysmon");
  const pushedAuth = tel.data?.received_by_source.find((s) => s.source === "auth");

  return (
    <div className="space-y-6">
      <PageHeader title="Hospital threat monitoring"
        description="Authentication abuse, unusual access, outbound-policy and exfiltration indicators, and ransomware behaviour on endpoints." />
      <Notice>
        These detections come from <strong>versioned deterministic rules</strong> (configurable on the Settings page), not from an ML model:
        no suitable labelled public endpoint-telemetry dataset was available to train one. They have been validated with synthetic events only,
        never with real ransomware. Findings need analyst review, and the platform takes no automatic containment action.
      </Notice>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[{ name: "Sysmon endpoint telemetry", icon: HardDrive, tailer: sysmon, pushed: pushedSysmon, hint: "SYSMON_LOG_PATH or POST /api/v1/ingest/sysmon" },
          { name: "Authentication events", icon: Fingerprint, tailer: undefined, pushed: pushedAuth, hint: "POST /api/v1/ingest/auth (EHR, VPN, AD) or Zeek ssh.log" }].map((s) => (
          <Card key={s.name} title={s.name} action={<s.icon aria-hidden className="h-5 w-5 text-primary" />}>
            {s.tailer ? (
              <p className="text-sm text-ink-soft"><Pill tone={s.tailer.status === "connected" && !s.tailer.stale ? "green" : "warn"}>{s.tailer.status}</Pill> {num(s.tailer.events_total)} events · last {ago(s.tailer.last_event_at)}</p>
            ) : s.pushed ? (
              <p className="text-sm text-ink-soft"><Pill tone="green">receiving</Pill> {num(s.pushed.events)} events · last {ago(s.pushed.last_received_at)}</p>
            ) : <p className="text-sm text-ink-muted">Not connected. Configure: <code className="text-xs">{s.hint}</code></p>}
          </Card>
        ))}
        <Card title="Rules in force" action={<ServerCog aria-hidden className="h-5 w-5 text-primary" />}>
          <p className="text-sm text-ink-soft">hospital-rules-1.0 · endpoint-rules-1.0</p>
          <p className="mt-1 text-xs text-ink-muted">Each alert records the rule id and version that produced it.</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Endpoint & ransomware detections" subtitle="Sysmon process, file and DNS events"><AlertList module="endpoint" icon={HardDrive} onOpen={setSelected} /></Card>
        <Card title="Authentication & access detections" subtitle="Failed-login bursts, spraying, off-hours privileged access"><AlertList module="auth" icon={Fingerprint} onOpen={setSelected} /></Card>
      </div>

      <Card title="What is monitored" subtitle="Rule coverage mapped to MITRE ATT&CK">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {RULES.map((r) => (
            <div key={r.area}>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck aria-hidden className="h-4 w-4 text-primary" />{r.area}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">{r.items.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </Card>
      {selected && <AlertDetail alert={selected} onClose={() => setSelected(null)} onChange={setSelected} />}
    </div>
  );
}
