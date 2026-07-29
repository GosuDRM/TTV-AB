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

	it("cycle-fences every same-media post-ad lifecycle action", () => {
		const source = hooksJs();
		expect(source).toMatch(
			/case "AdEnded":[\s\S]*?_isCodecHandoffCycleCurrent\(mediaKey, endedCycleStartedAt\)/,
		);
		expect(source).toMatch(
			/case "NativePlaybackRestored":[\s\S]*?_isCodecHandoffCycleCurrent\(mediaKey, restoredCycleStartedAt\)/,
		);
		expect(source).toMatch(
			/case "PauseResumePlayer":[\s\S]*?_isPageLifecycleCycleCurrent\(\s*data\.mediaKey,\s*data\.cycleStartedAt\s*,?\s*\)/,
		);
		expect(source).toMatch(
			/!eventIsCodecHandoff &&\s*!_isPageLifecycleCycleCurrent\(\s*eventMediaKey,\s*eventCycleStartedAt\s*,?\s*\)/,
		);
		expect(source).toMatch(
			/reloadReason === "codec-handoff"[\s\S]*?: !_isPageLifecycleCycleCurrent\(\s*reloadOptions\.mediaKey,\s*reloadOptions\.cycleStartedAt\s*,?\s*\)/,
		);
	});

	it("never accepts a last-ended cycle while any newer ad context is active", () => {
		expect(hooksJs()).toMatch(
			/if \(_normalizeMediaKey\(__TTVAB_STATE__\?\.CurrentAdMediaKey\)\) \{\s*return false;\s*\}/,
		);
	});

	it("preserves canonical cycle-two pod progress when it arrives before the page ad context", () => {
		const source = hooksJs();
		const blockStart = source.indexOf('case "AdDetected":');
		const blockEnd = source.indexOf('case "AdPodProgress":', blockStart);
		const block = source.slice(blockStart, blockEnd);
		expect(blockStart).toBeGreaterThan(-1);
		expect(blockEnd).toBeGreaterThan(blockStart);
		expect(block).toMatch(
			/activeCycleStartedAt\s*=\s*Math\.max\([\s\S]*?AdPodProgressByMediaKey\?\.\[mediaKey\][\s\S]*?\.cycleStartedAt/,
		);
		expect(block).toMatch(
			/detectedCycleStartedAt\s*<\s*Math\.max\(activeCycleStartedAt,\s*lastEndedCycleStartedAt\)/,
		);
		expect(block).toMatch(
			/shouldReuseCanonicalCycle\s*=\s*Boolean\([\s\S]*?activeCycleStartedAt\s*===\s*detectedCycleStartedAt/,
		);
		expect(block).toMatch(
			/if \(shouldStartNewCycle\) \{\s*if \(!shouldReuseCanonicalCycle\) \{[\s\S]*?_clearAdPodProgress\(mediaKey\)/,
		);
		const reuseGuardAt = block.indexOf("if (!shouldReuseCanonicalCycle)");
		const lifecycleCleanupAt = block.indexOf(
			"_clearPlaybackRecoveryTimeoutsForContext(mediaKey)",
		);
		expect(reuseGuardAt).toBeGreaterThan(-1);
		expect(lifecycleCleanupAt).toBeGreaterThan(reuseGuardAt);
		expect(block).toMatch(
			/canonicalPodProgress[\s\S]*?key:\s*"UpdateAdPodProgress"[\s\S]*?\.\.\.canonicalPodProgress/,
		);
	});

	it("gates worker reload acknowledgements before mutating reload state", () => {
		const source = hooksJs();
		const blockStart = source.indexOf("case 'TriggeredPlayerReload':");
		const blockEnd = source.indexOf("default:", blockStart);
		const block = source.slice(blockStart, blockEnd);
		expect(blockStart).toBeGreaterThan(-1);
		expect(blockEnd).toBeGreaterThan(blockStart);
		expect(source).toContain("${_isPageLifecycleCycleCurrent.toString()}");
		const gateAt = block.indexOf("_isPageLifecycleCycleCurrent(");
		const mutateAt = block.indexOf(
			"__TTVAB_STATE__.HasTriggeredPlayerReload = true",
		);
		expect(gateAt).toBeGreaterThan(-1);
		expect(mutateAt).toBeGreaterThan(gateAt);
	});

	it("gates native-restored acknowledgements before state and scheduled effects", () => {
		const source = hooksJs();
		const blockStart = source.indexOf('case "NativePlaybackRestored":');
		const blockEnd = source.indexOf('case "PauseResumePlayer":', blockStart);
		const block = source.slice(blockStart, blockEnd);
		expect(blockStart).toBeGreaterThan(-1);
		expect(blockEnd).toBeGreaterThan(blockStart);
		const gateAt = block.indexOf("_isCodecHandoffCycleCurrent(");
		const stateMutationAt = block.indexOf("__TTVAB_STATE__.LastAdEndedAt =");
		const playerTaskAt = block.indexOf("_doPlayerTask(");
		const cleanupAt = block.indexOf("_schedulePostAdArtifactCleanup(");
		expect(gateAt).toBeGreaterThan(-1);
		expect(stateMutationAt).toBeGreaterThan(gateAt);
		expect(playerTaskAt).toBeGreaterThan(gateAt);
		expect(cleanupAt).toBeGreaterThan(gateAt);
		expect(block).toMatch(
			/_doPlayerTask\([\s\S]*?cycleStartedAt:\s*restoredCycleStartedAt/,
		);
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
		expect(hooksJs()).toContain("_stripAds(text, true, failedInfo)");
		expect(hooksJs()).toContain("const failedRequestIsEnhanced =");
		expect(hooksJs()).toContain(
			"throw _createCodecHandoffAbortError(failedRequestSignal)",
		);
		expect(hooksJs()).not.toContain("_createEmptyAdHoldPlaylist(text, null)");
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
		expect(hooksJs()).toContain(
			"currentAdMediaKey !== nextCodecHandoffContext.MediaKey",
		);
		expect(hooksJs()).toContain("const handoffOwnsCurrentAd = Boolean(");
		expect(hooksJs()).toMatch(
			/if \(\s*handoffOwnsCurrentAd\s*&&\s*handoffInfo\?\._CodecHandoffPendingId === handoffId/,
		);
		expect(hooksJs()).not.toContain("matchesActiveAdMediaKey");
	});

	it("keeps the original mixed master until an exact codec handoff is active", () => {
		expect(hooksJs()).toMatch(
			/const playlist = info\.IsUsingModifiedM3U8\s*\?\s*info\.ModifiedM3U8\s*:\s*info\.EncodingsM3U8/,
		);
		expect(hooksJs()).not.toMatch(/const playlist = info\.ModifiedM3U8\s*\?/);
		expect(hooksJs()).toContain("const activeAdMediaMatches = Boolean(");
		expect(hooksJs()).toMatch(
			/info\.IsUsingModifiedM3U8 =\s*activeAdMediaMatches\s*&&\s*\(activeCodecHandoffMatches \|\| hasAcknowledgedCodecHandoff\)/,
		);
		expect(hooksJs()).not.toMatch(
			/info\.IsUsingModifiedM3U8 =\s*\(wasUsingModifiedM3U8/,
		);
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
