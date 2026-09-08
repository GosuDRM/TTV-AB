import { beforeAll, describe, expect, it } from "vitest";
import { T } from "./setup";

const g = globalThis as Record<string, unknown>;

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
		expect(result).toContain("#EXTINF:1.021,live");
		expect(result).toContain(
			"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4",
		);
		expect(result).not.toContain("data:video/mp4;base64,");
		expect(result).toContain("#EXT-X-MEDIA-SEQUENCE:1");

		const nextResult = fn()(adPlaylist, true, info, false);
		expect(nextResult).toContain("#EXT-X-MEDIA-SEQUENCE:2");

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

	it("uses its own initialization section without inheriting native encryption or byte ranges", () => {
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
		expect(output).toContain("#EXT-X-VERSION:7");
		expect(output).toMatch(
			/#EXT-X-MAP:URI="https:\/\/www\.twitch\.tv\/__ttvab_empty_hold_segment\.mp4\?[^"\n]*init=1"/,
		);
		expect(output).not.toContain("native-init");
		expect(output).not.toContain("native.key");
		expect(output).not.toContain("#EXT-X-BYTERANGE");
		expect(
			output.split("\n").filter((line) => line === "#EXT-X-DISCONTINUITY"),
		).toHaveLength(1);
	});

	it("advances both hold tracks on the same clock without changing decodable media", async () => {
		const respond = T<
			(url: string, realFetch: typeof fetch) => Promise<Response>
		>("_getEmptyAdHoldResponse");
		const original = Buffer.from(
			String(g._EMPTY_SEGMENT_URL).split(",")[1],
			"base64",
		);
		const realFetch = (async () => new Response(original)) as typeof fetch;
		const boxes = (bytes: Buffer) => {
			const result: Record<string, Buffer> = {};
			for (let offset = 0; offset < bytes.length; ) {
				const size = bytes.readUInt32BE(offset);
				expect(size).toBeGreaterThanOrEqual(8);
				expect(offset + size).toBeLessThanOrEqual(bytes.length);
				const type = bytes.toString("ascii", offset + 4, offset + 8);
				result[type] = bytes.subarray(offset, offset + size);
				offset += size;
			}
			return result;
		};
		const originalBoxes = boxes(original);
		const timescales = new Map<number, number>();
		const moov = originalBoxes.moov;
		for (let offset = 8; offset < moov.length; ) {
			const size = moov.readUInt32BE(offset);
			if (moov.toString("ascii", offset + 4, offset + 8) === "trak") {
				const track = boxes(moov.subarray(offset + 8, offset + size));
				const media = boxes(track.mdia.subarray(8));
				timescales.set(
					track.tkhd.readUInt32BE(20),
					media.mdhd.readUInt32BE(20),
				);
			}
			offset += size;
		}
		expect(timescales).toEqual(
			new Map([
				[1, 16384],
				[2, 48000],
			]),
		);
		let previousVideoTime = -1n;
		for (const sequence of [1, 2, 1_000_000_000]) {
			const response = await respond(
				`https://www.twitch.tv/__ttvab_empty_hold_segment.mp4?seq=${sequence}`,
				realFetch,
			);
			const media = Buffer.from(await response.arrayBuffer());
			const fragments = boxes(media);
			expect(fragments.mdat).toEqual(originalBoxes.mdat);
			expect(fragments.mfra).toBeUndefined();
			const moof = fragments.moof;
			const tracks = new Map<number, bigint>();
			for (let offset = 8; offset < moof.length; ) {
				const size = moof.readUInt32BE(offset);
				const type = moof.toString("ascii", offset + 4, offset + 8);
				if (type === "mfhd") {
					expect(moof.readUInt32BE(offset + 12)).toBe(sequence);
				} else if (type === "traf") {
					const track = boxes(moof.subarray(offset + 8, offset + size));
					const trackId = track.tfhd.readUInt32BE(12);
					expect(track.tfdt[8]).toBe(1);
					tracks.set(trackId, track.tfdt.readBigUInt64BE(12));
					if (trackId === 1) {
						expect(track.tfhd.readUInt32BE(16)).toBe(16734);
					}
				}
				offset += size;
			}
			const videoTime = tracks.get(1) as bigint;
			const audioTime = tracks.get(2) as bigint;
			expect(videoTime).toBeGreaterThan(previousVideoTime);
			expect(videoTime).toBe(BigInt(sequence) * 16734n);
			expect(audioTime * 16384n - videoTime * 48000n).toBeGreaterThanOrEqual(
				0n,
			);
			expect(audioTime * 16384n - videoTime * 48000n).toBeLessThan(16384n);
			previousVideoTime = videoTime;
		}
	});

	it("recognizes only synthetic empty hold segment URLs", () => {
		const fn = T<(url: string) => boolean>("_isEmptyAdHoldSegmentUrl");
		expect(
			fn("https://www.twitch.tv/__ttvab_empty_hold_segment.mp4?seq=1"),
		).toBe(true);
		expect(
			fn("https://static-cdn.jtvnw.net/__ttvab_empty_hold_segment.mp4"),
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
			"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4",
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
			"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4",
		);
		expect(result).toContain("#EXT-X-MEDIA-SEQUENCE:71");
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
