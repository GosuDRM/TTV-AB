// TTV AB - Parser

const _ATTR_REGEX = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;

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

function _getServerTime(m3u8) {
    if (__TTVAB_STATE__.V2API) {
        const match = m3u8.match(/#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="([^"]+)"/);
        return match?.[1] ?? null;
    }
    const match = m3u8.match(/SERVER-TIME="([0-9.]+)"/);
    return match?.[1] ?? null;
}

function _replaceServerTime(m3u8, time) {
    if (!time) return m3u8;
    if (__TTVAB_STATE__.V2API) {
        return m3u8.replace(/(#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE=")[^"]+(")/, `$1${time}$2`);
    }
    return m3u8.replace(/(SERVER-TIME=")[0-9.]+(")/, `$1${time}$2`);
}

function _stripAds(text, stripAll, info) {
    const lines = text.split('\n');
    const len = lines.length;
    const adUrl = 'https://twitch.tv';
    let stripped = false;
    let i = 0;
    const strippedSegments = [];
    const MAX_RECOVERY_SEGMENTS = 3;

    const hasAdSignifier = text.includes(__TTVAB_STATE__.AdSignifier);

    if (hasAdSignifier || stripAll || __TTVAB_STATE__.AllSegmentsAreAdSegments) {
        for (i = 0; i < len; i++) {
            if (lines[i] && lines[i].startsWith('#EXT-X-TWITCH-PREFETCH:')) {
                const prefetchUrl = lines[i].substring('#EXT-X-TWITCH-PREFETCH:'.length).trim();
                const isAdPrefetch = __TTVAB_STATE__.AdSegmentCache.has(prefetchUrl) ||
                    prefetchUrl.includes('stitched-ad') ||
                    prefetchUrl.includes('/adsquared/');
                if (isAdPrefetch) {
                    lines[i] = '';
                }
            }
        }
    }

    let adSegmentCount = 0;
    let _liveSegmentCount = 0;

    for (i = 0; i < len - 1; i++) {
        const line = lines[i];
        if (line.startsWith('#EXTINF')) {
            const segmentUrl = lines[i + 1];
            const isProcessing = segmentUrl && (segmentUrl.includes('processing') || segmentUrl.includes('/_404/'));
            if (!line.includes(',live') || isProcessing) {
                adSegmentCount++;
            } else {
                _liveSegmentCount++;
            }
        }
    }

    const shouldStrip = (hasAdSignifier || stripAll || __TTVAB_STATE__.AllSegmentsAreAdSegments) && adSegmentCount > 0;

    for (i = 0; i < len; i++) {
        let line = lines[i];

        if (line.includes('X-TV-TWITCH-AD')) {
            line = line
                .replace(/X-TV-TWITCH-AD-URL="[^"]*"/, `X-TV-TWITCH-AD-URL="${adUrl}"`)
                .replace(/X-TV-TWITCH-AD-CLICK-TRACKING-URL="[^"]*"/, `X-TV-TWITCH-AD-CLICK-TRACKING-URL="${adUrl}"`);
            lines[i] = line;
        }

        const isAdSegment = !line.includes(',live') || (i < len - 1 && (lines[i + 1].includes('processing') || lines[i + 1].includes('/_404/')));

        if (shouldStrip && i < len - 1 && line.startsWith('#EXTINF') && isAdSegment) {
            const segmentUrl = lines[i + 1];

            strippedSegments.push({ extinf: lines[i], url: segmentUrl });
            if (strippedSegments.length > MAX_RECOVERY_SEGMENTS) {
                strippedSegments.shift();
            }

            if (segmentUrl && !info.RequestedAds.has(segmentUrl) && !info.IsMidroll) {
                info.RequestedAds.add(segmentUrl);
                fetch(segmentUrl).then(r => r.blob()).catch(() => { });
            }

            if (!__TTVAB_STATE__.AdSegmentCache.has(segmentUrl)) info.NumStrippedAdSegments++;
            __TTVAB_STATE__.AdSegmentCache.set(segmentUrl, Date.now());
            stripped = true;
            lines[i] = '';
            lines[i + 1] = '';
            i++;
        }

        if (line.includes(__TTVAB_STATE__.AdSignifier)) stripped = true;
    }

    if (!stripped) {
        info.NumStrippedAdSegments = 0;
    }

    info.IsStrippingAdSegments = stripped;

    const now = Date.now();
    if (!globalThis._lastAdCachePrune || now - globalThis._lastAdCachePrune > 60000) {
        globalThis._lastAdCachePrune = now;
        const cutoff = now - 120000;
        __TTVAB_STATE__.AdSegmentCache.forEach((v, k) => { if (v < cutoff) __TTVAB_STATE__.AdSegmentCache.delete(k); });
    }

    const result = lines.filter(l => l !== '');

    const hasRemainingSegments = result.some(l => l.startsWith('#EXTINF'));
    if (!hasRemainingSegments && strippedSegments.length > 0) {
        _log(`[Recovery] Empty playlist - restoring ${strippedSegments.length} segment(s)`, 'warning');
        for (const seg of strippedSegments) {
            result.push(seg.extinf);
            result.push(seg.url);
        }
    }

    return result.join('\n');
}

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
