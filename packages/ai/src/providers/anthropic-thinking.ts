import type { SimpleStreamOptions } from "../types.js";

export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

const ADAPTIVE_THINKING_MODELS = [
	"opus-4-6",
	"opus-4.6",
	"opus-4-7",
	"opus-4.7",
	"opus-4-8",
	"opus-4.8",
	"sonnet-4-6",
	"sonnet-4.6",
	"fable-5",
];

const XHIGH_MAX_MODELS = ["opus-4-6", "opus-4.6"];
const XHIGH_EFFORT_MODELS = ["opus-4-7", "opus-4.7", "opus-4-8", "opus-4.8", "fable-5"];
const XHIGH_MODELS = [...XHIGH_MAX_MODELS, ...XHIGH_EFFORT_MODELS];
const NO_TEMPERATURE_MODELS = ["opus-4-7", "opus-4.7", "opus-4-8", "opus-4.8"];
const NO_THINKING_DISABLED_MODELS = ["fable-5"];

function matchesAny(modelId: string, fragments: string[]): boolean {
	return fragments.some((fragment) => modelId.includes(fragment));
}

export function supportsAdaptiveThinking(modelId: string): boolean {
	return matchesAny(modelId, ADAPTIVE_THINKING_MODELS);
}

export function supportsXhigh(modelId: string): boolean {
	return matchesAny(modelId, XHIGH_MODELS);
}

export function supportsTemperature(modelId: string): boolean {
	return !matchesAny(modelId, NO_TEMPERATURE_MODELS);
}

export function supportsThinkingDisabled(modelId: string): boolean {
	return !matchesAny(modelId, NO_THINKING_DISABLED_MODELS);
}

export function mapThinkingLevelToEffort(level: SimpleStreamOptions["reasoning"], modelId: string): AnthropicEffort {
	switch (level) {
		case "minimal":
		case "low":
			return "low";
		case "medium":
			return "medium";
		case "high":
			return "high";
		case "xhigh":
			if (matchesAny(modelId, XHIGH_MAX_MODELS)) {
				return "max";
			}
			if (matchesAny(modelId, XHIGH_EFFORT_MODELS)) {
				return "xhigh";
			}
			return "high";
		default:
			return "high";
	}
}
