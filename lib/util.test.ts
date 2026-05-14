import { beforeEach, describe, expect, it, vi } from "vitest"
import { abortable, delayMs, shouldRetry } from "./util.js"

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

describe("shouldRetry", () => {
	const defaults = {
		lastError: new Error("fail"),
		retryDelay: 0,
		retryLimit: 3,
		retryTest: () => true,
		signal: new AbortController().signal,
	}

	it("returns true when retries < retryLimit and retryTest passes", async ({
		expect,
	}) => {
		const result = shouldRetry({ ...defaults, retries: 1 })
		await expect(result).resolves.toBe(true)
	})

	it("throws lastError when retries >= retryLimit", async ({ expect }) => {
		const error = new Error("limit reached")
		await expect(
			shouldRetry({ ...defaults, retries: 3, retryLimit: 3, lastError: error }),
		).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: limit reached]`)
	})

	it("throws lastError when retryTest returns false", async ({ expect }) => {
		const error = new Error("not retryable")
		await expect(
			shouldRetry({
				...defaults,
				retries: 0,
				lastError: error,
				retryTest: () => false,
			}),
		).rejects.toThrowErrorMatchingInlineSnapshot(`[Error: not retryable]`)
	})

	it("delays with numeric retryDelay", async ({ expect }) => {
		const controller = new AbortController()
		const result = shouldRetry({
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
		const result = shouldRetry({
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
		const result = shouldRetry({
			...defaults,
			retries: 0,
			retryDelay: 500,
			signal: controller.signal,
		})
		controller.abort(errorOk)
		await expect(result).resolves.toBe(true)
	})
})
