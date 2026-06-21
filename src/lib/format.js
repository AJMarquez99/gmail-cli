export function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

// Compact human-readable line for `--format table`.
export function formatSend(result) {
  const rcpt = [...result.to, ...result.cc, ...result.bcc].join(', ');
  const lines = [`sent → ${rcpt}`, `subject: ${result.subject || '(none)'}`, `message-id: ${result.messageId}`];
  if (result.attachments && result.attachments.length) {
    lines.push(`attachments: ${result.attachments.map((a) => a.filename).join(', ')}`);
  }
  return lines.join('\n');
}

export function formatDoctor(result) {
  const capList = result.capabilities && result.capabilities.length
    ? result.capabilities.join(', ')
    : '(none)';
  const lines = [
    `status:       ${result.ok ? 'ok' : 'FAILED'}`,
    `profile:      ${result.profile || '(default)'}`,
    `account:      ${result.user || '(none)'}`,
    `source:       ${result.source || '(none)'}`,
    `credentials:  ${result.credentials}`,
    `smtp:         ${result.smtp}`,
    `imap:         ${result.imap}`,
    `allowlist:    ${result.allowlist} recipient(s) — ${result.allowlistEnforced ? 'enforced' : 'DISABLED'}`,
    `capabilities: ${result.mode || 'unrestricted'} → ${capList}`,
  ];
  if (result.error) lines.push('', result.error);
  return lines.join('\n');
}

/**
 * Format the result of a `mark` mutation.
 */
export function formatMark(r) {
  return `marked message ${r.uid} as ${r.action}`;
}

export function formatAllowList(result) {
  if (result.count === 0) return '(allowlist empty — only the configured account can be emailed)';
  return result.recipients
    .map((r) => (r.aliases.length ? `${r.email}  [${r.aliases.join(', ')}]` : r.email))
    .join('\n');
}

export function formatLog(result) {
  if (!result.entries.length) return '(no sends logged yet)';
  return result.entries
    .map((e) => `${e.ts}  → ${[...(e.to||[]), ...(e.cc||[]), ...(e.bcc||[])].join(', ')}  ${e.subject || '(none)'}`)
    .join('\n');
}

export function formatInit(result) {
  const lines = [];
  for (const p of result.created) lines.push(`created: ${p}`);
  for (const p of result.skipped) lines.push(`exists:  ${p}`);
  lines.push(`credentials: ${result.credentials}`);
  if (result.nextSteps && result.nextSteps.length) {
    lines.push('');
    lines.push('Next steps:');
    for (const [i, s] of result.nextSteps.entries()) lines.push(`  ${i + 1}. ${s}`);
  }
  return lines.join('\n');
}

export function formatLogin(r) {
  return `credentials written to ${r.path} for ${r.user} — verify with: gmail doctor`;
}

export function formatAllowMutation(r) {
  return `${r.action}: ${r.email}${r.aliases?.length ? ' [' + r.aliases.join(', ') + ']' : ''}`;
}

export function formatConfig(r) {
  const lines = [];
  if (r.action === 'unset') {
    lines.push(`unset ${r.key}`);
  } else if (r.key) {
    lines.push(`${r.key} = ${JSON.stringify(r.value)}`);
    if (r.unknownKey) {
      lines.push(`(warning: '${r.key}' is not a recognized config key)`);
    }
  } else if (r.config) {
    // Whole-config dump: key = value lines, one per leaf.
    for (const [k, v] of Object.entries(r.config)) {
      if (k === '_comment') continue;
      if (v !== null && typeof v === 'object') {
        for (const [subk, subv] of Object.entries(v)) {
          lines.push(`${k}.${subk} = ${JSON.stringify(subv)}`);
        }
      } else {
        lines.push(`${k} = ${JSON.stringify(v)}`);
      }
    }
    if (lines.length === 0) lines.push('(no config set)');
  }
  return lines.join('\n');
}

export function formatProfileList(r) {
  if (r.mode === 'single-account') return 'single-account mode (no profiles configured)';
  return r.profiles
    .map((p) => `${p.name}${p.default ? ' (default)' : ''}`)
    .join('\n');
}

export function formatProfileCaps(r) {
  return `profile ${r.name}: ${r.mode} → ${r.capabilities.join(', ') || '(none)'}`;
}

export function formatProfileMutation(r) {
  if (r.action === 'created') {
    return `created profile ${r.name}${r.default ? ' (now the default)' : ''}`;
  }
  if (r.action === 'default-set') {
    return `default profile is now ${r.defaultProfile}`;
  }
  // removed
  const fileList = r.filesKept.join(', ');
  const defaultNote = r.newDefault
    ? ` · default is now ${r.newDefault}`
    : ' · no default set';
  return `removed profile ${r.name} — files left on disk: ${fileList}${defaultNote}`;
}

// ---------------------------------------------------------------------------
// Read formatters
// ---------------------------------------------------------------------------

/**
 * Format a list of messages (used by `read list` and `read search`).
 */
