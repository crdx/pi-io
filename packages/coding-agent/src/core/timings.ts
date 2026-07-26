/**
 * Central timing instrumentation for startup profiling.
 * Enable with PI_TIMING=1 environment variable.
 */

const ENABLED = process.env.PI_TIMING === "1";
const timings: Array<{ label: string; ms: number }> = [];

// Measured from process start rather than module load, so the first marker accounts for
// interpreter boot and the import graph instead of silently dropping them.
let lastTime = performance.timeOrigin;
let printed = false;

export function time(label: string): void {
	if (!ENABLED) return;
	const now = Date.now();
	timings.push({ label, ms: Math.round(now - lastTime) });
	lastTime = now;
}

export function printTimings(): void {
	if (!ENABLED || printed || timings.length === 0) return;
	printed = true;

	const total = timings.reduce((sum, entry) => sum + entry.ms, 0);
	const labelWidth = Math.max(...timings.map((entry) => entry.label.length), "TOTAL".length);

	console.error("\n--- Startup Timings ---");
	for (const entry of timings) {
		const share = total > 0 ? Math.round((entry.ms / total) * 100) : 0;
		const ms = String(entry.ms).padStart(5);
		console.error(`  ${entry.label.padEnd(labelWidth)}  ${ms}ms  ${String(share).padStart(3)}%`);
	}
	console.error(`  ${"TOTAL".padEnd(labelWidth)}  ${String(total).padStart(5)}ms`);
	console.error("------------------------\n");
}

// Print on every exit path, including the early ones that call process.exit() directly.
if (ENABLED) {
	process.on("exit", printTimings);
}
