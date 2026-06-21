import { resolve, basename, sep } from 'node:path';
import * as reader from '../reader.js';
import { fetchRawMessage } from '../writer.js';
import { InvalidInputError } from '../lib/errors.js';

/**
 * Opens an IMAP client, runs the given operation, and ALWAYS logs out —
 * even when the operation throws.
 */
export async function withClient(opts, deps, fn) {
  const profile = deps.resolveProfile(opts.profile);
  const creds = deps.resolveCredentials(profile.legacy ? {} : { path: profile.credentialsPath });
  const client = deps.createImapClient(creds, profile.imap || {});
  await client.connect();
  try {
    return await fn(client, profile);
  } finally {
    await client.logout();
  }
}

/**
 * List recent messages from a mailbox.
 */
export async function runReadList(opts, deps) {
  return withClient(opts, deps, async (client) => {
    const messages = await reader.listMessages(
      client,
      {
        mailbox: opts.mailbox,
        limit: opts.limit ? Number(opts.limit) : 20,
        unread: !!opts.unread,
      },
      deps,
    );
    return { messages };
  });
}

/**
 * Search messages with a Gmail query string.
 */
export async function runReadSearch(opts, deps) {
  return withClient(opts, deps, async (client) => {
    const messages = await reader.searchMessages(
      client,
      {
        query: opts.query,
        mailbox: opts.mailbox,
        limit: opts.limit ? Number(opts.limit) : 20,
      },
      deps,
    );
    return { messages };
  });
}

/**
 * Show a single message by UID or Message-ID.
 */
export async function runReadShow(opts, deps) {
  return withClient(opts, deps, async (client) => {
    const message = await reader.showMessage(
      client,
      { target: opts.target, mailbox: opts.mailbox },
      deps,
    );
    return { message };
  });
}

/**
 * Show all messages in a Gmail thread.
 */
export async function runReadThread(opts, deps) {
  return withClient(opts, deps, async (client) => {
    const messages = await reader.getThread(
      client,
      {
        threadId: opts.threadId,
        mailbox: opts.mailbox,
      },
      deps,
    );
    return { messages };
  });
}

/**
 * Count total + unread messages in a mailbox.
 */
export async function runReadCount(opts, deps) {
  // read.js already has `import * as reader from '../reader.js'` — use the namespace (no new import).
  return withClient(opts, deps, async (client) => reader.countMessages(client, { mailbox: opts.mailbox }));
}

/**
 * Download attachments from a message by UID.
 */
export async function runReadDownload(opts, deps) {
  const dir = opts.dir || '.';
  return withClient(opts, deps, async (client) => {
    const raw = await fetchRawMessage(client, { uid: opts.target, mailbox: opts.mailbox });
    if (!raw) throw new InvalidInputError(`No message found at uid ${opts.target} in ${opts.mailbox || 'INBOX'}.`);
    const parsed = await deps.parseMessage(raw);
    const atts = parsed.attachments || [];
    const outDir = resolve(dir);
    const out = atts.map((a, i) => {
      const rawName = a.filename || `attachment-${i + 1}`;
      const safeName = basename(rawName).replace(/^\.+/, '_') || `attachment-${i + 1}`;
      const path = resolve(outDir, safeName);
      const prefix = outDir.endsWith(sep) ? outDir : outDir + sep;
      if (path !== outDir && !path.startsWith(prefix)) {
        throw new InvalidInputError(`Refusing to write attachment outside ${outDir}: ${rawName}`);
      }
      deps.writeFile(path, a.content);
      return { filename: safeName, bytes: a.size ?? (a.content ? a.content.length : 0), path };
    });
    return { uid: Number(opts.target), dir: outDir, attachments: out };
  });
}
