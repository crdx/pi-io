import { Marked, type Token } from "@mariozechner/pi-tui";
import { diagramKind, type MermaidArt, render, type Span } from "grok-mermaid";
import type { MarkdownTransformer } from "../../../core/extensions/types.ts";
import type { MermaidRenderingMode } from "../../../core/settings-manager.ts";
import type { Theme } from "../theme/theme.ts";

const markdownParser = new Marked();

interface MermaidTransformerOptions {
	getMode: () => MermaidRenderingMode;
	theme?: Theme;
}

function isMermaid(token: Token): token is Token & { type: "code"; text: string; lang?: string } {
	return token.type === "code" && token.lang?.trim().split(/\s+/, 1)[0]?.toLowerCase() === "mermaid";
}

function codeSpan(line: string): string {
	// Encode each diagram row as inline code (` ... `) so Markdown preserves its spacing and
	// box-drawing characters. Use a non-breaking space for blank rows because an
	// empty code span has no visible height.
	const content = line || "\u00a0";
	const longestBacktickRun = Math.max(0, ...Array.from(content.matchAll(/`+/g), (match) => match[0].length));
	const fence = "`".repeat(longestBacktickRun + 1);
	const padding = content.startsWith("`") || content.endsWith("`") ? " " : "";
	return `${fence}${padding}${content}${padding}${fence}`;
}

function notice(text: string, theme?: Theme): string {
	const line = `[${text}]`;
	return `${theme ? theme.fg("warning", line) : line}\n\n`;
}

function diagram(art: MermaidArt, theme?: Theme): string {
	const lines = theme ? themedLines(art, theme) : art.plain;
	return `${lines.map(codeSpan).join("  \n")}\n`;
}

function styleSpan(span: Span, theme: Theme): string {
	switch (span.cls) {
		case "border":
			return theme.fg("borderMuted", span.text);
		case "text":
			return theme.fg("text", span.text);
		case "edge":
			return theme.fg("accent", span.text);
		case "edgeLabel":
			return theme.fg("muted", span.text);
		case "title":
			return theme.fg("accent", theme.bold(span.text));
		case "none":
			return span.text;
	}
}

function themedLines(art: MermaidArt, theme: Theme): string[] {
	return art.styled.map((row) => row.map((span) => styleSpan(span, theme)).join(""));
}

/** Create a transformer that replaces top-level Mermaid code blocks with Unicode terminal diagrams. */
export function createMermaidMarkdownTransformer(options: MermaidTransformerOptions): MarkdownTransformer {
	return (markdown, context) => {
		const mode = options.getMode();
		if (
			mode === "off" ||
			context.messageType === "assistant-thinking" ||
			(context.isStreaming && mode !== "streaming")
		) {
			return markdown;
		}

		return markdownParser
			.lexer(markdown)
			.map((token) => {
				if (!isMermaid(token)) return token.raw;
				const art = render(token.text);

				if (context.isStreaming) {
					const fits = art && art.width <= context.availableWidth;
					return fits ? diagram(art, options.theme) : token.raw;
				}

				if (!art) {
					const reason = diagramKind(token.text) ? "it could not be parsed" : "that diagram type is not supported";
					return `${notice(`Mermaid diagram not drawn: ${reason}`, options.theme)}${token.raw}`;
				}

				if (art.width > context.availableWidth) {
					const tooWide = `Mermaid diagram not drawn: need ${art.width} columns (have ${context.availableWidth})`;
					return `${notice(tooWide, options.theme)}${token.raw}`;
				}

				if (art.warnings.length === 0) {
					return diagram(art, options.theme);
				}

				const suffix = art.warnings.length > 1 ? ` (+${art.warnings.length - 1} more)` : "";
				const incomplete = `Mermaid diagram incomplete: ${art.warnings[0]}${suffix}`;
				return `${notice(incomplete, options.theme)}${diagram(art, options.theme)}`;
			})
			.join("");
	};
}
