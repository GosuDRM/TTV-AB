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
	loadModule("../dist/src/modules/logger.js");
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
	T<() => void>("_resetPostAdRecoveryTransaction")();
	T<() => void>("_clearPinnedBackupTimelineRestore")();
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
	state.mediaKey = null;
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

function makePinnedTimelineHarness(
	options: {
		ranges?: Array<[number, number]>;
		currentTime?: number;
		mediaType?: "live" | "vod";
		targetMediaKey?: string;
		channel?: string | null;
		currentAdMediaKey?: string;
		pinnedMediaKey?: string;
		currentElementMatches?: boolean;
		fatalErrorCode?: number;
		userPaused?: boolean;
		secondarySuppressed?: boolean;
	} = {},
) {
	const check = T<
		(
			player: { getHTMLVideoElement: () => HTMLVideoElement },
			channel?: string,
			mediaKey?: string,
		) => void
	>("_checkPinnedBackupStall");
	const ranges = options.ranges ?? [[0.044, 31.5]];
	const targetMediaKey = options.targetMediaKey ?? "live:testchannel";
	const channel =
		options.channel === undefined ? "testchannel" : options.channel;
	const { video, seeks } = makeRangesVideo(
		ranges,
		options.currentTime ?? 70.604,
		true,
	);
	const otherVideo = document.createElement("video");
	const player = { getHTMLVideoElement: () => video };
	const messages: unknown[] = [];
	const resume = vi.fn();
	const scheduleResumeRetries = vi.fn();
	const replacedGlobals = [
		"_broadcastWorkers",
		"_resumeActivePlayerIfPaused",
		"_scheduleResumeRetries",
		"_getPlaybackMediaElementForContext",
		"_getFatalAdMediaErrorCode",
		"_getPlayerLifecycleCycleStartedAt",
		"_hasUserPauseIntent",
		"_shouldSuppressAutomaticPlaybackResume",
	] as const;
	const saved = Object.fromEntries(
		replacedGlobals.map((name) => [name, g[name]]),
	) as Record<(typeof replacedGlobals)[number], unknown>;
	const state = g.__TTVAB_STATE__ as Record<string, unknown>;
	Object.assign(state, {
		PageMediaType: options.mediaType ?? "live",
		PageChannel: channel,
		PageMediaKey: targetMediaKey,
		CurrentAdChannel: channel,
		CurrentAdMediaKey: options.currentAdMediaKey ?? targetMediaKey,
		PinnedBackupPlayerChannel: channel,
		PinnedBackupPlayerMediaKey: options.pinnedMediaKey ?? targetMediaKey,
	});
	g._broadcastWorkers = (message: unknown) => messages.push(message);
	g._resumeActivePlayerIfPaused = resume;
	g._scheduleResumeRetries = scheduleResumeRetries;
	g._getPlaybackMediaElementForContext = () =>
		options.currentElementMatches === false ? otherVideo : video;
	g._getFatalAdMediaErrorCode = () => options.fatalErrorCode ?? 0;
	g._getPlayerLifecycleCycleStartedAt = () => 99123;
	g._hasUserPauseIntent = () => options.userPaused === true;
	g._shouldSuppressAutomaticPlaybackResume = () =>
		options.secondarySuppressed === true;
	const nowSpy = vi.spyOn(Date, "now");

	return {
		ranges,
		seeks,
		messages,
		resume,
		scheduleResumeRetries,
		state,
		sample(at: number) {
			nowSpy.mockReturnValue(at);
			check(player, channel ?? undefined, targetMediaKey);
		},
		restore() {
			for (const name of replacedGlobals) g[name] = saved[name];
			nowSpy.mockRestore();
		},
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
			(
				player: { getHTMLVideoElement: () => HTMLVideoElement },
				channel?: string,
				mediaKey?: string,
			) => void
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
		check(player, "pipchannel", "live:pipchannel");
		currentTime = 10;
		bufferedEnd = 10.2;
		nowSpy.mockReturnValue(104000);
		check(player, "pipchannel", "live:pipchannel");

		expect(messages).toEqual([
			{
				key: "UpdateBackupSearchForceRefresh",
				targetMediaKey: "live:pipchannel",
				value: 104000,
			},
		]);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt,
		).toBe(104000);
	});

	it("realigns an advancing pinned live backup whose timeline restarted behind the playhead", () => {
		const harness = makePinnedTimelineHarness();

		try {
			harness.sample(100000);
			harness.ranges[0][1] = 33;
			harness.sample(102999);
			expect(harness.seeks).toEqual([]);
			expect(harness.resume).not.toHaveBeenCalled();
			harness.ranges[0][1] = 33.734;
			harness.sample(103000);

			expect(harness.seeks).toEqual([expect.closeTo(33.234, 3)]);
			expect(harness.messages).toEqual([]);
			expect(g._PinnedBackupTimelineRestoreState).toMatchObject({
				mediaKey: "live:testchannel",
				cycleStartedAt: 99123,
			});
			expect(harness.state.BackupSearchForceRefreshAt).toBe(0);
			expect(
				(g._PinnedBackupStallState as Record<string, unknown>)
					.forceRefreshCount,
			).toBe(0);
			expect(harness.resume).toHaveBeenCalledWith(
				"testchannel",
				"live:testchannel",
			);
			expect(harness.scheduleResumeRetries).toHaveBeenCalledWith(
				"testchannel",
				"live:testchannel",
				[180, 650],
				{ cycleStartedAt: 99123 },
			);
		} finally {
			harness.restore();
		}
	});

	it("realigns an advancing pinned live backup whose timeline jumped ahead of the playhead", () => {
		const harness = makePinnedTimelineHarness({
			currentTime: 1025.7,
			ranges: [[1257.8, 1261.5]],
		});

		try {
			harness.sample(100000);
			harness.ranges[0][1] = 1263;
			harness.sample(102999);
			expect(harness.seeks).toEqual([]);
			harness.ranges[0][1] = 1264.4;
			harness.sample(103000);

			expect(harness.seeks).toEqual([expect.closeTo(1263.9, 3)]);
			expect(harness.messages).toEqual([]);
			expect(g._PinnedBackupTimelineRestoreState).toMatchObject({
				mediaKey: "live:testchannel",
				cycleStartedAt: 99123,
			});
			expect(harness.resume).toHaveBeenCalledWith(
				"testchannel",
				"live:testchannel",
			);
		} finally {
			harness.restore();
		}
	});

	it("consumes a timeline restore requirement only for its exact cycle", () => {
		const mark = T<(mediaKey: string, cycleStartedAt: number) => boolean>(
			"_markPinnedBackupTimelineRestore",
		);
		const consume = T<(mediaKey: string, cycleStartedAt: number) => boolean>(
			"_consumePinnedBackupTimelineRestore",
		);

		expect(mark("live:testchannel", 99123)).toBe(true);
		expect(consume("live:testchannel", 99124)).toBe(false);
		expect(consume("live:other", 99123)).toBe(false);
		expect(consume("live:testchannel", 99123)).toBe(true);
		expect(consume("live:testchannel", 99123)).toBe(false);
	});

	it("keeps re-searching when an off-timeline backup buffer is stale", () => {
		const harness = makePinnedTimelineHarness({ ranges: [] });

		try {
			harness.sample(100000);
			harness.ranges.push([0.044, 33.734]);
			harness.sample(101500);
			harness.sample(104000);

			expect(harness.seeks).toEqual([]);
			expect(harness.messages).toEqual([
				{
					key: "UpdateBackupSearchForceRefresh",
					targetMediaKey: "live:testchannel",
					value: 104000,
				},
			]);
		} finally {
			harness.restore();
		}
	});

	it("never realigns an advancing VOD buffer", () => {
		const harness = makePinnedTimelineHarness({
			mediaType: "vod",
			targetMediaKey: "vod:12345",
			channel: null,
		});

		try {
			harness.sample(100000);
			harness.ranges[0][1] = 33.734;
			harness.sample(104000);

			expect(harness.seeks).toEqual([]);
			expect(harness.resume).not.toHaveBeenCalled();
			expect(harness.scheduleResumeRetries).not.toHaveBeenCalled();
		} finally {
			harness.restore();
		}
	});

	it.each([
		["an explicit user pause", "_hasUserPauseIntent"],
		["a secondary-player handoff", "_shouldSuppressAutomaticPlaybackResume"],
	] as const)("does not realign during %s", (_label, guardName) => {
		const harness = makePinnedTimelineHarness({
			userPaused: guardName === "_hasUserPauseIntent",
			secondarySuppressed:
				guardName === "_shouldSuppressAutomaticPlaybackResume",
		});

		try {
			harness.sample(100000);
			harness.ranges[0][1] = 33.734;
			harness.sample(104000);

			expect(harness.seeks).toEqual([]);
			expect(harness.resume).not.toHaveBeenCalled();
			expect(harness.scheduleResumeRetries).not.toHaveBeenCalled();
		} finally {
			harness.restore();
		}
	});

	it.each([
		[
			"the active ad owner differs",
			{
				currentAdMediaKey: "live:otherchannel",
				pinnedMediaKey: "live:testchannel",
				currentElementMatches: true,
				fatalErrorCode: 0,
			},
		],
		[
			"the pinned owner differs",
			{
				currentAdMediaKey: "live:testchannel",
				pinnedMediaKey: "live:otherchannel",
				currentElementMatches: true,
				fatalErrorCode: 0,
			},
		],
		[
			"the resolved media element differs",
			{
				currentAdMediaKey: "live:testchannel",
				pinnedMediaKey: "live:testchannel",
				currentElementMatches: false,
				fatalErrorCode: 0,
			},
		],
		[
			"fatal media recovery owns the element",
			{
				currentAdMediaKey: "live:testchannel",
				pinnedMediaKey: "live:testchannel",
				currentElementMatches: true,
				fatalErrorCode: 3,
			},
		],
	] as const)("does not realign when %s", (_label, ownership) => {
		const harness = makePinnedTimelineHarness(ownership);

		try {
			harness.sample(100000);
			harness.ranges[0][1] = 33.734;
			harness.sample(104000);

			expect(harness.seeks).toEqual([]);
			expect(harness.resume).not.toHaveBeenCalled();
			expect(harness.scheduleResumeRetries).not.toHaveBeenCalled();
		} finally {
			harness.restore();
		}
	});

	it("uses the first positive buffer after an empty sample as an evidence baseline", () => {
		const harness = makePinnedTimelineHarness({ ranges: [] });

		try {
			harness.sample(100000);
			harness.ranges.push([0.044, 31.5]);
			harness.sample(101500);
			harness.ranges[0][1] = 33;
			harness.sample(102999);
			expect(harness.seeks).toEqual([]);
			harness.ranges[0][1] = 33.734;
			harness.sample(103000);

			expect(harness.seeks).toEqual([expect.closeTo(33.234, 3)]);
			expect(harness.resume).toHaveBeenCalledWith(
				"testchannel",
				"live:testchannel",
			);
			expect(harness.scheduleResumeRetries).toHaveBeenCalledWith(
				"testchannel",
				"live:testchannel",
				[180, 650],
				{ cycleStartedAt: 99123 },
			);
		} finally {
			harness.restore();
		}
	});

	it("defers to in-ad freeze recovery when the playhead freezes with safe buffered headroom", () => {
		const check = T<
			(player: { getHTMLVideoElement: () => HTMLVideoElement }) => void
		>("_checkPinnedBackupStall");
		const messages: unknown[] = [];
		g._broadcastWorkers = (message: unknown) => {
			messages.push(message);
		};
		const player = makePlayer(
			() => 10,
			() => 40,
		);
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check(player);
		nowSpy.mockReturnValue(104000);
		check(player);

		expect(messages).toEqual([]);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt,
		).toBe(0);
		const state = g._PinnedBackupStallState as Record<string, unknown>;
		expect(state.forceRefreshCount).toBe(0);
		expect(state.lastForceRefreshAt).toBe(104000);
	});

	it("holds the pinned backup while the playhead advances at a drained edge (rotating mid-advance only forces a needless rebuffer)", () => {
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

		expect(messages).toEqual([]);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt,
		).toBe(0);
	});

	it("does not rotate a 360p backup that advances steadily at a sub-danger-zone live-edge buffer (issue #36 rotation storm)", () => {
		const check = T<
			(player: { getHTMLVideoElement: () => HTMLVideoElement }) => void
		>("_checkPinnedBackupStall");
		const messages: unknown[] = [];
		g._broadcastWorkers = (message: unknown) => {
			messages.push(message);
		};
		let currentTime = 100;
		let bufferedEnd = 100.8;
		const player = makePlayer(
			() => currentTime,
			() => bufferedEnd,
		);
		const nowSpy = vi.spyOn(Date, "now");

		for (let tick = 0; tick < 8; tick++) {
			nowSpy.mockReturnValue(100000 + tick * 2000);
			check(player);
			currentTime += 2;
			bufferedEnd += 2;
		}

		expect(messages).toEqual([]);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt,
		).toBe(0);
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
	let previousGetPrimaryMediaElement: unknown;
	let previousResolvePlayerMediaKey: unknown;
	let previousLog: unknown;

	beforeEach(() => {
		previousGetPrimaryMediaElement = g._getPrimaryMediaElement;
		previousResolvePlayerMediaKey = g._resolvePlayerMediaKey;
		previousLog = g._log;
	});

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
		g._getPrimaryMediaElement = previousGetPrimaryMediaElement;
		g._resolvePlayerMediaKey = previousResolvePlayerMediaKey;
		g._log = previousLog;
	});

	it("counts and logs each competing element only once across repeated calls", () => {
		const suppress = T<(channel?: string, mediaKey?: string) => number>(
			"_suppressCompetingMediaDuringAd",
		);
		const primary = makeCompetingVideo();
		g._getPrimaryMediaElement = () => primary;
		g._resolvePlayerMediaKey = () => "live:test";
		(g.__TTVAB_STATE__ as Record<string, unknown>).PageMediaKey = "live:test";
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
		"_getPlayerCore",
		"_getActivePictureInPicturePlaybackContext",
		"_isNativeDocumentHidden",
		"_isPlaybackRecoveryContextCurrent",
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
		g._getActivePictureInPicturePlaybackContext = () => null;
		g._isNativeDocumentHidden = () => false;
		g._isPlaybackRecoveryContextCurrent = () => true;
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
			CurrentAdChannel: null,
			CurrentAdMediaKey: null,
			LastAdEndedAt: now - 1000,
			LastAdEndedChannel: "testchannel",
			LastAdEndedMediaKey: "live:testchannel",
			LastAdEndedCycleStartedAt: now - 2000,
			ShouldResumeAfterAd: true,
			ShouldResumeAfterAdChannel: "testchannel",
			ShouldResumeAfterAdMediaKey: "live:testchannel",
			ShouldResumeAfterAdUntil: now + 15000,
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
		expect(
			(state.LastPlayerReloadAtByMediaKey as Record<string, number>)[
				"live:testchannel"
			],
		).toBe(state.LastPlayerReloadAt);
	});

	it("resumes a hidden pause nudge in a microtask instead of a throttled timer", async () => {
		const player = { isPaused: () => false, getHTMLVideoElement: () => null };
		const playerState = { props: { content: { type: "live" } } };
		const pauseCalls: unknown[] = [];
		const playCalls: unknown[] = [];
		const scheduledCalls: unknown[] = [];
		g._getPlayerAndState = () => ({ player, state: playerState });
		g._getPlayerCore = () => ({ paused: false });
		g._getActivePictureInPicturePlaybackContext = () => null;
		g._isNativeDocumentHidden = () => true;
		g._isPlaybackRecoveryContextCurrent = () => true;
		g._shouldSuppressAutomaticPlaybackResume = () => false;
		g._pausePlaybackTarget = (target: unknown) => {
			pauseCalls.push(target);
			return true;
		};
		g._playPlaybackTarget = (target: unknown) => {
			playCalls.push(target);
			return true;
		};
		g._schedulePlaybackRecoveryTimeout = (...args: unknown[]) => {
			scheduledCalls.push(args);
			return 1;
		};
		g.__TTVAB_STATE__ = {
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
		};

		const result = T<
			(
				isPausePlay: boolean,
				isReload: boolean,
				options?: Record<string, unknown>,
			) => unknown
		>("_doPlayerTask")(true, false, { reason: "buffer-recovery" });

		expect(result).toBe(true);
		expect(pauseCalls).toEqual([player]);
		expect(playCalls).toHaveLength(0);
		expect(scheduledCalls).toHaveLength(0);

		await Promise.resolve();

		expect(playCalls).toEqual([player]);
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

function makeRangesVideo(
	ranges: Array<[number, number]>,
	currentTime: number,
	paused = false,
) {
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
		get: () => paused,
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
		T<
			(
				player: { getHTMLVideoElement: () => HTMLVideoElement },
				channel?: string,
				mediaKey?: string,
			) => void
		>("_checkInAdPlayheadFreeze");

	let realDoPlayerTask: unknown;
	let realIsNativeDocumentHidden: unknown;
	let playerTaskCalls: Array<[unknown, unknown]> = [];
	let playerTaskOptions: unknown[] = [];

	beforeEach(() => {
		realDoPlayerTask = g._doPlayerTask;
		realIsNativeDocumentHidden = g._isNativeDocumentHidden;
		playerTaskCalls = [];
		playerTaskOptions = [];
		g._doPlayerTask = (a: unknown, b: unknown, options: unknown) => {
			playerTaskCalls.push([a, b]);
			playerTaskOptions.push(options);
			return true;
		};
		g._isNativeDocumentHidden = () => false;
		(g._resetInAdFreezeState as () => void)();
	});

	afterEach(() => {
		g._doPlayerTask = realDoPlayerTask;
		g._isNativeDocumentHidden = realIsNativeDocumentHidden;
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

	it("targets PiP recovery actions to the exact ad media context", () => {
		const { video } = makeRangesVideo([[0, 20]], 10);
		const player = { getHTMLVideoElement: () => video };
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check()(player, "pipchannel", "live:pipchannel");
		nowSpy.mockReturnValue(105500);
		check()(player, "pipchannel", "live:pipchannel");

		expect(playerTaskCalls).toEqual([[true, false]]);
		expect(playerTaskOptions).toEqual([
			{
				reason: "buffer-recovery",
				channel: "pipchannel",
				mediaKey: "live:pipchannel",
			},
		]);
	});

	it("nudges a playhead frozen mid-range with safe headroom instead of jumping the gap (decoder wedge, issue #39)", () => {
		const { video, seeks } = makeRangesVideo(
			[
				[1400, 1463.966],
				[1464.4, 1466.01],
			],
			1450,
		);
		const player = { getHTMLVideoElement: () => video };
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check()(player);
		nowSpy.mockReturnValue(103000);
		check()(player);
		expect(playerTaskCalls).toEqual([]);

		nowSpy.mockReturnValue(105500);
		check()(player);
		expect(playerTaskCalls).toEqual([[true, false]]);
		expect(seeks).toEqual([]);
	});

	it("stays idle while playback advances normally with safe headroom", () => {
		const { video, seeks } = makeRangesVideo(
			[
				[1400, 1463.966],
				[1464.4, 1466.01],
			],
			1440,
		);
		let ct = 1440;
		Object.defineProperty(video, "currentTime", {
			get: () => ct,
			configurable: true,
		});
		const player = { getHTMLVideoElement: () => video };
		const nowSpy = vi.spyOn(Date, "now");

		for (let tick = 0; tick < 10; tick++) {
			nowSpy.mockReturnValue(100000 + tick * 600);
			check()(player);
			ct += 0.6;
		}
		expect(seeks).toEqual([]);
		expect(playerTaskCalls).toEqual([]);
	});

	it("keeps hidden decoder recovery active without issuing a reload", () => {
		const { video } = makeRangesVideo([[1400, 1463.966]], 1463.93);
		const player = { getHTMLVideoElement: () => video };
		const nowSpy = vi.spyOn(Date, "now");
		g._isNativeDocumentHidden = () => true;

		for (let tick = 0; tick < 6; tick++) {
			nowSpy.mockReturnValue(100000 + tick * 5500);
			check()(player);
		}

		expect(playerTaskCalls.length).toBeGreaterThan(0);
		expect(
			playerTaskCalls.every(([pausePlay, reload]) => pausePlay && !reload),
		).toBe(true);
		const state = g._InAdFreezeState as Record<string, number>;
		expect(state.actionCount).toBeLessThanOrEqual(2);
	});

	it("acts despite a slow currentTime trickle from a wedged decoder (issue #39 photo-finish reset)", () => {
		const { video } = makeRangesVideo([[1400, 1463.966]], 1463.93);
		let ct = 1463.93;
		Object.defineProperty(video, "currentTime", {
			get: () => ct,
			configurable: true,
		});
		const player = { getHTMLVideoElement: () => video };
		const nowSpy = vi.spyOn(Date, "now");

		for (let tick = 0; tick < 10; tick++) {
			nowSpy.mockReturnValue(100000 + tick * 600);
			check()(player);
			ct += 0.02;
		}
		expect(playerTaskCalls).toEqual([[true, false]]);
	});
});

describe("_checkHiddenCleanLiveStall", () => {
	const check = () =>
		T<
			(
				player: { getHTMLVideoElement: () => HTMLVideoElement },
				channel: string,
				mediaKey: string,
			) => boolean
		>("_checkHiddenCleanLiveStall");
	let savedHidden: unknown;
	let savedUserPause: unknown;
	let savedSuppressResume: unknown;
	let savedDoPlayerTask: unknown;
	let tasks: Array<[boolean, boolean, Record<string, unknown>]>;

	beforeEach(() => {
		savedHidden = g._isNativeDocumentHidden;
		savedUserPause = g._hasUserPauseIntent;
		savedSuppressResume = g._shouldSuppressAutomaticPlaybackResume;
		savedDoPlayerTask = g._doPlayerTask;
		tasks = [];
		g._isNativeDocumentHidden = () => true;
		g._hasUserPauseIntent = () => false;
		g._shouldSuppressAutomaticPlaybackResume = () => false;
		g._doPlayerTask = (
			pausePlay: boolean,
			reload: boolean,
			options: Record<string, unknown>,
		) => {
			tasks.push([pausePlay, reload, options]);
			return true;
		};
		g.__TTVAB_STATE__ = {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: null,
			CurrentAdMediaKey: null,
		};
		T<() => void>("_resetHiddenCleanLiveStallState")();
	});

	afterEach(() => {
		g._isNativeDocumentHidden = savedHidden;
		g._hasUserPauseIntent = savedUserPause;
		g._shouldSuppressAutomaticPlaybackResume = savedSuppressResume;
		g._doPlayerTask = savedDoPlayerTask;
		T<() => void>("_resetHiddenCleanLiveStallState")();
	});

	it("uses only a bounded pause/play nudge for a sustained hidden clean-live freeze", () => {
		const { video } = makeRangesVideo([[0, 40]], 30);
		const player = { getHTMLVideoElement: () => video };
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		expect(check()(player, "testchannel", "live:testchannel")).toBe(false);
		nowSpy.mockReturnValue(115001);
		expect(check()(player, "testchannel", "live:testchannel")).toBe(true);
		nowSpy.mockReturnValue(130000);
		expect(check()(player, "testchannel", "live:testchannel")).toBe(false);

		expect(tasks).toEqual([
			[
				true,
				false,
				{
					reason: "buffer-recovery",
					channel: "testchannel",
					mediaKey: "live:testchannel",
				},
			],
		]);
	});

	it("stays inert for active ads and explicit user pauses", () => {
		const { video } = makeRangesVideo([[0, 40]], 30);
		const player = { getHTMLVideoElement: () => video };
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check()(player, "testchannel", "live:testchannel");
		(g.__TTVAB_STATE__ as Record<string, unknown>).CurrentAdMediaKey =
			"live:testchannel";
		nowSpy.mockReturnValue(120000);
		expect(check()(player, "testchannel", "live:testchannel")).toBe(false);

		(g.__TTVAB_STATE__ as Record<string, unknown>).CurrentAdMediaKey = null;
		g._hasUserPauseIntent = () => true;
		nowSpy.mockReturnValue(140000);
		expect(check()(player, "testchannel", "live:testchannel")).toBe(false);
		expect(tasks).toEqual([]);
	});

	it("keeps the same-media deadline across alternating paused player elements", () => {
		const { video: pausedVideo } = makeRangesVideo([[0, 40]], 30);
		const { video: stalledVideo } = makeRangesVideo([[0, 40]], 30);
		Object.defineProperty(pausedVideo, "paused", {
			get: () => true,
			configurable: true,
		});
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(100000);
		check()(
			{ getHTMLVideoElement: () => pausedVideo },
			"testchannel",
			"live:testchannel",
		);
		nowSpy.mockReturnValue(108000);
		check()(
			{ getHTMLVideoElement: () => stalledVideo },
			"testchannel",
			"live:testchannel",
		);
		nowSpy.mockReturnValue(112000);
		check()(
			{ getHTMLVideoElement: () => pausedVideo },
			"testchannel",
			"live:testchannel",
		);
		nowSpy.mockReturnValue(116000);
		expect(
			check()(
				{ getHTMLVideoElement: () => stalledVideo },
				"testchannel",
				"live:testchannel",
			),
		).toBe(true);
		expect(tasks).toHaveLength(1);
		expect(tasks[0][0]).toBe(true);
		expect(tasks[0][1]).toBe(false);
	});
});

describe("fatal enhanced-media recovery during ads", () => {
	const check = () =>
		T<(player: { getHTMLVideoElement: () => HTMLVideoElement }) => boolean>(
			"_checkFatalAdMediaRecovery",
		);
	const accept = () =>
		T<(data: Record<string, unknown>) => boolean>(
			"_acceptFatalAdMediaRecoveryReady",
		);
	let saved: Record<string, unknown>;
	let messages: Array<Record<string, unknown>>;
	let reloads: Array<Record<string, unknown>>;
	let video: HTMLVideoElement;
	let player: { getHTMLVideoElement: () => HTMLVideoElement };
	let errorCode: number;
	let readyState: number;

	beforeEach(() => {
		saved = {
			state: g.__TTVAB_STATE__,
			broadcast: g._broadcastWorkers,
			getPlayerAndState: g._getPlayerAndState,
			doPlayerTask: g._doPlayerTask,
			getCodecHandoffCycleStartedAt: g._getCodecHandoffCycleStartedAt,
			getCurrentAdBreakStartedAt: g._getCurrentAdBreakStartedAt,
			isCodecHandoffCycleCurrent: g._isCodecHandoffCycleCurrent,
			hasPendingAdResumeIntent: g._hasPendingAdResumeIntent,
			hasUserPauseIntent: g._hasUserPauseIntent,
			isNativeDocumentHidden: g._isNativeDocumentHidden,
			shouldSuppressAutomaticPlaybackResume:
				g._shouldSuppressAutomaticPlaybackResume,
		};
		messages = [];
		reloads = [];
		errorCode = 3;
		readyState = 0;
		video = document.createElement("video");
		Object.defineProperty(video, "error", {
			get: () => (errorCode ? { code: errorCode } : null),
			configurable: true,
		});
		Object.defineProperty(video, "readyState", {
			get: () => readyState,
			configurable: true,
		});
		Object.defineProperty(video, "ended", {
			get: () => false,
			configurable: true,
		});
		player = { getHTMLVideoElement: () => video };
		g.__TTVAB_STATE__ = {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			PageVodID: null,
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			ActiveCodecHandoffId: null,
			ActiveCodecHandoffChannel: null,
			ActiveCodecHandoffMediaKey: null,
			LastPlayerReloadAt: 0,
			PlayerReloadDebounceMs: 1500,
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 100 },
			},
		};
		g._getCodecHandoffCycleStartedAt = (handoffId: unknown) => {
			if (typeof handoffId !== "string" || !handoffId) return 0;
			const parts = handoffId.split(":");
			return Math.max(0, Number(parts[parts.length - 4]) || 0);
		};
		g._getCurrentAdBreakStartedAt = (mediaKey: unknown) =>
			Math.max(
				0,
				Number(
					(
						(g.__TTVAB_STATE__ as Record<string, unknown>)
							.AdPodProgressByMediaKey as Record<
							string,
							{ cycleStartedAt?: number }
						>
					)?.[String(mediaKey)]?.cycleStartedAt,
				) || 0,
			);
		g._isCodecHandoffCycleCurrent = (
			mediaKey: unknown,
			cycleStartedAt: unknown,
		) =>
			String(
				(g.__TTVAB_STATE__ as Record<string, unknown>).CurrentAdMediaKey,
			) === String(mediaKey) &&
			(g._getCurrentAdBreakStartedAt as (key: unknown) => number)(mediaKey) ===
				Math.max(0, Number(cycleStartedAt) || 0);
		g._broadcastWorkers = (message: Record<string, unknown>) => {
			messages.push(message);
		};
		g._getPlayerAndState = () => ({
			player,
			state: { props: { content: { type: "live" } } },
		});
		g._doPlayerTask = (
			_pausePlay: boolean,
			_reload: boolean,
			options: Record<string, unknown>,
		) => {
			reloads.push(options);
			return true;
		};
		g._hasPendingAdResumeIntent = () => true;
		g._hasUserPauseIntent = () => false;
		g._isNativeDocumentHidden = () => false;
		g._shouldSuppressAutomaticPlaybackResume = () => false;
		T<() => boolean>("_resetFatalAdMediaRecoveryState")();
	});

	afterEach(() => {
		T<() => boolean>("_resetFatalAdMediaRecoveryState")();
		g.__TTVAB_STATE__ = saved.state;
		g._broadcastWorkers = saved.broadcast;
		g._getPlayerAndState = saved.getPlayerAndState;
		g._doPlayerTask = saved.doPlayerTask;
		g._getCodecHandoffCycleStartedAt = saved.getCodecHandoffCycleStartedAt;
		g._getCurrentAdBreakStartedAt = saved.getCurrentAdBreakStartedAt;
		g._isCodecHandoffCycleCurrent = saved.isCodecHandoffCycleCurrent;
		g._hasPendingAdResumeIntent = saved.hasPendingAdResumeIntent;
		g._hasUserPauseIntent = saved.hasUserPauseIntent;
		g._isNativeDocumentHidden = saved.isNativeDocumentHidden;
		g._shouldSuppressAutomaticPlaybackResume =
			saved.shouldSuppressAutomaticPlaybackResume;
		video.remove();
		vi.useRealTimers();
	});

	function enableUnreadyRecoveryContext() {
		errorCode = 0;
		document.body.append(video);
		Object.assign(g.__TTVAB_STATE__ as Record<string, unknown>, {
			PinnedBackupPlayerType: "autoplay",
			PinnedBackupPlayerMediaKey: "live:testchannel",
			PlayerHasPlayedOnce: true,
		});
	}

	it("requests one worker-verified recovery for a fatal error at readyState zero", () => {
		expect(check()(player)).toBe(true);
		expect(check()(player)).toBe(false);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			key: "PrepareFatalMediaRecovery",
			targetMediaKey: "live:testchannel",
			value: {
				channelName: "testchannel",
				mediaKey: "live:testchannel",
			},
		});
		expect((messages[0].value as Record<string, unknown>).recoveryId).toEqual(
			expect.any(String),
		);
		expect(reloads).toEqual([]);
	});

	it.each([0, 1])("does not recover non-fatal media error code %s", (code) => {
		errorCode = code;
		expect(check()(player)).toBe(false);
		expect(messages).toEqual([]);
	});

	it("waits for a continuous owned unready state before requesting recovery", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		enableUnreadyRecoveryContext();

		expect(check()(player)).toBe(false);
		vi.setSystemTime(111999);
		expect(check()(player)).toBe(false);
		expect(messages).toEqual([]);

		vi.setSystemTime(112000);
		expect(check()(player)).toBe(true);
		expect(check()(player)).toBe(false);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			key: "PrepareFatalMediaRecovery",
			targetMediaKey: "live:testchannel",
			value: {
				recoveryKind: "unready",
				mediaKey: "live:testchannel",
			},
		});
	});

	it("cancels an unready recovery when media starts loading before proof arrives", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		enableUnreadyRecoveryContext();
		expect(check()(player)).toBe(false);
		vi.setSystemTime(112000);
		expect(check()(player)).toBe(true);
		const request = messages[0].value as Record<string, unknown>;

		readyState = 1;
		expect(
			accept()({
				recoveryId: request.recoveryId,
				verifiedAt: Number(request.requestedAt) + 1,
				cycleStartedAt: request.cycleStartedAt,
				channel: "testchannel",
				mediaKey: "live:testchannel",
			}),
		).toBe(false);
		expect(reloads).toEqual([]);
		expect(messages.at(-1)).toMatchObject({
			key: "UpdateCodecHandoffContext",
			value: { clearHandoffId: request.recoveryId },
		});
	});

	it("commits one verified reload while the owned media remains unready", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		enableUnreadyRecoveryContext();
		expect(check()(player)).toBe(false);
		vi.setSystemTime(112000);
		expect(check()(player)).toBe(true);
		const request = messages[0].value as Record<string, unknown>;

		expect(
			accept()({
				recoveryId: request.recoveryId,
				verifiedAt: Number(request.requestedAt) + 1,
				cycleStartedAt: request.cycleStartedAt,
				channel: "testchannel",
				mediaKey: "live:testchannel",
			}),
		).toBe(true);
		expect(reloads).toEqual([
			expect.objectContaining({
				reason: "codec-handoff",
				handoffId: request.recoveryId,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
				replaceCodecHandoff: true,
			}),
		]);
	});

	it("rebuilds an ordinary AVC player without a codec-handoff identity", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		enableUnreadyRecoveryContext();
		expect(check()(player)).toBe(false);
		vi.setSystemTime(112000);
		expect(check()(player)).toBe(true);
		const request = messages[0].value as Record<string, unknown>;

		expect(
			accept()({
				recoveryId: request.recoveryId,
				verifiedAt: Number(request.requestedAt) + 1,
				cycleStartedAt: request.cycleStartedAt,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				requiresCodecHandoff: false,
			}),
		).toBe(true);
		expect(reloads).toEqual([
			expect.objectContaining({
				reason: "ad-recovery",
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			}),
		]);
		expect(reloads[0]).not.toHaveProperty("handoffId");
	});

	it("does not recover an unready player when the user paused or ownership differs", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		enableUnreadyRecoveryContext();
		g._hasUserPauseIntent = () => true;

		expect(check()(player)).toBe(false);
		vi.setSystemTime(130000);
		expect(check()(player)).toBe(false);
		expect(messages).toEqual([]);

		g._hasUserPauseIntent = () => false;
		(g.__TTVAB_STATE__ as Record<string, unknown>).PinnedBackupPlayerMediaKey =
			"live:otherchannel";
		expect(check()(player)).toBe(false);
		vi.setSystemTime(160000);
		expect(check()(player)).toBe(false);
		expect(messages).toEqual([]);
	});

	it("rejects a fatal response after the active playback context changes", () => {
		expect(check()(player)).toBe(true);
		const request = messages[0].value as Record<string, unknown>;
		(g.__TTVAB_STATE__ as Record<string, unknown>).CurrentAdMediaKey =
			"live:otherchannel";

		expect(
			accept()({
				recoveryId: request.recoveryId,
				verifiedAt: Number(request.requestedAt) + 1,
				cycleStartedAt: request.cycleStartedAt,
				channel: "testchannel",
				mediaKey: "live:testchannel",
			}),
		).toBe(false);
		expect(reloads).toEqual([]);
	});

	it("accepts one fresh matching proof and commits one exact codec handoff", () => {
		expect(check()(player)).toBe(true);
		const request = messages[0].value as Record<string, unknown>;
		const ready = {
			recoveryId: request.recoveryId,
			verifiedAt: Number(request.requestedAt) + 1,
			cycleStartedAt: request.cycleStartedAt,
			channel: "testchannel",
			mediaKey: "live:testchannel",
		};

		expect(accept()(ready)).toBe(true);
		expect(accept()(ready)).toBe(false);
		expect(reloads).toEqual([
			expect.objectContaining({
				reason: "codec-handoff",
				handoffId: request.recoveryId,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
				replaceCodecHandoff: true,
				mediaKey: "live:testchannel",
			}),
		]);
	});

	it("exact-clears and rearms when the verified reload cannot start", () => {
		expect(check()(player)).toBe(true);
		const request = messages[0].value as Record<string, unknown>;
		g._doPlayerTask = () => false;

		expect(
			accept()({
				recoveryId: request.recoveryId,
				verifiedAt: Number(request.requestedAt) + 1,
				cycleStartedAt: request.cycleStartedAt,
				channel: "testchannel",
				mediaKey: "live:testchannel",
			}),
		).toBe(false);
		expect(messages.at(-1)).toMatchObject({
			key: "UpdateCodecHandoffContext",
			targetMediaKey: "live:testchannel",
			value: {
				clearHandoffId: request.recoveryId,
				mediaKey: "live:testchannel",
			},
		});
		expect(check()(player)).toBe(true);
	});
});

