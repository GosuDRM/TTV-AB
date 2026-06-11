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
	loadModule("../dist/src/modules/constants.js");
	loadModule("../dist/src/modules/player.js");
});

beforeEach(() => {
	g._log = () => {};
	g.__TTVAB_STATE__ = {
		IsBufferFixEnabled: true,
		PinnedBackupPlayerType: "autoplay",
		BackupSearchForceRefreshAt: 0,
		LastPinnedBackupStallDetectedAt: 0,
		PlayerBufferingDangerZone: 1,
	};
	g._broadcastWorkers = () => {};
	resetPinnedState();
});

afterEach(() => {
	vi.restoreAllMocks();
});

function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

function resetPinnedState() {
	const state = g._PinnedBackupStallState as Record<string, unknown>;
	state.firstObservedAt = 0;
	state.lastCurrentTime = 0;
	state.lastBufferedEnd = 0;
	state.lastForceRefreshAt = 0;
	state.lastPinnedType = null;
	state.forceRefreshCount = 0;
	state.exhaustedLogged = false;
}

function makePlayer(currentTime: () => number, bufferedEnd: () => number) {
	const video = document.createElement("video");
	Object.defineProperty(video, "currentTime", {
		get: currentTime,
		configurable: true,
	});
	Object.defineProperty(video, "buffered", {
		get: () => ({
			length: 1,
			start: () => 0,
			end: () => bufferedEnd(),
		}),
		configurable: true,
	});
	Object.defineProperty(video, "readyState", {
		get: () => 4,
		configurable: true,
	});
	Object.defineProperty(video, "ended", {
		get: () => false,
		configurable: true,
	});
	return {
		getHTMLVideoElement: () => video,
	};
}

describe("_checkPinnedBackupStall", () => {
	it("does not force backup re-search while playback advances with safe buffer", () => {
		const check = T<
			(player: { getHTMLVideoElement: () => HTMLVideoElement }) => void
		>("_checkPinnedBackupStall");
		const messages: unknown[] = [];
		let currentTime = 10;
		let bufferedEnd = 20;
		g._broadcastWorkers = (message: unknown) => {
			messages.push(message);
		};
		const player = makePlayer(
			() => currentTime,
			() => bufferedEnd,
		);
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check(player);
		currentTime = 13;
		bufferedEnd = 20;
		nowSpy.mockReturnValue(104000);
		check(player);

		expect(messages).toEqual([]);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt,
		).toBe(0);
	});

	it("forces backup re-search when playback and buffer stop advancing", () => {
		const check = T<
			(player: { getHTMLVideoElement: () => HTMLVideoElement }) => void
		>("_checkPinnedBackupStall");
		const messages: unknown[] = [];
		let currentTime = 10;
		let bufferedEnd = 10.2;
		g._broadcastWorkers = (message: unknown) => {
			messages.push(message);
		};
		const player = makePlayer(
			() => currentTime,
			() => bufferedEnd,
		);
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check(player);
		currentTime = 10;
		bufferedEnd = 10.2;
		nowSpy.mockReturnValue(104000);
		check(player);

		expect(messages).toHaveLength(1);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt,
		).toBe(104000);
	});

	it("forces backup re-search when playback advances at a drained buffer edge", () => {
		const check = T<
			(player: { getHTMLVideoElement: () => HTMLVideoElement }) => void
		>("_checkPinnedBackupStall");
		const messages: unknown[] = [];
		let currentTime = 10;
		let bufferedEnd = 10.04;
		g._broadcastWorkers = (message: unknown) => {
			messages.push(message);
		};
		const player = makePlayer(
			() => currentTime,
			() => bufferedEnd,
		);
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check(player);
		currentTime = 13;
		bufferedEnd = 13.04;
		nowSpy.mockReturnValue(104000);
		check(player);

		expect(messages).toHaveLength(1);
		expect(messages[0]).toEqual({
			key: "UpdateBackupSearchForceRefresh",
			value: 104000,
		});
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt,
		).toBe(104000);
	});

	it("restores the re-search budget after playback recovers (per-episode cap, not per-session)", () => {
		const check = T<
			(player: { getHTMLVideoElement: () => HTMLVideoElement }) => void
		>("_checkPinnedBackupStall");
		const state = g._PinnedBackupStallState as Record<string, unknown>;
		state.lastPinnedType = "autoplay";
		state.forceRefreshCount = 3;
		state.exhaustedLogged = true;
		state.lastForceRefreshAt = 90000;

		let currentTime = 10;
		let bufferedEnd = 20;
		const player = makePlayer(
			() => currentTime,
			() => bufferedEnd,
		);
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check(player);
		expect(state.forceRefreshCount).toBe(3);

		currentTime = 13;
		bufferedEnd = 20;
		nowSpy.mockReturnValue(104000);
		check(player);

		expect(state.forceRefreshCount).toBe(0);
		expect(state.exhaustedLogged).toBe(false);
		expect(state.lastForceRefreshAt).toBe(0);
	});
});

