import { Container } from "@mariozechner/pi-tui";
import stripAnsi from "strip-ansi";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { InteractiveMode } from "../src/modes/interactive/interactive-mode.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

function renderLastLine(container: Container, width = 120): string {
	const last = container.children[container.children.length - 1];
	if (!last) return "";
	return last.render(width).join("\n");
}

function renderAll(container: Container, width = 120): string {
	return container.children.flatMap((child) => child.render(width)).join("\n");
}

describe("InteractiveMode.showStatus", () => {
	beforeAll(() => {
		// showStatus uses the global theme instance
		initTheme("dark");
	});

	test("coalesces immediately-sequential status messages", () => {
		const fakeThis: any = {
			chatContainer: new Container(),
			ui: { requestRender: vi.fn() },
			lastStatusSpacer: undefined,
			lastStatusText: undefined,
		};

		(InteractiveMode as any).prototype.showStatus.call(fakeThis, "STATUS_ONE");
		expect(fakeThis.chatContainer.children).toHaveLength(2);
		expect(renderLastLine(fakeThis.chatContainer)).toContain("STATUS_ONE");

		(InteractiveMode as any).prototype.showStatus.call(fakeThis, "STATUS_TWO");
		// second status updates the previous line instead of appending
		expect(fakeThis.chatContainer.children).toHaveLength(2);
		expect(renderLastLine(fakeThis.chatContainer)).toContain("STATUS_TWO");
		expect(renderLastLine(fakeThis.chatContainer)).not.toContain("STATUS_ONE");
	});

	test("appends a new status line if something else was added in between", () => {
		const fakeThis: any = {
			chatContainer: new Container(),
			ui: { requestRender: vi.fn() },
			lastStatusSpacer: undefined,
			lastStatusText: undefined,
		};

		(InteractiveMode as any).prototype.showStatus.call(fakeThis, "STATUS_ONE");
		expect(fakeThis.chatContainer.children).toHaveLength(2);

		// Something else gets added to the chat in between status updates
		fakeThis.chatContainer.addChild({ render: () => ["OTHER"], invalidate: () => {} });
		expect(fakeThis.chatContainer.children).toHaveLength(3);

		(InteractiveMode as any).prototype.showStatus.call(fakeThis, "STATUS_TWO");
		// adds spacer + text
		expect(fakeThis.chatContainer.children).toHaveLength(5);
		expect(renderLastLine(fakeThis.chatContainer)).toContain("STATUS_TWO");
	});
});

describe("InteractiveMode.showLoadedResources", () => {
	beforeAll(() => {
		initTheme("dark");
	});

	function createShowLoadedResourcesThis(options: {
		contextFiles?: Array<{ path: string; content: string }>;
		extensions?: Array<{ path: string; sourceInfo?: unknown }>;
		skills?: Array<{ filePath: string }>;
		prompts?: Array<{ filePath: string; name: string }>;
		themes?: Array<{ sourcePath?: string }>;
		skillDiagnostics?: Array<{ type: "warning" | "error" | "collision"; message: string }>;
	}) {
		const fakeThis: any = {
			options: {},
			chatContainer: new Container(),
			session: {
				promptTemplates: options.prompts ?? [],
				extensionRunner: undefined,
				resourceLoader: {
					getPathMetadata: () => new Map(),
					getAgentsFiles: () => ({ agentsFiles: options.contextFiles ?? [] }),
					getSkills: () => ({
						skills: options.skills ?? [],
						diagnostics: options.skillDiagnostics ?? [],
					}),
					getPrompts: () => ({ prompts: options.prompts ?? [], diagnostics: [] }),
					getExtensions: () => ({ extensions: options.extensions ?? [], errors: [], runtime: {} }),
					getThemes: () => ({ themes: options.themes ?? [], diagnostics: [] }),
				},
			},
			formatDisplayPath: (p: string) => p,
			getShortPath: (p: string) => p,
			formatDiagnostics: () => "diagnostics",
			getBuiltInCommandConflictDiagnostics: () => [],
		};

		return fakeThis;
	}

	test("lists the loaded context files with estimated token counts", () => {
		const fakeThis = createShowLoadedResourcesThis({
			contextFiles: [
				{ path: "/project/AGENTS.md", content: "x".repeat(8000) },
				{ path: "/project/AGENTS.local.md", content: "x".repeat(400) },
			],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis);

		const output = stripAnsi(renderAll(fakeThis.chatContainer));
		expect(output).toContain("[Context]");
		expect(output).toContain("/project/AGENTS.md (2K)");
		expect(output).toContain("/project/AGENTS.local.md (100t)");
	});

	test("summarises other resources as counts in the context header", () => {
		const fakeThis = createShowLoadedResourcesThis({
			contextFiles: [{ path: "/project/AGENTS.md", content: "" }],
			skills: [{ filePath: "/tmp/skill/SKILL.md" }, { filePath: "/tmp/skill2/SKILL.md" }],
			prompts: [{ filePath: "/tmp/prompt.md", name: "prompt" }],
			themes: [{ sourcePath: "/tmp/theme.json" }, {}],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis, {
			extensions: [{ path: "/tmp/ext/index.ts" }],
		});

		const output = renderAll(fakeThis.chatContainer);
		expect(stripAnsi(output)).toContain("[Context] 2 skills · 1 command · 1 extension · 1 theme");
		expect(output).not.toContain("[Skills]");
		expect(output).not.toContain("[Prompts]");
		expect(output).not.toContain("[Extensions]");
		expect(output).not.toContain("[Themes]");
		expect(output).not.toContain("/tmp/skill/SKILL.md");
	});

	test("shows the counts alone when no context files are loaded", () => {
		const fakeThis = createShowLoadedResourcesThis({
			skills: [{ filePath: "/tmp/skill/SKILL.md" }],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis);

		const output = renderAll(fakeThis.chatContainer);
		expect(output).toContain("1 skill");
		expect(output).not.toContain("[Context]");
	});

	test("shows nothing when no resources are loaded", () => {
		const fakeThis = createShowLoadedResourcesThis({});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis);

		expect(fakeThis.chatContainer.children).toHaveLength(0);
	});

	test("shows diagnostics", () => {
		const fakeThis = createShowLoadedResourcesThis({
			skills: [{ filePath: "/tmp/skill/SKILL.md" }],
			skillDiagnostics: [{ type: "warning", message: "duplicate skill name" }],
		});

		(InteractiveMode as any).prototype.showLoadedResources.call(fakeThis);

		const output = renderAll(fakeThis.chatContainer);
		expect(output).toContain("[Skill conflicts]");
		expect(output).not.toContain("[Skills]");
	});
});
