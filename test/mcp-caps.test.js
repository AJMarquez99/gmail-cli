import { describe, it, expect, vi } from 'vitest';
import { makeToolHandler } from '../src/mcp/server.js';
import { resolveCapabilities, COMMAND_CAPABILITY, enforceCapability } from '../src/capabilities.js';
import { CapabilityDeniedError } from '../src/lib/errors.js';
import { TOOLS } from '../src/mcp/tools.js';

function profileWith(caps) {
  return { name: 'scoped', capabilities: resolveCapabilities(caps) };
}

describe('MCP capability enforcement', () => {
  it('blocks gmail_send when the profile denies send (structured error, command not called)', async () => {
    const command = vi.fn(async () => ({ ok: true }));
    const deps = { resolveProfile: () => profileWith({ deny: ['send'] }) };
    const tool = { capabilityPath: 'send', command, mapArgs: (a) => a };
    const res = await makeToolHandler(tool, deps)({ to: 'x@y.com' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('send');
    expect(command).not.toHaveBeenCalled();
  });

  it('allows gmail_send when the profile permits send', async () => {
    const command = vi.fn(async () => ({ ok: true }));
    const deps = { resolveProfile: () => profileWith({ capabilities: ['send'] }) };
    const tool = { capabilityPath: 'send', command, mapArgs: (a) => a };
    const res = await makeToolHandler(tool, deps)({ to: 'x@y.com' });
    expect(res.isError).toBeUndefined();
    expect(command).toHaveBeenCalledOnce();
  });

  it('read tools require no capability check path resolution when unrestricted', async () => {
    const command = vi.fn(async () => ({ messages: [] }));
    const deps = { resolveProfile: () => profileWith({}) }; // unrestricted (all buckets)
    const tool = { capabilityPath: 'read list', command, mapArgs: (a) => a };
    const res = await makeToolHandler(tool, deps)({});
    expect(res.isError).toBeUndefined();
    expect(command).toHaveBeenCalledOnce();
  });

  it('resolves the profile named in the tool args (per-profile scope)', async () => {
    const resolveProfile = vi.fn(() => profileWith({ capabilities: ['read'] }));
    const command = vi.fn(async () => ({}));
    const tool = { capabilityPath: 'mark', command, mapArgs: (a) => a };
    const res = await makeToolHandler(tool, { resolveProfile })({ profile: 'work' });
    expect(resolveProfile).toHaveBeenCalledWith('work');
    expect(res.isError).toBe(true);
    expect(command).not.toHaveBeenCalled();
  });
});

describe('MCP TOOLS reuse the CLI command→bucket mapping', () => {
  it('every tool declares a capabilityPath that is a COMMAND_CAPABILITY key', () => {
    for (const t of TOOLS) {
      expect(typeof t.capabilityPath, t.name).toBe('string');
      expect(Object.prototype.hasOwnProperty.call(COMMAND_CAPABILITY, t.capabilityPath), t.name).toBe(true);
    }
  });

  it('a read-only profile is denied the real organize/send tools, allowed the read tools', async () => {
    const deps = { resolveProfile: () => profileWith({ capabilities: ['read'] }) };
    const denied = ['gmail_send', 'gmail_label_add', 'gmail_label_remove', 'gmail_mark'];
    for (const t of TOOLS) {
      const command = vi.fn(async () => ({}));
      const res = await makeToolHandler({ ...t, command }, deps)({ uid: 1, name: 'x', to: 'a@b.c' });
      if (denied.includes(t.name)) {
        expect(res.isError, t.name).toBe(true);
        expect(command, t.name).not.toHaveBeenCalled();
      } else {
        expect(res.isError, t.name).toBeUndefined();
        expect(command, t.name).toHaveBeenCalledOnce();
      }
    }
  });
});

describe('enforceCapability', () => {
  it('throws CapabilityDeniedError (exit 4) when the bucket is missing', () => {
    const deps = { resolveProfile: () => profileWith({ deny: ['send'] }) };
    let err;
    try { enforceCapability('send', {}, deps); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(CapabilityDeniedError);
    expect(err.exitCode).toBe(4);
  });

  it('is a no-op for always-allowed or unmapped paths (profile not resolved)', () => {
    const resolveProfile = vi.fn();
    enforceCapability('doctor', {}, { resolveProfile });
    enforceCapability(undefined, {}, { resolveProfile });
    expect(resolveProfile).not.toHaveBeenCalled();
  });
});
