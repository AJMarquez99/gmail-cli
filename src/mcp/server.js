import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { defaultDeps } from '../deps.js';
import { VERSION } from '../version.js';
import { TOOLS } from './tools.js';
import { GmailError } from '../lib/errors.js';

export function makeToolHandler(tool, deps) {
  return async (args) => {
    try {
      const result = await tool.command(tool.mapArgs(args || {}), deps);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      // A GmailError (incl. RecipientNotAllowedError / MalformedConfigError) is surfaced as a
      // structured tool error, never a server crash. The gate block is inherited from the command.
      const msg = err instanceof GmailError ? err.message : (err && err.message) || String(err);
      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  };
}

export function buildMcpServer(deps = defaultDeps) {
  const server = new McpServer({ name: 'gmail-cli', version: VERSION });
  for (const t of TOOLS) {
    server.registerTool(t.name, { description: t.description, inputSchema: t.inputSchema }, makeToolHandler(t, deps));
  }
  return server;
}

export async function startMcpServer(deps = defaultDeps) {
  const server = buildMcpServer(deps);
  await server.connect(new StdioServerTransport());
}
