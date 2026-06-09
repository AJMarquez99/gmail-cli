import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InvalidInputError } from './lib/errors.js';

export function resolveSettingsPath(env = process.env) {
  if (env.GMAIL_CLI_SETTINGS) return env.GMAIL_CLI_SETTINGS;
  return join(env.HOME || '', '.config', 'gmail-cli', 'config.json');
}

/** Load non-secret preferences. Missing file → {}. All fields optional. */
export function loadConfig({ env = process.env, readFile = readFileSync } = {}) {
  const path = resolveSettingsPath(env);
  let raw;
  try {
    raw = readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new InvalidInputError(`Malformed config.json at ${path}: ${err.message}`);
  }
}
