import { withRetry as internalWithRetry } from "./retry.js"
import { withTimeout as internalWithTimeout } from "./timeout.js"
import type { StateName } from "./types.js"

export { useExponentialBackoff, useFibonacciBackoff } from "./backoff.js"
export { createCircuitBreaker } from "./circuit-breaker.js"

export type {
	CircuitBreakerOptions,
	CircuitBreakerProtectedFn,
	MainFn,
	RetryOptions,
	StateName,
} from "./types.js"
export { delayMs } from "./util.js"

// =============================================================================
// Deprecated API properties
import { deprecated } from "./util.js"

/** @deprecated Use `StateName` instead. */
export type CircuitState = StateName

/** @deprecated Use `retryLimit`, `retryDelay`, and `retryTest` options on `createCircuitBreaker` instead. */
export const withRetry = deprecated(
	internalWithRetry,
	"withRetry",
	"Use `retryLimit`, `retryDelay`, and `retryTest` options on `createCircuitBreaker` instead.",
)

/** @deprecated Use `options.timeout` on `createCircuitBreaker` instead. */
export const withTimeout = deprecated(
	internalWithTimeout,
	"withTimeout",
	"Use `options.timeout` on`createCircuitBreaker` instead.",
)
