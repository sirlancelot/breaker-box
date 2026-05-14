# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `timeout` option on `createCircuitBreaker` for per-call timeouts via `AbortSignal.timeout`, replacing the need for `withTimeout` composition
- Built-in retry support on `createCircuitBreaker` via `retryLimit`, `retryDelay`, and `retryTest` options
- `StateName` type export (replaces `CircuitState`)
- `withRetry` and `withTimeout` return types now include `Disposable`

### Changed

- **BREAKING**: `CircuitState` type renamed to `StateName` — a deprecated `CircuitName` alias is provided but code importing `CircuitState` must update
- **BREAKING**: `MainFn` now uses `[Symbol.dispose]` for disposal chaining instead of `[disposeKey]`
- **BREAKING**: Open circuit without a fallback now re-throws the original failure cause directly instead of wrapping it in `Error("ERR_CIRCUIT_BREAKER_OPEN")`
- **BREAKING**: Half-open state now allows up to `minimumCandidates` concurrent trial calls and evaluates their aggregate failure rate, instead of gating on a single trial call

### Deprecated

- `withRetry` wrapper — use the `retryLimit`, `retryDelay`, and `retryTest` options on `createCircuitBreaker` instead
- `withTimeout` wrapper — use the `timeout` option on `createCircuitBreaker` instead
- `dispose()` method on protected functions — use `Symbol.dispose` / `using` keyword instead
- `CircuitState` type — exported as `CircuitName` alias, use `StateName` instead

### Fixed

- Concurrent inflight failures now open the circuit only once

## [7.0.0] - 2026-05-07

### Added

- `withRetry` wrapper for composable retry logic with configurable `maxAttempts`, `shouldRetry`, and `retryDelay`
- `withTimeout` wrapper for composable timeout constraints on async functions
- `RetryOptions` type export
- `Symbol.dispose` support on circuit breaker protected functions for explicit resource management (`using` syntax)
- `disposed` as a fourth circuit breaker state — a terminal state where all calls are rejected
- Validated finite-state-machine transitions prevent invalid state changes

### Changed

- **BREAKING**: `CircuitState` type now includes `"disposed"` — code pattern-matching on circuit states must handle this new variant
- **BREAKING**: Disposed circuit breakers now enter a terminal `disposed` state and reject all subsequent calls, instead of remaining in `open` state with a rejecting fallback
- **BREAKING**: Default fallback when circuit opens now rejects with `Error("ERR_CIRCUIT_BREAKER_OPEN")` wrapping the failure cause, instead of rejecting with the raw cause
- **BREAKING**: `disposeKey` symbol moved from `types.ts` to `util.ts` (not part of public API)
- Internal restructuring: circuit breaker, retry, timeout, backoff, and utilities split into separate modules

## [6.0.0] - 2026-01-20

### Added

- New `getFailureRate()` method on circuit breaker protected functions to inspect the current failure rate
- Additional type exports: `CircuitBreakerOptions`, `CircuitBreakerProtectedFn`, `CircuitState`, `MainFn`
- Comprehensive JSDoc documentation for all public APIs
- Optional `AbortSignal` parameter for backoff functions (`useExponentialBackoff`, `useFibonacciBackoff`)

### Changed

- **BREAKING**: Default value for `minimumCandidates` option changed from `6` to `1`
  - This may cause circuits to open more aggressively if you rely on the default value
  - Explicitly set `minimumCandidates: 6` in your options to preserve v5.0.0 behavior

### Fixed

- Improved type safety with `readonly` array types for function arguments
- Added validation for `fallback` option to catch configuration errors earlier

## [5.0.0] - 2024

Initial release with v5.0.0 API.

[unreleased]: https://github.com/sirlancelot/breaker-box/compare/v7.0.0...HEAD
[7.0.0]: https://github.com/sirlancelot/breaker-box/compare/v6.0.0...v7.0.0
[6.0.0]: https://github.com/sirlancelot/breaker-box/compare/v5.0.0...v6.0.0
[5.0.0]: https://github.com/sirlancelot/breaker-box/releases/tag/v5.0.0
