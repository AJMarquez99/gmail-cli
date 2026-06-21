import { InvalidInputError } from '../lib/errors.js';
import { toList, buildMessage } from '../compose.js';
import { resolveRecipients, enforceAllowlist, logSend } from '../transmit.js';

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

  const profile = deps.resolveProfile(opts.profile);
  const creds = deps.resolveCredentials(profile.legacy ? {} : { path: profile.credentialsPath });

  // Resolve recipients; collect denials but do not throw yet (dry-run needs to report them).
  const { enforce, denied, to: toResolved, cc: ccResolved, bcc: bccResolved } =
    resolveRecipients({ to, cc, bcc }, opts, { profile, creds }, deps);

  const { message, attachmentsOut } = buildMessage(
    { to: toResolved, cc: ccResolved, bcc: bccResolved },
    opts,
    { profile, creds },
    deps,
  );

  // Dry-run: preview only. No transport, no send, no log. Report (not throw) denials.
  if (opts.dryRun) {
    return {
      dryRun: true,
      from: message.from,
      to: toResolved.filter(Boolean), cc: ccResolved.filter(Boolean), bcc: bccResolved.filter(Boolean),
      subject: message.subject, replyTo: message.replyTo || null, inReplyTo: opts.inReplyTo || null,
      hasHtml: message.html != null, hasText: message.text != null,
      textPreview: message.text != null ? message.text.slice(0, 500) : null,
      attachments: attachmentsOut,
      allowed: [...toResolved, ...ccResolved, ...bccResolved].filter(Boolean),
      denied,
      allowlistEnforced: enforce,
    };
  }

  // Real send: enforce allowlist now (denied is only populated when enforce is true).
  enforceAllowlist(denied, enforce);

  const transporter = deps.createTransport(creds);
  const info = await transporter.sendMail(message);

  const result = {
    from: message.from, to: toResolved, cc: ccResolved, bcc: bccResolved,
    subject: message.subject, messageId: info.messageId,
    accepted: info.accepted || [], rejected: info.rejected || [],
    attachments: attachmentsOut,
  };

  logSend({ from: message.from, to: toResolved, cc: ccResolved, bcc: bccResolved,
    subject: message.subject, messageId: info.messageId,
    attachments: attachmentsOut.map((a) => a.filename),
    ...(opts.logBody || profile.sendLog.logBody ? { text: message.text ?? null, html: message.html ?? null } : {}) },
  opts, { profile }, deps);

  return result;
}
