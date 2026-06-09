import { resolveCredentials } from './auth/credentials.js';
import { createGmailTransport } from './transport.js';
import { loadAllowlist } from './allowlist.js';
import { loadConfig } from './config.js';
import { statSync } from 'node:fs';
import { appendSendLog, readSendLog } from './lib/sendlog.js';

// Default wiring injected into command handlers. Tests substitute their own.
export const defaultDeps = {
  resolveCredentials: () => resolveCredentials({}),
  createTransport: (creds) => createGmailTransport(creds),
  loadAllowlist: () => loadAllowlist({}),
  loadConfig: () => loadConfig({}),
  statFile: (p) => statSync(p),
  now: () => new Date().toISOString(),
  appendLog: (entry) => appendSendLog(entry, {}),
  readLog: (opts) => readSendLog(opts || {}),
};
