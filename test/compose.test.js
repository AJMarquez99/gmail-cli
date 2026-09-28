import { describe, it, expect } from 'vitest';
import { buildMessage, buildRawMime, formatFrom } from '../src/compose.js';
import { simpleParser } from 'mailparser';

const ctx = { profile: { fromName: null, replyTo: null, signature: null }, creds: { user: 'me@x.com' } };
const deps = { statFile: () => ({ isFile: () => true, size: 10 }), readFileBytes: () => Buffer.from('x'), cwd: () => '/work' };

describe('buildMessage', () => {
  it('assembles from/to/cc/bcc/subject and text body', () => {
    const { message: m } = buildMessage({ to: ['a@x.com'], cc: ['c@x.com'], bcc: [] },
      { subject: 'Hi', body: 'Hello' }, ctx, deps);
    expect(m.from).toBe('me@x.com');
    expect(m.to).toEqual(['a@x.com']);
    expect(m.cc).toEqual(['c@x.com']);
    expect(m.subject).toBe('Hi');
    expect(m.text).toBe('Hello');
  });
  it('applies fromName when set', () => {
    const { message: m } = buildMessage({ to: ['a@x.com'], cc: [], bcc: [] }, { subject: '', body: 'x' },
      { ...ctx, profile: { ...ctx.profile, fromName: 'Me' } }, deps);
    expect(m.from).toEqual({ name: 'Me', address: 'me@x.com' });
  });
  it('passes the display name as a structured address so a quote cannot break the From header', async () => {
    const { message: m } = buildMessage({ to: ['a@x.com'], cc: [], bcc: [] }, { subject: '', body: 'x' },
      { ...ctx, profile: { ...ctx.profile, fromName: 'Ann "Q" Lee' } }, deps);
    expect(m.from).toEqual({ name: 'Ann "Q" Lee', address: 'me@x.com' });
    const parsed = await simpleParser(await buildRawMime(m));
    expect(parsed.from.value).toEqual([{ name: 'Ann "Q" Lee', address: 'me@x.com' }]);
  });
  it('threads via inReplyTo → sets references', () => {
    const { message: m } = buildMessage({ to: ['a@x.com'], cc: [], bcc: [] },
      { subject: 'Re', body: 'x', inReplyTo: '<id@x>' }, ctx, deps);
    expect(m.inReplyTo).toBe('<id@x>');
    expect(m.references).toEqual(['<id@x>']);
  });
  it('renders markdown into html + text', () => {
    const { message: m } = buildMessage({ to: ['a@x.com'], cc: [], bcc: [] },
      { subject: '', body: '# Title', markdown: true }, ctx, deps);
    expect(m.html).toContain('Title');
    expect(m.text).toContain('Title');
  });
  it('appends signature text/html when present', () => {
    const { message: m } = buildMessage({ to: ['a@x.com'], cc: [], bcc: [] }, { subject: '', body: 'Body' },
      { ...ctx, profile: { ...ctx.profile, signature: { text: '-- Me', html: '<p>-- Me</p>' } } }, deps);
    expect(m.text).toContain('-- Me');
  });
  it('rejects a CR/LF in fromName (header injection)', () => {
    expect(() => buildMessage({ to: ['a@x.com'], cc: [], bcc: [] }, { subject: '', body: 'x', fromName: 'Me\r\nBcc: evil@x.com' }, ctx, deps))
      .toThrow(/CR or LF/i);
  });
  it('rejects a CR/LF in replyTo (header injection)', () => {
    expect(() => buildMessage({ to: ['a@x.com'], cc: [], bcc: [] }, { subject: '', body: 'x', replyTo: 'r@x.com\nBcc: evil@x.com' }, ctx, deps))
      .toThrow(/CR or LF/i);
  });
  it('rejects a CR/LF in fromName sourced from profile config (not just the flag)', () => {
    expect(() => buildMessage({ to: ['a@x.com'], cc: [], bcc: [] }, { subject: '', body: 'x' },
      { ...ctx, profile: { ...ctx.profile, fromName: 'Me\r\nBcc: evil@x.com' } }, deps))
      .toThrow(/CR or LF/i);
  });
  it('rejects a CR/LF in replyTo sourced from profile config (not just the flag)', () => {
    expect(() => buildMessage({ to: ['a@x.com'], cc: [], bcc: [] }, { subject: '', body: 'x' },
      { ...ctx, profile: { ...ctx.profile, replyTo: 'r@x.com\nBcc: evil@x.com' } }, deps))
      .toThrow(/CR or LF/i);
  });
});

it('buildRawMime produces parseable RFC822', async () => {
  const { message } = buildMessage({ to: ['a@x.com'], cc: [], bcc: [] },
    { subject: 'Hi', body: 'Hello' }, ctx, deps);
  const raw = await buildRawMime(message);
  expect(Buffer.isBuffer(raw)).toBe(true);
  const parsed = await simpleParser(raw);
  expect(parsed.subject).toBe('Hi');
  expect(parsed.to.text).toContain('a@x.com');
});

it('buildRawMime disables file/URL access even if a caller sneaks a path/href attachment in (defense in depth)', async () => {
  const { message } = buildMessage({ to: ['a@x.com'], cc: [], bcc: [] },
    { subject: 'Hi', body: 'Hello' }, ctx, deps);
  message.attachments = [{ filename: 'x', path: '/etc/hosts' }];
  await expect(buildRawMime(message)).rejects.toThrow(/File access rejected/);
});

it('formatFrom renders a structured From for results/log, escaping quotes in the name', () => {
  expect(formatFrom('me@x.com')).toBe('me@x.com');
  expect(formatFrom({ name: 'Me', address: 'me@x.com' })).toBe('"Me" <me@x.com>');
  expect(formatFrom({ name: 'Ann "Q" Lee', address: 'me@x.com' })).toBe('"Ann \\"Q\\" Lee" <me@x.com>');
});
