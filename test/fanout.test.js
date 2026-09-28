import { describe, it, expect } from 'vitest';
import { resolveRecipients } from '../src/transmit.js';
import { TooManyRecipientsError } from '../src/lib/errors.js';

const deps = { loadAllowlist: () => ({ recipients: [] }) };
const ctx = (max) => ({ profile: { allowlistEnforce: false, allowlistPath: '/a', maxRecipients: max }, creds: { user: 'me@x.com' } });
const many = (n) => Array.from({ length: n }, (_, i) => `u${i}@x.com`);

describe('fan-out guard', () => {
  it('rejects a send over the max with exit-2 typed error', () => {
    expect(() => resolveRecipients({ to: many(11), cc: [], bcc: [] }, { noAllowlist: true }, ctx(10), deps))
      .toThrow(TooManyRecipientsError);
  });
  it('counts to + cc + bcc together', () => {
    expect(() => resolveRecipients({ to: many(4), cc: many(4), bcc: many(4) }, { noAllowlist: true }, ctx(10), deps))
      .toThrow(TooManyRecipientsError);
  });
  it('allows a send at exactly the max', () => {
    const r = resolveRecipients({ to: many(10), cc: [], bcc: [] }, { noAllowlist: true }, ctx(10), deps);
    expect(r.to).toHaveLength(10);
  });
  it('defaults to 10 when profile.maxRecipients is not set', () => {
    const ctxNoMax = { profile: { allowlistEnforce: false, allowlistPath: '/a' }, creds: { user: 'me@x.com' } };
    expect(() => resolveRecipients({ to: many(11), cc: [], bcc: [] }, { noAllowlist: true }, ctxNoMax, deps))
      .toThrow(TooManyRecipientsError);
  });
  it('reports the count and max on the thrown error', () => {
    try {
      resolveRecipients({ to: many(4), cc: many(4), bcc: many(4) }, { noAllowlist: true }, ctx(10), deps);
      throw new Error('expected resolveRecipients to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TooManyRecipientsError);
      expect(err.count).toBe(12);
      expect(err.max).toBe(10);
      expect(err.exitCode).toBe(2);
    }
  });
});
