export const DRAFTS = '[Gmail]/Drafts';

/** Fetch the raw RFC822 source of a message by UID from a mailbox. Returns a Buffer, or null. */
export async function fetchRawMessage(client, { uid, mailbox }) {
  await client.mailboxOpen(mailbox);
  for await (const msg of client.fetch(Number(uid), { uid: true, source: true }, { uid: true })) {
    return msg.source;
  }
  return null;
}

/** APPEND a raw RFC822 message to the Drafts mailbox with the \Draft flag. */
export async function appendDraft(client, raw) {
  const res = await client.append(DRAFTS, raw, ['\\Draft']);
  return { uid: res && res.uid, mailbox: DRAFTS };
}

/** Permanently delete a message by UID from a mailbox (used for draft discard/cleanup). */
export async function deleteMessage(client, { uid, mailbox }) {
  await client.mailboxOpen(mailbox);
  await client.messageDelete(Number(uid), { uid: true });
  return { uid: Number(uid), mailbox, action: 'deleted' };
}

/**
 * Add a Gmail label to a message via X-GM-LABELS.
 *
 * @param {object} client   Connected imapflow client.
 * @param {object} [opts]
 * @param {number|string} [opts.uid]      Message UID.
 * @param {string} [opts.label]           Label/mailbox path to add.
 * @param {string} [opts.mailbox='INBOX']
 * @returns {Promise<{uid:number, label:string, action:'added'}>}
 */
export async function addLabel(client, { uid, label, mailbox = 'INBOX' } = {}) {
  await client.mailboxOpen(mailbox);
  await client.messageFlagsAdd(Number(uid), [label], { uid: true, useLabels: true });
  return { uid: Number(uid), label, action: 'added' };
}

/**
 * Remove a Gmail label from a message via X-GM-LABELS.
 *
 * @param {object} client   Connected imapflow client.
 * @param {object} [opts]
 * @param {number|string} [opts.uid]      Message UID.
 * @param {string} [opts.label]           Label/mailbox path to remove.
 * @param {string} [opts.mailbox='INBOX']
 * @returns {Promise<{uid:number, label:string, action:'removed'}>}
 */
export async function removeLabel(client, { uid, label, mailbox = 'INBOX' } = {}) {
  await client.mailboxOpen(mailbox);
  await client.messageFlagsRemove(Number(uid), [label], { uid: true, useLabels: true });
  return { uid: Number(uid), label, action: 'removed' };
}

/**
 * Mark a message as read or unread by toggling the \Seen IMAP flag.
 *
 * @param {object} client   Connected imapflow client.
 * @param {object} [opts]
 * @param {number|string} [opts.uid]      Message UID.
 * @param {boolean} [opts.seen]           true → mark read, false → mark unread.
 * @param {string} [opts.mailbox='INBOX']
 * @returns {Promise<{uid:number, seen:boolean, action:'read'|'unread'}>}
 */
export async function markMessage(client, { uid, seen, mailbox = 'INBOX' } = {}) {
  await client.mailboxOpen(mailbox);
  if (seen) await client.messageFlagsAdd(Number(uid), ['\\Seen'], { uid: true });
  else await client.messageFlagsRemove(Number(uid), ['\\Seen'], { uid: true });
  return { uid: Number(uid), seen, action: seen ? 'read' : 'unread' };
}
