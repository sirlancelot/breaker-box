import { type MainFn } from "./types.js"
import { abortable, createDisposable, disposeKey } from "./util.js"

/**
 * Wraps an async function with a timeout constraint. Rejects with an Error if
 * execution exceeds the specified timeout.
 *
 * @example
 * ```ts
 * const fetchWithTimeout = withTimeout(fetchData, 5000, "Fetch timed out")
 * try {
 *   const data = await fetchWithTimeout(url)
 * } catch (error) {
 *   console.error(error.message) // "Fetch timed out" after 5 seconds
 * }
 * ```
 */
export function withTimeout<Ret, Args extends readonly unknown[]>(
	main: MainFn<Ret, Args>,
	timeoutMs: number,
	timeoutMessage = "ERR_CIRCUIT_BREAKER_TIMEOUT",
): MainFn<Ret, Args> {
	const error = new Error(timeoutMessage)
	const controller = new AbortController()
	const { signal } = controller

	function withTimeoutFunction(...args: Args): Promise<Ret> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(reject, timeoutMs, error)

			abortable(signal, main(...args))
				.then(resolve, reject)
				.finally(() => clearTimeout(timer))
		})
	}

	return Object.assign(withTimeoutFunction, {
		[disposeKey]: createDisposable(main, controller),
	})
}
