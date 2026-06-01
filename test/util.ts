import { type MockedObject, vi } from "vitest"

export function useMockConsole(): MockedObject<Console> & {
	allCalls: unknown[][]
} {
	const all = vi.fn().mockName("console")
	const mockConsole: Record<string, unknown> = {
		get allCalls() {
			return all.mock.calls
		},
	}
	for (const name in console) {
		if (typeof console[name as keyof Console] !== "function") continue
		mockConsole[name] = vi
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			.fn((...args: unknown[]) => all(name, ...args))
			.mockName(`console.${name}`)
	}
	vi.stubGlobal("console", mockConsole)
	return mockConsole as never
}
