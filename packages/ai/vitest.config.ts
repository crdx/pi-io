import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve workspace packages to source so tests never run against a stale dist/ build.
const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		testTimeout: 30000, // 30 seconds for API calls
	},
	resolve: {
		alias: [
			{ find: /^@mariozechner\/pi-ai\/oauth$/, replacement: resolvePath("./src/oauth.ts") },
			{ find: /^@mariozechner\/pi-ai$/, replacement: resolvePath("./src/index.ts") },
			{ find: /^@mariozechner\/pi-tui$/, replacement: resolvePath("../tui/src/index.ts") },
		],
	},
});
