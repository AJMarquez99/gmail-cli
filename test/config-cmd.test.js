import { describe, it, expect, vi } from 'vitest';
import { runConfigSet, runConfigGet, runConfigUnset } from '../src/commands/config.js';
import { buildProgram } from '../src/cli.js';

function deps({ file } = {}) {
  return {
    env: { HOME: '/h' },
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
});
