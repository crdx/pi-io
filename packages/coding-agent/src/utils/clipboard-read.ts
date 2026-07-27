import type { Terminal } from "@mariozechner/pi-tui";
import { convertToPng } from "./image-convert.js";

export type ClipboardImage = {
	/** base64 encoded PNG data */
	data: string;
	mimeType: string;
};

/**
 * Paste events mode. While it is enabled the terminal answers a paste by
 * listing the clipboard's MIME types unprompted, and sends no bracketed paste,
 * so the application decides what to do with each type and pastes it itself.
 * That is the only way to see a paste at all when the clipboard holds an image
 * and no text, because there is then nothing for the terminal to paste.
 *
 * The listing carries a single-use password authorising the follow-up read
 * without a permission prompt.
 *
 * Terminals that do not know the mode ignore it and keep sending bracketed
 * pastes, so enabling it unconditionally is safe.
 *
 * https://rockorager.dev/misc/bracketed-paste-mime/
 */
export const PASTE_EVENTS_ON = "\x1b[?5522h";
export const PASTE_EVENTS_OFF = "\x1b[?5522l";

export type ClipboardLocation = "clipboard" | "primary";

/** An unprompted MIME type listing, sent because the user pasted. */
export type PasteEvent = {
	mimeTypes: string[];
	/** Authorises one prompt-free read of `location`, when the terminal issued one. */
	password: string | null;
	location: ClipboardLocation;
};

/** Preference order; PNG first because screenshots dominate. */
const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const TEXT_MIME_TYPE = "text/plain";

/** Asks for the list of available types rather than for a type's contents. */
const TARGETS_MIME_TYPE = ".";

const RESPONSE_TIMEOUT_MS = 5000;
const MAX_REPLY_BYTES = 64 * 1024 * 1024;

const OSC_OPENER = "\x1b]";
const STRING_TERMINATOR = "\x1b\\";
const BELL = "\x07";
const PACKET_PREFIX = "5522;";
const STATUS_MARKER = ":status=";
const EVENT_OPENER = `${OSC_OPENER}${PACKET_PREFIX}`;
const MAX_EVENT_BYTES = 64 * 1024;

type Packet = {
	status: string;
	payload: string;
	metadata: Map<string, string>;
	/** Offset just past this packet's terminator. */
	end: number;
};

type ReadTarget = {
	mimeType: string;
	password?: string | null;
	location?: ClipboardLocation;
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
		const bytes = await requestClipboardType(terminal, { mimeType });
		if (bytes) {
			return await convertToPng(bytes.toString("base64"), mimeType);
		}
	}
	return null;
}

/** The image a paste event offers, if it offers one. */
export async function readPastedImage(terminal: Terminal, event: PasteEvent): Promise<ClipboardImage | null> {
	const mimeType = IMAGE_MIME_TYPES.find((candidate) => event.mimeTypes.includes(candidate));
	if (!mimeType) {
		return null;
	}
	const bytes = await requestClipboardType(terminal, {
		mimeType,
		password: event.password,
		location: event.location,
	});
	return bytes ? await convertToPng(bytes.toString("base64"), mimeType) : null;
}

/** The text a paste event offers, if it offers any. */
export async function readPastedText(terminal: Terminal, event: PasteEvent): Promise<string | null> {
	if (!event.mimeTypes.includes(TEXT_MIME_TYPE)) {
		return null;
	}
	const bytes = await requestClipboardType(terminal, {
		mimeType: TEXT_MIME_TYPE,
		password: event.password,
		location: event.location,
	});
	return bytes ? bytes.toString("utf8") : null;
}

