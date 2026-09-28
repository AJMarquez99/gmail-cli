# Architecture

How `gmail-cli` is put together and why. Durable truth — see [[conventions]] for the rules that
fall out of it.

## One sentence

A Commander-based CLI that **sends** over Gmail SMTP (Nodemailer) and **reads** over Gmail IMAP
(`imapflow` + `mailparser`), using a single Gmail **App Password** for both, with every side effect
injected through one dependency object so the whole surface is testable without a live network.

## The dependency-injection spine

Everything that touches the outside world — filesystem, env, SMTP, IMAP, stdin/stdout prompts,
clock — is funneled through a single object, `defaultDeps`, defined in `src/deps.js`. Command
handlers never import `fs`/`nodemailer`/`imapflow` directly; they receive `deps` and call
`deps.readFile(...)`, `deps.createTransport(creds)`, `deps.now()`, etc.

- **Production:** `buildProgram(deps = defaultDeps)` in `src/cli.js` wires the real implementations.
- **Tests:** pass a hand-built fake `deps` with `vi.fn()` stubs — no real SMTP/IMAP/FS in CI. This
  is why there are ~265 tests and zero network calls.

If you add a new kind of side effect, add it to `defaultDeps` rather than importing it inline.

## Command flow

```
bin/gmail.js → src/cli.js buildProgram() → Commander parses argv
   → handle(fn, {table, args, preprocess}, deps) wrapper
      → runXxx(opts, deps)  ← the actual command, in src/commands/
```

`handle()` (in `src/cli.js`) is the single choke point wrapping every command. It:

1. Maps Commander's positional args onto `opts` using the `args` name list (so handlers only read
   `opts`, never positional argument order).
2. Propagates the global `--profile` and `--format` options down from the root command into `opts`.
3. Runs an optional `preprocess(opts)` hook (e.g. reading piped stdin for `send --body`).
4. Calls `fn(opts, deps)`, then renders the result: `--format table` → the command's `table(result)`
   renderer (from `src/lib/format.js`); otherwise `printJson(result)`. **JSON is the default output.**
5. Catches errors: prints `err.message` to stderr and sets `process.exitCode` from the error's
   `exitCode` (see the error model below).

Because rendering and error handling live in `handle()`, command functions just return plain data
objects — they don't print or set exit codes themselves.

## Module map (`src/`)

| File | Responsibility |
|---|---|
| `cli.js` | Commander program, the `handle()` wrapper, global flags |
| `deps.js` | `defaultDeps` — the DI object; the only place real IO is constructed |
| `profile.js` | `resolveProfile()` — the multi-account resolution ladder |
| `auth/credentials.js` | Resolve the App Password (env → file, per profile) |
| `allowlist.js` | Load allowlist + `makeAllowChecker()` (fail-closed recipient gate) |
| `config.js` | Load/merge non-secret `config.json` |
| `transport.js` | `createGmailTransport()` — Nodemailer Gmail SMTP |
| `imap.js` | `createImapClient()` — `imapflow` connection factory |
| `reader.js` | IMAP read + light-write ops over an already-connected client |
| `lib/jsonfile.js` | `readJson` — the single JSON-parse choke point (throws `MalformedConfigError`) + write/path helpers |
| `lib/sendlog.js` | Append/read the metadata-only send log (JSONL) |
| `lib/normalize.js` | Normalize a parsed message into the CLI's shape |
| `lib/markdown.js` | Markdown → inline-styled HTML (for `send --markdown`) |
| `lib/templates.js` | HTML email styling helpers |
| `lib/errors.js` | Error classes + exit-code map |
| `lib/format.js` | All `format*` table renderers |
| `commands/*` | One file per command group (send/doctor/log/init/login/allow/config/profile/read/label/mark) |
| `version.js` | `VERSION` — single source, read from `package.json` (used by CLI `--version` and the MCP server) |
| `mcp/tools.js` | SDK-agnostic `TOOLS` table (name/description/inputSchema/command/mapArgs) |
| `mcp/server.js` | MCP SDK binding: `buildMcpServer`/`makeToolHandler`/`startMcpServer` |

## MCP layer

