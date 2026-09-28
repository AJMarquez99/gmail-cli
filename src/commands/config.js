import { dirname } from 'node:path';
import { resolveSettingsPath } from '../config.js';
import { readJson, writeJson, getPath, setPath, unsetPath, coerce } from '../lib/jsonfile.js';
import { InvalidInputError } from '../lib/errors.js';

const KNOWN_KEYS = new Set([
  'fromName',
  'replyTo',
  'signature.text',
  'signature.html',
  'sendLog.enabled',
  'sendLog.logBody',
  'allowlist.enforce',
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

/**
 * Compute the dotted key path to read/write in the config object.
 * A fully-qualified `profiles.<name>.<key>` is an absolute path (the profile must exist);
 * otherwise legacy uses the bare key and profile mode prefixes `profiles.<active>.`.
 */
function keyPath(profile, key, config) {
  if (key.startsWith('profiles.')) {
    const [, name, ...rest] = key.split('.');
    if (!name || rest.length === 0) {
      throw new InvalidInputError(`Key "${key}" must name a setting: profiles.<name>.<key>`);
    }
    if (!config.profiles?.[name]) {
      throw new InvalidInputError(
        `Unknown profile "${name}" — create it with \`gmail profile add ${name}\` first.`,
      );
    }
    return key;
  }
  if (profile.name === '(default)') return key;
  return `profiles.${profile.name}.${key}`;
}

const bareKey = (key) => (key.startsWith('profiles.') ? key.split('.').slice(2).join('.') : key);

export async function runConfigSet(opts, deps) {
  const { key, value } = opts;
  const profile = deps.resolveProfile(opts.profile);
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });
  const v = coerce(value);
  const kp = keyPath(profile, key, config);
  const next = setPath(config, kp, v);
  const unknownKey = !KNOWN_KEYS.has(bareKey(key)) || undefined;
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
  const profile = deps.resolveProfile(opts.profile);
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });
  const kp = keyPath(profile, key, config);
  const next = unsetPath(config, kp);
  deps.ensureDir(dirname(path));
  writeJson(path, next, { writeFile: deps.writeFile });
  return { key, action: 'unset', config: next };
}
