import { makeAllowChecker } from './allowlist.js';
import { RecipientNotAllowedError, InvalidInputError, BoundaryLockedError, TooManyRecipientsError } from './lib/errors.js';

const ENFORCE_OFF_WARNING =
  'warn: allowlist enforcement disabled — sending to any recipient (re-enable via config allowlist.enforce or drop --no-allowlist).\n';

/**
 * Resolve to/cc/bcc against the profile allowlist. Returns resolved arrays + the collected
 * denials + the enforce flag. Does NOT throw on denials (callers gate; send supports dry-run
 * reporting) — but DOES throw BoundaryLockedError when enforcement would be off (a
 * --no-allowlist bypass or config allowlist.enforce:false) while the boundary is locked, and
 * DOES throw TooManyRecipientsError up front when to+cc+bcc exceeds profile.maxRecipients
 * (default 10) — a hard blast-radius cap that applies unconditionally (even dry-run, even with
 * the allowlist bypassed), since it bounds fan-out rather than policing which addresses.
 */
export function resolveRecipients(lists, opts, { profile, creds }, deps) {
  const { to = [], cc = [], bcc = [] } = lists;
  const total = to.length + cc.length + bcc.length;
  const max = profile.maxRecipients != null ? profile.maxRecipients : 10;
  if (total > max) throw new TooManyRecipientsError(total, max);

  const enforce = !(opts.noAllowlist || opts.allowlist === false) && profile.allowlistEnforce;
  if (!enforce && deps.isBoundaryLocked?.()) {
    throw new BoundaryLockedError('the recipient allowlist bypass');
  }
  return resolveAgainstAllowlist(lists, enforce, { profile, creds }, deps);
}

function resolveAgainstAllowlist({ to = [], cc = [], bcc = [] }, enforce, { profile, creds }, deps) {
  const { resolve } = makeAllowChecker({ allowlist: deps.loadAllowlist({ path: profile.allowlistPath }), self: creds.user });
  const denied = [];
  const allow = (list) =>
    list.map((token) => {
      const r = resolve(token);
      if (r.email) return r.email;
      if (enforce) { denied.push(r.denied); return undefined; }
      return r.denied;
    });
  return { enforce, denied, to: allow(to), cc: allow(cc), bcc: allow(bcc) };
}

/** Expand allowlist aliases WITHOUT enforcing (drafts never transmit). Rejects tokens that are still not addresses. */
export function expandRecipients(lists, { profile, creds }, deps) {
  // Non-enforcing by design (nothing is transmitted), so it is not a bypass and the lock does not apply.
  const { to, cc, bcc } = resolveAgainstAllowlist(lists, false, { profile, creds }, deps);
  const bad = [...to, ...cc, ...bcc].filter((t) => !String(t).includes('@'));
  if (bad.length) throw new InvalidInputError(`Unknown alias or invalid address: ${bad.map((t) => `"${t}"`).join(', ')}`);
  return { to, cc, bcc };
}

/** Gate before transmitting: throw on denial when enforcing; warn when enforcement is off. */
export function enforceAllowlist(denied, enforce) {
  if (enforce && denied.length) throw new RecipientNotAllowedError(denied);
  if (!enforce) process.stderr.write(ENFORCE_OFF_WARNING);
}

/** Append a send-log entry (stamps ts), guarded by profile.sendLog.enabled / --no-log. Never throws. */
export function logSend(entry, opts, { profile }, deps) {
  const logEnabled = !(opts.noLog || opts.log === false) && profile.sendLog.enabled !== false;
  if (!logEnabled) return;
  try {
    deps.appendLog({ ts: deps.now(), ...entry }, { path: profile.sendLogPath });
  } catch (err) {
    process.stderr.write(`warn: send-log write failed: ${err.message}\n`);
  }
}