A second front-end (`bin/gmail-mcp.js`) over the **same** `run*(opts, deps)` command modules,
exposed as a stdio Model Context Protocol server, mirroring discord-cli's pattern:

```
bin/gmail-mcp.js → mcp/server.js (SDK binding) → mcp/tools.js (SDK-agnostic TOOLS) → commands/* (same as CLI)
```

- `mcp/tools.js` — a plain `TOOLS` array; each entry has `name`, `description`, `inputSchema` (zod raw
  shape), `command` (a `run*` fn), and `mapArgs` (snake_case MCP args → camelCase `opts`).
- `mcp/server.js` — `buildMcpServer(deps)` registers every tool; `makeToolHandler` calls
  `tool.command(tool.mapArgs(args), deps)` and wraps the result as MCP content, catching any
  `GmailError` into `{ isError: true }` (the server never crashes on a blocked/failed call).
- **Safety inheritance is the whole point:** tools delegate to the gated command fns with
  `defaultDeps`, so the fail-closed allowlist, dry-run, and send log all apply. The surface is the
  **operational verbs only** (send/read/label/mark/allow-list/log/doctor) — it deliberately omits
  every boundary-mutating or secret-writing command (no `login`/`init`/`allow add|remove`/`config *`),
  and `gmail_send` exposes no `no_allowlist`/`no_log` arg. See the umbrella `safety-spec.md` §5.8 and
  [[conventions]].

## SMTP send path

`transport.js` uses Nodemailer's `service: 'gmail'` (resolves `smtp.gmail.com:465`, TLS) and
authenticates with `{ user, pass: appPassword }`. The 16-char App Password is the SMTP password —
there is no OAuth. `send` assembles the message (subject/body/html/attachments/threading headers),
runs it through the allowlist checker, then sends — unless `--dry-run`, which assembles and previews
without sending or logging.

## IMAP read path & connection lifecycle

Reads use `imapflow`; raw messages are parsed by `mailparser` (`deps.parseMessage`) and shaped by
`lib/normalize.js`. The connection lifecycle is centralized in **`withClient(opts, deps, fn)`** in
`src/commands/read.js`:

```
resolve profile → resolve creds → createImapClient → connect()
   → try { fn(client) } finally { client.logout() }   ← always logs out, even on throw
```

`withClient` is exported and **reused by `label` and `mark`**, so every IMAP operation shares the
same connect/teardown discipline. Read content is **never** written to the send log; HTML bodies are
held in memory only.

**`openImapClient(deps, creds, imapOpts)` (`src/imap.js`) is the single connect choke point** — every
call site that opens an IMAP session (`withClient`, `doctor`, `draft send`) goes through it, not
`createImapClient(...).connect()` directly. It races each `connect()` attempt against a 30s hard
deadline (`deps.imapConnectTimeoutMs`, default 30000). Separately, imapflow's own client options come
from `IMAP_DEFAULTS` (15s connect / 10s greeting / 120s socket, overridable per profile via
`profile.imap`); an imapflow `CONNECT_TIMEOUT`/`GREETING_TIMEOUT` rejection is treated as a timeout too.
On a timeout it retries once on a fresh client after closing the stalled one, and throws `ImapTimeoutError` on final
failure. A stalled TLS handshake or greeting must never hang a command forever — if you add a new
IMAP-opening command, route it through `openImapClient`, not a bare `client.connect()`.

## Organize invariants

`archiveMessage` (`src/writer.js`) archives by **`MOVE` to `[Gmail]/All Mail`**, never by removing the
`\Inbox` label via `messageFlagsRemove`. Gmail omits the currently-selected mailbox's own label from
`X-GM-LABELS`, so removing `\Inbox` while INBOX is selected is a silent, successful no-op — the bug
this shipped with before the v1.0.0 hardening pass. The MOVE-based writers — `archiveMessage`,
`moveMessage`, and `trashMessage` — **verify the server's response** through one shared helper
(`moveVerified`): `false` → `GmailError` (exit 1); no/empty `uidMap` (nothing moved) →
`InvalidInputError` (exit 2) naming the verb, uid and mailbox; a `uidMap` smaller than the
de-duplicated requested UIDs → `GmailError` (partial move). So a rule with `archive` then `trash`
records the trash as an error instead of reporting it applied. The flag/label writers (`addLabel`,
`removeLabel`, `markMessage`, `starMessage`, `importantMessage`) do **not** yet verify a server
result — imapflow's STORE gives no per-UID confirmation to check — so treat their success as
"command accepted", not "state confirmed". A new MOVE-style writer must go through `moveVerified`.

