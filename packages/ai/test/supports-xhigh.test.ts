import { describe, expect, it } from "vitest";
import { getModel, getModels, supportsXhigh } from "../src/models.js";

describe("supportsXhigh", () => {
	it("returns true for Anthropic Opus 4.6 on anthropic-messages API", () => {
		const model = getModel("anthropic", "claude-opus-4-6");
		expect(model).toBeDefined();
		expect(supportsXhigh(model!)).toBe(true);
	});

	it("returns true for Anthropic Opus 4.8 on anthropic-messages API", () => {
		const model = getModel("anthropic", "claude-opus-4-8");
		expect(model).toBeDefined();
		expect(supportsXhigh(model!)).toBe(true);
	});

	it("returns false for non-Opus Anthropic models", () => {
		const model = getModel("anthropic", "claude-sonnet-4-5");
		expect(model).toBeDefined();
		expect(supportsXhigh(model!)).toBe(false);
	});

	it("returns true for every openai-codex model", () => {
		for (const model of getModels("openai-codex")) {
			expect(supportsXhigh(model), model.id).toBe(true);
		}
	});
});
