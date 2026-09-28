# Runbook: Adding a command (or subcommand)

The end-to-end pattern for adding a new `gmail` command. Follow the DI and output conventions in
[[conventions]]; the moving parts are mapped in [[architecture]].

## Steps

1. **Write the handler** in `src/commands/<group>.js` as `export async function runXxx(opts, deps)`.
   - Read inputs from `opts` only (positionals are mapped onto `opts` by `handle()` — see step 3).
   - Touch the outside world only through `deps` (`deps.readFile`, `deps.createTransport`,
     `deps.resolveProfile`, etc.). If you need a new side effect, add it to `defaultDeps` in
     `src/deps.js`.
   - **Return a plain data object.** Do not print and do not set exit codes — `handle()` does both.
   - For IMAP operations, wrap the work in `withClient(opts, deps, async (client) => …)` (exported
     from `src/commands/read.js`) so connect/`logout()`/the `openImapClient` timeout-and-retry
     discipline are handled for you. Never open a client with a bare `createImapClient(...).connect()`.
   - Throw the right error class from `src/lib/errors.js`: `InvalidInputError`/`TooManyRecipientsError`
     → exit 2, `RecipientNotAllowedError`/`BoundaryLockedError` → exit 3,
     `CapabilityDeniedError` → exit 4 (thrown for you by `enforceCapability` in step 1a below, not
     something you throw by hand), otherwise generic → exit 1.

2. **Register the command's required capability** in `COMMAND_CAPABILITY` (`src/capabilities.js`),
   keyed by the same command path you'll register in `cli.js` (e.g. `'organize archive'` — check the
   existing keys for the exact convention, most are the bare command name). Map it to one of the
   `read`/`organize`/`draft`/`send`/`delete` buckets, a function `(opts) => bucket` for
   flag-dependent commands (see `reply`), or `null` for an always-allowed local/diagnostic command.
   **This step is easy to skip silently: a command path with no entry in `COMMAND_CAPABILITY` is
   always-allowed**, not always-denied — an unmapped command bypasses per-profile capability
   scoping entirely. `test/capability-gate.test.js` is a coverage guard that fails if a registered
   CLI command has no entry, so don't skip this step even for a command that "obviously" needs no
   gating — add it to the map with the right bucket (or an explicit `null`).

3. **Add a table renderer** (optional) in `src/lib/format.js` as `export function formatXxx(result)`
   returning a string. Skip if JSON-only is fine.

4. **Register the command** in `src/cli.js` inside `buildProgram()`:
   ```js
   program
     .command('xxx <positional>')
     .description('…')
     .option('--flag <v>', '…')
     .action(handle(runXxx, { table: formatXxx, args: ['positional'] }));
   ```
   - `args: [...]` lists positional names in order, so the handler reads them off `opts`.
   - `table:` wires the renderer for `--format table`; omit for JSON-only.
   - `preprocess:` is for pre-handler async work (e.g. reading piped stdin — see `send`).
   - Import `runXxx` (and `formatXxx`) at the top of `cli.js`.
   - `handle()` calls `enforceCapability(commandPath, opts, deps)` using this same command path
     before invoking `runXxx` — this is what makes step 2 take effect on the CLI side.

5. **Expose it over MCP** (optional — only for commands meant to be agent-facing; see
   [[safety-spec]] §5.8). Add an entry to the `TOOLS` array in `src/mcp/tools.js`: `name`
   (`gmail_xxx`), `capabilityPath` (the same string as step 2/4's command path — `makeToolHandler`
   calls `enforceCapability` with it, same as the CLI), `description`, `inputSchema` (zod raw shape,
   snake_case), `command` (`runXxx`), and `mapArgs` (snake_case MCP args → camelCase `opts`). Do
   **not** add this for any command that mutates the safety boundary or writes secrets (`login`,
   `init`, `allow add/remove`, `config set`, etc.) or that would need a bypass-shaped argument
   (`no_allowlist`, `no_log`) — those stay CLI-only by design.

6. **Write tests** in `test/<name>.test.js`:
   - Build a fake `deps` of `vi.fn()` stubs; assert on the returned object and on which `deps`
     methods were called with what.
   - Cover the error/exit-code paths (bad input → `InvalidInputError`, etc.).
   - No live network or filesystem — inject everything.

7. **Verify:** `npm run test:run` (all green), then exercise the real command manually
   (`node bin/gmail.js xxx …` or `gmail xxx …` if linked).

8. **Document:** add the command to `README.md`. If it changes architecture or a convention, update
   [[architecture]] / [[conventions]].

## Reference examples

- Simple read + table render: `runReadList` in `src/commands/read.js` + `formatReadList`.
- Positional + mutation: `runMark` in `src/commands/mark.js` (`args: ['uid']`).
- stdin preprocess + allowlist gate: `runSend` in `src/commands/send.js`.
- Flag-dependent capability: `reply` maps to `draft` or `send` depending on `--draft`
  (`COMMAND_CAPABILITY.reply` in `src/capabilities.js`).
