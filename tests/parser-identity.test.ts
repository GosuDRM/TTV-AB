import { describe, it, expect } from "vitest";
import { T } from "./setup";

describe("_normalizeChannelName", () => {
	it("returns null for non-string", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeChannelName");
		expect(fn(null)).toBeNull();
		expect(fn(123)).toBeNull();
	});
	it("lowercases valid names", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeChannelName");
		expect(fn("TestChannel")).toBe("testchannel");
	});
	it("trims whitespace", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeChannelName");
		expect(fn("  Foo  ")).toBe("foo");
	});
	it("rejects too long", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeChannelName");
		expect(fn("a".repeat(26))).toBeNull();
	});
	it("rejects empty", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeChannelName");
		expect(fn("")).toBeNull();
	});
	it("rejects hyphens", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeChannelName");
		expect(fn("channel-name")).toBeNull();
	});
});

describe("_normalizeVodID", () => {
	it("accepts string", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeVodID");
		expect(fn("123456")).toBe("123456");
	});
	it("accepts number", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeVodID");
		expect(fn(789)).toBe("789");
	});
	it("rejects non-numeric", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeVodID");
		expect(fn("abc")).toBeNull();
	});
	it("rejects float", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeVodID");
		expect(fn("12.34")).toBeNull();
	});
});

describe("_buildMediaKey", () => {
	it("live key", () => {
		const fn = T<(t: string, c?: string | null, v?: string | null) => string | null>("_buildMediaKey");
		expect(fn("live", "testchannel")).toBe("live:testchannel");
	});
	it("vod key", () => {
		const fn = T<(t: string, c?: string | null, v?: string | null) => string | null>("_buildMediaKey");
		expect(fn("vod", null, "123456")).toBe("vod:123456");
	});
	it("null for invalid", () => {
		const fn = T<(t: string, c?: string | null, v?: string | null) => string | null>("_buildMediaKey");
		expect(fn("live", "", null)).toBeNull();
	});
});

describe("_normalizeMediaKey", () => {
	it("live prefix", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeMediaKey");
		expect(fn("live:testchannel")).toBe("live:testchannel");
	});
	it("case insensitive", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeMediaKey");
		expect(fn("LIVE:TestChannel")).toBe("live:testchannel");
	});
	it("vod prefix", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeMediaKey");
		expect(fn("vod:123")).toBe("vod:123");
	});
	it("rejects invalid", () => {
		const fn = T<(v: unknown) => string | null>("_normalizeMediaKey");
		expect(fn("bad")).toBeNull();
	});
});

describe("_getPlaybackContextFromUrl", () => {
	const fn = () => T<(url: string) => Record<string, unknown>>("_getPlaybackContextFromUrl");
	it("live channel", () => {
		const ctx = fn()("https://www.twitch.tv/testchannel");
		expect(ctx.MediaType).toBe("live");
		expect(ctx.ChannelName).toBe("testchannel");
	});
	it("vod", () => {
		const ctx = fn()("https://www.twitch.tv/videos/123456");
		expect(ctx.MediaType).toBe("vod");
		expect(ctx.VodID).toBe("123456");
	});
	it("non-playback", () => {
		expect(fn()("https://www.twitch.tv/directory").MediaType).toBeNull();
	});
	it("reserved route", () => {
		expect(fn()("https://www.twitch.tv/browse").ChannelName).toBeNull();
	});
	it("popout", () => {
		expect(fn()("https://www.twitch.tv/popout/testchannel/player").MediaType).toBe("live");
	});
	it("embed", () => {
		expect(fn()("https://www.twitch.tv/embed/testchannel").MediaType).toBe("live");
	});
});
