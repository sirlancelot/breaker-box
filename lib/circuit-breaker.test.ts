import { beforeEach, expect, it, vi } from "vitest"
import { when } from "vitest-when"
import { createCircuitBreaker } from "./circuit-breaker.js"
import { delayMs } from "./util.js"

const errorOk = new Error("ok")
const ok = Symbol("ok")
const fallbackOk = Symbol("fallback")
const fallback = vi.fn().mockName("fallback")
const main = vi.fn().mockName("main")
const resetAfter = 30_000

beforeEach(({ onTestFinished }) => {
	vi.useFakeTimers()

	onTestFinished(() => {
		vi.runAllTimers()
		expect(vi.getTimerCount()).toBe(0)
		vi.resetAllMocks()
	})
})

it("operates transparently", async ({ expect }) => {
	when(main).calledWith("arg1", "arg2").thenResolve(ok)
	using protectedFn = createCircuitBreaker(main)

	expect(protectedFn.getState()).toBe("closed")
	const result = await protectedFn("arg1", "arg2")

	expect(result).toBe(ok)
	expect(protectedFn.getState()).toBe("closed")
	expect(protectedFn.getFailureRate()).toBe(0)
})

it("handles circuit lifecycle", async ({ expect }) => {
	when(main).calledWith("bad").thenReject(errorOk)
	when(main).calledWith("good").thenResolve(ok)
	using protectedFn = createCircuitBreaker(main, {
		errorThreshold: 0,
		minimumCandidates: 1,
		resetAfter,
	})

	// First error opens circuit (minimumCandidates=1, errorThreshold=0)
	await expect(protectedFn("bad")).rejects.toThrow(errorOk)
	expect(protectedFn.getState()).toBe("open")

	// Circuit is open, subsequent calls fail with latest error
	await expect(protectedFn()).rejects.toThrow(errorOk)
	expect(protectedFn.getLatestError()).toBe(errorOk)

	await vi.advanceTimersByTimeAsync(resetAfter)

	expect(protectedFn.getState()).toBe("halfOpen")

	// Half-open trial succeeds, circuit closes
	await expect(protectedFn("good")).resolves.toBe(ok)
	expect(protectedFn.getState()).toBe("closed")
})

it("handles circuit lifecycle with fallback", async ({ expect }) => {
	when(main).calledWith("arg1", "arg2").thenReject(new Error("Use fallback"))
	when(main).calledWith("good").thenResolve(ok)
	when(fallback).calledWith("arg1", "arg2").thenResolve(fallbackOk)
	using protectedFn = createCircuitBreaker(main, {
		fallback,
		minimumCandidates: 1,
		resetAfter,
	})

	// First call fails and opens circuit
	await expect(protectedFn("arg1", "arg2")).resolves.toBe(fallbackOk)
	expect(main).toBeCalledTimes(1)
	expect(protectedFn.getState()).toBe("open")

	// Circuit is open, use fallback
	await expect(protectedFn("arg1", "arg2")).resolves.toBe(fallbackOk)
	expect(main).toBeCalledTimes(1)

	await vi.advanceTimersByTimeAsync(resetAfter)
	expect(protectedFn.getState()).toBe("halfOpen")

	// Half-open trial fails, circuit slams open again
	await expect(protectedFn("arg1", "arg2")).resolves.toBe(fallbackOk)
	expect(main).toBeCalledTimes(2)
	expect(protectedFn.getState()).toBe("open")

	await vi.advanceTimersByTimeAsync(resetAfter)
	expect(protectedFn.getState()).toBe("halfOpen")

	// Half-open trial succeeds, circuit closes
	await expect(protectedFn("good")).resolves.toBe(ok)
	expect(main).toBeCalledTimes(3)
	expect(protectedFn.getState()).toBe("closed")
})

