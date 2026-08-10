import { toModelCost, toModelInput, toThinkingLevelMap } from "../shared.js";
import type { ModelsDevApi, ModelsDevModel } from "../shared.js";
import type { Api, Model, ThinkingLevelMap } from "../../src/types.js";

const ANTHROPIC_BUDGET_THINKING_IDS = ["claude-haiku-4-5"];

const ANTHROPIC_NO_THINKING_DISABLED_IDS = ["claude-fable-5"];

const ANTHROPIC_EXCLUDED_IDS = [
	"claude-haiku-4-5-20251001",
	"claude-opus-4-5",
	"claude-opus-4-5-20251101",
	"claude-sonnet-4-5",
	"claude-sonnet-4-5-20250929",
];

export function buildAnthropicModels(catalog: ModelsDevApi): Model<any>[] {
	const models: Model<any>[] = [];

	const catalogIds = new Set(Object.keys(catalog.anthropic?.models ?? {}));
	const staleExclusions = ANTHROPIC_EXCLUDED_IDS.filter(id => !catalogIds.has(id));
	if (staleExclusions.length > 0) {
		throw new Error(`Excluded anthropic models are no longer published upstream: ${staleExclusions.join(", ")}`);
	}

	for (const [modelId, m] of Object.entries(catalog.anthropic?.models ?? {})) {
		if (m.tool_call !== true) continue;
		if (ANTHROPIC_EXCLUDED_IDS.includes(modelId)) continue;

		models.push({
			id: modelId,
			name: m.name || modelId,
			api: "anthropic-messages",
			provider: "anthropic",
			baseUrl: "https://api.anthropic.com",
			reasoning: m.reasoning === true,
			input: toModelInput(m),
			cost: toModelCost(m.cost),
			contextWindow: m.limit?.context || 4096,
			maxTokens: m.limit?.output || 4096,
			thinkingLevelMap: toThinkingLevelMap(m),
			thinkingMode: ANTHROPIC_BUDGET_THINKING_IDS.includes(modelId) ? "budget" : undefined,
			supportsTemperature: m.temperature === true,
			supportsThinkingDisabled: !ANTHROPIC_NO_THINKING_DISABLED_IDS.includes(modelId),
		});
	}

	console.log(`Loaded ${models.length} tool-capable anthropic models from models.dev`);
	return models;
}
