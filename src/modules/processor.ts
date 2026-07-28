// TTV AB - Processor

function _resetStreamAdState(info) {
	const wasUsingModifiedM3U8 = Boolean(info?.IsUsingModifiedM3U8);
	const wasUsingFallbackStream = Boolean(info?.IsUsingFallbackStream);
	const wasUsingBackupStream = Boolean(info?.IsUsingBackupStream);
	const hadStrippedAdSegments =
		Math.max(0, Number(info?.NumStrippedAdSegments) || 0) > 0;

	info.IsShowingAd = false;
	info.IsUsingModifiedM3U8 = false;
	info.IsUsingFallbackStream = false;
	info.IsUsingBackupStream = false;
	info.RequestedAds?.clear?.();
	if (info.SpoofedAdIds?.size && info.RecentSpoofedAdIds?.set) {
		for (const adId of info.SpoofedAdIds) {
			info.RecentSpoofedAdIds.set(adId, Date.now());
		}
		while (info.RecentSpoofedAdIds.size > 50) {
			const oldest = info.RecentSpoofedAdIds.keys().next().value;
			if (oldest === undefined) break;
			info.RecentSpoofedAdIds.delete(oldest);
		}
	}
	info.SpoofedAdIds?.clear?.();
	info.ObservedAdPodIds?.clear?.();
	info.ExpectedAdPodLength = 0;
	info.FailedBackupPlayerTypes?.clear?.();
	info.ActiveBackupPlayerType = null;
	info.ActiveBackupResolution = null;
	info.IsMidroll = false;
	info.CsaiOnlyThisBreak = false;
	info.IsStrippingAdSegments = false;
	info.NumStrippedAdSegments = 0;
	info.PendingAdEndAt = 0;
	info.CleanPlaylistCount = 0;
	info.AdEndMarkerBounceLogged = false;
	info.ConsecutiveFailedNativeProbes = 0;
	info.VisibleAdStartedAt = 0;
	info.IsHoldingBackupAfterAd = false;
	info.SilentBackupHoldStartedAt = 0;
	info.LastSilentBackupHoldLogAt = 0;
	info.LastNativeRecoveryHoldLogAt = 0;
	info.HevcReloadPendingAfterHold = false;
	info.LastAdEndBounceAt = 0;
	info.LoggedBackupAdsByType = null;
	info._LoggedWhitelistByType = null;
	info._BackupSearchStartedAt = 0;
	info._LastBackupSearchCompletedAt = 0;
	info._LoggedOfflineTransition = false;
	info._LqHoldStartAt = 0;
	info._BackupProbation = null;
	info._EmptyAdHoldMediaSequence = 0;
	info._FatalMediaRecoveryRequestId = null;
	const endedCodecHandoffId = _getActiveCodecHandoffIdForInfo(info);
	_clearCodecHandoffState(info);
	info._SpliceStreamId = null;
	info._SpliceBoundarySeq = null;
	if (
		endedCodecHandoffId &&
		__TTVAB_STATE__?.ActiveCodecHandoffId === endedCodecHandoffId &&
		_normalizeMediaKey(__TTVAB_STATE__?.ActiveCodecHandoffMediaKey) ===
			_normalizeMediaKey(info?.MediaKey)
	) {
		__TTVAB_STATE__.ActiveCodecHandoffId = null;
		__TTVAB_STATE__.ActiveCodecHandoffChannel = null;
		__TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
	}
	if (info._AdRequestController) {
		info._AdRequestController.abort();
		info._AdRequestController = null;
	}
	_resetNativeRecoveryReadyState(info);

	return {
		wasUsingModifiedM3U8,
		wasUsingFallbackStream,
		wasUsingBackupStream,
		hadStrippedAdSegments,
	};
}

function _getResolvedAdEndMinCleanPlaylists() {
	return Math.max(1, Number(__TTVAB_STATE__?.AdEndMinCleanPlaylists) || 1);
}

function _getResolvedAdEndGraceMs() {
	return Math.max(0, Number(__TTVAB_STATE__?.AdEndGraceMs) || 0);
}

function _getResolvedAdEndMaxWaitMs() {
	return Math.max(0, Number(__TTVAB_STATE__?.AdEndMaxWaitMs) || 0);
}

function _getResolvedAdEndBackupHoldMaxMs() {
	return Math.max(
		0,
		Number(__TTVAB_STATE__?.AdEndBackupHoldMaxMs) ||
			Number(_C?.AD_END_BACKUP_HOLD_MAX_MS) ||
			0,
	);
}

function _getResolvedSilentBackupHoldMaxMs() {
	return Math.max(0, Number(__TTVAB_STATE__?.SilentBackupHoldMaxMs) || 120000);
}

function _getPostAdReentryContinuationMs() {
	return 8000;
}

function _rememberLastAdEnd(info, endedAt = Date.now()) {
	const safeEndedAt = Math.max(0, Number(endedAt) || 0);
	const endedContext = _normalizePlaybackContext({
		MediaType: info?.MediaType || __TTVAB_STATE__?.PageMediaType || null,
		ChannelName: info?.ChannelName || null,
		VodID: info?.VodID || null,
		MediaKey: info?.MediaKey || null,
	});

	if (info) {
		info.LastAdEndReloadAt = safeEndedAt;
	}
	__TTVAB_STATE__.LastAdEndedAt = safeEndedAt;
	__TTVAB_STATE__.LastAdEndedChannel = endedContext.ChannelName;
	__TTVAB_STATE__.LastAdEndedMediaKey = endedContext.MediaKey;
}

function _doesPlaybackContextMatchInfo(info, mediaKey = null, channel = null) {
	const infoMediaKey = _normalizeMediaKey(info?.MediaKey);
	const targetMediaKey = _normalizeMediaKey(mediaKey);
	if (infoMediaKey && targetMediaKey) {
		return infoMediaKey === targetMediaKey;
	}

	const infoChannel = _normalizeChannelName(info?.ChannelName);
	const targetChannel = _normalizeChannelName(channel);
	return Boolean(infoChannel && targetChannel && infoChannel === targetChannel);
}

function _isRecentPostAdReentry(info, now = Date.now()) {
	const continuationMs = _getPostAdReentryContinuationMs();
	if (continuationMs <= 0) return false;

	const localEndedAt = Math.max(0, Number(info?.LastAdEndReloadAt) || 0);
	if (localEndedAt > 0 && now - localEndedAt <= continuationMs) {
		return true;
	}

	const sharedEndedAt = Math.max(
		0,
		Number(__TTVAB_STATE__?.LastAdEndedAt) || 0,
	);
	if (sharedEndedAt <= 0 || now - sharedEndedAt > continuationMs) {
		return false;
	}

	return _doesPlaybackContextMatchInfo(
		info,
		__TTVAB_STATE__?.LastAdEndedMediaKey,
		__TTVAB_STATE__?.LastAdEndedChannel,
	);
}

function _getBackupPlayerRetryCooldownMs(reason = "ad-marked") {
	switch (reason) {
		case "error":
		case "stream-error":
		case "token-error":
			return 1500;
		case "not-playable":
		case "no-stream-url":
			return 2000;
		case "stalled":
			return 10000;
		default:
			return 15000;
	}
}

function _markBackupPlayerRetryCooldown(
	info,
	playerType,
	reason = "ad-marked",
) {
	if (!info?.FailedBackupPlayerTypes?.set || typeof playerType !== "string") {
		return 0;
	}

	const retryAt = Date.now() + _getBackupPlayerRetryCooldownMs(reason);
	info.FailedBackupPlayerTypes.set(playerType, retryAt);
	return retryAt;
}

function _clearBackupPlayerRetryCooldown(info, playerType) {
	info?.FailedBackupPlayerTypes?.delete?.(playerType);
}

function _isBackupPlayerRetryCoolingDown(info, playerType) {
	if (!info?.FailedBackupPlayerTypes?.get || typeof playerType !== "string") {
		return false;
	}

	const retryAt = Number(info.FailedBackupPlayerTypes.get(playerType)) || 0;
	if (retryAt <= 0) {
		info.FailedBackupPlayerTypes.delete?.(playerType);
		return false;
	}
	if (retryAt <= Date.now()) {
		info.FailedBackupPlayerTypes.delete?.(playerType);
		return false;
	}
	return true;
}

function _forceClearBackupCooldownsIfStale(info, now = Date.now()) {
	const _BACKUP_MAX_STALENESS_MS = 8000;
	if (!info?.FailedBackupPlayerTypes?.clear) return false;
	const backupAgeMs = now - (Number(info.LastCleanBackupAt) || 0);
	if (backupAgeMs < _BACKUP_MAX_STALENESS_MS) return false;
	if (info.FailedBackupPlayerTypes.size === 0) return false;

	const allCoolingDown = [...info.FailedBackupPlayerTypes.values()].every(
		(retryAt) => Number(retryAt) > now,
	);
	if (!allCoolingDown) return false;

	info.FailedBackupPlayerTypes.clear();
	info.LoggedBackupAdsByType?.clear?.();
	_log(
		`[Trace] Backup is ${(backupAgeMs / 1000).toFixed(1)}s stale with all types cooling down — forcing cooldown reset`,
		"warning",
	);
	return true;
}

function _getPinnedBackupPlayerTypeForInfo(info) {
	const pinnedType =
		typeof __TTVAB_STATE__?.PinnedBackupPlayerType === "string" &&
		__TTVAB_STATE__.PinnedBackupPlayerType
			? __TTVAB_STATE__.PinnedBackupPlayerType
			: null;
	if (!pinnedType) return null;

	const pinnedContext = _normalizePlaybackContext({
		MediaType: __TTVAB_STATE__?.PageMediaType || info?.MediaType || null,
		ChannelName:
			__TTVAB_STATE__?.PinnedBackupPlayerChannel ||
			__TTVAB_STATE__?.CurrentAdChannel ||
			info?.ChannelName ||
			null,
		VodID: __TTVAB_STATE__?.PageVodID || info?.VodID || null,
		MediaKey:
			__TTVAB_STATE__?.PinnedBackupPlayerMediaKey ||
			__TTVAB_STATE__?.CurrentAdMediaKey ||
			info?.MediaKey ||
			null,
	});
	const infoContext = _normalizePlaybackContext({
		MediaType: info?.MediaType || null,
		ChannelName: info?.ChannelName || null,
		VodID: info?.VodID || null,
		MediaKey: info?.MediaKey || null,
	});

	if (pinnedContext.MediaKey && infoContext.MediaKey) {
		return pinnedContext.MediaKey === infoContext.MediaKey ? pinnedType : null;
	}
	if (pinnedContext.ChannelName && infoContext.ChannelName) {
		return pinnedContext.ChannelName === infoContext.ChannelName
			? pinnedType
			: null;
	}
	return null;
}

function _getRecentCleanBackupPlayerTypeForInfo(info, now = Date.now()) {
	const playerType =
		typeof info?.LastCleanBackupPlayerType === "string" &&
		info.LastCleanBackupPlayerType
			? info.LastCleanBackupPlayerType
			: null;
	if (!playerType || playerType === "autoplay") return null;
	if (_isBackupPlayerRetryCoolingDown(info, playerType)) return null;
	if (info?.LoggedBackupAdsByType?.has?.(playerType)) return null;
	if (
		typeof info?.LastCleanBackupM3U8 !== "string" ||
		!info.LastCleanBackupM3U8
	) {
		return null;
	}

	const lastCleanAt = Number(info.LastCleanBackupAt) || 0;
	const ageMs = now - lastCleanAt;
	if (lastCleanAt <= 0 || ageMs < 0 || ageMs > 120000) return null;

	return playerType;
}

function _getOrderedBackupPlayerTypes(info, startIdx = 0) {
	const configuredPlayerTypes = [
		...(__TTVAB_STATE__?.BackupPlayerTypes || []),
	].filter((pt) => pt !== "autoplay" || !__TTVAB_STATE__.DisableAutoplayBackup);
	const orderedPlayerTypes = [];
	const pushUnique = (playerType) => {
		if (
			typeof playerType !== "string" ||
			!playerType ||
			orderedPlayerTypes.includes(playerType) ||
			!configuredPlayerTypes.includes(playerType)
		) {
			return;
		}
		orderedPlayerTypes.push(playerType);
	};
	const activePlayerType =
		typeof info?.ActiveBackupPlayerType === "string" &&
		info.ActiveBackupPlayerType
			? info.ActiveBackupPlayerType
			: null;
	const safeStartIdx = Math.max(
		0,
		Math.min(configuredPlayerTypes.length, Number(startIdx) || 0),
	);
	const shouldTryAutoplayFirst = _shouldTryAutoplayFirst(info);
	const shouldHoldAutoplayBackup = _shouldHoldAutoplayBackupDuringAd(info);
	const effectiveStartIdx =
		activePlayerType === "autoplay" &&
		!shouldTryAutoplayFirst &&
		!shouldHoldAutoplayBackup
			? 0
			: safeStartIdx;
	const preferredPlayerType = _getPinnedBackupPlayerTypeForInfo(info);
	const effectivePreferredPlayerType =
		preferredPlayerType === "autoplay" &&
		!shouldTryAutoplayFirst &&
		!shouldHoldAutoplayBackup
			? null
			: preferredPlayerType;

	pushUnique(effectivePreferredPlayerType);
	if (shouldTryAutoplayFirst) {
		pushUnique("autoplay");
	}
	pushUnique(_getRecentCleanBackupPlayerTypeForInfo(info));
	if (
		activePlayerType !== "autoplay" ||
		shouldTryAutoplayFirst ||
		shouldHoldAutoplayBackup
	) {
		pushUnique(activePlayerType);
	}
	for (const playerType of configuredPlayerTypes.slice(effectiveStartIdx)) {
		pushUnique(playerType);
	}

	return orderedPlayerTypes;
}

function _resolvePlaybackResolutionForUrl(info, url = "") {
	let resolution = null;
	for (const alias of _getPlaylistUrlAliases(url)) {
		resolution = info?.Urls?.[alias] || null;
		if (resolution) break;
	}
	if (!resolution) {
		resolution = _getFallbackResolution(info, url);
	}
	return resolution;
}

function _resolveAdBackupTargetResolution(info, url = "") {
	const resolutionList = Array.isArray(info?.ResolutionList)
		? info.ResolutionList.filter(Boolean)
		: [];
	const urlResolution = _degradeToDecodableResolution(
		info,
		_resolvePlaybackResolutionForUrl(info, url),
		resolutionList,
	);
	const preferredResolution = _resolvePreferredBackupResolution(info);
	if (!preferredResolution) return urlResolution;
	if (!urlResolution) return preferredResolution;
	const heightOf = (entry) => {
		const [, h] = String(entry?.Resolution || "0x0")
			.split("x")
			.map(Number);
		return Number.isFinite(h) ? h : 0;
	};
	return heightOf(preferredResolution) > heightOf(urlResolution)
		? preferredResolution
		: urlResolution;
}

function _recordSustainedNativeResolution(info, url) {
	if (
		!info ||
		info.IsShowingAd ||
		info.IsUsingBackupStream ||
		info.IsUsingFallbackStream ||
		info.IsHoldingBackupAfterAd
	) {
		return;
	}
	let resolution = null;
	for (const alias of _getPlaylistUrlAliases(url)) {
		resolution = info?.Urls?.[alias] || null;
		if (resolution) break;
	}
	if (!resolution) {
		return;
	}
	const [, h] = String(resolution.Resolution || "0x0")
		.split("x")
		.map(Number);
	const height = Number.isFinite(h) ? h : 0;
	if (height <= 0) {
		return;
	}
	const [, ph] = String(info.SustainedNativeResolution?.Resolution || "0x0")
		.split("x")
		.map(Number);
	const prevHeight = Number.isFinite(ph) ? ph : 0;
	const now = Date.now();
	const windowMs = 60000;
	if (height < prevHeight) {
		const isStaleWindow =
			now - (Number(info.SustainedNativeResolutionAt) || 0) > windowMs;
		if (!isStaleWindow) {
			return;
		}
		const lastAdEndedAt = Math.max(
			Number(info.LastAdEndReloadAt) || 0,
			Number(__TTVAB_STATE__?.LastAdEndedAt) || 0,
		);
		if (lastAdEndedAt > 0 && now - lastAdEndedAt <= windowMs) {
			return;
		}
	}
	const prevResolution = info.SustainedNativeResolution?.Resolution || null;
	info.SustainedNativeResolution = resolution;
	info.SustainedNativeResolutionAt = now;
	if (resolution.Resolution && resolution.Resolution !== prevResolution) {
		_log(
			`[Trace] Sustained native quality: ${prevResolution || "none"} -> ${resolution.Resolution}`,
			"info",
		);
	}
}

