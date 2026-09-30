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
	for (const name of [
		"constants",
		"logger",
		"state",
		"parser",
		"processor",
		"player",
	]) {
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
	run("_stopPlayerBufferMonitor");
	run("_stopPlaybackIntentMonitor", true);
	run("_clearCachedPrimaryMediaElement");
	run("_resetPostAdRecoveryTransaction");
	run("_clearRecordedUserPauseIntent");
	run("_clearRecentPlaybackControlInteraction");
	Object.assign(g._PlaybackIntentState as object, {
		lastProgrammaticPauseAt: 0,
		lastProgrammaticPlayAt: 0,
		suppressedPauseMediaKey: null,
		suppressedPauseUntil: 0,
	});
	run("_clearActivePictureInPicturePlaybackContext");
	run("_clearSecondaryPlayerHandoff");
	run("_disarmPostBreakWedgeWatch");
	Object.assign(g._PostBreakWedgeState as object, {
		prevAdContext: false,
		prevAdMediaKey: null,
	});
	vi.spyOn(g, "_log").mockImplementation(() => {});
	vi.spyOn(g, "_broadcastWorkers").mockImplementation(() => {});
	vi.spyOn(g, "_isNativeDocumentHidden").mockReturnValue(false);
	vi.spyOn(g, "_isPlaybackPageUnfocused").mockReturnValue(false);
});

afterEach(() => {
	const errors = vi
		.mocked(g._log)
		.mock.calls.filter(([, level]) => level === "error");
	run("_stopPlayerBufferMonitor");
	run("_stopPlaybackIntentMonitor", true);
	run("_clearPendingPlayerPreferenceRestore");
	run("_clearPlaybackRecoveryTimeouts");
	window.removeEventListener(
		"pagehide",
		g._flushWatchTimeOnPageExit as EventListener,
	);
	document.body.replaceChildren();
	vi.clearAllTimers();
	vi.restoreAllMocks();
	vi.useRealTimers();
	expect(errors).toEqual([]);
});

function makePlayback() {
	const startedAt = Date.now();
	const sample = {
		advancing: true,
		paused: false,
		empty: false,
		error: 0,
	};
	const time = () =>
		sample.empty
			? 0
			: 20 + (sample.advancing ? (Date.now() - startedAt) / 1000 : 0);
	const video = document.createElement("video");
	Object.defineProperties(video, {
		currentTime: { get: time, configurable: true },
		buffered: {
			get: () => ({
				length: sample.empty ? 0 : 1,
				start: () => 0,
				end: () => time() + 2,
			}),
			configurable: true,
		},
		readyState: { get: () => (sample.empty ? 0 : 4), configurable: true },
		networkState: { get: () => (sample.empty ? 0 : 2), configurable: true },
		paused: { get: () => sample.paused, configurable: true },
		ended: { value: false, configurable: true },
		error: { get: () => (sample.error ? { code: sample.error } : null) },
		videoWidth: { get: () => (sample.empty ? 0 : 1920) },
		getVideoPlaybackQuality: {
			value: () => ({ totalVideoFrames: Math.floor(time() * 60) }),
			configurable: true,
		},
	});
	document.body.append(video);
	const worker = {
		__TTVABGeneration: 2,
		__TTVABPageMediaKey: "live:testchannel",
		get __TTVABLastPongAt() {
			return Date.now();
		},
	};
	const player = {
		core: {
			worker,
			state: {
				get position() {
					return time();
				},
				get bufferedPosition() {
					return sample.empty ? 0 : time() + 2;
				},
			},
		},
		getHTMLVideoElement: () => video,
		getBufferDuration: () => (sample.empty ? 0 : 2),
		isPaused: () => sample.paused,
		play: vi.fn(() => Promise.resolve()),
		pause: vi.fn(),
	};
	const state = {
		props: { content: { type: "live", channelLogin: "testchannel" } },
		setSrc: vi.fn(async () => "success"),
	};
	return { sample, video, worker, player, state };
}

