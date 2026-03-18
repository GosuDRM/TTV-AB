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
	info.FailedBackupPlayerTypes?.clear?.();
	info.BackupEncodingsM3U8Cache = Object.create(null);
	info.ActiveBackupPlayerType = null;
	info.ActiveBackupResolution = null;
	info.IsMidroll = false;
	info.IsStrippingAdSegments = false;
	info.NumStrippedAdSegments = 0;
	info.PendingAdEndAt = 0;
	info.CleanPlaylistCount = 0;

	return {
		wasUsingModifiedM3U8,
		wasUsingFallbackStream,
		wasUsingBackupStream,
	};
}

function _getStreamInfoForPlaylist(url) {
	const normalizedUrl = typeof url === "string" ? url.trimEnd() : "";
	const byUrl =
		__TTVAB_STATE__.StreamInfosByUrl[normalizedUrl] ||
		__TTVAB_STATE__.StreamInfosByUrl[url];
	if (byUrl) return byUrl;

	const infos = Object.values(__TTVAB_STATE__.StreamInfos || {}).filter(
		Boolean,
	);
	if (infos.length === 0) return null;
	if (infos.length === 1) return infos[0];

	return [...infos].sort((a, b) => {
		const aTime = a?.LastActivityAt || 0;
		const bTime = b?.LastActivityAt || 0;
		if (bTime !== aTime) return bTime - aTime;
		if (a?.IsShowingAd !== b?.IsShowingAd) {
			return (b?.IsShowingAd ? 1 : 0) - (a?.IsShowingAd ? 1 : 0);
		}
		return 0;
	})[0];
}

