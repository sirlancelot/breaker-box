import { readFile, writeFile } from "node:fs/promises"
import { $ } from "zx"

const fail = (message) => {
	console.error(`version: ${message}`)
	process.exit(1)
}

const version =
	process.env.npm_package_version ?? fail("must run via npm version")
const today = new Date().toJSON().split("T")[0]
const heading = /^## \[Unreleased\]$/m
const link = /^\[unreleased\]: (.*)\.\.\.HEAD$/m

const changelog = await readFile("CHANGELOG.md", "utf8")
if (!heading.test(changelog))
	fail("CHANGELOG.md is missing the '## [Unreleased]' section")
if (!link.test(changelog))
	fail("CHANGELOG.md is missing the '[unreleased]: ...HEAD' link")

await writeFile(
	"CHANGELOG.md",
	changelog
		.replace(heading, `## [${version}] - ${today}`)
		.replace(link, `[${version}]: $1...v${version}`),
)

await $`git add CHANGELOG.md`
