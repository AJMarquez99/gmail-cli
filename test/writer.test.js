import { describe, it, expect } from 'vitest';
import { addLabel, removeLabel, markMessage, appendDraft, fetchRawMessage } from '../src/writer.js';

// ---------------------------------------------------------------------------
// Fake imapflow client for write operations
// ---------------------------------------------------------------------------

function fakeWriteClient({ throwInOp = false } = {}) {
  return {
    opened: null,
    _flagsAddCalls: [],
    _flagsRemoveCalls: [],

    async mailboxOpen(path) {
      this.opened = path;
      return { exists: 1 };
    },

    async messageFlagsAdd(uid, flags, opts) {
      if (throwInOp) throw new Error('flagsAdd exploded');
      this._flagsAddCalls.push({ uid, flags, opts });
    },

    async messageFlagsRemove(uid, flags, opts) {
      if (throwInOp) throw new Error('flagsRemove exploded');
      this._flagsRemoveCalls.push({ uid, flags, opts });
    },
  };
}

// ---------------------------------------------------------------------------
// addLabel
// ---------------------------------------------------------------------------

describe('addLabel', () => {
  it('opens the specified mailbox', async () => {
    const client = fakeWriteClient();
    await addLabel(client, { uid: '1', label: 'work', mailbox: 'INBOX' });
    expect(client.opened).toBe('INBOX');
  });

  it('defaults to INBOX when no mailbox provided', async () => {
    const client = fakeWriteClient();
    await addLabel(client, { uid: '1', label: 'work' });
    expect(client.opened).toBe('INBOX');
  });

  it('calls messageFlagsAdd with correct uid, label, and useLabels:true', async () => {
    const client = fakeWriteClient();
    await addLabel(client, { uid: '42', label: 'work', mailbox: 'INBOX' });
    const call = client._flagsAddCalls[0];
    expect(call.uid).toBe(42);
    expect(call.flags).toEqual(['work']);
    expect(call.opts).toMatchObject({ uid: true, useLabels: true });
  });

  it('coerces uid to a number', async () => {
    const client = fakeWriteClient();
    await addLabel(client, { uid: '7', label: 'tag', mailbox: 'INBOX' });
    expect(client._flagsAddCalls[0].uid).toBe(7);
  });

  it('returns { uid, label, action: "added" }', async () => {
    const client = fakeWriteClient();
    const result = await addLabel(client, { uid: '42', label: 'work', mailbox: 'INBOX' });
    expect(result).toEqual({ uid: 42, label: 'work', action: 'added' });
  });

  it('propagates errors from messageFlagsAdd', async () => {
    const client = fakeWriteClient({ throwInOp: true });
    await expect(addLabel(client, { uid: '1', label: 'tag', mailbox: 'INBOX' })).rejects.toThrow('flagsAdd exploded');
  });
});

// ---------------------------------------------------------------------------
// removeLabel
// ---------------------------------------------------------------------------

describe('removeLabel', () => {
  it('opens the specified mailbox', async () => {
    const client = fakeWriteClient();
    await removeLabel(client, { uid: '1', label: 'work', mailbox: 'INBOX' });
    expect(client.opened).toBe('INBOX');
  });

  it('defaults to INBOX when no mailbox provided', async () => {
    const client = fakeWriteClient();
    await removeLabel(client, { uid: '1', label: 'work' });
    expect(client.opened).toBe('INBOX');
  });

  it('calls messageFlagsRemove with correct uid, label, and useLabels:true', async () => {
    const client = fakeWriteClient();
    await removeLabel(client, { uid: '99', label: 'work', mailbox: 'INBOX' });
    const call = client._flagsRemoveCalls[0];
    expect(call.uid).toBe(99);
    expect(call.flags).toEqual(['work']);
    expect(call.opts).toMatchObject({ uid: true, useLabels: true });
  });

  it('coerces uid to a number', async () => {
    const client = fakeWriteClient();
    await removeLabel(client, { uid: '5', label: 'tag', mailbox: 'INBOX' });
    expect(client._flagsRemoveCalls[0].uid).toBe(5);
  });

  it('returns { uid, label, action: "removed" }', async () => {
    const client = fakeWriteClient();
    const result = await removeLabel(client, { uid: '99', label: 'work', mailbox: 'INBOX' });
    expect(result).toEqual({ uid: 99, label: 'work', action: 'removed' });
  });

  it('propagates errors from messageFlagsRemove', async () => {
    const client = fakeWriteClient({ throwInOp: true });
    await expect(removeLabel(client, { uid: '1', label: 'tag', mailbox: 'INBOX' })).rejects.toThrow('flagsRemove exploded');
  });
});

