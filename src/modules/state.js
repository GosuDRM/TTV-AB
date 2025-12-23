// TTV AB - State

const _S = {
    workers: [],
    conflicts: ['twitch', 'isVariantA'],
    reinsertPatterns: ['isVariantA', 'besuper/', '${patch_url}'],
    adsBlocked: 0,
    popupsBlocked: 0
};

function _declareState(scope) {
    scope.__TTVAB_STATE__ = {
        AdSignifier: _C.AD_SIGNIFIER,
        ClientID: _C.CLIENT_ID,
        BackupPlayerTypes: [..._C.PLAYER_TYPES],
        FallbackPlayerType: _C.FALLBACK_TYPE,
        ForceAccessTokenPlayerType: _C.FORCE_TYPE,
        SkipPlayerReloadOnHevc: false,
        AlwaysReloadPlayerOnAd: false,
        ReloadPlayerAfterAd: _C.RELOAD_AFTER_AD ?? true,
        PlayerReloadMinimalRequestsTime: _C.RELOAD_TIME,
        PlayerReloadMinimalRequestsPlayerIndex: 2,
        HasTriggeredPlayerReload: false,
        StreamInfos: Object.create(null),
        StreamInfosByUrl: Object.create(null),
        GQLDeviceID: null,
        ClientVersion: null,
        ClientSession: null,
        ClientIntegrityHeader: null,
        AuthorizationHeader: undefined,
        SimulatedAdsDepth: 0,
        V2API: false,
        IsAdStrippingEnabled: true,
        AdSegmentCache: new Map(),
        AllSegmentsAreAdSegments: false,
        PlaybackAccessTokenHash: null
    };
}

function _incrementAdsBlocked(channel) {
    _S.adsBlocked++;
    if (typeof window !== 'undefined') {
        window.postMessage({ type: 'ttvab-ad-blocked', detail: { count: _S.adsBlocked, channel: channel || null } }, '*');
    } else if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage({ key: 'AdBlocked', count: _S.adsBlocked, channel: channel || null });
    }
}
