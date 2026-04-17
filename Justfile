set quiet := true
set shell := ["bash", "-cu", "-o", "pipefail"]

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
    npx concurrently \
        --names "tui,ai,agent,coding-agent" \
        --prefix-colors "magenta,cyan,yellow,red" \
        "{{ TSGO }} -p packages/tui/tsconfig.build.json --watch --preserveWatchOutput" \
        "{{ TSGO }} -p packages/ai/tsconfig.build.json --watch --preserveWatchOutput" \
        "{{ TSGO }} -p packages/agent/tsconfig.build.json --watch --preserveWatchOutput" \
        "{{ TSGO }} -p packages/coding-agent/tsconfig.build.json --watch --preserveWatchOutput"

export PI_CODING_AGENT_DIR := env("HOME") / ".system/config/pi/agent"

# run pi (pass args after --)
run *ARGS:
    node packages/coding-agent/dist/cli.js --no-extensions -e ~/.system/config/pi/agent/extensions {{ ARGS }}

# typecheck and lint
check:
    npx biome check --write --error-on-warnings .
    {{ TSGO }} --noEmit

# run all tests
test:
    cd packages/tui && node --test --import tsx test/*.test.ts
    cd packages/ai && npx vitest --run
    cd packages/agent && npx vitest --run
    cd packages/coding-agent && npx vitest --run

# remove all build output
clean:
    rm -rf packages/tui/dist packages/ai/dist packages/agent/dist packages/coding-agent/dist

# refresh model list from upstream APIs
generate-models:
    npx tsx packages/ai/scripts/generate-models.ts

# tag and push a release
deploy:
    #!/bin/bash
    VERSION=$(jq -r .version packages/coding-agent/package.json)
    LAST=$(git tag -l "v${VERSION}-crdx.*" | sed 's/.*crdx\.//' | sort -n | tail -1)
    NEXT=$(( ${LAST:-0} + 1 ))
    TAG="v${VERSION}-crdx.${NEXT}"
    echo "tagging ${TAG}"
    git tag "$TAG"
    git push origin "$TAG"

[private]
_copy-assets:
    mkdir -p packages/coding-agent/dist/modes/interactive/theme
    cp packages/coding-agent/src/modes/interactive/theme/*.json packages/coding-agent/dist/modes/interactive/theme/
    mkdir -p packages/coding-agent/dist/core/export-html/vendor
    cp packages/coding-agent/src/core/export-html/template.html packages/coding-agent/dist/core/export-html/
    cp packages/coding-agent/src/core/export-html/template.css packages/coding-agent/dist/core/export-html/
    cp packages/coding-agent/src/core/export-html/template.js packages/coding-agent/dist/core/export-html/
    cp packages/coding-agent/src/core/export-html/vendor/*.js packages/coding-agent/dist/core/export-html/vendor/
