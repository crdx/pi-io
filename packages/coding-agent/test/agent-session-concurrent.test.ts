/**
 * Tests for AgentSession concurrent prompt guard.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@mariozechner/pi-agent-core";
import { type AssistantMessage, type AssistantMessageEvent, EventStream, getModel } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentSession } from "../src/core/agent-session.js";
import { AuthStorage } from "../src/core/auth-storage.js";
import { ModelRegistry } from "../src/core/model-registry.js";
import { SessionManager } from "../src/core/session-manager.js";
import { SettingsManager } from "../src/core/settings-manager.js";
import { createTestResourceLoader } from "./utilities.js";

// Mock stream that mimics AssistantMessageEventStream
class MockAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor() {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected event type");
			},
		);
	}
}

function createAssistantMessage(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "mock",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

describe("AgentSession concurrent prompt guard", () => {
	let session: AgentSession;
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-concurrent-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(async () => {
		if (session) {
			session.dispose();
		}
		if (tempDir && existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true });
		}
	});

	function createSession() {
		const model = getModel("anthropic", "claude-sonnet-4-5")!;
		let abortSignal: AbortSignal | undefined;

		// Use a stream function that responds to abort
		const agent = new Agent({
			getApiKey: () => "test-key",
			initialState: {
				model,
				systemPrompt: "Test",
				tools: [],
			},
			streamFn: (_model, _context, options) => {
				abortSignal = options?.signal;
				const stream = new MockAssistantStream();
				queueMicrotask(() => {
					stream.push({ type: "start", partial: createAssistantMessage("") });
					const checkAbort = () => {
						if (abortSignal?.aborted) {
							stream.push({ type: "error", reason: "aborted", error: createAssistantMessage("Aborted") });
						} else {
							setTimeout(checkAbort, 5);
						}
					};
					checkAbort();
				});
				return stream;
			},
		});

		const sessionManager = SessionManager.inMemory();
		const settingsManager = SettingsManager.create(tempDir, tempDir);
		const authStorage = AuthStorage.create(join(tempDir, "auth.json"));
		const modelRegistry = new ModelRegistry(authStorage, tempDir);
		// Set a runtime API key so validation passes
		authStorage.setRuntimeApiKey("anthropic", "test-key");

		session = new AgentSession({
			agent,
			sessionManager,
			settingsManager,
			cwd: tempDir,
			modelRegistry,
			resourceLoader: createTestResourceLoader(),
		});

		return session;
	}

	it("delivers an interrupt as a fresh turn rather than queueing it", async () => {
		createSession();

		const firstPrompt = session.prompt("First message");
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(session.isStreaming).toBe(true);

		// Not awaited: the interrupt starts a turn of its own, which this mock
		// only ever ends by being aborted.
		const interrupted = session.prompt("Second message", { streamingBehavior: "interrupt" });
		await new Promise((resolve) => setTimeout(resolve, 30));

		// Queueing is how steer and followUp defer a message, and interrupt must use
		// neither. Queueing it as well as sending it delivers it twice, because the
		// turn the interrupt starts drains the queue on its way in; queueing it
		// instead of sending strands it, because an aborted turn returns before any
		// drain. Counting occurrences catches both.
		const deliveries = session.messages.filter(
			(message) => message.role === "user" && JSON.stringify(message.content).includes("Second message"),
		);
		expect(deliveries).toHaveLength(1);
		expect(session.agent.hasQueuedMessages()).toBe(false);

		// The first turn is gone and a new one is running in its place.
		await firstPrompt.catch(() => {});
		expect(session.isStreaming).toBe(true);

		await session.abort();
		await interrupted.catch(() => {});
	});

	it("delivers an interrupt even when an extension starts a turn mid-send", async () => {
		createSession();

		// The send path awaits extension handlers and credential lookups, either of
		// which can yield to the macrotask queue.
		const sessionWithRunner = session as unknown as {
			_extensionRunner?: {
				hasHandlers: () => boolean;
				emit: () => Promise<void>;
				emitInput: () => Promise<{ action: "continue" }>;
				emitBeforeAgentStart: () => Promise<undefined>;
			};
		};
		sessionWithRunner._extensionRunner = {
			hasHandlers: () => false,
			emit: async () => {},
			emitInput: async () => ({ action: "continue" }),
			emitBeforeAgentStart: async () => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				return undefined;
			},
		};

		// An extension starting a turn of its own from agent_end, deferred through
		// the macrotask queue the way the extension suite does.
		let relaunched = false;
		session.agent.subscribe((event) => {
			if (event.type !== "agent_end" || relaunched) return;
			relaunched = true;
			setImmediate(() => {
				void session.agent
					.prompt([{ role: "user", content: "Extension turn", timestamp: Date.now() }])
					.catch(() => {});
			});
		});

		const firstPrompt = session.prompt("First message");
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(session.isStreaming).toBe(true);

		let sendError: unknown;
		const interrupted = session
			.prompt("Second message", { streamingBehavior: "interrupt" })
			.catch((error: unknown) => {
				sendError = error;
			});
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(sendError).toBeUndefined();
		expect(relaunched).toBe(true);
		const deliveries = session.messages.filter(
			(message) => message.role === "user" && JSON.stringify(message.content).includes("Second message"),
		);
		expect(deliveries).toHaveLength(1);
		expect(session.isStreaming).toBe(true);

		await session.abort();
		await firstPrompt.catch(() => {});
		await interrupted;
	});

	it("should throw when prompt() called while streaming", async () => {
		createSession();

		// Start first prompt (don't await, it will block until abort)
		const firstPrompt = session.prompt("First message");

		// Wait a tick for isStreaming to be set
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Verify we're streaming
		expect(session.isStreaming).toBe(true);

		// Second prompt should reject
		await expect(session.prompt("Second message")).rejects.toThrow(
			"Agent is already processing. Specify streamingBehavior ('steer', 'followUp' or 'interrupt') to deliver the message.",
		);

		// Cleanup
		await session.abort();
		await firstPrompt.catch(() => {}); // Ignore abort error
	});

	it("should allow steer() while streaming", async () => {
		createSession();

		// Start first prompt
		const firstPrompt = session.prompt("First message");
		await new Promise((resolve) => setTimeout(resolve, 10));

		// steer should work while streaming
		expect(() => session.steer("Steering message")).not.toThrow();
		expect(session.pendingMessageCount).toBe(1);

		// Cleanup
		await session.abort();
		await firstPrompt.catch(() => {});
	});

	it("should allow followUp() while streaming", async () => {
		createSession();

		// Start first prompt
		const firstPrompt = session.prompt("First message");
		await new Promise((resolve) => setTimeout(resolve, 10));

		// followUp should work while streaming
		expect(() => session.followUp("Follow-up message")).not.toThrow();
		expect(session.pendingMessageCount).toBe(1);

		// Cleanup
		await session.abort();
		await firstPrompt.catch(() => {});
	});

	it("should allow prompt() after previous completes", async () => {
		// Create session with a stream that completes immediately
		const model = getModel("anthropic", "claude-sonnet-4-5")!;
		const agent = new Agent({
			getApiKey: () => "test-key",
			initialState: {
				model,
				systemPrompt: "Test",
				tools: [],
			},
			streamFn: () => {
				const stream = new MockAssistantStream();
				queueMicrotask(() => {
					stream.push({ type: "start", partial: createAssistantMessage("") });
					stream.push({ type: "done", reason: "stop", message: createAssistantMessage("Done") });
				});
				return stream;
			},
		});

		const sessionManager = SessionManager.inMemory();
		const settingsManager = SettingsManager.create(tempDir, tempDir);
		const authStorage = AuthStorage.create(join(tempDir, "auth.json"));
		const modelRegistry = new ModelRegistry(authStorage, tempDir);
		authStorage.setRuntimeApiKey("anthropic", "test-key");

		session = new AgentSession({
			agent,
			sessionManager,
			settingsManager,
			cwd: tempDir,
			modelRegistry,
			resourceLoader: createTestResourceLoader(),
		});

		// First prompt completes
		await session.prompt("First message");

		// Should not be streaming anymore
		expect(session.isStreaming).toBe(false);

		// Second prompt should work
		await expect(session.prompt("Second message")).resolves.not.toThrow();
	});

	it("should wait for queued agent events before emitting tool_call", async () => {
		const model = getModel("anthropic", "claude-sonnet-4-5")!;
		const tool = {
			name: "dummy",
			description: "Dummy tool",
			label: "dummy",
			parameters: Type.Object({ q: Type.String() }),
			execute: async (_toolCallId: string, params: unknown) => {
				const q =
					typeof params === "object" && params !== null && "q" in params
						? String((params as { q: unknown }).q)
						: "";
				return {
					content: [{ type: "text" as const, text: `result:${q}` }],
					details: {},
				};
			},
		};

		const agent = new Agent({
			getApiKey: () => "test-key",
			initialState: {
				model,
				systemPrompt: "Test",
				tools: [tool],
			},
			streamFn: async (_model, context) => {
				const stream = new MockAssistantStream();
				queueMicrotask(() => {
					const toolResultCount = context.messages.filter((message) => message.role === "toolResult").length;
					if (toolResultCount > 0) {
						const message: AssistantMessage = {
							role: "assistant",
							content: [{ type: "text", text: "done" }],
							api: "anthropic-messages",
							provider: "anthropic",
							model: "mock",
							usage: {
								input: 1,
								output: 1,
								cacheRead: 0,
								cacheWrite: 0,
								totalTokens: 2,
								cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
							},
							stopReason: "stop",
							timestamp: Date.now(),
						};
						stream.push({ type: "start", partial: { ...message, content: [] } });
						stream.push({ type: "done", reason: "stop", message });
						return;
					}

					const message: AssistantMessage = {
						role: "assistant",
						content: [
							{ type: "toolCall", id: "toolu_1", name: "dummy", arguments: { q: "x" } },
							{ type: "toolCall", id: "toolu_2", name: "dummy", arguments: { q: "y" } },
						],
						api: "anthropic-messages",
						provider: "anthropic",
						model: "mock",
						usage: {
							input: 1,
							output: 1,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 2,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
						},
						stopReason: "toolUse",
						timestamp: Date.now(),
					};

					stream.push({ type: "start", partial: { ...message, content: [] } });
					stream.push({ type: "done", reason: "toolUse", message });
				});
				return stream;
			},
		});

		const sessionManager = SessionManager.inMemory();
		const settingsManager = SettingsManager.create(tempDir, tempDir);
		const authStorage = AuthStorage.create(join(tempDir, "auth.json"));
		const modelRegistry = new ModelRegistry(authStorage, tempDir);
		authStorage.setRuntimeApiKey("anthropic", "test-key");

		session = new AgentSession({
			agent,
			sessionManager,
			settingsManager,
			cwd: tempDir,
			modelRegistry,
			resourceLoader: createTestResourceLoader(),
			baseToolsOverride: { dummy: tool },
		});

		const snapshots: string[][] = [];
		const sessionWithRunner = session as unknown as {
			_extensionRunner?: {
				hasHandlers: (eventType: string) => boolean;
				emit: (event: { type: string; message?: { role?: string } }) => Promise<void>;
				emitToolCall: (event: { type: string; toolCallId: string }) => Promise<undefined>;
				emitInput: (
					text: string,
					images: unknown,
					source: "interactive" | "extension" | "keybinding",
				) => Promise<{ action: "continue" }>;
				emitBeforeAgentStart: (prompt: string, images: unknown, systemPrompt: string) => Promise<undefined>;
			};
		};
		sessionWithRunner._extensionRunner = {
			hasHandlers: (eventType) => eventType === "tool_call",
			emit: async () => {},
			emitToolCall: async () => {
				snapshots.push(
					sessionManager
						.getEntries()
						.filter((entry) => entry.type === "message")
						.map((entry) => entry.message.role),
				);
				return undefined;
			},
			emitInput: async () => ({ action: "continue" }),
			emitBeforeAgentStart: async () => undefined,
		};

		await session.prompt("hi");
		await session.agent.waitForIdle();

		expect(snapshots).toEqual([
			["user", "assistant"],
			["user", "assistant"],
		]);
	});

	it("should persist message_end events in order with slow extension handlers", async () => {
		const model = getModel("anthropic", "claude-sonnet-4-5")!;
		const tool = {
			name: "dummy",
			description: "Dummy tool",
			label: "dummy",
			parameters: Type.Object({ q: Type.String() }),
			execute: async (_toolCallId: string, params: unknown) => {
				const q =
					typeof params === "object" && params !== null && "q" in params
						? String((params as { q: unknown }).q)
						: "";
				return {
					content: [{ type: "text" as const, text: `result:${q}` }],
					details: {},
				};
			},
		};

		const agent = new Agent({
			getApiKey: () => "test-key",
			initialState: {
				model,
				systemPrompt: "Test",
				tools: [tool],
			},
			streamFn: async (_model, context) => {
				const stream = new MockAssistantStream();
				queueMicrotask(() => {
					const hasToolResult = context.messages.some((message) => message.role === "toolResult");

					if (hasToolResult) {
						const message: AssistantMessage = {
							role: "assistant",
							content: [{ type: "text", text: "done" }],
							api: "anthropic-messages",
							provider: "anthropic",
							model: "mock",
							usage: {
								input: 1,
								output: 1,
								cacheRead: 0,
								cacheWrite: 0,
								totalTokens: 2,
								cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
							},
							stopReason: "stop",
							timestamp: Date.now(),
						};
						stream.push({ type: "start", partial: { ...message, content: [] } });
						stream.push({ type: "done", reason: "stop", message });
						return;
					}

					const message: AssistantMessage = {
						role: "assistant",
						content: [
							{ type: "text", text: "calling tool" },
							{ type: "toolCall", id: "toolu_1", name: "dummy", arguments: { q: "x" } },
						],
						api: "anthropic-messages",
						provider: "anthropic",
						model: "mock",
						usage: {
							input: 1,
							output: 1,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: 2,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
						},
						stopReason: "toolUse",
						timestamp: Date.now(),
					};

					stream.push({ type: "start", partial: { ...message, content: [] } });
					stream.push({ type: "done", reason: "toolUse", message });
				});
				return stream;
			},
		});

		const sessionManager = SessionManager.inMemory();
		const settingsManager = SettingsManager.create(tempDir, tempDir);
		const authStorage = AuthStorage.create(join(tempDir, "auth.json"));
		const modelRegistry = new ModelRegistry(authStorage, tempDir);
		authStorage.setRuntimeApiKey("anthropic", "test-key");

		session = new AgentSession({
			agent,
			sessionManager,
			settingsManager,
			cwd: tempDir,
			modelRegistry,
			resourceLoader: createTestResourceLoader(),
			baseToolsOverride: { dummy: tool },
		});

		const sessionWithRunner = session as unknown as {
			_extensionRunner?: {
				hasHandlers: (eventType: string) => boolean;
				emit: (event: { type: string; message?: { role?: string } }) => Promise<void>;
				emitInput: (
					text: string,
					images: unknown,
					source: "interactive" | "extension" | "keybinding",
				) => Promise<{ action: "continue" }>;
				emitBeforeAgentStart: (prompt: string, images: unknown, systemPrompt: string) => Promise<undefined>;
			};
		};
		sessionWithRunner._extensionRunner = {
			hasHandlers: () => false,
			emit: async (event) => {
				if (event.type === "message_end" && event.message?.role === "assistant") {
					await new Promise((resolve) => setTimeout(resolve, 40));
				}
			},
			emitInput: async () => ({ action: "continue" }),
			emitBeforeAgentStart: async () => undefined,
		};

		await session.prompt("hi");
		await session.agent.waitForIdle();
		await new Promise((resolve) => setTimeout(resolve, 100));

		const messageEntries = sessionManager.getEntries().filter((entry) => entry.type === "message");
		expect(messageEntries.map((entry) => entry.message.role)).toEqual([
			"user",
			"assistant",
			"toolResult",
			"assistant",
		]);
	});
});
