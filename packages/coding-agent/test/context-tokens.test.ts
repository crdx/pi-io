import { describe, expect, test } from "vitest";
import { estimateTextTokenRange, estimateTextTokens } from "../src/core/context-tokens.js";

describe("estimateTextTokens", () => {
	test("counts prose at four characters per token", () => {
		expect(estimateTextTokens("x".repeat(400))).toBe(100);
	});

	test("counts fenced code at three characters per token", () => {
		const text = ["```ts", "x".repeat(300), "```"].join("\n");
		const fenceChars = "```ts".length + "```".length + 2;

		expect(estimateTextTokens(text)).toBe(Math.ceil(fenceChars / 4 + 300 / 3));
	});

	test("returns a higher count for fenced code than for the same text as prose", () => {
		const code = "x".repeat(900);

		expect(estimateTextTokens(["```", code, "```"].join("\n"))).toBeGreaterThan(estimateTextTokens(code));
	});

	test("resumes counting prose after a closing fence", () => {
		const text = ["```", "x".repeat(300), "```", "y".repeat(400)].join("\n");
		const proseOnly = estimateTextTokens(["x".repeat(300), "y".repeat(400)].join("\n"));

		expect(estimateTextTokens(text)).toBeGreaterThan(proseOnly);
	});

	test("treats tilde fences the same as backtick fences", () => {
		const backticks = ["```", "x".repeat(300), "```"].join("\n");
		const tildes = ["~~~", "x".repeat(300), "~~~"].join("\n");

		expect(estimateTextTokens(tildes)).toBe(estimateTextTokens(backticks));
	});

	test("counts indented fences, as found in nested list items", () => {
		const text = ["    ```", "x".repeat(300), "    ```"].join("\n");

		expect(estimateTextTokens(text)).toBeGreaterThan(estimateTextTokens("x".repeat(300)));
	});

	test("counts newlines", () => {
		expect(estimateTextTokens("a\nb")).toBe(1);
	});

	test("returns zero for empty text", () => {
		expect(estimateTextTokens("")).toBe(0);
	});

	test("does not treat an unterminated fence as prose", () => {
		const text = ["```", "x".repeat(300)].join("\n");

		expect(estimateTextTokens(text)).toBeGreaterThan(estimateTextTokens("x".repeat(300)));
	});
});

describe("estimateTextTokenRange", () => {
	test("brackets the point estimate", () => {
		const estimate = estimateTextTokenRange("x".repeat(4000));

		expect(estimate.low).toBeLessThan(estimate.tokens);
		expect(estimate.high).toBeGreaterThan(estimate.tokens);
	});

	test("agrees with the point estimator", () => {
		const text = ["Some prose.", "```", "const x = 1", "```"].join("\n");

		expect(estimateTextTokenRange(text).tokens).toBe(estimateTextTokens(text));
	});

	test("derives prose bounds from the published chars-per-token spread", () => {
		const estimate = estimateTextTokenRange("x".repeat(4500));

		expect(estimate.low).toBe(1000); // 4500 / 4.5
		expect(estimate.high).toBe(Math.ceil(4500 / 3.5));
	});

	test("widens the range for fenced code, which tokenises less predictably", () => {
		const code = "x".repeat(3000);
		const spread = (text: string) => {
			const estimate = estimateTextTokenRange(text);
			return (estimate.high - estimate.low) / estimate.tokens;
		};

		expect(spread(["```", code, "```"].join("\n"))).toBeGreaterThan(spread(code));
	});

	test("returns zeroes for empty text", () => {
		expect(estimateTextTokenRange("")).toEqual({ tokens: 0, low: 0, high: 0 });
	});
});
