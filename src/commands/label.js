import { withClient } from './read.js';
import * as reader from '../reader.js';
import { InvalidInputError } from '../lib/errors.js';

/**
 * List all Gmail labels/mailboxes.
 */
export async function runLabelList(opts, deps) {
  return withClient(opts, deps, async (client) => ({ labels: await reader.listLabels(client) }));
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
    reader.addLabel(client, { uid: opts.uid, label: opts.name, mailbox: opts.mailbox }),
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
    reader.removeLabel(client, { uid: opts.uid, label: opts.name, mailbox: opts.mailbox }),
  );
}
