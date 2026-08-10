#!/usr/bin/env tsx

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Api, Model, ThinkingLevelMap } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "..");

interface ModelsDevModel {
	id: string;
	name: string;
	tool_call?: boolean;
	reasoning?: boolean;
	limit?: {
		context?: number;
		output?: number;
	};
	cost?: {
		input?: number;
		output?: number;
		cache_read?: number;
		cache_write?: number;
		tiers?: {
			input?: number;
			output?: number;
			cache_read?: number;
			cache_write?: number;
			tier?: {
				type?: string;
				size?: number;
			};
		}[];
	};
	modalities?: {
		input?: string[];
	};
	provider?: {
		npm?: string;
	};
	temperature?: boolean;
	reasoning_options?: {
		type?: string;
		values?: string[];
		min?: number;
	}[];
}

/** Only the anthropic, openai, and opencode-go slices are consumed; every other provider was dropped from the fork. */
interface ModelsDevApi {
	anthropic?: {
		models?: Record<string, ModelsDevModel>;
	};
	openai?: {
		models?: Record<string, ModelsDevModel>;
	};
	"opencode-go"?: {
		models?: Record<string, ModelsDevModel>;
	};
}

async function fetchModelsDevCatalog(): Promise<ModelsDevApi> {
	console.log("Fetching models from models.dev API...");
	const response = await fetch("https://models.dev/api.json");
	if (!response.ok) throw new Error(`models.dev API returned ${response.status} ${response.statusText}`);
	return (await response.json()) as ModelsDevApi;
}

function toModelInput(model: ModelsDevModel): Model<Api>["input"] {
	return model.modalities?.input?.includes("image") ? ["text", "image"] : ["text"];
}

/** models.dev expresses request-wide pricing bands as `cost.tiers[].tier = {type: "context", size}`. */
function toModelCost(cost: ModelsDevModel["cost"]): Model<Api>["cost"] {
	const tiers = (cost?.tiers ?? []).flatMap(tier =>
		tier.tier?.type === "context" && tier.tier.size !== undefined
			? [
					{
						inputTokensAbove: tier.tier.size,
						input: tier.input || 0,
						output: tier.output || 0,
						cacheRead: tier.cache_read || 0,
						cacheWrite: tier.cache_write || 0,
					},
				]
			: [],
	);

	return {
		input: cost?.input || 0,
		output: cost?.output || 0,
		cacheRead: cost?.cache_read || 0,
		cacheWrite: cost?.cache_write || 0,
		...(tiers.length > 0 ? { tiers } : {}),
	};
}

// models.dev publishes which effort values each model accepts, but not which thinking mode the
// Anthropic API expects, and not whether thinking can be disabled. Those two stay listed by hand.
// claude-opus-4-5 is why: it publishes `effort` yet rejects `thinking: {type: "adaptive"}` with a 400.
//
// Listed the legacy way round deliberately, so an unrecognised model gets adaptive rather than
// budget. Budget thinking on a model that wants adaptive is accepted and silently under-thinks,
// which is how claude-sonnet-5 went unnoticed; adaptive on a budget model is a 400. This set only
// ever shrinks, since a model never moves from adaptive back to budget.
const ANTHROPIC_BUDGET_THINKING_IDS = ["claude-haiku-4-5"];

const ANTHROPIC_NO_THINKING_DISABLED_IDS = ["claude-fable-5"];

// Older generations this fork never selects, plus the dated aliases of the models it does. Keeps the
// registry to what settings.json can actually reach. Checked against the upstream catalog rather
// than the generated registry, since an entry here is by definition absent from the output.
const ANTHROPIC_EXCLUDED_IDS = [
	"claude-haiku-4-5-20251001",
	"claude-opus-4-5",
	"claude-opus-4-5-20251101",
	"claude-sonnet-4-5",
	"claude-sonnet-4-5-20250929",
];

function getEffortValues(model: ModelsDevModel): string[] | undefined {
	return (model.reasoning_options ?? []).find(option => option.type === "effort")?.values;
}

/**
 * Resolve every pi thinking level to a published effort string, so the runtime never has to guess.
 * `xhigh` falls back to `max` because Opus 4.6 and Sonnet 4.6 offer `max` without `xhigh`.
 */
function toThinkingLevelMap(model: ModelsDevModel): ThinkingLevelMap | undefined {
	const values = getEffortValues(model);
	if (!values || values.length === 0) return undefined;

	const has = (value: string) => values.includes(value);
	const map: ThinkingLevelMap = {
		minimal: has("minimal") ? "minimal" : "low",
		low: "low",
		medium: "medium",
		high: "high",
		xhigh: has("xhigh") ? "xhigh" : has("max") ? "max" : "high",
	};
	if (has("none")) map.off = "none";
	return map;
}

