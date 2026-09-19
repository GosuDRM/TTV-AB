import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { T } from "./setup";

const g = globalThis as Record<string, unknown>;
const cleanTwitchPlaylist = readFileSync(
	resolve(__dirname, "fixtures/twitch-clean-media.m3u8"),
	"utf8",
).trimEnd();

describe("_parseAttrs", () => {
	const fn = () => T<(s: string) => Record<string, string>>("_parseAttrs");
	it("parses key=value pairs", () => {
		const r = fn()(
			'RESOLUTION=1920x1080,CODECS="avc1.4d002a",BANDWIDTH=5000000',
		);
		expect(r.RESOLUTION).toBe("1920x1080");
		expect(r.CODECS).toBe("avc1.4d002a");
	});
	it("handles quoted values", () => {
		expect(fn()('NAME="1080p60"').NAME).toBe("1080p60");
	});
	it("empty input", () => {
		expect(Object.keys(fn()("")).length).toBe(0);
	});
	it("resets lastIndex", () => {
		const f = fn();
		f('A="x"');
		expect(f('B="y"').B).toBe("y");
	});
});

describe("_hasExplicitAdMetadata", () => {
	const fn = () => T<(t: unknown) => boolean>("_hasExplicitAdMetadata");
	it("stitched-ad", () => {
		expect(fn()("stitched-ad-123")).toBe(true);
	});
	it("adsquared", () => {
		expect(fn()("/adsquared/path")).toBe(true);
	});
	it("SCTE35-OUT", () => {
		expect(fn()("SCTE35-OUT")).toBe(true);
	});
	it("X-TV-TWITCH-AD", () => {
		expect(fn()("X-TV-TWITCH-AD")).toBe(true);
	});
	it('"MIDROLL"', () => {
		expect(fn()('"MIDROLL"')).toBe(true);
	});
	it("clean content", () => {
		expect(fn()("#EXTINF:2.0")).toBe(false);
	});
	it("non-string", () => {
		expect(fn()(null)).toBe(false);
	});
	it("recognizes Twitch ad classes regardless of attribute order", () => {
		for (const attributes of [
			'CLASS="twitch-ad",ID="opaque"',
			'ID="opaque",CLASS="twitch-ad"',
		]) {
			expect(fn()(`#EXT-X-DATERANGE:${attributes}`)).toBe(true);
		}
		expect(fn()('#EXT-X-DATERANGE:ID="opaque",CLASS="chapter"')).toBe(false);
	});
	it.each([
		"timestamp",
		"twitch-session",
		"twitch-stream-source",
		"twitch-trigger",
		"twitch-admin",
	])(
		"does not classify %s metadata as an ad in any attribute order",
		(klass) => {
			for (const attrs of [
				`ID="opaque",CLASS="${klass}"`,
				`CLASS="${klass}",ID="opaque"`,
			]) {
				expect(fn()(`#EXT-X-DATERANGE:${attrs}`)).toBe(false);
			}
		},
	);
	it.each(["twitch-ad", "twitch-stitched-ad", "twitch-ad-quartile"])(
		"still blocks %s metadata alongside ordinary Twitch tags",
		(klass) => {
			for (const attrs of [
				`ID="opaque",CLASS="${klass}"`,
				`CLASS="${klass}",ID="opaque"`,
			]) {
				expect(fn()(`${cleanTwitchPlaylist}\n#EXT-X-DATERANGE:${attrs}`)).toBe(
					true,
				);
			}
		},
	);
	it("preserves a clean Twitch playlist with session, source, trigger and prefetch metadata", () => {
		expect(fn()(cleanTwitchPlaylist)).toBe(false);
		const info = { NumStrippedAdSegments: 0, IsStrippingAdSegments: false };
		expect(
			T<(text: string, all: boolean, info: object) => string>("_stripAds")(
				cleanTwitchPlaylist,
				false,
				info,
			),
		).toBe(cleanTwitchPlaylist);
		expect(info.IsStrippingAdSegments).toBe(false);
		expect(info.NumStrippedAdSegments).toBe(0);
	});
});

