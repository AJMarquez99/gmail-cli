// test/profile-caps.test.js
import { describe, it, expect } from 'vitest';
import { runProfileCaps } from '../src/commands/profile.js';

function makeDeps(initial) {
  const store = { json: JSON.stringify(initial) };
  return {
    env: { HOME: '/h' },
    readFile: () => store.json,
    writeFile: (_p, data) => { store.json = data; },
    ensureDir: () => {},
    _store: store,
  };
}

describe('runProfileCaps', () => {
  it('sets an allowlist', async () => {
    const deps = makeDeps({ profiles: { biz: {} } });
    const r = await runProfileCaps({ name: 'biz', allow: 'read,organize,draft' }, deps);
    expect(r.mode).toBe('allow');
    expect(r.capabilities.sort()).toEqual(['draft', 'organize', 'read']);
    expect(JSON.parse(deps._store.json).profiles.biz.capabilities).toEqual(['read', 'organize', 'draft']);
  });
  it('sets a denylist and clears any prior allowlist', async () => {
    const deps = makeDeps({ profiles: { biz: { capabilities: ['read'] } } });
    const r = await runProfileCaps({ name: 'biz', deny: 'send,delete' }, deps);
    expect(r.mode).toBe('deny');
    const saved = JSON.parse(deps._store.json).profiles.biz;
    expect(saved.deny).toEqual(['send', 'delete']);
    expect(saved.capabilities).toBeUndefined();
  });
  it('shows current when no flags', async () => {
    const deps = makeDeps({ profiles: { biz: { capabilities: ['read'] } } });
    const r = await runProfileCaps({ name: 'biz' }, deps);
    expect(r.mode).toBe('allow');
    expect(r.capabilities).toEqual(['read']);
  });
  it('rejects unknown bucket', async () => {
    const deps = makeDeps({ profiles: { biz: {} } });
    await expect(runProfileCaps({ name: 'biz', allow: 'read,bogus' }, deps)).rejects.toThrow(/bogus/);
  });
  it('rejects both --allow and --deny', async () => {
    const deps = makeDeps({ profiles: { biz: {} } });
    await expect(runProfileCaps({ name: 'biz', allow: 'read', deny: 'send' }, deps))
      .rejects.toThrow(/either/i);
  });
  it('rejects unknown profile', async () => {
    const deps = makeDeps({ profiles: {} });
    await expect(runProfileCaps({ name: 'ghost', allow: 'read' }, deps)).rejects.toThrow(/ghost/);
  });
});
