import { getBuildDate, loadBuildInfo, VERSION } from "../config.js";
import { timeAgo } from "../utils/relative-time.js";

export type BuildFact = {
	label: string;
	value: string;
};

/**
 * What this build is, as label and value pairs. Callers style them: `--build-info`
 * prints them plainly and `/version` renders them in the chat, so both report the
 * same thing rather than each deciding what is worth showing.
 */
export function describeBuild(now: Date = new Date()): BuildFact[] {
	const info = loadBuildInfo();
	const buildDate = getBuildDate();

	const facts: BuildFact[] = [{ label: "version", value: info?.tag ?? VERSION }];
	if (buildDate) {
		facts.push({ label: "built", value: `${formatBuildDate(buildDate)} (${timeAgo(buildDate, now)})` });
	}
	if (info?.sha) {
		facts.push({ label: "commit", value: info.sha });
	}
	facts.push({ label: "node", value: info?.node ?? process.version });
	if (info?.commitUrl) {
		facts.push({ label: "link", value: info.commitUrl });
	}
	return facts;
}

export function formatBuildDate(date: Date): string {
	const day = date.getDate();
	const suffix = [11, 12, 13].includes(day % 100) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th");

	const month = date.toLocaleString("en-GB", { month: "long" });
	const time = date.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

	return `${day}${suffix} ${month} ${date.getFullYear()}, ${time}`;
}
