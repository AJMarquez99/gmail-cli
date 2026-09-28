import { describe, it, expect, vi } from 'vitest';
import { appendSendLog, readSendLog, resolveSendLogPath } from '../src/lib/sendlog.js';

describe('sendlog', () => {
  it('appends one JSON line per entry', () => {
    const append = vi.fn();
    const mkdir = vi.fn();
    appendSendLog({ ts: 'T', subject: 'S' }, { env: { HOME: '/h' }, append, mkdir });
    expect(mkdir).toHaveBeenCalledWith('/h/.config/gmail-cli', { recursive: true });
    expect(append).toHaveBeenCalledWith('/h/.config/gmail-cli/sent.jsonl', '{"ts":"T","subject":"S"}\n', { mode: 0o600 });
  });

  it('reads the last N entries newest-first', () => {
    const raw = ['{"subject":"a"}', '{"subject":"b"}', '{"subject":"c"}'].join('\n') + '\n';
    const out = readSendLog({ env: { HOME: '/h' }, readFile: () => raw, limit: 2 });
    expect(out.map((e) => e.subject)).toEqual(['c', 'b']);
  });

  it('skips unparseable lines', () => {
    const raw = ['{"subject":"a"}', 'not-json', '{"subject":"b"}'].join('\n') + '\n';
    const out = readSendLog({ env: { HOME: '/h' }, readFile: () => raw });
    expect(out.map((e) => e.subject)).toEqual(['b', 'a']);
  });

  it('returns [] when the log is absent', () => {
    const readFile = () => { const e = new Error('no'); e.code = 'ENOENT'; throw e; };
    expect(readSendLog({ env: { HOME: '/h' }, readFile })).toEqual([]);
  });

  it('honors GMAIL_SEND_LOG override', () => {
    expect(resolveSendLogPath({ GMAIL_SEND_LOG: '/tmp/s.jsonl' })).toBe('/tmp/s.jsonl');
  });

  it('appendSendLog uses the explicit path when provided', () => {
    const append = vi.fn();
    const mkdir = vi.fn();
    appendSendLog({ a: 1 }, { env: { HOME: '/h' }, append, mkdir, path: '/custom/sent.jsonl' });
    expect(mkdir).toHaveBeenCalledWith('/custom', { recursive: true });
    expect(append).toHaveBeenCalledWith('/custom/sent.jsonl', '{"a":1}\n', { mode: 0o600 });
  });

  it('readSendLog uses the explicit path when provided', () => {
    const readFile = vi.fn(() => '{"x":1}\n');
    const out = readSendLog({ env: { HOME: '/h' }, readFile, path: '/custom/sent.jsonl' });
    expect(readFile).toHaveBeenCalledWith('/custom/sent.jsonl', 'utf8');
    expect(out).toEqual([{ x: 1 }]);
  });

  it('re-tightens the log to 0600 via chmod after appending (mode is create-only)', () => {
    const append = vi.fn();
    const mkdir = vi.fn();
    const chmod = vi.fn();
    appendSendLog({ ts: 'T' }, { env: { HOME: '/h' }, append, mkdir, chmod });
    expect(chmod).toHaveBeenCalledWith('/h/.config/gmail-cli/sent.jsonl', 0o600);
  });

  it('swallows a chmod failure and warns instead of throwing (append already succeeded)', () => {
    const append = vi.fn();
    const mkdir = vi.fn();
    const chmod = vi.fn(() => { throw new Error('EPERM'); });
    const warn = vi.fn();
    expect(() => appendSendLog({ ts: 'T' }, { env: { HOME: '/h' }, append, mkdir, chmod, warn })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('EPERM'));
  });
});
