import { expect, it } from "vitest"
import { parseOptions } from "./options.js"

// Serialize functions by showing their source code
expect.addSnapshotSerializer({
	test: (value) => value instanceof Function,
	serialize: (value: Function) => JSON.stringify(value.toString()).slice(1, -1),
})

it("sets defaults", ({ expect }) => {
	const options = parseOptions({})
	expect(options).toMatchSnapshot()
})

it.for([
	{ prop: "errorIsFailure", value: 42 },
	{ prop: "errorThreshold", value: -1 },
	{ prop: "errorWindow", value: -1 },
	{ prop: "minimumCandidates", value: 0 },
	{ prop: "onClose", value: 42 },
	{ prop: "onHalfOpen", value: 42 },
	{ prop: "onOpen", value: 42 },
	{ prop: "resetAfter", value: -1 },
	{ prop: "retryDelay", value: 42 },
])("handles $prop error", ({ prop, value }, { expect }) => {
	expect(() => parseOptions({ [prop]: value })).toThrowErrorMatchingSnapshot()
})

it("handles resetAfter < errorWindow", ({ expect }) => {
	expect(() =>
		parseOptions({ resetAfter: 1_000, errorWindow: 2_000 }),
	).toThrowErrorMatchingSnapshot()
})
