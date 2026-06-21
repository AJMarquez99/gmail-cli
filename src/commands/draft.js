import { withClient } from './read.js';
import { buildMessage, buildRawMime, toList } from '../compose.js';
import { appendDraft } from '../writer.js';

/** Create a draft: assemble the message (NO allowlist — nothing transmits) and APPEND to Drafts. */
export async function runDraftCreate(opts, deps) {
  const profile = deps.resolveProfile(opts.profile);
  const creds = deps.resolveCredentials(profile.legacy ? {} : { path: profile.credentialsPath });
  const to = toList(opts.to), cc = toList(opts.cc), bcc = toList(opts.bcc);
  const { message } = buildMessage({ to, cc, bcc }, opts, { profile, creds }, deps);
  const raw = await buildRawMime(message);
  const res = await withClient(opts, deps, async (client) => appendDraft(client, raw));
  return { action: 'draft-created', uid: res.uid, mailbox: res.mailbox, to, cc, bcc, subject: message.subject };
}
