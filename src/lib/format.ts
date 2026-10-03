import { WEEKDAY_NAMES, WEEKDAY_SHORT, formatTimeString } from "@/lib/datetime";

/** "Monday – Saturday" / "Sunday" / "Mon, Wed" */
export function formatDayGroup(days: number[], short = false): string {
  const names = short ? WEEKDAY_SHORT : WEEKDAY_NAMES;
  if (days.length === 1) return names[days[0]];
  if (days.length === 7) return "Every day";
  return `${names[days[0]]} – ${names[days[days.length - 1]]}`;
}

export function formatSessions(sessions: { startTime: string; endTime: string }[]): string {
  if (sessions.length === 0) return "Closed";
  return sessions.map((s) => `${formatTimeString(s.startTime)} – ${formatTimeString(s.endTime)}`).join(", ");
}

export function initials(name: string): string {
  return name
    .replace(/^Dr\.?\s*/i, "")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
