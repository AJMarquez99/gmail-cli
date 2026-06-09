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

function makeDeps({ sendMail, allowlist = DEFAULT_ALLOWLIST } = {}) {
  const transporter = {
    sendMail: sendMail || vi.fn(async () => ({ messageId: '<id@gmail>', accepted: ['x@y.com'], rejected: [] })),
  };
  return {
    resolveCredentials: vi.fn(() => ({ user: 'agentic.marquez@gmail.com', appPassword: 'pw', source: 'env' })),
    loadAllowlist: vi.fn(() => allowlist),
    createTransport: vi.fn(() => transporter),
    _transporter: transporter,
  };
}

describe('runSend', () => {
  it('sends with the resolved account as From and returns the result envelope', async () => {
    const deps = makeDeps();
    const out = await runSend({ to: 'x@y.com', subject: 'Hi', body: 'hello' }, deps);
    expect(deps._transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'agentic.marquez@gmail.com',
        to: ['x@y.com'],
        subject: 'Hi',
        text: 'hello',
      }),
    );
    expect(out).toEqual({
      from: 'agentic.marquez@gmail.com',
      to: ['x@y.com'],
      cc: [],
      bcc: [],
      subject: 'Hi',
      messageId: '<id@gmail>',
      accepted: ['x@y.com'],
      rejected: [],
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
    await runSend({ to: 'agentic.marquez@gmail.com', subject: 'S', body: 'b' }, deps);
    expect(deps._transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['agentic.marquez@gmail.com'] }),
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
});
