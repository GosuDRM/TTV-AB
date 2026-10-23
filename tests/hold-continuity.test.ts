import { createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
	vi.useRealTimers();
});

function useFakeClock(context: Record<string, unknown>) {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
	Object.assign(context, { Date, setTimeout, clearTimeout });
}

async function settleOnFakeClock<T>(promise: Promise<T>) {
	let settled = false;
	promise.then(
		() => {
			settled = true;
		},
		() => {
			settled = true;
		},
	);
	for (let step = 0; !settled && step < 200; step++)
		await vi.advanceTimersByTimeAsync(250);
	return promise;
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
	it.each(["autoplay", "site"])(
		"keeps the hold advancing until the selected %s backup reaches fresh broadcast content",
		async (type) => {
			const { context, info, fetch, serve, hold } = setup();
			let now = Date.now();
			context.Date = class extends Date {
				static now() {
					return now;
				}
			};
			context.self = context;
			context._postWorkerBridgeMessage = vi.fn();
			context._log = vi.fn();
			context.state.DisableAutoplayBackup = type !== "autoplay";
			const core = context._processM3U8Core;
			const start = Date.parse("2026-10-12T03:45:24.423Z");
			const dated = (sequence: number, offset: number, prefix: string) =>
				playlist(sequence, 7, prefix)
					.replaceAll("#EXTINF:2.000", "#EXTINF:4.167")
					.replace("TARGETDURATION:2", "TARGETDURATION:5")
					.replace(
						"#EXTINF:",
						`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + offset).toISOString()}\n#EXTINF:`,
					);
			await serve(dated(690, 0, "native"));
			const firstHold = segments(await hold());
			const holdWindow = info._EmptyAdHoldWindow;
			context._processM3U8Core = core;
			let offset = 0;
			let selection = 0;
			const select = () =>
				context._commitBackupPlaylist(
					info,
					dated(690 + offset, offset * 4167, "backup"),
					++selection,
					{
						playerType: type,
						resolution: type === "autoplay" ? "640x360" : "1920x1080",
						codecFamily: "avc",
						codec: "avc1.4d401f",
						playlistUrl: `https://edge.example/${type}.m3u8?token=private`,
						sessionUrl: "https://usher.ttvnw.net/master.m3u8?token=private",
					},
				);
			context._findBackupStream = vi.fn(async () => ({
				type,
				m3u8: select(),
			}));
			context._refreshActiveBackupMediaPlaylist = vi.fn(async () => select());
			const ad = playlist(697, 3, "stitched-ad").replaceAll(
				",live",
				",stitched-ad",
			);
			const held = [];
			for (let poll = 0; poll < 5; poll++) {
				now += 1100;
				const output = await context._processM3U8(nativeUrl, ad, fetch);
				expect(output).toContain("__ttvab_empty_hold_segment.ts");
				expect(output).not.toMatch(/backup-|stitched-ad/);
				held.push(segments(output));
				expect(info._EmptyAdHoldWindow).toBe(holdWindow);
				expect(info._LivePlaylistTimeline.lastEndTime).toBe(start + 7 * 4167);
				expect(info._LastServedPlaylistKind).toBe("hold");
				expect(context.state.PinnedBackupPlayerType).toBeNull();
			}
			expect(held[0][0]).toEqual(firstHold[0]);
			expect(held[0].at(-1).sequence).toBe(firstHold.at(-1).sequence + 1);
			for (let poll = 1; poll < held.length; poll++) {
				expect(held[poll].at(-1).sequence).toBe(
					held[poll - 1].at(-1).sequence + 1,
				);
				expect(held[poll - 1]).toEqual(
					expect.arrayContaining(held[poll].slice(0, -1)),
				);
				expect(held[poll][0].sequence).toBeLessThan(
					held[poll - 1].at(-1).sequence,
				);
			}
			expect(context._refreshActiveBackupMediaPlaylist).toHaveBeenCalledTimes(
				4,
			);
			expect(context._postWorkerBridgeMessage).not.toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({ key: "BackupPlayerTypeSelected" }),
			);
			const waiting = context._log.mock.calls
				.map(([message]) => message)
				.filter((message) =>
					message.startsWith("[Continuity] waiting-for-live-backup "),
				);
			expect(waiting).toHaveLength(1);
			expect(waiting[0]).not.toMatch(/https:|token=|private/);
			expect(
				JSON.parse(waiting[0].split("waiting-for-live-backup ")[1]),
			).toMatchObject({
				mediaKey: info.MediaKey,
				source: type,
				reason: "behind-served-time",
				servedSequence: null,
				holdSequence: held[0][0].sequence,
				holdLastSequence: held[0].at(-1).sequence,
			});
			offset = 1;
			now += 1100;
			const output = await context._processM3U8(nativeUrl, ad, fetch);
			expect(output).not.toMatch(/__ttvab_empty_hold_segment|stitched-ad/);
			expect(segments(output)).toHaveLength(1);
			expect(segments(output)[0]).toMatchObject({
				url: "https://edge.example/backup-697.ts",
				sequence: held.at(-1).at(-1).sequence + 1,
			});
			expect(info._LastServedPlaylistKind).toBe("backup");
			expect(info._EmptyAdHoldWindow).toBeNull();
			expect(context.state.PinnedBackupPlayerType).toBe(type);
			expect(context._postWorkerBridgeMessage).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					key: "BackupPlayerTypeSelected",
					value: type,
				}),
			);
		},
	);

	it.each(["navigation", "page generation", "new cycle", "loader", "abort"])(
		"does not advance a hold for a delayed backup after %s",
		async (mode) => {
			const { context, info, serve, hold, fetch } = setup();
			const native = playlist(400).replace(
				"#EXTINF:",
				"#EXT-X-PROGRAM-DATE-TIME:2026-10-12T03:45:24Z\n#EXTINF:",
			);
			await serve(native);
			await hold();
			const before = JSON.stringify(info._EmptyAdHoldWindow);
			const sequence = info._EmptyAdHoldMediaSequence;
			const backup = native.replaceAll("clean-", "backup-");
			context._rememberBackupPlaylistMetadata(info, backup, "avc", codec, {
				playerType: "autoplay",
				playlistUrl: "https://edge.example/autoplay.m3u8?session=owned",
			});
			let complete: (value: string) => void;
			context._processM3U8Core = () =>
				new Promise((resolve) => {
					complete = resolve;
				});
			const controller = new AbortController();
			const pending = context._processM3U8(
				nativeUrl,
				native,
				fetch,
				controller.signal,
			);
			const rejected = expect(pending).rejects.toMatchObject({
				name: "AbortError",
			});
			if (mode === "navigation") context.state.PageMediaKey = "live:other";
			if (mode === "page generation")
				context.state.PagePlaybackContextGeneration++;
			if (mode === "new cycle") info.VisibleAdStartedAt++;
			if (mode === "loader") info.NativeRecoveryLoaderEpoch++;
			if (mode === "abort") controller.abort();
			complete(backup);
			await rejected;
			expect(JSON.stringify(info._EmptyAdHoldWindow)).toBe(before);
			expect(info._EmptyAdHoldMediaSequence).toBe(sequence);
		},
	);

	it.each([
		"HEVC",
		"AV1",
		"native map",
		"backup map",
		"no hold",
		"ambiguous timestamps",
	])(
		"does not substitute a transport hold for a rejected %s handoff",
		async (mode) => {
			const { context, info, serve, hold, fetch } = setup();
			const native = playlist(400).replace(
				"#EXTINF:",
				"#EXT-X-PROGRAM-DATE-TIME:2026-10-12T03:45:24Z\n#EXTINF:",
			);
			await serve(native);
			if (mode !== "no hold") await hold();
			const before = JSON.stringify(info._EmptyAdHoldWindow);
			let backup = native.replaceAll("clean-", "backup-");
			const mapped = (text: string) =>
				text.replace("#EXTINF:", '#EXT-X-MAP:URI="init.mp4"\n#EXTINF:');
			if (mode === "backup map") backup = mapped(backup);
			if (mode === "ambiguous timestamps")
				backup = `${backup}\n#EXT-X-DISCONTINUITY\n#EXTINF:2,live\nhttps://edge.example/undated.ts`;
			const backupCodec =
				mode === "HEVC"
					? "hev1.1.6.L153.B0"
					: mode === "AV1"
						? "av01.0.13M.08"
						: codec;
			info.Urls[nativeUrl].Codecs = backupCodec;
			if (mode === "HEVC" || mode === "AV1")
				info.EnhancedDecoderCodec = backupCodec;
			context._rememberBackupPlaylistMetadata(info, backup, null, backupCodec, {
				playerType: "autoplay",
				playlistUrl: "https://edge.example/autoplay.m3u8?session=owned",
			});
			context._processM3U8Core = async () => backup;
			await expect(
				context._processM3U8(
					nativeUrl,
					mode === "native map" ? mapped(native) : native,
					fetch,
				),
			).rejects.toMatchObject({ name: "AbortError" });
			expect(JSON.stringify(info._EmptyAdHoldWindow)).toBe(before);
			expect(info.HevcReloadPendingAfterHold).toBe(false);
		},
	);

	it("does not replay prefetched native content when the next poll starts an ad", async () => {
		const { context, info, fetch } = setup();
		let now = Date.now();
		context.Date = class extends Date {
			static now() {
				return now;
			}
		};
		info.IsShowingAd = false;
		info.VisibleAdStartedAt = 0;
		context.state.CurrentAdMediaKey = null;
		context.state.CurrentAdChannel = null;
		context.state.DisableAutoplayBackup = false;
		const start = Date.parse("2026-10-08T01:14:30Z");
		const dated = (
			sequence: number,
			offset: number,
			count: number,
			prefix: string,
		) =>
			playlist(sequence, count, prefix).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + offset).toISOString()}\n#EXTINF:`,
			);
		const native = `${dated(400, 0, 3, "native")}\n#EXT-X-TWITCH-PREFETCH:https://edge.example/native-403.ts\n#EXT-X-TWITCH-PREFETCH:https://edge.example/native-404.ts`;
		expect(await context._processM3U8(nativeUrl, native, fetch)).toBe(native);
		now += 3500;
		const backup = dated(100, 6000, 5, "backup");
		context._findBackupStream = vi.fn(async () => {
			info.LastCleanBackupM3U8 = backup;
			info.LastCleanBackupAt = now;
			info.LastCleanBackupPlayerType = "autoplay";
			info.LastCleanBackupResolution = "640x360";
			info.LastCleanBackupCodec = "avc1.4d401f";
			info.LastCleanBackupCodecFamily = "avc";
			context._rememberBackupPlaylistMetadata(
				info,
				backup,
				"avc",
				"avc1.4d401f",
				{
					playerType: "autoplay",
					resolution: "640x360",
					playlistUrl: "https://edge.example/autoplay.m3u8?session=one",
					sessionUrl: "https://usher.ttvnw.net/master.m3u8?session=one",
				},
			);
			return { m3u8: backup, type: "autoplay", resolution: "640x360" };
		});
		const ad = `${dated(403, 6000, 2, "native")}\n#EXT-X-DISCONTINUITY\n#EXTINF:2.000,stitched-ad\nhttps://edge.example/stitched-ad.ts`;
		const output = await context._processM3U8(nativeUrl, ad, fetch);
		expect(output).not.toContain("stitched-ad");
		expect(output).not.toContain("backup-100.ts");
		expect(output).not.toContain("backup-101.ts");
		expect(output).toContain("backup-102.ts");
		expect(segments(output)[0].sequence).toBe(405);
		expect(info._LivePlaylistTimeline.minimumTime).toBe(start + 10000);
	});

	it("uses confirmed prefetch durations without claiming later unserved segments", async () => {
		const { context, info, serve } = setup();
		const start = Date.parse("2026-10-08T01:14:30Z");
		const native = `${playlist(400).replace("#EXTINF:", `#EXT-X-PROGRAM-DATE-TIME:${new Date(start).toISOString()}\n#EXTINF:`)}\n#EXT-X-TWITCH-PREFETCH:https://edge.example/clean-403.ts\n#EXT-X-TWITCH-PREFETCH:https://edge.example/clean-404.ts`;
		await serve(native);
		const confirmed = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:6",
			"#EXT-X-MEDIA-SEQUENCE:403",
			`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + 6000).toISOString()}`,
			"#EXTINF:1.6,live",
			"https://edge.example/clean-403.ts",
			"#EXTINF:2.4,live",
			"https://edge.example/clean-404.ts",
			"#EXTINF:6,live",
			"https://edge.example/unserved-405.ts",
		].join("\r\n");
		context._observeServedPrefetchTimeline(
			info,
			`${nativeUrl}&_HLS_msn=403`,
			confirmed,
		);
		expect(info._LivePlaylistTimeline.lastEndTime).toBe(start + 10000);
		const output = await serve(
			playlist(100, 3, "backup").replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + 8000).toISOString()}\n#EXTINF:`,
			),
			"autoplay",
		);
		expect(output).not.toContain("backup-100.ts");
		expect(output).toContain("backup-101.ts");
		expect(output).toContain("backup-102.ts");
		expect(info._LivePlaylistTimeline.prefetchedSegments).toEqual([]);
	});

	it.each([
		"other session",
		"other segment",
		"undated",
		"undated discontinuity",
		"disabled",
		"vod",
	])("does not extend the prefetch boundary from %s media", async (mode) => {
		const { context, info, serve } = setup();
		const start = Date.parse("2026-10-08T01:14:30Z");
		const dated = (sequence: number, offset: number) =>
			playlist(sequence).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + offset).toISOString()}\n#EXTINF:`,
			);
		await serve(
			`${dated(400, 0)}\n#EXT-X-TWITCH-PREFETCH:https://edge.example/clean-403.ts`,
		);
		const previous = info._LivePlaylistTimeline;
		let text = dated(402, 4000);
		if (mode === "other segment")
			text = text.replace("clean-403.ts", "other-403.ts");
		if (mode === "undated")
			text = text.replace(/#EXT-X-PROGRAM-DATE-TIME:[^\n]+\n/, "");
		if (mode === "undated discontinuity")
			text = text.replace(
				"#EXTINF:2.000,live\nhttps://edge.example/clean-403.ts",
				"#EXT-X-DISCONTINUITY\n#EXTINF:2.000,live\nhttps://edge.example/clean-403.ts",
			);
		if (mode === "disabled") context.state.IsAdStrippingEnabled = false;
		if (mode === "vod") info.MediaType = "vod";
		context._observeServedPrefetchTimeline(
			info,
			mode === "other session"
				? nativeUrl.replace("owned", "other")
				: nativeUrl,
			text,
		);
		expect(info._LivePlaylistTimeline).toBe(previous);
	});

	it.each(["aborted", "new loader", "new cycle"])(
		"does not let an %s native request update served prefetch timing",
		async (mode) => {
			const { context, info, serve, fetch } = setup();
			const processCore = context._processM3U8Core;
			const start = Date.parse("2026-10-08T01:14:30Z");
			const native = `${playlist(400).replace("#EXTINF:", `#EXT-X-PROGRAM-DATE-TIME:${new Date(start).toISOString()}\n#EXTINF:`)}\n#EXT-X-TWITCH-PREFETCH:https://edge.example/clean-403.ts`;
			await serve(native);
			const previous = info._LivePlaylistTimeline;
			const controller = new AbortController();
			const requestContext = {
				backupSearchEpoch: info.BackupSearchEpoch,
				loaderEpoch: info.NativeRecoveryLoaderEpoch,
				cycleStartedAt: info.VisibleAdStartedAt,
			};
			if (mode === "aborted") controller.abort();
			if (mode === "new loader") info.NativeRecoveryLoaderEpoch++;
			if (mode === "new cycle") info.BackupSearchEpoch++;
			const completed = playlist(403).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + 6000).toISOString()}\n#EXTINF:`,
			);
			await expect(
				processCore(
					nativeUrl,
					completed,
					fetch,
					requestContext,
					controller.signal,
				),
			).rejects.toMatchObject({ name: "AbortError" });
			expect(info._LivePlaylistTimeline).toBe(previous);
		},
	);

	it("keeps exact prefetch ownership across native renditions and bounds retained URLs", async () => {
		const { context, info } = setup();
		const start = Date.parse("2026-10-08T01:14:30Z");
		const dated = playlist(400).replace(
			"#EXTINF:",
			`#EXT-X-PROGRAM-DATE-TIME:${new Date(start).toISOString()}\n#EXTINF:`,
		);
		for (let index = 0; index < 40; index++) {
			context._applyPlaylistContinuity(
				info,
				`${nativeUrl}&rendition=${index}`,
				`${dated}\n#EXT-X-TWITCH-PREFETCH:https://edge.example/rendition-${index}.ts`,
			);
		}
		expect(info._LivePlaylistTimeline.prefetchedSegments).toHaveLength(32);
		const completed = (index: number) =>
			`#EXTM3U\n#EXT-X-PROGRAM-DATE-TIME:${new Date(start + 6000).toISOString()}\n#EXTINF:2.000,live\nhttps://edge.example/rendition-${index}.ts`;
		context._observeServedPrefetchTimeline(
			info,
			`${nativeUrl}&rendition=0`,
			completed(0),
		);
		expect(info._LivePlaylistTimeline.lastEndTime).toBe(start + 6000);
		context._observeServedPrefetchTimeline(
			info,
			`${nativeUrl}&rendition=8`,
			completed(8),
		);
		expect(info._LivePlaylistTimeline.lastEndTime).toBe(start + 8000);
		context._resetStreamAdState(info);
		expect(info._LivePlaylistTimeline).toBeNull();
	});

	it("preserves the served backup prefetch boundary through promotion and native return", async () => {
		const { context, info, serve } = setup();
		const start = Date.parse("2026-10-08T01:14:30Z");
		const dated = (sequence: number, offset: number, prefix: string) =>
			playlist(sequence, 3, prefix).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + offset).toISOString()}\n#EXTINF:`,
			);
		await serve(dated(400, 0, "native"));
		const low = `${dated(100, 6000, "low")}\n#EXT-X-TWITCH-PREFETCH:https://edge.example/low-103.ts\n#EXT-X-TWITCH-PREFETCH:https://edge.example/low-104.ts`;
		const lowOutput = await serve(low, "autoplay");
		const metadata = info.BackupPlaylistMetadata.get(low);
		context._commitBackupPlaylist(
			info,
			dated(103, 12000, "low"),
			1,
			metadata,
			true,
		);
		expect(info._LivePlaylistTimeline.lastEndTime).toBe(start + 16000);
		const high = await serve(
			`${dated(200, 12000, "high")}\n#EXT-X-TWITCH-PREFETCH:https://edge.example/high-203.ts`,
			"site",
		);
		expect(high).not.toContain("high-200.ts");
		expect(high).not.toContain("high-201.ts");
		expect(high).toContain("high-202.ts");
		expect(segments(high)[0].sequence).toBe(
			segments(lowOutput).at(-1).sequence + 1,
		);
		context._commitBackupPlaylist(
			info,
			dated(203, 18000, "high"),
			2,
			info.BackupPlaylistMetadata.get(info.LastCleanBackupM3U8),
			true,
		);
		expect(info._LivePlaylistTimeline.lastEndTime).toBe(start + 20000);
		context._resetStreamAdState(info, true);
		const native = await serve(dated(600, 18000, "native"));
		expect(native).not.toContain("native-600.ts");
		expect(native).toContain("native-601.ts");
		expect(segments(native)[0].sequence).toBe(
			segments(high).at(-1).sequence + 1,
		);
	});

	it("does not replay prefetched media when an ad-marked backup is replaced by a new session", async () => {
		const { serve } = setup();
		const start = Date.parse("2026-10-12T16:15:00Z");
		const dated = (sequence: number, prefix: string, timeIndex = sequence) =>
			playlist(sequence, 3, prefix).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + (timeIndex - 100) * 2000).toISOString()}\n#EXTINF:`,
			);
		const prefetch = (prefix: string, first: number) =>
			[first, first + 1]
				.map(
					(sequence) =>
						`\n#EXT-X-TWITCH-PREFETCH:https://edge.example/${prefix}-${sequence}.ts`,
				)
				.join("");
		const numberOf = (text: string, name: string) =>
			segments(text).find((entry) => entry.url.endsWith(`/${name}.ts`))
				?.sequence;
		await serve(dated(100, "native"));
		const first = await serve(
			dated(101, "a") + prefetch("a", 104),
			"autoplay",
			"one",
		);
		const second = await serve(
			dated(102, "b") + prefetch("b", 105),
			"autoplay",
			"two",
		);
		expect(second).not.toContain("b-103.ts");
		expect(numberOf(second, "b-104")).toBe(numberOf(first, "a-104"));
		expect(numberOf(second, "b-105")).toBe(numberOf(first, "a-105"));
		expect(numberOf(second, "b-106")).toBe(numberOf(first, "a-105") + 1);
		expect(segments(second)[0].discontinuity).toBe(
			segments(first).at(-1).discontinuity + 1,
		);
		const refreshed = await serve(
			dated(103, "b") + prefetch("b", 106),
			"autoplay",
			"two",
		);
		expect(numberOf(refreshed, "b-105")).toBe(numberOf(first, "a-105"));
		const third = await serve(
			dated(104, "c") + prefetch("c", 107),
			"autoplay",
			"three",
		);
		expect(third).not.toContain("c-105.ts");
		expect(numberOf(third, "c-106")).toBe(numberOf(refreshed, "b-106"));
		expect(numberOf(third, "c-107")).toBe(numberOf(refreshed, "b-107"));

		const unaligned = setup();
		await unaligned.serve(dated(100, "native"));
		const offered = await unaligned.serve(
			dated(101, "a") + prefetch("a", 104),
			"autoplay",
			"one",
		);
		const joined = await unaligned.serve(
			dated(502, "b", 102) + prefetch("b", 505),
			"autoplay",
			"two",
		);
		expect(segments(joined)[0].url).toContain("b-504.ts");
		expect(numberOf(joined, "b-504")).toBe(numberOf(offered, "a-104"));
		expect(numberOf(joined, "b-505")).toBe(numberOf(offered, "a-105"));
		expect(numberOf(joined, "b-506")).toBe(numberOf(offered, "a-105") + 1);
	});

	describe("source changes at the served end", () => {
		const start = Date.parse("2026-10-14T06:30:27.646Z");
		const dated = (
			sequence: number,
			prefix: string,
			timeIndex = sequence,
			shiftMs = 0,
		) =>
			playlist(sequence, 3, prefix).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + (timeIndex - 100) * 2000 + shiftMs).toISOString()}\n#EXTINF:`,
			);
		const prefetch = (prefix: string, first: number) =>
			[first, first + 1]
				.map(
					(sequence) =>
						`\n#EXT-X-TWITCH-PREFETCH:https://edge.example/${prefix}-${sequence}.ts`,
				)
				.join("");
		const numberOf = (text: string, name: string) =>
			segments(text).find((entry) => entry.url.endsWith(`/${name}.ts`))
				?.sequence;

		it.each([
			["shares", 101],
			["does not share", 5201],
		])(
			"starts a backup that %s native numbering in the slots native prefetch already used",
			async (_numbering, backupFirst) => {
				const { context, info, serve } = setup();
				context._log = vi.fn();
				const native = await serve(
					dated(100, "native") + prefetch("native", 103),
				);
				const backup = await serve(
					dated(backupFirst, "a", 101) + prefetch("a", backupFirst + 3),
					"autoplay",
				);
				expect(backup).not.toContain(`a-${backupFirst + 1}.ts`);
				expect(numberOf(backup, `a-${backupFirst + 2}`)).toBe(
					numberOf(native, "native-103"),
				);
				expect(numberOf(backup, `a-${backupFirst + 3}`)).toBe(
					numberOf(native, "native-104"),
				);
				expect(numberOf(backup, `a-${backupFirst + 4}`)).toBe(
					numberOf(native, "native-104") + 1,
				);
				expect(segments(backup)[0].discontinuity).toBeGreaterThan(
					segments(native).at(-1).discontinuity,
				);
				const handoff = JSON.parse(
					String(
						vi
							.mocked(context._log)
							.mock.calls.find(([message]) =>
								String(message).startsWith("[Continuity] handoff "),
							)?.[0],
					).slice("[Continuity] handoff ".length),
				);
				expect(handoff).toMatchObject({
					cutoffSequence: numberOf(native, "native-102"),
					servedSequence: numberOf(native, "native-103"),
				});
				expect(info._LivePlaylistTimeline.lastEndSequence).toBe(
					numberOf(backup, `a-${backupFirst + 2}`),
				);
			},
		);

		it("returns to native after a backup in the slots backup prefetch already used", async () => {
			const { context, info, serve } = setup();
			await serve(dated(100, "native"));
			const backup = await serve(dated(101, "a") + prefetch("a", 104), "site");
			context._resetStreamAdState(info, true);
			const native = await serve(
				dated(102, "native", 102, 235) + prefetch("native", 105),
			);
			expect(native).not.toContain("native-103.ts");
			expect(numberOf(native, "native-104")).toBe(numberOf(backup, "a-104"));
			expect(numberOf(native, "native-106")).toBe(
				numberOf(backup, "a-105") + 1,
			);
			expect(segments(native)[0].discontinuity).toBeGreaterThan(
				segments(backup).at(-1).discontinuity,
			);
		});

		it("joins after prefetch confirmed by a later poll of the old source", async () => {
			const { context, info, serve } = setup();
			const native = await serve(
				dated(100, "native") + prefetch("native", 103),
			);
			context._observeServedPrefetchTimeline(
				info,
				nativeUrl,
				dated(101, "native"),
			);
			expect(info._LivePlaylistTimeline.lastEndTime).toBe(start + 8000);
			expect(info._LivePlaylistTimeline.lastEndSequence).toBe(
				numberOf(native, "native-103"),
			);
			const backup = await serve(
				dated(102, "a") + prefetch("a", 105),
				"autoplay",
			);
			expect(backup).not.toContain("a-103.ts");
			expect(numberOf(backup, "a-104")).toBe(numberOf(native, "native-104"));
		});

		it("keeps numbering after served prefetch when the backup starts a full segment after the served end", async () => {
			const { serve } = setup();
			const native = await serve(
				dated(100, "native") + prefetch("native", 103),
			);
			const backup = await serve(dated(104, "a"), "autoplay");
			expect(segments(backup)[0].url).toContain("a-104.ts");
			expect(segments(backup)[0].sequence).toBe(
				segments(native).at(-1).sequence + 1,
			);
		});

		it("keeps numbering after a silent hold", async () => {
			const { context, info, serve } = setup();
			await serve(dated(100, "native") + prefetch("native", 103));
			const hold = await serve(
				context._createEmptyAdHoldPlaylist(playlist(103), info),
			);
			const backup = await serve(dated(101, "a"), "autoplay");
			expect(backup).not.toContain("__ttvab_empty_hold_segment.ts");
			expect(segments(backup)[0].sequence).toBe(
				segments(hold).at(-1).sequence + 1,
			);
		});

		it.each([
			["shares", 100],
			["does not share", 5200],
		])(
			"starts a backup that %s native numbering through its prefetch when it is level with the served end",
			async (_numbering, backupFirst) => {
				const { context, serve } = setup();
				context._log = vi.fn();
				const native = await serve(
					dated(100, "native") + prefetch("native", 103),
				);
				const backup = await serve(
					dated(backupFirst, "a", 100) + prefetch("a", backupFirst + 3),
					"autoplay",
				);
				expect(backup).not.toContain(`a-${backupFirst + 1}.ts`);
				expect(numberOf(backup, `a-${backupFirst + 2}`)).toBe(
					numberOf(native, "native-102"),
				);
				expect(numberOf(backup, `a-${backupFirst + 3}`)).toBe(
					numberOf(native, "native-103"),
				);
				expect(numberOf(backup, `a-${backupFirst + 4}`)).toBe(
					numberOf(native, "native-104"),
				);
				expect(segments(backup)[0].discontinuity).toBeGreaterThan(
					segments(native).at(-1).discontinuity,
				);
				const handoff = JSON.parse(
					String(
						vi
							.mocked(context._log)
							.mock.calls.find(([message]) =>
								String(message).startsWith("[Continuity] handoff "),
							)?.[0],
					).slice("[Continuity] handoff ".length),
				);
				expect(handoff).toMatchObject({
					cutoffSequence: numberOf(native, "native-102"),
					servedSequence: numberOf(native, "native-102"),
					boundaryMs: 0,
					overlapMs: 0,
				});
			},
		);

		it("keeps waiting for a level backup that lists no prefetch", async () => {
			const { context, info, serve } = setup();
			await serve(dated(100, "native") + prefetch("native", 103));
			const level = dated(100, "a");
			context._rememberBackupPlaylistMetadata(info, level, "avc", codec, {
				playerType: "autoplay",
				resolution: "1920x1080",
				playlistUrl: "https://edge.example/autoplay.m3u8?session=one",
				sessionUrl: "https://usher.ttvnw.net/master.m3u8?session=one",
			});
			const timeline = info._LivePlaylistTimeline;
			expect(() =>
				context._applyPlaylistContinuity(
					info,
					nativeUrl,
					level,
					info.BackupPlaylistMetadata.get(level),
				),
			).toThrow("Live handoff playlist is behind the served broadcast time");
			expect(info._LivePlaylistTimeline).toBe(timeline);
		});

		it("returns to native through its prefetch when it is level with the backup", async () => {
			const { context, info, serve } = setup();
			await serve(dated(100, "native"));
			const backup = await serve(dated(101, "a") + prefetch("a", 104), "site");
			context._resetStreamAdState(info, true);
			const native = await serve(
				dated(101, "native") + prefetch("native", 104),
			);
			expect(native).not.toContain("native-102.ts");
			expect(numberOf(native, "native-103")).toBe(numberOf(backup, "a-103"));
			expect(numberOf(native, "native-104")).toBe(numberOf(backup, "a-104"));
			expect(numberOf(native, "native-105")).toBe(numberOf(backup, "a-105"));
		});
	});

	it("keeps enough silent media available through the observed early poll and backup delay", async () => {
		const { context, info, serve } = setup();
		let now = Date.now();
		const startedAt = now;
		context.Date = class extends Date {
			static now() {
				return now;
			}
		};
		const start = Date.parse("2026-10-07T15:09:00Z");
		await serve(
			playlist(400).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start).toISOString()}\n#EXTINF:`,
			),
		);
		let first = "";
		let availableUntil = 0;
		for (const elapsed of [0, 15, 969]) {
			now = startedAt + elapsed;
			const output = await serve(
				context._createEmptyAdHoldPlaylist(playlist(403), info),
			);
			first ||= output;
			expect(output).toBe(first);
			availableUntil =
				Math.max(
					...Array.from(output.matchAll(/#EXT-X-PROGRAM-DATE-TIME:(.+)/g)).map(
						(match) => Date.parse(match[1]),
					),
				) + 1024;
		}
		expect(availableUntil - (start + 6000)).toBeGreaterThanOrEqual(2197);
		now = startedAt + 2197;
		const backup = playlist(100).replace(
			"#EXTINF:",
			`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + 6000).toISOString()}\n#EXTINF:`,
		);
		const switched = await serve(backup, "autoplay");
		expect(switched).not.toContain("__ttvab_empty_hold_segment.ts");
		expect(segments(switched)[0].sequence).toBe(
			segments(first).at(-1).sequence + 1,
		);
		expect(info._EmptyAdHoldWindow).toBeNull();
	});

	it.each([-126, -238])(
		"preserves new broadcast content in a boundary segment overlapping by %s ms",
		async (skewMs) => {
			const { context, info, serve } = setup();
			const start = Date.parse("2026-10-07T15:09:00Z");
			const dated = (sequence: number, offset: number) =>
				playlist(sequence).replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + offset).toISOString()}\n#EXTINF:`,
				);
			const before = segments(await serve(dated(400, 0)));
			const backup = await serve(dated(100, 4000 + skewMs), "autoplay");
			expect(backup).not.toContain("clean-100.ts");
			expect(backup).toContain("clean-101.ts");
			expect(backup).toContain(
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + 6000 + skewMs).toISOString()}`,
			);
			const entries = segments(backup);
			expect(entries[0].sequence).toBe(before.at(-1).sequence + 1);
			expect(entries[0].discontinuity).toBeGreaterThan(
				before.at(-1).discontinuity,
			);
			const refreshed = await serve(dated(101, 6000 + skewMs), "autoplay");
			expect(segments(refreshed).slice(0, 2)).toEqual(entries);
			context._resetStreamAdState(info, true);
			const returned = await serve(dated(500, 8000 + 2 * skewMs));
			expect(returned).toContain("clean-502.ts");
			expect(returned).not.toContain("clean-500.ts");
			expect(returned).not.toContain("clean-501.ts");
		},
	);

	it("shares contiguous silent hold media across simultaneous rendition requests", async () => {
		const { context, info, serve } = setup();
		const start = Date.parse("2026-10-07T02:30:10Z");
		const native = playlist(400).replace(
			"#EXTINF:",
			`#EXT-X-PROGRAM-DATE-TIME:${new Date(start).toISOString()}\n#EXTINF:`,
		);
		await serve(native);
		const first = context._createEmptyAdHoldPlaylist(playlist(403), info);
		await serve(first);
		const second = context._createEmptyAdHoldPlaylist(playlist(404), info);
		const otherUrl = nativeUrl.replace("native", "360p");
		info.Urls[otherUrl] = { Resolution: "640x360", Codecs: codec };
		context._applyPlaylistContinuity(info, otherUrl, second);
		const third = context._createEmptyAdHoldPlaylist(playlist(405), info);
		const times = [first, second, third].map((text) =>
			Date.parse(text.match(/#EXT-X-PROGRAM-DATE-TIME:(.+)/)?.[1] || ""),
		);
		expect(times).toEqual([start + 6000, start + 6000, start + 6000]);
		expect(segments(second)).toEqual(segments(first));
		expect(segments(third)).toEqual(segments(first));
		info._EmptyAdHoldWindow.startedAt -= 2048;
		const advanced = context._createEmptyAdHoldPlaylist(playlist(405), info);
		const entries = segments(advanced);
		expect(entries).toHaveLength(5);
		expect(entries.slice(0, 3)).toEqual(segments(first));
		expect(entries[4].sequence).toBe(entries[0].sequence + 4);
		expect(entries[4].discontinuity).toBe(entries[0].discontinuity);
		expect(advanced).toContain(new Date(start + 10096).toISOString());
		expect(info._LivePlaylistTimeline.lastEndTime).toBe(start + 6000);
		expect(info._LivePlaylistTimeline.afterHold).toBe(true);
		context._resetStreamAdState(info, true);
		expect(info._EmptyAdHoldProgramDateTime).toBe(0);
	});

	it.each(["vod", "undated"])(
		"does not invent a silent hold broadcast time for %s media",
		async (kind) => {
			const { context, info, serve } = setup();
			if (kind === "vod") info.MediaType = "vod";
			await serve(playlist(400));
			const output = context._createEmptyAdHoldPlaylist(playlist(403), info);
			expect(output).not.toContain("#EXT-X-PROGRAM-DATE-TIME:");
			expect(output).toContain("__ttvab_empty_hold_segment.ts");
		},
	);
	it("keeps independently numbered backups and native return continuous without a hold", async () => {
		const { context, info, serve } = setup();
		const start = Date.parse("2026-10-07T02:30:00Z");
		const dated = (sequence: number, offset: number) =>
			playlist(sequence).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + offset).toISOString()}\n#EXTINF:`,
			);
		const native = segments(
			await serve(
				dated(400, 0).replace(
					"DISCONTINUITY-SEQUENCE:0",
					"DISCONTINUITY-SEQUENCE:8",
				),
			),
		);
		const low = segments(await serve(dated(900, 6000), "autoplay"));
		const high = segments(await serve(dated(50, 12000), "site"));
		context._resetStreamAdState(info, true);
		const returned = segments(await serve(dated(410, 18000)));
		for (const [previous, next] of [
			[native, low],
			[low, high],
			[high, returned],
		]) {
			expect(next[0].sequence).toBe(previous.at(-1).sequence + 1);
			expect(next[0].discontinuity).toBeGreaterThan(
				previous.at(-1).discontinuity,
			);
		}
		const request = `${nativeUrl}&_HLS_msn=${returned[0].sequence + 1}&_HLS_part=1`;
		expect(context._getEmptyHoldUpstreamUrl(info, request)).toContain(
			"_HLS_msn=411&_HLS_part=1",
		);
		expect(segments(await serve(dated(411, 20000))).slice(0, 2)).toEqual(
			returned.slice(1),
		);
	});

	it("keeps a new backup beyond the last offered prefetch discontinuity", async () => {
		const { serve } = setup();
		await serve(playlist(400));
		const low = segments(
			await serve(
				`${playlist(403)}\n#EXT-X-DISCONTINUITY\n#EXT-X-TWITCH-PREFETCH:https://edge.example/low-406.ts`,
				"autoplay",
			),
		);
		const high = segments(await serve(playlist(50), "site"));
		expect(high[0].sequence).toBe(low.at(-1).sequence + 1);
		expect(high[0].discontinuity).toBeGreaterThan(low.at(-1).discontinuity);
	});

	it("seeds the first hold from native history even when another rendition has lower counters", async () => {
		const { context, info, serve } = setup();
		const native = segments(
			await serve(
				playlist(900).replace(
					"DISCONTINUITY-SEQUENCE:0",
					"DISCONTINUITY-SEQUENCE:8",
				),
			),
		);
		const held = context._applyPlaylistContinuity(
			info,
			nativeUrl,
			context._createEmptyAdHoldPlaylist(playlist(10), info),
		);
		expect(segments(held)[0].sequence).toBeGreaterThan(native.at(-1).sequence);
		expect(segments(held)[0].discontinuity).toBeGreaterThan(
			native.at(-1).discontinuity,
		);
	});

	it("keeps every hold slot listed until a client polling at the target duration can fetch it", async () => {
		const { context, info, serve } = setup();
		const source = playlist(400).replace(
			"TARGETDURATION:2",
			"TARGETDURATION:5",
		);
		const first = segments(
			await serve(context._createEmptyAdHoldPlaylist(source, info)),
		);
		expect(first).toHaveLength(3);
		let previous = first;
		let elapsed = 0;
		for (let poll = 0; poll < 8; poll++) {
			elapsed += 5500;
			info._EmptyAdHoldWindow.startedAt -= 5500;
			const next = segments(
				await serve(context._createEmptyAdHoldPlaylist(source, info)),
			);
			expect(next[0].sequence).toBeLessThanOrEqual(
				previous.at(-1).sequence + 1,
			);
			expect(next.at(-1).sequence).toBe(
				first[0].sequence + Math.floor(elapsed / 1024) + 2,
			);
			expect(next.length).toBeLessThanOrEqual(15);
			expect(new Set(next.map((entry) => entry.url)).size).toBe(next.length);
			previous = next;
		}
		expect(previous).toHaveLength(15);
		expect(previous[0].discontinuity).toBe(first[0].discontinuity);
	});

	it("keeps a bounded hold window and starts new media for a new ad cycle", async () => {
		const { context, info, hold } = setup();
		const first = segments(await hold());
		info._EmptyAdHoldWindow.startedAt -= 30720;
		const later = context._createEmptyAdHoldPlaylist(playlist(400), info);
		expect(segments(later)).toHaveLength(6);
		expect(segments(later)[0].sequence).toBe(first[0].sequence + 27);
		expect(segments(later).at(-1).sequence).toBe(first[0].sequence + 32);
		expect(segments(later)[0].discontinuity).toBe(first[0].discontinuity);
		const unbounded = context._createEmptyAdHoldPlaylist(
			playlist(400).replace("TARGETDURATION:2", "TARGETDURATION:600"),
			info,
		);
		expect(segments(unbounded)).toHaveLength(32);
		info.VisibleAdStartedAt++;
		const nextCycle = context._createEmptyAdHoldPlaylist(playlist(400), info);
		expect(segments(nextCycle)).toHaveLength(3);
		expect(segments(nextCycle)[0].sequence).toBeGreaterThan(
			segments(later).at(-1).sequence,
		);
		expect(segments(nextCycle)[0].discontinuity).toBeGreaterThan(
			segments(later).at(-1).discontinuity,
		);
	});

	it("anchors a hold after published trailing parts without counting completed parts twice", async () => {
		const { context, info, serve } = setup();
		const start = Date.parse("2026-10-07T02:30:00Z");
		const native =
			playlist(400).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start).toISOString()}\n#EXT-X-PART:DURATION=0.5,URI="completed.ts"\n#EXTINF:`,
			) +
			'\n#EXT-X-PART:DURATION=0.5,URI="part-403.0.ts"\n#EXT-X-PART:DURATION=0.5,URI="part-403.1.ts"\n#EXT-X-PRELOAD-HINT:TYPE=PART,URI="future.ts"';
		await serve(native);
		expect(info._LivePlaylistTimeline.lastEndTime).toBe(start + 7000);
		const hold = context._createEmptyAdHoldPlaylist(playlist(403), info);
		expect(hold).toContain(new Date(start + 7000).toISOString());
	});

	it.each([false, true])(
		"derives an earlier program date only inside one discontinuity: %s",
		async (boundary) => {
			const { serve } = setup();
			const start = Date.parse("2026-10-07T02:30:00Z");
			await serve(
				playlist(400).replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(start).toISOString()}\n#EXTINF:`,
				),
			);
			const candidate = playlist(900).replace(
				"https://edge.example/clean-900.ts",
				`https://edge.example/clean-900.ts\n${boundary ? "#EXT-X-DISCONTINUITY\n" : ""}#EXT-X-PROGRAM-DATE-TIME:${new Date(start + 8000).toISOString()}`,
			);
			if (boundary)
				await expect(serve(candidate, "autoplay")).rejects.toMatchObject({
					name: "AbortError",
				});
			else {
				const output = await serve(candidate, "autoplay");
				expect(output).toContain(new Date(start + 6000).toISOString());
				expect(output).toContain("clean-900.ts");
			}
		},
	);

	it("retains original encryption IVs when a hold-free handoff renumbers media", async () => {
		const { serve } = setup();
		await serve(playlist(400));
		const candidate = playlist(10).replace(
			"#EXTINF:",
			'#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:',
		);
		const output = await serve(candidate, "site");
		expect(segments(output)[0].sequence).toBe(403);
		for (let sequence = 10; sequence <= 12; sequence++)
			expect(output).toContain(
				`IV=0x${sequence.toString(16).padStart(32, "0")}`,
			);
	});

	it("keeps native return in a new discontinuity after a hold-free low-to-high backup transition", async () => {
		const { context, info, serve } = setup();
		const start = Date.parse("2026-10-07T02:30:10Z");
		const dated = (sequence: number, time: number) =>
			playlist(sequence).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(time).toISOString()}\n#EXTINF:`,
			);
		await serve(dated(400, start));
		const low = segments(await serve(dated(403, start + 6000), "autoplay"));
		const high = segments(await serve(dated(406, start + 12000), "site"));
		expect(info._EmptyHoldTimelineByUrl.size).toBe(1);
		context._resetStreamAdState(info, true);
		const nativeText = await serve(dated(409, start + 18000));
		expect(nativeText).toContain("#EXT-X-DISCONTINUITY\n");
		const native = segments(nativeText);
		const refreshed = segments(await serve(dated(410, start + 20000)));
		expect(high[0].discontinuity).toBe(low.at(-1).discontinuity + 1);
		expect(native[0].discontinuity).toBe(high.at(-1).discontinuity + 1);
		expect(refreshed[0].discontinuity).toBe(native.at(-1).discontinuity);
		const otherUrl = nativeUrl.replace("native", "360p");
		info.Urls[otherUrl] = { Resolution: "640x360", Codecs: codec };
		for (const sequence of [100, 900]) {
			const other = context._applyPlaylistContinuity(
				info,
				otherUrl,
				dated(sequence, start + 20000),
			);
			expect(segments(other)[0].discontinuity).toBe(
				native.at(-1).discontinuity,
			);
		}
		context._applyPlaylistContinuity(
			info,
			`${otherUrl}&_HLS_msn=901&_HLS_part=0`,
			dated(901, start + 22000),
		);
		expect(info._EmptyHoldTimelineByUrl.size).toBe(2);
		for (let index = 0; index < 33; index++) {
			const extraUrl = nativeUrl.replace("native", `quality-${index}`);
			info.Urls[extraUrl] = info.Urls[nativeUrl];
			context._applyPlaylistContinuity(
				info,
				extraUrl,
				dated(500 + index, start + 22000),
			);
		}
		expect(info._EmptyHoldTimelineByUrl.size).toBe(32);
		context._resetStreamAdState(info);
		expect(info._SpliceStreamId).toBeNull();
		expect(info._SpliceLastDiscontinuitySequence).toBeNull();
		expect(info._NativeSpliceBoundaries.size).toBe(0);
	});

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
			useFakeClock(context);
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
			const first = await settleOnFakeClock(
				context._processM3U8(otherUrl, ad, fetch),
			);
			now += 1000;
			const next = await settleOnFakeClock(
				context._processM3U8(nativeUrl, ad, fetch),
			);
			expect(next).toContain("__ttvab_empty_hold_segment.ts");
			expect(next).not.toContain("clean-400.ts");
			expect(segments(next)).toEqual(segments(first));
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
			useFakeClock(context);
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
			await settleOnFakeClock(ready);
			const held = await settleOnFakeClock(
				context._processM3U8(otherUrl, ad, fetch),
			);
			if (owner === "aborted") controller.abort();
			if (owner === "new cycle") info.BackupSearchEpoch++;
			if (owner === "new loader") info.NativeRecoveryLoaderEpoch++;
			release();
			if (owner !== "current") {
				await expect(settleOnFakeClock(pending)).rejects.toMatchObject({
					name: "AbortError",
				});
				return;
			}
			const output = await settleOnFakeClock(pending);
			expect(output).toContain("__ttvab_empty_hold_segment.ts");
			expect(output).not.toContain("clean-400.ts");
			expect(segments(output)).toEqual(segments(held));
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
		expect(segments(second)).toEqual(segments(first));
		expect(segments(second)[0].discontinuity).toBeGreaterThanOrEqual(
			segments(first)[0].discontinuity,
		);
		expect(context._applyPlaylistContinuity(info, nativeUrl, secondHold)).toBe(
			second,
		);
		info._EmptyAdHoldWindow.startedAt -= 4096;
		const advanced = context._createEmptyAdHoldPlaylist(playlist(26), info);
		context._applyPlaylistContinuity(info, otherUrl, advanced);
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

	it("updates silent-hold ownership only for the backup actually served", async () => {
		const { context, info, serve } = setup();
		context.self = context;
		context._postWorkerBridgeMessage = vi.fn();
		context.state.PinnedBackupPlayerType = "site";
		context.state.PinnedBackupPlayerMediaKey = info.MediaKey;
		info.IsShowingAd = false;
		info.IsHoldingBackupAfterAd = true;
		await serve(playlist(100), "autoplay");
		expect(context.state.PinnedBackupPlayerType).toBe("autoplay");
		expect(context._postWorkerBridgeMessage).toHaveBeenCalledExactlyOnceWith(
			expect.anything(),
			expect.objectContaining({
				key: "BackupPlayerTypeSelected",
				value: "autoplay",
				mediaKey: info.MediaKey,
				cycleStartedAt: info.VisibleAdStartedAt,
				pageMediaKey: info.MediaKey,
				pageContextGeneration: context.state.PagePlaybackContextGeneration,
			}),
		);
		await serve(playlist(101), "autoplay");
		expect(context._postWorkerBridgeMessage).toHaveBeenCalledTimes(1);
		await serve(playlist(200), "embed");
		expect(context.state.PinnedBackupPlayerType).toBe("embed");
		expect(context._postWorkerBridgeMessage).toHaveBeenCalledTimes(2);
	});

	it("does not announce a silent-hold backup rejected by continuity", async () => {
		const { context, info, serve } = setup();
		context.self = context;
		context._postWorkerBridgeMessage = vi.fn();
		const dated = (sequence: number, seconds: number) =>
			playlist(sequence).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:2026-10-08T13:09:${seconds}.000Z\n#EXTINF:`,
			);
		await serve(dated(100, 20), "site");
		expect(context._postWorkerBridgeMessage).toHaveBeenCalledExactlyOnceWith(
			expect.anything(),
			expect.objectContaining({
				key: "BackupPlayerTypeSelected",
				value: "site",
			}),
		);
		context._postWorkerBridgeMessage.mockClear();
		context.state.PinnedBackupPlayerType = "site";
		context.state.PinnedBackupPlayerMediaKey = info.MediaKey;
		info.IsShowingAd = false;
		info.IsHoldingBackupAfterAd = true;
		await expect(serve(dated(101, 18), "autoplay")).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(context.state.PinnedBackupPlayerType).toBe("site");
		expect(context._postWorkerBridgeMessage).not.toHaveBeenCalled();
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

	it("checks a proposed backup handoff without claiming its unserved timeline", async () => {
		const { context, info, serve } = setup();
		const dated = (sequence: number, seconds: number) =>
			playlist(sequence).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:2026-10-06T00:05:${seconds}.000Z\n#EXTINF:`,
			);
		await serve(dated(400, 20));
		const previous = info._LivePlaylistTimeline;
		const log = vi.fn();
		context._log = log;
		const metadata = { playerType: "site", sessionUrl: "owned" };
		const checked = context._alignLivePlaylist(
			info,
			dated(100, 24),
			metadata,
			false,
		);
		expect(checked).toContain("clean-101.ts");
		expect(checked).not.toContain("clean-100.ts");
		expect(info._LivePlaylistTimeline).toBe(previous);
		expect(log).not.toHaveBeenCalled();
		expect(() =>
			context._alignLivePlaylist(info, dated(100, 20), metadata, false),
		).toThrow("Live handoff playlist is behind the served broadcast time");
		expect(info._LivePlaylistTimeline).toBe(previous);
		expect(await serve(dated(401, 22))).toContain("clean-401.ts");
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

	describe("sessions whose timestamps disagree", () => {
		function clockSetup() {
			const { context, info } = setup();
			const base = Date.parse("2026-10-19T11:42:28Z");
			let now = base - 2000;
			context.Date = class extends Date {
				static now() {
					return now;
				}
			};
			const datedEndingAt = (sequence: number, end: number, prefix: string) =>
				playlist(sequence, 3, prefix).replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(end - 6000).toISOString()}\n#EXTINF:`,
				);
			const backup = { playerType: "autoplay", sessionUrl: "fresh" };
			const look = (text: string, metadata: unknown = null) => {
				try {
					context._alignLivePlaylist(info, text, metadata, false);
				} catch {}
			};
			return {
				context,
				info,
				base,
				datedEndingAt,
				backup,
				look,
				advance: (ms: number) => {
					now += ms;
				},
			};
		}

		it("joins a backup at its live edge when the served native clock runs ahead of the viewer's clock", () => {
			const { context, info, base, datedEndingAt, backup, look, advance } =
				clockSetup();
			context._alignLivePlaylist(
				info,
				datedEndingAt(399, base + 8000, "native"),
			);
			advance(2000);
			context._alignLivePlaylist(
				info,
				datedEndingAt(400, base + 10000, "native"),
			);
			look(datedEndingAt(100, base - 2000, "backup"), backup);
			expect(() =>
				context._alignLivePlaylist(
					info,
					datedEndingAt(100, base - 2000, "backup"),
					backup,
				),
			).toThrow("Live handoff playlist is behind the served broadcast time");

			advance(2000);
			const diagnostic: Record<string, unknown> = {};
			const output = context._alignLivePlaylist(
				info,
				datedEndingAt(101, base, "backup"),
				backup,
				true,
				"",
				diagnostic,
			);

			expect(diagnostic.clockShiftMs).toBe(12000);
			expect(output).toContain("backup-103.ts");
			expect(output).not.toContain("backup-102.ts");
			expect(info._LivePlaylistTimeline.minimumTime).toBe(base - 2000);
		});

		it("keeps a genuinely late backup behind when both clocks agree with the viewer", () => {
			const { context, info, base, datedEndingAt, backup, look, advance } =
				clockSetup();
			context._alignLivePlaylist(
				info,
				datedEndingAt(399, base - 4000, "native"),
			);
			look(datedEndingAt(99, base - 16000, "backup"), backup);
			advance(2000);
			context._alignLivePlaylist(
				info,
				datedEndingAt(400, base - 2000, "native"),
			);
			const diagnostic: Record<string, unknown> = {};

			expect(() =>
				context._alignLivePlaylist(
					info,
					datedEndingAt(100, base - 14000, "backup"),
					backup,
					false,
					"",
					diagnostic,
				),
			).toThrow("Live handoff playlist is behind the served broadcast time");
			expect(diagnostic.clockShiftMs).toBe(0);
		});

		it("does not shift sessions that share a clock ahead of the viewer", () => {
			const { context, info, base, datedEndingAt, backup, look, advance } =
				clockSetup();
			context._alignLivePlaylist(
				info,
				datedEndingAt(399, base + 1000, "native"),
			);
			look(datedEndingAt(100, base + 3000, "backup"), backup);
			advance(2000);
			context._alignLivePlaylist(
				info,
				datedEndingAt(400, base + 3000, "native"),
			);
			const diagnostic: Record<string, unknown> = {};

			const output = context._alignLivePlaylist(
				info,
				datedEndingAt(101, base + 5000, "backup"),
				backup,
				false,
				"",
				diagnostic,
			);

			expect(diagnostic.clockShiftMs).toBe(0);
			expect(output).toContain("backup-103.ts");
			expect(output).not.toContain("backup-102.ts");
		});

		it("waits for a source's newest segment to advance before trusting its edge", () => {
			const { context, info, base, datedEndingAt, backup, advance } =
				clockSetup();
			context._alignLivePlaylist(
				info,
				datedEndingAt(399, base + 8000, "native"),
			);
			advance(2000);
			context._alignLivePlaylist(
				info,
				datedEndingAt(400, base + 10000, "native"),
			);
			advance(3900);
			const diagnostic: Record<string, unknown> = {};

			expect(() =>
				context._alignLivePlaylist(
					info,
					datedEndingAt(100, base - 2000, "backup"),
					backup,
					false,
					"",
					diagnostic,
				),
			).toThrow("Live handoff playlist is behind the served broadcast time");
			expect(diagnostic.clockShiftMs).toBe(0);
		});

		it("serves the backup within a segment instead of holding until its clock catches up", async () => {
			const { context, info, fetch, serve } = setup();
			let now = Date.parse("2026-10-19T11:42:28Z");
			context.Date = class extends Date {
				static now() {
					return now;
				}
			};
			context.self = context;
			context._postWorkerBridgeMessage = vi.fn();
			context._log = vi.fn();
			context.state.DisableAutoplayBackup = false;
			const core = context._processM3U8Core;
			const grid = (lastEnd: number, prefix: string, sequence: number) =>
				playlist(sequence, 7, prefix)
					.replaceAll("#EXTINF:2.000", "#EXTINF:4.167")
					.replace("TARGETDURATION:2", "TARGETDURATION:5")
					.replace(
						"#EXTINF:",
						`#EXT-X-PROGRAM-DATE-TIME:${new Date(lastEnd - 7 * 4167).toISOString()}\n#EXTINF:`,
					);
			const backupOrigin = now - 2000;
			now -= 4167;
			await serve(grid(now + 10000, "native", 689));
			now += 4167;
			await serve(grid(now + 10000, "native", 690));
			info.VisibleAdStartedAt = now - 6000;
			context._processM3U8Core = core;
			let selection = 0;
			const select = () => {
				const advanced = Math.floor((now - 2000 - backupOrigin) / 4167);
				return context._commitBackupPlaylist(
					info,
					grid(backupOrigin + advanced * 4167, "backup", 690 + advanced),
					++selection,
					{
						playerType: "autoplay",
						resolution: "640x360",
						codecFamily: "avc",
						codec: "avc1.4d401f",
						playlistUrl: "https://edge.example/autoplay.m3u8?token=private",
						sessionUrl: "https://usher.ttvnw.net/master.m3u8?token=private",
					},
				);
			};
			context._findBackupStream = vi.fn(async () => ({
				type: "autoplay",
				m3u8: select(),
			}));
			context._refreshActiveBackupMediaPlaylist = vi.fn(async () => select());
			const ad = playlist(697, 3, "stitched-ad").replaceAll(
				",live",
				",stitched-ad",
			);
			let output = "";
			for (
				let poll = 0;
				poll < 6 && info._LastServedPlaylistKind !== "backup";
				poll++
			) {
				now += 1100;
				output = await context._processM3U8(nativeUrl, ad, fetch);
			}

			expect(info._LastServedPlaylistKind).toBe("backup");
			expect(output).not.toMatch(/stitched-ad/);
			expect(segments(output).map((segment) => segment.url)).toEqual([
				"https://edge.example/backup-697.ts",
			]);
		});

		it("does not replay a served backup when the returning native clock runs ahead", () => {
			const { context, info, base, datedEndingAt, backup, look, advance } =
				clockSetup();
			context._alignLivePlaylist(
				info,
				datedEndingAt(99, base - 4000, "backup"),
				backup,
			);
			look(datedEndingAt(399, base + 8000, "native"));
			advance(2000);
			context._alignLivePlaylist(
				info,
				datedEndingAt(100, base - 2000, "backup"),
				backup,
			);
			const diagnostic: Record<string, unknown> = {};

			expect(() =>
				context._alignLivePlaylist(
					info,
					datedEndingAt(400, base + 10000, "native"),
					null,
					false,
					"",
					diagnostic,
				),
			).toThrow("Live handoff playlist is behind the served broadcast time");
			expect(diagnostic.clockShiftMs).toBe(-12000);
		});
	});

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
		const waiting = await serve(dated(100, start - 20000), "autoplay");
		expect(waiting).toContain("__ttvab_empty_hold_segment.ts");
		expect(waiting).not.toContain("clean-");
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

	it("reports accepted handoff timing and source ownership once without exposing signed URLs", async () => {
		const { context, info, serve } = setup();
		const log = vi.fn();
		context._log = log;
		const dated = (sequence: number, time: string) =>
			playlist(sequence).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:${time}Z\n#EXTINF:`,
			);
		await serve(dated(400, "20.000"));
		const output = await serve(dated(100, "23.999"), "site", "private-token");
		await serve(dated(101, "25.999"), "site", "private-token");
		expect(log).toHaveBeenCalledTimes(1);
		expect(log.mock.calls[0][1]).toBe("info");
		expect(log.mock.calls[0][0]).toMatch(/^\[Continuity\] handoff /);
		expect(JSON.parse(log.mock.calls[0][0].split("handoff ")[1])).toMatchObject(
			{
				mediaKey: info.MediaKey,
				pageMediaKey: info.MediaKey,
				cycleStartedAt: info.VisibleAdStartedAt,
				sourceId: 2,
				previousSourceId: 1,
				source: "site",
				resolution: "1920x1080",
				codec: "avc1.64002a",
				rawSequence: 100,
				servedSequence: segments(output)[0].sequence,
				cutoff: Date.parse("2026-09-20T18:09:26Z"),
				boundaryMs: -1,
				gapMs: 0,
				overlapMs: 1,
				skippedSegments: 1,
				retainedSegments: 2,
			},
		);
		expect(JSON.stringify(log.mock.calls)).not.toMatch(
			/private-token|https:|token=|session=/,
		);
	});

	it("summarizes repeated rejected windows and reports recovery without logging candidate probes", async () => {
		const { context, info, serve } = setup();
		let now = Date.now();
		context.Date = class extends Date {
			static now() {
				return now;
			}
		};
		const log = vi.fn();
		context._log = log;
		const start = Date.parse("2026-09-20T18:09:20Z");
		const dated = (sequence: number, offset: number) =>
			playlist(sequence).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + offset).toISOString()}\n#EXTINF:`,
			);
		await serve(dated(400, 0));
		const previous = info._LivePlaylistTimeline;
		const metadata = {
			playerType: "site",
			playlistUrl: "https://edge.example/backup.m3u8?token=private",
			sessionUrl: "https://usher.example/private",
		};
		expect(() =>
			context._alignLivePlaylist(info, dated(100, -6000), metadata, false),
		).toThrow("behind the served broadcast time");
		expect(log).not.toHaveBeenCalled();
		for (let index = 0; index < 4; index++) {
			expect(() =>
				context._applyPlaylistContinuity(
					info,
					nativeUrl,
					dated(100, -6000),
					metadata,
				),
			).toThrow("behind the served broadcast time");
		}
		expect(info._LivePlaylistTimeline).toBe(previous);
		expect(log).toHaveBeenCalledTimes(1);
		expect(log.mock.calls[0][1]).toBe("warning");
		expect(
			JSON.parse(log.mock.calls[0][0].split("rejected ")[1]),
		).toMatchObject({
			reason: "behind-served-time",
			cutoff: start + 6000,
			windowEnd: start,
			servedSequence: null,
			servedDiscontinuity: null,
			boundaryMs: null,
			suppressed: 0,
		});
		now += 5000;
		expect(() =>
			context._applyPlaylistContinuity(
				info,
				nativeUrl,
				dated(100, -6000),
				metadata,
			),
		).toThrow();
		expect(log).toHaveBeenCalledTimes(2);
		expect(
			JSON.parse(log.mock.calls[1][0].split("rejected ")[1]).suppressed,
		).toBe(3);
		context._applyPlaylistContinuity(
			info,
			nativeUrl,
			dated(101, 6000),
			metadata,
		);
		expect(log).toHaveBeenCalledTimes(3);
		expect(log.mock.calls[2][0]).toMatch(/^\[Continuity\] handoff /);
		expect(JSON.stringify(log.mock.calls)).not.toMatch(/https:|private/);
	});

	it("does not announce an accepted handoff when later sequence validation rejects it", async () => {
		const { context, serve } = setup();
		const log = vi.fn();
		context._log = log;
		const dated = (sequence: number, seconds: number) =>
			playlist(sequence).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:${seconds}Z\n#EXTINF:`,
			);
		await serve(dated(400, 20));
		context._applyEmptyHoldPlaylistContinuity = () => {
			throw new DOMException(
				"Retired empty hold recovery playlist",
				"AbortError",
			);
		};
		await expect(serve(dated(100, 26), "site")).rejects.toThrow(
			"Retired empty hold",
		);
		expect(log).toHaveBeenCalledTimes(1);
		expect(log.mock.calls[0][0]).toMatch(/^\[Continuity\] rejected /);
		expect(
			JSON.parse(log.mock.calls[0][0].split("rejected ")[1]),
		).toMatchObject({ reason: "retired-window", servedSequence: null });
	});

	it.each([234, -234])(
		"reports a dated internal boundary of %s ms without changing playlist bytes",
		async (delta) => {
			const { context, serve } = setup();
			const log = vi.fn();
			context._log = log;
			const start = Date.parse("2026-09-20T18:09:20Z");
			let index = 0;
			const text = playlist(400).replaceAll("#EXTINF:", () => {
				const time = start + index * 2000 + (index ? delta : 0);
				index++;
				return `#EXT-X-PROGRAM-DATE-TIME:${new Date(time).toISOString()}\n#EXTINF:`;
			});
			expect(await serve(text)).toBe(text);
			expect(log).toHaveBeenCalledTimes(1);
			expect(log.mock.calls[0][1]).toBe("warning");
			const details = JSON.parse(
				log.mock.calls[0][0].slice(log.mock.calls[0][0].indexOf("{")),
			);
			expect(details.internalGapMs).toBe(Math.max(0, delta));
			expect(details.internalOverlapMs).toBe(Math.max(0, -delta));
		},
	);

	it("keeps diagnostic source history bounded and ignores disabled blocking and VOD", async () => {
		const { context, info } = setup();
		const log = vi.fn();
		context._log = log;
		for (let index = 0; index < 40; index++)
			context._applyPlaylistContinuity(
				info,
				`${nativeUrl}&source=${index}`,
				playlist(400 + index),
			);
		expect(info._PlaylistContinuityDiagnostics.sources.size).toBe(32);
		expect(info._PlaylistContinuityDiagnostics.nextSourceId).toBe(40);
		context._resetStreamAdState(info, true);
		expect(info._PlaylistContinuityDiagnostics.sources.size).toBe(32);
		context._resetStreamAdState(info);
		expect(info._PlaylistContinuityDiagnostics).toBeNull();
		context.state.IsAdStrippingEnabled = false;
		context._applyPlaylistContinuity(info, nativeUrl, playlist(100));
		context.state.IsAdStrippingEnabled = true;
		info.MediaType = "vod";
		context._applyPlaylistContinuity(info, nativeUrl, playlist(100));
		expect(info._PlaylistContinuityDiagnostics).toBeNull();
		expect(log).not.toHaveBeenCalled();
	});

	it.each([
		[-2000, "window-regression"],
		[10000, "timestamp-gap"],
	])(
		"reports a same-source window moving by %s ms as %s",
		async (offset, event) => {
			const { context, serve } = setup();
			const log = vi.fn();
			context._log = log;
			const start = Date.parse("2026-09-20T18:09:20Z");
			const dated = (sequence: number, time: number) =>
				playlist(sequence).replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + time).toISOString()}\n#EXTINF:`,
				);
			await serve(dated(400, 0));
			const text = dated(401, Number(offset));
			expect(await serve(text)).toBe(text);
			expect(log).toHaveBeenCalledTimes(1);
			expect(log.mock.calls[0][0]).toMatch(`[Continuity] ${event} `);
			expect(log.mock.calls[0][1]).toBe("warning");
			expect(
				JSON.parse(log.mock.calls[0][0].split(`${event} `)[1]),
			).toMatchObject({
				sourceId: 1,
				previousSourceId: 1,
				windowEndDeltaMs: Number(offset),
				windowGapMs: Math.max(0, Number(offset) - 6000),
			});
		},
	);

	it("attributes native return to the ended cycle without treating time filled by backup as a gap", async () => {
		const { context, info, serve } = setup();
		const log = vi.fn();
		context._log = log;
		const dated = (sequence: number, seconds: number) =>
			playlist(sequence).replace(
				"#EXTINF:",
				`#EXT-X-PROGRAM-DATE-TIME:2026-09-20T18:09:${seconds}Z\n#EXTINF:`,
			);
		await serve(dated(400, 20));
		await serve(dated(100, 26), "site");
		const cycle = info.VisibleAdStartedAt;
		context.state.LastAdEndedMediaKey = info.MediaKey;
		context.state.LastAdEndedCycleStartedAt = cycle;
		context._resetStreamAdState(info, true);
		log.mockClear();
		await serve(dated(500, 32));
		expect(log).toHaveBeenCalledTimes(2);
		expect(log.mock.calls[0]).toEqual([
			expect.stringMatching(
				new RegExp(
					`^\\[Break\\] ended live:testchannel cycle ${cycle}: native 1920x1080 @-?\\d+\\.\\ds -> site 1920x1080 @\\d+\\.\\ds -> native 1920x1080 @\\d+\\.\\ds; measured 0 ads \\(0\\.0s\\)$`,
				),
			),
			"info",
		]);
		expect(info._PlaylistContinuityDiagnostics.adBreak).toBeNull();
		expect(log.mock.calls[1][1]).toBe("info");
		expect(JSON.parse(log.mock.calls[1][0].split("handoff ")[1])).toMatchObject(
			{
				cycleStartedAt: cycle,
				cyclePhase: "ended",
				source: "native",
				sourceId: 1,
				previousSourceId: 2,
				gapMs: 0,
				windowGapMs: null,
				windowEndDeltaMs: null,
			},
		);
	});

	it("keeps source identifiers stable across delivery directives and separates signed sessions", () => {
		const { context, info } = setup();
		for (const url of [
			nativeUrl,
			`${nativeUrl}&_HLS_msn=100&_HLS_part=1`,
			`${nativeUrl}&_HLS_skip=YES`,
		])
			context._applyPlaylistContinuity(info, url, playlist(400));
		expect(info._PlaylistContinuityDiagnostics.nextSourceId).toBe(1);
		context._applyPlaylistContinuity(
			info,
			nativeUrl.replace("owned", "another-session"),
			playlist(400),
		);
		expect(info._PlaylistContinuityDiagnostics.nextSourceId).toBe(2);
	});

	it.each([-51, -126, -235, -238, -500, -999])(
		"keeps only the crossing segment when the incoming window overlaps by %s ms",
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
			expect(backup).toContain("clean-101.ts");
			expect(segments(backup)).toHaveLength(2);
			expect(backup).toContain("clean-102.ts");
		},
	);

	it.each([1, 25, 50, 500, 1000])(
		"does not replay most of a boundary segment for %s ms of new content",
		async (remainingMs) => {
			const { serve } = setup();
			const start = Date.parse("2026-09-20T18:09:20Z");
			const dated = (sequence: number, offset: number) =>
				playlist(sequence).replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + offset).toISOString()}\n#EXTINF:`,
				);
			await serve(dated(400, 0));
			const backup = await serve(dated(100, 2000 + remainingMs), "site");
			expect(backup).not.toContain("clean-100.ts");
			expect(backup).not.toContain("clean-101.ts");
			expect(backup).toContain("clean-102.ts");
			expect(backup).toContain(
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + 6000 + remainingMs).toISOString()}`,
			);
		},
	);

	it("rejects a completed short segment within the handoff tolerance", async () => {
		const { context, info, serve } = setup();
		context._waitForAbortableDelay = vi.fn(async () => {});
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
		const output = await serve(stale, "site");
		expect(output).toContain("__ttvab_empty_hold_segment.ts");
		expect(output).not.toContain("clean-100.ts");
		expect(info._LastServedPlaylistKind).toBe("hold");
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
		useFakeClock(context);
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
		const output = await settleOnFakeClock(
			context._processM3U8(nativeUrl, ad, vi.fn()),
		);
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
			expect(info._EmptyHoldTimelineByUrl.get(nativeUrl).kind).toBe("backup");
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

	it.each(
		[false, true].flatMap((disabled) =>
			[false, true].map((usedHold) => ({ disabled, usedHold })),
		),
	)(
		"keeps polling native renditions stable when their segment clocks differ (fallback disabled: $disabled, hold: $usedHold)",
		async ({ disabled, usedHold }) => {
			const { context, info, hold, serve } = setup();
			context.state.DisableAutoplayBackup = disabled;
			const otherUrl = nativeUrl.replace("native", "720p");
			info.Urls[otherUrl] = { Resolution: "1280x720", Codecs: codec };
			const start = Date.parse("2026-10-08T15:22:20Z");
			const dated = (sequence: number, time: number, prefix: string) =>
				playlist(sequence, prefix === "other" ? 4 : 3, prefix).replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + time).toISOString()}\n#EXTINF:`,
				);
			if (usedHold) await hold();
			await serve(playlist(100), "site");
			context._resetStreamAdState(info, true);
			let primary = segments(await serve(dated(10828, 0, "primary")));
			let other = segments(
				context._applyPlaylistContinuity(
					info,
					otherUrl,
					dated(10852, 500, "other"),
				),
			);
			expect(other[0].sequence).toBeGreaterThan(primary.at(-1).sequence);
			expect(other[0].discontinuity).toBeGreaterThan(
				primary.at(-1).discontinuity,
			);
			for (let poll = 1; poll <= 5; poll++) {
				const nextPrimary = segments(
					await serve(dated(10828 + poll, poll * 2000, "primary")),
				);
				const nextOther = segments(
					context._applyPlaylistContinuity(
						info,
						otherUrl,
						dated(10852 + poll, poll * 2000 + 500, "other"),
					),
				);
				for (const [previous, next] of [
					[primary, nextPrimary],
					[other, nextOther],
				]) {
					for (const segment of next) {
						const served = previous.find(({ url }) => url === segment.url);
						if (served) expect(segment).toEqual(served);
						else
							expect(segment.sequence).toBeGreaterThan(
								previous.at(-1).sequence,
							);
					}
				}
				primary = nextPrimary;
				other = nextOther;
			}
			info.IsShowingAd = true;
			info.VisibleAdStartedAt = Date.now();
			await serve(playlist(200), "site", "second-break");
			context._resetStreamAdState(info, true);
			primary = segments(await serve(dated(10850, 44000, "primary")));
			const rejoined = segments(
				context._applyPlaylistContinuity(
					info,
					otherUrl,
					dated(10874, 44500, "other"),
				),
			);
			expect(rejoined[0].sequence).toBeGreaterThan(primary.at(-1).sequence);
			expect(rejoined[0].discontinuity).toBeGreaterThan(
				primary.at(-1).discontinuity,
			);
			const refreshed = segments(await serve(dated(10851, 46000, "primary")));
			for (const segment of refreshed) {
				const served = primary.find(({ url }) => url === segment.url);
				if (served) expect(segment).toEqual(served);
				else expect(segment.sequence).toBeGreaterThan(primary.at(-1).sequence);
			}
		},
	);

	it.each(
		[false, true].flatMap((usedHold) =>
			[-234, 234].flatMap((skewMs) =>
				[4, 15].map((count) => ({ usedHold, skewMs, count })),
			),
		),
	)(
		"does not replay broadcast content when a differently timed native quality joins after recovery (hold: $usedHold, skew: $skewMs, window: $count)",
		async ({ usedHold, skewMs, count }) => {
			const { context, info, hold, serve } = setup();
			const otherUrl = nativeUrl.replace("native", "720p");
			info.Urls[otherUrl] = { Resolution: "1280x720", Codecs: codec };
			const start = Date.parse("2026-10-12T03:56:36Z");
			const dated = (
				sequence: number,
				offset: number,
				count: number,
				prefix: string,
			) =>
				playlist(sequence, count, prefix).replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + offset).toISOString()}\n#EXTINF:`,
				);
			if (usedHold) await hold();
			await serve(dated(100, 0, 3, "backup"), "site");
			context._resetStreamAdState(info, true);
			const primary = segments(
				await serve(dated(6872, 6000, count - 1, "native")),
			);
			const cutoff = 6000 + (count - 1) * 2000;
			const joined = context._applyPlaylistContinuity(
				info,
				otherUrl,
				dated(7000, 6000 + skewMs, count, "other"),
			);
			expect(segments(joined).map(({ url }) => url)).toEqual([
				`https://edge.example/other-${7000 + count - 1}.ts`,
			]);
			expect(joined).toContain(
				`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + cutoff + skewMs).toISOString()}`,
			);
			expect(segments(joined)[0].sequence).toBe(primary.at(-1).sequence + 1);
			const refreshed = context._applyPlaylistContinuity(
				info,
				otherUrl,
				dated(7001, 8000 + skewMs, count, "other"),
			);
			expect(segments(refreshed)[0]).toEqual(segments(joined)[0]);
		},
	);

	it.each(["LF", "CRLF", "new discontinuity"])(
		"accepts an advancing wider native window without replaying its older prefix: %s",
		async (format) => {
			const { context, info, hold, serve } = setup();
			const start = Date.parse("2026-10-08T15:26:45Z");
			const dated = (sequence: number, count: number) =>
				playlist(sequence, count, "native").replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + (sequence - 200) * 2000).toISOString()}\n#EXTINF:`,
				);
			await hold();
			context._resetStreamAdState(info, true);
			await serve(dated(200, 2));
			const narrow = segments(await serve(dated(210, 2)));
			let incoming = dated(208, 5);
			if (format === "CRLF") incoming = incoming.replaceAll("\n", "\r\n");
			if (format === "new discontinuity")
				incoming = incoming.replace(
					"#EXTINF:2.000,live\nhttps://edge.example/native-212.ts",
					`#EXT-X-DISCONTINUITY\n#EXT-X-PROGRAM-DATE-TIME:${new Date(start + 24000).toISOString()}\n#EXTINF:2.000,live\nhttps://edge.example/native-212.ts`,
				);
			const expanded = segments(await serve(incoming));
			expect(expanded.slice(0, 2)).toEqual(narrow);
			expect(expanded.at(-1).sequence).toBe(narrow.at(-1).sequence + 1);
			expect(expanded.at(-1).discontinuity).toBe(
				narrow.at(-1).discontinuity + Number(format === "new discontinuity"),
			);
			expect(expanded.map((segment) => segment.url)).toEqual(
				[210, 211, 212].map(
					(sequence) => `https://edge.example/native-${sequence}.ts`,
				),
			);
			expect(
				info._EmptyHoldTimelineByUrl.get(nativeUrl).lastRawFirstSequence,
			).toBe(210);
		},
	);

	it.each([
		"stale",
		"time",
		"duration",
		"discontinuity",
		"undated",
		"later time",
		"later duration",
		"later discontinuity",
	])(
		"rejects a wider native window without fresh matching broadcast proof: %s",
		async (mode) => {
			const { context, info, hold, serve } = setup();
			const start = Date.parse("2026-10-08T15:26:45Z");
			const dated = (sequence: number, count: number) =>
				playlist(sequence, count, "native").replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + (sequence - 200) * 2000).toISOString()}\n#EXTINF:`,
				);
			await hold();
			context._resetStreamAdState(info, true);
			await serve(dated(200, 2));
			await serve(dated(210, 2));
			let incoming = dated(208, mode === "stale" ? 4 : 5);
			if (mode === "time") incoming = incoming.replace("15:27:01", "15:27:00");
			if (mode === "duration") incoming = incoming.replaceAll("2.000", "2.100");
			if (mode === "discontinuity")
				incoming = incoming.replace(
					"DISCONTINUITY-SEQUENCE:0",
					"DISCONTINUITY-SEQUENCE:1",
				);
			if (mode === "undated")
				incoming = incoming.replace(/#EXT-X-PROGRAM-DATE-TIME:.*\n/, "");
			const laterSegment =
				"#EXTINF:2.000,live\nhttps://edge.example/native-211.ts";
			if (mode === "later time")
				incoming = incoming.replace(
					laterSegment,
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + 23000).toISOString()}\n${laterSegment}`,
				);
			if (mode === "later duration")
				incoming = incoming.replace(
					laterSegment,
					laterSegment.replace("2.000", "2.100"),
				);
			if (mode === "later discontinuity")
				incoming = incoming.replace(
					laterSegment,
					`#EXT-X-DISCONTINUITY\n#EXT-X-PROGRAM-DATE-TIME:${new Date(start + 22000).toISOString()}\n${laterSegment}`,
				);
			const before = JSON.stringify([...info._EmptyHoldTimelineByUrl]);
			const timeline = info._LivePlaylistTimeline;
			await expect(serve(incoming)).rejects.toMatchObject({
				name: "AbortError",
			});
			expect(JSON.stringify([...info._EmptyHoldTimelineByUrl])).toBe(before);
			expect(info._LivePlaylistTimeline).toBe(timeline);
		},
	);

	it.each([false, true])(
		"preserves native segments when a third rendition joins after a different segment clock (hold: %s)",
		async (usedHold) => {
			const { context, info, hold, serve } = setup();
			const otherUrl = nativeUrl.replace("native", "720p");
			const thirdUrl = nativeUrl.replace("native", "480p");
			info.Urls[otherUrl] = { Resolution: "1280x720", Codecs: codec };
			info.Urls[thirdUrl] = { Resolution: "852x480", Codecs: codec };
			const start = Date.parse("2026-10-08T15:22:20Z");
			const dated = (sequence: number, offset: number, prefix: string) =>
				playlist(sequence, prefix === "native" ? 3 : 4, prefix).replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + offset).toISOString()}\n#EXTINF:`,
				);
			if (usedHold) await hold();
			await serve(playlist(100), "site");
			context._resetStreamAdState(info, true);
			let primary = segments(await serve(dated(200, 0, "native")));
			let other = segments(
				context._applyPlaylistContinuity(
					info,
					otherUrl,
					dated(300, 500, "other"),
				),
			);
			let third = segments(
				context._applyPlaylistContinuity(
					info,
					thirdUrl,
					dated(400, 2000, "third"),
				),
			);
			for (let poll = 1; poll <= 5; poll++) {
				const nextPrimary = segments(
					await serve(dated(201 + poll, (poll + 1) * 2000, "native")),
				);
				const nextOther = segments(
					context._applyPlaylistContinuity(
						info,
						otherUrl,
						dated(301 + poll, (poll + 1) * 2000 + 500, "other"),
					),
				);
				const nextThird = segments(
					context._applyPlaylistContinuity(
						info,
						thirdUrl,
						dated(400 + poll, (poll + 1) * 2000, "third"),
					),
				);
				for (const [previous, next] of [
					[primary, nextPrimary],
					[other, nextOther],
					[third, nextThird],
				]) {
					for (const segment of next) {
						const served = previous.find(({ url }) => url === segment.url);
						if (served) expect(segment).toEqual(served);
						else
							expect(segment.sequence).toBeGreaterThan(
								previous.at(-1).sequence,
							);
					}
				}
				primary = nextPrimary;
				other = nextOther;
				third = nextThird;
			}
		},
	);

	it.each(["overlapping window", "advanced window"])(
		"does not rewind an idle rendition when its native anchor is outside the %s",
		async (mode) => {
			const { context, info, hold, serve } = setup();
			const otherUrl = nativeUrl.replace("native", "720p");
			info.Urls[otherUrl] = { Resolution: "1280x720", Codecs: codec };
			const start = Date.parse("2026-10-06T13:12:16Z");
			const dated = (sequence: number, count: number, time: number) =>
				playlist(sequence, count, "native").replace(
					"#EXTINF:",
					`#EXT-X-PROGRAM-DATE-TIME:${new Date(time).toISOString()}\n#EXTINF:`,
				);
			await hold();
			await serve(playlist(5500), "site");
			context._applyPlaylistContinuity(
				info,
				otherUrl,
				info.LastCleanBackupM3U8,
				info.BackupPlaylistMetadata.get(info.LastCleanBackupM3U8),
			);
			context._resetStreamAdState(info, true);
			await serve(dated(5600, 3, start));
			const current = segments(await serve(dated(5668, 5, start + 136000)));
			const overlaps = mode === "overlapping window";
			const incoming = dated(
				overlaps ? 6669 : 6674,
				2,
				start + (overlaps ? 138000 : 148000),
			);
			const joined = segments(
				context._applyPlaylistContinuity(info, otherUrl, incoming),
			);
			if (overlaps) {
				expect(joined[0].sequence).toBe(current[1].sequence);
				expect(joined[0].discontinuity).toBe(current[1].discontinuity);
			} else {
				expect(joined[0].sequence).toBeGreaterThan(current.at(-1).sequence);
				expect(joined[0].discontinuity).toBeGreaterThan(
					current.at(-1).discontinuity,
				);
				const returned = segments(await serve(dated(5672, 5, start + 144000)));
				expect(returned[0].url).toContain("native-5674.ts");
				expect(returned[0].sequence).toBe(joined[0].sequence);
				expect(returned[0].discontinuity).toBe(joined[0].discontinuity);
				expect(
					context._getEmptyHoldUpstreamUrl(
						info,
						`${nativeUrl}&_HLS_msn=${returned.at(-1).sequence + 1}`,
					),
				).toBe(`${nativeUrl}&_HLS_msn=5677`);
			}
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
			if (
				[
					"different time",
					"different duration",
					"different discontinuity",
				].includes(mode)
			) {
				const previous = JSON.stringify([...info._EmptyHoldTimelineByUrl]);
				const timeline = info._LivePlaylistTimeline;
				expect(() =>
					context._applyPlaylistContinuity(info, otherUrl, incoming),
				).toThrow("Live handoff playlist is behind the served broadcast time");
				expect(JSON.stringify([...info._EmptyHoldTimelineByUrl])).toBe(
					previous,
				);
				expect(info._LivePlaylistTimeline).toBe(timeline);
				return;
			}
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
		const log = vi.fn();
		context._log = log;
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
		expect(log).not.toHaveBeenCalled();
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

	it("retains the clean native date through the owned page fallback hold", async () => {
		const { context, info } = setup();
		const url =
			"https://video-weaver.example.ttvnw.net/native.m3u8?token=owned";
		const start = Date.parse("2026-10-07T02:30:00Z");
		let current = playlist(400).replace(
			"#EXTINF:",
			`#EXT-X-PROGRAM-DATE-TIME:${new Date(start).toISOString()}\n#EXTINF:`,
		);
		context.window = context;
		context.fetch = async () => new Response(current);
		context.state.CurrentAdMediaKey = null;
		context.state.CurrentAdChannel = null;
		context._canServePageSideAvcHold = () => true;
		context._ensurePageSideFallbackAdCycle = () => info.VisibleAdStartedAt;
		context._installPageSideM3U8Override();
		await context.fetch(url);
		current = playlist(403, 1, "stitched-ad").replace(
			"#EXTINF:",
			"#EXT-X-CUE-OUT:30\n#EXTINF:",
		);
		context.state.CurrentAdMediaKey = info.MediaKey;
		const hold = await (await context.fetch(url)).text();
		expect(hold).toContain(new Date(start + 6000).toISOString());
		expect(hold).not.toContain("stitched-ad");
		context.state.CurrentAdMediaKey = null;
		current = playlist(410).replace(
			"#EXTINF:",
			`#EXT-X-PROGRAM-DATE-TIME:${new Date(start + 8000).toISOString()}\n#EXTINF:`,
		);
		const native = await (await context.fetch(url)).text();
		expect(segments(native)[0].sequence).toBeGreaterThan(
			segments(hold).at(-1).sequence,
		);
		expect(native).toContain(new Date(start + 8000).toISOString());
	});

	it("rejects page fallback timing from a response that belongs to an older page generation", async () => {
		const { context } = setup();
		const url =
			"https://video-weaver.example.ttvnw.net/native.m3u8?token=owned";
		let release: (response: Response) => void;
		context.window = context;
		context.fetch = () =>
			new Promise<Response>((resolve) => {
				release = resolve;
			});
		context._installPageSideM3U8Override();
		const pending = context.fetch(url);
		context.state.PagePlaybackContextGeneration++;
		release(new Response(playlist(400)));
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
	});
});

