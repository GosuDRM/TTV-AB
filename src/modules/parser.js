/**
 * TTV AB - Parser Module
 * M3U8 playlist parsing and manipulation
 * @module parser
 * @private
 */

/** @type {RegExp} Attribute parsing regex (cached for performance) */
const _ATTR_REGEX = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;

/**
 * Parse M3U8 attributes into an object
 * @param {string} str - Attribute string
 * @returns {Object} Parsed attributes
 */
function _parseAttrs(str) {
    const result = Object.create(null);
    let match;
    _ATTR_REGEX.lastIndex = 0;
    while ((match = _ATTR_REGEX.exec(str)) !== null) {
        let value = match[2];
        if (value[0] === '"' && value[value.length - 1] === '"') {
            value = value.slice(1, -1);
        }
        result[match[1].toUpperCase()] = value;
    }
    return result;
}

/**
 * Extract server time from M3U8 playlist
 * @param {string} m3u8 - Playlist content
 * @returns {string|null} Server time or null
 */
function _getServerTime(m3u8) {
    if (__TTVAB_STATE__.V2API) {
        const match = m3u8.match(/#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="([^"]+)"/);
        return match?.[1] ?? null;
    }
    const match = m3u8.match(/SERVER-TIME="([0-9.]+)"/);
    return match?.[1] ?? null;
}

/**
 * Replace server time in M3U8 playlist
 * @param {string} m3u8 - Playlist content
 * @param {string} time - New server time
 * @returns {string} Modified playlist
 */
function _replaceServerTime(m3u8, time) {
    if (!time) return m3u8;
    if (__TTVAB_STATE__.V2API) {
        return m3u8.replace(/(#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE=")[^"]+(")/, `$1${time}$2`);
    }
    return m3u8.replace(/(SERVER-TIME=")[0-9.]+(")/, `$1${time}$2`);
}

/**
 * Strip ad segments from M3U8 playlist
 * @param {string} text - Playlist content
 * @param {boolean} stripAll - Strip all segments
 * @param {Object} info - Stream info object
 * @returns {string} Cleaned playlist
 */
function _stripAds(text, stripAll, info) {
    const lines = text.split('\n');
    const len = lines.length;
    const adUrl = 'https://twitch.tv';
    let stripped = false;
    let i = 0;

    // Remove prefetch entries FIRST before any stripping
    const hasAdSignifier = text.includes(__TTVAB_STATE__.AdSignifier);
    if (hasAdSignifier || stripAll || __TTVAB_STATE__.AllSegmentsAreAdSegments) {
        for (i = 0; i < len; i++) {
            if (lines[i] && lines[i].startsWith('#EXT-X-TWITCH-PREFETCH:')) {
                lines[i] = '';
            }
        }
    }

    // First pass: Count ad segments to determine stripping strategy
    let adSegmentCount = 0;

    for (i = 0; i < len - 1; i++) {
        const line = lines[i];
        if (line.startsWith('#EXTINF') && !line.includes(',live')) {
            adSegmentCount++;
        }
    }

    // Strip ads even if all are ads - player will buffer briefly but no ads play
    // The brief buffering is preferable to showing ads
    const shouldStrip = (hasAdSignifier || stripAll || __TTVAB_STATE__.AllSegmentsAreAdSegments) && adSegmentCount > 0;

    for (i = 0; i < len; i++) {
        let line = lines[i];

        // Replace ad tracking URLs
        if (line.includes('X-TV-TWITCH-AD')) {
            line = line
                .replace(/X-TV-TWITCH-AD-URL="[^"]*"/, `X-TV-TWITCH-AD-URL="${adUrl}"`)
                .replace(/X-TV-TWITCH-AD-CLICK-TRACKING-URL="[^"]*"/, `X-TV-TWITCH-AD-CLICK-TRACKING-URL="${adUrl}"`);
            lines[i] = line;
        }

        // Strip ad segments
        const isAdSegment = !line.includes(',live');

        if (shouldStrip && i < len - 1 && line.startsWith('#EXTINF') && isAdSegment) {
            const segmentUrl = lines[i + 1];

            // Pre-fetch ad segment to "consume" it faster
            // This helps clear ad slots from Twitch's side, making backup streams cleaner
            if (segmentUrl && !info.RequestedAds.has(segmentUrl) && !info.IsMidroll) {
                info.RequestedAds.add(segmentUrl);
                // Fire-and-forget fetch to consume the ad slot
                fetch(segmentUrl).then(r => r.blob()).catch(() => { });
            }

            if (!__TTVAB_STATE__.AdSegmentCache.has(segmentUrl)) info.NumStrippedAdSegments++;
            __TTVAB_STATE__.AdSegmentCache.set(segmentUrl, Date.now());
            stripped = true;

            // Wipe lines from manifest
            lines[i] = '';      // Remove #EXTINF
            lines[i + 1] = '';  // Remove URL
            i++;
        }

        if (line.includes(__TTVAB_STATE__.AdSignifier)) stripped = true;
    }

    if (!stripped) {
        info.NumStrippedAdSegments = 0;
    }

    info.IsStrippingAdSegments = stripped;

    // Cleanup old cache entries (older than 2 minutes) - run max once per 60s
    // Use global throttle to prevent race conditions when Info object is recreated
    const now = Date.now();
    if (!globalThis._lastAdCachePrune || now - globalThis._lastAdCachePrune > 60000) {
        globalThis._lastAdCachePrune = now;
        const cutoff = now - 120000;
        __TTVAB_STATE__.AdSegmentCache.forEach((v, k) => { if (v < cutoff) __TTVAB_STATE__.AdSegmentCache.delete(k); });
    }

    // Filter out empty lines to finalize splicing
    return lines.filter(l => l !== '').join('\n');
}

/**
 * Find matching stream URL for resolution
 * @param {string} m3u8 - Master playlist
 * @param {Object} res - Target resolution info
 * @returns {string|null} Matching URL or closest match
 */
function _getStreamUrl(m3u8, res) {
    const lines = m3u8.split('\n');
    const len = lines.length;
    const [tw, th] = res.Resolution.split('x').map(Number);
    const targetPixels = tw * th;
    let matchUrl = null;
    let matchFps = false;
    let closeUrl = null;
    let closeDiff = Infinity;

    for (let i = 0; i < len - 1; i++) {
        const line = lines[i];
        if (!line.startsWith('#EXT-X-STREAM-INF') || !lines[i + 1].includes('.m3u8') || lines[i + 1].includes('processing')) continue;

        const attrs = _parseAttrs(line);
        const resolution = attrs.RESOLUTION;
        const frameRate = attrs['FRAME-RATE'];

        if (!resolution) continue;

        if (resolution === res.Resolution) {
            if (!matchUrl || (!matchFps && frameRate === res.FrameRate)) {
                matchUrl = lines[i + 1];
                matchFps = frameRate === res.FrameRate;
                if (matchFps) return matchUrl;
            }
        }

        const [w, h] = resolution.split('x').map(Number);
        const diff = Math.abs((w * h) - targetPixels);
        if (diff < closeDiff) {
            closeUrl = lines[i + 1];
            closeDiff = diff;
        }
    }

    return matchUrl || closeUrl;
}
