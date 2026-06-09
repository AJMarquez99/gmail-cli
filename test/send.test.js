import { describe, it, expect, vi } from 'vitest';
import { runSend } from '../src/commands/send.js';
import { InvalidInputError, RecipientNotAllowedError } from '../src/lib/errors.js';

const DEFAULT_ALLOWLIST = {
  recipients: [
    { email: 'x@y.com' },
    { email: 'a@x.com' },
    { email: 'b@x.com' },
    { email: 'c@x.com' },
    { email: 'd@x.com' },
    { email: 'boss@x.com', aliases: ['boss'] },
  ],
};

function makeDeps({ sendMail, allowlist = DEFAULT_ALLOWLIST, config = {} } = {}) {
  const transporter = {
    sendMail: sendMail || vi.fn(async () => ({ messageId: '<id@gmail>', accepted: ['x@y.com'], rejected: [] })),
  };
  return {
    resolveCredentials: vi.fn(() => ({ user: 'you@example.com', appPassword: 'pw', source: 'env' })),
    loadAllowlist: vi.fn(() => allowlist),
    loadConfig: vi.fn(() => config),
    createTransport: vi.fn(() => transporter),
    statFile: vi.fn(() => ({ isFile: () => true, size: 1024 })),
    now: vi.fn(() => '2026-01-01T00:00:00.000Z'),
    appendLog: vi.fn(),
    readLog: vi.fn(() => []),
    _transporter: transporter,
  };
}

describe('runSend', () => {
  it('sends with the resolved account as From and returns the result envelope', async () => {
    const deps = makeDeps();
    const out = await runSend({ to: 'x@y.com', subject: 'Hi', body: 'hello' }, deps);
    expect(deps._transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'you@example.com',
        to: ['x@y.com'],
        subject: 'Hi',
        text: 'hello',
      }),
    );
    expect(out).toEqual({
      from: 'you@example.com',
      to: ['x@y.com'],
      cc: [],
      bcc: [],
      subject: 'Hi',
      messageId: '<id@gmail>',
      accepted: ['x@y.com'],
      rejected: [],
      attachments: [],
    });
  });

  it('normalizes comma-separated and array recipients across to/cc/bcc', async () => {
    const deps = makeDeps();
    await runSend(
      { to: 'a@x.com, b@x.com', cc: ['c@x.com'], bcc: 'd@x.com', subject: 'S', body: 'b' },
      deps,
    );
    expect(deps._transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['a@x.com', 'b@x.com'],
        cc: ['c@x.com'],
        bcc: ['d@x.com'],
      }),
    );
  });

  it('passes html and replyTo through when provided', async () => {
    const deps = makeDeps();
    await runSend({ to: 'x@y.com', subject: 'S', html: '<b>hi</b>', replyTo: 'reply@y.com' }, deps);
    expect(deps._transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ html: '<b>hi</b>', replyTo: 'reply@y.com' }),
    );
  });

  it('expands an allowlist alias to its canonical email', async () => {
    const deps = makeDeps();
    const out = await runSend({ to: 'boss', subject: 'S', body: 'b' }, deps);
    expect(deps._transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['boss@x.com'] }),
    );
    expect(out.to).toEqual(['boss@x.com']);
  });

  it('always allows sending to self even with an empty allowlist', async () => {
    const deps = makeDeps({ allowlist: { recipients: [] } });
    await runSend({ to: 'you@example.com', subject: 'S', body: 'b' }, deps);
    expect(deps._transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['you@example.com'] }),
    );
  });

  it('blocks an unlisted recipient and sends nothing', async () => {
    const deps = makeDeps();
    await expect(
      runSend({ to: 'stranger@evil.com', subject: 'S', body: 'b' }, deps),
    ).rejects.toThrow(RecipientNotAllowedError);
    expect(deps._transporter.sendMail).not.toHaveBeenCalled();
  });

  it('enforces the allowlist on cc/bcc too, listing all denied recipients', async () => {
    const deps = makeDeps();
    await expect(
      runSend({ to: 'x@y.com', cc: 'sneaky@evil.com', subject: 'S', body: 'b' }, deps),
    ).rejects.toMatchObject({ denied: ['sneaky@evil.com'] });
    expect(deps._transporter.sendMail).not.toHaveBeenCalled();
  });

  it('throws InvalidInputError when there are no recipients', async () => {
    const deps = makeDeps();
    await expect(runSend({ subject: 'S', body: 'b' }, deps)).rejects.toThrow(InvalidInputError);
  });

  it('throws InvalidInputError when neither body nor html is provided', async () => {
    const deps = makeDeps();
    await expect(runSend({ to: 'x@y.com', subject: 'S' }, deps)).rejects.toThrow(InvalidInputError);
  });

  it('renders a markdown body to html with a plaintext fallback', async () => {
    const deps = makeDeps();
    await runSend({ to: 'x@y.com', subject: 'S', body: '# Hi', markdown: true }, deps);
    const arg = deps._transporter.sendMail.mock.calls[0][0];
    expect(arg.html).toContain('<h1');
    expect(arg.text).toBe('# Hi');
  });

  it('rejects --markdown together with --html', async () => {
    const deps = makeDeps();
    await expect(runSend({ to: 'x@y.com', body: '# Hi', markdown: true, html: '<b>x</b>' }, deps))
      .rejects.toThrow(InvalidInputError);
  });

  it('appends a metadata-only send-log entry on success', async () => {
    const deps = makeDeps();
    await runSend({ to: 'x@y.com', subject: 'S', body: 'secret body' }, deps);
    expect(deps.appendLog).toHaveBeenCalledWith(expect.objectContaining({
      ts: '2026-01-01T00:00:00.000Z', subject: 'S', messageId: '<id@gmail>',
    }));
    expect(deps.appendLog.mock.calls[0][0].text).toBeUndefined(); // body not logged by default
  });

  it('skips logging when --no-log is set', async () => {
    const deps = makeDeps();
    await runSend({ to: 'x@y.com', subject: 'S', body: 'b', noLog: true }, deps);
    expect(deps.appendLog).not.toHaveBeenCalled();
  });
});
