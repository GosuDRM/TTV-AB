// TTV AB - Processor

function _resetNativeRecoveryCandidateState(info) {
	if (!info) return;
	info.NativeRecoveryCandidateUrl = null;
	info.NativeRecoveryCandidateMediaKey = null;
	info.NativeRecoveryCandidateCycleStartedAt = 0;
	info.NativeRecoveryCandidateStage = null;
	info.NativeRecoveryCandidateStartedAt = 0;
	info.NativeRecoveryCandidateCleanCount = 0;
	info.NativeRecoveryCandidateLastMediaSequence = null;
}

function _resetStreamAdState(info) {
	const wasUsingModifiedM3U8 = Boolean(info?.IsUsingModifiedM3U8);
	const wasUsingFallbackStream = Boolean(info?.IsUsingFallbackStream);
	const wasUsingBackupStream = Boolean(info?.IsUsingBackupStream);
	const hadStrippedAdSegments =
		Math.max(0, Number(info?.NumStrippedAdSegments) || 0) > 0;
	const endedCodecHandoffId = _getActiveCodecHandoffIdForInfo(info);
	const completedCodecHandoff = Boolean(
		endedCodecHandoffId &&
			info?._CodecHandoffPendingId === endedCodecHandoffId &&
			info?._CodecHandoffAcknowledgedId === endedCodecHandoffId,
	);

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
	info.MaxObservedAdPodPosition = 0;
	info.ObservedZeroAdPodPosition = false;
	info.LastAdPodProgressAt = 0;
	info._IncompletePodCleanStartedAt = 0;
	info._IncompletePodCleanPlaylistCount = 0;
	info._IncompletePodLastMediaSequence = null;
	info._IncompletePodCandidateUrl = null;
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
	info.NativeRecoveryProbeStreamUrl = null;
	info.NativeRecoveryProbeMediaKey = null;
	info.NativeRecoveryProbePlayerType = null;
	info.NativeRecoveryProbeCycleStartedAt = 0;
	info.NativeRecoveryProbeLastMediaSequence = null;
	info.NativeRecoveryProbeLastAdvancedAt = 0;
	info.NativeRecoveryAdPlaylistUrls?.clear?.();
	info.NativeRecoveryAdMediaKey = null;
	info.NativeRecoveryAdStartedAt = 0;
	_resetNativeRecoveryCandidateState(info);
	info.HevcReloadPendingAfterHold = false;
	info.LastAdEndBounceAt = 0;
	info.LoggedBackupAdsByType = null;
	info._LoggedWhitelistByType = null;
	info._BackupSearchStartedAt = 0;
	info._BackupSearchStartToken = null;
	info._LastBackupSearchCompletedAt = 0;
	info._ForegroundQualityProbeAppliedAt = 0;
	info.BackupSearchEpoch = Math.max(0, Number(info.BackupSearchEpoch) || 0) + 1;
	info._BackupSearchPromises?.clear?.();
	info._BackupSearchPromise = null;
	info._BackupSearchKey = null;
	info.BackupPlaylistMetadata?.clear?.();
	info._LoggedOfflineTransition = false;
	info._LqHoldStartAt = 0;
	info._BackupProbation = null;
	info._EmptyAdHoldMediaSequence = 0;
	info._FatalMediaRecoveryRequestId = null;
	_clearCodecHandoffState(info, null, completedCodecHandoff);
	info._SpliceStreamId = null;
	info._SpliceBoundarySeq = null;
	info._SpliceDiscontinuityOffset = 0;
	info._SpliceLastDiscontinuitySequence = null;
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

function _rememberLastAdEnd(
	info,
	endedAt = Date.now(),
	cycleStartedAt = Math.max(0, Number(info?.VisibleAdStartedAt) || 0),
) {
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
	__TTVAB_STATE__.LastAdEndedCycleStartedAt = Math.max(
		0,
		Number(cycleStartedAt) || 0,
	);
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

function _getPendingForegroundQualityProbeAt(info) {
	const visibleSinceAt = Math.max(
		0,
		Number(__TTVAB_STATE__?.PagePlaybackVisibleSinceAt) || 0,
	);
	const cycleStartedAt = Math.max(0, Number(info?.VisibleAdStartedAt) || 0);
	const mediaKey = _normalizeMediaKey(info?.MediaKey);
	if (
		!visibleSinceAt ||
		!cycleStartedAt ||
		visibleSinceAt <= cycleStartedAt ||
		!mediaKey ||
		_normalizeMediaKey(__TTVAB_STATE__?.PageMediaKey) !== mediaKey ||
		_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) !== mediaKey ||
		(!info?.IsShowingAd && !info?.IsHoldingBackupAfterAd) ||
		(info?.ActiveBackupPlayerType !== "autoplay" &&
			info?.LastCleanBackupPlayerType !== "autoplay") ||
		typeof info?.LastCleanBackupM3U8 !== "string" ||
		!info.LastCleanBackupM3U8 ||
		Math.max(0, Number(info.LastCleanBackupAt) || 0) < cycleStartedAt
	) {
		return 0;
	}
	const preferredQualityGroup =
		typeof __TTVAB_STATE__?.PreferredQualityGroup === "string"
			? __TTVAB_STATE__.PreferredQualityGroup.trim().toLowerCase()
			: "";
	const explicitHeight =
		Number(preferredQualityGroup.match(/^(\d+)p/)?.[1]) || 0;
	if (
		explicitHeight > 0 &&
		explicitHeight <= _getBackupBridgeMaxVariantHeight(info)
	) {
		return 0;
	}
	const appliedAt = Math.max(
		0,
		Number(info._ForegroundQualityProbeAppliedAt) || 0,
	);
	const probationType = info?._BackupProbation?.type;
	const probationNeedsCompletion = Boolean(
		probationType &&
			probationType !== "autoplay" &&
			appliedAt === visibleSinceAt,
	);
	return appliedAt < visibleSinceAt || probationNeedsCompletion
		? visibleSinceAt
		: 0;
}

function _startForegroundQualityProbe(
	info,
	realFetch,
	currentResolution = null,
	codecOverride = null,
) {
	const foregroundQualityProbeAt = _getPendingForegroundQualityProbeAt(info);
	if (
		!foregroundQualityProbeAt ||
		info?._BackupSearchPromise ||
		(Number(info?._BackupSearchPromises?.size) || 0) > 0
	) {
		return false;
	}
	_log(
		"[Trace] Playback returned to foreground; probing normal-quality backup while the clean bridge keeps refreshing",
		"info",
	);
	void _findBackupStream(
		info,
		realFetch,
		0,
		currentResolution,
		codecOverride,
	).catch(() => {});
	return true;
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
		const visibleSinceAt = Math.max(
			0,
			Number(__TTVAB_STATE__?.PagePlaybackVisibleSinceAt) || 0,
		);
		if (!visibleSinceAt || now - visibleSinceAt < 10000) {
			return;
		}
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
		info.SustainedNativeResolutionStartedAt = now;
		_log(
			`[Trace] Sustained native quality: ${prevResolution || "none"} -> ${resolution.Resolution}`,
			"info",
		);
	}
}

function _isExactNativeRecoveryCandidateOwned(
	info,
	candidateUrl,
	candidateIsNative,
	requestStartMediaKey,
	requestStartCycleStartedAt,
) {
	const mediaKey = _normalizeMediaKey(info?.MediaKey);
	const cycleStartedAt = Math.max(0, Number(info?.VisibleAdStartedAt) || 0);
	const stage = info?.IsHoldingBackupAfterAd
		? "hold"
		: info?.IsShowingAd
			? "visible"
			: null;
	const exactCandidateUrl = _getExactPlaylistUrlKey(candidateUrl);
	const preAdNativeText =
		typeof info?.LastCleanNativeM3U8 === "string"
			? info.LastCleanNativeM3U8
			: null;
	const preAdNativePlaylistAt = Math.max(
		0,
		Number(info?.LastCleanNativePlaylistAt) || 0,
	);
	const preAdNativeLoaderEpoch = Math.max(
		0,
		Number(info?.LastCleanNativeLoaderEpoch) || 0,
	);
	const currentLoaderEpoch = Math.max(
		0,
		Number(info?.NativeRecoveryLoaderEpoch) || 0,
	);
	const ownsExactPreAdNativeUrl = Boolean(
		exactCandidateUrl &&
			_getExactPlaylistUrlKey(info?.LastCleanNativeUrl) === exactCandidateUrl &&
			preAdNativeText &&
			preAdNativePlaylistAt > 0 &&
			preAdNativePlaylistAt <= cycleStartedAt &&
			cycleStartedAt - preAdNativePlaylistAt <= 60000 &&
			preAdNativeLoaderEpoch === currentLoaderEpoch &&
			_playlistHasMediaSegments(preAdNativeText) &&
			!_hasPlaylistAdMarkers(preAdNativeText) &&
			!_hasExplicitAdMetadata(preAdNativeText) &&
			!_playlistHasKnownAdSegments(preAdNativeText, {
				includeCached: false,
			}),
	);
	const ownsExactAdSessionUrl = Boolean(
		exactCandidateUrl &&
			info?.NativeRecoveryAdPlaylistUrls instanceof Set &&
			info.NativeRecoveryAdPlaylistUrls.has(exactCandidateUrl) &&
			_normalizeMediaKey(info.NativeRecoveryAdMediaKey) === mediaKey &&
			Math.max(0, Number(info.NativeRecoveryAdStartedAt) || 0) ===
				cycleStartedAt,
	);
	const ownsExactNativeUrl = Boolean(
		exactCandidateUrl &&
			((info?.Urls && Object.hasOwn(info.Urls, exactCandidateUrl)) ||
				ownsExactPreAdNativeUrl ||
				ownsExactAdSessionUrl),
	);
	const isLive = info?.MediaType !== "vod" && !mediaKey?.startsWith("vod:");
	return Boolean(
		candidateIsNative === true &&
			isLive &&
			mediaKey &&
			cycleStartedAt > 0 &&
			_normalizeMediaKey(requestStartMediaKey) === mediaKey &&
			Math.max(0, Number(requestStartCycleStartedAt) || 0) === cycleStartedAt &&
			stage &&
			ownsExactNativeUrl,
	);
}

function _advanceExactNativeRecoveryCandidate(
	info,
	candidateText,
	candidateUrl,
	candidateIsNative,
	requestStartMediaKey,
	requestStartCycleStartedAt,
) {
	const mediaKey = _normalizeMediaKey(info?.MediaKey);
	const cycleStartedAt = Math.max(0, Number(info?.VisibleAdStartedAt) || 0);
	const stage = info?.IsHoldingBackupAfterAd
		? "hold"
		: info?.IsShowingAd
			? "visible"
			: null;
	const exactCandidateUrl = _getExactPlaylistUrlKey(candidateUrl);
	const candidateHasAds = Boolean(
		typeof candidateText === "string" &&
			(_hasPlaylistAdMarkers(candidateText) ||
				_hasExplicitAdMetadata(candidateText) ||
				_playlistHasKnownAdSegments(candidateText, {
					includeCached: false,
				})),
	);
	const candidateIdentityIneligible = !_isExactNativeRecoveryCandidateOwned(
		info,
		candidateUrl,
		candidateIsNative,
		requestStartMediaKey,
		requestStartCycleStartedAt,
	);
	if (candidateIdentityIneligible) {
		_resetNativeRecoveryCandidateState(info);
		return "ineligible";
	}
	if (
		typeof candidateText !== "string" ||
		!_playlistHasMediaSegments(candidateText) ||
		candidateHasAds
	) {
		_resetNativeRecoveryCandidateState(info);
		return "pending";
	}

	const sameCandidate = Boolean(
		info.NativeRecoveryCandidateUrl === exactCandidateUrl &&
			info.NativeRecoveryCandidateMediaKey === mediaKey &&
			Math.max(0, Number(info.NativeRecoveryCandidateCycleStartedAt) || 0) ===
				cycleStartedAt &&
			info.NativeRecoveryCandidateStage === stage,
	);
	if (!sameCandidate) {
		_resetNativeRecoveryCandidateState(info);
		info.NativeRecoveryCandidateUrl = exactCandidateUrl;
		info.NativeRecoveryCandidateMediaKey = mediaKey;
		info.NativeRecoveryCandidateCycleStartedAt = cycleStartedAt;
		info.NativeRecoveryCandidateStage = stage;
		info.NativeRecoveryCandidateStartedAt = Date.now();
	}

	const mediaSequence = _parsePlaylistFirstMediaSequence(candidateText);
	if (mediaSequence == null) {
		_resetNativeRecoveryCandidateState(info);
		return "pending";
	}
	const previousMediaSequence =
		info.NativeRecoveryCandidateLastMediaSequence != null &&
		Number.isFinite(Number(info.NativeRecoveryCandidateLastMediaSequence))
			? Number(info.NativeRecoveryCandidateLastMediaSequence)
			: null;
	if (previousMediaSequence == null) {
		info.NativeRecoveryCandidateLastMediaSequence = mediaSequence;
		return "pending";
	}
	if (mediaSequence < previousMediaSequence) {
		_resetNativeRecoveryCandidateState(info);
		info.NativeRecoveryCandidateUrl = exactCandidateUrl;
		info.NativeRecoveryCandidateMediaKey = mediaKey;
		info.NativeRecoveryCandidateCycleStartedAt = cycleStartedAt;
		info.NativeRecoveryCandidateStage = stage;
		info.NativeRecoveryCandidateStartedAt = Date.now();
		info.NativeRecoveryCandidateLastMediaSequence = mediaSequence;
		return "pending";
	}
	if (mediaSequence === previousMediaSequence) return "pending";

	info.NativeRecoveryCandidateLastMediaSequence = mediaSequence;
	info.NativeRecoveryCandidateCleanCount =
		Math.max(
			0,
			Math.trunc(Number(info.NativeRecoveryCandidateCleanCount) || 0),
		) + 1;
	const maximumEscalation = 4;
	const requiredCleanPlaylists =
		_getResolvedAdEndMinCleanPlaylists() + maximumEscalation;
	const requiredCleanMs = _getResolvedAdEndGraceMs() + maximumEscalation * 2500;
	return info.NativeRecoveryCandidateCleanCount >= requiredCleanPlaylists &&
		Date.now() -
			Math.max(
				0,
				Number(info.NativeRecoveryCandidateStartedAt) || Date.now(),
			) >=
			requiredCleanMs
		? "ready"
		: "pending";
}

