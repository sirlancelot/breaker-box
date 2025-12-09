import { disposeKey, type MainFn } from "./types.js"
import { assert, delayMs, rejectOnAbort } from "./util.js"

/**
 * Returns a function which implements exponential backoff.
 *
 * @param maxSeconds - The maximum number of seconds to wait before retrying.
 * @returns A function which takes an `attempt` number and returns a promise
 * that resolves after the calculated delay.
 */
export function useExponentialBackoff(maxSeconds: number) {
	return function exponentialBackoff(attempt: number) {
		const num = Math.max(attempt - 2, 0)
		const delay = Math.min(2 ** num, maxSeconds)
		return delayMs(delay * 1_000)
	}
}

const sqrt5 = /* @__PURE__ */ Math.sqrt(5)
/**
 * @see https://en.wikipedia.org/wiki/Fibonacci_sequence#Closed-form_expression
 */
const binet = (n: number) =>
	Math.round(((1 + sqrt5) ** n - (1 - sqrt5) ** n) / (2 ** n * sqrt5))

/**
 * Returns a function which implements Fibonacci backoff.
 *
 * @param maxSeconds - The maximum number of seconds to wait before retrying.
 * @returns A function which takes an `attempt` number and returns a promise
 * that resolves after the calculated delay.
 */
export function useFibonacciBackoff(maxSeconds: number) {
	return function fibonacciBackoff(attempt: number) {
		const delay = Math.min(binet(attempt), maxSeconds)
		return delayMs(delay * 1_000)
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
export function withRetry<Ret, Args extends unknown[]>(
	main: MainFn<Ret, Args>,
	options: RetryOptions = {},
): MainFn<Ret, Args> {
	const {
		shouldRetry = () => true,
		maxAttempts = 3,
		retryDelay = () => Promise.resolve(),
	} = options

	assert(maxAttempts >= 1, "maxAttempts must be a number greater than 0")

	const controller = new AbortController()
	const { signal } = controller

	async function execute(args: Args, attempt = 1): Promise<Ret> {
		try {
			return await main(...args)
		} catch (cause) {
			// Check if we should retry this error
			if (!shouldRetry(cause, attempt)) throw cause

			// Check if we've exhausted attempts
			if (attempt >= maxAttempts)
				throw new Error(`ERR_CIRCUIT_BREAKER_MAX_ATTEMPTS (${maxAttempts})`, {
					cause,
				})

			// Wait before retrying
			await rejectOnAbort(signal, retryDelay(attempt + 1, signal))

			// Retry
			return execute(args, attempt + 1)
		}
	}

	return Object.assign(
		function withRetryFunction(...args: Args) {
			return execute(args)
		},
		{
			[disposeKey]: (disposeMessage = "ERR_CIRCUIT_BREAKER_DISPOSED") => {
				const reason = new ReferenceError(disposeMessage)
				main[disposeKey]?.(disposeMessage)
				controller.abort(reason)
			},
		},
	)
}

/**
 * Wrap a function with a timeout. If execution of `main` exceeds `timeoutMs`,
 * then the call is rejected with `new Error(timeoutMessage)`.
 */
export function withTimeout<Ret, Args extends unknown[]>(
	main: MainFn<Ret, Args>,
	timeoutMs: number,
	timeoutMessage = "ERR_CIRCUIT_BREAKER_TIMEOUT",
): MainFn<Ret, Args> {
	const error = new Error(timeoutMessage)
	const controller = new AbortController()
	const { signal } = controller

	function withTimeoutFunction(...args: Args) {
		let teardown: () => void
		let timer: NodeJS.Timeout
		return Promise.race([
			main(...args).finally(() => {
				clearTimeout(timer)
				signal.removeEventListener("abort", teardown)
			}),
			new Promise<never>((_, reject) => {
				teardown = () => {
					clearTimeout(timer)
					reject(signal.reason)
				}
				timer = setTimeout(reject, timeoutMs, error)
				signal.addEventListener("abort", teardown, { once: true })
			}),
		])
	}

	return Object.assign(withTimeoutFunction, {
		[disposeKey]: (disposeMessage = "ERR_CIRCUIT_BREAKER_DISPOSED") => {
			const reason = new ReferenceError(disposeMessage)
			main[disposeKey]?.(disposeMessage)
			controller.abort(reason)
		},
	})
}
