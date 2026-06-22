# Note: Rules-engine `mailboxOpen` dedup (follow-up from PR #16 review)

**Captured:** 2026-06-22 · **Status:** follow-up (deferred from v1.0.0 review) · **Priority:** low

## The idea

In `src/rules/engine.js` `applyRules`, the engine opens the mailbox once per rule (before
`search`), but every action executor in `src/rules/actions.js` → `src/writer.js` *also* calls
`client.mailboxOpen(mailbox)`. So each action re-SELECTs an already-open mailbox.

After the **UID-set batching** change (see `.ai/plans/2026-06-22-rules-apply-uid-batching.md`), the
redundant opens drop from N×M to **M** (one per action). This note covers squeezing that last bit
out — skip the `mailboxOpen` when the mailbox is already selected.

## The lift

- Add a guard in the writer mutation helpers (or a shared `ensureOpen(client, mailbox)` helper):
  `if (client.mailbox?.path !== mailbox) await client.mailboxOpen(mailbox);`.
- Touches every mutation fn in `src/writer.js` (`addLabel`/`removeLabel`/`archiveMessage`/
  `markMessage`/`starMessage`/`importantMessage`/`moveMessage`/`trashMessage`/`deleteMessage`).
- **Test caveat:** the existing `test/writer.test.js` + `test/rules-engine.test.js` use recording
  stub clients that do NOT set `client.mailbox.path` on open. With the guard, a fresh stub has
  `client.mailbox === undefined`, so the first call still opens (existing single-op assertions stay
  green). To *exercise* the dedup you'd give the stub a `mailbox` getter that reflects the last
  `mailboxOpen` arg, then assert a second same-mailbox op does NOT re-open.

## Why deferred

Largely subsumed by the batching change (M opens is already fine); the remaining win is marginal and
the writer-wide change risks churn in the stub-based tests. Do it only if a real `rules apply` trace
shows the per-action SELECTs mattering. Relates to [[reply-no-quote-header-only-fetch]].
