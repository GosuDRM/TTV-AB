/**
 * TTV AB - Content Script
 * Blocks ads on Twitch.tv live streams by intercepting
 * HLS playlists and stripping ad segments.
 * 
 * @author GosuDRM
 * @version 3.0.4
 * @license MIT
 * @see https://github.com/GosuDRM/TTV-AB
 * @generated DO NOT EDIT - Built from src/modules/
 */
(function() {
    'use strict';

    // ═══════════════════════════════════════════════════
    // MODULE: CONSTANTS
    // ═══════════════════════════════════════════════════

    /**
     * TTV AB - Constants Module
     * Core configuration and version info
     * @private
     */
    const _C = {
        VERSION: '3.0.4',
        INTERNAL_VERSION: 19,
        LOG_STYLES: {
            prefix: 'background: linear-gradient(135deg, #9146FF, #772CE8); color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
            info: 'color: #9146FF; font-weight: 500;',
            success: 'color: #4CAF50; font-weight: 500;',
            warning: 'color: #FF9800; font-weight: 500;',
            error: 'color: #f44336; font-weight: 500;'
        },
        AD_SIGNIFIER: 'stitched',
        CLIENT_ID: 'kimne78kx3ncx6brgo4mv6wki5h1ko',
        PLAYER_TYPES: ['embed', 'site', 'autoplay', 'picture-by-picture-CACHED'],
        FALLBACK_TYPE: 'embed',
        FORCE_TYPE: 'site',
        RELOAD_TIME: 1500,
        CRASH_PATTERNS: ['Error #1000', 'Error #2000', 'Error #3000', 'Error #4000', 'Error #5000', 'network error', 'content is not available'],
        REFRESH_DELAY: 1500
    };
    

    // ═══════════════════════════════════════════════════
    // MODULE: STATE
    // ═══════════════════════════════════════════════════

    /**
     * TTV AB - State Module
     * Manages global state and worker references
     * @private
     */
    const _S = {
        workers: [],
        conflicts: ['twitch', 'isVariantA'],
        reinsertPatterns: ['isVariantA', 'besuper/', '${patch_url}'],
        adsBlocked: 0
    };
    
    function _declareState(scope) {
        scope.AdSignifier = _C.AD_SIGNIFIER;
        scope.ClientID = _C.CLIENT_ID;
        scope.BackupPlayerTypes = [..._C.PLAYER_TYPES];
        scope.FallbackPlayerType = _C.FALLBACK_TYPE;
        scope.ForceAccessTokenPlayerType = _C.FORCE_TYPE;
        scope.SkipPlayerReloadOnHevc = false;
        scope.AlwaysReloadPlayerOnAd = false;
        scope.PlayerReloadMinimalRequestsTime = _C.RELOAD_TIME;
        scope.PlayerReloadMinimalRequestsPlayerIndex = 0;
        scope.HasTriggeredPlayerReload = false;
        scope.StreamInfos = [];
        scope.StreamInfosByUrl = [];
        scope.GQLDeviceID = null;
        scope.ClientVersion = null;
        scope.ClientSession = null;
        scope.ClientIntegrityHeader = null;
        scope.AuthorizationHeader = undefined;
        scope.SimulatedAdsDepth = 0;
        scope.V2API = false;
        scope.IsAdStrippingEnabled = true;
        scope.AdSegmentCache = new Map();
        scope.AllSegmentsAreAdSegments = false;
    }
    
    function _incrementAdsBlocked() {
        _S.adsBlocked++;
        // Dispatch event for real-time updates
        window.dispatchEvent(new CustomEvent('ttvab-ad-blocked', { detail: { count: _S.adsBlocked } }));
    }
    

    // ═══════════════════════════════════════════════════
    // MODULE: LOGGER
    // ═══════════════════════════════════════════════════

    /**
     * TTV AB - Logger Module
     * Styled console output
     * @private
     */
    function _log(msg, type = 'info') {
        const s = _C.LOG_STYLES[type] || _C.LOG_STYLES.info;
        console.log('%cTTV AB%c ' + msg, _C.LOG_STYLES.prefix, s);
    }
    

    // ═══════════════════════════════════════════════════
    // MODULE: PARSER
    // ═══════════════════════════════════════════════════

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
    

    // ═══════════════════════════════════════════════════
    // MODULE: API
    // ═══════════════════════════════════════════════════

    /**
     * TTV AB - API Module
     * Twitch GraphQL API interactions
     * @private
     */
    async function _gqlReq(body) {
        const h = { 'Client-Id': ClientID, 'Content-Type': 'application/json' };
        if (GQLDeviceID) h['X-Device-Id'] = GQLDeviceID;
        if (ClientVersion) h['Client-Version'] = ClientVersion;
        if (ClientSession) h['Client-Session-Id'] = ClientSession;
        if (ClientIntegrityHeader) h['Client-Integrity'] = ClientIntegrityHeader;
        if (AuthorizationHeader) h['Authorization'] = AuthorizationHeader;
        return fetch('https://gql.twitch.tv/gql', { method: 'POST', headers: h, body: JSON.stringify(body) });
    }
    
    async function _getToken(channel, type) {
        return _gqlReq({
            operationName: 'PlaybackAccessToken_Template',
            query: 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) { streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) { value signature __typename } videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) { value signature __typename }}',
            variables: { isLive: true, login: channel, isVod: false, vodID: '', playerType: type }
        });
    }
    

    // ═══════════════════════════════════════════════════
    // MODULE: PROCESSOR
    // ═══════════════════════════════════════════════════

    /**
     * TTV AB - Processor Module
     * M3U8 stream processing and ad replacement
     * @private
     */
    async function _processM3U8(url, text, realFetch) {
        if (!IsAdStrippingEnabled) return text;
        const info = StreamInfosByUrl[url];
        if (!info) return text;
    
        if (HasTriggeredPlayerReload) {
            HasTriggeredPlayerReload = false;
            info.LastPlayerReload = Date.now();
        }
    
        const hasAds = text.includes(AdSignifier) || SimulatedAdsDepth > 0;
    
        if (hasAds) {
            info.IsMidroll = text.includes('"MIDROLL"') || text.includes('"midroll"');
            if (!info.IsShowingAd) {
                info.IsShowingAd = true;
                _log('Ad detected, blocking...', 'warning');
                _incrementAdsBlocked(); // Increment counter
            }
    
            if (!info.IsMidroll) {
                const lines = text.replaceAll('\r', '').split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].startsWith('#EXTINF') && lines.length > i + 1) {
                        if (!lines[i].includes(',live') && !info.RequestedAds.has(lines[i + 1])) {
                            info.RequestedAds.add(lines[i + 1]);
                            fetch(lines[i + 1]).then(r => r.blob()).catch(() => { });
                            break;
                        }
                    }
                }
            }
    
            const res = info.Urls[url];
            if (!res) { _log('Missing resolution info for ' + url, 'warning'); return text; }
    
            const isHevc = res.Codecs.startsWith('hev') || res.Codecs.startsWith('hvc');
            if (((isHevc && !SkipPlayerReloadOnHevc) || AlwaysReloadPlayerOnAd) && info.ModifiedM3U8 && !info.IsUsingModifiedM3U8) {
                info.IsUsingModifiedM3U8 = true;
                info.LastPlayerReload = Date.now();
            }
    
            let backupType = null, backupM3u8 = null, fallbackM3u8 = null;
            let startIdx = 0, minimal = false;
    
            if (info.LastPlayerReload > Date.now() - PlayerReloadMinimalRequestsTime) {
                startIdx = PlayerReloadMinimalRequestsPlayerIndex;
                minimal = true;
            }
    
            for (let pi = startIdx; !backupM3u8 && pi < BackupPlayerTypes.length; pi++) {
                const pt = BackupPlayerTypes[pi];
                const realPt = pt.replace('-CACHED', '');
                const cached = pt != realPt;
    
                for (let j = 0; j < 2; j++) {
                    let fresh = false;
                    let enc = info.BackupEncodingsM3U8Cache[pt];
    
                    if (!enc) {
                        fresh = true;
                        try {
                            const tokenRes = await _getToken(info.ChannelName, realPt);
                            if (tokenRes.status === 200) {
                                const token = await tokenRes.json();
                                if (token?.data?.streamPlaybackAccessToken?.signature) {
                                    const u = new URL('https://usher.ttvnw.net/api/' + (V2API ? 'v2/' : '') + 'channel/hls/' + info.ChannelName + '.m3u8' + info.UsherParams);
                                    u.searchParams.set('sig', token.data.streamPlaybackAccessToken.signature);
                                    u.searchParams.set('token', token.data.streamPlaybackAccessToken.value);
                                    const encRes = await realFetch(u.href);
                                    if (encRes.status === 200) enc = info.BackupEncodingsM3U8Cache[pt] = await encRes.text();
                                }
                            }
                        } catch (e) { _log('Error getting backup: ' + e.message, 'error'); }
                    }
    
                    if (enc) {
                        try {
                            const streamUrl = _getStreamUrl(enc, res);
                            const streamRes = await realFetch(streamUrl);
                            if (streamRes.status == 200) {
                                const m3u8 = await streamRes.text();
                                if (m3u8) {
                                    if (pt == FallbackPlayerType) fallbackM3u8 = m3u8;
                                    if ((!m3u8.includes(AdSignifier) && (SimulatedAdsDepth == 0 || pi >= SimulatedAdsDepth - 1)) || (!fallbackM3u8 && pi >= BackupPlayerTypes.length - 1)) {
                                        backupType = pt; backupM3u8 = m3u8; break;
                                    }
                                    if (cached) break;
                                    if (minimal) { backupType = pt; backupM3u8 = m3u8; break; }
                                }
                            }
                        } catch (e) { }
                    }
    
                    info.BackupEncodingsM3U8Cache[pt] = null;
                    if (fresh) break;
                }
            }
    
            if (!backupM3u8 && fallbackM3u8) { backupType = FallbackPlayerType; backupM3u8 = fallbackM3u8; }
            if (backupM3u8) text = backupM3u8;
    
            if (info.ActiveBackupPlayerType != backupType) {
                info.ActiveBackupPlayerType = backupType;
                _log('Using backup player type: ' + backupType, 'info');
            }
    
            text = _stripAds(text, false, info);
        } else {
            if (info.IsShowingAd) {
                info.IsShowingAd = false;
                info.IsUsingModifiedM3U8 = false;
                info.RequestedAds.clear();
                info.BackupEncodingsM3U8Cache = [];
                info.ActiveBackupPlayerType = null;
                _log('Ad ended', 'success');
            }
        }
    
        return text;
    }
    

    // ═══════════════════════════════════════════════════
    // MODULE: WORKER
    // ═══════════════════════════════════════════════════

    /**
     * TTV AB - Worker Module
     * Web Worker management and prototype manipulation
     * @private
     */
    function _getWasmJs(url) {
        const x = new XMLHttpRequest();
        x.open('GET', url, false);
        x.overrideMimeType("text/javascript");
        x.send();
        return x.responseText;
    }
    
    function _cleanWorker(w) {
        let root = null, parent = null, proto = w;
        while (proto) {
            const s = proto.toString();
            if (_S.conflicts.some(x => s.includes(x))) {
                if (parent !== null) Object.setPrototypeOf(parent, Object.getPrototypeOf(proto));
            } else {
                if (root === null) root = proto;
                parent = proto;
            }
            proto = Object.getPrototypeOf(proto);
        }
        return root;
    }
    
    function _getReinsert(w) {
        const r = [];
        let p = w;
        while (p) {
            const s = p.toString();
            if (_S.reinsertPatterns.some(x => s.includes(x))) r.push(p);
            p = Object.getPrototypeOf(p);
        }
        return r;
    }
    
    function _reinsert(w, r) {
        let p = w;
        for (let i = 0; i < r.length; i++) { Object.setPrototypeOf(r[i], p); p = r[i]; }
        return p;
    }
    
    function _isValid(w) {
        const s = w.toString();
        return !_S.conflicts.some(x => s.includes(x)) || _S.reinsertPatterns.some(x => s.includes(x));
    }
    

    // ═══════════════════════════════════════════════════
    // MODULE: HOOKS
    // ═══════════════════════════════════════════════════

    /**
     * TTV AB - Hooks Module
     * Fetch and Worker interception
     * @private
     */
    function _hookWorkerFetch() {
        _log('Worker fetch hooked', 'info');
        const real = fetch;
        fetch = async function (url, opts) {
            if (typeof url === 'string') {
                if (AdSegmentCache.has(url)) {
                    return new Promise((res, rej) => {
                        real('data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292', opts)
                            .then(r => res(r)).catch(e => rej(e));
                    });
                }
    
                url = url.trimEnd();
                if (url.endsWith('m3u8')) {
                    return new Promise((res, rej) => {
                        const proc = async (r) => {
                            if (r.status === 200) res(new Response(await _processM3U8(url, await r.text(), real)));
                            else res(r);
                        };
                        real(url, opts).then(r => proc(r)).catch(e => rej(e));
                    });
                } else if (url.includes('/channel/hls/') && !url.includes('picture-by-picture')) {
                    V2API = url.includes('/api/v2/');
                    const ch = (new URL(url)).pathname.match(/([^\/]+)(?=\.\w+$)/)[0];
    
                    if (ForceAccessTokenPlayerType) {
                        const t = new URL(url);
                        t.searchParams.delete('parent_domains');
                        url = t.toString();
                    }
    
                    return new Promise((res, rej) => {
                        const proc = async (r) => {
                            if (r.status == 200) {
                                const enc = await r.text();
                                const time = _getServerTime(enc);
                                let info = StreamInfos[ch];
    
                                if (info != null && info.EncodingsM3U8 != null && (await real(info.EncodingsM3U8.match(/^https:.*\.m3u8$/m)[0])).status !== 200) {
                                    info = null;
                                }
    
                                if (info == null || info.EncodingsM3U8 == null) {
                                    StreamInfos[ch] = info = {
                                        ChannelName: ch, IsShowingAd: false, LastPlayerReload: 0,
                                        EncodingsM3U8: enc, ModifiedM3U8: null, IsUsingModifiedM3U8: false,
                                        UsherParams: (new URL(url)).search, RequestedAds: new Set(),
                                        Urls: [], ResolutionList: [], BackupEncodingsM3U8Cache: [],
                                        ActiveBackupPlayerType: null, IsMidroll: false,
                                        IsStrippingAdSegments: false, NumStrippedAdSegments: 0
                                    };
    
                                    const lines = enc.replaceAll('\r', '').split('\n');
                                    for (let i = 0; i < lines.length - 1; i++) {
                                        if (lines[i].startsWith('#EXT-X-STREAM-INF') && lines[i + 1].includes('.m3u8')) {
                                            const a = _parseAttrs(lines[i]);
                                            const rs = a['RESOLUTION'];
                                            if (rs) {
                                                const ri = { Resolution: rs, FrameRate: a['FRAME-RATE'], Codecs: a['CODECS'], Url: lines[i + 1] };
                                                info.Urls[lines[i + 1]] = ri;
                                                info.ResolutionList.push(ri);
                                            }
                                            StreamInfosByUrl[lines[i + 1]] = info;
                                        }
                                    }
                                    _log('Stream initialized: ' + ch, 'success');
                                }
    
                                info.LastPlayerReload = Date.now();
                                res(new Response(_replaceServerTime(info.IsUsingModifiedM3U8 ? info.ModifiedM3U8 : info.EncodingsM3U8, time)));
                            } else {
                                res(r);
                            }
                        };
                        real(url, opts).then(r => proc(r)).catch(e => rej(e));
                    });
                }
            }
            return real.apply(this, arguments);
        };
    }
    
    function _hookWorker() {
        const reins = _getReinsert(window.Worker);
        const W = class Worker extends _cleanWorker(window.Worker) {
            constructor(url, opts) {
                let tw = false;
                try { tw = new URL(url).origin.endsWith('.twitch.tv'); } catch { }
                if (!tw) { super(url, opts); return; }
    
                const blob = `
                    const _C = ${JSON.stringify(_C)};
                    const _S = ${JSON.stringify(_S)};
                    ${_log.toString()}
                    ${_declareState.toString()}
                    ${_parseAttrs.toString()}
                    ${_getServerTime.toString()}
                    ${_replaceServerTime.toString()}
                    ${_stripAds.toString()}
                    ${_getStreamUrl.toString()}
                    ${_gqlReq.toString()}
                    ${_getToken.toString()}
                    ${_processM3U8.toString()}
                    ${_getWasmJs.toString()}
                    ${_hookWorkerFetch.toString()}
                    
                    const ws = _getWasmJs('${url.replaceAll("'", "%27")}');
                    _declareState(self);
                    GQLDeviceID = ${GQLDeviceID ? "'" + GQLDeviceID + "'" : null};
                    AuthorizationHeader = ${AuthorizationHeader ? "'" + AuthorizationHeader + "'" : undefined};
                    ClientIntegrityHeader = ${ClientIntegrityHeader ? "'" + ClientIntegrityHeader + "'" : null};
                    ClientVersion = ${ClientVersion ? "'" + ClientVersion + "'" : null};
                    ClientSession = ${ClientSession ? "'" + ClientSession + "'" : null};
                    
                    self.addEventListener('message', function(e) {
                        if (e.data.key == 'UpdateClientVersion') ClientVersion = e.data.value;
                        else if (e.data.key == 'UpdateClientSession') ClientSession = e.data.value;
                        else if (e.data.key == 'UpdateClientId') ClientID = e.data.value;
                        else if (e.data.key == 'UpdateDeviceId') GQLDeviceID = e.data.value;
                        else if (e.data.key == 'UpdateClientIntegrityHeader') ClientIntegrityHeader = e.data.value;
                        else if (e.data.key == 'UpdateAuthorizationHeader') AuthorizationHeader = e.data.value;
                    });
                    
                    _hookWorkerFetch();
                    eval(ws);
                `;
    
                super(URL.createObjectURL(new Blob([blob])), opts);
                _S.workers.push(this);
            }
        };
    
        let inst = _reinsert(W, reins);
        Object.defineProperty(window, 'Worker', {
            get: () => inst,
            set: (v) => { if (_isValid(v)) inst = v; }
        });
    }
    
    function _hookStorage() {
        try {
            const orig = localStorage.getItem.bind(localStorage);
            localStorage.getItem = function (k) {
                const v = orig(k);
                if (k === 'unique_id' && v) GQLDeviceID = v;
                return v;
            };
            const id = orig('unique_id');
            if (id) GQLDeviceID = id;
        } catch (e) { }
    }
    
    function _hookMainFetch() {
        const real = window.fetch;
        window.fetch = async function (url, opts) {
            if (typeof url === 'string' || url instanceof URL) {
                const u = url.toString();
                if (u.includes('gql.twitch.tv/gql')) {
                    const r = await real.apply(this, arguments);
                    if (opts && opts.headers) {
                        const h = opts.headers;
                        if (h['Client-Integrity']) { ClientIntegrityHeader = h['Client-Integrity']; _S.workers.forEach(w => w.postMessage({ key: 'UpdateClientIntegrityHeader', value: ClientIntegrityHeader })); }
                        if (h['Authorization']) { AuthorizationHeader = h['Authorization']; _S.workers.forEach(w => w.postMessage({ key: 'UpdateAuthorizationHeader', value: AuthorizationHeader })); }
                        if (h['Client-Version']) { ClientVersion = h['Client-Version']; _S.workers.forEach(w => w.postMessage({ key: 'UpdateClientVersion', value: ClientVersion })); }
                        if (h['Client-Session-Id']) { ClientSession = h['Client-Session-Id']; _S.workers.forEach(w => w.postMessage({ key: 'UpdateClientSession', value: ClientSession })); }
                        if (h['X-Device-Id']) { GQLDeviceID = h['X-Device-Id']; _S.workers.forEach(w => w.postMessage({ key: 'UpdateDeviceId', value: GQLDeviceID })); }
                    }
                    return r;
                }
            }
            return real.apply(this, arguments);
        };
    }
    

    // ═══════════════════════════════════════════════════
    // MODULE: UI
    // ═══════════════════════════════════════════════════

    /**
     * TTV AB - UI Module
     * Toast notifications and user interface components
     * @private
     */
    function _showDonation() {
        const K = 'ttvab_last_reminder', D = 86400000;
        try {
            const last = localStorage.getItem(K), now = Date.now();
            if (last && (now - parseInt(last)) < D) return;
            setTimeout(() => {
                const t = document.createElement('div');
                t.id = 'ttvab-reminder';
                t.innerHTML = `<style>#ttvab-reminder{position:fixed;bottom:20px;right:20px;background:linear-gradient(135deg,#9146FF 0%,#772CE8 100%);color:#fff;padding:16px 20px;border-radius:12px;font-family:'Segoe UI',sans-serif;font-size:14px;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:999999;animation:ttvab-slide .3s ease}@keyframes ttvab-slide{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}#ttvab-reminder-close{position:absolute;top:8px;right:10px;background:none;border:none;color:rgba(255,255,255,.7);font-size:18px;cursor:pointer;padding:0;line-height:1}#ttvab-reminder-close:hover{color:#fff}#ttvab-reminder-btn{display:inline-block;margin-top:10px;padding:8px 16px;background:#fff;color:#772CE8;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px}#ttvab-reminder-btn:hover{background:#f0f0f0}</style><button id="ttvab-reminder-close">×</button><div style="margin-bottom:4px;font-weight:600">💜 Enjoying TTV AB?</div><div style="opacity:.9">If this extension saves you from ads, consider buying me a coffee!</div><button id="ttvab-reminder-btn">Support the Developer</button>`;
                document.body.appendChild(t);
                localStorage.setItem(K, now.toString());
                document.getElementById('ttvab-reminder-close').onclick = () => t.remove();
                document.getElementById('ttvab-reminder-btn').onclick = () => { window.open('https://paypal.me/GosuDRM', '_blank'); t.remove(); };
                setTimeout(() => { if (document.getElementById('ttvab-reminder')) { t.style.animation = 'ttvab-slide .3s ease reverse'; setTimeout(() => t.remove(), 300); } }, 15000);
            }, 5000);
        } catch (e) { }
    }
    
    function _showWelcome() {
        const K = 'ttvab_first_run_shown';
        try {
            if (localStorage.getItem(K)) return;
            setTimeout(() => {
                const t = document.createElement('div');
                t.id = 'ttvab-welcome';
                t.innerHTML = `<style>#ttvab-welcome{position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#9146FF 0%,#772CE8 100%);color:#fff;padding:20px 24px;border-radius:16px;font-family:'Segoe UI',sans-serif;font-size:14px;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,.4);z-index:999999;animation:ttvab-w .4s ease}@keyframes ttvab-w{from{opacity:0;transform:translateY(-20px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}#ttvab-welcome-close{position:absolute;top:10px;right:12px;background:none;border:none;color:rgba(255,255,255,.7);font-size:20px;cursor:pointer;padding:0;line-height:1}#ttvab-welcome-close:hover{color:#fff}#ttvab-welcome h3{margin:0 0 8px;font-size:18px}#ttvab-welcome p{margin:0 0 12px;opacity:.9;line-height:1.4}#ttvab-welcome .pin-tip{background:rgba(255,255,255,.15);padding:10px 12px;border-radius:8px;font-size:13px}#ttvab-welcome .pin-tip strong{color:#fff}</style><button id="ttvab-welcome-close">×</button><h3>🎉 TTV AB Installed!</h3><p>Ads will now be blocked automatically on Twitch streams.</p><div class="pin-tip"><strong>💡 Tip:</strong> Pin this extension for easy access!<br>Click 🧩 → Find TTV AB → Click 📌</div>`;
                document.body.appendChild(t);
                localStorage.setItem(K, 'true');
                document.getElementById('ttvab-welcome-close').onclick = () => { t.style.animation = 'ttvab-w .3s ease reverse'; setTimeout(() => t.remove(), 300); };
                setTimeout(() => { if (document.getElementById('ttvab-welcome')) { t.style.animation = 'ttvab-w .3s ease reverse'; setTimeout(() => t.remove(), 300); } }, 20000);
            }, 2000);
        } catch (e) { }
    }
    

    // ═══════════════════════════════════════════════════
    // MODULE: MONITOR
    // ═══════════════════════════════════════════════════

    /**
     * TTV AB - Monitor Module
     * Player crash detection and auto-refresh
     * @private
     */
    function _initCrashMonitor() {
        let refreshing = false, interval = null;
    
        function detect() {
            const text = document.body?.innerText || '';
            for (const p of _C.CRASH_PATTERNS) {
                if (text.toLowerCase().includes(p.toLowerCase())) return p;
            }
            const els = document.querySelectorAll('[data-a-target="player-overlay-content-gate"],[data-a-target="player-error-modal"],.content-overlay-gate,.player-error');
            for (const el of els) {
                const t = el.innerText || '';
                for (const p of _C.CRASH_PATTERNS) {
                    if (t.toLowerCase().includes(p.toLowerCase())) return p;
                }
            }
            return null;
        }
    
        function handle(err) {
            if (refreshing) return;
            refreshing = true;
            _log('Player crash detected: ' + err, 'error');
            _log('Auto-refreshing in ' + (_C.REFRESH_DELAY / 1000) + 's...', 'warning');
            const t = document.createElement('div');
            t.innerHTML = `<style>#ttvab-refresh-notice{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#f44336 0%,#d32f2f 100%);color:#fff;padding:12px 24px;border-radius:8px;font-family:'Segoe UI',sans-serif;font-size:14px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:9999999;animation:ttvab-p 1s ease infinite}@keyframes ttvab-p{0%,100%{opacity:1}50%{opacity:.7}}</style><div id="ttvab-refresh-notice">⚠️ Player crashed - Refreshing automatically...</div>`;
            document.body.appendChild(t);
            setTimeout(() => window.location.reload(), _C.REFRESH_DELAY);
        }
    
        const obs = new MutationObserver(() => {
            const e = detect();
            if (e) { handle(e); obs.disconnect(); if (interval) clearInterval(interval); }
        });
    
        function start() {
            if (document.body) {
                obs.observe(document.body, { childList: true, subtree: true, characterData: true });
                interval = setInterval(() => {
                    const e = detect();
                    if (e) { handle(e); obs.disconnect(); clearInterval(interval); }
                }, 5000);
                _log('Player crash monitor active', 'info');
            } else {
                setTimeout(start, 100);
            }
        }
        start();
    }
    

    // ═══════════════════════════════════════════════════
    // MODULE: INIT
    // ═══════════════════════════════════════════════════

    /**
     * TTV AB - Init Module
     * Bootstrap and initialization
     * @private
     */
    function _bootstrap() {
        if (typeof window.ttvabVersion !== 'undefined' && window.ttvabVersion >= _C.INTERNAL_VERSION) {
            _log('Skipping - another script is active', 'warning');
            return false;
        }
        window.ttvabVersion = _C.INTERNAL_VERSION;
        _log('v' + _C.VERSION + ' loaded', 'info');
        return true;
    }
    
    function _initToggleListener() {
        window.addEventListener('ttvab-toggle', function (e) {
            const enabled = e.detail?.enabled ?? true;
            IsAdStrippingEnabled = enabled;
            _log('Ad blocking ' + (enabled ? 'enabled' : 'disabled'), enabled ? 'success' : 'warning');
        });
    }
    
    function _init() {
        if (!_bootstrap()) return;
        _declareState(window);
        _hookStorage();
        _hookWorker();
        _hookMainFetch();
        _initToggleListener();
        _initCrashMonitor();
        _showWelcome();
        _showDonation();
        _log('Initialized successfully', 'success');
    }
    


    // Initialize
    _init();
})();
