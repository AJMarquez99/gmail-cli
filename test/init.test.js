import { describe, it, expect, vi } from 'vitest';
import { runInit } from '../src/commands/init.js';
import { MissingCredentialsError } from '../src/lib/errors.js';
import { ALLOWLIST_TEMPLATE, CONFIG_TEMPLATE } from '../src/lib/templates.js';

// `exists` may be a boolean (applies to every path) or a Set of paths that exist.
function makeDeps({ exists = false, credsOk = false } = {}) {
  const existsFor = (p) => (exists instanceof Set ? exists.has(p) : exists);
  return {
    env: { HOME: '/h' },
    fileExists: vi.fn(existsFor),
    ensureDir: vi.fn(),
    writeFileIfAbsent: vi.fn(),
    chmod: vi.fn(),
    resolveCredentials: vi.fn(() => {
      if (credsOk) return { user: 'you@gmail.com' };
      throw new MissingCredentialsError('/h/.config/gmail-cli/credentials.json');
    }),
  };
}

describe('runInit', () => {
  it('scaffolds when files are absent', async () => {
    const deps = makeDeps({ exists: false, credsOk: false });
    const result = await runInit({}, deps);

    // both files reported as created
    expect(result.created).toContain('/h/.config/gmail-cli/allowlist.json');
    expect(result.created).toContain('/h/.config/gmail-cli/config.json');
    expect(result.skipped).toHaveLength(0);

    // ensureDir called for the config dir
    expect(deps.ensureDir).toHaveBeenCalledWith('/h/.config/gmail-cli');

    // writeFileIfAbsent called with correct content
    expect(deps.writeFileIfAbsent).toHaveBeenCalledWith(
      '/h/.config/gmail-cli/allowlist.json',
      ALLOWLIST_TEMPLATE,
      0o600,
    );
    expect(deps.writeFileIfAbsent).toHaveBeenCalledWith(
      '/h/.config/gmail-cli/config.json',
      CONFIG_TEMPLATE,
      0o600,
    );

    // Newly-created files are also chmod'd (belt-and-suspenders with the create-mode above).
    expect(deps.chmod).toHaveBeenCalledWith('/h/.config/gmail-cli/allowlist.json', 0o600);
    expect(deps.chmod).toHaveBeenCalledWith('/h/.config/gmail-cli/config.json', 0o600);
  });

  it('is non-clobbering / idempotent when files already exist', async () => {
    const deps = makeDeps({ exists: true, credsOk: true });
    const result = await runInit({}, deps);

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toContain('/h/.config/gmail-cli/allowlist.json');
    expect(result.skipped).toContain('/h/.config/gmail-cli/config.json');
  });

  it('re-tightens permissions on already-existing files too (upgrade self-heal via re-run)', async () => {
    const deps = makeDeps({ exists: true, credsOk: true });
    await runInit({}, deps);

    // `init` is safe/idempotent to re-run; a pre-hardening install's 0644 files get chmod'd to
    // 0600 even though their content is left untouched (writeFileIfAbsent skips the write).
    expect(deps.chmod).toHaveBeenCalledWith('/h/.config/gmail-cli/allowlist.json', 0o600);
    expect(deps.chmod).toHaveBeenCalledWith('/h/.config/gmail-cli/config.json', 0o600);
  });

  it('swallows a chmod failure and warns instead of throwing', async () => {
    const deps = makeDeps({ exists: true, credsOk: true });
    deps.chmod = vi.fn(() => { throw new Error('EPERM'); });
    deps.warn = vi.fn();
    await expect(runInit({}, deps)).resolves.toBeTruthy();
    expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('EPERM'));
  });

  it('scaffolds only the missing file when one already exists', async () => {
    const deps = makeDeps({
      exists: new Set(['/h/.config/gmail-cli/allowlist.json']),
      credsOk: true,
    });
    const result = await runInit({}, deps);

    expect(result.created).toEqual(['/h/.config/gmail-cli/config.json']);
    expect(result.skipped).toEqual(['/h/.config/gmail-cli/allowlist.json']);
  });

  it('reports credentials missing and includes apppasswords URL in nextSteps', async () => {
    const deps = makeDeps({ exists: true, credsOk: false });
    const result = await runInit({}, deps);

    expect(result.credentials).toBe('missing');
    const allSteps = result.nextSteps.join(' ');
    expect(allSteps).toContain('myaccount.google.com/apppasswords');
  });

  it('reports credentials ok when resolveCredentials succeeds', async () => {
    const deps = makeDeps({ exists: true, credsOk: true });
    const result = await runInit({}, deps);

    expect(result.credentials).toBe('ok');
  });
});
