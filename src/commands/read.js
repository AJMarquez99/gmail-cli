import * as reader from '../reader.js';

/**
 * Opens an IMAP client, runs the given operation, and ALWAYS logs out —
 * even when the operation throws.
 */
async function withClient(opts, deps, fn) {
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
