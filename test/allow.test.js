import { describe, it, expect, vi } from 'vitest';
import { runAllowList, runAllowAdd, runAllowRemove } from '../src/commands/allow.js';
import { buildProgram } from '../src/cli.js';
import { InvalidInputError } from '../src/lib/errors.js';
import { resolveProfile } from '../src/profile.js';

describe('runAllowList', () => {
  it('returns the allowlist recipients with a count', async () => {
    const deps = {
      env: { HOME: '/h' },
      resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config: {}, name }),
      loadAllowlist: vi.fn(() => ({
        recipients: [
          { email: 'a@x.com', aliases: ['a'] },
          { email: 'b@x.com' },
        ],
      })),
    };
    const out = await runAllowList({}, deps);
    expect(out).toEqual({
      count: 2,
      recipients: [
        { email: 'a@x.com', aliases: ['a'] },
        { email: 'b@x.com', aliases: [] },
      ],
    });
  });

  it('reports an empty allowlist as zero recipients', async () => {
    const deps = {
      env: { HOME: '/h' },
      resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config: {}, name }),
      loadAllowlist: vi.fn(() => ({ recipients: [] })),
    };
    expect(await runAllowList({}, deps)).toEqual({ count: 0, recipients: [] });
  });
});

function wDeps({ file, config = {} } = {}) {
  return {
    env: { HOME: '/h' },
    resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config, name }),
    readFile: vi.fn(() => {
      if (file == null) {
        const e = new Error('no');
        e.code = 'ENOENT';
        throw e;
      }
      return file;
    }),
    writeFile: vi.fn(),
    ensureDir: vi.fn(),
  };
}

const written = (d) => JSON.parse(d.writeFile.mock.calls[0][1]);

describe('runAllowAdd', () => {
  it('adds a new recipient with aliases to a fresh allowlist', async () => {
    const d = wDeps();
    const out = await runAllowAdd({ email: 'alice@example.com', alias: ['alice', 'a'] }, d);
    expect(written(d).recipients).toEqual([{ email: 'alice@example.com', aliases: ['alice', 'a'] }]);
    expect(out.action).toBe('created');
    expect(d.ensureDir).toHaveBeenCalled();
  });

  it('merges aliases into an existing email (idempotent, no dupes)', async () => {
    const d = wDeps({
      file: JSON.stringify({
        _comment: 'keep me',
        recipients: [{ email: 'alice@example.com', aliases: ['alice'] }],
      }),
    });
    await runAllowAdd({ email: 'alice@example.com', alias: ['a', 'alice'] }, d);
    const w = written(d);
    expect(w._comment).toBe('keep me'); // preserved
    expect(w.recipients).toEqual([{ email: 'alice@example.com', aliases: ['alice', 'a'] }]);
  });

  it('rejects an email without @', async () => {
    await expect(runAllowAdd({ email: 'nope', alias: [] }, wDeps())).rejects.toThrow(InvalidInputError);
  });

  it('rejects an alias already mapping to a different email', async () => {
    const d = wDeps({
      file: JSON.stringify({ recipients: [{ email: 'bob@example.com', aliases: ['x'] }] }),
    });
    await expect(runAllowAdd({ email: 'alice@example.com', alias: ['x'] }, d)).rejects.toThrow(InvalidInputError);
  });
});

describe('runAllowRemove', () => {
  const file = JSON.stringify({
    recipients: [
      { email: 'alice@example.com', aliases: ['alice'] },
      { email: 'bob@example.com' },
    ],
  });

  it('removes by email', async () => {
    const d = wDeps({ file });
    const out = await runAllowRemove({ target: 'alice@example.com' }, d);
    expect(written(d).recipients.map((r) => r.email)).toEqual(['bob@example.com']);
    expect(out.action).toBe('removed');
  });

  it('removes by alias', async () => {
    const d = wDeps({ file });
    await runAllowRemove({ target: 'alice' }, d);
    expect(written(d).recipients.map((r) => r.email)).toEqual(['bob@example.com']);
  });

  it('errors when the target is not found', async () => {
    await expect(runAllowRemove({ target: 'ghost@example.com' }, wDeps({ file }))).rejects.toThrow(InvalidInputError);
  });
});

describe('runAllowAdd / runAllowRemove — profile mode', () => {
  it('writes to the profile-specific allowlist path when --profile is set', async () => {
    const config = { profiles: { work: {} } };
    const d = wDeps({ config });
    await runAllowAdd({ email: 'bob@example.com', alias: [], profile: 'work' }, d);
    const [writtenPath] = d.writeFile.mock.calls[0];
    expect(writtenPath).toBe('/h/.config/gmail-cli/allowlist-work.json');
  });

  it('removes from the profile-specific allowlist path when --profile is set', async () => {
    const config = { profiles: { work: {} } };
    const file = JSON.stringify({ recipients: [{ email: 'bob@example.com' }] });
    const d = wDeps({ config, file });
    await runAllowRemove({ target: 'bob@example.com', profile: 'work' }, d);
    const [writtenPath] = d.writeFile.mock.calls[0];
    expect(writtenPath).toBe('/h/.config/gmail-cli/allowlist-work.json');
  });
});

// Integration tests that drive the real Commander wiring end-to-end. These would have
// caught the positional-arg signature bug that unit tests (calling handlers directly) missed.
describe('allow add/remove CLI wiring', () => {
  function progDeps({ file, config = {} } = {}) {
    return {
      env: { HOME: '/h' },
      resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config, name }),
      readFile: vi.fn(() => {
        if (file == null) {
          const e = new Error('no');
          e.code = 'ENOENT';
          throw e;
        }
        return file;
      }),
      writeFile: vi.fn(),
      ensureDir: vi.fn(),
    };
  }
  const writtenBy = (d) => JSON.parse(d.writeFile.mock.calls[0][1]);

  it('wires the <email> positional and repeatable --alias into runAllowAdd', async () => {
    const d = progDeps();
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await buildProgram(d).parseAsync(
        ['node', 'gmail', 'allow', 'add', 'alice@example.com', '--alias', 'alice', '--alias', 'a'],
        { from: 'node' },
      );
    } finally {
      spy.mockRestore();
    }
    expect(d.ensureDir).toHaveBeenCalled();
    expect(writtenBy(d).recipients).toEqual([{ email: 'alice@example.com', aliases: ['alice', 'a'] }]);
  });

  it('wires the <target> positional into runAllowRemove', async () => {
    const d = progDeps({
      file: JSON.stringify({
        recipients: [
          { email: 'alice@example.com', aliases: ['alice'] },
          { email: 'bob@example.com' },
        ],
      }),
    });
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await buildProgram(d).parseAsync(['node', 'gmail', 'allow', 'remove', 'alice'], { from: 'node' });
    } finally {
      spy.mockRestore();
    }
    expect(writtenBy(d).recipients.map((r) => r.email)).toEqual(['bob@example.com']);
  });
});
