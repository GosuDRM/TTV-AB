// TTV AB v5.0.1 - Twitch Ad Blocker
// Built file: src/scripts/content.js
(function(){
'use strict';

const _$c = {
	VERSION: "5.0.1",
	INTERNAL_VERSION: 56,
	LOG_STYLES: {
		prefix:
			"background: linear-gradient(135deg, #9146FF, #772CE8); color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;",
		info: "color: #9146FF; font-weight: 500;",
		success: "color: #4CAF50; font-weight: 500;",
		warning: "color: #FF9800; font-weight: 500;",
		error: "color: #f44336; font-weight: 500;",
	},
	AD_SIGNIFIER: "stitched",
	CLIENT_ID: "kimne78kx3ncx6brgo4mv6wki5h1ko",
	PLAYER_TYPES: ["embed", "popout", "autoplay"],
	FALLBACK_TYPE: "embed",
	FORCE_TYPE: "popout",
	RELOAD_TIME: 1500,
	PLAYER_RELOAD_DEBOUNCE_MS: 1500,
	AD_CYCLE_STALE_MS: 30000,
	AD_END_GRACE_MS: 2500,
	AD_END_MIN_CLEAN_PLAYLISTS: 2,
	AD_RECOVERY_RELOAD_COOLDOWN_MS: 10000,
	BUFFERING_FIX: true,
	RELOAD_AFTER_AD: false,
	PLAYER_BUFFERING_DO_PLAYER_RELOAD: false,
	ALWAYS_RELOAD_PLAYER_ON_AD: false,
};

const _$s = {
	workers: [],
	conflicts: ["twitch", "isVariantA"],
	reinsertPatterns: ["isVariantA", "besuper/", "${patch_url}"],
	adsBlocked: 0,
	domAdsBlocked: 0,
	counterEventSeq: 0,
};

function _$bw(messages) {
	const queue = Array.isArray(messages) ? messages : [messages];
	if (queue.length === 0 || _$s.workers.length === 0) return;

	const aliveWorkers = [];
	for (const worker of _$s.workers) {
		let isAlive = true;
		for (const message of queue) {
			try {
				worker.postMessage(message);
			} catch {
				isAlive = false;
				break;
			}
		}
		if (isAlive) {
			aliveWorkers.push(worker);
		}
	}

	_$s.workers = aliveWorkers;
}

function _setPagePlaybackContext(context, options = {}) {
	if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__) {
		return _normalizePlaybackContext(context);
	}

	const normalizedContext = _normalizePlaybackContext(context);
	const previousMediaKey = __TTVAB_STATE__.PageMediaKey || null;
	let didResetAdScopedState = false;
	const hasChanged =
		__TTVAB_STATE__.PageMediaType !== normalizedContext.MediaType ||
		__TTVAB_STATE__.PageChannel !== normalizedContext.ChannelName ||
		__TTVAB_STATE__.PageVodID !== normalizedContext.VodID ||
		previousMediaKey !== normalizedContext.MediaKey;

	__TTVAB_STATE__.PageMediaType = normalizedContext.MediaType;
	__TTVAB_STATE__.PageChannel = normalizedContext.ChannelName;
	__TTVAB_STATE__.PageVodID = normalizedContext.VodID;
	__TTVAB_STATE__.PageMediaKey = normalizedContext.MediaKey;

	if (
		hasChanged &&
		previousMediaKey &&
		previousMediaKey !== normalizedContext.MediaKey &&
		(__TTVAB_STATE__.CurrentAdMediaKey === previousMediaKey ||
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey === previousMediaKey)
	) {
		__TTVAB_STATE__.CurrentAdChannel = null;
		__TTVAB_STATE__.CurrentAdMediaKey = null;
		__TTVAB_STATE__.PinnedBackupPlayerType = null;
		__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
		__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
		__TTVAB_STATE__.ShouldResumeAfterAd = false;
		__TTVAB_STATE__.ShouldResumeAfterAdChannel = null;
		__TTVAB_STATE__.ShouldResumeAfterAdMediaKey = null;
		__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
		__TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
		didResetAdScopedState = true;
	}

	if (options.broadcast !== false && hasChanged) {
		const messages = [
			{
				key: "UpdatePageContext",
				value: {
					mediaType: normalizedContext.MediaType,
					channelName: normalizedContext.ChannelName,
					vodID: normalizedContext.VodID,
					mediaKey: normalizedContext.MediaKey,
				},
			},
		];
		if (didResetAdScopedState) {
			messages.push({
				key: "UpdateCurrentAdContext",
				value: null,
			});
			messages.push({
				key: "UpdatePinnedBackupPlayerContext",
				value: null,
			});
		}
		_$bw(messages);
	}

	return normalizedContext;
}

function _syncPagePlaybackContext(options = {}) {
	return _setPagePlaybackContext(
		_getPlaybackContextFromUrl(globalThis?.location?.href || ""),
		options,
	);
}

function _$ds(scope) {
	scope.__TTVAB_STATE__ = {
		AdSignifier: _$c.AD_SIGNIFIER,
		BackupPlayerTypes: [..._$c.PLAYER_TYPES],
		FallbackPlayerType: _$c.FALLBACK_TYPE,
		ForceAccessTokenPlayerType: _$c.FORCE_TYPE,
		SkipPlayerReloadOnHevc: false,
		ReloadAfterAd: _$c.RELOAD_AFTER_AD ?? false,
		PlayerBufferingDoPlayerReload:
			_$c.PLAYER_BUFFERING_DO_PLAYER_RELOAD ?? false,
		PlayerReloadMinimalRequestsTime: _$c.RELOAD_TIME,
		PlayerReloadMinimalRequestsPlayerIndex: Math.max(
			0,
			_$c.PLAYER_TYPES.indexOf("autoplay") > -1
				? _$c.PLAYER_TYPES.indexOf("autoplay")
				: _$c.PLAYER_TYPES.indexOf(_$c.FALLBACK_TYPE),
		),
		PlayerReloadDebounceMs: _$c.PLAYER_RELOAD_DEBOUNCE_MS ?? 1500,
		AdCycleStaleMs: _$c.AD_CYCLE_STALE_MS ?? 30000,
		AdEndGraceMs: _$c.AD_END_GRACE_MS ?? 2500,
		AdEndMinCleanPlaylists: _$c.AD_END_MIN_CLEAN_PLAYLISTS ?? 2,
		AdRecoveryReloadCooldownMs: _$c.AD_RECOVERY_RELOAD_COOLDOWN_MS ?? 10000,
		HasTriggeredPlayerReload: false,
		LastPlayerReloadAt: 0,
		LastAdDetectedAt: 0,
		LastAdRecoveryReloadAt: 0,
		LastAdRecoveryResumeAt: 0,
		CurrentAdChannel: null,
		CurrentAdMediaKey: null,
		PinnedBackupPlayerType: null,
		PinnedBackupPlayerChannel: null,
		PinnedBackupPlayerMediaKey: null,
		ShouldResumeAfterAd: false,
		ShouldResumeAfterAdChannel: null,
		ShouldResumeAfterAdMediaKey: null,
		StreamInfos: Object.create(null),
		StreamInfosByUrl: Object.create(null),
		GQLDeviceID: null,
		ClientVersion: null,
		ClientSession: null,
		ClientIntegrityHeader: null,
		AuthorizationHeader: undefined,
		SimulatedAdsDepth: 0,
		V2API: false,
		IsAdStrippingEnabled: true,
		AdSegmentCache: new Map(),
		PlayerBufferingDelay: 600,
		PlayerBufferingSameStateCount: 3,
		PlayerBufferingDangerZone: 1,
		PlayerBufferingMinRepeatDelay: 8000,
		PlayerBufferingPrerollCheckEnabled: false,
		PlayerBufferingPrerollCheckOffset: 5,
		AllSegmentsAreAdSegments: false,
		PlaybackAccessTokenHash: null,
		LastNativePlaybackAccessTokenPlayerType: null,
		PageMediaType: null,
		PageChannel: null,
		PageVodID: null,
		PageMediaKey: null,
		PendingFetchRequests: new Map(),
		FetchRequestSeq: 0,
	};
}

function _getPageScopedPlaybackEventContext() {
	if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__) {
		return {
			pageChannel: null,
			pageMediaKey: null,
		};
	}

	const pageContext = _normalizePlaybackContext({
		MediaType: __TTVAB_STATE__.PageMediaType,
		ChannelName: __TTVAB_STATE__.PageChannel,
		VodID: __TTVAB_STATE__.PageVodID,
		MediaKey: __TTVAB_STATE__.PageMediaKey,
	});

	return {
		pageChannel: pageContext.ChannelName,
		pageMediaKey: pageContext.MediaKey,
	};
}

function _normalizeCounterChannel(channel) {
	if (typeof channel !== "string") return null;
	const trimmed = channel.trim().toLowerCase();
	return trimmed || null;
}

function _normalizeCounterLabel(value, fallback = "generic") {
	if (typeof value !== "string") return fallback;
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || fallback;
}

function _createCounterEventId(type, channel = null, label = "generic") {
	_$s.counterEventSeq = Number.isFinite(_$s.counterEventSeq)
		? Math.max(0, Math.trunc(_$s.counterEventSeq)) + 1
		: 1;
	if (_$s.counterEventSeq > 1_000_000_000) {
		_$s.counterEventSeq = 1;
	}

	const safeType = _normalizeCounterLabel(type, "counter");
	const safeChannel = _normalizeCounterChannel(channel) || "global";
	const safeLabel = _normalizeCounterLabel(label, "generic");

	return `${safeType}:${Date.now()}:${_$s.counterEventSeq}:${safeChannel}:${safeLabel}`;
}

function _$ab(channel, mediaKey = null, source = "unknown") {
	_$s.adsBlocked++;
	const count = Number.isFinite(_$s.adsBlocked)
		? Math.max(0, Math.trunc(_$s.adsBlocked))
		: 0;
	_$s.adsBlocked = count;
	const safeChannel = _normalizeCounterChannel(channel);
	const safeMediaKey =
		_normalizeMediaKey(mediaKey) ||
		_buildMediaKey("live", safeChannel, null) ||
		null;
	const safeSource = _normalizeCounterLabel(source, "unknown");
	const eventId = _createCounterEventId("ads", safeChannel, safeSource);
	const pageEventContext = _getPageScopedPlaybackEventContext();
	if (typeof window !== "undefined") {
		window.postMessage(
			{
				type: "ttvab-ad-blocked",
				detail: {
					count,
					delta: 1,
					channel: safeChannel,
					mediaKey: safeMediaKey,
					eventId,
					source: safeSource,
					pageChannel: pageEventContext.pageChannel,
					pageMediaKey: pageEventContext.pageMediaKey,
				},
			},
			"*",
		);
	} else if (typeof self !== "undefined" && self.postMessage) {
		self.postMessage({
			key: "AdBlocked",
			count: _$s.adsBlocked,
			delta: 1,
			channel: safeChannel,
			mediaKey: safeMediaKey,
			eventId,
			source: safeSource,
			pageChannel: pageEventContext.pageChannel,
			pageMediaKey: pageEventContext.pageMediaKey,
		});
	}
}

function _createPageScopedWorkerEvent(value = null) {
	const pageEventContext = _getPageScopedPlaybackEventContext();
	return {
		...(value && typeof value === "object" ? value : {}),
		pageChannel: pageEventContext.pageChannel,
		pageMediaKey: pageEventContext.pageMediaKey,
	};
}

function _incrementDomAdsBlocked(kind = "generic", channel = null) {
	_$s.domAdsBlocked++;
	const count = Number.isFinite(_$s.domAdsBlocked)
		? Math.max(0, Math.trunc(_$s.domAdsBlocked))
		: 0;
	const safeKind = _normalizeCounterLabel(kind, "generic");
	const safeChannel = _normalizeCounterChannel(channel);
	const eventId = _createCounterEventId("dom-ads", safeChannel, safeKind);
	_$s.domAdsBlocked = count;
	if (typeof window !== "undefined") {
		window.postMessage(
			{
				type: "ttvab-dom-ad-cleanup",
				detail: {
					count,
					delta: 1,
					kind: safeKind,
					channel: safeChannel,
					eventId,
				},
			},
			"*",
		);
	}
}

function _$l(msg, type = "info") {
	const text = typeof msg === "object" ? JSON.stringify(msg) : String(msg);
	const style = _$c.LOG_STYLES[type] || _$c.LOG_STYLES.info;

	if (type === "error") {
		console.error(`%cTTV AB%c ${text}`, _$c.LOG_STYLES.prefix, style);
	} else if (type === "warning") {
		console.warn(`%cTTV AB%c ${text}`, _$c.LOG_STYLES.prefix, style);
	} else {
		console.log(`%cTTV AB%c ${text}`, _$c.LOG_STYLES.prefix, style);
	}
}

const _$ar = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
const _RESERVED_ROUTE_SEGMENTS = new Set([
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

function _normalizeChannelName(value) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim().toLowerCase();
	return /^[a-z0-9_]{1,25}$/.test(trimmed) ? trimmed : null;
}

function _normalizeVodID(value) {
	if (typeof value === "number" && Number.isFinite(value)) {
		value = String(Math.trunc(value));
	}
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return /^\d+$/.test(trimmed) ? trimmed : null;
}

function _buildMediaKey(mediaType, channelName = null, vodID = null) {
	if (mediaType === "vod") {
		const safeVodID = _normalizeVodID(vodID);
		return safeVodID ? `vod:${safeVodID}` : null;
	}

	const safeChannel = _normalizeChannelName(channelName);
	return safeChannel ? `live:${safeChannel}` : null;
}

function _normalizeMediaKey(value) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim().toLowerCase();
	if (trimmed.startsWith("live:")) {
		return _buildMediaKey("live", trimmed.slice(5), null);
	}
	if (trimmed.startsWith("vod:")) {
		return _buildMediaKey("vod", null, trimmed.slice(4));
	}
	return null;
}

function _normalizePlaybackContext(context) {
	const channelName = _normalizeChannelName(
		context?.ChannelName ?? context?.channelName ?? context?.login ?? null,
	);
	const vodID = _normalizeVodID(
		context?.VodID ?? context?.vodID ?? context?.videoID ?? null,
	);
	const explicitMediaType =
		context?.MediaType === "vod" || context?.mediaType === "vod"
			? "vod"
			: context?.MediaType === "live" || context?.mediaType === "live"
				? "live"
				: null;
	const explicitMediaKey = _normalizeMediaKey(
		context?.MediaKey ?? context?.mediaKey ?? null,
	);

	if (explicitMediaKey?.startsWith("vod:")) {
		const normalizedVodID = explicitMediaKey.slice(4);
		return {
			MediaType: "vod",
			ChannelName: null,
			VodID: normalizedVodID,
			MediaKey: explicitMediaKey,
		};
	}

	if (explicitMediaKey?.startsWith("live:")) {
		const normalizedChannelName = explicitMediaKey.slice(5);
		return {
			MediaType: "live",
			ChannelName: normalizedChannelName,
			VodID: null,
			MediaKey: explicitMediaKey,
		};
	}

	if (explicitMediaType === "vod" && vodID) {
		return {
			MediaType: "vod",
			ChannelName: null,
			VodID: vodID,
			MediaKey: _buildMediaKey("vod", null, vodID),
		};
	}

	if ((explicitMediaType === "live" || !explicitMediaType) && channelName) {
		return {
			MediaType: "live",
			ChannelName: channelName,
			VodID: null,
			MediaKey: _buildMediaKey("live", channelName, null),
		};
	}

	if (vodID) {
		return {
			MediaType: "vod",
			ChannelName: null,
			VodID: vodID,
			MediaKey: _buildMediaKey("vod", null, vodID),
		};
	}

	return {
		MediaType: null,
		ChannelName: null,
		VodID: null,
		MediaKey: null,
	};
}

function _getPlaybackContextFromUrl(rawUrl) {
	let pathname = "";
	try {
		const baseUrl =
			typeof globalThis?.location?.href === "string"
				? globalThis.location.href
				: "https://www.twitch.tv/";
		pathname = new URL(String(rawUrl || ""), baseUrl).pathname;
	} catch {
		pathname = typeof rawUrl === "string" ? rawUrl : "";
	}

	const segments = String(pathname || "")
		.split("/")
		.filter(Boolean);
	const firstSegment = segments[0] || null;
	const liveChannel = _normalizeChannelName(firstSegment);
	if (liveChannel && !_RESERVED_ROUTE_SEGMENTS.has(liveChannel)) {
		return _normalizePlaybackContext({
			MediaType: "live",
			ChannelName: liveChannel,
		});
	}

	if (String(firstSegment || "").toLowerCase() === "videos") {
		return _normalizePlaybackContext({
			MediaType: "vod",
			VodID: segments[1] || null,
		});
	}

	return _normalizePlaybackContext(null);
}

