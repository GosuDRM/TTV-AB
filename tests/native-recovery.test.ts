import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const source = ["constants", "state", "parser", "api", "processor", "hooks"]
	.map((name) =>
		readFileSync(resolve(__dirname, `../dist/src/modules/${name}.js`), "utf8"),
	)
	.join("\n");
const avc = "avc1.64002a,mp4a.40.2";
const hevc = "hev1.1.2.L150.90.0.0.0.0.0,mp4a.40.2";
const nativeUrl = "https://edge.example/1080p.m3u8?token=owned";
const enhancedUrl = "https://edge.example/1440p.m3u8?token=owned";
const backupUrl = "https://edge.example/360p.m3u8?token=autoplay";
const probeUrl = "https://edge.example/1080p.m3u8?token=fresh";
const masterUrl =
	"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8?sig=owned&token=owned";
const master = [
	"#EXTM3U",
	`#EXT-X-STREAM-INF:RESOLUTION=2560x1440,FRAME-RATE=60,VIDEO="chunked",CODECS="${hevc}"`,
	enhancedUrl,
	`#EXT-X-STREAM-INF:RESOLUTION=1920x1080,FRAME-RATE=60,VIDEO="1080p60",CODECS="${avc}"`,
	nativeUrl,
].join("\n");
const playlist = (sequence: number, prefix: string, adMarked = false) =>
	[
		"#EXTM3U",
		'#EXT-X-DATERANGE:ID="session",CLASS="twitch-session",X-TV-TWITCH-SESSIONID="test-session"',
		'#EXT-X-DATERANGE:ID="source",CLASS="twitch-stream-source",X-TV-TWITCH-STREAM-SOURCE="live"',
		'#EXT-X-DATERANGE:ID="trigger",CLASS="twitch-trigger",X-TV-TWITCH-TRIGGER-URL="https://edge.example/trigger/test"',
		"#EXT-X-TARGETDURATION:2",
		`#EXT-X-MEDIA-SEQUENCE:${sequence}`,
		...(adMarked
			? ['#EXT-X-DATERANGE:ID="stitched-ad-2",CLASS="twitch-stitched-ad"']
			: []),
		...Array.from({ length: 3 }, (_, index) => [
			"#EXTINF:2.000,live",
			`https://edge.example/${prefix}-${sequence + index}.ts`,
		]).flat(),
	].join("\n");

function setup(withCodecHandoff = true) {
	let now = 200000;
	vi.spyOn(Date, "now").mockImplementation(() => now);
	const report = vi.fn();
	const context = createContext({
		URL,
		URLSearchParams,
		Response,
		Request,
		Headers,
		EventTarget,
		Event,
		AbortController,
		DOMException,
		setTimeout,
		clearTimeout,
		performance,
		Date,
		postMessage: vi.fn(),
	});
	context.self = context;
	runInContext(source, context);
	runInContext(
		`
		_declareState(globalThis);
		_log = () => {};
		globalThis.state = __TTVAB_STATE__;
		state.PageMediaKey = "live:testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.CurrentAdChannel = "testchannel";
		globalThis.info = _createStreamInfo({ MediaType: "live", ChannelName: "testchannel" });
		state.StreamInfos[info.MediaKey] = info;
		info.ObservedAdPodIds = new Set(["stitched-ad-1", "stitched-ad-2"]);
	`,
		context,
	);
	const { info, state } = context;
	context._postWorkerBridgeMessage = report;
	context._notifyAdComplete = vi.fn(async () => {});
	const token = vi.fn(async () =>
		Response.json({
			data: {
				streamPlaybackAccessToken: { signature: "fresh", value: "fresh" },
			},
		}),
	);
	context._getToken = token;
	const resolutions = [
		{
			Resolution: "2560x1440",
			FrameRate: "60",
			Name: "chunked",
			Codecs: hevc,
			Url: enhancedUrl,
		},
		{
			Resolution: "1920x1080",
			FrameRate: "60",
			Name: "1080p60",
			Codecs: avc,
			Url: nativeUrl,
		},
	];
	Object.assign(info, {
		IsHoldingBackupAfterAd: true,
		IsUsingBackupStream: true,
		IsUsingModifiedM3U8: true,
		HevcReloadPendingAfterHold: true,
		VisibleAdStartedAt: 100000,
		SilentBackupHoldStartedAt: 190000,
		LastAdPodProgressAt: 108000,
		ExpectedAdPodLength: 7,
		MaxObservedAdPodPosition: 2,
		EncodingsM3U8: master,
		UsherBaseUrl: masterUrl,
		ModifiedM3U8: master
			.split("\n")
			.filter((line) => !line.includes("1440") && !line.includes(hevc))
			.join("\n"),
		ResolutionList: resolutions,
		SustainedNativeResolution: resolutions[0],
		ActiveBackupPlayerType: "autoplay",
		ActiveBackupResolution: "640x360",
		LastCleanBackupM3U8: playlist(100, "backup"),
		LastCleanBackupPlayerType: "autoplay",
		LastCleanBackupResolution: "640x360",
		LastCleanBackupCodecFamily: "avc",
		LastCleanBackupCodec: avc,
		LastCleanBackupAt: now,
	});
	for (const resolution of resolutions) {
		info.Urls[resolution.Url] = resolution;
		state.StreamInfosByUrl[resolution.Url] = info;
	}
	if (withCodecHandoff) {
		const handoffId = context._requestCodecHandoffReload(
			info,
			info.VisibleAdStartedAt,
		);
		info._CodecHandoffAcknowledgedId = handoffId;
		info.NativeRecoveryLoaderEpoch = 1;
		state.ActiveCodecHandoffId = handoffId;
		state.ActiveCodecHandoffMediaKey = info.MediaKey;
		state.ActiveCodecHandoffChannel = info.ChannelName;
	}
	info.BackupEncodingsM3U8Cache.autoplay = {
		m3u8: `#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=640x360,CODECS="${avc}"\n${backupUrl}`,
		baseUrl: masterUrl.replaceAll("owned", "autoplay"),
	};
	context._rememberBackupPlaylistMetadata(
		info,
		info.LastCleanBackupM3U8,
		"avc",
		avc,
		{
			playerType: "autoplay",
			resolution: "640x360",
			playlistUrl: backupUrl,
			sessionUrl: info.BackupEncodingsM3U8Cache.autoplay.baseUrl,
		},
	);
	let backupSequence = 100;
	let targetSequence = 1000;
	let requestSequence = 500;
	const target = vi.fn(
		async (url: string) =>
			new Response(
				playlist(++targetSequence, url === enhancedUrl ? "hevc" : "avc"),
			),
	);
	const fetch = vi.fn(async (input: string | URL) => {
		const url = String(input);
		if (url === backupUrl)
			return new Response(playlist(++backupSequence, "backup"));
		if (url === enhancedUrl || url === nativeUrl) {
			return target(url);
		}
		if (url === probeUrl) return new Response(playlist(800, "fresh-ad", true));
		if (url.includes("usher.ttvnw.net")) {
			return new Response(master.replaceAll("token=owned", "token=fresh"));
		}
		throw new Error(`Unexpected fetch: ${url}`);
	});
	const serve = async (
		adMarked = false,
		url = nativeUrl,
		sequence = ++requestSequence,
	) => {
		now += 2000;
		return context._processM3U8(
			url,
			playlist(sequence, "avc", adMarked),
			fetch,
		);
	};
	const checkRecovery = async () => {
		now += 2000;
		return context._isAdEndStable(
			info,
			fetch,
			resolutions[1],
			{
				requestStartMediaKey: info.MediaKey,
				requestStartCycleStartedAt: info.VisibleAdStartedAt,
				cycleStartedAt: info.VisibleAdStartedAt,
				loaderEpoch: info.NativeRecoveryLoaderEpoch,
				backupSearchEpoch: info.BackupSearchEpoch,
			},
			null,
			playlist(++requestSequence, "avc"),
			nativeUrl,
			true,
		);
	};
	const restored = () =>
		report.mock.calls.find(
			([, message]) => message.key === "NativePlaybackRestored",
		)?.[1];
	return {
		context,
		info,
		state,
		fetch,
		target,
		token,
		serve,
		checkRecovery,
		restored,
	};
}

