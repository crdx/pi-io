import type { Terminal, TerminalQueryOptions } from "@mariozechner/pi-tui";
import { describe, expect, test } from "vitest";
import { readClipboardImage } from "../src/utils/clipboard-image.js";

// 2x2 red PNG, shared with image-processing.test.ts
const TINY_PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAQMAAABIeJ9nAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURf8AAP///0EdNBEAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gEOADM5Ddoh/wAAAAxJREFUCNdjYGBgAAAABAABJzQnCgAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wMS0xNFQwMDo1MTo1NyswMDowMOnKzHgAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDEtMTRUMDA6NTE6NTcrMDA6MDCYl3TEAAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTAxLTE0VDAwOjUxOjU3KzAwOjAwz4JVGwAAAABJRU5ErkJggg==";

// 2x2 blue JPEG, shared with image-processing.test.ts
const TINY_JPEG =
	"/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAGCf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AD3VTB3/2Q==";

const ESC = "\x1b";
const ST = `${ESC}\\`;
const BEL = "\x07";

function packet(status: string, payload = "", terminator = ST): string {
	return `${ESC}]5522;type=read:status=${status}:mime=;${payload}${terminator}`;
}

/** Split a string into fixed-size chunks, as the terminal would deliver it. */
function chunked(text: string, size: number): string[] {
	const chunks: string[] = [];
	for (let index = 0; index < text.length; index += size) {
		chunks.push(text.slice(index, index + size));
	}
	return chunks;
}

/**
 * Terminal double that feeds a canned reply through the caller's completeness
 * predicate one chunk at a time, so the predicate is exercised the way
 * ProcessTerminal.queryRaw would exercise it.
 */
function fakeTerminal(replies: Record<string, string>, chunkSize = 8): Terminal {
	return {
		async queryRaw(request: string, options: TerminalQueryOptions): Promise<string | null> {
			const requestedType = Buffer.from(request.slice(request.indexOf(";type=read;") + 11, -2), "base64").toString();
			const reply = replies[requestedType];
			if (reply === undefined) {
				return null;
			}

			let accumulated = "";
			for (const chunk of chunked(reply, chunkSize)) {
				accumulated += chunk;
				if (Buffer.byteLength(accumulated) > options.maxBytes) {
					return null;
				}
				if (options.isComplete(accumulated)) {
					return accumulated;
				}
			}
			return null;
		},
	} as Terminal;
}

describe("readClipboardImage", () => {
	test("returns the PNG payload of a single DATA packet", async () => {
		const terminal = fakeTerminal({ "image/png": packet("DATA", TINY_PNG) + packet("DONE") });

		const image = await readClipboardImage(terminal);

		expect(image).not.toBeNull();
		expect(image!.mimeType).toBe("image/png");
		expect(image!.data).toBe(TINY_PNG);
	});

	test("decodes each DATA packet separately rather than concatenating base64", async () => {
		// Split at a byte offset that is not a multiple of 3, so each half is
		// padded independently. Concatenating the base64 would corrupt the image.
		const bytes = Buffer.from(TINY_PNG, "base64");
		const head = bytes.subarray(0, 70).toString("base64");
		const tail = bytes.subarray(70).toString("base64");
		expect(head).toContain("=");

		const terminal = fakeTerminal({
			"image/png": packet("OK") + packet("DATA", head) + packet("DATA", tail) + packet("DONE"),
		});

		const image = await readClipboardImage(terminal);

		expect(image!.data).toBe(TINY_PNG);
	});

	test("accepts BEL as a packet terminator", async () => {
		const terminal = fakeTerminal({
			"image/png": packet("DATA", TINY_PNG, BEL) + packet("DONE", "", BEL),
		});

		const image = await readClipboardImage(terminal);

		expect(image!.data).toBe(TINY_PNG);
	});

	test("returns null when the terminal refuses the read", async () => {
		const terminal = fakeTerminal({ "image/png": packet("EPERM") });

		expect(await readClipboardImage(terminal)).toBeNull();
	});

	test("returns null when no packet ever reports DONE", async () => {
		const terminal = fakeTerminal({ "image/png": packet("DATA", TINY_PNG) });

		expect(await readClipboardImage(terminal)).toBeNull();
	});

	test("falls through to the next type and converts it to PNG", async () => {
		const terminal = fakeTerminal({
			"image/png": packet("DONE"),
			"image/jpeg": packet("DATA", TINY_JPEG) + packet("DONE"),
		});

		const image = await readClipboardImage(terminal);

		expect(image).not.toBeNull();
		expect(image!.mimeType).toBe("image/png");
		expect(Buffer.from(image!.data, "base64").subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	});

	test("returns null when every type fails", async () => {
		expect(await readClipboardImage(fakeTerminal({}))).toBeNull();
	});

	test("does not complete early when a status arrives split across chunks", async () => {
		// A chunk size of 1 puts every status boundary mid-token.
		const terminal = fakeTerminal({ "image/png": packet("DATA", TINY_PNG) + packet("DONE") }, 1);

		const image = await readClipboardImage(terminal);

		expect(image!.data).toBe(TINY_PNG);
	});
});
