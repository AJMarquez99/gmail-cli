import { dirname } from 'node:path';
import { resolveAllowlistPath } from '../allowlist.js';
import { readJson, writeJson } from '../lib/jsonfile.js';
import { InvalidInputError } from '../lib/errors.js';

// Read-only view of the recipient allowlist. Editing is done by hand in the JSON file.
export async function runAllowList(opts, deps) {
  const { recipients } = deps.loadAllowlist();
  const normalized = recipients
    .filter((r) => r && r.email)
    .map((r) => ({ email: r.email, aliases: r.aliases || [] }));
  return { count: normalized.length, recipients: normalized };
}

function load(deps) {
  const path = resolveAllowlistPath(deps.env);
  const data = readJson(path, { readFile: deps.readFile });
  if (!Array.isArray(data.recipients)) data.recipients = [];
  return { path, data };
}

function save(deps, path, data) {
  deps.ensureDir(dirname(path));
  writeJson(path, data, { writeFile: deps.writeFile });
}

export async function runAllowAdd(opts, deps) {
  const { email, alias = [] } = opts;

  if (!email || !email.includes('@')) {
    throw new InvalidInputError(`Invalid email address: ${email}`);
  }

  const { path, data } = load(deps);

  // Check each new alias doesn't already map to a DIFFERENT email (case-insensitive).
  for (const newAlias of alias) {
    const lower = newAlias.toLowerCase();
    for (const entry of data.recipients) {
      if (!entry || !entry.email) continue;
      if (entry.email.toLowerCase() === email.toLowerCase()) continue; // same email, skip
      for (const a of entry.aliases || []) {
        if (String(a).toLowerCase() === lower) {
          throw new InvalidInputError(
            `Alias "${newAlias}" is already mapped to ${entry.email}`,
          );
        }
      }
    }
  }

  // Find existing entry by email (case-insensitive).
  const existing = data.recipients.find(
    (r) => r && r.email && r.email.toLowerCase() === email.toLowerCase(),
  );

  let action;
  let finalAliases;

  if (existing) {
    // Merge: preserve existing aliases, append new ones not already present.
    const existingAliases = existing.aliases || [];
    const existingLower = new Set(existingAliases.map((a) => String(a).toLowerCase()));
    const toAdd = alias.filter((a) => !existingLower.has(a.toLowerCase()));
    const merged = [...existingAliases, ...toAdd];
    if (merged.length > 0) {
      existing.aliases = merged;
    } else {
      delete existing.aliases;
    }
    finalAliases = merged;
    action = 'updated';
  } else {
    // New entry.
    const entry = { email };
    if (alias.length > 0) entry.aliases = alias;
    data.recipients.push(entry);
    finalAliases = alias;
    action = 'created';
  }

  save(deps, path, data);
  return { email, aliases: finalAliases, action };
}

export async function runAllowRemove(opts, deps) {
  const { target } = opts;

  const { path, data } = load(deps);

  const targetLower = target.toLowerCase();
  const idx = data.recipients.findIndex((r) => {
    if (!r || !r.email) return false;
    if (r.email.toLowerCase() === targetLower) return true;
    return (r.aliases || []).some((a) => String(a).toLowerCase() === targetLower);
  });

  if (idx === -1) {
    throw new InvalidInputError(`Not in allowlist: ${target}`);
  }

  const removed = data.recipients[idx];
  data.recipients.splice(idx, 1);
  save(deps, path, data);

  return { email: removed.email, action: 'removed' };
}
