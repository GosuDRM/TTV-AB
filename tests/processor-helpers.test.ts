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
		SegmentCodecOwners: new Map<string, Record<string, unknown>>(),
		AllSegmentsAreAdSegments: false,
		IsAdStrippingEnabled: true,
		CurrentAdChannel: null,
		CurrentAdMediaKey: null,
		AdPodProgressByMediaKey: Object.create(null),
		StreamInfos: Object.create(null),
		StreamInfosByUrl: Object.create(null),
		PinnedBackupPlayerType: null,
		PinnedBackupPlayerChannel: null,
		PinnedBackupPlayerMediaKey: null,
		ActiveCodecHandoffId: null,
		ActiveCodecHandoffChannel: null,
		ActiveCodecHandoffMediaKey: null,
		PageMediaType: null,
		PageChannel: null,
		PageVodID: null,
		PageMediaKey: null,
		PagePlaybackVisibleSinceAt: 0,
		LastAdEndedAt: 0,
		LastAdEndedChannel: null,
		LastAdEndedMediaKey: null,
		V2API: false,
		HasTriggeredPlayerReload: false,
		PendingTriggeredPlayerReloadChannel: null,
		PendingTriggeredPlayerReloadMediaKey: null,
		PendingTriggeredPlayerReloadAt: 0,
		PendingTriggeredPlayerReloadCycleStartedAt: 0,
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
		DisableAutoplayBackup: false,
		AllowPreviewEmergencyAutoplayBackup: false,
	};
	g.globalThis = g;
	g.self = g;
	g.window = g;
	g.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
	g.__realCanReloadNativePlayerAfterAd = g._canReloadNativePlayerAfterAd;
	g.__realFindBackupStream = g._findBackupStream;
	g.__realRefreshActiveBackupMediaPlaylist =
		g._refreshActiveBackupMediaPlaylist;
});

afterEach(() => {
	getState().PagePlaybackVisibleSinceAt = 0;
	getState().AllowPreviewEmergencyAutoplayBackup = false;
	if (g.__realCanReloadNativePlayerAfterAd) {
		g._canReloadNativePlayerAfterAd = g.__realCanReloadNativePlayerAfterAd;
	}
	if (g.__realFindBackupStream) {
		g._findBackupStream = g.__realFindBackupStream;
	}
	if (g.__realRefreshActiveBackupMediaPlaylist) {
		g._refreshActiveBackupMediaPlaylist =
			g.__realRefreshActiveBackupMediaPlaylist;
	}
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
		ObservedAdPodIds: new Set<string>(),
		ExpectedAdPodLength: 0,
		MaxObservedAdPodPosition: 0,
		ObservedZeroAdPodPosition: false,
		LastAdPodProgressAt: 0,
		_IncompletePodCleanStartedAt: 0,
		_IncompletePodCleanPlaylistCount: 0,
		_IncompletePodLastMediaSequence: null,
		_IncompletePodCandidateUrl: null,
		FailedBackupPlayerTypes: new Map<string, number>(),
		LastSessionNeutralBackupProbeCycleStartedAt: 0,
		ActiveBackupPlayerType: null,
		ActiveBackupResolution: null,
		SustainedNativeResolution: null,
		SustainedNativeResolutionAt: 0,
		SustainedNativeResolutionStartedAt: 0,
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
		LastNativeRecoveryProbeAt: 0,
		LastNativeRecoveryReadyPlayerType: null,
		NativeRecoveryCleanCount: 0,
		NativeRecoveryProbeEpoch: 0,
		_NativeRecoveryProbeInFlight: false,
		_NativeRecoveryProbeToken: null,
		ConsecutiveFailedNativeProbes: 0,
		NativeRecoveryProbeStreamUrl: null,
		NativeRecoveryProbeMediaKey: null,
		NativeRecoveryProbePlayerType: null,
		NativeRecoveryProbeCycleStartedAt: 0,
		NativeRecoveryProbeLastMediaSequence: null,
		NativeRecoveryProbeLastAdvancedAt: 0,
		NativeRecoveryAdPlaylistUrls: new Set<string>(),
		NativeRecoveryAdMediaKey: null,
		NativeRecoveryAdStartedAt: 0,
		NativeRecoveryLoaderEpoch: 0,
		NativeRecoveryCandidateUrl: null,
		NativeRecoveryCandidateMediaKey: null,
		NativeRecoveryCandidateCycleStartedAt: 0,
		NativeRecoveryCandidateStage: null,
		NativeRecoveryCandidateStartedAt: 0,
		NativeRecoveryCandidateCleanCount: 0,
		NativeRecoveryCandidateLastMediaSequence: null,
		HevcReloadPendingAfterHold: false,
		LastAdEndBounceAt: 0,
		LastAdEndReloadAt: 0,
		LastPlayerReload: 0,
		LastCleanBackupM3U8: null,
		LastCleanBackupPlayerType: null,
		LastCleanBackupResolution: null,
		LastCleanBackupCodecFamily: null,
		LastCleanBackupCodec: null,
		LastCleanBackupAt: 0,
		LastCleanNativeM3U8: null,
		LastCleanNativeUrl: null,
		LastCleanNativeCodec: null,
		LastCleanNativePlaylistAt: 0,
		LastCleanNativeLoaderEpoch: 0,
		BackupEncodingsM3U8Cache: Object.create(null),
		BackupVariantUrls: new Set<string>(),
		EnhancedVariantUrls: new Set<string>(),
		EnhancedDecoderCodecFamily: null,
		EnhancedDecoderCodec: null,
		LoggedBackupAdsByType: null,
		_LoggedWhitelistByType: null,
		Urls: Object.create(null),
		ResolutionList: [],
		ModifiedM3U8: null,
		_BackupSearchStartedAt: 0,
		_LastBackupSearchCompletedAt: 0,
		_BackupSearchKey: null,
		_BackupSearchPromises: new Map<string, Promise<unknown>>(),
		BackupSearchEpoch: 0,
		_ForegroundQualityProbeAppliedAt: 0,
		_BackupProbation: null,
		_BackupPinFlipCount: 0,
		_LoggedOfflineTransition: false,
		_AdRequestController: null,
		_EmptyAdHoldMediaSequence: 0,
		_FatalMediaRecoveryRequestId: null,
		_CodecHandoffSequence: 0,
		_CodecHandoffPendingId: null,
		_CodecHandoffAcknowledgedId: null,
		_CodecHandoffFailedId: null,
		_CodecHandoffReloadRetryCount: 0,
		_SpliceStreamId: null,
		_SpliceBoundarySeq: null,
		_SpliceDiscontinuityOffset: 0,
		_SpliceLastDiscontinuitySequence: null,
		...overrides,
	};
}

const TEST_AVC_RESOLUTION = {
	Name: "1080p60",
	Resolution: "1920x1080",
	FrameRate: 60,
	Codecs: "avc1.64002A,mp4a.40.2",
};
const TEST_HEVC_RESOLUTION = {
	Name: "chunked",
	Resolution: "2560x1440",
	FrameRate: 60,
	Codecs: "hev1.1.6.L153.B0,mp4a.40.2",
};

function declareAvcPlaybackUrl(info: Record<string, unknown>, url: string) {
	const currentUrls =
		info.Urls && typeof info.Urls === "object"
			? (info.Urls as Record<string, unknown>)
			: Object.create(null);
	info.Urls = { ...currentUrls, [url]: TEST_AVC_RESOLUTION };
	const currentResolutions = Array.isArray(info.ResolutionList)
		? info.ResolutionList
		: [];
	if (!currentResolutions.includes(TEST_AVC_RESOLUTION)) {
		info.ResolutionList = [...currentResolutions, TEST_AVC_RESOLUTION];
	}
	return info;
}

function declareHevcPlaybackUrl(info: Record<string, unknown>, url: string) {
	const currentUrls =
		info.Urls && typeof info.Urls === "object"
			? (info.Urls as Record<string, unknown>)
			: Object.create(null);
	info.Urls = { ...currentUrls, [url]: TEST_HEVC_RESOLUTION };
	const currentResolutions = Array.isArray(info.ResolutionList)
		? info.ResolutionList
		: [];
	if (!currentResolutions.includes(TEST_HEVC_RESOLUTION)) {
		info.ResolutionList = [...currentResolutions, TEST_HEVC_RESOLUTION];
	}
	return info;
}

function rememberBackupPlaylistMetadata(
	info: Record<string, unknown>,
	m3u8: string,
	codecFamily: string,
	codec: string,
) {
	return T<
		(
			info: Record<string, unknown>,
			m3u8: string,
			codecFamily: string,
			codec: string,
		) => string
	>("_rememberBackupPlaylistMetadata")(info, m3u8, codecFamily, codec);
}

function activateExactAdCycle(
	info: Record<string, unknown>,
	cycleStartedAt = Math.max(1, Number(info.VisibleAdStartedAt) || Date.now()),
) {
	const state = getState();
	const mediaKey = String(info.MediaKey);
	const channelName = String(info.ChannelName);
	info.VisibleAdStartedAt = cycleStartedAt;
	state.CurrentAdChannel = channelName;
	state.CurrentAdMediaKey = mediaKey;
	if (
		!state.AdPodProgressByMediaKey ||
		typeof state.AdPodProgressByMediaKey !== "object"
	) {
		state.AdPodProgressByMediaKey = Object.create(null);
	}
	if (!state.StreamInfos || typeof state.StreamInfos !== "object") {
		state.StreamInfos = Object.create(null);
	}
	(state.AdPodProgressByMediaKey as Record<string, unknown>)[mediaKey] = {
		cycleStartedAt,
	};
	(state.StreamInfos as Record<string, unknown>)[mediaKey] = info;
	return cycleStartedAt;
}

function cycleHandoffId(
	info: Record<string, unknown>,
	cycleStartedAt: number,
	label: string,
	sequence = 1,
	createdAt = Date.now(),
) {
	return `${String(info.MediaKey)}:${cycleStartedAt}:${createdAt}:${sequence}:${label}`;
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

	it("treats an auto preference as no preference so the sustained reading drives", () => {
		getState().PreferredQualityGroup = "auto";
		const info = makeInfo({
			ResolutionList: ladder,
			SustainedNativeResolution: { Resolution: "1920x1080", Name: "1080p60" },
		});
		expect(fn()(info)).toEqual({ Resolution: "1920x1080", Name: "1080p60" });
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
	let previousVisibleSinceAt: unknown;

	beforeEach(() => {
		previousVisibleSinceAt = getState().PagePlaybackVisibleSinceAt;
		getState().PagePlaybackVisibleSinceAt = Date.now() - 20000;
	});

	afterEach(() => {
		getState().PagePlaybackVisibleSinceAt = previousVisibleSinceAt;
	});

	it("records the resolution of the native variant the player is requesting", () => {
		const info = makeInfo({ Urls: urlsFor(url360, r360) });
		record()(info, url360);
		expect(info.SustainedNativeResolution).toEqual(r360);
		expect(info.SustainedNativeResolutionStartedAt).toBeGreaterThan(0);
	});

	it("keeps the first-seen time while the same native quality becomes established", () => {
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(100000);
		try {
			const info = makeInfo({ Urls: urlsFor(url360, r360) });
			record()(info, url360);
			nowSpy.mockReturnValue(120000);
			record()(info, url360);

			expect(info.SustainedNativeResolutionStartedAt).toBe(100000);
			expect(info.SustainedNativeResolutionAt).toBe(120000);
		} finally {
			nowSpy.mockRestore();
		}
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

	it("keeps the foreground baseline while hidden or during the visible ramp", () => {
		const now = Date.now();
		const info = makeInfo({
			Urls: urlsFor(url360, r360),
			SustainedNativeResolution: r1080,
			SustainedNativeResolutionAt: now - 61000,
		});
		getState().PagePlaybackVisibleSinceAt = 0;
		record()(info, url360);
		expect(info.SustainedNativeResolution).toEqual(r1080);

		getState().PagePlaybackVisibleSinceAt = now - 5000;
		record()(info, url360);
		expect(info.SustainedNativeResolution).toEqual(r1080);

		getState().PagePlaybackVisibleSinceAt = now - 10000;
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
		const pendingHandoffId = "live:testchannel:100:200:4:pending-reset";
		const failedHandoffId = "live:testchannel:100:190:3:failed-reset";
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
			NativeRecoveryProbeStreamUrl: "https://edge.example/native-recovery.m3u8",
			NativeRecoveryProbeMediaKey: "live:testchannel",
			NativeRecoveryProbePlayerType: "site",
			NativeRecoveryProbeCycleStartedAt: 100,
			NativeRecoveryProbeLastMediaSequence: 123,
			NativeRecoveryProbeLastAdvancedAt: 5000,
			NativeRecoveryAdPlaylistUrls: new Set([
				"https://edge.example/native-ad.m3u8?token=player",
			]),
			NativeRecoveryAdMediaKey: "live:testchannel",
			NativeRecoveryAdStartedAt: 100,
			NativeRecoveryLoaderEpoch: 3,
			NativeRecoveryCandidateUrl: "https://edge.example/native.m3u8",
			NativeRecoveryCandidateMediaKey: "live:testchannel",
			NativeRecoveryCandidateCycleStartedAt: 100,
			NativeRecoveryCandidateStage: "hold",
			NativeRecoveryCandidateStartedAt: 4000,
			NativeRecoveryCandidateCleanCount: 7,
			NativeRecoveryCandidateLastMediaSequence: 123,
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			ExpectedAdPodLength: 4,
			MaxObservedAdPodPosition: 3,
			ObservedZeroAdPodPosition: true,
			LastAdPodProgressAt: 5000,
			_IncompletePodCleanStartedAt: 4000,
			_IncompletePodCleanPlaylistCount: 7,
			_IncompletePodLastMediaSequence: 100,
			_IncompletePodCandidateUrl: "https://edge.example/native.m3u8",
			LastCleanNativeM3U8: "#EXTM3U\n#EXTINF:2.000,live\nnative.ts",
			LastCleanNativeUrl: "https://edge.example/native.m3u8",
			LastCleanNativeCodec: "hev1.1.6.L153.B0",
			EnhancedDecoderCodecFamily: "hevc",
			EnhancedDecoderCodec: "hev1.1.6.L153.B0",
			_LoggedWhitelistByType: new Set(["cooldown:site", "whitelist:site"]),
			_EmptyAdHoldMediaSequence: 12,
			_FatalMediaRecoveryRequestId: "fatal-recovery-old",
			_CodecHandoffSequence: 4,
			_CodecHandoffPendingId: pendingHandoffId,
			_CodecHandoffAcknowledgedId: pendingHandoffId,
			_CodecHandoffFailedId: failedHandoffId,
			_CodecHandoffReloadRetryCount: 2,
			_SpliceStreamId: "autoplay|640x360|avc1.64002a",
			_SpliceBoundarySeq: 400,
			_SpliceDiscontinuityOffset: 3,
			_SpliceLastDiscontinuitySequence: 5,
			_BackupProbation: { type: "site", at: 123 },
			_ForegroundQualityProbeAppliedAt: 456,
			LastSessionNeutralBackupProbeCycleStartedAt: 100,
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
		expect(info.NativeRecoveryProbeStreamUrl).toBe(null);
		expect(info.NativeRecoveryProbeMediaKey).toBe(null);
		expect(info.NativeRecoveryProbePlayerType).toBe(null);
		expect(info.NativeRecoveryProbeCycleStartedAt).toBe(0);
		expect(info.NativeRecoveryProbeLastMediaSequence).toBe(null);
		expect(info.NativeRecoveryProbeLastAdvancedAt).toBe(0);
		expect(info.NativeRecoveryAdPlaylistUrls).toBeInstanceOf(Set);
		expect((info.NativeRecoveryAdPlaylistUrls as Set<string>).size).toBe(0);
		expect(info.NativeRecoveryAdMediaKey).toBe(null);
		expect(info.NativeRecoveryAdStartedAt).toBe(0);
		expect(info.NativeRecoveryLoaderEpoch).toBe(3);
		expect(info.NativeRecoveryCandidateUrl).toBe(null);
		expect(info.NativeRecoveryCandidateMediaKey).toBe(null);
		expect(info.NativeRecoveryCandidateCycleStartedAt).toBe(0);
		expect(info.NativeRecoveryCandidateStage).toBe(null);
		expect(info.NativeRecoveryCandidateStartedAt).toBe(0);
		expect(info.NativeRecoveryCandidateCleanCount).toBe(0);
		expect(info.NativeRecoveryCandidateLastMediaSequence).toBe(null);
		expect((info.ObservedAdPodIds as Set<string>).size).toBe(0);
		expect(info.ExpectedAdPodLength).toBe(0);
		expect(info.MaxObservedAdPodPosition).toBe(0);
		expect(info.ObservedZeroAdPodPosition).toBe(false);
		expect(info.LastAdPodProgressAt).toBe(0);
		expect(info._IncompletePodCleanStartedAt).toBe(0);
		expect(info._IncompletePodCleanPlaylistCount).toBe(0);
		expect(info._IncompletePodLastMediaSequence).toBe(null);
		expect(info._IncompletePodCandidateUrl).toBe(null);
		expect(info.LastCleanNativeUrl).toBe("https://edge.example/native.m3u8");
		expect(info.EnhancedDecoderCodecFamily).toBe("hevc");
		expect(info.EnhancedDecoderCodec).toBe("hev1.1.6.L153.B0");
		expect(info._LoggedWhitelistByType).toBe(null);
		expect(info._EmptyAdHoldMediaSequence).toBe(0);
		expect(info._FatalMediaRecoveryRequestId).toBe(null);
		expect(info._CodecHandoffSequence).toBe(5);
		expect(info._CodecHandoffPendingId).toBe(null);
		expect(info._CodecHandoffAcknowledgedId).toBe(null);
		expect(info._CodecHandoffFailedId).toBe(null);
		expect(info._CodecHandoffReloadRetryCount).toBe(0);
		expect(info._SpliceStreamId).toBe(null);
		expect(info._SpliceBoundarySeq).toBe(null);
		expect(info._SpliceDiscontinuityOffset).toBe(0);
		expect(info._SpliceLastDiscontinuitySequence).toBe(null);
		expect(info._BackupProbation).toBe(null);
		expect(info._ForegroundQualityProbeAppliedAt).toBe(0);
		expect(info.LastSessionNeutralBackupProbeCycleStartedAt).toBe(100);
	});

	it("clears enhanced decoder ownership after a completed exact handoff", () => {
		const fn = T<(info: Record<string, unknown>) => Record<string, unknown>>(
			"_resetStreamAdState",
		);
		const handoffId = "live:testchannel:100:200:1:completed-reset";
		const info = makeInfo({
			VisibleAdStartedAt: 100,
			EnhancedDecoderCodecFamily: "hevc",
			EnhancedDecoderCodec: "hev1.1.6.L153.B0",
			_CodecHandoffPendingId: handoffId,
			_CodecHandoffAcknowledgedId: handoffId,
		});
		const state = getState();
		activateExactAdCycle(info, 100);
		state.ActiveCodecHandoffId = handoffId;
		state.ActiveCodecHandoffChannel = "testchannel";
		state.ActiveCodecHandoffMediaKey = "live:testchannel";

		fn(info);

		expect(info.EnhancedDecoderCodecFamily).toBe(null);
		expect(info.EnhancedDecoderCodec).toBe(null);
		expect(state.ActiveCodecHandoffId).toBe(null);
	});

	it("initializes CsaiOnlyThisBreak on new stream infos", () => {
		const create =
			T<(ctx: Record<string, unknown>) => Record<string, unknown>>(
				"_createStreamInfo",
			);
		const info = create({ ChannelName: "testchannel" });
		expect(info.CsaiOnlyThisBreak).toBe(false);
		expect(info.LastCleanNativeUrl).toBe(null);
		expect(info.LastCleanNativeCodec).toBe(null);
		expect(info.EnhancedVariantUrls).toBeInstanceOf(Set);
		expect(info.EnhancedDecoderCodecFamily).toBe(null);
		expect(info.EnhancedDecoderCodec).toBe(null);
		expect(info.LastCleanBackupCodec).toBe(null);
		expect(info.LastCleanBackupResolution).toBe(null);
		expect(info._BackupSearchPromises).toBeInstanceOf(Map);
		expect(info._CodecHandoffSequence).toBe(0);
		expect(info._CodecHandoffPendingId).toBe(null);
		expect(info._CodecHandoffAcknowledgedId).toBe(null);
		expect(info._CodecHandoffFailedId).toBe(null);
		expect(info._CodecHandoffReloadRetryCount).toBe(0);
		expect(info.NativeRecoveryProbeStreamUrl).toBe(null);
		expect(info.NativeRecoveryProbeMediaKey).toBe(null);
		expect(info.NativeRecoveryProbePlayerType).toBe(null);
		expect(info.NativeRecoveryProbeCycleStartedAt).toBe(0);
		expect(info.NativeRecoveryProbeLastMediaSequence).toBe(null);
		expect(info.NativeRecoveryProbeLastAdvancedAt).toBe(0);
		expect(info.NativeRecoveryAdPlaylistUrls).toBeInstanceOf(Set);
		expect((info.NativeRecoveryAdPlaylistUrls as Set<string>).size).toBe(0);
		expect(info.NativeRecoveryAdMediaKey).toBe(null);
		expect(info.NativeRecoveryAdStartedAt).toBe(0);
		expect(info.NativeRecoveryLoaderEpoch).toBe(0);
		expect(info.NativeRecoveryCandidateUrl).toBe(null);
		expect(info.NativeRecoveryCandidateMediaKey).toBe(null);
		expect(info.NativeRecoveryCandidateCycleStartedAt).toBe(0);
		expect(info.NativeRecoveryCandidateStage).toBe(null);
		expect(info.NativeRecoveryCandidateStartedAt).toBe(0);
		expect(info.NativeRecoveryCandidateCleanCount).toBe(0);
		expect(info.NativeRecoveryCandidateLastMediaSequence).toBe(null);
		expect(info.LastSessionNeutralBackupProbeCycleStartedAt).toBe(0);
	});

	it("seeds a replacement worker stream from main-owned ad pod progress", () => {
		const create =
			T<(ctx: Record<string, unknown>) => Record<string, unknown>>(
				"_createStreamInfo",
			);
		const state = getState();
		const previousCurrentAdMediaKey = state.CurrentAdMediaKey;
		const previousPodProgress = state.AdPodProgressByMediaKey;
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": {
				adIds: ["stitched-ad-1"],
				expectedPodLength: 2,
				maxAdPodPosition: 1,
				observedZeroAdPodPosition: true,
				cycleStartedAt: 1234,
				updatedAt: 1500,
			},
		};

		try {
			const info = create({
				MediaType: "live",
				ChannelName: "testchannel",
				MediaKey: "live:testchannel",
			});

			expect([...info.ObservedAdPodIds]).toEqual(["stitched-ad-1"]);
			expect(info.ExpectedAdPodLength).toBe(2);
			expect(info.MaxObservedAdPodPosition).toBe(1);
			expect(info.ObservedZeroAdPodPosition).toBe(true);
			expect(info.VisibleAdStartedAt).toBe(1234);
			expect(info.LastAdPodProgressAt).toBe(1500);
			expect(info.IsShowingAd).toBe(true);
			expect(info.AdEndConfirmEscalation).toBe(4);
		} finally {
			state.CurrentAdMediaKey = previousCurrentAdMediaKey;
			state.AdPodProgressByMediaKey = previousPodProgress;
		}
	});

	it("does not attach stale ad progress to a different active stream", () => {
		const create =
			T<(ctx: Record<string, unknown>) => Record<string, unknown>>(
				"_createStreamInfo",
			);
		const state = getState();
		const previousCurrentAdMediaKey = state.CurrentAdMediaKey;
		const previousPodProgress = state.AdPodProgressByMediaKey;
		state.CurrentAdMediaKey = "live:otherchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": {
				adIds: ["stitched-ad-1"],
				expectedPodLength: 2,
				maxAdPodPosition: 1,
				observedZeroAdPodPosition: true,
				cycleStartedAt: 1234,
			},
		};

		try {
			const info = create({
				MediaType: "live",
				ChannelName: "testchannel",
				MediaKey: "live:testchannel",
			});

			expect(info.VisibleAdStartedAt).toBe(0);
			expect(info.IsShowingAd).toBe(false);
			expect([...info.ObservedAdPodIds]).toEqual([]);
			expect(info.ExpectedAdPodLength).toBe(0);
			expect(info.MaxObservedAdPodPosition).toBe(0);
			expect(info.ObservedZeroAdPodPosition).toBe(false);
			expect(info.AdEndConfirmEscalation).toBe(0);
		} finally {
			state.CurrentAdMediaKey = previousCurrentAdMediaKey;
			state.AdPodProgressByMediaKey = previousPodProgress;
		}
	});

	it("fails closed before synthetic media can inherit an active ad cycle", async () => {
		const state = getState();
		const previousState = {
			currentAdChannel: state.CurrentAdChannel,
			currentAdMediaKey: state.CurrentAdMediaKey,
			podProgress: state.AdPodProgressByMediaKey,
			streamInfos: state.StreamInfos,
			streamInfosByUrl: state.StreamInfosByUrl,
			isAdStrippingEnabled: state.IsAdStrippingEnabled,
			pageMediaType: state.PageMediaType,
			pageChannel: state.PageChannel,
			pageVodID: state.PageVodID,
			pageMediaKey: state.PageMediaKey,
			requestMediaBootstrapRecovery: state.RequestMediaBootstrapRecovery,
		};
		const previousFindBackup = g._findBackupStream;
		const firstMediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/replacement-1080p.m3u8";
		const nativePlaylist = makePlaylist(700, 3);
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 1234 },
		};
		state.IsAdStrippingEnabled = true;
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageVodID = null;
		state.PageMediaKey = "live:testchannel";
		state.StreamInfos = Object.create(null);
		state.StreamInfosByUrl = Object.create(null);
		const findBackup = vi.fn();
		const requestMediaBootstrapRecovery = vi.fn();
		g._findBackupStream = findBackup;
		state.RequestMediaBootstrapRecovery = requestMediaBootstrapRecovery;

		try {
			await expect(
				T<
					(
						url: string,
						text: string,
						realFetch: (input: string) => Promise<Response>,
					) => Promise<string>
				>("_processM3U8Core")(firstMediaUrl, nativePlaylist, async () => {
					throw new Error("no fetch expected");
				}),
			).rejects.toMatchObject({ name: "AbortError" });
			expect(
				(state.StreamInfos as Record<string, unknown>)["live:testchannel"],
			).toBeUndefined();
			expect(findBackup).not.toHaveBeenCalled();
			expect(requestMediaBootstrapRecovery).toHaveBeenCalledOnce();
			expect(requestMediaBootstrapRecovery).toHaveBeenCalledWith(
				expect.objectContaining({ MediaKey: "live:testchannel" }),
				1234,
			);
		} finally {
			state.CurrentAdChannel = previousState.currentAdChannel;
			state.CurrentAdMediaKey = previousState.currentAdMediaKey;
			state.AdPodProgressByMediaKey = previousState.podProgress;
			state.StreamInfos = previousState.streamInfos;
			state.StreamInfosByUrl = previousState.streamInfosByUrl;
			state.IsAdStrippingEnabled = previousState.isAdStrippingEnabled;
			state.PageMediaType = previousState.pageMediaType;
			state.PageChannel = previousState.pageChannel;
			state.PageVodID = previousState.pageVodID;
			state.PageMediaKey = previousState.pageMediaKey;
			state.RequestMediaBootstrapRecovery =
				previousState.requestMediaBootstrapRecovery;
			g._findBackupStream = previousFindBackup;
		}
	});

	it("aborts a media-first inherited hold until decoder ownership is known", async () => {
		const state = getState();
		const previousState = {
			currentAdChannel: state.CurrentAdChannel,
			currentAdMediaKey: state.CurrentAdMediaKey,
			podProgress: state.AdPodProgressByMediaKey,
			streamInfos: state.StreamInfos,
			streamInfosByUrl: state.StreamInfosByUrl,
			pageMediaType: state.PageMediaType,
			pageChannel: state.PageChannel,
			pageVodID: state.PageVodID,
			pageMediaKey: state.PageMediaKey,
			requestMediaBootstrapRecovery: state.RequestMediaBootstrapRecovery,
		};
		const previousFindBackup = g._findBackupStream;
		let resolveBackupSearch:
			| ((value: { type: null; m3u8: null }) => void)
			| null = null;
		const pendingBackupSearch = new Promise<{ type: null; m3u8: null }>(
			(resolve) => {
				resolveBackupSearch = resolve;
			},
		);
		const findBackup = vi.fn((info: Record<string, unknown>) => {
			info._BackupSearchPromise = pendingBackupSearch;
			info._BackupSearchKey = "live:testchannel|0|1234|0|unknown|unknown";
			(info._BackupSearchPromises as Map<string, Promise<unknown>>).set(
				"unknown",
				pendingBackupSearch,
			);
			return pendingBackupSearch;
		});
		g._findBackupStream = findBackup;
		const requestMediaBootstrapRecovery = vi.fn();
		state.RequestMediaBootstrapRecovery = requestMediaBootstrapRecovery;
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 1234 },
		};
		state.PageMediaType = "live";
		state.PageChannel = "testchannel";
		state.PageVodID = null;
		state.PageMediaKey = "live:testchannel";
		state.StreamInfos = Object.create(null);
		state.StreamInfosByUrl = Object.create(null);
		const mediaUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/media-first.m3u8";

		try {
			const processMedia = () =>
				T<
					(
						url: string,
						text: string,
						realFetch: (input: string) => Promise<Response>,
					) => Promise<string>
				>("_processM3U8")(mediaUrl, makePlaylist(800, 3), async () => {
					throw new Error("no fetch expected");
				});
			await expect(processMedia()).rejects.toMatchObject({
				name: "AbortError",
			});
			await expect(processMedia()).rejects.toMatchObject({
				name: "AbortError",
			});
			expect(
				(state.StreamInfos as Record<string, unknown>)["live:testchannel"],
			).toBeUndefined();
			expect(findBackup).not.toHaveBeenCalled();
			expect(requestMediaBootstrapRecovery).toHaveBeenCalledTimes(2);
			expect(requestMediaBootstrapRecovery).toHaveBeenLastCalledWith(
				expect.objectContaining({ MediaKey: "live:testchannel" }),
				1234,
			);
		} finally {
			resolveBackupSearch?.({ type: null, m3u8: null });
			await Promise.resolve();
			state.CurrentAdChannel = previousState.currentAdChannel;
			state.CurrentAdMediaKey = previousState.currentAdMediaKey;
			state.AdPodProgressByMediaKey = previousState.podProgress;
			state.StreamInfos = previousState.streamInfos;
			state.StreamInfosByUrl = previousState.streamInfosByUrl;
			state.PageMediaType = previousState.pageMediaType;
			state.PageChannel = previousState.pageChannel;
			state.PageVodID = previousState.pageVodID;
			state.PageMediaKey = previousState.pageMediaKey;
			state.RequestMediaBootstrapRecovery =
				previousState.requestMediaBootstrapRecovery;
			g._findBackupStream = previousFindBackup;
		}
	});

	it("does not attach an unrelated clean playlist to the active ad context", async () => {
		const state = getState();
		const previous = {
			currentAdChannel: state.CurrentAdChannel,
			currentAdMediaKey: state.CurrentAdMediaKey,
			podProgress: state.AdPodProgressByMediaKey,
			pageMediaType: state.PageMediaType,
			pageChannel: state.PageChannel,
			pageMediaKey: state.PageMediaKey,
			streamInfos: state.StreamInfos,
			streamInfosByUrl: state.StreamInfosByUrl,
		};
		state.CurrentAdChannel = "testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 1234 },
		};
		state.PageMediaType = "live";
		state.PageChannel = "otherchannel";
		state.PageMediaKey = "live:otherchannel";
		state.StreamInfos = Object.create(null);
		state.StreamInfosByUrl = Object.create(null);
		const cleanPlaylist = makePlaylist(900, 3);

		try {
			const out = await T<
				(
					url: string,
					text: string,
					realFetch: (input: string) => Promise<Response>,
				) => Promise<string>
			>("_processM3U8Core")(
				"https://video-weaver.example.ttvnw.net/v1/playlist/unrelated.m3u8",
				cleanPlaylist,
				async () => {
					throw new Error("no fetch expected");
				},
			);

			expect(out).toContain("seg900.ts");
			expect(out).not.toContain("__ttvab_empty_hold_segment.mp4");
			expect(Object.keys(state.StreamInfos as Record<string, unknown>)).toEqual(
				[],
			);
		} finally {
			state.CurrentAdChannel = previous.currentAdChannel;
			state.CurrentAdMediaKey = previous.currentAdMediaKey;
			state.AdPodProgressByMediaKey = previous.podProgress;
			state.PageMediaType = previous.pageMediaType;
			state.PageChannel = previous.pageChannel;
			state.PageMediaKey = previous.pageMediaKey;
			state.StreamInfos = previous.streamInfos;
			state.StreamInfosByUrl = previous.streamInfosByUrl;
		}
	});

	it("reports wasUsingModifiedM3U8 when active", () => {
		const fn = T<(info: Record<string, unknown>) => Record<string, unknown>>(
			"_resetStreamAdState",
		);
		const info = makeInfo({ IsUsingModifiedM3U8: true });
		const result = fn(info);
		expect(result.wasUsingModifiedM3U8).toBe(true);
	});

	it("does not let an older stream reset clear a newer exact handoff", () => {
		const fn = T<(info: Record<string, unknown>) => Record<string, unknown>>(
			"_resetStreamAdState",
		);
		const state = getState();
		const previous = {
			id: state.ActiveCodecHandoffId,
			channel: state.ActiveCodecHandoffChannel,
			mediaKey: state.ActiveCodecHandoffMediaKey,
			currentAdMediaKey: state.CurrentAdMediaKey,
			adPodProgress: state.AdPodProgressByMediaKey,
		};
		const staleHandoffId = "live:testchannel:100:150:1:stale-reset";
		const currentHandoffId = "live:testchannel:200:250:1:current-reset";
		state.CurrentAdMediaKey = "live:testchannel";
		state.AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 200 },
		};
		state.ActiveCodecHandoffId = currentHandoffId;
		state.ActiveCodecHandoffChannel = "testchannel";
		state.ActiveCodecHandoffMediaKey = "live:testchannel";
		try {
			fn(
				makeInfo({
					MediaKey: "live:testchannel",
					VisibleAdStartedAt: 100,
					_CodecHandoffPendingId: staleHandoffId,
					_CodecHandoffAcknowledgedId: staleHandoffId,
				}),
			);

			expect(state.ActiveCodecHandoffId).toBe(currentHandoffId);
			expect(state.ActiveCodecHandoffMediaKey).toBe("live:testchannel");
		} finally {
			state.ActiveCodecHandoffId = previous.id;
			state.ActiveCodecHandoffChannel = previous.channel;
			state.ActiveCodecHandoffMediaKey = previous.mediaKey;
			state.CurrentAdMediaKey = previous.currentAdMediaKey;
			state.AdPodProgressByMediaKey = previous.adPodProgress;
		}
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

describe("_findBackupStream fresh-session probation", () => {
	const findBackupStream = () =>
		T<
			(
				info: Record<string, unknown>,
				realFetch: (url: string, options?: unknown) => Promise<Response>,
				startIdx?: number,
				currentResolution?: Record<string, unknown>,
			) => Promise<{ type: string | null; m3u8: string | null }>
		>("_findBackupStream");
	const currentResolution = {
		Name: "720p",
		Resolution: "1280x720",
		FrameRate: 60,
	};
	const masterPlaylist = (playerType: string) =>
		[
			"#EXTM3U",
			playerType === "autoplay"
				? '#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360,FRAME-RATE=30.000,VIDEO="360p"'
				: '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,FRAME-RATE=60.000,VIDEO="720p"',
			`https://cdn.example/${playerType}/index.m3u8`,
		].join("\n");
	const adPlaylist = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		'#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad",START-DATE="2024-01-01T00:00:00Z"',
		"#EXTINF:2.000,",
		"https://edge.example/stitched-ad-1.ts",
	].join("\n");
	const sitePlaylist = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		"#EXTINF:2.000,live",
		"https://edge.example/site-live-1.ts",
	].join("\n");
	const bridgePlaylist = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		"#EXTINF:2.000,live",
		"https://edge.example/autoplay-live-1.ts",
	].join("\n");
	const emptyPlaylist = ["#EXTM3U", "#EXT-X-TARGETDURATION:2"].join("\n");

	function makeHoldInfo() {
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: 991_000,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupM3U8: bridgePlaylist,
			LastCleanBackupAt: 999_000,
			_LqHoldStartAt: 940_000,
			BackupEncodingsM3U8Cache: { autoplay: masterPlaylist("autoplay") },
		});
		activateExactAdCycle(info, 991_000);
		return info;
	}

	function setupSweep(siteMedia: () => string) {
		const state = getState();
		const previous = {
			types: state.BackupPlayerTypes,
			disable: state.DisableAutoplayBackup,
			getToken: g._getToken,
			extract: g._extractPlaybackAccessToken,
		};
		const tokenCalls: string[] = [];
		let activePlayerType = "";
		state.BackupPlayerTypes = ["site", "autoplay"];
		state.DisableAutoplayBackup = false;
		g._extractPlaybackAccessToken = () => ({
			signature: "sig",
			value: "token",
		});
		g._getToken = async (_info: unknown, playerType: unknown) => {
			activePlayerType = String(playerType);
			tokenCalls.push(activePlayerType);
			return new Response("{}", { status: 200 });
		};
		const realFetch = async (url: string) => {
			const href = String(url);
			if (href.includes("usher.ttvnw.net")) {
				return new Response(masterPlaylist(activePlayerType), {
					status: 200,
				});
			}
			if (href.includes("/site/")) {
				return new Response(siteMedia(), { status: 200 });
			}
			if (href.includes("/autoplay/")) {
				return new Response(bridgePlaylist, { status: 200 });
			}
			return new Response(null, { status: 404 });
		};
		const restore = () => {
			state.BackupPlayerTypes = previous.types;
			state.DisableAutoplayBackup = previous.disable;
			if (previous.getToken === undefined) {
				delete g._getToken;
			} else {
				g._getToken = previous.getToken;
			}
			if (previous.extract === undefined) {
				delete g._extractPlaybackAccessToken;
			} else {
				g._extractPlaybackAccessToken = previous.extract;
			}
		};
		return { tokenCalls, realFetch, restore };
	}

	function setupSessionNeutralSweep(
		authenticatedSiteMedia: () => string,
		neutralSiteMedia: () => string,
		onToken?: (omitViewerHeaders: boolean) => void,
	) {
		const state = getState();
		const previous = {
			types: state.BackupPlayerTypes,
			disable: state.DisableAutoplayBackup,
			authorization: state.AuthorizationHeader,
			integrity: state.ClientIntegrityHeader,
			getToken: g._getToken,
			extract: g._extractPlaybackAccessToken,
		};
		const tokenCalls: Array<{
			playerType: string;
			omitViewerHeaders: boolean;
		}> = [];
		let activePlayerType = "";
		let activeOmitViewerHeaders = false;
		let autoplayRefreshes = 0;
		state.BackupPlayerTypes = ["site", "autoplay"];
		state.DisableAutoplayBackup = false;
		state.AuthorizationHeader = "OAuth viewer";
		state.ClientIntegrityHeader = "integrity";
		g._extractPlaybackAccessToken = () => ({
			signature: "sig",
			value: "token",
		});
		g._getToken = async (
			_info: unknown,
			playerType: unknown,
			_realFetch: unknown,
			omitViewerHeaders = false,
		) => {
			activePlayerType = String(playerType);
			activeOmitViewerHeaders = Boolean(omitViewerHeaders);
			tokenCalls.push({
				playerType: activePlayerType,
				omitViewerHeaders: activeOmitViewerHeaders,
			});
			onToken?.(activeOmitViewerHeaders);
			return new Response("{}", { status: 200 });
		};
		const realFetch = async (url: string) => {
			const href = String(url);
			if (href.includes("usher.ttvnw.net")) {
				const master = activeOmitViewerHeaders
					? masterPlaylist(activePlayerType).replace(
							`/${activePlayerType}/index.m3u8`,
							`/${activePlayerType}/index.m3u8?profile=session-neutral`,
						)
					: masterPlaylist(activePlayerType);
				return new Response(master, {
					status: 200,
				});
			}
			if (/\/(?:site|embed|popout|mobile_web)\//.test(href)) {
				return new Response(
					href.includes("profile=session-neutral")
						? neutralSiteMedia()
						: authenticatedSiteMedia(),
					{ status: 200 },
				);
			}
			if (href.includes("/autoplay/")) {
				autoplayRefreshes++;
				return new Response(bridgePlaylist, { status: 200 });
			}
			return new Response(null, { status: 404 });
		};
		const restore = () => {
			state.BackupPlayerTypes = previous.types;
			state.DisableAutoplayBackup = previous.disable;
			state.AuthorizationHeader = previous.authorization;
			state.ClientIntegrityHeader = previous.integrity;
			if (previous.getToken === undefined) {
				delete g._getToken;
			} else {
				g._getToken = previous.getToken;
			}
			if (previous.extract === undefined) {
				delete g._extractPlaybackAccessToken;
			} else {
				g._extractPlaybackAccessToken = previous.extract;
			}
		};
		return {
			tokenCalls,
			realFetch,
			restore,
			getAutoplayRefreshes: () => autoplayRefreshes,
		};
	}

	it("retries one empty authenticated source without viewer headers while keeping autoplay live", async () => {
		const sweep = setupSessionNeutralSweep(
			() => emptyPlaylist,
			() => sitePlaylist,
		);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			const first = await findBackupStream()(
				info,
				sweep.realFetch,
				0,
				currentResolution,
			);

			expect(first).toEqual({ type: "autoplay", m3u8: bridgePlaylist });
			expect(sweep.tokenCalls).toEqual([
				{ playerType: "site", omitViewerHeaders: false },
				{ playerType: "site", omitViewerHeaders: true },
			]);
			expect(sweep.getAutoplayRefreshes()).toBeGreaterThan(0);
			expect(info.LastSessionNeutralBackupProbeCycleStartedAt).toBe(991_000);
			expect(info._BackupProbation).toEqual({
				type: "site",
				at: 1_000_000,
				cleanChecks: 1,
			});

			nowSpy.mockReturnValue(1_002_100);
			const second = await findBackupStream()(
				info,
				sweep.realFetch,
				0,
				currentResolution,
			);

			expect(second).toEqual({ type: "site", m3u8: sitePlaylist });
			expect(sweep.tokenCalls).toHaveLength(2);
			expect(info.LastCleanBackupPlayerType).toBe("site");
			expect(info.LastCleanBackupM3U8).toBe(sitePlaylist);

			const nextCycle = 1_010_000;
			nowSpy.mockReturnValue(nextCycle);
			info.IsShowingAd = true;
			info.ActiveBackupPlayerType = "autoplay";
			info.LastCleanBackupPlayerType = "autoplay";
			info.LastCleanBackupM3U8 = bridgePlaylist;
			info.LastCleanBackupAt = nextCycle;
			activateExactAdCycle(info, nextCycle);
			const nextBreak = await findBackupStream()(
				info,
				sweep.realFetch,
				0,
				currentResolution,
			);
			expect(nextBreak).toEqual({
				type: "autoplay",
				m3u8: bridgePlaylist,
			});
			expect(sweep.tokenCalls.slice(2)).toEqual([
				{ playerType: "site", omitViewerHeaders: false },
				{ playerType: "site", omitViewerHeaders: true },
			]);
		} finally {
			nowSpy.mockRestore();
			sweep.restore();
		}
	});

	it("keeps the neutral master when a concurrent authenticated search finishes later", async () => {
		const searchBackupStream = T<
			(
				info: Record<string, unknown>,
				realFetch: (url: string) => Promise<Response>,
				startIdx?: number,
				currentResolution?: Record<string, unknown>,
			) => Promise<{ type: string | null; m3u8: string | null }>
		>("_searchBackupStream");
		const state = getState();
		const previous = {
			types: state.BackupPlayerTypes,
			disable: state.DisableAutoplayBackup,
			authorization: state.AuthorizationHeader,
			integrity: state.ClientIntegrityHeader,
			getToken: g._getToken,
			extract: g._extractPlaybackAccessToken,
		};
		let resolveNeutralToken = () => {};
		let reportNeutralTokenStarted = () => {};
		let resolveAuthenticatedMaster = () => {};
		let reportAuthenticatedMasterStarted = () => {};
		let reportGuestMediaStarted = () => {};
		const neutralTokenGate = new Promise<void>((resolve) => {
			resolveNeutralToken = resolve;
		});
		const neutralTokenStarted = new Promise<void>((resolve) => {
			reportNeutralTokenStarted = resolve;
		});
		const authenticatedMasterGate = new Promise<void>((resolve) => {
			resolveAuthenticatedMaster = resolve;
		});
		const authenticatedMasterStarted = new Promise<void>((resolve) => {
			reportAuthenticatedMasterStarted = resolve;
		});
		const guestMediaStarted = new Promise<void>((resolve) => {
			reportGuestMediaStarted = resolve;
		});
		let authenticatedTokenCount = 0;
		const tokenCalls: Array<{ profile: string; omitViewerHeaders: boolean }> =
			[];
		state.BackupPlayerTypes = ["site", "autoplay"];
		state.DisableAutoplayBackup = false;
		state.AuthorizationHeader = "OAuth viewer";
		state.ClientIntegrityHeader = "integrity";
		g._extractPlaybackAccessToken = (token: Record<string, string>) => ({
			signature: token.signature,
			value: token.value,
		});
		g._getToken = async (
			_info: unknown,
			_playerType: unknown,
			_realFetch: unknown,
			omitViewerHeaders = false,
		) => {
			if (omitViewerHeaders) {
				tokenCalls.push({
					profile: "guest",
					omitViewerHeaders: true,
				});
				reportNeutralTokenStarted();
				await neutralTokenGate;
				return new Response(
					JSON.stringify({ signature: "guest", value: "guest-token" }),
					{ status: 200 },
				);
			}
			authenticatedTokenCount++;
			const profile = `viewer-${authenticatedTokenCount}`;
			tokenCalls.push({ profile, omitViewerHeaders: false });
			return new Response(
				JSON.stringify({ signature: profile, value: `${profile}-token` }),
				{ status: 200 },
			);
		};
		const viewerMaster = masterPlaylist("site").replace(
			"/site/index.m3u8",
			"/site/index.m3u8?profile=viewer",
		);
		const guestMaster = masterPlaylist("site").replace(
			"/site/index.m3u8",
			"/site/index.m3u8?profile=guest",
		);
		const realFetch = async (url: string) => {
			const href = String(url);
			if (href.includes("usher.ttvnw.net")) {
				if (href.includes("sig=guest")) {
					return new Response(guestMaster, { status: 200 });
				}
				if (href.includes("sig=viewer-2")) {
					reportAuthenticatedMasterStarted();
					await authenticatedMasterGate;
				}
				return new Response(viewerMaster, { status: 200 });
			}
			if (href.includes("profile=guest")) {
				reportGuestMediaStarted();
				return new Response(sitePlaylist, { status: 200 });
			}
			if (href.includes("profile=viewer")) {
				return new Response(emptyPlaylist, { status: 200 });
			}
			if (href.includes("/autoplay/")) {
				return new Response(bridgePlaylist, { status: 200 });
			}
			return new Response(null, { status: 404 });
		};
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);

		try {
			const info = makeHoldInfo();
			const firstSearch = searchBackupStream(
				info,
				realFetch,
				0,
				currentResolution,
			);
			await neutralTokenStarted;
			(info.FailedBackupPlayerTypes as Map<string, number>).clear();
			const secondSearch = searchBackupStream(
				info,
				realFetch,
				0,
				currentResolution,
			);
			await authenticatedMasterStarted;
			resolveNeutralToken();
			await guestMediaStarted;
			resolveAuthenticatedMaster();
			const results = await Promise.all([firstSearch, secondSearch]);

			expect(results).toEqual([
				{ type: "autoplay", m3u8: bridgePlaylist },
				{ type: "autoplay", m3u8: bridgePlaylist },
			]);
			expect(tokenCalls).toEqual([
				{ profile: "viewer-1", omitViewerHeaders: false },
				{ profile: "guest", omitViewerHeaders: true },
				{ profile: "viewer-2", omitViewerHeaders: false },
			]);
			const cachedSite = (
				info.BackupEncodingsM3U8Cache as Record<string, Record<string, unknown>>
			).site;
			expect(cachedSite).toMatchObject({
				m3u8: guestMaster,
				viewerHeadersOmitted: true,
				cycleStartedAt: 991_000,
			});
		} finally {
			resolveNeutralToken();
			resolveAuthenticatedMaster();
			nowSpy.mockRestore();
			state.BackupPlayerTypes = previous.types;
			state.DisableAutoplayBackup = previous.disable;
			state.AuthorizationHeader = previous.authorization;
			state.ClientIntegrityHeader = previous.integrity;
			if (previous.getToken === undefined) delete g._getToken;
			else g._getToken = previous.getToken;
			if (previous.extract === undefined) delete g._extractPlaybackAccessToken;
			else g._extractPlaybackAccessToken = previous.extract;
		}
	});

	it("never promotes an ad-marked neutral candidate", async () => {
		const sweep = setupSessionNeutralSweep(
			() => emptyPlaylist,
			() => adPlaylist,
		);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			const result = await findBackupStream()(
				info,
				sweep.realFetch,
				0,
				currentResolution,
			);
			expect(result).toEqual({ type: "autoplay", m3u8: bridgePlaylist });
			expect(String(result.m3u8)).not.toContain("stitched-ad");
			expect(sweep.tokenCalls).toEqual([
				{ playerType: "site", omitViewerHeaders: false },
				{ playerType: "site", omitViewerHeaders: true },
			]);
			expect(info.LastCleanBackupPlayerType).toBe("autoplay");
			expect(info.LastCleanBackupM3U8).toBe(bridgePlaylist);
		} finally {
			nowSpy.mockRestore();
			sweep.restore();
		}
	});

	it("keeps a first clean neutral candidate probationed when autoplay cannot refresh", async () => {
		const sweep = setupSessionNeutralSweep(
			() => emptyPlaylist,
			() => sitePlaylist,
		);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			const unavailableBridgeFetch = async (url: string) => {
				if (String(url).includes("/autoplay/")) {
					return new Response(adPlaylist, { status: 200 });
				}
				return sweep.realFetch(url);
			};
			const first = await findBackupStream()(
				info,
				unavailableBridgeFetch,
				0,
				currentResolution,
			);

			expect(first).toEqual({ type: null, m3u8: null });
			expect(info.LastCleanBackupPlayerType).toBe("autoplay");
			expect(info.LastCleanBackupM3U8).toBe(bridgePlaylist);
			expect(info._BackupProbation).toEqual({
				type: "site",
				at: 1_000_000,
				cleanChecks: 1,
			});
			expect(sweep.tokenCalls).toEqual([
				{ playerType: "site", omitViewerHeaders: false },
				{ playerType: "site", omitViewerHeaders: true },
				{ playerType: "autoplay", omitViewerHeaders: false },
			]);

			nowSpy.mockReturnValue(1_002_100);
			const second = await findBackupStream()(
				info,
				sweep.realFetch,
				0,
				currentResolution,
			);
			expect(second).toEqual({ type: "site", m3u8: sitePlaylist });
			expect(
				sweep.tokenCalls.filter((call) => call.omitViewerHeaders),
			).toHaveLength(1);
		} finally {
			nowSpy.mockRestore();
			sweep.restore();
		}
	});

	it("never uses the neutral retry for VOD or autoplay token requests", async () => {
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			for (const scenario of ["vod", "autoplay"] as const) {
				const sweep = setupSessionNeutralSweep(
					() => emptyPlaylist,
					() => sitePlaylist,
				);
				try {
					const info = makeHoldInfo();
					if (scenario === "vod") {
						info.MediaType = "vod";
						info.MediaKey = "vod:123456";
						info.VodID = "123456";
						activateExactAdCycle(info, 991_000);
					} else {
						getState().BackupPlayerTypes = ["autoplay"];
						info.BackupEncodingsM3U8Cache = Object.create(null);
					}
					await findBackupStream()(info, sweep.realFetch, 0, currentResolution);
					expect(sweep.tokenCalls.some((call) => call.omitViewerHeaders)).toBe(
						false,
					);
				} finally {
					sweep.restore();
				}
			}
		} finally {
			nowSpy.mockRestore();
		}
	});

	it("does not add a neutral request without a held autoplay bridge", async () => {
		const sweep = setupSessionNeutralSweep(
			() => emptyPlaylist,
			() => sitePlaylist,
		);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			info.ActiveBackupPlayerType = null;
			info.LastCleanBackupPlayerType = null;
			info.LastCleanBackupM3U8 = null;
			info.LastCleanBackupAt = 0;
			await findBackupStream()(info, sweep.realFetch, 0, currentResolution);
			expect(sweep.tokenCalls.some((call) => call.omitViewerHeaders)).toBe(
				false,
			);
		} finally {
			nowSpy.mockRestore();
			sweep.restore();
		}
	});

	it("does not repeat the neutral request when no viewer headers were captured", async () => {
		const sweep = setupSessionNeutralSweep(
			() => emptyPlaylist,
			() => sitePlaylist,
		);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			getState().AuthorizationHeader = null;
			getState().ClientIntegrityHeader = null;
			await findBackupStream()(
				makeHoldInfo(),
				sweep.realFetch,
				0,
				currentResolution,
			);
			expect(sweep.tokenCalls.some((call) => call.omitViewerHeaders)).toBe(
				false,
			);
		} finally {
			nowSpy.mockRestore();
			sweep.restore();
		}
	});

	it("allows only the first empty source to spend the neutral cycle budget", async () => {
		const sweep = setupSessionNeutralSweep(
			() => emptyPlaylist,
			() => emptyPlaylist,
		);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			getState().BackupPlayerTypes = ["site", "embed", "autoplay"];
			const result = await findBackupStream()(
				makeHoldInfo(),
				sweep.realFetch,
				0,
				currentResolution,
			);
			expect(result).toEqual({ type: "autoplay", m3u8: bridgePlaylist });
			expect(sweep.tokenCalls).toEqual([
				{ playerType: "site", omitViewerHeaders: false },
				{ playerType: "site", omitViewerHeaders: true },
				{ playerType: "embed", omitViewerHeaders: false },
			]);
		} finally {
			nowSpy.mockRestore();
			sweep.restore();
		}
	});

	it("does not use the neutral retry when the authenticated source is playable or ad-marked", async () => {
		const cases = [sitePlaylist, adPlaylist];
		for (const authenticatedPlaylist of cases) {
			const sweep = setupSessionNeutralSweep(
				() => authenticatedPlaylist,
				() => sitePlaylist,
			);
			const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
			try {
				const result = await findBackupStream()(
					makeHoldInfo(),
					sweep.realFetch,
					0,
					currentResolution,
				);
				expect(sweep.tokenCalls).toEqual([
					{ playerType: "site", omitViewerHeaders: false },
				]);
				expect(String(result.m3u8)).not.toContain("stitched-ad");
			} finally {
				nowSpy.mockRestore();
				sweep.restore();
			}
		}
	});

	it("spends at most one neutral retry per cycle and allows one for a new break", async () => {
		const sweep = setupSessionNeutralSweep(
			() => emptyPlaylist,
			() => emptyPlaylist,
		);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			await findBackupStream()(info, sweep.realFetch, 0, currentResolution);
			expect(
				sweep.tokenCalls.filter((call) => call.omitViewerHeaders),
			).toHaveLength(1);

			nowSpy.mockReturnValue(1_002_100);
			await findBackupStream()(info, sweep.realFetch, 0, currentResolution);
			expect(
				sweep.tokenCalls.filter((call) => call.omitViewerHeaders),
			).toHaveLength(1);

			const nextCycle = 1_010_000;
			nowSpy.mockReturnValue(nextCycle);
			info.IsShowingAd = true;
			info.ActiveBackupPlayerType = "autoplay";
			info.LastCleanBackupPlayerType = "autoplay";
			info.LastCleanBackupM3U8 = bridgePlaylist;
			info.LastCleanBackupAt = nextCycle;
			activateExactAdCycle(info, nextCycle);
			await findBackupStream()(info, sweep.realFetch, 0, currentResolution);
			expect(
				sweep.tokenCalls.filter((call) => call.omitViewerHeaders),
			).toHaveLength(2);
		} finally {
			nowSpy.mockRestore();
			sweep.restore();
		}
	});

	it("consumes the cycle budget before an invalidated neutral request can finish", async () => {
		let info: Record<string, unknown>;
		const sweep = setupSessionNeutralSweep(
			() => emptyPlaylist,
			() => sitePlaylist,
			(omitViewerHeaders) => {
				if (omitViewerHeaders) {
					info.BackupSearchEpoch = Number(info.BackupSearchEpoch) + 1;
				}
			},
		);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			info = makeHoldInfo();
			const result = await findBackupStream()(
				info,
				sweep.realFetch,
				0,
				currentResolution,
			);
			expect(result).toEqual({ type: "autoplay", m3u8: bridgePlaylist });
			expect(info.LastSessionNeutralBackupProbeCycleStartedAt).toBe(991_000);
			expect(
				sweep.tokenCalls.filter((call) => call.omitViewerHeaders),
			).toHaveLength(1);
		} finally {
			nowSpy.mockRestore();
			sweep.restore();
		}
	});

	it("defers a fresh HQ session to a second clean look, then keeps the pin instead of flapping back to the bridge", async () => {
		const { tokenCalls, realFetch, restore } = setupSweep(() => sitePlaylist);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			const first = await findBackupStream()(
				info,
				realFetch,
				0,
				currentResolution,
			);
			expect(first.type).toBe("autoplay");
			expect(first.m3u8).toBe(bridgePlaylist);
			expect(tokenCalls).toEqual(["site"]);
			expect(info._BackupProbation).toEqual({
				type: "site",
				at: 1_000_000,
				cleanChecks: 1,
			});

			nowSpy.mockReturnValue(1_001_600);
			const second = await findBackupStream()(
				info,
				realFetch,
				0,
				currentResolution,
			);
			expect(second.type).toBe("site");
			expect(second.m3u8).toBe(sitePlaylist);
			expect(tokenCalls).toEqual(["site"]);
			expect(info._BackupProbation).toEqual({
				type: "site",
				at: 0,
				cleanChecks: 1,
			});

			nowSpy.mockReturnValue(1_018_000);
			const later = await findBackupStream()(
				info,
				realFetch,
				0,
				currentResolution,
			);
			expect(later.type).toBe("site");
			expect(later.m3u8).toBe(sitePlaylist);
			expect(tokenCalls).toEqual(["site"]);
		} finally {
			nowSpy.mockRestore();
			restore();
		}
	});

	it("never serves a probationed session that turns ad-marked on the second look", async () => {
		let siteMedia = sitePlaylist;
		const { tokenCalls, realFetch, restore } = setupSweep(() => siteMedia);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			const first = await findBackupStream()(
				info,
				realFetch,
				0,
				currentResolution,
			);
			expect(first.type).toBe("autoplay");

			siteMedia = adPlaylist;
			nowSpy.mockReturnValue(1_001_600);
			const second = await findBackupStream()(
				info,
				realFetch,
				0,
				currentResolution,
			);
			expect(second.type).toBe("autoplay");
			expect(second.m3u8).toBe(bridgePlaylist);
			expect(String(second.m3u8)).not.toContain("stitched-ad");
			expect(tokenCalls).toEqual(["site", "site"]);
			expect(info._BackupProbation).toBe(null);
		} finally {
			nowSpy.mockRestore();
			restore();
		}
	});

	it("pins a fresh HQ session immediately when no clean autoplay bridge exists", async () => {
		const { tokenCalls, realFetch, restore } = setupSweep(() => sitePlaylist);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			info.BackupEncodingsM3U8Cache = Object.create(null);
			const result = await findBackupStream()(
				info,
				realFetch,
				0,
				currentResolution,
			);
			expect(result.type).toBe("site");
			expect(result.m3u8).toBe(sitePlaylist);
			expect(tokenCalls).toEqual(["site"]);
			expect(info._BackupProbation).toEqual({
				type: "site",
				at: 0,
				cleanChecks: 1,
			});
		} finally {
			nowSpy.mockRestore();
			restore();
		}
	});

	it("still probes HQ when 360p was only observed at cold startup", async () => {
		const { tokenCalls, realFetch, restore } = setupSweep(() => sitePlaylist);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			const result = await findBackupStream()(info, realFetch, 0, {
				Name: "360p",
				Resolution: "640x360",
				FrameRate: 30,
			});
			expect(result.type).toBe("autoplay");
			expect(result.m3u8).toBe(bridgePlaylist);
			expect(tokenCalls).toEqual(["site"]);
			expect(info._BackupProbation).toMatchObject({ type: "site" });
		} finally {
			nowSpy.mockRestore();
			restore();
		}
	});

	it("skips HQ probing when 360p was established before the ad", async () => {
		const { tokenCalls, realFetch, restore } = setupSweep(() => sitePlaylist);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			info.SustainedNativeResolutionStartedAt = 970_000;
			const result = await findBackupStream()(info, realFetch, 0, {
				Name: "360p",
				Resolution: "640x360",
				FrameRate: 30,
			});

			expect(result.type).toBe("autoplay");
			expect(result.m3u8).toBe(bridgePlaylist);
			expect(tokenCalls).toEqual([]);
			expect(info._BackupProbation).toBe(null);
		} finally {
			nowSpy.mockRestore();
			restore();
		}
	});

	it("retries normal quality after foreground return and completes its clean probation", async () => {
		const state = getState();
		const previous = {
			pageMediaKey: state.PageMediaKey,
			visibleSinceAt: state.PagePlaybackVisibleSinceAt,
			preferredQualityGroup: state.PreferredQualityGroup,
		};
		const { tokenCalls, realFetch, restore } = setupSweep(() => sitePlaylist);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			Object.assign(state, {
				PageMediaKey: "live:testchannel",
				PagePlaybackVisibleSinceAt: 999_500,
				PreferredQualityGroup: null,
			});
			const info = makeHoldInfo();
			info.SustainedNativeResolutionStartedAt = 970_000;
			const target360 = {
				Name: "360p",
				Resolution: "640x360",
				FrameRate: 30,
			};
			const first = await findBackupStream()(info, realFetch, 0, target360);
			expect(first).toEqual({ type: "autoplay", m3u8: bridgePlaylist });
			expect(tokenCalls).toEqual(["site"]);
			expect(info._ForegroundQualityProbeAppliedAt).toBe(999_500);
			expect(info._BackupProbation).toMatchObject({ type: "site" });

			nowSpy.mockReturnValue(1_001_600);
			const second = await findBackupStream()(info, realFetch, 0, target360);
			expect(second).toEqual({ type: "site", m3u8: sitePlaylist });
			expect(tokenCalls).toEqual(["site"]);
		} finally {
			state.PageMediaKey = previous.pageMediaKey;
			state.PagePlaybackVisibleSinceAt = previous.visibleSinceAt;
			state.PreferredQualityGroup = previous.preferredQualityGroup;
			nowSpy.mockRestore();
			restore();
		}
	});

	it("keeps the clean bridge when the foreground normal-quality candidate is ad-marked", async () => {
		const state = getState();
		const previous = {
			pageMediaKey: state.PageMediaKey,
			visibleSinceAt: state.PagePlaybackVisibleSinceAt,
			preferredQualityGroup: state.PreferredQualityGroup,
		};
		const { tokenCalls, realFetch, restore } = setupSweep(() => adPlaylist);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			Object.assign(state, {
				PageMediaKey: "live:testchannel",
				PagePlaybackVisibleSinceAt: 999_500,
				PreferredQualityGroup: null,
			});
			const info = makeHoldInfo();
			info.SustainedNativeResolutionStartedAt = 970_000;
			const result = await findBackupStream()(info, realFetch, 0, {
				Name: "360p",
				Resolution: "640x360",
				FrameRate: 30,
			});
			expect(result).toEqual({ type: "autoplay", m3u8: bridgePlaylist });
			expect(String(result.m3u8)).not.toContain("stitched-ad");
			expect(tokenCalls).toEqual(["site"]);
			expect(info._BackupProbation).toBe(null);
		} finally {
			state.PageMediaKey = previous.pageMediaKey;
			state.PagePlaybackVisibleSinceAt = previous.visibleSinceAt;
			state.PreferredQualityGroup = previous.preferredQualityGroup;
			nowSpy.mockRestore();
			restore();
		}
	});

	it("caps backup rotation on the stable bridge after repeated ad-marked flips", async () => {
		const { tokenCalls, realFetch, restore } = setupSweep(() => sitePlaylist);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			info._BackupPinFlipCount = 2;
			const result = await findBackupStream()(
				info,
				realFetch,
				0,
				currentResolution,
			);
			expect(result.type).toBe("autoplay");
			expect(result.m3u8).toBe(bridgePlaylist);
			expect(tokenCalls).toEqual([]);
		} finally {
			nowSpy.mockRestore();
			restore();
		}
	});

	it("resumes rotation past the flip cap when the bridge itself is cooling down", async () => {
		const { tokenCalls, realFetch, restore } = setupSweep(() => sitePlaylist);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			info._BackupPinFlipCount = 2;
			T<(info: Record<string, unknown>, pt: string, reason: string) => void>(
				"_markBackupPlayerRetryCooldown",
			)(info, "autoplay", "stalled");
			await findBackupStream()(info, realFetch, 0, currentResolution);
			expect(tokenCalls).toContain("site");
		} finally {
			nowSpy.mockRestore();
			restore();
		}
	});

	it("requires an extra clean look before pinning once a backup has flipped this break", async () => {
		const { tokenCalls, realFetch, restore } = setupSweep(() => sitePlaylist);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			info._BackupPinFlipCount = 1;
			const first = await findBackupStream()(
				info,
				realFetch,
				0,
				currentResolution,
			);
			expect(first.type).toBe("autoplay");
			expect(info._LastBackupSearchCompletedAt).toBe(0);
			expect(info._BackupProbation).toEqual({
				type: "site",
				at: 1_000_000,
				cleanChecks: 1,
			});

			nowSpy.mockReturnValue(1_001_600);
			const second = await findBackupStream()(
				info,
				realFetch,
				0,
				currentResolution,
			);
			expect(second.type).toBe("autoplay");
			expect(second.m3u8).toBe(bridgePlaylist);
			expect(info._BackupProbation).toEqual({
				type: "site",
				at: 1_000_000,
				cleanChecks: 2,
			});

			nowSpy.mockReturnValue(1_003_200);
			const third = await findBackupStream()(
				info,
				realFetch,
				0,
				currentResolution,
			);
			expect(third.type).toBe("site");
			expect(third.m3u8).toBe(sitePlaylist);
			expect(tokenCalls).toEqual(["site"]);
			expect(info._BackupProbation).toEqual({
				type: "site",
				at: 0,
				cleanChecks: 2,
			});
		} finally {
			nowSpy.mockRestore();
			restore();
		}
	});

	it("counts a pinned backup turning ad-marked as one flip", async () => {
		const { realFetch, restore } = setupSweep(() => adPlaylist);
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeHoldInfo();
			info.ActiveBackupPlayerType = "site";
			info.LastCleanBackupPlayerType = "site";
			info.BackupEncodingsM3U8Cache = {
				site: masterPlaylist("site"),
				autoplay: masterPlaylist("autoplay"),
			};
			const result = await findBackupStream()(
				info,
				realFetch,
				0,
				currentResolution,
			);
			expect(result.type).toBe("autoplay");
			expect(String(result.m3u8)).not.toContain("stitched-ad");
			expect(info._BackupPinFlipCount).toBe(1);
		} finally {
			nowSpy.mockRestore();
			restore();
		}
	});
});

describe("_getPendingForegroundQualityProbeAt", () => {
	const pending = () =>
		T<(info: Record<string, unknown>) => number>(
			"_getPendingForegroundQualityProbeAt",
		);

	it("requires the exact current autoplay cycle and consumes each visible edge once", () => {
		const state = getState();
		const saved = {
			pageMediaKey: state.PageMediaKey,
			currentAdMediaKey: state.CurrentAdMediaKey,
			visibleSinceAt: state.PagePlaybackVisibleSinceAt,
			preferredQualityGroup: state.PreferredQualityGroup,
		};
		const visibleSinceAt = 1_000_000;
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: 990_000,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupM3U8: "#EXTM3U\n#EXTINF:2,\nbridge.ts",
			LastCleanBackupAt: 999_000,
			BackupEncodingsM3U8Cache: {
				autoplay: [
					"#EXTM3U",
					"#EXT-X-STREAM-INF:RESOLUTION=640x360",
					"https://cdn.example/360.m3u8",
				].join("\n"),
			},
		});
		Object.assign(state, {
			PageMediaKey: "live:testchannel",
			CurrentAdMediaKey: "live:testchannel",
			PagePlaybackVisibleSinceAt: visibleSinceAt,
			PreferredQualityGroup: null,
		});

		try {
			expect(pending()(info)).toBe(visibleSinceAt);
			state.PageMediaKey = "live:other";
			expect(pending()(info)).toBe(0);
			state.PageMediaKey = "live:testchannel";
			info._ForegroundQualityProbeAppliedAt = visibleSinceAt;
			expect(pending()(info)).toBe(0);
			info._BackupProbation = { type: "site", at: visibleSinceAt };
			expect(pending()(info)).toBe(visibleSinceAt);
			info._BackupProbation = null;
			info._ForegroundQualityProbeAppliedAt = 0;
			state.PreferredQualityGroup = "360p";
			expect(pending()(info)).toBe(0);
			state.PreferredQualityGroup = null;
			info.VisibleAdStartedAt = visibleSinceAt;
			expect(pending()(info)).toBe(0);
		} finally {
			state.PageMediaKey = saved.pageMediaKey;
			state.CurrentAdMediaKey = saved.currentAdMediaKey;
			state.PagePlaybackVisibleSinceAt = saved.visibleSinceAt;
			state.PreferredQualityGroup = saved.preferredQualityGroup;
		}
	});
});

describe("_startForegroundQualityProbe", () => {
	const start = () =>
		T<
			(
				info: Record<string, unknown>,
				realFetch: unknown,
				currentResolution?: unknown,
				codecOverride?: string | null,
			) => boolean
		>("_startForegroundQualityProbe");

	it("starts one sequential search for the exact foreground edge", async () => {
		const state = getState();
		const saved = {
			pageMediaKey: state.PageMediaKey,
			currentAdMediaKey: state.CurrentAdMediaKey,
			visibleSinceAt: state.PagePlaybackVisibleSinceAt,
			preferredQualityGroup: state.PreferredQualityGroup,
		};
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: 990000,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupM3U8: "#EXTM3U\n#EXTINF:2,\nbridge.ts",
			LastCleanBackupAt: 999000,
			BackupEncodingsM3U8Cache: {
				autoplay: [
					"#EXTM3U",
					"#EXT-X-STREAM-INF:RESOLUTION=640x360",
					"https://cdn.example/360.m3u8",
				].join("\n"),
			},
		});
		Object.assign(state, {
			PageMediaKey: "live:testchannel",
			CurrentAdMediaKey: "live:testchannel",
			PagePlaybackVisibleSinceAt: 999500,
			PreferredQualityGroup: null,
		});
		const search = vi.fn(async () => ({
			type: "site",
			m3u8: "#EXTM3U\n#EXTINF:2,\nsource.ts",
		}));
		g._findBackupStream = search;

		try {
			expect(start()(info, () => Promise.resolve(), { Name: "360p" })).toBe(
				true,
			);
			await Promise.resolve();
			expect(search).toHaveBeenCalledOnce();

			info._BackupSearchPromise = Promise.resolve(null);
			expect(start()(info, () => Promise.resolve())).toBe(false);
			expect(search).toHaveBeenCalledOnce();
		} finally {
			state.PageMediaKey = saved.pageMediaKey;
			state.CurrentAdMediaKey = saved.currentAdMediaKey;
			state.PagePlaybackVisibleSinceAt = saved.visibleSinceAt;
			state.PreferredQualityGroup = saved.preferredQualityGroup;
		}
	});
});

describe("_shouldHoldBridgeInsteadOfRotating", () => {
	const guard = () =>
		T<
			(
				info: Record<string, unknown>,
				targetRes: Record<string, unknown> | null,
			) => boolean
		>("_shouldHoldBridgeInsteadOfRotating");
	const autoplayMaster360 = [
		"#EXTM3U",
		'#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=284x160,VIDEO="160p"',
		"https://cdn.example/autoplay/160.m3u8",
		'#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360,VIDEO="360p"',
		"https://cdn.example/autoplay/360.m3u8",
	].join("\n");

	function makeBridgeInfo(overrides: Record<string, unknown> = {}) {
		return makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: 991_000,
			SustainedNativeResolutionStartedAt: 970_000,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupM3U8: "#EXTM3U",
			LastCleanBackupAt: 999_000,
			BackupEncodingsM3U8Cache: { autoplay: autoplayMaster360 },
			...overrides,
		});
	}

	it("holds when the target height does not beat the bridge ceiling", () => {
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeBridgeInfo();
			expect(guard()(info, { Resolution: "640x360" })).toBe(true);
		} finally {
			nowSpy.mockRestore();
		}
	});

	it("reopens Auto quality probing after foreground return without bypassing the flip cap", () => {
		const state = getState();
		const saved = {
			pageMediaKey: state.PageMediaKey,
			currentAdMediaKey: state.CurrentAdMediaKey,
			visibleSinceAt: state.PagePlaybackVisibleSinceAt,
			preferredQualityGroup: state.PreferredQualityGroup,
		};
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		Object.assign(state, {
			PageMediaKey: "live:testchannel",
			CurrentAdMediaKey: "live:testchannel",
			PagePlaybackVisibleSinceAt: 999_500,
			PreferredQualityGroup: null,
		});
		try {
			const info = makeBridgeInfo();
			expect(guard()(info, { Resolution: "640x360" })).toBe(false);
			info._BackupPinFlipCount = 2;
			expect(guard()(info, { Resolution: "640x360" })).toBe(true);
		} finally {
			Object.assign(state, {
				PageMediaKey: saved.pageMediaKey,
				CurrentAdMediaKey: saved.currentAdMediaKey,
				PagePlaybackVisibleSinceAt: saved.visibleSinceAt,
				PreferredQualityGroup: saved.preferredQualityGroup,
			});
			nowSpy.mockRestore();
		}
	});

	it("does not trust a startup quality sample recorded just before the ad", () => {
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeBridgeInfo({
				SustainedNativeResolutionStartedAt: 990_999,
			});
			expect(guard()(info, { Resolution: "640x360" })).toBe(false);
		} finally {
			nowSpy.mockRestore();
		}
	});

	it("honors an explicit 360p preference without waiting for a baseline", () => {
		const state = getState();
		const previousQuality = state.PreferredQualityGroup;
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		state.PreferredQualityGroup = "360p";
		try {
			const info = makeBridgeInfo({ SustainedNativeResolutionStartedAt: 0 });
			expect(guard()(info, { Resolution: "640x360" })).toBe(true);
		} finally {
			state.PreferredQualityGroup = previousQuality;
			nowSpy.mockRestore();
		}
	});

	it("rotates when the target height beats the bridge ceiling", () => {
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeBridgeInfo();
			expect(guard()(info, { Resolution: "1280x720" })).toBe(false);
		} finally {
			nowSpy.mockRestore();
		}
	});

	it("never suppresses the normal-quality search for a preview emergency source", () => {
		const state = getState();
		const previousDisable = state.DisableAutoplayBackup;
		const previousPreview = state.AllowPreviewEmergencyAutoplayBackup;
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		state.DisableAutoplayBackup = true;
		state.AllowPreviewEmergencyAutoplayBackup = true;
		try {
			const info = makeBridgeInfo({ _BackupPinFlipCount: 2 });
			expect(guard()(info, { Resolution: "640x360" })).toBe(false);
		} finally {
			state.DisableAutoplayBackup = previousDisable;
			state.AllowPreviewEmergencyAutoplayBackup = previousPreview;
			nowSpy.mockRestore();
		}
	});

	it("rotates when the target resolution is unknown", () => {
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeBridgeInfo();
			expect(guard()(info, { Name: "720p60" })).toBe(false);
			expect(guard()(info, null)).toBe(false);
		} finally {
			nowSpy.mockRestore();
		}
	});

	it("rotates when the bridge master has no parseable variants", () => {
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeBridgeInfo({
				BackupEncodingsM3U8Cache: { autoplay: "#EXTM3U" },
			});
			expect(guard()(info, { Resolution: "640x360" })).toBe(false);
		} finally {
			nowSpy.mockRestore();
		}
	});

	it("holds regardless of target quality once the flip cap is reached", () => {
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeBridgeInfo({ _BackupPinFlipCount: 2 });
			expect(guard()(info, { Resolution: "1920x1080" })).toBe(true);
		} finally {
			nowSpy.mockRestore();
		}
	});

	it("stays inert when the bridge is not actively serving", () => {
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		try {
			const info = makeBridgeInfo({ ActiveBackupPlayerType: "site" });
			expect(guard()(info, { Resolution: "640x360" })).toBe(false);
		} finally {
			nowSpy.mockRestore();
		}
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
		expect(r.reason).toBe("ad-marked");
	});

	it("denies when simulated ads depth not satisfied", () => {
		const r = fn()({
			candidateHasAds: false,
			candidateIsPlayable: true,
			simulatedAdsDepthSatisfied: false,
		});
		expect(r.allowSelectedPromotion).toBe(false);
		expect(r.reason).toBe("simulated-ads-depth");
	});

	it("allows promotion for clean playable candidates", () => {
		const r = fn()({
			candidateHasAds: false,
			candidateIsPlayable: true,
			simulatedAdsDepthSatisfied: true,
		});
		expect(r.allowSelectedPromotion).toBe(true);
		expect(r.reason).toBe("clean-playable");
	});
});

describe("_getOrderedBackupPlayerTypes (LQ fallback contract)", () => {
	const fn = () =>
		T<(info: Record<string, unknown>, startIdx?: number) => string[]>(
			"_getOrderedBackupPlayerTypes",
		);

	it("excludes autoplay when LQ fallback is disabled", () => {
		getState().DisableAutoplayBackup = true;
		const result = fn()(makeInfo());
		expect(result).not.toContain("autoplay");
	});

	it("includes autoplay when LQ fallback is enabled", () => {
		getState().DisableAutoplayBackup = false;
		const result = fn()(makeInfo());
		expect(result).toContain("autoplay");
	});

	it("keeps autoplay last as an emergency source for an exact Previews player", () => {
		getState().DisableAutoplayBackup = true;
		getState().AllowPreviewEmergencyAutoplayBackup = true;
		const result = fn()(makeInfo());
		expect(result).toEqual(["embed", "popout", "autoplay"]);
	});

	it("tries autoplay first on a cold active ad cycle when LQ fallback is enabled", () => {
		getState().DisableAutoplayBackup = false;
		const result = fn()(
			makeInfo({
				IsShowingAd: true,
				VisibleAdStartedAt: Date.now() - 500,
			}),
		);
		expect(result[0]).toBe("autoplay");
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

	it("releases autoplay to source probes after the LQ dwell even inside the post-reload minimal request window", () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousPinnedType = state.PinnedBackupPlayerType;
		const previousPinnedChannel = state.PinnedBackupPlayerChannel;
		const previousPinnedMediaKey = state.PinnedBackupPlayerMediaKey;
		state.BackupPlayerTypes = ["site", "embed", "popout", "autoplay"];
		state.DisableAutoplayBackup = false;
		state.PinnedBackupPlayerType = "autoplay";
		state.PinnedBackupPlayerChannel = "testchannel";
		state.PinnedBackupPlayerMediaKey = "live:testchannel";

		try {
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
				state.BackupPlayerTypes.indexOf("autoplay"),
			);
			expect(result.slice(0, 3)).toEqual(["site", "embed", "popout"]);
			expect(result).toContain("autoplay");
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
			state.PinnedBackupPlayerType = previousPinnedType;
			state.PinnedBackupPlayerChannel = previousPinnedChannel;
			state.PinnedBackupPlayerMediaKey = previousPinnedMediaKey;
		}
	});

	afterAll(() => {
		getState().DisableAutoplayBackup = true;
	});
});

describe("_shouldTryAutoplayFirst (LQ fallback)", () => {
	const fn = () =>
		T<(info: Record<string, unknown>) => boolean>("_shouldTryAutoplayFirst");

	it("does not prioritize autoplay outside an active ad cycle", () => {
		getState().DisableAutoplayBackup = false;
		expect(fn()(makeInfo())).toBe(false);
		getState().DisableAutoplayBackup = true;
	});

	it("prioritizes autoplay on a cold active ad cycle", () => {
		getState().DisableAutoplayBackup = false;
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 500,
		});
		expect(fn()(info)).toBe(true);
		getState().DisableAutoplayBackup = true;
	});

	it("does not prioritize autoplay when it is cooling down", () => {
		getState().DisableAutoplayBackup = false;
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 500,
			FailedBackupPlayerTypes: new Map([["autoplay", Date.now() + 30000]]),
		});
		expect(fn()(info)).toBe(false);
		getState().DisableAutoplayBackup = true;
	});

	it("does not prioritize the preview emergency source", () => {
		getState().DisableAutoplayBackup = true;
		getState().AllowPreviewEmergencyAutoplayBackup = true;
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 500,
		});
		expect(fn()(info)).toBe(false);
	});

	it("does not prioritize autoplay on a new ad cycle (backup stale from a prior cycle)", () => {
		getState().DisableAutoplayBackup = false;
		const info = makeInfo({
			LastCleanBackupM3U8: "#EXTM3U8",
			LastCleanBackupAt: 1000,
			VisibleAdStartedAt: 5000,
		});
		expect(fn()(info)).toBe(false);
		getState().DisableAutoplayBackup = true;
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

	it("does not turn the preview emergency source into a normal LQ dwell", () => {
		getState().DisableAutoplayBackup = true;
		getState().AllowPreviewEmergencyAutoplayBackup = true;
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

describe("_refreshActiveBackupMediaPlaylist (quality target)", () => {
	const refresh = () =>
		T<
			(
				info: Record<string, unknown>,
				realFetch: (url: string, options?: unknown) => Promise<Response>,
			) => Promise<string | null>
		>("_refreshActiveBackupMediaPlaylist");

	const low = { Resolution: "640x360", Name: "360p" };
	const high = { Resolution: "1920x1080", Name: "1080p60" };
	const encodings = {
		embed: {
			m3u8: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080\nhigh.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1300000,RESOLUTION=640x360\nlow.m3u8",
			baseUrl: "https://usher.example/master.m3u8",
		},
	};

	async function withGetStreamUrlStub(
		info: Record<string, unknown>,
		fn: () => Promise<void>,
	) {
		const previousGetStreamUrl = g._getStreamUrl;
		g._getStreamUrl = (
			enc: unknown,
			targetRes: Record<string, unknown>,
			baseUrl: unknown,
		) => {
			info.SelectedRefreshResolution = targetRes?.Resolution || null;
			return previousGetStreamUrl(enc, targetRes, baseUrl);
		};
		try {
			await fn();
		} finally {
			if (previousGetStreamUrl === undefined) delete g._getStreamUrl;
			else g._getStreamUrl = previousGetStreamUrl;
		}
	}

	function backupInfo(overrides: Record<string, unknown> = {}) {
		return makeInfo({
			ActiveBackupPlayerType: "embed",
			LastCleanBackupPlayerType: "embed",
			ActiveBackupResolution: low.Resolution,
			ResolutionList: [high, low],
			BackupEncodingsM3U8Cache: encodings,
			...overrides,
		});
	}

	const fetchClean = async () =>
		new Response("#EXTM3U\n#EXTINF:2.000,live\nseg.ts", { status: 200 });

	it("climbs from a low active backup to sustained native quality when refreshing a long break", async () => {
		const info = backupInfo({ SustainedNativeResolution: high });

		await withGetStreamUrlStub(info, async () => {
			const out = await refresh()(info, fetchClean);

			expect(out).toContain("seg.ts");
			expect(info.SelectedRefreshResolution).toBe(high.Resolution);
			expect(info.ActiveBackupResolution).toBe(high.Resolution);
		});
	});

	it("keeps the active low backup when no sustained or preferred quality is known", async () => {
		const info = backupInfo();

		await withGetStreamUrlStub(info, async () => {
			const out = await refresh()(info, fetchClean);

			expect(out).toContain("seg.ts");
			expect(info.SelectedRefreshResolution).toBe(low.Resolution);
			expect(info.ActiveBackupResolution).toBe(low.Resolution);
		});
	});

	it("records the selected variant instead of the unavailable requested quality", async () => {
		const info = backupInfo({
			SustainedNativeResolution: high,
			BackupEncodingsM3U8Cache: {
				embed: {
					m3u8: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1300000,RESOLUTION=640x360\nlow.m3u8",
					baseUrl: "https://usher.example/master.m3u8",
				},
			},
		});

		await withGetStreamUrlStub(info, async () => {
			const out = await refresh()(info, fetchClean);

			expect(out).toContain("seg.ts");
			expect(info.SelectedRefreshResolution).toBe(high.Resolution);
			expect(info.ActiveBackupResolution).toBe(low.Resolution);
		});
	});

	it("live-refreshes an active autoplay backup without starting a new search", async () => {
		const previousAutoplayRefresh = g._refreshHeldAutoplayBackupPlaylist;
		const refreshed = makePlaylist(400, 3);
		const autoplayRefresh = vi.fn(async () => refreshed);
		g._refreshHeldAutoplayBackupPlaylist = autoplayRefresh;
		const info = makeInfo({
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			ActiveBackupResolution: low.Resolution,
			ResolutionList: [high, low],
		});
		const fetchClean = vi.fn(async () => new Response(refreshed));
		try {
			const out = await refresh()(info, fetchClean);

			expect(out).toBe(refreshed);
			expect(autoplayRefresh).toHaveBeenCalledTimes(1);
			expect(autoplayRefresh).toHaveBeenCalledWith(
				info,
				fetchClean,
				null,
				null,
			);
		} finally {
			g._refreshHeldAutoplayBackupPlaylist = previousAutoplayRefresh;
		}
	});

	it("live-refreshes the exact enhanced codec family instead of serving a stale snapshot", async () => {
		const state = getState();
		const previousQualityGroup = state.PreferredQualityGroup;
		const hevcTarget = {
			Name: "chunked",
			Resolution: "2560x1440",
			FrameRate: 60,
			Codecs: "hev1.1.6.L153.B0",
		};
		const master = [
			"#EXTM3U",
			'#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="hev1.1.6.L153.B0,mp4a.40.2",VIDEO="chunked"',
			"https://cdn.example/site/hevc/index.m3u8",
			'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.4D402A,mp4a.40.2",VIDEO="1080p60"',
			"https://cdn.example/site/avc/index.m3u8",
		].join("\n");
		const info = makeInfo({
			ActiveBackupPlayerType: "site",
			LastCleanBackupPlayerType: "site",
			ModifiedM3U8: "#EXTM3U",
			EnhancedDecoderCodecFamily: "hevc",
			SustainedNativeResolution: hevcTarget,
			ResolutionList: [hevcTarget],
			BackupEncodingsM3U8Cache: {
				site: {
					m3u8: master,
					baseUrl: "https://usher.ttvnw.net/api/channel/hls/test.m3u8",
				},
			},
		});
		const requestedUrls: string[] = [];
		let sequence = 100;
		state.PreferredQualityGroup = "chunked";

		try {
			const fetchNext = async (url: unknown) => {
				requestedUrls.push(String(url));
				const playlist = makePlaylist(sequence, 3);
				sequence += 100;
				return new Response(playlist, { status: 200 });
			};
			const first = await refresh()(info, fetchNext);
			const second = await refresh()(info, fetchNext);

			expect(requestedUrls).toEqual([
				"https://cdn.example/site/hevc/index.m3u8",
				"https://cdn.example/site/hevc/index.m3u8",
			]);
			expect(first).toContain("seg100.ts");
			expect(second).toContain("seg200.ts");
			expect(second).not.toBe(first);
			expect(info.LastCleanBackupCodecFamily).toBe("hevc");
		} finally {
			state.PreferredQualityGroup = previousQualityGroup;
		}
	});

	it("rejects an ad-marked enhanced refresh and preserves the prior clean backup", async () => {
		const hevcTarget = {
			Name: "chunked",
			Resolution: "2560x1440",
			FrameRate: 60,
			Codecs: "hev1.1.6.L153.B0",
		};
		const priorClean = makePlaylist(50, 3);
		const master = [
			"#EXTM3U",
			'#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="hev1.1.6.L153.B0,mp4a.40.2",VIDEO="chunked"',
			"https://cdn.example/site/hevc/index.m3u8",
			'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.4D402A,mp4a.40.2",VIDEO="1080p60"',
			"https://cdn.example/site/avc/index.m3u8",
		].join("\n");
		const info = makeInfo({
			ActiveBackupPlayerType: "site",
			LastCleanBackupPlayerType: "site",
			LastCleanBackupM3U8: priorClean,
			LastCleanBackupCodecFamily: "hevc",
			LastCleanBackupAt: Date.now() - 1000,
			ModifiedM3U8: "#EXTM3U",
			EnhancedDecoderCodecFamily: "hevc",
			SustainedNativeResolution: hevcTarget,
			ResolutionList: [hevcTarget],
			BackupEncodingsM3U8Cache: {
				site: {
					m3u8: master,
					baseUrl: "https://usher.ttvnw.net/api/channel/hls/test.m3u8",
				},
			},
		});
		const adMarkedRefresh = [
			"#EXTM3U",
			'#EXT-X-DATERANGE:ID="stitched-ad-refresh",CLASS="twitch-stitched-ad"',
			"#EXTINF:2.000,",
			"https://edge.example/stitched-ad-refresh.ts",
		].join("\n");

		const out = await refresh()(
			info,
			async () => new Response(adMarkedRefresh, { status: 200 }),
		);

		expect(out).toBe(null);
		expect(info.LastCleanBackupM3U8).toBe(priorClean);
		expect(String(info.LastCleanBackupM3U8)).not.toContain(
			"stitched-ad-refresh",
		);
		expect(info.LastCleanBackupCodecFamily).toBe("hevc");
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
			playerType === "autoplay"
				? '#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360,FRAME-RATE=30.000,VIDEO="360p"'
				: '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,FRAME-RATE=60.000,VIDEO="720p"',
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

	beforeEach(() => {
		getState().CurrentAdChannel = "testchannel";
		getState().CurrentAdMediaKey = "live:testchannel";
	});

	afterEach(() => {
		getState().CurrentAdChannel = null;
		getState().CurrentAdMediaKey = null;
	});

	it.each([
		["HEVC", "hevc", "hev1.1.6.L153.B0", "hevc"],
		["AV1", "av1", "av01.0.13M.08", "av1"],
	])(
		"selects a clean %s backup from the exact active codec family",
		async (_label, codecFamily, codecs, expectedPath) => {
			const state = getState();
			const previousTypes = state.BackupPlayerTypes;
			const previousDisable = state.DisableAutoplayBackup;
			const previousGetToken = g._getToken;
			const previousExtract = g._extractPlaybackAccessToken;
			const requestedVariants: string[] = [];
			const enhancedMaster = [
				"#EXTM3U",
				'#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="hev1.1.6.L153.B0,mp4a.40.2",VIDEO="1440p60"',
				"https://cdn.example/site/hevc/index.m3u8",
				'#EXT-X-STREAM-INF:BANDWIDTH=14000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="av01.0.13M.08,mp4a.40.2",VIDEO="1440p60"',
				"https://cdn.example/site/av1/index.m3u8",
				'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.4D402A,mp4a.40.2",VIDEO="1080p60"',
				"https://cdn.example/site/avc/index.m3u8",
			].join("\n");
			const target = {
				Name: "1440p60",
				Resolution: "2560x1440",
				FrameRate: 60,
				Codecs: codecs,
			};

			state.BackupPlayerTypes = ["site"];
			state.DisableAutoplayBackup = true;
			g._extractPlaybackAccessToken = () => ({
				signature: "sig",
				value: "token",
			});
			g._getToken = async () => new Response("{}", { status: 200 });

			try {
				const info = makeInfo({
					IsShowingAd: true,
					VisibleAdStartedAt: Date.now() - 500,
					ModifiedM3U8: "#EXTM3U",
					EnhancedDecoderCodecFamily: codecFamily,
					EnhancedDecoderCodec: codecs,
					SustainedNativeResolution: target,
					ResolutionList: [target],
				});
				const result = await findBackupStream()(
					info,
					async (url) => {
						const href = String(url);
						if (href.includes("usher.ttvnw.net")) {
							return new Response(enhancedMaster, { status: 200 });
						}
						requestedVariants.push(href);
						return new Response(cleanPlaylist, { status: 200 });
					},
					0,
					target,
				);

				expect(requestedVariants).toEqual([
					`https://cdn.example/site/${expectedPath}/index.m3u8`,
				]);
				expect(result.type).toBe("site");
				expect(result.m3u8).toBe(cleanPlaylist);
				expect(info.LastCleanBackupCodecFamily).toBe(codecFamily);
			} finally {
				state.BackupPlayerTypes = previousTypes;
				state.DisableAutoplayBackup = previousDisable;
				if (previousGetToken === undefined) delete g._getToken;
				else g._getToken = previousGetToken;
				if (previousExtract === undefined) delete g._extractPlaybackAccessToken;
				else g._extractPlaybackAccessToken = previousExtract;
			}
		},
	);

	it("rejects a mismatched HEVC descriptor and falls through to a clean AVC backup", async () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousAdMediaKey = state.CurrentAdMediaKey;
		const requestedVariants: string[] = [];
		const target = {
			Name: "chunked",
			Resolution: "2560x1440",
			FrameRate: 60,
			Codecs: "hev1.1.6.L153.B0",
		};
		const mixedMaster = [
			"#EXTM3U",
			'#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="hvc1.2.4.L120.B0,mp4a.40.2",VIDEO="chunked"',
			"https://cdn.example/site/incompatible-hevc/index.m3u8",
			'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.4D402A,mp4a.40.2",VIDEO="1080p60"',
			"https://cdn.example/site/avc/index.m3u8",
		].join("\n");

		state.BackupPlayerTypes = ["site"];
		state.DisableAutoplayBackup = true;
		try {
			const info = makeInfo({
				IsShowingAd: true,
				VisibleAdStartedAt: 1000,
				EnhancedDecoderCodecFamily: "hevc",
				EnhancedDecoderCodec: target.Codecs,
				SustainedNativeResolution: target,
				ResolutionList: [target],
				BackupEncodingsM3U8Cache: {
					site: {
						m3u8: mixedMaster,
						baseUrl: "https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8",
					},
				},
			});
			state.CurrentAdMediaKey = info.MediaKey;

			const result = await findBackupStream()(
				info,
				async (url) => {
					const href = String(url);
					requestedVariants.push(href);
					return new Response(cleanPlaylist, { status: 200 });
				},
				0,
				target,
			);

			expect(requestedVariants).toEqual([
				"https://cdn.example/site/avc/index.m3u8",
			]);
			expect(result).toEqual({ type: "site", m3u8: cleanPlaylist });
			expect(info.LastCleanBackupCodecFamily).toBe("avc");
			expect(info.LastCleanBackupCodec).toBe("avc1.4d402a");
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
			state.CurrentAdMediaKey = previousAdMediaKey;
		}
	});

	it.each([
		["HEVC", "hevc", "hev1.1.6.L153.B0"],
		["AV1", "av1", "av01.0.13M.08"],
	])(
		"checks every source for an exact %s backup before autoplay AVC",
		async (_label, codecFamily, codecs) => {
			const state = getState();
			const previousTypes = state.BackupPlayerTypes;
			const previousDisable = state.DisableAutoplayBackup;
			const previousGetToken = g._getToken;
			const previousExtract = g._extractPlaybackAccessToken;
			const tokenCalls: string[] = [];
			const requestedVariants: string[] = [];
			let activePlayerType = "";
			const target = {
				Name: "1440p60",
				Resolution: "2560x1440",
				FrameRate: 60,
				Codecs: codecs,
			};
			const exactMaster = [
				"#EXTM3U",
				`#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="${codecs},mp4a.40.2",VIDEO="1440p60"`,
				`https://cdn.example/site/${codecFamily}/index.m3u8`,
				'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.4D402A,mp4a.40.2",VIDEO="1080p60"',
				"https://cdn.example/site/avc/index.m3u8",
			].join("\n");
			const autoplayMaster = [
				"#EXTM3U",
				'#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360,FRAME-RATE=30.000,CODECS="avc1.4D401E,mp4a.40.2",VIDEO="360p"',
				"https://cdn.example/autoplay/avc/index.m3u8",
			].join("\n");

			state.BackupPlayerTypes = ["site", "autoplay"];
			state.DisableAutoplayBackup = false;
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
				const info = makeInfo({
					IsShowingAd: true,
					VisibleAdStartedAt: Date.now() - 500,
					ModifiedM3U8: "#EXTM3U",
					EnhancedDecoderCodecFamily: codecFamily,
					EnhancedDecoderCodec: codecs,
					SustainedNativeResolution: target,
					ResolutionList: [target],
				});
				const result = await findBackupStream()(
					info,
					async (url) => {
						const href = String(url);
						if (href.includes("usher.ttvnw.net")) {
							return new Response(
								activePlayerType === "autoplay" ? autoplayMaster : exactMaster,
								{ status: 200 },
							);
						}
						requestedVariants.push(href);
						return new Response(cleanPlaylist, { status: 200 });
					},
					0,
					target,
				);

				expect(tokenCalls).toEqual(["site"]);
				expect(requestedVariants).toEqual([
					`https://cdn.example/site/${codecFamily}/index.m3u8`,
				]);
				expect(result.type).toBe("site");
				expect(info.LastCleanBackupCodecFamily).toBe(codecFamily);
			} finally {
				state.BackupPlayerTypes = previousTypes;
				state.DisableAutoplayBackup = previousDisable;
				if (previousGetToken === undefined) delete g._getToken;
				else g._getToken = previousGetToken;
				if (previousExtract === undefined) delete g._extractPlaybackAccessToken;
				else g._extractPlaybackAccessToken = previousExtract;
			}
		},
	);

	it("starts explicit AVC emergency selection only after every source lacks the active enhanced family", async () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;
		const tokenCalls: string[] = [];
		const requestedVariants: string[] = [];
		let activePlayerType = "";
		const target = {
			Name: "1440p60",
			Resolution: "2560x1440",
			FrameRate: 60,
			Codecs: "hev1.1.6.L153.B0",
		};
		const avcMaster = (playerType: string) =>
			[
				"#EXTM3U",
				`#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.4D402A,mp4a.40.2",VIDEO="1080p60"`,
				`https://cdn.example/${playerType}/avc/index.m3u8`,
			].join("\n");

		state.BackupPlayerTypes = ["site", "autoplay"];
		state.DisableAutoplayBackup = false;
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
			const info = makeInfo({
				IsShowingAd: true,
				VisibleAdStartedAt: Date.now() - 500,
				ModifiedM3U8: "#EXTM3U",
				EnhancedDecoderCodecFamily: "hevc",
				EnhancedDecoderCodec: target.Codecs,
				SustainedNativeResolution: target,
				ResolutionList: [target],
			});
			const result = await findBackupStream()(
				info,
				async (url) => {
					const href = String(url);
					if (href.includes("usher.ttvnw.net")) {
						return new Response(avcMaster(activePlayerType), {
							status: 200,
						});
					}
					requestedVariants.push(href);
					return new Response(cleanPlaylist, { status: 200 });
				},
				0,
				target,
			);

			expect(tokenCalls).toEqual(["site", "autoplay"]);
			expect(requestedVariants).toEqual([
				"https://cdn.example/autoplay/avc/index.m3u8",
			]);
			expect(result.type).toBe("autoplay");
			expect(info.LastCleanBackupCodecFamily).toBe("avc");
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
			if (previousGetToken === undefined) delete g._getToken;
			else g._getToken = previousGetToken;
			if (previousExtract === undefined) delete g._extractPlaybackAccessToken;
			else g._extractPlaybackAccessToken = previousExtract;
		}
	});

	it("falls through to explicit AVC when an exact-codec token body stalls at the probe deadline", async () => {
		vi.useFakeTimers();
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;
		const target = {
			Name: "1440p60",
			Resolution: "2560x1440",
			FrameRate: 60,
			Codecs: "hev1.1.6.L153.B0",
		};
		const avcMaster = [
			"#EXTM3U",
			'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.4D402A,mp4a.40.2",VIDEO="1080p60"',
			"https://cdn.example/site/avc/index.m3u8",
		].join("\n");
		let tokenCalls = 0;

		state.BackupPlayerTypes = ["site"];
		state.DisableAutoplayBackup = true;
		g._extractPlaybackAccessToken = () => ({
			signature: "sig",
			value: "token",
		});
		g._getToken = async () => {
			tokenCalls++;
			if (tokenCalls === 1) {
				return {
					status: 200,
					json: () => new Promise(() => {}),
				};
			}
			return new Response("{}", { status: 200 });
		};

		try {
			const info = makeInfo({
				IsShowingAd: true,
				VisibleAdStartedAt: 1000,
				EnhancedDecoderCodecFamily: "hevc",
				EnhancedDecoderCodec: target.Codecs,
				SustainedNativeResolution: target,
				ResolutionList: [target],
			});
			activateExactAdCycle(info, 1000);
			const pending = findBackupStream()(
				info,
				async (url) => {
					const href = String(url);
					return href.includes("usher.ttvnw.net")
						? new Response(avcMaster, { status: 200 })
						: new Response(cleanPlaylist, { status: 200 });
				},
				0,
				target,
			);

			await vi.advanceTimersByTimeAsync(1501);
			await expect(pending).resolves.toEqual({
				type: "site",
				m3u8: cleanPlaylist,
			});
			expect(tokenCalls).toBe(2);
			expect(info.LastCleanBackupCodecFamily).toBe("avc");
			expect(info.LastCleanBackupCodec).toBe("avc1.4d402a");
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
			if (previousGetToken === undefined) delete g._getToken;
			else g._getToken = previousGetToken;
			if (previousExtract === undefined) delete g._extractPlaybackAccessToken;
			else g._extractPlaybackAccessToken = previousExtract;
			vi.useRealTimers();
		}
	});

	it.each([
		["ad-marked", 200],
		["unavailable", 404],
	])(
		"tries clean AVC only after the exact same-family backup is %s",
		async (_label, exactStatus) => {
			const state = getState();
			const previousTypes = state.BackupPlayerTypes;
			const previousDisable = state.DisableAutoplayBackup;
			const previousGetToken = g._getToken;
			const previousExtract = g._extractPlaybackAccessToken;
			const requestedVariants: string[] = [];
			const target = {
				Name: "1440p60",
				Resolution: "2560x1440",
				FrameRate: 60,
				Codecs: "hev1.1.6.L153.B0",
			};
			const enhancedMaster = [
				"#EXTM3U",
				'#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,FRAME-RATE=60.000,CODECS="hev1.1.6.L153.B0,mp4a.40.2",VIDEO="1440p60"',
				"https://cdn.example/site/hevc/index.m3u8",
				'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,FRAME-RATE=60.000,CODECS="avc1.4D402A,mp4a.40.2",VIDEO="1080p60"',
				"https://cdn.example/site/avc/index.m3u8",
			].join("\n");

			state.BackupPlayerTypes = ["site"];
			state.DisableAutoplayBackup = true;
			g._extractPlaybackAccessToken = () => ({
				signature: "sig",
				value: "token",
			});
			g._getToken = async () => new Response("{}", { status: 200 });

			try {
				const info = makeInfo({
					IsShowingAd: true,
					VisibleAdStartedAt: Date.now() - 500,
					ModifiedM3U8: "#EXTM3U",
					EnhancedDecoderCodecFamily: "hevc",
					EnhancedDecoderCodec: target.Codecs,
					SustainedNativeResolution: target,
					ResolutionList: [target],
				});
				const result = await findBackupStream()(
					info,
					async (url) => {
						const href = String(url);
						if (href.includes("usher.ttvnw.net")) {
							return new Response(enhancedMaster, { status: 200 });
						}
						requestedVariants.push(href);
						if (href.includes("/hevc/")) {
							return exactStatus === 200
								? new Response(adPlaylist, { status: 200 })
								: new Response(null, { status: exactStatus });
						}
						return new Response(cleanPlaylist, { status: 200 });
					},
					0,
					target,
				);

				expect(requestedVariants).toEqual([
					"https://cdn.example/site/hevc/index.m3u8",
					"https://cdn.example/site/avc/index.m3u8",
				]);
				expect(result).toEqual({ type: "site", m3u8: cleanPlaylist });
				expect(info.LastCleanBackupM3U8).toBe(cleanPlaylist);
				expect(info.LastCleanBackupCodecFamily).toBe("avc");
				expect(result.m3u8).not.toContain("stitched-ad");
			} finally {
				state.BackupPlayerTypes = previousTypes;
				state.DisableAutoplayBackup = previousDisable;
				if (previousGetToken === undefined) delete g._getToken;
				else g._getToken = previousGetToken;
				if (previousExtract === undefined) delete g._extractPlaybackAccessToken;
				else g._extractPlaybackAccessToken = previousExtract;
			}
		},
	);

	it("never acquires autoplay when Low Quality Fallback is disabled", async () => {
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

			expect(tokenCalls).toEqual(["embed"]);
			expect(result).toEqual({ type: null, m3u8: null });
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

	it("uses clean autoplay last when an exact Previews player has no clean normal source", async () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousPreview = state.AllowPreviewEmergencyAutoplayBackup;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;
		const tokenCalls: string[] = [];
		let activePlayerType = "";

		state.BackupPlayerTypes = ["embed", "autoplay"];
		state.DisableAutoplayBackup = true;
		state.AllowPreviewEmergencyAutoplayBackup = true;
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
			expect(result).toEqual({ type: "autoplay", m3u8: cleanPlaylist });
			expect(result.m3u8).not.toContain("stitched-ad");
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
			state.AllowPreviewEmergencyAutoplayBackup = previousPreview;
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

	it("stops before autoplay when a preview normal-quality source is clean", async () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousPreview = state.AllowPreviewEmergencyAutoplayBackup;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;
		const tokenCalls: string[] = [];
		let activePlayerType = "";

		state.BackupPlayerTypes = ["embed", "autoplay"];
		state.DisableAutoplayBackup = true;
		state.AllowPreviewEmergencyAutoplayBackup = true;
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
						return new Response(cleanPlaylist, { status: 200 });
					}
					throw new Error("autoplay should not be requested");
				},
				0,
				currentResolution,
			);

			expect(tokenCalls).toEqual(["embed"]);
			expect(result).toEqual({ type: "embed", m3u8: cleanPlaylist });
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
			state.AllowPreviewEmergencyAutoplayBackup = previousPreview;
			if (previousGetToken === undefined) delete g._getToken;
			else g._getToken = previousGetToken;
			if (previousExtract === undefined) delete g._extractPlaybackAccessToken;
			else g._extractPlaybackAccessToken = previousExtract;
		}
	});

	it("rejects an ad-marked preview emergency source", async () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousPreview = state.AllowPreviewEmergencyAutoplayBackup;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;

		state.BackupPlayerTypes = ["autoplay"];
		state.DisableAutoplayBackup = true;
		state.AllowPreviewEmergencyAutoplayBackup = true;
		g._extractPlaybackAccessToken = () => ({
			signature: "sig",
			value: "token",
		});
		g._getToken = async () => new Response("{}", { status: 200 });

		try {
			const result = await findBackupStream()(
				makeInfo(),
				async (url) =>
					String(url).includes("usher.ttvnw.net")
						? new Response(masterPlaylist("autoplay"), { status: 200 })
						: new Response(adPlaylist, { status: 200 }),
				0,
				currentResolution,
			);

			expect(result).toEqual({ type: null, m3u8: null });
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
			state.AllowPreviewEmergencyAutoplayBackup = previousPreview;
			if (previousGetToken === undefined) delete g._getToken;
			else g._getToken = previousGetToken;
			if (previousExtract === undefined) delete g._extractPlaybackAccessToken;
			else g._extractPlaybackAccessToken = previousExtract;
		}
	});

	it("does not promote autoplay when the toggle is disabled during its request", async () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;
		const tokenCalls: string[] = [];
		let activePlayerType = "";

		state.BackupPlayerTypes = ["autoplay", "embed"];
		state.DisableAutoplayBackup = false;
		g._extractPlaybackAccessToken = () => ({
			signature: "sig",
			value: "token",
		});
		g._getToken = async (_info, playerType) => {
			activePlayerType = String(playerType);
			tokenCalls.push(activePlayerType);
			if (activePlayerType === "autoplay") {
				state.DisableAutoplayBackup = true;
			}
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
					return new Response(cleanPlaylist, { status: 200 });
				},
				0,
				currentResolution,
			);

			expect(tokenCalls).toEqual(["autoplay", "embed"]);
			expect(result.type).toBe("embed");
			expect(result.m3u8).toBe(cleanPlaylist);
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
			if (previousGetToken === undefined) delete g._getToken;
			else g._getToken = previousGetToken;
			if (previousExtract === undefined) delete g._extractPlaybackAccessToken;
			else g._extractPlaybackAccessToken = previousExtract;
		}
	});

	it("does not let a minimal-request search bypass a disabled fallback", async () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;
		const tokenCalls: string[] = [];

		state.BackupPlayerTypes = ["embed", "autoplay"];
		state.DisableAutoplayBackup = false;
		g._extractPlaybackAccessToken = () => ({
			signature: "sig",
			value: "token",
		});
		g._getToken = async (_info, playerType) => {
			tokenCalls.push(String(playerType));
			state.DisableAutoplayBackup = true;
			return new Response("{}", { status: 200 });
		};

		try {
			const result = await findBackupStream()(
				makeInfo(),
				async (url) =>
					String(url).includes("usher.ttvnw.net")
						? new Response(masterPlaylist("autoplay"), { status: 200 })
						: new Response(cleanPlaylist, { status: 200 }),
				1,
				currentResolution,
			);

			expect(tokenCalls).toEqual(["autoplay"]);
			expect(result).toEqual({ type: null, m3u8: null });
		} finally {
			state.BackupPlayerTypes = previousTypes;
			state.DisableAutoplayBackup = previousDisable;
			if (previousGetToken === undefined) delete g._getToken;
			else g._getToken = previousGetToken;
			if (previousExtract === undefined) delete g._extractPlaybackAccessToken;
			else g._extractPlaybackAccessToken = previousExtract;
		}
	});

	it("tries autoplay first when LQ fallback is enabled for an active ad cycle", async () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;
		const tokenCalls: string[] = [];
		let activePlayerType = "";

		state.BackupPlayerTypes = ["embed", "autoplay"];
		state.DisableAutoplayBackup = false;
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
					IsShowingAd: true,
					VisibleAdStartedAt: Date.now() - 500,
				}),
				async (url) => {
					const href = String(url);
					if (href.includes("usher.ttvnw.net")) {
						return new Response(masterPlaylist(activePlayerType), {
							status: 200,
						});
					}
					if (href.includes("/autoplay/")) {
						return new Response(cleanPlaylist, { status: 200 });
					}
					return new Response(null, { status: 404 });
				},
				0,
				currentResolution,
			);

			expect(tokenCalls).toEqual(["autoplay"]);
			expect(result.type).toBe("autoplay");
			expect(result.m3u8).toBe(cleanPlaylist);
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
			expect(result).toEqual({ type: null, m3u8: null });
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

describe("_findBackupStream held-autoplay bridging during HQ probe", () => {
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
			}>
		>("_findBackupStream");
	const currentResolution = {
		Name: "720p",
		Resolution: "1280x720",
		FrameRate: 60,
	};
	const autoplayMaster = [
		"#EXTM3U",
		'#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360,FRAME-RATE=30.000,VIDEO="360p"',
		"https://cdn.example/autoplay/index.m3u8",
	].join("\n");
	const staleHeldPlaylist = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		"#EXTINF:2.000,live",
		"https://edge.example/held-old-1.ts",
	].join("\n");
	const freshAutoplayPlaylist = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		"#EXTINF:2.000,live",
		"https://edge.example/held-fresh-2.ts",
	].join("\n");
	const adMarkedPlaylist = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		'#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad"',
		"#EXTINF:2.000,",
		"https://edge.example/stitched-ad-1.ts",
	].join("\n");

	const makeHeldAutoplayInfo = (now: number) => {
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: now - 20000,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupM3U8: staleHeldPlaylist,
			LastCleanBackupAt: now - 5000,
			_LqHoldStartAt: now - 20000,
			BackupEncodingsM3U8Cache: {
				autoplay: {
					m3u8: autoplayMaster,
					baseUrl: "https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8",
				},
			},
		});
		activateExactAdCycle(info, now - 20000);
		return info;
	};

	it("serves a live-refreshed autoplay playlist instead of waiting on an in-flight probe sweep", async () => {
		const state = getState();
		const previousDisable = state.DisableAutoplayBackup;
		state.DisableAutoplayBackup = false;
		const info = makeHeldAutoplayInfo(Date.now());
		let releaseSearch: (value: {
			type: string | null;
			m3u8: string | null;
		}) => void = () => {};
		info._BackupSearchPromise = new Promise((resolve) => {
			releaseSearch = resolve;
		});

		try {
			const result = await findBackupStream()(
				info,
				async () => new Response(freshAutoplayPlaylist, { status: 200 }),
				0,
				currentResolution,
			);

			expect(result.type).toBe("autoplay");
			expect(result.m3u8).toBe(freshAutoplayPlaylist);
			expect(info.LastCleanBackupM3U8).toBe(freshAutoplayPlaylist);
		} finally {
			releaseSearch({ type: null, m3u8: null });
			state.DisableAutoplayBackup = previousDisable;
		}
	});

	it("keeps the current clean bridge advancing while disabled HQ search continues", async () => {
		const state = getState();
		const previousDisable = state.DisableAutoplayBackup;
		state.DisableAutoplayBackup = true;
		const info = makeHeldAutoplayInfo(Date.now());
		let releaseSearch: (value: {
			type: string | null;
			m3u8: string | null;
		}) => void = () => {};
		info._BackupSearchPromise = new Promise((resolve) => {
			releaseSearch = resolve;
		});

		try {
			const result = await findBackupStream()(
				info,
				async () => new Response(freshAutoplayPlaylist, { status: 200 }),
				0,
				currentResolution,
			);

			expect(result).toEqual({
				type: "autoplay",
				m3u8: freshAutoplayPlaylist,
			});
			expect(info.ActiveBackupResolution).toBe("640x360");
		} finally {
			releaseSearch({ type: null, m3u8: null });
			state.DisableAutoplayBackup = previousDisable;
		}
	});

	it("rejects an ad-marked continuity refresh while disabled", async () => {
		const state = getState();
		const previousDisable = state.DisableAutoplayBackup;
		state.DisableAutoplayBackup = true;
		const info = makeHeldAutoplayInfo(Date.now());
		info._BackupSearchPromise = Promise.resolve({
			type: "embed",
			m3u8: staleHeldPlaylist,
		});

		try {
			const result = await findBackupStream()(
				info,
				async () => new Response(adMarkedPlaylist, { status: 200 }),
				0,
				currentResolution,
			);

			expect(result).toEqual({
				type: "embed",
				m3u8: staleHeldPlaylist,
			});
			expect(info.LastCleanBackupM3U8).toBe(staleHeldPlaylist);
		} finally {
			state.DisableAutoplayBackup = previousDisable;
		}
	});

	it("never serves an ad-marked bridge refresh and falls back to the probe result", async () => {
		const state = getState();
		const previousDisable = state.DisableAutoplayBackup;
		state.DisableAutoplayBackup = false;
		const info = makeHeldAutoplayInfo(Date.now());
		info._BackupSearchPromise = new Promise((resolve) => {
			setTimeout(() => resolve({ type: "embed", m3u8: staleHeldPlaylist }), 50);
		});

		try {
			const result = await findBackupStream()(
				info,
				async () => new Response(adMarkedPlaylist, { status: 200 }),
				0,
				currentResolution,
			);

			expect(result.type).toBe("embed");
			expect(result.m3u8).toBe(staleHeldPlaylist);
			expect(info.LastCleanBackupM3U8).not.toBe(adMarkedPlaylist);
		} finally {
			state.DisableAutoplayBackup = previousDisable;
		}
	});

	it("keeps a slow probe sweep running in the background after bridging", async () => {
		const state = getState();
		const previousTypes = state.BackupPlayerTypes;
		const previousDisable = state.DisableAutoplayBackup;
		const previousGetToken = g._getToken;
		const previousExtract = g._extractPlaybackAccessToken;
		const tokenCalls: string[] = [];

		state.BackupPlayerTypes = ["embed", "autoplay"];
		state.DisableAutoplayBackup = false;
		g._extractPlaybackAccessToken = () => ({
			signature: "sig",
			value: "token",
		});
		g._getToken = async (_info: unknown, playerType: unknown) => {
			tokenCalls.push(String(playerType));
			await new Promise((resolve) => setTimeout(resolve, 1600));
			return new Response("{}", { status: 200 });
		};

		const info = makeHeldAutoplayInfo(Date.now());

		try {
			const startedAt = Date.now();
			const result = await findBackupStream()(
				info,
				async (url) => {
					const href = String(url);
					if (href.includes("usher.ttvnw.net")) {
						return new Response(autoplayMaster, { status: 200 });
					}
					if (href.includes("/autoplay/")) {
						return new Response(freshAutoplayPlaylist, { status: 200 });
					}
					return new Response(adMarkedPlaylist, { status: 200 });
				},
				0,
				currentResolution,
			);

			expect(result.type).toBe("autoplay");
			expect(result.m3u8).toBe(freshAutoplayPlaylist);
			expect(Date.now() - startedAt).toBeLessThan(1600);
			expect(info._BackupSearchPromise).not.toBeNull();
			await info._BackupSearchPromise;
			expect(info._BackupSearchPromise).toBeNull();
			expect(tokenCalls).toEqual(["embed"]);
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

describe("_stripHevcBackupVariants (codec-compatible backup selection)", () => {
	const stripHevc = () =>
		T<
			(
				info: Record<string, unknown>,
				m3u8: string,
				targetResolution?: Record<string, unknown> | null,
				codecFamilyOverride?: string | null,
			) => string | null
		>("_stripHevcBackupVariants");
	const getStreamUrl = () =>
		T<
			(
				m3u8: string,
				res: Record<string, unknown>,
				baseUrl?: string,
			) => string | null
		>("_getStreamUrl");
	const streamInf = (video: string, res: string, codecs: string, url: string) =>
		[
			`#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=${res},CODECS="${codecs},mp4a.40.2",VIDEO="${video}",FRAME-RATE=60.000`,
			`https://cdn.example/${url}/index.m3u8`,
		].join("\n");
	const multiCodecMaster = [
		"#EXTM3U",
		streamInf("chunked", "2560x1440", "hev1.1.6.L153.B0", "src-hevc"),
		streamInf("1440p60", "2560x1440", "hev1.1.6.L120.B0", "1440-hevc"),
		streamInf("1440p60", "2560x1440", "av01.0.13M.08", "1440-av1"),
		streamInf("1080p60", "1920x1080", "avc1.4D402A", "1080-avc"),
		streamInf("720p60", "1280x720", "avc1.4D401F", "720-avc"),
	].join("\n");
	const hevcOnlyMaster = [
		"#EXTM3U",
		streamInf("chunked", "2560x1440", "hev1.1.6.L153.B0", "src-hevc"),
		streamInf("1080p60", "1920x1080", "hev1.1.6.L120.B0", "1080-hevc"),
	].join("\n");
	const target1440 = {
		Name: "1440p60",
		Resolution: "2560x1440",
		FrameRate: 60,
		Codecs: "hev1.1.6.L120.B0",
	};
	const targetAv11440 = {
		Name: "1440p60",
		Resolution: "2560x1440",
		FrameRate: 60,
		Codecs: "av01.0.13M.08",
	};

	it("keeps HEVC and AV1 backup variants away from an AVC session so 1440p targets degrade to AVC", () => {
		const info = makeInfo({
			ModifiedM3U8: "modified",
			IsUsingModifiedM3U8: true,
		});
		const stripped = stripHevc()(info, multiCodecMaster, target1440);
		expect(stripped).not.toContain("src-hevc");
		expect(stripped).not.toContain("1440-hevc");
		expect(stripped).not.toContain("1440-av1");
		expect(stripped).toContain("1080-avc");
		expect(getStreamUrl()(stripped, target1440)).toBe(
			"https://cdn.example/1080-avc/index.m3u8",
		);
	});

	it("keeps only the exact HEVC descriptor when a prepared fallback is inactive under a HEVC decoder", () => {
		const info = makeInfo({
			ModifiedM3U8: "modified",
			EnhancedDecoderCodecFamily: "hevc",
			EnhancedDecoderCodec: target1440.Codecs,
			ResolutionList: [
				{
					Name: "chunked",
					Resolution: "2560x1440",
					FrameRate: 60,
					Codecs: "hev1.1.6.L153.B0",
				},
			],
		});
		const filtered = stripHevc()(info, multiCodecMaster, target1440);
		expect(filtered).not.toContain("src-hevc");
		expect(filtered).toContain("1440-hevc");
		expect(filtered).not.toContain("1440-av1");
		expect(filtered).not.toContain("1080-avc");
		expect(getStreamUrl()(filtered, target1440)).toBe(
			"https://cdn.example/1440-hevc/index.m3u8",
		);
	});

	it("keeps only AV1 variants when the sustained native decoder is AV1", () => {
		const info = makeInfo({
			ModifiedM3U8: "modified",
			SustainedNativeResolution: {
				Name: "1440p60",
				Resolution: "2560x1440",
				FrameRate: 60,
				Codecs: "av01.0.13M.08",
			},
		});
		const filtered = stripHevc()(info, multiCodecMaster, targetAv11440);
		expect(filtered).toContain("1440-av1");
		expect(filtered).not.toContain("src-hevc");
		expect(filtered).not.toContain("1440-hevc");
		expect(filtered).not.toContain("1080-avc");
	});

	it("rejects an enhanced-only backup master during an AVC handoff", () => {
		const info = makeInfo({
			ModifiedM3U8: "modified",
			IsUsingModifiedM3U8: true,
		});
		const stripped = stripHevc()(info, hevcOnlyMaster, target1440);
		expect(stripped).toBe(null);
	});

	it("requires the caller to begin an explicit AVC emergency pass after the enhanced family is absent", () => {
		const av1AndAvcMaster = [
			"#EXTM3U",
			streamInf("1440p60", "2560x1440", "av01.0.13M.08", "1440-av1"),
			streamInf("1080p60", "1920x1080", "avc1.4D402A", "1080-avc"),
		].join("\n");
		const info = makeInfo({
			ModifiedM3U8: "modified",
			EnhancedDecoderCodecFamily: "hevc",
		});
		expect(stripHevc()(info, av1AndAvcMaster, target1440)).toBe(null);

		const emergencyAvc = stripHevc()(info, av1AndAvcMaster, target1440, "avc");
		expect(emergencyAvc).not.toContain("1440-av1");
		expect(emergencyAvc).toContain("1080-avc");
	});
});

describe("_isEnhancedCodecString (codecs that cannot splice into an AVC pipeline)", () => {
	const isEnhanced = () =>
		T<(codecs?: string) => boolean>("_isEnhancedCodecString");
	const isHevcCodec = () =>
		T<(codecs?: string) => boolean>("_isHevcCodecString");

	it("classifies HEVC and AV1 as enhanced but never AVC despite the shared av prefix", () => {
		expect(isEnhanced()("hev1.1.6.L153.B0,mp4a.40.2")).toBe(true);
		expect(isEnhanced()("hvc1.1.6.L153.B0")).toBe(true);
		expect(isEnhanced()("av01.0.13M.08,mp4a.40.2")).toBe(true);
		expect(isEnhanced()("avc1.4D402A,mp4a.40.2")).toBe(false);
		expect(isEnhanced()(undefined)).toBe(false);
	});

	it("keeps _isHevcCodecString strictly HEVC so AV1 is never mistaken for it", () => {
		expect(isHevcCodec()("av01.0.13M.08")).toBe(false);
		expect(isHevcCodec()("hev1.1.6.L153.B0")).toBe(true);
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
					: makePlaylist(98 + probeUrls.length, 3),
				{ status: 200 },
			);
		};

		try {
			const info = makeInfo({ IsUsingBackupStream: true });
			activateExactAdCycle(info);
			const baseline = await fn()(
				info,
				async () => {
					throw new Error("native recovery probe used raw fetch");
				},
				"720p",
			);
			info.LastNativeRecoveryProbeAt = 0;
			const result = await fn()(
				info,
				async () => {
					throw new Error("native recovery probe used raw fetch");
				},
				"720p",
			);

			expect(baseline).toBe(false);
			expect(result).toBe(true);
			expect(probeUrls).toEqual([
				"https://usher.example/channel/hls/testchannel.m3u8",
				"https://edge.example/live/index.m3u8",
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

	it("does not double-insert a CRLF boundary marker", () => {
		const once = fn()(makePlaylist(100, 3), 100, 100).replace(/\n/g, "\r\n");
		const twice = fn()(once, 100, 100);
		expect(countDiscontinuity(twice)).toBe(1);
	});

	it("does not mistake the discontinuity sequence header for a media boundary", () => {
		const out = fn()(makePlaylist(100, 3, 7), 100, 100);
		expect(countDiscontinuity(out)).toBe(1);
		expect(out).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:7");
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
		expect(info._SpliceDiscontinuityOffset).toBe(0);
		expect(info._SpliceLastDiscontinuitySequence).toBe(null);
	});

	it("bridges the first backup playlist exactly once and records the boundary", () => {
		const info = makeInfo({
			IsUsingBackupStream: true,
			ActiveBackupPlayerType: "site",
			ActiveBackupResolution: "1080p60",
		});
		const out = fn()(info, makePlaylist(500, 4));
		expect(countDiscontinuity(out)).toBe(1);
		expect(info._SpliceStreamId).toBe("site|1080p60|?");
		expect(info._SpliceBoundarySeq).toBe(500);
		expect(info._SpliceDiscontinuityOffset).toBe(0);
		expect(info._SpliceLastDiscontinuitySequence).toBe(1);
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
		expect(upgraded).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:1");
		expect(info._SpliceStreamId).toBe("site|1080p60|?");
		expect(info._SpliceBoundarySeq).toBe(900);
		expect(info._SpliceLastDiscontinuitySequence).toBe(2);

		const refreshed = fn()(info, makePlaylist(904, 4));
		expect(countDiscontinuity(refreshed)).toBe(0);
		expect(refreshed).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:2");
		expect(info._SpliceLastDiscontinuitySequence).toBe(2);
	});

	it("keeps continuity monotonic across raw sequence and codec changes", () => {
		const info = makeInfo({
			IsUsingBackupStream: true,
			ActiveBackupPlayerType: "autoplay",
			ActiveBackupResolution: "640x360",
			LastCleanBackupCodec: "avc1.4d401f",
		});
		const low = [
			makePlaylist(20, 3, 5),
			"#EXT-X-DISCONTINUITY",
			"#EXTINF:2.000,live",
			"seg23.ts",
		].join("\n");
		const bridgedLow = fn()(info, low);
		expect(info._SpliceLastDiscontinuitySequence).toBe(7);
		expect(countDiscontinuity(bridgedLow)).toBe(2);

		info.ActiveBackupPlayerType = "mobile_web";
		info.ActiveBackupResolution = "1920x1080";
		info.LastCleanBackupCodec = "avc1.64002a";
		const high = fn()(info, makePlaylist(900, 4, 12));
		expect(high).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:7");
		expect(countDiscontinuity(high)).toBe(1);
		expect(info._SpliceLastDiscontinuitySequence).toBe(8);
		expect(info._SpliceStreamId).toBe("mobile_web|1920x1080|avc1.64002a");

		const refreshed = fn()(info, makePlaylist(904, 4, 12));
		expect(countDiscontinuity(refreshed)).toBe(0);
		expect(refreshed).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:8");
		expect(info._SpliceLastDiscontinuitySequence).toBe(8);
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
		activateExactAdCycle(info, Number(info.VisibleAdStartedAt));
		info.Urls = Object.assign(Object.create(null), {
			[NATIVE_URL]: {},
		});
		return info;
	}

	it("keeps the held backup playing without a reload when ending into a silent backup hold", async () => {
		const info = setupCsaiEscapeAdEnd({
			ConsecutiveFailedNativeProbes: 6,
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			ExpectedAdPodLength: 2,
			EnhancedDecoderCodecFamily: "hevc",
			EnhancedDecoderCodec: "hev1.1.6.L153.B0",
		});
		const handoffId = cycleHandoffId(
			info,
			Number(info.VisibleAdStartedAt),
			"silent-hold",
		);
		info._CodecHandoffPendingId = handoffId;
		info._CodecHandoffAcknowledgedId = handoffId;
		info.LastCleanBackupCodecFamily = "hevc";
		info.LastCleanBackupCodec = "hev1.1.6.l153.b0";
		T<
			(
				info: Record<string, unknown>,
				m3u8: string,
				codecFamily: string,
				codec: string,
			) => string
		>("_rememberBackupPlaylistMetadata")(
			info,
			String(info.LastCleanBackupM3U8),
			"hevc",
			"hev1.1.6.L153.B0",
		);
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
		expect((info.ObservedAdPodIds as Set<string>).size).toBe(1);
		expect(info.ExpectedAdPodLength).toBe(2);
		expect(info.ActiveBackupPlayerType).toBe("embed");
		expect(info.EnhancedDecoderCodecFamily).toBe("hevc");
		expect(info._CodecHandoffPendingId).toBe(handoffId);
		expect(getState().PinnedBackupPlayerType).toBe("embed");
		expect(out).toContain("seg50.ts");
		getState().PinnedBackupPlayerType = null;
		getState().PinnedBackupPlayerChannel = null;
		getState().PinnedBackupPlayerMediaKey = null;
	});

	it("reannounces backup ownership when rapid reentry goes directly into a silent hold", async () => {
		const state = getState();
		const info = setupCsaiEscapeAdEnd({
			ConsecutiveFailedNativeProbes: 6,
			IsUsingBackupStream: false,
			ActiveBackupPlayerType: null,
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupAt: Date.now(),
		});
		state.PinnedBackupPlayerType = null;
		state.PinnedBackupPlayerChannel = null;
		state.PinnedBackupPlayerMediaKey = null;
		g._canReloadNativePlayerAfterAd = async () => false;

		try {
			const out = await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
				Promise.reject(new Error("unexpected fetch")),
			);
			const messages = sentMessages();
			const selectedAt = messages.findIndex(
				(message) => message.key === "BackupPlayerTypeSelected",
			);
			const endedAt = messages.findIndex(
				(message) => message.key === "AdEnded",
			);

			expect(messages[selectedAt]).toMatchObject({
				key: "BackupPlayerTypeSelected",
				value: "autoplay",
				channel: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: info.VisibleAdStartedAt,
			});
			expect(selectedAt).toBeLessThan(endedAt);
			expect(messages[endedAt]).toMatchObject({
				key: "AdEnded",
				holdingBackup: true,
			});
			expect(out).toContain("seg50.ts");
		} finally {
			state.PinnedBackupPlayerType = null;
			state.PinnedBackupPlayerChannel = null;
			state.PinnedBackupPlayerMediaKey = null;
		}
	});

	it("refreshes a stale source backup before entering an ended silent hold", async () => {
		const previousActiveRefresh = g._refreshActiveBackupMediaPlaylist;
		const previousAutoplayRefresh = g._refreshHeldAutoplayBackupPlaylist;
		const refreshedBackup = makePlaylist(80, 3);
		const activeRefresh = vi.fn(async () => refreshedBackup);
		const autoplayRefresh = vi.fn(async () => null);
		g._refreshActiveBackupMediaPlaylist = activeRefresh;
		g._refreshHeldAutoplayBackupPlaylist = autoplayRefresh;
		const info = setupCsaiEscapeAdEnd({
			ConsecutiveFailedNativeProbes: 6,
			LastCleanBackupAt: Date.now() - 2000,
		});
		g._canReloadNativePlayerAfterAd = async () => false;

		try {
			const out = await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
				Promise.reject(new Error("unexpected fetch")),
			);

			expect(activeRefresh).toHaveBeenCalledTimes(1);
			expect(autoplayRefresh).not.toHaveBeenCalled();
			expect(out).toContain("seg80.ts");
			expect(out).not.toContain("seg50.ts");
			expect(info.IsHoldingBackupAfterAd).toBe(true);
		} finally {
			g._refreshActiveBackupMediaPlaylist = previousActiveRefresh;
			g._refreshHeldAutoplayBackupPlaylist = previousAutoplayRefresh;
		}
	});

	it("serves refreshed backup through both exact windows before restoring the current native playlist", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(600000);
		const previousToken = g._getToken;
		const previousNotifyAdComplete = g._notifyAdComplete;
		const previousRecordAdDurations = g._recordAdDurations;
		const nativeProbe = vi.fn(async () => false);
		const tokenProbe = vi.fn(async () => {
			throw new Error("unexpected native token probe");
		});
		const info = setupCsaiEscapeAdEnd({
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			ExpectedAdPodLength: 1,
			LastCleanBackupAt: 598000,
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupCodec: "avc1.64002a",
			HevcReloadPendingAfterHold: true,
		});
		info.Urls = Object.assign(Object.create(null), {
			[NATIVE_URL]: {
				Resolution: "1920x1080",
				Codecs: "avc1.64002a",
			},
		});
		let backupSequence = 800;
		const refreshBackup = vi.fn(async () => {
			const refreshed = makePlaylist(backupSequence++, 3);
			info.LastCleanBackupM3U8 = refreshed;
			info.LastCleanBackupAt = Date.now();
			return refreshed;
		});
		g._canReloadNativePlayerAfterAd = nativeProbe;
		g._getToken = tokenProbe;
		g._refreshActiveBackupMediaPlaylist = refreshBackup;
		g._notifyAdComplete = () => Promise.resolve();
		g._recordAdDurations = () => {};

		try {
			const adMarkedPlayerPlaylist = [
				"#EXTM3U",
				"#EXT-X-MEDIA-SEQUENCE:99",
				'#EXT-X-DATERANGE:ID="stitched-ad-player-session",CLASS="twitch-stitched-ad"',
				"#EXTINF:2.000,live",
				"ad-session-99.ts",
			].join("\n");
			await processM3U8()(NATIVE_URL, adMarkedPlayerPlaylist, () =>
				Promise.reject(new Error("unexpected fetch")),
			);
			expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set([NATIVE_URL]));
			expect(info.NativeRecoveryAdMediaKey).toBe("live:testchannel");
			expect(info.NativeRecoveryAdStartedAt).toBe(info.VisibleAdStartedAt);
			info.Urls = Object.create(null);

			let visibleOutput = "";
			for (let index = 0; index < 8; index++) {
				vi.setSystemTime(600000 + index * 2000);
				visibleOutput = await processM3U8()(
					NATIVE_URL,
					makePlaylist(100 + index, 3),
					() => Promise.reject(new Error("unexpected fetch")),
				);
				expect(visibleOutput).not.toContain(`seg${100 + index}.ts`);
			}
			expect(info.IsHoldingBackupAfterAd).toBe(true);
			expect(visibleOutput).toContain("seg");
			expect(refreshBackup.mock.calls.length).toBeGreaterThan(0);

			let restoredOutput = "";
			for (let index = 0; index < 8; index++) {
				vi.setSystemTime(616000 + index * 2000);
				restoredOutput = await processM3U8()(
					NATIVE_URL,
					makePlaylist(200 + index, 3),
					() => Promise.reject(new Error("unexpected fetch")),
				);
				if (index < 7) {
					expect(restoredOutput).not.toContain(`seg${200 + index}.ts`);
				}
			}
			expect(restoredOutput).toContain("seg207.ts");
			expect(info.IsHoldingBackupAfterAd).toBe(false);
			expect(info.LastCleanNativeM3U8).toContain("seg207.ts");
			expect(info.LastCleanNativeUrl).toBe(NATIVE_URL);
			expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set());
			expect(nativeProbe).not.toHaveBeenCalled();
			expect(tokenProbe.mock.calls.some((call) => call[1] === "site")).toBe(
				false,
			);
			expect(
				sentMessages().find(
					(message) => message.key === "NativePlaybackRestored",
				),
			).toMatchObject({
				requiresReload: true,
				refreshAccessToken: false,
			});
		} finally {
			g._getToken = previousToken;
			g._notifyAdComplete = previousNotifyAdComplete;
			g._recordAdDurations = previousRecordAdDurations;
			vi.useRealTimers();
		}
	});

	it("keeps the hold when another token session cannot prove the player session", async () => {
		const ownedUrl = `${NATIVE_URL}?token=player-session`;
		const probedUrl = `${NATIVE_URL}?token=separate-site-session`;
		const previousNative = makePlaylist(90, 3);
		const previousNativeAt = Date.now() - 1000;
		const info = setupCsaiEscapeAdEnd({
			IsShowingAd: false,
			IsHoldingBackupAfterAd: true,
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			ExpectedAdPodLength: 1,
			HevcReloadPendingAfterHold: true,
			LastCleanNativeM3U8: previousNative,
			LastCleanNativeUrl: ownedUrl,
			LastCleanNativeCodec: "avc1.64002a",
			LastCleanNativePlaylistAt: previousNativeAt,
		});
		info.Urls = Object.assign(Object.create(null), {
			[ownedUrl]: {
				Resolution: "1920x1080",
				Codecs: "avc1.64002a",
			},
		});
		getState().StreamInfosByUrl = {
			[ownedUrl]: info,
			[probedUrl]: info,
		};
		const nativeProbe = vi.fn(async () => true);
		g._canReloadNativePlayerAfterAd = nativeProbe;

		const held = await processM3U8()(probedUrl, makePlaylist(500, 3), () =>
			Promise.reject(new Error("unexpected fetch")),
		);

		expect(held).toContain("seg50.ts");
		expect(held).not.toContain("seg500.ts");
		expect(nativeProbe).not.toHaveBeenCalled();
		expect(info.IsHoldingBackupAfterAd).toBe(true);
		expect(getState().CurrentAdMediaKey).toBe("live:testchannel");
		expect(info.LastCleanNativeM3U8).toBe(previousNative);
		expect(info.LastCleanNativeUrl).toBe(ownedUrl);
		expect(info.LastCleanNativePlaylistAt).toBe(previousNativeAt);
		expect(
			sentMessages().some(
				(message) => message.key === "NativePlaybackRestored",
			),
		).toBe(false);
	});

	it("does not let an unverified hold candidate replace exact native ownership", async () => {
		const ownedUrl = `${NATIVE_URL}?token=player`;
		const unownedUrl = `${NATIVE_URL}?token=fresh-session`;
		const preAdNative = makePlaylist(90, 3);
		const info = setupCsaiEscapeAdEnd({
			IsShowingAd: false,
			IsHoldingBackupAfterAd: true,
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			ExpectedAdPodLength: 1,
			LastCleanNativeM3U8: preAdNative,
			LastCleanNativeUrl: ownedUrl,
			LastCleanNativeCodec: "avc1.64002a",
			LastCleanNativePlaylistAt: Date.now() - 1000,
		});
		info.Urls = Object.assign(Object.create(null), {
			[ownedUrl]: {
				Resolution: "1920x1080",
				Codecs: "avc1.64002a",
			},
		});
		getState().StreamInfosByUrl = {
			[ownedUrl]: info,
			[unownedUrl]: info,
		};
		const previousProbe = g._canReloadNativePlayerAfterAd;
		const probe = vi.fn(async () => false);
		g._canReloadNativePlayerAfterAd = probe;

		try {
			for (let index = 0; index < 2; index++) {
				const out = await processM3U8()(
					unownedUrl,
					makePlaylist(500 + index, 3),
					() => Promise.reject(new Error("unexpected fetch")),
				);
				expect(out).toContain("seg50.ts");
			}
			expect(info.LastCleanNativeM3U8).toBe(preAdNative);
			expect(info.LastCleanNativeUrl).toBe(ownedUrl);
			expect(info.NativeRecoveryCandidateUrl).toBe(null);
			expect(probe).not.toHaveBeenCalled();
		} finally {
			g._canReloadNativePlayerAfterAd = previousProbe;
		}
	});

	it("rebuilds an owned modified stream without replacing its verified session", async () => {
		const ownedUrl = `${NATIVE_URL}?token=player-session`;
		const previousNative = makePlaylist(90, 3);
		const previousNativeAt = Date.now() - 1000;
		const info = setupCsaiEscapeAdEnd({
			IsShowingAd: false,
			IsHoldingBackupAfterAd: true,
			IsUsingModifiedM3U8: true,
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			ExpectedAdPodLength: 1,
			HevcReloadPendingAfterHold: true,
			LastCleanNativeM3U8: previousNative,
			LastCleanNativeUrl: ownedUrl,
			LastCleanNativeCodec: "avc1.64002a",
			LastCleanNativePlaylistAt: previousNativeAt,
		});
		info.Urls = Object.assign(Object.create(null), {
			[ownedUrl]: {
				Resolution: "1920x1080",
				Codecs: "avc1.64002a",
			},
		});
		getState().StreamInfosByUrl = { [ownedUrl]: info };
		const previousProbe = g._canReloadNativePlayerAfterAd;
		const probe = vi.fn(async () => true);
		g._canReloadNativePlayerAfterAd = probe;

		try {
			const restored = await processM3U8()(ownedUrl, makePlaylist(500, 3), () =>
				Promise.reject(new Error("unexpected fetch")),
			);

			expect(restored).toContain("seg500.ts");
			expect(probe).toHaveBeenCalledTimes(1);
			expect(info.IsHoldingBackupAfterAd).toBe(false);
			expect(info.LastCleanNativeM3U8).toBe(previousNative);
			expect(info.LastCleanNativeUrl).toBe(ownedUrl);
			expect(info.LastCleanNativePlaylistAt).toBe(previousNativeAt);
			expect(
				sentMessages().find(
					(message) => message.key === "NativePlaybackRestored",
				),
			).toMatchObject({
				requiresReload: true,
				refreshAccessToken: false,
			});
		} finally {
			g._canReloadNativePlayerAfterAd = previousProbe;
		}
	});

	it("refreshes a stale autoplay backup before entering an ended silent hold", async () => {
		const previousActiveRefresh = g._refreshActiveBackupMediaPlaylist;
		const previousAutoplayRefresh = g._refreshHeldAutoplayBackupPlaylist;
		const refreshedBackup = makePlaylist(90, 3);
		const activeRefresh = vi.fn(async () => null);
		const autoplayRefresh = vi.fn(async () => refreshedBackup);
		g._refreshActiveBackupMediaPlaylist = activeRefresh;
		g._refreshHeldAutoplayBackupPlaylist = autoplayRefresh;
		const info = setupCsaiEscapeAdEnd({
			ConsecutiveFailedNativeProbes: 6,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupAt: Date.now() - 2000,
		});
		g._canReloadNativePlayerAfterAd = async () => false;

		try {
			const out = await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
				Promise.reject(new Error("unexpected fetch")),
			);

			expect(autoplayRefresh).toHaveBeenCalledTimes(1);
			expect(activeRefresh).not.toHaveBeenCalled();
			expect(out).toContain("seg90.ts");
			expect(out).not.toContain("seg50.ts");
			expect(info.IsHoldingBackupAfterAd).toBe(true);
		} finally {
			g._refreshActiveBackupMediaPlaylist = previousActiveRefresh;
			g._refreshHeldAutoplayBackupPlaylist = previousAutoplayRefresh;
		}
	});

	it("serves an advancing empty hold when a stale ended backup cannot refresh", async () => {
		const previousActiveRefresh = g._refreshActiveBackupMediaPlaylist;
		const activeRefresh = vi.fn(async () => null);
		const findBackup = vi.fn(async () => ({ type: null, m3u8: null }));
		g._refreshActiveBackupMediaPlaylist = activeRefresh;
		g._findBackupStream = findBackup;
		const info = setupCsaiEscapeAdEnd({
			ConsecutiveFailedNativeProbes: 6,
			LastCleanBackupAt: Date.now() - 2000,
		});
		g._canReloadNativePlayerAfterAd = async () => false;

		try {
			const first = await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
				Promise.reject(new Error("unexpected fetch")),
			);
			const second = await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
				Promise.reject(new Error("unexpected fetch")),
			);

			expect(first).toContain("__ttvab_empty_hold_segment.mp4");
			expect(first).toContain("#EXT-X-MEDIA-SEQUENCE:101");
			expect(second).toContain("#EXT-X-MEDIA-SEQUENCE:102");
			expect(first).not.toContain("seg50.ts");
			expect(info.IsUsingBackupStream).toBe(false);
			expect(activeRefresh).toHaveBeenCalledTimes(2);
			expect(findBackup).toHaveBeenCalledTimes(2);
		} finally {
			g._refreshActiveBackupMediaPlaylist = previousActiveRefresh;
		}
	});

	it("reloads after a same-resolution autoplay hold because its timeline is independent", async () => {
		const info = setupCsaiEscapeAdEnd({
			ConsecutiveFailedNativeProbes: 6,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			ActiveBackupResolution: "1920x1080",
			SustainedNativeResolution: { Resolution: "1920x1080", Name: "1080p60" },
		});
		g._canReloadNativePlayerAfterAd = async () => false;

		await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
			Promise.reject(new Error("unexpected fetch")),
		);

		expect(info.IsHoldingBackupAfterAd).toBe(true);
		expect(info.HevcReloadPendingAfterHold).toBe(true);
	});

	it("still reloads a same-resolution autoplay hold when the backup codec is unknown", async () => {
		const info = setupCsaiEscapeAdEnd({
			ConsecutiveFailedNativeProbes: 6,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			ActiveBackupResolution: "2560x1440",
			SustainedNativeResolution: {
				Resolution: "2560x1440",
				Name: "chunked",
				Codecs: "hev1.1.6.L153.B0",
			},
		});
		g._canReloadNativePlayerAfterAd = async () => false;

		await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
			Promise.reject(new Error("unexpected fetch")),
		);

		expect(info.IsHoldingBackupAfterAd).toBe(true);
		expect(info.HevcReloadPendingAfterHold).toBe(true);
	});

	it("reloads a same-family enhanced autoplay hold before native playback", async () => {
		const info = setupCsaiEscapeAdEnd({
			ConsecutiveFailedNativeProbes: 6,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupCodecFamily: "hevc",
			LastCleanBackupCodec: "hev1.1.6.l153.b0",
			EnhancedDecoderCodecFamily: "hevc",
			EnhancedDecoderCodec: "hev1.1.6.L153.B0",
			ActiveBackupResolution: "2560x1440",
			SustainedNativeResolution: {
				Resolution: "2560x1440",
				Name: "chunked",
				Codecs: "hev1.1.6.L153.B0",
			},
		});
		g._canReloadNativePlayerAfterAd = async () => false;

		await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
			Promise.reject(new Error("unexpected fetch")),
		);

		expect(info.IsHoldingBackupAfterAd).toBe(true);
		expect(info.HevcReloadPendingAfterHold).toBe(true);
	});

	it("still reloads after the hold when the autoplay backup was below native quality", async () => {
		const info = setupCsaiEscapeAdEnd({
			ConsecutiveFailedNativeProbes: 6,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			ActiveBackupResolution: "640x360",
			SustainedNativeResolution: { Resolution: "1920x1080", Name: "1080p60" },
		});
		g._canReloadNativePlayerAfterAd = async () => false;

		await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
			Promise.reject(new Error("unexpected fetch")),
		);

		expect(info.IsHoldingBackupAfterAd).toBe(true);
		expect(info.HevcReloadPendingAfterHold).toBe(true);
	});

	it("reloads after the hold when the held autoplay resolution is unknown", async () => {
		const info = setupCsaiEscapeAdEnd({
			ConsecutiveFailedNativeProbes: 6,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			ActiveBackupResolution: null,
			SustainedNativeResolution: { Resolution: "1920x1080", Name: "1080p60" },
		});
		g._canReloadNativePlayerAfterAd = async () => false;

		await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
			Promise.reject(new Error("unexpected fetch")),
		);

		expect(info.IsHoldingBackupAfterAd).toBe(true);
		expect(info.HevcReloadPendingAfterHold).toBe(true);
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

	it("still reloads after a recent silent-hold continuation marker", async () => {
		const info = setupCsaiEscapeAdEnd({
			LastAdEndReloadAt: Date.now() - 19000,
			LastAdEndReloadKind: null,
		});
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
		expect(info.PostEscapeReloadCounterproductive).toBe(false);
		expect(out).toContain("seg100.ts");
	});

	it("downgrades a post-escape reload to pause/resume once it has proven counterproductive, then clears the lesson on the settled break", async () => {
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
		expect(info.PostEscapeReloadCounterproductive).toBe(false);
		expect(out).toContain("seg100.ts");
	});

	it("keeps the lesson latched while the midroll chain is still active", async () => {
		const info = setupCsaiEscapeAdEnd({
			PostEscapeReloadCounterproductive: true,
			LastAdEndReloadAt: Date.now() - 5000,
			LastAdEndReloadKind: "post-escape",
		});
		g._canReloadNativePlayerAfterAd = async () => true;

		await processM3U8()(NATIVE_URL, makePlaylist(100, 3), () =>
			Promise.reject(new Error("unexpected fetch")),
		);

		expect(info.PostEscapeReloadCounterproductive).toBe(true);
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

	function adMarkedPlaylist(mediaSeq: number) {
		return [
			"#EXTM3U",
			`#EXT-X-MEDIA-SEQUENCE:${mediaSeq}`,
			'#EXT-X-DATERANGE:ID="stitched-ad-reload",CLASS="twitch-stitched-ad"',
			"#EXTINF:2.000,live",
			`ad-${mediaSeq}.ts`,
		].join("\n");
	}

	function setup() {
		g.postMessage = () => {};
		g._postWorkerBridgeMessage = () => {};
		g._createPageScopedWorkerEvent = (value: unknown) => value;
		g._notifyAdComplete = () => Promise.resolve();
		g._recordAdDurations = () => {};
		const info = makeInfo({
			MediaKey: "live:chana",
			ChannelName: "chana",
			LastPlayerReload: 0,
		});
		getState().StreamInfosByUrl = { [URL_A]: info };
		getState().HasTriggeredPlayerReload = false;
		getState().PendingTriggeredPlayerReloadChannel = null;
		getState().PendingTriggeredPlayerReloadMediaKey = null;
		getState().PendingTriggeredPlayerReloadAt = 0;
		getState().PendingTriggeredPlayerReloadCycleStartedAt = 0;
		return info;
	}

	function armPendingReload(
		mediaKey: string,
		channel: string,
		cycleStartedAt = 0,
	) {
		getState().HasTriggeredPlayerReload = true;
		getState().PendingTriggeredPlayerReloadMediaKey = mediaKey;
		getState().PendingTriggeredPlayerReloadChannel = channel;
		getState().PendingTriggeredPlayerReloadAt = 1000;
		getState().PendingTriggeredPlayerReloadCycleStartedAt = cycleStartedAt;
	}

	it("does not consume a pending reload flagged for a different stream", async () => {
		const info = setup();
		armPendingReload("live:chanb", "chanb");

		await processM3U8()(URL_A, cleanPlaylist(100), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(getState().HasTriggeredPlayerReload).toBe(true);
		expect(getState().PendingTriggeredPlayerReloadMediaKey).toBe("live:chanb");
		expect(info.LastPlayerReload).toBe(0);
	});

	it("does not consume or confirm a matching reload from a clean backup URL", async () => {
		const info = setup();
		(info.BackupVariantUrls as Set<string>).add(URL_A);
		const postMessage = vi.fn();
		g._postWorkerBridgeMessage = postMessage;
		armPendingReload("live:chana", "chana", 100);

		await processM3U8()(URL_A, cleanPlaylist(100), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(getState().HasTriggeredPlayerReload).toBe(true);
		expect(getState().PendingTriggeredPlayerReloadAt).toBe(1000);
		expect(postMessage).not.toHaveBeenCalled();
		expect(info.LastPlayerReload).toBe(0);
	});

	it("consumes the pending reload for the matching stream", async () => {
		const info = setup();
		declareAvcPlaybackUrl(info, URL_A);
		const postMessage = vi.fn();
		g._postWorkerBridgeMessage = postMessage;
		const previousCycleCurrent = g._isPageLifecycleCycleCurrent;
		const cycleCurrent = vi.fn(() => true);
		g._isPageLifecycleCycleCurrent = cycleCurrent;
		armPendingReload("live:chana", "chana", 100);
		info.NativeRecoveryLoaderEpoch = 4;
		info.NativeRecoveryAdPlaylistUrls = new Set([URL_A]);
		info.NativeRecoveryAdMediaKey = "live:chana";
		info.NativeRecoveryAdStartedAt = 100;
		info.NativeRecoveryCandidateUrl = URL_A;
		info.NativeRecoveryCandidateMediaKey = "live:chana";
		info.NativeRecoveryCandidateCycleStartedAt = 100;
		info.NativeRecoveryCandidateStage = "hold";
		info.NativeRecoveryCandidateCleanCount = 6;
		info.NativeRecoveryProbeStreamUrl = `${URL_A}?probe=site`;
		info.NativeRecoveryProbeMediaKey = "live:chana";
		info.NativeRecoveryProbeCycleStartedAt = 100;
		info.PendingAdEndAt = 100;
		info.CleanPlaylistCount = 6;
		info._IncompletePodCleanStartedAt = 100;
		info._IncompletePodCleanPlaylistCount = 6;
		info._IncompletePodLastMediaSequence = 300;
		info._IncompletePodCandidateUrl = URL_A;
		const previousProbeEpoch = Number(info.NativeRecoveryProbeEpoch) || 0;

		try {
			await processM3U8()(URL_A, cleanPlaylist(100), () =>
				Promise.reject(new Error("no fetch expected")),
			);
		} finally {
			if (previousCycleCurrent === undefined) {
				delete g._isPageLifecycleCycleCurrent;
			} else {
				g._isPageLifecycleCycleCurrent = previousCycleCurrent;
			}
		}

		expect(cycleCurrent).toHaveBeenCalledWith("live:chana", 100);
		expect(getState().HasTriggeredPlayerReload).toBe(false);
		expect(getState().PendingTriggeredPlayerReloadMediaKey).toBe(null);
		expect(postMessage).toHaveBeenCalledWith(
			g,
			expect.objectContaining({
				key: "PostAdNativeReloadReady",
				mediaKey: "live:chana",
				cycleStartedAt: 100,
				reloadAt: 1000,
				loaderEpoch: 4,
			}),
		);
		expect(info.LastPlayerReload).toBeGreaterThan(0);
		expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set());
		expect(info.NativeRecoveryAdMediaKey).toBe(null);
		expect(info.NativeRecoveryAdStartedAt).toBe(0);
		expect(info.NativeRecoveryCandidateUrl).toBe(null);
		expect(info.NativeRecoveryProbeStreamUrl).toBe(null);
		expect(info.NativeRecoveryProbeEpoch).toBe(previousProbeEpoch + 1);
		expect(info.NativeRecoveryLoaderEpoch).toBe(4);
		expect(info.PendingAdEndAt).toBe(0);
		expect(info.CleanPlaylistCount).toBe(0);
		expect(info._IncompletePodCleanStartedAt).toBe(0);
		expect(info._IncompletePodCleanPlaylistCount).toBe(0);
		expect(info._IncompletePodLastMediaSequence).toBe(null);
		expect(info._IncompletePodCandidateUrl).toBe(null);
	});

	it("does not confirm a matching reload from an ad-marked native response", async () => {
		const info = setup();
		declareAvcPlaybackUrl(info, URL_A);
		const postMessage = vi.fn();
		g._postWorkerBridgeMessage = postMessage;
		const previousCycleCurrent = g._isPageLifecycleCycleCurrent;
		g._isPageLifecycleCycleCurrent = () => true;
		g._findBackupStream = () => Promise.resolve(null);
		armPendingReload("live:chana", "chana", 100);

		try {
			await processM3U8()(URL_A, adMarkedPlaylist(300), () =>
				Promise.reject(new Error("no fetch expected")),
			);
		} finally {
			if (previousCycleCurrent === undefined) {
				delete g._isPageLifecycleCycleCurrent;
			} else {
				g._isPageLifecycleCycleCurrent = previousCycleCurrent;
			}
		}

		expect(getState().HasTriggeredPlayerReload).toBe(false);
		expect(getState().PendingTriggeredPlayerReloadMediaKey).toBe(null);
		expect(
			postMessage.mock.calls.some(
				([, message]) =>
					(message as Record<string, unknown>)?.key ===
					"PostAdNativeReloadReady",
			),
		).toBe(false);
	});

	it("consumes a stale-cycle reload without invalidating current proof", async () => {
		const info = setup();
		const previousCycleCurrent = g._isPageLifecycleCycleCurrent;
		g._isPageLifecycleCycleCurrent = () => false;
		info.IsShowingAd = true;
		info.VisibleAdStartedAt = 100;
		info.NativeRecoveryLoaderEpoch = 4;
		info.NativeRecoveryAdPlaylistUrls = new Set([URL_A]);
		info.NativeRecoveryAdMediaKey = "live:chana";
		info.NativeRecoveryAdStartedAt = 100;
		info.NativeRecoveryCandidateUrl = URL_A;
		info.NativeRecoveryCandidateMediaKey = "live:chana";
		info.NativeRecoveryCandidateCycleStartedAt = 100;
		info.NativeRecoveryCandidateStage = "visible";
		activateExactAdCycle(info, 100);
		armPendingReload("live:chana", "chana", 99);

		try {
			await processM3U8()(URL_A, "#EXTM3U\n#EXT-X-VERSION:7", () =>
				Promise.reject(new Error("no fetch expected")),
			);

			expect(getState().HasTriggeredPlayerReload).toBe(false);
			expect(info.LastPlayerReload).toBe(0);
			expect(info.NativeRecoveryLoaderEpoch).toBe(4);
			expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set([URL_A]));
		} finally {
			if (previousCycleCurrent === undefined) {
				delete g._isPageLifecycleCycleCurrent;
			} else {
				g._isPageLifecycleCycleCurrent = previousCycleCurrent;
			}
		}
	});

	it("rejects media responses started before the loader epoch changed", async () => {
		const info = setup();
		info.IsShowingAd = true;
		info.VisibleAdStartedAt = 100;
		info.NativeRecoveryLoaderEpoch = 1;
		declareAvcPlaybackUrl(info, URL_A);
		activateExactAdCycle(info, 100);
		const core =
			T<
				(
					url: string,
					text: string,
					realFetch: (...args: unknown[]) => Promise<unknown>,
					context: Record<string, unknown>,
				) => Promise<string>
			>("_processM3U8Core");
		const context = {
			requestStartMediaKey: "live:chana",
			requestStartCycleStartedAt: 100,
			backupSearchEpoch: Number(info.BackupSearchEpoch) || 0,
			cycleStartedAt: 100,
			loaderEpoch: 0,
		};

		await expect(
			core(
				URL_A,
				adMarkedPlaylist(300),
				() => Promise.reject(new Error("no fetch expected")),
				context,
			),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set());

		await core(
			URL_A,
			adMarkedPlaylist(301),
			() => Promise.reject(new Error("no fetch expected")),
			{
				...context,
				requestStartMediaKey: "live:other",
				loaderEpoch: 1,
			},
		);
		expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set());

		await core(
			URL_A,
			adMarkedPlaylist(302),
			() => Promise.reject(new Error("no fetch expected")),
			{ ...context, loaderEpoch: 1 },
		);
		expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set([URL_A]));
	});

	it("threads the captured loader epoch through the media wrapper", async () => {
		const info = setup();
		info.IsHoldingBackupAfterAd = true;
		info.VisibleAdStartedAt = 100;
		info.NativeRecoveryLoaderEpoch = 2;
		info.LastCleanNativeM3U8 = cleanPlaylist(90);
		info.LastCleanNativeUrl = URL_A;
		info.LastCleanNativePlaylistAt = 1000;
		declareAvcPlaybackUrl(info, URL_A);
		activateExactAdCycle(info, 100);
		g._postWorkerBridgeMessage = vi.fn();
		const wrapper =
			T<
				(
					url: string,
					text: string,
					realFetch: (...args: unknown[]) => Promise<unknown>,
					requestSignal: AbortSignal | null,
					requestStartContext: Record<string, unknown>,
				) => Promise<string>
			>("_processM3U8");

		await expect(
			wrapper(
				URL_A,
				cleanPlaylist(300),
				() => Promise.reject(new Error("no fetch expected")),
				null,
				{
					mediaKey: "live:chana",
					loaderEpoch: 1,
					backupSearchEpoch: Number(info.BackupSearchEpoch) || 0,
					cycleStartedAt: 100,
				},
			),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(info.LastCleanNativeM3U8).toBe(cleanPlaylist(90));
		expect(info.NativeRecoveryCandidateUrl).toBe(null);
		expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set());
		expect(
			(g._postWorkerBridgeMessage as ReturnType<typeof vi.fn>).mock.calls,
		).toHaveLength(0);
	});

	it("advances the loader epoch before clearing recovery proof", () => {
		const info = setup();
		info.NativeRecoveryLoaderEpoch = 4;
		info.NativeRecoveryAdPlaylistUrls = new Set([URL_A]);
		info.NativeRecoveryAdMediaKey = "live:chana";
		info.NativeRecoveryAdStartedAt = 100;
		info.NativeRecoveryCandidateUrl = URL_A;
		info.NativeRecoveryCandidateMediaKey = "live:chana";
		info.NativeRecoveryCandidateCycleStartedAt = 100;
		info.NativeRecoveryCandidateStage = "hold";
		info.NativeRecoveryCandidateCleanCount = 6;
		info.NativeRecoveryProbeStreamUrl = `${URL_A}?probe=site`;
		info.NativeRecoveryProbeMediaKey = "live:chana";
		info.NativeRecoveryProbeCycleStartedAt = 100;
		info.PendingAdEndAt = 90;
		info.CleanPlaylistCount = 6;
		info._IncompletePodCleanStartedAt = 80;
		info._IncompletePodCleanPlaylistCount = 6;
		info._IncompletePodLastMediaSequence = 300;
		info._IncompletePodCandidateUrl = URL_A;

		const epoch = T<
			(info: Record<string, unknown>, advanceLoaderEpoch?: boolean) => number
		>("_invalidateNativeRecoveryAfterPlayerReload")(info, true);

		expect(epoch).toBe(5);
		expect(info.NativeRecoveryLoaderEpoch).toBe(5);
		expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set());
		expect(info.NativeRecoveryAdMediaKey).toBe(null);
		expect(info.NativeRecoveryAdStartedAt).toBe(0);
		expect(info.NativeRecoveryCandidateUrl).toBe(null);
		expect(info.NativeRecoveryCandidateMediaKey).toBe(null);
		expect(info.NativeRecoveryCandidateCycleStartedAt).toBe(0);
		expect(info.NativeRecoveryCandidateStage).toBe(null);
		expect(info.NativeRecoveryCandidateCleanCount).toBe(0);
		expect(info.NativeRecoveryProbeStreamUrl).toBe(null);
		expect(info.NativeRecoveryProbeMediaKey).toBe(null);
		expect(info.NativeRecoveryProbeCycleStartedAt).toBe(0);
		expect(info.PendingAdEndAt).toBe(0);
		expect(info.CleanPlaylistCount).toBe(0);
		expect(info._IncompletePodCleanStartedAt).toBe(0);
		expect(info._IncompletePodCleanPlaylistCount).toBe(0);
		expect(info._IncompletePodLastMediaSequence).toBe(null);
		expect(info._IncompletePodCandidateUrl).toBe(null);
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
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupCodec: TEST_AVC_RESOLUTION.Codecs.toLowerCase(),
			ActiveBackupPlayerType: "site",
			LastCleanBackupAt: now - backupAtOffsetMs,
		});
		info.NativeRecoveryCleanCount = 2;
		info.NativeRecoveryProbeStreamUrl =
			"https://edge.example/native-recovery.m3u8";
		info.NativeRecoveryProbeMediaKey = info.MediaKey;
		info.NativeRecoveryProbePlayerType = "site";
		info.NativeRecoveryProbeCycleStartedAt = info.VisibleAdStartedAt;
		info.NativeRecoveryProbeLastMediaSequence = 500;
		info.NativeRecoveryProbeLastAdvancedAt = now;
		declareAvcPlaybackUrl(info, NATIVE_URL);
		rememberBackupPlaylistMetadata(
			info,
			String(info.LastCleanBackupM3U8),
			"avc",
			TEST_AVC_RESOLUTION.Codecs,
		);
		getState().StreamInfosByUrl = { [NATIVE_URL]: info };
		activateExactAdCycle(info, Number(info.VisibleAdStartedAt));
		return info;
	}

	it("marks IsUsingBackupStream and serves a fresh cached backup on an ad-end bounce", async () => {
		const info = setupBounce(0);

		const out = await processM3U8()(NATIVE_URL, adMarkedNative(), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(info.IsUsingBackupStream).toBe(true);
		expect(out).toContain("seg50.ts");
		expect(info.NativeRecoveryCleanCount).toBe(0);
		expect(info.NativeRecoveryProbeStreamUrl).toBe(
			"https://edge.example/native-recovery.m3u8",
		);
		expect(info.NativeRecoveryProbeMediaKey).toBe("live:testchannel");
		expect(info.NativeRecoveryProbePlayerType).toBe("site");
		expect(info.NativeRecoveryProbeCycleStartedAt).toBe(
			info.VisibleAdStartedAt,
		);
		expect(info.NativeRecoveryProbeLastMediaSequence).toBe(500);
		expect(info.NativeRecoveryProbeLastAdvancedAt).toBeGreaterThan(0);
	});

	it("does not serve a stale cached backup on an ad-end bounce", async () => {
		const info = setupBounce(20000);

		const out = await processM3U8()(NATIVE_URL, adMarkedNative(), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(info.IsUsingBackupStream).toBe(false);
		expect(out).not.toContain("seg50.ts");
		expect(info.NativeRecoveryCleanCount).toBe(0);
		expect(info.NativeRecoveryProbeStreamUrl).toBe(
			"https://edge.example/native-recovery.m3u8",
		);
		expect(info.NativeRecoveryProbeMediaKey).toBe("live:testchannel");
		expect(info.NativeRecoveryProbePlayerType).toBe("site");
		expect(info.NativeRecoveryProbeCycleStartedAt).toBe(
			info.VisibleAdStartedAt,
		);
		expect(info.NativeRecoveryProbeLastMediaSequence).toBe(500);
		expect(info.NativeRecoveryProbeLastAdvancedAt).toBeGreaterThan(0);
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

	function setupHold(overrides: Record<string, unknown> = {}) {
		g.postMessage = () => {};
		g._postWorkerBridgeMessage = () => {};
		g._createPageScopedWorkerEvent = (value: unknown) => value;
		g._notifyAdComplete = () => Promise.resolve();
		const now = Date.now();
		const info = makeInfo({
			IsHoldingBackupAfterAd: true,
			VisibleAdStartedAt: now - 10000,
			SilentBackupHoldStartedAt: now,
			LastSilentBackupHoldLogAt: now,
			LastCleanBackupM3U8: makePlaylist(50, 3),
			LastCleanBackupPlayerType: "site",
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupCodec: TEST_AVC_RESOLUTION.Codecs.toLowerCase(),
			ActiveBackupPlayerType: "site",
			LastCleanBackupAt: now,
			...overrides,
		});
		const backupCodecFamily = String(info.LastCleanBackupCodecFamily || "avc");
		const backupCodec = String(
			info.LastCleanBackupCodec || TEST_AVC_RESOLUTION.Codecs,
		);
		if (backupCodecFamily === "hevc") {
			declareHevcPlaybackUrl(info, NATIVE_URL);
		} else {
			declareAvcPlaybackUrl(info, NATIVE_URL);
		}
		rememberBackupPlaylistMetadata(
			info,
			String(info.LastCleanBackupM3U8),
			backupCodecFamily,
			backupCodec,
		);
		getState().StreamInfosByUrl = { [NATIVE_URL]: info };
		activateExactAdCycle(info, Number(info.VisibleAdStartedAt));
		return info;
	}

	it("keeps the backup through an incomplete declared pod and restores only after stable confirmation", async () => {
		const info = setupHold({
			PendingAdEndAt: Date.now() - 5000,
			CleanPlaylistCount: 2,
			ExpectedAdPodLength: 2,
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			EnhancedDecoderCodecFamily: "hevc",
			EnhancedDecoderCodec: "hev1.1.6.L153.B0",
			LastCleanBackupCodecFamily: "hevc",
			LastCleanBackupCodec: "hev1.1.6.l153.b0",
			ActiveBackupResolution: "2560x1440",
		});
		g._postWorkerBridgeMessage = vi.fn();
		const previousNativeProbe = g._canReloadNativePlayerAfterAd;
		const nativeProbe = vi.fn(async () => true);
		g._canReloadNativePlayerAfterAd = nativeProbe;
		const cleanNative = makePlaylist(300, 3);

		try {
			const held = await processM3U8()(NATIVE_URL, cleanNative, () =>
				Promise.reject(new Error("no fetch expected")),
			);

			expect(held).toContain("seg50.ts");
			expect(info.IsHoldingBackupAfterAd).toBe(true);
			expect(info.ExpectedAdPodLength).toBe(2);
			expect(
				(
					g._postWorkerBridgeMessage as ReturnType<typeof vi.fn>
				).mock.calls.some(
					(call) =>
						(call[1] as Record<string, unknown>)?.key ===
						"NativePlaybackRestored",
				),
			).toBe(false);

			(info.ObservedAdPodIds as Set<string>).add("stitched-ad-2");
			let restored = await processM3U8()(NATIVE_URL, cleanNative, () =>
				Promise.reject(new Error("no fetch expected")),
			);
			info.NativeRecoveryCandidateStartedAt = Date.now() - 11000;
			for (let index = 1; index < 8; index++) {
				restored = await processM3U8()(
					NATIVE_URL,
					makePlaylist(300 + index, 3),
					() => Promise.reject(new Error("no fetch expected")),
				);
			}

			expect(restored).toContain("seg307.ts");
			expect(info.IsHoldingBackupAfterAd).toBe(false);
			expect(nativeProbe).not.toHaveBeenCalled();
			expect(
				(
					g._postWorkerBridgeMessage as ReturnType<typeof vi.fn>
				).mock.calls.some(
					(call) =>
						(call[1] as Record<string, unknown>)?.key ===
						"NativePlaybackRestored",
				),
			).toBe(true);
			expect(
				(
					g._postWorkerBridgeMessage as ReturnType<typeof vi.fn>
				).mock.calls.find(
					(call) =>
						(call[1] as Record<string, unknown>)?.key ===
						"NativePlaybackRestored",
				)?.[1],
			).toMatchObject({ requiresReload: false });
		} finally {
			g._canReloadNativePlayerAfterAd = previousNativeProbe;
		}
	});

	it("refreshes a stale backup while a clean native poll is still awaiting pod completion", async () => {
		const refreshedBackup = makePlaylist(90, 3);
		const info = setupHold({
			PendingAdEndAt: Date.now() - 5000,
			CleanPlaylistCount: 2,
			ExpectedAdPodLength: 2,
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			LastCleanBackupAt: Date.now() - 1000,
		});
		const refreshSpy = vi.fn(async () => refreshedBackup);
		g._refreshActiveBackupMediaPlaylist = refreshSpy;
		g._canReloadNativePlayerAfterAd = async () => true;

		const out = await processM3U8()(NATIVE_URL, makePlaylist(300, 3), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(refreshSpy).toHaveBeenCalledTimes(1);
		expect(out).toContain("seg90.ts");
		expect(out).not.toContain("seg300.ts");
		expect(info.IsHoldingBackupAfterAd).toBe(true);
	});

	it("keeps the fresh autoplay bridge flowing while foreground quality probing starts", async () => {
		const state = getState();
		const saved = {
			pageMediaKey: state.PageMediaKey,
			visibleSinceAt: state.PagePlaybackVisibleSinceAt,
			preferredQualityGroup: state.PreferredQualityGroup,
			startForegroundProbe: g._startForegroundQualityProbe,
		};
		const now = Date.now();
		const startForegroundProbe = vi.fn(() => true);
		g._startForegroundQualityProbe = startForegroundProbe;
		const info = setupHold({
			VisibleAdStartedAt: now - 10000,
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupAt: now,
			BackupEncodingsM3U8Cache: {
				autoplay: [
					"#EXTM3U",
					"#EXT-X-STREAM-INF:RESOLUTION=640x360",
					"https://cdn.example/autoplay-360.m3u8",
				].join("\n"),
			},
		});
		const lowRequestedResolution = {
			Name: "360p",
			Resolution: "640x360",
			FrameRate: 30,
			Codecs: TEST_AVC_RESOLUTION.Codecs,
		};
		info.Urls = { [NATIVE_URL]: lowRequestedResolution };
		info.ResolutionList = [TEST_AVC_RESOLUTION, lowRequestedResolution];
		info.SustainedNativeResolution = TEST_AVC_RESOLUTION;
		Object.assign(state, {
			PageMediaKey: "live:testchannel",
			PagePlaybackVisibleSinceAt: now - 100,
			PreferredQualityGroup: null,
		});

		try {
			const out = await processM3U8()(NATIVE_URL, adMarkedNative(), () =>
				Promise.reject(new Error("no fetch expected")),
			);

			expect(startForegroundProbe).toHaveBeenCalledOnce();
			expect(startForegroundProbe.mock.calls[0]?.[0]).toBe(info);
			expect(startForegroundProbe.mock.calls[0]?.[1]).toEqual(
				expect.any(Function),
			);
			expect(startForegroundProbe.mock.calls[0]?.[2]).toEqual(
				TEST_AVC_RESOLUTION,
			);
			expect(out).toContain("seg50.ts");
			expect(out).not.toContain("native-live-300.ts");
			expect(info.IsHoldingBackupAfterAd).toBe(true);
		} finally {
			state.PageMediaKey = saved.pageMediaKey;
			state.PagePlaybackVisibleSinceAt = saved.visibleSinceAt;
			state.PreferredQualityGroup = saved.preferredQualityGroup;
			g._startForegroundQualityProbe = saved.startForegroundProbe;
		}
	});

	it("never exits a silent hold into an ad-marked native playlist at the hold limit", async () => {
		const previousMax = getState().SilentBackupHoldMaxMs;
		getState().SilentBackupHoldMaxMs = 1000;
		const info = setupHold({
			SilentBackupHoldStartedAt: Date.now() - 5000,
			LastSilentBackupHoldLogAt: 0,
		});
		try {
			const out = await processM3U8()(NATIVE_URL, adMarkedNative(), () =>
				Promise.reject(new Error("no fetch expected")),
			);

			expect(out).toContain("seg50.ts");
			expect(out).not.toContain("native-live-300.ts");
			expect(info.IsHoldingBackupAfterAd).toBe(true);
		} finally {
			getState().SilentBackupHoldMaxMs = previousMax;
		}
	});

	it("resets clean recovery evidence but keeps the exact probe session during the hold", async () => {
		const info = setupHold({
			VisibleAdStartedAt: 100,
			PendingAdEndAt: Date.now() - 5000,
			CleanPlaylistCount: 4,
			NativeRecoveryCleanCount: 2,
			AdEndConfirmEscalation: 1,
			NativeRecoveryProbeStreamUrl: "https://edge.example/native-recovery.m3u8",
			NativeRecoveryProbeMediaKey: "live:testchannel",
			NativeRecoveryProbePlayerType: "site",
			NativeRecoveryProbeCycleStartedAt: 100,
			NativeRecoveryProbeLastMediaSequence: 500,
			NativeRecoveryProbeLastAdvancedAt: Date.now(),
		});
		activateExactAdCycle(info, 100);

		const out = await processM3U8()(NATIVE_URL, adMarkedNative(), () =>
			Promise.reject(new Error("no fetch expected")),
		);

		expect(out).toContain("seg50.ts");
		expect(info.PendingAdEndAt).toBe(0);
		expect(info.CleanPlaylistCount).toBe(0);
		expect(info.NativeRecoveryCleanCount).toBe(0);
		expect(info.NativeRecoveryProbeStreamUrl).toBe(
			"https://edge.example/native-recovery.m3u8",
		);
		expect(info.NativeRecoveryProbeMediaKey).toBe("live:testchannel");
		expect(info.NativeRecoveryProbePlayerType).toBe("site");
		expect(info.NativeRecoveryProbeCycleStartedAt).toBe(100);
		expect(info.NativeRecoveryProbeLastMediaSequence).toBe(500);
		expect(info.NativeRecoveryProbeLastAdvancedAt).toBeGreaterThan(0);
		expect(info.AdEndConfirmEscalation).toBe(2);
		expect(info.IsHoldingBackupAfterAd).toBe(true);
	});

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

	it("refreshes stale autoplay media without rerunning the candidate sweep", async () => {
		const previousAutoplayRefresh = g._refreshHeldAutoplayBackupPlaylist;
		const refreshed = makePlaylist(90, 3);
		const autoplayRefresh = vi.fn(async () => refreshed);
		const search = vi.fn(async () => ({
			type: "embed",
			m3u8: makePlaylist(80, 3),
		}));
		g._refreshHeldAutoplayBackupPlaylist = autoplayRefresh;
		g._findBackupStream = search;
		const info = setupHold({
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
		});
		info.LastCleanBackupAt = Date.now() - 3000;
		try {
			const out = await processM3U8()(NATIVE_URL, adMarkedNative(), () =>
				Promise.reject(new Error("no fetch expected")),
			);

			expect(autoplayRefresh).toHaveBeenCalledTimes(1);
			expect(search).not.toHaveBeenCalled();
			expect(out).toContain("seg90.ts");
		} finally {
			g._refreshHeldAutoplayBackupPlaylist = previousAutoplayRefresh;
		}
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
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupCodec: TEST_AVC_RESOLUTION.Codecs.toLowerCase(),
			ActiveBackupPlayerType: "site",
			LastCleanBackupAt: now,
		});
		declareAvcPlaybackUrl(info, NATIVE_URL);
		rememberBackupPlaylistMetadata(
			info,
			String(info.LastCleanBackupM3U8),
			"avc",
			TEST_AVC_RESOLUTION.Codecs,
		);
		getState().StreamInfosByUrl = { [NATIVE_URL]: info };
		getState().LastAdEndedAt = now;
		getState().BackupSearchForceRefreshAt = 0;
		activateExactAdCycle(info, Number(info.VisibleAdStartedAt));
		return info;
	}

	it("serves the cached backup without any fetch when it is under 2s old", async () => {
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

		expect(refreshSpy).not.toHaveBeenCalled();
		expect(searchSpy).not.toHaveBeenCalled();
		expect(out).toContain("seg50.ts");
		expect(info.IsUsingBackupStream).toBe(true);
	});

	it("serves the active backup via the cheap refresh (no full re-search) once the cache is stale", async () => {
		const info = setupReentry();
		info.LastCleanBackupAt = Date.now() - 3000;
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

	it("consumes the stall flag, cools the stalled type, and rotates via the full search", async () => {
		const info = setupReentry();
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

		expect(refreshSpy).not.toHaveBeenCalled();
		expect(searchSpy).toHaveBeenCalled();
		expect(out).toContain("seg80.ts");
		expect(getState().BackupSearchForceRefreshAt).toBe(0);
		expect(Number(info.FailedBackupPlayerTypes.get("site"))).toBeGreaterThan(
			Date.now(),
		);
	});
});

describe("_processM3U8 rapid reentry cycle ownership", () => {
	const mediaUrl =
		"https://video-weaver.example.ttvnw.net/v1/playlist/rapid-reentry.m3u8";
	const avcResolution = {
		Name: "1080p60",
		Resolution: "1920x1080",
		FrameRate: 60,
		Codecs: "avc1.64002A,mp4a.40.2",
	};
	const adPlaylist = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		"#EXT-X-MEDIA-SEQUENCE:600",
		'#EXT-X-DATERANGE:ID="stitched-ad-rapid",CLASS="twitch-stitched-ad"',
		"#EXTINF:2.000,Amazon",
		"https://edge.example/stitched-ad-rapid-600.ts",
	].join("\n");
	const fetchStub = async () => new Response(null, { status: 404 });

	function setupEndedCycle(options: {
		podCycleStartedAt?: number | null;
		recentEndedCycle?: number | null;
		channelOnlyActive?: boolean;
	}) {
		const now = Date.now();
		const cycleOneStartedAt = 100;
		const sameCycleBackup = makePlaylist(610, 3);
		const pendingSearch = Promise.resolve({ type: null, m3u8: null });
		const info = makeInfo({
			IsShowingAd: false,
			VisibleAdStartedAt: cycleOneStartedAt,
			LastAdEndReloadAt: options.recentEndedCycle === null ? 0 : now - 100,
			LastCleanBackupM3U8: sameCycleBackup,
			LastCleanBackupPlayerType: "site",
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupCodec: avcResolution.Codecs.toLowerCase(),
			LastCleanBackupAt: now - 50,
			ActiveBackupPlayerType: "site",
			BackupSearchEpoch: 5,
			_BackupSearchPromise: pendingSearch,
			_BackupSearchKey: "cycle-one",
			_BackupSearchPromises: new Map([["cycle-one", pendingSearch]]),
			ResolutionList: [avcResolution],
			Urls: { [mediaUrl]: avcResolution },
		});
		const state = getState();
		state.StreamInfos = { "live:testchannel": info };
		state.StreamInfosByUrl = { [mediaUrl]: info };
		state.CurrentAdChannel = options.channelOnlyActive ? "testchannel" : null;
		state.CurrentAdMediaKey = null;
		state.LastAdEndedAt = options.recentEndedCycle === null ? 0 : now - 100;
		state.LastAdEndedChannel =
			options.recentEndedCycle === null ? null : "testchannel";
		state.LastAdEndedMediaKey =
			options.recentEndedCycle === null ? null : "live:testchannel";
		state.LastAdEndedCycleStartedAt = options.recentEndedCycle || 0;
		state.AdPodProgressByMediaKey =
			options.podCycleStartedAt == null
				? Object.create(null)
				: {
						"live:testchannel": {
							cycleStartedAt: options.podCycleStartedAt,
						},
					};
		g._getStreamInfoForPlaylist = () => info;
		g._notifyAdComplete = async () => {};
		g.postMessage = () => {};
		g._createPageScopedWorkerEvent = (value: unknown) => value;
		const messages: Array<Record<string, unknown>> = [];
		g._postWorkerBridgeMessage = (
			_target: unknown,
			message: Record<string, unknown>,
		) => messages.push(message);
		const findBackup = vi.fn(async () => ({ type: null, m3u8: null }));
		g._findBackupStream = findBackup;
		return {
			info,
			messages,
			findBackup,
			sameCycleBackup,
			cycleOneStartedAt,
		};
	}

	function adDetectedMessage(messages: Array<Record<string, unknown>>) {
		return messages.find((message) => message.key === "AdDetected");
	}

	it("keeps the exact ended cycle and its snapshots for a true rapid continuation", async () => {
		const setup = setupEndedCycle({
			podCycleStartedAt: 100,
			recentEndedCycle: 100,
		});

		const out = await T<
			(url: string, text: string, realFetch: unknown) => Promise<string>
		>("_processM3U8Core")(mediaUrl, adPlaylist, fetchStub);

		expect(setup.info.VisibleAdStartedAt).toBe(setup.cycleOneStartedAt);
		expect(setup.info.BackupSearchEpoch).toBe(5);
		expect(
			(setup.info._BackupSearchPromises as Map<string, unknown>).has(
				"cycle-one",
			),
		).toBe(true);
		expect(setup.info.LastCleanBackupM3U8).toBe(setup.sameCycleBackup);
		expect(out).toBe(setup.sameCycleBackup);
		expect(setup.findBackup).not.toHaveBeenCalled();
		expect(adDetectedMessage(setup.messages)).toMatchObject({
			continued: true,
			cycleStartedAt: 100,
			detectedAt: expect.any(Number),
		});
	});

	it("retains the previous cycle for a matching channel-only active context without shared pod state", async () => {
		const setup = setupEndedCycle({
			podCycleStartedAt: null,
			recentEndedCycle: null,
			channelOnlyActive: true,
		});

		const out = await T<
			(url: string, text: string, realFetch: unknown) => Promise<string>
		>("_processM3U8Core")(mediaUrl, adPlaylist, fetchStub);

		expect(setup.info.VisibleAdStartedAt).toBe(setup.cycleOneStartedAt);
		expect(setup.info.BackupSearchEpoch).toBe(5);
		expect(out).toBe(setup.sameCycleBackup);
		expect(adDetectedMessage(setup.messages)).toMatchObject({
			continued: true,
			cycleStartedAt: 100,
		});
	});

	it("invalidates cycle-one media and searches when a newer cycle is genuine", async () => {
		const setup = setupEndedCycle({
			podCycleStartedAt: 200,
			recentEndedCycle: 100,
		});
		const adsBlockedBefore = Number(
			(g._S as Record<string, unknown>).adsBlocked,
		);

		const out = await T<
			(url: string, text: string, realFetch: unknown) => Promise<string>
		>("_processM3U8Core")(mediaUrl, adPlaylist, fetchStub);

		expect(setup.info.VisibleAdStartedAt).toBe(200);
		expect(setup.info.BackupSearchEpoch).toBe(6);
		expect(
			(setup.info._BackupSearchPromises as Map<string, unknown>).size,
		).toBe(0);
		expect(setup.info._BackupSearchPromise).toBe(null);
		expect(setup.info._BackupSearchKey).toBe(null);
		expect(setup.info.LastCleanBackupM3U8).toBe(null);
		expect(out).not.toContain("seg610.ts");
		expect(out).toContain("__ttvab_empty_hold_segment.mp4");
		expect(setup.findBackup).toHaveBeenCalled();
		expect(adDetectedMessage(setup.messages)).toMatchObject({
			continued: true,
			cycleStartedAt: 200,
		});
		expect(Number((g._S as Record<string, unknown>).adsBlocked)).toBe(
			adsBlockedBefore,
		);
	});
});

describe("_recordSustainedNativeResolution (ad-break poisoning guard)", () => {
	const fn = () =>
		T<(info: Record<string, unknown>, url: string) => void>(
			"_recordSustainedNativeResolution",
		);
	const URL_360 = "https://edge.example/sustained/360.m3u8";
	const URL_1080 = "https://edge.example/sustained/1080.m3u8";
	let previousVisibleSinceAt: unknown;

	beforeEach(() => {
		previousVisibleSinceAt = getState().PagePlaybackVisibleSinceAt;
		getState().PagePlaybackVisibleSinceAt = Date.now() - 20000;
	});

	afterEach(() => {
		getState().PagePlaybackVisibleSinceAt = previousVisibleSinceAt;
	});

	function makeQualityInfo(overrides: Record<string, unknown> = {}) {
		return makeInfo({
			Urls: {
				[URL_360]: { Resolution: "640x360" },
				[URL_1080]: { Resolution: "1920x1080" },
			},
			SustainedNativeResolution: null,
			SustainedNativeResolutionAt: 0,
			...overrides,
		});
	}

	it("ignores playback while an ad is showing", () => {
		getState().LastAdEndedAt = 0;
		const info = makeQualityInfo({ IsShowingAd: true });
		fn()(info, URL_1080);
		expect(info.SustainedNativeResolution).toBeNull();
	});

	it("records upgrades immediately during clean playback", () => {
		getState().LastAdEndedAt = 0;
		const info = makeQualityInfo({
			SustainedNativeResolution: { Resolution: "640x360" },
			SustainedNativeResolutionAt: Date.now(),
		});
		fn()(info, URL_1080);
		expect(info.SustainedNativeResolution).toEqual({ Resolution: "1920x1080" });
	});

	it("blocks a stale-window demotion right after an ad break", () => {
		const now = Date.now();
		getState().LastAdEndedAt = now - 5000;
		const info = makeQualityInfo({
			SustainedNativeResolution: { Resolution: "1920x1080" },
			SustainedNativeResolutionAt: now - 120000,
			LastAdEndReloadAt: 0,
		});
		fn()(info, URL_360);
		expect(info.SustainedNativeResolution).toEqual({ Resolution: "1920x1080" });
	});

	it("accepts a genuine sustained demotion once the break is far behind", () => {
		const now = Date.now();
		getState().LastAdEndedAt = now - 120000;
		const info = makeQualityInfo({
			SustainedNativeResolution: { Resolution: "1920x1080" },
			SustainedNativeResolutionAt: now - 120000,
			LastAdEndReloadAt: 0,
		});
		fn()(info, URL_360);
		expect(info.SustainedNativeResolution).toEqual({ Resolution: "640x360" });
	});

	it("keeps blocking demotions inside the fresh sustain window", () => {
		getState().LastAdEndedAt = 0;
		const info = makeQualityInfo({
			SustainedNativeResolution: { Resolution: "1920x1080" },
			SustainedNativeResolutionAt: Date.now(),
		});
		fn()(info, URL_360);
		expect(info.SustainedNativeResolution).toEqual({ Resolution: "1920x1080" });
	});
});

describe("_resolveAdBackupTargetResolution", () => {
	const fn = () =>
		T<
			(
				info: Record<string, unknown>,
				url: string,
			) => Record<string, unknown> | null
		>("_resolveAdBackupTargetResolution");
	const URL_160 = "https://edge.example/target/160.m3u8";
	const URL_1080 = "https://edge.example/target/1080.m3u8";
	const ladder = [
		{ Resolution: "1920x1080", Name: "1080p60" },
		{ Resolution: "1280x720", Name: "720p60" },
		{ Resolution: "640x360", Name: "360p" },
		{ Resolution: "284x160", Name: "160p" },
	];

	function makeTargetInfo(overrides: Record<string, unknown> = {}) {
		return makeInfo({
			ResolutionList: ladder,
			Urls: {
				[URL_160]: { Resolution: "284x160" },
				[URL_1080]: { Resolution: "1920x1080" },
			},
			SustainedNativeResolution: null,
			...overrides,
		});
	}

	it("targets the sustained quality when the player rebooted onto a low rung", () => {
		getState().PreferredQualityGroup = null;
		const info = makeTargetInfo({
			SustainedNativeResolution: { Resolution: "1920x1080", Name: "1080p60" },
		});
		expect(fn()(info, URL_160)).toEqual({
			Resolution: "1920x1080",
			Name: "1080p60",
		});
	});

	it("keeps the live request when it is already the higher target", () => {
		getState().PreferredQualityGroup = null;
		const info = makeTargetInfo({
			SustainedNativeResolution: { Resolution: "640x360", Name: "360p" },
		});
		expect(fn()(info, URL_1080)).toEqual({ Resolution: "1920x1080" });
	});

	it("falls back to the url resolution when nothing is sustained or preferred", () => {
		getState().PreferredQualityGroup = null;
		const info = makeTargetInfo();
		expect(fn()(info, URL_160)).toEqual({ Resolution: "284x160" });
	});

	it("honors an explicit quality selection over a low live request", () => {
		const state = getState();
		const previousGroup = state.PreferredQualityGroup;
		state.PreferredQualityGroup = "720p60";
		try {
			const info = makeTargetInfo();
			expect(fn()(info, URL_160)).toEqual({
				Resolution: "1280x720",
				Name: "720p60",
			});
		} finally {
			state.PreferredQualityGroup = previousGroup;
		}
	});

	it("never lets an enhanced live URL override the decodable AVC target", () => {
		getState().PreferredQualityGroup = null;
		const hevc1440 = {
			Resolution: "2560x1440",
			Name: "chunked",
			Codecs: "hev1.1.6.L153.B0",
		};
		const avc1080 = {
			Resolution: "1920x1080",
			Name: "1080p60",
			Codecs: "avc1.4D402A",
		};
		const info = makeTargetInfo({
			ModifiedM3U8: "#EXTM3U",
			IsUsingModifiedM3U8: true,
			ResolutionList: [hevc1440, avc1080],
			Urls: { [URL_1080]: hevc1440 },
			SustainedNativeResolution: hevc1440,
		});

		expect(fn()(info, URL_1080)).toBe(avc1080);
	});

	it("keeps an enhanced target while the AVC fallback master is only prepared", () => {
		getState().PreferredQualityGroup = null;
		const hevc1440 = {
			Resolution: "2560x1440",
			Name: "chunked",
			Codecs: "hev1.1.6.L153.B0",
		};
		const avc1080 = {
			Resolution: "1920x1080",
			Name: "1080p60",
			Codecs: "avc1.4D402A",
		};
		const info = makeTargetInfo({
			ModifiedM3U8: "#EXTM3U",
			IsUsingModifiedM3U8: false,
			EnhancedDecoderCodecFamily: "hevc",
			ResolutionList: [hevc1440, avc1080],
			Urls: { [URL_1080]: hevc1440 },
			SustainedNativeResolution: hevc1440,
		});

		expect(fn()(info, URL_1080)).toBe(hevc1440);
	});
});

describe("_isAdEndStable (escalating confirmation)", () => {
	const fn = () =>
		T<
			(
				info: Record<string, unknown>,
				realFetch: unknown,
				resolution?: Record<string, unknown> | null,
				requestAdContext?: Record<string, unknown> | null,
				requestSignal?: AbortSignal | null,
				candidateText?: string | null,
				candidateUrl?: string | null,
				candidateIsNative?: boolean,
			) => Promise<string>
		>("_isAdEndStable");

	function makePendingInfo(overrides: Record<string, unknown> = {}) {
		return makeInfo({
			IsShowingAd: true,
			IsUsingBackupStream: true,
			PendingAdEndAt: Date.now() - 1000,
			CleanPlaylistCount: 2,
			AdEndConfirmEscalation: 0,
			...overrides,
		});
	}

	function stubProbe(impl: (info: Record<string, unknown>) => boolean) {
		const previous = g._canReloadNativePlayerAfterAd;
		const calls = { count: 0, requireProbe: [] as boolean[] };
		g._canReloadNativePlayerAfterAd = async (
			info: Record<string, unknown>,
			_realFetch: unknown,
			_resolution: unknown,
			requireProbe = false,
		) => {
			calls.count += 1;
			calls.requireProbe.push(requireProbe);
			return impl(info);
		};
		const restore = () => {
			g._canReloadNativePlayerAfterAd = previous;
		};
		return { calls, restore };
	}

	function ownExactNativeUrl(info: Record<string, unknown>, url: string) {
		const urls = Object.assign(
			Object.create(null),
			(info.Urls as Record<string, unknown>) || {},
		);
		urls[url] = {
			Resolution: "1920x1080",
			Codecs: "avc1.64002a",
		};
		info.Urls = urls;
	}

	function exactRequestContext(
		info: Record<string, unknown>,
		cycleStartedAt: number,
	) {
		return {
			requestStartMediaKey: info.MediaKey,
			requestStartCycleStartedAt: cycleStartedAt,
		};
	}

	it("confirms once the base window is satisfied", async () => {
		const probe = stubProbe(() => true);
		try {
			const result = await fn()(makePendingInfo(), null);
			expect(result).toBe("ended");
			expect(probe.calls.count).toBe(1);
		} finally {
			probe.restore();
		}
	});

	it("widens the window after marker bounces instead of probing again", async () => {
		const probe = stubProbe(() => true);
		try {
			const result = await fn()(
				makePendingInfo({ AdEndConfirmEscalation: 2 }),
				null,
			);
			expect(result).toBe("wait");
			expect(probe.calls.count).toBe(0);
		} finally {
			probe.restore();
		}
	});

	it("keeps an inherited recovery cycle behind the maximum clean window", async () => {
		const probe = stubProbe(() => true);
		try {
			const result = await fn()(
				makePendingInfo({
					AdEndConfirmEscalation: 4,
					PendingAdEndAt: Date.now() - 9000,
					CleanPlaylistCount: 6,
				}),
				null,
			);
			expect(result).toBe("wait");
			expect(probe.calls.count).toBe(0);
		} finally {
			probe.restore();
		}
	});

	it("caps escalation so a long break can still end", async () => {
		const probe = stubProbe(() => true);
		try {
			const result = await fn()(
				makePendingInfo({
					AdEndConfirmEscalation: 99,
					PendingAdEndAt: Date.now() - 12000,
					CleanPlaylistCount: 6,
				}),
				null,
			);
			expect(result).toBe("ended");
			expect(probe.calls.count).toBe(1);
		} finally {
			probe.restore();
		}
	});

	it("does not declare ended when the break resolved during the probe", async () => {
		const probe = stubProbe((info) => {
			info.IsShowingAd = false;
			return true;
		});
		try {
			const result = await fn()(makePendingInfo(), null);
			expect(result).toBe("wait");
			expect(probe.calls.count).toBe(1);
		} finally {
			probe.restore();
		}
	});

	it("does not trust fresh clean probes while a declared pod is incomplete", async () => {
		const probe = stubProbe(() => true);
		try {
			const result = await fn()(
				makePendingInfo({
					PendingAdEndAt: Date.now() - 5000,
					CleanPlaylistCount: 4,
					ExpectedAdPodLength: 4,
					ObservedAdPodIds: new Set(["stitched-ad-1"]),
					LastCleanBackupM3U8: makePlaylist(10, 3),
					VisibleAdStartedAt: Date.now() - 5000,
				}),
				null,
			);
			expect(result).toBe("wait");
			expect(probe.calls.count).toBe(0);
		} finally {
			probe.restore();
		}
	});

	it("keeps incomplete pods closed before the bounded clean escape", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(189999);
		const probe = stubProbe(() => true);
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/incomplete-live.m3u8";
		try {
			const info = makePendingInfo({
				AdEndConfirmEscalation: 4,
				PendingAdEndAt: 170000,
				CleanPlaylistCount: 20,
				ExpectedAdPodLength: 4,
				ObservedAdPodIds: new Set(["stitched-ad-1"]),
				VisibleAdStartedAt: 90000,
				LastAdPodProgressAt: 100000,
				_IncompletePodCleanStartedAt: 170000,
				_IncompletePodCleanPlaylistCount: 7,
				_IncompletePodLastMediaSequence: 100,
				_IncompletePodCandidateUrl: url,
			});
			ownExactNativeUrl(info, url);
			const result = await fn()(
				info,
				null,
				null,
				exactRequestContext(info, 90000),
				null,
				makePlaylist(101, 3),
				url,
				true,
			);
			expect(result).toBe("wait");
			expect(probe.calls.count).toBe(0);
		} finally {
			probe.restore();
			vi.useRealTimers();
		}
	});

	it("probes incomplete live pods only after sustained same-url advancement", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(200000);
		let nativeReady = false;
		const probe = stubProbe(() => nativeReady);
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/incomplete-escape.m3u8";
		const info = makePendingInfo({
			AdEndConfirmEscalation: 4,
			PendingAdEndAt: 180000,
			CleanPlaylistCount: 20,
			ExpectedAdPodLength: 4,
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			VisibleAdStartedAt: 90000,
			LastAdPodProgressAt: 100000,
			LastCleanBackupM3U8: null,
		});
		ownExactNativeUrl(info, url);
		const requestContext = exactRequestContext(info, 90000);
		try {
			for (let index = 0; index < 7; index++) {
				vi.setSystemTime(200000 + index * 2000);
				expect(
					await fn()(
						info,
						null,
						null,
						requestContext,
						null,
						makePlaylist(300 + index, 3),
						url,
						true,
					),
				).toBe("wait");
			}
			expect(probe.calls.count).toBe(0);

			vi.setSystemTime(214000);
			expect(
				await fn()(
					info,
					null,
					null,
					requestContext,
					null,
					makePlaylist(307, 3),
					url,
					true,
				),
			).toBe("wait");
			expect(probe.calls.count).toBe(1);

			nativeReady = true;
			vi.setSystemTime(216000);
			expect(
				await fn()(
					info,
					null,
					null,
					requestContext,
					null,
					makePlaylist(308, 3),
					url,
					true,
				),
			).toBe("ended");
			expect(probe.calls.count).toBe(2);
			expect(probe.calls.requireProbe).toEqual([true, true]);
		} finally {
			probe.restore();
			vi.useRealTimers();
		}
	});

	it("requires VOD endlist proof before probing an incomplete pod", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(200000);
		const probe = stubProbe(() => true);
		const url = "https://vod-secure.twitch.tv/archive/2827992810/index.m3u8";
		const info = makePendingInfo({
			MediaType: "vod",
			ChannelName: null,
			VodID: "2827992810",
			MediaKey: "vod:2827992810",
			AdEndConfirmEscalation: 4,
			PendingAdEndAt: 180000,
			CleanPlaylistCount: 20,
			ExpectedAdPodLength: 4,
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			VisibleAdStartedAt: 90000,
			LastAdPodProgressAt: 100000,
		});
		try {
			expect(
				await fn()(info, null, null, null, null, makePlaylist(0, 3), url),
			).toBe("wait");
			expect(probe.calls.count).toBe(0);
			for (let index = 0; index < 7; index++) {
				vi.setSystemTime(200000 + index * 2000);
				const result = await fn()(
					info,
					null,
					null,
					null,
					null,
					`${makePlaylist(0, 3)}\n#EXT-X-ENDLIST`,
					url,
				);
				expect(result).toBe(index === 6 ? "ended" : "wait");
			}
			expect(probe.calls.count).toBe(1);
		} finally {
			probe.restore();
			vi.useRealTimers();
		}
	});

	it("accepts a one-based terminal pod position when intermediate ad IDs were missed", async () => {
		const probe = stubProbe(() => true);
		try {
			const result = await fn()(
				makePendingInfo({
					ExpectedAdPodLength: 4,
					ObservedAdPodIds: new Set(["stitched-ad-1"]),
					MaxObservedAdPodPosition: 4,
					ObservedZeroAdPodPosition: false,
				}),
				null,
			);
			expect(result).toBe("ended");
			expect(probe.calls.count).toBe(1);
		} finally {
			probe.restore();
		}
	});

	it("accepts a zero-based terminal pod position only after position zero was observed", async () => {
		const probe = stubProbe(() => true);
		try {
			const terminal = await fn()(
				makePendingInfo({
					ExpectedAdPodLength: 4,
					ObservedAdPodIds: new Set(["stitched-ad-1"]),
					MaxObservedAdPodPosition: 3,
					ObservedZeroAdPodPosition: true,
				}),
				null,
			);
			expect(terminal).toBe("ended");
			expect(probe.calls.count).toBe(1);
		} finally {
			probe.restore();
		}
	});

	it("keeps waiting on a nonterminal pod position", async () => {
		const probe = stubProbe(() => true);
		try {
			const result = await fn()(
				makePendingInfo({
					ExpectedAdPodLength: 4,
					ObservedAdPodIds: new Set(["stitched-ad-1"]),
					MaxObservedAdPodPosition: 3,
					ObservedZeroAdPodPosition: false,
				}),
				null,
			);
			expect(result).toBe("wait");
			expect(probe.calls.count).toBe(0);
		} finally {
			probe.restore();
		}
	});

	it("allows normal confirmation once every declared pod ad was observed", async () => {
		const probe = stubProbe(() => true);
		try {
			const result = await fn()(
				makePendingInfo({
					ExpectedAdPodLength: 2,
					ObservedAdPodIds: new Set(["stitched-ad-1", "stitched-ad-2"]),
				}),
				null,
			);
			expect(result).toBe("ended");
			expect(probe.calls.count).toBe(1);
		} finally {
			probe.restore();
		}
	});

	it("uses the exact pre-ad native URL across master-map churn without minting site sessions", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(200000);
		const probe = stubProbe(() => true);
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/native.m3u8?token=player";
		const info = makePendingInfo({
			ExpectedAdPodLength: 1,
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			VisibleAdStartedAt: 100000,
			LastCleanBackupM3U8: makePlaylist(50, 3),
			LastCleanBackupPlayerType: "autoplay",
			ActiveBackupPlayerType: "autoplay",
			ActiveBackupResolution: "640x360",
			SustainedNativeResolution: {
				Resolution: "1920x1080",
				Codecs: "avc1.64002a",
			},
		});
		ownExactNativeUrl(info, url);
		activateExactAdCycle(info, 100000);
		const context = exactRequestContext(info, 100000);
		info.LastCleanNativeM3U8 = makePlaylist(90, 3);
		info.LastCleanNativeUrl = url;
		info.LastCleanNativeCodec = "avc1.64002a";
		info.LastCleanNativePlaylistAt = 99000;
		info.Urls = Object.create(null);
		try {
			for (let index = 0; index < 8; index++) {
				vi.setSystemTime(200000 + index * 2000);
				const result = await fn()(
					info,
					null,
					null,
					context,
					null,
					makePlaylist(100 + index, 3),
					url,
					true,
				);
				expect(result).toBe(index === 7 ? "ended-with-backup-hold" : "wait");
			}
			expect(probe.calls.count).toBe(0);

			info.IsShowingAd = false;
			info.IsHoldingBackupAfterAd = true;
			for (let index = 0; index < 8; index++) {
				vi.setSystemTime(216000 + index * 2000);
				const result = await fn()(
					info,
					null,
					null,
					context,
					null,
					makePlaylist(108 + index, 3),
					url,
					true,
				);
				expect(result).toBe(index === 7 ? "ended" : "wait");
			}
			expect(probe.calls.count).toBe(0);
			expect(info.NativeRecoveryCandidateStage).toBe("hold");
			expect(info.NativeRecoveryCandidateCleanCount).toBe(7);
		} finally {
			probe.restore();
			vi.useRealTimers();
		}
	});

	it("keeps ordinary autoplay quality reloads on exact native proof", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(300000);
		const probe = stubProbe(() => true);
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/enhanced.m3u8?token=player";
		const info = makePendingInfo({
			ExpectedAdPodLength: 1,
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			VisibleAdStartedAt: 250000,
			LastCleanBackupM3U8: makePlaylist(50, 3),
			LastCleanBackupPlayerType: "autoplay",
			ActiveBackupPlayerType: "autoplay",
			HevcReloadPendingAfterHold: true,
		});
		ownExactNativeUrl(info, url);
		activateExactAdCycle(info, 250000);
		const context = exactRequestContext(info, 250000);
		try {
			let result = "wait";
			for (let index = 0; index < 8; index++) {
				vi.setSystemTime(300000 + index * 2000);
				result = await fn()(
					info,
					null,
					null,
					context,
					null,
					makePlaylist(400 + index, 3),
					url,
					true,
				);
			}
			expect(result).toBe("ended-with-backup-hold");
			expect(probe.calls.count).toBe(0);
		} finally {
			probe.restore();
			vi.useRealTimers();
		}
	});

	it("falls back to the conservative probe while a codec fence is active", async () => {
		const probe = stubProbe(() => true);
		const url =
			"https://video-weaver.example.ttvnw.net/v1/playlist/enhanced.m3u8?token=player";
		try {
			for (const codecFence of [
				{ IsUsingModifiedM3U8: true },
				{
					_CodecHandoffPendingId: "live:testchannel:250000:1:1:handoff",
				},
			]) {
				const info = makePendingInfo({
					ExpectedAdPodLength: 1,
					ObservedAdPodIds: new Set(["stitched-ad-1"]),
					VisibleAdStartedAt: 250000,
					LastCleanBackupM3U8: makePlaylist(50, 3),
					LastCleanBackupPlayerType: "autoplay",
					ActiveBackupPlayerType: "autoplay",
					...codecFence,
				});
				ownExactNativeUrl(info, url);
				activateExactAdCycle(info, 250000);
				expect(
					await fn()(
						info,
						null,
						null,
						exactRequestContext(info, 250000),
						null,
						makePlaylist(400, 3),
						url,
						true,
					),
				).toBe("ended");
				expect(info.NativeRecoveryCandidateUrl).toBe(null);
			}
			expect(probe.calls.count).toBe(2);
			for (const codecFence of [
				{ IsUsingModifiedM3U8: true },
				{
					_CodecHandoffPendingId: "live:testchannel:250000:1:1:handoff",
				},
			]) {
				const info = makePendingInfo({
					ExpectedAdPodLength: 1,
					ObservedAdPodIds: new Set(["stitched-ad-1"]),
					VisibleAdStartedAt: 250000,
					LastCleanBackupM3U8: makePlaylist(50, 3),
					LastCleanBackupPlayerType: "autoplay",
					ActiveBackupPlayerType: "autoplay",
					...codecFence,
				});
				ownExactNativeUrl(info, url);
				activateExactAdCycle(info, 250000);
				expect(
					await fn()(
						info,
						null,
						null,
						exactRequestContext(info, 250000),
						null,
						makePlaylist(500, 3),
						`${url}&session=unowned`,
						true,
					),
				).toBe("wait");
			}
			expect(probe.calls.count).toBe(2);
		} finally {
			probe.restore();
		}
	});

	it("rejects unowned exact-query proof, then accepts the owned URL", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(400000);
		const probe = stubProbe(() => false);
		const ownedUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/native.m3u8?token=owned";
		const unownedUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/native.m3u8?token=fresh-session";
		const info = makePendingInfo({
			ExpectedAdPodLength: 1,
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			VisibleAdStartedAt: 350000,
			LastCleanBackupM3U8: makePlaylist(50, 3),
			LastCleanBackupPlayerType: "site",
			NativeRecoveryAdPlaylistUrls: new Set([ownedUrl]),
			NativeRecoveryAdMediaKey: "live:testchannel",
			NativeRecoveryAdStartedAt: 350000,
		});
		info.Urls = Object.create(null);
		activateExactAdCycle(info, 350000);
		const context = exactRequestContext(info, 350000);
		try {
			expect(
				await fn()(
					info,
					null,
					null,
					context,
					null,
					makePlaylist(500, 3),
					unownedUrl,
					true,
				),
			).toBe("wait");
			expect(probe.calls.count).toBe(0);
			expect(info.NativeRecoveryCandidateUrl).toBe(null);
			expect(info.NativeRecoveryCandidateCleanCount).toBe(0);

			let recovered = "wait";
			for (let index = 0; index < 8; index++) {
				vi.setSystemTime(402000 + index * 2000);
				recovered = await fn()(
					info,
					null,
					null,
					context,
					null,
					makePlaylist(501 + index, 3),
					ownedUrl,
					true,
				);
			}
			expect(recovered).toBe("ended-with-backup-hold");
			expect(probe.calls.count).toBe(0);
		} finally {
			probe.restore();
			vi.useRealTimers();
		}
	});

	it("resets exact proof on marker bounce, URL change, sequence regression, and cycle drift", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(500000);
		const probe = stubProbe(() => false);
		const firstUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/first.m3u8?token=player";
		const secondUrl =
			"https://video-weaver.example.ttvnw.net/v1/playlist/second.m3u8?token=player";
		const info = makePendingInfo({
			ExpectedAdPodLength: 1,
			ObservedAdPodIds: new Set(["stitched-ad-1"]),
			VisibleAdStartedAt: 450000,
			LastCleanBackupM3U8: makePlaylist(50, 3),
			LastCleanBackupPlayerType: "site",
		});
		ownExactNativeUrl(info, firstUrl);
		ownExactNativeUrl(info, secondUrl);
		activateExactAdCycle(info, 450000);
		const context = exactRequestContext(info, 450000);
		try {
			for (let index = 0; index < 4; index++) {
				vi.setSystemTime(500000 + index * 2000);
				expect(
					await fn()(
						info,
						null,
						null,
						context,
						null,
						makePlaylist(600 + index, 3),
						firstUrl,
						true,
					),
				).toBe("wait");
			}
			expect(info.NativeRecoveryCandidateCleanCount).toBe(3);

			vi.setSystemTime(508000);
			expect(
				await fn()(
					info,
					null,
					null,
					context,
					null,
					makePlaylist(700, 3),
					secondUrl,
					true,
				),
			).toBe("wait");
			expect(info.NativeRecoveryCandidateCleanCount).toBe(0);

			vi.setSystemTime(509000);
			expect(
				await fn()(
					info,
					null,
					null,
					context,
					null,
					makePlaylist(700, 3),
					secondUrl,
					true,
				),
			).toBe("wait");
			expect(info.NativeRecoveryCandidateCleanCount).toBe(0);
			expect(info.NativeRecoveryCandidateLastMediaSequence).toBe(700);

			vi.setSystemTime(510000);
			expect(
				await fn()(
					info,
					null,
					null,
					context,
					null,
					makePlaylist(699, 3),
					secondUrl,
					true,
				),
			).toBe("wait");
			expect(info.NativeRecoveryCandidateCleanCount).toBe(0);
			expect(info.NativeRecoveryCandidateLastMediaSequence).toBe(699);

			const adMarked = [
				"#EXTM3U",
				"#EXT-X-MEDIA-SEQUENCE:700",
				'#EXT-X-DATERANGE:ID="stitched-ad-bounce",CLASS="twitch-stitched-ad"',
				"#EXTINF:2.000,live",
				"ad-700.ts",
			].join("\n");
			vi.setSystemTime(512000);
			expect(
				await fn()(info, null, null, context, null, adMarked, secondUrl, true),
			).toBe("wait");
			expect(info.NativeRecoveryCandidateUrl).toBe(null);
			expect(info.NativeRecoveryCandidateLastMediaSequence).toBe(null);

			vi.setSystemTime(514000);
			expect(
				await fn()(
					info,
					null,
					null,
					{ ...context, requestStartCycleStartedAt: 449999 },
					null,
					makePlaylist(800, 3),
					secondUrl,
					true,
				),
			).toBe("wait");
			expect(info.NativeRecoveryCandidateUrl).toBe(null);
			expect(probe.calls.count).toBe(0);
		} finally {
			probe.restore();
			vi.useRealTimers();
		}
	});

	it("never restores from a silent hold on timeout without native-ready proof", async () => {
		const probe = stubProbe(() => false);
		try {
			const result = await fn()(
				makePendingInfo({
					IsShowingAd: false,
					IsHoldingBackupAfterAd: true,
					IsUsingBackupStream: false,
					PendingAdEndAt: Date.now() - 10000,
					CleanPlaylistCount: 10,
					LastCleanBackupM3U8: null,
				}),
				null,
			);
			expect(result).toBe("wait");
			expect(probe.calls.count).toBe(1);
		} finally {
			probe.restore();
		}
	});

	it("does not re-enter the visible-to-silent transition after the hold began", async () => {
		const probe = stubProbe(() => false);
		const previousLog = g._log;
		const log = vi.fn();
		g._log = log;
		try {
			const result = await fn()(
				makePendingInfo({
					IsShowingAd: false,
					IsHoldingBackupAfterAd: true,
					PendingAdEndAt: Date.now() - 10000,
					CleanPlaylistCount: 10,
					ConsecutiveFailedNativeProbes: 6,
					LastCleanBackupM3U8: makePlaylist(50, 3),
					VisibleAdStartedAt: Date.now() - 120000,
				}),
				null,
			);

			expect(result).toBe("wait");
			expect(probe.calls.count).toBe(1);
			expect(
				log.mock.calls.some((call) =>
					String(call[0]).includes("ending visible ad cycle"),
				),
			).toBe(false);
		} finally {
			g._log = previousLog;
			probe.restore();
		}
	});
});

describe("_canReloadNativePlayerAfterAd (serialization and stale results)", () => {
	const fn = () =>
		T<
			(
				info: Record<string, unknown>,
				realFetch: unknown,
				resolution?: unknown,
				requireProbe?: boolean,
			) => Promise<boolean>
		>("_canReloadNativePlayerAfterAd");

	function stubProbeChain(
		tokenImpl: () => Promise<Response>,
		playlistImpl: (call: number) => string | Response = (call) =>
			makePlaylist(100 + call, 3),
	) {
		const state = getState();
		const previous = {
			minProbes: state.AdEndMinNativeRecoveryProbes,
			lastType: state.LastNativePlaybackAccessTokenPlayerType,
			getToken: g._getToken,
			extract: g._extractPlaybackAccessToken,
			buildUsher: g._buildUsherPlaybackUrl,
			getStreamUrl: g._getStreamUrl,
			fetchWithTimeout: g._fetchWithTimeout,
		};
		const tokenCalls = { count: 0 };
		const mediaCalls = { count: 0 };
		state.AdEndMinNativeRecoveryProbes = 3;
		state.LastNativePlaybackAccessTokenPlayerType = "site";
		g._getToken = () => {
			tokenCalls.count += 1;
			return tokenImpl();
		};
		g._extractPlaybackAccessToken = () => ({
			signature: "sig",
			value: "token",
		});
		g._buildUsherPlaybackUrl = () =>
			new URL("https://usher.example/channel/hls/testchannel.m3u8");
		g._getStreamUrl = () => "https://edge.example/live/index.m3u8";
		g._fetchWithTimeout = async (_realFetch: unknown, url: unknown) => {
			if (String(url).includes("usher.example")) {
				return new Response(
					"#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlive/index.m3u8",
					{ status: 200 },
				);
			}
			mediaCalls.count += 1;
			const playlist = playlistImpl(mediaCalls.count);
			return playlist instanceof Response
				? playlist
				: new Response(playlist, { status: 200 });
		};
		const restore = () => {
			state.AdEndMinNativeRecoveryProbes = previous.minProbes;
			state.LastNativePlaybackAccessTokenPlayerType = previous.lastType;
			if (previous.getToken === undefined) delete g._getToken;
			else g._getToken = previous.getToken;
			if (previous.extract === undefined) delete g._extractPlaybackAccessToken;
			else g._extractPlaybackAccessToken = previous.extract;
			if (previous.buildUsher === undefined) delete g._buildUsherPlaybackUrl;
			else g._buildUsherPlaybackUrl = previous.buildUsher;
			if (previous.getStreamUrl === undefined) delete g._getStreamUrl;
			else g._getStreamUrl = previous.getStreamUrl;
			if (previous.fetchWithTimeout === undefined) delete g._fetchWithTimeout;
			else g._fetchWithTimeout = previous.fetchWithTimeout;
		};
		return { tokenCalls, mediaCalls, restore };
	}

	it("counts clean probes across calls and reports ready at the threshold", async () => {
		const chain = stubProbeChain(
			async () => new Response("{}", { status: 200 }),
		);
		try {
			const info = makeInfo({ IsUsingBackupStream: true });
			activateExactAdCycle(info);
			const results: boolean[] = [];
			for (let i = 0; i < 4; i++) {
				info.LastNativeRecoveryProbeAt = 0;
				results.push(await fn()(info, null));
			}
			expect(results).toEqual([false, false, false, true]);
			expect(chain.tokenCalls.count).toBe(1);
			expect(chain.mediaCalls.count).toBe(4);
		} finally {
			chain.restore();
		}
	});

	it("lets one ad-marked live probe session advance to three clean proofs", async () => {
		const adMarkedProbe = [
			"#EXTM3U",
			"#EXT-X-MEDIA-SEQUENCE:100",
			'#EXT-X-DATERANGE:ID="stitched-ad-probe",CLASS="twitch-stitched-ad"',
			"#EXTINF:2.000,live",
			"ad-100.ts",
		].join("\n");
		const playlists = [
			adMarkedProbe,
			makePlaylist(101, 3),
			makePlaylist(101, 3),
			makePlaylist(102, 3),
			makePlaylist(103, 3),
		];
		const chain = stubProbeChain(
			async () => new Response("{}", { status: 200 }),
			(call) => playlists[call - 1],
		);
		try {
			const info = makeInfo({ IsUsingBackupStream: true });
			activateExactAdCycle(info, 1000);
			const results: boolean[] = [];
			for (let index = 0; index < playlists.length; index++) {
				info.LastNativeRecoveryProbeAt = 0;
				results.push(await fn()(info, null));
			}

			expect(results).toEqual([false, false, false, false, true]);
			expect(chain.tokenCalls.count).toBe(1);
			expect(chain.mediaCalls.count).toBe(5);
			expect(info.NativeRecoveryProbeStreamUrl).toBe(
				"https://edge.example/live/index.m3u8",
			);
			expect(info.NativeRecoveryProbeLastMediaSequence).toBe(103);
		} finally {
			chain.restore();
		}
	});

	it("restarts clean proof without reminting when markers return in the probe session", async () => {
		const adMarkedProbe = [
			"#EXTM3U",
			"#EXT-X-MEDIA-SEQUENCE:102",
			'#EXT-X-DATERANGE:ID="stitched-ad-probe",CLASS="twitch-stitched-ad"',
			"#EXTINF:2.000,live",
			"ad-102.ts",
		].join("\n");
		const playlists = [
			makePlaylist(100, 3),
			makePlaylist(101, 3),
			adMarkedProbe,
			makePlaylist(103, 3),
			makePlaylist(104, 3),
			makePlaylist(105, 3),
		];
		const chain = stubProbeChain(
			async () => new Response("{}", { status: 200 }),
			(call) => playlists[call - 1],
		);
		try {
			const info = makeInfo({ IsUsingBackupStream: true });
			activateExactAdCycle(info, 1000);
			const results: boolean[] = [];
			for (let index = 0; index < playlists.length; index++) {
				info.LastNativeRecoveryProbeAt = 0;
				results.push(await fn()(info, null));
			}

			expect(results).toEqual([false, false, false, false, false, true]);
			expect(chain.tokenCalls.count).toBe(1);
			expect(chain.mediaCalls.count).toBe(6);
			expect(info.NativeRecoveryProbeMediaKey).toBe("live:testchannel");
			expect(info.NativeRecoveryProbeLastMediaSequence).toBe(105);
		} finally {
			chain.restore();
		}
	});

	it("remints only after a live probe sequence regresses", async () => {
		const sequences = [100, 101, 99, 200];
		const chain = stubProbeChain(
			async () => new Response("{}", { status: 200 }),
			(call) => makePlaylist(sequences[call - 1], 3),
		);
		try {
			const info = makeInfo({ IsUsingBackupStream: true });
			activateExactAdCycle(info, 1000);
			for (let index = 0; index < sequences.length; index++) {
				info.LastNativeRecoveryProbeAt = 0;
				expect(await fn()(info, null)).toBe(false);
			}

			expect(chain.tokenCalls.count).toBe(2);
			expect(info.NativeRecoveryProbeLastMediaSequence).toBe(200);
			expect(info.NativeRecoveryCleanCount).toBe(0);
		} finally {
			chain.restore();
		}
	});

	it("remints after the cached live probe URL stops responding", async () => {
		const playlists = [
			makePlaylist(100, 3),
			new Response("unavailable", { status: 503 }),
			makePlaylist(200, 3),
		];
		const chain = stubProbeChain(
			async () => new Response("{}", { status: 200 }),
			(call) => playlists[call - 1],
		);
		try {
			const info = makeInfo({ IsUsingBackupStream: true });
			activateExactAdCycle(info, 1000);
			for (let index = 0; index < playlists.length; index++) {
				info.LastNativeRecoveryProbeAt = 0;
				expect(await fn()(info, null)).toBe(false);
			}

			expect(chain.tokenCalls.count).toBe(2);
			expect(chain.mediaCalls.count).toBe(3);
			expect(info.NativeRecoveryProbeMediaKey).toBe("live:testchannel");
			expect(info.NativeRecoveryProbeLastMediaSequence).toBe(200);
		} finally {
			chain.restore();
		}
	});

	it("expires a live probe session that stops advancing", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const chain = stubProbeChain(
			async () => new Response("{}", { status: 200 }),
			() => makePlaylist(100, 3),
		);
		try {
			const info = makeInfo({ IsUsingBackupStream: true });
			activateExactAdCycle(info, 90000);
			expect(await fn()(info, null)).toBe(false);
			vi.setSystemTime(116000);
			info.LastNativeRecoveryProbeAt = 0;
			expect(await fn()(info, null)).toBe(false);
			info.LastNativeRecoveryProbeAt = 0;
			expect(await fn()(info, null)).toBe(false);

			expect(chain.tokenCalls.count).toBe(2);
			expect(info.NativeRecoveryProbeLastAdvancedAt).toBe(116000);
		} finally {
			chain.restore();
			vi.useRealTimers();
		}
	});

	it("timestamps live advancement when the media response is observed", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const chain = stubProbeChain(
			async () => new Response("{}", { status: 200 }),
			() => {
				vi.setSystemTime(112000);
				return makePlaylist(100, 3);
			},
		);
		try {
			const info = makeInfo({ IsUsingBackupStream: true });
			activateExactAdCycle(info, 90000);
			expect(await fn()(info, null)).toBe(false);
			expect(info.NativeRecoveryProbeLastAdvancedAt).toBe(112000);
		} finally {
			chain.restore();
			vi.useRealTimers();
		}
	});

	it("does not reuse a probe session across ad cycles, player types, or media contexts", async () => {
		const chain = stubProbeChain(
			async () => new Response("{}", { status: 200 }),
		);
		try {
			const state = getState();
			const info = makeInfo({ IsUsingBackupStream: true });
			activateExactAdCycle(info, 1000);
			expect(await fn()(info, null)).toBe(false);

			activateExactAdCycle(info, 2000);
			info.LastNativeRecoveryProbeAt = 0;
			expect(await fn()(info, null)).toBe(false);
			expect(chain.tokenCalls.count).toBe(2);
			expect(info.NativeRecoveryProbeCycleStartedAt).toBe(2000);

			state.LastNativePlaybackAccessTokenPlayerType = "embed";
			info.LastNativeRecoveryProbeAt = 0;
			expect(await fn()(info, null)).toBe(false);
			expect(chain.tokenCalls.count).toBe(3);
			expect(info.NativeRecoveryProbePlayerType).toBe("embed");

			info.MediaKey = "live:otherchannel";
			info.ChannelName = "otherchannel";
			activateExactAdCycle(info, 2000);
			info.LastNativeRecoveryProbeAt = 0;
			expect(await fn()(info, null)).toBe(false);
			expect(chain.tokenCalls.count).toBe(4);
			expect(info.NativeRecoveryProbeMediaKey).toBe("live:otherchannel");
		} finally {
			chain.restore();
		}
	});

	it("requires the real clean-probe chain for an incomplete pod without an active backup", async () => {
		const chain = stubProbeChain(
			async () => new Response("{}", { status: 200 }),
		);
		try {
			const info = makeInfo({
				IsUsingBackupStream: false,
				IsUsingFallbackStream: false,
			});
			activateExactAdCycle(info);
			const results: boolean[] = [];
			for (let index = 0; index < 4; index++) {
				info.LastNativeRecoveryProbeAt = 0;
				results.push(await fn()(info, null, null, true));
			}
			expect(results).toEqual([false, false, false, true]);
			expect(chain.tokenCalls.count).toBe(1);
			expect(chain.mediaCalls.count).toBe(4);
		} finally {
			chain.restore();
		}
	});

	it("requires the real clean-probe chain throughout a hold without an active backup", async () => {
		const chain = stubProbeChain(
			async () => new Response("{}", { status: 200 }),
		);
		try {
			const info = makeInfo({
				IsHoldingBackupAfterAd: true,
				IsUsingBackupStream: false,
				IsUsingFallbackStream: false,
			});
			activateExactAdCycle(info);
			const results: boolean[] = [];
			for (let index = 0; index < 4; index++) {
				info.LastNativeRecoveryProbeAt = 0;
				results.push(await fn()(info, null));
			}

			expect(results).toEqual([false, false, false, true]);
			expect(chain.tokenCalls.count).toBe(1);
			expect(chain.mediaCalls.count).toBe(4);
		} finally {
			chain.restore();
		}
	});

	it("refuses to start a probe while another is in flight", async () => {
		let releaseToken: (response: Response) => void = () => {};
		const chain = stubProbeChain(
			() =>
				new Promise<Response>((resolveToken) => {
					releaseToken = resolveToken;
				}),
		);
		try {
			const info = makeInfo({ IsUsingBackupStream: true });
			activateExactAdCycle(info);
			const first = fn()(info, null);
			info.LastNativeRecoveryProbeAt = 0;
			const second = await fn()(info, null);
			expect(second).toBe(false);
			expect(chain.tokenCalls.count).toBe(1);
			releaseToken(new Response("{}", { status: 200 }));
			expect(await first).toBe(false);
			expect(info.NativeRecoveryCleanCount).toBe(0);
		} finally {
			chain.restore();
		}
	});

	it("discards a probe that resolves after the ready state was reset", async () => {
		let releaseToken: (response: Response) => void = () => {};
		const chain = stubProbeChain(
			() =>
				new Promise<Response>((resolveToken) => {
					releaseToken = resolveToken;
				}),
		);
		try {
			const info = makeInfo({ IsUsingBackupStream: true });
			activateExactAdCycle(info);
			const pending = fn()(info, null);
			T<(info: Record<string, unknown>) => void>(
				"_resetNativeRecoveryReadyState",
			)(info);
			releaseToken(new Response("{}", { status: 200 }));
			expect(await pending).toBe(false);
			expect(info.NativeRecoveryCleanCount).toBe(0);
			expect(Number(info.ConsecutiveFailedNativeProbes) || 0).toBe(0);
			expect(info._NativeRecoveryProbeInFlight).toBe(false);
		} finally {
			chain.restore();
		}
	});

	it("discards an in-flight probe after its stream info changes media context", async () => {
		let releaseToken: (response: Response) => void = () => {};
		const chain = stubProbeChain(
			() =>
				new Promise<Response>((resolveToken) => {
					releaseToken = resolveToken;
				}),
		);
		try {
			const info = makeInfo({ IsUsingBackupStream: true });
			activateExactAdCycle(info, 1000);
			const pending = fn()(info, null);
			info.MediaKey = "live:otherchannel";
			info.ChannelName = "otherchannel";
			activateExactAdCycle(info, 1000);
			releaseToken(new Response("{}", { status: 200 }));

			expect(await pending).toBe(false);
			expect(info.NativeRecoveryProbeStreamUrl).toBe(null);
			expect(info.NativeRecoveryCleanCount).toBe(0);
		} finally {
			chain.restore();
		}
	});

	it("keeps cycle-two probe ownership and counters when cycle one resolves late", async () => {
		let releaseToken: (response: Response) => void = () => {};
		const chain = stubProbeChain(
			() =>
				new Promise<Response>((resolveToken) => {
					releaseToken = resolveToken;
				}),
		);
		try {
			const info = makeInfo({
				IsUsingBackupStream: true,
				NativeRecoveryProbeEpoch: 4,
			});
			activateExactAdCycle(info, 100);
			const cycleOne = fn()(info, null);
			const cycleTwoToken = {};
			info.VisibleAdStartedAt = 200;
			info.NativeRecoveryProbeEpoch = 5;
			info._NativeRecoveryProbeInFlight = true;
			info._NativeRecoveryProbeToken = cycleTwoToken;
			info.NativeRecoveryCleanCount = 2;
			info.ConsecutiveFailedNativeProbes = 3;
			activateExactAdCycle(info, 200);

			releaseToken(new Response("{}", { status: 200 }));
			expect(await cycleOne).toBe(false);
			expect(info.NativeRecoveryCleanCount).toBe(2);
			expect(info.ConsecutiveFailedNativeProbes).toBe(3);
			expect(info._NativeRecoveryProbeInFlight).toBe(true);
			expect(info._NativeRecoveryProbeToken).toBe(cycleTwoToken);
			expect(info.NativeRecoveryProbeEpoch).toBe(5);
		} finally {
			chain.restore();
		}
	});
});

describe("_resetStreamAdState (spoofed ad id migration)", () => {
	const fn = () =>
		T<(info: Record<string, unknown>) => Record<string, unknown>>(
			"_resetStreamAdState",
		);

	it("migrates spoofed ad ids into the recent map on reset", () => {
		const info = makeInfo({
			SpoofedAdIds: new Set(["stitched-ad-1", "stitched-ad-2"]),
			RecentSpoofedAdIds: new Map<string, number>(),
		});
		fn()(info);
		expect((info.SpoofedAdIds as Set<string>).size).toBe(0);
		const recent = info.RecentSpoofedAdIds as Map<string, number>;
		expect(recent.has("stitched-ad-1")).toBe(true);
		expect(recent.has("stitched-ad-2")).toBe(true);
	});

	it("caps the recent spoofed map and evicts the oldest entries", () => {
		const recent = new Map<string, number>();
		for (let i = 0; i < 49; i++) {
			recent.set(`old-${i}`, i);
		}
		const info = makeInfo({
			SpoofedAdIds: new Set(["n1", "n2", "n3", "n4", "n5"]),
			RecentSpoofedAdIds: recent,
		});
		fn()(info);
		expect(recent.size).toBe(50);
		expect(recent.has("old-0")).toBe(false);
		expect(recent.has("old-4")).toBe(true);
		for (const id of ["n1", "n2", "n3", "n4", "n5"]) {
			expect(recent.has(id)).toBe(true);
		}
	});
});

describe("_serveBounceDebouncedPlaylist (bounce window serving)", () => {
	const fn = () =>
		T<
			(
				info: Record<string, unknown>,
				realFetch: unknown,
				text: string,
				now: number,
			) => Promise<string | null>
		>("_serveBounceDebouncedPlaylist");

	let realRefresh: unknown;
	let realStrip: unknown;
	let refreshCalls = 0;
	let refreshResult: string | null = null;

	beforeEach(() => {
		realRefresh = g._refreshActiveBackupMediaPlaylist;
		realStrip = g._stripAds;
		refreshCalls = 0;
		refreshResult = null;
		g._refreshActiveBackupMediaPlaylist = async () => {
			refreshCalls++;
			return refreshResult;
		};
		g._stripAds = () => "STRIPPED";
		(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt =
			0;
		(g.__TTVAB_STATE__ as Record<string, unknown>).AdEndBounceDebounceMs = 0;
	});

	afterEach(() => {
		g._refreshActiveBackupMediaPlaylist = realRefresh;
		g._stripAds = realStrip;
		(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt =
			0;
	});

	function bounceInfo(overrides: Record<string, unknown> = {}) {
		return makeInfo({
			LastAdEndBounceAt: 100000,
			LastCleanBackupM3U8: "#SNAPSHOT",
			LastCleanBackupAt: 100000,
			...overrides,
		});
	}

	it("returns null outside the debounce window", async () => {
		const info = bounceInfo();
		expect(await fn()(info, null, "#NATIVE", 103000)).toBe(null);
		expect(refreshCalls).toBe(0);
	});

	it("returns null when no bounce has been recorded", async () => {
		const info = bounceInfo({ LastAdEndBounceAt: 0 });
		expect(await fn()(info, null, "#NATIVE", 100500)).toBe(null);
	});

	it("returns null when a stall force-refresh is pending so the search path can consume it", async () => {
		(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt =
			99000;
		const info = bounceInfo();
		expect(await fn()(info, null, "#NATIVE", 101000)).toBe(null);
		expect(refreshCalls).toBe(0);
		expect(
			(g.__TTVAB_STATE__ as Record<string, unknown>).BackupSearchForceRefreshAt,
		).toBe(99000);
	});

	it("serves the cached backup without refetching while it is fresh", async () => {
		const info = bounceInfo({ LastCleanBackupAt: 100400 });
		expect(await fn()(info, null, "#NATIVE", 101000)).toBe("#SNAPSHOT");
		expect(info.IsUsingBackupStream).toBe(true);
		expect(refreshCalls).toBe(0);
	});

	it("refreshes a stale backup instead of serving the snapshot", async () => {
		refreshResult = "#REFRESHED";
		const info = bounceInfo({ LastCleanBackupAt: 99000 });
		expect(await fn()(info, null, "#NATIVE", 101000)).toBe("#REFRESHED");
		expect(info.IsUsingBackupStream).toBe(true);
		expect(refreshCalls).toBe(1);
	});

	it("returns null when the stale backup fails to refresh so a new search can run", async () => {
		refreshResult = null;
		const info = bounceInfo({ LastCleanBackupAt: 99000 });
		expect(await fn()(info, null, "#NATIVE", 101000)).toBe(null);
		expect(refreshCalls).toBe(1);
	});

	it("strips the native playlist only when no clean backup exists", async () => {
		const info = bounceInfo({ LastCleanBackupM3U8: null });
		expect(await fn()(info, null, "#NATIVE", 101000)).toBe("STRIPPED");
	});

	it("never slides the bounce window forward", async () => {
		const info = bounceInfo({ LastCleanBackupAt: 100900 });
		await fn()(info, null, "#NATIVE", 101000);
		await fn()(info, null, "#NATIVE", 102500);
		expect(info.LastAdEndBounceAt).toBe(100000);
	});
});

describe("_findBackupStream (in-flight coalescing)", () => {
	type SearchResult = {
		type: string | null;
		m3u8: string | null;
	};
	const fn = () =>
		T<
			(
				info: Record<string, unknown>,
				realFetch: unknown,
				startIdx?: number,
				currentResolution?: unknown,
				codecOverride?: string | null,
			) => Promise<SearchResult>
		>("_findBackupStream");

	let realSearch: unknown;
	let searchCalls = 0;

	beforeEach(() => {
		realSearch = g._searchBackupStream;
		searchCalls = 0;
	});

	afterEach(() => {
		g._searchBackupStream = realSearch;
	});

	it("shares one in-flight search only when the full search key is identical", async () => {
		let resolveSearch: (value: SearchResult) => void = () => {};
		g._searchBackupStream = () => {
			searchCalls++;
			return new Promise<SearchResult>((r) => {
				resolveSearch = r;
			});
		};
		const info = makeInfo();
		const target = {
			Name: "chunked",
			Resolution: "2560x1440",
			Codecs: "hev1.1.6.L153.B0",
		};

		const p1 = fn()(info, null, 0, target, target.Codecs);
		const p2 = fn()(info, null, 0, { ...target }, target.Codecs);
		expect(searchCalls).toBe(1);

		resolveSearch({ type: "embed", m3u8: "#BACKUP" });
		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1).toBe(r2);
		expect(r1.m3u8).toBe("#BACKUP");
		expect(info._BackupSearchPromise).toBe(null);
		expect((info._BackupSearchPromises as Map<string, unknown>).size).toBe(0);
	});

	it("does not coalesce searches with different start, codec, or target keys", async () => {
		const resolvers: Array<(value: SearchResult) => void> = [];
		g._searchBackupStream = () => {
			searchCalls++;
			return new Promise<SearchResult>((resolve) => {
				resolvers.push(resolve);
			});
		};
		const info = makeInfo();
		const target1440 = {
			Name: "chunked",
			Resolution: "2560x1440",
			Codecs: "hev1.1.6.L153.B0",
		};
		const target1080 = {
			Name: "1080p60",
			Resolution: "1920x1080",
			Codecs: "hev1.1.6.L153.B0",
		};

		const pending = [
			fn()(info, null, 0, target1440, "hev1.1.6.L153.B0"),
			fn()(info, null, 2, target1440, "hev1.1.6.L153.B0"),
			fn()(info, null, 0, target1440, "av01.0.13M.08"),
			fn()(info, null, 0, target1080, "hev1.1.6.L153.B0"),
		];

		expect(searchCalls).toBe(4);
		expect((info._BackupSearchPromises as Map<string, unknown>).size).toBe(4);
		for (const [index, resolve] of resolvers.entries()) {
			resolve({ type: `type-${index}`, m3u8: `#BACKUP-${index}` });
		}
		const results = await Promise.all(pending);
		expect(results.map((result) => result.m3u8)).toEqual([
			"#BACKUP-0",
			"#BACKUP-1",
			"#BACKUP-2",
			"#BACKUP-3",
		]);
		expect(info._BackupSearchPromise).toBe(null);
		expect((info._BackupSearchPromises as Map<string, unknown>).size).toBe(0);
	});

	it("keeps a late enhanced search behind an active AVC handoff search", async () => {
		let resolveSearch: (value: SearchResult) => void = () => {};
		g._searchBackupStream = () => {
			searchCalls++;
			return new Promise<SearchResult>((resolve) => {
				resolveSearch = resolve;
			});
		};
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: 100,
			EnhancedDecoderCodecFamily: "hevc",
			EnhancedDecoderCodec: "hev1.1.6.L153.B0",
		});
		activateExactAdCycle(info, 100);
		const avcTarget = {
			Name: "1080p60",
			Resolution: "1920x1080",
			Codecs: "avc1.64002A,mp4a.40.2",
		};
		const hevcTarget = {
			Name: "chunked",
			Resolution: "2560x1440",
			Codecs: "hev1.1.6.L153.B0,mp4a.40.2",
		};

		const avcSearch = fn()(info, null, 0, avcTarget, avcTarget.Codecs);
		const lateEnhancedSearch = fn()(
			info,
			null,
			0,
			hevcTarget,
			hevcTarget.Codecs,
		);
		expect(searchCalls).toBe(1);
		expect((info._BackupSearchPromises as Map<string, unknown>).size).toBe(1);

		resolveSearch({ type: "embed", m3u8: "#AVC-BACKUP" });
		const [avcResult, lateEnhancedResult] = await Promise.all([
			avcSearch,
			lateEnhancedSearch,
		]);
		expect(avcResult).toEqual({ type: "embed", m3u8: "#AVC-BACKUP" });
		expect(lateEnhancedResult).toBe(avcResult);
		expect(info._BackupSearchPromise).toBe(null);
		expect((info._BackupSearchPromises as Map<string, unknown>).size).toBe(0);
	});

	it("live-refreshes held autoplay while the serialized AVC handoff search continues", async () => {
		const state = getState();
		const previousDisableAutoplay = state.DisableAutoplayBackup;
		state.DisableAutoplayBackup = false;
		let resolveSearch: (value: SearchResult) => void = () => {};
		g._searchBackupStream = () => {
			searchCalls++;
			return new Promise<SearchResult>((resolve) => {
				resolveSearch = resolve;
			});
		};
		const realRefresh = g._refreshHeldAutoplayBackupPlaylist;
		const refreshHeldAutoplay = vi.fn(async () => "#FRESH-AUTOPLAY");
		g._refreshHeldAutoplayBackupPlaylist = refreshHeldAutoplay;
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: 100,
			EnhancedDecoderCodecFamily: "hevc",
			EnhancedDecoderCodec: "hev1.1.6.L153.B0",
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupM3U8: "#STALE-AUTOPLAY",
			LastCleanBackupAt: 101,
		});
		activateExactAdCycle(info, 100);
		const avcTarget = {
			Name: "1080p60",
			Resolution: "1920x1080",
			Codecs: "avc1.64002A,mp4a.40.2",
		};
		const hevcTarget = {
			Name: "chunked",
			Resolution: "2560x1440",
			Codecs: "hev1.1.6.L153.B0,mp4a.40.2",
		};

		try {
			const avcSearch = fn()(info, null, 0, avcTarget, avcTarget.Codecs);
			const lateEnhancedSearch = fn()(
				info,
				null,
				0,
				hevcTarget,
				hevcTarget.Codecs,
			);
			const lateResult = await Promise.race([
				lateEnhancedSearch,
				new Promise<SearchResult>((resolve) =>
					setTimeout(() => resolve({ type: "timeout", m3u8: null }), 50),
				),
			]);

			expect(lateResult).toEqual({
				type: "autoplay",
				m3u8: "#FRESH-AUTOPLAY",
			});
			expect(searchCalls).toBe(1);
			expect(refreshHeldAutoplay).toHaveBeenCalledOnce();
			expect(info._BackupSearchPromise).not.toBeNull();

			resolveSearch({ type: "embed", m3u8: "#AVC-BACKUP" });
			await expect(avcSearch).resolves.toEqual({
				type: "embed",
				m3u8: "#AVC-BACKUP",
			});
			expect(info._BackupSearchPromise).toBe(null);
			expect((info._BackupSearchPromises as Map<string, unknown>).size).toBe(0);
		} finally {
			resolveSearch({ type: null, m3u8: null });
			g._refreshHeldAutoplayBackupPlaylist = realRefresh;
			state.DisableAutoplayBackup = previousDisableAutoplay;
		}
	});

	it("keeps a new ad cycle search owned when the prior epoch settles late", async () => {
		const resolvers: Array<(value: SearchResult) => void> = [];
		g._searchBackupStream = () => {
			searchCalls++;
			return new Promise<SearchResult>((resolve) => {
				resolvers.push(resolve);
			});
		};
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: 100,
			BackupSearchEpoch: 3,
		});
		activateExactAdCycle(info, 100);

		const staleCycleSearch = fn()(info, null);
		info.BackupSearchEpoch = 4;
		activateExactAdCycle(info, 200);
		const currentCycleSearch = fn()(info, null);

		expect(searchCalls).toBe(2);
		expect((info._BackupSearchPromises as Map<string, unknown>).size).toBe(2);

		resolvers[0]({ type: "stale", m3u8: "#STALE" });
		await expect(staleCycleSearch).resolves.toEqual({
			type: "stale",
			m3u8: "#STALE",
		});
		expect(info._BackupSearchPromise).not.toBeNull();
		expect(String(info._BackupSearchKey)).toContain("|4|200|");
		expect((info._BackupSearchPromises as Map<string, unknown>).size).toBe(1);

		resolvers[1]({ type: "current", m3u8: "#CURRENT" });
		await expect(currentCycleSearch).resolves.toEqual({
			type: "current",
			m3u8: "#CURRENT",
		});
		expect(info._BackupSearchPromise).toBeNull();
		expect(info._BackupSearchKey).toBeNull();
		expect((info._BackupSearchPromises as Map<string, unknown>).size).toBe(0);
	});

	it("starts a fresh search after the previous one settles", async () => {
		g._searchBackupStream = async () => {
			searchCalls++;
			return { type: "site", m3u8: "#A" };
		};
		const info = makeInfo();

		await fn()(info, null);
		await fn()(info, null);
		expect(searchCalls).toBe(2);
	});

	it("clears the in-flight slot when the search rejects", async () => {
		g._searchBackupStream = async () => {
			searchCalls++;
			throw new Error("token fetch failed");
		};
		const info = makeInfo();

		await expect(fn()(info, null)).rejects.toThrow("token fetch failed");
		expect(info._BackupSearchPromise).toBe(null);

		g._searchBackupStream = async () => {
			searchCalls++;
			return { type: "popout", m3u8: "#B" };
		};
		const recovered = await fn()(info, null);
		expect(recovered.m3u8).toBe("#B");
		expect(searchCalls).toBe(2);
	});
});

describe("ad counter call sites (continuation-guard invariant)", () => {
	it("processor increments the ads-blocked counter from exactly one guarded site", () => {
		const processorJs = readFileSync(
			resolve(__dirname, "../dist/src/modules/processor.js"),
			"utf8",
		);
		const callSites = processorJs.match(/_incrementAdsBlocked\(/g) || [];
		expect(callSites).toHaveLength(1);
	});
});

describe("processor tunables are seeded in state", () => {
	it("declares the silent-hold and bounce-debounce defaults", () => {
		const scope: Record<string, unknown> = {};
		T<(s: Record<string, unknown>) => void>("_declareState")(scope);
		const declared = scope.__TTVAB_STATE__ as Record<string, unknown>;
		expect(declared.IsAdStrippingEnabled).toBe(true);
		expect(declared.DisableAdSpoofing).toBe(false);
		expect(declared.DisableAutoplayBackup).toBe(false);
		expect(declared.AllowPreviewEmergencyAutoplayBackup).toBe(false);
		expect(declared.SilentBackupHoldMaxMs).toBe(120000);
		expect(declared.AdEndBounceDebounceMs).toBe(3000);
		expect(declared.ActiveCodecHandoffId).toBe(null);
		expect(declared.ActiveCodecHandoffChannel).toBe(null);
		expect(declared.ActiveCodecHandoffMediaKey).toBe(null);
	});
});

describe("backup search pre-warm during the clean-native bridge", () => {
	const bridgeUrl = "https://video-weaver.example/v1/playlist/native-live.m3u8";
	const cleanNative = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		"#EXTINF:2.000,live",
		"https://edge.example/native-live-1.ts",
	].join("\n");
	const cleanBackup = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		"#EXTINF:2.000,live",
		"https://edge.example/backup-live-1.ts",
	].join("\n");
	const adLadenNative = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		'#EXT-X-DATERANGE:ID="stitched-ad-99",CLASS="twitch-stitched-ad",START-DATE="2026-06-12T00:00:00Z"',
		"#EXTINF:2.000,",
		"https://edge.example/stitched-ad-99.ts",
		"#EXTINF:2.000,live",
		"https://edge.example/native-live-2.ts",
	].join("\n");
	const csaiOnlyAdNative = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		"#EXT-X-MEDIA-SEQUENCE:99",
		'#EXT-X-DATERANGE:ID="stitched-ad-99",CLASS="twitch-stitched-ad",START-DATE="2026-06-12T00:00:00Z"',
		"#EXTINF:2.000,live",
		"https://edge.example/stitched-ad-99.ts",
	].join("\n");
	const fetchStub = async () => new Response(null, { status: 404 });

	let previousGetInfo: unknown;
	let previousNotify: unknown;

	beforeEach(() => {
		previousGetInfo = g._getStreamInfoForPlaylist;
		previousNotify = g._notifyAdComplete;
		g._notifyAdComplete = async () => {};
		getState().CurrentAdChannel = null;
		getState().CurrentAdMediaKey = null;
	});

	afterEach(() => {
		if (previousGetInfo === undefined) {
			delete g._getStreamInfoForPlaylist;
		} else {
			g._getStreamInfoForPlaylist = previousGetInfo;
		}
		if (previousNotify === undefined) {
			delete g._notifyAdComplete;
		} else {
			g._notifyAdComplete = previousNotify;
		}
	});

	it("starts the backup search once while bridging on the clean native playlist", async () => {
		const info = makeInfo({
			LastCleanNativeM3U8: cleanNative,
			LastCleanNativeUrl: bridgeUrl,
			LastCleanNativePlaylistAt: Date.now(),
		});
		declareAvcPlaybackUrl(info, bridgeUrl);
		g._getStreamInfoForPlaylist = () => info;
		const findCalls: unknown[][] = [];
		g._findBackupStream = (...args: unknown[]) => {
			findCalls.push(args);
			return new Promise(() => {});
		};

		const core =
			T<(url: string, text: string, realFetch: unknown) => Promise<string>>(
				"_processM3U8Core",
			);
		const first = await core(bridgeUrl, adLadenNative, fetchStub);
		expect(first).toBe(cleanNative);
		expect(findCalls.length).toBe(1);
		expect(findCalls[0]?.[2]).toBe(0);
		expect(Number(info._BackupSearchStartedAt)).toBeGreaterThan(0);

		const second = await core(bridgeUrl, adLadenNative, fetchStub);
		expect(second).toBe(cleanNative);
		expect(findCalls.length).toBe(1);
	});

	it("keeps a fresh exact native bridge flowing when CSAI stripping would create an empty media segment", async () => {
		const info = makeInfo({
			LastCleanNativeM3U8: cleanNative,
			LastCleanNativeUrl: bridgeUrl,
			LastCleanNativePlaylistAt: Date.now(),
		});
		declareAvcPlaybackUrl(info, bridgeUrl);
		g._getStreamInfoForPlaylist = () => info;
		const findCalls: unknown[][] = [];
		g._findBackupStream = (...args: unknown[]) => {
			findCalls.push(args);
			return new Promise(() => {});
		};

		const core =
			T<(url: string, text: string, realFetch: unknown) => Promise<string>>(
				"_processM3U8Core",
			);
		const output = await core(bridgeUrl, csaiOnlyAdNative, fetchStub);

		expect(output).toBe(cleanNative);
		expect(output).not.toContain("__ttvab_empty_hold_segment.mp4");
		expect(output).not.toContain("stitched-ad-99.ts");
		expect(info.CsaiOnlyThisBreak).toBe(true);
		expect(findCalls).toHaveLength(1);
	});

	it("keeps cold-start CSAI fail-closed when the exact native cache is stale", async () => {
		const info = makeInfo({
			LastCleanNativeM3U8: cleanNative,
			LastCleanNativeUrl: bridgeUrl,
			LastCleanNativePlaylistAt: Date.now() - 3000,
		});
		declareAvcPlaybackUrl(info, bridgeUrl);
		g._getStreamInfoForPlaylist = () => info;
		const findCalls: unknown[][] = [];
		g._findBackupStream = (...args: unknown[]) => {
			findCalls.push(args);
			return new Promise(() => {});
		};

		const core =
			T<(url: string, text: string, realFetch: unknown) => Promise<string>>(
				"_processM3U8Core",
			);
		const output = await core(bridgeUrl, csaiOnlyAdNative, fetchStub);

		expect(output).not.toBe(cleanNative);
		expect(output).toContain("__ttvab_empty_hold_segment.mp4");
		expect(output).not.toContain("stitched-ad-99.ts");
		expect(info.CsaiOnlyThisBreak).toBe(true);
		expect(findCalls).toHaveLength(1);
	});

	it("keeps a VOD advancing on clean native media while its backup search starts", async () => {
		const state = getState();
		const previousPageContext = {
			PageMediaType: state.PageMediaType,
			PageChannel: state.PageChannel,
			PageVodID: state.PageVodID,
			PageMediaKey: state.PageMediaKey,
		};
		const info = makeInfo({
			MediaType: "vod",
			ChannelName: null,
			VodID: "2827992810",
			MediaKey: "vod:2827992810",
			LastCleanNativeM3U8: cleanNative,
			LastCleanNativeUrl: bridgeUrl,
			LastCleanNativePlaylistAt: Date.now(),
		});
		declareAvcPlaybackUrl(info, bridgeUrl);
		g._getStreamInfoForPlaylist = () => info;
		const findCalls: unknown[][] = [];
		g._findBackupStream = (...args: unknown[]) => {
			findCalls.push(args);
			return new Promise(() => {});
		};
		state.PageMediaType = "vod";
		state.PageChannel = null;
		state.PageVodID = "2827992810";
		state.PageMediaKey = "vod:2827992810";

		try {
			const core =
				T<(url: string, text: string, realFetch: unknown) => Promise<string>>(
					"_processM3U8Core",
				);
			const output = await core(bridgeUrl, adLadenNative, fetchStub);

			expect(output).toBe(cleanNative);
			expect(output).toContain("native-live-1.ts");
			expect(output).not.toContain("stitched-ad-99.ts");
			expect(findCalls).toHaveLength(1);
			expect(state.CurrentAdMediaKey).toBe("vod:2827992810");
		} finally {
			Object.assign(state, previousPageContext);
		}
	});

	it("serves the pre-warmed backup as soon as it is ready instead of waiting out the bridge", async () => {
		const cycleStartedAt = Date.now() - 1000;
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleStartedAt,
			LastCleanNativeM3U8: cleanNative,
			LastCleanNativeUrl: bridgeUrl,
			LastCleanNativePlaylistAt: Date.now(),
			LastCleanBackupM3U8: cleanBackup,
			LastCleanBackupPlayerType: "embed",
			LastCleanBackupAt: Date.now() - 100,
			_BackupSearchStartedAt: Date.now() - 500,
		});
		declareAvcPlaybackUrl(info, bridgeUrl);
		activateExactAdCycle(info, cycleStartedAt);
		g._getStreamInfoForPlaylist = () => info;
		g._findBackupStream = async () => ({ type: "embed", m3u8: cleanBackup });

		const core =
			T<(url: string, text: string, realFetch: unknown) => Promise<string>>(
				"_processM3U8Core",
			);
		const out = await core(bridgeUrl, adLadenNative, fetchStub);
		expect(out).not.toBe(cleanNative);
		expect(String(out)).toContain("https://edge.example/backup-live-1.ts");
	});

	it("keeps the decoder rebuild latched after a below-native autoplay bridge is promoted", async () => {
		const cycleStartedAt = Date.now() - 1000;
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleStartedAt,
			LastCleanNativeM3U8: cleanNative,
			LastCleanNativeUrl: bridgeUrl,
			LastCleanNativePlaylistAt: Date.now(),
			LastCleanBackupM3U8: cleanBackup,
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupResolution: "640x360",
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupCodec: "avc1.4d401f",
			LastCleanBackupAt: Date.now() - 100,
			SustainedNativeResolution: {
				Resolution: "1920x1080",
				Codecs: "avc1.64002a,mp4a.40.2",
			},
			_BackupSearchStartedAt: Date.now() - 500,
		});
		declareAvcPlaybackUrl(info, bridgeUrl);
		activateExactAdCycle(info, cycleStartedAt);
		g._getStreamInfoForPlaylist = () => info;
		g._findBackupStream = async () => ({
			type: "autoplay",
			m3u8: cleanBackup,
		});

		const core =
			T<(url: string, text: string, realFetch: unknown) => Promise<string>>(
				"_processM3U8Core",
			);
		const out = await core(bridgeUrl, adLadenNative, fetchStub);

		expect(out).toContain("https://edge.example/backup-live-1.ts");
		expect(info.HevcReloadPendingAfterHold).toBe(true);
		info.ActiveBackupPlayerType = "mobile_web";
		info.ActiveBackupResolution = "1920x1080";
		expect(info.HevcReloadPendingAfterHold).toBe(true);
	});

	it("keeps bridging on clean native while the pre-warmed search is still in flight", async () => {
		const info = makeInfo({
			LastCleanNativeM3U8: cleanNative,
			LastCleanNativeUrl: bridgeUrl,
			LastCleanNativePlaylistAt: Date.now(),
			_BackupSearchStartedAt: Date.now() - 500,
		});
		declareAvcPlaybackUrl(info, bridgeUrl);
		g._getStreamInfoForPlaylist = () => info;
		const findCalls: unknown[][] = [];
		g._findBackupStream = (...args: unknown[]) => {
			findCalls.push(args);
			return new Promise(() => {});
		};

		const core =
			T<(url: string, text: string, realFetch: unknown) => Promise<string>>(
				"_processM3U8Core",
			);
		const out = await core(bridgeUrl, adLadenNative, fetchStub);
		expect(out).toBe(cleanNative);
		expect(findCalls.length).toBe(0);
	});
});

describe("_degradeToDecodableResolution (enhanced-codec backup targeting)", () => {
	const fn = () =>
		T<
			(
				info: unknown,
				entry: unknown,
				resolutionList: unknown,
			) => Record<string, unknown> | null
		>("_degradeToDecodableResolution");

	const hevc1440 = {
		Name: "chunked",
		Resolution: "2560x1440",
		FrameRate: 60,
		Codecs: "hev1.1.6.L153.B0",
	};
	const av11440 = {
		Name: "1440p60",
		Resolution: "2560x1440",
		FrameRate: 60,
		Codecs: "av01.0.13M.08",
	};
	const avc1080 = {
		Name: "1080p60",
		Resolution: "1920x1080",
		FrameRate: 60,
		Codecs: "avc1.4D402A",
	};
	const avc720 = {
		Name: "720p60",
		Resolution: "1280x720",
		FrameRate: 60,
		Codecs: "avc1.4D401F",
	};
	const avc360 = {
		Name: "360p30",
		Resolution: "640x360",
		FrameRate: 30,
		Codecs: "avc1.4D401E",
	};
	const ladder = [hevc1440, av11440, avc1080, avc720, avc360];

	it("degrades an HEVC target to the highest AVC rung under it so the AVC-reloaded player can decode the backup", () => {
		const info = makeInfo({
			ModifiedM3U8: "#EXTM3U",
			IsUsingModifiedM3U8: true,
		});
		expect(fn()(info, hevc1440, ladder)).toBe(avc1080);
	});

	it("degrades AV1 identically because neither AV1 nor HEVC splices into an AVC pipeline", () => {
		const info = makeInfo({
			ModifiedM3U8: "#EXTM3U",
			IsUsingModifiedM3U8: true,
		});
		expect(fn()(info, av11440, ladder)).toBe(avc1080);
	});

	it("leaves an enhanced target alone when no AVC fallback master exists to reload onto", () => {
		expect(fn()(makeInfo(), hevc1440, ladder)).toBe(hevc1440);
	});

	it("keeps the enhanced target when the ladder offers no AVC rung at all", () => {
		const info = makeInfo({
			ModifiedM3U8: "#EXTM3U",
			IsUsingModifiedM3U8: true,
		});
		expect(fn()(info, hevc1440, [hevc1440, av11440])).toBe(hevc1440);
	});

	it("never promotes an already-decodable target to a higher rung", () => {
		const info = makeInfo({
			ModifiedM3U8: "#EXTM3U",
			IsUsingModifiedM3U8: true,
		});
		expect(fn()(info, avc720, ladder)).toBe(avc720);
	});

	it("degrades below the ceiling only, so a 1080p enhanced target cannot become 1440p", () => {
		const enhanced1080 = {
			Name: "1080p60",
			Resolution: "1920x1080",
			FrameRate: 60,
			Codecs: "hvc1.2.4.L120.B0",
		};
		const info = makeInfo({
			ModifiedM3U8: "#EXTM3U",
			IsUsingModifiedM3U8: true,
		});
		expect(fn()(info, enhanced1080, [hevc1440, enhanced1080, avc720])).toBe(
			avc720,
		);
	});

	it("does not degrade an enhanced target just because an AVC fallback was prepared", () => {
		const info = makeInfo({
			ModifiedM3U8: "#EXTM3U",
			IsUsingModifiedM3U8: false,
			EnhancedDecoderCodecFamily: "hevc",
		});
		expect(fn()(info, hevc1440, ladder)).toBe(hevc1440);
	});

	describe("Source quality on an enhanced stream", () => {
		const fallback = () =>
			T<(info: unknown, url: string) => Record<string, unknown> | null>(
				"_getFallbackResolution",
			);
		const preferred = () =>
			T<(info: unknown, floor?: number) => Record<string, unknown> | null>(
				"_resolvePreferredBackupResolution",
			);

		let previousQualityGroup: unknown;

		beforeEach(() => {
			previousQualityGroup = getState().PreferredQualityGroup;
		});

		afterEach(() => {
			getState().PreferredQualityGroup = previousQualityGroup;
		});

		it("keeps Source enhanced while an AVC fallback master is only prepared", () => {
			getState().PreferredQualityGroup = "chunked";
			const info = makeInfo({
				ResolutionList: ladder,
				ModifiedM3U8: "#EXTM3U",
				IsUsingModifiedM3U8: false,
				EnhancedDecoderCodecFamily: "hevc",
			});
			expect(fallback()(info, "")).toBe(hevc1440);
			expect(preferred()(info)).toBe(hevc1440);
		});

		it("resolves Source to AVC only while the fallback master is active", () => {
			getState().PreferredQualityGroup = "chunked";
			const info = makeInfo({
				ResolutionList: ladder,
				ModifiedM3U8: "#EXTM3U",
				IsUsingModifiedM3U8: true,
			});
			expect(fallback()(info, "")).toBe(avc1080);
			expect(preferred()(info)).toBe(avc1080);
		});

		it("still honours Source verbatim on an AVC-only stream that never built a fallback master", () => {
			getState().PreferredQualityGroup = "chunked";
			const info = makeInfo({ ResolutionList: ladder });
			expect(fallback()(info, "")).toBe(hevc1440);
		});

		it("degrades a sustained enhanced native rung only after the AVC master is active", () => {
			getState().PreferredQualityGroup = null;
			const info = makeInfo({
				ResolutionList: ladder,
				ModifiedM3U8: "#EXTM3U",
				IsUsingModifiedM3U8: true,
				SustainedNativeResolution: hevc1440,
			});
			expect(preferred()(info)).toBe(avc1080);
		});
	});
});

describe("_processM3U8Core explicit ad metadata", () => {
	const explicitAdPlaylist = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		"#EXT-X-MEDIA-SEQUENCE:900",
		"#EXT-X-CUE-OUT:DURATION=4",
		"#EXTINF:2.000,live",
		"https://cdn.example/media/segment-900.ts",
		"#EXTINF:2.000,live",
		"https://cdn.example/media/segment-901.ts",
		"#EXT-X-CUE-IN",
	].join("\n");

	it("never promotes or directly serves neutral media URLs inside a CUE-marked ad window", async () => {
		const url =
			"https://video-weaver.example/v1/playlist/neutral-cue-window.m3u8";
		const info = makeInfo();
		declareAvcPlaybackUrl(info, url);
		const previousGetInfo = g._getStreamInfoForPlaylist;
		const previousFind = g._findBackupStream;
		g._getStreamInfoForPlaylist = () => info;
		g._findBackupStream = vi.fn(async () => ({
			type: null,
			m3u8: null,
		}));
		const core =
			T<
				(
					url: string,
					text: string,
					realFetch: (input: string) => Promise<Response>,
				) => Promise<string>
			>("_processM3U8Core");

		try {
			const out = await core(
				url,
				explicitAdPlaylist,
				async () => new Response(null, { status: 404 }),
			);

			expect(out).not.toContain("segment-900.ts");
			expect(out).not.toContain("segment-901.ts");
			expect(info.LastCleanNativeM3U8).toBe(null);
			expect(info.LastCleanNativeUrl).toBe(null);
			expect(info.IsShowingAd).toBe(true);
		} finally {
			g._getStreamInfoForPlaylist = previousGetInfo;
			g._findBackupStream = previousFind;
		}
	});

	it("does not preserve neutral explicit-ad media in enhanced fail-closed mode", () => {
		const stripAds =
			T<
				(
					text: string,
					stripAll: boolean,
					info: Record<string, unknown>,
					skipAutoForceStrip: boolean,
					preserveLiveSegments: boolean,
				) => string
			>("_stripAds");
		const out = stripAds(explicitAdPlaylist, true, makeInfo(), false, true);

		expect(out).not.toContain("segment-900.ts");
		expect(out).not.toContain("segment-901.ts");
	});
});

describe("enhanced-codec handoff in _processM3U8", () => {
	const core = () =>
		T<
			(
				url: string,
				text: string,
				fetchFn: (input: string) => Promise<Response>,
			) => Promise<string>
		>("_processM3U8Core");
	const process = () =>
		T<
			(
				url: string,
				text: string,
				fetchFn: (input: string) => Promise<Response>,
				signal?: AbortSignal | null,
			) => Promise<string>
		>("_processM3U8");
	const hold = () =>
		T<
			(
				info: Record<string, unknown>,
				url: string,
				text: string,
				codecs: string,
				isEnhanced: boolean,
				signal: AbortSignal | null,
				handoffId: string,
			) => Promise<string>
		>("_holdRetiringCodecRequest");
	const clearHandoff = () =>
		T<(info: Record<string, unknown>, handoffId?: string | null) => boolean>(
			"_clearCodecHandoffState",
		);
	const createHandoffId = () =>
		T<(info: Record<string, unknown>) => string>("_createCodecHandoffId");
	const markHandoffFailed = () =>
		T<(info: Record<string, unknown>, handoffId: string) => boolean>(
			"_markCodecHandoffReloadFailed",
		);
	const isHandoffAdRecoveryActive = () =>
		T<(info: Record<string, unknown>, requestWasAdMarked?: boolean) => boolean>(
			"_isCodecHandoffAdRecoveryActive",
		);
	const requestHandoffReload = () =>
		T<(info: Record<string, unknown>) => string | null>(
			"_requestCodecHandoffReload",
		);

	const bridgeUrl = "https://video-weaver.example/v1/playlist/hevc-live.m3u8";
	const avcUrl = "https://video-weaver.example/v1/playlist/avc-live.m3u8";
	const adLadenNative = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		'#EXT-X-DATERANGE:ID="stitched-ad-99",CLASS="twitch-stitched-ad",START-DATE="2026-06-12T00:00:00Z"',
		"#EXTINF:2.000,",
		"https://edge.example/stitched-ad-99.ts",
		"#EXTINF:2.000,live",
		"https://edge.example/native-live-2.ts",
	].join("\n");
	const allAdNative = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		'#EXT-X-DATERANGE:ID="stitched-ad-100",CLASS="twitch-stitched-ad",START-DATE="2026-06-12T00:00:00Z"',
		"#EXTINF:2.000,",
		"https://edge.example/stitched-ad-100.ts",
	].join("\n");
	const mixedOpaqueAdNative = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		'#EXT-X-DATERANGE:ID="stitched-ad-101",CLASS="twitch-stitched-ad"',
		"#EXTINF:2.000,live",
		"https://edge.example/stitched-ad-101.ts",
		"#EXTINF:2.000,",
		"https://opaque.example/content-102.ts",
		"#EXTINF:2.000,live",
		"https://edge.example/native-live-103.ts",
	].join("\n");
	const cleanBackup = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		"#EXT-X-MEDIA-SEQUENCE:500",
		"#EXTINF:2.000,live",
		"https://edge.example/avc-backup-500.ts",
	].join("\n");
	const fetchStub = async () => new Response(null, { status: 404 });
	const hevcSource = {
		Name: "chunked",
		Resolution: "2560x1440",
		FrameRate: 60,
		Codecs: "hev1.1.6.L153.B0",
	};
	const avcSource = {
		Name: "1080p60",
		Resolution: "1920x1080",
		FrameRate: 60,
		Codecs: "avc1.4D402A",
	};

	let previousGetInfo: unknown;
	let previousNotify: unknown;
	let previousFind: unknown;
	let previousPlayed: unknown;
	let previousPlaying: unknown;
	let previousPostMessage: unknown;
	let previousBridgeMessage: unknown;
	let previousPageEvent: unknown;

	beforeEach(() => {
		previousGetInfo = g._getStreamInfoForPlaylist;
		previousNotify = g._notifyAdComplete;
		previousFind = g._findBackupStream;
		previousPlayed = getState().PlayerHasPlayedOnce;
		previousPlaying = getState().PlayerIsPlaying;
		previousPostMessage = g.postMessage;
		previousBridgeMessage = g._postWorkerBridgeMessage;
		previousPageEvent = g._createPageScopedWorkerEvent;
		g._notifyAdComplete = async () => {};
		g._findBackupStream = async () => ({ type: null, m3u8: null });
		g.postMessage = () => {};
		g._postWorkerBridgeMessage = vi.fn();
		g._createPageScopedWorkerEvent = (value: unknown) => value;
		getState().CurrentAdChannel = null;
		getState().CurrentAdMediaKey = null;
		getState().ActiveCodecHandoffId = null;
		getState().ActiveCodecHandoffChannel = null;
		getState().ActiveCodecHandoffMediaKey = null;
		getState().SegmentCodecOwners = new Map();
		getState().DisableAutoplayBackup = false;
	});

	afterEach(() => {
		if (previousGetInfo === undefined) {
			delete g._getStreamInfoForPlaylist;
		} else {
			g._getStreamInfoForPlaylist = previousGetInfo;
		}
		if (previousNotify === undefined) {
			delete g._notifyAdComplete;
		} else {
			g._notifyAdComplete = previousNotify;
		}
		if (previousFind === undefined) {
			delete g._findBackupStream;
		} else {
			g._findBackupStream = previousFind;
		}
		getState().PlayerHasPlayedOnce = previousPlayed;
		getState().PlayerIsPlaying = previousPlaying;
		getState().ActiveCodecHandoffId = null;
		getState().ActiveCodecHandoffChannel = null;
		getState().ActiveCodecHandoffMediaKey = null;
		g.postMessage = previousPostMessage;
		g._postWorkerBridgeMessage = previousBridgeMessage;
		g._createPageScopedWorkerEvent = previousPageEvent;
	});

	const makeEnhancedInfo = (overrides: Record<string, unknown> = {}) =>
		makeInfo({
			ResolutionList: [hevcSource, avcSource],
			ModifiedM3U8: "#EXTM3U",
			EnhancedDecoderCodecFamily: "hevc",
			EnhancedDecoderCodec: hevcSource.Codecs,
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupCodec: avcSource.Codecs.toLowerCase(),
			Urls: {
				[bridgeUrl]: hevcSource,
				[avcUrl]: avcSource,
			},
			EnhancedVariantUrls: new Set([bridgeUrl]),
			...overrides,
		});
	const reloadMessages = () =>
		(g._postWorkerBridgeMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
			(call) => (call[1] as Record<string, unknown>)?.key === "ReloadPlayer",
		);
	const installCleanBackup = (info: Record<string, unknown>) => {
		const findBackup = vi.fn(async () => {
			info.LastCleanBackupM3U8 = cleanBackup;
			info.LastCleanBackupPlayerType = "autoplay";
			info.LastCleanBackupCodecFamily = "avc";
			info.LastCleanBackupCodec = avcSource.Codecs.toLowerCase();
			info.LastCleanBackupAt = Date.now();
			T<
				(
					info: Record<string, unknown>,
					m3u8: string,
					codecFamily: string,
					codec: string,
				) => string
			>("_rememberBackupPlaylistMetadata")(
				info,
				cleanBackup,
				"avc",
				avcSource.Codecs,
			);
			return { type: "autoplay", m3u8: cleanBackup };
		});
		g._findBackupStream = findBackup;
		return findBackup;
	};
	const activateAdContext = (
		info: Record<string, unknown>,
		cycleStartedAt = Math.max(1, Number(info.VisibleAdStartedAt) || Date.now()),
	) => activateExactAdCycle(info, cycleStartedAt);
	const makeNativeAliasCollisionInfo = (
		nativeUrl: string,
		backupUrl: string,
		cycleStartedAt: number,
		overrides: Record<string, unknown> = {},
	) => {
		const aliases = T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			backupUrl,
		);
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleStartedAt,
			Urls: { [new URL(nativeUrl).pathname]: avcSource },
			ResolutionList: [avcSource],
			EnhancedVariantUrls: new Set(),
			EnhancedDecoderCodecFamily: null,
			EnhancedDecoderCodec: null,
			ModifiedM3U8: null,
			BackupVariantUrls: new Set(aliases),
			LastAdPodProgressAt: 1,
			...overrides,
		});
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info, cycleStartedAt);
		return { aliases, info };
	};
	const activateHandoffContext = (
		info: Record<string, unknown>,
		handoffId: string,
	) => {
		activateAdContext(info);
		getState().ActiveCodecHandoffId = handoffId;
		getState().ActiveCodecHandoffChannel = String(info.ChannelName);
		getState().ActiveCodecHandoffMediaKey = String(info.MediaKey);
	};
	const abortRetiringRequestOnReload = (
		info: Record<string, unknown>,
		controller: AbortController,
	) => {
		g._postWorkerBridgeMessage = vi.fn(
			(_target: unknown, message: Record<string, unknown>) => {
				if (message?.key !== "ReloadPlayer") return;
				const handoffId = String(message.handoffId);
				info._CodecHandoffAcknowledgedId = handoffId;
				controller.abort();
			},
		);
	};

	it("strips recognized and opaque non-live ad segments while preserving the live enhanced segment", async () => {
		const info = makeEnhancedInfo();
		g._getStreamInfoForPlaylist = () => info;

		const out = await core()(bridgeUrl, mixedOpaqueAdNative, fetchStub);

		expect(out).not.toContain("stitched-ad-101.ts");
		expect(out).not.toContain("content-102.ts");
		expect(out).toContain("native-live-103.ts");
		expect(Number(info.NumStrippedAdSegments)).toBeGreaterThan(0);
	});

	it.each([
		["hevc", bridgeUrl, hevcSource],
		[
			"av1",
			"https://video-weaver.example/v1/playlist/av1-live.m3u8",
			{
				Name: "chunked",
				Resolution: "2560x1440",
				FrameRate: 60,
				Codecs: "av01.0.13M.08",
			},
		],
	])(
		"records explicit ad segment ownership for a processed %s rendition",
		async (codecFamily, renditionUrl, rendition) => {
			const info = makeEnhancedInfo({
				ResolutionList: [rendition, avcSource],
				Urls: {
					[renditionUrl]: rendition,
					[avcUrl]: avcSource,
				},
				EnhancedVariantUrls: new Set([renditionUrl]),
			});
			g._getStreamInfoForPlaylist = () => info;

			await core()(renditionUrl, allAdNative, fetchStub);

			const exactKey = T<(url: string) => string>("_getExactPlaylistUrlKey")(
				"https://edge.example/stitched-ad-100.ts",
			);
			const owners = getState().SegmentCodecOwners as Map<
				string,
				Record<string, unknown>
			>;
			expect(owners.get(exactKey)).toMatchObject({
				codecFamily,
				mediaKey: "live:testchannel",
				ambiguous: false,
			});
			expect(Number(owners.get(exactKey)?.recordedAt)).toBeGreaterThan(0);
		},
	);

	it("aborts ad media with an unresolved rendition codec instead of returning an AVC hold", async () => {
		const unknownUrl =
			"https://video-weaver.example/v1/playlist/unresolved-live.m3u8";
		const info = makeInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 1000,
			ResolutionList: [],
			Urls: Object.create(null),
			EnhancedVariantUrls: new Set(),
		});
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info);

		await expect(
			process()(unknownUrl, allAdNative, fetchStub),
		).rejects.toMatchObject({ name: "AbortError" });
	});

	it("never serves an AVC empty hold when a rotated URL loses direct HEVC ownership", async () => {
		const rotatedUrl =
			"https://video-weaver.example/v1/playlist/rotated-live.m3u8?token=next";
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 1000,
			Urls: Object.create(null),
			EnhancedVariantUrls: new Set(),
			SustainedNativeResolution: hevcSource,
			LastCleanBackupM3U8: null,
			LastCleanBackupAt: 0,
		});
		const controller = new AbortController();
		const realWait = T<
			(ms: number, signal?: AbortSignal | null) => Promise<void>
		>("_waitForAbortableDelay");
		let markUnsafeHoldEntered: (() => void) | null = null;
		const unsafeHoldEntered = new Promise<void>((resolve) => {
			markUnsafeHoldEntered = resolve;
		});
		g._waitForAbortableDelay = (ms: number, signal?: AbortSignal | null) => {
			markUnsafeHoldEntered?.();
			markUnsafeHoldEntered = null;
			return realWait(ms, signal);
		};
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info);

		try {
			const pending = process()(
				rotatedUrl,
				allAdNative,
				fetchStub,
				controller.signal,
			);
			const outcome = await Promise.race([
				pending.then(
					() => "returned",
					() => "rejected",
				),
				unsafeHoldEntered.then(() => "held"),
			]);

			expect(outcome).toBe("held");
			controller.abort();
			await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		} finally {
			g._waitForAbortableDelay = realWait;
		}
	});

	it("quarantines media from a rotated URL without explicit codec proof", async () => {
		const rotatedUrl =
			"https://video-weaver.example/v1/playlist/rotated-live.m3u8?token=next";
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 1000,
			Urls: Object.create(null),
			EnhancedVariantUrls: new Set(),
			SustainedNativeResolution: hevcSource,
			LastCleanBackupM3U8: null,
			LastCleanBackupAt: 0,
		});
		const controller = new AbortController();
		const realCore = g._processM3U8Core;
		const realWait = T<
			(ms: number, signal?: AbortSignal | null) => Promise<void>
		>("_waitForAbortableDelay");
		let markUnsafeHoldEntered: (() => void) | null = null;
		const unsafeHoldEntered = new Promise<void>((resolve) => {
			markUnsafeHoldEntered = resolve;
		});
		g._processM3U8Core = async () => makePlaylist(900, 3);
		g._waitForAbortableDelay = (ms: number, signal?: AbortSignal | null) => {
			markUnsafeHoldEntered?.();
			markUnsafeHoldEntered = null;
			return realWait(ms, signal);
		};
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info);

		try {
			const pending = process()(
				rotatedUrl,
				allAdNative,
				fetchStub,
				controller.signal,
			);
			const outcome = await Promise.race([
				pending.then(
					() => "returned",
					() => "rejected",
				),
				unsafeHoldEntered.then(() => "held"),
			]);

			expect(outcome).toBe("held");
			controller.abort();
			await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		} finally {
			g._processM3U8Core = realCore;
			g._waitForAbortableDelay = realWait;
		}
	});

	it("serves a fresh exact-codec backup to a rotated enhanced loader", async () => {
		const rotatedUrl =
			"https://video-weaver.example/v1/playlist/rotated-live.m3u8?token=next";
		const exactHevcBackup = cleanBackup.replaceAll("avc-backup", "hevc-backup");
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 1000,
			Urls: Object.create(null),
			EnhancedVariantUrls: new Set(),
			LastCleanBackupM3U8: exactHevcBackup,
			LastCleanBackupPlayerType: "site",
			LastCleanBackupCodecFamily: "hevc",
			LastCleanBackupCodec: hevcSource.Codecs.toLowerCase(),
			LastCleanBackupAt: Date.now(),
		});
		T<
			(
				info: Record<string, unknown>,
				m3u8: string,
				codecFamily: string,
				codec: string,
			) => string
		>("_rememberBackupPlaylistMetadata")(
			info,
			exactHevcBackup,
			"hevc",
			hevcSource.Codecs,
		);
		const realCore = g._processM3U8Core;
		g._processM3U8Core = async () => exactHevcBackup;
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info);

		try {
			const out = await process()(rotatedUrl, allAdNative, fetchStub);

			expect(out).toContain("hevc-backup-500.ts");
			expect(out).not.toContain("stitched-ad-100.ts");
			expect(reloadMessages()).toHaveLength(0);
		} finally {
			g._processM3U8Core = realCore;
		}
	});

	it("uses an opaque cached ad segment only for its exact active media cycle", async () => {
		const opaqueAdUrl = "https://edge.example/opaque/cycle-ad-100.ts";
		const opaqueAdPlaylist = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:100",
			"#EXTINF:2.000,",
			opaqueAdUrl,
		].join("\n");
		const mismatchedHevcBackup = cleanBackup.replaceAll(
			"avc-backup",
			"hevc-backup",
		);
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: 100,
			EnhancedDecoderCodecFamily: null,
			EnhancedDecoderCodec: null,
			LastCleanBackupM3U8: mismatchedHevcBackup,
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupCodecFamily: "hevc",
			LastCleanBackupCodec: hevcSource.Codecs.toLowerCase(),
			LastCleanBackupAt: Date.now(),
		});
		T<
			(
				info: Record<string, unknown>,
				m3u8: string,
				codecFamily: string,
				codec: string,
			) => string
		>("_rememberBackupPlaylistMetadata")(
			info,
			mismatchedHevcBackup,
			"hevc",
			hevcSource.Codecs,
		);
		activateAdContext(info, 100);
		getState().AdSegmentCache = new Map([[opaqueAdUrl, Date.now()]]);
		g._getStreamInfoForPlaylist = () => info;
		const realCore = g._processM3U8Core;
		g._processM3U8Core = async () => mismatchedHevcBackup;

		try {
			const activeResult = await process()(avcUrl, opaqueAdPlaylist, fetchStub);
			expect(activeResult).not.toContain(opaqueAdUrl);
			expect(activeResult).toContain("__ttvab_empty_hold_segment.mp4");

			info.IsShowingAd = false;
			info.IsHoldingBackupAfterAd = false;
			info.VisibleAdStartedAt = 0;
			getState().CurrentAdChannel = null;
			getState().CurrentAdMediaKey = null;
			delete (getState().AdPodProgressByMediaKey as Record<string, unknown>)[
				"live:testchannel"
			];

			const staleResult = await process()(avcUrl, opaqueAdPlaylist, fetchStub);
			expect(staleResult).toBe(opaqueAdPlaylist);
		} finally {
			g._processM3U8Core = realCore;
			getState().AdSegmentCache = new Map();
		}
	});

	it("requires exact ad media ownership before codec recovery is active", () => {
		const info = makeEnhancedInfo({
			IsShowingAd: false,
			IsHoldingBackupAfterAd: false,
		});
		const isActive = isHandoffAdRecoveryActive();
		const cycleStartedAt = activateAdContext(info, 100);

		getState().CurrentAdMediaKey = null;
		expect(isActive(info, true)).toBe(false);

		getState().CurrentAdMediaKey = "live:other";
		expect(isActive(info, true)).toBe(false);
		expect(isActive({ ...info, IsShowingAd: true })).toBe(false);

		getState().CurrentAdMediaKey = String(info.MediaKey);
		expect(isActive(info)).toBe(false);
		expect(isActive(info, true)).toBe(true);
		expect(isActive({ ...info, IsShowingAd: true })).toBe(true);
		expect(isActive({ ...info, IsHoldingBackupAfterAd: true })).toBe(true);

		const pendingHandoffId = cycleHandoffId(
			info,
			cycleStartedAt,
			"pending",
			1,
			200,
		);
		const otherHandoffId = cycleHandoffId(
			info,
			cycleStartedAt,
			"other",
			2,
			200,
		);
		info._CodecHandoffPendingId = pendingHandoffId;
		getState().ActiveCodecHandoffId = otherHandoffId;
		getState().ActiveCodecHandoffMediaKey = String(info.MediaKey);
		expect(isActive(info)).toBe(false);

		getState().ActiveCodecHandoffId = pendingHandoffId;
		expect(isActive(info)).toBe(true);
	});

	it("emits one codec reload only for an exact ad-owned media key", () => {
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			ModifiedM3U8: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000",
		});
		getState().CurrentAdMediaKey = "live:other";

		expect(requestHandoffReload()(info)).toBe(null);
		expect(info._CodecHandoffPendingId).toBe(null);
		expect(reloadMessages()).toHaveLength(0);

		activateAdContext(info);
		const handoffId = requestHandoffReload()(info);
		expect(typeof handoffId).toBe("string");
		expect(info._CodecHandoffPendingId).toBe(handoffId);
		expect(reloadMessages()).toHaveLength(1);
		expect(requestHandoffReload()(info)).toBe(handoffId);
		expect(reloadMessages()).toHaveLength(1);
	});

	it("never returns clean AVC media to a retiring HEVC-family loader", async () => {
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: 100,
			EnhancedDecoderCodecFamily: "hevc",
			EnhancedDecoderCodec: null,
		});
		const cycleStartedAt = activateAdContext(info, 100);
		const handoffId = cycleHandoffId(
			info,
			cycleStartedAt,
			"family-only",
			1,
			110,
		);
		info._CodecHandoffPendingId = handoffId;
		info.IsShowingAd = false;
		getState().CurrentAdChannel = null;
		getState().CurrentAdMediaKey = null;
		const holdRetiringCodecRequest = T<
			(
				info: Record<string, unknown>,
				url: string,
				text: string,
				requestCodecs: string | null,
				requestIsEnhanced: boolean,
				requestSignal: AbortSignal | null,
				handoffId: string,
				retiringCodec: string | null,
			) => Promise<string>
		>("_holdRetiringCodecRequest");

		await expect(
			holdRetiringCodecRequest(
				info,
				avcUrl,
				makePlaylist(800, 3),
				avcSource.Codecs,
				false,
				null,
				handoffId,
				"hevc",
			),
		).rejects.toMatchObject({ name: "AbortError" });
	});

	it("fails closed when an ad-marked playlist has no playback context", async () => {
		g._getStreamInfoForPlaylist = () => null;

		await expect(
			core()("https://edge.example/opaque/media.m3u8", allAdNative, fetchStub),
		).rejects.toMatchObject({ name: "AbortError" });
	});

	it("never serves media from an ad-marked whitelisted backup rendition", async () => {
		const info = makeEnhancedInfo({
			ActiveBackupPlayerType: "site",
			LastCleanBackupM3U8: cleanBackup,
			LastCleanBackupPlayerType: "site",
			LastCleanBackupAt: Date.now(),
			BackupVariantUrls: new Set([avcUrl]),
			EnhancedBackupVariantUrls: new Set(),
		});
		const findBackup = vi.fn(async () => ({ type: null, m3u8: null }));
		g._findBackupStream = findBackup;
		g._getStreamInfoForPlaylist = () => info;

		const out = await core()(avcUrl, allAdNative, fetchStub);

		expect(out).toContain("__ttvab_empty_hold_segment.mp4");
		expect(out).not.toContain("stitched-ad-100.ts");
		expect(out).not.toContain("avc-backup-500.ts");
		expect(info.LastCleanBackupM3U8).toBe(null);
		expect(findBackup).toHaveBeenCalledTimes(1);
	});

	it("recovers an ad-marked enhanced backup poll into a clean exact-codec backup", async () => {
		const cleanEnhancedBackup = cleanBackup.replaceAll(
			"avc-backup",
			"hevc-backup",
		);
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 1000,
			ActiveBackupPlayerType: "site",
			BackupVariantUrls: new Set([bridgeUrl]),
			EnhancedBackupVariantUrls: new Set([bridgeUrl]),
			LastCleanBackupM3U8: null,
			LastCleanBackupPlayerType: null,
			LastCleanBackupCodecFamily: null,
			LastCleanBackupCodec: null,
			LastCleanBackupAt: 0,
		});
		const findBackup = vi.fn(async () => {
			info.LastCleanBackupM3U8 = cleanEnhancedBackup;
			info.LastCleanBackupPlayerType = "autoplay";
			info.LastCleanBackupCodecFamily = "hevc";
			info.LastCleanBackupCodec = hevcSource.Codecs.toLowerCase();
			info.LastCleanBackupAt = Date.now();
			rememberBackupPlaylistMetadata(
				info,
				cleanEnhancedBackup,
				"hevc",
				hevcSource.Codecs,
			);
			return { type: "autoplay", m3u8: cleanEnhancedBackup };
		});
		g._findBackupStream = findBackup;
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info, Number(info.VisibleAdStartedAt));

		const out = await process()(bridgeUrl, allAdNative, fetchStub);

		expect(out).toContain("hevc-backup-500.ts");
		expect(out).not.toContain("stitched-ad-100.ts");
		expect(out).not.toContain("__ttvab_empty_hold_segment.mp4");
		expect(findBackup).toHaveBeenCalledTimes(1);
		expect(reloadMessages()).toHaveLength(0);
	});

	it("progresses an ad-marked enhanced backup poll into a bounded clean AVC handoff", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(300000);
		const cycleStartedAt = 299000;
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleStartedAt,
			ActiveBackupPlayerType: "site",
			BackupVariantUrls: new Set([bridgeUrl]),
			EnhancedBackupVariantUrls: new Set([bridgeUrl]),
			LastCleanBackupM3U8: null,
			LastCleanBackupPlayerType: null,
			LastCleanBackupCodecFamily: null,
			LastCleanBackupCodec: null,
			LastCleanBackupAt: 0,
		});
		const findBackup = vi.fn(async () => {
			info.LastCleanBackupM3U8 = cleanBackup;
			info.LastCleanBackupPlayerType = "autoplay";
			info.LastCleanBackupCodecFamily = "avc";
			info.LastCleanBackupCodec = avcSource.Codecs.toLowerCase();
			info.LastCleanBackupAt = Date.now();
			T<
				(
					target: Record<string, unknown>,
					m3u8: string,
					codecFamily: string,
					codec: string,
				) => string
			>("_rememberBackupPlaylistMetadata")(
				info,
				cleanBackup,
				"avc",
				avcSource.Codecs,
			);
			return { type: "autoplay", m3u8: cleanBackup };
		});
		g._findBackupStream = findBackup;
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info, cycleStartedAt);
		g._postWorkerBridgeMessage = vi.fn(
			(_target: unknown, message: Record<string, unknown>) => {
				if (message.key === "ReloadPlayer") {
					info._CodecHandoffAcknowledgedId = message.handoffId;
				}
			},
		);
		const pending = process()(bridgeUrl, allAdNative, fetchStub);
		const rejection = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});

		try {
			await vi.advanceTimersByTimeAsync(10000);
			await rejection;
			expect(findBackup).toHaveBeenCalledTimes(1);
			expect(info.LastCleanBackupM3U8).toBe(cleanBackup);
			expect(reloadMessages()).toHaveLength(1);
			expect(reloadMessages()[0][1]).toMatchObject({
				reason: "codec-handoff",
				cycleStartedAt,
			});
			expect(info._CodecHandoffFailedId).toBe(null);
		} finally {
			vi.useRealTimers();
		}
	});

	it("enforces the enhanced ad-strip invariant after every core return path", async () => {
		const realCore = g._processM3U8Core;
		const info = makeEnhancedInfo();
		g._getStreamInfoForPlaylist = () => info;
		g._processM3U8Core = async () => mixedOpaqueAdNative;
		try {
			const out = await process()(bridgeUrl, mixedOpaqueAdNative, fetchStub);

			expect(out).not.toContain("stitched-ad-101.ts");
			expect(out).not.toContain("content-102.ts");
			expect(out).toContain("native-live-103.ts");
			expect(Number(info.NumStrippedAdSegments)).toBeGreaterThan(0);
		} finally {
			g._processM3U8Core = realCore;
		}
	});

	it("keeps enhanced decoder ownership sticky across later AVC rendition polls", async () => {
		const info = makeEnhancedInfo();
		g._getStreamInfoForPlaylist = () => info;
		const cleanNative = makePlaylist(700, 3);

		await core()(bridgeUrl, cleanNative, fetchStub);
		expect(info.EnhancedDecoderCodecFamily).toBe("hevc");

		await core()(avcUrl, cleanNative, fetchStub);
		expect(info.EnhancedDecoderCodecFamily).toBe("hevc");
	});

	it("lets an exact current native variant outrank a stored same-path backup alias", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(300000);
		const nativeUrl =
			"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=native";
		const backupUrl =
			"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=backup";
		const aliases = T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			backupUrl,
		);
		const info = makeEnhancedInfo({
			Urls: {
				[nativeUrl]: hevcSource,
				[avcUrl]: avcSource,
			},
			EnhancedVariantUrls: new Set([nativeUrl]),
			BackupVariantUrls: new Set(aliases),
			EnhancedDecoderCodecFamily: null,
			EnhancedDecoderCodec: null,
			SustainedNativeResolution: hevcSource,
			SustainedNativeResolutionAt: 1,
		});
		g._getStreamInfoForPlaylist = () => info;
		getState().LastAdEndedAt = 0;
		const cleanNative = makePlaylist(700, 3);

		try {
			await core()(nativeUrl, cleanNative, fetchStub);
			expect(info.EnhancedDecoderCodecFamily).toBe("hevc");
			expect(info.EnhancedDecoderCodec).toBe("hev1.1.6.l153.b0");
			expect(info.SustainedNativeResolutionAt).toBe(300000);

			vi.setSystemTime(306000);
			await core()(avcUrl, cleanNative, fetchStub);
			await core()(avcUrl, cleanNative, fetchStub);

			expect(info.SustainedNativeResolution).toBe(hevcSource);
			expect(info.EnhancedDecoderCodecFamily).toBe("hevc");
			expect(info.EnhancedDecoderCodec).toBe("hev1.1.6.l153.b0");
		} finally {
			vi.useRealTimers();
		}
	});

	it("lets the exact current-cycle pre-ad native URL outrank a stored same-path backup alias", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(300000);
		const cycleStartedAt = 250000;
		const nativeUrl =
			"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=player";
		const backupUrl =
			"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=backup";
		const { aliases, info } = makeNativeAliasCollisionInfo(
			nativeUrl,
			backupUrl,
			cycleStartedAt,
			{
				LastCleanNativeM3U8: makePlaylist(700, 3),
				LastCleanNativeUrl: nativeUrl,
				LastCleanNativeCodec: avcSource.Codecs,
				LastCleanNativePlaylistAt: cycleStartedAt - 1000,
			},
		);

		try {
			await process()(nativeUrl, allAdNative, fetchStub);

			expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set([nativeUrl]));
			expect(info.NativeRecoveryAdMediaKey).toBe("live:testchannel");
			expect(info.NativeRecoveryAdStartedAt).toBe(cycleStartedAt);
			expect(info.LastAdPodProgressAt).toBe(300000);
			expect(info.BackupVariantUrls).toEqual(new Set(aliases));
		} finally {
			vi.useRealTimers();
		}
	});

	it.each([
		["stale pre-ad snapshot", 60001, 0, 0],
		["prior loader snapshot", 1000, 0, 1],
		["post-cycle snapshot", -1, 0, 0],
	] as const)(
		"keeps a %s classified as backup",
		async (_label, snapshotAge, snapshotLoaderEpoch, currentLoaderEpoch) => {
			vi.useFakeTimers();
			vi.setSystemTime(300000);
			const cycleStartedAt = 250000;
			const nativeUrl =
				"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=player";
			const backupUrl =
				"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=backup";
			const { aliases, info } = makeNativeAliasCollisionInfo(
				nativeUrl,
				backupUrl,
				cycleStartedAt,
				{
					LastCleanNativeM3U8: makePlaylist(700, 3),
					LastCleanNativeUrl: nativeUrl,
					LastCleanNativeCodec: avcSource.Codecs,
					LastCleanNativePlaylistAt: cycleStartedAt - snapshotAge,
					LastCleanNativeLoaderEpoch: snapshotLoaderEpoch,
					NativeRecoveryLoaderEpoch: currentLoaderEpoch,
				},
			);

			try {
				const output = await process()(nativeUrl, allAdNative, fetchStub);

				expect(info.LastAdPodProgressAt).toBe(1);
				expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set());
				expect(info.BackupVariantUrls).toEqual(new Set(aliases));
				expect(output).not.toContain("stitched-ad-100.ts");
			} finally {
				vi.useRealTimers();
			}
		},
	);

	it("lets an exact current-cycle native recovery URL outrank a stored same-path backup alias", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(400000);
		const cycleStartedAt = 350000;
		const nativeUrl =
			"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=player";
		const backupUrl =
			"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=backup";
		const { aliases, info } = makeNativeAliasCollisionInfo(
			nativeUrl,
			backupUrl,
			cycleStartedAt,
			{
				NativeRecoveryAdPlaylistUrls: new Set([nativeUrl]),
				NativeRecoveryAdMediaKey: "live:testchannel",
				NativeRecoveryAdStartedAt: cycleStartedAt,
			},
		);

		try {
			await process()(nativeUrl, allAdNative, fetchStub);

			expect(info.LastAdPodProgressAt).toBe(400000);
			expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set([nativeUrl]));
			expect(info.BackupVariantUrls).toEqual(new Set(aliases));
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps a stale-cycle native recovery URL classified as backup", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(500000);
		const cycleStartedAt = 450000;
		const staleCycleStartedAt = cycleStartedAt - 10000;
		const nativeUrl =
			"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=player";
		const backupUrl =
			"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=backup";
		const { aliases, info } = makeNativeAliasCollisionInfo(
			nativeUrl,
			backupUrl,
			cycleStartedAt,
			{
				NativeRecoveryAdPlaylistUrls: new Set([nativeUrl]),
				NativeRecoveryAdMediaKey: "live:testchannel",
				NativeRecoveryAdStartedAt: staleCycleStartedAt,
			},
		);

		try {
			await process()(nativeUrl, allAdNative, fetchStub);

			expect(info.LastAdPodProgressAt).toBe(1);
			expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set([nativeUrl]));
			expect(info.NativeRecoveryAdStartedAt).toBe(staleCycleStartedAt);
			expect(info.BackupVariantUrls).toEqual(new Set(aliases));
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps a different-token same-path URL classified as backup despite current-cycle native ownership", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(600000);
		const cycleStartedAt = 550000;
		const nativeUrl =
			"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=player";
		const backupUrl =
			"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=backup";
		const { aliases, info } = makeNativeAliasCollisionInfo(
			nativeUrl,
			backupUrl,
			cycleStartedAt,
			{
				LastCleanNativeM3U8: makePlaylist(700, 3),
				LastCleanNativeUrl: nativeUrl,
				LastCleanNativeCodec: avcSource.Codecs,
				LastCleanNativePlaylistAt: cycleStartedAt - 1000,
				NativeRecoveryAdPlaylistUrls: new Set([nativeUrl]),
				NativeRecoveryAdMediaKey: "live:testchannel",
				NativeRecoveryAdStartedAt: cycleStartedAt,
			},
		);

		try {
			await process()(backupUrl, allAdNative, fetchStub);

			expect(info.LastAdPodProgressAt).toBe(1);
			expect(info.NativeRecoveryAdPlaylistUrls).toEqual(new Set([nativeUrl]));
			expect(info.BackupVariantUrls).toEqual(new Set(aliases));
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps a different-token same-path candidate classified as backup", async () => {
		const nativeUrl =
			"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=native";
		const backupUrl =
			"https://video-weaver.example/v1/playlist/shared-live.m3u8?token=backup";
		const aliases = T<(url: string) => string[]>("_getPlaylistUrlAliases")(
			backupUrl,
		);
		const info = makeEnhancedInfo({
			Urls: {
				[nativeUrl]: hevcSource,
				[avcUrl]: avcSource,
			},
			EnhancedVariantUrls: new Set([nativeUrl]),
			BackupVariantUrls: new Set(aliases),
			SustainedNativeResolution: hevcSource,
			SustainedNativeResolutionAt: 123,
			LastCleanNativeM3U8: "native-before-backup",
			LastCleanNativeUrl: nativeUrl,
			LastCleanNativePlaylistAt: 122,
		});
		g._getStreamInfoForPlaylist = () => info;

		const out = await core()(backupUrl, makePlaylist(700, 3), fetchStub);

		expect(out).toContain("seg700.ts");
		expect(info.SustainedNativeResolutionAt).toBe(123);
		expect(info.LastCleanNativeM3U8).toBe("native-before-backup");
		expect(info.LastCleanNativeUrl).toBe(nativeUrl);
		expect(info.LastCleanNativePlaylistAt).toBe(122);
	});

	it("clears a stale enhanced owner after a sustained clean native AVC demotion", async () => {
		const info = makeEnhancedInfo();
		g._getStreamInfoForPlaylist = () => info;
		getState().LastAdEndedAt = 0;
		getState().PagePlaybackVisibleSinceAt = Date.now() - 20000;
		const cleanNative = makePlaylist(700, 3);

		await core()(bridgeUrl, cleanNative, fetchStub);
		expect(info.EnhancedDecoderCodecFamily).toBe("hevc");
		info.SustainedNativeResolutionAt = Date.now() - 61000;

		await core()(avcUrl, cleanNative, fetchStub);
		expect(info.SustainedNativeResolution).toBe(avcSource);
		expect(info.EnhancedDecoderCodecFamily).toBe("hevc");
		expect(info.EnhancedDecoderCodec).toBe("hev1.1.6.l153.b0");

		await core()(avcUrl, cleanNative, fetchStub);
		expect(info.EnhancedDecoderCodecFamily).toBe(null);
		expect(info.EnhancedDecoderCodec).toBe(null);

		info.IsShowingAd = true;
		info.VisibleAdStartedAt = Date.now() - 1000;
		activateAdContext(info);
		const out = await process()(avcUrl, allAdNative, fetchStub);

		expect(out).not.toContain("stitched-ad-100.ts");
		expect(reloadMessages()).toHaveLength(0);
	});

	it("never starts a codec handoff from a clean AVC poll outside an ad", async () => {
		const info = makeEnhancedInfo({
			EnhancedDecoderCodecFamily: "hevc",
		});
		const findBackup = vi.fn(async () => ({ type: null, m3u8: null }));
		g._findBackupStream = findBackup;
		g._getStreamInfoForPlaylist = () => info;
		const cleanNative = makePlaylist(700, 3);

		const out = await process()(avcUrl, cleanNative, fetchStub);

		expect(out).toContain("seg700.ts");
		expect(out).toContain("seg702.ts");
		expect(findBackup).not.toHaveBeenCalled();
		expect(reloadMessages()).toHaveLength(0);
		expect(info.IsUsingModifiedM3U8).toBe(false);
		expect(info._CodecHandoffPendingId).toBe(null);
	});

	it("ignores a foreign ad context during a clean AVC poll", async () => {
		const info = makeEnhancedInfo({
			EnhancedDecoderCodecFamily: "hevc",
		});
		const findBackup = vi.fn(async () => ({ type: null, m3u8: null }));
		g._findBackupStream = findBackup;
		g._getStreamInfoForPlaylist = () => info;
		getState().CurrentAdChannel = "other";
		getState().CurrentAdMediaKey = "live:other";
		const cleanNative = makePlaylist(710, 3);

		const out = await process()(avcUrl, cleanNative, fetchStub);

		expect(out).toContain("seg710.ts");
		expect(out).toContain("seg712.ts");
		expect(findBackup).not.toHaveBeenCalled();
		expect(reloadMessages()).toHaveLength(0);
		expect(info.IsUsingModifiedM3U8).toBe(false);
	});

	it("aborts an AVC poll whose retained HEVC ad context clears during processing", async () => {
		const realCore = g._processM3U8Core;
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 1000,
			EnhancedDecoderCodecFamily: "hevc",
			LastCleanBackupM3U8: cleanBackup,
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupAt: Date.now(),
		});
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info);
		g._processM3U8Core = async () => {
			getState().CurrentAdChannel = null;
			getState().CurrentAdMediaKey = null;
			info.IsShowingAd = false;
			info.EnhancedDecoderCodecFamily = null;
			info.EnhancedDecoderCodec = null;
			return cleanBackup;
		};

		try {
			await expect(
				process()(avcUrl, allAdNative, fetchStub),
			).rejects.toMatchObject({ name: "AbortError" });
			expect(reloadMessages()).toHaveLength(0);
		} finally {
			g._processM3U8Core = realCore;
		}
	});

	it("refuses AVC media when the enhanced owner has no prepared fallback master", async () => {
		const realCore = g._processM3U8Core;
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 1000,
			ModifiedM3U8: null,
			EnhancedDecoderCodecFamily: "hevc",
			LastCleanBackupM3U8: cleanBackup,
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupAt: Date.now(),
		});
		T<
			(
				info: Record<string, unknown>,
				m3u8: string,
				codecFamily: string,
				codec: string,
			) => string
		>("_rememberBackupPlaylistMetadata")(
			info,
			cleanBackup,
			"avc",
			avcSource.Codecs,
		);
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info);
		g._processM3U8Core = async () => cleanBackup;

		try {
			await expect(
				process()(avcUrl, allAdNative, fetchStub),
			).rejects.toMatchObject({ name: "AbortError" });
			expect(reloadMessages()).toHaveLength(0);
			expect(info._CodecHandoffPendingId).toBe(null);
		} finally {
			g._processM3U8Core = realCore;
		}
	});

	it("does not let a stale cycle-one handoff hold a cycle-two loader on the same media", async () => {
		const realCore = g._processM3U8Core;
		const realHold = g._holdRetiringCodecRequest;
		const staleInfo = makeEnhancedInfo({
			IsShowingAd: true,
			IsUsingModifiedM3U8: true,
			VisibleAdStartedAt: 100,
		});
		const staleHandoffId = cycleHandoffId(staleInfo, 100, "cycle-one", 1, 110);
		staleInfo._CodecHandoffPendingId = staleHandoffId;
		staleInfo._CodecHandoffAcknowledgedId = staleHandoffId;
		getState().CurrentAdChannel = "testchannel";
		getState().CurrentAdMediaKey = "live:testchannel";
		getState().AdPodProgressByMediaKey = {
			"live:testchannel": { cycleStartedAt: 200 },
		};
		getState().StreamInfos = {
			"live:testchannel": makeEnhancedInfo({
				IsShowingAd: true,
				VisibleAdStartedAt: 200,
			}),
		};
		getState().ActiveCodecHandoffId = staleHandoffId;
		getState().ActiveCodecHandoffChannel = "testchannel";
		getState().ActiveCodecHandoffMediaKey = "live:testchannel";
		g._getStreamInfoForPlaylist = () => staleInfo;
		const cleanEnhancedNative = makePlaylist(800, 3);
		g._processM3U8Core = vi.fn(async () => cleanEnhancedNative);
		g._holdRetiringCodecRequest = vi.fn(async () => {
			throw new Error("stale cycle entered retiring hold");
		});

		try {
			await expect(
				process()(bridgeUrl, cleanEnhancedNative, fetchStub),
			).resolves.toContain("seg800.ts");
			expect(g._processM3U8Core).toHaveBeenCalledTimes(1);
			expect(g._holdRetiringCodecRequest).not.toHaveBeenCalled();
		} finally {
			g._processM3U8Core = realCore;
			g._holdRetiringCodecRequest = realHold;
		}
	});

	it("never returns an exact HEVC backup under an explicit AVC rendition request", async () => {
		const exactHevcBackup = cleanBackup.replaceAll("avc-backup", "hevc-backup");
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 1000,
			LastCleanBackupM3U8: exactHevcBackup,
			LastCleanBackupPlayerType: "site",
			LastCleanBackupCodecFamily: "hevc",
			LastCleanBackupCodec: hevcSource.Codecs.toLowerCase(),
			LastCleanBackupAt: Date.now(),
		});
		T<
			(
				info: Record<string, unknown>,
				m3u8: string,
				codecFamily: string,
				codec: string,
			) => string
		>("_rememberBackupPlaylistMetadata")(
			info,
			exactHevcBackup,
			"hevc",
			hevcSource.Codecs,
		);
		const controller = new AbortController();
		const realCore = g._processM3U8Core;
		const realWait = T<
			(ms: number, signal?: AbortSignal | null) => Promise<void>
		>("_waitForAbortableDelay");
		let markUnsafeHoldEntered: (() => void) | null = null;
		const unsafeHoldEntered = new Promise<void>((resolve) => {
			markUnsafeHoldEntered = resolve;
		});
		g._processM3U8Core = async () => exactHevcBackup;
		g._waitForAbortableDelay = (ms: number, signal?: AbortSignal | null) => {
			markUnsafeHoldEntered?.();
			markUnsafeHoldEntered = null;
			return realWait(ms, signal);
		};
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info);

		try {
			const pending = process()(
				avcUrl,
				allAdNative,
				fetchStub,
				controller.signal,
			);
			const outcome = await Promise.race([
				pending.then(
					() => "returned",
					() => "rejected",
				),
				unsafeHoldEntered.then(() => "held"),
			]);

			expect(outcome).toBe("held");
			controller.abort();
			await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		} finally {
			g._processM3U8Core = realCore;
			g._waitForAbortableDelay = realWait;
		}
	});

	it("waits for the exact-codec search before starting the AVC handoff search", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(10000));
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: 9000,
			LastCleanBackupM3U8: null,
			LastCleanBackupAt: 0,
		});
		const existingExactSearch = new Promise<null>(() => {});
		info._BackupSearchPromise = existingExactSearch;
		info._BackupSearchKey = "exact-hevc";
		info._BackupSearchPromises = new Map([["exact-hevc", existingExactSearch]]);
		const findBackup = vi.fn(async (...args: unknown[]) => {
			expect(args[4]).toBe(avcSource.Codecs);
			info.LastCleanBackupM3U8 = cleanBackup;
			info.LastCleanBackupPlayerType = "autoplay";
			info.LastCleanBackupCodecFamily = "avc";
			info.LastCleanBackupCodec = avcSource.Codecs.toLowerCase();
			info.LastCleanBackupAt = Date.now();
			T<
				(
					info: Record<string, unknown>,
					m3u8: string,
					codecFamily: string,
					codec: string,
				) => string
			>("_rememberBackupPlaylistMetadata")(
				info,
				cleanBackup,
				"avc",
				avcSource.Codecs,
			);
			return { type: "autoplay", m3u8: cleanBackup };
		});
		const avcHold = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:1",
			"#EXT-X-MEDIA-SEQUENCE:501",
			"#EXTINF:1.000,live",
			"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4?seq=501&media=live%3Atestchannel",
		].join("\n");
		const controller = new AbortController();
		const realCore = g._processM3U8Core;
		g._processM3U8Core = async () => avcHold;
		g._findBackupStream = findBackup;
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info, 9000);
		abortRetiringRequestOnReload(info, controller);

		try {
			const pending = process()(
				avcUrl,
				allAdNative,
				fetchStub,
				controller.signal,
			);
			const rejection = expect(pending).rejects.toMatchObject({
				name: "AbortError",
			});
			await vi.advanceTimersByTimeAsync(300);
			expect(findBackup).not.toHaveBeenCalled();

			info._BackupSearchPromise = null;
			info._BackupSearchKey = null;
			(info._BackupSearchPromises as Map<string, unknown>).clear();
			await vi.advanceTimersByTimeAsync(100);

			expect(findBackup).toHaveBeenCalledOnce();
			expect(info.LastCleanBackupM3U8).toBe(cleanBackup);
			expect(reloadMessages()).toHaveLength(1);
			await rejection;
		} finally {
			g._processM3U8Core = realCore;
			vi.useRealTimers();
		}
	});

	it("hands an AVC rendition poll off while the enhanced decoder still owns the player", async () => {
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 1000,
			EnhancedDecoderCodecFamily: "hevc",
			EnhancedDecoderCodec: hevcSource.Codecs,
			LastCleanBackupM3U8: cleanBackup,
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupCodec: avcSource.Codecs.toLowerCase(),
			LastCleanBackupAt: Date.now(),
		});
		T<
			(
				info: Record<string, unknown>,
				m3u8: string,
				codecFamily: string,
				codec: string,
			) => string
		>("_rememberBackupPlaylistMetadata")(
			info,
			cleanBackup,
			"avc",
			avcSource.Codecs,
		);
		const controller = new AbortController();
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info);
		abortRetiringRequestOnReload(info, controller);

		await expect(
			process()(avcUrl, adLadenNative, fetchStub, controller.signal),
		).rejects.toMatchObject({ name: "AbortError" });

		expect(reloadMessages()).toHaveLength(1);
		expect(info.EnhancedDecoderCodecFamily).toBe("hevc");
	});

	it("lets the acknowledged AVC replacement proceed after the enhanced owner clears", async () => {
		const cycleStartedAt = Date.now() - 1000;
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleStartedAt,
			IsUsingModifiedM3U8: true,
			EnhancedDecoderCodecFamily: null,
			EnhancedDecoderCodec: null,
			LastCleanBackupM3U8: cleanBackup,
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupCodec: avcSource.Codecs.toLowerCase(),
			LastCleanBackupAt: Date.now(),
		});
		const handoffId = cycleHandoffId(
			info,
			cycleStartedAt,
			"avc-replacement",
			1,
			cycleStartedAt + 1,
		);
		info._CodecHandoffPendingId = handoffId;
		info._CodecHandoffAcknowledgedId = handoffId;
		T<
			(
				info: Record<string, unknown>,
				m3u8: string,
				codecFamily: string,
				codec: string,
			) => string
		>("_rememberBackupPlaylistMetadata")(
			info,
			cleanBackup,
			"avc",
			avcSource.Codecs,
		);
		g._getStreamInfoForPlaylist = () => info;
		activateHandoffContext(info, handoffId);

		const out = await process()(avcUrl, adLadenNative, fetchStub);

		expect(out).toContain("avc-backup-500.ts");
		expect(out).not.toContain("stitched-ad-99.ts");
		expect(reloadMessages()).toHaveLength(0);
		expect(info.EnhancedDecoderCodecFamily).toBe(null);
	});

	it("rejects a stale request context after a newer same-media ad cycle starts", () => {
		const assertCurrent = T<
			(
				info: Record<string, unknown>,
				requestAdContext: Record<string, unknown>,
			) => boolean
		>("_assertM3U8RequestContextCurrent");
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: 600,
			BackupSearchEpoch: 4,
		});
		activateAdContext(info, 600);
		const staleContext = {
			backupSearchEpoch: 4,
			cycleStartedAt: 600,
		};

		info.BackupSearchEpoch = 5;
		activateAdContext(info, 700);

		expect(() => assertCurrent(info, staleContext)).toThrowError(
			expect.objectContaining({ name: "AbortError" }),
		);
	});

	it("keeps a media request current when only fallback ordering changes", () => {
		const assertCurrent = T<
			(
				info: Record<string, unknown>,
				requestAdContext: Record<string, unknown>,
			) => boolean
		>("_assertM3U8RequestContextCurrent");
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: 600,
			BackupSearchEpoch: 4,
			_LastBackupSearchCompletedAt: 1234,
		});
		activateAdContext(info, 600);
		const requestContext = {
			backupSearchEpoch: 4,
			cycleStartedAt: 600,
		};

		info._LastBackupSearchCompletedAt = 0;

		expect(assertCurrent(info, requestContext)).toBe(true);
	});

	it("never reuses a fresh cycle-one backup snapshot after cycle two starts", async () => {
		const now = Date.now();
		const cycleTwoStartedAt = now - 50;
		const cycleOneBackup = makePlaylist(820, 3);
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleTwoStartedAt,
			EnhancedDecoderCodecFamily: null,
			EnhancedDecoderCodec: null,
			LastCleanBackupM3U8: cycleOneBackup,
			LastCleanBackupPlayerType: "site",
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupCodec: avcSource.Codecs.toLowerCase(),
			LastCleanBackupAt: now - 100,
			_LastBackupSearchCompletedAt: 0,
			LastAdEndReloadAt: 0,
			LastCleanNativeM3U8: null,
			LastCleanNativePlaylistAt: 0,
		});
		const findBackup = vi.fn(async () => ({ type: null, m3u8: null }));
		g._findBackupStream = findBackup;
		g._getStreamInfoForPlaylist = () => info;
		getState().LastAdEndedAt = 0;
		activateAdContext(info, cycleTwoStartedAt);

		const out = await process()(avcUrl, allAdNative, fetchStub);

		expect(findBackup).toHaveBeenCalled();
		expect(out).not.toContain("seg820.ts");
		expect(out).not.toContain("stitched-ad-100.ts");
		expect(out).toContain("__ttvab_empty_hold_segment.mp4");
		expect(info.IsUsingBackupStream).toBe(false);
	});

	it.each([
		["a recent failed search", { _LastBackupSearchCompletedAt: Date.now() }],
		["fallback mode", { IsUsingFallbackStream: true }],
	])(
		"never returns raw enhanced ad media after %s",
		async (_label, overrides) => {
			const info = makeEnhancedInfo({
				IsShowingAd: true,
				VisibleAdStartedAt: Date.now() - 1000,
				...overrides,
			});
			g._getStreamInfoForPlaylist = () => info;

			const out = await core()(bridgeUrl, mixedOpaqueAdNative, fetchStub);

			expect(out).not.toContain("stitched-ad-101.ts");
			expect(out).not.toContain("content-102.ts");
			expect(out).toContain("native-live-103.ts");
		},
	);

	it("starts the clean backup search on an all-ad cold enhanced preroll and retires only through the real request signal", async () => {
		const info = makeEnhancedInfo();
		const controller = new AbortController();
		const findBackup = installCleanBackup(info);
		g._getStreamInfoForPlaylist = () => info;
		getState().PlayerHasPlayedOnce = false;
		getState().PlayerIsPlaying = false;
		abortRetiringRequestOnReload(info, controller);

		await expect(
			process()(bridgeUrl, allAdNative, fetchStub, controller.signal),
		).rejects.toMatchObject({ name: "AbortError" });

		expect(findBackup).toHaveBeenCalledTimes(1);
		expect(reloadMessages()).toHaveLength(1);
		expect(reloadMessages()[0][1]).toMatchObject({
			reason: "codec-handoff",
			newMediaPlayerInstance: true,
			refreshAccessToken: true,
		});
		expect(typeof reloadMessages()[0][1].handoffId).toBe("string");
		expect(info.IsShowingAd).toBe(true);
		expect(info._CodecHandoffPendingId).toBe(
			(reloadMessages()[0][1] as Record<string, unknown>).handoffId,
		);
		expect(info._CodecHandoffAcknowledgedId).toBe(info._CodecHandoffPendingId);
	});

	it("retries a transient cold-preroll backup miss sequentially before starting the handoff", async () => {
		const info = makeEnhancedInfo();
		const controller = new AbortController();
		const findBackup = vi.fn(async () => {
			if (findBackup.mock.calls.length === 1) {
				return { type: null, m3u8: null };
			}
			info.LastCleanBackupM3U8 = cleanBackup;
			info.LastCleanBackupPlayerType = "autoplay";
			info.LastCleanBackupCodecFamily = "avc";
			info.LastCleanBackupCodec = avcSource.Codecs.toLowerCase();
			info.LastCleanBackupAt = Date.now();
			rememberBackupPlaylistMetadata(
				info,
				cleanBackup,
				"avc",
				avcSource.Codecs,
			);
			return { type: "autoplay", m3u8: cleanBackup };
		});
		g._findBackupStream = findBackup;
		g._getStreamInfoForPlaylist = () => info;
		abortRetiringRequestOnReload(info, controller);

		await expect(
			process()(bridgeUrl, allAdNative, fetchStub, controller.signal),
		).rejects.toMatchObject({ name: "AbortError" });

		expect(findBackup).toHaveBeenCalledTimes(2);
		expect(reloadMessages()).toHaveLength(1);
	});

	it("keeps sequential cold-preroll backup recovery active after repeated misses", async () => {
		vi.useFakeTimers();
		const info = makeEnhancedInfo();
		const controller = new AbortController();
		const findBackup = vi.fn(async () => {
			if (findBackup.mock.calls.length < 4) {
				return { type: null, m3u8: null };
			}
			info.LastCleanBackupM3U8 = cleanBackup;
			info.LastCleanBackupPlayerType = "autoplay";
			info.LastCleanBackupCodecFamily = "avc";
			info.LastCleanBackupCodec = avcSource.Codecs.toLowerCase();
			info.LastCleanBackupAt = Date.now();
			rememberBackupPlaylistMetadata(
				info,
				cleanBackup,
				"avc",
				avcSource.Codecs,
			);
			return { type: "autoplay", m3u8: cleanBackup };
		});
		g._findBackupStream = findBackup;
		g._getStreamInfoForPlaylist = () => info;
		abortRetiringRequestOnReload(info, controller);
		const pending = process()(
			bridgeUrl,
			allAdNative,
			fetchStub,
			controller.signal,
		);
		const rejection = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});
		try {
			await vi.advanceTimersByTimeAsync(5000);
			await rejection;

			expect(findBackup).toHaveBeenCalledTimes(4);
			expect(reloadMessages()).toHaveLength(1);
		} finally {
			controller.abort();
			vi.useRealTimers();
		}
	});

	it("uses collision-resistant identities across independent worker transactions", () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(123456);
		try {
			const firstInfo = makeEnhancedInfo({ VisibleAdStartedAt: 100 });
			const secondInfo = makeEnhancedInfo({ VisibleAdStartedAt: 100 });
			activateAdContext(firstInfo, 100);
			const first = createHandoffId()(firstInfo);
			activateAdContext(secondInfo, 100);
			const second = createHandoffId()(secondInfo);

			expect(first).not.toBe(second);
			expect(first).toContain("live:testchannel:100:123456:1:");
			expect(second).toContain("live:testchannel:100:123456:1:");
		} finally {
			now.mockRestore();
		}
	});

	it("clears only the exact handoff generation and releases its modified-master latch", () => {
		const cycleStartedAt = 80;
		const info = makeEnhancedInfo({
			VisibleAdStartedAt: cycleStartedAt,
			IsUsingModifiedM3U8: true,
			EnhancedDecoderCodecFamily: "hevc",
		});
		const handoffA = cycleHandoffId(info, cycleStartedAt, "a", 1, 90);
		const handoffB = cycleHandoffId(info, cycleStartedAt, "b", 2, 90);
		info._CodecHandoffPendingId = handoffB;
		info._CodecHandoffAcknowledgedId = handoffB;

		expect(clearHandoff()(info, handoffA)).toBe(false);
		expect(info.IsUsingModifiedM3U8).toBe(true);
		expect(info.EnhancedDecoderCodecFamily).toBe("hevc");
		expect(info._CodecHandoffPendingId).toBe(handoffB);

		expect(clearHandoff()(info, handoffB)).toBe(true);
		expect(info.IsUsingModifiedM3U8).toBe(false);
		expect(info.EnhancedDecoderCodecFamily).toBe(null);
		expect(info._CodecHandoffPendingId).toBe(null);
		expect(info._CodecHandoffAcknowledgedId).toBe(null);
	});

	it("preserves enhanced decoder ownership when an exact handoff is rolled back before acknowledgement", () => {
		const cycleStartedAt = 90;
		const info = makeEnhancedInfo({
			VisibleAdStartedAt: cycleStartedAt,
			IsUsingModifiedM3U8: true,
			EnhancedDecoderCodecFamily: "av1",
		});
		const failedHandoffId = cycleHandoffId(
			info,
			cycleStartedAt,
			"failed",
			1,
			100,
		);
		info._CodecHandoffPendingId = failedHandoffId;

		expect(clearHandoff()(info, failedHandoffId)).toBe(true);
		expect(info.EnhancedDecoderCodecFamily).toBe("av1");
		expect(info._CodecHandoffPendingId).toBe(null);
	});

	it("does not let one aborted poll cancel the shared handoff transaction", async () => {
		const cycleStartedAt = 100;
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleStartedAt,
		});
		const handoffId = cycleHandoffId(info, cycleStartedAt, "shared", 1, 110);
		info._CodecHandoffPendingId = handoffId;
		info._CodecHandoffAcknowledgedId = handoffId;
		activateHandoffContext(info, handoffId);
		const firstController = new AbortController();
		const secondController = new AbortController();
		const first = hold()(
			info,
			bridgeUrl,
			allAdNative,
			hevcSource.Codecs,
			true,
			firstController.signal,
			handoffId,
		);
		const second = hold()(
			info,
			bridgeUrl,
			allAdNative,
			hevcSource.Codecs,
			true,
			secondController.signal,
			handoffId,
		);

		firstController.abort();
		await expect(first).rejects.toMatchObject({ name: "AbortError" });
		expect(info._CodecHandoffPendingId).toBe(handoffId);

		let secondSettled = false;
		void second.then(
			() => {
				secondSettled = true;
			},
			() => {
				secondSettled = true;
			},
		);
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(secondSettled).toBe(false);

		secondController.abort();
		await expect(second).rejects.toMatchObject({ name: "AbortError" });
		expect(info._CodecHandoffPendingId).toBe(handoffId);
	});

	it("keeps an unsafe enhanced response pending until its own loader signal aborts", async () => {
		const cycleStartedAt = 200;
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleStartedAt,
		});
		const handoffId = cycleHandoffId(info, cycleStartedAt, "pending", 1, 210);
		info._CodecHandoffPendingId = handoffId;
		info._CodecHandoffAcknowledgedId = handoffId;
		const controller = new AbortController();
		activateHandoffContext(info, handoffId);
		const pending = hold()(
			info,
			bridgeUrl,
			allAdNative,
			hevcSource.Codecs,
			true,
			controller.signal,
			handoffId,
		);
		let settled = false;
		void pending.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			},
		);

		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(settled).toBe(false);

		controller.abort();
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	});

	it("aborts an acknowledged retiring loader at ten seconds without marking the handoff failed", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(100000);
		const cycleStartedAt = 90000;
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleStartedAt,
		});
		const handoffId = cycleHandoffId(
			info,
			cycleStartedAt,
			"ack-timeout",
			1,
			90010,
		);
		info._CodecHandoffPendingId = handoffId;
		info._CodecHandoffAcknowledgedId = handoffId;
		activateHandoffContext(info, handoffId);
		const pending = hold()(
			info,
			bridgeUrl,
			allAdNative,
			hevcSource.Codecs,
			true,
			null,
			handoffId,
		);
		const rejection = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});

		try {
			await vi.advanceTimersByTimeAsync(10000);
			await rejection;
			expect(info._CodecHandoffAcknowledgedId).toBe(handoffId);
			expect(info._CodecHandoffFailedId).toBe(null);
			expect(reloadMessages()).toHaveLength(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("aborts unsafe enhanced recovery at ten seconds when no loader signal arrives", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(200000);
		const realCore = g._processM3U8Core;
		const cycleStartedAt = 190000;
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleStartedAt,
		});
		const findBackup = vi.fn(async () => ({ type: null, m3u8: null }));
		g._findBackupStream = findBackup;
		activateAdContext(info, cycleStartedAt);
		g._getStreamInfoForPlaylist = () => info;
		g._processM3U8Core = async () =>
			T<(text: string, target: Record<string, unknown>) => string>(
				"_createEmptyAdHoldPlaylist",
			)(allAdNative, info);
		const pending = process()(bridgeUrl, allAdNative, fetchStub);
		const rejection = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});

		try {
			await vi.advanceTimersByTimeAsync(10000);
			await rejection;
			expect(findBackup).toHaveBeenCalled();
			expect(reloadMessages()).toHaveLength(0);
		} finally {
			g._processM3U8Core = realCore;
			vi.useRealTimers();
		}
	});

	it("bounds a hanging enhanced backup pass by one absolute deadline and never reuses cycle-two media", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(300000);
		const cycleOneStartedAt = 299000;
		const cycleTwoStartedAt = 305000;
		const cycleTwoBackup = makePlaylist(950, 3);
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleOneStartedAt,
			BackupSearchEpoch: 4,
			LastCleanBackupM3U8: null,
			LastCleanBackupAt: 0,
		});
		const findBackup = vi.fn(() => new Promise(() => {}));
		g._findBackupStream = findBackup;
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info, cycleOneStartedAt);
		const pending = process()(bridgeUrl, allAdNative, fetchStub);
		let resolvedValue: string | null = null;
		void pending.then(
			(value) => {
				resolvedValue = value;
			},
			() => {},
		);
		const rejection = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});

		try {
			await vi.advanceTimersByTimeAsync(5000);
			T<
				(
					target: Record<string, unknown>,
					progress: Record<string, unknown>,
				) => Record<string, unknown> | null
			>("_applyAdPodProgressToInfo")(info, {
				mediaType: "live",
				channelName: "testchannel",
				mediaKey: "live:testchannel",
				cycleStartedAt: cycleTwoStartedAt,
				adIds: ["cycle-two-ad"],
			});
			info.IsShowingAd = true;
			info.LastCleanBackupM3U8 = cycleTwoBackup;
			info.LastCleanBackupPlayerType = "site";
			info.LastCleanBackupCodecFamily = "hevc";
			info.LastCleanBackupCodec = hevcSource.Codecs.toLowerCase();
			info.LastCleanBackupAt = Date.now();

			await vi.advanceTimersByTimeAsync(4999);
			expect(resolvedValue).toBe(null);
			await vi.advanceTimersByTimeAsync(1);
			await rejection;
			expect(findBackup).toHaveBeenCalledTimes(1);
			expect(resolvedValue).toBe(null);
			expect(info.VisibleAdStartedAt).toBe(cycleTwoStartedAt);
			expect(info.LastCleanBackupM3U8).toBe(cycleTwoBackup);
		} finally {
			vi.useRealTimers();
		}
	});

	it("re-arms a failed exact reload without releasing the quarantined ad response", async () => {
		const cycleStartedAt = 250;
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleStartedAt,
			IsUsingModifiedM3U8: true,
		});
		const handoffId = cycleHandoffId(info, cycleStartedAt, "first", 1, 260);
		info._CodecHandoffPendingId = handoffId;
		info._CodecHandoffAcknowledgedId = handoffId;
		const controller = new AbortController();
		activateAdContext(info);
		const pending = hold()(
			info,
			bridgeUrl,
			allAdNative,
			hevcSource.Codecs,
			true,
			controller.signal,
			handoffId,
		);

		expect(markHandoffFailed()(info, handoffId)).toBe(true);
		expect(info.IsUsingModifiedM3U8).toBe(false);
		await new Promise((resolve) => setTimeout(resolve, 300));

		expect(reloadMessages()).toHaveLength(1);
		expect(info._CodecHandoffPendingId).not.toBe(handoffId);
		expect(info._CodecHandoffReloadRetryCount).toBe(1);

		controller.abort();
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	});

	it("keeps exact reload recovery active beyond the initial rearm attempts", async () => {
		vi.useFakeTimers();
		const cycleStartedAt = 275;
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleStartedAt,
			IsUsingModifiedM3U8: true,
			_CodecHandoffReloadRetryCount: 2,
		});
		const handoffId = cycleHandoffId(info, cycleStartedAt, "first", 1, 285);
		info._CodecHandoffPendingId = handoffId;
		info._CodecHandoffAcknowledgedId = handoffId;
		const controller = new AbortController();
		activateAdContext(info);
		expect(markHandoffFailed()(info, handoffId)).toBe(true);
		const pending = hold()(
			info,
			bridgeUrl,
			allAdNative,
			hevcSource.Codecs,
			true,
			controller.signal,
			handoffId,
		);
		try {
			await vi.advanceTimersByTimeAsync(3000);

			expect(reloadMessages()).toHaveLength(1);
			expect(info._CodecHandoffReloadRetryCount).toBe(3);
			expect(info._CodecHandoffPendingId).not.toBe(handoffId);

			const rejection = expect(pending).rejects.toMatchObject({
				name: "AbortError",
			});
			controller.abort();
			await vi.advanceTimersByTimeAsync(16);
			await rejection;
		} finally {
			vi.useRealTimers();
		}
	});

	it("serves a same-rendition clean bridge after the exact handoff is acknowledged", async () => {
		const cycleStartedAt = 300;
		const cleanEnhancedNative = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:98",
			"#EXTINF:2.000,live",
			"https://edge.example/native-hevc-live-98.ts",
		].join("\n");
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: cycleStartedAt,
			LastCleanNativeM3U8: cleanEnhancedNative,
			LastCleanNativeUrl: bridgeUrl,
			LastCleanNativeCodec: hevcSource.Codecs,
			LastCleanNativePlaylistAt: Date.now(),
		});
		const handoffId = cycleHandoffId(
			info,
			cycleStartedAt,
			"acknowledged",
			1,
			310,
		);
		info._CodecHandoffPendingId = handoffId;
		info._CodecHandoffAcknowledgedId = handoffId;
		activateHandoffContext(info, handoffId);
		const controller = new AbortController();

		await expect(
			hold()(
				info,
				bridgeUrl,
				allAdNative,
				hevcSource.Codecs,
				true,
				controller.signal,
				handoffId,
			),
		).resolves.toBe(cleanEnhancedNative);
	});

	it("rejects native cache reuse across URL generations and codec families", () => {
		const isSameRequest = T<
			(
				info: Record<string, unknown>,
				url: string,
				codecs: string,
				enhanced: boolean,
				retiringCodecFamily?: string | null,
			) => boolean
		>("_isLastCleanNativeForRequest");
		const cachedUrl =
			"https://video-weaver.example/v1/playlist/live.m3u8?token=old";
		const info = makeInfo({
			LastCleanNativeUrl: cachedUrl,
			LastCleanNativeCodec: avcSource.Codecs,
		});

		expect(
			isSameRequest(
				info,
				"https://video-weaver.example/v1/playlist/live.m3u8?token=new",
				hevcSource.Codecs,
				true,
			),
		).toBe(false);
		expect(isSameRequest(info, cachedUrl, hevcSource.Codecs, true)).toBe(false);
		expect(isSameRequest(info, cachedUrl, avcSource.Codecs, false)).toBe(true);
		expect(
			isSameRequest(info, cachedUrl, avcSource.Codecs, false, "hevc"),
		).toBe(false);
		info.LastCleanNativeCodec = hevcSource.Codecs;
		expect(
			isSameRequest(info, cachedUrl, avcSource.Codecs, false, "hevc"),
		).toBe(true);
	});

	it("retains old enhanced URL identity after the replacement master removes its alias", async () => {
		const cycleStartedAt = 400;
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			IsUsingModifiedM3U8: true,
			LastCleanBackupM3U8: cleanBackup,
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupAt: Date.now(),
			VisibleAdStartedAt: cycleStartedAt,
			Urls: { [avcUrl]: avcSource },
			EnhancedVariantUrls: new Set([bridgeUrl]),
		});
		const handoffId = cycleHandoffId(
			info,
			cycleStartedAt,
			"replacement",
			1,
			410,
		);
		info._CodecHandoffPendingId = handoffId;
		info._CodecHandoffAcknowledgedId = handoffId;
		getState().ActiveCodecHandoffId = handoffId;
		getState().ActiveCodecHandoffChannel = "testchannel";
		getState().ActiveCodecHandoffMediaKey = "live:testchannel";
		activateAdContext(info);
		g._getStreamInfoForPlaylist = () => info;
		const controller = new AbortController();
		const staleEnhancedPoll = process()(
			bridgeUrl,
			allAdNative,
			fetchStub,
			controller.signal,
		);
		controller.abort();

		await expect(staleEnhancedPoll).rejects.toMatchObject({
			name: "AbortError",
		});
		info.EnhancedDecoderCodecFamily = null;
		info.EnhancedDecoderCodec = null;
		const replacementAvcPoll = await process()(
			avcUrl,
			adLadenNative,
			fetchStub,
		);
		expect(replacementAvcPoll).toContain("avc-backup-500.ts");
		expect(replacementAvcPoll).not.toContain("stitched-ad-99.ts");
	});

	it("does not send a generic cancellation before a clean backup exists", async () => {
		const info = makeEnhancedInfo();
		const controller = new AbortController();
		g._getStreamInfoForPlaylist = () => info;
		const pending = process()(
			bridgeUrl,
			allAdNative,
			fetchStub,
			controller.signal,
		);
		let settled = false;
		void pending.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			},
		);

		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(settled).toBe(false);
		expect(reloadMessages()).toHaveLength(0);

		controller.abort();
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	});

	it("returns a cached exact-codec backup without starting a decoder handoff", async () => {
		const cleanEnhancedBackup = cleanBackup.replaceAll(
			"avc-backup",
			"hevc-backup",
		);
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 1000,
			EnhancedDecoderCodecFamily: "hevc",
			EnhancedDecoderCodec: hevcSource.Codecs,
			LastCleanBackupM3U8: cleanEnhancedBackup,
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupCodecFamily: "hevc",
			LastCleanBackupCodec: hevcSource.Codecs.toLowerCase(),
			LastCleanBackupAt: Date.now(),
		});
		g._getStreamInfoForPlaylist = () => info;
		activateAdContext(info);
		g._findBackupStream = vi.fn(async () => ({
			type: "autoplay",
			m3u8: cleanEnhancedBackup,
		}));
		const realCore = g._processM3U8Core;
		g._processM3U8Core = async () => cleanEnhancedBackup;

		try {
			const out = await process()(bridgeUrl, adLadenNative, fetchStub);

			expect(out).toContain("hevc-backup-500.ts");
			expect(out).not.toContain("stitched-ad-99.ts");
			expect(reloadMessages()).toHaveLength(0);
			expect(info._CodecHandoffPendingId).toBe(null);
			expect(g._findBackupStream).not.toHaveBeenCalled();
		} finally {
			g._processM3U8Core = realCore;
		}
	});

	it("fails closed when byte-identical backup bodies have conflicting HEVC and AVC provenance", async () => {
		const rememberMetadata = T<
			(
				info: Record<string, unknown>,
				m3u8: string,
				codecFamily: string,
				codec: string,
			) => string
		>("_rememberBackupPlaylistMetadata");
		const realCore = g._processM3U8Core;
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 1000,
			LastCleanBackupM3U8: cleanBackup,
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupCodec: avcSource.Codecs.toLowerCase(),
			LastCleanBackupAt: Date.now(),
		});
		activateAdContext(info);
		rememberMetadata(info, cleanBackup, "hevc", hevcSource.Codecs);
		rememberMetadata(info, cleanBackup, "avc", avcSource.Codecs);
		// Scalar convenience fields must not erase the body-level provenance
		// conflict recorded above.
		info.LastCleanBackupM3U8 = cleanBackup;
		info.LastCleanBackupCodecFamily = "avc";
		info.LastCleanBackupCodec = avcSource.Codecs.toLowerCase();
		info.LastCleanBackupAt = Date.now();
		const metadata = (
			info.BackupPlaylistMetadata as Map<string, Record<string, unknown>>
		).get(cleanBackup);
		expect(metadata).toEqual({
			codecFamily: null,
			codec: null,
			ambiguous: true,
		});
		g._getStreamInfoForPlaylist = () => info;
		g._processM3U8Core = async () => cleanBackup;
		const controller = new AbortController();
		const pending = process()(
			bridgeUrl,
			adLadenNative,
			fetchStub,
			controller.signal,
		);
		let settled = false;
		void pending.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			},
		);

		try {
			await new Promise((resolve) => setTimeout(resolve, 25));
			expect(settled).toBe(false);
			expect(reloadMessages()).toHaveLength(0);
			controller.abort();
			await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		} finally {
			controller.abort();
			g._processM3U8Core = realCore;
		}
	});

	it("never misclassifies a cached mismatched HEVC descriptor as decoder-compatible", async () => {
		vi.useFakeTimers();
		const mismatchedBackup = cleanBackup.replaceAll(
			"avc-backup",
			"incompatible-hevc-backup",
		);
		const info = makeEnhancedInfo({
			IsShowingAd: true,
			VisibleAdStartedAt: Date.now() - 1000,
			EnhancedDecoderCodecFamily: "hevc",
			EnhancedDecoderCodec: hevcSource.Codecs,
			LastCleanBackupM3U8: mismatchedBackup,
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupCodecFamily: "hevc",
			LastCleanBackupCodec: "hvc1.2.4.L120.B0",
			LastCleanBackupAt: Date.now(),
		});
		const controller = new AbortController();
		const findBackup = installCleanBackup(info);
		const realCore = g._processM3U8Core;
		g._getStreamInfoForPlaylist = () => info;
		g._processM3U8Core = async () => mismatchedBackup;
		activateAdContext(info);
		abortRetiringRequestOnReload(info, controller);

		const pending = process()(
			bridgeUrl,
			adLadenNative,
			fetchStub,
			controller.signal,
		);
		const rejection = expect(pending).rejects.toMatchObject({
			name: "AbortError",
		});
		try {
			await vi.advanceTimersByTimeAsync(1000);
			await rejection;

			expect(findBackup).toHaveBeenCalled();
			expect(reloadMessages()).toHaveLength(1);
			expect(info.LastCleanBackupCodecFamily).toBe("avc");
			expect(info.LastCleanBackupCodec).toBe("avc1.4d402a");
		} finally {
			controller.abort();
			g._processM3U8Core = realCore;
			vi.useRealTimers();
		}
	});
});
describe("_dropEnhancedVariantLines (AVC fallback master shape)", () => {
	const fn = () =>
		T<
			(lines: string[]) => {
				kept: string[];
				removed: number;
				remaining: number;
			}
		>("_dropEnhancedVariantLines");

	const enhancedMaster = [
		"#EXTM3U",
		'#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="chunked",NAME="1440p60"',
		'#EXT-X-STREAM-INF:BANDWIDTH=15000000,RESOLUTION=2560x1440,CODECS="hev1.1.6.L153.B0,mp4a.40.2",VIDEO="chunked"',
		"https://edge.example/1440-hevc/index.m3u8",
		'#EXT-X-STREAM-INF:BANDWIDTH=12000000,RESOLUTION=2560x1440,CODECS="av01.0.13M.08,mp4a.40.2",VIDEO="1440p60-av1"',
		"https://edge.example/1440-av1/index.m3u8",
		'#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,CODECS="avc1.4D402A,mp4a.40.2",VIDEO="1080p60"',
		"https://edge.example/1080-avc/index.m3u8",
		'#EXT-X-STREAM-INF:BANDWIDTH=1300000,RESOLUTION=640x360,CODECS="avc1.4D401E,mp4a.40.2",VIDEO="360p30"',
		"https://edge.example/360-avc/index.m3u8",
	];

	it("drops enhanced variants outright instead of aliasing them onto an AVC URI", () => {
		const { kept, removed, remaining } = fn()(enhancedMaster);
		const master = kept.join("\n");
		expect(removed).toBe(2);
		expect(remaining).toBe(2);
		expect(master).not.toContain("hev1.");
		expect(master).not.toContain("av01.");
		expect(master).not.toContain("2560x1440");
		expect(master).toContain("https://edge.example/1080-avc/index.m3u8");
		expect(master).toContain("https://edge.example/360-avc/index.m3u8");
	});

	it("emits each variant URI exactly once so the player cannot pick a mislabelled duplicate", () => {
		const uris = fn()(enhancedMaster).kept.filter((line) =>
			line.startsWith("https://"),
		);
		expect(uris).toEqual([
			"https://edge.example/1080-avc/index.m3u8",
			"https://edge.example/360-avc/index.m3u8",
		]);
	});

	it("leaves an AVC-only master untouched", () => {
		const avcOnly = enhancedMaster.slice(6);
		const { kept, removed } = fn()(avcOnly);
		expect(removed).toBe(0);
		expect(kept).toEqual(avcOnly);
	});

	it("reports no AVC rung left when every variant is enhanced, so callers can decline the swap", () => {
		const { removed, remaining } = fn()(enhancedMaster.slice(0, 6));
		expect(removed).toBe(2);
		expect(remaining).toBe(0);
	});
});

describe("_prepareFatalMediaRecovery", () => {
	const cleanBackup = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		"#EXT-X-MEDIA-SEQUENCE:700",
		"#EXTINF:2.000,live",
		"https://edge.example/avc-live-700.ts",
	].join("\n");
	const adMarkedBackup = [
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		"#EXT-X-MEDIA-SEQUENCE:700",
		'#EXT-X-DATERANGE:ID="stitched-ad-700",CLASS="twitch-stitched-ad"',
		"#EXTINF:2.000,Amazon",
		"https://edge.example/ad-700.ts",
	].join("\n");
	let realRefreshHeld: unknown;
	let realRefreshActive: unknown;
	let realPostWorkerBridgeMessage: unknown;
	let realCreatePageScopedWorkerEvent: unknown;

	const prepare = () =>
		T<
			(
				info: Record<string, unknown>,
				realFetch: (...args: unknown[]) => Promise<unknown>,
				request: Record<string, unknown>,
			) => Promise<boolean>
		>("_prepareFatalMediaRecovery");

	const fatalRequest = (
		info: Record<string, unknown>,
		label: string,
		requestedAt: number,
		sequence = 1,
	) => {
		const cycleStartedAt = activateExactAdCycle(
			info,
			Math.max(1, Number(info.VisibleAdStartedAt) || requestedAt - 1),
		);
		return {
			recoveryId: cycleHandoffId(
				info,
				cycleStartedAt,
				label,
				sequence,
				requestedAt,
			),
			requestedAt,
			cycleStartedAt,
			channelName: "testchannel",
			mediaKey: "live:testchannel",
		};
	};

	beforeEach(() => {
		realRefreshHeld = g._refreshHeldAutoplayBackupPlaylist;
		realRefreshActive = g._refreshActiveBackupMediaPlaylist;
		realPostWorkerBridgeMessage = g._postWorkerBridgeMessage;
		realCreatePageScopedWorkerEvent = g._createPageScopedWorkerEvent;
		g._postWorkerBridgeMessage = vi.fn();
		g._createPageScopedWorkerEvent = (value: unknown) => value;
		getState().CurrentAdMediaKey = "live:testchannel";
		getState().StreamInfos = Object.create(null);
	});

	afterEach(() => {
		g._refreshHeldAutoplayBackupPlaylist = realRefreshHeld;
		g._refreshActiveBackupMediaPlaylist = realRefreshActive;
		g._postWorkerBridgeMessage = realPostWorkerBridgeMessage;
		g._createPageScopedWorkerEvent = realCreatePageScopedWorkerEvent;
		getState().CurrentAdMediaKey = null;
	});

	it("arms one exact reload only after a newly fetched clean backup", async () => {
		const requestedAt = Date.now();
		const info = makeInfo({
			IsShowingAd: true,
			ModifiedM3U8: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000",
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupAt: requestedAt - 1000,
		});
		g._refreshHeldAutoplayBackupPlaylist = vi.fn(async () => {
			info.LastCleanBackupAt = Date.now();
			info.LastCleanBackupM3U8 = cleanBackup;
			info.LastCleanBackupCodecFamily = "avc";
			return cleanBackup;
		});
		g._findBackupStream = vi.fn();
		const request = fatalRequest(info, "clean", requestedAt);

		const ready = await prepare()(
			info,
			async () => new Response("", { status: 500 }),
			request,
		);

		expect(ready).toBe(true);
		expect(g._refreshHeldAutoplayBackupPlaylist).toHaveBeenCalledTimes(1);
		expect(g._findBackupStream).not.toHaveBeenCalled();
		expect(info._CodecHandoffPendingId).toBe(request.recoveryId);
		expect(info.IsUsingModifiedM3U8).toBe(true);
		expect(g._postWorkerBridgeMessage).toHaveBeenCalledTimes(1);
		expect(
			(g._postWorkerBridgeMessage as ReturnType<typeof vi.fn>).mock.calls[0][1],
		).toMatchObject({
			key: "FatalMediaRecoveryReady",
			recoveryId: request.recoveryId,
			mediaKey: "live:testchannel",
		});
	});

	it("authorizes ordinary AVC recovery without inventing a codec handoff", async () => {
		const requestedAt = Date.now();
		const info = makeInfo({
			IsShowingAd: true,
			ActiveBackupPlayerType: "site",
			LastCleanBackupPlayerType: "site",
			LastCleanBackupAt: requestedAt - 1000,
		});
		g._refreshActiveBackupMediaPlaylist = vi.fn(async () => {
			info.LastCleanBackupAt = Date.now();
			info.LastCleanBackupM3U8 = cleanBackup;
			info.LastCleanBackupCodecFamily = "avc";
			return cleanBackup;
		});
		g._findBackupStream = vi.fn();
		const request = fatalRequest(info, "ordinary-avc", requestedAt);

		const ready = await prepare()(
			info,
			async () => new Response("", { status: 500 }),
			request,
		);

		expect(ready).toBe(true);
		expect(g._refreshActiveBackupMediaPlaylist).toHaveBeenCalledTimes(1);
		expect(info._CodecHandoffPendingId).toBe(null);
		expect(info.IsUsingModifiedM3U8).toBe(false);
		expect(
			(g._postWorkerBridgeMessage as ReturnType<typeof vi.fn>).mock.calls[0][1],
		).toMatchObject({
			key: "FatalMediaRecoveryReady",
			recoveryId: request.recoveryId,
			requiresCodecHandoff: false,
		});
	});

	it("rejects an old cached backup when no fresh verification succeeds", async () => {
		const requestedAt = Date.now();
		const info = makeInfo({
			IsShowingAd: true,
			ModifiedM3U8: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000",
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
			LastCleanBackupCodecFamily: "avc",
			LastCleanBackupM3U8: cleanBackup,
			LastCleanBackupAt: requestedAt - 1000,
		});
		g._refreshHeldAutoplayBackupPlaylist = vi.fn(async () => null);
		g._findBackupStream = vi.fn(async () => ({
			type: "autoplay",
			m3u8: cleanBackup,
		}));
		const request = fatalRequest(info, "stale", requestedAt);

		const ready = await prepare()(
			info,
			async () => new Response("", { status: 500 }),
			request,
		);

		expect(ready).toBe(false);
		expect(info._CodecHandoffPendingId).toBe(null);
		expect(g._postWorkerBridgeMessage).not.toHaveBeenCalled();
	});

	it("never authorizes recovery from an ad-marked refresh", async () => {
		const requestedAt = Date.now();
		const info = makeInfo({
			IsShowingAd: true,
			ModifiedM3U8: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000",
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
		});
		g._refreshHeldAutoplayBackupPlaylist = vi.fn(async () => {
			info.LastCleanBackupAt = Date.now();
			info.LastCleanBackupCodecFamily = "avc";
			return adMarkedBackup;
		});
		g._findBackupStream = vi.fn(async () => ({
			type: null,
			m3u8: null,
		}));
		const request = fatalRequest(info, "ad", requestedAt);

		const ready = await prepare()(
			info,
			async () => new Response("", { status: 500 }),
			request,
		);

		expect(ready).toBe(false);
		expect(info._CodecHandoffPendingId).toBe(null);
		expect(g._postWorkerBridgeMessage).not.toHaveBeenCalled();
	});

	it("never authorizes recovery from a clean enhanced-only backup", async () => {
		const requestedAt = Date.now();
		const info = makeInfo({
			IsShowingAd: true,
			ModifiedM3U8: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000",
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
		});
		g._refreshHeldAutoplayBackupPlaylist = vi.fn(async () => {
			info.LastCleanBackupAt = Date.now();
			info.LastCleanBackupCodecFamily = "hevc";
			return cleanBackup;
		});
		g._findBackupStream = vi.fn();
		const request = fatalRequest(info, "hevc", requestedAt);

		const ready = await prepare()(
			info,
			async () => new Response("", { status: 500 }),
			request,
		);

		expect(ready).toBe(false);
		expect(info._CodecHandoffPendingId).toBe(null);
		expect(g._postWorkerBridgeMessage).not.toHaveBeenCalled();
	});

	it("lets the newest request own recovery when an older verification finishes late", async () => {
		const requestedAt = Date.now();
		const info = makeInfo({
			IsShowingAd: true,
			ModifiedM3U8: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000",
			ActiveBackupPlayerType: "autoplay",
			LastCleanBackupPlayerType: "autoplay",
		});
		let resolveFirst!: (value: string) => void;
		let resolveSecond!: (value: string) => void;
		g._refreshHeldAutoplayBackupPlaylist = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<string>((resolve) => {
						resolveFirst = resolve;
					}),
			)
			.mockImplementationOnce(
				() =>
					new Promise<string>((resolve) => {
						resolveSecond = resolve;
					}),
			);
		g._findBackupStream = vi.fn();
		const firstRequest = fatalRequest(info, "first", requestedAt, 1);
		const secondRequest = fatalRequest(info, "second", requestedAt, 2);

		const first = prepare()(
			info,
			async () => new Response("", { status: 500 }),
			firstRequest,
		);
		const second = prepare()(
			info,
			async () => new Response("", { status: 500 }),
			secondRequest,
		);
		info.LastCleanBackupAt = Date.now();
		info.LastCleanBackupCodecFamily = "avc";
		resolveSecond(cleanBackup);
		await expect(second).resolves.toBe(true);
		resolveFirst(cleanBackup);
		await expect(first).resolves.toBe(false);

		expect(info._CodecHandoffPendingId).toBe(secondRequest.recoveryId);
		expect(g._postWorkerBridgeMessage).toHaveBeenCalledTimes(1);
		expect(
			(g._postWorkerBridgeMessage as ReturnType<typeof vi.fn>).mock.calls[0][1],
		).toMatchObject({ recoveryId: secondRequest.recoveryId });
	});
});
