/**
 * Report the resolved profile, its account email, and its effective capability scope.
 * Always-allowed: works even before credentials are configured (account → null then).
 */
export async function runWhoami(opts, deps) {
  const profile = deps.resolveProfile(opts.profile);
  let account = null;
  try {
    account = deps.resolveCredentials(profile.legacy ? {} : { path: profile.credentialsPath }).user;
  } catch {
    account = null;
  }
  return {
    profile: profile.name,
    account,
    mode: profile.capabilities.mode,
    capabilities: [...profile.capabilities.allowed],
  };
}
