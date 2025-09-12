import { afterEach, beforeEach, it, vi } from "vitest"
import { when } from "vitest-when"
import { createCircuitBreaker } from "./index.js"
import { delayMs } from "./util.js"

const errorOk = new Error("ok")
const ok = Symbol("ok")
const fallbackOk = Symbol("fallback")
const fallback = vi.fn().mockName("fallback")
const main = vi.fn().mockName("main")

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	vi.resetAllMocks()
})

it("operates transparently", async ({ expect }) => {
	when(main).calledWith("arg1", "arg2").thenResolve(ok)
	const protectedFn = createCircuitBreaker(main)

	expect(protectedFn.getState()).toBe("closed")
	const result = await protectedFn("arg1", "arg2")

	expect(result).toBe(ok)
	expect(protectedFn.getState()).toBe("closed")
})

it("handles circuit lifecycle", async ({ expect }) => {
	when(main).calledWith("bad").thenReject(errorOk)
	when(main).calledWith("good").thenResolve(ok)
	const protectedFn = createCircuitBreaker(main)

	const result = protectedFn("bad")

	await expect(result).rejects.toEqual(errorOk)
	expect(protectedFn.getState()).toBe("open")

	await expect(protectedFn()).rejects.toEqual(errorOk)
	expect(protectedFn.getLatestError()).toBe(errorOk)

	vi.advanceTimersByTime(30_000)

	expect(protectedFn.getState()).toBe("halfOpen")

	await expect(protectedFn("good")).resolves.toBe(ok)
	expect(protectedFn.getState()).toBe("closed")
})

it("handles circuit lifecycle with fallback", async ({ expect }) => {
	when(main).calledWith("arg1", "arg2").thenReject(new Error("Use fallback"))
	when(main).calledWith("good").thenResolve(ok)
	when(fallback).calledWith("arg1", "arg2").thenResolve(fallbackOk)
	const protectedFn = createCircuitBreaker(main, { fallback })

	const result = await protectedFn("arg1", "arg2")

	expect(result).toBe(fallbackOk)
	expect(protectedFn.getState()).toBe("open")

	await expect(protectedFn("arg1", "arg2")).resolves.toBe(fallbackOk)

	vi.advanceTimersByTime(30_000)

	expect(protectedFn.getState()).toBe("halfOpen")

	await expect(protectedFn("good")).resolves.toBe(ok)
	expect(protectedFn.getState()).toBe("closed")
})

it("ignores non-failure errors", async ({ expect }) => {
	const abortOk = new DOMException("aborted")
	const errorIsFailure = vi.fn((error) => {
		if (error === abortOk) return false
		return true
	}).mockName("errorIsFailure")
	when(main).calledWith("bad").thenReject(errorOk)
	when(main, { times: 1 }).calledWith("bad").thenReject(abortOk)
	const protectedFn = createCircuitBreaker(main, {
		errorIsFailure,
	})

	await expect(protectedFn("bad")).rejects.toThrow(errorOk)
	expect(protectedFn.getState()).toBe("open")
	expect(errorIsFailure).toHaveBeenCalledTimes(2)
	expect(errorIsFailure).nthCalledWith(1, abortOk)
	expect(errorIsFailure).nthCalledWith(2, errorOk)
})

it("allows multiple failures before opening", async ({ expect }) => {
	const failureThreshold = 3
	when(main).calledWith().thenResolve(ok)
	when(main, { times: failureThreshold + 1 })
		.calledWith()
		.thenReject(new Error("Use fallback"))

	when(fallback).calledWith().thenResolve(fallbackOk)
	const protectedFn = createCircuitBreaker(main, {
		failureThreshold,
		fallback,
		resetAfter: 90_000,
	})

	await expect(protectedFn()).resolves.toBe(fallbackOk)
	expect(protectedFn.getState()).toBe("open")
	expect(main).toHaveBeenCalledTimes(3)

	vi.advanceTimersByTime(90_000)
	expect(protectedFn.getState()).toBe("halfOpen")

	// Slams open immediately on first failure
	await expect(protectedFn()).resolves.toBe(fallbackOk)
	expect(protectedFn.getState()).toBe("open")

	vi.advanceTimersByTime(90_000)

	await expect(protectedFn()).resolves.toBe(ok)
})

it("emits events", async ({ expect }) => {
	when(main).calledWith("bad").thenReject(errorOk)
	when(main).calledWith("good").thenResolve(ok)
	const emitted: ["close" | "open", ...unknown[]][] = []
	const protectedFn = createCircuitBreaker(main, {
		onClose: () => emitted.push(["close"]),
		onOpen: (cause) => emitted.push(["open", cause]),
	})

	let result: unknown = protectedFn("bad")

	await expect(result).rejects.toThrow(errorOk)
	expect(emitted).toEqual([["open", errorOk]])

	await expect(protectedFn()).rejects.toThrow(errorOk)

	vi.advanceTimersByTime(30_000)

	result = await protectedFn("good")
	expect(emitted).toEqual([["open", errorOk], ["close"]])

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
	let protectedFn = createCircuitBreaker(main)

	await expect(protectedFn("initial")).rejects.toThrow(errorOk)
	vi.advanceTimersByTime(30_000)
	expect(protectedFn.getState()).toBe("halfOpen")

	when(main)
		.calledWith("good")
		.thenReturn(delayMs(1).then(() => ok))

	let result = protectedFn("good")
	protectedFn.dispose()

	vi.advanceTimersByTime(1)
	await expect(result).resolves.toBe(ok)

	// half-open reject
	protectedFn = createCircuitBreaker(main)

	await expect(protectedFn("initial")).rejects.toThrow(errorOk)
	vi.advanceTimersByTime(30_000)
	expect(protectedFn.getState()).toBe("halfOpen")

	when(main)
		.calledWith("bad")
		.thenReturn(delayMs(1).then(() => Promise.reject(errorOk)))

	result = protectedFn("bad")
	protectedFn.dispose()

	vi.advanceTimersByTime(1)
	await expect(result).rejects.toThrow(errorOk)
})
