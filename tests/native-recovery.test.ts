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

afterEach(() => vi.restoreAllMocks());

describe("owned native recovery after a codec fallback", () => {
	it("retains owned recovery when no codec handoff was required", async () => {
		const { serve, restored, token } = setup(false);
		for (let index = 0; index < 30 && !restored(); index++) await serve();
		expect(restored()).toMatchObject({
			requiresReload: true,
			refreshAccessToken: false,
		});
		expect(token).not.toHaveBeenCalled();
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
			expect(rebuiltMaster).not.toContain(nativeUrl);
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
