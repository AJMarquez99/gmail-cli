import { describe, it, expect, vi } from 'vitest';
import { runDoctor } from '../src/commands/doctor.js';
import { MissingCredentialsError } from '../src/lib/errors.js';
import { resolveProfile } from '../src/profile.js';
import { resolveCapabilities } from '../src/capabilities.js';

const allow = (n) => vi.fn(() => ({ recipients: Array.from({ length: n }, (_, i) => ({ email: `r${i}@x.com` })) }));

function makeImapClient({ throwOnConnect = false } = {}) {
  return {
    async connect() {
      if (throwOnConnect) throw new Error('IMAP connect failed');
    },
    async logout() {},
  };
}

function makeDoctorDeps({ resolveCredentialsFn, createTransportFn, allowlistCount, cfgObj = {}, imapClient = makeImapClient() } = {}) {
  return {
    resolveCredentials: resolveCredentialsFn,
    resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config: cfgObj, name }),
    createTransport: createTransportFn,
    loadAllowlist: allow(allowlistCount),
    createImapClient: vi.fn(() => imapClient),
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
      imap: 'ok',
      allowlist: 2,
      allowlistEnforced: true,
      mode: 'unrestricted',
      capabilities: ['read', 'organize', 'draft', 'send', 'delete'],
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
      imap: 'ok',
      allowlist: 0,
      allowlistEnforced: true,
      mode: 'unrestricted',
      capabilities: ['read', 'organize', 'draft', 'send', 'delete'],
    });
  });

  it('reports missing credentials without throwing and skips SMTP and IMAP', async () => {
    const createTransport = vi.fn();
    const createImapClient = vi.fn();
    const deps = {
      resolveCredentials: vi.fn(() => { throw new MissingCredentialsError('/p/creds.json'); }),
      resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config: {}, name }),
      createTransport,
      loadAllowlist: allow(1),
      createImapClient,
    };
    const out = await runDoctor({}, deps);
    expect(out.ok).toBe(false);
    expect(out.profile).toBe('(default)');
    expect(out.credentials).toBe('missing');
    expect(out.smtp).toBe('skipped');
    expect(out.imap).toBe('skipped');
    expect(out.allowlist).toBe(1);
    expect(out.allowlistEnforced).toBe(true);
    expect(createTransport).not.toHaveBeenCalled();
    expect(createImapClient).not.toHaveBeenCalled();
  });

  it('does not throw on a non-MissingCredentials credential error; reports credentials: "error" and skips SMTP/IMAP', async () => {
    const createTransport = vi.fn();
    const createImapClient = vi.fn();
    const deps = {
      resolveCredentials: vi.fn(() => { throw new Error('boom'); }),
      resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config: {}, name }),
      createTransport,
      loadAllowlist: allow(0),
      createImapClient,
    };
    await expect(runDoctor({}, deps)).resolves.toBeDefined();
    const out = await runDoctor({}, deps);
    expect(out.ok).toBe(false);
    expect(out.credentials).toBe('error');
    expect(out.smtp).toBe('skipped');
    expect(out.imap).toBe('skipped');
    expect(out.error).toBe('boom');
    expect(out.allowlist).toBe(0);
    expect(out.allowlistEnforced).toBe(true);
    expect(createTransport).not.toHaveBeenCalled();
    expect(createImapClient).not.toHaveBeenCalled();
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
    expect(out.imap).toBe('skipped');
    expect(deps.resolveCredentials).not.toHaveBeenCalled();
  });

  it('calls resolveCredentials with {} (no path) in legacy mode', async () => {
    const transporter = { verify: vi.fn(async () => true) };
    const deps = makeDoctorDeps({
      resolveCredentialsFn: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      createTransportFn: vi.fn(() => transporter),
      allowlistCount: 0,
    });
    await runDoctor({}, deps);
    expect(deps.resolveCredentials).toHaveBeenCalledWith({});
  });

  it('calls resolveCredentials with { path } in profile mode', async () => {
    const transporter = { verify: vi.fn(async () => true) };
    const cfgObj = {
      defaultProfile: 'work',
      profiles: { work: { credentialsPath: '/custom/work-creds.json' } },
    };
    const deps = makeDoctorDeps({
      resolveCredentialsFn: vi.fn(() => ({ user: 'work@gmail.com', appPassword: 'pw', source: 'file' })),
      createTransportFn: vi.fn(() => transporter),
      allowlistCount: 0,
      cfgObj,
    });
    await runDoctor({}, deps);
    expect(deps.resolveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/custom/work-creds.json' }),
    );
  });

  it('does not throw when allowlist load raises a non-ENOENT error; reports allowlist count as 0', async () => {
    const transporter = { verify: vi.fn(async () => true) };
    const accessError = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    const deps = {
      resolveCredentials: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config: {}, name }),
      createTransport: vi.fn(() => transporter),
      loadAllowlist: vi.fn(() => { throw accessError; }),
      createImapClient: vi.fn(() => makeImapClient()),
    };
    const out = await runDoctor({}, deps);
    expect(out.allowlist).toBe(0);
    expect(out.ok).toBe(true);
  });

  // -------------------------------------------------------------------------
  // New IMAP-specific tests
  // -------------------------------------------------------------------------

  it('reports imap: "ok" when IMAP connect succeeds', async () => {
    const transporter = { verify: vi.fn(async () => true) };
    const deps = makeDoctorDeps({
      resolveCredentialsFn: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      createTransportFn: vi.fn(() => transporter),
      allowlistCount: 0,
    });
    const out = await runDoctor({}, deps);
    expect(out.imap).toBe('ok');
    expect(out.ok).toBe(true);
  });

  it('reports imap: <error message> and ok: false when IMAP connect throws', async () => {
    const transporter = { verify: vi.fn(async () => true) };
    const deps = makeDoctorDeps({
      resolveCredentialsFn: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      createTransportFn: vi.fn(() => transporter),
      allowlistCount: 0,
      imapClient: makeImapClient({ throwOnConnect: true }),
    });
    const out = await runDoctor({}, deps);
    expect(out.imap).toBe('IMAP connect failed');
    expect(out.ok).toBe(false);
  });

  it('does not throw when IMAP connect fails — imap error does not propagate', async () => {
    const transporter = { verify: vi.fn(async () => true) };
    const deps = makeDoctorDeps({
      resolveCredentialsFn: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      createTransportFn: vi.fn(() => transporter),
      allowlistCount: 0,
      imapClient: makeImapClient({ throwOnConnect: true }),
    });
    // Must not throw — must resolve normally
    await expect(runDoctor({}, deps)).resolves.toBeDefined();
  });

  it('reports imap: "skipped" when credentials are missing', async () => {
    const deps = {
      resolveCredentials: vi.fn(() => { throw new MissingCredentialsError('/p/creds.json'); }),
      resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config: {}, name }),
      createTransport: vi.fn(),
      loadAllowlist: allow(0),
      createImapClient: vi.fn(),
    };
    const out = await runDoctor({}, deps);
    expect(out.imap).toBe('skipped');
    expect(deps.createImapClient).not.toHaveBeenCalled();
  });

  it('overall ok is false when SMTP is ok but IMAP fails', async () => {
    const transporter = { verify: vi.fn(async () => true) };
    const deps = makeDoctorDeps({
      resolveCredentialsFn: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      createTransportFn: vi.fn(() => transporter),
      allowlistCount: 0,
      imapClient: makeImapClient({ throwOnConnect: true }),
    });
    const out = await runDoctor({}, deps);
    expect(out.smtp).toBe('ok');
    expect(out.imap).not.toBe('ok');
    expect(out.ok).toBe(false);
  });

  it('overall ok is false when SMTP fails even if IMAP would succeed', async () => {
    const transporter = { verify: vi.fn(async () => { throw new Error('auth failed'); }) };
    const deps = makeDoctorDeps({
      resolveCredentialsFn: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      createTransportFn: vi.fn(() => transporter),
      allowlistCount: 0,
    });
    const out = await runDoctor({}, deps);
    expect(out.smtp).not.toBe('ok');
    expect(out.ok).toBe(false);
  });

  it('surfaces mode and capabilities from the resolved profile', async () => {
    const caps = resolveCapabilities({ capabilities: ['read'] });
    const transporter = { verify: vi.fn(async () => true) };
    const deps = {
      resolveCredentials: vi.fn(() => ({ user: 'a@gmail.com', appPassword: 'pw', source: 'env' })),
      resolveProfile: vi.fn(() => ({
        name: 'scoped',
        credentialsPath: '/h/.config/gmail-cli/credentials-scoped.json',
        allowlistPath: '/h/.config/gmail-cli/allowlist-scoped.json',
        sendLogPath: '/h/.config/gmail-cli/sent-scoped.jsonl',
        fromName: null,
        replyTo: null,
        signature: null,
        allowlistEnforce: true,
        sendLog: {},
        capabilities: caps,
        legacy: false,
        imap: {},
      })),
      createTransport: vi.fn(() => transporter),
      loadAllowlist: allow(0),
      createImapClient: vi.fn(() => makeImapClient()),
    };
    const out = await runDoctor({}, deps);
    expect(out.mode).toBe('allow');
    expect(out.capabilities).toContain('read');
  });
});
