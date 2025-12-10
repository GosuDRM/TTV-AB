/**
 * TTV AB (Twitch Ad Blocker) v3.0.7
 * 
 * This extension blocks advertisements on Twitch.tv by intercepting HLS (HTTP Live Streaming)
 * manifest requests and replacing ad segments with non-ad content from backup streams.
 * 
 * HOW IT WORKS:
 * 1. Hooks into the browser's fetch API and Web Worker creation
 * 2. Intercepts requests to Twitch's HLS playlist (.m3u8) files
 * 3. When ads are detected (via 'stitched' marker in manifests), fetches ad-free 
 *    stream variants using different player types
 * 4. Replaces ad segments with clean content, providing uninterrupted viewing
 * 
 * PERMISSIONS USED:
 * - Runs only on twitch.tv domains (content script)
 * - No data collection or external requests except to Twitch's own servers
 * 
 * @file Content script that runs on Twitch.tv pages
 * @author GosuDRM
 * @license MIT
 * @see https://github.com/GosuDRM/TTV-AB
 * @version 3.0.7
 */
(function () {
    'use strict';

    /**
     * Configuration constants for the ad blocker
     * These values control the behavior of ad detection and blocking
     * @constant {Object}
     */
    const _$c = {
        /** Current extension version displayed to users */
        VERSION: '3.0.7',

        /** Internal version number for conflict detection between script instances */
        INTERNAL_VERSION: 20,

        /** CSS styles for console logging - purely cosmetic for debugging */
        LOG_STYLES: {
            prefix: 'background: linear-gradient(135deg, #9146FF, #772CE8); color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
            info: 'color: #9146FF; font-weight: 500;',
            success: 'color: #4CAF50; font-weight: 500;',
            warning: 'color: #FF9800; font-weight: 500;',
            error: 'color: #f44336; font-weight: 500;'
        },

        /** String marker that Twitch uses to identify ad segments in HLS manifests */
        AD_SIGNIFIER: 'stitched',

        /** Twitch's public client ID - required for API authentication */
        CLIENT_ID: 'kimne78kx3ncx6brgo4mv6wki5h1ko',

        /** Player type identifiers used to request different stream variants from Twitch */
        PLAYER_TYPES: ['embed', 'site', 'autoplay', 'picture-by-picture-CACHED'],

        /** Default fallback player type when primary fails */
        FALLBACK_TYPE: 'embed',

        /** Player type used when forcing a new access token */
        FORCE_TYPE: 'site',

        /** Minimum time (ms) between player reload attempts to prevent loops */
        RELOAD_TIME: 1500,

        /** Error message patterns that indicate the Twitch player has crashed */
        CRASH_PATTERNS: ['Error #1000', 'Error #2000', 'Error #3000', 'Error #4000', 'Error #5000', 'network error', 'content is not available'],

        /** Delay (ms) before auto-refreshing after a crash is detected */
        REFRESH_DELAY: 1500
    };

    /**
     * Runtime state object - stores mutable state during execution
     * @constant {Object}
     */
    const _$s = {
        /** Array of hooked Web Worker instances for message passing */
        workers: [],

        /** Patterns to detect conflicting scripts that may interfere */
        conflicts: ['twitch', 'isVariantA'],

        /** Patterns that indicate a Worker needs function reinsertion */
        reinsertPatterns: ['isVariantA', 'besuper/', '${patch_url}'],

        /** Counter for total ads blocked this session */
        adsBlocked: 0
    };

    /**
     * Initialize default scope variables for ad blocking state
     * Sets up all required variables on the provided scope (window or worker self)
     * @param {Object} scope - The scope object to initialize (window or self)
     */
    function _$ds(scope) {
        // Ad detection marker used by Twitch in HLS manifests
        scope.AdSignifier = _$c.AD_SIGNIFIER;
        // Twitch API client identifier
        scope.ClientID = _$c.CLIENT_ID;
        // Available player types for fetching backup streams
        scope.BackupPlayerTypes = [..._$c.PLAYER_TYPES];
        scope.FallbackPlayerType = _$c.FALLBACK_TYPE;
        scope.ForceAccessTokenPlayerType = _$c.FORCE_TYPE;
        // Player reload configuration
        scope.SkipPlayerReloadOnHevc = false;
        scope.AlwaysReloadPlayerOnAd = false;
        scope.PlayerReloadMinimalRequestsTime = _$c.RELOAD_TIME;
        scope.PlayerReloadMinimalRequestsPlayerIndex = 0;
        scope.HasTriggeredPlayerReload = false;
        // Stream information storage (keyed by channel name and URL)
        scope.StreamInfos = Object.create(null);
        scope.StreamInfosByUrl = Object.create(null);
        // Twitch API authentication headers (captured from page requests)
        scope.GQLDeviceID = null;
        scope.ClientVersion = null;
        scope.ClientSession = null;
        scope.ClientIntegrityHeader = null;
        scope.AuthorizationHeader = undefined;
        // Testing/debugging variables
        scope.SimulatedAdsDepth = 0;
        scope.V2API = false;
        // Master toggle for ad stripping functionality
        scope.IsAdStrippingEnabled = true;
        // Cache of known ad segment URLs with timestamps for cleanup
        scope.AdSegmentCache = new Map();
        scope.AllSegmentsAreAdSegments = false;
    }

    /**
     * Increment the blocked ads counter and notify UI components
     * Dispatches a custom event so the popup can update the counter display
     */
    function _$ab() {
        _$s.adsBlocked++;
        // Notify the main window context (for popup communication)
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ttvab-ad-blocked', { detail: { count: _$s.adsBlocked } }));
        } else if (typeof self !== 'undefined' && self.postMessage) {
            // Notify from worker context back to main thread
            self.postMessage({ key: 'AdBlocked', count: _$s.adsBlocked });
        }
    }

    /**
     * Log a styled message to the console for debugging
     * @param {string} msg - The message to log
     * @param {string} type - Log type: 'info', 'success', 'warning', or 'error'
     */
    function _$l(msg, type = 'info') {
        console.log('%cTTV AB%c ' + msg, _$c.LOG_STYLES.prefix, _$c.LOG_STYLES[type] || _$c.LOG_STYLES.info);
    }

    /** Regex pattern to parse HLS manifest attributes (e.g., RESOLUTION=1920x1080) */
    const _ATTR_REGEX = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;

    /**
     * Parse HLS manifest attributes into a key-value object
     * Used to extract stream metadata like resolution and frame rate
     * @param {string} str - The attribute string to parse
     * @returns {Object} Parsed attributes as key-value pairs
     */
    function _$pa(str) {
        const result = Object.create(null);
        let match;
        _ATTR_REGEX.lastIndex = 0;
        // Extract all KEY=VALUE pairs from the string
        while ((match = _ATTR_REGEX.exec(str)) !== null) {
            let value = match[2];
            // Remove surrounding quotes if present
            if (value[0] === '"' && value[value.length - 1] === '"') {
                value = value.slice(1, -1);
            }
            result[match[1].toUpperCase()] = value;
        }
        return result;
    }

    /**
     * Extract server timestamp from HLS manifest
     * Used to sync timing between original and backup streams
     * @param {string} m3u8 - The HLS manifest content
     * @returns {string|null} The server time value or null if not found
     */
    function _$gt(m3u8) {
        if (V2API) {
            const match = m3u8.match(/#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="([^"]+)"/);
            return match?.[1] ?? null;
        }
        const match = m3u8.match(/SERVER-TIME="([0-9.]+)"/);
        return match?.[1] ?? null;
    }

    /**
     * Replace server timestamp in HLS manifest
     * Ensures backup stream timing matches the original stream
     * @param {string} m3u8 - The HLS manifest content
     * @param {string} time - The new server time value
     * @returns {string} Modified manifest with updated timestamp
     */
    function _$rt(m3u8, time) {
        if (!time) return m3u8;
        if (V2API) {
            return m3u8.replace(/(#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE=")[^"]+(")/, `$1${time}$2`);
        }
        return m3u8.replace(/(SERVER-TIME=")[0-9.]+(")/, `$1${time}$2`);
    }

    /**
     * Strip advertisement segments from HLS playlist
     * This function modifies the playlist to remove or neutralize ad content
     * @param {string} text - The HLS playlist text content
     * @param {boolean} stripAll - If true, strip all non-live segments
     * @param {Object} info - Stream info object for tracking statistics
     * @returns {string} Modified playlist with ads stripped
     */
    function _$sa(text, stripAll, info) {
        const lines = text.split('\n');
        const len = lines.length;
        // Redirect ad tracking URLs to Twitch's main domain (neutralizes tracking)
        const adUrl = 'https://twitch.tv';
        let stripped = false;
        let i = 0;

        for (; i < len; i++) {
            let line = lines[i];

            // Neutralize ad tracking URLs by replacing them with benign URLs
            if (line.includes('X-TV-TWITCH-AD')) {
                line = line
                    .replace(/X-TV-TWITCH-AD-URL="[^"]*"/, `X-TV-TWITCH-AD-URL="${adUrl}"`)
                    .replace(/X-TV-TWITCH-AD-CLICK-TRACKING-URL="[^"]*"/, `X-TV-TWITCH-AD-CLICK-TRACKING-URL="${adUrl}"`);
                lines[i] = line;
            }

            // Identify and cache ad segment URLs for later replacement
            if (i < len - 1 && line.startsWith('#EXTINF') && (!line.includes(',live') || stripAll || AllSegmentsAreAdSegments)) {
                const url = lines[i + 1];
                if (!AdSegmentCache.has(url)) info.NumStrippedAdSegments++;
                AdSegmentCache.set(url, Date.now());
                stripped = true;
            }

            // Check for Twitch's ad signifier marker
            if (line.includes(AdSignifier)) stripped = true;
        }

        // Remove prefetch hints during ad playback to prevent buffering ad content
        if (stripped) {
            for (i = 0; i < len; i++) {
                if (lines[i].startsWith('#EXT-X-TWITCH-PREFETCH:')) lines[i] = '';
            }
        } else {
            info.NumStrippedAdSegments = 0;
        }

        info.IsStrippingAdSegments = stripped;

        // Clean up old cached ad segments (older than 2 minutes)
        const cutoff = Date.now() - 120000;
        AdSegmentCache.forEach((v, k) => { if (v < cutoff) AdSegmentCache.delete(k); });

        return lines.join('\n');
    }

    /**
     * Find the stream URL matching the requested resolution
     * Used to get the correct quality stream from backup manifests
     * @param {string} m3u8 - The master HLS manifest
     * @param {Object} res - Resolution info with Resolution and FrameRate properties
     * @returns {string|null} URL of the matching stream or closest alternative
     */
    function _$su(m3u8, res) {
        const lines = m3u8.split('\n');
        const len = lines.length;
        // Calculate target pixel count for quality matching
        const [tw, th] = res.Resolution.split('x').map(Number);
        const targetPixels = tw * th;
        let matchUrl = null;
        let matchFps = false;
        let closeUrl = null;
        let closeDiff = Infinity;

        for (let i = 0; i < len - 1; i++) {
            const line = lines[i];
            // Look for stream variant definitions
            if (!line.startsWith('#EXT-X-STREAM-INF') || !lines[i + 1].includes('.m3u8')) continue;

            const attrs = _$pa(line);
            const resolution = attrs.RESOLUTION;
            const frameRate = attrs['FRAME-RATE'];

            if (!resolution) continue;

            // Exact resolution match
            if (resolution === res.Resolution) {
                if (!matchUrl || (!matchFps && frameRate === res.FrameRate)) {
                    matchUrl = lines[i + 1];
                    matchFps = frameRate === res.FrameRate;
                    if (matchFps) return matchUrl; // Perfect match found
                }
            }

            // Track closest resolution as fallback
            const [w, h] = resolution.split('x').map(Number);
            const diff = Math.abs((w * h) - targetPixels);
            if (diff < closeDiff) {
                closeUrl = lines[i + 1];
                closeDiff = diff;
            }
        }

        return matchUrl || closeUrl;
    }

    /** Twitch GraphQL API endpoint URL */
    const _GQL_URL = 'https://gql.twitch.tv/gql';

    /**
     * Make a GraphQL request to Twitch's API
     * Used to fetch playback access tokens for backup streams
     * @param {Object} body - The GraphQL request body
     * @returns {Promise<Response>} Fetch response promise
     */
    function _$gq(body) {
        // Build request headers with captured authentication data
        const headers = {
            'Content-Type': 'application/json',
            'Client-ID': ClientID
        };
        // Add optional authentication headers if available
        if (GQLDeviceID) headers['X-Device-Id'] = GQLDeviceID;
        if (ClientVersion) headers['Client-Version'] = ClientVersion;
        if (ClientSession) headers['Client-Session-Id'] = ClientSession;
        if (ClientIntegrityHeader) headers['Client-Integrity'] = ClientIntegrityHeader;
        if (AuthorizationHeader) headers['Authorization'] = AuthorizationHeader;

        return fetch(_GQL_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
    }

    /**
     * Request a playback access token from Twitch's GraphQL API
     * This token is required to access stream manifests
     * @param {string} channel - The channel name to get token for
     * @param {string} playerType - Player type identifier (embed, site, etc.)
     * @returns {Promise<Response>} API response with token data
     */
    function _$tk(channel, playerType) {
        return _$gq({
            operationName: 'PlaybackAccessToken',
            extensions: {
                persistedQuery: {
                    version: 1,
                    // Twitch's public query hash for token requests
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

    /**
     * Process HLS playlist and replace ads with backup stream content
     * This is the main ad-blocking function - intercepts manifests and swaps content
     * @param {string} url - The original playlist URL
     * @param {string} text - The playlist content
     * @param {Function} realFetch - The original fetch function for making requests
     * @returns {Promise<string>} Modified playlist with ads blocked
     */
    async function _$pm(url, text, realFetch) {
        // Check if ad blocking is enabled
        if (!IsAdStrippingEnabled) return text;

        const info = StreamInfosByUrl[url];
        if (!info) return text;

        // Track player reload timing to prevent reload loops
        if (HasTriggeredPlayerReload) {
            HasTriggeredPlayerReload = false;
            info.LastPlayerReload = Date.now();
        }

        // Detect if this playlist contains ad content
        const hasAds = text.includes(AdSignifier) || SimulatedAdsDepth > 0;

        if (hasAds) {
            // Check if this is a midroll (mid-stream) ad vs preroll
            info.IsMidroll = text.includes('"MIDROLL"') || text.includes('"midroll"');

            // Log and count the blocked ad (only once per ad break)
            if (!info.IsShowingAd) {
                info.IsShowingAd = true;
                _$l('Ad detected, blocking...', 'warning');
                _$ab();
            }

            // For preroll ads, prefetch ad segments to signal completion to Twitch
            // This helps end the ad break faster without showing ads to user
            if (!info.IsMidroll) {
                const lines = text.split('\n');
                for (let i = 0, len = lines.length; i < len; i++) {
                    if (lines[i].startsWith('#EXTINF') && i < len - 1) {
                        if (!lines[i].includes(',live') && !info.RequestedAds.has(lines[i + 1])) {
                            info.RequestedAds.add(lines[i + 1]);
                            // Fetch but discard - signals ad "watched" to Twitch
                            fetch(lines[i + 1]).then(r => r.blob()).catch(() => { });
                            break;
                        }
                    }
                }
            }

            // Get resolution info for finding matching backup stream
            const res = info.Urls[url];
            if (!res) {
                _$l('Missing resolution info for ' + url, 'warning');
                return text;
            }

            // Check if stream uses HEVC codec (requires special handling)
            const isHevc = res.Codecs?.[0] === 'h' && (res.Codecs[1] === 'e' || res.Codecs[1] === 'v');
            if (((isHevc && !SkipPlayerReloadOnHevc) || AlwaysReloadPlayerOnAd) && info.ModifiedM3U8 && !info.IsUsingModifiedM3U8) {
                info.IsUsingModifiedM3U8 = true;
                info.LastPlayerReload = Date.now();
            }

            // Variables for backup stream search
            let backupType = null;
            let backupM3u8 = null;
            let fallbackM3u8 = null;
            let startIdx = 0;
            let minimal = false;

            // Optimize requests after recent player reload
            if (info.LastPlayerReload > Date.now() - PlayerReloadMinimalRequestsTime) {
                startIdx = PlayerReloadMinimalRequestsPlayerIndex;
                minimal = true;
            }

            const playerTypes = BackupPlayerTypes;
            const playerTypesLen = playerTypes.length;

            // Try each player type to find an ad-free stream
            for (let pi = startIdx; !backupM3u8 && pi < playerTypesLen; pi++) {
                const pt = playerTypes[pi];
                const realPt = pt.replace('-CACHED', '');
                const cached = pt !== realPt;

                // Attempt up to 2 tries per player type
                for (let j = 0; j < 2; j++) {
                    let fresh = false;
                    let enc = info.BackupEncodingsM3U8Cache[pt];

                    // Fetch new token and manifest if not cached
                    if (!enc) {
                        fresh = true;
                        try {
                            const tokenRes = await _$tk(info.ChannelName, realPt);
                            if (tokenRes.status === 200) {
                                const token = await tokenRes.json();
                                const sig = token?.data?.streamPlaybackAccessToken?.signature;
                                if (sig) {
                                    // Build Usher URL for stream manifest
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

                    // If we have a manifest, try to get the matching quality stream
                    if (enc) {
                        try {
                            const streamUrl = _$su(enc, res);
                            const streamRes = await realFetch(streamUrl);
                            if (streamRes.status === 200) {
                                const m3u8 = await streamRes.text();
                                if (m3u8) {
                                    if (pt === FallbackPlayerType) fallbackM3u8 = m3u8;
                                    // Check if this stream is ad-free
                                    const noAds = !m3u8.includes(AdSignifier) && (SimulatedAdsDepth === 0 || pi >= SimulatedAdsDepth - 1);
                                    const lastResort = !fallbackM3u8 && pi >= playerTypesLen - 1;
                                    if (noAds || lastResort) {
                                        backupType = pt;
                                        backupM3u8 = m3u8;
                                        break;
                                    }
                                    if (cached || minimal) {
                                        backupType = pt;
                                        backupM3u8 = m3u8;
                                        break;
                                    }
                                }
                            }
                        } catch (e) {
                            _$l('Stream fetch error: ' + e.message, 'warning');
                        }
                    }

                    // Clear cache and retry if needed
                    info.BackupEncodingsM3U8Cache[pt] = null;
                    if (fresh) break;
                }
            }

            // Use fallback if no ad-free backup found
            if (!backupM3u8 && fallbackM3u8) {
                backupType = FallbackPlayerType;
                backupM3u8 = fallbackM3u8;
            }

            // Replace original with backup content
            if (backupM3u8) text = backupM3u8;

            // Log player type change
            if (info.ActiveBackupPlayerType !== backupType) {
                info.ActiveBackupPlayerType = backupType;
                _$l('Using backup player type: ' + backupType, 'info');
            }

            // Strip any remaining ad markers
            text = _$sa(text, false, info);
        } else {
            // No ads detected - reset ad tracking state
            if (info.IsShowingAd) {
                info.IsShowingAd = false;
                info.IsUsingModifiedM3U8 = false;
                info.RequestedAds.clear();
                info.BackupEncodingsM3U8Cache = [];
                info.ActiveBackupPlayerType = null;
                _$l('Ad ended', 'success');
            }
        }

        return text;
    }

    /**
     * Synchronously fetch JavaScript content via XMLHttpRequest
     * Used to load Worker source code for injection
     * @param {string} url - URL to fetch
     * @returns {string} Response text content
     */
    function _$wj(url) {
        const req = new XMLHttpRequest();
        req.open('GET', url, false);
        req.send();
        return req.responseText;
    }

    /**
     * Clean Worker prototype to prevent conflicts with other scripts
     * Removes properties that could interfere with our hooks
     * @param {Function} W - Worker constructor
     * @returns {Function} Cleaned Worker constructor
     */
    function _$cw(W) {
        const proto = W.prototype;
        for (const key of _$s.conflicts) {
            if (proto[key]) proto[key] = undefined;
        }
        return W;
    }

    /**
     * Get list of patterns that need to be reinserted into Worker
     * Checks which patterns from our list exist in the original Worker
     * @param {Function} W - Worker constructor
     * @returns {Array<string>} List of patterns found
     */
    function _$gr(W) {
        const src = W.toString();
        const result = [];
        for (const pattern of _$s.reinsertPatterns) {
            if (src.includes(pattern)) result.push(pattern);
        }
        return result;
    }

    /**
     * Reinsert functions from window onto Worker prototype
     * Ensures required functions are available in the Worker context
     * @param {Function} W - Worker constructor
     * @param {Array<string>} names - Function names to reinsert
     * @returns {Function} Modified Worker constructor
     */
    function _$ri(W, names) {
        for (const name of names) {
            if (typeof window[name] === 'function') {
                W.prototype[name] = window[name];
            }
        }
        return W;
    }

    /**
     * Validate if a Worker replacement is safe to allow
     * Prevents other scripts from overriding our hooked Worker
     * @param {*} v - Potential Worker replacement
     * @returns {boolean} True if the replacement is valid
     */
    function _$iv(v) {
        if (typeof v !== 'function') return false;
        const src = v.toString();
        return !_$s.conflicts.some(c => src.includes(c)) || !_$s.reinsertPatterns.some(p => src.includes(p));
    }

    /**
     * Hook the fetch API inside Web Workers to intercept HLS requests
     * This runs inside the Worker context to process stream manifests
     */
    function _$wf() {
        _$l('Worker fetch hooked', 'info');
        const realFetch = fetch;

        // Replace the global fetch function with our interceptor
        fetch = async function (url, opts) {
            // Pass through non-string URLs (Request objects, etc.)
            if (typeof url !== 'string') {
                return realFetch.apply(this, arguments);
            }

            // Replace cached ad segment URLs with empty video
            // This prevents the ad video from actually playing
            if (AdSegmentCache.has(url)) {
                // Return a minimal valid MP4 file instead of the ad
                return realFetch('data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292', opts);
            }

            url = url.trimEnd();

            // Intercept HLS playlist requests and process them
            if (url.endsWith('m3u8')) {
                const response = await realFetch(url, opts);
                if (response.status === 200) {
                    const text = await response.text();
                    // Process playlist to remove/replace ads
                    return new Response(await _$pm(url, text, realFetch));
                }
                return response;
            }

            // Intercept initial channel HLS requests
            if (url.includes('/channel/hls/') && !url.includes('picture-by-picture')) {
                // Detect API version from URL
                V2API = url.includes('/api/v2/');
                // Extract channel name from URL
                const channelMatch = (new URL(url)).pathname.match(/([^/]+)(?=\.\w+$)/);
                const channel = channelMatch?.[0];

                // Remove parent_domains parameter if using forced player type
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

                // Validate existing stream info is still valid
                if (info?.EncodingsM3U8) {
                    const m3u8Match = info.EncodingsM3U8.match(/^https:.*\.m3u8$/m);
                    if (m3u8Match && (await realFetch(m3u8Match[0])).status !== 200) {
                        info = null;
                    }
                }

                // Initialize stream info for new channels
                if (!info?.EncodingsM3U8) {
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

                    // Parse available stream qualities from manifest
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

            // Pass through all other requests unchanged
            return realFetch.apply(this, arguments);
        };
    }

    /**
     * Hook the Worker constructor to inject ad-blocking code into Twitch's Web Workers
     * Twitch uses Web Workers for HLS video processing - we inject our code there
     * This is the primary mechanism for intercepting stream requests
     */
    function _$hw() {
        // Get list of functions that need to be reinserted after hooking
        const reinsertNames = _$gr(window.Worker);

        /**
         * Custom Worker class that extends the native Worker
         * Intercepts Worker creation for Twitch domains and injects ad-blocking code
         */
        const HookedWorker = class Worker extends _$cw(window.Worker) {
            constructor(url, opts) {
                // Check if this Worker is from Twitch's domain
                let isTwitch = false;
                try {
                    isTwitch = new URL(url).origin.endsWith('.twitch.tv');
                } catch {
                    isTwitch = false;
                }

                // For non-Twitch Workers, create normally without modification
                if (!isTwitch) {
                    super(url, opts);
                    return;
                }

                // Build the code to inject into the Twitch Worker
                // This includes all our ad-blocking functions serialized as strings
                const injectedCode = `
                const _$c = ${JSON.stringify(_$c)};
                const _$s = ${JSON.stringify(_$s)};
                const _ATTR_REGEX = ${_ATTR_REGEX.toString()};
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
                
                const _GQL_URL = '${_GQL_URL}';
                // Load original Worker code synchronously
                const wasmSource = _$wj('${url.replaceAll("'", "%27")}');
                // Initialize scope with default values
                _$ds(self);
                // Pass authentication headers from main thread
                GQLDeviceID = ${GQLDeviceID ? `'${GQLDeviceID}'` : 'null'};
                AuthorizationHeader = ${AuthorizationHeader ? `'${AuthorizationHeader}'` : 'undefined'};
                ClientIntegrityHeader = ${ClientIntegrityHeader ? `'${ClientIntegrityHeader}'` : 'null'};
                ClientVersion = ${ClientVersion ? `'${ClientVersion}'` : 'null'};
                ClientSession = ${ClientSession ? `'${ClientSession}'` : 'null'};
                
                // Listen for header updates from main thread
                self.addEventListener('message', function(e) {
                    const data = e.data;
                    if (!data?.key) return;
                    // Update authentication headers when they change
                    switch (data.key) {
                        case 'UpdateClientVersion': ClientVersion = data.value; break;
                        case 'UpdateClientSession': ClientSession = data.value; break;
                        case 'UpdateClientId': ClientID = data.value; break;
                        case 'UpdateDeviceId': GQLDeviceID = data.value; break;
                        case 'UpdateClientIntegrityHeader': ClientIntegrityHeader = data.value; break;
                        case 'UpdateAuthorizationHeader': AuthorizationHeader = data.value; break;
                    }
                });
                
                // Hook fetch API inside Worker
                _$wf();
                // Execute original Worker code
                eval(wasmSource);
            `;

                // Create a blob URL containing our injected code
                const blobUrl = URL.createObjectURL(new Blob([injectedCode]));
                // Create Worker with our injected code instead of original
                super(blobUrl, opts);
                // Clean up blob URL after Worker is created
                URL.revokeObjectURL(blobUrl);

                // Listen for ad blocked notifications from Worker
                this.addEventListener('message', function (e) {
                    if (e.data?.key === 'AdBlocked') {
                        _$s.adsBlocked = e.data.count;
                        // Dispatch event for popup UI to update counter
                        window.dispatchEvent(new CustomEvent('ttvab-ad-blocked', { detail: { count: e.data.count } }));
                    }
                });

                // Track this Worker instance for sending updates
                _$s.workers.push(this);

                // Clean up stale Worker references to prevent memory leaks
                if (_$s.workers.length > 5) {
                    _$s.workers = _$s.workers.filter(w => w.onmessage !== null);
                }
            }
        };

        // Apply function reinsertion and set as the global Worker
        let workerInstance = _$ri(HookedWorker, reinsertNames);
        // Protect our Worker hook from being overwritten by other scripts
        Object.defineProperty(window, 'Worker', {
            get: () => workerInstance,
            set: (v) => { if (_$iv(v)) workerInstance = v; }
        });
    }

    /**
     * Hook localStorage to capture Twitch's device ID
     * The device ID is used for API authentication
     */
    function _$hs() {
        try {
            const originalGetItem = localStorage.getItem.bind(localStorage);
            localStorage.getItem = function (key) {
                const value = originalGetItem(key);
                // Capture device ID when Twitch reads it
                if (key === 'unique_id' && value) GQLDeviceID = value;
                return value;
            };
            // Also try to read it immediately if already set
            const deviceId = originalGetItem('unique_id');
            if (deviceId) GQLDeviceID = deviceId;
        } catch (e) {
            _$l('Storage hook error: ' + e.message, 'warning');
        }
    }

    /**
     * Hook the main window fetch to capture authentication headers
     * Intercepts GraphQL requests to Twitch and extracts auth tokens
     */
    function _$mf() {
        const realFetch = window.fetch;

        window.fetch = async function (url, opts) {
            if (typeof url === 'string' || url instanceof URL) {
                const urlStr = url.toString();
                // Intercept GraphQL requests to capture auth headers
                if (urlStr.includes('gql.twitch.tv/gql')) {
                    const response = await realFetch.apply(this, arguments);

                    // Extract authentication headers from request
                    if (opts?.headers) {
                        const h = opts.headers;
                        const updates = [];

                        // Capture each auth header and queue update for workers
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

                        // Send header updates to all active workers
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
            // Pass through non-GraphQL requests unchanged
            return realFetch.apply(this, arguments);
        };
    }

    /** localStorage key for tracking donation reminder timing */
    const _REMINDER_KEY = 'ttvab_last_reminder';

    /** Interval between donation reminders (24 hours in milliseconds) */
    const _REMINDER_INTERVAL = 86400000;

    /** localStorage key for tracking first-run welcome message */
    const _FIRST_RUN_KEY = 'ttvab_first_run_shown';

    /**
     * Show optional donation reminder toast (once per day)
     * Non-intrusive notification that auto-dismisses after 15 seconds
     */
    function _$dn() {
        try {
            const lastReminder = localStorage.getItem(_REMINDER_KEY);
            const now = Date.now();

            // Don't show if reminder was shown within the last 24 hours
            if (lastReminder && (now - parseInt(lastReminder, 10)) < _REMINDER_INTERVAL) return;

            // Delay showing reminder to not interfere with page load
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
                localStorage.setItem(_REMINDER_KEY, now.toString());

                // Close button handler
                document.getElementById('ttvab-reminder-close').onclick = () => toast.remove();
                // Donation button handler - opens PayPal link
                document.getElementById('ttvab-reminder-btn').onclick = () => {
                    window.open('https://paypal.me/GosuDRM', '_blank');
                    toast.remove();
                };

                // Auto-dismiss after 15 seconds
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

    /**
     * Show first-run welcome message with extension pin instructions
     * Only shown once after initial installation
     */
    function _$wc() {
        try {
            // Don't show if already shown before
            if (localStorage.getItem(_FIRST_RUN_KEY)) return;

            // Delay to ensure page is loaded
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
                // Mark first-run as complete
                localStorage.setItem(_FIRST_RUN_KEY, 'true');

                // Close handler with animation
                const closeHandler = () => {
                    toast.style.animation = 'ttvab-welcome .3s ease reverse';
                    setTimeout(() => toast.remove(), 300);
                };

                document.getElementById('ttvab-welcome-close').onclick = closeHandler;

                // Auto-dismiss after 20 seconds
                setTimeout(() => {
                    if (document.getElementById('ttvab-welcome')) closeHandler();
                }, 20000);
            }, 2000);
        } catch (e) {
            _$l('Welcome message error: ' + e.message, 'error');
        }
    }

    /**
     * Monitor for Twitch player crashes and auto-refresh
     * Detects error messages and refreshes the page to recover
     */
    function _$cm() {
        let isRefreshing = false;
        let checkInterval = null;

        /**
         * Check page content for crash indicators
         * @returns {string|null} Error pattern if crash detected, null otherwise
         */
        function detectCrash() {
            const bodyText = document.body?.innerText?.toLowerCase() || '';
            const patterns = _$c.CRASH_PATTERNS;

            // Check page text for error patterns
            for (let i = 0, len = patterns.length; i < len; i++) {
                if (bodyText.includes(patterns[i].toLowerCase())) {
                    return patterns[i];
                }
            }

            // Check specific error overlay elements
            const errorElements = document.querySelectorAll(
                '[data-a-target="player-overlay-content-gate"],' +
                '[data-a-target="player-error-modal"],' +
                '.content-overlay-gate,' +
                '.player-error'
            );

            for (const el of errorElements) {
                const text = (el.innerText || '').toLowerCase();
                for (let i = 0, len = patterns.length; i < len; i++) {
                    if (text.includes(patterns[i].toLowerCase())) {
                        return patterns[i];
                    }
                }
            }

            return null;
        }

        /**
         * Handle detected crash by showing notice and refreshing
         * @param {string} error - The error pattern that was detected
         */
        function handleCrash(error) {
            if (isRefreshing) return;
            isRefreshing = true;

            _$l('Player crash detected: ' + error, 'error');
            _$l('Auto-refreshing in ' + (_$c.REFRESH_DELAY / 1000) + 's...', 'warning');

            // Show crash notification banner
            const banner = document.createElement('div');
            banner.innerHTML = `
            <style>
                #ttvab-refresh-notice{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#f44336 0%,#d32f2f 100%);color:#fff;padding:12px 24px;border-radius:8px;font-family:'Segoe UI',sans-serif;font-size:14px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:9999999;animation:ttvab-pulse 1s ease infinite}
                @keyframes ttvab-pulse{0%,100%{opacity:1}50%{opacity:.7}}
            </style>
            <div id="ttvab-refresh-notice">⚠️ Player crashed - Refreshing automatically...</div>
        `;
            document.body.appendChild(banner);

            // Refresh page after delay
            setTimeout(() => window.location.reload(), _$c.REFRESH_DELAY);
        }

        /**
         * Start crash monitoring with MutationObserver and interval
         */
        function start() {
            // Wait for document.body
            if (!document.body) {
                setTimeout(start, 100);
                return;
            }

            // Monitor DOM changes for error elements
            const observer = new MutationObserver(() => {
                const error = detectCrash();
                if (error) {
                    handleCrash(error);
                    observer.disconnect();
                    if (checkInterval) clearInterval(checkInterval);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });

            // Also check periodically as backup
            checkInterval = setInterval(() => {
                const error = detectCrash();
                if (error) {
                    handleCrash(error);
                    observer.disconnect();
                    clearInterval(checkInterval);
                }
            }, 5000);

            _$l('Player crash monitor active', 'info');
        }

        start();
    }

    /**
     * Bootstrap check to prevent multiple script instances
     * Returns false if another instance is already running
     * @returns {boolean} True if this instance should run
     */
    function _$bs() {
        // Check if another version is already active
        if (typeof window.ttvabVersion !== 'undefined' && window.ttvabVersion >= _$c.INTERNAL_VERSION) {
            _$l('Skipping - another script is active', 'warning');
            return false;
        }

        // Mark this instance as active
        window.ttvabVersion = _$c.INTERNAL_VERSION;
        _$l('v' + _$c.VERSION + ' loaded', 'info');
        return true;
    }

    /**
     * Set up toggle listener for enabling/disabling ad blocking
     * Listens for 'ttvab-toggle' custom events from popup
     */
    function _$tl() {
        window.addEventListener('ttvab-toggle', function (e) {
            const enabled = e.detail?.enabled ?? true;
            IsAdStrippingEnabled = enabled;
            _$l('Ad blocking ' + (enabled ? 'enabled' : 'disabled'), enabled ? 'success' : 'warning');
        });
    }

    /**
     * Set up counter initialization listener
     * Receives stored counter from bridge.js so we can accumulate across sessions
     */
    function _$ic() {
        window.addEventListener('ttvab-init-count', function (e) {
            const storedCount = e.detail?.count || 0;
            if (storedCount > 0) {
                _$s.adsBlocked = storedCount;
                _$l('Restored counter: ' + storedCount + ' ads blocked', 'info');
            }
        });
    }

    /**
     * Main initialization function
     * Sets up all hooks and starts monitoring
     */
    function _$in() {
        // Check for conflicts and exit if needed
        if (!_$bs()) return;

        // Initialize scope variables on window
        _$ds(window);
        // Hook localStorage for device ID capture
        _$hs();
        // Hook Worker constructor for HLS interception
        _$hw();
        // Hook main window fetch for auth header capture
        _$mf();
        // Set up toggle listener for popup control
        _$tl();
        // Set up counter initialization listener
        _$ic();
        // Start crash monitoring
        _$cm();
        // Show first-run welcome message if applicable
        _$wc();
        // Show donation reminder if applicable
        _$dn();

        _$l('Initialized successfully', 'success');
    }

    // Start the extension
    _$in();
})();
