import { describe, it, expect, vi } from 'vitest';
import { runReply, runForward } from '../src/commands/reply.js';
import { resolveCapabilities } from '../src/capabilities.js';
import { RecipientNotAllowedError, InvalidInputError } from '../src/lib/errors.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const RAW_SOURCE = Buffer.from(
  'From: alice@x.com\r\nTo: me@example.com\r\nSubject: Hello\r\n\r\norig body',
);

const PARSED_ORIG = {
  subject: 'Hello',
  from: { value: [{ address: 'alice@x.com' }] },
  replyTo: null,
  to: { value: [{ address: 'me@example.com' }] },
  cc: { value: [] },
  messageId: '<m1>',
  references: undefined,
  text: 'orig body',
};

const DEFAULT_ALLOWLIST = {
  recipients: [
    { email: 'alice@x.com' },
    { email: 'me@example.com' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient({ appendResult = { uid: 101 } } = {}) {
  const fetchCalls = [];
  const appendCalls = [];
  const mailboxOpenCalls = [];

  const client = {
    connected: false,
    loggedOut: false,
    _fetchCalls: fetchCalls,
    _appendCalls: appendCalls,
    _mailboxOpenCalls: mailboxOpenCalls,

    async connect() { this.connected = true; },
    async logout() { this.loggedOut = true; },

    async mailboxOpen(mbox) { mailboxOpenCalls.push(mbox); },

    async *fetch(uid, query, options) {
      fetchCalls.push({ uid, query, options });
      yield { source: RAW_SOURCE };
    },

    async append(mbox, buf, flags) {
      appendCalls.push({ mbox, flags });
      return appendResult;
    },
  };

  return client;
}

function makeProfile(overrides = {}) {
  return {
    name: '(default)',
    legacy: true,
    credentialsPath: '/credentials.json',
    imap: {},
    fromName: null,
    replyTo: null,
    signature: null,
    allowlistPath: '/allowlist.json',
    allowlistEnforce: true,
    sendLog: { enabled: true },
    sendLogPath: '/sent.jsonl',
    capabilities: resolveCapabilities({}),
    ...overrides,
  };
}

function makeDeps({
  client,
  allowlist = DEFAULT_ALLOWLIST,
  parsedMessage = PARSED_ORIG,
  allowlistEnforce = true,
  sendMailResult = { messageId: '<reply-id@gmail>', accepted: ['alice@x.com'] },
  config = {},
} = {}) {
  const _client = client || makeClient();
  const sendMailMock = vi.fn(async () => sendMailResult);
  const transporter = { sendMail: sendMailMock };

  return {
    resolveProfile: vi.fn(() => makeProfile({ allowlistEnforce })),
    resolveCredentials: vi.fn(() => ({ user: 'me@example.com', appPassword: 'pw' })),
    createImapClient: vi.fn(() => _client),
    loadAllowlist: vi.fn(() => allowlist),
    loadConfig: vi.fn(() => config),
    createTransport: vi.fn(() => transporter),
    parseMessage: vi.fn(async () => parsedMessage),
    appendLog: vi.fn(),
    now: vi.fn(() => '2026-01-01T00:00:00.000Z'),
    statFile: vi.fn(() => ({ isFile: () => true, size: 10 })),
    _client,
    _sendMail: sendMailMock,
  };
}

// ---------------------------------------------------------------------------
// Send path
// ---------------------------------------------------------------------------

describe('runReply — send path', () => {
  it('derives recipient (From), Re: subject, and threading headers correctly', async () => {
    const deps = makeDeps();
    const result = await runReply({ uid: '10', mailbox: 'INBOX', body: 'my reply' }, deps);

    expect(deps._sendMail).toHaveBeenCalledOnce();
    const arg = deps._sendMail.mock.calls[0][0];

    // recipient derived from From
    expect(arg.to).toContain('alice@x.com');

    // Re: subject
    expect(arg.subject).toBe('Re: Hello');

    // threading
    expect(arg.inReplyTo).toBe('<m1>');
    expect(arg.references).toContain('<m1>');

    // result shape
    expect(result.action).toBe('replied');
    expect(result.to).toContain('alice@x.com');
    expect(result.subject).toBe('Re: Hello');
  });

  it('prefers Reply-To over From for recipient', async () => {
    const parsedWithReplyTo = {
      ...PARSED_ORIG,
      replyTo: { value: [{ address: 'replyto@x.com' }] },
    };
    // replyto@x.com needs to be allowlisted
    const allowlist = { recipients: [{ email: 'replyto@x.com' }] };
    const deps = makeDeps({ parsedMessage: parsedWithReplyTo, allowlist });

    await runReply({ uid: '10', mailbox: 'INBOX', body: 'my reply' }, deps);
    const arg = deps._sendMail.mock.calls[0][0];
    expect(arg.to).toContain('replyto@x.com');
  });

  it('does not double-prefix Re: if subject already starts with Re:', async () => {
    const parsedRe = { ...PARSED_ORIG, subject: 'Re: Hello' };
    const deps = makeDeps({ parsedMessage: parsedRe });
    await runReply({ uid: '10', mailbox: 'INBOX', body: 'reply' }, deps);
    const arg = deps._sendMail.mock.calls[0][0];
    expect(arg.subject).toBe('Re: Hello');
  });

  it('calls sendMail — allowlisted recipient flows through', async () => {
    const deps = makeDeps();
    await runReply({ uid: '10', mailbox: 'INBOX', body: 'ok' }, deps);
    expect(deps._sendMail).toHaveBeenCalledOnce();
  });

  it('blocks an unlisted recipient — throws RecipientNotAllowedError, sendMail NOT called', async () => {
    const blockedMessage = {
      ...PARSED_ORIG,
      from: { value: [{ address: 'stranger@evil.com' }] },
      replyTo: null,
    };
    const deps = makeDeps({
      parsedMessage: blockedMessage,
      allowlist: { recipients: [] }, // nobody allowed except self
    });

    await expect(
      runReply({ uid: '10', mailbox: 'INBOX', body: 'reply' }, deps),
    ).rejects.toThrow(RecipientNotAllowedError);

    expect(deps._sendMail).not.toHaveBeenCalled();
  });

  it('appends a send-log entry on successful send', async () => {
    const deps = makeDeps();
    await runReply({ uid: '10', mailbox: 'INBOX', body: 'reply' }, deps);
    expect(deps.appendLog).toHaveBeenCalledOnce();
    expect(deps.appendLog.mock.calls[0][0]).toMatchObject({
      ts: '2026-01-01T00:00:00.000Z',
      subject: 'Re: Hello',
    });
  });
});

// ---------------------------------------------------------------------------
// --draft path
// ---------------------------------------------------------------------------

describe('runReply — --draft path', () => {
  it('appends to Drafts and does NOT call sendMail', async () => {
    const client = makeClient({ appendResult: { uid: 77 } });
    const deps = makeDeps({ client });

    const result = await runReply({ uid: '10', mailbox: 'INBOX', body: 'draft reply', draft: true }, deps);

    // sendMail must NOT be called
    expect(deps._sendMail).not.toHaveBeenCalled();

    // appendDraft via IMAP append
    expect(client._appendCalls).toHaveLength(1);
    expect(client._appendCalls[0].mbox).toBe('[Gmail]/Drafts');
    expect(client._appendCalls[0].flags).toEqual(['\\Draft']);

    // result shape
    expect(result.action).toBe('reply-drafted');
    expect(result.uid).toBe(77);
    expect(result.mailbox).toBe('[Gmail]/Drafts');
    expect(result.to).toContain('alice@x.com');
    expect(result.subject).toBe('Re: Hello');
  });

  it('--draft does NOT enforce the allowlist (blocked address stages fine)', async () => {
    const blockedMessage = {
      ...PARSED_ORIG,
      from: { value: [{ address: 'anyone@anywhere.com' }] },
      replyTo: null,
    };
    const deps = makeDeps({
      parsedMessage: blockedMessage,
      allowlist: { recipients: [] }, // nobody allowed
    });

    // Should succeed (draft, no allowlist)
    const result = await runReply({ uid: '10', mailbox: 'INBOX', body: 'draft', draft: true }, deps);
    expect(result.action).toBe('reply-drafted');
    expect(deps._sendMail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// --all flag
// ---------------------------------------------------------------------------

describe('runReply — --all flag', () => {
  it('adds original To + Cc recipients to cc, minus self and primary', async () => {
    const parsedWithCc = {
      ...PARSED_ORIG,
      // original To has me@example.com (self) and bob@x.com
      to: { value: [{ address: 'me@example.com' }, { address: 'bob@x.com' }] },
      cc: { value: [{ address: 'carol@x.com' }] },
    };
    const allowlist = {
      recipients: [
        { email: 'alice@x.com' },
        { email: 'bob@x.com' },
        { email: 'carol@x.com' },
        { email: 'me@example.com' },
      ],
    };
    const deps = makeDeps({ parsedMessage: parsedWithCc, allowlist });

    await runReply({ uid: '10', mailbox: 'INBOX', body: 'reply all', all: true }, deps);

    const arg = deps._sendMail.mock.calls[0][0];

    // primary (alice@x.com from From) goes to To
    expect(arg.to).toContain('alice@x.com');

    // self (me@example.com) must NOT be in cc
    const ccList = arg.cc || [];
    expect(ccList).not.toContain('me@example.com');
    // primary must NOT be in cc
    expect(ccList).not.toContain('alice@x.com');

    // others should be cc'd
    expect(ccList).toContain('bob@x.com');
    expect(ccList).toContain('carol@x.com');
  });
});

// ---------------------------------------------------------------------------
// --no-quote / quote default
// ---------------------------------------------------------------------------

describe('runReply — quoting', () => {
  it('default: body contains quoted original text', async () => {
    const deps = makeDeps();
    await runReply({ uid: '10', mailbox: 'INBOX' }, deps);

    const arg = deps._sendMail.mock.calls[0][0];
    // The quoted text should reference orig body
    const body = arg.text || '';
    expect(body).toContain('orig body');
  });

  it('--no-quote: body does NOT contain quoted original text', async () => {
    const deps = makeDeps();
    await runReply({ uid: '10', mailbox: 'INBOX', body: 'clean reply', noQuote: true }, deps);

    const arg = deps._sendMail.mock.calls[0][0];
    const body = arg.text || '';
    expect(body).not.toContain('orig body');
  });

  it('--no-quote with no explicit body: empty body (no quote appended)', async () => {
    const deps = makeDeps();
    await runReply({ uid: '10', mailbox: 'INBOX', noQuote: true }, deps);
    // should not throw; sendMail still called
    expect(deps._sendMail).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Threading — References field
// ---------------------------------------------------------------------------

describe('runReply — References threading', () => {
  it('splits a space-separated string form into separate ids + messageId', async () => {
    const parsedWithRefs = {
      ...PARSED_ORIG,
      references: '<prev1> <prev2>',
      messageId: '<m2>',
    };
    const deps = makeDeps({ parsedMessage: parsedWithRefs });
    await runReply({ uid: '10', mailbox: 'INBOX', body: 'threaded' }, deps);

    const arg = deps._sendMail.mock.calls[0][0];
    // The string must be split into individual ids as SEPARATE array elements,
    // not wrapped whole, then the original messageId appended.
    expect(arg.references).toEqual(['<prev1>', '<prev2>', '<m2>']);
  });

  it('works when original has array references', async () => {
    const parsedArrayRefs = {
      ...PARSED_ORIG,
      references: ['<ref1>', '<ref2>'],
    };
    const deps = makeDeps({ parsedMessage: parsedArrayRefs });
    await runReply({ uid: '10', mailbox: 'INBOX', body: 'arr refs' }, deps);
    const arg = deps._sendMail.mock.calls[0][0];
    expect(arg.references).toContain('<m1>');
  });
});

// ---------------------------------------------------------------------------
// Empty-recipient guard (no From + no Reply-To)
// ---------------------------------------------------------------------------

const PARSED_NO_SENDER = {
  subject: 'Orphan',
  from: null,
  replyTo: null,
  to: { value: [{ address: 'me@example.com' }] },
  cc: { value: [] },
  messageId: '<orphan>',
  references: undefined,
  text: 'orphan body',
};

describe('runReply — empty-recipient guard', () => {
  it('send path: throws InvalidInputError when original has no From/Reply-To', async () => {
    const deps = makeDeps({ parsedMessage: PARSED_NO_SENDER });
    await expect(
      runReply({ uid: '10', mailbox: 'INBOX', body: 'reply' }, deps),
    ).rejects.toThrow(InvalidInputError);
    expect(deps._sendMail).not.toHaveBeenCalled();
  });

  it('send path: error message mentions From/Reply-To', async () => {
    const deps = makeDeps({ parsedMessage: PARSED_NO_SENDER });
    let err;
    try {
      await runReply({ uid: '10', mailbox: 'INBOX' }, deps);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(InvalidInputError);
    expect(err.message).toMatch(/From\/Reply-To/i);
  });

  it('draft path: does NOT throw when original has no From/Reply-To (draft is allowed)', async () => {
    const client = makeClient({ appendResult: { uid: 55 } });
    const deps = makeDeps({ client, parsedMessage: PARSED_NO_SENDER });
    // Should not throw — drafting an empty-recipient reply is acceptable
    const result = await runReply(
      { uid: '10', mailbox: 'INBOX', body: 'draft reply', draft: true },
      deps,
    );
    expect(result.action).toBe('reply-drafted');
    expect(deps._sendMail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// runForward
// ---------------------------------------------------------------------------

const PARSED_WITH_ATTACHMENT = {
  ...PARSED_ORIG,
  attachments: [
    { filename: 'a.pdf', content: Buffer.from('xx'), contentType: 'application/pdf' },
  ],
};

describe('runForward', () => {
  it('re-attaches original attachments, uses Fwd: subject, sends to --to', async () => {
    const deps = makeDeps({
      parsedMessage: PARSED_WITH_ATTACHMENT,
      allowlist: { recipients: [{ email: 'bob@x.com' }] },
      sendMailResult: { messageId: '<fwd-id@gmail>', accepted: ['bob@x.com'] },
    });

    const result = await runForward({ uid: '7', to: ['bob@x.com'], mailbox: 'INBOX' }, deps);

    expect(deps._sendMail).toHaveBeenCalledOnce();
    const arg = deps._sendMail.mock.calls[0][0];

    // subject prefixed with Fwd:
    expect(arg.subject).toBe('Fwd: Hello');

    // to contains the forwarded recipient
    expect(arg.to).toContain('bob@x.com');

    // body contains original text
    const body = arg.text || '';
    expect(body).toContain('orig body');

    // re-attached as content buffers
    const atts = arg.attachments || [];
    expect(atts.some((a) => a.filename === 'a.pdf' && Buffer.isBuffer(a.content))).toBe(true);

    // result shape
    expect(result.action).toBe('forwarded');
    expect(result.attachments).toContain('a.pdf');
  });

  it('does not double-prefix Fwd: if subject already starts with Fwd:', async () => {
    const parsedFwd = { ...PARSED_ORIG, subject: 'Fwd: Hello' };
    const deps = makeDeps({
      parsedMessage: parsedFwd,
      allowlist: { recipients: [{ email: 'bob@x.com' }] },
    });
    await runForward({ uid: '7', to: ['bob@x.com'], mailbox: 'INBOX' }, deps);
    const arg = deps._sendMail.mock.calls[0][0];
    expect(arg.subject).toBe('Fwd: Hello');
  });

  it('missing --to → InvalidInputError; sendMail NOT called', async () => {
    const deps = makeDeps();

    await expect(
      runForward({ uid: '7', to: [], mailbox: 'INBOX' }, deps),
    ).rejects.toThrow(InvalidInputError);

    expect(deps._sendMail).not.toHaveBeenCalled();
  });

  it('allowlist-blocked recipient → RecipientNotAllowedError; sendMail NOT called', async () => {
    const deps = makeDeps({
      allowlist: { recipients: [] }, // nobody allowed
    });

    await expect(
      runForward({ uid: '7', to: ['blocked@evil.com'], mailbox: 'INBOX' }, deps),
    ).rejects.toThrow(RecipientNotAllowedError);

    expect(deps._sendMail).not.toHaveBeenCalled();
  });
});
