import { describe, it, expect, vi } from 'vitest';
import { runAllowList } from '../src/commands/allow.js';

describe('runAllowList', () => {
  it('returns the allowlist recipients with a count', async () => {
    const deps = {
      loadAllowlist: vi.fn(() => ({
        recipients: [
          { email: 'a@x.com', aliases: ['a'] },
          { email: 'b@x.com' },
        ],
      })),
    };
    const out = await runAllowList({}, deps);
    expect(out).toEqual({
      count: 2,
      recipients: [
        { email: 'a@x.com', aliases: ['a'] },
        { email: 'b@x.com', aliases: [] },
      ],
    });
  });

  it('reports an empty allowlist as zero recipients', async () => {
    const deps = { loadAllowlist: vi.fn(() => ({ recipients: [] })) };
    expect(await runAllowList({}, deps)).toEqual({ count: 0, recipients: [] });
  });
});
