import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

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
	loadModule("../dist/src/modules/processor.js");

	g._log = () => {};
	g._S = {
		workers: [],
		conflicts: [],
		reinsertPatterns: [],
		toleratedWorkerWrappers: [],
		adsBlocked: 0,
	};
	g.__TTVAB_STATE__ = {
		AdSignifier: "stitched",
		BackupPlayerTypes: ["embed", "popout", "autoplay"],
		AdSegmentCache: new Map<string, number>(),
		AllSegmentsAreAdSegments: false,
		IsAdStrippingEnabled: true,
		CurrentAdChannel: null,
		CurrentAdMediaKey: null,
		StreamInfos: Object.create(null),
		StreamInfosByUrl: Object.create(null),
		PinnedBackupPlayerType: null,
		PinnedBackupPlayerChannel: null,
		PinnedBackupPlayerMediaKey: null,
		PageMediaType: null,
		PageChannel: null,
		PageVodID: null,
		PageMediaKey: null,
		LastAdEndedAt: 0,
		LastAdEndedChannel: null,
		LastAdEndedMediaKey: null,
		V2API: false,
		HasTriggeredPlayerReload: false,
		HasResolvedToggleState: true,
		IsBufferFixEnabled: true,
		DisableAdSpoofing: false,
		AdEndMinCleanPlaylists: 3,
		AdEndGraceMs: 500,
		AdEndMaxWaitMs: 4000,
		AdEndBackupHoldMaxMs: 90000,
		AdEndMaxFailedNativeProbes: 6,
		PinnedBackupStallDetectionMs: 3000,
		PinnedBackupStallPollMs: 1500,
		BackupSearchForceRefreshAt: 0,
		LastPinnedBackupStallDetectedAt: 0,
		SilentBackupHoldMaxMs: 120000,
		SimulatedAdsDepth: 0,
		LqHqHoldMinMs: 8000,
		ClientVersion: null,
		ClientSession: null,
		ClientIntegrityHeader: null,
		AuthorizationHeader: null,
		GQLDeviceID: null,
		PreferredQualityGroup: null,
		DisableAutoplayBackup: true,
	};
	g.globalThis = g;
	g.self = g;
	g.window = g;
	g.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
});

function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

function getState() {
	return g.__TTVAB_STATE__ as Record<string, unknown>;
}

function makeInfo(overrides: Record<string, unknown> = {}) {
	return {
		MediaType: "live",
		ChannelName: "testchannel",
		VodID: null,
		MediaKey: "live:testchannel",
		IsShowingAd: false,
		IsUsingModifiedM3U8: false,
		IsUsingFallbackStream: false,
		IsUsingBackupStream: false,
		RequestedAds: new Set<string>(),
		SpoofedAdIds: new Set<string>(),
		FailedBackupPlayerTypes: new Map<string, number>(),
		ActiveBackupPlayerType: null,
		ActiveBackupResolution: null,
		IsMidroll: false,
		IsStrippingAdSegments: false,
		CsaiOnlyThisBreak: false,
		NumStrippedAdSegments: 0,
		PendingAdEndAt: 0,
		CleanPlaylistCount: 0,
		AdEndMarkerBounceLogged: false,
		VisibleAdStartedAt: 0,
		IsHoldingBackupAfterAd: false,
		SilentBackupHoldStartedAt: 0,
		LastSilentBackupHoldLogAt: 0,
		LastNativeRecoveryHoldLogAt: 0,
		HevcReloadPendingAfterHold: false,
		LastAdEndBounceAt: 0,
		LastAdEndReloadAt: 0,
		LastPlayerReload: 0,
		LastCleanBackupM3U8: null,
		LastCleanBackupPlayerType: null,
		LastCleanBackupAt: 0,
		LastCleanNativeM3U8: null,
		LastCleanNativePlaylistAt: 0,
		BackupEncodingsM3U8Cache: Object.create(null),
		BackupVariantUrls: new Set<string>(),
		LoggedBackupAdsByType: null,
		_LoggedWhitelistByType: null,
		Urls: Object.create(null),
		ResolutionList: [],
		ModifiedM3U8: null,
		_BackupSearchStartedAt: 0,
		_LastBackupSearchCompletedAt: 0,
		_LoggedOfflineTransition: false,
		_AdRequestController: null,
		_EmptyAdHoldMediaSequence: 0,
		_SpliceStreamId: null,
		_SpliceBoundarySeq: null,
		...overrides,
	};
}

describe("_getStreamUrl (resolution selection)", () => {
	const fn = () =>
		T<
			(
				m3u8: string,
				res: Record<string, unknown> | null,
				baseUrl?: string | null,
			) => string | null
		>("_getStreamUrl");

	const ladder = [
		'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,VIDEO="chunked"',
		"https://edge.example/1080.m3u8",
		'#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,FRAME-RATE=60.000,VIDEO="720p60"',
		"https://edge.example/720.m3u8",
		'#EXT-X-STREAM-INF:BANDWIDTH=1300000,RESOLUTION=640x360,FRAME-RATE=30.000,VIDEO="360p30"',
		"https://edge.example/360.m3u8",
		'#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=284x160,FRAME-RATE=30.000,VIDEO="160p30"',
		"https://edge.example/160.m3u8",
	].join("\n");

	it("serves the highest variant when the target has no usable resolution (not the lowest)", () => {
		const out = fn()(["#EXTM3U", ladder].join("\n"), { Name: "1080p60" }, null);
		expect(out).toBe("https://edge.example/1080.m3u8");
	});

	it("serves the highest variant when no target resolution is given at all", () => {
		const out = fn()(["#EXTM3U", ladder].join("\n"), null, null);
		expect(out).toBe("https://edge.example/1080.m3u8");
	});

	it("still picks the closest variant when a valid target resolution is provided", () => {
		const out = fn()(
			["#EXTM3U", ladder].join("\n"),
			{ Resolution: "640x360" },
			null,
		);
		expect(out).toBe("https://edge.example/360.m3u8");
	});
});

describe("_applyBackupResolutionFloor", () => {
	const fn = () =>
		T<
			(
				res: Record<string, unknown> | null,
				resolutionList: Array<Record<string, unknown>>,
				floorHeight?: number,
			) => Record<string, unknown> | null
		>("_applyBackupResolutionFloor");

	const ladder = [
		{ Resolution: "1920x1080" },
		{ Resolution: "1280x720" },
		{ Resolution: "640x360" },
		{ Resolution: "284x160" },
	];

	it("raises a sub-360p target to the lowest available variant at or above 360p", () => {
		const out = fn()({ Resolution: "284x160" }, ladder);
		expect(out).toEqual({ Resolution: "640x360" });
	});

	it("leaves a target already at or above 360p untouched", () => {
		const out = fn()({ Resolution: "1280x720" }, ladder);
		expect(out).toEqual({ Resolution: "1280x720" });
	});

	it("leaves a target with no usable resolution untouched (so highest-variant fallback still applies)", () => {
		const nameOnly = { Name: "1080p60" };
		expect(fn()(nameOnly, ladder)).toBe(nameOnly);
	});

	it("does not raise when no variant at or above the floor exists", () => {
		const lowOnly = [{ Resolution: "284x160" }, { Resolution: "256x144" }];
		const target = { Resolution: "284x160" };
		expect(fn()(target, lowOnly)).toBe(target);
	});
});