function _getPlaybackContextFromUsherUrl(rawUrl) {
	let parsedUrl = null;
	try {
		const baseUrl =
			typeof globalThis?.location?.href === "string"
				? globalThis.location.href
				: "https://www.twitch.tv/";
		parsedUrl = new URL(String(rawUrl || ""), baseUrl);
	} catch {
		return null;
	}

	const pathname = parsedUrl.pathname;
	const liveMatch = pathname.match(
		/\/(?:api\/v2\/)?channel\/hls\/([^/?#]+)\.m3u8$/i,
	);
	if (liveMatch?.[1]) {
		return _normalizePlaybackContext({
			MediaType: "live",
			ChannelName: liveMatch[1],
		});
	}

	const vodMatch = pathname.match(/\/(?:api\/v2\/)?vod\/(\d+)\.m3u8$/i);
	if (vodMatch?.[1]) {
		return _normalizePlaybackContext({
			MediaType: "vod",
			VodID: vodMatch[1],
		});
	}

	return null;
}

function _$pa(str) {
	const result = Object.create(null);
	_$ar.lastIndex = 0;
	let match = _$ar.exec(str);
	while (match !== null) {
		let value = match[2];
		if (value[0] === '"' && value[value.length - 1] === '"') {
			value = value.slice(1, -1);
		}
		result[match[1].toUpperCase()] = value;
		match = _$ar.exec(str);
	}
	return result;
}

function _$gt(m3u8) {
	if (__TTVAB_STATE__.V2API) {
		const match = m3u8.match(
			/#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="([^"]+)"/,
		);
		return match?.[1] ?? null;
	}
	const match = m3u8.match(/SERVER-TIME="([0-9.]+)"/);
	return match?.[1] ?? null;
}

function _$rt(m3u8, time) {
	if (!time) return m3u8;
	if (__TTVAB_STATE__.V2API) {
		return m3u8.replace(
			/(#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE=")[^"]+(")/,
			`$1${time}$2`,
		);
	}
	return m3u8.replace(/(SERVER-TIME=")[0-9.]+(")/, `$1${time}$2`);
}

function _$hem(text) {
	return (
		typeof text === "string" &&
		(text.includes(__TTVAB_STATE__.AdSignifier) ||
			text.includes("X-TV-TWITCH-AD") ||
			text.includes("stitched-ad") ||
			text.includes("/adsquared/") ||
			text.includes("SCTE35-OUT") ||
			text.includes("MIDROLL") ||
			text.includes("midroll"))
	);
}

function _$kas(segmentUrl) {
	const url = String(segmentUrl || "");
	if (!url) return false;
	return (
		__TTVAB_STATE__.AdSegmentCache.has(url) ||
		url.includes(__TTVAB_STATE__.AdSignifier) ||
		url.includes("stitched-ad") ||
		url.includes("/adsquared/") ||
		url.includes("processing") ||
		url.includes("/_404/")
	);
}

function _$pka(text) {
	if (typeof text !== "string" || !text) return false;
	const lines = text.split("\n");
	for (let index = 0; index < lines.length - 1; index++) {
		if (
			lines[index]?.startsWith("#EXTINF") &&
			_$kas(lines[index + 1])
		) {
			return true;
		}
	}
	return false;
}

function _$sa(text, stripAll, info) {
	const lines = text.split("\n");
	const len = lines.length;
	const adUrl = "https://twitch.tv";
	let stripped = false;
	let i = 0;
	const strippedSegments = [];
	const MAX_RECOVERY_SEGMENTS = 6;

	const hasExplicitAdMetadata = _$hem(text);
	const hasKnownAdSegments = _$pka(text);
	const forceStripAllSegments =
		stripAll ||
		__TTVAB_STATE__.AllSegmentsAreAdSegments ||
		(hasExplicitAdMetadata && !hasKnownAdSegments);

	if (
		hasExplicitAdMetadata ||
		hasKnownAdSegments ||
		stripAll ||
		__TTVAB_STATE__.AllSegmentsAreAdSegments
	) {
		for (i = 0; i < len; i++) {
			if (lines[i]?.startsWith("#EXT-X-TWITCH-PREFETCH:")) {
				const prefetchUrl = lines[i]
					.substring("#EXT-X-TWITCH-PREFETCH:".length)
					.trim();
				const isAdPrefetch = _$kas(prefetchUrl);
				if (isAdPrefetch) {
					lines[i] = "";
				}
			}
		}
	}

	let adSegmentCount = 0;
	let _liveSegmentCount = 0;

	for (i = 0; i < len - 1; i++) {
		const line = lines[i];
		if (line?.startsWith("#EXTINF")) {
			const segmentUrl = lines[i + 1];
			const isAdSegment =
				forceStripAllSegments || _$kas(segmentUrl);
			if (isAdSegment) {
				adSegmentCount++;
			} else {
				_liveSegmentCount++;
			}
		}
	}

	const shouldStrip =
		(hasExplicitAdMetadata ||
			hasKnownAdSegments ||
			stripAll ||
			__TTVAB_STATE__.AllSegmentsAreAdSegments) &&
		(adSegmentCount > 0 || forceStripAllSegments);

	for (i = 0; i < len; i++) {
		let line = lines[i];

		if (line?.includes("X-TV-TWITCH-AD")) {
			line = line
				.replace(/X-TV-TWITCH-AD-URL="[^"]*"/, `X-TV-TWITCH-AD-URL="${adUrl}"`)
				.replace(
					/X-TV-TWITCH-AD-CLICK-TRACKING-URL="[^"]*"/,
					`X-TV-TWITCH-AD-CLICK-TRACKING-URL="${adUrl}"`,
				);
			lines[i] = line;
		}

		if (shouldStrip && i < len - 1 && line?.startsWith("#EXTINF")) {
			const isAdSegment =
				forceStripAllSegments || _$kas(lines[i + 1]);

			if (isAdSegment) {
				const segmentUrl = lines[i + 1];

				strippedSegments.push({ extinf: lines[i], url: segmentUrl });
				if (strippedSegments.length > MAX_RECOVERY_SEGMENTS) {
					strippedSegments.shift();
				}

				if (
					segmentUrl &&
					!info.RequestedAds.has(segmentUrl) &&
					!info.IsMidroll
				) {
					info.RequestedAds.add(segmentUrl);
					fetch(segmentUrl)
						.then((r) => r.blob())
						.catch(() => {});
				}

				if (!__TTVAB_STATE__.AdSegmentCache.has(segmentUrl))
					info.NumStrippedAdSegments++;
				__TTVAB_STATE__.AdSegmentCache.set(segmentUrl, Date.now());
				stripped = true;
				lines[i] = "";
				lines[i + 1] = "";
				i++;
			}
		}

		if (line.includes(__TTVAB_STATE__.AdSignifier)) stripped = true;
	}

	if (!stripped) {
		info.NumStrippedAdSegments = 0;
	}

	info.IsStrippingAdSegments = stripped;

	const now = Date.now();
	if (
		!globalThis._lastAdCachePrune ||
		now - globalThis._lastAdCachePrune > 60000
	) {
		globalThis._lastAdCachePrune = now;
		const cutoff = now - 120000;
		__TTVAB_STATE__.AdSegmentCache.forEach((v, k) => {
			if (v < cutoff) __TTVAB_STATE__.AdSegmentCache.delete(k);
		});
	}

	const result = lines.filter((l) => l !== "");

	const hasRemainingSegments = result.some((l) => l?.startsWith("#EXTINF"));
	if (
		!hasRemainingSegments &&
		strippedSegments.length > 0 &&
		!forceStripAllSegments
	) {
		_$l(
			`[Recovery] Empty playlist - restoring ${strippedSegments.length} segment(s)`,
			"warning",
		);
		for (const seg of strippedSegments) {
			result.push(seg.extinf);
			result.push(seg.url);
		}
	}

	return result.join("\n");
}

function _$sv(attrs, rawUrl, variantUrl) {
	const frameRate = Number.parseFloat(attrs?.["FRAME-RATE"]);
	const bandwidth = Number.parseInt(attrs?.BANDWIDTH, 10);
	return {
		Resolution: String(attrs.RESOLUTION || "0x0"),
		FrameRate: Number.isFinite(frameRate) ? frameRate : 0,
		Bandwidth: Number.isFinite(bandwidth) ? Math.max(0, bandwidth) : 0,
		Codecs: String(attrs.CODECS || ""),
		Name: String(attrs.VIDEO || ""),
		RawUrl: rawUrl,
		Url: variantUrl,
	};
}

function _$su(m3u8, res, baseUrl = null) {
	const lines = m3u8.split("\n");
	const len = lines.length;
	const [tw, th] = String(res?.Resolution || "0x0")
		.split("x")
		.map(Number);
	const targetPixels =
		(Number.isFinite(tw) ? tw : 0) * (Number.isFinite(th) ? th : 0);
	let matchUrl = null;
	let matchFps = false;
	let closeUrl = null;
	let closeDiff = Infinity;
	const resolveUrl = (candidate) => {
		if (!baseUrl) return candidate;
		try {
			return new URL(candidate, baseUrl).href;
		} catch {
			return candidate;
		}
	};

	for (let i = 0; i < len - 1; i++) {
		const line = lines[i];
		if (
			!line?.startsWith("#EXT-X-STREAM-INF") ||
			!lines[i + 1]?.includes(".m3u8") ||
			lines[i + 1]?.includes("processing")
		)
			continue;

		const attrs = _$pa(line);
		const resolution = attrs.RESOLUTION;
		const frameRate = attrs["FRAME-RATE"];

		if (!resolution) continue;

		if (resolution === res.Resolution) {
			if (!matchUrl || (!matchFps && frameRate === res.FrameRate)) {
				matchUrl = resolveUrl(lines[i + 1]);
				matchFps = frameRate === res.FrameRate;
				if (matchFps) return matchUrl;
			}
		}

		const [w, h] = String(resolution || "0x0")
			.split("x")
			.map(Number);
		const area = (Number.isFinite(w) ? w : 0) * (Number.isFinite(h) ? h : 0);
		const safeTargetPixels = Number.isFinite(targetPixels) ? targetPixels : 0;
		const diff = Math.abs(area - safeTargetPixels);
		if (diff < closeDiff) {
			closeUrl = resolveUrl(lines[i + 1]);
			closeDiff = diff;
		}
	}

	return matchUrl || closeUrl;
}

function _$gfr(info, url) {
	const resolutionList = Array.isArray(info?.ResolutionList)
		? info.ResolutionList.filter(Boolean)
		: [];
	if (resolutionList.length === 0) {
		return null;
	}

	if (url) {
		const direct = resolutionList.find(
			(entry) => entry.Url === url || entry.RawUrl === url,
		);
		if (direct) return direct;
	}

	const activeType = info?.ActiveBackupPlayerType || null;
	if (activeType && typeof info?.ActiveBackupResolution === "string") {
		const active = resolutionList.find(
			(entry) => entry.Resolution === info.ActiveBackupResolution,
		);
		if (active) return active;
	}

	return [...resolutionList].sort((a, b) => {
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
		return bArea - aArea;
	})[0];
}

const _$gu = "https://gql.twitch.tv/gql";

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

		self.postMessage({
			key: "FetchRequest",
			value: {
				id: requestId,
				url,
				options,
			},
		});
	});
}

async function _$tk(playbackContext, playerType, realFetch) {
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
		_$l(`[Trace] Requesting token for ${playerType} (${logTarget})`, "info");
		const acceptLanguage =
			navigator?.languages?.join(",") || navigator?.language || "en-US";

		const headers = {
			"Client-ID": _$c.CLIENT_ID,
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
				res = await _fetchViaWorkerBridge(_$gu, requestOptions, 5000);
			} catch (bridgeError) {
				_$l(`Token relay error: ${bridgeError.message}`, "warning");
			}
		}

		if (!res) {
			const controller = new AbortController();
			timeoutId = setTimeout(() => controller.abort(), 5000);
			res = await fetchFunc(_$gu, {
				...requestOptions,
				signal: controller.signal,
			});
		}

		_$l(`[Trace] Token response: ${res.status}`, "info");
		return res;
	} catch (e) {
		_$l(`Token fetch error: ${e.message}`, "error");
		return { status: 0, json: () => Promise.resolve({}) };
	} finally {
		clearTimeout(timeoutId);
	}
}

