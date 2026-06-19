# Security Policy

## Supported versions

`gmail-cli` is distributed through npm and the latest published version is the only one
supported. Please upgrade to the latest release before reporting an issue.

## Reporting a vulnerability

Please **do not** open a public issue for a vulnerability.

Instead, use GitHub's private reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** to open a private advisory.

If you'd rather email, write to **alejandromarquez@live.com** with details and steps to
reproduce. I'll acknowledge within a few days and keep you updated on the fix.

## How the CLI handles secrets

- The Gmail App Password is read from `~/.config/gmail-cli/credentials.json` (written `chmod 600`
  by `gmail login`) or from environment variables. It is never written to the repo.
- The send log stores **metadata only** — message bodies are excluded unless you explicitly opt
  in with `--log-body`. Read content is never logged.
- The recipient allowlist is **fail-closed**: with no allowlist file, only the account itself is
  reachable. Disabling enforcement is an explicit, opt-in action.

If you find a way to make the CLI leak credentials, bypass the allowlist when it is enforced, or
write secrets to disk in plaintext outside the intended config path, please report it through the
private channel above.

## Good hygiene for users

Never commit your `~/.config/gmail-cli/` files or paste an App Password into an issue, PR, or
log. Rotate the App Password from your Google Account if you suspect it has been exposed.
