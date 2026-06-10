// TTV AB - API

const _GQL_URL = "https://gql.twitch.tv/gql";

function _collectPlaybackAccessTokenSources(payload) {
	const queue = Array.isArray(payload) ? [...payload] : [payload];
	const seen = new Set();
	const tokenSources = [];

	const pushTokenSource = (value) => {
		if (!value || typeof value !== "object" || tokenSources.includes(value))
			return;
		tokenSources.push(value);
	};

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || typeof current !== "object" || seen.has(current)) continue;
		seen.add(current);

		pushTokenSource(current?.data?.streamPlaybackAccessToken);
		pushTokenSource(current?.data?.videoPlaybackAccessToken);
		pushTokenSource(current?.streamPlaybackAccessToken);
		pushTokenSource(current?.videoPlaybackAccessToken);

		if (
			current?.__typename === "PlaybackAccessToken" ||
			typeof current?.signature === "string" ||
			typeof current?.sig === "string" ||
			typeof current?.value === "string" ||
			typeof current?.token === "string"
		) {
			pushTokenSource(current);
		}

		const values = Array.isArray(current) ? current : Object.values(current);
		for (const value of values) {
			if (value && typeof value === "object") queue.push(value);
		}
	}

	return tokenSources;
}

function _summarizePlaybackAccessTokenPayload(payload) {
	if (Array.isArray(payload)) {
		const firstKeys =
			payload[0] && typeof payload[0] === "object"
				? Object.keys(payload[0]).slice(0, 6).join(",")
				: "";
		return `array(len=${payload.length}${firstKeys ? `, first=${firstKeys}` : ""})`;
	}

	if (payload && typeof payload === "object") {
		const keys = Object.keys(payload).slice(0, 8).join(",");
		return `object(${keys || "no-keys"})`;
	}

	return typeof payload;
}

function _getPlaybackAccessTokenErrors(payload) {
	const entries = Array.isArray(payload) ? payload : [payload];
	const messages = [];

	for (const entry of entries) {
		if (!Array.isArray(entry?.errors)) continue;
		for (const error of entry.errors) {
			const message =
				error?.message ||
				error?.extensions?.message ||
				error?.extensions?.error ||
				null;
			if (typeof message === "string" && message) {
				messages.push(message);
			}
		}
	}

	return messages;
}

function _extractPlaybackAccessToken(payload) {
	const tokenSources = _collectPlaybackAccessTokenSources(payload);

	for (const token of tokenSources) {
		const signature = token?.signature || token?.sig || null;
		const value = token?.value || token?.token || null;
		if (signature && value) {
			return { signature, value };
		}
	}

	return {
		signature: null,
		value: null,
		hasAnySignature: tokenSources.some((token) =>
			Boolean(token?.signature || token?.sig),
		),
		hasAnyValue: tokenSources.some((token) =>
			Boolean(token?.value || token?.token),
		),
		errors: _getPlaybackAccessTokenErrors(payload),
		summary: _summarizePlaybackAccessTokenPayload(payload),
	};
}

function _isWorkerContext() {
	return (
		typeof WorkerGlobalScope !== "undefined" &&
		typeof self !== "undefined" &&
		self instanceof WorkerGlobalScope
	);
}

function _createFetchRelayResponse(payload, requestUrl = null) {
	if (!payload || typeof payload !== "object") {
		throw new Error("invalid fetch relay response");
	}

	if (payload.error) {
		throw new Error(payload.error);
	}

	const body = payload.body ?? "";
	const nullBodyStatus =
		payload.status === 101 ||
		payload.status === 204 ||
		payload.status === 205 ||
		payload.status === 304;
	const response = new Response(nullBodyStatus ? null : body, {
		status: payload.status,
		statusText: payload.statusText,
		headers: payload.headers,
	});

	const finalUrl = payload.url || requestUrl;
	if (finalUrl) {
		Object.defineProperty(response, "url", { value: finalUrl });
	}
	if (typeof payload.ok === "boolean") {
		Object.defineProperty(response, "ok", { value: payload.ok });
	}
	if (typeof payload.redirected === "boolean") {
		Object.defineProperty(response, "redirected", {
			value: payload.redirected,
		});
	}

	return response;
}

