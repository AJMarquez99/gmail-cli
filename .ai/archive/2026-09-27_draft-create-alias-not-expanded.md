# Note: `draft create` does not expand allowlist aliases → draft saved with no recipient

> **Resolved in v1.0.0** (PR #18) — kept for history.

**Captured:** 2026-06-26 · **Status:** RELEASE BLOCKER candidate for v1.0.0 · **Priority:** high

## Symptom

`gmail draft create --to <alias> …` (where `<alias>` is an allowlist alias such as `alice`)
saves a draft whose **`To:` header is empty**. The recipient is silently lost. The command's own
JSON output even echoes the raw alias (`"to": ["alice"]`), so it *looks* like it worked — but the
MIME actually written to `[Gmail]/Drafts` has no parseable recipient.

Reproduced during v1.0.0 staging testing:
- `draft create --to alice …` → read the saved draft back → `to: []` (empty).
- `draft create --to alice@example.com …` → read back → `to: [alice@example.com]` (intact).

So it is **alias-specific**: literal email addresses survive; aliases do not.

## Impact

- A draft created with an alias is broken for human use: open it in Gmail web and there is no
  recipient.
- It also breaks the downstream `draft send`: `runDraftSend` parses recipients **from the stored
  draft MIME** (`parsed.to/cc/bcc`), so an alias-created draft sends with an empty recipient set
  (SMTP error / sends to nobody) — the alias is never recovered.
- Aliases are a headline, documented feature; this fails them silently (no error, exit 0). That
  combination — documented feature + silent wrong result — is why it rates blocker, not deferred.

## Root cause

`runDraftCreate` in `src/commands/draft.js` builds the message from the **raw** `--to/--cc/--bcc`
tokens and never resolves aliases:

```js
// src/commands/draft.js — runDraftCreate()
const to = toList(opts.to), cc = toList(opts.cc), bcc = toList(opts.bcc);
const { message } = buildMessage({ to, cc, bcc }, opts, { profile, creds }, deps);
```

`toList()` only splits/normalizes comma-separated values — it does **not** expand aliases. Alias
expansion lives in `resolveRecipients` (`src/transmit.js`), which `runDraftCreate` does not call. So
the literal token `alice` is handed to the MIME builder; nodemailer cannot parse it as an address
and drops it → empty `To`.

This is the **same bug class** as the PR-#16 forward/reply finding ("build the message from
*resolved* recipients, not raw"). The Phase-5 fix corrected `send`/`reply`/`forward` to route through
`resolveRecipients`, but `draft create` was not re-checked and still builds from raw tokens. It
violates the standing invariant: *resolve recipients → buildMessage from the RESOLVED recipients.*

**Scope confirmed isolated to `draft create`** (staging test, 2026-06-26): a real `forward --to
<alias>` expanded the alias correctly (`accepted: [<expanded-email>]`), and `send`/`reply --draft`
also resolve correctly. Only `runDraftCreate` (and its `--cc`/`--bcc`, same code path) is affected —
the fix does not need to touch the forward/reply/send paths.

## The fix

Expand aliases in `runDraftCreate` **without** enforcing the allowlist (drafts must never enforce —
the transmission-boundary invariant). `resolveRecipients` already separates expansion from
enforcement: it expands, and the throw lives in the separate `enforceAllowlist`. Call it with
enforcement off so nothing is dropped and nothing is sent:

```js
const { to, cc, bcc } = resolveRecipients(
  { to: toList(opts.to), cc: toList(opts.cc), bcc: toList(opts.bcc) },
  { ...opts, noAllowlist: true },          // expand aliases; never enforce or drop on a draft
  { profile, creds }, deps,
);
const { message } = buildMessage({ to, cc, bcc }, opts, { profile, creds }, deps);
// ...append unchanged. Echo the RESOLVED to/cc/bcc in the result (not the raw tokens).
```

With `noAllowlist: true`, `enforce` is false, so each token returns its expanded email (`r.email`)
or, if unresolved, the raw token (`r.denied`) — literal emails and unknown tokens are preserved,
aliases expand. Do **not** call `enforceAllowlist` here. Also return the resolved `to/cc/bcc` in the
JSON result so the echoed value matches what was actually written.

Note the `{ ...opts, noAllowlist: true }` shim works but is slightly indirect; an alternative is a
small `expandRecipients()` helper in `transmit.js` that does expansion-only, which both `draft
create` and any future never-enforce caller can share. Either is fine; the shim is the smaller diff.

## Verification

- Unit: `runDraftCreate` with `--to <alias>` → assert the message passed to `buildRawMime`/append has
  the **expanded** address in `To`. Add a literal-email case (regression guard) and a mixed
  alias+literal case.
- Manual: `draft create --to <alias>` → read the Drafts message back → `To` is the expanded address;
  then `draft send` that draft (to self) succeeds.
- Check `draft create --cc <alias>` / `--bcc <alias>` too (same code path, same fix covers them).

## Related

Same family as the deferred-but-different perf notes are not related; this is correctness. See the
other open blocker [[2026-09-27_imap-connection-timeout-hang]]. Both should clear before tagging
`v1.0.0`.
