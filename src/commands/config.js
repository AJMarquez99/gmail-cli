import { dirname } from 'node:path';
import { resolveSettingsPath } from '../config.js';
import { readJson, writeJson, getPath, setPath, unsetPath, coerce } from '../lib/jsonfile.js';
import { InvalidInputError, BoundaryLockedError } from '../lib/errors.js';

const KNOWN_KEYS = new Set([
  'fromName',
  'replyTo',
  'signature.text',
  'signature.html',
  'sendLog.enabled',
  'sendLog.logBody',
  'allowlist.enforce',
  'maxRecipients',
  'locked',
  'defaultProfile',
  'attachRoot',
  'credentialsPath',
  'allowlistPath',
  'sendLogPath',
  'rulesPath',
  'imap.host',
  'imap.port',
  'imap.connectionTimeout',
  'imap.greetingTimeout',
  'imap.socketTimeout',
]);

// Global (top-level-only) keys: read from the config root, never per profile. `locked` is only
// honored at the top level by isBoundaryLocked; `defaultProfile` selects among profiles.
const GLOBAL_KEYS = new Set(['locked', 'defaultProfile']);

/**
 * Compute the dotted key path to read/write in the config object.
 * A fully-qualified `profiles.<name>.<key>` is an absolute path (the profile must exist);
 * otherwise legacy uses the bare key and profile mode prefixes `profiles.<active>.` — except
 * GLOBAL_KEYS, which are always top-level (and rejected in fully-qualified form).
 */
function keyPath(profile, key, config) {
  if (key.startsWith('profiles.')) {
    const [, name, ...rest] = key.split('.');
    if (!name || rest.length === 0) {
      throw new InvalidInputError(`Key "${key}" must name a setting: profiles.<name>.<key>`);
    }
    if (GLOBAL_KEYS.has(rest[0])) {
      throw new InvalidInputError(
        `"${rest[0]}" is a global key, not a per-profile setting — use \`gmail config set ${rest.join('.')} ...\` (it is always written at the top level).`,
      );
    }
    if (!config.profiles?.[name]) {
      throw new InvalidInputError(
        `Unknown profile "${name}" — create it with \`gmail profile add ${name}\` first.`,
      );
    }
    return key;
  }
  if (profile.name === '(default)' || GLOBAL_KEYS.has(key.split('.')[0])) return key;
  return `profiles.${profile.name}.${key}`;
}

const bareKey = (key) => (key.startsWith('profiles.') ? key.split('.').slice(2).join('.') : key);

// Top-level settings that define the boundary: the allowlist (enforcement + which file), the
// credentials file, the attachment root, the fan-out cap, capability scope, profile topology,
// and the lock itself. Matched on the FIRST segment of the bare key, so `allowlist.enforce` and
// a fully-qualified `profiles.<name>.allowlist.enforce` are both covered.
const BOUNDARY_KEYS = new Set([
  'allowlist',
  'allowlistPath',
  'credentialsPath',
  'attachRoot',
  'maxRecipients',
  'capabilities',
  'deny',
  'locked',
  'defaultProfile',
  'profiles',
]);

function refuseIfLocked(key, deps) {
  if (BOUNDARY_KEYS.has(bareKey(key).split('.')[0]) && deps.isBoundaryLocked?.()) {
    throw new BoundaryLockedError(`changing the boundary setting "${key}"`);
  }
}

export async function runConfigSet(opts, deps) {
  const { key, value } = opts;
  refuseIfLocked(key, deps);
  const profile = deps.resolveProfile(opts.profile);
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });
  const v = coerce(value);
  const kp = keyPath(profile, key, config);
  const next = setPath(config, kp, v);
  const unknownKey = !KNOWN_KEYS.has(bareKey(key)) || undefined;
  deps.ensureDir(dirname(path));
  writeJson(path, next, { writeFile: deps.writeFile, mode: 0o600 });
  return { key, value: v, ...(unknownKey ? { unknownKey: true } : {}), config: next };
}

export async function runConfigGet(opts, deps) {
  const { key } = opts;
  const profile = deps.resolveProfile(opts.profile);
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });
  if (profile.name === '(default)') {
    if (key) {
      return { key, value: getPath(config, keyPath(profile, key, config)) };
    }
    return { config };
  }
  // Profile mode
  if (key) {
    return { key, value: getPath(config, keyPath(profile, key, config)) };
  }
  return { profile: profile.name, config: getPath(config, `profiles.${profile.name}`) ?? {} };
}

export async function runConfigUnset(opts, deps) {
  const { key } = opts;
  refuseIfLocked(key, deps);
  const profile = deps.resolveProfile(opts.profile);
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });
  const kp = keyPath(profile, key, config);
  const next = unsetPath(config, kp);
  deps.ensureDir(dirname(path));
  writeJson(path, next, { writeFile: deps.writeFile, mode: 0o600 });
  return { key, action: 'unset', config: next };
}
