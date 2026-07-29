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
	loadModule("../dist/src/modules/parser.js");
	loadModule("../dist/src/modules/state.js");
	loadModule("../dist/src/modules/processor.js");
	loadModule("../dist/src/modules/hooks.js");
	loadModule("../dist/src/modules/worker.js");
});

beforeEach(() => {
	g._S = {
		workers: [],
		conflicts: [],
		reinsertPatterns: [],
		toleratedWorkerWrappers: [],
		adsBlocked: 0,
	};
	g.__TTVAB_STATE__ = {
		PageMediaType: "live",
		PageChannel: "testchannel",
		PageVodID: null,
		PageMediaKey: "live:testchannel",
	};
	g._log = () => {};
	if (g._bridgeTokenRequestTimer) {
		clearTimeout(g._bridgeTokenRequestTimer as ReturnType<typeof setTimeout>);
	}
	g._bridgePort = null;
	g._bridgePortHandshakeBound = false;
	g._bridgeSessionToken = null;
	g._bridgeTokenRequestTimer = null;
	g._bridgeTokenRequestCount = 0;
	const recoveryState = g._WorkerRecoveryState as Record<string, unknown>;
	recoveryState.contextKey = null;
	recoveryState.attempts = 0;
	recoveryState.lastAttemptAt = 0;
	recoveryState.limitLogged = false;
	g._lastWorkerRecoveryReloadAt = 0;
	window.history.replaceState(null, "", "/testchannel");
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	delete g._doPlayerTask;
});

function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

function makeBridgePort() {
	return {
		messages: [] as unknown[],
		started: false,
		closed: false,
		postMessage(message: unknown) {
			this.messages.push(message);
		},
		addEventListener() {},
		removeEventListener() {},
		start() {
			this.started = true;
		},
		close() {
			this.closed = true;
		},
	};
}

describe("MAIN bridge token handshake", () => {
	it("rejects arbitrary page bridge tokens before MAIN creates one", () => {
		const attachBridgePort =
			T<(port: MessagePort, sessionToken?: string | null) => boolean>(
				"_attachBridgePort",
			);
		const port = makeBridgePort();

		expect(
			attachBridgePort(port as unknown as MessagePort, "x".repeat(48)),
		).toBe(false);
		expect(port.started).toBe(false);
	});

	it("accepts only the current MAIN-created bridge token", () => {
		const getBridgeSessionToken = T<() => string>("_getBridgeSessionToken");
		const attachBridgePort =
			T<(port: MessagePort, sessionToken?: string | null) => boolean>(
				"_attachBridgePort",
			);
		const sessionToken = getBridgeSessionToken();
		const wrongPort = makeBridgePort();

		expect(
			attachBridgePort(wrongPort as unknown as MessagePort, "y".repeat(48)),
		).toBe(false);
		expect(wrongPort.started).toBe(false);

		const acceptedPort = makeBridgePort();
		expect(
			attachBridgePort(acceptedPort as unknown as MessagePort, sessionToken),
		).toBe(true);
		expect(acceptedPort.started).toBe(true);
	});
});

