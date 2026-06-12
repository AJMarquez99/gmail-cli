import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { simpleParser } from 'mailparser';
import { resolveCredentials } from './auth/credentials.js';
import { createGmailTransport } from './transport.js';
import { createImapClient } from './imap.js';
import { loadAllowlist } from './allowlist.js';
import { loadConfig } from './config.js';
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
  statFile: (p) => statSync(p),
  now: () => new Date().toISOString(),
  appendLog: (entry, o) => appendSendLog(entry, o || {}),
  readLog: (o) => readSendLog(o || {}),
  fileExists: (p) => existsSync(p),
  ensureDir: (d) => mkdirSync(d, { recursive: true }),
  writeFileIfAbsent: (p, c) => {
    if (!existsSync(p)) writeFileSync(p, c);
  },
  readFile: (p) => readFileSync(p, 'utf8'),
  writeFile: (p, data, mode) => writeFileSync(p, data, mode != null ? { mode } : undefined),
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
