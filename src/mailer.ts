import nodemailer from "nodemailer";
import { config } from "./config.js";

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

interface SendToKindleOptions {
  filename: string;
  content: Buffer;
  /** "epub" or "html" — determines MIME type */
  format: "epub" | "html";
  subject?: string;
}

/**
 * Send a file to the configured Kindle email address.
 *
 * Notes on Send-to-Kindle:
 * - Subject line left empty (or "convert" if you want Amazon to convert)
 * - EPUB and HTML are both natively supported
 * - Max attachment size: 50MB
 * - The sender address must be in your Amazon "Approved Personal Document E-mail List"
 */
export async function sendToKindle(
  options: SendToKindleOptions
): Promise<void> {
  const mimeTypes = {
    epub: "application/epub+zip",
    html: "text/html",
  };

  try {
    const info = await transporter.sendMail({
      from: config.smtp.from,
      to: config.kindle.email,
      subject: options.subject || "Document for Kindle",
      text: `Please find attached: ${options.filename}

This document was sent from LinkWarden-to-Kindle.
File format: ${options.format.toUpperCase()}
Sent at: ${new Date().toISOString()}`,
      attachments: [
        {
          filename: options.filename,
          content: options.content,
          contentType: mimeTypes[options.format],
        },
      ],
    });
    console.log(`[DEBUG] Email sent successfully. Message ID: ${info.messageId}`);
    if (info.response) {
      console.log(`[DEBUG] SMTP Response: ${info.response}`);
    }
  } catch (error) {
    console.error(`[DEBUG] Email sending failed:`, error);
    throw error;
  }
}

/**
 * Send a simple test email without attachments.
 */
export async function sendTestEmail(to: string, from: string): Promise<void> {
  try {
    const info = await transporter.sendMail({
      from: from,
      to: to,
      subject: "Test Email - No Attachment",
      text: `This is a plain text test email.

Sent at: ${new Date().toISOString()}
From: ${from}
To: ${to}

If you receive this email, your SMTP configuration is working correctly.`,
      html: `<html>
<body>
  <h2>Test Email - No Attachment</h2>
  <p>This is an HTML test email.</p>
  <ul>
    <li><strong>Sent at:</strong> ${new Date().toISOString()}</li>
    <li><strong>From:</strong> ${from}</li>
    <li><strong>To:</strong> ${to}</li>
  </ul>
  <p>If you receive this email, your SMTP configuration is working correctly.</p>
</body>
</html>`,
    });

    console.log(`[DEBUG] Simple email sent successfully. Message ID: ${info.messageId}`);
    if (info.response) {
      console.log(`[DEBUG] SMTP Response: ${info.response}`);
    }
  } catch (error) {
    console.error(`[DEBUG] Simple email sending failed:`, error);
    throw error;
  }
}

/**
 * Verify SMTP connection is working.
 */
export async function verifySmtp(): Promise<boolean> {
  try {
    await transporter.verify();
    return true;
  } catch (err) {
    console.error("SMTP verification failed:", err);
    return false;
  }
}
