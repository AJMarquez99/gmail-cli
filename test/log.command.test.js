import { it, expect, vi } from 'vitest';
import { runLog } from '../src/commands/log.js';
import { resolveProfile } from '../src/profile.js';

it('returns recent entries from readLog with the requested limit', async () => {
  const readLog = vi.fn(() => [{ ts: 'T', subject: 'S' }]);
  const config = {};
  const deps = {
    readLog,
    resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config, name }),
  };
  const out = await runLog({ limit: '5' }, deps);
  expect(readLog).toHaveBeenCalledWith({ path: '/h/.config/gmail-cli/sent.jsonl', limit: 5 });
  expect(out.entries).toEqual([{ ts: 'T', subject: 'S' }]);
});
