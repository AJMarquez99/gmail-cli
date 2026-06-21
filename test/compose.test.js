import { describe, it, expect } from 'vitest';
import { buildMessage } from '../src/compose.js';

const ctx = { profile: { fromName: null, replyTo: null, signature: null }, creds: { user: 'me@x.com' } };
const deps = { statFile: () => ({ isFile: () => true, size: 10 }) };

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
    expect(m.from).toBe('"Me" <me@x.com>');
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
});
