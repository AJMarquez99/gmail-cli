import { describe, it, expect, vi } from 'vitest';
import { resolveRulesPath, loadRules, saveRules } from '../src/rules/storage.js';

describe('rules storage', () => {
  it('resolveRulesPath: env override wins, else default path', () => {
    expect(resolveRulesPath({ GMAIL_RULES: '/r.json' })).toBe('/r.json');
    expect(resolveRulesPath({ HOME: '/h' })).toBe('/h/.config/gmail-cli/rules.json');
  });

  it('loadRules: missing file → []', () => {
    const readFile = vi.fn(() => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; });
    expect(loadRules({ path: '/x', readFile })).toEqual([]);
  });

  it('loadRules: reads the rules array from the container', () => {
    const readFile = vi.fn(() => JSON.stringify({ rules: [{ id: 'a', match: 'from:x', actions: ['archive'] }] }));
    expect(loadRules({ path: '/x', readFile })).toEqual([{ id: 'a', match: 'from:x', actions: ['archive'] }]);
  });

  it('loadRules: non-array/absent rules key → []', () => {
    const readFile = vi.fn(() => JSON.stringify({}));
    expect(loadRules({ path: '/x', readFile })).toEqual([]);
  });

  it('saveRules: writes a { rules } container as pretty JSON', () => {
    const writeFile = vi.fn();
    saveRules('/x', [{ id: 'a', match: 'from:x', actions: ['archive'], mailbox: 'INBOX' }], { writeFile });
    const [path, data] = writeFile.mock.calls[0];
    expect(path).toBe('/x');
    expect(JSON.parse(data)).toEqual({ rules: [{ id: 'a', match: 'from:x', actions: ['archive'], mailbox: 'INBOX' }] });
  });
});
