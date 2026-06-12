import { normalizeMessage } from './lib/normalize.js';
import { InvalidInputError } from './lib/errors.js';

// Fetch query used for header-level (list/search/thread) operations.
const HEADER_QUERY = { uid: true, envelope: true, threadId: true, labels: true, flags: true };

// Fetch query used for full-body (show) operations.
const FULL_QUERY = { uid: true, envelope: true, source: true, threadId: true, labels: true, flags: true };

// Shared fetch options that tell imapflow the range is expressed in UIDs.
const UID_OPTS = { uid: true };

/**
 * Collect all messages from an imapflow async-iterable fetch and normalize them.
 * When `parsed` is a function it is called with msg.source to produce the mailparser result.
 */
async function collectFetch(iterable, parseMessage) {
  const results = [];
  for await (const msg of iterable) {
    const parsed = parseMessage ? await parseMessage(msg.source) : undefined;
    results.push(normalizeMessage(msg, parsed));
  }
  return results;
}

/**
 * Determine whether `target` is a bare UID (all digits) or a Message-ID string.
 */
function isNumericUid(target) {
  return /^\d+$/.test(String(target));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List recent messages from a mailbox.
 *
 * @param {object} client   Connected imapflow client.
 * @param {object} [opts]
 * @param {string} [opts.mailbox='INBOX']
 * @param {number} [opts.limit=20]
 * @param {boolean} [opts.unread=false]  When true, only unseen messages.
 * @param {object} [deps]               Dependency injection (unused at this layer, reserved for future use).
 * @returns {Promise<object[]>} Normalized messages, newest-first.
 */
export async function listMessages(client, { mailbox = 'INBOX', limit = 20, unread = false } = {}, deps = {}) {
  await client.mailboxOpen(mailbox);

  const criteria = unread ? { seen: false } : { all: true };
  const allUids = await client.search(criteria, { uid: true });

  if (allUids.length === 0) return [];

  // Take the last `limit` UIDs (highest = most recent in Gmail).
  const uids = allUids.slice(-limit);

  const msgs = await collectFetch(client.fetch(uids, HEADER_QUERY, UID_OPTS));

  // Return newest-first (descending by UID, which is a reliable recency proxy in Gmail).
  return msgs.sort((a, b) => b.uid - a.uid);
}

/**
 * Search messages with a Gmail query string.
 *
 * @param {object} client
 * @param {object} [opts]
 * @param {string} [opts.query]           Gmail search query.
 * @param {string} [opts.mailbox='INBOX']
 * @param {number} [opts.limit=20]
 * @param {object} [deps]
 * @returns {Promise<object[]>} Normalized messages, newest-first.
 */
export async function searchMessages(client, { query, mailbox = 'INBOX', limit = 20 } = {}, deps = {}) {
  await client.mailboxOpen(mailbox);

  const allUids = await client.search({ gmraw: query }, { uid: true });

  if (allUids.length === 0) return [];

  const uids = allUids.slice(-limit);

  const msgs = await collectFetch(client.fetch(uids, HEADER_QUERY, UID_OPTS));

  return msgs.sort((a, b) => b.uid - a.uid);
}

/**
 * Show a single message with full body and attachments.
 *
 * @param {object} client
 * @param {object} [opts]
 * @param {string|number} [opts.target]     UID (numeric) or Message-ID string.
 * @param {string} [opts.mailbox='INBOX']
 * @param {object} [deps]
 * @param {Function} deps.parseMessage       mailparser simpleParser (or equivalent).
 * @returns {Promise<object>} Fully normalized message including body and attachments.
 * @throws {InvalidInputError} If the target cannot be resolved to a UID.
 */
export async function showMessage(client, { target, mailbox = 'INBOX' } = {}, deps = {}) {
  await client.mailboxOpen(mailbox);

  let uid;

  if (isNumericUid(target)) {
    uid = Number(target);
  } else {
    // Treat target as a Message-ID; resolve via Gmail rfc822msgid search.
    const found = await client.search({ gmraw: `rfc822msgid:${target}` }, { uid: true });
    if (!found || found.length === 0) {
      throw new InvalidInputError(`Message-ID not found: ${target}`);
    }
    uid = found[0];
  }

  let got;
  for await (const msg of client.fetch(uid, FULL_QUERY, UID_OPTS)) {
    got = msg;
    break; // We only expect one message; take the first.
  }

  if (!got) {
    throw new InvalidInputError(`Message not found for UID: ${uid}`);
  }

  const parsed = await deps.parseMessage(got.source);
  return normalizeMessage(got, parsed);
}

/**
 * Fetch all messages in a Gmail thread.
 *
 * @param {object} client
 * @param {object} [opts]
 * @param {string} [opts.threadId]
 * @param {string} [opts.mailbox='[Gmail]/All Mail']
 * @param {object} [deps]
 * @returns {Promise<object[]>} Normalized messages, date-ascending (oldest first).
 */
export async function getThread(client, { threadId, mailbox = '[Gmail]/All Mail' } = {}, deps = {}) {
  await client.mailboxOpen(mailbox);

  const uids = await client.search({ gmraw: `threadid:${threadId}` }, { uid: true });

  if (uids.length === 0) return [];

  const msgs = await collectFetch(client.fetch(uids, HEADER_QUERY, UID_OPTS));

  // Return oldest-first (ascending by date, fall back to UID).
  return msgs.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : a.uid;
    const tb = b.date ? new Date(b.date).getTime() : b.uid;
    return ta - tb;
  });
}

/**
 * List all IMAP mailboxes / Gmail labels.
 *
 * @param {object} client
 * @returns {Promise<Array<{name:string, path:string, specialUse:string|null}>>}
 */
export async function listLabels(client) {
  const boxes = await client.list();
  return boxes.map((b) => ({
    name: b.name,
    path: b.path,
    specialUse: b.specialUse || null,
  }));
}
