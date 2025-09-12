import { type AnyFn, assertNever } from "./util.js"

export type CircuitState = "closed" | "disposed" | "halfOpen" | "open"

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
		fallback = () => Promise.reject(failureCause),
		onClose,
		onOpen,
		resetAfter = 30_000,
	} = options
	let halfOpenPending: Promise<unknown> | undefined
	let state: CircuitState = "closed"
	let failureCause: unknown | undefined = undefined
	let failureCount = 0
	let resetTimer: NodeJS.Timeout | undefined = undefined

	/**
	 * Break the circuit and wait for a reset
	 */
	function openCircuit(cause: unknown) {
		state = "open"
		onOpen?.(cause)
		clearTimeout(resetTimer)
		resetTimer = setTimeout(() => (state = "halfOpen"), resetAfter)
	}

	/**
	 * Reset the circuit and resume normal operation
	 */
	function closeCircuit() {
		state = "closed"
		failureCause = undefined
		failureCount = 0
		clearTimeout(resetTimer)
	}

	/**
	 * Wrap calls to `main` with circuit breaker logic
	 */
	async function protectedFunction(...args: Args): Promise<Ret> {
		// Normal operation when circuit is closed. If an error occurs, keep track
		// of the failure count and open the circuit if it exceeds the threshold.
		if (state === "closed") {
			return main(...args).catch((cause) => {
				if (state === "disposed") throw cause
				failureCause = cause
				failureCount += errorIsFailure(cause) ? 1 : 0
				if (failureCount >= failureThreshold) openCircuit(cause)
				return protectedFunction(...args)
			})
		}

		// Use the fallback while the circuit is open
		else if (state === "open" || halfOpenPending) {
			return fallback(...args)
		}

		// While the circuit is half-open, try the main function once. If it
		// succeeds, close the circuit and resume normal operation. If it fails,
		// re-open the circuit and run the fallback instead.
		else if (state === "halfOpen") {
			return (halfOpenPending = main(...args))
				.finally(() => (halfOpenPending = undefined))
				.then(
					(result) => {
						if (state !== "disposed") {
							closeCircuit()
							onClose?.()
						}
						return result
					},
					(cause) => {
						if (state === "disposed") throw cause
						openCircuit(cause)
						return fallback(...args)
					}
				)
		}

		// Shutting down...
		else if (state === "disposed") {
			throw new Error("Circuit breaker has been disposed")
			/* v8 ignore next */
		}

		// exhaustive check
		/* v8 ignore next 5 */
		else {
			throw process.env.NODE_ENV !== "production"
				? assertNever(state)
				: undefined
		}
	}

	protectedFunction.dispose = () => {
		closeCircuit()
		state = "disposed"
	}

	protectedFunction.getLatestError = () => failureCause

	protectedFunction.getState = () => state

	return protectedFunction
}
