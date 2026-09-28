/**
 * Re-tighten a file's permissions to `mode` after a successful write/append.
 *
 * `writeFileSync`/`appendFileSync`'s `mode` option only applies at file *creation* — an existing
 * file (left at 0644 by an older, pre-hardening version of this CLI, or recreated via
 * `login --force`) is never touched by it. Every writer of a config/allowlist/rules/send-log file
 * calls this after its write/append so upgrading users self-heal to 0600 the next time they touch
 * (or, for `gmail init`, merely re-run against) the file.
 *
 * A chmod failure must never undo an already-successful write: it is swallowed after a single
 * warning via the optional `warn` dep (never thrown, never surfaced as a command failure).
 *
 * @param {string} path
 * @param {number} mode
 * @param {{ chmod?: (path: string, mode: number) => void, warn?: (msg: string) => void }} [opts]
 */
export function tightenMode(path, mode, { chmod, warn } = {}) {
  if (mode == null || !chmod) return;
  try {
    chmod(path, mode);
  } catch (err) {
    warn?.(`could not set ${path} to mode 0${mode.toString(8)}: ${err.message}`);
  }
}
