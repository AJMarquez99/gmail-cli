import { resolveCredentials } from './auth/credentials.js';
import { createGmailTransport } from './transport.js';

// Default wiring injected into command handlers. Tests substitute their own.
export const defaultDeps = {
  resolveCredentials: () => resolveCredentials({}),
  createTransport: (creds) => createGmailTransport(creds),
};
