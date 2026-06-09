import { basename, resolve as resolvePath } from 'node:path';
import { InvalidInputError, RecipientNotAllowedError } from '../lib/errors.js';
import { makeAllowChecker } from '../allowlist.js';
import { renderMarkdown } from '../lib/markdown.js';

const GMAIL_MAX_BYTES = 25 * 1024 * 1024;
const WARN_BYTES = 20 * 1024 * 1024;

// Resolve & validate attachment paths → [{ filename, path, bytes }]. Throws on missing/oversize.
function buildAttachments(paths, deps) {
  const out = [];
  let total = 0;
  for (const p of paths) {
    const abs = resolvePath(p);
    let stat;
    try { stat = deps.statFile(abs); } catch { throw new InvalidInputError(`Attachment not found: ${abs}`); }
    if (!stat.isFile()) throw new InvalidInputError(`Attachment is not a file: ${abs}`);
    total += stat.size;
    out.push({ filename: basename(abs), path: abs, bytes: stat.size });
  }
  if (total > GMAIL_MAX_BYTES) {
    throw new InvalidInputError(`Attachments total ${(total / 1048576).toFixed(1)}MB exceeds Gmail's 25MB limit.`);
  }
  if (total > WARN_BYTES) {
    process.stderr.write(`warn: attachments total ${(total / 1048576).toFixed(1)}MB — near Gmail's 25MB limit.\n`);
  }
  return out;
}

// Accept an array (repeated flags), a comma-separated string, or any mix of both;
// return a clean, flattened array of addresses.
function toList(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .flatMap((entry) => String(entry).split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function runSend(opts, deps) {
  const to = toList(opts.to);
  const cc = toList(opts.cc);
  const bcc = toList(opts.bcc);

  if (to.length === 0 && cc.length === 0 && bcc.length === 0) {
    throw new InvalidInputError('No recipients. Provide at least one of --to / --cc / --bcc.');
  }
  if (!opts.body && !opts.html) {
    throw new InvalidInputError('Empty message. Provide --body (text), --html, or pipe body on stdin.');
  }
  if (opts.markdown && opts.html) {
    throw new InvalidInputError('Use either --markdown or --html, not both.');
  }

  const creds = deps.resolveCredentials();
  const config = deps.loadConfig();

  // Enforce the allowlist (fail-closed): expand aliases to canonical emails and reject the
  // whole send if any recipient isn't permitted — self is always implicitly allowed.
  const { resolve } = makeAllowChecker({ allowlist: deps.loadAllowlist(), self: creds.user });
  const denied = [];
  const allow = (list) =>
    list.map((token) => {
      const r = resolve(token);
      if (r.denied) denied.push(r.denied);
      return r.email;
    });
  const toResolved = allow(to);
  const ccResolved = allow(cc);
  const bccResolved = allow(bcc);
  if (denied.length) throw new RecipientNotAllowedError(denied);

  const attachments = (opts.attach && opts.attach.length)
    ? buildAttachments(toList(opts.attach), deps)
    : [];

  const transporter = deps.createTransport(creds);

  let text;
  let html;
  if (opts.markdown) {
    const r = renderMarkdown(opts.body, { style: opts.style !== false });
    html = r.html;
    text = r.text;
  } else {
    if (opts.body) text = opts.body;
    if (opts.html) html = opts.html;
  }

  // Signature: appended after body assembly; suppressed by --no-signature (opts.noSignature)
  // or when commander maps --no-signature → opts.signature === false.
  const suppressSig = opts.noSignature || opts.signature === false;
  const sig = (!suppressSig && config.signature) || null;
  if (sig) {
    if (text != null && sig.text) text = `${text}\n\n${sig.text}`;
    if (html != null && sig.html) html = `${html}${sig.html}`;
  }

  // Identity
  const fromName = opts.fromName || config.fromName;
  const replyTo = opts.replyTo || config.replyTo;

  const message = {
    from: fromName ? `"${fromName}" <${creds.user}>` : creds.user,
    to: toResolved,
    cc: ccResolved,
    bcc: bccResolved,
    subject: opts.subject || '',
  };
  if (text != null) message.text = text;
  if (html != null) message.html = html;
  if (replyTo) message.replyTo = replyTo;
  if (attachments.length) message.attachments = attachments.map(({ filename, path }) => ({ filename, path }));

  // Threading
  const refs = toList(opts.references);
  if (opts.inReplyTo) {
    message.inReplyTo = opts.inReplyTo;
    message.references = refs.length ? refs : [opts.inReplyTo];
  } else if (refs.length) {
    message.references = refs;
  }

  const info = await transporter.sendMail(message);

  return {
    from: message.from,
    to: toResolved,
    cc: ccResolved,
    bcc: bccResolved,
    subject: message.subject,
    messageId: info.messageId,
    accepted: info.accepted || [],
    rejected: info.rejected || [],
    attachments: attachments.map(({ filename, bytes }) => ({ filename, bytes })),
  };
}
