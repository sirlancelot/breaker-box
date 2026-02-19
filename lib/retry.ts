import { type MainFn, type RetryOptions } from "./types.js"
import { assert, abortable, createDisposable, disposeKey } from "./util.js"

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
		[disposeKey]: createDisposable(main, controller),
	})
}
