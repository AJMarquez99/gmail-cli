#!/usr/bin/env node
import { startMcpServer } from '../src/mcp/server.js';

startMcpServer().catch((err) => {
  process.stderr.write(String((err && err.stack) || err) + '\n');
  process.exit(1);
});
