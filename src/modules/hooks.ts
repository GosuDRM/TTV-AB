// TTV AB - Hooks

const _POST_AD_REMOVABLE_SELECTORS = [
	'[data-a-target="video-player-pip-container"]',
	'[data-a-target="video-player-mini-player"]',
	".video-player__pip-container",
	".video-player__mini-player",
	".mini-player",
	'[class*="mini-player"]',
	'[class*="pip-container"]',
	'[data-test-selector="display-ad"]',
	'[data-test-selector="ad-banner"]',
	'[data-a-target="ads-banner"]',
	'iframe[data-test-selector^="sda-iframe-"]',
	'iframe[title="Stream Display Ad"]',
	'iframe[class*="stream-display-ad__iframe_lower-third"]',
	'[data-ttvab-player-ad-banner="true"]',
];
const _POST_AD_RESET_ONLY_SELECTORS = [
	".stream-display-ad",
	'[class*="stream-display-ad"]',
	".video-player--stream-display-ad",
	'[class*="video-player--stream-display-ad"]',
];
const _POST_AD_REMOVABLE_SELECTOR_GROUP =
	_POST_AD_REMOVABLE_SELECTORS.join(", ");
const _POST_AD_RESET_SELECTOR_GROUP = _POST_AD_RESET_ONLY_SELECTORS.join(", ");
let _pendingPostAdArtifactCleanup = null;

function _hidePostAdArtifact(el) {
	if (!(el instanceof Element)) return;
	el.style.setProperty("display", "none", "important");
	el.style.setProperty("visibility", "hidden", "important");
	el.style.setProperty("pointer-events", "none", "important");
	el.setAttribute("data-ttvab-post-ad-hidden", "true");
}

function _isPostAdPlayerLayoutWrapper(el) {
	if (!(el instanceof Element)) return false;
	return Boolean(
		el.querySelector?.("video") ||
			el.matches?.('[data-a-target="video-player"]') ||
			el.matches?.('[class*="video-player"]'),
	);
}

function _resetPostAdDisplayArtifact(el) {
	if (!(el instanceof Element)) return;

	if (
		typeof el.className === "string" &&
		el.className.includes("stream-display-ad")
	) {
		el.className = el.className
			.split(/\s+/)
			.filter(
				(className) => className && !className.includes("stream-display-ad"),
			)
			.join(" ");
	}

	if (_isPostAdPlayerLayoutWrapper(el)) {
		el.removeAttribute("data-ttvab-post-ad-hidden");
		el.style.removeProperty("display");
		el.style.removeProperty("visibility");
		el.style.removeProperty("pointer-events");
		el.style.setProperty("padding", "0", "important");
		el.style.setProperty("margin", "0", "important");
		el.style.setProperty("background", "transparent", "important");
		el.style.setProperty("background-color", "transparent", "important");
		el.style.setProperty("width", "100%", "important");
		el.style.setProperty("height", "100%", "important");
		el.style.setProperty("max-width", "100%", "important");
		el.style.setProperty("max-height", "100%", "important");
		el.style.setProperty("inset", "0", "important");
		return;
	}

	_hidePostAdArtifact(el);
}

function _runPostAdArtifactCleanup() {
	try {
		for (const el of document.querySelectorAll(
			_POST_AD_REMOVABLE_SELECTOR_GROUP,
		)) {
			_resetPostAdDisplayArtifact(el);
		}

		for (const el of document.querySelectorAll(_POST_AD_RESET_SELECTOR_GROUP)) {
			_resetPostAdDisplayArtifact(el);
		}
	} catch (_e) {}
}

function _schedulePostAdArtifactCleanup(channel = null, mediaKey = null) {
	if (_pendingPostAdArtifactCleanup?.id) {
		clearTimeout(_pendingPostAdArtifactCleanup.id);
	}

	const entry = {
		id: 0,
		channel,
		mediaKey,
	};
	entry.id = setTimeout(() => {
		if (_pendingPostAdArtifactCleanup !== entry) {
			return;
		}
		_pendingPostAdArtifactCleanup = null;
		if (
			typeof _isPlaybackRecoveryContextCurrent === "function" &&
			!_isPlaybackRecoveryContextCurrent(entry.channel, entry.mediaKey)
		) {
			return;
		}
		_runPostAdArtifactCleanup();
	}, 80);

	_pendingPostAdArtifactCleanup = entry;
	return entry.id;
}

