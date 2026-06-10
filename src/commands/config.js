import { dirname } from 'node:path';
import { resolveSettingsPath } from '../config.js';
import { readJson, writeJson, getPath, setPath, unsetPath, coerce } from '../lib/jsonfile.js';

const KNOWN_KEYS = new Set([
  'fromName',
  'replyTo',
  'signature.text',
  'signature.html',
  'sendLog.enabled',
  'sendLog.logBody',
  'allowlist.enforce',
]);

/**
 * Compute the dotted key path to read/write in the config object.
 * Legacy (default profile): use the bare key directly at the top level.
 * Profile mode: prefix with profiles.<name>.
 */
function keyPath(profile, key) {
  if (profile.name === '(default)') return key;
  return `profiles.${profile.name}.${key}`;
}

export async function runConfigSet(opts, deps) {
  const { key, value } = opts;
  const profile = deps.resolveProfile(opts.profile);
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });
  const v = coerce(value);
  const kp = keyPath(profile, key);
  const next = setPath(config, kp, v);
  const unknownKey = !KNOWN_KEYS.has(key) || undefined;
  deps.ensureDir(dirname(path));
  writeJson(path, next, { writeFile: deps.writeFile });
  return { key, value: v, ...(unknownKey ? { unknownKey: true } : {}), config: next };
}

export async function runConfigGet(opts, deps) {
  const { key } = opts;
  const profile = deps.resolveProfile(opts.profile);
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });
  if (profile.name === '(default)') {
    if (key) {
      return { key, value: getPath(config, key) };
    }
    return { config };
  }
  // Profile mode
  if (key) {
    return { key, value: getPath(config, keyPath(profile, key)) };
  }
  return { profile: profile.name, config: getPath(config, `profiles.${profile.name}`) ?? {} };
}

export async function runConfigUnset(opts, deps) {
  const { key } = opts;
  const profile = deps.resolveProfile(opts.profile);
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });
  const kp = keyPath(profile, key);
  const next = unsetPath(config, kp);
  deps.ensureDir(dirname(path));
  writeJson(path, next, { writeFile: deps.writeFile });
  return { key, action: 'unset', config: next };
}
