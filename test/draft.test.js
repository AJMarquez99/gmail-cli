import { describe, it, expect, vi } from 'vitest';
import { runDraftCreate } from '../src/commands/draft.js';
import { buildProgram } from '../src/cli.js';
import { resolveCapabilities } from '../src/capabilities.js';

// ---------------------------------------------------------------------------
// Fake client + deps builder (mirrors read.test.js / mark.test.js pattern)
// ---------------------------------------------------------------------------

function makeDeps({ appendResult = { uid: 99 } } = {}) {
  const appendCalls = [];
  const client = {
    connected: false,
    loggedOut: false,
    _appendCalls: appendCalls,

    async connect() {
      this.connected = true;
    },

    async logout() {
      this.loggedOut = true;
    },

    async append(mbox, buf, flags) {
      appendCalls.push({ mbox, flags });
      return appendResult;
    },
  };

  return {
    resolveProfile: vi.fn(() => ({
      name: '(default)',
      legacy: true,
      credentialsPath: '/credentials.json',
      imap: {},
      fromName: null,
      replyTo: null,
      signature: null,
      capabilities: resolveCapabilities({}),
    })),
    resolveCredentials: vi.fn(() => ({ user: 'me@example.com', appPassword: 'pw' })),
    createImapClient: vi.fn(() => client),
    statFile: vi.fn(() => ({ isFile: () => true, size: 10 })),
    _client: client,
  };
}

// ---------------------------------------------------------------------------
// runDraftCreate
// ---------------------------------------------------------------------------

describe('runDraftCreate', () => {
  it('resolves recipients without allowlist enforcement and appends to Drafts', async () => {
    const deps = makeDeps();
    await runDraftCreate(
      { to: ['a@x.com'], cc: [], bcc: [], subject: 'Test Draft', body: 'Hello draft' },
      deps,
    );
    expect(deps._client._appendCalls).toHaveLength(1);
    expect(deps._client._appendCalls[0].mbox).toBe('[Gmail]/Drafts');
    expect(deps._client._appendCalls[0].flags).toEqual(['\\Draft']);
  });

  it('returns the expected shape: action, uid, mailbox, to, subject', async () => {
    const deps = makeDeps({ appendResult: { uid: 42 } });
    const result = await runDraftCreate(
      { to: ['b@x.com'], cc: [], bcc: [], subject: 'My Draft', body: 'body text' },
      deps,
    );
    expect(result.action).toBe('draft-created');
    expect(result.uid).toBe(42);
    expect(result.mailbox).toBe('[Gmail]/Drafts');
    expect(result.to).toEqual(['b@x.com']);
    expect(result.subject).toBe('My Draft');
  });

  it('calls connect() and logout() on the IMAP client', async () => {
    const deps = makeDeps();
    await runDraftCreate(
      { to: ['c@x.com'], cc: [], bcc: [], subject: 'Draft', body: 'text' },
      deps,
    );
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);
  });

  it('calls logout() even when append throws', async () => {
    const deps = makeDeps();
    deps._client.append = async () => { throw new Error('append exploded'); };
    await expect(
      runDraftCreate({ to: ['d@x.com'], cc: [], bcc: [], subject: 'S', body: 'b' }, deps),
    ).rejects.toThrow('append exploded');
    expect(deps._client.loggedOut).toBe(true);
  });

  it('uses createImapClient with resolved credentials', async () => {
    const deps = makeDeps();
    await runDraftCreate(
      { to: ['e@x.com'], cc: [], bcc: [], subject: 'Creds test', body: 'body' },
      deps,
    );
    expect(deps.createImapClient).toHaveBeenCalledWith(
      { user: 'me@example.com', appPassword: 'pw' },
      {},
    );
  });

  it('does NOT call resolveAllowlist (no allowlist enforcement)', async () => {
    const deps = makeDeps();
    deps.resolveAllowlist = vi.fn(() => ({ entries: [], enforce: true }));
    await runDraftCreate(
      { to: ['any@anywhere.com'], cc: [], bcc: [], subject: 'No allowlist', body: 'body' },
      deps,
    );
    expect(deps.resolveAllowlist).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// CLI integration
// ---------------------------------------------------------------------------

describe('CLI integration — draft create', () => {
  it('parses draft create without error and appends to Drafts', async () => {
    const deps = makeDeps();
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await buildProgram(deps).parseAsync(
        ['node', 'gmail', 'draft', 'create', '--to', 'f@x.com', '--subject', 'CLI test', '--body', 'hello'],
        { from: 'node' },
      );
    } finally {
      process.stdout.write = origWrite;
    }
    expect(deps._client._appendCalls).toHaveLength(1);
    expect(deps._client._appendCalls[0].mbox).toBe('[Gmail]/Drafts');
  });
});