describe("_suppressCompetingMediaDuringAd (idempotent logging)", () => {
	function makeCompetingVideo() {
		const video = document.createElement("video");
		Object.defineProperty(video, "paused", {
			get: () => false,
			configurable: true,
		});
		Object.defineProperty(video, "ended", {
			get: () => false,
			configurable: true,
		});
		video.muted = false;
		video.volume = 1;
		document.body.appendChild(video);
		return video;
	}

	afterEach(() => {
		document.body.innerHTML = "";
		const state = g._AdAudioSuppressionState as {
			suppressedMedia: Map<unknown, unknown>;
			activeMediaKey: unknown;
			lastSuppressedCount: number;
		};
		state.suppressedMedia.clear();
		state.activeMediaKey = null;
		state.lastSuppressedCount = 0;
	});

	it("counts and logs each competing element only once across repeated calls", () => {
		const suppress = T<(channel?: string, mediaKey?: string) => number>(
			"_suppressCompetingMediaDuringAd",
		);
		g._getPrimaryMediaElement = () => null;
		g._resolvePlayerMediaKey = () => "live:test";
		const logs: string[] = [];
		g._log = (msg: string) => {
			logs.push(msg);
		};
		makeCompetingVideo();

		const first = suppress("test", "live:test");
		const second = suppress("test", "live:test");

		expect(first).toBe(1);
		expect(second).toBe(0);
		expect(
			logs.filter((m) => m.includes("competing media element")),
		).toHaveLength(1);
		const state = g._AdAudioSuppressionState as {
			suppressedMedia: Map<unknown, unknown>;
		};
		expect(state.suppressedMedia.size).toBe(1);
	});
});

describe("_doPlayerTask ad-recovery reload backoff", () => {
	function setupReloadContext(lastAdRecoveryReloadAgoMs: number) {
		const setSrcCalls: unknown[] = [];
		const pauseCalls: unknown[] = [];
		const player = { isPaused: () => false, getHTMLVideoElement: () => null };
		const state = {
			props: { content: { type: "live" } },
			setSrc: (arg: unknown) => {
				setSrcCalls.push(arg);
			},
		};
		const now = Date.now();
		g._getPlayerAndState = () => ({ player, state });
		g._shouldSuppressAutomaticPlaybackResume = () => false;
		g._capturePlayerPreferenceSnapshot = () => null;
		g._suppressPauseIntent = () => true;
		g._clearCachedPlayerRef = () => {};
		g._schedulePlaybackRecoveryTimeout = () => null;
		g._scheduleResumeRetries = () => {};
		g._pausePlaybackTarget = (target: unknown) => {
			pauseCalls.push(target);
			return true;
		};
		g._playPlaybackTarget = () => true;
		g.__TTVAB_STATE__ = {
			LastPlayerReloadAt: now - 10000,
			PlayerReloadDebounceMs: 1500,
			LastAdRecoveryReloadAt: now - lastAdRecoveryReloadAgoMs,
			AdRecoveryReloadCooldownMs: 10000,
			_AdRecoveryConsecutiveFailures: 2,
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
		};
		return { setSrcCalls, pauseCalls };
	}

	it("downgrades to pause/resume without reloading inside the backoff window", () => {
		const doPlayerTask =
			T<
				(
					isPausePlay: boolean,
					isReload: boolean,
					options?: Record<string, unknown>,
				) => unknown
			>("_doPlayerTask");
		const { setSrcCalls, pauseCalls } = setupReloadContext(2000);

		const result = doPlayerTask(false, true, { reason: "ad-recovery" });

		expect(setSrcCalls).toHaveLength(0);
		expect(pauseCalls).toHaveLength(1);
		expect(result).toBe(true);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		expect(state._AdRecoveryConsecutiveFailures).toBe(2);
	});

	it("reloads once the backoff window has elapsed", () => {
		const doPlayerTask =
			T<
				(
					isPausePlay: boolean,
					isReload: boolean,
					options?: Record<string, unknown>,
				) => unknown
			>("_doPlayerTask");
		const { setSrcCalls, pauseCalls } = setupReloadContext(50000);

		const result = doPlayerTask(false, true, { reason: "ad-recovery" });

		expect(setSrcCalls).toHaveLength(1);
		expect(pauseCalls).toHaveLength(0);
		expect(result).toBe(true);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		expect(state._AdRecoveryConsecutiveFailures).toBe(3);
	});
});

