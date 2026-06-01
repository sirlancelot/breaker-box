# Code Style

> Part of [AGENTS.md](../AGENTS.md) — project guidance for AI coding agents.

- **Imports**: Use `.js` extension in imports (e.g., `./types.js`) for ESM compatibility
- **No comments**: Keep code self-documenting; JSDoc only for public API in `types.ts`
- **Assertions**: Use `assert()` from util.ts for runtime validation with descriptive messages
- **Error messages**: Prefix with `ERR_CIRCUIT_BREAKER_*` (e.g., `ERR_CIRCUIT_BREAKER_DISPOSED`, `ERR_CIRCUIT_BREAKER_TIMEOUT`, `ERR_CIRCUIT_BREAKER_CALL_FAILURE`, `ERR_CIRCUIT_BREAKER_OPEN`)
- **v8 ignore**: Use `/* v8 ignore next */` for unreachable code paths in coverage
- **Type definitions**: All public interface types are defined in `types.ts` with JSDoc

## Build Output

Dual CJS/ESM package via pkgroll:

- `dist/index.cjs` + `dist/index.d.cts` (CommonJS)
- `dist/index.mjs` + `dist/index.d.mts` (ESM)

Target: Node 18+
Package type: ESM (`"type": "module"` in package.json) with dual CJS/ESM exports
