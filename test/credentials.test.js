import { describe, it, expect, vi } from 'vitest';
import { resolveCredentials, resolveConfigPath } from '../src/auth/credentials.js';
import { MissingCredentialsError, MalformedConfigError } from '../src/lib/errors.js';

describe('resolveConfigPath', () => {
  it('defaults to ~/.config/gmail-cli/credentials.json', () => {
    expect(resolveConfigPath({ HOME: '/home/me' })).toBe(
      '/home/me/.config/gmail-cli/credentials.json',
    );
  });

  it('honors GMAIL_CLI_CONFIG override', () => {
    expect(resolveConfigPath({ HOME: '/home/me', GMAIL_CLI_CONFIG: '/tmp/creds.json' })).toBe(
      '/tmp/creds.json',
    );
  });
});

describe('resolveCredentials', () => {
  it('prefers env vars when both GMAIL_USER and GMAIL_APP_PASSWORD are set', () => {
    const readFile = vi.fn();
    const creds = resolveCredentials({
      env: { GMAIL_USER: 'a@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' },
      readFile,
    });
    expect(creds).toEqual({ user: 'a@gmail.com', appPassword: 'abcdefghijklmnop', source: 'env' });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('falls back to the config file when env vars are absent', () => {
    const readFile = vi.fn(() => JSON.stringify({ user: 'b@gmail.com', appPassword: 'wxyz wxyz wxyz wxyz' }));
    const creds = resolveCredentials({ env: { HOME: '/home/me' }, readFile });
    expect(creds).toEqual({
      user: 'b@gmail.com',
      appPassword: 'wxyzwxyzwxyzwxyz',
      source: '/home/me/.config/gmail-cli/credentials.json',
    });
  });

  it('throws MissingCredentialsError when no env vars and no file', () => {
    const readFile = vi.fn(() => {
      const err = new Error('nope');
      err.code = 'ENOENT';
      throw err;
    });
    expect(() => resolveCredentials({ env: { HOME: '/home/me' }, readFile })).toThrow(
      MissingCredentialsError,
    );
  });

  it('reads the explicit path when provided, bypassing env-var shortcut', () => {
    const readFile = vi.fn(() => JSON.stringify({ user: 'a@b.com', appPassword: 'pw' }));
    const creds = resolveCredentials({
      env: { HOME: '/h', GMAIL_USER: 'env@gmail.com', GMAIL_APP_PASSWORD: 'envpw' },
      readFile,
      path: '/custom/creds.json',
    });
    expect(readFile).toHaveBeenCalledWith('/custom/creds.json', 'utf8');
    expect(creds).toEqual({ user: 'a@b.com', appPassword: 'pw', source: '/custom/creds.json' });
  });

  it('treats an empty credentials file as missing', () => {
    expect(() => resolveCredentials({ env: { HOME: '/home/me' }, readFile: vi.fn(() => '') })).toThrow(
      MissingCredentialsError,
    );
  });

  it('throws MalformedConfigError (exit 2) on a malformed file — not a raw SyntaxError at exit 1', () => {
    const readFile = vi.fn(() => '{ not json');
    let thrown;
    try { resolveCredentials({ env: { HOME: '/home/me' }, readFile }); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(MalformedConfigError);
    expect(thrown.exitCode).toBe(2);
  });
});
