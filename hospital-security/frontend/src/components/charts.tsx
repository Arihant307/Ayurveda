"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CATEGORY_COLOR, label, num, SEVERITY_COLOR, SEVERITY_LABEL } from "@/lib/format";
import type { Severity } from "@/lib/types";

const AXIS = { fontSize: 12, fill: "#5c6b64" };
const GRID = "#ebf1ea";

function TooltipBox({ active, payload, title }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; title?: string }) {
  if (!active || !payload?.length) return null;
  const shown = payload.filter((p) => p.value);
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-card">
      {title && <p className="mb-1 font-semibold text-ink">{title}</p>}
      {!shown.length && <p className="text-ink-muted">No alerts</p>}
      {shown.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-ink-soft">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="tabular ml-auto pl-3 font-semibold text-ink">{num(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function SeverityTrend({ data, window }: { data: ({ bucket_start: string } & Record<Severity, number>)[]; window: string }) {
  const fmt = (v: string) => {
    const d = new Date(v);
    return window === "24h" ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };
  const sevs: Severity[] = ["low", "medium", "high", "critical"];
  return (
    <div className="h-80 w-full" role="img" aria-label="Alerts over time, stacked by severity">
      <ResponsiveContainer height="88%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="bucket_start" tickFormatter={fmt} tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#e3f2ec", opacity: 0.6 }}
            content={({ active, payload, label: l }) => (
              <TooltipBox active={active} title={l ? fmt(String(l)) : ""}
                payload={(payload ?? []).map((p) => ({ name: String(p.name), value: Number(p.value), color: String(p.color) })).reverse()} />
            )} />
          {sevs.map((s) => (
            <Bar key={s} dataKey={s} name={SEVERITY_LABEL[s]} stackId="a" fill={SEVERITY_COLOR[s]} stroke="#fff" strokeWidth={1}
              radius={s === "critical" ? [4, 4, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <ul className="mt-1 flex flex-wrap justify-center gap-4 text-xs text-ink-soft" aria-label="Legend">
        {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
          <li key={s} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SEVERITY_COLOR[s] }} />{SEVERITY_LABEL[s]}</li>
        ))}
      </ul>
    </div>
  );
}

export function HBar({ data, colorFor, unit = "alerts" }: {
  data: { key: string; value: number }[]; colorFor?: (k: string) => string; unit?: string;
}) {
  const height = Math.max(120, data.length * 34 + 24);
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={`Counts of ${unit} by category`}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="key" width={150} tick={AXIS} axisLine={false} tickLine={false} tickFormatter={label} />
          <Tooltip cursor={{ fill: "#e3f2ec", opacity: 0.6 }}
            content={({ active, payload }) => (
              <TooltipBox active={active} payload={(payload ?? []).map((p) => ({ name: label(String((p.payload as { key: string }).key)),
                value: Number(p.value), color: colorFor ? colorFor((p.payload as { key: string }).key) : "#16866A" }))} />
            )} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 12, fill: "#34443d" }}>
            {data.map((d) => <Cell key={d.key} fill={colorFor ? colorFor(d.key) : "#16866A"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export const categoryColor = (k: string) => CATEGORY_COLOR[k] ?? "#16866A";

// Confusion matrix as an accessible table with a single-hue (emerald) sequential ramp per row.
export function ConfusionMatrix({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <caption className="mb-2 text-left text-ink-muted">Rows: actual category · Columns: predicted. Shade = share of the actual row.</caption>
        <thead>
          <tr>
            <th className="p-1.5 text-left font-medium text-ink-muted">actual ↓ / predicted →</th>
            {labels.map((l) => <th key={l} scope="col" className="p-1.5 font-medium text-ink-soft">{label(l)}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => {
            const total = row.reduce((a, b) => a + b, 0) || 1;
            return (
              <tr key={labels[i]}>
                <th scope="row" className="p-1.5 text-left font-medium whitespace-nowrap text-ink-soft">{label(labels[i])}</th>
                {row.map((v, j) => {
                  const share = v / total;
                  const bg = `rgba(22, 134, 106, ${share === 0 ? 0 : 0.08 + share * 0.82})`;
                  return (
                    <td key={j} title={`${label(labels[i])} → ${label(labels[j])}: ${num(v)} (${(share * 100).toFixed(1)}%)`}
                      className={`tabular min-w-14 rounded border border-white p-1.5 text-center ${i === j ? "font-semibold" : ""}`}
                      style={{ background: bg, color: share > 0.55 ? "#fff" : "#34443d" }}>
                      {num(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
