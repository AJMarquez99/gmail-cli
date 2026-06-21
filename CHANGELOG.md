# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-06-21

The capability + organize-and-draft release. gmail-cli graduates to 1.0.0: per-profile
least-privilege scoping, a full compose/organize command surface, and a local rules engine — all
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

### Security
- Least-privilege profiles (e.g. a business profile scoped to `read`+`organize`+`draft`, never
  `send`): the allowlist is enforced only at the transmission boundary, so such a profile can draft
  outreach for review but cannot transmit. Rules can `trash` (recoverable) but never permanently
  delete.

[1.0.0]: https://github.com/AJMarquez99/gmail-cli/releases/tag/v1.0.0
