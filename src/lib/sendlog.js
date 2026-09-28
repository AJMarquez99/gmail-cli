import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tightenMode } from './permissions.js';

export function resolveSendLogPath(env = process.env) {
  if (env.GMAIL_SEND_LOG) return env.GMAIL_SEND_LOG;
  return join(env.HOME || '', '.config', 'gmail-cli', 'sent.jsonl');
}

// `append`'s `{ mode: 0o600 }` only applies the first time the file is created — a log that
// pre-dates this hardening is appended to (never recreated), so it stays 0644 forever unless we
// explicitly re-tighten it after every append via `chmod`.
export function appendSendLog(entry, { env = process.env, append = appendFileSync, mkdir = mkdirSync, chmod, warn, path } = {}) {
  const resolvedPath = path || resolveSendLogPath(env);
  mkdir(dirname(resolvedPath), { recursive: true });
  append(resolvedPath, JSON.stringify(entry) + '\n', { mode: 0o600 });
  tightenMode(resolvedPath, 0o600, { chmod, warn });
}

/** Read the last `limit` entries, newest-first. Missing file → []. */
export function readSendLog({ env = process.env, readFile = readFileSync, limit = 20, path } = {}) {
  const resolvedPath = path || resolveSendLogPath(env);
  let raw;
  try {
    raw = readFile(resolvedPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const lines = raw.split('\n').filter((l) => l.trim());
  const parsed = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return parsed.slice(-limit).reverse();
}
