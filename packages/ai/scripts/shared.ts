import { Api, Model, ThinkingLevelMap } from "../src/types.js";

export interface ModelsDevModel {
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

export interface ModelsDevApi {
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

export function toModelInput(model: ModelsDevModel): Model<Api>["input"] {
	return model.modalities?.input?.includes("image") ? ["text", "image"] : ["text"];
}

export function toModelCost(cost: ModelsDevModel["cost"]): Model<Api>["cost"] {
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

function getEffortValues(model: ModelsDevModel): string[] | undefined {
	return (model.reasoning_options ?? []).find(option => option.type === "effort")?.values;
}

export function toThinkingLevelMap(model: ModelsDevModel): ThinkingLevelMap | undefined {
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
