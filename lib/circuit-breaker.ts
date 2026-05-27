import { parseOptions } from "./options.js"
import type {
	CircuitBreakerOptions,
	CircuitBreakerProtectedFn,
	HistoryEntry,
	HistoryMap,
	MainFn,
	StateName,
} from "./types.js"
import {
	CircuitError,
	abortable,
	assert,
	delayMs,
	noop,
	promiseTry,
	shouldContinue,
} from "./util.js"

const validTransitions: Record<StateName, StateName[]> = {
	closed: ["open", "disposed"],
	open: ["halfOpen", "disposed"],
	halfOpen: ["closed", "open", "disposed"],
	disposed: [],
}

function assertTransition(from: StateName, to: StateName): void {
	assert(
		validTransitions[from].includes(to),
		`Invalid transition from ${from} to ${to}`,
	)
}

interface CircuitInternalState<T extends StateName = StateName> {
	controller: AbortController
	failureCause: unknown
	failureRate: number
	history: HistoryMap
	status: T
}

function createState(
	status: StateName,
	failureCause?: unknown,
): CircuitInternalState {
	const controller = new AbortController()
	return {
		controller,
		failureCause,
		failureRate: 0,
		history: new Map(),
		status,
	}
}

/**
 * Creates a circuit breaker that wraps an async function with failure tracking
 * and automatic fallback behavior.
 *
 * The circuit breaker operates in four states:
 *
 * - `closed`: Normal operation, tracks failures in a sliding window
 * - `open`: Failed state, fallback is used until `resetAfter` milliseconds
 * - `halfOpen`: Testing recovery, allows trial calls
 * - `disposed`: Terminal state, all calls rejected
 *
 * When the failure rate exceeds `errorThreshold` within the `errorWindow`, the
 * circuit opens and rejects calls (using fallback if provided) for `resetAfter`
 * milliseconds. After this period, it transitions to half-open and allows up
 * to `minimumCandidates` concurrent trial calls. If their failure rate stays
 * at or below the threshold, the circuit closes; otherwise it reopens.
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
 * protectedFn[Symbol.dispose]() // Clean up timers and resources
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
		fallback,
		minimumCandidates,
		onClose,
		onHalfOpen,
		onOpen,
		resetAfter,
		retryDelay,
		retryLimit,
		retryTest,
		timeout,
	} = parseOptions(options)

	let state = createState("closed")

	async function tryCall(
		current: CircuitInternalState,
		args: Args,
	): Promise<Ret> {
		const { history } = current
		const request = promiseTry(() => main(...args))

		let historyItem: HistoryEntry | undefined = { status: "pending" }
		history.set(request, historyItem)

		try {
			const result =
				timeout > 0
					? await abortable(AbortSignal.timeout(timeout), request)
					: await request
			historyItem.status = "resolved"
			return result
		} catch (cause) {
			historyItem.status = "rejected"
			// Drop this request if it's a transient error that shouldn't count
			// towards the failure rate
			const isTransient = errorIsFailure(cause)
			if (isTransient) historyItem = undefined

			// Wrap the error in a CircuitError to provide additional context and
			// control flow handling.
			throw new CircuitError("CALL_FAILURE", { cause, isTransient })
		} finally {
			// Remove the request if it was a transient failure, or if it's stale.
			if (!historyItem || state !== current) history.delete(request)
			// Keep the request in history until the end of the error window, or until
			// the circuit transitions.
			else {
				const { signal } = current.controller
				delayMs(errorWindow, signal)
					.catch(() => {})
					.finally(() => history.delete(request))
			}
		}
	}

	function calculateFailureRate(): number {
		let failures = 0
		let total = 0
		for (const { status } of state.history.values()) {
			if (status === "rejected") failures++
			if (status !== "pending") total++
		}
		if (!total || total < minimumCandidates) return 0
		return failures / total
	}

	function transitionTo(
		toStatus: StateName,
		failureCause?: unknown,
	): CircuitInternalState {
		assertTransition(state.status, toStatus)
		state.controller.abort()
		return (state = createState(toStatus, failureCause))
	}

	async function transitionToOpen(error: CircuitError): Promise<void> {
		// Race guard: a concurrent failure may have already changed state.
		if (state.status !== "closed" && state.status !== "halfOpen") return

		const cause = error.cause ?? error
		const nextState = transitionTo("open", cause)
		if (onOpen) setImmediate(onOpen, cause)

		const { signal } = nextState.controller
		await delayMs(resetAfter, signal)
		if (state === nextState) transitionToHalfOpen()
	}

	function transitionToHalfOpen(): void {
		transitionTo("halfOpen", state.failureCause)
		if (onHalfOpen) setImmediate(onHalfOpen)
	}

	function transitionToClosed(): void {
		transitionTo("closed")
		if (onClose) setImmediate(onClose)
	}

	function guardIsCurrent(
		current: CircuitInternalState,
		error: unknown,
	): error is CircuitError {
		if (!(error instanceof CircuitError)) throw error
		// Transient errors shouldn't affect the circuit breaker's state. Re-throw
		// the original cause of the error.
		if (error.isTransient) throw error.cause

		// If the circuit breaker was disposed mid-flight, surface the underlying
		// cause of the in-flight call rather than the dispose error.
		if (state.status === "disposed")
			// eslint-disable-next-line @typescript-eslint/only-throw-error
			throw error.cause ?? new CircuitError("DISPOSED")

		// If the circuit breaker transitioned states, try again.
		return state === current
	}

	async function protectedFn(...args: Args): Promise<Ret> {
		let lastError: CircuitError | undefined
		let retries = 0
		do {
			const current = state

			// Closed: Normal Operation
			if (current.status === "closed") {
				try {
					return await tryCall(current, args)
				} catch (error) {
					if (guardIsCurrent(current, error)) {
						lastError = error
						// Determine if the failure rate should open the circuit.
						const rate = (current.failureRate = calculateFailureRate())
						if (rate > errorThreshold) transitionToOpen(error).catch(noop)
					}
				}
			}

			// Half-Open: Execute trial calls until we have enough candidates.
			else if (
				current.status === "halfOpen" &&
				current.history.size < minimumCandidates
			) {
				try {
					return await tryCall(current, args)
				} catch (error) {
					if (guardIsCurrent(current, error)) lastError = error
				} finally {
					// Do nothing until we have enough candidates to make a decision.
					if (state === current && current.history.size >= minimumCandidates) {
						const rate = (current.failureRate = calculateFailureRate())
						// Determine if the failure rate should re-open the circuit or
						// if it is healthy enough to close it again.
						if (rate > errorThreshold && lastError)
							transitionToOpen(lastError).catch(noop)
						else if (rate <= errorThreshold) transitionToClosed()
					}
				}
			}

			// Open: Skip calls and immediately return fallback if available.
			else if (current.status === "open" || current.status === "halfOpen") {
				if (!fallback)
					// eslint-disable-next-line @typescript-eslint/only-throw-error
					throw current.failureCause ?? new CircuitError("UNKNOWN")

				return fallback(...args)
			}

			// Disposed: Reject all calls with dispose error.
			else throw current.failureCause
		} while (
			await shouldContinue({
				retries: ++retries,
				lastError: lastError?.cause ?? lastError,
				retryDelay,
				retryLimit,
				retryTest,
				signal: state.controller.signal,
			})
		)
		throw new Error("unknown error in circuit breaker retry logic")
	}

	function dispose(disposeMessage = "ERR_CIRCUIT_BREAKER_DISPOSED"): void {
		if (state.status === "disposed") return
		transitionTo("disposed", new ReferenceError(disposeMessage))
		main[Symbol.dispose]?.()
	}

	const wrapped = protectedFn as CircuitBreakerProtectedFn<Ret, Args>
	wrapped[Symbol.dispose] = () => dispose()
	wrapped.dispose = dispose
	wrapped.getFailureRate = () => state.failureRate
	wrapped.getLatestError = () => state.failureCause
	wrapped.getState = () => state.status

	return wrapped
}
