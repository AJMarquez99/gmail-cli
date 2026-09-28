/**
 * Is the human-owned boundary locked? A locked boundary refuses every agent-reachable action
 * that could widen or disable the boundary (allowlist edits, boundary config changes, login,
 * profile/capability changes, and per-send bypasses). Resolved from the env var first, then
 * config.locked (strict boolean). Never widened by an agent.
 */
export function isBoundaryLocked({ env = process.env, config = {} } = {}) {
  if (env.GMAIL_CLI_LOCKED === '1' || env.GMAIL_CLI_LOCKED === 'true') return true;
  return config?.locked === true;
}
