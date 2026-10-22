"use client";

import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { useShell } from "@/components/AppShell";
import { Card, EmptyState, ErrorState, inputCls, Loading, Notice, PageHeader, Pill } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { useApi } from "@/lib/useApi";

interface Entry {
  id: number; created_at: string; actor_email: string; action: string; target_type: string; target_id: string;
  ip_address: string; outcome: string; details: Record<string, unknown>;
}

export default function AuditPage() {
  const { user } = useShell();
  const [action, setAction] = useState("");
  const logs = useApi<Entry[]>(user.role === "admin" ? `/audit-logs?limit=300${action ? `&action=${encodeURIComponent(action)}` : ""}` : null);
  if (user.role !== "admin") return <Notice tone="warn">The audit trail is visible to administrators only.</Notice>;
  return (
    <div>
      <PageHeader title="Audit logs" description="Who did what, when and from where: sign-ins, analyses, alert and incident changes, settings and user management." />
      <Card title="Security event history" action={
        <select className={inputCls} value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
          <option value="">All actions</option>
          {["auth", "analyze", "alert", "incident", "settings", "user", "intel", "retention"].map((a) => <option key={a} value={a}>{a}.*</option>)}
        </select>}>
        {logs.error && <ErrorState error={logs.error} onRetry={logs.reload} />}
        {logs.loading && !logs.data && <Loading />}
        {logs.data && !logs.data.length && <EmptyState icon={ClipboardList} title="No entries" />}
        {logs.data && logs.data.length > 0 && (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-ink-muted">
                {["Time", "Actor", "Action", "Target", "IP", "Outcome", "Details"].map((h) => <th key={h} className="px-3 py-2 font-medium first:pl-5">{h}</th>)}</tr></thead>
              <tbody>
                {logs.data.map((e) => (
                  <tr key={e.id} className="border-b border-line-soft align-top">
                    <td className="py-2 pr-3 pl-5 whitespace-nowrap text-ink-soft">{dateTime(e.created_at)}</td>
                    <td className="px-3 py-2 text-ink">{e.actor_email || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-ink">{e.action}</td>
                    <td className="px-3 py-2 text-ink-soft">{e.target_type ? `${e.target_type} #${e.target_id}` : "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-soft">{e.ip_address}</td>
                    <td className="px-3 py-2"><Pill tone={e.outcome === "success" ? "green" : "bad"}>{e.outcome}</Pill></td>
                    <td className="max-w-xs px-3 py-2 font-mono text-xs break-words text-ink-muted">{JSON.stringify(e.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
