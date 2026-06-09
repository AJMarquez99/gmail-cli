import { InvalidInputError, RecipientNotAllowedError } from '../lib/errors.js';
import { makeAllowChecker } from '../allowlist.js';

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
  };
}
