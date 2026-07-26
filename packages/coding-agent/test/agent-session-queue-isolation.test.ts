// Tests for the queue clearing in AgentSession.fork() and navigateTree().
//
// Both change the conversation context via agent.replaceMessages(), which does not
// touch the steering/follow-up queues. Without an explicit clear, a message queued
// against the old conversation point is delivered into the new one.

import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./test-harness.js";

let harness: Harness | undefined;

afterEach(() => {
	harness?.cleanup();
	harness = undefined;
});

/** Yield to the event loop so the agent reaches its streaming state. */
async function tick(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 20));
}

async function seedConversation(h: Harness): Promise<void> {
	await h.session.prompt("first");
	await h.session.prompt("second");
}

function firstUserEntryId(h: Harness): string {
	const entry = h.sessionManager.getEntries().find((e) => e.type === "message" && e.message.role === "user");
	if (!entry) throw new Error("no user entry found");
	return entry.id;
}

describe("queue isolation across context changes", () => {
	it("fork() drops messages queued against the old conversation", async () => {
		harness = createHarness({ responses: ["one", "two"] });
		await seedConversation(harness);

		harness.session.steer("steered");
		harness.session.followUp("followed up");
		expect(harness.agent.hasQueuedMessages()).toBe(true);

		await harness.session.fork(firstUserEntryId(harness));

		expect(harness.agent.hasQueuedMessages()).toBe(false);
		expect(harness.session.getSteeringMessages()).toHaveLength(0);
		expect(harness.session.getFollowUpMessages()).toHaveLength(0);
	});

	it("navigateTree() drops messages queued against the old conversation", async () => {
		harness = createHarness({ responses: ["one", "two"] });
		await seedConversation(harness);

		harness.session.steer("steered");
		harness.session.followUp("followed up");
		expect(harness.agent.hasQueuedMessages()).toBe(true);

		await harness.session.navigateTree(firstUserEntryId(harness));

		expect(harness.agent.hasQueuedMessages()).toBe(false);
		expect(harness.session.getSteeringMessages()).toHaveLength(0);
		expect(harness.session.getFollowUpMessages()).toHaveLength(0);
	});

	it("fork() aborts an in-flight turn instead of letting it write into the new context", async () => {
		harness = createHarness({ responses: ["one", { text: "slow", delayMs: 500 }] });
		await harness.session.prompt("first");
		const targetId = firstUserEntryId(harness);

		// Start a turn and leave it streaming.
		const inFlight = harness.session.prompt("second");
		await tick();
		expect(harness.session.isStreaming).toBe(true);

		harness.session.steer("steered mid-stream");

		await harness.session.fork(targetId);

		expect(harness.session.isStreaming).toBe(false);
		expect(harness.agent.hasQueuedMessages()).toBe(false);
		await inFlight;
	});

	it("navigateTree() aborts an in-flight turn instead of letting it write into the new context", async () => {
		harness = createHarness({ responses: ["one", { text: "slow", delayMs: 500 }] });
		await harness.session.prompt("first");
		const targetId = firstUserEntryId(harness);

		const inFlight = harness.session.prompt("second");
		await tick();
		expect(harness.session.isStreaming).toBe(true);

		harness.session.steer("steered mid-stream");

		await harness.session.navigateTree(targetId);

		expect(harness.session.isStreaming).toBe(false);
		expect(harness.agent.hasQueuedMessages()).toBe(false);
		await inFlight;
	});
});
