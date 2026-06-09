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

// Spoof ad completion to Twitch's GQL endpoint on every ad-laden poll. Twitch's
// player would normally fire video_ad_impression + 4 quartile_complete +
// pod_complete beacons as the ad plays. With ad-blocking, those beacons never
// fire — a fingerprintable signal that may feed Twitch's anti-adblock detection.
// Spoofing them mimics the "watched the ad" telemetry a normal viewer produces.
// Multi-ad pods: Twitch reveals each ad's DATERANGE only when that ad starts
// playing, so a 6-ad pod surfaces ONE ad per m3u8 poll across the break. This
// runs on every ad-laden poll; info.SpoofedAdIds dedups across polls so each ad
// is spoofed exactly once as it appears (full N/N pod coverage). pod_complete
// is sent once per pod (on the ad completing it), not per ad. All events for an
// ad are sent in one batched POST (Twitch supports JSON-array batched operations
// natively). Failures swallowed — never blocks ad-block flow.
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
		// True pod size from the m3u8 attribute (present on each DATERANGE); fall
		// back to visible-match count if absent. Keeps total_ads consistent across
		// all ads in the pod even though they surface one poll at a time.
		const podLenMatch = textStr.match(/X-TV-TWITCH-AD-POD-LENGTH="(\d+)"/);
		const podLength = podLenMatch
			? parseInt(podLenMatch[1], 10)
			: matches.length;
		// Hot-path early-out: this runs every ad-laden poll, and a long multi-ad
		// break has many polls AFTER the whole pod is already spoofed. Once the
		// dedup set covers the pod, every remaining poll is pure waste — bail
		// before the per-match parse loop.
		if (spoofedSet && spoofedSet.size >= podLength) return;
		let newSpoofed = 0;
		let firstRollType = "";
		let podCompleteSent = false;

		for (let i = 0; i < matches.length; i++) {
			if (spoofedSet && spoofedSet.size >= podLength) break;
			// Cheap ID pre-extract for the dedup check — the DATERANGE capture
			// always starts with ID="stitched-ad-<UUID>". Checking the dedup set
			// before the full _parseAttrs() avoids re-parsing every already-
			// spoofed ad's attribute string on each poll during the spoof phase.
			const idMatch = matches[i][1].match(/^ID="([^"]+)"/);
			const stitchedAdId = idMatch ? idMatch[1] : "";
			// Multi-poll dedup: skip ads already spoofed earlier this break.
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

			// Mark this ad spoofed BEFORE building the batch so the pod-complete
			// size check below reflects it.
			if (spoofedSet && stitchedAdId) spoofedSet.add(stitchedAdId);
			// Batch the events for this ad into one GQL POST.
			const batch = [
				makePacket("video_ad_impression"),
				makePacket("video_ad_quartile_complete", { quartile: 1 }),
				makePacket("video_ad_quartile_complete", { quartile: 2 }),
				makePacket("video_ad_quartile_complete", { quartile: 3 }),
				makePacket("video_ad_quartile_complete", { quartile: 4 }),
			];
			// pod_complete fires ONCE per pod — not per ad. A real player sends a
			// single pod_complete after the whole pod finishes; emitting it on
			// every ad (6× for a 6-ad pod) is itself a fingerprint. Attach it to
			// the ad that brings the dedup set up to the true pod size. If the pod
			// never fully surfaces it is correctly never sent. Defensive fallback
			// (no dedup set): keep per-ad pod_complete so the signal isn't lost.
			if (!spoofedSet || spoofedSet.size === podLength) {
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

			newSpoofed++;
		}

		if (newSpoofed > 0) {
			const total = spoofedSet ? spoofedSet.size : newSpoofed;
			// src = which stream the spoofed DATERANGEs came from (primary vs a
			// committed backup player-type) — surfaces the stream-swap ad-ID
			// mixing limitation. pod-complete = whether this poll attached the
			// single video_ad_pod_complete.
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
