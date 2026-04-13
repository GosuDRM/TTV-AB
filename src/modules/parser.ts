// TTV AB - Parser

const _ATTR_REGEX = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
const _RESERVED_ROUTE_SEGMENTS = new Set([
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
			VodID: segments[1] || null,
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

	const vodMatch = pathname.match(/\/(?:api\/v2\/)?vod\/(\d+)\.m3u8$/i);
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
		if (value[0] === '"' && value[value.length - 1] === '"') {
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

function _isExplicitKnownAdSegmentUrl(segmentUrl) {
	const url = String(segmentUrl || "");
	if (!url) return false;
	return (
		url.includes(__TTVAB_STATE__.AdSignifier) ||
		url.includes("stitched") ||
		url.includes("stitched-ad") ||
		url.includes("/adsquared/") ||
		url.includes("processing") ||
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

function _playlistHasKnownAdSegments(
	text,
	options: { includeCached?: boolean } = {},
) {
	if (typeof text !== "string" || !text) return false;
	const lines = text.split("\n");
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (
			line?.startsWith("#EXTINF") &&
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

function _absolutizePlaylistUrl(rawUrl, baseUrl = null) {
	const candidate = typeof rawUrl === "string" ? rawUrl.trim() : "";
	if (!candidate || !baseUrl || candidate.startsWith("#")) {
		return candidate || rawUrl;
	}
	try {
		return new URL(candidate, baseUrl).href;
	} catch {
		return rawUrl;
	}
}

function _absolutizeMediaPlaylistUrls(text, baseUrl = null) {
	if (
		typeof text !== "string" ||
		!text ||
		!baseUrl ||
		(!text.includes("#EXTINF") &&
			!text.includes('#EXT-X-MAP:') &&
			!text.includes('#EXT-X-KEY:') &&
			!text.includes('URI="'))
	) {
		return text;
	}

	return text
		.split("\n")
		.map((line) => {
			if (typeof line !== "string" || !line) return line;
			if (!line.startsWith("#")) {
				return _absolutizePlaylistUrl(line, baseUrl);
			}
			if (line.startsWith("#EXT-X-TWITCH-PREFETCH:")) {
				const prefetchUrl = line
					.substring("#EXT-X-TWITCH-PREFETCH:".length)
					.trim();
				const normalizedPrefetch = _absolutizePlaylistUrl(prefetchUrl, baseUrl);
				return `#EXT-X-TWITCH-PREFETCH:${normalizedPrefetch}`;
			}
			if (!line.includes('URI="')) {
				return line;
			}
			return line.replace(/URI="([^"]+)"/g, (_match, value) => {
				const normalizedValue = _absolutizePlaylistUrl(value, baseUrl);
				return `URI="${normalizedValue}"`;
			});
		})
		.join("\n");
}

function _stripAds(text, stripAll, info) {
	const lines = text.split("\n");
	const len = lines.length;
	const adUrl = "https://twitch.tv";
	let stripped = false;
	let i = 0;
	const strippedSegments = [];
	let strippedMediaEntryCount = 0;

	const hasExplicitAdMetadata = _hasExplicitAdMetadata(text);
	const hasKnownAdSegments = _playlistHasKnownAdSegments(text);
	const forceStripAllSegments =
		stripAll ||
		__TTVAB_STATE__.AllSegmentsAreAdSegments ||
		(hasExplicitAdMetadata && !hasKnownAdSegments);
	const maxRecoverySegments = forceStripAllSegments ? len : 6;

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
				const isAdPrefetch = _isKnownAdSegmentUrl(prefetchUrl);
				if (isAdPrefetch) {
					lines[i] = "";
				}
			}
		}
	}

	let adSegmentCount = 0;
	let _liveSegmentCount = 0;

	for (i = 0; i < len; i++) {
		const line = lines[i];
		if (line?.startsWith("#EXTINF")) {
			const segmentUrl = lines[i + 1];
			const isAdSegment =
				forceStripAllSegments || _isKnownAdSegmentUrl(segmentUrl);
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
				forceStripAllSegments || _isKnownAdSegmentUrl(lines[i + 1]);

			if (isAdSegment) {
				const segmentUrl = lines[i + 1];

				strippedSegments.push({ extinf: lines[i], url: segmentUrl });
				if (strippedSegments.length > maxRecoverySegments) {
					strippedSegments.shift();
				}

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

		if (shouldStrip && (_isMediaPartLine(line) || _isPartPreloadHintLine(line))) {
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

		if (_hasExplicitAdMetadata(line)) stripped = true;
	}

	if (!stripped) {
		info.NumStrippedAdSegments = 0;
	} else {
		for (i = 0; i < len; i++) {
			if (lines[i]?.startsWith("#EXT-X-TWITCH-PREFETCH:")) {
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
		__TTVAB_STATE__.AdSegmentCache.forEach((v, k) => {
			if (v < cutoff) __TTVAB_STATE__.AdSegmentCache.delete(k);
		});
	}

	const result = lines.filter((l) => l !== "");

	const hasRemainingSegments = result.some(
		(l) => l?.startsWith("#EXTINF") || l?.startsWith("#EXT-X-PART:"),
	);
	if (!hasRemainingSegments && strippedMediaEntryCount > 0) {
		const recoveryCandidates = [
			{
				label: info?.LastCleanBackupPlayerType
					? `last clean backup (${info.LastCleanBackupPlayerType})`
					: "last clean backup",
				m3u8:
					typeof info?.LastCleanBackupM3U8 === "string"
						? info.LastCleanBackupM3U8
						: null,
				at: Number(info?.LastCleanBackupAt) || 0,
				maxAgeMs: 8000,
			},
			{
				label: "last clean native playlist",
				m3u8:
					typeof info?.LastCleanNativeM3U8 === "string"
						? info.LastCleanNativeM3U8
						: null,
				at: Number(info?.LastCleanNativePlaylistAt) || 0,
				maxAgeMs: 1500,
			},
		];
		const now = Date.now();
		const recoverySource = recoveryCandidates.find((candidate) => {
			if (typeof candidate.m3u8 !== "string" || !candidate.m3u8) return false;
			const hasFullSegments = candidate.m3u8.includes("#EXTINF");
			const hasPartSegments = candidate.m3u8.includes("#EXT-X-PART:");
			if (
				(!hasFullSegments && !hasPartSegments) ||
				_hasExplicitAdMetadata(candidate.m3u8) ||
				_playlistHasKnownAdSegments(candidate.m3u8)
			) {
				return false;
			}
			const maxRecoveryAgeMs = hasFullSegments
				? candidate.maxAgeMs
				: Math.min(candidate.maxAgeMs, 1500);
			return candidate.at > 0 && now - candidate.at <= maxRecoveryAgeMs;
		});

		if (recoverySource?.m3u8) {
			_log(
				`[Recovery] Empty playlist - reusing ${recoverySource.label}`,
				"warning",
			);
			return recoverySource.m3u8;
		}

		_log(
			"[Recovery] Empty playlist after stripping ads; refusing to restore ad segments",
			"warning",
		);
	}

	return result.join("\n");
}

function _getStreamVariantInfo(attrs, rawUrl, variantUrl) {
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
	let matchUrl = null;
	let matchFps = false;
	let closeUrl = null;
	let closeDiff = Infinity;
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
			nextLine.startsWith("#") ||
			(!nextLine.includes(".m3u8") && !nextLine.includes("://")) ||
			nextLine.includes("processing")
		)
			continue;

		if (!firstUrl) {
			firstUrl = resolveUrl(lines[i + 1]);
		}

		const attrs = _parseAttrs(line);
		const resolution = attrs.RESOLUTION;
		const frameRate = attrs["FRAME-RATE"];
		const variantName = String(attrs.VIDEO || "").trim().toLowerCase();
		const parsedFrameRate = Number.parseFloat(String(frameRate ?? ""));
		const matchesFrameRate =
			Number.isFinite(targetFrameRate) && Number.isFinite(parsedFrameRate)
				? Math.abs(parsedFrameRate - targetFrameRate) < 0.01
				: String(frameRate || "") === String(res?.FrameRate || "");

		if (targetName && variantName === targetName) {
			return resolveUrl(lines[i + 1]);
		}

		if (!resolution) continue;

		if (resolution === res.Resolution) {
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
		const safeTargetPixels = Number.isFinite(targetPixels) ? targetPixels : 0;
		const diff = Math.abs(area - safeTargetPixels);
		if (diff < closeDiff) {
			closeUrl = resolveUrl(lines[i + 1]);
			closeDiff = diff;
		}
	}

	return matchUrl || closeUrl || firstUrl;
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

	return [...resolutionList].sort((a, b) => {
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
	})[0] || null;
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
	const preferredResolution = _getResolutionByQualityGroup(
		resolutionList,
		preferredQualityGroup,
	);
	if (preferredResolution) return preferredResolution;

	return _getSortedResolutionList(resolutionList)[0];
}