export function formatReadList(r) {
  if (!r.messages || r.messages.length === 0) return '(no messages)';
  return r.messages
    .map((m) => {
      const date = m.date ? new Date(m.date).toLocaleDateString() : '(no date)';
      const from = (m.from && m.from[0]) || '';
      const unread = m.flags && m.flags.includes('\\Seen') ? '' : '  •unread';
      return `${m.uid}  ${date}  ${from}  ${m.subject}${unread}`;
    })
    .join('\n');
}

/**
 * Format a single message (used by `read show`).
 */
export function formatShow(r) {
  const m = r.message;
  const lines = [
    `from:    ${(m.from || []).join(', ') || '(none)'}`,
    `to:      ${(m.to || []).join(', ') || '(none)'}`,
    `subject: ${m.subject || '(none)'}`,
    `date:    ${m.date || '(none)'}`,
    `labels:  ${(m.labels || []).join(', ') || '(none)'}`,
    '',
  ];

  if (m.text) {
    lines.push(m.text);
  } else if (m.html) {
    lines.push('(HTML body — use --format json to extract the html field)');
  } else {
    lines.push('(no body)');
  }

  if (m.attachments && m.attachments.length > 0) {
    lines.push('');
    lines.push('attachments:');
    for (const a of m.attachments) {
      const size = a.size != null ? ` (${a.size}b)` : '';
      lines.push(`  ${a.filename || '(unnamed)'}${size}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a thread (used by `read thread`).
 */
export function formatThread(r) {
  if (!r.messages || r.messages.length === 0) return '(no messages in thread)';
  const count = r.messages.length;
  const header = `${count} message${count === 1 ? '' : 's'} in thread`;
  const body = r.messages
    .map((m) => {
      const date = m.date ? new Date(m.date).toLocaleDateString() : '(no date)';
      const from = (m.from && m.from[0]) || '(unknown)';
      return `  ${date} · ${from} · ${m.subject}`;
    })
    .join('\n');
  return `${header}\n${body}`;
}

// ---------------------------------------------------------------------------
// Label formatters
// ---------------------------------------------------------------------------

/**
 * Format a list of labels (used by `label list`).
 */
export function formatLabelList(r) {
  if (!r.labels || r.labels.length === 0) return '(no labels)';
  return r.labels.map((l) => l.path).join('\n');
}

/**
 * Format the result of a label add/remove/create/delete/rename mutation.
 */
export function formatLabelMutation(r) {
  if (r.action === 'created') return `created label "${r.name}"`;
  if (r.action === 'deleted') return `deleted label "${r.name}"`;
  if (r.action === 'renamed') return `renamed label "${r.from}" → "${r.to}"`;
  // add/remove
  const direction = r.action === 'added' ? 'to' : 'from';
  return `${r.action} label "${r.label}" ${direction} message ${r.uid}`;
}

export function formatWhoami(r) {
  return [
    `profile:      ${r.profile}`,
    `account:      ${r.account || '(no credentials)'}`,
    `mode:         ${r.mode}`,
    `capabilities: ${r.capabilities.join(', ')}`,
  ].join('\n');
}

export function formatDraft(r) {
  const verb = { 'draft-created': 'created', 'draft-deleted': 'deleted', 'draft-sent': 'sent' }[r.action] || r.action;
  return `draft ${verb} (uid ${r.uid}) → ${(r.to || []).join(', ')} · ${r.subject}`;
}

export function formatOrganize(r) {
  if (r.action === 'moved') return `moved uid ${r.uid}: ${r.from} → ${r.to}`;
  return `${r.action} uid ${r.uid}`;
}

export function formatCount(r) { return `${r.mailbox}: ${r.total} total, ${r.unread} unread`; }

export function formatDownload(r) {
  return r.attachments.length
    ? `downloaded ${r.attachments.length} attachment(s) → ${r.dir}:\n` + r.attachments.map((a) => `  ${a.filename} (${a.bytes}b)`).join('\n')
    : `no attachments on uid ${r.uid}`;
}

export function formatReply(r) {
  const verb = r.action === 'reply-drafted' ? 'drafted reply' : 'replied';
  return `${verb} → ${(r.to || []).join(', ')}${r.cc && r.cc.length ? ' (cc ' + r.cc.join(', ') + ')' : ''} · ${r.subject}`;
}

export function formatDryRun(r) {
  const lines = [
    'DRY RUN — nothing sent',
    `from:    ${r.from}`,
    `to:      ${[...r.to, ...r.cc, ...r.bcc].join(', ') || '(none)'}`,
    `subject: ${r.subject || '(none)'}`,
    `body:    ${(r.hasHtml ? 'html' : '') + (r.hasHtml && r.hasText ? '+' : '') + (r.hasText ? 'text' : '') || '(none)'}`,
  ];
  if (r.replyTo) lines.push(`reply-to: ${r.replyTo}`);
  if (r.inReplyTo) lines.push(`in-reply-to: ${r.inReplyTo}`);
  if (r.attachments.length) lines.push(`attachments: ${r.attachments.map((a) => `${a.filename} (${a.bytes}b)`).join(', ')}`);
  if (r.allowlistEnforced === false) lines.push('allowlist: DISABLED (sending to any recipient)');
  if (r.denied.length) lines.push(`WOULD BE BLOCKED: ${r.denied.join(', ')}`);
  return lines.join('\n');
}