async function _isAdEndStable(info, realFetch, resolution = null) {
	if (!info?.IsShowingAd && !info?.IsHoldingBackupAfterAd) return "ended";

	const now = Date.now();
	if (!info.PendingAdEndAt) {
		info.PendingAdEndAt = now;
		info.CleanPlaylistCount = 0;
		info.AdEndMarkerBounceLogged = false;
		_log("[Trace] Candidate ad end detected", "info");
	}

	info.CleanPlaylistCount =
		Math.max(0, Math.trunc(Number(info.CleanPlaylistCount) || 0)) + 1;

	const elapsed = now - info.PendingAdEndAt;
	const escalation = Math.min(
		4,
		Math.max(0, Math.trunc(Number(info.AdEndConfirmEscalation) || 0)),
	);
	const graceMs = _getResolvedAdEndGraceMs() + escalation * 2500;
	const minCleanPlaylists = _getResolvedAdEndMinCleanPlaylists() + escalation;
	const baseMaxWaitMs = _getResolvedAdEndMaxWaitMs();
	const maxWaitMs =
		baseMaxWaitMs > 0 ? baseMaxWaitMs + escalation * 2500 : baseMaxWaitMs;

	const fastPathReady =
		info.CleanPlaylistCount >= minCleanPlaylists && elapsed >= graceMs;
	const slowPathReady = maxWaitMs > 0 && elapsed >= maxWaitMs;

	if (!fastPathReady && !slowPathReady) {
		return "wait";
	}

	const expectedPodLength = Math.max(
		0,
		Math.trunc(Number(info.ExpectedAdPodLength) || 0),
	);
	const observedPodAds =
		info.ObservedAdPodIds instanceof Set ? info.ObservedAdPodIds.size : 0;
	const declaredPodIncomplete =
		expectedPodLength > 0 && observedPodAds < expectedPodLength;
	let hasNativeRecoveryReady = false;
	if (declaredPodIncomplete) {
		if (!info._LoggedWhitelistByType) {
			info._LoggedWhitelistByType = new Set();
		}
		const progressKey = `pod-incomplete:${observedPodAds}/${expectedPodLength}`;
		if (!info._LoggedWhitelistByType.has(progressKey)) {
			info._LoggedWhitelistByType.add(progressKey);
			_log(
				`[Trace] Declared ad pod still active (${observedPodAds}/${expectedPodLength}); holding clean backup stream`,
				"info",
			);
		}
	} else {
		hasNativeRecoveryReady = await _canReloadNativePlayerAfterAd(
			info,
			realFetch,
			resolution,
		);
	}
	if (!info.IsShowingAd && !info.IsHoldingBackupAfterAd) {
		return "wait";
	}
	if (hasNativeRecoveryReady) {
		return "ended";
	}

	const maxFailedProbes = Math.max(
		1,
		Number(__TTVAB_STATE__?.AdEndMaxFailedNativeProbes) || 6,
	);
	const failedProbeCapHit =
		Math.max(0, Number(info.ConsecutiveFailedNativeProbes) || 0) >=
		maxFailedProbes;

	if (slowPathReady) {
		const canHoldCleanPlaylist = Boolean(info?.LastCleanBackupM3U8);
		if (canHoldCleanPlaylist) {
			const backupHoldMaxMs = _getResolvedAdEndBackupHoldMaxMs();
			const visibleAdStartedAt = Math.max(
				0,
				Number(info.VisibleAdStartedAt) || Number(info.PendingAdEndAt) || 0,
			);
			const visibleAdElapsed =
				visibleAdStartedAt > 0 ? now - visibleAdStartedAt : elapsed;
			if (
				(backupHoldMaxMs > 0 && visibleAdElapsed >= backupHoldMaxMs) ||
				failedProbeCapHit
			) {
				_log(
					failedProbeCapHit && visibleAdElapsed < backupHoldMaxMs
						? "[Trace] Native recovery still ad-marked after failed-probe cap; ending visible ad cycle and keeping clean backup stream"
						: "[Trace] Native recovery still ad-marked after extended backup hold; ending visible ad cycle and keeping clean backup stream",
					"warning",
				);
				return "ended-with-backup-hold";
			}

			const lastHoldLogAt = Math.max(
				0,
				Number(info.LastNativeRecoveryHoldLogAt) || 0,
			);
			if (now - lastHoldLogAt >= 10000) {
				info.LastNativeRecoveryHoldLogAt = now;
				const recoveryProgressing =
					Math.max(0, Number(info.NativeRecoveryCleanCount) || 0) > 0;
				_log(
					recoveryProgressing
						? "[Trace] Native recovery verifying clean; holding clean backup stream"
						: "[Trace] Native recovery still ad-marked after max wait; holding clean backup stream",
					"warning",
				);
			}
			return "wait";
		}

		if (info.IsHoldingBackupAfterAd) {
			_log(
				"[Trace] Silent backup hold has no cached backup; waiting for native-ready proof",
				"warning",
			);
			return "wait";
		}
		_log(
			failedProbeCapHit
				? "[Trace] Native recovery still ad-marked after failed-probe cap; forcing ad end to prevent offline state"
				: "[Trace] Native recovery still ad-marked after max wait; forcing ad end to prevent offline state",
			"warning",
		);
		return "ended";
	}

	return "wait";
}

function _resetNativeRecoveryReadyState(info, preserveProbeAt = false) {
	if (!info) return;
	info.NativeRecoveryProbeEpoch =
		(Number(info.NativeRecoveryProbeEpoch) || 0) + 1;
	if (!preserveProbeAt) {
		info.LastNativeRecoveryProbeAt = 0;
	}
	info.LastNativeRecoveryReadyPlayerType = null;
	info.NativeRecoveryCleanCount = 0;
}

function _markNativeRecoveryProbeFailed(info) {
	info.ConsecutiveFailedNativeProbes =
		Math.max(0, Number(info?.ConsecutiveFailedNativeProbes) || 0) + 1;
}

function _markNativeRecoveryReady(info, playerType) {
	const nextPlayerType =
		typeof playerType === "string" && playerType ? playerType : null;
	if (!info || !nextPlayerType) {
		_resetNativeRecoveryReadyState(info, true);
		return 0;
	}

	if (info.LastNativeRecoveryReadyPlayerType !== nextPlayerType) {
		info.LastNativeRecoveryReadyPlayerType = nextPlayerType;
		info.NativeRecoveryCleanCount = 1;
		return 1;
	}

	const nextCount =
		Math.max(0, Math.trunc(Number(info.NativeRecoveryCleanCount) || 0)) + 1;
	info.NativeRecoveryCleanCount = nextCount;
	return nextCount;
}

async function _serveBounceDebouncedPlaylist(info, realFetch, text, now) {
	const lastAdEndBounceAt = Math.max(0, Number(info?.LastAdEndBounceAt) || 0);
	const bounceDebounceMs = Math.max(
		3000,
		Number(__TTVAB_STATE__?.AdEndBounceDebounceMs) || 0,
	);
	if (lastAdEndBounceAt <= 0 || now - lastAdEndBounceAt >= bounceDebounceMs) {
		return null;
	}
	if ((Number(__TTVAB_STATE__?.BackupSearchForceRefreshAt) || 0) > 0) {
		return null;
	}
	if (!info.LastCleanBackupM3U8) {
		return _stripAds(text, false, info, true);
	}
	const backupAgeMs = now - (Number(info.LastCleanBackupAt) || 0);
	if (backupAgeMs < 900) {
		info.IsUsingBackupStream = true;
		return info.LastCleanBackupM3U8;
	}
	const refreshed = await _refreshActiveBackupMediaPlaylist(info, realFetch);
	if (refreshed) {
		info.IsUsingBackupStream = true;
		return refreshed;
	}
	return null;
}

function _shouldReloadNativePlayerAfterAdReset({
	wasUsingModifiedM3U8,
	wasUsingFallbackStream,
	wasUsingBackupStream,
	hadStrippedAdSegments,
}: {
	wasUsingModifiedM3U8?: boolean;
	wasUsingFallbackStream?: boolean;
	wasUsingBackupStream?: boolean;
	hadStrippedAdSegments?: boolean;
} = {}) {
	return Boolean(
		wasUsingModifiedM3U8 ||
			wasUsingFallbackStream ||
			wasUsingBackupStream ||
			hadStrippedAdSegments,
	);
}

function _getPlaylistUrlAliases(url, baseUrl = null) {
	const isAbsoluteUrl = typeof url === "string" && url.startsWith("http");
	if (isAbsoluteUrl) {
		const memo = globalThis._playlistAliasMemo;
		if (memo && memo.url === url) {
			return memo.aliases;
		}
	}
	const aliases: string[] = [];
	const pushAlias = (value) => {
		if (typeof value !== "string") return;
		const trimmed = value.trimEnd();
		if (!trimmed || aliases.indexOf(trimmed) !== -1) return;
		aliases.push(trimmed);
	};

	pushAlias(url);

	try {
		const fallbackBase =
			typeof globalThis?.location?.href === "string"
				? globalThis.location.href
				: null;
		const parsed = new URL(
			String(url || ""),
			typeof baseUrl === "string" && baseUrl
				? baseUrl
				: fallbackBase || undefined,
		);
		parsed.hash = "";
		pushAlias(parsed.toString());
		pushAlias(`${parsed.origin}${parsed.pathname}`);
		pushAlias(parsed.pathname);
	} catch {}

	if (isAbsoluteUrl) {
		globalThis._playlistAliasMemo = { url, aliases };
	}
	return aliases;
}

function _getStreamInfoForPlaylist(url) {
	if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__) return null;
	for (const alias of _getPlaylistUrlAliases(url)) {
		const byUrl = __TTVAB_STATE__.StreamInfosByUrl[alias];
		if (byUrl) return byUrl;
	}

	const currentPageMediaKey = __TTVAB_STATE__?.PageMediaKey || null;

	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname;
		let hostnameMatch = null;
		let hostnameMatchTime = -1;
		for (const key in __TTVAB_STATE__.StreamInfosByUrl) {
			try {
				const info = __TTVAB_STATE__.StreamInfosByUrl[key];
				if (currentPageMediaKey && info?.MediaKey !== currentPageMediaKey) {
					continue;
				}
				const storedUrl = new URL(key);
				if (storedUrl.hostname !== hostname) continue;
				if (currentPageMediaKey) return info;
				const activityAt = Number(info?.LastActivityAt) || 0;
				if (activityAt > hostnameMatchTime) {
					hostnameMatchTime = activityAt;
					hostnameMatch = info;
				}
			} catch {}
		}
		if (hostnameMatch) return hostnameMatch;
	} catch {}

	const keys = Object.keys(__TTVAB_STATE__.StreamInfos);
	if (keys.length === 1) {
		const info = __TTVAB_STATE__.StreamInfos[keys[0]];
		if (!currentPageMediaKey || info?.MediaKey === currentPageMediaKey) {
			return info;
		}
	}
	if (keys.length > 1) {
		let best = null;
		let bestTime = 0;
		for (const key of keys) {
			const info = __TTVAB_STATE__.StreamInfos[key];
			if (currentPageMediaKey && info?.MediaKey !== currentPageMediaKey) {
				continue;
			}
			if (info?.LastActivityAt > bestTime) {
				bestTime = info.LastActivityAt;
				best = info;
			}
		}
		return best;
	}

	return null;
}

function _getSyntheticPlaybackContextForPlaylist(url) {
	const urlContext = _getPlaybackContextFromUsherUrl(url);
	if (urlContext?.MediaKey) {
		return urlContext;
	}

	return null;
}

function _hasPlaylistAdMarkers(text) {
	return _hasExplicitAdMetadata(text);
}

function _playlistHasMediaSegments(text) {
	return (
		typeof text === "string" &&
		(text.includes("#EXTINF") || text.includes("#EXT-X-PART:"))
	);
}

function _parsePlaylistFirstMediaSequence(text) {
	if (typeof text !== "string") return null;
	const m = text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
	if (!m) return null;
	const seq = parseInt(m[1], 10);
	return Number.isNaN(seq) ? null : seq;
}

function _parsePlaylistDiscontinuitySequence(text) {
	if (typeof text !== "string") return 0;
	const m = text.match(/#EXT-X-DISCONTINUITY-SEQUENCE:(\d+)/);
	if (!m) return 0;
	const seq = parseInt(m[1], 10);
	return Number.isNaN(seq) ? 0 : seq;
}

function _setPlaylistDiscontinuitySequence(lines, value) {
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith("#EXT-X-DISCONTINUITY-SEQUENCE:")) {
			lines[i] = `#EXT-X-DISCONTINUITY-SEQUENCE:${value}`;
			return;
		}
	}
	let at = 0;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
			at = i + 1;
			break;
		}
		if (lines[i].startsWith("#EXTM3U")) at = i + 1;
	}
	lines.splice(at, 0, `#EXT-X-DISCONTINUITY-SEQUENCE:${value}`);
}

function _insertBoundaryDiscontinuity(text, boundarySeq, firstSeq) {
	if (typeof text !== "string" || boundarySeq == null || firstSeq == null) {
		return text;
	}
	const pos = boundarySeq - firstSeq;
	const lines = text.split("\n");

	if (pos < 0) {
		_setPlaylistDiscontinuitySequence(
			lines,
			_parsePlaylistDiscontinuitySequence(text) + 1,
		);
		return lines.join("\n");
	}

	let seen = 0;
	let insertAt = -1;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].startsWith("#EXTINF")) {
			if (seen === pos) {
				insertAt = i;
				break;
			}
			seen++;
		}
	}
	if (insertAt < 0) return text;
	if (insertAt > 0 && lines[insertAt - 1].startsWith("#EXT-X-DISCONTINUITY")) {
		return text;
	}
	lines.splice(insertAt, 0, "#EXT-X-DISCONTINUITY");
	return lines.join("\n");
}

function _applyBackupSpliceBridge(info, text) {
	if (!info || typeof text !== "string" || !text) return text;
	if (!info.IsUsingBackupStream) {
		info._SpliceStreamId = null;
		info._SpliceBoundarySeq = null;
		return text;
	}
	if (!_playlistHasMediaSegments(text)) return text;

	const identity = `${info.ActiveBackupPlayerType || "?"}|${info.ActiveBackupResolution || "?"}`;
	const firstSeq = _parsePlaylistFirstMediaSequence(text);
	if (firstSeq == null) return text;

	if (info._SpliceStreamId !== identity) {
		info._SpliceStreamId = identity;
		info._SpliceBoundarySeq = firstSeq;
	}

	return _insertBoundaryDiscontinuity(text, info._SpliceBoundarySeq, firstSeq);
}

function _getNativeRecoveryProbePlayerType() {
	const forcedPlayerType =
		__TTVAB_STATE__?.RewriteNativePlaybackAccessToken === true &&
		typeof __TTVAB_STATE__?.ForceAccessTokenPlayerType === "string" &&
		__TTVAB_STATE__.ForceAccessTokenPlayerType.trim()
			? __TTVAB_STATE__.ForceAccessTokenPlayerType.trim()
			: null;

	return (
		forcedPlayerType ||
		__TTVAB_STATE__?.LastNativePlaybackAccessTokenPlayerType ||
		"site"
	);
}

async function _fetchWithTimeout(
	realFetch,
	url,
	options = {},
	timeoutMs = 3500,
) {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await realFetch(url, {
			...options,
			signal: controller.signal,
		});
		const body = await response.arrayBuffer();
		const nullBodyStatus =
			response.status === 101 ||
			response.status === 204 ||
			response.status === 205 ||
			response.status === 304;
		return new Response(nullBodyStatus ? null : body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	} finally {
		clearTimeout(id);
	}
}

