/**
 * TTV AB v3.3.6 - Twitch Ad Blocker
 * 
 * @author GosuDRM
 * @license MIT
 * @repository https://github.com/GosuDRM/TTV-AB
 * @homepage https://github.com/GosuDRM/TTV-AB
 * 
 * This extension blocks advertisements on Twitch.tv live streams by intercepting
 * and modifying video playlist (M3U8) data. All processing occurs LOCALLY within
 * the user's browser. No user data is collected, stored, or transmitted.
 * 
 * REGARDING "REMOTE CODE" / "UNSAFE-EVAL":
 * ----------------------------------------
 * This extension intercepts Twitch's Web Worker creation to inject ad-blocking
 * logic. The technique used is:
 * 
 * 1. Intercept: The native Worker constructor is overridden.
 * 2. Fetch: The ORIGINAL worker script is fetched from Twitch's own servers.
 * 3. Modify: Ad-blocking code is prepended to Twitch's worker code.
 * 4. Execute: A new Blob URL is created and the patched worker is instantiated.
 * 
 * IMPORTANT SAFETY CLARIFICATIONS:
 * - The ONLY code executed is Twitch's own worker code (from *.twitch.tv).
 * - This extension does NOT download or execute any code from external/third-party servers.
 * - The ad-blocking logic is bundled entirely within this file.
 * - No eval() of user-provided or remotely-fetched arbitrary code occurs.
 * 
 * SOURCE CODE:
 * The full, unminified source code is available at:
 * https://github.com/GosuDRM/TTV-AB/tree/main/src/modules
 * 
 * PERMISSIONS USED:
 * - storage: Save user's enable/disable preference and blocked ad count.
 * - host_permissions (twitch.tv): Inject content script to block ads.
 * 
 * =============================================================================
 * ARCHITECTURE OVERVIEW
 * =============================================================================
 * 
 * This script is compiled from modular source files located in /src/modules/:
 * 
 * - constants.js : Configuration values and version info
 * - state.js     : Shared state management (ad counts, worker refs)
 * - logger.js    : Console logging with styled output
 * - parser.js    : M3U8 playlist parsing and ad segment detection
 * - api.js       : GraphQL requests to Twitch API for backup streams
 * - processor.js : Core ad removal logic and stream switching
 * - worker.js    : Worker patching utilities
 * - hooks.js     : Native API hooks (Worker, fetch)
 * - ui.js        : User notifications (welcome, donation prompts)
 * - monitor.js   : Player crash detection and auto-recovery
 * - init.js      : Extension initialization and event listeners
 * 
 * Function names are minified (e.g., _$l -> _$l, _$in -> _$in) for smaller bundle size.
 * 
 * =============================================================================
 */
