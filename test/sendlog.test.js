import { describe, it, expect, vi } from 'vitest';
import { appendSendLog, readSendLog, resolveSendLogPath } from '../src/lib/sendlog.js';

describe('sendlog', () => {
  it('appends one JSON line per entry', () => {
    const append = vi.fn();
    const mkdir = vi.fn();
    appendSendLog({ ts: 'T', subject: 'S' }, { env: { HOME: '/h' }, append, mkdir });
    expect(mkdir).toHaveBeenCalledWith('/h/.config/gmail-cli', { recursive: true });
    expect(append).toHaveBeenCalledWith('/h/.config/gmail-cli/sent.jsonl', '{"ts":"T","subject":"S"}\n');
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
});
