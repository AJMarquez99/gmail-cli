import { withClient } from './read.js';
import { listLabels } from '../reader.js';
import { addLabel, removeLabel, createLabel, deleteLabel, renameLabel } from '../writer.js';
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

/**
 * Create a new Gmail label.
 *
 * opts.name — label name
 */
export async function runLabelCreate(opts, deps) {
  if (!opts.name) throw new InvalidInputError('Usage: gmail label create <name>');
  return withClient(opts, deps, async (client) => createLabel(client, { name: opts.name }));
}

/**
 * Delete a Gmail label.
 *
 * opts.name — label name
 */
export async function runLabelDelete(opts, deps) {
  if (!opts.name) throw new InvalidInputError('Usage: gmail label delete <name>');
  return withClient(opts, deps, async (client) => deleteLabel(client, { name: opts.name }));
}

/**
 * Rename a Gmail label.
 *
 * opts.name    — old label name
 * opts.newName — new label name
 */
export async function runLabelRename(opts, deps) {
  if (!opts.name || !opts.newName) throw new InvalidInputError('Usage: gmail label rename <name> <newName>');
  return withClient(opts, deps, async (client) => renameLabel(client, { name: opts.name, newName: opts.newName }));
}