describe("_resolvePreferredBackupResolution (silent-hold quality target)", () => {
	const fn = () =>
		T<
			(
				info: Record<string, unknown>,
				floorHeight?: number,
			) => Record<string, unknown> | null
		>("_resolvePreferredBackupResolution");

	const ladder = [
		{ Resolution: "1920x1080", Name: "1080p60" },
		{ Resolution: "1280x720", Name: "720p60" },
		{ Resolution: "640x360", Name: "360p" },
		{ Resolution: "284x160", Name: "160p" },
	];

	it("targets the quality the connection has actually sustained, not the top variant", () => {
		getState().PreferredQualityGroup = null;
		const info = makeInfo({
			ResolutionList: ladder,
			SustainedNativeResolution: { Resolution: "640x360", Name: "360p" },
		});
		expect(fn()(info)).toEqual({ Resolution: "640x360", Name: "360p" });
	});

	it("climbs to a high sustained quality on a capable connection", () => {
		getState().PreferredQualityGroup = null;
		const info = makeInfo({
			ResolutionList: ladder,
			SustainedNativeResolution: { Resolution: "1920x1080", Name: "1080p60" },
		});
		expect(fn()(info)).toEqual({ Resolution: "1920x1080", Name: "1080p60" });
	});

	it("returns null with no preference and no sustained reading, so the caller falls to the live request", () => {
		getState().PreferredQualityGroup = null;
		const info = makeInfo({
			ResolutionList: ladder,
			SustainedNativeResolution: null,
		});
		expect(fn()(info)).toBeNull();
	});

	it("honors an explicit preferred quality group over the sustained reading", () => {
		getState().PreferredQualityGroup = "720p60";
		const info = makeInfo({
			ResolutionList: ladder,
			SustainedNativeResolution: { Resolution: "640x360", Name: "360p" },
		});
		expect(fn()(info)).toEqual({ Resolution: "1280x720", Name: "720p60" });
		getState().PreferredQualityGroup = null;
	});

	it("floors a sub-360p sustained reading up to the lowest variant at or above 360p", () => {
		getState().PreferredQualityGroup = null;
		const info = makeInfo({
			ResolutionList: ladder,
			SustainedNativeResolution: { Resolution: "284x160", Name: "160p" },
		});
		expect(fn()(info)).toEqual({ Resolution: "640x360", Name: "360p" });
	});

	it("returns null when no resolutions are known so the URL resolver can take over", () => {
		expect(fn()(makeInfo({ ResolutionList: [] }))).toBeNull();
	});
});

describe("_recordSustainedNativeResolution (bandwidth high-water mark)", () => {
	const record = () =>
		T<(info: Record<string, unknown>, url: string) => void>(
			"_recordSustainedNativeResolution",
		);
	const aliasesFor = (url: string) =>
		T<(url: string, base?: string | null) => string[]>(
			"_getPlaylistUrlAliases",
		)(url);

	function urlsFor(url: string, resEntry: Record<string, unknown>) {
		const urls = Object.create(null);
		for (const alias of aliasesFor(url)) urls[alias] = resEntry;
		return urls;
	}

	const url1080 = "https://video.example.com/1080.m3u8";
	const url360 = "https://video.example.com/360.m3u8";
	const r1080 = { Resolution: "1920x1080", Name: "1080p60" };
	const r360 = { Resolution: "640x360", Name: "360p" };

	it("records the resolution of the native variant the player is requesting", () => {
		const info = makeInfo({ Urls: urlsFor(url360, r360) });
		record()(info, url360);
		expect(info.SustainedNativeResolution).toEqual(r360);
	});

	it("climbs immediately when the player moves to a higher variant", () => {
		const info = makeInfo({
			Urls: { ...urlsFor(url360, r360), ...urlsFor(url1080, r1080) },
			SustainedNativeResolution: r360,
			SustainedNativeResolutionAt: Date.now(),
		});
		record()(info, url1080);
		expect(info.SustainedNativeResolution).toEqual(r1080);
	});

	it("keeps the high-water mark when a lower reading arrives within the window", () => {
		const info = makeInfo({
			Urls: urlsFor(url360, r360),
			SustainedNativeResolution: r1080,
			SustainedNativeResolutionAt: Date.now(),
		});
		record()(info, url360);
		expect(info.SustainedNativeResolution).toEqual(r1080);
	});

	it("decays to a lower reading after the window elapses (tracks degradation)", () => {
		const info = makeInfo({
			Urls: urlsFor(url360, r360),
			SustainedNativeResolution: r1080,
			SustainedNativeResolutionAt: Date.now() - 61000,
		});
		record()(info, url360);
		expect(info.SustainedNativeResolution).toEqual(r360);
	});

	it("does not record while a backup stream is being served", () => {
		const info = makeInfo({
			Urls: urlsFor(url1080, r1080),
			IsUsingBackupStream: true,
			SustainedNativeResolution: r360,
			SustainedNativeResolutionAt: Date.now(),
		});
		record()(info, url1080);
		expect(info.SustainedNativeResolution).toEqual(r360);
	});
});

describe("_fetchWithTimeout", () => {
	const fn = () =>
		T<
			(
				realFetch: (url: string, options?: RequestInit) => Promise<Response>,
				url: string,
				options?: RequestInit,
				timeoutMs?: number,
			) => Promise<Response>
		>("_fetchWithTimeout");

	it("keeps the timeout active while reading the response body", async () => {
		vi.useFakeTimers();
		const fetchWithTimeout = fn();
		let abortSignal: AbortSignal | null = null;

		const request = fetchWithTimeout(
			async (_url, options) => {
				abortSignal = options?.signal || null;
				return {
					status: 200,
					statusText: "OK",
					headers: new Headers(),
					arrayBuffer: () =>
						new Promise<ArrayBuffer>((_resolve, reject) => {
							abortSignal?.addEventListener("abort", () => {
								reject(new DOMException("Aborted", "AbortError"));
							});
						}),
				} as Response;
			},
			"https://edge.example/hls/live.m3u8",
			{},
			25,
		);
		const assertion = expect(request).rejects.toMatchObject({
			name: "AbortError",
		});

		try {
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(25);
			await assertion;
		} finally {
			vi.useRealTimers();
		}
	});

	it("returns a readable cloned response after the body is fetched", async () => {
		const response = await fn()(
			async () =>
				new Response("clean", {
					status: 201,
					statusText: "Created",
					headers: { "x-ttvab-test": "yes" },
				}),
			"https://edge.example/hls/live.m3u8",
			{},
			1000,
		);

		expect(response.status).toBe(201);
		expect(response.statusText).toBe("Created");
		expect(response.headers.get("x-ttvab-test")).toBe("yes");
		expect(await response.text()).toBe("clean");
	});
});

