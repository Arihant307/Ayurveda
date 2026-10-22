import type { Severity } from "./types";

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

// Status colours (reserved for severity; always shown with an icon and a text label).
export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "#D64545",
  high: "#E98A36",
  medium: "#E7BC45",
  low: "#36A58A",
  info: "#9AA79F",
};

// Categorical palette (validated with the dataviz palette checker: lightness, chroma, CVD, contrast).
// Fixed order, assigned by entity — never by rank.
export const CATEGORY_COLOR: Record<string, string> = {
  brute_force: "#16866A",
  web_attack: "#9A5BA8",
  dos: "#B27A1F",
  ddos: "#C24E72",
  botnet: "#6B8E23",
  infiltration: "#A0522D",
  benign: "#B9C4BC",
};

export const CATEGORY_LABEL: Record<string, string> = {
  benign: "Benign",
  brute_force: "Brute force",
  web_attack: "Web attack",
  dos: "DoS",
  ddos: "DDoS",
  botnet: "Botnet",
  infiltration: "Infiltration",
};

export const MODULE_LABEL: Record<string, string> = {
  email: "E-mail",
  url: "URL",
  network: "Network",
  endpoint: "Endpoint",
  auth: "Authentication",
  intel: "Threat intel",
};

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function num(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-GB").format(v);
}

export function dateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function ago(v: string | null | undefined): string {
  if (!v) return "never";
  const s = Math.max(0, (Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function label(v: string): string {
  return CATEGORY_LABEL[v] ?? v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
