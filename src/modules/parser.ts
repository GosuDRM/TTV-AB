// TTV AB - Parser

const _ATTR_REGEX = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
const _AD_METADATA_RE =
	/stitched-ad|X-TV-TWITCH-AD|\/adsquared\/|SCTE35-OUT|EXT-X-CUE-OUT|EXT-X-DATERANGE:CLASS="twitch-|"(?:MIDROLL|midroll)"/;
const _EMPTY_SEGMENT_URL =
	"data:video/mp4;base64,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XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXgNwATGF2YzYzLjEuMTAxAEIgCMEYOCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHCEQBGCMHAAAAG5tZnJhAAAAK3RmcmEBAAAAAAAAAQAAAAAAAAABAAAAAAAAAAAAAAAAAAAE4wEBAQAAACt0ZnJhAQAAAAAAAAIAAAAAAAAAAQAAAAAAAAAAAAAAAAAABOMBAQEAAAAQbWZybwAAAAAAAABu";
const _RESERVED_ROUTE_SEGMENTS = new Set([
	"activate",
	"bits",
	"browse",
	"clip",
	"clips",
	"collections",
	"dashboard",
	"directory",
	"downloads",
	"drops",
	"embed",
	"event",
	"following",
	"friends",
	"inventory",
	"jobs",
	"login",
	"manager",
	"messages",
	"moderator",
	"p",
	"player",
	"popout",
	"prime",
	"products",
	"search",
	"settings",
	"signup",
	"store",
	"subscriptions",
	"team",
	"turbo",
	"u",
	"user",
	"video",
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

function _isPreviewsPlayerUrl(rawUrl) {
	try {
		const baseUrl =
			typeof globalThis?.location?.href === "string"
				? globalThis.location.href
				: "https://www.twitch.tv/";
		const parsedUrl = new URL(String(rawUrl || ""), baseUrl);
		const previewType = parsedUrl.searchParams.get("tp_prev");
		return Boolean(
			parsedUrl.protocol === "https:" &&
				parsedUrl.hostname.toLowerCase() === "player.twitch.tv" &&
				(previewType === "s" || previewType === "d") &&
				_normalizeChannelName(parsedUrl.searchParams.get("channel")),
		);
	} catch {
		return false;
	}
}

function _getPlaybackContextFromUrl(rawUrl) {
	let parsedUrl = null;
	let pathname = "";
	try {
		const baseUrl =
			typeof globalThis?.location?.href === "string"
				? globalThis.location.href
				: "https://www.twitch.tv/";
		parsedUrl = new URL(String(rawUrl || ""), baseUrl);
		pathname = parsedUrl.pathname;
	} catch {
		pathname = typeof rawUrl === "string" ? rawUrl : "";
	}

	const hostname = String(parsedUrl?.hostname || "").toLowerCase();
	if (hostname === "player.twitch.tv") {
		const queryChannel = _normalizeChannelName(
			parsedUrl?.searchParams?.get("channel") || null,
		);
		const rawVideoQuery =
			parsedUrl?.searchParams?.get("video") ||
			parsedUrl?.searchParams?.get("vod") ||
			null;
		const queryVodID = _normalizeVodID(
			typeof rawVideoQuery === "string"
				? rawVideoQuery.replace(/^v/i, "")
				: rawVideoQuery,
		);

		if (queryChannel) {
			return _normalizePlaybackContext({
				MediaType: "live",
				ChannelName: queryChannel,
			});
		}

		if (queryVodID) {
			return _normalizePlaybackContext({
				MediaType: "vod",
				VodID: queryVodID,
			});
		}
	}

	const segments = String(pathname || "")
		.split("/")
		.filter(Boolean);
	const firstSegment = segments[0] || null;
	const lowerFirstSegment = String(firstSegment || "").toLowerCase();

	if (lowerFirstSegment === "videos" || lowerFirstSegment === "video") {
		return _normalizePlaybackContext({
			MediaType: "vod",
			VodID: (segments[1] || "").replace(/^v/i, "") || null,
		});
	}

	if (lowerFirstSegment === "popout") {
		const popoutChannel = _normalizeChannelName(segments[1] || null);
		if (popoutChannel && String(segments[2] || "").toLowerCase() === "player") {
			return _normalizePlaybackContext({
				MediaType: "live",
				ChannelName: popoutChannel,
			});
		}
		return _normalizePlaybackContext(null);
	}

	if (lowerFirstSegment === "embed" || lowerFirstSegment === "moderator") {
		const nestedChannel = _normalizeChannelName(segments[1] || null);
		if (nestedChannel) {
			return _normalizePlaybackContext({
				MediaType: "live",
				ChannelName: nestedChannel,
			});
		}
		return _normalizePlaybackContext(null);
	}

	if (segments.length !== 1) {
		return _normalizePlaybackContext(null);
	}

	const liveChannel = _normalizeChannelName(firstSegment);
	if (liveChannel && !_RESERVED_ROUTE_SEGMENTS.has(liveChannel)) {
		return _normalizePlaybackContext({
			MediaType: "live",
			ChannelName: liveChannel,
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

	const vodMatch = pathname.match(
		/\/(?:api\/v2\/vod|vod(?:\/v2)?)\/(\d+)\.m3u8$/i,
	);
	if (vodMatch?.[1]) {
		return _normalizePlaybackContext({
			MediaType: "vod",
			VodID: vodMatch[1],
		});
	}

	return null;
}

function _parseAttrs(str) {
	const result = Object.create(null);
	_ATTR_REGEX.lastIndex = 0;
	let match = _ATTR_REGEX.exec(str);
	while (match !== null) {
		let value = match[2];
		if (value && value[0] === '"' && value[value.length - 1] === '"') {
			value = value.slice(1, -1);
		}
		result[match[1].toUpperCase()] = value;
		match = _ATTR_REGEX.exec(str);
	}
	return result;
}

function _getServerTime(m3u8) {
	if (__TTVAB_STATE__.V2API) {
		const match = m3u8.match(
			/#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="([^"]+)"/,
		);
		return match?.[1] ?? null;
	}
	const match = m3u8.match(/SERVER-TIME="([0-9.]+)"/);
	return match?.[1] ?? null;
}

function _replaceServerTime(m3u8, time) {
	if (!time) return m3u8;
	if (__TTVAB_STATE__.V2API) {
		return m3u8.replace(
			/(#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE=")[^"]+(")/,
			`$1${time}$2`,
		);
	}
	return m3u8.replace(/(SERVER-TIME=")[0-9.]+(")/, `$1${time}$2`);
}

function _hasExplicitAdMetadata(text) {
	return typeof text === "string" && _AD_METADATA_RE.test(text);
}

function _isExplicitKnownAdSegmentUrl(segmentUrl) {
	const url = String(segmentUrl || "");
	if (!url) return false;
	if (/\.m3u8(?:$|\?)/.test(url)) return false;
	return (
		(__TTVAB_STATE__.AdSignifier &&
			url.includes(__TTVAB_STATE__.AdSignifier)) ||
		url.includes("/adsquared/") ||
		url.includes("/_404/")
	);
}

function _isKnownAdSegmentUrl(
	segmentUrl,
	options: { includeCached?: boolean } = {},
) {
	const url = String(segmentUrl || "");
	if (!url) return false;
	const includeCached = options.includeCached !== false;
	return (
		(includeCached && __TTVAB_STATE__.AdSegmentCache.has(url)) ||
		_isExplicitKnownAdSegmentUrl(url)
	);
}

function _getTaggedPlaylistUri(line) {
	if (typeof line !== "string" || !line.includes('URI="')) return "";
	const match = line.match(/URI="([^"]+)"/);
	return match?.[1] || "";
}

function _isMediaPartLine(line) {
	return typeof line === "string" && line.startsWith("#EXT-X-PART:");
}

function _isPartPreloadHintLine(line) {
	return (
		typeof line === "string" &&
		line.startsWith("#EXT-X-PRELOAD-HINT:") &&
		(line.includes("TYPE=PART") || line.includes('TYPE="PART"'))
	);
}

function _playlistLinesHaveKnownAdSegments(
	lines,
	options: { includeCached?: boolean } = {},
) {
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (
			line?.startsWith("#EXTINF") &&
			index + 1 < lines.length &&
			_isKnownAdSegmentUrl(lines[index + 1], options)
		) {
			return true;
		}
		if (_isMediaPartLine(line) || _isPartPreloadHintLine(line)) {
			const taggedUri = _getTaggedPlaylistUri(line);
			if (_isKnownAdSegmentUrl(taggedUri, options)) {
				return true;
			}
		}
	}
	return false;
}

function _playlistHasKnownAdSegments(
	text,
	options: { includeCached?: boolean } = {},
) {
	if (typeof text !== "string" || !text) return false;
	if (
		options.includeCached === false &&
		(!__TTVAB_STATE__.AdSignifier ||
			!text.includes(__TTVAB_STATE__.AdSignifier)) &&
		!text.includes("/adsquared/") &&
		!text.includes("/_404/")
	) {
		return false;
	}
	return _playlistLinesHaveKnownAdSegments(text.split("\n"), options);
}

function _absolutizePlaylistUrl(
	rawUrl,
	baseUrl = null,
	segmentUrlCollection = null,
) {
	const candidate = typeof rawUrl === "string" ? rawUrl.trim() : "";
	if (!candidate || !baseUrl || candidate.startsWith("#")) {
		if (segmentUrlCollection) segmentUrlCollection.isComplete = false;
		return candidate || rawUrl;
	}
	try {
		const parsedUrl = new URL(candidate, baseUrl);
		const normalizedUrl = parsedUrl.href;
		if (segmentUrlCollection) {
			parsedUrl.hash = "";
			segmentUrlCollection.urls.push(parsedUrl.href);
		}
		return normalizedUrl;
	} catch {
		if (segmentUrlCollection) segmentUrlCollection.isComplete = false;
		return rawUrl;
	}
}

function _absolutizeMediaPlaylistUrls(
	text,
	baseUrl = null,
	segmentUrlCollection = null,
) {
	if (
		typeof text !== "string" ||
		!text ||
		!baseUrl ||
		(!text.includes("#EXTINF") &&
			!text.includes("#EXT-X-MAP:") &&
			!text.includes("#EXT-X-KEY:") &&
			!text.includes('URI="'))
	) {
		return text;
	}

	const lines = text.split("\n");
	return lines
		.map((line, index) => {
			const followsMediaDuration = lines[index - 1]?.startsWith("#EXTINF");
			if (
				followsMediaDuration &&
				segmentUrlCollection &&
				(typeof line !== "string" || !line || line.startsWith("#"))
			) {
				segmentUrlCollection.isComplete = false;
			}
			if (typeof line !== "string" || !line) return line;
			if (!line.startsWith("#")) {
				return _absolutizePlaylistUrl(
					line,
					baseUrl,
					followsMediaDuration ? segmentUrlCollection : null,
				);
			}
			if (line.startsWith("#EXT-X-TWITCH-PREFETCH:")) {
				const prefetchUrl = line
					.substring("#EXT-X-TWITCH-PREFETCH:".length)
					.trim();
				const normalizedPrefetch = _absolutizePlaylistUrl(
					prefetchUrl,
					baseUrl,
					segmentUrlCollection,
				);
				return `#EXT-X-TWITCH-PREFETCH:${normalizedPrefetch}`;
			}
			if (!line.includes('URI="')) {
				return line;
			}
			const shouldCollectTaggedUrl =
				_isMediaPartLine(line) || _isPartPreloadHintLine(line);
			let collectedTaggedUrl = false;
			return line.replace(/URI="([^"]+)"/g, (_match, value) => {
				const normalizedValue = _absolutizePlaylistUrl(
					value,
					baseUrl,
					shouldCollectTaggedUrl && !collectedTaggedUrl
						? segmentUrlCollection
						: null,
				);
				if (shouldCollectTaggedUrl) collectedTaggedUrl = true;
				return `URI="${normalizedValue}"`;
			});
		})
		.join("\n");
}

function _createEmptyAdHoldPlaylist(text, info) {
	const headerLines = (_extractPlaylistHeaders(text) || "#EXTM3U")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (!headerLines.includes("#EXTM3U")) {
		headerLines.unshift("#EXTM3U");
	}
	if (!headerLines.some((line) => line.startsWith("#EXT-X-VERSION:"))) {
		headerLines.splice(1, 0, "#EXT-X-VERSION:7");
	}
	if (!headerLines.some((line) => line.startsWith("#EXT-X-TARGETDURATION:"))) {
		headerLines.push("#EXT-X-TARGETDURATION:1");
	}

	let mediaSequenceIndex = -1;
	let sourceMediaSequence = 0;
	for (let i = 0; i < headerLines.length; i++) {
		const match = headerLines[i]?.match(/^#EXT-X-MEDIA-SEQUENCE:(\d+)/);
		if (!match) continue;
		mediaSequenceIndex = i;
		sourceMediaSequence = Number(match[1]) || 0;
		break;
	}

	const previousHoldSequence = Math.max(
		0,
		Number(info?._EmptyAdHoldMediaSequence) || 0,
	);
	const nextHoldSequence =
		previousHoldSequence > sourceMediaSequence
			? previousHoldSequence + 1
			: sourceMediaSequence + 1;
	if (info) {
		info._EmptyAdHoldMediaSequence = nextHoldSequence;
	}

	const mediaSequenceLine = `#EXT-X-MEDIA-SEQUENCE:${nextHoldSequence}`;
	if (mediaSequenceIndex >= 0) {
		headerLines[mediaSequenceIndex] = mediaSequenceLine;
	} else {
		headerLines.push(mediaSequenceLine);
	}

	const emptySegmentUrl = new URL(
		"/__ttvab_empty_hold_segment.mp4",
		"https://www.twitch.tv",
	);
	emptySegmentUrl.searchParams.set("seq", String(nextHoldSequence));
	const mediaKey =
		typeof info?.MediaKey === "string" && info.MediaKey
			? info.MediaKey
			: "unknown";
	emptySegmentUrl.searchParams.set("media", mediaKey);

	return [
		...headerLines,
		"#EXT-X-DISCONTINUITY",
		"#EXTINF:1.000,live",
		emptySegmentUrl.href,
	].join("\n");
}

function _isEmptyAdHoldSegmentUrl(url) {
	if (typeof url !== "string" || !url) return false;
	try {
		const parsed = new URL(url, "https://www.twitch.tv");
		return (
			parsed.hostname === "www.twitch.tv" &&
			parsed.pathname === "/__ttvab_empty_hold_segment.mp4"
		);
	} catch {
		return false;
	}
}

function _stripAds(
	text,
	stripAll,
	info,
	_skipAutoForceStrip = false,
	preserveLiveSegments = false,
) {
	const lines = text.split("\n");
	const len = lines.length;
	let stripped = false;
	let i = 0;
	let strippedMediaEntryCount = 0;

	const hasExplicitAdMetadata = _hasExplicitAdMetadata(text);
	const hasKnownAdSegments = _playlistLinesHaveKnownAdSegments(lines);
	const forceStripAllSegments =
		stripAll ||
		__TTVAB_STATE__.AllSegmentsAreAdSegments ||
		(hasExplicitAdMetadata && !hasKnownAdSegments);
	const canPreserveLiveSegments =
		preserveLiveSegments && !(hasExplicitAdMetadata && !hasKnownAdSegments);

	let adSegmentCount = 0;
	let _liveSegmentCount = 0;

	for (i = 0; i < len; i++) {
		const line = lines[i];
		if (line?.startsWith("#EXTINF")) {
			const segmentUrl = lines[i + 1];
			const isKnownAdSegment = _isKnownAdSegmentUrl(segmentUrl);
			const isAdSegment =
				isKnownAdSegment ||
				(forceStripAllSegments &&
					(!canPreserveLiveSegments || !line.includes(",live")));
			if (isAdSegment) {
				adSegmentCount++;
			} else {
				_liveSegmentCount++;
			}
		}
		if (_isMediaPartLine(line) || _isPartPreloadHintLine(line)) {
			const partUrl = _getTaggedPlaylistUri(line);
			const isAdSegment =
				forceStripAllSegments || _isKnownAdSegmentUrl(partUrl);
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
		const line = lines[i];

		if (shouldStrip && line?.startsWith("#EXT-X-TWITCH-PREFETCH:")) {
			const prefetchUrl = line
				.substring("#EXT-X-TWITCH-PREFETCH:".length)
				.trim();
			if (forceStripAllSegments || _isKnownAdSegmentUrl(prefetchUrl)) {
				lines[i] = "";
			}
			continue;
		}

		if (shouldStrip && i < len - 1 && line?.startsWith("#EXTINF")) {
			const isKnownAdSegment = _isKnownAdSegmentUrl(lines[i + 1]);
			const isAdSegment =
				isKnownAdSegment ||
				(forceStripAllSegments &&
					(!canPreserveLiveSegments || !line.includes(",live")));

			if (isAdSegment) {
				const segmentUrl = lines[i + 1];

				if (!__TTVAB_STATE__.AdSegmentCache.has(segmentUrl))
					info.NumStrippedAdSegments++;
				strippedMediaEntryCount++;

				if (
					!forceStripAllSegments ||
					_isExplicitKnownAdSegmentUrl(segmentUrl)
				) {
					__TTVAB_STATE__.AdSegmentCache.set(segmentUrl, Date.now());
				}

				stripped = true;
				lines[i] = "";
				lines[i + 1] = "";
				i++;
			}
		}

		if (
			shouldStrip &&
			(_isMediaPartLine(line) || _isPartPreloadHintLine(line))
		) {
			const taggedUri = _getTaggedPlaylistUri(line);
			const isAdSegment =
				forceStripAllSegments || _isKnownAdSegmentUrl(taggedUri);
			if (isAdSegment) {
				if (
					_isMediaPartLine(line) &&
					taggedUri &&
					!__TTVAB_STATE__.AdSegmentCache.has(taggedUri)
				) {
					info.NumStrippedAdSegments++;
				}
				strippedMediaEntryCount++;
				if (
					taggedUri &&
					(!forceStripAllSegments || _isExplicitKnownAdSegmentUrl(taggedUri))
				) {
					__TTVAB_STATE__.AdSegmentCache.set(taggedUri, Date.now());
				}
				stripped = true;
				lines[i] = "";
				continue;
			}
		}

		if (
			hasExplicitAdMetadata &&
			line?.charCodeAt(0) === 35 &&
			_AD_METADATA_RE.test(line)
		) {
			stripped = true;
			lines[i] = "";
		}
	}

	if (!stripped) {
		info.NumStrippedAdSegments = 0;
	}

	if (hasExplicitAdMetadata) {
		for (i = 0; i < len; i++) {
			const line = lines[i];
			if (
				line?.startsWith("#EXT-X-TWITCH-PREFETCH:") ||
				line?.startsWith("#EXT-X-PRELOAD-HINT:")
			) {
				lines[i] = "";
			}
		}
	}

	info.IsStrippingAdSegments = stripped;

	const now = Date.now();
	if (
		!globalThis._lastAdCachePrune ||
		now - globalThis._lastAdCachePrune > 60000
	) {
		globalThis._lastAdCachePrune = now;
		const cutoff = now - 120000;
		const staleKeys = [];
		__TTVAB_STATE__.AdSegmentCache.forEach((v, k) => {
			if (v < cutoff) staleKeys.push(k);
		});
		for (const k of staleKeys) {
			__TTVAB_STATE__.AdSegmentCache.delete(k);
		}
		if (__TTVAB_STATE__.AdSegmentCache.size > 1000) {
			let evicted = 0;
			for (const url of __TTVAB_STATE__.AdSegmentCache.keys()) {
				if (++evicted > 200) break;
				__TTVAB_STATE__.AdSegmentCache.delete(url);
			}
		}
	}

	const result = [];
	let hasRemainingSegments = false;
	for (let ri = 0; ri < len; ri++) {
		const l = lines[ri];
		if (l === "") continue;
		result.push(l);
		if (
			!hasRemainingSegments &&
			(l?.startsWith("#EXTINF") || l?.startsWith("#EXT-X-PART:"))
		) {
			hasRemainingSegments = true;
		}
	}

	if (!hasRemainingSegments && strippedMediaEntryCount > 0) {
		_log(
			"[Recovery] Empty playlist after stripping ads; serving advancing empty hold segment",
			"warning",
		);
		return _createEmptyAdHoldPlaylist(text, info);
	}

	return result.join("\n");
}

function _extractPlaylistHeaders(text) {
	if (typeof text !== "string" || !text) return null;
	const lines = text.split("\n");
	const headers = [];
	for (const line of lines) {
		if (
			line?.startsWith("#EXTINF") ||
			line?.startsWith("#EXT-X-PART:") ||
			line?.startsWith("#EXT-X-PRELOAD-HINT:") ||
			line?.startsWith("#EXT-X-TWITCH-PREFETCH:")
		) {
			break;
		}
		if (_hasExplicitAdMetadata(line)) continue;
		if (
			line?.includes("X-TV-TWITCH-AD") ||
			line?.includes("EXT-X-CUE-OUT") ||
			line?.includes("SCTE35-OUT")
		) {
			continue;
		}
		headers.push(line);
	}
	return headers.length > 0 ? headers.join("\n") : "#EXTM3U\n";
}

function _getStreamVariantInfo(attrs, rawUrl, variantUrl) {
	const frameRate = Number.parseFloat(attrs?.["FRAME-RATE"]);
	const bandwidth = Number.parseInt(attrs?.BANDWIDTH, 10);
	return {
		Resolution: String(attrs.RESOLUTION || "0x0"),
		FrameRate: Number.isFinite(frameRate) ? frameRate : 0,
		Bandwidth: Number.isFinite(bandwidth) ? Math.max(0, bandwidth) : 0,
		Codecs: String(attrs.CODECS || ""),
		Audio: String(attrs.AUDIO || ""),
		Name: String(attrs.VIDEO || ""),
		Subtitles: String(attrs.SUBTITLES || ""),
		Video: String(attrs.VIDEO || ""),
		RawUrl: rawUrl,
		Url: variantUrl,
	};
}

function _getStreamUrl(m3u8, res, baseUrl = null) {
	const lines = m3u8.split("\n");
	const len = lines.length;
	const targetName =
		typeof res?.Name === "string" && res.Name.trim()
			? res.Name.trim().toLowerCase()
			: null;
	const [tw, th] = String(res?.Resolution || "0x0")
		.split("x")
		.map(Number);
	const targetPixels =
		(Number.isFinite(tw) ? tw : 0) * (Number.isFinite(th) ? th : 0);
	const targetFrameRate = Number.parseFloat(String(res?.FrameRate ?? ""));
	const hasValidTargetPixels =
		Number.isFinite(targetPixels) && targetPixels > 0;
	let matchUrl = null;
	let matchFps = false;
	let closeUrl = null;
	let closeDiff = Infinity;
	let highestUrl = null;
	let highestArea = -1;
	let firstUrl = null;
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
		const nextLine = lines[i + 1]?.trim();
		if (
			!line?.startsWith("#EXT-X-STREAM-INF") ||
			!nextLine ||
			nextLine.startsWith("#")
		)
			continue;

		if (!firstUrl) {
			firstUrl = resolveUrl(lines[i + 1]);
		}

		const attrs = _parseAttrs(line);
		const resolution = attrs.RESOLUTION;
		const frameRate = attrs["FRAME-RATE"];
		const variantName = String(attrs.VIDEO || "")
			.trim()
			.toLowerCase();
		const parsedFrameRate = Number.parseFloat(String(frameRate ?? ""));
		const matchesFrameRate =
			Number.isFinite(targetFrameRate) && Number.isFinite(parsedFrameRate)
				? Math.abs(parsedFrameRate - targetFrameRate) < 0.01
				: String(frameRate || "") === String(res?.FrameRate || "");

		if (targetName && variantName === targetName) {
			return resolveUrl(lines[i + 1]);
		}

		if (!resolution) continue;

		if (resolution === res?.Resolution) {
			if (!matchUrl || (!matchFps && matchesFrameRate)) {
				matchUrl = resolveUrl(lines[i + 1]);
				matchFps = matchesFrameRate;
				if (matchFps) return matchUrl;
			}
		}

		const [w, h] = String(resolution || "0x0")
			.split("x")
			.map(Number);
		const area = (Number.isFinite(w) ? w : 0) * (Number.isFinite(h) ? h : 0);
		if (area > highestArea) {
			highestArea = area;
			highestUrl = resolveUrl(lines[i + 1]);
		}
		if (hasValidTargetPixels) {
			const diff = Math.abs(area - targetPixels);
			if (diff < closeDiff) {
				closeUrl = resolveUrl(lines[i + 1]);
				closeDiff = diff;
			}
		}
	}

	return matchUrl || closeUrl || highestUrl || firstUrl;
}

function _getSortedResolutionList(resolutionList) {
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
		const aFps = Number.parseFloat(String(a?.FrameRate ?? "")) || 0;
		const bFps = Number.parseFloat(String(b?.FrameRate ?? "")) || 0;
		const aBandwidth = Number.parseInt(String(a?.Bandwidth ?? ""), 10) || 0;
		const bBandwidth = Number.parseInt(String(b?.Bandwidth ?? ""), 10) || 0;
		return bArea - aArea || bFps - aFps || bBandwidth - aBandwidth;
	});
}