async function _isAdEndStable(
	info,
	realFetch,
	resolution = null,
	requestAdContext = null,
	requestSignal = null,
	candidateText = null,
	candidateUrl = null,
	candidateIsNative = false,
) {
	if (requestAdContext && typeof requestAdContext === "object") {
		requestAdContext.exactNativeRecoveryReady = false;
		requestAdContext.exactNativeRecoveryOwned = false;
	}
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

	const expectedPodLength = Math.max(
		0,
		Math.trunc(Number(info.ExpectedAdPodLength) || 0),
	);
	const observedPodAds =
		info.ObservedAdPodIds instanceof Set ? info.ObservedAdPodIds.size : 0;
	const maxObservedPodPosition = Math.max(
		0,
		Math.trunc(Number(info.MaxObservedAdPodPosition) || 0),
	);
	const observedTerminalPodPosition = Boolean(
		expectedPodLength > 0 &&
			(info.ObservedZeroAdPodPosition === true
				? maxObservedPodPosition + 1 >= expectedPodLength
				: maxObservedPodPosition >= expectedPodLength),
	);
	const declaredPodIncomplete =
		expectedPodLength > 0 &&
		observedPodAds < expectedPodLength &&
		!observedTerminalPodPosition;
	const declaredPodComplete = expectedPodLength > 0 && !declaredPodIncomplete;
	const exactNativeRecoveryOwned = _isExactNativeRecoveryCandidateOwned(
		info,
		candidateUrl,
		candidateIsNative,
		requestAdContext?.requestStartMediaKey,
		requestAdContext?.requestStartCycleStartedAt,
	);
	if (requestAdContext && typeof requestAdContext === "object") {
		requestAdContext.exactNativeRecoveryOwned = exactNativeRecoveryOwned;
	}
	const canUseExactNativeCandidate = Boolean(
		declaredPodComplete &&
			!info.IsUsingModifiedM3U8 &&
			!info._CodecHandoffPendingId &&
			info.LastCleanBackupM3U8 &&
			(info.LastCleanBackupPlayerType || info.ActiveBackupPlayerType),
	);
	let exactNativeCandidateState = null;
	if (canUseExactNativeCandidate) {
		exactNativeCandidateState = _advanceExactNativeRecoveryCandidate(
			info,
			candidateText,
			candidateUrl,
			candidateIsNative,
			requestAdContext?.requestStartMediaKey,
			requestAdContext?.requestStartCycleStartedAt,
		);
		if (exactNativeCandidateState === "ready") {
			if (requestAdContext && typeof requestAdContext === "object") {
				requestAdContext.exactNativeRecoveryReady = true;
			}
			return info.IsHoldingBackupAfterAd ? "ended" : "ended-with-backup-hold";
		}
		if (exactNativeCandidateState === "pending") return "wait";
	}
	_resetNativeRecoveryCandidateState(info);
	const candidateIsLive =
		info?.MediaType !== "vod" &&
		!_normalizeMediaKey(info?.MediaKey)?.startsWith("vod:");
	const candidateHasRequestIdentity = Boolean(
		candidateIsNative === true ||
			(typeof candidateUrl === "string" && candidateUrl),
	);
	if (
		candidateIsLive &&
		candidateHasRequestIdentity &&
		!exactNativeRecoveryOwned
	) {
		return "wait";
	}

	if (!fastPathReady && !slowPathReady) {
		return "wait";
	}

	let incompletePodRecoveryReady = false;
	if (declaredPodIncomplete) {
		const terminalEscapeMs = Math.max(
			90000,
			_getResolvedAdEndBackupHoldMaxMs(),
		);
		const lastAdPodProgressAt = Math.max(
			0,
			Number(info.LastAdPodProgressAt) || 0,
			Number(info.VisibleAdStartedAt) || 0,
		);
		const exactCandidateUrl = _getExactPlaylistUrlKey(candidateUrl);
		const sameCandidateUrl = Boolean(
			exactCandidateUrl &&
				info._IncompletePodCandidateUrl === exactCandidateUrl,
		);
		if (!sameCandidateUrl) {
			info._IncompletePodCleanStartedAt = now;
			info._IncompletePodCleanPlaylistCount = 0;
			info._IncompletePodLastMediaSequence = null;
			info._IncompletePodCandidateUrl = exactCandidateUrl || null;
		}
		const isVod =
			info.MediaType === "vod" ||
			_normalizeMediaKey(info.MediaKey)?.startsWith("vod:");
		let cleanCandidateAdvanced = false;
		if (
			typeof candidateText === "string" &&
			exactCandidateUrl &&
			isVod &&
			candidateText.includes("#EXT-X-ENDLIST")
		) {
			cleanCandidateAdvanced = true;
		} else if (
			typeof candidateText === "string" &&
			exactCandidateUrl &&
			!isVod
		) {
			const mediaSequence = _parsePlaylistFirstMediaSequence(candidateText);
			const previousMediaSequence =
				typeof info._IncompletePodLastMediaSequence === "number" &&
				Number.isFinite(info._IncompletePodLastMediaSequence)
					? info._IncompletePodLastMediaSequence
					: null;
			if (
				previousMediaSequence !== null &&
				mediaSequence !== null &&
				mediaSequence > previousMediaSequence
			) {
				cleanCandidateAdvanced = true;
			} else if (
				previousMediaSequence !== null &&
				mediaSequence !== null &&
				mediaSequence < previousMediaSequence
			) {
				info._IncompletePodCleanStartedAt = now;
				info._IncompletePodCleanPlaylistCount = 0;
			}
			info._IncompletePodLastMediaSequence = mediaSequence;
		}
		if (cleanCandidateAdvanced) {
			if (!info._IncompletePodCleanStartedAt) {
				info._IncompletePodCleanStartedAt = now;
			}
			info._IncompletePodCleanPlaylistCount =
				Math.max(0, Number(info._IncompletePodCleanPlaylistCount) || 0) + 1;
		}
		const incompletePodEscalation = 4;
		const incompletePodMinCleanPlaylists =
			_getResolvedAdEndMinCleanPlaylists() + incompletePodEscalation;
		const incompletePodGraceMs =
			_getResolvedAdEndGraceMs() + incompletePodEscalation * 2500;
		incompletePodRecoveryReady = Boolean(
			lastAdPodProgressAt > 0 &&
				now - lastAdPodProgressAt >= terminalEscapeMs &&
				cleanCandidateAdvanced &&
				Math.max(0, Number(info._IncompletePodCleanPlaylistCount) || 0) >=
					incompletePodMinCleanPlaylists &&
				now - Math.max(0, Number(info._IncompletePodCleanStartedAt) || now) >=
					incompletePodGraceMs,
		);
	}
	let hasNativeRecoveryReady = false;
	if (declaredPodIncomplete && !incompletePodRecoveryReady) {
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
		hasNativeRecoveryReady = await _awaitM3U8RequestContext(
			_canReloadNativePlayerAfterAd(
				info,
				realFetch,
				resolution,
				declaredPodIncomplete,
			),
			info,
			requestAdContext,
			requestSignal,
		);
	}
	if (!info.IsShowingAd && !info.IsHoldingBackupAfterAd) {
		return "wait";
	}
	if (hasNativeRecoveryReady) {
		return "ended";
	}
	if (info.IsHoldingBackupAfterAd) {
		return "wait";
	}
	if (declaredPodIncomplete) {
		const incompletePodFailedProbeCapHit =
			Math.max(0, Number(info.ConsecutiveFailedNativeProbes) || 0) >=
			Math.max(1, Number(__TTVAB_STATE__?.AdEndMaxFailedNativeProbes) || 6);
		const incompletePodVisibleAdStartedAt = Math.max(
			0,
			Number(info.VisibleAdStartedAt) || Number(info.PendingAdEndAt) || 0,
		);
		const incompletePodVisibleAdElapsed =
			incompletePodVisibleAdStartedAt > 0
				? now - incompletePodVisibleAdStartedAt
				: elapsed;
		if (
			slowPathReady &&
			info.LastCleanBackupM3U8 &&
			((_getResolvedAdEndBackupHoldMaxMs() > 0 &&
				incompletePodVisibleAdElapsed >= _getResolvedAdEndBackupHoldMaxMs()) ||
				incompletePodFailedProbeCapHit)
		) {
			_log(
				"[Trace] Declared ad pod remains incomplete; ending visible ad cycle and keeping clean backup stream",
				"warning",
			);
			return "ended-with-backup-hold";
		}
		return "wait";
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

function _resetNativeRecoveryReadyState(
	info,
	preserveProbeAt = false,
	preserveProbeSession = false,
) {
	if (!info) return;
	info.NativeRecoveryProbeEpoch =
		(Number(info.NativeRecoveryProbeEpoch) || 0) + 1;
	info._NativeRecoveryProbeInFlight = false;
	info._NativeRecoveryProbeToken = null;
	if (!preserveProbeAt) {
		info.LastNativeRecoveryProbeAt = 0;
	}
	info.LastNativeRecoveryReadyPlayerType = null;
	info.NativeRecoveryCleanCount = 0;
	if (!preserveProbeSession) {
		info.NativeRecoveryProbeStreamUrl = null;
		info.NativeRecoveryProbeMediaKey = null;
		info.NativeRecoveryProbePlayerType = null;
		info.NativeRecoveryProbeCycleStartedAt = 0;
		info.NativeRecoveryProbeLastMediaSequence = null;
		info.NativeRecoveryProbeLastAdvancedAt = 0;
	}
}

function _invalidateNativeRecoveryAfterPlayerReload(
	info,
	advanceLoaderEpoch = false,
) {
	if (!info) return 0;
	if (advanceLoaderEpoch) {
		info.NativeRecoveryLoaderEpoch =
			Math.max(0, Number(info.NativeRecoveryLoaderEpoch) || 0) + 1;
	}
	_resetNativeRecoveryReadyState(info);
	_resetNativeRecoveryCandidateState(info);
	info.NativeRecoveryAdPlaylistUrls?.clear?.();
	info.NativeRecoveryAdMediaKey = null;
	info.NativeRecoveryAdStartedAt = 0;
	info.PendingAdEndAt = 0;
	info.CleanPlaylistCount = 0;
	info.AdEndMarkerBounceLogged = false;
	info.LastNativeRecoveryHoldLogAt = 0;
	info._IncompletePodCleanStartedAt = 0;
	info._IncompletePodCleanPlaylistCount = 0;
	info._IncompletePodLastMediaSequence = null;
	info._IncompletePodCandidateUrl = null;
	info.ConsecutiveFailedNativeProbes = 0;
	return Math.max(0, Number(info.NativeRecoveryLoaderEpoch) || 0);
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
	if (
		backupAgeMs >= 0 &&
		backupAgeMs < 900 &&
		Number(info.LastCleanBackupAt) >=
			Math.max(0, Number(info.VisibleAdStartedAt) || 0)
	) {
		info.IsUsingBackupStream = true;
		return info.LastCleanBackupM3U8;
	}
	const backupSearchEpoch = Math.max(0, Number(info.BackupSearchEpoch) || 0);
	const cycleStartedAt = Math.max(0, Number(info.VisibleAdStartedAt) || 0);
	const refreshed = await _refreshActiveBackupMediaPlaylist(info, realFetch);
	if (
		refreshed &&
		_isBackupSearchContextCurrent(info, backupSearchEpoch, cycleStartedAt)
	) {
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
	let parsedUrl = null;
	try {
		parsedUrl = new URL(url);
	} catch {
		return null;
	}
	const hostname = parsedUrl.hostname.toLowerCase();
	const isTwitchMediaHost = ["twitch.tv", "ttvnw.net", "twitchcdn.net"].some(
		(domain) => hostname === domain || hostname.endsWith(`.${domain}`),
	);
	if (
		!isTwitchMediaHost ||
		!parsedUrl.pathname.toLowerCase().endsWith(".m3u8")
	) {
		return null;
	}
	const currentAdMediaKey = _normalizeMediaKey(
		__TTVAB_STATE__?.CurrentAdMediaKey,
	);
	const pageMediaKey = _normalizeMediaKey(__TTVAB_STATE__?.PageMediaKey);
	const cycleStartedAt = Math.max(
		0,
		Number(
			currentAdMediaKey
				? __TTVAB_STATE__?.AdPodProgressByMediaKey?.[currentAdMediaKey]
						?.cycleStartedAt
				: 0,
		) || 0,
	);
	if (
		!currentAdMediaKey ||
		currentAdMediaKey !== pageMediaKey ||
		cycleStartedAt <= 0
	) {
		return null;
	}
	return {
		MediaType: __TTVAB_STATE__?.PageMediaType,
		ChannelName:
			__TTVAB_STATE__?.CurrentAdChannel || __TTVAB_STATE__?.PageChannel,
		VodID: __TTVAB_STATE__?.PageVodID,
		MediaKey: currentAdMediaKey,
	};
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

function _insertBoundaryDiscontinuity(
	text,
	boundarySeq,
	firstSeq,
	discontinuityOffset = 0,
) {
	if (typeof text !== "string" || boundarySeq == null || firstSeq == null) {
		return text;
	}
	const pos = boundarySeq - firstSeq;
	const lines = text.split("\n");
	const offset = Number.isFinite(Number(discontinuityOffset))
		? Math.trunc(Number(discontinuityOffset))
		: 0;
	if (offset !== 0) {
		_setPlaylistDiscontinuitySequence(
			lines,
			Math.max(0, _parsePlaylistDiscontinuitySequence(text) + offset),
		);
	}

	if (pos < 0) {
		_setPlaylistDiscontinuitySequence(
			lines,
			Math.max(0, _parsePlaylistDiscontinuitySequence(text) + offset + 1),
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
	if (insertAt < 0) return lines.join("\n");
	if (insertAt > 0 && lines[insertAt - 1].trim() === "#EXT-X-DISCONTINUITY") {
		return lines.join("\n");
	}
	lines.splice(insertAt, 0, "#EXT-X-DISCONTINUITY");
	return lines.join("\n");
}

function _applyBackupSpliceBridge(info, text) {
	if (!info || typeof text !== "string" || !text) return text;
	if (!info.IsUsingBackupStream) {
		info._SpliceStreamId = null;
		info._SpliceBoundarySeq = null;
		info._SpliceDiscontinuityOffset = 0;
		info._SpliceLastDiscontinuitySequence = null;
		return text;
	}
	if (!_playlistHasMediaSegments(text)) return text;

	const backupCodec =
		_getVideoCodecIdentity(info.LastCleanBackupCodec) ||
		_getVideoCodecFamily(info.LastCleanBackupCodecFamily) ||
		"?";
	const identity = `${info.ActiveBackupPlayerType || "?"}|${info.ActiveBackupResolution || "?"}|${backupCodec}`;
	const firstSeq = _parsePlaylistFirstMediaSequence(text);
	if (firstSeq == null) return text;

	const getDiscontinuityRange = (playlist) => {
		let current = _parsePlaylistDiscontinuitySequence(playlist);
		let first = null;
		let last = null;
		for (const line of playlist.split("\n")) {
			const trimmed = line.trim();
			if (trimmed === "#EXT-X-DISCONTINUITY") {
				current += 1;
			} else if (
				trimmed.startsWith("#EXTINF") ||
				trimmed.startsWith("#EXT-X-PART:")
			) {
				if (first == null) first = current;
				last = current;
			}
		}
		return { first, last };
	};

	if (info._SpliceStreamId !== identity) {
		const hadPreviousIdentity = Boolean(info._SpliceStreamId);
		const previousLast = Number(info._SpliceLastDiscontinuitySequence);
		info._SpliceStreamId = identity;
		info._SpliceBoundarySeq = firstSeq;
		info._SpliceDiscontinuityOffset = 0;
		if (hadPreviousIdentity && Number.isFinite(previousLast)) {
			const candidate = _insertBoundaryDiscontinuity(text, firstSeq, firstSeq);
			const candidateFirst = getDiscontinuityRange(candidate).first;
			if (Number.isFinite(candidateFirst)) {
				info._SpliceDiscontinuityOffset = previousLast + 1 - candidateFirst;
			}
		}
	}

	const output = _insertBoundaryDiscontinuity(
		text,
		info._SpliceBoundarySeq,
		firstSeq,
		info._SpliceDiscontinuityOffset,
	);
	const outputLast = getDiscontinuityRange(output).last;
	if (Number.isFinite(outputLast)) {
		info._SpliceLastDiscontinuitySequence = outputLast;
	}
	return output;
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

async function _awaitBackupProbeBeforeDeadline<T>(
	promise: PromiseLike<T> | T,
	deadlineAt = 0,
): Promise<{ completed: true; value: T } | { completed: false; value: null }> {
	const deadline = Math.max(0, Number(deadlineAt) || 0);
	if (deadline <= 0) {
		return { completed: true, value: await promise };
	}
	const remainingMs = deadline - Date.now();
	if (remainingMs <= 0) {
		Promise.resolve(promise).catch(() => {});
		return { completed: false, value: null };
	}
	let timeoutId = null;
	try {
		return await Promise.race([
			Promise.resolve(promise).then((value): { completed: true; value: T } => ({
				completed: true,
				value,
			})),
			new Promise<{ completed: false; value: null }>((resolve) => {
				timeoutId = setTimeout(
					() => resolve({ completed: false, value: null }),
					remainingMs,
				);
			}),
		]);
	} finally {
		if (timeoutId !== null) clearTimeout(timeoutId);
	}
}

function _waitForAbortableDelay(delayMs, requestSignal = null) {
	const safeDelayMs = Math.max(0, Number(delayMs) || 0);
	if (requestSignal?.aborted) {
		return Promise.reject(_createCodecHandoffAbortError(requestSignal));
	}
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (callback, value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutId);
			requestSignal?.removeEventListener?.("abort", onAbort);
			callback(value);
		};
		const onAbort = () =>
			finish(reject, _createCodecHandoffAbortError(requestSignal));
		const timeoutId = setTimeout(() => finish(resolve, undefined), safeDelayMs);
		requestSignal?.addEventListener?.("abort", onAbort, { once: true });
	});
}

function _awaitWithRequestSignal(promise, requestSignal = null) {
	if (!requestSignal) return Promise.resolve(promise);
	if (requestSignal.aborted) {
		return Promise.reject(_createCodecHandoffAbortError(requestSignal));
	}
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (callback, value) => {
			if (settled) return;
			settled = true;
			requestSignal.removeEventListener?.("abort", onAbort);
			callback(value);
		};
		const onAbort = () =>
			finish(reject, _createCodecHandoffAbortError(requestSignal));
		requestSignal.addEventListener?.("abort", onAbort, { once: true });
		Promise.resolve(promise).then(
			(value) => finish(resolve, value),
			(error) => finish(reject, error),
		);
	});
}

function _isBackupSearchContextCurrent(
	info,
	backupSearchEpoch,
	cycleStartedAt,
) {
	if (!info) return false;
	if (
		Math.max(0, Number(info.BackupSearchEpoch) || 0) !==
		Math.max(0, Number(backupSearchEpoch) || 0)
	) {
		return false;
	}
	const expectedCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	if (expectedCycleStartedAt <= 0) return true;
	return Boolean(
		Math.max(0, Number(info.VisibleAdStartedAt) || 0) ===
			expectedCycleStartedAt &&
			_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) ===
				_normalizeMediaKey(info.MediaKey) &&
			(info.IsShowingAd === true || info.IsHoldingBackupAfterAd === true),
	);
}

async function _canReloadNativePlayerAfterAd(
	info,
	realFetch,
	resolution = null,
	requireProbe = false,
) {
	if (
		!requireProbe &&
		!info?.IsHoldingBackupAfterAd &&
		!info?.IsUsingBackupStream &&
		!info?.IsUsingFallbackStream
	) {
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
	const probeMediaKey = _normalizeMediaKey(info.MediaKey);
	const probeCycleStartedAt = Math.max(0, Number(info.VisibleAdStartedAt) || 0);
	const probeIsLive =
		info?.MediaType !== "vod" && !probeMediaKey?.startsWith("vod:");
	const cachedProbeStreamUrl =
		typeof info.NativeRecoveryProbeStreamUrl === "string" &&
		info.NativeRecoveryProbeStreamUrl
			? info.NativeRecoveryProbeStreamUrl
			: null;
	const cachedProbeSessionMatches = Boolean(
		probeIsLive &&
			cachedProbeStreamUrl &&
			info.NativeRecoveryProbeMediaKey === probeMediaKey &&
			info.NativeRecoveryProbePlayerType === nativePlayerType &&
			Math.max(0, Number(info.NativeRecoveryProbeCycleStartedAt) || 0) ===
				probeCycleStartedAt,
	);
	if (
		!cachedProbeSessionMatches &&
		(cachedProbeStreamUrl ||
			info.NativeRecoveryProbeMediaKey ||
			info.NativeRecoveryProbePlayerType ||
			Math.max(0, Number(info.NativeRecoveryProbeCycleStartedAt) || 0) > 0 ||
			info.NativeRecoveryProbeLastMediaSequence != null ||
			Math.max(0, Number(info.NativeRecoveryProbeLastAdvancedAt) || 0) > 0)
	) {
		_resetNativeRecoveryReadyState(info, true);
	}
	let probeStreamUrl = cachedProbeSessionMatches ? cachedProbeStreamUrl : null;
	const probeEpoch = Number(info.NativeRecoveryProbeEpoch) || 0;
	const probeToken = {};
	const probeInvalidated = () =>
		info._NativeRecoveryProbeToken !== probeToken ||
		(Number(info.NativeRecoveryProbeEpoch) || 0) !== probeEpoch ||
		!probeMediaKey ||
		_normalizeMediaKey(info.MediaKey) !== probeMediaKey ||
		probeCycleStartedAt <= 0 ||
		!_isCodecHandoffCycleCurrent(probeMediaKey, probeCycleStartedAt, info);
	info._NativeRecoveryProbeInFlight = true;
	info._NativeRecoveryProbeToken = probeToken;

	try {
		if (!probeStreamUrl) {
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
			if (probeInvalidated()) {
				return false;
			}
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
			if (probeInvalidated()) {
				return false;
			}
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
			probeStreamUrl = String(streamUrl);
			if (probeIsLive) {
				info.NativeRecoveryProbeStreamUrl = probeStreamUrl;
				info.NativeRecoveryProbeMediaKey = probeMediaKey;
				info.NativeRecoveryProbePlayerType = nativePlayerType;
				info.NativeRecoveryProbeCycleStartedAt = probeCycleStartedAt;
				info.NativeRecoveryProbeLastMediaSequence = null;
				info.NativeRecoveryProbeLastAdvancedAt = 0;
			}
		}

		const streamRes = await _fetchWithTimeout(realFetch, probeStreamUrl);
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
		if (!_playlistHasMediaSegments(nativeM3u8)) {
			_resetNativeRecoveryReadyState(info, true);
			_markNativeRecoveryProbeFailed(info);
			_log(
				`[Trace] Native recovery probe has no playable media for ${nativePlayerType}`,
				"warning",
			);
			return false;
		}
		const nativeHasAds =
			_hasPlaylistAdMarkers(nativeM3u8) ||
			_hasExplicitAdMetadata(nativeM3u8) ||
			_playlistHasKnownAdSegments(nativeM3u8, {
				includeCached: false,
			});
		const observedAt = Date.now();
		let liveSequenceAdvanced = !probeIsLive;
		if (probeIsLive) {
			const mediaSequence = _parsePlaylistFirstMediaSequence(nativeM3u8);
			const lastMediaSequence =
				info.NativeRecoveryProbeLastMediaSequence != null &&
				Number.isFinite(Number(info.NativeRecoveryProbeLastMediaSequence))
					? Number(info.NativeRecoveryProbeLastMediaSequence)
					: null;
			if (mediaSequence == null) {
				_resetNativeRecoveryReadyState(info, true);
				_markNativeRecoveryProbeFailed(info);
				_log(
					`[Trace] Native recovery probe missing live media sequence for ${nativePlayerType}`,
					"warning",
				);
				return false;
			}
			if (lastMediaSequence != null && mediaSequence < lastMediaSequence) {
				_resetNativeRecoveryReadyState(info, true);
				_markNativeRecoveryProbeFailed(info);
				_log(
					`[Trace] Native recovery probe sequence regressed for ${nativePlayerType}`,
					"warning",
				);
				return false;
			}
			if (lastMediaSequence == null || mediaSequence > lastMediaSequence) {
				info.NativeRecoveryProbeLastMediaSequence = mediaSequence;
				info.NativeRecoveryProbeLastAdvancedAt = observedAt;
				liveSequenceAdvanced = lastMediaSequence != null;
			} else {
				const lastAdvancedAt = Math.max(
					0,
					Number(info.NativeRecoveryProbeLastAdvancedAt) || 0,
				);
				if (lastAdvancedAt <= 0 || observedAt - lastAdvancedAt >= 15000) {
					_resetNativeRecoveryReadyState(info, true);
					_markNativeRecoveryProbeFailed(info);
					_log(
						`[Trace] Native recovery probe stopped advancing for ${nativePlayerType}`,
						"warning",
					);
					return false;
				}
			}
		}
		if (nativeHasAds) {
			_resetNativeRecoveryReadyState(info, true, probeIsLive);
			_markNativeRecoveryProbeFailed(info);
			_log(
				`[Trace] Native recovery still ad-marked (${nativePlayerType})`,
				"warning",
			);
			return false;
		}
		if (!liveSequenceAdvanced) {
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
		if (info._NativeRecoveryProbeToken === probeToken) {
			info._NativeRecoveryProbeInFlight = false;
			info._NativeRecoveryProbeToken = null;
		}
	}
}

function _createStreamInfo(context) {
	const normalizedContext = _normalizePlaybackContext(context);
	const ownsCurrentAdMediaKey = Boolean(
		normalizedContext.MediaKey &&
			_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) ===
				normalizedContext.MediaKey,
	);
	const podProgress =
		(ownsCurrentAdMediaKey &&
			normalizedContext.MediaKey &&
			__TTVAB_STATE__?.AdPodProgressByMediaKey?.[normalizedContext.MediaKey]) ||
		null;
	const visibleAdStartedAt = Math.max(
		0,
		Number(podProgress?.cycleStartedAt) || 0,
	);
	const ownsCurrentAdCycle = Boolean(
		ownsCurrentAdMediaKey && visibleAdStartedAt > 0,
	);
	return {
		MediaType: normalizedContext.MediaType,
		MediaKey: normalizedContext.MediaKey,
		ChannelName: normalizedContext.ChannelName,
		VodID: normalizedContext.VodID,
		IsShowingAd: ownsCurrentAdCycle,
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
		MaxObservedAdPodPosition: Math.max(
			0,
			Number(podProgress?.maxAdPodPosition) || 0,
		),
		ObservedZeroAdPodPosition: podProgress?.observedZeroAdPodPosition === true,
		LastAdPodProgressAt: Math.max(
			0,
			Number(podProgress?.updatedAt) || 0,
			visibleAdStartedAt,
		),
		_IncompletePodCleanStartedAt: 0,
		_IncompletePodCleanPlaylistCount: 0,
		_IncompletePodLastMediaSequence: null,
		_IncompletePodCandidateUrl: null,
		MeasuredAdIds: new Set(),
		FailedBackupPlayerTypes: new Map(),
		LastSessionNeutralBackupProbeCycleStartedAt: 0,
		Urls: Object.create(null),
		ResolutionList: [],
		BackupEncodingsM3U8Cache: Object.create(null),
		EnhancedVariantUrls: new Set(),
		EnhancedDecoderCodecFamily: null,
		EnhancedDecoderCodec: null,
		ActiveBackupPlayerType: null,
		ActiveBackupResolution: null,
		SustainedNativeResolution: null,
		SustainedNativeResolutionAt: 0,
		SustainedNativeResolutionStartedAt: 0,
		LastCleanNativeM3U8: null,
		LastCleanNativeUrl: null,
		LastCleanNativeCodec: null,
		LastCleanNativePlaylistAt: 0,
		LastCleanNativeLoaderEpoch: 0,
		LastCleanBackupM3U8: null,
		LastCleanBackupPlayerType: null,
		LastCleanBackupResolution: null,
		LastCleanBackupCodecFamily: null,
		LastCleanBackupCodec: null,
		BackupPlaylistMetadata: new Map(),
		LastCleanBackupAt: 0,
		IsMidroll: false,
		CsaiOnlyThisBreak: false,
		IsStrippingAdSegments: false,
		NumStrippedAdSegments: 0,
		PendingAdEndAt: 0,
		CleanPlaylistCount: 0,
		AdEndMarkerBounceLogged: false,
		AdEndConfirmEscalation: ownsCurrentAdCycle ? 4 : 0,
		VisibleAdStartedAt: visibleAdStartedAt,
		IsHoldingBackupAfterAd: false,
		SilentBackupHoldStartedAt: 0,
		LastSilentBackupHoldLogAt: 0,
		LastNativeRecoveryProbeAt: 0,
		BackupVariantUrls: new Set(),
		EnhancedBackupVariantUrls: new Set(),
		BackupVariantPlayerTypes: new Map(),
		LastNativeRecoveryReadyPlayerType: null,
		NativeRecoveryCleanCount: 0,
		NativeRecoveryProbeEpoch: 0,
		_NativeRecoveryProbeInFlight: false,
		_NativeRecoveryProbeToken: null,
		NativeRecoveryProbeStreamUrl: null,
		NativeRecoveryProbeMediaKey: null,
		NativeRecoveryProbePlayerType: null,
		NativeRecoveryProbeCycleStartedAt: 0,
		NativeRecoveryProbeLastMediaSequence: null,
		NativeRecoveryProbeLastAdvancedAt: 0,
		NativeRecoveryAdPlaylistUrls: new Set(),
		NativeRecoveryAdMediaKey: null,
		NativeRecoveryAdStartedAt: 0,
		NativeRecoveryLoaderEpoch: 0,
		NativeRecoveryCandidateUrl: null,
		NativeRecoveryCandidateMediaKey: null,
		NativeRecoveryCandidateCycleStartedAt: 0,
		NativeRecoveryCandidateStage: null,
		NativeRecoveryCandidateStartedAt: 0,
		NativeRecoveryCandidateCleanCount: 0,
		NativeRecoveryCandidateLastMediaSequence: null,
		_BackupSearchPromise: null,
		_BackupSearchKey: null,
		_BackupSearchPromises: new Map(),
		BackupSearchEpoch: 0,
		_ForegroundQualityProbeAppliedAt: 0,
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
		_SpliceDiscontinuityOffset: 0,
		_SpliceLastDiscontinuitySequence: null,
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

function _clearCodecHandoffState(
	info,
	handoffId = null,
	clearDecoderOwnership = true,
) {
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
	if (
		clearDecoderOwnership === true &&
		(!exactHandoffId || completedExactHandoff)
	) {
		info.EnhancedDecoderCodecFamily = null;
		info.EnhancedDecoderCodec = null;
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
	const visibleCycleStartedAt = Math.max(
		0,
		Number(info?.VisibleAdStartedAt) || 0,
	);
	if (
		typeof info?._CodecHandoffPendingId === "string" &&
		info._CodecHandoffPendingId &&
		_getCodecHandoffCycleStartedAt(info._CodecHandoffPendingId) ===
			visibleCycleStartedAt &&
		_isCodecHandoffCycleCurrent(info?.MediaKey, visibleCycleStartedAt, info)
	) {
		return info._CodecHandoffPendingId;
	}
	if (
		typeof __TTVAB_STATE__?.ActiveCodecHandoffId === "string" &&
		__TTVAB_STATE__.ActiveCodecHandoffId &&
		_normalizeMediaKey(__TTVAB_STATE__.ActiveCodecHandoffMediaKey) ===
			_normalizeMediaKey(info?.MediaKey) &&
		_getCodecHandoffCycleStartedAt(__TTVAB_STATE__.ActiveCodecHandoffId) ===
			visibleCycleStartedAt &&
		_isCodecHandoffCycleCurrent(info?.MediaKey, visibleCycleStartedAt, info)
	) {
		return __TTVAB_STATE__.ActiveCodecHandoffId;
	}
	return null;
}

function _createCodecHandoffId(info) {
	const cycleStartedAt = Math.max(0, Number(info?.VisibleAdStartedAt) || 0);
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
	return `${info.MediaKey || info.ChannelName || "stream"}:${cycleStartedAt}:${Date.now()}:${info._CodecHandoffSequence}:${nonce}`;
}

function _getCodecHandoffCycleStartedAt(handoffId) {
	if (typeof handoffId !== "string" || !handoffId) return 0;
	const parts = handoffId.split(":");
	if (parts.length < 5) return 0;
	return Math.max(0, Number(parts[parts.length - 4]) || 0);
}

function _getCurrentAdBreakStartedAt(mediaKey, info = null) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey || info?.MediaKey);
	if (!normalizedMediaKey) return 0;
	const infoCycleStartedAt = Math.max(0, Number(info?.VisibleAdStartedAt) || 0);
	const entryCycleStartedAt = Math.max(
		0,
		Number(
			__TTVAB_STATE__?.AdPodProgressByMediaKey?.[normalizedMediaKey]
				?.cycleStartedAt,
		) || 0,
	);
	const streamInfo =
		__TTVAB_STATE__?.StreamInfos?.[normalizedMediaKey] || info || null;
	return Math.max(
		infoCycleStartedAt,
		entryCycleStartedAt,
		Math.max(0, Number(streamInfo?.VisibleAdStartedAt) || 0),
	);
}

function _isCodecHandoffCycleCurrent(mediaKey, cycleStartedAt, info = null) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey || info?.MediaKey);
	const currentAdMediaKey = _normalizeMediaKey(
		__TTVAB_STATE__?.CurrentAdMediaKey,
	);
	const expectedCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	return Boolean(
		normalizedMediaKey &&
			currentAdMediaKey === normalizedMediaKey &&
			expectedCycleStartedAt > 0 &&
			_getCurrentAdBreakStartedAt(normalizedMediaKey, info) ===
				expectedCycleStartedAt,
	);
}

function _isCodecHandoffAdRecoveryActive(
	info,
	requestWasAdMarked = false,
	expectedCycleStartedAt = null,
) {
	const infoMediaKey = _normalizeMediaKey(info?.MediaKey);
	const currentCycleStartedAt = _getCurrentAdBreakStartedAt(infoMediaKey, info);
	const expectedCycle = Math.max(0, Number(expectedCycleStartedAt) || 0);
	if (
		!infoMediaKey ||
		currentCycleStartedAt <= 0 ||
		(expectedCycle > 0
			? !_isCodecHandoffCycleCurrent(infoMediaKey, expectedCycle, info)
			: !_isCodecHandoffCycleCurrent(infoMediaKey, currentCycleStartedAt, info))
	) {
		return false;
	}
	if (
		requestWasAdMarked ||
		info?.IsShowingAd === true ||
		info?.IsHoldingBackupAfterAd === true
	) {
		return true;
	}
	const pendingHandoffId =
		typeof info?._CodecHandoffPendingId === "string" &&
		info._CodecHandoffPendingId
			? info._CodecHandoffPendingId
			: null;
	const activeHandoffId =
		typeof __TTVAB_STATE__?.ActiveCodecHandoffId === "string" &&
		__TTVAB_STATE__.ActiveCodecHandoffId
			? __TTVAB_STATE__.ActiveCodecHandoffId
			: null;
	return Boolean(
		pendingHandoffId &&
			activeHandoffId &&
			pendingHandoffId === activeHandoffId &&
			_getCodecHandoffCycleStartedAt(pendingHandoffId) ===
				currentCycleStartedAt &&
			_normalizeMediaKey(__TTVAB_STATE__?.ActiveCodecHandoffMediaKey) ===
				infoMediaKey,
	);
}

function _requestCodecHandoffReload(info, expectedCycleStartedAt = null) {
	if (
		!_isCodecHandoffAdRecoveryActive(info, false, expectedCycleStartedAt) ||
		typeof info?.ModifiedM3U8 !== "string" ||
		!info.ModifiedM3U8
	) {
		return null;
	}
	if (
		typeof info?._CodecHandoffPendingId === "string" &&
		info._CodecHandoffPendingId
	) {
		const pendingCycleStartedAt = _getCodecHandoffCycleStartedAt(
			info._CodecHandoffPendingId,
		);
		const currentCycleStartedAt = _getCurrentAdBreakStartedAt(
			info.MediaKey,
			info,
		);
		if (
			pendingCycleStartedAt > 0 &&
			pendingCycleStartedAt === currentCycleStartedAt
		) {
			return info._CodecHandoffPendingId;
		}
		info._CodecHandoffPendingId = null;
		info._CodecHandoffAcknowledgedId = null;
		info._CodecHandoffFailedId = null;
		info.IsUsingModifiedM3U8 = false;
	}
	const handoffId = _createCodecHandoffId(info);
	const cycleStartedAt = _getCodecHandoffCycleStartedAt(handoffId);
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
				cycleStartedAt,
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

function _getVideoCodecIdentity(codecs) {
	const values =
		typeof codecs === "string"
			? codecs
					.toLowerCase()
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean)
			: [];
	for (const value of values) {
		if (
			value.startsWith("hev1") ||
			value.startsWith("hvc1") ||
			value.startsWith("av01") ||
			value.startsWith("avc1")
		) {
			return value;
		}
	}
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

function _getBackupVariantCodecIdentity(m3u8, streamUrl, baseUrl = null) {
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
		const variantUrl = _getExactPlaylistUrlKey(rawUrl, baseUrl);
		if (variantUrl === selectedUrl) {
			return _getVideoCodecIdentity(_parseAttrs(line).CODECS);
		}
	}
	return null;
}

function _getBackupVariantResolution(m3u8, streamUrl, baseUrl = null) {
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
		const resolution = String(_parseAttrs(line).RESOLUTION || "").trim();
		return /^\d+x\d+$/.test(resolution) ? resolution : null;
	}
	return null;
}

