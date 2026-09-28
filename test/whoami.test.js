import { describe, it, expect } from 'vitest';
import { runWhoami } from '../src/commands/whoami.js';
import { resolveCapabilities } from '../src/capabilities.js';

describe('runWhoami', () => {
  const profile = { name: 'biz', legacy: false, credentialsPath: '/c.json',
    capabilities: resolveCapabilities({ capabilities: ['read', 'draft'] }) };

  it('reports profile, account, mode, and capabilities', async () => {
    const deps = { resolveProfile: () => profile, resolveCredentials: () => ({ user: 'biz@x.com' }) };
    const r = await runWhoami({}, deps);
    expect(r).toMatchObject({ profile: 'biz', account: 'biz@x.com', mode: 'allow' });
    expect(r.capabilities.sort()).toEqual(['draft', 'read']);
  });

  it('still reports caps when credentials are missing', async () => {
    const deps = { resolveProfile: () => profile,
      resolveCredentials: () => { throw new Error('no creds'); } };
    const r = await runWhoami({}, deps);
    expect(r.account).toBeNull();
    expect(r.profile).toBe('biz');
  });
});
