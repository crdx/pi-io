import { existsSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

// =============================================================================
// Package Detection
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =============================================================================
// Package Asset Paths (shipped with executable)
// =============================================================================

/**
 * Get the base directory for resolving package assets (themes, package.json, docs).
 * - For Bun binary: returns the directory containing the executable
 * - For Node.js (dist/): returns __dirname (the dist/ directory)
 * - For tsx (src/): returns parent directory (the package root)
 */
export function getPackageDir(): string {
	// Allow override via environment variable (useful for Nix/Guix where store paths tokenize poorly)
	const envDir = process.env.PI_PACKAGE_DIR;
	if (envDir) {
		if (envDir === "~") return homedir();
		if (envDir.startsWith("~/")) return homedir() + envDir.slice(1);
		return envDir;
	}

	// Walk up from __dirname until we find package.json
	let dir = __dirname;
	while (dir !== dirname(dir)) {
		if (existsSync(join(dir, "package.json"))) {
			return dir;
		}
		dir = dirname(dir);
	}
	// Fallback (shouldn't happen)
	return __dirname;
}

/**
 * Get path to built-in themes directory (shipped with package)
 * - For dist/: dist/modes/interactive/theme/
 * - For tsx (src/): src/modes/interactive/theme/
 */
export function getThemesDir(): string {
	// Theme is in modes/interactive/theme/ relative to src/ or dist/
	const packageDir = getPackageDir();
	const srcOrDist = existsSync(join(packageDir, "src")) ? "src" : "dist";
	return join(packageDir, srcOrDist, "modes", "interactive", "theme");
}

/** Get path to package.json */
export function getPackageJsonPath(): string {
	return join(getPackageDir(), "package.json");
}

/** Get path to docs directory */
export function getDocsPath(): string {
	return resolve(join(getPackageDir(), "docs"));
}

// =============================================================================
// App Config (from package.json piConfig)
// =============================================================================

const pkg = JSON.parse(readFileSync(getPackageJsonPath(), "utf-8"));

export const APP_NAME: string = pkg.piConfig?.name || "pi";
export const CONFIG_DIR_NAME: string = pkg.piConfig?.configDir || ".pi";

function loadVersion(): string {
	const base: string = pkg.version;
	try {
		const infoPath = join(getPackageDir(), "meta.json");
		const info = JSON.parse(readFileSync(infoPath, "utf-8"));
		const parts: string[] = [info.tag ?? base];
		if (info.date) {
			parts.push(`(${info.date})`);
		}
		return parts.join(" ");
	} catch {
		return base;
	}
}

export const VERSION: string = loadVersion();

export interface BuildInfo {
	tag: string;
	sha?: string;
	date?: string;
	buildDate?: string;
	node?: string;
	commitUrl?: string;
}

export function loadBuildInfo(): BuildInfo | null {
	try {
		const infoPath = join(getPackageDir(), "meta.json");
		return JSON.parse(readFileSync(infoPath, "utf-8"));
	} catch {
		return null;
	}
}

/**
 * When the running build was produced.
 *
 * Releases record it in `meta.json`. Nothing writes that locally, so fall back
 * to this file's own timestamp: it is compiled output, so its mtime is the
 * moment the build ran, which is the question worth answering during
 * development ("am I running what I just built?").
 */
export function getBuildDate(): Date | null {
	const recorded = loadBuildInfo()?.buildDate;
	if (recorded) {
		const date = new Date(recorded);
		if (!Number.isNaN(date.getTime())) {
			return date;
		}
	}
	try {
		return statSync(__filename).mtime;
	} catch {
		return null;
	}
}

// e.g., PI_CODING_AGENT_DIR or TAU_CODING_AGENT_DIR
export const ENV_AGENT_DIR = `${APP_NAME.toUpperCase()}_CODING_AGENT_DIR`;

// =============================================================================
// User Config Paths (~/.pi/agent/*)
// =============================================================================

/** Get the agent config directory (e.g., ~/.pi/agent/) */
export function getAgentDir(): string {
	const envDir = process.env[ENV_AGENT_DIR];
	if (envDir) {
		// Expand tilde to home directory
		if (envDir === "~") return homedir();
		if (envDir.startsWith("~/")) return homedir() + envDir.slice(1);
		return envDir;
	}
	return join(homedir(), CONFIG_DIR_NAME, "agent");
}

/** Get path to user's custom themes directory */
export function getCustomThemesDir(): string {
	return join(getAgentDir(), "themes");
}

/** Get path to models.json */
export function getModelsPath(): string {
	return join(getAgentDir(), "models.json");
}

/** Get path to auth.json */
export function getAuthPath(): string {
	return join(getAgentDir(), "auth.json");
}

/** Get path to settings.json */
export function getSettingsPath(): string {
	return join(getAgentDir(), "settings.json");
}

/** Get path to tools directory */
export function getToolsDir(): string {
	return join(getAgentDir(), "tools");
}

/** Get path to managed binaries directory (fd, rg) */
export function getBinDir(): string {
	return join(getAgentDir(), "bin");
}

/** Get path to prompt templates directory */
export function getPromptsDir(): string {
	return join(getAgentDir(), "prompts");
}

/** Get path to sessions directory */
export function getSessionsDir(): string {
	return join(getAgentDir(), "sessions");
}

/** Get path to debug log file */
export function getDebugLogPath(): string {
	return join(getAgentDir(), `${APP_NAME}-debug.log`);
}
