/**
 * TTV AB v3.8.9 - Twitch Ad Blocker
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
    
    VERSION: '3.8.9',
    
    INTERNAL_VERSION: 34,
    
    LOG_STYLES: {
        prefix: 'background: linear-gradient(135deg, #9146FF, #772CE8); color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
        info: 'color: #9146FF; font-weight: 500;',
        success: 'color: #4CAF50; font-weight: 500;',
        warning: 'color: #FF9800; font-weight: 500;',
        error: 'color: #f44336; font-weight: 500;'
    },
    
    AD_SIGNIFIER: 'stitched',
    
    CLIENT_ID: 'kimne78kx3ncx6brgo4mv6wki5h1ko',
    
    GQL_URL: 'https://gql.twitch.tv/gql',
    
    PLAYER_TYPES: ['embed', 'site', 'autoplay', 'picture-by-picture-CACHED', '480p'],
    
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
        window.postMessage({
            type: 'ttvab-ad-blocked',
            detail: { count: _$s.adsBlocked, channel: channel || null }
        }, '*');
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

function _$sa(text, stripAll, info, isBackup = false) {
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

        const isAdSegment = !line.includes(',live') && !isBackup;
        if (i < len - 1 && line.startsWith('#EXTINF') && (isAdSegment || stripAll || AllSegmentsAreAdSegments)) {
            const url = lines[i + 1];
            if (!AdSegmentCache.has(url)) info.NumStrippedAdSegments++;
            AdSegmentCache.set(url, Date.now());
            stripped = true;

            lines[i] = '';      // Remove #EXTINF
            lines[i + 1] = '';  // Remove URL

            i++;
        }

        if (line.includes(AdSignifier)) stripped = true;
    }

    if (stripped) {
        for (i = 0; i < len; i++) {
            if (lines[i] && lines[i].startsWith('#EXT-X-TWITCH-PREFETCH:')) lines[i] = '';
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

    return lines.filter(l => l !== '').join('\n');
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
        if (!line.startsWith('#EXT-X-STREAM-INF') || !lines[i + 1].includes('.m3u8') || lines[i + 1].includes('processing')) continue;

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
    else _$l('GQL Warning: No Client-Integrity header found!', 'warning');
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
    let reqPlayerType = playerType;
    if (ForceAccessTokenPlayerType && playerType !== 'embed' && playerType !== '480p') {
        reqPlayerType = ForceAccessTokenPlayerType;
    }

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
            playerType: reqPlayerType
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

        const { type: backupType, m3u8: backupM3u8 } = await _findBackupStream(info, realFetch);

        if (!backupM3u8) _$l('Failed to find any backup stream', 'warning');

        if (backupM3u8) text = backupM3u8;

        if (info.ActiveBackupPlayerType !== backupType) {
            info.ActiveBackupPlayerType = backupType;
            _$l('Using backup player type: ' + backupType, 'info');
        }

        text = _$sa(text, false, info, !!backupM3u8);
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

    const playerTypes = [...BackupPlayerTypes];
    if (info.ActiveBackupPlayerType) {
        const idx = playerTypes.indexOf(info.ActiveBackupPlayerType);
        if (idx > -1) {
            playerTypes.splice(idx, 1);
            playerTypes.unshift(info.ActiveBackupPlayerType);
        }
    }

    const playerTypesLen = playerTypes.length;
    const res = info.Urls[Object.keys(info.Urls)[0]]; // Use first available resolution info

    for (let pi = startIdx; !backupM3u8 && pi < playerTypesLen; pi++) {
        const pt = playerTypes[pi];
        const realPt = pt.replace('-CACHED', '');
        const cached = pt !== realPt;
        _$l(`[Trace] Checking player type: ${pt} (Fallback=${FallbackPlayerType})`, 'info');

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
                                _$l(`[Trace] Got encoding M3U8 for ${pt}. Length: ${enc.length}`, 'info');
                            } else {
                                _$l(`Backup usher fetch failed for ${pt}: ${encRes.status}`, 'warning');
                            }
                        } else {
                            _$l(`[Trace] No signature found in token for ${pt}`, 'warning');
                        }
                    } else {
                        _$l(`Backup token fetch failed for ${pt}: ${tokenRes.status}`, 'warning');
                    }
                } catch (e) {
                    _$l('Error getting backup: ' + e.message, 'error');
                }
            } else {
                _$l(`[Trace] Using cached encoding for ${pt}`, 'info');
            }

            if (enc) {
                try {
                    const streamUrl = _$su(enc, res || {});
                    if (streamUrl) {
                        _$l(`[Trace] Fetching stream URL for ${pt}: ${streamUrl}`, 'info');
                        const streamRes = await realFetch(streamUrl);
                        if (streamRes.status === 200) {
                            const m3u8 = await streamRes.text();
                            if (m3u8) {
                                _$l(`[Trace] Got stream M3U8 for ${pt}. Length: ${m3u8.length}`, 'info');
                                const noAds = !m3u8.includes(AdSignifier) && (SimulatedAdsDepth === 0 || pi >= SimulatedAdsDepth - 1);
                                const lastResort = pi >= playerTypesLen - 1;

                                if (noAds || minimal) {
                                    backupType = pt;
                                    backupM3u8 = m3u8;
                                    _$l(`[Trace] Selected backup: ${pt}`, 'success');
                                    break;
                                } else {
                                    _$l(`[Trace] Rejected ${pt} (HasAds=${!noAds}, LastResort=${lastResort})`, 'warning');
                                }
                            } else {
                                _$l(`[Trace] Stream content empty for ${pt}`, 'warning');
                            }
                        } else {
                            _$l(`Backup stream fetch failed for ${pt}: ${streamRes.status}`, 'warning');
                        }
                    } else {
                        _$l(`No matching stream URL found for ${pt}`, 'warning');
                    }
                } catch (e) {
                    _$l('Stream fetch error: ' + e.message, 'warning');
                }
            }

            info.BackupEncodingsM3U8Cache[pt] = null;
            if (fresh) break;
        }
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
                ${_findBackupStream.toString()}
                ${_$wj.toString()}
                ${_$wf.toString()}
                
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

                        window.postMessage({
                            type: 'ttvab-ad-blocked',
                            detail: { count: e.data.count, channel: e.data.channel || null }
                        }, '*');
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

            const workerUrl = url;
            const workerOpts = opts;
            let restartAttempts = 0;
            const MAX_RESTART_ATTEMPTS = 3;
            const workerSelf = this;

            this.addEventListener('error', function (e) {
                _$l('Worker crashed: ' + (e.message || 'Unknown error'), 'error');

                const idx = _$s.workers.indexOf(workerSelf);
                if (idx > -1) _$s.workers.splice(idx, 1);

                if (restartAttempts < MAX_RESTART_ATTEMPTS) {
                    restartAttempts++;
                    const delay = Math.pow(2, restartAttempts) * 500; // 1s, 2s, 4s
                    _$l('Auto-restarting worker in ' + (delay / 1000) + 's (attempt ' + restartAttempts + '/' + MAX_RESTART_ATTEMPTS + ')', 'warning');

                    setTimeout(function () {
                        try {

                            new window.Worker(workerUrl, workerOpts);
                            _$l('Worker restarted successfully', 'success');
                            restartAttempts = 0; // Reset on success
                        } catch (restartErr) {
                            _$l('Worker restart failed: ' + restartErr.message, 'error');
                        }
                    }, delay);
                } else {
                    _$l('Worker restart limit reached. Please refresh the page.', 'error');
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
        if (url) {
            const urlStr = (url instanceof Request) ? url.url : url.toString();
            if (urlStr.includes('gql.twitch.tv/gql')) {
                const response = await realFetch.apply(this, arguments);

                let headers = opts?.headers;

                if (url instanceof Request) {
                    headers = url.headers;
                }

                if (headers) {
                    const getHeader = (key) => {
                        if (headers instanceof Headers) return headers.get(key) || headers.get(key.toLowerCase());
                        return headers[key] || headers[key.toLowerCase()];
                    };

                    const updates = [];
                    const integrity = getHeader('Client-Integrity');
                    const auth = getHeader('Authorization');
                    const version = getHeader('Client-Version');
                    const session = getHeader('Client-Session-Id');
                    const device = getHeader('X-Device-Id');

                    if (integrity) {
                        ClientIntegrityHeader = integrity;
                        updates.push({ key: 'UpdateClientIntegrityHeader', value: ClientIntegrityHeader });
                    }
                    if (auth) {
                        AuthorizationHeader = auth;
                        updates.push({ key: 'UpdateAuthorizationHeader', value: AuthorizationHeader });
                    }
                    if (version) {
                        ClientVersion = version;
                        updates.push({ key: 'UpdateClientVersion', value: ClientVersion });
                    }
                    if (session) {
                        ClientSession = session;
                        updates.push({ key: 'UpdateClientSession', value: ClientSession });
                    }
                    if (device) {
                        GQLDeviceID = device;
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
    window.addEventListener('message', function (e) {
        if (e.data?.type === 'ttvab-achievement-unlocked' && e.data.detail?.id) {
            _$au(e.data.detail.id);
        }
    });
}

function _$cm() {
    let isRefreshing = false;
    let checkInterval = null;

    function detectCrash() {

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

                const error = detectCrash();
                if (error) {
                    handleCrash(error);
                    observer.disconnect();
                    if (checkInterval) clearInterval(checkInterval);
                }
            } catch { /* Ignore */ }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        checkInterval = setInterval(() => {
            if (document.hidden) return;
            try {
                const error = detectCrash();
                if (error) {
                    handleCrash(error);
                    observer.disconnect();
                    clearInterval(checkInterval);
                }
            } catch {

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
    window.addEventListener('message', function (e) {
        if (e.source !== window) return;
        if (e.data?.type === 'ttvab-toggle') {
            const enabled = e.data.detail?.enabled ?? true;
            IsAdStrippingEnabled = enabled;

            for (const worker of _$s.workers) {
                worker.postMessage({ key: 'UpdateToggleState', value: enabled });
            }
            _$l('Ad blocking ' + (enabled ? 'enabled' : 'disabled'), enabled ? 'success' : 'warning');
        }
    });
}

function _$bp() {

    let lastBlockTime = 0;

    function _$ipb() {
        if (!document.body) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', _$ipb, { once: true });
            } else {
                setTimeout(_$ipb, 50);
            }
            return;
        }

        function _$pb() {
            const now = Date.now();
            if (now - lastBlockTime < 1000) return; // Debounce 1 second
            lastBlockTime = now;

            _$s.popupsBlocked++;

            window.postMessage({
                type: 'ttvab-popup-blocked',
                detail: { count: _$s.popupsBlocked }
            }, '*');
            _$l('Popup blocked! Total: ' + _$s.popupsBlocked, 'success');
        }

        function _hasAdblockText(el) {
            const text = (el.textContent || '').toLowerCase();
            return (
                text.includes('allow twitch ads') ||
                text.includes('try turbo') ||
                (text.includes('support') && text.includes('by disabling ad block')) ||
                (text.includes('viewers watch ads') && text.includes('turbo'))
            );
        }

        function _$sr() {

            const allButtons = document.querySelectorAll('button');

            for (const btn of allButtons) {
                const btnText = (btn.textContent || '').trim().toLowerCase();

                if (btnText === 'allow twitch ads' || btnText === 'try turbo') {
                    _$l('Found anti-adblock button: "' + btnText + '"', 'warning');

                    let popup = btn.parentElement;
                    let attempts = 0;

                    while (popup && attempts < 20) {

                        const style = window.getComputedStyle(popup);
                        const isOverlay = style.position === 'fixed' || style.position === 'absolute';
                        const hasBackground = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
                        const isLarge = popup.offsetWidth > 200 && popup.offsetHeight > 100;
                        const hasZIndex = parseInt(style.zIndex) > 100;
                        const isPopupClass = popup.className && (
                            popup.className.includes('ScAttach') ||
                            popup.className.includes('Balloon') ||
                            popup.className.includes('Layer') ||
                            popup.className.includes('Modal') ||
                            popup.className.includes('Overlay')
                        );

                        if ((isOverlay || hasZIndex || isPopupClass) && (hasBackground || isLarge)) {

                            if (popup.querySelector('video')) {
                                popup = popup.parentElement;
                                attempts++;
                                continue;
                            }

                            _$l('Hiding popup: ' + (popup.className || popup.tagName), 'success');
                            popup.style.display = 'none';
                            popup.style.visibility = 'hidden';

                            popup.setAttribute('style', (popup.getAttribute('style') || '') + '; display: none !important; visibility: hidden !important;');

                            _$pb();
                            return true;
                        }

                        popup = popup.parentElement;
                        attempts++;
                    }

                    const fallback = btn.closest('div[class]');
                    if (fallback && _hasAdblockText(fallback)) {
                        _$l('Hiding popup (fallback): ' + fallback.className, 'warning');
                        fallback.style.display = 'none';
                        fallback.setAttribute('style', (fallback.getAttribute('style') || '') + '; display: none !important;');
                        _$pb();
                        return true;
                    }
                }
            }

            const popupSelectors = [
                'div[class*="ScAttach"][class*="ScBalloon"]',
                'div[class*="tw-balloon"]',
                'div[class*="consent"]',
                'div[data-a-target="consent-banner"]',
                'div[class*="Layout"][class*="Overlay"]'
            ];

            for (const selector of popupSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        if (_hasAdblockText(el)) {
                            _$l('Hiding popup by selector: ' + selector, 'success');
                            el.style.display = 'none';
                            el.setAttribute('style', (el.getAttribute('style') || '') + '; display: none !important;');
                            _$pb();
                            return true;
                        }
                    }
                } catch {

                }
            }

            const overlays = document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"], div[style*="z-index"]');
            for (const el of overlays) {
                if (_hasAdblockText(el) && el.offsetWidth > 200 && el.offsetHeight > 100) {

                    if (el.querySelector('video')) continue;

                    _$l('Hiding popup overlay', 'success');
                    el.style.display = 'none';
                    el.setAttribute('style', (el.getAttribute('style') || '') + '; display: none !important;');
                    _$pb();
                    return true;
                }
            }

            return false;
        }

        if (_$sr()) {
            _$l('Popup removed on initial scan', 'success');
        }

        let debounceTimer = null;
        const observer = new MutationObserver(function (mutations) {

            let shouldScan = false;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) { // Element node
                        shouldScan = true;
                        break;
                    }
                }
                if (shouldScan) break;
            }

            if (!shouldScan) return;

            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                _$sr();
                debounceTimer = null;
            }, 500);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        function _$is() {
            const delay = document.hidden ? 2000 : 500;
            setTimeout(() => {
                if (!document.hidden) {
                    _$sr();
                }
                _$is();
            }, delay);
        }
        _$is();

        _$l('Anti-adblock popup blocker active', 'success');
    }

    _$ipb();
}

function _$in() {
    if (!_$bs()) return;

    _$ds(window);

    window.addEventListener('message', function (e) {
        if (e.source !== window) return;
        if (!e.data?.type?.startsWith('ttvab-init-')) return;

        if (e.data.type === 'ttvab-init-count' && typeof e.data.detail?.count === 'number') {
            _$s.adsBlocked = e.data.detail.count;

            for (const worker of _$s.workers) {
                worker.postMessage({ key: 'UpdateAdsBlocked', value: _$s.adsBlocked });
            }
            _$l('Restored ads blocked count: ' + _$s.adsBlocked, 'info');
        }

        if (e.data.type === 'ttvab-init-popups-count' && typeof e.data.detail?.count === 'number') {
            _$s.popupsBlocked = e.data.detail.count;
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

    window.postMessage({ type: 'ttvab-request-state' }, '*');

    _$l('Initialized successfully', 'success');
}

_$in();
})();
