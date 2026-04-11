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
	info.RequestedAds.clear();
	info.BackupVariantUrls?.clear?.();
	info.FailedBackupPlayerTypes?.clear?.();
	info.BackupEncodingsM3U8Cache = Object.create(null);
	info.ActiveBackupPlayerType = null;
	info.ActiveBackupResolution = null;
	info.LastCleanBackupM3U8 = null;
	info.LastCleanBackupPlayerType = null;
	info.LastCleanBackupAt = 0;
	info.IsMidroll = false;
	info.IsStrippingAdSegments = false;
	info.NumStrippedAdSegments = 0;
	info.PendingAdEndAt = 0;
	info.CleanPlaylistCount = 0;
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

function _getForcedAdEndReentryWindowMs() {
	return Math.max(
		0,
		Number(_C?.FORCED_AD_END_REENTRY_WINDOW_MS) || 0,
	);
}

function _markForcedAdEndReload(info) {
	if (!info) return 0;
	const now = Date.now();
	info.LastForcedAdEndReloadAt = now;
	return now;
}

function _isForcedAdEndReloadContinuation(info) {
	if (!info?.LastForcedAdEndReloadAt) return false;
	const windowMs = _getForcedAdEndReentryWindowMs();
	if (!windowMs) return false;
	return Date.now() - info.LastForcedAdEndReloadAt <= windowMs;
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
		case "ad-marked":
		default:
			return 3000;
	}
}

function _markBackupPlayerRetryCooldown(info, playerType, reason = "ad-marked") {
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
	if (!info?.IsShowingAd) return true;

	const now = Date.now();
	if (!info.PendingAdEndAt) {
		info.PendingAdEndAt = now;
		info.CleanPlaylistCount = 0;
		_log("[Trace] Candidate ad end detected", "info");
	}

	info.CleanPlaylistCount =
		Math.max(0, Math.trunc(Number(info.CleanPlaylistCount) || 0)) + 1;
	if (info.CleanPlaylistCount < _getResolvedAdEndMinCleanPlaylists()) {
		return false;
	}

	if (now - info.PendingAdEndAt < _getResolvedAdEndGraceMs()) {
		return false;
	}

	if (now - info.PendingAdEndAt >= _getResolvedAdEndMaxWaitMs()) {
		_markForcedAdEndReload(info);
		_resetNativeRecoveryReadyState(info);
		_log("[Trace] Forcing native recovery reload after ad-end wait budget", "warning");
		return true;
	}

	return _canReloadNativePlayerAfterAd(info, realFetch, resolution);
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

function _shouldReloadNativePlayerAfterAdReset(
	{
		wasUsingModifiedM3U8,
		wasUsingFallbackStream,
		wasUsingBackupStream,
		hadStrippedAdSegments,
	}: {
		wasUsingModifiedM3U8?: boolean;
		wasUsingFallbackStream?: boolean;
		wasUsingBackupStream?: boolean;
		hadStrippedAdSegments?: boolean;
	} = {},
) {
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
	} catch { }

	return [...aliases];
}

