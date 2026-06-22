import { describe, it, expect, vi } from 'vitest';
import { runArchive, runMove, runTrash, runDelete } from '../src/commands/organize.js';
import { buildProgram } from '../src/cli.js';
import { InvalidInputError } from '../src/lib/errors.js';
import { resolveCapabilities } from '../src/capabilities.js';

// ---------------------------------------------------------------------------
// Fake client + deps builder
// ---------------------------------------------------------------------------

/**
 * Build a fake deps bundle with a fake imap client that supports mailbox/move/delete ops.
 *
 * @param {object} [options]
 * @param {boolean} [options.throwInOp]  If true, the client ops throw.
 */
function makeDeps({ throwInOp = false } = {}) {
  const client = {
    connected: false,
    loggedOut: false,
    _mailboxOpened: null,
    _flagsRemoveCalls: [],
    _messageMoves: [],
    _messageDeletes: [],

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

    async messageFlagsRemove(uid, flags, opts) {
      if (throwInOp) throw new Error('flagsRemove exploded');
      this._flagsRemoveCalls.push({ uid, flags, opts });
    },

    async messageMove(uid, destination, opts) {
      if (throwInOp) throw new Error('messageMove exploded');
      this._messageMoves.push({ uid, destination, opts });
    },

    async messageDelete(uid, opts) {
      if (throwInOp) throw new Error('messageDelete exploded');
      this._messageDeletes.push({ uid, opts });
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
// runArchive
// ---------------------------------------------------------------------------

describe('runArchive', () => {
  it('calls messageFlagsRemove with [\\\\Inbox] and useLabels, returns { action:"archived", uid }', async () => {
    const deps = makeDeps();
    const result = await runArchive({ uid: '7', mailbox: 'INBOX' }, deps);
    expect(result).toEqual({ uid: 7, mailbox: 'INBOX', action: 'archived' });
    const call = deps._client._flagsRemoveCalls[0];
    expect(call.uid).toBe(7);
    expect(call.flags).toEqual(['\\Inbox']);
    expect(call.opts).toMatchObject({ uid: true, useLabels: true });
  });

  it('calls connect() and logout() on success', async () => {
    const deps = makeDeps();
    await runArchive({ uid: '7', mailbox: 'INBOX' }, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });

  it('calls logout() even when the op throws', async () => {
    const deps = makeDeps({ throwInOp: true });
    await expect(runArchive({ uid: '7', mailbox: 'INBOX' }, deps)).rejects.toThrow('flagsRemove exploded');
    expect(deps._client.loggedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runMove
// ---------------------------------------------------------------------------

describe('runMove', () => {
  it('calls messageMove and returns { action:"moved", uid, from, to }', async () => {
    const deps = makeDeps();
    const result = await runMove({ uid: '7', mailbox: 'INBOX', destination: 'Saved' }, deps);
    expect(result).toEqual({ uid: 7, from: 'INBOX', to: 'Saved', action: 'moved' });
    const call = deps._client._messageMoves[0];
    expect(call.uid).toBe(7);
    expect(call.destination).toBe('Saved');
  });

  it('throws InvalidInputError when destination is missing, and does NOT connect', async () => {
    const deps = makeDeps();
    await expect(runMove({ uid: '7', mailbox: 'INBOX' }, deps)).rejects.toBeInstanceOf(InvalidInputError);
    expect(deps._client.connected).toBe(false);
  });

  it('calls connect() and logout() on success', async () => {
    const deps = makeDeps();
    await runMove({ uid: '7', mailbox: 'INBOX', destination: 'Saved' }, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runTrash
// ---------------------------------------------------------------------------

describe('runTrash', () => {
  it('calls messageMove to [Gmail]/Trash, returns { action:"trashed", uid }', async () => {
    const deps = makeDeps();
    const result = await runTrash({ uid: '7', mailbox: 'INBOX' }, deps);
    expect(result).toEqual({ uid: 7, action: 'trashed' });
    const call = deps._client._messageMoves[0];
    expect(call.uid).toBe(7);
    expect(call.destination).toBe('[Gmail]/Trash');
  });

  it('calls connect() and logout() on success', async () => {
    const deps = makeDeps();
    await runTrash({ uid: '7', mailbox: 'INBOX' }, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });

  it('calls logout() even when the op throws', async () => {
    const deps = makeDeps({ throwInOp: true });
    await expect(runTrash({ uid: '7', mailbox: 'INBOX' }, deps)).rejects.toThrow('messageMove exploded');
    expect(deps._client.loggedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runDelete — no --permanent guard
// ---------------------------------------------------------------------------

describe('runDelete — without --permanent', () => {
  it('throws InvalidInputError mentioning --permanent and suggesting trash', async () => {
    const deps = makeDeps();
    const err = await runDelete({ uid: '7' }, deps).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidInputError);
    expect(err.message).toMatch(/--permanent/);
    expect(err.message).toMatch(/trash/i);
  });

  it('does NOT call messageDelete when --permanent is absent', async () => {
    const deps = makeDeps();
    await runDelete({ uid: '7' }, deps).catch(() => {});
    expect(deps._client._messageDeletes).toHaveLength(0);
  });

  it('does NOT connect when --permanent is absent', async () => {
    const deps = makeDeps();
    await runDelete({ uid: '7' }, deps).catch(() => {});
    expect(deps._client.connected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runDelete — with --permanent
// ---------------------------------------------------------------------------

describe('runDelete — with --permanent', () => {
  it('calls messageDelete and returns { action:"deleted", uid }', async () => {
    const deps = makeDeps();
    const result = await runDelete({ uid: '7', permanent: true, mailbox: 'INBOX' }, deps);
    expect(result).toEqual({ uid: 7, mailbox: 'INBOX', action: 'deleted' });
    expect(deps._client._messageDeletes).toHaveLength(1);
    expect(deps._client._messageDeletes[0].uid).toBe(7);
  });

  it('calls connect() and logout() on success', async () => {
    const deps = makeDeps();
    await runDelete({ uid: '7', permanent: true, mailbox: 'INBOX' }, deps);
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });

  it('calls logout() even when messageDelete throws', async () => {
    const deps = makeDeps({ throwInOp: true });
    await expect(runDelete({ uid: '7', permanent: true, mailbox: 'INBOX' }, deps)).rejects.toThrow('messageDelete exploded');
    expect(deps._client.loggedOut).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CLI integration
// ---------------------------------------------------------------------------

describe('CLI integration — archive', () => {
  it('archives message uid 7', async () => {
    const deps = makeDeps();
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await buildProgram(deps).parseAsync(
        ['node', 'gmail', 'archive', '7'],
        { from: 'node' },
      );
    } finally {
      outSpy.mockRestore();
    }
    const call = deps._client._flagsRemoveCalls[0];
    expect(call.uid).toBe(7);
    expect(call.flags).toEqual(['\\Inbox']);
  });
});

describe('CLI integration — trash', () => {
  it('moves message uid 7 to Trash', async () => {
    const deps = makeDeps();
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await buildProgram(deps).parseAsync(
        ['node', 'gmail', 'trash', '7'],
        { from: 'node' },
      );
    } finally {
      outSpy.mockRestore();
    }
    const call = deps._client._messageMoves[0];
    expect(call.uid).toBe(7);
    expect(call.destination).toBe('[Gmail]/Trash');
  });
});

describe('CLI integration — delete without --permanent', () => {
  it('exits with non-zero and does NOT call messageDelete', async () => {
    const deps = makeDeps();
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = 0;
    try {
      await buildProgram(deps).parseAsync(
        ['node', 'gmail', 'delete', '7'],
        { from: 'node' },
      );
    } finally {
      errSpy.mockRestore();
    }
    expect(process.exitCode).not.toBe(0);
    expect(deps._client._messageDeletes).toHaveLength(0);
    process.exitCode = 0;
  });
});

describe('CLI integration — delete with --permanent', () => {
  it('calls messageDelete for uid 7', async () => {
    const deps = makeDeps();
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await buildProgram(deps).parseAsync(
        ['node', 'gmail', 'delete', '7', '--permanent'],
        { from: 'node' },
      );
    } finally {
      outSpy.mockRestore();
    }
    expect(deps._client._messageDeletes).toHaveLength(1);
    expect(deps._client._messageDeletes[0].uid).toBe(7);
  });
});
