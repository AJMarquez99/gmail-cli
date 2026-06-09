import { MissingCredentialsError } from '../lib/errors.js';

/**
 * Health check: are credentials present, and does Gmail accept them over SMTP?
 * Never throws — returns a diagnostic envelope so callers always get a readable report.
 */
export async function runDoctor(opts, deps) {
  let creds;
  try {
    creds = deps.resolveCredentials();
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return { ok: false, credentials: 'missing', smtp: 'skipped', error: err.message };
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
    };
  }

  return { ok: true, user: creds.user, source: creds.source, credentials: 'ok', smtp: 'ok' };
}
