import { beforeEach, describe, expect, it, vi } from "vitest"
import { when } from "vitest-when"
import { withTimeout } from "./timeout.js"

const errorOk = new Error("ok")
const ok = Symbol("ok")
const main = Object.assign(vi.fn().mockName("main"), {
	[Symbol.dispose]: vi.fn().mockName("dispose"),
})

beforeEach(({ onTestFinished }) => {
	vi.useFakeTimers()

	onTestFinished(() => {
		vi.runAllTimers()
		expect(vi.getTimerCount()).toBe(0)
		vi.resetAllMocks()
	})
})

describe("withTimeout", () => {
	it("resolves if main completes before timeout", async ({ expect }) => {
		when(main).calledWith().thenResolve(ok)
		const subject = withTimeout(main, 30_000)

		const result = subject()

		await expect(result).resolves.toBe(ok)
	})

	it("rejects if main rejects before timeout", async ({ expect }) => {
		when(main).calledWith().thenReject(errorOk)
		const subject = withTimeout(main, 30_000)

		const result = subject()

		await expect(result).rejects.toThrow(errorOk)
	})

	it("rejects if main exceeds timeout", async ({ expect }) => {
		const never = new Promise<never>(() => {})
		when(main).calledWith().thenReturn(never)
		const timeoutMs = 30_000
		const subject = withTimeout(main, timeoutMs)

		const result = subject()
		const now = Date.now()

		vi.advanceTimersToNextTimer()

		const elapsed = Date.now() - now
		expect(elapsed).toEqual(timeoutMs)
		await expect(result).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: ERR_CIRCUIT_BREAKER_TIMEOUT]`,
		)
	})

	it("handles dispose", async ({ expect }) => {
		const never = new Promise<never>(() => {})
		when(main).calledWith().thenReturn(never)
		const subject = withTimeout(main, 30_000)

		const result = subject()

		subject[Symbol.dispose]()

		await expect(result).rejects.toThrowError("This operation was aborted")
	})
})
