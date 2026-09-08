import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = ["constants", "state", "parser", "api", "processor", "hooks"]
	.map((name) =>
		readFileSync(resolve(__dirname, `../dist/src/modules/${name}.js`), "utf8"),
	)
	.join("\n");
const nativeUrl = "https://cdn.example/native/index.m3u8";
const master = (type: string, session: string) =>
	[
		"#EXTM3U",
		`#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=${type === "autoplay" ? "640x360" : "1280x720"},FRAME-RATE=60,CODECS="avc1.4D401F,mp4a.40.2",VIDEO="${type === "autoplay" ? "360p" : "720p"}"`,
		`https://cdn.example/${type}/${session}/index.m3u8`,
	].join("\n");
const media = (
	type: string,
	session: string,
	sequence: number,
	discontinuity = 0,
) =>
	[
		"#EXTM3U",
		"#EXT-X-TARGETDURATION:2",
		`#EXT-X-MEDIA-SEQUENCE:${sequence}`,
		`#EXT-X-DISCONTINUITY-SEQUENCE:${discontinuity}`,
		"#EXTINF:2.000,live",
		`https://cdn.example/${type}/${session}/segment-${sequence}.ts`,
	].join("\n");
const adMedia = [
	"#EXTM3U",
	"#EXT-X-TARGETDURATION:2",
	"#EXT-X-MEDIA-SEQUENCE:400",
	"#EXTINF:2.000,stitched-ad",
	"https://cdn.example/stitched-ad.ts",
].join("\n");

function setup() {
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
	});
	runInContext(source, context);
	runInContext(
		`
		_log = () => {};
		_declareState(globalThis);
		globalThis.state = __TTVAB_STATE__;
		state.DisableAutoplayBackup = true;
		state.DisableAdSpoofing = true;
		state.BackupPlayerTypes = ["site", "autoplay"];
		state.PageMediaKey = "live:testchannel";
		state.PageChannel = "testchannel";
		state.PageMediaType = "live";
		globalThis.info = _createStreamInfo({ MediaType: "live", ChannelName: "testchannel" });
		info.ResolutionList = [{ Name: "720p", Resolution: "1280x720", FrameRate: 60, Codecs: "avc1.4D401F,mp4a.40.2" }];
		info.UsherBaseUrl = "https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8";
		state.StreamInfos[info.MediaKey] = info;
	`,
		context,
	);
	context.info.EncodingsM3U8 = master("native", "old");
	context.info.Urls[nativeUrl] = context.info.ResolutionList[0];
	context.state.StreamInfosByUrl[nativeUrl] = context.info;
	const tokens: string[] = [];
	context._getToken = async (_info: unknown, type: string) => {
		tokens.push(type);
		return new Response(
			JSON.stringify({
				data: { streamPlaybackAccessToken: { signature: "sig", value: type } },
			}),
		);
	};
	return { context, info: context.info, state: context.state, tokens };
}

