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
