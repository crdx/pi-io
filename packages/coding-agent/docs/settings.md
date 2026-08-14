# Settings

Pi uses JSON settings files with project settings overriding global settings.

| Location                    | Scope                       |
|-----------------------------|-----------------------------|
| `~/.pi/agent/settings.json` | Global (all projects)       |
| `.pi/settings.json`         | Project (current directory) |

Edit directly or use `/settings` for common options.

## All Settings

### Model & Thinking

| Setting                | Type    | Default | Description                                                    |
|------------------------|---------|---------|----------------------------------------------------------------|
| `defaultProvider`      | string  | -       | Default provider (e.g., `"anthropic"`, `"openai"`)             |
| `defaultModel`         | string  | -       | Default model ID                                               |
| `defaultThinkingLevel` | string  | -       | `"off"`, `"minimal"`, `"low"`, `"medium"`, `"high"`, `"xhigh"` |
| `hideThinkingBlock`    | boolean | `false` | Hide thinking blocks in output                                 |
| `thinkingBudgets`      | object  | -       | Custom token budgets per thinking level                        |

#### thinkingBudgets

```json
{
  "thinkingBudgets": {
    "minimal": 1024,
    "low": 4096,
    "medium": 10240,
    "high": 32768
  }
}
```

### UI & Display

| Setting              | Type    | Default     | Description                                                                                     |
|----------------------|---------|-------------|-------------------------------------------------------------------------------------------------|
| `theme`              | string  | `"dark"`    | Theme name (`"dark"` or custom)                                                                 |
| `doubleEscapeAction` | string  | `"tree"`    | Action for double-escape: `"tree"`, `"fork"`, or `"none"`                                       |
| `treeFilterMode`     | string  | `"default"` | Default filter for `/tree`: `"default"`, `"no-tools"`, `"user-only"`, `"labeled-only"`, `"all"` |

### Retry

| Setting             | Type    | Default | Description                                     |
|---------------------|---------|---------|-------------------------------------------------|
| `retry.enabled`     | boolean | `true`  | Enable automatic retry on transient errors      |
| `retry.maxRetries`  | number  | `3`     | Maximum retry attempts                          |
| `retry.baseDelayMs` | number  | `2000`  | Base delay for exponential backoff (2s, 4s, 8s) |
| `retry.maxDelayMs`  | number  | `60000` | Max server-requested delay before failing (60s) |

When a provider requests a retry delay longer than `maxDelayMs` (e.g., Google's "quota will reset after 5h"), the request fails immediately with an informative error instead of waiting silently. Set to `0` to disable the cap.

```json
{
  "retry": {
    "enabled": true,
    "maxRetries": 3,
    "baseDelayMs": 2000,
    "maxDelayMs": 60000
  }
}
```

### Message Delivery

A message typed while the agent is working can reach it three ways. **Steering** queues it until the current assistant turn has finished its tool calls. **Follow-up** queues it until the agent runs out of work entirely. **Interrupt** abandons the turn in flight and sends the message as a new one.

Follow-up has Alt+Enter to itself. Steering and interrupt compete for Enter, so `enterBehavior` decides which one gets it, and `app.message.secondary` (Ctrl+Alt+Enter) always sends the other.

| Setting         | Type   | Default           | Description                                                                                             |
|-----------------|--------|-------------------|---------------------------------------------------------------------------------------------------------|
| `enterBehavior` | string | `"steer"`         | What Enter does while the agent is busy: `"steer"` or `"interrupt"`                                     |
| `steeringMode`  | string | `"one-at-a-time"` | How steering messages are sent: `"all"` or `"one-at-a-time"`                                            |
| `followUpMode`  | string | `"one-at-a-time"` | How follow-up messages are sent: `"all"` or `"one-at-a-time"`                                           |
| `transport`     | string | `"sse"`           | Preferred transport for providers that support multiple transports: `"sse"`, `"websocket"`, or `"auto"` |

### Images

| Setting             | Type    | Default | Description                                              |
|---------------------|---------|---------|----------------------------------------------------------|
| `images.autoResize` | boolean | `true`  | Resize read, pasted and attached images to 2000x2000 max |

### Shell

| Setting              | Type   | Default | Description                                                       |
|----------------------|--------|---------|-------------------------------------------------------------------|
| `shellCommandPrefix` | string | -       | Prefix for every bash command (e.g., `"shopt -s expand_aliases"`) |

### Model Cycling

| Setting         | Type     | Default | Description                                                            |
|-----------------|----------|---------|------------------------------------------------------------------------|
| `enabledModels` | string[] | -       | Model patterns for Ctrl+P cycling (same format as `--models` CLI flag) |

```json
{
  "enabledModels": ["claude-*", "gpt-5*", "ollama/*"]
}
```

### Markdown

| Setting                    | Type   | Default | Description                 |
|----------------------------|--------|---------|-----------------------------|
| `markdown.codeBlockIndent` | string | `"  "`  | Indentation for code blocks |

### Resources

These settings define where to load extensions, skills, prompts, and themes from.

Paths in `~/.pi/agent/settings.json` resolve relative to `~/.pi/agent`. Paths in `.pi/settings.json` resolve relative to `.pi`. Absolute paths and `~` are supported.

| Setting               | Type     | Default | Description                                |
|-----------------------|----------|---------|--------------------------------------------|
| `extensions`          | string[] | `[]`    | Local extension file paths or directories  |
| `skills`              | string[] | `[]`    | Local skill file paths or directories      |
| `prompts`             | string[] | `[]`    | Local prompt template paths or directories |
| `themes`              | string[] | `[]`    | Local theme file paths or directories      |
| `enableSkillCommands` | boolean  | `true`  | Register skills as `/skill:name` commands  |

Arrays support glob patterns and exclusions. Use `!pattern` to exclude. Use `+path` to force-include an exact path and `-path` to force-exclude an exact path.

## Example

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "defaultThinkingLevel": "medium",
  "theme": "dark",
  "retry": {
    "enabled": true,
    "maxRetries": 3
  },
  "enabledModels": ["claude-*", "gpt-4o"],
  "extensions": ["extensions/review.ts"]
}
```

## Project Overrides

Project settings (`.pi/settings.json`) override global settings. Nested objects are merged:

```json
// ~/.pi/agent/settings.json (global)
{
  "theme": "dark",
  "retry": { "enabled": true, "maxRetries": 3 }
}

// .pi/settings.json (project)
{
  "retry": { "maxRetries": 5 }
}

// Result
{
  "theme": "dark",
  "retry": { "enabled": true, "maxRetries": 5 }
}
```
