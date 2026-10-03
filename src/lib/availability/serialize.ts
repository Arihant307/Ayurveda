import type { Slot } from "./engine";

/** JSON shape of a slot sent to browsers. */
export type SlotDTO = { time: string; startsAt: string; period: "morning" | "evening"; available: boolean };

export const toSlotDTO = (s: Slot): SlotDTO => ({
  time: s.time,
  startsAt: s.startsAt.toISOString(),
  period: s.period,
  available: s.available,
});
