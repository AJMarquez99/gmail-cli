import { describe, it, expect, vi } from 'vitest';
import { runDoctor } from '../src/commands/doctor.js';
import { MissingCredentialsError } from '../src/lib/errors.js';

const allow = (n) => vi.fn(() => ({ recipients: Array.from({ length: n }, (_, i) => ({ email: `r${i}@x.com` })) }));
const cfg = (obj = {}) => vi.fn(() => obj);

describe('runDoctor', () => {
  it('reports ok when credentials resolve and SMTP verifies, including allowlist size and enforce status', async () => {
    const transporter = { verify: vi.fn(async () => true) };
    const deps = {
      resolveCredentials: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      createTransport: vi.fn(() => transporter),
      loadAllowlist: allow(2),
      loadConfig: cfg({}),
    };
    const out = await runDoctor({}, deps);
    expect(out).toEqual({
      ok: true,
      user: 'a@gmail.com',
      source: 'env',
      credentials: 'ok',
      smtp: 'ok',
      allowlist: 2,
      allowlistEnforced: true,
    });
  });

  it('reports the SMTP error without throwing when verify fails', async () => {
    const transporter = { verify: vi.fn(async () => { throw new Error('Invalid login: 535'); }) };
    const deps = {
      resolveCredentials: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      createTransport: vi.fn(() => transporter),
      loadAllowlist: allow(0),
      loadConfig: cfg({}),
    };
    const out = await runDoctor({}, deps);
    expect(out).toEqual({
      ok: false,
      user: 'a@gmail.com',
      source: 'env',
      credentials: 'ok',
      smtp: 'Invalid login: 535',
      allowlist: 0,
      allowlistEnforced: true,
    });
  });

  it('reports missing credentials without throwing and skips SMTP', async () => {
    const deps = {
      resolveCredentials: vi.fn(() => { throw new MissingCredentialsError('/p/creds.json'); }),
      createTransport: vi.fn(),
      loadAllowlist: allow(1),
      loadConfig: cfg({}),
    };
    const out = await runDoctor({}, deps);
    expect(out.ok).toBe(false);
    expect(out.credentials).toBe('missing');
    expect(out.smtp).toBe('skipped');
    expect(out.allowlist).toBe(1);
    expect(out.allowlistEnforced).toBe(true);
    expect(deps.createTransport).not.toHaveBeenCalled();
  });

  it('reports allowlistEnforced false when config sets allowlist.enforce to false', async () => {
    const transporter = { verify: vi.fn(async () => true) };
    const deps = {
      resolveCredentials: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      createTransport: vi.fn(() => transporter),
      loadAllowlist: allow(3),
      loadConfig: cfg({ allowlist: { enforce: false } }),
    };
    const out = await runDoctor({}, deps);
    expect(out.allowlistEnforced).toBe(false);
    expect(out.allowlist).toBe(3);
  });
});
