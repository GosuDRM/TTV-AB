import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hooksJs = () =>
	readFileSync(resolve(__dirname, "../dist/src/modules/hooks.js"), "utf8");
const parserJs = () =>
	readFileSync(resolve(__dirname, "../dist/src/modules/parser.js"), "utf8");

describe("empty ad segment single source", () => {
	it("hooks does not embed its own segment blob", () => {
		expect(hooksJs()).not.toContain("data:video/mp4;base64,");
	});

	it("worker bootstrap serializes the parser segment constant", () => {
		expect(hooksJs()).toContain("JSON.stringify(_EMPTY_SEGMENT_URL)");
	});

	it("parser segment is a structurally valid MP4", () => {
		const match = parserJs().match(/data:video\/mp4;base64,([A-Za-z0-9+/=]+)/);
		expect(match).not.toBeNull();
		const bytes = Buffer.from(match?.[1] ?? "", "base64");
		expect(bytes.length).toBeGreaterThan(0);
		const names: string[] = [];
		let offset = 0;
		while (offset + 8 <= bytes.length) {
			const size = bytes.readUInt32BE(offset);
			expect(size).toBeGreaterThanOrEqual(8);
			expect(offset + size).toBeLessThanOrEqual(bytes.length);
			names.push(bytes.toString("latin1", offset + 4, offset + 8));
			offset += size;
		}
		expect(offset).toBe(bytes.length);
		expect(names[0]).toBe("ftyp");
		expect(names).toContain("moov");
	});
});

describe("worker message handler hardening", () => {
	it("PauseResumePlayer ignores stale playback events", () => {
		expect(hooksJs()).toMatch(
			/case "PauseResumePlayer":\s*if \(isStalePlaybackEvent\(data\)\)/,
		);
	});

	it("bootstrap does not serialize tracked workers", () => {
		expect(hooksJs()).toMatch(
			/JSON\.stringify\(\{\s*\.\.\._S,\s*workers:\s*\[\]\s*\}\)/,
		);
	});
});
