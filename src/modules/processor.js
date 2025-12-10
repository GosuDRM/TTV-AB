/**
 * TTV AB - Processor Module
 * M3U8 stream processing and ad replacement
 * @private
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
            _log('Ad detected, blocking...', 'warning');
            _incrementAdsBlocked(); // Increment counter
        }

        if (!info.IsMidroll) {
            const lines = text.replaceAll('\r', '').split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith('#EXTINF') && lines.length > i + 1) {
                    if (!lines[i].includes(',live') && !info.RequestedAds.has(lines[i + 1])) {
                        info.RequestedAds.add(lines[i + 1]);
                        fetch(lines[i + 1]).then(r => r.blob()).catch(() => { });
                        break;
                    }
                }
            }
        }

        const res = info.Urls[url];
        if (!res) { _log('Missing resolution info for ' + url, 'warning'); return text; }

        const isHevc = res.Codecs.startsWith('hev') || res.Codecs.startsWith('hvc');
        if (((isHevc && !SkipPlayerReloadOnHevc) || AlwaysReloadPlayerOnAd) && info.ModifiedM3U8 && !info.IsUsingModifiedM3U8) {
            info.IsUsingModifiedM3U8 = true;
            info.LastPlayerReload = Date.now();
        }

        let backupType = null, backupM3u8 = null, fallbackM3u8 = null;
        let startIdx = 0, minimal = false;

        if (info.LastPlayerReload > Date.now() - PlayerReloadMinimalRequestsTime) {
            startIdx = PlayerReloadMinimalRequestsPlayerIndex;
            minimal = true;
        }

        for (let pi = startIdx; !backupM3u8 && pi < BackupPlayerTypes.length; pi++) {
            const pt = BackupPlayerTypes[pi];
            const realPt = pt.replace('-CACHED', '');
            const cached = pt != realPt;

            for (let j = 0; j < 2; j++) {
                let fresh = false;
                let enc = info.BackupEncodingsM3U8Cache[pt];

                if (!enc) {
                    fresh = true;
                    try {
                        const tokenRes = await _getToken(info.ChannelName, realPt);
                        if (tokenRes.status === 200) {
                            const token = await tokenRes.json();
                            if (token?.data?.streamPlaybackAccessToken?.signature) {
                                const u = new URL('https://usher.ttvnw.net/api/' + (V2API ? 'v2/' : '') + 'channel/hls/' + info.ChannelName + '.m3u8' + info.UsherParams);
                                u.searchParams.set('sig', token.data.streamPlaybackAccessToken.signature);
                                u.searchParams.set('token', token.data.streamPlaybackAccessToken.value);
                                const encRes = await realFetch(u.href);
                                if (encRes.status === 200) enc = info.BackupEncodingsM3U8Cache[pt] = await encRes.text();
                            }
                        }
                    } catch (e) { _log('Error getting backup: ' + e.message, 'error'); }
                }

                if (enc) {
                    try {
                        const streamUrl = _getStreamUrl(enc, res);
                        const streamRes = await realFetch(streamUrl);
                        if (streamRes.status == 200) {
                            const m3u8 = await streamRes.text();
                            if (m3u8) {
                                if (pt == FallbackPlayerType) fallbackM3u8 = m3u8;
                                if ((!m3u8.includes(AdSignifier) && (SimulatedAdsDepth == 0 || pi >= SimulatedAdsDepth - 1)) || (!fallbackM3u8 && pi >= BackupPlayerTypes.length - 1)) {
                                    backupType = pt; backupM3u8 = m3u8; break;
                                }
                                if (cached) break;
                                if (minimal) { backupType = pt; backupM3u8 = m3u8; break; }
                            }
                        }
                    } catch (e) { }
                }

                info.BackupEncodingsM3U8Cache[pt] = null;
                if (fresh) break;
            }
        }

        if (!backupM3u8 && fallbackM3u8) { backupType = FallbackPlayerType; backupM3u8 = fallbackM3u8; }
        if (backupM3u8) text = backupM3u8;

        if (info.ActiveBackupPlayerType != backupType) {
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
        }
    }

    return text;
}