describe("_resetStreamAdState", () => {
	it("resets all ad-related state to defaults", () => {
		const fn = T<(info: Record<string, unknown>) => Record<string, unknown>>(
			"_resetStreamAdState",
		);
		const info = makeInfo({
			IsShowingAd: true,
			IsUsingModifiedM3U8: true,
			IsUsingFallbackStream: true,
			IsUsingBackupStream: true,
			NumStrippedAdSegments: 5,
			IsMidroll: true,
			CsaiOnlyThisBreak: true,
			IsHoldingBackupAfterAd: true,
			HevcReloadPendingAfterHold: true,
			ConsecutiveFailedNativeProbes: 4,
			_LoggedWhitelistByType: new Set(["cooldown:site", "whitelist:site"]),
			_EmptyAdHoldMediaSequence: 12,
		});
		fn(info);
		expect(info.IsShowingAd).toBe(false);
		expect(info.IsUsingModifiedM3U8).toBe(false);
		expect(info.IsUsingFallbackStream).toBe(false);
		expect(info.IsUsingBackupStream).toBe(false);
		expect(info.NumStrippedAdSegments).toBe(0);
		expect(info.IsMidroll).toBe(false);
		expect(info.CsaiOnlyThisBreak).toBe(false);
		expect(info.IsHoldingBackupAfterAd).toBe(false);
		expect(info.HevcReloadPendingAfterHold).toBe(false);
		expect(info.ConsecutiveFailedNativeProbes).toBe(0);
		expect(info._LoggedWhitelistByType).toBe(null);
		expect(info._EmptyAdHoldMediaSequence).toBe(0);
	});

	it("initializes CsaiOnlyThisBreak on new stream infos", () => {
		const create =
			T<(ctx: Record<string, unknown>) => Record<string, unknown>>(
				"_createStreamInfo",
			);
		const info = create({ ChannelName: "testchannel" });
		expect(info.CsaiOnlyThisBreak).toBe(false);
	});

	it("reports wasUsingModifiedM3U8 when active", () => {
		const fn = T<(info: Record<string, unknown>) => Record<string, unknown>>(
			"_resetStreamAdState",
		);
		const info = makeInfo({ IsUsingModifiedM3U8: true });
		const result = fn(info);
		expect(result.wasUsingModifiedM3U8).toBe(true);
	});

	it("reports hadStrippedAdSegments when count > 0", () => {
		const fn = T<(info: Record<string, unknown>) => Record<string, unknown>>(
			"_resetStreamAdState",
		);
		const info = makeInfo({ NumStrippedAdSegments: 10 });
		const result = fn(info);
		expect(result.hadStrippedAdSegments).toBe(true);
	});
});

describe("_rememberLastAdEnd", () => {
	it("sets LastAdEndedAt on global state and info", () => {
		const fn =
			T<(info: Record<string, unknown>, at: number) => void>(
				"_rememberLastAdEnd",
			);
		const info = makeInfo();
		fn(info, 5000);
		expect(info.LastAdEndReloadAt).toBe(5000);
		const st = g.__TTVAB_STATE__ as Record<string, unknown>;
		expect(st.LastAdEndedAt).toBe(5000);
	});

	it("sets channel and media key on global state", () => {
		const fn =
			T<(info: Record<string, unknown>, at: number) => void>(
				"_rememberLastAdEnd",
			);
		const info = makeInfo();
		fn(info, 7000);
		const st = g.__TTVAB_STATE__ as Record<string, unknown>;
		expect(st.LastAdEndedChannel).toBe("testchannel");
		expect(st.LastAdEndedMediaKey).toBe("live:testchannel");
	});
});

describe("_doesPlaybackContextMatchInfo", () => {
	it("matches by media key", () => {
		const fn = T<
			(
				info: Record<string, unknown>,
				mediaKey?: string | null,
				channel?: string | null,
			) => boolean
		>("_doesPlaybackContextMatchInfo");
		const info = makeInfo();
		expect(fn(info, "live:testchannel")).toBe(true);
		expect(fn(info, "live:other")).toBe(false);
	});

	it("matches by channel when media key unavailable", () => {
		const fn = T<
			(
				info: Record<string, unknown>,
				mediaKey?: string | null,
				channel?: string | null,
			) => boolean
		>("_doesPlaybackContextMatchInfo");
		const info = makeInfo({ MediaKey: null });
		expect(fn(info, null, "testchannel")).toBe(true);
		expect(fn(info, null, "other")).toBe(false);
	});

	it("returns false when neither match", () => {
		const fn = T<
			(
				info: Record<string, unknown>,
				mediaKey?: string | null,
				channel?: string | null,
			) => boolean
		>("_doesPlaybackContextMatchInfo");
		expect(fn(makeInfo(), null, null)).toBe(false);
	});
});

describe("_getBackupPlayerRetryCooldownMs", () => {
	const fn = () =>
		T<(reason: string) => number>("_getBackupPlayerRetryCooldownMs");

	it("returns 1500 for error reasons", () => {
		expect(fn()("error")).toBe(1500);
		expect(fn()("stream-error")).toBe(1500);
		expect(fn()("token-error")).toBe(1500);
	});

	it("returns 2000 for not-playable / no-stream-url", () => {
		expect(fn()("not-playable")).toBe(2000);
		expect(fn()("no-stream-url")).toBe(2000);
	});

	it("returns 10000 for stalled", () => {
		expect(fn()("stalled")).toBe(10000);
	});

	it("returns 15000 for ad-marked / unknown", () => {
		expect(fn()("ad-marked")).toBe(15000);
		expect(fn()("unknown")).toBe(15000);
	});
});

describe("_getFallbackPromotionPolicy", () => {
	const fn = () =>
		T<
			(params: {
				candidateHasAds: boolean;
				candidateIsPlayable: boolean;
				simulatedAdsDepthSatisfied: boolean;
			}) => Record<string, unknown>
		>("_getFallbackPromotionPolicy");

	it("denies unplayable candidates", () => {
		const r = fn()({
			candidateHasAds: false,
			candidateIsPlayable: false,
			simulatedAdsDepthSatisfied: true,
		});
		expect(r.allowSelectedPromotion).toBe(false);
		expect(r.reason).toBe("not-playable");
	});

	it("denies fallback promotion for ad-marked candidates", () => {
		const r = fn()({
			candidateHasAds: true,
			candidateIsPlayable: true,
			simulatedAdsDepthSatisfied: true,
		});
		expect(r.allowSelectedPromotion).toBe(false);
		expect(r.allowFallbackPromotion).toBe(false);
		expect(r.reason).toBe("ad-marked");
	});

	it("denies when simulated ads depth not satisfied", () => {
		const r = fn()({
			candidateHasAds: false,
			candidateIsPlayable: true,
			simulatedAdsDepthSatisfied: false,
		});
		expect(r.allowSelectedPromotion).toBe(false);
		expect(r.allowFallbackPromotion).toBe(false);
	});

	it("allows both for clean playable candidates", () => {
		const r = fn()({
			candidateHasAds: false,
			candidateIsPlayable: true,
			simulatedAdsDepthSatisfied: true,
		});
		expect(r.allowSelectedPromotion).toBe(true);
		expect(r.allowFallbackPromotion).toBe(true);
		expect(r.reason).toBe("clean-playable");
	});
});

