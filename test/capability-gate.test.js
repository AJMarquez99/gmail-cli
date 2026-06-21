// test/capability-gate.test.js
import { describe, it, expect, vi } from 'vitest';
import { buildProgram } from '../src/cli.js';
import { COMMAND_CAPABILITY, resolveCapabilities } from '../src/capabilities.js';

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
