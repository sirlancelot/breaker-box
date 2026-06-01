
/**
 * Returns a promise which rejects when the abort signal is triggered or
 * resolves when the promise is fulfilled.
 */
export const abortable = <T>(
	signal: AbortSignal,
	pending: PromiseLike<T>,
): Promise<T> =>
	new Promise((resolve, reject) => {
		signal.throwIfAborted()

		const onAbort = () => reject(signal.reason)
		signal.addEventListener("abort", onAbort, { once: true })

		Promise.resolve(pending)
			.finally(() => signal.removeEventListener("abort", onAbort))
			.then(resolve, reject)
	})

/**
 * Asserts that the given value is truthy. If not, throws a `TypeError`.
 */
export function assert(value: unknown, message?: string): asserts value {
	if (!value) throw new TypeError(message)
}

/**
 * Returns a promise that resolves after the specified number of milliseconds.
 */
export const delayMs = (ms: number, signal?: AbortSignal): Promise<void> => {
	if (!Number.isFinite(ms) || ms < 0) {
		throw new RangeError(
			`"ms" must be a finite, non-negative number (received ${ms})`,
		)
	}

	return signal
		? new Promise((resolve, reject) => {
				signal.throwIfAborted()

				const timer = setTimeout(() => {
					signal.removeEventListener("abort", onAbort)
					resolve()
				}, ms)

				const onAbort = () => {
					clearTimeout(timer)
					reject(signal.reason)
				}

				signal.addEventListener("abort", onAbort, { once: true })
			})
		: new Promise((next) => setTimeout(next, ms))
}

export const noop: (...args: unknown[]) => void = () => {}

/**
 * Polyfill for `Promise.try()`
 */
export function promiseTry<T>(fn: () => T): Promise<T> {
	try {
		return Promise.resolve(fn())
	} catch (error) {
		return Promise.reject(error)
	}
}


