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

### `gmail: command not found` after install?

A global npm install drops the `gmail` executable into npm's global bin directory — it does **not**
edit your shell config. If that directory isn't on your `PATH`, the command won't be found. Print
the directory and confirm it's on your `PATH`:

```bash
npm prefix -g          # global install root; the bin dir is <that>/bin
echo "$PATH" | tr ':' '\n' | grep "$(npm prefix -g)/bin" || echo "not on PATH"
```

If it's missing, add it to your shell config (`~/.zshrc`, `~/.bashrc`, etc.) and restart your shell:

```bash
export PATH="$(npm prefix -g)/bin:$PATH"
```

Most Node setups (official installer, Homebrew, nvm, fnm, volta) already put this directory on
`PATH`, so this is only needed for non-standard installs.

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

## Permissions & capabilities

Each profile can be scoped to a least-privilege set of **capabilities** — so you can attach, say, a
business email that may *read, organize, and draft* but can **never send**. Scoping is fail-closed
and layered on top of the recipient allowlist.

### The five buckets

| Bucket | Grants |
|---|---|
| `read` | `read list/search/show/thread/count/download`, `label list` |
| `organize` | `label add/remove`, `label create/delete/rename`, `mark` (read/star/important), `archive`, `move`, `rules apply` |
| `draft` | `draft create`, `draft delete`, `reply --draft` |
| `send` | `send`, `reply`, `forward`, `draft send` |
| `delete` | `trash`, `delete` |

Always-allowed (never gated): `init`, `login`, `doctor`, `config`, `profile`, `allow`, `whoami`,
`log`, and `rules add/list/remove/export-xml` (defining or exporting rules never touches the mailbox
— only `rules apply` does).

### Allowlist vs denylist (pick one)

Configure a profile with **either** an allowlist or a denylist — never both:

```jsonc
// allowlist (recommended): only the listed buckets are granted, fail-closed on growth
"business": { "capabilities": ["read", "organize", "draft"] }

// denylist: everything except the listed buckets
"vendor":   { "deny": ["send", "delete"] }
```

- **Absent both keys → unrestricted** (full back-compat; existing and legacy single-account configs
  are unaffected, no migration needed).
- **Both keys present → config error** (exit `2`).
- An unknown bucket name → config error (exit `2`).

### Managing & inspecting

```bash
# Set a profile's scope (writes config.json; validates buckets)
gmail profile caps business --allow read,organize,draft
gmail profile caps vendor --deny send,delete
# Show the current effective scope
gmail profile caps business

# Show the resolved profile, account, mode, and granted buckets
gmail whoami

# doctor also prints each profile's capabilities alongside SMTP/IMAP/allowlist checks
gmail doctor
```

A command whose bucket the active profile lacks is rejected **before it runs** with exit code `4`
(CAPABILITY_DENIED) — distinct from `3` (recipient blocked by the allowlist), so agents can branch on
which boundary stopped them.

### The transmission boundary

The allowlist is enforced **only at the moment of transmission** (`send`, `draft send`, a real
`reply`/`forward`) — never on draft creation or `reply --draft`. So a `send`-denied,
`draft`-capable profile can compose and stage outreach for human review but physically cannot
transmit it.

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

## Compose: draft, reply, forward

### Drafts

```bash
# Create a draft (same flags as `gmail send`): saved to [Gmail]/Drafts. No allowlist check —
# nothing is transmitted, so a send-denied profile can still draft.
gmail draft create --to alice@example.com --subject "Proposal" --body "Draft for review"

# Send a stored draft by UID: enforces the allowlist, transmits, then deletes the draft and logs it.
gmail draft send 42

# Discard a draft by UID
gmail draft delete 42
```

> There is no `draft list`/`draft show` — use `gmail read list --mailbox '[Gmail]/Drafts'` and
> `gmail read show <uid> --mailbox '[Gmail]/Drafts'`.

**Notes:** `draft send` transmits to the recipients stored in the draft **at create time** (editing
the draft elsewhere is honored; the allowlist is checked against those stored recipients on send). A
`Bcc` saved into a draft is not visible in Gmail's draft UI but **is** sent when the draft is sent.

### Reply

