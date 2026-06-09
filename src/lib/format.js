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
    `account:     ${result.user || '(none)'}`,
    `source:      ${result.source || '(none)'}`,
    `credentials: ${result.credentials}`,
    `smtp:        ${result.smtp}`,
    `allowlist:   ${result.allowlist} recipient(s)`,
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
  if (r.denied.length) lines.push(`WOULD BE BLOCKED: ${r.denied.join(', ')}`);
  return lines.join('\n');
}