const reducedNativeUrl = "https://edge.example/360p.m3u8?token=reduced";
const reducedMasterUrl = masterUrl.replaceAll("owned", "reduced");
const reducedMaster = [
	"#EXTM3U",
	`#EXT-X-STREAM-INF:RESOLUTION=640x360,VIDEO="360p",CODECS="${avc}"`,
	reducedNativeUrl,
	`#EXT-X-STREAM-INF:RESOLUTION=284x160,VIDEO="160p",CODECS="${avc}"`,
	"https://edge.example/160p.m3u8?token=reduced",
].join("\n");

async function setupReducedNativeMaster(
	enhancedCodec: string | null = null,
	cleanBeforeBreak = true,
) {
	const fixture = setup(false);
	const { context, info, state, fetch, serve } = fixture;
	context._resetStreamAdState(info);
	state.CurrentAdMediaKey = null;
	state.CurrentAdChannel = null;
	state.PreferredQualityGroup = "1440p60";
	if (!cleanBeforeBreak) state.PagePlaybackVisibleSinceAt = 0;
	const originalFetch = fetch.getMockImplementation();
	if (!originalFetch) throw new Error("Missing native fetch fixture");
	const fullMaster = enhancedCodec
		? master.replace(hevc, enhancedCodec)
		: master
				.split("\n")
				.filter((line) => !line.includes("1440") && !line.includes(hevc))
				.join("\n");
	fetch.mockImplementation(async (input: string | URL) => {
		const url = String(input);
		if (url === masterUrl) return new Response(fullMaster);
		if (url === reducedMasterUrl) return new Response(reducedMaster);
		if (url.includes("token=reduced")) return fixture.target(url);
		return originalFetch(input);
	});
	context.fetch = fetch;
	context._hookWorkerFetch();
	await context.fetch(masterUrl);
	info.SustainedNativeResolution = null;
	if (cleanBeforeBreak) {
		await serve(false, enhancedCodec ? enhancedUrl : nativeUrl);
		expect(info.SustainedNativeResolution.Resolution).toBe(
			enhancedCodec ? "2560x1440" : "1920x1080",
		);
	} else {
		info.IsShowingAd = true;
		expect(info.LastCleanNativeM3U8).toBeNull();
	}
	await context.fetch(reducedMasterUrl);
	expect(
		info.ResolutionList.map(
			(entry: { Resolution: string }) => entry.Resolution,
		),
	).toEqual(["640x360", "284x160"]);
	Object.assign(info, {
		IsShowingAd: false,
		IsHoldingBackupAfterAd: true,
		IsUsingBackupStream: true,
		HevcReloadPendingAfterHold: true,
		VisibleAdStartedAt: Date.now() + 1,
		SilentBackupHoldStartedAt: Date.now() + 1,
		ExpectedAdPodLength: 1,
		MaxObservedAdPodPosition: 1,
		ActiveBackupPlayerType: "autoplay",
		LastCleanBackupAt: Date.now(),
	});
	state.CurrentAdMediaKey = info.MediaKey;
	state.CurrentAdChannel = info.ChannelName;
	if (!cleanBeforeBreak)
		info.SustainedNativeResolution = info.ResolutionList[0];
	if (enhancedCodec) {
		const handoffId = context._requestCodecHandoffReload(
			info,
			info.VisibleAdStartedAt,
		);
		info._CodecHandoffAcknowledgedId = handoffId;
		info.EnhancedDecoderCodec = null;
		info.EnhancedDecoderCodecFamily = null;
		state.ActiveCodecHandoffId = handoffId;
		state.ActiveCodecHandoffMediaKey = info.MediaKey;
		state.ActiveCodecHandoffChannel = info.ChannelName;
	}
	return fixture;
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("owned native recovery after a codec fallback", () => {
	it.each(["vod", "disabled", "auxiliary", "ad", "hold", "backup", "fallback"])(
		"does not seed the initial native catalog from %s playback",
		async (reason) => {
			const { context, info, state } = setup(false);
			context._resetStreamAdState(info);
			state.CurrentAdMediaKey = null;
			state.CurrentAdChannel = null;
			if (reason === "disabled") state.IsAdStrippingEnabled = false;
			if (reason === "auxiliary") state.PageMediaKey = "live:other";
			if (reason === "ad") info.IsShowingAd = true;
			if (reason === "hold") info.IsHoldingBackupAfterAd = true;
			if (reason === "backup") info.IsUsingBackupStream = true;
			if (reason === "fallback") info.IsUsingFallbackStream = true;
			const url =
				reason === "vod"
					? "https://usher.ttvnw.net/vod/123456.m3u8?sig=owned"
					: masterUrl;
			if (reason === "vod") state.PageMediaKey = "vod:123456";
			context.fetch = async () => new Response(master);
			context._hookWorkerFetch();
			await context.fetch(url);
			const observed =
				reason === "vod" ? state.StreamInfos["vod:123456"] : info;
			expect(observed._NativePlaybackMaster).toBeNull();
			expect(observed._PendingPostAdNativeMaster).toBeNull();
		},
	);

	it("recovers configured quality after a hidden preroll with no prior clean native playback", async () => {
		const { context, info, state, serve, restored } =
			await setupReducedNativeMaster(null, false);
		state.PreferredQualityGroup = "1080p60";
		expect(info.LastCleanNativeM3U8).toBeNull();
		expect(info._PendingPostAdNativeMaster).toBeNull();
		for (let index = 0; index < 24 && !restored(); index++)
			await serve(false, reducedNativeUrl);
		expect(restored()?.requiresReload).toBe(true);
		expect(info._PendingPostAdNativeMaster?.playlistUrl).toBe(nativeUrl);
		const rebuilt = await (await context.fetch(reducedMasterUrl)).text();
		expect(rebuilt).toContain(nativeUrl);
		expect(rebuilt).not.toContain(reducedNativeUrl);
		expect(state.PagePlaybackVisibleSinceAt).toBe(0);
	});

	it("recovers the observed native quality after a later master removes higher renditions", async () => {
		const { context, info, serve, restored } = await setupReducedNativeMaster();
		for (let index = 0; index < 24 && !restored(); index++) {
			await serve(false, reducedNativeUrl);
		}
		expect(restored()?.requiresReload).toBe(true);
		expect(info._PendingPostAdNativeMaster?.playlistUrl).toBe(nativeUrl);
		expect(info._PendingPostAdNativeMaster?.master).toContain("1920x1080");
		const rebuilt = await (await context.fetch(reducedMasterUrl)).text();
		expect(rebuilt).toContain(nativeUrl);
		expect(rebuilt).not.toContain(reducedNativeUrl);
		expect(info.Urls[nativeUrl]?.Resolution).toBe("1920x1080");
		await context.fetch(nativeUrl);
		expect(info._PendingPostAdNativeMaster?.consumed).toBe(true);
	});

	it.each([
		{ codec: hevc, disabled: false },
		{ codec: hevc, disabled: true },
		{ codec: "av01.0.12M.08,mp4a.40.2", disabled: false },
		{ codec: "av01.0.12M.08,mp4a.40.2", disabled: true },
	])(
		"restores retained 1440p $codec after a reduced master with fallback disabled=$disabled",
		async ({ codec, disabled }) => {
			const { context, state, info, serve, restored } =
				await setupReducedNativeMaster(codec);
			state.DisableAutoplayBackup = disabled;
			for (let index = 0; index < 24 && !restored(); index++)
				await serve(false, reducedNativeUrl);
			expect(info._PendingPostAdNativeMaster).toMatchObject({
				playlistUrl: enhancedUrl,
				codec,
				resolution: "2560x1440",
			});
			const rebuilt = await (await context.fetch(reducedMasterUrl)).text();
			expect(rebuilt).toContain(enhancedUrl);
			expect(rebuilt).toContain(nativeUrl);
			expect(info.Urls[enhancedUrl]?.Codecs).toBe(codec);
		},
	);

	it.each([
		{ failure: "ad", cleanBeforeBreak: true },
		{ failure: "stopped", cleanBeforeBreak: true },
		{ failure: "http-error", cleanBeforeBreak: true },
		{ failure: "ad", cleanBeforeBreak: false },
		{ failure: "stopped", cleanBeforeBreak: false },
		{ failure: "http-error", cleanBeforeBreak: false },
	])(
		"keeps the backup when the retained native session is $failure with prior clean playback=$cleanBeforeBreak",
		async ({ failure, cleanBeforeBreak }) => {
			const { info, target, serve, restored } = await setupReducedNativeMaster(
				null,
				cleanBeforeBreak,
			);
			target.mockImplementation(async () =>
				failure === "http-error"
					? new Response(null, { status: 403 })
					: new Response(playlist(1000, "retained", failure === "ad")),
			);
			for (let index = 0; index < 24; index++)
				await serve(false, reducedNativeUrl);
			expect(restored()).toBeUndefined();
			expect(info.IsHoldingBackupAfterAd).toBe(true);
			expect(info._PendingPostAdNativeMaster).toBeNull();
		},
	);

	it.each(
		[
			"route",
			"generation",
			"expired-before-break",
			"future-observation",
			"cycle-owner",
			"vod",
			"disabled",
			"explicit-360",
			"audio-only",
		].flatMap((reason) =>
			[true, false].map((cleanBeforeBreak) => ({ reason, cleanBeforeBreak })),
		),
	)(
		"does not use a retained catalog after $reason with prior clean playback=$cleanBeforeBreak",
		async ({ reason, cleanBeforeBreak }) => {
			const { context, info, state } = await setupReducedNativeMaster(
				null,
				cleanBeforeBreak,
			);
			if (reason === "route") state.PageMediaKey = "live:other";
			if (reason === "generation") state.PagePlaybackContextGeneration++;
			if (reason === "expired-before-break")
				info._NativePlaybackMaster.observedAt -= 60001;
			if (reason === "future-observation")
				info._NativePlaybackMaster.observedAt = info.VisibleAdStartedAt + 1;
			if (reason === "cycle-owner") state.CurrentAdMediaKey = "live:other";
			if (reason === "vod") info.MediaType = "vod";
			if (reason === "disabled") state.IsAdStrippingEnabled = false;
			if (reason === "explicit-360") state.PreferredQualityGroup = "360p";
			if (reason === "audio-only") state.PreferredQualityGroup = "audio_only";
			expect(context._getNativeRecoveryMaster(info).master).toBe(reducedMaster);
		},
	);

	it("retains the normal backup target when a reduced master advertises only the bridge height", async () => {
		const { context, info } = await setupReducedNativeMaster();
		expect(
			context._resolveAdBackupTargetResolution(info, reducedNativeUrl)
				?.Resolution,
		).toBe("1920x1080");
	});

	it("keeps the retained native session through ad completion and clears it on context reset", async () => {
		const { context, info } = await setupReducedNativeMaster();
		const saved = info._NativePlaybackMaster;
		context._resetStreamAdState(info, true);
		expect(info._NativePlaybackMaster).toBe(saved);
		context._resetStreamAdState(info);
		expect(info._NativePlaybackMaster).toBeNull();
	});

	it.each([
		{ quality: "1080p60", disabled: false, expectedUrl: nativeUrl },
		{ quality: "1080p60", disabled: true, expectedUrl: nativeUrl },
		{ quality: "chunked", disabled: false, expectedUrl: enhancedUrl },
		{ quality: "chunked", disabled: true, expectedUrl: enhancedUrl },
	])(
		"verifies $quality after a complete pod on an AVC bridge (fallback disabled: $disabled)",
		async ({ quality, disabled, expectedUrl }) => {
			const { info, state, target, serve, restored } = setup(false);
			const lowUrl = "https://edge.example/native360.m3u8?token=owned";
			const lowResolution = {
				Resolution: "640x360",
				Name: "360p",
				Codecs: avc,
				Url: lowUrl,
			};
			info.IsUsingModifiedM3U8 = false;
			info.HevcReloadPendingAfterHold = false;
			info.ExpectedAdPodLength = 2;
			info.ResolutionList.push(lowResolution);
			info.Urls[lowUrl] = lowResolution;
			state.StreamInfosByUrl[lowUrl] = info;
			info.EncodingsM3U8 += `\n#EXT-X-STREAM-INF:RESOLUTION=640x360,VIDEO="360p",CODECS="${avc}"\n${lowUrl}`;
			state.PreferredQualityGroup = quality;
			state.DisableAutoplayBackup = disabled;
			for (let index = 0; index < 30 && !restored(); index++)
				await serve(false, lowUrl);
			expect(restored()).toMatchObject({
				requiresReload: true,
				refreshAccessToken: false,
			});
			expect(target).toHaveBeenCalledWith(expectedUrl);
			expect(info._PendingPostAdNativeMaster.playlistUrl).toBe(expectedUrl);
		},
	);

	it("preserves the native session when low-latency delivery directives change", async () => {
		const { context, info, state, fetch, token, serve, restored } =
			setup(false);
		info.IsUsingModifiedM3U8 = false;
		info.ExpectedAdPodLength = 2;
		state.PreferredQualityGroup = "1080p60";
		for (let index = 0; index < 30 && !restored(); index++) {
			await serve(
				false,
				`${nativeUrl}&_HLS_msn=${500 + index}&_HLS_part=0&_HLS_skip=YES`,
			);
		}
		expect(restored()).toMatchObject({
			requiresReload: true,
			refreshAccessToken: false,
		});
		expect(info._PendingPostAdNativeMaster.playlistUrl).toBe(nativeUrl);
		expect(token).not.toHaveBeenCalled();
		context.fetch = fetch;
		context._hookWorkerFetch();
		const rebuiltMaster = await (
			await context.fetch(masterUrl.replaceAll("owned", "fresh"))
		).text();
		expect(rebuiltMaster).toContain(nativeUrl);
		expect(rebuiltMaster).not.toContain("token=fresh");
	});

	it.each(["token=fresh", "token=owned&session=fresh"])(
		"does not merge %s into native ownership while delivery directives change",
		async (query) => {
			const { info, target, serve, restored } = setup(false);
			info.IsUsingModifiedM3U8 = false;
			info.ExpectedAdPodLength = 2;
			for (let index = 0; index < 30; index++) {
				await serve(
					false,
					`https://edge.example/1080p.m3u8?${query}&_HLS_msn=${500 + index}`,
				);
			}
			expect(restored()).toBeUndefined();
			expect(target).not.toHaveBeenCalled();
			expect(info._PendingPostAdNativeMaster).toBeNull();
		},
	);

	it("resets native clean proof when ads return on a low-latency refresh", async () => {
		const { info, serve, restored } = setup(false);
		info.IsUsingModifiedM3U8 = false;
		info.ExpectedAdPodLength = 2;
		for (let index = 0; index < 5; index++) {
			await serve(false, `${nativeUrl}&_HLS_msn=${500 + index}`);
		}
		expect(info.NativeRecoveryCandidateCleanCount).toBeGreaterThan(0);
		const output = await serve(true, `${nativeUrl}&_HLS_msn=505`);
		expect(output).not.toContain("stitched-ad");
		expect(info.NativeRecoveryCandidateCleanCount).toBe(0);
		expect(restored()).toBeUndefined();
	});

	it("retains owned recovery when no codec handoff was required", async () => {
		const { serve, restored, token } = setup(false);
		for (let index = 0; index < 30 && !restored(); index++) await serve();
		expect(restored()).toMatchObject({
			requiresReload: true,
			refreshAccessToken: false,
		});
		expect(token).not.toHaveBeenCalled();
	});

	it("verifies a master variant before rebuilding from an owned ad-session URL outside that master", async () => {
		const { context, info, state, target, serve, restored, fetch } =
			setup(false);
		const adSessionUrl = nativeUrl.replace("token=owned", "token=ad-session");
		info.IsUsingModifiedM3U8 = false;
		info.ExpectedAdPodLength = 2;
		info.NativeRecoveryAdPlaylistUrls.add(adSessionUrl);
		info.NativeRecoveryAdMediaKey = info.MediaKey;
		info.NativeRecoveryAdStartedAt = info.VisibleAdStartedAt;
		state.StreamInfosByUrl[adSessionUrl] = info;
		for (let index = 0; index < 30 && !restored(); index++) {
			await serve(false, adSessionUrl);
		}
		expect(restored()).toMatchObject({
			requiresReload: true,
			refreshAccessToken: false,
		});
		expect(target).toHaveBeenCalledWith(enhancedUrl);
		expect(info._PendingPostAdNativeMaster).toMatchObject({
			playlistUrl: enhancedUrl,
		});
		context.fetch = fetch;
		context._hookWorkerFetch();
		const rebuiltMaster = await (
			await context.fetch(masterUrl.replaceAll("owned", "fresh"))
		).text();
		expect(rebuiltMaster).toContain(enhancedUrl);
		expect(rebuiltMaster).not.toContain("token=fresh");
	});

	it("keeps the backup when an owned ad-session URL is clean but the master recovery target still contains ads", async () => {
		const { info, state, target, serve, restored } = setup(false);
		const adSessionUrl = nativeUrl.replace("token=owned", "token=ad-session");
		info.IsUsingModifiedM3U8 = false;
		info.ExpectedAdPodLength = 2;
		info.NativeRecoveryAdPlaylistUrls.add(adSessionUrl);
		info.NativeRecoveryAdMediaKey = info.MediaKey;
		info.NativeRecoveryAdStartedAt = info.VisibleAdStartedAt;
		state.StreamInfosByUrl[adSessionUrl] = info;
		target.mockImplementation(
			async () => new Response(playlist(2000, "target-ad", true)),
		);
		for (let index = 0; index < 30; index++) {
			expect(await serve(false, adSessionUrl)).toContain("backup-");
		}
		expect(target).toHaveBeenCalledWith(enhancedUrl);
		expect(restored()).toBeUndefined();
		expect(info._PendingPostAdNativeMaster).toBeNull();
	});

	it.each([
		"unacknowledged",
		"wrong-acknowledgment",
		"failed",
		"superseded",
		"other-media",
		"old-cycle",
		"enhanced-decoder",
	])(
		"keeps the clean bridge while the codec handoff is %s",
		async (failure) => {
			const { info, state, target, checkRecovery, restored } = setup();
			if (failure === "unacknowledged") info._CodecHandoffAcknowledgedId = null;
			if (failure === "wrong-acknowledgment")
				info._CodecHandoffAcknowledgedId = "other";
			if (failure === "failed")
				info._CodecHandoffFailedId = info._CodecHandoffPendingId;
			if (failure === "superseded") state.ActiveCodecHandoffId = "other";
			if (failure === "other-media")
				state.ActiveCodecHandoffMediaKey = "live:otherchannel";
			if (failure === "old-cycle") {
				info._CodecHandoffPendingId = info._CodecHandoffPendingId.replace(
					":100000:",
					":99999:",
				);
				info._CodecHandoffAcknowledgedId = info._CodecHandoffPendingId;
				state.ActiveCodecHandoffId = info._CodecHandoffPendingId;
			}
			if (failure === "enhanced-decoder")
				info.EnhancedDecoderCodecFamily = "hevc";
			for (let index = 0; index < 30; index++)
				expect(await checkRecovery()).toBe("wait");
			expect(target).not.toHaveBeenCalled();
			expect(restored()).toBeUndefined();
			expect(info.IsHoldingBackupAfterAd).toBe(true);
		},
	);

	it.each([
		{ disabled: false, pod: "incomplete" },
		{ disabled: true, pod: "incomplete" },
		{ disabled: false, pod: "complete" },
		{ disabled: true, pod: "complete" },
		{ disabled: false, pod: "missing" },
		{ disabled: true, pod: "missing" },
	])(
		"restores verified native 1440p despite ad-marked fresh sessions (fallback disabled: $disabled, pod: $pod)",
		async ({ disabled, pod }) => {
			const { context, info, state, fetch, token, serve, restored } = setup();
			state.DisableAutoplayBackup = disabled;
			info.ExpectedAdPodLength =
				pod === "missing" ? 0 : pod === "complete" ? 2 : 7;
			for (let index = 0; index < 30 && !restored(); index++) {
				const output = await serve();
				expect(output).not.toContain("fresh-ad");
				expect(output).not.toContain("hevc-");
				if (!restored()) expect(output).toContain("backup-");
			}
			expect(restored()).toMatchObject({
				mediaKey: "live:testchannel",
				cycleStartedAt: 100000,
				requiresReload: true,
				refreshAccessToken: false,
			});
			expect(info._PendingPostAdNativeMaster).toMatchObject({
				master,
				masterUrl,
				playlistUrl: enhancedUrl,
			});
			expect(info.IsHoldingBackupAfterAd).toBe(false);
			expect(info.SustainedNativeResolution.Resolution).toBe("2560x1440");
			expect(
				fetch.mock.calls.filter(([url]) => url === enhancedUrl).length,
			).toBeGreaterThanOrEqual(4);
			expect(
				fetch.mock.calls.filter(([url]) => url === backupUrl).length,
			).toBeGreaterThan(8);
			expect(token).not.toHaveBeenCalled();
			context.fetch = fetch;
			context._hookWorkerFetch();
			const rebuiltMaster = await (
				await context.fetch(masterUrl.replaceAll("owned", "fresh"))
			).text();
			expect(rebuiltMaster).toContain(enhancedUrl);
			expect(rebuiltMaster).toContain(nativeUrl);
			expect(rebuiltMaster).not.toContain("token=fresh");
			expect(info.IsUsingModifiedM3U8).toBe(false);
			expect(info.EnhancedDecoderCodecFamily).not.toBe("hevc");
		},
	);

	it("preserves an explicit 1080p choice over the earlier sustained 1440p target", async () => {
		const { info, state, target, serve, restored } = setup();
		state.PreferredQualityGroup = "1080p60";
		for (let index = 0; index < 30 && !restored(); index++) await serve();
		expect(restored()).toMatchObject({
			requiresReload: true,
			refreshAccessToken: false,
		});
		expect(info._PendingPostAdNativeMaster.playlistUrl).toBe(nativeUrl);
		expect(target).toHaveBeenCalledWith(nativeUrl);
		expect(target).not.toHaveBeenCalledWith(enhancedUrl);
		expect(state.PreferredQualityGroup).toBe("1080p60");
	});

	it.each(
		[0, 2, 7].flatMap((podLength) =>
			["ad-marked", "frozen", "empty", "error"].map((failure) => ({
				podLength,
				failure,
			})),
		),
	)(
		"keeps refreshing the clean backup when the native target is $failure (pod length: $podLength)",
		async ({ podLength, failure }) => {
			const { info, target, token, serve, restored } = setup();
			info.ExpectedAdPodLength = podLength;
			let sequence = 1000;
			target.mockImplementation(
				async () =>
					new Response(
						failure === "empty"
							? "#EXTM3U"
							: playlist(
									failure === "frozen" ? 1000 : ++sequence,
									"unsafe-target",
									failure === "ad-marked",
								),
						{ status: failure === "error" ? 503 : 200 },
					),
			);
			let previousBackupSequence = 0;
			for (let index = 0; index < 80; index++) {
				const output = await serve();
				expect(output).toContain("backup-");
				expect(output).not.toContain("unsafe-target");
				const sequence = Number(output.match(/backup-(\d+)\.ts/)?.[1]);
				expect(sequence).toBeGreaterThan(previousBackupSequence);
				previousBackupSequence = sequence;
			}
			expect(target.mock.calls.length).toBeGreaterThan(20);
			expect(restored()).toBeUndefined();
			expect(info.IsHoldingBackupAfterAd).toBe(true);
			expect(info._PendingPostAdNativeMaster).toBeNull();
			expect(token).not.toHaveBeenCalled();
		},
	);

	it.each([0, 2, 7])(
		"rejects a frozen native request before probing the target (pod length: %s)",
		async (podLength) => {
			const { info, target, token, serve, restored } = setup();
			info.ExpectedAdPodLength = podLength;
			for (let index = 0; index < 80; index++) {
				expect(await serve(false, nativeUrl, 500)).toContain("backup-");
			}
			expect(restored()).toBeUndefined();
			expect(target).not.toHaveBeenCalled();
			expect(token).not.toHaveBeenCalled();
		},
	);

	it("replaces a stalled fresh-session probe without carrying its readiness into the owned session", async () => {
		const { info, target, token, serve, restored } = setup();
		Object.assign(info, {
			ExpectedAdPodLength: 2,
			NativeRecoveryProbeStreamUrl: probeUrl,
			NativeRecoveryProbeMediaKey: info.MediaKey,
			NativeRecoveryProbePlayerType: "site",
			NativeRecoveryProbeCycleStartedAt: info.VisibleAdStartedAt,
			NativeRecoveryProbeLastMediaSequence: 800,
			NativeRecoveryProbeLastAdvancedAt: 180000,
			LastNativeRecoveryReadyPlayerType: "site",
			NativeRecoveryCleanCount: 2,
		});
		for (let index = 0; index < 25 && target.mock.calls.length < 3; index++)
			await serve();
		expect(target).toHaveBeenCalledTimes(3);
		expect(restored()).toBeUndefined();
		await serve();
		expect(restored()).toMatchObject({
			requiresReload: true,
			refreshAccessToken: false,
		});
		expect(token).not.toHaveBeenCalled();
	});

	it("waits for the incomplete pod quiet period and restarts it on native ad markers", async () => {
		const { info, target, serve, restored } = setup();
		info.LastAdPodProgressAt = 199000;
		for (let index = 0; index < 35; index++) await serve();
		expect(target).not.toHaveBeenCalled();
		for (let index = 0; index < 20 && target.mock.calls.length < 3; index++)
			await serve();
		expect(target).toHaveBeenCalledTimes(3);
		expect(restored()).toBeUndefined();
		await serve(true);
		expect(info.NativeRecoveryCleanCount).toBe(0);
		for (let index = 0; index < 40; index++) await serve();
		expect(target).toHaveBeenCalledTimes(3);
		expect(restored()).toBeUndefined();
		for (let index = 0; index < 20 && !restored(); index++) await serve();
		expect(restored()).toMatchObject({
			requiresReload: true,
			refreshAccessToken: false,
		});
	});

	it("requires new advancing clean proof after an ad-marked target response", async () => {
		const { info, target, serve, restored } = setup();
		for (let index = 0; index < 25 && target.mock.calls.length < 3; index++)
			await serve();
		expect(info.NativeRecoveryCleanCount).toBe(2);
		target.mockImplementationOnce(
			async () => new Response(playlist(1004, "target-ad", true)),
		);
		await serve();
		expect(info.NativeRecoveryCleanCount).toBe(0);
		expect(restored()).toBeUndefined();
		let sequence = 1004;
		target.mockImplementation(
			async () => new Response(playlist(++sequence, "hevc")),
		);
		for (let index = 0; index < 2; index++) {
			await serve();
			expect(restored()).toBeUndefined();
		}
		await serve();
		expect(restored()).toMatchObject({
			requiresReload: true,
			refreshAccessToken: false,
		});
	});

	it("starts separate proof when the requested native quality changes", async () => {
		const { info, state, target, serve, restored } = setup();
		for (let index = 0; index < 25 && target.mock.calls.length < 3; index++)
			await serve();
		expect(info.NativeRecoveryCleanCount).toBe(2);
		state.PreferredQualityGroup = "1080p60";
		for (let index = 0; index < 3; index++) {
			await serve();
			expect(restored()).toBeUndefined();
		}
		await serve();
		expect(restored()).toMatchObject({
			requiresReload: true,
			refreshAccessToken: false,
		});
		expect(info._PendingPostAdNativeMaster.playlistUrl).toBe(nativeUrl);
	});

	it("does not use a different-token request on the same native path as clean proof", async () => {
		const { info, state, target, serve, restored } = setup();
		state.StreamInfosByUrl[probeUrl] = info;
		for (let index = 0; index < 30; index++) {
			expect(await serve(false, probeUrl)).toContain("backup-");
		}
		expect(target).not.toHaveBeenCalled();
		expect(restored()).toBeUndefined();
	});

	it("keeps the backup live while an owned native probe is in flight", async () => {
		const { target, serve, restored } = setup();
		for (let index = 0; index < 25 && target.mock.calls.length < 3; index++)
			await serve();
		let release: (response: Response) => void;
		let entered: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		target.mockImplementationOnce(
			() =>
				new Promise<Response>((resolve) => {
					release = resolve;
					entered();
				}),
		);
		const pending = serve();
		await started;
		const duringProbe = await serve();
		expect(duringProbe).toContain("backup-");
		expect(target).toHaveBeenCalledTimes(4);
		expect(restored()).toBeUndefined();
		release(new Response(playlist(1004, "hevc")));
		await pending;
		expect(restored()).toMatchObject({
			requiresReload: true,
			refreshAccessToken: false,
		});
	});

	it.each([
		"master",
		"quality",
		"loader",
		"cycle",
		"route",
		"generation",
		"replacement",
		"handoff",
		"acknowledgment",
		"decoder",
	])(
		"discards native readiness when %s ownership changes during a probe",
		async (change) => {
			const { info, state, target, serve, checkRecovery, restored } = setup();
			for (let index = 0; index < 25 && target.mock.calls.length < 3; index++)
				await serve();
			let release: (response: Response) => void;
			let entered: () => void;
			const started = new Promise<void>((resolve) => {
				entered = resolve;
			});
			target.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						release = resolve;
						entered();
					}),
			);
			const pending = (change === "decoder" ? checkRecovery() : serve()).catch(
				(error: Error) => error,
			);
			await started;
			if (change === "master")
				info.EncodingsM3U8 = master.replaceAll(
					"token=owned",
					"token=new-session",
				);
			if (change === "quality") state.PreferredQualityGroup = "1080p60";
			if (change === "loader") info.NativeRecoveryLoaderEpoch++;
			if (change === "cycle") info.VisibleAdStartedAt++;
			if (change === "route") state.PageMediaKey = "live:otherchannel";
			if (change === "generation") state.PagePlaybackContextGeneration = 1;
			if (change === "replacement")
				state.StreamInfos[info.MediaKey] = { ...info };
			if (change === "handoff") state.ActiveCodecHandoffId = "replacement";
			if (change === "acknowledgment") info._CodecHandoffAcknowledgedId = null;
			if (change === "decoder") info.EnhancedDecoderCodecFamily = "hevc";
			release(new Response(playlist(1004, "hevc")));
			const result = await pending;
			if (change === "decoder") expect(result).toBe("wait");
			expect(restored()).toBeUndefined();
			expect(info._PendingPostAdNativeMaster).toBeNull();
		},
	);
});

