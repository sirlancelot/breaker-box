import { disposeKey, type AnyFn } from "./util"

/**
 * The four possible states of a circuit breaker.
 *
 * - `closed`: Normal operation, tracking failures
 * - `open`: Failing state, rejecting calls or using fallback
 * - `halfOpen`: Testing recovery with a single trial call
 * - `disposed`: Terminal state, all calls rejected
 */
export type CircuitState = "closed" | "halfOpen" | "open" | "disposed"

/**
 * Configuration options for circuit breaker behavior.
 */
export interface CircuitBreakerOptions<Fallback extends AnyFn = AnyFn> {
	/**
	 * Whether an error should be treated as non-retryable failure. When used and
	 * when an error is considered a failure, the error will be thrown to the
	 * caller.
	 *
	 * @default () => false // Errors are retryable by default
	 */
	errorIsFailure?: (error: unknown) => boolean

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
	 * If provided, then all rejected calls to `main` will be forwarded to
	 * this function instead.
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
	 * The amount of time in milliseconds to wait before transitioning to a
	 * half-open state.
	 *
	 * @default 30_000 // 30 seconds
	 */
	resetAfter?: number
}

/**
 * A function wrapped with circuit breaker protection. Includes methods for
 * state inspection and resource cleanup.
 */
export interface CircuitBreakerProtectedFn<
	Ret = unknown,
	Args extends readonly unknown[] = readonly [],
> {
	(...args: Args): Promise<Ret>

	/**
	 * Free memory and stop timers. All future calls will be rejected with the
	 * provided message.
	 *
	 * @default "ERR_CIRCUIT_BREAKER_DISPOSED"
	 */
	dispose(this: void, disposeMessage?: string): void

	/** Get the current failure rate of the circuit breaker */
	getFailureRate(this: void): number

	/** Get the last error which triggered the circuit breaker */
	getLatestError(this: void): unknown

	/** Get the current state of the circuit breaker */
	getState(this: void): CircuitState
}

/**
 * Tracks the status of a single call within the error window. Contains a timer
 * for automatic cleanup and the current resolution status.
 */
export interface HistoryEntry {
	timer: NodeJS.Timeout | undefined
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

	[disposeKey]?: (disposeMessage?: string) => void
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
	retryDelay?: (attempt: number, signal: AbortSignal) => Promise<void>
}
