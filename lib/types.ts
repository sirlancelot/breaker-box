import type { AnyFn } from "./util"

export type CircuitState = "closed" | "halfOpen" | "open"

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
	 * @default 6
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

	/**
	 * Provide a function which returns a promise that resolves when the next
	 * retry attempt should be made. Use this to implement custom retry logic,
	 * such as exponential backoff.
	 *
	 * Note that `attempt` always starts at 2, since first attempts are always
	 * made as soon as they come in.
	 *
	 * @default none // Retry errors immediately
	 * @example
	 * ```ts
	 * // Constant delay of 1 second for all retries
	 * const breaker = createCircuitBreaker(main, {
	 * 	 retryDelay: () => delayMs(1_000),
	 * })
	 *
	 * // Double the previous delay each time, up to 30 seconds
	 * const breaker = createCircuitBreaker(main, {
	 * 	 retryDelay: useExponentialBackoff(30),
	 * })
	 *
	 * // Use Fibonacci sequence for delay, up to 90 seconds
	 * const breaker = createCircuitBreaker(main, {
	 * 	 retryDelay: useFibonacciBackoff(90),
	 * })
	 * ```
	 */
	retryDelay?: (attempt: number, signal: AbortSignal) => Promise<void>
}

export interface CircuitBreakerProtectedFn<
	Ret = unknown,
	Args extends unknown[] = never[],
> {
	(...args: Args): Promise<Ret>

	/**
	 * Free memory and stop timers. All future calls will be rejected with the
	 * provided message.
	 *
	 * @default "ERR_CIRCUIT_BREAKER_DISPOSED"
	 */
	dispose(disposeMessage?: string): void

	/** Get the last error which triggered the circuit breaker */
	getLatestError(): unknown | undefined

	/** Get the current state of the circuit breaker */
	getState(): CircuitState
}

export interface HistoryEntry {
	timer: NodeJS.Timeout | undefined
	status: "pending" | "resolved" | "rejected"
}

export type HistoryMap = Map<Promise<unknown>, HistoryEntry>

export type MainFn<Ret = unknown, Args extends unknown[] = never[]> = (
	...args: Args
) => Promise<Ret>
