import { describe, expect, it } from "vitest";
import { getModels, getProviders } from "../src/models.js";

// models.generated.ts is derived from models.dev and excluded from linting, so these invariants are
// all that stands between a bad upstream value and a session that silently reports the wrong price.
// gpt-5.3-codex-spark shipped for months priced at zero because nothing checked.
describe("generated model registry", () => {
	const allModels = getProviders().flatMap((provider) => getModels(provider));

	it("resolves models for every provider", () => {
		expect(getProviders().length).toBeGreaterThan(0);
		for (const provider of getProviders()) {
			expect(getModels(provider).length, provider).toBeGreaterThan(0);
		}
	});

	it("prices every model", () => {
		for (const model of allModels) {
			expect(model.cost.input, `${model.id} input`).toBeGreaterThan(0);
			expect(model.cost.output, `${model.id} output`).toBeGreaterThan(0);
		}
	});

	it("gives every model a usable context window and output limit", () => {
		for (const model of allModels) {
			expect(model.contextWindow, `${model.id} contextWindow`).toBeGreaterThan(0);
			expect(model.maxTokens, `${model.id} maxTokens`).toBeGreaterThan(0);
			expect(model.maxTokens, `${model.id} maxTokens`).toBeLessThanOrEqual(model.contextWindow);
		}
	});

	it("never makes a long-context tier cheaper than the base rate", () => {
		for (const model of allModels) {
			for (const tier of model.cost.tiers ?? []) {
				expect(tier.inputTokensAbove, `${model.id} threshold`).toBeGreaterThan(0);
				expect(tier.input, `${model.id} tier input`).toBeGreaterThanOrEqual(model.cost.input);
				expect(tier.output, `${model.id} tier output`).toBeGreaterThanOrEqual(model.cost.output);
			}
		}
	});
});
