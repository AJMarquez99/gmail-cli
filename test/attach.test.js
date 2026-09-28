import { describe, it, expect, vi } from 'vitest';
import { runSend } from '../src/commands/send.js';
import { InvalidInputError } from '../src/lib/errors.js';
import { resolveProfile } from '../src/profile.js';

function deps({ stat, config = {} } = {}) {
  const transporter = { sendMail: vi.fn(async () => ({ messageId: '<id>', accepted: [], rejected: [] })) };
  return {
    resolveCredentials: () => ({ user: 'you@example.com', appPassword: 'pw' }),
    resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config, name }),
    loadAllowlist: () => ({ recipients: [{ email: 'x@y.com' }] }),
    loadConfig: () => config,
    createTransport: () => transporter,
    statFile: stat || vi.fn(() => ({ isFile: () => true, size: 2048 })),
    readFileBytes: vi.fn(() => Buffer.from('PDFDATA')),
    cwd: () => '/work',
    now: () => 'T', appendLog: vi.fn(), readLog: () => [],
    _transporter: transporter,
  };
}

describe('attachments', () => {
  it('attaches files by basename as in-process content buffers and reports filename + bytes', async () => {
    const d = deps();
    const out = await runSend({ to: 'x@y.com', subject: 'S', body: 'b', attach: ['quote.pdf'] }, d);
    const sent = d._transporter.sendMail.mock.calls[0][0];
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments[0].filename).toBe('quote.pdf');
    expect(Buffer.isBuffer(sent.attachments[0].content)).toBe(true);
    expect(sent.attachments[0].path).toBeUndefined();
    expect(d.readFileBytes).toHaveBeenCalledWith('/work/quote.pdf');
    expect(out.attachments).toEqual([{ filename: 'quote.pdf', bytes: 2048 }]);
  });

  it('refuses an attachment resolving outside the root (absolute path escape)', async () => {
    await expect(runSend({ to: 'x@y.com', body: 'b', attach: ['/etc/passwd'] }, deps()))
      .rejects.toThrow(InvalidInputError);
  });

  it('refuses an attachment escaping the root via ..', async () => {
    await expect(runSend({ to: 'x@y.com', body: 'b', attach: ['../../secret.txt'] }, deps()))
      .rejects.toThrow(/outside/i);
  });

  it('rejects a missing attachment with exit-2 input error', async () => {
    const stat = vi.fn(() => { throw new Error('ENOENT'); });
    await expect(runSend({ to: 'x@y.com', body: 'b', attach: ['gone.pdf'] }, deps({ stat })))
      .rejects.toThrow(InvalidInputError);
  });

  it('rejects when total size exceeds 25MB', async () => {
    const stat = vi.fn(() => ({ isFile: () => true, size: 26 * 1024 * 1024 }));
    await expect(runSend({ to: 'x@y.com', body: 'b', attach: ['big.zip'] }, deps({ stat })))
      .rejects.toThrow(/25\s?MB|limit/i);
  });
});