describe("worker recovery lifecycle", () => {
	it("caps recovery attempts across replacement workers for the same playback context", () => {
		const recordAttempt = T<
			(context: Record<string, unknown>, now?: number) => boolean
		>("_recordWorkerRecoveryAttempt");
		const context = { MediaType: "live", ChannelName: "testchannel" };

		expect(recordAttempt(context, 1000)).toBe(true);
		expect(recordAttempt(context, 2000)).toBe(true);
		expect(recordAttempt(context, 3000)).toBe(true);
		expect(recordAttempt(context, 4000)).toBe(false);
		expect((g._WorkerRecoveryState as Record<string, unknown>).attempts).toBe(
			3,
		);
	});

	it("resets the cap only after a replacement worker stays healthy", () => {
		const recordAttempt = T<
			(context: Record<string, unknown>, now?: number) => boolean
		>("_recordWorkerRecoveryAttempt");
		const resetIfStable = T<
			(context: Record<string, unknown>, now?: number) => void
		>("_resetWorkerRecoveryStateIfStable");
		const context = { MediaType: "live", ChannelName: "testchannel" };

		expect(recordAttempt(context, 1000)).toBe(true);
		resetIfStable(context, 1000 + 59999);
		expect((g._WorkerRecoveryState as Record<string, unknown>).attempts).toBe(
			1,
		);

		resetIfStable(context, 1000 + 60000);
		expect((g._WorkerRecoveryState as Record<string, unknown>).attempts).toBe(
			0,
		);
	});

	it("tracks latest page context on worker objects so SPA navigation is not stale", () => {
		const rememberContext = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => Record<string, unknown>
		>("_rememberWorkerPageContext");
		const getContext = T<
			(
				worker: Record<string, unknown>,
				fallback?: Record<string, unknown>,
			) => Record<string, unknown>
		>("_getWorkerPlaybackContext");
		const worker: Record<string, unknown> = {};

		rememberContext(worker, { MediaType: "live", ChannelName: "oldchannel" });
		rememberContext(worker, { MediaType: "live", ChannelName: "newchannel" });

		expect(worker.__TTVABPageChannel).toBe("newchannel");
		expect(worker.__TTVABPageMediaKey).toBe("live:newchannel");
		expect(getContext(worker).MediaKey).toBe("live:newchannel");
	});

	it("keeps the pip worker on its original context when the page navigates", () => {
		const rememberContext = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => Record<string, unknown>
		>("_rememberWorkerPageContext");
		const getContext = T<
			(worker: Record<string, unknown>) => Record<string, unknown>
		>("_getWorkerPlaybackContext");
		const broadcast =
			T<(message: Record<string, unknown>) => void>("_broadcastWorkers");
		const pipWorker = { postMessage: vi.fn() };
		const pageWorker = { postMessage: vi.fn() };
		rememberContext(pipWorker, {
			MediaType: "live",
			ChannelName: "pipchannel",
		});
		rememberContext(pageWorker, {
			MediaType: "live",
			ChannelName: "oldpage",
		});
		(g._S as { workers: unknown[] }).workers = [pipWorker, pageWorker];

		broadcast({
			key: "UpdatePageContext",
			value: {
				mediaType: "live",
				channelName: "newpage",
				mediaKey: "live:newpage",
				preservedMediaKey: "live:pipchannel",
			},
		});

		expect(getContext(pipWorker).MediaKey).toBe("live:pipchannel");
		expect(getContext(pageWorker).MediaKey).toBe("live:newpage");
	});

	it("sends ad-context updates only to workers for the matching stream", () => {
		const rememberContext = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => Record<string, unknown>
		>("_rememberWorkerPageContext");
		const broadcast =
			T<(message: Record<string, unknown>) => void>("_broadcastWorkers");
		const pipWorker = { postMessage: vi.fn() };
		const pageWorker = { postMessage: vi.fn() };
		rememberContext(pipWorker, {
			MediaType: "live",
			ChannelName: "pipchannel",
		});
		rememberContext(pageWorker, {
			MediaType: "live",
			ChannelName: "pagechannel",
		});
		(g._S as { workers: unknown[] }).workers = [pipWorker, pageWorker];

		broadcast({
			key: "UpdateCurrentAdContext",
			targetMediaKey: "live:pipchannel",
			value: {
				channelName: "pipchannel",
				mediaKey: "live:pipchannel",
			},
		});

		expect(pipWorker.postMessage).toHaveBeenCalledOnce();
		expect(pageWorker.postMessage).not.toHaveBeenCalled();
	});

	it("clears missed heartbeat count when a worker replies", () => {
		const markPong =
			T<(worker: Record<string, unknown>, now?: number) => void>(
				"_markWorkerPong",
			);
		const worker: Record<string, unknown> = {
			__TTVABMissedPongs: 1,
		};

		markPong(worker, 1000);

		expect(worker.__TTVABMissedPongs).toBe(0);
		expect(worker.__TTVABLastPongAt).toBe(1000);
	});

	it("keeps recovery-critical messages from a crashed current worker alive", () => {
		const canHandle = T<
			(
				data: Record<string, unknown>,
				worker: Record<string, unknown>,
				pageContext: Record<string, unknown>,
				currentContext: Record<string, unknown>,
			) => boolean
		>("_canHandleCrashedWorkerMessage");
		const worker: Record<string, unknown> = {
			__TTVABPageMediaType: "live",
			__TTVABPageChannel: "testchannel",
			__TTVABPageMediaKey: "live:testchannel",
		};
		const pageContext = { MediaType: "live", ChannelName: "testchannel" };
		const currentContext = {
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		};

		expect(
			canHandle({ key: "FetchRequest" }, worker, pageContext, currentContext),
		).toBe(true);
		expect(
			canHandle(
				{ key: "NativePlaybackRestored" },
				worker,
				pageContext,
				currentContext,
			),
		).toBe(true);
		expect(
			canHandle({ key: "Pong" }, worker, pageContext, currentContext),
		).toBe(false);
		expect(
			canHandle({ key: "FetchRequest" }, worker, pageContext, {
				MediaType: "live",
				ChannelName: "otherchannel",
				MediaKey: "live:otherchannel",
			}),
		).toBe(false);
	});

	it("keeps recovery-critical messages from a crashed pip worker after navigation", () => {
		const canHandle = T<
			(
				data: Record<string, unknown>,
				worker: Record<string, unknown>,
				pageContext: Record<string, unknown>,
				currentContext: Record<string, unknown>,
			) => boolean
		>("_canHandleCrashedWorkerMessage");
		const previousPipMatch = g._isActivePictureInPicturePlaybackContext;
		g._isActivePictureInPicturePlaybackContext = (
			context: Record<string, unknown>,
		) => context.MediaKey === "live:testchannel";
		try {
			expect(
				canHandle(
					{ key: "NativePlaybackRestored" },
					{
						__TTVABPageMediaType: "live",
						__TTVABPageChannel: "testchannel",
						__TTVABPageMediaKey: "live:testchannel",
					},
					{ MediaType: "live", ChannelName: "testchannel" },
					{
						MediaType: "live",
						ChannelName: "otherchannel",
						MediaKey: "live:otherchannel",
					},
				),
			).toBe(true);
		} finally {
			g._isActivePictureInPicturePlaybackContext = previousPipMatch;
		}
	});

	it("installs fallback and schedules recovery for an instant crash", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const recover = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
				message: string,
				level?: string,
			) => boolean
		>("_recoverCrashedWorker");
		const previousInstallFallback = g._installPageSideM3U8Override;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		let installedFallback = 0;
		let reloads = 0;
		g._installPageSideM3U8Override = () => {
			installedFallback++;
		};
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._doPlayerTask = () => {
			reloads++;
			return true;
		};

		try {
			const worker: Record<string, unknown> = {};
			const didRecover = recover(
				worker,
				{ MediaType: "live", ChannelName: "testchannel" },
				"Worker crashed: boom",
				"error",
			);

			expect(didRecover).toBe(true);
			expect(worker.__TTVABCrashed).toBe(true);
			expect(installedFallback).toBe(1);
			expect(reloads).toBe(0);

			vi.advanceTimersByTime(1000);
			expect(reloads).toBe(1);
		} finally {
			if (previousInstallFallback === undefined) {
				delete g._installPageSideM3U8Override;
			} else {
				g._installPageSideM3U8Override = previousInstallFallback;
			}
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("retries replacement worker recovery after reload cooldown instead of dropping it", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const attempt = T<
			(
				worker: Record<string, unknown>,
				context: Record<string, unknown>,
			) => void
		>("_attemptWorkerRestart");
		const reloads: unknown[][] = [];
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._lastWorkerRecoveryReloadAt = 100000;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		g._doPlayerTask = (...args: unknown[]) => {
			reloads.push(args);
			return true;
		};

		try {
			attempt({}, { MediaType: "live", ChannelName: "testchannel" });
			vi.advanceTimersByTime(1000);
			expect(reloads).toHaveLength(0);

			vi.advanceTimersByTime(28999);
			expect(reloads).toHaveLength(0);

			vi.advanceTimersByTime(1);
			expect(reloads).toHaveLength(1);
			expect(reloads[0][2]).toEqual({
				reason: "worker-recovery",
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
				channel: "testchannel",
				mediaKey: "live:testchannel",
			});
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});
});

describe("page-side M3U8 fallback", () => {
	it("detects Twitch ad metadata beyond literal stitched-ad markers", () => {
		const hasMetadata = T<(text: string) => boolean>("_hasTwitchAdMetadata");

		expect(hasMetadata("#EXTM3U\n#EXT-X-CUE-OUT:30")).toBe(true);
		expect(hasMetadata('#EXTM3U\n#EXT-X-DATERANGE:CLASS="twitch-ad"')).toBe(
			true,
		);
		expect(hasMetadata("#EXTM3U\n#EXTINF:2.000,\nclean.ts")).toBe(false);
	});

	it("strips degraded fallback ad blocks marked by cue-out tags", () => {
		const strip = T<(text: string) => string>("_stripM3U8Ads");
		const playlist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:1",
			"#EXT-X-CUE-OUT:30",
			"#EXTINF:2.000,",
			"ad-1.ts",
			"#EXT-X-DISCONTINUITY",
			"#EXTINF:2.000,",
			"ad-2.ts",
			"#EXT-X-DISCONTINUITY",
			"#EXTINF:2.000,",
			"clean.ts",
		].join("\n");

		const stripped = strip(playlist);

		expect(stripped).not.toContain("#EXT-X-CUE-OUT");
		expect(stripped).not.toContain("ad-1.ts");
		expect(stripped).not.toContain("ad-2.ts");
		expect(stripped).not.toContain("clean.ts");
		expect(stripped).toContain("__ttvab_empty_hold_segment.mp4");
	});

	it("serves an advancing empty hold when degraded stripping removes every segment", () => {
		const strip =
			T<(text: string, info?: Record<string, unknown> | null) => string>(
				"_stripM3U8Ads",
			);
		const playlist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:70",
			"#EXT-X-CUE-OUT:30",
			"#EXTINF:2.000,",
			"ad-70.ts",
			"#EXTINF:2.000,",
			"ad-71.ts",
		].join("\n");
		const info = {
			MediaKey: "live:testchannel",
			_EmptyAdHoldMediaSequence: 0,
		};

		const first = strip(playlist, info);
		const second = strip(playlist, info);

		expect(first).not.toContain("ad-70.ts");
		expect(first).not.toContain("ad-71.ts");
		expect(first).toContain("__ttvab_empty_hold_segment.mp4");
		expect(first).toContain("#EXT-X-MEDIA-SEQUENCE:71");
		expect(second).toContain("#EXT-X-MEDIA-SEQUENCE:72");
	});

	it("blocks markerless ad segments and LL-HLS parts in degraded mode", async () => {
		const install = T<() => void>("_installPageSideM3U8Override");
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalFetch = window.fetch;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const originalFallbackActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
		const playlist = [
			"#EXTM3U",
			"#EXT-X-VERSION:9",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:300",
			"#EXTINF:2.000,",
			"https://edge.example/_404/ad-300.ts",
			'#EXT-X-PART:DURATION=0.333,URI="https://edge.example/adsquared/ad-301.m4s"',
			'#EXT-X-PRELOAD-HINT:TYPE=PART,URI="https://edge.example/_404/ad-302.m4s"',
		].join("\n");
		const rawFetch = vi.fn(async () => new Response(playlist, { status: 200 }));
		const variantCodecByUrl = g._pageSideVariantCodecByUrl as Map<
			string,
			string
		>;
		window.fetch = rawFetch as typeof fetch;
		scopedWindow.__TTVAB_REAL_FETCH__ = null;
		scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;
		(g._pageSideEmptyHoldInfoByUrl as Map<string, unknown>).clear();
		variantCodecByUrl.clear();

		try {
			install();
			const url =
				"https://video-weaver.example.ttvnw.net/v1/playlist/live.m3u8";
			T<(text: string, baseUrl: string) => boolean>(
				"_rememberPageSideVariantCodecs",
			)(
				[
					"#EXTM3U",
					'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="avc1.64002A,mp4a.40.2"',
					url,
				].join("\n"),
				"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8",
			);
			const first = await (await window.fetch(url)).text();
			const second = await (await window.fetch(url)).text();
			for (const output of [first, second]) {
				expect(output).not.toContain("/_404/");
				expect(output).not.toContain("/adsquared/");
				expect(output).not.toContain("#EXT-X-PART:");
				expect(output).not.toContain("#EXT-X-PRELOAD-HINT:");
				const lines = output.split("\n");
				for (let i = 0; i < lines.length; i++) {
					if (!lines[i]?.startsWith("#EXTINF")) continue;
					expect(lines[i + 1]).toBeTruthy();
					expect(lines[i + 1]?.startsWith("#")).toBe(false);
				}
			}
			expect(first).toContain("__ttvab_empty_hold_segment.mp4");
			expect(first).toContain("#EXT-X-MEDIA-SEQUENCE:301");
			expect(second).toContain("#EXT-X-MEDIA-SEQUENCE:302");
			expect(rawFetch).toHaveBeenCalledTimes(2);
		} finally {
			window.fetch = originalFetch;
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
			if (originalFallbackActive === undefined) {
				delete scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
			} else {
				scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = originalFallbackActive;
			}
		}
	});

	it.each([
		"hevc",
		"av1",
		null,
	])("aborts an all-ad degraded playlist whose rendition codec is %s", async (codecFamily) => {
		const install = T<() => void>("_installPageSideM3U8Override");
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalFetch = window.fetch;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const originalFallbackActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
		const playlist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:410",
			"#EXTINF:2.000,",
			"https://edge.example/_404/ad-410.ts",
		].join("\n");
		const rawFetch = vi.fn(async () => new Response(playlist, { status: 200 }));
		const url = `https://video-weaver.example.ttvnw.net/v1/playlist/${
			codecFamily || "unknown"
		}-live.m3u8`;
		const variantCodecByUrl = g._pageSideVariantCodecByUrl as Map<
			string,
			string
		>;
		window.fetch = rawFetch as typeof fetch;
		scopedWindow.__TTVAB_REAL_FETCH__ = null;
		scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;
		(g._pageSideEmptyHoldInfoByUrl as Map<string, unknown>).clear();
		variantCodecByUrl.clear();
		if (codecFamily) {
			const codec =
				codecFamily === "hevc" ? "hev1.1.6.L153.B0" : "av01.0.13M.08";
			T<(text: string, baseUrl: string) => boolean>(
				"_rememberPageSideVariantCodecs",
			)(
				[
					"#EXTM3U",
					`#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,CODECS="${codec},mp4a.40.2"`,
					url,
				].join("\n"),
				"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8",
			);
		}

		try {
			install();
			await expect(window.fetch(url)).rejects.toMatchObject({
				name: "AbortError",
			});
			expect(rawFetch).toHaveBeenCalledOnce();
		} finally {
			window.fetch = originalFetch;
			variantCodecByUrl.clear();
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
			if (originalFallbackActive === undefined) {
				delete scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
			} else {
				scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = originalFallbackActive;
			}
		}
	});

	it("does not refetch raw media when degraded inspection throws", async () => {
		const install = T<() => void>("_installPageSideM3U8Override");
		const scopedWindow = window as unknown as Record<string, unknown>;
		const originalFetch = window.fetch;
		const originalRealFetch = scopedWindow.__TTVAB_REAL_FETCH__;
		const originalFallbackActive = scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
		const response = new Response("#EXTM3U", { status: 200 });
		vi.spyOn(response, "clone").mockReturnValue({
			text: async () => {
				throw new Error("body inspection failed");
			},
		} as Response);
		const rawFetch = vi.fn(async () => response);
		window.fetch = rawFetch as typeof fetch;
		scopedWindow.__TTVAB_REAL_FETCH__ = null;
		scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = false;

		try {
			install();
			await expect(
				window.fetch(
					"https://video-weaver.example.ttvnw.net/v1/playlist/live.m3u8",
				),
			).rejects.toThrow("body inspection failed");
			expect(rawFetch).toHaveBeenCalledTimes(1);
		} finally {
			window.fetch = originalFetch;
			if (originalRealFetch === undefined) {
				delete scopedWindow.__TTVAB_REAL_FETCH__;
			} else {
				scopedWindow.__TTVAB_REAL_FETCH__ = originalRealFetch;
			}
			if (originalFallbackActive === undefined) {
				delete scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE;
			} else {
				scopedWindow.__TTVAB_M3U8_FALLBACK_ACTIVE = originalFallbackActive;
			}
		}
	});

	it("cycle-fences delayed post-ad artifact cleanup", () => {
		vi.useFakeTimers();
		const schedule = T<
			(channel: string, mediaKey: string, cycleStartedAt: number) => unknown
		>("_schedulePostAdArtifactCleanup");
		const previousRunCleanup = g._runPostAdArtifactCleanup;
		const previousRecoveryContext = g._isPlaybackRecoveryContextCurrent;
		const previousCycleCurrent = g._isCodecHandoffCycleCurrent;
		const runCleanup = vi.fn();
		g._runPostAdArtifactCleanup = runCleanup;
		g._isPlaybackRecoveryContextCurrent = () => true;
		g._isCodecHandoffCycleCurrent = (_mediaKey: string, cycle: number) =>
			cycle === 200;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;

		try {
			schedule("testchannel", "live:testchannel", 100);
			state.CurrentAdChannel = "testchannel";
			state.CurrentAdMediaKey = "live:testchannel";
			state.AdPodProgressByMediaKey = {
				"live:testchannel": { cycleStartedAt: 200 },
			};
			vi.advanceTimersByTime(80);

			expect(runCleanup).not.toHaveBeenCalled();
		} finally {
			if (previousRunCleanup === undefined) delete g._runPostAdArtifactCleanup;
			else g._runPostAdArtifactCleanup = previousRunCleanup;
			if (previousRecoveryContext === undefined) {
				delete g._isPlaybackRecoveryContextCurrent;
			} else {
				g._isPlaybackRecoveryContextCurrent = previousRecoveryContext;
			}
			if (previousCycleCurrent === undefined) {
				delete g._isCodecHandoffCycleCurrent;
			} else {
				g._isCodecHandoffCycleCurrent = previousCycleCurrent;
			}
		}
	});

	it("accepts lifecycle acknowledgements only for the current same-media cycle", () => {
		const isLifecycleCycleCurrent = T<
			(mediaKey: string, cycleStartedAt: number) => boolean
		>("_isPageLifecycleCycleCurrent");
		const previousCycleCurrent = g._isCodecHandoffCycleCurrent;
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 200 },
		};
		g._isCodecHandoffCycleCurrent = (mediaKey: string, cycle: number) =>
			mediaKey === "live:testchannel" && cycle === 200;

		try {
			expect(isLifecycleCycleCurrent("live:testchannel", 100)).toBe(false);
			expect(isLifecycleCycleCurrent("live:testchannel", 200)).toBe(true);
		} finally {
			if (previousCycleCurrent === undefined) {
				delete g._isCodecHandoffCycleCurrent;
			} else {
				g._isCodecHandoffCycleCurrent = previousCycleCurrent;
			}
		}
	});
});

