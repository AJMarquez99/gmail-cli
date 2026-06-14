import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VERSION } from '../src/version.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('package', () => {
  it('declares the gmail + gmail-mcp bins and is ESM', () => {
    expect(pkg.type).toBe('module');
    expect(pkg.bin.gmail).toBe('./bin/gmail.js');
    expect(pkg.bin['gmail-mcp']).toBe('./bin/gmail-mcp.js');
  });

  it('is publish-shaped: scoped name, files allowlist, public access', () => {
    expect(pkg.name).toBe('@ajmarquez99/gmail-cli');
    expect(pkg.files).toEqual(expect.arrayContaining(['bin/', 'src/', 'README.md', 'LICENSE']));
    expect(pkg.publishConfig).toEqual({ access: 'public' });
    expect(pkg.license).toBe('MIT');
  });

  it('single-sources the version from package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });
});
