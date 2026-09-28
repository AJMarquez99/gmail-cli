# Note: IMAP connections can hang indefinitely (no connect/socket timeout)

> **Resolved in v1.0.0** (PR #18) — kept for history.

**Captured:** 2026-06-26 · **Status:** RELEASE BLOCKER for v1.0.0 · **Priority:** high

## Symptom

Any command that opens an IMAP session — `doctor`, `read *`, `label`, `mark`, `archive`, `move`,
`trash`, `delete`, `rules apply`, and the fetch step of `reply`/`forward`/`draft` — can **hang
indefinitely** instead of erroring. The process sits forever with no output and a `0`-byte result
until it is killed manually. Re-running the exact same command immediately afterward usually succeeds
in ~1s, which is what makes it look intermittent rather than broken.

Observed twice during v1.0.0 staging testing:
- First `doctor` of the session hung >2 min, then succeeded instantly on retry.
- `label remove <uid> <name>` hung >5 min, then succeeded instantly on retry after `kill`.

## Root cause

Each CLI invocation opens a **fresh** IMAP connection (the CLI is stateless — no connection pooling
across invocations, which is correct for a CLI). The connection is built in `src/imap.js`:

```js
// src/imap.js — createImapClient()
return new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: { user: creds.user, pass: creds.appPassword },
  logger: false,
  ...imapOpts,            // <-- nothing sets timeouts here today
});
```

and connected in `src/commands/read.js`:

```js
// withClient()
const client = deps.createImapClient(creds, profile.imap || {});
await client.connect();  // <-- no timeout wrapper; can await forever
```

**No `connectionTimeout` / `greetingTimeout` / `socketTimeout` is configured**, and `connect()` is
not raced against any deadline. So if a new TLS connection or the IMAP greeting stalls — plausibly
aggravated by Gmail **throttling a burst of new IMAP connections** (our test run opened many in rapid
succession) — there is nothing to abort it. It hangs until the OS or the user kills it. A CLI that
can hang forever on a flaky network is the blocker; the throttling is just the most likely trigger.

## Possible fixes (ranked by value-for-effort)

1. **Set imapflow timeouts in `createImapClient` (lowest effort, highest value — likely sufficient
   alone).** imapflow accepts `connectionTimeout` (ms to establish the socket), `greetingTimeout` (ms
   to wait for the server greeting), and `socketTimeout` (ms of inactivity before the socket is torn
   down). Add sane defaults (e.g. `connectionTimeout: 15000`, `greetingTimeout: 10000`,
   `socketTimeout: 30000`) so a stalled connection rejects and the command exits **1** instead of
   hanging. Keep them overridable via the existing `...imapOpts` spread (premise corrected — see
   [[2026-09-27_config-set-double-prefixes-dotted-profile-keys]]: at capture time `resolveProfile()`
   did not actually wire `profile.imap` through, so this needed a companion fix to be reachable), so
   a profile can tune them. Verify the exact option names against the pinned imapflow version before
   shipping.

2. **Race `client.connect()` against an explicit deadline in `withClient` (belt-and-suspenders).**
   Wrap the connect in a `Promise.race([client.connect(), rejectAfter(ms)])`; on timeout, attempt
   `client.logout()/close()` and throw a typed error mapped to exit 1. Covers any stall the library
   options don't catch, and centralizes the behavior for every IMAP command (also need it in
   `doctor`, which builds its own SMTP+IMAP checks — confirm it routes through the same client).

3. **One automatic retry with short backoff on a connection timeout.** Every observed hang succeeded
   on the very next attempt, so a single transparent retry (after #1/#2 make the first attempt
   *fail fast*) would turn most user-visible stalls into a slightly-slower success. Cap at 1 retry to
   avoid masking a real outage; surface the retry on stderr.

4. **(Optional) a `--timeout <ms>` global flag + `config.json` `imap.timeouts` key.** Lets power users
   tune for slow links. Only worth it after #1; the defaults should make this rarely necessary.

## Suggested verification

- Unit: a stub client whose `connect()` never resolves → assert `withClient` rejects within the
  deadline (fake timers) and that `logout`/`close` is attempted. Keep existing stub tests green
  (stubs that resolve immediately are unaffected).
- Manual: re-run the burst that triggered it (several `read`/`label`/`mark` calls back-to-back) and
  confirm any stall now exits non-zero promptly rather than hanging, and that a retry path (if added)
  recovers.

## Why it's a blocker, not deferred

Unlike the two perf follow-ups ([[rules-engine-mailboxopen-dedup]],
[[reply-no-quote-header-only-fetch]], both in `.ai/notes/`) — which are invisible
micro-optimizations — this is a
correctness/UX failure mode the user hits in normal operation: a command that **never returns**. It
should be fixed before tagging `v1.0.0`. Fix #1 is small and self-contained.
