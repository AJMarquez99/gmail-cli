import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from './lib/jsonfile.js';

export function resolveAllowlistPath(env = process.env) {
  if (env.GMAIL_ALLOWLIST) return env.GMAIL_ALLOWLIST;
  return join(env.HOME || '', '.config', 'gmail-cli', 'allowlist.json');
}

/**
 * Load the recipient allowlist. A missing or empty file yields an empty list — combined with
 * fail-closed enforcement in runSend, that means "deny everyone but self" by default. A
 * present-but-malformed file throws MalformedConfigError (exit 2), not a raw parse error.
 */
export function loadAllowlist({ env = process.env, readFile = readFileSync, path } = {}) {
  const resolvedPath = path || resolveAllowlistPath(env);
  const parsed = readJson(resolvedPath, { readFile, onMissing: () => ({ recipients: [] }) });
  return { recipients: Array.isArray(parsed.recipients) ? parsed.recipients : [] };
}

/**
 * Build a recipient resolver over an allowlist. `self` (the configured account) is always
 * implicitly allowed. resolve(token) returns { email } for an allowed address — expanding
 * aliases to their canonical email — or { denied: token } if it's not permitted.
 */
export function makeAllowChecker({ allowlist = { recipients: [] }, self } = {}) {
  const allowedEmails = new Set();
  const aliasMap = new Map(); // lowercased alias -> canonical email (original case)

  if (self) allowedEmails.add(self.toLowerCase());
  for (const entry of allowlist.recipients || []) {
    if (!entry || !entry.email) continue;
    allowedEmails.add(String(entry.email).toLowerCase());
    for (const alias of entry.aliases || []) {
      aliasMap.set(String(alias).toLowerCase(), entry.email);
    }
  }

  function resolve(token) {
    const t = String(token).trim();
    if (t.includes('@')) {
      return allowedEmails.has(t.toLowerCase()) ? { email: t } : { denied: t };
    }
    const canonical = aliasMap.get(t.toLowerCase());
    return canonical ? { email: canonical } : { denied: t };
  }

  return { resolve };
}
