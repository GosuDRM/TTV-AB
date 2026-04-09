// TTV AB - Processor

function _resetStreamAdState(info) {
	const wasUsingModifiedM3U8 = Boolean(info?.IsUsingModifiedM3U8);
	const wasUsingFallbackStream = Boolean(info?.IsUsingFallbackStream);
	const wasUsingBackupStream = Boolean(info?.IsUsingBackupStream);

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
	};
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
	}: {
		wasUsingModifiedM3U8?: boolean;
		wasUsingFallbackStream?: boolean;
		wasUsingBackupStream?: boolean;
	} = {},
) {
	if (
		(wasUsingModifiedM3U8 || wasUsingFallbackStream || wasUsingBackupStream) &&
		typeof navigator?.userAgent === "string" &&
		/Firefox\//i.test(navigator.userAgent)
	) {
		return false;
	}

	return true;
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
	return typeof text === "string" && text.includes("#EXTINF");
}

async function _canReloadNativePlayerAfterAd(info, realFetch, resolution = null) {
	if (!info?.IsUsingBackupStream && !info?.IsUsingFallbackStream) {
		_resetNativeRecoveryReadyState(info);
		return true;
	}

	const requiredCleanProbes = 1;
	const now = Date.now();
	if (
		info.LastNativeRecoveryProbeAt &&
		now - info.LastNativeRecoveryProbeAt < 1500
	) {
		return false;
	}
	info.LastNativeRecoveryProbeAt = now;

	const nativePlayerType =
		__TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType ||
		"site";

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
		FailedBackupPlayerTypes: new Set(),
		Urls: Object.create(null),
		ResolutionList: [],
		BackupEncodingsM3U8Cache: Object.create(null),
		ActiveBackupPlayerType: null,
		ActiveBackupResolution: null,
		IsMidroll: false,
		IsStrippingAdSegments: false,
		NumStrippedAdSegments: 0,
		PendingAdEndAt: 0,
		CleanPlaylistCount: 0,
		LastNativeRecoveryProbeAt: 0,
		BackupVariantUrls: new Set(),
		LastNativeRecoveryReadyPlayerType: null,
		NativeRecoveryCleanCount: 0,
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
					wasUsingBackupStream) &&
				typeof self !== "undefined" &&
				self.postMessage
			) {
				const shouldReloadPlayer = _shouldReloadNativePlayerAfterAdReset({
					wasUsingModifiedM3U8,
					wasUsingFallbackStream,
					wasUsingBackupStream,
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

	if (hasAds) {
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
				if (line.startsWith("#EXTINF") && lines.length > j + 1) {
					const tsUrl = lines[j + 1];
					if (
						!line.includes(",live") &&
						tsUrl && !tsUrl.startsWith("#") &&
						!info.RequestedAds.has(tsUrl)
					) {
						info.RequestedAds.add(tsUrl);
						try {
							realFetch(tsUrl).then((r) => r.blob()).catch(() => { });
						} catch { }
						break;
					}
				}
			}
		}

		if (!info.IsShowingAd) {
			info.IsShowingAd = true;
			__TTVAB_STATE__.CurrentAdChannel = info.ChannelName;
			__TTVAB_STATE__.CurrentAdMediaKey = info.MediaKey;
			__TTVAB_STATE__.LastAdDetectedAt = Date.now();
			info.FailedBackupPlayerTypes?.clear?.();
			_incrementAdsBlocked(info.ChannelName, info.MediaKey);
			if (typeof self !== "undefined" && self.postMessage) {
				_postWorkerBridgeMessage(
					self,
					_createPageScopedWorkerEvent({
						key: "AdDetected",
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
					}),
				);
			}
		}

		if (info.IsUsingFallbackStream) {
			text = _stripAds(text, false, info);
			return text;
		}

		let res = null;
		for (const alias of _getPlaylistUrlAliases(url)) {
			res = info.Urls?.[alias] || null;
			if (res) break;
		}
		if (!res) {
			res = _getFallbackResolution(info, url);
		}
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
		if (info.ActiveBackupPlayerType !== backupType) {
			info.ActiveBackupPlayerType = backupType;
			_log(`Using backup: ${backupType}`, "info");
		}

		const stripHevc = isHevc && info.ModifiedM3U8;
		if (__TTVAB_STATE__.IsAdStrippingEnabled || stripHevc) {
			text = _stripAds(text, stripHevc, info);
		}
	} else {
		if (info.IsShowingAd) {
			const {
				wasUsingModifiedM3U8,
				wasUsingFallbackStream,
				wasUsingBackupStream,
			} =
				_resetStreamAdState(info);
			__TTVAB_STATE__.CurrentAdChannel = null;
			__TTVAB_STATE__.CurrentAdMediaKey = null;
			__TTVAB_STATE__.PinnedBackupPlayerType = null;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
			__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
			if (typeof self !== "undefined" && self.postMessage) {
				const shouldReloadPlayer = _shouldReloadNativePlayerAfterAdReset({
					wasUsingModifiedM3U8,
					wasUsingFallbackStream,
					wasUsingBackupStream,
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

	const playerTypes = [...__TTVAB_STATE__.BackupPlayerTypes];
	const playerTypesLen = playerTypes.length;
	const isDoingMinimalRequests = startIdx > 0;
	const targetRes =
		currentResolution ||
		_getFallbackResolution(info, "") ||
		info?.ResolutionList?.[0] ||
		(typeof __TTVAB_STATE__?.PreferredQualityGroup === "string" &&
			__TTVAB_STATE__.PreferredQualityGroup.trim()
			? { Name: __TTVAB_STATE__.PreferredQualityGroup.trim() }
			: null);

	for (let pi = startIdx; !backupM3u8 && pi < playerTypesLen; pi++) {
		const pt = playerTypes[pi];
		const realPt = pt.replace("-CACHED", "");
		const isFullyCachedPlayerType = pt !== realPt;
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
						}
					} else {
						_log(`Token failed for ${pt}: ${tokenRes.status}`, "warning");
					}
				} catch (e) {
					_log(`Backup error: ${e.message}`, "error");
				}
			}

			if (enc) {
				try {
					const streamUrl = _getStreamUrl(enc, targetRes, encBaseUrl);
					if (streamUrl) {
						const streamRes = await realFetch(streamUrl);
						if (streamRes.status === 200) {
							const m3u8 = await streamRes.text();
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
									pi >= __TTVAB_STATE__.SimulatedAdsDepth - 1;
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
									backupType = pt;
									backupM3u8 = m3u8;
									_log(`[Trace] Selected: ${pt}`, "success");
									break;
								}
								if (isDoingMinimalRequests && candidateIsPlayable) {
									backupType = pt;
									backupM3u8 = m3u8;
									_log(`[Trace] Selected (minimal): ${pt}`, "success");
									break;
								}
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
							invalidateCache = true;
						}
					} else {
						_log(`No stream URL for ${pt}`, "warning");
						invalidateCache = true;
					}
				} catch (e) {
					_log(`Stream error: ${e.message}`, "warning");
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
		_log(`[Trace] Using fallback: ${backupType}`, "warning");
	}

	return { type: backupType, m3u8: backupM3u8, isFallback };
}
