import { join, resolve, sep } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { runReadList, runReadSearch, runReadShow, runReadThread, runReadCount, runReadDownload } from '../src/commands/read.js';
import { buildProgram } from '../src/cli.js';
import { resolveCapabilities } from '../src/capabilities.js';
import { InvalidInputError } from '../src/lib/errors.js';

// ---------------------------------------------------------------------------
// Fake imap message factory
// ---------------------------------------------------------------------------

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
// Fake client + deps builder
// ---------------------------------------------------------------------------

/**
 * Build a fake deps bundle with a fake imap client.
 *
 * @param {object} [options]
 * @param {boolean} [options.throwInOp]  If true, the client's search() throws.
 * @param {object}  [options.messages]   Map of uid → message object.
 * @param {number[]} [options.searchUids] UIDs returned by search().
 */
function makeDeps({ throwInOp = false, messages = {}, searchUids = [1] } = {}) {
  const client = {
    connected: false,
    loggedOut: false,

    async connect() {
      this.connected = true;
    },

    async logout() {
      this.loggedOut = true;
    },

    async mailboxOpen(path) {
      this.opened = path;
      return { exists: searchUids.length };
    },

    async search(criteria, _opts) {
      if (throwInOp) throw new Error('search exploded');
      this._lastSearch = criteria;
      return searchUids;
    },

    async list() {
      return [];
    },

    fetch(range, _query, _opts) {
      const uids = Array.isArray(range) ? range : [range];
      const msgs = messages;
      async function* gen() {
        for (const u of uids) {
          yield msgs[u] || { uid: u, envelope: {}, labels: new Set(), flags: new Set() };
        }
      }
      return gen();
    },
  };

  return {
    resolveProfile: vi.fn(() => ({
      name: '(default)',
      legacy: true,
      credentialsPath: '/credentials.json',
      imap: {},
      capabilities: resolveCapabilities({}),
    })),
    resolveCredentials: vi.fn(() => ({ user: 'u@example.com', appPassword: 'pw' })),
    createImapClient: vi.fn(() => client),
    parseMessage: vi.fn(async () => ({ text: 'parsed body', html: false, attachments: [] })),
    _client: client,
  };
}

// ---------------------------------------------------------------------------
// withClient lifecycle: connect + logout
// ---------------------------------------------------------------------------

describe('withClient lifecycle', () => {
  it('calls connect() and logout() on success', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    await runReadList({}, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });

  it('calls logout() even when the operation throws', async () => {
    const deps = makeDeps({ throwInOp: true });
    await expect(runReadList({}, deps)).rejects.toThrow('search exploded');
    expect(deps._client.loggedOut).toBe(true);
  });

  it('propagates the error from a failed operation', async () => {
    const deps = makeDeps({ throwInOp: true });
    await expect(runReadList({}, deps)).rejects.toThrow('search exploded');
  });
});

// ---------------------------------------------------------------------------
// runReadList
// ---------------------------------------------------------------------------

describe('runReadList', () => {
  it('returns { messages: [...] }', async () => {
    const msgs = { 1: makeMsg(1), 2: makeMsg(2) };
    const deps = makeDeps({ messages: msgs, searchUids: [1, 2] });
    const result = await runReadList({ mailbox: 'INBOX', limit: '20' }, deps);
    expect(result).toHaveProperty('messages');
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it('returns normalized message objects with uid and subject', async () => {
    const msgs = { 5: makeMsg(5) };
    const deps = makeDeps({ messages: msgs, searchUids: [5] });
    const result = await runReadList({ mailbox: 'INBOX', limit: '20' }, deps);
    expect(result.messages[0]).toMatchObject({ uid: 5, subject: 'Subject 5' });
  });

  it('passes limit as a number to reader.listMessages', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    // limit: '5' (string from CLI option) — should not crash
    await expect(runReadList({ mailbox: 'INBOX', limit: '5' }, deps)).resolves.toBeDefined();
  });

  it('defaults limit to 20 when opts.limit is absent', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    await expect(runReadList({ mailbox: 'INBOX' }, deps)).resolves.toBeDefined();
  });

  it('passes unread flag correctly', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    await runReadList({ mailbox: 'INBOX', unread: true }, deps);
    expect(deps._client._lastSearch).toMatchObject({ seen: false });
  });

  it('uses createImapClient with resolved credentials', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    await runReadList({}, deps);
    expect(deps.createImapClient).toHaveBeenCalledWith(
      { user: 'u@example.com', appPassword: 'pw' },
      {},
    );
  });
});

// ---------------------------------------------------------------------------
// runReadSearch
// ---------------------------------------------------------------------------

