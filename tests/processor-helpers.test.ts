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
	g._S = { workers: [], conflicts: [], reinsertPatterns: [], adsBlocked: 0 };
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
		SilentBackupHoldMaxMs: 120000,
		SimulatedAdsDepth: 0,
		ClientVersion: null,
		ClientSession: null,
		ClientIntegrityHeader: null,
		AuthorizationHeader: null,
		GQLDeviceID: null,
		PreferredQualityGroup: null,
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
		Urls: Object.create(null),
		ResolutionList: [],
		ModifiedM3U8: null,
		_BackupSearchStartedAt: 0,
		_LastBackupSearchCompletedAt: 0,
		_LoggedOfflineTransition: false,
		_AdRequestController: null,
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

	it("allows fallback promotion for ad-marked candidates", () => {
		const r = fn()({
			candidateHasAds: true,
			candidateIsPlayable: true,
			simulatedAdsDepthSatisfied: true,
		});
		expect(r.allowSelectedPromotion).toBe(false);
		expect(r.allowFallbackPromotion).toBe(true);
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
