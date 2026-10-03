# Kumar Ayurveda — Clinic Website & Online Booking

The website, online booking and admin dashboard for **Kumar Ayurveda**, an Ayurveda & Panchakarma clinic at S-8, JDA Central Market, Amrapali Circle, Vaishali Nagar, Jaipur.

- **Public site:** Home, About, Doctors, Treatments, Panchakarma, Contact, plus the Privacy, Terms and Medical Disclaimer pages
- **Online booking** at `/book`: doctor → date → time → details → review → confirmation (with an appointment ID, an .ics calendar file, and call and directions links)
- **Admin** at `/admin`: overview, appointments, calendar, doctors, schedules and holidays, treatments, testimonials and messages

**Stack:** Next.js 15 (App Router), TypeScript (strict), Tailwind CSS v4, PostgreSQL with Prisma, Zod, Resend, bcrypt with JWT (jose) in an httpOnly cookie, and Vitest. All dates and times are in Asia/Kolkata.

---

## 1. Local setup

You need Node.js 20 or later and PostgreSQL 14 or later.

```bash
npm install
cp .env.example .env          # then fill in the values (see below)
npx prisma migrate deploy     # create the tables
npm run db:seed               # doctors, treatments, default schedule, owner account
npm run dev                   # http://localhost:3000
```

Sign in at `http://localhost:3000/admin` with `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD`.

Without `RESEND_API_KEY`, emails are **printed to the terminal** instead of being sent.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` / `npm start` | Make a production build, then run it |
| `npm run lint` · `npm run typecheck` | Run ESLint and `tsc --noEmit` |
| `npm test` | Run all tests (unit and integration) |
| `npm run test:unit` | Run the availability engine tests (no database needed) |
| `npm run test:integration` | Run the booking and race-condition tests against a **separate test database** |
| `npm run db:migrate` | Create a new migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Seed defaults. Safe to re-run: it never overwrites existing data |

The integration tests use `TEST_DATABASE_URL`. The default is `postgresql://postgres:postgres@localhost:5432/kumar_ayurveda_test`. Create that database first, with `createdb kumar_ayurveda_test`. The tests apply migrations themselves and **delete the data in that database**.

---

## 2. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string. Also needed at build time, because public pages are pre-rendered from the database. |
| `NEXT_PUBLIC_SITE_URL` | ✅ | Public URL with no trailing slash, e.g. `https://kumarayurveda.in`. Used for canonical URLs, the sitemap, Open Graph tags and the links in emails. |
| `AUTH_SECRET` | ✅ | A random string of at least 32 characters, used to sign admin sessions. Generate one with `openssl rand -base64 48`. |
| `RESEND_API_KEY` | prod | Resend API key. If it is empty, emails are logged to the console. |
| `EMAIL_FROM` | prod | Sender, e.g. `Kumar Ayurveda <appointments@kumarayurveda.in>`. It must be on a domain verified in Resend. |
| `ADMIN_NOTIFICATION_EMAIL` | prod | Who receives the "New Appointment" email. Separate several addresses with commas. |
| `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` / `SEED_OWNER_NAME` | seed | Creates the first OWNER account. The password must be at least 10 characters. |
| `SEED_STAFF_EMAIL` / `SEED_STAFF_PASSWORD` / `SEED_STAFF_NAME` | optional | Creates an optional STAFF (front-desk) account. |
| `TEST_DATABASE_URL` | tests | The database used by the integration tests. |

Secrets are read only from environment variables. `.env` is git-ignored.

---

## 3. Deployment (Vercel with managed Postgres)

1. **Create a database** with Neon, Supabase or Vercel Postgres, and copy its connection string. Add `?sslmode=require` if your provider asks for it. With a pooled connection on Neon or Supabase, use the pooled URL for `DATABASE_URL`.
2. **Import the GitHub repo into Vercel.** The framework preset is Next.js and the build command is `npm run build`, which runs `prisma generate`.
3. **Add the environment variables** from section 2 under *Project → Settings → Environment Variables*.
4. **Run migrations and seed once** from your computer, pointing at the production database:
   ```bash
   DATABASE_URL="<production url>" npx prisma migrate deploy
   DATABASE_URL="<production url>" SEED_OWNER_EMAIL=... SEED_OWNER_PASSWORD=... npm run db:seed
   ```
   For later releases, run `prisma migrate deploy` before or as part of each deploy. One way is to set the build command to `prisma migrate deploy && npm run build`.
5. **Set up Resend:** verify your domain, create an API key, and set `RESEND_API_KEY` and `EMAIL_FROM`.
6. **Add your domain** in Vercel and update `NEXT_PUBLIC_SITE_URL` to match.
7. **Submit `https://<domain>/sitemap.xml`** in Google Search Console.

Booking emails are sent with Next.js `after()`, once the database transaction has committed. On Vercel this runs after the response has gone back to the patient, so slow email never slows down a booking, and a failed email never fails one.

