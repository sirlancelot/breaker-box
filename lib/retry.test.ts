import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { when } from "vitest-when"
import { useExponentialBackoff } from "./backoff.js"
import { withRetry } from "./retry.js"

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

describe("withRetry", () => {
	it("resolves on first attempt if successful", async ({ expect }) => {
		when(main).calledWith().thenResolve(ok)
		const subject = withRetry(main)

		const result = await subject()

		expect(result).toBe(ok)
		expect(main).toHaveBeenCalledTimes(1)
	})

	it("retries on failure up to `maxAttempts`", async ({ expect }) => {
		const maxAttempts = 3
		when(main).calledWith().thenResolve(ok)
		when(main, { times: maxAttempts - 1 })
			.calledWith()
			.thenReject(errorOk)
		const subject = withRetry(main, { maxAttempts })

		const result = await subject()

		expect(result).toBe(ok)
		expect(main).toHaveBeenCalledTimes(maxAttempts)
	})

	it("throws after exhausting retries", async ({ expect }) => {
		const maxAttempts = 5
		when(main).calledWith().thenReject(errorOk)
		const subject = withRetry(main, { maxAttempts })

		const result = subject()

		await expect(result).rejects.toMatchObject({
			message: `ERR_CIRCUIT_BREAKER_MAX_ATTEMPTS (${maxAttempts})`,
			cause: errorOk,
		})
		expect(main).toHaveBeenCalledTimes(maxAttempts)
	})

	it("throws when `shouldRetry` returns `false`", async ({ expect }) => {
		const nonRetryable = new Error("non-retryable")
		const shouldRetry = vi.fn((err: unknown) => err !== nonRetryable)
		when(main).calledWith().thenReject(nonRetryable)
		const subject = withRetry(main, { shouldRetry })

		const result = subject()

		await expect(result).rejects.toBe(nonRetryable)
		expect(main).toHaveBeenCalledTimes(1)
		expect(shouldRetry).toHaveBeenCalledWith(nonRetryable, 1)
	})

	it("uses `retryDelay` between attempts", async ({ expect }) => {
		when(main).calledWith().thenResolve(ok)
		when(main, { times: 2 }).calledWith().thenReject(errorOk)
		const retryDelay = useExponentialBackoff(30)
		const subject = withRetry(main, { maxAttempts: 3, retryDelay })

		const result = subject()

		await vi.advanceTimersByTimeAsync(0)
		expect(main).toHaveBeenCalledTimes(1)

		await vi.advanceTimersByTimeAsync(1_000)
		expect(main).toHaveBeenCalledTimes(2)

		await vi.advanceTimersByTimeAsync(2_000)
		expect(main).toHaveBeenCalledTimes(3)

		await expect(result).resolves.toBe(ok)
	})
})
