import { withClient } from './read.js';
import { buildMessage, buildRawMime, toList } from '../compose.js';
import { appendDraft, deleteMessage, fetchRawMessage, DRAFTS } from '../writer.js';
import { makeAllowChecker } from '../allowlist.js';
import { InvalidInputError, RecipientNotAllowedError } from '../lib/errors.js';

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

  // 1. Fetch the raw draft + parse recipients (one IMAP session for fetch; delete after send).
  const raw = await withClient(opts, deps, async (client) =>
    fetchRawMessage(client, { uid: opts.uid, mailbox: DRAFTS }));
  if (!raw) throw new InvalidInputError(`No draft found at uid ${opts.uid} in ${DRAFTS}.`);
  const parsed = await deps.parseMessage(raw);
  const addrs = (field) => (parsed[field]?.value || []).map((a) => a.address).filter(Boolean);
  const to = addrs('to'), cc = addrs('cc'), bcc = addrs('bcc');

  // 2. Enforce the allowlist at this transmission boundary (same policy as send).
  const enforce = !(opts.noAllowlist || opts.allowlist === false) && profile.allowlistEnforce;
  const { resolve } = makeAllowChecker({ allowlist: deps.loadAllowlist({ path: profile.allowlistPath }), self: creds.user });
  const denied = [];
  const check = (list) => list.forEach((t) => { const r = resolve(t); if (!r.email && enforce) denied.push(r.denied); });
  check(to); check(cc); check(bcc);
  if (enforce && denied.length) throw new RecipientNotAllowedError(denied);

  // Warn on real sends when enforcement is off (mirrors send.js).
  if (!enforce) {
    process.stderr.write('warn: allowlist enforcement disabled — sending to any recipient (re-enable via config allowlist.enforce or drop --no-allowlist).\n');
  }

  // 3. Transmit the raw message with an explicit envelope, then delete the draft, then log.
  const envelope = { from: creds.user, to: [...to, ...cc, ...bcc] };
  const info = await deps.createTransport(creds).sendMail({ raw, envelope });
  await withClient(opts, deps, async (client) => deleteMessage(client, { uid: opts.uid, mailbox: DRAFTS }));

  const logEnabled = !(opts.noLog || opts.log === false) && profile.sendLog.enabled !== false;
  if (logEnabled) {
    try {
      deps.appendLog({ ts: deps.now(), from: creds.user, to, cc, bcc, subject: parsed.subject || '',
        messageId: info.messageId }, { path: profile.sendLogPath });
    } catch (err) { process.stderr.write(`warn: send-log write failed: ${err.message}\n`); }
  }
  return { action: 'draft-sent', uid: Number(opts.uid), to, cc, bcc, subject: parsed.subject || '',
    messageId: info.messageId, accepted: info.accepted || [] };
}
