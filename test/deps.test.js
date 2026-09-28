import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultDeps } from '../src/deps.js';

describe('defaultDeps.chmod', () => {
  it('is a function that chmods a real file', () => {
    expect(typeof defaultDeps.chmod).toBe('function');
    const dir = mkdtempSync(join(tmpdir(), 'gmail-cli-deps-'));
    const path = join(dir, 'f.json');
    defaultDeps.writeFile(path, '{}', 0o644);
    defaultDeps.chmod(path, 0o600);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});

describe('defaultDeps.writeFileIfAbsent', () => {
  it('creates the file at the given mode when absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gmail-cli-deps-'));
    const path = join(dir, 'f.json');
    defaultDeps.writeFileIfAbsent(path, '{}', 0o600);
    expect(readFileSync(path, 'utf8')).toBe('{}');
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('does not touch an existing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gmail-cli-deps-'));
    const path = join(dir, 'f.json');
    defaultDeps.writeFile(path, 'original', 0o644);
    defaultDeps.writeFileIfAbsent(path, 'new', 0o600);
    expect(readFileSync(path, 'utf8')).toBe('original');
  });
});
