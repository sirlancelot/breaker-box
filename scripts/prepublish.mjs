import { $ } from "zx"

const fail = (message) => {
	console.error(`prepublish: ${message}`)
	process.exit(1)
}

const version =
	process.env.npm_package_version ?? fail("must run via npm publish")
const tags = (await $`git tag --points-at HEAD`).lines()

if (!tags.length) fail("HEAD is not a tagged commit")
if (!tags.includes(`v${version}`))
	fail(
		`HEAD tags (${tags.join(", ")}) do not include v${version} from package.json`,
	)
if (await $`git diff --quiet HEAD`.exitCode)
	fail("working tree has uncommitted changes")

await $({ stdio: "inherit" })`npm run build`
