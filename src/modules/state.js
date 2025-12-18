/**
 * TTV AB - State Module
 * Global state management and runtime variables
 * @module state
 * @private
 */

/** @type {Object} Runtime state container */
const _S = {
    /** Active worker instances */
    workers: [],
    /** Conflict detection patterns */
    conflicts: ['twitch', 'isVariantA'],
    /** Patterns requiring reinsert */
    reinsertPatterns: ['isVariantA', 'besuper/', '${patch_url}'],
    /** Counter for blocked ads */
    adsBlocked: 0,
    /** Counter for blocked anti-adblock popups */
    popupsBlocked: 0
};

/**
 * Initialize runtime state on a scope (window or self)
 * @param {Object} scope - Target scope (window/self)
 */
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
        PlayerReloadMinimalRequestsPlayerIndex: 0,
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
        AllSegmentsAreAdSegments: false
    };
}

/**
 * Increment blocked ads counter and dispatch event
 * @param {string} [channel] - Channel name where ad was blocked
 */
function _incrementAdsBlocked(channel) {
    _S.adsBlocked++;

    // CRITICAL: Use window.postMessage() to cross MAIN→ISOLATED world boundary
    // document.dispatchEvent() does NOT work across content script worlds!
    if (typeof window !== 'undefined') {
        window.postMessage({
            type: 'ttvab-ad-blocked',
            detail: { count: _S.adsBlocked, channel: channel || null }
        }, '*');
    } else if (typeof self !== 'undefined' && self.postMessage) {
        // Worker context - use worker's postMessage
        self.postMessage({ key: 'AdBlocked', count: _S.adsBlocked, channel: channel || null });
    }
}
