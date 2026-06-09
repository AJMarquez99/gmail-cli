// Read-only view of the recipient allowlist. Editing is done by hand in the JSON file.
export async function runAllowList(opts, deps) {
  const { recipients } = deps.loadAllowlist();
  const normalized = recipients
    .filter((r) => r && r.email)
    .map((r) => ({ email: r.email, aliases: r.aliases || [] }));
  return { count: normalized.length, recipients: normalized };
}
