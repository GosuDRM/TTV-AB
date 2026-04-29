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
	info.FailedBackupPlayerTypes?.clear?.();
	info.ActiveBackupPlayerType = null;
	info.ActiveBackupResolution = null;
	info.IsMidroll = false;
	info.IsStrippingAdSegments = false;
	info.NumStrippedAdSegments = 0;
	info.PendingAdEndAt = 0;
	info.CleanPlaylistCount = 0;
	info.AdEndMarkerBounceLogged = false;
	info.AdEndBounceCount = 0;
	info.VisibleAdStartedAt = 0;
	info.IsHoldingBackupAfterAd = false;
	info.SilentBackupHoldStartedAt = 0;
	info.LastSilentBackupHoldLogAt = 0;
	info.LastAdEndReloadAt = 0;
	info.LastNativeRecoveryHoldLogAt = 0;
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
		default:
			return 3000;
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

function _getOrderedBackupPlayerTypes(info, startIdx = 0) {
	const configuredPlayerTypes = [...(__TTVAB_STATE__?.BackupPlayerTypes || [])];
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
	pushUnique(activePlayerType);
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

async function _isAdEndStable(info, realFetch, resolution = null) {
	if (!info?.IsShowingAd) return "ended";

	const now = Date.now();
	if (!info.PendingAdEndAt) {
		info.PendingAdEndAt = now;
		info.CleanPlaylistCount = 0;
		info.AdEndMarkerBounceLogged = false;
		info.AdEndBounceCount = 0;
		_log("[Trace] Candidate ad end detected", "info");
	}

	info.CleanPlaylistCount =
		Math.max(0, Math.trunc(Number(info.CleanPlaylistCount) || 0)) + 1;

	const elapsed = now - info.PendingAdEndAt;
	const graceMs = _getResolvedAdEndGraceMs();
	const minCleanPlaylists = _getResolvedAdEndMinCleanPlaylists();
	const maxWaitMs = _getResolvedAdEndMaxWaitMs();

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
	if (hasNativeRecoveryReady) {
		return "ended";
	}

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
			if (backupHoldMaxMs > 0 && visibleAdElapsed >= backupHoldMaxMs) {
				info.IsHoldingBackupAfterAd = true;
				info.SilentBackupHoldStartedAt = now;
				info.LastSilentBackupHoldLogAt = now;
				_log(
					"[Trace] Native recovery still ad-marked after extended backup hold; ending visible ad cycle and keeping clean backup stream",
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
				_log(
					"[Trace] Native recovery still ad-marked after max wait; holding clean backup stream",
					"warning",
				);
			}
			return "wait";
		}

		_log(
			"[Trace] Native recovery still ad-marked after max wait; forcing ad end to prevent offline state",
			"warning",
		);
		return "ended";
	}

	return "wait";
}

