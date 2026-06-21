import { withClient } from './read.js';
import { archiveMessage, moveMessage, trashMessage, deleteMessage } from '../writer.js';
import { InvalidInputError } from '../lib/errors.js';

export async function runArchive(opts, deps) {
  return withClient(opts, deps, async (client) =>
    ({ ...(await archiveMessage(client, { uid: opts.uid, mailbox: opts.mailbox })), action: 'archived' }));
}

export async function runMove(opts, deps) {
  if (!opts.destination) throw new InvalidInputError('Usage: gmail move <uid> <destination-mailbox>');
  return withClient(opts, deps, async (client) =>
    moveMessage(client, { uid: opts.uid, mailbox: opts.mailbox, destination: opts.destination }));
}

export async function runTrash(opts, deps) {
  return withClient(opts, deps, async (client) =>
    trashMessage(client, { uid: opts.uid, mailbox: opts.mailbox }));
}

export async function runDelete(opts, deps) {
  if (!opts.permanent) {
    throw new InvalidInputError(
      'Refusing to permanently delete without --permanent. Use `gmail trash <uid>` to move to Trash (recoverable), or pass --permanent to delete forever.');
  }
  return withClient(opts, deps, async (client) =>
    ({ ...(await deleteMessage(client, { uid: opts.uid, mailbox: opts.mailbox })), action: 'deleted' }));
}
