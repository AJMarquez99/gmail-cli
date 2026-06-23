import { describe, it, expect, vi } from 'vitest';
import { buildProgram } from '../src/cli.js';
import { resolveCapabilities } from '../src/capabilities.js';
import { runRulesAdd, runRulesList, runRulesRemove, runRulesApply, runRulesExportXml } from '../src/commands/rules.js';

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

// Recording IMAP client whose search returns a fixed uid set.
const mkClient = (uids) => {
  const calls = [];
  return { calls,
    connect: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    mailboxOpen: async (m) => calls.push(['open', m]),
    search: async (q, o) => { calls.push(['search', q, o]); return uids; },
    messageFlagsRemove: async (u, f, o) => calls.push(['remove', u, f, o]),
    messageMove: async (u, d, o) => calls.push(['move', u, d, o]),
  };
};

const baseProfile = (caps) => ({
  name: 'biz', legacy: false, imap: {}, rulesPath: '/rules.json',
  credentialsPath: '/creds.json',
  capabilities: resolveCapabilities(caps),
});

describe('runRulesApply (direct)', () => {
  it('skips a trash action under an organize-only profile, applies archive', async () => {
    const client = mkClient([5]);
    const deps = {
      resolveProfile: vi.fn(() => baseProfile({ capabilities: ['read', 'organize'] })),
      resolveCredentials: vi.fn(() => ({ user: 'me@x.com', appPassword: 'pw' })),
      createImapClient: vi.fn(() => client),
      readFile: vi.fn(() => JSON.stringify({ rules: [{ id: 'r', match: 'from:x', actions: ['archive', 'trash'], mailbox: 'INBOX' }] })),
    };
    const rep = await runRulesApply({}, deps);
    expect(rep.rules[0].applied).toEqual([{ uid: 5, action: 'archive' }]);
    expect(rep.rules[0].skipped).toEqual([{ action: 'trash', reason: 'capability:delete' }]);
    expect(client.calls.some((c) => c[0] === 'move')).toBe(false); // trash never executed
    expect(client.logout).toHaveBeenCalled(); // withClient always logs out
  });

  it('dry-run mutates nothing', async () => {
    const client = mkClient([5, 6]);
    const deps = {
      resolveProfile: vi.fn(() => baseProfile({ capabilities: ['organize'] })),
      resolveCredentials: vi.fn(() => ({ user: 'me@x.com', appPassword: 'pw' })),
      createImapClient: vi.fn(() => client),
      readFile: vi.fn(() => JSON.stringify({ rules: [{ id: 'r', match: 'from:x', actions: ['archive'], mailbox: 'INBOX' }] })),
    };
    const rep = await runRulesApply({ dryRun: true }, deps);
    expect(rep.dryRun).toBe(true);
    expect(client.calls.some((c) => c[0] === 'remove')).toBe(false);
    expect(client.logout).toHaveBeenCalled();
    expect(client.calls.some((c) => c[0] === 'move')).toBe(false);
  });
});

describe('rules apply gate (e2e parseAsync)', () => {
  it('a read-only profile is denied rules apply with exit 4', async () => {
    const deps = {
      resolveProfile: vi.fn(() => baseProfile({ capabilities: ['read'] })),
    };
    const program = buildProgram(deps);
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = 0;
    await program.parseAsync(['node', 'gmail', 'rules', 'apply']);
    expect(process.exitCode).toBe(4);
    expect(errSpy.mock.calls.join('')).toMatch(/capability/i);
    errSpy.mockRestore();
    process.exitCode = 0;
  });
});
