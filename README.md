# gmail-cli

Personal Gmail **send-only** CLI for agentic sessions — the `gh`/`aws`/`gsc` sibling for
firing email autonomously. Reading and drafting stay on the managed **claude.ai Gmail
connector**; this tool exists only to do the one thing the connector can't: actually *send*.

Sends as **agentic.marquez@gmail.com** over Gmail SMTP using an **App Password**.

## Why this exists

The claude.ai Gmail connector (`mcp__claude_ai_Gmail__*`) can search, read, label, and
*draft* — but it has no `send` tool. For a fully headless "compose and send" agent flow,
this CLI closes that gap with the minimal viable approach: Nodemailer + SMTP + App Password.

## Install

```bash
cd ~/Code/Projects/gmail-cli && npm install && npm install -g .
```

That puts `gmail` on your PATH (symlinked from the global npm bin).

## One-time setup (App Password)

App Passwords require 2-Step Verification on the Google account.

1. Enable 2FA: <https://myaccount.google.com/signinoptions/twosv>
2. Generate an App Password: <https://myaccount.google.com/apppasswords>
   (pick "Mail" / "Other"; you get a 16-character code shown as `xxxx xxxx xxxx xxxx`).
3. Store it (spaces optional — they're stripped):

```bash
mkdir -p ~/.config/gmail-cli
cat > ~/.config/gmail-cli/credentials.json <<'JSON'
{ "user": "agentic.marquez@gmail.com", "appPassword": "xxxx xxxx xxxx xxxx" }
JSON
chmod 600 ~/.config/gmail-cli/credentials.json
```

Alternatively, set `GMAIL_USER` + `GMAIL_APP_PASSWORD` env vars (these take precedence).
Override the config path with `GMAIL_CLI_CONFIG`.

## Usage

Output is JSON by default; add `--format table` for a human-readable summary.

```bash
# Verify credentials + SMTP connection
gmail doctor

# Send
gmail send --to alice@example.com --subject "Report" --body "All green."

# Multiple recipients (repeat the flag or comma-separate), cc/bcc, HTML, reply-to
gmail send --to a@x.com --to "b@x.com,c@x.com" --cc boss@x.com \
  --subject "Update" --html "<b>Done.</b>" --reply-to me@x.com

# Pipe the body in (handy for agents / long content)
generate-report | gmail send --to team@x.com --subject "Nightly report"
```

## Credential resolution (precedence)

1. `GMAIL_USER` + `GMAIL_APP_PASSWORD` env vars
2. `GMAIL_CLI_CONFIG` path, else `~/.config/gmail-cli/credentials.json`

## Recipient allowlist (security)

`gmail send` is **fail-closed**: it will only email addresses on an allowlist (plus the
configured account itself, which is always implicitly allowed). With no allowlist file, the
only permitted recipient is `agentic.marquez@gmail.com` — so a stray or hijacked agent can't
mail strangers.

Edit the list by hand at `~/.config/gmail-cli/allowlist.json` (override with `GMAIL_ALLOWLIST`):

```json
{
  "recipients": [
    { "email": "alice@example.com", "aliases": ["alice", "a"] },
    { "email": "bob@example.com" }
  ]
}
```

- `aliases` are optional. Address by alias and it expands to the real email:
  `gmail send --to alice …` sends to `alice@example.com`.
- Enforcement covers `--to`, `--cc`, and `--bcc`. If **any** recipient isn't permitted, the
  whole send is rejected (nothing is sent) and the command exits `3`.
- Matching is case-insensitive. `gmail allow list` shows the current entries; `gmail doctor`
  reports the count.

## Commands

| Command | Description |
|---|---|
| `gmail send`       | Send an email (text/HTML, to/cc/bcc, reply-to, stdin body). Enforces the allowlist. |
| `gmail doctor`     | Check credentials, verify Gmail SMTP, report allowlist size. |
| `gmail allow list` | List allowed recipients and their aliases (read-only; edit the JSON by hand). |

Exit codes: `0` ok · `1` send/network failure · `2` user-fixable config (missing creds, no recipients) · `3` recipient blocked by allowlist.

## Develop

```bash
npm test        # vitest (watch)
npm run test:run
```

Architecture mirrors `gsc-cli`: ESM, `commander`, dependency-injected command handlers
(`src/commands/*.js`) for testability, JSON-default output. Credentials never get committed
(`.gitignore` + creds live in `~/.config`).

## Security notes

- The App Password is a long-lived secret with SMTP-send access to the account. Keep
  `credentials.json` at `chmod 600`; never commit it.
- Scope is send-only by construction (SMTP). Revoke anytime at
  <https://myaccount.google.com/apppasswords>.
- Outbound recipients are constrained by the fail-closed allowlist (see above), so the blast
  radius of a misused App Password is limited to addresses you've explicitly approved.
