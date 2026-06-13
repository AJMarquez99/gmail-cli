# Runbook: Releasing to npm

How to cut a new release of `@ajmarquez99/gmail-cli`. The package publishes from a git tag via
GitHub Actions; a manual fallback is documented at the end.

## Prerequisites (one-time)

- The `@ajmarquez99` npm scope is claimed and the package name is available/owned.
- An npm **Automation** token is stored as the `NPM_TOKEN` repository secret
  (GitHub → Settings → Secrets and variables → Actions).
- The repo is public (scoped packages publish with `--access public`, already set via
  `publishConfig.access` in `package.json`).

If any of these are missing, the tag-driven publish will fail at the `npm publish` step — fix the
prerequisite, then re-push the tag.

## Standard release (tag-driven)

1. Make sure `main` is green and up to date:
   ```bash
   git checkout main && git pull && npm run test:run
   ```
2. Bump the version in **both** `package.json` and `package-lock.json` (use `npm version <patch|minor|major>`,
   which updates both and creates the commit + tag), or edit + `npm install` to sync the lockfile.
   Keep `--version` in `src/cli.js` (`buildProgram`) in step too — it's hard-coded there.
   - **Stop and check:** `package.json`, `package-lock.json` (both `version` fields), and the
     `.version('x.y.z')` call in `src/cli.js` must all match. A mismatch ships a wrong `--version`.
3. Push the commit and the tag:
   ```bash
   git push origin main
   git push origin vX.Y.Z      # npm version already created this tag
   ```
4. The **Release** workflow (`.github/workflows/release.yml`) fires on `v*` tags: checkout →
   `npm ci` → `npm run test:run` → `npm publish --access public` (auth via `NODE_AUTH_TOKEN` =
   `secrets.NPM_TOKEN`).
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

## Manual fallback (no tag / workflow unavailable)

```bash
git checkout main && git pull && npm run test:run
npm login                      # one-time auth on the machine
npm publish --access public    # belt-and-suspenders; access is also in publishConfig
```

## If it looks wrong, stop

- `npm publish` errors with 402/403 → scope/token/access problem; do **not** retry blindly, fix the
  prerequisite first.
- Version already exists on npm → npm forbids republishing the same version; bump and retry.
- Tests fail in the workflow → the publish step won't run (it's after `test:run`); fix on `main` and
  re-tag with a new version.
