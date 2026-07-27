import { MODELS } from "./models.generated.js";
import type { Api, Model, ModelCost, ModelCostRates, Usage } from "./types.js";

const modelRegistry: Map<string, Map<string, Model<Api>>> = new Map();

// Initialize registry from MODELS on module load
for (const [provider, models] of Object.entries(MODELS)) {
	const providerModels = new Map<string, Model<Api>>();
	for (const [id, model] of Object.entries(models)) {
		providerModels.set(id, model as Model<Api>);
	}
	modelRegistry.set(provider, providerModels);
}

// Providers present in the generated registry, which is filtered down to the providers we
// actually use (see scripts/generate-models.ts).
export type RegistryProvider = keyof typeof MODELS;

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

export function getProviders(): RegistryProvider[] {
	return Array.from(modelRegistry.keys()) as RegistryProvider[];
}

export function getModels<TProvider extends RegistryProvider>(
	provider: TProvider,
): Model<ModelApi<TProvider, keyof (typeof MODELS)[TProvider]>>[];
export function getModels(provider: RegistryProvider): Model<Api>[];
export function getModels(provider: RegistryProvider): Model<Api>[] {
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
 * Check if a model supports the xhigh thinking level, from the effort its thinking level map
 * resolves xhigh to. Models declared by hand in models.json get it only by declaring a map.
 */
export function supportsXhigh<TApi extends Api>(model: Model<TApi>): boolean {
	const effort = model.thinkingLevelMap?.xhigh;
	return effort === "xhigh" || effort === "max";
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
