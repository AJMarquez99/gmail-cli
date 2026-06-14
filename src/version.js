import { createRequire } from 'node:module';

// Single source of truth for the version: read it from package.json so the CLI's `--version`
// can never drift from the published version. (Releasing no longer needs a manual sync step.)
const require = createRequire(import.meta.url);
export const VERSION = require('../package.json').version;
