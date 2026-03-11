// TTV AB - Hooks

function _hookWorkerFetch() {
	_log("Worker fetch hooked", "info");
	const realFetch = fetch;
	const EMPTY_SEGMENT_URL =
		"data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292";

	function _pruneStreamInfos() {
		const keys = Object.keys(__TTVAB_STATE__.StreamInfos);
		if (keys.length > 5) {
			const oldKey = keys[0];
			delete __TTVAB_STATE__.StreamInfos[oldKey];
			for (const url in __TTVAB_STATE__.StreamInfosByUrl) {
				if (__TTVAB_STATE__.StreamInfosByUrl[url].ChannelName === oldKey) {
					delete __TTVAB_STATE__.StreamInfosByUrl[url];
				}
			}
		}
	}

	function _syncStreamInfo(_channel, info, encodings, usherUrl) {
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
			if (
				lines[i]?.startsWith("#EXT-X-STREAM-INF") &&
				lines[i + 1]?.includes(".m3u8")
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
					info.Urls[variantUrl] = resInfo;
					info.Urls[lines[i + 1]] = resInfo;
					info.ResolutionList.push(resInfo);
				}
				__TTVAB_STATE__.StreamInfosByUrl[variantUrl] = info;
				__TTVAB_STATE__.StreamInfosByUrl[lines[i + 1]] = info;
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

	fetch = async function (...args) {
		const [resource, opts] = args;
		const requestUrl =
			typeof resource === "string"
				? resource
				: resource instanceof URL
					? resource.href
					: typeof Request !== "undefined" && resource instanceof Request
						? resource.url
						: null;

		if (!requestUrl) {
			return realFetch.apply(this, args);
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

		if (__TTVAB_STATE__.AdSegmentCache.has(url) || (typeof _isKnownAdSegmentUrl === 'function' && _isKnownAdSegmentUrl(url))) {
			return realFetch(EMPTY_SEGMENT_URL);
		}

		if (url.includes("/channel/hls/")) {
			__TTVAB_STATE__.V2API = url.includes("/api/v2/");
			const channelMatch = new URL(url).pathname.match(/([^/]+)(?=\.\w+$)/);
			const channel = channelMatch?.[0];

			if (__TTVAB_STATE__.ForceAccessTokenPlayerType) {
				const urlObj = new URL(url);
				urlObj.searchParams.delete("parent_domains");
				url = urlObj.toString();
			}

			const response = await realFetch.apply(this, getFetchArgs(url));
			if (response.status !== 200) return response;

			const encodings = await response.text();
			const serverTime = _getServerTime(encodings);
			let info = __TTVAB_STATE__.StreamInfos[channel];

			if (info?.EncodingsM3U8) {
				const now = Date.now();
				const lastStaleCheck = info._lastStaleCheckAt || 0;
				if (now - lastStaleCheck > 10000) {
					info._lastStaleCheckAt = now;
					const m3u8Match = info.EncodingsM3U8.match(/^https:.*\.m3u8$/m);
					if (m3u8Match && (await realFetch(m3u8Match[0])).status !== 200) {
						info = null;
					}
				}
			}

			const isNewInfo = !info?.EncodingsM3U8;
			if (isNewInfo) {
				_pruneStreamInfos();
				info = __TTVAB_STATE__.StreamInfos[channel] = {
					ChannelName: channel,
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
					FailedBackupPlayerTypes: new Set(),
					Urls: Object.create(null),
					ResolutionList: [],
					BackupEncodingsM3U8Cache: Object.create(null),
					ActiveBackupPlayerType: null,
					ActiveBackupResolution: null,
					IsMidroll: false,
					IsStrippingAdSegments: false,
					NumStrippedAdSegments: 0,
					LastActivityAt: Date.now(),
				};
			}

			_syncStreamInfo(channel, info, encodings, url);
			info.LastActivityAt = Date.now();

			if (isNewInfo) {
				_log(`Stream initialized: ${channel}`, "success");
			}

			const playlist = info.IsUsingModifiedM3U8
				? info.ModifiedM3U8
				: info.EncodingsM3U8;
			return new Response(
				_replaceServerTime(playlist, serverTime),
				responseInit(response),
			);
		}

		if (/\.m3u8(?:$|\?)/.test(url)) {
			const response = await realFetch.apply(this, getFetchArgs(url));
			if (response.status === 200) {
				const text = await response.text();
				return new Response(
					await _processM3U8(url, text, realFetch),
					responseInit(response),
				);
			}
			return response;
		}

		return realFetch.apply(this, args);
	};
}

function _hookWorker() {
	const reinsertNames = _getReinsert(window.Worker);
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

	const HookedWorker = class Worker extends _cleanWorker(window.Worker) {
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

			const injectedCode = `
                const _C = ${JSON.stringify(_C)};
                const _S = ${JSON.stringify(_S)};
                const _ATTR_REGEX = ${_ATTR_REGEX.toString()};
                ${_log.toString()}
                ${_declareState.toString()}
                ${_incrementAdsBlocked.toString()}
                ${_parseAttrs.toString()}
                ${_getServerTime.toString()}
                ${_replaceServerTime.toString()}
                ${_hasExplicitAdMetadata.toString()}
                ${_isKnownAdSegmentUrl.toString()}
                ${_playlistHasKnownAdSegments.toString()}
                ${_stripAds.toString()}
                ${_getStreamVariantInfo.toString()}
                ${_getStreamUrl.toString()}
                ${_getFallbackResolution.toString()}
                ${_getStreamVariantInfo.toString()}
                ${_collectPlaybackAccessTokenSources.toString()}
                ${_summarizePlaybackAccessTokenPayload.toString()}
                ${_getPlaybackAccessTokenErrors.toString()}
                ${_extractPlaybackAccessToken.toString()}
                ${_isWorkerContext.toString()}
                ${_createFetchRelayResponse.toString()}
                ${_fetchViaWorkerBridge.toString()}
                ${_getToken.toString()}
                ${_resetStreamAdState.toString()}
                ${_getStreamInfoForPlaylist.toString()}
                ${_hasPlaylistAdMarkers.toString()}
                ${_getFallbackPromotionPolicy.toString()}
                ${_processM3U8.toString()}
                ${_findBackupStream.toString()}
                ${_getWasmJs.toString()}
                ${_hookWorkerFetch.toString()}
                
                const _GQL_URL = '${_GQL_URL}';
                const wasmSource = _getWasmJs('${workerSourceUrl.replaceAll("'", "%27")}');
                _declareState(self);
                __TTVAB_STATE__.GQLDeviceID = ${JSON.stringify(__TTVAB_STATE__.GQLDeviceID)};
                __TTVAB_STATE__.AuthorizationHeader = ${JSON.stringify(__TTVAB_STATE__.AuthorizationHeader)};
                __TTVAB_STATE__.ClientIntegrityHeader = ${JSON.stringify(__TTVAB_STATE__.ClientIntegrityHeader)};
                __TTVAB_STATE__.ClientVersion = ${JSON.stringify(__TTVAB_STATE__.ClientVersion)};
                __TTVAB_STATE__.ClientSession = ${JSON.stringify(__TTVAB_STATE__.ClientSession)};
                __TTVAB_STATE__.PlaybackAccessTokenHash = ${JSON.stringify(__TTVAB_STATE__.PlaybackAccessTokenHash)};
                __TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType = ${JSON.stringify(__TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType)};
                __TTVAB_STATE__.CurrentAdChannel = ${JSON.stringify(__TTVAB_STATE__.CurrentAdChannel)};
                __TTVAB_STATE__.PinnedBackupPlayerType = ${JSON.stringify(__TTVAB_STATE__.PinnedBackupPlayerType)};
                __TTVAB_STATE__.PinnedBackupPlayerChannel = ${JSON.stringify(__TTVAB_STATE__.PinnedBackupPlayerChannel)};
                __TTVAB_STATE__.IsAdStrippingEnabled = ${JSON.stringify(__TTVAB_STATE__.IsAdStrippingEnabled)};
                __TTVAB_STATE__.PageChannel = ${JSON.stringify((window.location.pathname.match(/^\/([a-zA-Z0-9_]+)/) || [])[1] || null)};
                
                self.addEventListener('message', function(e) {
                    const data = e.data;
                    if (!data?.key) return;
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
                        case 'UpdateCurrentAdChannel': __TTVAB_STATE__.CurrentAdChannel = data.value || null; break;
                        case 'UpdatePinnedBackupPlayerType':
                            __TTVAB_STATE__.PinnedBackupPlayerType = data.value || null;
                            __TTVAB_STATE__.PinnedBackupPlayerChannel = data.channel || null;
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
                        case 'TriggeredPlayerReload': __TTVAB_STATE__.HasTriggeredPlayerReload = true; break;
                    }
                });
                
                _hookWorkerFetch();
                eval(wasmSource);
            `;

			const blobUrl = URL.createObjectURL(new Blob([injectedCode]));
			super(blobUrl, opts);
			setTimeout(() => URL.revokeObjectURL(blobUrl), 0);

			const getCurrentPageChannel = () => {
				const match = window.location.pathname.match(/^\/([^/?#]+)/);
				const candidate = match?.[1] || null;
				if (!candidate) return null;
				const reserved = new Set([
					"browse",
					"directory",
					"downloads",
					"drops",
					"following",
					"friends",
					"inventory",
					"jobs",
					"messages",
					"search",
					"settings",
					"subscriptions",
					"turbo",
					"videos",
					"wallet",
				]);
				return reserved.has(candidate.toLowerCase()) ? null : candidate;
			};
			const isStaleChannelEvent = (channel) => {
				if (!channel) return false;
				const currentChannel = getCurrentPageChannel();
				return Boolean(currentChannel && currentChannel !== channel);
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
				if (!e.data?.key) return;

				switch (e.data.key) {
					case "FetchRequest":
						void handleWorkerFetchRequest(e.data.value).then((responseData) => {
							try {
								this.postMessage({
									key: "FetchResponse",
									value: responseData,
								});
							} catch {}
						});
						break;
					case "AdBlocked":
						if (isStaleChannelEvent(e.data.channel || null)) {
							_log(
								`Ignoring stale AdBlocked event for ${e.data.channel}`,
								"info",
							);
							break;
						}
						_S.adsBlocked = e.data.count;
						window.postMessage(
							{
								type: "ttvab-ad-blocked",
								detail: {
									count: e.data.count,
									channel: e.data.channel || null,
								},
							},
							"*",
						);
						_log(`Ad blocked! Total: ${e.data.count}`, "success");
						break;
					case "AdDetected":
						if (isStaleChannelEvent(e.data.channel || null)) {
							_log(
								`Ignoring stale AdDetected event for ${e.data.channel}`,
								"info",
							);
							break;
						}
						{
							const now = Date.now();
							const channel =
								e.data.channel || __TTVAB_STATE__.CurrentAdChannel || null;
							const shouldStartNewCycle =
								!__TTVAB_STATE__.CurrentAdChannel ||
								__TTVAB_STATE__.CurrentAdChannel !== channel ||
								now - (__TTVAB_STATE__.LastAdDetectedAt || 0) >
									__TTVAB_STATE__.AdCycleStaleMs;
							if (shouldStartNewCycle) {
								__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
								__TTVAB_STATE__.PinnedBackupPlayerType = null;
								__TTVAB_STATE__.PinnedBackupPlayerChannel = channel;
							}
							__TTVAB_STATE__.CurrentAdChannel = channel;
							__TTVAB_STATE__.LastAdDetectedAt = now;
						}
						_broadcastWorkers({
							key: "UpdateCurrentAdChannel",
							value: __TTVAB_STATE__.CurrentAdChannel,
						});
						_log("Ad detected, blocking...", "warning");
						break;
					case "BackupPlayerTypeSelected":
						if (isStaleChannelEvent(e.data.channel || null)) {
							_log(
								`Ignoring stale backup selection for ${e.data.channel}`,
								"info",
							);
							break;
						}
						const nextPinnedType = e.data.value || null;
						const nextPinnedChannel =
							e.data.channel || __TTVAB_STATE__.CurrentAdChannel || null;
						if (
							__TTVAB_STATE__.PinnedBackupPlayerType === nextPinnedType &&
							__TTVAB_STATE__.PinnedBackupPlayerChannel === nextPinnedChannel
						) {
							break;
						}
						__TTVAB_STATE__.PinnedBackupPlayerType = nextPinnedType;
						__TTVAB_STATE__.PinnedBackupPlayerChannel = nextPinnedChannel;
						_broadcastWorkers({
							key: "UpdatePinnedBackupPlayerType",
							value: __TTVAB_STATE__.PinnedBackupPlayerType,
							channel: __TTVAB_STATE__.PinnedBackupPlayerChannel,
						});
						_log(`Pinned backup type: ${e.data.value}`, "info");
						break;
					case "AdEnded":
						if (isStaleChannelEvent(e.data.channel || null)) {
							_log(
								`Ignoring stale AdEnded event for ${e.data.channel}`,
								"info",
							);
							break;
						}
						__TTVAB_STATE__.CurrentAdChannel = null;
						__TTVAB_STATE__.PinnedBackupPlayerType = null;
						__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
						__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
						_broadcastWorkers({
							key: "UpdateCurrentAdChannel",
							value: null,
						});
						_broadcastWorkers({
							key: "UpdatePinnedBackupPlayerType",
							value: null,
							channel: null,
						});
						_log("Ad ended", "success");
						try {
							const removableSelectors = [
								'[data-a-target="video-player-pip-container"]',
								'[data-a-target="video-player-mini-player"]',
								".video-player__pip-container",
								".video-player__mini-player",
								".mini-player",
								'[class*="mini-player"]',
								'[class*="pip-container"]',
								'div[data-test-selector="display-ad"]',
								'[data-a-target="ads-banner"]',
							];
							const resetOnlySelectors = [
								".stream-display-ad",
								'[class*="stream-display-ad"]',
								".video-player--stream-display-ad",
								'[class*="video-player--stream-display-ad"]',
							];
							removableSelectors.forEach((sel) => {
								document.querySelectorAll(sel).forEach((el) => {
									el.style.display = "none";
									el.remove();
								});
							});
							resetOnlySelectors.forEach((sel) => {
								document.querySelectorAll(sel).forEach((el) => {
									if (
										typeof el.className === "string" &&
										el.className.includes("stream-display-ad")
									) {
										el.className = el.className
											.split(/\s+/)
											.filter(
												(className) =>
													className && !className.includes("stream-display-ad"),
											)
											.join(" ");
									}
									if (
										el.querySelector?.("video") ||
										el.matches?.('[data-a-target="video-player"]') ||
										el.matches?.('[class*="video-player"]')
									) {
										el.style.removeProperty("display");
										el.style.removeProperty("visibility");
										el.style.setProperty("padding", "0", "important");
										el.style.setProperty("margin", "0", "important");
										el.style.setProperty(
											"background",
											"transparent",
											"important",
										);
										el.style.setProperty(
											"background-color",
											"transparent",
											"important",
										);
										el.style.setProperty("width", "100%", "important");
										el.style.setProperty("height", "100%", "important");
										el.style.setProperty("max-width", "100%", "important");
										el.style.setProperty("max-height", "100%", "important");
										el.style.setProperty("inset", "0", "important");
									} else {
										el.style.display = "none";
										el.remove();
									}
								});
							});
						} catch (_e) {}
						break;
					case "PauseResumePlayer":
						_log("Resuming player", "info");
						if (typeof _doPlayerTask === "function") {
							_doPlayerTask(true, false);
						}
						break;
					case "ReloadPlayer":
						_log("Reloading player", "info");
						if (typeof _doPlayerTask === "function") {
							_doPlayerTask(false, true);
						}
						break;
				}
			});

			const workerUrl = url;
			const workerOpts = opts;
			let restartAttempts = 0;
			const MAX_RESTART_ATTEMPTS = 3;

			this.addEventListener("error", (e) => {
				if (this.__TTVABIntentionallyTerminated) {
					return;
				}
				_log(`Worker crashed: ${e.message || "Unknown error"}`, "error");

				const idx = _S.workers.indexOf(this);
				if (idx > -1) _S.workers.splice(idx, 1);

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
						try {
							new window.Worker(workerUrl, workerOpts);
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

			_S.workers.push(this);
			try {
				this.postMessage({
					key: "UpdateToggleState",
					value: __TTVAB_STATE__.IsAdStrippingEnabled,
				});
				this.postMessage({ key: "UpdateAdsBlocked", value: _S.adsBlocked });
				this.postMessage({
					key: "UpdateCurrentAdChannel",
					value: __TTVAB_STATE__.CurrentAdChannel,
				});
				this.postMessage({
					key: "UpdatePinnedBackupPlayerType",
					value: __TTVAB_STATE__.PinnedBackupPlayerType,
					channel: __TTVAB_STATE__.PinnedBackupPlayerChannel,
				});
			} catch {}

			if (_S.workers.length > 5) {
				const oldWorker = _S.workers.shift();
				try {
					oldWorker.__TTVABIntentionallyTerminated = true;
					oldWorker.terminate();
				} catch {}
			}
		}
	};

	let workerInstance = _reinsert(HookedWorker, reinsertNames);
	Object.defineProperty(window, "Worker", {
		get: () => workerInstance,
		set: (v) => {
			if (_isValid(v)) workerInstance = v;
		},
	});
}

function _hookStorage() {
	try {
		const originalGetItem = localStorage.getItem.bind(localStorage);
		localStorage.getItem = (key) => {
			const value = originalGetItem(key);
			if (key === "unique_id" && value) __TTVAB_STATE__.GQLDeviceID = value;
			return value;
		};
		const deviceId = originalGetItem("unique_id");
		if (deviceId) __TTVAB_STATE__.GQLDeviceID = deviceId;
	} catch (e) {
		_log(`Storage hook error: ${e.message}`, "warning");
	}
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
		if (
			typeof bodyText !== "string" ||
			!bodyText
		) {
			return { bodyText, changed: false };
		}

		try {
			const forceType = __TTVAB_STATE__.ForceAccessTokenPlayerType;
			if (!forceType) {
				return { bodyText, changed: false };
			}
			const parsed = JSON.parse(bodyText);
			const operations = Array.isArray(parsed) ? parsed : [parsed];
			let changed = false;
			let previousPlayerType = null;

			for (const op of operations) {
				if (op?.operationName !== "PlaybackAccessToken") continue;
				if (!op.variables || typeof op.variables !== "object") continue;
				if (
					typeof op.variables.playerType === "string" &&
					op.variables.playerType !== forceType
				) {
					previousPlayerType = previousPlayerType || op.variables.playerType;
					op.variables.playerType = forceType;
					op.variables.platform = forceType === "autoplay" ? "android" : "web";
					changed = true;
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
				let nextArgs = args;
				let headers = opts?.headers;

				if (url instanceof Request) {
					headers = url.headers;
					try {
						const clone = url.clone();
						const text = await clone.text();
						const rewritten = rewritePlaybackAccessTokenBody(text);
						processGqlBody(rewritten.bodyText);
						if (rewritten.changed) {
							nextArgs = [
								new Request(url, {
									...(opts || {}),
									body: rewritten.bodyText,
								}),
							];
						}
					} catch (_e) {}
				} else if (typeof opts?.body === "string") {
					const rewritten = rewritePlaybackAccessTokenBody(opts.body);
					processGqlBody(rewritten.bodyText);
					if (rewritten.changed) {
						nextArgs = [url, { ...(opts || {}), body: rewritten.bodyText }];
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
				await processGqlResponse(response);
				return response;
			}
		}
		return realFetch.apply(this, args);
	};
}