function _setBackupVariantResolution(info, resolution, activate = false) {
	const selectedResolution = resolution || null;
	info.LastCleanBackupResolution = selectedResolution;
	if (activate) info.ActiveBackupResolution = selectedResolution;
}

function _rememberBackupPlaylistMetadata(
	info,
	m3u8,
	codecFamily = null,
	codec = null,
) {
	if (!info || typeof m3u8 !== "string" || !m3u8) return m3u8;
	if (!(info.BackupPlaylistMetadata instanceof Map)) {
		info.BackupPlaylistMetadata = new Map();
	}
	const nextMetadata = {
		codecFamily: _getVideoCodecFamily(codecFamily || codec),
		codec: _getVideoCodecIdentity(codec),
		ambiguous: false,
	};
	const existingMetadata = info.BackupPlaylistMetadata.get(m3u8) || null;
	const metadataConflicts = Boolean(
		existingMetadata &&
			(existingMetadata.ambiguous === true ||
				existingMetadata.codecFamily !== nextMetadata.codecFamily ||
				existingMetadata.codec !== nextMetadata.codec),
	);
	info.BackupPlaylistMetadata.set(
		m3u8,
		metadataConflicts
			? { codecFamily: null, codec: null, ambiguous: true }
			: nextMetadata,
	);
	while (info.BackupPlaylistMetadata.size > 20) {
		const oldest = info.BackupPlaylistMetadata.keys().next().value;
		if (oldest === undefined) break;
		info.BackupPlaylistMetadata.delete(oldest);
	}
	return m3u8;
}

function _rememberSegmentCodecOwnership(info, text, codecFamily = null) {
	const normalizedCodecFamily = _getVideoCodecFamily(codecFamily);
	if (
		!info ||
		typeof text !== "string" ||
		!text ||
		!(
			normalizedCodecFamily === "avc" ||
			normalizedCodecFamily === "hevc" ||
			normalizedCodecFamily === "av1"
		)
	) {
		return false;
	}
	if (!(__TTVAB_STATE__.SegmentCodecOwners instanceof Map)) {
		__TTVAB_STATE__.SegmentCodecOwners = new Map();
	}
	const rememberUrl = (rawUrl) => {
		const url = _getExactPlaylistUrlKey(rawUrl);
		if (!url) return;
		const previous = __TTVAB_STATE__.SegmentCodecOwners.get(url) || null;
		const conflicts = Boolean(
			previous &&
				(previous.ambiguous === true ||
					previous.codecFamily !== normalizedCodecFamily ||
					_normalizeMediaKey(previous.mediaKey) !==
						_normalizeMediaKey(info.MediaKey)),
		);
		__TTVAB_STATE__.SegmentCodecOwners.set(
			url,
			conflicts
				? {
						codecFamily: null,
						mediaKey: null,
						recordedAt: Date.now(),
						ambiguous: true,
					}
				: {
						codecFamily: normalizedCodecFamily,
						mediaKey: _normalizeMediaKey(info.MediaKey),
						recordedAt: Date.now(),
						ambiguous: false,
					},
		);
	};
	const lines = text.split("\n");
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (line?.startsWith("#EXTINF")) {
			rememberUrl(lines[index + 1]);
			index++;
			continue;
		}
		if (_isMediaPartLine(line) || _isPartPreloadHintLine(line)) {
			rememberUrl(_getTaggedPlaylistUri(line));
			continue;
		}
		if (line?.startsWith("#EXT-X-TWITCH-PREFETCH:")) {
			rememberUrl(line.substring("#EXT-X-TWITCH-PREFETCH:".length).trim());
		}
	}
	while (__TTVAB_STATE__.SegmentCodecOwners.size > 1000) {
		const oldest = __TTVAB_STATE__.SegmentCodecOwners.keys().next().value;
		if (oldest === undefined) break;
		__TTVAB_STATE__.SegmentCodecOwners.delete(oldest);
	}
	return true;
}

