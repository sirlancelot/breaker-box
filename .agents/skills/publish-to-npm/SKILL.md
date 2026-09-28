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
- `npm version` creates the version bump commit and annotated git tag, running these hooks first:
  - `preversion` — `npm run test`; a failure aborts before anything changes
  - `version` — [`scripts/version.mjs`](../../../scripts/version.mjs): renames `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, rewrites the `[unreleased]: .../compare/vPREVIOUS...HEAD` link to `[X.Y.Z]: .../compare/vPREVIOUS...vX.Y.Z`, and stages `CHANGELOG.md` into the version commit
  - `postversion` — `git push --follow-tags` pushes the current branch and the new tag
- `npm publish` runs `prepublishOnly` — [`scripts/prepublish.mjs`](../../../scripts/prepublish.mjs) aborts unless HEAD is tagged `v<package.json version>` and the working tree has no uncommitted changes, then runs `npm run build`

## Determining Bump Level

Read `CHANGELOG.md`'s `## [Unreleased]` section and apply these rules:

- **major** — any item marked BREAKING, in any section
- **minor** — any `### Added` or `### Deprecated` items, or `### Changed` / `### Removed` items that add to or relax the public API
- **patch** — only `### Fixed`, `### Security`, or `### Changed` / `### Removed` items with no public API impact

Always determine the bump level yourself from the changelog content. Do not ask the user unless the section is ambiguous or empty.

## Pre-Release Checklist

Before starting a release, verify working tree is clean and `develop` is in sync with `origin/develop` (`git fetch && git status -sb`). Do not proceed if there are uncommitted changes or unpushed commits.

## Release Phases

The release is split into three phases because `npm publish` requires interactive browser-based OTP authentication that cannot be completed in the agent terminal.

### Phase 1: Pre-Publish (agent runs)

Merge and version bump:

```bash
git checkout master
git merge --no-ff develop
npm version <major|minor|patch>
```

Afterwards, confirm `git show --stat HEAD` includes `CHANGELOG.md`, `master`'s CHANGELOG.md has no `## [Unreleased]` section, and `git status -sb` shows `master` in sync with `origin/master`.

### Phase 2: Publish (user runs manually)

Tell the user to run `npm publish` in their own interactive terminal:

```bash
npm publish
```

This requires browser-based OTP authentication that the agent terminal cannot handle. Use the ask user tool with a yes/no prompt to confirm when the publish is complete. Do not proceed until the user confirms.

### Phase 3: Post-Publish (agent runs)

Back-merge the version bump commit into `develop`:

```bash
git checkout develop
git merge --no-ff -Xours master
```

Restore the `## [Unreleased]` section on `develop`:

- Add an empty `## [Unreleased]` section above `## [X.Y.Z] - YYYY-MM-DD`
- Add `[unreleased]: https://github.com/sirlancelot/breaker-box/compare/vX.Y.Z...HEAD` at the top of the link list
- Amend the merge commit and push:

  ```bash
  git add CHANGELOG.md
  git commit --amend --no-edit
  git push origin develop
  ```

Then verify:

- `npm view breaker-box dist-tags --prefer-online --min-release-age=0` shows the new version as `latest`
- `git log --oneline -5` on develop shows the version bump commit
- `git show master:CHANGELOG.md` has no `## [Unreleased]` section; `develop`'s `CHANGELOG.md` does
