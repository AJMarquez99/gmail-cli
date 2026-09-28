import { describe, it, expect, vi } from 'vitest';
import { createGmailTransport } from '../src/transport.js';

describe('createGmailTransport', () => {
  it('builds a Gmail SMTP transport authed with the user + app password', () => {
    const made = { sendMail: vi.fn() };
    const createTransport = vi.fn(() => made);
    const transporter = createGmailTransport(
      { user: 'a@gmail.com', appPassword: 'apppw' },
      { createTransport },
    );
    expect(createTransport).toHaveBeenCalledWith({
      service: 'gmail',
      auth: { user: 'a@gmail.com', pass: 'apppw' },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(transporter).toBe(made);
  });

  it('creates the transport with file and URL access disabled', () => {
    let opts;
    const fake = (o) => { opts = o; return { sentinel: true }; };
    createGmailTransport({ user: 'me@gmail.com', appPassword: 'pw' }, { createTransport: fake });
    expect(opts.disableFileAccess).toBe(true);
    expect(opts.disableUrlAccess).toBe(true);
  });
});
