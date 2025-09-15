import type { CircuitBreakerOptions } from "./types.js"
import { assert, type AnyFn } from "./util.js"

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
		`"errorThreshold" must be between 0 and 1 (received ${errorThreshold})`,
	)

	// errorWindow
	assert(
		errorWindow >= 1_000,
		`"errorWindow" must be milliseconds of at least 1 second (received ${errorWindow})`,
	)

	// minimumCandidates
	assert(
		minimumCandidates >= 1,
		`"minimumCandidates" must be greater than 0 (received ${minimumCandidates})`,
	)

	// (optional) onClose
	assert(
		!onClose || typeof onClose === "function",
		`"onClose" must be a function (received ${typeof onClose})`,
	)

	// (optional) onOpen
	assert(
		!onOpen || typeof onOpen === "function",
		`"onOpen" must be a function (received ${typeof onOpen})`,
	)

	// resetAfter
	assert(
		resetAfter >= 1_000,
		`"resetAfter" must be milliseconds of at least 1 second (received ${resetAfter})`,
	)
	assert(
		resetAfter >= errorWindow,
		`"resetAfter" must be greater than or equal to "errorWindow" (received ${resetAfter}, expected >= ${errorWindow})`,
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
