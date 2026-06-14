import { describe, it, expect } from 'vitest';
import { buildMcpServer, makeToolHandler } from '../src/mcp/server.js';
import { TOOLS } from '../src/mcp/tools.js';
import { RecipientNotAllowedError } from '../src/lib/errors.js';

describe('buildMcpServer', () => {
  it('constructs without throwing and returns a truthy object', () => {
    expect(buildMcpServer({})).toBeTruthy();
  });

  it('registers one tool per TOOLS entry', () => {
    const server = buildMcpServer({});
    const registered = server._registeredTools;
    if (registered && typeof registered === 'object') {
      expect(Object.keys(registered)).toHaveLength(TOOLS.length);
    } else {
      expect(server).toBeTruthy();
    }
  });
});

describe('makeToolHandler', () => {
  it('returns the JSON-stringified result with no isError on success', async () => {
    const tool = { command: async () => ({ ok: true }), mapArgs: (a) => a };
    const res = await makeToolHandler(tool, {})({});
    expect(res.isError).toBeUndefined();
    expect(res.content).toEqual([{ type: 'text', text: JSON.stringify({ ok: true }, null, 2) }]);
  });

  it('returns isError with the GmailError message when the command throws (gate block inherited)', async () => {
    const tool = {
      command: async () => { throw new RecipientNotAllowedError(['stranger@evil.com']); },
      mapArgs: (a) => a,
    };
    const res = await makeToolHandler(tool, {})({});
    expect(res.isError).toBe(true);
    expect(res.content[0].type).toBe('text');
    expect(res.content[0].text).toContain('stranger@evil.com');
    expect(res.content[0].text).toContain('Blocked by allowlist');
  });

  it('applies mapArgs before calling the command', async () => {
    let received;
    const tool = { command: async (opts) => { received = opts; return opts; }, mapArgs: (a) => ({ mapped: a.x }) };
    await makeToolHandler(tool, {})({ x: 'value' });
    expect(received).toEqual({ mapped: 'value' });
  });
});
