import type { CircuitBreakerOptions } from "./types.js"
import type { AnyFn } from "./util.js"

function assert(value: unknown, message?: string): asserts value {
	if (!value) throw new TypeError(message)
}

export function parseOptions<Fallback extends AnyFn>(
	options: CircuitBreakerOptions<Fallback>,
) {
	const {
		errorIsFailure = () => false,
		errorThreshold = 0,
		errorWindow = 10_000,
		minimumCandidates = 6,
		onClose,
		onOpen,
		resetAfter = 30_000,
		retryDelay = () => undefined,
	} = options

	// errorIsFailure
	assert(
		typeof errorIsFailure === "function",
		`"errorIsFailure" must be a function (received ${typeof errorIsFailure})`,
	)

	// errorThreshold
	assert(
		errorThreshold >= 0 && errorThreshold <= 1,
		`"errorThreshold" must be a number between 0 and 1 (received ${errorThreshold})`,
	)

	// errorWindow
	assert(
		errorWindow > 0,
		`"errorWindow" must be milliseconds greater than 0 (received ${errorWindow})`,
	)

	// minimumCandidates
	assert(
		minimumCandidates > 1,
		`"minimumCandidates" must be a number greater than 1 (received ${minimumCandidates})`,
	)

	// (optional) onClose
	if (onClose)
		assert(
			typeof onClose === "function",
			`"onClose" must be a function (received ${typeof onClose})`,
		)

	// (optional) onOpen
	if (onOpen)
		assert(
			typeof onOpen === "function",
			`"onOpen" must be a function (received ${typeof onOpen})`,
		)

	// resetAfter
	assert(
		resetAfter > 0,
		`"resetAfter" must be milliseconds greater than 0 (received ${resetAfter})`,
	)
	assert(
		resetAfter >= errorWindow,
		`"resetAfter" must be milliseconds greater than or equal to "errorWindow" (received ${resetAfter})`,
	)

	// retryDelay
	assert(
		typeof retryDelay === "function",
		`"retryDelay" must be a function (received ${typeof retryDelay})`,
	)

	return {
		errorIsFailure,
		errorThreshold,
		errorWindow,
		minimumCandidates,
		onClose,
		onOpen,
		resetAfter,
		retryDelay,
	}
}
