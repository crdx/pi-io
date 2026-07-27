set quiet := true
set shell := ["bash", "-cu", "-o", "pipefail"]

mod release 'release.just'

TSGO := "npx tsgo"

export PI_CODING_AGENT_DIR := env("HOME") / ".system/config/pi/agent"

[private]
help:
    just --list --unsorted --list-submodules

# build all packages from scratch in dependency order, so dist always mirrors src
build: clean
    {{ TSGO }} -p packages/tui/tsconfig.build.json
    {{ TSGO }} -p packages/ai/tsconfig.build.json
    {{ TSGO }} -p packages/agent/tsconfig.build.json
    {{ TSGO }} -p packages/coding-agent/tsconfig.build.json
    chmod +x packages/coding-agent/dist/cli.js
    just _copy-assets

# build a single package (tui, ai, agent, coding-agent); assumes deps already built
build-pkg pkg:
    {{ TSGO }} -p packages/{{ pkg }}/tsconfig.build.json

# watch all packages for changes
dev:
    hivemind Procfile

# commit staged changes
commit message:
    git commit -m "{{ message }}"

# run pi (pass args after --)
pi *args: build
    PI_DEV=1 node packages/coding-agent/dist/cli.js {{ args }}

# time cold startup of the built CLI over N runs, skipping extensions to isolate core startup
time-startup runs="5": build
    for i in $(seq 1 {{ runs }}); do \
        START=$(date +%s%N); \
        node packages/coding-agent/dist/cli.js --no-extensions --build-info >/dev/null; \
        END=$(date +%s%N); \
        echo "$(( (END - START) / 1000000 ))ms"; \
    done

# run all tests (builds first: some tests spawn the built CLI)
test: build
    cd packages/tui && node --test --import tsx test/*.test.ts
    cd packages/ai && npx vitest run --reporter=dot
    cd packages/agent && npx vitest run --reporter=dot
    cd packages/coding-agent && npx vitest run --reporter=dot

# run tests for a single vitest package (ai, agent, coding-agent)
test-pkg pkg: build
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
