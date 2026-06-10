import { describe, it, expect, vi } from 'vitest';
import { runSend } from '../src/commands/send.js';
import { resolveProfile } from '../src/profile.js';

function deps({ config = {} } = {}) {
  const transporter = { sendMail: vi.fn(async () => ({ messageId: '<id>', accepted: [], rejected: [] })) };
  return {
    resolveCredentials: () => ({ user: 'you@example.com', appPassword: 'pw' }),
    resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config, name }),
    loadAllowlist: () => ({ recipients: [{ email: 'x@y.com', aliases: ['x'] }] }),
    loadConfig: () => config,
    createTransport: () => transporter,
    statFile: () => ({ isFile: () => true, size: 1 }),
    now: () => 'T', appendLog: vi.fn(), readLog: () => [],
    _transporter: transporter,
  };
}
const send = (opts, d) => runSend({ to: 'x@y.com', subject: 'S', body: 'b', ...opts }, d);

describe('identity & threading', () => {
  it('sets in-reply-to and seeds references', async () => {
    const d = deps();
    await send({ inReplyTo: '<thread@mail>' }, d);
    expect(d._transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ inReplyTo: '<thread@mail>', references: ['<thread@mail>'] }),
    );
  });

  it('prefers --reply-to flag over config.replyTo', async () => {
    const d = deps({ config: { replyTo: 'cfg@d.com' } });
    await send({ replyTo: 'flag@d.com' }, d);
    expect(d._transporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({ replyTo: 'flag@d.com' }));
  });

  it('formats From with a display name from config', async () => {
    const d = deps({ config: { fromName: 'Example Co' } });
    await send({}, d);
    expect(d._transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: '"Example Co" <you@example.com>' }),
    );
  });

  it('appends a configured signature to text, suppressed by --no-signature', async () => {
    const d = deps({ config: { signature: { text: '--\nCo', html: '<p>--<br>Co</p>' } } });
    await send({}, d);
    expect(d._transporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: 'b\n\n--\nCo' }));

    const d2 = deps({ config: { signature: { text: '--\nCo' } } });
    await send({ noSignature: true }, d2);
    expect(d2._transporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({ text: 'b' }));
  });
});