function _hookWorkerFetch() {
	_log("Worker fetch hooked", "info");
	const realFetch = fetch;
	const EMPTY_SEGMENT_URL =
		"data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292";

	function _pruneStreamInfos() {
		const keys = Object.keys(__TTVAB_STATE__.StreamInfos);
		if (keys.length > 5) {
			const oldKey = keys.sort(
				(a, b) =>
					(__TTVAB_STATE__.StreamInfos[a]?.LastActivityAt || 0) -
					(__TTVAB_STATE__.StreamInfos[b]?.LastActivityAt || 0),
			)[0];
			const oldInfo = __TTVAB_STATE__.StreamInfos[oldKey];
			delete __TTVAB_STATE__.StreamInfos[oldKey];
			for (const url in __TTVAB_STATE__.StreamInfosByUrl) {
				if (__TTVAB_STATE__.StreamInfosByUrl[url] === oldInfo) {
					delete __TTVAB_STATE__.StreamInfosByUrl[url];
				}
			}
		}
	}

	function _syncStreamInfo(info, encodings, usherUrl) {
		const wasUsingModifiedM3U8 = Boolean(info.IsUsingModifiedM3U8);
		info.EncodingsM3U8 = encodings;
		info.UsherBaseUrl = usherUrl;
		info.UsherParams = new URL(usherUrl).search;
		info.Urls = Object.create(null);
		info.ResolutionList = [];
		if (!info.IsShowingAd) {
			info.BackupEncodingsM3U8Cache = Object.create(null);
		}
		info.ModifiedM3U8 = null;

		for (const variantUrl in __TTVAB_STATE__.StreamInfosByUrl) {
			if (__TTVAB_STATE__.StreamInfosByUrl[variantUrl] === info) {
				delete __TTVAB_STATE__.StreamInfosByUrl[variantUrl];
			}
		}

		const lines = encodings.split("\n");
		for (let i = 0, len = lines.length; i < len - 1; i++) {
			const nextLine = lines[i + 1]?.trim();
			if (
				lines[i]?.startsWith("#EXT-X-STREAM-INF") &&
				nextLine &&
				!nextLine.startsWith("#") &&
				(nextLine.includes(".m3u8") || nextLine.includes("://"))
			) {
				const attrs = _parseAttrs(lines[i]);
				const resolution = attrs.RESOLUTION;
				let variantUrl = lines[i + 1];
				try {
					variantUrl = new URL(variantUrl, usherUrl).href;
				} catch {}
				if (resolution) {
					const resInfo = _getStreamVariantInfo(
						attrs,
						lines[i + 1],
						variantUrl,
					);
					for (const alias of _getPlaylistUrlAliases(variantUrl)) {
						info.Urls[alias] = resInfo;
					}
					for (const alias of _getPlaylistUrlAliases(lines[i + 1], usherUrl)) {
						info.Urls[alias] = resInfo;
					}
					info.ResolutionList.push(resInfo);
				}
				for (const alias of _getPlaylistUrlAliases(variantUrl)) {
					__TTVAB_STATE__.StreamInfosByUrl[alias] = info;
				}
				for (const alias of _getPlaylistUrlAliases(lines[i + 1], usherUrl)) {
					__TTVAB_STATE__.StreamInfosByUrl[alias] = info;
				}
			}
		}

		const nonHevcList = info.ResolutionList.filter(
			(r) => r.Codecs?.startsWith("avc") || r.Codecs?.startsWith("av0"),
		);
		const hasHevc = info.ResolutionList.some(
			(r) => r.Codecs?.startsWith("hev") || r.Codecs?.startsWith("hvc"),
		);

		if (hasHevc && nonHevcList.length > 0) {
			const modLines = [...lines];
			for (let mi = 0; mi < modLines.length - 1; mi++) {
				if (modLines[mi]?.startsWith("#EXT-X-STREAM-INF")) {
					const attrs = _parseAttrs(modLines[mi]);
					const codecs = attrs.CODECS || "";
					if (codecs.startsWith("hev") || codecs.startsWith("hvc")) {
						const [tw, th] = (attrs.RESOLUTION || "1920x1080")
							.split("x")
							.map(Number);
						const targetArea =
							(Number.isFinite(tw) ? tw : 1920) *
							(Number.isFinite(th) ? th : 1080);
						const closest = [...nonHevcList].sort((a, b) => {
							const [aw, ah] = String(a?.Resolution || "0x0")
								.split("x")
								.map(Number);
							const [bw, bh] = String(b?.Resolution || "0x0")
								.split("x")
								.map(Number);
							const aArea =
								(Number.isFinite(aw) ? aw : 0) * (Number.isFinite(ah) ? ah : 0);
							const bArea =
								(Number.isFinite(bw) ? bw : 0) * (Number.isFinite(bh) ? bh : 0);
							return (
								Math.abs(aArea - targetArea) - Math.abs(bArea - targetArea)
							);
						})[0];
						modLines[mi] = modLines[mi].replace(
							/CODECS="[^"]+"/,
							`CODECS="${closest.Codecs}"`,
						);
						modLines[mi + 1] = closest.RawUrl || closest.Url;
					}
				}
			}
			info.ModifiedM3U8 = modLines.join("\n");
			_log("HEVC stream detected, created fallback M3U8", "info");
		}

		if (wasUsingModifiedM3U8 && !info.ModifiedM3U8) {
			info.IsUsingModifiedM3U8 = false;
		}
	}

	globalThis.fetch = async function (...args) {
		let requestUrl = null;
		try {
			const [resource, opts] = args;
			requestUrl =
				typeof resource === "string"
					? resource
					: resource instanceof URL
						? resource.href
						: typeof Request !== "undefined" && resource instanceof Request
							? resource.url
							: null;

			if (!requestUrl) {
				return await realFetch.apply(this, args);
			}

			const getFetchArgs = (nextUrl) => {
				if (typeof resource === "string" || resource instanceof URL) {
					return [nextUrl, opts];
				}

				if (typeof Request !== "undefined" && resource instanceof Request) {
					return [new Request(nextUrl, resource), opts];
				}

				return args;
			};

			let url = requestUrl.trimEnd();
			const responseInit = (response) => ({
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
			});

			const shouldBlockCachedAdSegments = Boolean(
				__TTVAB_STATE__.CurrentAdMediaKey ||
					__TTVAB_STATE__.CurrentAdChannel ||
					__TTVAB_STATE__.SimulatedAdsDepth > 0,
			);
			if (
				typeof _isKnownAdSegmentUrl === "function" &&
				_isKnownAdSegmentUrl(url, {
					includeCached: shouldBlockCachedAdSegments,
				})
			) {
				return await realFetch(EMPTY_SEGMENT_URL);
			}

			const playbackContext = _getPlaybackContextFromUsherUrl(url);
			if (playbackContext?.MediaKey) {
				__TTVAB_STATE__.V2API = url.includes("/api/v2/");
				const logTarget =
					playbackContext.MediaType === "vod"
						? `vod ${playbackContext.VodID}`
						: playbackContext.ChannelName;

				if (__TTVAB_STATE__.ForceAccessTokenPlayerType) {
					const urlObj = new URL(url);
					urlObj.searchParams.delete("parent_domains");
					url = urlObj.toString();
				}

				const response = await realFetch.apply(this, getFetchArgs(url));
				if (response.status !== 200) return response;

				const encodings = await response.text();
				const serverTime = _getServerTime(encodings);
				try {
					let info = __TTVAB_STATE__.StreamInfos[playbackContext.MediaKey];

					if (info?.EncodingsM3U8) {
						const now = Date.now();
						const lastStaleCheck = info._lastStaleCheckAt || 0;
						if (now - lastStaleCheck > 10000) {
							info._lastStaleCheckAt = now;
							const m3u8Match = info.EncodingsM3U8.match(/^https:.*\.m3u8$/m);
							if (m3u8Match && (await realFetch(m3u8Match[0])).status !== 200) {
								delete __TTVAB_STATE__.StreamInfos[playbackContext.MediaKey];
								info = null;
							}
						}
					}

					const isNewInfo = !info?.EncodingsM3U8;
					if (isNewInfo) {
						_pruneStreamInfos();
						info = __TTVAB_STATE__.StreamInfos[playbackContext.MediaKey] = {
							MediaType: playbackContext.MediaType,
							MediaKey: playbackContext.MediaKey,
							ChannelName: playbackContext.ChannelName,
							VodID: playbackContext.VodID,
							IsShowingAd: false,
							LastPlayerReload: 0,
							EncodingsM3U8: encodings,
							ModifiedM3U8: null,
							IsUsingModifiedM3U8: false,
							IsUsingFallbackStream: false,
							IsUsingBackupStream: false,
							UsherBaseUrl: url,
							UsherParams: new URL(url).search,
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
					} else {
						info.MediaType = playbackContext.MediaType;
						info.MediaKey = playbackContext.MediaKey;
						info.ChannelName = playbackContext.ChannelName;
						info.VodID = playbackContext.VodID;
					}

					_syncStreamInfo(info, encodings, url);
					info.LastActivityAt = Date.now();

					if (isNewInfo) {
						_log(`Stream initialized: ${logTarget}`, "success");
					}

					const playlist = info.IsUsingModifiedM3U8
						? info.ModifiedM3U8
						: info.EncodingsM3U8;
					return new Response(
						_replaceServerTime(playlist, serverTime),
						responseInit(response),
					);
				} catch (err) {
					_log(
						`Master playlist processing failed for ${logTarget}: ${
							err?.message ?? String(err)
						}`,
						"error",
					);
					return new Response(encodings, responseInit(response));
				}
			}

			if (/\.m3u8(?:$|\?)/.test(url)) {
				const response = await realFetch.apply(this, getFetchArgs(url));
				if (response.status === 200) {
					const text = await response.text();
					try {
						return new Response(
							await _processM3U8(url, text, realFetch),
							responseInit(response),
						);
					} catch (err) {
						if (err?.name !== "AbortError") {
							_log(
								`Media playlist processing failed for ${url}: ${
									err?.message ?? String(err)
								}`,
								"error",
							);
						}
						return new Response(text, responseInit(response));
					}
				}
				return response;
			}

			return await realFetch.apply(this, args);
		} catch (e) {
			const safeUrl =
				typeof requestUrl === "string" ? requestUrl.trimEnd() : null;
			const isPlaybackRequest = Boolean(
				(safeUrl && _getPlaybackContextFromUsherUrl(safeUrl)?.MediaKey) ||
					(safeUrl && /\.m3u8(?:$|\?)/.test(safeUrl)),
			);
			const errorMessage =
				typeof e?.message === "string" ? e.message : String(e);
			const isExpectedCancellation =
				e?.name === "AbortError" ||
				/request cancel(?:ed|led)|cancel(?:ed|led)/i.test(errorMessage);
			if (isPlaybackRequest && !isExpectedCancellation) {
				_log(
					`Worker fetch wrapper failed for ${safeUrl}: ${errorMessage}`,
					"error",
				);
			}
			throw e;
		}
	};
}