---

## 4. Everyday admin tasks

### Add a doctor
1. Go to **Admin → Doctors → Add doctor**.
2. Fill in the name and, optionally, qualification, specialisation, experience, biography and areas of expertise, and upload a photo. Empty fields are simply hidden on the website.
3. Save. The doctor starts with the clinic's default hours: Mon–Sat, 10:00–13:30 and 17:00–20:00, in 30-minute slots.
4. Go to **Admin → Schedules & holidays**, choose the doctor, adjust their weekly hours and click **Save working hours**.

To stop showing a doctor, choose **Deactivate**. This is a soft delete: their past appointments and history are kept, and you can reactivate them at any time.

### Add a holiday or a doctor's leave
1. Go to **Admin → Schedules & holidays**.
2. For a day when the whole clinic is closed, use **Clinic holidays**. For one doctor being away, choose that doctor and use **leave** below their schedule.
3. Pick a date, or a **From/To** range, add a reason such as "Diwali", and click **Block**.

Online booking closes for those dates immediately. Appointments that already exist on those dates are **not** cancelled automatically. The admin shows a warning naming how many there are, so you can reschedule or cancel them.

### Online booking rules
**Schedules & holidays → Online booking rules** sets how many days ahead patients can book (default 30) and how close to a slot online booking stops (default 2 hours).

### Roles
- **OWNER** can do everything.
- **STAFF** sees only Overview, Appointments and Calendar. They can confirm, complete, cancel and reschedule appointments.

New staff accounts are currently created with the seed variables (section 2). There is no user-management screen yet.

---

## 5. How it works

```
src/
  app/(site)/…        public pages (ISR, refreshed when content changes in the admin)
  app/admin/…         admin pages (server-rendered, protected by middleware.ts)
  app/api/…           route handlers (public: availability, appointments, contact; admin: /api/admin/*)
  components/{ui,site,booking,admin}
  lib/
    availability/     engine.ts (pure) + index.ts (DB loader): the only place slots are computed
    booking/          createBooking / changeStatus / rescheduleAppointment
    validation/       Zod schemas shared by browser and server
    auth/             session (jose, edge-safe), bcrypt, role guards, login rate limiting
    email/            Resend sender + branded HTML/plain-text templates
    constants/        clinic facts, labels, logo paths
    datetime.ts       Asia/Kolkata helpers
prisma/               schema, migrations, seed
tests/                unit (engine) + integration (concurrency, rules)
scripts/              screenshot + end-to-end smoke scripts (Playwright)
```

- **Availability is never stored.** Slots are computed from the weekly sessions, holidays, leave, existing appointments, the booking window and the minimum lead time. A single engine serves the calendar API, the slots API, the booking endpoint and admin rescheduling.
- **Race safety:** each booking runs in a transaction that takes a Postgres advisory lock for that doctor and day, and another for the phone number. It then re-checks the slot and inserts the appointment. A **partial unique index** on `(doctorId, startsAt) WHERE status <> 'CANCELLED'` is the database-level backstop. A conflict returns **409** with "That time was just booked — please pick another", and the booking page refreshes the slot list. `tests/integration/booking-concurrency.test.ts` fires 2 and then 10 simultaneous bookings for the same slot and asserts that exactly one succeeds.
- **Duplicate rule:** one phone number can hold only one active (pending or confirmed) appointment with the same doctor on the same day.
- **Patients** are upserted by phone number. Each appointment also keeps a snapshot of the details exactly as entered at booking time.
- Every status change and reschedule is written to `AppointmentLog` with the staff member's name, and is shown in the appointment drawer.
- **Uploaded images** are stored in Postgres (the `Upload` table), are limited to 3 MB, and are served with long-lived cache headers from `/api/uploads/[id]`. No extra storage service is needed.

### Colour theme
All colours come from the Kumar Ayurveda logo and are defined once, as CSS variables in `src/app/globals.css`, which are mapped to Tailwind classes such as `bg-navy`, `text-teal-dark` and `bg-soft`. Components use only those classes.

| Token | Hex | Used for |
|---|---|---|
| `navy` / `navy-dark` | #061685 / #040E5C | primary buttons, headings, navigation, footer, admin sidebar, selected date/time · hover |
| `teal` / `teal-dark` | #0DC0B2 / #077A71 | secondary buttons, icons, botanical decoration, available dates/slots · teal text, links, focus rings |
| `magenta` → `violet` | #E01993 → #5B1BCA | accent gradient only (`bg-accent-gradient`, `text-accent-gradient`): heading underlines, hero highlight words, booking progress, confirmation tick, badge dots |
| `white` / `soft` | #FFFFFF / #F5F7FF | page background / alternate sections and cards |
| `ink` / `muted` | #1A1F3D / #50567A | body text / secondary text |
| `amber`, `danger` | — | admin statuses only (Pending = amber, Confirmed = navy, Completed = teal, Cancelled = red) |