function _getResolutionByQualityGroup(resolutionList, qualityGroup) {
	const normalizedQualityGroup =
		typeof qualityGroup === "string" ? qualityGroup.trim().toLowerCase() : "";
	if (!normalizedQualityGroup || normalizedQualityGroup === "auto") {
		return null;
	}

	const exactName = resolutionList.find(
		(entry) =>
			typeof entry?.Name === "string" &&
			entry.Name.trim().toLowerCase() === normalizedQualityGroup,
	);
	if (exactName) return exactName;

	const sorted = _getSortedResolutionList(resolutionList);
	if (normalizedQualityGroup === "chunked") {
		return sorted[0] || null;
	}
	if (normalizedQualityGroup === "audio_only") {
		return sorted[sorted.length - 1] || null;
	}

	const match = normalizedQualityGroup.match(/(\d{3,4})p(?:(\d{2,3}))?/);
	if (!match) return null;

	const targetHeight = Number.parseInt(match[1], 10);
	const targetFps = match[2] ? Number.parseInt(match[2], 10) : null;

	return (
		[...resolutionList].sort((a, b) => {
			const [, ahRaw] = String(a?.Resolution || "0x0")
				.split("x")
				.map(Number);
			const [, bhRaw] = String(b?.Resolution || "0x0")
				.split("x")
				.map(Number);
			const aHeight = Number.isFinite(ahRaw) ? ahRaw : 0;
			const bHeight = Number.isFinite(bhRaw) ? bhRaw : 0;
			const aFps = Number.parseFloat(String(a?.FrameRate ?? "")) || 0;
			const bFps = Number.parseFloat(String(b?.FrameRate ?? "")) || 0;
			const aScore =
				Math.abs(aHeight - targetHeight) * 1000 +
				(targetFps !== null ? Math.abs(aFps - targetFps) * 10 : 0);
			const bScore =
				Math.abs(bHeight - targetHeight) * 1000 +
				(targetFps !== null ? Math.abs(bFps - targetFps) * 10 : 0);
			return aScore - bScore;
		})[0] || null
	);
}

