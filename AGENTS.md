# Breaker Box - AI Agent Guidelines

## Project Overview

Zero-dependency circuit breaker library for Node.js. Provides `createCircuitBreaker` with built-in retry, timeout, and fallback support for fault-tolerant async operations.

## Architecture

```text
lib/
├── index.ts           # Public API surface with deprecation wrappers for withRetry and withTimeout
├── circuit-breaker.ts # Main createCircuitBreaker implementation
├── retry.ts           # withRetry wrapper with retry logic
├── timeout.ts         # withTimeout wrapper with timeout constraint
├── backoff.ts         # Backoff strategies (useExponentialBackoff, useFibonacciBackoff)
├── options.ts         # Option parsing with validation via assert()
├── types.ts           # TypeScript interfaces, JSDoc for public API
└── util.ts            # Shared utilities (assert, abortable, delayMs, deprecated, identity, noop, promiseTry, shouldRetry)
```

**Key patterns:**

- Functions return wrapped functions with attached methods (`[Symbol.dispose]()`, `.getState()`, `.getFailureRate()`, `.getLatestError()`)
- `Symbol.dispose` enables disposal chaining—each wrapper calls `main[Symbol.dispose]?.()` when disposed
- AbortController/AbortSignal for cleanup coordination and cancellation
- History tracked via `Map<Promise, HistoryEntry>` with auto-expiring entries after `errorWindow`
- Retry and timeout are configured via `createCircuitBreaker` options (`retryLimit`, `retryDelay`, `retryTest`, `timeout`); `withRetry` and `withTimeout` wrappers are deprecated

**Circuit Breaker FSM:**

- Four states: `closed`, `open`, `halfOpen`, `disposed`
- Validated state transitions via `validTransitions` map prevent invalid state changes
- State transitions via `transitionTo()` with per-transition helpers (`transitionToOpen`, `transitionToHalfOpen`, `transitionToClosed`)
- `disposed` is a terminal state—once disposed, no transitions are allowed
- Valid transitions:
  - `closed` → `open` (failure threshold exceeded) or `disposed`
  - `open` → `halfOpen` (after resetAfter timer) or `disposed`
  - `halfOpen` → `closed` (aggregate failure rate at or below threshold), `open` (aggregate failure rate exceeds threshold), or `disposed`
  - `disposed` → none (terminal state)
- Cleanup coordinated via AbortController—each state transition aborts the previous state's controller

**Option constraints (validated in `options.ts`):**

- `errorThreshold`: 0–1 inclusive
- `errorWindow`: minimum 1000ms
- `resetAfter`: minimum 1000ms and must be `>= errorWindow`
- `minimumCandidates`: minimum 1
- `retryDelay`: non-negative finite number or function
- `retryLimit`: minimum 1
- `retryTest`: must be a function
- `timeout`: non-negative finite number

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
| `npx vitest index.test.ts`  | Run single test file                   |
| `npx vitest -t "test name"` | Run specific test by name              |

## Testing Conventions

- **Fake timers required**: All tests use `vi.useFakeTimers()` in `beforeEach`
- **Timer cleanup assertion**: `afterEach` verifies `vi.getTimerCount() === 0` — ensures no timer leaks
- **vitest-when** for conditional mocking: `when(main).calledWith("arg").thenResolve(value)`
- **Parameterized tests**: Use `it.for([...])` for testing multiple inputs (see backoff tests)
- **Plain mocks**: Circuit breaker tests use plain `vi.fn()` mocks; disposal chaining uses `Symbol.dispose`
- **Inline snapshots**: Use `.toMatchInlineSnapshot()` for value assertions with complex shapes and `.toThrowErrorMatchingInlineSnapshot()` for error message assertions
- **Co-located tests**: `*.test.ts` alongside implementation files
- **Type-level tests**: `lib/index.test-d.ts` uses `expectTypeOf` to assert public API shapes

## Code Style

- **Imports**: Use `.js` extension in imports (e.g., `./types.js`) for ESM compatibility
- **No comments**: Keep code self-documenting; JSDoc only for public API in `types.ts`
- **Assertions**: Use `assert()` from util.ts for runtime validation with descriptive messages
- **Error messages**: Prefix with `ERR_CIRCUIT_BREAKER_*` (e.g., `ERR_CIRCUIT_BREAKER_DISPOSED`, `ERR_CIRCUIT_BREAKER_TIMEOUT`, `ERR_CIRCUIT_BREAKER_CALL_FAILURE`, `ERR_CIRCUIT_BREAKER_OPEN`)
- **v8 ignore**: Use `/* v8 ignore next */` for unreachable code paths in coverage
- **Type definitions**: All public interface types are defined in `types.ts` with JSDoc

## Build Output

Dual CJS/ESM package via pkgroll:

- `dist/index.cjs` + `dist/index.d.cts` (CommonJS)
- `dist/index.mjs` + `dist/index.d.mts` (ESM)

Target: Node 18+
Package type: ESM (`"type": "module"` in package.json) with dual CJS/ESM exports

## Maintaining `AGENTS.md`

After making changes to the project, you **MUST** update `AGENTS.md` if any of the following occur:

- **New dependencies added or major dependencies removed** (check package.json, Cargo.toml, requirements.txt, etc.)
- **Project structure changes**: new directories/modules created, existing ones renamed or removed
- **Architecture changes**: new layers, patterns, or major refactoring that affects how components interact
- **New frameworks or tools adopted** (e.g., switching from REST to GraphQL, adding a new testing framework)
- **Deployment or infrastructure changes** (new CI/CD pipelines, different hosting, containerization added)
- **New major features** that introduce new subsystems or significantly change existing ones
- **Style guide or coding convention updates**

### Update format

- **Be proactive** - Keep the rules file up-to-date as the project evolves.
- **Be surgical** - When updating the rules file, modify only the affected sections rather than rewriting the entire file.
- **Keep it high-level** - Consider how changes affect the overall architecture and development workflow.
- **Treat `AGENTS.md` as living documentation.** - An outdated `AGENTS.md` is worse than no `AGENTS.md` file, as it will mislead future AI agents and waste time.
