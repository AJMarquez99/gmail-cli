import { describe, it, expect, vi } from 'vitest';
import { runLabelList, runLabelAdd, runLabelRemove } from '../src/commands/label.js';
import { buildProgram } from '../src/cli.js';
import { InvalidInputError } from '../src/lib/errors.js';

// ---------------------------------------------------------------------------
// Fake client + deps builder
// ---------------------------------------------------------------------------

/**
 * Build a fake deps bundle with a fake imap client that supports label ops.
 *
 * @param {object} [options]
 * @param {Array}  [options.labelList]     Mailboxes returned by client.list().
 * @param {boolean} [options.throwInOp]   If true, messageFlagsAdd/Remove throws.
 */
function makeDeps({ labelList = [], throwInOp = false } = {}) {
  const client = {
    connected: false,
    loggedOut: false,
    _mailboxOpened: null,
    _flagsAddCalls: [],
    _flagsRemoveCalls: [],

    async connect() {
      this.connected = true;
    },

    async logout() {
      this.loggedOut = true;
    },

    async mailboxOpen(path) {
      this._mailboxOpened = path;
      return { exists: 1 };
    },

    async list() {
      return labelList;
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

  return {
    resolveProfile: vi.fn(() => ({
      name: '(default)',
      legacy: true,
      credentialsPath: '/credentials.json',
      imap: {},
    })),
    resolveCredentials: vi.fn(() => ({ user: 'u@example.com', appPassword: 'pw' })),
    createImapClient: vi.fn(() => client),
    parseMessage: vi.fn(async () => ({ text: 'parsed body', html: false, attachments: [] })),
    _client: client,
  };
}

// ---------------------------------------------------------------------------
// runLabelList
// ---------------------------------------------------------------------------

describe('runLabelList', () => {
  it('returns { labels } from client.list()', async () => {
    const labels = [
      { name: 'INBOX', path: 'INBOX', specialUse: '\\Inbox' },
      { name: 'work', path: 'work', specialUse: null },
    ];
    const deps = makeDeps({ labelList: labels });
    const result = await runLabelList({}, deps);
    expect(result).toHaveProperty('labels');
    expect(result.labels).toHaveLength(2);
    expect(result.labels[0]).toMatchObject({ name: 'INBOX', path: 'INBOX' });
  });

  it('returns { labels: [] } when there are no mailboxes', async () => {
    const deps = makeDeps({ labelList: [] });
    const result = await runLabelList({}, deps);
    expect(result.labels).toEqual([]);
  });

  it('calls connect() and logout() on success', async () => {
    const deps = makeDeps();
    await runLabelList({}, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runLabelAdd
// ---------------------------------------------------------------------------

describe('runLabelAdd', () => {
  it('opens the mailbox and calls messageFlagsAdd with correct args', async () => {
    const deps = makeDeps();
    await runLabelAdd({ uid: '42', name: 'work', mailbox: 'INBOX' }, deps);
    expect(deps._client._mailboxOpened).toBe('INBOX');
    const call = deps._client._flagsAddCalls[0];
    expect(call.uid).toBe(42);
    expect(call.flags).toEqual(['work']);
    expect(call.opts).toMatchObject({ uid: true, useLabels: true });
  });

  it('returns { uid, label, action: "added" }', async () => {
    const deps = makeDeps();
    const result = await runLabelAdd({ uid: '42', name: 'work', mailbox: 'INBOX' }, deps);
    expect(result).toEqual({ uid: 42, label: 'work', action: 'added' });
  });

  it('coerces uid to a number', async () => {
    const deps = makeDeps();
    await runLabelAdd({ uid: '7', name: 'inbox', mailbox: 'INBOX' }, deps);
    expect(deps._client._flagsAddCalls[0].uid).toBe(7);
  });

  it('calls connect() and logout() on success', async () => {
    const deps = makeDeps();
    await runLabelAdd({ uid: '1', name: 'tag', mailbox: 'INBOX' }, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });

  it('calls logout() even when messageFlagsAdd throws', async () => {
    const deps = makeDeps({ throwInOp: true });
    await expect(runLabelAdd({ uid: '1', name: 'tag', mailbox: 'INBOX' }, deps)).rejects.toThrow('flagsAdd exploded');
    expect(deps._client.loggedOut).toBe(true);
  });

  it('throws InvalidInputError and does NOT connect when uid is missing', async () => {
    const deps = makeDeps();
    await expect(runLabelAdd({ name: 'work' }, deps)).rejects.toBeInstanceOf(InvalidInputError);
    expect(deps._client.connected).toBe(false);
  });

  it('throws InvalidInputError and does NOT connect when name is missing', async () => {
    const deps = makeDeps();
    await expect(runLabelAdd({ uid: '42' }, deps)).rejects.toBeInstanceOf(InvalidInputError);
    expect(deps._client.connected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runLabelRemove
// ---------------------------------------------------------------------------

describe('runLabelRemove', () => {
  it('opens the mailbox and calls messageFlagsRemove with correct args', async () => {
    const deps = makeDeps();
    await runLabelRemove({ uid: '99', name: 'work', mailbox: 'INBOX' }, deps);
    expect(deps._client._mailboxOpened).toBe('INBOX');
    const call = deps._client._flagsRemoveCalls[0];
    expect(call.uid).toBe(99);
    expect(call.flags).toEqual(['work']);
    expect(call.opts).toMatchObject({ uid: true, useLabels: true });
  });

  it('returns { uid, label, action: "removed" }', async () => {
    const deps = makeDeps();
    const result = await runLabelRemove({ uid: '99', name: 'work', mailbox: 'INBOX' }, deps);
    expect(result).toEqual({ uid: 99, label: 'work', action: 'removed' });
  });

  it('coerces uid to a number', async () => {
    const deps = makeDeps();
    await runLabelRemove({ uid: '5', name: 'inbox', mailbox: 'INBOX' }, deps);
    expect(deps._client._flagsRemoveCalls[0].uid).toBe(5);
  });

  it('calls connect() and logout() on success', async () => {
    const deps = makeDeps();
    await runLabelRemove({ uid: '1', name: 'tag', mailbox: 'INBOX' }, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });

  it('calls logout() even when messageFlagsRemove throws', async () => {
    const deps = makeDeps({ throwInOp: true });
    await expect(runLabelRemove({ uid: '1', name: 'tag', mailbox: 'INBOX' }, deps)).rejects.toThrow('flagsRemove exploded');
    expect(deps._client.loggedOut).toBe(true);
  });

  it('throws InvalidInputError and does NOT connect when uid is missing', async () => {
    const deps = makeDeps();
    await expect(runLabelRemove({ name: 'work' }, deps)).rejects.toBeInstanceOf(InvalidInputError);
    expect(deps._client.connected).toBe(false);
  });

  it('throws InvalidInputError and does NOT connect when name is missing', async () => {
    const deps = makeDeps();
    await expect(runLabelRemove({ uid: '99' }, deps)).rejects.toBeInstanceOf(InvalidInputError);
    expect(deps._client.connected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CLI integration
// ---------------------------------------------------------------------------

describe('CLI integration — label add', () => {
  it('calls messageFlagsAdd with uid 42, ["work"], useLabels:true', async () => {
    const deps = makeDeps();
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await buildProgram(deps).parseAsync(
        ['node', 'gmail', 'label', 'add', '42', 'work'],
        { from: 'node' },
      );
    } finally {
      process.stdout.write = origWrite;
    }
    const call = deps._client._flagsAddCalls[0];
    expect(call.uid).toBe(42);
    expect(call.flags).toEqual(['work']);
    expect(call.opts).toMatchObject({ uid: true, useLabels: true });
  });
});

describe('CLI integration — label remove', () => {
  it('calls messageFlagsRemove with uid 10, ["old"], useLabels:true', async () => {
    const deps = makeDeps();
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await buildProgram(deps).parseAsync(
        ['node', 'gmail', 'label', 'remove', '10', 'old'],
        { from: 'node' },
      );
    } finally {
      process.stdout.write = origWrite;
    }
    const call = deps._client._flagsRemoveCalls[0];
    expect(call.uid).toBe(10);
    expect(call.flags).toEqual(['old']);
    expect(call.opts).toMatchObject({ uid: true, useLabels: true });
  });
});

describe('CLI integration — label list', () => {
  it('calls client.list() and returns labels', async () => {
    const labels = [{ name: 'INBOX', path: 'INBOX', specialUse: '\\Inbox' }];
    const deps = makeDeps({ labelList: labels });
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await buildProgram(deps).parseAsync(
        ['node', 'gmail', 'label', 'list'],
        { from: 'node' },
      );
    } finally {
      process.stdout.write = origWrite;
    }
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });
});
