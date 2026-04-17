# Changelog

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
