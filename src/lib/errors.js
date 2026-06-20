// Exit-code scheme: 2 = user-fixable config, 3 = recipient blocked by the allowlist, 4 = capability denied, 1 = everything else.
export const EXIT_CODES = {
  GENERIC: 1, // unexpected / SMTP / network failure
  CONFIG: 2, // user-fixable config (missing credentials, bad input)
  FORBIDDEN: 3, // recipient blocked by the allowlist policy
  CAPABILITY_DENIED: 4, // profile lacks required capability
};

export class GmailError extends Error {
  constructor(message, exitCode = EXIT_CODES.GENERIC) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

export class MissingCredentialsError extends GmailError {
  constructor(path) {
    super(
      `No Gmail credentials found.\n` +
        `Set GMAIL_USER + GMAIL_APP_PASSWORD, or create ${path} with:\n` +
        `  { "user": "you@gmail.com", "appPassword": "xxxx xxxx xxxx xxxx" }\n` +
        `Generate an App Password at https://myaccount.google.com/apppasswords (requires 2-Step Verification).`,
      EXIT_CODES.CONFIG,
    );
  }
}

export class InvalidInputError extends GmailError {
  constructor(message) {
    super(message, EXIT_CODES.CONFIG);
  }
}

export class MalformedConfigError extends GmailError {
  constructor(path, detail) {
    super(
      `Config file is not valid JSON: ${path}` +
        (detail ? `\n  ${detail}` : '') +
        `\nFix the file (or delete it to start fresh) and retry.`,
      EXIT_CODES.CONFIG,
    );
    this.path = path;
  }
}

export class RecipientNotAllowedError extends GmailError {
  constructor(denied) {
    super(
      `Blocked by allowlist — not permitted recipients: ${denied.join(', ')}\n` +
        `Nothing was sent. Add them (or an alias) to the allowlist, then retry.\n` +
        `Allowlist: ~/.config/gmail-cli/allowlist.json (GMAIL_ALLOWLIST overrides). See \`gmail allow list\`.`,
      EXIT_CODES.FORBIDDEN,
    );
    this.denied = denied;
  }
}

export class CapabilityDeniedError extends GmailError {
  constructor(bucket, profileName) {
    super(
      `Profile "${profileName}" lacks the "${bucket}" capability for this command.\n` +
        `Grant it with: gmail profile caps ${profileName} --allow ...  (or adjust --deny).`,
      EXIT_CODES.CAPABILITY_DENIED,
    );
    this.bucket = bucket;
    this.profileName = profileName;
  }
}