async function _fetchViaWorkerBridge(url, options, timeoutMs = 5000) {
	if (!_isWorkerContext() || typeof self?.postMessage !== "function") {
		return null;
	}

	let pendingRequests = __TTVAB_STATE__.PendingFetchRequests;
	if (!pendingRequests) {
		pendingRequests = new Map();
		__TTVAB_STATE__.PendingFetchRequests = pendingRequests;
	}
	const nextSeq = (__TTVAB_STATE__.FetchRequestSeq || 0) + 1;
	__TTVAB_STATE__.FetchRequestSeq = nextSeq;
	const requestId = `fetch-${Date.now()}-${nextSeq}`;

	return new Promise((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			pendingRequests.delete(requestId);
			reject(new Error("fetch relay timeout"));
		}, timeoutMs);

		pendingRequests.set(requestId, {
			resolve: (payload) => {
				clearTimeout(timeoutId);
				try {
					resolve(_createFetchRelayResponse(payload, url));
				} catch (error) {
					reject(error);
				}
			},
			reject: (error) => {
				clearTimeout(timeoutId);
				reject(
					error instanceof Error
						? error
						: new Error(
								String(error?.message || error || "fetch relay failed"),
							),
				);
			},
		});

		_postWorkerBridgeMessage(self, {
			key: "FetchRequest",
			value: {
				id: requestId,
				url,
				options,
			},
		});
	});
}

