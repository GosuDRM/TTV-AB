import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

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
		expect(info.IsHoldingBackupAfterAd).toBe(false);
		expect(info.HevcReloadPendingAfterHold).toBe(false);
		expect(info.ConsecutiveFailedNativeProbes).toBe(0);
		expect(info._LoggedWhitelistByType).toBe(null);
		expect(info._EmptyAdHoldMediaSequence).toBe(0);
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
