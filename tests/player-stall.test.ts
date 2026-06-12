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
	loadModule("../dist/src/modules/state.js");
	loadModule("../dist/src/modules/parser.js");
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
		const primary = makeCompetingVideo();
		g._getPrimaryMediaElement = () => primary;
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
		expect(state.suppressedMedia.has(primary)).toBe(false);
		expect(primary.muted).toBe(false);
		g._getPrimaryMediaElement = () => null;
	});

	it("suppresses nothing when no primary player can be identified", () => {
		const suppress = T<(channel?: string, mediaKey?: string) => number>(
			"_suppressCompetingMediaDuringAd",
		);
		g._getPrimaryMediaElement = () => null;
		g._resolvePlayerMediaKey = () => "live:test";
		g._log = () => {};
		const playingVideo = makeCompetingVideo();

		expect(suppress("test", "live:test")).toBe(0);
		expect(playingVideo.muted).toBe(false);
		const state = g._AdAudioSuppressionState as {
			suppressedMedia: Map<unknown, unknown>;
		};
		expect(state.suppressedMedia.size).toBe(0);
	});
});

describe("_doPlayerTask ad-recovery reload backoff", () => {
	const stubbedGlobals = [
		"_getPlayerAndState",
		"_shouldSuppressAutomaticPlaybackResume",
		"_capturePlayerPreferenceSnapshot",
		"_suppressPauseIntent",
		"_clearCachedPlayerRef",
		"_schedulePlaybackRecoveryTimeout",
		"_scheduleResumeRetries",
		"_pausePlaybackTarget",
		"_playPlaybackTarget",
	];
	let savedGlobals: Record<string, unknown> = {};

	beforeEach(() => {
		savedGlobals = {};
		for (const name of stubbedGlobals) {
			savedGlobals[name] = g[name];
		}
	});

	afterEach(() => {
		for (const name of stubbedGlobals) {
			g[name] = savedGlobals[name];
		}
	});

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

	let realDoPlayerTask: unknown;
	let playerTaskCalls: Array<[unknown, unknown]> = [];

	beforeEach(() => {
		realDoPlayerTask = g._doPlayerTask;
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

describe("_doPlayerTask (vod position restore after reload)", () => {
	const task = () =>
		T<
			(
				isPausePlay: boolean,
				isReload: boolean,
				options?: Record<string, unknown>,
			) => unknown
		>("_doPlayerTask");

	const stubbed = [
		"_getPlayerAndState",
		"_getPlayerCore",
		"_capturePlayerPreferenceSnapshot",
		"_clearCachedPlayerRef",
		"_playPlaybackTarget",
		"_pausePlaybackTarget",
		"_scheduleResumeRetries",
		"_schedulePlaybackRecoveryTimeout",
		"_broadcastWorkers",
		"__TTVAB_STATE__",
	];
	let saved: Record<string, unknown> = {};
	let scheduled: Array<{ delay: number; run: () => void }>;

	beforeEach(() => {
		saved = {};
		for (const name of stubbed) saved[name] = g[name];
		scheduled = [];
		g._getPlayerCore = () => ({ state: {} });
		g._capturePlayerPreferenceSnapshot = () => null;
		g._clearCachedPlayerRef = () => {};
		g._playPlaybackTarget = () => true;
		g._pausePlaybackTarget = () => true;
		g._scheduleResumeRetries = () => {};
		g._broadcastWorkers = () => {};
		g._schedulePlaybackRecoveryTimeout = (cb: () => void, delay: number) => {
			scheduled.push({ delay, run: cb });
			return 1;
		};
	});

	afterEach(() => {
		for (const name of stubbed) g[name] = saved[name];
	});

	function makeReloadHarness(contentType: string, startPosition: number) {
		let currentTime = startPosition;
		const video = {
			ended: false,
			paused: false,
			muted: false,
			defaultMuted: false,
			volume: 1,
			buffered: { length: 0 },
			get currentTime() {
				return currentTime;
			},
			set currentTime(v: number) {
				currentTime = v;
			},
		};
		const player = {
			getHTMLVideoElement: () => video,
			play: () => undefined,
			seekTo: undefined as ((pos: number) => void) | undefined,
		};
		const playerState = {
			props: { content: { type: contentType } },
			setSrc: (..._args: unknown[]) => {
				currentTime = 0;
			},
		};
		g._getPlayerAndState = () => ({ player, state: playerState });
		g.__TTVAB_STATE__ = {
			PageMediaType: contentType === "vod" ? "vod" : "live",
			PageChannel: contentType === "vod" ? null : "testchannel",
			PageMediaKey: contentType === "vod" ? "vod:12345" : "live:testchannel",
			PageVodID: contentType === "vod" ? "12345" : null,
			LastPlayerReloadAt: 0,
			PlayerReloadDebounceMs: 1500,
		};
		return { video, player, playerState };
	}

	function runScheduled(maxDelay: number) {
		for (const entry of scheduled) {
			if (entry.delay <= maxDelay) entry.run();
		}
	}

	it("schedules a restore to the captured vod position and seeks back", () => {
		const { video } = makeReloadHarness("vod", 1234.5);

		task()(false, true, { reason: "manual" });
		expect(video.currentTime).toBe(0);
		expect(scheduled.some((e) => e.delay >= 1000)).toBe(true);

		runScheduled(1500);
		expect(video.currentTime).toBeCloseTo(1234.5, 3);
	});

	it("prefers the player seek API when available", () => {
		const { video, player } = makeReloadHarness("vod", 987);
		const seeks: number[] = [];
		player.seekTo = (pos: number) => {
			seeks.push(pos);
		};

		task()(false, true, { reason: "manual" });
		runScheduled(1500);

		expect(seeks).toEqual([987]);
		expect(video.currentTime).toBe(0);
	});

	it("skips the seek when playback already resumed near the captured spot", () => {
		const { video } = makeReloadHarness("vod", 500);

		task()(false, true, { reason: "manual" });
		video.currentTime = 499.2;

		runScheduled(3000);
		expect(video.currentTime).toBe(499.2);
	});

	it("does not schedule a position restore for live content", () => {
		const { video } = makeReloadHarness("live", 4321);

		task()(false, true, { reason: "manual" });
		expect(video.currentTime).toBe(0);

		runScheduled(3000);
		expect(video.currentTime).toBe(0);
	});
});

describe("_isNativeDocumentHidden (pip awareness)", () => {
	const hidden = () => T<() => boolean>("_isNativeDocumentHidden");
	let pipElement: HTMLVideoElement | null = null;

	beforeEach(() => {
		pipElement = null;
		Object.defineProperty(document, "pictureInPictureElement", {
			get: () => pipElement,
			configurable: true,
		});
		(globalThis as { window?: Record<string, unknown> }).window =
			globalThis as unknown as Record<string, unknown>;
	});

	afterEach(() => {
		Object.defineProperty(document, "pictureInPictureElement", {
			value: null,
			configurable: true,
		});
		(globalThis as Record<string, unknown>).__TTVAB_NATIVE_VISIBILITY__ =
			undefined;
	});

	it("reports hidden from the native visibility getter without pip", () => {
		(globalThis as Record<string, unknown>).__TTVAB_NATIVE_VISIBILITY__ = {
			hidden: () => true,
		};
		expect(hidden()()).toBe(true);
	});

	it("treats an active pip session as visible even when the document is hidden", () => {
		(globalThis as Record<string, unknown>).__TTVAB_NATIVE_VISIBILITY__ = {
			hidden: () => true,
		};
		pipElement = document.createElement("video");
		expect(hidden()()).toBe(false);
	});

	it("stays visible when neither pip nor the visibility getters report hidden", () => {
		(globalThis as Record<string, unknown>).__TTVAB_NATIVE_VISIBILITY__ = {
			hidden: () => false,
		};
		expect(hidden()()).toBe(false);
	});
});

describe("_doPlayerTask (pip reload policy)", () => {
	const task = () =>
		T<
			(
				isPausePlay: boolean,
				isReload: boolean,
				options?: Record<string, unknown>,
			) => unknown
		>("_doPlayerTask");

	const stubbed = [
		"_getPlayerAndState",
		"_getPlayerCore",
		"_capturePlayerPreferenceSnapshot",
		"_clearCachedPlayerRef",
		"_playPlaybackTarget",
		"_pausePlaybackTarget",
		"_scheduleResumeRetries",
		"_schedulePlaybackRecoveryTimeout",
		"_broadcastWorkers",
		"_isPlaybackRecoveryContextCurrent",
		"__TTVAB_STATE__",
	];
	let saved: Record<string, unknown> = {};
	let pipElement: HTMLVideoElement | null = null;
	let setSrcCalls: unknown[] = [];
	let pauseCalls: number;

	beforeEach(() => {
		saved = {};
		for (const name of stubbed) saved[name] = g[name];
		pipElement = document.createElement("video");
		Object.defineProperty(document, "pictureInPictureElement", {
			get: () => pipElement,
			configurable: true,
		});
		setSrcCalls = [];
		pauseCalls = 0;
		const player = {
			getHTMLVideoElement: () => null,
			play: () => undefined,
		};
		const playerState = {
			props: { content: { type: "live" } },
			setSrc: (arg: unknown) => {
				setSrcCalls.push(arg);
			},
		};
		g._getPlayerAndState = () => ({ player, state: playerState });
		g._getPlayerCore = () => ({ state: {} });
		g._capturePlayerPreferenceSnapshot = () => null;
		g._clearCachedPlayerRef = () => {};
		g._playPlaybackTarget = () => true;
		g._pausePlaybackTarget = () => {
			pauseCalls++;
			return true;
		};
		g._scheduleResumeRetries = () => {};
		g._schedulePlaybackRecoveryTimeout = () => null;
		g._broadcastWorkers = () => {};
		g._isPlaybackRecoveryContextCurrent = () => true;
		g.__TTVAB_STATE__ = {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			PageVodID: null,
			LastPlayerReloadAt: 0,
			PlayerReloadDebounceMs: 1500,
			CurrentAdMediaKey: null,
			CurrentAdChannel: null,
		};
	});

	afterEach(() => {
		Object.defineProperty(document, "pictureInPictureElement", {
			value: null,
			configurable: true,
		});
		for (const name of stubbed) g[name] = saved[name];
	});

	it("downgrades an automatic hard reload to pause/play under pip", () => {
		const result = task()(false, true, {
			reason: "ad-recovery",
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
		});

		expect(result).toBe(true);
		expect(setSrcCalls).toEqual([]);
		expect(pauseCalls).toBe(1);
	});

	it("still reloads immediately under pip for manual and worker recovery", () => {
		task()(false, true, {
			reason: "manual",
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
		});
		expect(setSrcCalls).toHaveLength(1);

		(g.__TTVAB_STATE__ as Record<string, unknown>).LastPlayerReloadAt = 0;
		task()(false, true, {
			reason: "worker-recovery",
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
		});
		expect(setSrcCalls).toHaveLength(2);
	});

	it("runs the deferred hard reload once pip exits", () => {
		const pip = pipElement as HTMLVideoElement;
		task()(false, true, {
			reason: "ad-recovery",
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
		});
		expect(setSrcCalls).toEqual([]);

		pipElement = null;
		pip.dispatchEvent(new Event("leavepictureinpicture"));

		expect(setSrcCalls).toHaveLength(1);
	});

	it("skips the deferred reload when an ad cycle is active at pip exit", () => {
		const pip = pipElement as HTMLVideoElement;
		task()(false, true, {
			reason: "ad-recovery",
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
		});

		(g.__TTVAB_STATE__ as Record<string, unknown>).CurrentAdMediaKey =
			"live:testchannel";
		pipElement = null;
		pip.dispatchEvent(new Event("leavepictureinpicture"));

		expect(setSrcCalls).toEqual([]);
	});

	it("skips the deferred reload when it has gone stale", () => {
		const pip = pipElement as HTMLVideoElement;
		const realNow = Date.now;
		task()(false, true, {
			reason: "ad-recovery",
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
		});

		const baseNow = realNow();
		vi.spyOn(Date, "now").mockReturnValue(baseNow + 121000);
		pipElement = null;
		pip.dispatchEvent(new Event("leavepictureinpicture"));

		expect(setSrcCalls).toEqual([]);
	});

	it("does not defer a soft pause/play downgrade", () => {
		const pip = pipElement as HTMLVideoElement;
		task()(false, true, { reason: "buffer-recovery" });
		expect(pauseCalls).toBe(1);

		pipElement = null;
		pip.dispatchEvent(new Event("leavepictureinpicture"));
		expect(setSrcCalls).toEqual([]);
	});
});

describe("_shouldSuppressAutomaticPlaybackResume (pip exemption)", () => {
	const suppress = () =>
		T<(channel?: string | null, mediaKey?: string | null) => boolean>(
			"_shouldSuppressAutomaticPlaybackResume",
		);
	const mark = () =>
		T<
			(
				kind: string,
				channel: string | null,
				mediaKey: string | null,
				durationMs: number,
				sourceWasPlaying: boolean,
			) => boolean
		>("_markSecondaryPlayerHandoff");
	const clear = () => T<() => void>("_clearSecondaryPlayerHandoff");
	let savedResolveMediaKey: unknown;

	beforeEach(() => {
		(g.__TTVAB_STATE__ as Record<string, unknown>).PageChannel = "chan";
		(g.__TTVAB_STATE__ as Record<string, unknown>).PageMediaKey = "live:chan";
		savedResolveMediaKey = g._resolvePlayerMediaKey;
		g._resolvePlayerMediaKey = (
			channel: string | null,
			mediaKey: string | null,
		) => mediaKey || (channel ? `live:${channel}` : null);
		clear()();
	});

	afterEach(() => {
		clear()();
		g._resolvePlayerMediaKey = savedResolveMediaKey;
	});

	it("does not suppress automatic playback work during a pip handoff", () => {
		expect(mark()("pip", "chan", "live:chan", 60000, false)).toBe(true);
		expect(suppress()("chan", "live:chan")).toBe(false);
	});

	it("still suppresses during a popout handoff", () => {
		expect(mark()("popout", "chan", "live:chan", 60000, false)).toBe(true);
		expect(suppress()("chan", "live:chan")).toBe(true);
	});

	it("does not suppress when no handoff is active", () => {
		expect(suppress()("chan", "live:chan")).toBe(false);
	});
});

describe("_capturePlayerPreferenceSnapshot (auto quality preservation)", () => {
	const capture = () =>
		T<
			(
				playerCore?: unknown,
				media?: unknown,
				context?: unknown,
			) => Record<string, unknown> | null
		>("_capturePlayerPreferenceSnapshot");

	beforeEach(() => {
		localStorage.removeItem("video-quality");
	});

	it("refreshes an explicit stored quality from the live group", () => {
		localStorage.setItem(
			"video-quality",
			JSON.stringify({ default: "1080p60" }),
		);
		const snapshot = capture()({ state: { quality: { group: "720p60" } } });
		expect(snapshot?.["video-quality"]).toBe(
			JSON.stringify({ default: "720p60" }),
		);
	});

	it("does not convert a stored auto preference into the live rung", () => {
		localStorage.setItem("video-quality", JSON.stringify({ default: "auto" }));
		const snapshot = capture()({ state: { quality: { group: "720p60" } } });
		expect(snapshot?.["video-quality"]).toBe(
			JSON.stringify({ default: "auto" }),
		);
	});

	it("does not invent a stored preference when none exists", () => {
		const snapshot = capture()({ state: { quality: { group: "720p60" } } });
		expect(snapshot?.["video-quality"]).toBe(null);
	});
});

describe("_handlePendingPostAdRecovery (no-frame rebuild gating)", () => {
	const recover = () =>
		T<
			(
				player: unknown,
				playerCore: unknown,
				video: unknown,
				channel: string,
				mediaKey: string,
				contentType: string,
			) => boolean
		>("_handlePendingPostAdRecovery");
	let savedDoPlayerTask: unknown;
	let savedSuppress: unknown;
	let reloads: Array<Record<string, unknown>>;

	beforeEach(() => {
		savedDoPlayerTask = g._doPlayerTask;
		savedSuppress = g._shouldSuppressAutomaticPlaybackResume;
		reloads = [];
		g._doPlayerTask = (
			isPausePlay: boolean,
			isReload: boolean,
			options: Record<string, unknown>,
		) => {
			reloads.push({ isPausePlay, isReload, ...options });
			return true;
		};
		g._shouldSuppressAutomaticPlaybackResume = () => false;
		const state = g._PlayerBufferState as Record<string, unknown>;
		state.lastFixTime = 0;
		state.postAdUnhealthyCount = 0;
		state.postAdRecoveryStartedAt = 0;
		state.postAdLastCurrentTime = 0;
		state.postAdStallTicks = 0;
		state.postAdSoftReloadAttempted = false;
	});

	afterEach(() => {
		g._doPlayerTask = savedDoPlayerTask;
		g._shouldSuppressAutomaticPlaybackResume = savedSuppress;
	});

	function makeNoFramePlayback() {
		const video = {
			paused: false,
			ended: false,
			currentTime: 0,
			videoWidth: 0,
		};
		const player = {
			getHTMLVideoElement: () => video,
			isPaused: () => false,
		};
		return { player, video };
	}

	it("gives a fresh recovery cycle time to render before the no-frame rebuild", () => {
		const { player, video } = makeNoFramePlayback();
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(500000);
		recover()(player, null, video, "chan", "live:chan", "live");
		expect(reloads).toHaveLength(0);

		nowSpy.mockReturnValue(502000);
		const handled = recover()(player, null, video, "chan", "live:chan", "live");
		expect(handled).toBe(true);
		expect(reloads).toHaveLength(1);
		expect(reloads[0].isReload).toBe(true);
		expect(reloads[0].newMediaPlayerInstance).toBe(true);
	});
});

describe("channel watch-time tracking", () => {
	type WatchState = {
		channel: string | null;
		pendingMs: number;
		lastTickAt: number;
	};
	const watchState = () => g._WatchTimeState as WatchState;
	const track = () => T<(isHidden: boolean) => void>("_trackChannelWatchTime");
	let bridgeMessages: Array<{ type: string; detail: unknown }> = [];
	let realGetPrimary: unknown;
	let realSendBridge: unknown;
	let nowValue = 1_000_000_000_000;

	function makeWatchVideo(overrides: Record<string, unknown> = {}) {
		const video = document.createElement("video");
		for (const [key, value] of Object.entries({
			paused: false,
			ended: false,
			readyState: 4,
			...overrides,
		})) {
			Object.defineProperty(video, key, {
				get: () => value,
				configurable: true,
			});
		}
		return video;
	}

	beforeEach(() => {
		bridgeMessages = [];
		realGetPrimary = g._getPrimaryMediaElement;
		realSendBridge = g._sendBridgeMessage;
		g._sendBridgeMessage = (type: string, detail: unknown) => {
			bridgeMessages.push({ type, detail });
			return true;
		};
		g.__TTVAB_STATE__ = {
			PageMediaType: "live",
			PageChannel: "streamerone",
		};
		const state = watchState();
		state.channel = null;
		state.pendingMs = 0;
		state.lastTickAt = 0;
		nowValue = 1_000_000_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => nowValue);
	});

	afterEach(() => {
		g._getPrimaryMediaElement = realGetPrimary;
		g._sendBridgeMessage = realSendBridge;
		vi.restoreAllMocks();
	});

	it("accumulates time across visible playing ticks", () => {
		g._getPrimaryMediaElement = () => makeWatchVideo();
		track()(false);
		nowValue += 1000;
		track()(false);
		nowValue += 1000;
		track()(false);
		expect(watchState().pendingMs).toBe(2000);
		expect(bridgeMessages.length).toBe(0);
	});

	it("caps a single tick gap so sleep cannot inflate the count", () => {
		g._getPrimaryMediaElement = () => makeWatchVideo();
		track()(false);
		nowValue += 60_000;
		track()(false);
		expect(watchState().pendingMs).toBe(5000);
	});

	it("does not count while the player is paused or the tab is hidden", () => {
		g._getPrimaryMediaElement = () => makeWatchVideo({ paused: true });
		track()(false);
		nowValue += 1000;
		track()(false);
		expect(watchState().pendingMs).toBe(0);

		g._getPrimaryMediaElement = () => makeWatchVideo();
		track()(true);
		nowValue += 1000;
		track()(true);
		expect(watchState().pendingMs).toBe(0);
	});

	it("sends a watch-time delta once the flush threshold accrues", () => {
		g._getPrimaryMediaElement = () => makeWatchVideo();
		track()(false);
		for (let i = 0; i < 16; i++) {
			nowValue += 1000;
			track()(false);
		}
		expect(bridgeMessages.length).toBe(1);
		expect(bridgeMessages[0].type).toBe("ttvab-watch-time");
		expect(bridgeMessages[0].detail).toEqual({
			channel: "streamerone",
			seconds: 15,
		});
		expect(watchState().pendingMs).toBe(1000);
	});

	it("force-flushes the old channel when the page switches channels", () => {
		g._getPrimaryMediaElement = () => makeWatchVideo();
		track()(false);
		for (let i = 0; i < 5; i++) {
			nowValue += 1000;
			track()(false);
		}
		(g.__TTVAB_STATE__ as Record<string, unknown>).PageChannel = "streamertwo";
		nowValue += 1000;
		track()(false);
		expect(bridgeMessages.length).toBe(1);
		expect(bridgeMessages[0].detail).toEqual({
			channel: "streamerone",
			seconds: 5,
		});
		expect(watchState().channel).toBe("streamertwo");
		expect(watchState().pendingMs).toBe(0);
	});
});