describe("_monitorPlayerBuffering in-route PiP ad recovery", () => {
	const replacedGlobals = [
		"_getPlayerAndState",
		"_hasPendingAdResumeIntent",
		"_isNativeDocumentHidden",
		"_trackChannelWatchTime",
		"_hasPlayerBufferMonitorRelevantContext",
		"_shouldSuppressAutomaticPlaybackResume",
		"_suppressCompetingMediaDuringAd",
		"_checkFatalAdMediaRecovery",
		"_checkInAdPlayheadFreeze",
	] as const;
	let savedState: unknown;
	let savedGlobals: Record<string, unknown>;
	let pagePlayer: { getHTMLVideoElement: () => HTMLVideoElement };

	beforeEach(() => {
		vi.useFakeTimers();
		savedState = g.__TTVAB_STATE__;
		savedGlobals = Object.fromEntries(
			replacedGlobals.map((name) => [name, g[name]]),
		);
		T<() => void>("_clearCachedPlayerRef")();
		const video = document.createElement("video");
		pagePlayer = { getHTMLVideoElement: () => video };
		g.__TTVAB_STATE__ = {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: "testchannel",
			CurrentAdMediaKey: "live:testchannel",
			PinnedBackupPlayerType: null,
			PinnedBackupStallPollMs: 0,
			IsBufferFixEnabled: true,
			PlayerBufferingDelay: 600,
		};
		T<(element: HTMLVideoElement, context: Record<string, unknown>) => unknown>(
			"_setActivePictureInPicturePlaybackContext",
		)(video, {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._getPlayerAndState = () => ({ player: pagePlayer, state: {} });
		g._hasPendingAdResumeIntent = () => false;
		g._isNativeDocumentHidden = () => false;
		g._trackChannelWatchTime = () => {};
		g._hasPlayerBufferMonitorRelevantContext = () => true;
		g._shouldSuppressAutomaticPlaybackResume = () => false;
		g._suppressCompetingMediaDuringAd = () => 0;
		g._checkFatalAdMediaRecovery = vi.fn();
		g._checkInAdPlayheadFreeze = () => {};
	});

	it("keeps page-owned fatal recovery enabled when PiP has the same key", () => {
		T<() => void>("_monitorPlayerBuffering")();
		expect(g._checkFatalAdMediaRecovery).toHaveBeenCalledWith(pagePlayer);
	});

	afterEach(() => {
		T<(resetBufferState?: boolean) => void>("_stopPlayerBufferMonitor")(false);
		window.removeEventListener(
			"pagehide",
			g._flushWatchTimeOnPageExit as EventListener,
		);
		T<() => unknown>("_clearActivePictureInPicturePlaybackContext")();
		for (const name of replacedGlobals) {
			g[name] = savedGlobals[name];
		}
		g.__TTVAB_STATE__ = savedState;
		vi.useRealTimers();
	});
});

describe("_monitorPlayerBuffering post-ad transaction ordering", () => {
	const replacedGlobals = [
		"_getPlayerAndState",
		"_getPlayerCore",
		"_doPlayerTask",
		"_scheduleResumeRetries",
		"_isNativeDocumentHidden",
		"_getActivePictureInPicturePlaybackContext",
		"_trackChannelWatchTime",
		"_hasPlayerBufferMonitorRelevantContext",
		"_shouldSuppressAutomaticPlaybackResume",
		"_hasUserPauseIntent",
		"_isPlaybackRecoveryContextCurrent",
		"_restoreReattachedSuppressedPrimaryMedia",
		"_syncPreferredQualityGroupThrottled",
	] as const;
	let savedState: unknown;
	let savedGlobals: Record<string, unknown>;
	let tasks: Array<Record<string, unknown>>;
	let video: HTMLVideoElement;
	let player: {
		getHTMLVideoElement: () => HTMLVideoElement;
		getBufferDuration: () => number;
		isPaused: () => boolean;
	};
	let hidden: boolean;
	let userPaused: boolean;
	let videoEnded: boolean;
	let playerAvailable: boolean;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(500000);
		savedState = g.__TTVAB_STATE__;
		savedGlobals = Object.fromEntries(
			replacedGlobals.map((name) => [name, g[name]]),
		);
		T<(resetBufferState?: boolean) => void>("_stopPlayerBufferMonitor")(false);
		T<() => void>("_resetPostAdRecoveryTransaction")();
		T<() => void>("_resetPostAdRecoveryMonitorSamples")();
		tasks = [];
		hidden = false;
		userPaused = false;
		videoEnded = true;
		playerAvailable = true;
		video = document.createElement("video");
		Object.defineProperties(video, {
			paused: { get: () => false, configurable: true },
			ended: { get: () => videoEnded, configurable: true },
			currentTime: { get: () => 0, configurable: true },
			readyState: { get: () => 0, configurable: true },
			videoWidth: { get: () => 0, configurable: true },
			buffered: {
				get: () => ({
					length: 0,
					start: () => 0,
					end: () => 0,
				}),
				configurable: true,
			},
		});
		document.body.append(video);
		player = {
			getHTMLVideoElement: () => video,
			getBufferDuration: () => 0,
			isPaused: () => false,
		};
		g.__TTVAB_STATE__ = {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			CurrentAdChannel: null,
			CurrentAdMediaKey: null,
			LastAdEndedAt: 500000,
			LastAdEndedChannel: "testchannel",
			LastAdEndedMediaKey: "live:testchannel",
			LastAdEndedCycleStartedAt: 440000,
			ShouldResumeAfterAd: true,
			ShouldResumeAfterAdChannel: "testchannel",
			ShouldResumeAfterAdMediaKey: "live:testchannel",
			ShouldResumeAfterAdUntil: 515000,
			IsBufferFixEnabled: true,
			PlayerBufferingDelay: 600,
			LastAdRecoveryReloadAt: 0,
			LastAdRecoveryResumeAt: 0,
			LastPlayerReloadAt: 0,
			LastPlayerReloadAtByMediaKey: Object.create(null),
			AdRecoveryReloadCooldownMs: 30000,
			PlayerReloadDebounceMs: 1500,
			_AdRecoveryConsecutiveFailures: 0,
		};
		g._getPlayerAndState = () =>
			playerAvailable
				? {
						player,
						state: { props: { content: { type: "live" } } },
					}
				: { player: null, state: null };
		g._getPlayerCore = () => ({});
		g._doPlayerTask = (
			isPausePlay: boolean,
			isReload: boolean,
			options: Record<string, unknown> = {},
		) => {
			tasks.push({ isPausePlay, isReload, ...options });
			if (isReload) {
				T<(mediaKey: string, at: number) => void>("_recordPlayerReloadAt")(
					"live:testchannel",
					Date.now(),
				);
				(g.__TTVAB_STATE__ as Record<string, unknown>).LastPlayerReloadAt =
					Date.now();
			}
			return true;
		};
		g._scheduleResumeRetries = () => {};
		g._isNativeDocumentHidden = () => hidden;
		g._getActivePictureInPicturePlaybackContext = () => null;
		g._trackChannelWatchTime = () => {};
		g._hasPlayerBufferMonitorRelevantContext = () => true;
		g._shouldSuppressAutomaticPlaybackResume = () => false;
		g._hasUserPauseIntent = () => userPaused;
		g._isPlaybackRecoveryContextCurrent = () => true;
		g._restoreReattachedSuppressedPrimaryMedia = () => {};
		g._syncPreferredQualityGroupThrottled = () => {};
		expect(
			T<(channel: string, mediaKey: string, cycleStartedAt: number) => boolean>(
				"_startPostAdRecoveryTransaction",
			)("testchannel", "live:testchannel", 440000),
		).toBe(true);
	});

	afterEach(() => {
		T<(resetBufferState?: boolean) => void>("_stopPlayerBufferMonitor")(false);
		window.removeEventListener(
			"pagehide",
			g._flushWatchTimeOnPageExit as EventListener,
		);
		T<() => void>("_resetPostAdRecoveryTransaction")();
		video.remove();
		for (const name of replacedGlobals) g[name] = savedGlobals[name];
		g.__TTVAB_STATE__ = savedState;
		vi.useRealTimers();
	});

	it("keeps an ended all-zero replacement in bounded ad recovery", () => {
		T<() => void>("_monitorPlayerBuffering")();
		vi.advanceTimersByTime(10800);

		const reloadTasks = tasks.filter((task) => task.isReload === true);
		expect(reloadTasks).toEqual([
			expect.objectContaining({
				reason: "ad-recovery",
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
				mediaKey: "live:testchannel",
				cycleStartedAt: 440000,
			}),
		]);
		expect(tasks.some((task) => task.reason === "buffer-recovery")).toBe(false);
		expect(g._PostAdRecoveryTransactionState).toMatchObject({
			mediaKey: "live:testchannel",
			reloadRequestCount: 1,
			acceptedReloadCount: 1,
		});
	});

	it("clears hidden recovery immediately when the user explicitly pauses", () => {
		const transaction = g._PostAdRecoveryTransactionState as Record<
			string,
			unknown
		>;
		transaction.video = video;
		hidden = true;
		userPaused = true;

		T<() => void>("_monitorPlayerBuffering")();

		expect(transaction.mediaKey).toBeNull();
		expect(transaction.video).toBeNull();
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).ShouldResumeAfterAd,
		).toBe(false);
		expect(tasks).toEqual([]);
	});

	it("ends bounded recovery when a visible page player stays unmounted", () => {
		videoEnded = false;
		expect(
			T<
				(
					player: unknown,
					playerCore: unknown,
					video: unknown,
					channel: string,
					mediaKey: string,
					contentType: string,
				) => boolean
			>("_handlePendingPostAdRecovery")(
				player,
				{},
				video,
				"testchannel",
				"live:testchannel",
				"live",
			),
		).toBe(false);
		const transaction = g._PostAdRecoveryTransactionState as Record<
			string,
			unknown
		>;
		expect(transaction.video).toBe(video);
		playerAvailable = false;
		expect(
			T<
				(
					isPausePlay: boolean,
					isReload: boolean,
					options: Record<string, unknown>,
				) => boolean
			>("_rememberPendingPostAdRecoveryOperation")(false, true, {
				reason: "post-ad-native-restore",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: 440000,
				refreshAccessToken: false,
				newMediaPlayerInstance: true,
			}),
		).toBe(true);

		T<() => void>("_monitorPlayerBuffering")();
		vi.advanceTimersByTime(30600);

		expect(transaction.mediaKey).toBeNull();
		expect(transaction.video).toBeNull();
		expect(transaction.pendingOperation).toBeNull();
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).ShouldResumeAfterAd,
		).toBe(false);
		expect(tasks).toEqual([]);

		playerAvailable = true;
		vi.advanceTimersByTime(1800);
		expect(tasks).toEqual([]);
	});

	it("runs an exact queued native restore after a hidden player remounts", () => {
		const transaction = g._PostAdRecoveryTransactionState as Record<
			string,
			unknown
		>;
		hidden = true;
		playerAvailable = false;
		video.remove();
		expect(
			T<
				(
					isPausePlay: boolean,
					isReload: boolean,
					options: Record<string, unknown>,
				) => boolean
			>("_rememberPendingPostAdRecoveryOperation")(false, true, {
				reason: "post-ad-native-restore",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: 440000,
				refreshAccessToken: false,
				newMediaPlayerInstance: true,
			}),
		).toBe(true);

		T<() => void>("_monitorPlayerBuffering")();
		vi.advanceTimersByTime(30600);

		expect(transaction.mediaKey).toBe("live:testchannel");
		expect(transaction.video).toBeNull();
		expect(transaction.pendingOperation).not.toBeNull();
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).ShouldResumeAfterAd,
		).toBe(true);
		expect(tasks).toEqual([]);

		playerAvailable = true;
		vi.advanceTimersByTime(5400);

		expect(tasks).toEqual([
			expect.objectContaining({
				isReload: true,
				reason: "post-ad-native-restore",
				refreshAccessToken: false,
				newMediaPlayerInstance: true,
			}),
		]);
		expect(transaction.pendingOperation).toBeNull();
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

