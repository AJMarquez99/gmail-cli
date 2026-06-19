import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from './lib/jsonfile.js';

export function resolveSettingsPath(env = process.env) {
  if (env.GMAIL_CLI_SETTINGS) return env.GMAIL_CLI_SETTINGS;
  return join(env.HOME || '', '.config', 'gmail-cli', 'config.json');
}

/** Load non-secret preferences. Missing/empty file → {}. Malformed → MalformedConfigError. All fields optional. */
export function loadConfig({ env = process.env, readFile = readFileSync } = {}) {
  return readJson(resolveSettingsPath(env), { readFile });
}
