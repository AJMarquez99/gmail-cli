import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultDeps } from '../src/deps.js';

// Track every temp dir so afterEach removes it — tests must not leak dirs into the OS tmpdir.
const tmpDirs = [];
const makeTmpDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'gmail-cli-deps-'));
  tmpDirs.push(dir);
  return dir;
};
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('defaultDeps.chmod', () => {
  it('is a function that chmods a real file', () => {
    expect(typeof defaultDeps.chmod).toBe('function');
    const dir = makeTmpDir();
    const path = join(dir, 'f.json');
    defaultDeps.writeFile(path, '{}', 0o644);
    defaultDeps.chmod(path, 0o600);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});

describe('defaultDeps.writeFileIfAbsent', () => {
  it('creates the file at the given mode when absent', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'f.json');
    defaultDeps.writeFileIfAbsent(path, '{}', 0o600);
    expect(readFileSync(path, 'utf8')).toBe('{}');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('does not touch an existing file', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'f.json');
    defaultDeps.writeFile(path, 'original', 0o644);
    defaultDeps.writeFileIfAbsent(path, 'new', 0o600);
    expect(readFileSync(path, 'utf8')).toBe('original');
  });
});

describe('defaultDeps.warn', () => {
  it('is a function that writes a warning to stderr', () => {
    expect(typeof defaultDeps.warn).toBe('function');
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      defaultDeps.warn('something happened');
      // mockRestore() (in the finally below) also clears call history, so assert before it runs.
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('something happened'));
    } finally {
      spy.mockRestore();
    }
  });
});

describe('defaultDeps.appendLog', () => {
  it('re-tightens the send log to 0600 via defaultDeps.chmod after appending', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'sent.jsonl');
    defaultDeps.appendLog({ ts: 'T' }, { path });
    expect(readFileSync(path, 'utf8')).toBe('{"ts":"T"}\n');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