function _degradeToDecodableResolution(info, entry, resolutionList) {
	if (!entry || !info?.IsUsingModifiedM3U8) return entry;
	if (!_isEnhancedCodecString(entry?.Codecs)) return entry;
	const heightOf = (candidate) => {
		const [, h] = String(candidate?.Resolution || "0x0")
			.split("x")
			.map(Number);
		return Number.isFinite(h) ? h : 0;
	};
	const ceiling = heightOf(entry);
	const list = Array.isArray(resolutionList)
		? resolutionList.filter(Boolean)
		: [];
	let best = null;
	let bestHeight = 0;
	for (const candidate of list) {
		if (_isEnhancedCodecString(candidate?.Codecs)) continue;
		const height = heightOf(candidate);
		if (height <= 0 || (ceiling > 0 && height > ceiling)) continue;
		if (height > bestHeight) {
			best = candidate;
			bestHeight = height;
		}
	}
	return best || entry;
}

function _getFallbackResolution(info, url) {
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

	const preferredQualityGroup =
		typeof __TTVAB_STATE__ !== "undefined"
			? __TTVAB_STATE__?.PreferredQualityGroup
			: null;
	const preferredResolution = _degradeToDecodableResolution(
		info,
		_getResolutionByQualityGroup(resolutionList, preferredQualityGroup),
		resolutionList,
	);
	if (preferredResolution) return preferredResolution;

	const sorted = _getSortedResolutionList(resolutionList);
	const isDecodable = (entry) =>
		!info?.IsUsingModifiedM3U8 || !_isEnhancedCodecString(entry?.Codecs);
	const heightOf = (entry) => {
		const [, h] = String(entry?.Resolution || "0x0")
			.split("x")
			.map(Number);
		return Number.isFinite(h) ? h : 0;
	};
	let fallback = null;
	for (const entry of sorted) {
		if (!isDecodable(entry) || heightOf(entry) <= 0) continue;
		if (!fallback || heightOf(entry) >= 360) fallback = entry;
	}
	return fallback || sorted[0];
}

