import { withClient } from './read.js';
import { buildMessage, buildRawMime, toList } from '../compose.js';
import { appendDraft, deleteMessage, fetchRawMessage, DRAFTS } from '../writer.js';
import { InvalidInputError } from '../lib/errors.js';
import { resolveRecipients, enforceAllowlist, logSend } from '../transmit.js';

/** Create a draft: assemble the message (NO allowlist — nothing transmits) and APPEND to Drafts. */
export async function runDraftCreate(opts, deps) {
  const profile = deps.resolveProfile(opts.profile);
  const creds = deps.resolveCredentials(profile.legacy ? {} : { path: profile.credentialsPath });
  const to = toList(opts.to), cc = toList(opts.cc), bcc = toList(opts.bcc);
  const { message } = buildMessage({ to, cc, bcc }, opts, { profile, creds }, deps);
  const raw = await buildRawMime(message);
  const res = await withClient(opts, deps, async (client) => appendDraft(client, raw));
  return { action: 'draft-created', uid: res.uid, mailbox: res.mailbox, to, cc, bcc, subject: message.subject };
}

/** Discard a draft by UID (permanent delete from Drafts — it's an unsent draft). */
export async function runDraftDelete(opts, deps) {
  const res = await withClient(opts, deps, async (client) =>
    deleteMessage(client, { uid: opts.uid, mailbox: DRAFTS }));
  return { action: 'draft-deleted', uid: res.uid, mailbox: res.mailbox };
}

/** Send an existing draft: parse recipients, enforce the allowlist, transmit raw, delete + log. */
export async function runDraftSend(opts, deps) {
  const profile = deps.resolveProfile(opts.profile);
  const creds = deps.resolveCredentials(profile.legacy ? {} : { path: profile.credentialsPath });

  // Single IMAP session: fetch the draft, (after SMTP send) delete it, then close.
  const client = deps.createImapClient(creds, profile.imap || {});
  await client.connect();
  try {
    // 1. Fetch the raw draft + parse recipients.
    const raw = await fetchRawMessage(client, { uid: opts.uid, mailbox: DRAFTS });
    if (!raw) throw new InvalidInputError(`No draft found at uid ${opts.uid} in ${DRAFTS}.`);
    const parsed = await deps.parseMessage(raw);
    const addrs = (field) => (parsed[field]?.value || []).map((a) => a.address).filter(Boolean);
    const to = addrs('to'), cc = addrs('cc'), bcc = addrs('bcc');

    // 2. Enforce the allowlist at this transmission boundary (same policy as send).
    const { enforce, denied } = resolveRecipients({ to, cc, bcc }, opts, { profile, creds }, deps);
    enforceAllowlist(denied, enforce);

    // 3. Transmit the raw message with an explicit envelope.
    const envelope = { from: creds.user, to: [...to, ...cc, ...bcc] };
    const info = await deps.createTransport(creds).sendMail({ raw, envelope });

    // 4. Delete the draft (only reached when send succeeds).
    await deleteMessage(client, { uid: opts.uid, mailbox: DRAFTS });

    logSend({ from: creds.user, to, cc, bcc, subject: parsed.subject || '', messageId: info.messageId },
      opts, { profile }, deps);
    return { action: 'draft-sent', uid: Number(opts.uid), to, cc, bcc, subject: parsed.subject || '',
      messageId: info.messageId, accepted: info.accepted || [] };
  } finally {
    await client.logout();
  }
}
