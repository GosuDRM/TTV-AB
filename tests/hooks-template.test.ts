import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hooksJs = () =>
	readFileSync(resolve(__dirname, "../dist/src/modules/hooks.js"), "utf8");
const hooksTs = () =>
	readFileSync(resolve(__dirname, "../src/modules/hooks.ts"), "utf8");
const initTs = () =>
	readFileSync(resolve(__dirname, "../src/modules/init.ts"), "utf8");
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

	it("parser segment carries decodable AVC and audio media for the hold", () => {
		const match = parserJs().match(/data:video\/mp4;base64,([A-Za-z0-9+/=]+)/);
		expect(match).not.toBeNull();
		const bytes = Buffer.from(match?.[1] ?? "", "base64");
		expect(bytes.length).toBeGreaterThan(0);
		const names: string[] = [];
		let mediaPayloadSize = 0;
		let offset = 0;
		while (offset + 8 <= bytes.length) {
			const size = bytes.readUInt32BE(offset);
			expect(size).toBeGreaterThanOrEqual(8);
			expect(offset + size).toBeLessThanOrEqual(bytes.length);
			const name = bytes.toString("latin1", offset + 4, offset + 8);
			names.push(name);
			if (name === "mdat") mediaPayloadSize += size - 8;
			offset += size;
		}
		expect(offset).toBe(bytes.length);
		expect(names[0]).toBe("ftyp");
		expect(names).toContain("moov");
		expect(names).toContain("moof");
		expect(names).toContain("mdat");
		expect(mediaPayloadSize).toBeGreaterThan(0);
		expect(bytes.includes(Buffer.from("avc1"))).toBe(true);
		expect(bytes.includes(Buffer.from("mp4a"))).toBe(true);
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
			/case "AdEnded":[\s\S]*?_isPageAdCycleControlEventCurrent\([\s\S]*?reportedEndedAt/,
		);
		expect(source).toMatch(
			/case "NativePlaybackRestored":[\s\S]*?_isCodecHandoffCycleCurrent\(mediaKey, restoredCycleStartedAt\)/,
		);
		expect(source).toMatch(
			/case "NativePlaybackRestored":[\s\S]*?_isPageAdCycleControlEventCurrent\([\s\S]*?reportedRestoredAt/,
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

	it("seeds playback visibility before workers and serializes foreground recovery", () => {
		const source = hooksTs();
		const initSource = initTs();
		expect(source).toContain(
			"__TTVAB_STATE__.PagePlaybackVisibleSinceAt = ${JSON.stringify(__TTVAB_STATE__.PagePlaybackVisibleSinceAt)}",
		);
		expect(source).toContain("case 'UpdatePagePlaybackVisibleSinceAt':");
		expect(source).toContain(
			"${_getPendingForegroundQualityProbeAt.toString()}",
		);
		expect(source).toContain("${_startForegroundQualityProbe.toString()}");
		const visibilityAt = initSource.indexOf(
			"_syncPagePlaybackVisibilityState();",
		);
		const workerHookAt = initSource.indexOf("_hookWorker();");
		expect(visibilityAt).toBeGreaterThan(-1);
		expect(workerHookAt).toBeGreaterThan(visibilityAt);
	});

	it("timestamps the toggle-off terminal event before page lifecycle fencing", () => {
		expect(processorJs()).toMatch(
			/Ad blocking disabled - restoring native stream state[\s\S]*?key:\s*"AdEnded"[\s\S]*?endedAt:\s*Date\.now\(\)/,
		);
	});

	it("invalidates worker ad work before accepting disabled state", () => {
		const source = hooksJs();
		const blockStart = source.indexOf("case 'UpdateToggleState':");
		const blockEnd = source.indexOf(
			"case 'UpdateAdSpoofingState':",
			blockStart,
		);
		const block = source.slice(blockStart, blockEnd);
		expect(blockStart).toBeGreaterThan(-1);
		expect(blockEnd).toBeGreaterThan(blockStart);
		const resetAt = block.indexOf("_resetStreamAdState(streamInfo)");
		const disableAt = block.indexOf(
			"__TTVAB_STATE__.IsAdStrippingEnabled = enabled",
		);
		const clearProgressAt = block.indexOf(
			"__TTVAB_STATE__.AdPodProgressByMediaKey = Object.create(null)",
		);
		expect(resetAt).toBeGreaterThan(-1);
		expect(clearProgressAt).toBeGreaterThan(resetAt);
		expect(disableAt).toBeGreaterThan(resetAt);
		expect(disableAt).toBeGreaterThan(clearProgressAt);
	});

	it("reconsiders fallback ordering without aborting in-flight media", () => {
		const source = hooksJs();
		const blockStart = source.indexOf("case 'UpdateAutoplayBackupState':");
		const blockEnd = source.indexOf("case 'UpdateAdsBlocked':", blockStart);
		const block = source.slice(blockStart, blockEnd);

		expect(blockStart).toBeGreaterThan(-1);
		expect(blockEnd).toBeGreaterThan(blockStart);
		expect(block).toContain(
			"__TTVAB_STATE__.DisableAutoplayBackup === shouldDisableAutoplayBackup",
		);
		expect(block).toContain("streamInfo._LastBackupSearchCompletedAt = 0");
		expect(block).not.toContain("streamInfo.BackupSearchEpoch =");
		expect(block).not.toContain("streamInfo._BackupSearchPromises?.clear?.()");
		expect(block).not.toContain("_resetStreamAdState");
		expect(block).not.toContain("LastCleanBackupM3U8");
		expect(block).not.toContain("BackupEncodingsM3U8Cache");
		expect(block).not.toContain("IsUsingBackupStream");
	});

	it("seeds and updates exact Previews player ownership in workers", () => {
		const source = hooksJs();
		expect(source).toContain(
			"__TTVAB_STATE__.AllowPreviewEmergencyAutoplayBackup = ${JSON.stringify(__TTVAB_STATE__.AllowPreviewEmergencyAutoplayBackup === true)}",
		);
		const blockStart = source.indexOf("case 'UpdatePageContext':");
		const blockEnd = source.indexOf(
			"case 'UpdatePreferredQualityGroup':",
			blockStart,
		);
		const block = source.slice(blockStart, blockEnd);
		expect(blockStart).toBeGreaterThan(-1);
		expect(blockEnd).toBeGreaterThan(blockStart);
		expect(block).toContain(
			"__TTVAB_STATE__.AllowPreviewEmergencyAutoplayBackup = data.value.allowPreviewEmergencyAutoplayBackup",
		);
	});

	it("changes the low quality fallback preference without reloading playback", () => {
		const source = initTs();
		const blockStart = source.indexOf(
			'_onInternalMessage("ttvab-toggle-autoplay-backup"',
		);
		const blockEnd = source.indexOf(
			'_onInternalMessage("ttvab-toggle-debug"',
			blockStart,
		);
		const block = source.slice(blockStart, blockEnd);

		expect(blockStart).toBeGreaterThan(-1);
		expect(blockEnd).toBeGreaterThan(blockStart);
		expect(block).toContain('key: "UpdateAutoplayBackupState"');
		expect(block).not.toContain("_doPlayerTask");
		expect(block).not.toContain("ReloadPlayer");
	});

	it("drops queued ad recovery work while disabled but keeps terminal events", () => {
		const source = hooksJs();
		const handlerStart = source.indexOf(
			'this.addEventListener("message", (e) =>',
		);
		const fenceStart = source.indexOf(
			"if (__TTVAB_STATE__.IsAdStrippingEnabled !== true)",
			handlerStart,
		);
		const mainSwitch = source.indexOf("switch (data.key)", fenceStart);
		const fence = source.slice(fenceStart, mainSwitch);

		expect(handlerStart).toBeGreaterThan(-1);
		expect(fenceStart).toBeGreaterThan(handlerStart);
		expect(mainSwitch).toBeGreaterThan(fenceStart);
		for (const key of [
			"MediaBootstrapRecoveryNeeded",
			"AdDetected",
			"AdPodProgress",
			"BackupPlayerTypeSelected",
			"FatalMediaRecoveryReady",
			"PauseResumePlayer",
			"ReloadPlayer",
		]) {
			expect(fence).toContain(`data.key === "${key}"`);
		}
		expect(fence).toContain('data.key === "AdEnded"');
		expect(fence).toContain('data.key === "NativePlaybackRestored"');
		expect(fence).toContain("_clearAdPodProgress(data.mediaKey)");
		expect(fence).toContain(
			"_clearSuppressedMediaTracking({ restoreConnected: true })",
		);
	});

	it("rejects non-terminal ad state updates in disabled workers", () => {
		const source = hooksJs();
		expect(source).toMatch(
			/case 'UpdateCurrentAdContext':[\s\S]*?IsAdStrippingEnabled !== true[\s\S]*?nextAdContext\.MediaKey[\s\S]*?break;/,
		);
		expect(source).toMatch(
			/case 'UpdateAdPodProgress':[\s\S]*?IsAdStrippingEnabled !== true[\s\S]*?break;/,
		);
		expect(source).toMatch(
			/case 'UpdatePinnedBackupPlayerContext':[\s\S]*?IsAdStrippingEnabled !== true[\s\S]*?nextPinnedType[\s\S]*?break;/,
		);
	});

	it("clears page cycle ownership when the master toggle turns off", () => {
		const source = initTs();
		const listenerStart = source.indexOf('_onInternalMessage("ttvab-toggle"');
		const listenerEnd = source.indexOf(
			'_onInternalMessage("ttvab-toggle-buffer-fix"',
			listenerStart,
		);
		const listener = source.slice(listenerStart, listenerEnd);

		expect(listenerStart).toBeGreaterThan(-1);
		expect(listenerEnd).toBeGreaterThan(listenerStart);
		expect(listener).toContain("_clearAdPodProgress(mediaKey)");
		expect(listener).toContain(
			"__TTVAB_STATE__.AdPodProgressByMediaKey = Object.create(null)",
		);
		expect(listener).toContain("_pageAdCycleControlByMediaKey.clear()");
		expect(listener).toContain("_pageSideEmptyHoldInfoByUrl.clear()");
	});

	it("releases provisional ad-cycle authority when an unpromoted worker retires", () => {
		const source = hooksJs();
		expect(source).toMatch(
			/__TTVABCrashed\s*=\s*true;[\s\S]*?_reassignPageAdCycleControlAfterWorkerRetirement\(/,
		);
		expect(source).toMatch(
			/terminate\(\)\s*\{[\s\S]*?__TTVABIntentionallyTerminated\s*=\s*true;[\s\S]*?_reassignPageAdCycleControlAfterWorkerRetirement\(/,
		);
	});

	it("never accepts a last-ended cycle while any newer ad context is active", () => {
		expect(hooksJs()).toMatch(
			/if \(_normalizeMediaKey\(__TTVAB_STATE__\?\.CurrentAdMediaKey\)\) \{\s*return false;\s*\}/,
		);
	});

	it("preserves canonical cycle-two pod progress when it arrives before the page ad context", () => {
		const source = hooksJs();
		const handlerStart = source.indexOf(
			'this.addEventListener("message", (e) =>',
		);
		const mainSwitch = source.indexOf("switch (data.key)", handlerStart);
		const blockStart = source.indexOf('case "AdDetected":', mainSwitch);
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
			/isRapidSameEndedCycleContinuation[\s\S]*?isContinuation[\s\S]*?lastEndedCycleStartedAt\s*===\s*detectedCycleStartedAt[\s\S]*?continuationDetectedAt\s*<=\s*now[\s\S]*?endedCycleAge\s*<=\s*_getPostAdReentryContinuationMs\(\)/,
		);
		expect(block).toMatch(
			/_claimPageAdCycleControl\([\s\S]*?controlWorkerGeneration[\s\S]*?continuationDetectedAt/,
		);
		expect(block).toMatch(
			/shouldReuseCanonicalCycle\s*=\s*Boolean\([\s\S]*?activeCycleStartedAt\s*===\s*detectedCycleStartedAt[\s\S]*?isRapidSameEndedCycleContinuation/,
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
		const loaderFenceAt = block.indexOf(
			"_invalidateNativeRecoveryAfterPlayerReload(",
		);
		expect(gateAt).toBeGreaterThan(-1);
		expect(loaderFenceAt).toBeGreaterThan(gateAt);
		expect(mutateAt).toBeGreaterThan(loaderFenceAt);
		expect(source).toContain(
			"Number(requestStartInfo?.NativeRecoveryLoaderEpoch) || 0",
		);
		expect(source).toMatch(
			/previousUsherUrl &&[\s\S]*?nextUsherUrl &&[\s\S]*?previousUsherUrl !== nextUsherUrl[\s\S]*?_invalidateNativeRecoveryAfterPlayerReload\(info, true\)[\s\S]*?info\.UsherBaseUrl = usherUrl/,
		);
		expect(block).toMatch(
			/_invalidateNativeRecoveryAfterPlayerReload\(\s*handoffInfo,\s*true,?\s*\)[\s\S]*?__TTVAB_STATE__\.HasTriggeredPlayerReload = true/,
		);
		expect(block).toMatch(
			/repeatsPendingReload[\s\S]*?PendingTriggeredPlayerReloadAt[\s\S]*?reloadAt \|\| Date\.now\(\)/,
		);
		expect(source).toContain("seedPostAdNativeReloadContext");
		expect(source).toContain(
			"_getPendingPostAdNativeReloadContext(pagePlaybackContext.MediaKey)",
		);
	});

	it("accepts exact post-ad native reload proof only through the fenced page handler", () => {
		const source = hooksJs();
		const handlerStart = source.indexOf(
			'this.addEventListener("message", (e) =>',
		);
		const mainSwitch = source.indexOf("switch (data.key)", handlerStart);
		const blockStart = source.indexOf(
			'case "PostAdNativeReloadReady":',
			mainSwitch,
		);
		const blockEnd = source.indexOf(
			'case "PlaybackWorkerBootstrapObserved":',
			blockStart,
		);
		const block = source.slice(blockStart, blockEnd);
		expect(blockStart).toBeGreaterThan(-1);
		expect(blockEnd).toBeGreaterThan(blockStart);
		expect(block).toMatch(/isStalePlaybackEvent\(data\)/);
		expect(block).toMatch(
			/_isPlaybackContextMismatch\(workerContext, reloadContext\)/,
		);
		expect(block).toMatch(
			/_confirmPostAdNativeReload\(\{[\s\S]*?cycleStartedAt:[\s\S]*?reloadAt:[\s\S]*?confirmedAt:/,
		);
	});

	it("gates native-restored acknowledgements before state and scheduled effects", () => {
		const source = hooksJs();
		const handlerStart = source.indexOf(
			'this.addEventListener("message", (e) =>',
		);
		const mainSwitch = source.indexOf("switch (data.key)", handlerStart);
		const blockStart = source.indexOf(
			'case "NativePlaybackRestored":',
			mainSwitch,
		);
		const blockEnd = source.indexOf('case "PauseResumePlayer":', blockStart);
		const block = source.slice(blockStart, blockEnd);
		expect(blockStart).toBeGreaterThan(-1);
		expect(blockEnd).toBeGreaterThan(blockStart);
		const gateAt = block.indexOf("_isCodecHandoffCycleCurrent(");
		const renewIntentAt = block.indexOf("_hasPendingAdResumeIntent(");
		const stateMutationAt = block.indexOf("__TTVAB_STATE__.LastAdEndedAt =");
		const playerTaskAt = block.indexOf("_runPostAdPlayerTask(");
		const cleanupAt = block.indexOf("_schedulePostAdArtifactCleanup(");
		expect(gateAt).toBeGreaterThan(-1);
		expect(renewIntentAt).toBeGreaterThan(gateAt);
		expect(stateMutationAt).toBeGreaterThan(renewIntentAt);
		expect(stateMutationAt).toBeGreaterThan(gateAt);
		expect(playerTaskAt).toBeGreaterThan(gateAt);
		expect(cleanupAt).toBeGreaterThan(gateAt);
		expect(block).toMatch(
			/_runPostAdPlayerTask\([\s\S]*?cycleStartedAt:\s*restoredCycleStartedAt/,
		);
		expect(block).toContain(
			"refreshAccessToken: data.refreshAccessToken !== false",
		);
	});

	it("bootstrap does not serialize tracked workers", () => {
		expect(hooksJs()).toMatch(
			/JSON\.stringify\(\{\s*\.\.\._S,\s*workers:\s*\[\]\s*\}\)/,
		);
	});

	it("installs the fetch hook before inlined blob worker source runs", () => {
		const source = hooksTs();
		expect(source).toContain(
			'opts?.type !== "module" && workerSourceUrl.startsWith("blob:")',
		);
		expect(source).toContain("? _readBlobUrlSync(workerSourceUrl)");
		expect(source).toContain("inlinedWorkerSource ||");
		const hookAt = source.indexOf("_hookWorkerFetch();");
		const originalSourceAt = source.indexOf(
			"${originalWorkerLoadCode}",
			hookAt,
		);
		expect(hookAt).toBeGreaterThan(-1);
		expect(originalSourceAt).toBeGreaterThan(hookAt);
	});

	it("seeds variant codec metadata before replacement media fetches", () => {
		const source = hooksJs();
		expect(source).toContain("const seedPlaybackCodecEntries =");
		expect(source).toContain(
			"const _pageSideVariantCodecByUrl = new Map(${JSON.stringify(seedPlaybackCodecEntries)});",
		);
		expect(source).toContain("requestCodec: requestStartCodecs");
		expect(source).toContain("decoderCodec: observedDecoderCodec");
		expect(source).toContain("handoffId: observedHandoffId");
		expect(source).toContain("${_resetWorkerAdCycleState.toString()}");
		expect(source).toContain("case 'ResetAdCycleState':");
		expect(source).toContain("playlistUrl: observedPlaylistUrl");
		expect(source).toContain("codec: observedCodec");
	});

	it("installs degraded ad blocking on the first heartbeat miss while reload stays throttled", () => {
		const source = hooksJs();
		const checkStart = source.indexOf("const _hbCheck = () => {");
		const checkEnd = source.indexOf(
			'this.addEventListener("message", (e) => {',
			checkStart,
		);
		const block = source.slice(checkStart, checkEnd);
		const fallbackAt = block.indexOf("_installPageSideM3U8Override();");
		const throttleAt = block.indexOf("if (_isWorkerLifecycleThrottled())");
		const recoveryAt = block.indexOf("_recoverCrashedWorker(");

		expect(checkStart).toBeGreaterThan(-1);
		expect(checkEnd).toBeGreaterThan(checkStart);
		expect(fallbackAt).toBeGreaterThan(-1);
		expect(throttleAt).toBeGreaterThan(fallbackAt);
		expect(recoveryAt).toBeGreaterThan(throttleAt);
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

	it("keeps ordinary mixed masters and restricts only exact previews or current handoffs", () => {
		expect(hooksJs()).toMatch(
			/const playlist =\s*info\.IsUsingModifiedM3U8 \|\| keepExactPreviewOnAvc\s*\? info\.ModifiedM3U8\s*:\s*info\.EncodingsM3U8/,
		);
		expect(hooksJs()).not.toMatch(/const playlist = info\.ModifiedM3U8\s*\?/);
		expect(hooksJs()).toContain("const activeAdMediaMatches = Boolean(");
		expect(hooksJs()).toContain("const keepExactPreviewOnAvc = Boolean(");
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
