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

	const response = new Response(payload.body ?? "", {
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
	let timeoutId = null;
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

	try {
		_log(`[Trace] Requesting token for ${playerType} (${logTarget})`, "info");
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
				res = await _fetchViaWorkerBridge(_GQL_URL, requestOptions, 1500);
			} catch (bridgeError) {
				_log(`Token relay error: ${bridgeError.message}`, "warning");
			}
		}

		if (!res) {
			const controller = new AbortController();
			timeoutId = setTimeout(() => controller.abort(), 3000);
			res = await fetchFunc(_GQL_URL, {
				...requestOptions,
				signal: controller.signal,
			});
		}

		_log(`[Trace] Token response: ${res.status}`, "info");
		return res;
	} catch (e) {
		_log(`Token fetch error: ${e.message}`, "error");
		return new Response(null, { status: 0 });
	} finally {
		clearTimeout(timeoutId);
	}
}

// Spoof ad completion to Twitch's GQL endpoint when an ad break is detected.
// Twitch's player would normally fire video_ad_impression + 4 quartile_complete
// + pod_complete beacons as the ad plays. With ad-blocking, those beacons never
// fire — a fingerprintable signal that may feed Twitch's anti-adblock detection.
// Spoofing them mimics the "watched the ad" telemetry that a normal viewer
// produces. Per-ad iteration: each ad in a pod has its own DATERANGE entry
// with its own RADS-token + creative/order/line-item-id + position. All 6
// events for an ad are sent in one batched POST (Twitch supports JSON-array
// batched operations natively). Failures swallowed — never blocks ad-block flow.
async function _notifyAdComplete(textStr: string): Promise<void> {
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

		const podLength = matches.length;
		let spoofedCount = 0;
		let firstRollType = "";

		for (let i = 0; i < podLength; i++) {
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
			if (i === 0) firstRollType = rollType;
			const stitchedAdId = attr.ID || "";
			// Prefer m3u8's explicit pod-position when present; fall back to index.
			const adPosition = parseInt(
				attr["X-TV-TWITCH-AD-POD-POSITION"] || String(i),
				10,
			);
			// Ad's defined duration (X-TV-TWITCH-AD-DURATION is typically a quoted
			// string in seconds, e.g. "15.000"). parseInt coerces both quoted and
			// unquoted forms.
			const adDuration =
				parseInt(attr["X-TV-TWITCH-AD-DURATION"] || "0", 10) || 0;
			// Internally-consistent payload: claim "watched the ad normally" which
			// matches the quartile_complete{4} + pod_complete events we send.
			// Mismatched fields (mute=true / volume=0 / visible=false / duration=0)
			// paired with completion events would be an obvious cross-validation
			// flag if Twitch ever audits.
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

			// Batch all 6 events for this ad into one GQL POST.
			const batch = [
				makePacket("video_ad_impression"),
				makePacket("video_ad_quartile_complete", { quartile: 1 }),
				makePacket("video_ad_quartile_complete", { quartile: 2 }),
				makePacket("video_ad_quartile_complete", { quartile: 3 }),
				makePacket("video_ad_quartile_complete", { quartile: 4 }),
				makePacket("video_ad_pod_complete"),
			];

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

			// Fire-and-forget via the worker bridge. Surveil response status to
			// detect spoof rejection (400/403/429/5xx) — distinguishes "spoof
			// accepted" from "spoof rejected/rate-limited." Without this, a Twitch
			// detection-escalation that starts rejecting our spoofs would be a
			// silent failure. Once-per-session guard prevents log spam.
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

			spoofedCount++;
		}

		if (spoofedCount > 0) {
			_log(
				`[Trace] Spoofed ad completion for ${spoofedCount}/${podLength} ad(s) — roll: ${firstRollType}`,
				"info",
			);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		_log(`notifyAdComplete failed: ${message}`, "warning");
	}
}
