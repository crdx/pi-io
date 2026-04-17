import {
	getCapabilities,
	getCellDimensions,
	getImageDimensions,
	type ImageDimensions,
	imageFallback,
	renderImage,
} from "../terminal-image.js";
import type { Component } from "../tui.js";

export interface ImageTheme {
	fallbackColor: (str: string) => string;
}

export interface ImageOptions {
	maxWidthCells?: number;
	maxHeightCells?: number;
	filename?: string;
	/** Kitty image ID. If provided, reuses this ID (for animations/updates). */
	imageId?: number;
}

export class Image implements Component {
	private base64Data: string;
	private mimeType: string;
	private dimensions: ImageDimensions;
	private theme: ImageTheme;
	private options: ImageOptions;
	private imageId?: number;

	private cachedLines?: string[];
	private cachedWidth?: number;

	constructor(
		base64Data: string,
		mimeType: string,
		theme: ImageTheme,
		options: ImageOptions = {},
		dimensions?: ImageDimensions,
	) {
		this.base64Data = base64Data;
		this.mimeType = mimeType;
		this.theme = theme;
		this.options = options;
		this.dimensions = dimensions || getImageDimensions(base64Data, mimeType) || { widthPx: 800, heightPx: 600 };
		this.imageId = options.imageId;
	}

	/** Get the Kitty image ID used by this image (if any). */
	getImageId(): number | undefined {
		return this.imageId;
	}

	invalidate(): void {
		this.cachedLines = undefined;
		this.cachedWidth = undefined;
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const cap = Math.min(width - 2, this.options.maxWidthCells ?? 60);
		const native = Math.ceil(this.dimensions.widthPx / getCellDimensions().widthPx);
		const maxWidth = Math.min(cap, native);

		const caps = getCapabilities();
		let lines: string[];

		if (caps.images) {
			const result = renderImage(this.base64Data, this.dimensions, {
				maxWidthCells: maxWidth,
				imageId: this.imageId,
			});

			if (result) {
				// Store the image ID for later cleanup
				if (result.imageId) {
					this.imageId = result.imageId;
				}

				// Return `rows` lines so TUI accounts for image height
				if (result.sequenceFirst) {
					// Kitty C=1 mode: sequence on first line, empty lines after.
					// No cursor-up needed; kitty does not move the cursor (C=1),
					// and the TUI advances through the empty lines naturally.
					lines = [result.sequence];
					for (let i = 1; i < result.rows; i++) {
						lines.push("");
					}
				} else {
					// Legacy cursor-up approach (iTerm2 etc.):
					// First (rows-1) lines are empty, last line moves cursor
					// back up then outputs the image sequence.
					lines = [];
					for (let i = 0; i < result.rows - 1; i++) {
						lines.push("");
					}
					const moveUp = result.rows > 1 ? `\x1b[${result.rows - 1}A` : "";
					lines.push(moveUp + result.sequence);
				}
			} else {
				const fallback = imageFallback(this.mimeType, this.dimensions, this.options.filename);
				lines = [this.theme.fallbackColor(fallback)];
			}
		} else {
			const fallback = imageFallback(this.mimeType, this.dimensions, this.options.filename);
			lines = [this.theme.fallbackColor(fallback)];
		}

		this.cachedLines = lines;
		this.cachedWidth = width;

		return lines;
	}
}
