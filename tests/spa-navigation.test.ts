import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const g = globalThis as Record<string, unknown>;

function loadModule(modulePath: string) {
	const js = readFileSync(resolve(__dirname, modulePath), "utf8")
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const (_\w+|_C|_S)\s*=/gm, "globalThis.$1 =")
		.replace(/^let\s+(_\w+)/gm, "globalThis.$1")
		.replace(/^(async\s+)?function (_\w+)/gm, "globalThis.$2 = $1function");
	new Function("globalThis", js)(globalThis);
}

beforeAll(() => {
	loadModule("../dist/src/modules/logger.js");
	loadModule("../dist/src/modules/init.js");
});

beforeEach(() => {
	window.dispatchEvent(new Event("pagehide"));
});

function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

describe("_hookSpaNavigation", () => {
	it("reinstalls history hooks after BFCache restore", () => {
		const calls: unknown[] = [];
		g._syncPagePlaybackContext = (options: unknown) => {
			calls.push(options);
			return null;
		};

		T<() => void>("_hookSpaNavigation")();

		history.pushState(null, "", "/firstchannel");
		expect(calls).toEqual([{ broadcast: true }]);

		window.dispatchEvent(new Event("pagehide"));
		history.pushState(null, "", "/unhookedchannel");
		expect(calls).toHaveLength(1);

		window.dispatchEvent(new Event("pageshow"));
		expect(calls).toHaveLength(2);

		history.replaceState(null, "", "/restoredchannel");
		expect(calls).toEqual([
			{ broadcast: true },
			{ broadcast: true },
			{ broadcast: true },
		]);
	});
});

describe("_collectPageLogEntries", () => {
	let savedCapture: unknown;
	let savedLog: unknown;

	beforeEach(() => {
		savedCapture = g._captureIndependentVideoAdDiagnostics;
		savedLog = g._log;
		g.__TTVAB_LOGS__ = [{ t: 1, l: "info", m: "existing" }];
	});

	afterEach(() => {
		g._captureIndependentVideoAdDiagnostics = savedCapture;
		g._log = savedLog;
		delete g.__TTVAB_LOGS__;
	});

	it("takes a live independent-video snapshot before exporting the buffer", () => {
		g._captureIndependentVideoAdDiagnostics = () => {
			(g.__TTVAB_LOGS__ as unknown[]).push({
				t: 2,
				l: "info",
				m: "Independent video advertisement log snapshot: <video>",
			});
		};

		const result = T<
			() => { entries: Array<{ m: string }>; truncatedEntries: number }
		>("_collectPageLogEntries")();

		expect(result.entries.map((entry) => entry.m)).toEqual([
			"existing",
			"Independent video advertisement log snapshot: <video>",
		]);
		expect(result.truncatedEntries).toBe(0);
	});

	it("keeps collection clone-safe when diagnostics or entries are malformed", () => {
		g._captureIndependentVideoAdDiagnostics = () => {
			throw new Error("diagnostic failure");
		};
		g._log = () => {};
		const circular: Record<string, unknown> = { value: 1n };
		circular.self = circular;
		const timestampCoercion = vi.fn(() => {
			throw new Error("timestamp coercion attempted");
		});
		g.__TTVAB_LOGS__ = [
			null,
			{
				t: { valueOf: timestampCoercion },
				l: "INVALID",
				m: circular,
			},
			{
				t: 100,
				l: "error",
				m: "https://usher.ttvnw.net/live.m3u8?token=secret",
				w: true,
				g: 7.8,
				k: "live:channel",
			},
		];

		const result = T<
			() => {
				entries: Array<Record<string, unknown>>;
				truncatedEntries: number;
			}
		>("_collectPageLogEntries")();

		expect(result.entries).toHaveLength(2);
		expect(result.entries[0]).toEqual(
			expect.objectContaining({
				t: 0,
				l: "info",
				m: "[Invalid log message]",
			}),
		);
		expect(result.entries[1]).toEqual(
			expect.objectContaining({
				t: 100,
				l: "error",
				w: true,
				g: 7,
				k: "live:channel",
			}),
		);
		expect(String(result.entries[1]?.m)).not.toContain("token=secret");
		expect(result.truncatedEntries).toBe(1);
		expect(timestampCoercion).not.toHaveBeenCalled();
	});

	it("retains the newest entries within the page byte budget", () => {
		g._captureIndependentVideoAdDiagnostics = undefined;
		g.__TTVAB_LOGS__ = Array.from({ length: 700 }, (_, index) => ({
			t: index,
			l: "info",
			m: `${index}:${"界".repeat(3990)}`,
		}));

		const result = T<
			() => {
				entries: Array<Record<string, unknown>>;
				truncatedEntries: number;
			}
		>("_collectPageLogEntries")();

		expect(result.entries.length).toBeLessThan(700);
		expect(result.truncatedEntries + result.entries.length).toBe(700);
		expect(String(result.entries.at(-1)?.m)).toMatch(/^699:/);
		expect(
			new TextEncoder().encode(JSON.stringify(result.entries)).byteLength,
		).toBeLessThanOrEqual(2 * 1024 * 1024);
	});

	it("rejects a poisoned non-finite buffer length without looping", () => {
		g._captureIndependentVideoAdDiagnostics = undefined;
		g.__TTVAB_LOGS__ = new Proxy([], {
			get(target, property, receiver) {
				if (property === "length") return Number.POSITIVE_INFINITY;
				return Reflect.get(target, property, receiver);
			},
		});

		const result = T<() => { entries: unknown[]; truncatedEntries: number }>(
			"_collectPageLogEntries",
		)();

		expect(result).toEqual({ entries: [], truncatedEntries: 0 });
	});

	it("bounds page-controlled strings before sanitizing them", () => {
		g._captureIndependentVideoAdDiagnostics = undefined;
		g.__TTVAB_LOGS__ = [
			{ t: 1, l: "info", m: `${"x".repeat(10000)}\r\nsecret-tail` },
		];

		const result = T<() => { entries: Array<Record<string, unknown>> }>(
			"_collectPageLogEntries",
		)();

		expect(String(result.entries[0]?.m)).toHaveLength(4000);
		expect(String(result.entries[0]?.m)).not.toContain("secret-tail");
	});
});

