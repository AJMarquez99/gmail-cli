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

// imapflow's own connectionTimeout/greetingTimeout fire well before our race deadline and reject
// connect() with one of these codes (imap-flow.js ~1815-1851) — treat them as a timeout too, not
// as a fatal connect error, so the retry path is actually reachable in production.
const IMAP_TIMEOUT_CODES = new Set(['CONNECT_TIMEOUT', 'GREETING_TIMEOUT']);

/** Create + connect an IMAP client with a hard deadline; one fresh-client retry on timeout. */
export async function openImapClient(deps, creds, imapOpts = {}, {
  timeoutMs = deps.imapConnectTimeoutMs ?? 30000,
  retries = 1,
  warn = deps.warn ?? ((m) => process.stderr.write(m)),
} = {}) {
  for (let attempt = 0; ; attempt++) {
    const client = deps.createImapClient(creds, imapOpts);
    let timer;
    const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(TIMEOUT), timeoutMs); });
    // Belt-and-braces: keep an abandoned attempt from ever surfacing as unhandled, independent of
    // how it's awaited.
    const connecting = client.connect();
    connecting.catch(() => {});
    let timedOut = false;
    try {
      const result = await Promise.race([connecting, deadline]);
      timedOut = result === TIMEOUT;
    } catch (err) {
      if (!IMAP_TIMEOUT_CODES.has(err.code)) throw err;
      timedOut = true;
    } finally {
      clearTimeout(timer);
    }
    if (!timedOut) return client;
    try { client.close?.(); } catch { /* already dead */ }
    if (attempt >= retries) throw new ImapTimeoutError(timeoutMs, retries + 1);
    warn(`warn: IMAP connect timed out after ${timeoutMs}ms; retrying (${attempt + 1}/${retries})\n`);
  }
}