describe("_getOrderedBackupPlayerTypes (LQ fallback contract)", () => {
	const fn = () =>
		T<(info: Record<string, unknown>, startIdx?: number) => string[]>(
			"_getOrderedBackupPlayerTypes",
		);

	it("excludes autoplay when LQ fallback is disabled (default)", () => {
		getState().DisableAutoplayBackup = true;
		const result = fn()(makeInfo());
		expect(result).not.toContain("autoplay");
	});

	it("includes autoplay when LQ fallback is enabled", () => {
		getState().DisableAutoplayBackup = false;
		const result = fn()(makeInfo());
		expect(result).toContain("autoplay");
	});

	it("tries a recent clean non-autoplay backup before cold source candidates", () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		state.BackupPlayerTypes = ["embed", "popout", "autoplay"];
		state.DisableAutoplayBackup = true;

		try {
			const result = fn()(
				makeInfo({
					LastCleanBackupPlayerType: "popout",
					LastCleanBackupM3U8: "#EXTM3U\n#EXTINF:2.000,live\nseg.ts",
					LastCleanBackupAt: Date.now() - 30000,
				}),
			);

			expect(result.slice(0, 2)).toEqual(["popout", "embed"]);
			expect(result).not.toContain("autoplay");
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
		}
	});

	it("does not fast-retry stale, cooled-down, ad-marked, or autoplay backups", () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		state.BackupPlayerTypes = ["embed", "popout", "autoplay"];
		state.DisableAutoplayBackup = false;

		try {
			const now = Date.now();
			const blockedPopout = new Set<string>(["popout"]);
			const coolingDown = new Map<string, number>([["popout", now + 15000]]);
			const cases = [
				makeInfo({
					LastCleanBackupPlayerType: "popout",
					LastCleanBackupM3U8: "#EXTM3U\n#EXTINF:2.000,live\nseg.ts",
					LastCleanBackupAt: now - 180000,
				}),
				makeInfo({
					LastCleanBackupPlayerType: "popout",
					LastCleanBackupM3U8: "#EXTM3U\n#EXTINF:2.000,live\nseg.ts",
					LastCleanBackupAt: now - 30000,
					FailedBackupPlayerTypes: coolingDown,
				}),
				makeInfo({
					LastCleanBackupPlayerType: "popout",
					LastCleanBackupM3U8: "#EXTM3U\n#EXTINF:2.000,live\nseg.ts",
					LastCleanBackupAt: now - 30000,
					LoggedBackupAdsByType: blockedPopout,
				}),
				makeInfo({
					LastCleanBackupPlayerType: "autoplay",
					LastCleanBackupM3U8: "#EXTM3U\n#EXTINF:2.000,live\nseg.ts",
					LastCleanBackupAt: now - 30000,
				}),
			];

			for (const info of cases) {
				expect(fn()(info)[0]).toBe("embed");
			}
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
		}
	});

	it("does not keep autoplay first after the LQ dwell window expires", () => {
		getState().DisableAutoplayBackup = false;
		const result = fn()(
			makeInfo({
				IsShowingAd: true,
				ActiveBackupPlayerType: "autoplay",
				LastCleanBackupPlayerType: "autoplay",
				LastCleanBackupM3U8: "#EXTM3U\n#EXTINF:2.000,live\nseg.ts",
				LastCleanBackupAt: Date.now() - 30000,
				VisibleAdStartedAt: Date.now() - 31000,
				_LqHoldStartAt: Date.now() - 30000,
			}),
		);
		expect(result[0]).not.toBe("autoplay");
		expect(result).toContain("autoplay");
	});

	afterAll(() => {
		getState().DisableAutoplayBackup = true;
	});
});

describe("_shouldTryAutoplayFirst (LQ-hold-only)", () => {
	const fn = () =>
		T<(info: Record<string, unknown>) => boolean>("_shouldTryAutoplayFirst");

	it("does not prioritize autoplay on cold start (no clean backup yet)", () => {
		expect(fn()(makeInfo())).toBe(false);
	});

	it("does not prioritize autoplay on a new ad cycle (backup stale from a prior cycle)", () => {
		const info = makeInfo({
			LastCleanBackupM3U8: "#EXTM3U8",
			LastCleanBackupAt: 1000,
			VisibleAdStartedAt: 5000,
		});
		expect(fn()(info)).toBe(false);
	});

	it("holds LQ (autoplay) first while within the LQ→HQ dwell window", () => {
		getState().DisableAutoplayBackup = false;
		const info = makeInfo({
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupM3U8: "#EXTM3U8",
			LastCleanBackupAt: 1000,
			VisibleAdStartedAt: 500,
			_LqHoldStartAt: Date.now() - 2000,
		});
		expect(fn()(info)).toBe(true);
		getState().DisableAutoplayBackup = true;
	});

	it("allows the LQ→HQ swap after the dwell window elapses", () => {
		getState().DisableAutoplayBackup = false;
		const info = makeInfo({
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupM3U8: "#EXTM3U8",
			LastCleanBackupAt: 1000,
			VisibleAdStartedAt: 500,
			_LqHoldStartAt: Date.now() - 30000,
		});
		expect(fn()(info)).toBe(false);
		getState().DisableAutoplayBackup = true;
	});
});

describe("_shouldHoldAutoplayBackupDuringAd", () => {
	const fn = () =>
		T<(info: Record<string, unknown>) => boolean>(
			"_shouldHoldAutoplayBackupDuringAd",
		);

	it("keeps autoplay as the only in-ad candidate during the LQ dwell window", () => {
		getState().DisableAutoplayBackup = false;
		const startedAt = Date.now() - 2000;
		const info = makeInfo({
			IsShowingAd: true,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupM3U8: "#EXTM3U\n#EXTINF:2.000,live\nseg.ts",
			LastCleanBackupAt: startedAt + 1000,
			VisibleAdStartedAt: startedAt,
			_LqHoldStartAt: startedAt,
		});
		expect(fn()(info)).toBe(true);
		getState().DisableAutoplayBackup = true;
	});

	it("releases autoplay hold when pinned-stall recovery is cooling it down", () => {
		getState().DisableAutoplayBackup = false;
		const startedAt = Date.now() - 2000;
		const info = makeInfo({
			IsShowingAd: true,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupM3U8: "#EXTM3U\n#EXTINF:2.000,live\nseg.ts",
			LastCleanBackupAt: startedAt + 1000,
			VisibleAdStartedAt: startedAt,
			_LqHoldStartAt: startedAt,
		});
		(info.FailedBackupPlayerTypes as Map<string, number>).set(
			"autoplay",
			Date.now() + 10000,
		);
		expect(fn()(info)).toBe(false);
		getState().DisableAutoplayBackup = true;
	});

	it("does not hold stale autoplay from a prior ad cycle", () => {
		getState().DisableAutoplayBackup = false;
		const info = makeInfo({
			IsShowingAd: true,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupM3U8: "#EXTM3U\n#EXTINF:2.000,live\nseg.ts",
			LastCleanBackupAt: 1000,
			VisibleAdStartedAt: 5000,
		});
		expect(fn()(info)).toBe(false);
		getState().DisableAutoplayBackup = true;
	});

	it("does not hold autoplay when LQ fallback is disabled", () => {
		getState().DisableAutoplayBackup = true;
		const startedAt = Date.now() - 2000;
		const info = makeInfo({
			IsShowingAd: true,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupM3U8: "#EXTM3U\n#EXTINF:2.000,live\nseg.ts",
			LastCleanBackupAt: startedAt + 1000,
			VisibleAdStartedAt: startedAt,
			_LqHoldStartAt: startedAt,
		});
		expect(fn()(info)).toBe(false);
	});

	it("releases autoplay after the LQ dwell window elapses", () => {
		getState().DisableAutoplayBackup = false;
		const startedAt = Date.now() - 30000;
		const info = makeInfo({
			IsShowingAd: true,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupM3U8: "#EXTM3U\n#EXTINF:2.000,live\nseg.ts",
			LastCleanBackupAt: startedAt + 1000,
			VisibleAdStartedAt: startedAt,
			_LqHoldStartAt: startedAt,
		});
		expect(fn()(info)).toBe(false);
		getState().DisableAutoplayBackup = true;
	});
});

