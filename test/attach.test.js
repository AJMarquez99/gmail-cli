import { describe, it, expect, vi } from 'vitest';
import { runSend } from '../src/commands/send.js';
import { InvalidInputError } from '../src/lib/errors.js';

function deps({ stat } = {}) {
  const transporter = { sendMail: vi.fn(async () => ({ messageId: '<id>', accepted: [], rejected: [] })) };
  return {
    resolveCredentials: () => ({ user: 'you@example.com', appPassword: 'pw' }),
    loadAllowlist: () => ({ recipients: [{ email: 'x@y.com' }] }),
    loadConfig: () => ({}),
    createTransport: () => transporter,
    statFile: stat || vi.fn(() => ({ isFile: () => true, size: 2048 })),
    now: () => 'T', appendLog: vi.fn(), readLog: () => [],
    _transporter: transporter,
  };
}

describe('attachments', () => {
  it('attaches files by basename and reports filename + bytes', async () => {
    const d = deps();
    const out = await runSend({ to: 'x@y.com', subject: 'S', body: 'b', attach: ['/tmp/quote.pdf'] }, d);
    expect(d._transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [{ filename: 'quote.pdf', path: '/tmp/quote.pdf' }] }),
    );
    expect(out.attachments).toEqual([{ filename: 'quote.pdf', bytes: 2048 }]);
  });

  it('rejects a missing attachment with exit-2 input error', async () => {
    const stat = vi.fn(() => { throw new Error('ENOENT'); });
    await expect(runSend({ to: 'x@y.com', body: 'b', attach: ['/no/file.pdf'] }, deps({ stat })))
      .rejects.toThrow(InvalidInputError);
  });

  it('rejects when total size exceeds 25MB', async () => {
    const stat = vi.fn(() => ({ isFile: () => true, size: 26 * 1024 * 1024 }));
    await expect(runSend({ to: 'x@y.com', body: 'b', attach: ['/big.zip'] }, deps({ stat })))
      .rejects.toThrow(/25\s?MB|limit/i);
  });
});
