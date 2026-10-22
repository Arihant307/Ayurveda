"use client";

import { FileUp, Lock, Mail, Paperclip } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useShell } from "@/components/AppShell";
import { Button, Card, EmptyState, ErrorState, Field, inputCls, Notice, PageHeader, Pill, RiskMeter, SafeBadge, SeverityBadge } from "@/components/ui";
import { post } from "@/lib/api";
import type { EmailResult } from "@/lib/types";
import { IndicatorList } from "@/components/IndicatorList";

function Result({ r }: { r: EmailResult }) {
  return (
    <Card title="Result" subtitle={`${r.model_name} v${r.model_version} · ${r.latency_ms.toFixed(0)} ms`}
      action={r.is_threat && r.severity ? <SeverityBadge severity={r.severity} size="md" /> : <SafeBadge>Likely legitimate</SafeBadge>}>
      <div className="space-y-5">
        <RiskMeter score={r.risk_score} threshold={r.threshold} />
        <p className="text-sm text-ink-soft">
          Predicted <strong className="text-ink">{r.predicted_label}</strong>.{" "}
          {r.alert_id ? <>Alert <Link className="font-semibold text-primary underline" href="/threats">#{r.alert_id}</Link> was created for review.</> : "No alert was raised."}
        </p>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Suspicious indicators</h3>
          <IndicatorList items={r.indicators} empty="No rule-based phishing indicators matched." />
        </div>
        {r.top_terms.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Words that raised the model score</h3>
            <div className="flex flex-wrap gap-1.5">{r.top_terms.map((t) => <Pill key={t.term}>{t.term}</Pill>)}</div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-canvas p-3">
            <p className="text-xs text-ink-muted">Links found ({r.url_count})</p>
            <p className="break-words text-ink">{r.url_domains.join(", ") || "none"}</p>
            {r.url_domains.length > 0 && <Link href="/url" className="text-xs font-medium text-primary hover:underline">Check a link in the URL scanner</Link>}
          </div>
          <div className="rounded-xl bg-canvas p-3">
            <p className="flex items-center gap-1 text-xs text-ink-muted"><Paperclip aria-hidden className="h-3.5 w-3.5" /> Attachments (listed, never opened)</p>
            <p className="break-words text-ink">{r.attachments.join(", ") || "none"}</p>
          </div>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-ink-muted"><Lock aria-hidden className="h-3.5 w-3.5" />
          {r.raw_content_stored ? "Message content is stored (STORE_RAW_EMAIL is enabled)." : "Message content was not stored: only a hash, the sender domain, indicators and the score were saved."}
        </p>
      </div>
    </Card>
  );
}

export default function EmailPage() {
  const { user } = useShell();
  const [subject, setSubject] = useState("");
  const [sender, setSender] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<EmailResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const readOnly = user.role === "viewer";

  const run = async (fn: () => Promise<EmailResult>) => {
    setBusy(true);
    setError(null);
    try {
      setResult(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const submitText = (e: FormEvent) => {
    e.preventDefault();
    run(() => post<EmailResult>("/analyze/email", { subject, body, sender }));
  };
  const submitFile = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    run(() => post<EmailResult>("/analyze/email/upload", fd));
  };

  return (
    <div>
      <PageHeader title="E-mail security" description="Classify a suspicious message with the trained text model and rule-based phishing indicators." />
      {readOnly && <div className="mb-4"><Notice tone="warn">Your role is read-only. Ask an administrator for analyst access to submit messages.</Notice></div>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card title="Paste a message" subtitle="Avoid including patient information. Content is not stored by default.">
            <form onSubmit={submitText} className="space-y-4">
              <Field label="From (optional)" hint="Used for display-name impersonation checks"><input className={inputCls} value={sender} onChange={(e) => setSender(e.target.value)} placeholder='IT Service Desk <it@example.org>' maxLength={320} /></Field>
              <Field label="Subject"><input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={2000} /></Field>
              <Field label="Body"><textarea className={inputCls} rows={9} required value={body} onChange={(e) => setBody(e.target.value)} maxLength={200000} /></Field>
              <Button type="submit" loading={busy} disabled={readOnly || !body.trim()}><Mail aria-hidden className="h-4 w-4" /> Analyse e-mail</Button>
            </form>
          </Card>
          <Card title="Upload an .eml file" subtitle="Headers (SPF/DKIM results, Reply-To) are checked; attachments are only listed by name.">
            <form onSubmit={submitFile} className="flex flex-wrap items-center gap-3">
              <input type="file" accept=".eml,message/rfc822" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-primary-strong" aria-label="E-mail file" />
              <Button type="submit" variant="secondary" loading={busy} disabled={readOnly || !file}><FileUp aria-hidden className="h-4 w-4" /> Upload & analyse</Button>
            </form>
          </Card>
        </div>
        <div>
          {error && <div className="mb-4"><ErrorState error={error} /></div>}
          {result ? <Result r={result} /> : !error && (
            <Card title="Result"><EmptyState icon={Mail} title="No message analysed yet">The risk score, indicators and any alert will appear here.</EmptyState></Card>
          )}
        </div>
      </div>
    </div>
  );
}
