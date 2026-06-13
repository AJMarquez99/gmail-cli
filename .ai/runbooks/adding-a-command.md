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
     from `src/commands/read.js`) so connect/`logout()` is handled for you.
   - Throw the right error class from `src/lib/errors.js` (`InvalidInputError` → exit 2,
     `RecipientNotAllowedError` → exit 3, otherwise generic → exit 1).

2. **Add a table renderer** (optional) in `src/lib/format.js` as `export function formatXxx(result)`
   returning a string. Skip if JSON-only is fine.

3. **Register the command** in `src/cli.js` inside `buildProgram()`:
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

4. **Write tests** in `test/<name>.test.js`:
   - Build a fake `deps` of `vi.fn()` stubs; assert on the returned object and on which `deps`
     methods were called with what.
   - Cover the error/exit-code paths (bad input → `InvalidInputError`, etc.).
   - No live network or filesystem — inject everything.

5. **Verify:** `npm run test:run` (all green), then exercise the real command manually
   (`node bin/gmail.js xxx …` or `gmail xxx …` if linked).

6. **Document:** add the command to `README.md`. If it changes architecture or a convention, update
   [[architecture]] / [[conventions]].

## Reference examples

- Simple read + table render: `runReadList` in `src/commands/read.js` + `formatReadList`.
- Positional + mutation: `runMark` in `src/commands/mark.js` (`args: ['uid']`).
- stdin preprocess + allowlist gate: `runSend` in `src/commands/send.js`.
