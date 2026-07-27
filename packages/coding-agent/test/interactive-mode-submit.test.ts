import { describe, expect, test } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.js";

describe("InteractiveMode editor submit handler", () => {
	test("surfaces a failed send instead of rejecting", async () => {
		const errors: string[] = [];
		const editor: { onSubmit?: (text: string) => void } = {};
		// Built on the prototype so reportFailure, the method under test, resolves.
		const mode = Object.assign(Object.create(InteractiveMode.prototype), {
			defaultEditor: editor,
			showError: (message: string) => errors.push(message),
			handleSubmit: async () => {
				throw new Error("send failed");
			},
		});

		(InteractiveMode.prototype as unknown as { setupEditorSubmitHandler: () => void }).setupEditorSubmitHandler.call(
			mode,
		);

		// onSubmit returns void, so a rejection here would have nothing to catch it
		// and would take the process down.
		expect(() => editor.onSubmit?.("hello")).not.toThrow();
		await new Promise((resolve) => setImmediate(resolve));

		expect(errors).toEqual(["send failed"]);
	});
});
