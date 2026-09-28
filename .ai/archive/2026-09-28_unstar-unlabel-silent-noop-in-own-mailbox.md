# Note: removing a label from inside that label's own mailbox is a silent no-op

**Captured:** 2026-09-28 · **Status:** reproduced on live mail during v1.0.0 verification · **Priority:** high

## Symptom

Same trap as the archive bug (see
[[2026-09-27_archive-silent-noop-gmail-hides-selected-mailbox-label]]): Gmail hides the label that
corresponds to the currently-selected mailbox, so a `-X-GM-LABELS` STORE for that label answers
`OK` and changes nothing.

Reproduced with a self-addressed test message:

```
gmail mark <uid> --star --mailbox "[Gmail]/All Mail"     → [Gmail]/Starred total: 1
gmail mark <uid> --unstar --mailbox "[Gmail]/Starred"    → { "action": "unstarred" }, exit 0
gmail read count --mailbox "[Gmail]/Starred"             → total: 1   (unchanged)
labels (seen from All Mail)                              → \Sent, \Starred  (still starred)
gmail mark <uid> --unstar --mailbox "[Gmail]/All Mail"   → Starred total: 0  (works)
```

## Affected paths (by construction; only unstar was run live)

- `gmail mark --unstar --mailbox "[Gmail]/Starred"` (`starMessage`, on=false)
- `gmail mark --unimportant --mailbox "[Gmail]/Important"` (`importantMessage`, on=false)
- `gmail label remove <uid> <L> --mailbox <L>` (`removeLabel` when `label === mailbox`)
- rules: `unlabel:<L>` on a rule whose `mailbox` is `<L>`

## Fix direction

When the label being removed equals the selected mailbox, removing it means *leaving that
mailbox*: MOVE the UIDs to `[Gmail]/All Mail` (reuse the verified-move helper in `src/writer.js`),
which drops exactly that label and keeps the others. For `\Starred`, removing the IMAP `\Flagged`
system flag (no `useLabels`) is an alternative that works from any mailbox. Add a regression test
that no writer STOREs `-<label>` while `<label>` is the selected mailbox.

Relates to [[reply-no-quote-header-only-fetch]], [[rules-engine-mailboxopen-dedup]].
