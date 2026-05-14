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

## Timeout & Retry

`createCircuitBreaker` supports built-in timeout and retry via options:

### Timeouts

If the call doesn't complete within `timeout` milliseconds, it rejects and counts as a failure.

```typescript
const protectedApiCall = createCircuitBreaker(unreliableApiCall, {
	timeout: 5000,
})
```

### Retries

Failed calls can be retried automatically. Use `retryLimit` to set the maximum
number of attempts, `retryTest` to filter which errors are retryable, and
`retryDelay` to control the delay between attempts.

```typescript
const protectedApiCall = createCircuitBreaker(unreliableApiCall, {
	retryLimit: 3,
	retryTest: (error) => error.statusCode !== 404,
	retryDelay: useExponentialBackoff(60),
})
```

### Cooldowns

When using retry logic, you can introduce a delay between retries to avoid
overwhelming the remote system. The `retryDelay` option accepts either a number
(fixed delay in milliseconds) or a function returning a promise.

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
} from "breaker-box"

const protectedApiCall1 = createCircuitBreaker(unreliableApiCall, {
	retryLimit: 3,
	retryDelay: 1_000, // Fixed 1-second delay
})

const protectedApiCall2 = createCircuitBreaker(unreliableApiCall, {
	retryLimit: 3,
	retryDelay: useExponentialBackoff(60),
})

const protectedApiCall3 = createCircuitBreaker(unreliableApiCall, {
	retryLimit: 3,
	retryDelay: useFibonacciBackoff(60),
})
```

### Complete Example

```typescript
import { createCircuitBreaker, useExponentialBackoff } from "breaker-box"

const protectedApiCall = createCircuitBreaker(unreliableApiCall, {
	errorThreshold: 0.5,
	errorWindow: 10_000,
	minimumCandidates: 1,
	resetAfter: 30_000,
	timeout: 4_000,
	retryLimit: 3,
	retryDelay: useExponentialBackoff(60),
	fallback: (data) => ({ data: "fallback data" }),
})
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
// Check current state: "closed", "open", "halfOpen", "disposed"
console.log("Current state:", protectedFunction.getState())

// Check failure rate: Number between 0 and 1
console.log("Failure rate:", protectedFunction.getFailureRate())

// Get the last error that caused the circuit to open: undefined or Error object
console.log("Last error:", protectedFunction.getLatestError())
```

## Cleanup

```typescript
// Preferred: use explicit resource management
{
	using protectedFunction = createCircuitBreaker(unreliableApiCall)
	// automatically disposed at end of block
}

// Or dispose manually (deprecated)
const protectedFunction = createCircuitBreaker(unreliableApiCall)
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
  - `retryDelay`: Delay between retries; a number (ms) for fixed delay or a function `(attempt, signal) => Promise<void>` (default: `0`)
  - `retryLimit`: Maximum number of attempts per call (default: `Infinity`)
  - `retryTest`: Function `(error) => boolean` to decide if an error is retryable (default: `() => true`)
  - `timeout`: Per-call timeout in milliseconds; 0 disables (default: `0`)

#### Returns

A function with the same signature as `fn` and additional methods:

- `.dispose(message?)`: *(Deprecated)* Clean up resources and reject future calls. Use `Symbol.dispose` / `using` keyword instead.
- `.getFailureRate()`: Returns the current failure rate (0-1) or 0 if fewer than `minimumCandidates` calls have been made
- `.getLatestError()`: Returns the error which triggered the circuit breaker
- `.getState()`: Returns current circuit state (`'closed'`, `'open'`, `'halfOpen'`, `'disposed'`)
- `[Symbol.dispose]()`: Clean up resources and reject future calls. Supports `using` syntax.

### Helper Functions

#### `withRetry(fn, options?)` *(Deprecated)*

> **Deprecated:** Use the `retryLimit`, `retryDelay`, and `retryTest` options on `createCircuitBreaker` instead.

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

#### `withTimeout(fn, timeoutMs, message?)` *(Deprecated)*

> **Deprecated:** Use the `timeout` option on `createCircuitBreaker` instead.

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
| `npm run lint`              | Lint with ESLint (auto-fix)            |
| `npm run test:coverage`     | Run tests with coverage                |
| `npm test`                  | Run tests once (includes typecheck)    |
| `npx tsc --noEmit`          | Type-check without emit                |
| `npx vitest index.test.ts`  | Run single test file                   |
| `npx vitest -t "test name"` | Run specific test by name              |

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