// ---------------------------------------------------------------------------
// markMessage
// ---------------------------------------------------------------------------

describe('markMessage', () => {
  it('opens the specified mailbox', async () => {
    const client = fakeWriteClient();
    await markMessage(client, { uid: '1', seen: true, mailbox: 'INBOX' });
    expect(client.opened).toBe('INBOX');
  });

  it('defaults to INBOX when no mailbox provided', async () => {
    const client = fakeWriteClient();
    await markMessage(client, { uid: '1', seen: true });
    expect(client.opened).toBe('INBOX');
  });

  it('calls messageFlagsAdd with ["\\\\Seen"] when seen is true (no useLabels)', async () => {
    const client = fakeWriteClient();
    await markMessage(client, { uid: '42', seen: true, mailbox: 'INBOX' });
    const call = client._flagsAddCalls[0];
    expect(call.uid).toBe(42);
    expect(call.flags).toEqual(['\\Seen']);
    expect(call.opts).toMatchObject({ uid: true });
    expect(call.opts.useLabels).toBeFalsy();
  });

  it('calls messageFlagsRemove with ["\\\\Seen"] when seen is false (no useLabels)', async () => {
    const client = fakeWriteClient();
    await markMessage(client, { uid: '99', seen: false, mailbox: 'INBOX' });
    const call = client._flagsRemoveCalls[0];
    expect(call.uid).toBe(99);
    expect(call.flags).toEqual(['\\Seen']);
    expect(call.opts).toMatchObject({ uid: true });
    expect(call.opts.useLabels).toBeFalsy();
  });

  it('coerces uid to a number', async () => {
    const client = fakeWriteClient();
    await markMessage(client, { uid: '7', seen: true, mailbox: 'INBOX' });
    expect(client._flagsAddCalls[0].uid).toBe(7);
  });

  it('returns { uid, seen: true, action: "read" } when marking read', async () => {
    const client = fakeWriteClient();
    const result = await markMessage(client, { uid: '42', seen: true, mailbox: 'INBOX' });
    expect(result).toEqual({ uid: 42, seen: true, action: 'read' });
  });

  it('returns { uid, seen: false, action: "unread" } when marking unread', async () => {
    const client = fakeWriteClient();
    const result = await markMessage(client, { uid: '99', seen: false, mailbox: 'INBOX' });
    expect(result).toEqual({ uid: 99, seen: false, action: 'unread' });
  });

  it('propagates errors from messageFlagsAdd', async () => {
    const client = fakeWriteClient({ throwInOp: true });
    await expect(markMessage(client, { uid: '1', seen: true, mailbox: 'INBOX' })).rejects.toThrow('flagsAdd exploded');
  });

  it('propagates errors from messageFlagsRemove', async () => {
    const client = fakeWriteClient({ throwInOp: true });
    await expect(markMessage(client, { uid: '1', seen: false, mailbox: 'INBOX' })).rejects.toThrow('flagsRemove exploded');
  });
});

// ---------------------------------------------------------------------------
// appendDraft
// ---------------------------------------------------------------------------

it('appendDraft APPENDs to [Gmail]/Drafts with \\Draft and returns uid', async () => {
  const calls = [];
  const client = { append: async (mbox, buf, flags) => { calls.push([mbox, flags]); return { uid: 42 }; } };
  const r = await appendDraft(client, Buffer.from('raw'));
  expect(calls[0][0]).toBe('[Gmail]/Drafts');
  expect(calls[0][1]).toEqual(['\\Draft']);
  expect(r).toEqual({ uid: 42, mailbox: '[Gmail]/Drafts' });
});

// ---------------------------------------------------------------------------
// fetchRawMessage
// ---------------------------------------------------------------------------

