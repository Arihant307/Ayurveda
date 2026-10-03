"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DayStatus } from "@/lib/availability/engine";
import { addDays, addMonths, daysInMonth, formatDateStringLong, formatMonth, istDateString, weekdayOf } from "@/lib/datetime";
import { apiFetch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

type CalendarData = { days: { date: string; status: DayStatus }[]; firstBookable: string; lastBookable: string };

const STATUS_TEXT: Record<DayStatus, string> = {
  available: "available",
  full: "fully booked",
  closed: "clinic closed",
  holiday: "clinic holiday",
  leave: "doctor unavailable",
  past: "not available",
  "beyond-window": "not yet open for booking",
};

const WEEK_HEADERS = [
  ["Mon", "Monday"],
  ["Tue", "Tuesday"],
  ["Wed", "Wednesday"],
  ["Thu", "Thursday"],
  ["Fri", "Friday"],
  ["Sat", "Saturday"],
  ["Sun", "Sunday"],
] as const;

/** Monday-first column index for a date. */
const column = (date: string) => (weekdayOf(date) + 6) % 7;

export function BookingCalendar({
  doctorSlug,
  value,
  onChange,
  admin = false,
  excludeId,
}: {
  doctorSlug: string;
  value?: string;
  onChange: (date: string) => void;
  admin?: boolean;
  excludeId?: string;
}) {
  const today = istDateString(new Date());
  const [month, setMonth] = useState((value ?? today).slice(0, 7));
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [focusDate, setFocusDate] = useState<string>(value ?? today);
  const [reloadKey, setReloadKey] = useState(0);
  const cache = useRef(new Map<string, CalendarData>());
  const gridRef = useRef<HTMLTableElement>(null);
  const wantFocus = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const key = `${doctorSlug}|${month}|${admin}|${excludeId ?? ""}`;
    const cached = cache.current.get(key);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ doctor: doctorSlug, month });
    if (admin) qs.set("admin", "1");
    if (excludeId) qs.set("exclude", excludeId);
    apiFetch<CalendarData>(`/api/availability/calendar?${qs}`).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        cache.current.set(key, res.data);
        setData(res.data);
        // Jump to the first bookable month if we started before it.
        if (month < res.data.firstBookable.slice(0, 7)) setMonth(res.data.firstBookable.slice(0, 7));
      } else {
        setError(res.message);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [doctorSlug, month, admin, excludeId, reloadKey]);

  const statusByDate = useMemo(() => new Map(data?.days.map((d) => [d.date, d.status]) ?? []), [data]);
  const minMonth = data?.firstBookable.slice(0, 7) ?? today.slice(0, 7);
  const maxMonth = data?.lastBookable.slice(0, 7) ?? today.slice(0, 7);
  const canPrev = month > minMonth;
  const canNext = month < maxMonth;

  const weeks = useMemo(() => {
    const first = `${month}-01`;
    const cells: (string | null)[] = Array(column(first)).fill(null);
    for (let i = 0; i < daysInMonth(month); i++) cells.push(addDays(first, i));
    while (cells.length % 7) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [month]);

  // Keep the roving focus target inside the visible month.
  const focusTarget = focusDate.startsWith(month) ? focusDate : (value?.startsWith(month) ? value : `${month}-01`);

  useEffect(() => {
    if (!wantFocus.current || loading) return;
    wantFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`button[data-date="${focusTarget}"]`)?.focus();
  }, [focusTarget, loading, month]);

  const moveFocus = useCallback(
    (next: string) => {
      const nextMonth = next.slice(0, 7);
      if (nextMonth < minMonth || nextMonth > maxMonth) return;
      wantFocus.current = true;
      setFocusDate(next);
      if (nextMonth !== month) setMonth(nextMonth);
    },
    [minMonth, maxMonth, month],
  );

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, date: string) {
    const map: Record<string, () => string> = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      ArrowUp: () => addDays(date, -7),
      ArrowDown: () => addDays(date, 7),
      Home: () => addDays(date, -column(date)),
      End: () => addDays(date, 6 - column(date)),
      PageUp: () => `${addMonths(date.slice(0, 7), -1)}-01`,
      PageDown: () => `${addMonths(date.slice(0, 7), 1)}-01`,
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      moveFocus(fn());
    }
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line/70 bg-white p-3 shadow-soft sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, -1))}
          disabled={!canPrev}
          className="flex size-11 items-center justify-center rounded-full text-green hover:bg-green-soft disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Previous month"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <h3 className="font-serif text-2xl font-semibold" aria-live="polite" id={`cal-${month}`}>
          {formatMonth(month)}
        </h3>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          disabled={!canNext}
          className="flex size-11 items-center justify-center rounded-full text-green hover:bg-green-soft disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Next month"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      {error ? (
        <Alert tone="error" title="We couldn't load available dates." action={<Button size="sm" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>}>
          {error}
        </Alert>
      ) : (
        <table ref={gridRef} className="w-full table-fixed border-separate border-spacing-1" aria-labelledby={`cal-${month}`} aria-busy={loading}>
          <thead>
            <tr>
              {WEEK_HEADERS.map(([short, long]) => (
                <th key={short} scope="col" className="pb-1 text-xs font-bold uppercase tracking-wide text-muted">
                  <abbr title={long} className="no-underline">
                    {short}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody key={month} className="animate-fade-in">
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((date, di) => {
                  if (!date) return <td key={di} />;
                  const status = loading ? undefined : statusByDate.get(date);
                  const available = status === "available";
                  const selected = value === date;
                  const isToday = date === today;
                  return (
                    <td key={date} className="p-0">
                      <button
                        type="button"
                        data-date={date}
                        tabIndex={date === focusTarget ? 0 : -1}
                        aria-disabled={!available}
                        aria-pressed={selected}
                        aria-label={`${formatDateStringLong(date)}${status ? `, ${STATUS_TEXT[status]}` : ""}${isToday ? ", today" : ""}`}
                        onKeyDown={(e) => onKeyDown(e, date)}
                        onFocus={() => setFocusDate(date)}
                        onClick={() => available && onChange(date)}
                        className={cn(
                          "relative flex aspect-square w-full flex-col items-center justify-center rounded-xl text-[0.95rem] transition-colors duration-150 sm:text-base",
                          loading && "animate-pulse bg-cream-deep/60 text-transparent",
                          !loading && selected && "bg-green font-bold text-white shadow-soft",
                          !loading && !selected && available && "bg-green-soft/60 font-semibold text-green-deep hover:bg-green-soft hover:ring-2 hover:ring-teal",
                          !loading && !available && status === "full" && "cursor-not-allowed text-muted line-through decoration-muted/60",
                          !loading && !available && status !== "full" && "cursor-not-allowed text-muted/45",
                        )}
                      >
                        {Number(date.slice(8))}
                        {isToday && !loading && (
                          <span className={cn("absolute bottom-1 size-1 rounded-full", selected ? "bg-white" : "bg-teal-deep")} aria-hidden="true" />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-green-soft ring-1 ring-green/30" aria-hidden="true" /> Available
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-green" aria-hidden="true" /> Selected
        </li>
        <li className="flex items-center gap-1.5">
          <span className="text-muted line-through" aria-hidden="true">00</span> Fully booked
        </li>
        <li className="flex items-center gap-1.5">
          <span className="text-muted/45" aria-hidden="true">00</span> Unavailable
        </li>
      </ul>
    </div>
  );
}