describe("_findBackupStream fallback policy", () => {
	const findBackupStream = () =>
		T<
			(
				info: Record<string, unknown>,
				realFetch: (url: string, options?: unknown) => Promise<Response>,
				startIdx?: number,
				currentResolution?: Record<string, unknown>,
			) => Promise<{
				type: string | null;
				m3u8: string | null;
				isFallback: boolean;
			}>
		>("_findBackupStream");
	const currentResolution = {
		Name: "720p",
		Resolution: "1280x720",
		FrameRate: 60,
	};
	const masterPlaylist = (playerType: string) =>
		[
			"#EXTM3U",
			'#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,FRAME-RATE=60.000,VIDEO="720p"',
			`https://cdn.example/${playerType}/index.m3u8`,
		].join("\n");
	const adPlaylist = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		'#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad"',
		"#EXTINF:2.000,",
		"https://edge.example/stitched-ad-1.ts",
	].join("\n");
	const cleanPlaylist = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		"#EXTINF:2.000,live",
		"https://edge.example/live-1.ts",
	].join("\n");

	it("tries autoplay only as an emergency candidate when source backups are ad-marked", async () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;
		const tokenCalls: string[] = [];
		let activePlayerType = "";

		state.BackupPlayerTypes = ["embed", "autoplay"];
		state.DisableAutoplayBackup = true;
		g._extractPlaybackAccessToken = () => ({
			signature: "sig",
			value: "token",
		});
		g._getToken = async (_info, playerType) => {
			activePlayerType = String(playerType);
			tokenCalls.push(activePlayerType);
			return new Response("{}", { status: 200 });
		};

		try {
			const result = await findBackupStream()(
				makeInfo(),
				async (url) => {
					const href = String(url);
					if (href.includes("usher.ttvnw.net")) {
						return new Response(masterPlaylist(activePlayerType), {
							status: 200,
						});
					}
					if (href.includes("/embed/")) {
						return new Response(adPlaylist, { status: 200 });
					}
					if (href.includes("/autoplay/")) {
						return new Response(cleanPlaylist, { status: 200 });
					}
					return new Response(null, { status: 404 });
				},
				0,
				currentResolution,
			);

			expect(tokenCalls).toEqual(["embed", "autoplay"]);
			expect(result.type).toBe("autoplay");
			expect(result.m3u8).toBe(cleanPlaylist);
			expect(result.isFallback).toBe(false);
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
			if (previousGetToken === undefined) {
				delete g._getToken;
			} else {
				g._getToken = previousGetToken;
			}
			if (previousExtract === undefined) {
				delete g._extractPlaybackAccessToken;
			} else {
				g._extractPlaybackAccessToken = previousExtract;
			}
		}
	});

	it("validates a recent clean preferred type again before selecting it", async () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;
		const tokenCalls: string[] = [];
		let activePlayerType = "";

		state.BackupPlayerTypes = ["embed", "popout"];
		state.DisableAutoplayBackup = true;
		g._extractPlaybackAccessToken = () => ({
			signature: "sig",
			value: "token",
		});
		g._getToken = async (_info, playerType) => {
			activePlayerType = String(playerType);
			tokenCalls.push(activePlayerType);
			return new Response("{}", { status: 200 });
		};

		try {
			const result = await findBackupStream()(
				makeInfo({
					LastCleanBackupPlayerType: "popout",
					LastCleanBackupM3U8: cleanPlaylist,
					LastCleanBackupAt: Date.now() - 30000,
				}),
				async (url) => {
					const href = String(url);
					if (href.includes("usher.ttvnw.net")) {
						return new Response(masterPlaylist(activePlayerType), {
							status: 200,
						});
					}
					if (href.includes("/popout/")) {
						return new Response(adPlaylist, { status: 200 });
					}
					if (href.includes("/embed/")) {
						return new Response(cleanPlaylist, { status: 200 });
					}
					return new Response(null, { status: 404 });
				},
				0,
				currentResolution,
			);

			expect(tokenCalls).toEqual(["popout", "embed"]);
			expect(result.type).toBe("embed");
			expect(result.m3u8).toBe(cleanPlaylist);
			expect(result.isFallback).toBe(false);
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
			if (previousGetToken === undefined) {
				delete g._getToken;
			} else {
				g._getToken = previousGetToken;
			}
			if (previousExtract === undefined) {
				delete g._extractPlaybackAccessToken;
			} else {
				g._extractPlaybackAccessToken = previousExtract;
			}
		}
	});

	it("does not promote an ad-marked source playlist when no clean fallback exists", async () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;
		const tokenCalls: string[] = [];
		let activePlayerType = "";

		state.BackupPlayerTypes = ["embed"];
		state.DisableAutoplayBackup = true;
		g._extractPlaybackAccessToken = () => ({
			signature: "sig",
			value: "token",
		});
		g._getToken = async (_info, playerType) => {
			activePlayerType = String(playerType);
			tokenCalls.push(activePlayerType);
			return new Response("{}", { status: 200 });
		};

		try {
			const result = await findBackupStream()(
				makeInfo(),
				async (url) => {
					const href = String(url);
					if (href.includes("usher.ttvnw.net")) {
						return new Response(masterPlaylist(activePlayerType), {
							status: 200,
						});
					}
					if (href.includes("/embed/")) {
						return new Response(adPlaylist, { status: 200 });
					}
					return new Response(null, { status: 404 });
				},
				0,
				currentResolution,
			);

			expect(tokenCalls).toEqual(["embed"]);
			expect(result).toEqual({ type: null, m3u8: null, isFallback: false });
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
			if (previousGetToken === undefined) {
				delete g._getToken;
			} else {
				g._getToken = previousGetToken;
			}
			if (previousExtract === undefined) {
				delete g._extractPlaybackAccessToken;
			} else {
				g._extractPlaybackAccessToken = previousExtract;
			}
		}
	});

	it("force-clears cooldowns when the cached backup is stale and every type is cooling down", async () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;
		const tokenCalls: string[] = [];
		let activePlayerType = "";

		state.BackupPlayerTypes = ["embed", "popout"];
		state.DisableAutoplayBackup = true;
		g._extractPlaybackAccessToken = () => ({
			signature: "sig",
			value: "token",
		});
		g._getToken = async (_info, playerType) => {
			activePlayerType = String(playerType);
			tokenCalls.push(activePlayerType);
			return new Response("{}", { status: 200 });
		};

		const now = Date.now();
		const info = makeInfo({
			LastCleanBackupM3U8: cleanPlaylist,
			LastCleanBackupPlayerType: "embed",
			LastCleanBackupAt: now - 10000,
			FailedBackupPlayerTypes: new Map([
				["embed", now + 15000],
				["popout", now + 15000],
			]),
		});

		try {
			const result = await findBackupStream()(
				info,
				async (url) => {
					const href = String(url);
					if (href.includes("usher.ttvnw.net")) {
						return new Response(masterPlaylist(activePlayerType), {
							status: 200,
						});
					}
					return new Response(cleanPlaylist, { status: 200 });
				},
				0,
				currentResolution,
			);

			expect(tokenCalls).toEqual(["embed"]);
			expect(result.type).toBe("embed");
			expect(result.m3u8).toBe(cleanPlaylist);
			expect(result.isFallback).toBe(false);
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
			if (previousGetToken === undefined) {
				delete g._getToken;
			} else {
				g._getToken = previousGetToken;
			}
			if (previousExtract === undefined) {
				delete g._extractPlaybackAccessToken;
			} else {
				g._extractPlaybackAccessToken = previousExtract;
			}
		}
	});
});

