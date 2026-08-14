set quiet := true
set shell := ["bash", "-cu", "-o", "pipefail"]

SESSION := "pi-rig"
STAGE   := "/tmp/rig-stage"
AGENT   := STAGE / "agent"
PROJECT := STAGE / "project"
CLI     := justfile_directory() / "packages/coding-agent/dist/cli.js"
OUT     := justfile_directory() / "tmp"
WIDTH  := "100"
HEIGHT := "30"
DELAY := "1.5"

stage:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p {{ AGENT }} {{ PROJECT }}/nested
    echo '{ "theme": "dark" }' > {{ AGENT }}/settings.json
    printf '# Project Guidelines\n\nBe helpful.\n' > {{ PROJECT }}/AGENTS.md
    printf '# Local Overrides\n\nBe terse.\n' > {{ PROJECT }}/AGENTS.local.md
    printf '# Nested\n\nNested context.\n' > {{ PROJECT }}/nested/CLAUDE.md

up: stage build
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p {{ OUT }}
    just --justfile {{ justfile() }} down
    tmux new-session -d -s {{ SESSION }} -x {{ WIDTH }} -y {{ HEIGHT }} -c {{ PROJECT }} \
        env PI_CODING_AGENT_DIR={{ AGENT }} node {{ CLI }} --no-extensions
    echo "rig up: tmux session {{ SESSION }} at {{ WIDTH }}x{{ HEIGHT }}"

reload: build
    #!/usr/bin/env bash
    set -euo pipefail
    tmux respawn-pane -k -t {{ SESSION }} \
        env PI_CODING_AGENT_DIR={{ AGENT }} node {{ CLI }} --no-extensions
    echo "rig reload: pi relaunched"

build:
    cd {{ justfile_directory() }} && just build

shot name:
    #!/usr/bin/env bash
    set -euo pipefail
    sleep {{ DELAY }}
    mkdir -p {{ OUT }}
    out={{ OUT }}/$(date +%F)-{{ name }}.txt
    tmux capture-pane -t {{ SESSION }} -p > "$out"
    echo "$out"

sgr name:
    #!/usr/bin/env bash
    set -euo pipefail
    sleep {{ DELAY }}
    mkdir -p {{ OUT }}
    out={{ OUT }}/$(date +%F)-{{ name }}.ansi
    tmux capture-pane -t {{ SESSION }} -p -e > "$out"
    echo "$out"

view text name:
    #!/usr/bin/env bash
    set -euo pipefail
    tmux send-keys -t {{ SESSION }} -l '{{ text }}'
    just --justfile {{ justfile() }} shot '{{ name }}'

press key name:
    #!/usr/bin/env bash
    set -euo pipefail
    tmux send-keys -t {{ SESSION }} '{{ key }}'
    just --justfile {{ justfile() }} shot '{{ name }}'

lines name:
    cat -n {{ OUT }}/$(date +%F)-{{ name }}.txt | sed 's/[[:space:]]*$/<EOL>/'

down:
    #!/usr/bin/env bash
    set -euo pipefail
    pid=$(tmux display-message -p -t {{ SESSION }} '#{pane_pid}' 2>/dev/null || true)
    tmux kill-session -t {{ SESSION }} 2>/dev/null || true
    if [[ -n "$pid" ]]; then
        kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    fi
    sleep 0.3
