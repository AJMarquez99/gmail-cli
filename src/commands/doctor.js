import { MissingCredentialsError } from '../lib/errors.js';

/**
 * Health check: are credentials present, and does Gmail accept them over SMTP?
 * Never throws — returns a diagnostic envelope so callers always get a readable report.
 */
export async function runDoctor(opts, deps) {
  const allowlist = deps.loadAllowlist().recipients.filter((r) => r && r.email).length;

  let creds;
  try {
    creds = deps.resolveCredentials();
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return { ok: false, credentials: 'missing', smtp: 'skipped', error: err.message, allowlist };
    }
    throw err;
  }

  const transporter = deps.createTransport(creds);
  try {
    await transporter.verify();
  } catch (err) {
    return {
      ok: false,
      user: creds.user,
      source: creds.source,
      credentials: 'ok',
      smtp: err.message || String(err),
      allowlist,
    };
  }

  return { ok: true, user: creds.user, source: creds.source, credentials: 'ok', smtp: 'ok', allowlist };
}
