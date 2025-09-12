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
	errorIsFailure: () => true, // Any error is considered a failure
	failureThreshold: 1,        // Open circuit after first failure
	fallback: undefined,        // No fallback, errors are propagated
	resetAfter: 30_000,         // Try again after 30 seconds
})

try {
	const result = await protectedApiCall("user-123")
	console.log("Success:", result)
} catch (error) {
	console.error("Circuit breaker error:", error.message)
}
```

### Event Monitoring

```typescript
const protectedFunction = createCircuitBreaker(unreliableApiCall, {
	onClose: () => {
		console.log("Circuit closed - normal operation resumed")
	},
	onOpen: (cause) => {
		console.log("Circuit opened due to:", cause.message)
	},
})

// Check current state
console.log("Current state:", protectedFunction.getState())
// Possible states: 'closed', 'open', 'halfOpen', 'disposed'
```

### Cleanup

```typescript
// Clean up resources when done
protectedFunction.dispose()
```

## API

### `createCircuitBreaker(fn, options?)`

Creates a circuit breaker around the provided async function.

#### Parameters

- `fn`: The async function to protect
- `options`: Configuration object (optional)
    - `errorIsFailure`: Function to determine if an error counts as failure (default: all errors)
    - `failureThreshold`: Number of failures before opening circuit (default: 1)
    - `fallback`: Function to call when circuit is open (default: undefined)
	- `onClose`: Function to call when circuit is closed (default: undefined)
	- `onOpen`: Function to call when circuit is opened (default: undefined)
    - `resetAfter`: Milliseconds to wait before trying again (default: 30000)

#### Returns

A function with the same signature as `fn` and additional methods:

- `.dispose()`: Clean up resources
- `.getLatestError()`: Returns the error which triggered the circuit breaker
- `.getState()`: Returns current circuit state

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
