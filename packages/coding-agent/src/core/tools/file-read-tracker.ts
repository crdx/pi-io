import { stat } from "node:fs/promises";

export enum Freshness {
	Fresh = "fresh",
	Stale = "stale",
	Untracked = "untracked",
}

export class FileReadTracker {
	private mtimes = new Map<string, number>();

	record(absolutePath: string, mtimeMs: number): void {
		this.mtimes.set(absolutePath, mtimeMs);
	}

	async check(absolutePath: string): Promise<Freshness> {
		const recorded = this.mtimes.get(absolutePath);
		if (recorded === undefined) return Freshness.Untracked;
		try {
			const fileStat = await stat(absolutePath);
			return fileStat.mtimeMs === recorded ? Freshness.Fresh : Freshness.Stale;
		} catch {
			return Freshness.Stale;
		}
	}

	delete(absolutePath: string): void {
		this.mtimes.delete(absolutePath);
	}

	async update(absolutePath: string): Promise<void> {
		try {
			const fileStat = await stat(absolutePath);
			this.mtimes.set(absolutePath, fileStat.mtimeMs);
		} catch {
			this.mtimes.delete(absolutePath);
		}
	}
}
