# Breaker Box - AI Agent Guidelines

## Project Overview

Zero-dependency circuit breaker library for Node.js. Provides `createCircuitBreaker` with built-in retry, timeout, and fallback support for fault-tolerant async operations.

See [architecture.md](.agents-docs/architecture.md) for file structure, FSM states, key patterns, and option constraints.

## Development Commands

| Command                     | Purpose                                |
| --------------------------- | -------------------------------------- |
| `npm run build`             | Build with pkgroll (CJS + ESM + types) |
| `npm run dev`               | Run tests in watch mode (vitest)       |
| `npm run format`            | Format with Prettier                   |
| `npm run lint`              | Lint with ESLint (auto-fix)            |
| `npm run test:coverage`     | Run tests with coverage                |
| `npm test`                  | Run tests once (includes typecheck)    |
| `npx tsc --noEmit`          | Type-check without emit                |
| `npx vitest <file>.test.ts` | Run single test file                   |
| `npx vitest -t "test name"` | Run specific test by name              |

See [testing.md](.agents-docs/testing.md) for fake timers, mocking, parameterized tests, and snapshot conventions.

See [code-style.md](.agents-docs/code-style.md) for import conventions, error messages, assertions, and build output.

## Maintaining `AGENTS.md`

After making changes to the project, you **MUST** update the relevant `AGENTS.md` if any of the following occur:

- **New dependencies added or major dependencies removed** (check package.json, Cargo.toml, requirements.txt, etc.)
- **Project structure changes**: new directories/modules created, existing ones renamed or removed
- **Architecture changes**: new layers, patterns, or major refactoring that affects how components interact
- **New frameworks or tools adopted** (e.g., switching from REST to GraphQL, adding a new testing framework)
- **Deployment or infrastructure changes** (new CI/CD pipelines, different hosting, containerization added)
- **New major features** that introduce new subsystems or significantly change existing ones
- **Style guide or coding convention updates**

Make adjustments following these guidelines:

- **Be proactive** - Keep the rules file up-to-date as the project evolves.
- **Be surgical** - When updating the rules file, modify only the affected sections rather than rewriting the entire file.
- **Keep it high-level** - Consider how changes affect the overall architecture and development workflow.
- **Treat `AGENTS.md` as living documentation.** - An outdated `AGENTS.md` is worse than no `AGENTS.md` file, as it will mislead future AI agents and waste time.
