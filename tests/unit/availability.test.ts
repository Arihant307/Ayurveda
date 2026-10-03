import { describe, expect, it } from "vitest";
import {
  bookableDateRange,
  checkSlot,
  daySlots,
  dayStatus,
  scheduledSlots,
  summariseTimings,
  type DoctorSchedule,
  type Session,
} from "@/lib/availability/engine";
import { istToUtc } from "@/lib/datetime";

const RULES = { bookingWindowDays: 30, minLeadMinutes: 120 };
const weekdaySessions = (weekdays: number[]): Session[] =>
  weekdays.flatMap((weekday) => [
    { weekday, startTime: "10:00", endTime: "13:30", slotMinutes: 30 },
    { weekday, startTime: "17:00", endTime: "20:00", slotMinutes: 30 },
  ]);

const schedule = (over: Partial<DoctorSchedule> = {}): DoctorSchedule => ({
  sessions: weekdaySessions([1, 2, 3, 4, 5, 6]),
  clinicHolidays: new Set(),
  leaveDates: new Set(),
  busy: [],
  ...over,
});

// 2026-10-05 is a Monday; 2026-10-04 is a Sunday.
const MONDAY = "2026-10-05";
const SUNDAY = "2026-10-04";
/** Friday 2 Oct 2026, 09:00 IST */
const NOW = istToUtc("2026-10-02", "09:00");

describe("scheduledSlots", () => {
  it("generates slots for every session that fit entirely inside it", () => {
    const slots = scheduledSlots(MONDAY, weekdaySessions([1]));
    expect(slots.map((s) => s.time)).toEqual([
      "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00",
      "17:00", "17:30", "18:00", "18:30", "19:00", "19:30",
    ]);
  });

  it("treats the gap between sessions as a break", () => {
    const times = scheduledSlots(MONDAY, weekdaySessions([1])).map((s) => s.time);
    expect(times).not.toContain("13:30");
    expect(times).not.toContain("15:00");
  });

  it("drops a final partial slot that would overrun the session", () => {
    const slots = scheduledSlots(MONDAY, [{ weekday: 1, startTime: "10:00", endTime: "11:10", slotMinutes: 30 }]);
    expect(slots.map((s) => s.time)).toEqual(["10:00", "10:30"]);
  });

  it("converts clinic time (IST) to the right UTC instant", () => {
    const [first] = scheduledSlots(MONDAY, weekdaySessions([1]));
    expect(first.startsAt.toISOString()).toBe("2026-10-05T04:30:00.000Z");
    expect(first.endsAt.toISOString()).toBe("2026-10-05T05:00:00.000Z");
  });

  it("groups slots into morning and evening", () => {
    const slots = scheduledSlots(MONDAY, weekdaySessions([1]));
    expect(slots.filter((s) => s.period === "morning")).toHaveLength(7);
    expect(slots.filter((s) => s.period === "evening")).toHaveLength(6);
  });

  it("respects per-session slot length", () => {
    const slots = scheduledSlots(MONDAY, [{ weekday: 1, startTime: "09:00", endTime: "10:00", slotMinutes: 20 }]);
    expect(slots.map((s) => s.time)).toEqual(["09:00", "09:20", "09:40"]);
  });
});

describe("dayStatus", () => {
  it("is available on a normal working day", () => {
    expect(dayStatus(MONDAY, schedule(), NOW, RULES)).toBe("available");
  });

  it("is closed on a non-working day", () => {
    expect(dayStatus(SUNDAY, schedule(), NOW, RULES)).toBe("closed");
  });

  it("is past for dates before today", () => {
    expect(dayStatus("2026-10-01", schedule(), NOW, RULES)).toBe("past");
  });

  it("is beyond-window after the booking window", () => {
    const { last } = bookableDateRange(NOW, RULES);
    expect(last).toBe("2026-10-31");
    expect(dayStatus("2026-10-31", schedule(), NOW, RULES)).toBe("available");
    expect(dayStatus("2026-11-02", schedule(), NOW, RULES)).toBe("beyond-window");
  });

  it("blocks clinic holidays", () => {
    expect(dayStatus(MONDAY, schedule({ clinicHolidays: new Set([MONDAY]) }), NOW, RULES)).toBe("holiday");
  });

  it("blocks doctor leave", () => {
    expect(dayStatus(MONDAY, schedule({ leaveDates: new Set([MONDAY]) }), NOW, RULES)).toBe("leave");
  });

  it("is full when every slot is booked", () => {
    const busy = scheduledSlots(MONDAY, weekdaySessions([1])).map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt }));
    expect(dayStatus(MONDAY, schedule({ busy }), NOW, RULES)).toBe("full");
  });

  it("treats today as past once the remaining slots are inside the lead time", () => {
    const lateFriday = istToUtc("2026-10-02", "19:00");
    expect(dayStatus("2026-10-02", schedule(), lateFriday, RULES)).toBe("past");
  });
});

