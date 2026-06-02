import { beforeEach, describe, expect, it, vi } from "vitest"
import { abortable, delayMs, promiseTry } from "./util.js"

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

describe("promiseTry", () => {
	it("resolves with the return value", async ({ expect }) => {
		await expect(promiseTry(() => 42)).resolves.toBe(42)
	})

	it("rejects when the function throws synchronously", async ({ expect }) => {
		await expect(
			promiseTry(() => {
				throw errorOk
			}),
		).rejects.toThrow(errorOk)
	})
})
