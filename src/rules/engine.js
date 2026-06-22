import { parseActions, runAction } from './actions.js';

/**
 * Apply rules over a connected IMAP client. Stateless + idempotent.
 * @param {object} client                 Connected imapflow client.
 * @param {Array<object>} rules           [{ id, match, actions, mailbox }]
 * @param {object} opts
 * @param {(bucket:string)=>boolean} opts.profileCan  Bound capability predicate.
 * @param {boolean} [opts.dryRun=false]
 * @param {string|null} [opts.ruleId=null]
 * @param {number|null} [opts.limit=null]
 * @param {object} [deps]
 * @returns {Promise<{ dryRun:boolean, rules:Array }>}
 */
export async function applyRules(client, rules, { profileCan, dryRun = false, ruleId = null, limit = null } = {}, deps = {}) {
  const selected = ruleId ? rules.filter((r) => r.id === ruleId) : rules;
  const report = [];

  for (const rule of selected) {
    const mailbox = rule.mailbox || 'INBOX';
    const entry = { id: rule.id, match: rule.match, matched: 0, applied: [], skipped: [], errors: [] };

    let actions;
    try {
      actions = parseActions(rule.actions);
    } catch (err) {
      entry.errors.push({ error: err.message });
      report.push(entry);
      continue;
    }

    const permitted = [];
    for (const a of actions) {
      if (profileCan(a.bucket)) permitted.push(a);
      else entry.skipped.push({ action: a.raw, reason: `capability:${a.bucket}` });
    }

    await client.mailboxOpen(mailbox);
    let uids = await client.search({ gmraw: rule.match }, { uid: true });
    if (limit != null && limit > 0) uids = uids.slice(-limit);
    entry.matched = uids.length;

    for (const uid of uids) {
      for (const a of permitted) {
        if (dryRun) {
          entry.applied.push({ uid, action: a.raw, dryRun: true });
          continue;
        }
        try {
          await runAction(client, a, { uid, mailbox }, deps);
          entry.applied.push({ uid, action: a.raw });
        } catch (err) {
          entry.errors.push({ uid, action: a.raw, error: err.message });
        }
      }
    }
    report.push(entry);
  }

  return { dryRun, rules: report };
}
