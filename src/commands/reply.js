import { withClient } from './read.js';
import { buildMessage, buildRawMime, toList } from '../compose.js';
import { fetchRawMessage, appendDraft } from '../writer.js';
import { resolveRecipients, enforceAllowlist, logSend } from '../transmit.js';
import { InvalidInputError } from '../lib/errors.js';

const addr = (v) => (v?.value?.[0]?.address) || null;
const addrs = (v) => (v?.value || []).map((a) => a.address).filter(Boolean);

function quoteText(orig) {
  const who = addr(orig.from) || 'someone';
  const body = orig.text || '';
  return `On a previous message, ${who} wrote:\n` + body.split('\n').map((l) => `> ${l}`).join('\n');
}

/** Build the reply message object (no transmit/stage). Shared by send + draft paths. */
async function buildReply(opts, deps, profile, creds) {
  const raw = await withClient(opts, deps, async (client) =>
    fetchRawMessage(client, { uid: opts.uid, mailbox: opts.mailbox }));
  if (!raw) throw new InvalidInputError(`No message found at uid ${opts.uid} in ${opts.mailbox || 'INBOX'}.`);
  const orig = await deps.parseMessage(raw);

  const subject = /^re:/i.test(orig.subject || '') ? orig.subject : `Re: ${orig.subject || ''}`;
  const primary = addr(orig.replyTo) || addr(orig.from);
  const to = primary ? [primary] : [];
  let cc = [];
  if (opts.all) {
    const selfLc = (creds.user || '').toLowerCase();
    const primaryLc = (primary || '').toLowerCase();
    cc = [...addrs(orig.to), ...addrs(orig.cc)]
      .filter((a) => { const l = a.toLowerCase(); return l !== selfLc && l !== primaryLc; });
  }
  const refList = !orig.references
    ? []
    : Array.isArray(orig.references)
      ? orig.references
      : String(orig.references).split(/\s+/).filter(Boolean);
  const references = [...refList, orig.messageId].filter(Boolean);

  let body = opts.body || '';
  if (!(opts.noQuote || opts.quote === false)) {
    body = (body ? `${body}\n\n` : '') + quoteText(orig);
  }
  const synthetic = { ...opts, subject, inReplyTo: orig.messageId, references, body };
  const { message } = buildMessage({ to, cc, bcc: [] }, synthetic, { profile, creds }, deps);
  return { message, to, cc, subject };
}

export async function runReply(opts, deps) {
  const profile = deps.resolveProfile(opts.profile);
  const creds = deps.resolveCredentials(profile.legacy ? {} : { path: profile.credentialsPath });
  const { message, to, cc, subject } = await buildReply(opts, deps, profile, creds);

  if (opts.draft) {
    const raw = await buildRawMime(message);
    const res = await withClient(opts, deps, async (client) => appendDraft(client, raw));
    return { action: 'reply-drafted', uid: res.uid, mailbox: res.mailbox, to, cc, subject };
  }

  if (to.length === 0) {
    throw new InvalidInputError('Cannot derive a reply recipient (original has no From/Reply-To). Use --draft to stage one, or specify recipients on a fresh send.');
  }

  const { enforce, denied } = resolveRecipients({ to, cc, bcc: [] }, opts, { profile, creds }, deps);
  enforceAllowlist(denied, enforce);
  const info = await deps.createTransport(creds).sendMail(message);
  logSend({ from: message.from, to, cc, subject, messageId: info.messageId }, opts, { profile }, deps);
  return { action: 'replied', to, cc, subject, messageId: info.messageId, accepted: info.accepted || [] };
}

function forwardHeader(orig) {
  const from = addr(orig.from) || '';
  const to = addrs(orig.to).join(', ');
  return `---------- Forwarded message ----------\nFrom: ${from}\nSubject: ${orig.subject || ''}\nTo: ${to}`;
}

export async function runForward(opts, deps) {
  const to = toList(opts.to);
  if (to.length === 0) throw new InvalidInputError('Forward needs at least one --to recipient.');
  const profile = deps.resolveProfile(opts.profile);
  const creds = deps.resolveCredentials(profile.legacy ? {} : { path: profile.credentialsPath });

  const raw = await withClient(opts, deps, async (client) =>
    fetchRawMessage(client, { uid: opts.uid, mailbox: opts.mailbox }));
  if (!raw) throw new InvalidInputError(`No message found at uid ${opts.uid} in ${opts.mailbox || 'INBOX'}.`);
  const orig = await deps.parseMessage(raw);

  const subject = /^fwd:/i.test(orig.subject || '') ? orig.subject : `Fwd: ${orig.subject || ''}`;
  const body = `${opts.body ? opts.body + '\n\n' : ''}${forwardHeader(orig)}\n\n${orig.text || ''}`;
  const synthetic = { ...opts, subject, body, inReplyTo: undefined, references: [] };
  const { message } = buildMessage({ to, cc: [], bcc: [] }, synthetic, { profile, creds }, deps);

  // Re-attach the original attachments (content buffers, not file paths).
  const origAtts = (orig.attachments || []).map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType }));
  if (origAtts.length) message.attachments = [...(message.attachments || []), ...origAtts];

  const { enforce, denied } = resolveRecipients({ to, cc: [], bcc: [] }, opts, { profile, creds }, deps);
  enforceAllowlist(denied, enforce);
  const info = await deps.createTransport(creds).sendMail(message);
  logSend({ from: message.from, to, subject, messageId: info.messageId }, opts, { profile }, deps);
  return { action: 'forwarded', to, subject, messageId: info.messageId, accepted: info.accepted || [],
    attachments: origAtts.map((a) => a.filename) };
}
