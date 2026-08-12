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
				get: (_keys: unknown, cb: (result: unknown) => void) => cb(storageData),
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
				{
					ads: number;
					firstSeen: number;
					lastSeen: number;
					watchSeconds: number;
				}
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
			adMilliseconds: 0,
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

	it("keeps an uncleared committed flush deduplicated after 256 later confirmations", async () => {
		const persist = g.persistCounterDelta as (
			detail: unknown,
		) => Promise<{ ok: boolean }>;
		const confirm = g.confirmCounterFlush as (
			detail: unknown,
		) => Promise<{ ok: boolean }>;
		const strandedFlushId = "flush:test:stranded-0001";

		await persist({
			flushId: strandedFlushId,
			adsDelta: 0,
			watchDeltas: { somestreamer: 1 },
		});
		for (let index = 0; index < 257; index++) {
			const flushId = `flush:test:later-${String(index).padStart(4, "0")}`;
			await persist({
				flushId,
				adsDelta: 0,
				watchDeltas: { somestreamer: 1 },
			});
			await confirm({ flushId });
		}

		expect(
			Object.hasOwn(
				storageData.ttvUnconfirmedCounterFlushes as Record<string, number>,
				strandedFlushId,
			),
		).toBe(true);
		expect(
			Object.keys(
				storageData.ttvProcessedCounterFlushes as Record<string, number>,
			),
		).toHaveLength(256);
		expect(
			Object.hasOwn(
				storageData.ttvProcessedCounterFlushes as Record<string, number>,
				"flush:test:later-0256",
			),
		).toBe(true);
		expect(getStoredStats().channels.somestreamer.watchSeconds).toBe(258);

		await persist({
			flushId: strandedFlushId,
			adsDelta: 0,
			watchDeltas: { somestreamer: 1 },
		});
		expect(getStoredStats().channels.somestreamer.watchSeconds).toBe(258);
	});

	it("serializes confirmation with a concurrent counter commit", async () => {
		const persist = g.persistCounterDelta as (
			detail: unknown,
		) => Promise<{ ok: boolean }>;
		const confirm = g.confirmCounterFlush as (
			detail: unknown,
		) => Promise<{ ok: boolean }>;
		const enqueue = g.enqueuePersist as (
			task: () => Promise<unknown>,
		) => Promise<unknown>;
		const confirmedFlushId = "flush:test:confirm-race-0001";
		const concurrentFlushId = "flush:test:confirm-race-0002";

		await persist({
			flushId: confirmedFlushId,
			adsDelta: 0,
			watchDeltas: { somestreamer: 1 },
		});
		await Promise.all([
			enqueue(() =>
				persist({
					flushId: concurrentFlushId,
					adsDelta: 0,
					watchDeltas: { somestreamer: 1 },
				}),
			),
			enqueue(() => confirm({ flushId: confirmedFlushId })),
		]);

		const unconfirmed = storageData.ttvUnconfirmedCounterFlushes as Record<
			string,
			number
		>;
		const processed = storageData.ttvProcessedCounterFlushes as Record<
			string,
			number
		>;
		expect(Object.hasOwn(unconfirmed, confirmedFlushId)).toBe(false);
		expect(Object.hasOwn(unconfirmed, concurrentFlushId)).toBe(true);
		expect(Object.hasOwn(processed, confirmedFlushId)).toBe(true);
		expect(getStoredStats().channels.somestreamer.watchSeconds).toBe(2);
	});
});

