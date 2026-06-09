export async function runLog(opts, deps) {
  const limit = opts.limit ? Number(opts.limit) : 20;
  return { entries: deps.readLog({ limit }) };
}