function _applyBackupResolutionFloor(res, resolutionList, floorHeight = 360) {
	const heightOf = (entry) => {
		const [, h] = String(entry?.Resolution || "0x0")
			.split("x")
			.map(Number);
		return Number.isFinite(h) ? h : 0;
	};
	const targetHeight = heightOf(res);
	if (targetHeight <= 0 || targetHeight >= floorHeight) {
		return res;
	}
	const list = Array.isArray(resolutionList)
		? resolutionList.filter(Boolean)
		: [];
	let floored = null;
	let flooredHeight = Number.POSITIVE_INFINITY;
	for (const entry of list) {
		const h = heightOf(entry);
		if (h >= floorHeight && h < flooredHeight) {
			floored = entry;
			flooredHeight = h;
		}
	}
	return floored || res;
}

function _isHevcCodecString(codecs) {
	const c = typeof codecs === "string" ? codecs : "";
	return c.startsWith("hev") || c.startsWith("hvc");
}

function _isEnhancedCodecString(codecs) {
	const c = typeof codecs === "string" ? codecs : "";
	return _isHevcCodecString(c) || c.startsWith("av0");
}

function _shouldAvoidHevcBackupVariants(info) {
	if (info?.IsUsingModifiedM3U8) return true;
	const enhancedDecoderCodecFamily = _getVideoCodecFamily(
		info?.EnhancedDecoderCodecFamily,
	);
	if (
		enhancedDecoderCodecFamily === "hevc" ||
		enhancedDecoderCodecFamily === "av1"
	) {
		return false;
	}
	if (_isEnhancedCodecString(info?.SustainedNativeResolution?.Codecs)) {
		return false;
	}
	const list = Array.isArray(info?.ResolutionList)
		? info.ResolutionList.filter(Boolean)
		: [];
	if (list.length > 0 && list.every((r) => _isEnhancedCodecString(r?.Codecs))) {
		return false;
	}
	return true;
}