describe("clean live playback failure recovery", () => {
	it.each([0, 3])(
		"rebuilds once after advancing playback becomes persistently empty with media error %s",
		async (error) => {
			const playback = makePlayback();
			vi.spyOn(g, "_getPlayerAndState").mockReturnValue(playback);
			run("_monitorPlaybackIntent");
			run("_monitorPlayerBuffering");
			await vi.advanceTimersByTimeAsync(7200);
			Object.assign(playback.sample, { empty: true, paused: true, error });
			playback.video.dispatchEvent(new Event("pause"));
			await vi.advanceTimersByTimeAsync(11000);
			expect(playback.state.setSrc).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(3000);
			expect(playback.state.setSrc).toHaveBeenCalledExactlyOnceWith({
				isNewMediaPlayerInstance: true,
				refreshAccessToken: true,
			});
			expect(
				run("_hasUserPauseIntent", "testchannel", "live:testchannel"),
			).toBe(false);
			await vi.advanceTimersByTimeAsync(60000);
			expect(playback.state.setSrc).toHaveBeenCalledOnce();
		},
	);

	it("preserves an explicit pause when playback subsequently becomes empty", async () => {
		const playback = makePlayback();
		vi.spyOn(g, "_getPlayerAndState").mockReturnValue(playback);
		run("_monitorPlaybackIntent");
		run("_monitorPlayerBuffering");
		await vi.advanceTimersByTimeAsync(7200);
		run(
			"_rememberRecentPlaybackControlInteraction",
			"testchannel",
			"live:testchannel",
		);
		Object.assign(playback.sample, { empty: true, paused: true, error: 3 });
		playback.video.dispatchEvent(new Event("pause"));
		await vi.advanceTimersByTimeAsync(60000);
		expect(playback.state.setSrc).not.toHaveBeenCalled();
		expect(run("_hasUserPauseIntent", "testchannel", "live:testchannel")).toBe(
			true,
		);
	});

	it.each(["startup", "frozen frames", "frozen playhead"])(
		"requires advancing playback proof before repairing %s",
		async (condition) => {
			const playback = makePlayback();
			if (condition === "startup") playback.sample.empty = true;
			if (condition === "frozen playhead") playback.sample.advancing = false;
			if (condition === "frozen frames")
				Object.defineProperty(playback.video, "getVideoPlaybackQuality", {
					value: () => ({ totalVideoFrames: 100 }),
				});
			vi.spyOn(g, "_getPlayerAndState").mockReturnValue(playback);
			run("_monitorPlaybackIntent");
			run("_monitorPlayerBuffering");
			await vi.advanceTimersByTimeAsync(7200);
			Object.assign(playback.sample, { empty: true, paused: true });
			await vi.advanceTimersByTimeAsync(60000);
			expect(playback.state.setSrc).not.toHaveBeenCalled();
		},
	);

	it("does not rebuild a transient source reset", async () => {
		const playback = makePlayback();
		vi.spyOn(g, "_getPlayerAndState").mockReturnValue(playback);
		run("_monitorPlaybackIntent");
		run("_monitorPlayerBuffering");
		await vi.advanceTimersByTimeAsync(7200);
		Object.assign(playback.sample, { empty: true, paused: true });
		playback.video.dispatchEvent(new Event("pause"));
		await vi.advanceTimersByTimeAsync(10000);
		Object.assign(playback.sample, { empty: false, paused: false });
		playback.video.dispatchEvent(new Event("play"));
		await vi.advanceTimersByTimeAsync(30000);
		expect(playback.state.setSrc).not.toHaveBeenCalled();
	});

	it.each([
		"paused",
		"disabled",
		"buffer fix disabled",
		"hidden",
		"PiP",
		"handoff",
		"codec handoff",
		"ad cycle",
		"VOD",
		"different player content",
		"different worker content",
		"unhooked worker",
		"dead worker",
		"terminated worker",
		"stale heartbeat",
		"navigation",
		"generation",
		"detached",
		"replacement video",
		"replacement worker",
	])("cancels pending empty-player recovery after %s", async (condition) => {
		const playback = makePlayback();
		vi.spyOn(g, "_getPlayerAndState").mockReturnValue(playback);
		run("_monitorPlaybackIntent");
		run("_monitorPlayerBuffering");
		await vi.advanceTimersByTimeAsync(7200);
		Object.assign(playback.sample, { empty: true, paused: true });
		playback.video.dispatchEvent(new Event("pause"));
		await vi.advanceTimersByTimeAsync(6000);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		if (condition === "paused") {
			run(
				"_rememberRecentPlaybackControlInteraction",
				"testchannel",
				"live:testchannel",
			);
			playback.video.dispatchEvent(new Event("pause"));
		}
		if (condition === "disabled") state.IsAdStrippingEnabled = false;
		if (condition === "buffer fix disabled") state.IsBufferFixEnabled = false;
		if (condition === "hidden")
			vi.mocked(g._isNativeDocumentHidden).mockReturnValue(true);
		if (condition === "PiP")
			vi.spyOn(g, "_getPictureInPictureVideo").mockReturnValue(playback.video);
		if (condition === "handoff")
			vi.spyOn(g, "_shouldSuppressAutomaticPlaybackResume").mockReturnValue(
				true,
			);
		if (condition === "codec handoff") state.ActiveCodecHandoffId = "handoff";
		if (condition === "ad cycle") {
			state.CurrentAdMediaKey = "live:testchannel";
			state.CurrentAdChannel = "testchannel";
		}
		if (condition === "VOD") playback.state.props.content.type = "vod";
		if (condition === "different player content")
			playback.state.props.content.channelLogin = "otherchannel";
		if (condition === "different worker content")
			playback.worker.__TTVABPageMediaKey = "live:otherchannel";
		if (condition === "unhooked worker") playback.worker.__TTVABGeneration = 0;
		if (condition === "dead worker")
			Object.assign(playback.worker, { __TTVABCrashed: true });
		if (condition === "terminated worker")
			Object.assign(playback.worker, { __TTVABIntentionallyTerminated: true });
		if (condition === "stale heartbeat")
			Object.defineProperty(playback.worker, "__TTVABLastPongAt", { value: 1 });
		if (condition === "navigation")
			window.history.replaceState(null, "", "/otherchannel");
		if (condition === "generation") state.PagePlaybackContextGeneration = 3;
		if (condition === "detached") playback.video.remove();
		if (condition === "replacement video") {
			const replacement = makePlayback();
			Object.assign(replacement.sample, { empty: true, paused: true });
			playback.player.getHTMLVideoElement = () => replacement.video;
		}
		if (condition === "replacement worker")
			playback.player.core.worker = makePlayback().worker;
		await vi.advanceTimersByTimeAsync(30000);
		expect(playback.state.setSrc).not.toHaveBeenCalled();
	});

	it("does not treat a suspended monitor as continuous failure evidence", async () => {
		const playback = makePlayback();
		vi.spyOn(g, "_getPlayerAndState").mockReturnValue(playback);
		run("_monitorPlaybackIntent");
		run("_monitorPlayerBuffering");
		await vi.advanceTimersByTimeAsync(7200);
		Object.assign(playback.sample, { empty: true, paused: true });
		await vi.advanceTimersByTimeAsync(3000);
		vi.setSystemTime(Date.now() + 60000);
		await vi.advanceTimersByTimeAsync(30000);
		expect(playback.state.setSrc).not.toHaveBeenCalled();
	});

	it("rearms only after replacement playback actually advances", async () => {
		const playback = makePlayback();
		const current = vi.spyOn(g, "_getPlayerAndState").mockReturnValue(playback);
		run("_monitorPlaybackIntent");
		run("_monitorPlayerBuffering");
		await vi.advanceTimersByTimeAsync(7200);
		Object.assign(playback.sample, { empty: true, paused: true });
		playback.video.dispatchEvent(new Event("pause"));
		await vi.advanceTimersByTimeAsync(15000);
		expect(playback.state.setSrc).toHaveBeenCalledOnce();
		const replacement = makePlayback();
		Object.assign(replacement.sample, { empty: true, paused: true });
		current.mockReturnValue(replacement);
		await vi.advanceTimersByTimeAsync(30000);
		expect(replacement.state.setSrc).not.toHaveBeenCalled();
		Object.assign(replacement.sample, { empty: false, paused: false });
		replacement.video.dispatchEvent(new Event("play"));
		await vi.advanceTimersByTimeAsync(7200);
		Object.assign(replacement.sample, { empty: true, paused: true });
		replacement.video.dispatchEvent(new Event("pause"));
		await vi.advanceTimersByTimeAsync(15000);
		expect(replacement.state.setSrc).toHaveBeenCalledOnce();
	});
});

