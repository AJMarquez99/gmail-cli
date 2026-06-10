import { MissingCredentialsError } from '../lib/errors.js';

/**
 * Health check: are credentials present, and does Gmail accept them over SMTP?
 * Never throws — returns a diagnostic envelope so callers always get a readable report.
 */
export async function runDoctor(opts, deps) {
  let profile;
  try {
    profile = deps.resolveProfile(opts.profile);
  } catch (err) {
    return {
      ok: false,
      profile: opts.profile || '(unresolved)',
      credentials: 'skipped',
      smtp: 'skipped',
      allowlist: 0,
      allowlistEnforced: true,
      error: err.message,
    };
  }

  const allowlist = deps.loadAllowlist({ path: profile.allowlistPath }).recipients.filter((r) => r && r.email).length;
  const allowlistEnforced = profile.allowlistEnforce;

  let creds;
  try {
    creds = deps.resolveCredentials({ path: profile.credentialsPath });
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return { ok: false, profile: profile.name, credentials: 'missing', smtp: 'skipped', error: err.message, allowlist, allowlistEnforced };
    }
    throw err;
  }

  const transporter = deps.createTransport(creds);
  try {
    await transporter.verify();
  } catch (err) {
    return {
      ok: false,
      profile: profile.name,
      user: creds.user,
      source: creds.source,
      credentials: 'ok',
      smtp: err.message || String(err),
      allowlist,
      allowlistEnforced,
    };
  }

  return { ok: true, profile: profile.name, user: creds.user, source: creds.source, credentials: 'ok', smtp: 'ok', allowlist, allowlistEnforced };
}
