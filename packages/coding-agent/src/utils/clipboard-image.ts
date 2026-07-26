import type { Terminal } from "@mariozechner/pi-tui";
import { convertToPng } from "./image-convert.js";

export type ClipboardImage = {
	/** base64 encoded PNG data */
	data: string;
	mimeType: string;
};

/**
 * Private sequence kitty sends after a ctrl+v paste, to say "a paste happened,
 * the clipboard may also hold an image". A private CSI with a `v` final byte,
 * which kitty never emits for a real key, so it cannot be mistaken for one.
 *
 * The other half lives in the kitty config:
 *
 *     map ctrl+v combine : paste_from_clipboard : send_text all \x1b[?5522v
 */
export const PASTE_SIGNAL = "\x1b[?5522v";

/** Queried in order; PNG first because screenshots dominate. */
const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const RESPONSE_TIMEOUT_MS = 5000;
const MAX_REPLY_BYTES = 64 * 1024 * 1024;

const OSC_OPENER = "\x1b]";
const STRING_TERMINATOR = "\x1b\\";
const BELL = "\x07";
const PACKET_PREFIX = "5522;";
const STATUS_MARKER = ":status=";

type Packet = {
	status: string;
	payload: string;
};

/**
 * Read an image from the clipboard using kitty's OSC 5522 protocol.
 *
 * Each candidate type is requested directly rather than listing the available
 * types first, because kitty's TARGETS response does not reliably enumerate
 * them. The result is always PNG, which is what the kitty graphics protocol
 * accepts for rendering.
 */
export async function readClipboardImage(terminal: Terminal): Promise<ClipboardImage | null> {
	for (const mimeType of IMAGE_MIME_TYPES) {
		const bytes = await requestClipboardType(terminal, mimeType);
		if (bytes) {
			return await convertToPng(bytes.toString("base64"), mimeType);
		}
	}
	return null;
}

async function requestClipboardType(terminal: Terminal, mimeType: string): Promise<Buffer | null> {
	const encodedType = Buffer.from(mimeType).toString("base64");
	const reply = await terminal.queryRaw(`${OSC_OPENER}5522;type=read;${encodedType}${STRING_TERMINATOR}`, {
		isComplete: createReplyCompleteCheck(),
		timeoutMs: RESPONSE_TIMEOUT_MS,
		maxBytes: MAX_REPLY_BYTES,
	});
	if (reply === null) {
		return null;
	}

	const bytes = collectPayload(reply);
	return bytes && bytes.length > 0 ? bytes : null;
}

/**
 * Incremental completeness check for queryRaw. Any status other than DATA or OK
 * ends the exchange, but only once that packet's terminator has arrived, since
 * collectPayload only reads whole packets. `:status=` cannot appear inside a
 * payload because neither `:` nor `=` belongs to the base64 alphabet, so a plain
 * substring scan is safe.
 */
function createReplyCompleteCheck(): (reply: string) => boolean {
	let scanFrom = 0;

	return (reply: string) => {
		let index = scanFrom;

		while (true) {
			const marker = reply.indexOf(STATUS_MARKER, index);
			if (marker === -1) {
				// Retain enough tail to re-find a marker split across two chunks.
				scanFrom = Math.max(0, reply.length - STATUS_MARKER.length);
				return false;
			}

			const valueStart = marker + STATUS_MARKER.length;
			const status = reply.slice(valueStart).match(/^([A-Z]+)[:;]/)?.[1];
			if (status === undefined) {
				scanFrom = marker;
				return false;
			}
			if (status !== "DATA" && status !== "OK") {
				if (reply.indexOf(STRING_TERMINATOR, valueStart) !== -1 || reply.indexOf(BELL, valueStart) !== -1) {
					return true;
				}
				scanFrom = marker;
				return false;
			}
			index = valueStart;
		}
	};
}

/**
 * Concatenate the DATA payloads of a completed reply. Each packet is decoded
 * separately because kitty pads them independently. Returns null when the
 * terminal refused (EPERM, ENOSYS, EBUSY, or anything unrecognised).
 */
function collectPayload(reply: string): Buffer | null {
	const chunks: Buffer[] = [];

	for (const packet of readPackets(reply)) {
		switch (packet.status) {
			case "DATA":
				chunks.push(Buffer.from(packet.payload, "base64"));
				break;
			case "OK":
				break;
			case "DONE":
				return Buffer.concat(chunks);
			default:
				return null;
		}
	}

	return null;
}

function readPackets(reply: string): Packet[] {
	const packets: Packet[] = [];
	let index = 0;

	while (true) {
		const opener = reply.indexOf(OSC_OPENER, index);
		if (opener === -1) {
			return packets;
		}

		const contentStart = opener + OSC_OPENER.length;
		const terminator = reply.indexOf(STRING_TERMINATOR, contentStart);
		const bell = reply.indexOf(BELL, contentStart);

		let contentEnd: number;
		if (terminator !== -1 && (bell === -1 || terminator < bell)) {
			contentEnd = terminator;
			index = terminator + STRING_TERMINATOR.length;
		} else if (bell !== -1) {
			contentEnd = bell;
			index = bell + BELL.length;
		} else {
			return packets;
		}

		const packet = parsePacket(reply.slice(contentStart, contentEnd));
		if (packet) {
			packets.push(packet);
		}
	}
}

function parsePacket(content: string): Packet | null {
	if (!content.startsWith(PACKET_PREFIX)) {
		return null;
	}

	const body = content.slice(PACKET_PREFIX.length);
	const separator = body.indexOf(";");
	const metadata = separator === -1 ? body : body.slice(0, separator);
	const payload = separator === -1 ? "" : body.slice(separator + 1);

	let status = "";
	for (const pair of metadata.split(":")) {
		const equals = pair.indexOf("=");
		if (equals !== -1 && pair.slice(0, equals) === "status") {
			status = pair.slice(equals + 1);
		}
	}

	return status ? { status, payload } : null;
}
