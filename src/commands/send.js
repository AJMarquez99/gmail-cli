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
    throw new InvalidInputError('Empty message. Provide --body (text), --html, --markdown, or pipe body on stdin.');
  }
  if (opts.markdown && opts.html) {
    throw new InvalidInputError('Use either --markdown or --html, not both.');
  }

  const profile = deps.resolveProfile(opts.profile);
  const creds = deps.resolveCredentials({ path: profile.credentialsPath });

  // Determine whether allowlist enforcement is active. Default: ON (fail-closed).
  // Turned off by: opts.noAllowlist, opts.allowlist === false, or profile.allowlistEnforce === false.
  const enforce = !(opts.noAllowlist || opts.allowlist === false) && profile.allowlistEnforce;

  // Resolve recipients; collect denials but do not throw yet (dry-run needs to report them).
  const { resolve } = makeAllowChecker({ allowlist: deps.loadAllowlist({ path: profile.allowlistPath }), self: creds.user });
  const denied = [];
  const allow = (list) =>
    list.map((token) => {
      const r = resolve(token);
      if (r.email) return r.email;                             // allowed or alias-expanded
      if (enforce) { denied.push(r.denied); return undefined; } // will throw later
      return r.denied;                                          // enforcement off: pass through as-is
    });
  const toResolved = allow(to);
  const ccResolved = allow(cc);
  const bccResolved = allow(bcc);

  // Body
  let text;
  let html;
  // Commander maps --no-style → opts.style === false; opts.noStyle covers programmatic/test use.
  if (opts.markdown) { const r = renderMarkdown(opts.body, { style: !(opts.noStyle || opts.style === false) }); html = r.html; text = r.text; }
  else { if (opts.body) text = opts.body; if (opts.html) html = opts.html; }

  // Signature (suppressed by --no-signature → opts.signature===false, or direct opts.noSignature)
  const suppressSig = opts.noSignature || opts.signature === false;
  const sig = (!suppressSig && profile.signature) || null;
  if (sig) { if (text != null && sig.text) text = `${text}\n\n${sig.text}`; if (html != null && sig.html) html = `${html}${sig.html}`; }

  // Attachments
  const attachments = (opts.attach && opts.attach.length) ? buildAttachments(toList(opts.attach), deps) : [];

  // Identity + threading
  const fromName = opts.fromName || profile.fromName;
  const replyTo = opts.replyTo || profile.replyTo;
  const refs = toList(opts.references);

  const message = {
    from: fromName ? `"${fromName}" <${creds.user}>` : creds.user,
    to: toResolved, cc: ccResolved, bcc: bccResolved,
    subject: opts.subject || '',
  };
  if (text != null) message.text = text;
  if (html != null) message.html = html;
  if (replyTo) message.replyTo = replyTo;
  if (opts.inReplyTo) { message.inReplyTo = opts.inReplyTo; message.references = refs.length ? refs : [opts.inReplyTo]; }
  else if (refs.length) message.references = refs;
  if (attachments.length) message.attachments = attachments.map(({ filename, path }) => ({ filename, path }));

  const attachmentsOut = attachments.map(({ filename, bytes }) => ({ filename, bytes }));

  // Dry-run: preview only. No transport, no send, no log. Report (not throw) denials.
  if (opts.dryRun) {
    return {
      dryRun: true,
      from: message.from,
      to: toResolved.filter(Boolean), cc: ccResolved.filter(Boolean), bcc: bccResolved.filter(Boolean),
      subject: message.subject, replyTo: replyTo || null, inReplyTo: opts.inReplyTo || null,
      hasHtml: html != null, hasText: text != null,
      textPreview: text != null ? text.slice(0, 500) : null,
      attachments: attachmentsOut,
      allowed: [...toResolved, ...ccResolved, ...bccResolved].filter(Boolean),
      denied,
      allowlistEnforced: enforce,
    };
  }

  // Real send: enforce allowlist now (denied is only populated when enforce is true).
  if (denied.length) throw new RecipientNotAllowedError(denied);

  // Warn on real sends when enforcement is off.
  if (!enforce) {
    process.stderr.write('warn: allowlist enforcement disabled — sending to any recipient (re-enable via config allowlist.enforce or drop --no-allowlist).\n');
  }

  const transporter = deps.createTransport(creds);
  const info = await transporter.sendMail(message);

  const result = {
    from: message.from, to: toResolved, cc: ccResolved, bcc: bccResolved,
    subject: message.subject, messageId: info.messageId,
    accepted: info.accepted || [], rejected: info.rejected || [],
    attachments: attachmentsOut,
  };

  // Commander maps --no-log → opts.log === false; opts.noLog covers programmatic/test use.
  const logEnabled = !(opts.noLog || opts.log === false) && profile.sendLog.enabled !== false;
  if (logEnabled) {
    try {
      const entry = {
        ts: deps.now(), from: message.from, to: toResolved, cc: ccResolved, bcc: bccResolved,
        subject: message.subject, messageId: info.messageId, attachments: attachments.map((a) => a.filename),
      };
      if (opts.logBody || profile.sendLog.logBody) { entry.text = text ?? null; entry.html = html ?? null; }
      deps.appendLog(entry, { path: profile.sendLogPath });
    } catch (err) {
      process.stderr.write(`warn: send-log write failed: ${err.message}\n`);
    }
  }

  return result;
}
