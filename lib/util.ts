export type AnyFn = (...args: any[]) => any

/**
 * `[TypeScript]` For exhaustive checks in switch statements or if/else. Add
 * this check to `default` case or final `else` to ensure all possible values
 * have been handled. If a new value is added to the type, TypeScript will
 * throw an error and the editor will underline the `value`.
 */
/* v8 ignore next 2 */
export const assertNever = (val: never, msg = "Unexpected value") =>
	new TypeError(`${msg}: ${val}`)
