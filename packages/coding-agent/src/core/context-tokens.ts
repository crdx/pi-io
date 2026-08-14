/**
 * Context token accounting.
 *
 * Estimates how much of the model's context window a session is using, from
 * reported usage where available and a chars/4 heuristic for anything sent
 * since the last assistant response.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, Usage } from "@mariozechner/pi-ai";
import type { SessionEntry } from "./session-manager.js";

/**
 * Calculate total context tokens from usage.
 * Uses the native totalTokens field when available, falls back to computing from components.
 */
export function calculateContextTokens(usage: Usage): number {
	return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

/**
 * Get usage from an assistant message if available.
 * Skips aborted and error messages as they don't have valid usage data.
 */
function getAssistantUsage(msg: AgentMessage): Usage | undefined {
	if (msg.role === "assistant" && "usage" in msg) {
		const assistantMsg = msg as AssistantMessage;
		if (assistantMsg.stopReason !== "aborted" && assistantMsg.stopReason !== "error" && assistantMsg.usage) {
			return assistantMsg.usage;
		}
	}
	return undefined;
}

/**
 * Find the last non-aborted assistant message usage from session entries.
 */
export function getLastAssistantUsage(entries: SessionEntry[]): Usage | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type === "message") {
			const usage = getAssistantUsage(entry.message);
			if (usage) return usage;
		}
	}
	return undefined;
}

export interface ContextUsageEstimate {
	tokens: number;
	usageTokens: number;
	trailingTokens: number;
	lastUsageIndex: number | null;
}

function getLastAssistantUsageInfo(messages: AgentMessage[]): { usage: Usage; index: number } | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		const usage = getAssistantUsage(messages[i]);
		if (usage) return { usage, index: i };
	}
	return undefined;
}

/**
 * Estimate context tokens from messages, using the last assistant usage when available.
 * If there are messages after the last usage, estimate their tokens with estimateTokens.
 */
export function estimateContextTokens(messages: AgentMessage[]): ContextUsageEstimate {
	const usageInfo = getLastAssistantUsageInfo(messages);

	if (!usageInfo) {
		let estimated = 0;
		for (const message of messages) {
			estimated += estimateTokens(message);
		}
		return {
			tokens: estimated,
			usageTokens: 0,
			trailingTokens: estimated,
			lastUsageIndex: null,
		};
	}

	const usageTokens = calculateContextTokens(usageInfo.usage);
	let trailingTokens = 0;
	for (let i = usageInfo.index + 1; i < messages.length; i++) {
		trailingTokens += estimateTokens(messages[i]);
	}

	return {
		tokens: usageTokens + trailingTokens,
		usageTokens,
		trailingTokens,
		lastUsageIndex: usageInfo.index,
	};
}

const CHARS_PER_PROSE_TOKEN = 4;
const CHARS_PER_CODE_TOKEN = 3;
const CHARS_PER_PROSE_TOKEN_BOUNDS = { fewest: 3.5, most: 4.5 };
const CHARS_PER_CODE_TOKEN_BOUNDS = { fewest: 2.3, most: 3.8 };
const TOKENS_PER_IMAGE = 1200;
const FENCE_PATTERN = /^\s*(```|~~~)/;

export interface TokenEstimate {
	tokens: number;
	low: number;
	high: number;
}

/**
 * Split text into prose characters and fenced code characters, which tokenise at different rates.
 */
function countTokenisableChars(text: string): { proseChars: number; codeChars: number } {
	const lines = text.split("\n");
	let proseChars = lines.length - 1; // newlines
	let codeChars = 0;
	let insideFence = false;

	for (const line of lines) {
		if (FENCE_PATTERN.test(line)) {
			insideFence = !insideFence;
			proseChars += line.length;
		} else if (insideFence) {
			codeChars += line.length;
		} else {
			proseChars += line.length;
		}
	}

	return { proseChars, codeChars };
}

export function estimateTextTokens(text: string): number {
	const { proseChars, codeChars } = countTokenisableChars(text);

	return Math.ceil(proseChars / CHARS_PER_PROSE_TOKEN + codeChars / CHARS_PER_CODE_TOKEN);
}

export function estimateTextTokenRange(text: string): TokenEstimate {
	const { proseChars, codeChars } = countTokenisableChars(text);

	return {
		tokens: Math.ceil(proseChars / CHARS_PER_PROSE_TOKEN + codeChars / CHARS_PER_CODE_TOKEN),
		low: Math.ceil(proseChars / CHARS_PER_PROSE_TOKEN_BOUNDS.most + codeChars / CHARS_PER_CODE_TOKEN_BOUNDS.most),
		high: Math.ceil(
			proseChars / CHARS_PER_PROSE_TOKEN_BOUNDS.fewest + codeChars / CHARS_PER_CODE_TOKEN_BOUNDS.fewest,
		),
	};
}

/**
 * Estimate token count for a message.
 */
export function estimateTokens(message: AgentMessage): number {
	let tokens = 0;

	switch (message.role) {
		case "user": {
			const content = (message as { content: string | Array<{ type: string; text?: string }> }).content;
			if (typeof content === "string") {
				tokens = estimateTextTokens(content);
			} else if (Array.isArray(content)) {
				for (const block of content) {
					if (block.type === "text" && block.text) {
						tokens += estimateTextTokens(block.text);
					}
				}
			}
			return tokens;
		}
		case "assistant": {
			const assistant = message as AssistantMessage;
			for (const block of assistant.content) {
				if (block.type === "text") {
					tokens += estimateTextTokens(block.text);
				} else if (block.type === "thinking") {
					tokens += estimateTextTokens(block.thinking);
				} else if (block.type === "toolCall") {
					tokens += estimateTextTokens(block.name) + estimateTextTokens(JSON.stringify(block.arguments));
				}
			}
			return tokens;
		}
		case "custom":
		case "toolResult": {
			if (typeof message.content === "string") {
				tokens = estimateTextTokens(message.content);
			} else {
				for (const block of message.content) {
					if (block.type === "text" && block.text) {
						tokens += estimateTextTokens(block.text);
					}
					if (block.type === "image") {
						tokens += TOKENS_PER_IMAGE;
					}
				}
			}
			return tokens;
		}
		case "bashExecution": {
			return estimateTextTokens(message.command) + estimateTextTokens(message.output);
		}
	}

	return 0;
}
