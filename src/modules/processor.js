// TTV AB - Processor

async function _processM3U8(url, text, realFetch) {
    if (!__TTVAB_STATE__.IsAdStrippingEnabled) return text;

    const info = __TTVAB_STATE__.StreamInfosByUrl[url];
    if (!info) return text;

    if (__TTVAB_STATE__.HasTriggeredPlayerReload) {
        __TTVAB_STATE__.HasTriggeredPlayerReload = false;
        info.LastPlayerReload = Date.now();
    }

    const hasAds = text.includes(__TTVAB_STATE__.AdSignifier) || __TTVAB_STATE__.SimulatedAdsDepth > 0;

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

        if (info.IsUsingFallbackStream) {
            text = _stripAds(text, false, info);
            return text;
        }

        const res = info.Urls[url];
        if (!res) {
            _log('Missing resolution info for ' + url, 'warning');
            return text;
        }

        const isHevc = res.Codecs?.[0] === 'h' && (res.Codecs[1] === 'e' || res.Codecs[1] === 'v');
        if (((isHevc && !__TTVAB_STATE__.SkipPlayerReloadOnHevc) || __TTVAB_STATE__.AlwaysReloadPlayerOnAd) && info.ModifiedM3U8 && !info.IsUsingModifiedM3U8) {
            info.IsUsingModifiedM3U8 = true;
            info.LastPlayerReload = Date.now();
        }

        const { type: backupType, m3u8: backupM3u8, isFallback } = await _findBackupStream(info, realFetch, 0, false, res);

        if (!backupM3u8) _log('Failed to find backup stream', 'warning');

        if (isFallback) {
            info.IsUsingFallbackStream = true;
            _log('Entering fallback mode - stripping ads', 'info');
        }

        if (backupM3u8) text = backupM3u8;

        if (info.ActiveBackupPlayerType !== backupType) {
            info.ActiveBackupPlayerType = backupType;
            _log('Using backup: ' + backupType, 'info');
        }

        text = _stripAds(text, false, info);
    } else {
        if (info.IsShowingAd) {
            const wasUsingModifiedM3U8 = info.IsUsingModifiedM3U8;

            info.IsShowingAd = false;
            info.IsUsingModifiedM3U8 = false;
            info.IsUsingFallbackStream = false;
            info.RequestedAds.clear();
            info.BackupEncodingsM3U8Cache = [];
            info.ActiveBackupPlayerType = null;
            _log('Ad ended', 'success');
            if (typeof self !== 'undefined' && self.postMessage) {
                self.postMessage({ key: 'AdEnded' });
                if (wasUsingModifiedM3U8 || __TTVAB_STATE__.ReloadPlayerAfterAd) {
                    self.postMessage({ key: 'ReloadPlayer' });
                } else {
                    self.postMessage({ key: 'PauseResumePlayer' });
                }
            }
        }
    }

    return text;
}

async function _findBackupStream(info, realFetch, startIdx = 0, minimal = false, currentResolution = null) {
    let backupType = null;
    let backupM3u8 = null;
    let fallbackM3u8 = null;
    let fallbackType = null;

    const playerTypes = [...__TTVAB_STATE__.BackupPlayerTypes];
    if (info.ActiveBackupPlayerType) {
        const idx = playerTypes.indexOf(info.ActiveBackupPlayerType);
        if (idx > -1) {
            playerTypes.splice(idx, 1);
            playerTypes.unshift(info.ActiveBackupPlayerType);
        }
    }

    const playerTypesLen = playerTypes.length;
    const targetRes = currentResolution || { Resolution: '1920x1080', FrameRate: '60' };

    for (let pi = startIdx; !backupM3u8 && pi < playerTypesLen; pi++) {
        const pt = playerTypes[pi];
        const realPt = pt.replace('-CACHED', '');
        const isFullyCachedPlayerType = pt !== realPt;
        _log(`[Trace] Checking: ${pt}`, 'info');

        for (let j = 0; j < 2; j++) {
            let isFreshM3u8 = false;
            let enc = info.BackupEncodingsM3U8Cache[pt];

            if (!enc) {
                isFreshM3u8 = true;
                try {
                    const tokenRes = await _getToken(info.ChannelName, realPt, realFetch);
                    if (tokenRes.status === 200) {
                        const token = await tokenRes.json();
                        const sig = token?.data?.streamPlaybackAccessToken?.signature;
                        const tokenValue = token?.data?.streamPlaybackAccessToken?.value;

                        if (sig && tokenValue) {
                            const usherUrl = new URL(`https://usher.ttvnw.net/api/${__TTVAB_STATE__.V2API ? 'v2/' : ''}channel/hls/${info.ChannelName}.m3u8${info.UsherParams}`);
                            usherUrl.searchParams.set('sig', sig);
                            usherUrl.searchParams.set('token', tokenValue);
                            const encRes = await realFetch(usherUrl.href);
                            if (encRes.status === 200) {
                                enc = info.BackupEncodingsM3U8Cache[pt] = await encRes.text();
                            } else {
                                _log(`Usher failed for ${pt}: ${encRes.status}`, 'warning');
                            }
                        } else {
                            _log(`[Trace] Missing token for ${pt}`, 'warning');
                        }
                    } else {
                        _log(`Token failed for ${pt}: ${tokenRes.status}`, 'warning');
                    }
                } catch (e) {
                    _log('Backup error: ' + e.message, 'error');
                }
            }

            if (enc) {
                try {
                    const streamUrl = _getStreamUrl(enc, targetRes);
                    if (streamUrl) {
                        const streamRes = await realFetch(streamUrl);
                        if (streamRes.status === 200) {
                            const m3u8 = await streamRes.text();
                            if (m3u8) {
                                if (!fallbackM3u8 || pt === __TTVAB_STATE__.FallbackPlayerType) {
                                    fallbackM3u8 = m3u8;
                                    fallbackType = pt;
                                }

                                const noAds = !m3u8.includes(__TTVAB_STATE__.AdSignifier) && (__TTVAB_STATE__.SimulatedAdsDepth === 0 || pi >= __TTVAB_STATE__.SimulatedAdsDepth - 1);

                                if (noAds || minimal) {
                                    backupType = pt;
                                    backupM3u8 = m3u8;
                                    _log(`[Trace] Selected: ${pt}`, 'success');
                                    break;
                                } else {
                                    _log(`[Trace] Rejected ${pt} (has ads)`, 'warning');
                                    if (isFullyCachedPlayerType) break;
                                }
                            }
                        } else {
                            _log(`Stream failed for ${pt}: ${streamRes.status}`, 'warning');
                        }
                    } else {
                        _log(`No stream URL for ${pt}`, 'warning');
                    }
                } catch (e) {
                    _log('Stream error: ' + e.message, 'warning');
                }
            }

            info.BackupEncodingsM3U8Cache[pt] = null;
            if (isFreshM3u8) break;
        }
    }

    let isFallback = false;
    if (!backupM3u8 && fallbackM3u8) {
        backupType = fallbackType || __TTVAB_STATE__.FallbackPlayerType;
        backupM3u8 = fallbackM3u8;
        isFallback = true;
        _log(`[Trace] Using fallback: ${backupType}`, 'warning');
    }

    return { type: backupType, m3u8: backupM3u8, isFallback };
}
