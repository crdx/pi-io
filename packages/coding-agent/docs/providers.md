# Providers

Pi supports subscription-based providers via OAuth and API key providers via environment variables or auth file. For each provider, pi knows all available models. The list is updated with every pi release.

## Table of Contents

- [Subscriptions](#subscriptions)
- [API Keys](#api-keys)
- [Auth File](#auth-file)
- [Custom Providers](#custom-providers)
- [Resolution Order](#resolution-order)

## Subscriptions

Use `/login` in interactive mode, then select a provider:

- Claude Pro/Max
- ChatGPT Plus/Pro (Codex)

Use `/logout` to clear credentials. Tokens are stored in `~/.pi/agent/auth.json` and auto-refresh when expired.

### OpenAI Codex

- Requires ChatGPT Plus or Pro subscription
- Personal use only; for production, use the OpenAI Platform API

## API Keys

### Environment Variables or Auth File

Set via environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

| Provider     | Environment Variable | `auth.json` key |
|--------------|----------------------|-----------------|
| Anthropic    | `ANTHROPIC_API_KEY`  | `anthropic`     |
| OpenAI       | `OPENAI_API_KEY`     | `openai`        |
| Groq         | `GROQ_API_KEY`       | `groq`          |
| Cerebras     | `CEREBRAS_API_KEY`   | `cerebras`      |
| xAI          | `XAI_API_KEY`        | `xai`           |
| OpenRouter   | `OPENROUTER_API_KEY` | `openrouter`    |
| ZAI          | `ZAI_API_KEY`        | `zai`           |
| OpenCode Zen | `OPENCODE_API_KEY`   | `opencode`      |
| OpenCode Go  | `OPENCODE_API_KEY`   | `opencode-go`   |
| Hugging Face | `HF_TOKEN`           | `huggingface`   |

Reference for environment variables and `auth.json` keys: [`const envMap`](https://github.com/earendil-works/pi/blob/main/packages/ai/src/env-api-keys.ts) in [`packages/ai/src/env-api-keys.ts`](https://github.com/earendil-works/pi/blob/main/packages/ai/src/env-api-keys.ts).

#### Auth File

Store credentials in `~/.pi/agent/auth.json`:

```json
{
  "anthropic": { "type": "api_key", "key": "sk-ant-..." },
  "openai": { "type": "api_key", "key": "sk-..." },
  "opencode": { "type": "api_key", "key": "..." },
  "opencode-go": { "type": "api_key", "key": "..." }
}
```

The file is created with `0600` permissions (user read/write only). Auth file credentials take priority over environment variables.

### Key Resolution

The `key` field supports three formats:

- **Shell command:** `"!command"` executes and uses stdout (cached for process lifetime)

  ```json
  { "type": "api_key", "key": "!security find-generic-password -ws 'anthropic'" }
  { "type": "api_key", "key": "!op read 'op://vault/item/credential'" }
  ```

- **Environment variable:** Uses the value of the named variable

  ```json
  { "type": "api_key", "key": "MY_ANTHROPIC_KEY" }
  ```

- **Literal value:** Used directly

  ```json
  { "type": "api_key", "key": "sk-ant-..." }
  ```

OAuth credentials are also stored here after `/login` and managed automatically.

## Custom Providers

**Via models.json:** Add Ollama, LM Studio, vLLM, or any provider that speaks a supported API (OpenAI Completions, OpenAI Responses, Anthropic Messages). See [models.md](models.md).

**Via extensions:** For providers that need custom API implementations or OAuth flows, create an extension. See [custom-provider.md](custom-provider.md).

## Resolution Order

When resolving credentials for a provider:

1. CLI `--api-key` flag
2. `auth.json` entry (API key or OAuth token)
3. Environment variable
4. Custom provider keys from `models.json`
