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

function run<T = unknown>(name: string, ...args: unknown[]): T {
	const fn = g[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn(...args) as T;
}

beforeAll(() => {
	for (const name of ["constants", "logger", "state", "parser", "player"]) {
		const source = readFileSync(
			resolve(__dirname, `../dist/src/modules/${name}.js`),
			"utf8",
		)
			.replace(/^"use strict";\s*/m, "")
			.replace(/^const (_\w+|_C|_S)\s*=/gm, "globalThis.$1 =")
			.replace(/^let\s+(_\w+)/gm, "globalThis.$1")
			.replace(/^(async\s+)?function (_\w+)/gm, "globalThis.$2 = $1function");
		new Function("globalThis", source)(globalThis);
	}
});

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1000000);
	window.history.replaceState(null, "", "/testchannel");
	localStorage.clear();
	run("_declareState", globalThis);
	Object.assign(g.__TTVAB_STATE__ as object, {
		PageMediaType: "live",
		PageChannel: "testchannel",
		PageMediaKey: "live:testchannel",
		PagePlaybackContextGeneration: 1,
		CurrentAdMediaKey: null,
		CurrentAdChannel: null,
		PinnedBackupPlayerType: null,
	});
	run("_clearCachedPlayerRef");
	run("_resetPostAdRecoveryTransaction");
	run("_clearRecordedUserPauseIntent");
	run("_clearActivePictureInPicturePlaybackContext");
	run("_disarmPostBreakWedgeWatch");
	Object.assign(g._PostBreakWedgeState as object, {
		prevAdContext: false,
		prevAdMediaKey: null,
	});
	vi.spyOn(g, "_log").mockImplementation(() => {});
	vi.spyOn(g, "_broadcastWorkers").mockImplementation(() => {});
});