async function _getToken(playbackContext, playerType, realFetch) {
	const fetchFunc = realFetch || fetch;
	const reqPlayerType = playerType;
	const normalizedContext =
		typeof playbackContext === "string"
			? _normalizePlaybackContext({
					MediaType: "live",
					ChannelName: playbackContext,
				})
			: _normalizePlaybackContext(playbackContext);
	const isVodRequest =
		normalizedContext.MediaType === "vod" && Boolean(normalizedContext.VodID);
	const logTarget = isVodRequest
		? `vod ${normalizedContext.VodID}`
		: normalizedContext.ChannelName || "unknown";

	const body = {
		operationName: "PlaybackAccessToken",
		extensions: {
			persistedQuery: {
				version: 1,
				sha256Hash:
					__TTVAB_STATE__.PlaybackAccessTokenHash ||
					"ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9",
			},
		},
		variables: {
			isLive: !isVodRequest,
			login: isVodRequest ? "" : normalizedContext.ChannelName || "",
			isVod: isVodRequest,
			vodID: isVodRequest ? normalizedContext.VodID || "" : "",
			playerType: reqPlayerType,
			platform: reqPlayerType === "autoplay" ? "android" : "web",
		},
	};

	const maxRetries = 2;
	let lastError = null;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		if (attempt > 0) {
			await new Promise((r) => setTimeout(r, attempt * 500));
		}

		try {
			_log(
				`[Trace] Requesting token for ${playerType} (${logTarget})${attempt > 0 ? ` retry ${attempt}` : ""}`,
				"info",
			);
			const acceptLanguage =
				navigator?.languages?.join(",") || navigator?.language || "en-US";

			const headers: Record<string, string> = {
				"Client-ID": _C.CLIENT_ID,
				"X-Device-Id": __TTVAB_STATE__.GQLDeviceID || "oauth",
				"Client-Version": __TTVAB_STATE__.ClientVersion || "k8s-v1",
				"Client-Session-Id": __TTVAB_STATE__.ClientSession || "",
				"Accept-Language": acceptLanguage,
			};

			if (__TTVAB_STATE__.ClientIntegrityHeader) {
				headers["Client-Integrity"] = __TTVAB_STATE__.ClientIntegrityHeader;
			}

			if (__TTVAB_STATE__.AuthorizationHeader) {
				headers.Authorization = __TTVAB_STATE__.AuthorizationHeader;
			}

			const requestOptions = {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			};
			let res = null;

			if (typeof _fetchViaWorkerBridge === "function") {
				try {
					res = await _fetchViaWorkerBridge(_GQL_URL, requestOptions, 5000);
				} catch (bridgeError) {
					_log(`Spoof relay error: ${bridgeError.message}`, "warning");
				}
			}

			if (!res) {
				res = await _fetchWithTimeout(
					fetchFunc,
					_GQL_URL,
					requestOptions,
					3000,
				);
			}

			_log(`[Trace] Token response: ${res.status}`, "info");
			return res;
		} catch (e) {
			lastError = e;
			if (
				attempt < maxRetries &&
				(e.name === "AbortError" ||
					e.name === "TimeoutError" ||
					e.message?.includes("timeout"))
			) {
				_log(
					`Token fetch retry ${attempt + 1}/${maxRetries}: ${e.message}`,
					"warning",
				);
				continue;
			}
			break;
		}
	}

	_log(
		`Token fetch failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
		"error",
	);
	return new Response(null, { status: 0 });
}

async function _notifyAdComplete(
	textStr: string,
	info?: { SpoofedAdIds?: Set<string>; ActiveBackupPlayerType?: string | null },
): Promise<void> {
	try {
		if (__TTVAB_STATE__.DisableAdSpoofing) return;
		if (!textStr || typeof textStr !== "string") return;

		const matches = [
			...textStr.matchAll(/#EXT-X-DATERANGE:(ID="stitched-ad-[^\n]+)\n/g),
		];
		if (matches.length === 0) {
			if (!__TTVAB_STATE__.LoggedAdSpoofNoMatch) {
				__TTVAB_STATE__.LoggedAdSpoofNoMatch = true;
				const dateRangeLine = textStr.match(/#EXT-X-DATERANGE:[^\n]{0,200}/);
				_log(
					`notifyAdComplete: no stitched-ad DATERANGE match. Sample DATERANGE: ${dateRangeLine ? dateRangeLine[0] : "none found"}`,
					"warning",
				);
			}
			return;
		}

		const spoofedSet = info?.SpoofedAdIds || null;
		const podLenMatch = textStr.match(/X-TV-TWITCH-AD-POD-LENGTH="(\d+)"/);
		const hasExplicitPodLength = Boolean(podLenMatch);
		const podLength = hasExplicitPodLength
			? parseInt(podLenMatch[1], 10)
			: matches.length;
		if (hasExplicitPodLength && spoofedSet && spoofedSet.size >= podLength) {
			return;
		}
		let newSpoofed = 0;
		let firstRollType = "";
		let podCompleteSent = false;

		for (let i = 0; i < matches.length; i++) {
			if (hasExplicitPodLength && spoofedSet && spoofedSet.size >= podLength) {
				break;
			}
			const idMatch = matches[i][1].match(/^ID="([^"]+)"/);
			const stitchedAdId = idMatch ? idMatch[1] : "";
			if (spoofedSet && stitchedAdId && spoofedSet.has(stitchedAdId)) {
				continue;
			}
			const attr = _parseAttrs(matches[i][1]);
			const radToken = attr["X-TV-TWITCH-AD-RADS-TOKEN"];
			if (!radToken) {
				if (i === 0 && !__TTVAB_STATE__.LoggedAdSpoofNoToken) {
					__TTVAB_STATE__.LoggedAdSpoofNoToken = true;
					_log(
						`notifyAdComplete: matched DATERANGE but no RADS token. Attributes: ${Object.keys(attr).join(", ")}`,
						"warning",
					);
				}
				continue;
			}
			const rollType = (attr["X-TV-TWITCH-AD-ROLL-TYPE"] || "").toLowerCase();
			if (!firstRollType) firstRollType = rollType;
			const adPosition = parseInt(
				attr["X-TV-TWITCH-AD-POD-POSITION"] || String(i),
				10,
			);
			const adDuration =
				parseInt(attr["X-TV-TWITCH-AD-DURATION"] || "0", 10) || 0;
			const payload = {
				stitched: true,
				ad_id: stitchedAdId,
				roll_type: rollType,
				creative_id: attr["X-TV-TWITCH-AD-CREATIVE-ID"] || "",
				order_id: attr["X-TV-TWITCH-AD-ORDER-ID"] || "",
				line_item_id: attr["X-TV-TWITCH-AD-LINE-ITEM-ID"] || "",
				player_mute: false,
				player_volume: 1.0,
				visible: true,
				duration: adDuration,
				ad_position: adPosition,
				total_ads: podLength,
			};

			const makePacket = (event: string, extra?: Record<string, unknown>) => ({
				operationName: "ClientSideAdEventHandling_RecordAdEvent",
				variables: {
					input: {
						eventName: event,
						eventPayload: JSON.stringify({ ...payload, ...extra }),
						radToken,
					},
				},
				extensions: {
					persistedQuery: {
						version: 1,
						sha256Hash:
							"7e6c69e6eb59f8ccb97ab73686f3d8b7d85a72a0298745ccd8bfc68e4054ca5b",
					},
				},
			});

			if (spoofedSet && stitchedAdId) spoofedSet.add(stitchedAdId);
			const batch = [
				makePacket("video_ad_impression"),
				makePacket("video_ad_quartile_complete", { quartile: 1 }),
				makePacket("video_ad_quartile_complete", { quartile: 2 }),
				makePacket("video_ad_quartile_complete", { quartile: 3 }),
				makePacket("video_ad_quartile_complete", { quartile: 4 }),
			];
			if (
				!spoofedSet ||
				(hasExplicitPodLength && spoofedSet.size === podLength)
			) {
				batch.push(makePacket("video_ad_pod_complete"));
				podCompleteSent = true;
			}

			const headers: Record<string, string> = {
				"Client-ID": _C.CLIENT_ID,
				"X-Device-Id": __TTVAB_STATE__.GQLDeviceID || "oauth",
			};
			if (__TTVAB_STATE__.AuthorizationHeader) {
				headers.Authorization = __TTVAB_STATE__.AuthorizationHeader;
			}
			if (__TTVAB_STATE__.ClientIntegrityHeader) {
				headers["Client-Integrity"] = __TTVAB_STATE__.ClientIntegrityHeader;
			}
			if (__TTVAB_STATE__.ClientVersion) {
				headers["Client-Version"] = __TTVAB_STATE__.ClientVersion;
			}
			if (__TTVAB_STATE__.ClientSession) {
				headers["Client-Session-Id"] = __TTVAB_STATE__.ClientSession;
			}

			_fetchViaWorkerBridge(
				_GQL_URL,
				{
					method: "POST",
					headers,
					body: JSON.stringify(batch),
				},
				5000,
			)
				.then((response: Response | null) => {
					if (
						response &&
						response.status !== 200 &&
						!__TTVAB_STATE__.LoggedAdSpoofBadStatus
					) {
						__TTVAB_STATE__.LoggedAdSpoofBadStatus = true;
						_log(
							`notifyAdComplete: GQL response status ${response.status} — spoof may be rejected/rate-limited`,
							"warning",
						);
					}
				})
				.catch(() => {});

			newSpoofed++;
		}

		if (newSpoofed > 0) {
			const total = spoofedSet ? spoofedSet.size : newSpoofed;
			const src = info?.ActiveBackupPlayerType || "primary";
			_log(
				`[Trace] Spoofed ad completion for ${newSpoofed} new ad(s) (${total}/${podLength} pod) — roll: ${firstRollType}, src: ${src}, pod-complete: ${podCompleteSent ? "yes" : "no"}`,
				"info",
			);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		_log(`notifyAdComplete failed: ${message}`, "warning");
	}
}