describe("worker mixed-codec master selection", () => {
	it("keeps 1440p HEVC/AV1 selectable normally and filters only for an exact current handoff", async () => {
		const originalFetch = g.fetch;
		const master = [
			"#EXTM3U",
			'#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="hev1.1.6.L153.B0,mp4a.40.2",VIDEO="1440p60-hevc"',
			"https://edge.example/1440-hevc/index.m3u8",
			'#EXT-X-STREAM-INF:BANDWIDTH=14000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="av01.0.13M.08,mp4a.40.2",VIDEO="1440p60-av1"',
			"https://edge.example/1440-av1/index.m3u8",
			'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.64002A,mp4a.40.2",VIDEO="1080p60"',
			"https://edge.example/1080-avc/index.m3u8",
		].join("\n");
		const rawFetch = vi.fn(async () => new Response(master, { status: 200 }));
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageMediaKey = "live:testchannel";
		g.fetch = rawFetch;
		const usherUrl =
			"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8?sig=test&token=test";

		try {
			T<() => void>("_hookWorkerFetch")();
			const normalMaster = await (
				await (g.fetch as typeof fetch)(usherUrl)
			).text();
			const info = (
				state.StreamInfos as Record<string, Record<string, unknown>>
			)["live:testchannel"];

			expect(normalMaster).toContain("2560x1440");
			expect(normalMaster).toContain("1440-hevc/index.m3u8");
			expect(normalMaster).toContain("1440-av1/index.m3u8");
			expect(info.ModifiedM3U8).not.toContain("2560x1440");
			expect(info.IsUsingModifiedM3U8).toBe(false);
			info.EnhancedDecoderCodecFamily = "hevc";
			info.EnhancedDecoderCodec = "hev1.1.6.L153.B0";

			const cycleStartedAt = 100;
			const handoffId = "live:testchannel:100:1000:1:exact-current-handoff";
			info.IsShowingAd = true;
			info.VisibleAdStartedAt = cycleStartedAt;
			info._CodecHandoffPendingId = handoffId;
			state.CurrentAdChannel = "testchannel";
			state.CurrentAdMediaKey = "live:testchannel";
			state.AdPodProgressByMediaKey = {
				"live:testchannel": { cycleStartedAt },
			};
			state.ActiveCodecHandoffId = handoffId;
			state.ActiveCodecHandoffChannel = "testchannel";
			state.ActiveCodecHandoffMediaKey = "live:testchannel";

			const handoffMaster = await (
				await (g.fetch as typeof fetch)(usherUrl)
			).text();
			expect(handoffMaster).not.toContain("2560x1440");
			expect(handoffMaster).not.toContain("1440-hevc/index.m3u8");
			expect(handoffMaster).not.toContain("1440-av1/index.m3u8");
			expect(handoffMaster).toContain("1080-avc/index.m3u8");
			expect(info.IsUsingModifiedM3U8).toBe(true);
			expect(info.EnhancedDecoderCodecFamily).toBe(null);
			expect(info.EnhancedDecoderCodec).toBe(null);
		} finally {
			g.fetch = originalFetch;
		}
	});
});