All text pairs meet WCAG AA. White text on magenta is only 4.44:1, so gradient badges use navy text with a gradient dot instead. Emails, the Open Graph image and the root error page can't read CSS variables, so they repeat these hex values. Each of those places has a comment pointing back to `globals.css`.

### Verification scripts
```bash
# Screenshots at 360/768/1280/1536 px, plus reports of console errors and horizontal overflow
WIDTHS=360,768,1280,1536 node scripts/screenshots.mjs http://localhost:3000 ./shots / /book /contact
# Full flow: book on a phone-sized screen → sign in to admin → confirm
ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/e2e-smoke.mjs http://localhost:3000
```
These need a Chromium for Playwright. Set `CHROMIUM_PATH` to use an installed browser.

---

## 6. Things the clinic should replace or confirm

- **Logo:** `public/brand/logo.png` was cut out, on a transparent background, from the clinic's Gandhi Jayanti post artwork. It is about 230 × 140 px, which is sharp at the sizes used on the site. `logo-on-dark.png` is the same cut-out with only the navy lettering turned white, matching the white-text version on the clinic's own dark-background material. The favicon (`src/app/icon.png`, `apple-icon.png`) is the leaf-and-cross mark from the same cut-out. **For best quality, replace these with the original high-resolution logo files** if the designer has them: keep the file names and update the width and height in `src/lib/constants/brand.ts`.
- **Photos:** everything in `public/images/placeholders/` is a placeholder labelled "PHOTO PLACEHOLDER". Upload doctor and treatment photos in the admin. Replace `clinic.svg`, used on Home and About, with a real photo of the clinic.
- **Doctor qualifications and experience** are deliberately left empty for the clinic to fill in under Admin → Doctors. The short bios and areas of expertise are neutral drafts; please review them.
- **Map coordinates** in `src/lib/constants/clinic.ts` (`26.9118, 75.7426`) are an approximation of Amrapali Circle. Confirm them using the clinic's Google Maps pin.
- **Social links** are `#` placeholders, in `CLINIC.social`.
- **Legal pages** are sensible starting drafts, not legal advice. Have them reviewed.

## 7. Assumptions made

1. **Logo** — cut out from the clinic's social-media artwork; no original vector or high-resolution file was available (see above).
2. **Time zone** — Asia/Kolkata has no daylight saving, so clinic time is converted with a fixed +05:30 offset. Instants are stored in UTC (`timestamptz`); holidays and leave are stored as calendar dates (`DATE`).
3. **Appointment ID** — `KA-YYMM-XXXX`. `YYMM` is the month the booking was **made** (clinic time). `XXXX` is 4 random characters from an unambiguous alphabet (no 0/O/1/I), and is checked for uniqueness.
4. **Booking window** — "30 days" means today plus the next 29 days. The minimum lead time defaults to 2 hours. Both can be changed in the admin.
5. **Admin rescheduling** uses the same engine. It ignores the online lead time, so staff can move someone to a slot later the same day, but it never allows a past time, a booked slot, a holiday or leave.
6. **Morning / Evening** — slots starting before 3:00 PM are grouped under *Morning*, the rest under *Evening*.
7. **Statuses** — new online bookings start as **Pending**. Allowed changes: Pending → Confirmed / Completed / Cancelled, and Confirmed → Completed / Cancelled. Completed and Cancelled are final. Cancelled appointments free their slot; completed ones keep it.
8. **Duplicate rule** — this counts Pending and Confirmed appointments only. The same phone number can still book a *different* doctor on the same day.
9. **Opening hours** shown on the site (footer, Contact, JSON-LD) are **derived from the doctors' schedules**: the combined hours of all active doctors. They are not maintained separately.
10. **Treatments in booking** — a treatment chosen through `?treatment=` is stored with the appointment as the "treatment of interest". The consultation slot length always comes from the doctor's schedule.
11. **Login rate limiting** — 5 failed attempts per email, or 20 per IP address, in 15 minutes. This is stored in the database so it works across serverless instances. A session lasts 12 hours.
12. **Contact form** — messages are saved to the database (Admin → Messages). No email is sent for them, and a hidden honeypot field filters out spam bots.
13. **Testimonials** — the home page shows a friendly empty state until a testimonial from a real patient is added and published in the admin.
14. **Fonts** — Cormorant Garamond (headings), Source Sans 3 (body) and Mukta (Devanagari) are self-hosted from `src/app/fonts` through `next/font/local`.
15. **"bcrypt"** is provided by `bcryptjs`, a pure-JavaScript bcrypt implementation (cost 12) that runs on any host without native builds.
16. The **Sanskrit quotation** on the home page ("स्वस्थस्य स्वास्थ्य रक्षणम्", Charaka Samhita) is a commonly cited classical line and is used decoratively.
