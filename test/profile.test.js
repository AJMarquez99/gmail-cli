import { describe, it, expect } from 'vitest';
import { resolveProfile } from '../src/profile.js';
import { InvalidInputError } from '../src/lib/errors.js';
const ENV = { HOME: '/h' };

describe('resolveProfile — legacy (no profiles)', () => {
  it('returns the flat single-account paths + top-level identity/enforce/sendLog', () => {
    const config = { fromName: 'Me', replyTo: 'me@x.com', signature: { text: 's' }, allowlist: { enforce: false }, sendLog: { logBody: true } };
    const p = resolveProfile({ env: ENV, config, name: undefined });
    expect(p.name).toBe('(default)');
    expect(p.credentialsPath).toBe('/h/.config/gmail-cli/credentials.json');
    expect(p.allowlistPath).toBe('/h/.config/gmail-cli/allowlist.json');
    expect(p.sendLogPath).toBe('/h/.config/gmail-cli/sent.jsonl');
    expect(p.fromName).toBe('Me');
    expect(p.replyTo).toBe('me@x.com');
    expect(p.allowlistEnforce).toBe(false);     // from config.allowlist.enforce
    expect(p.sendLog).toEqual({ logBody: true });
  });
  it('legacy enforce defaults true when unset', () => {
    expect(resolveProfile({ env: ENV, config: {}, name: undefined }).allowlistEnforce).toBe(true);
  });
});

describe('resolveProfile — profile mode', () => {
  const config = {
    defaultProfile: 'personal',
    profiles: {
      personal: {},
      work: { fromName: 'Work', replyTo: 'w@co.com', allowlist: { enforce: false }, sendLog: { logBody: true },
              credentialsPath: '~/.config/gmail-cli/creds-work.json' },
    },
  };
  it('flag selects the named profile; ~ expands; explicit path honored', () => {
    const p = resolveProfile({ env: ENV, config, name: 'work' });
    expect(p.name).toBe('work');
    expect(p.credentialsPath).toBe('/h/.config/gmail-cli/creds-work.json');
    expect(p.allowlistPath).toBe('/h/.config/gmail-cli/allowlist-work.json'); // suffixed default
    expect(p.sendLogPath).toBe('/h/.config/gmail-cli/sent-work.jsonl');        // suffixed default
    expect(p.fromName).toBe('Work');
    expect(p.allowlistEnforce).toBe(false);
  });
  it('GMAIL_PROFILE used when no flag', () => {
    expect(resolveProfile({ env: { ...ENV, GMAIL_PROFILE: 'work' }, config, name: undefined }).name).toBe('work');
  });
  it('defaultProfile used when no flag/env', () => {
    expect(resolveProfile({ env: ENV, config, name: undefined }).name).toBe('personal');
  });
  it('suffixed default paths when a profile omits them', () => {
    const p = resolveProfile({ env: ENV, config, name: 'personal' });
    expect(p.credentialsPath).toBe('/h/.config/gmail-cli/credentials-personal.json');
    expect(p.allowlistPath).toBe('/h/.config/gmail-cli/allowlist-personal.json');
    expect(p.sendLogPath).toBe('/h/.config/gmail-cli/sent-personal.jsonl');
    expect(p.allowlistEnforce).toBe(true); // default
  });
  it('throws on unknown profile name', () => {
    expect(() => resolveProfile({ env: ENV, config, name: 'ghost' })).toThrow(/ghost/);
    expect(() => resolveProfile({ env: ENV, config, name: 'ghost' })).toThrow(InvalidInputError);
  });
});

describe('resolveProfile — sole profile & ambiguity', () => {
  it('auto-selects the sole profile when no default/flag/env', () => {
    const config = { profiles: { only: {} } };
    expect(resolveProfile({ env: ENV, config, name: undefined }).name).toBe('only');
  });
  it('errors when multiple profiles and no default/flag/env', () => {
    const config = { profiles: { a: {}, b: {} } };
    expect(() => resolveProfile({ env: ENV, config, name: undefined })).toThrow(InvalidInputError);
    expect(() => resolveProfile({ env: ENV, config, name: undefined })).toThrow(/--profile/);
  });
});
