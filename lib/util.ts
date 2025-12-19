export type AnyFn = (...args: never) => unknown

/**
 * Asserts that the given value is truthy. If not, throws a `TypeError`.
 */
export function assert(value: unknown, message?: string): asserts value {
	if (!value) throw new TypeError(message)
}

/**
 * `[TypeScript]` For exhaustive checks in switch statements or if/else. Add
 * this check to `default` case or final `else` to ensure all possible values
 * have been handled. If a new value is added to the type, TypeScript will
 * throw an error and the editor will underline the `value`.
 */
/* v8 ignore next -- @preserve */
export const assertNever = (val: never, msg = "Unexpected value"): never => {
	throw new TypeError(`${msg}: ${val as string}`)
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
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", onAbort))
	})
