#!/usr/bin/env tsx

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Api, Model } from "../src/types.js";

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
}

/** Only the anthropic and openai slices are consumed; every other provider was dropped from the fork. */
interface ModelsDevApi {
	anthropic?: {
		models?: Record<string, ModelsDevModel>;
	};
	openai?: {
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

function buildAnthropicModels(catalog: ModelsDevApi): Model<any>[] {
	const models: Model<any>[] = [];

	for (const [modelId, m] of Object.entries(catalog.anthropic?.models ?? {})) {
		if (m.tool_call !== true) continue;

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
		};
	});

	console.log(`Derived ${models.length} openai-codex models from models.dev`);
	return models;
}

/** A models.dev response that parses but carries almost nothing would otherwise gut the registry. */
const MINIMUM_ANTHROPIC_MODELS = 10;

function assertRegistryIsPlausible(providers: Record<string, Record<string, Model<any>>>) {
	const anthropicCount = Object.keys(providers.anthropic ?? {}).length;
	if (anthropicCount < MINIMUM_ANTHROPIC_MODELS) {
		throw new Error(`Only ${anthropicCount} anthropic models resolved, expected at least ${MINIMUM_ANTHROPIC_MODELS}`);
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

	// Fix incorrect cache pricing for Claude Opus 4.5 from models.dev
	// models.dev has 3x the correct pricing (1.5/18.75 instead of 0.5/6.25)
	const opus45 = allModels.find(m => m.provider === "anthropic" && m.id === "claude-opus-4-5");
	if (opus45) {
		opus45.cost.cacheRead = 0.5;
		opus45.cost.cacheWrite = 6.25;
	}

	// Temporary overrides until upstream model metadata is corrected.
	for (const candidate of allModels) {
		if (
			candidate.id === "claude-opus-4-6" ||
			candidate.id === "claude-sonnet-4-6" ||
			candidate.id === "claude-opus-4.6" ||
			candidate.id === "claude-sonnet-4.6"
		) {
			candidate.contextWindow = 1000000;
		}
	}

	// Add missing Claude Opus 4.6
	if (!allModels.some(m => m.provider === "anthropic" && m.id === "claude-opus-4-6")) {
		allModels.push({
			id: "claude-opus-4-6",
			name: "Claude Opus 4.6",
			api: "anthropic-messages",
			baseUrl: "https://api.anthropic.com",
			provider: "anthropic",
			reasoning: true,
			input: ["text", "image"],
			cost: {
				input: 5,
				output: 25,
				cacheRead: 0.5,
				cacheWrite: 6.25,
			},
			contextWindow: 1000000,
			maxTokens: 128000,
		});
	}

	// Add missing Claude Opus 4.7
	if (!allModels.some(m => m.provider === "anthropic" && m.id === "claude-opus-4-7")) {
		allModels.push({
			id: "claude-opus-4-7",
			name: "Claude Opus 4.7",
			api: "anthropic-messages",
			baseUrl: "https://api.anthropic.com",
			provider: "anthropic",
			reasoning: true,
			input: ["text", "image"],
			cost: {
				input: 5,
				output: 25,
				cacheRead: 0.5,
				cacheWrite: 6.25,
			},
			contextWindow: 1000000,
			maxTokens: 128000,
		});
	}

	// Add missing Claude Sonnet 4.6
	if (!allModels.some(m => m.provider === "anthropic" && m.id === "claude-sonnet-4-6")) {
		allModels.push({
			id: "claude-sonnet-4-6",
			name: "Claude Sonnet 4.6",
			api: "anthropic-messages",
			baseUrl: "https://api.anthropic.com",
			provider: "anthropic",
			reasoning: true,
			input: ["text", "image"],
			cost: {
				input: 3,
				output: 15,
				cacheRead: 0.3,
				cacheWrite: 3.75,
			},
			contextWindow: 1000000,
			maxTokens: 64000,
		});
	}

	allModels.push(...buildCodexModels(catalog));

	// Group by provider and deduplicate by model ID
	const providers: Record<string, Record<string, Model<any>>> = {};
	for (const model of allModels) {
		if (!providers[model.provider]) {
			providers[model.provider] = {};
		}
		// Use model ID as key to automatically deduplicate; first occurrence wins
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
