// TTV AB - API

const _GQL_URL = "https://gql.twitch.tv/gql";

function _extractPlaybackAccessToken(payload) {
	const tokenSources = [
		payload?.data?.streamPlaybackAccessToken,
		payload?.data?.videoPlaybackAccessToken,
		payload?.streamPlaybackAccessToken,
		payload?.videoPlaybackAccessToken,
	].filter(Boolean);

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
	};
}

async function _getToken(channel, playerType, realFetch) {
	const fetchFunc = realFetch || fetch;
	const reqPlayerType = playerType;
	let timeoutId = null;

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
			isLive: true,
			login: channel,
			isVod: false,
			vodID: "",
			playerType: reqPlayerType,
			platform: reqPlayerType === "autoplay" ? "android" : "web",
		},
	};

	try {
		_log(`[Trace] Requesting token for ${playerType}`, "info");
		const controller = new AbortController();
		timeoutId = setTimeout(() => controller.abort(), 5000);
		const acceptLanguage =
			navigator?.languages?.join(",") || navigator?.language || "en-US";

		const headers = {
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

		const res = await fetchFunc(_GQL_URL, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		_log(`[Trace] Token response: ${res.status}`, "info");
		return res;
	} catch (e) {
		_log(`Token fetch error: ${e.message}`, "error");
		return { status: 0, json: () => Promise.resolve({}) };
	} finally {
		clearTimeout(timeoutId);
	}
}
