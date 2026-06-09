import nodemailer from 'nodemailer';

/**
 * Create a Gmail SMTP transport. `service: 'gmail'` resolves host/port/TLS for us
 * (smtp.gmail.com:465, secure). Auth uses the 16-char App Password as the SMTP password.
 */
export function createGmailTransport(creds, { createTransport = nodemailer.createTransport } = {}) {
  return createTransport({
    service: 'gmail',
    auth: { user: creds.user, pass: creds.appPassword },
  });
}
