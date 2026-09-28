import { describe, it, expect, vi } from 'vitest';
import { isBoundaryLocked } from '../src/lock.js';
import { runAllowAdd, runAllowRemove } from '../src/commands/allow.js';
import { runConfigSet, runConfigUnset } from '../src/commands/config.js';
import { runLogin } from '../src/commands/login.js';
import { runProfileAdd, runProfileRemove, runProfileCaps, runProfileUse } from '../src/commands/profile.js';
import { resolveRecipients, expandRecipients } from '../src/transmit.js';
import { BoundaryLockedError, EXIT_CODES } from '../src/lib/errors.js';
import { resolveProfile } from '../src/profile.js';
import { defaultDeps } from '../src/deps.js';

describe('isBoundaryLocked', () => {
  it('is true when GMAIL_CLI_LOCKED=1', () => {
    expect(isBoundaryLocked({ env: { GMAIL_CLI_LOCKED: '1' }, config: {} })).toBe(true);
  });
  it('is true when GMAIL_CLI_LOCKED=true', () => {
    expect(isBoundaryLocked({ env: { GMAIL_CLI_LOCKED: 'true' }, config: {} })).toBe(true);
  });
  it('is true when config.locked is true', () => {
    expect(isBoundaryLocked({ env: {}, config: { locked: true } })).toBe(true);
  });
  it('is false by default', () => {
    expect(isBoundaryLocked({ env: {}, config: {} })).toBe(false);
  });
  it('is false for GMAIL_CLI_LOCKED=0 and a non-boolean config.locked', () => {
    expect(isBoundaryLocked({ env: { GMAIL_CLI_LOCKED: '0' }, config: { locked: 'yes' } })).toBe(false);
  });
  it('is wired onto defaultDeps', () => {
    expect(typeof defaultDeps.isBoundaryLocked).toBe('function');
  });
});

describe('BoundaryLockedError', () => {
  it('exits 3 (FORBIDDEN) and names the control, not a value', () => {
    const e = new BoundaryLockedError('editing the allowlist');
    expect(e.exitCode).toBe(EXIT_CODES.FORBIDDEN);
    expect(e.exitCode).toBe(3);
    expect(e.message).toMatch(/GMAIL_CLI_LOCKED/);
    expect(e.message).toMatch(/editing the allowlist/);
  });
});

const locked = { isBoundaryLocked: () => true };
const enoent = () => {
  const e = new Error('no');
  e.code = 'ENOENT';
  throw e;
};
const cfgDeps = (file) => ({
  ...locked,
  env: { HOME: '/h' },
  resolveProfile: (n) => resolveProfile({ env: { HOME: '/h' }, config: file ? JSON.parse(file) : {}, name: n }),
  readFile: file ? vi.fn(() => file) : vi.fn(enoent),
  writeFile: vi.fn(),
  ensureDir: vi.fn(),
});

