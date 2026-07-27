const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** Averages, since the point is a rough sense of age rather than a calendar. */
const MONTH = 2629800;
const YEAR = 31557600;

const UNITS: ReadonlyArray<{ seconds: number; name: string }> = [
	{ seconds: YEAR, name: "year" },
	{ seconds: MONTH, name: "month" },
	{ seconds: WEEK, name: "week" },
	{ seconds: DAY, name: "day" },
	{ seconds: HOUR, name: "hour" },
	{ seconds: MINUTE, name: "minute" },
	{ seconds: SECOND, name: "second" },
];

/** How long ago something happened, in the largest unit that still reads naturally. */
export function timeAgo(date: Date, now: Date = new Date()): string {
	const elapsed = Math.round((now.getTime() - date.getTime()) / 1000);

	// A clock that disagrees with a timestamp is not worth a wrong answer.
	if (elapsed < 0) {
		return "in the future";
	}
	if (elapsed < 10) {
		return "just now";
	}

	const unit = UNITS.find((candidate) => elapsed >= candidate.seconds) ?? UNITS[UNITS.length - 1];
	const count = Math.floor(elapsed / unit.seconds);
	return `${count} ${unit.name}${count === 1 ? "" : "s"} ago`;
}
