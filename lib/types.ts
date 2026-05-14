export type AnyFn = (...args: never[]) => unknown

export type ErrorTest = (error: unknown) => boolean

/**
 * The four possible states of a circuit breaker.
 *
 * - `closed`: Normal operation, tracking failures
 * - `open`: Failing state, rejecting calls or using fallback
 * - `halfOpen`: Testing recovery with a single trial call
 * - `disposed`: Terminal state, all calls rejected
 */
export type StateName = "closed" | "halfOpen" | "open" | "disposed"

/**
 * Configuration options for circuit breaker behavior.
 */
export interface CircuitBreakerOptions<Fallback extends AnyFn = AnyFn> {
	/**
	 * Whether an error should be treated as non-retryable failure. When used and
	 * when an error is considered a failure, the error will be thrown to the
	 * caller and the request will *not* count tawards the error rate for circuit
	 * breaker decisions.
	 *
	 * @default () => false // No errors are excluded
	 */
	errorIsFailure?: ErrorTest

	/**
	 * The percentage of errors (as a number between 0 and 1) which must occur
	 * within the error window before the circuit breaker opens.
	 *
	 * @default 0 // Any error opens the circuit
	 */
	errorThreshold?: number

	/**
	 * The sliding window of time in milliseconds over which errors are counted.
	 *
	 * @default 10_000 // 10 seconds
	 */
	errorWindow?: number

	/**
	 * If provided, then this function will be called instead of `main` when the
	 * circuit is open. The fallback receives the same arguments as `main` and may
	 * return a value or throw an error.
	 *
	 * When a fallback is used, the result of its evaluation is returned as-is for
	 * the duration of the circuit's "open" state (until `resetAfter` milliseconds
	 * have passed).
	 *
	 * @default undefined // No fallback, errors are propagated
	 */
	fallback?: Fallback

	/**
	 * The minimum number of calls that must be made before calculating the
	 * error rate and determining whether the circuit breaker should open based on
	 * the `errorThreshold`.
	 *
	 * @default 1
	 */
	minimumCandidates?: number

	/**
	 * Provide a function to be called when the circuit breaker is closed.
	 */
	onClose?: () => void

	/**
	 * Provide a function to be called when the circuit breaker transitions to
	 * half-open state.
	 */
	onHalfOpen?: () => void

	/**
	 * Provide a function to be called when the circuit breaker is opened. It
	 * receives the error as its only argument.
	 */
	onOpen?: (cause: unknown) => void

	/**
	 * The amount of time in milliseconds for the circuit breaker to remain in its
	 * "open" state. After this time has passed, the circuit transitions to
	 * "half-open" and allows up to `minimumCandidates` trial calls to determine
	 * whether to close or to reopen.
	 *
	 * @default 30_000 // 30 seconds
	 */
	resetAfter?: number

	/**
	 * The delay between retry attempts. Can be a number (in milliseconds)
	 * specifying a fixed delay, or a function returning a promise that resolves
	 * when the next retry should occur.
	 */
	retryDelay?: number | RetryDelayFn

	/**
	 * The maximum number of attempts any call to `main` should be retried. The
	 * last error is thrown if this limit is exceeded.
	 *
	 * @default Infinity // No retry limit
	 */
	retryLimit?: number

	/**
	 * A function that determines whether an error should be retried. When this
	 * returns false, the error will be thrown immediately without retrying, but
	 * the evaluation will still count towards the error rate for circuit breaker
	 * decisions.
	 *
	 * @default () => true // All errors are retried by default
	 */
	retryTest?: ErrorTest

	/**
	 * If greater than zero, each call to `main` is raced against an
	 * `AbortSignal.timeout` of this many milliseconds. When the timeout fires
	 * first, the call rejects with the signal's reason and is counted as a
	 * failure (subject to `errorIsFailure`).
	 *
	 * @default 0 // No per-call timeout
	 */
	timeout?: number
}

/**
 * A function wrapped with circuit breaker protection. Includes methods for
 * state inspection and resource cleanup.
 */
export interface CircuitBreakerProtectedFn<
	Ret = unknown,
	Args extends readonly unknown[] = readonly [],
> extends Disposable {
	(...args: Args): Promise<Ret>

	/**
	 * @deprecated Use `Symbol.dispose` or `using` keyword instead.
	 * @default "ERR_CIRCUIT_BREAKER_DISPOSED"
	 */
	dispose(this: void, disposeMessage?: string): void

	/** Get the current failure rate of the circuit breaker */
	getFailureRate(this: void): number

	/** Get the last error which triggered the circuit breaker */
	getLatestError(this: void): unknown

	/** Get the current state of the circuit breaker */
	getState(this: void): StateName
}

/**
 * Tracks the status of a single call within the error window.
 */
export interface HistoryEntry {
	status: "pending" | "resolved" | "rejected"
}

/**
 * Map tracking all in-flight and recent promises within the error window. Used
 * to calculate failure rates for circuit breaker decisions.
 */
export type HistoryMap<T = unknown> = Map<Promise<T>, HistoryEntry>

/**
 * The main function signature that can be protected by a circuit breaker. May
 * optionally implement the disposal protocol via the `disposeKey` symbol.
 */
export interface MainFn<
	Ret = unknown,
	Args extends readonly unknown[] = never[],
> {
	(...args: Args): Promise<Ret>

	[Symbol.dispose]?: () => void
}

export interface RetryDelayFn {
	(attempt: number, signal: AbortSignal): Promise<void>
}

/**
 * Configuration options for retry behavior.
 */
export interface RetryOptions {
	/**
	 * Whether an error should be treated as non-retryable. When this returns
	 * true, the error will be thrown immediately without retrying.
	 *
	 * @default () => true // All errors are retried
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
	retryDelay?: RetryDelayFn
}
