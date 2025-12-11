/**
 * TTV AB - Processor Module
 * M3U8 stream processing and ad replacement
 * @module processor
 * @private
 */

/**
 * Process M3U8 playlist and strip/replace ads
 * @param {string} url - Playlist URL
 * @param {string} text - Playlist content
 * @param {Function} realFetch - Original fetch function
 * @returns {Promise<string>} Processed playlist
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
            _incrementAdsBlocked(info.ChannelName);
            _log('Ad detected, blocking...', 'warning');
            if (typeof self !== 'undefined' && self.postMessage) {
                self.postMessage({ key: 'AdDetected', channel: info.ChannelName });
            }
        }

        // Pre-fetch removed - using bandwidth for ads we intend to block is wasteful
        // and doesn't significantly improve backup stream timing.

        const res = info.Urls[url];
        if (!res) {
            _log('Missing resolution info for ' + url, 'warning');
            return text;
        }

        const isHevc = res.Codecs?.[0] === 'h' && (res.Codecs[1] === 'e' || res.Codecs[1] === 'v');
        if (((isHevc && !SkipPlayerReloadOnHevc) || AlwaysReloadPlayerOnAd) && info.ModifiedM3U8 && !info.IsUsingModifiedM3U8) {
            info.IsUsingModifiedM3U8 = true;
            info.LastPlayerReload = Date.now();
        }

        const { type: backupType, m3u8: backupM3u8 } = await _findBackupStream(info, realFetch);

        if (backupM3u8) text = backupM3u8;

        if (info.ActiveBackupPlayerType !== backupType) {
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
            if (typeof self !== 'undefined' && self.postMessage) {
                self.postMessage({ key: 'AdEnded' });
            }
        }
    }

    return text;
}

/**
 * Try to find a working backup stream without ads
 * @param {Object} info - Stream info
 * @param {Function} realFetch - Fetch function
 * @param {number} startIdx - Starting index for player types
 * @param {boolean} minimal - Minimal checks flag
 * @returns {Promise<{type: string|null, m3u8: string|null}>}
 */
async function _findBackupStream(info, realFetch, startIdx = 0, minimal = false) {
    let backupType = null;
    let backupM3u8 = null;
    let fallbackM3u8 = null;

    // Optimization: Try the last successful backup type first (Sticky)
    // This saves unnecessary network requests for types that didn't work previously
    let playerTypes = [...BackupPlayerTypes];
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

        for (let j = 0; j < 2; j++) {
            let fresh = false;
            let enc = info.BackupEncodingsM3U8Cache[pt];

            if (!enc) {
                fresh = true;
                try {
                    const tokenRes = await _getToken(info.ChannelName, realPt);
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
                    _log('Error getting backup: ' + e.message, 'error');
                }
            }

            if (enc) {
                try {
                    const streamUrl = _getStreamUrl(enc, res || {});
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
                    _log('Stream fetch error: ' + e.message, 'warning');
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
