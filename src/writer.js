export const DRAFTS = '[Gmail]/Drafts';

/** Normalize a UID scalar or array to an IMAP sequence set. */
const toRange = (uid) => Array.isArray(uid) ? uid.map(Number).join(',') : Number(uid);
/** Normalize a UID scalar or array to the return shape. */
const toUid = (uid) => Array.isArray(uid) ? uid.map(Number) : Number(uid);

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
 * @param {number|string|Array<number|string>} [opts.uid]  Message UID, or an array of UIDs (batched into one IMAP command).
 * @param {string} [opts.label]           Label/mailbox path to add.
 * @param {string} [opts.mailbox='INBOX']
 * @returns {Promise<{uid:number|number[], label:string, action:'added'}>}
 */
export async function addLabel(client, { uid, label, mailbox = 'INBOX' } = {}) {
  await client.mailboxOpen(mailbox);
  await client.messageFlagsAdd(toRange(uid), [label], { uid: true, useLabels: true });
  return { uid: toUid(uid), label, action: 'added' };
}

/**
 * Remove a Gmail label from a message via X-GM-LABELS.
 *
 * @param {object} client   Connected imapflow client.
 * @param {object} [opts]
 * @param {number|string|Array<number|string>} [opts.uid]  Message UID, or an array of UIDs (batched into one IMAP command).
 * @param {string} [opts.label]           Label/mailbox path to remove.
 * @param {string} [opts.mailbox='INBOX']
 * @returns {Promise<{uid:number|number[], label:string, action:'removed'}>}
 */
export async function removeLabel(client, { uid, label, mailbox = 'INBOX' } = {}) {
  await client.mailboxOpen(mailbox);
  await client.messageFlagsRemove(toRange(uid), [label], { uid: true, useLabels: true });
  return { uid: toUid(uid), label, action: 'removed' };
}

/**
 * Mark a message as read or unread by toggling the \Seen IMAP flag.
 *
 * @param {object} client   Connected imapflow client.
 * @param {object} [opts]
 * @param {number|string|Array<number|string>} [opts.uid]  Message UID, or an array of UIDs (batched into one IMAP command).
 * @param {boolean} [opts.seen]           true → mark read, false → mark unread.
 * @param {string} [opts.mailbox='INBOX']
 * @returns {Promise<{uid:number|number[], seen:boolean, action:'read'|'unread'}>}
 */
export async function markMessage(client, { uid, seen, mailbox = 'INBOX' } = {}) {
  await client.mailboxOpen(mailbox);
  if (seen) await client.messageFlagsAdd(toRange(uid), ['\\Seen'], { uid: true });
  else await client.messageFlagsRemove(toRange(uid), ['\\Seen'], { uid: true });
  return { uid: toUid(uid), seen, action: seen ? 'read' : 'unread' };
}

export const TRASH = '[Gmail]/Trash';

/** Archive: remove the Gmail \Inbox system label via X-GM-LABELS. */
export async function archiveMessage(client, { uid, mailbox = 'INBOX' } = {}) {
  await client.mailboxOpen(mailbox);
  await client.messageFlagsRemove(toRange(uid), ['\\Inbox'], { uid: true, useLabels: true });
  return { uid: toUid(uid), mailbox, action: 'archived' };
}

/** Move a message to a destination mailbox/label. */
export async function moveMessage(client, { uid, mailbox = 'INBOX', destination } = {}) {
  await client.mailboxOpen(mailbox);
  await client.messageMove(toRange(uid), destination, { uid: true });
  return { uid: toUid(uid), from: mailbox, to: destination, action: 'moved' };
}

/** Move a message to Trash (recoverable). */
export async function trashMessage(client, { uid, mailbox = 'INBOX' } = {}) {
  await client.mailboxOpen(mailbox);
  await client.messageMove(toRange(uid), TRASH, { uid: true });
  return { uid: toUid(uid), action: 'trashed' };
}

/** Toggle the Gmail \Starred label. */
export async function starMessage(client, { uid, on, mailbox = 'INBOX' } = {}) {
  await client.mailboxOpen(mailbox);
  const fn = on ? 'messageFlagsAdd' : 'messageFlagsRemove';
  await client[fn](toRange(uid), ['\\Starred'], { uid: true, useLabels: true });
  return { uid: toUid(uid), starred: !!on, action: on ? 'starred' : 'unstarred' };
}

/** Toggle the Gmail \Important label. */
export async function importantMessage(client, { uid, on, mailbox = 'INBOX' } = {}) {
  await client.mailboxOpen(mailbox);
  const fn = on ? 'messageFlagsAdd' : 'messageFlagsRemove';
  await client[fn](toRange(uid), ['\\Important'], { uid: true, useLabels: true });
  return { uid: toUid(uid), important: !!on, action: on ? 'marked-important' : 'unmarked-important' };
}

/** Create a Gmail label (IMAP mailbox). */
export async function createLabel(client, { name } = {}) {
  await client.mailboxCreate(name);
  return { name, action: 'created' };
}

/** Delete a Gmail label (IMAP mailbox). */
export async function deleteLabel(client, { name } = {}) {
  await client.mailboxDelete(name);
  return { name, action: 'deleted' };
}

/** Rename a Gmail label (IMAP mailbox). */
export async function renameLabel(client, { name, newName } = {}) {
  await client.mailboxRename(name, newName);
  return { from: name, to: newName, action: 'renamed' };
}
