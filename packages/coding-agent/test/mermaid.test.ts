import { describe, expect, it } from "vitest";
import type { MarkdownTransformContext } from "../src/core/extensions/types.js";
import type { MermaidRenderingMode } from "../src/core/settings-manager.js";
import { createMermaidMarkdownTransformer } from "../src/modes/interactive/components/mermaid.js";
import type { Theme } from "../src/modes/interactive/theme/theme.js";

interface TransformOptions {
	maxWidth?: number;
	isStreaming?: boolean;
	messageType?: MarkdownTransformContext["messageType"];
	mode?: MermaidRenderingMode;
	theme?: Theme;
}

function transformMermaid(markdown: string, options: TransformOptions = {}): string {
	const transformer = createMermaidMarkdownTransformer({
		getMode: () => options.mode ?? "streaming",
		theme: options.theme,
	});
	return transformer(markdown, {
		availableWidth: options.maxWidth ?? 100,
		isStreaming: options.isStreaming ?? false,
		messageType: options.messageType ?? "assistant",
	});
}

const tagTheme = {
	fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
	bold: (text: string) => `<bold>${text}</bold>`,
} as Theme;

describe("Mermaid rendering", () => {
	it("replaces Mermaid code blocks with Unicode diagrams", () => {
		const markdown = "Before\n\n```mermaid\nflowchart LR\n  A[Start] --> B[Done]\n```\nAfter";
		const rendered = transformMermaid(markdown);

		expect(rendered).toContain("Before");
		expect(rendered).toContain("┌───────┐");
		expect(rendered).toContain("│ Start ├───▶│ Done │");
		expect(rendered).toContain("└───────┘    └──────┘`\nAfter");
		expect(rendered).not.toContain("```mermaid");
		expect(rendered).toContain("After");
	});

	it("distinguishes an unsupported diagram type from one it could not parse", () => {
		const unsupported = '```mermaid\npie\n  title Pets\n  "Dogs" : 4\n```';
		const unparseable = "```mermaid\nflowchart LR\n  ???!!!\n```";

		expect(transformMermaid(unsupported)).toContain(
			"[Mermaid diagram not drawn: that diagram type is not supported]",
		);
		expect(transformMermaid(unsupported)).toContain(unsupported);
		expect(transformMermaid(unparseable)).toContain("[Mermaid diagram not drawn: it could not be parsed]");
		expect(transformMermaid(unparseable)).toContain(unparseable);
	});

	it("says so when a diagram does not fit, rather than falling back in silence", () => {
		const oversized = "```mermaid\nflowchart LR\n  A[Start] --> B[Done]\n```";
		const rendered = transformMermaid(oversized, { maxWidth: 10 });
		const themed = transformMermaid(oversized, { maxWidth: 10, theme: tagTheme });

		expect(rendered).toContain(oversized);
		expect(rendered).toContain("[Mermaid diagram not drawn: need 21 columns (have 10)]");
		expect(rendered.indexOf("need 21 columns")).toBeLessThan(rendered.indexOf("```mermaid"));
		expect(themed).toContain("<warning>[Mermaid diagram not drawn: need 21 columns (have 10)]</warning>");
	});

	it("says nothing at all while streaming, whatever the reason", () => {
		const oversized = "```mermaid\nflowchart LR\n  A[Start] --> B[Done]\n```";
		const unsupported = '```mermaid\npie\n  title Pets\n  "Dogs" : 4\n```';
		const partial = "```mermaid\nflowchart LR\n  A[Foo]:::highlight --> B[Bar]\n```";

		expect(transformMermaid(oversized, { maxWidth: 10, isStreaming: true })).toBe(oversized);
		expect(transformMermaid(unsupported, { isStreaming: true })).toBe(unsupported);
		expect(transformMermaid(partial, { isStreaming: true })).not.toContain("Mermaid diagram");
		expect(transformMermaid(partial, { isStreaming: true })).toContain("│ Foo │");
	});

	it("maps semantic spans through the Pi theme", () => {
		const rendered = transformMermaid("```mermaid\nflowchart LR\n  A --> B\n```", { theme: tagTheme });

		expect(rendered).toContain("<borderMuted>");
		expect(rendered).toContain("<accent>");
	});

	it("renders incomplete Mermaid blocks during streaming", () => {
		const partialMarkdown = "```mermaid\nflowchart LR\n  A --> B";

		expect(transformMermaid(partialMarkdown, { isStreaming: true })).toContain("───▶");
	});

	it("draws a partly parsed diagram and captions what was dropped, rather than withholding it", () => {
		const markdown = "```mermaid\nflowchart LR\n  A[Foo]:::highlight --> B[Bar]\n```";
		const final = transformMermaid(markdown);

		expect(final).toContain("│ Foo │");
		expect(final).not.toContain("```mermaid");
		expect(final).toContain('[Mermaid diagram incomplete: dropped, expected a link: ":::highlight --> B[Bar]"]');
		expect(final.indexOf("Mermaid diagram incomplete")).toBeLessThan(final.indexOf("│ Foo │"));
		expect(final).not.toContain("more)");
	});

	it("summarizes additional partial-render warnings", () => {
		const markdown = "```mermaid\nflowchart LR\n  A[Foo]:::highlight --> B[Bar]\n  C[Baz]:::other --> D[Qux]\n```";
		const rendered = transformMermaid(markdown);

		expect(rendered).not.toContain("```mermaid");
		expect(rendered).toContain('dropped, expected a link: ":::highlight --> B[Bar]"');
		expect(rendered).toContain("(+1 more)");
		expect(rendered).not.toContain('dropped, expected a link: ":::other --> D[Qux]"');
	});

	it("respects rendering modes and skips thinking blocks", () => {
		const markdown = "```mermaid\nflowchart LR\n  A --> B\n```";

		expect(transformMermaid(markdown, { mode: "off" })).toBe(markdown);
		expect(transformMermaid(markdown, { mode: "final", isStreaming: true })).toBe(markdown);
		expect(transformMermaid(markdown, { mode: "final" })).not.toContain("```mermaid");
		expect(transformMermaid(markdown, { messageType: "assistant-thinking" })).toBe(markdown);
	});
});
