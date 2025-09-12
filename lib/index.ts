import { type AnyFn, assertNever, nextTick } from "./util.js"

export type CircuitState = "closed" | "halfOpen" | "open"

export interface CircuitBreakerOptions<Fallback extends AnyFn = AnyFn> {
	/**
	 * Whether an error should be considered a failure that could trigger
	 * the circuit breaker. Use this to prevent certain errors from
	 * incrementing the failure count.
	 *
	 * @default () => true // Every error is considered a failure
	 */
	errorIsFailure?: (error: unknown) => boolean

	/**
	 * The number of failures before the circuit breaker opens.
	 *
	 * @default 1 // The first error opens the circuit
	 */
	failureThreshold?: number

	/**
	 * If provided, then all rejected calls to `main` will be forwarded to
	 * this function instead.
	 *
	 * @default undefined // No fallback, errors are propagated
	 */
	fallback?: Fallback

	/** Called when the circuit breaker is closed */
	onClose?: () => void

	/** Called when the circuit breaker is opened */
	onOpen?: (cause: unknown) => void

	/**
	 * The amount of time to wait before allowing a half-open state.
	 *
	 * @default 30_000 // 30 seconds
	 */
	resetAfter?: number
}

export interface CircuitBreakerProtectedFn<
	Ret = unknown,
	Args extends unknown[] = never[]
> {
	(...args: Args): Promise<Ret>

	/** Free memory and stop timers */
	dispose(): void

	/** Get the last error which triggered the circuit breaker */
	getLatestError(): unknown | undefined

	/** Get the current state of the circuit breaker */
	getState(): CircuitState
}

export function createCircuitBreaker<
	Ret,
	Args extends unknown[],
	Fallback extends AnyFn = (...args: Args) => Promise<Ret>
>(
	main: (...args: Args) => Promise<Ret>,
	options: CircuitBreakerOptions<Fallback> = {}
): CircuitBreakerProtectedFn<Ret, Args> {
	const {
		errorIsFailure = () => true,
		failureThreshold = 1,
		onClose,
		onOpen,
		resetAfter = 30_000,
	} = options
	let fallback = options.fallback || (() => Promise.reject(failureCause))
	let halfOpenPending: Promise<unknown> | undefined
	let state: CircuitState = "closed"
	let failureCause: unknown | undefined
	let failureCount = 0
	let resetTimer: NodeJS.Timeout | undefined

	function clearFailure() {
		failureCause = undefined
		failureCount = 0
	}

	/**
	 * Break the circuit and wait for a reset
	 */
	function openCircuit(cause: unknown) {
		failureCause = cause
		state = "open"
		clearTimeout(resetTimer)
		resetTimer = setTimeout(() => (state = "halfOpen"), resetAfter)
		onOpen?.(cause)
	}

	/**
	 * Wrap calls to `main` with circuit breaker logic
	 */
	function protectedFunction(...args: Args): Promise<Ret> {
		// Normal operation when circuit is closed. If an error occurs, keep track
		// of the failure count and open the circuit if it exceeds the threshold.
		if (state === "closed") {
			const thisFallback = fallback
			return main(...args).then(
				(result) => {
					// Reset accumulated failures if circuit is still closed
					if (state === "closed") clearFailure()
					return result
				},
				(cause: unknown) => {
					// Was the circuit breaker disposed while the call was in flight?
					if (thisFallback !== fallback) throw cause
					failureCount += errorIsFailure(cause) ? 1 : 0
					if (failureCount === failureThreshold) openCircuit(cause)
					return nextTick(() => protectedFunction(...args))
				}
			)
		}

		// Use the fallback while the circuit is open, or if a half-open trial
		// attempt was already made.
		else if (state === "open" || halfOpenPending) {
			return fallback(...args)
		}

		// If the circuit is half-open, make one attempt. If it succeeds, close
		// the circuit and resume normal operation. If it fails, re-open the
		// circuit and run the fallback instead.
		else if (state === "halfOpen") {
			const thisFallback = fallback
			return (halfOpenPending = main(...args))
				.finally(() => (halfOpenPending = undefined))
				.then(
					(result) => {
						// Was the circuit breaker disposed while the call was
						// in flight?
						if (thisFallback !== fallback) return result
						// Close the circuit and resume normal operation
						state = "closed"
						clearFailure()
						clearTimeout(resetTimer)
						onClose?.()
						return result
					},
					(cause: unknown) => {
						// Was the circuit breaker disposed while the call was
						// in flight?
						if (thisFallback !== fallback) throw cause
						openCircuit(cause)
						return nextTick(() => protectedFunction(...args))
					}
				)
			/* v8 ignore next */
		}

		// exhaustive check
		/* v8 ignore next */
		return assertNever(state)
	}

	protectedFunction.dispose = () => {
		clearFailure()
		clearTimeout(resetTimer)
		fallback = () =>
			Promise.reject(new ReferenceError("ERR_CIRCUIT_BREAKER_DISPOSED"))
		state = "open"
	}

	protectedFunction.getLatestError = () => failureCause

	protectedFunction.getState = () => state

	return protectedFunction
}
