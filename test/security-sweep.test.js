import { describe, it, expect, vi } from 'vitest';
import { buildProgram } from '../src/cli.js';
import { runDoctor } from '../src/commands/doctor.js';
import { resolveProfile } from '../src/profile.js';

function cliDeps() {
  const transporter = { sendMail: vi.fn(async () => ({ messageId: '<id>', accepted: [], rejected: [] })) };
  return {
    env: { HOME: '/h' },
    resolveCredentials: () => ({ user: 'you@example.com', appPassword: 'SECRETPW', source: 'env' }),
    resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config: {}, name }),
    loadAllowlist: () => ({ recipients: [{ email: 'x@y.com' }] }),
    loadConfig: () => ({}),
    createTransport: () => transporter,
    statFile: vi.fn(() => ({ isFile: () => true, size: 10 })),
    readFileBytes: vi.fn(() => Buffer.from('DATA')),
    realpath: vi.fn((p) => p),
    cwd: () => '/work',
    now: () => 'T', appendLog: vi.fn(), readLog: () => [],
    _transporter: transporter,
  };
}

describe('attachment confinement through the real CLI', () => {
  it('refuses an absolute out-of-root attachment and sends nothing', async () => {
    const deps = cliDeps();
    const errs = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const outs = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const program = buildProgram(deps);
    program.exitOverride();
    try {
      await program.parseAsync(
        ['node', 'gmail', 'send', '--to', 'x@y.com', '--subject', 'S', '--body', 'b', '--attach', '/etc/passwd'],
        { from: 'node' },
      );
    } catch { /* handle() sets process.exitCode; ignore */ }
    expect(deps._transporter.sendMail).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
    process.exitCode = 0;
    errs.mockRestore();
    outs.mockRestore();
  });
});

describe('doctor never leaks the app password', () => {
  it('omits the secret from its result', async () => {
    const deps = {
      resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config: {}, name }),
      resolveCredentials: () => ({ user: 'you@example.com', appPassword: 'SECRETPW', source: 'env' }),
      loadAllowlist: () => ({ recipients: [] }),
      createTransport: () => ({ verify: async () => true }),
      createImapClient: () => ({ connect: async () => {}, logout: async () => {} }),
    };
    const out = await runDoctor({}, deps);
    expect(JSON.stringify(out)).not.toContain('SECRETPW');
    expect(out.user).toBe('you@example.com');
  });
});
