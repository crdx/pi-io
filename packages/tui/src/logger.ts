import { appendFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Append-only debug log, silent unless `PI_LOG=1`.
 *
 * stdout is the rendered UI, so `console.log` corrupts the display and is
 * never an option here. With the variable set, lines are appended to `pi.log`
 * in the working directory:
 *
 *     dbg("paste.start", { mimeTypes: ["image/png"] })
 *     →   1783ms paste.start {"mimeTypes":["image/png"]}
 *
 * Times are milliseconds since the process started, so a log reads as a
 * timeline and shows up anything that stalls.
 *
 * Logging is meant to be added while chasing a problem and taken out with it.
 * Only what earns a permanent place should stay.
 *
 * See also `PI_TUI_WRITE_LOG` in terminal.ts, which dumps everything written
 * to the terminal, for when the question is what was emitted rather than what
 * the code decided.
 */

const ENABLED = process.env.PI_LOG === "1";
const LOG_PATH = join(process.cwd(), "pi.log");
const STARTED_AT = Date.now();

export function dbg(event: string, fields?: Record<string, unknown>): void {
	if (!ENABLED) {
		return;
	}
	try {
		const elapsed = String(Date.now() - STARTED_AT).padStart(6);
		const detail = fields ? ` ${JSON.stringify(fields)}` : "";
		appendFileSync(LOG_PATH, `${elapsed}ms ${event}${detail}\n`);
	} catch {
		// A broken log must never take the application with it.
	}
}

/** Escape sequences and other control characters, rendered so a log line survives them. */
export function visible(data: string): string {
	return data
		.replace(/\x1b/g, "\\e")
		.replace(/\x07/g, "\\a")
		.replace(/\r/g, "\\r")
		.replace(/\n/g, "\\n")
		.replace(/[\x00-\x1f]/g, (character) => `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`);
}
