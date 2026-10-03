import "server-only";
import type { Appointment, Doctor, Treatment } from "@prisma/client";
import {
  APPOINTMENT_TYPE_LABELS,
  CLINIC,
  CLINIC_ADDRESS_ONE_LINE,
  GENDER_LABELS,
  MAPS_DIRECTIONS_URL,
  siteUrl,
} from "@/lib/constants";
import { formatDateLong, formatDateTime, formatTime } from "@/lib/datetime";
import { sendEmail, type EmailMessage } from "./send";

export { sendEmail };

type AppointmentForEmail = Appointment & { doctor: Doctor; treatment?: Treatment | null };

// Brand colours mirrored from the CSS tokens in src/app/globals.css (email clients can't read CSS variables).
const C = {
  navy: "#061685",
  tealDark: "#077A71",
  teal: "#0DC0B2",
  soft: "#F5F7FF",
  ink: "#1A1F3D",
  muted: "#50567A",
  line: "#E1E5F3",
  onNavyMuted: "#C9CFF4",
  white: "#FFFFFF",
};

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.soft};font-family:Arial,Helvetica,sans-serif;color:${C.ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.white};border-radius:16px;overflow:hidden;border:1px solid ${C.line};">
<tr><td style="background:${C.navy};padding:20px 28px;border-bottom:4px solid ${C.teal};">
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:2px;color:${C.white};font-weight:bold;">KUMAR AYURVEDA</div>
  <div style="font-size:12px;color:${C.onNavyMuted};margin-top:4px;letter-spacing:1px;">AYURVEDA &amp; PANCHAKARMA · JAIPUR</div>
</td></tr>
<tr><td style="padding:28px;">${body}</td></tr>
<tr><td style="padding:18px 28px;background:${C.soft};font-size:12px;line-height:18px;color:${C.muted};border-top:1px solid ${C.line};">
  ${esc(CLINIC.name)} · ${esc(CLINIC_ADDRESS_ONE_LINE)}<br>
  Appointments: <a href="${CLINIC.phoneHref}" style="color:${C.tealDark};">${esc(CLINIC.phoneDisplay)}</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function table(rows: [string, string | null | undefined][]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;line-height:20px;">
${rows
  .map(
    ([k, v]) => `<tr>
<td style="padding:9px 12px 9px 0;border-bottom:1px solid ${C.line};color:${C.muted};width:38%;vertical-align:top;">${esc(k)}</td>
<td style="padding:9px 0;border-bottom:1px solid ${C.line};font-weight:600;vertical-align:top;white-space:pre-wrap;">${v ? esc(v) : "—"}</td>
</tr>`,
  )
  .join("\n")}
</table>`;
}

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:${C.navy};color:${C.white};text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;font-size:14px;">${esc(label)}</a>`;

const textTable = (rows: [string, string | null | undefined][]) =>
  rows.map(([k, v]) => `${k}: ${v || "—"}`).join("\n");

export function managementEmail(a: AppointmentForEmail, to: string | string[]): EmailMessage {
  const date = formatDateLong(a.startsAt);
  const time = formatTime(a.startsAt);
  const adminLink = siteUrl(`/admin/appointments?id=${a.id}`);
  const rows: [string, string | null][] = [
    ["Appointment ID", a.code],
    ["Patient name", a.patientName],
    ["Phone", a.patientPhone],
    ["Email", a.patientEmail],
    ["Age", String(a.patientAge)],
    ["Gender", GENDER_LABELS[a.patientGender]],
    ["Doctor", a.doctor.name],
    ["Date", date],
    ["Time", time],
    ["Type", APPOINTMENT_TYPE_LABELS[a.type]],
    ["Treatment of interest", a.treatment?.name ?? null],
    ["Reason", a.reason],
    ["Message", a.message],
    ["Booked at", formatDateTime(a.createdAt)],
  ];
  const subject = `New Appointment — ${a.patientName} · ${date} ${time}`;
  const html = layout(
    subject,
    `<h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:22px;color:${C.navy};">New appointment request</h1>
<p style="margin:0 0 20px;font-size:14px;color:${C.muted};">Booked online. Please confirm it with the patient.</p>
${table(rows)}
<p style="margin:24px 0 0;">${button(adminLink, "Open in admin")}</p>
<p style="margin:16px 0 0;font-size:13px;">Call the patient: <a href="tel:+91${a.patientPhone}" style="color:${C.tealDark};">${esc(a.patientPhone)}</a></p>`,
  );
  const text = `New appointment request\n\n${textTable(rows)}\n\nOpen in admin: ${adminLink}\n`;
  return { to, subject, html, text, replyTo: a.patientEmail ?? undefined };
}

export function patientEmail(a: AppointmentForEmail & { patientEmail: string }): EmailMessage {
  const date = formatDateLong(a.startsAt);
  const time = formatTime(a.startsAt);
  const rows: [string, string | null][] = [
    ["Appointment ID", a.code],
    ["Doctor", a.doctor.name],
    ["Date", date],
    ["Time", time],
    ["Appointment type", APPOINTMENT_TYPE_LABELS[a.type]],
    ["Name", a.patientName],
    ["Phone", a.patientPhone],
  ];
  const subject = `Your appointment at Kumar Ayurveda — ${date}, ${time}`;
  const html = layout(
    subject,
    `<h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:22px;color:${C.navy};">Thank you, ${esc(a.patientName.split(" ")[0])}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:22px;">We have received your appointment request. Our team may call you to confirm. Please keep your appointment ID handy.</p>
${table(rows)}
<h2 style="margin:24px 0 8px;font-size:16px;color:${C.navy};">Clinic address</h2>
<p style="margin:0;font-size:14px;line-height:21px;">${esc(CLINIC_ADDRESS_ONE_LINE)}</p>
<p style="margin:12px 0 0;">${button(MAPS_DIRECTIONS_URL, "Get directions")}</p>
<h2 style="margin:24px 0 8px;font-size:16px;color:${C.navy};">Need to reschedule or cancel?</h2>
<p style="margin:0;font-size:14px;line-height:21px;">Please call us on <a href="${CLINIC.phoneHref}" style="color:${C.tealDark};font-weight:bold;">${esc(CLINIC.phoneDisplay)}</a> and quote your appointment ID <strong>${esc(a.code)}</strong>. We kindly ask for as much notice as possible.</p>
<p style="margin:20px 0 0;font-size:13px;color:${C.muted};">Please arrive 10 minutes early and bring any previous reports or prescriptions.</p>`,
  );
  const text = `Thank you, ${a.patientName}.\n\nWe have received your appointment request. Our team may call you to confirm.\n\n${textTable(rows)}\n\nClinic address: ${CLINIC_ADDRESS_ONE_LINE}\nDirections: ${MAPS_DIRECTIONS_URL}\n\nTo reschedule or cancel, call ${CLINIC.phoneDisplay} and quote ${a.code}.\n`;
  return { to: a.patientEmail, subject, html, text };
}

/** Send both booking emails. Never throws. */
export async function sendBookingEmails(a: AppointmentForEmail): Promise<void> {
  const jobs: Promise<boolean>[] = [];
  const adminTo = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (adminTo) jobs.push(sendEmail(managementEmail(a, adminTo.split(",").map((s) => s.trim()).filter(Boolean))));
  else console.warn("[email] ADMIN_NOTIFICATION_EMAIL is not set — management email skipped");
  if (a.patientEmail) jobs.push(sendEmail(patientEmail({ ...a, patientEmail: a.patientEmail })));
  try {
    await Promise.all(jobs);
  } catch (error) {
    console.error("[email] Unexpected failure sending booking emails", error);
  }
}