function _isLastCleanNativeForRequest(
	info,
	url,
	requestCodecs = null,
	requestIsEnhanced = false,
	retiringCodec = null,
) {
	const cachedUrl = _getExactPlaylistUrlKey(info?.LastCleanNativeUrl);
	const requestUrl = _getExactPlaylistUrlKey(url);
	if (!cachedUrl || !requestUrl || cachedUrl !== requestUrl) return false;
	const cachedFamily = _getVideoCodecFamily(info?.LastCleanNativeCodec);
	const cachedIdentity = _getVideoCodecIdentity(info?.LastCleanNativeCodec);
	const retiringIdentity = _getVideoCodecIdentity(retiringCodec);
	if (retiringIdentity) return cachedIdentity === retiringIdentity;
	const retiringFamily = _getVideoCodecFamily(retiringCodec);
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
	retiringCodec = null,
) {
	const ageMs = Date.now() - (Number(info?.LastCleanNativePlaylistAt) || 0);
	if (
		!_isLastCleanNativeForRequest(
			info,
			url,
			requestCodecs,
			requestIsEnhanced,
			retiringCodec,
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
	retiringCodec = null,
	retirementDeadlineAt = 0,
) {
	const bridgeDeadline = Date.now() + 2500;
	const absoluteRetirementDeadline =
		Math.max(0, Number(retirementDeadlineAt) || 0) || Date.now() + 10000;
	let activeHandoffId = handoffId;
	const retiringCodecIdentity = _getVideoCodecIdentity(retiringCodec);
	const retiringCodecFamily = _getVideoCodecFamily(retiringCodec);
	const requestCodecIdentity = _getVideoCodecIdentity(requestCodecs);
	const requestCodecFamily = _getVideoCodecFamily(requestCodecs);
	const sourceMatchesRetiringCodec = retiringCodecIdentity
		? requestCodecIdentity === retiringCodecIdentity
		: Boolean(
				retiringCodecFamily && requestCodecFamily === retiringCodecFamily,
			);
	const sourceIsClean =
		sourceMatchesRetiringCodec &&
		_playlistHasMediaSegments(text) &&
		!_hasPlaylistAdMarkers(text) &&
		!_hasExplicitAdMetadata(text) &&
		!_playlistHasKnownAdSegments(text, { includeCached: false });
	while (true) {
		if (requestSignal?.aborted) {
			throw _createCodecHandoffAbortError(requestSignal);
		}
		if (Date.now() >= absoluteRetirementDeadline) {
			const timedOutCycleStartedAt =
				_getCodecHandoffCycleStartedAt(activeHandoffId);
			if (
				info?._CodecHandoffPendingId === activeHandoffId &&
				info?._CodecHandoffAcknowledgedId !== activeHandoffId &&
				_isCodecHandoffCycleCurrent(
					info?.MediaKey,
					timedOutCycleStartedAt,
					info,
				)
			) {
				if (typeof self !== "undefined" && self.postMessage) {
					_postWorkerBridgeMessage(
						self,
						_createPageScopedWorkerEvent({
							key: "ReloadPlayer",
							channel: info.ChannelName,
							mediaKey: info.MediaKey,
							reason: "codec-handoff",
							handoffId: activeHandoffId,
							cycleStartedAt: timedOutCycleStartedAt,
							refreshAccessToken: true,
							newMediaPlayerInstance: true,
						}),
					);
				}
			}
			_log(
				"[Trace] Retiring enhanced-codec request exceeded its handoff deadline; aborting the old loader",
				"warning",
			);
			throw _createCodecHandoffAbortError(requestSignal);
		}
		const sameRequestCleanNative = _getSameRequestCleanNative(
			info,
			url,
			requestCodecs,
			requestIsEnhanced,
			10000,
			retiringCodec,
		);
		if (
			typeof info?._CodecHandoffPendingId === "string" &&
			info._CodecHandoffPendingId &&
			info._CodecHandoffPendingId !== activeHandoffId
		) {
			activeHandoffId = info._CodecHandoffPendingId;
		}
		const activeHandoffCycleStartedAt =
			_getCodecHandoffCycleStartedAt(activeHandoffId);
		if (
			!_isCodecHandoffAdRecoveryActive(info, false, activeHandoffCycleStartedAt)
		) {
			if (sameRequestCleanNative) return sameRequestCleanNative;
			if (sourceIsClean) return text;
			throw _createCodecHandoffAbortError(requestSignal);
		}
		const transactionFailed = Boolean(
			activeHandoffId && info?._CodecHandoffFailedId === activeHandoffId,
		);
		if (transactionFailed && info?.IsShowingAd) {
			const retryCount = Math.max(
				0,
				Number(info._CodecHandoffReloadRetryCount) || 0,
			);
			const retryDelays = [250, 1000, 3000, 8000, 15000];
			await _waitForAbortableDelay(
				Math.min(
					retryDelays[Math.min(retryCount, retryDelays.length - 1)],
					Math.max(0, absoluteRetirementDeadline - Date.now()),
				),
				requestSignal,
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
				activeHandoffId = _requestCodecHandoffReload(
					info,
					activeHandoffCycleStartedAt,
				);
				if (!activeHandoffId) {
					if (sameRequestCleanNative) return sameRequestCleanNative;
					if (sourceIsClean) return text;
					throw _createCodecHandoffAbortError(requestSignal);
				}
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
		if (transactionEnded) {
			throw _createCodecHandoffAbortError(requestSignal);
		}
		await _waitForAbortableDelay(
			Math.min(16, Math.max(0, absoluteRetirementDeadline - Date.now())),
			requestSignal,
		);
	}
}

function _assertM3U8RequestContextCurrent(
	info,
	requestAdContext = null,
	requestSignal = null,
) {
	if (requestSignal?.aborted) {
		throw _createCodecHandoffAbortError(requestSignal);
	}
	if (!info || !requestAdContext || typeof requestAdContext !== "object") {
		return true;
	}
	const expectedBackupSearchEpoch = Math.max(
		0,
		Number(requestAdContext.backupSearchEpoch) || 0,
	);
	if (
		Math.max(0, Number(info.BackupSearchEpoch) || 0) !==
		expectedBackupSearchEpoch
	) {
		throw _createCodecHandoffAbortError(requestSignal);
	}
	const expectedLoaderEpoch = Math.max(
		0,
		Number(requestAdContext.loaderEpoch) || 0,
	);
	if (
		Math.max(0, Number(info.NativeRecoveryLoaderEpoch) || 0) !==
		expectedLoaderEpoch
	) {
		throw _createCodecHandoffAbortError(requestSignal);
	}
	const expectedCycleStartedAt = Math.max(
		0,
		Number(requestAdContext.cycleStartedAt) || 0,
	);
	if (
		expectedCycleStartedAt > 0 &&
		!_isCodecHandoffCycleCurrent(info.MediaKey, expectedCycleStartedAt, info)
	) {
		throw _createCodecHandoffAbortError(requestSignal);
	}
	return true;
}

async function _awaitM3U8RequestContext(
	promise,
	info,
	requestAdContext = null,
	requestSignal = null,
) {
	const value = await promise;
	_assertM3U8RequestContextCurrent(info, requestAdContext, requestSignal);
	return value;
}

async function _processM3U8(
	url,
	text,
	realFetch,
	requestSignal = null,
	requestStartContext = null,
) {
	const initialInfo = _getStreamInfoForPlaylist(url);
	const requestStartMediaKey = _normalizeMediaKey(
		requestStartContext?.mediaKey,
	);
	const initialMediaKey = _normalizeMediaKey(initialInfo?.MediaKey);
	const initialMediaFirstSyntheticInfo = Boolean(
		initialInfo &&
			initialInfo.EncodingsM3U8 === null &&
			initialInfo.UsherBaseUrl === "" &&
			Array.isArray(initialInfo.ResolutionList) &&
			initialInfo.ResolutionList.length === 0,
	);
	const requestStartContextMatchesInfo = Boolean(
		requestStartMediaKey &&
			initialMediaKey &&
			requestStartMediaKey === initialMediaKey,
	);
	const hasRequestStartContext = Boolean(
		requestStartContext && typeof requestStartContext === "object",
	);
	if (
		requestStartMediaKey &&
		(!initialMediaKey || !requestStartContextMatchesInfo)
	) {
		throw _createCodecHandoffAbortError(requestSignal);
	}
	if (
		initialMediaFirstSyntheticInfo &&
		_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) ===
			initialMediaKey &&
		Math.max(0, Number(initialInfo?.VisibleAdStartedAt) || 0) > 0
	) {
		__TTVAB_STATE__?.RequestMediaBootstrapRecovery?.(
			initialInfo,
			initialInfo.VisibleAdStartedAt,
		);
		throw _createCodecHandoffAbortError(requestSignal);
	}
	const initialResolution = _getDirectPlaybackResolutionForUrl(
		initialInfo,
		url,
	);
	const requestStartCodec =
		_getVideoCodecIdentity(requestStartContext?.requestCodec) ||
		_getVideoCodecFamily(requestStartContext?.requestCodec) ||
		null;
	const initialRequestCodec = initialResolution?.Codecs || requestStartCodec;
	const initialRequestCodecFamily = _getVideoCodecFamily(initialRequestCodec);
	const exactRequestUrl = _getExactPlaylistUrlKey(url);
	const requestIsEnhanced = Boolean(
		initialRequestCodecFamily === "hevc" ||
			initialRequestCodecFamily === "av1" ||
			initialInfo?.EnhancedVariantUrls?.has(exactRequestUrl) ||
			initialInfo?.EnhancedBackupVariantUrls?.has(exactRequestUrl),
	);
	const requestStartEnhancedCodec = requestStartContextMatchesInfo
		? _getVideoCodecIdentity(requestStartContext?.enhancedDecoderCodec) ||
			_getVideoCodecFamily(requestStartContext?.enhancedDecoderCodec)
		: null;
	const stickyEnhancedCodec =
		requestStartEnhancedCodec ||
		_getVideoCodecIdentity(initialInfo?.EnhancedDecoderCodec) ||
		_getVideoCodecFamily(initialInfo?.EnhancedDecoderCodecFamily) ||
		null;
	const initialRetiringCodec =
		stickyEnhancedCodec ||
		(requestIsEnhanced
			? _getVideoCodecIdentity(initialRequestCodec) ||
				_getVideoCodecFamily(initialRequestCodec)
			: null);
	const initialRetiringCodecFamily = _getVideoCodecFamily(initialRetiringCodec);
	const initialHasEnhancedDecoderOwner = Boolean(
		initialRetiringCodecFamily === "hevc" ||
			initialRetiringCodecFamily === "av1",
	);
	const requestCodecs = initialRequestCodec || null;
	const activeHandoffId = initialInfo
		? _getActiveCodecHandoffIdForInfo(initialInfo)
		: null;
	if (
		initialInfo &&
		initialHasEnhancedDecoderOwner &&
		initialInfo.IsUsingModifiedM3U8
	) {
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
				initialRetiringCodec,
			);
		}
	}

	const requestAdContext = {
		requestStartMediaKey: hasRequestStartContext
			? requestStartMediaKey
			: initialMediaKey,
		requestStartCycleStartedAt: hasRequestStartContext
			? Math.max(0, Number(requestStartContext?.cycleStartedAt) || 0)
			: Math.max(0, Number(initialInfo?.VisibleAdStartedAt) || 0),
		backupSearchEpoch: hasRequestStartContext
			? Math.max(0, Number(requestStartContext?.backupSearchEpoch) || 0)
			: Math.max(0, Number(initialInfo?.BackupSearchEpoch) || 0),
		loaderEpoch: hasRequestStartContext
			? Math.max(0, Number(requestStartContext?.loaderEpoch) || 0)
			: Math.max(0, Number(initialInfo?.NativeRecoveryLoaderEpoch) || 0),
		cycleStartedAt: hasRequestStartContext
			? Math.max(0, Number(requestStartContext?.cycleStartedAt) || 0)
			: Math.max(0, Number(initialInfo?.VisibleAdStartedAt) || 0),
		includeCachedAdSegments: Boolean(
			requestStartContextMatchesInfo &&
				requestStartContext?.includeCachedAdSegments,
		),
		responseDeadlineAt: initialHasEnhancedDecoderOwner ? Date.now() + 10000 : 0,
	};
	const coreResultProbe = await _awaitBackupProbeBeforeDeadline(
		_awaitWithRequestSignal(
			_processM3U8Core(url, text, realFetch, requestAdContext, requestSignal),
			requestSignal,
		),
		requestAdContext.responseDeadlineAt,
	);
	if (!coreResultProbe.completed) {
		_log(
			"[Trace] Enhanced-codec media processing exceeded its response deadline; aborting this loader while the cycle-owned backup search continues",
			"warning",
		);
		throw _createCodecHandoffAbortError(requestSignal);
	}
	let result = coreResultProbe.value;
	const info = _getStreamInfoForPlaylist(url) || initialInfo;
	if (!info) return result;
	const mediaFirstSyntheticInfo = Boolean(
		info.EncodingsM3U8 === null &&
			info.UsherBaseUrl === "" &&
			Array.isArray(info.ResolutionList) &&
			info.ResolutionList.length === 0,
	);
	if (
		mediaFirstSyntheticInfo &&
		_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) ===
			_normalizeMediaKey(info.MediaKey) &&
		Math.max(0, Number(info.VisibleAdStartedAt) || 0) > 0
	) {
		throw _createCodecHandoffAbortError(requestSignal);
	}
	const retiringCodec =
		initialRetiringCodec ||
		_getVideoCodecIdentity(info.EnhancedDecoderCodec) ||
		_getVideoCodecFamily(info.EnhancedDecoderCodecFamily) ||
		(requestIsEnhanced
			? _getVideoCodecIdentity(initialRequestCodec) ||
				_getVideoCodecFamily(initialRequestCodec)
			: null);
	const retiringCodecFamily = _getVideoCodecFamily(retiringCodec);
	const retiringCodecIdentity = _getVideoCodecIdentity(retiringCodec);
	const responseHasEnhancedDecoderOwner = Boolean(
		retiringCodecFamily === "hevc" || retiringCodecFamily === "av1",
	);

	const resultBackupMetadata =
		info.BackupPlaylistMetadata instanceof Map
			? info.BackupPlaylistMetadata.get(result) || null
			: null;
	const returnedCachedBackupBeforeEnhancedStrip = Boolean(
		resultBackupMetadata ||
			(typeof info.LastCleanBackupM3U8 === "string" &&
				info.LastCleanBackupM3U8 &&
				result === info.LastCleanBackupM3U8),
	);
	const returnedCachedNativeBeforeEnhancedStrip = Boolean(
		typeof info.LastCleanNativeM3U8 === "string" &&
			info.LastCleanNativeM3U8 &&
			result === info.LastCleanNativeM3U8,
	);
	const returnedEmptyHoldBeforeEnhancedStrip = result.includes(
		"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4",
	);
	const requestMayUseCachedAdSegments = Boolean(
		requestAdContext.includeCachedAdSegments ||
			(_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) ===
				_normalizeMediaKey(info.MediaKey) &&
				(info.IsShowingAd === true || info.IsHoldingBackupAfterAd === true)),
	);
	const requestWasAdMarked =
		_hasPlaylistAdMarkers(text) ||
		_hasExplicitAdMetadata(text) ||
		_playlistHasKnownAdSegments(text, {
			includeCached: requestMayUseCachedAdSegments,
		});
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
		resultBackupMetadata ||
			(typeof info.LastCleanBackupM3U8 === "string" &&
				info.LastCleanBackupM3U8 &&
				result === info.LastCleanBackupM3U8),
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
		retiringCodec,
	);
	const requestCodecFamily = _getVideoCodecFamily(requestCodecs);
	const requestCodecIdentity = _getVideoCodecIdentity(requestCodecs);
	const backupCodecFamily = _getVideoCodecFamily(
		resultBackupMetadata
			? resultBackupMetadata.codecFamily
			: info.LastCleanBackupCodecFamily,
	);
	const backupCodecIdentity = _getVideoCodecIdentity(
		resultBackupMetadata
			? resultBackupMetadata.codec
			: info.LastCleanBackupCodec,
	);
	const requestCodecMatchesRetiringOwner = Boolean(
		requestCodecFamily &&
			requestCodecFamily === retiringCodecFamily &&
			(!retiringCodecIdentity ||
				requestCodecIdentity === retiringCodecIdentity),
	);
	const requestCanUseRetiringOwnerBackup = Boolean(
		!requestCodecFamily || requestCodecMatchesRetiringOwner,
	);
	const returnedBackupMatchesRetiringOwner = Boolean(
		returnedCachedBackup &&
			retiringCodecFamily &&
			backupCodecFamily === retiringCodecFamily &&
			retiringCodecIdentity &&
			backupCodecIdentity === retiringCodecIdentity,
	);
	const returnedBackupMatchesRequest = Boolean(
		returnedCachedBackup &&
			requestCodecFamily &&
			backupCodecFamily === requestCodecFamily &&
			(requestCodecFamily === "hevc" || requestCodecFamily === "av1"
				? Boolean(
						requestCodecIdentity &&
							backupCodecIdentity === requestCodecIdentity,
					)
				: true),
	);
	const responseCodecConflictsWithRetiringOwner = Boolean(
		retiringCodecFamily &&
			!requestCodecMatchesRetiringOwner &&
			!returnedBackupMatchesRetiringOwner &&
			_playlistHasMediaSegments(result),
	);
	const codecHandoffAdRecoveryActive = _isCodecHandoffAdRecoveryActive(
		info,
		requestWasAdMarked,
		requestAdContext.cycleStartedAt,
	);
	const handoffCodecOverride =
		responseHasEnhancedDecoderOwner &&
		requestCodecFamily === "avc" &&
		!requestCodecMatchesRetiringOwner
			? requestCodecs || "avc"
			: null;
	if (
		returnedCachedBackup &&
		requestCodecFamily &&
		!returnedBackupMatchesRequest &&
		!responseHasEnhancedDecoderOwner
	) {
		const sameRequestCleanNative = _getSameRequestCleanNative(
			info,
			url,
			requestCodecs,
			requestIsEnhanced,
			2000,
			null,
		);
		if (sameRequestCleanNative) {
			return sameRequestCleanNative;
		}
		if (codecHandoffAdRecoveryActive) {
			info._LastBackupSearchCompletedAt = 0;
			const retryTarget = _resolveAdBackupTargetResolution(info, url);
			_findBackupStream(info, realFetch, 0, retryTarget, requestCodecs).catch(
				(error) => {
					_log(
						`[Trace] Matching-codec backup refresh failed: ${error?.message ?? String(error)}`,
						"warning",
					);
				},
			);
		}
		return requestWasAdMarked
			? _stripAds(text, false, info, false, true)
			: text;
	}
	const unsafeEnhancedResponse = Boolean(
		responseHasEnhancedDecoderOwner &&
			(requestWasAdMarked || codecHandoffAdRecoveryActive) &&
			((returnedCachedBackup &&
				(!returnedBackupMatchesRetiringOwner ||
					!requestCanUseRetiringOwnerBackup)) ||
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
	const unsafeResponseDeadlineAt =
		Math.max(0, Number(requestAdContext.responseDeadlineAt) || 0) ||
		Date.now() + 10000;
	while (true) {
		if (requestSignal?.aborted) {
			throw _createCodecHandoffAbortError(requestSignal);
		}
		if (Date.now() >= unsafeResponseDeadlineAt) {
			_log(
				"[Trace] Enhanced-codec recovery exceeded its response deadline; aborting the unsafe loader while backup search continues",
				"warning",
			);
			throw _createCodecHandoffAbortError(requestSignal);
		}
		const sameRequestCleanNative = _getSameRequestCleanNative(
			info,
			url,
			requestCodecs,
			requestIsEnhanced,
			10000,
			retiringCodec,
		);
		if (
			!_isCodecHandoffAdRecoveryActive(
				info,
				requestWasAdMarked,
				requestAdContext.cycleStartedAt,
			)
		) {
			if (sameRequestCleanNative) return sameRequestCleanNative;
			throw _createCodecHandoffAbortError(requestSignal);
		}
		const now = Date.now();
		const backupAt = Number(info.LastCleanBackupAt) || 0;
		const backupAgeMs = now - backupAt;
		const cleanBackupIsFreshAndSafe = Boolean(
			typeof info.LastCleanBackupM3U8 === "string" &&
				info.LastCleanBackupM3U8 &&
				backupAt >= Math.max(0, Number(info.VisibleAdStartedAt) || 0) &&
				backupAgeMs >= 0 &&
				backupAgeMs < 900 &&
				!_hasPlaylistAdMarkers(info.LastCleanBackupM3U8) &&
				!_hasExplicitAdMetadata(info.LastCleanBackupM3U8) &&
				!_playlistHasKnownAdSegments(info.LastCleanBackupM3U8, {
					includeCached: false,
				}),
		);
		const cleanBackupMetadata =
			cleanBackupIsFreshAndSafe && info.BackupPlaylistMetadata instanceof Map
				? info.BackupPlaylistMetadata.get(info.LastCleanBackupM3U8) || null
				: null;
		const cleanBackupHasTrustedCodec = Boolean(
			cleanBackupMetadata && cleanBackupMetadata.ambiguous !== true,
		);
		const sameCodecBackupReady = Boolean(
			cleanBackupIsFreshAndSafe &&
				cleanBackupHasTrustedCodec &&
				requestCanUseRetiringOwnerBackup &&
				retiringCodecIdentity &&
				_getVideoCodecIdentity(info.LastCleanBackupCodec) ===
					retiringCodecIdentity &&
				_getVideoCodecIdentity(cleanBackupMetadata.codec) ===
					retiringCodecIdentity,
		);
		if (sameCodecBackupReady) {
			return info.LastCleanBackupM3U8;
		}
		const cleanBackupReady = Boolean(
			cleanBackupIsFreshAndSafe &&
				cleanBackupHasTrustedCodec &&
				_getVideoCodecFamily(info.LastCleanBackupCodecFamily) === "avc" &&
				_getVideoCodecFamily(cleanBackupMetadata.codecFamily) === "avc",
		);
		if (!cleanBackupReady) {
			if (sameRequestCleanNative) return sameRequestCleanNative;
			const backupSearchIsInFlight = Boolean(
				info._BackupSearchPromise ||
					(info._BackupSearchPromises instanceof Map &&
						info._BackupSearchPromises.size > 0),
			);
			if (
				now >= nextBackupSearchRetryAt &&
				(!handoffCodecOverride || !backupSearchIsInFlight)
			) {
				backupSearchRetryCount++;
				nextBackupSearchRetryAt =
					now +
					backupSearchRetryDelays[
						Math.min(backupSearchRetryCount, backupSearchRetryDelays.length - 1)
					];
				info._LastBackupSearchCompletedAt = 0;
				const retryTarget = _resolveAdBackupTargetResolution(info, url);
				_findBackupStream(
					info,
					realFetch,
					0,
					retryTarget,
					handoffCodecOverride,
				).catch((err) => {
					_log(
						`[Trace] Enhanced-codec backup retry failed: ${err?.message ?? String(err)}`,
						"warning",
					);
				});
			}
			await _waitForAbortableDelay(
				Math.min(50, Math.max(0, unsafeResponseDeadlineAt - Date.now())),
				requestSignal,
			);
			continue;
		}

		let handoffId = info._CodecHandoffPendingId;
		if (!handoffId) {
			handoffId = _requestCodecHandoffReload(
				info,
				requestAdContext.cycleStartedAt,
			);
		}
		if (!handoffId) {
			if (sameRequestCleanNative) return sameRequestCleanNative;
			throw _createCodecHandoffAbortError(requestSignal);
		}
		return _holdRetiringCodecRequest(
			info,
			url,
			text,
			requestCodecs,
			requestIsEnhanced,
			requestSignal,
			handoffId,
			retiringCodec,
			unsafeResponseDeadlineAt,
		);
	}
}

async function _processM3U8Core(
	url,
	text,
	realFetch,
	requestAdContext = null,
	requestSignal = null,
) {
	text = _absolutizeMediaPlaylistUrls(text, url);

	let info = _getStreamInfoForPlaylist(url);
	if (!info) {
		const syntheticPlaybackContext =
			_getSyntheticPlaybackContextForPlaylist(url);
		const inheritedCycleStartedAt = Math.max(
			0,
			Number(
				syntheticPlaybackContext?.MediaKey
					? __TTVAB_STATE__?.AdPodProgressByMediaKey?.[
							syntheticPlaybackContext.MediaKey
						]?.cycleStartedAt
					: 0,
			) || 0,
		);
		const inheritsCurrentAdCycle = Boolean(
			syntheticPlaybackContext?.MediaKey &&
				inheritedCycleStartedAt > 0 &&
				_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) ===
					_normalizeMediaKey(syntheticPlaybackContext.MediaKey),
		);
		const unknownPlaylistHasAds =
			_hasPlaylistAdMarkers(text) ||
			_hasExplicitAdMetadata(text) ||
			_playlistHasKnownAdSegments(text, { includeCached: false }) ||
			__TTVAB_STATE__.SimulatedAdsDepth > 0;
		if (!unknownPlaylistHasAds && !inheritsCurrentAdCycle) {
			return text;
		}
		if (inheritsCurrentAdCycle) {
			__TTVAB_STATE__?.RequestMediaBootstrapRecovery?.(
				syntheticPlaybackContext,
				inheritedCycleStartedAt,
			);
			throw _createCodecHandoffAbortError(requestSignal);
		}
		info = _createSyntheticStreamInfo(syntheticPlaybackContext, url);
		if (!info) throw _createCodecHandoffAbortError(requestSignal);
	}
	_assertM3U8RequestContextCurrent(info, requestAdContext, requestSignal);
	info.LastActivityAt = Date.now();

	const currentAliases = _getPlaylistUrlAliases(url);
	const exactRequestUrl = _getExactPlaylistUrlKey(url);
	const isExactCurrentMasterVariant = Boolean(
		exactRequestUrl && info?.Urls && Object.hasOwn(info.Urls, exactRequestUrl),
	);
	const isExactCurrentCycleNativeVariant = Boolean(
		!isExactCurrentMasterVariant &&
			(info.IsShowingAd || info.IsHoldingBackupAfterAd) &&
			_isExactNativeRecoveryCandidateOwned(
				info,
				url,
				true,
				requestAdContext
					? requestAdContext.requestStartMediaKey
					: info?.MediaKey,
				requestAdContext
					? requestAdContext.requestStartCycleStartedAt
					: info?.VisibleAdStartedAt,
			),
	);
	const isExactCurrentNativeVariant = Boolean(
		isExactCurrentMasterVariant || isExactCurrentCycleNativeVariant,
	);
	const isBackupUrl = Boolean(
		!isExactCurrentNativeVariant &&
			(currentAliases.some((alias) => info.BackupVariantUrls?.has(alias)) ||
				(info.ActiveBackupPlayerType &&
					info.BackupEncodingsM3U8Cache[info.ActiveBackupPlayerType]
						?.baseUrl === url)),
	);
	const isEnhancedBackupUrl = Boolean(
		isBackupUrl &&
			currentAliases.some((alias) =>
				info.EnhancedBackupVariantUrls?.has(alias),
			),
	);
	const backupPlaylistHasAds = Boolean(
		isBackupUrl &&
			(_hasPlaylistAdMarkers(text) ||
				_hasExplicitAdMetadata(text) ||
				_playlistHasKnownAdSegments(text) ||
				__TTVAB_STATE__.SimulatedAdsDepth > 0),
	);

	if (isBackupUrl && !backupPlaylistHasAds) {
		return text;
	}

	const previousSustainedNativeResolution = info.SustainedNativeResolution;
	if (!isBackupUrl) {
		_recordSustainedNativeResolution(info, url);
	}

	if (!__TTVAB_STATE__.IsAdStrippingEnabled) {
		if (
			info.IsShowingAd ||
			info.IsUsingModifiedM3U8 ||
			info.IsUsingFallbackStream ||
			info.IsUsingBackupStream
		) {
			const endedCodecHandoffId = _getActiveCodecHandoffIdForInfo(info);
			const endedCycleStartedAt =
				Math.max(0, Number(info.VisibleAdStartedAt) || 0) ||
				_getCodecHandoffCycleStartedAt(endedCodecHandoffId);
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
						cycleStartedAt: endedCycleStartedAt,
						endedAt: Date.now(),
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
							cycleStartedAt: endedCycleStartedAt,
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
							cycleStartedAt: endedCycleStartedAt,
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
		const pendingReloadCycleStartedAt = Math.max(
			0,
			Number(__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt) || 0,
		);
		const reloadMatchesThisStream =
			(!pendingReloadMediaKey && !pendingReloadChannel) ||
			(pendingReloadMediaKey &&
				pendingReloadMediaKey === _normalizeMediaKey(info.MediaKey)) ||
			(!pendingReloadMediaKey &&
				pendingReloadChannel &&
				pendingReloadChannel === _normalizeChannelName(info.ChannelName));
		if (reloadMatchesThisStream) {
			const pendingCycleIsCurrent =
				pendingReloadCycleStartedAt <= 0 ||
				_isPageLifecycleCycleCurrent(
					info.MediaKey,
					pendingReloadCycleStartedAt,
				);
			__TTVAB_STATE__.HasTriggeredPlayerReload = false;
			__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
			__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
			__TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
			__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt = 0;
			if (pendingCycleIsCurrent) {
				info.LastPlayerReload = Date.now();
				_invalidateNativeRecoveryAfterPlayerReload(info);
			}
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
	const requestCodecIdentity = _getVideoCodecIdentity(
		directResolution?.Codecs || res?.Codecs,
	);
	const segmentCodecFamily = isBackupUrl
		? isEnhancedBackupUrl
			? requestCodecFamily ||
				_getVideoCodecFamily(info.EnhancedDecoderCodec) ||
				_getVideoCodecFamily(info.EnhancedDecoderCodecFamily)
			: "avc"
		: requestCodecFamily;
	_rememberSegmentCodecOwnership(info, text, segmentCodecFamily);
	if (
		isEnhancedCodec &&
		(requestCodecFamily === "hevc" || requestCodecFamily === "av1")
	) {
		info.EnhancedDecoderCodecFamily = requestCodecFamily;
		if (requestCodecIdentity) {
			info.EnhancedDecoderCodec = requestCodecIdentity;
		}
	}

	const shouldIncludeCachedAdSegments = Boolean(
		requestAdContext?.includeCachedAdSegments ||
			(_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) ===
				_normalizeMediaKey(info.MediaKey) &&
				(info.IsShowingAd === true || info.IsHoldingBackupAfterAd === true)),
	);
	const hasExplicitKnownAdSegments = _playlistHasKnownAdSegments(text, {
		includeCached: shouldIncludeCachedAdSegments,
	});
	const adSignifier =
		typeof __TTVAB_STATE__?.AdSignifier === "string" &&
		__TTVAB_STATE__.AdSignifier.trim()
			? __TTVAB_STATE__.AdSignifier.trim()
			: "stitched";
	const hasAds =
		text.includes(adSignifier) ||
		_hasExplicitAdMetadata(text) ||
		hasExplicitKnownAdSegments ||
		__TTVAB_STATE__.SimulatedAdsDepth > 0;
	const sustainedNativeCodec = info.SustainedNativeResolution?.Codecs;
	const previousSustainedNativeCodec =
		previousSustainedNativeResolution?.Codecs;
	if (
		!isBackupUrl &&
		!hasAds &&
		directResolution &&
		requestCodecFamily === "avc" &&
		_getVideoCodecIdentity(sustainedNativeCodec) === requestCodecIdentity &&
		info.SustainedNativeResolution?.Resolution ===
			directResolution.Resolution &&
		_getVideoCodecIdentity(previousSustainedNativeCodec) ===
			requestCodecIdentity &&
		previousSustainedNativeResolution?.Resolution ===
			directResolution.Resolution &&
		_getExactPlaylistUrlKey(info.LastCleanNativeUrl) ===
			_getExactPlaylistUrlKey(url) &&
		_getVideoCodecIdentity(info.LastCleanNativeCodec) ===
			requestCodecIdentity &&
		(Number(info.LastCleanNativePlaylistAt) || 0) > 0 &&
		_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) !==
			_normalizeMediaKey(info.MediaKey) &&
		!info.IsShowingAd &&
		!info.IsHoldingBackupAfterAd &&
		!info.IsUsingModifiedM3U8 &&
		!info._CodecHandoffPendingId
	) {
		info.EnhancedDecoderCodecFamily = null;
		info.EnhancedDecoderCodec = null;
	}
	if (
		hasAds &&
		segmentCodecFamily !== "avc" &&
		segmentCodecFamily !== "hevc" &&
		segmentCodecFamily !== "av1"
	) {
		throw _createCodecHandoffAbortError(requestSignal);
	}
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
		const normalizedInfoMediaKey = _normalizeMediaKey(info.MediaKey);
		const normalizedActiveAdMediaKey = _normalizeMediaKey(activeAdMediaKey);
		const activeAdContextMatches = Boolean(
			(normalizedActiveAdMediaKey &&
				normalizedActiveAdMediaKey === normalizedInfoMediaKey) ||
				(!normalizedActiveAdMediaKey &&
					_normalizeChannelName(activeAdChannel) ===
						_normalizeChannelName(info.ChannelName)),
		);
		const isContinuingAdCycle = Boolean(
			activeAdContextMatches || isRecentAdEndReentry,
		);
		const sharedPodCycleStartedAt = Math.max(
			0,
			Number(
				__TTVAB_STATE__?.AdPodProgressByMediaKey?.[info.MediaKey]
					?.cycleStartedAt,
			) || 0,
		);
		const previousCycleStartedAt = Math.max(
			0,
			Number(info.VisibleAdStartedAt) || 0,
		);
		const lastEndedCycleStartedAt =
			isRecentAdEndReentry &&
			_normalizeMediaKey(__TTVAB_STATE__?.LastAdEndedMediaKey) ===
				_normalizeMediaKey(info.MediaKey)
				? Math.max(0, Number(__TTVAB_STATE__?.LastAdEndedCycleStartedAt) || 0)
				: 0;
		const continuationCycleStartedAt = Math.max(
			sharedPodCycleStartedAt,
			activeAdContextMatches ? previousCycleStartedAt : 0,
			lastEndedCycleStartedAt,
		);
		const nextCycleStartedAt =
			isContinuingAdCycle && continuationCycleStartedAt > 0
				? continuationCycleStartedAt
				: now;
		const cycleChanged = previousCycleStartedAt !== nextCycleStartedAt;

		info.IsShowingAd = true;
		info.VisibleAdStartedAt = nextCycleStartedAt;
		info.IsHoldingBackupAfterAd = false;
		info.SilentBackupHoldStartedAt = 0;
		info.LastSilentBackupHoldLogAt = 0;
		info.ConsecutiveFailedNativeProbes = 0;
		__TTVAB_STATE__.CurrentAdChannel = info.ChannelName;
		__TTVAB_STATE__.CurrentAdMediaKey = info.MediaKey;
		__TTVAB_STATE__.LastAdDetectedAt = now;
		info.FailedBackupPlayerTypes?.clear?.();
		if (cycleChanged) {
			_resetNativeRecoveryReadyState(info);
			info.BackupSearchEpoch =
				Math.max(0, Number(info.BackupSearchEpoch) || 0) + 1;
			info._BackupSearchPromises?.clear?.();
			info._BackupSearchPromise = null;
			info._BackupSearchKey = null;
			info.AdEndConfirmEscalation = 0;
			info._BackupPinFlipCount = 0;
			info.LastCleanBackupM3U8 = null;
			info.LastCleanBackupResolution = null;
			info.LastCleanBackupAt = 0;
			info.BackupPlaylistMetadata?.clear?.();
		}
		if (!isContinuingAdCycle) {
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
					detectedAt: now,
					playlistUrl: url,
					codec: directResolution?.Codecs || res?.Codecs || segmentCodecFamily,
				}),
			);
		}
	};
	if (hasAds && !info.IsHoldingBackupAfterAd) {
		ensureVisibleAdCycle();
	}
	if (hasAds && !isBackupUrl) {
		const exactAdPlaylistUrl = _getExactPlaylistUrlKey(url);
		const adMediaKey = _normalizeMediaKey(info.MediaKey);
		const adCycleStartedAt = Math.max(0, Number(info.VisibleAdStartedAt) || 0);
		const requestOwnsAdPlaylist = Boolean(
			!requestAdContext ||
				(_normalizeMediaKey(requestAdContext.requestStartMediaKey) ===
					adMediaKey &&
					Math.max(0, Number(requestAdContext.loaderEpoch) || 0) ===
						Math.max(0, Number(info.NativeRecoveryLoaderEpoch) || 0)),
		);
		if (
			exactAdPlaylistUrl &&
			adMediaKey &&
			adCycleStartedAt > 0 &&
			requestOwnsAdPlaylist
		) {
			const ownsSameAdCycle = Boolean(
				info.NativeRecoveryAdPlaylistUrls instanceof Set &&
					_normalizeMediaKey(info.NativeRecoveryAdMediaKey) === adMediaKey &&
					Math.max(0, Number(info.NativeRecoveryAdStartedAt) || 0) ===
						adCycleStartedAt,
			);
			if (!ownsSameAdCycle) {
				info.NativeRecoveryAdPlaylistUrls = new Set();
				info.NativeRecoveryAdMediaKey = adMediaKey;
				info.NativeRecoveryAdStartedAt = adCycleStartedAt;
			}
			info.NativeRecoveryAdPlaylistUrls.add(exactAdPlaylistUrl);
			while (info.NativeRecoveryAdPlaylistUrls.size > 16) {
				const oldestUrl =
					info.NativeRecoveryAdPlaylistUrls.values().next().value;
				if (oldestUrl === undefined) break;
				info.NativeRecoveryAdPlaylistUrls.delete(oldestUrl);
			}
		}
	}
	if (requestAdContext && typeof requestAdContext === "object") {
		requestAdContext.backupSearchEpoch = Math.max(
			0,
			Number(info.BackupSearchEpoch) || 0,
		);
		requestAdContext.cycleStartedAt = Math.max(
			0,
			Number(info.VisibleAdStartedAt) || 0,
		);
	}
	if (isBackupUrl && backupPlaylistHasAds) {
		const exactBackupUrl = _getExactPlaylistUrlKey(url);
		const exactBackupOwner =
			info.BackupVariantPlayerTypes?.get?.(exactBackupUrl);
		const contaminatedBackupType =
			typeof exactBackupOwner === "string" && exactBackupOwner
				? exactBackupOwner
				: null;
		if (contaminatedBackupType) {
			if (!info.LoggedBackupAdsByType) {
				info.LoggedBackupAdsByType = new Set();
			}
			info.LoggedBackupAdsByType.add(contaminatedBackupType);
			_markBackupPlayerRetryCooldown(info, contaminatedBackupType, "ad-marked");
			if (info.BackupEncodingsM3U8Cache) {
				info.BackupEncodingsM3U8Cache[contaminatedBackupType] = null;
			}
			if (info.LastCleanBackupPlayerType === contaminatedBackupType) {
				info.LastCleanBackupM3U8 = null;
				info.LastCleanBackupPlayerType = null;
				info.LastCleanBackupResolution = null;
				info.LastCleanBackupCodecFamily = null;
				info.LastCleanBackupCodec = null;
				info.LastCleanBackupAt = 0;
			}
		}
		if (info.ActiveBackupPlayerType === contaminatedBackupType) {
			info.ActiveBackupPlayerType = null;
			info.IsUsingBackupStream = false;
		}
		info._LastBackupSearchCompletedAt = 0;
		_log(
			`[Trace] Active backup${contaminatedBackupType ? ` ${contaminatedBackupType}` : ""} became ad-marked; rotating without serving its media`,
			"warning",
		);
		_findBackupStream(
			info,
			realFetch,
			0,
			_resolveAdBackupTargetResolution(info, url) || res,
		).catch(() => {});
		return _stripAds(text, true, info);
	}
	const backupRequiresNativeRestoreReload = (
		backupPlayerType,
		_backupResolution,
	) => {
		const enhancedDecoderCodecFamily =
			_getVideoCodecFamily(info.EnhancedDecoderCodecFamily) ||
			_getVideoCodecFamily(info.SustainedNativeResolution?.Codecs);
		const enhancedDecoderCodecIdentity =
			_getVideoCodecIdentity(info.EnhancedDecoderCodec) ||
			_getVideoCodecIdentity(info.SustainedNativeResolution?.Codecs);
		const backupCodecFamily = _getVideoCodecFamily(
			info.LastCleanBackupCodecFamily,
		);
		const backupCodecIdentity = _getVideoCodecIdentity(
			info.LastCleanBackupCodec,
		);
		const backupMatchesNativeCodec = Boolean(
			!enhancedDecoderCodecFamily ||
				(backupCodecFamily === enhancedDecoderCodecFamily &&
					enhancedDecoderCodecIdentity &&
					backupCodecIdentity === enhancedDecoderCodecIdentity),
		);
		if (backupPlayerType === "autoplay") return true;
		return Boolean(enhancedDecoderCodecFamily && !backupMatchesNativeCodec);
	};
	const enterSilentBackupHold = (
		enteredAt,
		heldBackupPlayerType,
		heldBackupResolution,
	) => {
		_resetNativeRecoveryCandidateState(info);
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
				backupRequiresNativeRestoreReload(
					heldBackupPlayerType,
					heldBackupResolution,
				),
		);
		if (heldBackupPlayerType) {
			__TTVAB_STATE__.PinnedBackupPlayerType = heldBackupPlayerType;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = info.ChannelName || null;
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey = info.MediaKey || null;
			if (typeof self !== "undefined" && self.postMessage) {
				_postWorkerBridgeMessage(
					self,
					_createPageScopedWorkerEvent({
						key: "BackupPlayerTypeSelected",
						value: heldBackupPlayerType,
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
						cycleStartedAt: Math.max(0, Number(info.VisibleAdStartedAt) || 0),
					}),
				);
			}
		}
		if (info._AdRequestController) {
			info._AdRequestController.abort();
			info._AdRequestController = null;
		}
		_rememberLastAdEnd(info, enteredAt, info.VisibleAdStartedAt);
	};

	if (!hasAds && hasMediaSegments && !info.IsShowingAd) {
		if (!info.IsHoldingBackupAfterAd) {
			info.LastCleanNativeM3U8 = text;
			info.LastCleanNativeUrl = url;
			info.LastCleanNativeCodec =
				directResolution?.Codecs || res?.Codecs || null;
			info.LastCleanNativePlaylistAt = Date.now();
			info.LastCleanNativeLoaderEpoch = Math.max(
				0,
				Number(info.NativeRecoveryLoaderEpoch) || 0,
			);
		}
		if (info.IsHoldingBackupAfterAd) {
			let adEndState = "wait";
			try {
				adEndState = await _isAdEndStable(
					info,
					realFetch,
					res,
					requestAdContext,
					requestSignal,
					text,
					url,
					!isBackupUrl,
				);
			} catch (err) {
				_assertM3U8RequestContextCurrent(info, requestAdContext, requestSignal);
				_log(
					`[Trace] Silent backup hold recovery check failed: ${err?.message ?? String(err)}`,
					"warning",
				);
			}
			if (adEndState === "ended") {
				const restoredAt = Date.now();
				const exactNativeRecoveryReady =
					requestAdContext?.exactNativeRecoveryReady === true;
				const exactNativeRecoveryOwned =
					requestAdContext?.exactNativeRecoveryOwned === true;
				const restoredCycleStartedAt = Math.max(
					0,
					Number(info.VisibleAdStartedAt) || 0,
				);
				const enhancedDecoderCodecFamily = _getVideoCodecFamily(
					info.EnhancedDecoderCodecFamily,
				);
				const enhancedDecoderCodecIdentity = _getVideoCodecIdentity(
					info.EnhancedDecoderCodec,
				);
				const backupCodecFamily = _getVideoCodecFamily(
					info.LastCleanBackupCodecFamily,
				);
				const backupCodecIdentity = _getVideoCodecIdentity(
					info.LastCleanBackupCodec,
				);
				const requiresReload = Boolean(
					info.HevcReloadPendingAfterHold ||
						info.IsUsingModifiedM3U8 ||
						(enhancedDecoderCodecFamily &&
							(backupCodecFamily !== enhancedDecoderCodecFamily ||
								!enhancedDecoderCodecIdentity ||
								backupCodecIdentity !== enhancedDecoderCodecIdentity)),
				);
				if (exactNativeRecoveryReady) {
					info.LastCleanNativeM3U8 = text;
					info.LastCleanNativeUrl = url;
					info.LastCleanNativeCodec =
						directResolution?.Codecs || res?.Codecs || null;
					info.LastCleanNativePlaylistAt = restoredAt;
					info.LastCleanNativeLoaderEpoch = Math.max(
						0,
						Number(info.NativeRecoveryLoaderEpoch) || 0,
					);
				}
				_resetStreamAdState(info);
				__TTVAB_STATE__.CurrentAdChannel = null;
				__TTVAB_STATE__.CurrentAdMediaKey = null;
				__TTVAB_STATE__.PinnedBackupPlayerType = null;
				__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
				__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
				_rememberLastAdEnd(info, restoredAt, restoredCycleStartedAt);
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
							cycleStartedAt: restoredCycleStartedAt,
							restoredAt,
							fromSilentBackupHold: true,
							requiresReload,
							refreshAccessToken: !exactNativeRecoveryOwned,
						}),
					);
				}
				return text;
			}
		}
	}

	if (hasAds) {
		info.LastAdPodProgressAt = Date.now();
		_resetNativeRecoveryCandidateState(info);
		info._IncompletePodCleanStartedAt = 0;
		info._IncompletePodCleanPlaylistCount = 0;
		info._IncompletePodLastMediaSequence = null;
		info._IncompletePodCandidateUrl = null;
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
				info.ActiveBackupResolution ||
					(_resolveAdBackupTargetResolution(info, url) || res)?.Resolution,
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
						cycleStartedAt: visibleAdStartedAt,
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
			const foregroundQualityProbeAt =
				_getPendingForegroundQualityProbeAt(info);
			const foregroundQualityTarget = foregroundQualityProbeAt
				? _resolveAdBackupTargetResolution(info, url) || res
				: null;
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
				_resetNativeRecoveryReadyState(info, true, true);
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
			if (
				!stalledDuringHold &&
				backupAgeMs >= 0 &&
				backupAgeMs < 900 &&
				Number(info.LastCleanBackupAt) >=
					Math.max(0, Number(info.VisibleAdStartedAt) || 0)
			) {
				if (foregroundQualityProbeAt) {
					_startForegroundQualityProbe(
						info,
						realFetch,
						foregroundQualityTarget,
					);
				}
				info.IsUsingBackupStream = true;
				return info.LastCleanBackupM3U8;
			}
			if (stalledDuringHold || backupAgeMs >= 900) {
				const refreshed = stalledDuringHold
					? null
					: await _awaitM3U8RequestContext(
							_refreshActiveBackupMediaPlaylist(info, realFetch),
							info,
							requestAdContext,
							requestSignal,
						);
				if (refreshed) {
					if (foregroundQualityProbeAt) {
						_startForegroundQualityProbe(
							info,
							realFetch,
							foregroundQualityTarget,
						);
					}
					info.IsUsingBackupStream = true;
					return refreshed;
				}
				try {
					const refreshedBackup = await _awaitM3U8RequestContext(
						_findBackupStream(
							info,
							realFetch,
							0,
							_resolveAdBackupTargetResolution(info, url) || res,
						),
						info,
						requestAdContext,
						requestSignal,
					);
					if (refreshedBackup?.m3u8) {
						info.IsUsingBackupStream = true;
						if (refreshedBackup.type) {
							info.ActiveBackupPlayerType = refreshedBackup.type;
						}
						return refreshedBackup.m3u8;
					}
				} catch (err) {
					_assertM3U8RequestContextCurrent(
						info,
						requestAdContext,
						requestSignal,
					);
					_log(
						`[Trace] Backup refresh failed during silent backup hold: ${err?.message ?? String(err)}`,
						"warning",
					);
				}
			}
			info.IsUsingBackupStream = false;
			_log(
				"[Trace] Fresh backup unavailable during silent hold; refusing to replay an expired media snapshot",
				"warning",
			);
			return _stripAds(text, true, info);
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
		const cachedBackupAgeMs =
			Date.now() - (Number(info.LastCleanBackupAt) || 0);
		const freshBackupFromCurrentCycle = Boolean(
			info.LastCleanBackupM3U8 &&
				cachedBackupAgeMs >= 0 &&
				cachedBackupAgeMs < 900 &&
				Number(info.LastCleanBackupAt) >=
					Math.max(0, Number(info.VisibleAdStartedAt) || 0),
		);
		if (freshBackupFromCurrentCycle) {
			info.IsUsingBackupStream = true;
			return info.LastCleanBackupM3U8;
		}
		info.IsUsingBackupStream = false;
		if (info.IsShowingAd || info.IsHoldingBackupAfterAd || hasAds) {
			const offlineTarget = _resolveAdBackupTargetResolution(info, url) || res;
			_findBackupStream(
				info,
				realFetch,
				0,
				offlineTarget,
				directResolution?.Codecs || res?.Codecs || null,
			).catch(() => {});
			return _createEmptyAdHoldPlaylist(text, info);
		}
		return text;
	}

	if (hasAds) {
		const hadNativeRecoveryEvidence =
			Boolean(info.PendingAdEndAt) ||
			Math.max(0, Number(info.CleanPlaylistCount) || 0) > 0 ||
			Math.max(0, Number(info.NativeRecoveryCleanCount) || 0) > 0;
		if (hadNativeRecoveryEvidence) {
			info.PendingAdEndAt = 0;
			info.CleanPlaylistCount = 0;
			info.AdEndMarkerBounceLogged = false;
			info.LastNativeRecoveryHoldLogAt = 0;
			_resetNativeRecoveryReadyState(info, true, true);

			const now = Date.now();
			const debounced = await _awaitM3U8RequestContext(
				_serveBounceDebouncedPlaylist(info, realFetch, text, now),
				info,
				requestAdContext,
				requestSignal,
			);
			if (debounced !== null) {
				info.IsUsingBackupStream = true;
				return debounced;
			}

			info.LastAdEndBounceAt = now;
			info.AdEndConfirmEscalation =
				(Number(info.AdEndConfirmEscalation) || 0) + 1;
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
					const searchStartToken = {};
					const searchStartEpoch = Math.max(
						0,
						Number(info.BackupSearchEpoch) || 0,
					);
					info._BackupSearchStartToken = searchStartToken;
					info._BackupSearchStartedAt = Date.now();
					const clearOwnedSearchStart = () => {
						if (
							info._BackupSearchStartToken === searchStartToken &&
							Math.max(0, Number(info.BackupSearchEpoch) || 0) ===
								searchStartEpoch
						) {
							info._BackupSearchStartToken = null;
							info._BackupSearchStartedAt = 0;
						}
					};
					_findBackupStream(info, realFetch, 0, res)
						.then(clearOwnedSearchStart)
						.catch(clearOwnedSearchStart);
				}
				return _stripAds(text, false, info);
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
				const searchStartToken = {};
				const searchStartEpoch = Math.max(
					0,
					Number(info.BackupSearchEpoch) || 0,
				);
				info._BackupSearchStartToken = searchStartToken;
				info._BackupSearchStartedAt = Date.now();
				const clearOwnedSearchStart = () => {
					if (
						info._BackupSearchStartToken === searchStartToken &&
						Math.max(0, Number(info.BackupSearchEpoch) || 0) ===
							searchStartEpoch
					) {
						info._BackupSearchStartToken = null;
						info._BackupSearchStartedAt = 0;
					}
				};
				_findBackupStream(info, realFetch, 0, prewarmTargetRes)
					.then(clearOwnedSearchStart)
					.catch(clearOwnedSearchStart);
			}
			const prewarmedBackupReady =
				typeof info.LastCleanBackupM3U8 === "string" &&
				info.LastCleanBackupM3U8 &&
				Date.now() - (Number(info.LastCleanBackupAt) || 0) < 5000 &&
				Number(info.LastCleanBackupAt) >=
					Math.max(0, Number(info.VisibleAdStartedAt) || 0);
			if (!prewarmedBackupReady) {
				_log(
					"[Trace] Returning native playlist to prevent buffer drain during backup search",
					"info",
				);
				return info.LastCleanNativeM3U8;
			}
			_log(
				isEnhancedCodec &&
					_getVideoCodecFamily(info.LastCleanBackupCodecFamily) !==
						_getVideoCodecFamily(info.EnhancedDecoderCodecFamily)
					? "[Trace] Pre-warmed AVC backup ready during native bridge; preparing codec-safe reload"
					: "[Trace] Pre-warmed codec-compatible backup ready during native bridge; serving backup early",
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
			!_isRecentPostAdReentry(info) &&
			!_getPendingForegroundQualityProbeAt(info)
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
				const backupIsFromCurrentCycle =
					Number(info.LastCleanBackupAt) >=
					Math.max(0, Number(info.VisibleAdStartedAt) || 0);
				if (backupAgeMs >= 900 || !backupIsFromCurrentCycle) {
					const refreshed = await _awaitM3U8RequestContext(
						_refreshActiveBackupMediaPlaylist(info, realFetch),
						info,
						requestAdContext,
						requestSignal,
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
				if (
					reentryBackupAgeMs >= 0 &&
					reentryBackupAgeMs < 900 &&
					Number(info.LastCleanBackupAt) >=
						Math.max(0, Number(info.VisibleAdStartedAt) || 0)
				) {
					info.IsUsingBackupStream = true;
					return info.LastCleanBackupM3U8;
				}
				const reentryRefreshStartedAt = Date.now();
				const reentryRefreshed = await _awaitM3U8RequestContext(
					_refreshActiveBackupMediaPlaylist(info, realFetch),
					info,
					requestAdContext,
					requestSignal,
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
		let { type: backupType, m3u8: backupM3u8 } = await _awaitM3U8RequestContext(
			_findBackupStream(info, realFetch, startIdx, backupTargetRes),
			info,
			requestAdContext,
			requestSignal,
		);
		let isFallback = false;

		if (!backupM3u8) {
			const cachedBackupAgeMs =
				Date.now() - (Number(info.LastCleanBackupAt) || 0);
			const recentCachedBackup = Boolean(
				info.LastCleanBackupM3U8 &&
					cachedBackupAgeMs >= 0 &&
					cachedBackupAgeMs < 900 &&
					Number(info.LastCleanBackupAt) >=
						Math.max(0, Number(info.VisibleAdStartedAt) || 0),
			);
			const recentSameRequestNative = _getSameRequestCleanNative(
				info,
				url,
				directResolution?.Codecs || res?.Codecs || null,
				isEnhancedCodec,
				2000,
				info.EnhancedDecoderCodec || info.EnhancedDecoderCodecFamily,
			);
			if (recentCachedBackup) {
				backupM3u8 = info.LastCleanBackupM3U8;
				backupType =
					info.LastCleanBackupPlayerType || __TTVAB_STATE__.FallbackPlayerType;
				isFallback = true;
				_log(
					"[Trace] Using cached clean backup as emergency fallback",
					"warning",
				);
			} else if (recentSameRequestNative) {
				backupM3u8 = recentSameRequestNative;
				backupType = __TTVAB_STATE__.FallbackPlayerType;
				isFallback = true;
				_log(
					"[Trace] Using last clean native M3U8 as emergency fallback",
					"warning",
				);
			} else {
				_log(
					"Failed to find backup stream — no fresh clean playlists available",
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

		info.ActiveBackupResolution =
			backupM3u8 &&
			backupM3u8 === info.LastCleanBackupM3U8 &&
			backupType === info.LastCleanBackupPlayerType
				? info.LastCleanBackupResolution || null
				: null;
		if (
			backupM3u8 &&
			backupRequiresNativeRestoreReload(backupType, info.ActiveBackupResolution)
		) {
			info.HevcReloadPendingAfterHold = true;
		}
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
						cycleStartedAt: Math.max(0, Number(info.VisibleAdStartedAt) || 0),
					}),
				);
			}
		}

		const higherQualityProbationInProgress = Boolean(
			__TTVAB_STATE__.DisableAutoplayBackup &&
				backupType === "autoplay" &&
				((info._BackupProbation?.type &&
					info._BackupProbation.type !== "autoplay") ||
					info._BackupSearchPromise ||
					(Number(info._BackupSearchPromises?.size) || 0) > 0),
		);
		info._LastBackupSearchCompletedAt = higherQualityProbationInProgress
			? 0
			: Date.now();

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
		const res = _resolveAdBackupTargetResolution(info, url);
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
			const offlineBackupAgeMs =
				Date.now() - (Number(info.LastCleanBackupAt) || 0);
			if (
				info.LastCleanBackupM3U8 &&
				offlineBackupAgeMs >= 0 &&
				offlineBackupAgeMs < 900 &&
				Number(info.LastCleanBackupAt) >=
					Math.max(0, Number(info.VisibleAdStartedAt) || 0)
			) {
				info.IsUsingBackupStream = true;
				return info.LastCleanBackupM3U8;
			}
			info.IsUsingBackupStream = false;
			_findBackupStream(
				info,
				realFetch,
				0,
				_resolveAdBackupTargetResolution(info, url),
				directResolution?.Codecs || res?.Codecs || null,
			).catch(() => {});
			return _createEmptyAdHoldPlaylist(text, info);
		}
		let adEndState = "wait";
		try {
			adEndState = await _isAdEndStable(
				info,
				realFetch,
				res,
				requestAdContext,
				requestSignal,
				text,
				url,
				!isBackupUrl,
			);
		} catch (err) {
			_assertM3U8RequestContextCurrent(info, requestAdContext, requestSignal);
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
			const foregroundQualityProbeAt =
				_getPendingForegroundQualityProbeAt(info);
			if (info.LastCleanBackupM3U8 && backupAgeMs >= 900) {
				const refreshed = await _awaitM3U8RequestContext(
					_refreshActiveBackupMediaPlaylist(info, realFetch),
					info,
					requestAdContext,
					requestSignal,
				);
				if (refreshed) {
					if (foregroundQualityProbeAt) {
						_startForegroundQualityProbe(
							info,
							realFetch,
							res,
							directResolution?.Codecs || res?.Codecs || null,
						);
					}
					info.IsUsingBackupStream = true;
					return refreshed;
				}
				if (backupIsFromCurrentCycle) {
					try {
						const refreshedBackup = await _awaitM3U8RequestContext(
							_findBackupStream(info, realFetch, 0, res),
							info,
							requestAdContext,
							requestSignal,
						);
						if (refreshedBackup?.m3u8) {
							info.IsUsingBackupStream = true;
							if (refreshedBackup.type) {
								info.ActiveBackupPlayerType = refreshedBackup.type;
							}
							return refreshedBackup.m3u8;
						}
					} catch (err) {
						_assertM3U8RequestContextCurrent(
							info,
							requestAdContext,
							requestSignal,
						);
						_log(
							`[Trace] Backup refresh failed during ad-end wait: ${err?.message ?? String(err)}`,
							"warning",
						);
					}
				}
			}
			if (
				info.LastCleanBackupM3U8 &&
				backupIsFromCurrentCycle &&
				backupAgeMs >= 0 &&
				backupAgeMs < 900
			) {
				if (foregroundQualityProbeAt) {
					_startForegroundQualityProbe(
						info,
						realFetch,
						res,
						directResolution?.Codecs || res?.Codecs || null,
					);
				}
				info.IsUsingBackupStream = true;
				return info.LastCleanBackupM3U8;
			}
			info.IsUsingBackupStream = false;
			const now = Date.now();
			const lastBackupSearchCompletedAt = Math.max(
				0,
				Number(info._LastBackupSearchCompletedAt) || 0,
			);
			const forceRefreshAt = Math.max(
				0,
				Number(__TTVAB_STATE__?.BackupSearchForceRefreshAt) || 0,
			);
			const backupSearchIsInFlight = Boolean(
				info._BackupSearchPromise || info._BackupSearchPromises?.size > 0,
			);
			if (
				!backupSearchIsInFlight &&
				(foregroundQualityProbeAt > 0 ||
					lastBackupSearchCompletedAt <= 0 ||
					now - lastBackupSearchCompletedAt >= 15000 ||
					forceRefreshAt > lastBackupSearchCompletedAt)
			) {
				const backupSearchEpoch = Math.max(
					0,
					Number(info.BackupSearchEpoch) || 0,
				);
				const cycleStartedAt = Math.max(
					0,
					Number(info.VisibleAdStartedAt) || 0,
				);
				const markBackupSearchCompleted = () => {
					if (
						_isBackupSearchContextCurrent(
							info,
							backupSearchEpoch,
							cycleStartedAt,
						)
					) {
						info._LastBackupSearchCompletedAt = Date.now();
					}
				};
				void _findBackupStream(
					info,
					realFetch,
					0,
					res,
					directResolution?.Codecs || res?.Codecs || null,
				).then(markBackupSearchCompleted, markBackupSearchCompleted);
			}
			return _createEmptyAdHoldPlaylist(text, info);
		}

		const adEndedAt = Date.now();
		const endedCycleStartedAt = Math.max(
			0,
			Number(info.VisibleAdStartedAt) || 0,
		);
		const isSilentBackupHoldEnd = adEndState === "ended-with-backup-hold";
		const candidateHeldBackupPlayerType =
			info.LastCleanBackupPlayerType || info.ActiveBackupPlayerType || null;
		let heldBackupM3U8 = null;
		if (isSilentBackupHoldEnd) {
			const lastCleanBackupAt = Math.max(
				0,
				Number(info.LastCleanBackupAt) || 0,
			);
			const heldBackupAgeMs = Date.now() - lastCleanBackupAt;
			const heldBackupIsFresh = Boolean(
				info.LastCleanBackupM3U8 &&
					lastCleanBackupAt >= endedCycleStartedAt &&
					heldBackupAgeMs >= 0 &&
					heldBackupAgeMs < 900,
			);
			if (heldBackupIsFresh) {
				heldBackupM3U8 = info.LastCleanBackupM3U8;
			} else {
				heldBackupM3U8 = await _awaitM3U8RequestContext(
					candidateHeldBackupPlayerType === "autoplay"
						? _refreshHeldAutoplayBackupPlaylist(info, realFetch, res)
						: _refreshActiveBackupMediaPlaylist(info, realFetch),
					info,
					requestAdContext,
					requestSignal,
				);
			}
			if (!heldBackupM3U8) {
				info.IsUsingBackupStream = false;
				info._LastBackupSearchCompletedAt = 0;
				_findBackupStream(info, realFetch, 0, res).catch(() => {});
				_log(
					"[Trace] Silent backup hold has no fresh media; serving an advancing empty hold while refresh continues",
					"warning",
				);
				return _createEmptyAdHoldPlaylist(text, info);
			}
		}
		const heldBackupPlayerType = isSilentBackupHoldEnd
			? candidateHeldBackupPlayerType
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
					cycleStartedAt: endedCycleStartedAt,
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
						cycleStartedAt: endedCycleStartedAt,
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
						cycleStartedAt: endedCycleStartedAt,
					}),
				);
			} else {
				info.LastAdEndReloadKind = null;
			}
			_rememberLastAdEnd(info, adEndedAt, endedCycleStartedAt);
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
	if (__TTVAB_STATE__?.DisableAutoplayBackup) return false;
	if (!_shouldBridgeHeldAutoplayDuringSearch(info)) return false;
	if ((Number(info?._BackupPinFlipCount) || 0) >= 2) return true;
	if (_getPendingForegroundQualityProbeAt(info) > 0) return false;
	const preferredQualityGroup =
		typeof __TTVAB_STATE__?.PreferredQualityGroup === "string"
			? __TTVAB_STATE__.PreferredQualityGroup.trim().toLowerCase()
			: "";
	const hasExplicitQuality = Boolean(
		preferredQualityGroup && preferredQualityGroup !== "auto",
	);
	const nativeQualityStartedAt = Math.max(
		0,
		Number(info?.SustainedNativeResolutionStartedAt) || 0,
	);
	const cycleStartedAt = Math.max(0, Number(info?.VisibleAdStartedAt) || 0);
	if (
		!hasExplicitQuality &&
		(!nativeQualityStartedAt ||
			!cycleStartedAt ||
			cycleStartedAt - nativeQualityStartedAt < 10000)
	) {
		return false;
	}
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
	codecOverride = null,
	commitDeadlineAt = 0,
) {
	const backupSearchEpoch = Math.max(0, Number(info?.BackupSearchEpoch) || 0);
	const cycleStartedAt = Math.max(0, Number(info?.VisibleAdStartedAt) || 0);
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
	const compatibleMaster = _stripHevcBackupVariants(
		info,
		enc,
		targetRes,
		codecOverride,
	);
	if (!compatibleMaster) return null;
	const streamUrl = _getStreamUrl(compatibleMaster, targetRes, encBaseUrl);
	if (!streamUrl) return null;
	const selectedCodecFamily = _getBackupVariantCodecFamily(
		compatibleMaster,
		streamUrl,
		encBaseUrl,
	);
	const selectedCodecIdentity = _getBackupVariantCodecIdentity(
		compatibleMaster,
		streamUrl,
		encBaseUrl,
	);
	const selectedResolution = _getBackupVariantResolution(
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
		if (
			!_isBackupSearchContextCurrent(info, backupSearchEpoch, cycleStartedAt)
		) {
			return null;
		}
		if (
			Math.max(0, Number(commitDeadlineAt) || 0) > 0 &&
			Date.now() >= Math.max(0, Number(commitDeadlineAt) || 0)
		) {
			return null;
		}
		if (!m3u8 || !_playlistHasMediaSegments(m3u8)) return null;
		const hasAds =
			_hasPlaylistAdMarkers(m3u8) ||
			_hasExplicitAdMetadata(m3u8) ||
			_playlistHasKnownAdSegments(m3u8, { includeCached: false });
		if (hasAds) return null;
		info.LastCleanBackupM3U8 = m3u8;
		info.LastCleanBackupPlayerType = "autoplay";
		info.LastCleanBackupCodecFamily = selectedCodecFamily;
		info.LastCleanBackupCodec = selectedCodecIdentity;
		_rememberBackupPlaylistMetadata(
			info,
			m3u8,
			selectedCodecFamily,
			selectedCodecIdentity,
		);
		info.LastCleanBackupAt = Date.now();
		_setBackupVariantResolution(info, selectedResolution, true);
		return m3u8;
	} catch {
		return null;
	}
}