```bash
# Threaded reply by UID (sets In-Reply-To/References, derives the Re: subject and recipient).
# Quotes the original by default. Body via flag or stdin.
gmail reply 17 --body "Sounds good — shipping today."

# Reply-all (cc all original recipients minus yourself)
gmail reply 17 --all --body "Looping everyone in."

# Stage the reply as a draft instead of sending (capability: draft, not send)
gmail reply 17 --draft --body "Hold for review"

# Suppress the quoted original
gmail reply 17 --no-quote --body "..."
```

`reply` is `send` by default and `draft` with `--draft` (a dynamic capability). Other flags:
`--html`, `--markdown`/`--no-style`, `--from-name`, `--no-signature`, `--attach`, `--no-allowlist`,
`--no-log`, `--mailbox` (source mailbox, default `INBOX`).

### Forward

```bash
# Forward a message, re-attaching the original attachments; --to is required.
gmail forward 17 --to bob@example.com --body "FYI — see below."
```

Flags: `--to` (repeatable/comma-separated), `--body` (optional intro), `--markdown`/`--no-style`,
`--from-name`, `--no-signature`, `--no-allowlist`, `--no-log`, `--mailbox`.

## Organize

```bash
# Archive (remove from inbox; keeps the message in All Mail)
gmail archive 17

# Move to another mailbox/label
gmail move 17 "Saved"

# Star / important toggles (alongside --read/--unread)
gmail mark 17 --star          # or --unstar
gmail mark 17 --important     # or --unimportant

# Label taxonomy management
gmail label create "Outreach/Acme"
gmail label rename "Outreach/Acme" "Clients/Acme"
gmail label delete "Clients/Acme"

# Counts + attachment download
gmail read count --mailbox INBOX
gmail read download 17 --dir ./attachments

# Trash (recoverable) vs permanent delete
gmail trash 17
gmail delete 17 --permanent    # refuses without --permanent; points you to `trash`
```

`mark` requires exactly one action flag. `archive`/`move`/`mark`/`label create|delete|rename` need
the `organize` capability; `trash`/`delete` need `delete`; `read count`/`read download` need `read`. **Permanent `delete` always requires
`--permanent`** on top of the `delete` capability — there is no interactive confirmation (it would
not fit the JSON/agentic model), so `--permanent` is the explicit intent guard.

## Commands

| Command | Description |
|---|---|
| `gmail init` | Scaffold `~/.config/gmail-cli/` (allowlist.json + config.json) and print setup steps. |
| `gmail login` | Guided credential setup — prompts for email and App Password (hidden), writes credentials.json at chmod 600. |
| `gmail send` | Send an email (text/HTML/Markdown, to/cc/bcc, attachments, threading, dry-run). Enforces the allowlist. |
| `gmail draft create` | Save a new draft to Drafts (same flags as `send`; no allowlist — nothing is sent). |
| `gmail draft send <uid>` | Send a stored draft (enforces the allowlist), then delete it. |
| `gmail draft delete <uid>` | Discard a draft by UID. |
| `gmail reply <uid>` | Threaded reply (`--all`, `--no-quote`, `--draft`). Enforces the allowlist on send. |
| `gmail forward <uid> --to <addr>` | Forward a message, re-attaching original attachments. |
| `gmail doctor` | Check credentials, verify Gmail SMTP and IMAP connections, report allowlist size. |
| `gmail read list` | List recent messages (newest first). Options: `--mailbox`, `--limit`, `--unread`. |
| `gmail read search <query>` | Search with a Gmail query string (same syntax as the Gmail search box). Options: `--mailbox`, `--limit`. |
| `gmail read show <uid\|message-id>` | Show a full message by UID or Message-ID. Options: `--mailbox`. (HTML body is in the `html` field of `--format json` output.) |
| `gmail read thread <thread-id>` | Show all messages in a thread (oldest first). Options: `--mailbox`. |
| `gmail read count` | Count total + unread messages in a mailbox. Options: `--mailbox`. |
| `gmail read download <target>` | Download a message's attachments to a directory. Options: `--mailbox`, `--dir`. |
| `gmail archive <uid>` | Archive a message (remove it from the inbox). Options: `--mailbox`. |
| `gmail move <uid> <destination>` | Move a message to another mailbox/label. Options: `--mailbox`. |
| `gmail trash <uid>` | Move a message to Trash (recoverable). Options: `--mailbox`. |
| `gmail delete <uid> --permanent` | Permanently delete a message (requires `--permanent`). Options: `--mailbox`. |
| `gmail label list` | List all labels/folders on the account. |
| `gmail label add <uid> <name>` | Add a label to a message by UID. Options: `--mailbox`. |
| `gmail label remove <uid> <name>` | Remove a label from a message by UID. Options: `--mailbox`. |
| `gmail label create <name>` | Create a new label. |
| `gmail label delete <name>` | Delete a label. |
| `gmail label rename <name> <newName>` | Rename a label. |
| `gmail mark <uid> --read\|--unread\|--star\|--unstar\|--important\|--unimportant` | Mark a message. Options: `--mailbox`. Exactly one action flag is required. |
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
| `gmail profile caps <name>` | Show or set a profile's capability scope (`--allow b,b` or `--deny b,b`). |
| `gmail whoami` | Show the resolved profile, account, capability mode, and granted buckets. |

