import { describe, it, expect } from 'vitest';
import { applyRules } from '../src/rules/engine.js';

// Recording client: search returns a fixed uid list; mutations are recorded.
// uid arg may be a scalar number or a comma-joined range string like '5,6,7'.
const mkClient = (uids) => {
  const calls = [];
  return { calls,
    mailboxOpen: async (m) => calls.push(['open', m]),
    search: async (q, o) => { calls.push(['search', q, o]); return uids; },
    messageFlagsAdd: async (u, f, o) => calls.push(['add', u, f, o]),
    messageFlagsRemove: async (u, f, o) => calls.push(['remove', u, f, o]),
    messageMove: async (u, d, o) => calls.push(['move', u, d, o]),
  };
};
const allow = () => true;

describe('applyRules', () => {
  it('applies permitted actions to each matched uid and reports', async () => {
    const c = mkClient([5, 6]);
    const rules = [{ id: 'r1', match: 'from:x', actions: ['label:Promo', 'archive'], mailbox: 'INBOX' }];
    const rep = await applyRules(c, rules, { profileCan: allow }, {});
    expect(rep.dryRun).toBe(false);
    expect(rep.rules[0]).toMatchObject({ id: 'r1', matched: 2 });
    expect(rep.rules[0].applied).toHaveLength(4); // 2 uids × 2 actions
    // Batched form: one call per action covering all UIDs
    expect(c.calls).toContainEqual(['add', '5,6', ['Promo'], { uid: true, useLabels: true }]);
    expect(c.calls).toContainEqual(['remove', '5,6', ['\\Inbox'], { uid: true, useLabels: true }]);
  });

  it('batches each action over the full matched uid set in one IMAP command', async () => {
    const c = mkClient([5, 6, 7]);
    const rules = [{ id: 'r1', match: 'from:x', actions: ['label:Promo', 'archive'], mailbox: 'INBOX' }];
    const rep = await applyRules(c, rules, { profileCan: allow }, {});
    expect(rep.rules[0].matched).toBe(3);
    expect(rep.rules[0].applied).toHaveLength(6); // 3 uids × 2 actions

    // EXACTLY two mutation commands: one label:Promo, one archive
    const mutations = c.calls.filter((x) => x[0] === 'add' || x[0] === 'remove');
    expect(mutations).toHaveLength(2);
    expect(mutations).toContainEqual(['add', '5,6,7', ['Promo'], { uid: true, useLabels: true }]);
    expect(mutations).toContainEqual(['remove', '5,6,7', ['\\Inbox'], { uid: true, useLabels: true }]);

    // Report has per-uid entries for each action (order-insensitive)
    expect(rep.rules[0].applied).toEqual(expect.arrayContaining([
      { uid: 5, action: 'label:Promo' },
      { uid: 6, action: 'label:Promo' },
      { uid: 7, action: 'label:Promo' },
      { uid: 5, action: 'archive' },
      { uid: 6, action: 'archive' },
      { uid: 7, action: 'archive' },
    ]));
  });

  it('skips actions the profile lacks the capability for (no mutation)', async () => {
    const c = mkClient([5]);
    const rules = [{ id: 'r1', match: 'from:x', actions: ['archive', 'trash'], mailbox: 'INBOX' }];
    // organize allowed, delete denied
    const profileCan = (b) => b === 'organize';
    const rep = await applyRules(c, rules, { profileCan }, {});
    expect(rep.rules[0].skipped).toEqual([{ action: 'trash', reason: 'capability:delete' }]);
    expect(rep.rules[0].applied).toEqual([{ uid: 5, action: 'archive' }]);
    expect(c.calls.some((x) => x[0] === 'move')).toBe(false); // trash never executed
  });

  it('dry-run mutates nothing but reports would-apply', async () => {
    const c = mkClient([5, 6]);
    const rules = [{ id: 'r1', match: 'from:x', actions: ['archive'], mailbox: 'INBOX' }];
    const rep = await applyRules(c, rules, { profileCan: allow, dryRun: true }, {});
    expect(rep.dryRun).toBe(true);
    expect(rep.rules[0].applied).toEqual(expect.arrayContaining([
      { uid: 5, action: 'archive', dryRun: true },
      { uid: 6, action: 'archive', dryRun: true },
    ]));
    expect(rep.rules[0].applied).toHaveLength(2);
    expect(c.calls.some((x) => x[0] === 'remove')).toBe(false); // no mutation
  });

  it('--rule selects a single rule; --limit caps matches', async () => {
    const c = mkClient([5, 6, 7]);
    const rules = [
      { id: 'r1', match: 'from:x', actions: ['archive'], mailbox: 'INBOX' },
      { id: 'r2', match: 'from:y', actions: ['archive'], mailbox: 'INBOX' },
    ];
    const rep = await applyRules(c, rules, { profileCan: allow, ruleId: 'r2', limit: 2 }, {});
    expect(rep.rules).toHaveLength(1);
    expect(rep.rules[0].id).toBe('r2');
    expect(rep.rules[0].matched).toBe(2); // slice(-2) of [5,6,7]
  });

  it('limit:0 is ignored (no cap) — use a positive integer to cap', async () => {
    // With the old slice(-0) bug, limit:0 returned the FULL array accidentally.
    // The fix makes limit:0 explicitly ignored (treated as "no limit").
    // Either way the result is the full set, but now it is deterministic, not accidental.
    const c = mkClient([5, 6, 7]);
    const rules = [{ id: 'r1', match: 'from:x', actions: ['archive'], mailbox: 'INBOX' }];
    const rep = await applyRules(c, rules, { profileCan: allow, limit: 0 }, {});
    // limit:0 is ignored → full search result (3 uids) is processed
    expect(rep.rules[0].matched).toBe(3);
  });

  it('a malformed action records an error and skips the rule', async () => {
    const c = mkClient([5]);
    const rules = [{ id: 'bad', match: 'from:x', actions: ['frobnicate'], mailbox: 'INBOX' }];
    const rep = await applyRules(c, rules, { profileCan: allow }, {});
    expect(rep.rules[0].errors[0].error).toMatch(/unknown rule action/i);
    expect(rep.rules[0].applied).toEqual([]);
  });

  it('error in a batched action records an error entry for every uid in the batch', async () => {
    const calls = [];
    const errClient = {
      calls,
      mailboxOpen: async (m) => calls.push(['open', m]),
      search: async (q, o) => { calls.push(['search', q, o]); return [5, 6]; },
      messageFlagsAdd: async (u, f, o) => { calls.push(['add', u, f, o]); throw new Error('IMAP failure'); },
      messageFlagsRemove: async (u, f, o) => calls.push(['remove', u, f, o]),
    };
    const rules = [{ id: 'r1', match: 'from:x', actions: ['label:Promo', 'archive'], mailbox: 'INBOX' }];
    const rep = await applyRules(errClient, rules, { profileCan: allow }, {});
    // label:Promo throws → both uid 5 and 6 get an error entry
    expect(rep.rules[0].errors).toEqual(expect.arrayContaining([
      { uid: 5, action: 'label:Promo', error: 'IMAP failure' },
      { uid: 6, action: 'label:Promo', error: 'IMAP failure' },
    ]));
    // archive still ran (batched separately)
    expect(rep.rules[0].applied).toEqual(expect.arrayContaining([
      { uid: 5, action: 'archive' },
      { uid: 6, action: 'archive' },
    ]));
    // no 'applied' for label:Promo
    expect(rep.rules[0].applied.some((e) => e.action === 'label:Promo')).toBe(false);
  });
});
