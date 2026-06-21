import { describe, it, expect, vi } from 'vitest';
import { resolveRecipients, enforceAllowlist, logSend } from '../src/transmit.js';
import { RecipientNotAllowedError } from '../src/lib/errors.js';

// Real shape: loadAllowlist returns { recipients: [...] }, matching makeAllowChecker's contract.
const deps = {
  loadAllowlist: () => ({ recipients: [{ email: 'ok@x.com' }] }),
};
const ctx = { profile: { allowlistEnforce: true, allowlistPath: '/a', sendLogPath: '/s', sendLog: {} },
  creds: { user: 'me@x.com' } };

describe('resolveRecipients', () => {
  it('resolves allowed + self, collects denied, does not throw', () => {
    const r = resolveRecipients({ to: ['ok@x.com', 'no@x.com'], cc: [], bcc: [] }, {}, ctx, deps);
    expect(r.enforce).toBe(true);
    expect(r.to).toContain('ok@x.com');     // allowed
    expect(r.denied).toContain('no@x.com'); // collected, not thrown
  });
  it('enforcement off (opts.noAllowlist) passes everything through', () => {
    const r = resolveRecipients({ to: ['no@x.com'], cc: [], bcc: [] }, { noAllowlist: true }, ctx, deps);
    expect(r.enforce).toBe(false);
    expect(r.to).toEqual(['no@x.com']);
    expect(r.denied).toEqual([]);
  });
});

describe('enforceAllowlist', () => {
  it('throws RecipientNotAllowedError when enforcing and denied non-empty', () => {
    expect(() => enforceAllowlist(['no@x.com'], true)).toThrow(RecipientNotAllowedError);
  });
  it('does not throw when no denials', () => {
    expect(() => enforceAllowlist([], true)).not.toThrow();
  });
  it('warns (stderr) and does not throw when enforcement is off', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    enforceAllowlist(['no@x.com'], false);
    expect(spy.mock.calls.join('')).toMatch(/enforcement disabled/);
    spy.mockRestore();
  });
});

describe('logSend', () => {
  it('appends a stamped entry when logging is enabled', () => {
    const append = vi.fn();
    logSend({ from: 'me@x.com', to: ['ok@x.com'], subject: 'Hi' }, {},
      { profile: { sendLog: {}, sendLogPath: '/s' } }, { now: () => 'T', appendLog: append });
    expect(append).toHaveBeenCalledWith(expect.objectContaining({ ts: 'T', subject: 'Hi' }), { path: '/s' });
  });
  it('skips when --no-log', () => {
    const append = vi.fn();
    logSend({ subject: 'Hi' }, { noLog: true }, { profile: { sendLog: {} } }, { now: () => 'T', appendLog: append });
    expect(append).not.toHaveBeenCalled();
  });
});
