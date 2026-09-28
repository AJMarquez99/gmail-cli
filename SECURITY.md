# Security Policy

## Supported versions

`gmail-cli` is distributed through npm and the latest published version is the only one
supported. Please upgrade to the latest release before reporting an issue.

## Reporting a vulnerability

Please **do not** open a public issue for a vulnerability.

Instead, use GitHub's private reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** to open a private advisory
   (https://github.com/AJMarquez99/gmail-cli/security/advisories/new).

We'll acknowledge within a few days and keep you updated on the fix.

## Threat model

`gmail-cli` is built to be safe to hand to an autonomous agent: the agent can drive the CLI (or
the MCP server) directly, but several independent, fail-closed layers bound what that access can
do. Each layer is enforced at a single choke point in the code, not scattered per-command.

### 1. The recipient allowlist (fail-closed)

Sending mail is gated by an allowlist (`~/.config/gmail-cli/allowlist.json`, or a per-profile
`allowlist-<name>.json`). With **no allowlist file present, only the configured account itself is
reachable** — there is no "allow everyone" default. A recipient outside the list, in `to`, `cc`, or
`bcc`, rejects the **whole** send (exit `3`); the tool never sends to the allowed subset and drops
the rest. Disabling enforcement (`--no-allowlist`, or a profile's `allowlist.enforce: false`) is an
explicit, human-visible opt-in, and is itself one of the actions locked mode (below) can refuse.

### 2. Per-profile capabilities (CLI and MCP both gated)

Each profile can be scoped to a least-privilege set of capability buckets — `read`, `organize`,
`draft`, `send`, `delete` (see the README's "Permissions & capabilities" section). A profile
declares either an allowlist (`capabilities: [...]`) or a denylist (`deny: [...]`) of buckets,
never both. A command whose bucket the active profile lacks is rejected **before it runs**, with
exit code `4` (capability denied) — distinct from exit `3` (recipient blocked). This check runs at
one shared choke point (`enforceCapability` in `src/capabilities.js`) called from both `src/cli.js`
and the MCP server (`src/mcp/server.js`), so an agent talking to `gmail-cli` over MCP is held to the
exact same scope as one shelling out to the CLI directly — there is no capability-checked path and
an unchecked path.

### 3. Locked boundary mode — and its explicit limit

Locking the boundary (`GMAIL_CLI_LOCKED=1`, or `gmail config set locked true`) makes the CLI refuse
every agent-reachable action that could widen or disable the boundary itself: editing the
allowlist, changing boundary-related config keys (`allowlist.*`, `allowlistPath`,
`credentialsPath`, `attachRoot`, `maxRecipients`, `capabilities`, `deny`, `profiles`, `locked`),
`gmail login`, adding/removing profiles or changing their capability scope, and any send that tries to bypass enforcement. All of these refuse with
exit `3` while locked; reading, enforced sends, drafting, and non-boundary config are unaffected.

**This governs only changes made *through the CLI*.** It is not a sandbox. An agent that can set
environment variables the CLI reads (e.g. `GMAIL_CLI_SETTINGS`, `GMAIL_ALLOWLIST`,
`GMAIL_CLI_CONFIG`, `GMAIL_PROFILE`, `GMAIL_USER`/`GMAIL_APP_PASSWORD`, or `GMAIL_CLI_LOCKED` itself)
— or that can write to
`~/.config/gmail-cli` directly — can defeat the lock entirely, by pointing the CLI at different
files or editing the real ones out from under it. A real seal requires both: fix these environment
variables in the agent's own launcher (so the agent process cannot change them), **and** make the
config directory non-writable by the agent. Locked mode is a guardrail against a well-behaved agent
making a boundary-widening mistake, not a security boundary against an adversarial one that already
has that level of access to its own environment.

### 4. Attachment confinement

Attachments are resolved against a configured `attachRoot` (default: the current working
directory). A path that resolves outside that root — lexically, or after resolving symlinks — is
refused (`InvalidInputError`, exit `2`), including a symlink *inside* the root whose real target
points outside it (e.g. `ln -s ~/.ssh/id_rsa ./a.pdf`). An `attachRoot` that resolves to the
filesystem root (lexically or via a symlink) is refused outright, since that would make the
confinement check vacuous. See `buildAttachments` in `src/compose.js`.

### 5. No implicit file/URL access in the mail composer

`nodemailer`'s `MailComposer` is always constructed with `disableFileAccess: true` and
`disableUrlAccess: true` — both on the SMTP transport (`src/transport.js`) and on the standalone
composer used to build a raw MIME message for IMAP append (`src/compose.js`). This closes off
`{ path: ... }` / `{ href: ... }` attachment content, which would otherwise let a crafted message
object read arbitrary local files or fetch arbitrary URLs at send time — attachment content is
always an in-process buffer that has already passed the confinement check above.

### 6. Recipient cap

`maxRecipients` (default `10`) caps `to` + `cc` + `bcc` combined for a single transmission,
enforced centrally so it covers `send`, `reply`, `forward`, and `draft send` alike. Exceeding it is
refused outright (exit `2`), even under `--dry-run`, before the allowlist is even consulted — it
protects against runaway fan-out sends, not just disallowed recipients.

### 7. Secrets

- The Gmail App Password is read from `~/.config/gmail-cli/credentials.json` (written `chmod 600`
  by `gmail login`) or from the `GMAIL_USER` + `GMAIL_APP_PASSWORD` environment variables. It is
  never written to the repo, and never appears in CLI args, output, logs, or error messages — a
  credential or lock error names the config path or the control it refers to, never a value.
- The send log stores **metadata only** — message bodies are excluded unless you explicitly opt in
  with `--log-body`. Read content (IMAP) is never logged.

### 8. File permissions

`credentials.json`, `config.json`, `allowlist.json`, `rules.json`, and the send log are all written
`chmod 600` (owner read/write only) and **re-tightened to 0600 on every write** — including an
update to a file that predates this hardening and was left at a looser mode (e.g. `0644`) by an
older version of the tool. A failed `chmod` is logged as a warning; it never undoes a write that
already succeeded.

If you find a way to make the CLI leak credentials, bypass the allowlist or capability scope when
enforced, defeat a locked boundary through the CLI itself (not by controlling its environment or
config directory, per §3 above), read or attach a file outside the confined root, or write secrets
to disk in plaintext outside the intended config path, please report it through the private channel
above.

## Good hygiene for users

Never commit your `~/.config/gmail-cli/` files or paste an App Password into an issue, PR, or log.
Rotate the App Password from your Google Account if you suspect it has been exposed. If you run
`gmail-cli` under an agent, set `GMAIL_CLI_LOCKED=1` (or `locked: true`) in an environment the agent
cannot modify, and keep `~/.config/gmail-cli` writable only by the account that owns it — see
"Locked boundary mode" above for why both matter.