function _syncStoredDeviceId() {
	try {
		const deviceId = localStorage.getItem("unique_id");
		if (typeof deviceId === "string" && deviceId) {
			__TTVAB_STATE__.GQLDeviceID = deviceId;
			return deviceId;
		}
	} catch (e) {
		_log(`Device ID sync error: ${e.message}`, "warning");
	}
	return null;
}

function _hookRevokeObjectURL() {
	if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
		const originalRevoke = URL.revokeObjectURL;
		URL.revokeObjectURL = function (url) {
			if (typeof url === "string" && url.startsWith("blob:")) {
				setTimeout(() => {
					try {
						originalRevoke.call(this, url);
					} catch {}
				}, 3500);
			} else {
				originalRevoke.call(this, url);
			}
		};
	}
}

function _hookWorker() {
	_syncStoredDeviceId();
	if (typeof window?.Worker !== "function") {
		return;
	}
	const isAllowedWorkerHost = (hostname) => {
		const host = String(hostname || "").toLowerCase();
		return (
			host === "twitch.tv" ||
			host.endsWith(".twitch.tv") ||
			host === "ttvnw.net" ||
			host.endsWith(".ttvnw.net") ||
			host === "twitchcdn.net" ||
			host.endsWith(".twitchcdn.net")
		);
	};
	const normalizeWorkerUrl = (url) => {
		if (url instanceof URL) return url.href;
		return new URL(String(url), window.location.href).href;
	};
	const isTwitchWorkerUrl = (workerUrl) => {
		const parsed = new URL(workerUrl);
		if (isAllowedWorkerHost(parsed.hostname)) {
			return true;
		}

		if (parsed.protocol === "blob:") {
			const pageHost = window.location.hostname;
			return (
				isAllowedWorkerHost(pageHost) &&
				parsed.origin === window.location.origin
			);
		}

		return false;
	};
	const pruneTrackedWorkers = (excludedWorkers = []) => {
		const excluded = new Set(excludedWorkers.filter(Boolean));
		const aliveWorkers = [];
		const seenWorkers = new Set();

		for (const worker of _S.workers) {
			if (!worker || excluded.has(worker) || seenWorkers.has(worker)) {
				continue;
			}
			if (worker.__TTVABIntentionallyTerminated) {
				continue;
			}
			aliveWorkers.push(worker);
			seenWorkers.add(worker);
		}

		_S.workers = aliveWorkers;
	};

	const createHookedWorkerConstructor = (BaseWorker) => {
		const reinsertNames = _getReinsert(BaseWorker);
		const HookedWorker = class Worker extends _cleanWorker(BaseWorker) {
			constructor(url, opts) {
				let isTwitch = false;
				let workerSourceUrl = null;
				try {
					workerSourceUrl = normalizeWorkerUrl(url);
					isTwitch = isTwitchWorkerUrl(workerSourceUrl);
				} catch {
					isTwitch = false;
				}

				if (!isTwitch) {
					super(url, opts);
					return;
				}

				const pagePlaybackContext = _syncPagePlaybackContext({
					broadcast: false,
				});

				const originalWorkerLoadCode =
					opts?.type === "module"
						? `await import(${JSON.stringify(workerSourceUrl)});`
						: `importScripts(${JSON.stringify(workerSourceUrl)});`;

				const injectedCode = `
            (function() {
                const _C = ${JSON.stringify(_C)};
                const _S = ${JSON.stringify(_S)};
                const _ATTR_REGEX = ${_ATTR_REGEX.toString()};
                ${_log.toString()}
                ${_createWorkerBridgeMessage.toString()}
                ${_getWorkerBridgeMessage.toString()}
                ${_postWorkerBridgeMessage.toString()}
                ${_declareState.toString()}
                ${_getPageScopedPlaybackEventContext.toString()}
                ${_createPageScopedWorkerEvent.toString()}
                ${_incrementAdsBlocked.toString()}
                ${_normalizeChannelName.toString()}
                ${_normalizeVodID.toString()}
                ${_buildMediaKey.toString()}
                ${_normalizeMediaKey.toString()}
                ${_normalizePlaybackContext.toString()}
                ${_getPlaybackContextFromUrl.toString()}
                ${_getPlaybackContextFromUsherUrl.toString()}
                ${_parseAttrs.toString()}
                ${_getServerTime.toString()}
                ${_replaceServerTime.toString()}
                ${_hasExplicitAdMetadata.toString()}
                ${_isExplicitKnownAdSegmentUrl.toString()}
                ${_isKnownAdSegmentUrl.toString()}
                ${_getTaggedPlaylistUri.toString()}
                ${_isMediaPartLine.toString()}
                ${_isPartPreloadHintLine.toString()}
                ${_playlistHasKnownAdSegments.toString()}
                ${_absolutizePlaylistUrl.toString()}
                ${_absolutizeMediaPlaylistUrls.toString()}
                ${_stripAds.toString()}
                ${_getStreamVariantInfo.toString()}
                ${_getStreamUrl.toString()}
                ${_getFallbackResolution.toString()}
                ${_getPlaylistUrlAliases.toString()}
                ${_collectPlaybackAccessTokenSources.toString()}
                ${_summarizePlaybackAccessTokenPayload.toString()}
                ${_getPlaybackAccessTokenErrors.toString()}
                ${_extractPlaybackAccessToken.toString()}
                ${_isWorkerContext.toString()}
                ${_createFetchRelayResponse.toString()}
                ${_fetchViaWorkerBridge.toString()}
                ${_getToken.toString()}
                ${_getResolvedAdEndMinCleanPlaylists.toString()}
                ${_getResolvedAdEndGraceMs.toString()}
                ${_getResolvedAdEndMaxWaitMs.toString()}
                ${_getForcedAdEndReentryWindowMs.toString()}
                ${_markForcedAdEndReload.toString()}
                ${_isForcedAdEndReloadContinuation.toString()}
                ${_getBackupPlayerRetryCooldownMs.toString()}
                ${_markBackupPlayerRetryCooldown.toString()}
                ${_clearBackupPlayerRetryCooldown.toString()}
                ${_isBackupPlayerRetryCoolingDown.toString()}
                ${_getPinnedBackupPlayerTypeForInfo.toString()}
                ${_getOrderedBackupPlayerTypes.toString()}
                ${_resolvePlaybackResolutionForUrl.toString()}
                ${_isAdEndStable.toString()}
                ${_resetNativeRecoveryReadyState.toString()}
                ${_markNativeRecoveryReady.toString()}
                ${_resetStreamAdState.toString()}
                ${_shouldReloadNativePlayerAfterAdReset.toString()}
                ${_getStreamInfoForPlaylist.toString()}
                ${_getSyntheticPlaybackContextForPlaylist.toString()}
                ${_createSyntheticStreamInfo.toString()}
                ${_buildUsherPlaybackUrl.toString()}
                ${_hasPlaylistAdMarkers.toString()}
                ${_playlistHasMediaSegments.toString()}
                ${_getNativeRecoveryProbePlayerType.toString()}
                ${_canReloadNativePlayerAfterAd.toString()}
                ${_getFallbackPromotionPolicy.toString()}
                ${_processM3U8.toString()}
                ${_findBackupStream.toString()}
                ${_hookWorkerFetch.toString()}
                
                const _GQL_URL = '${_GQL_URL}';
                _declareState(self);
                __TTVAB_STATE__.GQLDeviceID = ${JSON.stringify(__TTVAB_STATE__.GQLDeviceID)};
                __TTVAB_STATE__.AuthorizationHeader = ${JSON.stringify(__TTVAB_STATE__.AuthorizationHeader)};
                __TTVAB_STATE__.ClientIntegrityHeader = ${JSON.stringify(__TTVAB_STATE__.ClientIntegrityHeader)};
                __TTVAB_STATE__.ClientVersion = ${JSON.stringify(__TTVAB_STATE__.ClientVersion)};
                __TTVAB_STATE__.ClientSession = ${JSON.stringify(__TTVAB_STATE__.ClientSession)};
                __TTVAB_STATE__.PlaybackAccessTokenHash = ${JSON.stringify(__TTVAB_STATE__.PlaybackAccessTokenHash)};
                __TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType = ${JSON.stringify(__TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType)};
                __TTVAB_STATE__.CurrentAdChannel = ${JSON.stringify(__TTVAB_STATE__.CurrentAdChannel)};
                __TTVAB_STATE__.CurrentAdMediaKey = ${JSON.stringify(__TTVAB_STATE__.CurrentAdMediaKey)};
                __TTVAB_STATE__.PinnedBackupPlayerType = ${JSON.stringify(__TTVAB_STATE__.PinnedBackupPlayerType)};
                __TTVAB_STATE__.LastPinnedBackupPlayerType = ${JSON.stringify(__TTVAB_STATE__.LastPinnedBackupPlayerType)};
                __TTVAB_STATE__.PinnedBackupPlayerChannel = ${JSON.stringify(__TTVAB_STATE__.PinnedBackupPlayerChannel)};
                __TTVAB_STATE__.PinnedBackupPlayerMediaKey = ${JSON.stringify(__TTVAB_STATE__.PinnedBackupPlayerMediaKey)};
                __TTVAB_STATE__.IsAdStrippingEnabled = ${JSON.stringify(__TTVAB_STATE__.IsAdStrippingEnabled)};
                __TTVAB_STATE__.PageMediaType = ${JSON.stringify(pagePlaybackContext.MediaType)};
                __TTVAB_STATE__.PageChannel = ${JSON.stringify(pagePlaybackContext.ChannelName)};
                __TTVAB_STATE__.PageVodID = ${JSON.stringify(pagePlaybackContext.VodID)};
                __TTVAB_STATE__.PageMediaKey = ${JSON.stringify(pagePlaybackContext.MediaKey)};
                __TTVAB_STATE__.PreferredQualityGroup = ${JSON.stringify(__TTVAB_STATE__.PreferredQualityGroup)};
                
                self.addEventListener('message', function(e) {
                    const data = _getWorkerBridgeMessage(e.data);
                    if (!data) return;
                    e.stopImmediatePropagation?.();
                    switch (data.key) {
                        case 'UpdateClientVersion': __TTVAB_STATE__.ClientVersion = data.value; break;
                        case 'UpdateClientSession': __TTVAB_STATE__.ClientSession = data.value; break;
                        case 'UpdateDeviceId': __TTVAB_STATE__.GQLDeviceID = data.value; break;
                        case 'UpdateClientIntegrityHeader': __TTVAB_STATE__.ClientIntegrityHeader = data.value; break;
                        case 'UpdateAuthorizationHeader': __TTVAB_STATE__.AuthorizationHeader = data.value; break;
                        case 'UpdateToggleState': __TTVAB_STATE__.IsAdStrippingEnabled = data.value; break;
                        case 'UpdateAdsBlocked': _S.adsBlocked = data.value; break;
                        case 'UpdateGQLHash': __TTVAB_STATE__.PlaybackAccessTokenHash = data.value; break;
                        case 'UpdateLastNativePlaybackAccessTokenPlayerType': __TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType = data.value; break;
                        case 'UpdatePageContext':
                            {
                                const nextPageContext = _normalizePlaybackContext(data.value);
                                __TTVAB_STATE__.PageMediaType = nextPageContext.MediaType;
                                __TTVAB_STATE__.PageChannel = nextPageContext.ChannelName;
                                __TTVAB_STATE__.PageVodID = nextPageContext.VodID;
                                __TTVAB_STATE__.PageMediaKey = nextPageContext.MediaKey;
                                const pendingReloadMediaKey = _normalizeMediaKey(
                                    __TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey,
                                );
                                const pendingReloadChannel = _normalizeChannelName(
                                    __TTVAB_STATE__.PendingTriggeredPlayerReloadChannel,
                                );
                                if (
                                    (pendingReloadMediaKey &&
                                        pendingReloadMediaKey !== nextPageContext.MediaKey) ||
                                    (!pendingReloadMediaKey &&
                                        pendingReloadChannel &&
                                        pendingReloadChannel !== nextPageContext.ChannelName)
                                ) {
                                    __TTVAB_STATE__.HasTriggeredPlayerReload = false;
                                    __TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
                                    __TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
                                    __TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
                                }
                            }
                            break;
                        case 'UpdatePreferredQualityGroup':
                            __TTVAB_STATE__.PreferredQualityGroup = data.value || null;
                            break;
                        case 'UpdateCurrentAdContext':
                            {
                                const nextAdContext = _normalizePlaybackContext(data.value);
                                __TTVAB_STATE__.CurrentAdChannel = nextAdContext.ChannelName;
                                __TTVAB_STATE__.CurrentAdMediaKey = nextAdContext.MediaKey;
                            }
                            break;
                        case 'UpdateCurrentAdChannel':
                            __TTVAB_STATE__.CurrentAdChannel = data.value || null;
                            __TTVAB_STATE__.CurrentAdMediaKey =
                                _buildMediaKey('live', data.value || null, null);
                            break;
                        case 'UpdatePinnedBackupPlayerType':
                            __TTVAB_STATE__.PinnedBackupPlayerType = data.value || null;
                            if (data.value) __TTVAB_STATE__.LastPinnedBackupPlayerType = data.value;
                            __TTVAB_STATE__.PinnedBackupPlayerChannel = data.channel || null;
                            __TTVAB_STATE__.PinnedBackupPlayerMediaKey =
                                _buildMediaKey('live', data.channel || null, null);
                            break;
                        case 'UpdatePinnedBackupPlayerContext':
                            {
                                const nextPinnedContext = _normalizePlaybackContext(data.value);
                                __TTVAB_STATE__.PinnedBackupPlayerType = data.value?.type || null;
                                if (data.value?.type) __TTVAB_STATE__.LastPinnedBackupPlayerType = data.value.type;
                                __TTVAB_STATE__.PinnedBackupPlayerChannel = nextPinnedContext.ChannelName;
                                __TTVAB_STATE__.PinnedBackupPlayerMediaKey = nextPinnedContext.MediaKey;
                            }
                            break;
                        case 'ResetPlaybackRecoveryState':
                            __TTVAB_STATE__.HasTriggeredPlayerReload = false;
                            __TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
                            __TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
                            __TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
                            __TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
                            __TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
                            __TTVAB_STATE__.ShouldResumeAfterAd = false;
                            __TTVAB_STATE__.ShouldResumeAfterAdChannel = null;
                            __TTVAB_STATE__.ShouldResumeAfterAdMediaKey = null;
                            __TTVAB_STATE__.ShouldResumeAfterAdUntil = 0;
                            if (data.value?.clearAdContext) {
                                __TTVAB_STATE__.CurrentAdChannel = null;
                                __TTVAB_STATE__.CurrentAdMediaKey = null;
                                __TTVAB_STATE__.PinnedBackupPlayerType = null;
                                __TTVAB_STATE__.PinnedBackupPlayerChannel = null;
                                __TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
                            }
                            break;
                        case 'FetchResponse':
                            {
                                const responseData = data.value;
                                const requestId = responseData?.id || null;
                                const pendingRequests = __TTVAB_STATE__.PendingFetchRequests;
                                if (!requestId || !pendingRequests?.has(requestId)) break;
                                const pendingRequest = pendingRequests.get(requestId);
                                pendingRequests.delete(requestId);
                                if (responseData?.error) {
                                    pendingRequest.reject(responseData.error);
                                } else {
                                    pendingRequest.resolve(responseData);
                                }
                            }
                            break;
                        case 'TriggeredPlayerReload':
                            {
                                const reloadContext = _normalizePlaybackContext(
                                    data.value || {
                                        mediaType: __TTVAB_STATE__.PageMediaType,
                                        channelName: __TTVAB_STATE__.PageChannel,
                                        vodID: __TTVAB_STATE__.PageVodID,
                                        mediaKey: __TTVAB_STATE__.PageMediaKey,
                                    },
                                );
                                __TTVAB_STATE__.HasTriggeredPlayerReload = true;
                                __TTVAB_STATE__.PendingTriggeredPlayerReloadChannel =
                                    reloadContext.ChannelName;
                                __TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey =
                                    reloadContext.MediaKey;
                                __TTVAB_STATE__.PendingTriggeredPlayerReloadAt = Date.now();
                            }
                            break;
                    }
                });
                
                _hookWorkerFetch();
            })();

            ${originalWorkerLoadCode}
            `;

				const blobUrl = URL.createObjectURL(new Blob([injectedCode]));
				super(blobUrl, opts);
				setTimeout(() => URL.revokeObjectURL(blobUrl), 0);

				const getCurrentPageContext = () =>
					_getPlaybackContextFromUrl(window.location.href);
				const normalizeMessagePlaybackContext = (message) =>
					_normalizePlaybackContext({
						MediaKey: message?.mediaKey || message?.pageMediaKey || null,
						ChannelName: message?.channel || message?.pageChannel || null,
						VodID: message?.vodID || null,
					});
				const isPlaybackContextMismatch = (expectedContext, currentContext) => {
					const normalizedExpectedContext =
						_normalizePlaybackContext(expectedContext);
					const normalizedCurrentContext =
						_normalizePlaybackContext(currentContext);
					if (normalizedExpectedContext.MediaKey) {
						return (
							normalizedCurrentContext.MediaKey !==
							normalizedExpectedContext.MediaKey
						);
					}
					if (normalizedExpectedContext.ChannelName) {
						return (
							normalizedCurrentContext.ChannelName !==
							normalizedExpectedContext.ChannelName
						);
					}
					return false;
				};
				const isStalePlaybackEvent = (message) => {
					return isPlaybackContextMismatch(
						normalizeMessagePlaybackContext(message),
						getCurrentPageContext(),
					);
				};
				const handleWorkerFetchRequest = async (fetchRequest) => {
					const rawFetch = window.__TTVAB_REAL_FETCH__ || window.fetch;
					try {
						const response = await rawFetch(
							fetchRequest?.url,
							fetchRequest?.options || {},
						);
						const body = await response.text();
						return {
							id: fetchRequest?.id || null,
							status: response.status,
							statusText: response.statusText,
							headers: Object.fromEntries(response.headers.entries()),
							body,
						};
					} catch (error) {
						return {
							id: fetchRequest?.id || null,
							error: error?.message || String(error),
						};
					}
				};

				this.addEventListener("message", (e) => {
					const data = _getWorkerBridgeMessage(e.data);
					if (!data) return;
					e.stopImmediatePropagation?.();

					switch (data.key) {
						case "FetchRequest":
							void handleWorkerFetchRequest(data.value).then((responseData) => {
								try {
									_postWorkerBridgeMessage(this, {
										key: "FetchResponse",
										value: responseData,
									});
								} catch {}
							});
							break;
						case "AdBlocked":
							if (isStalePlaybackEvent(data)) {
								_log(
									`Ignoring stale AdBlocked event for ${data.mediaKey || data.channel}`,
									"info",
								);
								break;
							}
							{
								const reportedCount = Number.isFinite(data.count as number)
									? Math.max(0, Math.trunc(data.count as number))
									: 0;
								const reportedDelta = Number.isFinite(data.delta as number)
									? Math.max(1, Math.trunc(data.delta as number))
									: 1;
								const currentCount = Number.isFinite(_S.adsBlocked)
									? Math.max(0, Math.trunc(_S.adsBlocked))
									: 0;
								const nextCount =
									reportedCount > currentCount
										? reportedCount
										: currentCount + reportedDelta;
								_S.adsBlocked = nextCount;
							}
							{
								const detail = {
									count: _S.adsBlocked,
									delta: Number.isFinite(data.delta as number)
										? Math.max(1, Math.trunc(data.delta as number))
										: 1,
									channel: data.channel || null,
									mediaKey: data.mediaKey || null,
									pageChannel: data.pageChannel || null,
									pageMediaKey: data.pageMediaKey || null,
								};
								_emitInternalMessage("ttvab-ad-blocked", detail);
								_sendBridgeMessage("ttvab-ad-blocked", detail);
							}
							_log(`Ad blocked! Total: ${_S.adsBlocked}`, "success");
							break;
						case "AdDetected":
							if (isStalePlaybackEvent(data)) {
								_log(
									`Ignoring stale AdDetected event for ${data.mediaKey || data.channel}`,
									"info",
								);
								break;
							}
							{
								const now = Date.now();
								const isContinuation = data.continued === true;
								const detectedContext = _normalizePlaybackContext({
									MediaType: __TTVAB_STATE__.PageMediaType,
									ChannelName:
										data.channel || __TTVAB_STATE__.CurrentAdChannel || null,
									VodID: __TTVAB_STATE__.PageVodID,
									MediaKey:
										data.mediaKey ||
										__TTVAB_STATE__.CurrentAdMediaKey ||
										__TTVAB_STATE__.PageMediaKey,
								});
								const channel = detectedContext.ChannelName;
								const mediaKey = detectedContext.MediaKey;
								const shouldStartNewCycle = isContinuation
									? false
									: !__TTVAB_STATE__.CurrentAdMediaKey ||
										__TTVAB_STATE__.CurrentAdMediaKey !== mediaKey ||
										now - (__TTVAB_STATE__.LastAdDetectedAt || 0) >
											__TTVAB_STATE__.AdCycleStaleMs;
								if (shouldStartNewCycle) {
									if (typeof _clearPlaybackRecoveryTimeouts === "function") {
										_clearPlaybackRecoveryTimeouts();
									}
									__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
									__TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
									if (typeof _rememberPlayerPlaybackForAd === "function") {
										_rememberPlayerPlaybackForAd(channel, mediaKey);
									}
								} else if (
									isContinuation &&
									typeof _rememberPlayerPlaybackForAd === "function"
								) {
									_rememberPlayerPlaybackForAd(channel, mediaKey);
								}
								__TTVAB_STATE__.CurrentAdChannel = channel;
								__TTVAB_STATE__.CurrentAdMediaKey = mediaKey;
								__TTVAB_STATE__.LastAdDetectedAt = now;
							}
							_broadcastWorkers({
								key: "UpdateCurrentAdContext",
								value: {
									channelName: __TTVAB_STATE__.CurrentAdChannel,
									mediaKey: __TTVAB_STATE__.CurrentAdMediaKey,
								},
							});
							if (typeof _ensurePlaybackMonitorsRunning === "function") {
								_ensurePlaybackMonitorsRunning(true);
							}
							_log(
								data.continued === true
									? "Ad recovery continuing after native reload"
									: "Ad detected, blocking...",
								"warning",
							);
							break;
						case "BackupPlayerTypeSelected": {
							if (isStalePlaybackEvent(data)) {
								_log(
									`Ignoring stale backup selection for ${data.mediaKey || data.channel}`,
									"info",
								);
								break;
							}
							const nextPinnedType = data.value || null;
							const nextPinnedContext = _normalizePlaybackContext({
								MediaType: __TTVAB_STATE__.PageMediaType,
								ChannelName:
									data.channel || __TTVAB_STATE__.CurrentAdChannel || null,
								VodID: __TTVAB_STATE__.PageVodID,
								MediaKey:
									data.mediaKey ||
									__TTVAB_STATE__.CurrentAdMediaKey ||
									__TTVAB_STATE__.PageMediaKey,
							});
							if (
								__TTVAB_STATE__.PinnedBackupPlayerType === nextPinnedType &&
								__TTVAB_STATE__.PinnedBackupPlayerChannel ===
									nextPinnedContext.ChannelName &&
								__TTVAB_STATE__.PinnedBackupPlayerMediaKey ===
									nextPinnedContext.MediaKey
							) {
								break;
							}
							__TTVAB_STATE__.PinnedBackupPlayerType = nextPinnedType;
							if (nextPinnedType) {
								__TTVAB_STATE__.LastPinnedBackupPlayerType = nextPinnedType;
							}
							__TTVAB_STATE__.PinnedBackupPlayerChannel =
								nextPinnedContext.ChannelName;
							__TTVAB_STATE__.PinnedBackupPlayerMediaKey =
								nextPinnedContext.MediaKey;
							if (typeof _suppressPauseIntent === "function") {
								_suppressPauseIntent(
									nextPinnedContext.ChannelName,
									nextPinnedContext.MediaKey,
									3000,
								);
							}
							if (typeof _suppressCompetingMediaDuringAd === "function") {
								_suppressCompetingMediaDuringAd(
									nextPinnedContext.ChannelName,
									nextPinnedContext.MediaKey,
								);
								_schedulePlaybackRecoveryTimeout(
									() =>
										_suppressCompetingMediaDuringAd(
											nextPinnedContext.ChannelName,
											nextPinnedContext.MediaKey,
										),
									120,
									nextPinnedContext.ChannelName,
									nextPinnedContext.MediaKey,
								);
							}
							if (typeof _resumeActivePlayerIfPaused === "function") {
								_schedulePlaybackRecoveryTimeout(
									() =>
										_resumeActivePlayerIfPaused(
											nextPinnedContext.ChannelName,
											nextPinnedContext.MediaKey,
										),
									180,
									nextPinnedContext.ChannelName,
									nextPinnedContext.MediaKey,
								);
								_schedulePlaybackRecoveryTimeout(
									() =>
										_resumeActivePlayerIfPaused(
											nextPinnedContext.ChannelName,
											nextPinnedContext.MediaKey,
										),
									650,
									nextPinnedContext.ChannelName,
									nextPinnedContext.MediaKey,
								);
							}
							_broadcastWorkers({
								key: "UpdatePinnedBackupPlayerContext",
								value: {
									type: __TTVAB_STATE__.PinnedBackupPlayerType,
									channelName: __TTVAB_STATE__.PinnedBackupPlayerChannel,
									mediaKey: __TTVAB_STATE__.PinnedBackupPlayerMediaKey,
								},
							});
							_log(`Pinned backup type: ${data.value}`, "info");
							break;
						}
						case "AdEnded":
							if (isStalePlaybackEvent(data)) {
								_log(
									`Ignoring stale AdEnded event for ${data.mediaKey || data.channel}`,
									"info",
								);
								break;
							}
							{
								const channel =
									data.channel || __TTVAB_STATE__.CurrentAdChannel || null;
								const mediaKey =
									data.mediaKey || __TTVAB_STATE__.CurrentAdMediaKey || null;
								__TTVAB_STATE__.CurrentAdChannel = null;
								__TTVAB_STATE__.CurrentAdMediaKey = null;
								__TTVAB_STATE__.PinnedBackupPlayerType = null;
								__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
								__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
								if (typeof _clearPlaybackRecoveryTimeouts === "function") {
									_clearPlaybackRecoveryTimeouts();
								}
								_broadcastWorkers({
									key: "UpdateCurrentAdContext",
									value: null,
								});
								_broadcastWorkers({
									key: "UpdatePinnedBackupPlayerContext",
									value: null,
								});
								if (typeof _resetPlayerBufferMonitorState === "function") {
									_resetPlayerBufferMonitorState();
								}
								if (typeof _clearAdResumeIntent === "function") {
									_clearAdResumeIntent();
								}
								__TTVAB_STATE__._AdRecoveryConsecutiveFailures = 0;
								_log("Ad ended", "success");
								if (typeof _restoreSuppressedMediaAfterAd === "function") {
									_restoreSuppressedMediaAfterAd(channel, mediaKey);
								}
								_schedulePostAdArtifactCleanup(channel, mediaKey);
							}
							break;
						case "PauseResumePlayer":
							_log("Resuming player", "info");
							if (typeof _doPlayerTask === "function") {
								_doPlayerTask(true, false);
							}
							break;
						case "ReloadPlayer":
							if (isStalePlaybackEvent(data)) {
								_log(
									`Ignoring stale ReloadPlayer event for ${data.mediaKey || data.channel}`,
									"info",
								);
								break;
							}
							_log("Reloading player", "info");
							if (typeof _clearPlaybackRecoveryTimeouts === "function") {
								_clearPlaybackRecoveryTimeouts();
							}
							if (typeof _clearAdResumeIntent === "function") {
								_clearAdResumeIntent();
							}
							if (typeof _doPlayerTask === "function") {
								_doPlayerTask(false, true, {
									reason: "ad-recovery",
									refreshAccessToken: data.refreshAccessToken !== false,
									newMediaPlayerInstance: data.newMediaPlayerInstance !== false,
								});
							}
							break;
					}
				});

				const _workerUrl = url;
				const workerOpts = opts;
				let restartAttempts = 0;
				const MAX_RESTART_ATTEMPTS = 3;

				this.addEventListener("error", (e) => {
					if (this.__TTVABIntentionallyTerminated) {
						return;
					}
					_log(`Worker crashed: ${e.message || "Unknown error"}`, "error");

					pruneTrackedWorkers([this]);

					if (restartAttempts < MAX_RESTART_ATTEMPTS) {
						restartAttempts++;
						const delay = 2 ** restartAttempts * 500;
						_log(
							"Restarting worker in " +
								delay / 1000 +
								"s (attempt " +
								restartAttempts +
								"/" +
								MAX_RESTART_ATTEMPTS +
								")",
							"warning",
						);

						setTimeout(() => {
							if (this.__TTVABIntentionallyTerminated) {
								return;
							}
							const currentContext = _getPlaybackContextFromUrl(
								window.location.href,
							);
							if (
								isPlaybackContextMismatch(pagePlaybackContext, currentContext)
							) {
								_log("Skipping stale worker restart after navigation", "info");
								return;
							}
							try {
								new window.Worker(_workerUrl, workerOpts);
								_log("Worker restarted", "success");
								restartAttempts = 0;
							} catch (restartErr) {
								_log(`Worker restart failed: ${restartErr.message}`, "error");
							}
						}, delay);
					} else {
						_log("Worker restart limit reached", "error");
					}
				});

				this.__TTVABCreatedAt = Date.now();
				this.__TTVABPageMediaKey = pagePlaybackContext.MediaKey || null;
				pruneTrackedWorkers();
				_S.workers.push(this);
				try {
					_postWorkerBridgeMessage(this, {
						key: "UpdateToggleState",
						value: __TTVAB_STATE__.IsAdStrippingEnabled,
					});
					_postWorkerBridgeMessage(this, {
						key: "UpdateAdsBlocked",
						value: _S.adsBlocked,
					});
					_postWorkerBridgeMessage(this, {
						key: "UpdatePageContext",
						value: {
							mediaType: __TTVAB_STATE__.PageMediaType,
							channelName: __TTVAB_STATE__.PageChannel,
							vodID: __TTVAB_STATE__.PageVodID,
							mediaKey: __TTVAB_STATE__.PageMediaKey,
						},
					});
					_postWorkerBridgeMessage(this, {
						key: "UpdateCurrentAdContext",
						value: {
							channelName: __TTVAB_STATE__.CurrentAdChannel,
							mediaKey: __TTVAB_STATE__.CurrentAdMediaKey,
						},
					});
					_postWorkerBridgeMessage(this, {
						key: "UpdatePinnedBackupPlayerContext",
						value: {
							type: __TTVAB_STATE__.PinnedBackupPlayerType,
							channelName: __TTVAB_STATE__.PinnedBackupPlayerChannel,
							mediaKey: __TTVAB_STATE__.PinnedBackupPlayerMediaKey,
						},
					});
					} catch {}
				}

				terminate() {
					this.__TTVABIntentionallyTerminated = true;
					pruneTrackedWorkers();
					return super.terminate();
				}
			};

		return _reinsert(HookedWorker, reinsertNames);
	};

	const originalWorkerDescriptor = Object.getOwnPropertyDescriptor(
		window,
		"Worker",
	);
	let rawWorkerInstance = window.Worker;
	let workerInstance = createHookedWorkerConstructor(rawWorkerInstance);
	Object.defineProperty(window, "Worker", {
		configurable: true,
		enumerable: originalWorkerDescriptor?.enumerable ?? false,
		get: () => workerInstance,
		set: (v) => {
			if (!_isValid(v) || v === workerInstance || v === rawWorkerInstance) {
				return;
			}
			rawWorkerInstance = v;
			workerInstance = createHookedWorkerConstructor(rawWorkerInstance);
		},
	});
}