describe("worker media-playlist exception fail-closed path", () => {
	it.each([
		{
			label: "HEVC",
			family: "hevc",
			codec: "hev1.1.6.L153.B0",
		},
		{
			label: "AV1",
			family: "av1",
			codec: "av01.0.13M.08",
		},
	])("aborts an AVC empty hold while the $label decoder owns playback", async ({
		family,
		codec,
	}) => {
		const originalFetch = g.fetch;
		const rawFetch = vi.fn(async () => new Response(null, { status: 200 }));
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		info.EnhancedDecoderCodecFamily = family;
		info.EnhancedDecoderCodec = codec;
		state.StreamInfos = { "live:testchannel": info };
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		g.fetch = rawFetch;
		const emptyHoldUrl =
			"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4?seq=1&media=live%3Atestchannel";

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect(
				(g.fetch as typeof fetch)(emptyHoldUrl),
			).rejects.toMatchObject({
				name: "AbortError",
			});
			expect(rawFetch).not.toHaveBeenCalled();
		} finally {
			g.fetch = originalFetch;
		}
	});

	it("keeps the AVC empty hold available after enhanced ownership clears", async () => {
		const originalFetch = g.fetch;
		const rawFetch = vi.fn(async () => new Response(null, { status: 200 }));
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		state.StreamInfos = { "live:testchannel": info };
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		g.fetch = rawFetch;
		const emptyHoldUrl =
			"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4?seq=1&media=live%3Atestchannel";

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect(
				(g.fetch as typeof fetch)(emptyHoldUrl),
			).resolves.toBeInstanceOf(Response);
			expect(rawFetch).toHaveBeenCalledOnce();
			expect(rawFetch).toHaveBeenCalledWith(g._EMPTY_SEGMENT_URL);
		} finally {
			g.fetch = originalFetch;
		}
	});

	it.each([
		{
			label: "ad-marked",
			playlist: [
				"#EXTM3U",
				"#EXT-X-TARGETDURATION:2",
				"#EXT-X-MEDIA-SEQUENCE:500",
				"#EXT-X-CUE-OUT:30",
				"#EXTINF:2.000,",
				"ad-500.ts",
			].join("\n"),
		},
		{
			label: "clean",
			playlist: [
				"#EXTM3U",
				"#EXT-X-TARGETDURATION:2",
				"#EXT-X-MEDIA-SEQUENCE:500",
				"#EXTINF:2.000,live",
				"clean-500.ts",
			].join("\n"),
		},
	])("does not expose an AVC $label response after enhanced-owner processing fails", async ({
		playlist,
	}) => {
		const originalFetch = g.fetch;
		const originalProcess = g._processM3U8;
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/avc-active.m3u8";
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const resolution = {
			Name: "1080p60",
			Resolution: "1920x1080",
			FrameRate: 60,
			Codecs: "avc1.64002A,mp4a.40.2",
		};
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		info.IsShowingAd = true;
		info.VisibleAdStartedAt = 100;
		info.EnhancedDecoderCodecFamily = "hevc";
		info.EnhancedDecoderCodec = "hev1.1.6.L153.B0";
		info.ResolutionList = [resolution];
		info.Urls = Object.create(null);
		for (const alias of T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			mediaUrl,
		)) {
			(info.Urls as Record<string, unknown>)[alias] = resolution;
			(state.StreamInfosByUrl as Record<string, unknown>)[alias] = info;
		}
		(state.StreamInfos as Record<string, unknown>)["live:testchannel"] = info;
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 100 },
		};
		const rawFetch = vi.fn(async () => {
			info.EnhancedDecoderCodecFamily = null;
			info.EnhancedDecoderCodec = null;
			return new Response(playlist, { status: 200 });
		});
		g.fetch = rawFetch;
		g._processM3U8 = async () => {
			throw new Error("forced processing failure");
		};

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect((g.fetch as typeof fetch)(mediaUrl)).rejects.toMatchObject({
				name: "AbortError",
			});
			expect(rawFetch).toHaveBeenCalledOnce();
		} finally {
			g.fetch = originalFetch;
			g._processM3U8 = originalProcess;
		}
	});

	it("aborts an ad-marked unresolved rendition after processing fails", async () => {
		const originalFetch = g.fetch;
		const originalProcess = g._processM3U8;
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/rotated-unresolved.m3u8";
		const adPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:500",
			"#EXT-X-CUE-OUT:30",
			"#EXTINF:2.000,",
			"ad-500.ts",
		].join("\n");
		const rawFetch = vi.fn(
			async () => new Response(adPlaylist, { status: 200 }),
		);
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		info.IsShowingAd = true;
		info.VisibleAdStartedAt = 100;
		info.Urls = Object.create(null);
		for (const alias of T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			mediaUrl,
		)) {
			(state.StreamInfosByUrl as Record<string, unknown>)[alias] = info;
		}
		(state.StreamInfos as Record<string, unknown>)["live:testchannel"] = info;
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 100 },
		};
		g.fetch = rawFetch;
		g._processM3U8 = async () => {
			throw new Error("forced processing failure");
		};

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect((g.fetch as typeof fetch)(mediaUrl)).rejects.toMatchObject({
				name: "AbortError",
			});
			expect(rawFetch).toHaveBeenCalledOnce();
		} finally {
			g.fetch = originalFetch;
			g._processM3U8 = originalProcess;
		}
	});

	it.each([
		{ label: "the 1440p ad context", ownerAtStart: true },
		{ label: "the 1440p owner and ad context", ownerAtStart: false },
	])("aborts an AVC response when $label activates during fetch", async ({
		ownerAtStart,
	}) => {
		const originalFetch = g.fetch;
		const cleanPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:500",
			"#EXTINF:2.000,live",
			"clean-500.ts",
		].join("\n");
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/avc-activating.m3u8";
		const resolution = {
			Name: "1080p60",
			Resolution: "1920x1080",
			FrameRate: 60,
			Codecs: "avc1.64002A,mp4a.40.2",
		};
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		info.EnhancedDecoderCodecFamily = ownerAtStart ? "hevc" : null;
		info.EnhancedDecoderCodec = ownerAtStart ? "hev1.1.6.L153.B0" : null;
		info.ResolutionList = [resolution];
		info.Urls = Object.create(null);
		for (const alias of T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			mediaUrl,
		)) {
			(info.Urls as Record<string, unknown>)[alias] = resolution;
			(state.StreamInfosByUrl as Record<string, unknown>)[alias] = info;
		}
		(state.StreamInfos as Record<string, unknown>)["live:testchannel"] = info;
		state.CurrentAdChannel = null;
		state.CurrentAdMediaKey = null;
		const rawFetch = vi.fn(async () => {
			if (!ownerAtStart) {
				info.EnhancedDecoderCodecFamily = "hevc";
				info.EnhancedDecoderCodec = "hev1.1.6.L153.B0";
			}
			state.CurrentAdChannel = "testchannel";
			state.CurrentAdMediaKey = "live:testchannel";
			state.AdPodProgressByMediaKey = {
				"live:testchannel": { cycleStartedAt: 100 },
			};
			return new Response(cleanPlaylist, { status: 200 });
		});
		g.fetch = rawFetch;

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect((g.fetch as typeof fetch)(mediaUrl)).rejects.toMatchObject({
				name: "AbortError",
			});
			expect(rawFetch).toHaveBeenCalledOnce();
		} finally {
			g.fetch = originalFetch;
		}
	});

	it("aborts a stale in-flight AVC response from the retiring 1440p ad cycle", async () => {
		const originalFetch = g.fetch;
		const opaqueAdUrl = "https://edge.example/opaque/stale-worker-ad-500.ts";
		const opaqueAdPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:500",
			"#EXTINF:2.000,",
			opaqueAdUrl,
		].join("\n");
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/avc-stale.m3u8";
		const resolution = {
			Name: "1080p60",
			Resolution: "1920x1080",
			FrameRate: 60,
			Codecs: "avc1.64002A,mp4a.40.2",
		};
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		info.IsShowingAd = true;
		info.VisibleAdStartedAt = 100;
		info.EnhancedDecoderCodecFamily = "hevc";
		info.EnhancedDecoderCodec = "hev1.1.6.L153.B0";
		info.ResolutionList = [resolution];
		info.Urls = Object.create(null);
		for (const alias of T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			mediaUrl,
		)) {
			(info.Urls as Record<string, unknown>)[alias] = resolution;
			(state.StreamInfosByUrl as Record<string, unknown>)[alias] = info;
		}
		(state.StreamInfos as Record<string, unknown>)["live:testchannel"] = info;
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 100 },
		};
		state.AdSegmentCache = new Map([[opaqueAdUrl, Date.now()]]);
		const rawFetch = vi.fn(async () => {
			info.IsShowingAd = false;
			info.IsHoldingBackupAfterAd = false;
			info.EnhancedDecoderCodecFamily = null;
			info.EnhancedDecoderCodec = null;
			state.CurrentAdChannel = null;
			state.CurrentAdMediaKey = null;
			state.AdPodProgressByMediaKey = Object.create(null);
			return new Response(opaqueAdPlaylist, { status: 200 });
		});
		g.fetch = rawFetch;
		const controller = new AbortController();

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect(
				(g.fetch as typeof fetch)(
					new Request(mediaUrl, { signal: controller.signal }),
				),
			).rejects.toMatchObject({ name: "AbortError" });
			expect(rawFetch).toHaveBeenCalledOnce();
		} finally {
			g.fetch = originalFetch;
		}
	});

	it("does not let stale pod progress abort the first clean post-ad playlist", async () => {
		const originalFetch = g.fetch;
		const cleanPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:600",
			"#EXTINF:2.000,live",
			"clean-600.ts",
		].join("\n");
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/post-ad-avc.m3u8";
		const resolution = {
			Name: "1080p60",
			Resolution: "1920x1080",
			FrameRate: 60,
			Codecs: "avc1.64002A,mp4a.40.2",
		};
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		info.ResolutionList = [resolution];
		info.Urls = Object.create(null);
		for (const alias of T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			mediaUrl,
		)) {
			(info.Urls as Record<string, unknown>)[alias] = resolution;
			(state.StreamInfosByUrl as Record<string, unknown>)[alias] = info;
		}
		(state.StreamInfos as Record<string, unknown>)["live:testchannel"] = info;
		state.CurrentAdChannel = null;
		state.CurrentAdMediaKey = null;
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 100 },
		};
		const rawFetch = vi.fn(
			async () => new Response(cleanPlaylist, { status: 200 }),
		);
		g.fetch = rawFetch;

		try {
			T<() => void>("_hookWorkerFetch")();
			const result = await (await (g.fetch as typeof fetch)(mediaUrl)).text();
			expect(result).toContain("clean-600.ts");
			expect(rawFetch).toHaveBeenCalledOnce();
		} finally {
			g.fetch = originalFetch;
		}
	});

	it("strips an opaque cached ad only for its exact active media cycle", async () => {
		const originalFetch = g.fetch;
		const originalProcess = g._processM3U8;
		const opaqueAdUrl = "https://edge.example/opaque/worker-ad-500.ts";
		const opaqueAdPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:500",
			"#EXTINF:2.000,",
			opaqueAdUrl,
		].join("\n");
		const rawFetch = vi.fn(
			async () => new Response(opaqueAdPlaylist, { status: 200 }),
		);
		T<(scope: Record<string, unknown>) => void>("_declareState")(g);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/avc-active.m3u8";
		const resolution = {
			Name: "1080p60",
			Resolution: "1920x1080",
			FrameRate: 60,
			Codecs: "avc1.64002A,mp4a.40.2",
		};
		const info = T<
			(context: Record<string, unknown>) => Record<string, unknown>
		>("_createStreamInfo")({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		info.EncodingsM3U8 = "#EXTM3U";
		info.IsShowingAd = true;
		info.VisibleAdStartedAt = 100;
		info.ResolutionList = [resolution];
		info.Urls = Object.create(null);
		for (const alias of T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			mediaUrl,
		)) {
			(info.Urls as Record<string, unknown>)[alias] = resolution;
			(state.StreamInfosByUrl as Record<string, unknown>)[alias] = info;
		}
		(state.StreamInfos as Record<string, unknown>)["live:testchannel"] = info;
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageMediaKey = "live:testchannel";
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 100 },
		};
		state.AdSegmentCache = new Map([[opaqueAdUrl, Date.now()]]);
		g.fetch = rawFetch;
		let processCalls = 0;
		g._processM3U8 = async () => {
			processCalls++;
			if (processCalls === 1) {
				info.IsShowingAd = false;
				info.IsHoldingBackupAfterAd = false;
				state.CurrentAdChannel = null;
				state.CurrentAdMediaKey = null;
			}
			throw new Error("forced processing failure");
		};

		try {
			T<() => void>("_hookWorkerFetch")();
			const activeResult = await (
				await (g.fetch as typeof fetch)(mediaUrl)
			).text();
			expect(activeResult).not.toContain(opaqueAdUrl);
			expect(activeResult).toContain("__ttvab_empty_hold_segment.mp4");

			const staleResult = await (
				await (g.fetch as typeof fetch)(mediaUrl)
			).text();
			expect(staleResult).toBe(opaqueAdPlaylist);
			expect(rawFetch).toHaveBeenCalledTimes(2);
		} finally {
			g.fetch = originalFetch;
			g._processM3U8 = originalProcess;
		}
	});
});

