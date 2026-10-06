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
				url: lines
					.slice(index + 1)
					.find((line) => line && !line.startsWith("#")),
			});
		}
		if (lines[index].startsWith("#EXT-X-TWITCH-PREFETCH:")) {
			entries.push({
				sequence: sequence++,
				discontinuity,
				url: lines[index].slice("#EXT-X-TWITCH-PREFETCH:".length),
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
	it("allows a fresh native bridge again after an undated hold finishes", async () => {
		const { context, info, serve, hold } = setup();
		await hold();
		context._resetStreamAdState(info, true);
		const clean = playlist(500);
		await serve(clean);
		info.LastCleanNativeM3U8 = clean;
		info.LastCleanNativeUrl = nativeUrl;
		info.LastCleanNativeCodec = codec;
		info.LastCleanNativePlaylistAt = Date.now();
		expect(
			context._getSameRequestCleanNative(info, nativeUrl, codec, false, 2000),
		).toBe(clean);
	});

	it.each(
		[false, true].flatMap((disabled) =>
			[false, true].map((dated) => ({ disabled, dated })),
		),
	)(
		"keeps the hold flowing after another rendition retires the native bridge with disabled=$disabled and dated=$dated",
		async ({ disabled, dated }) => {
			const { context, info, fetch } = setup();
			let now = Date.now();
			context.Date = class extends Date {
				static now() {
					return now;
				}
			};
			context.state.DisableAutoplayBackup = disabled;
			context.state.CurrentAdMediaKey = null;
			context.state.CurrentAdChannel = null;
			info.IsShowingAd = false;
			info.VisibleAdStartedAt = 0;
			const otherUrl = nativeUrl.replace("native", "360p");
			info.Urls[otherUrl] = { Resolution: "640x360", Codecs: codec };
			context.state.StreamInfosByUrl[otherUrl] = info;
			const clean = dated
				? playlist(400).replace(
						"#EXTINF:",
						"#EXT-X-PROGRAM-DATE-TIME:2026-10-06T07:05:04Z\n#EXTINF:",
					)
				: playlist(400);
			await context._processM3U8(nativeUrl, clean, fetch);
			const search = vi.fn(() => new Promise(() => {}));
			context._findBackupStream = search;
			const log = vi.fn();
			context._log = log;
			const ad = clean.replace("#EXTINF:", "#EXT-X-CUE-OUT:30\n#EXTINF:");
			const first = await context._processM3U8(otherUrl, ad, fetch);
			now += 1000;
			const next = await context._processM3U8(nativeUrl, ad, fetch);
			expect(next).toContain("__ttvab_empty_hold_segment.ts");
			expect(next).not.toContain("clean-400.ts");
			expect(segments(next)[0].sequence).toBeGreaterThan(
				segments(first).at(-1).sequence,
			);
			expect(search).toHaveBeenCalledOnce();
			expect(log.mock.calls.flat().join("\n")).not.toContain(
				"Returning native playlist to prevent buffer drain",
			);
		},
	);

	it.each(["current", "aborted", "new cycle", "new loader"])(
		"rechecks a cached native response after a concurrent rendition starts a hold: %s",
		async (owner) => {
			const { context, info, fetch } = setup();
			context.state.CurrentAdMediaKey = null;
			context.state.CurrentAdChannel = null;
			info.IsShowingAd = false;
			info.VisibleAdStartedAt = 0;
			const otherUrl = nativeUrl.replace("native", "360p");
			info.Urls[otherUrl] = { Resolution: "640x360", Codecs: codec };
			context.state.StreamInfosByUrl[otherUrl] = info;
			const clean = playlist(400).replace(
				"#EXTINF:",
				"#EXT-X-PROGRAM-DATE-TIME:2026-10-06T07:05:04Z\n#EXTINF:",
			);
			await context._processM3U8(nativeUrl, clean, fetch);
			context._findBackupStream = vi.fn(() => new Promise(() => {}));
			const core = context._processM3U8Core;
			let release: () => void;
			let selected: () => void;
			const paused = new Promise<void>((resolve) => {
				release = resolve;
			});
			const ready = new Promise<void>((resolve) => {
				selected = resolve;
			});
			context._processM3U8Core = async (...args: unknown[]) => {
				const text = await core(...args);
				if (args[0] === nativeUrl) {
					selected();
					await paused;
				}
				return text;
			};
			const ad = clean.replace("#EXTINF:", "#EXT-X-CUE-OUT:30\n#EXTINF:");
			const controller = new AbortController();
			const pending = context._processM3U8(
				nativeUrl,
				ad,
				fetch,
				controller.signal,
			);
			await ready;
			const held = await context._processM3U8(otherUrl, ad, fetch);
			if (owner === "aborted") controller.abort();
			if (owner === "new cycle") info.BackupSearchEpoch++;
			if (owner === "new loader") info.NativeRecoveryLoaderEpoch++;
			release();
			if (owner !== "current") {
				await expect(pending).rejects.toMatchObject({ name: "AbortError" });
				return;
			}
			const output = await pending;
			expect(output).toContain("__ttvab_empty_hold_segment.ts");
			expect(output).not.toContain("clean-400.ts");
			expect(segments(output)[0].sequence).toBeGreaterThanOrEqual(
				segments(held).at(-1).sequence,
			);
		},
	);

	it.each([10, 8990, 250000])(
		"hands a long preroll hold to backup sequence %s without advertising missing segments",
		async (sourceSequence) => {
			const { context, info, hold, serve } = setup();
			let lastHold = "";
			for (let poll = 0; poll < 40; poll++) lastHold = await hold();
			const nextSequence = segments(lastHold).at(-1).sequence + 1;
			const first = segments(await serve(playlist(sourceSequence), "site"));
			expect(first[0].sequence).toBe(nextSequence);
			expect(first[0].discontinuity).toBeGreaterThan(
				segments(lastHold).at(-1).discontinuity,
			);
			const otherUrl = nativeUrl.replace("native", "720p");
			info.Urls[otherUrl] = { Resolution: "1280x720", Codecs: codec };
			const other = segments(
				context._applyPlaylistContinuity(
					info,
					otherUrl,
					playlist(sourceSequence),
					info.BackupPlaylistMetadata.get(info.LastCleanBackupM3U8),
				),
			);
			expect(other).toEqual(first);
			const refreshed = segments(
				await serve(playlist(sourceSequence + 1), "site"),
			);
			expect(refreshed.slice(0, 2)).toEqual(first.slice(1));
			const rotated = segments(
				await serve(playlist(sourceSequence + 9000), "embed"),
			);
			expect(rotated[0].sequence).toBe(refreshed.at(-1).sequence + 1);
			context._resetStreamAdState(info, true);
			const native = segments(await serve(playlist(sourceSequence + 20000)));
			expect(native[0].sequence).toBe(rotated.at(-1).sequence + 1);
			expect(info.HevcReloadPendingAfterHold).toBe(false);
		},
	);

	it("keeps holds beyond the presented live window across native request URLs", async () => {
		const { context, info, hold, serve } = setup();
		await hold();
		await serve(playlist(100), "site");
		info.IsUsingBackupStream = false;
		const native = await serve(playlist(20));
		const otherUrl = nativeUrl.replace("native", "360p");
		info.Urls[otherUrl] = { Resolution: "640x360", Codecs: codec };
		const firstHold = context._createEmptyAdHoldPlaylist(playlist(25), info);
		const first = context._applyPlaylistContinuity(info, nativeUrl, firstHold);
		const secondHold = context._createEmptyAdHoldPlaylist(playlist(26), info);
		const second = context._applyPlaylistContinuity(info, otherUrl, secondHold);
		expect(segments(first)[0].sequence).toBeGreaterThan(
			segments(native).at(-1)?.sequence || 0,
		);
		expect(segments(second)[0].sequence).toBeGreaterThan(
			segments(first)[0].sequence,
		);
		expect(segments(second)[0].discontinuity).toBeGreaterThanOrEqual(
			segments(first)[0].discontinuity,
		);
		expect(context._applyPlaylistContinuity(info, nativeUrl, secondHold)).toBe(
			second,
		);
		expect(() =>
			context._applyPlaylistContinuity(info, otherUrl, firstHold),
		).toThrow("Retired empty hold recovery playlist");
	});

	it.each(["site", "vod", "disabled", "inactive", "ambiguous"])(
		"does not arm autoplay rebuild intent for %s output",
		(mode) => {
			const { context, info } = setup();
			if (mode === "vod") info.MediaType = "vod";
			if (mode === "disabled") context.state.IsAdStrippingEnabled = false;
			if (mode === "inactive") info.IsShowingAd = false;
			context._applyPlaylistContinuity(info, nativeUrl, playlist(100), {
				playerType: mode === "site" ? "site" : "autoplay",
				playlistUrl: "https://edge.example/backup.m3u8",
				ambiguous: mode === "ambiguous",
			});
			expect(info.HevcReloadPendingAfterHold).toBe(false);
		},
	);

	it("retains native rebuild intent when an early-return autoplay bridge later rotates to site", async () => {
		const { info, hold, serve } = setup();
		await hold();
		expect(info.HevcReloadPendingAfterHold).toBe(false);
		await serve(playlist(100), "autoplay");
		expect(info.HevcReloadPendingAfterHold).toBe(true);
		await serve(playlist(200), "site");
		expect(info.HevcReloadPendingAfterHold).toBe(true);
	});

	it("shares the new backup generation after only one native request URL reenters a hold", async () => {
		const { context, info, hold, serve } = setup();
		await hold();
		const otherUrl = nativeUrl.replace("native", "360p");
		info.Urls[otherUrl] = { Resolution: "640x360", Codecs: codec };
		const first = segments(await serve(playlist(100), "autoplay"));
		const metadata = info.BackupPlaylistMetadata.get(info.LastCleanBackupM3U8);
		context._applyEmptyHoldPlaylistContinuity(
			info,
			otherUrl,
			playlist(100),
			metadata,
		);
		const held = segments(await hold());
		const next = segments(await serve(playlist(101), "autoplay"));
		const other = segments(
			context._applyEmptyHoldPlaylistContinuity(
				info,
				otherUrl,
				playlist(101),
				metadata,
			),
		);
		expect(next[0].sequence).toBeGreaterThan(held.at(-1).sequence);
		expect(next[0].discontinuity).toBeGreaterThan(first[0].discontinuity);
		expect(other).toEqual(next);
		expect(() =>
			context._applyEmptyHoldPlaylistContinuity(
				info,
				otherUrl,
				playlist(100),
				metadata,
			),
		).toThrow("Retired empty hold recovery playlist");
	});

	it("presents the same backup segments with the same numbers across native request URLs", async () => {
		const { context, info, hold, serve } = setup();
		await hold();
		const otherUrl = nativeUrl.replace("native", "360p");
		info.Urls[otherUrl] = { Resolution: "640x360", Codecs: codec };
		context._applyEmptyHoldPlaylistContinuity(
			info,
			otherUrl,
			context._createEmptyAdHoldPlaylist(playlist(405), info),
		);
		const first = segments(await serve(playlist(100), "autoplay"));
		const metadata = info.BackupPlaylistMetadata.get(info.LastCleanBackupM3U8);
		const other = segments(
			context._applyEmptyHoldPlaylistContinuity(
				info,
				otherUrl,
				playlist(100),
				metadata,
			),
		);
		expect(other).toEqual(first);
		const refreshed = segments(await serve(playlist(101), "autoplay"));
		const otherRefresh = segments(
			context._applyEmptyHoldPlaylistContinuity(
				info,
				otherUrl,
				playlist(101),
				metadata,
			),
		);
		expect(otherRefresh).toEqual(refreshed);
		expect(refreshed.slice(0, 2)).toEqual(first.slice(1));
	});

	it("aligns the native return directly after a hold without retiming ordinary master refreshes", async () => {
		const { info, serve, hold } = setup();
		const text = playlist(400).replace(
			"#EXTINF:",
			"#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:20Z\n#EXTINF:",
		);
		await serve(text);
		info.UsherBaseUrl += "?session=new";
		expect(await serve(text)).toBe(text);
		await hold();
		await expect(serve(text)).rejects.toMatchObject({ name: "AbortError" });
		expect(await serve(text.replace("18:09:20Z", "18:09:26Z"))).toContain(
			"clean-400.ts",
		);
	});

	it("keeps trimmed encrypted byte ranges, initialization data, and future prefetch media usable", async () => {
		const { serve, hold } = setup();
		const dated = (sequence: number, seconds: number) =>
			playlist(sequence).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:${seconds}.000Z\n#EXTINF:`,
			);
		await serve(dated(400, 20));
		await hold();
		const source = dated(100, 24)
			.replace(
				"#EXTINF:",
				'#EXT-X-MAP:URI="https://edge.example/init.mp4"\n#EXT-X-KEY:METHOD=AES-128,URI="https://edge.example/key"\n#EXTINF:',
			)
			.replaceAll(
				/https:\/\/edge.example\/clean-10[0-2]\.ts/g,
				"#EXT-X-BYTERANGE:100\nhttps://edge.example/media.ts",
			)
			.replace("#EXT-X-BYTERANGE:100", "#EXT-X-BYTERANGE:100@0")
			.concat("\n#EXT-X-TWITCH-PREFETCH:https://edge.example/future.ts")
			.replaceAll("\n", "\r\n");
		const output = await serve(source, "site");
		expect(output).toContain('#EXT-X-MAP:URI="https://edge.example/init.mp4"');
		expect(output).toContain("#EXT-X-BYTERANGE:100@100");
		expect(output).not.toContain("#EXT-X-BYTERANGE:100@0");
		expect(output).toContain(
			"#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:26.000Z",
		);
		expect(output).toContain(
			"#EXT-X-TWITCH-PREFETCH:https://edge.example/future.ts",
		);
		const key = Buffer.alloc(16, 7);
		const iv = Buffer.alloc(16);
		iv.writeUInt32BE(101, 12);
		const cipher = createCipheriv("aes-128-cbc", key, iv);
		const clear = Buffer.from("retained live audio and video");
		const encrypted = Buffer.concat([cipher.update(clear), cipher.final()]);
		const returnedIv = Buffer.from(
			output.match(/IV=0x([a-f0-9]{32})/i)[1],
			"hex",
		);
		const decipher = createDecipheriv("aes-128-cbc", key, returnedIv);
		expect(
			Buffer.concat([decipher.update(encrypted), decipher.final()]),
		).toEqual(clear);
	});

	it.each([false, true])(
		"retains source discontinuities and dated segments with an earlier timestamp: %s",
		async (earlierTimestamp) => {
			const { context, info } = setup();
			const start = Date.parse("2026-09-20T18:09:20Z");
			const dated = (sequence: number, time: number) =>
				playlist(sequence).replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(time).toISOString()}\n#EXTINF:`,
				);
			context._alignLivePlaylist(info, dated(400, start));
			const text = dated(100, start + 4000).replace(
				"#EXTINF:2.000,live\nhttps://edge.example/clean-101.ts",
				"#EXT-X-DISCONTINUITY\n#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:26Z\n#EXTINF:2.000,live\nhttps://edge.example/clean-101.ts",
			);
			const ordered = earlierTimestamp
				? text.replace(
						"#EXT-X-DISCONTINUITY\n#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:26Z",
						"#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:26Z\n#EXT-X-DISCONTINUITY",
					)
				: text;
			const output = context._alignLivePlaylist(info, ordered, {
				playerType: "site",
				sessionUrl: "owned",
			});
			expect(context._parsePlaylistDiscontinuitySequence(output)).toBe(0);
			expect(output).toContain("#EXT-X-DISCONTINUITY\n");
			expect(output).not.toContain("clean-100.ts");
			expect(output).toContain("clean-101.ts");
		},
	);

	it.each(["unknown timestamp", "delta", "implicit range"])(
		"does not reinterpret ambiguous %s handoff data",
		async (failure) => {
			const { context, info, serve } = setup();
			await serve(
				playlist(400).replace(
					"#EXTINF:",
					"#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:20Z\n#EXTINF:",
				),
			);
			const previous = info._LivePlaylistTimeline;
			let text = playlist(100).replace(
				"#EXTINF:",
				"#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:24Z\n#EXTINF:",
			);
			if (failure === "unknown timestamp")
				text = text.replace(
					"#EXTINF:2.000,live\nhttps://edge.example/clean-101.ts",
					"#EXT-X-DISCONTINUITY\n#EXTINF:2.000,live\nhttps://edge.example/clean-101.ts",
				);
			if (failure === "delta")
				text = text.replace(
					"#EXTM3U",
					"#EXTM3U\n#EXT-X-SKIP:SKIPPED-SEGMENTS=10",
				);
			if (failure === "implicit range")
				text = text.replaceAll("#EXTINF:", "#EXT-X-BYTERANGE:100\n#EXTINF:");
			await expect(serve(text, "site")).rejects.toMatchObject({
				name: "AbortError",
			});
			expect(info._LivePlaylistTimeline).toBe(previous);
			expect(context._playlistHasMediaSegments(text)).toBe(true);
		},
	);

	it.each(["vod", "disabled", "undated"])(
		"preserves %s playlist timing",
		async (mode) => {
			const { context, info } = setup();
			info._LivePlaylistTimeline = {
				identity: "prior",
				minimumTime: 0,
				lastEndTime: Date.parse("2026-09-20T18:10:00Z"),
			};
			if (mode === "vod") info.MediaType = "vod";
			if (mode === "disabled") context.state.IsAdStrippingEnabled = false;
			const text =
				mode === "undated"
					? playlist(100)
					: playlist(100).replace(
							"#EXTINF:",
							"#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:24Z\n#EXTINF:",
						);
			expect(context._alignLivePlaylist(info, text)).toBe(text);
			expect(info._LivePlaylistTimeline.identity).toBe("prior");
		},
	);

	it("does not replay dated content when a backup follows an empty hold", async () => {
		const { context, info, serve, hold } = setup();
		const dated = (sequence: number, start: number, count = 3) =>
			playlist(sequence, count).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start).toISOString()}\n#EXTINF:`,
			);
		const start = Date.parse("2026-09-20T18:09:48Z");
		await serve(dated(400, start));
		await hold();
		await expect(
			serve(dated(100, start - 20000), "autoplay"),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(info.HevcReloadPendingAfterHold).toBe(false);
		const output = await serve(dated(110, start + 2000, 4), "autoplay");
		expect(output).not.toContain("clean-110.ts");
		expect(output).not.toContain("clean-111.ts");
		expect(output).toContain("clean-112.ts");
		expect(context._playlistHasMediaSegments(output)).toBe(true);
		const refreshed = await serve(dated(111, start + 4000, 4), "autoplay");
		expect(refreshed).not.toContain("clean-111.ts");
		expect(segments(refreshed)[0]).toEqual(segments(output)[0]);
	});

	it("aligns dated native returns and backup promotions without requiring an empty hold", async () => {
		const { serve } = setup();
		const dated = (sequence: number, seconds: number) =>
			playlist(sequence).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:${seconds}.000Z\n#EXTINF:`,
			);
		await serve(dated(400, 20));
		const backup = await serve(dated(100, 24), "autoplay");
		expect(backup).not.toContain("clean-100.ts");
		const promoted = await serve(dated(200, 28), "site");
		expect(promoted).not.toContain("clean-200.ts");
		const native = await serve(dated(500, 32));
		expect(native).not.toContain("clean-500.ts");
	});

	it.each(
		[-50, -40, -1, 0, 1, 40, 50].flatMap((skewMs) =>
			[false, true].map((withHold) => ({ skewMs, withHold })),
		),
	)(
		"keeps the clean boundary segment with $skewMs ms timestamp skew and hold=$withHold",
		async ({ skewMs, withHold }) => {
			const { context, info, serve, hold } = setup();
			const start = Date.parse("2026-09-20T18:09:20Z");
			const dated = (sequence: number, offsetMs: number) =>
				playlist(sequence).replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + offsetMs).toISOString()}\n#EXTINF:`,
				);
			await serve(dated(400, 0));
			if (withHold) await hold();
			const backup = await serve(dated(100, 4000 + skewMs), "site");
			expect(backup).not.toContain("clean-100.ts");
			expect(backup).toContain("clean-101.ts");
			expect(segments(backup)).toHaveLength(2);
			expect(backup).toContain(
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + 6000 + skewMs).toISOString()}`,
			);
			const refreshed = await serve(dated(101, 6000 + skewMs), "site");
			expect(segments(refreshed).slice(0, 2)).toEqual(segments(backup));
			const promoted = await serve(dated(200, 10000), "embed");
			expect(promoted).not.toContain("clean-200.ts");
			expect(promoted).toContain("clean-201.ts");
			context._resetStreamAdState(info, true);
			const native = await serve(dated(500, 14000 + skewMs));
			expect(native).not.toContain("clean-500.ts");
			expect(native).toContain("clean-501.ts");
		},
	);

	it("reports handoff timing once without exposing signed playlist URLs", async () => {
		const { context, serve } = setup();
		const log = vi.fn();
		context._log = log;
		const dated = (sequence: number, time: string) =>
			playlist(sequence).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:${time}Z\n#EXTINF:`,
			);
		await serve(dated(400, "20.000"));
		await serve(dated(100, "23.999"), "site", "private-token");
		await serve(dated(101, "25.999"), "site", "private-token");
		expect(log.mock.calls).toEqual([
			[
				"[Recovery] Live playlist handoff skipped 1 older segments; boundary -1ms; retained 2 segments",
				"info",
			],
		]);
	});

	it.each([-51, -235, -500, -1999])(
		"still trims a handoff segment overlapping the previous window by %s ms",
		async (skewMs) => {
			const { serve } = setup();
			const start = Date.parse("2026-09-20T18:09:20Z");
			const dated = (sequence: number, offsetMs: number) =>
				playlist(sequence).replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + offsetMs).toISOString()}\n#EXTINF:`,
				);
			await serve(dated(400, 0));
			const backup = await serve(dated(100, 4000 + skewMs), "site");
			expect(backup).not.toContain("clean-100.ts");
			expect(backup).not.toContain("clean-101.ts");
			expect(segments(backup)).toHaveLength(1);
			expect(backup).toContain("clean-102.ts");
		},
	);

	it("rejects a completed short segment within the handoff tolerance", async () => {
		const { serve } = setup();
		await serve(
			playlist(400).replace(
				"#EXTINF:",
				"#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:20Z\n#EXTINF:",
			),
		);
		const stale = playlist(100, 1)
			.replace("2.000,live", "0.010,live")
			.replace(
				"#EXTINF:",
				"#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:25.980Z\n#EXTINF:",
			);
		await expect(serve(stale, "site")).rejects.toMatchObject({
			name: "AbortError",
		});
	});

	it.each(["backup", "native", "hold"])(
		"does not reuse prefetched segment numbers when switching to %s",
		async (destination) => {
			const { context, info, hold, serve } = setup();
			await hold();
			const text = `${playlist(100)}\n#EXT-X-TWITCH-PREFETCH:https://edge.example/clean-103.ts\n#EXT-X-TWITCH-PREFETCH:https://edge.example/clean-104.ts`;
			const previous = segments(await serve(text, "autoplay"));
			const replacement =
				destination === "backup"
					? await serve(playlist(200), "site")
					: destination === "native"
						? await serve(playlist(200))
						: await serve(
								context._createEmptyAdHoldPlaylist(playlist(400), info),
							);
			const next = segments(replacement);
			expect(next[0].sequence).toBeGreaterThan(previous.at(-1).sequence);
			expect(next[0].discontinuity).toBeGreaterThan(
				previous.at(-1).discontinuity,
			);
			expect(next[0].url).not.toBe(previous.at(-1).url);
		},
	);

	it("retains prefetched media identity when it becomes a complete segment", async () => {
		const { hold, serve } = setup();
		await hold();
		const text = `${playlist(100)}\n#EXT-X-TWITCH-PREFETCH:https://edge.example/clean-103.ts\n#EXT-X-TWITCH-PREFETCH:https://edge.example/clean-104.ts`;
		const previous = segments(await serve(text, "site"));
		const refreshed = segments(await serve(playlist(102), "site"));
		expect(refreshed).toEqual(previous.slice(2));
	});

	it("preserves implicit encryption IVs for every prefetched segment", async () => {
		const { hold, serve } = setup();
		await hold();
		const text = `${playlist(10, 1).replace("#EXTINF:", '#EXT-X-KEY:METHOD=AES-128,URI="https://edge.example/key"\n#EXTINF:')}\n#EXT-X-TWITCH-PREFETCH:https://edge.example/clean-11.ts\n#EXT-X-TWITCH-PREFETCH:https://edge.example/clean-12.ts`;
		const output = await serve(text, "site");
		const key = Buffer.alloc(16, 7);
		const clear = Buffer.from("prefetched audio and video");
		const ivs = [...output.matchAll(/IV=0x([0-9a-fA-F]{32})/g)].map((match) =>
			Buffer.from(match[1], "hex"),
		);
		expect(ivs).toHaveLength(3);
		for (const [index, iv] of ivs.entries()) {
			const originalIv = Buffer.alloc(16);
			originalIv.writeUInt32BE(10 + index, 12);
			const cipher = createCipheriv("aes-128-cbc", key, originalIv);
			const encrypted = Buffer.concat([cipher.update(clear), cipher.final()]);
			const decipher = createDecipheriv("aes-128-cbc", key, iv);
			expect(
				Buffer.concat([decipher.update(encrypted), decipher.final()]),
			).toEqual(clear);
		}
	});

	it("keeps the first CSAI hold beyond the native window already offered to the player", async () => {
		const { context, info, serve } = setup();
		info.IsShowingAd = false;
		info.VisibleAdStartedAt = 0;
		context.state.CurrentAdMediaKey = null;
		context.state.CurrentAdChannel = null;
		const native = playlist(400);
		const before = segments(
			await context._processM3U8(nativeUrl, native, vi.fn()),
		);
		info.LastCleanNativePlaylistAt = Date.now() - 3000;
		context._findBackupStream = vi.fn(() => new Promise(() => {}));
		const ad = playlist(401).replace("#EXTINF:", "#EXT-X-CUE-OUT:30\n#EXTINF:");
		const output = await context._processM3U8(nativeUrl, ad, vi.fn());
		const hold = segments(output)[0];
		expect(info.CsaiOnlyThisBreak).toBe(true);
		expect(hold.url).toContain("__ttvab_empty_hold_segment.ts");
		expect(hold.sequence).toBeGreaterThan(before.at(-1).sequence);
		expect(output).not.toContain("https://edge.example/clean-");
		expect(context._findBackupStream).toHaveBeenCalledOnce();
		const backup = segments(await serve(playlist(100), "autoplay"));
		expect(backup[0].sequence).toBeGreaterThan(hold.sequence);
		expect(backup[0].discontinuity).toBeGreaterThan(hold.discontinuity);
		const refreshed = segments(await serve(playlist(101), "autoplay"));
		expect(refreshed.slice(0, 2)).toEqual(backup.slice(1));
		context._resetStreamAdState(info, true);
		const restored = segments(await serve(playlist(450)));
		expect(restored[0].sequence).toBeGreaterThan(refreshed.at(-1).sequence);
		expect(restored[0].discontinuity).toBeGreaterThan(
			refreshed.at(-1).discontinuity,
		);
	});

	it("starts the hold after every discontinuity in the native window", () => {
		const { context, info } = setup();
		const native = playlist(400)
			.replace("DISCONTINUITY-SEQUENCE:0", "DISCONTINUITY-SEQUENCE:6")
			.replaceAll("#EXTINF:", "#EXT-X-DISCONTINUITY\n#EXTINF:")
			.replaceAll("\n", "\r\n");
		const hold = segments(
			context._applyEmptyHoldPlaylistContinuity(
				info,
				nativeUrl,
				context._createEmptyAdHoldPlaylist(native, info),
			),
		)[0];
		expect(hold.discontinuity).toBeGreaterThan(
			segments(native).at(-1).discontinuity,
		);
	});

	it.each([
		["site", true],
		["autoplay", true],
		["site", false],
		["autoplay", false],
	])(
		"preserves %s ownership through playlist whitespace cleanup (empty hold: %s)",
		async (type, usedEmptyHold) => {
			const { context, info, hold } = setup();
			const processCore = context._processM3U8Core;
			if (usedEmptyHold) await hold();
			context._processM3U8Core = processCore;
			context.state.DisableAutoplayBackup = type === "site";
			info.CsaiOnlyThisBreak = true;
			let sequence = 100;
			const select = () => {
				const text = `${playlist(sequence)}\n\n`;
				info.LastCleanBackupM3U8 = text;
				info.LastCleanBackupAt = Date.now();
				info.LastCleanBackupPlayerType = type;
				info.LastCleanBackupResolution = "1920x1080";
				info.LastCleanBackupCodecFamily = "avc";
				info.LastCleanBackupCodec = codec;
				context._rememberBackupPlaylistMetadata(info, text, "avc", codec, {
					playerType: type,
					resolution: "1920x1080",
					playlistUrl: `https://edge.example/${type}.m3u8?session=one`,
					sessionUrl: "https://usher.ttvnw.net/master.m3u8?session=one",
				});
				return { type, m3u8: text };
			};
			const search = vi.fn(async () => select());
			context._findBackupStream = search;
			const ad = playlist(400, 1, "stitched-ad");
			const fetch = vi.fn();
			const first = segments(await context._processM3U8(nativeUrl, ad, fetch));
			if (usedEmptyHold) {
				expect(info._EmptyHoldTimelineByUrl.get(nativeUrl).kind).toBe("backup");
			} else {
				expect(info._EmptyHoldTimelineByUrl.size).toBe(0);
			}
			sequence++;
			select();
			const refreshed = segments(
				await context._processM3U8(nativeUrl, ad, fetch),
			);
			expect(refreshed.slice(0, 2)).toEqual(first.slice(1));
			info._LastBackupSearchCompletedAt = 0;
			const selectedAgain = segments(
				await context._processM3U8(nativeUrl, ad, fetch),
			);
			expect(selectedAgain).toEqual(refreshed);
			expect(search).toHaveBeenCalledTimes(2);
			expect(fetch).not.toHaveBeenCalled();
		},
	);

	it("keeps an unowned selected backup out of the response after whitespace cleanup", async () => {
		const { context, info, hold } = setup();
		const processCore = context._processM3U8Core;
		await hold();
		context._processM3U8Core = processCore;
		info.CsaiOnlyThisBreak = true;
		context._findBackupStream = async () => {
			info.LastCleanBackupM3U8 = `${playlist(100)}\n`;
			info.LastCleanBackupAt = Date.now();
			return { type: "site", m3u8: info.LastCleanBackupM3U8 };
		};
		const output = await context._processM3U8(
			nativeUrl,
			playlist(400, 1, "stitched-ad"),
			vi.fn(),
		);
		expect(output).toContain("__ttvab_empty_hold_segment");
		expect(output).not.toContain("https://edge.example/clean-");
		expect(info._EmptyHoldTimelineByUrl.get(nativeUrl).kind).toBe("hold");
	});

	it("keeps matching backup media synchronized across held quality requests", async () => {
		const { context, info, hold, serve } = setup();
		await hold();
		const otherUrl = nativeUrl.replace("native", "720p");
		context._applyEmptyHoldPlaylistContinuity(
			info,
			otherUrl,
			context._createEmptyAdHoldPlaylist(playlist(400), info),
		);
		const first = segments(await serve(playlist(100), "site"));
		const other = segments(
			context._applyEmptyHoldPlaylistContinuity(info, otherUrl, playlist(100)),
		);
		expect(
			other.map(({ url, discontinuity }) => ({ url, discontinuity })),
		).toEqual(first.map(({ url, discontinuity }) => ({ url, discontinuity })));
		const refreshed = segments(await serve(playlist(101), "site"));
		const otherRefresh = segments(
			context._applyEmptyHoldPlaylistContinuity(info, otherUrl, playlist(101)),
		);
		expect(refreshed.slice(0, 2)).toEqual(first.slice(1));
		expect(otherRefresh.slice(0, 2)).toEqual(other.slice(1));
	});

	it("joins an owned quality request to the active backup timeline without another hold", async () => {
		const { context, info, hold, serve } = setup();
		await hold();
		const first = segments(await serve(playlist(100), "site"));
		const otherUrl = nativeUrl.replace("native", "720p");
		info.Urls[otherUrl] = { Resolution: "1280x720", Codecs: codec };
		const other = segments(
			context._applyEmptyHoldPlaylistContinuity(info, otherUrl, playlist(100)),
		);
		expect(
			other.map(({ url, discontinuity }) => ({ url, discontinuity })),
		).toEqual(first.map(({ url, discontinuity }) => ({ url, discontinuity })));
	});

	it("preserves matching backup discontinuities when quality requests see different sliding windows", async () => {
		const { context, info, hold, serve } = setup();
		await hold();
		const otherUrl = nativeUrl.replace("native", "720p");
		info.Urls[otherUrl] = { Resolution: "1280x720", Codecs: codec };
		context._applyEmptyHoldPlaylistContinuity(
			info,
			otherUrl,
			context._createEmptyAdHoldPlaylist(playlist(400), info),
		);
		const firstText = playlist(100)
			.replace("DISCONTINUITY-SEQUENCE:0", "DISCONTINUITY-SEQUENCE:6")
			.replace(
				"#EXTINF:2.000,live\nhttps://edge.example/clean-101",
				"#EXT-X-DISCONTINUITY\n#EXTINF:2.000,live\nhttps://edge.example/clean-101",
			)
			.replaceAll("\n", "\r\n");
		const first = segments(await serve(firstText, "site"));
		const metadata = info.BackupPlaylistMetadata.get(firstText);
		const nextText = playlist(101).replace(
			"DISCONTINUITY-SEQUENCE:0",
			"DISCONTINUITY-SEQUENCE:7",
		);
		const other = segments(
			context._applyEmptyHoldPlaylistContinuity(
				info,
				otherUrl,
				nextText,
				metadata,
			),
		);
		const refreshed = segments(await serve(nextText, "site"));
		expect(refreshed.slice(0, 2)).toEqual(first.slice(1));
		expect(
			other.map(({ url, discontinuity }) => ({ url, discontinuity })),
		).toEqual(
			refreshed.map(({ url, discontinuity }) => ({ url, discontinuity })),
		);
	});

	it("keeps native renditions in the same exact master synchronized after backup recovery", async () => {
		const { context, info, hold, serve } = setup();
		await hold();
		const otherUrl = nativeUrl.replace("native", "720p");
		info.Urls[otherUrl] = { Resolution: "1280x720", Codecs: codec };
		context._applyEmptyHoldPlaylistContinuity(
			info,
			otherUrl,
			context._createEmptyAdHoldPlaylist(playlist(400), info),
		);
		await serve(playlist(100), "site");
		context._applyEmptyHoldPlaylistContinuity(info, otherUrl, playlist(100));
		context._resetStreamAdState(info, true);
		const first = segments(await serve(playlist(200, 3, "native")));
		const other = segments(
			context._applyEmptyHoldPlaylistContinuity(
				info,
				otherUrl,
				playlist(300, 3, "native-other"),
			),
		);
		expect(other[0].discontinuity).toBe(first[0].discontinuity);
		const previousLast = first.at(-1).discontinuity;
		info.UsherBaseUrl += "?token=replacement";
		const replacement = segments(await serve(playlist(201, 3, "replacement")));
		expect(replacement[0].discontinuity).toBeGreaterThan(previousLast);
	});

	it.each([false, true])(
		"keeps an idle native rendition on the current timeline after another break (fallback disabled: %s)",
		async (disabled) => {
			const { context, info, hold, serve } = setup();
			context.state.DisableAutoplayBackup = disabled;
			const otherUrl = nativeUrl.replace("native", "720p");
			info.Urls[otherUrl] = { Resolution: "1280x720", Codecs: codec };
			const apply = (
				url: string,
				text: string,
				metadata: Record<string, unknown> | null = null,
			) => context._applyPlaylistContinuity(info, url, text, metadata);
			await hold();
			apply(otherUrl, context._createEmptyAdHoldPlaylist(playlist(400), info));
			await serve(playlist(100), "site");
			const metadata = info.BackupPlaylistMetadata.get(
				info.LastCleanBackupM3U8,
			);
			apply(otherUrl, playlist(100), metadata);
			context._resetStreamAdState(info, true);
			const firstNative = segments(await serve(playlist(200, 3, "native")));
			const otherNative = segments(apply(otherUrl, playlist(300, 3, "other")));
			expect(otherNative[0].discontinuity).toBe(firstNative[0].discontinuity);
			const nativeOffset =
				info._EmptyHoldTimelineByUrl.get(nativeUrl).mediaOffset;
			expect(nativeOffset).not.toBe(
				info._EmptyHoldTimelineByUrl.get(otherUrl).mediaOffset,
			);

			info.IsShowingAd = true;
			info.VisibleAdStartedAt = Date.now();
			apply(otherUrl, context._createEmptyAdHoldPlaylist(playlist(305), info));
			apply(otherUrl, playlist(306, 3, "second-backup"), {
				...metadata,
				playlistUrl: "https://edge.example/site.m3u8?session=two",
				sessionUrl: "https://usher.ttvnw.net/master.m3u8?session=two",
			});
			context._resetStreamAdState(info, true);
			const current = segments(apply(otherUrl, playlist(310, 3, "other")));
			expect(current[0].discontinuity).toBeGreaterThan(
				firstNative[0].discontinuity,
			);
			const before = JSON.stringify([...info._EmptyHoldTimelineByUrl]);
			expect(() => apply(nativeUrl, playlist(199, 3, "native"))).toThrow(
				"Retired empty hold recovery playlist",
			);
			expect(JSON.stringify([...info._EmptyHoldTimelineByUrl])).toBe(before);

			const rejoinedText = await serve(playlist(211, 3, "native"));
			const rejoined = segments(rejoinedText);
			expect(rejoined[0].discontinuity).toBe(current[0].discontinuity);
			expect(rejoined[0].sequence).toBe(211 + nativeOffset);
			expect(rejoinedText.split("\n")).not.toContain("#EXT-X-DISCONTINUITY");
			expect(
				context._getEmptyHoldUpstreamUrl(
					info,
					`${nativeUrl}&_HLS_msn=${212 + nativeOffset}&_HLS_part=1`,
				),
			).toBe(`${nativeUrl}&_HLS_msn=212&_HLS_part=1`);
			const refreshed = segments(await serve(playlist(212, 3, "native")));
			expect(refreshed.slice(0, 2)).toEqual(rejoined.slice(1));
			expect(info.HevcReloadPendingAfterHold).toBe(false);
		},
	);

	it.each(
		[0, 1000].flatMap((rawOffset) =>
			["LF", "CRLF", "date after EXTINF"].map((format) => ({
				rawOffset,
				format,
			})),
		),
	)(
		"joins a late native rendition without another boundary (raw offset: $rawOffset, $format)",
		async ({ rawOffset, format }) => {
			const { context, info, hold, serve } = setup();
			const otherUrl = nativeUrl.replace("native", "720p");
			const thirdUrl = nativeUrl.replace("native", "480p");
			info.Urls[otherUrl] = { Resolution: "1280x720", Codecs: codec };
			info.Urls[thirdUrl] = { Resolution: "852x480", Codecs: codec };
			const dated = (sequence: number, time: number, prefix = "native") => {
				let text = playlist(sequence, 3, prefix).replace(
					"#EXTINF:",
					`#EXT-X-KEY:METHOD=AES-128,URI="https://edge.example/key"\n#EXTINF:`,
				);
				const date = `#EXT-X-PROGRAM-DATE-TIME:${new Date(time).toISOString()}`;
				text = text.replace(
					"#EXTINF:2.000,live",
					format === "date after EXTINF"
						? `#EXTINF:2.000,live\n${date}`
						: `${date}\n#EXTINF:2.000,live`,
				);
				return format === "CRLF" ? text.replaceAll("\n", "\r\n") : text;
			};
			const start = Date.parse("2026-10-06T09:06:20Z");
			await hold();
			await serve(playlist(5500), "site");
			context._applyPlaylistContinuity(
				info,
				otherUrl,
				info.LastCleanBackupM3U8,
				info.BackupPlaylistMetadata.get(info.LastCleanBackupM3U8),
			);
			context._applyPlaylistContinuity(
				info,
				thirdUrl,
				info.LastCleanBackupM3U8,
				info.BackupPlaylistMetadata.get(info.LastCleanBackupM3U8),
			);
			context._resetStreamAdState(info, true);
			await serve(dated(5600, start));
			const current = segments(await serve(dated(5668, start + 136000)));
			const joined = context._applyPlaylistContinuity(
				info,
				otherUrl,
				dated(5669 + rawOffset, start + 138000, "other"),
			);
			expect(segments(joined)[0].sequence).toBe(current[1].sequence);
			expect(segments(joined)[0].discontinuity).toBe(current[1].discontinuity);
			expect(joined.split("\n")).not.toContain("#EXT-X-DISCONTINUITY");
			expect(
				[...joined.matchAll(/IV=0x([a-f0-9]{32})/gi)].map((match) =>
					parseInt(match[1], 16),
				),
			).toEqual([5669, 5670, 5671].map((sequence) => sequence + rawOffset));
			const refreshed = context._applyPlaylistContinuity(
				info,
				otherUrl,
				dated(5670 + rawOffset, start + 140000, "other"),
			);
			expect(segments(refreshed).slice(0, 2)).toEqual(
				segments(joined).slice(1),
			);
			expect(
				context._getEmptyHoldUpstreamUrl(
					info,
					`${otherUrl}&_HLS_msn=${segments(joined).at(-1).sequence + 1}`,
				),
			).toBe(`${otherUrl}&_HLS_msn=${5672 + rawOffset}`);
			const latest = segments(await serve(dated(5700, start + 200000)));
			const third = context._applyPlaylistContinuity(
				info,
				thirdUrl,
				dated(5701 + rawOffset * 2 + 37, start + 202000, "third"),
			);
			expect(segments(third)[0].sequence).toBe(latest[1].sequence);
			expect(segments(third)[0].discontinuity).toBe(latest[1].discontinuity);
			expect(third.split("\n")).not.toContain("#EXT-X-DISCONTINUITY");
		},
	);

	it.each([
		"undated",
		"different master",
		"different time",
		"different duration",
		"different discontinuity",
		"vod",
		"blocking disabled",
	])(
		"does not borrow native numbering without matching live broadcast ownership: %s",
		async (mode) => {
			const { context, info, hold, serve } = setup();
			const otherUrl = nativeUrl.replace("native", "720p");
			info.Urls[otherUrl] = { Resolution: "1280x720", Codecs: codec };
			await hold();
			await serve(playlist(5500), "site");
			context._applyPlaylistContinuity(
				info,
				otherUrl,
				info.LastCleanBackupM3U8,
				info.BackupPlaylistMetadata.get(info.LastCleanBackupM3U8),
			);
			context._resetStreamAdState(info, true);
			const date = "#EXT-X-PROGRAM-DATE-TIME:2026-10-06T09:06:20Z";
			const text = playlist(5600, 3, "native").replace(
				"#EXTINF:",
				`${date}\n#EXTINF:`,
			);
			const current = segments(await serve(text));
			let incoming = text;
			if (mode === "undated") incoming = text.replace(`${date}\n`, "");
			if (mode === "different master") info.UsherBaseUrl += "?token=other";
			if (mode === "different time")
				incoming = text.replace("09:06:20Z", "09:06:21Z");
			if (mode === "different duration")
				incoming = text.replaceAll("2.000", "2.100");
			if (mode === "different discontinuity")
				incoming = text.replace(
					"DISCONTINUITY-SEQUENCE:0",
					"DISCONTINUITY-SEQUENCE:1",
				);
			if (mode === "vod") info.MediaType = "vod";
			if (mode === "blocking disabled")
				context.state.IsAdStrippingEnabled = false;
			const joined = context._applyPlaylistContinuity(info, otherUrl, incoming);
			if (mode === "blocking disabled") {
				expect(joined).toBe(incoming);
				return;
			}
			expect(joined.split("\n")).toContain("#EXT-X-DISCONTINUITY");
			expect(segments(joined)[0].discontinuity).toBeGreaterThanOrEqual(
				current[0].discontinuity,
			);
		},
	);

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
		expect(info._LastServedPlaylistKind).toBe("hold");
		expect(
			context._resetWorkerAdCycleState({
				mediaKey: info.MediaKey,
				cycleStartedAt: info.VisibleAdStartedAt,
			}),
		).toBe(true);
		expect(info._LastServedPlaylistKind).toBe("hold");
		const native = segments(await serve(playlist(10)));
		expect(info._LastServedPlaylistKind).toBe("native");
		expect(native[0].sequence).toBeGreaterThan(lastHold.sequence);
		context._resetStreamAdState(info);
		expect(info._LastServedPlaylistKind).toBeNull();
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

	it("translates native requests after a high-numbered source joins the hold timeline", async () => {
		const { context, info, hold, serve } = setup();
		await hold();
		context._resetStreamAdState(info, true);
		const native = segments(await serve(playlist(250000)));
		const nextSequence = native.at(-1).sequence + 1;
		expect(nextSequence).toBeLessThan(250000);
		expect(
			context._getEmptyHoldUpstreamUrl(
				info,
				`${nativeUrl}&_HLS_msn=${nextSequence}&_HLS_part=2&_HLS_skip=YES`,
			),
		).toBe(`${nativeUrl}&_HLS_msn=250003&_HLS_part=2`);
		const refreshed = segments(await serve(playlist(250001)));
		expect(refreshed.slice(0, 2)).toEqual(native.slice(1));
		await expect(serve(playlist(250000))).rejects.toMatchObject({
			name: "AbortError",
		});
	});

	it("decrypts a high-numbered backup with its original IV after contiguous handoff", async () => {
		const { hold, serve } = setup();
		const held = segments(await hold());
		const sourceSequence = 8990;
		const source = playlist(sourceSequence).replace(
			"#EXTINF:",
			'#EXT-X-KEY:METHOD=AES-128,URI="https://edge.example/key"\n#EXTINF:',
		);
		const output = await serve(source, "site");
		expect(segments(output)[0].sequence).toBe(held.at(-1).sequence + 1);
		const key = Buffer.alloc(16, 7);
		const originalIv = Buffer.alloc(16);
		originalIv.writeUInt32BE(sourceSequence, 12);
		const plaintext = Buffer.from(
			"original audio and video encryption sequence",
		);
		const cipher = createCipheriv("aes-128-cbc", key, originalIv);
		const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
		const returnedIv = Buffer.from(
			output.match(/IV=0x([a-f0-9]{32})/i)[1],
			"hex",
		);
		const decipher = createDecipheriv("aes-128-cbc", key, returnedIv);
		expect(
			Buffer.concat([decipher.update(encrypted), decipher.final()]),
		).toEqual(plaintext);
		const refreshed = await serve(
			playlist(sourceSequence + 1).replace(
				"#EXTINF:",
				'#EXT-X-KEY:METHOD=AES-128,URI="https://edge.example/key"\n#EXTINF:',
			),
			"site",
		);
		expect(
			[...refreshed.matchAll(/IV=0x([a-f0-9]{32})/gi)].map((match) =>
				parseInt(match[1], 16),
			),
		).toEqual([8991, 8992, 8993]);
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

	it.each([0, 250000])(
		"keeps rendition reports in the presented native numbering with source offset %s",
		async (sourceOffset) => {
			const { context, info, hold, serve } = setup();
			await hold();
			const otherUrl = nativeUrl.replace("native", "720p");
			context._applyEmptyHoldPlaylistContinuity(
				info,
				otherUrl,
				context._createEmptyAdHoldPlaylist(playlist(400), info),
			);
			const other = segments(
				context._applyEmptyHoldPlaylistContinuity(
					info,
					otherUrl,
					playlist(20 + sourceOffset),
				),
			);
			const report = `#EXT-X-RENDITION-REPORT:URI="${otherUrl}",LAST-MSN=${22 + sourceOffset},LAST-PART=1`;
			const output = await serve(`${playlist(10 + sourceOffset)}\n${report}`);
			expect(output).toContain(
				`URI="${otherUrl}",LAST-MSN=${other.at(-1).sequence},LAST-PART=1`,
			);
		},
	);

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
		expect(hold.url).toContain("__ttvab_empty_hold_segment.ts");
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
