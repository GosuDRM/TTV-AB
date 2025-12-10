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
    adsBlocked: 0
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
 */
function _incrementAdsBlocked() {
    _S.adsBlocked++;
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ttvab-ad-blocked', { detail: { count: _S.adsBlocked } }));
    } else if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage({ key: 'AdBlocked', count: _S.adsBlocked });
    }
}
