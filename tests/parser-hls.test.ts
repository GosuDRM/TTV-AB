import { describe, it, expect, beforeAll } from "vitest";
import { T } from "./setup";

const g = globalThis as Record<string, unknown>;

describe("_parseAttrs", () => {
	const fn = () => T<(s: string) => Record<string, string>>("_parseAttrs");
	it("parses key=value pairs", () => {
		const r = fn()('RESOLUTION=1920x1080,CODECS="avc1.4d002a",BANDWIDTH=5000000');
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
	it("stitched-ad", () => { expect(fn()("stitched-ad-123")).toBe(true); });
	it("adsquared", () => { expect(fn()("/adsquared/path")).toBe(true); });
	it("SCTE35-OUT", () => { expect(fn()("SCTE35-OUT")).toBe(true); });
	it("X-TV-TWITCH-AD", () => { expect(fn()("X-TV-TWITCH-AD")).toBe(true); });
	it('"MIDROLL"', () => { expect(fn()('"MIDROLL"')).toBe(true); });
	it("clean content", () => { expect(fn()("#EXTINF:2.0")).toBe(false); });
	it("non-string", () => { expect(fn()(null)).toBe(false); });
});

describe("_isKnownAdSegmentUrl", () => {
	const fn = () => T<(url: string, opts?: { includeCached?: boolean }) => boolean>("_isKnownAdSegmentUrl");
	it("stitched URL", () => { expect(fn()("https://edge/stitched-ad.ts")).toBe(true); });
	it("adsquared URL", () => { expect(fn()("https://adsquared/ad.ts")).toBe(true); });
	it("processing URL", () => { expect(fn()("https://edge/processing/seg.ts")).toBe(true); });
	it("normal segment", () => { expect(fn()("https://edge/normal.ts")).toBe(false); });
	it("empty", () => { expect(fn()("")).toBe(false); });
});

describe("_isMediaPartLine", () => {
	const fn = () => T<(l: string) => boolean>("_isMediaPartLine");
	it("detects media part", () => {
		expect(fn()("#EXT-X-PART:DURATION=0.5,URI=\"p.ts\"")).toBe(true);
		expect(fn()("#EXTINF:2.0")).toBe(false);
	});
});

describe("_isPartPreloadHintLine", () => {
	const fn = () => T<(l: string) => boolean>("_isPartPreloadHintLine");
	it("detects preload hint", () => {
		expect(fn()("#EXT-X-PRELOAD-HINT:TYPE=PART,URI=\"p.ts\"")).toBe(true);
		expect(fn()('#EXT-X-PRELOAD-HINT:TYPE="PART",URI="p.ts"')).toBe(true);
		expect(fn()("#EXTINF:2.0")).toBe(false);
	});
});

describe("_absolutizePlaylistUrl", () => {
	const fn = () => T<(raw: string, base: string | null) => string>("_absolutizePlaylistUrl");
	it("resolves relative", () => {
		expect(fn()("seg.ts", "https://edge/playlist.m3u8")).toBe("https://edge/seg.ts");
	});
	it("keeps absolute", () => {
		expect(fn()("https://other/seg.ts", "https://base/")).toBe("https://other/seg.ts");
	});
});

describe("_getServerTime", () => {
	beforeAll(() => { (g.__TTVAB_STATE__ as Record<string, unknown>).V2API = true; });
	it("extracts server time", () => {
		const fn = T<(m: string) => string | null>("_getServerTime");
		expect(fn('#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="1234.5"')).toBe("1234.5");
	});
});

describe("_replaceServerTime", () => {
	beforeAll(() => { (g.__TTVAB_STATE__ as Record<string, unknown>).V2API = true; });
	it("replaces time in V2 format", () => {
		const fn = T<(m: string, t: string) => string>("_replaceServerTime");
		const r = fn('#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="old"', "new");
		expect(r).toContain('VALUE="new"');
	});
	it("no-op for falsy time", () => {
		const fn = T<(m: string, t: string | null) => string>("_replaceServerTime");
		expect(fn("original", "")).toBe("original");
	});
});
