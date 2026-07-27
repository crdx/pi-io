import type { ImageContent } from "@mariozechner/pi-ai";
import { getCapabilities } from "@mariozechner/pi-tui";
import { convertToPng } from "./image-convert.js";

/**
 * Makes images renderable under the kitty graphics protocol, which accepts PNG
 * and nothing else. Anything in another format is converted in the background
 * and becomes available on a later pass, so a holder is needed rather than a
 * plain function.
 *
 * Terminals with other image support, or none, take the image unchanged and
 * fall back to a text description themselves.
 */
export class KittyImageConverter {
	private readonly converted = new Map<string, ImageContent>();
	private readonly pending = new Set<string>();

	/** Called when a conversion finishes, so the owner can rebuild and re-render. */
	constructor(private readonly onConverted: () => void) {}

	/**
	 * The form of `image` that can be shown now, or null while it is still being
	 * converted. `key` distinguishes images within one owner.
	 */
	resolve(key: string, image: ImageContent): ImageContent | null {
		if (!image.data || !image.mimeType) {
			return null;
		}
		if (getCapabilities().images !== "kitty" || image.mimeType === "image/png") {
			return image;
		}

		const converted = this.converted.get(key);
		if (converted) {
			return converted;
		}

		if (!this.pending.has(key)) {
			this.pending.add(key);
			void this.convert(key, image);
		}
		return null;
	}

	private async convert(key: string, image: ImageContent): Promise<void> {
		const converted = await convertToPng(image.data, image.mimeType);
		this.pending.delete(key);
		if (converted) {
			this.converted.set(key, { type: "image", ...converted });
			this.onConverted();
		}
	}
}
