# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[unreleased]: https://github.com/sirlancelot/breaker-box/compare/v6.0.0...HEAD
[6.0.0]: https://github.com/sirlancelot/breaker-box/compare/v5.0.0...v6.0.0
[5.0.0]: https://github.com/sirlancelot/breaker-box/releases/tag/v5.0.0
