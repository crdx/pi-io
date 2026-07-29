import { APIError } from "@anthropic-ai/sdk";
import { describeAnthropicError, isContextOverflow } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";

const AGENT_SESSION_RETRYABLE_PATTERN =
	/overloaded|provider.?returned.?error|rate.?limit|too many requests|429|500|502|503|504|service.?unavailable|server.?error|internal.?error|network.?error|connection.?error|connection.?refused|other side closed|fetch failed|upstream.?connect|reset before headers|socket hang up|timed? out|timeout|terminated|retry delay/i;

const DETAIL_WITHOUT_CLASSIFIABLE_TERMS = "Your account exceeded its quota for the current window";

const CONTEXT_OVERFLOW_DETAIL = "prompt is too long: 213462 tokens > 200000 maximum";

function anthropicApiError(
	statusCode: number,
	errorType: string,
	providerMessage: string,
	headers: Record<string, string> = {},
): APIError {
	return new APIError(
		statusCode,
		{ type: "error", error: { type: errorType, message: providerMessage } },
		undefined,
		new Headers(headers),
	);
}

describe("Anthropic error messages stay classifiable", () => {
	it("keeps a rate limit retryable", () => {
		const described = describeAnthropicError(
			anthropicApiError(429, "rate_limit_error", DETAIL_WITHOUT_CLASSIFIABLE_TERMS),
		);
		expect(described).toMatch(AGENT_SESSION_RETRYABLE_PATTERN);
	});

	it("reports the retry-after the server supplied, and stays retryable", () => {
		const described = describeAnthropicError(
			anthropicApiError(429, "rate_limit_error", DETAIL_WITHOUT_CLASSIFIABLE_TERMS, { "retry-after": "30" }),
		);
		expect(described).toContain("retry after 30s");
		expect(described).toMatch(AGENT_SESSION_RETRYABLE_PATTERN);
	});

	it("keeps an overload retryable", () => {
		const described = describeAnthropicError(
			anthropicApiError(529, "overloaded_error", DETAIL_WITHOUT_CLASSIFIABLE_TERMS),
		);
		expect(described).toMatch(AGENT_SESSION_RETRYABLE_PATTERN);
	});

	it("omits Anthropic's redundant overload detail", () => {
		const described = describeAnthropicError(anthropicApiError(529, "overloaded_error", "Overloaded"));
		expect(described).toBe("Anthropic is overloaded and refusing requests.");
	});

	it("keeps a server error retryable", () => {
		const described = describeAnthropicError(anthropicApiError(503, "api_error", DETAIL_WITHOUT_CLASSIFIABLE_TERMS));
		expect(described).toMatch(AGENT_SESSION_RETRYABLE_PATTERN);
	});

	it("leaves a context overflow detectable and not retryable", () => {
		const described = describeAnthropicError(
			anthropicApiError(400, "invalid_request_error", CONTEXT_OVERFLOW_DETAIL),
		);
		const failedMessage = { role: "assistant" as const, stopReason: "error" as const, errorMessage: described };
		expect(isContextOverflow(failedMessage as never, 200000)).toBe(true);
		expect(described).not.toMatch(AGENT_SESSION_RETRYABLE_PATTERN);
	});

	it("passes a plain error through unchanged", () => {
		expect(describeAnthropicError(new Error("Request was aborted"))).toBe("Request was aborted");
	});
});
