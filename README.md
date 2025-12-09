![](./.readme/breaker-box.jpg)

# Breaker Box

A zero-dependency [circuit breaker][0] implementation for Node.js.

[0]: https://martinfowler.com/bliki/CircuitBreaker.html

## Installation

```bash
npm install breaker-box
```

## Usage

### Basic Usage

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
	minimumCandidates: 6, // Need at least 6 calls before calculating error rate
	resetAfter: 30_000, // Try again after 30 seconds
})

try {
	const result = await protectedApiCall("user-123")
	console.log("Success:", result)
} catch (error) {
	console.error("Circuit breaker error:", error.message)
}
```

### Retry Strategies

The circuit breaker doesn't retry - it only tracks failures and prevents calls when too many fail. Use `withRetry` to add retry logic:

```typescript
import {
	createCircuitBreaker,
	withRetry,
	useExponentialBackoff,
	useFibonacciBackoff,
} from "breaker-box"

// Exponential backoff: 1s, 2s, 4s, 8s, up to 30s max
const protectedWithExponential = createCircuitBreaker(
	withRetry(unreliableApiCall, { retryDelay: useExponentialBackoff(30) }),
)

// Fibonacci backoff: 1s, 2s, 3s, 5s, 8s, up to 60s max
const protectedWithFibonacci = createCircuitBreaker(
	withRetry(unreliableApiCall, { retryDelay: useFibonacciBackoff(60) }),
)
```

### Timeout Protection

Compose `withTimeout`, `withRetry`, and circuit breaker for complete fault tolerance:

```typescript
import {
	createCircuitBreaker,
	withRetry,
	withTimeout,
	useExponentialBackoff,
} from "breaker-box"

// 1. Add timeout (innermost - fails fast)
const timedCall = withTimeout(unreliableApiCall, 5_000, "Request timed out")

// 2. Add retry logic (middle - retries on transient errors)
const retryCall = withRetry(timedCall, {
	maxAttempts: 3,
	retryDelay: useExponentialBackoff(10),
	shouldRetry: (error) => !error.message.includes("404"), // Don't retry 404s
})

// 3. Add circuit breaker (outermost - prevents cascading failures)
const protectedApiCall = createCircuitBreaker(retryCall, {
	errorThreshold: 0.5,
	minimumCandidates: 5,
})
```

### Event Monitoring

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

// Check current state
console.log("Current state:", protectedFunction.getState())
// Possible states: 'closed', 'open', 'halfOpen'
```

### Cleanup

```typescript
// Clean up resources when shutting down
protectedFunction.dispose()
```

## API

### `createCircuitBreaker(fn, options?)`

Creates a circuit breaker around the provided async function.

#### Parameters

- `fn`: The async function to protect
- `options`: Configuration object (optional)
  - `errorIsFailure`: Function to determine if an error should not count toward circuit breaker metrics (default: `() => false`)
  - `errorThreshold`: Percentage (0-1) of errors that triggers circuit opening (default: `0`)
  - `errorWindow`: Time window in ms for tracking errors (default: `10_000`)
  - `fallback`: Function to call when circuit is open (default: undefined)
  - `minimumCandidates`: Minimum calls before calculating error rate (default: `6`)
  - `onClose`: Function called when circuit closes (default: undefined)
  - `onHalfOpen`: Function called when circuit enters half-open state (default: undefined)
  - `onOpen`: Function called when circuit opens (default: undefined)
  - `resetAfter`: Milliseconds to wait before trying half-open (default: `30_000`)

#### Returns

A function with the same signature as `fn` and additional methods:

- `.dispose(message?)`: Clean up resources and reject future calls
- `.getLatestError()`: Returns the error which triggered the circuit breaker
- `.getState()`: Returns current circuit state (`'closed'`, `'open'`, `'halfOpen'`)

### Helper Functions

#### `withRetry(fn, options?)`

Wraps a function with retry logic. Failures will be retried according to the provided options.

**Options:**

- `maxAttempts`: Maximum number of attempts (default: `3`)
- `retryDelay`: Function returning promise for when to retry (default: immediate)
- `shouldRetry`: Function to determine if error should be retried (default: `() => true`)

**Example:**

```typescript
const retryCall = withRetry(apiCall, {
	maxAttempts: 5,
	retryDelay: useExponentialBackoff(30),
	shouldRetry: (error) => error.statusCode !== 404,
})
```

#### `useExponentialBackoff(maxSeconds)`

Returns a retry delay function that implements exponential backoff (2^n seconds, capped at maxSeconds).

#### `useFibonacciBackoff(maxSeconds)`

Returns a retry delay function that implements Fibonacci backoff (Fibonacci sequence in seconds, capped at maxSeconds).

#### `withTimeout(fn, timeoutMs, message?)`

Wraps a function with a timeout. Rejects with `Error(message)` if execution exceeds `timeoutMs`.

### Development

### Building the Project

```sh
npm run build
```

### Running Tests

```sh
npm test # once

npm run dev # run and watch for file changes
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
