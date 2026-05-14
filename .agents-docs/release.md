# Release Process

This project follows a **git-flow** branching model with `develop` for active work and `master` for releases. Releases are published to npm manually — there is no CI/CD automation.

## Branching Model

- **`develop`** — all feature work and changelog updates happen here
- **`master`** — only receives merges from `develop` at release time, plus the version bump commit

## Versioning

- Follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- Tags use `vX.Y.Z` format (e.g., `v7.0.0`)
- `npm version` creates the version bump commit and annotated git tag

## Pre-Release Checklist

Before starting a release, verify:

1. All changes for the release are merged to `develop`
2. CHANGELOG.md `[Unreleased]` section is populated with all changes

> **Note:** `npm publish` triggers the `prepublishOnly` hook which runs `npm run test && npm run build` automatically — no need to run these manually.

## Release Checklist

Run all commands from the repository root.

### 1. Finalize CHANGELOG on `develop`

1. Move items from `[Unreleased]` into a new version section: `## [X.Y.Z] - YYYY-MM-DD`
2. Leave an empty `## [Unreleased]` section at the top
3. Add a comparison link at the bottom: `[X.Y.Z]: https://github.com/sirlancelot/breaker-box/compare/vPREVIOUS...vX.Y.Z`
4. Update the `[unreleased]` link to compare against the new tag: `[unreleased]: https://github.com/sirlancelot/breaker-box/compare/vX.Y.Z...HEAD`
5. Commit: `git commit -am "Update changelog for vX.Y.Z"`

### 2. Merge `develop` into `master`

```
git checkout master
git merge --no-ff develop
```

### 3. Bump version on `master`

```
npm version <major|minor|patch> -m "%s"
```

This single command:

- Updates `version` in `package.json` and `package-lock.json`
- Creates a commit with the version number as the message (e.g., `7.0.0`)
- Creates an annotated git tag `vX.Y.Z`

### 4. Push `master` and tags

```
git push origin master --follow-tags
```

### 5. Merge `master` back to `develop`

```
git checkout develop
git merge --no-ff master
git push origin develop
```

### 6. Publish to npm

```
npm publish
```

The `prepublishOnly` script automatically runs `npm run test && npm run build` before publishing.

## Post-Release Verification

- [ ] Verify the tag appears on GitHub: `https://github.com/sirlancelot/breaker-box/releases`
- [ ] Verify the package is on npm: `npm info breaker-box version`
- [ ] Verify `develop` contains the version bump commit (check with `git log --oneline -5`)

## Historical Notes

- v1.0.0 through v5.0.0 were released directly on a single branch (no develop/master split)
- The git-flow model (develop + master) was adopted starting with v6.0.0
- Tags are annotated (not lightweight) — `npm version` handles this
- The `prepublishOnly` hook ensures tests and build always run before publish
