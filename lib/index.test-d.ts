import { expectTypeOf, it } from "vitest"
import { createCircuitBreaker } from "./index.js"
import type { CircuitBreakerProtectedFn } from "./types.js"

it("handles no arguments", () => {
	const noArgs = () => Promise.resolve("result" as const)
	const protectedNoArgs = createCircuitBreaker(noArgs)

	expectTypeOf(protectedNoArgs).toEqualTypeOf<
		CircuitBreakerProtectedFn<"result", []>
	>()

	expectTypeOf(protectedNoArgs).returns.toEqualTypeOf<Promise<"result">>()
	expectTypeOf(protectedNoArgs.dispose).toBeFunction()
	expectTypeOf(protectedNoArgs.getState).returns.toEqualTypeOf<
		"closed" | "open" | "halfOpen"
	>()
	expectTypeOf(protectedNoArgs.getFailureRate).returns.toEqualTypeOf<number>()
	expectTypeOf(protectedNoArgs.getLatestError).returns.toEqualTypeOf<unknown>()
})

it("handles multiple arguments", () => {
	const multipleArgs = (_x: number, _y: string, _z: boolean) =>
		Promise.resolve(["result", "tuple"] as const)
	const protectedMultipleArgs = createCircuitBreaker(multipleArgs)

	expectTypeOf(protectedMultipleArgs).toEqualTypeOf<
		CircuitBreakerProtectedFn<
			readonly ["result", "tuple"],
			[x: number, y: string, z: boolean]
		>
	>()

	expectTypeOf(protectedMultipleArgs).parameter(0).toEqualTypeOf<number>()
	expectTypeOf(protectedMultipleArgs).parameter(1).toEqualTypeOf<string>()
	expectTypeOf(protectedMultipleArgs).parameter(2).toEqualTypeOf<boolean>()
	expectTypeOf(protectedMultipleArgs).returns.toEqualTypeOf<
		Promise<readonly ["result", "tuple"]>
	>()
})

it("forces fallback to match main", () => {
	const complete = (_x: number, _y: string, _z: boolean) =>
		Promise.resolve("ok" as const)

	const protectedComplete = createCircuitBreaker(complete, {
		errorIsFailure: (err) => err instanceof TypeError,
		errorThreshold: 0.5,
		errorWindow: 1000,
		fallback: (x, y, z) => {
			expectTypeOf(x).toEqualTypeOf<number>()
			expectTypeOf(y).toEqualTypeOf<string>()
			expectTypeOf(z).toEqualTypeOf<boolean>()
			return Promise.resolve("ok" as const)
		},
		minimumCandidates: 10,
		onClose: () => {},
		onHalfOpen: () => {},
		onOpen: (cause) => expectTypeOf(cause).toEqualTypeOf<unknown>(),
		resetAfter: 5000,
	})

	expectTypeOf(protectedComplete).toEqualTypeOf<
		CircuitBreakerProtectedFn<"ok", [number, string, boolean]>
	>()
})
