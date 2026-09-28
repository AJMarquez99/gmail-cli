# Note: `gmail config set` double-prefixes profile-qualified dotted keys

**Captured:** 2026-09-26 · **Status:** open, patch deferred by request · **Priority:** medium-high

## Symptom

Passing a fully-qualified key to `gmail config set` silently writes it one level too deep, nested
under the *active* profile:

```bash
# default profile is "personal"
gmail config set profiles.work.fromName "Full Name"
gmail config set profiles.work.replyTo  "you@example.com"
```

produced

```json
{
  "profiles": {
    "personal": { "profiles": { "work": { "fromName": "…", "replyTo": "…" } } },
    "work": { "deny": ["send", "delete"] }
  },
  "defaultProfile": "personal"
}
```

`resolveProfile()` reads `profiles.work.*`, so both values were **silently ignored** — no
error, no warning at the point of use. Observed live in `~/.config/gmail-cli/config.json` while
onboarding the `work` profile; repaired by hand (backup at
`~/.config/gmail-cli/config.json.bak-<timestamp>`).

The correct invocation today is the bare key plus the flag:

```bash
gmail config set fromName "Full Name" --profile work
```

## Root cause

`keyPath()` unconditionally prepends the active profile, with no check for whether the caller
already qualified the key:

```js
// src/commands/config.js
function keyPath(profile, key) {
  if (profile.name === '(default)') return key;
  return `profiles.${profile.name}.${key}`;   // <-- 'profiles.work.fromName' becomes
}                                             //     'profiles.personal.profiles.work.fromName'
```

Three things conspire to keep it invisible:

1. **`get` and `unset` share `keyPath()`**, so a round-trip is self-consistent — `config get
   profiles.work.fromName` returns the value it just mis-wrote. You cannot detect the fault by
   reading back what you wrote; only by dumping the raw file or by noticing the setting has no
   effect.
2. **The only signal is soft.** `KNOWN_KEYS` holds bare keys only, so any dotted profile-qualified
   key yields `unknownKey: true` in the JSON envelope. Non-fatal, easy to miss, and it fires for
   legitimate path-override keys too, so it carries no real information.
3. **Nothing validates the resulting shape.** A `profiles` key can be written *inside* a profile,
   producing arbitrarily nestable config that `resolveProfile()` never reads.

## The README teaches the broken pattern

The Profiles section states: *"File paths can be overridden per-profile via `gmail config set`
(dotted keys such as `profiles.work.credentialsPath ~/secrets/work-creds.json`)."* That is exactly
the invocation that mis-writes. Whichever fix lands, this line has to change with it.

## Possible fixes (ranked by value-for-effort)

1. **Reject `profiles.`-prefixed keys in `set`/`unset`** with an error naming the right form
   (`gmail config set fromName "…" --profile work`). Smallest change, turns a silent mis-write into
   a fixable exit 2. Loses the ability to target another profile in one command.
2. **Treat a `profiles.<name>.<key>` prefix as an absolute path** and honor it verbatim, with
   `--profile` remaining the default scope for bare keys. Matches what the README already promises
   and what a user reaches for naturally; slightly more logic, and needs `get`/`unset` to agree.
3. **Extend `KNOWN_KEYS`** to cover the real per-profile keys (`credentialsPath`, `allowlistPath`,
   `sendLogPath`, `rulesPath`, `imap.host`, `imap.port`, `capabilities`, `deny`) so `unknownKey`
   stops crying wolf on valid keys and starts meaning something.
4. **Fix the README** to document whichever of #1/#2 ships.

**Open question before patching:** #1 or #2 — is a fully-qualified key meant to be an error, or a
supported way to configure a profile you are not currently on? #2 is friendlier and matches the
docs; #1 is stricter and smaller. Pick one, then do #3 and #4 alongside it.

## Suggested verification

- Unit: `config set profiles.work.fromName X` with active profile `personal` → either throws
  (option 1) or writes `profiles.work.fromName` (option 2). Assert `profiles.personal.profiles` is
  never created under any path.
- Unit: `config set fromName X --profile work` still writes `profiles.work.fromName` (regression
  guard on the happy path).
- Unit: `get`/`unset` agree with whichever semantics `set` adopts — the round-trip must not be
  self-consistently wrong.
- Manual: dump raw `config.json` after a set, not just `config get`.

## Related

Same family as a second finding from the same session: **`resolveProfile()` never returns an `imap`
key**, so the `profiles.<name>.imap` host/port overrides documented in the README (and assumed by
`read.js:13`, `draft.js:31`, `doctor.js:60`, all of which pass `profile.imap || {}`) are silently
dropped. Both bugs are "per-profile config accepted, then never applied." Worth fixing in one pass,
and note that [[imap-connection-timeout-hang]] fix #1 assumes that `imapOpts` spread is wired
through `profile.imap` — it is not, so that note's premise needs correcting too.