async function _canReloadNativePlayerAfterAd(
	info,
	realFetch,
	resolution = null,
) {
	if (!info?.IsUsingBackupStream && !info?.IsUsingFallbackStream) {
		_resetNativeRecoveryReadyState(info);
		info.ConsecutiveFailedNativeProbes = 0;
		return true;
	}

	if (info._NativeRecoveryProbeInFlight) {
		return false;
	}

	const requiredCleanProbes = Math.max(
		1,
		Number(__TTVAB_STATE__?.AdEndMinNativeRecoveryProbes) || 1,
	);
	const probeCooldownMs = Math.max(
		250,
		Number(__TTVAB_STATE__?.AdEndNativeRecoveryProbeCooldownMs) || 750,
	);
	const now = Date.now();
	if (
		info.LastNativeRecoveryProbeAt &&
		now - info.LastNativeRecoveryProbeAt < probeCooldownMs
	) {
		return false;
	}
	info.LastNativeRecoveryProbeAt = now;

	const nativePlayerType = _getNativeRecoveryProbePlayerType();
	const probeEpoch = Number(info.NativeRecoveryProbeEpoch) || 0;
	const probeInvalidated = () =>
		(Number(info.NativeRecoveryProbeEpoch) || 0) !== probeEpoch;
	info._NativeRecoveryProbeInFlight = true;

	try {
		const tokenRes = await _getToken(info, nativePlayerType, realFetch);
		if (probeInvalidated()) {
			return false;
		}
		if (tokenRes.status !== 200) {
			_resetNativeRecoveryReadyState(info, true);
			_markNativeRecoveryProbeFailed(info);
			_log(
				`[Trace] Native recovery probe failed for ${nativePlayerType}: ${tokenRes.status}`,
				"warning",
			);
			return false;
		}

		const token = await tokenRes.json();
		const extractedToken = _extractPlaybackAccessToken(token);
		const sig = extractedToken?.signature;
		const tokenValue = extractedToken?.value;
		if (!sig || !tokenValue) {
			_resetNativeRecoveryReadyState(info, true);
			_markNativeRecoveryProbeFailed(info);
			_log(
				`[Trace] Native recovery probe missing token parts for ${nativePlayerType}`,
				"warning",
			);
			return false;
		}

		const usherUrl = _buildUsherPlaybackUrl(info, sig, tokenValue);
		if (!usherUrl) {
			_resetNativeRecoveryReadyState(info, true);
			_markNativeRecoveryProbeFailed(info);
			return false;
		}

		const encRes = await _fetchWithTimeout(realFetch, usherUrl.href);
		if (probeInvalidated()) {
			return false;
		}
		if (encRes.status !== 200) {
			_resetNativeRecoveryReadyState(info, true);
			_markNativeRecoveryProbeFailed(info);
			_log(
				`[Trace] Native recovery usher failed for ${nativePlayerType}: ${encRes.status}`,
				"warning",
			);
			return false;
		}

		const encM3u8 = await encRes.text();
		const targetResolution =
			resolution ||
			_getFallbackResolution(info, "") ||
			info?.ResolutionList?.[0] ||
			null;
		const streamUrl = _getStreamUrl(encM3u8, targetResolution, usherUrl.href);
		if (!streamUrl) {
			_resetNativeRecoveryReadyState(info, true);
			_markNativeRecoveryProbeFailed(info);
			return false;
		}

		const streamRes = await _fetchWithTimeout(realFetch, streamUrl);
		if (probeInvalidated()) {
			return false;
		}
		if (streamRes.status !== 200) {
			_resetNativeRecoveryReadyState(info, true);
			_markNativeRecoveryProbeFailed(info);
			_log(
				`[Trace] Native recovery stream failed for ${nativePlayerType}: ${streamRes.status}`,
				"warning",
			);
			return false;
		}

		const nativeM3u8 = await streamRes.text();
		if (probeInvalidated()) {
			return false;
		}
		const nativeHasAds =
			_hasPlaylistAdMarkers(nativeM3u8) ||
			_hasExplicitAdMetadata(nativeM3u8) ||
			_playlistHasKnownAdSegments(nativeM3u8, {
				includeCached: false,
			});

		if (nativeHasAds) {
			_resetNativeRecoveryReadyState(info, true);
			_markNativeRecoveryProbeFailed(info);
			_log(
				`[Trace] Native recovery still ad-marked (${nativePlayerType})`,
				"warning",
			);
			return false;
		}

		const readyCount = _markNativeRecoveryReady(info, nativePlayerType);
		if (readyCount < requiredCleanProbes) {
			_markNativeRecoveryProbeFailed(info);
			_log(
				`[Trace] Native recovery ready (${nativePlayerType}) ${readyCount}/${requiredCleanProbes}`,
				"info",
			);
			return false;
		}

		info.ConsecutiveFailedNativeProbes = 0;
		_log(`[Trace] Native recovery ready (${nativePlayerType})`, "success");
		return true;
	} catch (err) {
		if (probeInvalidated()) {
			return false;
		}
		_resetNativeRecoveryReadyState(info, true);
		_markNativeRecoveryProbeFailed(info);
		_log(
			`[Trace] Native recovery probe error for ${nativePlayerType}: ${err.message}`,
			"warning",
		);
		return false;
	} finally {
		info._NativeRecoveryProbeInFlight = false;
	}
}

function _createStreamInfo(context) {
	const normalizedContext = _normalizePlaybackContext(context);
	const podProgress =
		(normalizedContext.MediaKey &&
			__TTVAB_STATE__?.AdPodProgressByMediaKey?.[normalizedContext.MediaKey]) ||
		null;
	return {
		MediaType: normalizedContext.MediaType,
		MediaKey: normalizedContext.MediaKey,
		ChannelName: normalizedContext.ChannelName,
		VodID: normalizedContext.VodID,
		IsShowingAd: false,
		LastPlayerReload: 0,
		EncodingsM3U8: null,
		ModifiedM3U8: null,
		IsUsingModifiedM3U8: false,
		IsUsingFallbackStream: false,
		IsUsingBackupStream: false,
		UsherBaseUrl: "",
		UsherParams: "",
		RequestedAds: new Set(),
		SpoofedAdIds: new Set(),
		RecentSpoofedAdIds: new Map(),
		ObservedAdPodIds: new Set(
			Array.isArray(podProgress?.adIds) ? podProgress.adIds : [],
		),
		ExpectedAdPodLength: Math.max(
			0,
			Number(podProgress?.expectedPodLength) || 0,
		),
		MeasuredAdIds: new Set(),
		_SecondsReportedForCycle: 0,
		FailedBackupPlayerTypes: new Map(),
		Urls: Object.create(null),
		ResolutionList: [],
		BackupEncodingsM3U8Cache: Object.create(null),
		EnhancedVariantUrls: new Set(),
		EnhancedDecoderCodecFamily: null,
		ActiveBackupPlayerType: null,
		ActiveBackupResolution: null,
		SustainedNativeResolution: null,
		SustainedNativeResolutionAt: 0,
		LastCleanNativeM3U8: null,
		LastCleanNativeUrl: null,
		LastCleanNativeCodec: null,
		LastCleanNativePlaylistAt: 0,
		LastCleanBackupM3U8: null,
		LastCleanBackupPlayerType: null,
		LastCleanBackupCodecFamily: null,
		LastCleanBackupAt: 0,
		IsMidroll: false,
		CsaiOnlyThisBreak: false,
		IsStrippingAdSegments: false,
		NumStrippedAdSegments: 0,
		PendingAdEndAt: 0,
		CleanPlaylistCount: 0,
		AdEndMarkerBounceLogged: false,
		AdEndConfirmEscalation: 0,
		VisibleAdStartedAt: Math.max(0, Number(podProgress?.cycleStartedAt) || 0),
		IsHoldingBackupAfterAd: false,
		SilentBackupHoldStartedAt: 0,
		LastSilentBackupHoldLogAt: 0,
		LastNativeRecoveryProbeAt: 0,
		BackupVariantUrls: new Set(),
		LastNativeRecoveryReadyPlayerType: null,
		NativeRecoveryCleanCount: 0,
		NativeRecoveryProbeEpoch: 0,
		_NativeRecoveryProbeInFlight: false,
		_BackupSearchPromise: null,
		ConsecutiveFailedNativeProbes: 0,
		_LoggedWhitelistByType: null,
		_BackupSearchCount: 0,
		_BackupSearchErrorCount: 0,
		_BackupSearchFailCount: 0,
		LastAdEndReloadAt: 0,
		LastAdEndReloadKind: null,
		PostEscapeReloadCounterproductive: false,
		LastNativeRecoveryHoldLogAt: 0,
		HevcReloadPendingAfterHold: false,
		LastAdEndBounceAt: 0,
		LastActivityAt: Date.now(),
		LoggedBackupAdsByType: null,
		_EmptyAdHoldMediaSequence: 0,
		_FatalMediaRecoveryRequestId: null,
		_CodecHandoffSequence: 0,
		_CodecHandoffPendingId: null,
		_CodecHandoffAcknowledgedId: null,
		_CodecHandoffFailedId: null,
		_CodecHandoffReloadRetryCount: 0,
		_SpliceStreamId: null,
		_SpliceBoundarySeq: null,
	};
}

function _createSyntheticStreamInfo(playbackContext, url = "") {
	const normalizedContext = _normalizePlaybackContext(playbackContext);
	if (!normalizedContext.MediaKey) return null;

	const info = _createStreamInfo(normalizedContext);

	__TTVAB_STATE__.StreamInfos[normalizedContext.MediaKey] = info;
	if (url) {
		for (const alias of _getPlaylistUrlAliases(url)) {
			__TTVAB_STATE__.StreamInfosByUrl[alias] = info;
		}
	}

	const logTarget =
		normalizedContext.MediaType === "vod"
			? `vod ${normalizedContext.VodID}`
			: normalizedContext.ChannelName;
	_log(`Synthetic stream info created for ${logTarget}`, "warning");
	return info;
}

function _buildUsherPlaybackUrl(info, sig, token) {
	let usherUrl = null;

	if (typeof info?.UsherBaseUrl === "string" && info.UsherBaseUrl) {
		try {
			usherUrl = new URL(info.UsherBaseUrl);
		} catch {}
	}

	if (!usherUrl) {
		const routePath =
			info?.MediaType === "vod" && info?.VodID
				? `vod/${info.VodID}.m3u8`
				: info?.ChannelName
					? `channel/hls/${info.ChannelName}.m3u8`
					: null;
		if (!routePath) return null;
		usherUrl = new URL(
			`https://usher.ttvnw.net/api/${__TTVAB_STATE__.V2API ? "v2/" : ""}${routePath}${info?.UsherParams || ""}`,
		);
	}

	usherUrl.searchParams.set("sig", sig);
	usherUrl.searchParams.set("token", token);
	return usherUrl;
}

function _getExactPlaylistUrlKey(url, baseUrl = null) {
	const candidate = typeof url === "string" ? url.trimEnd() : "";
	if (!candidate) return "";
	try {
		const parsed = new URL(
			candidate,
			typeof baseUrl === "string" && baseUrl ? baseUrl : undefined,
		);
		parsed.hash = "";
		return parsed.href;
	} catch {
		return candidate;
	}
}

function _clearCodecHandoffState(info, handoffId = null) {
	if (!info) return false;
	const exactHandoffId =
		typeof handoffId === "string" && handoffId ? handoffId : null;
	if (
		exactHandoffId &&
		info._CodecHandoffPendingId !== exactHandoffId &&
		info._CodecHandoffAcknowledgedId !== exactHandoffId &&
		info._CodecHandoffFailedId !== exactHandoffId
	) {
		return false;
	}
	const completedExactHandoff = Boolean(
		exactHandoffId &&
			info._CodecHandoffPendingId === exactHandoffId &&
			info._CodecHandoffAcknowledgedId === exactHandoffId,
	);
	info._CodecHandoffSequence =
		Math.max(0, Number(info._CodecHandoffSequence) || 0) + 1;
	info._CodecHandoffPendingId = null;
	info._CodecHandoffAcknowledgedId = null;
	info._CodecHandoffFailedId = null;
	info._CodecHandoffReloadRetryCount = 0;
	info.IsUsingModifiedM3U8 = false;
	if (!exactHandoffId || completedExactHandoff) {
		info.EnhancedDecoderCodecFamily = null;
	}
	return true;
}

function _markCodecHandoffReloadFailed(info, handoffId) {
	if (
		!info ||
		typeof handoffId !== "string" ||
		!handoffId ||
		info._CodecHandoffPendingId !== handoffId
	) {
		return false;
	}
	info._CodecHandoffFailedId = handoffId;
	info._CodecHandoffPendingId = null;
	info._CodecHandoffAcknowledgedId = null;
	info.IsUsingModifiedM3U8 = false;
	return true;
}

function _getActiveCodecHandoffIdForInfo(info) {
	if (
		typeof info?._CodecHandoffPendingId === "string" &&
		info._CodecHandoffPendingId
	) {
		return info._CodecHandoffPendingId;
	}
	if (
		typeof __TTVAB_STATE__?.ActiveCodecHandoffId === "string" &&
		__TTVAB_STATE__.ActiveCodecHandoffId &&
		_normalizeMediaKey(__TTVAB_STATE__.ActiveCodecHandoffMediaKey) ===
			_normalizeMediaKey(info?.MediaKey)
	) {
		return __TTVAB_STATE__.ActiveCodecHandoffId;
	}
	return null;
}

function _createCodecHandoffId(info) {
	info._CodecHandoffSequence =
		Math.max(0, Number(info._CodecHandoffSequence) || 0) + 1;
	let nonce = "";
	try {
		if (typeof globalThis.crypto?.randomUUID === "function") {
			nonce = globalThis.crypto.randomUUID();
		} else if (typeof globalThis.crypto?.getRandomValues === "function") {
			const values = new Uint32Array(2);
			globalThis.crypto.getRandomValues(values);
			nonce = `${values[0].toString(36)}${values[1].toString(36)}`;
		}
	} catch {}
	if (!nonce) {
		nonce = `${Math.random().toString(36).slice(2)}${Math.random()
			.toString(36)
			.slice(2)}`;
	}
	return `${info.MediaKey || info.ChannelName || "stream"}:${Date.now()}:${info._CodecHandoffSequence}:${nonce}`;
}

function _requestCodecHandoffReload(info) {
	if (
		typeof info?._CodecHandoffPendingId === "string" &&
		info._CodecHandoffPendingId
	) {
		return info._CodecHandoffPendingId;
	}
	const handoffId = _createCodecHandoffId(info);
	info._CodecHandoffPendingId = handoffId;
	info._CodecHandoffAcknowledgedId = null;
	info._CodecHandoffFailedId = null;
	if (typeof self !== "undefined" && self.postMessage) {
		_postWorkerBridgeMessage(
			self,
			_createPageScopedWorkerEvent({
				key: "ReloadPlayer",
				channel: info.ChannelName,
				mediaKey: info.MediaKey,
				reason: "codec-handoff",
				handoffId,
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
			}),
		);
	}
	_log(
		"[Trace] Clean AVC backup ready; waiting for the retiring HEVC/AV1 request to close",
		"info",
	);
	return handoffId;
}

function _getDirectPlaybackResolutionForUrl(info, url = "") {
	for (const alias of _getPlaylistUrlAliases(url)) {
		const resolution = info?.Urls?.[alias] || null;
		if (resolution) return resolution;
	}
	return null;
}

function _getVideoCodecFamily(codecs) {
	const value = typeof codecs === "string" ? codecs.toLowerCase() : "";
	if (value === "hevc" || _isHevcCodecString(value)) return "hevc";
	if (value === "av1" || value.startsWith("av0")) return "av1";
	if (value.startsWith("avc") || value.startsWith("avc1")) return "avc";
	return null;
}

function _getBackupVariantCodecFamily(m3u8, streamUrl, baseUrl = null) {
	const selectedUrl = _getExactPlaylistUrlKey(streamUrl, baseUrl);
	if (!selectedUrl || typeof m3u8 !== "string") return null;
	const lines = m3u8.split("\n");
	for (let i = 0; i < lines.length - 1; i++) {
		const line = lines[i];
		const rawUrl = lines[i + 1]?.trim();
		if (
			!line?.startsWith("#EXT-X-STREAM-INF") ||
			!rawUrl ||
			rawUrl.startsWith("#")
		) {
			continue;
		}
		if (_getExactPlaylistUrlKey(rawUrl, baseUrl) !== selectedUrl) continue;
		return _getVideoCodecFamily(_parseAttrs(line).CODECS);
	}
	return null;
}

