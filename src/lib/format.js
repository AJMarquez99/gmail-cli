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
  const lines = [
    `status:      ${result.ok ? 'ok' : 'FAILED'}`,
    `profile:     ${result.profile || '(default)'}`,
    `account:     ${result.user || '(none)'}`,
    `source:      ${result.source || '(none)'}`,
    `credentials: ${result.credentials}`,
    `smtp:        ${result.smtp}`,
    `allowlist:   ${result.allowlist} recipient(s) — ${result.allowlistEnforced ? 'enforced' : 'DISABLED'}`,
  ];
  if (result.error) lines.push('', result.error);
  return lines.join('\n');
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
