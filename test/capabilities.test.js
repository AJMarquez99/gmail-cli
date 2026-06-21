import { describe, it, expect } from 'vitest';
import { CapabilityDeniedError, InvalidInputError } from '../src/lib/errors.js';
import { BUCKETS, resolveCapabilities, profileCan, COMMAND_CAPABILITY, requiredCapability } from '../src/capabilities.js';

describe('CapabilityDeniedError', () => {
  it('carries exit code 4 and names the bucket + profile', () => {
    const err = new CapabilityDeniedError('send', 'business');
    expect(err.exitCode).toBe(4);
    expect(err.message).toMatch(/business/);
    expect(err.message).toMatch(/send/);
  });
});

describe('resolveCapabilities', () => {
  it('absent both keys → unrestricted (all buckets)', () => {
    const r = resolveCapabilities({});
    expect(r.mode).toBe('unrestricted');
    expect([...r.allowed].sort()).toEqual([...BUCKETS].sort());
  });
  it('allow mode → only the listed buckets', () => {
    const r = resolveCapabilities({ capabilities: ['read', 'organize'] });
    expect(r.mode).toBe('allow');
    expect([...r.allowed].sort()).toEqual(['organize', 'read']);
  });
  it('deny mode → all buckets except the listed', () => {
    const r = resolveCapabilities({ deny: ['send', 'delete'] });
    expect(r.mode).toBe('deny');
    expect([...r.allowed].sort()).toEqual(['draft', 'organize', 'read']);
  });
  it('both keys present → InvalidInputError', () => {
    expect(() => resolveCapabilities({ capabilities: ['read'], deny: ['send'] }))
      .toThrow(InvalidInputError);
  });
  it('unknown bucket name → InvalidInputError listing valid buckets', () => {
    expect(() => resolveCapabilities({ capabilities: ['read', 'bogus'] }))
      .toThrow(/bogus/);
  });
});

describe('profileCan', () => {
  it('true when the bucket is in the resolved set', () => {
    const profile = { capabilities: resolveCapabilities({ capabilities: ['read'] }) };
    expect(profileCan(profile, 'read')).toBe(true);
    expect(profileCan(profile, 'send')).toBe(false);
  });
  it('false-safe on a profile without capabilities', () => {
    expect(profileCan({}, 'read')).toBe(false);
  });
});

describe('requiredCapability', () => {
  it('maps existing commands to their buckets', () => {
    expect(requiredCapability('send', {})).toBe('send');
    expect(requiredCapability('read list', {})).toBe('read');
    expect(requiredCapability('label list', {})).toBe('read');     // listing is read
    expect(requiredCapability('label add', {})).toBe('organize');
    expect(requiredCapability('mark', {})).toBe('organize');
  });
  it('always-allowed commands resolve to null', () => {
    expect(requiredCapability('doctor', {})).toBeNull();
    expect(requiredCapability('whoami', {})).toBeNull();
    expect(requiredCapability('profile caps', {})).toBeNull();
  });
  it('unmapped path is treated as always-allowed (coverage test is the real guard)', () => {
    expect(requiredCapability('totally unknown', {})).toBeNull();
  });
  it('supports dynamic (function) capabilities', () => {
    // forward-compat: a function entry is evaluated against opts
    COMMAND_CAPABILITY['__test_dyn'] = (o) => (o.draft ? 'draft' : 'send');
    expect(requiredCapability('__test_dyn', { draft: true })).toBe('draft');
    expect(requiredCapability('__test_dyn', {})).toBe('send');
    delete COMMAND_CAPABILITY['__test_dyn'];
  });
});
