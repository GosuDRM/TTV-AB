// TTV AB - Parser

const _ATTR_REGEX = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;

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
		(text.includes(__TTVAB_STATE__.AdSignifier) ||
			text.includes("X-TV-TWITCH-AD") ||
			text.includes("stitched-ad") ||
			text.includes("/adsquared/") ||
			text.includes("SCTE35-OUT") ||
			text.includes("MIDROLL") ||
			text.includes("midroll"))
	);
}

function _isKnownAdSegmentUrl(segmentUrl) {
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

function _playlistHasKnownAdSegments(text) {
	if (typeof text !== "string" || !text) return false;
	const lines = text.split("\n");
	for (let index = 0; index < lines.length - 1; index++) {
		if (
			lines[index]?.startsWith("#EXTINF") &&
			_isKnownAdSegmentUrl(lines[index + 1])
		) {
			return true;
		}
	}
	return false;
}

function _stripAds(text, stripAll, info) {
	const lines = text.split("\n");
	const len = lines.length;
	const adUrl = "https://twitch.tv";
	let stripped = false;
	let i = 0;
	const strippedSegments = [];
	const MAX_RECOVERY_SEGMENTS = 6;

	const hasExplicitAdMetadata = _hasExplicitAdMetadata(text);
	const hasKnownAdSegments = _playlistHasKnownAdSegments(text);
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
				const isAdPrefetch = _isKnownAdSegmentUrl(prefetchUrl);
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
				forceStripAllSegments || _isKnownAdSegmentUrl(segmentUrl);
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
		_log(
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

function _getStreamUrl(m3u8, res, baseUrl = null) {
	const lines = m3u8.split("\n");
	const len = lines.length;
	const [tw, th] = res.Resolution.split("x").map(Number);
	const targetPixels = tw * th;
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

		const attrs = _parseAttrs(line);
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

		const [w, h] = resolution.split("x").map(Number);
		const diff = Math.abs(w * h - targetPixels);
		if (diff < closeDiff) {
			closeUrl = resolveUrl(lines[i + 1]);
			closeDiff = diff;
		}
	}

	return matchUrl || closeUrl;
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

	return [...resolutionList].sort((a, b) => {
		const [aw, ah] = String(a?.Resolution || "0x0")
			.split("x")
			.map(Number);
		const [bw, bh] = String(b?.Resolution || "0x0")
			.split("x")
			.map(Number);
		return bw * bh - aw * ah;
	})[0];
}
