import { toModelCost, toModelInput, toThinkingLevelMap } from "../shared.js";
import type { ModelsDevApi } from "../shared.js";
import type { Model } from "../../src/types.js";

const CODEX_BASE_URL = "https://chatgpt.com/backend-api";
const CODEX_CONTEXT = 272000;
const CODEX_MODEL_IDS = ["gpt-5.4-mini", "gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra"];

export function buildCodexModels(catalog: ModelsDevApi): Model<"openai-codex-responses">[] {
    const openaiModels = catalog.openai?.models ?? {};
    const missing = CODEX_MODEL_IDS.filter(id => !openaiModels[id]);
    if (missing.length > 0) {
        throw new Error(`models.dev no longer publishes openai models: ${missing.join(", ")}`);
    }

    const models = CODEX_MODEL_IDS.map((id): Model<"openai-codex-responses"> => {
        const m = openaiModels[id];
        return {
            id,
            name: m.name || id,
            api: "openai-codex-responses",
            provider: "openai-codex",
            baseUrl: CODEX_BASE_URL,
            reasoning: m.reasoning === true,
            input: toModelInput(m),
            cost: toModelCost(m.cost),
            contextWindow: CODEX_CONTEXT,
            maxTokens: m.limit?.output || 4096,
            thinkingLevelMap: toThinkingLevelMap(m),
            supportsTemperature: m.temperature === true,
        };
    });

    console.log(`Derived ${models.length} openai-codex models from models.dev`);
    return models;
}
