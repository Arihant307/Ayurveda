/**
 * Seed a fresh database with defaults. Safe to run repeatedly: existing rows
 * (and anything edited in the admin) are left untouched.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_SESSIONS, DEFAULT_WORKING_WEEKDAYS, DOCTORS, TREATMENTS } from "./seed-data";

const prisma = new PrismaClient();

async function main() {
  await prisma.clinicSettings.upsert({
    where: { id: 1 },
    create: { id: 1, bookingWindowDays: 30, minLeadMinutes: 120 },
    update: {},
  });

  for (const doctor of DOCTORS) {
    const existing = await prisma.doctor.findUnique({ where: { slug: doctor.slug } });
    if (existing) continue;
    await prisma.doctor.create({
      data: {
        ...doctor,
        availability: {
          create: DEFAULT_WORKING_WEEKDAYS.flatMap((weekday) =>
            DEFAULT_SESSIONS.map((s) => ({ weekday, ...s })),
          ),
        },
      },
    });
    console.log(`  + doctor ${doctor.name}`);
  }

  for (const [index, treatment] of TREATMENTS.entries()) {
    const existing = await prisma.treatment.findUnique({ where: { slug: treatment.slug } });
    if (existing) continue;
    await prisma.treatment.create({
      data: { ...treatment, imageUrl: `/images/placeholders/treatment-${(index % 4) + 1}.svg` },
    });
    console.log(`  + treatment ${treatment.name}`);
  }

  const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;
  if (!email || !password) {
    console.warn("  ! SEED_OWNER_EMAIL / SEED_OWNER_PASSWORD not set — no owner account created.");
  } else if (password.length < 10) {
    throw new Error("SEED_OWNER_PASSWORD must be at least 10 characters.");
  } else {
    const existing = await prisma.admin.findUnique({ where: { email } });
    if (!existing) {
      await prisma.admin.create({
        data: {
          email,
          name: process.env.SEED_OWNER_NAME?.trim() || "Clinic Owner",
          role: "OWNER",
          passwordHash: await bcrypt.hash(password, 12),
        },
      });
      console.log(`  + owner account ${email}`);
    }
  }

  const staffEmail = process.env.SEED_STAFF_EMAIL?.trim().toLowerCase();
  const staffPassword = process.env.SEED_STAFF_PASSWORD;
  if (staffEmail && staffPassword && staffPassword.length >= 10) {
    const existing = await prisma.admin.findUnique({ where: { email: staffEmail } });
    if (!existing) {
      await prisma.admin.create({
        data: {
          email: staffEmail,
          name: process.env.SEED_STAFF_NAME?.trim() || "Front Desk",
          role: "STAFF",
          passwordHash: await bcrypt.hash(staffPassword, 12),
        },
      });
      console.log(`  + staff account ${staffEmail}`);
    }
  }
}

main()
  .then(() => console.log("Seed complete."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
