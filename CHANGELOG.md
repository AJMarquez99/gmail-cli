# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-09-27

The capability + organize-and-draft release. gmail-cli graduates to 1.0.0: per-profile
least-privilege scoping, a full compose/organize command surface, a local rules engine, and a
hardening pass across attachments, boundary locking, recipient fan-out, and file permissions — all
still App-Password-only (no OAuth), JSON-by-default, and fail-closed.

### Added
- **Per-profile capability scoping.** Five grantable buckets — `read`, `organize`, `draft`, `send`,
  `delete` — configured per profile as an allowlist (`capabilities`) or denylist (`deny`). Absent
  both = unrestricted (full back-compat). A central gate denies out-of-scope commands with new exit
  code **`4`**. Manage with `gmail profile caps <name> --allow ...|--deny ...`; inspect with
  `gmail whoami` and `gmail doctor`.
- **Draft family:** `gmail draft create` (IMAP APPEND to Drafts — no allowlist, nothing is sent),
  `gmail draft send <uid>` (enforces the allowlist, transmits, then deletes the draft),
  `gmail draft delete <uid>`.
- **Reply & forward:** `gmail reply <uid>` (threaded; `--all`, `--no-quote`, `--draft`) and
  `gmail forward <uid>` (quoted original + re-attached attachments).
- **Organize:** `gmail archive`, `gmail move <uid> <dest>`, `gmail trash <uid>`,
  `gmail delete <uid> --permanent`; `gmail mark` extended with `--star/--unstar` and
  `--important/--unimportant`; `gmail label create/delete/rename`.
- **Read additions:** `gmail read count`, `gmail read download <target> [--dir]`.
- **Local rules engine:** per-profile `rules-{name}.json`; `gmail rules add/list/remove/apply`
  (apply is gated `organize` + per-action capability checks, supports `--dry-run`/`--rule`/`--limit`,
  idempotent) and `gmail rules export-xml` (importable Gmail filter XML). Rules cannot permanently
  delete.
- New environment variable `GMAIL_RULES` for the rules-file path.

### Changed
- Previously-ungated commands now carry capability tags (e.g. `mark` → `organize`). Unrestricted and
  legacy single-account profiles hold all buckets, so behavior is unchanged with **zero migration**.

### Changed (breaking)
- **Attachments are now confined to `attachRoot`** (default: the current working directory). A path
  that resolves outside it — lexically, via a symlink, or via an `attachRoot` that itself resolves to
  the filesystem root — is refused (exit `2`). If a workflow attaches files from outside the CLI's
  working directory, point it at the right root: `gmail config set attachRoot <dir>`.
- **`maxRecipients` is now enforced**, default `10`, and must be an integer ≥ 1. A `send`/`reply`/
  `forward`/`draft send` whose combined `to`+`cc`+`bcc` exceeds it is refused outright (exit `2`).
  Raise it with `gmail config set maxRecipients <n>` if a workflow routinely addresses more.
- **`--dry-run` is no longer unconditionally exit `0`.** It now fails exactly like a real send on the
  recipient cap (exit `2`) and on a locked-boundary bypass attempt (exit `3`); it still never sends or
  logs anything.
- **Fully-qualified `profiles.<name>.<key>` config keys now require that profile to exist** — a typo
  or unknown profile fails with exit `2` instead of silently double-nesting a broken shape under the
  active profile. `locked` and `defaultProfile` are always global (top-level) keys; a fully-qualified
  `profiles.<name>.locked` / `profiles.<name>.defaultProfile` is rejected.
- **New exit-code meaning:** exit `3` now covers both an allowlist-blocked recipient *and* a
  locked/sealed boundary refusal (previously allowlist-only); exit `4` (capability denied) is a
  deliberate extension past the shared `0`–`3` family. See the README's exit-code table.

### Fixed
- **`gmail archive` (and any rule with `--archive`) was a silent no-op.** Gmail hides the
  currently-selected mailbox's own label, so removing `\Inbox` while INBOX was selected always
  succeeded and archived nothing. Now archives via `MOVE` to `[Gmail]/All Mail` — the documented Gmail
  archive idiom — and verifies the server actually moved the requested UID(s), throwing instead of
  reporting success on a partial or empty move.
