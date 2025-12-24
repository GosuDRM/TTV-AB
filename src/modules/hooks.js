// TTV AB - Hooks

function _hookWorkerFetch() {
    _log('Worker fetch hooked', 'info');
    const realFetch = fetch;

    function _pruneStreamInfos() {
        const keys = Object.keys(__TTVAB_STATE__.StreamInfos);
        if (keys.length > 5) {
            const oldKey = keys[0];
            delete __TTVAB_STATE__.StreamInfos[oldKey];
            for (const url in __TTVAB_STATE__.StreamInfosByUrl) {
                if (__TTVAB_STATE__.StreamInfosByUrl[url].ChannelName === oldKey) {
                    delete __TTVAB_STATE__.StreamInfosByUrl[url];
                }
            }
        }
    }

    fetch = async function (url, opts) {
        if (typeof url !== 'string') {
            return realFetch.apply(this, arguments);
        }

        if (__TTVAB_STATE__.AdSegmentCache.has(url)) {
            return realFetch('data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292', opts);
        }

        url = url.trimEnd();

        if (url.endsWith('m3u8')) {
            const response = await realFetch(url, opts);
            if (response.status === 200) {
                const text = await response.text();
                return new Response(await _processM3U8(url, text, realFetch));
            }
            return response;
        }

        if (url.includes('/channel/hls/') && !url.includes('picture-by-picture')) {
            __TTVAB_STATE__.V2API = url.includes('/api/v2/');
            const channelMatch = (new URL(url)).pathname.match(/([^/]+)(?=\.\w+$)/);
            const channel = channelMatch?.[0];

            if (__TTVAB_STATE__.ForceAccessTokenPlayerType) {
                const urlObj = new URL(url);
                urlObj.searchParams.delete('parent_domains');
                url = urlObj.toString();
            }

            const response = await realFetch(url, opts);
            if (response.status !== 200) return response;

            const encodings = await response.text();
            const serverTime = _getServerTime(encodings);
            let info = __TTVAB_STATE__.StreamInfos[channel];

            if (info?.EncodingsM3U8) {
                const m3u8Match = info.EncodingsM3U8.match(/^https:.*\.m3u8$/m);
                if (m3u8Match && (await realFetch(m3u8Match[0])).status !== 200) {
                    info = null;
                }
            }

            if (!info?.EncodingsM3U8) {
                _pruneStreamInfos();
                info = __TTVAB_STATE__.StreamInfos[channel] = {
                    ChannelName: channel,
                    IsShowingAd: false,
                    LastPlayerReload: 0,
                    EncodingsM3U8: encodings,
                    ModifiedM3U8: null,
                    IsUsingModifiedM3U8: false,
                    IsUsingFallbackStream: false,
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
                        const attrs = _parseAttrs(lines[i]);
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
                        __TTVAB_STATE__.StreamInfosByUrl[lines[i + 1]] = info;
                    }
                }

                const nonHevcList = info.ResolutionList.filter(r =>
                    r.Codecs?.startsWith('avc') || r.Codecs?.startsWith('av0')
                );
                const hasHevc = info.ResolutionList.some(r =>
                    r.Codecs?.startsWith('hev') || r.Codecs?.startsWith('hvc')
                );

                if (hasHevc && nonHevcList.length > 0) {
                    const modLines = [...lines];
                    for (let mi = 0; mi < modLines.length - 1; mi++) {
                        if (modLines[mi].startsWith('#EXT-X-STREAM-INF')) {
                            const attrs = _parseAttrs(modLines[mi]);
                            const codecs = attrs.CODECS || '';
                            if (codecs.startsWith('hev') || codecs.startsWith('hvc')) {
                                const [tw, th] = (attrs.RESOLUTION || '1920x1080').split('x').map(Number);
                                const closest = nonHevcList.sort((a, b) => {
                                    const [aw, ah] = a.Resolution.split('x').map(Number);
                                    const [bw, bh] = b.Resolution.split('x').map(Number);
                                    return Math.abs(aw * ah - tw * th) - Math.abs(bw * bh - tw * th);
                                })[0];
                                modLines[mi] = modLines[mi].replace(/CODECS="[^"]+"/, `CODECS="${closest.Codecs}"`);
                                modLines[mi + 1] = closest.Url + ' '.repeat(mi + 1);
                            }
                        }
                    }
                    info.ModifiedM3U8 = modLines.join('\n');
                    _log('HEVC stream detected, created fallback M3U8', 'info');
                }

                _log('Stream initialized: ' + channel, 'success');
            }

            info.LastPlayerReload = Date.now();
            const playlist = info.IsUsingModifiedM3U8 ? info.ModifiedM3U8 : info.EncodingsM3U8;
            return new Response(_replaceServerTime(playlist, serverTime));
        }

        return realFetch.apply(this, arguments);
    };
}