describe("_syncPagePlaybackVisibilityState", () => {
	const sync = () =>
		T<(forceHidden?: boolean) => boolean>("_syncPagePlaybackVisibilityState");
	let savedState: unknown;
	let savedHidden: unknown;
	let savedPipContext: unknown;
	let savedBroadcast: unknown;
	let hidden = true;
	let pipActive = false;
	let messages: Array<Record<string, unknown>> = [];

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(700000);
		savedState = g.__TTVAB_STATE__;
		savedHidden = g._isNativeDocumentHidden;
		savedPipContext = g._getActivePictureInPicturePlaybackContext;
		savedBroadcast = g._broadcastWorkers;
		hidden = true;
		pipActive = false;
		messages = [];
		g.__TTVAB_STATE__ = { PagePlaybackVisibleSinceAt: 0 };
		g._isNativeDocumentHidden = () => hidden;
		g._getActivePictureInPicturePlaybackContext = () =>
			pipActive ? { MediaKey: "live:testchannel" } : null;
		g._broadcastWorkers = (message: Record<string, unknown>) => {
			messages.push(message);
		};
	});

	afterEach(() => {
		g.__TTVAB_STATE__ = savedState;
		g._isNativeDocumentHidden = savedHidden;
		g._getActivePictureInPicturePlaybackContext = savedPipContext;
		g._broadcastWorkers = savedBroadcast;
		vi.useRealTimers();
	});

	it("broadcasts only real hidden and visible edges while treating pip as visible", () => {
		expect(sync()()).toBe(false);
		expect(messages).toEqual([]);

		hidden = false;
		expect(sync()()).toBe(true);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).PagePlaybackVisibleSinceAt,
		).toBe(700000);
		expect(messages).toEqual([
			{ key: "UpdatePagePlaybackVisibleSinceAt", value: 700000 },
		]);
		expect(sync()()).toBe(false);

		hidden = true;
		expect(sync()()).toBe(true);
		expect(messages.at(-1)).toEqual({
			key: "UpdatePagePlaybackVisibleSinceAt",
			value: 0,
		});

		pipActive = true;
		vi.setSystemTime(701000);
		expect(sync()()).toBe(true);
		expect(messages.at(-1)).toEqual({
			key: "UpdatePagePlaybackVisibleSinceAt",
			value: 701000,
		});

		pipActive = false;
		expect(sync()()).toBe(true);
		expect(messages.at(-1)).toEqual({
			key: "UpdatePagePlaybackVisibleSinceAt",
			value: 0,
		});
	});
});

