import js from "@eslint/js"
import tseslint from "typescript-eslint"
import json from "@eslint/json"
import markdown from "@eslint/markdown"
import { defineConfig } from "eslint/config"

export default defineConfig([
	{ ignores: ["dist/", "coverage/", "node_modules/"] },
	{
		extends: ["json/recommended"],
		files: ["**/*.json"],
		ignores: ["package-lock.json"],
		language: "json/json",
		plugins: { json },
	},
	{
		extends: ["json/recommended"],
		files: ["**/*.jsonc", ".vscode/settings.json", "tsconfig.json"],
		language: "json/jsonc",
		plugins: { json },
	},
	{
		extends: ["markdown/recommended"],
		files: ["**/*.md", ".rules"],
		language: "markdown/gfm",
		plugins: { markdown },
		rules: { "markdown/require-alt-text": "off" },
	},
	{
		extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
		files: ["**/*.{cjs,js,mjs,ts}"],
		languageOptions: {
			parserOptions: {
				project: ["./tsconfig.json", "./tsconfig.eslint.json"],
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_" },
			],
			"@typescript-eslint/prefer-promise-reject-errors": [
				"error",
				{ allowThrowingAny: true, allowThrowingUnknown: true },
			],
		},
	},
])