describe("playback intent after a connected player replacement", () => {
	it("follows the replacement and ignores playback events from the retired video", async () => {
		const retired = makePlayback();
		const current = vi.spyOn(g, "_getPlayerAndState").mockReturnValue(retired);
		run("_monitorPlaybackIntent");
		const replacement = makePlayback();
		current.mockReturnValue(replacement);
		await vi.advanceTimersByTimeAsync(2000);
		retired.sample.paused = true;
		retired.video.dispatchEvent(new Event("pause"));
		expect((g.__TTVAB_STATE__ as Record<string, unknown>).PlayerIsPlaying).toBe(
			true,
		);
		replacement.sample.paused = true;
		replacement.video.dispatchEvent(new Event("pause"));
		expect(run("_hasUserPauseIntent", "testchannel", "live:testchannel")).toBe(
			true,
		);
		retired.video.dispatchEvent(new Event("play"));
		expect(run("_hasUserPauseIntent", "testchannel", "live:testchannel")).toBe(
			true,
		);
	});

	it("ignores retired events before the next ownership poll", () => {
		const retired = makePlayback();
		const current = vi.spyOn(g, "_getPlayerAndState").mockReturnValue(retired);
		run("_monitorPlaybackIntent");
		current.mockReturnValue(makePlayback());
		retired.sample.paused = true;
		retired.video.dispatchEvent(new Event("pause"));
		expect((g.__TTVAB_STATE__ as Record<string, unknown>).PlayerIsPlaying).toBe(
			true,
		);
		expect(run("_hasUserPauseIntent", "testchannel", "live:testchannel")).toBe(
			false,
		);
	});

	it("fences old listeners and rebinds a reused video after navigation", async () => {
		const playback = makePlayback();
		vi.spyOn(g, "_getPlayerAndState").mockReturnValue(playback);
		run("_monitorPlaybackIntent");
		Object.assign(g.__TTVAB_STATE__ as object, {
			PagePlaybackContextGeneration: 3,
		});
		playback.sample.paused = true;
		playback.video.dispatchEvent(new Event("pause"));
		expect(run("_hasUserPauseIntent", "testchannel", "live:testchannel")).toBe(
			false,
		);
		await vi.advanceTimersByTimeAsync(2000);
		playback.video.dispatchEvent(new Event("pause"));
		expect(run("_hasUserPauseIntent", "testchannel", "live:testchannel")).toBe(
			true,
		);
	});
});
