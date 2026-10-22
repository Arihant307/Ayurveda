"use client";

import { RefreshCw, Save, UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useShell } from "@/components/AppShell";
import { Button, Card, ErrorState, Field, inputCls, Loading, Notice, PageHeader, Pill } from "@/components/ui";
import { patch, post, put } from "@/lib/api";
import { dateTime } from "@/lib/format";
import type { Role, User } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Thresholds = Record<"email" | "url" | "network", { alert: number | null; high: number; critical: number }>;
interface SettingsDoc {
  thresholds: Thresholds;
  rules: Record<string, number | boolean | string[] | number[]>;
  correlation: { window_minutes: number; min_alerts: number };
  alerting: { suppression_minutes: number; notify_min_severity: string };
  retention: { alerts_days: number; events_days: number; audit_days: number; store_raw_email: boolean };
}

function useSave() {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async <T,>(fn: () => Promise<T>, ok: string | ((r: T) => string) = "Saved") => {
    setBusy(true); setErr(null); setMsg(null);
    try { const r = await fn(); setMsg(typeof ok === "function" ? ok(r) : ok); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return { msg, err, busy, save };
}

const ROLE_INFO: Record<Role, string> = {
  admin: "Everything, including users, settings, audit logs and feed refresh",
  analyst: "Submit analyses, ingest telemetry, acknowledge/resolve alerts, manage incidents",
  viewer: "Read-only dashboards, alerts and reports",
};

export default function SettingsPage() {
  const { user } = useShell();
  const isAdmin = user.role === "admin";
  const doc = useApi<SettingsDoc>("/settings");
  const [s, setS] = useState<SettingsDoc | null>(null);
  useEffect(() => { if (doc.data) setS(structuredClone(doc.data)); }, [doc.data]);
  const th = useSave(); const rl = useSave(); const rt = useSave(); const intel = useSave();

  if (doc.loading && !doc.data) return <Loading />;
  if (doc.error) return <ErrorState error={doc.error} onRetry={doc.reload} />;
  if (!s) return null;

  const numInput = (value: number | null, onChange: (v: number | null) => void, opts: { step?: number; min?: number; max?: number; nullable?: boolean } = {}) => (
    <input type="number" className={inputCls} disabled={!isAdmin} step={opts.step ?? 1} min={opts.min} max={opts.max}
      value={value ?? ""} placeholder={opts.nullable ? "model default" : undefined}
      onChange={(e) => onChange(e.target.value === "" ? (opts.nullable ? null : 0) : Number(e.target.value))} />
  );
  const R = s.rules;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Alert thresholds, rule parameters, data retention and access control." />
      {!isAdmin && <Notice tone="warn">Only administrators can change settings. You are viewing the current values.</Notice>}

      <Card title="Alert thresholds" subtitle="Score at or above “alert” raises an alert; “high” and “critical” set severity. Empty alert = the threshold chosen on validation data at training time (FPR ≤ 1%).">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {(["email", "url", "network"] as const).map((k) => (
            <div key={k} className="space-y-3 rounded-xl border border-line p-4">
              <p className="font-semibold text-ink capitalize">{k === "network" ? "Network P(attack)" : `${k} risk score`}</p>
              <Field label="Alert">{numInput(s.thresholds[k].alert, (v) => setS({ ...s, thresholds: { ...s.thresholds, [k]: { ...s.thresholds[k], alert: v } } }), { step: 0.01, min: 0, max: 1, nullable: true })}</Field>
              <Field label="High">{numInput(s.thresholds[k].high, (v) => setS({ ...s, thresholds: { ...s.thresholds, [k]: { ...s.thresholds[k], high: v ?? 0 } } }), { step: 0.01, min: 0, max: 1 })}</Field>
              <Field label="Critical">{numInput(s.thresholds[k].critical, (v) => setS({ ...s, thresholds: { ...s.thresholds, [k]: { ...s.thresholds[k], critical: v ?? 0 } } }), { step: 0.01, min: 0, max: 1 })}</Field>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-muted">Lowering the alert threshold catches more threats but raises false positives; see the Model performance page for the trade-off measured on held-out data.</p>
        {isAdmin && <div className="mt-4 flex items-center gap-3"><Button loading={th.busy} onClick={() => th.save(() => put("/settings/thresholds", { value: s.thresholds }))}><Save aria-hidden className="h-4 w-4" /> Save thresholds</Button>
          {th.msg && <span className="text-sm text-safe">{th.msg}</span>}</div>}
        {th.err && <div className="mt-3"><ErrorState error={th.err} /></div>}
      </Card>

      <Card title="Detection rules & correlation">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Failed logins to alert">{numInput(R.auth_failure_threshold as number, (v) => setS({ ...s, rules: { ...R, auth_failure_threshold: v ?? 1 } }), { min: 2 })}</Field>
          <Field label="Failed-login window (s)">{numInput(R.auth_failure_window_seconds as number, (v) => setS({ ...s, rules: { ...R, auth_failure_window_seconds: v ?? 60 } }), { min: 10 })}</Field>
          <Field label="Off-hours start (UTC hour)">{numInput(R.offhours_start_hour as number, (v) => setS({ ...s, rules: { ...R, offhours_start_hour: v ?? 0 } }), { min: 0, max: 23 })}</Field>
          <Field label="Off-hours end (UTC hour)">{numInput(R.offhours_end_hour as number, (v) => setS({ ...s, rules: { ...R, offhours_end_hour: v ?? 0 } }), { min: 0, max: 23 })}</Field>
          <Field label="Exfiltration bytes">{numInput(R.exfil_bytes_threshold as number, (v) => setS({ ...s, rules: { ...R, exfil_bytes_threshold: v ?? 0 } }), { min: 1 })}</Field>
          <Field label="Mass-file threshold">{numInput(R.mass_file_threshold as number, (v) => setS({ ...s, rules: { ...R, mass_file_threshold: v ?? 1 } }), { min: 5 })}</Field>
          <Field label="Mass-file window (s)">{numInput(R.mass_file_window_seconds as number, (v) => setS({ ...s, rules: { ...R, mass_file_window_seconds: v ?? 1 } }), { min: 5 })}</Field>
          <Field label="Correlation window (min)">{numInput(s.correlation.window_minutes, (v) => setS({ ...s, correlation: { ...s.correlation, window_minutes: v ?? 1 } }), { min: 1 })}</Field>
          <Field label="Approved outbound ports" hint="Comma separated">
            <input className={inputCls} disabled={!isAdmin} value={(R.allowed_outbound_ports as number[]).join(",")}
              onChange={(e) => setS({ ...s, rules: { ...R, allowed_outbound_ports: e.target.value.split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0) } })} />
          </Field>
          <Field label="Clinical-device subnets" hint="CIDRs, comma separated">
            <input className={inputCls} disabled={!isAdmin} value={(R.clinical_device_cidrs as string[]).join(",")}
              onChange={(e) => setS({ ...s, rules: { ...R, clinical_device_cidrs: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } })} />
          </Field>
          <Field label="Privileged accounts" hint="Comma separated">
            <input className={inputCls} disabled={!isAdmin} value={(R.privileged_accounts as string[]).join(",")}
              onChange={(e) => setS({ ...s, rules: { ...R, privileged_accounts: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } })} />
          </Field>
          <Field label="Alert suppression (min)">{numInput(s.alerting.suppression_minutes, (v) => setS({ ...s, alerting: { ...s.alerting, suppression_minutes: v ?? 0 } }), { min: 0 })}</Field>
        </div>
        {isAdmin && <div className="mt-4 flex items-center gap-3"><Button loading={rl.busy} onClick={() => rl.save(async () => {
          await put("/settings/rules", { value: s.rules });
          await put("/settings/correlation", { value: s.correlation });
          await put("/settings/alerting", { value: s.alerting });
        })}><Save aria-hidden className="h-4 w-4" /> Save rules</Button>{rl.msg && <span className="text-sm text-safe">{rl.msg}</span>}</div>}
        {rl.err && <div className="mt-3"><ErrorState error={rl.err} /></div>}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Data retention & privacy" subtitle="Applied daily; only closed alerts are purged.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Alerts & analyses (days)">{numInput(s.retention.alerts_days, (v) => setS({ ...s, retention: { ...s.retention, alerts_days: v ?? 1 } }), { min: 1, max: 3650 })}</Field>
            <Field label="Telemetry events (days)">{numInput(s.retention.events_days, (v) => setS({ ...s, retention: { ...s.retention, events_days: v ?? 1 } }), { min: 1, max: 3650 })}</Field>
            <Field label="Audit logs (days)">{numInput(s.retention.audit_days, (v) => setS({ ...s, retention: { ...s.retention, audit_days: v ?? 1 } }), { min: 1, max: 3650 })}</Field>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="mt-0.5 accent-primary" disabled={!isAdmin} checked={s.retention.store_raw_email}
              onChange={(e) => setS({ ...s, retention: { ...s.retention, store_raw_email: e.target.checked } })} />
            Store raw e-mail subject, sender and a body preview. Off by default (data minimisation). Enable only with an approved legal basis.
          </label>
          {isAdmin && <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button loading={rt.busy} onClick={() => rt.save(() => put("/settings/retention", { value: s.retention }))}><Save aria-hidden className="h-4 w-4" /> Save retention</Button>
            <Button variant="secondary" onClick={() => rt.save(() => post<Record<string, number>>("/retention/run"),
              (r) => `Purged: ${Object.entries(r).map(([k, v]) => `${k} ${v}`).join(", ")}`)}>Apply now</Button>
            {rt.msg && <span className="text-sm text-safe">{rt.msg}</span>}</div>}
          {rt.err && <div className="mt-3"><ErrorState error={rt.err} /></div>}
        </Card>
        <Card title="Threat intelligence" subtitle="URLhaus recent URLs feed (abuse.ch). Requires a free Auth-Key set as URLHAUS_AUTH_KEY on the backend.">
          <p className="text-sm text-ink-soft">The feed refreshes automatically on its schedule, with backoff on errors and rate limits. Feed health is shown on the Overview page.</p>
          {isAdmin && <div className="mt-4 flex items-center gap-3"><Button variant="secondary" loading={intel.busy}
            onClick={() => intel.save(async () => { const r = await post<{ status: string; indicators: number; last_error: string }>("/threat-intel/refresh");
              if (r.status !== "ok") throw new Error(`Feed status: ${r.status}. ${r.last_error}`); }, "Feed refreshed")}>
            <RefreshCw aria-hidden className="h-4 w-4" /> Refresh now</Button>{intel.msg && <span className="text-sm text-safe">{intel.msg}</span>}</div>}
          {intel.err && <div className="mt-3"><ErrorState error={intel.err} /></div>}
        </Card>
      </div>

      <Card title="Role-based access control">
        <ul className="mb-4 space-y-1.5 text-sm">
          {(Object.keys(ROLE_INFO) as Role[]).map((r) => <li key={r}><Pill tone={r === "admin" ? "bad" : r === "analyst" ? "warn" : "neutral"}>{r}</Pill> <span className="text-ink-soft">{ROLE_INFO[r]}</span></li>)}
        </ul>
        {isAdmin ? <Users /> : <p className="text-sm text-ink-muted">You are signed in as <strong>{user.role}</strong>.</p>}
      </Card>
    </div>
  );
}

function Users() {
  const { user: me } = useShell();
  const users = useApi<User[]>("/users");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const s = useSave();

  const create = (e: FormEvent) => {
    e.preventDefault();
    s.save(async () => {
      await post("/users", { email, full_name: name, password, role });
      setEmail(""); setName(""); setPassword("");
      users.reload();
    }, "User created");
  };
  const change = (u: User, body: Partial<User>) => s.save(async () => { await patch(`/users/${u.id}`, body); users.reload(); }, "Updated");

  return (
    <div className="space-y-4">
      {users.error && <ErrorState error={users.error} />}
      <div className="-mx-5 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="px-5 py-2 font-medium">User</th><th className="font-medium">Role</th><th className="font-medium">Last sign-in</th><th className="font-medium">Active</th></tr></thead>
          <tbody>
            {users.data?.map((u) => (
              <tr key={u.id} className="border-b border-line-soft">
                <td className="px-5 py-2"><p className="font-medium text-ink">{u.full_name || u.email}</p><p className="text-xs text-ink-muted">{u.email}</p></td>
                <td><select className={inputCls + " w-32"} value={u.role} disabled={u.id === me.id} onChange={(e) => change(u, { role: e.target.value as Role })} aria-label={`Role for ${u.email}`}>
                  <option value="viewer">viewer</option><option value="analyst">analyst</option><option value="admin">admin</option></select></td>
                <td className="text-ink-soft">{dateTime(u.last_login_at)}</td>
                <td><input type="checkbox" className="accent-primary" checked={u.is_active} disabled={u.id === me.id} onChange={(e) => change(u, { is_active: e.target.checked })} aria-label={`Active ${u.email}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={create} className="grid grid-cols-1 gap-3 rounded-xl border border-line p-4 md:grid-cols-5">
        <input className={inputCls} placeholder="e-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-label="New user e-mail" />
        <input className={inputCls} placeholder="full name" value={name} onChange={(e) => setName(e.target.value)} aria-label="New user name" />
        <input className={inputCls} placeholder="password (12+ chars)" type="password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} aria-label="New user password" />
        <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="New user role"><option value="viewer">viewer</option><option value="analyst">analyst</option><option value="admin">admin</option></select>
        <Button type="submit" loading={s.busy}><UserPlus aria-hidden className="h-4 w-4" /> Add user</Button>
      </form>
      {s.msg && <p className="text-sm text-safe">{s.msg}</p>}
      {s.err && <ErrorState error={s.err} />}
    </div>
  );
}