describe("_isKnownAdSegmentUrl", () => {
	const fn = () =>
		T<(url: string, opts?: { includeCached?: boolean }) => boolean>(
			"_isKnownAdSegmentUrl",
		);
	it("stitched URL", () => {
		expect(fn()("https://edge/stitched-ad.ts")).toBe(true);
	});
	it("adsquared URL", () => {
		expect(fn()("https://adsquared/ad.ts")).toBe(true);
	});
	it("processing URL (no longer treated as ad)", () => {
		expect(fn()("https://edge/processing/seg.ts")).toBe(false);
	});
	it("normal segment", () => {
		expect(fn()("https://edge/normal.ts")).toBe(false);
	});
	it("empty", () => {
		expect(fn()("")).toBe(false);
	});
	it("usher master playlist for a channel login containing the signifier", () => {
		expect(
			fn()(
				"https://usher.ttvnw.net/api/channel/hls/stitchedup.m3u8?allow_source=true",
			),
		).toBe(false);
	});
	it("media playlist with the signifier in an opaque token", () => {
		expect(
			fn()(
				"https://video-weaver.sea01.hls.ttvnw.net/v1/playlist/Cstitched.m3u8",
			),
		).toBe(false);
	});
	it("stitched segment is still blocked", () => {
		expect(
			fn()("https://video-edge.ttvnw.net/v1/segment/stitched-ad-123.ts"),
		).toBe(true);
	});
});

describe("ad media URI coverage", () => {
	it.each(["\n", "\r\n"])(
		"detects and removes ad prefetches with %j line endings",
		(newline) => {
			const playlist = [
				"#EXTM3U",
				"#EXTINF:2,live",
				"https://edge/clean.ts",
				"#EXT-X-TWITCH-PREFETCH:https://edge/_404/ad.ts",
			].join(newline);
			expect(
				T<(text: string) => boolean>("_playlistHasKnownAdSegments")(playlist),
			).toBe(true);
			const info = { NumStrippedAdSegments: 0, IsStrippingAdSegments: false };
			const output = T<(text: string, all: boolean, info: object) => string>(
				"_stripAds",
			)(playlist, false, info);
			expect(output).toContain("https://edge/clean.ts");
			expect(output).not.toContain("/_404/");
			expect(info.IsStrippingAdSegments).toBe(true);
		},
	);

	it("serves advancing hold media when an ad prefetch is the only media entry", () => {
		const output = T<(text: string, all: boolean, info: object) => string>(
			"_stripAds",
		)(
			"#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:8\n#EXT-X-TWITCH-PREFETCH:https://edge/_404/ad.ts",
			false,
			{ NumStrippedAdSegments: 0 },
		);
		expect(output).not.toContain("/_404/");
		expect(output).toContain("__ttvab_empty_hold_segment.ts");
		expect(output).toContain("#EXT-X-MEDIA-SEQUENCE:9");
	});

	it.each(["#EXT-X-BYTERANGE:1024@0", "#EXT-X-GAP", "#segment metadata\n"])(
		"removes the ad URL across intervening tags: %s",
		(tag) => {
			const playlist = `#EXTM3U\n#EXTINF:2,live\n${tag}\nhttps://edge/_404/ad.ts\n#EXTINF:2,live\nhttps://edge/clean.ts`;
			expect(
				T<(text: string) => boolean>("_playlistHasKnownAdSegments")(playlist),
			).toBe(true);
			const output = T<(text: string, all: boolean, info: object) => string>(
				"_stripAds",
			)(playlist, false, { NumStrippedAdSegments: 0 });
			expect(output).not.toContain("/_404/");
			expect(output).not.toContain("#EXT-X-BYTERANGE");
			expect(output).not.toContain("#EXT-X-GAP");
			expect(output).toContain("#EXTINF:2,live\nhttps://edge/clean.ts");
		},
	);

	it("retains clean prefetches and playlist URLs containing the signifier", () => {
		const playlist =
			"#EXTM3U\n#EXTINF:2,live\nhttps://edge/clean.ts\n#EXT-X-TWITCH-PREFETCH:https://edge/next.ts";
		expect(
			T<(text: string) => boolean>("_playlistHasKnownAdSegments")(playlist),
		).toBe(false);
		expect(
			T<(text: string, all: boolean, info: object) => string>("_stripAds")(
				playlist,
				false,
				{ NumStrippedAdSegments: 0 },
			),
		).toBe(playlist);
		expect(
			T<(text: string) => boolean>("_playlistHasKnownAdSegments")(
				"#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nhttps://edge/stitched.m3u8",
			),
		).toBe(false);
	});

	it("does not transfer a stripped segment's leading byte range or gap to clean playback", () => {
		const playlist =
			"#EXTM3U\n#EXT-X-BYTERANGE:1024@0\n#EXT-X-GAP\n#EXTINF:2,live\nhttps://edge/_404/ad.ts\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:2,live\nhttps://edge/clean.ts";
		const output = T<(text: string, all: boolean, info: object) => string>(
			"_stripAds",
		)(playlist, false, { NumStrippedAdSegments: 0 });
		expect(output).not.toContain("/_404/");
		expect(output).not.toContain("#EXT-X-BYTERANGE");
		expect(output).not.toContain("#EXT-X-GAP");
		expect(output).toContain("#EXT-X-KEY:METHOD=NONE");
		expect(output).toContain("https://edge/clean.ts");
	});

	it("keeps cached ad lookups opt-in for opaque CRLF prefetch and tagged segments", () => {
		const state = g.__TTVAB_STATE__ as { AdSegmentCache: Map<string, number> };
		state.AdSegmentCache.set("https://edge/opaque-ad.ts", Date.now());
		try {
			for (const entries of [
				"#EXTINF:2,live\r\n#EXT-X-BYTERANGE:1024@0\r\nhttps://edge/opaque-ad.ts\r\n",
				"#EXT-X-TWITCH-PREFETCH:https://edge/opaque-ad.ts\r\n",
			]) {
				const hasAds = T<
					(text: string, options?: { includeCached: boolean }) => boolean
				>("_playlistHasKnownAdSegments");
				expect(hasAds(`#EXTM3U\r\n${entries}`)).toBe(true);
				expect(hasAds(`#EXTM3U\r\n${entries}`, { includeCached: false })).toBe(
					false,
				);
			}
		} finally {
			state.AdSegmentCache.delete("https://edge/opaque-ad.ts");
		}
	});
});