afterEach(() => {
	expect(g._log).not.toHaveBeenCalledWith(expect.anything(), "error");
	run("_stopPlayerBufferMonitor");
	run("_clearPendingPlayerPreferenceRestore");
	window.removeEventListener(
		"pagehide",
		g._flushWatchTimeOnPageExit as EventListener,
	);
	document.body.replaceChildren();
	vi.clearAllTimers();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function makePlayback(mode: boolean, stored: string | null = String(mode)) {
	if (stored !== null) localStorage.setItem("lowLatencyModeEnabled", stored);
	const sample = { time: 20, end: 30, frames: 100, ready: 4, paused: false };
	const seeks: number[] = [];
	const video = document.createElement("video");
	Object.defineProperties(video, {
		currentTime: {
			get: () => sample.time,
			set: (value: number) => {
				sample.time = value;
				seeks.push(value);
			},
			configurable: true,
		},
		buffered: {
			get: () => ({ length: 1, start: () => 0, end: () => sample.end }),
			configurable: true,
		},
		readyState: { get: () => sample.ready, configurable: true },
		paused: { get: () => sample.paused, configurable: true },
		ended: { value: false, configurable: true },
		videoWidth: { value: 1920, configurable: true },
		getVideoPlaybackQuality: {
			value: () => ({ totalVideoFrames: sample.frames }),
			configurable: true,
		},
	});
	document.body.append(video);
	const core = {
		state: { position: 20, bufferedPosition: 30, lowLatencyModeEnabled: mode },
	};
	const player = {
		core,
		getHTMLVideoElement: () => video,
		getBufferDuration: () => sample.end - sample.time,
		isPaused: () => sample.paused,
		play: vi.fn(() => Promise.resolve()),
		pause: vi.fn(),
	};
	const state = {
		props: { content: { type: "live", channelLogin: "testchannel" } },
		setSrc: vi.fn(),
	};
	vi.spyOn(g, "_getPlayerAndState").mockReturnValue({ player, state });
	vi.spyOn(g, "_getPrimaryMediaElement").mockReturnValue(video);
	return { sample, seeks, video, core, player, state };
}

function reload(reason = "buffer-recovery") {
	expect(
		run("_doPlayerTask", false, true, {
			reason,
			channel: "testchannel",
			mediaKey: "live:testchannel",
		}),
	).toBe(true);
}

describe("current player latency mode", () => {
	it.each([
		[true, null],
		[true, "false"],
		[false, "true"],
		[true, "true"],
		[false, "false"],
	] as const)("uses player mode %s over stored %s", (mode, stored) => {
		const { sample, player, core } = makePlayback(mode, stored);
		Object.assign(sample, { end: 20.2, ready: 2 });
		expect(run("_getLowLatencySafeEpsilon", core)).toBe(mode ? 0.08 : 0.35);
		expect(run("_getLowLatencyDangerZone", core)).toBe(mode ? 0.3 : 1);
		expect(run("_getLowLatencyMinRepeatDelay", core)).toBe(mode ? 2000 : 8000);
		expect(
			run<{ hasFutureData: boolean }>(
				"_readPlayerBufferTelemetry",
				player,
				core,
			).hasFutureData,
		).toBe(mode);
	});

	it.each([null, "false", "true", "invalid"])(
		"uses storage %s only when player mode is unavailable",
		(stored) => {
			if (stored !== null)
				localStorage.setItem("lowLatencyModeEnabled", stored);
			expect(run("_getLowLatencySafeEpsilon", { state: {} })).toBe(
				stored === "true" ? 0.08 : 0.35,
			);
		},
	);

	it.each([false, true])("resets cooldown using player mode %s", (mode) => {
		makePlayback(mode, String(!mode));
		run("_resetPlayerBufferMonitorState", 1500);
		expect((g._PlayerBufferState as { lastFixTime: number }).lastFixTime).toBe(
			Date.now() - (mode ? 2000 : 8000) + 1500,
		);
	});
});

describe.each([false, true])("latency mode %s recovery", (mode) => {
	it.each(["buffer-recovery", "ad-recovery"])(
		"preserves advancing video and its buffer after %s reload",
		(reason) => {
			const { sample, seeks, state } = makePlayback(mode);
			if (reason === "ad-recovery") {
				Object.assign(g.__TTVAB_STATE__ as object, {
					CurrentAdMediaKey: "live:testchannel",
					CurrentAdChannel: "testchannel",
				});
			}
			reload(reason);
			expect(state.setSrc).toHaveBeenCalledOnce();
			Object.assign(sample, { time: 21, end: 31, frames: 160 });
			vi.advanceTimersByTime(1600);
			expect(seeks).toEqual([]);
			expect(sample.end - sample.time).toBe(10);
		},
	);

	it.each(["same tab", "other tab", "removed", "unchanged"])(
		"preserves latency preference when %s during delayed restoration",
		(change) => {
			const { core } = makePlayback(mode);
			reload();
			vi.advanceTimersByTime(2000);
			const choice = change === "unchanged" ? mode : !mode;
			core.state.lowLatencyModeEnabled = choice;
			if (change === "removed")
				localStorage.removeItem("lowLatencyModeEnabled");
			else localStorage.setItem("lowLatencyModeEnabled", String(choice));
			if (change === "other tab") {
				window.dispatchEvent(
					new StorageEvent("storage", {
						key: "lowLatencyModeEnabled",
						oldValue: String(mode),
						newValue: String(choice),
					}),
				);
			}
			vi.advanceTimersByTime(1100);
			expect(localStorage.getItem("lowLatencyModeEnabled")).toBe(
				change === "removed" ? null : String(choice),
			);
			expect(core.state.lowLatencyModeEnabled).toBe(choice);
		},
	);

	it.each(["playhead", "frames", "both"])(
		"does not seek or recover advancing %s with stale Twitch position",
		(advancing) => {
			const { sample, seeks } = makePlayback(mode);
			const task = vi.spyOn(g, "_doPlayerTask").mockReturnValue(true);
			run("_monitorPlayerBuffering");
			for (let tick = 0; tick < 20; tick++) {
				if (advancing !== "frames") sample.time += 0.5;
				if (advancing !== "playhead") sample.frames += 30;
				sample.end = sample.time + 10;
				vi.advanceTimersByTime(900);
			}
			expect(seeks).toEqual([]);
			expect(task).not.toHaveBeenCalled();
		},
	);

	it.each(["fixed buffer", "growing buffer", "no frame API"])(
		"still recovers a sustained freeze with %s",
		(condition) => {
			const { sample, seeks, video } = makePlayback(mode);
			if (condition === "no frame API") {
				Object.defineProperty(video, "getVideoPlaybackQuality", {
					value: undefined,
				});
			}
			const task = vi.spyOn(g, "_doPlayerTask").mockReturnValue(true);
			run("_monitorPlayerBuffering");
			for (let tick = 0; tick < 5; tick++) {
				sample.time += 0.5;
				sample.frames += 30;
				vi.advanceTimersByTime(900);
			}
			expect(task).not.toHaveBeenCalled();
			for (let tick = 0; tick < 40; tick++) {
				if (condition === "growing buffer") sample.end += 0.5;
				vi.advanceTimersByTime(900);
			}
			expect(task).toHaveBeenCalledWith(true, false);
			expect(task).toHaveBeenCalledWith(false, true, {
				reason: "buffer-recovery",
			});
			expect(seeks).toEqual([]);
		},
	);

	it("uses the pinned player's mode before rotating a thin clean backup", () => {
		const { sample, player } = makePlayback(mode, String(!mode));
		sample.end = 20.5;
		Object.assign(g.__TTVAB_STATE__ as object, {
			CurrentAdMediaKey: "live:testchannel",
			CurrentAdChannel: "testchannel",
			PinnedBackupPlayerType: "autoplay",
			PinnedBackupPlayerMediaKey: "live:testchannel",
		});
		run("_resetPinnedBackupStallState");
		run("_checkPinnedBackupStall", player, "testchannel", "live:testchannel");
		vi.advanceTimersByTime(4000);
		run("_checkPinnedBackupStall", player, "testchannel", "live:testchannel");
		if (mode) expect(g._broadcastWorkers).not.toHaveBeenCalled();
		else
			expect(g._broadcastWorkers).toHaveBeenCalledWith(
				expect.objectContaining({ key: "UpdateBackupSearchForceRefresh" }),
			);
	});

	it("does not transfer stall evidence across a backward seek or frame reset", () => {
		const { sample } = makePlayback(mode);
		const task = vi.spyOn(g, "_doPlayerTask").mockReturnValue(true);
		run("_monitorPlayerBuffering");
		vi.advanceTimersByTime(1800);
		sample.time = 1;
		sample.frames = 0;
		vi.advanceTimersByTime(1800);
		expect(task).not.toHaveBeenCalled();
		vi.advanceTimersByTime(10000);
		expect(task).toHaveBeenCalled();
	});

	it("bases thin-buffer recovery on active mode when storage disagrees", () => {
		const { sample, core } = makePlayback(mode, String(!mode));
		Object.assign(sample, { end: 20.2, ready: 2 });
		core.state.bufferedPosition = 20.2;
		const task = vi.spyOn(g, "_doPlayerTask").mockReturnValue(true);
		run("_monitorPlayerBuffering");
		vi.advanceTimersByTime(10000);
		if (mode) {
			expect(task).toHaveBeenCalledWith(true, false);
			expect(task).not.toHaveBeenCalledWith(false, true, expect.anything());
		} else {
			expect(task).toHaveBeenCalledWith(false, true, {
				reason: "buffer-recovery",
			});
			expect(task).not.toHaveBeenCalledWith(true, false);
		}
	});

	it.each(["advancing", "frozen frames", "frozen playhead", "paused", "empty"])(
		"checks %s before clearing the post-ad notice with a thin buffer",
		(condition) => {
			const { sample, video, player } = makePlayback(mode, String(!mode));
			Object.assign(g.__TTVAB_STATE__ as object, {
				LastAdEndedMediaKey: "live:testchannel",
				LastAdEndedCycleStartedAt: 900000,
				LastAdEndedAt: Date.now(),
			});
			Object.assign(g._PostAdRecoveryNoticeState as object, {
				mediaKey: "live:testchannel",
				pageGeneration: 1,
				cycleStartedAt: 900000,
				currentTime: 20,
				totalVideoFrames: 100,
				playerRef: new WeakRef(player),
				videoRef: new WeakRef(video),
			});
			Object.assign(sample, {
				time: condition === "frozen playhead" ? 20 : 20.1,
				frames: condition === "frozen frames" ? 100 : 106,
				end: condition === "empty" ? 20.1 : 20.3,
				paused: condition === "paused",
			});
			expect(run("_canRefreshPostAdPlayer", "live:testchannel")).toBe(
				!(mode && condition === "advancing"),
			);
			if (condition === "advancing") {
				sample.end = sample.time + 0.5;
				expect(run("_canRefreshPostAdPlayer", "live:testchannel")).toBe(false);
			}
		},
	);
});
