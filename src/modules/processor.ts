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
	info._EmptyAdHoldMediaSequence = 0;
	info._SpliceStreamId = null;
	info._SpliceBoundarySeq = null;
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
	const preferredPlayerType = _getPinnedBackupPlayerTypeForInfo(info);
	const activePlayerType =
		typeof info?.ActiveBackupPlayerType === "string" &&
		info.ActiveBackupPlayerType
			? info.ActiveBackupPlayerType
			: null;
	const safeStartIdx = Math.max(
		0,
		Math.min(configuredPlayerTypes.length, Number(startIdx) || 0),
	);

	pushUnique(preferredPlayerType);
	if (_shouldTryAutoplayFirst(info)) {
		pushUnique("autoplay");
	}
	pushUnique(_getRecentCleanBackupPlayerTypeForInfo(info));
	if (
		activePlayerType !== "autoplay" ||
		_shouldTryAutoplayFirst(info) ||
		_shouldHoldAutoplayBackupDuringAd(info)
	) {
		pushUnique(activePlayerType);
	}
	for (const playerType of configuredPlayerTypes.slice(safeStartIdx)) {
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
	const urlResolution = _resolvePlaybackResolutionForUrl(info, url);
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
	if (!info?.IsShowingAd) return "ended";

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

	const hasNativeRecoveryReady = await _canReloadNativePlayerAfterAd(
		info,
		realFetch,
		resolution,
	);
	if (!info.IsShowingAd) {
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
				info.IsHoldingBackupAfterAd = true;
				info.SilentBackupHoldStartedAt = now;
				info.LastSilentBackupHoldLogAt = now;
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
		for (const key in __TTVAB_STATE__.StreamInfosByUrl) {
			try {
				const info = __TTVAB_STATE__.StreamInfosByUrl[key];
				if (currentPageMediaKey && info?.MediaKey !== currentPageMediaKey) {
					continue;
				}
				const storedUrl = new URL(key);
				if (storedUrl.hostname === hostname) {
					return info;
				}
			} catch {}
		}
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
		MeasuredAdIds: new Set(),
		_SecondsReportedForCycle: 0,
		FailedBackupPlayerTypes: new Map(),
		Urls: Object.create(null),
		ResolutionList: [],
		BackupEncodingsM3U8Cache: Object.create(null),
		ActiveBackupPlayerType: null,
		ActiveBackupResolution: null,
		SustainedNativeResolution: null,
		SustainedNativeResolutionAt: 0,
		LastCleanNativeM3U8: null,
		LastCleanNativePlaylistAt: 0,
		LastCleanBackupM3U8: null,
		LastCleanBackupPlayerType: null,
		LastCleanBackupAt: 0,
		IsMidroll: false,
		CsaiOnlyThisBreak: false,
		IsStrippingAdSegments: false,
		NumStrippedAdSegments: 0,
		PendingAdEndAt: 0,
		CleanPlaylistCount: 0,
		AdEndMarkerBounceLogged: false,
		AdEndConfirmEscalation: 0,
		VisibleAdStartedAt: 0,
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

async function _processM3U8(url, text, realFetch) {
	const result = await _processM3U8Core(url, text, realFetch);
	const info = _getStreamInfoForPlaylist(url);
	return info ? _applyBackupSpliceBridge(info, result) : result;
}

async function _processM3U8Core(url, text, realFetch) {
	text = _absolutizeMediaPlaylistUrls(text, url);

	let info = _getStreamInfoForPlaylist(url);
	if (!info) {
		if (
			!_hasPlaylistAdMarkers(text) &&
			!_playlistHasKnownAdSegments(text, { includeCached: false }) &&
			__TTVAB_STATE__.SimulatedAdsDepth === 0
		) {
			return text;
		}
		info = _createSyntheticStreamInfo(
			_getSyntheticPlaybackContextForPlaylist(url),
			url,
		);
		if (!info) return text;
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

	if (!hasAds && hasMediaSegments && !info.IsShowingAd) {
		info.LastCleanNativeM3U8 = text;
		info.LastCleanNativePlaylistAt = Date.now();
		if (info.IsHoldingBackupAfterAd) {
			const restoredAt = Date.now();
			const requiresReload = Boolean(info.HevcReloadPendingAfterHold);
			info.IsHoldingBackupAfterAd = false;
			info.SilentBackupHoldStartedAt = 0;
			info.LastSilentBackupHoldLogAt = 0;
			info.IsUsingBackupStream = false;
			info.ActiveBackupPlayerType = null;
			info.ActiveBackupResolution = null;
			info.HevcReloadPendingAfterHold = false;
			_resetNativeRecoveryReadyState(info);
			_rememberLastAdEnd(info, Date.now());
			_log(
				requiresReload
					? "[Trace] Native playlist clean after silent backup hold; reloading player after backup hold"
					: "[Trace] Native playlist clean after silent backup hold; restoring native stream",
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
		}
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
		_notifyAdComplete(text, info).catch(() => {});
		if (typeof _recordAdDurations === "function") {
			_recordAdDurations(text, info);
		}
		if (info.IsHoldingBackupAfterAd) {
			const holdElapsed =
				Date.now() - Math.max(0, Number(info.SilentBackupHoldStartedAt) || 0);
			if (holdElapsed >= _getResolvedSilentBackupHoldMaxMs()) {
				_log(
					"[Trace] Silent backup hold max duration reached; exiting hold to restore native stream",
					"warning",
				);
				info.IsHoldingBackupAfterAd = false;
				info.SilentBackupHoldStartedAt = 0;
				info.LastSilentBackupHoldLogAt = 0;
				info.IsUsingBackupStream = false;
				info.ActiveBackupPlayerType = null;
				info.ActiveBackupResolution = null;
				info.HevcReloadPendingAfterHold = false;
				_rememberLastAdEnd(info, Date.now());
			}
		}

		if (info.IsHoldingBackupAfterAd) {
			if (info.LastCleanBackupM3U8) {
				const now = Date.now();
				const res = _resolveAdBackupTargetResolution(info, url);
				const lastLogAt = Math.max(
					0,
					Number(info.LastSilentBackupHoldLogAt) || 0,
				);
				if (now - lastLogAt >= 15000) {
					info.LastSilentBackupHoldLogAt = now;
					_log(
						"[Trace] Native playlist still ad-marked during silent backup hold; continuing clean backup stream",
						"warning",
					);
				}
				const forceRefreshAt =
					Number(__TTVAB_STATE__?.BackupSearchForceRefreshAt) || 0;
				const stalledDuringHold = forceRefreshAt > 0;
				if (stalledDuringHold) {
					__TTVAB_STATE__.BackupSearchForceRefreshAt = 0;
					const stalledType =
						info.ActiveBackupPlayerType ||
						info.LastCleanBackupPlayerType ||
						null;
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
			_rememberLastAdEnd(info, Date.now());
			_log(
				"[Trace] Silent backup hold lost cached backup; resuming visible ad recovery",
				"warning",
			);
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
			const res = _resolveAdBackupTargetResolution(info, url);
			const heldBackupM3U8 = info.LastCleanBackupM3U8;
			const heldBackupPlayerType =
				info.LastCleanBackupPlayerType || info.ActiveBackupPlayerType || null;
			const { wasUsingModifiedM3U8: heldWasModified } =
				_resetStreamAdState(info);
			info.IsHoldingBackupAfterAd = true;
			info.SilentBackupHoldStartedAt = adEndedAt;
			info.LastSilentBackupHoldLogAt = adEndedAt;
			info.IsUsingBackupStream = true;
			info.ActiveBackupPlayerType = heldBackupPlayerType;
			info.ActiveBackupResolution = res?.Resolution || null;
			info.HevcReloadPendingAfterHold =
				heldWasModified || heldBackupPlayerType === "autoplay";
			_rememberLastAdEnd(info, adEndedAt);
			__TTVAB_STATE__.CurrentAdChannel = null;
			__TTVAB_STATE__.CurrentAdMediaKey = null;
			__TTVAB_STATE__.PinnedBackupPlayerType = null;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
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
						endedAt: adEndedAt,
						willReload: false,
						holdingBackup: true,
					}),
				);
			}
			return heldBackupM3U8;
		}

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

		const res = _resolvePlaybackResolutionForUrl(info, url);
		if (!res) {
			_log(
				`Missing resolution info for ${url}; using generic fallback`,
				"warning",
			);
		}

		const isHevc =
			res?.Codecs?.[0] === "h" &&
			(res?.Codecs?.[1] === "e" || res?.Codecs?.[1] === "v");
		if (
			isHevc &&
			!info.IsShowingAd &&
			info.ModifiedM3U8 &&
			(!__TTVAB_STATE__.PlayerHasPlayedOnce ||
				__TTVAB_STATE__.PlayerIsPlaying !== true)
		) {
			_log(
				"[Trace] Deferring HEVC ad-block until active playback resumes",
				"info",
			);
			return text;
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

		if (!info.IsShowingAd) {
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

			info.IsShowingAd = true;
			info.VisibleAdStartedAt = now;
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
					}),
				);
			}
		}

		if (info.IsUsingFallbackStream) {
			text = _stripAds(text, false, info);
			return text;
		}

		if (
			isHevc &&
			!__TTVAB_STATE__.SkipPlayerReloadOnHevc &&
			info.ModifiedM3U8 &&
			!info.IsUsingModifiedM3U8 &&
			!_isRecentPostAdReentry(info)
		) {
			const cleanNativeAgeMs =
				Date.now() - (Number(info.LastCleanNativePlaylistAt) || 0);
			const cleanNativeM3U8 =
				typeof info.LastCleanNativeM3U8 === "string" &&
				info.LastCleanNativeM3U8 &&
				cleanNativeAgeMs >= 0 &&
				cleanNativeAgeMs <= 10000 &&
				!_hasPlaylistAdMarkers(info.LastCleanNativeM3U8) &&
				!_playlistHasKnownAdSegments(info.LastCleanNativeM3U8, {
					includeCached: false,
				})
					? info.LastCleanNativeM3U8
					: null;
			if (cleanNativeM3U8) {
				info.IsUsingModifiedM3U8 = true;
			}
			info.LastPlayerReload = Date.now();
			if (typeof self !== "undefined" && self.postMessage) {
				_postWorkerBridgeMessage(
					self,
					_createPageScopedWorkerEvent({
						key: "ReloadPlayer",
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
						refreshAccessToken: true,
						newMediaPlayerInstance: true,
					}),
				);
			}
			_log(
				cleanNativeM3U8
					? "[Trace] Reloading before HEVC backup handoff; holding clean native playlist for current request"
					: "[Trace] Reloading before HEVC backup handoff; no clean native hold available",
				"info",
			);
			return cleanNativeM3U8 || text;
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
			typeof info.LastCleanNativeM3U8 === "string" &&
			info.LastCleanNativeM3U8 &&
			Date.now() - (Number(info.LastCleanNativePlaylistAt) || 0) <= 2000 &&
			!_hasPlaylistAdMarkers(info.LastCleanNativeM3U8);
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
				"[Trace] Pre-warmed backup ready during native bridge; serving backup early",
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
				return text;
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

		const stripHevc = isHevc && info.ModifiedM3U8;
		if (__TTVAB_STATE__.IsAdStrippingEnabled || stripHevc) {
			text = _stripAds(text, stripHevc, info);
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
		const {
			wasUsingModifiedM3U8,
			wasUsingFallbackStream,
			wasUsingBackupStream,
			hadStrippedAdSegments,
		} = _resetStreamAdState(info);
		if (isSilentBackupHoldEnd && heldBackupM3U8) {
			info.IsHoldingBackupAfterAd = true;
			info.SilentBackupHoldStartedAt = adEndedAt;
			info.LastSilentBackupHoldLogAt = adEndedAt;
			info.IsUsingBackupStream = true;
			info.ActiveBackupPlayerType = heldBackupPlayerType;
			info.ActiveBackupResolution =
				(_resolvePreferredBackupResolution(info) || res)?.Resolution || null;
			info.HevcReloadPendingAfterHold =
				wasUsingModifiedM3U8 || heldBackupPlayerType === "autoplay";
		}
		__TTVAB_STATE__.CurrentAdChannel = null;
		__TTVAB_STATE__.CurrentAdMediaKey = null;
		__TTVAB_STATE__.PinnedBackupPlayerType = null;
		__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
		__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
		if (typeof self !== "undefined" && self.postMessage) {
			const shouldUseHevcReload = Boolean(wasUsingModifiedM3U8);
			const recentMidrollChain =
				info.LastAdEndReloadAt > 0 &&
				adEndedAt - info.LastAdEndReloadAt < 30000;
			if (recentMidrollChain && info.LastAdEndReloadKind === "post-escape") {
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
					!recentMidrollChain &&
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
							!recentMidrollChain),
				);
				shouldPauseResumePlayer = Boolean(
					!shouldReloadPlayer && !wasUsingFallbackStream,
				);
			}
			if (!recentMidrollChain) {
				info.PostEscapeReloadCounterproductive = false;
			}
			_postWorkerBridgeMessage(
				self,
				_createPageScopedWorkerEvent({
					key: "AdEnded",
					channel: info.ChannelName,
					mediaKey: info.MediaKey,
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

	const targetRes = _applyBackupResolutionFloor(
		_getFallbackResolution(info, "") ||
			info?.ResolutionList?.[0] ||
			(typeof __TTVAB_STATE__?.PreferredQualityGroup === "string" &&
			__TTVAB_STATE__.PreferredQualityGroup.trim()
				? { Name: __TTVAB_STATE__.PreferredQualityGroup.trim() }
				: null),
		info?.ResolutionList,
	);
	const streamUrl = _getStreamUrl(enc, targetRes, encBaseUrl);
	if (!streamUrl) return null;

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
		info.LastCleanBackupAt = Date.now();
		return m3u8;
	} catch {
		return null;
	}
}

async function _findBackupStream(
	info,
	realFetch,
	startIdx = 0,
	currentResolution = null,
) {
	if (info?._BackupSearchPromise) {
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
	if (_shouldHoldAutoplayBackupDuringAd(info)) {
		playerTypes = ["autoplay"];
		_log(
			"[Trace] Holding autoplay backup during LQ dwell; deferring HQ probe briefly",
			"info",
		);
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
					const streamUrl = _getStreamUrl(enc, targetRes, encBaseUrl);
					if (streamUrl) {
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
									_clearBackupPlayerRetryCooldown(info, pt);
									backupType = pt;
									backupM3u8 = m3u8;
									info.LastCleanBackupM3U8 = m3u8;
									info.LastCleanBackupPlayerType = pt;
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
								if (promotionPolicy.reason === "ad-marked") {
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
