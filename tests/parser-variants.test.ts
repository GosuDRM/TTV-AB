import { describe, it, expect } from "vitest";
import { T } from "./setup";

describe("_getStreamVariantInfo", () => {
	const fn = () => T<(a: Record<string, string>, r: string, v: string) => Record<string, unknown>>("_getStreamVariantInfo");
	it("extracts resolution and codec", () => {
		const r = fn()(
			{ RESOLUTION: "1920x1080", CODECS: "avc1.4d002a", BANDWIDTH: "5000000", "FRAME-RATE": "60" },
			"/raw/variant.m3u8", "https://example.com/variant.m3u8",
		);
		expect(r.Resolution).toBe("1920x1080");
		expect(r.Codecs).toBe("avc1.4d002a");
		expect(r.FrameRate).toBe(60);
	});
	it("defaults missing resolution", () => {
		expect(fn()({}, "/raw.m3u8", "https://ex.com/v.m3u8").Resolution).toBe("0x0");
	});
	it("defaults missing frame rate", () => {
		const r = fn()({ RESOLUTION: "1280x720" }, "/raw.m3u8", "https://ex.com/v.m3u8");
		expect(r.FrameRate).toBe(0);
		expect(r.Resolution).toBe("1280x720");
	});
	it("defaults missing bandwidth", () => {
		const r = fn()({ RESOLUTION: "640x360" }, "/raw.m3u8", "https://ex.com/v.m3u8");
		expect(r.Bandwidth).toBe(0);
	});
});
