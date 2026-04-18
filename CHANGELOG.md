# Changelog

## v0.62.0-crdx.6 — 18 Apr 2026

- Backport upstream fixes:
    - Cache Anthropic tools separately from transcript
    - Align OpenAI cache affinity and use uuidv7 session IDs
    - Strip partialJson from response tool calls
    - Preserve cache_write_tokens in completions stream
    - Emit missing responses toolcall delta
    - Scope nested .gitignore rules to their subtree in find
    - Make find tool match path-based glob patterns
    - Harden find cancellation and grep match formatting
- Add test recipe and fix test setup:
    - Move tsx to npm and run each package separately
    - Remove tests that make network or subprocess calls
    - Fix tests for upstream API changes
    - Remove debug console.log from autocomplete tests
- Add leading space to dev mode warning in interactive mode

## v0.62.0-crdx.5 — 17 Apr 2026

- Update models
- Replace null checks with optional chaining to satisfy linter
- Rename `Procfile.dev` to `Procfile`, tidy the just recipes, and fix release tag note generation

## v0.62.0-crdx.4 — 17 Apr 2026

- Move biome and tsx from npm devDependencies to mise
- Clean up root package.json (rename to "pi", remove empty scripts and version)
- Fix release workflow referencing old changelog-body script name

## v0.62.0-crdx.3 — 17 Apr 2026

- Rename changelog-body tool to release-notes
- Clean up patches

## v0.62.0-crdx.2 — 17 Apr 2026

- Extract changelog body into shared script used by both release tags and GitHub workflow
- Release tags are now annotated with the changelog body

## v0.62.0-crdx.1 — 17 Apr 2026

- Fork from badlogic/pi-mono at v0.62.0
