import { dirname } from 'node:path';
import { resolveAllowlistPath } from '../allowlist.js';
import { resolveSettingsPath } from '../config.js';
import { resolveConfigPath } from '../auth/credentials.js';
import { ALLOWLIST_TEMPLATE, CONFIG_TEMPLATE } from '../lib/templates.js';
import { MissingCredentialsError } from '../lib/errors.js';

export async function runInit(_opts, deps) {
  const env = deps.env;

  const allowlistPath = resolveAllowlistPath(env);
  const configPath = resolveSettingsPath(env);
  const credsPath = resolveConfigPath(env);

  // Ensure config dir(s) exist — dedupe in case allowlist and config share a parent.
  const dirs = [...new Set([dirname(allowlistPath), dirname(configPath)])];
  for (const dir of dirs) {
    deps.ensureDir(dir);
  }

  const created = [];
  const skipped = [];

  const files = [
    [allowlistPath, ALLOWLIST_TEMPLATE],
    [configPath, CONFIG_TEMPLATE],
  ];

  for (const [path, template] of files) {
    if (deps.fileExists(path)) {
      skipped.push(path);
    } else {
      created.push(path);
    }
    // Safety net: writeFileIfAbsent only writes if the file is absent.
    deps.writeFileIfAbsent(path, template);
  }

  // Credential check — never prompt or write secrets, just report status.
  let credentials;
  try {
    deps.resolveCredentials();
    credentials = 'ok';
  } catch (e) {
    if (e instanceof MissingCredentialsError) {
      credentials = 'missing';
    } else {
      throw e;
    }
  }

  // Build next-steps guidance.
  const nextSteps = [];
  if (credentials === 'missing') {
    nextSteps.push(
      'Create a Gmail App Password (needs 2FA): https://myaccount.google.com/apppasswords',
      `Save it to ${credsPath} as { "user": "you@gmail.com", "appPassword": "..." } (chmod 600), or set GMAIL_USER + GMAIL_APP_PASSWORD`,
    );
  }
  nextSteps.push(
    `Add allowed recipients to ${allowlistPath}`,
    'Verify with: gmail doctor',
  );

  // dir is the config directory (first / only dir after dedup, or allowlist's parent).
  const dir = dirname(allowlistPath);

  // `dir` is included for JSON consumers; formatInit doesn't print it.
  return { dir, created, skipped, credentials, nextSteps };
}