describe("_canReloadNativePlayerAfterAd", () => {
	const fn = () =>
		T<
			(
				info: Record<string, unknown>,
				realFetch: (url: string, options?: unknown) => Promise<Response>,
				resolution?: Record<string, unknown> | string | null,
			) => Promise<boolean>
		>("_canReloadNativePlayerAfterAd");

	it("uses bounded fetches for native recovery usher and stream probes", async () => {
		const state = getState();
		const previousMinProbes = state.AdEndMinNativeRecoveryProbes;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;
		const previousBuildUsher = g._buildUsherPlaybackUrl;
		const previousGetStreamUrl = g._getStreamUrl;
		const previousFetchWithTimeout = g._fetchWithTimeout;
		const probeUrls: string[] = [];

		state.AdEndMinNativeRecoveryProbes = 1;
		g._getToken = async () => new Response("{}", { status: 200 });
		g._extractPlaybackAccessToken = () => ({
			signature: "sig",
			value: "token",
		});
		g._buildUsherPlaybackUrl = () =>
			new URL("https://usher.example/channel/hls/testchannel.m3u8");
		g._getStreamUrl = () => "https://edge.example/live/index.m3u8";
		g._fetchWithTimeout = async (_realFetch, url) => {
			probeUrls.push(String(url));
			return new Response(
				probeUrls.length === 1
					? "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlive/index.m3u8"
					: "#EXTM3U\n#EXTINF:2.000,live\nseg.ts",
				{ status: 200 },
			);
		};

		try {
			const result = await fn()(
				makeInfo({ IsUsingBackupStream: true }),
				async () => {
					throw new Error("native recovery probe used raw fetch");
				},
				"720p",
			);

			expect(result).toBe(true);
			expect(probeUrls).toEqual([
				"https://usher.example/channel/hls/testchannel.m3u8",
				"https://edge.example/live/index.m3u8",
			]);
		} finally {
			state.AdEndMinNativeRecoveryProbes = previousMinProbes;
			if (previousGetToken === undefined) delete g._getToken;
			else g._getToken = previousGetToken;
			if (previousExtract === undefined) delete g._extractPlaybackAccessToken;
			else g._extractPlaybackAccessToken = previousExtract;
			if (previousBuildUsher === undefined) delete g._buildUsherPlaybackUrl;
			else g._buildUsherPlaybackUrl = previousBuildUsher;
			if (previousGetStreamUrl === undefined) delete g._getStreamUrl;
			else g._getStreamUrl = previousGetStreamUrl;
			if (previousFetchWithTimeout === undefined) delete g._fetchWithTimeout;
			else g._fetchWithTimeout = previousFetchWithTimeout;
		}
	});
});

const countDiscontinuity = (s: string) =>
	s.split("\n").filter((l) => l.trim() === "#EXT-X-DISCONTINUITY").length;

const makePlaylist = (mediaSeq: number, segs: number, discSeq?: number) => {
	const lines = [
		"#EXTM3U",
		"#EXT-X-VERSION:7",
		"#EXT-X-TARGETDURATION:2",
		`#EXT-X-MEDIA-SEQUENCE:${mediaSeq}`,
	];
	if (discSeq != null) lines.push(`#EXT-X-DISCONTINUITY-SEQUENCE:${discSeq}`);
	for (let i = 0; i < segs; i++) {
		lines.push("#EXTINF:2.000,live");
		lines.push(`seg${mediaSeq + i}.ts`);
	}
	return lines.join("\n");
};

describe("_insertBoundaryDiscontinuity (seamless splice bridge)", () => {
	const fn = () =>
		T<
			(
				text: string,
				boundarySeq: number | null,
				firstSeq: number | null,
			) => string
		>("_insertBoundaryDiscontinuity");

	it("inserts exactly one #EXT-X-DISCONTINUITY before the boundary segment", () => {
		const out = fn()(makePlaylist(100, 3), 100, 100);
		expect(countDiscontinuity(out)).toBe(1);
		const lines = out.split("\n");
		const discAt = lines.indexOf("#EXT-X-DISCONTINUITY");
		const firstSegAt = lines.findIndex((l) => l.startsWith("#EXTINF"));
		expect(discAt).toBe(firstSegAt - 1);
		expect(out).not.toContain("#EXT-X-DISCONTINUITY-SEQUENCE");
	});

	it("drops the marker but bumps disc-seq once the boundary scrolls off (keeps cc stable)", () => {
		const out = fn()(makePlaylist(103, 3), 100, 103);
		expect(countDiscontinuity(out)).toBe(0);
		expect(out).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:1");
	});

	it("returns text unchanged when boundary or first sequence is unknown", () => {
		const pl = makePlaylist(100, 3);
		expect(fn()(pl, null, 100)).toBe(pl);
		expect(fn()(pl, 100, null)).toBe(pl);
	});

	it("does not double-insert when a discontinuity already precedes the boundary", () => {
		const once = fn()(makePlaylist(100, 3), 100, 100);
		const twice = fn()(once, 100, 100);
		expect(countDiscontinuity(twice)).toBe(1);
	});
});

describe("_applyBackupSpliceBridge (per-stream boundary tracking)", () => {
	const fn = () =>
		T<(info: Record<string, unknown>, text: string) => string>(
			"_applyBackupSpliceBridge",
		);

	it("no-ops and clears splice state when not serving a backup", () => {
		const info = makeInfo({
			IsUsingBackupStream: false,
			_SpliceStreamId: "site|1080p60",
			_SpliceBoundarySeq: 500,
		});
		const pl = makePlaylist(100, 3);
		expect(fn()(info, pl)).toBe(pl);
		expect(info._SpliceStreamId).toBe(null);
		expect(info._SpliceBoundarySeq).toBe(null);
	});

	it("bridges the first backup playlist exactly once and records the boundary", () => {
		const info = makeInfo({
			IsUsingBackupStream: true,
			ActiveBackupPlayerType: "site",
			ActiveBackupResolution: "1080p60",
		});
		const out = fn()(info, makePlaylist(500, 4));
		expect(countDiscontinuity(out)).toBe(1);
		expect(info._SpliceStreamId).toBe("site|1080p60");
		expect(info._SpliceBoundarySeq).toBe(500);
	});

	it("stops inserting the marker after the boundary scrolls off but keeps disc-seq", () => {
		const info = makeInfo({
			IsUsingBackupStream: true,
			ActiveBackupPlayerType: "site",
			ActiveBackupResolution: "1080p60",
		});
		fn()(info, makePlaylist(500, 4));
		const refreshed = fn()(info, makePlaylist(504, 4));
		expect(countDiscontinuity(refreshed)).toBe(0);
		expect(refreshed).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:1");
		expect(info._SpliceBoundarySeq).toBe(500);
	});

	it("re-bridges with a fresh boundary on an LQ→HQ identity change", () => {
		const info = makeInfo({
			IsUsingBackupStream: true,
			ActiveBackupPlayerType: "autoplay",
			ActiveBackupResolution: "360p30",
		});
		fn()(info, makePlaylist(20, 4));
		info.ActiveBackupPlayerType = "site";
		info.ActiveBackupResolution = "1080p60";
		const upgraded = fn()(info, makePlaylist(900, 4));
		expect(countDiscontinuity(upgraded)).toBe(1);
		expect(info._SpliceStreamId).toBe("site|1080p60");
		expect(info._SpliceBoundarySeq).toBe(900);
	});

	it("leaves segmentless (master) playlists untouched", () => {
		const info = makeInfo({
			IsUsingBackupStream: true,
			ActiveBackupPlayerType: "site",
		});
		const master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nchunked/index.m3u8";
		expect(fn()(info, master)).toBe(master);
	});
});

