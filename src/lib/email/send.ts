import "server-only";
import { Resend } from "resend";

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

let client: Resend | null = null;

/**
 * Send one email. Never throws: failures are logged and reported as `false`
 * so that an email problem can never fail a booking.
 * Without RESEND_API_KEY (local development) the email is printed to the console.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Kumar Ayurveda <onboarding@resend.dev>";

  if (!apiKey) {
    console.info(
      [
        "──────── EMAIL (not sent: RESEND_API_KEY is not set) ────────",
        `From:    ${from}`,
        `To:      ${[message.to].flat().join(", ")}`,
        `Subject: ${message.subject}`,
        "",
        message.text,
        "──────────────────────────────────────────────────────────────",
      ].join("\n"),
    );
    return true;
  }

  try {
    client ??= new Resend(apiKey);
    const { error } = await client.emails.send({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
    });
    if (error) {
      console.error("[email] Resend rejected message", { subject: message.subject, error });
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] Failed to send", { subject: message.subject, error });
    return false;
  }
}
