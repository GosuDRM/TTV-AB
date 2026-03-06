// TTV AB - API

const _GQL_URL = "https://gql.twitch.tv/gql";

async function _getToken(channel, playerType, realFetch) {
	const fetchFunc = realFetch || fetch;
	const reqPlayerType = playerType;

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
		const timeoutId = setTimeout(() => controller.abort(), 5000);
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

		clearTimeout(timeoutId);
		_log(`[Trace] Token response: ${res.status}`, "info");
		return res;
	} catch (e) {
		_log(`Token fetch error: ${e.message}`, "error");
		return { status: 0, json: () => Promise.resolve({}) };
	}
}
