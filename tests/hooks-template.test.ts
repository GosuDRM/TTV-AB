import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hooksJs = () =>
	readFileSync(resolve(__dirname, "../dist/src/modules/hooks.js"), "utf8");
const parserJs = () =>
	readFileSync(resolve(__dirname, "../dist/src/modules/parser.js"), "utf8");
const processorJs = () =>
	readFileSync(resolve(__dirname, "../dist/src/modules/processor.js"), "utf8");

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

	it("keeps active pip worker events current across SPA navigation", () => {
		expect(hooksJs()).toContain(
			"_isActivePictureInPicturePlaybackContext(messageContext)",
		);
		expect(hooksJs()).toContain("preservedMediaKey");
		expect(hooksJs()).toContain("case 'ReleasePlaybackContext'");
	});

	it("bootstrap does not serialize tracked workers", () => {
		expect(hooksJs()).toMatch(
			/JSON\.stringify\(\{\s*\.\.\._S,\s*workers:\s*\[\]\s*\}\)/,
		);
	});
});

describe("enhanced-codec handoff retirement", () => {
	it("does not fabricate a media segment while changing decoder generations", () => {
		for (const source of [hooksJs(), parserJs(), processorJs()]) {
			expect(source).not.toContain("data:application/octet-stream;base64,");
			expect(source).not.toContain("_createCodecHandoffGapPlaylist");
		}
	});

	it("propagates the retiring request cancellation instead of returning its ad-marked response", () => {
		expect(hooksJs()).toMatch(
			/if \(err\?\.name === "AbortError"\) \{\s*throw err;\s*\}/,
		);
	});

	it("fails closed when ad-marked playlist processing throws", () => {
		expect(hooksJs()).toContain("const requestWasAdMarked =");
		expect(hooksJs()).toContain(
			"_stripAds(text, true, failedInfo, false, true)",
		);
		expect(hooksJs()).toContain("_createEmptyAdHoldPlaylist(text, null)");
	});

	it("carries an exact handoff identity into the replacement worker", () => {
		expect(hooksJs()).toContain("_CodecHandoffAcknowledgedId");
		expect(hooksJs()).toContain("ActiveCodecHandoffId");
		expect(hooksJs()).toContain("seedCodecHandoffContext");
		expect(hooksJs()).toContain("CodecHandoffReloadFailed");
		expect(hooksJs()).toContain(
			"_markCodecHandoffReloadFailed(failedInfo, failedHandoffId)",
		);
		expect(hooksJs()).toContain("clearHandoffId");
		expect(hooksJs()).toContain(
			"_clearCodecHandoffState(streamInfo, clearHandoffId)",
		);
		expect(hooksJs()).toContain(
			"streamInfo._CodecHandoffPendingId = nextHandoffId",
		);
		expect(hooksJs()).toContain("streamInfo.IsUsingModifiedM3U8 = true");
		expect(hooksJs()).not.toContain("matchesActiveAdMediaKey");
	});

	it("verifies fatal media recovery in the worker before reloading", () => {
		expect(hooksJs()).toContain("PrepareFatalMediaRecovery");
		expect(hooksJs()).toContain("FatalMediaRecoveryReady");
		expect(hooksJs()).toContain(
			"__TTVAB_STATE__.PrepareFatalMediaRecovery = (request)",
		);
		expect(hooksJs()).toContain(
			"_prepareFatalMediaRecovery(info, realFetch, request)",
		);
		expect(hooksJs()).toContain("_acceptFatalAdMediaRecoveryReady(data)");
	});

	it("seeds active pod progress before the original worker can fetch", () => {
		const source = hooksJs();
		const seedAt = source.indexOf(
			"__TTVAB_STATE__.AdPodProgressByMediaKey = ${JSON.stringify(",
		);
		const hookAt = source.lastIndexOf("_hookWorkerFetch();");
		expect(source).toContain("const seedAdPodProgress =");
		expect(seedAt).toBeGreaterThan(-1);
		expect(hookAt).toBeGreaterThan(seedAt);
	});
});