it("re-throws failures", async ({ expect }) => {
	const abortOk = new DOMException("aborted")
	const errorIsFailure = vi
		.fn((error) => error === abortOk)
		.mockName("errorIsFailure")
	when(main).calledWith("bad").thenReject(errorOk)
	when(main, { times: 1 }).calledWith("bad").thenReject(abortOk)
	using protectedFn = createCircuitBreaker(main, {
		errorIsFailure,
		minimumCandidates: 1,
	})

	// First call gets non-retryable failure, doesn't add to history
	// Second call gets retryable error, opens circuit
	const result = Promise.allSettled([protectedFn("bad"), protectedFn("bad")])

	await expect(result).resolves.toMatchObject([
		{ status: "rejected", reason: abortOk },
		{ status: "rejected", reason: errorOk },
	])
	expect(protectedFn.getState()).toBe("open")
	expect(errorIsFailure).toHaveBeenCalled()
	expect(errorIsFailure.mock.calls).toEqual([[abortOk], [errorOk]])
})

it("emits events", async ({ expect }) => {
	when(main).calledWith("bad").thenReject(errorOk)
	when(main).calledWith("good").thenResolve(ok)
	const emitted: ["close" | "open" | "halfOpen", ...unknown[]][] = []
	using protectedFn = createCircuitBreaker(main, {
		minimumCandidates: 1,
		onClose: () => emitted.push(["close"]),
		onHalfOpen: () => emitted.push(["halfOpen"]),
		onOpen: (cause) => emitted.push(["open", cause]),
		resetAfter,
	})

	let result: unknown = protectedFn("bad")

	await expect(result).rejects.toThrow(errorOk)
	await vi.advanceTimersToNextTimerAsync()
	expect(emitted).toEqual([["open", errorOk]])

	await expect(protectedFn()).rejects.toThrow(errorOk)

	vi.advanceTimersByTime(resetAfter) // resetAfter
	await vi.advanceTimersToNextTimerAsync() // process onHalfOpen

	result = await protectedFn("good")
	await vi.advanceTimersToNextTimerAsync() // process onClose
	expect(emitted).toEqual([["open", errorOk], ["halfOpen"], ["close"]])

	expect(result).toBe(ok)
})

it("handles shutdown", async ({ expect }) => {
	const protectedFn = createCircuitBreaker(main)
	protectedFn[Symbol.dispose]()
	expect(protectedFn.getState()).toBe("disposed")

	await expect(protectedFn()).rejects.toThrow("ERR_CIRCUIT_BREAKER_DISPOSED")
})

it("handles inflight requests after shutdown", async ({ expect }) => {
	// Inflight calls should resolve or reject as normal
	when(main)
		.calledWith("good")
		.thenReturn(delayMs(1).then(() => ok))
	let protectedFn = createCircuitBreaker(main)

	let result = protectedFn("good")
	protectedFn[Symbol.dispose]()

	vi.advanceTimersByTime(1)
	await expect(result).resolves.toBe(ok)

	// Reject
	when(main)
		.calledWith("bad")
		.thenReturn(delayMs(1).then(() => Promise.reject(errorOk)))
	protectedFn = createCircuitBreaker(main)

	result = protectedFn("bad")
	protectedFn[Symbol.dispose]()

	vi.advanceTimersByTime(1)
	await expect(result).rejects.toThrow(errorOk)
})

it("handles half-open requests after shutdown", async ({ expect }) => {
	// The half-open call should resolve or reject as normal
	async function createHalfOpenState() {
		when(main).calledWith("initial").thenReject(errorOk)
		const protectedFn = createCircuitBreaker(main, {
			minimumCandidates: 1,
			resetAfter,
		})

		const result = protectedFn("initial")

		await expect(result).rejects.toThrow(errorOk)

		await vi.advanceTimersByTimeAsync(resetAfter)

		expect(protectedFn.getState()).toBe("halfOpen")

		return protectedFn
	}
	let protectedFn = await createHalfOpenState()

	when(main)
		.calledWith("good")
		.thenReturn(delayMs(1).then(() => ok))

	let result = protectedFn("good")
	protectedFn[Symbol.dispose]()

	vi.advanceTimersByTime(1)
	await expect(result).resolves.toBe(ok)

	// half-open reject
	protectedFn = await createHalfOpenState()

	when(main)
		.calledWith("bad")
		.thenReturn(delayMs(1).then(() => Promise.reject(errorOk)))

	result = protectedFn("bad")
	protectedFn[Symbol.dispose]()

	vi.advanceTimersByTime(1)
	await expect(result).rejects.toThrow(errorOk)
})

