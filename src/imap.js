import { ImapFlow } from 'imapflow';

// Create a Gmail IMAP client (does NOT connect — caller manages connect/logout).
export function createImapClient(creds, imapOpts = {}) {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: creds.user, pass: creds.appPassword },
    logger: false,
    ...imapOpts,
  });
}
