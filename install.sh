#!/bin/sh
# gmail-cli installer — installs @ajmarquez99/gmail-cli globally via npm
# Usage: sh install.sh [--from-github] [-h|--help]
set -e

PACKAGE="@ajmarquez99/gmail-cli"
GITHUB_SPEC="github:AJMarquez99/gmail-cli"
MIN_NODE=20

log() { printf '%s\n' "$*" >&2; }
err() { printf 'error: %s\n' "$*" >&2; }

usage() {
  printf 'Usage: sh install.sh [OPTIONS]\n' >&2
  printf '\n' >&2
  printf 'Options:\n' >&2
  printf '  --from-github   Install directly from GitHub (before npm publish)\n' >&2
  printf '  -h, --help      Show this help message\n' >&2
  printf '\n' >&2
  printf 'Default: installs from npm (%s)\n' "$PACKAGE" >&2
}

# Parse flags
FROM_GITHUB=0
for arg in "$@"; do
  case "$arg" in
    --from-github) FROM_GITHUB=1 ;;
    -h|--help) usage; exit 0 ;;
    *) err "unknown option: $arg"; usage; exit 2 ;;
  esac
done

# Check node
if ! command -v node >/dev/null 2>&1; then
  err "node is not installed or not on PATH."
  err "Install Node.js >= $MIN_NODE from https://nodejs.org and re-run."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/^v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt "$MIN_NODE" ] 2>/dev/null; then
  err "Node.js >= $MIN_NODE is required (found v$(node -v | sed 's/^v//'))."
  err "Upgrade from https://nodejs.org and re-run."
  exit 1
fi

# Check npm
if ! command -v npm >/dev/null 2>&1; then
  err "npm is not installed or not on PATH."
  err "npm ships with Node.js — reinstall from https://nodejs.org."
  exit 1
fi

# Install
if [ "$FROM_GITHUB" -eq 1 ]; then
  log "Installing $GITHUB_SPEC …"
  npm install -g "$GITHUB_SPEC"
else
  log "Installing $PACKAGE from npm …"
  npm install -g "$PACKAGE"
fi

# Verify
if ! gmail --version >/dev/null 2>&1; then
  err "gmail was installed but could not be found on PATH."
  err "Check that npm's global bin directory is on your PATH:"
  NPM_BIN_DIR="$(npm prefix -g 2>/dev/null)/bin"
  err "  $NPM_BIN_DIR"
  exit 1
fi

INSTALLED_VERSION=$(gmail --version 2>&1 | head -n1)
log ""
log "✓ gmail installed ($INSTALLED_VERSION)."
log ""
log "Next: run \`gmail init\` to set up, then \`gmail doctor\` to verify."