function _resetNativeRecoveryReadyState(info, preserveProbeAt = false) {
	if (!info) return;
	if (!preserveProbeAt) {
		info.LastNativeRecoveryProbeAt = 0;
	}
	info.LastNativeRecoveryReadyPlayerType = null;
	info.NativeRecoveryCleanCount = 0;
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
	const aliases = new Set<string>();
	const pushAlias = (value) => {
		if (typeof value !== "string") return;
		const trimmed = value.trimEnd();
		if (!trimmed) return;
		aliases.add(trimmed);
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

	return [...aliases];
}

function _getStreamInfoForPlaylist(url) {
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

function _getNativeRecoveryProbePlayerType() {
	const forcedPlayerType =
		__TTVAB_STATE__?.RewriteNativePlaybackAccessToken === true &&
		typeof __TTVAB_STATE__?.ForceAccessTokenPlayerType === "string" &&
		__TTVAB_STATE__.ForceAccessTokenPlayerType.trim()
			? __TTVAB_STATE__.ForceAccessTokenPlayerType.trim()
			: null;

	return (
		forcedPlayerType ||
		__TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType ||
		"site"
	);
}

async function _canReloadNativePlayerAfterAd(
	info,
	realFetch,
	resolution = null,
) {
	if (!info?.IsUsingBackupStream && !info?.IsUsingFallbackStream) {
		_resetNativeRecoveryReadyState(info);
		return true;
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

	try {
		const tokenRes = await _getToken(info, nativePlayerType, realFetch);
		if (tokenRes.status !== 200) {
			_resetNativeRecoveryReadyState(info, true);
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
			_log(
				`[Trace] Native recovery probe missing token parts for ${nativePlayerType}`,
				"warning",
			);
			return false;
		}

		const usherUrl = _buildUsherPlaybackUrl(info, sig, tokenValue);
		if (!usherUrl) {
			_resetNativeRecoveryReadyState(info, true);
			return false;
		}

		const encRes = await realFetch(usherUrl.href);
		if (encRes.status !== 200) {
			_resetNativeRecoveryReadyState(info, true);
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
			return false;
		}

		const streamRes = await realFetch(streamUrl);
		if (streamRes.status !== 200) {
			_resetNativeRecoveryReadyState(info, true);
			_log(
				`[Trace] Native recovery stream failed for ${nativePlayerType}: ${streamRes.status}`,
				"warning",
			);
			return false;
		}

		const nativeM3u8 = await streamRes.text();
		const nativeHasAds =
			_hasPlaylistAdMarkers(nativeM3u8) ||
			_hasExplicitAdMetadata(nativeM3u8) ||
			_playlistHasKnownAdSegments(nativeM3u8, {
				includeCached: false,
			});

		if (nativeHasAds) {
			_resetNativeRecoveryReadyState(info, true);
			_log(
				`[Trace] Native recovery still ad-marked (${nativePlayerType})`,
				"warning",
			);
			return false;
		}

		const readyCount = _markNativeRecoveryReady(info, nativePlayerType);
		if (readyCount < requiredCleanProbes) {
			_log(
				`[Trace] Native recovery ready (${nativePlayerType}) ${readyCount}/${requiredCleanProbes}`,
				"info",
			);
			return false;
		}

		_log(`[Trace] Native recovery ready (${nativePlayerType})`, "success");
		return true;
	} catch (err) {
		_resetNativeRecoveryReadyState(info, true);
		_log(
			`[Trace] Native recovery probe error for ${nativePlayerType}: ${err.message}`,
			"warning",
		);
		return false;
	}
}

function _createSyntheticStreamInfo(playbackContext, url = "") {
	const normalizedContext = _normalizePlaybackContext(playbackContext);
	if (!normalizedContext.MediaKey) return null;

	const info = {
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
		FailedBackupPlayerTypes: new Map(),
		Urls: Object.create(null),
		ResolutionList: [],
		BackupEncodingsM3U8Cache: Object.create(null),
		ActiveBackupPlayerType: null,
		ActiveBackupResolution: null,
		LastCleanNativeM3U8: null,
		LastCleanNativePlaylistAt: 0,
		LastCleanBackupM3U8: null,
		LastCleanBackupPlayerType: null,
		LastCleanBackupAt: 0,
		IsMidroll: false,
		IsStrippingAdSegments: false,
		NumStrippedAdSegments: 0,
		PendingAdEndAt: 0,
		CleanPlaylistCount: 0,
		AdEndMarkerBounceLogged: false,
		AdEndBounceCount: 0,
		VisibleAdStartedAt: 0,
		IsHoldingBackupAfterAd: false,
		SilentBackupHoldStartedAt: 0,
		LastSilentBackupHoldLogAt: 0,
		LastNativeRecoveryProbeAt: 0,
		BackupVariantUrls: new Set(),
		LastNativeRecoveryReadyPlayerType: null,
		NativeRecoveryCleanCount: 0,
		LastAdEndReloadAt: 0,
		LastNativeRecoveryHoldLogAt: 0,
		LastActivityAt: Date.now(),
	};

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
		__TTVAB_STATE__.HasTriggeredPlayerReload = false;
		__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
		__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
		__TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
		info.LastPlayerReload = Date.now();
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
			info.IsHoldingBackupAfterAd = false;
			info.SilentBackupHoldStartedAt = 0;
			info.LastSilentBackupHoldLogAt = 0;
			info.IsUsingBackupStream = false;
			info.ActiveBackupPlayerType = null;
			info.ActiveBackupResolution = null;
			_resetNativeRecoveryReadyState(info);
			_log(
				"[Trace] Native playlist clean after silent backup hold; restoring native stream",
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
					}),
				);
			}
		}
	}

	if (hasAds) {
		if (info.IsHoldingBackupAfterAd) {
			if (info.LastCleanBackupM3U8) {
				const now = Date.now();
				const res = _resolvePlaybackResolutionForUrl(info, url);
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
				const backupAgeMs = now - (Number(info.LastCleanBackupAt) || 0);
				if (backupAgeMs >= 1500) {
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
			const res = _resolvePlaybackResolutionForUrl(info, url);
			const heldBackupM3U8 = info.LastCleanBackupM3U8;
			const heldBackupPlayerType =
				info.LastCleanBackupPlayerType || info.ActiveBackupPlayerType || null;
			_resetStreamAdState(info);
			info.IsHoldingBackupAfterAd = true;
			info.SilentBackupHoldStartedAt = adEndedAt;
			info.LastSilentBackupHoldLogAt = adEndedAt;
			info.IsUsingBackupStream = true;
			info.ActiveBackupPlayerType = heldBackupPlayerType;
			info.ActiveBackupResolution = res?.Resolution || null;
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
				info.AdEndBounceCount = 0;
			} else {
				info.AdEndBounceCount = (Number(info.AdEndBounceCount) || 0) + 1;
			}
			info.CleanPlaylistCount = 0;
			info.AdEndMarkerBounceLogged = false;
			info.LastNativeRecoveryHoldLogAt = 0;
			_resetNativeRecoveryReadyState(info);
			_log("[Trace] Ad markers returned before ad-end stabilized", "info");
		}

		info.IsMidroll = text.includes('"MIDROLL"') || text.includes('"midroll"');

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
					try {
						realFetch(mediaUrl)
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
			__TTVAB_STATE__.CurrentAdChannel = info.ChannelName;
			__TTVAB_STATE__.CurrentAdMediaKey = info.MediaKey;
			__TTVAB_STATE__.LastAdDetectedAt = now;
			info.FailedBackupPlayerTypes?.clear?.();
			if (!isContinuingAdCycle) {
				_incrementAdsBlocked(info.ChannelName, info.MediaKey);
			}
			if (isRecentAdEndReentry) {
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
			!__TTVAB_STATE__.SkipPlayerReloadOnHevc &&
			info.ModifiedM3U8 &&
			!info.IsUsingModifiedM3U8
		) {
			info.IsUsingModifiedM3U8 = true;
			info.LastPlayerReload = Date.now();
			if (typeof self !== "undefined" && self.postMessage) {
				_postWorkerBridgeMessage(
					self,
					_createPageScopedWorkerEvent({
						key: "ReloadPlayer",
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
						refreshAccessToken: true,
					}),
				);
			}
		}

		let startIdx = 0;
		if (
			info.LastPlayerReload >
			Date.now() - __TTVAB_STATE__.PlayerReloadMinimalRequestsTime
		) {
			startIdx = __TTVAB_STATE__.PlayerReloadMinimalRequestsPlayerIndex;
		}

		let {
			type: backupType,
			m3u8: backupM3u8,
			isFallback,
		} = await _findBackupStream(info, realFetch, startIdx, res);

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

		info.ActiveBackupResolution = res?.Resolution || null;
		if (backupType) {
			__TTVAB_STATE__.PinnedBackupPlayerType = backupType;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = info.ChannelName || null;
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey = info.MediaKey || null;
		}
		if (info.ActiveBackupPlayerType !== backupType) {
			info.ActiveBackupPlayerType = backupType;
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

		const stripHevc = isHevc && info.ModifiedM3U8;
		if (__TTVAB_STATE__.IsAdStrippingEnabled || stripHevc) {
			text = _stripAds(text, stripHevc, info);
		}
	} else if (info.IsShowingAd) {
		const res = _resolvePlaybackResolutionForUrl(info, url);
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
			if (info.LastCleanBackupM3U8 && backupAgeMs >= 1500) {
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
			info.ActiveBackupResolution = res?.Resolution || null;
		}
		_rememberLastAdEnd(info, adEndedAt);
		__TTVAB_STATE__.CurrentAdChannel = null;
		__TTVAB_STATE__.CurrentAdMediaKey = null;
		__TTVAB_STATE__.PinnedBackupPlayerType = null;
		__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
		__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
		if (typeof self !== "undefined" && self.postMessage) {
			const shouldReloadPlayer = Boolean(
				!isSilentBackupHoldEnd &&
					(wasUsingModifiedM3U8 || _C?.RELOAD_AFTER_AD !== false),
			);
			const shouldPauseResumePlayer = Boolean(
				!isSilentBackupHoldEnd &&
					!shouldReloadPlayer &&
					!wasUsingBackupStream &&
					!wasUsingFallbackStream &&
					hadStrippedAdSegments,
			);
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
				_postWorkerBridgeMessage(
					self,
					_createPageScopedWorkerEvent({
						key: "ReloadPlayer",
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
						reason: "post-ad",
						refreshAccessToken: false,
						newMediaPlayerInstance: false,
					}),
				);
			} else if (shouldPauseResumePlayer) {
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
	const base = {
		allowSelectedPromotion: false,
		allowFallbackPromotion: false,
		reason: "deny-by-default",
	};

	if (!candidateIsPlayable) {
		return { ...base, reason: "not-playable" };
	}
	if (candidateHasAds) {
		return {
			allowSelectedPromotion: false,
			allowFallbackPromotion: true,
			reason: "ad-marked",
		};
	}
	if (!simulatedAdsDepthSatisfied) {
		return { ...base, reason: "simulated-ads-depth" };
	}

	return {
		allowSelectedPromotion: true,
		allowFallbackPromotion: true,
		reason: "clean-playable",
	};
}

async function _findBackupStream(
	info,
	realFetch,
	startIdx = 0,
	currentResolution = null,
) {
	let backupType = null;
	let backupM3u8 = null;
	let fallbackM3u8 = null;
	let fallbackType = null;

	const playerTypes = _getOrderedBackupPlayerTypes(info, startIdx);
	const playerTypesLen = playerTypes.length;
	const isDoingMinimalRequests =
		startIdx > 0 &&
		playerTypes.every(
			(playerType) =>
				(__TTVAB_STATE__?.BackupPlayerTypes || []).indexOf(playerType) >=
				startIdx,
		);
	const targetRes =
		currentResolution ||
		_getFallbackResolution(info, "") ||
		info?.ResolutionList?.[0] ||
		(typeof __TTVAB_STATE__?.PreferredQualityGroup === "string" &&
		__TTVAB_STATE__.PreferredQualityGroup.trim()
			? { Name: __TTVAB_STATE__.PreferredQualityGroup.trim() }
			: null);

	for (let pi = 0; !backupM3u8 && pi < playerTypesLen; pi++) {
		const pt = playerTypes[pi];
		const realPt = pt.replace("-CACHED", "");
		const isFullyCachedPlayerType = pt !== realPt;
		const configuredPlayerTypeIndex = Math.max(
			0,
			(__TTVAB_STATE__?.BackupPlayerTypes || []).indexOf(realPt),
		);
		if (_isBackupPlayerRetryCoolingDown(info, pt)) {
			_log(`[Trace] Cooling down: ${pt}`, "info");
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
					const tokenRes = await _getToken(info, realPt, realFetch);
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
							const encRes = await realFetch(usherUrl.href);
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
								_log(
									`[Trace] Whitelisted variants for ${pt} (Total: ${info.BackupVariantUrls.size})`,
								);
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
				}
			}

			if (enc) {
				try {
					const streamUrl = _getStreamUrl(enc, targetRes, encBaseUrl);
					if (streamUrl) {
						const streamRes = await realFetch(streamUrl);
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
												allowFallbackPromotion: false,
												reason: "policy-unavailable",
											};
								const canPromoteFallback =
									promotionPolicy.allowFallbackPromotion &&
									(!fallbackM3u8 ||
										pt === __TTVAB_STATE__.FallbackPlayerType ||
										fallbackType !== __TTVAB_STATE__.FallbackPlayerType);
								if (canPromoteFallback) {
									fallbackM3u8 = m3u8;
									fallbackType = pt;
								}

								if (promotionPolicy.allowSelectedPromotion) {
									_clearBackupPlayerRetryCooldown(info, pt);
									backupType = pt;
									backupM3u8 = m3u8;
									info.LastCleanBackupM3U8 = m3u8;
									info.LastCleanBackupPlayerType = pt;
									info.LastCleanBackupAt = Date.now();
									_log(`[Trace] Selected: ${pt}`, "success");
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
									_log(`[Trace] Selected (minimal): ${pt}`, "success");
									break;
								}
								_markBackupPlayerRetryCooldown(
									info,
									pt,
									promotionPolicy.reason,
								);
								if (isFullyCachedPlayerType) {
									_log(
										`[Trace] Rejected ${pt} (${promotionPolicy.reason})`,
										"warning",
									);
									break;
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
					invalidateCache = true;
				}
			}

			if (invalidateCache) {
				info.BackupEncodingsM3U8Cache[pt] = null;
			}
			if (isFreshM3u8) break;
		}
	}

	let isFallback = false;
	if (!backupM3u8 && fallbackM3u8) {
		backupType = fallbackType || __TTVAB_STATE__.FallbackPlayerType;
		backupM3u8 = fallbackM3u8;
		isFallback = true;
		info.LastCleanBackupM3U8 = backupM3u8;
		info.LastCleanBackupPlayerType = backupType;
		info.LastCleanBackupAt = Date.now();
		_log(`[Trace] Using fallback: ${backupType}`, "warning");
	}

	return { type: backupType, m3u8: backupM3u8, isFallback };
}