function _isLastCleanNativeForRequest(
	info,
	url,
	requestCodecs = null,
	requestIsEnhanced = false,
	retiringCodecFamily = null,
) {
	const cachedUrl = _getExactPlaylistUrlKey(info?.LastCleanNativeUrl);
	const requestUrl = _getExactPlaylistUrlKey(url);
	if (!cachedUrl || !requestUrl || cachedUrl !== requestUrl) return false;
	const cachedFamily = _getVideoCodecFamily(info?.LastCleanNativeCodec);
	const retiringFamily = _getVideoCodecFamily(retiringCodecFamily);
	if (retiringFamily) return cachedFamily === retiringFamily;
	const requestFamily = _getVideoCodecFamily(requestCodecs);
	if (requestFamily && cachedFamily) return requestFamily === cachedFamily;
	if (requestIsEnhanced && cachedFamily === "avc") return false;
	return true;
}

function _getSameRequestCleanNative(
	info,
	url,
	requestCodecs = null,
	requestIsEnhanced = false,
	maxAgeMs = 10000,
	retiringCodecFamily = null,
) {
	const ageMs = Date.now() - (Number(info?.LastCleanNativePlaylistAt) || 0);
	if (
		!_isLastCleanNativeForRequest(
			info,
			url,
			requestCodecs,
			requestIsEnhanced,
			retiringCodecFamily,
		) ||
		ageMs < 0 ||
		ageMs > Math.max(0, Number(maxAgeMs) || 0) ||
		typeof info?.LastCleanNativeM3U8 !== "string" ||
		!info.LastCleanNativeM3U8 ||
		_hasPlaylistAdMarkers(info.LastCleanNativeM3U8) ||
		_hasExplicitAdMetadata(info.LastCleanNativeM3U8) ||
		_playlistHasKnownAdSegments(info.LastCleanNativeM3U8, {
			includeCached: false,
		})
	) {
		return null;
	}
	return info.LastCleanNativeM3U8;
}

function _createCodecHandoffAbortError(requestSignal = null) {
	const reason = requestSignal?.reason;
	if (reason && typeof reason === "object" && reason.name === "AbortError") {
		return reason;
	}
	if (typeof DOMException === "function") {
		return new DOMException(
			"Retired enhanced-codec playlist request",
			"AbortError",
		);
	}
	const error = new Error("Retired enhanced-codec playlist request");
	error.name = "AbortError";
	return error;
}

async function _holdRetiringCodecRequest(
	info,
	url,
	text,
	requestCodecs,
	requestIsEnhanced,
	requestSignal,
	handoffId,
	retiringCodecFamily = null,
) {
	const bridgeDeadline = Date.now() + 2500;
	let activeHandoffId = handoffId;
	const sourceIsClean =
		(!_getVideoCodecFamily(retiringCodecFamily) ||
			_getVideoCodecFamily(requestCodecs) ===
				_getVideoCodecFamily(retiringCodecFamily)) &&
		_playlistHasMediaSegments(text) &&
		!_hasPlaylistAdMarkers(text) &&
		!_hasExplicitAdMetadata(text) &&
		!_playlistHasKnownAdSegments(text, { includeCached: false });
	while (true) {
		if (requestSignal?.aborted) {
			throw _createCodecHandoffAbortError(requestSignal);
		}
		const sameRequestCleanNative = _getSameRequestCleanNative(
			info,
			url,
			requestCodecs,
			requestIsEnhanced,
			10000,
			retiringCodecFamily,
		);
		if (
			typeof info?._CodecHandoffPendingId === "string" &&
			info._CodecHandoffPendingId &&
			info._CodecHandoffPendingId !== activeHandoffId
		) {
			activeHandoffId = info._CodecHandoffPendingId;
		}
		const transactionFailed = info?._CodecHandoffFailedId === activeHandoffId;
		if (transactionFailed && info?.IsShowingAd) {
			const retryCount = Math.max(
				0,
				Number(info._CodecHandoffReloadRetryCount) || 0,
			);
			const retryDelays = [250, 1000, 3000, 8000, 15000];
			await new Promise((resolve) =>
				setTimeout(
					resolve,
					retryDelays[Math.min(retryCount, retryDelays.length - 1)],
				),
			);
			if (requestSignal?.aborted) {
				throw _createCodecHandoffAbortError(requestSignal);
			}
			if (
				info?._CodecHandoffFailedId === activeHandoffId &&
				!info?._CodecHandoffPendingId
			) {
				info._CodecHandoffReloadRetryCount = retryCount + 1;
				info._CodecHandoffFailedId = null;
				activeHandoffId = _requestCodecHandoffReload(info);
			}
			continue;
		}
		const transactionEnded =
			transactionFailed || info?._CodecHandoffPendingId !== activeHandoffId;
		if (
			sameRequestCleanNative &&
			(info?._CodecHandoffAcknowledgedId === activeHandoffId ||
				transactionEnded ||
				Date.now() >= bridgeDeadline)
		) {
			return sameRequestCleanNative;
		}
		if (transactionEnded && sourceIsClean) {
			return text;
		}
		await new Promise((resolve) => setTimeout(resolve, 16));
	}
}