it("default fallback rejects with an Error when main rejects with a non-Error", async ({
	expect,
}) => {
	when(main).calledWith("bad").thenReject(undefined)
	using protectedFn = createCircuitBreaker(main, { minimumCandidates: 1 })

	// executeClosed: main rejects with undefined, threshold exceeded, opens circuit, calls fallback
	await expect(protectedFn("bad")).rejects.toBeInstanceOf(Error)

	// executeOpen: circuit is open, calls fallback directly
	expect(protectedFn.getState()).toBe("open")
	await expect(protectedFn()).rejects.toBeInstanceOf(Error)
})

it("handles concurrent calls in half-open state", async ({ expect }) => {
	when(main).calledWith("initial").thenReject(errorOk)
	when(main).calledWith("good").thenResolve(ok)
	when(fallback).calledWith("initial").thenResolve(fallbackOk)
	when(fallback).calledWith().thenResolve(fallbackOk)
	using protectedFn = createCircuitBreaker(main, {
		fallback,
		minimumCandidates: 1,
		resetAfter,
	})

	await expect(protectedFn("initial")).resolves.toBe(fallbackOk)
	expect(protectedFn.getState()).toBe("open")

	await vi.advanceTimersByTimeAsync(resetAfter)
	expect(protectedFn.getState()).toBe("halfOpen")

	const firstCall = protectedFn("good")
	const secondCall = protectedFn()
	const thirdCall = protectedFn()

	await expect(firstCall).resolves.toBe(ok)
	await expect(secondCall).resolves.toBe(fallbackOk)
	await expect(thirdCall).resolves.toBe(fallbackOk)

	expect(main).toHaveBeenCalledTimes(2)
	expect(fallback).toHaveBeenCalledTimes(3)
	expect(protectedFn.getState()).toBe("closed")
})

it("times out slow calls and counts them as failures", async ({ expect }) => {
	// AbortSignal.timeout is not intercepted by fake timers; use a real wait.
	when(main)
		.calledWith()
		.thenReturn(
			delayMs(20).then(() => Promise.reject(new Error("didn't time out"))),
		)
	using protectedFn = createCircuitBreaker(main, {
		minimumCandidates: 1,
		timeout: 10,
	})

	await expect(protectedFn()).rejects.toBeInstanceOf(DOMException)
	expect(protectedFn.getState()).toBe("open")
})

it("handles concurrent inflight failures opening the circuit", async ({
	expect,
}) => {
	main.mockImplementation(() => delayMs(1).then(() => Promise.reject(errorOk)))
	using protectedFn = createCircuitBreaker(main, { minimumCandidates: 1 })

	// Two inflight requests fail simultaneously — only the first should trigger the transition
	const first = protectedFn("bad")
	const second = protectedFn("bad")

	vi.advanceTimersByTime(1)
	await expect(first).rejects.toThrow(errorOk)
	await expect(second).rejects.toThrow(errorOk)

	expect(protectedFn.getState()).toBe("open")
})

it("retries with retryLimit", async ({ expect }) => {
	when(main).calledWith().thenResolve(ok)
	when(main, { times: 2 }).calledWith().thenReject(errorOk)
	using protectedFn = createCircuitBreaker(main, {
		retryLimit: 3,
		minimumCandidates: 5,
	})

	await expect(protectedFn()).resolves.toBe(ok)
	expect(main).toHaveBeenCalledTimes(3)
})

