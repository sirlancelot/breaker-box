import { beforeEach, describe, expect, it, vi } from "vitest"
import { useExponentialBackoff, useFibonacciBackoff } from "./backoff.js"

const errorOk = new Error("ok")

beforeEach(({ onTestFinished }) => {
	vi.useFakeTimers()

	onTestFinished(() => {
		vi.runAllTimers()
		expect(vi.getTimerCount()).toBe(0)
		vi.resetAllMocks()
	})
})

describe("useExponentialBackoff", () => {
	it.for([
		{ attempt: 2, expected: 1_000 },
		{ attempt: 3, expected: 2_000 },
		{ attempt: 4, expected: 4_000 },
		{ attempt: 5, expected: 8_000 },
		{ attempt: 6, expected: 16_000 },
		{ attempt: 7, expected: 32_000 },
		{ attempt: 8, expected: 64_000 },
		{ attempt: 9, expected: 128_000 },
		{ attempt: 10, expected: 256_000 },
	])(
		"$attempt waits for $expected ms",
		async ({ attempt, expected }, { expect }) => {
			const subject = useExponentialBackoff(Infinity)
			const result = subject(attempt)
			const now = Date.now()

			vi.advanceTimersToNextTimer()

			const elapsed = Date.now() - now
			expect(elapsed).toEqual(expected)
			await expect(result).resolves.toBeUndefined()
		},
	)

	it("caps at `maxSeconds`", async ({ expect }) => {
		const subject = useExponentialBackoff(42)
		const result = subject(10)
		const now = Date.now()

		vi.advanceTimersToNextTimer()

		const elapsed = Date.now() - now
		expect(elapsed).toEqual(42_000)
		await expect(result).resolves.toBeUndefined()
	})

	it("stops timer on abort signal", async ({ expect }) => {
		const subject = useExponentialBackoff(Infinity)
		const controller = new AbortController()

		const result = subject(10, controller.signal)
		controller.abort(errorOk)

		await expect(result).rejects.toThrow(errorOk)
	})
})

describe("useFibonacciBackoff", () => {
	it.for([
		{ attempt: 2, expected: 1_000 },
		{ attempt: 3, expected: 2_000 },
		{ attempt: 4, expected: 3_000 },
		{ attempt: 5, expected: 5_000 },
		{ attempt: 6, expected: 8_000 },
		{ attempt: 7, expected: 13_000 },
		{ attempt: 8, expected: 21_000 },
		{ attempt: 9, expected: 34_000 },
		{ attempt: 10, expected: 55_000 },
	])(
		"$attempt waits for $expected ms",
		async ({ attempt, expected }, { expect }) => {
			const subject = useFibonacciBackoff(Infinity)
			const result = subject(attempt)
			const now = Date.now()

			vi.advanceTimersToNextTimer()

			const elapsed = Date.now() - now
			expect(elapsed).toEqual(expected)
			await expect(result).resolves.toBeUndefined()
		},
	)

	it("caps at `maxSeconds`", async ({ expect }) => {
		const subject = useFibonacciBackoff(42)
		const result = subject(10)
		const now = Date.now()

		vi.advanceTimersToNextTimer()

		const elapsed = Date.now() - now
		expect(elapsed).toEqual(42_000)
		await expect(result).resolves.toBeUndefined()
	})

	it("stops timer on abort signal", async ({ expect }) => {
		const subject = useFibonacciBackoff(Infinity)
		const controller = new AbortController()

		const result = subject(10, controller.signal)
		controller.abort(errorOk)

		await expect(result).rejects.toThrow(errorOk)
	})
})