describe("worker ad-segment codec ownership", () => {
	const enhancedOrUnknownCases = [
		{
			label: "explicit HEVC",
			url: "https://edge.example/_404/hevc-ad.ts",
			cached: false,
			owner: {
				codecFamily: "hevc",
				mediaKey: "live:testchannel",
				recordedAt: 100,
				ambiguous: false,
			},
		},
		{
			label: "cached AV1",
			url: "https://edge.example/ad-cycle/av1-ad.m4s",
			cached: true,
			owner: {
				codecFamily: "av1",
				mediaKey: "live:testchannel",
				recordedAt: 100,
				ambiguous: false,
			},
		},
		{
			label: "explicit unknown-codec",
			url: "https://edge.example/adsquared/unowned-ad.ts",
			cached: false,
			owner: null,
		},
		{
			label: "cached ambiguous-codec",
			url: "https://edge.example/ad-cycle/ambiguous-ad.m4s",
			cached: true,
			owner: {
				codecFamily: null,
				mediaKey: null,
				recordedAt: 100,
				ambiguous: true,
			},
		},
	];

	it.each(
		enhancedOrUnknownCases,
	)("aborts a $label ad segment without fetching an AVC empty segment", async ({
		url,
		cached,
		owner,
	}) => {
		const originalFetch = g.fetch;
		const originalExactKey = g._getExactPlaylistUrlKey;
		const originalAbortError = g._createCodecHandoffAbortError;
		const rawFetch = vi.fn(async () => new Response("unexpected"));
		const exactKey = String(url);
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.SimulatedAdsDepth = 0;
		state.AdSignifier = "stitched";
		state.AdSegmentCache = new Map(cached ? [[exactKey, Date.now()]] : []);
		state.SegmentCodecOwners = new Map(owner ? [[exactKey, owner]] : []);
		g.fetch = rawFetch;
		g._getExactPlaylistUrlKey = (value: unknown) => String(value || "");
		g._createCodecHandoffAbortError = () =>
			new DOMException("Unsafe ad segment codec", "AbortError");

		try {
			T<() => void>("_hookWorkerFetch")();

			await expect((g.fetch as typeof fetch)(url)).rejects.toMatchObject({
				name: "AbortError",
			});
			expect(rawFetch).not.toHaveBeenCalled();
		} finally {
			g.fetch = originalFetch;
			if (originalExactKey === undefined) delete g._getExactPlaylistUrlKey;
			else g._getExactPlaylistUrlKey = originalExactKey;
			if (originalAbortError === undefined) {
				delete g._createCodecHandoffAbortError;
			} else {
				g._createCodecHandoffAbortError = originalAbortError;
			}
		}
	});

	it("uses the AVC empty segment after enhanced decoder ownership clears", async () => {
		const originalFetch = g.fetch;
		const originalExactKey = g._getExactPlaylistUrlKey;
		const originalAbortError = g._createCodecHandoffAbortError;
		const rawFetch = vi.fn(async () => new Response("empty avc segment"));
		const url = "https://edge.example/ad-cycle/avc-ad.ts";
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.SimulatedAdsDepth = 0;
		state.AdSignifier = "stitched";
		state.AdSegmentCache = new Map([[url, Date.now()]]);
		state.SegmentCodecOwners = new Map([
			[
				url,
				{
					codecFamily: "avc",
					mediaKey: "live:testchannel",
					recordedAt: 100,
					ambiguous: false,
				},
			],
		]);
		state.StreamInfos = {
			"live:testchannel": {
				EnhancedDecoderCodecFamily: null,
				EnhancedDecoderCodec: null,
			},
		};
		g.fetch = rawFetch;
		g._getExactPlaylistUrlKey = (value: unknown) => String(value || "");
		g._createCodecHandoffAbortError = () =>
			new DOMException("Unsafe ad segment codec", "AbortError");

		try {
			T<() => void>("_hookWorkerFetch")();

			await expect((g.fetch as typeof fetch)(url)).resolves.toBeInstanceOf(
				Response,
			);
			expect(rawFetch).toHaveBeenCalledOnce();
			expect(rawFetch).toHaveBeenCalledWith(g._EMPTY_SEGMENT_URL);
			expect(rawFetch).not.toHaveBeenCalledWith(url);
		} finally {
			g.fetch = originalFetch;
			if (originalExactKey === undefined) delete g._getExactPlaylistUrlKey;
			else g._getExactPlaylistUrlKey = originalExactKey;
			if (originalAbortError === undefined) {
				delete g._createCodecHandoffAbortError;
			} else {
				g._createCodecHandoffAbortError = originalAbortError;
			}
		}
	});

	it.each([
		{ family: "hevc", codec: "hev1.1.6.L153.B0" },
		{ family: "av1", codec: "av01.0.13M.08" },
	])("aborts an AVC-owned ad segment while the $family decoder still owns playback", async ({
		family,
		codec,
	}) => {
		const originalFetch = g.fetch;
		const originalExactKey = g._getExactPlaylistUrlKey;
		const originalAbortError = g._createCodecHandoffAbortError;
		const rawFetch = vi.fn(async () => new Response("unexpected"));
		const url = "https://edge.example/ad-cycle/avc-owned-enhanced.ts";
		const state = g.__TTVAB_STATE__ as Record<string, unknown>;
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.SimulatedAdsDepth = 0;
		state.AdSignifier = "stitched";
		state.AdSegmentCache = new Map([[url, Date.now()]]);
		state.SegmentCodecOwners = new Map([
			[
				url,
				{
					codecFamily: "avc",
					mediaKey: "live:testchannel",
					recordedAt: 100,
					ambiguous: false,
				},
			],
		]);
		state.StreamInfos = {
			"live:testchannel": {
				EnhancedDecoderCodecFamily: family,
				EnhancedDecoderCodec: codec,
			},
		};
		g.fetch = rawFetch;
		g._getExactPlaylistUrlKey = (value: unknown) => String(value || "");
		g._createCodecHandoffAbortError = () =>
			new DOMException("Unsafe ad segment codec", "AbortError");

		try {
			T<() => void>("_hookWorkerFetch")();
			await expect((g.fetch as typeof fetch)(url)).rejects.toMatchObject({
				name: "AbortError",
			});
			expect(rawFetch).not.toHaveBeenCalled();
		} finally {
			g.fetch = originalFetch;
			if (originalExactKey === undefined) delete g._getExactPlaylistUrlKey;
			else g._getExactPlaylistUrlKey = originalExactKey;
			if (originalAbortError === undefined) {
				delete g._createCodecHandoffAbortError;
			} else {
				g._createCodecHandoffAbortError = originalAbortError;
			}
		}
	});
});

