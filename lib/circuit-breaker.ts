import { parseOptions } from "./options.js"
import {
	type CircuitBreakerOptions,
	type CircuitBreakerProtectedFn,
	type CircuitState,
	type HistoryEntry,
	type HistoryMap,
	type MainFn,
} from "./types.js"
import { assert, assertNever, disposeKey } from "./util.js"

const validTransitions: Record<CircuitState, CircuitState[]> = {
	closed: ["open", "disposed"],
	open: ["halfOpen", "disposed"],
	halfOpen: ["closed", "open", "disposed"],
	disposed: [],
}

function assertTransition(from: CircuitState, to: CircuitState): void {
	assert(
		validTransitions[from].includes(to),
		`Invalid transition from ${from} to ${to}`,
	)
}

/**
 * Creates a circuit breaker that wraps an async function with failure tracking
 * and automatic fallback behavior.
 *
 * The circuit breaker operates in four states:
 *
 * - `closed`: Normal operation, tracks failures in a sliding window
 * - `open`: Failed state, fallback is used until `resetAfter` milliseconds
 * - `halfOpen`: Testing recovery, allows one trial call
 * - `disposed`: Terminal state, all calls rejected
 *
 * When the failure rate exceeds `errorThreshold` within the `errorWindow`, the
 * circuit opens and rejects calls (using fallback if provided) for `resetAfter`
 * milliseconds. After this period, it transitions to half-open and allows one
 * trial call. Success closes the circuit; failure reopens it.
 *
 * @example
 * ```ts
 * const protectedFn = createCircuitBreaker(unreliableApiCall, {
 *   errorThreshold: 0.5,
 *   errorWindow: 10_000,
 *   resetAfter: 30_000,
 *   fallback: () => cachedResponse,
 * })
 *
 * try {
 *   const result = await protectedFn(arg1, arg2)
 * } catch (error) {
 *   console.error('Circuit breaker rejected call:', error)
 * }
 *
 * console.log(protectedFn.getState()) // 'closed' | 'open' | 'halfOpen' | 'disposed'
 * protectedFn.dispose() // Clean up timers and resources
 * ```
 */
export function createCircuitBreaker<Ret, Args extends unknown[]>(
	main: MainFn<Ret, Args>,
	options: CircuitBreakerOptions<MainFn<Ret, Args>> = {},
): CircuitBreakerProtectedFn<Ret, Args> {
	const {
		errorIsFailure,
		errorThreshold,
		errorWindow,
		fallback: userFallback,
		minimumCandidates,
		onClose,
		onHalfOpen,
		onOpen,
		resetAfter,
	} = parseOptions(options)
	const controller = new AbortController()
	const history: HistoryMap = new Map()
	const signal = controller.signal
	let failureCause: unknown
	let failureRate = 0
	let fallback: typeof main =
		userFallback || (() => Promise.reject(failureCause))
	let halfOpenPending: Promise<unknown> | undefined
	let resetTimer: NodeJS.Timeout | undefined
	let state: CircuitState = "closed"

	function calculateFailureRate(): number {
		let failures = 0
		let total = 0
		for (const { status } of history.values()) {
			if (status === "rejected") failures++
			if (status !== "pending") total++
		}
		if (!total || total < minimumCandidates) return 0
		return failures / total
	}

	function transition(
		toState: CircuitState,
		options: { cause?: unknown } = {},
	): void {
		assertTransition(state, toState)
		state = toState

		switch (toState) {
			case "closed":
				clearTimeout(resetTimer)
				failureCause = undefined
				resetTimer = undefined
				if (onClose) setImmediate(onClose)
				break

			case "open":
				clearTimeout(resetTimer)
				failureCause = options.cause
				resetTimer = setTimeout(() => transition("halfOpen"), resetAfter)
				if (onOpen) setImmediate(onOpen, failureCause)
				break

			case "halfOpen":
				halfOpenPending = undefined
				if (onHalfOpen) setImmediate(onHalfOpen)
				break

			case "disposed":
				failureCause = options.cause
				assert(failureCause instanceof Error, "dispose cause must be an Error")
				controller.abort(failureCause)
				main[disposeKey]?.(failureCause.message)

				history.forEach((entry) => clearTimeout(entry.timer))
				history.clear()

				halfOpenPending = undefined
				failureRate = 0
				fallback = undefined as never

				clearTimeout(resetTimer)
				resetTimer = undefined
				break

			default:
				/* v8 ignore next -- @preserve */
				assertNever(toState)
		}
	}

	function createHistoryItem<T>(pending: Promise<T>) {
		const entry: HistoryEntry = { status: "pending", timer: undefined }
		const teardown = (): void => {
			clearTimeout(entry.timer)
			history.delete(pending)
			signal.removeEventListener("abort", teardown)
		}
		signal.addEventListener("abort", teardown, { once: true })
		const settle = (value: "resolved" | "rejected"): number => {
			if (signal.aborted) return 0
			entry.status = value
			entry.timer = setTimeout(teardown, errorWindow)
			return calculateFailureRate()
		}
		history.set(pending, entry)
		return { pending, settle, teardown }
	}

	function executeClosed(args: Args): Promise<Ret> {
		const { pending, settle, teardown } = createHistoryItem(main(...args))
		return pending.then(
			(result) => {
				failureRate = settle("resolved")
				return result
			},
			(cause: unknown) => {
				if (signal.aborted || errorIsFailure(cause)) {
					teardown()
					throw cause
				}

				failureRate = settle("rejected")
				if (failureRate > errorThreshold) {
					transition("open", { cause })
				}

				return fallback(...args)
			},
		)
	}

	function executeOpen(args: Args): Promise<Ret> {
		return fallback(...args)
	}

	function executeHalfOpen(args: Args): Promise<Ret> {
		if (halfOpenPending) return fallback(...args)

		return (halfOpenPending = main(...args))
			.finally(() => (halfOpenPending = undefined))
			.then(
				(result) => {
					if (signal.aborted) return result
					transition("closed")
					return result
				},
				(cause: unknown) => {
					if (signal.aborted || errorIsFailure(cause)) throw cause
					transition("open", { cause })
					return fallback(...args)
				},
			)
	}

	function executeDisposed(): Promise<never> {
		return Promise.reject(failureCause)
	}

	function execute(...args: Args): Promise<Ret> {
		switch (state) {
			case "closed":
				return executeClosed(args)
			case "open":
				return executeOpen(args)
			case "halfOpen":
				return executeHalfOpen(args)
			case "disposed":
				return executeDisposed()
			default:
				/* v8 ignore next -- @preserve */
				return assertNever(state)
		}
	}

	return Object.assign(execute, {
		dispose: (disposeMessage = "ERR_CIRCUIT_BREAKER_DISPOSED") => {
			if (state === "disposed") return
			transition("disposed", { cause: new ReferenceError(disposeMessage) })
		},
		getFailureRate: () => failureRate,
		getLatestError: () => failureCause,
		getState: () => state,
	})
}