function buildAnthropicModels(catalog: ModelsDevApi): Model<any>[] {
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

// OpenAI Codex (ChatGPT OAuth) models. models.dev has no codex provider, but it publishes these under
// plain `openai`, so pricing, naming, modalities and output limits are all derived from that slice and
// only the api/provider/baseUrl are swapped. Nothing here is hand-priced.
//
// Context window is the one thing not derived: the ChatGPT backend caps at ~272k regardless of the
// published API limit (400s above it), so it stays pinned. models.dev reports 922k input for the 5.5
// and 5.6 models, which is the API's number and not the one Codex honours.
//
// Codex serves aliases with no models.dev counterpart (gpt-5.1-codex-max, gpt-5.2-codex and so on).
// Adding one means hand-writing its pricing, which the daily regeneration will never correct, so the
// list is deliberately confined to models that models.dev covers.
const CODEX_BASE_URL = "https://chatgpt.com/backend-api";
const CODEX_CONTEXT = 272000;
const CODEX_MODEL_IDS = ["gpt-5.4-mini", "gpt-5.5", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra"];

function buildCodexModels(catalog: ModelsDevApi): Model<"openai-codex-responses">[] {
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

// DeepSeek V4 only exposes high/max reasoning effort; lower tiers are unsupported.
const DEEPSEEK_V4_THINKING_LEVEL_MAP: ThinkingLevelMap = {
	minimal: null,
	low: null,
	medium: null,
	high: "high",
	xhigh: "max",
};

function buildOpenCodeGoModels(catalog: ModelsDevApi): Model<any>[] {
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

/** A models.dev response that parses but carries almost nothing would otherwise gut the registry. */
const MINIMUM_ANTHROPIC_MODELS = 8;

function assertRegistryIsPlausible(providers: Record<string, Record<string, Model<any>>>) {
	const anthropicCount = Object.keys(providers.anthropic ?? {}).length;
	if (anthropicCount < MINIMUM_ANTHROPIC_MODELS) {
		throw new Error(`Only ${anthropicCount} anthropic models resolved, expected at least ${MINIMUM_ANTHROPIC_MODELS}`);
	}

	const anthropicIds = new Set(Object.keys(providers.anthropic ?? {}));
	const staleIds = [...ANTHROPIC_BUDGET_THINKING_IDS, ...ANTHROPIC_NO_THINKING_DISABLED_IDS].filter(
		id => !anthropicIds.has(id),
	);
	if (staleIds.length > 0) {
		throw new Error(`Hand-maintained anthropic capability lists name models that no longer exist: ${staleIds.join(", ")}`);
	}

	const expectedCodexIds = [...CODEX_MODEL_IDS].sort();
	const actualCodexIds = Object.keys(providers["openai-codex"] ?? {}).sort();
	if (actualCodexIds.join(",") !== expectedCodexIds.join(",")) {
		throw new Error(`openai-codex models are [${actualCodexIds.join(", ")}], expected [${expectedCodexIds.join(", ")}]`);
	}
}

async function generateModels() {
	const catalog = await fetchModelsDevCatalog();
	const allModels = buildAnthropicModels(catalog);
	allModels.push(...buildCodexModels(catalog));
	allModels.push(...buildOpenCodeGoModels(catalog));

	// Post-generation corrections for opencode-go context windows and limits.
	for (const candidate of allModels) {
		if (candidate.provider !== "opencode-go") continue;

		// OpenCode Go lists Claude Sonnet 4/4.5 with inflated context; actual limit is 200K.
		if (candidate.id === "claude-sonnet-4-5" || candidate.id === "claude-sonnet-4") {
			candidate.contextWindow = 200000;
		}

		// GPT-5.4 context is capped at 272K on the Go endpoint.
		if (candidate.id === "gpt-5.4") {
			candidate.contextWindow = 272000;
			candidate.maxTokens = 128000;
		}

		// Claude Opus 4.6 / Sonnet 4.6 context is 1M.
		if (
			candidate.id === "claude-opus-4-6" ||
			candidate.id === "claude-sonnet-4-6" ||
			candidate.id === "claude-opus-4.6" ||
			candidate.id === "claude-sonnet-4.6"
		) {
			candidate.contextWindow = 1000000;
		}

		// DeepSeek V4 only supports high/max reasoning effort on the Go endpoint.
		if (candidate.id === "deepseek-v4-pro" || candidate.id === "deepseek-v4-flash") {
			candidate.thinkingLevelMap = {
				...candidate.thinkingLevelMap,
				...DEEPSEEK_V4_THINKING_LEVEL_MAP,
			};
		}
	}

	const providers: Record<string, Record<string, Model<any>>> = {};
	for (const model of allModels) {
		if (!providers[model.provider]) {
			providers[model.provider] = {};
		}
		if (!providers[model.provider][model.id]) {
			providers[model.provider][model.id] = model;
		}
	}

	assertRegistryIsPlausible(providers);

	// Generate TypeScript file
	let output = `// This file is auto-generated by scripts/generate-models.ts
// Do not edit manually - run 'npm run generate-models' to update

import type { Model } from "./types.js";

export const MODELS = {
`;

	// Generate provider sections (sorted for deterministic output)
	const sortedProviderIds = Object.keys(providers).sort();
	for (const providerId of sortedProviderIds) {
		const models = providers[providerId];
		output += `\t${JSON.stringify(providerId)}: {\n`;

		const sortedModelIds = Object.keys(models).sort();
		for (const modelId of sortedModelIds) {
			const model = models[modelId];
			output += `\t\t"${model.id}": {\n`;
			output += `\t\t\tid: "${model.id}",\n`;
			output += `\t\t\tname: "${model.name}",\n`;
			output += `\t\t\tapi: "${model.api}",\n`;
			output += `\t\t\tprovider: "${model.provider}",\n`;
			if (model.baseUrl !== undefined) {
				output += `\t\t\tbaseUrl: "${model.baseUrl}",\n`;
			}
			if (model.headers) {
				output += `\t\t\theaders: ${JSON.stringify(model.headers)},\n`;
			}
			if (model.compat) {
				output += `			compat: ${JSON.stringify(model.compat)},
`;
			}
			output += `\t\t\treasoning: ${model.reasoning},\n`;
			output += `\t\t\tinput: [${model.input.map(i => `"${i}"`).join(", ")}],\n`;
			output += `\t\t\tcost: {\n`;
			output += `\t\t\t\tinput: ${model.cost.input},\n`;
			output += `\t\t\t\toutput: ${model.cost.output},\n`;
			output += `\t\t\t\tcacheRead: ${model.cost.cacheRead},\n`;
			output += `\t\t\t\tcacheWrite: ${model.cost.cacheWrite},\n`;
			if (model.cost.tiers?.length) {
				output += `\t\t\t\ttiers: [\n`;
				for (const tier of model.cost.tiers) {
					output += `\t\t\t\t\t{\n`;
					output += `\t\t\t\t\t\tinputTokensAbove: ${tier.inputTokensAbove},\n`;
					output += `\t\t\t\t\t\tinput: ${tier.input},\n`;
					output += `\t\t\t\t\t\toutput: ${tier.output},\n`;
					output += `\t\t\t\t\t\tcacheRead: ${tier.cacheRead},\n`;
					output += `\t\t\t\t\t\tcacheWrite: ${tier.cacheWrite},\n`;
					output += `\t\t\t\t\t},\n`;
				}
				output += `\t\t\t\t],\n`;
			}
			output += `\t\t\t},\n`;
			output += `\t\t\tcontextWindow: ${model.contextWindow},\n`;
			output += `\t\t\tmaxTokens: ${model.maxTokens},\n`;
			if (model.thinkingLevelMap) {
				output += `\t\t\tthinkingLevelMap: ${JSON.stringify(model.thinkingLevelMap)},\n`;
			}
			if (model.thinkingMode !== undefined) {
				output += `\t\t\tthinkingMode: "${model.thinkingMode}",\n`;
			}
			if (model.supportsTemperature !== undefined) {
				output += `\t\t\tsupportsTemperature: ${model.supportsTemperature},\n`;
			}
			if (model.supportsThinkingDisabled !== undefined) {
				output += `\t\t\tsupportsThinkingDisabled: ${model.supportsThinkingDisabled},\n`;
			}
			output += `\t\t} satisfies Model<"${model.api}">,\n`;
		}

		output += `\t},\n`;
	}

	output += `} as const;
`;

	// Write file
	writeFileSync(join(packageRoot, "src/models.generated.ts"), output);
	console.log("Generated src/models.generated.ts");

	// Print statistics
	const totalModels = allModels.length;
	const reasoningModels = allModels.filter(m => m.reasoning).length;

	console.log(`\nModel Statistics:`);
	console.log(`  Total tool-capable models: ${totalModels}`);
	console.log(`  Reasoning-capable models: ${reasoningModels}`);

	for (const [provider, models] of Object.entries(providers)) {
		console.log(`  ${provider}: ${Object.keys(models).length} models`);
	}
}

// Run the generator
generateModels().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
