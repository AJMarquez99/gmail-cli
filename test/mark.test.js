import { describe, it, expect, vi } from 'vitest';
import { runMark } from '../src/commands/mark.js';
import { buildProgram } from '../src/cli.js';
import { InvalidInputError } from '../src/lib/errors.js';

// ---------------------------------------------------------------------------
// Fake client + deps builder
// ---------------------------------------------------------------------------

/**
 * Build a fake deps bundle with a fake imap client that supports flag ops.
 *
 * @param {object} [options]
 * @param {boolean} [options.throwInOp]   If true, messageFlagsAdd/Remove throws.
 */
function makeDeps({ throwInOp = false } = {}) {
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
// runMark — flag validation
// ---------------------------------------------------------------------------

describe('runMark — flag validation', () => {
  it('throws InvalidInputError and does NOT connect when neither --read nor --unread is given', async () => {
    const deps = makeDeps();
    // opts.read and opts.unread are both undefined → opts.read === opts.unread → error
    await expect(runMark({}, deps)).rejects.toBeInstanceOf(InvalidInputError);
    expect(deps._client.connected).toBe(false);
  });

  it('throws InvalidInputError and does NOT connect when both --read and --unread are given', async () => {
    const deps = makeDeps();
    // Both set to true → opts.read === opts.unread → error
    await expect(runMark({ read: true, unread: true }, deps)).rejects.toBeInstanceOf(InvalidInputError);
    expect(deps._client.connected).toBe(false);
  });

  it('error message mentions --read and --unread', async () => {
    const deps = makeDeps();
    const err = await runMark({}, deps).catch((e) => e);
    expect(err.message).toMatch(/--read/);
    expect(err.message).toMatch(/--unread/);
  });
});

// ---------------------------------------------------------------------------
// runMark — --read
// ---------------------------------------------------------------------------

describe('runMark — --read', () => {
  it('opens the mailbox and calls messageFlagsAdd with ["\\\\Seen"] (NOT useLabels)', async () => {
    const deps = makeDeps();
    await runMark({ uid: '42', read: true, mailbox: 'INBOX' }, deps);
    expect(deps._client._mailboxOpened).toBe('INBOX');
    const call = deps._client._flagsAddCalls[0];
    expect(call.uid).toBe(42);
    expect(call.flags).toEqual(['\\Seen']);
    expect(call.opts).toMatchObject({ uid: true });
    // Must NOT use useLabels for \Seen flag
    expect(call.opts.useLabels).toBeFalsy();
  });

  it('returns { uid, seen: true, action: "read" }', async () => {
    const deps = makeDeps();
    const result = await runMark({ uid: '42', read: true, mailbox: 'INBOX' }, deps);
    expect(result).toEqual({ uid: 42, seen: true, action: 'read' });
  });

  it('coerces uid to a number', async () => {
    const deps = makeDeps();
    await runMark({ uid: '7', read: true, mailbox: 'INBOX' }, deps);
    expect(deps._client._flagsAddCalls[0].uid).toBe(7);
  });

  it('calls connect() and logout() on success', async () => {
    const deps = makeDeps();
    await runMark({ uid: '1', read: true, mailbox: 'INBOX' }, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });

  it('calls logout() even when messageFlagsAdd throws', async () => {
    const deps = makeDeps({ throwInOp: true });
    await expect(runMark({ uid: '1', read: true, mailbox: 'INBOX' }, deps)).rejects.toThrow('flagsAdd exploded');
    expect(deps._client.loggedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runMark — --unread
// ---------------------------------------------------------------------------

describe('runMark — --unread', () => {
  it('opens the mailbox and calls messageFlagsRemove with ["\\\\Seen"] (NOT useLabels)', async () => {
    const deps = makeDeps();
    await runMark({ uid: '99', unread: true, mailbox: 'INBOX' }, deps);
    expect(deps._client._mailboxOpened).toBe('INBOX');
    const call = deps._client._flagsRemoveCalls[0];
    expect(call.uid).toBe(99);
    expect(call.flags).toEqual(['\\Seen']);
    expect(call.opts).toMatchObject({ uid: true });
    expect(call.opts.useLabels).toBeFalsy();
  });

  it('returns { uid, seen: false, action: "unread" }', async () => {
    const deps = makeDeps();
    const result = await runMark({ uid: '99', unread: true, mailbox: 'INBOX' }, deps);
    expect(result).toEqual({ uid: 99, seen: false, action: 'unread' });
  });

  it('coerces uid to a number', async () => {
    const deps = makeDeps();
    await runMark({ uid: '5', unread: true, mailbox: 'INBOX' }, deps);
    expect(deps._client._flagsRemoveCalls[0].uid).toBe(5);
  });

  it('calls connect() and logout() on success', async () => {
    const deps = makeDeps();
    await runMark({ uid: '1', unread: true, mailbox: 'INBOX' }, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });

  it('calls logout() even when messageFlagsRemove throws', async () => {
    const deps = makeDeps({ throwInOp: true });
    await expect(runMark({ uid: '1', unread: true, mailbox: 'INBOX' }, deps)).rejects.toThrow('flagsRemove exploded');
    expect(deps._client.loggedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CLI integration
// ---------------------------------------------------------------------------

describe('CLI integration — mark --read', () => {
  it('calls messageFlagsAdd with uid 42, ["\\\\Seen"], { uid: true } (no useLabels)', async () => {
    const deps = makeDeps();
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await buildProgram(deps).parseAsync(
        ['node', 'gmail', 'mark', '42', '--read'],
        { from: 'node' },
      );
    } finally {
      process.stdout.write = origWrite;
    }
    const call = deps._client._flagsAddCalls[0];
    expect(call.uid).toBe(42);
    expect(call.flags).toEqual(['\\Seen']);
    expect(call.opts).toMatchObject({ uid: true });
    expect(call.opts.useLabels).toBeFalsy();
  });
});

describe('CLI integration — mark --unread', () => {
  it('calls messageFlagsRemove with uid 10, ["\\\\Seen"], { uid: true } (no useLabels)', async () => {
    const deps = makeDeps();
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await buildProgram(deps).parseAsync(
        ['node', 'gmail', 'mark', '10', '--unread'],
        { from: 'node' },
      );
    } finally {
      process.stdout.write = origWrite;
    }
    const call = deps._client._flagsRemoveCalls[0];
    expect(call.uid).toBe(10);
    expect(call.flags).toEqual(['\\Seen']);
    expect(call.opts).toMatchObject({ uid: true });
    expect(call.opts.useLabels).toBeFalsy();
  });
});
