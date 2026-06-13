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
| `lib/jsonfile.js` | Read/write JSON config files |
| `lib/sendlog.js` | Append/read the metadata-only send log (JSONL) |
| `lib/normalize.js` | Normalize a parsed message into the CLI's shape |
| `lib/markdown.js` | Markdown → inline-styled HTML (for `send --markdown`) |
| `lib/templates.js` | HTML email styling helpers |
| `lib/errors.js` | Error classes + exit-code map |
| `lib/format.js` | All `format*` table renderers |
| `commands/*` | One file per command group (send/doctor/log/init/login/allow/config/profile/read/label/mark) |

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
| `1` | generic / SMTP / network failure | `GmailError` (default) |
| `2` | user-fixable config / bad input | `InvalidInputError`, `MissingCredentialsError` |
| `3` | recipient blocked by the allowlist | `RecipientNotAllowedError` |

`handle()` maps any non-`GmailError` throw to exit `1`. Throw the specific subclass so the exit code
is correct — see [[conventions]].

## Tests & CI

`vitest`; run with `npm run test:run` (NOT the watch-mode `npm test`). Message normalization is
tested against `test/fixtures/sample.eml`. CI (`.github/workflows/ci.yml`) runs `npm ci` +
`npm run test:run` on every push and PR. See [[releasing]] for the publish workflow.
