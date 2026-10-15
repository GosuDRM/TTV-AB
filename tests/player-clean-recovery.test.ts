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

describe("playback intent monitor cadence", () => {
	it("syncs the primary media once per tick on a page without a player", async () => {
		Object.assign(g.__TTVAB_STATE__ as object, {
			PageMediaType: null,
			PageChannel: null,
			PageMediaKey: null,
		});
		vi.spyOn(g, "_getPlayerAndState").mockReturnValue({
			player: null,
			state: null,
		});
		vi.spyOn(g, "_getPrimaryMediaElement").mockReturnValue(null);
		const sync = vi.spyOn(g, "_syncPrimaryMediaPlaybackIntent");
		run("_monitorPlaybackIntent");
		await vi.advanceTimersByTimeAsync(30000);
		expect(sync).toHaveBeenCalledTimes(11);
	});
});

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

describe("buffer monitor connectivity and ended streams", () => {
	function trackReloads() {
		const reloads: number[] = [];
		const nudges: number[] = [];
		vi.spyOn(g, "_doPlayerTask").mockImplementation(
			(isPausePlay: unknown, isReload: unknown) => {
				if (isReload) reloads.push(Date.now());
				else if (isPausePlay) nudges.push(Date.now());
				return true;
			},
		);
		return { reloads, nudges };
	}

	it("spaces live end-of-stream reloads and skips them once the stream is known to have ended", async () => {
		const playback = makePlayback();
		Object.defineProperty(playback.video, "ended", {
			get: () => true,
			configurable: true,
		});
		vi.spyOn(g, "_getPlayerAndState").mockReturnValue(playback);
		const { reloads } = trackReloads();
		let streamEnded = false;
		g._isLiveStreamEndedForContext = vi.fn(
			(context: { MediaKey?: string }) =>
				streamEnded && context?.MediaKey === "live:testchannel",
		);
		try {
			run("_monitorPlayerBuffering");
			await vi.advanceTimersByTimeAsync(20000);
			expect(reloads.length).toBeGreaterThan(0);
			expect(reloads.length).toBeLessThanOrEqual(3);
			for (let index = 1; index < reloads.length; index++)
				expect(reloads[index] - reloads[index - 1]).toBeGreaterThanOrEqual(
					8000,
				);
			streamEnded = true;
			const before = reloads.length;
			await vi.advanceTimersByTimeAsync(60000);
			expect(reloads).toHaveLength(before);
		} finally {
			delete g._isLiveStreamEndedForContext;
		}
	});

	it("holds stall fixes while the browser is offline and resumes them once it is back online", async () => {
		const playback = makePlayback();
		vi.spyOn(g, "_getPlayerAndState").mockReturnValue(playback);
		const { reloads, nudges } = trackReloads();
		let online = true;
		Object.defineProperty(navigator, "onLine", {
			configurable: true,
			get: () => online,
		});
		try {
			run("_monitorPlayerBuffering");
			await vi.advanceTimersByTimeAsync(3000);
			online = false;
			playback.sample.advancing = false;
			await vi.advanceTimersByTimeAsync(60000);
			expect(reloads).toEqual([]);
			expect(nudges).toEqual([]);
			expect((g._PlayerBufferState as Record<string, number>).numSame).toBe(0);
			online = true;
			await vi.advanceTimersByTimeAsync(15000);
			expect(reloads.length + nudges.length).toBeGreaterThan(0);
		} finally {
			delete (navigator as unknown as Record<string, unknown>).onLine;
		}
	});
});

