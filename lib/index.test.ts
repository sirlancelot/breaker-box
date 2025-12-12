import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { when } from "vitest-when"
import { createCircuitBreaker } from "./index.js"
import { delayMs } from "./util.js"
import { disposeKey } from "./types.js"

const errorOk = new Error("ok")
const ok = Symbol("ok")
const fallbackOk = Symbol("fallback")
const fallback = vi.fn().mockName("fallback")
const main = Object.assign(vi.fn().mockName("main"), {
	[disposeKey]: vi.fn().mockName("dispose"),
})

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	expect(vi.getTimerCount()).toBe(0)
	vi.resetAllMocks()
})

it("operates transparently", async ({ expect }) => {
	when(main).calledWith("arg1", "arg2").thenResolve(ok)
	const protectedFn = createCircuitBreaker(main)

	expect(protectedFn.getState()).toBe("closed")
	const result = await protectedFn("arg1", "arg2")

	expect(result).toBe(ok)
	expect(protectedFn.getState()).toBe("closed")
	expect(protectedFn.getFailureRate()).toBe(0)

	vi.advanceTimersByTime(10_000) // `errorWindow`
})

it("handles circuit lifecycle", async ({ expect }) => {
	when(main).calledWith("bad").thenReject(errorOk)
	when(main).calledWith("good").thenResolve(ok)
	const protectedFn = createCircuitBreaker(main, { minimumCandidates: 1 })

	// First error opens circuit (minimumCandidates=1, errorThreshold=0)
	await expect(protectedFn("bad")).rejects.toEqual(errorOk)
	expect(protectedFn.getState()).toBe("open")

	// Circuit is open, subsequent calls fail with latest error
	await expect(protectedFn()).rejects.toEqual(errorOk)
	expect(protectedFn.getLatestError()).toBe(errorOk)

	vi.advanceTimersByTime(30_000) // resetAfter

	expect(protectedFn.getState()).toBe("halfOpen")

	// Half-open trial succeeds, circuit closes
	await expect(protectedFn("good")).resolves.toBe(ok)
	expect(protectedFn.getState()).toBe("closed")
})

it("handles circuit lifecycle with fallback", async ({ expect }) => {
	when(main).calledWith("arg1", "arg2").thenReject(new Error("Use fallback"))
	when(main).calledWith("good").thenResolve(ok)
	when(fallback).calledWith("arg1", "arg2").thenResolve(fallbackOk)
	const protectedFn = createCircuitBreaker(main, {
		fallback,
		minimumCandidates: 1,
	})

	// First call fails and opens circuit
	await expect(protectedFn("arg1", "arg2")).resolves.toBe(fallbackOk)
	expect(main).toBeCalledTimes(1)
	expect(protectedFn.getState()).toBe("open")

	// Circuit is open, use fallback
	await expect(protectedFn("arg1", "arg2")).resolves.toBe(fallbackOk)
	expect(main).toBeCalledTimes(1)

	vi.advanceTimersByTime(30_000) // resetAfter
	expect(protectedFn.getState()).toBe("halfOpen")

	// Half-open trial fails, circuit slams open again
	await expect(protectedFn("arg1", "arg2")).resolves.toBe(fallbackOk)
	expect(main).toBeCalledTimes(2)
	expect(protectedFn.getState()).toBe("open")

	vi.advanceTimersByTime(30_000) // resetAfter
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
	const protectedFn = createCircuitBreaker(main, {
		errorIsFailure,
		minimumCandidates: 1,
	})

	// First call gets non-retryable failure, doesn't add to history
	// Second call gets retryable error, opens circuit
	const result = Promise.allSettled([protectedFn("bad"), protectedFn("bad")])

	await expect(result).resolves.toEqual([
		{ status: "rejected", reason: abortOk },
		{ status: "rejected", reason: errorOk },
	])
	expect(protectedFn.getState()).toBe("open")
	expect(errorIsFailure).toHaveBeenCalled()
	expect(errorIsFailure.mock.calls).toEqual([[abortOk], [errorOk]])

	vi.advanceTimersByTime(30_000) // `resetAfter`
})

