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

function _isFirefoxBrowser() {
	return (
		typeof navigator?.userAgent === "string" &&
		/Firefox\//i.test(navigator.userAgent)
	);
}

function _createFetchRelayResponse(payload) {
	if (!payload || typeof payload !== "object") {
		throw new Error("invalid fetch relay response");
	}

	if (payload.error) {
		throw new Error(payload.error);
	}

	return new Response(payload.body ?? "", {
		status: payload.status,
		statusText: payload.statusText,
		headers: payload.headers,
	});
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
					resolve(_createFetchRelayResponse(payload));
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
		const bridgeTimeoutMs = _isFirefoxBrowser() ? 1200 : 5000;

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
				res = await _fetchViaWorkerBridge(
					_GQL_URL,
					requestOptions,
					bridgeTimeoutMs,
				);
			} catch (bridgeError) {
				_log(`Token relay error: ${bridgeError.message}`, "warning");
			}
		}

		if (!res) {
			const controller = new AbortController();
			timeoutId = setTimeout(() => controller.abort(), 5000);
			res = await fetchFunc(_GQL_URL, {
				...requestOptions,
				signal: controller.signal,
			});
		}

		_log(`[Trace] Token response: ${res.status}`, "info");
		return res;
	} catch (e) {
		_log(`Token fetch error: ${e.message}`, "error");
		return { status: 0, json: () => Promise.resolve({}) };
	} finally {
		clearTimeout(timeoutId);
	}
}
