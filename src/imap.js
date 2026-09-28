import { ImapFlow } from 'imapflow';
import { ImapTimeoutError } from './lib/errors.js';

// imapflow's own defaults (90s connect / 300s socket) let a stalled connection look like a hang.
export const IMAP_DEFAULTS = { connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 120000 };

// Create a Gmail IMAP client (does NOT connect — caller manages connect/logout).
export function createImapClient(creds, imapOpts = {}) {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: creds.user, pass: creds.appPassword },
    logger: false,
    ...IMAP_DEFAULTS,
    ...imapOpts,
  });
}

const TIMEOUT = Symbol('timeout');

/** Create + connect an IMAP client with a hard deadline; one fresh-client retry on timeout. */
export async function openImapClient(deps, creds, imapOpts = {}, {
  timeoutMs = deps.imapConnectTimeoutMs ?? 30000,
  retries = 1,
  warn = (m) => process.stderr.write(m),
} = {}) {
  for (let attempt = 0; ; attempt++) {
    const client = deps.createImapClient(creds, imapOpts);
    let timer;
    const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(TIMEOUT), timeoutMs); });
    // Race the connect attempt against the deadline. If the deadline wins, this attempt is
    // abandoned but its connect() promise may still reject later (e.g. once we call close()) —
    // attach a no-op catch now so that late rejection can never surface as an unhandledRejection.
    const connecting = client.connect();
    connecting.catch(() => {});
    let result;
    try {
      result = await Promise.race([connecting, deadline]);
    } finally {
      clearTimeout(timer);
    }
    if (result !== TIMEOUT) return client;
    try { client.close?.(); } catch { /* already dead */ }
    if (attempt >= retries) throw new ImapTimeoutError(timeoutMs);
    warn(`warn: IMAP connect timed out after ${timeoutMs}ms; retrying (${attempt + 1}/${retries})\n`);
  }
}
