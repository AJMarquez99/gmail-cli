import { describe, it, expect, vi } from 'vitest';
import {
  resolveAllowlistPath,
  loadAllowlist,
  makeAllowChecker,
} from '../src/allowlist.js';
import { MalformedConfigError } from '../src/lib/errors.js';

describe('resolveAllowlistPath', () => {
  it('defaults to ~/.config/gmail-cli/allowlist.json', () => {
    expect(resolveAllowlistPath({ HOME: '/home/me' })).toBe(
      '/home/me/.config/gmail-cli/allowlist.json',
    );
  });

  it('honors GMAIL_ALLOWLIST override', () => {
    expect(resolveAllowlistPath({ HOME: '/home/me', GMAIL_ALLOWLIST: '/tmp/a.json' })).toBe(
      '/tmp/a.json',
    );
  });
});

describe('loadAllowlist', () => {
  it('returns the recipients array from the file', () => {
    const readFile = vi.fn(() =>
      JSON.stringify({ recipients: [{ email: 'a@x.com', aliases: ['a'] }] }),
    );
    expect(loadAllowlist({ env: { HOME: '/h' }, readFile })).toEqual({
      recipients: [{ email: 'a@x.com', aliases: ['a'] }],
    });
  });

  it('treats a missing file as an empty allowlist (fail-closed)', () => {
    const readFile = vi.fn(() => {
      const err = new Error('nope');
      err.code = 'ENOENT';
      throw err;
    });
    expect(loadAllowlist({ env: { HOME: '/h' }, readFile })).toEqual({ recipients: [] });
  });

  it('tolerates a file without a recipients key', () => {
    const readFile = vi.fn(() => JSON.stringify({}));
    expect(loadAllowlist({ env: { HOME: '/h' }, readFile })).toEqual({ recipients: [] });
  });

  it('reads the explicit path when provided', () => {
    const readFile = vi.fn(() => JSON.stringify({ recipients: [{ email: 'x@y.com' }] }));
    const result = loadAllowlist({ env: { HOME: '/h' }, readFile, path: '/custom/allow.json' });
    expect(readFile).toHaveBeenCalledWith('/custom/allow.json', 'utf8');
    expect(result).toEqual({ recipients: [{ email: 'x@y.com' }] });
  });

  it('treats an empty file as an empty allowlist (fail-closed)', () => {
    expect(loadAllowlist({ env: { HOME: '/h' }, readFile: vi.fn(() => '') })).toEqual({ recipients: [] });
  });

  it('throws MalformedConfigError (exit 2) on a malformed file — not a raw parse error', () => {
    const readFile = vi.fn(() => '{ not json');
    let thrown;
    try { loadAllowlist({ env: { HOME: '/h' }, readFile }); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(MalformedConfigError);
    expect(thrown.exitCode).toBe(2);
  });
});

describe('makeAllowChecker', () => {
  const allowlist = {
    recipients: [
      { email: 'Alice@Example.com', aliases: ['alice', 'A'] },
      { email: 'bob@example.com' },
    ],
  };

  it('allows a listed email case-insensitively, returning the token as given', () => {
    const { resolve } = makeAllowChecker({ allowlist });
    expect(resolve('alice@example.com')).toEqual({ email: 'alice@example.com' });
    expect(resolve('BOB@EXAMPLE.COM')).toEqual({ email: 'BOB@EXAMPLE.COM' });
  });

  it('expands an alias to its canonical email (case-insensitive alias)', () => {
    const { resolve } = makeAllowChecker({ allowlist });
    expect(resolve('alice')).toEqual({ email: 'Alice@Example.com' });
    expect(resolve('a')).toEqual({ email: 'Alice@Example.com' });
  });

  it('always allows self even when not in the list', () => {
    const { resolve } = makeAllowChecker({ allowlist, self: 'you@example.com' });
    expect(resolve('you@example.com')).toEqual({ email: 'you@example.com' });
  });

  it('denies an unlisted email', () => {
    const { resolve } = makeAllowChecker({ allowlist });
    expect(resolve('stranger@evil.com')).toEqual({ denied: 'stranger@evil.com' });
  });

  it('denies an unknown bare alias', () => {
    const { resolve } = makeAllowChecker({ allowlist });
    expect(resolve('nobody')).toEqual({ denied: 'nobody' });
  });
});
