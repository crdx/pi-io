import { describe, expect, it } from "vitest";
import { getModels, supportsXhigh } from "../src/models.js";
import {
	mapThinkingLevelToEffort,
	supportsAdaptiveThinking,
	supportsTemperature,
	supportsThinkingDisabled,
} from "../src/providers/anthropic-thinking.js";

// Pre-migration behaviour, reproduced from the substring lists this change replaced.
const LEGACY_ADAPTIVE = ["opus-4-6", "opus-4-7", "opus-4-8", "opus-5", "sonnet-4-6", "sonnet-5", "fable-5"];
const LEGACY_XHIGH_MAX = ["opus-4-6"];
const LEGACY_XHIGH_EFFORT = ["opus-4-7", "opus-4-8", "opus-5", "sonnet-5", "fable-5"];
const LEGACY_NO_TEMPERATURE = ["opus-4-7", "opus-4-8", "opus-5"];
const LEGACY_NO_THINKING_DISABLED = ["fable-5"];

// Intended fixes, so these models are expected to differ from the legacy behaviour.
const INTENDED_XHIGH_FIXES = ["claude-sonnet-4-6"];
const INTENDED_TEMPERATURE_FIXES = ["claude-sonnet-5", "claude-fable-5"];

const matches = (id: string, fragments: string[]) => fragments.some((fragment) => id.includes(fragment));

describe("declared thinking capabilities", () => {
	const anthropicModels = getModels("anthropic");

	it("reproduces legacy adaptive thinking for every anthropic model", () => {
		for (const model of anthropicModels) {
			expect(supportsAdaptiveThinking(model), model.id).toBe(matches(model.id, LEGACY_ADAPTIVE));
		}
	});

	it("reproduces legacy xhigh support except where intentionally fixed", () => {
		for (const model of anthropicModels) {
			if (INTENDED_XHIGH_FIXES.includes(model.id)) {
				expect(supportsXhigh(model), model.id).toBe(true);
				expect(mapThinkingLevelToEffort("xhigh", model), model.id).toBe("max");
				continue;
			}
			expect(supportsXhigh(model), model.id).toBe(matches(model.id, [...LEGACY_XHIGH_MAX, ...LEGACY_XHIGH_EFFORT]));
		}
	});

	it("reproduces the legacy xhigh effort mapping", () => {
		for (const model of anthropicModels) {
			if (INTENDED_XHIGH_FIXES.includes(model.id)) continue;
			const expected = matches(model.id, LEGACY_XHIGH_MAX)
				? "max"
				: matches(model.id, LEGACY_XHIGH_EFFORT)
					? "xhigh"
					: "high";
			expect(mapThinkingLevelToEffort("xhigh", model), model.id).toBe(expected);
		}
	});

	it("reproduces legacy temperature support except where intentionally fixed", () => {
		for (const model of anthropicModels) {
			const expected = INTENDED_TEMPERATURE_FIXES.includes(model.id)
				? false
				: !matches(model.id, LEGACY_NO_TEMPERATURE);
			expect(supportsTemperature(model), model.id).toBe(expected);
		}
	});

	it("reproduces legacy thinking-disabled support", () => {
		for (const model of anthropicModels) {
			expect(supportsThinkingDisabled(model), model.id).toBe(!matches(model.id, LEGACY_NO_THINKING_DISABLED));
		}
	});

	it("maps low, medium and high to themselves wherever a map is declared", () => {
		for (const model of [...anthropicModels, ...getModels("openai-codex")]) {
			if (!model.thinkingLevelMap) continue;
			expect(mapThinkingLevelToEffort("low", model), model.id).toBe("low");
			expect(mapThinkingLevelToEffort("medium", model), model.id).toBe("medium");
			expect(mapThinkingLevelToEffort("high", model), model.id).toBe("high");
		}
	});

	it("gives every codex model a full effort map including none", () => {
		for (const model of getModels("openai-codex")) {
			expect(model.thinkingLevelMap?.off, model.id).toBe("none");
			expect(model.thinkingLevelMap?.minimal, model.id).toBe("low");
			expect(supportsXhigh(model), model.id).toBe(true);
		}
	});

	it("withholds xhigh from a model that declares nothing", () => {
		const custom = { ...getModels("anthropic")[0], thinkingLevelMap: undefined };
		expect(supportsXhigh(custom)).toBe(false);
	});

	it("treats an undeclared model as adaptive, so a new one is never silently downgraded", () => {
		const future = { ...getModels("anthropic")[0], id: "claude-opus-9", thinkingMode: undefined };
		expect(supportsAdaptiveThinking(future)).toBe(true);
	});

	it("declares budget thinking only for models older than the adaptive generations", () => {
		const budgetIds = anthropicModels.filter((model) => !supportsAdaptiveThinking(model)).map((model) => model.id);
		for (const id of budgetIds) {
			expect(id, `${id} should be a 4-1 or 4-5 generation model`).toMatch(/-4-[15](-\d{8})?$/);
		}
	});
});