## Attachment confinement

`buildAttachments` (`src/compose.js`) resolves every `--attach` path against a configured `attachRoot`
(default: cwd) and refuses anything that resolves outside it — lexically or after resolving symlinks
(`deps.realpath`) — including a symlink *inside* the root whose real target escapes it. An `attachRoot`
that itself resolves to the filesystem root (lexically or via a symlink) is refused outright, since
that would make the containment check vacuous. Attachment bytes are read in-process and handed to
`nodemailer`/the standalone `MailComposer` as buffers — `disableFileAccess`/`disableUrlAccess` are
forced on both, so a crafted message object can never make the composer itself read a file or fetch a
URL by path/href.

## Locked boundary mode

`isBoundaryLocked` (`src/lock.js`) is a single global (top-level `config.locked`, never
`profiles.<name>.locked`) switch checked before any CLI-reachable action that could widen the
boundary: allowlist edits, boundary-related config keys (`BOUNDARY_KEYS` in `src/commands/config.js`:
`allowlist.*`, `allowlistPath`, `credentialsPath`, `attachRoot`, `maxRecipients`, `capabilities`, `deny`,
`profiles`, `locked` itself — matched on the bare subkey so a fully-qualified
`profiles.<name>.<key>` can't sneak past it), `login`, profile add/remove/caps changes, and any send
that tries to disable enforcement. It governs only changes made **through the CLI** — see SECURITY.md
for the explicit limit (an agent that controls the process's environment variables or the config
directory can defeat it). `defaultProfile` is deliberately **not** a boundary key: it stays a global
(top-level-only) key, but switching among existing profiles is allowed while locked, same as
`profile use` / `--profile`.

## Multi-account profiles

`profile.js#resolveProfile` selects an account by a fixed ladder (flag → env → `config.defaultProfile`
→ sole profile → legacy single-account → error if ambiguous). Each profile owns suffixed files
(`credentials-<name>.json`, `allowlist-<name>.json`, `sent-<name>.jsonl`) and its own identity block.
**Legacy single-account behavior (no `profiles` key) is byte-identical to the pre-profiles CLI**,
including the `GMAIL_*` env vars — this backward-compat guarantee is load-bearing; don't break it.

## Error & exit-code model

`lib/errors.js` defines `GmailError` (base, carries `exitCode`) and subclasses, mapped to exit codes:

| Code | Meaning | Class |
|---|---|---|
| `0` | success | — |
| `1` | generic / SMTP / network failure | `GmailError` (default), `ImapTimeoutError` |
| `2` | user-fixable config / bad input | `InvalidInputError`, `MissingCredentialsError`, `MalformedConfigError`, `TooManyRecipientsError` |
| `3` | blocked by the boundary — recipient not on the allowlist, or a sealed/locked boundary refusing a bypass/edit | `RecipientNotAllowedError`, `BoundaryLockedError` |
| `4` | capability denied — command's bucket not granted to the profile (a deliberate, documented extension past the shared `0-3` family) | `CapabilityDeniedError` |

`handle()` maps any non-`GmailError` throw to exit `1`. Throw the specific subclass so the exit code
is correct — see [[conventions]]. **Unparseable config files** (`config.json`, `allowlist.json`,
`credentials.json`) throw `MalformedConfigError` (exit 2) via the single `lib/jsonfile.js#readJson`
parse choke point — never a raw `SyntaxError` at exit 1. `InvalidInputError` is reserved for bad
flags/args; `MalformedConfigError` for a bad *file*.

## Tests & CI

`vitest`; run with `npm run test:run` (NOT the watch-mode `npm test`). Message normalization is
tested against `test/fixtures/sample.eml`. CI (`.github/workflows/ci.yml`) runs `npm ci` +
`npm run test:run` on every push and PR. See [[releasing]] for the publish workflow.
