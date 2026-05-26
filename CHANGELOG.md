# Changelog

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
