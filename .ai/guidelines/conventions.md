# Conventions

Standing rules for working in this codebase. The "why" behind most of these lives in
[[architecture]].

## Dependency injection is mandatory

- Command handlers have the signature `runXxx(opts, deps)` and reach the outside world **only**
  through `deps`. Never `import` `fs`, `nodemailer`, `imapflow`, `process.env`, or the clock directly
  inside a command or library function that runs under a handler.
- New side effects go on `defaultDeps` in `src/deps.js`, then get used as `deps.thing(...)`.
- Tests construct a fake `deps` of `vi.fn()` stubs. If something is hard to test, it's usually
  because a side effect escaped the `deps` object — fix that, don't mock around it.

## Output: JSON by default, table opt-in

- Every command returns a plain data object; `handle()` renders it. **Do not** `console.log` or
  print inside a command.
- JSON is the default. A `--format table` view is optional — if you add one, write a `format*`
  renderer in `src/lib/format.js` and pass it as `table` in the command's `handle(...)` registration.

## Exit codes are part of the contract

Throw the right error class from `src/lib/errors.js` so the exit code is correct:

| Situation | Throw | Exit |
|---|---|---|
| user-fixable config / bad input | `InvalidInputError` (or `MissingCredentialsError`) | `2` |
| recipient not on the allowlist | `RecipientNotAllowedError` | `3` |
| network / SMTP / unexpected | `GmailError` or any plain `Error` | `1` |
| success | return data normally | `0` |

`handle()` maps any non-`GmailError` to exit `1`, so reserve plain `throw new Error()` for genuinely
unexpected failures.

## The allowlist is fail-closed — keep it that way

- `gmail send` may only email addresses on the allowlist plus the configured account itself (always
  implicitly allowed). A **missing** allowlist file means "deny everyone but self," not "allow all"
  (`allowlist.js#loadAllowlist` returns an empty list on `ENOENT`).
- Any unlisted recipient on to/cc/bcc rejects the **whole** send with exit `3` — never send a
  partial set.
- The escape hatches are explicit and opt-in: `--no-allowlist` (per-send) or
  `allowlist.enforce: false` (persistent). Don't add new implicit bypasses.

## Profiles: never break legacy single-account mode

The no-`profiles`-key path must stay byte-identical to the pre-profiles CLI, including `GMAIL_*` env
vars. Any change to credential/allowlist/log path resolution must preserve this. Test both the
profile and legacy paths.

## Privacy invariants

- The send log (`sent.jsonl`) is **metadata-only**. Bodies are excluded unless `--log-body` /
  `config.sendLog.logBody`. Read content (IMAP) is **never** logged.
- Credentials live in `~/.config/gmail-cli/` at `chmod 600`, never in the repo. `credentials.json`,
  `config.json`, `allowlist.json`, and `sent.jsonl` are gitignored — keep them so.

## Testing

- Framework: `vitest`. Run the suite with **`npm run test:run`** (one-shot). `npm test` is watch
  mode — don't use it in scripts/CI/agents.
- Every new command or library function ships with tests that inject a fake `deps`. No live network
  in tests.
- See [[adding-a-command]] for the end-to-end pattern.

## Commits & releases

- **Conventional commits** (`feat:`, `fix:`, `docs:`, `chore:`, …).
- This repo's `.ai/` is committed (public), governed by `.ai/.gitignore` (`_*` = local-only).
  `.ai/plans/` and `.ai/context/` contents are kept local; `CLAUDE.md` is local. Commit `.ai/`
  changes by explicit path — don't `git add -A` blindly.
- Releasing is tag-driven — see [[releasing]].
