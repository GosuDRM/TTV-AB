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
                ${_gqlReq.toString()}
                ${_getToken.toString()}
                ${_processM3U8.toString()}
                ${_getWasmJs.toString()}
                ${_hookWorkerFetch.toString()}
                
                // Helper to prune old StreamInfos to prevent memory leaks
                function _pruneStreamInfos() {
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
                        _log('Ad blocked! Total: ' + e.data.count, 'success');
                        document.dispatchEvent(new CustomEvent('ttvab-ad-blocked', {
                            detail: { count: e.data.count, channel: e.data.channel || null }
                        }));
                        break;
                    case 'AdDetected':
                        _log('Ad detected, blocking...', 'warning');
                        break;
                    case 'AdEnded':
                        _log('Ad ended', 'success');
                        break;

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
