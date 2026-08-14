# pi

A hard fork of pi v0.62.0, plus backports, more features, and bugfixes.

Pi is a minimal terminal coding harness. Adapt pi to your workflows, not the other way around, without having to fork and modify pi internals. Extend it with TypeScript [Extensions](#extensions), [Skills](#skills), [Prompt Templates](#prompt-templates), and [Themes](#themes).

Pi ships with powerful defaults but skips features like sub agents and plan mode. Instead, you can ask pi to build what you want as an extension or a skill.

Pi runs in two modes: interactive, and print or JSON for scripting.

## Table of Contents

- [Quick Start](#quick-start)
- [Providers & Models](#providers--models)
- [Interactive Mode](#interactive-mode)
  - [Editor](#editor)
  - [Commands](#commands)
  - [Keyboard Shortcuts](#keyboard-shortcuts)
  - [Message Queue](#message-queue)
- [Sessions](#sessions)
  - [Branching](#branching)
- [Settings](#settings)
- [Context Files](#context-files)
- [Customization](#customization)
  - [Prompt Templates](#prompt-templates)
  - [Skills](#skills)
  - [Extensions](#extensions)
  - [Themes](#themes)
- [Philosophy](#philosophy)
- [CLI Reference](#cli-reference)

---

## Quick Start

```bash
just build          # builds all packages into packages/*/dist
```

The CLI entry point is `packages/coding-agent/dist/cli.js`.

Authenticate with an API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

Or use your existing subscription:

```bash
pi
/login  # Then select provider
```

Then just talk to pi. By default, pi gives the model four tools: `read`, `write`, `edit`, and `bash`. The model uses these to fulfill your requests. Add capabilities via [skills](#skills), [prompt templates](#prompt-templates), or [extensions](#extensions).

**Platform notes:** [tmux](packages/coding-agent/docs/tmux.md) | [Terminal setup](packages/coding-agent/docs/terminal-setup.md) | [Shell aliases](packages/coding-agent/docs/shell-aliases.md)

---

## Providers & Models

For each built-in provider, pi maintains a list of tool-capable models, updated with every release. Authenticate via subscription (`/login`) or API key, then select any model from that provider via `/model` (or Ctrl+L).

**Subscriptions:**

- Anthropic Claude Pro/Max
- OpenAI ChatGPT Plus/Pro (Codex)

**API keys:**

- Anthropic
- OpenAI

**Custom providers & models:** Add providers via `~/.pi/agent/models.json` if they speak a supported API (OpenAI Chat Completions, OpenAI Responses, Anthropic Messages). For custom APIs or OAuth, use extensions. See [docs/models.md](packages/coding-agent/docs/models.md) and [docs/custom-provider.md](packages/coding-agent/docs/custom-provider.md).

---

## Interactive Mode

<p align="center"><img src="packages/coding-agent/docs/images/interactive-mode.png" alt="Interactive Mode" width="600"></p>

The interface from top to bottom:

- **Startup header** - Shows loaded AGENTS.md files, prompt templates, skills, and extensions
- **Messages** - Your messages, assistant responses, tool calls and results, notifications, errors, and extension UI
- **Editor** - Where you type; border color indicates thinking level
- **Footer** - Working directory, session name, total token/cache usage, cost, context usage, current model

The editor can be temporarily replaced by other UI, like built-in `/settings` or custom UI from extensions (e.g., a Q&A tool that lets the user answer model questions in a structured format). [Extensions](#extensions) can also replace the editor, add widgets above/below it, a status line, custom footer, or overlays.

### Editor

| Feature         | How                                                                       |
|-----------------|---------------------------------------------------------------------------|
| File reference  | Type `@` to fuzzy-search project files                                    |
| Path completion | Tab to complete paths                                                     |
| Multi-line      | Shift+Enter                                                               |
| Images          | Ctrl+V to paste, or drag onto terminal                                    |
| Bash commands   | `!command` runs and sends output to LLM, `!!command` runs without sending |

Standard editing keybindings for delete word, undo, etc. See [docs/keybindings.md](packages/coding-agent/docs/keybindings.md).

### Commands

Type `/` in the editor to trigger commands. [Extensions](#extensions) can register custom commands, [skills](#skills) are available as `/skill:name`, and [prompt templates](#prompt-templates) expand via `/templatename`.

| Command             | Description                                                                                          |
|---------------------|------------------------------------------------------------------------------------------------------|
| `/login`, `/logout` | OAuth authentication                                                                                 |
| `/model`            | Switch models                                                                                        |
| `/scoped-models`    | Enable/disable models for Ctrl+P cycling                                                             |
| `/settings`         | Thinking level, theme, message delivery, transport                                                   |
| `/resume`           | Pick from previous sessions                                                                          |
| `/new`              | Start a new session                                                                                  |
| `/name <name>`      | Set session display name                                                                             |
| `/session`          | Show session info (path, tokens, cost)                                                               |
| `/tree`             | Jump to any point in the session and continue from there                                             |
| `/fork`             | Create a new session from the current branch                                                         |
| `/copy`             | Copy last assistant message to clipboard                                                             |
| `/export [file]`    | Export the current session branch to a JSONL file                                                    |
| `/import <file>`    | Import and resume a session from a JSONL file                                                        |
| `/reload`           | Reload keybindings, extensions, skills, prompts, and context files (themes hot-reload automatically) |
| `/version`          | Show the running version and how old the build is                                                    |
| `/quit`, `/exit`    | Quit pi                                                                                              |

### Keyboard Shortcuts

Customize via `~/.pi/agent/keybindings.json`. See [docs/keybindings.md](packages/coding-agent/docs/keybindings.md).

**Commonly used:**

| Key                   | Action                               |
|-----------------------|--------------------------------------|
| Ctrl+C                | Clear editor                         |
| Ctrl+C twice          | Open `/tree`                         |
| Ctrl+D                | Quit (empty editor)                  |
| Escape                | Cancel/abort                         |
| Escape twice          | Open `/tree`                         |
| Ctrl+L                | Open model selector                  |
| Ctrl+P / Shift+Ctrl+P | Cycle scoped models forward/backward |
| Shift+Tab             | Cycle thinking level                 |
| Ctrl+O                | Collapse/expand tool output          |
| Ctrl+T                | Collapse/expand thinking blocks      |

### Message Queue

Submit messages while the agent is working:

- **Enter** queues a *steering* message, delivered after the current assistant turn finishes executing its tool calls
- **Alt+Enter** queues a *follow-up* message, delivered only after the agent finishes all work
- **Escape** aborts and restores queued messages to editor
- **Alt+Up** retrieves queued messages back to editor

Configure delivery in [settings](packages/coding-agent/docs/settings.md): `steeringMode` and `followUpMode` can be `"one-at-a-time"` (default, waits for response) or `"all"` (delivers all queued at once). `transport` selects provider transport preference (`"sse"`, `"websocket"`, or `"auto"`) for providers that support multiple transports.

---

## Sessions

Sessions are stored as JSONL files with a tree structure. Each entry has an `id` and `parentId`, enabling in-place branching without creating new files. See [docs/session.md](packages/coding-agent/docs/session.md) for file format.

### Management

Sessions auto-save to `~/.pi/agent/sessions/` organized by working directory.

```bash
pi -c                  # Continue most recent session
pi -r                  # Browse and select from past sessions
pi --no-session        # Ephemeral mode (don't save)
pi --session <path>    # Use specific session file or ID
pi --fork <path>       # Fork specific session file or ID into a new session
```

### Branching

**`/tree`** - Navigate the session tree in-place. Select any previous point, continue from there, and switch between branches. All history preserved in a single file.

<p align="center"><img src="packages/coding-agent/docs/images/tree-view.png" alt="Tree View" width="600"></p>

- Search by typing, fold/unfold and jump between branches with Ctrl+←/Ctrl+→ or Alt+←/Alt+→, page with ←/→
- Filter modes (Ctrl+O): default → no-tools → user-only → labeled-only → all
- Press `l` to label entries as bookmarks

**`/fork`** - Create a new session file from the current branch. Opens a selector, copies history up to the selected point, and places that message in the editor for modification.

**`--fork <path|id>`** - Fork an existing session file or partial session UUID directly from the CLI. This copies the full source session into a new session file in the current project.

## Settings

Use `/settings` to modify common options, or edit JSON files directly:

| Location                    | Scope                      |
|-----------------------------|----------------------------|
| `~/.pi/agent/settings.json` | Global (all projects)      |
| `.pi/settings.json`         | Project (overrides global) |

See [docs/settings.md](packages/coding-agent/docs/settings.md) for all options.

---

## Context Files

Pi loads `AGENTS.md` (or `CLAUDE.md`) at startup from:

- `~/.pi/agent/AGENTS.md` (global)
- Parent directories (walking up from cwd)
- Current directory

Use for project instructions, conventions, common commands. All matching files are concatenated.

### System Prompt

Replace the default system prompt with `.pi/SYSTEM.md` (project) or `~/.pi/agent/SYSTEM.md` (global). Append without replacing via `APPEND_SYSTEM.md`.

---

## Customization

### Prompt Templates

Reusable prompts as Markdown files. Type `/name` to expand.

```markdown
<!-- ~/.pi/agent/prompts/review.md -->
Review this code for bugs, security issues, and performance problems.
Focus on: {{focus}}
```

Place in `~/.pi/agent/prompts/` or `.pi/prompts/`. See [docs/prompt-templates.md](packages/coding-agent/docs/prompt-templates.md).

### Skills

On-demand capability packages following the [Agent Skills standard](https://agentskills.io). Invoke via `/skill:name` or let the agent load them automatically.

```markdown
<!-- ~/.pi/agent/skills/my-skill/SKILL.md -->
# My Skill
Use this skill when the user asks about X.

## Steps
1. Do this
2. Then that
```

Place in `~/.pi/agent/skills/`, `~/.agents/skills/`, `.pi/skills/`, or `.agents/skills/` (from `cwd` up through parent directories). See [docs/skills.md](packages/coding-agent/docs/skills.md).

### Extensions

TypeScript modules that extend pi with custom tools, commands, keyboard shortcuts, event handlers, and UI components.

```typescript
export default function (pi: ExtensionAPI) {
  pi.registerTool({ name: "deploy", ... });
  pi.registerCommand("stats", { ... });
  pi.on("tool_call", async (event, ctx) => { ... });
}
```

**What's possible:**

- Custom tools (or replace built-in tools entirely)
- Sub-agents and plan mode
- Permission gates and path protection
- Custom editors and UI components
- Status lines, headers, footers
- Git checkpointing and auto-commit
- SSH and sandbox execution
- MCP server integration
- Make pi look like Claude Code
- Games while waiting (yes, Doom runs)
- ...anything you can dream up

Place in `~/.pi/agent/extensions/` or `.pi/extensions/`. See [docs/extensions.md](packages/coding-agent/docs/extensions.md).

### Themes

Built-in: `dark`. Themes hot-reload: modify the active theme file and pi immediately applies changes.

Place in `~/.pi/agent/themes/` or `.pi/themes/`. See [docs/themes.md](packages/coding-agent/docs/themes.md).

---

## Philosophy

Pi is aggressively extensible so it doesn't have to dictate your workflow. Features that other tools bake in can be built with [extensions](#extensions) or [skills](#skills). This keeps the core minimal while letting you shape pi to fit how you work.

**No MCP.** Build CLI tools with READMEs (see [Skills](#skills)), or build an extension that adds MCP support. [Why?](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/)

**No sub-agents.** There's many ways to do this. Spawn pi instances via tmux, or build your own with [extensions](#extensions), or install a package that does it your way.

**No permission popups.** Run in a container, or build your own confirmation flow with [extensions](#extensions) inline with your environment and security requirements.

**No plan mode.** Write plans to files, or build it with [extensions](#extensions), or install a package.

**No built-in to-dos.** They confuse models. Use a TODO.md file, or build your own with [extensions](#extensions).

**No background bash.** Use tmux. Full observability, direct interaction.

Read the [blog post](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) for the full rationale.

---

## CLI Reference

```bash
pi [options] [@files...] [messages...]
```

### Modes

| Flag            | Description                                                                              |
|-----------------|------------------------------------------------------------------------------------------|
| (default)       | Interactive mode                                                                         |
| `-p`, `--print` | Print response and exit                                                                  |
| `--mode json`   | Output all events as JSON lines (see [docs/json.md](packages/coding-agent/docs/json.md)) |

In print mode, pi also reads piped stdin and merges it into the initial prompt:

```bash
cat README.md | pi -p "Summarize this text"
```

### Model Options

| Option                   | Description                                                             |
|--------------------------|-------------------------------------------------------------------------|
| `--provider <name>`      | Provider (`anthropic`, `openai-codex`, or one you configured)           |
| `--model <pattern>`      | Model pattern or ID (supports `provider/id` and optional `:<thinking>`) |
| `--api-key <key>`        | API key (overrides env vars)                                            |
| `--thinking <level>`     | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`                      |
| `--models <patterns>`    | Comma-separated patterns for Ctrl+P cycling                             |
| `--list-models [search]` | List available models                                                   |

### Session Options

| Option                | Description                                                   |
|-----------------------|---------------------------------------------------------------|
| `-c`, `--continue`    | Continue most recent session                                  |
| `-r`, `--resume`      | Browse and select session                                     |
| `--session <path>`    | Use specific session file or partial UUID                     |
| `--fork <path>`       | Fork specific session file or partial UUID into a new session |
| `--session-dir <dir>` | Custom session storage directory                              |
| `--no-session`        | Ephemeral mode (don't save)                                   |

### Tool Options

| Option           | Description                                                      |
|------------------|------------------------------------------------------------------|
| `--tools <list>` | Enable specific built-in tools (default: `read,bash,edit,write`) |
| `--no-tools`     | Disable all built-in tools (extension tools still work)          |

Available built-in tools: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`

### Resource Options

| Option                     | Description                             |
|----------------------------|-----------------------------------------|
| `-e`, `--extension <path>` | Load extension from a path (repeatable) |
| `--no-extensions`          | Disable extension discovery             |
| `--skill <path>`           | Load skill (repeatable)                 |
| `--no-skills`              | Disable skill discovery                 |
| `--prompt-template <path>` | Load prompt template (repeatable)       |
| `--no-prompt-templates`    | Disable prompt template discovery       |
| `--theme <path>`           | Load theme (repeatable)                 |
| `--no-themes`              | Disable theme discovery                 |

Combine `--no-*` with explicit flags to load exactly what you need, ignoring settings.json (e.g., `--no-extensions -e ./my-ext.ts`).

### Other Options

| Option                          | Description                                                      |
|---------------------------------|------------------------------------------------------------------|
| `--system-prompt <text>`        | Replace default prompt (context files and skills still appended) |
| `--append-system-prompt <text>` | Append to system prompt                                          |
| `-h`, `--help`                  | Show help                                                        |
| `-v`, `--version`               | Show version                                                     |

### File Arguments

Prefix files with `@` to include in the message:

```bash
pi @prompt.md "Answer this"
pi -p @screenshot.png "What's in this image?"
pi @code.ts @test.ts "Review these files"
```

### Examples

```bash
# Interactive with initial prompt
pi "List all .ts files in src/"

# Non-interactive
pi -p "Summarize this codebase"

# Non-interactive with piped stdin
cat README.md | pi -p "Summarize this text"

# Different model
pi --provider openai-codex --model gpt-5.6-sol "Help me refactor"

# Model with provider prefix (no --provider needed)
pi --model openai-codex/gpt-5.6-sol "Help me refactor"

# Model with thinking level shorthand
pi --model sonnet:high "Solve this complex problem"

# Limit model cycling
pi --models "claude-*,gpt-5*"

# Read-only mode
pi --tools read,grep,find,ls -p "Review the code"

# High thinking level
pi --thinking high "Solve this complex problem"
```

### Environment Variables

| Variable              | Description                                                                        |
|-----------------------|------------------------------------------------------------------------------------|
| `PI_CODING_AGENT_DIR` | Override config directory (default: `~/.pi/agent`)                                 |
| `PI_PACKAGE_DIR`      | Override package directory (useful for Nix/Guix where store paths tokenize poorly) |
| `PI_CACHE_RETENTION`  | Set to `long` for extended prompt cache (Anthropic: 1h, OpenAI: 24h)               |
| `VISUAL`, `EDITOR`    | External editor for Ctrl+G                                                         |

---

## Packages

| Package                 | Purpose                       |
|-------------------------|-------------------------------|
| `packages/ai`           | Provider and streaming layer  |
| `packages/agent`        | Agent loop and tool execution |
| `packages/tui`          | Terminal UI components        |
| `packages/coding-agent` | The CLI itself                |

Run `just` to see the available recipes.

---

## License

MIT