describe('locked boundary refuses agent-reachable widening', () => {
  it('allow add refuses with exit 3', async () => {
    const deps = { ...locked, resolveProfile: (n) => resolveProfile({ env: { HOME: '/h' }, config: {}, name: n }) };
    await expect(runAllowAdd({ email: 'a@b.com' }, deps)).rejects.toBeInstanceOf(BoundaryLockedError);
  });
  it('allow remove refuses with exit 3', async () => {
    const deps = { ...locked, resolveProfile: (n) => resolveProfile({ env: { HOME: '/h' }, config: {}, name: n }) };
    await expect(runAllowRemove({ target: 'a@b.com' }, deps)).rejects.toBeInstanceOf(BoundaryLockedError);
  });
  it('config set allowlist.enforce refuses with exit 3', async () => {
    const deps = cfgDeps();
    await expect(runConfigSet({ key: 'allowlist.enforce', value: 'false' }, deps)).rejects.toBeInstanceOf(BoundaryLockedError);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });
  it('config unset allowlist.enforce refuses with exit 3', async () => {
    const deps = cfgDeps();
    await expect(runConfigUnset({ key: 'allowlist.enforce' }, deps)).rejects.toBeInstanceOf(BoundaryLockedError);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });
  it('a fully-qualified profiles.<name>.allowlist.enforce cannot bypass the lock', async () => {
    const deps = cfgDeps(JSON.stringify({ profiles: { work: {} }, defaultProfile: 'work' }));
    await expect(runConfigSet({ key: 'profiles.work.allowlist.enforce', value: 'false' }, deps)).rejects.toBeInstanceOf(
      BoundaryLockedError,
    );
    await expect(runConfigUnset({ key: 'profiles.work.allowlist' }, deps)).rejects.toBeInstanceOf(BoundaryLockedError);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });
  it.each(['allowlist', 'allowlistPath', 'credentialsPath', 'attachRoot', 'maxRecipients', 'locked', 'capabilities', 'deny', 'profiles'])(
    'config set/unset of boundary key %s refuses when locked',
    async (key) => {
      const deps = cfgDeps();
      await expect(runConfigSet({ key, value: 'x' }, deps)).rejects.toBeInstanceOf(BoundaryLockedError);
      await expect(runConfigUnset({ key }, deps)).rejects.toBeInstanceOf(BoundaryLockedError);
      expect(deps.writeFile).not.toHaveBeenCalled();
    },
  );
  it('config set defaultProfile is allowed when locked (same as `profile use`)', async () => {
    const deps = cfgDeps(JSON.stringify({ profiles: { work: {}, x: {} }, defaultProfile: 'work' }));
    const out = await runConfigSet({ key: 'defaultProfile', value: 'x' }, deps);
    expect(out.value).toBe('x');
    expect(JSON.parse(deps.writeFile.mock.calls[0][1])).toMatchObject({ defaultProfile: 'x' });
  });
  it('config set of a non-boundary key is still allowed when locked', async () => {
    const deps = cfgDeps();
    await runConfigSet({ key: 'fromName', value: 'Me' }, deps);
    expect(deps.writeFile).toHaveBeenCalled();
  });
  it('config set of allowlist-looking-but-distinct keys is not over-matched', async () => {
    const deps = cfgDeps();
    await runConfigSet({ key: 'sendLog.enabled', value: 'true' }, deps);
    expect(deps.writeFile).toHaveBeenCalled();
  });
  it('login refuses with exit 3', async () => {
    const deps = { ...locked, resolveProfile: (n) => resolveProfile({ env: { HOME: '/h' }, config: {}, name: n }) };
    await expect(runLogin({}, deps)).rejects.toBeInstanceOf(BoundaryLockedError);
  });
  it('profile caps --allow/--deny refuses, but showing caps is allowed', async () => {
    const deps = cfgDeps(JSON.stringify({ profiles: { work: { capabilities: ['read'] } } }));
    await expect(runProfileCaps({ name: 'work', allow: 'read,send' }, deps)).rejects.toBeInstanceOf(BoundaryLockedError);
    await expect(runProfileCaps({ name: 'work', deny: 'send' }, deps)).rejects.toBeInstanceOf(BoundaryLockedError);
    const shown = await runProfileCaps({ name: 'work' }, deps);
    expect(shown.name).toBe('work');
    expect(deps.writeFile).not.toHaveBeenCalled();
  });
  it('profile add/remove refuse; profile use (same as --profile) is allowed', async () => {
    const deps = cfgDeps(JSON.stringify({ profiles: { work: {}, home: {} }, defaultProfile: 'work' }));
    await expect(runProfileAdd({ name: 'new' }, deps)).rejects.toBeInstanceOf(BoundaryLockedError);
    await expect(runProfileRemove({ name: 'home' }, deps)).rejects.toBeInstanceOf(BoundaryLockedError);
    expect(deps.writeFile).not.toHaveBeenCalled();
    await runProfileUse({ name: 'home' }, deps);
    expect(deps.writeFile).toHaveBeenCalled();
  });
  it('a --no-allowlist send refuses with exit 3 when locked', () => {
    const ctx = { profile: { allowlistEnforce: true, allowlistPath: '/a' }, creds: { user: 'me@x.com' } };
    const deps = { ...locked, loadAllowlist: () => ({ recipients: [] }) };
    expect(() => resolveRecipients({ to: ['x@y.com'], cc: [], bcc: [] }, { noAllowlist: true }, ctx, deps)).toThrow(
      BoundaryLockedError,
    );
    expect(() => resolveRecipients({ to: ['x@y.com'], cc: [], bcc: [] }, { allowlist: false }, ctx, deps)).toThrow(
      BoundaryLockedError,
    );
  });
  it('a send with config allowlist.enforce:false refuses with exit 3 when locked', () => {
    const ctx = { profile: { allowlistEnforce: false, allowlistPath: '/a' }, creds: { user: 'me@x.com' } };
    const deps = { ...locked, loadAllowlist: () => ({ recipients: [] }) };
    expect(() => resolveRecipients({ to: ['x@y.com'], cc: [], bcc: [] }, {}, ctx, deps)).toThrow(BoundaryLockedError);
  });
  it('an enforced send is unaffected by the lock', () => {
    const ctx = { profile: { allowlistEnforce: true, allowlistPath: '/a' }, creds: { user: 'me@x.com' } };
    const deps = { ...locked, loadAllowlist: () => ({ recipients: [{ email: 'x@y.com' }] }) };
    const r = resolveRecipients({ to: ['x@y.com'], cc: [], bcc: [] }, {}, ctx, deps);
    expect(r.to).toContain('x@y.com');
  });
  it('draft alias expansion (non-transmitting) is unaffected by the lock', () => {
    const ctx = { profile: { allowlistEnforce: true, allowlistPath: '/a' }, creds: { user: 'me@x.com' } };
    const deps = { ...locked, loadAllowlist: () => ({ recipients: [{ email: 'x@y.com', aliases: ['xy'] }] }) };
    const r = expandRecipients({ to: ['xy', 'other@z.com'], cc: [], bcc: [] }, ctx, deps);
    expect(r.to).toEqual(['x@y.com', 'other@z.com']);
  });
});

