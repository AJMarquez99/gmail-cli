import { Command } from 'commander';
import { defaultDeps } from './deps.js';
import { VERSION } from './version.js';
import { runSend } from './commands/send.js';
import { runDoctor } from './commands/doctor.js';
import { runAllowList, runAllowAdd, runAllowRemove } from './commands/allow.js';
import { runLog } from './commands/log.js';
import { runInit } from './commands/init.js';
import { runLogin } from './commands/login.js';
import { runConfigSet, runConfigGet, runConfigUnset } from './commands/config.js';
import { runProfileAdd, runProfileList, runProfileUse, runProfileRemove, runProfileCaps } from './commands/profile.js';
import { GmailError, EXIT_CODES, CapabilityDeniedError } from './lib/errors.js';
import { requiredCapability, profileCan } from './capabilities.js';
import { printJson, formatSend, formatDryRun, formatDoctor, formatAllowList, formatLog, formatInit, formatLogin, formatAllowMutation, formatConfig, formatProfileList, formatProfileMutation, formatProfileCaps, formatReadList, formatShow, formatThread, formatLabelList, formatLabelMutation, formatMark, formatWhoami, formatDraft, formatOrganize, formatCount, formatDownload, formatReply, formatForward, formatRulesMutation, formatRulesList, formatRulesApply, formatRulesXml } from './lib/format.js';
import { runReadList, runReadSearch, runReadShow, runReadThread, runReadCount, runReadDownload } from './commands/read.js';
import { runLabelList, runLabelAdd, runLabelRemove, runLabelCreate, runLabelDelete, runLabelRename } from './commands/label.js';
import { runMark } from './commands/mark.js';
import { runWhoami } from './commands/whoami.js';
import { runDraftCreate, runDraftDelete, runDraftSend } from './commands/draft.js';
import { runArchive, runMove, runTrash, runDelete } from './commands/organize.js';
import { runReply, runForward } from './commands/reply.js';
import { runRulesAdd, runRulesList, runRulesRemove, runRulesApply, runRulesExportXml } from './commands/rules.js';

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

// Fallback: if no body/html was given, use piped stdin as the body.
const stdinBodyPreprocess = async (opts) => {
  if (!opts.body && !opts.html) {
    const piped = await readStdin();
    if (piped.trim()) opts.body = piped.replace(/\n+$/, '');
  }
};

