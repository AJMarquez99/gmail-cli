import { describe, it, expect, vi } from 'vitest';
import { runRulesAdd, runRulesList, runRulesRemove, runRulesExportXml } from '../src/commands/rules.js';

const mkDeps = (initialRules = []) => {
  let store = { rules: initialRules };
  return {
    written: () => store,
    resolveProfile: vi.fn(() => ({ name: 'p', rulesPath: '/rules.json' })),
    readFile: vi.fn(() => JSON.stringify(store)),
    writeFile: vi.fn((p, data) => { store = JSON.parse(data); }),
    ensureDir: vi.fn(),
  };
};

describe('rules add', () => {
  it('builds actions from flags, auto-slugs the id, persists', async () => {
    const deps = mkDeps();
    const r = await runRulesAdd({ match: 'from:acme.com', label: 'Outreach/Acme', archive: true }, deps);
    expect(r).toMatchObject({ action: 'added', id: 'from-acme-com' });
    expect(r.rule).toEqual({ id: 'from-acme-com', match: 'from:acme.com', actions: ['label:Outreach/Acme', 'archive'], mailbox: 'INBOX' });
    expect(deps.written().rules).toHaveLength(1);
  });
  it('honors --id, --mark read, --star, --important, --move, --trash', async () => {
    const deps = mkDeps();
    const r = await runRulesAdd({ match: 'from:x', id: 'custom', mark: 'read', star: true, important: true, move: 'Saved', trash: true }, deps);
    expect(r.rule.actions).toEqual(['mark:read', 'star', 'important', 'move:Saved', 'trash']);
    expect(r.id).toBe('custom');
  });
  it('rejects missing --match', async () => {
    await expect(runRulesAdd({ label: 'X' }, mkDeps())).rejects.toThrow(/match/i);
  });
  it('rejects no actions', async () => {
    await expect(runRulesAdd({ match: 'from:x' }, mkDeps())).rejects.toThrow(/at least one action/i);
  });
  it('rejects an unsupported --mark state', async () => {
    await expect(runRulesAdd({ match: 'from:x', mark: 'unread' }, mkDeps())).rejects.toThrow(/mark/i);
  });
  it('rejects a duplicate id', async () => {
    const deps = mkDeps([{ id: 'dup', match: 'from:x', actions: ['archive'], mailbox: 'INBOX' }]);
    await expect(runRulesAdd({ match: 'from:y', id: 'dup', archive: true }, deps)).rejects.toThrow(/already exists/i);
  });
});

describe('rules list / remove / export-xml', () => {
  it('list returns the stored rules', async () => {
    const deps = mkDeps([{ id: 'a', match: 'from:x', actions: ['archive'], mailbox: 'INBOX' }]);
    expect(await runRulesList({}, deps)).toEqual({ rules: [{ id: 'a', match: 'from:x', actions: ['archive'], mailbox: 'INBOX' }] });
  });
  it('remove drops by id and persists', async () => {
    const deps = mkDeps([{ id: 'a', match: 'from:x', actions: ['archive'], mailbox: 'INBOX' }]);
    expect(await runRulesRemove({ id: 'a' }, deps)).toEqual({ id: 'a', action: 'removed' });
    expect(deps.written().rules).toEqual([]);
  });
  it('remove of an unknown id throws', async () => {
    await expect(runRulesRemove({ id: 'nope' }, mkDeps())).rejects.toThrow(/no rule/i);
  });
  it('export-xml returns Gmail filter XML', async () => {
    const deps = mkDeps([{ id: 'a', match: 'from:x', actions: ['archive'], mailbox: 'INBOX' }]);
    const r = await runRulesExportXml({}, deps);
    expect(r.xml).toContain("<apps:property name='hasTheWord' value='from:x'/>");
    expect(r.xml).toContain("<apps:property name='shouldArchive' value='true'/>");
  });
});
