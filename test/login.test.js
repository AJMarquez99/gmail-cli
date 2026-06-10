import { describe, it, expect, vi } from 'vitest';
import { runLogin } from '../src/commands/login.js';
import { resolveProfile } from '../src/profile.js';
import { InvalidInputError } from '../src/lib/errors.js';

function deps({ exists = false, email = 'you@gmail.com', pw = 'abcd efgh ijkl mnop', config = {} } = {}) {
  return {
    env: { HOME: '/h' },
    resolveProfile: (name) => resolveProfile({ env: { HOME: '/h' }, config, name }),
    fileExists: vi.fn(() => exists),
    ensureDir: vi.fn(),
    writeFile: vi.fn(),
    prompt: vi.fn(async () => email),
    promptHidden: vi.fn(async () => pw),
  };
}

describe('runLogin', () => {
  it('prompts (hidden) for the app password and writes credentials.json at 0600', async () => {
    const d = deps();
    const out = await runLogin({}, d);
    // password came from promptHidden, NOT prompt
    expect(d.promptHidden).toHaveBeenCalled();
    const [path, content, mode] = d.writeFile.mock.calls[0];
    expect(path).toBe('/h/.config/gmail-cli/credentials.json');
    expect(JSON.parse(content)).toEqual({ user: 'you@gmail.com', appPassword: 'abcdefghijklmnop' }); // whitespace stripped
    expect(mode).toBe(0o600);
    expect(d.ensureDir).toHaveBeenCalledWith('/h/.config/gmail-cli');
    expect(out).toEqual({ path: '/h/.config/gmail-cli/credentials.json', user: 'you@gmail.com', written: true });
  });

  it('uses --user instead of prompting for the email', async () => {
    const d = deps();
    await runLogin({ user: 'agent@gmail.com' }, d);
    // email prompt skipped
    expect(d.prompt).not.toHaveBeenCalled();
    expect(JSON.parse(d.writeFile.mock.calls[0][1]).user).toBe('agent@gmail.com');
  });

  it('refuses to overwrite existing credentials without --force', async () => {
    const d = deps({ exists: true });
    await expect(runLogin({}, d)).rejects.toThrow(InvalidInputError);
    expect(d.writeFile).not.toHaveBeenCalled();
  });

  it('overwrites when --force is set', async () => {
    const d = deps({ exists: true });
    await runLogin({ force: true }, d);
    expect(d.writeFile).toHaveBeenCalled();
  });

  it('trims surrounding whitespace from the email', async () => {
    const d = deps();
    await runLogin({ user: '  agent@gmail.com  ' }, d);
    expect(JSON.parse(d.writeFile.mock.calls[0][1]).user).toBe('agent@gmail.com');
  });

  it('rejects an email without @', async () => {
    const d = deps({ email: 'notanemail' });
    await expect(runLogin({}, d)).rejects.toThrow(InvalidInputError);
  });

  it('rejects an empty app password', async () => {
    const d = deps({ pw: '   ' });
    await expect(runLogin({}, d)).rejects.toThrow(InvalidInputError);
  });
});

describe('runLogin — profile mode', () => {
  it('writes credentials to the profile-specific path when --profile is set', async () => {
    const config = { profiles: { work: {} } };
    const d = deps({ config });
    const out = await runLogin({ profile: 'work' }, d);
    const [writtenPath] = d.writeFile.mock.calls[0];
    expect(writtenPath).toBe('/h/.config/gmail-cli/credentials-work.json');
    expect(out.path).toBe('/h/.config/gmail-cli/credentials-work.json');
  });

  it('uses a custom credentialsPath from the profile config', async () => {
    const config = { profiles: { work: { credentialsPath: '~/.config/work/creds.json' } } };
    const d = deps({ config });
    await runLogin({ profile: 'work' }, d);
    const [writtenPath] = d.writeFile.mock.calls[0];
    expect(writtenPath).toBe('/h/.config/work/creds.json');
  });
});
