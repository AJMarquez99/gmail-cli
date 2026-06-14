import { describe, it, expect, vi } from 'vitest';
import { readJson, writeJson, getPath, setPath, unsetPath, coerce } from '../src/lib/jsonfile.js';
import { MalformedConfigError } from '../src/lib/errors.js';

describe('readJson', () => {
  it('parses an existing file', () => {
    const readFile = vi.fn(() => '{"a":1}');
    expect(readJson('/p.json', { readFile })).toEqual({ a: 1 });
  });
  it('returns {} when the file is absent (ENOENT)', () => {
    const readFile = vi.fn(() => { const e = new Error('no'); e.code = 'ENOENT'; throw e; });
    expect(readJson('/p.json', { readFile })).toEqual({});
  });
  it('returns {} for an empty / whitespace-only file', () => {
    expect(readJson('/p.json', { readFile: vi.fn(() => '') })).toEqual({});
    expect(readJson('/p.json', { readFile: vi.fn(() => '   \n') })).toEqual({});
  });
  it('uses onMissing() for both absent and empty files', () => {
    const onMissing = vi.fn(() => ({ recipients: [] }));
    const enoent = vi.fn(() => { const e = new Error('no'); e.code = 'ENOENT'; throw e; });
    expect(readJson('/p.json', { readFile: enoent, onMissing })).toEqual({ recipients: [] });
    expect(readJson('/p.json', { readFile: vi.fn(() => ''), onMissing })).toEqual({ recipients: [] });
  });
  it('throws MalformedConfigError on malformed JSON (message names the file)', () => {
    const readFile = vi.fn(() => '{ bad');
    expect(() => readJson('/path/p.json', { readFile })).toThrow(/p\.json/);
    expect(() => readJson('/path/p.json', { readFile })).toThrow(MalformedConfigError);
  });
});

describe('writeJson', () => {
  it('writes pretty JSON with a trailing newline and passes mode', () => {
    const writeFile = vi.fn();
    writeJson('/p.json', { a: 1 }, { writeFile, mode: 0o600 });
    expect(writeFile).toHaveBeenCalledWith('/p.json', '{\n  "a": 1\n}\n', 0o600);
  });
  it('omits mode when not given', () => {
    const writeFile = vi.fn();
    writeJson('/p.json', { a: 1 }, { writeFile });
    expect(writeFile).toHaveBeenCalledWith('/p.json', '{\n  "a": 1\n}\n', undefined);
  });
});

describe('getPath/setPath/unsetPath', () => {
  it('getPath reads a dotted path', () => {
    expect(getPath({ a: { b: 2 } }, 'a.b')).toBe(2);
    expect(getPath({ a: {} }, 'a.x')).toBeUndefined();
  });
  it('setPath creates nested objects (non-mutating of input)', () => {
    const src = { a: { b: 1 } };
    const out = setPath(src, 'a.c.d', 9);
    expect(out).toEqual({ a: { b: 1, c: { d: 9 } } });
    expect(src).toEqual({ a: { b: 1 } }); // original untouched
  });
  it('unsetPath removes a leaf, leaving siblings', () => {
    expect(unsetPath({ a: { b: 1, c: 2 } }, 'a.b')).toEqual({ a: { c: 2 } });
  });
});

describe('coerce', () => {
  it('maps true/false strings to booleans, leaves others', () => {
    expect(coerce('true')).toBe(true);
    expect(coerce('false')).toBe(false);
    expect(coerce('hello')).toBe('hello');
  });
});
