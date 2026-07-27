import { describe, expect, test } from "vitest";
import { timeAgo } from "../src/utils/relative-time.js";

const NOW = new Date("2026-07-27T12:00:00Z");

function ago(seconds: number): string {
	return timeAgo(new Date(NOW.getTime() - seconds * 1000), NOW);
}

describe("timeAgo", () => {
	test("says just now for anything within ten seconds", () => {
		expect(ago(0)).toBe("just now");
		expect(ago(9)).toBe("just now");
	});

	test("counts in the largest unit that still fits", () => {
		expect(ago(30)).toBe("30 seconds ago");
		expect(ago(60)).toBe("1 minute ago");
		expect(ago(3 * 60)).toBe("3 minutes ago");
		expect(ago(60 * 60)).toBe("1 hour ago");
		expect(ago(5 * 60 * 60)).toBe("5 hours ago");
		expect(ago(24 * 60 * 60)).toBe("1 day ago");
		expect(ago(3 * 24 * 60 * 60)).toBe("3 days ago");
		expect(ago(7 * 24 * 60 * 60)).toBe("1 week ago");
		expect(ago(31 * 24 * 60 * 60)).toBe("1 month ago");
		expect(ago(70 * 24 * 60 * 60)).toBe("2 months ago");
		expect(ago(400 * 24 * 60 * 60)).toBe("1 year ago");
	});

	test("rounds down, so a unit is only claimed once reached", () => {
		expect(ago(59)).toBe("59 seconds ago");
		expect(ago(119)).toBe("1 minute ago");
	});

	test("does not invent a duration when the clock disagrees", () => {
		expect(timeAgo(new Date(NOW.getTime() + 60_000), NOW)).toBe("in the future");
	});
});