describe("_collectPageLogContext", () => {
	let savedState: unknown;
	let savedShared: unknown;
	let savedResolver: unknown;
	let savedPrimaryResolver: unknown;
	let savedFallbackResolver: unknown;

	beforeEach(() => {
		savedState = g.__TTVAB_STATE__;
		savedShared = g._S;
		savedResolver = g._getPlaybackMediaElementForContext;
		savedPrimaryResolver = g._getPrimaryMediaElement;
		savedFallbackResolver = g._getFallbackPrimaryVideoElement;
		history.replaceState(null, "", "/some_channel?token=secret#chat");
		g.__TTVAB_STATE__ = {
			PageMediaKey: "live:some_channel",
			PageChannel: "some_channel",
			CurrentAdChannel: "some_channel",
			CurrentAdMediaKey: "live:some_channel",
			AdPodProgressByMediaKey: {
				"live:some_channel": { cycleStartedAt: 5000 },
			},
			PinnedBackupPlayerType: "autoplay",
			PinnedBackupPlayerMediaKey: "live:some_channel",
			IsAdStrippingEnabled: true,
			DisableAdSpoofing: false,
			DisableAutoplayBackup: false,
		};
		g._S = {
			workers: Array.from({ length: 13 }, (_, index) => ({
				__TTVABGeneration: index + 1,
				__TTVABPageMediaKey: `live:channel_${index}`,
				__TTVABCrashed: index === 3,
				__TTVABIntentionallyTerminated: index === 4,
				__TTVABLastPongAt: 1000 + index,
			})),
		};
		g._getPlaybackMediaElementForContext = () => ({
			localName: "video",
			currentTime: 42,
			duration: Number.POSITIVE_INFINITY,
			paused: false,
			ended: false,
			readyState: 4,
			networkState: 1,
			playbackRate: 1,
			muted: true,
			volume: 0.5,
			videoWidth: 1920,
			videoHeight: 1080,
			buffered: {
				length: 5,
				start: (index: number) => index,
				end: (index: number) => index + 0.5,
			},
		});
	});

	afterEach(() => {
		g.__TTVAB_STATE__ = savedState;
		g._S = savedShared;
		g._getPlaybackMediaElementForContext = savedResolver;
		g._getPrimaryMediaElement = savedPrimaryResolver;
		g._getFallbackPrimaryVideoElement = savedFallbackResolver;
		history.replaceState(null, "", "/");
	});

	it("returns a bounded current ownership and playback snapshot", () => {
		const context = T<() => Record<string, unknown>>(
			"_collectPageLogContext",
		)();

		expect(context).toEqual(
			expect.objectContaining({
				pageUrl: expect.stringMatching(/\/some_channel$/),
				pageMediaKey: "live:some_channel",
				pageChannel: "some_channel",
				enabled: true,
				adSpoofingEnabled: true,
				autoplayBackupEnabled: true,
				currentAdMediaKey: "live:some_channel",
				activeCycleStartedAt: 5000,
				pinnedBackupPlayerType: "autoplay",
				pinnedBackupMediaKey: "live:some_channel",
			}),
		);
		expect(String(context.pageUrl)).not.toContain("token=secret");
		expect(context.workers).toHaveLength(12);
		expect((context.workers as Array<Record<string, unknown>>)[0]).toEqual(
			expect.objectContaining({ generation: 2, mediaKey: "live:channel_1" }),
		);
		expect(context.media).toEqual(
			expect.objectContaining({
				tag: "video",
				currentTime: 42,
				duration: null,
				width: 1920,
				height: 1080,
				buffered: [
					{ start: 0, end: 0.5 },
					{ start: 1, end: 1.5 },
					{ start: 2, end: 2.5 },
					{ start: 3, end: 3.5 },
				],
			}),
		);
	});

	it("falls back to the page media when exact lookup is temporarily unavailable", () => {
		g._getPlaybackMediaElementForContext = () => {
			throw new Error("player lookup unavailable");
		};
		g._getPrimaryMediaElement = () => ({
			localName: "video",
			currentTime: 99,
			duration: 120,
			paused: true,
			ended: false,
			readyState: 2,
			networkState: 2,
			playbackRate: 1,
			muted: false,
			volume: 1,
			videoWidth: 1280,
			videoHeight: 720,
			buffered: { length: 0 },
		});

		const context = T<() => Record<string, unknown>>(
			"_collectPageLogContext",
		)();

		expect(context.media).toEqual(
			expect.objectContaining({ currentTime: 99, width: 1280, height: 720 }),
		);
	});

	it("uses the safe page fallback when both player resolvers return no media", () => {
		g._getPlaybackMediaElementForContext = () => null;
		g._getPrimaryMediaElement = () => null;
		g._getFallbackPrimaryVideoElement = () => ({
			localName: "video",
			currentTime: 77,
			duration: 100,
			paused: false,
			ended: false,
			readyState: 3,
			networkState: 1,
			playbackRate: 1,
			muted: false,
			volume: 1,
			videoWidth: 854,
			videoHeight: 480,
			buffered: { length: 0 },
		});

		const context = T<() => Record<string, unknown>>(
			"_collectPageLogContext",
		)();

		expect(context.media).toEqual(
			expect.objectContaining({ currentTime: 77, width: 854, height: 480 }),
		);
	});

	it("keeps media state when one buffered range changes during capture", () => {
		g._getPlaybackMediaElementForContext = () => ({
			localName: "video",
			currentTime: 88,
			duration: 120,
			paused: false,
			ended: false,
			readyState: 4,
			networkState: 1,
			playbackRate: 1,
			muted: false,
			volume: 1,
			videoWidth: 1280,
			videoHeight: 720,
			buffered: {
				length: 2,
				start: (index: number) => {
					if (index === 1)
						throw new DOMException("range changed", "IndexSizeError");
					return 10;
				},
				end: () => 20,
			},
		});

		const context = T<() => Record<string, unknown>>(
			"_collectPageLogContext",
		)();

		expect(context.media).toEqual(
			expect.objectContaining({
				currentTime: 88,
				buffered: [{ start: 10, end: 20 }],
			}),
		);
	});

	it("bounds the page URL path before crossing the bridge", () => {
		history.replaceState(null, "", `/${"x".repeat(5000)}?token=secret#chat`);

		const pageUrl = T<() => string | null>("_getSafePageLogUrl")();

		expect(pageUrl).toHaveLength(2048);
		expect(pageUrl).not.toContain("token=secret");
	});

	it("does not mislabel the page player as an off-route ad media element", () => {
		(g.__TTVAB_STATE__ as Record<string, unknown>).CurrentAdMediaKey =
			"live:off_route";
		g._getPlaybackMediaElementForContext = () => null;
		g._getPrimaryMediaElement = () => ({ localName: "video" });

		const context = T<() => Record<string, unknown>>(
			"_collectPageLogContext",
		)();

		expect(context.media).toBeNull();
	});
});

describe("deferred init after landing on a clip page", () => {
	let savedInit: unknown;
	let savedLog: unknown;

	beforeEach(() => {
		savedInit = g._init;
		savedLog = g._log;
		g._log = () => {};
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		g._init = savedInit;
		g._log = savedLog;
		history.replaceState(null, "", "/");
	});

	it("initializes once the SPA leaves the clip route, exactly once", () => {
		const initCalls: number[] = [];
		g._init = () => initCalls.push(1);
		history.replaceState(null, "", "/somechannel/clip/FunnyMoment");
		expect(T<() => boolean>("_isClipEditorContext")()).toBe(true);

		T<() => void>("_deferInitUntilClipContextLeft")();
		vi.advanceTimersByTime(3000);
		expect(initCalls).toHaveLength(0);

		history.replaceState(null, "", "/somechannel");
		vi.advanceTimersByTime(300);
		expect(initCalls).toHaveLength(1);

		vi.advanceTimersByTime(5000);
		expect(initCalls).toHaveLength(1);
	});
});
