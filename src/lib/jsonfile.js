import { readFileSync, writeFileSync } from 'node:fs';
import { MalformedConfigError } from './errors.js';

/**
 * Read and parse a JSON file — the single JSON-parsing choke point for all config-style files
 * (config.json, allowlist.json, credentials.json). A missing OR empty file yields the
 * `onMissing()` result (default `{}`); a present-but-unparseable file throws MalformedConfigError
 * (exit 2) rather than leaking a raw SyntaxError (which would surface at exit 1). Non-ENOENT read
 * errors (e.g. EACCES) propagate unchanged.
 * @param {string} path
 * @param {{ readFile?: Function, onMissing?: () => any }} [opts]
 * @returns {any}
 */
export function readJson(path, { readFile = readFileSync, onMissing } = {}) {
  const missing = () => (onMissing ? onMissing() : {});
  let raw;
  try {
    raw = readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return missing();
    throw err;
  }
  if (!raw.trim()) return missing(); // empty/whitespace file → treat as missing
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new MalformedConfigError(path, err.message);
  }
}

/**
 * Write an object to a JSON file as pretty-printed JSON with a trailing newline.
 * @param {string} path
 * @param {object} obj
 * @param {{ writeFile?: Function, mode?: number }} [opts]
 */
export function writeJson(path, obj, { writeFile = writeFileSync, mode } = {}) {
  writeFile(path, JSON.stringify(obj, null, 2) + '\n', mode);
}

/**
 * Read a value at a dotted path from an object.
 * @param {object} obj
 * @param {string} dotted  e.g. 'a.b.c'
 * @returns {*}
 */
export function getPath(obj, dotted) {
  const keys = dotted.split('.');
  let cur = obj;
  for (const key of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[key];
  }
  return cur;
}

/**
 * Return a new object with the value set at the dotted path (non-mutating).
 * Creates intermediate objects as needed.
 * @param {object} obj
 * @param {string} dotted
 * @param {*} value
 * @returns {object}
 */
export function setPath(obj, dotted, value) {
  const keys = dotted.split('.');

  function recurse(current, remainingKeys) {
    const [head, ...tail] = remainingKeys;
    if (tail.length === 0) {
      return { ...current, [head]: value };
    }
    const nested = current != null && typeof current === 'object' ? current[head] : undefined;
    return {
      ...current,
      [head]: recurse(nested ?? {}, tail),
    };
  }

  return recurse(obj, keys);
}

/**
 * Return a new object with the leaf at the dotted path removed (non-mutating).
 * @param {object} obj
 * @param {string} dotted
 * @returns {object}
 */
export function unsetPath(obj, dotted) {
  const keys = dotted.split('.');

  function recurse(current, remainingKeys) {
    if (current == null || typeof current !== 'object') return current;
    const [head, ...tail] = remainingKeys;
    if (tail.length === 0) {
      const clone = { ...current };
      delete clone[head];
      return clone;
    }
    return {
      ...current,
      [head]: recurse(current[head], tail),
    };
  }

  return recurse(obj, keys);
}

/**
 * Coerce a string value: 'true' → true, 'false' → false, else the string itself.
 * @param {string} str
 * @returns {boolean|string}
 */
export function coerce(str) {
  if (str === 'true') return true;
  if (str === 'false') return false;
  return str;
}
