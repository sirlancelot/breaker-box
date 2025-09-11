import { type AnyFn, assertNever } from "./util.js"
import EventEmitter from "node:events"

export type CircuitState = "closed" | "disposed" | "halfOpen" | "open"

export interface CircuitBreakerOptions<Args extends unknown[], Ret> {
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
	 * @default undefined // No fallback, throws `CircuitOpenError`
	 */
	fallback?: (...args: Args) => Promise<Ret>

	/**
	 * The amount of time to wait before allowing a half-open state.
	 * 
	 * @default 30_000 // 30 seconds
	 */
	resetAfter?: number
}

export interface EventMap {
	close: []
	open: [cause: unknown]
	reject: [cause: unknown]
	resolve: []
}

export interface ProtectedFunction<Args extends unknown[], Ret> {
	(...args: Args): Promise<Ret>

	/** Free memory and stop timers */
	dispose(): void

	/** Get the current state of the circuit breaker */
	getState(): CircuitState

	/** Remove a listener from the circuit breaker */
	off<T extends keyof EventMap>(
		event: T,
		listener: (...args: EventMap[T]) => void
	): this

	/** Add a listener to the circuit breaker */
	on<T extends keyof EventMap>(
		event: T,
		listener: (...args: EventMap[T]) => void
	): this
}

export function createCircuitBreaker<Args extends unknown[], Ret>(
	main: (...args: Args) => Promise<Ret>,
	options: CircuitBreakerOptions<Args, Ret> = {}
): ProtectedFunction<Args, Ret> {
	const events = new EventEmitter<EventMap>()
	const {
		errorIsFailure = () => true,
		failureThreshold = 1,
		fallback = () => {
			const cause = failureCause
			const msg = cause instanceof Error ? cause.message : "Unknown"
			throw new Error(`CircuitOpenError: ${msg}`, { cause })
		},
		resetAfter = 30_000,
	} = options
	let state: CircuitState = "closed"
	let failureCause: unknown | undefined = undefined
	let failureCount = 0
	let resetTimer: NodeJS.Timeout | undefined = undefined

	/**
	 * Break the circuit and wait for a reset
	 */
	function openCircuit(cause: unknown) {
		if (state === "disposed") return
		state = "open"
		events.emit("open", cause)
		failureCause = cause
		clearTimeout(resetTimer)
		resetTimer = setTimeout(() => (state = "halfOpen"), resetAfter)
	}

	/**
	 * Restart the circuit and resume normal operation
	 */
	function closeCircuit() {
		if (state === "disposed") return
		if (state === "halfOpen") events.emit("close")
		state = "closed"
		failureCause = undefined
		failureCount = 0
		clearTimeout(resetTimer)
	}

	const mainWithEmit = async (...args: Args) => {
		try {
			const result = await main(...args)
			events.emit("resolve")
			closeCircuit()
			return result
		} catch (cause) {
			events.emit("reject", cause)
			throw cause
		}
	}

	/**
	 * Wrap calls to `main` with circuit breaker logic
	 */
	async function protectedFunction(...args: Args): Promise<Ret> {
		// Use the fallback while the circuit is open
		if (state === "open") {
			return fallback(...args)
		}

		// While the circuit is half-open, try the main function once. If it
		// success, close the circuit and resume normal operation. If it fails,
		// re-open the circuit and run the fallback instead.
		else if (state === "halfOpen") {
			return mainWithEmit(...args).catch((cause) => {
				openCircuit(cause)
				return fallback(...args)
			})
		}

		// Normal operation when circuit is closed. If an error occurs, keep track
		// of the failure count and open the circuit if it exceeds the threshold.
		else if (state === "closed") {
			return mainWithEmit(...args).catch((cause) => {
				failureCause = cause
				failureCount += errorIsFailure(cause) ? 1 : 0
				if (failureCount >= failureThreshold) openCircuit(cause)
				return fallback(...args)
			})
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
		events.removeAllListeners()
		closeCircuit()
		state = "disposed"
	}

	protectedFunction.getState = () => state

	protectedFunction.off = (event: keyof EventMap, listener: AnyFn) => {
		events.removeListener(event, listener)
		return protectedFunction
	}

	protectedFunction.on = (event: keyof EventMap, listener: AnyFn) => {
		events.addListener(event, listener)
		return protectedFunction
	}

	return protectedFunction
}
