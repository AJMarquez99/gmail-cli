import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MissingCredentialsError } from '../lib/errors.js';
import { readJson } from '../lib/jsonfile.js';

export function resolveConfigPath(env = process.env) {
  if (env.GMAIL_CLI_CONFIG) return env.GMAIL_CLI_CONFIG;
  return join(env.HOME || '', '.config', 'gmail-cli', 'credentials.json');
}

// App passwords are shown grouped as "xxxx xxxx xxxx xxxx"; Gmail accepts them with or
// without spaces. Normalize so users can paste either form.
function normalizeAppPassword(pw) {
  return String(pw || '').replace(/\s+/g, '');
}

/**
 * Resolve send credentials. Precedence:
 *   1. GMAIL_USER + GMAIL_APP_PASSWORD env vars  (only when `path` is NOT provided)
 *   2. JSON file at `path` (if provided) or resolveConfigPath() ({ user, appPassword })
 * Throws MissingCredentialsError if neither yields a usable pair.
 */
export function resolveCredentials({ env = process.env, readFile = readFileSync, path: explicitPath } = {}) {
  if (!explicitPath && env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    return {
      user: env.GMAIL_USER,
      appPassword: normalizeAppPassword(env.GMAIL_APP_PASSWORD),
      source: 'env',
    };
  }

  const path = explicitPath || resolveConfigPath(env);
  // Missing/empty credentials file → MissingCredentialsError; malformed JSON →
  // MalformedConfigError (exit 2), not a raw SyntaxError leaking at exit 1.
  const parsed = readJson(path, {
    readFile,
    onMissing: () => {
      throw new MissingCredentialsError(path);
    },
  });
  if (!parsed.user || !parsed.appPassword) throw new MissingCredentialsError(path);
  return {
    user: parsed.user,
    appPassword: normalizeAppPassword(parsed.appPassword),
    source: path,
  };
}
