import { describe, it, expect, vi } from 'vitest';
import { runConfigSet, runConfigGet, runConfigUnset } from '../src/commands/config.js';
import { buildProgram } from '../src/cli.js';
import { resolveProfile } from '../src/profile.js';

function deps({ file, config: cfgForProfile = {} } = {}) {
  return {
    env: { HOME: '/h' },
    resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config: cfgForProfile, name }),
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

describe('runConfigSet', () => {
  it('sets a top-level key, preserving _comment and other keys', async () => {
    const d = deps({ file: JSON.stringify({ _comment: 'keep', replyTo: 'old@x.com' }) });
    const out = await runConfigSet({ key: 'fromName', value: 'Your Name' }, d);
    const w = written(d);
    expect(w).toEqual({ _comment: 'keep', replyTo: 'old@x.com', fromName: 'Your Name' });
    expect(out.unknownKey).toBeFalsy();
    expect(d.ensureDir).toHaveBeenCalled();
  });
  it('coerces booleans and sets nested keys', async () => {
    const d = deps();
    await runConfigSet({ key: 'allowlist.enforce', value: 'false' }, d);
    expect(written(d)).toEqual({ allowlist: { enforce: false } });
  });
  it('sets sendLog.logBody true (boolean)', async () => {
    const d = deps();
    await runConfigSet({ key: 'sendLog.logBody', value: 'true' }, d);
    expect(written(d)).toEqual({ sendLog: { logBody: true } });
  });
  it('flags unknown keys but still sets them', async () => {
    const d = deps();
    const out = await runConfigSet({ key: 'foo', value: 'bar' }, d);
    expect(out.unknownKey).toBe(true);
    expect(written(d)).toEqual({ foo: 'bar' });
  });
});

describe('runConfigGet', () => {
  it('returns a single key', async () => {
    const d = deps({ file: JSON.stringify({ fromName: 'X' }) });
    expect(await runConfigGet({ key: 'fromName' }, d)).toEqual({ key: 'fromName', value: 'X' });
  });
  it('returns the whole config when no key', async () => {
    const d = deps({ file: JSON.stringify({ a: 1 }) });
    expect(await runConfigGet({}, d)).toEqual({ config: { a: 1 } });
  });
});

describe('runConfigUnset', () => {
  it('removes a key, leaving siblings', async () => {
    const d = deps({ file: JSON.stringify({ fromName: 'X', replyTo: 'y@x.com' }) });
    await runConfigUnset({ key: 'fromName' }, d);
    expect(written(d)).toEqual({ replyTo: 'y@x.com' });
  });
});

// Integration tests that drive the real Commander wiring end-to-end.
describe('config CLI wiring', () => {
  it('wires `config set` positionals through the CLI', async () => {
    const d = deps();
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await buildProgram(d).parseAsync(['node', 'gmail', 'config', 'set', 'fromName', 'CLI Name'], {
        from: 'node',
      });
    } finally {
      spy.mockRestore();
    }
    expect(JSON.parse(d.writeFile.mock.calls[0][1])).toEqual({ fromName: 'CLI Name' });
  });

  it('writes profiles.<name>.<key> when --profile is passed globally before subcommand', async () => {
    // --profile is a global option; commander accepts it before the subcommand.
    // Pass config so resolveProfile is wired with work profile; override readFile to
    // return the matching config JSON so readJson in config.js sees the profile too.
    const profileConfig = { profiles: { work: {} } };
    const d = deps({ config: profileConfig });
    d.readFile = vi.fn(() => JSON.stringify(profileConfig));
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await buildProgram(d).parseAsync(
        ['node', 'gmail', '--profile', 'work', 'config', 'set', 'fromName', 'W'],
        { from: 'node' },
      );
    } finally {
      spy.mockRestore();
    }
    const w = JSON.parse(d.writeFile.mock.calls[0][1]);
    expect(w.profiles.work.fromName).toBe('W');
  });
});

describe('runConfigSet — profile mode', () => {
  it('writes key under profiles.<name> for a named profile', async () => {
    const d = deps({ config: { profiles: { work: {} } } });
    const out = await runConfigSet({ key: 'fromName', value: 'W', profile: 'work' }, d);
    expect(written(d)).toEqual({ profiles: { work: { fromName: 'W' } } });
    expect(out.unknownKey).toBeFalsy();
  });

  it('preserves other profiles when setting a key on one profile', async () => {
    const profileConfig = { profiles: { work: {}, home: { fromName: 'Home' } } };
    const d = deps({ file: JSON.stringify(profileConfig), config: profileConfig });
    await runConfigSet({ key: 'fromName', value: 'Work', profile: 'work' }, d);
    const w = written(d);
    expect(w.profiles.work.fromName).toBe('Work');
    expect(w.profiles.home.fromName).toBe('Home');
  });

  it('coerces booleans under the profile path', async () => {
    const d = deps({ config: { profiles: { work: {} } } });
    await runConfigSet({ key: 'allowlist.enforce', value: 'false', profile: 'work' }, d);
    expect(written(d)).toEqual({ profiles: { work: { allowlist: { enforce: false } } } });
  });
});

describe('runConfigGet — profile mode', () => {
  it('returns key value under profiles.<name> for a named profile', async () => {
    const profileConfig = { profiles: { work: { fromName: 'W' } } };
    const d = deps({ file: JSON.stringify(profileConfig), config: profileConfig });
    const out = await runConfigGet({ key: 'fromName', profile: 'work' }, d);
    expect(out).toEqual({ key: 'fromName', value: 'W' });
  });

  it('returns the whole profile object with profile name when no key', async () => {
    const profileConfig = { profiles: { work: { fromName: 'W' } } };
    const d = deps({ file: JSON.stringify(profileConfig), config: profileConfig });
    const out = await runConfigGet({ profile: 'work' }, d);
    expect(out).toEqual({ profile: 'work', config: { fromName: 'W' } });
  });
});

describe('runConfigUnset — profile mode', () => {
  it('removes key under profiles.<name>', async () => {
    const profileConfig = { profiles: { work: { fromName: 'W', replyTo: 'r@x.com' } } };
    const d = deps({ file: JSON.stringify(profileConfig), config: profileConfig });
    await runConfigUnset({ key: 'fromName', profile: 'work' }, d);
    const w = written(d);
    expect(w.profiles.work).toEqual({ replyTo: 'r@x.com' });
  });
});
