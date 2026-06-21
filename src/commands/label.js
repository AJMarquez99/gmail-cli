import { withClient } from './read.js';
import { listLabels } from '../reader.js';
import { addLabel, removeLabel } from '../writer.js';
import { InvalidInputError } from '../lib/errors.js';

/**
 * List all Gmail labels/mailboxes.
 */
export async function runLabelList(opts, deps) {
  return withClient(opts, deps, async (client) => ({ labels: await listLabels(client) }));
}

/**
 * Add a label to a message by UID.
 *
 * opts.uid   — message UID
 * opts.name  — label name / path
 * opts.mailbox — mailbox the message lives in (default 'INBOX')
 */
export async function runLabelAdd(opts, deps) {
  if (!opts.uid || !opts.name) throw new InvalidInputError('Usage: gmail label add <uid> <name>');
  return withClient(opts, deps, async (client) =>
    addLabel(client, { uid: opts.uid, label: opts.name, mailbox: opts.mailbox }),
  );
}

/**
 * Remove a label from a message by UID.
 *
 * opts.uid   — message UID
 * opts.name  — label name / path
 * opts.mailbox — mailbox the message lives in (default 'INBOX')
 */
export async function runLabelRemove(opts, deps) {
  if (!opts.uid || !opts.name) throw new InvalidInputError('Usage: gmail label remove <uid> <name>');
  return withClient(opts, deps, async (client) =>
    removeLabel(client, { uid: opts.uid, label: opts.name, mailbox: opts.mailbox }),
  );
}