it("emits events", async ({ expect }) => {
	when(main).calledWith("bad").thenReject(errorOk)
	when(main).calledWith("good").thenResolve(ok)
	const emitted: ["close" | "open" | "halfOpen", ...unknown[]][] = []
	const protectedFn = createCircuitBreaker(main, {
		minimumCandidates: 1,
		onClose: () => emitted.push(["close"]),
		onHalfOpen: () => emitted.push(["halfOpen"]),
		onOpen: (cause) => emitted.push(["open", cause]),
	})

	let result: unknown = protectedFn("bad")

	await expect(result).rejects.toThrow(errorOk)
	vi.advanceTimersToNextTimer()
	expect(emitted).toEqual([["open", errorOk]])

	await expect(protectedFn()).rejects.toThrow(errorOk)

	vi.advanceTimersByTime(30_000) // resetAfter

	result = await protectedFn("good")
	vi.advanceTimersToNextTimer()
	vi.advanceTimersToNextTimer()
	expect(emitted).toEqual([["open", errorOk], ["halfOpen"], ["close"]])

	expect(result).toBe(ok)
})

it("handles shutdown", async ({ expect }) => {
	const protectedFn = createCircuitBreaker(main)
	protectedFn.dispose()
	expect(protectedFn.getState()).toBe("open")

	await expect(protectedFn()).rejects.toThrow("ERR_CIRCUIT_BREAKER_DISPOSED")
})

it("handles inflight requests after shutdown", async ({ expect }) => {
	// Inflight calls should resolve or reject as normal
	when(main)
		.calledWith("good")
		.thenReturn(delayMs(1).then(() => ok))
	let protectedFn = createCircuitBreaker(main)

	let result = protectedFn("good")
	protectedFn.dispose()

	vi.advanceTimersByTime(1)
	await expect(result).resolves.toBe(ok)

	// Reject
	when(main)
		.calledWith("bad")
		.thenReturn(delayMs(1).then(() => Promise.reject(errorOk)))
	protectedFn = createCircuitBreaker(main)

	result = protectedFn("bad")
	protectedFn.dispose()

	vi.advanceTimersByTime(1)
	await expect(result).rejects.toThrow(errorOk)
})

it("handles half-open requests after shutdown", async ({ expect }) => {
	// The half-open call should resolve or reject as normal
	when(main).calledWith("initial").thenReject(errorOk)
	async function createHalfOpenState() {
		const protectedFn = createCircuitBreaker(main, { minimumCandidates: 1 })

		const result = protectedFn("initial")

		await expect(result).rejects.toThrow(errorOk)

		vi.advanceTimersByTime(30_000)

		expect(protectedFn.getState()).toBe("halfOpen")

		return protectedFn
	}
	let protectedFn = await createHalfOpenState()

	when(main)
		.calledWith("good")
		.thenReturn(delayMs(1).then(() => ok))

	let result = protectedFn("good")
	protectedFn.dispose()

	vi.advanceTimersByTime(1)
	await expect(result).resolves.toBe(ok)

	// half-open reject
	protectedFn = await createHalfOpenState()

	when(main)
		.calledWith("bad")
		.thenReturn(delayMs(1).then(() => Promise.reject(errorOk)))

	result = protectedFn("bad")
	protectedFn.dispose()

	vi.advanceTimersByTime(1)
	await expect(result).rejects.toThrow(errorOk)
})

it("handles concurrent calls in half-open state", async ({ expect }) => {
	when(main).calledWith("initial").thenReject(errorOk)
	when(main).calledWith("good").thenResolve(ok)
	when(fallback).calledWith("initial").thenResolve(fallbackOk)
	when(fallback).calledWith().thenResolve(fallbackOk)
	const protectedFn = createCircuitBreaker(main, {
		fallback,
		minimumCandidates: 1,
	})

	await expect(protectedFn("initial")).resolves.toBe(fallbackOk)
	expect(protectedFn.getState()).toBe("open")

	vi.advanceTimersByTime(30_000)
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

	vi.advanceTimersByTime(10_000)
})
