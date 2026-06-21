import { describe, it, expect } from 'vitest';
import { parseAction, parseActions, runAction } from '../src/rules/actions.js';

describe('parseAction', () => {
  it('parses prefixed actions with args', () => {
    expect(parseAction('label:Outreach/Acme')).toEqual({ raw: 'label:Outreach/Acme', type: 'label', arg: 'Outreach/Acme', bucket: 'organize' });
    expect(parseAction('move:Saved')).toEqual({ raw: 'move:Saved', type: 'move', arg: 'Saved', bucket: 'organize' });
    expect(parseAction('unlabel:X')).toEqual({ raw: 'unlabel:X', type: 'unlabel', arg: 'X', bucket: 'organize' });
  });
  it('parses bare actions', () => {
    expect(parseAction('archive')).toEqual({ raw: 'archive', type: 'archive', bucket: 'organize' });
    expect(parseAction('mark:read')).toEqual({ raw: 'mark:read', type: 'mark-read', bucket: 'organize' });
    expect(parseAction('star')).toEqual({ raw: 'star', type: 'star', bucket: 'organize' });
    expect(parseAction('important')).toEqual({ raw: 'important', type: 'important', bucket: 'organize' });
    expect(parseAction('trash')).toEqual({ raw: 'trash', type: 'trash', bucket: 'delete' });
  });
  it('throws on unknown action + unsupported mark state', () => {
    expect(() => parseAction('frobnicate')).toThrow(/unknown rule action/i);
    expect(() => parseAction('mark:unread')).toThrow(/mark/i);
  });
});

describe('parseActions', () => {
  it('maps a list, preserving order', () => {
    expect(parseActions(['label:A', 'archive']).map((a) => a.type)).toEqual(['label', 'archive']);
  });
  it('empty/absent → []', () => {
    expect(parseActions()).toEqual([]);
    expect(parseActions([])).toEqual([]);
  });
});

describe('runAction dispatches to the right writer op', () => {
  const mkClient = () => {
    const calls = [];
    return { calls,
      mailboxOpen: async (m) => calls.push(['open', m]),
      messageFlagsAdd: async (u, f, o) => calls.push(['add', Number(u), f, o]),
      messageFlagsRemove: async (u, f, o) => calls.push(['remove', Number(u), f, o]),
      messageMove: async (u, d, o) => calls.push(['move', Number(u), d, o]),
    };
  };
  it('label → addLabel (X-GM-LABELS add)', async () => {
    const c = mkClient();
    await runAction(c, parseAction('label:Promo'), { uid: 7, mailbox: 'INBOX' }, {});
    expect(c.calls).toContainEqual(['add', 7, ['Promo'], { uid: true, useLabels: true }]);
  });
  it('archive → removeLabel \\Inbox', async () => {
    const c = mkClient();
    await runAction(c, parseAction('archive'), { uid: 7, mailbox: 'INBOX' }, {});
    expect(c.calls).toContainEqual(['remove', 7, ['\\Inbox'], { uid: true, useLabels: true }]);
  });
  it('star → add \\Starred; important → add \\Important', async () => {
    const c = mkClient();
    await runAction(c, parseAction('star'), { uid: 7, mailbox: 'INBOX' }, {});
    await runAction(c, parseAction('important'), { uid: 7, mailbox: 'INBOX' }, {});
    expect(c.calls).toContainEqual(['add', 7, ['\\Starred'], { uid: true, useLabels: true }]);
    expect(c.calls).toContainEqual(['add', 7, ['\\Important'], { uid: true, useLabels: true }]);
  });
  it('mark:read → add \\Seen', async () => {
    const c = mkClient();
    await runAction(c, parseAction('mark:read'), { uid: 7, mailbox: 'INBOX' }, {});
    expect(c.calls).toContainEqual(['add', 7, ['\\Seen'], { uid: true }]);
  });
  it('move → messageMove to destination; trash → messageMove to Trash', async () => {
    const c = mkClient();
    await runAction(c, parseAction('move:Saved'), { uid: 7, mailbox: 'INBOX' }, {});
    await runAction(c, parseAction('trash'), { uid: 7, mailbox: 'INBOX' }, {});
    expect(c.calls).toContainEqual(['move', 7, 'Saved', { uid: true }]);
    expect(c.calls).toContainEqual(['move', 7, '[Gmail]/Trash', { uid: true }]);
  });
});