describe("_trySeekPastFrozenBufferGap", () => {
	const fn = () =>
		T<
			(
				video: HTMLVideoElement | null,
				currentTime: number,
				readyState: number,
			) => boolean
		>("_trySeekPastFrozenBufferGap");

	function bufferState() {
		return g._PlayerBufferState as Record<string, number>;
	}

	function resetGapState() {
		const s = bufferState();
		s.gapJumpLastPosition = -1;
		s.gapJumpStuckTicks = 0;
		s.lastFixTime = 0;
		s.numSame = 5;
	}

	function makeGapVideo(ranges: Array<[number, number]>) {
		const seeks: number[] = [];
		const video = document.createElement("video");
		Object.defineProperty(video, "buffered", {
			get: () => ({
				length: ranges.length,
				start: (i: number) => ranges[i][0],
				end: (i: number) => ranges[i][1],
			}),
			configurable: true,
		});
		let ct = 0;
		Object.defineProperty(video, "currentTime", {
			get: () => ct,
			set: (v: number) => {
				ct = v;
				seeks.push(v);
			},
			configurable: true,
		});
		return { video: video as HTMLVideoElement, seeks };
	}

	it("does not act until the playhead has been stuck for three ticks", () => {
		resetGapState();
		const { video, seeks } = makeGapVideo([
			[0, 34],
			[36, 50],
		]);
		expect(fn()(video, 34, 1)).toBe(false);
		expect(fn()(video, 34, 1)).toBe(false);
		expect(fn()(video, 34, 1)).toBe(false);
		expect(seeks).toEqual([]);
	});

	it("seeks past the buffered gap once frozen with low readyState", () => {
		resetGapState();
		const { video, seeks } = makeGapVideo([
			[0, 34],
			[36, 50],
		]);
		fn()(video, 34, 1);
		fn()(video, 34, 1);
		fn()(video, 34, 1);
		const acted = fn()(video, 34, 1);
		expect(acted).toBe(true);
		expect(seeks).toHaveLength(1);
		expect(seeks[0]).toBeGreaterThan(36);
		expect(seeks[0]).toBeLessThan(36.2);
		expect(bufferState().gapJumpStuckTicks).toBe(0);
		expect(bufferState().numSame).toBe(0);
	});

	it("resets the stuck counter when the playhead advances", () => {
		resetGapState();
		const { video, seeks } = makeGapVideo([
			[0, 34],
			[36, 50],
		]);
		fn()(video, 34, 1);
		fn()(video, 34, 1);
		fn()(video, 35, 1);
		expect(bufferState().gapJumpStuckTicks).toBe(0);
		fn()(video, 35, 1);
		expect(seeks).toEqual([]);
	});

	it("does not seek when readyState shows data is flowing", () => {
		resetGapState();
		const { video, seeks } = makeGapVideo([
			[0, 34],
			[36, 50],
		]);
		for (let i = 0; i < 5; i++) {
			expect(fn()(video, 34, 4)).toBe(false);
		}
		expect(seeks).toEqual([]);
	});

	it("does not seek with a single contiguous buffer range", () => {
		resetGapState();
		const { video, seeks } = makeGapVideo([[0, 50]]);
		for (let i = 0; i < 5; i++) {
			expect(fn()(video, 34, 1)).toBe(false);
		}
		expect(seeks).toEqual([]);
	});
});

