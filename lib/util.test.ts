import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { delayMs } from "./util.js"

const errorOk = new Error("ok")

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	expect(vi.getTimerCount()).toBe(0)
	vi.resetAllMocks()
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
