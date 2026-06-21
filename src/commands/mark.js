import { withClient } from './read.js';
import { markMessage, starMessage, importantMessage } from '../writer.js';
import { InvalidInputError } from '../lib/errors.js';

/**
 * Mark a message with exactly one of six actions:
 *   --read / --unread         → toggle \Seen IMAP flag
 *   --star / --unstar         → toggle \Starred Gmail label
 *   --important / --unimportant → toggle \Important Gmail label
 *
 * opts.uid     — message UID (positional arg)
 * opts.mailbox — mailbox the message lives in (default 'INBOX')
 */
export async function runMark(opts, deps) {
  const actions = [];
  if (opts.read !== undefined) actions.push(['seen', true]);
  if (opts.unread !== undefined) actions.push(['seen', false]);
  if (opts.star !== undefined) actions.push(['star', true]);
  if (opts.unstar !== undefined) actions.push(['star', false]);
  if (opts.important !== undefined) actions.push(['important', true]);
  if (opts.unimportant !== undefined) actions.push(['important', false]);
  if (actions.length !== 1) {
    throw new InvalidInputError('Specify exactly one of --read/--unread/--star/--unstar/--important/--unimportant.');
  }
  const [kind, on] = actions[0];
  return withClient(opts, deps, async (client) => {
    if (kind === 'seen') return markMessage(client, { uid: opts.uid, seen: on, mailbox: opts.mailbox });
    if (kind === 'star') return starMessage(client, { uid: opts.uid, on, mailbox: opts.mailbox });
    return importantMessage(client, { uid: opts.uid, on, mailbox: opts.mailbox });
  });
}
