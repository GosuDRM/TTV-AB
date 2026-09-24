import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

const source = ["constants", "state", "parser", "api", "processor", "hooks"]
	.map((name) =>
		readFileSync(resolve(__dirname, `../dist/src/modules/${name}.js`), "utf8"),
	)
	.join("\n");
const codecs = [
	["avc", "avc1.640033"],
	["hevc", "hev1.1.6.L153.B0"],
	["av1", "av01.0.13M.08"],
];
const resolution = (height: number) =>
	height === 1440 ? "2560x1440" : height === 1080 ? "1920x1080" : "640x360";
const nativeUrl = (height: number) =>
	`https://cdn.example/native/${height}.m3u8`;
const media = (type: string, height: number, sequence = 400, ad = false) =>
	[
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		`#EXT-X-MEDIA-SEQUENCE:${sequence}`,
		`#EXTINF:2.000,${ad ? "stitched-ad" : "live"}`,
		`https://cdn.example/${ad ? "stitched-ad" : type}/${height}/segment-${sequence}.ts`,
	].join("\n");
const master = (type: string, codec: string) =>
	[
		"#EXTM3U",
		...(type === "autoplay" ? [360] : [1440, 1080]).flatMap((height) => [
			`#EXT-X-STREAM-INF:BANDWIDTH=9000000,RESOLUTION=${resolution(height)},FRAME-RATE=60,CODECS="${codec}",VIDEO="${height}p60"`,
			`https://cdn.example/${type}/${height}.m3u8`,
		]),
	].join("\n");

function deferred() {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function setup(codec: string) {
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
		navigator: { languages: ["en-US"], language: "en-US" },
		postMessage: vi.fn(),
	});
	context.self = context;
	runInContext(source, context);
	runInContext(
		`
		_declareState(globalThis);
		_log = () => {};
		globalThis.state = __TTVAB_STATE__;
		globalThis.info = _createStreamInfo({ MediaType: "live", ChannelName: "testchannel" });
	`,
		context,
	);
	const { info, state } = context;
	Object.assign(state, {
		DisableAutoplayBackup: true,
		DisableAdSpoofing: true,
		BackupPlayerTypes: ["site"],
		PageMediaKey: info.MediaKey,
		PageChannel: "testchannel",
		PageMediaType: "live",
		PreferredQualityGroup: "1080p60",
	});
	info.ResolutionList = [1440, 1080].map((height) => ({
		Name: `${height}p60`,
		Resolution: resolution(height),
		FrameRate: 60,
		Codecs: codec,
	}));
	info.UsherBaseUrl =
		"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8";
	info.EncodingsM3U8 = master("native", codec);
	for (const entry of info.ResolutionList) {
		const url = nativeUrl(Number(entry.Resolution.split("x")[1]));
		info.Urls[url] = entry;
		state.StreamInfosByUrl[url] = info;
		if (context._isEnhancedCodecString(codec))
			info.EnhancedVariantUrls.add(url);
	}
	state.StreamInfos[info.MediaKey] = info;
	const tokens: string[] = [];
	const fetch = vi.fn(async (input: string, options?: RequestInit) => {
		const url = String(input);
		if (url.includes("gql.twitch.tv")) {
			const body = JSON.parse(String(options?.body));
			const type = body.variables.playerType;
			tokens.push(type);
			return Response.json({
				data: {
					streamPlaybackAccessToken: { signature: "test", value: type },
				},
			});
		}
		if (url.includes("usher.ttvnw.net")) {
			const type = new URL(url).searchParams.get("token") || "site";
			return new Response(master(type, codec));
		}
		const type = url.includes("/autoplay/") ? "autoplay" : "site";
		const height = url.includes("1440")
			? 1440
			: type === "autoplay"
				? 360
				: 1080;
		return new Response(media(type, height));
	});
	return { context, info, state, fetch, tokens };
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function setupProbation() {
	let now = 1_000_000;
	vi.spyOn(Date, "now").mockImplementation(() => now);
	const fixture = setup("avc1.640033");
	const { info, state } = fixture;
	Object.assign(state, {
		CurrentAdMediaKey: info.MediaKey,
		CurrentAdChannel: info.ChannelName,
		DisableAutoplayBackup: false,
		BackupPlayerTypes: ["site", "autoplay"],
	});
	Object.assign(info, {
		IsShowingAd: true,
		IsUsingBackupStream: true,
		VisibleAdStartedAt: 991_000,
		ActiveBackupPlayerType: "autoplay",
		ActiveBackupResolution: "640x360",
		LastCleanBackupPlayerType: "autoplay",
		LastCleanBackupResolution: "640x360",
		LastCleanBackupCodec: "avc1.640033",
		LastCleanBackupCodecFamily: "avc",
		LastCleanBackupM3U8: media("autoplay", 360),
		LastCleanBackupAt: 999_000,
		_LqHoldStartAt: 940_000,
	});
	info.BackupEncodingsM3U8Cache.autoplay = {
		m3u8: master("autoplay", "avc1.640033"),
		baseUrl: info.UsherBaseUrl,
	};
	const poll = (ad = true) =>
		fixture.context._processM3U8(
			nativeUrl(1080),
			media("native", 1080, 500, ad),
			fixture.fetch,
		);
	const siteRequests = () =>
		fixture.fetch.mock.calls.filter(([url]) => String(url).includes("/site/"));
	return {
		...fixture,
		poll,
		siteRequests,
		advance: (ms: number) => {
			now += ms;
		},
	};
}

