export type AnyFn = (...args: any[]) => any

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

const resolvedPromise = Promise.resolve()

export const nextTick = <T>(fn: () => T | PromiseLike<T>): Promise<T> =>
	resolvedPromise.then(fn)
