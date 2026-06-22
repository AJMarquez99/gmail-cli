import { makeAllowChecker } from './allowlist.js';
import { RecipientNotAllowedError } from './lib/errors.js';

const ENFORCE_OFF_WARNING =
  'warn: allowlist enforcement disabled — sending to any recipient (re-enable via config allowlist.enforce or drop --no-allowlist).\n';

/**
 * Resolve to/cc/bcc against the profile allowlist. Returns resolved arrays + the collected
 * denials + the enforce flag. Does NOT throw (callers gate; send supports dry-run reporting).
 */
export function resolveRecipients({ to = [], cc = [], bcc = [] }, opts, { profile, creds }, deps) {
  const enforce = !(opts.noAllowlist || opts.allowlist === false) && profile.allowlistEnforce;
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
