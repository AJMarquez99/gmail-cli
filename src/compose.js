import { basename, resolve as resolvePath } from 'node:path';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { InvalidInputError } from './lib/errors.js';
import { renderMarkdown } from './lib/markdown.js';

const GMAIL_MAX_BYTES = 25 * 1024 * 1024;
const WARN_BYTES = 20 * 1024 * 1024;

/** Compile a nodemailer message object into a raw RFC822 Buffer (for IMAP APPEND). */
export function buildRawMime(message) {
  return new MailComposer(message).compile().build();
}

export function toList(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.flatMap((entry) => String(entry).split(',')).map((s) => s.trim()).filter(Boolean);
}

export function buildAttachments(paths, deps) {
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

/**
 * Assemble a nodemailer message object from already-resolved recipients + opts.
 * Does NOT perform allowlist resolution — callers pass resolved to/cc/bcc.
 * @returns {{ message: object, attachmentsOut: Array<{filename,bytes}> }}
 */
export function buildMessage({ to, cc, bcc }, opts, { profile, creds }, deps) {
  if (opts.markdown && opts.html) {
    throw new InvalidInputError('Use either --markdown or --html, not both.');
  }
  let text;
  let html;
  if (opts.markdown) {
    const r = renderMarkdown(opts.body, { style: !(opts.noStyle || opts.style === false) });
    html = r.html; text = r.text;
  } else {
    if (opts.body) text = opts.body;
    if (opts.html) html = opts.html;
  }
  const suppressSig = opts.noSignature || opts.signature === false;
  const sig = (!suppressSig && profile.signature) || null;
  if (sig) {
    if (text != null && sig.text) text = `${text}\n\n${sig.text}`;
    if (html != null && sig.html) html = `${html}${sig.html}`;
  }
  const attachments = (opts.attach && opts.attach.length) ? buildAttachments(toList(opts.attach), deps) : [];
  const fromName = opts.fromName || profile.fromName;
  const replyTo = opts.replyTo || profile.replyTo;
  const refs = toList(opts.references);

  const message = {
    from: fromName ? `"${fromName}" <${creds.user}>` : creds.user,
    to, cc, bcc,
    subject: opts.subject || '',
  };
  if (text != null) message.text = text;
  if (html != null) message.html = html;
  if (replyTo) message.replyTo = replyTo;
  if (opts.inReplyTo) { message.inReplyTo = opts.inReplyTo; message.references = refs.length ? refs : [opts.inReplyTo]; }
  else if (refs.length) message.references = refs;
  if (attachments.length) message.attachments = attachments.map(({ filename, path }) => ({ filename, path }));

  return { message, attachmentsOut: attachments.map(({ filename, bytes }) => ({ filename, bytes })) };
}
