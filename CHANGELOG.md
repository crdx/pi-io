# Changelog

## [0.62.0-crdx.19] - 2026-08-13

### Added

- Render mermaid diagrams as terminal art
- Add a markdown transformer hook (so extensions can rewrite it before render)
- Print the command to resume the session on exit
- Add the opencode-go provider

### Changed

- Hide thinking levels that map to the same underlying provider value
- Stop capping `maxTokens` at 32,000 when the model allows more
- Refresh model pricing from models.dev

### Removed

- Remove packages, the `config` subcommand, the `--offline` flag, and `PI_OFFLINE`
- Remove obsolete upstream documentation and per-package readmes and changelogs

## [0.62.0-crdx.18] - 2026-08-08

### Added

- Add interrupt message delivery
- Implement Kitty's OSC 5522 protocol
- Add `/version` command
- Add opt-in debug logging with `PI_LOG=1`

### Changed

- Make `ctx.abort()` asynchronous
- Require `~~double tildes~~` for strikethrough

### Fixed

- Preserve interrupt delivery when queued turn starts
- Abort before forking or navigating the session tree
- Show errors as descriptive sentences
- Report failed edits only once
- Handle OSC 5522 packets correctly

### Removed

- Remove compaction and branch summarisation
- Remove almost all providers
- Remove RPC mode
- Remove HTML session export
- Remove sharing
- Remove the light theme
- Remove `/hotkeys`
- Remove some settings
- Remove the `install`, `remove`, `uninstall`, `update`, and `list` package-manager subcommands
- Remove the npm release check
- Remove the automatic `rg` and `fd` downloads
- Remove legacy migrations
- Remove non-Linux and Bun-specific runtime support
- Remove the iTerm2 image path and legacy X11 mouse, SGR mouse, and xterm `modifyOtherKeys` handling

## [0.62.0-crdx.17] - 2026-07-24

### Added

- Add GPT-5.6 Luna, Sol, and Terra
- Support request-wide pricing tiers

### Fixed

- Run tests against package source

## [0.62.0-crdx.16] - 2026-07-24

### Added

- Enable adaptive thinking for Opus 5

### Changed

- Refresh the model registry
- Trim the model registry to only a couple of providers

### Fixed

- Preserve call order in the file mutation queue (fixes a flaky test, too)
- Fix stale model references

## [0.62.0-crdx.15] - 2026-07-15

### Changed

- Refresh the model registry

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
