# Contributing to gmail-cli

Thanks for helping improve `gmail-cli`. It's a small, focused wrapper around Gmail's SMTP and
IMAP — contributions that keep it simple and safe-by-default are very welcome.

## Getting started

```bash
git clone https://github.com/AJMarquez99/gmail-cli.git
cd gmail-cli
npm install
```

`gmail-cli` targets **Node.js >= 20**.

## Running the tests

```bash
npm run test:run   # run the vitest suite once
npm test           # vitest in watch mode
```

Please add or update tests for any behavior you change, and make sure `npm run test:run`
passes before opening a pull request. Tests must **never** contact a real account — use the
existing mocks/fixtures.

## A note on credentials

Never commit credentials, App Passwords, or a real allowlist. The CLI reads those from
`~/.config/gmail-cli/` at runtime; nothing sensitive belongs in the repo. The recipient
allowlist is **fail-closed** by design — please preserve that default in any change.

## Making changes

- Keep changes **small and focused** — one logical change per pull request.
- Match the existing style and the JSON-by-default output contract.
- Update the README when you add or change a flag or command.

## Submitting a pull request

1. Fork the repo and create a branch from `main`.
2. Make your change with accompanying tests.
3. Run `npm run test:run` and confirm it's green.
4. Open a pull request describing **what** changed and **why**.

## Reporting issues

Use the issue templates for bugs and feature requests. For anything security-sensitive, follow
[SECURITY.md](./SECURITY.md) — please don't open a public issue for a vulnerability.

By contributing, you agree that your contributions are licensed under the project's
[MIT License](./LICENSE) and that you'll follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