function _hookWorker() {
    const reinsertNames = _getReinsert(window.Worker);

    const HookedWorker = class Worker extends _cleanWorker(window.Worker) {
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
                const _C = ${JSON.stringify(_C)};
                const _S = ${JSON.stringify(_S)};
                const _ATTR_REGEX = ${_ATTR_REGEX.toString()};
                ${_log.toString()}
                ${_declareState.toString()}
                ${_incrementAdsBlocked.toString()}
                ${_parseAttrs.toString()}
                ${_getServerTime.toString()}
                ${_replaceServerTime.toString()}
                ${_stripAds.toString()}
                ${_getStreamUrl.toString()}
                ${_getToken.toString()}
                ${_processM3U8.toString()}
                ${_findBackupStream.toString()}
                ${_getWasmJs.toString()}
                ${_hookWorkerFetch.toString()}
                
                const _GQL_URL = '${_GQL_URL}';
                const wasmSource = _getWasmJs('${url.replaceAll("'", "%27")}');
                _declareState(self);
                __TTVAB_STATE__.GQLDeviceID = ${__TTVAB_STATE__.GQLDeviceID ? `'${__TTVAB_STATE__.GQLDeviceID}'` : 'null'};
                __TTVAB_STATE__.AuthorizationHeader = ${__TTVAB_STATE__.AuthorizationHeader ? `'${__TTVAB_STATE__.AuthorizationHeader}'` : 'undefined'};
                __TTVAB_STATE__.ClientIntegrityHeader = ${__TTVAB_STATE__.ClientIntegrityHeader ? `'${__TTVAB_STATE__.ClientIntegrityHeader}'` : 'null'};
                __TTVAB_STATE__.ClientVersion = ${__TTVAB_STATE__.ClientVersion ? `'${__TTVAB_STATE__.ClientVersion}'` : 'null'};
                __TTVAB_STATE__.ClientSession = ${__TTVAB_STATE__.ClientSession ? `'${__TTVAB_STATE__.ClientSession}'` : 'null'};
                __TTVAB_STATE__.PlaybackAccessTokenHash = ${__TTVAB_STATE__.PlaybackAccessTokenHash ? `'${__TTVAB_STATE__.PlaybackAccessTokenHash}'` : 'null'};
                
                self.addEventListener('message', function(e) {
                    const data = e.data;
                    if (!data?.key) return;
                    switch (data.key) {
                        case 'UpdateClientVersion': __TTVAB_STATE__.ClientVersion = data.value; break;
                        case 'UpdateClientSession': __TTVAB_STATE__.ClientSession = data.value; break;
                        case 'UpdateClientId': __TTVAB_STATE__.ClientID = data.value; break;
                        case 'UpdateDeviceId': __TTVAB_STATE__.GQLDeviceID = data.value; break;
                        case 'UpdateClientIntegrityHeader': __TTVAB_STATE__.ClientIntegrityHeader = data.value; break;
                        case 'UpdateAuthorizationHeader': __TTVAB_STATE__.AuthorizationHeader = data.value; break;
                        case 'UpdateToggleState': __TTVAB_STATE__.IsAdStrippingEnabled = data.value; break;
                        case 'UpdateAdsBlocked': _S.adsBlocked = data.value; break;
                        case 'UpdateGQLHash': __TTVAB_STATE__.PlaybackAccessTokenHash = data.value; break;
                    }
                });
                
                _hookWorkerFetch();
                eval(wasmSource);
            `;

            const blobUrl = URL.createObjectURL(new Blob([injectedCode]));
            super(blobUrl, opts);
            URL.revokeObjectURL(blobUrl);

            this.addEventListener('message', function (e) {
                if (!e.data?.key) return;

                switch (e.data.key) {
                    case 'AdBlocked':
                        _S.adsBlocked = e.data.count;
                        window.postMessage({
                            type: 'ttvab-ad-blocked',
                            detail: { count: e.data.count, channel: e.data.channel || null }
                        }, '*');
                        _log('Ad blocked! Total: ' + e.data.count, 'success');
                        break;
                    case 'AdDetected':
                        _log('Ad detected, blocking...', 'warning');
                        break;
                    case 'AdEnded':
                        _log('Ad ended', 'success');
                        try {
                            const pipSelectors = [
                                '[data-a-target="video-player-pip-container"]',
                                '[data-a-target="video-player-mini-player"]',
                                '.video-player__pip-container',
                                '.video-player__mini-player',
                                '.mini-player',
                                '[class*="mini-player"]',
                                '[class*="pip-container"]'
                            ];
                            pipSelectors.forEach(sel => {
                                document.querySelectorAll(sel).forEach(el => {
                                    el.style.display = 'none';
                                    el.remove();
                                });
                            });
                        } catch (_e) { }
                        break;
                    case 'ReloadPlayer':
                        _log('Reloading player', 'info');
                        if (typeof _doPlayerTask === 'function') {
                            _doPlayerTask(false, true);
                        }
                        break;
                    case 'PauseResumePlayer':
                        _log('Resuming player', 'info');
                        if (typeof _doPlayerTask === 'function') {
                            _doPlayerTask(true, false);
                        }
                        break;
                }
            });

            const workerUrl = url;
            const workerOpts = opts;
            let restartAttempts = 0;
            const MAX_RESTART_ATTEMPTS = 3;
            const workerSelf = this;

            this.addEventListener('error', function (e) {
                _log('Worker crashed: ' + (e.message || 'Unknown error'), 'error');

                const idx = _S.workers.indexOf(workerSelf);
                if (idx > -1) _S.workers.splice(idx, 1);

                if (restartAttempts < MAX_RESTART_ATTEMPTS) {
                    restartAttempts++;
                    const delay = Math.pow(2, restartAttempts) * 500;
                    _log('Restarting worker in ' + (delay / 1000) + 's (attempt ' + restartAttempts + '/' + MAX_RESTART_ATTEMPTS + ')', 'warning');

                    setTimeout(function () {
                        try {
                            new window.Worker(workerUrl, workerOpts);
                            _log('Worker restarted', 'success');
                            restartAttempts = 0;
                        } catch (restartErr) {
                            _log('Worker restart failed: ' + restartErr.message, 'error');
                        }
                    }, delay);
                } else {
                    _log('Worker restart limit reached', 'error');
                }
            });

            _S.workers.push(this);

            if (_S.workers.length > 5) {
                const oldWorker = _S.workers.shift();
                try { oldWorker.terminate(); } catch { }
            }
        }
    };

    let workerInstance = _reinsert(HookedWorker, reinsertNames);
    Object.defineProperty(window, 'Worker', {
        get: () => workerInstance,
        set: (v) => { if (_isValid(v)) workerInstance = v; }
    });
}

function _hookStorage() {
    try {
        const originalGetItem = localStorage.getItem.bind(localStorage);
        localStorage.getItem = function (key) {
            const value = originalGetItem(key);
            if (key === 'unique_id' && value) __TTVAB_STATE__.GQLDeviceID = value;
            return value;
        };
        const deviceId = originalGetItem('unique_id');
        if (deviceId) __TTVAB_STATE__.GQLDeviceID = deviceId;
    } catch (e) {
        _log('Storage hook error: ' + e.message, 'warning');
    }
}

function _hookMainFetch() {
    const realFetch = window.fetch;

    window.fetch = async function (url, opts) {
        if (url) {
            const urlStr = (url instanceof Request) ? url.url : url.toString();
            if (urlStr.includes('gql.twitch.tv/gql')) {
                const response = await realFetch.apply(this, arguments);

                let headers = opts?.headers;

                if (url instanceof Request) {
                    headers = url.headers;
                    try {
                        const clone = url.clone();
                        clone.json().then(data => {
                            const operations = Array.isArray(data) ? data : [data];
                            for (const op of operations) {
                                if (op.operationName === 'PlaybackAccessToken' && op.extensions?.persistedQuery?.sha256Hash) {
                                    const hash = op.extensions.persistedQuery.sha256Hash;
                                    if (__TTVAB_STATE__.PlaybackAccessTokenHash !== hash) {
                                        __TTVAB_STATE__.PlaybackAccessTokenHash = hash;
                                        for (const worker of _S.workers) {
                                            worker.postMessage({ key: 'UpdateGQLHash', value: hash });
                                        }
                                    }
                                }
                            }
                        }).catch(() => { });
                    } catch (_e) { }
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
                        __TTVAB_STATE__.ClientIntegrityHeader = integrity;
                        updates.push({ key: 'UpdateClientIntegrityHeader', value: __TTVAB_STATE__.ClientIntegrityHeader });
                    }
                    if (auth) {
                        __TTVAB_STATE__.AuthorizationHeader = auth;
                        updates.push({ key: 'UpdateAuthorizationHeader', value: __TTVAB_STATE__.AuthorizationHeader });
                    }
                    if (version) {
                        __TTVAB_STATE__.ClientVersion = version;
                        updates.push({ key: 'UpdateClientVersion', value: __TTVAB_STATE__.ClientVersion });
                    }
                    if (session) {
                        __TTVAB_STATE__.ClientSession = session;
                        updates.push({ key: 'UpdateClientSession', value: __TTVAB_STATE__.ClientSession });
                    }
                    if (device) {
                        __TTVAB_STATE__.GQLDeviceID = device;
                        updates.push({ key: 'UpdateDeviceId', value: __TTVAB_STATE__.GQLDeviceID });
                    }

                    if (updates.length > 0) {
                        for (const worker of _S.workers) {
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