function makeRangesVideo(ranges: Array<[number, number]>, currentTime: number) {
	const seeks: number[] = [];
	const video = document.createElement("video");
	let ct = currentTime;
	Object.defineProperty(video, "buffered", {
		get: () => ({
			length: ranges.length,
			start: (i: number) => ranges[i][0],
			end: (i: number) => ranges[i][1],
		}),
		configurable: true,
	});
	Object.defineProperty(video, "currentTime", {
		get: () => ct,
		set: (v: number) => {
			ct = v;
			seeks.push(v);
		},
		configurable: true,
	});
	Object.defineProperty(video, "readyState", {
		get: () => 2,
		configurable: true,
	});
	Object.defineProperty(video, "ended", {
		get: () => false,
		configurable: true,
	});
	Object.defineProperty(video, "paused", {
		get: () => false,
		configurable: true,
	});
	return { video: video as HTMLVideoElement, seeks };
}

describe("_getContiguousBufferedEnd", () => {
	const fn = () =>
		T<(video: HTMLVideoElement, currentTime: number) => number>(
			"_getContiguousBufferedEnd",
		);

	it("returns the end of the range containing the playhead, not the last range", () => {
		const { video } = makeRangesVideo(
			[
				[1400, 1463.966],
				[1464.4, 1466.01],
			],
			1463.93,
		);
		expect(fn()(video, 1463.93)).toBeCloseTo(1463.966, 3);
	});

	it("returns zero when the playhead sits inside a buffered hole", () => {
		const { video } = makeRangesVideo(
			[
				[1400, 1463.966],
				[1464.4, 1466.01],
			],
			1464.1,
		);
		expect(fn()(video, 1464.1)).toBe(0);
	});

	it("returns the single range end for contiguous buffers", () => {
		const { video } = makeRangesVideo([[0, 50]], 34);
		expect(fn()(video, 34)).toBe(50);
	});
});

describe("_seekPastBufferedGap", () => {
	const fn = () =>
		T<(video: HTMLVideoElement, currentTime: number) => number>(
			"_seekPastBufferedGap",
		);

	it("seeks just past the next buffered range start and returns the distance", () => {
		const { video, seeks } = makeRangesVideo(
			[
				[1400, 1463.966],
				[1464.4, 1466.01],
			],
			1463.93,
		);
		const jumped = fn()(video, 1463.93);
		expect(jumped).toBeCloseTo(0.47, 2);
		expect(seeks).toHaveLength(1);
		expect(seeks[0]).toBeCloseTo(1464.45, 2);
	});

	it("does nothing with a single contiguous range", () => {
		const { video, seeks } = makeRangesVideo([[0, 50]], 34);
		expect(fn()(video, 34)).toBe(0);
		expect(seeks).toEqual([]);
	});

	it("does nothing when no range starts past the playhead", () => {
		const { video, seeks } = makeRangesVideo(
			[
				[0, 20],
				[22, 50],
			],
			49.9,
		);
		expect(fn()(video, 49.9)).toBe(0);
		expect(seeks).toEqual([]);
	});
});

