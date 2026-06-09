import { describe, it, expect, vi } from 'vitest';
import { runSend } from '../src/commands/send.js';
import { InvalidInputError } from '../src/lib/errors.js';

function makeDeps({ sendMail } = {}) {
  const transporter = {
    sendMail: sendMail || vi.fn(async () => ({ messageId: '<id@gmail>', accepted: ['x@y.com'], rejected: [] })),
  };
  return {
    resolveCredentials: vi.fn(() => ({ user: 'agentic.marquez@gmail.com', appPassword: 'pw', source: 'env' })),
    createTransport: vi.fn(() => transporter),
    _transporter: transporter,
  };
}

describe('runSend', () => {
  it('sends with the resolved account as From and returns the result envelope', async () => {
    const deps = makeDeps();
    const out = await runSend(
      { to: 'x@y.com', subject: 'Hi', body: 'hello' },
      deps,
    );
    expect(deps.createTransport).toHaveBeenCalledWith({
      user: 'agentic.marquez@gmail.com',
      appPassword: 'pw',
      source: 'env',
    });
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
    await runSend(
      { to: 'x@y.com', subject: 'S', html: '<b>hi</b>', replyTo: 'reply@y.com' },
      deps,
    );
    expect(deps._transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ html: '<b>hi</b>', replyTo: 'reply@y.com' }),
    );
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