describe("worker watchdog visibility awareness", () => {
	function makeTrackedWorker(overrides: Record<string, unknown> = {}) {
		const worker: Record<string, unknown> = {
			pings: 0,
			postMessage() {
				(worker.pings as number)++;
			},
			__TTVABCreatedAt: Date.now(),
			__TTVABLastPongAt: Date.now(),
			__TTVABFirstPongAt: Date.now(),
			__TTVABMissedPongs: 0,
			__TTVABLastPingSentAt: 0,
			...overrides,
		};
		(g._S as { workers: unknown[] }).workers.push(worker);
		return worker;
	}

	function startWatchdog() {
		T<() => void>("_startWorkerWatchdog")();
	}

	function stopWatchdog() {
		const id = g._workerWatchdogID as ReturnType<typeof setInterval> | null;
		if (id !== null) clearInterval(id);
		g._workerWatchdogID = null;
	}

	afterEach(() => {
		stopWatchdog();
		delete g._isNativeDocumentHidden;
		delete g._installPageSideM3U8Override;
	});

	it("never strikes a live ponging worker while the tab is hidden", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		g._isNativeDocumentHidden = () => true;
		const markPong =
			T<(worker: Record<string, unknown>, now?: number) => void>(
				"_markWorkerPong",
			);
		const worker = makeTrackedWorker();
		worker.postMessage = () => {
			(worker.pings as number)++;
			markPong(worker);
		};

		startWatchdog();
		vi.advanceTimersByTime(300000);

		expect(worker.__TTVABMissedPongs).toBe(0);
		expect(worker.__TTVABCrashed).toBeUndefined();
		expect(worker.pings).toBeGreaterThan(0);
	});

	it("declares a silent worker crashed while hidden only after sustained stale evidence", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		g._isNativeDocumentHidden = () => true;
		g._installPageSideM3U8Override = () => {};
		g._doPlayerTask = () => true;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const worker = makeTrackedWorker();

		try {
			startWatchdog();
			vi.advanceTimersByTime(60000);
			expect(worker.__TTVABCrashed).toBeUndefined();

			vi.advanceTimersByTime(60000);
			expect(worker.__TTVABCrashed).toBe(true);
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("declares quickly after refocus using evidence accrued while hidden", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		let hidden = true;
		g._isNativeDocumentHidden = () => hidden;
		g._installPageSideM3U8Override = () => {};
		g._doPlayerTask = () => true;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const worker = makeTrackedWorker();

		try {
			startWatchdog();
			vi.advanceTimersByTime(40000);
			expect(worker.__TTVABCrashed).toBeUndefined();
			expect(Number(worker.__TTVABMissedPongs)).toBeGreaterThanOrEqual(2);

			hidden = false;
			vi.advanceTimersByTime(5000);
			expect(worker.__TTVABCrashed).toBe(true);
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});

	it("restarts the ping window after a long gap instead of striking a resumed worker", () => {
		vi.useFakeTimers();
		vi.setSystemTime(700000);
		g._isNativeDocumentHidden = () => false;
		const markPong =
			T<(worker: Record<string, unknown>, now?: number) => void>(
				"_markWorkerPong",
			);
		const worker = makeTrackedWorker({
			__TTVABLastPongAt: 700000 - 600000,
			__TTVABLastPingSentAt: 700000 - 600005,
		});

		startWatchdog();
		vi.advanceTimersByTime(5000);
		expect(worker.__TTVABMissedPongs).toBe(0);
		expect(worker.__TTVABLastPingSentAt).toBe(705000);
		expect(worker.__TTVABCrashed).toBeUndefined();

		worker.postMessage = () => {
			(worker.pings as number)++;
			markPong(worker);
		};
		vi.advanceTimersByTime(30000);
		expect(worker.__TTVABMissedPongs).toBe(0);
		expect(worker.__TTVABCrashed).toBeUndefined();
	});

	it("still declares a visible worker crashed after sustained unanswered pings", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		g._isNativeDocumentHidden = () => false;
		g._installPageSideM3U8Override = () => {};
		g._doPlayerTask = () => true;
		const worker = makeTrackedWorker();

		startWatchdog();
		vi.advanceTimersByTime(25000);
		expect(worker.__TTVABCrashed).toBeUndefined();
		expect(worker.__TTVABMissedPongs).toBe(1);

		vi.advanceTimersByTime(5000);
		expect(worker.__TTVABCrashed).toBe(true);
	});

	it("defers the recovery reload until the tab is visible again", () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		let hidden = true;
		g._isNativeDocumentHidden = () => hidden;
		const previousGetPlaybackContext = g._getPlaybackContextFromUrl;
		g._getPlaybackContextFromUrl = () => ({
			MediaType: "live",
			ChannelName: "testchannel",
			MediaKey: "live:testchannel",
		});
		const reloads: unknown[][] = [];
		g._doPlayerTask = (...args: unknown[]) => {
			reloads.push(args);
			return true;
		};

		try {
			T<
				(
					worker: Record<string, unknown>,
					context: Record<string, unknown>,
				) => void
			>("_attemptWorkerRestart")(
				{},
				{
					MediaType: "live",
					ChannelName: "testchannel",
				},
			);

			vi.advanceTimersByTime(1000);
			expect(reloads).toHaveLength(0);

			vi.advanceTimersByTime(20000);
			expect(reloads).toHaveLength(0);

			hidden = false;
			vi.advanceTimersByTime(5000);
			expect(reloads).toHaveLength(1);
			expect(reloads[0][2]).toEqual({
				reason: "worker-recovery",
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
				channel: "testchannel",
				mediaKey: "live:testchannel",
			});
		} finally {
			if (previousGetPlaybackContext === undefined) {
				delete g._getPlaybackContextFromUrl;
			} else {
				g._getPlaybackContextFromUrl = previousGetPlaybackContext;
			}
		}
	});
});

