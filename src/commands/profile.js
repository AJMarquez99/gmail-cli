import { dirname } from 'node:path';
import { resolveSettingsPath } from '../config.js';
import { readJson, writeJson } from '../lib/jsonfile.js';
import { InvalidInputError } from '../lib/errors.js';

/**
 * Register a new named profile. The first profile added automatically becomes the default.
 * Path configuration (credentials, allowlist, sendLog) is implicit/suffixed until overridden
 * via `gmail config` or `gmail login`.
 */
export async function runProfileAdd(opts, deps) {
  const { name } = opts;
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });

  if (config.profiles?.[name] !== undefined) {
    throw new InvalidInputError(`Profile "${name}" already exists.`);
  }

  config.profiles ??= {};
  const wasEmpty = Object.keys(config.profiles).length === 0;
  config.profiles[name] = {};

  const isDefault = wasEmpty;
  if (isDefault) {
    config.defaultProfile = name;
  }

  deps.ensureDir(dirname(path));
  writeJson(path, config, { writeFile: deps.writeFile });

  return { name, default: isDefault, action: 'created' };
}

/**
 * List all configured profiles. Returns single-account mode indicator when none exist.
 */
export async function runProfileList(opts, deps) {
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });

  if (!config.profiles || Object.keys(config.profiles).length === 0) {
    return { mode: 'single-account', profiles: [] };
  }

  return {
    defaultProfile: config.defaultProfile || null,
    profiles: Object.keys(config.profiles).map((n) => ({
      name: n,
      default: n === config.defaultProfile,
    })),
  };
}

/**
 * Set the active default profile.
 */
export async function runProfileUse(opts, deps) {
  const { name } = opts;
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });

  if (!config.profiles?.[name]) {
    throw new InvalidInputError(`Unknown profile "${name}".`);
  }

  config.defaultProfile = name;
  writeJson(path, config, { writeFile: deps.writeFile });

  return { defaultProfile: name, action: 'default-set' };
}

/**
 * Unregister a profile from config. Its files are left on disk (caller must clean them up).
 * If the removed profile was the default, repoints to the sole remaining profile (if exactly
 * one) or clears defaultProfile entirely.
 */
export async function runProfileRemove(opts, deps) {
  const { name } = opts;
  const path = resolveSettingsPath(deps.env);
  const config = readJson(path, { readFile: deps.readFile });

  if (!config.profiles?.[name]) {
    throw new InvalidInputError(`Unknown profile "${name}".`);
  }

  // Capture file paths BEFORE deleting the profile entry.
  const resolved = deps.resolveProfile(name);
  const filesKept = [resolved.credentialsPath, resolved.allowlistPath, resolved.sendLogPath];

  delete config.profiles[name];

  if (config.defaultProfile === name) {
    const remaining = Object.keys(config.profiles);
    if (remaining.length === 1) {
      config.defaultProfile = remaining[0];
    } else {
      delete config.defaultProfile;
    }
  }

  writeJson(path, config, { writeFile: deps.writeFile });

  return {
    name,
    action: 'removed',
    filesKept,
    newDefault: config.defaultProfile || null,
  };
}
