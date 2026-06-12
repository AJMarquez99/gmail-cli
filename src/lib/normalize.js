/**
 * Normalize an imapflow fetch result + optional mailparser result into a
 * consistent message object for gmail-cli commands.
 *
 * @param {object} imapMsg  imapflow fetch result
 * @param {object} [parsed] mailparser simpleParser result (present for `show`, absent for list/search)
 * @returns {object}
 */
export function normalizeMessage(imapMsg, parsed) {
  const envelope = imapMsg.envelope || {};

  const from = (envelope.from || []).map((a) => a.address).filter(Boolean);
  const to = (envelope.to || []).map((a) => a.address).filter(Boolean);
  const subject = envelope.subject || '';
  const date = envelope.date ? new Date(envelope.date).toISOString() : null;

  const rawText = parsed?.text || '';
  const snippet = rawText.replace(/\s+/g, ' ').trim().slice(0, 140);

  const attachments = (parsed?.attachments || []).map((a) => ({
    filename: a.filename || null,
    size: a.size ?? null,
    contentType: a.contentType || null,
  }));

  return {
    uid: imapMsg.uid,
    messageId: envelope.messageId || null,
    threadId: imapMsg.threadId || null,
    from,
    to,
    subject,
    date,
    snippet,
    text: parsed?.text ?? null,
    html: parsed?.html || null,
    attachments,
    labels: imapMsg.labels ? [...imapMsg.labels] : [],
    flags: imapMsg.flags ? [...imapMsg.flags] : [],
  };
}
