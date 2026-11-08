import nodemailer from "nodemailer";
export function mailReady() {
  return !!process.env.SMTP_HOST;
}
export async function sendMail({ to, subject, text, attachments }) {
  if (!mailReady())
    throw Object.assign(
      new Error("Email is not configured. Set SMTP settings before sending."),
      { status: 503 },
    );
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text,
    attachments,
  });
}
