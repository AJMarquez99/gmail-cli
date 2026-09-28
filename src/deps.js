import { createInterface } from 'node:readline';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { simpleParser } from 'mailparser';
import { resolveCredentials } from './auth/credentials.js';
import { createGmailTransport } from './transport.js';
import { createImapClient } from './imap.js';
import { loadAllowlist } from './allowlist.js';
import { loadConfig } from './config.js';
import { isBoundaryLocked } from './lock.js';
import { appendSendLog, readSendLog } from './lib/sendlog.js';
import { resolveProfile } from './profile.js';

// Default wiring injected into command handlers. Tests substitute their own.
export const defaultDeps = {
  env: process.env,
  resolveCredentials: (o) => resolveCredentials(o || {}),
  resolveProfile: (name) => resolveProfile({ env: process.env, config: loadConfig({}), name }),
  createTransport: (creds) => createGmailTransport(creds),
  createImapClient: (creds, imapOpts) => createImapClient(creds, imapOpts),
  parseMessage: (source) => simpleParser(source),
  loadAllowlist: (o) => loadAllowlist(o || {}),
  loadConfig: () => loadConfig({}),
  isBoundaryLocked: () => isBoundaryLocked({ env: process.env, config: loadConfig({}) }),
  statFile: (p) => statSync(p),
  readFileBytes: (p) => readFileSync(p),
  realpath: (p) => realpathSync(p),
  cwd: () => process.cwd(),
  now: () => new Date().toISOString(),
  // Threads the default chmod/warn through so an existing (pre-hardening) send log gets
  // re-tightened on every append too; callers may still override either via `o`.
  appendLog: (entry, o) => appendSendLog(entry, { chmod: defaultDeps.chmod, warn: defaultDeps.warn, ...(o || {}) }),
  readLog: (o) => readSendLog(o || {}),
  fileExists: (p) => existsSync(p),
  ensureDir: (d) => mkdirSync(d, { recursive: true }),
  writeFileIfAbsent: (p, c, mode) => {
    if (!existsSync(p)) writeFileSync(p, c, mode != null ? { mode } : undefined);
  },
  readFile: (p) => readFileSync(p, 'utf8'),
  writeFile: (p, data, mode) => writeFileSync(p, data, mode != null ? { mode } : undefined),
  chmod: (p, mode) => chmodSync(p, mode),
  warn: (msg) => process.stderr.write(`warn: ${msg}\n`),
  prompt: (q) =>
    new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(q, (answer) => {
        rl.close();
        resolve(answer);
      });
    }),
  promptHidden: (q) =>
    new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl._writeToOutput = (s) => {
        if (s.includes(q)) process.stdout.write(s);
      };
      rl.question(q, (answer) => {
        process.stdout.write('\n');
        rl.close();
        resolve(answer);
      });
    }),
};
