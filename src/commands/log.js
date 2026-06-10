export async function runLog(opts, deps) {
  const profile = deps.resolveProfile(opts.profile);
  const limit = opts.limit ? Number(opts.limit) : 20;
  return { entries: deps.readLog({ path: profile.sendLogPath, limit }) };
}
