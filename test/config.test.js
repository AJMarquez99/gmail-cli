import { describe, it, expect } from 'vitest';
import { loadConfig, resolveSettingsPath } from '../src/config.js';
import { MalformedConfigError } from '../src/lib/errors.js';

describe('loadConfig', () => {
  it('returns {} when the config file is absent', () => {
    const readFile = () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; };
    expect(loadConfig({ env: { HOME: '/home/u' }, readFile })).toEqual({});
  });

  it('returns {} when the config file is empty', () => {
    expect(loadConfig({ env: { HOME: '/home/u' }, readFile: () => '' })).toEqual({});
  });

  it('parses JSON when present', () => {
    const readFile = () => JSON.stringify({ replyTo: 'a@b.com', fromName: 'Co' });
    expect(loadConfig({ env: { HOME: '/home/u' }, readFile })).toEqual({ replyTo: 'a@b.com', fromName: 'Co' });
  });

  it('throws MalformedConfigError on malformed JSON (message names the file)', () => {
    const readFile = () => '{ not json';
    expect(() => loadConfig({ env: { HOME: '/home/u' }, readFile })).toThrow(MalformedConfigError);
    expect(() => loadConfig({ env: { HOME: '/home/u' }, readFile })).toThrow(/config\.json/);
  });

  it('honors GMAIL_CLI_SETTINGS override for the path', () => {
    expect(resolveSettingsPath({ GMAIL_CLI_SETTINGS: '/tmp/c.json' })).toBe('/tmp/c.json');
  });
});
