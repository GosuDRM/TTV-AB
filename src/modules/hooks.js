/**
 * TTV AB - Hooks Module
 * Fetch and Worker interception
 * @module hooks
 * @private
 */

/**
 * Hook fetch API inside Web Worker context
 */
function _hookWorkerFetch() {
    _log('Worker fetch hooked', 'info');
    const realFetch = fetch;

    function _pruneStreamInfos() {
        const keys = Object.keys(StreamInfos);
        if (keys.length > 5) {
            const oldKey = keys[0]; // Simple FIFO
            delete StreamInfos[oldKey];
            // Also clean up by URL references
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

        // Return cached ad segment as empty video
        if (AdSegmentCache.has(url)) {
            return realFetch('data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292', opts);
        }

        url = url.trimEnd();

        // Process M3U8 playlists
        if (url.endsWith('m3u8')) {
            const response = await realFetch(url, opts);
            if (response.status === 200) {
                const text = await response.text();
                return new Response(await _processM3U8(url, text, realFetch));
            }
            return response;
        }

        // Handle channel HLS requests
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
            const serverTime = _getServerTime(encodings);
            let info = StreamInfos[channel];

            // Validate existing info
            if (info?.EncodingsM3U8) {
                const m3u8Match = info.EncodingsM3U8.match(/^https:.*\.m3u8$/m);
                if (m3u8Match && (await realFetch(m3u8Match[0])).status !== 200) {
                    info = null;
                }
            }

            // Initialize stream info
            if (!info?.EncodingsM3U8) {
                _pruneStreamInfos();
                info = StreamInfos[channel] = {
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
                        StreamInfosByUrl[lines[i + 1]] = info;
                    }
                }

                // HEVC/4K Support: Create modified M3U8 with codec swapping
                // When a stream has HEVC qualities, Chrome can't play them during ad transitions
                // This creates a fallback M3U8 that swaps HEVC resolutions to closest AVC equivalents
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
                                // Find closest AVC resolution by pixel count
                                const [tw, th] = (attrs.RESOLUTION || '1920x1080').split('x').map(Number);
                                const closest = nonHevcList.sort((a, b) => {
                                    const [aw, ah] = a.Resolution.split('x').map(Number);
                                    const [bw, bh] = b.Resolution.split('x').map(Number);
                                    return Math.abs(aw * ah - tw * th) - Math.abs(bw * bh - tw * th);
                                })[0];
                                // Swap codecs and URL
                                modLines[mi] = modLines[mi].replace(/CODECS="[^"]+"/, `CODECS="${closest.Codecs}"`);
                                modLines[mi + 1] = closest.Url + ' '.repeat(mi + 1); // Unique URL per line
                            }
                        }
                    }
                    info.ModifiedM3U8 = modLines.join('\n');
                    _log('HEVC stream detected, created modified M3U8 for fallback', 'info');
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

/**
 * Hook Worker constructor to inject ad blocking
 */
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

            // Inject ad blocking code into worker
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
                        case 'UpdateAdsBlocked': _S.adsBlocked = data.value; break;
                    }
                });
                
                _hookWorkerFetch();
                eval(wasmSource);
            `;

            const blobUrl = URL.createObjectURL(new Blob([injectedCode]));
            super(blobUrl, opts);
            URL.revokeObjectURL(blobUrl);

            // Listen for messages from worker
            this.addEventListener('message', function (e) {
                if (!e.data?.key) return;

                switch (e.data.key) {
                    case 'AdBlocked':
                        _S.adsBlocked = e.data.count;
                        // Use window.postMessage to cross MAIN→ISOLATED world boundary
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
                        break;
                    case 'ReloadPlayer':
                        _log('Reloading player after ad', 'info');
                        if (typeof _doPlayerTask === 'function') {
                            _doPlayerTask(false, true);
                        }
                        break;
                    case 'PauseResumePlayer':
                        _log('Resuming player after ad', 'info');
                        if (typeof _doPlayerTask === 'function') {
                            _doPlayerTask(true, false);
                        }
                        break;
                }
            });

            // Worker crash detection and auto-restart
            const workerUrl = url;
            const workerOpts = opts;
            let restartAttempts = 0;
            const MAX_RESTART_ATTEMPTS = 3;
            const workerSelf = this;

            this.addEventListener('error', function (e) {
                _log('Worker crashed: ' + (e.message || 'Unknown error'), 'error');

                // Remove crashed worker from the list
                const idx = _S.workers.indexOf(workerSelf);
                if (idx > -1) _S.workers.splice(idx, 1);

                // Auto-restart with exponential backoff
                if (restartAttempts < MAX_RESTART_ATTEMPTS) {
                    restartAttempts++;
                    const delay = Math.pow(2, restartAttempts) * 500; // 1s, 2s, 4s
                    _log('Auto-restarting worker in ' + (delay / 1000) + 's (attempt ' + restartAttempts + '/' + MAX_RESTART_ATTEMPTS + ')', 'warning');

                    setTimeout(function () {
                        try {
                            // Create a new worker using the hooked Worker constructor
                            new window.Worker(workerUrl, workerOpts);
                            _log('Worker restarted successfully', 'success');
                            restartAttempts = 0; // Reset on success
                        } catch (restartErr) {
                            _log('Worker restart failed: ' + restartErr.message, 'error');
                        }
                    }, delay);
                } else {
                    _log('Worker restart limit reached. Please refresh the page.', 'error');
                }
            });

            _S.workers.push(this);

            // Cleanup old workers
            // Keep only the last 5 workers to prevent memory leaks
            if (_S.workers.length > 5) {
                const oldWorker = _S.workers.shift();
                try { oldWorker.terminate(); } catch { /* Worker may already be terminated */ }
            }
        }
    };

    let workerInstance = _reinsert(HookedWorker, reinsertNames);
    Object.defineProperty(window, 'Worker', {
        get: () => workerInstance,
        set: (v) => { if (_isValid(v)) workerInstance = v; }
    });
}

/**
 * Hook localStorage to capture device ID
 */
function _hookStorage() {
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
        _log('Storage hook error: ' + e.message, 'warning');
    }
}

/**
 * Hook main window fetch to capture auth headers
 */
function _hookMainFetch() {
    const realFetch = window.fetch;

    window.fetch = async function (url, opts) {
        if (url) {
            const urlStr = (url instanceof Request) ? url.url : url.toString();
            if (urlStr.includes('gql.twitch.tv/gql')) {
                const response = await realFetch.apply(this, arguments);

                // Extract headers safely (could be plain object or Headers object)
                let headers = opts?.headers;

                // Handle Fetch API Request object as first argument
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

                    // Batch update workers
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
