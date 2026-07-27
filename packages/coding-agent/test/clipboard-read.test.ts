import type { Terminal, TerminalQueryOptions } from "@mariozechner/pi-tui";
import { describe, expect, test } from "vitest";
import { PasteEventReader, readClipboardImage } from "../src/utils/clipboard-read.js";

// 2x2 red PNG, shared with image-processing.test.ts
const TINY_PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAQMAAABIeJ9nAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURf8AAP///0EdNBEAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gEOADM5Ddoh/wAAAAxJREFUCNdjYGBgAAAABAABJzQnCgAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wMS0xNFQwMDo1MTo1NyswMDowMOnKzHgAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDEtMTRUMDA6NTE6NTcrMDA6MDCYl3TEAAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTAxLTE0VDAwOjUxOjU3KzAwOjAwz4JVGwAAAABJRU5ErkJggg==";

// 2x2 blue JPEG, shared with image-processing.test.ts
const TINY_JPEG =
	"/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAGCf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AD3VTB3/2Q==";

const ESC = "\x1b";
const ST = `${ESC}\\`;
const BEL = "\x07";

/**
 * Shaped as the terminal really sends them: a status with no payload is the
 * last field in the packet, so nothing delimits it but the terminator.
 */
function packet(status: string, payload = "", terminator = ST): string {
	const mime = payload ? `:mime=${Buffer.from("image/png").toString("base64")}` : "";
	const body = payload ? `;${payload}` : "";
	return `${ESC}]5522;type=read:status=${status}${mime}${body}${terminator}`;
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

const base64 = (value: string) => Buffer.from(value).toString("base64");

/** A paste event as kitty sends it: the types in one whitespace-separated payload. */
function pasteEvent(types: string[], { password = "secret", primary = false } = {}): string {
	const pw = `:pw=${base64(password)}`;
	const loc = primary ? ":loc=primary" : "";
	return [
		`${ESC}]5522;type=read:status=OK${loc}${pw}${ST}`,
		`${ESC}]5522;type=read:status=DATA:mime=${base64(".")}${pw};${base64(`${types.join(" ")}\n`)}${ST}`,
		`${ESC}]5522;type=read:status=DONE${pw}${ST}`,
	].join("");
}

describe("PasteEventReader", () => {
	test("passes input through untouched when there is no event", () => {
		const result = new PasteEventReader().feed("hello\x1b[200~pasted\x1b[201~");

		expect(result.data).toBe("hello\x1b[200~pasted\x1b[201~");
		expect(result.events).toEqual([]);
	});

	test("reads the types, password and location from a listing", () => {
		const result = new PasteEventReader().feed(pasteEvent(["image/png", "text/plain"]));

		expect(result.data).toBe("");
		expect(result.events).toEqual([
			{ mimeTypes: ["image/png", "text/plain"], password: "secret", location: "clipboard" },
		]);
	});

	test("reads a listing sent as one empty packet per type", () => {
		const spec = [
			`${ESC}]5522;type=read:status=OK:pw=${base64("pw1")}${ST}`,
			`${ESC}]5522;type=read:status=DATA:mime=${base64("image/png")}${ST}`,
			`${ESC}]5522;type=read:status=DATA:mime=${base64("text/plain")}${ST}`,
			`${ESC}]5522;type=read:status=DONE${ST}`,
		].join("");

		const result = new PasteEventReader().feed(spec);

		expect(result.events[0]!.mimeTypes).toEqual(["image/png", "text/plain"]);
		expect(result.events[0]!.password).toBe("pw1");
	});

	test("reports a paste from the primary selection", () => {
		const result = new PasteEventReader().feed(pasteEvent(["text/plain"], { primary: true }));

		expect(result.events[0]!.location).toBe("primary");
	});

	test("reassembles a listing split across reads", () => {
		const reader = new PasteEventReader();
		const event = pasteEvent(["image/png"]);
		const collected: string[] = [];
		let events = 0;

		for (const chunk of chunked(event, 7)) {
			const result = reader.feed(chunk);
			collected.push(result.data);
			events += result.events.length;
		}

		expect(collected.join("")).toBe("");
		expect(events).toBe(1);
	});

	test("keeps surrounding keystrokes, in order", () => {
		const result = new PasteEventReader().feed(`ab${pasteEvent(["text/plain"])}cd`);

		expect(result.data).toBe("abcd");
		expect(result.events).toHaveLength(1);
	});

	test("reports both events when two arrive in one read", () => {
		const result = new PasteEventReader().feed(pasteEvent(["image/png"]) + pasteEvent(["text/plain"]));

		expect(result.events.map((event) => event.mimeTypes)).toEqual([["image/png"], ["text/plain"]]);
	});

	test("consumes a refusal without reporting an event", () => {
		const result = new PasteEventReader().feed(`${ESC}]5522;type=read:status=EPERM${ST}x`);

		expect(result.data).toBe("x");
		expect(result.events).toEqual([]);
	});

	test("releases a partial event that grows past any plausible listing", () => {
		const reader = new PasteEventReader();
		const opener = `${ESC}]5522;type=read:status=OK${ST}`;

		expect(reader.feed(opener).data).toBe("");
		const result = reader.feed("x".repeat(64 * 1024));

		expect(result.data).toContain("x");
		expect(reader.feed("y")).toEqual({ data: "y", events: [] });
	});
});
