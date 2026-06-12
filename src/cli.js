import { Command } from 'commander';
import { defaultDeps } from './deps.js';
import { runSend } from './commands/send.js';
import { runDoctor } from './commands/doctor.js';
import { runAllowList, runAllowAdd, runAllowRemove } from './commands/allow.js';
import { runLog } from './commands/log.js';
import { runInit } from './commands/init.js';
import { runLogin } from './commands/login.js';
import { runConfigSet, runConfigGet, runConfigUnset } from './commands/config.js';
import { runProfileAdd, runProfileList, runProfileUse, runProfileRemove } from './commands/profile.js';
import { GmailError, EXIT_CODES } from './lib/errors.js';
import { printJson, formatSend, formatDryRun, formatDoctor, formatAllowList, formatLog, formatInit, formatLogin, formatAllowMutation, formatConfig, formatProfileList, formatProfileMutation, formatReadList, formatShow, formatThread, formatLabelList, formatLabelMutation, formatMark } from './lib/format.js';
import { runReadList, runReadSearch, runReadShow, runReadThread } from './commands/read.js';
import { runLabelList, runLabelAdd, runLabelRemove } from './commands/label.js';
import { runMark } from './commands/mark.js';

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
    // Propagate global --profile into opts so every handler sees opts.profile.
    if (opts.profile === undefined) opts.profile = globalOpts.profile;
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
    .description('Gmail CLI — send + IMAP read, with a fail-closed recipient allowlist')
    .version('0.7.0')
    .option('--format <format>', 'output format: json|table', 'json')
    .option('--profile <name>', 'account profile to use');

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
    .description('Check credentials and verify Gmail SMTP + IMAP')
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
    .description('Manage the recipient allowlist (list / add / remove)');
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

  const config = program
    .command('config')
    .description('Get/set non-secret preferences in config.json');
  config
    .command('set <key> <value>')
    .description('Set a config key (dotted; true/false coerced)')
    .action(handle(runConfigSet, { table: formatConfig, args: ['key', 'value'] }, deps));
  config
    .command('get [key]')
    .description('Show a config key, or the whole config')
    .action(handle(runConfigGet, { table: formatConfig, args: ['key'] }, deps));
  config
    .command('unset <key>')
    .description('Remove a config key')
    .action(handle(runConfigUnset, { table: formatConfig, args: ['key'] }, deps));

  const profileCmd = program.command('profile').description('Manage account profiles');
  profileCmd
    .command('add <name>')
    .description('Register a new profile (first one becomes the default)')
    .action(handle(runProfileAdd, { table: formatProfileMutation, args: ['name'] }, deps));
  profileCmd
    .command('list')
    .description('List configured profiles')
    .action(handle(runProfileList, { table: formatProfileList }, deps));
  profileCmd
    .command('use <name>')
    .description('Set the default profile')
    .action(handle(runProfileUse, { table: formatProfileMutation, args: ['name'] }, deps));
  profileCmd
    .command('remove <name>')
    .description('Unregister a profile (its files are left on disk)')
    .action(handle(runProfileRemove, { table: formatProfileMutation, args: ['name'] }, deps));

  const read = program.command('read').description('Read mail over IMAP');
  read
    .command('list')
    .description('List recent messages')
    .option('--mailbox <name>', 'mailbox/label', 'INBOX')
    .option('--limit <n>', 'max messages', '20')
    .option('--unread', 'only unread messages')
    .action(handle(runReadList, { table: formatReadList }, deps));
  read
    .command('search <query>')
    .description('Search with a Gmail query (gmraw)')
    .option('--mailbox <name>', 'mailbox/label', 'INBOX')
    .option('--limit <n>', 'max messages', '20')
    .action(handle(runReadSearch, { table: formatReadList, args: ['query'] }, deps));
  read
    .command('show <target>')
    .description('Show a message by UID or Message-ID')
    .option('--mailbox <name>', 'mailbox/label', 'INBOX')
    .action(handle(runReadShow, { table: formatShow, args: ['target'] }, deps));
  read
    .command('thread <threadId>')
    .description('Show all messages in a thread')
    .option('--mailbox <name>', 'mailbox/label', '[Gmail]/All Mail')
    .action(handle(runReadThread, { table: formatThread, args: ['threadId'] }, deps));

  const label = program.command('label').description('Manage Gmail labels');
  label
    .command('list')
    .description('List all labels/folders')
    .action(handle(runLabelList, { table: formatLabelList }, deps));
  label
    .command('add <uid> <name>')
    .description('Add a label to a message')
    .option('--mailbox <name>', 'mailbox the message is in', 'INBOX')
    .action(handle(runLabelAdd, { table: formatLabelMutation, args: ['uid', 'name'] }, deps));
  label
    .command('remove <uid> <name>')
    .description('Remove a label from a message')
    .option('--mailbox <name>', 'mailbox the message is in', 'INBOX')
    .action(handle(runLabelRemove, { table: formatLabelMutation, args: ['uid', 'name'] }, deps));

  program
    .command('mark <uid>')
    .description('Mark a message read or unread')
    .option('--read', 'mark as read')
    .option('--unread', 'mark as unread')
    .option('--mailbox <name>', 'mailbox', 'INBOX')
    .action(handle(runMark, { table: formatMark, args: ['uid'] }, deps));

  return program;
}

export function run(argv, deps = defaultDeps) {
  return buildProgram(deps).parseAsync(argv);
}
