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

            const blobUrl = URL.createObjectURL(new Blob([blob]));
            super(blobUrl, opts);

            // Revoke blob URL to free memory (worker already loaded)
            URL.revokeObjectURL(blobUrl);

            // Listen for AdBlocked messages from worker
            this.addEventListener('message', function (e) {
                if (e.data && e.data.key === 'AdBlocked') {
                    _S.adsBlocked = e.data.count;
                    window.dispatchEvent(new CustomEvent('ttvab-ad-blocked', { detail: { count: e.data.count } }));
                }
            });

            _S.workers.push(this);

            // Clean up terminated workers periodically
            if (_S.workers.length > 5) {
                _S.workers = _S.workers.filter(w => w.onmessage !== null);
            }
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
