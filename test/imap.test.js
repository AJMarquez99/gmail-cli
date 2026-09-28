import { describe, it, expect, vi } from 'vitest';
import { openImapClient, IMAP_DEFAULTS } from '../src/imap.js';
import { ImapTimeoutError } from '../src/lib/errors.js';

const hung = () => ({ connect: () => new Promise(() => {}), close: vi.fn() });
const ok = () => ({ connect: vi.fn(async () => {}), close: vi.fn() });
const opts = { timeoutMs: 20, warn: vi.fn() };

describe('openImapClient', () => {
  it('returns the client when connect resolves', async () => {
    const c = ok();
    const deps = { createImapClient: vi.fn(() => c) };
    await expect(openImapClient(deps, {}, {}, opts)).resolves.toBe(c);
    expect(deps.createImapClient).toHaveBeenCalledTimes(1);
  });
  it('times out, closes the stalled client, and retries once on a fresh client', async () => {
    const first = hung(), second = ok();
    const deps = { createImapClient: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) };
    const w = vi.fn();
    await expect(openImapClient(deps, {}, {}, { ...opts, warn: w })).resolves.toBe(second);
    expect(first.close).toHaveBeenCalled();
    expect(w).toHaveBeenCalledWith(expect.stringMatching(/timed out.*retrying/));
  });
  it('throws ImapTimeoutError (exit 1) after the retry also stalls', async () => {
    const deps = { createImapClient: vi.fn(() => hung()) };
    const err = await openImapClient(deps, {}, {}, opts).catch((e) => e);
    expect(err).toBeInstanceOf(ImapTimeoutError);
    expect(err.exitCode).toBe(1);
    expect(deps.createImapClient).toHaveBeenCalledTimes(2);
  });
  it('does not retry non-timeout errors (e.g. auth failure)', async () => {
    const bad = { connect: vi.fn(async () => { throw new Error('AUTHENTICATIONFAILED'); }), close: vi.fn() };
    const deps = { createImapClient: vi.fn(() => bad) };
    await expect(openImapClient(deps, {}, {}, opts)).rejects.toThrow('AUTHENTICATIONFAILED');
    expect(deps.createImapClient).toHaveBeenCalledTimes(1);
  });
  it('passes imapOpts through to createImapClient', async () => {
    const deps = { createImapClient: vi.fn(() => ok()) };
    await openImapClient(deps, { user: 'u' }, { host: 'h' }, opts);
    expect(deps.createImapClient).toHaveBeenCalledWith({ user: 'u' }, { host: 'h' });
  });
  it('ships finite timeout defaults well under imapflow’s 90s/300s', () => {
    expect(IMAP_DEFAULTS.connectionTimeout).toBeLessThanOrEqual(15000);
    expect(IMAP_DEFAULTS.socketTimeout).toBeLessThanOrEqual(120000);
  });

  it('falls back to deps.warn when no explicit warn option is given', async () => {
    const first = hung(), second = ok();
    const deps = {
      createImapClient: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
      warn: vi.fn(),
    };
    await expect(openImapClient(deps, {}, {}, { timeoutMs: 20 })).resolves.toBe(second);
    expect(deps.warn).toHaveBeenCalledWith(expect.stringMatching(/timed out.*retrying/));
  });

  // ---------------------------------------------------------------------
  // Controller ruling: imapflow's own connectionTimeout/greetingTimeout fire
  // long before our race deadline and reject connect() with a code — those
  // must take the same branch as a race timeout (close, retry, then throw).
  // ---------------------------------------------------------------------
  describe.each(['CONNECT_TIMEOUT', 'GREETING_TIMEOUT'])('imapflow %s rejection', (code) => {
    const timedOutRejecting = () => ({
      connect: vi.fn(async () => { throw Object.assign(new Error('x'), { code }); }),
      close: vi.fn(),
    });

    it('retries once on a fresh client and succeeds', async () => {
      const first = timedOutRejecting(), second = ok();
      const deps = { createImapClient: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) };
      const w = vi.fn();
      await expect(openImapClient(deps, {}, {}, { ...opts, warn: w })).resolves.toBe(second);
      expect(first.close).toHaveBeenCalled();
      expect(w).toHaveBeenCalledWith(expect.stringMatching(/timed out.*retrying/));
    });

    it('throws ImapTimeoutError after the retry also fails the same way', async () => {
      const deps = { createImapClient: vi.fn(() => timedOutRejecting()) };
      const err = await openImapClient(deps, {}, {}, opts).catch((e) => e);
      expect(err).toBeInstanceOf(ImapTimeoutError);
      expect(err.exitCode).toBe(1);
      expect(err.message).toMatch(/2 attempts/);
      expect(deps.createImapClient).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------
  // Controller ruling: an abandoned connect() that rejects AFTER the
  // deadline already fired must never surface as an unhandledRejection.
  // ---------------------------------------------------------------------
  it('does not produce an unhandledRejection when an abandoned connect() rejects after the timeout', async () => {
    const lateRejecting = () => ({
      connect: () => new Promise((_, reject) => setTimeout(() => reject(new Error('late failure')), 40)),
      close: vi.fn(),
    });
    const deps = { createImapClient: vi.fn(() => lateRejecting()) };
    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    try {
      const err = await openImapClient(deps, {}, {}, { timeoutMs: 10, retries: 0, warn: vi.fn() }).catch((e) => e);
      expect(err).toBeInstanceOf(ImapTimeoutError);
      // Wait past the 40ms late rejection so it has a chance to surface as unhandled.
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(onUnhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
