// test/capability-gate.test.js
import { describe, it, expect, vi } from 'vitest';
import { buildProgram } from '../src/cli.js';
import { COMMAND_CAPABILITY, resolveCapabilities, requiredCapability } from '../src/capabilities.js';

function leaves(command, prefix = '') {
  if (command.name() === 'help') return [];
  const path = prefix ? `${prefix} ${command.name()}` : command.name();
  if (!command.commands.length) return [path];
  return command.commands.flatMap((c) => leaves(c, path));
}

describe('capability coverage guard', () => {
  it('every registered command path has a capability decision', () => {
    const program = buildProgram();
    const paths = program.commands.flatMap((c) => leaves(c, ''));
    for (const p of paths) {
      expect(COMMAND_CAPABILITY, `missing capability mapping for "${p}"`).toHaveProperty([p]);
    }
  });
});

describe('handle() gate', () => {
  const makeDeps = (caps) => ({
    resolveProfile: () => ({ name: 'biz', legacy: false, capabilities: resolveCapabilities(caps) }),
  });

  it('denies a gated command the profile lacks (exit 4)', async () => {
    const deps = makeDeps({ capabilities: ['read'] });
    const program = buildProgram(deps);
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = 0;
    await program.parseAsync(['node', 'gmail', 'send', '--to', 'x@y.com', '--subject', 'h', '--body', 'b']);
    expect(process.exitCode).toBe(4);
    expect(errSpy.mock.calls.join('')).toMatch(/capability/i);
    errSpy.mockRestore();
    process.exitCode = 0;
  });

  it('reply (no --draft) resolves "send" capability → denied when profile lacks send (exit 4)', async () => {
    // Profile has read + draft but NOT send — plain `reply` needs send → must be denied.
    const deps = {
      resolveProfile: vi.fn(() => ({
        name: 'limited',
        legacy: false,
        capabilities: resolveCapabilities({ capabilities: ['read', 'draft'] }),
      })),
    };
    const program = buildProgram(deps);
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = 0;
    await program.parseAsync(['node', 'gmail', 'reply', '5']);
    expect(process.exitCode).toBe(4);
    expect(errSpy.mock.calls.join('')).toMatch(/capability/i);
    errSpy.mockRestore();
    process.exitCode = 0;
  });

  it('reply --draft resolves "draft" capability (unit: requiredCapability)', () => {
    // The dynamic capability function for reply must resolve to 'draft' when opts.draft is true.
    expect(requiredCapability('reply', { draft: true })).toBe('draft');
    // And to 'send' when draft is absent/falsy.
    expect(requiredCapability('reply', {})).toBe('send');
    expect(requiredCapability('reply', { draft: false })).toBe('send');
  });

  it('reply --draft is NOT capability-denied when profile has draft (e2e parseAsync)', async () => {
    // Profile has read + draft — `reply --draft` needs draft → gate passes.
    // Provide --body to skip the stdin-reading preprocess; the IMAP fetch will immediately
    // fail with InvalidInputError (no message at uid 5), setting exitCode=2 — not 4.
    const fakeClient = {
      connect: vi.fn(async () => {}),
      logout: vi.fn(async () => {}),
      mailboxOpen: vi.fn(async () => {}),
      // async generator that yields nothing → fetchRawMessage returns null → InvalidInputError
      fetch: async function * () {},
    };
    const deps = {
      resolveProfile: vi.fn(() => ({
        name: 'limited',
        legacy: false,
        capabilities: resolveCapabilities({ capabilities: ['read', 'draft'] }),
        credentialsPath: '/creds.json',
        imap: {},
        fromName: null,
        replyTo: null,
        signature: null,
        allowlistPath: '/allowlist.json',
        allowlistEnforce: true,
        sendLog: { enabled: false },
        sendLogPath: '/sent.jsonl',
      })),
      resolveCredentials: vi.fn(() => ({ user: 'me@example.com', appPassword: 'pw' })),
      createImapClient: vi.fn(() => fakeClient),
      loadAllowlist: vi.fn(() => ({ recipients: [] })),
      loadConfig: vi.fn(() => ({})),
      appendLog: vi.fn(),
      now: vi.fn(() => '2026-01-01T00:00:00.000Z'),
    };
    const program = buildProgram(deps);
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = 0;
    // --body bypasses the stdin preprocess; --draft means the gate resolves 'draft'
    await program.parseAsync(['node', 'gmail', 'reply', '5', '--draft', '--body', 'hi']);
    // Must NOT be exit 4 (capability denial)
    expect(process.exitCode).not.toBe(4);
    // The error should be about a missing message, not capability
    expect(errSpy.mock.calls.join('')).not.toMatch(/lacks the "draft" capability/i);
    errSpy.mockRestore();
    process.exitCode = 0;
  });

  it('lets an always-allowed command bypass the gate without resolving the profile', async () => {
    // `init` is always-allowed (COMMAND_CAPABILITY['init'] === null) and its handler never resolves
    // a profile, so the gate must short-circuit BEFORE calling resolveProfile.
    const deps = {
      env: { HOME: '/h' },
      fileExists: vi.fn(() => true),
      ensureDir: vi.fn(),
      writeFileIfAbsent: vi.fn(),
      resolveCredentials: vi.fn(() => ({ user: 'a@b.com' })),
      resolveProfile: vi.fn(),
    };
    const program = buildProgram(deps);
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.exitCode = 0;
    await program.parseAsync(['node', 'gmail', 'init']);
    expect(process.exitCode).not.toBe(4);
    expect(errSpy.mock.calls.join('')).not.toMatch(/capability/i);
    expect(deps.resolveProfile).not.toHaveBeenCalled();
    errSpy.mockRestore();
    outSpy.mockRestore();
    process.exitCode = 0;
  });
});