(function(){
'use strict';

const _$c = {
    
    VERSION: '3.3.6',
    
    INTERNAL_VERSION: 28,
    
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
    
    REFRESH_DELAY: 1000,
    
    AVG_AD_DURATION: 22,
    
    ACHIEVEMENTS: [
        { id: 'first_block', name: 'Ad Slayer', icon: '⚔️', threshold: 1, type: 'ads', desc: 'Block your first ad' },
        { id: 'block_10', name: 'Blocker', icon: '🛡️', threshold: 10, type: 'ads', desc: 'Block 10 ads' },
        { id: 'block_100', name: 'Guardian', icon: '🔰', threshold: 100, type: 'ads', desc: 'Block 100 ads' },
        { id: 'block_500', name: 'Sentinel', icon: '🏰', threshold: 500, type: 'ads', desc: 'Block 500 ads' },
        { id: 'block_1000', name: 'Legend', icon: '🏆', threshold: 1000, type: 'ads', desc: 'Block 1000 ads' },
        { id: 'block_5000', name: 'Mythic', icon: '👑', threshold: 5000, type: 'ads', desc: 'Block 5000 ads' },
        { id: 'popup_10', name: 'Popup Crusher', icon: '💥', threshold: 10, type: 'popups', desc: 'Block 10 popups' },
        { id: 'popup_50', name: 'Popup Destroyer', icon: '🔥', threshold: 50, type: 'popups', desc: 'Block 50 popups' },
        { id: 'time_1h', name: 'Hour Saver', icon: '⏱️', threshold: 3600, type: 'time', desc: 'Save 1 hour from ads' },
        { id: 'time_10h', name: 'Time Master', icon: '⏰', threshold: 36000, type: 'time', desc: 'Save 10 hours from ads' },
        { id: 'channels_5', name: 'Explorer', icon: '📺', threshold: 5, type: 'channels', desc: 'Block ads on 5 channels' },
        { id: 'channels_20', name: 'Adventurer', icon: '🌍', threshold: 20, type: 'channels', desc: 'Block ads on 20 channels' }
    ]
};

const _$s = {
    
    workers: [],
    
    conflicts: ['twitch', 'isVariantA'],
    
    reinsertPatterns: ['isVariantA', 'besuper/', '${patch_url}'],
    
    adsBlocked: 0,
    
    popupsBlocked: 0,
    
    currentChannel: null
};

function _$ds(scope) {
    scope.AdSignifier = _$c.AD_SIGNIFIER;
    scope.ClientID = _$c.CLIENT_ID;
    scope.BackupPlayerTypes = [..._$c.PLAYER_TYPES];
    scope.FallbackPlayerType = _$c.FALLBACK_TYPE;
    scope.ForceAccessTokenPlayerType = _$c.FORCE_TYPE;
    scope.SkipPlayerReloadOnHevc = false;
    scope.AlwaysReloadPlayerOnAd = false;
    scope.PlayerReloadMinimalRequestsTime = _$c.RELOAD_TIME;
    scope.PlayerReloadMinimalRequestsPlayerIndex = 0;
    scope.HasTriggeredPlayerReload = false;
    scope.StreamInfos = Object.create(null);
    scope.StreamInfosByUrl = Object.create(null);
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

function _$ab(channel) {
    _$s.adsBlocked++;
    _$s.currentChannel = channel || null;
    if (typeof window !== 'undefined') {
        document.dispatchEvent(new CustomEvent('ttvab-ad-blocked', {
            detail: { count: _$s.adsBlocked, channel: channel || null }
        }));
    } else if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage({ key: 'AdBlocked', count: _$s.adsBlocked, channel: channel || null });
    }
}

function _$l(msg, type = 'info') {
    const text = typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
    const style = _$c.LOG_STYLES[type] || _$c.LOG_STYLES.info;

    if (type === 'error') {
        console.error('%cTTV AB%c ' + text, _$c.LOG_STYLES.prefix, style);
    } else if (type === 'warning') {
        console.warn('%cTTV AB%c ' + text, _$c.LOG_STYLES.prefix, style);
    } else {
        console.log('%cTTV AB%c ' + text, _$c.LOG_STYLES.prefix, style);
    }
}

const _$ar = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;

function _$pa(str) {
    const result = Object.create(null);
    let match;
    _$ar.lastIndex = 0;
    while ((match = _$ar.exec(str)) !== null) {
        let value = match[2];
        if (value[0] === '"' && value[value.length - 1] === '"') {
            value = value.slice(1, -1);
        }
        result[match[1].toUpperCase()] = value;
    }
    return result;
}

function _$gt(m3u8) {
    if (V2API) {
        const match = m3u8.match(/#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="([^"]+)"/);
        return match?.[1] ?? null;
    }
    const match = m3u8.match(/SERVER-TIME="([0-9.]+)"/);
    return match?.[1] ?? null;
}

function _$rt(m3u8, time) {
    if (!time) return m3u8;
    if (V2API) {
        return m3u8.replace(/(#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE=")[^"]+(")/, `$1${time}$2`);
    }
    return m3u8.replace(/(SERVER-TIME=")[0-9.]+(")/, `$1${time}$2`);
}

function _$sa(text, stripAll, info) {
    const lines = text.split('\n');
    const len = lines.length;
    const adUrl = 'https://twitch.tv';
    let stripped = false;
    let i = 0;

    for (; i < len; i++) {
        let line = lines[i];

        if (line.includes('X-TV-TWITCH-AD')) {
            line = line
                .replace(/X-TV-TWITCH-AD-URL="[^"]*"/, `X-TV-TWITCH-AD-URL="${adUrl}"`)
                .replace(/X-TV-TWITCH-AD-CLICK-TRACKING-URL="[^"]*"/, `X-TV-TWITCH-AD-CLICK-TRACKING-URL="${adUrl}"`);
            lines[i] = line;
        }

        if (i < len - 1 && line.startsWith('#EXTINF') && (!line.includes(',live') || stripAll || AllSegmentsAreAdSegments)) {
            const url = lines[i + 1];
            if (!AdSegmentCache.has(url)) info.NumStrippedAdSegments++;
            AdSegmentCache.set(url, Date.now());
            stripped = true;
        }

        if (line.includes(AdSignifier)) stripped = true;
    }

    if (stripped) {
        for (i = 0; i < len; i++) {
            if (lines[i].startsWith('#EXT-X-TWITCH-PREFETCH:')) lines[i] = '';
        }
    } else {
        info.NumStrippedAdSegments = 0;
    }

    info.IsStrippingAdSegments = stripped;

    const now = Date.now();
    if (!info._lastCachePrune || now - info._lastCachePrune > 60000) {
        info._lastCachePrune = now;
        const cutoff = now - 120000;
        AdSegmentCache.forEach((v, k) => { if (v < cutoff) AdSegmentCache.delete(k); });
    }

    return lines.join('\n');
}

function _$su(m3u8, res) {
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
        if (!line.startsWith('#EXT-X-STREAM-INF') || !lines[i + 1].includes('.m3u8')) continue;

        const attrs = _$pa(line);
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

const _$gu = 'https://gql.twitch.tv/gql';

function _$gq(body) {
    const headers = {
        'Content-Type': 'application/json',
        'Client-ID': ClientID
    };
    if (GQLDeviceID) headers['X-Device-Id'] = GQLDeviceID;
    if (ClientVersion) headers['Client-Version'] = ClientVersion;
    if (ClientSession) headers['Client-Session-Id'] = ClientSession;
    if (ClientIntegrityHeader) headers['Client-Integrity'] = ClientIntegrityHeader;
    if (AuthorizationHeader) headers['Authorization'] = AuthorizationHeader;

    return fetch(_$gu, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    }).then(res => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res;
    });
}

function _$tk(channel, playerType) {
    return _$gq({
        operationName: 'PlaybackAccessToken',
        extensions: {
            persistedQuery: {
                version: 1,
                sha256Hash: '0828119ded1c13477966434e15800ff57ddacf13ba1911c129dc2200705b0712'
            }
        },
        variables: {
            isLive: true,
            login: channel,
            isVod: false,
            vodID: '',
            playerType
        }
    });
}

async function _$pm(url, text, realFetch) {
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
            _$ab(info.ChannelName);
            _$l('Ad detected, blocking...', 'warning');
            if (typeof self !== 'undefined' && self.postMessage) {
                self.postMessage({ key: 'AdDetected', channel: info.ChannelName });
            }
        }

        if (!info.IsMidroll) {
            const lines = text.split('\n');
            for (let i = 0, len = lines.length; i < len; i++) {
                if (lines[i].startsWith('#EXTINF') && i < len - 1) {
                    if (!lines[i].includes(',live') && !info.RequestedAds.has(lines[i + 1])) {
                        info.RequestedAds.add(lines[i + 1]);
                        fetch(lines[i + 1]).then(r => r.blob()).catch(() => {

                        });
                        break;
                    }
                }
            }
        }

        const res = info.Urls[url];
        if (!res) {
            _$l('Missing resolution info for ' + url, 'warning');
            return text;
        }

        const isHevc = res.Codecs?.[0] === 'h' && (res.Codecs[1] === 'e' || res.Codecs[1] === 'v');
        if (((isHevc && !SkipPlayerReloadOnHevc) || AlwaysReloadPlayerOnAd) && info.ModifiedM3U8 && !info.IsUsingModifiedM3U8) {
            info.IsUsingModifiedM3U8 = true;
            info.LastPlayerReload = Date.now();
        }

        const { type: backupType, m3u8: backupM3u8 } = await _findBackupStream(info, realFetch, startIdx, minimal);

        if (backupM3u8) text = backupM3u8;

        if (info.ActiveBackupPlayerType !== backupType) {
            info.ActiveBackupPlayerType = backupType;
            _$l('Using backup player type: ' + backupType, 'info');
        }

        text = _$sa(text, false, info);
    } else {
        if (info.IsShowingAd) {
            info.IsShowingAd = false;
            info.IsUsingModifiedM3U8 = false;
            info.RequestedAds.clear();
            info.BackupEncodingsM3U8Cache = [];
            info.ActiveBackupPlayerType = null;
            _$l('Ad ended', 'success');
            if (typeof self !== 'undefined' && self.postMessage) {
                self.postMessage({ key: 'AdEnded' });
            }
        }
    }

    return text;
}

async function _findBackupStream(info, realFetch, startIdx = 0, minimal = false) {
    let backupType = null;
    let backupM3u8 = null;
    let fallbackM3u8 = null;

    const playerTypes = BackupPlayerTypes;
    const playerTypesLen = playerTypes.length;
    const res = info.Urls[Object.keys(info.Urls)[0]]; // Use first available resolution info

    for (let pi = startIdx; !backupM3u8 && pi < playerTypesLen; pi++) {
        const pt = playerTypes[pi];
        const realPt = pt.replace('-CACHED', '');
        const cached = pt !== realPt;

        for (let j = 0; j < 2; j++) {
            let fresh = false;
            let enc = info.BackupEncodingsM3U8Cache[pt];

            if (!enc) {
                fresh = true;
                try {
                    const tokenRes = await _$tk(info.ChannelName, realPt);
                    if (tokenRes.status === 200) {
                        const token = await tokenRes.json();
                        const sig = token?.data?.streamPlaybackAccessToken?.signature;
                        if (sig) {
                            const usherUrl = new URL(`https://usher.ttvnw.net/api/${V2API ? 'v2/' : ''}channel/hls/${info.ChannelName}.m3u8${info.UsherParams}`);
                            usherUrl.searchParams.set('sig', sig);
                            usherUrl.searchParams.set('token', token.data.streamPlaybackAccessToken.value);
                            const encRes = await realFetch(usherUrl.href);
                            if (encRes.status === 200) {
                                enc = info.BackupEncodingsM3U8Cache[pt] = await encRes.text();
                            }
                        }
                    }
                } catch (e) {
                    _$l('Error getting backup: ' + e.message, 'error');
                }
            }

            if (enc) {
                try {
                    const streamUrl = _$su(enc, res || {});
                    if (streamUrl) {
                        const streamRes = await realFetch(streamUrl);
                        if (streamRes.status === 200) {
                            const m3u8 = await streamRes.text();
                            if (m3u8) {
                                if (pt === FallbackPlayerType) fallbackM3u8 = m3u8;
                                const noAds = !m3u8.includes(AdSignifier) && (SimulatedAdsDepth === 0 || pi >= SimulatedAdsDepth - 1);
                                const lastResort = !fallbackM3u8 && pi >= playerTypesLen - 1;

                                if (noAds || lastResort || cached || minimal) {
                                    backupType = pt;
                                    backupM3u8 = m3u8;
                                    break;
                                }
                            }
                        }
                    }
                } catch (e) {
                    _$l('Stream fetch error: ' + e.message, 'warning');
                }
            }

            info.BackupEncodingsM3U8Cache[pt] = null;
            if (fresh) break;
        }
    }

    if (!backupM3u8 && fallbackM3u8) {
        backupType = FallbackPlayerType;
        backupM3u8 = fallbackM3u8;
    }

    return { type: backupType, m3u8: backupM3u8 };
}

function _$wj(url) {
    const req = new XMLHttpRequest();
    req.open('GET', url, false);
    req.send();
    return req.responseText;
}

function _$cw(W) {
    const proto = W.prototype;
    for (const key of _$s.conflicts) {
        if (proto[key]) proto[key] = undefined;
    }
    return W;
}

function _$gr(W) {
    const src = W.toString();
    const result = [];
    for (const pattern of _$s.reinsertPatterns) {
        if (src.includes(pattern)) result.push(pattern);
    }
    return result;
}

function _$ri(W, names) {
    for (const name of names) {
        if (typeof window[name] === 'function') {
            W.prototype[name] = window[name];
        }
    }
    return W;
}

function _$iv(v) {
    if (typeof v !== 'function') return false;
    const src = v.toString();

    return !_$s.conflicts.some(c => src.includes(c)) && !_$s.reinsertPatterns.some(p => src.includes(p));
}

function _$wf() {
    _$l('Worker fetch hooked', 'info');
    const realFetch = fetch;

    function _$ps() {
        const keys = Object.keys(StreamInfos);
        if (keys.length > 5) {
            const oldKey = keys[0]; // Simple FIFO
            delete StreamInfos[oldKey];

            for (const url in StreamInfosByUrl) {
                if (StreamInfosByUrl[url].ChannelName === oldKey) {
                    delete StreamInfosByUrl[url];
                }
            }
        }
    }

    fetch = async function (url, opts) {
        if (typeof url !== 'string') {
            return realFetch.apply(this, arguments);
        }

        if (AdSegmentCache.has(url)) {
            return realFetch('data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292', opts);
        }

        url = url.trimEnd();

        if (url.endsWith('m3u8')) {
            const response = await realFetch(url, opts);
            if (response.status === 200) {
                const text = await response.text();
                return new Response(await _$pm(url, text, realFetch));
            }
            return response;
        }

        if (url.includes('/channel/hls/') && !url.includes('picture-by-picture')) {
            V2API = url.includes('/api/v2/');
            const channelMatch = (new URL(url)).pathname.match(/([^/]+)(?=\.\w+$)/);
            const channel = channelMatch?.[0];

            if (ForceAccessTokenPlayerType) {
                const urlObj = new URL(url);
                urlObj.searchParams.delete('parent_domains');
                url = urlObj.toString();
            }

            const response = await realFetch(url, opts);
            if (response.status !== 200) return response;

            const encodings = await response.text();
            const serverTime = _$gt(encodings);
            let info = StreamInfos[channel];

            if (info?.EncodingsM3U8) {
                const m3u8Match = info.EncodingsM3U8.match(/^https:.*\.m3u8$/m);
                if (m3u8Match && (await realFetch(m3u8Match[0])).status !== 200) {
                    info = null;
                }
            }

            if (!info?.EncodingsM3U8) {
                _$ps();
                info = StreamInfos[channel] = {
                    ChannelName: channel,
                    IsShowingAd: false,
                    LastPlayerReload: 0,
                    EncodingsM3U8: encodings,
                    ModifiedM3U8: null,
                    IsUsingModifiedM3U8: false,
                    UsherParams: (new URL(url)).search,
                    RequestedAds: new Set(),
                    Urls: Object.create(null),
                    ResolutionList: [],
                    BackupEncodingsM3U8Cache: [],
                    ActiveBackupPlayerType: null,
                    IsMidroll: false,
                    IsStrippingAdSegments: false,
                    NumStrippedAdSegments: 0
                };

                const lines = encodings.split('\n');
                for (let i = 0, len = lines.length; i < len - 1; i++) {
                    if (lines[i].startsWith('#EXT-X-STREAM-INF') && lines[i + 1].includes('.m3u8')) {
                        const attrs = _$pa(lines[i]);
                        const resolution = attrs.RESOLUTION;
                        if (resolution) {
                            const resInfo = {
                                Resolution: resolution,
                                FrameRate: attrs['FRAME-RATE'],
                                Codecs: attrs.CODECS,
                                Url: lines[i + 1]
                            };
                            info.Urls[lines[i + 1]] = resInfo;
                            info.ResolutionList.push(resInfo);
                        }
                        StreamInfosByUrl[lines[i + 1]] = info;
                    }
                }
                _$l('Stream initialized: ' + channel, 'success');
            }

            info.LastPlayerReload = Date.now();
            const playlist = info.IsUsingModifiedM3U8 ? info.ModifiedM3U8 : info.EncodingsM3U8;
            return new Response(_$rt(playlist, serverTime));
        }

        return realFetch.apply(this, arguments);
    };
}

function _$hw() {
    const reinsertNames = _$gr(window.Worker);

    const HookedWorker = class Worker extends _$cw(window.Worker) {
        constructor(url, opts) {
            let isTwitch = false;
            try {
                isTwitch = new URL(url).origin.endsWith('.twitch.tv');
            } catch {
                isTwitch = false;
            }

            if (!isTwitch) {
                super(url, opts);
                return;
            }

            const injectedCode = `
                const _$c = ${JSON.stringify(_$c)};
                const _$s = ${JSON.stringify(_$s)};
                const _$ar = ${_$ar.toString()};
                ${_$l.toString()}
                ${_$ds.toString()}
                ${_$ab.toString()}
                ${_$pa.toString()}
                ${_$gt.toString()}
                ${_$rt.toString()}
                ${_$sa.toString()}
                ${_$su.toString()}
                ${_$gq.toString()}
                ${_$tk.toString()}
                ${_$pm.toString()}
                ${_$wj.toString()}
                ${_$wf.toString()}

                function _$ps() {
                    const keys = Object.keys(StreamInfos);
                    if (keys.length > 5) {
                        const oldKey = keys[0];
                        delete StreamInfos[oldKey];
                        for (const url in StreamInfosByUrl) {
                            if (StreamInfosByUrl[url].ChannelName === oldKey) {
                                delete StreamInfosByUrl[url];
                            }
                        }
                    }
                }
                
                const _$gu = '${_$gu}';
                const wasmSource = _$wj('${url.replaceAll("'", "%27")}');
                _$ds(self);
                GQLDeviceID = ${GQLDeviceID ? `'${GQLDeviceID}'` : 'null'};
                AuthorizationHeader = ${AuthorizationHeader ? `'${AuthorizationHeader}'` : 'undefined'};
                ClientIntegrityHeader = ${ClientIntegrityHeader ? `'${ClientIntegrityHeader}'` : 'null'};
                ClientVersion = ${ClientVersion ? `'${ClientVersion}'` : 'null'};
                ClientSession = ${ClientSession ? `'${ClientSession}'` : 'null'};
                
                self.addEventListener('message', function(e) {
                    const data = e.data;
                    if (!data?.key) return;
                    switch (data.key) {
                        case 'UpdateClientVersion': ClientVersion = data.value; break;
                        case 'UpdateClientSession': ClientSession = data.value; break;
                        case 'UpdateClientId': ClientID = data.value; break;
                        case 'UpdateDeviceId': GQLDeviceID = data.value; break;
                        case 'UpdateClientIntegrityHeader': ClientIntegrityHeader = data.value; break;
                        case 'UpdateAuthorizationHeader': AuthorizationHeader = data.value; break;
                        case 'UpdateToggleState': IsAdStrippingEnabled = data.value; break;
                        case 'UpdateAdsBlocked': _$s.adsBlocked = data.value; break;
                    }
                });
                
                _$wf();
                eval(wasmSource);
            `;

            const blobUrl = URL.createObjectURL(new Blob([injectedCode]));
            super(blobUrl, opts);
            URL.revokeObjectURL(blobUrl);

            this.addEventListener('message', function (e) {
                if (!e.data?.key) return;

                switch (e.data.key) {
                    case 'AdBlocked':
                        _$s.adsBlocked = e.data.count;
                        document.dispatchEvent(new CustomEvent('ttvab-ad-blocked', {
                            detail: { count: e.data.count, channel: e.data.channel || null }
                        }));
                        _$l('Ad blocked! Total: ' + e.data.count, 'success');
                        break;
                    case 'AdDetected':
                        _$l('Ad detected, blocking...', 'warning');
                        break;
                    case 'AdEnded':
                        _$l('Ad ended', 'success');
                        break;

                }
            });

            _$s.workers.push(this);

            if (_$s.workers.length > 5) {
                const oldWorker = _$s.workers.shift();
                try { oldWorker.terminate(); } catch { /* Worker may already be terminated */ }
            }
        }
    };

    let workerInstance = _$ri(HookedWorker, reinsertNames);
    Object.defineProperty(window, 'Worker', {
        get: () => workerInstance,
        set: (v) => { if (_$iv(v)) workerInstance = v; }
    });
}

function _$hs() {
    try {
        const originalGetItem = localStorage.getItem.bind(localStorage);
        localStorage.getItem = function (key) {
            const value = originalGetItem(key);
            if (key === 'unique_id' && value) GQLDeviceID = value;
            return value;
        };
        const deviceId = originalGetItem('unique_id');
        if (deviceId) GQLDeviceID = deviceId;
    } catch (e) {
        _$l('Storage hook error: ' + e.message, 'warning');
    }
}

function _$mf() {
    const realFetch = window.fetch;

    window.fetch = async function (url, opts) {
        if (typeof url === 'string' || url instanceof URL) {
            const urlStr = url.toString();
            if (urlStr.includes('gql.twitch.tv/gql')) {
                const response = await realFetch.apply(this, arguments);

                if (opts?.headers) {
                    const h = opts.headers;
                    const updates = [];

                    if (h['Client-Integrity']) {
                        ClientIntegrityHeader = h['Client-Integrity'];
                        updates.push({ key: 'UpdateClientIntegrityHeader', value: ClientIntegrityHeader });
                    }
                    if (h['Authorization']) {
                        AuthorizationHeader = h['Authorization'];
                        updates.push({ key: 'UpdateAuthorizationHeader', value: AuthorizationHeader });
                    }
                    if (h['Client-Version']) {
                        ClientVersion = h['Client-Version'];
                        updates.push({ key: 'UpdateClientVersion', value: ClientVersion });
                    }
                    if (h['Client-Session-Id']) {
                        ClientSession = h['Client-Session-Id'];
                        updates.push({ key: 'UpdateClientSession', value: ClientSession });
                    }
                    if (h['X-Device-Id']) {
                        GQLDeviceID = h['X-Device-Id'];
                        updates.push({ key: 'UpdateDeviceId', value: GQLDeviceID });
                    }

                    if (updates.length > 0) {
                        for (const worker of _$s.workers) {
                            for (const update of updates) {
                                worker.postMessage(update);
                            }
                        }
                    }
                }
                return response;
            }
        }
        return realFetch.apply(this, arguments);
    };
}

const _$rk = 'ttvab_last_reminder';

const _$ri2 = 86400000;

const _$fr = 'ttvab_first_run_shown';

function _$dn() {
    try {
        const lastReminder = localStorage.getItem(_$rk);
        const now = Date.now();

        if (lastReminder && (now - parseInt(lastReminder, 10)) < _$ri2) return;

        setTimeout(() => {
            const toast = document.createElement('div');
            toast.id = 'ttvab-reminder';
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
            localStorage.setItem(_$rk, now.toString());

            document.getElementById('ttvab-reminder-close').onclick = () => toast.remove();
            document.getElementById('ttvab-reminder-btn').onclick = () => {
                window.open('https://paypal.me/GosuDRM', '_blank');
                toast.remove();
            };

            setTimeout(() => {
                if (document.getElementById('ttvab-reminder')) {
                    toast.style.animation = 'ttvab-slide .3s ease reverse';
                    setTimeout(() => toast.remove(), 300);
                }
            }, 15000);
        }, 5000);
    } catch (e) {
        _$l('Donation reminder error: ' + e.message, 'error');
    }
}

function _$wc() {
    try {
        if (localStorage.getItem(_$fr)) return;

        setTimeout(() => {
            const toast = document.createElement('div');
            toast.id = 'ttvab-welcome';
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
            localStorage.setItem(_$fr, 'true');

            const closeHandler = () => {
                toast.style.animation = 'ttvab-welcome .3s ease reverse';
                setTimeout(() => toast.remove(), 300);
            };

            document.getElementById('ttvab-welcome-close').onclick = closeHandler;

            setTimeout(() => {
                if (document.getElementById('ttvab-welcome')) closeHandler();
            }, 20000);
        }, 2000);
    } catch (e) {
        _$l('Welcome message error: ' + e.message, 'error');
    }
}

const _$ai = {
    'first_block': { name: 'Ad Slayer', icon: '⚔️', desc: 'Blocked your first ad!' },
    'block_10': { name: 'Blocker', icon: '🛡️', desc: 'Blocked 10 ads!' },
    'block_100': { name: 'Guardian', icon: '🔰', desc: 'Blocked 100 ads!' },
    'block_500': { name: 'Sentinel', icon: '🏰', desc: 'Blocked 500 ads!' },
    'block_1000': { name: 'Legend', icon: '🏆', desc: 'Blocked 1000 ads!' },
    'block_5000': { name: 'Mythic', icon: '👑', desc: 'Blocked 5000 ads!' },
    'popup_10': { name: 'Popup Crusher', icon: '💥', desc: 'Blocked 10 popups!' },
    'popup_50': { name: 'Popup Destroyer', icon: '🔥', desc: 'Blocked 50 popups!' },
    'time_1h': { name: 'Hour Saver', icon: '⏱️', desc: 'Saved 1 hour from ads!' },
    'time_10h': { name: 'Time Master', icon: '⏰', desc: 'Saved 10 hours from ads!' },
    'channels_5': { name: 'Explorer', icon: '📺', desc: 'Blocked ads on 5 channels!' },
    'channels_20': { name: 'Adventurer', icon: '🌍', desc: 'Blocked ads on 20 channels!' }
};

function _$au(achievementId) {
    try {
        const ach = _$ai[achievementId];
        if (!ach) return;

        const existing = document.getElementById('ttvab-achievement');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'ttvab-achievement';
        toast.innerHTML = `
            <style>
                #ttvab-achievement{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:#fff;padding:16px 24px;border-radius:16px;font-family:'Segoe UI',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5),0 0 20px rgba(145,70,255,.3);z-index:9999999;animation:ttvab-ach-pop .5s cubic-bezier(0.34,1.56,0.64,1);border:2px solid rgba(145,70,255,.5);display:flex;align-items:center;gap:16px}
                @keyframes ttvab-ach-pop{from{opacity:0;transform:translateX(-50%) scale(.5) translateY(-20px)}to{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}}
                @keyframes ttvab-ach-glow{0%,100%{box-shadow:0 0 10px rgba(145,70,255,.3)}50%{box-shadow:0 0 25px rgba(145,70,255,.6)}}
                @keyframes ttvab-ach-shine{0%{background-position:-200% center}100%{background-position:200% center}}
                #ttvab-achievement .ach-icon{font-size:40px;animation:ttvab-ach-bounce 1s ease infinite}
                @keyframes ttvab-ach-bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
                #ttvab-achievement .ach-content{display:flex;flex-direction:column;gap:2px}
                #ttvab-achievement .ach-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#9146FF;font-weight:600}
                #ttvab-achievement .ach-name{font-size:18px;font-weight:700;background:linear-gradient(90deg,#fff 0%,#9146FF 50%,#fff 100%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:ttvab-ach-shine 2s linear infinite}
                #ttvab-achievement .ach-desc{font-size:12px;color:#aaa;margin-top:2px}
            </style>
            <div class="ach-icon">${ach.icon}</div>
            <div class="ach-content">
                <div class="ach-label">🏆 Achievement Unlocked!</div>
                <div class="ach-name">${ach.name}</div>
                <div class="ach-desc">${ach.desc}</div>
            </div>
        `;

        document.body.appendChild(toast);
        _$l('Achievement unlocked: ' + ach.name, 'success');

        setTimeout(() => {
            if (document.getElementById('ttvab-achievement')) {
                toast.style.animation = 'ttvab-ach-pop .3s ease reverse';
                setTimeout(() => toast.remove(), 300);
            }
        }, 4000);
    } catch (e) {
        _$l('Achievement notification error: ' + e.message, 'error');
    }
}

function _$al() {
    document.addEventListener('ttvab-achievement-unlocked', function (e) {
        if (e.detail && e.detail.id) {
            _$au(e.detail.id);
        }
    });
}

function _$cm() {
    let isRefreshing = false;
    let checkInterval = null;

    function detectCrash(fromMutation = false) {

        if (!fromMutation) {
            const bodyText = document.body?.innerText?.toLowerCase() || '';
            const patterns = _$c.CRASH_PATTERNS;
            for (let i = 0, len = patterns.length; i < len; i++) {
                if (bodyText.includes(patterns[i].toLowerCase())) return patterns[i];
            }
        }

        const errorElements = document.querySelectorAll(
            '[data-a-target="player-overlay-content-gate"],' +
            '[data-a-target="player-error-modal"],' +
            '.content-overlay-gate,' +
            '.player-error'
        );

        for (const el of errorElements) {
            const text = (el.innerText || '').toLowerCase();
            const patterns = _$c.CRASH_PATTERNS;
            for (let i = 0, len = patterns.length; i < len; i++) {
                if (text.includes(patterns[i].toLowerCase())) return patterns[i];
            }
        }

        return null;
    }

    function handleCrash(error) {
        if (isRefreshing) return;
        isRefreshing = true;

        _$l('Player crash detected: ' + error, 'error');
        _$l('Auto-refreshing in ' + (_$c.REFRESH_DELAY / 1000) + 's...', 'warning');

        const banner = document.createElement('div');
        banner.innerHTML = `
            <style>
                #ttvab-refresh-notice{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#f44336 0%,#d32f2f 100%);color:#fff;padding:12px 24px;border-radius:8px;font-family:'Segoe UI',sans-serif;font-size:14px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:9999999;animation:ttvab-pulse 1s ease infinite}
                @keyframes ttvab-pulse{0%,100%{opacity:1}50%{opacity:.7}}
            </style>
            <div id="ttvab-refresh-notice">⚠️ Player crashed - Refreshing automatically...</div>
        `;
        document.body.appendChild(banner);

        setTimeout(() => window.location.reload(), _$c.REFRESH_DELAY);
    }

    function start() {
        if (!document.body) {
            setTimeout(start, 100);
            return;
        }

        let lastCheck = 0;
        const observer = new MutationObserver(() => {
            try {

                const now = Date.now();
                if (now - lastCheck < 2000) return;
                lastCheck = now;

                const error = detectCrash(true);
                if (error) {
                    handleCrash(error);
                    observer.disconnect();
                    if (checkInterval) clearInterval(checkInterval);
                }
            } catch (e) { /* Ignore */ }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        checkInterval = setInterval(() => {
            try {
                const error = detectCrash();
                if (error) {
                    handleCrash(error);
                    observer.disconnect();
                    clearInterval(checkInterval);
                }
            } catch (e) {

            }
        }, 5000);

        _$l('Player crash monitor active', 'info');
    }

    start();
}

function _$bs() {

    if (typeof window.ttvabVersion !== 'undefined' && window.ttvabVersion >= _$c.INTERNAL_VERSION) {
        _$l('Skipping - another script is active', 'warning');
        return false;
    }

    window.ttvabVersion = _$c.INTERNAL_VERSION;
    _$l('v' + _$c.VERSION + ' loaded', 'info');
    return true;
}

function _$tl() {
    document.addEventListener('ttvab-toggle', function (e) {
        const enabled = e.detail?.enabled ?? true;
        IsAdStrippingEnabled = enabled;

        for (const worker of _$s.workers) {
            worker.postMessage({ key: 'UpdateToggleState', value: enabled });
        }
        _$l('Ad blocking ' + (enabled ? 'enabled' : 'disabled'), enabled ? 'success' : 'warning');
    });
}

function _$bp() {

    const POPUP_SELECTORS = [
        '[data-a-target="player-overlay-click-handler"] + div[class*="ScAttach"]',
        '[class*="consent-banner"]',
        '[class*="AdblockModal"]',
        '[aria-label*="ad block"]',
        '[aria-label*="adblock"]'
    ];

    const POPUP_TEXT_PATTERNS = [
        'disabling ad block',
        'disable ad block',
        'allow twitch ads',
        'support.*by disabling',
        'ad-free with turbo',
        'viewers watch ads'
    ];

    function _$ae(el) {
        const text = el.textContent?.toLowerCase() || '';
        return POPUP_TEXT_PATTERNS.some(function (pattern) {
            return new RegExp(pattern, 'i').test(text);
        });
    }

    function _$pb() {
        _$s.popupsBlocked++;
        document.dispatchEvent(new CustomEvent('ttvab-popup-blocked', { detail: { count: _$s.popupsBlocked } }));
    }

    function _$rp(el) {

        const parent = el.closest('[class*="ScAttach"], [class*="modal"], [class*="overlay"], [role="dialog"]');
        if (parent && _$ae(parent)) {
            parent.remove();
            _$pb();
            _$l('Anti-adblock popup removed (Total: ' + _$s.popupsBlocked + ')', 'success');
            return true;
        }
        if (_$ae(el)) {
            el.remove();
            _$pb();
            _$l('Anti-adblock popup removed (Total: ' + _$s.popupsBlocked + ')', 'success');
            return true;
        }
        return false;
    }

    function _$sr() {

        for (const selector of POPUP_SELECTORS) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    if (_$ae(el)) {
                        el.remove();
                        _$pb();
                        _$l('Anti-adblock popup removed (Total: ' + _$s.popupsBlocked + ')', 'success');
                    }
                }
            } catch { /* Selector may fail */ }
        }

        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
            const text = btn.textContent?.toLowerCase() || '';
            if (text.includes('allow twitch ads') || text.includes('try turbo')) {

                const modal = btn.closest('[class*="ScAttach"], [class*="modal"], [role="dialog"], [class*="Layout"]');
                if (modal && _$ae(modal)) {
                    modal.remove();
                    _$pb();
                    _$l('Anti-adblock popup removed via button detection (Total: ' + _$s.popupsBlocked + ')', 'success');
                }
            }
        }
    }

    _$sr();

    const observer = new MutationObserver(function (mutations) {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    _$rp(node);

                    if (node.querySelectorAll) {
                        const children = node.querySelectorAll('*');
                        for (const child of children) {
                            if (_$ae(child)) {
                                _$rp(child);
                                break;
                            }
                        }
                    }
                }
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    function _$is() {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(function () {
                _$sr();
                setTimeout(_$is, 2000);
            }, { timeout: 3000 });
        } else {
            setTimeout(function () {
                _$sr();
                _$is();
            }, 2000);
        }
    }
    _$is();

    _$l('Anti-adblocking enabled', 'success');
}

function _$in() {
    if (!_$bs()) return;

    _$ds(window);

    document.addEventListener('ttvab-init-count', function (e) {
        if (e.detail && typeof e.detail.count === 'number') {
            _$s.adsBlocked = e.detail.count;

            for (const worker of _$s.workers) {
                worker.postMessage({ key: 'UpdateAdsBlocked', value: _$s.adsBlocked });
            }
            _$l('Restored ads blocked count: ' + _$s.adsBlocked, 'info');
        }
    });

    document.addEventListener('ttvab-init-popups-count', function (e) {
        if (e.detail && typeof e.detail.count === 'number') {
            _$s.popupsBlocked = e.detail.count;
            _$l('Restored popups blocked count: ' + _$s.popupsBlocked, 'info');
        }
    });

    _$hs();
    _$hw();
    _$mf();
    _$tl();
    _$cm();
    _$bp();
    _$al();
    _$wc();
    _$dn();

    document.dispatchEvent(new CustomEvent('ttvab-request-state'));

    _$l('Initialized successfully', 'success');
}

_$in();
})();