describe('fetchRawMessage', () => {
  it('opens the mailbox and returns the source Buffer from the first fetch result', async () => {
    const rawBuf = Buffer.from('raw RFC822 message');
    const openedMailboxes = [];
    const client = {
      async mailboxOpen(mbox) { openedMailboxes.push(mbox); },
      async *fetch(_uid, _query, _opts) {
        yield { source: rawBuf };
      },
    };
    const result = await fetchRawMessage(client, { uid: '42', mailbox: '[Gmail]/Drafts' });
    expect(openedMailboxes).toEqual(['[Gmail]/Drafts']);
    expect(result).toBe(rawBuf);
  });

  it('returns null when no messages are found (empty fetch result)', async () => {
    const client = {
      async mailboxOpen() {},
      async *fetch() { /* yields nothing — intentionally empty */ },
    };
    const result = await fetchRawMessage(client, { uid: '99', mailbox: '[Gmail]/Drafts' });
    expect(result).toBeNull();
  });

  it('calls fetch with the uid as a Number', async () => {
    const fetchCalls = [];
    const rawBuf = Buffer.from('data');
    const client = {
      async mailboxOpen() {},
      async *fetch(_uid, _query, _opts) {
        fetchCalls.push({ uid: _uid, query: _query, opts: _opts });
        yield { source: rawBuf };
      },
    };
    await fetchRawMessage(client, { uid: '7', mailbox: '[Gmail]/Drafts' });
    expect(fetchCalls[0].uid).toBe(7);
    expect(fetchCalls[0].query).toMatchObject({ source: true });
    expect(fetchCalls[0].opts).toMatchObject({ uid: true });
  });
});

// ---------------------------------------------------------------------------
// IMAP organize primitives
// ---------------------------------------------------------------------------

import { archiveMessage, moveMessage, trashMessage, starMessage, importantMessage,
  createLabel, deleteLabel, renameLabel, TRASH } from '../src/writer.js';

const mkClient = () => {
  const calls = [];
  return { calls,
    mailboxOpen: async (m) => calls.push(['open', m]),
    messageFlagsAdd: async (u, f, o) => calls.push(['add', Number(u), f, o]),
    messageFlagsRemove: async (u, f, o) => calls.push(['remove', Number(u), f, o]),
    messageMove: async (u, d, o) => calls.push(['move', Number(u), d, o]),
    mailboxCreate: async (p) => calls.push(['create', p]),
    mailboxDelete: async (p) => calls.push(['delete', p]),
    mailboxRename: async (a, b) => calls.push(['rename', a, b]),
  };
};

it('archiveMessage removes the \\Inbox label via X-GM-LABELS', async () => {
  const c = mkClient();
  const r = await archiveMessage(c, { uid: '7', mailbox: 'INBOX' });
  expect(c.calls).toContainEqual(['remove', 7, ['\\Inbox'], { uid: true, useLabels: true }]);
  expect(r).toEqual({ uid: 7, mailbox: 'INBOX', action: 'archived' });
});
it('moveMessage moves a uid to a destination mailbox', async () => {
  const c = mkClient();
  const r = await moveMessage(c, { uid: '7', mailbox: 'INBOX', destination: 'Saved' });
  expect(c.calls).toContainEqual(['move', 7, 'Saved', { uid: true }]);
  expect(r).toEqual({ uid: 7, from: 'INBOX', to: 'Saved', action: 'moved' });
});
it('trashMessage moves to the Trash mailbox', async () => {
  const c = mkClient();
  const r = await trashMessage(c, { uid: '7', mailbox: 'INBOX' });
  expect(c.calls).toContainEqual(['move', 7, TRASH, { uid: true }]);
  expect(r).toEqual({ uid: 7, action: 'trashed' });
});
it('starMessage adds \\Starred when on, removes when off', async () => {
  const c = mkClient();
  await starMessage(c, { uid: '7', on: true, mailbox: 'INBOX' });
  expect(c.calls).toContainEqual(['add', 7, ['\\Starred'], { uid: true, useLabels: true }]);
  const c2 = mkClient();
  await starMessage(c2, { uid: '7', on: false, mailbox: 'INBOX' });
  expect(c2.calls).toContainEqual(['remove', 7, ['\\Starred'], { uid: true, useLabels: true }]);
});
it('importantMessage toggles \\Important', async () => {
  const c = mkClient();
  await importantMessage(c, { uid: '7', on: true, mailbox: 'INBOX' });
  expect(c.calls).toContainEqual(['add', 7, ['\\Important'], { uid: true, useLabels: true }]);
});
it('createLabel/deleteLabel/renameLabel call the mailbox ops', async () => {
  const c = mkClient();
  expect(await createLabel(c, { name: 'X' })).toEqual({ name: 'X', action: 'created' });
  expect(await deleteLabel(c, { name: 'X' })).toEqual({ name: 'X', action: 'deleted' });
  expect(await renameLabel(c, { name: 'X', newName: 'Y' })).toEqual({ from: 'X', to: 'Y', action: 'renamed' });
  expect(c.calls).toEqual([['create', 'X'], ['delete', 'X'], ['rename', 'X', 'Y']]);
});
