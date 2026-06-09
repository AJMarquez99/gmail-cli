import { describe, it, expect } from 'vitest';
import { loadConfig, resolveSettingsPath } from '../src/config.js';

describe('loadConfig', () => {
  it('returns {} when the config file is absent', () => {
    const readFile = () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; };
    expect(loadConfig({ env: { HOME: '/home/u' }, readFile })).toEqual({});
  });

  it('parses JSON when present', () => {
    const readFile = () => JSON.stringify({ replyTo: 'a@b.com', fromName: 'Co' });
    expect(loadConfig({ env: { HOME: '/home/u' }, readFile })).toEqual({ replyTo: 'a@b.com', fromName: 'Co' });
  });

  it('throws a config error on malformed JSON', () => {
    const readFile = () => '{ not json';
    expect(() => loadConfig({ env: { HOME: '/home/u' }, readFile })).toThrow(/config\.json/);
  });

  it('honors GMAIL_CLI_SETTINGS override for the path', () => {
    expect(resolveSettingsPath({ GMAIL_CLI_SETTINGS: '/tmp/c.json' })).toBe('/tmp/c.json');
  });
});
