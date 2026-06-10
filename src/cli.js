import { Command } from 'commander';
import { defaultDeps } from './deps.js';
import { runSend } from './commands/send.js';
import { runDoctor } from './commands/doctor.js';
import { runAllowList, runAllowAdd, runAllowRemove } from './commands/allow.js';
import { runLog } from './commands/log.js';
import { runInit } from './commands/init.js';
import { runLogin } from './commands/login.js';
import { GmailError, EXIT_CODES } from './lib/errors.js';
import { printJson, formatSend, formatDryRun, formatDoctor, formatAllowList, formatLog, formatInit, formatLogin, formatAllowMutation } from './lib/format.js';

const collect = (val, acc) => {
  acc.push(val);
  return acc;
};

// Read piped stdin (non-TTY) so agents can stream a body: `echo "..." | gmail send --to x`.
async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function handle(fn, { table, preprocess, args } = {}, deps = defaultDeps) {
  return async (...actionArgs) => {
    // Commander calls the action with (pos1, …, posN, optsObject, commandInstance).
    const cmd = actionArgs[actionArgs.length - 1];
    const positionals = actionArgs.slice(0, -2);
    const opts = { ...cmd.opts() };
    (args || []).forEach((name, i) => {
      opts[name] = positionals[i];
    });
    let root = cmd;
    while (root.parent) root = root.parent;
    const globalOpts = root.opts();
    try {
      if (preprocess) await preprocess(opts);
      const result = await fn(opts, deps);
      if (globalOpts.format === 'table' && table) {
        process.stdout.write(table(result) + '\n');
      } else {
        printJson(result);
      }
    } catch (err) {
      process.stderr.write((err.message || String(err)) + '\n');
      process.exitCode = err instanceof GmailError ? err.exitCode : EXIT_CODES.GENERIC;
    }
  };
}

export function buildProgram(deps = defaultDeps) {
  const program = new Command();
  program
    .name('gmail')
    .description('Send-only Gmail CLI with a fail-closed recipient allowlist')
    .version('0.4.0')
    .option('--format <format>', 'output format: json|table', 'json');

  program
    .command('send')
    .description('Send an email from the configured Gmail account')
    .option('--to <addr>', 'recipient (repeatable; comma-separated ok)', collect, [])
    .option('--cc <addr>', 'cc recipient (repeatable)', collect, [])
    .option('--bcc <addr>', 'bcc recipient (repeatable)', collect, [])
    .option('--subject <text>', 'subject line')
    .option('--body <text>', 'plain-text body (or pipe it on stdin)')
    .option('--html <html>', 'HTML body')
    .option('--markdown', 'render the body (or stdin) as Markdown → HTML, with a plaintext fallback')
    .option('--no-style', 'with --markdown, skip the inline email styler (raw marked HTML)')
    .option('--reply-to <addr>', 'Reply-To address')
    .option('--from-name <name>', 'display name on the From header')
    .option('--in-reply-to <messageId>', 'Message-ID this email replies to (threads it)')
    .option('--references <id>', 'References header id (repeatable; comma-separated ok)', collect, [])
    .option('--no-signature', 'do not append the configured signature')
    .option('--attach <path>', 'file attachment (repeatable; comma-separated ok)', collect, [])
    .option('--dry-run', 'assemble and preview the message without sending or logging')
    .option('--log-body', 'include the body in the send-log entry (off by default)')
    .option('--no-log', 'do not append this send to the send log')
    .option('--no-allowlist', 'disable the recipient allowlist for this send (sends to any recipient)')
    .action(
      handle(
        runSend,
        {
          table: (r) => (r.dryRun ? formatDryRun(r) : formatSend(r)),
          // If no body/html given, fall back to piped stdin.
          preprocess: async (opts) => {
            if (!opts.body && !opts.html) {
              const piped = await readStdin();
              if (piped.trim()) opts.body = piped.replace(/\n+$/, '');
            }
          },
        },
        deps,
      ),
    );

  program
    .command('doctor')
    .description('Check credentials and verify the Gmail SMTP connection')
    .action(handle(runDoctor, { table: formatDoctor }, deps));

  program
    .command('init')
    .description('Scaffold ~/.config/gmail-cli/ config files and print setup steps')
    .action(handle(runInit, { table: formatInit }, deps));

  program
    .command('login')
    .description('Set up Gmail credentials — prompts for the App Password (hidden), writes credentials.json (chmod 600)')
    .option('--user <email>', 'account email (otherwise prompted)')
    .option('--force', 'overwrite existing credentials')
    .action(handle(runLogin, { table: formatLogin }, deps));

  const allow = program
    .command('allow')
    .description('Inspect the recipient allowlist (edit ~/.config/gmail-cli/allowlist.json by hand)');
  allow
    .command('list')
    .description('List allowed recipients and their aliases')
    .action(handle(runAllowList, { table: formatAllowList }, deps));
  allow
    .command('add <email>')
    .description('Add a recipient to the allowlist')
    .option('--alias <name>', 'alias (repeatable)', collect, [])
    .action(handle(runAllowAdd, { table: formatAllowMutation, args: ['email'] }, deps));
  allow
    .command('remove <target>')
    .description('Remove a recipient (by email or alias) from the allowlist')
    .action(handle(runAllowRemove, { table: formatAllowMutation, args: ['target'] }, deps));

  program
    .command('log')
    .alias('sent')
    .description('Show recent sent-mail log entries (newest first)')
    .option('--limit <n>', 'max entries to show', '20')
    .action(handle(runLog, { table: formatLog }, deps));

  return program;
}

export function run(argv, deps = defaultDeps) {
  return buildProgram(deps).parseAsync(argv);
}
