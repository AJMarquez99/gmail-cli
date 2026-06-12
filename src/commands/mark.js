import { withClient } from './read.js';
import * as reader from '../reader.js';
import { InvalidInputError } from '../lib/errors.js';

/**
 * Mark a message as read or unread.
 *
 * opts.uid    — message UID (positional arg)
 * opts.read   — true if --read was passed (boolean | undefined)
 * opts.unread — true if --unread was passed (boolean | undefined)
 * opts.mailbox — mailbox the message lives in (default 'INBOX')
 *
 * Exactly one of --read / --unread must be supplied.
 * `opts.read === opts.unread` catches both cases:
 *   - neither supplied  → both undefined → undefined === undefined → true → error
 *   - both supplied     → both true      → true === true           → true → error
 */
export async function runMark(opts, deps) {
  if (opts.read === opts.unread) {
    throw new InvalidInputError('Specify exactly one of --read or --unread.');
  }
  const seen = !!opts.read;
  return withClient(opts, deps, async (client) =>
    reader.markMessage(client, { uid: opts.uid, seen, mailbox: opts.mailbox }),
  );
}