describe("_processM3U8 ad-end reload decision (CSAI escape)", () => {
	const NATIVE_URL =
		"https://video-weaver.example.ttvnw.net/v1/playlist/native.m3u8";
	const processM3U8 = () =>
		T<
			(
				url: string,
				text: string,
				realFetch: (...args: unknown[]) => Promise<unknown>,
			) => Promise<string>
		>("_processM3U8");

	const sentMessages = () =>
		(g._postWorkerBridgeMessage as ReturnType<typeof vi.fn>).mock.calls.map(
			(call) => call[1] as Record<string, unknown>,
		);

	function setupCsaiEscapeAdEnd(overrides: Record<string, unknown> = {}) {
		g.postMessage = () => {};
		g._postWorkerBridgeMessage = vi.fn();
		g._createPageScopedWorkerEvent = (value: unknown) => value;
		const info = makeInfo({
			IsShowingAd: true,
			IsUsingBackupStream: true,
			CsaiOnlyThisBreak: true,
			ActiveBackupPlayerType: "embed",
			LastCleanBackupM3U8: makePlaylist(50, 3),
			LastCleanBackupPlayerType: "embed",
			LastCleanBackupAt: Date.now(),
			PendingAdEndAt: Date.now() - 5000,
			CleanPlaylistCount: 2,
			VisibleAdStartedAt: Date.now() - 10000,
			...overrides,
		});
		getState().StreamInfosByUrl = { [NATIVE_URL]: info };
		return info;
	}

	it("keeps the held backup playing without a reload when ending into a silent backup hold", async () => {
		const info = setupCsaiEscapeAdEnd({ ConsecutiveFailedNativeProbes: 6 });
		g._canReloadNativePlayerAfterAd = async () => false;

		const out = await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
			Promise.reject(new Error("unexpected fetch")),
		);

		const messages = sentMessages();
		expect(messages.find((m) => m.key === "AdEnded")).toMatchObject({
			holdingBackup: true,
			willReload: false,
		});
		expect(messages.some((m) => m.key === "ReloadPlayer")).toBe(false);
		expect(info.IsHoldingBackupAfterAd).toBe(true);
		expect(out).toContain("seg50.ts");
	});

	it("still soft-reloads (post-escape) after a verified-clean CSAI escape", async () => {
		const info = setupCsaiEscapeAdEnd();
		g._canReloadNativePlayerAfterAd = async () => true;

		const out = await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
			Promise.reject(new Error("unexpected fetch")),
		);

		const messages = sentMessages();
		expect(messages.find((m) => m.key === "AdEnded")).toMatchObject({
			holdingBackup: false,
			willReload: true,
		});
		expect(messages.find((m) => m.key === "ReloadPlayer")).toMatchObject({
			reason: "post-escape",
		});
		expect(info.IsHoldingBackupAfterAd).toBe(false);
		expect(out).toContain("seg100.ts");
	});

	it("learns a post-escape reload is counterproductive when another ad break ends right after it", async () => {
		const info = setupCsaiEscapeAdEnd({
			LastAdEndReloadAt: Date.now() - 5000,
			LastAdEndReloadKind: "post-escape",
		});
		g._canReloadNativePlayerAfterAd = async () => true;

		await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
			Promise.reject(new Error("unexpected fetch")),
		);

		expect(info.PostEscapeReloadCounterproductive).toBe(true);
		expect(sentMessages().some((m) => m.key === "ReloadPlayer")).toBe(false);
	});

	it("downgrades a post-escape reload to pause/resume once it has proven counterproductive", async () => {
		const info = setupCsaiEscapeAdEnd({
			PostEscapeReloadCounterproductive: true,
		});
		g._canReloadNativePlayerAfterAd = async () => true;

		const out = await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
			Promise.reject(new Error("unexpected fetch")),
		);

		const messages = sentMessages();
		expect(messages.find((m) => m.key === "AdEnded")).toMatchObject({
			willReload: false,
		});
		expect(messages.some((m) => m.key === "ReloadPlayer")).toBe(false);
		expect(messages.some((m) => m.key === "PauseResumePlayer")).toBe(true);
		expect(info.PostEscapeReloadCounterproductive).toBe(true);
		expect(out).toContain("seg100.ts");
	});
});

