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
	failureThreshold: 1, // Open circuit after first failure
	resetAfter: 30_000, // Try again after 30 seconds
	errorIsFailure: (error) => true,
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
const protectedFunction = createCircuitBreaker(unreliableApiCall)

protectedFunction.on("open", (cause) => {
	console.log("Circuit opened due to:", cause.message)
})

protectedFunction.on("close", () => {
	console.log("Circuit closed - normal operation resumed")
})

protectedFunction.on("reject", (error) => {
	console.log("Function call rejected:", error.message)
})

protectedFunction.on("resolve", () => {
	console.log("Function call succeeded")
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
    - `failureThreshold`: Number of failures before opening circuit (default: 1)
    - `resetAfter`: Milliseconds to wait before trying again (default: 30000)
    - `errorIsFailure`: Function to determine if an error counts as failure (default: all errors)
    - `fallback`: Function to call when circuit is open (default: throws CircuitOpenError)

#### Returns

A function with the same signature as `fn` and additional methods:

- `.getState()`: Returns current circuit state
- `.on(event, listener)`: Add event listener
- `.off(event, listener)`: Remove event listener
- `.dispose()`: Clean up resources

#### Events

- `open`: Circuit opened due to failures
- `close`: Circuit closed and resumed normal operation
- `reject`: Function call was rejected
- `resolve`: Function call succeeded

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
