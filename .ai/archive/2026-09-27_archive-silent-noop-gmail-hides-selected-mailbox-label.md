# Note: `archive` is a silent no-op — Gmail hides the selected mailbox's own label

**Captured:** 2026-09-26 · **Status:** root cause proven, fix verified on live mail, patch deferred
· **Priority:** HIGH — never published; found on a source install of 1.0.0 before release

## Symptom

Every archive path reports success and changes nothing:

```
gmail rules apply --profile work
  → archived: 1000 | errors: 0
gmail read count --profile work
  → { "total": 2000 }     # unchanged. Not one message left INBOX.
```

Affects `gmail archive`, any rule carrying `--archive`, and therefore the headline feature of the
`organize` capability. **Not environment-specific — this has never worked in any version.**

## Root cause

`src/writer.js` opens INBOX and then asks Gmail to remove the `\Inbox` label *from inside INBOX*:

```js
export async function archiveMessage(client, { uid, mailbox = 'INBOX' } = {}) {
  await client.mailboxOpen(mailbox);                       // selects INBOX
  await client.messageFlagsRemove(toRange(uid), ['\\Inbox'], { uid: true, useLabels: true });
  return { uid: toUid(uid), mailbox, action: 'archived' }; // returns unconditionally
}
```

**Gmail omits the label corresponding to the currently-selected mailbox from `X-GM-LABELS`.** With
INBOX selected, `\Inbox` is implicit and therefore invisible — and a label you cannot see is a label
you cannot remove. Verified directly, same message (uid `<uid>`), two vantage points:

```
selected=INBOX             labels: Team/Alerts
selected=[Gmail]/All Mail  labels: \Inbox | Team/Alerts
```

The wire traffic confirms the command itself is well-formed — this is not a quoting or atom-escaping
bug, and imapflow's `useLabels` works fine:

```
C: B UID STORE <uid> -X-GM-LABELS (\Inbox)
S: B OK Success
```

Gmail answers `OK` because removing an absent label is a legitimate no-op. Nothing anywhere in the
stack has reason to complain.

## The fix (verified, not yet applied)

Use Gmail's documented archive idiom — MOVE to All Mail — reusing the `messageMove` path that
already exists eight lines below in the same file:

```js
export async function archiveMessage(client, { uid, mailbox = 'INBOX' } = {}) {
  await client.mailboxOpen(mailbox);
  await client.messageMove(toRange(uid), '[Gmail]/All Mail', { uid: true });
  return { uid: toUid(uid), mailbox, action: 'archived' };
}
```

Proven against the live mailbox before deferring: `you@example.com` in INBOX went 300 → 299, the
message survived in All Mail with a new UID, and its `Team/Alerts` label was preserved (label count
stayed at 300). MOVE drops only the INBOX label; it destroys nothing.

Consider hoisting `'[Gmail]/All Mail'` to a named export beside the existing `TRASH` and `DRAFTS`
constants (`ALL_MAIL`), for consistency with how the other system mailboxes are handled.

## Secondary bug — the engine cannot tell success from silence

Worth fixing in the same pass, but it is a *separate* defect from the root cause above. In
`src/rules/engine.js`, a rule is recorded as applied whenever `runAction` does not throw:

```js
await runAction(client, a, { uid: uids, mailbox }, deps);
for (const uid of uids) entry.applied.push({ uid, action: a.raw });   // assumes success
```

So the engine confidently reported **1,000 archives that never happened**. Every writer in
`writer.js` returns a hand-built object rather than anything derived from the server's response, so
there is currently no layer that could have caught this. Options, cheapest first:

1. Have `archiveMessage` verify — `messageMove` returns a `uidMap`; assert it covers the requested
   UIDs and throw when it does not.
2. Post-apply verification in the engine: re-run the rule's search after acting and assert the match
   count moved in the expected direction. Catches this whole class of silent failure, not just
   archive.
3. At minimum, stop reporting per-UID `applied` entries that were never confirmed.

## Suggested verification

- **Unit (write first, must fail against current code):** stub client; assert `archiveMessage` issues
  a move to `[Gmail]/All Mail` and does *not* call `messageFlagsRemove` with `\Inbox`.
- **Unit:** assert the returned shape is unchanged so `rules apply` reporting stays stable.
- **Regression guard:** a test asserting no writer removes a system label matching the mailbox it
  just selected — the general trap this bug fell into.
- **Manual:** `gmail archive <uid>` then `gmail read count`; the total must actually drop.

## Impact / release

`archive` is advertised in the README, gated behind the `organize` capability, and exposed through
the rules engine and the MCP surface — all of it inert. Never published to npm; found on a source
install of 1.0.0 during pre-release testing, so no external user was affected. Must clear before
tagging, with a plain changelog line, not a quiet fix.

## Related

Third finding in the same family as [[config-set-double-prefixes-dotted-profile-keys]] — an
operation is accepted, reported as successful, and silently does nothing. That note also records the
`resolveProfile()` dropped-`imap` bug. A hardening pass over "we returned success, but did we verify
it?" would catch all three; see also [[imap-connection-timeout-hang]].
