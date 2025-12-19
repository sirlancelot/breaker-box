import { disposeKey, type MainFn } from "./types.js"
import { assert, delayMs, abortable } from "./util.js"

/**
 * Creates an exponential backoff strategy for retry delays.
 * Delay grows as 2^(attempt-2) seconds, capped at maxSeconds.
 *
 * The sequence is: 1s, 2s, 4s, 8s, 16s, 32s, etc.
 *
 * @param maxSeconds - Maximum delay in seconds before capping
 * @returns Function accepting attempt number and returning delay promise
 *
 * @example
 * ```ts
 * const backoff = useExponentialBackoff(30)
 * await backoff(2) // waits 1 second
 * await backoff(3) // waits 2 seconds
 * await backoff(10) // waits 30 seconds (capped)
 * ```
 */
export function useExponentialBackoff(maxSeconds: number) {
	return function exponentialBackoff(attempt: number, signal?: AbortSignal) {
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
 * Creates a Fibonacci backoff strategy for retry delays.
 * Delay follows the Fibonacci sequence: 1s, 2s, 3s, 5s, 8s, 13s, etc.
 *
 * More gradual than exponential backoff, useful for less aggressive retry patterns.
 *
 * @param maxSeconds - Maximum delay in seconds before capping
 * @returns Function accepting attempt number and returning delay promise
 *
 * @example
 * ```ts
 * const backoff = useFibonacciBackoff(60)
 * await backoff(2) // waits 1 second
 * await backoff(5) // waits 5 seconds
 * await backoff(10) // waits 55 seconds
 * ```
 */
export function useFibonacciBackoff(maxSeconds: number) {
	return function fibonacciBackoff(attempt: number, signal?: AbortSignal) {
		const delay = Math.min(binet(attempt), maxSeconds)
		return delayMs(delay * 1_000, signal)
	}
}

export interface RetryOptions {
	/**
	 * Whether an error should be treated as non-retryable. When this returns
	 * true, the error will be thrown immediately without retrying.
	 *
	 * @default () => false // All errors are retried
	 */
	shouldRetry?: (error: unknown, attempt: number) => boolean

	/**
	 * Maximum number of retries
	 *
	 * @default 3
	 */
	maxAttempts?: number

	/**
	 * Function that returns a promise resolving when the next retry should occur.
	 * Receives the attempt number (starting at 2) and an abort signal.
	 *
	 * @default () => Promise.resolve() // Immediate retry
	 */
	retryDelay?: (attempt: number, signal: AbortSignal) => Promise<void>
}

/**
 * Wrap a function with retry logic. Errors will be retried according to the
 * provided options.
 *
 * @example
 * ```ts
 * // Compose with circuit breaker. Retry up to 3 times with no delay
 * const protectedA = createCircuitBreaker(
 *   withRetry(unreliableApiCall, { maxAttempts: 3 })
 * )
 *
 * // Retry up to 5 times with exponential backoff
 * const protectedB = createCircuitBreaker(
 *   withRetry(unreliableApiCall, {
 *     maxAttempts: 5,
 *     retryDelay: useExponentialBackoff(30),
 *   })
 * )
 * ```
 */
export function withRetry<Ret, Args extends readonly unknown[]>(
	main: MainFn<Ret, Args>,
	options: Readonly<RetryOptions> = {},
): MainFn<Ret, Args> {
	const {
		shouldRetry = () => true,
		maxAttempts = 3,
		retryDelay = () => Promise.resolve(),
	} = options

	assert(maxAttempts >= 1, "maxAttempts must be a number greater than 0")

	const controller = new AbortController()
	const { signal } = controller

	async function withRetryFunction(...args: Args): Promise<Ret> {
		let attempt = 1
		while (true) {
			try {
				return await main(...args)
			} catch (cause) {
				if (attempt >= maxAttempts) {
					throw new Error(`ERR_CIRCUIT_BREAKER_MAX_ATTEMPTS (${maxAttempts})`, {
						cause,
					})
				}

				if (!shouldRetry(cause, attempt)) throw cause
			}

			attempt++
			await abortable(signal, retryDelay(attempt, signal))
		}
	}

	return Object.assign(withRetryFunction, {
		[disposeKey]: (disposeMessage = "ERR_CIRCUIT_BREAKER_DISPOSED") => {
			const reason = new ReferenceError(disposeMessage)
			main[disposeKey]?.(disposeMessage)
			controller.abort(reason)
		},
	})
}

/**
 * Wraps an async function with a timeout constraint. Rejects with an Error if
 * execution exceeds the specified timeout.
 *
 * @example
 * ```ts
 * const fetchWithTimeout = withTimeout(fetchData, 5000, "Fetch timed out")
 * try {
 *   const data = await fetchWithTimeout(url)
 * } catch (error) {
 *   console.error(error.message) // "Fetch timed out" after 5 seconds
 * }
 * ```
 */
export function withTimeout<Ret, Args extends readonly unknown[]>(
	main: MainFn<Ret, Args>,
	timeoutMs: number,
	timeoutMessage = "ERR_CIRCUIT_BREAKER_TIMEOUT",
): MainFn<Ret, Args> {
	const error = new Error(timeoutMessage)
	const controller = new AbortController()
	const { signal } = controller

	function withTimeoutFunction(...args: Args): Promise<Ret> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(reject, timeoutMs, error)

			abortable(signal, main(...args))
				.then(resolve, reject)
				.finally(() => clearTimeout(timer))
		})
	}

	return Object.assign(withTimeoutFunction, {
		[disposeKey]: (disposeMessage = "ERR_CIRCUIT_BREAKER_DISPOSED") => {
			const reason = new ReferenceError(disposeMessage)
			main[disposeKey]?.(disposeMessage)
			controller.abort(reason)
		},
	})
}