async function _processM3U8(url, text, realFetch, requestSignal = null) {
	const initialInfo = _getStreamInfoForPlaylist(url);
	const initialResolution = _getDirectPlaybackResolutionForUrl(
		initialInfo,
		url,
	);
	const exactRequestUrl = _getExactPlaylistUrlKey(url);
	const requestIsEnhanced = Boolean(
		_isEnhancedCodecString(initialResolution?.Codecs) ||
			initialInfo?.EnhancedVariantUrls?.has(exactRequestUrl),
	);
	const initialRetiringCodecFamily = _getVideoCodecFamily(
		initialInfo?.EnhancedDecoderCodecFamily,
	);
	const requestCodecs = initialResolution?.Codecs || null;
	const activeHandoffMatches = Boolean(
		initialInfo &&
			typeof __TTVAB_STATE__?.ActiveCodecHandoffId === "string" &&
			__TTVAB_STATE__.ActiveCodecHandoffId &&
			_normalizeMediaKey(__TTVAB_STATE__.ActiveCodecHandoffMediaKey) ===
				_normalizeMediaKey(initialInfo.MediaKey),
	);
	if (initialInfo && requestIsEnhanced && initialInfo.IsUsingModifiedM3U8) {
		const activeHandoffId = activeHandoffMatches
			? __TTVAB_STATE__.ActiveCodecHandoffId
			: initialInfo._CodecHandoffPendingId;
		if (activeHandoffId) {
			initialInfo._CodecHandoffPendingId = activeHandoffId;
			return _holdRetiringCodecRequest(
				initialInfo,
				url,
				text,
				requestCodecs,
				requestIsEnhanced,
				requestSignal,
				activeHandoffId,
				initialRetiringCodecFamily,
			);
		}
	}

	let result = await _processM3U8Core(url, text, realFetch);
	const info = _getStreamInfoForPlaylist(url) || initialInfo;
	if (!info) return result;
	const retiringCodecFamily =
		_getVideoCodecFamily(info.EnhancedDecoderCodecFamily) ||
		initialRetiringCodecFamily;
	const responseHasEnhancedDecoderOwner = Boolean(
		requestIsEnhanced || retiringCodecFamily,
	);

	const returnedCachedBackupBeforeEnhancedStrip = Boolean(
		typeof info.LastCleanBackupM3U8 === "string" &&
			info.LastCleanBackupM3U8 &&
			result === info.LastCleanBackupM3U8,
	);
	const returnedCachedNativeBeforeEnhancedStrip = Boolean(
		typeof info.LastCleanNativeM3U8 === "string" &&
			info.LastCleanNativeM3U8 &&
			result === info.LastCleanNativeM3U8,
	);
	const returnedEmptyHoldBeforeEnhancedStrip = result.includes(
		"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4",
	);
	const requestWasAdMarked =
		_hasPlaylistAdMarkers(text) ||
		_hasExplicitAdMetadata(text) ||
		_playlistHasKnownAdSegments(text, { includeCached: false });
	const resultHasPotentialAdMedia = result
		.replace(/\r/g, "")
		.split("\n")
		.some(
			(line) =>
				(line.startsWith("#EXTINF") && !line.includes(",live")) ||
				_isMediaPartLine(line) ||
				_isPartPreloadHintLine(line) ||
				line.startsWith("#EXT-X-TWITCH-PREFETCH:"),
		);
	if (
		responseHasEnhancedDecoderOwner &&
		requestWasAdMarked &&
		resultHasPotentialAdMedia &&
		!returnedCachedBackupBeforeEnhancedStrip &&
		!returnedCachedNativeBeforeEnhancedStrip &&
		!returnedEmptyHoldBeforeEnhancedStrip
	) {
		result = _stripAds(result, true, info, false, true);
	}

	const returnedCachedBackup = Boolean(
		typeof info.LastCleanBackupM3U8 === "string" &&
			info.LastCleanBackupM3U8 &&
			result === info.LastCleanBackupM3U8,
	);
	const returnedAvcEmptyHold = result.includes(
		"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4",
	);
	const returnedCachedNative = Boolean(
		typeof info.LastCleanNativeM3U8 === "string" &&
			info.LastCleanNativeM3U8 &&
			result === info.LastCleanNativeM3U8,
	);
	const lastCleanNativeMatchesRequest = _isLastCleanNativeForRequest(
		info,
		url,
		requestCodecs,
		requestIsEnhanced,
		retiringCodecFamily,
	);
	const requestCodecFamily = _getVideoCodecFamily(requestCodecs);
	const responseCodecConflictsWithRetiringOwner = Boolean(
		retiringCodecFamily &&
			requestCodecFamily &&
			requestCodecFamily !== retiringCodecFamily &&
			_playlistHasMediaSegments(result),
	);
	const unsafeEnhancedResponse = Boolean(
		info.ModifiedM3U8 &&
			responseHasEnhancedDecoderOwner &&
			(returnedCachedBackup ||
				returnedAvcEmptyHold ||
				(returnedCachedNative && !lastCleanNativeMatchesRequest) ||
				responseCodecConflictsWithRetiringOwner),
	);
	if (!unsafeEnhancedResponse) {
		return _applyBackupSpliceBridge(info, result);
	}

	let backupSearchRetryCount = 0;
	let nextBackupSearchRetryAt = Date.now() + 250;
	const backupSearchRetryDelays = [250, 1000, 3000, 8000, 15000];
	while (true) {
		if (requestSignal?.aborted) {
			throw _createCodecHandoffAbortError(requestSignal);
		}
		const sameRequestCleanNative = _getSameRequestCleanNative(
			info,
			url,
			requestCodecs,
			requestIsEnhanced,
			10000,
			retiringCodecFamily,
		);
		const now = Date.now();
		const backupAt = Number(info.LastCleanBackupAt) || 0;
		const backupAgeMs = now - backupAt;
		const cleanBackupReady = Boolean(
			typeof info.LastCleanBackupM3U8 === "string" &&
				info.LastCleanBackupM3U8 &&
				_getVideoCodecFamily(info.LastCleanBackupCodecFamily) === "avc" &&
				backupAt >= Math.max(0, Number(info.VisibleAdStartedAt) || 0) &&
				backupAgeMs >= 0 &&
				backupAgeMs <= 8000 &&
				!_hasPlaylistAdMarkers(info.LastCleanBackupM3U8) &&
				!_hasExplicitAdMetadata(info.LastCleanBackupM3U8) &&
				!_playlistHasKnownAdSegments(info.LastCleanBackupM3U8, {
					includeCached: false,
				}),
		);
		if (!cleanBackupReady) {
			if (sameRequestCleanNative) return sameRequestCleanNative;
			if (now >= nextBackupSearchRetryAt) {
				backupSearchRetryCount++;
				nextBackupSearchRetryAt =
					now +
					backupSearchRetryDelays[
						Math.min(backupSearchRetryCount, backupSearchRetryDelays.length - 1)
					];
				info._LastBackupSearchCompletedAt = 0;
				const retryTarget = _resolveAdBackupTargetResolution(info, url);
				_findBackupStream(info, realFetch, 0, retryTarget).catch((err) => {
					_log(
						`[Trace] Enhanced-codec backup retry failed: ${err?.message ?? String(err)}`,
						"warning",
					);
				});
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
			continue;
		}

		let handoffId = info._CodecHandoffPendingId;
		if (!handoffId) {
			handoffId = _requestCodecHandoffReload(info);
		}
		return _holdRetiringCodecRequest(
			info,
			url,
			text,
			requestCodecs,
			requestIsEnhanced,
			requestSignal,
			handoffId,
			retiringCodecFamily,
		);
	}
}

async function _processM3U8Core(url, text, realFetch) {
	text = _absolutizeMediaPlaylistUrls(text, url);

	let info = _getStreamInfoForPlaylist(url);
	if (!info) {
		const unknownPlaylistHasAds =
			_hasPlaylistAdMarkers(text) ||
			_hasExplicitAdMetadata(text) ||
			_playlistHasKnownAdSegments(text, { includeCached: false }) ||
			__TTVAB_STATE__.SimulatedAdsDepth > 0;
		if (!unknownPlaylistHasAds) {
			return text;
		}
		info = _createSyntheticStreamInfo(
			_getSyntheticPlaybackContextForPlaylist(url),
			url,
		);
		if (!info) return _createEmptyAdHoldPlaylist(text, null);
	}
	info.LastActivityAt = Date.now();

	const currentAliases = _getPlaylistUrlAliases(url);
	const isBackupUrl = Boolean(
		currentAliases.some((alias) => info.BackupVariantUrls?.has(alias)) ||
			(info.ActiveBackupPlayerType &&
				info.BackupEncodingsM3U8Cache[info.ActiveBackupPlayerType]?.baseUrl ===
					url),
	);

	if (isBackupUrl) {
		return text;
	}

	_recordSustainedNativeResolution(info, url);

	if (!__TTVAB_STATE__.IsAdStrippingEnabled) {
		if (
			info.IsShowingAd ||
			info.IsUsingModifiedM3U8 ||
			info.IsUsingFallbackStream ||
			info.IsUsingBackupStream
		) {
			const endedCodecHandoffId = _getActiveCodecHandoffIdForInfo(info);
			const {
				wasUsingModifiedM3U8,
				wasUsingFallbackStream,
				wasUsingBackupStream,
				hadStrippedAdSegments,
			} = _resetStreamAdState(info);
			__TTVAB_STATE__.CurrentAdChannel = null;
			__TTVAB_STATE__.CurrentAdMediaKey = null;
			__TTVAB_STATE__.PinnedBackupPlayerType = null;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
			__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
			_log("Ad blocking disabled - restoring native stream state", "info");
			if (
				(wasUsingModifiedM3U8 ||
					wasUsingFallbackStream ||
					wasUsingBackupStream ||
					hadStrippedAdSegments) &&
				typeof self !== "undefined" &&
				self.postMessage
			) {
				const shouldReloadPlayer = _shouldReloadNativePlayerAfterAdReset({
					wasUsingModifiedM3U8,
					wasUsingFallbackStream,
					wasUsingBackupStream,
					hadStrippedAdSegments,
				});
				_postWorkerBridgeMessage(
					self,
					_createPageScopedWorkerEvent({
						key: "AdEnded",
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
						handoffId: endedCodecHandoffId,
						willReload: shouldReloadPlayer,
					}),
				);
				if (shouldReloadPlayer) {
					info.LastPlayerReload = Date.now();
					_postWorkerBridgeMessage(
						self,
						_createPageScopedWorkerEvent({
							key: "ReloadPlayer",
							channel: info.ChannelName,
							mediaKey: info.MediaKey,
							refreshAccessToken: false,
							newMediaPlayerInstance: false,
						}),
					);
				} else {
					_postWorkerBridgeMessage(
						self,
						_createPageScopedWorkerEvent({
							key: "PauseResumePlayer",
							channel: info.ChannelName,
							mediaKey: info.MediaKey,
						}),
					);
				}
			}
		}
		return text;
	}

	if (__TTVAB_STATE__.HasTriggeredPlayerReload) {
		const pendingReloadMediaKey = _normalizeMediaKey(
			__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey,
		);
		const pendingReloadChannel = _normalizeChannelName(
			__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel,
		);
		const reloadMatchesThisStream =
			(!pendingReloadMediaKey && !pendingReloadChannel) ||
			(pendingReloadMediaKey &&
				pendingReloadMediaKey === _normalizeMediaKey(info.MediaKey)) ||
			(!pendingReloadMediaKey &&
				pendingReloadChannel &&
				pendingReloadChannel === _normalizeChannelName(info.ChannelName));
		if (reloadMatchesThisStream) {
			__TTVAB_STATE__.HasTriggeredPlayerReload = false;
			__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
			__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
			__TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
			info.LastPlayerReload = Date.now();
		}
	}

	const directResolution = _getDirectPlaybackResolutionForUrl(info, url);
	const res = directResolution || _resolvePlaybackResolutionForUrl(info, url);
	const isEnhancedCodec = Boolean(
		_isEnhancedCodecString(directResolution?.Codecs) ||
			info.EnhancedVariantUrls?.has(_getExactPlaylistUrlKey(url)),
	);
	const requestCodecFamily = _getVideoCodecFamily(
		directResolution?.Codecs || res?.Codecs,
	);
	if (
		isEnhancedCodec &&
		(requestCodecFamily === "hevc" || requestCodecFamily === "av1")
	) {
		info.EnhancedDecoderCodecFamily = requestCodecFamily;
	}

	const hasExplicitKnownAdSegments = _playlistHasKnownAdSegments(text, {
		includeCached: false,
	});
	const adSignifier =
		typeof __TTVAB_STATE__?.AdSignifier === "string" &&
		__TTVAB_STATE__.AdSignifier.trim()
			? __TTVAB_STATE__.AdSignifier.trim()
			: "stitched";
	const hasAds =
		text.includes(adSignifier) ||
		hasExplicitKnownAdSegments ||
		__TTVAB_STATE__.SimulatedAdsDepth > 0;
	const hasMediaSegments = _playlistHasMediaSegments(text);
	const ensureVisibleAdCycle = () => {
		if (info.IsShowingAd) return;
		const now = Date.now();
		const activeAdMediaKey =
			typeof __TTVAB_STATE__.CurrentAdMediaKey === "string"
				? __TTVAB_STATE__.CurrentAdMediaKey
				: null;
		const activeAdChannel =
			typeof __TTVAB_STATE__.CurrentAdChannel === "string"
				? __TTVAB_STATE__.CurrentAdChannel
				: null;
		const isRecentAdEndReentry = _isRecentPostAdReentry(info, now);
		const isContinuingAdCycle = Boolean(
			(activeAdMediaKey && activeAdMediaKey === info.MediaKey) ||
				(!activeAdMediaKey &&
					activeAdChannel &&
					activeAdChannel === info.ChannelName) ||
				isRecentAdEndReentry,
		);
		const sharedPodCycleStartedAt = Math.max(
			0,
			Number(
				__TTVAB_STATE__?.AdPodProgressByMediaKey?.[info.MediaKey]
					?.cycleStartedAt,
			) || 0,
		);

		info.IsShowingAd = true;
		info.VisibleAdStartedAt =
			isContinuingAdCycle && sharedPodCycleStartedAt > 0
				? sharedPodCycleStartedAt
				: now;
		info.IsHoldingBackupAfterAd = false;
		info.SilentBackupHoldStartedAt = 0;
		info.LastSilentBackupHoldLogAt = 0;
		info.ConsecutiveFailedNativeProbes = 0;
		__TTVAB_STATE__.CurrentAdChannel = info.ChannelName;
		__TTVAB_STATE__.CurrentAdMediaKey = info.MediaKey;
		__TTVAB_STATE__.LastAdDetectedAt = now;
		info.FailedBackupPlayerTypes?.clear?.();
		if (!isContinuingAdCycle) {
			info.AdEndConfirmEscalation = 0;
			info._BackupPinFlipCount = 0;
			_incrementAdsBlocked(info.ChannelName, info.MediaKey);
		}
		if (isRecentAdEndReentry) {
			info.AdEndConfirmEscalation =
				(Number(info.AdEndConfirmEscalation) || 0) + 1;
			_log("[Trace] Treating post-ad ad markers as continuation", "info");
		}
		if (typeof self !== "undefined" && self.postMessage) {
			_postWorkerBridgeMessage(
				self,
				_createPageScopedWorkerEvent({
					key: "AdDetected",
					channel: info.ChannelName,
					mediaKey: info.MediaKey,
					continued: isContinuingAdCycle,
					cycleStartedAt: info.VisibleAdStartedAt,
				}),
			);
		}
	};
	if (hasAds && !info.IsHoldingBackupAfterAd) {
		ensureVisibleAdCycle();
	}
	const enterSilentBackupHold = (
		enteredAt,
		heldBackupPlayerType,
		heldBackupResolution,
	) => {
		const [, heldH] = String(heldBackupResolution || "0x0")
			.split("x")
			.map(Number);
		const [, nativeH] = String(
			info.SustainedNativeResolution?.Resolution || "0x0",
		)
			.split("x")
			.map(Number);
		const heldHeight = Number.isFinite(heldH) ? heldH : 0;
		const nativeHeight = Number.isFinite(nativeH) ? nativeH : 0;
		const enhancedDecoderCodecFamily =
			_getVideoCodecFamily(info.EnhancedDecoderCodecFamily) ||
			_getVideoCodecFamily(info.SustainedNativeResolution?.Codecs);
		const heldAutoplayMatchedNative =
			!enhancedDecoderCodecFamily &&
			heldHeight > 0 &&
			nativeHeight > 0 &&
			heldHeight >= nativeHeight;
		info.IsShowingAd = false;
		info.IsHoldingBackupAfterAd = true;
		info.SilentBackupHoldStartedAt = enteredAt;
		info.LastSilentBackupHoldLogAt = enteredAt;
		info.IsUsingBackupStream = true;
		info.ActiveBackupPlayerType = heldBackupPlayerType;
		info.ActiveBackupResolution = heldBackupResolution || null;
		info.HevcReloadPendingAfterHold = Boolean(
			info.HevcReloadPendingAfterHold ||
				info.IsUsingModifiedM3U8 ||
				enhancedDecoderCodecFamily ||
				(heldBackupPlayerType === "autoplay" && !heldAutoplayMatchedNative),
		);
		if (heldBackupPlayerType) {
			__TTVAB_STATE__.PinnedBackupPlayerType = heldBackupPlayerType;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = info.ChannelName || null;
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey = info.MediaKey || null;
		}
		if (info._AdRequestController) {
			info._AdRequestController.abort();
			info._AdRequestController = null;
		}
		_rememberLastAdEnd(info, enteredAt);
	};

	if (!hasAds && hasMediaSegments && !info.IsShowingAd) {
		info.LastCleanNativeM3U8 = text;
		info.LastCleanNativeUrl = url;
		info.LastCleanNativeCodec = directResolution?.Codecs || res?.Codecs || null;
		info.LastCleanNativePlaylistAt = Date.now();
		if (info.IsHoldingBackupAfterAd) {
			let adEndState = "wait";
			try {
				adEndState = await _isAdEndStable(info, realFetch, res);
			} catch (err) {
				_log(
					`[Trace] Silent backup hold recovery check failed: ${err?.message ?? String(err)}`,
					"warning",
				);
			}
			if (adEndState === "ended") {
				const restoredAt = Date.now();
				const requiresReload = Boolean(
					info.HevcReloadPendingAfterHold ||
						_getVideoCodecFamily(info.EnhancedDecoderCodecFamily),
				);
				_resetStreamAdState(info);
				__TTVAB_STATE__.CurrentAdChannel = null;
				__TTVAB_STATE__.CurrentAdMediaKey = null;
				__TTVAB_STATE__.PinnedBackupPlayerType = null;
				__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
				__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
				_rememberLastAdEnd(info, restoredAt);
				_log(
					requiresReload
						? "[Trace] Native playlist verified clean after silent backup hold; reloading player after backup hold"
						: "[Trace] Native playlist verified clean after silent backup hold; restoring native stream",
					"success",
				);
				if (typeof self !== "undefined" && self.postMessage) {
					_postWorkerBridgeMessage(
						self,
						_createPageScopedWorkerEvent({
							key: "NativePlaybackRestored",
							channel: info.ChannelName,
							mediaKey: info.MediaKey,
							restoredAt,
							fromSilentBackupHold: true,
							requiresReload,
						}),
					);
				}
				return text;
			}
		}
	}

	if (hasAds) {
		_notifyAdComplete(text, info).catch(() => {});
		if (typeof _recordAdDurations === "function") {
			_recordAdDurations(text, info);
		}
		const backupHoldMaxMs = _getResolvedAdEndBackupHoldMaxMs();
		const visibleAdStartedAt = Math.max(
			0,
			Number(info.VisibleAdStartedAt) || 0,
		);
		const visibleAdElapsed =
			visibleAdStartedAt > 0 ? Date.now() - visibleAdStartedAt : 0;
		if (
			info.IsShowingAd &&
			info.LastCleanBackupM3U8 &&
			backupHoldMaxMs > 0 &&
			visibleAdElapsed >= backupHoldMaxMs
		) {
			const adEndedAt = Date.now();
			const heldBackupPlayerType =
				info.LastCleanBackupPlayerType || info.ActiveBackupPlayerType || null;
			const endedCodecHandoffId = _getActiveCodecHandoffIdForInfo(info);
			enterSilentBackupHold(
				adEndedAt,
				heldBackupPlayerType,
				(_resolveAdBackupTargetResolution(info, url) || res)?.Resolution ||
					info.ActiveBackupResolution,
			);
			_log(
				"[Trace] Native recovery still ad-marked after extended backup hold; ending visible ad cycle and keeping clean backup stream",
				"warning",
			);
			if (typeof self !== "undefined" && self.postMessage) {
				_postWorkerBridgeMessage(
					self,
					_createPageScopedWorkerEvent({
						key: "AdEnded",
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
						handoffId: endedCodecHandoffId,
						endedAt: adEndedAt,
						willReload: false,
						holdingBackup: true,
					}),
				);
			}
		}
	}

	if (info.IsHoldingBackupAfterAd) {
		if (info.LastCleanBackupM3U8) {
			const now = Date.now();
			const hadNativeRecoveryEvidence =
				Boolean(info.PendingAdEndAt) ||
				Math.max(0, Number(info.CleanPlaylistCount) || 0) > 0 ||
				Math.max(0, Number(info.NativeRecoveryCleanCount) || 0) > 0;
			if (hasAds && hadNativeRecoveryEvidence) {
				info.PendingAdEndAt = 0;
				info.CleanPlaylistCount = 0;
				info.AdEndMarkerBounceLogged = false;
				info.LastNativeRecoveryHoldLogAt = 0;
				info.LastAdEndBounceAt = now;
				info.AdEndConfirmEscalation =
					(Number(info.AdEndConfirmEscalation) || 0) + 1;
				_resetNativeRecoveryReadyState(info, true);
				_log(
					"[Trace] Ad markers returned during silent backup hold; restarting native recovery verification",
					"info",
				);
			}
			const lastLogAt = Math.max(
				0,
				Number(info.LastSilentBackupHoldLogAt) || 0,
			);
			const holdElapsed =
				now - Math.max(0, Number(info.SilentBackupHoldStartedAt) || 0);
			const holdMaxMs = _getResolvedSilentBackupHoldMaxMs();
			if (
				holdMaxMs > 0 &&
				holdElapsed >= holdMaxMs &&
				now - lastLogAt >= 15000
			) {
				info.LastSilentBackupHoldLogAt = now;
				_log(
					"[Trace] Silent backup hold max duration reached; keeping clean backup until native recovery verifies clean",
					"warning",
				);
			} else if (now - lastLogAt >= 15000) {
				info.LastSilentBackupHoldLogAt = now;
				_log(
					hasAds
						? "[Trace] Native playlist still ad-marked during silent backup hold; continuing clean backup stream"
						: "[Trace] Native recovery not yet stable during silent backup hold; continuing clean backup stream",
					hasAds ? "warning" : "info",
				);
			}
			const forceRefreshAt =
				Number(__TTVAB_STATE__?.BackupSearchForceRefreshAt) || 0;
			const stalledDuringHold = forceRefreshAt > 0;
			if (stalledDuringHold) {
				__TTVAB_STATE__.BackupSearchForceRefreshAt = 0;
				const stalledType =
					info.ActiveBackupPlayerType || info.LastCleanBackupPlayerType || null;
				if (stalledType) {
					_markBackupPlayerRetryCooldown(info, stalledType, "stalled");
					_log(
						`[Trace] Silent-hold backup ${stalledType} stalled — cooling down and rotating to next type`,
						"warning",
					);
				}
			}
			const backupAgeMs = now - (Number(info.LastCleanBackupAt) || 0);
			if (stalledDuringHold || backupAgeMs >= 900) {
				const refreshed = stalledDuringHold
					? null
					: await _refreshActiveBackupMediaPlaylist(info, realFetch);
				if (refreshed) {
					info.IsUsingBackupStream = true;
					return refreshed;
				}
				try {
					const refreshedBackup = await _findBackupStream(
						info,
						realFetch,
						0,
						_resolveAdBackupTargetResolution(info, url) || res,
					);
					if (refreshedBackup?.m3u8) {
						info.IsUsingBackupStream = true;
						if (refreshedBackup.type) {
							info.ActiveBackupPlayerType = refreshedBackup.type;
						}
						return refreshedBackup.m3u8;
					}
				} catch (err) {
					_log(
						`[Trace] Backup refresh failed during silent backup hold: ${err?.message ?? String(err)}`,
						"warning",
					);
				}
			}
			info.IsUsingBackupStream = true;
			info.ActiveBackupPlayerType =
				info.LastCleanBackupPlayerType || info.ActiveBackupPlayerType || null;
			return info.LastCleanBackupM3U8;
		}

		info.IsHoldingBackupAfterAd = false;
		info.SilentBackupHoldStartedAt = 0;
		info.LastSilentBackupHoldLogAt = 0;
		_log(
			"[Trace] Silent backup hold lost cached backup; resuming visible ad recovery",
			"warning",
		);
		if (!hasAds) {
			info.IsHoldingBackupAfterAd = true;
			info.SilentBackupHoldStartedAt = Date.now();
			_findBackupStream(
				info,
				realFetch,
				0,
				_resolveAdBackupTargetResolution(info, url) || res,
			).catch(() => {});
			return _createEmptyAdHoldPlaylist(text, info);
		}
		ensureVisibleAdCycle();
	}

	const isOfflinePlaylist =
		!hasMediaSegments &&
		typeof text === "string" &&
		text.includes("#EXT-X-ENDLIST");
	if (isOfflinePlaylist) {
		if (!info._LoggedOfflineTransition) {
			info._LoggedOfflineTransition = true;
			_log(
				"[Trace] Offline playlist detected — using cached stream",
				"warning",
			);
		}
		if (info.LastCleanBackupM3U8) {
			info.IsUsingBackupStream = true;
		}
		return info.LastCleanBackupM3U8 || info.LastCleanNativeM3U8 || text;
	}

	if (hasAds) {
		if (info.PendingAdEndAt || info.CleanPlaylistCount) {
			const elapsedSinceCandidate =
				Date.now() - (Number(info.PendingAdEndAt) || 0);
			const maxWaitMs = _getResolvedAdEndMaxWaitMs();
			const stalenessThreshold = maxWaitMs > 0 ? maxWaitMs * 3 : 12000;
			if (!info.PendingAdEndAt || elapsedSinceCandidate > stalenessThreshold) {
				info.PendingAdEndAt = 0;
			}

			const now = Date.now();
			const debounced = await _serveBounceDebouncedPlaylist(
				info,
				realFetch,
				text,
				now,
			);
			if (debounced !== null) {
				return debounced;
			}

			info.LastAdEndBounceAt = now;
			info.CleanPlaylistCount = 0;
			info.AdEndMarkerBounceLogged = false;
			info.LastNativeRecoveryHoldLogAt = 0;
			info.AdEndConfirmEscalation =
				(Number(info.AdEndConfirmEscalation) || 0) + 1;
			_resetNativeRecoveryReadyState(info, true);
			_log("[Trace] Ad markers returned before ad-end stabilized", "info");
		}

		info.IsMidroll = text.includes('"MIDROLL"') || text.includes('"midroll"');

		if (!res) {
			_log(
				`Missing resolution info for ${url}; using generic fallback`,
				"warning",
			);
		}

		if (!info.IsMidroll) {
			const textStr = typeof text === "string" ? text : "";
			const lines = textStr.replace(/\r/g, "").split("\n");
			for (let j = 0; j < lines.length; j++) {
				const line = lines[j];
				let mediaUrl = "";
				if (line.startsWith("#EXTINF") && lines.length > j + 1) {
					if (line.includes(",live")) {
						continue;
					}
					mediaUrl = lines[j + 1] || "";
				} else if (_isMediaPartLine(line) || _isPartPreloadHintLine(line)) {
					mediaUrl = _getTaggedPlaylistUri(line);
				}
				if (
					mediaUrl &&
					!mediaUrl.startsWith("#") &&
					!info.RequestedAds.has(mediaUrl)
				) {
					info.RequestedAds.add(mediaUrl);
					if (info._AdRequestController) {
						info._AdRequestController.abort();
					}
					const controller = new AbortController();
					info._AdRequestController = controller;
					try {
						realFetch(mediaUrl, { signal: controller.signal })
							.then((r) => r.blob())
							.catch(() => {});
					} catch {}
					break;
				}
			}
		}

		if (info.IsUsingFallbackStream) {
			const preserveEnhancedLive =
				isEnhancedCodec && Boolean(info.ModifiedM3U8);
			text = _stripAds(
				text,
				preserveEnhancedLive,
				info,
				false,
				preserveEnhancedLive,
			);
			return text;
		}

		if (!info.CsaiOnlyThisBreak && !info.IsUsingModifiedM3U8) {
			let hasNonLiveSegment = false;
			const segLines = text.split("\n");
			for (let si = 0; si < segLines.length; si++) {
				if (
					segLines[si]?.startsWith("#EXTINF") &&
					!segLines[si].includes(",live")
				) {
					hasNonLiveSegment = true;
					break;
				}
			}
			if (!hasNonLiveSegment) {
				info.CsaiOnlyThisBreak = true;
				_log("[Trace] CSAI fast path — returning stripped native", "info");
				if (!info._BackupSearchStartedAt && !info.IsUsingFallbackStream) {
					const res = _resolveAdBackupTargetResolution(info, url);
					info._BackupSearchStartedAt = Date.now();
					_findBackupStream(info, realFetch, 0, res)
						.then(() => {
							info._BackupSearchStartedAt = 0;
						})
						.catch(() => {
							info._BackupSearchStartedAt = 0;
						});
				}
				const stripped = _stripAds(text, false, info, true);
				return stripped || text;
			}
		}

		const hasCleanNative =
			_getSameRequestCleanNative(
				info,
				url,
				directResolution?.Codecs || res?.Codecs || null,
				isEnhancedCodec,
				2000,
			) !== null;
		if (hasCleanNative && !_isRecentPostAdReentry(info)) {
			if (!info._BackupSearchStartedAt && !info.IsUsingFallbackStream) {
				const prewarmTargetRes = _resolveAdBackupTargetResolution(info, url);
				info._BackupSearchStartedAt = Date.now();
				_findBackupStream(info, realFetch, 0, prewarmTargetRes)
					.then(() => {
						info._BackupSearchStartedAt = 0;
					})
					.catch(() => {
						info._BackupSearchStartedAt = 0;
					});
			}
			const prewarmedBackupReady =
				typeof info.LastCleanBackupM3U8 === "string" &&
				info.LastCleanBackupM3U8 &&
				Date.now() - (Number(info.LastCleanBackupAt) || 0) < 5000;
			if (!prewarmedBackupReady) {
				_log(
					"[Trace] Returning native playlist to prevent buffer drain during backup search",
					"info",
				);
				return info.LastCleanNativeM3U8;
			}
			_log(
				isEnhancedCodec && info.ModifiedM3U8 && !info.IsUsingModifiedM3U8
					? "[Trace] Pre-warmed AVC backup ready during native bridge; preparing codec-safe reload"
					: "[Trace] Pre-warmed backup ready during native bridge; serving backup early",
				"info",
			);
		}

		let startIdx = 0;
		if (
			info.LastPlayerReload >
			Date.now() - __TTVAB_STATE__.PlayerReloadMinimalRequestsTime
		) {
			startIdx = __TTVAB_STATE__.PlayerReloadMinimalRequestsPlayerIndex;
		}

		if (
			info._LastBackupSearchCompletedAt &&
			Date.now() - info._LastBackupSearchCompletedAt < 15000 &&
			!_isRecentPostAdReentry(info)
		) {
			const forceRefreshAt =
				Number(__TTVAB_STATE__?.BackupSearchForceRefreshAt) || 0;
			const cacheStamp = info._LastBackupSearchCompletedAt || 0;
			if (forceRefreshAt > 0 && forceRefreshAt >= cacheStamp - 1) {
				__TTVAB_STATE__.BackupSearchForceRefreshAt = 0;
				info._LastBackupSearchCompletedAt = 0;
				const stalledType =
					(typeof info.ActiveBackupPlayerType === "string" &&
						info.ActiveBackupPlayerType) ||
					(typeof __TTVAB_STATE__.PinnedBackupPlayerType === "string" &&
						__TTVAB_STATE__.PinnedBackupPlayerType) ||
					null;
				if (stalledType) {
					_markBackupPlayerRetryCooldown(info, stalledType, "stalled");
					_log(
						`[Trace] Pinned backup ${stalledType} stalled — cooling down and rotating to next type`,
						"warning",
					);
				}
				_log(
					`[Trace] Bypassing backup cache: pinned backup stalled (${Math.round((Date.now() - forceRefreshAt) / 100) / 10}s ago)`,
					"warning",
				);
			} else if (info.LastCleanBackupM3U8) {
				const backupAgeMs = Date.now() - (Number(info.LastCleanBackupAt) || 0);
				if (backupAgeMs >= 900) {
					const refreshed = await _refreshActiveBackupMediaPlaylist(
						info,
						realFetch,
					);
					if (refreshed) {
						info.IsUsingBackupStream = true;
						return refreshed;
					}
					info._LastBackupSearchCompletedAt = 0;
				} else {
					info.IsUsingBackupStream = true;
					return info.LastCleanBackupM3U8;
				}
			} else {
				const preserveEnhancedLive =
					isEnhancedCodec && Boolean(info.ModifiedM3U8);
				if (preserveEnhancedLive) {
					info._LastBackupSearchCompletedAt = 0;
				} else {
					return _stripAds(text, false, info);
				}
			}
		}

		if (
			_isRecentPostAdReentry(info) &&
			info.LastCleanBackupM3U8 &&
			info.ActiveBackupPlayerType &&
			info.ActiveBackupPlayerType !== "autoplay"
		) {
			const reentryForceRefreshAt =
				Number(__TTVAB_STATE__?.BackupSearchForceRefreshAt) || 0;
			if (reentryForceRefreshAt > 0) {
				__TTVAB_STATE__.BackupSearchForceRefreshAt = 0;
				_markBackupPlayerRetryCooldown(
					info,
					info.ActiveBackupPlayerType,
					"stalled",
				);
				_log(
					`[Trace] Continuation backup ${info.ActiveBackupPlayerType} stalled — cooling down and rotating to next type`,
					"warning",
				);
			} else {
				const reentryBackupAgeMs =
					Date.now() - (Number(info.LastCleanBackupAt) || 0);
				if (reentryBackupAgeMs < 900) {
					info.IsUsingBackupStream = true;
					return info.LastCleanBackupM3U8;
				}
				const reentryRefreshStartedAt = Date.now();
				const reentryRefreshed = await _refreshActiveBackupMediaPlaylist(
					info,
					realFetch,
				);
				if (reentryRefreshed) {
					info.IsUsingBackupStream = true;
					_log(
						`[Trace] Continuation fast-refresh: ${info.ActiveBackupPlayerType} (${Date.now() - reentryRefreshStartedAt}ms)`,
						"info",
					);
					return reentryRefreshed;
				}
			}
		}

		const backupTargetRes = _resolveAdBackupTargetResolution(info, url) || res;
		let { type: backupType, m3u8: backupM3u8 } = await _findBackupStream(
			info,
			realFetch,
			startIdx,
			backupTargetRes,
		);
		let isFallback = false;

		if (!backupM3u8) {
			if (info.LastCleanBackupM3U8) {
				backupM3u8 = info.LastCleanBackupM3U8;
				backupType =
					info.LastCleanBackupPlayerType || __TTVAB_STATE__.FallbackPlayerType;
				isFallback = true;
				_log(
					"[Trace] Using cached clean backup as emergency fallback",
					"warning",
				);
			} else if (info.LastCleanNativeM3U8) {
				backupM3u8 = info.LastCleanNativeM3U8;
				backupType = __TTVAB_STATE__.FallbackPlayerType;
				isFallback = true;
				_log(
					"[Trace] Using last clean native M3U8 as emergency fallback",
					"warning",
				);
			} else {
				_log(
					"Failed to find backup stream — no cached clean playlists available",
					"warning",
				);
			}
		}

		if (isFallback) {
			info.IsUsingFallbackStream = true;
			_log("Entering fallback mode - stripping ads", "info");
		}

		if (backupM3u8) {
			info.IsUsingBackupStream = true;
			text = backupM3u8;
		}

		info.ActiveBackupResolution = backupTargetRes?.Resolution || null;
		if (backupType) {
			__TTVAB_STATE__.PinnedBackupPlayerType = backupType;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = info.ChannelName || null;
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey = info.MediaKey || null;
		}
		if (info.ActiveBackupPlayerType !== backupType) {
			info.ActiveBackupPlayerType = backupType;
			if (backupType === "autoplay") {
				if (!info._LqHoldStartAt) {
					info._LqHoldStartAt = Date.now();
				}
			} else if (info._LqHoldStartAt) {
				info._LqHoldStartAt = 0;
			}
			_log(`Using backup: ${backupType}`, "info");
			if (backupType && typeof self !== "undefined" && self.postMessage) {
				_postWorkerBridgeMessage(
					self,
					_createPageScopedWorkerEvent({
						key: "BackupPlayerTypeSelected",
						value: backupType,
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
					}),
				);
			}
		}

		info._LastBackupSearchCompletedAt = Date.now();

		if (backupM3u8) {
			if (__TTVAB_STATE__.IsAdStrippingEnabled) {
				text = _stripAds(text, false, info);
			}
		} else if (isEnhancedCodec && info.ModifiedM3U8) {
			text = _stripAds(text, true, info, false, true);
		} else if (__TTVAB_STATE__.IsAdStrippingEnabled) {
			text = _stripAds(text, false, info);
		}
	} else if (info.IsShowingAd) {
		const isOfflinePlaylist =
			!hasMediaSegments &&
			typeof text === "string" &&
			text.includes("#EXT-X-ENDLIST");
		if (isOfflinePlaylist) {
			if (!info._LoggedOfflineTransition) {
				info._LoggedOfflineTransition = true;
				_log(
					"[Trace] Offline playlist detected during ad break — using backup stream",
					"warning",
				);
			}
			if (info.LastCleanBackupM3U8) {
				info.IsUsingBackupStream = true;
			}
			return info.LastCleanBackupM3U8 || info.LastCleanNativeM3U8 || text;
		}
		const res = _resolveAdBackupTargetResolution(info, url);
		let adEndState = "wait";
		try {
			adEndState = await _isAdEndStable(info, realFetch, res);
		} catch (err) {
			_log(
				`[Trace] Ad-end stability check failed: ${err?.message ?? String(err)}`,
				"warning",
			);
			adEndState = "wait";
		}
		if (adEndState === "wait") {
			const backupAgeMs = Date.now() - (Number(info.LastCleanBackupAt) || 0);
			const backupIsFromCurrentCycle =
				Number(info.LastCleanBackupAt) > Number(info.VisibleAdStartedAt);
			if (info.LastCleanBackupM3U8 && backupAgeMs >= 900) {
				const refreshed = await _refreshActiveBackupMediaPlaylist(
					info,
					realFetch,
				);
				if (refreshed) {
					info.IsUsingBackupStream = true;
					return refreshed;
				}
				if (backupIsFromCurrentCycle) {
					try {
						const refreshedBackup = await _findBackupStream(
							info,
							realFetch,
							0,
							res,
						);
						if (refreshedBackup?.m3u8) {
							info.IsUsingBackupStream = true;
							if (refreshedBackup.type) {
								info.ActiveBackupPlayerType = refreshedBackup.type;
							}
							return refreshedBackup.m3u8;
						}
					} catch (err) {
						_log(
							`[Trace] Backup refresh failed during ad-end wait: ${err?.message ?? String(err)}`,
							"warning",
						);
					}
				}
			}
			if (info.LastCleanBackupM3U8) {
				info.IsUsingBackupStream = true;
				return info.LastCleanBackupM3U8;
			}
			return info.LastCleanNativeM3U8 || text;
		}

		const adEndedAt = Date.now();
		const isSilentBackupHoldEnd = adEndState === "ended-with-backup-hold";
		const heldBackupM3U8 = isSilentBackupHoldEnd
			? info.LastCleanBackupM3U8
			: null;
		const heldBackupPlayerType = isSilentBackupHoldEnd
			? info.LastCleanBackupPlayerType || info.ActiveBackupPlayerType || null
			: null;
		const heldBackupResolution = isSilentBackupHoldEnd
			? info.ActiveBackupResolution || null
			: null;
		const endedCodecHandoffId = _getActiveCodecHandoffIdForInfo(info);
		const transitionState = {
			wasUsingModifiedM3U8: Boolean(info.IsUsingModifiedM3U8),
			wasUsingFallbackStream: Boolean(info.IsUsingFallbackStream),
			wasUsingBackupStream: Boolean(info.IsUsingBackupStream),
			hadStrippedAdSegments:
				Math.max(0, Number(info.NumStrippedAdSegments) || 0) > 0,
		};
		if (isSilentBackupHoldEnd && heldBackupM3U8) {
			enterSilentBackupHold(
				adEndedAt,
				heldBackupPlayerType,
				heldBackupResolution ||
					(_resolvePreferredBackupResolution(info) || res)?.Resolution ||
					null,
			);
		} else {
			_resetStreamAdState(info);
			__TTVAB_STATE__.CurrentAdChannel = null;
			__TTVAB_STATE__.CurrentAdMediaKey = null;
			__TTVAB_STATE__.PinnedBackupPlayerType = null;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
		}
		const {
			wasUsingModifiedM3U8,
			wasUsingFallbackStream,
			wasUsingBackupStream,
			hadStrippedAdSegments,
		} = transitionState;
		if (typeof self !== "undefined" && self.postMessage) {
			const shouldUseHevcReload = Boolean(wasUsingModifiedM3U8);
			const recentPostEscapeReload =
				info.LastAdEndReloadKind === "post-escape" &&
				info.LastAdEndReloadAt > 0 &&
				adEndedAt - info.LastAdEndReloadAt < 30000;
			if (recentPostEscapeReload) {
				info.PostEscapeReloadCounterproductive = true;
			}
			const isCsaiBreak = !hadStrippedAdSegments && !wasUsingModifiedM3U8;
			let shouldReloadPlayer = false;
			let shouldPauseResumePlayer = false;
			let reloadKind = "post-ad";
			const needsHardReload = shouldUseHevcReload;

			if (isCsaiBreak) {
				if (
					wasUsingBackupStream &&
					!recentPostEscapeReload &&
					!isSilentBackupHoldEnd
				) {
					if (info.PostEscapeReloadCounterproductive) {
						shouldPauseResumePlayer = true;
					} else {
						shouldReloadPlayer = true;
						reloadKind = "post-escape";
					}
				}
			} else if (!isSilentBackupHoldEnd) {
				shouldReloadPlayer = Boolean(
					shouldUseHevcReload ||
						(_C?.RELOAD_AFTER_AD !== false &&
							hadStrippedAdSegments &&
							!recentPostEscapeReload),
				);
				shouldPauseResumePlayer = Boolean(
					!shouldReloadPlayer && !wasUsingFallbackStream,
				);
			}
			if (!recentPostEscapeReload) {
				info.PostEscapeReloadCounterproductive = false;
			}
			_postWorkerBridgeMessage(
				self,
				_createPageScopedWorkerEvent({
					key: "AdEnded",
					channel: info.ChannelName,
					mediaKey: info.MediaKey,
					handoffId: endedCodecHandoffId,
					endedAt: adEndedAt,
					willReload: shouldReloadPlayer,
					holdingBackup: isSilentBackupHoldEnd,
				}),
			);
			if (shouldReloadPlayer) {
				info.LastPlayerReload = Date.now();
				info.LastAdEndReloadKind = reloadKind;
				_postWorkerBridgeMessage(
					self,
					_createPageScopedWorkerEvent({
						key: "ReloadPlayer",
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
						reason: reloadKind,
						refreshAccessToken: true,
						newMediaPlayerInstance: needsHardReload,
					}),
				);
			} else if (shouldPauseResumePlayer) {
				info.LastAdEndReloadKind = null;
				_postWorkerBridgeMessage(
					self,
					_createPageScopedWorkerEvent({
						key: "PauseResumePlayer",
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
					}),
				);
			} else {
				info.LastAdEndReloadKind = null;
			}
			_rememberLastAdEnd(info, adEndedAt);
		}
		if (isSilentBackupHoldEnd && heldBackupM3U8) {
			return heldBackupM3U8;
		}
	}

	return text;
}

function _getFallbackPromotionPolicy({
	candidateHasAds,
	candidateIsPlayable,
	simulatedAdsDepthSatisfied,
}) {
	if (!candidateIsPlayable) {
		return { allowSelectedPromotion: false, reason: "not-playable" };
	}
	if (candidateHasAds) {
		return { allowSelectedPromotion: false, reason: "ad-marked" };
	}
	if (!simulatedAdsDepthSatisfied) {
		return { allowSelectedPromotion: false, reason: "simulated-ads-depth" };
	}

	return { allowSelectedPromotion: true, reason: "clean-playable" };
}

function _getResolvedLqHqHoldMinMs() {
	return Math.max(
		0,
		Number(__TTVAB_STATE__?.LqHqHoldMinMs) ||
			Number(_C?.LQ_HQ_HOLD_MIN_MS) ||
			0,
	);
}

function _shouldTryAutoplayFirst(info) {
	if (__TTVAB_STATE__?.DisableAutoplayBackup) return false;
	if (
		!(__TTVAB_STATE__?.BackupPlayerTypes || []).includes("autoplay") ||
		_isBackupPlayerRetryCoolingDown(info, "autoplay")
	) {
		return false;
	}
	const lqHoldStartAt = Number(info?._LqHoldStartAt) || 0;
	const lqHoldMinMs = _getResolvedLqHqHoldMinMs();
	if (
		lqHoldStartAt > 0 &&
		lqHoldMinMs > 0 &&
		Date.now() - lqHoldStartAt < lqHoldMinMs &&
		info?.ActiveBackupPlayerType === "autoplay"
	) {
		return true;
	}
	if (info?.ActiveBackupPlayerType) return false;
	return Boolean(
		info?.IsShowingAd && (Number(info?.VisibleAdStartedAt) || 0) > 0,
	);
}

function _shouldHoldAutoplayBackupDuringAd(info) {
	if (__TTVAB_STATE__?.DisableAutoplayBackup) return false;
	if (_isBackupPlayerRetryCoolingDown(info, "autoplay")) return false;
	const lqHoldMinMs = _getResolvedLqHqHoldMinMs();
	const lqHoldStartAt = Number(info?._LqHoldStartAt) || 0;
	const holdStartedAt = lqHoldStartAt || Number(info?.LastCleanBackupAt) || 0;
	const withinLqHoldWindow =
		lqHoldMinMs > 0 &&
		holdStartedAt > 0 &&
		Date.now() - holdStartedAt < lqHoldMinMs;

	return Boolean(
		info?.IsShowingAd &&
			info?.ActiveBackupPlayerType === "autoplay" &&
			info?.LastCleanBackupPlayerType === "autoplay" &&
			typeof info?.LastCleanBackupM3U8 === "string" &&
			info.LastCleanBackupM3U8 &&
			withinLqHoldWindow &&
			(Number(info.LastCleanBackupAt) || 0) >=
				Math.max(0, Number(info.VisibleAdStartedAt) || 0),
	);
}

function _shouldBridgeHeldAutoplayDuringSearch(info) {
	if (__TTVAB_STATE__?.DisableAutoplayBackup) return false;
	if (_isBackupPlayerRetryCoolingDown(info, "autoplay")) return false;
	if (info?.ActiveBackupPlayerType !== "autoplay") return false;
	if (info?.LastCleanBackupPlayerType !== "autoplay") return false;
	if (
		typeof info?.LastCleanBackupM3U8 !== "string" ||
		!info.LastCleanBackupM3U8
	) {
		return false;
	}
	if (info?.IsHoldingBackupAfterAd) return true;
	return Boolean(
		info?.IsShowingAd &&
			(Number(info.LastCleanBackupAt) || 0) >=
				Math.max(0, Number(info.VisibleAdStartedAt) || 0),
	);
}

function _getBackupBridgeMaxVariantHeight(info) {
	const encCache = info?.BackupEncodingsM3U8Cache?.autoplay;
	const enc = typeof encCache === "string" ? encCache : encCache?.m3u8 || null;
	if (typeof enc !== "string" || !enc) return 0;
	let maxHeight = 0;
	const re = /RESOLUTION=\d+x(\d+)/g;
	let match = re.exec(enc);
	while (match !== null) {
		const h = Number(match[1]);
		if (Number.isFinite(h) && h > maxHeight) maxHeight = h;
		match = re.exec(enc);
	}
	return maxHeight;
}

function _shouldHoldBridgeInsteadOfRotating(info, targetRes) {
	if (!_shouldBridgeHeldAutoplayDuringSearch(info)) return false;
	if ((Number(info?._BackupPinFlipCount) || 0) >= 2) return true;
	const [, targetHeight] = String(targetRes?.Resolution || "0x0")
		.split("x")
		.map(Number);
	if (!Number.isFinite(targetHeight) || targetHeight <= 0) return false;
	const bridgeCeiling = _getBackupBridgeMaxVariantHeight(info);
	if (bridgeCeiling <= 0) return false;
	return targetHeight <= bridgeCeiling;
}

async function _refreshHeldAutoplayBackupPlaylist(
	info,
	realFetch,
	currentResolution = null,
) {
	const encCache = info?.BackupEncodingsM3U8Cache?.autoplay;
	const enc = typeof encCache === "string" ? encCache : encCache?.m3u8 || null;
	if (!enc) return null;
	const encBaseUrl =
		typeof encCache === "object" && encCache?.baseUrl
			? encCache.baseUrl
			: info.UsherBaseUrl;
	const resolvedTargetRes =
		currentResolution ||
		_getFallbackResolution(info, "") ||
		info?.ResolutionList?.[0] ||
		(typeof __TTVAB_STATE__?.PreferredQualityGroup === "string" &&
		__TTVAB_STATE__.PreferredQualityGroup.trim()
			? { Name: __TTVAB_STATE__.PreferredQualityGroup.trim() }
			: null);
	const targetRes = _applyBackupResolutionFloor(
		resolvedTargetRes,
		info?.ResolutionList,
	);
	const compatibleMaster = _stripHevcBackupVariants(info, enc);
	const streamUrl = _getStreamUrl(compatibleMaster, targetRes, encBaseUrl);
	if (!streamUrl) return null;
	const selectedCodecFamily = _getBackupVariantCodecFamily(
		compatibleMaster,
		streamUrl,
		encBaseUrl,
	);
	try {
		const streamRes = await _fetchWithTimeout(realFetch, streamUrl);
		if (streamRes.status !== 200) return null;
		const m3u8 = _absolutizeMediaPlaylistUrls(
			await streamRes.text(),
			streamUrl,
		);
		if (!m3u8 || !_playlistHasMediaSegments(m3u8)) return null;
		const hasAds =
			_hasPlaylistAdMarkers(m3u8) ||
			_hasExplicitAdMetadata(m3u8) ||
			_playlistHasKnownAdSegments(m3u8, { includeCached: false });
		if (hasAds) return null;
		info.LastCleanBackupM3U8 = m3u8;
		info.LastCleanBackupPlayerType = "autoplay";
		info.LastCleanBackupCodecFamily = selectedCodecFamily;
		info.LastCleanBackupAt = Date.now();
		if (targetRes?.Resolution) {
			info.ActiveBackupResolution = targetRes.Resolution;
		}
		return m3u8;
	} catch {
		return null;
	}
}

async function _refreshActiveBackupMediaPlaylist(info, realFetch) {
	const pt =
		(typeof info?.ActiveBackupPlayerType === "string" &&
			info.ActiveBackupPlayerType) ||
		(typeof info?.LastCleanBackupPlayerType === "string" &&
			info.LastCleanBackupPlayerType) ||
		null;
	if (!pt || pt === "autoplay") return null;
	if (_isBackupPlayerRetryCoolingDown(info, pt)) return null;

	const encCache = info.BackupEncodingsM3U8Cache?.[pt];
	const enc = typeof encCache === "string" ? encCache : encCache?.m3u8 || null;
	const encBaseUrl =
		typeof encCache === "object" && encCache?.baseUrl
			? encCache.baseUrl
			: info.UsherBaseUrl;
	if (!enc) return null;

	const preferredRefreshResolution = _resolvePreferredBackupResolution(info);
	const targetRes = _applyBackupResolutionFloor(
		preferredRefreshResolution ||
			_getFallbackResolution(info, "") ||
			info?.ResolutionList?.[0] ||
			(typeof __TTVAB_STATE__?.PreferredQualityGroup === "string" &&
			__TTVAB_STATE__.PreferredQualityGroup.trim()
				? { Name: __TTVAB_STATE__.PreferredQualityGroup.trim() }
				: null),
		info?.ResolutionList,
	);
	const compatibleMaster = _stripHevcBackupVariants(info, enc);
	const streamUrl = _getStreamUrl(compatibleMaster, targetRes, encBaseUrl);
	if (!streamUrl) return null;
	const selectedCodecFamily = _getBackupVariantCodecFamily(
		compatibleMaster,
		streamUrl,
		encBaseUrl,
	);

	try {
		const streamRes = await _fetchWithTimeout(realFetch, streamUrl);
		if (streamRes.status !== 200) return null;
		const m3u8 = _absolutizeMediaPlaylistUrls(
			await streamRes.text(),
			streamUrl,
		);
		if (!m3u8 || !_playlistHasMediaSegments(m3u8)) return null;
		const hasAds =
			_hasPlaylistAdMarkers(m3u8) ||
			_hasExplicitAdMetadata(m3u8) ||
			_playlistHasKnownAdSegments(m3u8, { includeCached: false });
		if (hasAds) return null;
		info.LastCleanBackupM3U8 = m3u8;
		info.LastCleanBackupPlayerType = pt;
		info.LastCleanBackupCodecFamily = selectedCodecFamily;
		info.LastCleanBackupAt = Date.now();
		if (targetRes?.Resolution) {
			info.ActiveBackupResolution = targetRes.Resolution;
		}
		return m3u8;
	} catch {
		return null;
	}
}

async function _prepareFatalMediaRecovery(info, realFetch, request) {
	const recoveryId =
		typeof request?.recoveryId === "string" && request.recoveryId
			? request.recoveryId
			: null;
	const requestedAt = Math.max(0, Number(request?.requestedAt) || 0);
	const requestContext = _normalizePlaybackContext({
		MediaType: info?.MediaType,
		ChannelName: request?.channelName,
		VodID: info?.VodID,
		MediaKey: request?.mediaKey,
	});
	const mediaKey = _normalizeMediaKey(info?.MediaKey);
	const currentAdMediaKey = _normalizeMediaKey(
		__TTVAB_STATE__?.CurrentAdMediaKey,
	);
	if (
		!recoveryId ||
		!requestedAt ||
		Date.now() - requestedAt > 30000 ||
		requestedAt - Date.now() > 5000 ||
		!mediaKey ||
		requestContext.MediaKey !== mediaKey ||
		currentAdMediaKey !== mediaKey ||
		(!info?.IsShowingAd && !info?.IsHoldingBackupAfterAd) ||
		typeof info?.ModifiedM3U8 !== "string" ||
		!info.ModifiedM3U8 ||
		typeof realFetch !== "function"
	) {
		return false;
	}
	info._FatalMediaRecoveryRequestId = recoveryId;
	const recoveryIsCurrent = () => {
		const currentInfo = __TTVAB_STATE__?.StreamInfos?.[mediaKey] || null;
		return Boolean(
			info._FatalMediaRecoveryRequestId === recoveryId &&
				(!currentInfo || currentInfo === info) &&
				_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) === mediaKey &&
				(info.IsShowingAd || info.IsHoldingBackupAfterAd) &&
				typeof info.ModifiedM3U8 === "string" &&
				info.ModifiedM3U8,
		);
	};

	const targetResolution = _resolveAdBackupTargetResolution(info, "");
	let cleanBackup = null;
	try {
		if (
			info.ActiveBackupPlayerType === "autoplay" ||
			info.LastCleanBackupPlayerType === "autoplay"
		) {
			cleanBackup = await _refreshHeldAutoplayBackupPlaylist(
				info,
				realFetch,
				targetResolution,
			);
		} else {
			cleanBackup = await _refreshActiveBackupMediaPlaylist(info, realFetch);
		}
		if (!recoveryIsCurrent()) return false;
		if (!cleanBackup) {
			const backup = await _findBackupStream(
				info,
				realFetch,
				0,
				targetResolution,
			);
			cleanBackup = backup?.m3u8 || null;
		}
		if (!recoveryIsCurrent()) return false;
	} catch (error) {
		_log(
			`[Trace] Fatal media recovery backup verification failed: ${error?.message ?? String(error)}`,
			"warning",
		);
		return false;
	}

	const verifiedAt = Math.max(0, Number(info.LastCleanBackupAt) || 0);
	const activeContextStillMatches =
		_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) === mediaKey;
	const cleanBackupIsSafe = Boolean(
		typeof cleanBackup === "string" &&
			cleanBackup &&
			_getVideoCodecFamily(info.LastCleanBackupCodecFamily) === "avc" &&
			verifiedAt >= requestedAt &&
			_playlistHasMediaSegments(cleanBackup) &&
			!_hasPlaylistAdMarkers(cleanBackup) &&
			!_hasExplicitAdMetadata(cleanBackup) &&
			!_playlistHasKnownAdSegments(cleanBackup, { includeCached: false }),
	);
	if (
		!recoveryIsCurrent() ||
		!activeContextStillMatches ||
		(!info.IsShowingAd && !info.IsHoldingBackupAfterAd) ||
		!cleanBackupIsSafe
	) {
		return false;
	}

	info._CodecHandoffPendingId = recoveryId;
	info._CodecHandoffAcknowledgedId = null;
	info._CodecHandoffFailedId = null;
	info.IsUsingModifiedM3U8 = true;
	if (typeof self !== "undefined" && self.postMessage) {
		_postWorkerBridgeMessage(
			self,
			_createPageScopedWorkerEvent({
				key: "FatalMediaRecoveryReady",
				recoveryId,
				channel: info.ChannelName,
				mediaKey,
				verifiedAt,
				backupPlayerType:
					info.LastCleanBackupPlayerType || info.ActiveBackupPlayerType || null,
			}),
		);
	}
	_log("[Trace] Fatal media recovery has a fresh clean AVC backup", "success");
	return true;
}