describe("_processM3U8 triggered-reload consumption (context-scoped)", () => {
	const URL_A = "https://video-weaver.example.ttvnw.net/v1/playlist/chanA.m3u8";

	const processM3U8 = () =>
		T<
			(
				url: string,
				text: string,
				realFetch: (...args: unknown[]) => Promise<unknown>,
			) => Promise<string>
		>("_processM3U8");

	function cleanPlaylist(mediaSeq: number) {
		const lines = [
			"#EXTM3U",
			"#EXT-X-VERSION:7",
			"#EXT-X-TARGETDURATION:2",
			`#EXT-X-MEDIA-SEQUENCE:${mediaSeq}`,
		];
		for (let i = 0; i < 3; i++) {
			lines.push("#EXTINF:2.000,live");
			lines.push(`live-seg${mediaSeq + i}.ts`);
		}
		return lines.join("\n");
	}

	function setup() {
		g.postMessage = () => {};
		g._postWorkerBridgeMessage = () => {};
		g._createPageScopedWorkerEvent = (value: unknown) => value;
		const info = makeInfo({
			MediaKey: "live:chana",
			ChannelName: "chana",
			LastPlayerReload: 0,
		});
		getState().StreamInfosByUrl = { [URL_A]: info };
		getState().HasTriggeredPlayerReload = true;
		getState().PendingTriggeredPlayerReloadAt = 1000;
		return info;
	}

	it("does not consume a pending reload flagged for a different stream", async () => {
		const info = setup();
		getState().PendingTriggeredPlayerReloadMediaKey = "live:chanb";
		getState().PendingTriggeredPlayerReloadChannel = "chanb";

		await processM3U8()(URL_A, cleanPlaylist(100), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(getState().HasTriggeredPlayerReload).toBe(true);
		expect(getState().PendingTriggeredPlayerReloadMediaKey).toBe("live:chanb");
		expect(info.LastPlayerReload).toBe(0);
	});

	it("consumes the pending reload for the matching stream", async () => {
		const info = setup();
		getState().PendingTriggeredPlayerReloadMediaKey = "live:chana";
		getState().PendingTriggeredPlayerReloadChannel = "chana";

		await processM3U8()(URL_A, cleanPlaylist(100), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(getState().HasTriggeredPlayerReload).toBe(false);
		expect(getState().PendingTriggeredPlayerReloadMediaKey).toBe(null);
		expect(info.LastPlayerReload).toBeGreaterThan(0);
	});
});

describe("_processM3U8 ad-end bounce backup serving", () => {
	const NATIVE_URL =
		"https://video-weaver.example.ttvnw.net/v1/playlist/bounce.m3u8";

	const processM3U8 = () =>
		T<
			(
				url: string,
				text: string,
				realFetch: (...args: unknown[]) => Promise<unknown>,
			) => Promise<string>
		>("_processM3U8");

	function adMarkedNative() {
		return [
			"#EXTM3U",
			"#EXT-X-VERSION:7",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:200",
			'#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad"',
			"#EXTINF:2.000,live",
			"native-live-200.ts",
		].join("\n");
	}

	function setupBounce(backupAtOffsetMs: number) {
		g.postMessage = () => {};
		g._postWorkerBridgeMessage = () => {};
		g._createPageScopedWorkerEvent = (value: unknown) => value;
		g._notifyAdComplete = () => Promise.resolve();
		const now = Date.now();
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: now - 1000,
			PendingAdEndAt: now - 1000,
			CleanPlaylistCount: 1,
			LastAdEndBounceAt: now - 1000,
			LastCleanBackupM3U8: makePlaylist(50, 3),
			LastCleanBackupPlayerType: "site",
			ActiveBackupPlayerType: "site",
			LastCleanBackupAt: now - backupAtOffsetMs,
		});
		getState().StreamInfosByUrl = { [NATIVE_URL]: info };
		return info;
	}

	it("marks IsUsingBackupStream and serves a fresh cached backup on an ad-end bounce", async () => {
		const info = setupBounce(0);

		const out = await processM3U8()(NATIVE_URL, adMarkedNative(), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(info.IsUsingBackupStream).toBe(true);
		expect(out).toContain("seg50.ts");
	});

	it("does not serve a stale cached backup on an ad-end bounce", async () => {
		const info = setupBounce(20000);

		const out = await processM3U8()(NATIVE_URL, adMarkedNative(), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(info.IsUsingBackupStream).toBe(false);
		expect(out).not.toContain("seg50.ts");
	});
});

describe("_processM3U8 silent-hold stall rotation", () => {
	const NATIVE_URL =
		"https://video-weaver.example.ttvnw.net/v1/playlist/hold.m3u8";

	const processM3U8 = () =>
		T<
			(
				url: string,
				text: string,
				realFetch: (...args: unknown[]) => Promise<unknown>,
			) => Promise<string>
		>("_processM3U8");

	function adMarkedNative() {
		return [
			"#EXTM3U",
			"#EXT-X-VERSION:7",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:300",
			'#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad"',
			"#EXTINF:2.000,live",
			"native-live-300.ts",
		].join("\n");
	}

	function setupHold() {
		g.postMessage = () => {};
		g._postWorkerBridgeMessage = () => {};
		g._createPageScopedWorkerEvent = (value: unknown) => value;
		g._notifyAdComplete = () => Promise.resolve();
		const now = Date.now();
		const info = makeInfo({
			IsHoldingBackupAfterAd: true,
			SilentBackupHoldStartedAt: now,
			LastSilentBackupHoldLogAt: now,
			LastCleanBackupM3U8: makePlaylist(50, 3),
			LastCleanBackupPlayerType: "site",
			ActiveBackupPlayerType: "site",
			LastCleanBackupAt: now,
		});
		getState().StreamInfosByUrl = { [NATIVE_URL]: info };
		return info;
	}

	it("rotates to a different backup type when the page reports the pinned backup stalled", async () => {
		const info = setupHold();
		getState().BackupSearchForceRefreshAt = Date.now();
		const refreshSpy = vi.fn(async () => makePlaylist(50, 3));
		g._refreshActiveBackupMediaPlaylist = refreshSpy;
		g._findBackupStream = vi.fn(async () => ({
			type: "embed",
			m3u8: makePlaylist(80, 3),
		}));

		const out = await processM3U8()(NATIVE_URL, adMarkedNative(), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(out).toContain("seg80.ts");
		expect(out).not.toContain("seg50.ts");
		expect(info.FailedBackupPlayerTypes.has("site")).toBe(true);
		expect(info.ActiveBackupPlayerType).toBe("embed");
		expect(getState().BackupSearchForceRefreshAt).toBe(0);
		expect(refreshSpy).not.toHaveBeenCalled();
	});

	it("keeps serving the cached backup when no stall is reported and it is fresh", async () => {
		const info = setupHold();
		getState().BackupSearchForceRefreshAt = 0;
		g._findBackupStream = vi.fn(async () => ({
			type: "embed",
			m3u8: makePlaylist(80, 3),
		}));

		const out = await processM3U8()(NATIVE_URL, adMarkedNative(), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(out).toContain("seg50.ts");
		expect(info.FailedBackupPlayerTypes.has("site")).toBe(false);
		expect(info.ActiveBackupPlayerType).toBe("site");
	});
});

describe("_processM3U8 consecutive-midroll continuation fast-refresh", () => {
	const NATIVE_URL =
		"https://video-weaver.example.ttvnw.net/v1/playlist/burst.m3u8";

	const processM3U8 = () =>
		T<
			(
				url: string,
				text: string,
				realFetch: (...args: unknown[]) => Promise<unknown>,
			) => Promise<string>
		>("_processM3U8");

	function adMarkedNative() {
		return [
			"#EXTM3U",
			"#EXT-X-VERSION:7",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:400",
			'#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad"',
			"#EXT-X-DISCONTINUITY",
			"#EXTINF:2.000,Amazon",
			"ad-400.ts",
		].join("\n");
	}

	function setupReentry() {
		g.postMessage = () => {};
		g._postWorkerBridgeMessage = () => {};
		g._createPageScopedWorkerEvent = (value: unknown) => value;
		g._notifyAdComplete = () => Promise.resolve();
		const now = Date.now();
		const info = makeInfo({
			IsShowingAd: true,
			IsHoldingBackupAfterAd: false,
			VisibleAdStartedAt: now - 500,
			LastAdEndReloadAt: now,
			LastCleanBackupM3U8: makePlaylist(50, 3),
			LastCleanBackupPlayerType: "site",
			ActiveBackupPlayerType: "site",
			LastCleanBackupAt: now,
		});
		getState().StreamInfosByUrl = { [NATIVE_URL]: info };
		getState().LastAdEndedAt = now;
		getState().BackupSearchForceRefreshAt = 0;
		return info;
	}

	it("serves the active backup via the cheap refresh (no full re-search) during a burst", async () => {
		const info = setupReentry();
		const refreshSpy = vi.fn(async () => makePlaylist(60, 3));
		g._refreshActiveBackupMediaPlaylist = refreshSpy;
		const searchSpy = vi.fn(async () => ({
			type: "embed",
			m3u8: makePlaylist(80, 3),
		}));
		g._findBackupStream = searchSpy;

		const out = await processM3U8()(NATIVE_URL, adMarkedNative(), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(refreshSpy).toHaveBeenCalled();
		expect(searchSpy).not.toHaveBeenCalled();
		expect(out).toContain("seg60.ts");
		expect(info.IsUsingBackupStream).toBe(true);
	});

	it("falls through to the full search when a backup stall is flagged (no ad-leak shortcut)", async () => {
		setupReentry();
		getState().BackupSearchForceRefreshAt = Date.now();
		const refreshSpy = vi.fn(async () => makePlaylist(60, 3));
		g._refreshActiveBackupMediaPlaylist = refreshSpy;
		const searchSpy = vi.fn(async () => ({
			type: "embed",
			m3u8: makePlaylist(80, 3),
		}));
		g._findBackupStream = searchSpy;

		const out = await processM3U8()(NATIVE_URL, adMarkedNative(), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(searchSpy).toHaveBeenCalled();
		expect(out).toContain("seg80.ts");
	});
});