describe("_isMediaPartLine", () => {
	const fn = () => T<(l: string) => boolean>("_isMediaPartLine");
	it("detects media part", () => {
		expect(fn()('#EXT-X-PART:DURATION=0.5,URI="p.ts"')).toBe(true);
		expect(fn()("#EXTINF:2.0")).toBe(false);
	});
});

describe("_isPartPreloadHintLine", () => {
	const fn = () => T<(l: string) => boolean>("_isPartPreloadHintLine");
	it("detects preload hint", () => {
		expect(fn()('#EXT-X-PRELOAD-HINT:TYPE=PART,URI="p.ts"')).toBe(true);
		expect(fn()('#EXT-X-PRELOAD-HINT:TYPE="PART",URI="p.ts"')).toBe(true);
		expect(fn()("#EXTINF:2.0")).toBe(false);
	});
});

describe("_absolutizePlaylistUrl", () => {
	const fn = () =>
		T<(raw: string, base: string | null) => string>("_absolutizePlaylistUrl");
	it("resolves relative", () => {
		expect(fn()("seg.ts", "https://edge/playlist.m3u8")).toBe(
			"https://edge/seg.ts",
		);
	});
	it("keeps absolute", () => {
		expect(fn()("https://other/seg.ts", "https://base/")).toBe(
			"https://other/seg.ts",
		);
	});
});

describe("_getServerTime", () => {
	beforeAll(() => {
		(g.__TTVAB_STATE__ as Record<string, unknown>).V2API = true;
	});
	it("extracts server time", () => {
		const fn = T<(m: string) => string | null>("_getServerTime");
		expect(fn('#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="1234.5"')).toBe(
			"1234.5",
		);
	});
});

describe("_replaceServerTime", () => {
	beforeAll(() => {
		(g.__TTVAB_STATE__ as Record<string, unknown>).V2API = true;
	});
	it("replaces time in V2 format", () => {
		const fn = T<(m: string, t: string) => string>("_replaceServerTime");
		const r = fn(
			'#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="old"',
			"new",
		);
		expect(r).toContain('VALUE="new"');
	});
	it("no-op for falsy time", () => {
		const fn = T<(m: string, t: string | null) => string>("_replaceServerTime");
		expect(fn("original", "")).toBe("original");
	});
});

