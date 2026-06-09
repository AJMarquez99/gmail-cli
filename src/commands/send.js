import { basename, resolve as resolvePath } from 'node:path';
import { InvalidInputError, RecipientNotAllowedError } from '../lib/errors.js';
import { makeAllowChecker } from '../allowlist.js';

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

  const creds = deps.resolveCredentials();

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

  const message = {
    from: creds.user,
    to: toResolved,
    cc: ccResolved,
    bcc: bccResolved,
    subject: opts.subject || '',
  };
  if (opts.body) message.text = opts.body;
  if (opts.html) message.html = opts.html;
  if (opts.replyTo) message.replyTo = opts.replyTo;
  if (attachments.length) message.attachments = attachments.map(({ filename, path }) => ({ filename, path }));

  const info = await transporter.sendMail(message);

  return {
    from: creds.user,
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