async function _refreshActiveBackupMediaPlaylist(
	info,
	realFetch,
	codecOverride = null,
) {
	const backupSearchEpoch = Math.max(0, Number(info?.BackupSearchEpoch) || 0);
	const cycleStartedAt = Math.max(0, Number(info?.VisibleAdStartedAt) || 0);
	const pt =
		(typeof info?.ActiveBackupPlayerType === "string" &&
			info.ActiveBackupPlayerType) ||
		(typeof info?.LastCleanBackupPlayerType === "string" &&
			info.LastCleanBackupPlayerType) ||
		null;
	if (!pt) return null;
	if (_isBackupPlayerRetryCoolingDown(info, pt)) return null;
	if (pt === "autoplay") {
		return _refreshHeldAutoplayBackupPlaylist(
			info,
			realFetch,
			null,
			codecOverride,
		);
	}

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
	const compatibleMaster = _stripHevcBackupVariants(
		info,
		enc,
		targetRes,
		codecOverride,
	);
	if (!compatibleMaster) return null;
	const streamUrl = _getStreamUrl(compatibleMaster, targetRes, encBaseUrl);
	if (!streamUrl) return null;
	const selectedCodecFamily = _getBackupVariantCodecFamily(
		compatibleMaster,
		streamUrl,
		encBaseUrl,
	);
	const selectedCodecIdentity = _getBackupVariantCodecIdentity(
		compatibleMaster,
		streamUrl,
		encBaseUrl,
	);
	const selectedResolution = _getBackupVariantResolution(
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
		if (
			!_isBackupSearchContextCurrent(info, backupSearchEpoch, cycleStartedAt)
		) {
			return null;
		}
		if (!m3u8 || !_playlistHasMediaSegments(m3u8)) return null;
		const hasAds =
			_hasPlaylistAdMarkers(m3u8) ||
			_hasExplicitAdMetadata(m3u8) ||
			_playlistHasKnownAdSegments(m3u8, { includeCached: false });
		if (hasAds) return null;
		info.LastCleanBackupM3U8 = m3u8;
		info.LastCleanBackupPlayerType = pt;
		info.LastCleanBackupCodecFamily = selectedCodecFamily;
		info.LastCleanBackupCodec = selectedCodecIdentity;
		_rememberBackupPlaylistMetadata(
			info,
			m3u8,
			selectedCodecFamily,
			selectedCodecIdentity,
		);
		info.LastCleanBackupAt = Date.now();
		_setBackupVariantResolution(info, selectedResolution, true);
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
	const requestedCycleStartedAt = Math.max(
		0,
		Number(request?.cycleStartedAt) || 0,
	);
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
	const requiresCodecHandoff = Boolean(
		typeof info?.ModifiedM3U8 === "string" && info.ModifiedM3U8,
	);
	const recoveryMaster = requiresCodecHandoff ? info.ModifiedM3U8 : null;
	if (
		!recoveryId ||
		!requestedAt ||
		requestedCycleStartedAt <= 0 ||
		_getCodecHandoffCycleStartedAt(recoveryId) !== requestedCycleStartedAt ||
		Date.now() - requestedAt > 30000 ||
		requestedAt - Date.now() > 5000 ||
		!mediaKey ||
		requestContext.MediaKey !== mediaKey ||
		currentAdMediaKey !== mediaKey ||
		!_isCodecHandoffCycleCurrent(mediaKey, requestedCycleStartedAt, info) ||
		(!info?.IsShowingAd && !info?.IsHoldingBackupAfterAd) ||
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
				_isCodecHandoffCycleCurrent(mediaKey, requestedCycleStartedAt, info) &&
				(info.IsShowingAd || info.IsHoldingBackupAfterAd) &&
				(!requiresCodecHandoff || info.ModifiedM3U8 === recoveryMaster),
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
				"avc",
			);
		} else {
			cleanBackup = await _refreshActiveBackupMediaPlaylist(
				info,
				realFetch,
				"avc",
			);
		}
		if (!recoveryIsCurrent()) return false;
		if (!cleanBackup) {
			const backup = await _findBackupStream(
				info,
				realFetch,
				0,
				targetResolution,
				"avc",
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

	if (requiresCodecHandoff) {
		info._CodecHandoffPendingId = recoveryId;
		info._CodecHandoffAcknowledgedId = null;
		info._CodecHandoffFailedId = null;
		info.IsUsingModifiedM3U8 = true;
	}
	if (typeof self !== "undefined" && self.postMessage) {
		_postWorkerBridgeMessage(
			self,
			_createPageScopedWorkerEvent({
				key: "FatalMediaRecoveryReady",
				recoveryId,
				channel: info.ChannelName,
				mediaKey,
				cycleStartedAt: requestedCycleStartedAt,
				verifiedAt,
				requiresCodecHandoff,
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
	codecOverride = null,
) {
	const backupSearchEpoch = Math.max(0, Number(info?.BackupSearchEpoch) || 0);
	const cycleStartedAt = Math.max(0, Number(info?.VisibleAdStartedAt) || 0);
	const targetCodec =
		_getVideoCodecIdentity(codecOverride) ||
		_getVideoCodecFamily(codecOverride) ||
		(info?.IsUsingModifiedM3U8
			? "avc"
			: _getVideoCodecIdentity(info?.EnhancedDecoderCodec) ||
				_getVideoCodecIdentity(currentResolution?.Codecs) ||
				_getVideoCodecFamily(info?.EnhancedDecoderCodecFamily) ||
				_getVideoCodecFamily(currentResolution?.Codecs) ||
				"auto");
	const targetKey =
		currentResolution?.Resolution || currentResolution?.Name || "auto";
	const searchKey = [
		_normalizeMediaKey(info?.MediaKey) || "unknown",
		backupSearchEpoch,
		cycleStartedAt,
		Math.max(0, Number(startIdx) || 0),
		targetCodec,
		targetKey,
	].join("|");
	if (!(info?._BackupSearchPromises instanceof Map)) {
		info._BackupSearchPromises = new Map();
	}
	const activeSearchKey =
		typeof info?._BackupSearchKey === "string" && info._BackupSearchKey
			? info._BackupSearchKey
			: null;
	const activeSearchKeyParts = activeSearchKey
		? activeSearchKey.split("|")
		: [];
	const activeSearchMatchesContext = Boolean(
		activeSearchKeyParts.length >= 6 &&
			activeSearchKeyParts[0] ===
				(_normalizeMediaKey(info?.MediaKey) || "unknown") &&
			Number(activeSearchKeyParts[1]) === backupSearchEpoch &&
			Number(activeSearchKeyParts[2]) === cycleStartedAt,
	);
	const activeSearchCodec = activeSearchMatchesContext
		? activeSearchKeyParts[activeSearchKeyParts.length - 2]
		: null;
	const enhancedDecoderFamily = _getVideoCodecFamily(
		info?.EnhancedDecoderCodec || info?.EnhancedDecoderCodecFamily,
	);
	const activeAvcHandoffSearch = Boolean(
		info?._BackupSearchPromise &&
			activeSearchMatchesContext &&
			_getVideoCodecFamily(activeSearchCodec) === "avc" &&
			(enhancedDecoderFamily === "hevc" || enhancedDecoderFamily === "av1") &&
			_isCodecHandoffAdRecoveryActive(info, false, cycleStartedAt),
	);
	const existingSearch =
		(activeAvcHandoffSearch ? info._BackupSearchPromise : null) ||
		info._BackupSearchPromises.get(searchKey) ||
		(!info._BackupSearchKey && info._BackupSearchPromise
			? info._BackupSearchPromise
			: null);
	if (existingSearch) {
		if (
			_shouldBridgeHeldAutoplayDuringSearch(info) &&
			!_shouldHoldAutoplayBackupDuringAd(info)
		) {
			const bridged = await _refreshHeldAutoplayBackupPlaylist(
				info,
				realFetch,
				currentResolution,
				codecOverride,
			);
			if (bridged) return { type: "autoplay", m3u8: bridged };
		}
		return existingSearch;
	}
	const searchPromise = (async () => {
		try {
			return await _searchBackupStream(
				info,
				realFetch,
				startIdx,
				currentResolution,
				codecOverride,
			);
		} finally {
			if (info?._BackupSearchPromises?.get?.(searchKey) === searchPromise) {
				info._BackupSearchPromises.delete(searchKey);
			}
			if (info && info._BackupSearchPromise === searchPromise) {
				info._BackupSearchPromise = null;
				info._BackupSearchKey = null;
			}
		}
	})();
	if (info) {
		info._BackupSearchPromises.set(searchKey, searchPromise);
		info._BackupSearchPromise = searchPromise;
		info._BackupSearchKey = searchKey;
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
				codecOverride,
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
	codecOverride = null,
) {
	let backupType = null;
	let backupM3u8 = null;
	const backupSearchEpoch = Math.max(0, Number(info?.BackupSearchEpoch) || 0);
	const cycleStartedAt = Math.max(0, Number(info?.VisibleAdStartedAt) || 0);
	const searchIsCurrent = () =>
		_isBackupSearchContextCurrent(info, backupSearchEpoch, cycleStartedAt);
	if (!searchIsCurrent()) return { type: null, m3u8: null };
	_forceClearBackupCooldownsIfStale(info);

	let playerTypes = _getOrderedBackupPlayerTypes(info, startIdx);
	const foregroundQualityProbeAt = _getPendingForegroundQualityProbeAt(info);
	let foregroundQualityProbeAttempted = false;
	if (foregroundQualityProbeAt > 0 && playerTypes.includes("autoplay")) {
		playerTypes = [
			...playerTypes.filter((playerType) => playerType !== "autoplay"),
			"autoplay",
		];
	}
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
	const explicitCodecFamily = _getVideoCodecFamily(codecOverride);
	const requestedCodecFamily = info?.IsUsingModifiedM3U8
		? "avc"
		: explicitCodecFamily ||
			_getVideoCodecFamily(info?.EnhancedDecoderCodecFamily) ||
			_getVideoCodecFamily(targetRes?.Codecs) ||
			_getVideoCodecFamily(info?.SustainedNativeResolution?.Codecs);
	const requestedCodecIdentity =
		!info?.IsUsingModifiedM3U8 &&
		(requestedCodecFamily === "hevc" || requestedCodecFamily === "av1")
			? _getVideoCodecIdentity(codecOverride) ||
				_getVideoCodecIdentity(info?.EnhancedDecoderCodec) ||
				_getVideoCodecIdentity(targetRes?.Codecs) ||
				_getVideoCodecIdentity(info?.SustainedNativeResolution?.Codecs)
			: null;
	const activeEnhancedCodecFamily =
		requestedCodecFamily === "hevc" || requestedCodecFamily === "av1"
			? requestedCodecFamily
			: null;
	const codecSearchPasses = activeEnhancedCodecFamily
		? [requestedCodecIdentity || activeEnhancedCodecFamily, "avc"]
		: [explicitCodecFamily || (info?.IsUsingModifiedM3U8 ? "avc" : null)];
	const failedExactCodecPlayerTypes = new Set();
	const exactCodecProbeDeadlineAt = activeEnhancedCodecFamily
		? Date.now() + 1500
		: 0;

	for (
		let codecPass = 0;
		!backupM3u8 && codecPass < codecSearchPasses.length;
		codecPass++
	) {
		if (!searchIsCurrent()) return { type: null, m3u8: null };
		const codecSelection = codecSearchPasses[codecPass];
		const codecFamily = _getVideoCodecFamily(codecSelection);
		const isExactEnhancedPass =
			Boolean(activeEnhancedCodecFamily) &&
			codecPass === 0 &&
			codecFamily === activeEnhancedCodecFamily;
		let passPlayerTypes = [...playerTypes];
		const heldBackupCodecFamily = _getVideoCodecFamily(
			info?.LastCleanBackupCodecFamily,
		);
		if (isExactEnhancedPass && passPlayerTypes.includes("autoplay")) {
			const sourcePlayerTypes = passPlayerTypes.filter(
				(playerType) => playerType !== "autoplay",
			);
			const keepHeldAutoplayFirst = Boolean(
				foregroundQualityProbeAt <= 0 &&
					heldBackupCodecFamily === activeEnhancedCodecFamily &&
					(info?.ActiveBackupPlayerType === "autoplay" ||
						info?.LastCleanBackupPlayerType === "autoplay"),
			);
			passPlayerTypes = keepHeldAutoplayFirst
				? ["autoplay", ...sourcePlayerTypes]
				: [...sourcePlayerTypes, "autoplay"];
			if (foregroundQualityProbeAt <= 0) {
				const cachedPlayerTypes = passPlayerTypes.filter(
					(playerType) => info.BackupEncodingsM3U8Cache?.[playerType],
				);
				passPlayerTypes = [
					...cachedPlayerTypes,
					...passPlayerTypes.filter(
						(playerType) => !cachedPlayerTypes.includes(playerType),
					),
				];
			}
		}
		const mayRestrictToHeldAutoplay =
			!isExactEnhancedPass &&
			(!codecFamily || heldBackupCodecFamily === codecFamily);
		if (mayRestrictToHeldAutoplay && _shouldHoldAutoplayBackupDuringAd(info)) {
			if (foregroundQualityProbeAt <= 0) {
				passPlayerTypes = ["autoplay"];
				_log(
					"[Trace] Holding autoplay backup during LQ dwell; deferring HQ probe briefly",
					"info",
				);
			}
		} else if (
			mayRestrictToHeldAutoplay &&
			_shouldHoldBridgeInsteadOfRotating(info, targetRes)
		) {
			passPlayerTypes = ["autoplay"];
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
		} else if (
			!isExactEnhancedPass &&
			foregroundQualityProbeAt <= 0 &&
			_shouldTryAutoplayFirst(info)
		) {
			passPlayerTypes = [
				"autoplay",
				...passPlayerTypes.filter((pt) => pt !== "autoplay"),
			];
			_log(
				"[Trace] LQ autoplay prioritized first for fast clean first-frame (seamless LQ→HQ hold)",
				"info",
			);
		}
		if (codecPass > 0) {
			_log(
				`[Trace] No clean ${activeEnhancedCodecFamily?.toUpperCase()} backup found; checking explicit AVC emergency variants`,
				"warning",
			);
		}
		const isDoingMinimalRequests =
			startIdx > 0 &&
			passPlayerTypes.every(
				(playerType) =>
					(__TTVAB_STATE__?.BackupPlayerTypes || []).indexOf(playerType) >=
					startIdx,
			);

		for (let pi = 0; !backupM3u8 && pi < passPlayerTypes.length; pi++) {
			if (!searchIsCurrent()) return { type: null, m3u8: null };
			if (isExactEnhancedPass && Date.now() >= exactCodecProbeDeadlineAt) {
				break;
			}
			const pt = passPlayerTypes[pi];
			const configuredPlayerTypeIndex = Math.max(
				0,
				(__TTVAB_STATE__?.BackupPlayerTypes || []).indexOf(pt),
			);
			if (
				_isBackupPlayerRetryCoolingDown(info, pt) &&
				!(codecPass > 0 && failedExactCodecPlayerTypes.has(pt))
			) {
				if (!info._LoggedWhitelistByType) {
					info._LoggedWhitelistByType = new Set();
				}
				if (!info._LoggedWhitelistByType.has(`cooldown:${pt}`)) {
					info._LoggedWhitelistByType.add(`cooldown:${pt}`);
					_log(`[Trace] Cooling down: ${pt}`, "info");
				}
				continue;
			}
			if (
				foregroundQualityProbeAt > 0 &&
				!foregroundQualityProbeAttempted &&
				pt !== "autoplay"
			) {
				foregroundQualityProbeAttempted = true;
				info._ForegroundQualityProbeAppliedAt = foregroundQualityProbeAt;
			}
			_log(`[Trace] Checking: ${pt}`, "info");
			let retryWithoutViewerHeaders = false;

			for (let j = 0; j < 2 || retryWithoutViewerHeaders; j++) {
				if (!searchIsCurrent()) return { type: null, m3u8: null };
				const omitViewerHeaders = retryWithoutViewerHeaders;
				retryWithoutViewerHeaders = false;
				if (omitViewerHeaders) {
					if (
						Math.max(
							0,
							Number(info.LastSessionNeutralBackupProbeCycleStartedAt) || 0,
						) === cycleStartedAt
					) {
						break;
					}
					info.LastSessionNeutralBackupProbeCycleStartedAt = cycleStartedAt;
				}
				let isFreshM3u8 = false;
				let invalidateCache = false;
				let encCache = info.BackupEncodingsM3U8Cache[pt];
				if (
					typeof encCache === "object" &&
					encCache?.viewerHeadersOmitted === true &&
					Math.max(0, Number(encCache?.cycleStartedAt) || 0) !== cycleStartedAt
				) {
					if (info.BackupEncodingsM3U8Cache[pt] === encCache) {
						info.BackupEncodingsM3U8Cache[pt] = null;
					}
					encCache = null;
				}
				let activeCacheEntry = encCache;
				let isSessionNeutralCandidate = Boolean(
					omitViewerHeaders || encCache?.viewerHeadersOmitted === true,
				);
				let enc =
					typeof encCache === "string" ? encCache : encCache?.m3u8 || null;
				let encBaseUrl =
					typeof encCache === "object" && encCache?.baseUrl
						? encCache.baseUrl
						: info.UsherBaseUrl;

				if (!enc) {
					isFreshM3u8 = true;
					try {
						const tokenProbe = await _awaitBackupProbeBeforeDeadline(
							_getToken(info, pt, realFetch, omitViewerHeaders),
							isExactEnhancedPass ? exactCodecProbeDeadlineAt : 0,
						);
						if (!searchIsCurrent()) {
							return { type: null, m3u8: null };
						}
						if (!tokenProbe.completed) break;
						const tokenRes = tokenProbe.value;
						if (tokenRes.status === 200) {
							const tokenBodyProbe = await _awaitBackupProbeBeforeDeadline(
								tokenRes.json(),
								isExactEnhancedPass ? exactCodecProbeDeadlineAt : 0,
							);
							if (!searchIsCurrent()) {
								return { type: null, m3u8: null };
							}
							if (!tokenBodyProbe.completed) break;
							const token = tokenBodyProbe.value;
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
								const masterProbe = await _awaitBackupProbeBeforeDeadline(
									_fetchWithTimeout(realFetch, usherUrl.href),
									isExactEnhancedPass ? exactCodecProbeDeadlineAt : 0,
								);
								if (!searchIsCurrent()) {
									return { type: null, m3u8: null };
								}
								if (!masterProbe.completed) break;
								const encRes = masterProbe.value;
								if (encRes.status === 200) {
									const masterBodyProbe = await _awaitBackupProbeBeforeDeadline(
										encRes.text(),
										isExactEnhancedPass ? exactCodecProbeDeadlineAt : 0,
									);
									if (!searchIsCurrent()) {
										return { type: null, m3u8: null };
									}
									if (!masterBodyProbe.completed) break;
									if (
										isExactEnhancedPass &&
										Date.now() >= exactCodecProbeDeadlineAt
									) {
										break;
									}
									const currentCache = info.BackupEncodingsM3U8Cache[pt];
									const keepSessionNeutralCache = Boolean(
										!omitViewerHeaders &&
											currentCache?.viewerHeadersOmitted === true &&
											Math.max(0, Number(currentCache?.cycleStartedAt) || 0) ===
												cycleStartedAt &&
											Math.max(
												0,
												Number(
													info.LastSessionNeutralBackupProbeCycleStartedAt,
												) || 0,
											) === cycleStartedAt,
									);
									if (keepSessionNeutralCache) {
										enc = currentCache.m3u8;
										encBaseUrl = currentCache.baseUrl || info.UsherBaseUrl;
										activeCacheEntry = currentCache;
										isSessionNeutralCandidate = true;
										isFreshM3u8 = false;
									} else {
										enc = masterBodyProbe.value;
										encBaseUrl = usherUrl.href;
										activeCacheEntry = {
											m3u8: enc,
											baseUrl: encBaseUrl,
											viewerHeadersOmitted: omitViewerHeaders,
											cycleStartedAt: omitViewerHeaders ? cycleStartedAt : 0,
										};
										info.BackupEncodingsM3U8Cache[pt] = activeCacheEntry;
										isSessionNeutralCandidate = omitViewerHeaders;
									}

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
												const variantIsEnhanced = Boolean(
													i > 0 &&
														lines[i - 1]?.startsWith("#EXT-X-STREAM-INF") &&
														_isEnhancedCodecString(
															_parseAttrs(lines[i - 1]).CODECS,
														),
												);
												info.BackupVariantUrls?.add(variantUrl);
												info.BackupVariantPlayerTypes?.set?.(
													_getExactPlaylistUrlKey(variantUrl),
													pt,
												);
												for (const alias of _getPlaylistUrlAliases(
													variantUrl,
												)) {
													info.BackupVariantUrls?.add(alias);
													if (variantIsEnhanced) {
														info.EnhancedBackupVariantUrls?.add(alias);
													}
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
										if (first !== undefined) {
											info.BackupVariantUrls.delete(first);
											info.EnhancedBackupVariantUrls?.delete(first);
											info.BackupVariantPlayerTypes?.delete?.(first);
										} else break;
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
						if (!searchIsCurrent()) {
							return { type: null, m3u8: null };
						}
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
									const variantIsEnhanced = Boolean(
										i > 0 &&
											lines[i - 1]?.startsWith("#EXT-X-STREAM-INF") &&
											_isEnhancedCodecString(_parseAttrs(lines[i - 1]).CODECS),
									);
									info.BackupVariantUrls?.add(variantUrl);
									info.BackupVariantPlayerTypes?.set?.(
										_getExactPlaylistUrlKey(variantUrl),
										pt,
									);
									for (const alias of _getPlaylistUrlAliases(variantUrl)) {
										info.BackupVariantUrls?.add(alias);
										if (variantIsEnhanced) {
											info.EnhancedBackupVariantUrls?.add(alias);
										}
									}
								} catch {}
							}
						}
						while (info.BackupVariantUrls.size > 200) {
							const first = info.BackupVariantUrls.values().next().value;
							if (first !== undefined) {
								info.BackupVariantUrls.delete(first);
								info.EnhancedBackupVariantUrls?.delete(first);
								info.BackupVariantPlayerTypes?.delete?.(first);
							} else break;
						}
					}
					try {
						const compatibleMaster = _stripHevcBackupVariants(
							info,
							enc,
							targetRes,
							codecSelection,
						);
						if (!compatibleMaster) break;
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
							const selectedCodecIdentity = _getBackupVariantCodecIdentity(
								compatibleMaster,
								streamUrl,
								encBaseUrl,
							);
							const selectedResolution = _getBackupVariantResolution(
								compatibleMaster,
								streamUrl,
								encBaseUrl,
							);
							const streamProbe = await _awaitBackupProbeBeforeDeadline(
								_fetchWithTimeout(realFetch, streamUrl),
								isExactEnhancedPass ? exactCodecProbeDeadlineAt : 0,
							);
							if (!searchIsCurrent()) {
								return { type: null, m3u8: null };
							}
							if (!streamProbe.completed) break;
							const streamRes = streamProbe.value;
							if (streamRes.status === 200) {
								const streamBodyProbe = await _awaitBackupProbeBeforeDeadline(
									streamRes.text(),
									isExactEnhancedPass ? exactCodecProbeDeadlineAt : 0,
								);
								if (!searchIsCurrent()) {
									return { type: null, m3u8: null };
								}
								if (!streamBodyProbe.completed) break;
								if (
									isExactEnhancedPass &&
									Date.now() >= exactCodecProbeDeadlineAt
								) {
									break;
								}
								const m3u8 = _absolutizeMediaPlaylistUrls(
									streamBodyProbe.value,
									streamUrl,
								);
								if (!searchIsCurrent()) {
									return { type: null, m3u8: null };
								}
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
									const autoplayWasDisabledDuringSearch = Boolean(
										pt === "autoplay" &&
											__TTVAB_STATE__.DisableAutoplayBackup &&
											info.ActiveBackupPlayerType !== "autoplay",
									);

									if (
										promotionPolicy.allowSelectedPromotion &&
										!autoplayWasDisabledDuringSearch
									) {
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
											const bridgedProbe =
												await _awaitBackupProbeBeforeDeadline(
													_refreshHeldAutoplayBackupPlaylist(
														info,
														realFetch,
														currentResolution,
														codecSelection,
														isExactEnhancedPass ? exactCodecProbeDeadlineAt : 0,
													),
													isExactEnhancedPass ? exactCodecProbeDeadlineAt : 0,
												);
											if (!searchIsCurrent()) {
												return { type: null, m3u8: null };
											}
											if (!bridgedProbe.completed) {
												break;
											}
											const bridged = bridgedProbe.value;
											if (bridged) {
												info._BackupProbation = {
													type: pt,
													at:
														isFreshM3u8 || probation?.type !== pt
															? Date.now()
															: probation.at,
													cleanChecks: isFreshM3u8 ? 1 : priorCleanHolds + 1,
												};
												if (__TTVAB_STATE__.DisableAutoplayBackup) {
													info._LastBackupSearchCompletedAt = 0;
												}
												_log(
													`[Trace] Fresh ${pt} session held for a second clean check; continuing clean autoplay bridge`,
													"info",
												);
												backupType = "autoplay";
												backupM3u8 = bridged;
												break;
											}
											if (isSessionNeutralCandidate) {
												info._BackupProbation = {
													type: pt,
													at:
														isFreshM3u8 || probation?.type !== pt
															? Date.now()
															: probation.at,
													cleanChecks: isFreshM3u8 ? 1 : priorCleanHolds + 1,
												};
												break;
											}
										}
										if (!searchIsCurrent()) {
											return { type: null, m3u8: null };
										}
										if (
											isExactEnhancedPass &&
											Date.now() >= exactCodecProbeDeadlineAt
										) {
											break;
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
										info.LastCleanBackupCodec = selectedCodecIdentity;
										_rememberBackupPlaylistMetadata(
											info,
											m3u8,
											selectedCodecFamily,
											selectedCodecIdentity,
										);
										info.LastCleanBackupAt = Date.now();
										_setBackupVariantResolution(info, selectedResolution);
										_log(
											`[Trace] Selected: ${pt} @ ${selectedResolution || "unknown"}`,
											"success",
										);
										break;
									}
									if (
										isDoingMinimalRequests &&
										candidateIsPlayable &&
										!candidateHasAds
									) {
										if (
											isExactEnhancedPass &&
											Date.now() >= exactCodecProbeDeadlineAt
										) {
											break;
										}
										_clearBackupPlayerRetryCooldown(info, pt);
										backupType = pt;
										backupM3u8 = m3u8;
										info.LastCleanBackupM3U8 = m3u8;
										info.LastCleanBackupPlayerType = pt;
										info.LastCleanBackupCodecFamily = selectedCodecFamily;
										info.LastCleanBackupCodec = selectedCodecIdentity;
										_rememberBackupPlaylistMetadata(
											info,
											m3u8,
											selectedCodecFamily,
											selectedCodecIdentity,
										);
										info.LastCleanBackupAt = Date.now();
										_setBackupVariantResolution(info, selectedResolution);
										_log(
											`[Trace] Selected (minimal): ${pt} @ ${selectedResolution || "unknown"}`,
											"success",
										);
										break;
									}
									if (!searchIsCurrent()) {
										return { type: null, m3u8: null };
									}
									_markBackupPlayerRetryCooldown(
										info,
										pt,
										promotionPolicy.reason,
									);
									if (isExactEnhancedPass) {
										failedExactCodecPlayerTypes.add(pt);
									}
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
									const canRetryWithoutViewerHeaders = Boolean(
										isFreshM3u8 &&
											!omitViewerHeaders &&
											pt !== "autoplay" &&
											!isExactEnhancedPass &&
											info?.MediaType !== "vod" &&
											!String(info?.MediaKey || "").startsWith("vod:") &&
											cycleStartedAt > 0 &&
											promotionPolicy.reason === "not-playable" &&
											!candidateHasAds &&
											(__TTVAB_STATE__?.AuthorizationHeader ||
												__TTVAB_STATE__?.ClientIntegrityHeader) &&
											_shouldBridgeHeldAutoplayDuringSearch(info) &&
											Math.max(
												0,
												Number(
													info.LastSessionNeutralBackupProbeCycleStartedAt,
												) || 0,
											) !== cycleStartedAt,
									);
									if (canRetryWithoutViewerHeaders) {
										retryWithoutViewerHeaders = true;
										_log(
											`[Trace] Retrying ${pt} without viewer headers after an empty media playlist`,
											"info",
										);
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
								if (isExactEnhancedPass) {
									failedExactCodecPlayerTypes.add(pt);
								}
								invalidateCache = true;
							}
						} else {
							_log(`No stream URL for ${pt}`, "warning");
							_markBackupPlayerRetryCooldown(info, pt, "no-stream-url");
							if (isExactEnhancedPass) {
								failedExactCodecPlayerTypes.add(pt);
							}
							invalidateCache = true;
						}
					} catch (e) {
						if (!searchIsCurrent()) {
							return { type: null, m3u8: null };
						}
						_log(`Stream error: ${e.message}`, "warning");
						_markBackupPlayerRetryCooldown(info, pt, "stream-error");
						if (isExactEnhancedPass) {
							failedExactCodecPlayerTypes.add(pt);
						}
						info._BackupSearchErrorCount =
							(info._BackupSearchErrorCount || 0) + 1;
						invalidateCache = true;
					}
				}

				if (invalidateCache) {
					if (!searchIsCurrent()) {
						return { type: null, m3u8: null };
					}
					if (info.BackupEncodingsM3U8Cache[pt] === activeCacheEntry) {
						info.BackupEncodingsM3U8Cache[pt] = null;
					}
				}
				if (isFreshM3u8 && !retryWithoutViewerHeaders) break;
			}
		}
	}

	if (!searchIsCurrent()) return { type: null, m3u8: null };
	if (foregroundQualityProbeAt > 0 && !foregroundQualityProbeAttempted) {
		info._ForegroundQualityProbeAppliedAt = foregroundQualityProbeAt;
	}
	if (backupM3u8) {
		info._BackupSearchCount = (info._BackupSearchCount || 0) + 1;
	} else {
		info._BackupSearchFailCount = (info._BackupSearchFailCount || 0) + 1;
	}

	return { type: backupType, m3u8: backupM3u8 };
}
