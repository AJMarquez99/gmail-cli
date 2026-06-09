import { describe, it, expect, vi } from 'vitest';

import { runSend } from '../src/commands/send.js';
import { formatDryRun } from '../src/lib/format.js';

function deps() {
  const transporter = { sendMail: vi.fn() };
  return {
    resolveCredentials: () => ({ user: 'you@example.com', appPassword: 'pw' }),
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

  it('dry-run with noAllowlist: allowlistEnforced is false, denied is empty, recipient passes through', async () => {
    const d = deps();
    const out = await runSend({ to: 'stranger@evil.com', subject: 'S', body: 'b', dryRun: true, noAllowlist: true }, d);
    expect(out.allowlistEnforced).toBe(false);
    expect(out.denied).toEqual([]);
    expect(out.to).toContain('stranger@evil.com');
  });

  it('table view surfaces the DISABLED line when enforcement is off, and omits it when on', async () => {
    const d = deps();
    const off = await runSend({ to: 'stranger@evil.com', subject: 'S', body: 'b', dryRun: true, noAllowlist: true }, d);
    expect(formatDryRun(off)).toContain('allowlist: DISABLED (sending to any recipient)');

    const on = await runSend({ to: 'x@y.com', subject: 'S', body: 'b', dryRun: true }, deps());
    expect(formatDryRun(on)).not.toContain('allowlist: DISABLED');
  });

  it('dry-run with config enforce false: allowlistEnforced is false, denied is empty, recipient passes through', async () => {
    function depsWithConfig() {
      const transporter = { sendMail: vi.fn() };
      return {
        resolveCredentials: () => ({ user: 'you@example.com', appPassword: 'pw' }),
        loadAllowlist: () => ({ recipients: [{ email: 'x@y.com' }] }),
        loadConfig: () => ({ allowlist: { enforce: false } }),
        createTransport: vi.fn(() => transporter),
        statFile: () => ({ isFile: () => true, size: 10 }),
        now: () => 'T', appendLog: vi.fn(), readLog: () => [],
        _transporter: transporter,
      };
    }
    const d = depsWithConfig();
    const out = await runSend({ to: 'stranger@evil.com', subject: 'S', body: 'b', dryRun: true }, d);
    expect(out.allowlistEnforced).toBe(false);
    expect(out.denied).toEqual([]);
    expect(out.to).toContain('stranger@evil.com');
  });
});
