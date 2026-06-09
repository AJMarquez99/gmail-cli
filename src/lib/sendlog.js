import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function resolveSendLogPath(env = process.env) {
  if (env.GMAIL_SEND_LOG) return env.GMAIL_SEND_LOG;
  return join(env.HOME || '', '.config', 'gmail-cli', 'sent.jsonl');
}

export function appendSendLog(entry, { env = process.env, append = appendFileSync, mkdir = mkdirSync } = {}) {
  const path = resolveSendLogPath(env);
  mkdir(dirname(path), { recursive: true });
  append(path, JSON.stringify(entry) + '\n');
}

/** Read the last `limit` entries, newest-first. Missing file → []. */
export function readSendLog({ env = process.env, readFile = readFileSync, limit = 20 } = {}) {
  let raw;
  try {
    raw = readFile(resolveSendLogPath(env), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const lines = raw.split('\n').filter((l) => l.trim());
  const parsed = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  return parsed.slice(-limit).reverse();
}
