// End-to-end smoke test of the main flow against a running server.
// Usage: CHROMIUM_PATH=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/e2e-smoke.mjs http://localhost:3000 [screenshotDir]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const shots = process.argv[3];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const watch = (page) => {
  page.on("console", (m) => m.type() === "error" && errors.push(`${page.url()} console: ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`${page.url()} pageerror: ${e.message}`));
};
const snap = async (page, name) => shots && page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
const phone = `9${String(Date.now()).slice(-9)}`;

// ---- Patient books on a phone-sized screen ----
const mobile = await browser.newContext({ viewport: { width: 360, height: 780 } });
const p = await mobile.newPage();
watch(p);
await p.goto(`${base}/book?doctor=dr-vijay-kumar&treatment=shirodhara`, { waitUntil: "networkidle" });
await snap(p, "book-1-doctor");
await p.getByRole("button", { name: "Continue" }).click();
await p.locator('button[data-date][aria-disabled="false"]').first().waitFor();
await snap(p, "book-2-date");
await p.locator('button[data-date][aria-disabled="false"]').first().click();
await p.locator('input[type="radio"][name^="slot-"]').first().waitFor({ state: "attached" });
await snap(p, "book-3-time");
await p.locator('label:has(input[name^="slot-"])').first().click();
await p.getByRole("button", { name: "Continue" }).click();
// Inline validation check
await p.getByRole("button", { name: "Review booking" }).click();
await p.getByText("Please enter your full name.").waitFor();
await p.getByLabel("Full name").fill("Smoke Test Patient");
await p.getByLabel("Mobile number").fill(phone);
await p.getByLabel("Email").fill("patient@example.com");
await p.getByLabel("Age").fill("42");
await p.getByText("Female", { exact: true }).click();
await p.getByText("First Consultation", { exact: true }).click();
await p.getByLabel("Reason for visit").fill("General wellbeing check");
await snap(p, "book-4-details");
await p.getByRole("button", { name: "Review booking" }).click();
await p.getByRole("button", { name: "Confirm Appointment" }).waitFor();
await snap(p, "book-5-review");
await p.getByRole("button", { name: "Confirm Appointment" }).click();
await p.getByText("Your appointment is booked").waitFor({ timeout: 20000 });
const code = (await p.locator("span.font-mono").first().textContent()).trim();
await p.waitForTimeout(800);
await snap(p, "book-6-success");
console.log("Booked", code);
if (!/^KA-\d{4}-[A-Z2-9]{4}$/.test(code)) throw new Error(`Bad code ${code}`);

// ---- Admin sees it and confirms ----
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const a = await desk.newPage();
watch(a);
await a.goto(`${base}/admin`, { waitUntil: "networkidle" });
await a.getByLabel("Email").fill(process.env.ADMIN_EMAIL);
await a.getByLabel("Password").fill(process.env.ADMIN_PASSWORD);
await a.getByRole("button", { name: "Sign in" }).click();
await a.waitForURL(`${base}/admin`);
await snap(a, "admin-overview");
await a.goto(`${base}/admin/appointments?q=${code}`, { waitUntil: "networkidle" });
await a.getByRole("link", { name: "Smoke Test Patient" }).click();
await a.getByRole("button", { name: "Confirm", exact: true }).click();
await a.getByRole("button", { name: "Yes, confirm" }).click();
await a.getByText("Appointment confirmed").waitFor();
await snap(a, "admin-drawer");
await a.goto(`${base}/admin/calendar`, { waitUntil: "networkidle" });
await snap(a, "admin-calendar");
console.log("Confirmed in admin");

await browser.close();
console.log(errors.length ? `Console errors:\n${errors.join("\n")}` : "No console errors");
process.exit(errors.length ? 1 : 0);
