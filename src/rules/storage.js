import { join } from 'node:path';
import { readJson, writeJson } from '../lib/jsonfile.js';

/** Default rules-file location. `GMAIL_RULES` overrides; else ~/.config/gmail-cli/rules.json. */
export function resolveRulesPath(env = process.env) {
  if (env.GMAIL_RULES) return env.GMAIL_RULES;
  return join(env.HOME || '', '.config', 'gmail-cli', 'rules.json');
}

/** Load the rules array from the `{ rules: [...] }` container. Missing/empty/shape-mismatch → []. */
export function loadRules({ path, readFile } = {}) {
  const data = readJson(path, { readFile });
  return Array.isArray(data.rules) ? data.rules : [];
}

/** Persist the rules array inside a `{ rules: [...] }` container (pretty JSON + trailing newline). */
export function saveRules(path, rules, { writeFile } = {}) {
  writeJson(path, { rules }, { writeFile });
}
