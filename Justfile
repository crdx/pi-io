set quiet := true
set shell := ["bash", "-cu", "-o", "pipefail"]

[private]
help:
    just --list --unsorted --list-submodules

deploy:
    # TODO