async function requestClipboardType(terminal: Terminal, target: ReadTarget): Promise<Buffer | null> {
	const reply = await terminal.queryRaw(encodeReadRequest(target), {
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
 * The requested types are the base64 payload after the final `;`, not a
 * metadata field. Both `pw` and the payload are base64, and the terminal
 * matches the password against the one it issued with the paste event.
 */
function encodeReadRequest(target: ReadTarget): string {
	let metadata = "type=read";
	if (target.location === "primary") {
		metadata += ":loc=primary";
	}
	if (target.password) {
		metadata += `:pw=${encodeBase64(target.password)}`;
	}
	return `${OSC_OPENER}${PACKET_PREFIX}${metadata};${encodeBase64(target.mimeType)}${STRING_TERMINATOR}`;
}

function encodeBase64(value: string): string {
	return Buffer.from(value, "utf8").toString("base64");
}

function decodeBase64(value: string): string {
	return Buffer.from(value, "base64").toString("utf8");
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

		const packet = parsePacket(reply.slice(contentStart, contentEnd), index);
		if (packet) {
			packets.push(packet);
		}
	}
}

function parsePacket(content: string, end: number): Packet | null {
	if (!content.startsWith(PACKET_PREFIX)) {
		return null;
	}

	const body = content.slice(PACKET_PREFIX.length);
	const separator = body.indexOf(";");
	const fields = separator === -1 ? body : body.slice(0, separator);
	const payload = separator === -1 ? "" : body.slice(separator + 1);

	const metadata = new Map<string, string>();
	for (const pair of fields.split(":")) {
		const equals = pair.indexOf("=");
		if (equals !== -1) {
			metadata.set(pair.slice(0, equals), pair.slice(equals + 1));
		}
	}

	const status = metadata.get("status");
	return status ? { status, payload, metadata, end } : null;
}

/**
 * Extract paste events from raw terminal input.
 *
 * The terminal sends these unprompted, so they arrive mixed in with keystrokes
 * and can straddle reads. Everything that is not part of an event is handed
 * back untouched, in order, for normal input handling.
 */
export class PasteEventReader {
	private buffered = "";

	feed(data: string): { data: string; events: PasteEvent[] } {
		const events: PasteEvent[] = [];
		// Anything buffered begins at an opener, so the search below finds it again.
		let pending = this.buffered + data;
		let passthrough = "";
		this.buffered = "";

		while (pending.length > 0) {
			const start = pending.indexOf(EVENT_OPENER);
			if (start === -1) {
				passthrough += pending;
				break;
			}

			passthrough += pending.slice(0, start);
			const block = pending.slice(start);
			// Cut at the first closing packet, so a second event is not absorbed.
			const scanned = readPackets(block);
			const closer = scanned.findIndex((packet) => packet.status !== "OK" && packet.status !== "DATA");
			const packets = closer === -1 ? scanned : scanned.slice(0, closer + 1);
			const last = packets.at(-1);

			if (!last || last.status === "OK" || last.status === "DATA") {
				// A listing is a few hundred bytes, so anything longer is not one.
				// Release it rather than swallowing every keystroke after it.
				if (block.length > MAX_EVENT_BYTES) {
					passthrough += block;
					break;
				}
				this.buffered = block;
				break;
			}

			const event = toPasteEvent(packets);
			if (event) {
				events.push(event);
			}
			pending = block.slice(last.end);
		}

		return { data: passthrough, events };
	}
}

/**
 * kitty answers the listing with one DATA packet whose payload is the types
 * separated by whitespace; the specification describes one empty DATA packet
 * per type instead. Accept either, since both are in the wild.
 */
function toPasteEvent(packets: Packet[]): PasteEvent | null {
	const mimeTypes = new Set<string>();
	let password: string | null = null;
	let location: ClipboardLocation = "clipboard";

	for (const packet of packets) {
		if (packet.status !== "OK" && packet.status !== "DATA" && packet.status !== "DONE") {
			return null;
		}
		if (packet.metadata.get("loc") === "primary") {
			location = "primary";
		}
		const encodedPassword = packet.metadata.get("pw");
		if (encodedPassword) {
			password = decodeBase64(encodedPassword);
		}
		const encodedType = packet.metadata.get("mime");
		const mimeType = encodedType ? decodeBase64(encodedType) : "";
		if (mimeType && mimeType !== TARGETS_MIME_TYPE) {
			mimeTypes.add(mimeType);
		}
		for (const listed of decodeBase64(packet.payload).split(/\s+/)) {
			if (listed) {
				mimeTypes.add(listed);
			}
		}
	}

	return { mimeTypes: [...mimeTypes], password, location };
}