function _getStreamInfoForPlaylist(url) {
	for (const alias of _getPlaylistUrlAliases(url)) {
		const byUrl = __TTVAB_STATE__.StreamInfosByUrl[alias];
		if (byUrl) return byUrl;
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
	const adSignifier =
		typeof __TTVAB_STATE__?.AdSignifier === "string" &&
			__TTVAB_STATE__.AdSignifier.trim()
			? __TTVAB_STATE__.AdSignifier.trim()
			: "stitched";
	return (
		typeof text === "string" &&
		(text.includes(adSignifier) ||
			text.includes("X-TV-TWITCH-AD") ||
			text.includes("stitched") ||
			text.includes("stitched-ad") ||
			text.includes("/adsquared/") ||
			text.includes("SCTE35-OUT") ||
			text.includes('"MIDROLL"') ||
			text.includes('"midroll"'))
	);
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

async function _canReloadNativePlayerAfterAd(info, realFetch, resolution = null) {
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
			resolution || _getFallbackResolution(info, "") || info?.ResolutionList?.[0] || null;
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
		LastNativeRecoveryProbeAt: 0,
		BackupVariantUrls: new Set(),
		LastNativeRecoveryReadyPlayerType: null,
		NativeRecoveryCleanCount: 0,
		LastForcedAdEndReloadAt: 0,
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
		} catch { }
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
				const shouldRefreshAccessToken = true;
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
							refreshAccessToken: shouldRefreshAccessToken,
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
	const hasAds =
		_hasPlaylistAdMarkers(text) ||
		hasExplicitKnownAdSegments ||
		__TTVAB_STATE__.SimulatedAdsDepth > 0;
	const hasMediaSegments = _playlistHasMediaSegments(text);

	if (!hasAds && hasMediaSegments && !info.IsShowingAd) {
		info.LastCleanNativeM3U8 = text;
		info.LastCleanNativePlaylistAt = Date.now();
	}

	if (hasAds) {
		const isForcedAdEndContinuation =
			!info.IsShowingAd && _isForcedAdEndReloadContinuation(info);
		if (!isForcedAdEndContinuation) {
			info.LastForcedAdEndReloadAt = 0;
		}

		info.PendingAdEndAt = 0;
		info.CleanPlaylistCount = 0;
		info.LastNativeRecoveryReadyPlayerType = null;
		info.NativeRecoveryCleanCount = 0;
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
						realFetch(mediaUrl).then((r) => r.blob()).catch(() => { });
					} catch { }
					break;
				}
			}
		}

		if (!info.IsShowingAd) {
			info.IsShowingAd = true;
			__TTVAB_STATE__.CurrentAdChannel = info.ChannelName;
			__TTVAB_STATE__.CurrentAdMediaKey = info.MediaKey;
			__TTVAB_STATE__.LastAdDetectedAt = Date.now();
			info.FailedBackupPlayerTypes?.clear?.();
			if (!isForcedAdEndContinuation) {
				_incrementAdsBlocked(info.ChannelName, info.MediaKey);
			}
			if (typeof self !== "undefined" && self.postMessage) {
				_postWorkerBridgeMessage(
					self,
					_createPageScopedWorkerEvent({
						key: "AdDetected",
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
						continued: isForcedAdEndContinuation,
					}),
				);
			}
			if (isForcedAdEndContinuation) {
				info.LastForcedAdEndReloadAt = 0;
				_log("[Trace] Continuing ad recovery after forced native reload", "warning");
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

		const {
			type: backupType,
			m3u8: backupM3u8,
			isFallback,
		} = await _findBackupStream(info, realFetch, startIdx, res);

		if (!backupM3u8) _log("Failed to find backup stream", "warning");

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
	} else {
		if (info.IsShowingAd) {
			const resolution = _resolvePlaybackResolutionForUrl(info, url);
			const hasStableAdEnd = await _isAdEndStable(info, realFetch, resolution);
			if (!hasStableAdEnd) {
				return text;
			}
			const {
				wasUsingModifiedM3U8,
				wasUsingFallbackStream,
				wasUsingBackupStream,
				hadStrippedAdSegments,
			} =
				_resetStreamAdState(info);
			__TTVAB_STATE__.CurrentAdChannel = null;
			__TTVAB_STATE__.CurrentAdMediaKey = null;
			__TTVAB_STATE__.PinnedBackupPlayerType = null;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
			if (typeof self !== "undefined" && self.postMessage) {
				const shouldReloadPlayer = _shouldReloadNativePlayerAfterAdReset({
					wasUsingModifiedM3U8,
					wasUsingFallbackStream,
					wasUsingBackupStream,
					hadStrippedAdSegments,
				});
				const shouldRefreshAccessToken = true;
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
							refreshAccessToken: shouldRefreshAccessToken,
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
		return { ...base, reason: "ad-marked" };
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
		playerTypes.every((playerType) =>
			(__TTVAB_STATE__?.BackupPlayerTypes || []).indexOf(playerType) >= startIdx,
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
									if (line && line.endsWith(".m3u8") && !line.startsWith("#")) {
										try {
											const variantUrl = new URL(line, encBaseUrl).href;
											info.BackupVariantUrls?.add(variantUrl);
											for (const alias of _getPlaylistUrlAliases(variantUrl)) {
												info.BackupVariantUrls?.add(alias);
											}
										} catch { }
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