function _hookMainFetch() {
	const realFetch = window.fetch;
	window.__TTVAB_REAL_FETCH__ = realFetch;
	const updateWorkers = (updates) => {
		if (Array.isArray(updates)) {
			for (const msg of updates) {
				_broadcastWorkers(msg);
			}
		} else {
			_broadcastWorkers(updates);
		}
	};
	const rewritePlaybackAccessTokenBody = (bodyText) => {
		if (typeof bodyText !== "string" || !bodyText) {
			return { bodyText, changed: false };
		}

		try {
			const forceType = __TTVAB_STATE__.ForceAccessTokenPlayerType || "autoplay";
			if (
				!forceType ||
				__TTVAB_STATE__.RewriteNativePlaybackAccessToken !== true
			) {
				return { bodyText, changed: false };
			}

			const parsed = JSON.parse(bodyText);
			const operations = Array.isArray(parsed) ? parsed : [parsed];
			let changed = false;
			let previousPlayerType = null;

			for (const op of operations) {
				if (op?.operationName !== "PlaybackAccessToken") continue;
				if (!op.variables || typeof op.variables !== "object") continue;
				if (typeof op.variables.playerType === "string") {
					if (op.variables.playerType !== forceType) {
						previousPlayerType = previousPlayerType || op.variables.playerType;
						op.variables.playerType = forceType;
						changed = true;
					}
					const expectedPlatform = forceType === "autoplay" ? "android" : "web";
					if (op.variables.platform !== expectedPlatform) {
						op.variables.platform = expectedPlatform;
						changed = true;
					}
				}
			}

			if (changed) {
				_log(
					`Replaced native PlaybackAccessToken player type '${previousPlayerType}' with '${forceType}'`,
					"info",
				);
				return {
					bodyText: JSON.stringify(parsed),
					changed: true,
				};
			}
		} catch {}

		return { bodyText, changed: false };
	};
	const isPictureInPicturePlaybackAccessTokenBody = (bodyText) => {
		if (
			typeof bodyText !== "string" ||
			!bodyText ||
			!bodyText.includes("PlaybackAccessToken")
		) {
			return false;
		}

		try {
			const parsed = JSON.parse(bodyText);
			const operations = Array.isArray(parsed) ? parsed : [parsed];
			return operations.some((op) => {
				if (op?.operationName !== "PlaybackAccessToken") return false;
				const playerType = op?.variables?.playerType;
				return (
					typeof playerType === "string" &&
					playerType.toLowerCase().includes("picture-by-picture")
				);
			});
		} catch {
			return bodyText.toLowerCase().includes("picture-by-picture");
		}
	};
	const updatePlaybackAccessTokenHash = (hash) => {
		if (!hash || __TTVAB_STATE__.PlaybackAccessTokenHash === hash) return;
		__TTVAB_STATE__.PlaybackAccessTokenHash = hash;
		updateWorkers([{ key: "UpdateGQLHash", value: hash }]);
	};
	const updateNativePlaybackAccessTokenPlayerType = (playerType) => {
		if (
			!playerType ||
			__TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType === playerType
		) {
			return;
		}
		__TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType = playerType;
		updateWorkers([
			{
				key: "UpdateLastNativePlaybackAccessTokenPlayerType",
				value: playerType,
			},
		]);
	};
	const processGqlBody = (bodyText) => {
		if (typeof bodyText !== "string" || !bodyText) return;
		try {
			const data = JSON.parse(bodyText);
			const operations = Array.isArray(data) ? data : [data];
			for (const op of operations) {
				if (
					op?.operationName === "PlaybackAccessToken" &&
					op.extensions?.persistedQuery?.sha256Hash
				) {
					updatePlaybackAccessTokenHash(
						op.extensions.persistedQuery.sha256Hash,
					);
				}
			}
		} catch {}
	};
	const processGqlResponse = async (response) => {
		if (!response || response.status !== 200) return;
		try {
			const payload = await response.clone().json();
			const operations = Array.isArray(payload) ? payload : [payload];
			for (const op of operations) {
				const extractedToken = _extractPlaybackAccessToken(op);
				const tokenValue = extractedToken?.value || null;
				if (typeof tokenValue !== "string" || !tokenValue) continue;
				try {
					const tokenPayload = JSON.parse(tokenValue);
					const effectivePlayerType =
						tokenPayload?.playerType || tokenPayload?.player_type || null;
					if (typeof effectivePlayerType === "string") {
						updateNativePlaybackAccessTokenPlayerType(effectivePlayerType);
					}
				} catch {}
			}
		} catch {}
	};

	window.fetch = async function (...args) {
		const [url, opts] = args;
		if (url) {
			const urlStr = url instanceof Request ? url.url : url.toString();
			if (urlStr.includes("gql.twitch.tv/gql")) {
				_syncStoredDeviceId();
				let nextArgs = args;
				let headers = opts?.headers;
				let shouldSkipPlaybackAccessTokenState = false;

				if (url instanceof Request) {
					let effectiveRequest = url;
					try {
						if (opts && Object.keys(opts).length > 0) {
							effectiveRequest = new Request(url, opts);
						}
						headers = effectiveRequest.headers;
						const text = await effectiveRequest.clone().text();
						shouldSkipPlaybackAccessTokenState =
							isPictureInPicturePlaybackAccessTokenBody(text);
						if (!shouldSkipPlaybackAccessTokenState) {
							const rewritten = rewritePlaybackAccessTokenBody(text);
							processGqlBody(rewritten.bodyText);
							if (rewritten.changed) {
								nextArgs = [
									new Request(effectiveRequest, {
										body: rewritten.bodyText,
									}),
								];
							} else if (effectiveRequest !== url || args.length !== 1) {
								nextArgs = [effectiveRequest];
							}
						} else if (effectiveRequest !== url || args.length !== 1) {
							nextArgs = [effectiveRequest];
						}
					} catch (_e) {}
				} else if (typeof opts?.body === "string") {
					shouldSkipPlaybackAccessTokenState =
						isPictureInPicturePlaybackAccessTokenBody(opts.body);
					if (!shouldSkipPlaybackAccessTokenState) {
						const rewritten = rewritePlaybackAccessTokenBody(opts.body);
						processGqlBody(rewritten.bodyText);
						if (rewritten.changed) {
							nextArgs = [url, { ...(opts || {}), body: rewritten.bodyText }];
						}
					}
				}

				if (headers) {
					const getHeader = (key) => {
						if (headers instanceof Headers) {
							return headers.get(key) || headers.get(key.toLowerCase());
						}
						if (Array.isArray(headers)) {
							const target = key.toLowerCase();
							const entry = headers.find(
								(header) =>
									Array.isArray(header) &&
									String(header[0] || "").toLowerCase() === target,
							);
							return entry?.[1];
						}
						return headers[key] || headers[key.toLowerCase()];
					};

					const updates = [];
					const integrity = getHeader("Client-Integrity");
					const auth = getHeader("Authorization");
					const version = getHeader("Client-Version");
					const session = getHeader("Client-Session-Id");
					const device = getHeader("X-Device-Id");

					if (
						integrity &&
						__TTVAB_STATE__.ClientIntegrityHeader !== integrity
					) {
						__TTVAB_STATE__.ClientIntegrityHeader = integrity;
						updates.push({
							key: "UpdateClientIntegrityHeader",
							value: __TTVAB_STATE__.ClientIntegrityHeader,
						});
					}
					if (auth && __TTVAB_STATE__.AuthorizationHeader !== auth) {
						__TTVAB_STATE__.AuthorizationHeader = auth;
						updates.push({
							key: "UpdateAuthorizationHeader",
							value: __TTVAB_STATE__.AuthorizationHeader,
						});
					}
					if (version && __TTVAB_STATE__.ClientVersion !== version) {
						__TTVAB_STATE__.ClientVersion = version;
						updates.push({
							key: "UpdateClientVersion",
							value: __TTVAB_STATE__.ClientVersion,
						});
					}
					if (session && __TTVAB_STATE__.ClientSession !== session) {
						__TTVAB_STATE__.ClientSession = session;
						updates.push({
							key: "UpdateClientSession",
							value: __TTVAB_STATE__.ClientSession,
						});
					}
					if (device && __TTVAB_STATE__.GQLDeviceID !== device) {
						__TTVAB_STATE__.GQLDeviceID = device;
						updates.push({
							key: "UpdateDeviceId",
							value: __TTVAB_STATE__.GQLDeviceID,
						});
					}

					updateWorkers(updates);
				}
				const response = await realFetch.apply(this, nextArgs);
				if (!shouldSkipPlaybackAccessTokenState) {
					await processGqlResponse(response);
				}
				return response;
			}
		}
		return realFetch.apply(this, args);
	};
}
