import type { Api, Model, SimpleStreamOptions } from "../types.js";

export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Whether the model expects `thinking: {type: "adaptive"}` rather than a token budget.
 * Undeclared models are treated as modern, since budget thinking is what 4.7+ reject.
 */
export function supportsAdaptiveThinking(model: Model<Api>): boolean {
	return (model.thinkingMode ?? "adaptive") === "adaptive";
}

/**
 * Whether the model accepts a temperature. Sending one to a modern Anthropic model errors,
 * while omitting it never does, so anthropic-messages defaults to false and everything else to true.
 */
export function supportsTemperature(model: Model<Api>): boolean {
	return model.supportsTemperature ?? model.api !== "anthropic-messages";
}

/** Whether the model accepts `thinking: {type: "disabled"}`. Fable 5 is the one that does not. */
export function supportsThinkingDisabled(model: Model<Api>): boolean {
	return model.supportsThinkingDisabled ?? true;
}

/**
 * Resolve pi's thinking level to the effort string the model publishes. The map is generated total,
 * so the fallbacks only apply to models declared by hand in models.json.
 */
export function mapThinkingLevelToEffort(level: SimpleStreamOptions["reasoning"], model: Model<Api>): AnthropicEffort {
	const effort = level ? model.thinkingLevelMap?.[level] : undefined;
	if (effort !== undefined) return effort as AnthropicEffort;

	switch (level) {
		case "minimal":
		case "low":
			return "low";
		case "medium":
			return "medium";
		default:
			return "high";
	}
}