describe("bounded native session preservation", () => {
	it.each(["none", "stall", "ad"])(
		"validates responsive quality options within the deadline with a %s failure",
		async (failure) => {
			const stalled = failure === "stall";
			const rejected = failure !== "none";
			const { context, info, state, fetch, serve, restored } = setup();
			state.PreferredQualityGroup = "1080p60";
			for (let index = 0; index < 30 && !restored(); index++) await serve();
			const pending = info._PendingPostAdNativeMaster;
			const extras = [720, 480, 360, 160].map((height) => ({
				height,
				url: `https://edge.example/native-${height}.m3u8?token=owned`,
			}));
			pending.master = `#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080,CODECS="${avc}"\n${nativeUrl}`;
			for (const { height, url } of extras)
				pending.master += `\n#EXT-X-STREAM-INF:RESOLUTION=${Math.round((height * 16) / 9)}x${height},CODECS="${avc}"\n${url}`;
			const now = Date.now();
			vi.useFakeTimers();
			vi.setSystemTime(now);
			let active = 0;
			let peak = 0;
			let sequence = 2000;
			const checks = vi.fn((input: string) => {
				active++;
				peak = Math.max(peak, active);
				if (stalled && input === extras[0].url)
					return new Promise<Response>(() => {});
				return new Promise<Response>((resolve) =>
					setTimeout(() => {
						active--;
						resolve(
							new Response(
								playlist(
									++sequence,
									"quality",
									failure === "ad" &&
										input === extras[0].url &&
										checks.mock.calls.filter(([url]) => url === input)
											.length === 2,
								),
							),
						);
					}, 500),
				);
			});
			context.fetch = (input) =>
				extras.some(({ url }) => url === String(input))
					? checks(String(input))
					: fetch(input);
			context._hookWorkerFetch();
			const request = context.fetch(masterUrl.replaceAll("owned", "fresh"));
			await vi.advanceTimersByTimeAsync(2501);
			const rebuilt = await (await request).text();
			expect(rebuilt).toContain(nativeUrl);
			for (const { url } of extras.slice(rejected ? 1 : 0)) {
				expect(rebuilt).toContain(url);
				expect(
					checks.mock.calls.filter(([input]) => input === url),
				).toHaveLength(2);
			}
			if (rejected) expect(rebuilt).not.toContain(extras[0].url);
			expect(peak).toBeLessThanOrEqual(3);
			expect(pending.verifiedPlaylistUrls).toHaveLength(rejected ? 4 : 5);
		},
	);

	it("verifies the earlier native quality before slow low qualities can exhaust the master budget", async () => {
		const { context, info, state, fetch, target, serve, restored } = setup();
		state.PreferredQualityGroup = "1080p60";
		for (let index = 0; index < 30 && !restored(); index++) await serve();
		const pending = info._PendingPostAdNativeMaster;
		const lowUrl = "https://edge.example/360p.m3u8?token=owned";
		const lowerUrl = "https://edge.example/160p.m3u8?token=owned";
		pending.playlistUrl = lowUrl;
		pending.resolution = "640x360";
		pending.codec = avc;
		pending.master = `#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=284x160,CODECS="${avc}"\n${lowerUrl}\n#EXT-X-STREAM-INF:RESOLUTION=640x360,CODECS="${avc}"\n${lowUrl}\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080,CODECS="${avc}"\n${nativeUrl}`;
		const now = Date.now();
		vi.useFakeTimers();
		vi.setSystemTime(now);
		context.fetch = (input) =>
			String(input) === lowerUrl
				? new Promise<Response>(() => {})
				: fetch(input);
		target.mockClear();
		context._hookWorkerFetch();
		const request = context.fetch(masterUrl.replaceAll("owned", "fresh"));
		await vi.advanceTimersByTimeAsync(2501);
		const rebuilt = await (await request).text();
		expect(rebuilt).toContain(nativeUrl);
		expect(rebuilt).toContain(lowUrl);
		expect(rebuilt).not.toContain(lowerUrl);
		expect(target.mock.calls.filter(([url]) => url === nativeUrl)).toHaveLength(
			2,
		);
	});

	it("caps extra native-quality candidates and never offers unverified media groups", async () => {
		const { context, info, state, fetch, target, serve, restored } = setup();
		state.PreferredQualityGroup = "1080p60";
		for (let index = 0; index < 30 && !restored(); index++) await serve();
		const pending = info._PendingPostAdNativeMaster;
		pending.master = pending.master.replace(
			`VIDEO="chunked"`,
			`VIDEO="chunked",AUDIO="external"`,
		);
		pending.master +=
			'\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="external",URI="https://edge.example/unverified.m3u8"';
		const extra = Array.from(
			{ length: 20 },
			(_, index) => `https://edge.example/extra-${index}.m3u8?token=owned`,
		);
		for (const url of extra)
			pending.master += `\n#EXT-X-STREAM-INF:RESOLUTION=640x360,CODECS="mp4a.40.2,avc1.64002a"\n${url}`;
		const extraFetch = vi.fn(async () => new Response(playlist(3000, "extra")));
		context.fetch = (input) =>
			extra.includes(String(input)) ? extraFetch() : fetch(input);
		target.mockClear();
		context._hookWorkerFetch();
		const rebuilt = await (
			await context.fetch(masterUrl.replaceAll("owned", "fresh"))
		).text();
		expect(rebuilt).toContain(nativeUrl);
		expect(rebuilt).not.toContain(enhancedUrl);
		expect(rebuilt).not.toContain("unverified.m3u8");
		expect(target).not.toHaveBeenCalled();
		expect(extraFetch).toHaveBeenCalledTimes(22);
		expect(pending.verifiedPlaylistUrls).toHaveLength(12);
		expect(rebuilt).toContain(extra[10]);
		expect(rebuilt).not.toContain(extra[11]);
	});

	it("does not consume native-session proof when broadcast alignment rejects the returned window", async () => {
		const { context, info, state, fetch, serve, restored } = setup();
		state.PreferredQualityGroup = "1080p60";
		for (let index = 0; index < 30 && !restored(); index++) await serve();
		context.fetch = fetch;
		context._hookWorkerFetch();
		await context.fetch(masterUrl.replaceAll("owned", "fresh"));
		const pending = info._PendingPostAdNativeMaster;
		info._LivePlaylistTimeline = {
			identity: "backup",
			backup: true,
			minimumTime: 0,
			lastEndTime: Date.parse("2026-09-20T18:11:20Z"),
		};
		const text = playlist(2000, "old").replace(
			"#EXTINF:",
			"#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:10:00Z\n#EXTINF:",
		);
		await expect(
			context._processM3U8(nativeUrl, text, fetch),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(pending.consumed).not.toBe(true);
		expect(info._PendingPostAdNativeMaster).toBe(pending);
		const current = text.replace("18:10:00Z", "18:11:20Z");
		await context._processM3U8(nativeUrl, current, fetch);
		expect(pending.consumed).toBe(true);
	});

	it.each(["ad", "late ad", "empty", "gap", "http", "rewind", "error"])(
		"does not expose an additional native quality with %s evidence",
		async (failure) => {
			const { context, info, state, fetch, target, serve, restored } = setup();
			state.PreferredQualityGroup = "1080p60";
			for (let index = 0; index < 30 && !restored(); index++) await serve();
			let looks = 0;
			target.mockImplementation(async () => {
				looks++;
				if (failure === "error") throw new Error("offline");
				if (failure === "http") return new Response("offline", { status: 503 });
				if (failure === "empty")
					return new Response("#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:100");
				let text = playlist(
					failure === "rewind" ? 100 - looks : 100 + looks,
					"candidate",
					failure === "ad" || (failure === "late ad" && looks === 2),
				);
				if (failure === "gap")
					text = text.replaceAll("#EXTINF:", "#EXT-X-GAP\n#EXTINF:");
				return new Response(text);
			});
			context.fetch = fetch;
			context._hookWorkerFetch();
			const rebuilt = await (
				await context.fetch(masterUrl.replaceAll("owned", "fresh"))
			).text();
			expect(rebuilt).toContain(nativeUrl);
			expect(rebuilt).not.toContain(enhancedUrl);
			expect(info._PendingPostAdNativeMaster.verifiedPlaylistUrls).toEqual([
				nativeUrl,
			]);
		},
	);

	it.each(["navigation", "cycle", "loader", "replacement", "expiry", "abort"])(
		"rejects a native quality probe superseded by %s",
		async (change) => {
			const { context, info, state, fetch, target, serve, restored } = setup();
			state.PreferredQualityGroup = "1080p60";
			for (let index = 0; index < 30 && !restored(); index++) await serve();
			const pending = info._PendingPostAdNativeMaster;
			const controller = new AbortController();
			target.mockImplementationOnce(async () => {
				if (change === "navigation") state.PagePlaybackContextGeneration++;
				if (change === "cycle") state.CurrentAdMediaKey = info.MediaKey;
				if (change === "loader") info.NativeRecoveryLoaderEpoch++;
				if (change === "replacement")
					info._PendingPostAdNativeMaster = { ...pending, reloadAt: 9999 };
				if (change === "expiry") pending.expiresAt = Date.now();
				if (change === "abort") controller.abort();
				return new Response(playlist(2000, "candidate"));
			});
			context.fetch = fetch;
			context._hookWorkerFetch();
			await expect(
				context.fetch(masterUrl.replaceAll("owned", "fresh"), {
					signal: controller.signal,
				}),
			).rejects.toMatchObject({ name: "AbortError" });
			expect(pending.masterServedAt || 0).toBe(0);
			if (change === "replacement")
				expect(info._PendingPostAdNativeMaster.reloadAt).toBe(9999);
		},
	);

	it("bounds additional quality checks while retaining the already verified target", async () => {
		const { context, info, state, fetch, target, serve, restored } = setup();
		state.PreferredQualityGroup = "1080p60";
		for (let index = 0; index < 30 && !restored(); index++) await serve();
		const now = Date.now();
		vi.useFakeTimers();
		vi.setSystemTime(now);
		target.mockImplementation(() => new Promise<Response>(() => {}));
		context.fetch = fetch;
		context._hookWorkerFetch();
		const request = context.fetch(masterUrl.replaceAll("owned", "fresh"));
		await vi.advanceTimersByTimeAsync(2501);
		const rebuilt = await (await request).text();
		expect(rebuilt).toContain(nativeUrl);
		expect(rebuilt).not.toContain(enhancedUrl);
		expect(info._PendingPostAdNativeMaster.verifiedPlaylistUrls).toEqual([
			nativeUrl,
		]);
		vi.useRealTimers();
	});

	it("retains independently verified native qualities when rebuilding from a low rendition", async () => {
		const { context, info, state, fetch, target, serve, restored } = setup();
		const lowUrl = "https://edge.example/360p.m3u8?token=owned";
		const low = {
			Resolution: "640x360",
			FrameRate: "30",
			Name: "360p30",
			Codecs: avc,
			Url: lowUrl,
		};
		info.Urls[lowUrl] = low;
		info.ResolutionList.push(low);
		state.StreamInfosByUrl[lowUrl] = info;
		info.EncodingsM3U8 += `\n#EXT-X-STREAM-INF:RESOLUTION=640x360,VIDEO="360p30",CODECS="${avc}"\n${lowUrl}`;
		const originalFetch = fetch.getMockImplementation();
		fetch.mockImplementation(async (input) =>
			String(input) === lowUrl ? target(lowUrl) : originalFetch(input),
		);
		state.PreferredQualityGroup = "360p30";
		for (let index = 0; index < 30 && !restored(); index++) await serve();
		expect(info._PendingPostAdNativeMaster.playlistUrl).toBe(lowUrl);
		target.mockClear();
		context.fetch = fetch;
		context._hookWorkerFetch();
		const rebuilt = await (
			await context.fetch(masterUrl.replaceAll("owned", "fresh"))
		).text();
		expect(rebuilt).toContain(nativeUrl);
		expect(rebuilt).toContain(lowUrl);
		expect(state.PreferredQualityGroup).toBe("360p30");
		expect(rebuilt).toContain(enhancedUrl);
		expect(rebuilt).not.toContain("token=fresh");
		expect(
			target.mock.calls.filter(([url]) => url === enhancedUrl),
		).toHaveLength(2);
		await context.fetch(enhancedUrl);
		expect(info._PendingPostAdNativeMaster).toMatchObject({ consumed: true });
	});

	it("discards a consumed native session when a later live refresh becomes ad-marked", async () => {
		const { context, info, state, fetch, target, serve, restored } = setup();
		state.PreferredQualityGroup = "1080p60";
		for (let index = 0; index < 30 && !restored(); index++) await serve();
		context.fetch = fetch;
		context._hookWorkerFetch();
		await context.fetch(masterUrl.replaceAll("owned", "fresh"));
		await context.fetch(nativeUrl);
		expect(info._PendingPostAdNativeMaster).toMatchObject({ consumed: true });
		target.mockImplementationOnce(
			async () => new Response(playlist(2000, "advertisement", true)),
		);
		const output = await (await context.fetch(nativeUrl)).text();
		expect(info._PendingPostAdNativeMaster).toBeNull();
		expect(output).not.toContain("advertisement-");
		expect(output).not.toContain("twitch-stitched-ad");
	});

	it.each([
		[0, false],
		[10, false],
		[0, true],
	])(
		"does not let an earlier media request consume a rebuild master served %i ms later (retry: %s)",
		async (delay, retry) => {
			const { context, info, state, fetch, target, serve, restored } = setup();
			state.PreferredQualityGroup = "1080p60";
			for (let index = 0; index < 30 && !restored(); index++) await serve();
			context.fetch = fetch;
			context._hookWorkerFetch();
			if (retry) {
				await context.fetch(masterUrl.replaceAll("owned", "fresh"));
				await context.fetch(nativeUrl);
				expect(info._PendingPostAdNativeMaster).toMatchObject({
					consumed: true,
				});
				vi.spyOn(Date, "now").mockReturnValue(Date.now() + 11000);
			}
			let release!: (value: Response) => void;
			let entered!: () => void;
			const started = new Promise<void>((resolve) => {
				entered = resolve;
			});
			target.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						release = resolve;
						entered();
					}),
			);
			const oldRequest = context.fetch(nativeUrl);
			await started;
			vi.spyOn(Date, "now").mockReturnValue(Date.now() + delay);
			if (retry) {
				context._updatePostAdNativeMasterReload(
					info,
					{
						mediaKey: info.MediaKey,
						cycleStartedAt: 100000,
						reloadAt: Date.now(),
						reason: "ad-recovery",
						preserveNativeSession: true,
					},
					true,
				);
			}
			await context.fetch(masterUrl.replaceAll("owned", "fresh"));
			release(new Response(playlist(2000, "old-loader")));
			await oldRequest;
			expect(info._PendingPostAdNativeMaster).toMatchObject({
				consumed: false,
			});
			await context.fetch(nativeUrl);
			expect(info._PendingPostAdNativeMaster).toMatchObject({ consumed: true });
		},
	);

	it.each([
		"expired",
		"generation",
		"cycle",
		"route",
		"new ad",
		"manual",
		"fresh token",
		"third reload",
	])(
		"releases the verified session for an ineligible %s rebuild",
		async (condition) => {
			const { context, info, state, serve, restored } = setup();
			for (let index = 0; index < 30 && !restored(); index++) await serve();
			const session = info._PendingPostAdNativeMaster;
			if (condition === "expired")
				vi.spyOn(Date, "now").mockReturnValue(session.expiresAt);
			if (condition === "generation") state.PagePlaybackContextGeneration++;
			if (condition === "cycle") state.LastAdEndedCycleStartedAt++;
			if (condition === "route") state.PageMediaKey = "live:other";
			if (condition === "new ad") state.CurrentAdMediaKey = info.MediaKey;
			if (condition === "third reload") session.reloadCount = 2;
			context._updatePostAdNativeMasterReload(info, {
				mediaKey: info.MediaKey,
				cycleStartedAt: 100000,
				reloadAt: Date.now(),
				reason: condition === "manual" ? "manual" : "ad-recovery",
				preserveNativeSession: condition !== "fresh token",
			});
			expect(info._PendingPostAdNativeMaster).toBeNull();
		},
	);

	it("retains the verified session when the old loader polls before the rebuild master", async () => {
		const { context, info, state, fetch, serve, restored } = setup();
		state.PreferredQualityGroup = "1080p60";
		for (let index = 0; index < 30 && !restored(); index++) await serve();
		expect(restored()).toMatchObject({
			requiresReload: true,
			refreshAccessToken: false,
		});
		expect(info._PendingPostAdNativeMaster.playlistUrl).toBe(nativeUrl);
		context.fetch = fetch;
		context._hookWorkerFetch();
		await context.fetch(nativeUrl);
		expect(info._PendingPostAdNativeMaster).toMatchObject({
			consumed: false,
			masterServedAt: 0,
		});
		const rebuiltMaster = await (
			await context.fetch(masterUrl.replaceAll("owned", "fresh"))
		).text();
		expect(rebuiltMaster).toContain(nativeUrl);
		expect(rebuiltMaster).not.toContain("token=fresh");
	});

	it("retains the verified session for a second bounded rebuild after native media was fetched", async () => {
		const { context, info, state, fetch, serve, restored } = setup();
		for (let index = 0; index < 30 && !restored(); index++) await serve();
		expect(restored()).toMatchObject({
			requiresReload: true,
			refreshAccessToken: false,
		});
		const reloadAt = Date.now();
		const markReload = (at: number) => {
			context._invalidateNativeRecoveryAfterPlayerReload(info, true);
			context._updatePostAdNativeMasterReload(info, {
				mediaKey: info.MediaKey,
				cycleStartedAt: 100000,
				reloadAt: at,
				reason: "ad-recovery",
				preserveNativeSession: true,
			});
			Object.assign(state, {
				HasTriggeredPlayerReload: true,
				PendingTriggeredPlayerReloadMediaKey: info.MediaKey,
				PendingTriggeredPlayerReloadChannel: info.ChannelName,
				PendingTriggeredPlayerReloadCycleStartedAt: 100000,
				PendingTriggeredPlayerReloadAt: at,
			});
		};
		markReload(reloadAt);
		context.fetch = fetch;
		context._hookWorkerFetch();
		const firstMaster = await (
			await context.fetch(masterUrl.replaceAll("owned", "fresh"))
		).text();
		expect(firstMaster).toContain(enhancedUrl);
		await context.fetch(enhancedUrl);
		expect(info._PendingPostAdNativeMaster).toMatchObject({ consumed: true });
		context._updatePostAdNativeMasterReload(info, {
			mediaKey: info.MediaKey,
			cycleStartedAt: 100000,
			reloadAt,
			reason: "ad-recovery",
			preserveNativeSession: true,
		});
		expect(info._PendingPostAdNativeMaster).toMatchObject({
			consumed: true,
			reloadCount: 1,
		});
		vi.spyOn(Date, "now").mockReturnValue(reloadAt + 11000);
		markReload(reloadAt + 11000);
		const retryMaster = await (
			await context.fetch(masterUrl.replaceAll("owned", "fresh"))
		).text();
		expect(retryMaster).toContain(enhancedUrl);
		expect(retryMaster).not.toContain("token=fresh");
	});
});