describe("bridge re-handshake on content-script announce", () => {
	function announceEvent() {
		const event = new MessageEvent("message", {
			data: { type: "ttvab-bridge-announce" },
		});
		Object.defineProperty(event, "source", { value: window });
		return event;
	}

	async function flushAsync(ms = 60) {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	it("re-broadcasts the session token for a stale port, but not for a fresh one", async () => {
		const bindHandshake = T<() => void>("_bindBridgePortHandshake");
		const attachBridgePort =
			T<(port: unknown, sessionToken?: string | null) => boolean>(
				"_attachBridgePort",
			);
		const getToken = T<() => string>("_getBridgeSessionToken");
		const nowSpy = vi.spyOn(Date, "now");

		nowSpy.mockReturnValue(1000000);
		bindHandshake();
		const token = getToken();
		expect(attachBridgePort(makeBridgePort(), token)).toBe(true);
		await flushAsync();

		const requests: Array<{ detail?: { token?: string } }> = [];
		const recordRequests = (event: MessageEvent) => {
			const data = event.data as {
				type?: string;
				detail?: { token?: string };
			};
			if (data?.type === "ttvab-bridge-token-request") {
				requests.push(data);
			}
		};
		window.addEventListener("message", recordRequests);

		window.dispatchEvent(announceEvent());
		await flushAsync();
		expect(requests).toHaveLength(0);

		nowSpy.mockReturnValue(1005000);
		window.dispatchEvent(announceEvent());
		await flushAsync();
		expect(requests.length).toBeGreaterThanOrEqual(1);
		expect(requests[0]?.detail?.token).toBe(token);

		window.removeEventListener("message", recordRequests);
		nowSpy.mockRestore();
		await flushAsync(1100);
	});
});

describe("_isValid worker wrapper vetting", () => {
	beforeEach(() => {
		const s = g._S as Record<string, unknown>;
		s.conflicts = ["twitch", "isVariantA"];
		s.reinsertPatterns = ["isVariantA"];
		s.toleratedWorkerWrappers = [
			{
				name: "TwitchNoSub",
				signatures: ["${patch_url}", "twitchBlobUrl", "getWasmWorkerJs"],
			},
		];
	});

	it("accepts a plain unmarked constructor", () => {
		const isValid = T<(v: unknown) => boolean>("_isValid");
		expect(isValid(function PlainWorker() {})).toBe(true);
	});

	it("rejects revoked-proxy constructors without throwing", () => {
		const isValid = T<(v: unknown) => boolean>("_isValid");
		const { proxy, revoke } = Proxy.revocable(function ProxiedWorker() {}, {});
		revoke();
		expect(typeof proxy).toBe("function");
		expect(() => isValid(proxy)).not.toThrow();
		expect(isValid(proxy)).toBe(false);
	});

	it("rejects wrappers carrying conflict markers", () => {
		const isValid = T<(v: unknown) => boolean>("_isValid");
		const marked = () => {};
		marked.toString = () => "function () { window.twitch.hook(); }";
		expect(isValid(marked)).toBe(false);
	});
});

describe("worker bootstrap source-loading self-heal invariant", () => {
	it("either importScripts (throws on dead URL) or the empty-source guard is present", () => {
		const hooksJs = readFileSync(
			resolve(__dirname, "../dist/src/modules/hooks.js"),
			"utf8",
		);
		const usesImportScripts = hooksJs.includes("importScripts(");
		const usesEvalWithGuard =
			hooksJs.includes("_getWasmJs(") &&
			hooksJs.includes("original worker source fetch returned empty");
		expect(usesImportScripts || usesEvalWithGuard).toBe(true);
	});
});
