# Note: `reply --no-quote` header-only fetch (follow-up from PR #16 review)

**Captured:** 2026-06-22 · **Status:** follow-up (deferred from v1.0.0 review) · **Priority:** low

## The idea

`buildReply` in `src/commands/reply.js` always does `fetchRawMessage` (imapflow `source: true`),
downloading the entire original message — full body **and all attachments** — then `parseMessage`s
the whole MIME tree. But for `reply --no-quote`, the original body/attachments are never used: the
reply only needs the original's envelope/headers (From, Reply-To, To, Cc, Subject, Message-ID,
References).

## The lift

- Two-step fetch: pull envelope + the threading headers (`fetch(uid, { uid: true, envelope: true,
  headers: ['references','in-reply-to','message-id'] })`) to build the reply headers; only fetch the
  full `source` when quoting is on (default, i.e. NOT `--no-quote`).
- Modest refactor of `buildReply` (split header-derivation from body-fetch) + a test that
  `--no-quote` does not request `source`.

## Why deferred

Benefit only appears on **large messages with `--no-quote`** (a narrow case); adds a two-path fetch
that complicates `buildReply`. Marginal value-for-complexity. Revisit if reply latency on big
threads becomes a real complaint. Relates to [[rules-engine-mailboxopen-dedup]].
