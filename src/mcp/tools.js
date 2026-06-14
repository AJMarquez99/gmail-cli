import { z } from 'zod';
import { runSend } from '../commands/send.js';
import { runReadList, runReadSearch, runReadShow, runReadThread } from '../commands/read.js';
import { runLabelList, runLabelAdd, runLabelRemove } from '../commands/label.js';
import { runMark } from '../commands/mark.js';
import { runAllowList } from '../commands/allow.js';
import { runLog } from '../commands/log.js';
import { runDoctor } from '../commands/doctor.js';

// Each tool: { name, description, inputSchema (zod raw shape), command (run* fn), mapArgs (args→opts) }.
//
// SAFETY (see ../../.. /.ai/guidelines/safety-spec.md §5.8, MCP-2/MCP-3): this surface exposes the
// OPERATIONAL verbs only. It deliberately excludes everything that could move the safety boundary or
// write secrets — there is NO gmail_login / gmail_init (secret/setup), NO gmail_allow_add/remove or
// gmail_config_* (boundary mutation), and `gmail_send` exposes NO `no_allowlist` (bypass) or `no_log`
// (accountability) argument. The agent operates inside the human-set allowlist and cannot widen it.
const recipients = z.union([z.string(), z.array(z.string())]).optional();

export const TOOLS = [
  {
    name: 'gmail_send',
    description:
      'Send an email. Gated by the fail-closed recipient allowlist — only allowlisted recipients (plus the account itself) are permitted, and a blocked recipient rejects the whole send (exit 3). Pass dry_run:true to preview without sending. The allowlist cannot be changed or bypassed from here.',
    inputSchema: {
      to: recipients,
      cc: recipients,
      bcc: recipients,
      subject: z.string().optional(),
      body: z.string().optional(),
      html: z.string().optional(),
      markdown: z.boolean().optional(),
      no_style: z.boolean().optional(),
      no_signature: z.boolean().optional(),
      attach: z.array(z.string()).optional(),
      from_name: z.string().optional(),
      reply_to: z.string().optional(),
      in_reply_to: z.string().optional(),
      references: recipients,
      dry_run: z.boolean().optional(),
      profile: z.string().optional(),
    },
    command: runSend,
    // NOTE: no_allowlist and no_log are intentionally NOT mapped — they cannot be set from MCP.
    mapArgs: (a) => ({
      to: a.to,
      cc: a.cc,
      bcc: a.bcc,
      subject: a.subject,
      body: a.body,
      html: a.html,
      markdown: a.markdown,
      noStyle: a.no_style,
      noSignature: a.no_signature,
      attach: a.attach,
      fromName: a.from_name,
      replyTo: a.reply_to,
      inReplyTo: a.in_reply_to,
      references: a.references,
      dryRun: a.dry_run,
      profile: a.profile,
    }),
  },
  {
    name: 'gmail_read_list',
    description: 'List recent messages from a mailbox (default INBOX).',
    inputSchema: {
      mailbox: z.string().optional(),
      limit: z.number().optional(),
      unread: z.boolean().optional(),
      profile: z.string().optional(),
    },
    command: runReadList,
    mapArgs: (a) => ({ mailbox: a.mailbox, limit: a.limit, unread: a.unread, profile: a.profile }),
  },
  {
    name: 'gmail_read_search',
    description: 'Search messages with a Gmail query string (e.g. "from:x@y.com newer_than:7d").',
    inputSchema: {
      query: z.string(),
      mailbox: z.string().optional(),
      limit: z.number().optional(),
      profile: z.string().optional(),
    },
    command: runReadSearch,
    mapArgs: (a) => ({ query: a.query, mailbox: a.mailbox, limit: a.limit, profile: a.profile }),
  },
  {
    name: 'gmail_read_show',
    description: 'Show a single message by UID or Message-ID.',
    inputSchema: {
      target: z.string(),
      mailbox: z.string().optional(),
      profile: z.string().optional(),
    },
    command: runReadShow,
    mapArgs: (a) => ({ target: a.target, mailbox: a.mailbox, profile: a.profile }),
  },
  {
    name: 'gmail_read_thread',
    description: 'Show all messages in a Gmail thread.',
    inputSchema: {
      thread_id: z.string(),
      mailbox: z.string().optional(),
      profile: z.string().optional(),
    },
    command: runReadThread,
    mapArgs: (a) => ({ threadId: a.thread_id, mailbox: a.mailbox, profile: a.profile }),
  },
  {
    name: 'gmail_label_list',
    description: 'List all Gmail labels/mailboxes.',
    inputSchema: { profile: z.string().optional() },
    command: runLabelList,
    mapArgs: (a) => ({ profile: a.profile }),
  },
  {
    name: 'gmail_label_add',
    description: 'Add a label to a message by UID.',
    inputSchema: {
      uid: z.string(),
      name: z.string(),
      mailbox: z.string().optional(),
      profile: z.string().optional(),
    },
    command: runLabelAdd,
    mapArgs: (a) => ({ uid: a.uid, name: a.name, mailbox: a.mailbox, profile: a.profile }),
  },
  {
    name: 'gmail_label_remove',
    description: 'Remove a label from a message by UID.',
    inputSchema: {
      uid: z.string(),
      name: z.string(),
      mailbox: z.string().optional(),
      profile: z.string().optional(),
    },
    command: runLabelRemove,
    mapArgs: (a) => ({ uid: a.uid, name: a.name, mailbox: a.mailbox, profile: a.profile }),
  },
  {
    name: 'gmail_mark',
    description: 'Mark a message read or unread. Provide exactly one of read/unread.',
    inputSchema: {
      uid: z.string(),
      read: z.boolean().optional(),
      unread: z.boolean().optional(),
      mailbox: z.string().optional(),
      profile: z.string().optional(),
    },
    command: runMark,
    mapArgs: (a) => ({ uid: a.uid, read: a.read, unread: a.unread, mailbox: a.mailbox, profile: a.profile }),
  },
  {
    name: 'gmail_allow_list',
    description:
      'Show the recipient allowlist (read-only). Editing the allowlist is a human action on the JSON file and is not available here.',
    inputSchema: { profile: z.string().optional() },
    command: runAllowList,
    mapArgs: (a) => ({ profile: a.profile }),
  },
  {
    name: 'gmail_log',
    description: 'Show recent sent-mail log entries (metadata).',
    inputSchema: { limit: z.number().optional(), profile: z.string().optional() },
    command: runLog,
    mapArgs: (a) => ({ limit: a.limit, profile: a.profile }),
  },
  {
    name: 'gmail_doctor',
    description: 'Verify credentials over SMTP + IMAP; report the account, allowlist count, and enforcement.',
    inputSchema: { profile: z.string().optional() },
    command: runDoctor,
    mapArgs: (a) => ({ profile: a.profile }),
  },
];
