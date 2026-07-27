import type { ImageContent } from "@mariozechner/pi-ai";
import { Container, Image, Markdown, type MarkdownTheme, Spacer, type TUI } from "@mariozechner/pi-tui";
import { KittyImageConverter } from "../../../utils/kitty-images.js";
import { getMarkdownTheme, theme } from "../theme/theme.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

/**
 * Component that renders a user message
 */
export class UserMessageComponent extends Container {
	private readonly imageConverter: KittyImageConverter;

	constructor(
		private readonly text: string,
		private readonly images: ImageContent[] = [],
		private readonly markdownTheme: MarkdownTheme = getMarkdownTheme(),
		ui?: TUI,
	) {
		super();
		this.imageConverter = new KittyImageConverter(() => {
			this.build();
			ui?.requestRender();
		});
		this.build();
	}

	/** Rebuilt rather than patched, because a conversion can add an image later. */
	private build(): void {
		this.clear();
		this.addChild(new Spacer(1));
		if (this.text) {
			this.addChild(
				new Markdown(this.text, 1, 1, this.markdownTheme, {
					bgColor: (text: string) => theme.bg("userMessageBg", text),
					color: (text: string) => theme.fg("userMessageText", text),
				}),
			);
		}

		for (const [index, image] of this.images.entries()) {
			const renderable = this.imageConverter.resolve(String(index), image);
			if (!renderable) {
				continue;
			}
			this.addChild(new Spacer(1));
			this.addChild(
				new Image(
					renderable.data,
					renderable.mimeType,
					{ fallbackColor: (str: string) => theme.fg("userMessageText", str) },
					{ maxWidthCells: 9999 },
				),
			);
		}
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (lines.length === 0) {
			return lines;
		}

		lines[0] = OSC133_ZONE_START + lines[0];
		lines[lines.length - 1] = lines[lines.length - 1] + OSC133_ZONE_END + OSC133_ZONE_FINAL;
		return lines;
	}
}