- **`gmail move`/`gmail trash` (and the rule `move:`/`trash` actions) reported success without
  checking the server.** They now verify the `MOVE` result the same way `archive` does. A rule with
  both `archive` and `trash` previously reported the message "trashed" while it actually sat in All
  Mail (archive had already moved it out of INBOX, so the trash matched nothing); that trash action
  now lands in the rule's errors instead.
- **IMAP connections could hang indefinitely.** `doctor`, `draft send`, and every `read`/`label`/
  `mark`/`organize` command now route through one connect helper that races each attempt against a
  connect/greeting/socket deadline and retries once on a stalled connection before failing, instead of
  awaiting forever.
- **`draft create --to/--cc/--bcc <alias>` silently dropped the recipient.** Aliases are now expanded
  the same way `send`/`reply`/`forward` expand them (without enforcing the allowlist — drafts never
  transmit); a token that is neither a known alias nor an email address now fails with exit `2` naming
  it, instead of saving a recipient-less draft.
- **`gmail config set/get/unset` double-prefixed profile-qualified keys.** `profiles.<name>.<key>` is
  now honored as an absolute path instead of silently nesting under the active profile and never
  taking effect.
- **Per-profile `imap.*` overrides (host/port/timeouts) were silently dropped.** `resolveProfile()`
  now returns `imap`, so the documented per-profile overrides actually reach `createImapClient`.

### Security
- **Attachment confinement.** Attachments are resolved against a configurable `attachRoot` (default:
  cwd); a path that escapes it — lexically, via a symlink (including a symlink *inside* the root whose
  real target points outside), or via an `attachRoot` that resolves to the filesystem root — is
  refused (exit `2`). Attachment bytes are read in-process rather than handed to nodemailer by path.
- **No implicit file/URL access in the mail composer.** `disableFileAccess`/`disableUrlAccess` are
  forced on both the SMTP transport and the standalone MIME composer used for `draft create`/`reply
  --draft`, closing off `{ path: ... }`/`{ href: ... }` attachment content that could otherwise read
  arbitrary local files or fetch arbitrary URLs at send time.
- **Sealed/locked boundary mode.** `GMAIL_CLI_LOCKED=1` (or `gmail config set locked true`) refuses
  every CLI-reachable action that could widen or disable the boundary itself — allowlist edits,
  boundary config keys, `gmail login`, profile add/remove/caps changes, and any send that tries to
  bypass enforcement — with exit `3`. Fixed a gap where `config set locked true` under an active
  profile wrote `profiles.<name>.locked`, which the lock check never read. See SECURITY.md's "Locked
  boundary mode" section for the explicit limit: it governs only changes made through the CLI itself.
- **Per-profile capability gate applies identically on the CLI and the MCP server.** MCP tool calls
  previously invoked command functions directly, skipping the capability check entirely; both surfaces
  now share one `enforceCapability` choke point.
- **Recipient fan-out cap.** `maxRecipients` (default `10`) caps combined `to`+`cc`+`bcc` for a single
  transmission across `send`/`reply`/`forward`/`draft send`. Validated as an integer ≥ 1 — a
  non-numeric or out-of-range value (including a hand-edited config file) fails closed with a loud
  error instead of silently coercing to "no cap".
- **Header injection guard.** `--from-name` and `--reply-to` reject an embedded CR/LF.
- **File permissions.** `credentials.json`, `config.json`, `allowlist*.json`, `rules-*.json`, and the
  send log are written `chmod 600` (owner read/write only) and **re-tightened to 0600 on every
  write**, including a file that predates this hardening and was left at a looser mode by an older
  version of the tool.
- **Dependency upgrades**, clearing all `npm audit` findings at every severity: `nodemailer` 8→10.0.11,
  `imapflow` 1.x→2.1.0, `mailparser`→3.9.29, `@modelcontextprotocol/sdk`→1.30.1. No CLI-facing API
  changes apply to this codebase's usage of either major (see git history for the compatibility
  review); Node ≥20 remains required.
- **CI audit gates.** `npm audit --audit-level=high` now fails the lint/PR build; the tag-triggered
  publish workflow runs a stricter gate on production dependencies
  (`npm audit --omit=dev --audit-level=moderate`) immediately before `npm publish`, so a vulnerable dependency can no longer ship silently through either path.

[1.0.0]: https://github.com/AJMarquez99/gmail-cli/releases/tag/v1.0.0