describe("_checkInAdPlayheadFreeze", () => {
	const check = () =>
		T<(player: { getHTMLVideoElement: () => HTMLVideoElement }) => void>(
			"_checkInAdPlayheadFreeze",
		);

	const realDoPlayerTask = g._doPlayerTask;
	let playerTaskCalls: Array<[unknown, unknown]> = [];

	beforeEach(() => {
		playerTaskCalls = [];
		g._doPlayerTask = (a: unknown, b: unknown) => {
			playerTaskCalls.push([a, b]);
			return true;
		};
		(g._resetInAdFreezeState as () => void)();
	});

	afterEach(() => {
		g._doPlayerTask = realDoPlayerTask;
		(g._resetInAdFreezeState as () => void)();
	});

	it("detects a freeze at a buffered gap despite headroom past the gap and seeks across it", () => {
		const { video, seeks } = makeRangesVideo(
			[
				[1400, 1463.966],
				[1464.4, 1466.01],
			],
			1463.93,
		);
		const player = { getHTMLVideoElement: () => video };
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check()(player);
		nowSpy.mockReturnValue(103000);
		check()(player);
		expect(seeks).toEqual([]);

		nowSpy.mockReturnValue(105500);
		check()(player);
		expect(seeks).toHaveLength(1);
		expect(seeks[0]).toBeCloseTo(1464.45, 2);
		expect(playerTaskCalls).toEqual([]);
	});

	it("nudges then reloads when frozen with no gap to seek past", () => {
		const { video, seeks } = makeRangesVideo([[1400, 1463.966]], 1463.93);
		const player = { getHTMLVideoElement: () => video };
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check()(player);
		nowSpy.mockReturnValue(105500);
		check()(player);
		expect(playerTaskCalls).toEqual([[true, false]]);

		nowSpy.mockReturnValue(111000);
		check()(player);
		expect(playerTaskCalls).toEqual([
			[true, false],
			[true, false],
		]);

		nowSpy.mockReturnValue(116500);
		check()(player);
		expect(playerTaskCalls).toEqual([
			[true, false],
			[true, false],
			[false, true],
		]);
		expect(seeks).toEqual([]);
	});

	it("stays idle while the contiguous range still has safe headroom", () => {
		const { video, seeks } = makeRangesVideo(
			[
				[1400, 1463.966],
				[1464.4, 1466.01],
			],
			1450,
		);
		const player = { getHTMLVideoElement: () => video };
		const nowSpy = vi.spyOn(Date, "now");

		for (const t of [100000, 103000, 106000, 109000]) {
			nowSpy.mockReturnValue(t);
			check()(player);
		}
		expect(seeks).toEqual([]);
		expect(playerTaskCalls).toEqual([]);
	});
});

describe("_syncPreferredQualityGroup", () => {
	const sync = () => T<() => boolean>("_syncPreferredQualityGroup");

	beforeEach(() => {
		localStorage.removeItem("video-quality");
	});

	it("syncs the persisted explicit quality choice", () => {
		const messages: unknown[] = [];
		g._broadcastWorkers = (m: unknown) => messages.push(m);
		localStorage.setItem(
			"video-quality",
			JSON.stringify({ default: "720p60" }),
		);
		expect(sync()()).toBe(true);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).PreferredQualityGroup,
		).toBe("720p60");
		expect(messages).toEqual([
			{ key: "UpdatePreferredQualityGroup", value: "720p60" },
		]);
	});

	it("does not invent a preference when nothing is persisted", () => {
		(g.__TTVAB_STATE__ as Record<string, unknown>).PreferredQualityGroup = null;
		expect(sync()()).toBe(false);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).PreferredQualityGroup,
		).toBe(null);
	});

	it("propagates a return to auto so a stale explicit choice clears", () => {
		(g.__TTVAB_STATE__ as Record<string, unknown>).PreferredQualityGroup =
			"360p30";
		localStorage.setItem("video-quality", JSON.stringify({ default: "auto" }));
		expect(sync()()).toBe(true);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).PreferredQualityGroup,
		).toBe("auto");
	});

	it("does not re-broadcast an unchanged group", () => {
		const messages: unknown[] = [];
		g._broadcastWorkers = (m: unknown) => messages.push(m);
		localStorage.setItem(
			"video-quality",
			JSON.stringify({ default: "720p60" }),
		);
		expect(sync()()).toBe(true);
		expect(sync()()).toBe(false);
		expect(messages).toHaveLength(1);
	});
});
