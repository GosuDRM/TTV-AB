import { createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = ["constants", "state", "parser", "api", "processor", "hooks"]
	.map((name) =>
		readFileSync(resolve(__dirname, `../dist/src/modules/${name}.js`), "utf8"),
	)
	.join("\n");
const nativeUrl = "https://edge.example/native.m3u8?token=owned";
const codec = "avc1.64002a,mp4a.40.2";
const playlist = (sequence: number, count = 3, prefix = "clean") =>
	[
		"#EXTM3U",
		"#EXT-X-VERSION:3",
		"#EXT-X-TARGETDURATION:2",
		`#EXT-X-MEDIA-SEQUENCE:${sequence}`,
		"#EXT-X-DISCONTINUITY-SEQUENCE:0",
		...Array.from({ length: count }, (_, index) => [
			"#EXTINF:2.000,live",
			`https://edge.example/${prefix}-${sequence + index}.ts`,
		]).flat(),
	].join("\n");

function segments(text: string) {
	let sequence = Number(text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1] || 0);
	let discontinuity = Number(
		text.match(/#EXT-X-DISCONTINUITY-SEQUENCE:(\d+)/)?.[1] || 0,
	);
	const entries: { sequence: number; discontinuity: number; url: string }[] =
		[];
	const lines = text.split(/\r?\n/);
	for (let index = 0; index < lines.length; index++) {
		if (lines[index] === "#EXT-X-DISCONTINUITY") discontinuity++;
		if (lines[index].startsWith("#EXTINF:")) {
			entries.push({
				sequence: sequence++,
				discontinuity,
				url: lines[index + 1],
			});
		}
	}
	return entries;
}

function setup() {
	const context = createContext({
		URL,
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
	runInContext(source, context);
	runInContext(
		`
		_declareState(globalThis);
		_log = () => {};
		globalThis.state = __TTVAB_STATE__;
		state.PageMediaKey = "live:testchannel";
		state.CurrentAdMediaKey = "live:testchannel";
		state.CurrentAdChannel = "testchannel";
		state.DisableAutoplayBackup = true;
		globalThis.info = _createStreamInfo({ MediaType: "live", ChannelName: "testchannel" });
		state.StreamInfos[info.MediaKey] = info;
		info.IsShowingAd = true;
		info.VisibleAdStartedAt = Date.now() - 1000;
	`,
		context,
	);
	const { info } = context;
	info.EncodingsM3U8 = `#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080,CODECS="${codec}"\n${nativeUrl}`;
	info.UsherBaseUrl =
		"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8";
	info.Urls[nativeUrl] = { Resolution: "1920x1080", Codecs: codec };
	context.state.StreamInfosByUrl[nativeUrl] = info;
	const fetch = vi.fn();
	const serve = async (
		text: string,
		type: string | null = null,
		session = "one",
	) => {
		if (type) {
			info.IsUsingBackupStream = true;
			info.ActiveBackupPlayerType = type;
			info.LastCleanBackupM3U8 = text;
			info.LastCleanBackupAt = Date.now();
			context._rememberBackupPlaylistMetadata(info, text, "avc", codec, {
				playerType: type,
				resolution: "1920x1080",
				playlistUrl: `https://edge.example/${type}.m3u8?session=${session}`,
				sessionUrl: `https://usher.ttvnw.net/master.m3u8?session=${session}`,
			});
		}
		context._processM3U8Core = async () => text;
		return context._processM3U8(nativeUrl, playlist(400), fetch);
	};
	const hold = () =>
		serve(context._createEmptyAdHoldPlaylist(playlist(400), info));
	return { context, info, serve, hold, fetch };
}

describe("empty hold playlist continuity", () => {
	it("makes clean segments downloadable immediately after a long hold", async () => {
		const { hold, serve, fetch } = setup();
		let lastHold = "";
		for (let index = 0; index < 32; index++) lastHold = await hold();
		const lastConsumed = segments(lastHold).at(-1);
		const backup = segments(await serve(playlist(100), "site"));
		expect(
			backup.filter((entry) => entry.sequence > lastConsumed.sequence),
		).toHaveLength(3);
		expect(backup[0].discontinuity).toBeGreaterThan(lastConsumed.discontinuity);
		expect(backup.map((entry) => entry.url)).toEqual(
			segments(playlist(100)).map((entry) => entry.url),
		);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("keeps overlapping clean segments stable through refreshes and native restoration", async () => {
		const { context, info, hold, serve } = setup();
		await hold();
		const initial = segments(await serve(playlist(10), "site"));
		const refreshed = segments(await serve(playlist(11), "site"));
		expect(refreshed.slice(0, 2)).toEqual(initial.slice(1));
		expect(segments(await serve(playlist(11), "site"))).toEqual(refreshed);
		context._resetStreamAdState(info, true);
		context.state.CurrentAdMediaKey = null;
		context.state.CurrentAdChannel = null;
		const native = segments(await serve(playlist(5, 3, "native")));
		expect(native[0].sequence).toBeGreaterThan(refreshed.at(-1).sequence);
		expect(native[0].discontinuity).toBeGreaterThan(
			refreshed.at(-1).discontinuity,
		);
		const nativeRefresh = segments(await serve(playlist(6, 3, "native")));
		expect(nativeRefresh.slice(0, 2)).toEqual(native.slice(1));
	});

	it("starts a fresh numbering boundary for a replacement backup session", async () => {
		const { hold, serve } = setup();
		await hold();
		const first = segments(await serve(playlist(100), "site", "first"));
		const replacement = segments(await serve(playlist(1), "site", "second"));
		expect(replacement[0].sequence).toBeGreaterThan(first.at(-1).sequence);
		expect(replacement[0].discontinuity).toBeGreaterThan(
			first.at(-1).discontinuity,
		);
	});

	it("preserves the original encryption IV when media numbers change", async () => {
		const { hold, serve } = setup();
		await hold();
		const key = Buffer.alloc(16, 7);
		const originalIv = Buffer.alloc(16);
		originalIv.writeUInt32BE(10, 12);
		const clear = Buffer.from("actual segment payload");
		const cipher = createCipheriv("aes-128-cbc", key, originalIv);
		const encrypted = Buffer.concat([cipher.update(clear), cipher.final()]);
		const output = await serve(
			playlist(10, 1).replace(
				"#EXTINF:",
				'#EXT-X-KEY:METHOD=AES-128,URI="https://edge.example/key"\n#EXTINF:',
			),
			"site",
		);
		const iv = output.match(/IV=0x([0-9a-fA-F]{32})/)?.[1];
		expect(iv).toBe(originalIv.toString("hex"));
		const decipher = createDecipheriv(
			"aes-128-cbc",
			key,
			Buffer.from(iv, "hex"),
		);
		expect(
			Buffer.concat([decipher.update(encrypted), decipher.final()]),
		).toEqual(clear);
	});

	it("leaves unheld sessions, other tokens, and other renditions untouched", async () => {
		const { context, info, hold, serve } = setup();
		expect(await serve(playlist(100))).toBe(playlist(100));
		await hold();
		for (const url of [
			nativeUrl.replace("owned", "other"),
			nativeUrl.replace("native", "720p"),
		]) {
			expect(
				context._applyEmptyHoldPlaylistContinuity(info, url, playlist(100)),
			).toBeNull();
			expect(
				context._getEmptyHoldUpstreamUrl(
					info,
					`${url}&_HLS_msn=102&_HLS_skip=YES`,
				),
			).toBe(`${url}&_HLS_msn=102&_HLS_skip=YES`);
		}
		context.state.IsAdStrippingEnabled = false;
		expect(await serve(playlist(100))).toBe(playlist(100));
		expect(
			context._getEmptyHoldUpstreamUrl(info, `${nativeUrl}&_HLS_msn=402`),
		).toBe(`${nativeUrl}&_HLS_msn=402`);
	});

	it("retains numbering after an exact worker ad reset and releases it on full reset", async () => {
		const { context, info, hold, serve } = setup();
		const lastHold = segments(await hold())[0];
		expect(
			context._resetWorkerAdCycleState({
				mediaKey: info.MediaKey,
				cycleStartedAt: info.VisibleAdStartedAt,
			}),
		).toBe(true);
		const native = segments(await serve(playlist(10)));
		expect(native[0].sequence).toBeGreaterThan(lastHold.sequence);
		context._resetStreamAdState(info);
		expect(info._EmptyHoldTimelineByUrl.size).toBe(0);
		expect(await serve(playlist(11))).toBe(playlist(11));
	});

	it("preserves internal discontinuities as a CRLF window slides", async () => {
		const { hold, serve } = setup();
		await hold();
		const text = playlist(10)
			.replace(
				"#EXT-X-DISCONTINUITY-SEQUENCE:0",
				"#EXT-X-DISCONTINUITY-SEQUENCE:6",
			)
			.replace(
				"#EXTINF:2.000,live\nhttps://edge.example/clean-11",
				"#EXT-X-DISCONTINUITY\n#EXTINF:2.000,live\nhttps://edge.example/clean-11",
			);
		const initial = segments(
			await serve(text.replaceAll("\n", "\r\n"), "site"),
		);
		const refresh = playlist(11).replace(
			"#EXT-X-DISCONTINUITY-SEQUENCE:0",
			"#EXT-X-DISCONTINUITY-SEQUENCE:7",
		);
		expect(segments(await serve(refresh, "site")).slice(0, 2)).toEqual(
			initial.slice(1),
		);
	});

	it("does not relabel an older refresh as new downloadable media", async () => {
		const { info, hold, serve } = setup();
		await hold();
		await serve(playlist(11), "site");
		const before = JSON.stringify([...info._EmptyHoldTimelineByUrl]);
		await expect(serve(playlist(10), "site")).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(JSON.stringify([...info._EmptyHoldTimelineByUrl])).toBe(before);
	});

	it("uses the full native playlist while the player consumes a different source", async () => {
		const { context, info, hold, serve } = setup();
		const request = `${nativeUrl}&_HLS_msn=402&_HLS_part=2&_HLS_skip=v2`;
		await hold();
		expect(context._getEmptyHoldUpstreamUrl(info, request)).toBe(nativeUrl);
		await serve(playlist(10), "site");
		expect(context._getEmptyHoldUpstreamUrl(info, request)).toBe(nativeUrl);
	});

	it("translates low-latency requests back into the verified native sequence", async () => {
		const { context, info, hold, serve } = setup();
		await hold();
		context._resetStreamAdState(info, true);
		const native = segments(await serve(playlist(10)));
		const nextSequence = native.at(-1).sequence + 1;
		expect(
			context._getEmptyHoldUpstreamUrl(
				info,
				`${nativeUrl}&_HLS_msn=${nextSequence}&_HLS_part=2&_HLS_skip=YES`,
			),
		).toBe(`${nativeUrl}&_HLS_msn=13&_HLS_part=2`);
		for (const invalid of ["1", "NaN", "-1", "90071992547409930"]) {
			expect(
				context._getEmptyHoldUpstreamUrl(
					info,
					`${nativeUrl}&_HLS_msn=${invalid}&_HLS_part=2`,
				),
			).toBe(nativeUrl);
		}
	});

	it("preserves the request options, signal, and token bytes in the worker fetch", async () => {
		const { context, info, hold } = setup();
		await hold();
		const tokenUrl = nativeUrl.replace("owned", "a%20b%2fc~%2B");
		const controller = new AbortController();
		const rawFetch = vi.fn(
			async (_input: Request, _options: RequestInit) =>
				new Response(playlist(100)),
		);
		context.fetch = rawFetch;
		context.self = context;
		context._getStreamInfoForPlaylist = () => info;
		context._processM3U8Core = async () => playlist(100);
		context._applyEmptyHoldPlaylistContinuity(
			info,
			tokenUrl,
			context._createEmptyAdHoldPlaylist(playlist(400), info),
		);
		context._hookWorkerFetch();
		const options = { signal: controller.signal, cache: "no-store" };
		const request = new Request(
			`${tokenUrl}&_HLS_msn=500&_HLS_part=1&_HLS_skip=YES`,
			{
				headers: {
					Authorization: "test-auth",
					"Client-Integrity": "test-integrity",
				},
				credentials: "include",
				signal: controller.signal,
			},
		);
		await context.fetch(request, options);
		expect(rawFetch).toHaveBeenCalledOnce();
		const [sentRequest, sentOptions] = rawFetch.mock.calls[0];
		expect(sentRequest.url).toBe(tokenUrl);
		expect(sentRequest.headers.get("Authorization")).toBe("test-auth");
		expect(sentRequest.headers.get("Client-Integrity")).toBe("test-integrity");
		expect(sentRequest.credentials).toBe("include");
		expect(sentOptions).toBe(options);
		controller.abort();
		expect(sentRequest.signal.aborted).toBe(true);
	});

	it("keeps implicit IVs stable across parts, full segments, key changes, and preload hints", async () => {
		const { hold, serve } = setup();
		await hold();
		const text = [
			"#EXTM3U",
			"#EXT-X-MEDIA-SEQUENCE:10",
			'#EXT-X-KEY:METHOD=AES-128,URI="https://edge.example/key-one"',
			'#EXT-X-PART:DURATION=0.5,URI="https://edge.example/10.0.m4s"',
			"#EXTINF:2.000,live",
			"https://edge.example/10.m4s",
			'#EXT-X-KEY:METHOD=AES-128,URI="https://edge.example/key-two"',
			'#EXT-X-PART:DURATION=0.5,URI="https://edge.example/11.0.m4s"',
			'#EXT-X-PRELOAD-HINT:TYPE=PART,URI="https://edge.example/11.1.m4s"',
		].join("\n");
		const output = await serve(text, "site");
		expect(
			[...output.matchAll(/IV=0x([0-9a-f]{32})/g)].map((match) => match[1]),
		).toEqual([
			"0000000000000000000000000000000a",
			"0000000000000000000000000000000b",
		]);
		expect(output.indexOf("#EXT-X-DISCONTINUITY\n")).toBeLessThan(
			output.indexOf("#EXT-X-PART:"),
		);
		expect(output).toContain("#EXT-X-VERSION:2");
		const completed = await serve(playlist(11), "site");
		expect(segments(completed)[0].sequence).toBe(
			segments(output)[0].sequence + 1,
		);
	});

	it("retains explicit IVs, key formats, byte ranges, and clear media", async () => {
		const { hold, serve } = setup();
		await hold();
		const text = [
			"#EXTM3U",
			"#EXT-X-MEDIA-SEQUENCE:10",
			'#EXT-X-KEY:METHOD=AES-128,URI="https://edge.example/key",IV=0x1234',
			'#EXT-X-MAP:URI="https://edge.example/init",BYTERANGE="100@0"',
			"#EXTINF:2.000,live",
			"#EXT-X-BYTERANGE:50@100",
			"https://edge.example/media",
			"#EXT-X-KEY:METHOD=NONE",
			"#EXTINF:2.000,live",
			"https://edge.example/clear",
			'#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://key",KEYFORMAT="com.apple.streamingkeydelivery"',
			"#EXTINF:2.000,live",
			"https://edge.example/fairplay",
		].join("\n");
		const output = await serve(text, "site");
		expect(output.slice(output.indexOf("#EXT-X-KEY:"))).toBe(
			text.slice(text.indexOf("#EXT-X-KEY:")),
		);
	});

	it("rejects a delta playlist after a hold without changing timeline ownership", async () => {
		const { info, hold, serve } = setup();
		await hold();
		const before = JSON.stringify([...info._EmptyHoldTimelineByUrl]);
		await expect(
			serve(
				playlist(10).replace(
					"#EXTINF:",
					"#EXT-X-SKIP:SKIPPED-SEGMENTS=2\n#EXTINF:",
				),
				"site",
			),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(JSON.stringify([...info._EmptyHoldTimelineByUrl])).toBe(before);
	});

	it("bounds history without retaining playlist snapshots", () => {
		const { context, info } = setup();
		for (let index = 0; index < 40; index++) {
			const text = context._createEmptyAdHoldPlaylist(playlist(400), info);
			context._applyEmptyHoldPlaylistContinuity(
				info,
				`${nativeUrl}&session=${index}`,
				text,
			);
		}
		expect(info._EmptyHoldTimelineByUrl.size).toBe(32);
		expect(JSON.stringify([...info._EmptyHoldTimelineByUrl])).not.toContain(
			"#EXTM3U",
		);
	});

	it("never treats a backup without session ownership as native", async () => {
		const { context, info, hold } = setup();
		await hold();
		info.IsUsingBackupStream = true;
		info.LastCleanBackupM3U8 = playlist(10);
		const before = JSON.stringify([...info._EmptyHoldTimelineByUrl]);
		expect(() =>
			context._applyEmptyHoldPlaylistContinuity(
				info,
				nativeUrl,
				info.LastCleanBackupM3U8,
			),
		).toThrow("requires exact backup ownership");
		expect(JSON.stringify([...info._EmptyHoldTimelineByUrl])).toBe(before);
	});

	it("keeps rendition reports in the presented native numbering", async () => {
		const { context, info, hold, serve } = setup();
		await hold();
		const otherUrl = nativeUrl.replace("native", "720p");
		context._applyEmptyHoldPlaylistContinuity(
			info,
			otherUrl,
			context._createEmptyAdHoldPlaylist(playlist(400), info),
		);
		const other = segments(
			context._applyEmptyHoldPlaylistContinuity(info, otherUrl, playlist(20)),
		);
		const report = `#EXT-X-RENDITION-REPORT:URI="${otherUrl}",LAST-MSN=22,LAST-PART=1`;
		const output = await serve(`${playlist(10)}\n${report}`);
		expect(output).toContain(
			`URI="${otherUrl}",LAST-MSN=${other.at(-1).sequence},LAST-PART=1`,
		);
	});

	it("does not commit continuity from a cancelled response", async () => {
		const { context, info, hold } = setup();
		await hold();
		const before = JSON.stringify([...info._EmptyHoldTimelineByUrl]);
		const controller = new AbortController();
		context._processM3U8Core = async () => {
			controller.abort();
			return playlist(10);
		};
		await expect(
			context._processM3U8(nativeUrl, playlist(10), vi.fn(), controller.signal),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(JSON.stringify([...info._EmptyHoldTimelineByUrl])).toBe(before);
	});

	it("keeps the degraded page fetch advancing from an owned AVC hold to native", async () => {
		const { context, info } = setup();
		const url =
			"https://video-weaver.example.ttvnw.net/native.m3u8?token=owned";
		let current = playlist(400, 1, "ad")
			.replace(",live", ",")
			.replace("#EXTINF:", "#EXT-X-CUE-OUT:30\n#EXTINF:");
		const rawFetch = vi.fn(async (_input: Request) => new Response(current));
		context.window = context;
		context.fetch = rawFetch;
		context._canServePageSideAvcHold = () => true;
		context._ensurePageSideFallbackAdCycle = () => info.VisibleAdStartedAt;
		context._installPageSideM3U8Override();
		const hold = segments(await (await context.fetch(url)).text())[0];
		expect(hold.url).toContain("__ttvab_empty_hold_segment.mp4");
		context.state.CurrentAdMediaKey = null;
		context.state.CurrentAdChannel = null;
		current = playlist(10);
		const controller = new AbortController();
		const request = new Request(
			`${url}&_HLS_msn=${hold.sequence + 1}&_HLS_skip=YES`,
			{ signal: controller.signal },
		);
		const native = segments(await (await context.fetch(request)).text());
		expect(native[0].sequence).toBeGreaterThan(hold.sequence);
		expect(native[0].discontinuity).toBeGreaterThan(hold.discontinuity);
		expect(rawFetch.mock.calls[1][0].url).toBe(url);
		current = playlist(11);
		expect(
			segments(await (await context.fetch(url)).text()).slice(0, 2),
		).toEqual(native.slice(1));
		expect(rawFetch).toHaveBeenCalledTimes(3);
		controller.abort();
		expect(rawFetch.mock.calls[1][0].signal.aborted).toBe(true);
	});
});
