import { describe, it, expect } from 'vitest';
import { CapabilityDeniedError } from '../src/lib/errors.js';

describe('CapabilityDeniedError', () => {
  it('carries exit code 4 and names the bucket + profile', () => {
    const err = new CapabilityDeniedError('send', 'business');
    expect(err.exitCode).toBe(4);
    expect(err.message).toMatch(/business/);
    expect(err.message).toMatch(/send/);
  });
});
