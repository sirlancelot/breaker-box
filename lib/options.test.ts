import { expect, it } from "vitest"
import { parseOptions } from "./options.js"
import type { AnyFn } from "./types.js"

// Serialize functions by showing their source code
expect.addSnapshotSerializer({
	test: (value) => value instanceof Function,
	serialize: (value: AnyFn) => JSON.stringify(value.toString()).slice(1, -1),
})

it("sets defaults", ({ expect }) => {
	const options = parseOptions({})
	expect(options).toMatchInlineSnapshot(`
			{
			  "errorIsFailure": () => false,
			  "errorThreshold": 0,
			  "errorWindow": 10000,
			  "fallback": undefined,
			  "minimumCandidates": 1,
			  "onClose": undefined,
			  "onHalfOpen": undefined,
			  "onOpen": undefined,
			  "resetAfter": 30000,
			  "retryDelay": 0,
			  "retryLimit": Infinity,
			  "retryTest": () => true,
			  "timeout": 0,
			}
		`)
})

it("handles errorIsFailure error", ({ expect }) => {
	expect(() =>
		parseOptions({ errorIsFailure: 42 as never }),
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: "errorIsFailure" must be a function (received number)]`,
	)
})

it("handles errorThreshold error", ({ expect }) => {
	expect(() =>
		parseOptions({ errorThreshold: -1 }),
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: "errorThreshold" must be between 0 and 1 (received -1)]`,
	)
})

it("handles errorWindow error", ({ expect }) => {
	expect(() =>
		parseOptions({ errorWindow: -1 }),
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: "errorWindow" must be milliseconds of at least 1 second (received -1)]`,
	)
})

it("handles minimumCandidates error", ({ expect }) => {
	expect(() =>
		parseOptions({ minimumCandidates: 0 }),
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: "minimumCandidates" must be greater than 0 (received 0)]`,
	)
})

it("handles onClose error", ({ expect }) => {
	expect(() =>
		parseOptions({ onClose: 42 as never }),
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: "onClose" must be a function (received number)]`,
	)
})

it("handles onHalfOpen error", ({ expect }) => {
	expect(() =>
		parseOptions({ onHalfOpen: 42 as never }),
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: "onHalfOpen" must be a function (received number)]`,
	)
})

it("handles onOpen error", ({ expect }) => {
	expect(() =>
		parseOptions({ onOpen: 42 as never }),
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: "onOpen" must be a function (received number)]`,
	)
})

it("handles resetAfter error", ({ expect }) => {
	expect(() =>
		parseOptions({ resetAfter: -1 }),
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: "resetAfter" must be milliseconds of at least 1 second (received -1)]`,
	)
})

it("handles resetAfter < errorWindow", ({ expect }) => {
	expect(() =>
		parseOptions({ resetAfter: 1_000, errorWindow: 2_000 }),
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: "resetAfter" must be greater than or equal to "errorWindow" (received 1000, expected >= 2000)]`,
	)
})

it("sets retry defaults", ({ expect }) => {
	const options = parseOptions({})
	expect(options.retryDelay).toBe(0)
	expect(options.retryLimit).toBe(Infinity)
	expect(options.retryTest).toBeTypeOf("function")
})

it("handles retryDelay error", ({ expect }) => {
	expect(() =>
		parseOptions({ retryDelay: -1 }),
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: "retryDelay" must be a function or a finite, non-negative number (received number)]`,
	)
})

it("handles retryDelay Infinity error", ({ expect }) => {
	expect(() =>
		parseOptions({ retryDelay: Infinity }),
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: "retryDelay" must be a function or a finite, non-negative number (received number)]`,
	)
})

it("handles retryDelay accepts function", ({ expect }) => {
	expect(() =>
		parseOptions({ retryDelay: () => Promise.resolve() }),
	).not.toThrow()
})

it("handles retryLimit error", ({ expect }) => {
	expect(() =>
		parseOptions({ retryLimit: 0 }),
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: "retryLimit" must be greater than 0 (received 0)]`,
	)
})

it("handles retryTest error", ({ expect }) => {
	expect(() =>
		parseOptions({ retryTest: 42 as never }),
	).toThrowErrorMatchingInlineSnapshot(
		`[TypeError: "retryTest" must be a function (received number)]`,
	)
})