describe("measured ad duration persistence", () => {
	beforeEach(() => {
		storageData = {};
	});
	const persist = () =>
		g.persistCounterDelta as (
			detail: unknown,
			sourceTabId?: number,
		) => Promise<{ ok: boolean }>;
	function stats() {
		return storageData.ttvStats as Record<string, unknown> & {
			channels: Record<string, Record<string, number>>;
		};
	}

	it("accumulates fractional declared durations with per-channel attribution", async () => {
		await persist()(
			{
				flushId: "flush:test:duration-0001",
				adsDelta: 1,
				channelDeltas: { somestreamer: 1 },
				adMeasurements: [
					{
						id: "stitched-ad-first",
						durationMilliseconds: 75050,
						mediaKey: "live:somestreamer",
						channel: "somestreamer",
					},
				],
			},
			7,
		);
		await persist()(
			{
				flushId: "flush:test:duration-0002",
				adsDelta: 1,
				channelDeltas: { somestreamer: 1 },
				adMeasurements: [
					{
						id: "stitched-ad-second",
						durationMilliseconds: 44950,
						mediaKey: "live:somestreamer",
						channel: "somestreamer",
					},
				],
			},
			7,
		);
		expect(stats().adMillisecondsSaved).toBe(120000);
		expect(stats().channels.somestreamer.adMilliseconds).toBe(120000);
	});

	it("deduplicates the same creative across flushes and worker replacements", async () => {
		const measurement = {
			id: "stitched-ad-replacement",
			durationMilliseconds: 30000,
			startDateMilliseconds: Date.parse("2026-08-12T10:00:00.000Z"),
			mediaKey: "live:somestreamer",
			channel: "somestreamer",
		};
		await persist()(
			{
				flushId: "flush:test:replacement-0001",
				adMeasurements: [measurement],
			},
			7,
		);
		await persist()(
			{
				flushId: "flush:test:replacement-0002",
				adMeasurements: [measurement],
			},
			7,
		);

		expect(stats().adMillisecondsSaved).toBe(30000);
		expect(stats().channels.somestreamer.adMilliseconds).toBe(30000);
	});

	it("counts a reused playlist ID when START-DATE identifies a new occurrence", async () => {
		const measurement = {
			id: "stitched-ad-reused",
			durationMilliseconds: 15000,
			mediaKey: "live:somestreamer",
			channel: "somestreamer",
		};
		await persist()(
			{
				flushId: "flush:test:reused-0001",
				adMeasurements: [
					{
						...measurement,
						startDateMilliseconds: Date.parse("2026-08-12T10:00:00.000Z"),
					},
				],
			},
			7,
		);
		await persist()(
			{
				flushId: "flush:test:reused-0002",
				adMeasurements: [
					{
						...measurement,
						startDateMilliseconds: Date.parse("2026-08-12T10:01:00.000Z"),
					},
				],
			},
			7,
		);

		expect(stats().adMillisecondsSaved).toBe(30000);
	});

	it("keeps semantic deduplication scoped to the tab and media", async () => {
		const first = {
			id: "stitched-ad-shared",
			durationMilliseconds: 15000,
			mediaKey: "live:somestreamer",
			channel: "somestreamer",
		};
		await persist()(
			{ flushId: "flush:test:scope-0001", adMeasurements: [first] },
			7,
		);
		await persist()(
			{ flushId: "flush:test:scope-0002", adMeasurements: [first] },
			8,
		);
		await persist()(
			{
				flushId: "flush:test:scope-0003",
				adMeasurements: [
					{
						...first,
						mediaKey: "live:otherstreamer",
						channel: "otherstreamer",
					},
				],
			},
			7,
		);

		expect(stats().adMillisecondsSaved).toBe(45000);
		expect(stats().channels.somestreamer.adMilliseconds).toBe(30000);
		expect(stats().channels.otherstreamer.adMilliseconds).toBe(15000);
	});

	it("accepts a creative again after its bounded deduplication window expires", async () => {
		storageData = {
			ttvRecentAdMeasurements: {
				"tab:7\nlive:somestreamer\nstitched-ad-expired\n0":
					Date.now() - 4 * 24 * 60 * 60 * 1000,
			},
		};
		await persist()(
			{
				flushId: "flush:test:expired-0001",
				adMeasurements: [
					{
						id: "stitched-ad-expired",
						durationMilliseconds: 30000,
						mediaKey: "live:somestreamer",
						channel: "somestreamer",
					},
				],
			},
			7,
		);

		expect(stats().adMillisecondsSaved).toBe(30000);
	});

	it("hard-caps the persisted semantic deduplication map", () => {
		const now = Date.now();
		const recent: Record<string, number> = {};
		for (let index = 0; index < 1005; index++) {
			recent[`tab:7\nlive:somestreamer\nstitched-ad-${index}\n0`] = now - index;
		}
		const normalize = g.normalizeRecentAdMeasurements as (
			value: unknown,
		) => Record<string, number>;
		const normalized = normalize(recent);

		expect(Object.keys(normalized)).toHaveLength(1000);
		expect(normalized).not.toHaveProperty(
			"tab:7\nlive:somestreamer\nstitched-ad-1004\n0",
		);
	});

	it("migrates legacy seconds and caps a legacy flush at the existing ceiling", async () => {
		storageData = {
			ttvStats: {
				adSecondsSaved: 12,
				channels: { somestreamer: { adSeconds: 3 } },
			},
		};
		await persist()({
			flushId: "flush:test:legacy-0001",
			adsDelta: 1,
			channelDeltas: { somestreamer: 1 },
			adSecondsDelta: 999999,
		});
		expect(stats().adMillisecondsSaved).toBe(14412000);
		expect(stats().channels.somestreamer.adMilliseconds).toBe(3000);
	});

	it("uses only measured duration for time-based achievements", () => {
		const measured = g.computeMeasuredTimeSaved as (
			statsState: unknown,
		) => number;
		expect(measured({ adMillisecondsSaved: 600000 })).toBe(600000);
		expect(measured({ adMillisecondsSaved: 0 })).toBe(0);
		expect(measured({})).toBe(0);
	});

	it("removes time achievements unlocked by the retired estimate", () => {
		const normalize = g.normalizeStatsState as (statsState: unknown) => {
			achievements: string[];
		};
		expect(
			normalize({
				adMillisecondsSaved: 0,
				achievements: ["first_block", "time_1h", "time_10h"],
			}).achievements,
		).toEqual(["first_block"]);
		expect(
			normalize({
				adMillisecondsSaved: 3600000,
				achievements: ["time_1h", "time_10h"],
			}).achievements,
		).toEqual(["time_1h"]);
	});

	it("keeps legacy seconds-only flushes compatible without touching the ads total", async () => {
		storageData = { ttvAdsBlocked: 7 };
		await persist()({
			flushId: "flush:test:legacy-0002",
			adsDelta: 0,
			adSecondsDelta: 30,
			channelAdSecondsDeltas: { somestreamer: 30 },
		});
		expect(storageData.ttvAdsBlocked).toBe(7);
		expect(stats().adMillisecondsSaved).toBe(30000);
		expect(stats().channels.somestreamer.adMilliseconds).toBe(30000);
		expect(stats().channels.somestreamer.ads).toBe(0);
	});

	it("does not add a legacy aggregate when a measurement record is present", async () => {
		await persist()({
			flushId: "flush:test:mixed-0001",
			adSecondsDelta: 999,
			adMeasurements: [
				{
					id: "stitched-ad-mixed",
					durationMilliseconds: 15050,
					mediaKey: "live:somestreamer",
					channel: "somestreamer",
				},
			],
		});

		expect(stats().adMillisecondsSaved).toBe(15050);
	});
});
