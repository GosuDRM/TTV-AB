/**
 * TTV AB - Processor Module
 * M3U8 stream processing and ad replacement
 * @module processor
 * @private
 */

/**
 * Global state for proxy fetch requests
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

        // If we're already in fallback mode (using ad-stripped fallback stream),
        // DON'T restart the backup stream search - just keep stripping ads from current stream.
        // This prevents the infinite loop where we keep searching for backup streams.
        if (info.IsUsingFallbackStream) {
            _log('[Trace] Already in fallback mode, stripping ads without re-searching', 'info');
            text = _stripAds(text, false, info, true);
            return text;
        }

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

        const { type: backupType, m3u8: backupM3u8, isFallback } = await _findBackupStream(info, realFetch);

        if (!backupM3u8) _log('Failed to find any backup stream', 'warning');

        // Mark fallback mode if we're using a fallback stream (stream with ads that we'll strip)
        if (isFallback) {
            info.IsUsingFallbackStream = true;
            _log('Entering fallback mode - will strip ads from stream', 'info');
        }

        if (backupM3u8) text = backupM3u8;

        if (info.ActiveBackupPlayerType !== backupType) {
            info.ActiveBackupPlayerType = backupType;
            _log('Using backup player type: ' + backupType, 'info');
        }

        // Pass true for isBackup if we found a backup stream
        text = _stripAds(text, false, info, !!backupM3u8);
    } else {
        if (info.IsShowingAd) {
            info.IsShowingAd = false;
            info.IsUsingModifiedM3U8 = false;
            info.IsUsingFallbackStream = false; // Exit fallback mode when ads end
            info.RequestedAds.clear();
            info.BackupEncodingsM3U8Cache = [];
            info.ActiveBackupPlayerType = null;
            _log('Ad ended', 'success');
            if (typeof self !== 'undefined' && self.postMessage) {
                self.postMessage({ key: 'AdEnded' });
                // Trigger player reload or pause/play for cleaner stream recovery
                if (info.IsUsingModifiedM3U8 || ReloadPlayerAfterAd) {
                    self.postMessage({ key: 'ReloadPlayer' });
                } else {
                    self.postMessage({ key: 'PauseResumePlayer' });
                }
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
    let fallbackM3u8 = null; // Store fallback stream (with ads) for last resort stripping
    let fallbackType = null; // Track which player type the fallback came from

    // Optimization: Try the last successful backup type first (Sticky)
    // This saves unnecessary network requests for types that didn't work previously
    const playerTypes = [...BackupPlayerTypes];
    if (info.ActiveBackupPlayerType) {
        const idx = playerTypes.indexOf(info.ActiveBackupPlayerType);
        if (idx > -1) {
            playerTypes.splice(idx, 1);
            playerTypes.unshift(info.ActiveBackupPlayerType);
        }
    }

    const playerTypesLen = playerTypes.length;

    // FORCE 480p during ad blocking - lower resolutions often don't have ads
    // This gives users a better chance of getting an ad-free stream
    const force480p = { Resolution: '852x480', FrameRate: '30' };

    for (let pi = startIdx; !backupM3u8 && pi < playerTypesLen; pi++) {
        const pt = playerTypes[pi];
        const realPt = pt.replace('-CACHED', '');
        const isFullyCachedPlayerType = pt !== realPt;
        _log(`[Trace] Checking player type: ${pt} (Fallback=${FallbackPlayerType})`, 'info');

        for (let j = 0; j < 2; j++) {
            let isFreshM3u8 = false;
            let enc = info.BackupEncodingsM3U8Cache[pt];

            if (!enc) {
                isFreshM3u8 = true;
                try {
                    // Standard Twitch usher fetch
                    const tokenRes = await _getToken(info.ChannelName, realPt, realFetch);
                    if (tokenRes.status === 200) {
                        const token = await tokenRes.json();
                        const sig = token?.data?.streamPlaybackAccessToken?.signature;
                        const tokenValue = token?.data?.streamPlaybackAccessToken?.value;

                        // Check for valid token components
                        if (sig && tokenValue) {
                            const usherUrl = new URL(`https://usher.ttvnw.net/api/${V2API ? 'v2/' : ''}channel/hls/${info.ChannelName}.m3u8${info.UsherParams}`);
                            usherUrl.searchParams.set('sig', sig);
                            usherUrl.searchParams.set('token', tokenValue);
                            const encRes = await realFetch(usherUrl.href);
                            if (encRes.status === 200) {
                                enc = info.BackupEncodingsM3U8Cache[pt] = await encRes.text();
                                _log(`[Trace] Got encoding M3U8 for ${pt}. Length: ${enc.length}`, 'info');
                            } else {
                                _log(`Backup usher fetch failed for ${pt}: ${encRes.status}`, 'warning');
                            }
                        } else {
                            _log(`[Trace] Missing token data for ${pt} (sig=${!!sig}, value=${!!tokenValue})`, 'warning');
                        }
                    } else {
                        _log(`Backup token fetch failed for ${pt}: ${tokenRes.status}`, 'warning');
                    }
                } catch (e) {
                    _log('Error getting backup: ' + e.message, 'error');
                }
            } else {
                _log(`[Trace] Using cached encoding for ${pt}`, 'info');
            }

            if (enc) {
                try {
                    const streamUrl = _getStreamUrl(enc, force480p);
                    if (streamUrl) {
                        _log(`[Trace] Fetching stream URL for ${pt}: ${streamUrl}`, 'info');
                        const streamRes = await realFetch(streamUrl);
                        if (streamRes.status === 200) {
                            const m3u8 = await streamRes.text();
                            if (m3u8) {
                                _log(`[Trace] Got stream M3U8 for ${pt}. Length: ${m3u8.length}`, 'info');

                                // Store any valid M3U8 as potential fallback for ad stripping
                                // Prioritize FallbackPlayerType but accept any working stream
                                if (!fallbackM3u8 || pt === FallbackPlayerType) {
                                    fallbackM3u8 = m3u8;
                                    fallbackType = pt;
                                }

                                const noAds = !m3u8.includes(AdSignifier) && (SimulatedAdsDepth === 0 || pi >= SimulatedAdsDepth - 1);
                                const isLastResort = pi >= playerTypesLen - 1;

                                // Accept stream if: no ads, minimal mode, or it's the last player type
                                if (noAds || minimal) {
                                    backupType = pt;
                                    backupM3u8 = m3u8;
                                    _log(`[Trace] Selected backup: ${pt}${noAds ? '' : ' (last resort)'}`, 'success');
                                    break;
                                } else {
                                    _log(`[Trace] Rejected ${pt} (HasAds=true, LastResort=${isLastResort})`, 'warning');

                                    // For fully cached types, don't retry
                                    if (isFullyCachedPlayerType) {
                                        break;
                                    }
                                }
                            } else {
                                _log(`[Trace] Stream content empty for ${pt}`, 'warning');
                            }
                        } else {
                            _log(`Backup stream fetch failed for ${pt}: ${streamRes.status}`, 'warning');
                        }
                    } else {
                        _log(`No matching stream URL found for ${pt}`, 'warning');
                    }
                } catch (e) {
                    _log('Stream fetch error: ' + e.message, 'warning');
                }
            }

            info.BackupEncodingsM3U8Cache[pt] = null;
            if (isFreshM3u8) break;
        }
    }

    // Last resort: Use fallback stream if no ad-free stream found
    // This allows ad stripping to work even when all streams have ads
    let isFallback = false;
    if (!backupM3u8 && fallbackM3u8) {
        backupType = fallbackType || FallbackPlayerType;
        backupM3u8 = fallbackM3u8;
        isFallback = true; // Mark this as a fallback (ad-laden) stream
        _log(`[Trace] Using fallback stream (will strip ads): ${backupType}`, 'warning');
    }

    return { type: backupType, m3u8: backupM3u8, isFallback };
}
