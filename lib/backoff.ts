import type { RetryDelayFn } from "./types.js"
import { delayMs } from "./util.js"

/**
 * Creates an exponential backoff strategy for retry delays.
 * Delay grows as 2^(attempt-2) seconds, capped at maxSeconds.
 *
 * The sequence is: 1s, 2s, 4s, 8s, 16s, 32s, etc.
 *
 * @example
 * ```ts
 * const backoff = useExponentialBackoff(30)
 * await backoff(2) // waits 1 second
 * await backoff(3) // waits 2 seconds
 * await backoff(10) // waits 30 seconds (capped)
 * ```
 */
export function useExponentialBackoff(maxSeconds: number): RetryDelayFn {
	return function exponentialBackoff(attempt, signal) {
		const num = Math.max(attempt - 2, 0)
		const delay = Math.min(2 ** num, maxSeconds)
		return delayMs(delay * 1_000, signal)
	}
}

const sqrt5 = /* @__PURE__ */ Math.sqrt(5)
/**
 * Binet's formula for calculating Fibonacci numbers in constant time.
 * @see https://en.wikipedia.org/wiki/Fibonacci_sequence#Closed-form_expression
 */
const binet = (n: number) =>
	Math.round(((1 + sqrt5) ** n - (1 - sqrt5) ** n) / (2 ** n * sqrt5))

/**
 * Creates a Fibonacci backoff strategy for retry delays. It is more gradual
 * than exponential backoff, useful for more aggressive retry patterns.
 *
 * The sequence is: 1s, 2s, 3s, 5s, 8s, 13s, etc.
 *
 * @example
 * ```ts
 * const backoff = useFibonacciBackoff(60)
 * await backoff(2) // waits 1 second
 * await backoff(5) // waits 5 seconds
 * await backoff(10) // waits 55 seconds
 * ```
 */
export function useFibonacciBackoff(maxSeconds: number): RetryDelayFn {
	return function fibonacciBackoff(attempt, signal) {
		const delay = Math.min(binet(attempt), maxSeconds)
		return delayMs(delay * 1_000, signal)
	}
}
