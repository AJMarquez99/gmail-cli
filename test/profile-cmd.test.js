import { describe, it, expect, vi } from 'vitest';
import { runProfileAdd, runProfileList, runProfileUse, runProfileRemove } from '../src/commands/profile.js';
import { buildProgram } from '../src/cli.js';
import { InvalidInputError } from '../src/lib/errors.js';
import { resolveProfile as realResolveProfile } from '../src/profile.js';

function deps({ file, config: cfgForProfile = {} } = {}) {
  return {
    env: { HOME: '/h' },
    resolveProfile: (name) =>
      realResolveProfile({ env: { HOME: '/h' }, config: cfgForProfile, name }),
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

// ─── runProfileAdd ──────────────────────────────────────────────────────────

describe('runProfileAdd', () => {
  it('adds to an empty config, sets defaultProfile, returns default:true', async () => {
    const d = deps(); // empty config (ENOENT → {})
    const out = await runProfileAdd({ name: 'work' }, d);
    const w = written(d);
    expect(w.profiles.work).toEqual({});
    expect(w.defaultProfile).toBe('work');
    expect(out).toEqual({ name: 'work', default: true, action: 'created' });
    expect(d.ensureDir).toHaveBeenCalled();
  });

  it('adds a second profile without changing the existing defaultProfile', async () => {
    const existing = JSON.stringify({ profiles: { work: {} }, defaultProfile: 'work' });
    // Need a resolveProfile that knows about the existing profile
    const d = deps({ file: existing, config: { profiles: { work: {} }, defaultProfile: 'work' } });
    const out = await runProfileAdd({ name: 'home' }, d);
    const w = written(d);
    expect(w.profiles.work).toEqual({});
    expect(w.profiles.home).toEqual({});
    expect(w.defaultProfile).toBe('work'); // unchanged
    expect(out).toEqual({ name: 'home', default: false, action: 'created' });
  });

  it('throws InvalidInputError when profile already exists', async () => {
    const existing = JSON.stringify({ profiles: { work: {} }, defaultProfile: 'work' });
    const d = deps({ file: existing, config: { profiles: { work: {} }, defaultProfile: 'work' } });
    await expect(runProfileAdd({ name: 'work' }, d)).rejects.toThrow(InvalidInputError);
    await expect(runProfileAdd({ name: 'work' }, d)).rejects.toThrow(/already exists/);
  });
});

// ─── runProfileList ─────────────────────────────────────────────────────────

describe('runProfileList', () => {
  it('returns mode:single-account when no profiles exist', async () => {
    const d = deps(); // ENOENT → {}
    const out = await runProfileList({}, d);
    expect(out).toEqual({ mode: 'single-account', profiles: [] });
  });

  it('returns mode:single-account when profiles key is empty', async () => {
    const d = deps({ file: JSON.stringify({ profiles: {} }) });
    const out = await runProfileList({}, d);
    expect(out).toEqual({ mode: 'single-account', profiles: [] });
  });

  it('lists profiles, marking the default', async () => {
    const cfg = JSON.stringify({
      defaultProfile: 'work',
      profiles: { work: {}, home: {} },
    });
    const d = deps({ file: cfg });
    const out = await runProfileList({}, d);
    expect(out.defaultProfile).toBe('work');
    expect(out.profiles).toEqual([
      { name: 'work', default: true },
      { name: 'home', default: false },
    ]);
  });
});

// ─── runProfileUse ──────────────────────────────────────────────────────────

describe('runProfileUse', () => {
  it('sets the defaultProfile for an existing profile', async () => {
    const cfg = JSON.stringify({ profiles: { work: {}, home: {} }, defaultProfile: 'work' });
    const d = deps({ file: cfg });
    const out = await runProfileUse({ name: 'home' }, d);
    const w = written(d);
    expect(w.defaultProfile).toBe('home');
    expect(out).toEqual({ defaultProfile: 'home', action: 'default-set' });
  });

  it('throws InvalidInputError for an unknown profile', async () => {
    const cfg = JSON.stringify({ profiles: { work: {} } });
    const d = deps({ file: cfg });
    await expect(runProfileUse({ name: 'ghost' }, d)).rejects.toThrow(InvalidInputError);
    await expect(runProfileUse({ name: 'ghost' }, d)).rejects.toThrow(/Unknown profile/);
  });
});

// ─── runProfileRemove ───────────────────────────────────────────────────────

describe('runProfileRemove', () => {
  it('removes a non-default profile, defaultProfile unchanged, filesKept has 3 paths, no file deletion', async () => {
    const cfg = JSON.stringify({
      profiles: { work: {}, home: {} },
      defaultProfile: 'work',
    });
    const d = deps({ file: cfg, config: { profiles: { work: {}, home: {} }, defaultProfile: 'work' } });
    const out = await runProfileRemove({ name: 'home' }, d);
    const w = written(d);
    expect(w.profiles.home).toBeUndefined();
    expect(w.profiles.work).toBeDefined();
    expect(w.defaultProfile).toBe('work'); // unchanged
    expect(out.name).toBe('home');
    expect(out.action).toBe('removed');
    expect(out.filesKept).toHaveLength(3);
    // Verify the 3 paths correspond to the home profile
    expect(out.filesKept.some((p) => p.includes('home'))).toBe(true);
    // No file deletion dep was called (no deleteFile/unlink in deps)
    expect(out.newDefault).toBe('work');
  });

  it('removes the default profile when exactly one other remains — repoints to it', async () => {
    const cfg = JSON.stringify({
      profiles: { work: {}, home: {} },
      defaultProfile: 'work',
    });
    const d = deps({ file: cfg, config: { profiles: { work: {}, home: {} }, defaultProfile: 'work' } });
    const out = await runProfileRemove({ name: 'work' }, d);
    const w = written(d);
    expect(w.profiles.work).toBeUndefined();
    expect(w.defaultProfile).toBe('home'); // repointed to sole remaining
    expect(out.newDefault).toBe('home');
  });

  it('removes the default profile when multiple others remain — clears defaultProfile', async () => {
    const cfg = JSON.stringify({
      profiles: { work: {}, home: {}, personal: {} },
      defaultProfile: 'work',
    });
    const d = deps({
      file: cfg,
      config: { profiles: { work: {}, home: {}, personal: {} }, defaultProfile: 'work' },
    });
    const out = await runProfileRemove({ name: 'work' }, d);
    const w = written(d);
    expect(w.profiles.work).toBeUndefined();
    expect(w.defaultProfile).toBeUndefined(); // cleared
    expect(out.newDefault).toBeNull();
  });

  it('removes the last/only profile — profiles becomes empty, defaultProfile cleared', async () => {
    const cfg = JSON.stringify({ profiles: { work: {} }, defaultProfile: 'work' });
    const d = deps({ file: cfg, config: { profiles: { work: {} }, defaultProfile: 'work' } });
    const out = await runProfileRemove({ name: 'work' }, d);
    const w = written(d);
    expect(w.profiles).toEqual({});
    expect(w.defaultProfile).toBeUndefined(); // cleared entirely
    expect(out.newDefault).toBeNull();
  });

  it('throws InvalidInputError for an unknown profile', async () => {
    const cfg = JSON.stringify({ profiles: { work: {} } });
    const d = deps({ file: cfg, config: { profiles: { work: {} } } });
    await expect(runProfileRemove({ name: 'ghost' }, d)).rejects.toThrow(InvalidInputError);
  });

  it('does NOT call any file-delete dep — files are only left on disk', async () => {
    const cfg = JSON.stringify({ profiles: { work: {}, home: {} }, defaultProfile: 'work' });
    const d = deps({ file: cfg, config: { profiles: { work: {}, home: {} }, defaultProfile: 'work' } });
    // Confirm there's no deleteFile / unlinkFile on deps — the command shouldn't call anything
    // other than readFile, writeFile, ensureDir
    await runProfileRemove({ name: 'home' }, d);
    // Only read + write should have been called; no "delete" call
    const writeCalls = d.writeFile.mock.calls.length;
    expect(writeCalls).toBe(1); // exactly one write (the updated config)
  });
});

// ─── CLI integration: positional wiring ─────────────────────────────────────

describe('profile CLI wiring', () => {
  function progDeps({ file, config = {} } = {}) {
    return {
      env: { HOME: '/h' },
      resolveProfile: (name) => realResolveProfile({ env: { HOME: '/h' }, config, name }),
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

  it('wires `profile add <name>` positional', async () => {
    const d = progDeps();
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await buildProgram(d).parseAsync(['node', 'gmail', 'profile', 'add', 'work'], { from: 'node' });
    } finally {
      spy.mockRestore();
    }
    const w = JSON.parse(d.writeFile.mock.calls[0][1]);
    expect(w.profiles.work).toEqual({});
    expect(w.defaultProfile).toBe('work');
  });

  it('wires `profile list` and returns single-account when no profiles', async () => {
    const d = progDeps();
    const output = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
      output.push(s);
      return true;
    });
    try {
      await buildProgram(d).parseAsync(['node', 'gmail', 'profile', 'list'], { from: 'node' });
    } finally {
      spy.mockRestore();
    }
    const result = JSON.parse(output.join(''));
    expect(result.mode).toBe('single-account');
  });
});
