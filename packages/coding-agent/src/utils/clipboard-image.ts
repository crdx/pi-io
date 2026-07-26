import { loadPhoton } from "./photon.js";

export type ClipboardImage = {
	bytes: Uint8Array;
	mimeType: string;
};

export const SUPPORTED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export function baseMimeType(mimeType: string): string {
	return mimeType.split(";")[0]?.trim().toLowerCase() ?? mimeType.toLowerCase();
}

export function isSupportedImageMimeType(mimeType: string): boolean {
	const base = baseMimeType(mimeType);
	return SUPPORTED_IMAGE_MIME_TYPES.some((t) => t === base);
}

/**
 * Convert unsupported image formats to PNG using Photon.
 * Returns null if conversion is unavailable or fails.
 */
export async function convertToPng(bytes: Uint8Array): Promise<Uint8Array | null> {
	const photon = await loadPhoton();
	if (!photon) {
		return null;
	}

	try {
		const image = photon.PhotonImage.new_from_byteslice(bytes);
		try {
			return image.get_bytes();
		} finally {
			image.free();
		}
	} catch {
		return null;
	}
}