describe("HD backup probation through playlist polling", () => {
	it.each([false, true])(
		"completes the second HD check after 1.5 seconds with fallback disabled=%s",
		async (disabled) => {
			const f = setupProbation();
			await f.poll();
			expect(f.info._BackupProbation).toMatchObject({
				type: "site",
				cleanChecks: 1,
			});
			expect(f.siteRequests()).toHaveLength(1);
			f.state.DisableAutoplayBackup = disabled;
			f.advance(1_499);
			await f.poll();
			expect(f.siteRequests()).toHaveLength(1);
			f.advance(1);
			expect(await f.poll()).toContain("/site/1080/");
			expect(f.siteRequests()).toHaveLength(2);
			expect(f.info.ActiveBackupPlayerType).toBe("site");
		},
	);

	it("continues probation while clean native polls still wait for ad-end proof", async () => {
		const f = setupProbation();
		await f.poll();
		f.advance(1_600);
		const held = await f.poll(false);
		expect(held).toContain("/autoplay/360/");
		await f.info._BackupSearchPromise;
		expect(f.siteRequests()).toHaveLength(2);
		expect(f.info.LastCleanBackupPlayerType).toBe("site");
	});

	it("requires a new first check when the selected HD variant changes", async () => {
		const f = setupProbation();
		await f.poll();
		f.advance(1_600);
		f.state.PreferredQualityGroup = "1440p60";
		const result = await f.context._findBackupStream(
			f.info,
			f.fetch,
			0,
			f.info.ResolutionList[0],
		);
		expect(result.type).toBe("autoplay");
		expect(f.info.LastCleanBackupPlayerType).toBe("autoplay");
		expect(f.info._BackupProbation.at).toBe(1_001_600);
	});

	it.each(["cycle", "epoch", "page generation", "page media", "cache"])(
		"discards the first check after a change of %s",
		async (change) => {
			const f = setupProbation();
			await f.poll();
			f.advance(1_600);
			if (change === "cycle") f.info.VisibleAdStartedAt++;
			if (change === "epoch") f.info.BackupSearchEpoch++;
			if (change === "page generation") f.state.PagePlaybackContextGeneration++;
			if (change === "page media") f.state.PageMediaKey = "live:other";
			if (change === "cache") {
				f.info.BackupEncodingsM3U8Cache.site = {
					...f.info.BackupEncodingsM3U8Cache.site,
				};
			}
			expect(f.context._isBackupProbationDue(f.info)).toBe(false);
			const result = await f.context._findBackupStream(f.info, f.fetch);
			expect(result.type).toBe("autoplay");
			expect(f.info._BackupProbation).toMatchObject({
				at: 1_001_600,
				cleanChecks: 1,
			});
		},
	);

	it.each(["ad", "gap", "HTTP error", "network error"])(
		"rejects a %s on the second check and retains the search cooldown",
		async (failure) => {
			const f = setupProbation();
			await f.poll();
			f.advance(1_600);
			const originalFetch = f.fetch.getMockImplementation();
			if (!originalFetch) throw new Error("Missing network fixture");
			f.fetch.mockImplementation(async (url, options) => {
				if (!String(url).includes("/site/")) return originalFetch(url, options);
				if (failure === "network error") throw new Error("offline");
				if (failure === "HTTP error")
					return new Response("unavailable", { status: 503 });
				return new Response(
					failure === "ad"
						? media("site", 1080, 401, true)
						: media("site", 1080, 401).replace(
								"#EXTINF",
								"#EXT-X-GAP\n#EXTINF",
							),
				);
			});
			expect(await f.poll()).toContain("/autoplay/360/");
			expect(f.info._BackupProbation).toBeNull();
			const requests = f.siteRequests().length;
			f.advance(2_100);
			await f.poll();
			expect(f.siteRequests()).toHaveLength(requests);
			expect(f.info.ActiveBackupPlayerType).toBe("autoplay");
		},
	);

	it("coalesces overlapping second checks while refreshing the bridge", async () => {
		const f = setupProbation();
		await f.poll();
		f.advance(1_600);
		const entered = deferred();
		const release = deferred();
		const originalFetch = f.fetch.getMockImplementation();
		if (!originalFetch) throw new Error("Missing network fixture");
		f.fetch.mockImplementation(async (url, options) => {
			if (String(url).includes("/site/")) {
				entered.resolve();
				await release.promise;
			}
			return originalFetch(url, options);
		});
		const pending = f.poll();
		await entered.promise;
		expect(await f.poll()).toContain("/autoplay/360/");
		expect(f.siteRequests()).toHaveLength(2);
		release.resolve();
		expect(await pending).toContain("/site/1080/");
		expect(f.info._BackupSearchPromises.size).toBe(0);
	});

	it("does not count rapid repeat checks toward the extra probation after a flip", async () => {
		const f = setupProbation();
		f.info._BackupPinFlipCount = 1;
		await f.poll();
		for (let i = 0; i < 3; i++) {
			f.advance(100);
			await f.context._findBackupStream(f.info, f.fetch);
		}
		expect(f.info._BackupProbation.cleanChecks).toBe(1);
		f.advance(1_200);
		await f.poll();
		expect(f.info._BackupProbation).toMatchObject({
			at: 1_001_500,
			cleanChecks: 2,
		});
		await f.context._findBackupStream(f.info, f.fetch);
		expect(f.info.LastCleanBackupPlayerType).toBe("autoplay");
		f.advance(1_500);
		expect(await f.poll()).toContain("/site/1080/");
	});

	it.each(["cycle", "epoch", "page generation", "abort"])(
		"rejects a delayed second check after %s changes",
		async (change) => {
			const f = setupProbation();
			await f.poll();
			f.advance(1_600);
			const entered = deferred();
			const release = deferred();
			const originalFetch = f.fetch.getMockImplementation();
			if (!originalFetch) throw new Error("Missing network fixture");
			f.info._AdCycleRequestController = new AbortController();
			f.fetch.mockImplementation(async (url, options) => {
				if (String(url).includes("/site/")) {
					entered.resolve();
					await release.promise;
				}
				return originalFetch(url, options);
			});
			const pending = f.context._findBackupStream(f.info, f.fetch);
			await entered.promise;
			if (change === "cycle") f.info.VisibleAdStartedAt++;
			if (change === "epoch") f.info.BackupSearchEpoch++;
			if (change === "page generation") f.state.PagePlaybackContextGeneration++;
			if (change === "abort") f.info._AdCycleRequestController.abort();
			release.resolve();
			const result = await pending;
			expect(result.type).not.toBe("site");
			expect(f.info.LastCleanBackupPlayerType).toBe("autoplay");
		},
	);

	it("continues probation after a slow first search returns its bridge in the background", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000);
		const timerNow = Date.now;
		const f = setupProbation();
		vi.mocked(Date.now).mockImplementation(timerNow);
		const originalFetch = f.fetch.getMockImplementation();
		if (!originalFetch) throw new Error("Missing network fixture");
		const siteRequestTimes: number[] = [];
		f.fetch.mockImplementation(async (url, options) => {
			if (String(url).includes("/site/")) siteRequestTimes.push(Date.now());
			await new Promise((resolve) => setTimeout(resolve, 500));
			return originalFetch(url, options);
		});
		const first = f.poll();
		await vi.advanceTimersByTimeAsync(1_600);
		expect(await first).toContain("/autoplay/360/");
		expect(f.info._BackupSearchPromise).not.toBeNull();
		await vi.advanceTimersByTimeAsync(2_000);
		const probationAt = f.info._BackupProbation.at;
		const second = f.poll();
		await vi.advanceTimersByTimeAsync(2_000);
		expect(await second).toContain("/site/1080/");
		expect(siteRequestTimes).toHaveLength(2);
		expect(siteRequestTimes[1] - probationAt).toBeGreaterThanOrEqual(1_500);
		expect(siteRequestTimes[1] - probationAt).toBeLessThan(4_000);
		expect(f.tokens).toEqual(["site"]);
	});
});