describe("_isPlaybackPageUnfocused", () => {
	const unfocused = () => T<() => boolean>("_isPlaybackPageUnfocused");
	const environmental = () =>
		T<() => boolean>("_isUnfocusedPlaybackEnvironment");
	let savedHidden: unknown;
	let savedPipContext: unknown;
	let savedHasFocus: PropertyDescriptor | undefined;
	let hasFocus = false;

	beforeEach(() => {
		savedHidden = g._isNativeDocumentHidden;
		savedPipContext = g._getActivePictureInPicturePlaybackContext;
		savedHasFocus = Object.getOwnPropertyDescriptor(document, "hasFocus");
		g._isNativeDocumentHidden = () => false;
		g._getActivePictureInPicturePlaybackContext = () => null;
		hasFocus = false;
		Object.defineProperty(document, "hasFocus", {
			value: () => hasFocus,
			configurable: true,
		});
	});

	afterEach(() => {
		g._isNativeDocumentHidden = savedHidden;
		g._getActivePictureInPicturePlaybackContext = savedPipContext;
		if (savedHasFocus) {
			Object.defineProperty(document, "hasFocus", savedHasFocus);
		} else {
			delete (document as unknown as Record<string, unknown>).hasFocus;
		}
	});

	it("recognizes a blurred watch page", () => {
		expect(unfocused()()).toBe(true);
		hasFocus = true;
		expect(unfocused()()).toBe(false);
	});

	it("does not reinterpret Picture-in-Picture controls as page blur", () => {
		g._getActivePictureInPicturePlaybackContext = () => ({
			MediaKey: "live:testchannel",
		});
		expect(unfocused()()).toBe(false);
	});

	it("keeps control-free pauses environmental for the full unfocused period", () => {
		expect(environmental()()).toBe(true);
		hasFocus = true;
		expect(environmental()()).toBe(false);
	});
});

