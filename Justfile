set quiet := true
set shell := ["bash", "-cu", "-o", "pipefail"]

mod release 'release.just'

TSGO := "npx tsgo"

[private]
help:
    just --list --unsorted --list-submodules

# build all packages in dependency order
build:
    {{ TSGO }} -p packages/tui/tsconfig.build.json
    {{ TSGO }} -p packages/ai/tsconfig.build.json
    {{ TSGO }} -p packages/agent/tsconfig.build.json
    {{ TSGO }} -p packages/coding-agent/tsconfig.build.json
    chmod +x packages/coding-agent/dist/cli.js
    just _copy-assets

# watch all packages for changes
dev:
    hivemind Procfile

export PI_CODING_AGENT_DIR := env("HOME") / ".system/config/pi/agent"

# commit staged changes
commit message:
    git commit -m "{{ message }}"

# run pi (pass args after --)
pi *args: build
    PI_DEV=1 node packages/coding-agent/dist/cli.js --no-extensions -e ~/.system/config/pi/agent/extensions {{ args }}

# run all tests
test:
    cd packages/tui && node --test --import tsx test/*.test.ts
    cd packages/ai && npx vitest run --reporter=dot
    cd packages/agent && npx vitest run --reporter=dot
    cd packages/coding-agent && npx vitest run --reporter=dot

# run tests for a single vitest package (ai, agent, coding-agent)
test-pkg pkg:
    cd packages/{{ pkg }} && npx vitest run --reporter=dot

# typecheck and lint
check:
    biome check --write --error-on-warnings .
    {{ TSGO }} --noEmit

# remove all build output
clean:
    rm -rf packages/tui/dist packages/ai/dist packages/agent/dist packages/coding-agent/dist

# refresh model list from upstream APIs
generate-models:
    npx tsx packages/ai/scripts/generate-models.ts

[private]
_copy-assets:
    mkdir -p packages/coding-agent/dist/modes/interactive/theme
    cp packages/coding-agent/src/modes/interactive/theme/*.json packages/coding-agent/dist/modes/interactive/theme/
    mkdir -p packages/coding-agent/dist/core/export-html/vendor
    cp packages/coding-agent/src/core/export-html/template.html packages/coding-agent/dist/core/export-html/
    cp packages/coding-agent/src/core/export-html/template.css packages/coding-agent/dist/core/export-html/
    cp packages/coding-agent/src/core/export-html/template.js packages/coding-agent/dist/core/export-html/
    cp packages/coding-agent/src/core/export-html/vendor/*.js packages/coding-agent/dist/core/export-html/vendor/
