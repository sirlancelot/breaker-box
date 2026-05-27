---
name: publish-to-npm
description: "Publish to NPM"
disable-model-invocation: true
---

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

## Release Steps

Before running the script:

1. Move items from `[Unreleased]` into a new version section: `## [X.Y.Z] - YYYY-MM-DD`
2. Leave an empty `## [Unreleased]` section at the top
3. Add a comparison link at the bottom: `[X.Y.Z]: https://github.com/sirlancelot/breaker-box/compare/vPREVIOUS...vX.Y.Z`
4. Update the `[unreleased]` link to compare against the new tag: `[unreleased]: https://github.com/sirlancelot/breaker-box/compare/vX.Y.Z...HEAD`
5. Commit: `git commit -am "Update changelog for vX.Y.Z"`

Then run the following script, replacing `<major|minor|patch>` with the appropriate bump level:

```bash
#!/usr/bin/env bash
set -euo pipefail

BUMP="${1:?Usage: release.sh <major|minor|patch>}"

# Merge develop into master
git checkout master
git merge --no-ff develop

# Bump version (creates commit + annotated tag)
npm version "$BUMP"

# Push master and tags
git push origin master --follow-tags

# Authenticate and publish
npm login
npm publish

# Merge master back to develop
git checkout develop
git merge --no-ff master
git push origin develop
```

## Post-Release Verification

- [ ] Verify the tag appears on GitHub: `https://github.com/sirlancelot/breaker-box/releases`
- [ ] Verify the package is on npm: `npm info breaker-box version`
- [ ] Verify `develop` contains the version bump commit (check with `git log --oneline -5`)

## Historical Notes

- v1.0.0 through v5.0.0 were released directly on a single branch (no develop/master split)
- The git-flow model (develop + master) was adopted starting with v6.0.0
- Tags are annotated (not lightweight) — `npm version` handles this
- The `prepublishOnly` hook ensures tests and build always run before publish
