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
    scope.AdSignifier = _C.AD_SIGNIFIER;
    scope.ClientID = _C.CLIENT_ID;
    scope.BackupPlayerTypes = [..._C.PLAYER_TYPES];
    scope.FallbackPlayerType = _C.FALLBACK_TYPE;
    scope.ForceAccessTokenPlayerType = _C.FORCE_TYPE;
    scope.SkipPlayerReloadOnHevc = false;
    scope.AlwaysReloadPlayerOnAd = false;
    scope.ReloadPlayerAfterAd = _C.RELOAD_AFTER_AD ?? true;
    scope.PlayerReloadMinimalRequestsTime = _C.RELOAD_TIME;
    scope.PlayerReloadMinimalRequestsPlayerIndex = 0;
    scope.HasTriggeredPlayerReload = false;
    scope.StreamInfos = Object.create(null);
    scope.StreamInfosByUrl = Object.create(null);
    scope.GQLDeviceID = null;
    scope.ClientVersion = null;
    scope.ClientSession = null;
    scope.ClientIntegrityHeader = null;
    scope.AuthorizationHeader = undefined;
    scope.SimulatedAdsDepth = 0;
    scope.V2API = false;
    scope.IsAdStrippingEnabled = true;
    scope.AdSegmentCache = new Map();
    scope.AllSegmentsAreAdSegments = false;
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
