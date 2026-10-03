import { CLINIC, CLINIC_ADDRESS_ONE_LINE } from "@/lib/constants/clinic";

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Fold lines longer than 75 octets as required by RFC 5545. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 74) {
    out.push(rest.slice(0, 74));
    rest = ` ${rest.slice(74)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildAppointmentIcs(input: {
  code: string;
  startsAt: Date;
  endsAt: Date;
  doctorName: string;
  typeLabel: string;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kumar Ayurveda//Appointments//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.code}@kumarayurveda`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(input.startsAt)}`,
    `DTEND:${icsDate(input.endsAt)}`,
    `SUMMARY:${escapeText(`${input.typeLabel} with ${input.doctorName} — ${CLINIC.name}`)}`,
    `LOCATION:${escapeText(`${CLINIC.name}, ${CLINIC_ADDRESS_ONE_LINE}`)}`,
    `DESCRIPTION:${escapeText(
      `Appointment ID: ${input.code}\nTo reschedule or cancel, call ${CLINIC.phoneDisplay}.\nPlease arrive 10 minutes early.`,
    )}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(`Appointment at ${CLINIC.name}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadIcs(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
