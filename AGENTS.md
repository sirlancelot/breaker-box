# Breaker Box - AI Agent Guidelines

## Project Overview

Zero-dependency circuit breaker library for Node.js. Provides `createCircuitBreaker`, `withRetry`, and `withTimeout` composable wrappers for fault-tolerant async operations.

## Architecture

```text
lib/
├── index.ts      # Main createCircuitBreaker function, re-exports helpers
├── helpers.ts    # withRetry, withTimeout, backoff strategies (useExponentialBackoff, useFibonacciBackoff)
├── options.ts    # Option parsing with validation via assert()
├── types.ts      # TypeScript interfaces, disposeKey symbol, JSDoc for public API
└── util.ts       # Shared utilities (assert, assertNever, delayMs, rejectOnAbort)
```

**Key patterns:**

- Functions return wrapped functions with attached methods (`.dispose()`, `.getState()`)
- `disposeKey` symbol enables chained disposal through composed wrappers—each wrapper calls `main[disposeKey]?.()` when disposed
- AbortController/AbortSignal for cleanup coordination and cancellation
- History tracked via `Map<Promise, HistoryEntry>` with auto-expiring entries after `errorWindow`
- Composition order matters: `createCircuitBreaker(withRetry(withTimeout(fn)))` — timeout innermost, circuit breaker outermost

## Development Commands

| Command                     | Purpose                                |
| --------------------------- | -------------------------------------- |
| `npm run build`             | Build with pkgroll (CJS + ESM + types) |
| `npm run dev`               | Run tests in watch mode (vitest)       |
| `npm run format`            | Format with Prettier                   |
| `npm run test:coverage`     | Run tests with coverage                |
| `npm test`                  | Run tests once                         |
| `npx tsc --noEmit`          | Type-check without emit                |
| `npx vitest index.test.ts`  | Run single test file                   |
| `npx vitest -t "test name"` | Run specific test by name              |

## Testing Conventions

- **Fake timers required**: All tests use `vi.useFakeTimers()` in `beforeEach`
- **Timer cleanup assertion**: `afterEach` verifies `vi.getTimerCount() === 0` — ensures no timer leaks
- **vitest-when** for conditional mocking: `when(main).calledWith("arg").thenResolve(value)`
- **Parameterized tests**: Use `it.for([...])` for testing multiple inputs (see backoff tests)
- **disposeKey mocking**: Mock functions need `[disposeKey]: vi.fn()` for disposal tests:
  ```ts
  const main = Object.assign(vi.fn(), { [disposeKey]: vi.fn() })
  ```
- **Inline snapshots**: Use `toThrowErrorMatchingInlineSnapshot()` for error message assertions
- **Co-located tests**: `*.test.ts` alongside implementation files
- **Snapshot tests**: Use `__snapshots__/` directories for snapshot files

## Code Style

- **Imports**: Use `.js` extension in imports (e.g., `./types.js`) for ESM compatibility
- **No comments**: Keep code self-documenting; JSDoc only for public API in `types.ts`
- **Assertions**: Use `assert()` from util.ts for runtime validation with descriptive messages
- **Exhaustive checks**: Use `assertNever()` for switch/if-else exhaustiveness (see `index.ts:159`)
- **Error messages**: Prefix with `ERR_CIRCUIT_BREAKER_*` (e.g., `ERR_CIRCUIT_BREAKER_DISPOSED`, `ERR_CIRCUIT_BREAKER_TIMEOUT`, `ERR_CIRCUIT_BREAKER_MAX_ATTEMPTS`)
- **v8 ignore**: Use `/* v8 ignore next */` for unreachable code paths in coverage

## Build Output

Dual CJS/ESM package via pkgroll:

- `dist/index.cjs` + `dist/index.d.cts` (CommonJS)
- `dist/index.mjs` + `dist/index.d.mts` (ESM)

Target: Node 18+
Package type: ESM (`"type": "module"` in package.json) with dual CJS/ESM exports

## Maintaining the AGENTS.md file

**IMPORTANT: Keep this file up-to-date as the project evolves.**

After making changes to the project, you MUST update this `AGENTS.md` file if any of the following occur:

- **New dependencies added or major dependencies removed** (check package.json, Cargo.toml, requirements.txt, etc.)
- **Project structure changes**: new directories/modules created, existing ones renamed or removed
- **Architecture changes**: new layers, patterns, or major refactoring that affects how components interact
- **New frameworks or tools adopted** (e.g., switching from REST to GraphQL, adding a new testing framework)
- **Deployment or infrastructure changes** (new CI/CD pipelines, different hosting, containerization added)
- **New major features** that introduce new subsystems or significantly change existing ones
- **Style guide or coding convention updates**

### Update procedure:

1. After completing your changes, review if they affect any section of `AGENTS.md`
2. If yes, immediately update the relevant sections

### Update format:

When updating, be surgical - modify only the affected sections rather than rewriting the entire file. Maintain the existing structure and tone.

**Treat `AGENTS.md` as living documentation.** An outdated `AGENTS.md` file is worse than no `AGENTS.md` file, as it will mislead future AI agents and waste time.