describe("worker and page-side hook bounds", () => {
	it("does not log a cancelled page-side playlist request as an error", async () => {
		const { context } = setup();
		const log = vi.fn();
		context._log = log;
		const url = "https://video-weaver.example.ttvnw.net/native.m3u8?token=x";
		let failure: Error = new DOMException("Request cancelled", "AbortError");
		context.window = context;
		context.fetch = vi.fn(async () => {
			throw failure;
		});
		context._installPageSideM3U8Override();

		await expect(context.fetch(url)).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(log.mock.calls.filter(([, level]) => level === "error")).toEqual([]);

		failure = new TypeError("Failed to fetch");
		await expect(context.fetch(url)).rejects.toMatchObject({
			name: "TypeError",
		});
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("Page-side M3U8 inspection failed"),
			"error",
		);
	});

	it("filters a master to the selected variants and their media groups", () => {
		const { context } = setup();
		const base = "https://usher.example/channel/master.m3u8";
		const master = [
			"#EXTM3U",
			'#EXT-X-SESSION-DATA:DATA-ID="x",URI="session.json"',
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="hi",NAME="hi",AUTOSELECT=YES',
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="lo",NAME="lo",AUTOSELECT=YES',
			'#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080,CODECS="avc1.64002A,mp4a.40.2",AUDIO="hi"',
			"1080p.m3u8",
			'#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360,CODECS="avc1.4D401E,mp4a.40.2",AUDIO="lo"',
			"360p.m3u8",
			'#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,URI="iframe.m3u8"',
		];
		const filter = (
			lines: string[],
			isSelected: (index: number) => boolean,
		): string | null =>
			context._filterMasterToSelectedVariants(lines, base, isSelected);

		expect(filter(master, (index) => index === 4)).toBe(
			[
				"#EXTM3U",
				'#EXT-X-SESSION-DATA:DATA-ID="x",URI="https://usher.example/channel/session.json"',
				master[2],
				master[4],
				"https://usher.example/channel/1080p.m3u8",
			].join("\n"),
		);

		const external = [...master];
		external[2] =
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="hi",NAME="hi",URI="hi.m3u8"';
		expect(filter(external, (index) => index === 4)).toBeNull();
		expect(filter(external, (index) => index === 6)).toContain(
			"https://usher.example/channel/360p.m3u8",
		);
	});

	it("keeps a large master's variant codecs after a playback observation", () => {
		const { context } = setup();
		const variantUrl = (index: number) =>
			`https://video-weaver.example.ttvnw.net/v${index}.m3u8?token=${index}`;
		const master = [
			"#EXTM3U",
			...Array.from({ length: 20 }, (_, index) => [
				'#EXT-X-STREAM-INF:RESOLUTION=1280x720,CODECS="avc1.4D401F,mp4a.40.2"',
				variantUrl(index),
			]).flat(),
		].join("\n");
		const size = () =>
			runInContext("_pageSideVariantCodecByUrl.size", context) as number;

		context._rememberPageSideVariantCodecs(
			master,
			"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8",
		);
		const learned = size();
		expect(learned).toBeGreaterThan(40);

		context._rememberPageSidePlaybackOwner(
			"live:testchannel",
			variantUrl(0),
			"avc1.4D401F",
			0,
			{ confirmedPlayback: true, workerGeneration: 1 },
		);
		expect(size()).toBe(learned);
	});

	it("keeps at most five stream infos when another stream starts", async () => {
		const { context } = setup();
		runInContext(
			"for (const key of Object.keys(state.StreamInfos)) delete state.StreamInfos[key];",
			context,
		);
		context.fetch = vi.fn(async (input: unknown) => {
			const channel = String(input).match(/hls\/(\w+)\.m3u8/)?.[1];
			return new Response(
				`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720,CODECS="avc1.4D401F,mp4a.40.2"\nhttps://video-weaver.example.ttvnw.net/${channel}.m3u8`,
			);
		});
		context._hookWorkerFetch();

		for (let index = 0; index < 6; index++) {
			await context.fetch(
				`https://usher.ttvnw.net/api/channel/hls/channel${index}.m3u8?token=x`,
			);
		}
		const keys = Object.keys(context.state.StreamInfos);
		expect(keys).toHaveLength(5);
		expect(keys).toContain("live:channel5");
	});

	it("reports an ignored VOD ad request as not counted", () => {
		const { context } = setup();
		context.state.IsAdStrippingEnabled = false;
		expect(context._recordBlockedVodAdRequest({ mediaKey: "vod:123" })).toBe(
			false,
		);
	});
});
