# Architecture

> Part of [AGENTS.md](../AGENTS.md) — project guidance for AI coding agents.

```text
README.md              # Installation, Documentation, Examples

lib/
├── index.ts           # Public API surface
├── circuit-breaker.ts # Main createCircuitBreaker implementation (includes shouldContinue)
├── circuit-error.ts   # CircuitError class
├── backoff.ts         # Backoff strategies (useExponentialBackoff, useFibonacciBackoff)
├── options.ts         # Option parsing with validation via assert()
├── types.ts           # TypeScript interfaces, JSDoc for public API
└── util.ts            # Shared utilities (assert, abortable, delayMs, noop, promiseTry)

test/
└── util.ts            # Shared test utilities (useMockConsole)

scripts/
├── prepublish.mjs     # `npm publish` gate: clean tree tagged v<package.json version>, then builds dist/
└── version.mjs        # `npm version` hook: finalizes CHANGELOG.md
```

## Key Patterns

- Functions return wrapped functions with attached methods (`[Symbol.dispose]()`, `.getState()`, `.getFailureRate()`, `.getLatestError()`)
- `Symbol.dispose` enables disposal chaining—each wrapper calls `main[Symbol.dispose]?.()` when disposed
- AbortController/AbortSignal for cleanup coordination and cancellation
- History tracked via `Map<Promise, HistoryEntry>` with auto-expiring entries after `errorWindow`. Each state gets a fresh history, so calls never count toward a later state
- `calculateFailureRate()` returns `NaN` when fewer than `minimumCandidates` calls have settled; `NaN` withholds transitions. `.getFailureRate()` is `calculateFailureRate` itself (computed on demand, no stored rate), keeping the happy path free of rate calculations
- Retry and timeout are configured via `createCircuitBreaker` options (`retryLimit`, `retryDelay`, `retryTest`, `timeout`)

## Circuit Breaker FSM

- Four states: `closed`, `open`, `halfOpen`, `disposed`
- Validated state transitions via `validTransitions` map prevent invalid state changes
- State transitions via `transitionTo()` with per-transition helpers (`transitionToOpen`, `transitionToHalfOpen`, `transitionToClosed`)
- `disposed` is a terminal state—once disposed, no transitions are allowed
- Valid transitions:
  - `closed` → `open` (failure threshold exceeded) or `disposed`
  - `open` → `halfOpen` (after resetAfter timer) or `disposed`
  - `halfOpen` → `closed` (aggregate failure rate at or below threshold), `open` (aggregate failure rate exceeds threshold), or `disposed`
  - `disposed` → none (terminal state)
- During `halfOpen`, exactly `minimumCandidates` trial calls must settle within `errorWindow` time in order to decide the next transition.
- Cleanup coordinated via AbortController—each state transition aborts the previous state's controller

## Option Constraints (validated in `options.ts`)

- `errorIsTransient`: must be a function; `errorIsFailure` is its deprecated alias (one-time `console.warn` when used)
- `errorThreshold`: 0–1 inclusive
- `errorWindow`: minimum 1000ms
- `resetAfter`: minimum 1000ms
- `minimumCandidates`: minimum 1
- `retryDelay`: non-negative finite number or function
- `retryLimit`: minimum 1
- `retryTest`: must be a function
- `timeout`: non-negative finite number
- `fallback`, `onClose`, `onHalfOpen`, `onOpen`: optional, must be functions when provided