async function _findBackupStream(
	info,
	realFetch,
	startIdx = 0,
	currentResolution = null,
) {
	if (info?._BackupSearchPromise) {
		if (
			_shouldBridgeHeldAutoplayDuringSearch(info) &&
			!_shouldHoldAutoplayBackupDuringAd(info)
		) {
			const bridged = await _refreshHeldAutoplayBackupPlaylist(
				info,
				realFetch,
				currentResolution,
			);
			if (bridged) return { type: "autoplay", m3u8: bridged };
		}
		return info._BackupSearchPromise;
	}
	const searchPromise = (async () => {
		try {
			return await _searchBackupStream(
				info,
				realFetch,
				startIdx,
				currentResolution,
			);
		} finally {
			if (info && info._BackupSearchPromise === searchPromise) {
				info._BackupSearchPromise = null;
			}
		}
	})();
	if (info) {
		info._BackupSearchPromise = searchPromise;
		if (
			_shouldBridgeHeldAutoplayDuringSearch(info) &&
			!_shouldHoldAutoplayBackupDuringAd(info)
		) {
			searchPromise.catch(() => {});
			const raced = await Promise.race([
				searchPromise,
				new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
			]);
			if (raced?.m3u8) return raced;
			const bridged = await _refreshHeldAutoplayBackupPlaylist(
				info,
				realFetch,
				currentResolution,
			);
			if (bridged) {
				_log(
					"[Trace] Serving live-refreshed autoplay while HQ probe continues in background",
					"info",
				);
				return { type: "autoplay", m3u8: bridged };
			}
		}
	}
	return searchPromise;
}

