# Breaker Box - AI Agent Guidelines

Zero-dependency circuit breaker library for Node.js. Provides `createCircuitBreaker` with built-in retry, timeout, and fallback support for fault-tolerant async operations.

## Required Reading

Before editing code or answering questions covered below, you **MUST** read the matching doc. If unsure, read it.

| Doc                                             | Read before                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](.agents-docs/architecture.md) | Changing `lib/*.ts` source, adding options, or touching circuit states (file structure, FSM states, key patterns, option constraints) |
| [code-style.md](.agents-docs/code-style.md)     | Writing any code (imports, error messages, assertions, build output)                                                                  |
| [testing.md](.agents-docs/testing.md)           | Writing or changing `lib/*.test.ts` / `*.test-d.ts` (fake timers, mocking, parameterized tests, snapshots)                            |

## Development Commands

| Command                             | Purpose                                                    |
| ----------------------------------- | ---------------------------------------------------------- |
| `npx vitest run lib/<file>.test.ts` | Run single test file once                                  |
| `npx vitest run -t "test name"`     | Run specific test by name                                  |
| `npm test`                          | Full suite once, incl. `*.test-d.ts` typecheck             |
| `npm run test:coverage`             | Full suite with v8 coverage (`coverage/`)                  |
| `npm run dev`                       | Watch mode — rewrites snapshots (`--update`); review diffs |
| `npm run type-check`                | `tsc --noEmit`                                             |
| `npm run lint` / `npm run format`   | ESLint (auto-fix) / Prettier (write)                       |
| `npm run build`                     | pkgroll → `dist/` (CJS + ESM + types)                      |

- There is no CI (`.github/` has no workflows): run `npm test` before every commit — it is the only gate.
- Work on `develop`; `master` only receives release merges. Releases follow [SKILL.md](.agents/skills/publish-to-npm/SKILL.md) — never run `npm version` or `npm publish` without explicit user approval.
- `.npmrc` sets `save-exact` and `min-release-age=2`; keep devDependencies pinned and don't edit `.npmrc`.
- `errorIsFailure` is a deprecated alias of `errorIsTransient` — use it only in tests of the deprecation warning, never in new code or README examples.

## Maintaining `AGENTS.md`

For every change made to this project, you **MUST** update the relevant `AGENTS.md` (and any linked `.agents-docs/*` files or `README.md`) if any of the following occur:

- **New dependencies added or major dependencies removed** (check package.json, Cargo.toml, requirements.txt, etc.)
- **Project structure changes**: new directories/modules created, existing ones renamed or removed
- **Architecture changes**: new layers, patterns, or major refactoring that affects how components interact
- **New frameworks or tools adopted** (e.g., switching from REST to GraphQL, adding a new testing framework)
- **Deployment or infrastructure changes** (new CI/CD pipelines, different hosting, containerization added)
- **New major features** that introduce new subsystems or significantly change existing ones
- **Style guide or coding convention updates**

Make adjustments following these guidelines:

- **Be proactive** — Update `AGENTS.md` and `.agents-docs/` as the project evolves.
- **Be surgical** — Modify only the affected sections rather than rewriting entire files.
- **Scope your updates** — Edit the most specific `AGENTS.md` that applies. Shared conventions go in the root file; workspace-local changes go in the workspace file.
- **Treat these as living documentation** — An outdated `AGENTS.md` is worse than none; it misleads future agents and wastes time.
