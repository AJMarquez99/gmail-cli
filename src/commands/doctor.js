import { MissingCredentialsError } from '../lib/errors.js';

/**
 * Health check: are credentials present, and does Gmail accept them over SMTP and IMAP?
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
      imap: 'skipped',
      allowlist: 0,
      allowlistEnforced: true,
      error: err.message,
    };
  }

  let allowlist = 0;
  try {
    allowlist = deps.loadAllowlist({ path: profile.allowlistPath }).recipients.filter((r) => r && r.email).length;
  } catch {
    // Non-ENOENT IO error (e.g. EACCES) — treat count as 0; doctor must never throw.
  }
  const allowlistEnforced = profile.allowlistEnforce;

  let creds;
  try {
    creds = deps.resolveCredentials(profile.legacy ? {} : { path: profile.credentialsPath });
  } catch (err) {
    const credentials = err instanceof MissingCredentialsError ? 'missing' : 'error';
    return { ok: false, profile: profile.name, credentials, smtp: 'skipped', imap: 'skipped', error: err.message, allowlist, allowlistEnforced };
  }

  let smtpOk = false;
  let smtp;
  try {
    const transporter = deps.createTransport(creds);
    await transporter.verify();
    smtpOk = true;
    smtp = 'ok';
  } catch (err) {
    smtp = err.message || String(err);
  }

  let imap;
  try {
    const c = deps.createImapClient(creds, profile.imap || {});
    await c.connect();
    try {
      // Connected successfully; nothing else to probe here.
    } finally {
      await c.logout();
    }
    imap = 'ok';
  } catch (e) {
    imap = e.message || String(e);
  }

  if (!smtpOk) {
    return {
      ok: false,
      profile: profile.name,
      user: creds.user,
      source: creds.source,
      credentials: 'ok',
      smtp,
      imap,
      allowlist,
      allowlistEnforced,
    };
  }

  return { ok: smtpOk && imap === 'ok', profile: profile.name, user: creds.user, source: creds.source, credentials: 'ok', smtp, imap, allowlist, allowlistEnforced };
}
