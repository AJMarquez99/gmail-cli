import { dirname } from 'node:path';
import { withClient } from './read.js';
import { loadRules, saveRules } from '../rules/storage.js';
import { parseActions } from '../rules/actions.js';
import { applyRules } from '../rules/engine.js';
import { rulesToFilterXml } from '../rules/xml.js';
import { profileCan } from '../capabilities.js';
import { InvalidInputError } from '../lib/errors.js';

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'rule';

/** Turn `rules add` flags into the action-string list, in a stable order. */
function buildActions(opts) {
  const actions = [];
  if (opts.label) actions.push(`label:${opts.label}`);
  if (opts.mark) {
    if (opts.mark !== 'read') throw new InvalidInputError('--mark only supports "read".');
    actions.push('mark:read');
  }
  if (opts.star) actions.push('star');
  if (opts.important) actions.push('important');
  if (opts.move) actions.push(`move:${opts.move}`);
  if (opts.archive) actions.push('archive');
  if (opts.trash) actions.push('trash');
  return actions;
}

export async function runRulesAdd(opts, deps) {
  if (!opts.match) {
    throw new InvalidInputError('Usage: gmail rules add --match "<query>" [--label X --archive --mark read --star --important --move Mbox --trash]');
  }
  const actions = buildActions(opts);
  if (!actions.length) {
    throw new InvalidInputError('Specify at least one action (--label/--archive/--mark/--star/--important/--move/--trash).');
  }
  parseActions(actions); // validate the DSL (throws InvalidInputError on a bad action)

  const profile = deps.resolveProfile(opts.profile);
  const path = profile.rulesPath;
  const rules = loadRules({ path, readFile: deps.readFile });
  const id = opts.id || slugify(opts.match);
  if (rules.some((r) => r.id === id)) {
    throw new InvalidInputError(`Rule id "${id}" already exists. Pass --id to choose another, or remove it first.`);
  }
  const rule = { id, match: opts.match, actions, mailbox: opts.mailbox || 'INBOX' };
  rules.push(rule);
  deps.ensureDir(dirname(path));
  saveRules(path, rules, { writeFile: deps.writeFile });
  return { id, action: 'added', rule };
}

export async function runRulesList(opts, deps) {
  const profile = deps.resolveProfile(opts.profile);
  const rules = loadRules({ path: profile.rulesPath, readFile: deps.readFile });
  return { rules };
}

export async function runRulesRemove(opts, deps) {
  const profile = deps.resolveProfile(opts.profile);
  const path = profile.rulesPath;
  const rules = loadRules({ path, readFile: deps.readFile });
  const next = rules.filter((r) => r.id !== opts.id);
  if (next.length === rules.length) throw new InvalidInputError(`No rule with id "${opts.id}".`);
  deps.ensureDir(dirname(path));
  saveRules(path, next, { writeFile: deps.writeFile });
  return { id: opts.id, action: 'removed' };
}

export async function runRulesApply(opts, deps) {
  return withClient(opts, deps, async (client, profile) => {
    const rules = loadRules({ path: profile.rulesPath, readFile: deps.readFile });
    return applyRules(
      client,
      rules,
      {
        profileCan: (bucket) => profileCan(profile, bucket),
        dryRun: !!opts.dryRun,
        ruleId: opts.rule || null,
        limit: opts.limit ? Number(opts.limit) : null,
      },
      deps,
    );
  });
}

export async function runRulesExportXml(opts, deps) {
  const profile = deps.resolveProfile(opts.profile);
  const rules = loadRules({ path: profile.rulesPath, readFile: deps.readFile });
  return { xml: rulesToFilterXml(rules) };
}
