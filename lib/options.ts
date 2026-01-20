import type { CircuitBreakerOptions } from "./types.js"
import { assert, type AnyFn } from "./util.js"

export function parseOptions<Fallback extends AnyFn>(
	options: CircuitBreakerOptions<Fallback>,
) {
	const {
		errorIsFailure = () => false,
		errorThreshold = 0,
		errorWindow = 10_000,
		fallback,
		minimumCandidates = 1,
		onClose,
		onHalfOpen,
		onOpen,
		resetAfter = 30_000,
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

	// (optional) fallback
	assert(
		!fallback || typeof fallback === "function",
		`"fallback" must be a function (received ${typeof fallback})`,
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

	// (optional) onHalfOpen
	assert(
		!onHalfOpen || typeof onHalfOpen === "function",
		`"onHalfOpen" must be a function (received ${typeof onHalfOpen})`,
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

	return {
		errorIsFailure,
		errorThreshold,
		errorWindow,
		minimumCandidates,
		onClose,
		onHalfOpen,
		onOpen,
		resetAfter,
	}
}
