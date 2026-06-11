# pi-mono fork

This is a fork of [earendil-works/pi](https://github.com/earendil-works/pi) (upstream, formerly `badlogic/pi-mono`), maintained at [crdx/pi-io](https://github.com/crdx/pi-io). Forked at v0.62.0.

## Remotes

- `origin` — `git@github.com:crdx/pi-io.git` (this fork)
- `upstream` — `https://github.com/earendil-works/pi/` (original repo, formerly `badlogic/pi-mono`)

## Versioning

Releases use `v0.62.0-crdx.{n}` tags. See CHANGELOG.md.

## Package layout

Monorepo with four packages under `packages/`:

| Package        | Description                           |
|----------------|---------------------------------------|
| `tui`          | TUI components (terminal rendering)   |
| `ai`           | Providers, models, streaming          |
| `agent`        | Agent core                            |
| `coding-agent` | Main app, CLI, modes, tools, commands |

Build order follows dependency chain: tui → ai → agent → coding-agent.

## Build

`just build` compiles all packages with tsgo. `just dev` watches with hivemind. `just check` runs biome + typecheck. `just test` runs all test suites.

## Testing the CLI

```sh
just build
node packages/coding-agent/dist/cli.js --build-info
node packages/coding-agent/dist/cli.js --help
```
