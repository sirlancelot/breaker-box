![](./.readme/breaker-box.jpg)

# Breaker Box

A zero-dependency [circuit breaker][0] implementation for Node.js.

[0]: https://martinfowler.com/bliki/CircuitBreaker.html

## Installation

```bash
npm install breaker-box
```

## Basic Usage

```typescript
import { createCircuitBreaker } from "breaker-box"

// Wrap an unreliable async function
async function unreliableApiCall(data: string) {
	const response = await fetch(`https://api.example.com/data/${data}`)
	if (!response.ok) throw new Error("API call failed")
	return response.json()
}

const protectedApiCall = createCircuitBreaker(unreliableApiCall, {
	errorThreshold: 0.5, // Open circuit when 50% of calls fail
	errorWindow: 10_000, // Track errors over 10 second window
	// Fallback receives the same parameters as the original function
	fallback: (data) => ({ data: "fallback data", error: "API call failed" }),
	minimumCandidates: 1, // Need at least 1 call before calculating error rate
	resetAfter: 30_000, // Try again after 30 seconds
})

try {
	const result = await protectedApiCall("user-123")
	console.log("Success:", result)
} catch (error) {
	console.error("Circuit breaker error:", error.message)
}
```

The above example creates a function named `protectedApiCall` which, when called will execute the `unreliableApiCall` function with circuit breaker protection. If the underlying function fails, then `fallback` is called instead. If **50%** of the calls fail within a **10-second sliding window**, then the circuit breaker will open and subsequent calls to `protectedApiCall` will **always** use the `fallback` for the next **30 seconds**.

## Composition Helpers

The circuit breaker function doesn't handle timeouts, retries, or cooldowns on
its own. For these features, you need to compose with other helper functions.
`breaker-box` provides a set of composable functions that can wrap your API call
with these features.

### Timeouts

Wrap the `unreliableApiCall` with a timeout using `withTimeout()`. If the timer
expires before the call completes, then the promise will reject with
`ERR_CIRCUIT_BREAKER_TIMEOUT`.

This wrapping may not be needed if your API call supports a timeout option
already (e.g. `axios` already has a `timeout` option).

```typescript
import { createCircuitBreaker, withTimeout } from "breaker-box"

const protectedApiCall = createCircuitBreaker(
	withTimeout(unreliableApiCall, 5000),
)
```

### Retries

Wrap the `unreliableApiCall` with retry logic using `withRetry()` function. If
the promise gets rejected, it will be retried up to a certain number of times.
Once the max number of retries is reached, then the promise will ultimately
reject with `ERR_CIRCUIT_BREAKER_MAX_ATTEMPTS (${number})`.

This wrapping may not be needed if your API call supports a retry option already
(e.g. `aws-sdk` already has retry logic).

```typescript
import { createCircuitBreaker, withRetry } from "breaker-box"

const protectedApiCall = createCircuitBreaker(
	withRetry(unreliableApiCall, {
		maxAttempts: 3,
		shouldRetry: (error) => true, // Check whether error is retryable
	}),
)
```

### Cooldowns

When using retry logic, it may be necessary to introduce a cooldown period
between retries to prevent overwhelming the remote system. By default,
`withRetry` will retry immediately. However, you can provide a custom
`retryDelay` function to introduce a delay before each retry attempt. The
function should return a promise that resolves after the desired delay.

`breaker-box` offers helper functions to generate retry delays:

- `delayMs(ms: number)`: Returns a promise that resolves after the specified
  number of milliseconds.
- `useExponentialBackoff(maxSeconds: number)`: Returns a function that
  calculates the delay using exponential backoff.

- `useFibonacciBackoff(maxSeconds: number)`: Returns a function that calculates
  the delay using Fibonacci sequence.

```typescript
import {
	createCircuitBreaker,
	delayMs,
	useExponentialBackoff,
	useFibonacciBackoff,
	withRetry,
} from "breaker-box"

const protectedApiCall1 = createCircuitBreaker(
	withRetry(unreliableApiCall, {
		maxAttempts: 3,
		retryDelay: (attempt, signal) => delayMs(1_000, signal),
	}),
)

const protectedApiCall2 = createCircuitBreaker(
	withRetry(unreliableApiCall, {
		maxAttempts: 3,
		retryDelay: useExponentialBackoff(60),
	}),
)

const protectedApiCall3 = createCircuitBreaker(
	withRetry(unreliableApiCall, {
		maxAttempts: 3,
		retryDelay: useFibonacciBackoff(60),
	}),
)
```

### Complete Example

The optimal composition should look like this: Circuit Breaker -> Retry -> Timeout -> Implementation. However, you may compose it in any order you prefer as long as you understand the behavior.

```typescript
import {
	createCircuitBreaker,
	useExponentialBackoff,
	withRetry,
	withTimeout,
} from "breaker-box"

