import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { when } from "vitest-when"
import {
	useExponentialBackoff,
	useFibonacciBackoff,
	withTimeout,
} from "./helpers.js"

const errorOk = new Error("ok")
const ok = Symbol("ok")
const main = vi.fn().mockName("main")

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	expect(vi.getTimerCount()).toBe(0)
	vi.resetAllMocks()
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
})
