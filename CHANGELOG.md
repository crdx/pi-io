# Changelog

## [0.62.0-crdx.14] - 2026-07-02

### Added

- Add support for Fable 5 with adaptive thinking

## [0.62.0-crdx.13] - 2026-07-02

### Changed

- Refresh the model registry

## [0.62.0-crdx.12] - 2026-06-11

### Added

- Enable adaptive summarised thinking for Opus 4.8
- Add `build-pkg` and `test-pkg` recipes

### Changed

- Refresh the model registry daily via CI
- Repoint upstream references to the renamed `earendil-works/pi` repository
- Pin GitHub Actions to fixed versions
- Keep only the latest dev build

### Fixed

- Prepend `find` and `grep` invocations with `--` so dashed paths are handled correctly

## [0.62.0-crdx.11] - 2026-06-10

### Changed

- Move file read tracker into an extension

## [0.62.0-crdx.10] - 2026-06-03

### Added

- Add `--build-info` flag for debugging
- Force agent to re-read files before edit/write if stale

## [0.62.0-crdx.9] - 2026-06-01

### Changed

- Allow project skills to shadow global skills without triggering collision warnings

### Fixed

- Pin vitest to avoid npm resolution failures

## [0.62.0-crdx.8] - 2026-05-26

### Fixed

- Check skill directories exist before loading

## [0.62.0-crdx.7] - 2026-05-12

### Added

- Support additional skills directory (`.agents/local-skills`)

### Changed

- Use bracketed version headings in changelog (follow "Keep a Changelog" v1.1.0)

## [0.62.0-crdx.6] - 2026-04-18

### Added

- Add test recipe and fix test setup:
    - Move tsx to npm and run each package separately
    - Remove tests that make network or subprocess calls
    - Fix tests for upstream API changes
    - Remove debug console.log from autocomplete tests

### Fixed

- Backport upstream fixes:
    - Cache Anthropic tools separately from transcript
    - Align OpenAI cache affinity and use uuidv7 session IDs
    - Strip partialJson from response tool calls
    - Preserve cache_write_tokens in completions stream
    - Emit missing responses toolcall delta
    - Scope nested .gitignore rules to their subtree in find
    - Make find tool match path-based glob patterns
    - Harden find cancellation and grep match formatting
- Add leading space to dev mode warning in interactive mode

## [0.62.0-crdx.5] - 2026-04-17

### Changed

- Update models
- Replace null checks with optional chaining to satisfy linter
- Rename `Procfile.dev` to `Procfile`, tidy the just recipes, and fix release tag note generation

## [0.62.0-crdx.4] - 2026-04-17

### Changed

- Move biome and tsx from npm devDependencies to mise
- Clean up root package.json (rename to "pi", remove empty scripts and version)

### Fixed

- Fix release workflow referencing old changelog-body script name

## [0.62.0-crdx.3] - 2026-04-17

### Changed

- Rename changelog-body tool to release-notes
- Clean up patches

## [0.62.0-crdx.2] - 2026-04-17

### Added

- Extract changelog body into shared script used by both release tags and GitHub workflow
- Release tags are now annotated with the changelog body

## [0.62.0-crdx.1] - 2026-04-17

### Added

- Fork from badlogic/pi-mono at v0.62.0
