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
  createLabel, deleteLabel, renameLabel, TRASH, ALL_MAIL } from '../src/writer.js';
import { GmailError, InvalidInputError } from '../src/lib/errors.js';

// Build a realistic imapflow UIDPLUS uidMap covering every uid in a comma-joined range/number.
const uidMapFor = (u) => new Map(String(u).split(',').map(Number).map((n) => [n, n + 900]));

const mkClient = () => {
  const calls = [];
  return { calls,
    mailboxOpen: async (m) => calls.push(['open', m]),
    messageFlagsAdd: async (u, f, o) => calls.push(['add', Number(u), f, o]),
    messageFlagsRemove: async (u, f, o) => calls.push(['remove', Number(u), f, o]),
    messageMove: async (u, d, o) => {
      calls.push(['move', Number(u), d, o]);
      return { uidMap: uidMapFor(u) };
    },
    mailboxCreate: async (p) => calls.push(['create', p]),
    mailboxDelete: async (p) => calls.push(['delete', p]),
    mailboxRename: async (a, b) => calls.push(['rename', a, b]),
  };
};

it('archiveMessage MOVEs to All Mail and never STOREs -\\Inbox', async () => {
  const c = mkClient();
  const r = await archiveMessage(c, { uid: '7', mailbox: 'INBOX' });
  expect(c.calls).toContainEqual(['move', 7, ALL_MAIL, { uid: true }]);
  expect(c.calls.some((x) => x[0] === 'remove')).toBe(false);
  expect(r).toEqual({ uid: 7, mailbox: 'INBOX', action: 'archived' });
});
it('archiveMessage throws GmailError (exit 1) when messageMove returns false (server rejected the command)', async () => {
  const c = { mailboxOpen: async () => {}, messageMove: async () => false };
  const err = await archiveMessage(c, { uid: 7 }).catch((e) => e);
  expect(err).toBeInstanceOf(GmailError);
  expect(err).not.toBeInstanceOf(InvalidInputError);
  expect(err.exitCode).toBe(1);
  expect(err.message).not.toMatch(/not found/i);
  expect(err.message).toMatch(/archive failed/i);
});
it('archiveMessage throws InvalidInputError (exit 2) when the resolved result has no uidMap (uid not in mailbox)', async () => {
  // imapflow 1.4.x + Gmail: a MOVE of a uid not present in the mailbox resolves { path, destination }
  // with no COPYUID/uidMap — it does not return `false`. Gmail is UIDPLUS, so a missing uidMap means 0 moved.
  const c = { mailboxOpen: async () => {}, messageMove: async () => ({ path: 'INBOX', destination: ALL_MAIL }) };
  const err = await archiveMessage(c, { uid: 7 }).catch((e) => e);
  expect(err).toBeInstanceOf(InvalidInputError);
  expect(err.exitCode).toBe(2);
  expect(err.message).toMatch(/No message with uid 7 in INBOX \(already archived\?\)/);
});
it('archiveMessage throws when uidMap covers fewer uids than requested', async () => {
  const c = { mailboxOpen: async () => {}, messageMove: async () => ({ uidMap: new Map([[5, 900]]) }) };
  await expect(archiveMessage(c, { uid: [5, 6] })).rejects.toThrow(/1 of 2/);
});
it('archiveMessage accepts a full uidMap', async () => {
  const c = { mailboxOpen: async () => {}, messageMove: async () => ({ uidMap: new Map([[5, 900], [6, 901]]) }) };
  await expect(archiveMessage(c, { uid: [5, 6] })).resolves.toMatchObject({ action: 'archived' });
});
it('archiveMessage de-duplicates requested uids before comparing to the uidMap ([5,5] with 1 moved succeeds)', async () => {
  const c = { mailboxOpen: async () => {}, messageMove: async () => ({ uidMap: new Map([[5, 900]]) }) };
  await expect(archiveMessage(c, { uid: [5, 5] })).resolves.toMatchObject({ action: 'archived' });
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
// Move and trash share archive's server-result verification (no silent "moved"/"trashed").
const noUidMap = (dest) => ({ mailboxOpen: async () => {}, messageMove: async () => ({ path: 'INBOX', destination: dest }) });
it('trashMessage throws InvalidInputError (exit 2) naming verb, uid and mailbox when no uidMap (nothing moved)', async () => {
  const err = await trashMessage(noUidMap(TRASH), { uid: 7, mailbox: 'INBOX' }).catch((e) => e);
  expect(err).toBeInstanceOf(InvalidInputError);
  expect(err.exitCode).toBe(2);
  expect(err.message).toMatch(/trash/);
  expect(err.message).toMatch(/uid 7/);
  expect(err.message).toMatch(/INBOX/);
});
it('moveMessage throws InvalidInputError (exit 2) naming verb, uid and mailbox when no uidMap (nothing moved)', async () => {
  const err = await moveMessage(noUidMap('Saved'), { uid: 7, mailbox: 'INBOX', destination: 'Saved' }).catch((e) => e);
  expect(err).toBeInstanceOf(InvalidInputError);
  expect(err.exitCode).toBe(2);
  expect(err.message).toMatch(/move/);
  expect(err.message).toMatch(/uid 7/);
  expect(err.message).toMatch(/INBOX/);
});
it('trashMessage / moveMessage throw GmailError (exit 1) when messageMove returns false', async () => {
  const c = { mailboxOpen: async () => {}, messageMove: async () => false };
  const t = await trashMessage(c, { uid: 7 }).catch((e) => e);
  expect(t).toBeInstanceOf(GmailError);
  expect(t).not.toBeInstanceOf(InvalidInputError);
  expect(t.exitCode).toBe(1);
  expect(t.message).toMatch(/trash failed/i);
  const m = await moveMessage(c, { uid: 7, destination: 'Saved' }).catch((e) => e);
  expect(m.exitCode).toBe(1);
  expect(m.message).toMatch(/move failed/i);
});
it('trashMessage / moveMessage throw GmailError on a partial move', async () => {
  const c = { mailboxOpen: async () => {}, messageMove: async () => ({ uidMap: new Map([[5, 900]]) }) };
  const t = await trashMessage(c, { uid: [5, 6] }).catch((e) => e);
  expect(t).toBeInstanceOf(GmailError);
  expect(t).not.toBeInstanceOf(InvalidInputError);
  expect(t.message).toMatch(/1 of 2/);
  await expect(moveMessage(c, { uid: [5, 6], destination: 'Saved' })).rejects.toThrow(/1 of 2/);
});
it('trashMessage de-duplicates requested uids ([5,5] with 1 moved succeeds)', async () => {
  const c = { mailboxOpen: async () => {}, messageMove: async () => ({ uidMap: new Map([[5, 900]]) }) };
  await expect(trashMessage(c, { uid: [5, 5] })).resolves.toMatchObject({ action: 'trashed' });
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

// ---------------------------------------------------------------------------
// Batch UID array support
// A separate stub that records the raw value (no Number() coercion) so we can
// assert the comma-joined IMAP sequence set passed to imapflow.
// ---------------------------------------------------------------------------

const mkBatchClient = () => {
  const calls = [];
  return { calls,
    mailboxOpen: async (m) => calls.push(['open', m]),
    messageFlagsAdd: async (u, f, o) => calls.push(['add', u, f, o]),
    messageFlagsRemove: async (u, f, o) => calls.push(['remove', u, f, o]),
    messageMove: async (u, d, o) => {
      calls.push(['move', u, d, o]);
      return { uidMap: uidMapFor(u) };
    },
  };
};

describe('batch UID array support', () => {
  it('addLabel passes comma-joined range and returns uid array', async () => {
    const c = mkBatchClient();
    const r = await addLabel(c, { uid: [5, 6], label: 'X', mailbox: 'INBOX' });
    expect(c.calls).toContainEqual(['add', '5,6', ['X'], { uid: true, useLabels: true }]);
    expect(r).toEqual({ uid: [5, 6], label: 'X', action: 'added' });
  });

  it('removeLabel passes comma-joined range and returns uid array', async () => {
    const c = mkBatchClient();
    const r = await removeLabel(c, { uid: [5, 6], label: 'X', mailbox: 'INBOX' });
    expect(c.calls).toContainEqual(['remove', '5,6', ['X'], { uid: true, useLabels: true }]);
    expect(r).toEqual({ uid: [5, 6], label: 'X', action: 'removed' });
  });

  it('archiveMessage passes comma-joined range and returns uid array', async () => {
    const c = mkBatchClient();
    const r = await archiveMessage(c, { uid: [5, 6] });
    expect(c.calls).toContainEqual(['move', '5,6', ALL_MAIL, { uid: true }]);
    expect(r).toEqual({ uid: [5, 6], mailbox: 'INBOX', action: 'archived' });
  });

  it('moveMessage passes comma-joined range and returns uid array', async () => {
    const c = mkBatchClient();
    const r = await moveMessage(c, { uid: [5, 6], destination: 'Saved' });
    expect(c.calls).toContainEqual(['move', '5,6', 'Saved', { uid: true }]);
    expect(r).toEqual({ uid: [5, 6], from: 'INBOX', to: 'Saved', action: 'moved' });
  });

  it('trashMessage passes comma-joined range and returns uid array', async () => {
    const c = mkBatchClient();
    const r = await trashMessage(c, { uid: [5, 6] });
    expect(c.calls).toContainEqual(['move', '5,6', TRASH, { uid: true }]);
    expect(r.uid).toEqual([5, 6]);
  });

  it('starMessage (on:true) passes comma-joined range and returns uid array', async () => {
    const c = mkBatchClient();
    await starMessage(c, { uid: [5, 6], on: true, mailbox: 'INBOX' });
    expect(c.calls).toContainEqual(['add', '5,6', ['\\Starred'], { uid: true, useLabels: true }]);
  });

  it('importantMessage (on:true) passes comma-joined range', async () => {
    const c = mkBatchClient();
    await importantMessage(c, { uid: [5, 6], on: true, mailbox: 'INBOX' });
    expect(c.calls).toContainEqual(['add', '5,6', ['\\Important'], { uid: true, useLabels: true }]);
  });

  it('markMessage (seen:true) passes comma-joined range and returns uid array', async () => {
    const c = mkBatchClient();
    const r = await markMessage(c, { uid: [5, 6], seen: true, mailbox: 'INBOX' });
    expect(c.calls).toContainEqual(['add', '5,6', ['\\Seen'], { uid: true }]);
    expect(r.uid).toEqual([5, 6]);
  });
});

// ---------------------------------------------------------------------------
// Removing a label from inside that label's own mailbox
// Gmail hides the selected mailbox's own label from X-GM-LABELS, so a
// `STORE -X-GM-LABELS (L)` while L is selected answers OK and changes nothing.
// The writer must MOVE to All Mail instead (verified, like archive).
// ---------------------------------------------------------------------------

describe('label removal from its own mailbox MOVEs to All Mail', () => {
  const noMove = () => ({ mailboxOpen: async () => {}, messageMove: async () => ({ path: 'Work', destination: ALL_MAIL }) });

  it('removeLabel with label === mailbox MOVEs to All Mail and never STOREs -label', async () => {
    const c = mkClient();
    const r = await removeLabel(c, { uid: '7', label: 'Work', mailbox: 'Work' });
    expect(c.calls).toContainEqual(['open', 'Work']);
    expect(c.calls).toContainEqual(['move', 7, ALL_MAIL, { uid: true }]);
    expect(c.calls.some((x) => x[0] === 'remove')).toBe(false);
    expect(r).toEqual({ uid: 7, label: 'Work', action: 'removed' });
  });

  it('removeLabel with label === mailbox keeps the uid-array return shape', async () => {
    const c = mkClient();
    const r = await removeLabel(c, { uid: [3, 4], label: 'Work', mailbox: 'Work' });
    expect(r).toEqual({ uid: [3, 4], label: 'Work', action: 'removed' });
  });

  it('removeLabel of a system label from its own mailbox (\\Starred in [Gmail]/Starred) MOVEs', async () => {
    const c = mkClient();
    await removeLabel(c, { uid: '7', label: '\\Starred', mailbox: '[Gmail]/Starred' });
    expect(c.calls).toContainEqual(['move', 7, ALL_MAIL, { uid: true }]);
    expect(c.calls.some((x) => x[0] === 'remove')).toBe(false);
  });

  it('removeLabel in its own mailbox throws InvalidInputError (exit 2) when nothing moved', async () => {
    const err = await removeLabel(noMove(), { uid: 7, label: 'Work', mailbox: 'Work' }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidInputError);
    expect(err.exitCode).toBe(2);
    expect(err.message).toMatch(/uid 7/);
    expect(err.message).toMatch(/Work/);
  });

  it('removeLabel in its own mailbox throws GmailError (exit 1) when the MOVE is rejected, and on a partial move', async () => {
    const rejected = await removeLabel({ mailboxOpen: async () => {}, messageMove: async () => false },
      { uid: 7, label: 'Work', mailbox: 'Work' }).catch((e) => e);
    expect(rejected).toBeInstanceOf(GmailError);
    expect(rejected).not.toBeInstanceOf(InvalidInputError);
    expect(rejected.exitCode).toBe(1);
    const partial = await removeLabel({ mailboxOpen: async () => {}, messageMove: async () => ({ uidMap: new Map([[5, 900]]) }) },
      { uid: [5, 6], label: 'Work', mailbox: 'Work' }).catch((e) => e);
    expect(partial).toBeInstanceOf(GmailError);
    expect(partial).not.toBeInstanceOf(InvalidInputError);
    expect(partial.message).toMatch(/1 of 2/);
  });

  it('removeLabel from another mailbox still STOREs -label (no MOVE)', async () => {
    const c = mkClient();
    await removeLabel(c, { uid: '7', label: 'Work', mailbox: 'INBOX' });
    expect(c.calls).toContainEqual(['remove', 7, ['Work'], { uid: true, useLabels: true }]);
    expect(c.calls.some((x) => x[0] === 'move')).toBe(false);
  });

  it('starMessage on:false in [Gmail]/Starred MOVEs to All Mail', async () => {
    const c = mkClient();
    const r = await starMessage(c, { uid: '7', on: false, mailbox: '[Gmail]/Starred' });
    expect(c.calls).toContainEqual(['move', 7, ALL_MAIL, { uid: true }]);
    expect(c.calls.some((x) => x[0] === 'remove')).toBe(false);
    expect(r).toEqual({ uid: 7, starred: false, action: 'unstarred' });
  });

  it('starMessage on:false in [Gmail]/Starred throws exit 2 when nothing moved', async () => {
    const err = await starMessage(noMove(), { uid: 7, on: false, mailbox: '[Gmail]/Starred' }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidInputError);
    expect(err.exitCode).toBe(2);
  });

  it('starMessage on:false in INBOX still STOREs -\\Starred', async () => {
    const c = mkClient();
    await starMessage(c, { uid: '7', on: false, mailbox: 'INBOX' });
    expect(c.calls).toContainEqual(['remove', 7, ['\\Starred'], { uid: true, useLabels: true }]);
    expect(c.calls.some((x) => x[0] === 'move')).toBe(false);
  });

  it('importantMessage on:false in [Gmail]/Important MOVEs to All Mail', async () => {
    const c = mkClient();
    const r = await importantMessage(c, { uid: '7', on: false, mailbox: '[Gmail]/Important' });
    expect(c.calls).toContainEqual(['move', 7, ALL_MAIL, { uid: true }]);
    expect(c.calls.some((x) => x[0] === 'remove')).toBe(false);
    expect(r).toEqual({ uid: 7, important: false, action: 'unmarked-important' });
  });

  it('importantMessage on:false in [Gmail]/Important throws exit 2 when nothing moved', async () => {
    const err = await importantMessage(noMove(), { uid: 7, on: false, mailbox: '[Gmail]/Important' }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidInputError);
    expect(err.exitCode).toBe(2);
  });

  it('importantMessage on:false in INBOX still STOREs -\\Important', async () => {
    const c = mkClient();
    await importantMessage(c, { uid: '7', on: false, mailbox: 'INBOX' });
    expect(c.calls).toContainEqual(['remove', 7, ['\\Important'], { uid: true, useLabels: true }]);
    expect(c.calls.some((x) => x[0] === 'move')).toBe(false);
  });

  it('adding a label/star/important while in its own mailbox is unchanged (STORE +label, no MOVE)', async () => {
    const c = mkClient();
    await addLabel(c, { uid: '7', label: 'Work', mailbox: 'Work' });
    await starMessage(c, { uid: '7', on: true, mailbox: '[Gmail]/Starred' });
    await importantMessage(c, { uid: '7', on: true, mailbox: '[Gmail]/Important' });
    expect(c.calls).toContainEqual(['add', 7, ['Work'], { uid: true, useLabels: true }]);
    expect(c.calls).toContainEqual(['add', 7, ['\\Starred'], { uid: true, useLabels: true }]);
    expect(c.calls).toContainEqual(['add', 7, ['\\Important'], { uid: true, useLabels: true }]);
    expect(c.calls.some((x) => x[0] === 'move')).toBe(false);
  });

  it('markMessage seen:false in any mailbox still STOREs -\\Seen (a real IMAP flag, not a label)', async () => {
    const c = mkClient();
    await markMessage(c, { uid: '7', seen: false, mailbox: '[Gmail]/Starred' });
    expect(c.calls).toContainEqual(['remove', 7, ['\\Seen'], { uid: true }]);
    expect(c.calls.some((x) => x[0] === 'move')).toBe(false);
  });

  // Regression guard: no writer may STORE -<label> while <label> (or its system mailbox) is selected.
  it('regression guard: no writer STOREs -<label> while that label\'s mailbox is selected', async () => {
    const cases = [
      [removeLabel, { uid: 7, label: 'Work', mailbox: 'Work' }],
      [removeLabel, { uid: 7, label: 'Parent/Child', mailbox: 'Parent/Child' }],
      [removeLabel, { uid: 7, label: '\\Starred', mailbox: '[Gmail]/Starred' }],
      [removeLabel, { uid: 7, label: '\\Important', mailbox: '[Gmail]/Important' }],
      [removeLabel, { uid: [7, 8], label: 'Work', mailbox: 'Work' }],
      [starMessage, { uid: 7, on: false, mailbox: '[Gmail]/Starred' }],
      [importantMessage, { uid: 7, on: false, mailbox: '[Gmail]/Important' }],
    ];
    const MAILBOX_OF = { '\\Starred': '[Gmail]/Starred', '\\Important': '[Gmail]/Important' };
    for (const [fn, opts] of cases) {
      const c = mkClient();
      await fn(c, opts);
      let selected = null;
      for (const [op, arg, flags] of c.calls) {
        if (op === 'open') selected = arg;
        if (op === 'remove') {
          for (const f of flags) expect(MAILBOX_OF[f] ?? f, `${fn.name} ${JSON.stringify(opts)}`).not.toBe(selected);
        }
      }
      expect(c.calls.some((x) => x[0] === 'move' && x[2] === ALL_MAIL), `${fn.name} ${JSON.stringify(opts)}`).toBe(true);
    }
  });
});