describe("_isPlaybackRecoveryContextCurrent (pip navigation)", () => {
	it("keeps scheduled recovery current for the active pip stream after navigation", () => {
		const pip = document.createElement("video");
		g.__TTVAB_STATE__ = {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
		};
		T<(element: HTMLVideoElement, context: Record<string, unknown>) => unknown>(
			"_setActivePictureInPicturePlaybackContext",
		)(pip, {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		window.history.replaceState(null, "", "/otherchannel");
		try {
			expect(
				T<(channel: string, mediaKey: string) => boolean>(
					"_isPlaybackRecoveryContextCurrent",
				)("testchannel", "live:testchannel"),
			).toBe(true);
		} finally {
			T<() => unknown>("_clearActivePictureInPicturePlaybackContext")();
			window.history.replaceState(null, "", "/testchannel");
		}
	});

	it("keeps a manual pip pause authoritative after the page monitor moves on", () => {
		const pip = document.createElement("video");
		const previousResolveMediaKey = g._resolvePlayerMediaKey;
		g._resolvePlayerMediaKey = (
			channel: string | null,
			mediaKey: string | null,
		) =>
			T<(value: unknown) => string | null>("_normalizeMediaKey")(mediaKey) ||
			T<(type: string, channel: string | null) => string | null>(
				"_buildMediaKey",
			)("live", channel);
		Object.defineProperty(pip, "ended", {
			value: false,
			configurable: true,
		});
		const intentState = g._PlaybackIntentState as Record<string, unknown>;
		intentState.lastProgrammaticPauseAt = Date.now() - 10000;
		intentState.lastProgrammaticPlayAt = Date.now() - 10000;
		intentState.userPausedMediaKey = null;
		intentState.suppressedPauseMediaKey = null;
		intentState.suppressedPauseUntil = 0;
		g.__TTVAB_STATE__ = {
			PageMediaType: "live",
			PageChannel: "otherstreamer",
			PageMediaKey: "live:otherstreamer",
			CurrentAdChannel: null,
			CurrentAdMediaKey: null,
			ShouldResumeAfterAd: false,
			ShouldResumeAfterAdChannel: null,
			ShouldResumeAfterAdMediaKey: null,
		};
		T<(element: HTMLVideoElement, context: Record<string, unknown>) => unknown>(
			"_setActivePictureInPicturePlaybackContext",
		)(pip, {
			MediaType: "live",
			ChannelName: "pipstreamer",
			MediaKey: "live:pipstreamer",
		});
		try {
			(intentState.pictureInPicturePauseListener as () => void)();
			expect(intentState.userPausedMediaKey).toBe("live:pipstreamer");
			expect(
				T<(channel: string, mediaKey: string) => boolean>(
					"_hasUserPauseIntent",
				)("pipstreamer", "live:pipstreamer"),
			).toBe(true);
			(intentState.pictureInPicturePlayListener as () => void)();
			expect(
				T<(channel: string, mediaKey: string) => boolean>(
					"_hasUserPauseIntent",
				)("pipstreamer", "live:pipstreamer"),
			).toBe(false);
		} finally {
			T<() => unknown>("_clearActivePictureInPicturePlaybackContext")();
			g._resolvePlayerMediaKey = previousResolveMediaKey;
		}
	});

	it("attributes an operating-system media pause to off-route pip playback", () => {
		const pip = document.createElement("video");
		const savedMediaSession = Object.getOwnPropertyDescriptor(
			navigator,
			"mediaSession",
		);
		const savedPatched = window.__TTVAB_MEDIA_SESSION_PLAYBACK_INTENT_PATCHED__;
		let pauseHandler: ((details: { action: string }) => void) | null = null;
		let playHandler: ((details: { action: string }) => void) | null = null;
		const mediaSession = {
			setActionHandler(
				action: string,
				handler: ((details: { action: string }) => void) | null,
			) {
				if (action === "pause") pauseHandler = handler;
				if (action === "play") playHandler = handler;
			},
		};
		Object.defineProperty(navigator, "mediaSession", {
			value: mediaSession,
			configurable: true,
		});
		window.__TTVAB_MEDIA_SESSION_PLAYBACK_INTENT_PATCHED__ = false;
		g.__TTVAB_STATE__ = {
			PageMediaType: "live",
			PageChannel: "pagechannel",
			PageMediaKey: "live:pagechannel",
			CurrentAdChannel: null,
			CurrentAdMediaKey: null,
		};
		const intentState = g._PlaybackIntentState as Record<string, unknown>;
		intentState.userPausedMediaKey = null;

		T<(element: HTMLVideoElement, context: Record<string, unknown>) => unknown>(
			"_setActivePictureInPicturePlaybackContext",
		)(pip, {
			MediaType: "live",
			ChannelName: "pipstreamer",
			MediaKey: "live:pipstreamer",
		});
		try {
			T<() => boolean>("_hookMediaSessionPlaybackIntent")();
			mediaSession.setActionHandler("pause", () => {});
			mediaSession.setActionHandler("play", () => {});
			if (pauseHandler) pauseHandler({ action: "pause" });
			expect(intentState.userPausedMediaKey).toBe("live:pipstreamer");
			expect(intentState.userPausedHadExplicitInteraction).toBe(true);
			if (playHandler) playHandler({ action: "play" });
			expect(intentState.userPausedMediaKey).toBeNull();
		} finally {
			T<() => unknown>("_clearActivePictureInPicturePlaybackContext")();
			if (savedMediaSession) {
				Object.defineProperty(navigator, "mediaSession", savedMediaSession);
			} else {
				delete (navigator as unknown as Record<string, unknown>).mediaSession;
			}
			window.__TTVAB_MEDIA_SESSION_PLAYBACK_INTENT_PATCHED__ = savedPatched;
		}
	});
});

describe("_doPlayerTask (pip reload policy)", () => {
	const cycleStartedAt = 100;
	const handoffId = (label: string) =>
		`live:testchannel:${cycleStartedAt}:1000:1:${label}`;
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
		"_getCodecHandoffCycleStartedAt",
		"_getCurrentAdBreakStartedAt",
		"_isCodecHandoffCycleCurrent",
		"__TTVAB_STATE__",
	];
	let saved: Record<string, unknown> = {};
	let pipElement: HTMLVideoElement | null = null;
	let setSrcCalls: unknown[] = [];
	let pauseCalls: number;
	let resumeRetryCalls: unknown[][];
	let workerMessages: unknown[];

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
		resumeRetryCalls = [];
		workerMessages = [];
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
		g._scheduleResumeRetries = (...args: unknown[]) => {
			resumeRetryCalls.push(args);
		};
		g._schedulePlaybackRecoveryTimeout = () => null;
		g._broadcastWorkers = (message: unknown) => {
			workerMessages.push(message);
		};
		g._isPlaybackRecoveryContextCurrent = () => true;
		g._getCodecHandoffCycleStartedAt = (handoffId: unknown) => {
			if (typeof handoffId !== "string" || !handoffId) return 0;
			const parts = handoffId.split(":");
			return Math.max(0, Number(parts[parts.length - 4]) || 0);
		};
		g._getCurrentAdBreakStartedAt = (mediaKey: unknown) =>
			Math.max(
				0,
				Number(
					(
						(g.__TTVAB_STATE__ as Record<string, unknown>)
							?.AdPodProgressByMediaKey as
							| Record<string, { cycleStartedAt?: number }>
							| undefined
					)?.[String(mediaKey)]?.cycleStartedAt,
				) || 0,
			);
		g._isCodecHandoffCycleCurrent = (
			mediaKey: unknown,
			cycleStartedAt: unknown,
		) =>
			String(
				(g.__TTVAB_STATE__ as Record<string, unknown>).CurrentAdMediaKey,
			) === String(mediaKey) &&
			(g._getCurrentAdBreakStartedAt as (key: unknown) => number)(mediaKey) ===
				Math.max(0, Number(cycleStartedAt) || 0);
		g.__TTVAB_STATE__ = {
			PageMediaType: "live",
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			PageVodID: null,
			LastAdEndedAt: Date.now(),
			LastAdEndedChannel: "testchannel",
			LastAdEndedMediaKey: "live:testchannel",
			LastAdEndedCycleStartedAt: 100,
			ShouldResumeAfterAd: true,
			ShouldResumeAfterAdChannel: "testchannel",
			ShouldResumeAfterAdMediaKey: "live:testchannel",
			ShouldResumeAfterAdUntil: Date.now() + 60000,
			LastPlayerReloadAt: 0,
			PlayerReloadDebounceMs: 1500,
			CurrentAdMediaKey: "live:testchannel",
			CurrentAdChannel: "testchannel",
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 100 },
			},
		};
		T<() => void>("_clearRecordedUserPauseIntent")();
		T<() => void>("_resetPostAdRecoveryTransaction")();
		T<
			(element: HTMLVideoElement, context?: Record<string, unknown>) => unknown
		>("_setActivePictureInPicturePlaybackContext")(pipElement, {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
	});

	afterEach(() => {
		T<() => void>("_clearRecordedUserPauseIntent")();
		T<() => void>("_resetPostAdRecoveryTransaction")();
		Object.defineProperty(document, "pictureInPictureElement", {
			value: null,
			configurable: true,
		});
		T<() => unknown>("_clearActivePictureInPicturePlaybackContext")();
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
		expect(resumeRetryCalls).toContainEqual([
			"testchannel",
			"live:testchannel",
			[50, 180, 500, 1100],
			{ cycleStartedAt: 100 },
		]);
	});

	it("still reloads immediately under pip for manual, codec handoff, and worker recovery", () => {
		const codecHandoffId = handoffId("pip");
		task()(false, true, {
			reason: "manual",
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
		});
		expect(setSrcCalls).toHaveLength(1);

		(g.__TTVAB_STATE__ as Record<string, unknown>).LastPlayerReloadAt = 0;
		task()(false, true, {
			reason: "codec-handoff",
			handoffId: codecHandoffId,
			channel: "testchannel",
			mediaKey: "live:testchannel",
			cycleStartedAt,
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
		});
		expect(setSrcCalls).toHaveLength(2);
		expect(workerMessages.at(-1)).toMatchObject({
			key: "TriggeredPlayerReload",
			value: {
				reason: "codec-handoff",
				handoffId: codecHandoffId,
				mediaKey: "live:testchannel",
			},
		});
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).ActiveCodecHandoffId,
		).toBe(codecHandoffId);

		(g.__TTVAB_STATE__ as Record<string, unknown>).LastPlayerReloadAt = 0;
		task()(false, true, {
			reason: "worker-recovery",
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
		});
		expect(setSrcCalls).toHaveLength(3);
	});

	it("rebuilds post-ad playback without replacing the verified token session", () => {
		pipElement = null;
		T<() => unknown>("_clearActivePictureInPicturePlaybackContext")();
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdMediaKey = null;
		state.CurrentAdChannel = null;
		const baselineVideo = document.createElement("video");
		const playerAndState = (
			g._getPlayerAndState as () => {
				player: { getHTMLVideoElement: () => HTMLVideoElement | null };
				state: unknown;
			}
		)();
		playerAndState.player.getHTMLVideoElement = () => baselineVideo;
		const capturePreference = vi.fn(() => null);
		g._capturePlayerPreferenceSnapshot = capturePreference;

		const result = task()(false, true, {
			reason: "post-ad-native-restore",
			refreshAccessToken: false,
			newMediaPlayerInstance: true,
			channel: "testchannel",
			mediaKey: "live:testchannel",
			cycleStartedAt: 100,
		});

		expect(result).toBe(true);
		expect(setSrcCalls).toEqual([
			{
				isNewMediaPlayerInstance: true,
				refreshAccessToken: false,
			},
		]);
		expect(capturePreference).toHaveBeenCalledWith(
			expect.anything(),
			baselineVideo,
			expect.objectContaining({ preserveConfiguredQuality: true }),
		);
		expect(
			(
				g._PostAdRecoveryTransactionState as {
					requiredReplacementVideo: WeakRef<HTMLMediaElement> | null;
				}
			).requiredReplacementVideo?.deref(),
		).toBe(baselineVideo);
	});

	it("rejects stale, no-intent, and user-paused terminal restore tasks", () => {
		pipElement = null;
		T<() => unknown>("_clearActivePictureInPicturePlaybackContext")();
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdMediaKey = null;
		state.CurrentAdChannel = null;
		const options = {
			reason: "post-ad-native-restore",
			refreshAccessToken: false,
			newMediaPlayerInstance: true,
			channel: "testchannel",
			mediaKey: "live:testchannel",
			cycleStartedAt: 100,
		};

		state.LastAdEndedCycleStartedAt = 200;
		expect(task()(false, true, options)).toBe(false);

		state.LastAdEndedCycleStartedAt = 100;
		state.ShouldResumeAfterAd = false;
		expect(task()(false, true, options)).toBe(false);

		state.ShouldResumeAfterAd = true;
		(g._PlaybackIntentState as Record<string, unknown>).userPausedMediaKey =
			"live:testchannel";
		expect(task()(false, true, options)).toBe(false);
		expect(setSrcCalls).toEqual([]);
	});

	it("bypasses the generic reload debounce for an exact codec handoff", () => {
		pipElement = null;
		(g.__TTVAB_STATE__ as Record<string, unknown>).LastPlayerReloadAt =
			Date.now();

		const result = task()(false, true, {
			reason: "codec-handoff",
			handoffId: handoffId("debounce"),
			channel: "testchannel",
			mediaKey: "live:testchannel",
			cycleStartedAt,
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
		});

		expect(result).toBe(true);
		expect(setSrcCalls).toHaveLength(1);
	});

	it.each([
		["no active context", null, null, "live:testchannel"],
		["channel-only context", null, "testchannel", "live:testchannel"],
		[
			"foreign media context",
			"live:otherchannel",
			"testchannel",
			"live:testchannel",
		],
		["missing explicit media key", "live:testchannel", "testchannel", null],
		[
			"conflicting channel",
			"live:testchannel",
			"otherchannel",
			"live:testchannel",
		],
	])(
		"rejects a codec handoff with %s",
		(_label, currentAdMediaKey, currentAdChannel, mediaKey) => {
			pipElement = null;
			(g.__TTVAB_STATE__ as Record<string, unknown>).CurrentAdMediaKey =
				currentAdMediaKey;
			(g.__TTVAB_STATE__ as Record<string, unknown>).CurrentAdChannel =
				currentAdChannel;

			const result = task()(false, true, {
				reason: "codec-handoff",
				handoffId: handoffId("invalid-context"),
				channel: "testchannel",
				mediaKey,
				cycleStartedAt,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			});

			expect(result).toBe(false);
			expect(setSrcCalls).toEqual([]);
			expect(workerMessages).toEqual([]);
			expect(
				(g.__TTVAB_STATE__ as Record<string, unknown>).ActiveCodecHandoffId,
			).toBeUndefined();
		},
	);

	it("pre-arms workers with the exact codec handoff before setSrc", () => {
		pipElement = null;
		const codecHandoffId = handoffId("pre-arm");
		const sequence: string[] = [];
		g._broadcastWorkers = (message: unknown) => {
			workerMessages.push(message);
			sequence.push(String((message as Record<string, unknown>).key));
		};
		g._getPlayerAndState = () => ({
			player: {
				getHTMLVideoElement: () => null,
				play: () => undefined,
			},
			state: {
				props: { content: { type: "live" } },
				setSrc: () => {
					sequence.push("setSrc");
				},
			},
		});

		expect(
			task()(false, true, {
				reason: "codec-handoff",
				handoffId: codecHandoffId,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			}),
		).toBe(true);
		expect(sequence).toEqual([
			"UpdateCodecHandoffContext",
			"setSrc",
			"TriggeredPlayerReload",
		]);
		expect(workerMessages[0]).toMatchObject({
			key: "UpdateCodecHandoffContext",
			targetMediaKey: "live:testchannel",
			value: {
				handoffId: codecHandoffId,
				mediaKey: "live:testchannel",
			},
		});
	});

	it("coalesces distinct same-cycle worker handoff ids onto one player transaction", () => {
		pipElement = null;
		const firstHandoffId = handoffId("worker-a");
		const secondHandoffId = handoffId("worker-b");

		expect(
			task()(false, true, {
				reason: "codec-handoff",
				handoffId: firstHandoffId,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			}),
		).toBe(true);
		expect(
			task()(false, true, {
				reason: "codec-handoff",
				handoffId: secondHandoffId,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			}),
		).toBe(true);

		expect(setSrcCalls).toHaveLength(1);
		expect(workerMessages.at(-1)).toEqual([
			expect.objectContaining({
				key: "UpdateCodecHandoffContext",
				targetMediaKey: "live:testchannel",
				value: expect.objectContaining({
					handoffId: firstHandoffId,
				}),
			}),
			expect.objectContaining({
				key: "TriggeredPlayerReload",
				targetMediaKey: "live:testchannel",
				value: expect.objectContaining({
					handoffId: firstHandoffId,
				}),
			}),
		]);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).ActiveCodecHandoffId,
		).toBe(firstHandoffId);
	});

	it("rejects cycle A after same-media cycle B starts and gives cycle B fresh ownership", () => {
		pipElement = null;
		const cycleA = 100;
		const cycleB = 200;
		const handoffA = `live:testchannel:${cycleA}:1000:1:cycle-a`;
		const staleDistinctHandoffA = `live:testchannel:${cycleA}:1500:2:cycle-a-delayed`;
		const handoffB = `live:testchannel:${cycleB}:2000:1:cycle-b`;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const podProgress = state.AdPodProgressByMediaKey as Record<
			string,
			{ cycleStartedAt: number }
		>;

		expect(
			task()(false, true, {
				reason: "codec-handoff",
				handoffId: handoffA,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: cycleA,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			}),
		).toBe(true);
		expect(setSrcCalls).toHaveLength(1);
		expect(state.ActiveCodecHandoffId).toBe(handoffA);

		const messagesAfterCycleA = workerMessages.length;
		podProgress["live:testchannel"].cycleStartedAt = cycleB;

		expect(
			task()(false, true, {
				reason: "codec-handoff",
				handoffId: staleDistinctHandoffA,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: cycleA,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			}),
		).toBe(false);
		expect(setSrcCalls).toHaveLength(1);
		expect(workerMessages).toHaveLength(messagesAfterCycleA);

		expect(
			task()(false, true, {
				reason: "codec-handoff",
				handoffId: handoffB,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: cycleB,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			}),
		).toBe(true);
		expect(setSrcCalls).toHaveLength(2);
		expect(state.ActiveCodecHandoffId).toBe(handoffB);
		expect(workerMessages.at(-2)).toMatchObject({
			key: "UpdateCodecHandoffContext",
			value: {
				handoffId: handoffB,
				mediaKey: "live:testchannel",
				cycleStartedAt: cycleB,
			},
		});
		expect(workerMessages.at(-1)).toMatchObject({
			key: "TriggeredPlayerReload",
			value: {
				handoffId: handoffB,
				mediaKey: "live:testchannel",
				cycleStartedAt: cycleB,
			},
		});
	});

	it("supersedes an active handoff when fatal media recovery requires a real retry", () => {
		pipElement = null;
		const firstHandoffId = handoffId("first");
		const fatalHandoffId = handoffId("fatal");

		expect(
			task()(false, true, {
				reason: "codec-handoff",
				handoffId: firstHandoffId,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			}),
		).toBe(true);
		expect(
			task()(false, true, {
				reason: "codec-handoff",
				handoffId: fatalHandoffId,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
				replaceCodecHandoff: true,
			}),
		).toBe(true);

		expect(setSrcCalls).toHaveLength(2);
		expect(workerMessages.at(-1)).toMatchObject({
			key: "TriggeredPlayerReload",
			value: {
				handoffId: fatalHandoffId,
				mediaKey: "live:testchannel",
			},
		});
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).ActiveCodecHandoffId,
		).toBe(fatalHandoffId);
	});

	it("rolls back main-thread codec ownership when setSrc throws", () => {
		pipElement = null;
		const codecHandoffId = handoffId("set-src-failure");
		g._getPlayerAndState = () => ({
			player: {
				getHTMLVideoElement: () => null,
				play: () => undefined,
			},
			state: {
				props: { content: { type: "live" } },
				setSrc: () => {
					throw new Error("setSrc failed");
				},
			},
		});

		expect(() =>
			task()(false, true, {
				reason: "codec-handoff",
				handoffId: codecHandoffId,
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			}),
		).toThrow("setSrc failed");
		expect(workerMessages).toEqual([
			expect.objectContaining({
				key: "UpdateCodecHandoffContext",
				value: expect.objectContaining({
					handoffId: codecHandoffId,
				}),
			}),
			expect.objectContaining({
				key: "UpdateCodecHandoffContext",
				value: expect.objectContaining({
					clearHandoffId: codecHandoffId,
				}),
			}),
		]);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).ActiveCodecHandoffId,
		).toBe(null);
	});

	it("does not acknowledge a codec reload without its exact handoff id", () => {
		pipElement = null;

		const result = task()(false, true, {
			reason: "codec-handoff",
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
		});

		expect(result).toBe(false);
		expect(setSrcCalls).toEqual([]);
		expect(workerMessages).toEqual([]);
	});

	it("does not reload the page player for a pip codec handoff after navigation", () => {
		window.history.replaceState(null, "", "/otherchannel");
		try {
			const result = task()(false, true, {
				reason: "codec-handoff",
				handoffId: handoffId("stale-pip"),
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			});

			expect(result).toBe(false);
			expect(setSrcCalls).toEqual([]);
			expect(workerMessages).toEqual([]);
		} finally {
			window.history.replaceState(null, "", "/testchannel");
		}
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
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdMediaKey = null;
		state.CurrentAdChannel = null;
		state.LastAdEndedAt = Date.now();
		state.LastAdEndedMediaKey = "live:testchannel";
		state.LastAdEndedCycleStartedAt = 100;
		pip.dispatchEvent(new Event("leavepictureinpicture"));

		expect(setSrcCalls).toHaveLength(1);
	});

	it("keeps an exact native restore deferred through a long pip session", () => {
		const pip = pipElement as HTMLVideoElement;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdMediaKey = null;
		state.CurrentAdChannel = null;
		state.LastAdEndedAt = Date.now();
		state.LastAdEndedMediaKey = "live:testchannel";
		state.LastAdEndedCycleStartedAt = 100;
		const startedAt = Date.now();
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(startedAt);

		try {
			expect(
				task()(false, true, {
					reason: "post-ad-native-restore",
					channel: "testchannel",
					mediaKey: "live:testchannel",
					cycleStartedAt: 100,
					refreshAccessToken: false,
					newMediaPlayerInstance: true,
				}),
			).toBe(true);
			expect(setSrcCalls).toEqual([]);

			nowSpy.mockReturnValue(startedAt + 121000);
			pipElement = null;
			pip.dispatchEvent(new Event("leavepictureinpicture"));

			expect(setSrcCalls).toEqual([
				{
					isNewMediaPlayerInstance: true,
					refreshAccessToken: false,
				},
			]);
			expect(workerMessages.at(-1)).toMatchObject({
				key: "TriggeredPlayerReload",
				value: {
					reason: "post-ad-native-restore",
					mediaKey: "live:testchannel",
					cycleStartedAt: 100,
				},
			});
		} finally {
			nowSpy.mockRestore();
		}
	});

	it("drops a same-media cycle-one deferred pip reload and accepts cycle two", () => {
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdMediaKey = null;
		state.CurrentAdChannel = null;
		state.LastAdEndedAt = Date.now();
		state.LastAdEndedMediaKey = "live:testchannel";
		state.LastAdEndedCycleStartedAt = 100;
		const cycleOnePip = pipElement as HTMLVideoElement;
		task()(false, true, {
			reason: "post-ad-native-restore",
			channel: "testchannel",
			mediaKey: "live:testchannel",
			cycleStartedAt: 100,
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
		});
		state.LastAdEndedAt = Date.now();
		state.LastAdEndedMediaKey = "live:testchannel";
		state.LastAdEndedCycleStartedAt = 200;
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 200 },
		};
		pipElement = null;
		cycleOnePip.dispatchEvent(new Event("leavepictureinpicture"));
		expect(setSrcCalls).toEqual([]);

		const cycleTwoPip = document.createElement("video");
		pipElement = cycleTwoPip;
		T<
			(element: HTMLVideoElement, context?: Record<string, unknown>) => unknown
		>("_setActivePictureInPicturePlaybackContext")(cycleTwoPip, {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		task()(false, true, {
			reason: "post-ad-native-restore",
			channel: "testchannel",
			mediaKey: "live:testchannel",
			cycleStartedAt: 200,
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
		});
		state.CurrentAdMediaKey = null;
		state.CurrentAdChannel = null;
		pipElement = null;
		cycleTwoPip.dispatchEvent(new Event("leavepictureinpicture"));

		expect(setSrcCalls).toHaveLength(1);
		expect(workerMessages.at(-1)).toMatchObject({
			key: "TriggeredPlayerReload",
			value: {
				reason: "post-ad-native-restore",
				mediaKey: "live:testchannel",
				cycleStartedAt: 200,
			},
		});
	});

	it("cycle-fences the delayed pause-play callback", async () => {
		pipElement = null;
		T<() => unknown>("_clearActivePictureInPicturePlaybackContext")();
		const play = vi.fn(() => true);
		g._playPlaybackTarget = play;
		g._schedulePlaybackRecoveryTimeout = saved._schedulePlaybackRecoveryTimeout;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdMediaKey = null;
		state.CurrentAdChannel = null;
		state.LastAdEndedAt = Date.now();
		state.LastAdEndedMediaKey = "live:testchannel";
		state.LastAdEndedCycleStartedAt = 100;

		try {
			expect(
				task()(true, false, {
					reason: "post-ad-native-restore",
					channel: "testchannel",
					mediaKey: "live:testchannel",
					cycleStartedAt: 100,
				}),
			).toBe(true);
			state.LastAdEndedAt = Date.now();
			state.LastAdEndedCycleStartedAt = 200;
			await new Promise((resolve) => setTimeout(resolve, 70));
			expect(play).not.toHaveBeenCalled();

			expect(
				task()(true, false, {
					reason: "post-ad-native-restore",
					channel: "testchannel",
					mediaKey: "live:testchannel",
					cycleStartedAt: 200,
				}),
			).toBe(true);
			const pendingEntries = [
				...(
					g._PlaybackRecoveryTimeoutState as {
						timeouts: Set<Record<string, unknown>>;
					}
				).timeouts,
			];
			expect(pendingEntries).toHaveLength(1);
			expect(pendingEntries[0]).toMatchObject({
				mediaKey: "live:testchannel",
				cycleStartedAt: 200,
			});
			await new Promise((resolve) => setTimeout(resolve, 70));
			expect(play).toHaveBeenCalledTimes(1);
		} finally {
			T<() => void>("_clearPlaybackRecoveryTimeouts")();
		}
	});

	it("always includes lifecycle ownership in non-codec reload acknowledgements", () => {
		pipElement = null;
		T<() => unknown>("_clearActivePictureInPicturePlaybackContext")();
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdMediaKey = null;
		state.CurrentAdChannel = null;
		state.LastAdEndedAt = Date.now();
		state.LastAdEndedMediaKey = "live:testchannel";
		state.LastAdEndedCycleStartedAt = 200;

		expect(
			task()(false, true, {
				reason: "post-ad-native-restore",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: 200,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			}),
		).toBe(true);
		expect(workerMessages.at(-1)).toMatchObject({
			key: "TriggeredPlayerReload",
			value: {
				reason: "post-ad-native-restore",
				mediaKey: "live:testchannel",
				cycleStartedAt: 200,
			},
		});
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

describe("_scheduleResumeRetries lifecycle ownership", () => {
	it("drops cycle-one retries after cycle two starts and runs matching cycle-two retries", async () => {
		const schedule = T<
			(
				channel: string,
				mediaKey: string,
				delays: number[],
				options: Record<string, unknown>,
			) => void
		>("_scheduleResumeRetries");
		const previousResume = g._resumeActivePlayerIfPaused;
		const previousRecoveryContext = g._isPlaybackRecoveryContextCurrent;
		const previousState = g.__TTVAB_STATE__;
		const resume = vi.fn(() => true);
		g._resumeActivePlayerIfPaused = resume;
		g._isPlaybackRecoveryContextCurrent = () => true;
		g.__TTVAB_STATE__ = {
			PageChannel: "testchannel",
			PageMediaKey: "live:testchannel",
			CurrentAdMediaKey: "live:testchannel",
			CurrentAdChannel: "testchannel",
			AdPodProgressByMediaKey: {
				"live:testchannel": { cycleStartedAt: 100 },
			},
		};

		try {
			schedule("testchannel", "live:testchannel", [5, 10], {
				cycleStartedAt: 100,
			});
			(
				(g.__TTVAB_STATE__ as Record<string, unknown>)
					.AdPodProgressByMediaKey as Record<string, { cycleStartedAt: number }>
			)["live:testchannel"].cycleStartedAt = 200;
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(resume).not.toHaveBeenCalled();

			schedule("testchannel", "live:testchannel", [5, 10], {
				cycleStartedAt: 200,
			});
			const pendingEntries = [
				...(
					g._PlaybackRecoveryTimeoutState as {
						timeouts: Set<Record<string, unknown>>;
					}
				).timeouts,
			];
			expect(pendingEntries).toHaveLength(2);
			expect(pendingEntries).toEqual([
				expect.objectContaining({ cycleStartedAt: 200 }),
				expect.objectContaining({ cycleStartedAt: 200 }),
			]);
			expect(
				T<(mediaKey: string, cycleStartedAt: number) => boolean>(
					"_isPlayerLifecycleCycleCurrent",
				)("live:testchannel", 200),
			).toBe(true);
			expect(
				T<(channel: string, mediaKey: string) => boolean>(
					"_isPlaybackRecoveryContextCurrent",
				)("testchannel", "live:testchannel"),
			).toBe(true);
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(resume).toHaveBeenCalledTimes(2);
		} finally {
			T<() => void>("_clearPlaybackRecoveryTimeouts")();
			g._resumeActivePlayerIfPaused = previousResume;
			g._isPlaybackRecoveryContextCurrent = previousRecoveryContext;
			g.__TTVAB_STATE__ = previousState;
		}
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

	it("keeps exact ad resume authorization for pip but clears it for popout", () => {
		const begin = T<
			(
				descriptor: Record<string, unknown>,
				options: Record<string, unknown>,
			) => boolean
		>("_beginSecondaryPlayerHandoff");
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const armResume = () => {
			Object.assign(state, {
				ShouldResumeAfterAd: true,
				ShouldResumeAfterAdChannel: "chan",
				ShouldResumeAfterAdMediaKey: "live:chan",
				ShouldResumeAfterAdUntil: Date.now() + 15000,
			});
		};

		armResume();
		expect(
			begin(
				{ kind: "pip", channel: "chan", mediaKey: "live:chan" },
				{ pauseSource: false, sourceWasPlaying: false },
			),
		).toBe(true);
		expect(state.ShouldResumeAfterAd).toBe(true);

		clear()();
		armResume();
		expect(
			begin(
				{ kind: "popout", channel: "chan", mediaKey: "live:chan" },
				{ pauseSource: false, sourceWasPlaying: false },
			),
		).toBe(true);
		expect(state.ShouldResumeAfterAd).toBe(false);
	});

	it("still suppresses during a popout handoff", () => {
		expect(mark()("popout", "chan", "live:chan", 60000, false)).toBe(true);
		expect(suppress()("chan", "live:chan")).toBe(true);
	});

	it("does not suppress when no handoff is active", () => {
		expect(suppress()("chan", "live:chan")).toBe(false);
	});
});

describe("_monitorSecondaryPlayerWindowClose", () => {
	const mark = () =>
		T<
			(
				kind: string,
				channel: string,
				mediaKey: string,
				durationMs: number,
				sourceWasPlaying: boolean,
			) => boolean
		>("_markSecondaryPlayerHandoff");
	const monitor = () =>
		T<
			(
				openedWindow: { closed: boolean },
				descriptor: Record<string, unknown>,
				sourceWasPlaying: boolean,
			) => boolean
		>("_monitorSecondaryPlayerWindowClose");
	let savedResolveMediaKey: unknown;
	let savedSchedule: unknown;
	let savedResume: unknown;
	let resumeCalls: unknown[][];

	beforeEach(() => {
		vi.useFakeTimers();
		savedResolveMediaKey = g._resolvePlayerMediaKey;
		savedSchedule = g._schedulePlaybackRecoveryTimeout;
		savedResume = g._resumePrimaryPlaybackIfPaused;
		resumeCalls = [];
		g._resolvePlayerMediaKey = (
			channel: string | null,
			mediaKey: string | null,
		) => mediaKey || (channel ? `live:${channel}` : null);
		g._schedulePlaybackRecoveryTimeout = (callback: () => void) => {
			callback();
			return 1;
		};
		g._resumePrimaryPlaybackIfPaused = (...args: unknown[]) => {
			resumeCalls.push(args);
			return true;
		};
		const intentState = g._PlaybackIntentState as Record<string, unknown>;
		intentState.userPausedMediaKey = null;
		T<() => void>("_clearSecondaryPlayerHandoff")();
	});

	afterEach(() => {
		T<() => void>("_clearSecondaryPlayerHandoff")();
		g._resolvePlayerMediaKey = savedResolveMediaKey;
		g._schedulePlaybackRecoveryTimeout = savedSchedule;
		g._resumePrimaryPlaybackIfPaused = savedResume;
		vi.useRealTimers();
	});

	it("clears the popout handoff and resumes a source that had been playing", () => {
		const openedWindow = { closed: false };
		const descriptor = {
			kind: "popout",
			channel: "chan",
			mediaKey: "live:chan",
		};
		mark()("popout", "chan", "live:chan", 60000, true);
		expect(monitor()(openedWindow, descriptor, true)).toBe(true);

		openedWindow.closed = true;
		vi.advanceTimersByTime(500);

		expect(resumeCalls).toEqual([
			["chan", "live:chan"],
			["chan", "live:chan"],
			["chan", "live:chan"],
		]);
		expect(
			(g._PlaybackIntentState as Record<string, unknown>)
				.secondaryPlayerHandoffKind,
		).toBeNull();
		expect(
			(g._PlaybackIntentState as Record<string, unknown>)
				.secondaryPlayerCloseMonitorId,
		).toBeNull();
	});

	it("does not resume a previously paused or explicitly user-paused source", () => {
		const descriptor = {
			kind: "popout",
			channel: "chan",
			mediaKey: "live:chan",
		};
		const alreadyPausedWindow = { closed: false };
		mark()("popout", "chan", "live:chan", 60000, false);
		monitor()(alreadyPausedWindow, descriptor, false);
		alreadyPausedWindow.closed = true;
		vi.advanceTimersByTime(500);

		const userPausedWindow = { closed: false };
		mark()("popout", "chan", "live:chan", 60000, true);
		(g._PlaybackIntentState as Record<string, unknown>).userPausedMediaKey =
			"live:chan";
		monitor()(userPausedWindow, descriptor, true);
		userPausedWindow.closed = true;
		vi.advanceTimersByTime(500);

		expect(resumeCalls).toEqual([]);
	});

	it("waits for every tracked popout to close before resuming the source", () => {
		const descriptor = {
			kind: "popout",
			channel: "chan",
			mediaKey: "live:chan",
		};
		const firstWindow = { closed: false };
		const secondWindow = { closed: false };
		mark()("popout", "chan", "live:chan", 60000, true);
		monitor()(firstWindow, descriptor, true);
		mark()("popout", "chan", "live:chan", 60000, false);
		monitor()(secondWindow, descriptor, false);

		firstWindow.closed = true;
		vi.advanceTimersByTime(500);
		expect(resumeCalls).toEqual([]);
		expect(
			(g._PlaybackIntentState as Record<string, unknown>)
				.secondaryPlayerHandoffKind,
		).toBe("popout");

		secondWindow.closed = true;
		vi.advanceTimersByTime(500);
		expect(resumeCalls).toHaveLength(3);
	});

	it("keeps monitoring a popout past the 45-minute handoff deadline", () => {
		const descriptor = {
			kind: "popout",
			channel: "chan",
			mediaKey: "live:chan",
		};
		const openedWindow = { closed: false };
		mark()("popout", "chan", "live:chan", 2_700_000, true);
		monitor()(openedWindow, descriptor, true);

		vi.advanceTimersByTime(2_700_500);
		expect(resumeCalls).toEqual([]);
		expect(
			(g._PlaybackIntentState as Record<string, unknown>)
				.secondaryPlayerHandoffKind,
		).toBe("popout");

		openedWindow.closed = true;
		vi.advanceTimersByTime(500);
		expect(resumeCalls).toHaveLength(3);
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

	it("preserves an explicit stored quality during automatic recovery", () => {
		localStorage.setItem(
			"video-quality",
			JSON.stringify({ default: "1080p60" }),
		);
		const snapshot = capture()(
			{ state: { quality: { group: "360p" } } },
			null,
			{ preserveConfiguredQuality: true },
		);
		expect(snapshot?.["video-quality"]).toBe(
			JSON.stringify({ default: "1080p60" }),
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

describe("_restorePlayerPreferenceSnapshot (multi-tab preference ownership)", () => {
	const capture = () =>
		T<() => Record<string, unknown> | null>("_capturePlayerPreferenceSnapshot");
	const restore = () =>
		T<(snapshot: Record<string, unknown>) => boolean>(
			"_restorePlayerPreferenceSnapshot",
		);

	beforeEach(() => {
		for (const key of [
			"video-quality",
			"lowLatencyModeEnabled",
			"persistenceEnabled",
		]) {
			localStorage.removeItem(key);
		}
		(
			g._PlayerPreferenceStorageState as {
				versions: Map<string, number>;
			}
		).versions.clear();
	});

	it("does not overwrite a newer preference change from another tab", () => {
		localStorage.setItem(
			"video-quality",
			JSON.stringify({ default: "720p60" }),
		);
		localStorage.setItem("lowLatencyModeEnabled", "true");
		const snapshot = capture()();
		expect(snapshot).not.toBeNull();

		const newerQuality = JSON.stringify({ default: "1080p60" });
		localStorage.setItem("video-quality", newerQuality);
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: "video-quality",
				oldValue: JSON.stringify({ default: "720p60" }),
				newValue: newerQuality,
			}),
		);
		localStorage.setItem("lowLatencyModeEnabled", "false");

		expect(restore()(snapshot as Record<string, unknown>)).toBe(true);
		expect(localStorage.getItem("video-quality")).toBe(newerQuality);
		expect(localStorage.getItem("lowLatencyModeEnabled")).toBe("true");
	});

	it("protects every captured key when another tab clears shared preferences", () => {
		localStorage.setItem("lowLatencyModeEnabled", "true");
		localStorage.setItem("persistenceEnabled", "true");
		const snapshot = capture()();
		expect(snapshot).not.toBeNull();

		localStorage.removeItem("lowLatencyModeEnabled");
		localStorage.removeItem("persistenceEnabled");
		window.dispatchEvent(new StorageEvent("storage", { key: null }));

		expect(restore()(snapshot as Record<string, unknown>)).toBe(true);
		expect(localStorage.getItem("lowLatencyModeEnabled")).toBeNull();
		expect(localStorage.getItem("persistenceEnabled")).toBeNull();
	});
});

describe("_handlePendingPostAdRecovery (no-frame rebuild gating)", () => {
	type Playback = {
		player: {
			getHTMLVideoElement: () => HTMLVideoElement;
			getBufferDuration: () => number;
			isPaused: () => boolean;
		};
		video: HTMLVideoElement;
		setCurrentTime: (value: number) => void;
	};
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
	const startTransaction = () =>
		T<(channel: string, mediaKey: string, cycleStartedAt: number) => boolean>(
			"_startPostAdRecoveryTransaction",
		);
	const transaction = () =>
		g._PostAdRecoveryTransactionState as {
			mediaKey: string | null;
			cycleStartedAt: number;
			video: HTMLMediaElement | null;
			reloadRequestCount: number;
			acceptedReloadCount: number;
			expiresAt: number;
			requiresReplacement: boolean;
			requiredReplacementVideo: WeakRef<HTMLMediaElement> | null;
			initialOperationCompleted: boolean;
		};
	let saved: Record<string, unknown>;
	let reloads: Array<Record<string, unknown>>;
	let reloadOutcomes: boolean[];
	let currentPlayback: Playback | null;
	let hidden: boolean;
	let pipActive: boolean;
	let userPaused: boolean;
	let routeCurrent: boolean;
	let nowSpy: ReturnType<typeof vi.spyOn>;
	let videos: HTMLVideoElement[];

	beforeEach(() => {
		saved = {
			doPlayerTask: g._doPlayerTask,
			getPlayerAndState: g._getPlayerAndState,
			shouldSuppress: g._shouldSuppressAutomaticPlaybackResume,
			hasUserPause: g._hasUserPauseIntent,
			isHidden: g._isNativeDocumentHidden,
			getPip: g._getActivePictureInPicturePlaybackContext,
			isContextCurrent: g._isPlaybackRecoveryContextCurrent,
		};
		reloads = [];
		reloadOutcomes = [];
		currentPlayback = null;
		hidden = false;
		pipActive = false;
		userPaused = false;
		routeCurrent = true;
		videos = [];
		nowSpy = vi.spyOn(Date, "now");
		g.__TTVAB_STATE__ = {
			IsBufferFixEnabled: true,
			PageMediaType: "live",
			PageChannel: "chan",
			PageMediaKey: "live:chan",
			CurrentAdChannel: null,
			CurrentAdMediaKey: null,
			LastAdEndedAt: 500000,
			LastAdEndedChannel: "chan",
			LastAdEndedMediaKey: "live:chan",
			LastAdEndedCycleStartedAt: 440000,
			ShouldResumeAfterAd: true,
			ShouldResumeAfterAdChannel: "chan",
			ShouldResumeAfterAdMediaKey: "live:chan",
			ShouldResumeAfterAdUntil: 900000,
			LastPlayerReloadAt: 0,
			LastPlayerReloadAtByMediaKey: Object.create(null),
			LastAdRecoveryReloadAt: 0,
			LastAdRecoveryResumeAt: 0,
			AdRecoveryReloadCooldownMs: 30000,
			PlayerReloadDebounceMs: 1500,
			_AdRecoveryConsecutiveFailures: 0,
		};
		g._doPlayerTask = (
			isPausePlay: boolean,
			isReload: boolean,
			options: Record<string, unknown>,
		) => {
			reloads.push({ isPausePlay, isReload, ...options });
			if (!isReload) return true;
			const accepted = reloadOutcomes.shift() === true;
			if (accepted) {
				T<(mediaKey: string, at: number) => void>("_recordPlayerReloadAt")(
					"live:chan",
					Date.now(),
				);
				(g.__TTVAB_STATE__ as Record<string, unknown>).LastPlayerReloadAt =
					Date.now();
			}
			return accepted;
		};
		g._shouldSuppressAutomaticPlaybackResume = () => false;
		g._hasUserPauseIntent = () => userPaused;
		g._isNativeDocumentHidden = () => hidden;
		g._getActivePictureInPicturePlaybackContext = () =>
			pipActive
				? {
						MediaKey: "live:chan",
						ChannelName: "chan",
						element: currentPlayback?.video || null,
					}
				: null;
		g._isPlaybackRecoveryContextCurrent = () => routeCurrent;
		g._getPlayerAndState = () => ({
			player: currentPlayback?.player || null,
			state: currentPlayback ? { props: { content: { type: "live" } } } : null,
		});
		T<() => void>("_resetPostAdRecoveryTransaction")();
		T<() => void>("_resetPostAdRecoveryMonitorSamples")();
	});

	afterEach(() => {
		g._doPlayerTask = saved.doPlayerTask;
		g._getPlayerAndState = saved.getPlayerAndState;
		g._shouldSuppressAutomaticPlaybackResume = saved.shouldSuppress;
		g._hasUserPauseIntent = saved.hasUserPause;
		g._isNativeDocumentHidden = saved.isHidden;
		g._getActivePictureInPicturePlaybackContext = saved.getPip;
		g._isPlaybackRecoveryContextCurrent = saved.isContextCurrent;
		for (const video of videos) video.remove();
		nowSpy.mockRestore();
	});

	function makePlayback(
		options: {
			currentTime?: number;
			bufferedEnd?: number;
			readyState?: number;
			videoWidth?: number;
		} = {},
	): Playback {
		let currentTime = options.currentTime ?? 0;
		const bufferedEnd = options.bufferedEnd ?? 0;
		const readyState = options.readyState ?? 0;
		const videoWidth = options.videoWidth ?? 0;
		const video = document.createElement("video");
		Object.defineProperties(video, {
			paused: { get: () => false, configurable: true },
			ended: { get: () => false, configurable: true },
			currentTime: { get: () => currentTime, configurable: true },
			readyState: { get: () => readyState, configurable: true },
			videoWidth: { get: () => videoWidth, configurable: true },
			buffered: {
				get: () => ({
					length: bufferedEnd > currentTime ? 1 : 0,
					start: () => 0,
					end: () => bufferedEnd,
				}),
				configurable: true,
			},
		});
		document.body.append(video);
		videos.push(video);
		const player = {
			getHTMLVideoElement: () => video,
			isPaused: () => false,
			getBufferDuration: () => Math.max(0, bufferedEnd - currentTime),
		};
		return {
			player,
			video,
			setCurrentTime(value: number) {
				currentTime = value;
			},
		};
	}

	function arm(playback: Playback, at = 500000) {
		currentPlayback = playback;
		nowSpy.mockReturnValue(at);
		expect(startTransaction()("chan", "live:chan", 440000)).toBe(true);
	}

	function sample(at: number) {
		nowSpy.mockReturnValue(at);
		if (!currentPlayback) throw new Error("playback not set");
		return recover()(
			currentPlayback.player,
			null,
			currentPlayback.video,
			"chan",
			"live:chan",
			"live",
		);
	}

	function reloadCalls() {
		return reloads.filter((entry) => entry.isReload === true);
	}

	it("gives a fresh exact recovery observation time before rebuilding", () => {
		const playback = makePlayback();
		reloadOutcomes.push(true);
		arm(playback);

		expect(sample(500000)).toBe(false);
		expect(sample(501700)).toBe(false);
		expect(reloadCalls()).toHaveLength(0);
		expect(sample(502000)).toBe(true);
		expect(reloadCalls()).toHaveLength(1);
		expect(reloadCalls()[0]).toMatchObject({
			newMediaPlayerInstance: true,
			refreshAccessToken: true,
			mediaKey: "live:chan",
			cycleStartedAt: 440000,
		});
		expect(transaction().acceptedReloadCount).toBe(1);
		expect(transaction().mediaKey).toBe("live:chan");
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).ShouldResumeAfterAd,
		).toBe(true);
	});

	it("keeps recovery active and permits one later retry when reload is rejected", () => {
		const playback = makePlayback();
		reloadOutcomes.push(false, true);
		arm(playback);

		sample(500000);
		expect(sample(502000)).toBe(true);
		expect(transaction().reloadRequestCount).toBe(1);
		expect(transaction().acceptedReloadCount).toBe(0);
		expect(transaction().mediaKey).toBe("live:chan");
		expect(sample(503000)).toBe(false);
		expect(reloadCalls()).toHaveLength(1);

		expect(sample(504000)).toBe(true);
		expect(reloadCalls()).toHaveLength(2);
		expect(transaction().reloadRequestCount).toBe(2);
		expect(transaction().acceptedReloadCount).toBe(1);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).ShouldResumeAfterAd,
		).toBe(true);
	});

	it("ends exact recovery at its strict cap without an extra playback action", () => {
		const firstPlayback = makePlayback();
		reloadOutcomes.push(true, true);
		arm(firstPlayback);
		sample(500000);
		sample(502000);

		currentPlayback = makePlayback();
		expect(sample(502100)).toBe(false);
		expect(sample(504100)).toBe(true);
		expect(reloadCalls()).toHaveLength(2);
		expect(transaction().acceptedReloadCount).toBe(2);
		expect(transaction().expiresAt).toBe(514100);
		expect(transaction().mediaKey).toBe("live:chan");

		currentPlayback = makePlayback();
		expect(sample(504200)).toBe(false);
		expect(sample(508000)).toBe(false);
		expect(sample(512000)).toBe(false);
		expect(sample(514099)).toBe(false);
		expect(transaction().video).toBe(currentPlayback.video);
		expect(sample(514100)).toBe(false);
		expect(transaction().mediaKey).toBeNull();
		expect(transaction().video).toBeNull();
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).ShouldResumeAfterAd,
		).toBe(false);
		expect(sample(520000)).toBe(false);
		expect(reloadCalls()).toHaveLength(2);
		expect(reloads).toHaveLength(2);
	});

	it("waits for the full observation window at the monitor cadence", () => {
		const playback = makePlayback({ videoWidth: 1920 });
		reloadOutcomes.push(true);
		arm(playback, 500000);

		for (const at of [500000, 500600, 501200]) {
			sample(at);
			expect(reloadCalls()).toHaveLength(0);
		}
		expect(sample(501800)).toBe(true);
		expect(reloadCalls()).toHaveLength(1);
	});

	it("starts terminal ordinary ad-recovery tasks under exact post-ad ownership", () => {
		const playback = makePlayback();
		currentPlayback = playback;
		nowSpy.mockReturnValue(500000);
		const actualDoPlayerTask = saved.doPlayerTask as (
			isPausePlay: boolean,
			isReload: boolean,
			options: Record<string, unknown>,
		) => unknown;

		actualDoPlayerTask(false, false, {
			reason: "ad-recovery",
			channel: "chan",
			mediaKey: "live:chan",
			cycleStartedAt: 440000,
		});

		expect(transaction().mediaKey).toBe("live:chan");
		expect(transaction().cycleStartedAt).toBe(440000);
		expect(transaction().expiresAt).toBe(530000);
	});

	it("disarms only after the exact replacement is healthy and advancing", () => {
		const firstPlayback = makePlayback();
		reloadOutcomes.push(true);
		arm(firstPlayback);
		sample(500000);
		sample(502000);

		const replacement = makePlayback({
			currentTime: 10,
			bufferedEnd: 20,
			readyState: 4,
			videoWidth: 1920,
		});
		currentPlayback = replacement;
		expect(sample(502100)).toBe(false);
		expect(transaction().mediaKey).toBe("live:chan");

		replacement.setCurrentTime(10.8);
		expect(sample(502800)).toBe(true);
		expect(transaction().mediaKey).toBeNull();
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).ShouldResumeAfterAd,
		).toBe(false);
		expect(
			(g._PlayerBufferState as Record<string, unknown>).postAdGraceUntil,
		).toBeGreaterThan(502800);
	});

	it("does not accept an advancing pre-reload fallback as the replacement", () => {
		const fallback = makePlayback({
			currentTime: 10,
			bufferedEnd: 20,
			readyState: 4,
			videoWidth: 640,
		});
		arm(fallback);
		transaction().requiresReplacement = true;
		transaction().requiredReplacementVideo = new WeakRef(fallback.video);
		transaction().initialOperationCompleted = true;

		expect(sample(500000)).toBe(false);
		fallback.setCurrentTime(10.8);
		expect(sample(500800)).toBe(false);
		expect(transaction().mediaKey).toBe("live:chan");

		const replacement = makePlayback({
			currentTime: 30,
			bufferedEnd: 40,
			readyState: 4,
			videoWidth: 1920,
		});
		currentPlayback = replacement;
		expect(sample(501000)).toBe(false);
		replacement.setCurrentTime(30.8);
		expect(sample(501800)).toBe(true);
		expect(transaction().mediaKey).toBeNull();
	});

	it.each(["hidden", "Picture-in-Picture"])(
		"preserves recovery while %s before the first sample exceeds its lifetime",
		(suspension) => {
			const playback = makePlayback();
			reloadOutcomes.push(true);
			if (suspension === "hidden") hidden = true;
			else pipActive = true;
			(g.__TTVAB_STATE__ as Record<string, unknown>).ShouldResumeAfterAdUntil =
				500500;
			arm(playback);

			expect(sample(531000)).toBe(false);
			expect(transaction().mediaKey).toBe("live:chan");
			expect(transaction().cycleStartedAt).toBe(440000);
			expect(transaction().video).toBeNull();
			expect(
				(g.__TTVAB_STATE__ as Record<string, unknown>).ShouldResumeAfterAd,
			).toBe(true);

			hidden = false;
			pipActive = false;
			expect(sample(532000)).toBe(false);
			expect(transaction().expiresAt).toBe(562000);
			expect(
				T<(channel: string, mediaKey: string) => boolean>(
					"_hasPendingAdResumeIntent",
				)("chan", "live:chan"),
			).toBe(true);
			expect(sample(534000)).toBe(true);
			expect(reloadCalls()).toHaveLength(1);
			expect(transaction().acceptedReloadCount).toBe(1);
		},
	);

	it("suspends while hidden or in PiP and cancels on explicit pause", () => {
		const playback = makePlayback();
		reloadOutcomes.push(true);
		arm(playback);

		hidden = true;
		expect(sample(502000)).toBe(false);
		hidden = false;
		pipActive = true;
		expect(sample(504000)).toBe(false);
		expect(reloadCalls()).toHaveLength(0);
		expect(transaction().mediaKey).toBe("live:chan");

		pipActive = false;
		userPaused = true;
		expect(sample(506000)).toBe(false);
		expect(transaction().mediaKey).toBeNull();
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).ShouldResumeAfterAd,
		).toBe(false);
	});

	it("cancels when the exact route no longer owns recovery", () => {
		const playback = makePlayback();
		arm(playback);
		routeCurrent = false;

		expect(sample(502000)).toBe(false);
		expect(transaction().mediaKey).toBeNull();
		expect(reloadCalls()).toHaveLength(0);
	});

	it("cancels when the exact ad cycle no longer owns recovery", () => {
		const playback = makePlayback();
		arm(playback);
		(g.__TTVAB_STATE__ as Record<string, unknown>).LastAdEndedCycleStartedAt =
			450000;

		expect(sample(502000)).toBe(false);
		expect(transaction().mediaKey).toBeNull();
		expect(reloadCalls()).toHaveLength(0);
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
	const flushOnExit = () => T<() => void>("_flushWatchTimeOnPageExit");
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

	function clearWatchTimeJournals() {
		for (let index = localStorage.length - 1; index >= 0; index--) {
			const key = localStorage.key(index);
			if (key?.startsWith("ttvab_pending_counter_flush:")) {
				localStorage.removeItem(key);
			}
		}
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
		T<() => unknown>("_clearActivePictureInPicturePlaybackContext")();
		Object.defineProperty(document, "pictureInPictureElement", {
			value: null,
			configurable: true,
		});
		const state = watchState();
		state.channel = null;
		state.pendingMs = 0;
		state.lastTickAt = 0;
		clearWatchTimeJournals();
		nowValue = 1_000_000_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => nowValue);
	});

	afterEach(() => {
		g._getPrimaryMediaElement = realGetPrimary;
		g._sendBridgeMessage = realSendBridge;
		T<() => unknown>("_clearActivePictureInPicturePlaybackContext")();
		Object.defineProperty(document, "pictureInPictureElement", {
			value: null,
			configurable: true,
		});
		clearWatchTimeJournals();
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

	it("credits hidden pip watch time to the pip channel after page navigation", () => {
		const pipVideo = makeWatchVideo();
		Object.defineProperty(document, "pictureInPictureElement", {
			value: pipVideo,
			configurable: true,
		});
		T<(element: HTMLVideoElement, context: Record<string, unknown>) => unknown>(
			"_setActivePictureInPicturePlaybackContext",
		)(pipVideo, {
			MediaType: "live",
			ChannelName: "streamerone",
			MediaKey: "live:streamerone",
		});
		(g.__TTVAB_STATE__ as Record<string, unknown>).PageChannel = "streamertwo";
		track()(true);
		for (let i = 0; i < 16; i++) {
			nowValue += 1000;
			track()(true);
		}

		expect(bridgeMessages[0]).toEqual({
			type: "ttvab-watch-time",
			detail: { channel: "streamerone", seconds: 15 },
		});
	});

	it("journals the final partial delta when isolated pagehide handling runs first", () => {
		const eventOrder: string[] = [];
		g._sendBridgeMessage = (type: string, detail: unknown) => {
			eventOrder.push(type);
			bridgeMessages.push({ type, detail });
			return true;
		};
		const state = watchState();
		state.channel = "streamerone";
		state.pendingMs = 7000;
		state.lastTickAt = nowValue;
		window.addEventListener(
			"pagehide",
			() => {
				eventOrder.push("isolated-pagehide");
			},
			{ once: true },
		);
		window.addEventListener("pagehide", flushOnExit(), { once: true });

		window.dispatchEvent(new Event("pagehide"));

		expect(eventOrder).toEqual([
			"isolated-pagehide",
			"ttvab-persist-counter-flush",
			"ttvab-flush-counters",
		]);
		expect(
			bridgeMessages.some((message) => message.type === "ttvab-watch-time"),
		).toBe(false);
		const persistedMessage = bridgeMessages[0] as {
			type: string;
			detail: {
				flushId: string;
				watchDeltas: Record<string, number>;
			};
		};
		expect(persistedMessage.detail.watchDeltas).toEqual({ streamerone: 7 });
		expect(
			localStorage.getItem(
				`ttvab_pending_counter_flush:${persistedMessage.detail.flushId}`,
			),
		).not.toBeNull();
		expect(watchState()).toMatchObject({ pendingMs: 0, lastTickAt: 0 });
	});

	it("includes the bounded playable interval since the last watch tick on exit", () => {
		g._getPrimaryMediaElement = () => makeWatchVideo();
		const state = watchState();
		state.channel = "streamerone";
		state.pendingMs = 7000;
		state.lastTickAt = nowValue;
		nowValue += 3200;

		flushOnExit()();

		const persistedMessage = bridgeMessages[0] as {
			detail: { watchDeltas: Record<string, number> };
		};
		expect(persistedMessage.detail.watchDeltas).toEqual({ streamerone: 10 });
	});

	it("does not credit exit time from a different current route", () => {
		g._getPrimaryMediaElement = () => makeWatchVideo();
		const state = watchState();
		state.channel = "streamerone";
		state.pendingMs = 7000;
		state.lastTickAt = nowValue;
		(g.__TTVAB_STATE__ as Record<string, unknown>).PageChannel = "streamertwo";
		nowValue += 3200;

		flushOnExit()();

		const persistedMessage = bridgeMessages[0] as {
			detail: { watchDeltas: Record<string, number> };
		};
		expect(persistedMessage.detail.watchDeltas).toEqual({ streamerone: 7 });
	});

	it("falls back to an ordered bridge flush when the exit journal is unavailable", () => {
		const state = watchState();
		state.channel = "streamerone";
		state.pendingMs = 7000;
		vi.spyOn(localStorage, "setItem").mockImplementation(() => {
			throw new Error("storage unavailable");
		});

		flushOnExit()();

		expect(bridgeMessages).toEqual([
			{
				type: "ttvab-watch-time",
				detail: { channel: "streamerone", seconds: 7 },
			},
			{ type: "ttvab-flush-counters", detail: undefined },
		]);
	});
});

