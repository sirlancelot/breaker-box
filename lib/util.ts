export type AnyFn = (...args: any[]) => any

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
/* v8 ignore next 3 */
export const assertNever = (val: never, msg = "Unexpected value") => {
	throw new TypeError(`${msg}: ${val}`)
}

/**
 * Returns a promise that resolves after the specified number of milliseconds.
 */
export const delayMs = (ms: number): Promise<void> =>
	new Promise((next) => setTimeout(next, ms))

/**
 * Rejects the given promise when the abort signal is triggered.
 */
export const rejectOnAbort = <T extends Promise<unknown> | undefined>(
	signal: AbortSignal,
	pending: T,
): Promise<Awaited<T>> => {
	let teardown: () => void
	return Promise.race([
		Promise.resolve(pending).finally(() => {
			signal.removeEventListener("abort", teardown)
		}),
		new Promise<never>((_, reject) => {
			teardown = () => reject(signal.reason)
			signal.addEventListener("abort", teardown, { once: true })
		}),
	])
}
