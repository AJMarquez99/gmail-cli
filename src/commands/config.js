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

export async function runConfigSet(opts, deps) {
  const { key, value } = opts;
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });
  const v = coerce(value);
  const next = setPath(config, key, v);
  const unknownKey = !KNOWN_KEYS.has(key) || undefined;
  deps.ensureDir(dirname(path));
  writeJson(path, next, { writeFile: deps.writeFile });
  return { key, value: v, ...(unknownKey ? { unknownKey: true } : {}), config: next };
}

export async function runConfigGet(opts, deps) {
  const { key } = opts;
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });
  if (key) {
    return { key, value: getPath(config, key) };
  }
  return { config };
}

export async function runConfigUnset(opts, deps) {
  const { key } = opts;
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });
  const next = unsetPath(config, key);
  deps.ensureDir(dirname(path));
  writeJson(path, next, { writeFile: deps.writeFile });
  return { key, action: 'unset', config: next };
}
