import { describe, it, expect, vi } from 'vitest';
import { runDoctor } from '../src/commands/doctor.js';
import { MissingCredentialsError } from '../src/lib/errors.js';
import { resolveProfile } from '../src/profile.js';

const allow = (n) => vi.fn(() => ({ recipients: Array.from({ length: n }, (_, i) => ({ email: `r${i}@x.com` })) }));

function makeDoctorDeps({ resolveCredentialsFn, createTransportFn, allowlistCount, cfgObj = {} } = {}) {
  return {
    resolveCredentials: resolveCredentialsFn,
    resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config: cfgObj, name }),
    createTransport: createTransportFn,
    loadAllowlist: allow(allowlistCount),
  };
}

describe('runDoctor', () => {
  it('reports ok when credentials resolve and SMTP verifies, including allowlist size and enforce status', async () => {
    const transporter = { verify: vi.fn(async () => true) };
    const deps = makeDoctorDeps({
      resolveCredentialsFn: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      createTransportFn: vi.fn(() => transporter),
      allowlistCount: 2,
    });
    const out = await runDoctor({}, deps);
    expect(out).toEqual({
      ok: true,
      profile: '(default)',
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
    const deps = makeDoctorDeps({
      resolveCredentialsFn: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      createTransportFn: vi.fn(() => transporter),
      allowlistCount: 0,
    });
    const out = await runDoctor({}, deps);
    expect(out).toEqual({
      ok: false,
      profile: '(default)',
      user: 'a@gmail.com',
      source: 'env',
      credentials: 'ok',
      smtp: 'Invalid login: 535',
      allowlist: 0,
      allowlistEnforced: true,
    });
  });

  it('reports missing credentials without throwing and skips SMTP', async () => {
    const createTransport = vi.fn();
    const deps = makeDoctorDeps({
      resolveCredentialsFn: vi.fn(() => { throw new MissingCredentialsError('/p/creds.json'); }),
      createTransportFn: createTransport,
      allowlistCount: 1,
    });
    const out = await runDoctor({}, deps);
    expect(out.ok).toBe(false);
    expect(out.profile).toBe('(default)');
    expect(out.credentials).toBe('missing');
    expect(out.smtp).toBe('skipped');
    expect(out.allowlist).toBe(1);
    expect(out.allowlistEnforced).toBe(true);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('reports allowlistEnforced false when config sets allowlist.enforce to false', async () => {
    const transporter = { verify: vi.fn(async () => true) };
    const deps = makeDoctorDeps({
      resolveCredentialsFn: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      createTransportFn: vi.fn(() => transporter),
      allowlistCount: 3,
      cfgObj: { allowlist: { enforce: false } },
    });
    const out = await runDoctor({}, deps);
    expect(out.allowlistEnforced).toBe(false);
    expect(out.allowlist).toBe(3);
  });

  it('reports the named profile when profiles config is active', async () => {
    const transporter = { verify: vi.fn(async () => true) };
    const cfgObj = {
      defaultProfile: 'work',
      profiles: { work: { fromName: 'Work Account', allowlist: { enforce: false } } },
    };
    const deps = makeDoctorDeps({
      resolveCredentialsFn: vi.fn(() => ({ user: 'work@gmail.com', appPassword: 'pw', source: 'env' })),
      createTransportFn: vi.fn(() => transporter),
      allowlistCount: 0,
      cfgObj,
    });
    const out = await runDoctor({}, deps);
    expect(out.profile).toBe('work');
    expect(out.allowlistEnforced).toBe(false);
    expect(out.ok).toBe(true);
  });

  it('returns a structured envelope (does not throw) when the profile is ambiguous', async () => {
    const cfgObj = { profiles: { a: {}, b: {} } }; // two profiles, no default/flag/env
    const deps = makeDoctorDeps({
      resolveCredentialsFn: vi.fn(),
      createTransportFn: vi.fn(),
      allowlistCount: 0,
      cfgObj,
    });
    const out = await runDoctor({}, deps);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/--profile/);
    expect(deps.resolveCredentials).not.toHaveBeenCalled();
  });
});
