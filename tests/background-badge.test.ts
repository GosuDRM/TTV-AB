import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const g = globalThis as Record<string, unknown>;

type BadgeCall = { method: string; arg: unknown };
const badgeCalls: BadgeCall[] = [];
let storageData: Record<string, unknown> = {};
const storageChangeListeners: Array<
	(changes: Record<string, { newValue?: unknown }>, namespace: string) => void
> = [];

function loadBackground() {
	const js = readFileSync(
		resolve(__dirname, "../dist/src/scripts/background.js"),
		"utf8",
	)
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const (\w+)\s*=/gm, "globalThis.$1 =")
		.replace(/^let\s+(\w+)/gm, "globalThis.$1")
		.replace(/^(async\s+)?function (\w+)/gm, "globalThis.$2 = $1function");
	new Function("globalThis", js)(globalThis);
}

beforeAll(() => {
	g.chrome = {
		runtime: {
			id: "ttvab-test",
			lastError: null,
			onMessage: { addListener: () => {} },
		},
		storage: {
			local: {
				get: (_keys: unknown, cb: (result: unknown) => void) =>
					cb(storageData),
				set: (value: Record<string, unknown>, cb: () => void) => {
					storageData = { ...storageData, ...value };
					cb();
				},
			},
			onChanged: {
				addListener: (listener: (typeof storageChangeListeners)[number]) =>
					storageChangeListeners.push(listener),
			},
		},
		action: {
			setBadgeText: (arg: unknown) => {
				badgeCalls.push({ method: "setBadgeText", arg });
				return Promise.resolve();
			},
			setBadgeBackgroundColor: (arg: unknown) => {
				badgeCalls.push({ method: "setBadgeBackgroundColor", arg });
				return Promise.resolve();
			},
			setBadgeTextColor: (arg: unknown) => {
				badgeCalls.push({ method: "setBadgeTextColor", arg });
				return Promise.resolve();
			},
		},
	};
	loadBackground();
});

beforeEach(() => {
	badgeCalls.length = 0;
});

function fmt(n: number): string {
	return (g.formatBadgeCount as (v: unknown) => string)(n);
}

describe("formatBadgeCount", () => {
	it("shows exact counts below 1000", () => {
		expect(fmt(0)).toBe("0");
		expect(fmt(1)).toBe("1");
		expect(fmt(42)).toBe("42");
		expect(fmt(999)).toBe("999");
	});

	it("compacts thousands with a K suffix", () => {
		expect(fmt(1000)).toBe("1K");
		expect(fmt(1500)).toBe("1.5K");
		expect(fmt(9999)).toBe("9.9K");
		expect(fmt(12000)).toBe("12K");
		expect(fmt(120000)).toBe("120K");
	});

	it("never rounds up across a unit boundary", () => {
		expect(fmt(999999)).toBe("999K");
		expect(fmt(1999)).toBe("1.9K");
		expect(fmt(999949)).toBe("999K");
	});

	it("compacts millions, billions, and trillions", () => {
		expect(fmt(1000000)).toBe("1M");
		expect(fmt(1500000)).toBe("1.5M");
		expect(fmt(15000000)).toBe("15M");
		expect(fmt(1000000000)).toBe("1B");
		expect(fmt(2500000000)).toBe("2.5B");
		expect(fmt(1000000000000)).toBe("1T");
	});

	it("stays within four characters for realistic counts", () => {
		for (const n of [999, 1000, 1500, 12000, 120000, 999999, 1500000]) {
			expect(fmt(n).length).toBeLessThanOrEqual(4);
		}
	});

	it("coerces dirty input through normalizeCount", () => {
		expect(fmt(-5 as unknown as number)).toBe("0");
		expect(fmt("2000" as unknown as number)).toBe("2K");
		expect(fmt(Number.NaN as unknown as number)).toBe("0");
		expect(fmt(1234.9 as unknown as number)).toBe("1.2K");
	});
});

describe("applyBadgeCount", () => {
	function apply(n: unknown) {
		(g.applyBadgeCount as (v: unknown) => void)(n);
	}

	it("paints a red badge with white text for positive counts", () => {
		apply(1500);
		const text = badgeCalls.find((c) => c.method === "setBadgeText");
		const bg = badgeCalls.find((c) => c.method === "setBadgeBackgroundColor");
		const fg = badgeCalls.find((c) => c.method === "setBadgeTextColor");
		expect(text?.arg).toEqual({ text: "1.5K" });
		expect(bg?.arg).toEqual({ color: "#E0245E" });
		expect(fg?.arg).toEqual({ color: "#FFFFFF" });
	});

	it("clears the badge when the count is zero", () => {
		apply(0);
		const text = badgeCalls.find((c) => c.method === "setBadgeText");
		expect(text?.arg).toEqual({ text: "" });
	});
});

