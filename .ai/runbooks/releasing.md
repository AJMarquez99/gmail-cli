# Runbook: Releasing to npm

How to cut a new release of `@ajmarquez99/gmail-cli`.

**Publishing is automated.** Pushing a `vX.Y.Z` tag triggers the **Release** workflow
(`.github/workflows/release.yml`), which publishes via **trusted publishing (OIDC)** — there is
**no `NPM_TOKEN` and no stored secret**. GitHub Actions mints a short-lived, per-workflow token that
npm exchanges for a one-time publish credential, with **provenance** attached automatically
(public repo + public package). A manual fallback is documented at the end.

## How the auto-publish trust is wired (already configured)

On npmjs.com, one-time: package `@ajmarquez99/gmail-cli` → Settings → **Trusted Publisher** →
GitHub Actions, with **org `AJMarquez99` / repo `gmail-cli` / workflow `release.yml` / action
`npm publish`**. The trust is keyed to the workflow **filename** — if you rename `release.yml`,
update that npm config to match or publishing stops. No secret needs to be created or rotated.

## Standard release (tag-driven)

1. Make sure `main` is green and up to date:
   ```bash
   git checkout main && git pull && npm run test:run
   ```
2. Bump the version in **both** `package.json` and `package-lock.json` (use
   `npm version <patch|minor|major>`, which updates both and creates the commit + tag), or edit +
   `npm install` to sync the lockfile. Keep `--version` in `src/cli.js` (`buildProgram`) in step
   too — it's hard-coded there.
   - **Stop and check:** `package.json`, `package-lock.json` (both `version` fields), and the
     `.version('x.y.z')` call in `src/cli.js` must all match. A mismatch ships a wrong `--version`.
3. Push the commit and the tag — **this publishes**:
   ```bash
   git push origin main
   git push origin vX.Y.Z      # npm version already created this tag
   ```
4. The **Release** workflow fires on the `v*` tag: checkout → ensure npm ≥ 11.5.1 → `npm ci` →
   `npm run test:run` → `npm publish --access public` via the **OIDC** token (no `NODE_AUTH_TOKEN`).
   Watch it:
   ```bash
   gh run list --workflow release.yml --limit 1
   gh run watch
   ```
5. Verify: `npm view @ajmarquez99/gmail-cli version` shows the new version; install fresh
   (`npm i -g @ajmarquez99/gmail-cli`) and run `gmail --version`.

> If `npm version` already committed/tagged before you intended, you can amend the version files
> into the same commit, but never move a tag that's already been pushed and published.

## What ships

Only the `files` allowlist in `package.json`: `bin/`, `src/`, `README.md`, `LICENSE`. Tests,
`.github/`, and `.ai/` are **not** published. Sanity-check the tarball before a big release:

```bash
npm publish --dry-run     # lists the exact tarball contents; publishes nothing
```

## Manual fallback (workflow unavailable)

Only if Actions is down or the trusted-publisher config is broken:

```bash
git checkout main && git pull && npm run test:run
npm login                      # one-time auth on the machine
npm publish --access public    # access is also in publishConfig
```

## If it looks wrong, stop

- `npm publish` in the workflow errors 402/403 → trusted-publisher config mismatch (org/repo/
  workflow filename) or access problem; fix the npm-side config, don't retry blindly.
- Version already exists on npm → npm forbids republishing the same version; bump and retry.
- Tests fail in the workflow → the publish step won't run (it's after `test:run`); fix on `main`
  and re-tag with a new version.
