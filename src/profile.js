import { join } from 'node:path';
import { resolveConfigPath } from './auth/credentials.js';
import { resolveAllowlistPath } from './allowlist.js';
import { resolveSendLogPath } from './lib/sendlog.js';
import { InvalidInputError } from './lib/errors.js';

const expand = (p, home) => (p && p.startsWith('~') ? join(home, p.slice(1)) : p);

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
      fromName: config.fromName || null,
      replyTo: config.replyTo || null,
      signature: config.signature || null,
      allowlistEnforce: config.allowlist ? config.allowlist.enforce !== false : true,
      sendLog: config.sendLog || {},
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
    fromName: p.fromName || null,
    replyTo: p.replyTo || null,
    signature: p.signature || null,
    allowlistEnforce: p.allowlist ? p.allowlist.enforce !== false : true,
    sendLog: p.sendLog || {},
    legacy: false,
  };
}
