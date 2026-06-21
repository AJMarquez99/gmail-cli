import { InvalidInputError } from './lib/errors.js';

export const BUCKETS = ['read', 'organize', 'draft', 'send', 'delete'];

export const CAPS = {
  READ: 'read',
  ORGANIZE: 'organize',
  DRAFT: 'draft',
  SEND: 'send',
  DELETE: 'delete',
};

/**
 * Resolve a profile config's capability declaration into an effective allowed set.
 * Absent both keys → unrestricted (all buckets) for back-compat.
 * Both keys → config error. Unknown bucket → config error.
 * @param {object} [profileConfig]
 * @returns {{ mode: 'unrestricted'|'allow'|'deny', allowed: Set<string> }}
 */
export function resolveCapabilities(profileConfig = {}) {
  const hasAllow = Array.isArray(profileConfig.capabilities);
  const hasDeny = Array.isArray(profileConfig.deny);
  if (hasAllow && hasDeny) {
    throw new InvalidInputError(
      'Profile defines both "capabilities" and "deny" — use exactly one (allowlist OR denylist).',
    );
  }
  if (!hasAllow && !hasDeny) {
    return { mode: 'unrestricted', allowed: new Set(BUCKETS) };
  }
  const list = hasAllow ? profileConfig.capabilities : profileConfig.deny;
  const bad = list.filter((b) => !BUCKETS.includes(b));
  if (bad.length) {
    throw new InvalidInputError(
      `Unknown capability bucket(s): ${bad.join(', ')}. Valid: ${BUCKETS.join(', ')}.`,
    );
  }
  if (hasAllow) return { mode: 'allow', allowed: new Set(list) };
  return { mode: 'deny', allowed: new Set(BUCKETS.filter((b) => !list.includes(b))) };
}

/** True when the profile's effective capability set contains the bucket. */
export function profileCan(profile, bucket) {
  return profile?.capabilities?.allowed instanceof Set
    ? profile.capabilities.allowed.has(bucket)
    : false;
}

/**
 * Command-path → required capability. A bucket string, a function (opts)=>bucket for
 * flag-dependent commands, or null for always-allowed. Keys are space-joined command paths
 * matching the commander registration in cli.js (e.g. 'read list'). Later phases ADD their
 * commands here; the coverage-guard test fails if a registered command is missing.
 */
export const COMMAND_CAPABILITY = {
  send: CAPS.SEND,
  'read list': CAPS.READ,
  'read search': CAPS.READ,
  'read show': CAPS.READ,
  'read thread': CAPS.READ,
  'label list': CAPS.READ,
  'label add': CAPS.ORGANIZE,
  'label remove': CAPS.ORGANIZE,
  'label create': CAPS.ORGANIZE,
  'label delete': CAPS.ORGANIZE,
  'label rename': CAPS.ORGANIZE,
  mark: CAPS.ORGANIZE,
  archive: CAPS.ORGANIZE,
  move: CAPS.ORGANIZE,
  trash: CAPS.DELETE,
  delete: CAPS.DELETE,
  'draft create': CAPS.DRAFT,
  'draft delete': CAPS.DRAFT,
  'draft send': CAPS.SEND,
  // always-allowed (local config / diagnostics / introspection):
  doctor: null,
  init: null,
  login: null,
  whoami: null,
  log: null,
  'allow list': null,
  'allow add': null,
  'allow remove': null,
  'config set': null,
  'config get': null,
  'config unset': null,
  'profile add': null,
  'profile list': null,
  'profile use': null,
  'profile remove': null,
  'profile caps': null,
};

/**
 * Resolve the capability a command path requires for the given opts.
 * Returns a bucket string, or null when the command is always-allowed (or unmapped — the
 * coverage-guard test enforces that every registered command is mapped).
 */
export function requiredCapability(commandPath, opts = {}) {
  const cap = COMMAND_CAPABILITY[commandPath];
  if (cap == null) return null;
  return typeof cap === 'function' ? cap(opts) : cap;
}