describe('global keys (locked, defaultProfile) are top-level only', () => {
  const unlockedDeps = (file) => ({ ...cfgDeps(file), isBoundaryLocked: () => false });
  const written = (d) => JSON.parse(d.writeFile.mock.calls[0][1]);
  const profileCfg = JSON.stringify({ profiles: { work: {}, home: {} }, defaultProfile: 'work' });

  it('profile-mode `config set locked true` writes top-level locked and actually locks', async () => {
    const d = unlockedDeps(profileCfg);
    await runConfigSet({ key: 'locked', value: 'true' }, d);
    const w = written(d);
    expect(w.locked).toBe(true);
    expect(w.profiles.work.locked).toBeUndefined();
    expect(isBoundaryLocked({ env: {}, config: w })).toBe(true);
  });
  it('`--profile home config set locked true` still writes top-level', async () => {
    const d = unlockedDeps(profileCfg);
    await runConfigSet({ key: 'locked', value: 'true', profile: 'home' }, d);
    const w = written(d);
    expect(w.locked).toBe(true);
    expect(w.profiles.home.locked).toBeUndefined();
  });
  it('fully-qualified profiles.<name>.locked is rejected with exit 2', async () => {
    const d = unlockedDeps(profileCfg);
    const err = await runConfigSet({ key: 'profiles.work.locked', value: 'true' }, d).catch((e) => e);
    expect(err.exitCode).toBe(EXIT_CODES.CONFIG);
    expect(err.message).toMatch(/global key/);
    expect(d.writeFile).not.toHaveBeenCalled();
  });
  it('defaultProfile is top-level in profile mode; fully-qualified form is rejected with exit 2', async () => {
    const d = unlockedDeps(profileCfg);
    await runConfigSet({ key: 'defaultProfile', value: 'home' }, d);
    const w = written(d);
    expect(w.defaultProfile).toBe('home');
    expect(w.profiles.work.defaultProfile).toBeUndefined();
    const d2 = unlockedDeps(profileCfg);
    const err = await runConfigSet({ key: 'profiles.work.defaultProfile', value: 'home' }, d2).catch((e) => e);
    expect(err.exitCode).toBe(EXIT_CODES.CONFIG);
  });
  it('while locked, set locked false / unset locked still refuse with exit 3', async () => {
    const d = cfgDeps(JSON.stringify({ profiles: { work: {} }, locked: true }));
    await expect(runConfigSet({ key: 'locked', value: 'false' }, d)).rejects.toBeInstanceOf(BoundaryLockedError);
    await expect(runConfigUnset({ key: 'locked' }, d)).rejects.toBeInstanceOf(BoundaryLockedError);
    expect(d.writeFile).not.toHaveBeenCalled();
  });
});