it("stops retrying after retryLimit is exceeded", async ({ expect }) => {
	when(main).calledWith().thenReject(errorOk)
	using protectedFn = createCircuitBreaker(main, {
		retryLimit: 2,
		minimumCandidates: 10,
	})

	await expect(protectedFn()).rejects.toMatchObject({
		message: "ERR_CIRCUIT_BREAKER_MAX_RETRIES",
		cause: errorOk,
	})
	expect(main).toHaveBeenCalledTimes(2)
})

it("retryTest prevents retry for non-retryable errors", async ({ expect }) => {
	const nonRetryable = new TypeError("non-retryable")
	when(main).calledWith().thenReject(nonRetryable)
	using protectedFn = createCircuitBreaker(main, {
		retryTest: (err) => !(err instanceof TypeError),
		retryLimit: 3,
		minimumCandidates: 10,
	})

	await expect(protectedFn()).rejects.toMatchObject({
		message: "ERR_CIRCUIT_BREAKER_NON_RETRYABLE",
		cause: nonRetryable,
	})
	expect(main).toHaveBeenCalledTimes(1)
})

it("retryDelay as number delays between retries", async ({ expect }) => {
	when(main).calledWith().thenResolve(ok)
	when(main, { times: 1 }).calledWith().thenReject(errorOk)
	using protectedFn = createCircuitBreaker(main, {
		retryDelay: 500,
		retryLimit: 3,
		minimumCandidates: 5,
	})

	const result = protectedFn()

	await vi.advanceTimersByTimeAsync(500)

	await expect(result).resolves.toBe(ok)
	expect(main).toHaveBeenCalledTimes(2)
})

it("retryDelay as function is called with attempt number", async ({
	expect,
}) => {
	when(main).calledWith().thenResolve(ok)
	when(main, { times: 2 }).calledWith().thenReject(errorOk)
	const retryDelay = vi.fn(() => delayMs(100))
	using protectedFn = createCircuitBreaker(main, {
		retryDelay,
		retryLimit: 5,
		minimumCandidates: 10,
	})

	const result = protectedFn()

	await vi.advanceTimersByTimeAsync(100)
	await vi.advanceTimersByTimeAsync(100)

	await expect(result).resolves.toBe(ok)
	expect(retryDelay).toHaveBeenCalledTimes(2)
	expect(retryDelay).toHaveBeenNthCalledWith(1, 1, expect.any(AbortSignal))
	expect(retryDelay).toHaveBeenNthCalledWith(2, 2, expect.any(AbortSignal))
})

it("uses fallback immediately if halfOpen call fails", async ({ expect }) => {
	when(main).calledWith().thenReject(errorOk)
	when(fallback).calledWith().thenResolve(fallbackOk)
	using protectedFn = createCircuitBreaker(main, {
		errorThreshold: 0.5,
		fallback,
		minimumCandidates: 5,
		resetAfter,
		retryLimit: 3,
	})

	// Open the circuit with two simultaneous requests that fail
	await expect(Promise.all([protectedFn(), protectedFn()])).resolves.toEqual([
		fallbackOk,
		fallbackOk,
	])
	expect(protectedFn.getState()).toBe("open")
	expect(main).toHaveBeenCalledTimes(6)
	expect(fallback).toHaveBeenCalledTimes(2)
	main.mockClear()
	fallback.mockClear()

	// Advance to half-open
	await vi.advanceTimersByTimeAsync(resetAfter)
	expect(protectedFn.getState()).toBe("halfOpen")

	// Trial call fails and fallback should immediately handle it without retrying
	await expect(protectedFn()).resolves.toBe(fallbackOk)
	expect(protectedFn.getState()).toBe("halfOpen")
	expect(main).toHaveBeenCalledTimes(1)
	expect(fallback).toHaveBeenCalledTimes(1)
})
