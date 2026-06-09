import { describe, it, expect, vi } from 'vitest';
import { runLog } from '../src/commands/log.js';

it('returns recent entries from readLog with the requested limit', async () => {
  const readLog = vi.fn(() => [{ ts: 'T', subject: 'S' }]);
  const out = await runLog({ limit: '5' }, { readLog });
  expect(readLog).toHaveBeenCalledWith({ limit: 5 });
  expect(out.entries).toEqual([{ ts: 'T', subject: 'S' }]);
});
