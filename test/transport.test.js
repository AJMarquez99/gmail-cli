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
    });
    expect(transporter).toBe(made);
  });
});