function _$rsa(info) {
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

function _$gsi(url) {
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

function _$hpa(text) {
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
		LastActivityAt: Date.now(),
	};

	__TTVAB_STATE__.StreamInfos[normalizedContext.MediaKey] = info;
	if (url) {
		__TTVAB_STATE__.StreamInfosByUrl[url] = info;
	}

	const logTarget =
		normalizedContext.MediaType === "vod"
			? `vod ${normalizedContext.VodID}`
			: normalizedContext.ChannelName;
	_$l(`Synthetic stream info created for ${logTarget}`, "warning");
	return info;
}

function _buildUsherPlaybackUrl(info, sig, token) {
	let usherUrl = null;

	if (typeof info?.UsherBaseUrl === "string" && info.UsherBaseUrl) {
		try {
			usherUrl = new URL(info.UsherBaseUrl);
		} catch {}
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

async function _$pm(url, text, realFetch) {
	let info = _$gsi(url);
	if (!info) {
		if (
			!_$hpa(text) &&
			!_$pka(text) &&
			__TTVAB_STATE__.SimulatedAdsDepth === 0
		) {
			return text;
		}
		info = _createSyntheticStreamInfo(
			{
				MediaType: __TTVAB_STATE__.PageMediaType,
				ChannelName:
					__TTVAB_STATE__.CurrentAdChannel || __TTVAB_STATE__.PageChannel,
				VodID: __TTVAB_STATE__.PageVodID,
				MediaKey:
					__TTVAB_STATE__.CurrentAdMediaKey || __TTVAB_STATE__.PageMediaKey,
			},
			url,
		);
		if (!info) return text;
	}
	info.LastActivityAt = Date.now();

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
			} = _$rsa(info);
			__TTVAB_STATE__.CurrentAdChannel = null;
			__TTVAB_STATE__.CurrentAdMediaKey = null;
			__TTVAB_STATE__.PinnedBackupPlayerType = null;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
			__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
			_$l("Ad blocking disabled - restoring native stream state", "info");
			if (
				(wasUsingModifiedM3U8 ||
					wasUsingFallbackStream ||
					wasUsingBackupStream) &&
				typeof self !== "undefined" &&
				self.postMessage
			) {
				self.postMessage(
					_createPageScopedWorkerEvent({
						key: "AdEnded",
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
					}),
				);
				if (__TTVAB_STATE__.ReloadAfterAd) {
					info.LastPlayerReload = Date.now();
					self.postMessage(
						_createPageScopedWorkerEvent({
							key: "ReloadPlayer",
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
		info.LastPlayerReload = Date.now();
	}

	const hasAds =
		_$hpa(text) ||
		_$pka(text) ||
		__TTVAB_STATE__.SimulatedAdsDepth > 0;
	const hasMediaSegments = _playlistHasMediaSegments(text);

	if (hasAds) {
		info.PendingAdEndAt = 0;
		info.CleanPlaylistCount = 0;
		info.IsMidroll = text.includes('"MIDROLL"') || text.includes('"midroll"');

		if (!info.IsShowingAd) {
			info.IsShowingAd = true;
			__TTVAB_STATE__.CurrentAdChannel = info.ChannelName;
			__TTVAB_STATE__.CurrentAdMediaKey = info.MediaKey;
			__TTVAB_STATE__.LastAdDetectedAt = Date.now();
			info.FailedBackupPlayerTypes?.clear?.();
			if (typeof self !== "undefined" && self.postMessage) {
				self.postMessage(
					_createPageScopedWorkerEvent({
						key: "AdDetected",
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
						source: info.IsMidroll ? "midroll" : "playlist-ad",
					}),
				);
			}
		}

		if (info.IsUsingFallbackStream) {
			text = _$sa(text, false, info);
			return text;
		}

		const res =
			info.Urls?.[url] ||
			info.Urls?.[url.trimEnd()] ||
			_$gfr(info, url);
		if (!res) {
			_$l(
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
		} = await _$fb(info, realFetch, startIdx, res);

		if (!backupM3u8) _$l("Failed to find backup stream", "warning");

		if (isFallback) {
			info.IsUsingFallbackStream = true;
			_$l("Entering fallback mode - stripping ads", "info");
		}

		if (backupM3u8) {
			info.IsUsingBackupStream = true;
			text = backupM3u8;
		}

		info.ActiveBackupResolution = res?.Resolution || null;
		if (info.ActiveBackupPlayerType !== backupType) {
			info.ActiveBackupPlayerType = backupType;
			_$l(`Using backup: ${backupType}`, "info");
			if (backupType && typeof self !== "undefined" && self.postMessage) {
				self.postMessage(
					_createPageScopedWorkerEvent({
						key: "BackupPlayerTypeSelected",
						value: backupType,
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
					}),
				);
			}
		}

		const stripHevc = isHevc && info.ModifiedM3U8;
		if (__TTVAB_STATE__.IsAdStrippingEnabled || stripHevc) {
			text = _$sa(text, stripHevc, info);
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
			} = _$rsa(info);
			__TTVAB_STATE__.CurrentAdChannel = null;
			__TTVAB_STATE__.CurrentAdMediaKey = null;
			__TTVAB_STATE__.PinnedBackupPlayerType = null;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
			__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
			if (typeof self !== "undefined" && self.postMessage) {
				self.postMessage(
					_createPageScopedWorkerEvent({
						key: "AdEnded",
						channel: info.ChannelName,
						mediaKey: info.MediaKey,
					}),
				);
				if (
					(wasUsingModifiedM3U8 ||
						wasUsingFallbackStream ||
						wasUsingBackupStream) &&
					__TTVAB_STATE__.ReloadAfterAd
				) {
					info.LastPlayerReload = Date.now();
					self.postMessage(
						_createPageScopedWorkerEvent({
							key: "ReloadPlayer",
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

async function _$fb(
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
		_$l(`[Trace] Checking: ${pt}`, "info");

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
					const tokenRes = await _$tk(info, realPt, realFetch);
					if (tokenRes.status === 200) {
						const token = await tokenRes.json();
						const extractedToken = _extractPlaybackAccessToken(token);
						const sig = extractedToken?.signature;
						const tokenValue = extractedToken?.value;

						if (sig && tokenValue) {
							info.FailedBackupPlayerTypes?.delete?.(pt);
							const usherUrl = _buildUsherPlaybackUrl(info, sig, tokenValue);
							if (!usherUrl) {
								_$l(`Missing usher context for ${pt}`, "warning");
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
							} else {
								_$l(`Usher failed for ${pt}: ${encRes.status}`, "warning");
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
							_$l(
								`[Trace] Missing token ${missingParts || "parts"} for ${pt}${tokenContext}`,
								"warning",
							);
						}
					} else {
						_$l(`Token failed for ${pt}: ${tokenRes.status}`, "warning");
					}
				} catch (e) {
					_$l(`Backup error: ${e.message}`, "error");
				}
			}

			if (enc) {
				try {
					const streamUrl = _$su(enc, targetRes, encBaseUrl);
					if (streamUrl) {
						const streamRes = await realFetch(streamUrl);
						if (streamRes.status === 200) {
							const m3u8 = await streamRes.text();
							if (m3u8) {
								const candidateHasAds =
									_$hpa(m3u8) ||
									_$hem(m3u8) ||
									_$pka(m3u8);
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
									_$l(`[Trace] Selected: ${pt}`, "success");
									break;
								}
								if (isFullyCachedPlayerType) {
									_$l(
										`[Trace] Rejected ${pt} (${promotionPolicy.reason})`,
										"warning",
									);
									break;
								}
								_$l(
									`[Trace] Rejected ${pt} (${promotionPolicy.reason})`,
									"warning",
								);
								invalidateCache = true;
							}
						} else {
							_$l(`Stream failed for ${pt}: ${streamRes.status}`, "warning");
							invalidateCache = true;
						}
					} else {
						_$l(`No stream URL for ${pt}`, "warning");
						invalidateCache = true;
					}
				} catch (e) {
					_$l(`Stream error: ${e.message}`, "warning");
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
		_$l(`[Trace] Using fallback: ${backupType}`, "warning");
	}

	return { type: backupType, m3u8: backupM3u8, isFallback };
}

function _$wj(url) {
	const req = new XMLHttpRequest();
	req.open("GET", url, false);
	req.send();
	return req.responseText;
}

function _$cw(W) {
	const CleanWorker = class extends W {};
	const proto = CleanWorker.prototype;
	for (const key of _$s.conflicts) {
		if (key in proto) {
			Object.defineProperty(proto, key, {
				configurable: true,
				writable: true,
				value: undefined,
			});
		}
	}
	return CleanWorker;
}

function _$gr(W) {
	const src = W.toString();
	const result = [];
	for (const pattern of _$s.reinsertPatterns) {
		if (src.includes(pattern)) result.push(pattern);
	}
	return result;
}

function _$re(W, names) {
	for (const name of names) {
		if (typeof window[name] === "function") {
			W.prototype[name] = window[name];
		}
	}
	return W;
}

function _$iv(v) {
	if (typeof v !== "function") return false;
	const src = v.toString();
	return (
		!_$s.conflicts.some((c) => src.includes(c)) &&
		!_$s.reinsertPatterns.some((p) => src.includes(p))
	);
}

function _$wf() {
	_$l("Worker fetch hooked", "info");
	const realFetch = fetch;
	const EMPTY_SEGMENT_URL =
		"data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292";

	function _$ps() {
		const keys = Object.keys(__TTVAB_STATE__.StreamInfos);
		if (keys.length > 5) {
			const oldKey = keys[0];
			const oldInfo = __TTVAB_STATE__.StreamInfos[oldKey];
			delete __TTVAB_STATE__.StreamInfos[oldKey];
			for (const url in __TTVAB_STATE__.StreamInfosByUrl) {
				if (__TTVAB_STATE__.StreamInfosByUrl[url] === oldInfo) {
					delete __TTVAB_STATE__.StreamInfosByUrl[url];
				}
			}
		}
	}

	function _$si(info, encodings, usherUrl) {
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
				const attrs = _$pa(lines[i]);
				const resolution = attrs.RESOLUTION;
				let variantUrl = lines[i + 1];
				try {
					variantUrl = new URL(variantUrl, usherUrl).href;
				} catch {}
				if (resolution) {
					const resInfo = _$sv(
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
					const attrs = _$pa(modLines[mi]);
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
			_$l("HEVC stream detected, created fallback M3U8", "info");
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

		if (
			__TTVAB_STATE__.AdSegmentCache.has(url) ||
			(typeof _$kas === "function" && _$kas(url))
		) {
			return realFetch(EMPTY_SEGMENT_URL);
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
			const serverTime = _$gt(encodings);
			let info = __TTVAB_STATE__.StreamInfos[playbackContext.MediaKey];

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
				_$ps();
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
			} else {
				info.MediaType = playbackContext.MediaType;
				info.MediaKey = playbackContext.MediaKey;
				info.ChannelName = playbackContext.ChannelName;
				info.VodID = playbackContext.VodID;
			}

			_$si(info, encodings, url);
			info.LastActivityAt = Date.now();

			if (isNewInfo) {
				_$l(`Stream initialized: ${logTarget}`, "success");
			}

			const playlist = info.IsUsingModifiedM3U8
				? info.ModifiedM3U8
				: info.EncodingsM3U8;
			return new Response(
				_$rt(playlist, serverTime),
				responseInit(response),
			);
		}

		if (/\.m3u8(?:$|\?)/.test(url)) {
			const response = await realFetch.apply(this, getFetchArgs(url));
			if (response.status === 200) {
				const text = await response.text();
				return new Response(
					await _$pm(url, text, realFetch),
					responseInit(response),
				);
			}
			return response;
		}

		return realFetch.apply(this, args);
	};
}

function _$sd() {
	try {
		const deviceId = localStorage.getItem("unique_id");
		if (typeof deviceId === "string" && deviceId) {
			__TTVAB_STATE__.GQLDeviceID = deviceId;
			return deviceId;
		}
	} catch (e) {
		_$l(`Device ID sync error: ${e.message}`, "warning");
	}
	return null;
}

function _$hw() {
	_$sd();
	const reinsertNames = _$gr(window.Worker);
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

	const HookedWorker = class Worker extends _$cw(window.Worker) {
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

			const injectedCode = `
                const _$c = ${JSON.stringify(_$c)};
                const _$s = ${JSON.stringify(_$s)};
                const _$ar = ${_$ar.toString()};
                ${_$l.toString()}
                ${_$ds.toString()}
                ${_getPageScopedPlaybackEventContext.toString()}
                ${_createPageScopedWorkerEvent.toString()}
                ${_$ab.toString()}
                ${_normalizeChannelName.toString()}
                ${_normalizeVodID.toString()}
                ${_buildMediaKey.toString()}
                ${_normalizeMediaKey.toString()}
                ${_normalizePlaybackContext.toString()}
                ${_getPlaybackContextFromUrl.toString()}
                ${_getPlaybackContextFromUsherUrl.toString()}
                ${_$pa.toString()}
                ${_$gt.toString()}
                ${_$rt.toString()}
                ${_$hem.toString()}
                ${_$kas.toString()}
                ${_$pka.toString()}
                ${_$sa.toString()}
                ${_$sv.toString()}
                ${_$su.toString()}
                ${_$gfr.toString()}
                ${_collectPlaybackAccessTokenSources.toString()}
                ${_summarizePlaybackAccessTokenPayload.toString()}
                ${_getPlaybackAccessTokenErrors.toString()}
                ${_extractPlaybackAccessToken.toString()}
                ${_isWorkerContext.toString()}
                ${_createFetchRelayResponse.toString()}
                ${_fetchViaWorkerBridge.toString()}
                ${_$tk.toString()}
                ${_$rsa.toString()}
                ${_$gsi.toString()}
                ${_createSyntheticStreamInfo.toString()}
                ${_buildUsherPlaybackUrl.toString()}
                ${_$hpa.toString()}
                ${_playlistHasMediaSegments.toString()}
                ${_getFallbackPromotionPolicy.toString()}
                ${_$pm.toString()}
                ${_$fb.toString()}
                ${_$wj.toString()}
                ${_$wf.toString()}
                
                const _$gu = '${_$gu}';
                const wasmSource = _$wj('${workerSourceUrl.replaceAll("'", "%27")}');
                _$ds(self);
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
                __TTVAB_STATE__.PinnedBackupPlayerChannel = ${JSON.stringify(__TTVAB_STATE__.PinnedBackupPlayerChannel)};
                __TTVAB_STATE__.PinnedBackupPlayerMediaKey = ${JSON.stringify(__TTVAB_STATE__.PinnedBackupPlayerMediaKey)};
                __TTVAB_STATE__.IsAdStrippingEnabled = ${JSON.stringify(__TTVAB_STATE__.IsAdStrippingEnabled)};
                __TTVAB_STATE__.PageMediaType = ${JSON.stringify(pagePlaybackContext.MediaType)};
                __TTVAB_STATE__.PageChannel = ${JSON.stringify(pagePlaybackContext.ChannelName)};
                __TTVAB_STATE__.PageVodID = ${JSON.stringify(pagePlaybackContext.VodID)};
                __TTVAB_STATE__.PageMediaKey = ${JSON.stringify(pagePlaybackContext.MediaKey)};
                
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
                        case 'UpdateAdsBlocked': _$s.adsBlocked = data.value; break;
                        case 'UpdateGQLHash': __TTVAB_STATE__.PlaybackAccessTokenHash = data.value; break;
                        case 'UpdateLastNativePlaybackAccessTokenPlayerType': __TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType = data.value; break;
                        case 'UpdatePageContext':
                            {
                                const nextPageContext = _normalizePlaybackContext(data.value);
                                __TTVAB_STATE__.PageMediaType = nextPageContext.MediaType;
                                __TTVAB_STATE__.PageChannel = nextPageContext.ChannelName;
                                __TTVAB_STATE__.PageVodID = nextPageContext.VodID;
                                __TTVAB_STATE__.PageMediaKey = nextPageContext.MediaKey;
                            }
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
                            __TTVAB_STATE__.PinnedBackupPlayerChannel = data.channel || null;
                            __TTVAB_STATE__.PinnedBackupPlayerMediaKey =
                                _buildMediaKey('live', data.channel || null, null);
                            break;
                        case 'UpdatePinnedBackupPlayerContext':
                            {
                                const nextPinnedContext = _normalizePlaybackContext(data.value);
                                __TTVAB_STATE__.PinnedBackupPlayerType = data.value?.type || null;
                                __TTVAB_STATE__.PinnedBackupPlayerChannel = nextPinnedContext.ChannelName;
                                __TTVAB_STATE__.PinnedBackupPlayerMediaKey = nextPinnedContext.MediaKey;
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
                        case 'TriggeredPlayerReload': __TTVAB_STATE__.HasTriggeredPlayerReload = true; break;
                    }
                });
                
                _$wf();
                eval(wasmSource);
            `;

			const blobUrl = URL.createObjectURL(new Blob([injectedCode]));
			super(blobUrl, opts);
			setTimeout(() => URL.revokeObjectURL(blobUrl), 0);

			const getCurrentPageContext = () =>
				_getPlaybackContextFromUrl(window.location.href);
			const isStalePlaybackEvent = (message) => {
				const currentContext = getCurrentPageContext();
				const pageScopedMediaKey = _normalizeMediaKey(
					message?.pageMediaKey || null,
				);
				if (pageScopedMediaKey && currentContext.MediaKey) {
					return currentContext.MediaKey !== pageScopedMediaKey;
				}

				const eventContext = _normalizePlaybackContext({
					MediaKey: message?.mediaKey || null,
					ChannelName: message?.channel || null,
					VodID: message?.vodID || null,
				});
				if (eventContext.MediaKey && currentContext.MediaKey) {
					return currentContext.MediaKey !== eventContext.MediaKey;
				}
				if (eventContext.ChannelName) {
					return Boolean(
						currentContext.ChannelName &&
							currentContext.ChannelName !== eventContext.ChannelName,
					);
				}
				return false;
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
						if (isStalePlaybackEvent(e.data)) {
							_$l(
								`Ignoring stale AdBlocked event for ${e.data.mediaKey || e.data.channel}`,
								"info",
							);
							break;
						}
						_$s.adsBlocked = Math.max(
							Number.isFinite(_$s.adsBlocked) ? _$s.adsBlocked : 0,
							Number.isFinite(e.data.count) ? e.data.count : 0,
						);
						_$l(`Ad blocked! Total: ${e.data.count}`, "success");
						break;
					case "AdDetected":
						if (isStalePlaybackEvent(e.data)) {
							_$l(
								`Ignoring stale AdDetected event for ${e.data.mediaKey || e.data.channel}`,
								"info",
							);
							break;
						}
						{
							const now = Date.now();
							const detectedContext = _normalizePlaybackContext({
								MediaType: __TTVAB_STATE__.PageMediaType,
								ChannelName:
									e.data.channel || __TTVAB_STATE__.CurrentAdChannel || null,
								VodID: __TTVAB_STATE__.PageVodID,
								MediaKey:
									e.data.mediaKey ||
									__TTVAB_STATE__.CurrentAdMediaKey ||
									__TTVAB_STATE__.PageMediaKey,
							});
							const channel = detectedContext.ChannelName;
							const mediaKey = detectedContext.MediaKey;
							const shouldStartNewCycle =
								!__TTVAB_STATE__.CurrentAdMediaKey ||
								__TTVAB_STATE__.CurrentAdMediaKey !== mediaKey ||
								now - (__TTVAB_STATE__.LastAdDetectedAt || 0) >
									__TTVAB_STATE__.AdCycleStaleMs;
							if (shouldStartNewCycle) {
								__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
								__TTVAB_STATE__.PinnedBackupPlayerType = null;
								__TTVAB_STATE__.PinnedBackupPlayerChannel = channel;
								__TTVAB_STATE__.PinnedBackupPlayerMediaKey = mediaKey;
								if (typeof _$ab === "function") {
									_$ab(
										channel,
										mediaKey,
										e.data.source || "playlist-ad",
									);
								}
								if (typeof _suppressPauseIntent === "function") {
									_suppressPauseIntent(channel, mediaKey, 4000);
								}
								if (typeof _suppressCompetingMediaDuringAd === "function") {
									_suppressCompetingMediaDuringAd(channel, mediaKey);
									setTimeout(
										() => _suppressCompetingMediaDuringAd(channel, mediaKey),
										80,
									);
									setTimeout(
										() => _suppressCompetingMediaDuringAd(channel, mediaKey),
										350,
									);
								}
								if (typeof _$rpfa === "function") {
									_$rpfa(channel, mediaKey);
								}
								if (typeof _resumeActivePlayerIfPaused === "function") {
									setTimeout(
										() => _resumeActivePlayerIfPaused(channel, mediaKey),
										180,
									);
									setTimeout(
										() => _resumeActivePlayerIfPaused(channel, mediaKey),
										650,
									);
									setTimeout(
										() => _resumeActivePlayerIfPaused(channel, mediaKey),
										1400,
									);
								}
							}
							__TTVAB_STATE__.CurrentAdChannel = channel;
							__TTVAB_STATE__.CurrentAdMediaKey = mediaKey;
							__TTVAB_STATE__.LastAdDetectedAt = now;
						}
						_$bw({
							key: "UpdateCurrentAdContext",
							value: {
								channelName: __TTVAB_STATE__.CurrentAdChannel,
								mediaKey: __TTVAB_STATE__.CurrentAdMediaKey,
							},
						});
						_$l("Ad detected, blocking...", "warning");
						break;
					case "BackupPlayerTypeSelected": {
						if (isStalePlaybackEvent(e.data)) {
							_$l(
								`Ignoring stale backup selection for ${e.data.mediaKey || e.data.channel}`,
								"info",
							);
							break;
						}
						const nextPinnedType = e.data.value || null;
						const nextPinnedContext = _normalizePlaybackContext({
							MediaType: __TTVAB_STATE__.PageMediaType,
							ChannelName:
								e.data.channel || __TTVAB_STATE__.CurrentAdChannel || null,
							VodID: __TTVAB_STATE__.PageVodID,
							MediaKey:
								e.data.mediaKey ||
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
							setTimeout(
								() =>
									_suppressCompetingMediaDuringAd(
										nextPinnedContext.ChannelName,
										nextPinnedContext.MediaKey,
									),
								120,
							);
						}
						if (typeof _resumeActivePlayerIfPaused === "function") {
							setTimeout(
								() =>
									_resumeActivePlayerIfPaused(
										nextPinnedContext.ChannelName,
										nextPinnedContext.MediaKey,
									),
								180,
							);
							setTimeout(
								() =>
									_resumeActivePlayerIfPaused(
										nextPinnedContext.ChannelName,
										nextPinnedContext.MediaKey,
									),
								650,
							);
						}
						_$bw({
							key: "UpdatePinnedBackupPlayerContext",
							value: {
								type: __TTVAB_STATE__.PinnedBackupPlayerType,
								channelName: __TTVAB_STATE__.PinnedBackupPlayerChannel,
								mediaKey: __TTVAB_STATE__.PinnedBackupPlayerMediaKey,
							},
						});
						_$l(`Pinned backup type: ${e.data.value}`, "info");
						break;
					}
					case "AdEnded":
						if (isStalePlaybackEvent(e.data)) {
							_$l(
								`Ignoring stale AdEnded event for ${e.data.mediaKey || e.data.channel}`,
								"info",
							);
							break;
						}
						__TTVAB_STATE__.CurrentAdChannel = null;
						__TTVAB_STATE__.CurrentAdMediaKey = null;
						__TTVAB_STATE__.PinnedBackupPlayerType = null;
						__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
						__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
						__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
						_$bw({
							key: "UpdateCurrentAdContext",
							value: null,
						});
						_$bw({
							key: "UpdatePinnedBackupPlayerContext",
							value: null,
						});
						if (typeof _clearUserPauseIntent === "function") {
							_clearUserPauseIntent(
								e.data.channel || null,
								e.data.mediaKey || null,
							);
						}
						if (typeof _suppressPauseIntent === "function") {
							_suppressPauseIntent(
								e.data.channel || null,
								e.data.mediaKey || null,
								3000,
							);
						}
						_$l("Ad ended", "success");
						try {
							const removableSelectors = [
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
						if (typeof _restoreSuppressedMediaAfterAd === "function") {
							_restoreSuppressedMediaAfterAd(
								e.data.channel || null,
								e.data.mediaKey || null,
							);
						}
						if (typeof _$rpa === "function") {
							setTimeout(() => {
								_$rpa(
									e.data.channel || null,
									e.data.mediaKey || null,
								);
							}, 150);
						}
						if (typeof _scheduleResumeRetries === "function") {
							_scheduleResumeRetries(
								e.data.channel || null,
								e.data.mediaKey || null,
								[250, 700, 1400, 2400],
							);
						}
						if (typeof _resumeActivePlayerIfPaused === "function") {
							setTimeout(() => {
								_resumeActivePlayerIfPaused(
									e.data.channel || null,
									e.data.mediaKey || null,
								);
							}, 320);
							setTimeout(() => {
								_resumeActivePlayerIfPaused(
									e.data.channel || null,
									e.data.mediaKey || null,
								);
							}, 850);
						}
						break;
					case "PauseResumePlayer":
						_$l("Resuming player", "info");
						if (typeof _$dpt === "function") {
							_$dpt(true, false);
						}
						break;
					case "ReloadPlayer":
						if (isStalePlaybackEvent(e.data)) {
							_$l(
								`Ignoring stale ReloadPlayer event for ${e.data.mediaKey || e.data.channel}`,
								"info",
							);
							break;
						}
						_$l("Reloading player", "info");
						if (typeof _$dpt === "function") {
							_$dpt(false, true, { reason: "ad-recovery" });
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
				_$l(`Worker crashed: ${e.message || "Unknown error"}`, "error");

				const idx = _$s.workers.indexOf(this);
				if (idx > -1) _$s.workers.splice(idx, 1);

				if (restartAttempts < MAX_RESTART_ATTEMPTS) {
					restartAttempts++;
					const delay = 2 ** restartAttempts * 500;
					_$l(
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
							new window.Worker(_workerUrl, workerOpts);
							_$l("Worker restarted", "success");
							restartAttempts = 0;
						} catch (restartErr) {
							_$l(`Worker restart failed: ${restartErr.message}`, "error");
						}
					}, delay);
				} else {
					_$l("Worker restart limit reached", "error");
				}
			});

			_$s.workers.push(this);
			try {
				this.postMessage({
					key: "UpdateToggleState",
					value: __TTVAB_STATE__.IsAdStrippingEnabled,
				});
				this.postMessage({ key: "UpdateAdsBlocked", value: _$s.adsBlocked });
				this.postMessage({
					key: "UpdatePageContext",
					value: {
						mediaType: __TTVAB_STATE__.PageMediaType,
						channelName: __TTVAB_STATE__.PageChannel,
						vodID: __TTVAB_STATE__.PageVodID,
						mediaKey: __TTVAB_STATE__.PageMediaKey,
					},
				});
				this.postMessage({
					key: "UpdateCurrentAdContext",
					value: {
						channelName: __TTVAB_STATE__.CurrentAdChannel,
						mediaKey: __TTVAB_STATE__.CurrentAdMediaKey,
					},
				});
				this.postMessage({
					key: "UpdatePinnedBackupPlayerContext",
					value: {
						type: __TTVAB_STATE__.PinnedBackupPlayerType,
						channelName: __TTVAB_STATE__.PinnedBackupPlayerChannel,
						mediaKey: __TTVAB_STATE__.PinnedBackupPlayerMediaKey,
					},
				});
			} catch {}

			if (_$s.workers.length > 5) {
				const oldWorker = _$s.workers.shift();
				try {
					oldWorker.__TTVABIntentionallyTerminated = true;
					oldWorker.terminate();
				} catch {}
			}
		}
	};

	let workerInstance = _$re(HookedWorker, reinsertNames);
	Object.defineProperty(window, "Worker", {
		get: () => workerInstance,
		set: (v) => {
			if (_$iv(v)) workerInstance = v;
		},
	});
}

function _$mf() {
	const realFetch = window.fetch;
	window.__TTVAB_REAL_FETCH__ = realFetch;
	const updateWorkers = (updates) => {
		if (Array.isArray(updates)) {
			for (const msg of updates) {
				_$bw(msg);
			}
		} else {
			_$bw(updates);
		}
	};
	const rewritePlaybackAccessTokenBody = (bodyText) => {
		if (typeof bodyText !== "string" || !bodyText) {
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
				_$l(
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
				_$sd();
				let nextArgs = args;
				let headers = opts?.headers;

				if (url instanceof Request) {
					let effectiveRequest = url;
					try {
						if (opts && Object.keys(opts).length > 0) {
							effectiveRequest = new Request(url, opts);
						}
						headers = effectiveRequest.headers;
						const text = await effectiveRequest.clone().text();
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

const _$pbs = {
	position: 0,
	bufferedPosition: 0,
	bufferDuration: 0,
	numSame: 0,
	lastFixTime: 0,
};

let _$cpr = null;
const _AdAudioSuppressionState = {
	suppressedMedia: new Map(),
	activeMediaKey: null,
	lastSuppressedCount: 0,
};
const _PlaybackIntentState = {
	observedMedia: null,
	pauseListener: null,
	playListener: null,
	userPausedMediaKey: null,
	userPausedAt: 0,
	lastProgrammaticPauseAt: 0,
	lastProgrammaticPlayAt: 0,
	suppressedPauseMediaKey: null,
	suppressedPauseUntil: 0,
};
const _$ppk = [
	"video-quality",
	"video-muted",
	"volume",
	"lowLatencyModeEnabled",
	"persistenceEnabled",
];

function _$gpc(player) {
	return player?.playerInstance?.core || player?.core || null;
}

function _$rr() {
	const rootNode = document.querySelector("#root");
	if (!rootNode) return null;

	if (rootNode._reactRootContainer?._internalRoot?.current) {
		return rootNode._reactRootContainer._internalRoot.current;
	}

	const containerName = Object.keys(rootNode).find((x) =>
		x.startsWith("__reactContainer"),
	);
	if (containerName) {
		return rootNode[containerName];
	}

	return null;
}

function _$rn(root, constraint) {
	if (!root) return null;

	if (root.stateNode && constraint(root.stateNode)) {
		return root.stateNode;
	}

	let node = root.child;
	while (node) {
		const result = _$rn(node, constraint);
		if (result) return result;
		node = node.sibling;
	}

	return null;
}

function _$gps() {
	const reactRoot = _$rr();
	if (!reactRoot) return { player: null, state: null };

	let player = _$rn(
		reactRoot,
		(node) => node.setPlayerActive && node.props?.mediaPlayerInstance,
	);
	player = player?.props?.mediaPlayerInstance || null;

	const playerState = _$rn(
		reactRoot,
		(node) => node.setSrc && node.setInitialPlaybackSettings,
	);

	return { player, state: playerState };
}

function _normalizePlayerChannel(channel = null) {
	if (typeof channel !== "string") return null;
	const trimmed = channel.trim().toLowerCase();
	return trimmed || null;
}

function _resolvePlayerMediaKey(channel = null, mediaKey = null) {
	return (
		_normalizeMediaKey(mediaKey) ||
		_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) ||
		_normalizeMediaKey(__TTVAB_STATE__.PageMediaKey) ||
		_buildMediaKey("live", channel, null) ||
		_buildMediaKey("live", __TTVAB_STATE__.CurrentAdChannel, null) ||
		_buildMediaKey("live", __TTVAB_STATE__.PageChannel, null) ||
		null
	);
}

function _markProgrammaticPause() {
	_PlaybackIntentState.lastProgrammaticPauseAt = Date.now();
}

function _markProgrammaticPlay() {
	_PlaybackIntentState.lastProgrammaticPlayAt = Date.now();
}

function _wasRecentProgrammaticPlaybackAction(kind) {
	const now = Date.now();
	if (kind === "pause") {
		return now - (_PlaybackIntentState.lastProgrammaticPauseAt || 0) < 750;
	}
	if (kind === "play") {
		return now - (_PlaybackIntentState.lastProgrammaticPlayAt || 0) < 1500;
	}
	return false;
}

function _clearUserPauseIntent(channel = null, mediaKey = null) {
	if (!_PlaybackIntentState.userPausedMediaKey) return false;

	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	if (
		safeMediaKey &&
		_PlaybackIntentState.userPausedMediaKey !== safeMediaKey
	) {
		return false;
	}

	_PlaybackIntentState.userPausedMediaKey = null;
	_PlaybackIntentState.userPausedAt = 0;
	return true;
}

function _resetPlaybackIntentForNavigation(
	channel = null,
	mediaKey = null,
	durationMs = 2500,
) {
	_PlaybackIntentState.userPausedMediaKey = null;
	_PlaybackIntentState.userPausedAt = 0;
	_suppressPauseIntent(channel, mediaKey, durationMs);
}

function _hasUserPauseIntent(channel = null, mediaKey = null) {
	if (!_PlaybackIntentState.userPausedMediaKey) return false;

	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	if (!safeMediaKey) return false;
	return _PlaybackIntentState.userPausedMediaKey === safeMediaKey;
}

function _suppressPauseIntent(
	channel = null,
	mediaKey = null,
	durationMs = 3000,
) {
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	if (!safeMediaKey || !Number.isFinite(durationMs) || durationMs <= 0) {
		return false;
	}

	_PlaybackIntentState.suppressedPauseMediaKey = safeMediaKey;
	_PlaybackIntentState.suppressedPauseUntil = Date.now() + durationMs;
	return true;
}

function _isPauseIntentSuppressed(channel = null, mediaKey = null) {
	const until = _PlaybackIntentState.suppressedPauseUntil || 0;
	if (until <= Date.now()) {
		_PlaybackIntentState.suppressedPauseMediaKey = null;
		_PlaybackIntentState.suppressedPauseUntil = 0;
		return false;
	}

	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	if (!safeMediaKey) return false;
	return _PlaybackIntentState.suppressedPauseMediaKey === safeMediaKey;
}

function _pausePlaybackTarget(target) {
	_markProgrammaticPause();
	try {
		target?.pause?.();
		return true;
	} catch {
		return false;
	}
}

function _playPlaybackTarget(target, channel = null, mediaKey = null) {
	if (_hasUserPauseIntent(channel, mediaKey)) {
		return false;
	}

	_markProgrammaticPlay();
	try {
		const playResult = target?.play?.();
		if (typeof playResult?.catch === "function") {
			playResult.catch(() => {});
		}
		return true;
	} catch {
		return false;
	}
}

function _syncPrimaryMediaPlaybackIntent() {
	const media = _getPrimaryMediaElement();
	if (media === _PlaybackIntentState.observedMedia) return;

	if (_PlaybackIntentState.observedMedia) {
		if (_PlaybackIntentState.pauseListener) {
			_PlaybackIntentState.observedMedia.removeEventListener(
				"pause",
				_PlaybackIntentState.pauseListener,
				true,
			);
		}
		if (_PlaybackIntentState.playListener) {
			_PlaybackIntentState.observedMedia.removeEventListener(
				"play",
				_PlaybackIntentState.playListener,
				true,
			);
		}
	}

	_PlaybackIntentState.observedMedia = null;
	_PlaybackIntentState.pauseListener = null;
	_PlaybackIntentState.playListener = null;

	if (!(media instanceof HTMLMediaElement)) return;

	const handlePause = () => {
		if (_wasRecentProgrammaticPlaybackAction("pause")) return;
		if (media.ended) return;
		if (_isPauseIntentSuppressed(null, __TTVAB_STATE__.PageMediaKey)) return;
		if (!media.isConnected) return;

		const currentPrimaryMedia = _getPrimaryMediaElement();
		if (
			currentPrimaryMedia instanceof HTMLMediaElement &&
			currentPrimaryMedia !== media
		) {
			return;
		}

		const mediaKey = _resolvePlayerMediaKey(null, __TTVAB_STATE__.PageMediaKey);
		if (!mediaKey) return;

		_PlaybackIntentState.userPausedMediaKey = mediaKey;
		_PlaybackIntentState.userPausedAt = Date.now();
	};

	const handlePlay = () => {
		if (_wasRecentProgrammaticPlaybackAction("play")) return;
		_clearUserPauseIntent(null, __TTVAB_STATE__.PageMediaKey);
	};

	media.addEventListener("pause", handlePause, true);
	media.addEventListener("play", handlePlay, true);
	_PlaybackIntentState.observedMedia = media;
	_PlaybackIntentState.pauseListener = handlePause;
	_PlaybackIntentState.playListener = handlePlay;
}

function _monitorPlaybackIntent() {
	function check() {
		try {
			_syncPrimaryMediaPlaybackIntent();

			const currentMediaKey = _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey);
			if (
				currentMediaKey &&
				_PlaybackIntentState.userPausedMediaKey &&
				_PlaybackIntentState.userPausedMediaKey !== currentMediaKey
			) {
				_clearUserPauseIntent();
			}
			if (
				_PlaybackIntentState.suppressedPauseMediaKey &&
				currentMediaKey &&
				_PlaybackIntentState.suppressedPauseMediaKey !== currentMediaKey
			) {
				_PlaybackIntentState.suppressedPauseMediaKey = null;
				_PlaybackIntentState.suppressedPauseUntil = 0;
			}
		} catch (err) {
			_$l(`Playback intent monitor error: ${err.message}`, "warning");
		}

		setTimeout(check, 500);
	}

	check();
	_$l("Playback intent monitor active", "info");
}

function _resumeActivePlayerIfPaused(channel = null, mediaKey = null) {
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	if (_hasUserPauseIntent(safeChannel, safeMediaKey)) {
		return false;
	}

	const { player, state: playerState } = _$gps();
	if (!player || !playerState?.props?.content) {
		return false;
	}

	const playerCore = _$gpc(player);
	const video = player.getHTMLVideoElement?.() || null;
	if (video?.ended) return false;

	const isPaused = Boolean(
		player.isPaused?.() || playerCore?.paused || video?.paused,
	);
	if (!isPaused) return false;

	return _playPlaybackTarget(player, safeChannel, safeMediaKey);
}

function _scheduleResumeRetries(
	channel = null,
	mediaKey = null,
	delays = [120, 350, 900],
) {
	if (!Array.isArray(delays) || delays.length === 0) return;

	for (const delay of delays) {
		if (!Number.isFinite(delay) || delay < 0) continue;
		setTimeout(() => {
			try {
				_resumeActivePlayerIfPaused(channel, mediaKey);
			} catch {}
		}, delay);
	}
}

function _getFallbackPrimaryVideoElement() {
	const videos = Array.from(document.querySelectorAll("video"));
	let bestVideo = null;
	let bestArea = 0;

	for (const video of videos) {
		if (!(video instanceof HTMLMediaElement)) continue;
		const rect = video.getBoundingClientRect();
		const area = Math.max(0, rect.width) * Math.max(0, rect.height);
		if (area <= 0) continue;
		if (area > bestArea) {
			bestArea = area;
			bestVideo = video;
		}
	}

	return bestVideo;
}

function _getPrimaryMediaElement() {
	const { player } = _$gps();
	const playerVideo = player?.getHTMLVideoElement?.() || null;
	if (playerVideo instanceof HTMLMediaElement && playerVideo.isConnected) {
		return playerVideo;
	}
	return _getFallbackPrimaryVideoElement();
}

function _suppressCompetingMediaDuringAd(channel = null, mediaKey = null) {
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	const primaryMedia = _getPrimaryMediaElement();
	let suppressedCount = 0;

	for (const media of document.querySelectorAll("video, audio")) {
		if (!(media instanceof HTMLMediaElement)) continue;
		if (!media.isConnected || media.ended) continue;
		if (primaryMedia && media === primaryMedia) continue;
		if (media.paused && (media.muted || Number(media.volume ?? 1) === 0)) {
			continue;
		}

		if (!_AdAudioSuppressionState.suppressedMedia.has(media)) {
			_AdAudioSuppressionState.suppressedMedia.set(media, {
				muted: media.muted,
				defaultMuted: media.defaultMuted,
				volume: Number.isFinite(media.volume) ? media.volume : 1,
			});
		}

		try {
			media.defaultMuted = true;
			media.muted = true;
			media.volume = 0;
			media.setAttribute("data-ttvab-audio-suppressed", "true");
			suppressedCount += 1;
		} catch {}
	}

	_AdAudioSuppressionState.activeMediaKey = safeMediaKey;
	_AdAudioSuppressionState.lastSuppressedCount = suppressedCount;
	if (suppressedCount > 0) {
		_$l(
			`Suppressed ${suppressedCount} competing media element${suppressedCount === 1 ? "" : "s"} during ad recovery`,
			"info",
		);
	}
	return suppressedCount;
}

function _restoreSuppressedMediaAfterAd(channel = null, mediaKey = null) {
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	const activeMediaKey = _AdAudioSuppressionState.activeMediaKey;
	if (safeMediaKey && activeMediaKey && safeMediaKey !== activeMediaKey) {
		return 0;
	}

	let restoredCount = 0;
	for (const [
		media,
		state,
	] of _AdAudioSuppressionState.suppressedMedia.entries()) {
		if (!(media instanceof HTMLMediaElement)) continue;
		try {
			media.defaultMuted = Boolean(state.defaultMuted);
			media.muted = Boolean(state.muted);
			if (Number.isFinite(state.volume)) {
				media.volume = Math.min(1, Math.max(0, state.volume));
			}
			media.removeAttribute("data-ttvab-audio-suppressed");
			restoredCount += 1;
		} catch {}
	}

	_AdAudioSuppressionState.suppressedMedia.clear();
	_AdAudioSuppressionState.activeMediaKey = null;
	_AdAudioSuppressionState.lastSuppressedCount = 0;
	if (restoredCount > 0) {
		_$l(
			`Restored ${restoredCount} suppressed media element${restoredCount === 1 ? "" : "s"} after ad`,
			"info",
		);
	}
	return restoredCount;
}

function _$cari() {
	__TTVAB_STATE__.ShouldResumeAfterAd = false;
	__TTVAB_STATE__.ShouldResumeAfterAdChannel = null;
	__TTVAB_STATE__.ShouldResumeAfterAdMediaKey = null;
}

function _$rpfa(channel = null, mediaKey = null) {
	const safeChannel =
		_normalizePlayerChannel(channel) ||
		_normalizePlayerChannel(__TTVAB_STATE__.CurrentAdChannel) ||
		_normalizePlayerChannel(__TTVAB_STATE__.PageChannel);
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	const { player, state: playerState } = _$gps();

	let shouldResumeAfterAd = false;
	if (player && playerState?.props?.content) {
		const playerCore = _$gpc(player);
		const video = player.getHTMLVideoElement?.() || null;
		shouldResumeAfterAd = !(
			player.isPaused?.() ||
			playerCore?.paused ||
			video?.paused ||
			video?.ended
		);
	}

	__TTVAB_STATE__.ShouldResumeAfterAd = shouldResumeAfterAd;
	__TTVAB_STATE__.ShouldResumeAfterAdChannel = shouldResumeAfterAd
		? safeChannel
		: null;
	__TTVAB_STATE__.ShouldResumeAfterAdMediaKey = shouldResumeAfterAd
		? safeMediaKey
		: null;
}

function _$rpa(channel = null, mediaKey = null) {
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	const expectedChannel = __TTVAB_STATE__.ShouldResumeAfterAdChannel || null;
	const expectedMediaKey = __TTVAB_STATE__.ShouldResumeAfterAdMediaKey || null;
	const shouldResume =
		__TTVAB_STATE__.ShouldResumeAfterAd === true &&
		(!safeMediaKey || !expectedMediaKey || safeMediaKey === expectedMediaKey) &&
		(!safeChannel || !expectedChannel || safeChannel === expectedChannel);

	_$cari();
	if (!shouldResume) return false;

	const { player, state: playerState } = _$gps();
	if (!player || !playerState?.props?.content) {
		return false;
	}

	const playerCore = _$gpc(player);
	const video = player.getHTMLVideoElement?.() || null;
	if (video?.ended) {
		_$l("Player ended after ad; deferring recovery to buffer monitor", "info");
		return false;
	}

	const isPaused = Boolean(
		player.isPaused?.() || playerCore?.paused || video?.paused,
	);
	if (!isPaused) return false;

	const now = Date.now();
	if (
		__TTVAB_STATE__.LastAdRecoveryResumeAt &&
		now - __TTVAB_STATE__.LastAdRecoveryResumeAt < 1500
	) {
		_$l("Suppressing duplicate programmatic resume", "warning");
		return false;
	}
	__TTVAB_STATE__.LastAdRecoveryResumeAt = now;

	const didResume = _playPlaybackTarget(player, safeChannel, safeMediaKey);
	if (!didResume) {
		_$l("Skipping post-ad resume because playback is user-paused", "info");
		return false;
	}

	_$l("Resuming player after ad", "info");
	return true;
}

function _$cps(playerCore = null) {
	const snapshot = Object.create(null);

	try {
		for (const key of _$ppk) {
			snapshot[key] = localStorage.getItem(key);
		}

		if (playerCore?.state) {
			snapshot["video-muted"] = JSON.stringify({
				default: Boolean(playerCore.state.muted),
			});
			snapshot.volume = String(playerCore.state.volume);
		}

		if (playerCore?.state?.quality?.group) {
			snapshot["video-quality"] = JSON.stringify({
				default: playerCore.state.quality.group,
			});
		}
	} catch (err) {
		_$l(`Preference snapshot failed: ${err.message}`, "warning");
		return null;
	}

	return snapshot;
}

function _$rps2(snapshot) {
	if (!snapshot || typeof snapshot !== "object") return;

	try {
		for (const key of _$ppk) {
			if (!Object.hasOwn(snapshot, key)) continue;
			const value = snapshot[key];
			if (value === null || typeof value === "undefined") {
				localStorage.removeItem(key);
				continue;
			}
			localStorage.setItem(key, String(value));
		}
	} catch (err) {
		_$l(`Preference restore failed: ${err.message}`, "warning");
	}
}

function _$dpt(isPausePlay, isReload, options = {}) {
	const { player, state: playerState } = _$gps();

	if (!player) {
		_$l("Could not find player", "warning");
		return;
	}

	if (!playerState) {
		_$l("Could not find player state", "warning");
		return;
	}

	const playerCore = _$gpc(player);

	if (isPausePlay) {
		if (player.isPaused() || playerCore?.paused) {
			const didResume = _playPlaybackTarget(
				player,
				__TTVAB_STATE__.PageChannel,
				__TTVAB_STATE__.PageMediaKey,
			);
			if (didResume) {
				_scheduleResumeRetries(
					__TTVAB_STATE__.PageChannel,
					__TTVAB_STATE__.PageMediaKey,
					[80, 220, 500],
				);
			}
			return didResume;
		}
		_pausePlaybackTarget(player);
		_playPlaybackTarget(
			player,
			__TTVAB_STATE__.PageChannel,
			__TTVAB_STATE__.PageMediaKey,
		);
		_scheduleResumeRetries(
			__TTVAB_STATE__.PageChannel,
			__TTVAB_STATE__.PageMediaKey,
			[80, 220, 500],
		);
		return true;
	}

	if (isReload) {
		const reason = options.reason || "manual";
		const now = Date.now();
		const lastPlayerReloadAt = __TTVAB_STATE__.LastPlayerReloadAt || 0;
		if (
			lastPlayerReloadAt &&
			now - lastPlayerReloadAt < __TTVAB_STATE__.PlayerReloadDebounceMs
		) {
			_$l(`Suppressing duplicate reload (${reason})`, "warning");
			return false;
		}

		if (
			reason === "ad-recovery" &&
			(__TTVAB_STATE__.CurrentAdMediaKey || __TTVAB_STATE__.CurrentAdChannel) &&
			__TTVAB_STATE__.LastAdRecoveryReloadAt &&
			now - __TTVAB_STATE__.LastAdRecoveryReloadAt <
				__TTVAB_STATE__.AdRecoveryReloadCooldownMs
		) {
			_$l(
				`Suppressing duplicate ad recovery reload for ${__TTVAB_STATE__.CurrentAdMediaKey || __TTVAB_STATE__.CurrentAdChannel}`,
				"warning",
			);
			return false;
		}

		__TTVAB_STATE__.LastPlayerReloadAt = now;
		if (reason === "ad-recovery") {
			__TTVAB_STATE__.LastAdRecoveryReloadAt = now;
		}
		if (reason !== "manual") {
			_suppressPauseIntent(
				__TTVAB_STATE__.PageChannel,
				__TTVAB_STATE__.PageMediaKey,
				3000,
			);
		}
		const preferenceSnapshot = _$cps(playerCore);

		if (reason === "manual") {
			_$l("Reloading player", "info");
		}
		playerState.setSrc({
			isNewMediaPlayerInstance: true,
			refreshAccessToken: true,
		});

		_$bw({ key: "TriggeredPlayerReload" });

		_playPlaybackTarget(
			player,
			__TTVAB_STATE__.PageChannel,
			__TTVAB_STATE__.PageMediaKey,
		);
		_scheduleResumeRetries(
			__TTVAB_STATE__.PageChannel,
			__TTVAB_STATE__.PageMediaKey,
			[180, 500, 1100],
		);

		if (preferenceSnapshot) {
			setTimeout(() => {
				_$rps2(preferenceSnapshot);
			}, 3000);
		}

		return true;
	}

	return false;
}

function _$mpb() {
	function check() {
		if (_$cpr) {
			try {
				const player = _$cpr.player;
				const state = _$cpr.state;
				const playerCore = _$gpc(player);

				if (!playerCore) {
					_$cpr = null;
				} else if (
					state?.props?.content?.type === "live" &&
					player.getHTMLVideoElement()?.ended
				) {
					_$l(
						"Player hit end of stream during live playback. Recovering...",
						"warning",
					);
					_$dpt(false, true, { reason: "ad-recovery" });
					_$pbs.lastFixTime = Date.now();
				} else if (
					state?.props?.content?.type === "live" &&
					!player.isPaused() &&
					!player.getHTMLVideoElement()?.ended &&
					_$pbs.lastFixTime <=
						Date.now() - __TTVAB_STATE__.PlayerBufferingMinRepeatDelay
				) {
					const position = playerCore?.state?.position || 0;
					const bufferedPosition = playerCore?.state?.bufferedPosition || 0;
					const bufferDuration = player.getBufferDuration() || 0;

					if (
						(!__TTVAB_STATE__.PlayerBufferingPrerollCheckEnabled ||
							position > __TTVAB_STATE__.PlayerBufferingPrerollCheckOffset) &&
						(_$pbs.position === position ||
							bufferDuration < __TTVAB_STATE__.PlayerBufferingDangerZone) &&
						_$pbs.bufferedPosition === bufferedPosition &&
						_$pbs.bufferDuration >= bufferDuration &&
						(position !== 0 || bufferedPosition !== 0 || bufferDuration !== 0)
					) {
						_$pbs.numSame++;

						if (
							_$pbs.numSame ===
							__TTVAB_STATE__.PlayerBufferingSameStateCount
						) {
							_$l(`Attempting buffer fix (pos=${position})`, "warning");
							if (__TTVAB_STATE__.PlayerBufferingDoPlayerReload) {
								_$dpt(false, true);
							} else {
								_$dpt(true, false);
							}
							_$pbs.lastFixTime = Date.now();
							_$pbs.numSame = 0;
						}
					} else {
						_$pbs.numSame = 0;
					}

					_$pbs.position = position;
					_$pbs.bufferedPosition = bufferedPosition;
					_$pbs.bufferDuration = bufferDuration;
				}
			} catch (err) {
				_$l(`Buffer monitor error: ${err.message}`, "error");
				_$cpr = null;
			}
		}

		if (!_$cpr) {
			const playerAndState = _$gps();
			if (playerAndState.player && playerAndState.state) {
				_$cpr = playerAndState;
			}
		}

		setTimeout(check, __TTVAB_STATE__.PlayerBufferingDelay);
	}

	check();
	_$l("Buffer monitor active", "info");
}

function _$hvs() {
	window.__TTVAB_NATIVE_VISIBILITY__ = {
		hidden: document.__lookupGetter__("hidden") || null,
		webkitHidden: document.__lookupGetter__("webkitHidden") || null,
		mozHidden: document.__lookupGetter__("mozHidden") || null,
		visibilityState: document.__lookupGetter__("visibilityState") || null,
	};

	try {
		Object.defineProperty(document, "visibilityState", {
			get: () => "visible",
		});
	} catch {}

	const hiddenGetter = window.__TTVAB_NATIVE_VISIBILITY__.hidden;
	const webkitHiddenGetter = window.__TTVAB_NATIVE_VISIBILITY__.webkitHidden;

	try {
		Object.defineProperty(document, "hidden", {
			get: () => false,
		});
	} catch {}

	const blockEvent = (e) => {
		e.preventDefault();
		e.stopPropagation();
		e.stopImmediatePropagation();
	};

	let wasVideoPlaying = false;

	const handleVisibilityChange = (e) => {
		if (typeof chrome !== "undefined") {
			const primaryMedia = _getPrimaryMediaElement();
			if (primaryMedia instanceof HTMLMediaElement) {
				const isHidden =
					hiddenGetter?.apply(document) === true ||
					webkitHiddenGetter?.apply(document) === true;

				if (isHidden) {
					wasVideoPlaying =
						!primaryMedia.paused &&
						!primaryMedia.ended &&
						!_hasUserPauseIntent(
							__TTVAB_STATE__.PageChannel,
							__TTVAB_STATE__.PageMediaKey,
						);
				} else if (
					wasVideoPlaying &&
					!primaryMedia.ended &&
					primaryMedia.paused
				) {
					_playPlaybackTarget(
						primaryMedia,
						__TTVAB_STATE__.PageChannel,
						__TTVAB_STATE__.PageMediaKey,
					);
				}
			}
		}
		blockEvent(e);
	};

	document.addEventListener("visibilitychange", handleVisibilityChange, true);
	document.addEventListener(
		"webkitvisibilitychange",
		handleVisibilityChange,
		true,
	);
	document.addEventListener(
		"mozvisibilitychange",
		handleVisibilityChange,
		true,
	);
	document.addEventListener("hasFocus", blockEvent, true);

	try {
		if (/Firefox/.test(navigator.userAgent)) {
			Object.defineProperty(document, "mozHidden", { get: () => false });
		} else {
			Object.defineProperty(document, "webkitHidden", { get: () => false });
		}
	} catch {}

	_$l("Visibility protection active", "info");
}

const _$rk = "ttvab_last_reminder";
const _$ri2 = 1209600000;
const _$fr = "ttvab_first_run_shown";
const _UI_FLAGS_KEY = "__TTVAB_UI_FLAGS__";

function _getUiStorageItem(key) {
	try {
		return localStorage.getItem(key);
	} catch (e) {
		_$l(`UI storage read error for ${key}: ${e.message}`, "error");
		return null;
	}
}

function _setUiStorageItem(key, value) {
	try {
		localStorage.setItem(key, value);
		return true;
	} catch (e) {
		_$l(`UI storage write error for ${key}: ${e.message}`, "error");
		return false;
	}
}

function _escapeUiText(value) {
	const div = document.createElement("div");
	div.textContent = String(value ?? "");
	return div.innerHTML;
}

function _getUiFlags() {
	const existing = window[_UI_FLAGS_KEY];
	if (existing && typeof existing === "object") {
		return existing;
	}
	const flags = {
		achievementListenerInitialized: false,
		welcomeScheduled: false,
		donationScheduled: false,
	};
	window[_UI_FLAGS_KEY] = flags;
	return flags;
}

function _$dn() {
	try {
		const uiFlags = _getUiFlags();
		if (uiFlags.donationScheduled) return;
		const lastReminder = _getUiStorageItem(_$rk);
		const now = Date.now();

		if (!lastReminder) {
			_setUiStorageItem(_$rk, now.toString());
			return;
		}

		const lastReminderMs = Number.parseInt(lastReminder, 10);
		if (!Number.isFinite(lastReminderMs) || lastReminderMs > now) {
			_setUiStorageItem(_$rk, now.toString());
			return;
		}

		if (now - lastReminderMs < _$ri2) return;

		uiFlags.donationScheduled = true;
		setTimeout(() => {
			uiFlags.donationScheduled = false;
			if (document.getElementById("ttvab-reminder") || !document.body) return;
			const toast = document.createElement("div");
			toast.id = "ttvab-reminder";
			toast.innerHTML = `
                <style>
                    #ttvab-reminder{position:fixed;bottom:20px;right:20px;background:linear-gradient(135deg,#9146FF 0%,#772CE8 100%);color:#fff;padding:16px 20px;border-radius:12px;font-family:'Segoe UI',sans-serif;font-size:14px;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:999999;animation:ttvab-slide .3s ease}
                    @keyframes ttvab-slide{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
                    #ttvab-reminder-close{position:absolute;top:8px;right:10px;background:none;border:none;color:rgba(255,255,255,.7);font-size:18px;cursor:pointer;padding:0;line-height:1}
                    #ttvab-reminder-close:hover{color:#fff}
                    #ttvab-reminder-btn{display:inline-block;margin-top:10px;padding:8px 16px;background:#fff;color:#772CE8;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px}
                    #ttvab-reminder-btn:hover{background:#f0f0f0}
                </style>
                <button id="ttvab-reminder-close">×</button>
                <div style="margin-bottom:4px;font-weight:600">💜 Enjoying TTV AB?</div>
                <div style="opacity:.9">If this extension saves you from ads, consider buying me a coffee!</div>
                <button id="ttvab-reminder-btn">Support the Developer</button>
            `;

			document.body.appendChild(toast);
			_setUiStorageItem(_$rk, now.toString());

			const reminderClose = toast.querySelector("#ttvab-reminder-close");
			if (reminderClose) {
				reminderClose.onclick = () => toast.remove();
			}
			const reminderButton = toast.querySelector("#ttvab-reminder-btn");
			if (reminderButton) {
				reminderButton.onclick = () => {
					window.open(
						"https://ko-fi.com/gosudrm",
						"_blank",
						"noopener,noreferrer",
					);
					if (toast.isConnected) {
						toast.remove();
					}
				};
			}

			setTimeout(() => {
				if (toast.isConnected) {
					toast.style.animation = "ttvab-slide .3s ease reverse";
					setTimeout(() => toast.remove(), 300);
				}
			}, 15000);
		}, 5000);
	} catch (e) {
		_$l(`Donation reminder error: ${e.message}`, "error");
	}
}

function _$wc() {
	try {
		const uiFlags = _getUiFlags();
		if (uiFlags.welcomeScheduled || _getUiStorageItem(_$fr)) return;

		uiFlags.welcomeScheduled = true;
		setTimeout(() => {
			uiFlags.welcomeScheduled = false;
			if (document.getElementById("ttvab-welcome") || !document.body) return;
			const toast = document.createElement("div");
			toast.id = "ttvab-welcome";
			toast.innerHTML = `
                <style>
                    #ttvab-welcome{position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#9146FF 0%,#772CE8 100%);color:#fff;padding:20px 24px;border-radius:16px;font-family:'Segoe UI',sans-serif;font-size:14px;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,.4);z-index:999999;animation:ttvab-welcome .4s ease}
                    @keyframes ttvab-welcome{from{opacity:0;transform:translateY(-20px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
                    #ttvab-welcome-close{position:absolute;top:10px;right:12px;background:none;border:none;color:rgba(255,255,255,.7);font-size:20px;cursor:pointer;padding:0;line-height:1}
                    #ttvab-welcome-close:hover{color:#fff}
                    #ttvab-welcome h3{margin:0 0 8px;font-size:18px}
                    #ttvab-welcome p{margin:0 0 12px;opacity:.9;line-height:1.4}
                    #ttvab-welcome .pin-tip{background:rgba(255,255,255,.15);padding:10px 12px;border-radius:8px;font-size:13px}
                    #ttvab-welcome .pin-tip strong{color:#fff}
                </style>
                <button id="ttvab-welcome-close">×</button>
                <h3>🎉 TTV AB Installed!</h3>
                <p>Ads will now be blocked automatically on Twitch streams.</p>
                <div class="pin-tip">
                    <strong>💡 Tip:</strong> Pin this extension for easy access!<br>
                    Click 🧩 → Find TTV AB → Click 📌
                </div>
            `;

			document.body.appendChild(toast);
			_setUiStorageItem(_$fr, "true");

			const closeHandler = () => {
				toast.style.animation = "ttvab-welcome .3s ease reverse";
				setTimeout(() => toast.remove(), 300);
			};

			const welcomeClose = toast.querySelector("#ttvab-welcome-close");
			if (welcomeClose) {
				welcomeClose.onclick = closeHandler;
			}

			setTimeout(() => {
				if (toast.isConnected) closeHandler();
			}, 10000);
		}, 2000);
	} catch (e) {
		_$l(`Welcome message error: ${e.message}`, "error");
	}
}

const _$ai = {
	first_block: { name: "Ad Slayer", icon: "⚔️", desc: "Blocked your first ad!" },
	block_10: { name: "Blocker", icon: "🛡️", desc: "Blocked 10 ads!" },
	block_100: { name: "Guardian", icon: "🔰", desc: "Blocked 100 ads!" },
	block_500: { name: "Sentinel", icon: "🏰", desc: "Blocked 500 ads!" },
	block_1000: { name: "Legend", icon: "🏆", desc: "Blocked 1000 ads!" },
	block_5000: { name: "Mythic", icon: "👑", desc: "Blocked 5000 ads!" },
	popup_10: { name: "DOM Cleaner", icon: "💥", desc: "Blocked 10 DOM ads!" },
	popup_50: { name: "DOM Sweeper", icon: "🔥", desc: "Blocked 50 DOM ads!" },
	time_1h: { name: "Hour Saver", icon: "⏱️", desc: "Saved 1 hour from ads!" },
	time_10h: {
		name: "Time Master",
		icon: "⏰",
		desc: "Saved 10 hours from ads!",
	},
	channels_5: {
		name: "Explorer",
		icon: "📺",
		desc: "Blocked ads on 5 channels!",
	},
	channels_20: {
		name: "Adventurer",
		icon: "🌍",
		desc: "Blocked ads on 20 channels!",
	},
};

function _ensureAchievementToastStyles() {
	if (document.getElementById("ttvab-achievement-style")) return;
	const style = document.createElement("style");
	style.id = "ttvab-achievement-style";
	style.textContent =
		"#ttvab-achievement{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:#fff;padding:16px 24px;border-radius:16px;font-family:'Segoe UI',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5),0 0 20px rgba(145,70,255,.3);z-index:9999999;animation:ttvab-ach-pop .5s cubic-bezier(0.34,1.56,0.64,1);border:2px solid rgba(145,70,255,.5);display:flex;align-items:center;gap:16px}" +
		"@keyframes ttvab-ach-pop{from{opacity:0;transform:translateX(-50%) scale(.5) translateY(-20px)}to{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}}" +
		"@keyframes ttvab-ach-shine{0%{background-position:-200% center}100%{background-position:200% center}}" +
		"#ttvab-achievement .ach-icon{font-size:40px;animation:ttvab-ach-bounce 1s ease infinite}" +
		"@keyframes ttvab-ach-bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}" +
		"#ttvab-achievement .ach-content{display:flex;flex-direction:column;gap:2px}" +
		"#ttvab-achievement .ach-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#9146FF;font-weight:600}" +
		"#ttvab-achievement .ach-name{font-size:18px;font-weight:700;background:linear-gradient(90deg,#fff 0%,#9146FF 50%,#fff 100%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:ttvab-ach-shine 2s linear infinite}" +
		"#ttvab-achievement .ach-desc{font-size:12px;color:#aaa;margin-top:2px}";
	document.head?.appendChild(style);
}

function _getTrustedUiMessage(event) {
	if (
		event.source !== window ||
		event.origin !== window.location.origin ||
		!event.data ||
		typeof event.data !== "object" ||
		Array.isArray(event.data) ||
		typeof event.data.type !== "string"
	) {
		return null;
	}
	return event.data;
}

function _$au(achievementId) {
	try {
		const ach = _$ai[achievementId];
		if (!ach) return;

		if (!document.body) return;
		_ensureAchievementToastStyles();
		const existing = document.getElementById("ttvab-achievement");
		if (existing) existing.remove();

		const toast = document.createElement("div");
		toast.id = "ttvab-achievement";
		const icon = document.createElement("div");
		icon.className = "ach-icon";
		icon.textContent = String(ach.icon ?? "");

		const content = document.createElement("div");
		content.className = "ach-content";

		const label = document.createElement("div");
		label.className = "ach-label";
		label.textContent = "Achievement Unlocked!";

		const name = document.createElement("div");
		name.className = "ach-name";
		name.textContent = String(ach.name ?? "");

		const desc = document.createElement("div");
		desc.className = "ach-desc";
		desc.textContent = String(ach.desc ?? "");

		content.append(label, name, desc);
		toast.append(icon, content);

		document.body.appendChild(toast);
		_$l(`Achievement unlocked: ${ach.name}`, "success");

		setTimeout(() => {
			if (toast.isConnected) {
				toast.style.animation = "ttvab-ach-pop .5s ease reverse";
				setTimeout(() => toast.remove(), 500);
			}
		}, 5000);
	} catch (e) {
		_$l(`Achievement error: ${e.message}`, "error");
	}
}

function _$al() {
	const uiFlags = _getUiFlags();
	if (uiFlags.achievementListenerInitialized) return;
	uiFlags.achievementListenerInitialized = true;
	window.addEventListener("message", (e) => {
		const message = _getTrustedUiMessage(e);
		if (!message || message.type !== "ttvab-achievement-unlocked") return;
		const detail =
			message.detail &&
			typeof message.detail === "object" &&
			!Array.isArray(message.detail)
				? message.detail
				: null;
		if (typeof detail?.id !== "string") return;
		_$au(detail.id);
	});
}

function _$bs() {
	if (
		typeof window.ttvabVersion !== "undefined" &&
		window.ttvabVersion >= _$c.INTERNAL_VERSION
	) {
		_$l("Skipping - another script is active", "warning");
		return false;
	}

	window.ttvabVersion = _$c.INTERNAL_VERSION;
	_$l(`v${_$c.VERSION} loaded`, "info");
	return true;
}

function _normalizeCounterValue(value) {
	const numericValue =
		typeof value === "string" && value.trim() !== "" ? Number(value) : value;
	return Number.isFinite(numericValue)
		? Math.max(0, Math.trunc(numericValue))
		: 0;
}

function _getTrustedBridgeMessageData(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value;
}

function _getTrustedBridgeMessageDetail(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value;
}

function _isTrustedWindowMessageSource(source) {
	if (!source) return false;
	if (source === window) return true;
	try {
		if (typeof window.wrappedJSObject !== "undefined") {
			return source === window.wrappedJSObject;
		}
	} catch {}
	return false;
}

function _$tl() {
	window.addEventListener("message", (e) => {
		if (!_isTrustedWindowMessageSource(e.source)) return;
		const message = _getTrustedBridgeMessageData(e.data);
		const detail = _getTrustedBridgeMessageDetail(message?.detail);
		if (
			message?.type !== "ttvab-toggle" ||
			typeof detail?.enabled !== "boolean"
		) {
			return;
		}
		const enabled = detail.enabled;
		if (__TTVAB_STATE__.IsAdStrippingEnabled === enabled) return;
		__TTVAB_STATE__.IsAdStrippingEnabled = enabled;
		_$bw({ key: "UpdateToggleState", value: enabled });
		_$l(
			`Ad blocking ${enabled ? "enabled" : "disabled"}`,
			enabled ? "success" : "warning",
		);
	});
}

function _$bp() {
	let lastBlockTime = 0;
	let isDisplayAdShellActive = false;
	let isPromotedPageAdActive = false;
	let didCountCurrentDisplayAdShellCleanup = false;
	let didCountCurrentDisplayAdShellAd = false;
	let pendingDisplayAdShellSince = 0;
	let pendingDisplayAdShellSignature = null;
	let lastStaleDisplayArtifactSignature = null;
	let lastStaleDisplayArtifactCleanupAt = 0;
	let lastRouteUrl = window.location.href;
	let activeDirectPlayerAdMediaSignature = null;
	let didCountCurrentDirectPlayerAdMedia = false;
	let lastPlaybackContextChangeAt = 0;
	let pendingRoutePlayerResyncTimer = null;
	let scheduledScanTimer = null;
	let scheduledScanForce = false;
	let lastScanAt = 0;
	let cachedMainPlayerElement;
	let cachedMainPlayerRect;
	let cachedPlayerOverlayRoots;
	const PLAYER_SURFACE_AD_MARKER_SELECTOR =
		'[data-ttvab-player-ad-banner="true"]';
	const DISPLAY_AD_LABEL_SELECTORS = [
		'[data-a-target="video-ad-label"]',
		'[data-test-selector="ad-label"]',
		'[class*="ad-countdown"]',
		'[aria-label="Ad"]',
	];
	const LOWER_THIRD_DISPLAY_AD_SELECTORS = [
		'iframe[data-test-selector^="sda-iframe-"]',
		'iframe[title="Stream Display Ad"]',
		'iframe[class*="stream-display-ad__iframe_lower-third"]',
		'[data-test-selector="sda-frame"]',
		"#stream-lowerthird",
		'[class*="stream-display-ad__frame_lower-third"]',
	];
	const EXPLICIT_DISPLAY_AD_SELECTORS = [
		'[data-test-selector="ad-banner"]',
		'[data-test-selector="display-ad"]',
		'[data-a-target="ads-banner"]',
		...LOWER_THIRD_DISPLAY_AD_SELECTORS,
		PLAYER_SURFACE_AD_MARKER_SELECTOR,
	];
	const DISPLAY_AD_SHELL_SELECTORS = [
		".stream-display-ad",
		'[class*="stream-display-ad"]',
	];
	const PIP_SELECTORS = [
		'[data-a-target="video-player-pip-container"]',
		'[data-a-target="video-player-mini-player"]',
		".video-player__pip-container",
		".video-player__mini-player",
		".mini-player",
		'[class*="mini-player"]',
		'[class*="pip-container"]',
	];
	const STREAM_DISPLAY_LAYOUT_SELECTORS = [
		".video-player--stream-display-ad",
		'[class*="video-player--stream-display-ad"]',
	];
	const OFFLINE_PAGE_SIGNAL_SELECTORS = [
		'[data-a-target="stream-offline-status"]',
		'[data-test-selector*="offline"]',
		'[class*="offline-status"]',
		'[class*="offline-page"]',
	];
	const PROMOTED_PAGE_CTA_PATTERN =
		/^(learn more|shop(?: now| on amazon)?|watch now|play now|install|download|get offer|see more)$/i;
	const PLAYER_AD_CTA_PATTERN =
		/^(learn more|shop(?: now| on amazon)?|watch now|play now|get offer|see more|see details|install|download)$/i;
	const PLAYER_AD_OVERLAY_TEXT_PATTERN =
		/\bright after this ad break\b|\bstick around to support the channel\b/i;
	const DIRECT_PLAYER_AD_MEDIA_URL_PATTERN =
		/^https:\/\/m\.media-amazon\.com\/.*\.mp4(?:$|\?)/i;
	const DISPLAY_AD_FEEDBACK_BUTTON_PATTERN = /\bleave feedback\b.*\bad\b/i;
	const MUTATION_NOISE_SELECTORS = [
		'[data-a-target="chat-scroller"]',
		'[data-a-target="right-column-chat-bar"]',
		'[data-test-selector="chat-room-component"]',
		'[class*="chat-room"]',
		'[class*="chat-shell"]',
		'[class*="right-column"]',
		'[class*="RightColumn"]',
		'[class*="ChatShell"]',
		'[class*="ChatRoom"]',
	];
	const RELEVANT_MUTATION_SELECTOR = [
		"video",
		"audio",
		"iframe",
		'[data-test-selector*="ad"]',
		'[data-a-target*="ad"]',
		'[class*="display-ad"]',
		'[class*="stream-display-ad"]',
		'[class*="video-player"]',
		'[class*="VideoPlayer"]',
		'[data-a-target="video-player"]',
	].join(", ");

	function _$ipb() {
		if (!document.body) {
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", _$ipb, {
					once: true,
				});
			} else {
				setTimeout(_$ipb, 50);
			}
			return;
		}

		if (!document.getElementById("ttvab-popup-style")) {
			const styleMount = document.head || document.documentElement;
			if (!styleMount) {
				setTimeout(_$ipb, 50);
				return;
			}
			const style = document.createElement("style");
			style.id = "ttvab-popup-style";
			style.textContent = `
                [data-test-selector="ad-banner"],
                [data-test-selector="display-ad"],
                [data-a-target="ads-banner"],
                [data-a-target="consent-banner"],
                ${LOWER_THIRD_DISPLAY_AD_SELECTORS.join(",\n                ")},
                ${PLAYER_SURFACE_AD_MARKER_SELECTOR} {
                    display: none !important;
                    visibility: hidden !important;
                }
            `;
			styleMount.appendChild(style);
		}

		function _incrementDomCleanup(kind) {
			const now = Date.now();
			if (now - lastBlockTime < 1000) return;
			lastBlockTime = now;

			const channel = _getCurrentChannelName();
			_incrementDomAdsBlocked(kind, channel);
			_$l(`DOM ad cleanup (${kind}) total: ${_$s.domAdsBlocked}`, "success");
		}

		function _getCurrentChannelName() {
			return _getPlaybackContextFromUrl(window.location.href).ChannelName;
		}

		function _hideElement(el) {
			if (!el) return;
			el.style.setProperty("display", "none", "important");
			el.style.setProperty("visibility", "hidden", "important");
			el.setAttribute("data-ttvab-blocked", "true");
		}

		function _resetStreamDisplayLayout(el) {
			if (!el) return;

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

			el.style.setProperty("padding", "0", "important");
			el.style.setProperty("margin", "0", "important");
			el.style.setProperty("background", "transparent", "important");
			el.style.setProperty("background-color", "transparent", "important");
			el.style.setProperty("width", "100%", "important");
			el.style.setProperty("height", "100%", "important");
			el.style.setProperty("max-width", "100%", "important");
			el.style.setProperty("max-height", "100%", "important");
			el.style.setProperty("inset", "0", "important");
			el.setAttribute("data-ttvab-display-shell-reset", "true");
		}

		function _restoreStreamDisplayLayout(el) {
			if (!el) return;

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

			[
				"display",
				"visibility",
				"padding",
				"margin",
				"background",
				"background-color",
				"width",
				"height",
				"max-width",
				"max-height",
				"inset",
				"left",
				"right",
				"top",
				"bottom",
				"grid-template-columns",
				"grid-template-areas",
				"grid-auto-columns",
				"grid-auto-flow",
				"column-gap",
				"gap",
				"justify-content",
				"align-items",
				"flex",
				"flex-basis",
			].forEach((property) => {
				el.style.removeProperty(property);
			});

			el.removeAttribute("data-ttvab-display-shell-reset");
			el.removeAttribute("data-ttvab-blocked");
		}

		function _resetStaleDisplayArtifactCleanupDeduper() {
			lastStaleDisplayArtifactSignature = null;
			lastStaleDisplayArtifactCleanupAt = 0;
		}

		function _isDisplayAdShellArtifact(el) {
			if (!el) return false;
			if (
				el.hasAttribute?.("data-ttvab-blocked") ||
				el.hasAttribute?.("data-ttvab-display-shell-reset")
			) {
				return true;
			}

			if (
				typeof el.className !== "string" ||
				!el.className.includes("stream-display-ad")
			) {
				return false;
			}

			const hasMedia = Boolean(el.querySelector?.("video, audio"));
			if (hasMedia) return false;

			const rect = el.getBoundingClientRect();
			const style = window.getComputedStyle(el);
			const looksCollapsedArtifact =
				rect.width <= 1 ||
				rect.height <= 1 ||
				style.display === "none" ||
				style.visibility === "hidden" ||
				style.opacity === "0";

			return looksCollapsedArtifact;
		}

		function _getDisplayAdArtifactSignature(el) {
			if (!el) return "";
			const className =
				typeof el.className === "string"
					? el.className.split(/\s+/).filter(Boolean).sort().join(".")
					: "";
			return [
				el.tagName || "",
				el.id || "",
				el.getAttribute?.("data-a-target") || "",
				el.getAttribute?.("data-test-selector") || "",
				className,
				el.hasAttribute?.("data-ttvab-blocked") ? "blocked" : "",
				el.hasAttribute?.("data-ttvab-display-shell-reset") ? "reset" : "",
			].join(":");
		}

		function _cleanupStaleDisplayAdShell(
			displayShellNodes,
			pipContainers,
			layoutRoots,
			inferredLayoutWrappers = [],
		) {
			const staleNodes = [
				...displayShellNodes,
				...layoutRoots,
				...inferredLayoutWrappers,
				...Array.from(
					document.querySelectorAll(PLAYER_SURFACE_AD_MARKER_SELECTOR),
				),
				...Array.from(
					document.querySelectorAll('[data-ttvab-display-shell-reset="true"]'),
				),
			]
				.filter((el, index, list) => el && list.indexOf(el) === index)
				.filter(_isDisplayAdShellArtifact);
			const stalePipContainers = pipContainers
				.filter((el, index, list) => el && list.indexOf(el) === index)
				.filter(
					(el) =>
						el.hasAttribute?.("data-ttvab-blocked") ||
						el.hasAttribute?.("data-ttvab-display-shell-reset"),
				);

			if (staleNodes.length === 0 && stalePipContainers.length === 0) {
				_resetStaleDisplayArtifactCleanupDeduper();
				return false;
			}

			const staleSignature = [...staleNodes, ...stalePipContainers]
				.map(_getDisplayAdArtifactSignature)
				.sort()
				.join("|");
			const now = Date.now();
			if (
				staleSignature &&
				staleSignature === lastStaleDisplayArtifactSignature &&
				now - lastStaleDisplayArtifactCleanupAt < 1000
			) {
				return false;
			}
			lastStaleDisplayArtifactSignature = staleSignature;
			lastStaleDisplayArtifactCleanupAt = now;

			_$l(
				"Display ad shell stale: cleaning up residual shell/layout artifacts",
				"info",
			);

			staleNodes.forEach((el) => {
				if (
					el.querySelector?.("video") ||
					el.matches?.('[data-a-target="video-player"]') ||
					el.matches?.('[class*="video-player"]')
				) {
					_restoreStreamDisplayLayout(el);
					return;
				}

				el.style.removeProperty("display");
				el.style.removeProperty("visibility");
				if (
					el.hasAttribute("data-ttvab-blocked") ||
					el.hasAttribute("data-ttvab-display-shell-reset")
				) {
					el.remove();
				}
			});

			stalePipContainers.forEach((el) => {
				if (el.querySelector?.("video")) {
					_restoreStreamDisplayLayout(el);
					return;
				}

				el.style.removeProperty("display");
				el.style.removeProperty("visibility");
				if (el.hasAttribute("data-ttvab-blocked")) {
					el.remove();
				}
			});

			return true;
		}

		function _resetDisplayAdShellState() {
			isDisplayAdShellActive = false;
			isPromotedPageAdActive = false;
			pendingDisplayAdShellSince = 0;
			pendingDisplayAdShellSignature = null;
			_resetDirectPlayerAdMediaState();
		}

		function _resetDirectPlayerAdMediaState() {
			activeDirectPlayerAdMediaSignature = null;
			didCountCurrentDirectPlayerAdMedia = false;
		}

		function _queryUniqueElements(selectors) {
			return selectors
				.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
				.filter((el, index, list) => el && list.indexOf(el) === index);
		}

		function _resetPlayerDetectionCaches() {
			cachedMainPlayerElement = undefined;
			cachedMainPlayerRect = undefined;
			cachedPlayerOverlayRoots = undefined;
		}

		function _pushUniqueElement(list, el) {
			if (!el || list.includes(el)) return;
			list.push(el);
		}

		function _queryWithinRoots(roots, selector) {
			const matches = [];
			const seen = new Set();
			for (const root of roots) {
				if (!(root instanceof Element)) continue;
				try {
					if (root.matches?.(selector) && !seen.has(root)) {
						seen.add(root);
						matches.push(root);
					}
				} catch {}
				try {
					for (const node of root.querySelectorAll(selector)) {
						if (!seen.has(node)) {
							seen.add(node);
							matches.push(node);
						}
					}
				} catch {}
			}
			return matches;
		}

		function _getPlayerOverlaySearchRoots() {
			if (cachedPlayerOverlayRoots !== undefined) {
				return cachedPlayerOverlayRoots;
			}

			const player = _getMainPlayerElement();
			const playerRect = _getMainPlayerRect();
			if (!(player instanceof Element) || !playerRect) {
				cachedPlayerOverlayRoots = [];
				return cachedPlayerOverlayRoots;
			}

			const roots = [];
			let current =
				player.closest?.('[data-a-target="video-player"]') ||
				player.parentElement ||
				player;
			const maxWidth = Math.min(
				window.innerWidth * 0.9,
				playerRect.width + 520,
			);
			const maxHeight = Math.min(
				window.innerHeight * 0.9,
				playerRect.height + 380,
			);

			for (let depth = 0; depth < 5 && current; depth += 1) {
				const rect = current.getBoundingClientRect();
				const overlapsPlayer =
					_getRectOverlap(
						rect.left,
						rect.right,
						playerRect.left,
						playerRect.right,
					) > 0 &&
					_getRectOverlap(
						rect.top,
						rect.bottom,
						playerRect.top,
						playerRect.bottom,
					) > 0;

				if (overlapsPlayer && rect.width > 0 && rect.height > 0) {
					_pushUniqueElement(roots, current);
				}

				if (
					rect.width > maxWidth ||
					rect.height > maxHeight ||
					(depth > 0 && _isSafeElement(current))
				) {
					break;
				}

				current = current.parentElement;
			}

			if (roots.length === 0) {
				_pushUniqueElement(roots, player);
			}

			cachedPlayerOverlayRoots = roots;
			return cachedPlayerOverlayRoots;
		}

		function _cleanupAllKnownDisplayArtifacts() {
			const displayShellNodes = _queryUniqueElements(
				DISPLAY_AD_SHELL_SELECTORS,
			);
			const pipContainers = _queryUniqueElements(PIP_SELECTORS);
			const layoutRoots = _queryUniqueElements(STREAM_DISPLAY_LAYOUT_SELECTORS);
			const explicitDisplayNodes = _queryUniqueElements(
				EXPLICIT_DISPLAY_AD_SELECTORS,
			);
			_cleanupStaleDisplayAdShell(
				displayShellNodes,
				pipContainers,
				layoutRoots,
			);

			explicitDisplayNodes.forEach((el) => {
				el.style.removeProperty("display");
				el.style.removeProperty("visibility");
				if (el.hasAttribute("data-ttvab-blocked")) {
					el.remove();
				}
			});
		}

		function _clearPendingRoutePlayerResync() {
			if (!pendingRoutePlayerResyncTimer) return;
			clearTimeout(pendingRoutePlayerResyncTimer);
			pendingRoutePlayerResyncTimer = null;
		}

		function _scheduleRoutePlayerResync(previousContext, currentContext) {
			const previousMediaKey = _normalizeMediaKey(previousContext?.MediaKey);
			const currentMediaKey = _normalizeMediaKey(currentContext?.MediaKey);
			if (
				!previousMediaKey ||
				!currentMediaKey ||
				previousMediaKey === currentMediaKey
			) {
				_clearPendingRoutePlayerResync();
				return;
			}

			_clearPendingRoutePlayerResync();

			let attempts = 0;
			const tryResync = () => {
				attempts += 1;

				const playerState =
					typeof _$gps === "function"
						? _$gps()
						: { player: null, state: null };
				const player = playerState?.player || null;
				const state = playerState?.state || null;
				const primaryMedia =
					typeof _getPrimaryMediaElement === "function"
						? _getPrimaryMediaElement()
						: null;
				const primarySrc = _getMediaSourceUrl(primaryMedia);
				const playerContentType =
					state?.props?.content?.type === "live" ||
					state?.props?.content?.type === "vod"
						? state.props.content.type
						: null;
				const hasPrimaryMedia = primaryMedia instanceof HTMLMediaElement;
				const shouldReload =
					DIRECT_PLAYER_AD_MEDIA_URL_PATTERN.test(primarySrc) ||
					(currentContext.MediaType &&
						playerContentType &&
						playerContentType !== currentContext.MediaType) ||
					(attempts >= 4 && player && !hasPrimaryMedia);

				if (shouldReload && typeof _$dpt === "function") {
					_$l(
						`Reloading player after route change (${previousMediaKey} -> ${currentMediaKey})`,
						"warning",
					);
					_$dpt(false, true, { reason: "route-change" });
					pendingRoutePlayerResyncTimer = null;
					return;
				}

				if (attempts >= 6) {
					pendingRoutePlayerResyncTimer = null;
					return;
				}

				pendingRoutePlayerResyncTimer = setTimeout(tryResync, 250);
			};

			pendingRoutePlayerResyncTimer = setTimeout(tryResync, 150);
		}

		function _handleRouteChange(force = false) {
			const routeUrl = window.location.href;
			const shouldForce = force === true;
			if (!shouldForce && routeUrl === lastRouteUrl) return false;
			lastRouteUrl = routeUrl;
			_resetPlayerDetectionCaches();
			const previousContext = _normalizePlaybackContext({
				MediaType: __TTVAB_STATE__.PageMediaType,
				ChannelName: __TTVAB_STATE__.PageChannel,
				VodID: __TTVAB_STATE__.PageVodID,
				MediaKey: __TTVAB_STATE__.PageMediaKey,
			});
			const currentContext = _syncPagePlaybackContext();
			const didMediaKeyChange =
				previousContext.MediaKey !== currentContext.MediaKey;
			if (didMediaKeyChange) {
				lastPlaybackContextChangeAt = Date.now();
				if (typeof _resetPlaybackIntentForNavigation === "function") {
					_resetPlaybackIntentForNavigation(
						currentContext.ChannelName,
						currentContext.MediaKey,
						3000,
					);
				}
				_resetDirectPlayerAdMediaState();
				_scheduleRoutePlayerResync(previousContext, currentContext);
			}
			_resetDisplayAdShellState();
			_resetStaleDisplayArtifactCleanupDeduper();

			const hasExplicitAdSignals = _queryUniqueElements([
				...EXPLICIT_DISPLAY_AD_SELECTORS,
				...DISPLAY_AD_SHELL_SELECTORS,
			]).some((el) => _isVisibleElement(el));
			if (!hasExplicitAdSignals) {
				didCountCurrentDisplayAdShellCleanup = false;
				didCountCurrentDisplayAdShellAd = false;
			}

			_cleanupAllKnownDisplayArtifacts();
			_$sr();
			return true;
		}

		function _pushUniqueDisplayAdLabel(labels, seen, el) {
			if (!el || seen.has(el)) return;
			labels.push(el);
			seen.add(el);
		}

		function _isDisplayAdFeedbackButton(el) {
			const ariaLabel = String(el?.getAttribute?.("aria-label") || "")
				.replace(/\s+/g, " ")
				.trim();
			return DISPLAY_AD_FEEDBACK_BUTTON_PATTERN.test(ariaLabel);
		}

		function _getDisplayAdLabelTarget(node, rootRect = null) {
			if (!node) return null;
			let target =
				node.closest?.('button[aria-label], [role="button"][aria-label]') ||
				node;
			if (
				target !== node &&
				(!_isDisplayAdFeedbackButton(target) || !_isVisibleElement(target))
			) {
				target = node;
			}

			for (let depth = 0; depth < 4 && target; depth += 1) {
				const parent = target.parentElement;
				if (!parent || _isSafeElement(parent) || !_isVisibleElement(parent)) {
					break;
				}
				const rect = parent.getBoundingClientRect();
				const isCompactPlayerOverlay =
					rect.width > 0 &&
					rect.height > 0 &&
					rect.width <= 280 &&
					rect.height <= 80 &&
					(rootRect
						? rect.top < rootRect.top + 160 &&
							rect.right > rootRect.right - 320 &&
							rect.left > rootRect.left - 40 &&
							rect.bottom > rootRect.top - 20
						: _isNearMainPlayer(parent));
				if (!isCompactPlayerOverlay) break;
				target = parent;
			}

			return target;
		}

		function _getDisplayAdLabels() {
			const labels = [];
			const seen = new Set();
			const playerRect = _getMainPlayerRect();
			const searchRoots = _getPlayerOverlaySearchRoots();
			if (!playerRect || searchRoots.length === 0) {
				return labels;
			}

			const directLabels = _queryWithinRoots(
				searchRoots,
				DISPLAY_AD_LABEL_SELECTORS.join(", "),
			);
			for (const directLabel of directLabels) {
				const text =
					directLabel.getAttribute?.("aria-label") ||
					directLabel.textContent ||
					"";
				if (
					!_isVisibleElement(directLabel) ||
					!_isNearMainPlayer(directLabel, playerRect) ||
					!_looksLikeAdLabel(text)
				) {
					continue;
				}
				_pushUniqueDisplayAdLabel(
					labels,
					seen,
					_getDisplayAdLabelTarget(directLabel),
				);
			}

			const playerRoots = _queryWithinRoots(
				searchRoots,
				'[data-a-target="video-player"], [class*="video-player"], video',
			);

			for (const root of playerRoots) {
				if (!_isVisibleElement(root)) continue;
				const nodes = root.querySelectorAll(
					'span, p, [aria-label="Ad"], button[aria-label], [role="button"][aria-label]',
				);
				const rootRect = root.getBoundingClientRect();
				if (rootRect.width < 320 || rootRect.height < 180) continue;
				for (const node of nodes) {
					const text =
						node.getAttribute?.("aria-label") || node.textContent || "";
					if (
						!text ||
						text.length > 48 ||
						(!_looksLikeAdLabel(text) && !_isDisplayAdFeedbackButton(node))
					) {
						continue;
					}
					if (!_isVisibleElement(node)) continue;
					const rect = node.getBoundingClientRect();
					if (
						rect.width > 0 &&
						rect.height > 0 &&
						rect.top < rootRect.top + 140 &&
						rect.right > rootRect.right - 260
					) {
						_pushUniqueDisplayAdLabel(
							labels,
							seen,
							_getDisplayAdLabelTarget(node, rootRect),
						);
					}
				}
			}

			return labels;
		}

		function _isVisibleElement(el) {
			if (!el) return false;
			const rect = el.getBoundingClientRect();
			const style = window.getComputedStyle(el);
			return (
				rect.width > 0 &&
				rect.height > 0 &&
				style.display !== "none" &&
				style.visibility !== "hidden"
			);
		}

		function _getMainPlayerElement() {
			if (cachedMainPlayerElement !== undefined) {
				return cachedMainPlayerElement;
			}

			const candidates = document.querySelectorAll(
				'video, [data-a-target="video-player"]',
			);
			let bestElement = null;
			let bestArea = 0;

			for (const candidate of candidates) {
				if (!_isVisibleElement(candidate)) continue;
				const rect = candidate.getBoundingClientRect();
				const area = rect.width * rect.height;
				if (rect.width < 320 || rect.height < 180) continue;
				if (area > bestArea) {
					bestArea = area;
					bestElement = candidate;
				}
			}

			cachedMainPlayerElement = bestElement;
			return cachedMainPlayerElement;
		}

		function _getMainPlayerRect() {
			if (cachedMainPlayerRect !== undefined) {
				return cachedMainPlayerRect;
			}

			const player = _getMainPlayerElement();
			cachedMainPlayerRect = player ? player.getBoundingClientRect() : null;
			return cachedMainPlayerRect;
		}

		function _getMediaSourceUrl(media) {
			return String(media?.currentSrc || media?.src || "").trim();
		}

		function _getRectOverlap(startA, endA, startB, endB) {
			return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
		}

		function _isLikelyPlayerOverlayRect(
			rect,
			playerRect,
			{ allowTopBand = false } = {},
		) {
			if (!rect || !playerRect) return false;
			if (rect.width < (allowTopBand ? 140 : 80) || rect.height < 24) {
				return false;
			}
			if (rect.width > Math.max(playerRect.width * 1.08, 960)) return false;
			if (rect.height > Math.max(220, playerRect.height * 0.45)) return false;

			const horizontalOverlap = _getRectOverlap(
				rect.left,
				rect.right,
				playerRect.left,
				playerRect.right,
			);
			if (horizontalOverlap < Math.min(rect.width, playerRect.width) * 0.35) {
				return false;
			}

			const verticalOverlap = _getRectOverlap(
				rect.top,
				rect.bottom,
				playerRect.top,
				playerRect.bottom,
			);
			if (verticalOverlap <= 0) return false;

			if (allowTopBand) {
				return (
					rect.top < playerRect.top + Math.max(160, playerRect.height * 0.28) &&
					rect.bottom < playerRect.top + Math.max(220, playerRect.height * 0.42)
				);
			}

			return rect.bottom > playerRect.top + playerRect.height * 0.45;
		}

		function _markPlayerAdBannerContainer(seed, options = {}) {
			if (!seed) return null;
			const playerRect = _getMainPlayerRect();
			if (!playerRect) return null;

			let current = seed;
			for (let depth = 0; depth < 6 && current; depth += 1) {
				if (_isVisibleElement(current)) {
					const rect = current.getBoundingClientRect();
					if (_isLikelyPlayerOverlayRect(rect, playerRect, options)) {
						current.setAttribute("data-ttvab-player-ad-banner", "true");
						return current;
					}
				}

				if (depth > 0 && _isSafeElement(current)) break;
				current = current.parentElement;
			}

			return null;
		}

		function _getPlayerAdCallToActionNodes() {
			const nodes = [];
			const playerRect = _getMainPlayerRect();
			if (!playerRect) return nodes;

			const ctas = _queryWithinRoots(
				_getPlayerOverlaySearchRoots(),
				"a, button, [role='button']",
			);

			for (const cta of ctas) {
				if (!_isVisibleElement(cta) || !_isNearMainPlayer(cta, playerRect)) {
					continue;
				}
				const text = [
					cta.textContent || "",
					cta.getAttribute("aria-label") || "",
					cta.getAttribute("title") || "",
				]
					.join(" ")
					.replace(/\s+/g, " ")
					.trim();
				if (!PLAYER_AD_CTA_PATTERN.test(text)) continue;

				const container = _markPlayerAdBannerContainer(cta);
				if (container) {
					nodes.push(container);
				}
			}

			return nodes.filter(
				(el, index, list) => el && list.indexOf(el) === index,
			);
		}

		function _getPlayerAdBannerTextNodes() {
			const nodes = [];
			const playerRect = _getMainPlayerRect();
			if (!playerRect) return nodes;

			const candidates = _queryWithinRoots(
				_getPlayerOverlaySearchRoots(),
				"span, p, div, h1, h2, h3, [role='heading']",
			);
			for (const node of candidates) {
				if (!_isVisibleElement(node) || !_isNearMainPlayer(node, playerRect)) {
					continue;
				}
				const text = (node.textContent || "").replace(/\s+/g, " ").trim();
				if (
					text.length < 24 ||
					text.length > 180 ||
					!PLAYER_AD_OVERLAY_TEXT_PATTERN.test(text)
				) {
					continue;
				}

				const container = _markPlayerAdBannerContainer(node, {
					allowTopBand: true,
				});
				if (container) {
					nodes.push(container);
					continue;
				}

				const rect = node.getBoundingClientRect();
				if (
					rect.width >= 220 &&
					rect.top < playerRect.top + Math.max(160, playerRect.height * 0.28) &&
					rect.bottom < playerRect.top + Math.max(220, playerRect.height * 0.42)
				) {
					node.setAttribute("data-ttvab-player-ad-banner", "true");
					nodes.push(node);
				}
			}

			return nodes.filter(
				(el, index, list) => el && list.indexOf(el) === index,
			);
		}

		function _getInferredDisplayAdLayoutWrappers() {
			const player = _getMainPlayerElement();
			const playerRect = player?.getBoundingClientRect();
			if (!player || !playerRect) return [];

			const wrappers = [];
			let current = player.parentElement;
			for (let depth = 0; depth < 6 && current; depth += 1) {
				if (_isSafeElement(current)) break;
				if (!_isVisibleElement(current)) {
					current = current.parentElement;
					continue;
				}

				const rect = current.getBoundingClientRect();
				const extraTop = Math.max(0, playerRect.top - rect.top);
				const extraLeft = Math.max(0, playerRect.left - rect.left);
				const extraRight = Math.max(0, rect.right - playerRect.right);
				const extraBottom = Math.max(0, rect.bottom - playerRect.bottom);
				const hasLargeInset =
					extraTop > 24 ||
					extraLeft > 24 ||
					extraRight > 72 ||
					extraBottom > 24;
				if (!hasLargeInset) {
					current = current.parentElement;
					continue;
				}

				if (
					rect.width > window.innerWidth * 0.92 ||
					rect.height > window.innerHeight * 0.92
				) {
					current = current.parentElement;
					continue;
				}

				const style = window.getComputedStyle(current);
				const hasBackground =
					style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
					style.backgroundColor !== "transparent";
				const hasStructuredLayout =
					style.display === "grid" ||
					style.display === "flex" ||
					style.position === "relative";
				if (!hasBackground && !hasStructuredLayout) {
					current = current.parentElement;
					continue;
				}

				wrappers.push(current);
				current = current.parentElement;
			}

			return wrappers.filter(
				(el, index, list) => el && list.indexOf(el) === index,
			);
		}

		function _isNearMainPlayer(el, playerRect = null) {
			if (!el || !_isVisibleElement(el)) return false;
			const resolvedPlayerRect = playerRect || _getMainPlayerRect();
			if (!resolvedPlayerRect) return false;

			const rect = el.getBoundingClientRect();
			const horizontalMargin = Math.max(
				120,
				Math.min(260, resolvedPlayerRect.width * 0.2),
			);
			const verticalMargin = Math.max(
				80,
				Math.min(180, resolvedPlayerRect.height * 0.2),
			);

			return !(
				rect.right < resolvedPlayerRect.left - horizontalMargin ||
				rect.left > resolvedPlayerRect.right + horizontalMargin ||
				rect.bottom < resolvedPlayerRect.top - verticalMargin ||
				rect.top > resolvedPlayerRect.bottom + verticalMargin
			);
		}

		function _hasDirectPlayerAdUiSignal() {
			const playerRect = _getMainPlayerRect();
			if (!playerRect) return false;

			const candidateNodes = [
				..._getDisplayAdLabels(),
				..._getPlayerAdCallToActionNodes(),
				..._getPlayerAdBannerTextNodes(),
				...DISPLAY_AD_SHELL_SELECTORS.flatMap((selector) =>
					Array.from(document.querySelectorAll(selector)),
				),
				...LOWER_THIRD_DISPLAY_AD_SELECTORS.flatMap((selector) =>
					Array.from(document.querySelectorAll(selector)),
				),
			];

			return candidateNodes.some(
				(el, index, list) =>
					el &&
					list.indexOf(el) === index &&
					_isVisibleElement(el) &&
					_isNearMainPlayer(el, playerRect),
			);
		}

		function _isDirectPlayerAdMedia(media, playerRect = null) {
			if (!(media instanceof HTMLMediaElement)) return false;
			if (!media.isConnected || media.ended) return false;

			const src = _getMediaSourceUrl(media);
			if (!DIRECT_PLAYER_AD_MEDIA_URL_PATTERN.test(src)) return false;

			return (
				_isVisibleElement(media) &&
				_isNearMainPlayer(media, playerRect || _getMainPlayerRect())
			);
		}

		function _suppressDirectPlayerAdMedia(media) {
			if (!_isDirectPlayerAdMedia(media)) return false;

			try {
				if (typeof _pausePlaybackTarget === "function") {
					_pausePlaybackTarget(media);
				} else {
					media.pause();
				}
				media.defaultMuted = true;
				media.muted = true;
				media.volume = 0;
				if (Number.isFinite(media.duration) && media.duration > 0) {
					media.currentTime = media.duration;
				}
			} catch {}

			_hideElement(media);
			media.setAttribute("data-ttvab-player-ad-media", "true");
			return true;
		}

		function _resumePlaybackAfterDirectPlayerAd() {
			const currentContext = _getPlaybackContextFromUrl(window.location.href);
			const primaryMedia =
				typeof _getPrimaryMediaElement === "function"
					? _getPrimaryMediaElement()
					: null;
			const playerState =
				typeof _$gps === "function"
					? _$gps()
					: { player: null };
			const player = playerState?.player || null;
			const shouldReloadPrimary =
				primaryMedia instanceof HTMLMediaElement &&
				DIRECT_PLAYER_AD_MEDIA_URL_PATTERN.test(
					_getMediaSourceUrl(primaryMedia),
				);
			const didRecentlyChangePlaybackContext =
				lastPlaybackContextChangeAt > 0 &&
				Date.now() - lastPlaybackContextChangeAt < 1500;

			if (shouldReloadPrimary && typeof _$dpt === "function") {
				setTimeout(
					() => {
						_$dpt(false, true, {
							reason: didRecentlyChangePlaybackContext
								? "route-change"
								: "ad-recovery",
						});
					},
					didRecentlyChangePlaybackContext ? 150 : 0,
				);
				return;
			}

			const resume = () => {
				if (typeof _playPlaybackTarget === "function") {
					_playPlaybackTarget(
						primaryMedia,
						currentContext.ChannelName,
						currentContext.MediaKey,
					);
					_playPlaybackTarget(
						player,
						currentContext.ChannelName,
						currentContext.MediaKey,
					);
					return;
				}
				try {
					primaryMedia?.play?.();
				} catch {}
				try {
					player?.play?.();
				} catch {}
			};

			setTimeout(resume, 0);
			setTimeout(resume, 120);
			setTimeout(resume, 350);
		}

		function _collapseDirectPlayerAdMedia() {
			const currentContext = _getPlaybackContextFromUrl(window.location.href);
			if (currentContext.MediaType !== "vod") {
				_resetDirectPlayerAdMediaState();
				return false;
			}

			if (!_hasDirectPlayerAdUiSignal()) {
				_resetDirectPlayerAdMediaState();
				return false;
			}

			const playerRect = _getMainPlayerRect();
			const adMediaNodes = Array.from(
				document.querySelectorAll("video, audio"),
			).filter((media) => _isDirectPlayerAdMedia(media, playerRect));
			if (adMediaNodes.length === 0) {
				_resetDirectPlayerAdMediaState();
				return false;
			}

			const signature = adMediaNodes
				.map((media) => _getMediaSourceUrl(media))
				.sort()
				.join("|");
			if (signature !== activeDirectPlayerAdMediaSignature) {
				activeDirectPlayerAdMediaSignature = signature;
				didCountCurrentDirectPlayerAdMedia = false;
			}

			const didSuppressAny = adMediaNodes.some(_suppressDirectPlayerAdMedia);
			if (!didSuppressAny) return false;

			if (!didCountCurrentDirectPlayerAdMedia) {
				didCountCurrentDirectPlayerAdMedia = true;
				if (
					!__TTVAB_STATE__.CurrentAdChannel &&
					!__TTVAB_STATE__.CurrentAdMediaKey
				) {
					_$ab(
						currentContext.ChannelName,
						currentContext.MediaKey,
					);
				}
				_incrementDomCleanup("direct-media-ad");
				_$l(
					"Direct Amazon MP4 ad detected on VOD, suppressing injected media",
					"warning",
				);
			}

			_resumePlaybackAfterDirectPlayerAd();
			return true;
		}

		function _looksLikeAdLabel(text) {
			const normalized = String(text || "")
				.replace(/\s+/g, " ")
				.trim()
				.toLowerCase();
			return (
				normalized === "ad" ||
				normalized === "ad 0" ||
				/^ad\s+[0-9:]+(?:\s+of\s+\d+)?$/.test(normalized) ||
				/^ad\s*ⓘ$/.test(normalized)
			);
		}

		function _hasOfflinePageSignal() {
			for (const selector of OFFLINE_PAGE_SIGNAL_SELECTORS) {
				const el = document.querySelector(selector);
				if (el && _isVisibleElement(el)) {
					return true;
				}
			}

			let checked = 0;
			const nodes = document.querySelectorAll("span, p, div");
			for (const node of nodes) {
				if (checked++ > 200) break;
				if (!_isVisibleElement(node)) continue;
				const text = (node.textContent || "").trim();
				if (!text || text.length > 12) continue;
				if (text.toUpperCase() !== "OFFLINE") continue;
				const rect = node.getBoundingClientRect();
				if (rect.top < window.innerHeight * 0.6) {
					return true;
				}
			}

			return false;
		}

		function _collapsePromotedPageAd() {
			if (!_hasOfflinePageSignal()) {
				isPromotedPageAdActive = false;
				return false;
			}

			const ctas = document.querySelectorAll("a, button");
			for (const cta of ctas) {
				if (!_isVisibleElement(cta)) continue;
				const text = (cta.textContent || "").replace(/\s+/g, " ").trim();
				if (!PROMOTED_PAGE_CTA_PATTERN.test(text)) continue;

				let card = cta;
				for (let depth = 0; depth < 6 && card; depth += 1) {
					card = card.parentElement;
					if (!card || _isSafeElement(card)) break;

					const rect = card.getBoundingClientRect();
					if (
						rect.width < 180 ||
						rect.height < 100 ||
						rect.width > window.innerWidth * 0.75 ||
						rect.height > window.innerHeight * 0.85
					) {
						continue;
					}

					const hasAdLabel = Array.from(
						card.querySelectorAll("span, p, div"),
					).some((node) => {
						if (!_isVisibleElement(node)) return false;
						return _looksLikeAdLabel(node.textContent || "");
					});

					if (!hasAdLabel) continue;

					if (!isPromotedPageAdActive) {
						isPromotedPageAdActive = true;
						if (
							!__TTVAB_STATE__.CurrentAdChannel &&
							!__TTVAB_STATE__.CurrentAdMediaKey
						) {
							const currentContext = _getPlaybackContextFromUrl(
								window.location.href,
							);
							_$ab(
								currentContext.ChannelName,
								currentContext.MediaKey,
							);
						}
						_$l("Offline/promoted page ad detected, hiding card", "warning");
					}

					_hideElement(card);
					_incrementDomCleanup("promoted-card");
					return true;
				}
			}

			isPromotedPageAdActive = false;
			return false;
		}

		function _collapseDisplayAdShell() {
			const adBanners = Array.from(
				document.querySelectorAll('[data-test-selector="ad-banner"]'),
			).filter((el) => _isVisibleElement(el) && _isNearMainPlayer(el));
			const playerAdCallToActionNodes = _getPlayerAdCallToActionNodes();
			const playerAdBannerTextNodes = _getPlayerAdBannerTextNodes();
			const explicitDisplayAdNodes = [
				...EXPLICIT_DISPLAY_AD_SELECTORS.flatMap((selector) =>
					Array.from(document.querySelectorAll(selector)),
				),
				...playerAdCallToActionNodes,
				...playerAdBannerTextNodes,
			].filter(
				(el, index, list) =>
					_isVisibleElement(el) &&
					_isNearMainPlayer(el) &&
					list.indexOf(el) === index,
			);
			const displayShellNodes = DISPLAY_AD_SHELL_SELECTORS.flatMap((selector) =>
				Array.from(document.querySelectorAll(selector)),
			).filter(
				(el, index, list) =>
					_isVisibleElement(el) &&
					_isNearMainPlayer(el) &&
					list.indexOf(el) === index,
			);
			const pipContainers = PIP_SELECTORS.flatMap((selector) =>
				Array.from(document.querySelectorAll(selector)),
			).filter(
				(el, index, list) =>
					_isVisibleElement(el) &&
					_isNearMainPlayer(el) &&
					list.indexOf(el) === index,
			);
			const layoutRoots = STREAM_DISPLAY_LAYOUT_SELECTORS.flatMap((selector) =>
				Array.from(document.querySelectorAll(selector)),
			).filter(
				(el, index, list) =>
					_isVisibleElement(el) &&
					_isNearMainPlayer(el) &&
					list.indexOf(el) === index,
			);
			const adLabels = _getDisplayAdLabels();
			const hasAdLabel = adLabels.length > 0;
			const hasDisplayAdCta = playerAdCallToActionNodes.length > 0;
			const hasOverlayBanner = playerAdBannerTextNodes.length > 0;
			const inferredLayoutWrappers = hasAdLabel
				? _getInferredDisplayAdLayoutWrappers()
				: [];
			const hasExplicitShellLayoutSignal =
				displayShellNodes.length > 0 ||
				pipContainers.length > 0 ||
				layoutRoots.length > 0;
			const hasInferredDisplayAdSignal =
				hasAdLabel &&
				(hasExplicitShellLayoutSignal || inferredLayoutWrappers.length > 0);
			const hasExplicitDisplayAdSignal =
				adBanners.length > 0 ||
				explicitDisplayAdNodes.length > 0 ||
				(hasDisplayAdCta && hasInferredDisplayAdSignal);
			const hasDisplayAdSignal =
				hasExplicitDisplayAdSignal || hasInferredDisplayAdSignal;

			adLabels.forEach((el) => {
				_hideElement(el);
			});

			if (!hasDisplayAdSignal) {
				_cleanupStaleDisplayAdShell(
					displayShellNodes,
					pipContainers,
					layoutRoots,
				);
				isDisplayAdShellActive = false;
				didCountCurrentDisplayAdShellCleanup = false;
				didCountCurrentDisplayAdShellAd = false;
				pendingDisplayAdShellSince = 0;
				pendingDisplayAdShellSignature = null;
				return false;
			}
			_resetStaleDisplayArtifactCleanupDeduper();

			const signalSignature = [
				adBanners.length,
				explicitDisplayAdNodes.length,
				displayShellNodes.length,
				pipContainers.length,
				layoutRoots.length,
				hasDisplayAdCta ? 1 : 0,
				hasOverlayBanner ? 1 : 0,
				hasExplicitDisplayAdSignal ? inferredLayoutWrappers.length : 0,
				hasInferredDisplayAdSignal ? 1 : 0,
				hasAdLabel ? 1 : 0,
			].join(":");
			const now = Date.now();

			if (!isDisplayAdShellActive) {
				if (pendingDisplayAdShellSignature !== signalSignature) {
					pendingDisplayAdShellSignature = signalSignature;
					pendingDisplayAdShellSince = now;
					return false;
				}

				if (now - pendingDisplayAdShellSince < 350) {
					return false;
				}
			}

			if (!isDisplayAdShellActive) {
				isDisplayAdShellActive = true;
				didCountCurrentDisplayAdShellCleanup = false;
				didCountCurrentDisplayAdShellAd = false;
				pendingDisplayAdShellSince = 0;
				pendingDisplayAdShellSignature = null;
				if (!hasExplicitDisplayAdSignal) {
					_incrementDomCleanup("display-shell-inferred");
					didCountCurrentDisplayAdShellCleanup = true;
					_$l(
						"Display ad shell inferred: counting DOM cleanup and resetting layout",
						"info",
					);
				}
			}

			if (hasExplicitDisplayAdSignal && !didCountCurrentDisplayAdShellCleanup) {
				_incrementDomCleanup("display-shell");
				didCountCurrentDisplayAdShellCleanup = true;
			}

			if (hasExplicitDisplayAdSignal && !didCountCurrentDisplayAdShellAd) {
				didCountCurrentDisplayAdShellAd = true;
				if (
					!__TTVAB_STATE__.CurrentAdChannel &&
					!__TTVAB_STATE__.CurrentAdMediaKey
				) {
					const currentContext = _getPlaybackContextFromUrl(
						window.location.href,
					);
					_$ab(
						currentContext.ChannelName,
						currentContext.MediaKey,
					);
				}
				_$l(
					"Display ad shell confirmed: counting blocked ad and collapsing shell",
					"warning",
				);
			}

			for (const shellNode of [
				...explicitDisplayAdNodes,
				...displayShellNodes,
			]) {
				if (shellNode.querySelector?.("video")) {
					_resetStreamDisplayLayout(shellNode);
				} else {
					_hideElement(shellNode);
				}
			}

			layoutRoots.forEach((el) => {
				_resetStreamDisplayLayout(el);
			});
			inferredLayoutWrappers.forEach((el) => {
				_resetStreamDisplayLayout(el);
			});
			pipContainers.forEach((el) => {
				_hideElement(el);
			});

			return true;
		}

		function _hasAdblockText(el) {
			const text = (el.textContent || "").toLowerCase();
			return (
				text.includes("allow twitch ads") ||
				text.includes("try turbo") ||
				text.includes("commercials") ||
				text.includes("whitelist") ||
				text.includes("ad blocker") ||
				(text.includes("support") &&
					(text.includes("ads") || text.includes("ad block"))) ||
				(text.includes("disable") &&
					(text.includes("extension") || text.includes("ad block"))) ||
				(text.includes("viewers watch ads") && text.includes("turbo"))
			);
		}

		const SAFELIST_SELECTORS = [
			'[data-a-target="chat-scroller"]',
			'[data-a-target="right-column-chat-bar"]',
			'[data-test-selector="chat-room-component"]',
			'[class*="chat-room"]',
			'[class*="chat-shell"]',
			'[class*="right-column"]',
			'[class*="RightColumn"]',
			'[class*="ChatShell"]',
			'[class*="ChatRoom"]',
			'[class*="video-player"]',
			'[class*="VideoPlayer"]',
			'[data-a-target="video-player"]',
			"video",
		];

		function _isSafeElement(el) {
			if (!el) return false;
			for (const selector of SAFELIST_SELECTORS) {
				try {
					if (el.matches?.(selector)) return true;
					if (el.querySelector?.(selector)) return true;
				} catch {}
			}
			return false;
		}

		function _$sr() {
			if (_collapseDirectPlayerAdMedia()) {
				return true;
			}

			if (_collapseDisplayAdShell()) {
				return true;
			}

			if (_collapsePromotedPageAd()) {
				return true;
			}

			const detectionNodes = document.querySelectorAll(
				'button, [role="button"], a, div[class*="Button"], h1, h2, h3, h4, div[class*="Header"], p, span',
			);

			for (const node of detectionNodes) {
				if (node.tagName === "SPAN" && (node.textContent || "").length < 10)
					continue;
				if (
					node.offsetParent === null ||
					node.hasAttribute("data-ttvab-blocked")
				)
					continue;
				if (
					_isSafeElement(node) ||
					node.closest('[class*="chat"]') ||
					node.closest('[class*="Chat"]')
				)
					continue;

				if (_hasAdblockText(node)) {
					node.setAttribute("data-ttvab-blocked", "true");

					let popup = node.parentElement;
					let attempts = 0;

					while (popup && attempts < 20) {
						if (_isSafeElement(popup)) break;

						const style = window.getComputedStyle(popup);
						const isOverlay =
							style.position === "fixed" || style.position === "absolute";
						const hasBackground =
							style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
							style.backgroundColor !== "transparent";
						const isLarge = popup.offsetWidth > 200 && popup.offsetHeight > 100;
						const zIndex = Number.parseInt(style.zIndex, 10);
						const hasZIndex = Number.isFinite(zIndex) && zIndex > 100;

						const className =
							popup.className && typeof popup.className === "string"
								? popup.className
								: "";
						const isPopupClass =
							(className.includes("ScAttach") &&
								className.includes("Balloon")) ||
							className.includes("Modal") ||
							className.includes("consent") ||
							className.includes("Consent") ||
							(className.includes("Overlay") &&
								!className.includes("Column") &&
								!className.includes("Chat")) ||
							(className.includes("Layer") && className.includes("Balloon"));

						if (
							(isOverlay || hasZIndex || isPopupClass) &&
							(hasBackground || isLarge)
						) {
							if (popup.querySelector("video")) {
								popup = popup.parentElement;
								attempts++;
								continue;
							}

							if (_isSafeElement(popup)) break;

							_$l(
								`Hiding popup: ${popup.className || popup.tagName}`,
								"success",
							);
							popup.setAttribute(
								"style",
								(popup.getAttribute("style") || "") +
									"; display: none !important; visibility: hidden !important;",
							);
							popup.setAttribute("data-ttvab-blocked", "true");

							_incrementDomCleanup("overlay-ad");
							return true;
						}

						popup = popup.parentElement;
						attempts++;
					}

					const fallback = node.closest(
						'div[class*="Balloon"], div[class*="consent"], div[class*="Modal"]',
					);
					if (fallback && !_isSafeElement(fallback)) {
						_$l("Hiding popup (fallback)", "warning");
						fallback.style.display = "none";
						fallback.setAttribute(
							"style",
							(fallback.getAttribute("style") || "") +
								"; display: none !important;",
						);
						fallback.setAttribute("data-ttvab-blocked", "true");
						_incrementDomCleanup("overlay-ad");
						return true;
					}
				}
			}

			const popupSelectors = [
				'div[class*="ScAttach"][class*="ScBalloon"]',
				'div[class*="tw-balloon"]',
				'div[class*="consent"]',
				'[data-a-target="consent-banner"]',
				'[data-test-selector="ad-banner"]',
				'div[class*="Layout"][class*="Overlay"]',
			];

			for (const selector of popupSelectors) {
				try {
					const elements = document.querySelectorAll(selector);
					for (const el of elements) {
						if (_hasAdblockText(el)) {
							_$l("Hiding popup by selector", "success");
							el.style.display = "none";
							el.setAttribute(
								"style",
								(el.getAttribute("style") || "") +
									"; display: none !important;",
							);
							_incrementDomCleanup("overlay-ad");
							return true;
						}
					}
				} catch {}
			}

			const overlays = document.querySelectorAll(
				'div[style*="position: fixed"], div[style*="position:fixed"], div[style*="z-index"]',
			);
			for (const el of overlays) {
				if (
					_hasAdblockText(el) &&
					el.offsetWidth > 200 &&
					el.offsetHeight > 100
				) {
					if (el.querySelector("video")) continue;

					_$l("Hiding popup overlay", "success");
					el.style.display = "none";
					el.setAttribute(
						"style",
						`${el.getAttribute("style") || ""}; display: none !important;`,
					);
					_incrementDomCleanup("overlay-ad");
					return true;
				}
			}

			return false;
		}

		function _isDocumentHidden() {
			const nativeVisibility = window.__TTVAB_NATIVE_VISIBILITY__;
			try {
				if (typeof nativeVisibility?.hidden === "function") {
					return nativeVisibility.hidden.call(document) === true;
				}
				if (typeof nativeVisibility?.webkitHidden === "function") {
					return nativeVisibility.webkitHidden.call(document) === true;
				}
				if (typeof nativeVisibility?.mozHidden === "function") {
					return nativeVisibility.mozHidden.call(document) === true;
				}
			} catch {}
			return document.hidden;
		}

		function _runScan(force = false) {
			_resetPlayerDetectionCaches();
			const now = Date.now();
			if (!force && now - lastScanAt < 250) {
				return false;
			}
			lastScanAt = now;
			return _$sr();
		}

		function _queueScan(delay = 0, force = false) {
			scheduledScanForce = scheduledScanForce || force;
			if (scheduledScanTimer) return;

			scheduledScanTimer = setTimeout(
				() => {
					scheduledScanTimer = null;
					const nextForce = scheduledScanForce;
					scheduledScanForce = false;
					const waitMs = Math.max(0, 250 - (Date.now() - lastScanAt));
					if (!nextForce && waitMs > 0) {
						_queueScan(waitMs, false);
						return;
					}
					_runScan(nextForce);
				},
				Math.max(0, delay),
			);
		}

		function _shouldScanForMutationNode(node) {
			if (!(node instanceof Element)) return false;

			for (const selector of MUTATION_NOISE_SELECTORS) {
				try {
					if (node.closest?.(selector)) return false;
				} catch {}
			}

			try {
				if (
					node.matches?.(RELEVANT_MUTATION_SELECTOR) ||
					node.querySelector?.(RELEVANT_MUTATION_SELECTOR)
				) {
					return true;
				}
			} catch {}

			if (_isNearMainPlayer(node)) {
				return true;
			}

			try {
				const style = window.getComputedStyle(node);
				const isOverlayLike =
					style.position === "fixed" || style.position === "absolute";
				if (isOverlayLike && node.offsetWidth > 180 && node.offsetHeight > 80) {
					return true;
				}
			} catch {}

			return false;
		}

		if (_runScan(true)) {
			_$l("Popup removed on initial scan", "success");
		}

		window.addEventListener("message", (event) => {
			if (!_isTrustedWindowMessageSource(event.source)) return;
			const message = _getTrustedBridgeMessageData(event.data);
			const detail = _getTrustedBridgeMessageDetail(message?.detail);
			if (
				message?.type !== "ttvab-ad-blocked" ||
				!Number.isFinite(detail?.count)
			) {
				return;
			}
			const currentContext = _getPlaybackContextFromUrl(window.location.href);
			const blockedChannel =
				typeof detail.channel === "string" ? detail.channel : null;
			const blockedMediaKey =
				typeof detail.mediaKey === "string" ? detail.mediaKey : null;
			if (
				blockedMediaKey &&
				currentContext.MediaKey &&
				blockedMediaKey !== currentContext.MediaKey
			) {
				return;
			}
			if (
				!blockedMediaKey &&
				blockedChannel &&
				blockedChannel !== currentContext.ChannelName
			) {
				return;
			}
			_runScan(true);
			setTimeout(() => _queueScan(0, true), 120);
			setTimeout(() => _queueScan(0, true), 300);
		});

		window.addEventListener("popstate", _handleRouteChange, true);
		window.addEventListener("hashchange", _handleRouteChange, true);

		let debounceTimer = null;
		let lastImmediateScan = 0;
		const observer = new MutationObserver((mutations) => {
			_resetPlayerDetectionCaches();
			let shouldScan = false;
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (_shouldScanForMutationNode(node)) {
						shouldScan = true;
						break;
					}
				}
				if (shouldScan) break;
			}

			if (!shouldScan) return;

			_handleRouteChange();

			const now = Date.now();
			if (now - lastImmediateScan > 250) {
				lastImmediateScan = now;
				_queueScan(0);
			}

			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				_queueScan(0);
				debounceTimer = null;
			}, 120);
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
		});

		function _$is() {
			const delay = _isDocumentHidden() ? 5000 : 2000;
			setTimeout(() => {
				_handleRouteChange();
				if (!_isDocumentHidden()) {
					_queueScan(0);
				}
				_$is();
			}, delay);
		}
		_$is();

		_$l("Popup blocker active", "success");
	}

	_$ipb();
}

function _$in() {
	if (!_$bs()) return;

	_$ds(window);
	_syncPagePlaybackContext({ broadcast: false });

	window.addEventListener("message", (e) => {
		if (!_isTrustedWindowMessageSource(e.source)) return;
		const message = _getTrustedBridgeMessageData(e.data);
		const detail = _getTrustedBridgeMessageDetail(message?.detail);
		if (!message || !detail) return;

		if (message.type === "ttvab-init-count" && Number.isFinite(detail.count)) {
			const restoredCount = _normalizeCounterValue(detail.count);
			if (_$s.adsBlocked === restoredCount) return;
			_$s.adsBlocked = restoredCount;
			_$bw({ key: "UpdateAdsBlocked", value: _$s.adsBlocked });
			_$l(`Restored ads count: ${_$s.adsBlocked}`, "info");
			return;
		}

		if (
			message.type === "ttvab-init-dom-ads-count" &&
			Number.isFinite(detail.count)
		) {
			const restoredCount = _normalizeCounterValue(detail.count);
			if (_$s.domAdsBlocked === restoredCount) return;
			_$s.domAdsBlocked = restoredCount;
			_$l(`Restored DOM cleanup count: ${_$s.domAdsBlocked}`, "info");
		}
	});

	_$sd();
	_$hw();
	_$mf();
	_$tl();
	_$bp();
	_$al();

	_$hvs();
	_monitorPlaybackIntent();
	if (_$c.BUFFERING_FIX) {
		_$mpb();
	}

	_$wc();
	_$dn();

	window.postMessage({ type: "ttvab-request-state" }, "*");

	_$l("Initialized successfully", "success");
}

_$in();
})();