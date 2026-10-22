"use client";

import { Link2, ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useShell } from "@/components/AppShell";
import { Button, Card, EmptyState, ErrorState, inputCls, Notice, PageHeader, Pill, RiskMeter, SafeBadge, SeverityBadge } from "@/components/ui";
import { post } from "@/lib/api";
import { ago } from "@/lib/format";
import type { UrlResult } from "@/lib/types";
import { IndicatorList } from "@/components/IndicatorList";

const SHOWN_FEATURES = ["url_length", "host_length", "num_subdomains", "num_dots", "num_hyphens", "num_digits", "num_special",
  "has_ip_host", "has_at", "has_punycode", "is_shortener", "suspicious_tld", "num_suspicious_tokens", "host_entropy", "path_depth", "num_params"];

export default function UrlPage() {
  const { user } = useShell();
  const [url, setUrl] = useState("");
  const [enrich, setEnrich] = useState(true);
  const [r, setR] = useState<UrlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setR(await post<UrlResult>("/analyze/url", { url: url.trim(), enrich }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setR(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="URL scanner" description="Lexical machine-learning analysis of a link. The URL is treated as text only: it is never opened, resolved or fetched." />
      <div className="mb-5"><Notice tone="warn"><strong>Do not open suspicious links.</strong> Nothing on this page is clickable; copy a URL only into isolated analysis tools approved by your security team.</Notice></div>
      <Card className="mb-6">
        <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row md:items-center">
          <label className="sr-only" htmlFor="url">URL to analyse</label>
          <input id="url" className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://example-login.verify-account.top/secure" maxLength={4096} spellCheck={false} autoComplete="off" />
          <label className="flex shrink-0 items-center gap-2 text-sm text-ink-soft"><input type="checkbox" className="accent-primary" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} /> URLhaus lookup</label>
          <Button type="submit" loading={busy} disabled={user.role === "viewer" || url.trim().length < 3} className="shrink-0"><Link2 aria-hidden className="h-4 w-4" /> Analyse URL</Button>
        </form>
      </Card>
      {error && <div className="mb-4"><ErrorState error={error} /></div>}
      {!r && !error && <Card><EmptyState icon={Link2} title="No URL analysed yet">Paste a link from an e-mail, chat message or log.</EmptyState></Card>}
      {r && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2" title={<span className="font-mono text-sm break-all select-all">{r.host}</span>}
            subtitle={`Registered domain ${r.registered_domain} · ${r.model_name} v${r.model_version}`}
            action={r.is_threat && r.severity ? <SeverityBadge severity={r.severity} size="md" /> : <SafeBadge>Likely legitimate</SafeBadge>}>
            <div className="space-y-5">
              <RiskMeter score={r.risk_score} threshold={r.threshold} />
              {r.is_threat && (
                <div className="flex items-start gap-2 rounded-xl border border-critical/30 bg-critical-soft p-3 text-sm text-critical">
                  <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Treat this link as malicious. Do not visit it from a hospital workstation. {r.alert_id && <>Alert <Link href="/threats" className="font-semibold underline">#{r.alert_id}</Link> created.</>}</span>
                </div>
              )}
              <p className="text-xs text-ink-muted">{r.safety_notice}</p>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-ink">Reasons</h3>
                <IndicatorList items={r.reasons} empty="No rule-based warning signs; the score comes from the character-level model only." />
              </div>
              {r.ngram_contributions.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-ink">Character patterns that influenced the model</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {r.ngram_contributions.map((c) => (
                      <Pill key={c.ngram} tone={c.contribution > 0 ? "bad" : "green"} title={`weight ${c.contribution.toFixed(3)}`}>
                        <code>{c.ngram}</code> {c.contribution > 0 ? "↑ risk" : "↓ risk"}
                      </Pill>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
          <div className="space-y-6">
            <Card title="Threat intelligence" subtitle="URLhaus (abuse.ch), matched locally">
              {r.threat_intel.matches.length ? (
                <ul className="space-y-2 text-sm">{r.threat_intel.matches.map((m, i) => (
                  <li key={i} className="flex items-start gap-2 text-critical"><ShieldAlert aria-hidden className="mt-0.5 h-4 w-4" />Listed as {m.threat || "malicious"} ({m.type}) {m.tags && `· ${m.tags}`}</li>
                ))}</ul>
              ) : <p className="text-sm text-ink-soft">{r.threat_intel.checked ? "Not listed in the local URLhaus copy." : "Not checked: the feed has no indicators loaded."}</p>}
              <p className="mt-2 text-xs text-ink-muted">Feed status: {r.threat_intel.feed_status} · last success {ago(r.threat_intel.feed_last_success_at)}</p>
            </Card>
            <Card title="Lexical features">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                {SHOWN_FEATURES.map((f) => (
                  <div key={f} className="flex justify-between gap-2 border-b border-line-soft py-0.5">
                    <dt className="text-ink-muted">{f.replace(/_/g, " ")}</dt>
                    <dd className="tabular font-medium text-ink">{Number.isInteger(r.features[f]) ? r.features[f] : r.features[f]?.toFixed(2)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