describe("backup session and fallback ownership through the processor", () => {
	it("carries the empty hold's discontinuity ownership into a clean backup and its live refresh", async () => {
		const { context, info } = setup();
		const held = context._createEmptyAdHoldPlaylist(
			adMedia.replace("#EXTM3U", "#EXTM3U\n#EXT-X-DISCONTINUITY-SEQUENCE:8"),
			info,
		);
		context._applyBackupSpliceBridge(info, held);
		expect(info._SpliceLastDiscontinuitySequence).toBe(9);
		info.IsUsingBackupStream = true;
		info.ActiveBackupPlayerType = "site";
		info.LastCleanBackupCodec = "avc1.4d401f";
		const first = context._applyBackupSpliceBridge(
			info,
			media("site", "new", 500),
		);
		expect(first).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:9");
		expect(info._SpliceLastDiscontinuitySequence).toBe(10);
		const refreshed = context._applyBackupSpliceBridge(
			info,
			media("site", "new", 501),
		);
		expect(refreshed).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:10");
		expect(info._SpliceLastDiscontinuitySequence).toBe(10);
	});

	it("does not reacquire a cached prior-cycle autoplay bridge while fallback is disabled", async () => {
		const { context, info, tokens } = setup();
		info.BackupEncodingsM3U8Cache.autoplay = {
			m3u8: master("autoplay", "previous-cycle"),
			baseUrl: info.UsherBaseUrl,
		};
		context._resetStreamAdState(info);
		const fetch = vi.fn(async (url: string) => {
			if (url.includes("usher.ttvnw.net"))
				return new Response(master("site", "new"));
			if (url.includes("/site/"))
				return new Response(media("site", "new", 200));
			if (url.includes("/autoplay/"))
				return new Response(media("autoplay", "previous-cycle", 100));
			return new Response(null, { status: 404 });
		});
		const output = await context._processM3U8(nativeUrl, adMedia, fetch);
		expect(tokens).toEqual(["site"]);
		expect(fetch.mock.calls.some(([url]) => url.includes("/autoplay/"))).toBe(
			false,
		);
		expect(output).toContain("/site/new/");
		expect(info.ActiveBackupPlayerType).toBe("site");
		expect(info.ActiveBackupResolution).toBe("1280x720");
		expect(info.HevcReloadPendingAfterHold).toBe(false);
	});

	it("advances the timeline when an expired backup is replaced by the same type, resolution and codec", async () => {
		const { context, info, state, tokens } = setup();
		info.IsShowingAd = true;
		info.VisibleAdStartedAt = Date.now() - 40000;
		info.IsUsingBackupStream = true;
		info.ActiveBackupPlayerType = "site";
		info.ActiveBackupResolution = "1280x720";
		info.BackupEncodingsM3U8Cache.site = {
			m3u8: master("site", "old"),
			baseUrl: info.UsherBaseUrl,
		};
		state.CurrentAdMediaKey = info.MediaKey;
		state.CurrentAdChannel = info.ChannelName;
		const oldPlaylist = await context._refreshActiveBackupMediaPlaylist(
			info,
			async () => new Response(media("site", "old", 500, 5)),
		);
		context._applyBackupSpliceBridge(info, oldPlaylist);
		expect(info._SpliceLastDiscontinuitySequence).toBe(6);
		const output = await context._processM3U8(
			nativeUrl,
			adMedia,
			async (url: string) => {
				if (url.includes("/site/old/"))
					return new Response(null, { status: 403 });
				if (url.includes("usher.ttvnw.net"))
					return new Response(master("site", "new"));
				if (url.includes("/site/new/"))
					return new Response(media("site", "new", 100));
				return new Response(null, { status: 404 });
			},
		);
		expect(tokens).toEqual(["site"]);
		expect(output).toContain("/site/new/");
		expect(output).toContain("\n#EXT-X-DISCONTINUITY\n");
		expect(info._SpliceLastDiscontinuitySequence).toBe(7);
		expect(info.HevcReloadPendingAfterHold).toBe(false);
		const refreshed = await context._refreshActiveBackupMediaPlaylist(
			info,
			async () =>
				new Response(media("site", "new", 101).replace(/\n/g, "\r\n")),
		);
		const nextOutput = context._applyBackupSpliceBridge(info, refreshed);
		expect(nextOutput).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:7");
		expect(info._SpliceLastDiscontinuitySequence).toBe(7);
		expect(nextOutput).not.toContain("\n#EXT-X-DISCONTINUITY\n");
	});

	it("separates new token sessions even when they select the same media playlist URL", async () => {
		const { context, info, state } = setup();
		info.IsShowingAd = true;
		info.IsUsingBackupStream = true;
		info.VisibleAdStartedAt = Date.now() - 1000;
		info.ActiveBackupPlayerType = "site";
		state.CurrentAdMediaKey = info.MediaKey;
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(new Response(media("site", "shared", 500, 5)))
			.mockResolvedValueOnce(new Response(media("site", "shared", 100)));
		for (const token of ["old", "new"]) {
			info.BackupEncodingsM3U8Cache.site = {
				m3u8: master("site", "shared"),
				baseUrl: `${info.UsherBaseUrl}?token=${token}`,
			};
			const playlist = await context._refreshActiveBackupMediaPlaylist(
				info,
				fetch,
			);
			context._applyBackupSpliceBridge(info, playlist);
			expect(info._SpliceLastDiscontinuitySequence).toBe(
				token === "old" ? 6 : 7,
			);
		}
		expect(fetch.mock.calls[0][0]).toBe(fetch.mock.calls[1][0]);
		expect(info.HevcReloadPendingAfterHold).toBe(false);
	});

	it("rejects a cached autoplay acquisition that finishes after fallback is disabled", async () => {
		const { context, info, state } = setup();
		state.DisableAutoplayBackup = false;
		info.VisibleAdStartedAt = Date.now() - 1000;
		info.IsShowingAd = true;
		state.CurrentAdMediaKey = info.MediaKey;
		info.BackupEncodingsM3U8Cache.autoplay = {
			m3u8: master("autoplay", "previous-cycle"),
			baseUrl: info.UsherBaseUrl,
		};
		const result = await context._refreshHeldAutoplayBackupPlaylist(
			info,
			async () => {
				state.DisableAutoplayBackup = true;
				return new Response(media("autoplay", "previous-cycle", 100));
			},
		);
		expect(result).toBeNull();
		expect(info.LastCleanBackupPlayerType).toBeNull();
	});

	it.each([false, true])(
		"refreshes only an already-served current-cycle autoplay bridge and rejects ad-marked media (%s)",
		async (hasAds) => {
			const { context, info, state } = setup();
			info.VisibleAdStartedAt = Date.now() - 1000;
			info.IsShowingAd = true;
			state.CurrentAdMediaKey = info.MediaKey;
			info.IsUsingBackupStream = true;
			info.ActiveBackupPlayerType = "autoplay";
			info.LastCleanBackupPlayerType = "autoplay";
			info.LastCleanBackupAt = Date.now();
			info.LastCleanBackupM3U8 = media("autoplay", "current", 99);
			info.BackupEncodingsM3U8Cache.autoplay = {
				m3u8: master("autoplay", "current"),
				baseUrl: info.UsherBaseUrl,
			};
			const result = await context._refreshActiveBackupMediaPlaylist(
				info,
				async () =>
					new Response(hasAds ? adMedia : media("autoplay", "current", 100)),
			);
			if (hasAds) expect(result).toBeNull();
			else expect(result).toContain("segment-100.ts");
		},
	);
});
