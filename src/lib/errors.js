// Exit codes mirror the gsc-cli convention: 2 = user-fixable config, 1 = everything else.
export const EXIT_CODES = {
  GENERIC: 1, // unexpected / SMTP / network failure
  CONFIG: 2, // user-fixable config (missing credentials, bad input)
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
        `  { "user": "agentic.marquez@gmail.com", "appPassword": "xxxx xxxx xxxx xxxx" }\n` +
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
