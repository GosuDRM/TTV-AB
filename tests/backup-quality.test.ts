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

afterEach(() => vi.restoreAllMocks());

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
