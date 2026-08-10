import { toModelCost, toModelInput, toThinkingLevelMap } from "../shared.js";
import type { ModelsDevApi } from "../shared.js";
import type { Api, Model, ThinkingLevelMap } from "../../src/types.js";

const OPENCODE_GO_BASE_URL_ANTHROPIC = "https://opencode.ai/zen/go";
const OPENCODE_GO_BASE_URL_OPENAI = "https://opencode.ai/zen/go/v1";
const OPENCODE_GO_OPENAI_COMPLETIONS_IDS = new Set(["minimax-m2.7", "qwen3.5-plus", "qwen3.6-plus"]);

const OPENCODE_GO_KIMI_K26_THINKING_LEVEL_MAP: ThinkingLevelMap = {
    minimal: null,
    low: null,
    medium: null,
};

const OPENCODE_GO_GLM52_THINKING_LEVEL_MAP: ThinkingLevelMap = {
    minimal: null,
    low: null,
    medium: null,
    high: "high",
    xhigh: "max",
};

const DEEPSEEK_V4_THINKING_LEVEL_MAP: ThinkingLevelMap = {
    minimal: null,
    low: null,
    medium: null,
    high: "high",
    xhigh: "max",
};

export function buildOpenCodeGoModels(catalog: ModelsDevApi): Model<any>[] {
    const models: Model<any>[] = [];

    for (const [modelId, m] of Object.entries(catalog["opencode-go"]?.models ?? {})) {
        if (m.tool_call !== true) continue;
        if (modelId === "gpt-5.3-codex-spark") continue;

        const npm = m.provider?.npm;
        let api: Api;
        let baseUrl: string;

        if (OPENCODE_GO_OPENAI_COMPLETIONS_IDS.has(modelId)) {
            api = "openai-completions";
            baseUrl = OPENCODE_GO_BASE_URL_OPENAI;
        } else if (npm === "@ai-sdk/anthropic") {
            api = "anthropic-messages";
            baseUrl = OPENCODE_GO_BASE_URL_ANTHROPIC;
        } else {
            api = "openai-completions";
            baseUrl = OPENCODE_GO_BASE_URL_OPENAI;
        }

        let thinkingLevelMap = toThinkingLevelMap(m);
        if (modelId === "kimi-k2.6") {
            thinkingLevelMap = { ...thinkingLevelMap, ...OPENCODE_GO_KIMI_K26_THINKING_LEVEL_MAP };
        }
        if (modelId === "glm-5.2") {
            thinkingLevelMap = { ...thinkingLevelMap, ...OPENCODE_GO_GLM52_THINKING_LEVEL_MAP };
        }
        if (modelId === "deepseek-v4-pro" || modelId === "deepseek-v4-flash") {
            thinkingLevelMap = { ...thinkingLevelMap, ...DEEPSEEK_V4_THINKING_LEVEL_MAP };
        }

        models.push({
            id: modelId,
            name: m.name || modelId,
            api,
            provider: "opencode-go",
            baseUrl,
            reasoning: m.reasoning === true,
            input: toModelInput(m),
            cost: toModelCost(m.cost),
            contextWindow: m.limit?.context || 4096,
            maxTokens: m.limit?.output || 4096,
            thinkingLevelMap,
            supportsTemperature: m.temperature === true,
            ...(api === "openai-completions"
                ? {
                        compat: {
                            supportsDeveloperRole: false,
                            supportsReasoningEffort: false,
                            supportsStore: false,
                        },
                    }
                : {}),
        });
    }

    console.log(`Loaded ${models.length} tool-capable opencode-go models from models.dev`);
    return models;
}