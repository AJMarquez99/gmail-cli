# gmail-cli

[![npm version](https://img.shields.io/npm/v/@ajmarquez99/gmail-cli)](https://www.npmjs.com/package/@ajmarquez99/gmail-cli)
[![CI](https://github.com/AJMarquez99/gmail-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/AJMarquez99/gmail-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A send-only Gmail CLI with a fail-closed recipient allowlist.

Sends over Gmail SMTP using an **App Password** — no OAuth, no service accounts. Pairs well with
a read-only setup (e.g. the [claude.ai Gmail connector](https://claude.ai)) for a full
compose-and-send agent loop, but works perfectly standalone; you don't need anything else to send.

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

1. **Scaffold config files**

   ```bash
   gmail init
   ```

   Creates `~/.config/gmail-cli/` with `allowlist.json` and `config.json` and prints next steps.

2. **Create a Gmail App Password** (requires 2FA on the account):
   <https://myaccount.google.com/apppasswords>
   — pick "Mail" / "Other"; you get a 16-character code shown as `xxxx xxxx xxxx xxxx`.

3. **Save credentials** — write `~/.config/gmail-cli/credentials.json`:

   ```json
   { "user": "you@gmail.com", "appPassword": "xxxx xxxx xxxx xxxx" }
   ```

   ```bash
   chmod 600 ~/.config/gmail-cli/credentials.json
   ```

   Or set env vars instead (these take precedence over the file):

   ```bash
   export GMAIL_USER=you@gmail.com
   export GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"
   ```

4. **Add allowed recipients** to `~/.config/gmail-cli/allowlist.json` — see the
   [fail-closed allowlist](#fail-closed-allowlist) section below.

5. **Verify and send**

   ```bash
   gmail doctor          # check credentials + SMTP
   gmail send --to alice@example.com --subject "Hello" --body "Hi there."
   ```

## Fail-closed allowlist

> **`gmail send` only delivers to addresses on the allowlist (plus the configured account itself).
> With no or empty allowlist, the first send to anyone other than yourself fails immediately
> with exit code `3`. This is intentional — populate `allowlist.json` before sending to others.**

Edit `~/.config/gmail-cli/allowlist.json` (or override path with `GMAIL_ALLOWLIST`):

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
- `gmail allow list` shows the current entries; `gmail doctor` reports the count.

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
| `gmail send` | Send an email (text/HTML/Markdown, to/cc/bcc, attachments, threading, dry-run). Enforces the allowlist. |
| `gmail doctor` | Check credentials, verify Gmail SMTP, report allowlist size. |
| `gmail allow list` | List allowed recipients and their aliases (read-only; edit the JSON by hand). |
| `gmail log` | Show recent sent-mail log entries, newest first (alias: `gmail sent`). |

Exit codes: `0` ok · `1` send/network failure · `2` user-fixable config (missing creds, no recipients, bad attachment) · `3` recipient blocked by allowlist.

`--dry-run` always exits `0` (even if recipients would be blocked — denials are reported in the output, not the exit code).

## `gmail send` options reference

| Flag | Description |
|---|---|
| `--to <addr>` | Recipient (repeatable; comma-separated ok) |
| `--cc <addr>` | CC recipient (repeatable) |
| `--bcc <addr>` | BCC recipient (repeatable) |
| `--subject <text>` | Subject line |
| `--body <text>` | Plain-text body (or pipe on stdin) |
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
  }
}
```

| Field | Effect | Override flag |
|---|---|---|
| `fromName` | Display name on the `From` header | `--from-name` |
| `replyTo` | Default `Reply-To` address | `--reply-to` |
| `signature.text` / `signature.html` | Appended to text/HTML body after a blank line | `--no-signature` |
| `sendLog.enabled` | `false` disables the log globally | `--no-log` (per-send) |
| `sendLog.logBody` | `true` includes body text in every log entry | `--log-body` (per-send) |

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

- The App Password is a long-lived secret with SMTP-send access to the account. Keep
  `credentials.json` at `chmod 600`; never commit it.
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