describe("codec ordering and backup quality ownership", () => {
	it("logs committed quality changes during backup refresh without logging unchanged polls", async () => {
		let now = 1_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const { context, info, state, fetch } = setup("avc1.640033");
		const log = vi.fn();
		context._log = log;
		await context._processM3U8(
			nativeUrl(1080),
			media("native", 1080, 400, true),
			fetch,
		);
		log.mockClear();
		state.PreferredQualityGroup = "1440p60";
		now += 2000;
		expect(
			await context._refreshActiveBackupMediaPlaylist(info, fetch),
		).toContain("/site/1440/");
		const changes = () =>
			log.mock.calls.filter(([message]) =>
				String(message).startsWith("[Recovery] Backup selection committed:"),
			);
		expect(changes()).toHaveLength(1);
		expect(changes()[0]?.[0]).toContain("site@1920x1080 -> site@2560x1440");
		expect(changes()[0]?.[0]).toContain("live:testchannel; cycle 1000000");
		for (let poll = 0; poll < 5; poll++) {
			now += 2000;
			await context._refreshActiveBackupMediaPlaylist(info, fetch);
		}
		expect(changes()).toHaveLength(1);
	});

	it("logs accepted session changes without signed URLs or rejected stale selections", () => {
		const { context, info } = setup("avc1.640033");
		const log = vi.fn();
		context._log = log;
		info.VisibleAdStartedAt = 1000;
		const metadata = {
			playerType: "site",
			playlistUrl: "https://cdn.example/1080.m3u8?token=private-media",
			sessionUrl: "https://usher.ttvnw.net/test.m3u8?sig=private-session",
			resolution: "1920x1080",
			codecFamily: "avc",
			codec: "avc1.640033",
		};
		const playlist = media("site", 1080);
		context._commitBackupPlaylist(info, playlist, 1, metadata);
		log.mockClear();
		const next = { ...metadata, sessionUrl: `${metadata.sessionUrl}-new` };
		expect(context._commitBackupPlaylist(info, playlist, 3, next)).toBe(
			playlist,
		);
		expect(log).toHaveBeenCalledOnce();
		expect(
			context._commitBackupPlaylist(info, playlist, 2, metadata),
		).toBeNull();
		context._commitBackupPlaylist(info, playlist, 4, next);
		expect(log).toHaveBeenCalledOnce();
		expect(log.mock.calls[0]?.[0]).toContain("request 3");
		expect(JSON.stringify(log.mock.calls)).not.toMatch(
			/https:|private-media|private-session/,
		);
	});

	it("bounds autoplay dwell after a clean native poll replaces an ad-marked backup", async () => {
		let now = 1_000_000;
		vi.spyOn(Date, "now").mockImplementation(() => now);
		const { context, info, state, fetch } = setup("avc1.640033,mp4a.40.2");
		const first = await context._processM3U8(
			nativeUrl(1080),
			media("native", 1080, 400, true),
			fetch,
		);
		expect(first).toContain("/site/1080/");
		now += 2000;
		await context._refreshActiveBackupMediaPlaylist(info, fetch);
		state.DisableAutoplayBackup = false;
		state.BackupPlayerTypes = ["site", "embed", "autoplay"];
		let siteHasAds = true;
		const recoveringFetch = vi.fn(
			async (url: string, options?: RequestInit) => {
				if (url.includes("cdn.example/embed/")) {
					return siteHasAds
						? new Response(null, { status: 503 })
						: new Response(media("embed", 1080, now / 2000));
				}
				if (url.includes("cdn.example/site/")) {
					return new Response(media("site", 1080, now / 2000, siteHasAds));
				}
				if (url.includes("cdn.example/autoplay/")) {
					return new Response(media("autoplay", 360, now / 2000));
				}
				return fetch(url, options);
			},
		);
		now += 2000;
		const replacement = await context._processM3U8(
			nativeUrl(1080),
			media("native", 1080, 401),
			recoveringFetch,
		);
		expect(replacement).toContain("/autoplay/360/");
		expect(context._hasPlaylistAdMarkers(replacement)).toBe(false);
		expect(info.ActiveBackupPlayerType).toBe("autoplay");
		const dwellStartedAt = now;
		for (let index = 0; index < 10; index++) {
			now += 2000;
			const output = await context._processM3U8(
				nativeUrl(1080),
				media("native", 1080, 402 + index, true),
				recoveringFetch,
			);
			expect(output).toContain("/autoplay/360/");
			expect(context._hasPlaylistAdMarkers(output)).toBe(false);
			if (index === 2) {
				expect(context._shouldHoldAutoplayBackupDuringAd(info)).toBe(true);
			}
		}
		expect(info.LastCleanBackupAt).toBe(now);
		expect(context._shouldHoldAutoplayBackupDuringAd(info)).toBe(false);
		expect(info._LqHoldStartAt).toBe(dwellStartedAt);
		siteHasAds = false;
		for (
			let index = 0;
			index < 3 && info.ActiveBackupPlayerType !== "embed";
			index++
		) {
			now += 16000;
			await context._processM3U8(
				nativeUrl(1080),
				media("native", 1080, 420 + index, true),
				recoveringFetch,
			);
		}
		expect(info.ActiveBackupPlayerType).toBe("embed");
		expect(info.LastCleanBackupResolution).toBe("1920x1080");
		expect(info._LqHoldStartAt).toBe(0);
	});

	it.each(
		codecs.flatMap(([family, codec]) =>
			[1080, 1440].flatMap((height) =>
				[`${codec},mp4a.40.2`, `mp4a.40.2, ${codec}`].map((list) => [
					family,
					height,
					list,
				]),
			),
		),
	)("blocks %s %sp ad media with CODECS=%s", async (family, height, list) => {
		const { context, info, state, fetch, tokens } = setup(String(list));
		state.PreferredQualityGroup = `${height}p60`;
		const output = await context._processM3U8(
			nativeUrl(Number(height)),
			media("native", Number(height), 400, true),
			fetch,
		);
		expect(output).toContain(`/site/${height}/`);
		expect(context._hasPlaylistAdMarkers(output)).toBe(false);
		expect(info.VisibleAdStartedAt).toBeGreaterThan(0);
		expect(info.LastCleanBackupCodecFamily).toBe(family);
		expect(info.LastCleanBackupResolution).toBe(resolution(Number(height)));
		expect(tokens).toEqual(["site"]);
	});

	it.each(["mp4a.40.2", "mp4a.40.2,unknown.1"])(
		"keeps an unresolved video codec fail-closed (%s)",
		async (codec) => {
			const { context, fetch, tokens } = setup(codec);
			await expect(
				context._processM3U8(
					nativeUrl(1440),
					media("native", 1440, 400, true),
					fetch,
				),
			).rejects.toMatchObject({ name: "AbortError" });
			expect(tokens).toEqual([]);
		},
	);

	it.each(
		codecs.flatMap(([family, codec]) => [
			{ family, codec, delay: 0, refresh: "clean" },
			{ family, codec, delay: 900, refresh: "clean" },
			{ family, codec, delay: 900, refresh: "ad-marked" },
			{ family, codec, delay: 900, refresh: "http-error" },
		]),
	)(
		"keeps the newer 1440p $family selection after a late 1080p result ($delay ms, $refresh refresh)",
		async ({ codec, delay, refresh }) => {
			let now = 1000000;
			vi.spyOn(Date, "now").mockImplementation(() => now);
			const { context, info, state, fetch, tokens } = setup(codec);
			const started = deferred();
			const gate = deferred();
			const delayedFetch = async (url: string, options?: RequestInit) => {
				if (url.includes("/site/1080.m3u8")) {
					started.resolve();
					await gate.promise;
				}
				if (url.includes("/site/1440.m3u8") && now > 1000000) {
					return refresh === "http-error"
						? new Response(null, { status: 403 })
						: new Response(media("site", 1440, 401, refresh === "ad-marked"));
				}
				return fetch(url, options);
			};
			const old = context._processM3U8(
				nativeUrl(1080),
				media("native", 1080, 400, true),
				delayedFetch,
			);
			await started.promise;
			state.PreferredQualityGroup = "1440p60";
			try {
				const high = await context._processM3U8(
					nativeUrl(1440),
					media("native", 1440, 400, true),
					delayedFetch,
				);
				expect(high).toContain("/site/1440/");
				now += delay;
			} finally {
				gate.resolve();
			}
			if (refresh === "clean") {
				expect(await old).toContain(
					`/site/1440/segment-${delay ? 401 : 400}.ts`,
				);
			} else {
				await expect(old).rejects.toMatchObject({ name: "AbortError" });
			}
			expect(info.ActiveBackupResolution).toBe("2560x1440");
			expect(info.IsUsingFallbackStream).toBe(false);
			const next = await context._processM3U8(
				nativeUrl(1440),
				media("native", 1440, 401, true),
				fetch,
			);
			expect(next).toContain("/site/1440/");
			expect(context._hasPlaylistAdMarkers(next)).toBe(false);
			expect(info.ActiveBackupResolution).toBe("2560x1440");
			expect(info.LastCleanBackupResolution).toBe("2560x1440");
			expect(tokens).toEqual(["site"]);
		},
	);

	it.each([1080, 1440])(
		"keeps an explicit %sp choice when the earlier refresh finishes last",
		async (height) => {
			const { context, info, state, fetch } = setup("avc1.640033");
			state.PreferredQualityGroup = height === 1440 ? "1080p60" : "1440p60";
			const initialHeight = height === 1440 ? 1080 : 1440;
			await context._processM3U8(
				nativeUrl(initialHeight),
				media("native", initialHeight, 400, true),
				fetch,
			);
			const started = deferred();
			const gate = deferred();
			const old = context._refreshActiveBackupMediaPlaylist(
				info,
				async (url: string) => {
					started.resolve();
					await gate.promise;
					return fetch(url);
				},
			);
			await started.promise;
			state.PreferredQualityGroup = `${height}p60`;
			try {
				const selected = await context._refreshActiveBackupMediaPlaylist(
					info,
					fetch,
				);
				expect(selected).toContain(`/site/${height}/`);
			} finally {
				gate.resolve();
			}
			expect(await old).toBeNull();
			expect(info.LastCleanBackupResolution).toBe(resolution(height));
			expect(info.ActiveBackupResolution).toBe(resolution(height));
		},
	);

	it("keeps the earlier clean backup usable when the newer quality search fails", async () => {
		const { context, info, state, fetch } = setup("avc1.640033");
		info.IsShowingAd = true;
		info.VisibleAdStartedAt = Date.now();
		state.CurrentAdMediaKey = info.MediaKey;
		const started = deferred();
		const gate = deferred();
		const delayedFetch = async (url: string, options?: RequestInit) => {
			if (url.includes("/site/1080.m3u8")) {
				started.resolve();
				await gate.promise;
			}
			if (url.includes("/site/1440.m3u8"))
				return new Response(null, { status: 403 });
			return fetch(url, options);
		};
		const old = context._findBackupStream(
			info,
			delayedFetch,
			0,
			info.ResolutionList[1],
		);
		await started.promise;
		state.PreferredQualityGroup = "1440p60";
		try {
			const failed = await context._findBackupStream(
				info,
				delayedFetch,
				0,
				info.ResolutionList[0],
			);
			expect(failed.m3u8).toBeNull();
		} finally {
			gate.resolve();
		}
		expect((await old).m3u8).toContain("/site/1080/");
		expect(info.LastCleanBackupResolution).toBe("1920x1080");
	});

	it.each([false, true])(
		"keeps autoplay refreshing through HQ search without letting a late bridge undo promotion (disabled after serving: %s)",
		async (disableAfterServing) => {
			let now = 1000000;
			vi.spyOn(Date, "now").mockImplementation(() => now);
			const { context, info, state, fetch } = setup("avc1.640033");
			state.DisableAutoplayBackup = false;
			state.BackupPlayerTypes = ["site", "autoplay"];
			const initial = await context._processM3U8(
				nativeUrl(1080),
				media("native", 1080, 400, true),
				fetch,
			);
			expect(initial).toContain("/autoplay/360/");
			state.DisableAutoplayBackup = disableAfterServing;
			now += 9000;
			const started = deferred();
			const gate = deferred();
			const high = context._findBackupStream(
				info,
				async (url: string, options?: RequestInit) => {
					if (url.includes("/site/1080.m3u8")) {
						started.resolve();
						await gate.promise;
					}
					return fetch(url, options);
				},
				0,
				info.ResolutionList[1],
			);
			await started.promise;
			expect(
				await context._refreshHeldAutoplayBackupPlaylist(info, fetch),
			).toContain("/autoplay/360/");
			const lateStarted = deferred();
			const lateGate = deferred();
			const lateBridge = context._refreshHeldAutoplayBackupPlaylist(
				info,
				async (url: string) => {
					lateStarted.resolve();
					await lateGate.promise;
					return fetch(url);
				},
			);
			await lateStarted.promise;
			gate.resolve();
			await high;
			now += 2000;
			await context._findBackupStream(info, fetch, 0, info.ResolutionList[1]);
			expect(info.LastCleanBackupPlayerType).toBe("site");
			lateGate.resolve();
			expect(await lateBridge).toBeNull();
			expect(info.LastCleanBackupPlayerType).toBe("site");
			expect(info.LastCleanBackupResolution).toBe("1920x1080");
			expect(info.HevcReloadPendingAfterHold).toBe(true);
		},
	);

	it("does not rewind the live window when an earlier same-quality refresh finishes last", async () => {
		const { context, info, fetch } = setup("avc1.640033");
		await context._processM3U8(
			nativeUrl(1080),
			media("native", 1080, 400, true),
			fetch,
		);
		const started = deferred();
		const gate = deferred();
		const old = context._refreshActiveBackupMediaPlaylist(info, async () => {
			started.resolve();
			await gate.promise;
			return new Response(media("site", 1080, 401));
		});
		await started.promise;
		try {
			const current = await context._refreshActiveBackupMediaPlaylist(
				info,
				async () => new Response(media("site", 1080, 402)),
			);
			expect(current).toContain("segment-402.ts");
		} finally {
			gate.resolve();
		}
		expect(await old).toBeNull();
		const next = await context._processM3U8(
			nativeUrl(1080),
			media("native", 1080, 402, true),
			fetch,
		);
		expect(next).toContain("segment-402.ts");
		expect(next).not.toContain("segment-401.ts");
	});
});
