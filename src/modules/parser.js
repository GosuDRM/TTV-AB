/**
 * TTV AB - Parser Module
 * M3U8 playlist parsing and manipulation
 * @private
 */
function _parseAttrs(str) {
    const r = {};
    const rx = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
    let m;
    while ((m = rx.exec(str)) !== null) {
        let v = m[2];
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        r[m[1].toUpperCase()] = v;
    }
    return r;
}

function _getServerTime(m3u8) {
    if (V2API) {
        const m = m3u8.match(/#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="([^"]+)"/);
        return m && m.length > 1 ? m[1] : null;
    }
    const m = m3u8.match('SERVER-TIME="([0-9.]+)"');
    return m && m.length > 1 ? m[1] : null;
}

function _replaceServerTime(m3u8, time) {
    if (!time) return m3u8;
    if (V2API) {
        return m3u8.replace(/(#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE=")[^"]+(")/, `$1${time}$2`);
    }
    return m3u8.replace(new RegExp('(SERVER-TIME=")[0-9.]+"'), `SERVER-TIME="${time}"`);
}

function _stripAds(text, stripAll, info) {
    let stripped = false;
    const lines = text.replaceAll('\r', '').split('\n');
    const adUrl = 'https://twitch.tv';

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        line = line
            .replaceAll(/(X-TV-TWITCH-AD-URL=")(?:[^"]*)(")/, `$1${adUrl}$2`)
            .replaceAll(/(X-TV-TWITCH-AD-CLICK-TRACKING-URL=")(?:[^"]*)(")/, `$1${adUrl}$2`);
        lines[i] = line;

        if (i < lines.length - 1 && line.startsWith('#EXTINF') && (!line.includes(',live') || stripAll || AllSegmentsAreAdSegments)) {
            const url = lines[i + 1];
            if (!AdSegmentCache.has(url)) info.NumStrippedAdSegments++;
            AdSegmentCache.set(url, Date.now());
            stripped = true;
        }
        if (line.includes(AdSignifier)) stripped = true;
    }

    if (stripped) {
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('#EXT-X-TWITCH-PREFETCH:')) lines[i] = '';
        }
    } else {
        info.NumStrippedAdSegments = 0;
    }

    info.IsStrippingAdSegments = stripped;
    AdSegmentCache.forEach((v, k, m) => { if (v < Date.now() - 120000) m.delete(k); });
    return lines.join('\n');
}

function _getStreamUrl(m3u8, res) {
    const lines = m3u8.replaceAll('\r', '').split('\n');
    const [tw, th] = res.Resolution.split('x').map(Number);
    let matchUrl = null, matchFps = false, closeUrl = null, closeDiff = Infinity;

    for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].startsWith('#EXT-X-STREAM-INF') && lines[i + 1].includes('.m3u8')) {
            const a = _parseAttrs(lines[i]);
            const r = a['RESOLUTION'], f = a['FRAME-RATE'];
            if (r) {
                if (r == res.Resolution && (!matchUrl || (!matchFps && f == res.FrameRate))) {
                    matchUrl = lines[i + 1];
                    matchFps = f == res.FrameRate;
                    if (matchFps) return matchUrl;
                }
                const [w, h] = r.split('x').map(Number);
                const d = Math.abs((w * h) - (tw * th));
                if (d < closeDiff) { closeUrl = lines[i + 1]; closeDiff = d; }
            }
        }
    }
    return matchUrl || closeUrl;
}
