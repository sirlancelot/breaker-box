import { parseOptions } from "./options.js"
import {
	disposeKey,
	type CircuitBreakerOptions,
	type CircuitBreakerProtectedFn,
	type CircuitState,
	type HistoryEntry,
	type HistoryMap,
	type MainFn,
} from "./types.js"
import { assertNever, type AnyFn } from "./util.js"

export * from "./helpers.js"
export { delayMs } from "./util.js"

export function createCircuitBreaker<
	Ret,
	Args extends unknown[],
	Fallback extends AnyFn = MainFn<Ret, Args>,
>(
	main: MainFn<Ret, Args>,
	options: CircuitBreakerOptions<Fallback> = {},
): CircuitBreakerProtectedFn<Ret, Args> {
	const {
		errorIsFailure,
		errorThreshold,
		errorWindow,
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
	let fallback = options.fallback || (() => Promise.reject(failureCause))
	let halfOpenPending: Promise<unknown> | undefined
	let resetTimer: NodeJS.Timeout
	let state: CircuitState = "closed"

	function clearFailure() {
		failureCause = undefined
	}

	function closeCircuit() {
		state = "closed"
		clearFailure()
		clearTimeout(resetTimer)
		onClose?.()
	}

	function failureRate() {
		let failures = 0
		let total = 0
		for (const { status } of history.values()) {
			if (status === "rejected") failures++
			if (status !== "pending") total++
		}
		// Don't calculate anything until we have enough data
		if (!total || total < minimumCandidates) return 0
		return failures / total
	}

	/**
	 * Break the circuit and wait for a reset
	 */
	function openCircuit(cause: unknown) {
		failureCause = cause
		state = "open"
		clearTimeout(resetTimer)
		resetTimer = setTimeout(() => {
			state = "halfOpen"
			onHalfOpen?.()
		}, resetAfter)
		onOpen?.(cause)
	}

	function createHistoryItem<T>(pending: Promise<T>) {
		const entry: HistoryEntry = { status: "pending", timer: undefined }
		const teardown = () => {
			clearTimeout(entry.timer)
			history.delete(pending)
			signal.removeEventListener("abort", teardown)
		}
		signal.addEventListener("abort", teardown, { once: true })
		const settle = (value: "resolved" | "rejected") => {
			if (signal.aborted) return
			entry.status = value
			// Remove the entry from history when it falls outside of the error window
			entry.timer = setTimeout(teardown, errorWindow)
		}
		history.set(pending, entry)
		return { pending, settle, teardown }
	}

	/**
	 * Wrap calls to `main` with circuit breaker logic
	 */
	function execute(args: Args): Promise<Ret> {
		// Normal operation when circuit is closed. If an error occurs, keep track
		// of the failure count and open the circuit if it exceeds the threshold.
		if (state === "closed") {
			const { pending, settle, teardown } = createHistoryItem(main(...args))
			return pending.then(
				(result) => {
					settle("resolved")
					return result
				},
				(cause: unknown) => {
					// Was the circuit disposed, or is this error considered a failure?
					if (signal.aborted || errorIsFailure(cause)) {
						teardown()
						throw cause
					}

					// Should this error open the circuit?
					settle("rejected")
					if (failureRate() > errorThreshold) openCircuit(cause)

					return fallback(...args)
				},
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
			return (halfOpenPending = main(...args))
				.finally(() => (halfOpenPending = undefined))
				.then(
					(result) => {
						if (signal.aborted) return result // disposed
						closeCircuit()
						return result
					},
					(cause: unknown) => {
						// Was the circuit disposed, or was this a non-retryable error?
						if (signal.aborted || errorIsFailure(cause)) throw cause

						// Open the circuit and use fallback
						openCircuit(cause)
						return fallback(...args)
					},
				)
			/* v8 ignore next */
		}

		// exhaustive check
		/* v8 ignore next */
		return assertNever(state)
	}

	return Object.assign((...args: Args) => execute(args), {
		dispose: (disposeMessage = "ERR_CIRCUIT_BREAKER_DISPOSED") => {
			const reason = new ReferenceError(disposeMessage)
			main[disposeKey]?.(disposeMessage)
			clearFailure()
			clearTimeout(resetTimer)
			history.forEach((entry) => clearTimeout(entry.timer))
			history.clear()
			fallback = () => Promise.reject(reason)
			state = "open"
			controller.abort(reason)
		},
		getLatestError: () => failureCause,
		getState: () => state,
	})
}
