import nodemailer from "nodemailer";
import { passwordResetEmailHtml, passwordResetEmailText } from "@/lib/email-templates/password-reset";

// The minimal shape we depend on — lets tests inject a mock instead of a
// real nodemailer transport, mirroring the Pick<PrismaClient, ...> pattern
// used across this codebase's other lib modules.
export type Mailer = {
  sendMail: (message: {
    to: string;
    from: string;
    subject: string;
    html: string;
    text: string;
  }) => Promise<unknown>;
};

// Builds a real Gmail SMTP transport. Deliberately not unit-tested — it's
// thin wiring around nodemailer's own transport construction, the same way
// src/lib/prisma.ts's real client construction isn't unit-tested either.
// Requires GMAIL_USER / GMAIL_APP_PASSWORD to be set (see .env.example).
export function createMailer(): Mailer {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

// Never throws — a failed send is logged and swallowed here so callers
// (server actions) can stay thin and the generic "check your email"
// response never has to change based on whether sending actually worked.
export async function sendPasswordResetEmail(
  mailer: Mailer,
  to: string,
  resetUrl: string,
): Promise<void> {
  try {
    await mailer.sendMail({
      to,
      from: process.env.GMAIL_USER ?? "no-reply@localhost",
      subject: "Reset your Budget Tracker password",
      html: passwordResetEmailHtml(resetUrl),
      text: passwordResetEmailText(resetUrl),
    });
  } catch (err) {
    console.error("[password reset] failed to send email", err);
  }
}