describe("_checkPostBreakWedge (post-break decoder wedge watchdog)", () => {
	let taskCalls: Array<{ nudge: boolean; reload: boolean }>;
	let originalDoPlayerTask: unknown;

	function wedgeState() {
		return g._PostBreakWedgeState as {
			mediaKey: string | null;
			remainingEvals: number;
			lastCurrentTime: number;
			lastTotalFrames: number;
			evidenceCount: number;
			healthyCount: number;
			actionCount: number;
			prevAdContext: boolean;
			prevAdMediaKey: string | null;
		};
	}

	function checkWedge() {
		return T<
			(
				video: unknown,
				currentTime: number,
				channel?: string,
				mediaKey?: string,
			) => boolean
		>("_checkPostBreakWedge");
	}

	function makeWedgeVideo(opts: {
		currentTime: () => number;
		totalFrames?: () => number;
		videoWidth?: number;
		paused?: boolean;
		readyState?: number;
		withQualityApi?: boolean;
	}) {
		const video = document.createElement("video");
		Object.defineProperty(video, "currentTime", {
			get: opts.currentTime,
			configurable: true,
		});
		Object.defineProperty(video, "readyState", {
			get: () => opts.readyState ?? 4,
			configurable: true,
		});
		Object.defineProperty(video, "videoWidth", {
			get: () => opts.videoWidth ?? 1920,
			configurable: true,
		});
		Object.defineProperty(video, "paused", {
			get: () => opts.paused ?? false,
			configurable: true,
		});
		Object.defineProperty(video, "ended", {
			get: () => false,
			configurable: true,
		});
		if (opts.withQualityApi !== false) {
			Object.defineProperty(video, "getVideoPlaybackQuality", {
				value: () => ({ totalVideoFrames: (opts.totalFrames ?? (() => 0))() }),
				configurable: true,
			});
		}
		return video;
	}

	beforeEach(() => {
		taskCalls = [];
		originalDoPlayerTask = g._doPlayerTask;
		g._doPlayerTask = (nudge: boolean, reload: boolean) => {
			taskCalls.push({ nudge, reload });
		};
		(g._PlayerBufferState as Record<string, unknown>).lastFixTime = 0;
		T<() => void>("_armPostBreakWedgeWatch")();
	});

	afterEach(() => {
		g._doPlayerTask = originalDoPlayerTask;
		T<() => void>("_disarmPostBreakWedgeWatch")();
	});

	it("nudges then reloads when the playhead advances without decoded frames", () => {
		let time = 100;
		const video = makeWedgeVideo({
			currentTime: () => time,
			totalFrames: () => 5000,
		});
		expect(checkWedge()(video, time)).toBe(false);
		for (let i = 0; i < 5; i++) {
			time += 0.6;
			expect(checkWedge()(video, time)).toBe(false);
		}
		time += 0.6;
		expect(checkWedge()(video, time)).toBe(true);
		expect(taskCalls).toEqual([{ nudge: true, reload: false }]);

		for (let i = 0; i < 5; i++) {
			time += 0.6;
			expect(checkWedge()(video, time)).toBe(false);
		}
		time += 0.6;
		expect(checkWedge()(video, time)).toBe(true);
		expect(taskCalls).toEqual([
			{ nudge: true, reload: false },
			{ nudge: false, reload: true },
		]);
		expect(wedgeState().remainingEvals).toBe(0);
	});

	it("disarms an ended PiP ad watchdog before it can sample the new route", () => {
		T<(mediaKey?: string) => void>("_armPostBreakWedgeWatch")(
			"live:pipchannel",
		);
		const video = makeWedgeVideo({
			currentTime: () => 100,
			totalFrames: () => 5000,
		});

		expect(checkWedge()(video, 100, "pagechannel", "live:pagechannel")).toBe(
			false,
		);
		expect(wedgeState().remainingEvals).toBe(0);
		expect(wedgeState().mediaKey).toBeNull();
		expect(taskCalls).toEqual([]);
	});

	it("disarms quietly after sustained healthy frame decoding", () => {
		let time = 100;
		let frames = 5000;
		const video = makeWedgeVideo({
			currentTime: () => time,
			totalFrames: () => frames,
		});
		checkWedge()(video, time);
		for (let i = 0; i < 3; i++) {
			time += 0.6;
			frames += 36;
			expect(checkWedge()(video, time)).toBe(false);
		}
		expect(wedgeState().remainingEvals).toBe(0);
		expect(taskCalls).toEqual([]);
	});

	it("ignores paused, audio-only, and stalled-playhead samples", () => {
		const time = 100;
		const pausedVideo = makeWedgeVideo({
			currentTime: () => time,
			paused: true,
		});
		expect(checkWedge()(pausedVideo, time)).toBe(false);
		const audioOnly = makeWedgeVideo({
			currentTime: () => time,
			videoWidth: 0,
		});
		expect(checkWedge()(audioOnly, time)).toBe(false);
		const frozenPlayhead = makeWedgeVideo({ currentTime: () => time });
		checkWedge()(frozenPlayhead, time);
		for (let i = 0; i < 10; i++) {
			expect(checkWedge()(frozenPlayhead, time)).toBe(false);
		}
		expect(wedgeState().remainingEvals).toBe(
			g._POST_BREAK_WEDGE_EVAL_BUDGET as number,
		);
		expect(taskCalls).toEqual([]);
	});

	it("disarms silently when the playback quality API is unavailable", () => {
		let time = 100;
		const video = makeWedgeVideo({
			currentTime: () => time,
			withQualityApi: false,
		});
		Object.defineProperty(video, "getVideoPlaybackQuality", {
			value: undefined,
			configurable: true,
		});
		expect(checkWedge()(video, time)).toBe(false);
		expect(wedgeState().remainingEvals).toBe(0);
		time += 0.6;
		expect(checkWedge()(video, time)).toBe(false);
		expect(taskCalls).toEqual([]);
	});

	it("stops evaluating once the visible-evaluation budget is spent", () => {
		wedgeState().remainingEvals = 2;
		let time = 100;
		const video = makeWedgeVideo({
			currentTime: () => time,
			totalFrames: () => 5000,
		});
		checkWedge()(video, time);
		for (let i = 0; i < 6; i++) {
			time += 0.6;
			expect(checkWedge()(video, time)).toBe(false);
		}
		expect(wedgeState().remainingEvals).toBe(0);
		expect(taskCalls).toEqual([]);
	});
});