Exit codes: `0` ok · `1` send/network/IMAP failure · `2` user-fixable config (missing creds, bad input, conflicting/unknown capability config) · `3` recipient blocked by allowlist · `4` capability denied (command's bucket not granted to the profile).

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
| `GMAIL_RULES` | Path to the rules JSON (default: `~/.config/gmail-cli/rules.json`; per-profile: `rules-{name}.json`) |

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

## MCP server

gmail-cli ships a stdio Model Context Protocol server — the portable counterpart to the CLI, so
MCP-aware clients (Claude Code, Claude Desktop) can drive Gmail as structured tools without shell
invocations.

### Install

`npm install -g .` installs **both** the `gmail` CLI and the `gmail-mcp` MCP server binary.

### Register with Claude Code

```bash
claude mcp add gmail -- gmail-mcp
```

The server reads the same `~/.config/gmail-cli/` credentials, config, and allowlist files as the
CLI (including profiles via the optional `profile` argument). No extra setup needed.

### Tools

The MCP surface is the **operational verbs only** — `send`, mailbox reads, label/mark triage, and
read-only diagnostics:

| Tool | Description |
|---|---|
| `gmail_send` | Send an email. Gated by the fail-closed allowlist; supports `dry_run`. |
| `gmail_read_list` | List recent messages from a mailbox. |
| `gmail_read_search` | Search messages with a Gmail query string. |
| `gmail_read_show` | Show a single message by UID or Message-ID. |
| `gmail_read_thread` | Show all messages in a thread. |
| `gmail_label_list` / `gmail_label_add` / `gmail_label_remove` | List labels; add/remove a label on a message. |
| `gmail_mark` | Mark a message read/unread. |
| `gmail_allow_list` | Show the recipient allowlist (read-only). |
| `gmail_log` | Show recent sent-mail log entries (metadata). |
| `gmail_doctor` | Verify credentials over SMTP + IMAP; report allowlist + enforcement. |

### Safety

Every tool delegates directly to the same `run*(opts, deps)` command functions used by the CLI, so
the fail-closed recipient allowlist, dry-run, and send log all apply unchanged. A blocked recipient
returns an MCP error result (`isError: true`) rather than crashing the server — proven end-to-end: a
`gmail_send` to a non-allowlisted address is rejected **before** any SMTP call.

By design, the MCP surface **cannot move its own safety boundary or touch secrets**: there is no
`gmail_login`/`gmail_init`, no `gmail_allow_add`/`remove`, no `gmail_config_*`, and `gmail_send`
exposes **no** `no_allowlist` (bypass) or `no_log` (accountability) argument. Widening the allowlist
or disabling enforcement remains a deliberate human edit to the config files. See the umbrella
`.ai/guidelines/safety-spec.md` §5.8 for the full rationale.

## Related tools

gmail-cli is one of a small family of personal, fail-closed CLIs built for AI coding agents — each a
focused wrapper around a single service, in the spirit of [`gh`](https://cli.github.com):

- **[dot-ai](https://github.com/AJMarquez99/dot-ai)** — the agent-agnostic `.ai/` project-intelligence
  convention these tools are documented with.

## Develop

```bash
npm run test:run   # run tests once
npm test           # vitest watch mode
```

Architecture: ESM, `commander`, dependency-injected command handlers (`src/commands/*.js`)
for testability, JSON-default output. Credentials never get committed (`.gitignore` + creds
live in `~/.config`).
