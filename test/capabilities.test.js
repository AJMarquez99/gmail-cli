import { describe, it, expect } from 'vitest';
import { CapabilityDeniedError, InvalidInputError } from '../src/lib/errors.js';
import { BUCKETS, resolveCapabilities, profileCan } from '../src/capabilities.js';

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
