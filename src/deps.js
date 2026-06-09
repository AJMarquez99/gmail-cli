import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolveCredentials } from './auth/credentials.js';
import { createGmailTransport } from './transport.js';
import { loadAllowlist } from './allowlist.js';
import { loadConfig } from './config.js';
import { appendSendLog, readSendLog } from './lib/sendlog.js';

// Default wiring injected into command handlers. Tests substitute their own.
export const defaultDeps = {
  env: process.env,
  resolveCredentials: () => resolveCredentials({}),
  createTransport: (creds) => createGmailTransport(creds),
  loadAllowlist: () => loadAllowlist({}),
  loadConfig: () => loadConfig({}),
  statFile: (p) => statSync(p),
  now: () => new Date().toISOString(),
  appendLog: (entry) => appendSendLog(entry, {}),
  readLog: (opts) => readSendLog(opts),
  fileExists: (p) => existsSync(p),
  ensureDir: (d) => mkdirSync(d, { recursive: true }),
  writeFileIfAbsent: (p, c) => {
    if (!existsSync(p)) writeFileSync(p, c);
  },
};