describe("live-edge starvation reload escalation", () => {
	function makeStarvedPlayback() {
		const playback = makePlayback();
		playback.sample.advancing = false;
		Object.defineProperties(playback.video, {
			buffered: {
				get: () => ({
					length: 1,
					start: () => 0,
					end: () => Number(playback.video.currentTime),
				}),
				configurable: true,
			},
			readyState: { get: () => 2, configurable: true },
		});
		Object.defineProperty(playback.player.core.state, "bufferedPosition", {
			get: () => Number(playback.video.currentTime),
			configurable: true,
		});
		playback.player.getBufferDuration = () => 0;
		return playback;
	}

	function trackStarvationReloads() {
		const reloads: number[] = [];
		vi.spyOn(g, "_doPlayerTask").mockImplementation(
			(_isPausePlay: unknown, isReload: unknown) => {
				if (isReload) reloads.push(Date.now());
				return true;
			},
		);
		return reloads;
	}

	it("waits twice as long before each repeated starvation reload, up to four times the first wait", async () => {
		const playback = makeStarvedPlayback();
		vi.spyOn(g, "_getPlayerAndState").mockReturnValue(playback);
		const reloads = trackStarvationReloads();
		run("_monitorPlayerBuffering");
		await vi.advanceTimersByTimeAsync(140000);
		expect(reloads.length).toBeGreaterThanOrEqual(5);
		const gaps = reloads.slice(1).map((at, index) => at - reloads[index]);
		expect(gaps[0]).toBeGreaterThan(20000);
		expect(gaps[0]).toBeLessThan(25000);
		expect(gaps[1]).toBeGreaterThan(gaps[0] + 12000);
		expect(Math.abs(gaps[2] - gaps[1])).toBeLessThan(1500);
		expect(Math.abs(gaps[3] - gaps[2])).toBeLessThan(1500);
		expect(
			vi
				.mocked(g._log)
				.mock.calls.filter(([message]) =>
					String(message).startsWith("Persistent live-edge starvation"),
				)
				.map(
					([message]) =>
						String(message).match(/recent starvation reloads (\d)/)?.[1],
				),
		).toEqual(["0", "1", "2", "2", "2"].slice(0, reloads.length));
	});

	it("returns to the short wait after five minutes without a starvation reload or on another stream", async () => {
		const playback = makeStarvedPlayback();
		vi.spyOn(g, "_getPlayerAndState").mockReturnValue(playback);
		const reloads = trackStarvationReloads();
		run("_monitorPlayerBuffering");
		await vi.advanceTimersByTimeAsync(60000);
		expect(reloads).toHaveLength(2);
		playback.sample.advancing = true;
		await vi.advanceTimersByTimeAsync(300000);
		expect(reloads).toHaveLength(2);
		playback.sample.advancing = false;
		const resumedAt = Date.now();
		await vi.advanceTimersByTimeAsync(20000);
		expect(reloads).toHaveLength(3);
		expect(reloads[2] - resumedAt).toBeLessThan(16000);
		const state = g._PlayerBufferState as Record<string, unknown>;
		state.liveEdgeReloadMediaKey = "live:otherchannel";
		state.liveEdgeReloadCount = 2;
		state.liveEdgeReloadAt = Date.now();
		const before = reloads.length;
		await vi.advanceTimersByTimeAsync(18000);
		expect(reloads.length).toBe(before + 1);
	});
});

describe("Previews for Twitch quality interop", () => {
	function postPreviewsQuality(
		selected: unknown,
		fallback: unknown = null,
		source: Window | null = window,
		origin = window.location.origin,
	) {
		window.dispatchEvent(
			new MessageEvent("message", {
				data: {
					type: "tp_setTTVQuality",
					selected_quality: selected,
					fallback_quality: fallback,
				},
				origin,
				source,
			}),
		);
	}

	beforeEach(() => {
		g._PreviewsQualityMessage = null;
		run("_hookPreviewsQualityChoice");
	});

	afterEach(() => {
		g._PreviewsQualityMessage = null;
	});

	it("follows the quality Previews applies to the main player", () => {
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		localStorage.setItem(
			"video-quality",
			JSON.stringify({ default: "720p60" }),
		);
		run("_syncPreferredQualityGroup");
		expect(state.PreferredQualityGroup).toBe("720p60");
		postPreviewsQuality("chunked", "1080p60");
		expect(state.PreferredQualityGroup).toBe("chunked");
		expect(g._broadcastWorkers).toHaveBeenLastCalledWith({
			key: "UpdatePreferredQualityGroup",
			value: "chunked",
		});
		run("_syncPreferredQualityGroup");
		expect(state.PreferredQualityGroup).toBe("chunked");
		postPreviewsQuality("lowest");
		expect(state.PreferredQualityGroup).toBe("160p");
		postPreviewsQuality("1080p60");
		expect(state.PreferredQualityGroup).toBe("1080p60");
		postPreviewsQuality("auto");
		expect(state.PreferredQualityGroup).toBe("720p60");
		localStorage.removeItem("video-quality");
		postPreviewsQuality("1080p60");
		postPreviewsQuality("auto");
		expect(state.PreferredQualityGroup).toBeNull();
	});

	it("ignores malformed values and messages from other windows or origins", () => {
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		localStorage.setItem(
			"video-quality",
			JSON.stringify({ default: "720p60" }),
		);
		run("_syncPreferredQualityGroup");
		postPreviewsQuality("1080p60", null, null);
		postPreviewsQuality("1080p60", null, window, "https://evil.example");
		postPreviewsQuality("<script>");
		postPreviewsQuality(1080);
		expect(state.PreferredQualityGroup).toBe("720p60");
		expect(g._PreviewsQualityMessage).toBeNull();
	});

	it("asks Previews to re-apply its quality after a TTV AB player reload restores preferences", () => {
		const post = vi.spyOn(window, "postMessage").mockImplementation(() => {});
		const snapshot = run<Record<string, unknown>>(
			"_capturePlayerPreferenceSnapshot",
			null,
			null,
			{ channel: "testchannel", mediaKey: "live:testchannel" },
		);
		run("_restorePlayerPreferenceSnapshot", snapshot, {
			channel: "testchannel",
			mediaKey: "live:testchannel",
		});
		expect(post).not.toHaveBeenCalled();
		postPreviewsQuality("chunked", "1080p60");
		run("_restorePlayerPreferenceSnapshot", snapshot, {
			channel: "testchannel",
			mediaKey: "live:testchannel",
		});
		expect(post).toHaveBeenCalledWith(
			{
				type: "tp_setTTVQuality",
				selected_quality: "chunked",
				fallback_quality: "1080p60",
			},
			window.location.origin,
		);
	});
});
