export class CircuitError extends Error {
	isTransient: boolean
	constructor(
		message: string,
		options?: { cause?: unknown; isTransient?: boolean },
	) {
		super(`ERR_CIRCUIT_BREAKER_${message}`, options)
		this.isTransient = options?.isTransient ?? false
	}
}