describe("storage-driven badge refresh", () => {
	it("registered a local ttvAdsBlocked change listener", () => {
		expect(storageChangeListeners.length).toBeGreaterThan(0);
	});

	it("repaints the badge when ttvAdsBlocked changes", () => {
		for (const listener of storageChangeListeners) {
			listener({ ttvAdsBlocked: { newValue: 2500000 } }, "local");
		}
		const text = badgeCalls.find((c) => c.method === "setBadgeText");
		expect(text?.arg).toEqual({ text: "2.5M" });
	});

	it("ignores changes from other namespaces and unrelated keys", () => {
		for (const listener of storageChangeListeners) {
			listener({ ttvAdsBlocked: { newValue: 5 } }, "sync");
			listener({ ttvStats: { newValue: {} } }, "local");
		}
		expect(badgeCalls.length).toBe(0);
	});
});

describe("channel stats schema and watch-time persistence", () => {
	function setStorage(data: Record<string, unknown>) {
		storageData = data;
	}
	function getStoredStats() {
		return storageData.ttvStats as {
			channels: Record<
				string,
				{ ads: number; firstSeen: number; lastSeen: number; watchSeconds: number }
			>;
			daily: Record<string, { ads: number }>;
			achievements: string[];
		};
	}
	const persist = () =>
		g.persistCounterDelta as (detail: unknown) => Promise<{
			ok: boolean;
			counts: { ads: number } | null;
		}>;

	beforeEach(() => {
		setStorage({});
	});

	it("migrates legacy numeric channel entries into the object shape", () => {
		const normalize = g.normalizeChannelsMap as (
			value: unknown,
		) => Record<string, { ads: number; watchSeconds: number }>;
		const result = normalize({ somestreamer: 7 });
		expect(result.somestreamer).toEqual({
			ads: 7,
			firstSeen: 0,
			lastSeen: 0,
			watchSeconds: 0,
		});
	});

	it("stamps firstSeen and lastSeen when ads are persisted for a channel", async () => {
		const before = Date.now();
		const response = await persist()({
			flushId: "flush:test:ads-0001",
			adsDelta: 3,
			channelDeltas: { somestreamer: 3 },
		});
		expect(response.ok).toBe(true);
		expect(response.counts?.ads).toBe(3);
		const entry = getStoredStats().channels.somestreamer;
		expect(entry.ads).toBe(3);
		expect(entry.watchSeconds).toBe(0);
		expect(entry.firstSeen).toBeGreaterThanOrEqual(before);
		expect(entry.lastSeen).toBeGreaterThanOrEqual(entry.firstSeen);
	});

	it("persists watch-only deltas without touching the ads total or daily series", async () => {
		setStorage({ ttvAdsBlocked: 10 });
		const response = await persist()({
			flushId: "flush:test:watch-0001",
			adsDelta: 0,
			watchDeltas: { somestreamer: 120 },
		});
		expect(response.ok).toBe(true);
		expect(storageData.ttvAdsBlocked).toBe(10);
		const stats = getStoredStats();
		expect(stats.channels.somestreamer.watchSeconds).toBe(120);
		expect(stats.channels.somestreamer.ads).toBe(0);
		expect(stats.channels.somestreamer.firstSeen).toBe(0);
		expect(Object.keys(stats.daily).length).toBe(0);
	});

	it("accumulates watch time on top of an existing migrated count", async () => {
		setStorage({
			ttvAdsBlocked: 5,
			ttvStats: { channels: { somestreamer: 5 }, daily: {}, achievements: [] },
		});
		await persist()({
			flushId: "flush:test:watch-0002",
			adsDelta: 0,
			watchDeltas: { somestreamer: 60 },
		});
		await persist()({
			flushId: "flush:test:watch-0003",
			adsDelta: 0,
			watchDeltas: { somestreamer: 45 },
		});
		const entry = getStoredStats().channels.somestreamer;
		expect(entry.ads).toBe(5);
		expect(entry.watchSeconds).toBe(105);
	});

	it("caps a single watch delta at two hours", async () => {
		await persist()({
			flushId: "flush:test:watch-0004",
			adsDelta: 0,
			watchDeltas: { somestreamer: 999999 },
		});
		expect(getStoredStats().channels.somestreamer.watchSeconds).toBe(7200);
	});

	it("does not unlock channel achievements from watch-only channels", async () => {
		await persist()({
			flushId: "flush:test:watch-0005",
			adsDelta: 1,
			channelDeltas: { adstreamer: 1 },
			watchDeltas: {
				watchera: 60,
				watcherb: 60,
				watcherc: 60,
				watcherd: 60,
				watchere: 60,
			},
		});
		const stats = getStoredStats();
		expect(Object.keys(stats.channels).length).toBe(6);
		expect(stats.achievements).not.toContain("channels_5");
	});
});