describe("_stripAds (empty-playlist recovery)", () => {
	const fn = () =>
		T<
			(
				text: string,
				stripAll: boolean,
				info: Record<string, unknown>,
				skipAutoForceStrip?: boolean,
				preserveLiveSegments?: boolean,
			) => string
		>("_stripAds");
	const getState = () => g.__TTVAB_STATE__ as Record<string, unknown>;

	it("serves an empty hold segment when stripping leaves nothing and no clean backup is cached", () => {
		const st = getState();
		const originalSimulated = st.SimulatedAdsDepth;
		const originalAllSegments = st.AllSegmentsAreAdSegments;
		st.SimulatedAdsDepth = 0;
		st.AllSegmentsAreAdSegments = false;

		const adPlaylist = [
			"#EXTM3U",
			"#EXT-X-VERSION:3",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:0",
			"#EXT-X-DATERANGE:",
			'#EXT-X-DATERANGE-ID="stitched-ad-1"',
			'#EXT-X-DATERANGE-START-DATE="2026-06-02T00:00:00Z"',
			'#EXT-X-DATERANGE-ATTR:X-TV-TWITCH-AD-URL="https://ad.example"',
			'#EXT-X-DATERANGE-ATTR:X-TV-TWITCH-AD-CLICK-TRACKING-URL="https://ad.example"',
			"#EXT-X-CUE-OUT:DURATION=15",
			"#EXTINF:2.0,",
			"https://edge/stitched-ad-1.ts",
			"#EXTINF:2.0,",
			"https://edge/stitched-ad-2.ts",
			"#EXTINF:2.0,",
			"https://edge/stitched-ad-3.ts",
			"",
		].join("\n");

		const info = makeInfo();
		const result = fn()(adPlaylist, true, info, false);
		expect(result).not.toBe(adPlaylist);
		expect(result).not.toContain("stitched-ad");
		expect(result).not.toContain("https://edge/stitched-ad");
		expect(result).toContain("#EXT-X-DISCONTINUITY");
		expect(result).toContain("#EXTINF:1.024,live");
		expect(result).toContain(
			"https://www.twitch.tv/__ttvab_empty_hold_segment.ts",
		);
		expect(result).not.toContain("data:video/mp4;base64,");
		expect(result).toContain("#EXT-X-MEDIA-SEQUENCE:3");

		const nextResult = fn()(adPlaylist, true, info, false);
		expect(nextResult).toContain("#EXT-X-MEDIA-SEQUENCE:4");

		st.SimulatedAdsDepth = originalSimulated;
		st.AllSegmentsAreAdSegments = originalAllSegments;
	});

	it("advances discontinuity ownership as earlier hold boundaries leave the playlist", () => {
		const create = T<(text: string, info: Record<string, unknown>) => string>(
			"_createEmptyAdHoldPlaylist",
		);
		const info = makeInfo();
		const input =
			"#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:100\n#EXT-X-DISCONTINUITY-SEQUENCE:4\n#EXTINF:2,stitched-ad\nad.ts";
		const first = create(input, info);
		const second = create(input, info);
		expect(first).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:4");
		expect(second).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:5");
		expect(second).toContain("#EXT-X-MEDIA-SEQUENCE:102");
	});

	it.each([
		["#EXTINF:2,live\nfull.ts", 101],
		['#EXT-X-PART:DURATION=0.5,URI="part.ts"\n#EXTINF:2,live\nfull.ts', 101],
		['#EXTINF:2,live\nfull.ts\n#EXT-X-PART:DURATION=0.5,URI="part.ts"', 102],
		[
			'#EXTINF:2,live\nfull.ts\n#EXT-X-PRELOAD-HINT:TYPE=PART,URI="part.ts"',
			102,
		],
		[
			'#EXTINF:2,live\nfull.ts\n#EXT-X-PRELOAD-HINT:TYPE=MAP,URI="init.mp4"',
			101,
		],
		[
			"#EXTINF:2,live\nfull.ts\n#EXT-X-TWITCH-PREFETCH:next.ts\n#EXT-X-TWITCH-PREFETCH:later.ts",
			103,
		],
		["#EXT-X-SKIP:SKIPPED-SEGMENTS=5\n#EXTINF:2,live\nfull.ts", 106],
	])(
		"places hold media after the complete low-latency window: %s",
		(media, expected) => {
			const create = T<(text: string, info: Record<string, unknown>) => string>(
				"_createEmptyAdHoldPlaylist",
			);
			const info = makeInfo();
			const input = `#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:100\n${media}`;
			const first = create(input, info);
			const second = create(input, info);
			expect(first).toContain(`#EXT-X-MEDIA-SEQUENCE:${expected}\n`);
			expect(first).toContain(`?seq=${expected}&`);
			expect(second).toContain(
				`#EXT-X-MEDIA-SEQUENCE:${Number(expected) + 1}\n`,
			);
			expect(first).not.toContain("full.ts");
			expect(first).not.toContain("part.ts");
		},
	);

	it("uses self-contained transport media without native initialization, encryption or byte ranges", () => {
		const create = T<(text: string, info: Record<string, unknown>) => string>(
			"_createEmptyAdHoldPlaylist",
		);
		const input = [
			"#EXTM3U",
			"#EXT-X-VERSION:3",
			"#EXT-X-TARGETDURATION:2",
			"#EXT-X-MEDIA-SEQUENCE:100",
			'#EXT-X-MAP:URI="native-init.mp4"',
			'#EXT-X-KEY:METHOD=AES-128,URI="native.key"',
			"#EXT-X-BYTERANGE:4096@100",
			"#EXT-X-DISCONTINUITY",
			"#EXTINF:2,stitched-ad",
			"ad.mp4",
		].join("\n");
		const output = create(input, makeInfo());
		expect(output).toContain("#EXT-X-VERSION:3");
		expect(output).not.toContain("#EXT-X-MAP");
		expect(output).toContain("#EXT-X-KEY:METHOD=NONE");
		expect(output).not.toContain("native-init");
		expect(output).not.toContain("native.key");
		expect(output).not.toContain("#EXT-X-BYTERANGE");
		expect(
			output.split("\n").filter((line) => line === "#EXT-X-DISCONTINUITY"),
		).toHaveLength(1);
	});

	it("advances complete AVC and AAC packets together, including at the transport clock wrap", async () => {
		const respond = T<
			(url: string, realFetch: typeof fetch) => Promise<Response>
		>("_getEmptyAdHoldResponse");
		const original = Buffer.from(
			String(g._EMPTY_HOLD_SEGMENT_URL).split(",")[1],
			"base64",
		);
		const realFetch = (async () => new Response(original)) as typeof fetch;
		const inspect = (bytes: Buffer) => {
			const normalized = Buffer.from(bytes);
			const clocks: number[] = [];
			const timestamps: number[] = [];
			const videoTimes: number[] = [];
			const audioTimes: number[] = [];
			const packets = new Map<number, Buffer[]>();
			const audio: Buffer[] = [];
			const finishPacket = (pid: number) => {
				const parts = packets.get(pid);
				if (!parts) return;
				const packet = Buffer.concat(parts);
				expect(packet.readUInt16BE(4)).toBe(packet.length - 6);
				expect(packet.length).toBeGreaterThan(9 + packet[8]);
				if (packet[3] === 192) audio.push(packet.subarray(9 + packet[8]));
			};
			expect(bytes.length % 188).toBe(0);
			for (let offset = 0; offset < bytes.length; offset += 188) {
				expect(bytes[offset]).toBe(71);
				const pid = bytes.readUInt16BE(offset + 1) & 8191;
				let payload = offset + 4;
				if (bytes[offset + 3] & 32) {
					const length = bytes[payload];
					if (length >= 7 && bytes[payload + 1] & 16) {
						const pcr = payload + 2;
						clocks.push(bytes.readUInt32BE(pcr) * 2 + (bytes[pcr + 4] >> 7));
						normalized.fill(0, pcr, pcr + 4);
						normalized[pcr + 4] &= 127;
					}
					payload += 1 + length;
				}
				if (!(bytes[offset + 3] & 16)) continue;
				if (bytes[offset + 1] & 64) {
					finishPacket(pid);
					packets.delete(pid);
					if (bytes.readUIntBE(payload, 3) !== 1) continue;
					packets.set(pid, []);
					const flags = bytes[payload + 7] >> 6;
					expect([2, 3]).toContain(flags);
					for (let index = 0; index < (flags === 3 ? 2 : 1); index++) {
						const position = payload + 9 + index * 5;
						const value =
							((bytes[position] >> 1) & 7) * 2 ** 30 +
							(bytes.readUInt16BE(position + 1) >> 1) * 2 ** 15 +
							(bytes.readUInt16BE(position + 3) >> 1);
						timestamps.push(value);
						if (index === 0) {
							(bytes[payload + 3] === 224 ? videoTimes : audioTimes).push(
								value,
							);
						}
						normalized.fill(0, position, position + 5);
					}
				}
				packets.get(pid)?.push(bytes.subarray(payload, offset + 188));
			}
			for (const pid of packets.keys()) finishPacket(pid);
			const audioBytes = Buffer.concat(audio);
			let audioFrames = 0;
			for (let offset = 0; offset < audioBytes.length; audioFrames++) {
				expect(audioBytes.readUInt16BE(offset) & 65526).toBe(65520);
				const length =
					(audioBytes[offset + 3] & 3) * 2048 +
					audioBytes[offset + 4] * 8 +
					(audioBytes[offset + 5] >> 5);
				expect(length).toBeGreaterThan(7);
				expect(offset + length).toBeLessThanOrEqual(audioBytes.length);
				offset += length;
			}
			expect(audioFrames).toBe(48);
			expect(videoTimes).toHaveLength(32);
			expect(videoTimes[0]).toBe(audioTimes[0]);
			return { normalized, clocks, timestamps, videoTimes };
		};
		const template = inspect(original);
		expect(template.videoTimes).toEqual(
			Array.from({ length: 32 }, (_, index) => index * 2880),
		);
		expect(template.clocks.length).toBeGreaterThan(0);
		for (const sequence of [1, 2, 93_206, 93_207, 1_000_000_000]) {
			const response = await respond(
				`https://www.twitch.tv/__ttvab_empty_hold_segment.ts?seq=${sequence}`,
				realFetch,
			);
			expect(response.headers.get("content-type")).toBe("video/mp2t");
			expect(response.headers.get("cache-control")).toBe("no-store");
			const advanced = inspect(Buffer.from(await response.arrayBuffer()));
			expect(advanced.normalized).toEqual(template.normalized);
			const advance = (value: number) => (value + sequence * 92160) % 2 ** 33;
			expect(advanced.timestamps).toEqual(template.timestamps.map(advance));
			expect(advanced.clocks).toEqual(template.clocks.map(advance));
		}
	});

	it("rejects malformed and canceled synthetic media instead of returning undecodable bytes", async () => {
		const respond = T<
			(
				url: string,
				realFetch: typeof fetch,
				signal?: AbortSignal,
			) => Promise<Response>
		>("_getEmptyAdHoldResponse");
		const original = Buffer.from(
			String(g._EMPTY_HOLD_SEGMENT_URL).split(",")[1],
			"base64",
		);
		const url = "https://www.twitch.tv/__ttvab_empty_hold_segment.ts?seq=1";
		for (const sequence of ["0", "-1", "NaN", "1.5", "9007199254740992"]) {
			await expect(
				respond(url.replace("seq=1", `seq=${sequence}`), fetch),
			).rejects.toThrow("Invalid empty hold media sequence");
		}
		for (const bytes of [
			Buffer.alloc(0),
			original.subarray(0, -1),
			Buffer.alloc(188),
		]) {
			await expect(
				respond(url, (async () => new Response(bytes)) as typeof fetch),
			).rejects.toThrow("Invalid empty hold transport");
		}
		const controller = new AbortController();
		await expect(
			respond(
				url,
				(async () => {
					controller.abort();
					return new Response(original);
				}) as typeof fetch,
				controller.signal,
			),
		).rejects.toMatchObject({ name: "AbortError" });
	});

	it("recognizes only synthetic empty hold segment URLs", () => {
		const fn = T<(url: string) => boolean>("_isEmptyAdHoldSegmentUrl");
		expect(
			fn("https://www.twitch.tv/__ttvab_empty_hold_segment.ts?seq=1"),
		).toBe(true);
		expect(
			fn("https://static-cdn.jtvnw.net/__ttvab_empty_hold_segment.ts"),
		).toBe(false);
		expect(fn("https://www.twitch.tv/normal-segment.mp4")).toBe(false);
	});

	it("never replays a cached media snapshot after stripping every ad segment", () => {
		const adPlaylist = [
			"#EXTM3U",
			"#EXT-X-MEDIA-SEQUENCE:40",
			"#EXT-X-DATERANGE:",
			'#EXT-X-DATERANGE-ID="stitched-ad-1"',
			"#EXTINF:2.0,",
			"https://edge.example/stitched-ad-1.ts",
			"",
		].join("\n");
		const cachedBackup = [
			"#EXTM3U",
			"#EXT-X-MEDIA-SEQUENCE:10",
			"#EXTINF:2.0,live",
			"https://edge.example/old-clean-backup.ts",
			"",
		].join("\n");
		const cachedNative = [
			"#EXTM3U",
			"#EXT-X-MEDIA-SEQUENCE:20",
			"#EXTINF:2.0,live",
			"https://edge.example/old-clean-native.ts",
			"",
		].join("\n");
		const info = makeInfo({
			LastCleanBackupM3U8: cachedBackup,
			LastCleanBackupAt: Date.now(),
			LastCleanNativeM3U8: cachedNative,
			LastCleanNativePlaylistAt: Date.now(),
		});

		const result = fn()(adPlaylist, true, info, false);

		expect(result).not.toContain("old-clean-backup.ts");
		expect(result).not.toContain("old-clean-native.ts");
		expect(result).toContain(
			"https://www.twitch.tv/__ttvab_empty_hold_segment.ts",
		);
		expect(result).toContain("#EXT-X-MEDIA-SEQUENCE:41");
	});

	it("fails closed on explicit ad metadata even when neutral live URLs were requested to be preserved", () => {
		const playlist = [
			"#EXTM3U",
			"#EXT-X-MEDIA-SEQUENCE:70",
			"#EXT-X-CUE-OUT:DURATION=30",
			"#EXTINF:2.0,live",
			"https://edge.example/segment-70.ts",
			"#EXTINF:2.0,live",
			"https://edge.example/segment-71.ts",
			"",
		].join("\n");

		const result = fn()(playlist, false, makeInfo(), true, true);

		expect(result).not.toContain("segment-70.ts");
		expect(result).not.toContain("segment-71.ts");
		expect(result).toContain(
			"https://www.twitch.tv/__ttvab_empty_hold_segment.ts",
		);
		expect(result).toContain("#EXT-X-MEDIA-SEQUENCE:72");
	});

	it("still removes explicit known ad segments when auto-force stripping is skipped", () => {
		const st = getState();
		const originalCache = st.AdSegmentCache;
		st.AdSegmentCache = new Map<string, number>();

		try {
			const playlist = [
				"#EXTM3U",
				"#EXT-X-VERSION:3",
				"#EXT-X-TARGETDURATION:2",
				"#EXT-X-MEDIA-SEQUENCE:0",
				'#EXT-X-DATERANGE:ID="ad-1",X-TV-TWITCH-AD-POD-LENGTH="1"',
				"#EXTINF:2.0,",
				"https://edge.example/stitched-ad-1.ts",
				"#EXTINF:2.0,",
				"https://edge.example/live-1.ts",
				"",
			].join("\n");
			const info = makeInfo({ NumStrippedAdSegments: 0 });
			const result = fn()(playlist, false, info, true);

			expect(result).not.toContain("https://edge.example/stitched-ad-1.ts");
			expect(result).toContain("https://edge.example/live-1.ts");
			expect(info.NumStrippedAdSegments).toBe(1);
		} finally {
			st.AdSegmentCache = originalCache;
		}
	});

	function makeInfo(overrides: Record<string, unknown> = {}) {
		return {
			LastCleanBackupM3U8: null,
			LastCleanNativeM3U8: null,
			LastCleanNativePlaylistAt: 0,
			...overrides,
		};
	}
});
