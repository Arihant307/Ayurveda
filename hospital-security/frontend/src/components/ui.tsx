"use client";

import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
  Loader2,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { SEVERITY_LABEL } from "@/lib/format";
import type { Severity } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ title, subtitle, action, children, className }: {
  title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={cx("rounded-2xl border border-line bg-card shadow-card", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const SEV_STYLE: Record<Severity, { cls: string; icon: LucideIcon }> = {
  critical: { cls: "bg-critical-soft text-critical border-critical/30", icon: AlertOctagon },
  high: { cls: "bg-high-soft text-[#a65410] border-high/40", icon: ShieldAlert },
  medium: { cls: "bg-medium-soft text-medium-ink border-medium/50", icon: AlertTriangle },
  low: { cls: "bg-primary-soft text-primary-strong border-secondary/40", icon: CircleAlert },
  info: { cls: "bg-line-soft text-ink-soft border-line", icon: Info },
};

export function SeverityBadge({ severity, size = "sm" }: { severity: Severity; size?: "sm" | "md" }) {
  const s = SEV_STYLE[severity] ?? SEV_STYLE.info;
  const Icon = s.icon;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap",
      size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs", s.cls)}>
      <Icon aria-hidden className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} />
      {SEVERITY_LABEL[severity] ?? severity}
    </span>
  );
}

export function SafeBadge({ children = "No threat" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-safe/30 bg-safe-soft px-2 py-0.5 text-xs font-medium text-safe">
      <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

export function Pill({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "green" | "warn" | "bad"; title?: string }) {
  const cls = {
    neutral: "bg-line-soft text-ink-soft border-line",
    green: "bg-safe-soft text-safe border-safe/30",
    warn: "bg-medium-soft text-medium-ink border-medium/50",
    bad: "bg-critical-soft text-critical border-critical/30",
  }[tone];
  return <span title={title} className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", cls)}>{children}</span>;
}

export function SimulatedBadge() {
  return (
    <span title="Replayed dataset records or synthetic test events — not live telemetry"
      className="inline-flex items-center rounded-md border border-medium/60 bg-medium-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-medium-ink">
      Simulated
    </span>
  );
}

export function Button({ variant = "primary", loading, children, className, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean }) {
  const cls = {
    primary: "bg-primary text-white hover:bg-primary-strong border-transparent",
    secondary: "bg-card text-ink border-line hover:bg-primary-soft",
    ghost: "bg-transparent text-ink-soft border-transparent hover:bg-line-soft",
    danger: "bg-critical text-white border-transparent hover:brightness-95",
  }[variant];
  return (
    <button {...rest} disabled={rest.disabled || loading}
      className={cx("inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60", cls, className)}>
      {loading && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export const inputCls = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-8 text-sm text-ink-muted">
      <Loader2 aria-hidden className="h-4 w-4 animate-spin text-primary" /> {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-lg bg-line-soft", className)} />;
}

export function EmptyState({ icon: Icon = Info, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <Icon aria-hidden className="mb-2 h-7 w-7 text-secondary" />
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-xl border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical">
      <AlertOctagon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{error}</span>
      {onRetry && <button onClick={onRetry} className="font-semibold underline underline-offset-2">Retry</button>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  return (
    <div className={cx("flex items-start gap-2 rounded-xl border px-4 py-3 text-sm",
      tone === "warn" ? "border-medium/60 bg-medium-soft text-medium-ink" : "border-secondary/30 bg-primary-soft text-primary-strong")}>
      {tone === "warn" ? <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" /> : <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, icon: Icon, tone = "default" }: {
  label: string; value: ReactNode; sub?: ReactNode; icon?: LucideIcon; tone?: "default" | "critical" | "high" | "safe";
}) {
  const iconCls = { default: "bg-primary-soft text-primary", critical: "bg-critical-soft text-critical",
    high: "bg-high-soft text-[#a65410]", safe: "bg-safe-soft text-safe" }[tone];
  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-soft">{label}</p>
        {Icon && <span className={cx("rounded-lg p-1.5", iconCls)}><Icon aria-hidden className="h-4 w-4" /></span>}
      </div>
      <p className="tabular mt-2 text-[28px] leading-none font-semibold text-ink">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-ink-muted">{sub}</p>}
    </div>
  );
}

export function RiskMeter({ score, threshold }: { score: number; threshold: number }) {
  const sev = score >= 0.98 ? "#D64545" : score >= 0.9 ? "#E98A36" : score >= threshold ? "#E7BC45" : "#299764";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="tabular text-3xl font-semibold text-ink">{(score * 100).toFixed(1)}%</span>
        <span className="text-xs text-ink-muted">alert threshold {(threshold * 100).toFixed(1)}%</span>
      </div>
      <div className="relative mt-2 h-2.5 rounded-full bg-line-soft" role="meter" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(score * 100)} aria-label="Risk score">
        <div className="h-2.5 rounded-full" style={{ width: `${Math.max(score * 100, 1.5)}%`, background: sev }} />
        <div className="absolute -top-1 h-4.5 w-0.5 bg-ink" style={{ left: `${threshold * 100}%` }} title="Alert threshold" />
      </div>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-soft">{description}</p>}
      </div>
      {action}
    </div>
  );
}
