import { afterEach, beforeEach, expect, it, vi } from "vitest"
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

	vi.advanceTimersByTime(10_000) // `errorWindow`
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

	const result = protectedFn("arg1", "arg2")

	await expect(result).resolves.toBe(fallbackOk)
	expect(protectedFn.getState()).toBe("open")

	await expect(protectedFn("arg1", "arg2")).resolves.toBe(fallbackOk)

	vi.advanceTimersByTime(30_000)
	expect(protectedFn.getState()).toBe("halfOpen")

	// Slams open again if half-open fails
	await expect(protectedFn("arg1", "arg2")).resolves.toBe(fallbackOk)
	expect(protectedFn.getState()).toBe("open")

	vi.advanceTimersByTime(30_000)
	expect(protectedFn.getState()).toBe("halfOpen")

	await expect(protectedFn("good")).resolves.toBe(ok)
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
	})

	const result = Promise.allSettled([protectedFn("bad"), protectedFn("bad")])

	await expect(result).resolves.toEqual([
		{ status: "rejected", reason: abortOk },
		{ status: "rejected", reason: errorOk },
	])
	expect(protectedFn.getState()).toBe("open")
	expect(errorIsFailure).toHaveBeenCalled()
	expect(errorIsFailure.mock.calls).toEqual([
		[abortOk],
		[errorOk],
		[errorOk],
		[errorOk],
		[errorOk],
		[errorOk],
		[errorOk],
	])

	vi.advanceTimersByTime(30_000) // `resetAfter`
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
	async function createHalfOpenState() {
		const protectedFn = createCircuitBreaker(main)

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