describe("daySlots", () => {
  it("marks booked slots unavailable", () => {
    const busy = [{ startsAt: istToUtc(MONDAY, "10:30"), endsAt: istToUtc(MONDAY, "11:00") }];
    const slots = daySlots(MONDAY, schedule({ busy }), NOW, RULES);
    expect(slots.find((s) => s.time === "10:30")).toMatchObject({ available: false, reason: "booked" });
    expect(slots.find((s) => s.time === "10:00")?.available).toBe(true);
    expect(slots.find((s) => s.time === "11:00")?.available).toBe(true);
  });

  it("blocks any slot overlapping a longer existing appointment", () => {
    const busy = [{ startsAt: istToUtc(MONDAY, "10:15"), endsAt: istToUtc(MONDAY, "11:15") }];
    const slots = daySlots(MONDAY, schedule({ busy }), NOW, RULES);
    const unavailable = slots.filter((s) => !s.available).map((s) => s.time);
    expect(unavailable).toEqual(["10:00", "10:30", "11:00"]);
  });

  it("hides times inside the minimum lead time today", () => {
    const fridayMorning = istToUtc("2026-10-02", "10:10");
    const slots = daySlots("2026-10-02", schedule(), fridayMorning, RULES);
    const open = slots.filter((s) => s.available).map((s) => s.time);
    expect(open[0]).toBe("12:30"); // 10:10 + 2h = 12:10 → next slot 12:30
    expect(slots.find((s) => s.time === "12:00")).toMatchObject({ available: false, reason: "too-soon" });
  });

  it("returns nothing for a blocked date", () => {
    expect(daySlots(MONDAY, schedule({ leaveDates: new Set([MONDAY]) }), NOW, RULES)).toEqual([]);
  });
});

describe("checkSlot", () => {
  it("accepts a free, scheduled slot", () => {
    const result = checkSlot(MONDAY, "17:30", schedule(), NOW, RULES);
    expect(result.ok).toBe(true);
  });

  it("rejects a time not on the schedule", () => {
    expect(checkSlot(MONDAY, "15:00", schedule(), NOW, RULES)).toMatchObject({ ok: false, reason: "invalid-time" });
    expect(checkSlot(MONDAY, "10:15", schedule(), NOW, RULES)).toMatchObject({ ok: false, reason: "invalid-time" });
  });

  it("rejects a booked slot", () => {
    const busy = [{ startsAt: istToUtc(MONDAY, "17:30"), endsAt: istToUtc(MONDAY, "18:00") }];
    expect(checkSlot(MONDAY, "17:30", schedule({ busy }), NOW, RULES)).toMatchObject({ ok: false, reason: "booked" });
  });

  it("rejects an unavailable date", () => {
    expect(checkSlot(SUNDAY, "10:00", schedule(), NOW, RULES)).toMatchObject({
      ok: false,
      reason: "date-unavailable",
      dayStatus: "closed",
    });
  });

  it("handles the IST date boundary (late UTC evening is next day in Jaipur)", () => {
    // 2026-10-04T19:00Z is 00:30 IST on Monday 5 October.
    const now = new Date("2026-10-04T19:00:00Z");
    expect(checkSlot(MONDAY, "10:00", schedule(), now, RULES).ok).toBe(true);
    expect(dayStatus(SUNDAY, schedule(), now, RULES)).toBe("past");
  });
});

describe("summariseTimings", () => {
  it("groups consecutive weekdays with identical sessions", () => {
    const groups = summariseTimings(weekdaySessions([1, 2, 3, 4, 5, 6]));
    expect(groups).toHaveLength(2);
    expect(groups[0].days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(groups[0].sessions).toEqual([
      { startTime: "10:00", endTime: "13:30" },
      { startTime: "17:00", endTime: "20:00" },
    ]);
    expect(groups[1]).toEqual({ days: [0], sessions: [] });
  });
});