const protectedApiCall = createCircuitBreaker(
	withRetry(withTimeout(unreliableApiCall, 4_000), {
		maxAttempts: 3,
		retryDelay: useExponentialBackoff(60),
	}),
)
```

## Observability

The following callbacks are available:

```typescript
const protectedFunction = createCircuitBreaker(unreliableApiCall, {
	onClose: () => {
		console.log("🟢 Circuit closed - normal operation resumed")
	},
	onHalfOpen: () => {
		console.log("🟡 Circuit half-opened - waiting for success")
	},
	onOpen: (cause) => {
		console.log("🔴 Circuit opened due to:", cause.message)
	},
})
```

The following methods can retrieve information about the circuit breaker:

```typescript
// Check current state: "closed", "open", "halfOpen"
console.log("Current state:", protectedFunction.getState())

// Check failure rate: Number between 0 and 1
console.log("Failure rate:", protectedFunction.getFailureRate())

// Get the last error that caused the circuit to open: undefined or Error object
console.log("Last error:", protectedFunction.getLatestError())
```

## Cleanup

```typescript
// Clean up resources when shutting down
protectedFunction.dispose()
```

## API Reference

### `createCircuitBreaker(fn, options?)`

Creates a circuit breaker around the provided async function.

#### Parameters

- `fn`: The async function to protect
- `options`: Configuration object (optional)
  - `errorIsFailure`: Function to determine if an error is a non-retryable failure; when true, the error is thrown immediately without counting toward metrics (default: `() => false`)
  - `errorThreshold`: Percentage (0-1) of errors that triggers circuit opening (default: `0`)
  - `errorWindow`: Time window in ms for tracking errors (default: `10_000`)
  - `fallback`: Function to call when an error occurs or circuit is open (default: undefined)
  - `minimumCandidates`: Minimum calls before calculating error rate (default: `1`)
  - `onClose`: Function called when circuit closes (default: undefined)
  - `onHalfOpen`: Function called when circuit enters half-open state (default: undefined)
  - `onOpen`: Function called when circuit opens (default: undefined)
  - `resetAfter`: Milliseconds to wait before trying half-open (default: `30_000`)

#### Returns

A function with the same signature as `fn` and additional methods:

- `.dispose(message?)`: Clean up resources and reject future calls
- `.getFailureRate()`: Returns the current failure rate (0-1) or 0 if fewer than `minimumCandidates` calls have been made
- `.getLatestError()`: Returns the error which triggered the circuit breaker
- `.getState()`: Returns current circuit state (`'closed'`, `'open'`, `'halfOpen'`)

### Helper Functions

#### `withRetry(fn, options?)`

Wraps a function with retry logic. Failures will be retried according to the provided options.

**Parameters:**

- `fn`: The async function to wrap with retry logic
- `options`: Configuration object (optional)
  - `maxAttempts`: Maximum number of attempts (default: `3`)
  - `retryDelay`: Function `(attempt: number, signal: AbortSignal) => Promise<void>` for delay before retry (default: immediate)
  - `shouldRetry`: Function `(error: unknown, attempt: number) => boolean` to determine if error should be retried (default: `() => true`)

**Example:**

```typescript
const retryCall = withRetry(apiCall, {
	maxAttempts: 5,
	retryDelay: useExponentialBackoff(30),
	shouldRetry: (error) => error.statusCode !== 404,
})
```

#### `withTimeout(fn, timeoutMs, message?)`

Wraps a function with a timeout. Rejects with `Error(message)` if execution exceeds `timeoutMs`.

**Parameters:**

- `fn`: The async function to wrap with timeout
- `timeoutMs`: Timeout in milliseconds
- `message`: Error message to use when timeout occurs (default: `"ERR_CIRCUIT_BREAKER_TIMEOUT"`)

#### `useExponentialBackoff(maxSeconds)`

Returns a retry delay function that implements exponential backoff (2^n seconds, capped at maxSeconds).

**Parameters:**

- `maxSeconds`: Maximum delay in seconds before capping

**Returns:** Function `(attempt: number, signal: AbortSignal) => Promise<void>`

#### `useFibonacciBackoff(maxSeconds)`

Returns a retry delay function that implements Fibonacci backoff (Fibonacci sequence in seconds, capped at maxSeconds).

**Parameters:**

- `maxSeconds`: Maximum delay in seconds before capping

**Returns:** Function `(attempt: number, signal: AbortSignal) => Promise<void>`

#### `delayMs(ms, signal?)`

Returns a promise that resolves after the specified number of milliseconds. Supports optional abort signal for cancellation.

**Parameters:**

- `ms`: Delay in milliseconds
- `signal`: Optional AbortSignal for cancellation

**Returns:** `Promise<void>`

## Development Commands

| Command                     | Purpose                                |
| --------------------------- | -------------------------------------- |
| `npm run build`             | Build with pkgroll (CJS + ESM + types) |
| `npm run dev`               | Run tests in watch mode (vitest)       |
| `npm run format`            | Format with Prettier                   |
| `npm run test:coverage`     | Run tests with coverage                |
| `npm test`                  | Run tests once                         |
| `npx tsc --noEmit`          | Type-check without emit                |
| `npx vitest index.test.ts`  | Run single test file                   |
| `npx vitest -t "test name"` | Run specific test by name              |

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