function _dropEnhancedVariantLines(lines) {
	const kept = [];
	let removed = 0;
	let remaining = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line?.startsWith("#EXT-X-STREAM-INF")) {
			const uri = i + 1 < lines.length ? String(lines[i + 1] || "") : "";
			const hasUri = uri.trim() && !uri.trim().startsWith("#");
			if (
				hasUri &&
				_isEnhancedCodecString(String(_parseAttrs(line).CODECS || ""))
			) {
				removed++;
				i++;
				continue;
			}
			if (hasUri) remaining++;
		}
		kept.push(line);
	}
	return { kept, removed, remaining };
}

function _stripHevcBackupVariants(
	info,
	m3u8,
	targetResolution = null,
	codecFamilyOverride = null,
) {
	if (typeof m3u8 !== "string" || !m3u8.includes("#EXT-X-STREAM-INF")) {
		return m3u8;
	}
	const explicitCodecFamily = _getVideoCodecFamily(codecFamilyOverride);
	const explicitCodecIdentity = _getVideoCodecIdentity(codecFamilyOverride);
	let requestedCodecFamily = info?.IsUsingModifiedM3U8
		? "avc"
		: explicitCodecFamily ||
			_getVideoCodecFamily(info?.EnhancedDecoderCodecFamily) ||
			_getVideoCodecFamily(targetResolution?.Codecs) ||
			_getVideoCodecFamily(info?.SustainedNativeResolution?.Codecs);
	if (!requestedCodecFamily) {
		if (!_shouldAvoidHevcBackupVariants(info)) return m3u8;
		requestedCodecFamily = "avc";
	}
	const requiresExactCodecIdentity =
		requestedCodecFamily === "hevc" || requestedCodecFamily === "av1";
	const requestedCodecIdentity =
		!info?.IsUsingModifiedM3U8 && requiresExactCodecIdentity
			? explicitCodecIdentity ||
				_getVideoCodecIdentity(info?.EnhancedDecoderCodec) ||
				_getVideoCodecIdentity(targetResolution?.Codecs) ||
				_getVideoCodecIdentity(info?.SustainedNativeResolution?.Codecs)
			: null;
	const requireExplicitCodecFamily = Boolean(
		explicitCodecFamily ||
			info?.IsUsingModifiedM3U8 ||
			requiresExactCodecIdentity,
	);

	const lines = m3u8.split("\n");
	let matchingVariants = 0;
	for (let i = 0; i < lines.length - 1; i++) {
		const line = lines[i];
		const uri = lines[i + 1]?.trim();
		if (!line?.startsWith("#EXT-X-STREAM-INF") || !uri || uri.startsWith("#")) {
			continue;
		}
		const variantCodecs = _parseAttrs(line).CODECS;
		const variantCodecFamily = _getVideoCodecFamily(variantCodecs);
		const variantCodecIdentity = _getVideoCodecIdentity(variantCodecs);
		if (
			variantCodecFamily === requestedCodecFamily &&
			(!requiresExactCodecIdentity ||
				(requestedCodecIdentity &&
					variantCodecIdentity === requestedCodecIdentity))
		) {
			matchingVariants++;
		}
	}

	const kept = [];
	let removed = 0;
	let remaining = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line?.startsWith("#EXT-X-STREAM-INF")) {
			const uri = i + 1 < lines.length ? String(lines[i + 1] || "") : "";
			const hasUri = uri.trim() && !uri.trim().startsWith("#");
			const variantCodecs = _parseAttrs(line).CODECS;
			const variantCodecFamily = _getVideoCodecFamily(variantCodecs);
			const variantCodecIdentity = _getVideoCodecIdentity(variantCodecs);
			const variantMatches = Boolean(
				variantCodecFamily === requestedCodecFamily &&
					(!requiresExactCodecIdentity ||
						(requestedCodecIdentity &&
							variantCodecIdentity === requestedCodecIdentity)),
			);
			if (
				hasUri &&
				(variantCodecFamily ? !variantMatches : requireExplicitCodecFamily)
			) {
				removed++;
				i++;
				continue;
			}
			if (hasUri) remaining++;
		}
		kept.push(line);
	}
	if (removed === 0) return m3u8;
	if (info) {
		if (!info._LoggedWhitelistByType) {
			info._LoggedWhitelistByType = new Set();
		}
		const codecKey = requestedCodecIdentity || requestedCodecFamily;
		const logKey = `codec-filter:${codecKey}:${remaining > 0 ? "ready" : "empty"}`;
		if (!info._LoggedWhitelistByType.has(logKey)) {
			info._LoggedWhitelistByType.add(logKey);
			const requestedLabel = (
				requestedCodecIdentity || requestedCodecFamily
			).toUpperCase();
			_log(
				remaining === 0
					? `[Trace] Rejected backup master without an explicit ${requestedLabel} variant`
					: `[Trace] Restricted backup master to the active ${requestedLabel} video codec`,
				remaining > 0 ? "info" : "warning",
			);
		}
	}
	if (
		(requireExplicitCodecFamily && matchingVariants === 0) ||
		remaining === 0
	) {
		return null;
	}
	return kept.join("\n");
}

function _resolvePreferredBackupResolution(info, floorHeight = 360) {
	const resolutionList = Array.isArray(info?.ResolutionList)
		? info.ResolutionList.filter(Boolean)
		: [];
	if (resolutionList.length === 0) {
		return null;
	}
	const preferredQualityGroup =
		typeof __TTVAB_STATE__ !== "undefined"
			? __TTVAB_STATE__?.PreferredQualityGroup
			: null;
	let target = _degradeToDecodableResolution(
		info,
		_getResolutionByQualityGroup(resolutionList, preferredQualityGroup),
		resolutionList,
	);
	if (!target) {
		const sustained = _degradeToDecodableResolution(
			info,
			info?.SustainedNativeResolution,
			resolutionList,
		);
		const [, sh] = String(sustained?.Resolution || "0x0")
			.split("x")
			.map(Number);
		if (Number.isFinite(sh) && sh > 0) {
			target = sustained;
		}
	}
	if (!target) {
		return null;
	}
	return _applyBackupResolutionFloor(target, resolutionList, floorHeight);
}
