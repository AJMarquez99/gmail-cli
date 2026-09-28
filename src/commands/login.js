import { dirname } from 'node:path';
import { InvalidInputError, BoundaryLockedError } from '../lib/errors.js';
import { tightenMode } from '../lib/permissions.js';

/**
 * Guided credential setup. Prompts for the Gmail address and App Password
 * (password prompt has echo OFF), then writes credentials.json at chmod 600.
 *
 * SECURITY: the app password flows prompt → file only. It is never returned,
 * logged, or included in any error message.
 *
 * @param {object} opts  - { user?: string, force?: boolean, profile?: string }
 * @param {object} deps  - { env, resolveProfile, fileExists, ensureDir, writeFile, prompt, promptHidden }
 */
export async function runLogin(opts, deps) {
  if (deps.isBoundaryLocked?.()) throw new BoundaryLockedError('changing credentials (login)');
  const profile = deps.resolveProfile(opts.profile);
  const path = profile.credentialsPath;

  if (deps.fileExists(path) && !opts.force) {
    throw new InvalidInputError(
      `Credentials already exist at ${path}. Re-run with --force to overwrite.`,
    );
  }

  const user = (opts.user || (await deps.prompt('Gmail address: '))).trim();

  if (!user.includes('@')) {
    throw new InvalidInputError(`Invalid email address: ${user}`);
  }

  const appPassword = (await deps.promptHidden('App Password (hidden): ')).replace(/\s+/g, '');

  if (!appPassword) {
    throw new InvalidInputError('App Password is required.');
  }

  deps.ensureDir(dirname(path));
  deps.writeFile(path, JSON.stringify({ user, appPassword }, null, 2) + '\n', 0o600);
  // writeFile's mode only applies on create; re-tighten an existing (e.g. --force) file to 0600.
  // A chmod failure here must not undo the write that already succeeded (see tightenMode).
  tightenMode(path, 0o600, { chmod: deps.chmod, warn: deps.warn });

  return { path, user, written: true };
}
