import { spawnSync } from "node:child_process";

/**
 * External binaries the tools shell out to. They must be present on PATH.
 */
export type ExternalBinary = "fd" | "rg";

const cache = new Map<ExternalBinary, boolean>();

function isOnPath(name: ExternalBinary): boolean {
	const cached = cache.get(name);
	if (cached !== undefined) {
		return cached;
	}
	const result = spawnSync(name, ["--version"], { stdio: "ignore" });
	const found = !result.error;
	cache.set(name, found);
	return found;
}

/**
 * Resolve an external binary, or return undefined when it is not on PATH.
 */
export function findBinary(name: ExternalBinary): string | undefined {
	return isOnPath(name) ? name : undefined;
}

/**
 * Human-readable error for a missing binary, naming the package that provides it.
 */
export function missingBinaryMessage(name: ExternalBinary): string {
	const provider = name === "rg" ? "ripgrep" : "fd";
	return `${name} was not found on PATH. Install ${provider} to use this tool.`;
}
