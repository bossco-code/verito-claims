# Contributing to verito-claims

Thanks for your interest in contributing! We welcome bug reports, improvements, documentation fixes, and tests. This guide explains how to get started quickly.

## Quick start
1. Fork the repository and clone your fork:
   git clone https://github.com/<your-username>/verito-claims.git
2. Create a branch for your change:
   git checkout -b feat/my-feature
3. Install dependencies:
   npm ci
   # or
   yarn install
4. Run the dev server / build / tests:
   npm run dev
   npm run build
   npm run lint
   npm test

## Our workflow
- Create a branch per feature or fix: `feat/...`, `fix/...`, or `chore/...`.
- Open a Pull Request against `main` (or the repository default).
- Keep PRs focused and small where possible.
- Include tests for new behavior and ensure linting and type checks pass.

## Coding & style
- Language: TypeScript.
- Code formatting: Prettier is used. Run `npm run format`.
- Linting: ESLint. Run `npm run lint`.
- Type checks: Run `npm run build` (this runs `tsc -b`).
- Follow existing code patterns and name conventions.

## Tests
- Run tests locally before opening a PR: `npm test` (or `yarn test`).
- Add unit tests for bug fixes and new features.
- If you modify snapshots, update them intentionally and explain why in the PR.

## Commit messages
- Use concise, present-tense commit messages, e.g. `fix: handle missing invoice id`.
- Use conventional prefixes: feat, fix, docs, chore, refactor, test.

## Pull request checklist
- [ ] The change is described (what, why).
- [ ] Tests added or updated.
- [ ] Linting/type checks pass.
- [ ] Any relevant docs updated.

## Reporting bugs & requesting features
- Use the issue templates when opening a new issue.
- Provide steps to reproduce, expected vs actual behavior, screenshots/logs if applicable.

## Where to get help
- Open an issue or discussion in the repo.
- Tag maintainers if you need a rapid review.

## Code of conduct
By participating, you agree to follow the repository Code of Conduct (see CODE_OF_CONDUCT.md).
