import { describe, it, expect } from 'vitest';
import { listMessages, searchMessages, showMessage, getThread, listLabels } from '../src/reader.js';
import { InvalidInputError } from '../src/lib/errors.js';

// ---------------------------------------------------------------------------
// Fake imapflow client
// ---------------------------------------------------------------------------

function fakeClient({ mailboxes = [], searchUids = [], messages = {} } = {}) {
  return {
    opened: null,
    async mailboxOpen(path) {
      this.opened = path;
      return { exists: searchUids.length };
    },
    async list() {
      return mailboxes;
    },
    async search(criteria, opts) {
      this._lastSearch = criteria;
      return searchUids;
    },
    fetch(range, query, opts) {
      this._lastFetch = { range, query };
      const uids = Array.isArray(range) ? range : [range];
      async function* gen() {
        for (const u of uids) yield messages[u] || { uid: u, envelope: {} };
      }
      return gen();
    },
  };
}

// Minimal fake parseMessage that returns a stable parsed object.
function fakeParse(text = 'body text') {
  return async () => ({ text, html: false, attachments: [] });
}

// Build a fake imap message with enough fields for normalizeMessage.
function makeMsg(uid, overrides = {}) {
  return {
    uid,
    envelope: {
      subject: `Subject ${uid}`,
      from: [{ address: `from${uid}@example.com` }],
      to: [{ address: 'to@example.com' }],
      date: new Date(uid * 1000).toISOString(),
      messageId: `<msg${uid}@example.com>`,
    },
    threadId: `thread${uid}`,
    labels: new Set(['\\Inbox']),
    flags: new Set(['\\Seen']),
    source: Buffer.from(`raw source ${uid}`),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// listMessages
// ---------------------------------------------------------------------------

describe('listMessages', () => {
  it('opens the specified mailbox', async () => {
    const client = fakeClient({ searchUids: [1, 2], messages: { 1: makeMsg(1), 2: makeMsg(2) } });
    await listMessages(client, { mailbox: 'INBOX', limit: 20 });
    expect(client.opened).toBe('INBOX');
  });

  it('defaults to INBOX when no mailbox provided', async () => {
    const client = fakeClient({ searchUids: [1], messages: { 1: makeMsg(1) } });
    await listMessages(client);
    expect(client.opened).toBe('INBOX');
  });

  it('searches {all:true} when unread is false', async () => {
    const client = fakeClient({ searchUids: [1], messages: { 1: makeMsg(1) } });
    await listMessages(client, { unread: false });
    expect(client._lastSearch).toMatchObject({ all: true });
  });

  it('searches {seen:false} when unread is true', async () => {
    const client = fakeClient({ searchUids: [1], messages: { 1: makeMsg(1) } });
    await listMessages(client, { unread: true });
    expect(client._lastSearch).toMatchObject({ seen: false });
  });

  it('returns normalized messages newest-first (descending UID)', async () => {
    const msgs = { 1: makeMsg(1), 2: makeMsg(2), 3: makeMsg(3) };
    const client = fakeClient({ searchUids: [1, 2, 3], messages: msgs });
    const result = await listMessages(client, { limit: 20 });

    expect(result).toHaveLength(3);
    // Newest first — UID 3 before UID 2 before UID 1
    expect(result[0].uid).toBe(3);
    expect(result[1].uid).toBe(2);
    expect(result[2].uid).toBe(1);
  });

  it('respects limit: fetches only the last N UIDs', async () => {
    const msgs = { 1: makeMsg(1), 2: makeMsg(2), 3: makeMsg(3), 4: makeMsg(4) };
    const client = fakeClient({ searchUids: [1, 2, 3, 4], messages: msgs });
    const result = await listMessages(client, { limit: 2 });

    expect(result).toHaveLength(2);
    // Should have taken the LAST 2 UIDs (3, 4)
    const uids = result.map((m) => m.uid).sort((a, b) => a - b);
    expect(uids).toEqual([3, 4]);
  });

  it('returns an empty array when there are no messages', async () => {
    const client = fakeClient({ searchUids: [], messages: {} });
    const result = await listMessages(client, { limit: 20 });
    expect(result).toEqual([]);
  });

  it('returns normalized message objects with expected fields', async () => {
    const client = fakeClient({ searchUids: [5], messages: { 5: makeMsg(5) } });
    const result = await listMessages(client, { limit: 20 });

    expect(result[0]).toMatchObject({
      uid: 5,
      subject: 'Subject 5',
      from: ['from5@example.com'],
    });
  });
});

// ---------------------------------------------------------------------------
// searchMessages
// ---------------------------------------------------------------------------

describe('searchMessages', () => {
  it('opens the specified mailbox', async () => {
    const client = fakeClient({ searchUids: [1], messages: { 1: makeMsg(1) } });
    await searchMessages(client, { query: 'hello', mailbox: 'INBOX' });
    expect(client.opened).toBe('INBOX');
  });

  it('uses gmraw search criteria with the given query string', async () => {
    const client = fakeClient({ searchUids: [1], messages: { 1: makeMsg(1) } });
    await searchMessages(client, { query: 'from:alice subject:test' });
    expect(client._lastSearch).toMatchObject({ gmraw: 'from:alice subject:test' });
  });

  it('respects limit: takes the last N UIDs', async () => {
    const msgs = {};
    for (let i = 1; i <= 5; i++) msgs[i] = makeMsg(i);
    const client = fakeClient({ searchUids: [1, 2, 3, 4, 5], messages: msgs });
    const result = await searchMessages(client, { query: 'test', limit: 3 });

    expect(result).toHaveLength(3);
    const uids = result.map((m) => m.uid).sort((a, b) => a - b);
    expect(uids).toEqual([3, 4, 5]);
  });

  it('returns results newest-first', async () => {
    const msgs = { 10: makeMsg(10), 20: makeMsg(20), 30: makeMsg(30) };
    const client = fakeClient({ searchUids: [10, 20, 30], messages: msgs });
    const result = await searchMessages(client, { query: 'test', limit: 20 });

    expect(result[0].uid).toBe(30);
    expect(result[1].uid).toBe(20);
    expect(result[2].uid).toBe(10);
  });

  it('returns empty array when no matches', async () => {
    const client = fakeClient({ searchUids: [], messages: {} });
    const result = await searchMessages(client, { query: 'nothing' });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// showMessage
// ---------------------------------------------------------------------------

describe('showMessage', () => {
  it('fetches by UID when target is a numeric string', async () => {
    const msg = makeMsg(42);
    const client = fakeClient({ searchUids: [], messages: { 42: msg } });
    const deps = { parseMessage: fakeParse('hello body') };

    const result = await showMessage(client, { target: '42' }, deps);

    expect(result.uid).toBe(42);
    expect(result.text).toBe('hello body');
  });

  it('fetches by UID when target is a number', async () => {
    const msg = makeMsg(99);
    const client = fakeClient({ searchUids: [], messages: { 99: msg } });
    const deps = { parseMessage: fakeParse('body content') };

    const result = await showMessage(client, { target: 99 }, deps);

    expect(result.uid).toBe(99);
  });

  it('calls deps.parseMessage with the message source', async () => {
    const source = Buffer.from('raw bytes here');
    const msg = { ...makeMsg(7), source };
    const client = fakeClient({ messages: { 7: msg } });

    let capturedSource;
    const deps = {
      parseMessage: async (src) => {
        capturedSource = src;
        return { text: 'parsed', html: null, attachments: [] };
      },
    };

    await showMessage(client, { target: '7' }, deps);

    expect(capturedSource).toBe(source);
  });

  it('includes full body and attachments from parseMessage', async () => {
    const msg = makeMsg(1);
    const client = fakeClient({ messages: { 1: msg } });
    const deps = {
      parseMessage: async () => ({
        text: 'full text',
        html: '<p>html</p>',
        attachments: [{ filename: 'f.txt', size: 100, contentType: 'text/plain' }],
      }),
    };

    const result = await showMessage(client, { target: '1' }, deps);

    expect(result.text).toBe('full text');
    expect(result.html).toBe('<p>html</p>');
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].filename).toBe('f.txt');
  });

  it('resolves a Message-ID to UID via gmraw search', async () => {
    const msg = makeMsg(55);
    // search returns [55] for rfc822msgid lookup
    const client = fakeClient({ searchUids: [55], messages: { 55: msg } });
    const deps = { parseMessage: fakeParse('body') };

    const result = await showMessage(client, { target: '<msg55@example.com>' }, deps);

    expect(client._lastSearch).toMatchObject({ gmraw: 'rfc822msgid:<msg55@example.com>' });
    expect(result.uid).toBe(55);
  });

  it('throws InvalidInputError when Message-ID resolves to nothing', async () => {
    const client = fakeClient({ searchUids: [], messages: {} });
    const deps = { parseMessage: fakeParse() };

    await expect(
      showMessage(client, { target: '<missing@example.com>' }, deps),
    ).rejects.toThrow(InvalidInputError);
  });

  it('throws InvalidInputError when numeric UID is not found in fetch', async () => {
    // Fetch yields nothing for unknown UID
    const client = {
      opened: null,
      async mailboxOpen(path) {
        this.opened = path;
        return { exists: 0 };
      },
      async search() {
        return [];
      },
      fetch(range) {
        async function* gen() {
          /* yields nothing */
        }
        return gen();
      },
    };
    const deps = { parseMessage: fakeParse() };

    await expect(showMessage(client, { target: '999' }, deps)).rejects.toThrow(InvalidInputError);
  });
});

// ---------------------------------------------------------------------------
// getThread
// ---------------------------------------------------------------------------

describe('getThread', () => {
  it('opens [Gmail]/All Mail by default', async () => {
    const client = fakeClient({ searchUids: [1], messages: { 1: makeMsg(1) } });
    await getThread(client, { threadId: 'abc123' });
    expect(client.opened).toBe('[Gmail]/All Mail');
  });

  it('searches using threadid:<threadId> gmraw query', async () => {
    const client = fakeClient({ searchUids: [1], messages: { 1: makeMsg(1) } });
    await getThread(client, { threadId: 'mythread123' });
    expect(client._lastSearch).toMatchObject({ gmraw: 'threadid:mythread123' });
  });

  it('returns messages ordered by date ascending', async () => {
    // makeMsg uses uid*1000 as the epoch ms for date, so higher uid = later date
    const msgs = {
      1: makeMsg(1),
      2: makeMsg(2),
      3: makeMsg(3),
    };
    const client = fakeClient({ searchUids: [3, 1, 2], messages: msgs });
    const result = await getThread(client, { threadId: 'thread1' });

    expect(result).toHaveLength(3);
    // Ascending: uid 1 (earliest) → uid 2 → uid 3 (latest)
    expect(result[0].uid).toBe(1);
    expect(result[1].uid).toBe(2);
    expect(result[2].uid).toBe(3);
  });

  it('returns empty array when thread has no messages', async () => {
    const client = fakeClient({ searchUids: [], messages: {} });
    const result = await getThread(client, { threadId: 'ghost' });
    expect(result).toEqual([]);
  });

  it('normalizes messages (header-level, no body)', async () => {
    const client = fakeClient({ searchUids: [7], messages: { 7: makeMsg(7) } });
    const result = await getThread(client, { threadId: 'x' });

    expect(result[0]).toMatchObject({ uid: 7, subject: 'Subject 7' });
    expect(result[0].text).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listLabels
// ---------------------------------------------------------------------------

describe('listLabels', () => {
  it('returns mapped label objects from client.list()', async () => {
    const mailboxes = [
      { name: 'INBOX', path: 'INBOX', specialUse: '\\Inbox', flags: new Set() },
      { name: '[Gmail]/Sent Mail', path: '[Gmail]/Sent Mail', specialUse: '\\Sent', flags: new Set() },
      { name: 'MyLabel', path: 'MyLabel', flags: new Set() },
    ];
    const client = fakeClient({ mailboxes });

    const result = await listLabels(client);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: 'INBOX', path: 'INBOX', specialUse: '\\Inbox' });
    expect(result[1]).toEqual({ name: '[Gmail]/Sent Mail', path: '[Gmail]/Sent Mail', specialUse: '\\Sent' });
    expect(result[2]).toEqual({ name: 'MyLabel', path: 'MyLabel', specialUse: null });
  });

  it('returns empty array when there are no mailboxes', async () => {
    const client = fakeClient({ mailboxes: [] });
    const result = await listLabels(client);
    expect(result).toEqual([]);
  });

  it('sets specialUse to null when the property is absent', async () => {
    const mailboxes = [{ name: 'Custom', path: 'Custom', flags: new Set() }];
    const client = fakeClient({ mailboxes });
    const result = await listLabels(client);
    expect(result[0].specialUse).toBeNull();
  });
});
