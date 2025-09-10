import { beforeEach, it, vi } from "vitest"
import { when } from "vitest-when"
import { createCircuitBreaker, EventMap } from "./index.js"

const ok = Symbol("ok")
const fallbackOk = Symbol("fallback")
const fallback = vi.fn().mockName("fallback")
const main = vi.fn().mockName("main")

beforeEach(() => {
	vi.useFakeTimers()
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
	when(main).calledWith("bad").thenReject(new Error("Bad call to main"))
	when(main).calledWith("good").thenResolve(ok)
	const protectedFn = createCircuitBreaker(main)

	let result: unknown = protectedFn("bad")

	await expect(result).rejects.toThrow("Bad call to main")
	expect(protectedFn.getState()).toBe("open")

	await expect(protectedFn()).rejects.toThrow("CircuitOpenError")

	await vi.advanceTimersByTimeAsync(30_000)

	expect(protectedFn.getState()).toBe("halfOpen")

	result = await protectedFn("good")

	expect(result).toBe(ok)
	expect(protectedFn.getState()).toBe("closed")
})

it("handles circuit lifecycle with fallback", async ({ expect }) => {
	when(main)
		.calledWith("arg1", "arg2")
		.thenReject(new Error("Bad call to main"))
	when(main).calledWith("good").thenResolve(ok)
	when(fallback).calledWith("arg1", "arg2").thenResolve(fallbackOk)
	const protectedFn = createCircuitBreaker(main, { fallback })

	let result: unknown = await protectedFn("arg1", "arg2")

	expect(result).toBe(fallbackOk)
	expect(protectedFn.getState()).toBe("open")

	await expect(protectedFn("arg1", "arg2")).resolves.toBe(fallbackOk)

	await vi.advanceTimersByTimeAsync(30_000)

	expect(protectedFn.getState()).toBe("halfOpen")

	result = await protectedFn("good")

	expect(result).toBe(ok)
	expect(protectedFn.getState()).toBe("closed")
})

it("ignores non-failure errors", async ({ expect }) => {
	const aborted = new DOMException("aborted")
	when(main).calledWith("bad").thenReject(aborted)
	const protectedFn = createCircuitBreaker(main, {
		errorIsFailure: (error) => {
			if (error === aborted) return false
			return true
		},
	})

	let result: unknown = protectedFn("bad")

	await expect(result).rejects.toThrow("aborted")
	expect(protectedFn.getState()).toBe("closed")
})

it("allows multiple failures before opening", async ({ expect }) => {
	const failureThreshold = 3
	when(main).calledWith().thenResolve(ok)
	when(main, { times: failureThreshold })
		.calledWith()
		.thenReject(new Error("Bad call to main"))
	when(fallback).calledWith().thenResolve(fallbackOk)
	const protectedFn = createCircuitBreaker(main, {
		failureThreshold,
		fallback,
		resetAfter: 90_000,
	})

	for (let attempt = 1; attempt < failureThreshold; attempt++)
		await expect(protectedFn()).resolves.toBe(fallbackOk)
	expect(protectedFn.getState()).toBe("closed")

	await expect(protectedFn()).resolves.toBe(fallbackOk)
	expect(protectedFn.getState()).toBe("open")

	await vi.advanceTimersByTimeAsync(90_000)

	expect(protectedFn.getState()).toBe("halfOpen")

	await expect(protectedFn()).resolves.toBe(ok)
})

it("emits events", async ({ expect }) => {
	const cause = new Error("Bad call to main")
	when(main).calledWith("bad").thenReject(cause)
	when(main).calledWith("good").thenResolve(ok)
	const emitted: [keyof EventMap, ...unknown[]][] = []
	const protectedFn = createCircuitBreaker(main)
	protectedFn.on("close", () => emitted.push(["close"]))
	protectedFn.on("open", (cause) => emitted.push(["open", cause]))
	protectedFn.on("reject", (cause) => emitted.push(["reject", cause]))
	protectedFn.on("resolve", () => emitted.push(["resolve"]))

	let result: unknown = protectedFn("bad")

	await expect(result).rejects.toThrow(`CircuitOpenError: ${cause.message}`)
	expect(emitted).toEqual([
		["reject", cause],
		["open", cause],
	])

	await expect(protectedFn()).rejects.toThrow(
		`CircuitOpenError: ${cause.message}`
	)

	await vi.advanceTimersByTimeAsync(30_000)

	result = await protectedFn("good")
	expect(emitted).toEqual([
		["reject", cause],
		["open", cause],
		["resolve"],
		["close"],
	])

	expect(result).toBe(ok)
})

it("frees memory", ({ expect }) => {
	const protectedFn = createCircuitBreaker(main)
	protectedFn.dispose()
	expect(protectedFn.getState()).toBe("disposed")
})