async function _searchBackupStream(
	info,
	realFetch,
	startIdx = 0,
	currentResolution = null,
) {
	_forceClearBackupCooldownsIfStale(info);
	let backupType = null;
	let backupM3u8 = null;

	let playerTypes = _getOrderedBackupPlayerTypes(info, startIdx);
	// this break get deprioritized so clean types get tried first.
	if (info.LoggedBackupAdsByType && info.LoggedBackupAdsByType.size > 0) {
		const clean: string[] = [];
		const contam: string[] = [];
		for (const t of playerTypes) {
			if (info.LoggedBackupAdsByType.has(t)) contam.push(t);
			else clean.push(t);
		}
		if (contam.length > 0 && clean.length > 0) {
			playerTypes = [...clean, ...contam];
		}
	}
	const resolvedTargetRes =
		currentResolution ||
		_getFallbackResolution(info, "") ||
		info?.ResolutionList?.[0] ||
		(typeof __TTVAB_STATE__?.PreferredQualityGroup === "string" &&
		__TTVAB_STATE__.PreferredQualityGroup.trim()
			? { Name: __TTVAB_STATE__.PreferredQualityGroup.trim() }
			: null);
	const targetRes = _applyBackupResolutionFloor(
		resolvedTargetRes,
		info?.ResolutionList,
	);
	if (targetRes !== resolvedTargetRes) {
		_log(
			`[Trace] Backup target raised from ${resolvedTargetRes?.Resolution || "?"} to ${targetRes?.Resolution || "?"} (sub-360p floor)`,
			"info",
		);
	}
	if (_shouldHoldAutoplayBackupDuringAd(info)) {
		playerTypes = ["autoplay"];
		_log(
			"[Trace] Holding autoplay backup during LQ dwell; deferring HQ probe briefly",
			"info",
		);
	} else if (_shouldHoldBridgeInsteadOfRotating(info, targetRes)) {
		playerTypes = ["autoplay"];
		if (!info._LoggedWhitelistByType) {
			info._LoggedWhitelistByType = new Set();
		}
		const holdReason =
			(Number(info._BackupPinFlipCount) || 0) >= 2
				? "bridge-hold:flip-cap"
				: "bridge-hold:same-res";
		if (!info._LoggedWhitelistByType.has(holdReason)) {
			info._LoggedWhitelistByType.add(holdReason);
			_log(
				holdReason === "bridge-hold:flip-cap"
					? "[Trace] Backup rotation capped after repeated ad-marked flips; holding stable bridge for this break"
					: "[Trace] HQ probe skipped; bridge already serves the target quality",
				"info",
			);
		}
	} else if (_shouldTryAutoplayFirst(info)) {
		playerTypes = [
			"autoplay",
			...playerTypes.filter((pt) => pt !== "autoplay"),
		];
		_log(
			"[Trace] LQ autoplay prioritized first for fast clean first-frame (seamless LQ→HQ hold)",
			"info",
		);
	} else if (
		__TTVAB_STATE__.DisableAutoplayBackup &&
		(__TTVAB_STATE__?.BackupPlayerTypes || []).includes("autoplay") &&
		!playerTypes.includes("autoplay")
	) {
		playerTypes.push("autoplay");
		if (!info._LoggedWhitelistByType) {
			info._LoggedWhitelistByType = new Set();
		}
		if (!info._LoggedWhitelistByType.has("lq-emergency")) {
			info._LoggedWhitelistByType.add("lq-emergency");
			_log(
				"[Trace] LQ autoplay appended as emergency last-resort after source backups",
				"info",
			);
		}
	}
	const playerTypesLen = playerTypes.length;
	const isDoingMinimalRequests =
		startIdx > 0 &&
		playerTypes.every(
			(playerType) =>
				(__TTVAB_STATE__?.BackupPlayerTypes || []).indexOf(playerType) >=
				startIdx,
		);

	for (let pi = 0; !backupM3u8 && pi < playerTypesLen; pi++) {
		const pt = playerTypes[pi];
		const configuredPlayerTypeIndex = Math.max(
			0,
			(__TTVAB_STATE__?.BackupPlayerTypes || []).indexOf(pt),
		);
		if (_isBackupPlayerRetryCoolingDown(info, pt)) {
			if (!info._LoggedWhitelistByType) {
				info._LoggedWhitelistByType = new Set();
			}
			if (!info._LoggedWhitelistByType.has(`cooldown:${pt}`)) {
				info._LoggedWhitelistByType.add(`cooldown:${pt}`);
				_log(`[Trace] Cooling down: ${pt}`, "info");
			}
			continue;
		}
		_log(`[Trace] Checking: ${pt}`, "info");

		for (let j = 0; j < 2; j++) {
			let isFreshM3u8 = false;
			let invalidateCache = false;
			const encCache = info.BackupEncodingsM3U8Cache[pt];
			let enc =
				typeof encCache === "string" ? encCache : encCache?.m3u8 || null;
			let encBaseUrl =
				typeof encCache === "object" && encCache?.baseUrl
					? encCache.baseUrl
					: info.UsherBaseUrl;

			if (!enc) {
				isFreshM3u8 = true;
				try {
					const tokenRes = await _getToken(info, pt, realFetch);
					if (tokenRes.status === 200) {
						const token = await tokenRes.json();
						const extractedToken = _extractPlaybackAccessToken(token);
						const sig = extractedToken?.signature;
						const tokenValue = extractedToken?.value;

						if (sig && tokenValue) {
							const usherUrl = _buildUsherPlaybackUrl(info, sig, tokenValue);
							if (!usherUrl) {
								_log(`Missing usher context for ${pt}`, "warning");
								_markBackupPlayerRetryCooldown(info, pt, "token-error");
								invalidateCache = true;
								continue;
							}
							const encRes = await _fetchWithTimeout(realFetch, usherUrl.href);
							if (encRes.status === 200) {
								enc = await encRes.text();
								encBaseUrl = usherUrl.href;
								info.BackupEncodingsM3U8Cache[pt] = {
									m3u8: enc,
									baseUrl: encBaseUrl,
								};

								// Whitelist all variants in the backup master playlist
								const lines = enc.split("\n");
								for (let i = 0; i < lines.length; i++) {
									const line = lines[i]?.trim();
									if (
										line &&
										!line.startsWith("#") &&
										(line.endsWith(".m3u8") || line.includes("://"))
									) {
										try {
											const variantUrl = new URL(line, encBaseUrl).href;
											info.BackupVariantUrls?.add(variantUrl);
											for (const alias of _getPlaylistUrlAliases(variantUrl)) {
												info.BackupVariantUrls?.add(alias);
											}
										} catch {}
									}
								}
								if (!info._LoggedWhitelistByType) {
									info._LoggedWhitelistByType = new Set();
								}
								if (!info._LoggedWhitelistByType.has(`whitelist:${pt}`)) {
									info._LoggedWhitelistByType.add(`whitelist:${pt}`);
									_log(
										`[Trace] Whitelisted variants for ${pt} (Total: ${info.BackupVariantUrls.size})`,
									);
								}
								while (info.BackupVariantUrls.size > 200) {
									const first = info.BackupVariantUrls.values().next().value;
									if (first !== undefined) info.BackupVariantUrls.delete(first);
									else break;
								}
							} else {
								_log(`Usher failed for ${pt}: ${encRes.status}`, "warning");
								_markBackupPlayerRetryCooldown(info, pt, "token-error");
							}
						} else {
							const missingParts = [
								extractedToken?.hasAnySignature ? null : "signature",
								extractedToken?.hasAnyValue ? null : "value",
							]
								.filter(Boolean)
								.join("+");
							const tokenErrors = Array.isArray(extractedToken?.errors)
								? extractedToken.errors.slice(0, 2).join(" | ")
								: "";
							const tokenContext = tokenErrors
								? ` errors=${tokenErrors}`
								: extractedToken?.summary
									? ` payload=${extractedToken.summary}`
									: "";
							_log(
								`[Trace] Missing token ${missingParts || "parts"} for ${pt}${tokenContext}`,
								"warning",
							);
							_markBackupPlayerRetryCooldown(info, pt, "token-error");
						}
					} else {
						_log(`Token failed for ${pt}: ${tokenRes.status}`, "warning");
						_markBackupPlayerRetryCooldown(info, pt, "token-error");
					}
				} catch (e) {
					_log(`Backup error: ${e.message}`, "error");
					_markBackupPlayerRetryCooldown(info, pt, "error");
					info._BackupSearchErrorCount =
						(info._BackupSearchErrorCount || 0) + 1;
				}
			}

			if (enc) {
				if (!isFreshM3u8) {
					const lines = enc.split("\n");
					for (let i = 0; i < lines.length; i++) {
						const line = lines[i]?.trim();
						if (
							line &&
							!line.startsWith("#") &&
							(line.endsWith(".m3u8") || line.includes("://"))
						) {
							try {
								const variantUrl = new URL(line, encBaseUrl).href;
								info.BackupVariantUrls?.add(variantUrl);
								for (const alias of _getPlaylistUrlAliases(variantUrl)) {
									info.BackupVariantUrls?.add(alias);
								}
							} catch {}
						}
					}
					while (info.BackupVariantUrls.size > 200) {
						const first = info.BackupVariantUrls.values().next().value;
						if (first !== undefined) info.BackupVariantUrls.delete(first);
						else break;
					}
				}
				try {
					const compatibleMaster = _stripHevcBackupVariants(info, enc);
					const streamUrl = _getStreamUrl(
						compatibleMaster,
						targetRes,
						encBaseUrl,
					);
					if (streamUrl) {
						const selectedCodecFamily = _getBackupVariantCodecFamily(
							compatibleMaster,
							streamUrl,
							encBaseUrl,
						);
						const streamRes = await _fetchWithTimeout(realFetch, streamUrl);
						if (streamRes.status === 200) {
							const m3u8 = _absolutizeMediaPlaylistUrls(
								await streamRes.text(),
								streamUrl,
							);
							if (m3u8) {
								const candidateIsPlayable = _playlistHasMediaSegments(m3u8);
								const candidateHasAds =
									_hasPlaylistAdMarkers(m3u8) ||
									_hasExplicitAdMetadata(m3u8) ||
									_playlistHasKnownAdSegments(m3u8, {
										includeCached: false,
									});
								const simulatedAdsDepthSatisfied =
									__TTVAB_STATE__.SimulatedAdsDepth === 0 ||
									configuredPlayerTypeIndex >=
										__TTVAB_STATE__.SimulatedAdsDepth - 1;
								const promotionPolicy =
									typeof _getFallbackPromotionPolicy === "function"
										? _getFallbackPromotionPolicy({
												candidateHasAds,
												candidateIsPlayable,
												simulatedAdsDepthSatisfied,
											})
										: {
												allowSelectedPromotion: false,
												reason: "policy-unavailable",
											};

								if (promotionPolicy.allowSelectedPromotion) {
									const probation = info._BackupProbation;
									const requiredCleanHolds =
										(Number(info._BackupPinFlipCount) || 0) > 0 ? 2 : 1;
									const priorCleanHolds =
										probation?.type === pt
											? Number(probation.cleanChecks) || 1
											: 0;
									const needsSecondLook =
										pt !== "autoplay" &&
										(isFreshM3u8 ||
											(probation?.type === pt &&
												Date.now() - probation.at < 1500) ||
											priorCleanHolds < requiredCleanHolds);
									if (needsSecondLook) {
										const bridged = await _refreshHeldAutoplayBackupPlaylist(
											info,
											realFetch,
											currentResolution,
										);
										if (bridged) {
											info._BackupProbation = {
												type: pt,
												at:
													isFreshM3u8 || probation?.type !== pt
														? Date.now()
														: probation.at,
												cleanChecks: isFreshM3u8 ? 1 : priorCleanHolds + 1,
											};
											_log(
												`[Trace] Fresh ${pt} session held for a second clean check; continuing clean autoplay bridge`,
												"info",
											);
											backupType = "autoplay";
											backupM3u8 = bridged;
											break;
										}
									}
									info._BackupProbation =
										pt === "autoplay"
											? null
											: { type: pt, at: 0, cleanChecks: requiredCleanHolds };
									_clearBackupPlayerRetryCooldown(info, pt);
									backupType = pt;
									backupM3u8 = m3u8;
									info.LastCleanBackupM3U8 = m3u8;
									info.LastCleanBackupPlayerType = pt;
									info.LastCleanBackupCodecFamily = selectedCodecFamily;
									info.LastCleanBackupAt = Date.now();
									_log(
										`[Trace] Selected: ${pt} @ ${targetRes?.Resolution || targetRes?.Name || "auto"}`,
										"success",
									);
									break;
								}
								if (
									isDoingMinimalRequests &&
									candidateIsPlayable &&
									!candidateHasAds
								) {
									_clearBackupPlayerRetryCooldown(info, pt);
									backupType = pt;
									backupM3u8 = m3u8;
									info.LastCleanBackupM3U8 = m3u8;
									info.LastCleanBackupPlayerType = pt;
									info.LastCleanBackupCodecFamily = selectedCodecFamily;
									info.LastCleanBackupAt = Date.now();
									_log(
										`[Trace] Selected (minimal): ${pt} @ ${targetRes?.Resolution || targetRes?.Name || "auto"}`,
										"success",
									);
									break;
								}
								_markBackupPlayerRetryCooldown(
									info,
									pt,
									promotionPolicy.reason,
								);
								const wasCleanCandidate =
									pt !== "autoplay" &&
									!isFreshM3u8 &&
									(pt === info.ActiveBackupPlayerType ||
										info._BackupProbation?.type === pt);
								if (info._BackupProbation?.type === pt) {
									info._BackupProbation = null;
								}
								if (promotionPolicy.reason === "ad-marked") {
									if (wasCleanCandidate) {
										info._BackupPinFlipCount =
											(Number(info._BackupPinFlipCount) || 0) + 1;
									}
									if (!info.LoggedBackupAdsByType) {
										info.LoggedBackupAdsByType = new Set();
									}
									info.LoggedBackupAdsByType.add(pt);
								}
								_log(
									`[Trace] Rejected ${pt} (${promotionPolicy.reason})`,
									"warning",
								);
								invalidateCache = true;
							}
						} else {
							_log(`Stream failed for ${pt}: ${streamRes.status}`, "warning");
							_markBackupPlayerRetryCooldown(info, pt, "stream-error");
							invalidateCache = true;
						}
					} else {
						_log(`No stream URL for ${pt}`, "warning");
						_markBackupPlayerRetryCooldown(info, pt, "no-stream-url");
						invalidateCache = true;
					}
				} catch (e) {
					_log(`Stream error: ${e.message}`, "warning");
					_markBackupPlayerRetryCooldown(info, pt, "stream-error");
					info._BackupSearchErrorCount =
						(info._BackupSearchErrorCount || 0) + 1;
					invalidateCache = true;
				}
			}

			if (invalidateCache) {
				info.BackupEncodingsM3U8Cache[pt] = null;
			}
			if (isFreshM3u8) break;
		}
	}

	if (backupM3u8) {
		info._BackupSearchCount = (info._BackupSearchCount || 0) + 1;
	} else {
		info._BackupSearchFailCount = (info._BackupSearchFailCount || 0) + 1;
	}

	return { type: backupType, m3u8: backupM3u8 };
}