describe('runReadSearch', () => {
  it('returns { messages: [...] }', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    const result = await runReadSearch({ query: 'from:alice', mailbox: 'INBOX' }, deps);
    expect(result).toHaveProperty('messages');
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it('passes the query as a gmraw search', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    await runReadSearch({ query: 'subject:hello', mailbox: 'INBOX' }, deps);
    expect(deps._client._lastSearch).toMatchObject({ gmraw: 'subject:hello' });
  });

  it('calls connect() and logout()', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    await runReadSearch({ query: 'test' }, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runReadShow
// ---------------------------------------------------------------------------

describe('runReadShow', () => {
  it('returns { message } with a body from parseMessage', async () => {
    const msgs = { 42: makeMsg(42) };
    const deps = makeDeps({ messages: msgs, searchUids: [42] });
    const result = await runReadShow({ target: '42', mailbox: 'INBOX' }, deps);
    expect(result).toHaveProperty('message');
    expect(result.message.uid).toBe(42);
    expect(result.message.text).toBe('parsed body');
  });

  it('calls deps.parseMessage for body parsing', async () => {
    const msgs = { 7: makeMsg(7) };
    const deps = makeDeps({ messages: msgs, searchUids: [7] });
    await runReadShow({ target: '7', mailbox: 'INBOX' }, deps);
    expect(deps.parseMessage).toHaveBeenCalled();
  });

  it('calls connect() and logout()', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    await runReadShow({ target: '1', mailbox: 'INBOX' }, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });

  it('logout() still called when show operation throws (unknown UID)', async () => {
    // fetch yields nothing for the UID → InvalidInputError from reader.showMessage
    const deps = makeDeps({ messages: {}, searchUids: [] });
    // Override fetch to yield nothing
    deps._client.fetch = function () {
      async function* gen() { /* nothing */ }
      return gen();
    };
    await expect(runReadShow({ target: '999', mailbox: 'INBOX' }, deps)).rejects.toThrow();
    expect(deps._client.loggedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runReadThread
// ---------------------------------------------------------------------------

describe('runReadThread', () => {
  it('returns { messages: [...] }', async () => {
    const msgs = { 1: makeMsg(1), 2: makeMsg(2) };
    const deps = makeDeps({ messages: msgs, searchUids: [1, 2] });
    const result = await runReadThread({ threadId: 'thread123', mailbox: '[Gmail]/All Mail' }, deps);
    expect(result).toHaveProperty('messages');
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it('searches with threadid gmraw query', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    await runReadThread({ threadId: 'abc123' }, deps);
    expect(deps._client._lastSearch).toMatchObject({ gmraw: 'threadid:abc123' });
  });

  it('calls connect() and logout()', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    await runReadThread({ threadId: 'x' }, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CLI integration
// ---------------------------------------------------------------------------

describe('CLI integration — read list', () => {
  it('parses read list without error', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    // Suppress stdout output during the test
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await buildProgram(deps).parseAsync(['node', 'gmail', 'read', 'list'], { from: 'node' });
    } finally {
      process.stdout.write = origWrite;
    }
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });

  it('parses read search <query> without error', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await buildProgram(deps).parseAsync(
        ['node', 'gmail', 'read', 'search', 'from:alice'],
        { from: 'node' },
      );
    } finally {
      process.stdout.write = origWrite;
    }
    expect(deps._client._lastSearch).toMatchObject({ gmraw: 'from:alice' });
  });

  it('parses read show <target> without error', async () => {
    const msgs = { 5: makeMsg(5) };
    const deps = makeDeps({ messages: msgs, searchUids: [5] });
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await buildProgram(deps).parseAsync(
        ['node', 'gmail', 'read', 'show', '5'],
        { from: 'node' },
      );
    } finally {
      process.stdout.write = origWrite;
    }
    expect(deps._client.loggedOut).toBe(true);
  });

  it('parses read thread <threadId> without error', async () => {
    const msgs = { 1: makeMsg(1) };
    const deps = makeDeps({ messages: msgs, searchUids: [1] });
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await buildProgram(deps).parseAsync(
        ['node', 'gmail', 'read', 'thread', 'thread123'],
        { from: 'node' },
      );
    } finally {
      process.stdout.write = origWrite;
    }
    expect(deps._client.loggedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runReadCount
// ---------------------------------------------------------------------------

describe('runReadCount', () => {
  it('returns { mailbox, total, unread } via reader.countMessages', async () => {
    const deps = makeDeps({ searchUids: [1, 2, 3] });
    // reader.countMessages calls client.status() — add it to the fake client
    deps._client.status = vi.fn(async () => ({ messages: 10, unseen: 3 }));

    const result = await runReadCount({ mailbox: 'INBOX' }, deps);
    expect(result).toHaveProperty('mailbox', 'INBOX');
    expect(result).toHaveProperty('total', 10);
    expect(result).toHaveProperty('unread', 3);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });

  it('calls connect() and logout()', async () => {
    const deps = makeDeps({ searchUids: [1] });
    deps._client.status = vi.fn(async () => ({ messages: 5, unseen: 1 }));
    await runReadCount({ mailbox: 'INBOX' }, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runReadDownload
// ---------------------------------------------------------------------------

describe('runReadDownload', () => {
  it('fetches raw message, parses it, writes each attachment, returns result', async () => {
    const dir = '/tmp/out';
    const content = Buffer.from('xx');
    const deps = makeDeps({ messages: { 7: makeMsg(7) }, searchUids: [7] });
    // Override parseMessage to return an attachment
    deps.parseMessage = vi.fn(async () => ({
      attachments: [{ filename: 'a.pdf', content, size: 2 }],
    }));
    deps.writeFile = vi.fn();
    // Patch fetch so it yields the raw source for uid 7
    deps._client.fetch = function () {
      async function* gen() {
        yield makeMsg(7);
      }
      return gen();
    };

    const result = await runReadDownload({ target: '7', mailbox: 'INBOX', dir }, deps);
    expect(deps.writeFile).toHaveBeenCalledWith(resolve(dir, 'a.pdf'), content);
    expect(result).toEqual({
      uid: 7,
      dir: resolve(dir),
      attachments: [{ filename: 'a.pdf', bytes: 2, path: resolve(dir, 'a.pdf') }],
    });
    expect(deps._client.loggedOut).toBe(true);
  });

  it('returns empty attachments array when message has none', async () => {
    const dir = '/tmp/out';
    const deps = makeDeps({ messages: { 3: makeMsg(3) }, searchUids: [3] });
    deps.parseMessage = vi.fn(async () => ({ attachments: [] }));
    deps.writeFile = vi.fn();
    deps._client.fetch = function () {
      async function* gen() { yield makeMsg(3); }
      return gen();
    };

    const result = await runReadDownload({ target: '3', mailbox: 'INBOX', dir }, deps);
    expect(result.attachments).toEqual([]);
    expect(deps.writeFile).not.toHaveBeenCalled();
  });

  it('throws InvalidInputError when raw message is not found', async () => {
    const deps = makeDeps({ messages: {}, searchUids: [] });
    deps.parseMessage = vi.fn();
    deps.writeFile = vi.fn();
    // Override fetch to yield nothing
    deps._client.fetch = function () {
      async function* gen() { /* nothing */ }
      return gen();
    };

    await expect(
      runReadDownload({ target: '999', mailbox: 'INBOX', dir: '/tmp' }, deps),
    ).rejects.toThrow(InvalidInputError);
    expect(deps._client.loggedOut).toBe(true);
  });

  it('sanitizes path-traversal and absolute-path filenames to a basename inside dir', async () => {
    const dir = '/tmp/out';
    const outDir = resolve(dir);
    const deps = makeDeps({ messages: { 8: makeMsg(8) }, searchUids: [8] });
    deps.parseMessage = vi.fn(async () => ({
      attachments: [
        { filename: '../evil.txt', content: Buffer.from('a'), size: 1 },
        { filename: '/tmp/evil.txt', content: Buffer.from('b'), size: 1 },
      ],
    }));
    deps.writeFile = vi.fn();
    deps._client.fetch = function () {
      async function* gen() { yield makeMsg(8); }
      return gen();
    };

    const result = await runReadDownload({ target: '8', mailbox: 'INBOX', dir }, deps);

    // Every written path stays inside the resolved output dir and carries no `..` escape.
    for (const [path] of deps.writeFile.mock.calls) {
      expect(path.startsWith(outDir + sep)).toBe(true);
      expect(path.includes(`..${sep}`)).toBe(false);
    }
    // Both traversal attempts collapse to the same in-dir basename.
    expect(deps.writeFile).toHaveBeenCalledWith(join(outDir, 'evil.txt'), Buffer.from('a'));
    expect(deps.writeFile).toHaveBeenCalledWith(join(outDir, 'evil.txt'), Buffer.from('b'));
    expect(result.attachments.every((a) => a.filename === 'evil.txt')).toBe(true);
    expect(result.attachments.every((a) => a.path.startsWith(outDir + sep))).toBe(true);
  });

  it('writes attachment correctly when outDir is the filesystem root (/)', async () => {
    const deps = makeDeps({ messages: { 9: makeMsg(9) }, searchUids: [9] });
    deps.parseMessage = vi.fn(async () => ({
      attachments: [{ filename: 'report.pdf', content: Buffer.from('data'), size: 4 }],
    }));
    deps.writeFile = vi.fn();
    deps._client.fetch = function () {
      async function* gen() { yield makeMsg(9); }
      return gen();
    };

    // dir: '/' — outDir resolves to '/'
    const result = await runReadDownload({ target: '9', mailbox: 'INBOX', dir: '/' }, deps);
    expect(deps.writeFile).toHaveBeenCalledWith('/report.pdf', Buffer.from('data'));
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].filename).toBe('report.pdf');
  });
});