function _hasPlaylistAdMarkers(text) {
	return (
		typeof text === "string" &&
		(text.includes("X-TV-TWITCH-AD") ||
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

async function _processM3U8(url, text, realFetch) {
	let info = _getStreamInfoForPlaylist(url);
	if (!info) {
		if (
			!_hasPlaylistAdMarkers(text) &&
			!_playlistHasKnownAdSegments(text) &&
			__TTVAB_STATE__.SimulatedAdsDepth === 0
		) {
			return text;
		}
		const channel =
			__TTVAB_STATE__.CurrentAdChannel ||
			Object.keys(__TTVAB_STATE__.StreamInfos || {})[0] ||
			__TTVAB_STATE__.PageChannel ||
			null;
		if (!channel) return text;
		info = {
			ChannelName: channel,
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
			LastActivityAt: Date.now(),
		};
		__TTVAB_STATE__.StreamInfos[channel] = info;
		__TTVAB_STATE__.StreamInfosByUrl[url] = info;
		_log(`Synthetic stream info created for ${channel}`, "warning");
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
			__TTVAB_STATE__.PinnedBackupPlayerType = null;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
			__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
			_log("Ad blocking disabled - restoring native stream state", "info");
			if (
				(wasUsingModifiedM3U8 ||
					wasUsingFallbackStream ||
					wasUsingBackupStream) &&
				typeof self !== "undefined" &&
				self.postMessage
			) {
				self.postMessage({ key: "AdEnded", channel: info.ChannelName });
				if (__TTVAB_STATE__.ReloadAfterAd) {
					info.LastPlayerReload = Date.now();
					self.postMessage({ key: "ReloadPlayer", channel: info.ChannelName });
				}
			}
		}
		return text;
	}

	if (__TTVAB_STATE__.HasTriggeredPlayerReload) {
		__TTVAB_STATE__.HasTriggeredPlayerReload = false;
		info.LastPlayerReload = Date.now();
	}

	const hasAds =
		_hasPlaylistAdMarkers(text) ||
		_playlistHasKnownAdSegments(text) ||
		__TTVAB_STATE__.SimulatedAdsDepth > 0;
	const hasMediaSegments = _playlistHasMediaSegments(text);

	if (hasAds) {
		info.PendingAdEndAt = 0;
		info.CleanPlaylistCount = 0;
		info.IsMidroll = text.includes('"MIDROLL"') || text.includes('"midroll"');

		if (!info.IsShowingAd) {
			info.IsShowingAd = true;
			__TTVAB_STATE__.CurrentAdChannel = info.ChannelName;
			__TTVAB_STATE__.LastAdDetectedAt = Date.now();
			info.FailedBackupPlayerTypes?.clear?.();
			if (typeof self !== "undefined" && self.postMessage) {
				self.postMessage({
					key: "AdDetected",
					channel: info.ChannelName,
					source: "playlist-ad",
				});
			}
		}

		if (info.IsUsingFallbackStream) {
			text = _stripAds(text, false, info);
			return text;
		}

		const res =
			info.Urls?.[url] ||
			info.Urls?.[url.trimEnd()] ||
			_getFallbackResolution(info, url);
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
			if (backupType && typeof self !== "undefined" && self.postMessage) {
				self.postMessage({
					key: "BackupPlayerTypeSelected",
					value: backupType,
					channel: info.ChannelName,
				});
			}
		}

		const stripHevc = isHevc && info.ModifiedM3U8;
		if (__TTVAB_STATE__.IsAdStrippingEnabled || stripHevc) {
			text = _stripAds(text, stripHevc, info);
		}
	} else {
		if (info.IsShowingAd && hasMediaSegments) {
			const now = Date.now();
			if (!info.PendingAdEndAt) {
				info.PendingAdEndAt = now;
				info.CleanPlaylistCount = 1;
				return text;
			}

			info.CleanPlaylistCount = (info.CleanPlaylistCount || 0) + 1;
			if (
				now - info.PendingAdEndAt < __TTVAB_STATE__.AdEndGraceMs ||
				info.CleanPlaylistCount < __TTVAB_STATE__.AdEndMinCleanPlaylists
			) {
				return text;
			}

			const {
				wasUsingModifiedM3U8,
				wasUsingFallbackStream,
				wasUsingBackupStream,
			} = _resetStreamAdState(info);
			__TTVAB_STATE__.CurrentAdChannel = null;
			__TTVAB_STATE__.PinnedBackupPlayerType = null;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
			__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
			if (typeof self !== "undefined" && self.postMessage) {
				self.postMessage({ key: "AdEnded", channel: info.ChannelName });
				if (
					(wasUsingModifiedM3U8 ||
						wasUsingFallbackStream ||
						wasUsingBackupStream) &&
					__TTVAB_STATE__.ReloadAfterAd
				) {
					info.LastPlayerReload = Date.now();
					self.postMessage({ key: "ReloadPlayer", channel: info.ChannelName });
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
	const targetRes = currentResolution || {
		Resolution: "1920x1080",
		FrameRate: "60",
	};

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
					const tokenRes = await _getToken(info.ChannelName, realPt, realFetch);
					if (tokenRes.status === 200) {
						const token = await tokenRes.json();
						const extractedToken = _extractPlaybackAccessToken(token);
						const sig = extractedToken?.signature;
						const tokenValue = extractedToken?.value;

						if (sig && tokenValue) {
							info.FailedBackupPlayerTypes?.delete?.(pt);
							const usherUrl = new URL(
								`https://usher.ttvnw.net/api/${__TTVAB_STATE__.V2API ? "v2/" : ""}channel/hls/${info.ChannelName}.m3u8${info.UsherParams}`,
							);
							usherUrl.searchParams.set("sig", sig);
							usherUrl.searchParams.set("token", tokenValue);
							const encRes = await realFetch(usherUrl.href);
							if (encRes.status === 200) {
								enc = await encRes.text();
								encBaseUrl = usherUrl.href;
								info.BackupEncodingsM3U8Cache[pt] = {
									m3u8: enc,
									baseUrl: encBaseUrl,
								};
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
								const candidateHasAds =
									_hasPlaylistAdMarkers(m3u8) ||
									_hasExplicitAdMetadata(m3u8) ||
									_playlistHasKnownAdSegments(m3u8);
								const simulatedAdsDepthSatisfied =
									__TTVAB_STATE__.SimulatedAdsDepth === 0 ||
									pi >= __TTVAB_STATE__.SimulatedAdsDepth - 1;
								const promotionPolicy =
									typeof _getFallbackPromotionPolicy === "function"
										? _getFallbackPromotionPolicy({
												candidateHasAds,
												candidateIsPlayable: Boolean(m3u8),
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
