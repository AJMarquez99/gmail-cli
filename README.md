# gmail-cli

[![npm version](https://img.shields.io/npm/v/@ajmarquez99/gmail-cli)](https://www.npmjs.com/package/@ajmarquez99/gmail-cli)
[![CI](https://github.com/AJMarquez99/gmail-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/AJMarquez99/gmail-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A Gmail CLI with a fail-closed recipient allowlist.

Sends over Gmail SMTP and reads over Gmail IMAP, both using an **App Password** — no OAuth, no
service accounts. `gmail read show` surfaces the Message-ID of any message, which you can pass
directly to `gmail send --in-reply-to` for a full read-and-reply loop from the terminal or an
agent — no external connector needed.

## Install

**Global (recommended)**
```bash
npm install -g @ajmarquez99/gmail-cli
gmail --version
```

**No install (npx)**
```bash
npx @ajmarquez99/gmail-cli send --to alice@example.com --subject "Hi" --body "Hello."
```

**One-liner installer**
```bash
curl -fsSL https://raw.githubusercontent.com/AJMarquez99/gmail-cli/main/install.sh | sh
```

**From source**
```bash
git clone https://github.com/AJMarquez99/gmail-cli
cd gmail-cli
npm install
npm install -g .
```

> **Requires Node.js ≥ 20.**

## Quickstart

All setup steps are now command-driven — no hand-editing JSON required (though hand-editing the
JSON files still works if you prefer).

1. **Set up credentials** — prompts for your Gmail address and App Password (hidden):

   ```bash
   gmail login
   ```

   This writes `~/.config/gmail-cli/credentials.json` at `chmod 600`.
   See [Security notes](#security-notes) for guidance on App Passwords.

   Optional flags: `--user you@gmail.com` (skip the email prompt); `--force` to overwrite existing
   credentials.

2. **Add an allowed recipient** (with an optional short alias):

   ```bash
   gmail allow add alice@example.com --alias alice
   ```

3. **Set non-secret preferences** (optional):

   ```bash
   gmail config set fromName "Your Name"
   ```

4. **Verify and send** (doctor now checks both SMTP and IMAP):

   ```bash
   gmail doctor
   gmail send --to alice --subject "Hello" --body "Hi there."
   gmail read list        # list inbox once IMAP is enabled on the account
   ```

> **Getting an App Password:** requires 2FA on the account.
> Visit <https://myaccount.google.com/apppasswords> — pick "Mail" / "Other";
> you get a 16-character code shown as `xxxx xxxx xxxx xxxx`.

**Multiple accounts (optional):** see [Profiles](#profiles) to manage more than one Gmail account
from the same CLI. The single-account setup above keeps working unchanged — profiles are opt-in.

## Reading mail (IMAP)

### Prerequisite

IMAP must be enabled on each Gmail account before any `read`, `label`, or `mark` command will
work. In Gmail, go to **Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP**.
The same App Password you set up for sending works for IMAP too — no second credential needed.
`gmail doctor` checks both the SMTP and IMAP connections and reports the result for each.

### Commands

```bash
# List the 20 most-recent messages in INBOX (newest first)
gmail read list

# Limit to 10, or only unread messages
gmail read list --limit 10
gmail read list --unread

# List from a different mailbox/label
gmail read list --mailbox "[Gmail]/Sent Mail"

# Search with Gmail's query syntax — same queries as the Gmail search box
gmail read search "from:alice@example.com has:attachment"
gmail read search "newer_than:7d is:unread" --limit 50
gmail read search "subject:invoice" --mailbox "[Gmail]/All Mail"

# Show a full message by UID (from `read list` output) or by Message-ID.
# Table output prints the plain-text body; the HTML body (when present) is always
# available via --format json (the `html` field).
gmail read show 1234
gmail read show "<abc123@mail.gmail.com>"
gmail read show 1234 --format json

# Show all messages in a thread (oldest first; defaults to [Gmail]/All Mail)
gmail read thread <thread-id>
gmail read thread <thread-id> --mailbox INBOX

# List all labels/folders on the account
gmail label list

# Add or remove a label on a message (identified by UID)
gmail label add 1234 Work
gmail label remove 1234 Work
# label add/remove default to INBOX; override with --mailbox if the message is elsewhere
gmail label add 1234 Archived --mailbox "[Gmail]/All Mail"

# Mark a message as read or unread
gmail mark 1234 --read
gmail mark 1234 --unread
# Override the mailbox if the message is not in INBOX
gmail mark 1234 --read --mailbox "[Gmail]/Sent Mail"
```

### Read-and-reply loop

`read show` returns the `messageId` field (the RFC 822 Message-ID), which you can feed straight
into `gmail send --in-reply-to` to thread a reply:

```bash
# Get the Message-ID of the message you want to reply to
gmail read show 1234 --format json | grep messageId

# Thread a reply
gmail send --to sender@example.com \
  --subject "Re: Original subject" \
  --body "Got it, thanks." \
  --in-reply-to "<abc123@mail.gmail.com>"
```

### Privacy note

Read content is displayed in the terminal but is **never written to the send log** — the log
remains send-only. HTML bodies are fetched but kept in memory only; nothing is persisted to disk.

### Profile awareness

All read commands (`read`, `label`, `mark`) are profile-aware: use `--profile <name>` or set
`GMAIL_PROFILE` to select an account. Per-profile IMAP host/port overrides can be set in
`config.json` under `profiles.<name>.imap`:

```json
{
  "profiles": {
    "work": {
      "imap": {
        "host": "imap.example.com",
        "port": 993
      }
    }
  }
}
```

## Profiles

Profiles let you use multiple Gmail accounts from the same CLI. Each profile owns its own
credentials, allowlist, send log, and identity settings. **Without any profiles configured,
the single-account setup works exactly as before — profiles are purely opt-in.**

### What each profile owns

| Resource | Single-account path | Profile path |
|---|---|---|
| Credentials | `credentials.json` | `credentials-<name>.json` |
| Allowlist | `allowlist.json` | `allowlist-<name>.json` |
| Send log | `sent.jsonl` | `sent-<name>.jsonl` |
| Identity (fromName, replyTo, signature) | top-level config keys | `profiles.<name>.*` |
| Allowlist enforcement | `allowlist.enforce` | `profiles.<name>.allowlist.enforce` |

File paths can be overridden per-profile via `gmail config set` (dotted keys such as
`profiles.work.credentialsPath ~/secrets/work-creds.json`).

### Profile resolution

When a command runs, the profile is selected by the first match in this ladder:

1. `--profile <name>` flag
2. `GMAIL_PROFILE` environment variable
3. `config.defaultProfile` (set by `gmail profile use <name>`)
4. Auto-select if exactly one profile is configured
5. Legacy single-account mode (no profiles key in config)
6. Error — multiple profiles configured and none selected: pass `--profile <name>` or set a default

### `gmail profile` commands

| Command | Description |
|---|---|
| `gmail profile add <name>` | Register a new profile. The first profile added automatically becomes the default. |
| `gmail profile list` | List all profiles, marking the default. |
| `gmail profile use <name>` | Set a profile as the default. |
| `gmail profile remove <name>` | Unregister a profile from config. Its credential/allowlist/log files are left on disk. |

### Per-account setup flow

```bash
# 1. Register the profile (first one added becomes the default)
gmail profile add work

# 2. Set up credentials for that profile
gmail login --profile work

# 3. Add allowed recipients
gmail allow add colleague@example.com --alias colleague --profile work

# 4. Set identity preferences
gmail config set fromName "Work Name" --profile work

# 5. Send
gmail send --to colleague --subject "Hi" --body "Hello." --profile work
```

The `--profile` flag (or `GMAIL_PROFILE` env var) works on every command: `send`, `doctor`,
`login`, `allow`, `log`, `config`, and `profile` subcommands.

### Multi-account example

```bash
gmail profile add personal          # first → default
gmail profile add work              # default unchanged (still personal)

gmail login --profile personal      # stores credentials-personal.json
gmail login --profile work          # stores credentials-work.json

gmail profile use work              # switch default to work
gmail doctor                        # checks work (the new default)
gmail doctor --profile personal     # checks personal explicitly

gmail send --to colleague --subject "Hi" --body "Hello." --profile work
GMAIL_PROFILE=personal gmail send --to friend --subject "Hey" --body "Hi."
```

## Fail-closed allowlist

> **`gmail send` only delivers to addresses on the allowlist (plus the configured account itself).
> With no or empty allowlist, the first send to anyone other than yourself fails immediately
> with exit code `3`. This is intentional — populate the allowlist before sending to others.**

Use `gmail allow add` / `gmail allow remove` to manage it from the CLI, or edit
`~/.config/gmail-cli/allowlist.json` directly (override path with `GMAIL_ALLOWLIST`):

```json
{
  "recipients": [
    { "email": "alice@example.com", "aliases": ["alice", "a"] },
    { "email": "bob@example.com" },
    { "email": "team@example.com" }
  ]
}
```

- `aliases` are optional. Address by alias and it expands to the real email:
  `gmail send --to alice …` sends to `alice@example.com`.
- Enforcement covers `--to`, `--cc`, and `--bcc`. If **any** recipient is not permitted, the
  whole send is rejected (nothing is sent) and the command exits `3`.
- `--dry-run` reports would-be-blocked recipients without throwing — useful for pre-flight checks.
- Matching is case-insensitive.
- `gmail allow list` shows the current entries; `gmail doctor` reports the count and enforcement status.

### Disabling enforcement ("let the agent run free")

Enforcement can be turned off to allow sending to any recipient without maintaining the allowlist. **Default is always ON (fail-closed).** Aliases still expand when enforcement is off — only the block is lifted.

**Per-send (flag):**
```bash
gmail send --to anyone@example.com --subject "Hi" --body "Hello." --no-allowlist
```

A stderr warning is emitted on every real send with enforcement off:
```
warn: allowlist enforcement disabled — sending to any recipient (re-enable via config allowlist.enforce or drop --no-allowlist).
```

**Persistent (config):**
```bash
gmail config set allowlist.enforce false
```

The `--no-allowlist` flag overrides the config for a single send regardless of what the config says. To re-enable, run `gmail config set allowlist.enforce true` (or `gmail config unset allowlist.enforce`) and drop `--no-allowlist`.

## Usage

Output is JSON by default; add `--format table` for a human-readable summary.

```bash
# Verify credentials + SMTP connection
gmail doctor

# Send plain text
gmail send --to alice@example.com --subject "Report" --body "All green."

# Multiple recipients (repeat the flag or comma-separate), cc/bcc, reply-to
gmail send --to alice@example.com --to "bob@example.com,team@example.com" \
  --cc manager@example.com \
  --subject "Update" --body "Done." --reply-to you@gmail.com

# Send HTML explicitly
gmail send --to alice@example.com --subject "Hi" --html "<b>Hello.</b>"

# Render body as Markdown → HTML (with inline email styles), plain-text fallback auto-generated
gmail send --to alice@example.com --subject "Report" --body "# Report\n\nAll green." --markdown

# Markdown without the inline styler (raw marked HTML)
gmail send --to alice@example.com --subject "Report" --body "# Report" --markdown --no-style

# Pipe the body in (handy for agents / long content); --markdown works with piped input too
generate-report | gmail send --to team@example.com --subject "Nightly report" --markdown

# Attach files (repeatable; comma-separated ok; hard limit 25MB total, warning at 20MB)
gmail send --to alice@example.com --subject "Invoice" --body "See attached." \
  --attach ~/docs/invoice.pdf --attach ~/docs/receipt.pdf

# Thread a reply (sets In-Reply-To and References)
gmail send --to alice@example.com --subject "Re: Question" --body "Sure!" \
  --in-reply-to "<abc123@mail.gmail.com>"

# Set a display name on the From header
gmail send --to alice@example.com --subject "Hi" --body "Hello." \
  --from-name "Your Name"

# Dry-run: assemble and preview without sending or logging; denied recipients are reported, not blocked
gmail send --to alice@example.com --subject "Test" --body "Hello." --dry-run

# Suppress the configured signature for this send
gmail send --to alice@example.com --subject "Quick note" --body "Short one." --no-signature

# Skip logging this send
gmail send --to alice@example.com --subject "Quiet" --body "Shh." --no-log

# Include the body in the log entry for this send
gmail send --to alice@example.com --subject "Report" --body "Details." --log-body

# View recent sent mail (newest first, default 20)
gmail log
gmail sent --limit 5
```

## Commands

| Command | Description |
|---|---|
| `gmail init` | Scaffold `~/.config/gmail-cli/` (allowlist.json + config.json) and print setup steps. |
| `gmail login` | Guided credential setup — prompts for email and App Password (hidden), writes credentials.json at chmod 600. |
| `gmail send` | Send an email (text/HTML/Markdown, to/cc/bcc, attachments, threading, dry-run). Enforces the allowlist. |
| `gmail doctor` | Check credentials, verify Gmail SMTP and IMAP connections, report allowlist size. |
| `gmail read list` | List recent messages (newest first). Options: `--mailbox`, `--limit`, `--unread`. |
| `gmail read search <query>` | Search with a Gmail query string (same syntax as the Gmail search box). Options: `--mailbox`, `--limit`. |
| `gmail read show <uid\|message-id>` | Show a full message by UID or Message-ID. Options: `--mailbox`. (HTML body is in the `html` field of `--format json` output.) |
| `gmail read thread <thread-id>` | Show all messages in a thread (oldest first). Options: `--mailbox`. |
| `gmail label list` | List all labels/folders on the account. |
| `gmail label add <uid> <name>` | Add a label to a message by UID. Options: `--mailbox`. |
| `gmail label remove <uid> <name>` | Remove a label from a message by UID. Options: `--mailbox`. |
| `gmail mark <uid> --read\|--unread` | Mark a message as read or unread. Options: `--mailbox`. Exactly one of `--read` or `--unread` is required. |
| `gmail allow list` | List allowed recipients and their aliases (read-only). |
| `gmail allow add <email>` | Add a recipient to the allowlist (idempotent; merges aliases if entry already exists). |
| `gmail allow remove <email\|alias>` | Remove a recipient by email address or alias. |
| `gmail config set <key> <value>` | Set a config preference (dotted key; `true`/`false` coerced to boolean). |
| `gmail config get [key]` | Show one config key, or the whole config if no key is given. |
| `gmail config unset <key>` | Remove a config key. |
| `gmail log` | Show recent sent-mail log entries, newest first (alias: `gmail sent`). |
| `gmail profile add <name>` | Register a new profile (first one added becomes the default). |
| `gmail profile list` | List all profiles, marking the default. |
| `gmail profile use <name>` | Set a profile as the default. |
| `gmail profile remove <name>` | Unregister a profile from config (files left on disk). |

Exit codes: `0` ok · `1` send/network failure · `2` user-fixable config (missing creds, no recipients, bad attachment) · `3` recipient blocked by allowlist.

`--dry-run` always exits `0` (even if recipients would be blocked — denials are reported in the output, not the exit code).

## `gmail login` options reference

| Flag | Description |
|---|---|
| `--user <email>` | Gmail address — skips the interactive email prompt |
| `--force` | Overwrite existing credentials without error |

**Security:** the App Password prompt has echo off — the password is never echoed to the terminal,
never written to logs, and never passed as a CLI flag. It flows directly from the prompt to
`credentials.json`. Verify the setup afterward with `gmail doctor`.

## `gmail allow` commands reference

| Command | Description |
|---|---|
| `gmail allow add <email> [--alias <name>]` | Add a recipient. `--alias` is repeatable. If the email already exists, new aliases are merged in; duplicate aliases are silently skipped. An alias that already maps to a **different** email is refused. |
| `gmail allow remove <email\|alias>` | Remove the entry whose email or alias matches the target (case-insensitive). Exits `2` if not found. |
| `gmail allow list` | Read-only view of all entries. |

## `gmail config` commands reference

| Command | Description |
|---|---|
| `gmail config set <key> <value>` | Write a value. Dotted keys (`signature.text`) create/update nested objects. `true`/`false` strings are coerced to booleans. Unknown keys are written with a warning. |
| `gmail config get [key]` | Print a single key's value, or the whole config if `[key]` is omitted. |
| `gmail config unset <key>` | Delete a key (and its subtree if dotted). |

### Known config keys

| Key | Effect | Override flag |
|---|---|---|
| `fromName` | Display name on the `From` header | `--from-name` |
| `replyTo` | Default `Reply-To` address | `--reply-to` |
| `signature.text` | Plain-text signature appended after a blank line | `--no-signature` |
| `signature.html` | HTML signature appended after a blank line | `--no-signature` |
| `sendLog.enabled` | `false` disables the send log globally | `--no-log` (per-send) |
| `sendLog.logBody` | `true` includes body text in every log entry | `--log-body` (per-send) |
| `allowlist.enforce` | `false` disables allowlist enforcement globally (default: `true`) | `--no-allowlist` (per-send) |

## `gmail send` options reference

| Flag | Description |
|---|---|
| `--to <addr>` | Recipient (repeatable; comma-separated ok) |
| `--cc <addr>` | CC recipient (repeatable) |
| `--bcc <addr>` | BCC recipient (repeatable) |
| `--subject <text>` | Subject line |
| `--body <text>` | Plain-text body (or pipe it on stdin) |
| `--html <html>` | HTML body (mutually exclusive with `--markdown`) |
| `--markdown` | Render `--body` (or stdin) as Markdown → HTML with inline email styles; plain-text fallback is the raw Markdown |
| `--no-style` | With `--markdown`: skip the inline email styler (raw `marked` HTML output) |
| `--attach <path>` | File attachment (repeatable; comma-separated ok); hard limit 25MB total, warning at 20MB |
| `--from-name <name>` | Display name on the `From` header (overrides `config.fromName`) |
| `--reply-to <addr>` | `Reply-To` address (overrides `config.replyTo`) |
| `--in-reply-to <messageId>` | `In-Reply-To` header; threads the email in Gmail |
| `--references <id>` | `References` header entry (repeatable; comma-separated ok) |
| `--no-signature` | Do not append the configured signature |
| `--dry-run` | Assemble and preview the message without sending or logging; reports would-be-blocked recipients |
| `--log-body` | Include body text in this send's log entry (overrides `config.sendLog.logBody`) |
| `--no-log` | Do not append this send to the send log |
| `--no-allowlist` | Disable allowlist enforcement for this send — sends to any recipient; aliases still expand |

## Configuration (non-secret preferences)

Optional settings live at `~/.config/gmail-cli/config.json` (override path with
`GMAIL_CLI_SETTINGS`). Missing file is fine — all fields are optional, and CLI flags always
win over config values.

```json
{
  "fromName": "Your Name",
  "replyTo": "you@gmail.com",
  "signature": {
    "text": "--\nYour Name",
    "html": "<p>--<br>Your Name</p>"
  },
  "sendLog": {
    "enabled": true,
    "logBody": false
  },
  "allowlist": {
    "enforce": true
  }
}
```

Use `gmail config set/get/unset` to manage these without hand-editing. Hand-editing the JSON
file directly also works.

## Send log

Every successful send appends a metadata-only JSONL entry to
`~/.config/gmail-cli/sent.jsonl` (override path with `GMAIL_SEND_LOG`). Body text is
excluded by default (use `--log-body` or `config.sendLog.logBody: true` to include it).
Use `--no-log` to skip logging for a single send; set `config.sendLog.enabled: false` to
disable globally.

```bash
gmail log           # show last 20 entries (newest first)
gmail sent          # alias for gmail log
gmail log --limit 5 # show last 5
```

## Credential resolution

1. `GMAIL_USER` + `GMAIL_APP_PASSWORD` env vars (take precedence)
2. `GMAIL_CLI_CONFIG` path, else `~/.config/gmail-cli/credentials.json`

## Environment variables

| Variable | Purpose |
|---|---|
| `GMAIL_USER` | Gmail address (takes precedence over credentials.json) |
| `GMAIL_APP_PASSWORD` | App Password (takes precedence over credentials.json) |
| `GMAIL_CLI_CONFIG` | Path to credentials JSON (default: `~/.config/gmail-cli/credentials.json`) |
| `GMAIL_CLI_SETTINGS` | Path to non-secret config JSON (default: `~/.config/gmail-cli/config.json`) |
| `GMAIL_SEND_LOG` | Path to sent-mail JSONL log (default: `~/.config/gmail-cli/sent.jsonl`) |
| `GMAIL_ALLOWLIST` | Path to allowlist JSON (default: `~/.config/gmail-cli/allowlist.json`) |

## Security notes

- **`gmail login` uses a hidden prompt** — the App Password is never echoed to the terminal,
  never passed as a CLI flag, and never written to logs. It goes directly from the prompt to
  `credentials.json`.
- The App Password is a long-lived secret with SMTP-send access to the account. Keep
  `credentials.json` at `chmod 600` (`gmail login` does this automatically); never commit it.
- Scope is send-only by construction (SMTP). Revoke anytime at
  <https://myaccount.google.com/apppasswords>.
- Outbound recipients are constrained by the fail-closed allowlist (see above), so the blast
  radius of a misused App Password is limited to addresses you've explicitly approved.

## Develop

```bash
npm run test:run   # run tests once
npm test           # vitest watch mode
```

Architecture: ESM, `commander`, dependency-injected command handlers (`src/commands/*.js`)
for testability, JSON-default output. Credentials never get committed (`.gitignore` + creds
live in `~/.config`).
