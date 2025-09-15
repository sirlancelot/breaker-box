import type { MainFn } from "./types.js"
import { delayMs } from "./util.js"

/**
 * Returns a function which implements exponential backoff.
 *
 * @param maxSeconds - The maximum number of seconds to wait before retrying.
 * @returns A function which takes an `attempt` number and returns a promise
 * that resolves after the calculated delay.
 */
export function useExponentialBackoff(maxSeconds: number) {
	return function exponentialBackoff(attempt: number) {
		const num = Math.max(attempt - 2, 0)
		const delay = Math.min(2 ** num, maxSeconds)
		return delayMs(delay * 1_000)
	}
}

const sqrt5 = /* @__PURE__ */ Math.sqrt(5)
/**
 * @see https://en.wikipedia.org/wiki/Fibonacci_sequence#Closed-form_expression
 */
const binet = (n: number) =>
	Math.round(((1 + sqrt5) ** n - (1 - sqrt5) ** n) / (2 ** n * sqrt5))

/**
 * Returns a function which implements Fibonacci backoff.
 *
 * @param maxSeconds - The maximum number of seconds to wait before retrying.
 * @returns A function which takes an `attempt` number and returns a promise
 * that resolves after the calculated delay.
 */
export function useFibonacciBackoff(maxSeconds: number) {
	return function fibonacciBackoff(attempt: number) {
		const delay = Math.min(binet(attempt), maxSeconds)
		return delayMs(delay * 1_000)
	}
}

/**
 * Wrap a function with a timeout. If execution of `main` exceeds `timeoutMs`,
 * then the call is rejected with `new Error(timeoutMessage)`.
 */
export function withTimeout<Ret, Args extends unknown[]>(
	main: MainFn<Ret, Args>,
	timeoutMs: number,
	timeoutMessage = "ERR_CIRCUIT_BREAKER_TIMEOUT",
): MainFn<Ret, Args> {
	const error = new Error(timeoutMessage)

	return function withTimeoutFunction(...args) {
		let timer: NodeJS.Timeout
		return Promise.race([
			main(...args).finally(() => clearTimeout(timer)),
			new Promise<never>((_, reject) => {
				timer = setTimeout(reject, timeoutMs, error)
			}),
		])
	}
}
