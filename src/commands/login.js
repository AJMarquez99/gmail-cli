import { dirname } from 'node:path';
import { InvalidInputError } from '../lib/errors.js';

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

  return { path, user, written: true };
}
