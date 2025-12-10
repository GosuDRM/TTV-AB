/**
 * TTV AB - Content Script
 * Blocks ads on Twitch.tv live streams by intercepting
 * HLS playlists and stripping ad segments.
 * 
 * @author GosuDRM
 * @version 3.0.0
 * @license MIT
 * @see https://github.com/GosuDRM/TTV-AB
 */
(function () {
    'use strict';

    // ===========================================
    // CONSTANTS & VERSION
    // ===========================================

    const VERSION = '3.0.1';
    const ourTtvabVersion = 19;

    // Prevent duplicate script execution
    if (typeof window.ttvabVersion !== 'undefined' && window.ttvabVersion >= ourTtvabVersion) {
        console.log('[TTV AB] Skipping - another script is active');
        return;
    }
    window.ttvabVersion = ourTtvabVersion;

    console.log('[TTV AB] v' + VERSION + ' loaded');

    // ===========================================
    // CONFIGURATION
    // ===========================================

    /**
     * Initializes global configuration options
     * @param {Object} scope - The scope to attach options to (window or self)
     */
    function declareOptions(scope) {
        scope.AdSignifier = 'stitched';
        scope.ClientID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
        scope.BackupPlayerTypes = [
            'embed',
            'site',
            'autoplay',
            'picture-by-picture-CACHED'
        ];
        scope.FallbackPlayerType = 'embed';
        scope.ForceAccessTokenPlayerType = 'site';
        scope.SkipPlayerReloadOnHevc = false;
        scope.AlwaysReloadPlayerOnAd = false;
        scope.ReloadPlayerAfterAd = true;
        scope.PlayerReloadMinimalRequestsTime = 1500;
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
        scope.PlayerBufferingFix = true;
        scope.PlayerBufferingDelay = 500;
        scope.PlayerBufferingSameStateCount = 3;
        scope.PlayerBufferingDangerZone = 1;
        scope.PlayerBufferingDoPlayerReload = false;
        scope.PlayerBufferingMinRepeatDelay = 5000;
        scope.V2API = false;
        scope.IsAdStrippingEnabled = true;
        scope.AdSegmentCache = new Map();
        scope.AllSegmentsAreAdSegments = false;
    }

    declareOptions(window);

    // ===========================================
    // STATE VARIABLES
    // ===========================================

    const twitchWorkers = [];
    const workerStringConflicts = ['twitch', 'isVariantA'];
    const workerStringAllow = [];
    const workerStringReinsert = ['isVariantA', 'besuper/', '${patch_url}'];

    // ===========================================
    // WORKER MANAGEMENT
    // ===========================================

    /**
     * Cleans worker prototype chain to remove conflicting scripts
     * @param {Function} worker - Worker constructor
     * @returns {Function} Cleaned worker
     */
    function getCleanWorker(worker) {
        let root = null;
        let parent = null;
        let proto = worker;
        while (proto) {
            const workerString = proto.toString();
            if (workerStringConflicts.some((x) => workerString.includes(x)) && !workerStringAllow.some((x) => workerString.includes(x))) {
                if (parent !== null) {
                    Object.setPrototypeOf(parent, Object.getPrototypeOf(proto));
                }
            } else {
                if (root === null) {
                    root = proto;
                }
                parent = proto;
            }
            proto = Object.getPrototypeOf(proto);
        }
        return root;
    }

    function getWorkersForReinsert(worker) {
        const result = [];
        let proto = worker;
        while (proto) {
            const workerString = proto.toString();
            if (workerStringReinsert.some((x) => workerString.includes(x))) {
                result.push(proto);
            }
            proto = Object.getPrototypeOf(proto);
        }
        return result;
    }

    function reinsertWorkers(worker, reinsert) {
        let parent = worker;
        for (let i = 0; i < reinsert.length; i++) {
            Object.setPrototypeOf(reinsert[i], parent);
            parent = reinsert[i];
        }
        return parent;
    }

    function isValidWorker(worker) {
        const workerString = worker.toString();
        return !workerStringConflicts.some((x) => workerString.includes(x))
            || workerStringAllow.some((x) => workerString.includes(x))
            || workerStringReinsert.some((x) => workerString.includes(x));
    }

    // ===========================================
    // M3U8 PARSING & MANIPULATION
    // ===========================================

    /**
     * Parses HLS tag attributes into key-value pairs
     * @param {string} str - HLS tag string
     * @returns {Object} Parsed attributes
     */
    function parseAttributes(str) {
        const result = {};
        const regex = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
        let match;
        while ((match = regex.exec(str)) !== null) {
            let value = match[2];
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            result[match[1].toUpperCase()] = value;
        }
        return result;
    }

    /**
     * Extracts server time from M3U8 manifest
     */
    function getServerTimeFromM3u8(encodingsM3u8) {
        if (V2API) {
            const matches = encodingsM3u8.match(/#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="([^"]+)"/);
            return matches && matches.length > 1 ? matches[1] : null;
        }
        const matches = encodingsM3u8.match('SERVER-TIME="([0-9.]+)"');
        return matches && matches.length > 1 ? matches[1] : null;
    }

    /**
     * Replaces server time in M3U8 manifest
     */
    function replaceServerTimeInM3u8(encodingsM3u8, newServerTime) {
        if (V2API) {
            return newServerTime ? encodingsM3u8.replace(/(#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE=")[^"]+(")/, `$1${newServerTime}$2`) : encodingsM3u8;
        }
        return newServerTime ? encodingsM3u8.replace(new RegExp('(SERVER-TIME=")[0-9.]+"'), `SERVER-TIME="${newServerTime}"`) : encodingsM3u8;
    }

    /**
     * Removes ad segments from M3U8 playlist
     * @param {string} textStr - M3U8 content
     * @param {boolean} stripAllSegments - Whether to strip all segments
     * @param {Object} streamInfo - Stream metadata
     * @returns {string} Cleaned M3U8 content
     */
    function stripAdSegments(textStr, stripAllSegments, streamInfo) {
        let hasStrippedAdSegments = false;
        const lines = textStr.replaceAll('\r', '').split('\n');
        const newAdUrl = 'https://twitch.tv';

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            line = line
                .replaceAll(/(X-TV-TWITCH-AD-URL=")(?:[^"]*)(")/g, `$1${newAdUrl}$2`)
                .replaceAll(/(X-TV-TWITCH-AD-CLICK-TRACKING-URL=")(?:[^"]*)(")/g, `$1${newAdUrl}$2`);
            lines[i] = line;

            if (i < lines.length - 1 && line.startsWith('#EXTINF') && (!line.includes(',live') || stripAllSegments || AllSegmentsAreAdSegments)) {
                const segmentUrl = lines[i + 1];
                if (!AdSegmentCache.has(segmentUrl)) {
                    streamInfo.NumStrippedAdSegments++;
                }
                AdSegmentCache.set(segmentUrl, Date.now());
                hasStrippedAdSegments = true;
            }

            if (line.includes(AdSignifier)) {
                hasStrippedAdSegments = true;
            }
        }

        if (hasStrippedAdSegments) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXT-X-TWITCH-PREFETCH:')) {
                    lines[i] = '';
                }
            }
        } else {
            streamInfo.NumStrippedAdSegments = 0;
        }

        streamInfo.IsStrippingAdSegments = hasStrippedAdSegments;

        AdSegmentCache.forEach((value, key, map) => {
            if (value < Date.now() - 120000) {
                map.delete(key);
            }
        });

        return lines.join('\n');
    }

    function getStreamUrlForResolution(encodingsM3u8, resolutionInfo) {
        const encodingsLines = encodingsM3u8.replaceAll('\r', '').split('\n');
        const [targetWidth, targetHeight] = resolutionInfo.Resolution.split('x').map(Number);
        let matchedResolutionUrl = null;
        let matchedFrameRate = false;
        let closestResolutionUrl = null;
        let closestResolutionDifference = Infinity;

        for (let i = 0; i < encodingsLines.length - 1; i++) {
            if (encodingsLines[i].startsWith('#EXT-X-STREAM-INF') && encodingsLines[i + 1].includes('.m3u8')) {
                const attributes = parseAttributes(encodingsLines[i]);
                const resolution = attributes['RESOLUTION'];
                const frameRate = attributes['FRAME-RATE'];

                if (resolution) {
                    if (resolution == resolutionInfo.Resolution && (!matchedResolutionUrl || (!matchedFrameRate && frameRate == resolutionInfo.FrameRate))) {
                        matchedResolutionUrl = encodingsLines[i + 1];
                        matchedFrameRate = frameRate == resolutionInfo.FrameRate;
                        if (matchedFrameRate) {
                            return matchedResolutionUrl;
                        }
                    }
                    const [width, height] = resolution.split('x').map(Number);
                    const difference = Math.abs((width * height) - (targetWidth * targetHeight));
                    if (difference < closestResolutionDifference) {
                        closestResolutionUrl = encodingsLines[i + 1];
                        closestResolutionDifference = difference;
                    }
                }
            }
        }
        return matchedResolutionUrl || closestResolutionUrl;
    }

    // ===========================================
    // TWITCH API
    // ===========================================

    /**
     * Makes a GraphQL request to Twitch API
     * @param {Object} body - GraphQL query body
     * @returns {Promise<Response>} Fetch response
     */
    async function gqlRequest(body) {
        const headers = {
            'Client-Id': ClientID,
            'Content-Type': 'application/json'
        };
        if (GQLDeviceID) headers['X-Device-Id'] = GQLDeviceID;
        if (ClientVersion) headers['Client-Version'] = ClientVersion;
        if (ClientSession) headers['Client-Session-Id'] = ClientSession;
        if (ClientIntegrityHeader) headers['Client-Integrity'] = ClientIntegrityHeader;
        if (AuthorizationHeader) headers['Authorization'] = AuthorizationHeader;

        return fetch('https://gql.twitch.tv/gql', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
    }

    async function getAccessToken(channelName, playerType) {
        const query = {
            operationName: 'PlaybackAccessToken_Template',
            query: 'query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) { streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) { value signature __typename } videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) { value signature __typename }}',
            variables: {
                isLive: true,
                login: channelName,
                isVod: false,
                vodID: '',
                playerType: playerType
            }
        };
        return gqlRequest(query);
    }

    async function processM3U8(url, textStr, realFetch) {
        // Skip ad blocking if disabled
        if (!IsAdStrippingEnabled) {
            return textStr;
        }

        const streamInfo = StreamInfosByUrl[url];
        if (!streamInfo) {
            return textStr;
        }

        if (HasTriggeredPlayerReload) {
            HasTriggeredPlayerReload = false;
            streamInfo.LastPlayerReload = Date.now();
        }

        const haveAdTags = textStr.includes(AdSignifier) || SimulatedAdsDepth > 0;

        if (haveAdTags) {
            streamInfo.IsMidroll = textStr.includes('"MIDROLL"') || textStr.includes('"midroll"');

            if (!streamInfo.IsShowingAd) {
                streamInfo.IsShowingAd = true;
                console.log('[TTV AB] Ad detected, blocking...');
            }

            if (!streamInfo.IsMidroll) {
                const lines = textStr.replaceAll('\r', '').split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.startsWith('#EXTINF') && lines.length > i + 1) {
                        if (!line.includes(',live') && !streamInfo.RequestedAds.has(lines[i + 1])) {
                            streamInfo.RequestedAds.add(lines[i + 1]);
                            fetch(lines[i + 1]).then((response) => { response.blob(); }).catch(() => { });
                            break;
                        }
                    }
                }
            }

            const currentResolution = streamInfo.Urls[url];
            if (!currentResolution) {
                console.log('[TTV AB] Missing resolution info for ' + url);
                return textStr;
            }

            const isHevc = currentResolution.Codecs.startsWith('hev') || currentResolution.Codecs.startsWith('hvc');
            if (((isHevc && !SkipPlayerReloadOnHevc) || AlwaysReloadPlayerOnAd) && streamInfo.ModifiedM3U8 && !streamInfo.IsUsingModifiedM3U8) {
                streamInfo.IsUsingModifiedM3U8 = true;
                streamInfo.LastPlayerReload = Date.now();
            }

            let backupPlayerType = null;
            let backupM3u8 = null;
            let fallbackM3u8 = null;
            let startIndex = 0;
            let isDoingMinimalRequests = false;

            if (streamInfo.LastPlayerReload > Date.now() - PlayerReloadMinimalRequestsTime) {
                startIndex = PlayerReloadMinimalRequestsPlayerIndex;
                isDoingMinimalRequests = true;
            }

            for (let playerTypeIndex = startIndex; !backupM3u8 && playerTypeIndex < BackupPlayerTypes.length; playerTypeIndex++) {
                const playerType = BackupPlayerTypes[playerTypeIndex];
                const realPlayerType = playerType.replace('-CACHED', '');
                const isFullyCachedPlayerType = playerType != realPlayerType;

                for (let i = 0; i < 2; i++) {
                    let isFreshM3u8 = false;
                    let encodingsM3u8 = streamInfo.BackupEncodingsM3U8Cache[playerType];

                    if (!encodingsM3u8) {
                        isFreshM3u8 = true;
                        try {
                            const accessTokenResponse = await getAccessToken(streamInfo.ChannelName, realPlayerType);
                            if (accessTokenResponse.status === 200) {
                                const accessToken = await accessTokenResponse.json();
                                if (accessToken?.data?.streamPlaybackAccessToken?.signature) {
                                    const urlInfo = new URL('https://usher.ttvnw.net/api/' + (V2API ? 'v2/' : '') + 'channel/hls/' + streamInfo.ChannelName + '.m3u8' + streamInfo.UsherParams);
                                    urlInfo.searchParams.set('sig', accessToken.data.streamPlaybackAccessToken.signature);
                                    urlInfo.searchParams.set('token', accessToken.data.streamPlaybackAccessToken.value);
                                    const encodingsM3u8Response = await realFetch(urlInfo.href);
                                    if (encodingsM3u8Response.status === 200) {
                                        encodingsM3u8 = streamInfo.BackupEncodingsM3U8Cache[playerType] = await encodingsM3u8Response.text();
                                    }
                                }
                            }
                        } catch (err) {
                            console.log('[TTV AB] Error getting backup stream:', err);
                        }
                    }

                    if (encodingsM3u8) {
                        try {
                            const streamM3u8Url = getStreamUrlForResolution(encodingsM3u8, currentResolution);
                            const streamM3u8Response = await realFetch(streamM3u8Url);
                            if (streamM3u8Response.status == 200) {
                                const m3u8Text = await streamM3u8Response.text();
                                if (m3u8Text) {
                                    if (playerType == FallbackPlayerType) {
                                        fallbackM3u8 = m3u8Text;
                                    }
                                    if ((!m3u8Text.includes(AdSignifier) && (SimulatedAdsDepth == 0 || playerTypeIndex >= SimulatedAdsDepth - 1)) || (!fallbackM3u8 && playerTypeIndex >= BackupPlayerTypes.length - 1)) {
                                        backupPlayerType = playerType;
                                        backupM3u8 = m3u8Text;
                                        break;
                                    }
                                    if (isFullyCachedPlayerType) {
                                        break;
                                    }
                                    if (isDoingMinimalRequests) {
                                        backupPlayerType = playerType;
                                        backupM3u8 = m3u8Text;
                                        break;
                                    }
                                }
                            }
                        } catch (err) { }
                    }

                    streamInfo.BackupEncodingsM3U8Cache[playerType] = null;
                    if (isFreshM3u8) {
                        break;
                    }
                }
            }

            if (!backupM3u8 && fallbackM3u8) {
                backupPlayerType = FallbackPlayerType;
                backupM3u8 = fallbackM3u8;
            }

            if (backupM3u8) {
                textStr = backupM3u8;
            }

            if (streamInfo.ActiveBackupPlayerType != backupPlayerType) {
                streamInfo.ActiveBackupPlayerType = backupPlayerType;
                console.log('[TTV AB] Using backup player type: ' + backupPlayerType);
            }

            textStr = stripAdSegments(textStr, false, streamInfo);

        } else {
            if (streamInfo.IsShowingAd) {
                streamInfo.IsShowingAd = false;
                streamInfo.IsUsingModifiedM3U8 = false;
                streamInfo.RequestedAds.clear();
                streamInfo.BackupEncodingsM3U8Cache = [];
                streamInfo.ActiveBackupPlayerType = null;
                console.log('[TTV AB] Ad ended');
            }
        }

        return textStr;
    }

    function getWasmWorkerJs(twitchBlobUrl) {
        const req = new XMLHttpRequest();
        req.open('GET', twitchBlobUrl, false);
        req.overrideMimeType("text/javascript");
        req.send();
        return req.responseText;
    }

    // ===========================================
    // FETCH HOOKS
    // ===========================================

    /**
     * Hooks worker fetch to intercept M3U8 requests
     */
    function hookWorkerFetch() {
        console.log('[TTV AB] hookWorkerFetch');
        const realFetch = fetch;
        fetch = async function (url, options) {
            if (typeof url === 'string') {
                if (AdSegmentCache.has(url)) {
                    return new Promise(function (resolve, reject) {
                        realFetch('data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292', options).then(function (response) {
                            resolve(response);
                        }).catch(function (err) {
                            reject(err);
                        });
                    });
                }

                url = url.trimEnd();
                if (url.endsWith('m3u8')) {
                    return new Promise(function (resolve, reject) {
                        const processAfter = async function (response) {
                            if (response.status === 200) {
                                resolve(new Response(await processM3U8(url, await response.text(), realFetch)));
                            } else {
                                resolve(response);
                            }
                        };
                        realFetch(url, options).then(function (response) {
                            processAfter(response);
                        }).catch(function (err) {
                            reject(err);
                        });
                    });
                } else if (url.includes('/channel/hls/') && !url.includes('picture-by-picture')) {
                    V2API = url.includes('/api/v2/');
                    const channelName = (new URL(url)).pathname.match(/([^\/]+)(?=\.\w+$)/)[0];

                    if (ForceAccessTokenPlayerType) {
                        const tempUrl = new URL(url);
                        tempUrl.searchParams.delete('parent_domains');
                        url = tempUrl.toString();
                    }

                    return new Promise(function (resolve, reject) {
                        const processAfter = async function (response) {
                            if (response.status == 200) {
                                const encodingsM3u8 = await response.text();
                                const serverTime = getServerTimeFromM3u8(encodingsM3u8);
                                let streamInfo = StreamInfos[channelName];

                                if (streamInfo != null && streamInfo.EncodingsM3U8 != null && (await realFetch(streamInfo.EncodingsM3U8.match(/^https:.*\.m3u8$/m)[0])).status !== 200) {
                                    streamInfo = null;
                                }

                                if (streamInfo == null || streamInfo.EncodingsM3U8 == null) {
                                    StreamInfos[channelName] = streamInfo = {
                                        ChannelName: channelName,
                                        IsShowingAd: false,
                                        LastPlayerReload: 0,
                                        EncodingsM3U8: encodingsM3u8,
                                        ModifiedM3U8: null,
                                        IsUsingModifiedM3U8: false,
                                        UsherParams: (new URL(url)).search,
                                        RequestedAds: new Set(),
                                        Urls: [],
                                        ResolutionList: [],
                                        BackupEncodingsM3U8Cache: [],
                                        ActiveBackupPlayerType: null,
                                        IsMidroll: false,
                                        IsStrippingAdSegments: false,
                                        NumStrippedAdSegments: 0
                                    };

                                    const lines = encodingsM3u8.replaceAll('\r', '').split('\n');
                                    for (let i = 0; i < lines.length - 1; i++) {
                                        if (lines[i].startsWith('#EXT-X-STREAM-INF') && lines[i + 1].includes('.m3u8')) {
                                            const attributes = parseAttributes(lines[i]);
                                            const resolution = attributes['RESOLUTION'];
                                            if (resolution) {
                                                const resolutionInfo = {
                                                    Resolution: resolution,
                                                    FrameRate: attributes['FRAME-RATE'],
                                                    Codecs: attributes['CODECS'],
                                                    Url: lines[i + 1]
                                                };
                                                streamInfo.Urls[lines[i + 1]] = resolutionInfo;
                                                streamInfo.ResolutionList.push(resolutionInfo);
                                            }
                                            StreamInfosByUrl[lines[i + 1]] = streamInfo;
                                        }
                                    }

                                    console.log('[TTV AB] Stream initialized: ' + channelName);
                                }

                                streamInfo.LastPlayerReload = Date.now();
                                resolve(new Response(replaceServerTimeInM3u8(streamInfo.IsUsingModifiedM3U8 ? streamInfo.ModifiedM3U8 : streamInfo.EncodingsM3U8, serverTime)));
                            } else {
                                resolve(response);
                            }
                        };

                        realFetch(url, options).then(function (response) {
                            processAfter(response);
                        }).catch(function (err) {
                            reject(err);
                        });
                    });
                }
            }
            return realFetch.apply(this, arguments);
        };
    }

    function hookWindowWorker() {
        const reinsert = getWorkersForReinsert(window.Worker);
        const newWorker = class Worker extends getCleanWorker(window.Worker) {
            constructor(twitchBlobUrl, options) {
                let isTwitchWorker = false;
                try {
                    isTwitchWorker = new URL(twitchBlobUrl).origin.endsWith('.twitch.tv');
                } catch { }

                if (!isTwitchWorker) {
                    super(twitchBlobUrl, options);
                    return;
                }

                const newBlobStr = `
                ${declareOptions.toString()}
                ${parseAttributes.toString()}
                ${getServerTimeFromM3u8.toString()}
                ${replaceServerTimeInM3u8.toString()}
                ${stripAdSegments.toString()}
                ${getStreamUrlForResolution.toString()}
                ${gqlRequest.toString()}
                ${getAccessToken.toString()}
                ${processM3U8.toString()}
                ${getWasmWorkerJs.toString()}
                ${hookWorkerFetch.toString()}
                
                const workerString = getWasmWorkerJs('${twitchBlobUrl.replaceAll("'", "%27")}');
                declareOptions(self);
                GQLDeviceID = ${GQLDeviceID ? "'" + GQLDeviceID + "'" : null};
                AuthorizationHeader = ${AuthorizationHeader ? "'" + AuthorizationHeader + "'" : undefined};
                ClientIntegrityHeader = ${ClientIntegrityHeader ? "'" + ClientIntegrityHeader + "'" : null};
                ClientVersion = ${ClientVersion ? "'" + ClientVersion + "'" : null};
                ClientSession = ${ClientSession ? "'" + ClientSession + "'" : null};
                
                self.addEventListener('message', function(e) {
                    if (e.data.key == 'UpdateClientVersion') {
                        ClientVersion = e.data.value;
                    } else if (e.data.key == 'UpdateClientSession') {
                        ClientSession = e.data.value;
                    } else if (e.data.key == 'UpdateClientId') {
                        ClientID = e.data.value;
                    } else if (e.data.key == 'UpdateDeviceId') {
                        GQLDeviceID = e.data.value;
                    } else if (e.data.key == 'UpdateClientIntegrityHeader') {
                        ClientIntegrityHeader = e.data.value;
                    } else if (e.data.key == 'UpdateAuthorizationHeader') {
                        AuthorizationHeader = e.data.value;
                    }
                });
                
                hookWorkerFetch();
                eval(workerString);
            `;

                super(URL.createObjectURL(new Blob([newBlobStr])), options);
                twitchWorkers.push(this);
            }
        };

        let workerInstance = reinsertWorkers(newWorker, reinsert);
        Object.defineProperty(window, 'Worker', {
            get: function () {
                return workerInstance;
            },
            set: function (value) {
                if (isValidWorker(value)) {
                    workerInstance = value;
                }
            }
        });
    }

    // Hook localStorage to get device ID
    function hookLocalStorage() {
        try {
            const originalGetItem = localStorage.getItem.bind(localStorage);
            localStorage.getItem = function (key) {
                const value = originalGetItem(key);
                if (key === 'unique_id' && value) {
                    GQLDeviceID = value;
                }
                return value;
            };

            // Try to get existing device ID
            const existingId = originalGetItem('unique_id');
            if (existingId) {
                GQLDeviceID = existingId;
            }
        } catch (e) {
            // localStorage hook failed, continue without it
        }
    }

    /**
     * Hooks main thread fetch to capture Twitch API headers
     */
    function hookMainFetch() {
        const realFetch = window.fetch;
        window.fetch = async function (url, options) {
            if (typeof url === 'string' || url instanceof URL) {
                const urlStr = url.toString();
                if (urlStr.includes('gql.twitch.tv/gql')) {
                    const response = await realFetch.apply(this, arguments);

                    // Extract headers for worker
                    if (options && options.headers) {
                        const headers = options.headers;
                        if (headers['Client-Integrity']) {
                            ClientIntegrityHeader = headers['Client-Integrity'];
                            twitchWorkers.forEach(w => w.postMessage({ key: 'UpdateClientIntegrityHeader', value: ClientIntegrityHeader }));
                        }
                        if (headers['Authorization']) {
                            AuthorizationHeader = headers['Authorization'];
                            twitchWorkers.forEach(w => w.postMessage({ key: 'UpdateAuthorizationHeader', value: AuthorizationHeader }));
                        }
                        if (headers['Client-Version']) {
                            ClientVersion = headers['Client-Version'];
                            twitchWorkers.forEach(w => w.postMessage({ key: 'UpdateClientVersion', value: ClientVersion }));
                        }
                        if (headers['Client-Session-Id']) {
                            ClientSession = headers['Client-Session-Id'];
                            twitchWorkers.forEach(w => w.postMessage({ key: 'UpdateClientSession', value: ClientSession }));
                        }
                        if (headers['X-Device-Id']) {
                            GQLDeviceID = headers['X-Device-Id'];
                            twitchWorkers.forEach(w => w.postMessage({ key: 'UpdateDeviceId', value: GQLDeviceID }));
                        }
                    }

                    return response;
                }
            }
            return realFetch.apply(this, arguments);
        };
    }

    // ===========================================
    // UI COMPONENTS
    // ===========================================

    /**
     * Shows a non-intrusive daily donation reminder toast
     * Displays once per day, auto-dismisses after 15 seconds
     */
    function showDonationReminder() {
        const STORAGE_KEY = 'ttvab_last_reminder';
        const ONE_DAY = 24 * 60 * 60 * 1000;

        try {
            const lastShown = localStorage.getItem(STORAGE_KEY);
            const now = Date.now();

            if (lastShown && (now - parseInt(lastShown)) < ONE_DAY) {
                return; // Already shown today
            }

            // Wait for page to load
            setTimeout(() => {
                const toast = document.createElement('div');
                toast.id = 'ttvab-reminder';
                toast.innerHTML = `
                <style>
                    #ttvab-reminder {
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        background: linear-gradient(135deg, #9146FF 0%, #772CE8 100%);
                        color: white;
                        padding: 16px 20px;
                        border-radius: 12px;
                        font-family: 'Segoe UI', sans-serif;
                        font-size: 14px;
                        max-width: 320px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                        z-index: 999999;
                        animation: ttvab-slide-in 0.3s ease;
                    }
                    @keyframes ttvab-slide-in {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    #ttvab-reminder-close {
                        position: absolute;
                        top: 8px;
                        right: 10px;
                        background: none;
                        border: none;
                        color: rgba(255,255,255,0.7);
                        font-size: 18px;
                        cursor: pointer;
                        padding: 0;
                        line-height: 1;
                    }
                    #ttvab-reminder-close:hover { color: white; }
                    #ttvab-reminder-btn {
                        display: inline-block;
                        margin-top: 10px;
                        padding: 8px 16px;
                        background: white;
                        color: #772CE8;
                        border: none;
                        border-radius: 6px;
                        font-weight: 600;
                        cursor: pointer;
                        font-size: 13px;
                    }
                    #ttvab-reminder-btn:hover { background: #f0f0f0; }
                </style>
                <button id="ttvab-reminder-close">×</button>
                <div style="margin-bottom:4px;font-weight:600;">💜 Enjoying TTV AB?</div>
                <div style="opacity:0.9;">If this extension saves you from ads, consider buying me a coffee!</div>
                <button id="ttvab-reminder-btn">Support the Developer</button>
            `;

                document.body.appendChild(toast);
                localStorage.setItem(STORAGE_KEY, now.toString());

                document.getElementById('ttvab-reminder-close').onclick = () => toast.remove();
                document.getElementById('ttvab-reminder-btn').onclick = () => {
                    window.open('https://paypal.me/GosuDRM', '_blank');
                    toast.remove();
                };

                // Auto-dismiss after 15 seconds
                setTimeout(() => {
                    if (document.getElementById('ttvab-reminder')) {
                        toast.style.animation = 'ttvab-slide-in 0.3s ease reverse';
                        setTimeout(() => toast.remove(), 300);
                    }
                }, 15000);

            }, 5000); // Show after 5 seconds
        } catch (e) {
            // localStorage not available, skip reminder
        }
    }

    // ===========================================
    // INITIALIZATION
    // ===========================================

    /**
     * Shows first-run welcome message with pin reminder
     * Only displays once on first install
     */
    function showFirstRunMessage() {
        const STORAGE_KEY = 'ttvab_first_run_shown';

        try {
            if (localStorage.getItem(STORAGE_KEY)) {
                return;
            }

            setTimeout(() => {
                const toast = document.createElement('div');
                toast.id = 'ttvab-welcome';
                toast.innerHTML = `
                    <style>
                        #ttvab-welcome {
                            position: fixed;
                            top: 20px;
                            right: 20px;
                            background: linear-gradient(135deg, #9146FF 0%, #772CE8 100%);
                            color: white;
                            padding: 20px 24px;
                            border-radius: 16px;
                            font-family: 'Segoe UI', sans-serif;
                            font-size: 14px;
                            max-width: 340px;
                            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                            z-index: 999999;
                            animation: ttvab-welcome-in 0.4s ease;
                        }
                        @keyframes ttvab-welcome-in {
                            from { opacity: 0; transform: translateY(-20px) scale(0.95); }
                            to { opacity: 1; transform: translateY(0) scale(1); }
                        }
                        #ttvab-welcome-close {
                            position: absolute;
                            top: 10px;
                            right: 12px;
                            background: none;
                            border: none;
                            color: rgba(255,255,255,0.7);
                            font-size: 20px;
                            cursor: pointer;
                            padding: 0;
                            line-height: 1;
                        }
                        #ttvab-welcome-close:hover { color: white; }
                        #ttvab-welcome h3 {
                            margin: 0 0 8px 0;
                            font-size: 18px;
                        }
                        #ttvab-welcome p {
                            margin: 0 0 12px 0;
                            opacity: 0.9;
                            line-height: 1.4;
                        }
                        #ttvab-welcome .pin-tip {
                            background: rgba(255,255,255,0.15);
                            padding: 10px 12px;
                            border-radius: 8px;
                            font-size: 13px;
                        }
                        #ttvab-welcome .pin-tip strong {
                            color: #fff;
                        }
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
                localStorage.setItem(STORAGE_KEY, 'true');

                document.getElementById('ttvab-welcome-close').onclick = () => {
                    toast.style.animation = 'ttvab-welcome-in 0.3s ease reverse';
                    setTimeout(() => toast.remove(), 300);
                };

                // Auto-dismiss after 20 seconds
                setTimeout(() => {
                    if (document.getElementById('ttvab-welcome')) {
                        toast.style.animation = 'ttvab-welcome-in 0.3s ease reverse';
                        setTimeout(() => toast.remove(), 300);
                    }
                }, 20000);

            }, 2000);
        } catch (e) {
            // localStorage unavailable
        }
    }

    // Listen for toggle events from bridge script
    window.addEventListener('ttvab-toggle', function (e) {
        const enabled = e.detail?.enabled ?? true;
        IsAdStrippingEnabled = enabled;
        console.log('[TTV AB] Ad blocking ' + (enabled ? 'enabled' : 'disabled'));
    });

    hookLocalStorage();
    hookWindowWorker();
    hookMainFetch();
    showFirstRunMessage();
    showDonationReminder();

    console.log('[TTV AB] Initialized successfully');
})();
