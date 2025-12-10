/**
 * TTV AB - State Module
 * Manages global state and worker references
 * @private
 */
const _S = {
    workers: [],
    conflicts: ['twitch', 'isVariantA'],
    reinsertPatterns: ['isVariantA', 'besuper/', '${patch_url}']
};

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
    scope.StreamInfos = [];
    scope.StreamInfosByUrl = [];
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