// Build the space-joined command path (excluding the root program name) for capability lookup.
function commandPath(cmd) {
  const parts = [];
  let c = cmd;
  while (c && c.parent) { parts.unshift(c.name()); c = c.parent; }
  return parts.join(' ');
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
      const cap = requiredCapability(commandPath(cmd), opts);
      if (cap) {
        const profile = deps.resolveProfile(opts.profile);
        if (!profileCan(profile, cap)) {
          throw new CapabilityDeniedError(cap, profile.name);
        }
      }
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
    .description('Gmail CLI — send, read, compose, organize, and rules, with a fail-closed recipient allowlist')
    .version(VERSION)
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
          preprocess: stdinBodyPreprocess,
        },
        deps,
      ),
    );

  program
    .command('doctor')
    .description('Check credentials and verify Gmail SMTP + IMAP')
    .action(handle(runDoctor, { table: formatDoctor }, deps));

  program
    .command('whoami')
    .description('Show the resolved profile, account, and capability scope')
    .action(handle(runWhoami, { table: formatWhoami }, deps));

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
  profileCmd
    .command('caps <name>')
    .description("Show or set a profile's capability scope (allowlist or denylist)")
    .option('--allow <buckets>', 'comma-separated buckets to allow (allowlist mode)')
    .option('--deny <buckets>', 'comma-separated buckets to deny (denylist mode)')
    .action(handle(runProfileCaps, { table: formatProfileCaps, args: ['name'] }, deps));

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
  read.command('count').description('Count total + unread messages in a mailbox')
    .option('--mailbox <name>', 'mailbox/label', 'INBOX')
    .action(handle(runReadCount, { table: formatCount }, deps));
  read.command('download <target>').description('Download a message\'s attachments to a directory')
    .option('--mailbox <name>', 'mailbox/label', 'INBOX')
    .option('--dir <path>', 'output directory', '.')
    .action(handle(runReadDownload, { table: formatDownload, args: ['target'] }, deps));

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
  label
    .command('create <name>')
    .description('Create a new label')
    .action(handle(runLabelCreate, { table: formatLabelMutation, args: ['name'] }, deps));
  label
    .command('delete <name>')
    .description('Delete a label')
    .action(handle(runLabelDelete, { table: formatLabelMutation, args: ['name'] }, deps));
  label
    .command('rename <name> <newName>')
    .description('Rename a label')
    .action(handle(runLabelRename, { table: formatLabelMutation, args: ['name', 'newName'] }, deps));

  program
    .command('mark <uid>')
    .description('Mark a message read, unread, starred, or important')
    .option('--read', 'mark as read')
    .option('--unread', 'mark as unread')
    .option('--star', 'star the message')
    .option('--unstar', 'remove star from the message')
    .option('--important', 'mark as important')
    .option('--unimportant', 'remove important flag from the message')
    .option('--mailbox <name>', 'mailbox', 'INBOX')
    .action(handle(runMark, { table: formatMark, args: ['uid'] }, deps));

  const draft = program.command('draft').description('Manage email drafts');
  draft
    .command('create')
    .description('Save a new draft to the Drafts mailbox (no allowlist — nothing is sent)')
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
    .option('--in-reply-to <messageId>', 'Message-ID this draft replies to (threads it)')
    .option('--references <id>', 'References header id (repeatable; comma-separated ok)', collect, [])
    .option('--no-signature', 'do not append the configured signature')
    .option('--attach <path>', 'file attachment (repeatable; comma-separated ok)', collect, [])
    .action(
      handle(
        runDraftCreate,
        {
          table: formatDraft,
          preprocess: stdinBodyPreprocess,
        },
        deps,
      ),
    );
  draft
    .command('delete <uid>')
    .description('Discard a draft by UID')
    .action(handle(runDraftDelete, { table: formatDraft, args: ['uid'] }, deps));
  draft
    .command('send <uid>')
    .description('Send a draft by UID (enforces the allowlist; transmits, then deletes the draft)')
    .option('--no-allowlist', 'disable the recipient allowlist for this send')
    .option('--no-log', 'do not append this send to the send log')
    .action(handle(runDraftSend, { table: formatDraft, args: ['uid'] }, deps));

  program
    .command('reply <uid>')
    .description('Reply to a message by UID (threaded; --all for reply-all; --draft to stage instead of send)')
    .option('--body <text>', 'reply body (or pipe it on stdin)')
    .option('--html <html>', 'HTML body')
    .option('--markdown', 'render the body (or stdin) as Markdown → HTML, with a plaintext fallback')
    .option('--no-style', 'with --markdown, skip the inline email styler (raw marked HTML)')
    .option('--all', 'reply-all: cc all original recipients minus self')
    .option('--no-quote', 'do not quote the original message body')
    .option('--draft', 'stage as a draft instead of sending')
    .option('--from-name <name>', 'display name on the From header')
    .option('--no-signature', 'do not append the configured signature')
    .option('--attach <path>', 'file attachment (repeatable; comma-separated ok)', collect, [])
    .option('--no-allowlist', 'disable the recipient allowlist for this send')
    .option('--no-log', 'do not append this send to the send log')
    .option('--mailbox <name>', 'source mailbox to fetch the message from', 'INBOX')
    .action(
      handle(
        runReply,
        {
          table: formatReply,
          args: ['uid'],
          preprocess: stdinBodyPreprocess,
        },
        deps,
      ),
    );

  program
    .command('forward <uid>')
    .description('Forward a message by UID, re-attaching the original attachments')
    .option('--to <addr>', 'recipient (repeatable; comma-separated ok)', collect, [])
    .option('--body <text>', 'optional intro before the forwarded message (or pipe it on stdin)')
    .option('--markdown', 'render the body (or stdin) as Markdown → HTML, with a plaintext fallback')
    .option('--no-style', 'with --markdown, skip the inline email styler (raw marked HTML)')
    .option('--from-name <name>', 'display name on the From header')
    .option('--no-signature', 'do not append the configured signature')
    .option('--no-allowlist', 'disable the recipient allowlist for this send')
    .option('--no-log', 'do not append this send to the send log')
    .option('--mailbox <name>', 'source mailbox to fetch the message from', 'INBOX')
    .action(
      handle(
        runForward,
        {
          table: formatForward,
          args: ['uid'],
          preprocess: stdinBodyPreprocess,
        },
        deps,
      ),
    );

  const rules = program.command('rules').description('Local rules engine: define, apply, export to Gmail filter XML');
  rules
    .command('add')
    .description('Define a rule (match → actions). Always allowed; applying is gated.')
    .option('--match <query>', 'Gmail search query (gmraw) the rule matches')
    .option('--id <id>', 'stable rule id (default: slug of the match)')
    .option('--label <name>', 'add a label')
    .option('--archive', 'archive (remove from inbox)')
    .option('--mark <state>', 'mark state (read)')
    .option('--star', 'star the message')
    .option('--important', 'mark important')
    .option('--move <mailbox>', 'move to a mailbox/label')
    .option('--trash', 'move to Trash (requires the delete capability to apply)')
    .option('--mailbox <name>', 'mailbox to search when applying', 'INBOX')
    .action(handle(runRulesAdd, { table: formatRulesMutation }, deps));
  rules
    .command('list')
    .description('List defined rules')
    .action(handle(runRulesList, { table: formatRulesList }, deps));
  rules
    .command('remove <id>')
    .description('Remove a rule by id')
    .action(handle(runRulesRemove, { table: formatRulesMutation, args: ['id'] }, deps));
  rules
    .command('apply')
    .description('Apply rules now over IMAP (organize baseline + per-action capability checks)')
    .option('--dry-run', 'report what would change without mutating')
    .option('--rule <id>', 'apply only this rule')
    .option('--limit <n>', 'cap matched messages per rule')
    .action(handle(runRulesApply, { table: formatRulesApply }, deps));
  rules
    .command('export-xml')
    .description('Emit Gmail filter import XML (Settings → Filters → Import) to stdout')
    .action(handle(runRulesExportXml, { table: formatRulesXml }, deps));

  program.command('archive <uid>').description('Archive a message (remove it from the inbox)')
    .option('--mailbox <name>', 'mailbox the message is in', 'INBOX')
    .action(handle(runArchive, { table: formatOrganize, args: ['uid'] }, deps));
  program.command('move <uid> <destination>').description('Move a message to another mailbox/label')
    .option('--mailbox <name>', 'mailbox the message is in', 'INBOX')
    .action(handle(runMove, { table: formatOrganize, args: ['uid', 'destination'] }, deps));
  program.command('trash <uid>').description('Move a message to Trash (recoverable)')
    .option('--mailbox <name>', 'mailbox the message is in', 'INBOX')
    .action(handle(runTrash, { table: formatOrganize, args: ['uid'] }, deps));
  program.command('delete <uid>').description('Permanently delete a message (requires --permanent)')
    .option('--permanent', 'confirm permanent, irreversible deletion')
    .option('--mailbox <name>', 'mailbox the message is in', 'INBOX')
    .action(handle(runDelete, { table: formatOrganize, args: ['uid'] }, deps));

  return program;
}

export function run(argv, deps = defaultDeps) {
  return buildProgram(deps).parseAsync(argv);
}
