import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simpleParser } from 'mailparser';
import { normalizeMessage } from '../src/lib/normalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures', 'sample.eml');

const makeImapMsg = () => ({
  uid: 42,
  envelope: {
    subject: 'Hi',
    from: [{ address: 'a@x.com', name: 'A' }],
    to: [{ address: 'b@y.com', name: 'B' }],
    date: '2026-01-01T00:00:00Z',
    messageId: '<m@x>',
  },
  threadId: 'thr1',
  labels: new Set(['\\Inbox']),
  flags: new Set(['\\Seen']),
});

describe('normalizeMessage', () => {
  let parsed;

  beforeAll(async () => {
    const raw = readFileSync(fixturePath);
    parsed = await simpleParser(raw);
  });

  it('returns correct scalar fields from imapMsg', () => {
    const result = normalizeMessage(makeImapMsg(), parsed);

    expect(result.uid).toBe(42);
    expect(result.messageId).toBe('<m@x>');
    expect(result.threadId).toBe('thr1');
    expect(result.subject).toBe('Hi');
  });

  it('returns from and to as arrays of address strings', () => {
    const result = normalizeMessage(makeImapMsg(), parsed);

    expect(result.from).toEqual(['a@x.com']);
    expect(result.to).toEqual(['b@y.com']);
  });

  it('returns date as ISO string', () => {
    const result = normalizeMessage(makeImapMsg(), parsed);

    expect(result.date).toBe(new Date('2026-01-01T00:00:00Z').toISOString());
  });

  it('converts labels and flags Sets to arrays', () => {
    const result = normalizeMessage(makeImapMsg(), parsed);

    expect(result.labels).toEqual(['\\Inbox']);
    expect(result.flags).toEqual(['\\Seen']);
  });

  it('sets snippet to a trimmed ≤140-char single-line string from body text', () => {
    const result = normalizeMessage(makeImapMsg(), parsed);

    expect(typeof result.snippet).toBe('string');
    expect(result.snippet.length).toBeLessThanOrEqual(140);
    expect(result.snippet).not.toMatch(/\n/);
    expect(result.snippet.length).toBeGreaterThan(0);
  });

  it('sets text from parsed.text', () => {
    const result = normalizeMessage(makeImapMsg(), parsed);

    expect(result.text).toBe(parsed.text);
  });

  it('includes attachment metadata without content bytes', () => {
    const result = normalizeMessage(makeImapMsg(), parsed);

    expect(Array.isArray(result.attachments)).toBe(true);
    expect(result.attachments.length).toBeGreaterThan(0);

    for (const att of result.attachments) {
      expect(att).toHaveProperty('filename');
      expect(att).toHaveProperty('size');
      expect(att).toHaveProperty('contentType');
      expect(att).not.toHaveProperty('content');
    }
  });

  it('returns null text, html, empty attachments and empty snippet when parsed is undefined', () => {
    const result = normalizeMessage(makeImapMsg(), undefined);

    expect(result.text).toBeNull();
    expect(result.html).toBeNull();
    expect(result.attachments).toEqual([]);
    expect(result.snippet).toBe('');
  });

  it('handles missing labels and flags gracefully', () => {
    const msg = { ...makeImapMsg(), labels: undefined, flags: undefined };
    const result = normalizeMessage(msg, undefined);

    expect(result.labels).toEqual([]);
    expect(result.flags).toEqual([]);
  });

  it('handles missing envelope gracefully', () => {
    const msg = { uid: 1, envelope: undefined };
    const result = normalizeMessage(msg, undefined);

    expect(result.subject).toBe('');
    expect(result.from).toEqual([]);
    expect(result.to).toEqual([]);
    expect(result.date).toBeNull();
    expect(result.messageId).toBeNull();
  });
});
