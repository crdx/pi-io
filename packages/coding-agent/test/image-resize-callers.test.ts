import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/image-resize.js", () => ({
	resizeImage: vi.fn(),
	formatDimensionNote: vi.fn(() => undefined),
}));

import { processFileArguments } from "../src/cli/file-processor.js";
import { createReadTool } from "../src/core/tools/read.js";
import { resizeImage } from "../src/utils/image-resize.js";

const TINY_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

function mockSuccessfulResize(wasResized = false) {
	vi.mocked(resizeImage).mockResolvedValue({
		data: TINY_PNG_BASE64,
		mimeType: "image/png",
		originalWidth: wasResized ? 4000 : 1,
		originalHeight: wasResized ? 2000 : 1,
		width: wasResized ? 2000 : 1,
		height: wasResized ? 1000 : 1,
		wasResized,
	});
}

describe("image resize callers", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `image-resize-callers-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		vi.mocked(resizeImage).mockReset();
		vi.mocked(resizeImage).mockResolvedValue(null);
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it("read tool returns text-only output when auto-resize cannot produce a safe image", async () => {
		const imagePath = join(testDir, "test.png");
		writeFileSync(imagePath, Buffer.from(TINY_PNG_BASE64, "base64"));

		const tool = createReadTool(testDir);
		const result = await tool.execute("test-read-image", { path: imagePath });

		expect(result.content).toHaveLength(1);
		expect(result.content[0].type).toBe("text");
		expect((result.content[0] as { type: "text"; text: string }).text).toContain("Image omitted");
	});

	it("file processor omits image attachments when auto-resize cannot produce a safe image", async () => {
		const imagePath = join(testDir, "test.png");
		writeFileSync(imagePath, Buffer.from(TINY_PNG_BASE64, "base64"));

		const result = await processFileArguments([imagePath]);

		expect(result.images).toHaveLength(0);
		expect(result.text).toContain("Image omitted");
	});

	it("read tool attaches the image when auto-resize succeeds", async () => {
		mockSuccessfulResize();
		const imagePath = join(testDir, "test.png");
		writeFileSync(imagePath, Buffer.from(TINY_PNG_BASE64, "base64"));

		const tool = createReadTool(testDir);
		const result = await tool.execute("test-read-image", { path: imagePath });

		expect(result.content.some((block) => block.type === "image")).toBe(true);
	});

	it("file processor attaches the image when auto-resize succeeds", async () => {
		mockSuccessfulResize();
		const imagePath = join(testDir, "test.png");
		writeFileSync(imagePath, Buffer.from(TINY_PNG_BASE64, "base64"));

		const result = await processFileArguments([imagePath]);

		expect(result.images).toHaveLength(1);
		expect(result.images[0].type).toBe("image");
	});
});
