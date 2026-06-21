import { describe, it, expect, vi } from 'vitest';
import { runDraftCreate } from '../src/commands/draft.js';
import { buildProgram } from '../src/cli.js';
import { resolveCapabilities } from '../src/capabilities.js';
import { RecipientNotAllowedError } from '../src/lib/errors.js';

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
// runDraftDelete
// ---------------------------------------------------------------------------

describe('runDraftDelete', () => {
  it('opens Drafts and deletes the message by UID', async () => {
    const mailboxOpenCalls = [];
    const deleteMessageCalls = [];
    const client = {
      connected: false,
      loggedOut: false,
      async connect() {
        this.connected = true;
      },
      async logout() {
        this.loggedOut = true;
      },
      async mailboxOpen(mbox) {
        mailboxOpenCalls.push(mbox);
      },
      async messageDelete(uid, opts) {
        deleteMessageCalls.push({ uid, opts });
      },
    };
    const deps = {
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
      _client: client,
    };

    const { runDraftDelete } = await import('../src/commands/draft.js');
    const result = await runDraftDelete({ uid: '42' }, deps);

    expect(mailboxOpenCalls).toHaveLength(1);
    expect(mailboxOpenCalls[0]).toBe('[Gmail]/Drafts');
    expect(deleteMessageCalls).toHaveLength(1);
    expect(deleteMessageCalls[0]).toEqual({ uid: 42, opts: { uid: true } });
    expect(result.action).toBe('draft-deleted');
    expect(result.uid).toBe(42);
    expect(result.mailbox).toBe('[Gmail]/Drafts');
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

// ---------------------------------------------------------------------------
// runDraftSend
// ---------------------------------------------------------------------------

/**
 * Build a minimal deps object for runDraftSend tests.
 * Mirrors the pattern from test/send.test.js (createTransport, loadAllowlist,
 * resolveCredentials, resolveProfile, appendLog, now) plus the IMAP client
 * stub from the runDraftDelete test above (createImapClient, mailboxOpen,
 * messageDelete, fetch).
 */
function makeDraftSendDeps({
  rawSource = Buffer.from(
    'From: me@example.com\r\nTo: a@x.com\r\nSubject: Test Draft\r\n\r\nHello',
  ),
  parsedMessage = {
    subject: 'Test Draft',
    to: { value: [{ address: 'a@x.com' }] },
    cc: null,
    bcc: null,
  },
  allowlist = { recipients: [{ email: 'a@x.com' }] },
  allowlistEnforce = true,
  sendMailResult = { messageId: '<mid@gmail>', accepted: ['a@x.com'] },
} = {}) {
  const mailboxOpenCalls = [];
  const messageDeleteCalls = [];
  const fetchCalls = [];

  // runDraftSend manages one IMAP client directly (single session): fetch, then delete after send.
  const client = {
    connected: false,
    loggedOut: false,
    _mailboxOpenCalls: mailboxOpenCalls,
    _messageDeleteCalls: messageDeleteCalls,
    _fetchCalls: fetchCalls,

    async connect() { this.connected = true; },
    async logout() { this.loggedOut = true; },

    async mailboxOpen(mbox) {
      mailboxOpenCalls.push(mbox);
    },

    async messageDelete(uid, opts) {
      messageDeleteCalls.push({ uid, opts });
    },

    // imapflow fetch() is an async generator; return an iterable that yields rawSource.
    async *fetch(uid, query, options) {
      fetchCalls.push({ uid, query, options });
      yield { source: rawSource };
    },
  };

  const sendMailMock = vi.fn(async () => sendMailResult);
  const transporter = { sendMail: sendMailMock };

  return {
    resolveProfile: vi.fn(() => ({
      name: '(default)',
      legacy: true,
      credentialsPath: '/credentials.json',
      imap: {},
      fromName: null,
      replyTo: null,
      signature: null,
      allowlistPath: '/allowlist.json',
      allowlistEnforce,
      sendLog: { enabled: true },
      sendLogPath: '/sent.jsonl',
      capabilities: resolveCapabilities({}),
    })),
    resolveCredentials: vi.fn(() => ({ user: 'me@example.com', appPassword: 'pw' })),
    createImapClient: vi.fn(() => client),
    loadAllowlist: vi.fn(() => allowlist),
    createTransport: vi.fn(() => transporter),
    parseMessage: vi.fn(async () => parsedMessage),
    appendLog: vi.fn(),
    now: vi.fn(() => '2026-01-01T00:00:00.000Z'),
    _client: client,
    _sendMail: sendMailMock,
  };
}

describe('runDraftSend', () => {
  it('happy path: fetches draft, enforces allowlist, calls sendMail with raw+envelope, deletes draft, appends log', async () => {
    const { runDraftSend } = await import('../src/commands/draft.js');
    const deps = makeDraftSendDeps();

    const result = await runDraftSend({ uid: '5' }, deps);

    // sendMail called with { raw, envelope } where envelope.to contains a@x.com
    expect(deps._sendMail).toHaveBeenCalledOnce();
    const sendArg = deps._sendMail.mock.calls[0][0];
    expect(sendArg).toHaveProperty('raw');
    expect(sendArg).toHaveProperty('envelope');
    expect(sendArg.envelope.to).toContain('a@x.com');
    expect(sendArg.envelope.from).toBe('me@example.com');

    // draft was deleted (messageDelete called)
    expect(deps._client._messageDeleteCalls).toHaveLength(1);
    expect(deps._client._messageDeleteCalls[0].uid).toBe(5);

    // send-log appended
    expect(deps.appendLog).toHaveBeenCalledOnce();
    expect(deps.appendLog.mock.calls[0][0]).toMatchObject({
      ts: '2026-01-01T00:00:00.000Z',
      subject: 'Test Draft',
      messageId: '<mid@gmail>',
    });

    // return value shape
    expect(result.action).toBe('draft-sent');
    expect(result.uid).toBe(5);
    expect(result.to).toContain('a@x.com');
    expect(result.subject).toBe('Test Draft');
    expect(result.messageId).toBe('<mid@gmail>');
  });

  it('denial: allowlist blocks recipient → throws RecipientNotAllowedError, sendMail NOT called, draft intact (deleteMessage NOT called)', async () => {
    const { runDraftSend } = await import('../src/commands/draft.js');
    // blocked@evil.com is NOT in the allowlist
    const deps = makeDraftSendDeps({
      rawSource: Buffer.from(
        'From: me@example.com\r\nTo: blocked@evil.com\r\nSubject: Blocked\r\n\r\nHi',
      ),
      parsedMessage: {
        subject: 'Blocked',
        to: { value: [{ address: 'blocked@evil.com' }] },
        cc: null,
        bcc: null,
      },
      allowlist: { recipients: [] }, // nobody allowed except self
      allowlistEnforce: true,
    });

    await expect(runDraftSend({ uid: '7' }, deps)).rejects.toThrow(RecipientNotAllowedError);

    // CRITICAL: sendMail must NOT have been called (no transmission)
    expect(deps._sendMail).not.toHaveBeenCalled();

    // CRITICAL: deleteMessage must NOT have been called (draft intact)
    expect(deps._client._messageDeleteCalls).toHaveLength(0);
  });

  it('warns on stderr on a real send when enforcement is off (mirrors send.js)', async () => {
    const { runDraftSend } = await import('../src/commands/draft.js');
    const deps = makeDraftSendDeps({ allowlistEnforce: false });
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await runDraftSend({ uid: '5' }, deps);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('allowlist enforcement disabled'));
      expect(deps._sendMail).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });

  it('does NOT warn on stderr on a real send when enforcement is on', async () => {
    const { runDraftSend } = await import('../src/commands/draft.js');
    const deps = makeDraftSendDeps();
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await runDraftSend({ uid: '5' }, deps);
      const warned = spy.mock.calls.some(([arg]) => String(arg).includes('allowlist enforcement disabled'));
      expect(warned).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('uses exactly ONE IMAP client for fetch + delete (single connect/logout round-trip)', async () => {
    const { runDraftSend } = await import('../src/commands/draft.js');
    const deps = makeDraftSendDeps();

    await runDraftSend({ uid: '5' }, deps);

    // createImapClient must have been called exactly once
    expect(deps.createImapClient).toHaveBeenCalledOnce();

    // The single client must have been connected and logged out
    expect(deps._client.connected).toBe(true);
    expect(deps._client.loggedOut).toBe(true);

    // The draft was deleted via messageDelete
    expect(deps._client._messageDeleteCalls).toHaveLength(1);
    expect(deps._client._messageDeleteCalls[0].uid).toBe(5);
  });

  it('does NOT delete the draft if sendMail throws (draft preserved on send failure)', async () => {
    const { runDraftSend } = await import('../src/commands/draft.js');
    const deps = makeDraftSendDeps({
      sendMailResult: null,
    });
    deps.createTransport = vi.fn(() => ({
      sendMail: vi.fn(async () => { throw new Error('SMTP failure'); }),
    }));

    await expect(runDraftSend({ uid: '5' }, deps)).rejects.toThrow('SMTP failure');

    // Draft must NOT be deleted
    expect(deps._client._messageDeleteCalls).toHaveLength(0);
    // logout still called (finally block)
    expect(deps._client.loggedOut).toBe(true);
  });
});
