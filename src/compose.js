import { basename, resolve as resolvePath, sep } from 'node:path';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { InvalidInputError } from './lib/errors.js';
import { renderMarkdown } from './lib/markdown.js';

const GMAIL_MAX_BYTES = 25 * 1024 * 1024;
const WARN_BYTES = 20 * 1024 * 1024;

/**
 * Compile a nodemailer message object into a raw RFC822 Buffer (for IMAP APPEND).
 * Built directly from MailComposer (not through the SMTP transport), so it doesn't inherit
 * the transport's disableFileAccess/disableUrlAccess — force them here too, as defense in
 * depth against any attachment that isn't an in-process buffer (path/href content).
 */
export function buildRawMime(message) {
  return new MailComposer({ ...message, disableFileAccess: true, disableUrlAccess: true }).compile().build();
}

export function toList(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.flatMap((entry) => String(entry).split(',')).map((s) => s.trim()).filter(Boolean);
}

const ATTACH_ROOT_HELP = 'Set one with `gmail config set attachRoot <dir>` (add --profile <name> for a profile).';

// A root resolving to the filesystem root (lexically, or via a symlink whose real target IS the
// filesystem root) makes the confinement check below vacuous — every absolute path lies "under"
// `/`. Refuse outright rather than silently accepting anything, before touching the filesystem.
function assertNotFsRoot(resolved) {
  if (resolvePath(resolved, '..') === resolved) {
    throw new InvalidInputError(
      `Refusing to attach files: the attachment root is the filesystem root. ${ATTACH_ROOT_HELP}`,
    );
  }
}

export function buildAttachments(paths, deps, { root } = {}) {
  const base = resolvePath(root || deps.cwd());
  assertNotFsRoot(base);
  const prefix = base.endsWith(sep) ? base : base + sep;
  // Resolve the root itself too — it may be a symlink — so the confinement check below compares
  // real paths on both sides. The symlink's real target may itself be the filesystem root even
  // when the lexical `base` above isn't, so re-check after resolving.
  const realBase = deps.realpath(base);
  assertNotFsRoot(realBase);
  const realPrefix = realBase.endsWith(sep) ? realBase : realBase + sep;
  const out = [];
  let total = 0;
  for (const p of paths) {
    const abs = resolvePath(base, p);
    if (abs !== base && !abs.startsWith(prefix)) {
      throw new InvalidInputError(
        `Refusing to attach a file outside ${base}: ${p}. ${ATTACH_ROOT_HELP} Or move the file under ${base}.`,
      );
    }
    // Lexical confinement alone is defeated by a symlink inside the root pointing outside it
    // (e.g. `ln -s ~/.ssh/id_rsa ./a.pdf`). Resolve the real path and re-check before reading.
    let real;
    try { real = deps.realpath(abs); } catch { throw new InvalidInputError(`Attachment not found: ${abs}`); }
    if (real !== realBase && !real.startsWith(realPrefix)) {
      throw new InvalidInputError(
        `Refusing to attach a file outside ${base}: ${p}. ${ATTACH_ROOT_HELP} Or move the file under ${base}.`,
      );
    }
    let stat;
    try { stat = deps.statFile(real); } catch { throw new InvalidInputError(`Attachment not found: ${abs}`); }
    if (!stat.isFile()) throw new InvalidInputError(`Attachment is not a file: ${abs}`);
    const content = deps.readFileBytes(real);
    total += stat.size;
    out.push({ filename: basename(abs), content, bytes: stat.size });
  }
  if (total > GMAIL_MAX_BYTES) {
    throw new InvalidInputError(`Attachments total ${(total / 1048576).toFixed(1)}MB exceeds Gmail's 25MB limit.`);
  }
  if (total > WARN_BYTES) {
    process.stderr.write(`warn: attachments total ${(total / 1048576).toFixed(1)}MB — near Gmail's 25MB limit.\n`);
  }
  return out;
}

/** Reject CR/LF in a single-line header value (defends against header injection). Returns the value unchanged. */
function assertNoCRLF(value, field) {
  if (value == null) return value;
  const s = String(value);
  if (/[\r\n]/.test(s)) throw new InvalidInputError(`${field} must not contain CR or LF characters.`);
  return s;
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
  const attachments = (opts.attach && opts.attach.length) ? buildAttachments(toList(opts.attach), deps, { root: profile.attachRoot }) : [];
  const fromName = assertNoCRLF(opts.fromName || profile.fromName, '--from-name');
  const replyTo = assertNoCRLF(opts.replyTo || profile.replyTo, '--reply-to');
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
  if (attachments.length) message.attachments = attachments.map(({ filename, content }) => ({ filename, content }));

  return { message, attachmentsOut: attachments.map(({ filename, bytes }) => ({ filename, bytes })) };
}
