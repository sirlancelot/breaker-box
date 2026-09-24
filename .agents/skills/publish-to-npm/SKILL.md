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

## Determining Bump Level

Read `CHANGELOG.md`'s `[Unreleased]` section and apply these rules:

- **major** — any `### Removed` items marked BREAKING, or `### Changed` items marked BREAKING
- **minor** — any `### Added` items (new features) without breaking changes
- **patch** — only `### Fixed`, `### Deprecated`, or documentation changes

Always determine the bump level yourself from the changelog content. Do not ask the user unless the section is ambiguous or empty.

## Pre-Release Checklist

Before starting a release, verify:

1. All changes for the release are merged to `develop`
2. Working tree is clean and `develop` is in sync with `origin/develop` (`git fetch && git status -sb`); if local history was rewritten, the user must force-push before continuing
3. `npm test` passes on `develop` — stop and report failures rather than releasing
4. CHANGELOG.md `[Unreleased]` section is populated with all changes

> **Note:** `npm publish` triggers the `prepublishOnly` hook which runs `npm run test && npm run build` automatically, but a failure there only surfaces after the release commit and tag are pushed. Check step 3 up front.

## Release Phases

The release is split into three phases because `npm publish` requires interactive browser-based OTP authentication that cannot be completed in the agent terminal.

### Phase 1: Pre-Publish (agent runs)

1. Update CHANGELOG.md:
   - Move items from `[Unreleased]` into a new version section: `## [X.Y.Z] - YYYY-MM-DD`
   - Leave an empty `## [Unreleased]` section at the top
   - Add a comparison link at the bottom: `[X.Y.Z]: https://github.com/sirlancelot/breaker-box/compare/vPREVIOUS...vX.Y.Z`
   - Update the `[unreleased]` link: `[unreleased]: https://github.com/sirlancelot/breaker-box/compare/vX.Y.Z...HEAD`
   - Commit: `git commit -am "Update changelog for vX.Y.Z"`

2. Merge and version bump:

   ```bash
   git checkout master
   git merge --no-ff develop
   npm version <major|minor|patch>
   git push origin master --follow-tags
   ```

3. Tell the user to run `npm publish` in their own terminal and wait for confirmation.

### Phase 2: Publish (user runs manually)

The user must run this in their own interactive terminal:

```bash
npm publish
```

This requires browser-based OTP authentication that the agent terminal cannot handle. Use the ask user tool with a yes/no prompt to confirm when the publish is complete.

### Phase 3: Post-Publish (agent runs after user confirms)

```bash
git checkout develop
git merge --no-ff master
git push origin develop
```

Then verify:

- `npm view breaker-box dist-tags --prefer-online --min-release-age=0` shows the new version as `latest`
- `git log --oneline -5` on develop shows the version bump commit
