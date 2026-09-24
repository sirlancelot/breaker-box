# Testing Conventions

> Part of [AGENTS.md](../AGENTS.md) — project guidance for AI coding agents.

- **Fake timers required**: Timer-dependent tests (`circuit-breaker`, `backoff`, `util`) call `vi.useFakeTimers()` in `beforeEach`
- **Timer cleanup assertion**: `onTestFinished` (registered in `beforeEach`) verifies `vi.getTimerCount() === 0` — ensures no timer leaks
- **Console snapshots**: `options.test.ts` mocks the console with `useMockConsole()` (`test/util.ts`) and snapshots all console calls per test to `__snapshots__/`
- **vitest-when** for conditional mocking: `when(main).calledWith("arg").thenResolve(value)`
- **Parameterized tests**: Use `it.for([...])` for testing multiple inputs (see backoff tests)
- **Plain mocks**: Circuit breaker tests use plain `vi.fn()` mocks; disposal chaining uses `Symbol.dispose`
- **Inline snapshots**: Use `.toMatchInlineSnapshot()` for value assertions with complex shapes and `.toThrowErrorMatchingInlineSnapshot()` for error message assertions
- **Co-located tests**: `*.test.ts` alongside implementation files
- **Type-level tests**: `lib/index.test-d.ts` uses `expectTypeOf` to assert public API shapes
