import { join } from 'node:path';
import { resolveConfigPath } from './auth/credentials.js';
import { resolveAllowlistPath } from './allowlist.js';
import { resolveSendLogPath } from './lib/sendlog.js';
import { resolveRulesPath } from './rules/storage.js';
import { InvalidInputError, MalformedConfigError } from './lib/errors.js';
import { resolveCapabilities } from './capabilities.js';

const expand = (p, home) => (p && p.startsWith('~') ? join(home, p.slice(1)) : p);

/**
 * Resolve `maxRecipients` from a raw config value: absent → default 10; present must coerce
 * (via Number()) to an integer >= 1 (a numeric string like "5" is fine) or resolution fails
 * loudly with MalformedConfigError (exit 2) naming the key — a silently-disabled fan-out cap
 * (e.g. NaN from a typo, which would make `total > NaN` never fire) is worse than a hard stop.
 */
function resolveMaxRecipients(raw, key) {
  if (raw == null) return 10;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new MalformedConfigError(key, `"${key}" must be an integer >= 1 (got: ${JSON.stringify(raw)}).`);
  }
  return n;
}

export function resolveProfile({ env = process.env, config = {}, name } = {}) {
  const home = env.HOME || '';
  const dir = join(home, '.config', 'gmail-cli');
  const profiles = config.profiles;

  if (!profiles || Object.keys(profiles).length === 0) {
    return {
      name: '(default)',
      credentialsPath: resolveConfigPath(env),
      allowlistPath: resolveAllowlistPath(env),
      sendLogPath: resolveSendLogPath(env),
      rulesPath: resolveRulesPath(env),
      fromName: config.fromName || null,
      replyTo: config.replyTo || null,
      signature: config.signature || null,
      allowlistEnforce: config.allowlist ? config.allowlist.enforce !== false : true,
      sendLog: config.sendLog || {},
      attachRoot: expand(config.attachRoot, home) || null,
      maxRecipients: resolveMaxRecipients(config.maxRecipients, 'maxRecipients'),
      capabilities: resolveCapabilities(config),
      imap: config.imap || {},
      legacy: true,
    };
  }

  const names = Object.keys(profiles);
  let selected = name || env.GMAIL_PROFILE || config.defaultProfile;
  if (!selected && names.length === 1) selected = names[0];
  if (!selected) {
    throw new InvalidInputError(
      `Multiple profiles configured (${names.join(', ')}); pass --profile <name> or set one with \`gmail profile use <name>\`.`,
    );
  }
  if (!profiles[selected]) {
    throw new InvalidInputError(`Unknown profile "${selected}". Configured: ${names.join(', ')}.`);
  }
  const p = profiles[selected];
  return {
    name: selected,
    credentialsPath: expand(p.credentialsPath, home) || join(dir, `credentials-${selected}.json`),
    allowlistPath: expand(p.allowlistPath, home) || join(dir, `allowlist-${selected}.json`),
    sendLogPath: expand(p.sendLogPath, home) || join(dir, `sent-${selected}.jsonl`),
    rulesPath: expand(p.rulesPath, home) || join(dir, `rules-${selected}.json`),
    fromName: p.fromName || null,
    replyTo: p.replyTo || null,
    signature: p.signature || null,
    allowlistEnforce: p.allowlist ? p.allowlist.enforce !== false : true,
    sendLog: p.sendLog || {},
    attachRoot: expand(p.attachRoot, home) || null,
    maxRecipients: resolveMaxRecipients(p.maxRecipients, `profiles.${selected}.maxRecipients`),
    capabilities: resolveCapabilities(p),
    imap: p.imap || {},
    legacy: false,
  };
}
