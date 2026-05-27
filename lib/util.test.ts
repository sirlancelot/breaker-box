import { beforeEach, describe, expect, it, vi } from "vitest"
import { CircuitError, abortable, delayMs, shouldContinue } from "./util.js"

const errorOk = new Error("ok")

beforeEach(({ onTestFinished }) => {
	vi.useFakeTimers()

	onTestFinished(() => {
		vi.runAllTimers()
		expect(vi.getTimerCount()).toBe(0)
		vi.resetAllMocks()
	})
})

describe("abortable", () => {
	it("resolves with the value of the pending promise", async ({ expect }) => {
		const controller = new AbortController()
		const result = abortable(controller.signal, Promise.resolve(42))
		await expect(result).resolves.toBe(42)
	})

	it("rejects when the signal is aborted before the promise settles", async ({
		expect,
	}) => {
		const controller = new AbortController()
		const pending = new Promise(() => {})
		const result = abortable(controller.signal, pending)
		controller.abort(errorOk)
		await expect(result).rejects.toThrow(errorOk)
	})

	it("throws immediately if the signal is already aborted", async ({
		expect,
	}) => {
		const controller = new AbortController()
		controller.abort(errorOk)
		await expect(
			abortable(controller.signal, Promise.resolve(1)),
		).rejects.toThrow(errorOk)
	})

	it("rejects when the pending promise rejects", async ({ expect }) => {
		const controller = new AbortController()
		const result = abortable(controller.signal, Promise.reject(errorOk))
		await expect(result).rejects.toThrow(errorOk)
	})

	it("removes the abort listener after the promise settles", async ({
		expect,
	}) => {
		const controller = new AbortController()
		const spy = vi.spyOn(controller.signal, "removeEventListener")
		await abortable(controller.signal, Promise.resolve(1))
		expect(spy).toHaveBeenCalledWith("abort", expect.any(Function))
	})
})

describe("delayMs", () => {
	it.for([
		{ ms: -1, desc: "negative" },
		{ ms: NaN, desc: "NaN" },
		{ ms: Infinity, desc: "Infinity" },
		{ ms: -Infinity, desc: "-Infinity" },
	])("rejects $desc values", ({ ms }, { expect }) => {
		expect(() => delayMs(ms)).toThrow(RangeError)
	})

	it("resolves after specified delay", async ({ expect }) => {
		const result = delayMs(1_000)
		vi.advanceTimersByTime(1_000)
		await expect(result).resolves.toBeUndefined()
	})

	it("rejects when signal is aborted", async ({ expect }) => {
		const controller = new AbortController()
		const result = delayMs(1_000, controller.signal)
		controller.abort(errorOk)
		await expect(result).rejects.toThrow(errorOk)
	})
})

describe("shouldContinue", () => {
	const defaults = {
		lastError: new CircuitError("CALL_FAILURE", { cause: new Error("fail") }),
		retryDelay: 0,
		retryLimit: 3,
		retryTest: () => true,
		signal: new AbortController().signal,
	}

	it("returns true when retries < retryLimit and retryTest passes", async ({
		expect,
	}) => {
		const result = shouldContinue({ ...defaults, retries: 1 })
		await expect(result).resolves.toBe(true)
	})

	it("throws lastError when retries >= retryLimit", async ({ expect }) => {
		const error = new Error("limit reached")

		await expect(
			shouldContinue({
				...defaults,
				retries: 3,
				retryLimit: 3,
				lastError: error,
			}),
		).rejects.toMatchObject({
			message: "ERR_CIRCUIT_BREAKER_MAX_RETRIES",
			cause: error,
		})
	})

	it("throws lastError when retryTest returns false", async ({ expect }) => {
		const lastError = new Error("ok")

		await expect(
			shouldContinue({
				...defaults,
				retries: 0,
				lastError,
				retryTest: () => false,
			}),
		).rejects.toMatchObject({
			message: "ERR_CIRCUIT_BREAKER_NON_RETRYABLE",
			cause: lastError,
		})
	})

	it("passes the cause to retryTest", async ({ expect }) => {
		const lastError = new TypeError("original")
		const retryTest = vi.fn(() => true)

		await shouldContinue({ ...defaults, retries: 0, lastError, retryTest })

		expect(retryTest).toHaveBeenCalledWith(lastError)
	})

	it("delays with numeric retryDelay", async ({ expect }) => {
		const controller = new AbortController()
		const result = shouldContinue({
			...defaults,
			retries: 0,
			retryDelay: 500,
			signal: controller.signal,
		})
		vi.advanceTimersByTime(500)
		await expect(result).resolves.toBe(true)
	})

	it("delays with function retryDelay", async ({ expect }) => {
		const controller = new AbortController()
		const retryDelay = vi.fn((_attempt: number, signal?: AbortSignal) =>
			delayMs(100, signal),
		)
		const result = shouldContinue({
			...defaults,
			retries: 2,
			retryDelay,
			signal: controller.signal,
		})
		vi.advanceTimersByTime(100)
		await expect(result).resolves.toBe(true)
		expect(retryDelay).toHaveBeenCalledWith(2, controller.signal)
	})

	it("continues when signal is aborted", async ({ expect }) => {
		const controller = new AbortController()
		const result = shouldContinue({
			...defaults,
			retries: 0,
			retryDelay: 500,
			signal: controller.signal,
		})
		controller.abort(errorOk)
		await expect(result).resolves.toBe(true)
	})
})
