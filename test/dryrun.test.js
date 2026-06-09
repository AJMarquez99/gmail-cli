import { describe, it, expect, vi } from 'vitest';
import { runSend } from '../src/commands/send.js';

function deps() {
  const transporter = { sendMail: vi.fn() };
  return {
    resolveCredentials: () => ({ user: 'agentic.marquez@gmail.com', appPassword: 'pw' }),
    loadAllowlist: () => ({ recipients: [{ email: 'x@y.com' }] }),
    loadConfig: () => ({}),
    createTransport: vi.fn(() => transporter),
    statFile: () => ({ isFile: () => true, size: 10 }),
    now: () => 'T', appendLog: vi.fn(), readLog: () => [],
    _transporter: transporter,
  };
}

describe('--dry-run', () => {
  it('previews without sending, logging, or opening transport', async () => {
    const d = deps();
    const out = await runSend({ to: 'x@y.com', subject: 'S', body: '# Hi', markdown: true, dryRun: true }, d);
    expect(out.dryRun).toBe(true);
    expect(out.hasHtml).toBe(true);
    expect(out.allowed).toEqual(['x@y.com']);
    expect(d._transporter.sendMail).not.toHaveBeenCalled();
    expect(d.createTransport).not.toHaveBeenCalled();
    expect(d.appendLog).not.toHaveBeenCalled();
  });

  it('reports denied recipients instead of throwing', async () => {
    const d = deps();
    const out = await runSend({ to: 'stranger@evil.com', subject: 'S', body: 'b', dryRun: true }, d);
    expect(out.denied).toEqual(['stranger@evil.com']);
    expect(out.dryRun).toBe(true);
    expect(out.to).toEqual([]);
  });

  it('keeps allowed recipients but excludes denied ones from to/cc/bcc', async () => {
    const d = deps();
    const out = await runSend({ to: 'x@y.com, stranger@evil.com', subject: 'S', body: 'b', dryRun: true }, d);
    expect(out.to).toEqual(['x@y.com']);
    expect(out.denied).toEqual(['stranger@evil.com']);
  });
});
