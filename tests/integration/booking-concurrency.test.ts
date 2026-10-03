import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { BookingError, createBooking, SLOT_TAKEN_MESSAGE } from "@/lib/booking";
import { addDays, istDateString, weekdayOf } from "@/lib/datetime";

const DOCTOR_SLUG = "dr-test";

/** Next date (≥ 2 days ahead) that falls on a Monday–Saturday. */
function nextWorkingDate(): string {
  let d = addDays(istDateString(new Date()), 2);
  while (weekdayOf(d) === 0) d = addDays(d, 1);
  return d;
}

const baseInput = (overrides: Record<string, unknown> = {}) => ({
  doctorSlug: DOCTOR_SLUG,
  date: nextWorkingDate(),
  time: "10:30",
  fullName: "Test Patient",
  phone: "9876543210",
  age: 34,
  gender: "FEMALE",
  type: "FIRST_CONSULTATION",
  reason: "General wellbeing consultation",
  ...overrides,
});

beforeEach(async () => {
  await db.appointmentLog.deleteMany();
  await db.appointment.deleteMany();
  await db.patient.deleteMany();
  await db.blockedDate.deleteMany();
  await db.doctorAvailability.deleteMany();
  await db.doctor.deleteMany();
  await db.clinicSettings.upsert({
    where: { id: 1 },
    create: { id: 1, bookingWindowDays: 30, minLeadMinutes: 120 },
    update: { bookingWindowDays: 30, minLeadMinutes: 120 },
  });
  await db.doctor.create({
    data: {
      slug: DOCTOR_SLUG,
      name: "Dr. Test",
      availability: {
        create: [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
          { weekday, startTime: "10:00", endTime: "13:30", slotMinutes: 30 },
          { weekday, startTime: "17:00", endTime: "20:00", slotMinutes: 30 },
        ]),
      },
    },
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("booking race safety", () => {
  it("two simultaneous bookings for the same slot: exactly one succeeds", async () => {
    const results = await Promise.allSettled([
      createBooking(baseInput({ phone: "9876500001", fullName: "Patient One" })),
      createBooking(baseInput({ phone: "9876500002", fullName: "Patient Two" })),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(BookingError);
    expect(rejected[0].reason).toMatchObject({ code: "SLOT_TAKEN", status: 409, message: SLOT_TAKEN_MESSAGE });

    expect(await db.appointment.count()).toBe(1);
  });

  it("ten simultaneous bookings for the same slot: exactly one succeeds", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        createBooking(baseInput({ phone: `98765000${String(i).padStart(2, "0")}` })),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.appointment.count()).toBe(1);
  });

  it("the database itself rejects a second active appointment at the same start time", async () => {
    const first = await createBooking(baseInput());
    const patient = await db.patient.create({ data: { phone: "9000000000", name: "Direct Insert" } });
    await expect(
      db.appointment.create({
        data: {
          code: "KA-0000-TEST",
          doctorId: first.doctorId,
          patientId: patient.id,
          startsAt: first.startsAt,
          endsAt: first.endsAt,
          type: "FOLLOW_UP",
          patientName: "Direct Insert",
          patientPhone: "9000000000",
          patientAge: 40,
          patientGender: "MALE",
          reason: "Bypassing the service",
        },
      }),
    ).rejects.toThrow();
  });

  it("a cancelled appointment frees its slot", async () => {
    const first = await createBooking(baseInput());
    await db.appointment.update({ where: { id: first.id }, data: { status: "CANCELLED" } });
    const second = await createBooking(baseInput({ phone: "9876511111" }));
    expect(second.startsAt.getTime()).toBe(first.startsAt.getTime());
  });
});

describe("booking rules", () => {
  it("blocks the same phone holding two active appointments with one doctor on one day", async () => {
    await createBooking(baseInput({ time: "10:30" }));
    await expect(createBooking(baseInput({ time: "17:00" }))).rejects.toMatchObject({
      code: "DUPLICATE",
      status: 409,
    });
  });

  it("upserts the patient by phone number and stores a booking snapshot", async () => {
    await createBooking(baseInput({ time: "10:30", fullName: "Asha" }));
    const date2 = addDays(nextWorkingDate(), weekdayOf(addDays(nextWorkingDate(), 1)) === 0 ? 2 : 1);
    const b = await createBooking(baseInput({ date: date2, time: "11:00", fullName: "Asha Verma", phone: "+91 98765 43210" }));
    expect(await db.patient.count()).toBe(1);
    const patient = await db.patient.findUniqueOrThrow({ where: { phone: "9876543210" } });
    expect(patient.name).toBe("Asha Verma");
    expect(b.patientName).toBe("Asha Verma");
    expect(b.code).toMatch(/^KA-\d{4}-[A-Z2-9]{4}$/);
  });

  it("re-validates fields server-side", async () => {
    await expect(createBooking(baseInput({ phone: "12345", age: 0 }))).rejects.toMatchObject({
      code: "VALIDATION",
      status: 400,
    });
  });

  it("rejects a time that is not on the schedule", async () => {
    await expect(createBooking(baseInput({ time: "15:00" }))).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  it("rejects a clinic holiday", async () => {
    const date = nextWorkingDate();
    await db.blockedDate.create({ data: { date: new Date(`${date}T00:00:00Z`), reason: "Holiday" } });
    await expect(createBooking(baseInput({ date }))).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });
});
