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
