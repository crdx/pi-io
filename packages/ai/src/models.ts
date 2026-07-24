import { MODELS } from "./models.generated.js";
import { supportsXhigh as anthropicSupportsXhigh } from "./providers/anthropic-thinking.js";
import type { Api, KnownProvider, Model, ModelCost, ModelCostRates, Usage } from "./types.js";

const modelRegistry: Map<string, Map<string, Model<Api>>> = new Map();

// Initialize registry from MODELS on module load
for (const [provider, models] of Object.entries(MODELS)) {
	const providerModels = new Map<string, Model<Api>>();
	for (const [id, model] of Object.entries(models)) {
		providerModels.set(id, model as Model<Api>);
	}
	modelRegistry.set(provider, providerModels);
}

// Providers present in the generated registry; a subset of KnownProvider since the registry is
// filtered down to the providers we actually use (see scripts/generate-models.ts).
type RegistryProvider = keyof typeof MODELS;

type ModelApi<
	TProvider extends RegistryProvider,
	TModelId extends keyof (typeof MODELS)[TProvider],
> = (typeof MODELS)[TProvider][TModelId] extends { api: infer TApi } ? (TApi extends Api ? TApi : never) : never;

export function getModel<TProvider extends RegistryProvider, TModelId extends keyof (typeof MODELS)[TProvider]>(
	provider: TProvider,
	modelId: TModelId,
): Model<ModelApi<TProvider, TModelId>> {
	const providerModels = modelRegistry.get(provider);
	return providerModels?.get(modelId as string) as Model<ModelApi<TProvider, TModelId>>;
}

export function getProviders(): KnownProvider[] {
	return Array.from(modelRegistry.keys()) as KnownProvider[];
}

export function getModels<TProvider extends RegistryProvider>(
	provider: TProvider,
): Model<ModelApi<TProvider, keyof (typeof MODELS)[TProvider]>>[];
export function getModels(provider: KnownProvider): Model<Api>[];
export function getModels(provider: KnownProvider): Model<Api>[] {
	const models = modelRegistry.get(provider);
	return models ? Array.from(models.values()) : [];
}

/**
 * Pick the pricing rates for a request. Tiers apply request-wide: the tier with the highest
 * threshold below the request's total input usage wins, falling back to the base rates.
 */
function resolveCostRates(cost: ModelCost, inputTokens: number): ModelCostRates {
	let rates: ModelCostRates = cost;
	let matchedThreshold = -1;
	for (const tier of cost.tiers ?? []) {
		if (inputTokens > tier.inputTokensAbove && tier.inputTokensAbove > matchedThreshold) {
			rates = tier;
			matchedThreshold = tier.inputTokensAbove;
		}
	}
	return rates;
}

export function calculateCost<TApi extends Api>(model: Model<TApi>, usage: Usage): Usage["cost"] {
	const rates = resolveCostRates(model.cost, usage.input + usage.cacheRead + usage.cacheWrite);
	usage.cost.input = (rates.input / 1000000) * usage.input;
	usage.cost.output = (rates.output / 1000000) * usage.output;
	usage.cost.cacheRead = (rates.cacheRead / 1000000) * usage.cacheRead;
	usage.cost.cacheWrite = (rates.cacheWrite / 1000000) * usage.cacheWrite;
	usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
	return usage.cost;
}

/**
 * Check if a model supports xhigh thinking level.
 *
 * Supported today:
 * - GPT-5.2 / GPT-5.3 / GPT-5.4 model families
 * - Anthropic models per providers/anthropic-thinking.ts (Opus 4.6/4.7/4.8)
 */
export function supportsXhigh<TApi extends Api>(model: Model<TApi>): boolean {
	if (model.id.includes("gpt-5.2") || model.id.includes("gpt-5.3") || model.id.includes("gpt-5.4")) {
		return true;
	}

	return anthropicSupportsXhigh(model.id);
}

/**
 * Check if two models are equal by comparing both their id and provider.
 * Returns false if either model is null or undefined.
 */
export function modelsAreEqual<TApi extends Api>(
	a: Model<TApi> | null | undefined,
	b: Model<TApi> | null | undefined,
): boolean {
	if (!a || !b) return false;
	return a.id === b.id && a.provider === b.provider;
}
