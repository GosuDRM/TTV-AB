// TTV AB v9.3.3 - Twitch Ad Blocker
// Built file: src/scripts/content.js
(function(){
'use strict';
"use strict";

const _$c = {
    VERSION: "9.3.3",
    INTERNAL_VERSION: 211,
    LOG_STYLES: {
        prefix: "background: linear-gradient(135deg, #9146FF, #772CE8); color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;",
        info: "color: #9146FF; font-weight: 500;",
        success: "color: #4CAF50; font-weight: 500;",
        warning: "color: #FF9800; font-weight: 500;",
        error: "color: #f44336; font-weight: 500;",
    },
    AD_SIGNIFIER: "stitched",
    CLIENT_ID: "kimne78kx3ncx6brgo4mv6wki5h1ko",
    PLAYER_TYPES: ["site", "embed", "popout", "mobile_web", "autoplay"],
    FALLBACK_TYPE: "embed",
    FORCE_TYPE: "popout",
    RELOAD_TIME: 1500,
    PLAYER_RELOAD_DEBOUNCE_MS: 1500,
    AD_CYCLE_STALE_MS: 30000,
    AD_END_GRACE_MS: 500,
    AD_END_MAX_WAIT_MS: 4000,
    AD_END_BACKUP_HOLD_MAX_MS: 90000,
    AD_END_MIN_CLEAN_PLAYLISTS: 3,
    AD_END_MIN_NATIVE_RECOVERY_PROBES: 3,
    AD_END_NATIVE_RECOVERY_PROBE_COOLDOWN_MS: 500,
    AD_END_MAX_FAILED_NATIVE_PROBES: 6,
    AD_RECOVERY_RELOAD_COOLDOWN_MS: 30000,
    PINNED_BACKUP_STALL_DETECTION_MS: 3000,
    PINNED_BACKUP_STALL_POLL_MS: 1500,
    BUFFERING_FIX: true,
    RELOAD_AFTER_AD: true,
    REWRITE_NATIVE_PLAYBACK_ACCESS_TOKEN: false,
    PLAYER_BUFFERING_DO_PLAYER_RELOAD: false,
    LQ_HQ_HOLD_MIN_MS: 8000,
};

"use strict";

const _$s = {
    workers: [],
    conflicts: ["twitch", "isVariantA"],
    reinsertPatterns: ["isVariantA"],
    toleratedWorkerWrappers: [
        {
            name: "TwitchNoSub",
            signatures: ["${patch_url}", "twitchBlobUrl", "getWasmWorkerJs"],
        },
    ],
    adsBlocked: 0,
};
const _BRIDGE_PORT_INIT_MESSAGE = "ttvab-bridge-port-init";
const _BRIDGE_READY_MESSAGE = "ttvab-bridge-ready";
const _internalMessageTarget = new EventTarget();
const _pendingBridgeMessages = [];
const _MAX_PENDING_BRIDGE_MESSAGES = 64;
const _MAX_PENDING_BRIDGE_COUNTER_MESSAGES = 256;
let _bridgePort = null;
let _bridgePortHandshakeBound = false;
let _bridgeSessionToken = null;
function _bridgePortMessageHandler(event) {
    const message = _getStructuredMessageData(event.data);
    if (typeof message?.type !== "string")
        return;
    _emitInternalMessage(message.type, message.detail ?? null);
}
function _getStructuredMessageData(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value;
}
function _emitInternalMessage(type, detail = null) {
    if (typeof type !== "string" || !type)
        return;
    _internalMessageTarget.dispatchEvent(new CustomEvent(type, {
        detail,
    }));
}
function _onInternalMessage(type, handler) {
    _internalMessageTarget.addEventListener(type, (event) => {
        const detail = event instanceof CustomEvent
            ? event.detail
            : event.detail;
        handler(detail);
    });
}
function _normalizeCount(value) {
    const numericValue = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return Number.isFinite(numericValue)
        ? Math.max(0, Math.trunc(numericValue))
        : 0;
}
function _getPendingBridgeCounterDetail(message) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
        return null;
    }
    const type = typeof message.type === "string" ? message.type : null;
    if (type !== "ttvab-ad-blocked") {
        return null;
    }
    const detail = message.detail;
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
        return null;
    }
    return detail;
}
function _getPendingBridgeCounterIdentity(message) {
    const detail = _getPendingBridgeCounterDetail(message);
    if (!detail)
        return null;
    const type = String(message.type);
    const safeChannel = typeof detail.channel === "string" ? detail.channel : "";
    const safeMediaKey = typeof detail.mediaKey === "string" ? detail.mediaKey : "";
    const safePageChannel = typeof detail.pageChannel === "string" ? detail.pageChannel : "";
    const safePageMediaKey = typeof detail.pageMediaKey === "string" ? detail.pageMediaKey : "";
    return [
        type,
        safeChannel,
        safeMediaKey,
        safePageChannel,
        safePageMediaKey,
    ].join("|");
}
function _mergePendingBridgeCounterMessages(target, incoming) {
    const targetDetail = _getPendingBridgeCounterDetail(target);
    const incomingDetail = _getPendingBridgeCounterDetail(incoming);
    if (!targetDetail || !incomingDetail)
        return false;
    const mergedCount = Math.max(_normalizeCount(targetDetail.count), _normalizeCount(incomingDetail.count));
    target.detail = {
        ...targetDetail,
        ...incomingDetail,
        count: mergedCount,
        delta: Math.min(_normalizeCount(targetDetail.delta) +
            _normalizeCount(incomingDetail.delta), mergedCount),
    };
    return true;
}
function _coalescePendingBridgeCounterMessage(message) {
    const identity = _getPendingBridgeCounterIdentity(message);
    if (!identity)
        return false;
    for (let i = _pendingBridgeMessages.length - 1; i >= 0; i--) {
        if (_getPendingBridgeCounterIdentity(_pendingBridgeMessages[i]) !== identity) {
            continue;
        }
        return _mergePendingBridgeCounterMessages(_pendingBridgeMessages[i], message);
    }
    return false;
}
function _dropOldestNonCounterPendingBridgeMessage() {
    for (let i = 0; i < _pendingBridgeMessages.length; i++) {
        if (_getPendingBridgeCounterIdentity(_pendingBridgeMessages[i]))
            continue;
        _pendingBridgeMessages.splice(i, 1);
        return true;
    }
    return false;
}
function _collapseOldestPendingCounterMessage() {
    for (let i = 0; i < _pendingBridgeMessages.length; i++) {
        const identity = _getPendingBridgeCounterIdentity(_pendingBridgeMessages[i]);
        if (!identity)
            continue;
        for (let j = _pendingBridgeMessages.length - 1; j > i; j--) {
            if (_getPendingBridgeCounterIdentity(_pendingBridgeMessages[j]) !== identity) {
                continue;
            }
            if (_mergePendingBridgeCounterMessages(_pendingBridgeMessages[j], _pendingBridgeMessages[i])) {
                _pendingBridgeMessages.splice(i, 1);
                return true;
            }
        }
    }
    return false;
}
function _trimPendingBridgeMessages() {
    while (_pendingBridgeMessages.length > _MAX_PENDING_BRIDGE_MESSAGES) {
        if (_dropOldestNonCounterPendingBridgeMessage())
            continue;
        if (_pendingBridgeMessages.length <= _MAX_PENDING_BRIDGE_COUNTER_MESSAGES) {
            break;
        }
        if (_collapseOldestPendingCounterMessage())
            continue;
        _pendingBridgeMessages.shift();
    }
}
function _flushBridgeMessageQueue() {
    if (!_bridgePort)
        return;
    while (_pendingBridgeMessages.length > 0) {
        const nextMessage = _pendingBridgeMessages[0];
        try {
            _bridgePort.postMessage(nextMessage);
            _pendingBridgeMessages.shift();
        }
        catch {
            _pendingBridgeMessages.shift();
        }
    }
}
function _attachBridgePort(port, sessionToken = null) {
    if (!port ||
        typeof port.postMessage !== "function" ||
        typeof sessionToken !== "string" ||
        sessionToken.length < 16) {
        return false;
    }
    if (_bridgePort === port && _bridgeSessionToken === sessionToken)
        return true;
    if (_bridgePort &&
        _bridgeSessionToken &&
        _bridgeSessionToken !== sessionToken) {
        return false;
    }
    if (_bridgePort) {
        try {
            _bridgePort.removeEventListener("message", _bridgePortMessageHandler);
            _bridgePort.close();
        }
        catch { }
    }
    _bridgePort = port;
    _bridgeSessionToken = sessionToken;
    _bridgePort.addEventListener("message", _bridgePortMessageHandler);
    _bridgePort.start?.();
    _flushBridgeMessageQueue();
    return true;
}
function _bindBridgePortHandshake() {
    if (_bridgePortHandshakeBound || typeof window === "undefined")
        return;
    _bridgePortHandshakeBound = true;
    const handleBridgePortInit = (event) => {
        if (event.source !== window)
            return;
        const message = _getStructuredMessageData(event.data);
        const sessionToken = typeof message?.detail?.token === "string"
            ? String(message.detail.token)
            : null;
        if (message?.type !== _BRIDGE_PORT_INIT_MESSAGE ||
            typeof sessionToken !== "string" ||
            sessionToken.length < 16 ||
            !Array.isArray(event.ports) ||
            event.ports.length !== 1) {
            return;
        }
        if (!_attachBridgePort(event.ports[0], sessionToken))
            return;
        event.stopImmediatePropagation?.();
        _sendBridgeMessage(_BRIDGE_READY_MESSAGE, {
            token: sessionToken,
        });
    };
    window.addEventListener("message", handleBridgePortInit, true);
}
function _sendBridgeMessage(type, detail = null) {
    if (typeof type !== "string" || !type)
        return false;
    const message = { type, detail };
    if (_bridgePort) {
        try {
            _bridgePort.postMessage(message);
            return true;
        }
        catch { }
    }
    if (_coalescePendingBridgeCounterMessage(message)) {
        return false;
    }
    _pendingBridgeMessages.push(message);
    _trimPendingBridgeMessages();
    return false;
}
function _createWorkerBridgeMessage(message) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
        return null;
    }
    const key = message.key;
    if (typeof key !== "string" || !key) {
        return null;
    }
    return {
        __ttvabWorkerBridge: true,
        message,
    };
}
function _getWorkerBridgeMessage(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    const envelope = value;
    if (envelope.__ttvabWorkerBridge !== true) {
        return null;
    }
    const message = envelope.message;
    if (!message || typeof message !== "object" || Array.isArray(message)) {
        return null;
    }
    if (typeof message.key !== "string" || !message.key) {
        return null;
    }
    return message;
}
function _postWorkerBridgeMessage(target, message) {
    if (!target || typeof target.postMessage !== "function") {
        return false;
    }
    const envelope = _createWorkerBridgeMessage(message);
    if (!envelope)
        return false;
    target.postMessage(envelope);
    return true;
}
function _$bw(messages) {
    const queue = Array.isArray(messages) ? messages : [messages];
    if (queue.length === 0 || _$s.workers.length === 0)
        return;
    const aliveWorkers = [];
    for (const worker of _$s.workers) {
        let isAlive = true;
        for (const message of queue) {
            try {
                if (!_postWorkerBridgeMessage(worker, message)) {
                    isAlive = false;
                    break;
                }
            }
            catch {
                isAlive = false;
                break;
            }
        }
        if (isAlive) {
            aliveWorkers.push(worker);
        }
    }
    _$s.workers = aliveWorkers;
}
function _setPagePlaybackContext(context, options = {}) {
    if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__) {
        return _normalizePlaybackContext(context);
    }
    const normalizedContext = _normalizePlaybackContext(context);
    const previousMediaKey = __TTVAB_STATE__.PageMediaKey || null;
    let didResetAdScopedState = false;
    const hasChanged = __TTVAB_STATE__.PageMediaType !== normalizedContext.MediaType ||
        __TTVAB_STATE__.PageChannel !== normalizedContext.ChannelName ||
        __TTVAB_STATE__.PageVodID !== normalizedContext.VodID ||
        previousMediaKey !== normalizedContext.MediaKey;
    const didMediaKeyChange = previousMediaKey !== normalizedContext.MediaKey;
    __TTVAB_STATE__.PageMediaType = normalizedContext.MediaType;
    __TTVAB_STATE__.PageChannel = normalizedContext.ChannelName;
    __TTVAB_STATE__.PageVodID = normalizedContext.VodID;
    __TTVAB_STATE__.PageMediaKey = normalizedContext.MediaKey;
    if (didMediaKeyChange) {
        if (typeof _resetPlaybackIntentForNavigation === "function") {
            _resetPlaybackIntentForNavigation(normalizedContext.ChannelName, normalizedContext.MediaKey);
        }
        __TTVAB_STATE__.HasTriggeredPlayerReload = false;
        __TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
        __TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
        __TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
        __TTVAB_STATE__.LastPlayerReloadAt = 0;
        __TTVAB_STATE__.ShouldResumeAfterAd = false;
        __TTVAB_STATE__.ShouldResumeAfterAdChannel = null;
        __TTVAB_STATE__.ShouldResumeAfterAdMediaKey = null;
        __TTVAB_STATE__.ShouldResumeAfterAdUntil = 0;
        __TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
        __TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
        __TTVAB_STATE__.LastAdEndedAt = 0;
        __TTVAB_STATE__.LastAdEndedChannel = null;
        __TTVAB_STATE__.LastAdEndedMediaKey = null;
        __TTVAB_STATE__._AdRecoveryConsecutiveFailures = 0;
        if (previousMediaKey) {
            delete __TTVAB_STATE__.StreamInfos[previousMediaKey];
            for (const url in __TTVAB_STATE__.StreamInfosByUrl) {
                if (__TTVAB_STATE__.StreamInfosByUrl[url]?.MediaKey === previousMediaKey) {
                    delete __TTVAB_STATE__.StreamInfosByUrl[url];
                }
            }
        }
        __TTVAB_STATE__.CurrentAdChannel = null;
        __TTVAB_STATE__.CurrentAdMediaKey = null;
        __TTVAB_STATE__.PinnedBackupPlayerType = null;
        __TTVAB_STATE__.PinnedBackupPlayerChannel = null;
        __TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
        didResetAdScopedState = true;
    }
    if (options.broadcast !== false && hasChanged) {
        const messages = [
            {
                key: "UpdatePageContext",
                value: {
                    mediaType: normalizedContext.MediaType,
                    channelName: normalizedContext.ChannelName,
                    vodID: normalizedContext.VodID,
                    mediaKey: normalizedContext.MediaKey,
                },
            },
        ];
        if (didMediaKeyChange) {
            messages.push({
                key: "ResetPlaybackRecoveryState",
                value: {
                    clearAdContext: didResetAdScopedState,
                    previousMediaKey: previousMediaKey || null,
                },
            });
        }
        if (didResetAdScopedState) {
            messages.push({
                key: "UpdateCurrentAdContext",
                value: null,
            });
            messages.push({
                key: "UpdatePinnedBackupPlayerContext",
                value: null,
            });
        }
        _$bw(messages);
    }
    return normalizedContext;
}
function _syncPagePlaybackContext(options = {}) {
    return _setPagePlaybackContext(_getPlaybackContextFromUrl(globalThis?.location?.href || ""), options);
}
function _$ds(scope) {
    scope.__TTVAB_STATE__ = {
        AdSignifier: _$c.AD_SIGNIFIER,
        BackupPlayerTypes: [..._$c.PLAYER_TYPES],
        FallbackPlayerType: _$c.FALLBACK_TYPE,
        ForceAccessTokenPlayerType: _$c.FORCE_TYPE,
        RewriteNativePlaybackAccessToken: _$c.REWRITE_NATIVE_PLAYBACK_ACCESS_TOKEN ?? false,
        SkipPlayerReloadOnHevc: false,
        ReloadAfterAd: _$c.RELOAD_AFTER_AD ?? false,
        PlayerBufferingDoPlayerReload: _$c.PLAYER_BUFFERING_DO_PLAYER_RELOAD ?? false,
        PlayerReloadMinimalRequestsTime: _$c.RELOAD_TIME,
        PlayerReloadMinimalRequestsPlayerIndex: Math.max(0, _$c.PLAYER_TYPES.indexOf("autoplay") > -1
            ? _$c.PLAYER_TYPES.indexOf("autoplay")
            : _$c.PLAYER_TYPES.indexOf(_$c.FALLBACK_TYPE)),
        PlayerReloadDebounceMs: _$c.PLAYER_RELOAD_DEBOUNCE_MS ?? 1500,
        AdCycleStaleMs: _$c.AD_CYCLE_STALE_MS ?? 30000,
        AdEndGraceMs: _$c.AD_END_GRACE_MS ?? 2500,
        AdEndMaxWaitMs: _$c.AD_END_MAX_WAIT_MS ?? 2500,
        AdEndBackupHoldMaxMs: _$c.AD_END_BACKUP_HOLD_MAX_MS ?? 90000,
        AdEndMinCleanPlaylists: _$c.AD_END_MIN_CLEAN_PLAYLISTS ?? 2,
        AdEndMinNativeRecoveryProbes: _$c.AD_END_MIN_NATIVE_RECOVERY_PROBES ?? 3,
        AdEndNativeRecoveryProbeCooldownMs: _$c.AD_END_NATIVE_RECOVERY_PROBE_COOLDOWN_MS ?? 750,
        AdEndMaxFailedNativeProbes: _$c.AD_END_MAX_FAILED_NATIVE_PROBES ?? 6,
        AdRecoveryReloadCooldownMs: _$c.AD_RECOVERY_RELOAD_COOLDOWN_MS ?? 10000,
        PinnedBackupStallDetectionMs: _$c.PINNED_BACKUP_STALL_DETECTION_MS ?? 3000,
        PinnedBackupStallPollMs: _$c.PINNED_BACKUP_STALL_POLL_MS ?? 1500,
        BackupSearchForceRefreshAt: 0,
        LastPinnedBackupStallDetectedAt: 0,
        LqHqHoldMinMs: _$c.LQ_HQ_HOLD_MIN_MS ?? 8000,
        HasTriggeredPlayerReload: false,
        PendingTriggeredPlayerReloadChannel: null,
        PendingTriggeredPlayerReloadMediaKey: null,
        PendingTriggeredPlayerReloadAt: 0,
        LastPlayerReloadAt: 0,
        LastAdDetectedAt: 0,
        LastAdEndedAt: 0,
        LastAdEndedChannel: null,
        LastAdEndedMediaKey: null,
        LastAdRecoveryReloadAt: 0,
        LastAdRecoveryResumeAt: 0,
        CurrentAdChannel: null,
        CurrentAdMediaKey: null,
        PinnedBackupPlayerType: null,
        LastPinnedBackupPlayerType: null,
        PinnedBackupPlayerChannel: null,
        PinnedBackupPlayerMediaKey: null,
        ShouldResumeAfterAd: false,
        ShouldResumeAfterAdChannel: null,
        ShouldResumeAfterAdMediaKey: null,
        ShouldResumeAfterAdUntil: 0,
        StreamInfos: Object.create(null),
        StreamInfosByUrl: Object.create(null),
        GQLDeviceID: null,
        ClientVersion: null,
        ClientSession: null,
        ClientIntegrityHeader: null,
        AuthorizationHeader: null,
        SimulatedAdsDepth: 0,
        V2API: false,
        IsAdStrippingEnabled: true,
        IsBufferFixEnabled: _$c.BUFFERING_FIX,
        AdSegmentCache: new Map(),
        PlayerBufferingDelay: 600,
        PlayerBufferingSameStateCount: 5,
        PlayerBufferingDangerZone: 1,
        PlayerBufferingMinRepeatDelay: 8000,
        PlayerBufferingPrerollCheckEnabled: false,
        PlayerBufferingPrerollCheckOffset: 5,
        AllSegmentsAreAdSegments: false,
        PlaybackAccessTokenHash: null,
        LastNativePlaybackAccessTokenPlayerType: null,
        PageMediaType: null,
        PageChannel: null,
        PageVodID: null,
        PageMediaKey: null,
        PreferredQualityGroup: null,
        HasResolvedAdsCountState: false,
        HasResolvedToggleState: false,
        PlayerHasPlayedOnce: false,
        PlayerIsPlaying: false,
        PendingInitialAdsBlockedDelta: 0,
        PendingFetchRequests: new Map(),
        FetchRequestSeq: 0,
        _AdRecoveryConsecutiveFailures: 0,
        DisableAdSpoofing: false,
        DisableAutoplayBackup: true,
        LoggedAdSpoofNoMatch: false,
        LoggedAdSpoofNoToken: false,
        LoggedAdSpoofBadStatus: false,
    };
}
function _getPageScopedPlaybackEventContext() {
    if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__) {
        return {
            pageChannel: null,
            pageMediaKey: null,
        };
    }
    const pageContext = _normalizePlaybackContext({
        MediaType: __TTVAB_STATE__.PageMediaType,
        ChannelName: __TTVAB_STATE__.PageChannel,
        VodID: __TTVAB_STATE__.PageVodID,
        MediaKey: __TTVAB_STATE__.PageMediaKey,
    });
    return {
        pageChannel: pageContext.ChannelName,
        pageMediaKey: pageContext.MediaKey,
    };
}
function _$ab(channel, mediaKey = null) {
    _$s.adsBlocked++;
    const count = Number.isFinite(_$s.adsBlocked)
        ? Math.max(0, Math.trunc(_$s.adsBlocked))
        : 0;
    _$s.adsBlocked = count;
    if (typeof window !== "undefined" &&
        typeof __TTVAB_STATE__ !== "undefined" &&
        __TTVAB_STATE__ &&
        __TTVAB_STATE__.HasResolvedAdsCountState !== true) {
        __TTVAB_STATE__.PendingInitialAdsBlockedDelta = Math.max(0, Math.trunc(Number(__TTVAB_STATE__.PendingInitialAdsBlockedDelta) || 0) +
            1);
    }
    const safeChannel = typeof channel === "string" ? channel : null;
    const safeMediaKey = _normalizeMediaKey(mediaKey) ||
        _buildMediaKey("live", safeChannel, null) ||
        null;
    const pageEventContext = _getPageScopedPlaybackEventContext();
    const detail = {
        count,
        delta: 1,
        channel: safeChannel,
        mediaKey: safeMediaKey,
        pageChannel: pageEventContext.pageChannel,
        pageMediaKey: pageEventContext.pageMediaKey,
    };
    if (typeof window !== "undefined") {
        _emitInternalMessage("ttvab-ad-blocked", detail);
        _sendBridgeMessage("ttvab-ad-blocked", detail);
    }
    else if (typeof self !== "undefined" && self.postMessage) {
        _postWorkerBridgeMessage(self, {
            key: "AdBlocked",
            count: _$s.adsBlocked,
            delta: 1,
            channel: safeChannel,
            mediaKey: safeMediaKey,
            pageChannel: pageEventContext.pageChannel,
            pageMediaKey: pageEventContext.pageMediaKey,
        });
    }
}
function _createPageScopedWorkerEvent(value = null) {
    const pageEventContext = _getPageScopedPlaybackEventContext();
    return {
        ...(value && typeof value === "object" ? value : {}),
        pageChannel: pageEventContext.pageChannel,
        pageMediaKey: pageEventContext.pageMediaKey,
    };
}

"use strict";

let _$dl = false;
function _$edl() {
    _$dl = true;
    _$l("Debug logging enabled", "debug");
}
function _$l(msg, type = "info") {
    const text = typeof msg === "object" ? JSON.stringify(msg) : String(msg);
    const style = _$c.LOG_STYLES[type] || _$c.LOG_STYLES.info;
    if (type === "debug" && !_$dl)
        return;
    if (type === "error") {
        console.error(`%cTTV AB%c ${text}`, _$c.LOG_STYLES.prefix, style);
    }
    else if (type === "warning") {
        console.warn(`%cTTV AB%c ${text}`, _$c.LOG_STYLES.prefix, style);
    }
    else {
        console.log(`%cTTV AB%c ${text}`, _$c.LOG_STYLES.prefix, style);
    }
}

"use strict";

const _$ar = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi;
const _$amr = /stitched-ad|X-TV-TWITCH-AD|\/adsquared\/|SCTE35-OUT|EXT-X-CUE-OUT|EXT-X-DATERANGE:CLASS="twitch-|"(?:MIDROLL|midroll)"/;
const _RESERVED_ROUTE_SEGMENTS = new Set([
    "browse",
    "clip",
    "clips",
    "collections",
    "dashboard",
    "directory",
    "downloads",
    "drops",
    "embed",
    "event",
    "following",
    "friends",
    "inventory",
    "jobs",
    "manager",
    "messages",
    "moderator",
    "p",
    "player",
    "popout",
    "prime",
    "products",
    "search",
    "settings",
    "store",
    "subscriptions",
    "team",
    "turbo",
    "u",
    "user",
    "video",
    "videos",
    "wallet",
]);
function _normalizeChannelName(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim().toLowerCase();
    return /^[a-z0-9_]{1,25}$/.test(trimmed) ? trimmed : null;
}
function _normalizeVodID(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        value = String(Math.trunc(value));
    }
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return /^\d+$/.test(trimmed) ? trimmed : null;
}
function _buildMediaKey(mediaType, channelName = null, vodID = null) {
    if (mediaType === "vod") {
        const safeVodID = _normalizeVodID(vodID);
        return safeVodID ? `vod:${safeVodID}` : null;
    }
    const safeChannel = _normalizeChannelName(channelName);
    return safeChannel ? `live:${safeChannel}` : null;
}
function _normalizeMediaKey(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim().toLowerCase();
    if (trimmed.startsWith("live:")) {
        return _buildMediaKey("live", trimmed.slice(5), null);
    }
    if (trimmed.startsWith("vod:")) {
        return _buildMediaKey("vod", null, trimmed.slice(4));
    }
    return null;
}
function _normalizePlaybackContext(context) {
    const channelName = _normalizeChannelName(context?.ChannelName ?? context?.channelName ?? context?.login ?? null);
    const vodID = _normalizeVodID(context?.VodID ?? context?.vodID ?? context?.videoID ?? null);
    const explicitMediaType = context?.MediaType === "vod" || context?.mediaType === "vod"
        ? "vod"
        : context?.MediaType === "live" || context?.mediaType === "live"
            ? "live"
            : null;
    const explicitMediaKey = _normalizeMediaKey(context?.MediaKey ?? context?.mediaKey ?? null);
    if (explicitMediaKey?.startsWith("vod:")) {
        const normalizedVodID = explicitMediaKey.slice(4);
        return {
            MediaType: "vod",
            ChannelName: null,
            VodID: normalizedVodID,
            MediaKey: explicitMediaKey,
        };
    }
    if (explicitMediaKey?.startsWith("live:")) {
        const normalizedChannelName = explicitMediaKey.slice(5);
        return {
            MediaType: "live",
            ChannelName: normalizedChannelName,
            VodID: null,
            MediaKey: explicitMediaKey,
        };
    }
    if (explicitMediaType === "vod" && vodID) {
        return {
            MediaType: "vod",
            ChannelName: null,
            VodID: vodID,
            MediaKey: _buildMediaKey("vod", null, vodID),
        };
    }
    if ((explicitMediaType === "live" || !explicitMediaType) && channelName) {
        return {
            MediaType: "live",
            ChannelName: channelName,
            VodID: null,
            MediaKey: _buildMediaKey("live", channelName, null),
        };
    }
    if (vodID) {
        return {
            MediaType: "vod",
            ChannelName: null,
            VodID: vodID,
            MediaKey: _buildMediaKey("vod", null, vodID),
        };
    }
    return {
        MediaType: null,
        ChannelName: null,
        VodID: null,
        MediaKey: null,
    };
}
function _getPlaybackContextFromUrl(rawUrl) {
    let parsedUrl = null;
    let pathname = "";
    try {
        const baseUrl = typeof globalThis?.location?.href === "string"
            ? globalThis.location.href
            : "https://www.twitch.tv/";
        parsedUrl = new URL(String(rawUrl || ""), baseUrl);
        pathname = parsedUrl.pathname;
    }
    catch {
        pathname = typeof rawUrl === "string" ? rawUrl : "";
    }
    const hostname = String(parsedUrl?.hostname || "").toLowerCase();
    if (hostname === "player.twitch.tv") {
        const queryChannel = _normalizeChannelName(parsedUrl?.searchParams?.get("channel") || null);
        const rawVideoQuery = parsedUrl?.searchParams?.get("video") ||
            parsedUrl?.searchParams?.get("vod") ||
            null;
        const queryVodID = _normalizeVodID(typeof rawVideoQuery === "string"
            ? rawVideoQuery.replace(/^v/i, "")
            : rawVideoQuery);
        if (queryChannel) {
            return _normalizePlaybackContext({
                MediaType: "live",
                ChannelName: queryChannel,
            });
        }
        if (queryVodID) {
            return _normalizePlaybackContext({
                MediaType: "vod",
                VodID: queryVodID,
            });
        }
    }
    const segments = String(pathname || "")
        .split("/")
        .filter(Boolean);
    const firstSegment = segments[0] || null;
    const lowerFirstSegment = String(firstSegment || "").toLowerCase();
    if (lowerFirstSegment === "videos" || lowerFirstSegment === "video") {
        return _normalizePlaybackContext({
            MediaType: "vod",
            VodID: (segments[1] || "").replace(/^v/i, "") || null,
        });
    }
    if (lowerFirstSegment === "popout") {
        const popoutChannel = _normalizeChannelName(segments[1] || null);
        if (popoutChannel && String(segments[2] || "").toLowerCase() === "player") {
            return _normalizePlaybackContext({
                MediaType: "live",
                ChannelName: popoutChannel,
            });
        }
        return _normalizePlaybackContext(null);
    }
    if (lowerFirstSegment === "embed" || lowerFirstSegment === "moderator") {
        const nestedChannel = _normalizeChannelName(segments[1] || null);
        if (nestedChannel) {
            return _normalizePlaybackContext({
                MediaType: "live",
                ChannelName: nestedChannel,
            });
        }
        return _normalizePlaybackContext(null);
    }
    if (segments.length !== 1) {
        return _normalizePlaybackContext(null);
    }
    const liveChannel = _normalizeChannelName(firstSegment);
    if (liveChannel && !_RESERVED_ROUTE_SEGMENTS.has(liveChannel)) {
        return _normalizePlaybackContext({
            MediaType: "live",
            ChannelName: liveChannel,
        });
    }
    return _normalizePlaybackContext(null);
}
function _getPlaybackContextFromUsherUrl(rawUrl) {
    let parsedUrl = null;
    try {
        const baseUrl = typeof globalThis?.location?.href === "string"
            ? globalThis.location.href
            : "https://www.twitch.tv/";
        parsedUrl = new URL(String(rawUrl || ""), baseUrl);
    }
    catch {
        return null;
    }
    const pathname = parsedUrl.pathname;
    const liveMatch = pathname.match(/\/(?:api\/v2\/)?channel\/hls\/([^/?#]+)\.m3u8$/i);
    if (liveMatch?.[1]) {
        return _normalizePlaybackContext({
            MediaType: "live",
            ChannelName: liveMatch[1],
        });
    }
    const vodMatch = pathname.match(/\/(?:api\/v2\/)?vod\/(\d+)\.m3u8$/i);
    if (vodMatch?.[1]) {
        return _normalizePlaybackContext({
            MediaType: "vod",
            VodID: vodMatch[1],
        });
    }
    return null;
}
function _$pa(str) {
    const result = Object.create(null);
    _$ar.lastIndex = 0;
    let match = _$ar.exec(str);
    while (match !== null) {
        let value = match[2];
        if (value && value[0] === '"' && value[value.length - 1] === '"') {
            value = value.slice(1, -1);
        }
        result[match[1].toUpperCase()] = value;
        match = _$ar.exec(str);
    }
    return result;
}
function _$gt(m3u8) {
    if (__TTVAB_STATE__.V2API) {
        const match = m3u8.match(/#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE="([^"]+)"/);
        return match?.[1] ?? null;
    }
    const match = m3u8.match(/SERVER-TIME="([0-9.]+)"/);
    return match?.[1] ?? null;
}
function _$rt(m3u8, time) {
    if (!time)
        return m3u8;
    if (__TTVAB_STATE__.V2API) {
        return m3u8.replace(/(#EXT-X-SESSION-DATA:DATA-ID="SERVER-TIME",VALUE=")[^"]+(")/, `$1${time}$2`);
    }
    return m3u8.replace(/(SERVER-TIME=")[0-9.]+(")/, `$1${time}$2`);
}
function _$hem(text) {
    return typeof text === "string" && _$amr.test(text);
}
function _isExplicitKnownAdSegmentUrl(segmentUrl) {
    const url = String(segmentUrl || "");
    if (!url)
        return false;
    return ((__TTVAB_STATE__.AdSignifier &&
        url.includes(__TTVAB_STATE__.AdSignifier)) ||
        url.includes("/adsquared/") ||
        url.includes("/_404/"));
}
function _$kas(segmentUrl, options = {}) {
    const url = String(segmentUrl || "");
    if (!url)
        return false;
    const includeCached = options.includeCached !== false;
    return ((includeCached && __TTVAB_STATE__.AdSegmentCache.has(url)) ||
        _isExplicitKnownAdSegmentUrl(url));
}
function _getTaggedPlaylistUri(line) {
    if (typeof line !== "string" || !line.includes('URI="'))
        return "";
    const match = line.match(/URI="([^"]+)"/);
    return match?.[1] || "";
}
function _isMediaPartLine(line) {
    return typeof line === "string" && line.startsWith("#EXT-X-PART:");
}
function _isPartPreloadHintLine(line) {
    return (typeof line === "string" &&
        line.startsWith("#EXT-X-PRELOAD-HINT:") &&
        (line.includes("TYPE=PART") || line.includes('TYPE="PART"')));
}
function _$plka(lines, options = {}) {
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (line?.startsWith("#EXTINF") &&
            index + 1 < lines.length &&
            _$kas(lines[index + 1], options)) {
            return true;
        }
        if (_isMediaPartLine(line) || _isPartPreloadHintLine(line)) {
            const taggedUri = _getTaggedPlaylistUri(line);
            if (_$kas(taggedUri, options)) {
                return true;
            }
        }
    }
    return false;
}
function _$pka(text, options = {}) {
    if (typeof text !== "string" || !text)
        return false;
    return _$plka(text.split("\n"), options);
}
function _absolutizePlaylistUrl(rawUrl, baseUrl = null) {
    const candidate = typeof rawUrl === "string" ? rawUrl.trim() : "";
    if (!candidate || !baseUrl || candidate.startsWith("#")) {
        return candidate || rawUrl;
    }
    try {
        return new URL(candidate, baseUrl).href;
    }
    catch {
        return rawUrl;
    }
}
function _absolutizeMediaPlaylistUrls(text, baseUrl = null) {
    if (typeof text !== "string" ||
        !text ||
        !baseUrl ||
        (!text.includes("#EXTINF") &&
            !text.includes("#EXT-X-MAP:") &&
            !text.includes("#EXT-X-KEY:") &&
            !text.includes('URI="'))) {
        return text;
    }
    return text
        .split("\n")
        .map((line) => {
        if (typeof line !== "string" || !line)
            return line;
        if (!line.startsWith("#")) {
            return _absolutizePlaylistUrl(line, baseUrl);
        }
        if (line.startsWith("#EXT-X-TWITCH-PREFETCH:")) {
            const prefetchUrl = line
                .substring("#EXT-X-TWITCH-PREFETCH:".length)
                .trim();
            const normalizedPrefetch = _absolutizePlaylistUrl(prefetchUrl, baseUrl);
            return `#EXT-X-TWITCH-PREFETCH:${normalizedPrefetch}`;
        }
        if (!line.includes('URI="')) {
            return line;
        }
        return line.replace(/URI="([^"]+)"/g, (_match, value) => {
            const normalizedValue = _absolutizePlaylistUrl(value, baseUrl);
            return `URI="${normalizedValue}"`;
        });
    })
        .join("\n");
}
function _$sa(text, stripAll, info, skipAutoForceStrip = false) {
    const lines = text.split("\n");
    const len = lines.length;
    const adUrl = "https://twitch.tv";
    let stripped = false;
    let i = 0;
    const strippedSegments = [];
    let strippedMediaEntryCount = 0;
    const hasExplicitAdMetadata = _$hem(text);
    const hasKnownAdSegments = _$plka(lines);
    const forceStripAllSegments = stripAll ||
        __TTVAB_STATE__.AllSegmentsAreAdSegments ||
        (!skipAutoForceStrip && hasExplicitAdMetadata && !hasKnownAdSegments);
    const maxRecoverySegments = forceStripAllSegments ? len : 6;
    let adSegmentCount = 0;
    let _liveSegmentCount = 0;
    for (i = 0; i < len; i++) {
        const line = lines[i];
        if (line?.startsWith("#EXTINF")) {
            const segmentUrl = lines[i + 1];
            const isAdSegment = forceStripAllSegments || _$kas(segmentUrl);
            if (isAdSegment) {
                adSegmentCount++;
            }
            else {
                _liveSegmentCount++;
            }
        }
        if (_isMediaPartLine(line) || _isPartPreloadHintLine(line)) {
            const partUrl = _getTaggedPlaylistUri(line);
            const isAdSegment = forceStripAllSegments || _$kas(partUrl);
            if (isAdSegment) {
                adSegmentCount++;
            }
            else {
                _liveSegmentCount++;
            }
        }
    }
    const shouldStrip = (hasExplicitAdMetadata ||
        hasKnownAdSegments ||
        stripAll ||
        __TTVAB_STATE__.AllSegmentsAreAdSegments) &&
        (adSegmentCount > 0 || forceStripAllSegments);
    for (i = 0; i < len; i++) {
        let line = lines[i];
        if (line?.includes("X-TV-TWITCH-AD")) {
            line = line
                .replace(/X-TV-TWITCH-AD-URL="[^"]*"/, `X-TV-TWITCH-AD-URL="${adUrl}"`)
                .replace(/X-TV-TWITCH-AD-CLICK-TRACKING-URL="[^"]*"/, `X-TV-TWITCH-AD-CLICK-TRACKING-URL="${adUrl}"`);
            lines[i] = line;
        }
        if (shouldStrip && line?.startsWith("#EXT-X-TWITCH-PREFETCH:")) {
            const prefetchUrl = line
                .substring("#EXT-X-TWITCH-PREFETCH:".length)
                .trim();
            if (forceStripAllSegments || _$kas(prefetchUrl)) {
                lines[i] = "";
            }
            continue;
        }
        if (shouldStrip && i < len - 1 && line?.startsWith("#EXTINF")) {
            const isAdSegment = forceStripAllSegments || _$kas(lines[i + 1]);
            if (isAdSegment) {
                const segmentUrl = lines[i + 1];
                strippedSegments.push({ extinf: lines[i], url: segmentUrl });
                if (strippedSegments.length > maxRecoverySegments) {
                    strippedSegments.shift();
                }
                if (!__TTVAB_STATE__.AdSegmentCache.has(segmentUrl))
                    info.NumStrippedAdSegments++;
                strippedMediaEntryCount++;
                if (!forceStripAllSegments ||
                    _isExplicitKnownAdSegmentUrl(segmentUrl)) {
                    __TTVAB_STATE__.AdSegmentCache.set(segmentUrl, Date.now());
                }
                if (skipAutoForceStrip && !forceStripAllSegments) {
                    stripped = true;
                    i++;
                    continue;
                }
                stripped = true;
                lines[i] = "";
                lines[i + 1] = "";
                i++;
            }
        }
        if (shouldStrip &&
            (_isMediaPartLine(line) || _isPartPreloadHintLine(line))) {
            const taggedUri = _getTaggedPlaylistUri(line);
            const isAdSegment = forceStripAllSegments || _$kas(taggedUri);
            if (isAdSegment) {
                if (_isMediaPartLine(line) &&
                    taggedUri &&
                    !__TTVAB_STATE__.AdSegmentCache.has(taggedUri)) {
                    info.NumStrippedAdSegments++;
                }
                strippedMediaEntryCount++;
                if (taggedUri &&
                    (!forceStripAllSegments || _isExplicitKnownAdSegmentUrl(taggedUri))) {
                    __TTVAB_STATE__.AdSegmentCache.set(taggedUri, Date.now());
                }
                stripped = true;
                lines[i] = "";
                continue;
            }
        }
        if (hasExplicitAdMetadata &&
            line?.charCodeAt(0) === 35 &&
            _$amr.test(line)) {
            stripped = true;
            lines[i] = "";
        }
    }
    if (!stripped) {
        info.NumStrippedAdSegments = 0;
    }
    if (hasExplicitAdMetadata) {
        for (i = 0; i < len; i++) {
            const line = lines[i];
            if (line?.startsWith("#EXT-X-TWITCH-PREFETCH:") ||
                line?.startsWith("#EXT-X-PRELOAD-HINT:")) {
                lines[i] = "";
            }
        }
    }
    info.IsStrippingAdSegments = stripped;
    const now = Date.now();
    if (!globalThis._lastAdCachePrune ||
        now - globalThis._lastAdCachePrune > 60000) {
        globalThis._lastAdCachePrune = now;
        const cutoff = now - 120000;
        const staleKeys = [];
        __TTVAB_STATE__.AdSegmentCache.forEach((v, k) => {
            if (v < cutoff)
                staleKeys.push(k);
        });
        for (const k of staleKeys) {
            __TTVAB_STATE__.AdSegmentCache.delete(k);
        }
        if (__TTVAB_STATE__.AdSegmentCache.size > 1000) {
            let evicted = 0;
            for (const url of __TTVAB_STATE__.AdSegmentCache.keys()) {
                if (++evicted > 200)
                    break;
                __TTVAB_STATE__.AdSegmentCache.delete(url);
            }
        }
    }
    const result = [];
    let hasRemainingSegments = false;
    for (let ri = 0; ri < len; ri++) {
        const l = lines[ri];
        if (l === "")
            continue;
        result.push(l);
        if (!hasRemainingSegments &&
            (l?.startsWith("#EXTINF") || l?.startsWith("#EXT-X-PART:"))) {
            hasRemainingSegments = true;
        }
    }
    if (!hasRemainingSegments && strippedMediaEntryCount > 0) {
        const recoveryCandidates = [
            {
                label: info?.LastCleanBackupPlayerType
                    ? `last clean backup (${info.LastCleanBackupPlayerType})`
                    : "last clean backup",
                m3u8: typeof info?.LastCleanBackupM3U8 === "string"
                    ? info.LastCleanBackupM3U8
                    : null,
                at: Number(info?.LastCleanBackupAt) || 0,
                maxAgeMs: 8000,
            },
            {
                label: "last clean native playlist",
                m3u8: typeof info?.LastCleanNativeM3U8 === "string"
                    ? info.LastCleanNativeM3U8
                    : null,
                at: Number(info?.LastCleanNativePlaylistAt) || 0,
                maxAgeMs: 1500,
            },
        ];
        const now = Date.now();
        const recoverySource = recoveryCandidates.find((candidate) => {
            if (typeof candidate.m3u8 !== "string" || !candidate.m3u8)
                return false;
            const hasFullSegments = candidate.m3u8.includes("#EXTINF");
            const hasPartSegments = candidate.m3u8.includes("#EXT-X-PART:");
            if ((!hasFullSegments && !hasPartSegments) ||
                _$hem(candidate.m3u8) ||
                _$pka(candidate.m3u8)) {
                return false;
            }
            const maxRecoveryAgeMs = hasFullSegments
                ? candidate.maxAgeMs
                : Math.min(candidate.maxAgeMs, 1500);
            return candidate.at > 0 && now - candidate.at <= maxRecoveryAgeMs;
        });
        if (recoverySource?.m3u8) {
            _$l(`[Recovery] Empty playlist - reusing ${recoverySource.label}`, "warning");
            return recoverySource.m3u8;
        }
        _$l("Failed to find backup stream — no cached clean playlists available", "warning");
        return text;
    }
    return result.join("\n");
}
function _extractPlaylistHeaders(text) {
    if (typeof text !== "string" || !text)
        return null;
    const lines = text.split("\n");
    const headers = [];
    for (const line of lines) {
        if (line?.startsWith("#EXTINF") ||
            line?.startsWith("#EXT-X-PART:") ||
            line?.startsWith("#EXT-X-PRELOAD-HINT:") ||
            line?.startsWith("#EXT-X-TWITCH-PREFETCH:")) {
            break;
        }
        if (_$hem(line))
            continue;
        if (line?.includes("X-TV-TWITCH-AD") ||
            line?.includes("EXT-X-CUE-OUT") ||
            line?.includes("SCTE35-OUT")) {
            continue;
        }
        headers.push(line);
    }
    return headers.length > 0 ? headers.join("\n") : "#EXTM3U\n";
}
function _$sv(attrs, rawUrl, variantUrl) {
    const frameRate = Number.parseFloat(attrs?.["FRAME-RATE"]);
    const bandwidth = Number.parseInt(attrs?.BANDWIDTH, 10);
    return {
        Resolution: String(attrs.RESOLUTION || "0x0"),
        FrameRate: Number.isFinite(frameRate) ? frameRate : 0,
        Bandwidth: Number.isFinite(bandwidth) ? Math.max(0, bandwidth) : 0,
        Codecs: String(attrs.CODECS || ""),
        Audio: String(attrs.AUDIO || ""),
        Name: String(attrs.VIDEO || ""),
        Subtitles: String(attrs.SUBTITLES || ""),
        Video: String(attrs.VIDEO || ""),
        RawUrl: rawUrl,
        Url: variantUrl,
    };
}
function _replaceOrAppendStreamInfAttribute(line, key, value) {
    if (typeof line !== "string" || typeof key !== "string")
        return line;
    if (typeof value !== "string" || !value)
        return line;
    const normalizedKey = key.trim().toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(normalizedKey))
        return line;
    const escapedValue = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const nextAttribute = `${normalizedKey}="${escapedValue}"`;
    const attrPattern = new RegExp(`(^|,)${normalizedKey}=("[^"]*"|[^,]*)`, "i");
    if (attrPattern.test(line)) {
        return line.replace(attrPattern, `$1${nextAttribute}`);
    }
    return `${line},${nextAttribute}`;
}
function _$su(m3u8, res, baseUrl = null) {
    const lines = m3u8.split("\n");
    const len = lines.length;
    const targetName = typeof res?.Name === "string" && res.Name.trim()
        ? res.Name.trim().toLowerCase()
        : null;
    const [tw, th] = String(res?.Resolution || "0x0")
        .split("x")
        .map(Number);
    const targetPixels = (Number.isFinite(tw) ? tw : 0) * (Number.isFinite(th) ? th : 0);
    const targetFrameRate = Number.parseFloat(String(res?.FrameRate ?? ""));
    let matchUrl = null;
    let matchFps = false;
    let closeUrl = null;
    let closeDiff = Infinity;
    let firstUrl = null;
    const resolveUrl = (candidate) => {
        if (!baseUrl)
            return candidate;
        try {
            return new URL(candidate, baseUrl).href;
        }
        catch {
            return candidate;
        }
    };
    for (let i = 0; i < len - 1; i++) {
        const line = lines[i];
        const nextLine = lines[i + 1]?.trim();
        if (!line?.startsWith("#EXT-X-STREAM-INF") ||
            !nextLine ||
            nextLine.startsWith("#"))
            continue;
        if (!firstUrl) {
            firstUrl = resolveUrl(lines[i + 1]);
        }
        const attrs = _$pa(line);
        const resolution = attrs.RESOLUTION;
        const frameRate = attrs["FRAME-RATE"];
        const variantName = String(attrs.VIDEO || "")
            .trim()
            .toLowerCase();
        const parsedFrameRate = Number.parseFloat(String(frameRate ?? ""));
        const matchesFrameRate = Number.isFinite(targetFrameRate) && Number.isFinite(parsedFrameRate)
            ? Math.abs(parsedFrameRate - targetFrameRate) < 0.01
            : String(frameRate || "") === String(res?.FrameRate || "");
        if (targetName && variantName === targetName) {
            return resolveUrl(lines[i + 1]);
        }
        if (!resolution)
            continue;
        if (resolution === res?.Resolution) {
            if (!matchUrl || (!matchFps && matchesFrameRate)) {
                matchUrl = resolveUrl(lines[i + 1]);
                matchFps = matchesFrameRate;
                if (matchFps)
                    return matchUrl;
            }
        }
        const [w, h] = String(resolution || "0x0")
            .split("x")
            .map(Number);
        const area = (Number.isFinite(w) ? w : 0) * (Number.isFinite(h) ? h : 0);
        const safeTargetPixels = Number.isFinite(targetPixels) ? targetPixels : 0;
        const diff = Math.abs(area - safeTargetPixels);
        if (diff < closeDiff) {
            closeUrl = resolveUrl(lines[i + 1]);
            closeDiff = diff;
        }
    }
    return matchUrl || closeUrl || firstUrl;
}
function _getSortedResolutionList(resolutionList) {
    return [...resolutionList].sort((a, b) => {
        const [aw, ah] = String(a?.Resolution || "0x0")
            .split("x")
            .map(Number);
        const [bw, bh] = String(b?.Resolution || "0x0")
            .split("x")
            .map(Number);
        const aArea = (Number.isFinite(aw) ? aw : 0) * (Number.isFinite(ah) ? ah : 0);
        const bArea = (Number.isFinite(bw) ? bw : 0) * (Number.isFinite(bh) ? bh : 0);
        const aFps = Number.parseFloat(String(a?.FrameRate ?? "")) || 0;
        const bFps = Number.parseFloat(String(b?.FrameRate ?? "")) || 0;
        const aBandwidth = Number.parseInt(String(a?.Bandwidth ?? ""), 10) || 0;
        const bBandwidth = Number.parseInt(String(b?.Bandwidth ?? ""), 10) || 0;
        return bArea - aArea || bFps - aFps || bBandwidth - aBandwidth;
    });
}
function _getResolutionByQualityGroup(resolutionList, qualityGroup) {
    const normalizedQualityGroup = typeof qualityGroup === "string" ? qualityGroup.trim().toLowerCase() : "";
    if (!normalizedQualityGroup || normalizedQualityGroup === "auto") {
        return null;
    }
    const exactName = resolutionList.find((entry) => typeof entry?.Name === "string" &&
        entry.Name.trim().toLowerCase() === normalizedQualityGroup);
    if (exactName)
        return exactName;
    const sorted = _getSortedResolutionList(resolutionList);
    if (normalizedQualityGroup === "chunked") {
        return sorted[0] || null;
    }
    if (normalizedQualityGroup === "audio_only") {
        return sorted[sorted.length - 1] || null;
    }
    const match = normalizedQualityGroup.match(/(\d{3,4})p(?:(\d{2,3}))?/);
    if (!match)
        return null;
    const targetHeight = Number.parseInt(match[1], 10);
    const targetFps = match[2] ? Number.parseInt(match[2], 10) : null;
    return ([...resolutionList].sort((a, b) => {
        const [, ahRaw] = String(a?.Resolution || "0x0")
            .split("x")
            .map(Number);
        const [, bhRaw] = String(b?.Resolution || "0x0")
            .split("x")
            .map(Number);
        const aHeight = Number.isFinite(ahRaw) ? ahRaw : 0;
        const bHeight = Number.isFinite(bhRaw) ? bhRaw : 0;
        const aFps = Number.parseFloat(String(a?.FrameRate ?? "")) || 0;
        const bFps = Number.parseFloat(String(b?.FrameRate ?? "")) || 0;
        const aScore = Math.abs(aHeight - targetHeight) * 1000 +
            (targetFps !== null ? Math.abs(aFps - targetFps) * 10 : 0);
        const bScore = Math.abs(bHeight - targetHeight) * 1000 +
            (targetFps !== null ? Math.abs(bFps - targetFps) * 10 : 0);
        return aScore - bScore;
    })[0] || null);
}
function _$gfr(info, url) {
    const resolutionList = Array.isArray(info?.ResolutionList)
        ? info.ResolutionList.filter(Boolean)
        : [];
    if (resolutionList.length === 0) {
        return null;
    }
    if (url) {
        const direct = resolutionList.find((entry) => entry.Url === url || entry.RawUrl === url);
        if (direct)
            return direct;
    }
    const activeType = info?.ActiveBackupPlayerType || null;
    if (activeType && typeof info?.ActiveBackupResolution === "string") {
        const active = resolutionList.find((entry) => entry.Resolution === info.ActiveBackupResolution);
        if (active)
            return active;
    }
    const preferredQualityGroup = typeof __TTVAB_STATE__ !== "undefined"
        ? __TTVAB_STATE__?.PreferredQualityGroup
        : null;
    const preferredResolution = _getResolutionByQualityGroup(resolutionList, preferredQualityGroup);
    if (preferredResolution)
        return preferredResolution;
    const sorted = _getSortedResolutionList(resolutionList);
    if (info?.ModifiedM3U8) {
        const nonHevc = sorted.find((r) => r.Codecs?.startsWith("avc") || r.Codecs?.startsWith("av0"));
        if (nonHevc)
            return nonHevc;
    }
    return sorted[0];
}

"use strict";

const _$gu = "https://gql.twitch.tv/gql";
function _collectPlaybackAccessTokenSources(payload) {
    const queue = Array.isArray(payload) ? [...payload] : [payload];
    const seen = new Set();
    const tokenSources = [];
    const pushTokenSource = (value) => {
        if (!value || typeof value !== "object" || tokenSources.includes(value))
            return;
        tokenSources.push(value);
    };
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || typeof current !== "object" || seen.has(current))
            continue;
        seen.add(current);
        pushTokenSource(current?.data?.streamPlaybackAccessToken);
        pushTokenSource(current?.data?.videoPlaybackAccessToken);
        pushTokenSource(current?.streamPlaybackAccessToken);
        pushTokenSource(current?.videoPlaybackAccessToken);
        if (current?.__typename === "PlaybackAccessToken" ||
            typeof current?.signature === "string" ||
            typeof current?.sig === "string" ||
            typeof current?.value === "string" ||
            typeof current?.token === "string") {
            pushTokenSource(current);
        }
        const values = Array.isArray(current) ? current : Object.values(current);
        for (const value of values) {
            if (value && typeof value === "object")
                queue.push(value);
        }
    }
    return tokenSources;
}
function _summarizePlaybackAccessTokenPayload(payload) {
    if (Array.isArray(payload)) {
        const firstKeys = payload[0] && typeof payload[0] === "object"
            ? Object.keys(payload[0]).slice(0, 6).join(",")
            : "";
        return `array(len=${payload.length}${firstKeys ? `, first=${firstKeys}` : ""})`;
    }
    if (payload && typeof payload === "object") {
        const keys = Object.keys(payload).slice(0, 8).join(",");
        return `object(${keys || "no-keys"})`;
    }
    return typeof payload;
}
function _getPlaybackAccessTokenErrors(payload) {
    const entries = Array.isArray(payload) ? payload : [payload];
    const messages = [];
    for (const entry of entries) {
        if (!Array.isArray(entry?.errors))
            continue;
        for (const error of entry.errors) {
            const message = error?.message ||
                error?.extensions?.message ||
                error?.extensions?.error ||
                null;
            if (typeof message === "string" && message) {
                messages.push(message);
            }
        }
    }
    return messages;
}
function _extractPlaybackAccessToken(payload) {
    const tokenSources = _collectPlaybackAccessTokenSources(payload);
    for (const token of tokenSources) {
        const signature = token?.signature || token?.sig || null;
        const value = token?.value || token?.token || null;
        if (signature && value) {
            return { signature, value };
        }
    }
    return {
        signature: null,
        value: null,
        hasAnySignature: tokenSources.some((token) => Boolean(token?.signature || token?.sig)),
        hasAnyValue: tokenSources.some((token) => Boolean(token?.value || token?.token)),
        errors: _getPlaybackAccessTokenErrors(payload),
        summary: _summarizePlaybackAccessTokenPayload(payload),
    };
}
function _isWorkerContext() {
    return (typeof WorkerGlobalScope !== "undefined" &&
        typeof self !== "undefined" &&
        self instanceof WorkerGlobalScope);
}
function _createFetchRelayResponse(payload, requestUrl = null) {
    if (!payload || typeof payload !== "object") {
        throw new Error("invalid fetch relay response");
    }
    if (payload.error) {
        throw new Error(payload.error);
    }
    const response = new Response(payload.body ?? "", {
        status: payload.status,
        statusText: payload.statusText,
        headers: payload.headers,
    });
    const finalUrl = payload.url || requestUrl;
    if (finalUrl) {
        Object.defineProperty(response, "url", { value: finalUrl });
    }
    if (typeof payload.ok === "boolean") {
        Object.defineProperty(response, "ok", { value: payload.ok });
    }
    if (typeof payload.redirected === "boolean") {
        Object.defineProperty(response, "redirected", {
            value: payload.redirected,
        });
    }
    return response;
}
async function _fetchViaWorkerBridge(url, options, timeoutMs = 5000) {
    if (!_isWorkerContext() || typeof self?.postMessage !== "function") {
        return null;
    }
    let pendingRequests = __TTVAB_STATE__.PendingFetchRequests;
    if (!pendingRequests) {
        pendingRequests = new Map();
        __TTVAB_STATE__.PendingFetchRequests = pendingRequests;
    }
    const nextSeq = (__TTVAB_STATE__.FetchRequestSeq || 0) + 1;
    __TTVAB_STATE__.FetchRequestSeq = nextSeq;
    const requestId = `fetch-${Date.now()}-${nextSeq}`;
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            pendingRequests.delete(requestId);
            reject(new Error("fetch relay timeout"));
        }, timeoutMs);
        pendingRequests.set(requestId, {
            resolve: (payload) => {
                clearTimeout(timeoutId);
                try {
                    resolve(_createFetchRelayResponse(payload, url));
                }
                catch (error) {
                    reject(error);
                }
            },
            reject: (error) => {
                clearTimeout(timeoutId);
                reject(error instanceof Error
                    ? error
                    : new Error(String(error?.message || error || "fetch relay failed")));
            },
        });
        _postWorkerBridgeMessage(self, {
            key: "FetchRequest",
            value: {
                id: requestId,
                url,
                options,
            },
        });
    });
}
async function _$tk(playbackContext, playerType, realFetch) {
    const fetchFunc = realFetch || fetch;
    const reqPlayerType = playerType;
    let timeoutId = null;
    const normalizedContext = typeof playbackContext === "string"
        ? _normalizePlaybackContext({
            MediaType: "live",
            ChannelName: playbackContext,
        })
        : _normalizePlaybackContext(playbackContext);
    const isVodRequest = normalizedContext.MediaType === "vod" && Boolean(normalizedContext.VodID);
    const logTarget = isVodRequest
        ? `vod ${normalizedContext.VodID}`
        : normalizedContext.ChannelName || "unknown";
    const body = {
        operationName: "PlaybackAccessToken",
        extensions: {
            persistedQuery: {
                version: 1,
                sha256Hash: __TTVAB_STATE__.PlaybackAccessTokenHash ||
                    "ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9",
            },
        },
        variables: {
            isLive: !isVodRequest,
            login: isVodRequest ? "" : normalizedContext.ChannelName || "",
            isVod: isVodRequest,
            vodID: isVodRequest ? normalizedContext.VodID || "" : "",
            playerType: reqPlayerType,
            platform: reqPlayerType === "autoplay" ? "android" : "web",
        },
    };
    const maxRetries = 2;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
            await new Promise((r) => setTimeout(r, attempt * 500));
        }
        try {
            _$l(`[Trace] Requesting token for ${playerType} (${logTarget})${attempt > 0 ? ` retry ${attempt}` : ""}`, "info");
            const acceptLanguage = navigator?.languages?.join(",") || navigator?.language || "en-US";
            const headers = {
                "Client-ID": _$c.CLIENT_ID,
                "X-Device-Id": __TTVAB_STATE__.GQLDeviceID || "oauth",
                "Client-Version": __TTVAB_STATE__.ClientVersion || "k8s-v1",
                "Client-Session-Id": __TTVAB_STATE__.ClientSession || "",
                "Accept-Language": acceptLanguage,
            };
            if (__TTVAB_STATE__.ClientIntegrityHeader) {
                headers["Client-Integrity"] = __TTVAB_STATE__.ClientIntegrityHeader;
            }
            if (__TTVAB_STATE__.AuthorizationHeader) {
                headers.Authorization = __TTVAB_STATE__.AuthorizationHeader;
            }
            const requestOptions = {
                method: "POST",
                headers,
                body: JSON.stringify(body),
            };
            let res = null;
            if (typeof _fetchViaWorkerBridge === "function") {
                try {
                    res = await _fetchViaWorkerBridge(_$gu, requestOptions, 5000);
                }
                catch (bridgeError) {
                    _$l(`Spoof relay error: ${bridgeError.message}`, "warning");
                }
            }
            if (!res) {
                const controller = new AbortController();
                timeoutId = setTimeout(() => controller.abort(), 3000);
                res = await fetchFunc(_$gu, {
                    ...requestOptions,
                    signal: controller.signal,
                });
            }
            _$l(`[Trace] Token response: ${res.status}`, "info");
            return res;
        }
        catch (e) {
            lastError = e;
            if (attempt < maxRetries &&
                (e.name === "AbortError" ||
                    e.name === "TimeoutError" ||
                    e.message?.includes("timeout"))) {
                _$l(`Token fetch retry ${attempt + 1}/${maxRetries}: ${e.message}`, "warning");
                continue;
            }
            break;
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    _$l(`Token fetch failed after ${maxRetries + 1} attempts: ${lastError?.message}`, "error");
    return new Response(null, { status: 0 });
}

async function _notifyAdComplete(textStr, info) {
    try {
        if (__TTVAB_STATE__.DisableAdSpoofing)
            return;
        if (!textStr || typeof textStr !== "string")
            return;
        const matches = [
            ...textStr.matchAll(/#EXT-X-DATERANGE:(ID="stitched-ad-[^\n]+)\n/g),
        ];
        if (matches.length === 0) {
            if (!__TTVAB_STATE__.LoggedAdSpoofNoMatch) {
                __TTVAB_STATE__.LoggedAdSpoofNoMatch = true;
                const dateRangeLine = textStr.match(/#EXT-X-DATERANGE:[^\n]{0,200}/);
                _$l(`notifyAdComplete: no stitched-ad DATERANGE match. Sample DATERANGE: ${dateRangeLine ? dateRangeLine[0] : "none found"}`, "warning");
            }
            return;
        }
        const spoofedSet = info?.SpoofedAdIds || null;

        const podLenMatch = textStr.match(/X-TV-TWITCH-AD-POD-LENGTH="(\d+)"/);
        const podLength = podLenMatch
            ? parseInt(podLenMatch[1], 10)
            : matches.length;

        if (spoofedSet && spoofedSet.size >= podLength)
            return;
        let newSpoofed = 0;
        let firstRollType = "";
        let podCompleteSent = false;
        for (let i = 0; i < matches.length; i++) {

            const idMatch = matches[i][1].match(/^ID="([^"]+)"/);
            const stitchedAdId = idMatch ? idMatch[1] : "";

            if (spoofedSet && stitchedAdId && spoofedSet.has(stitchedAdId)) {
                continue;
            }
            const attr = _$pa(matches[i][1]);
            const radToken = attr["X-TV-TWITCH-AD-RADS-TOKEN"];
            if (!radToken) {
                if (i === 0 && !__TTVAB_STATE__.LoggedAdSpoofNoToken) {
                    __TTVAB_STATE__.LoggedAdSpoofNoToken = true;
                    _$l(`notifyAdComplete: matched DATERANGE but no RADS token. Attributes: ${Object.keys(attr).join(", ")}`, "warning");
                }
                continue;
            }
            const rollType = (attr["X-TV-TWITCH-AD-ROLL-TYPE"] || "").toLowerCase();
            if (!firstRollType)
                firstRollType = rollType;

            const adPosition = parseInt(attr["X-TV-TWITCH-AD-POD-POSITION"] || String(i), 10);

            const adDuration = parseInt(attr["X-TV-TWITCH-AD-DURATION"] || "0", 10) || 0;

            const payload = {
                stitched: true,
                ad_id: stitchedAdId,
                roll_type: rollType,
                creative_id: attr["X-TV-TWITCH-AD-CREATIVE-ID"] || "",
                order_id: attr["X-TV-TWITCH-AD-ORDER-ID"] || "",
                line_item_id: attr["X-TV-TWITCH-AD-LINE-ITEM-ID"] || "",
                player_mute: false,
                player_volume: 1.0,
                visible: true,
                duration: adDuration,
                ad_position: adPosition,
                total_ads: podLength,
            };
            const makePacket = (event, extra) => ({
                operationName: "ClientSideAdEventHandling_RecordAdEvent",
                variables: {
                    input: {
                        eventName: event,
                        eventPayload: JSON.stringify({ ...payload, ...extra }),
                        radToken,
                    },
                },
                extensions: {
                    persistedQuery: {
                        version: 1,
                        sha256Hash: "7e6c69e6eb59f8ccb97ab73686f3d8b7d85a72a0298745ccd8bfc68e4054ca5b",
                    },
                },
            });

            if (spoofedSet && stitchedAdId)
                spoofedSet.add(stitchedAdId);

            const batch = [
                makePacket("video_ad_impression"),
                makePacket("video_ad_quartile_complete", { quartile: 1 }),
                makePacket("video_ad_quartile_complete", { quartile: 2 }),
                makePacket("video_ad_quartile_complete", { quartile: 3 }),
                makePacket("video_ad_quartile_complete", { quartile: 4 }),
            ];

            if (!spoofedSet || spoofedSet.size === podLength) {
                batch.push(makePacket("video_ad_pod_complete"));
                podCompleteSent = true;
            }
            const headers = {
                "Client-ID": _$c.CLIENT_ID,
                "X-Device-Id": __TTVAB_STATE__.GQLDeviceID || "oauth",
            };
            if (__TTVAB_STATE__.AuthorizationHeader) {
                headers.Authorization = __TTVAB_STATE__.AuthorizationHeader;
            }
            if (__TTVAB_STATE__.ClientIntegrityHeader) {
                headers["Client-Integrity"] = __TTVAB_STATE__.ClientIntegrityHeader;
            }
            if (__TTVAB_STATE__.ClientVersion) {
                headers["Client-Version"] = __TTVAB_STATE__.ClientVersion;
            }
            if (__TTVAB_STATE__.ClientSession) {
                headers["Client-Session-Id"] = __TTVAB_STATE__.ClientSession;
            }

            _fetchViaWorkerBridge(_$gu, {
                method: "POST",
                headers,
                body: JSON.stringify(batch),
            }, 5000)
                .then((response) => {
                if (response &&
                    response.status !== 200 &&
                    !__TTVAB_STATE__.LoggedAdSpoofBadStatus) {
                    __TTVAB_STATE__.LoggedAdSpoofBadStatus = true;
                    _$l(`notifyAdComplete: GQL response status ${response.status} — spoof may be rejected/rate-limited`, "warning");
                }
            })
                .catch(() => { });
            newSpoofed++;
        }
        if (newSpoofed > 0) {
            const total = spoofedSet ? spoofedSet.size : newSpoofed;

            const src = info?.ActiveBackupPlayerType || "primary";
            _$l(`[Trace] Spoofed ad completion for ${newSpoofed} new ad(s) (${total}/${podLength} pod) — roll: ${firstRollType}, src: ${src}, pod-complete: ${podCompleteSent ? "yes" : "no"}`, "info");
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        _$l(`notifyAdComplete failed: ${message}`, "warning");
    }
}

"use strict";

function _$rsa(info) {
    const wasUsingModifiedM3U8 = Boolean(info?.IsUsingModifiedM3U8);
    const wasUsingFallbackStream = Boolean(info?.IsUsingFallbackStream);
    const wasUsingBackupStream = Boolean(info?.IsUsingBackupStream);
    const hadStrippedAdSegments = Math.max(0, Number(info?.NumStrippedAdSegments) || 0) > 0;
    info.IsShowingAd = false;
    info.IsUsingModifiedM3U8 = false;
    info.IsUsingFallbackStream = false;
    info.IsUsingBackupStream = false;
    info.RequestedAds?.clear?.();
    info.SpoofedAdIds?.clear?.();
    info.FailedBackupPlayerTypes?.clear?.();
    info.ActiveBackupPlayerType = null;
    info.ActiveBackupResolution = null;
    info.IsMidroll = false;
    info.IsStrippingAdSegments = false;
    info.NumStrippedAdSegments = 0;
    info.PendingAdEndAt = 0;
    info.CleanPlaylistCount = 0;
    info.AdEndMarkerBounceLogged = false;
    info.ConsecutiveFailedNativeProbes = 0;
    info.VisibleAdStartedAt = 0;
    info.IsHoldingBackupAfterAd = false;
    info.SilentBackupHoldStartedAt = 0;
    info.LastSilentBackupHoldLogAt = 0;
    info.LastNativeRecoveryHoldLogAt = 0;
    info.HevcReloadPendingAfterHold = false;
    info.LastAdEndBounceAt = 0;
    info.LoggedBackupAdsByType = null;
    info._LoggedWhitelistByType = null;
    info._BackupSearchStartedAt = 0;
    info._LastBackupSearchCompletedAt = 0;
    info._LoggedOfflineTransition = false;
    info._LqHoldStartAt = 0;
    info._SpliceStreamId = null;
    info._SpliceBoundarySeq = null;
    if (info._AdRequestController) {
        info._AdRequestController.abort();
        info._AdRequestController = null;
    }
    _resetNativeRecoveryReadyState(info);
    return {
        wasUsingModifiedM3U8,
        wasUsingFallbackStream,
        wasUsingBackupStream,
        hadStrippedAdSegments,
    };
}
function _getResolvedAdEndMinCleanPlaylists() {
    return Math.max(1, Number(__TTVAB_STATE__?.AdEndMinCleanPlaylists) || 1);
}
function _getResolvedAdEndGraceMs() {
    return Math.max(0, Number(__TTVAB_STATE__?.AdEndGraceMs) || 0);
}
function _getResolvedAdEndMaxWaitMs() {
    return Math.max(0, Number(__TTVAB_STATE__?.AdEndMaxWaitMs) || 0);
}
function _getResolvedAdEndBackupHoldMaxMs() {
    return Math.max(0, Number(__TTVAB_STATE__?.AdEndBackupHoldMaxMs) ||
        Number(_$c?.AD_END_BACKUP_HOLD_MAX_MS) ||
        0);
}
function _getResolvedSilentBackupHoldMaxMs() {
    return Math.max(0, Number(__TTVAB_STATE__?.SilentBackupHoldMaxMs) || 120000);
}
function _getPostAdReentryContinuationMs() {
    return 8000;
}
function _rememberLastAdEnd(info, endedAt = Date.now()) {
    const safeEndedAt = Math.max(0, Number(endedAt) || 0);
    const endedContext = _normalizePlaybackContext({
        MediaType: info?.MediaType || __TTVAB_STATE__?.PageMediaType || null,
        ChannelName: info?.ChannelName || null,
        VodID: info?.VodID || null,
        MediaKey: info?.MediaKey || null,
    });
    if (info) {
        info.LastAdEndReloadAt = safeEndedAt;
    }
    __TTVAB_STATE__.LastAdEndedAt = safeEndedAt;
    __TTVAB_STATE__.LastAdEndedChannel = endedContext.ChannelName;
    __TTVAB_STATE__.LastAdEndedMediaKey = endedContext.MediaKey;
}
function _doesPlaybackContextMatchInfo(info, mediaKey = null, channel = null) {
    const infoMediaKey = _normalizeMediaKey(info?.MediaKey);
    const targetMediaKey = _normalizeMediaKey(mediaKey);
    if (infoMediaKey && targetMediaKey) {
        return infoMediaKey === targetMediaKey;
    }
    const infoChannel = _normalizeChannelName(info?.ChannelName);
    const targetChannel = _normalizeChannelName(channel);
    return Boolean(infoChannel && targetChannel && infoChannel === targetChannel);
}
function _isRecentPostAdReentry(info, now = Date.now()) {
    const continuationMs = _getPostAdReentryContinuationMs();
    if (continuationMs <= 0)
        return false;
    const localEndedAt = Math.max(0, Number(info?.LastAdEndReloadAt) || 0);
    if (localEndedAt > 0 && now - localEndedAt <= continuationMs) {
        return true;
    }
    const sharedEndedAt = Math.max(0, Number(__TTVAB_STATE__?.LastAdEndedAt) || 0);
    if (sharedEndedAt <= 0 || now - sharedEndedAt > continuationMs) {
        return false;
    }
    return _doesPlaybackContextMatchInfo(info, __TTVAB_STATE__?.LastAdEndedMediaKey, __TTVAB_STATE__?.LastAdEndedChannel);
}
function _getBackupPlayerRetryCooldownMs(reason = "ad-marked") {
    switch (reason) {
        case "error":
        case "stream-error":
        case "token-error":
            return 1500;
        case "not-playable":
        case "no-stream-url":
            return 2000;
        default:
            return 15000;
    }
}
function _markBackupPlayerRetryCooldown(info, playerType, reason = "ad-marked") {
    if (!info?.FailedBackupPlayerTypes?.set || typeof playerType !== "string") {
        return 0;
    }
    const retryAt = Date.now() + _getBackupPlayerRetryCooldownMs(reason);
    info.FailedBackupPlayerTypes.set(playerType, retryAt);
    return retryAt;
}
function _clearBackupPlayerRetryCooldown(info, playerType) {
    info?.FailedBackupPlayerTypes?.delete?.(playerType);
}
function _isBackupPlayerRetryCoolingDown(info, playerType) {
    if (!info?.FailedBackupPlayerTypes?.get || typeof playerType !== "string") {
        return false;
    }
    const retryAt = Number(info.FailedBackupPlayerTypes.get(playerType)) || 0;
    if (retryAt <= 0) {
        info.FailedBackupPlayerTypes.delete?.(playerType);
        return false;
    }
    if (retryAt <= Date.now()) {
        info.FailedBackupPlayerTypes.delete?.(playerType);
        return false;
    }
    return true;
}
function _forceClearBackupCooldownsIfStale(info, now = Date.now()) {
    const _BACKUP_MAX_STALENESS_MS = 8000;
    if (!info?.FailedBackupPlayerTypes?.clear)
        return false;
    const backupAgeMs = now - (Number(info.LastCleanBackupAt) || 0);
    if (backupAgeMs < _BACKUP_MAX_STALENESS_MS)
        return false;
    if (info.FailedBackupPlayerTypes.size === 0)
        return false;
    const allCoolingDown = [...info.FailedBackupPlayerTypes.values()].every((retryAt) => Number(retryAt) > now);
    if (!allCoolingDown)
        return false;
    info.FailedBackupPlayerTypes.clear();
    info.LoggedBackupAdsByType?.clear?.();
    _$l(`[Trace] Backup is ${(backupAgeMs / 1000).toFixed(1)}s stale with all types cooling down — forcing cooldown reset`, "warning");
    return true;
}
function _getPinnedBackupPlayerTypeForInfo(info) {
    const pinnedType = typeof __TTVAB_STATE__?.PinnedBackupPlayerType === "string" &&
        __TTVAB_STATE__.PinnedBackupPlayerType
        ? __TTVAB_STATE__.PinnedBackupPlayerType
        : null;
    if (!pinnedType)
        return null;
    const pinnedContext = _normalizePlaybackContext({
        MediaType: __TTVAB_STATE__?.PageMediaType || info?.MediaType || null,
        ChannelName: __TTVAB_STATE__?.PinnedBackupPlayerChannel ||
            __TTVAB_STATE__?.CurrentAdChannel ||
            info?.ChannelName ||
            null,
        VodID: __TTVAB_STATE__?.PageVodID || info?.VodID || null,
        MediaKey: __TTVAB_STATE__?.PinnedBackupPlayerMediaKey ||
            __TTVAB_STATE__?.CurrentAdMediaKey ||
            info?.MediaKey ||
            null,
    });
    const infoContext = _normalizePlaybackContext({
        MediaType: info?.MediaType || null,
        ChannelName: info?.ChannelName || null,
        VodID: info?.VodID || null,
        MediaKey: info?.MediaKey || null,
    });
    if (pinnedContext.MediaKey && infoContext.MediaKey) {
        return pinnedContext.MediaKey === infoContext.MediaKey ? pinnedType : null;
    }
    if (pinnedContext.ChannelName && infoContext.ChannelName) {
        return pinnedContext.ChannelName === infoContext.ChannelName
            ? pinnedType
            : null;
    }
    return null;
}
function _getOrderedBackupPlayerTypes(info, startIdx = 0) {
    const configuredPlayerTypes = [
        ...(__TTVAB_STATE__?.BackupPlayerTypes || []),
    ].filter((pt) => pt !== "autoplay" || !__TTVAB_STATE__.DisableAutoplayBackup);
    const orderedPlayerTypes = [];
    const pushUnique = (playerType) => {
        if (typeof playerType !== "string" ||
            !playerType ||
            orderedPlayerTypes.includes(playerType) ||
            !configuredPlayerTypes.includes(playerType)) {
            return;
        }
        orderedPlayerTypes.push(playerType);
    };
    const preferredPlayerType = _getPinnedBackupPlayerTypeForInfo(info);
    const activePlayerType = typeof info?.ActiveBackupPlayerType === "string" &&
        info.ActiveBackupPlayerType
        ? info.ActiveBackupPlayerType
        : null;
    const safeStartIdx = Math.max(0, Math.min(configuredPlayerTypes.length, Number(startIdx) || 0));
    pushUnique(preferredPlayerType);
    pushUnique(activePlayerType);
    for (const playerType of configuredPlayerTypes.slice(safeStartIdx)) {
        pushUnique(playerType);
    }
    return orderedPlayerTypes;
}
function _resolvePlaybackResolutionForUrl(info, url = "") {
    let resolution = null;
    for (const alias of _getPlaylistUrlAliases(url)) {
        resolution = info?.Urls?.[alias] || null;
        if (resolution)
            break;
    }
    if (!resolution) {
        resolution = _$gfr(info, url);
    }
    return resolution;
}
async function _isAdEndStable(info, realFetch, resolution = null) {
    if (!info?.IsShowingAd)
        return "ended";
    const now = Date.now();
    if (!info.PendingAdEndAt) {
        info.PendingAdEndAt = now;
        info.CleanPlaylistCount = 0;
        info.AdEndMarkerBounceLogged = false;
        _$l("[Trace] Candidate ad end detected", "info");
    }
    info.CleanPlaylistCount =
        Math.max(0, Math.trunc(Number(info.CleanPlaylistCount) || 0)) + 1;
    const elapsed = now - info.PendingAdEndAt;
    const graceMs = _getResolvedAdEndGraceMs();
    const minCleanPlaylists = _getResolvedAdEndMinCleanPlaylists();
    const maxWaitMs = _getResolvedAdEndMaxWaitMs();
    const fastPathReady = info.CleanPlaylistCount >= minCleanPlaylists && elapsed >= graceMs;
    const slowPathReady = maxWaitMs > 0 && elapsed >= maxWaitMs;
    if (!fastPathReady && !slowPathReady) {
        return "wait";
    }
    const hasNativeRecoveryReady = await _canReloadNativePlayerAfterAd(info, realFetch, resolution);
    if (hasNativeRecoveryReady) {
        return "ended";
    }
    const maxFailedProbes = Math.max(1, Number(__TTVAB_STATE__?.AdEndMaxFailedNativeProbes) || 6);
    const failedProbeCapHit = Math.max(0, Number(info.ConsecutiveFailedNativeProbes) || 0) >=
        maxFailedProbes;
    if (slowPathReady) {
        const canHoldCleanPlaylist = Boolean(info?.LastCleanBackupM3U8);
        if (canHoldCleanPlaylist) {
            const backupHoldMaxMs = _getResolvedAdEndBackupHoldMaxMs();
            const visibleAdStartedAt = Math.max(0, Number(info.VisibleAdStartedAt) || Number(info.PendingAdEndAt) || 0);
            const visibleAdElapsed = visibleAdStartedAt > 0 ? now - visibleAdStartedAt : elapsed;
            if ((backupHoldMaxMs > 0 && visibleAdElapsed >= backupHoldMaxMs) ||
                failedProbeCapHit) {
                info.IsHoldingBackupAfterAd = true;
                info.SilentBackupHoldStartedAt = now;
                info.LastSilentBackupHoldLogAt = now;
                _$l(failedProbeCapHit && visibleAdElapsed < backupHoldMaxMs
                    ? "[Trace] Native recovery still ad-marked after failed-probe cap; ending visible ad cycle and keeping clean backup stream"
                    : "[Trace] Native recovery still ad-marked after extended backup hold; ending visible ad cycle and keeping clean backup stream", "warning");
                return "ended-with-backup-hold";
            }
            const lastHoldLogAt = Math.max(0, Number(info.LastNativeRecoveryHoldLogAt) || 0);
            if (now - lastHoldLogAt >= 10000) {
                info.LastNativeRecoveryHoldLogAt = now;
                _$l("[Trace] Native recovery still ad-marked after max wait; holding clean backup stream", "warning");
            }
            return "wait";
        }
        _$l(failedProbeCapHit
            ? "[Trace] Native recovery still ad-marked after failed-probe cap; forcing ad end to prevent offline state"
            : "[Trace] Native recovery still ad-marked after max wait; forcing ad end to prevent offline state", "warning");
        return "ended";
    }
    return "wait";
}
function _resetNativeRecoveryReadyState(info, preserveProbeAt = false) {
    if (!info)
        return;
    if (!preserveProbeAt) {
        info.LastNativeRecoveryProbeAt = 0;
    }
    info.LastNativeRecoveryReadyPlayerType = null;
    info.NativeRecoveryCleanCount = 0;
}
function _markNativeRecoveryProbeFailed(info) {
    info.ConsecutiveFailedNativeProbes =
        Math.max(0, Number(info?.ConsecutiveFailedNativeProbes) || 0) + 1;
}
function _markNativeRecoveryReady(info, playerType) {
    const nextPlayerType = typeof playerType === "string" && playerType ? playerType : null;
    if (!info || !nextPlayerType) {
        _resetNativeRecoveryReadyState(info, true);
        return 0;
    }
    if (info.LastNativeRecoveryReadyPlayerType !== nextPlayerType) {
        info.LastNativeRecoveryReadyPlayerType = nextPlayerType;
        info.NativeRecoveryCleanCount = 1;
        return 1;
    }
    const nextCount = Math.max(0, Math.trunc(Number(info.NativeRecoveryCleanCount) || 0)) + 1;
    info.NativeRecoveryCleanCount = nextCount;
    return nextCount;
}
function _shouldReloadNativePlayerAfterAdReset({ wasUsingModifiedM3U8, wasUsingFallbackStream, wasUsingBackupStream, hadStrippedAdSegments, } = {}) {
    return Boolean(wasUsingModifiedM3U8 ||
        wasUsingFallbackStream ||
        wasUsingBackupStream ||
        hadStrippedAdSegments);
}
function _getPlaylistUrlAliases(url, baseUrl = null) {
    const aliases = [];
    const pushAlias = (value) => {
        if (typeof value !== "string")
            return;
        const trimmed = value.trimEnd();
        if (!trimmed || aliases.indexOf(trimmed) !== -1)
            return;
        aliases.push(trimmed);
    };
    pushAlias(url);
    try {
        const fallbackBase = typeof globalThis?.location?.href === "string"
            ? globalThis.location.href
            : null;
        const parsed = new URL(String(url || ""), typeof baseUrl === "string" && baseUrl
            ? baseUrl
            : fallbackBase || undefined);
        parsed.hash = "";
        pushAlias(parsed.toString());
        pushAlias(`${parsed.origin}${parsed.pathname}`);
        pushAlias(parsed.pathname);
    }
    catch { }
    return aliases;
}
function _$gsi(url) {
    if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__)
        return null;
    for (const alias of _getPlaylistUrlAliases(url)) {
        const byUrl = __TTVAB_STATE__.StreamInfosByUrl[alias];
        if (byUrl)
            return byUrl;
    }
    const currentPageMediaKey = __TTVAB_STATE__?.PageMediaKey || null;
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname;
        for (const key in __TTVAB_STATE__.StreamInfosByUrl) {
            try {
                const info = __TTVAB_STATE__.StreamInfosByUrl[key];
                if (currentPageMediaKey && info?.MediaKey !== currentPageMediaKey) {
                    continue;
                }
                const storedUrl = new URL(key);
                if (storedUrl.hostname === hostname) {
                    return info;
                }
            }
            catch { }
        }
    }
    catch { }
    const keys = Object.keys(__TTVAB_STATE__.StreamInfos);
    if (keys.length === 1) {
        const info = __TTVAB_STATE__.StreamInfos[keys[0]];
        if (!currentPageMediaKey || info?.MediaKey === currentPageMediaKey) {
            return info;
        }
    }
    if (keys.length > 1) {
        let best = null;
        let bestTime = 0;
        for (const key of keys) {
            const info = __TTVAB_STATE__.StreamInfos[key];
            if (currentPageMediaKey && info?.MediaKey !== currentPageMediaKey) {
                continue;
            }
            if (info?.LastActivityAt > bestTime) {
                bestTime = info.LastActivityAt;
                best = info;
            }
        }
        return best;
    }
    return null;
}
function _getSyntheticPlaybackContextForPlaylist(url) {
    const urlContext = _getPlaybackContextFromUsherUrl(url);
    if (urlContext?.MediaKey) {
        return urlContext;
    }
    return null;
}
function _$hpa(text) {
    return _$hem(text);
}
function _playlistHasMediaSegments(text) {
    return (typeof text === "string" &&
        (text.includes("#EXTINF") || text.includes("#EXT-X-PART:")));
}
function _$im(text, incrementBy) {
    if (!text || typeof text !== "string" || !incrementBy)
        return text;
    return text.replace(/#EXT-X-MEDIA-SEQUENCE:(\d+)/, (match, seqStr) => {
        const seq = parseInt(seqStr, 10);
        if (!Number.isNaN(seq)) {
            return `#EXT-X-MEDIA-SEQUENCE:${seq + incrementBy}`;
        }
        return match;
    });
}
function _parsePlaylistFirstMediaSequence(text) {
    if (typeof text !== "string")
        return null;
    const m = text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
    if (!m)
        return null;
    const seq = parseInt(m[1], 10);
    return Number.isNaN(seq) ? null : seq;
}
function _parsePlaylistDiscontinuitySequence(text) {
    if (typeof text !== "string")
        return 0;
    const m = text.match(/#EXT-X-DISCONTINUITY-SEQUENCE:(\d+)/);
    if (!m)
        return 0;
    const seq = parseInt(m[1], 10);
    return Number.isNaN(seq) ? 0 : seq;
}
function _setPlaylistDiscontinuitySequence(lines, value) {
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("#EXT-X-DISCONTINUITY-SEQUENCE:")) {
            lines[i] = `#EXT-X-DISCONTINUITY-SEQUENCE:${value}`;
            return;
        }
    }
    let at = 0;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
            at = i + 1;
            break;
        }
        if (lines[i].startsWith("#EXTM3U"))
            at = i + 1;
    }
    lines.splice(at, 0, `#EXT-X-DISCONTINUITY-SEQUENCE:${value}`);
}
function _insertBoundaryDiscontinuity(text, boundarySeq, firstSeq) {
    if (typeof text !== "string" || boundarySeq == null || firstSeq == null) {
        return text;
    }
    const pos = boundarySeq - firstSeq;
    const lines = text.split("\n");
    if (pos < 0) {
        _setPlaylistDiscontinuitySequence(lines, _parsePlaylistDiscontinuitySequence(text) + 1);
        return lines.join("\n");
    }
    let seen = 0;
    let insertAt = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("#EXTINF")) {
            if (seen === pos) {
                insertAt = i;
                break;
            }
            seen++;
        }
    }
    if (insertAt < 0)
        return text;
    if (insertAt > 0 && lines[insertAt - 1].startsWith("#EXT-X-DISCONTINUITY")) {
        return text;
    }
    lines.splice(insertAt, 0, "#EXT-X-DISCONTINUITY");
    return lines.join("\n");
}
function _applyBackupSpliceBridge(info, text) {
    if (!info || typeof text !== "string" || !text)
        return text;
    if (!info.IsUsingBackupStream) {
        info._SpliceStreamId = null;
        info._SpliceBoundarySeq = null;
        return text;
    }
    if (!_playlistHasMediaSegments(text))
        return text;
    const identity = `${info.ActiveBackupPlayerType || "?"}|${info.ActiveBackupResolution || "?"}`;
    const firstSeq = _parsePlaylistFirstMediaSequence(text);
    if (firstSeq == null)
        return text;
    if (info._SpliceStreamId !== identity) {
        info._SpliceStreamId = identity;
        info._SpliceBoundarySeq = firstSeq;
    }
    return _insertBoundaryDiscontinuity(text, info._SpliceBoundarySeq, firstSeq);
}
function _getNativeRecoveryProbePlayerType() {
    const forcedPlayerType = __TTVAB_STATE__?.RewriteNativePlaybackAccessToken === true &&
        typeof __TTVAB_STATE__?.ForceAccessTokenPlayerType === "string" &&
        __TTVAB_STATE__.ForceAccessTokenPlayerType.trim()
        ? __TTVAB_STATE__.ForceAccessTokenPlayerType.trim()
        : null;
    return (forcedPlayerType ||
        __TTVAB_STATE__?.LastNativePlaybackAccessTokenPlayerType ||
        "site");
}
async function _fetchWithTimeout(realFetch, url, options = {}, timeoutMs = 3500) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await realFetch(url, { ...options, signal: controller.signal });
    }
    finally {
        clearTimeout(id);
    }
}
async function _canReloadNativePlayerAfterAd(info, realFetch, resolution = null) {
    if (!info?.IsUsingBackupStream && !info?.IsUsingFallbackStream) {
        _resetNativeRecoveryReadyState(info);
        info.ConsecutiveFailedNativeProbes = 0;
        return true;
    }
    const requiredCleanProbes = Math.max(1, Number(__TTVAB_STATE__?.AdEndMinNativeRecoveryProbes) || 1);
    const probeCooldownMs = Math.max(250, Number(__TTVAB_STATE__?.AdEndNativeRecoveryProbeCooldownMs) || 750);
    const now = Date.now();
    if (info.LastNativeRecoveryProbeAt &&
        now - info.LastNativeRecoveryProbeAt < probeCooldownMs) {
        return false;
    }
    info.LastNativeRecoveryProbeAt = now;
    const nativePlayerType = _getNativeRecoveryProbePlayerType();
    try {
        const tokenRes = await _$tk(info, nativePlayerType, realFetch);
        if (tokenRes.status !== 200) {
            _resetNativeRecoveryReadyState(info, true);
            _markNativeRecoveryProbeFailed(info);
            _$l(`[Trace] Native recovery probe failed for ${nativePlayerType}: ${tokenRes.status}`, "warning");
            return false;
        }
        const token = await tokenRes.json();
        const extractedToken = _extractPlaybackAccessToken(token);
        const sig = extractedToken?.signature;
        const tokenValue = extractedToken?.value;
        if (!sig || !tokenValue) {
            _resetNativeRecoveryReadyState(info, true);
            _markNativeRecoveryProbeFailed(info);
            _$l(`[Trace] Native recovery probe missing token parts for ${nativePlayerType}`, "warning");
            return false;
        }
        const usherUrl = _buildUsherPlaybackUrl(info, sig, tokenValue);
        if (!usherUrl) {
            _resetNativeRecoveryReadyState(info, true);
            _markNativeRecoveryProbeFailed(info);
            return false;
        }
        const encRes = await realFetch(usherUrl.href);
        if (encRes.status !== 200) {
            _resetNativeRecoveryReadyState(info, true);
            _markNativeRecoveryProbeFailed(info);
            _$l(`[Trace] Native recovery usher failed for ${nativePlayerType}: ${encRes.status}`, "warning");
            return false;
        }
        const encM3u8 = await encRes.text();
        const targetResolution = resolution ||
            _$gfr(info, "") ||
            info?.ResolutionList?.[0] ||
            null;
        const streamUrl = _$su(encM3u8, targetResolution, usherUrl.href);
        if (!streamUrl) {
            _resetNativeRecoveryReadyState(info, true);
            _markNativeRecoveryProbeFailed(info);
            return false;
        }
        const streamRes = await realFetch(streamUrl);
        if (streamRes.status !== 200) {
            _resetNativeRecoveryReadyState(info, true);
            _markNativeRecoveryProbeFailed(info);
            _$l(`[Trace] Native recovery stream failed for ${nativePlayerType}: ${streamRes.status}`, "warning");
            return false;
        }
        const nativeM3u8 = await streamRes.text();
        const nativeHasAds = _$hpa(nativeM3u8) ||
            _$hem(nativeM3u8) ||
            _$pka(nativeM3u8, {
                includeCached: false,
            });
        if (nativeHasAds) {
            _resetNativeRecoveryReadyState(info, true);
            _markNativeRecoveryProbeFailed(info);
            _$l(`[Trace] Native recovery still ad-marked (${nativePlayerType})`, "warning");
            return false;
        }
        const readyCount = _markNativeRecoveryReady(info, nativePlayerType);
        if (readyCount < requiredCleanProbes) {
            _markNativeRecoveryProbeFailed(info);
            _$l(`[Trace] Native recovery ready (${nativePlayerType}) ${readyCount}/${requiredCleanProbes}`, "info");
            return false;
        }
        info.ConsecutiveFailedNativeProbes = 0;
        _$l(`[Trace] Native recovery ready (${nativePlayerType})`, "success");
        return true;
    }
    catch (err) {
        _resetNativeRecoveryReadyState(info, true);
        _markNativeRecoveryProbeFailed(info);
        _$l(`[Trace] Native recovery probe error for ${nativePlayerType}: ${err.message}`, "warning");
        return false;
    }
}
function _createStreamInfo(context) {
    const normalizedContext = _normalizePlaybackContext(context);
    return {
        MediaType: normalizedContext.MediaType,
        MediaKey: normalizedContext.MediaKey,
        ChannelName: normalizedContext.ChannelName,
        VodID: normalizedContext.VodID,
        IsShowingAd: false,
        LastPlayerReload: 0,
        EncodingsM3U8: null,
        ModifiedM3U8: null,
        IsUsingModifiedM3U8: false,
        IsUsingFallbackStream: false,
        IsUsingBackupStream: false,
        UsherBaseUrl: "",
        UsherParams: "",
        RequestedAds: new Set(),
        SpoofedAdIds: new Set(),
        FailedBackupPlayerTypes: new Map(),
        Urls: Object.create(null),
        ResolutionList: [],
        BackupEncodingsM3U8Cache: Object.create(null),
        ActiveBackupPlayerType: null,
        ActiveBackupResolution: null,
        LastCleanNativeM3U8: null,
        LastCleanNativePlaylistAt: 0,
        LastCleanBackupM3U8: null,
        LastCleanBackupPlayerType: null,
        LastCleanBackupAt: 0,
        IsMidroll: false,
        IsStrippingAdSegments: false,
        NumStrippedAdSegments: 0,
        PendingAdEndAt: 0,
        CleanPlaylistCount: 0,
        AdEndMarkerBounceLogged: false,
        VisibleAdStartedAt: 0,
        IsHoldingBackupAfterAd: false,
        SilentBackupHoldStartedAt: 0,
        LastSilentBackupHoldLogAt: 0,
        LastNativeRecoveryProbeAt: 0,
        BackupVariantUrls: new Set(),
        LastNativeRecoveryReadyPlayerType: null,
        NativeRecoveryCleanCount: 0,
        ConsecutiveFailedNativeProbes: 0,
        _LoggedWhitelistByType: null,
        _BackupSearchCount: 0,
        _BackupSearchErrorCount: 0,
        _BackupSearchFailCount: 0,
        _FallbackEntryCount: 0,
        LastAdEndReloadAt: 0,
        LastNativeRecoveryHoldLogAt: 0,
        HevcReloadPendingAfterHold: false,
        LastAdEndBounceAt: 0,
        LastActivityAt: Date.now(),
        LoggedBackupAdsByType: null,
        _SpliceStreamId: null,
        _SpliceBoundarySeq: null,
    };
}
function _createSyntheticStreamInfo(playbackContext, url = "") {
    const normalizedContext = _normalizePlaybackContext(playbackContext);
    if (!normalizedContext.MediaKey)
        return null;
    const info = _createStreamInfo(normalizedContext);
    __TTVAB_STATE__.StreamInfos[normalizedContext.MediaKey] = info;
    if (url) {
        for (const alias of _getPlaylistUrlAliases(url)) {
            __TTVAB_STATE__.StreamInfosByUrl[alias] = info;
        }
    }
    const logTarget = normalizedContext.MediaType === "vod"
        ? `vod ${normalizedContext.VodID}`
        : normalizedContext.ChannelName;
    _$l(`Synthetic stream info created for ${logTarget}`, "warning");
    return info;
}
function _buildUsherPlaybackUrl(info, sig, token) {
    let usherUrl = null;
    if (typeof info?.UsherBaseUrl === "string" && info.UsherBaseUrl) {
        try {
            usherUrl = new URL(info.UsherBaseUrl);
        }
        catch { }
    }
    if (!usherUrl) {
        const routePath = info?.MediaType === "vod" && info?.VodID
            ? `vod/${info.VodID}.m3u8`
            : info?.ChannelName
                ? `channel/hls/${info.ChannelName}.m3u8`
                : null;
        if (!routePath)
            return null;
        usherUrl = new URL(`https://usher.ttvnw.net/api/${__TTVAB_STATE__.V2API ? "v2/" : ""}${routePath}${info?.UsherParams || ""}`);
    }
    usherUrl.searchParams.set("sig", sig);
    usherUrl.searchParams.set("token", token);
    return usherUrl;
}
async function _$pm(url, text, realFetch) {
    const result = await _processM3U8Core(url, text, realFetch);
    const info = _$gsi(url);
    return info ? _applyBackupSpliceBridge(info, result) : result;
}
async function _processM3U8Core(url, text, realFetch) {
    text = _absolutizeMediaPlaylistUrls(text, url);
    let info = _$gsi(url);
    if (!info) {
        if (!_$hpa(text) &&
            !_$pka(text, { includeCached: false }) &&
            __TTVAB_STATE__.SimulatedAdsDepth === 0) {
            return text;
        }
        info = _createSyntheticStreamInfo(_getSyntheticPlaybackContextForPlaylist(url), url);
        if (!info)
            return text;
    }
    info.LastActivityAt = Date.now();
    const currentAliases = _getPlaylistUrlAliases(url);
    const isBackupUrl = Boolean(currentAliases.some((alias) => info.BackupVariantUrls?.has(alias)) ||
        (info.ActiveBackupPlayerType &&
            info.BackupEncodingsM3U8Cache[info.ActiveBackupPlayerType]?.baseUrl ===
                url));
    if (isBackupUrl) {
        return text;
    }
    if (!__TTVAB_STATE__.IsAdStrippingEnabled) {
        if (info.IsShowingAd ||
            info.IsUsingModifiedM3U8 ||
            info.IsUsingFallbackStream ||
            info.IsUsingBackupStream) {
            const { wasUsingModifiedM3U8, wasUsingFallbackStream, wasUsingBackupStream, hadStrippedAdSegments, } = _$rsa(info);
            __TTVAB_STATE__.CurrentAdChannel = null;
            __TTVAB_STATE__.CurrentAdMediaKey = null;
            __TTVAB_STATE__.PinnedBackupPlayerType = null;
            __TTVAB_STATE__.PinnedBackupPlayerChannel = null;
            __TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
            __TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
            _$l("Ad blocking disabled - restoring native stream state", "info");
            if ((wasUsingModifiedM3U8 ||
                wasUsingFallbackStream ||
                wasUsingBackupStream ||
                hadStrippedAdSegments) &&
                typeof self !== "undefined" &&
                self.postMessage) {
                const shouldReloadPlayer = _shouldReloadNativePlayerAfterAdReset({
                    wasUsingModifiedM3U8,
                    wasUsingFallbackStream,
                    wasUsingBackupStream,
                    hadStrippedAdSegments,
                });
                _postWorkerBridgeMessage(self, _createPageScopedWorkerEvent({
                    key: "AdEnded",
                    channel: info.ChannelName,
                    mediaKey: info.MediaKey,
                    willReload: shouldReloadPlayer,
                }));
                if (shouldReloadPlayer) {
                    info.LastPlayerReload = Date.now();
                    _postWorkerBridgeMessage(self, _createPageScopedWorkerEvent({
                        key: "ReloadPlayer",
                        channel: info.ChannelName,
                        mediaKey: info.MediaKey,
                        refreshAccessToken: false,
                        newMediaPlayerInstance: false,
                    }));
                }
                else {
                    _postWorkerBridgeMessage(self, _createPageScopedWorkerEvent({
                        key: "PauseResumePlayer",
                        channel: info.ChannelName,
                        mediaKey: info.MediaKey,
                    }));
                }
            }
        }
        return text;
    }
    if (__TTVAB_STATE__.HasTriggeredPlayerReload) {
        __TTVAB_STATE__.HasTriggeredPlayerReload = false;
        __TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
        __TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
        __TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
        info.LastPlayerReload = Date.now();
    }
    const hasExplicitKnownAdSegments = _$pka(text, {
        includeCached: false,
    });
    const adSignifier = typeof __TTVAB_STATE__?.AdSignifier === "string" &&
        __TTVAB_STATE__.AdSignifier.trim()
        ? __TTVAB_STATE__.AdSignifier.trim()
        : "stitched";
    const hasAds = text.includes(adSignifier) ||
        hasExplicitKnownAdSegments ||
        __TTVAB_STATE__.SimulatedAdsDepth > 0;
    const hasMediaSegments = _playlistHasMediaSegments(text);
    if (!hasAds && hasMediaSegments && !info.IsShowingAd) {
        info.LastCleanNativeM3U8 = text;
        info.LastCleanNativePlaylistAt = Date.now();
        if (info.IsHoldingBackupAfterAd) {
            const restoredAt = Date.now();
            const requiresReload = Boolean(info.HevcReloadPendingAfterHold);
            info.IsHoldingBackupAfterAd = false;
            info.SilentBackupHoldStartedAt = 0;
            info.LastSilentBackupHoldLogAt = 0;
            info.IsUsingBackupStream = false;
            info.ActiveBackupPlayerType = null;
            info.ActiveBackupResolution = null;
            info.HevcReloadPendingAfterHold = false;
            _resetNativeRecoveryReadyState(info);
            _rememberLastAdEnd(info, Date.now());
            _$l(requiresReload
                ? "[Trace] Native playlist clean after silent backup hold; reloading player after backup hold"
                : "[Trace] Native playlist clean after silent backup hold; restoring native stream", "success");
            if (typeof self !== "undefined" && self.postMessage) {
                _postWorkerBridgeMessage(self, _createPageScopedWorkerEvent({
                    key: "NativePlaybackRestored",
                    channel: info.ChannelName,
                    mediaKey: info.MediaKey,
                    restoredAt,
                    fromSilentBackupHold: true,
                    requiresReload,
                }));
            }
        }
    }
    const isOfflinePlaylist = !hasMediaSegments &&
        typeof text === "string" &&
        text.includes("#EXT-X-ENDLIST");
    if (isOfflinePlaylist) {
        if (!info._LoggedOfflineTransition) {
            info._LoggedOfflineTransition = true;
            _$l("[Trace] Offline playlist detected — using cached stream", "warning");
        }
        if (info.LastCleanBackupM3U8) {
            info.IsUsingBackupStream = true;
        }
        return info.LastCleanBackupM3U8 || info.LastCleanNativeM3U8 || text;
    }
    if (hasAds) {

        _notifyAdComplete(text, info).catch(() => { });
        if (info.IsHoldingBackupAfterAd) {
            const holdElapsed = Date.now() - Math.max(0, Number(info.SilentBackupHoldStartedAt) || 0);
            if (holdElapsed >= _getResolvedSilentBackupHoldMaxMs()) {
                _$l("[Trace] Silent backup hold max duration reached; exiting hold to restore native stream", "warning");
                info.IsHoldingBackupAfterAd = false;
                info.SilentBackupHoldStartedAt = 0;
                info.LastSilentBackupHoldLogAt = 0;
                info.IsUsingBackupStream = false;
                info.ActiveBackupPlayerType = null;
                info.ActiveBackupResolution = null;
                info.HevcReloadPendingAfterHold = false;
            }
        }
        if (info.IsHoldingBackupAfterAd) {
            if (info.LastCleanBackupM3U8) {
                const now = Date.now();
                const res = _resolvePlaybackResolutionForUrl(info, url);
                const lastLogAt = Math.max(0, Number(info.LastSilentBackupHoldLogAt) || 0);
                if (now - lastLogAt >= 15000) {
                    info.LastSilentBackupHoldLogAt = now;
                    _$l("[Trace] Native playlist still ad-marked during silent backup hold; continuing clean backup stream", "warning");
                }
                const backupAgeMs = now - (Number(info.LastCleanBackupAt) || 0);
                if (backupAgeMs >= 4000) {
                    try {
                        const refreshedBackup = await _$fb(info, realFetch, 0, res);
                        if (refreshedBackup?.m3u8) {
                            info.IsUsingBackupStream = true;
                            if (refreshedBackup.type) {
                                info.ActiveBackupPlayerType = refreshedBackup.type;
                            }
                            return refreshedBackup.m3u8;
                        }
                    }
                    catch (err) {
                        _$l(`[Trace] Backup refresh failed during silent backup hold: ${err?.message ?? String(err)}`, "warning");
                    }
                }
                info.IsUsingBackupStream = true;
                info.ActiveBackupPlayerType =
                    info.LastCleanBackupPlayerType || info.ActiveBackupPlayerType || null;
                return info.LastCleanBackupM3U8;
            }
            info.IsHoldingBackupAfterAd = false;
            info.SilentBackupHoldStartedAt = 0;
            info.LastSilentBackupHoldLogAt = 0;
            _rememberLastAdEnd(info, Date.now());
            _$l("[Trace] Silent backup hold lost cached backup; resuming visible ad recovery", "warning");
        }
        const backupHoldMaxMs = _getResolvedAdEndBackupHoldMaxMs();
        const visibleAdStartedAt = Math.max(0, Number(info.VisibleAdStartedAt) || 0);
        const visibleAdElapsed = visibleAdStartedAt > 0 ? Date.now() - visibleAdStartedAt : 0;
        if (info.IsShowingAd &&
            info.LastCleanBackupM3U8 &&
            backupHoldMaxMs > 0 &&
            visibleAdElapsed >= backupHoldMaxMs) {
            const adEndedAt = Date.now();
            const res = _resolvePlaybackResolutionForUrl(info, url);
            const heldBackupM3U8 = info.LastCleanBackupM3U8;
            const heldBackupPlayerType = info.LastCleanBackupPlayerType || info.ActiveBackupPlayerType || null;
            const { wasUsingModifiedM3U8: heldWasModified } = _$rsa(info);
            info.IsHoldingBackupAfterAd = true;
            info.SilentBackupHoldStartedAt = adEndedAt;
            info.LastSilentBackupHoldLogAt = adEndedAt;
            info.IsUsingBackupStream = true;
            info.ActiveBackupPlayerType = heldBackupPlayerType;
            info.ActiveBackupResolution = res?.Resolution || null;
            info.HevcReloadPendingAfterHold =
                heldWasModified || heldBackupPlayerType === "autoplay";
            _rememberLastAdEnd(info, adEndedAt);
            __TTVAB_STATE__.CurrentAdChannel = null;
            __TTVAB_STATE__.CurrentAdMediaKey = null;
            __TTVAB_STATE__.PinnedBackupPlayerType = null;
            __TTVAB_STATE__.PinnedBackupPlayerChannel = null;
            __TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
            _$l("[Trace] Native recovery still ad-marked after extended backup hold; ending visible ad cycle and keeping clean backup stream", "warning");
            if (typeof self !== "undefined" && self.postMessage) {
                _postWorkerBridgeMessage(self, _createPageScopedWorkerEvent({
                    key: "AdEnded",
                    channel: info.ChannelName,
                    mediaKey: info.MediaKey,
                    endedAt: adEndedAt,
                    willReload: false,
                    holdingBackup: true,
                }));
            }
            return heldBackupM3U8;
        }
        if (info.PendingAdEndAt || info.CleanPlaylistCount) {
            const elapsedSinceCandidate = Date.now() - (Number(info.PendingAdEndAt) || 0);
            const maxWaitMs = _getResolvedAdEndMaxWaitMs();
            const stalenessThreshold = maxWaitMs > 0 ? maxWaitMs * 3 : 12000;
            if (!info.PendingAdEndAt || elapsedSinceCandidate > stalenessThreshold) {
                info.PendingAdEndAt = 0;
            }
            const now = Date.now();
            const lastAdEndBounceAt = Math.max(0, Number(info.LastAdEndBounceAt) || 0);
            const bounceDebounceMs = Math.max(3000, Number(__TTVAB_STATE__?.AdEndBounceDebounceMs) || 0);
            if (lastAdEndBounceAt > 0 && now - lastAdEndBounceAt < bounceDebounceMs) {
                info.LastAdEndBounceAt = now;
                if (info.LastCleanBackupM3U8) {
                    return info.LastCleanBackupM3U8;
                }
                return _$sa(text, false, info, true);
            }
            info.LastAdEndBounceAt = now;
            info.CleanPlaylistCount = 0;
            info.AdEndMarkerBounceLogged = false;
            info.LastNativeRecoveryHoldLogAt = 0;
            _resetNativeRecoveryReadyState(info, true);
            _$l("[Trace] Ad markers returned before ad-end stabilized", "info");
        }
        info.IsMidroll = text.includes('"MIDROLL"') || text.includes('"midroll"');
        const res = _resolvePlaybackResolutionForUrl(info, url);
        if (!res) {
            _$l(`Missing resolution info for ${url}; using generic fallback`, "warning");
        }
        const isHevc = res?.Codecs?.[0] === "h" &&
            (res?.Codecs?.[1] === "e" || res?.Codecs?.[1] === "v");
        if (isHevc &&
            !info.IsShowingAd &&
            info.ModifiedM3U8 &&
            (!__TTVAB_STATE__.PlayerHasPlayedOnce ||
                __TTVAB_STATE__.PlayerIsPlaying !== true)) {
            _$l("[Trace] Deferring HEVC ad-block until active playback resumes", "info");
            return text;
        }
        if (!info.IsMidroll) {
            const textStr = typeof text === "string" ? text : "";
            const lines = textStr.replace(/\r/g, "").split("\n");
            for (let j = 0; j < lines.length; j++) {
                const line = lines[j];
                let mediaUrl = "";
                if (line.startsWith("#EXTINF") && lines.length > j + 1) {
                    if (line.includes(",live")) {
                        continue;
                    }
                    mediaUrl = lines[j + 1] || "";
                }
                else if (_isMediaPartLine(line) || _isPartPreloadHintLine(line)) {
                    mediaUrl = _getTaggedPlaylistUri(line);
                }
                if (mediaUrl &&
                    !mediaUrl.startsWith("#") &&
                    !info.RequestedAds.has(mediaUrl)) {
                    info.RequestedAds.add(mediaUrl);
                    if (info._AdRequestController) {
                        info._AdRequestController.abort();
                    }
                    const controller = new AbortController();
                    info._AdRequestController = controller;
                    try {
                        realFetch(mediaUrl, { signal: controller.signal })
                            .then((r) => r.blob())
                            .catch(() => { });
                    }
                    catch { }
                    break;
                }
            }
        }
        if (!info.IsShowingAd) {
            const now = Date.now();
            const activeAdMediaKey = typeof __TTVAB_STATE__.CurrentAdMediaKey === "string"
                ? __TTVAB_STATE__.CurrentAdMediaKey
                : null;
            const activeAdChannel = typeof __TTVAB_STATE__.CurrentAdChannel === "string"
                ? __TTVAB_STATE__.CurrentAdChannel
                : null;
            const isRecentAdEndReentry = _isRecentPostAdReentry(info, now);
            const isContinuingAdCycle = Boolean((activeAdMediaKey && activeAdMediaKey === info.MediaKey) ||
                (!activeAdMediaKey &&
                    activeAdChannel &&
                    activeAdChannel === info.ChannelName) ||
                isRecentAdEndReentry);
            info.IsShowingAd = true;
            info.VisibleAdStartedAt = now;
            info.IsHoldingBackupAfterAd = false;
            info.SilentBackupHoldStartedAt = 0;
            info.LastSilentBackupHoldLogAt = 0;
            info.ConsecutiveFailedNativeProbes = 0;
            __TTVAB_STATE__.CurrentAdChannel = info.ChannelName;
            __TTVAB_STATE__.CurrentAdMediaKey = info.MediaKey;
            __TTVAB_STATE__.LastAdDetectedAt = now;
            info.FailedBackupPlayerTypes?.clear?.();
            if (!isContinuingAdCycle) {
                _$ab(info.ChannelName, info.MediaKey);
            }
            if (isRecentAdEndReentry) {
                _$l("[Trace] Treating post-ad ad markers as continuation", "info");
            }
            if (typeof self !== "undefined" && self.postMessage) {
                _postWorkerBridgeMessage(self, _createPageScopedWorkerEvent({
                    key: "AdDetected",
                    channel: info.ChannelName,
                    mediaKey: info.MediaKey,
                    continued: isContinuingAdCycle,
                }));
            }
        }
        if (info.IsUsingFallbackStream) {
            text = _$sa(text, false, info);
            return text;
        }
        if (isHevc &&
            !__TTVAB_STATE__.SkipPlayerReloadOnHevc &&
            info.ModifiedM3U8 &&
            !info.IsUsingModifiedM3U8 &&
            !_isRecentPostAdReentry(info)) {
            const cleanNativeAgeMs = Date.now() - (Number(info.LastCleanNativePlaylistAt) || 0);
            const cleanNativeM3U8 = typeof info.LastCleanNativeM3U8 === "string" &&
                info.LastCleanNativeM3U8 &&
                cleanNativeAgeMs >= 0 &&
                cleanNativeAgeMs <= 10000 &&
                !_$hpa(info.LastCleanNativeM3U8) &&
                !_$pka(info.LastCleanNativeM3U8, {
                    includeCached: false,
                })
                ? info.LastCleanNativeM3U8
                : null;
            if (cleanNativeM3U8) {
                info.IsUsingModifiedM3U8 = true;
            }
            info.LastPlayerReload = Date.now();
            if (typeof self !== "undefined" && self.postMessage) {
                _postWorkerBridgeMessage(self, _createPageScopedWorkerEvent({
                    key: "ReloadPlayer",
                    channel: info.ChannelName,
                    mediaKey: info.MediaKey,
                    refreshAccessToken: true,
                    newMediaPlayerInstance: true,
                }));
            }
            _$l(cleanNativeM3U8
                ? "[Trace] Reloading before HEVC backup handoff; holding clean native playlist for current request"
                : "[Trace] Reloading before HEVC backup handoff; no clean native hold available", "info");
            return cleanNativeM3U8 || text;
        }
        if (!info.CsaiOnlyThisBreak && !info.IsUsingModifiedM3U8) {
            let hasNonLiveSegment = false;
            const segLines = text.split("\n");
            for (let si = 0; si < segLines.length; si++) {
                if (segLines[si]?.startsWith("#EXTINF") &&
                    !segLines[si].includes(",live")) {
                    hasNonLiveSegment = true;
                    break;
                }
            }
            if (!hasNonLiveSegment) {
                info.CsaiOnlyThisBreak = true;
                if (!info.IsShowingAd) {
                    info.IsShowingAd = true;
                    info.VisibleAdStartedAt = Date.now();
                    info.ConsecutiveFailedNativeProbes = 0;
                    __TTVAB_STATE__.CurrentAdChannel = info.ChannelName;
                    __TTVAB_STATE__.CurrentAdMediaKey = info.MediaKey;
                    _$ab(info.ChannelName, info.MediaKey);
                    if (typeof self !== "undefined" && self.postMessage) {
                        _postWorkerBridgeMessage(self, _createPageScopedWorkerEvent({
                            key: "AdDetected",
                            channel: info.ChannelName,
                            mediaKey: info.MediaKey,
                            continued: false,
                        }));
                    }
                }
                _$l("[Trace] CSAI fast path — returning stripped native", "info");
                if (!info._BackupSearchStartedAt && !info.IsUsingFallbackStream) {
                    const res = _resolvePlaybackResolutionForUrl(info, url);
                    info._BackupSearchStartedAt = Date.now();
                    _$fb(info, realFetch, 0, res)
                        .then(() => {
                        info._BackupSearchStartedAt = 0;
                    })
                        .catch(() => {
                        info._BackupSearchStartedAt = 0;
                    });
                }
                const stripped = _$sa(text, false, info, true);
                return stripped || text;
            }
        }
        const hasCleanNative = typeof info.LastCleanNativeM3U8 === "string" &&
            info.LastCleanNativeM3U8 &&
            Date.now() - (Number(info.LastCleanNativePlaylistAt) || 0) <= 2000 &&
            !_$hpa(info.LastCleanNativeM3U8);
        if (hasCleanNative && !_isRecentPostAdReentry(info)) {
            _$l("[Trace] Returning native playlist to prevent buffer drain during backup search", "info");
            return info.LastCleanNativeM3U8;
        }
        let startIdx = 0;
        if (info.LastPlayerReload >
            Date.now() - __TTVAB_STATE__.PlayerReloadMinimalRequestsTime) {
            startIdx = __TTVAB_STATE__.PlayerReloadMinimalRequestsPlayerIndex;
        }
        if (info._LastBackupSearchCompletedAt &&
            Date.now() - info._LastBackupSearchCompletedAt < 15000 &&
            !_isRecentPostAdReentry(info)) {
            const forceRefreshAt = Number(__TTVAB_STATE__?.BackupSearchForceRefreshAt) || 0;
            const cacheStamp = info._LastBackupSearchCompletedAt || 0;
            if (forceRefreshAt > 0 && forceRefreshAt >= cacheStamp - 1) {
                __TTVAB_STATE__.BackupSearchForceRefreshAt = 0;
                info._LastBackupSearchCompletedAt = 0;
                _$l(`[Trace] Bypassing backup cache: pinned backup stalled (${Math.round((Date.now() - forceRefreshAt) / 100) / 10}s ago)`, "warning");
            }
            else if (info.LastCleanBackupM3U8) {
                info.IsUsingBackupStream = true;
                return info.LastCleanBackupM3U8;
            }
            else {
                return text;
            }
        }
        let { type: backupType, m3u8: backupM3u8, isFallback, } = await _$fb(info, realFetch, startIdx, res);
        if (!backupM3u8) {
            if (info.LastCleanBackupM3U8) {
                backupM3u8 = info.LastCleanBackupM3U8;
                backupType =
                    info.LastCleanBackupPlayerType || __TTVAB_STATE__.FallbackPlayerType;
                isFallback = true;
                _$l("[Trace] Using cached clean backup as emergency fallback", "warning");
            }
            else if (info.LastCleanNativeM3U8) {
                backupM3u8 = info.LastCleanNativeM3U8;
                backupType = __TTVAB_STATE__.FallbackPlayerType;
                isFallback = true;
                _$l("[Trace] Using last clean native M3U8 as emergency fallback", "warning");
            }
            else {
                _$l("Failed to find backup stream — no cached clean playlists available", "warning");
            }
        }
        if (isFallback) {
            info.IsUsingFallbackStream = true;
            _$l("Entering fallback mode - stripping ads", "info");
        }
        if (backupM3u8) {
            info.IsUsingBackupStream = true;
            text = backupM3u8;
        }
        info.ActiveBackupResolution = res?.Resolution || null;
        if (backupType) {
            if (backupType !== "autoplay") {
                __TTVAB_STATE__.PinnedBackupPlayerType = backupType;
                __TTVAB_STATE__.PinnedBackupPlayerChannel = info.ChannelName || null;
                __TTVAB_STATE__.PinnedBackupPlayerMediaKey = info.MediaKey || null;
            }
        }
        if (info.ActiveBackupPlayerType !== backupType) {
            info.ActiveBackupPlayerType = backupType;
            if (backupType === "autoplay") {
                if (!info._LqHoldStartAt) {
                    info._LqHoldStartAt = Date.now();
                }
            }
            else if (info._LqHoldStartAt) {
                info._LqHoldStartAt = 0;
            }
            _$l(`Using backup: ${backupType}`, "info");
            if (backupType && typeof self !== "undefined" && self.postMessage) {
                _postWorkerBridgeMessage(self, _createPageScopedWorkerEvent({
                    key: "BackupPlayerTypeSelected",
                    value: backupType,
                    channel: info.ChannelName,
                    mediaKey: info.MediaKey,
                }));
            }
        }
        info._LastBackupSearchCompletedAt = Date.now();
        const stripHevc = isHevc && info.ModifiedM3U8;
        if (__TTVAB_STATE__.IsAdStrippingEnabled || stripHevc) {
            text = _$sa(text, stripHevc, info);
        }
    }
    else if (info.IsShowingAd) {
        const isOfflinePlaylist = !hasMediaSegments &&
            typeof text === "string" &&
            text.includes("#EXT-X-ENDLIST");
        if (isOfflinePlaylist) {
            if (!info._LoggedOfflineTransition) {
                info._LoggedOfflineTransition = true;
                _$l("[Trace] Offline playlist detected during ad break — using backup stream", "warning");
            }
            if (info.LastCleanBackupM3U8) {
                info.IsUsingBackupStream = true;
            }
            return info.LastCleanBackupM3U8 || info.LastCleanNativeM3U8 || text;
        }
        const res = _resolvePlaybackResolutionForUrl(info, url);
        let adEndState = "wait";
        try {
            adEndState = await _isAdEndStable(info, realFetch, res);
        }
        catch (err) {
            _$l(`[Trace] Ad-end stability check failed: ${err?.message ?? String(err)}`, "warning");
            adEndState = "wait";
        }
        if (adEndState === "wait") {
            const backupAgeMs = Date.now() - (Number(info.LastCleanBackupAt) || 0);
            const backupIsFromCurrentCycle = Number(info.LastCleanBackupAt) > Number(info.VisibleAdStartedAt);
            if (info.LastCleanBackupM3U8 &&
                backupAgeMs >= 20000 &&
                backupIsFromCurrentCycle) {
                try {
                    const refreshedBackup = await _$fb(info, realFetch, 0, res);
                    if (refreshedBackup?.m3u8) {
                        info.IsUsingBackupStream = true;
                        if (refreshedBackup.type) {
                            info.ActiveBackupPlayerType = refreshedBackup.type;
                        }
                        return refreshedBackup.m3u8;
                    }
                }
                catch (err) {
                    _$l(`[Trace] Backup refresh failed during ad-end wait: ${err?.message ?? String(err)}`, "warning");
                }
            }
            if (info.LastCleanBackupM3U8) {
                info.IsUsingBackupStream = true;
                return info.LastCleanBackupM3U8;
            }
            return info.LastCleanNativeM3U8 || text;
        }
        const adEndedAt = Date.now();
        const isSilentBackupHoldEnd = adEndState === "ended-with-backup-hold";
        const heldBackupM3U8 = isSilentBackupHoldEnd
            ? info.LastCleanBackupM3U8
            : null;
        const heldBackupPlayerType = isSilentBackupHoldEnd
            ? info.LastCleanBackupPlayerType || info.ActiveBackupPlayerType || null
            : null;
        const { wasUsingModifiedM3U8, wasUsingFallbackStream, wasUsingBackupStream, hadStrippedAdSegments, } = _$rsa(info);
        if (isSilentBackupHoldEnd && heldBackupM3U8) {
            info.IsHoldingBackupAfterAd = true;
            info.SilentBackupHoldStartedAt = adEndedAt;
            info.LastSilentBackupHoldLogAt = adEndedAt;
            info.IsUsingBackupStream = true;
            info.ActiveBackupPlayerType = heldBackupPlayerType;
            info.ActiveBackupResolution = res?.Resolution || null;
            info.HevcReloadPendingAfterHold =
                wasUsingModifiedM3U8 || heldBackupPlayerType === "autoplay";
        }
        __TTVAB_STATE__.CurrentAdChannel = null;
        __TTVAB_STATE__.CurrentAdMediaKey = null;
        __TTVAB_STATE__.PinnedBackupPlayerType = null;
        __TTVAB_STATE__.PinnedBackupPlayerChannel = null;
        __TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
        if (typeof self !== "undefined" && self.postMessage) {
            const shouldUseHevcReload = Boolean(wasUsingModifiedM3U8);
            const recentMidrollChain = info.LastAdEndReloadAt > 0 &&
                adEndedAt - info.LastAdEndReloadAt < 30000;
            const isCsaiBreak = !hadStrippedAdSegments && !wasUsingModifiedM3U8;
            let shouldReloadPlayer = false;
            let shouldPauseResumePlayer = false;
            let reloadKind = "post-ad";
            const needsHardReload = shouldUseHevcReload;
            if (isCsaiBreak) {
                if (wasUsingBackupStream && !recentMidrollChain) {
                    shouldReloadPlayer = true;
                    reloadKind = "post-escape";
                }
            }
            else if (!isSilentBackupHoldEnd) {
                shouldReloadPlayer = Boolean(shouldUseHevcReload ||
                    (_$c?.RELOAD_AFTER_AD !== false &&
                        hadStrippedAdSegments &&
                        !recentMidrollChain));
                shouldPauseResumePlayer = Boolean(!shouldReloadPlayer && !wasUsingFallbackStream);
            }
            _postWorkerBridgeMessage(self, _createPageScopedWorkerEvent({
                key: "AdEnded",
                channel: info.ChannelName,
                mediaKey: info.MediaKey,
                endedAt: adEndedAt,
                willReload: shouldReloadPlayer,
                holdingBackup: isSilentBackupHoldEnd,
            }));
            if (shouldReloadPlayer) {
                info.LastPlayerReload = Date.now();
                _postWorkerBridgeMessage(self, _createPageScopedWorkerEvent({
                    key: "ReloadPlayer",
                    channel: info.ChannelName,
                    mediaKey: info.MediaKey,
                    reason: reloadKind,
                    refreshAccessToken: true,
                    newMediaPlayerInstance: needsHardReload,
                }));
            }
            else if (shouldPauseResumePlayer) {
                _postWorkerBridgeMessage(self, _createPageScopedWorkerEvent({
                    key: "PauseResumePlayer",
                    channel: info.ChannelName,
                    mediaKey: info.MediaKey,
                }));
            }
            _rememberLastAdEnd(info, adEndedAt);
        }
        if (isSilentBackupHoldEnd && heldBackupM3U8) {
            return heldBackupM3U8;
        }
    }
    return text;
}
function _getFallbackPromotionPolicy({ candidateHasAds, candidateIsPlayable, simulatedAdsDepthSatisfied, }) {
    const base = {
        allowSelectedPromotion: false,
        allowFallbackPromotion: false,
        reason: "deny-by-default",
    };
    if (!candidateIsPlayable) {
        return { ...base, reason: "not-playable" };
    }
    if (candidateHasAds) {
        return {
            allowSelectedPromotion: false,
            allowFallbackPromotion: true,
            reason: "ad-marked",
        };
    }
    if (!simulatedAdsDepthSatisfied) {
        return { ...base, reason: "simulated-ads-depth" };
    }
    return {
        allowSelectedPromotion: true,
        allowFallbackPromotion: true,
        reason: "clean-playable",
    };
}
function _getResolvedLqHqHoldMinMs() {
    return Math.max(0, Number(__TTVAB_STATE__?.LqHqHoldMinMs) ||
        Number(_$c?.LQ_HQ_HOLD_MIN_MS) ||
        0);
}
function _shouldTryAutoplayFirst(info) {
    const lqHoldStartAt = Number(info?._LqHoldStartAt) || 0;
    const lqHoldMinMs = _getResolvedLqHqHoldMinMs();
    if (lqHoldStartAt > 0 &&
        lqHoldMinMs > 0 &&
        Date.now() - lqHoldStartAt < lqHoldMinMs &&
        info?.ActiveBackupPlayerType === "autoplay") {
        return true;
    }
    return false;
}
async function _$fb(info, realFetch, startIdx = 0, currentResolution = null) {
    let backupType = null;
    let backupM3u8 = null;
    let fallbackM3u8 = null;
    let fallbackType = null;
    let playerTypes = _getOrderedBackupPlayerTypes(info, startIdx);

    if (info.LoggedBackupAdsByType && info.LoggedBackupAdsByType.size > 0) {
        const clean = [];
        const contam = [];
        for (const t of playerTypes) {
            if (info.LoggedBackupAdsByType.has(t))
                contam.push(t);
            else
                clean.push(t);
        }
        if (contam.length > 0 && clean.length > 0) {
            playerTypes = [...clean, ...contam];
        }
    }
    if (_shouldTryAutoplayFirst(info)) {
        playerTypes = [
            "autoplay",
            ...playerTypes.filter((pt) => pt !== "autoplay"),
        ];
        _$l("[Trace] LQ autoplay prioritized first for fast clean first-frame (seamless LQ→HQ hold)", "info");
    }
    else if (__TTVAB_STATE__.DisableAutoplayBackup &&
        !playerTypes.includes("autoplay")) {
        playerTypes.push("autoplay");
        _$l("[Trace] LQ autoplay appended as last-resort fallback (toggle disabled, ensures seamless LQ→HQ hold)", "info");
    }
    const playerTypesLen = playerTypes.length;
    const isDoingMinimalRequests = startIdx > 0 &&
        playerTypes.every((playerType) => (__TTVAB_STATE__?.BackupPlayerTypes || []).indexOf(playerType) >=
            startIdx);
    const targetRes = currentResolution ||
        _$gfr(info, "") ||
        info?.ResolutionList?.[0] ||
        (typeof __TTVAB_STATE__?.PreferredQualityGroup === "string" &&
            __TTVAB_STATE__.PreferredQualityGroup.trim()
            ? { Name: __TTVAB_STATE__.PreferredQualityGroup.trim() }
            : null);
    for (let pi = 0; !backupM3u8 && pi < playerTypesLen; pi++) {
        const pt = playerTypes[pi];
        const realPt = pt.replace("-CACHED", "");
        const isFullyCachedPlayerType = pt !== realPt;
        const configuredPlayerTypeIndex = Math.max(0, (__TTVAB_STATE__?.BackupPlayerTypes || []).indexOf(realPt));
        if (_isBackupPlayerRetryCoolingDown(info, pt)) {
            if (!info._LoggedWhitelistByType) {
                info._LoggedWhitelistByType = new Set();
            }
            if (!info._LoggedWhitelistByType.has(`cooldown:${pt}`)) {
                info._LoggedWhitelistByType.add(`cooldown:${pt}`);
                _$l(`[Trace] Cooling down: ${pt}`, "info");
            }
            continue;
        }
        _$l(`[Trace] Checking: ${pt}`, "info");
        for (let j = 0; j < 2; j++) {
            let isFreshM3u8 = false;
            let invalidateCache = false;
            const encCache = info.BackupEncodingsM3U8Cache[pt];
            let enc = typeof encCache === "string" ? encCache : encCache?.m3u8 || null;
            let encBaseUrl = typeof encCache === "object" && encCache?.baseUrl
                ? encCache.baseUrl
                : info.UsherBaseUrl;
            if (!enc) {
                isFreshM3u8 = true;
                try {
                    const tokenRes = await _$tk(info, realPt, realFetch);
                    if (tokenRes.status === 200) {
                        const token = await tokenRes.json();
                        const extractedToken = _extractPlaybackAccessToken(token);
                        const sig = extractedToken?.signature;
                        const tokenValue = extractedToken?.value;
                        if (sig && tokenValue) {
                            const usherUrl = _buildUsherPlaybackUrl(info, sig, tokenValue);
                            if (!usherUrl) {
                                _$l(`Missing usher context for ${pt}`, "warning");
                                _markBackupPlayerRetryCooldown(info, pt, "token-error");
                                invalidateCache = true;
                                continue;
                            }
                            const encRes = await realFetch(usherUrl.href);
                            if (encRes.status === 200) {
                                enc = await encRes.text();
                                encBaseUrl = usherUrl.href;
                                info.BackupEncodingsM3U8Cache[pt] = {
                                    m3u8: enc,
                                    baseUrl: encBaseUrl,
                                };

                                const lines = enc.split("\n");
                                for (let i = 0; i < lines.length; i++) {
                                    const line = lines[i]?.trim();
                                    if (line &&
                                        !line.startsWith("#") &&
                                        (line.endsWith(".m3u8") || line.includes("://"))) {
                                        try {
                                            const variantUrl = new URL(line, encBaseUrl).href;
                                            info.BackupVariantUrls?.add(variantUrl);
                                            for (const alias of _getPlaylistUrlAliases(variantUrl)) {
                                                info.BackupVariantUrls?.add(alias);
                                            }
                                        }
                                        catch { }
                                    }
                                }
                                if (!info._LoggedWhitelistByType) {
                                    info._LoggedWhitelistByType = new Set();
                                }
                                if (!info._LoggedWhitelistByType.has(`whitelist:${pt}`)) {
                                    info._LoggedWhitelistByType.add(`whitelist:${pt}`);
                                    _$l(`[Trace] Whitelisted variants for ${pt} (Total: ${info.BackupVariantUrls.size})`);
                                }
                                while (info.BackupVariantUrls.size > 200) {
                                    const first = info.BackupVariantUrls.values().next().value;
                                    if (first !== undefined)
                                        info.BackupVariantUrls.delete(first);
                                    else
                                        break;
                                }
                            }
                            else {
                                _$l(`Usher failed for ${pt}: ${encRes.status}`, "warning");
                                _markBackupPlayerRetryCooldown(info, pt, "token-error");
                            }
                        }
                        else {
                            const missingParts = [
                                extractedToken?.hasAnySignature ? null : "signature",
                                extractedToken?.hasAnyValue ? null : "value",
                            ]
                                .filter(Boolean)
                                .join("+");
                            const tokenErrors = Array.isArray(extractedToken?.errors)
                                ? extractedToken.errors.slice(0, 2).join(" | ")
                                : "";
                            const tokenContext = tokenErrors
                                ? ` errors=${tokenErrors}`
                                : extractedToken?.summary
                                    ? ` payload=${extractedToken.summary}`
                                    : "";
                            _$l(`[Trace] Missing token ${missingParts || "parts"} for ${pt}${tokenContext}`, "warning");
                            _markBackupPlayerRetryCooldown(info, pt, "token-error");
                        }
                    }
                    else {
                        _$l(`Token failed for ${pt}: ${tokenRes.status}`, "warning");
                        _markBackupPlayerRetryCooldown(info, pt, "token-error");
                    }
                }
                catch (e) {
                    _$l(`Backup error: ${e.message}`, "error");
                    _markBackupPlayerRetryCooldown(info, pt, "error");
                    info._BackupSearchErrorCount =
                        (info._BackupSearchErrorCount || 0) + 1;
                }
            }
            if (enc) {
                if (!isFreshM3u8) {
                    const lines = enc.split("\n");
                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i]?.trim();
                        if (line &&
                            !line.startsWith("#") &&
                            (line.endsWith(".m3u8") || line.includes("://"))) {
                            try {
                                const variantUrl = new URL(line, encBaseUrl).href;
                                info.BackupVariantUrls?.add(variantUrl);
                                for (const alias of _getPlaylistUrlAliases(variantUrl)) {
                                    info.BackupVariantUrls?.add(alias);
                                }
                            }
                            catch { }
                        }
                    }
                    while (info.BackupVariantUrls.size > 200) {
                        const first = info.BackupVariantUrls.values().next().value;
                        if (first !== undefined)
                            info.BackupVariantUrls.delete(first);
                        else
                            break;
                    }
                }
                try {
                    const streamUrl = _$su(enc, targetRes, encBaseUrl);
                    if (streamUrl) {
                        const streamRes = await realFetch(streamUrl);
                        if (streamRes.status === 200) {
                            const m3u8 = _absolutizeMediaPlaylistUrls(await streamRes.text(), streamUrl);
                            if (m3u8) {
                                const candidateIsPlayable = _playlistHasMediaSegments(m3u8);
                                const candidateHasAds = _$hpa(m3u8) ||
                                    _$hem(m3u8) ||
                                    _$pka(m3u8, {
                                        includeCached: false,
                                    });
                                const simulatedAdsDepthSatisfied = __TTVAB_STATE__.SimulatedAdsDepth === 0 ||
                                    configuredPlayerTypeIndex >=
                                        __TTVAB_STATE__.SimulatedAdsDepth - 1;
                                const promotionPolicy = typeof _getFallbackPromotionPolicy === "function"
                                    ? _getFallbackPromotionPolicy({
                                        candidateHasAds,
                                        candidateIsPlayable,
                                        simulatedAdsDepthSatisfied,
                                    })
                                    : {
                                        allowSelectedPromotion: false,
                                        allowFallbackPromotion: false,
                                        reason: "policy-unavailable",
                                    };
                                const canPromoteFallback = promotionPolicy.allowFallbackPromotion &&
                                    (!fallbackM3u8 ||
                                        pt === __TTVAB_STATE__.FallbackPlayerType ||
                                        fallbackType !== __TTVAB_STATE__.FallbackPlayerType);
                                if (canPromoteFallback) {
                                    fallbackM3u8 = m3u8;
                                    fallbackType = pt;
                                }
                                if (promotionPolicy.allowSelectedPromotion) {
                                    _clearBackupPlayerRetryCooldown(info, pt);
                                    backupType = pt;
                                    backupM3u8 = m3u8;
                                    info.LastCleanBackupM3U8 = m3u8;
                                    info.LastCleanBackupPlayerType = pt;
                                    info.LastCleanBackupAt = Date.now();
                                    _$l(`[Trace] Selected: ${pt}`, "success");
                                    break;
                                }
                                if (isDoingMinimalRequests &&
                                    candidateIsPlayable &&
                                    !candidateHasAds) {
                                    _clearBackupPlayerRetryCooldown(info, pt);
                                    backupType = pt;
                                    backupM3u8 = m3u8;
                                    info.LastCleanBackupM3U8 = m3u8;
                                    info.LastCleanBackupPlayerType = pt;
                                    info.LastCleanBackupAt = Date.now();
                                    _$l(`[Trace] Selected (minimal): ${pt}`, "success");
                                    break;
                                }
                                _markBackupPlayerRetryCooldown(info, pt, promotionPolicy.reason);
                                if (promotionPolicy.reason === "ad-marked") {
                                    if (!info.LoggedBackupAdsByType) {
                                        info.LoggedBackupAdsByType = new Set();
                                    }
                                    info.LoggedBackupAdsByType.add(pt);
                                    info.LoggedBackupAdsByType.add(realPt);
                                }
                                if (isFullyCachedPlayerType) {
                                    _$l(`[Trace] Rejected ${pt} (${promotionPolicy.reason})`, "warning");
                                    break;
                                }
                                _$l(`[Trace] Rejected ${pt} (${promotionPolicy.reason})`, "warning");
                                invalidateCache = true;
                            }
                        }
                        else {
                            _$l(`Stream failed for ${pt}: ${streamRes.status}`, "warning");
                            _markBackupPlayerRetryCooldown(info, pt, "stream-error");
                            invalidateCache = true;
                        }
                    }
                    else {
                        _$l(`No stream URL for ${pt}`, "warning");
                        _markBackupPlayerRetryCooldown(info, pt, "no-stream-url");
                        invalidateCache = true;
                    }
                }
                catch (e) {
                    _$l(`Stream error: ${e.message}`, "warning");
                    _markBackupPlayerRetryCooldown(info, pt, "stream-error");
                    info._BackupSearchErrorCount =
                        (info._BackupSearchErrorCount || 0) + 1;
                    invalidateCache = true;
                }
            }
            if (invalidateCache) {
                info.BackupEncodingsM3U8Cache[pt] = null;
            }
            if (isFreshM3u8)
                break;
        }
    }
    let isFallback = false;
    if (!backupM3u8 && fallbackM3u8) {
        backupType = fallbackType || __TTVAB_STATE__.FallbackPlayerType;
        backupM3u8 = fallbackM3u8;
        isFallback = true;
        if (!info.LoggedBackupAdsByType?.has(backupType)) {
            info.LastCleanBackupM3U8 = backupM3u8;
            info.LastCleanBackupPlayerType = backupType;
            info.LastCleanBackupAt = Date.now();
        }
        _$l(`[Trace] Using fallback: ${backupType}`, "warning");
    }
    if (backupM3u8) {
        info._BackupSearchCount = (info._BackupSearchCount || 0) + 1;
        if (isFallback) {
            info._FallbackEntryCount = (info._FallbackEntryCount || 0) + 1;
        }
    }
    else {
        info._BackupSearchFailCount = (info._BackupSearchFailCount || 0) + 1;
    }
    return { type: backupType, m3u8: backupM3u8, isFallback };
}

"use strict";

function _$wj(url) {
    try {
        const req = new XMLHttpRequest();
        req.open("GET", url, false);
        req.send();
        return req.responseText;
    }
    catch {
        return "";
    }
}
function _$cw(W) {
    const CleanWorker = class extends W {
    };
    const proto = CleanWorker.prototype;
    for (const key of _$s.conflicts) {
        if (key in proto) {
            try {
                Object.defineProperty(proto, key, {
                    configurable: true,
                    writable: true,
                    value: undefined,
                });
            }
            catch {
                _$l(`Worker property "${key}" is non-configurable, cleanup skipped`, "debug");
            }
        }
    }
    return CleanWorker;
}
function _$gr(W) {
    const src = W.toString();
    const result = [];
    for (const pattern of _$s.reinsertPatterns) {
        const isIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(pattern);
        const matched = isIdentifier
            ? new RegExp(`\\b${pattern}\\b`).test(src)
            : src.includes(pattern);
        if (matched)
            result.push(pattern);
    }
    return result;
}
function _$re(W, names) {
    for (const name of names) {
        if (typeof window[name] === "function") {
            try {
                W.prototype[name] = window[name];
            }
            catch { }
        }
    }
    return W;
}
function _$iv(v) {
    if (typeof v !== "function")
        return false;
    const src = v.toString();
    if (_$s.toleratedWorkerWrappers.some((ext) => ext.signatures.every((sig) => src.includes(sig)))) {
        return true;
    }
    const hasConflict = _$s.conflicts.some((c) => src.includes(c));
    const hasReinsert = _$s.reinsertPatterns.some((p) => src.includes(p));
    if (hasConflict) {
        const matched = _$s.conflicts.filter((c) => src.includes(c));
        _$l(`Worker wrapper rejected (conflict: ${matched.join(", ")}, hasReinsert: ${hasReinsert})`, "debug");
    }
    return !hasConflict && !hasReinsert;
}

"use strict";

const _POST_AD_REMOVABLE_SELECTORS = [
    '[data-a-target="video-player-pip-container"]',
    '[data-a-target="video-player-mini-player"]',
    ".video-player__pip-container",
    ".video-player__mini-player",
    ".mini-player",
    '[class*="mini-player"]',
    '[class*="pip-container"]',
    '[data-test-selector="display-ad"]',
    '[data-test-selector="ad-banner"]',
    '[data-a-target="ads-banner"]',
    'iframe[data-test-selector^="sda-iframe-"]',
    'iframe[title="Stream Display Ad"]',
    'iframe[class*="stream-display-ad__iframe_lower-third"]',
    '[data-ttvab-player-ad-banner="true"]',
];
const _POST_AD_RESET_ONLY_SELECTORS = [
    ".stream-display-ad",
    '[class*="stream-display-ad"]',
    ".video-player--stream-display-ad",
    '[class*="video-player--stream-display-ad"]',
];
const _POST_AD_REMOVABLE_SELECTOR_GROUP = _POST_AD_REMOVABLE_SELECTORS.join(", ");
const _POST_AD_RESET_SELECTOR_GROUP = _POST_AD_RESET_ONLY_SELECTORS.join(", ");
let _pendingPostAdArtifactCleanup = null;
const _trackedExtensionBlobUrls = new Set();
function _hidePostAdArtifact(el) {
    if (!(el instanceof Element))
        return;
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("pointer-events", "none", "important");
    el.setAttribute("data-ttvab-post-ad-hidden", "true");
}
function _isPostAdPlayerLayoutWrapper(el) {
    if (!(el instanceof Element))
        return false;
    return Boolean(el.querySelector?.("video") ||
        el.matches?.('[data-a-target="video-player"]') ||
        el.matches?.('[class*="video-player"]'));
}
function _resetPostAdDisplayArtifact(el) {
    if (!(el instanceof Element))
        return;
    if (typeof el.className === "string" &&
        el.className.includes("stream-display-ad")) {
        el.className = el.className
            .split(/\s+/)
            .filter((className) => className && !className.includes("stream-display-ad"))
            .join(" ");
    }
    if (_isPostAdPlayerLayoutWrapper(el)) {
        el.removeAttribute("data-ttvab-post-ad-hidden");
        el.style.removeProperty("display");
        el.style.removeProperty("visibility");
        el.style.removeProperty("pointer-events");
        el.style.setProperty("padding", "0", "important");
        el.style.setProperty("margin", "0", "important");
        el.style.setProperty("background", "transparent", "important");
        el.style.setProperty("background-color", "transparent", "important");
        el.style.setProperty("width", "100%", "important");
        el.style.setProperty("height", "100%", "important");
        el.style.setProperty("max-width", "100%", "important");
        el.style.setProperty("max-height", "100%", "important");
        el.style.setProperty("inset", "0", "important");
        return;
    }
    _hidePostAdArtifact(el);
}
function _runPostAdArtifactCleanup() {
    try {
        for (const el of document.querySelectorAll(_POST_AD_REMOVABLE_SELECTOR_GROUP)) {
            _resetPostAdDisplayArtifact(el);
        }
        for (const el of document.querySelectorAll(_POST_AD_RESET_SELECTOR_GROUP)) {
            _resetPostAdDisplayArtifact(el);
        }
    }
    catch (_e) { }
}
function _schedulePostAdArtifactCleanup(channel = null, mediaKey = null) {
    if (_pendingPostAdArtifactCleanup?.id) {
        clearTimeout(_pendingPostAdArtifactCleanup.id);
    }
    const entry = {
        id: 0,
        channel,
        mediaKey,
    };
    entry.id = setTimeout(() => {
        if (_pendingPostAdArtifactCleanup !== entry) {
            return;
        }
        _pendingPostAdArtifactCleanup = null;
        if (typeof _isPlaybackRecoveryContextCurrent === "function" &&
            !_isPlaybackRecoveryContextCurrent(entry.channel, entry.mediaKey)) {
            return;
        }
        _runPostAdArtifactCleanup();
    }, 80);
    _pendingPostAdArtifactCleanup = entry;
    return entry.id;
}
function _$wf() {
    _$l("Worker fetch hooked", "info");
    const realFetch = fetch;
    const EMPTY_SEGMENT_URL = "data:video/mp4;base64,AAAAKGZ0eXBtcDQyAAAAAWlzb21tcDQyZGFzaGF2YzFpc282aGxzZgAABEltb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAYagAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAABqHRyYWsAAABcdGtoZAAAAAMAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAURtZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAALuAAAAAAFXEAAAAAAAtaGRscgAAAAAAAAAAc291bgAAAAAAAAAAAAAAAFNvdW5kSGFuZGxlcgAAAADvbWluZgAAABBzbWhkAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAACzc3RibAAAAGdzdHNkAAAAAAAAAAEAAABXbXA0YQAAAAAAAAABAAAAAAAAAAAAAgAQAAAAALuAAAAAAAAzZXNkcwAAAAADgICAIgABAASAgIAUQBUAAAAAAAAAAAAAAAWAgIACEZAGgICAAQIAAAAQc3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAAeV0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAoAAAAFoAAAAAAGBbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAA9CQAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABLG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAOxzdGJsAAAAoHN0c2QAAAAAAAAAAQAAAJBhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAoABaABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAOmF2Y0MBTUAe/+EAI2dNQB6WUoFAX/LgLUBAQFAAAD6AAA6mDgAAHoQAA9CW7y4KAQAEaOuPIAAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAASG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAC4AAAAAAoAAAAAAACB0cmV4AAAAAAAAAAIAAAABAACCNQAAAAACQAAA";
    function _$ps() {
        if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__)
            return;
        const keys = Object.keys(__TTVAB_STATE__.StreamInfos);
        if (keys.length > 5) {
            const oldKey = keys.sort((a, b) => (__TTVAB_STATE__.StreamInfos[a]?.LastActivityAt || 0) -
                (__TTVAB_STATE__.StreamInfos[b]?.LastActivityAt || 0))[0];
            const oldInfo = __TTVAB_STATE__.StreamInfos[oldKey];
            delete __TTVAB_STATE__.StreamInfos[oldKey];
            const urlsToDelete = [];
            for (const url in __TTVAB_STATE__.StreamInfosByUrl) {
                if (__TTVAB_STATE__.StreamInfosByUrl[url] === oldInfo) {
                    urlsToDelete.push(url);
                }
            }
            for (const url of urlsToDelete) {
                delete __TTVAB_STATE__.StreamInfosByUrl[url];
            }
        }
        const MAX_STREAM_INFO_BY_URL = 200;
        const byUrlKeys = Object.keys(__TTVAB_STATE__.StreamInfosByUrl);
        if (byUrlKeys.length > MAX_STREAM_INFO_BY_URL) {
            byUrlKeys.sort((a, b) => (__TTVAB_STATE__.StreamInfosByUrl[a]?.LastActivityAt || 0) -
                (__TTVAB_STATE__.StreamInfosByUrl[b]?.LastActivityAt || 0));
            for (let i = 0; i < 50 && i < byUrlKeys.length; i++) {
                delete __TTVAB_STATE__.StreamInfosByUrl[byUrlKeys[i]];
            }
        }
    }
    function _$si(info, encodings, usherUrl) {
        const wasUsingModifiedM3U8 = Boolean(info.IsUsingModifiedM3U8);
        info.EncodingsM3U8 = encodings;
        info.UsherBaseUrl = usherUrl;
        info.UsherParams = new URL(usherUrl).search;
        info.Urls = Object.create(null);
        info.ResolutionList = [];
        info.ModifiedM3U8 = null;
        info.IsUsingModifiedM3U8 = false;
        for (const variantUrl in __TTVAB_STATE__.StreamInfosByUrl) {
            if (__TTVAB_STATE__.StreamInfosByUrl[variantUrl] === info) {
                delete __TTVAB_STATE__.StreamInfosByUrl[variantUrl];
            }
        }
        const lines = encodings.split("\n");
        for (let i = 0, len = lines.length; i < len - 1; i++) {
            const nextLine = lines[i + 1]?.trim();
            if (lines[i]?.startsWith("#EXT-X-STREAM-INF") &&
                nextLine &&
                !nextLine.startsWith("#") &&
                (nextLine.includes(".m3u8") || nextLine.includes("://"))) {
                const attrs = _$pa(lines[i]);
                const resolution = attrs.RESOLUTION;
                let variantUrl = lines[i + 1];
                try {
                    variantUrl = new URL(variantUrl, usherUrl).href;
                }
                catch { }
                if (resolution) {
                    const resInfo = _$sv(attrs, lines[i + 1], variantUrl);
                    for (const alias of _getPlaylistUrlAliases(variantUrl)) {
                        info.Urls[alias] = resInfo;
                    }
                    for (const alias of _getPlaylistUrlAliases(lines[i + 1], usherUrl)) {
                        info.Urls[alias] = resInfo;
                    }
                    info.ResolutionList.push(resInfo);
                }
                for (const alias of _getPlaylistUrlAliases(variantUrl)) {
                    __TTVAB_STATE__.StreamInfosByUrl[alias] = info;
                }
                for (const alias of _getPlaylistUrlAliases(lines[i + 1], usherUrl)) {
                    __TTVAB_STATE__.StreamInfosByUrl[alias] = info;
                }
            }
        }
        const nonHevcList = info.ResolutionList.filter((r) => r.Codecs?.startsWith("avc") || r.Codecs?.startsWith("av0"));
        const hasHevc = info.ResolutionList.some((r) => r.Codecs?.startsWith("hev") || r.Codecs?.startsWith("hvc"));
        if (hasHevc && nonHevcList.length > 0) {
            const modLines = [...lines];
            for (let mi = 0; mi < modLines.length - 1; mi++) {
                if (modLines[mi]?.startsWith("#EXT-X-STREAM-INF")) {
                    const attrs = _$pa(modLines[mi]);
                    const codecs = attrs.CODECS || "";
                    if (codecs.startsWith("hev") || codecs.startsWith("hvc")) {
                        const [tw, th] = (attrs.RESOLUTION || "1920x1080")
                            .split("x")
                            .map(Number);
                        const targetArea = (Number.isFinite(tw) ? tw : 1920) *
                            (Number.isFinite(th) ? th : 1080);
                        const closest = [...nonHevcList].sort((a, b) => {
                            const [aw, ah] = String(a?.Resolution || "0x0")
                                .split("x")
                                .map(Number);
                            const [bw, bh] = String(b?.Resolution || "0x0")
                                .split("x")
                                .map(Number);
                            const aArea = (Number.isFinite(aw) ? aw : 0) * (Number.isFinite(ah) ? ah : 0);
                            const bArea = (Number.isFinite(bw) ? bw : 0) * (Number.isFinite(bh) ? bh : 0);
                            return (Math.abs(aArea - targetArea) - Math.abs(bArea - targetArea));
                        })[0];
                        let nextStreamInf = modLines[mi].replace(/CODECS="[^"]+"/, `CODECS="${closest.Codecs}"`);
                        nextStreamInf = _replaceOrAppendStreamInfAttribute(nextStreamInf, "AUDIO", closest.Audio);
                        nextStreamInf = _replaceOrAppendStreamInfAttribute(nextStreamInf, "VIDEO", closest.Video);
                        nextStreamInf = _replaceOrAppendStreamInfAttribute(nextStreamInf, "SUBTITLES", closest.Subtitles);
                        modLines[mi] = nextStreamInf;
                        modLines[mi + 1] = closest.RawUrl || closest.Url;
                    }
                }
            }
            info.ModifiedM3U8 = modLines.join("\n");
            const matchesActiveAdMediaKey = typeof __TTVAB_STATE__.CurrentAdMediaKey === "string" &&
                !!info.MediaKey &&
                __TTVAB_STATE__.CurrentAdMediaKey === info.MediaKey;
            info.IsUsingModifiedM3U8 =
                (wasUsingModifiedM3U8 || matchesActiveAdMediaKey) &&
                    __TTVAB_STATE__.IsAdStrippingEnabled === true;
            _$l("HEVC stream detected, prepared quality-preserving non-HEVC fallback master", "info");
        }
        if (wasUsingModifiedM3U8 && !info.ModifiedM3U8) {
            info.IsUsingModifiedM3U8 = false;
        }
    }
    globalThis.fetch = async function (...args) {
        let requestUrl = null;
        try {
            const [resource, opts] = args;
            requestUrl =
                typeof resource === "string"
                    ? resource
                    : resource instanceof URL
                        ? resource.href
                        : typeof Request !== "undefined" && resource instanceof Request
                            ? resource.url
                            : null;
            if (!requestUrl) {
                return await realFetch.apply(this, args);
            }
            const getFetchArgs = (nextUrl) => {
                if (typeof resource === "string" || resource instanceof URL) {
                    return [nextUrl, opts];
                }
                if (typeof Request !== "undefined" && resource instanceof Request) {
                    return [new Request(nextUrl, resource), opts];
                }
                return args;
            };
            let url = requestUrl.trimEnd();
            const responseInit = (response) => ({
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            });
            const shouldBlockCachedAdSegments = Boolean(__TTVAB_STATE__.CurrentAdMediaKey ||
                __TTVAB_STATE__.CurrentAdChannel ||
                __TTVAB_STATE__.SimulatedAdsDepth > 0);
            if (typeof _$kas === "function" &&
                _$kas(url, {
                    includeCached: shouldBlockCachedAdSegments,
                })) {
                return await realFetch(EMPTY_SEGMENT_URL);
            }
            const playbackContext = _getPlaybackContextFromUsherUrl(url);
            if (playbackContext?.MediaKey) {
                __TTVAB_STATE__.V2API = url.includes("/api/v2/");
                const logTarget = playbackContext.MediaType === "vod"
                    ? `vod ${playbackContext.VodID}`
                    : playbackContext.ChannelName;
                if (__TTVAB_STATE__.ForceAccessTokenPlayerType) {
                    const urlObj = new URL(url);
                    urlObj.searchParams.delete("parent_domains");
                    url = urlObj.toString();
                }
                const response = await realFetch.apply(this, getFetchArgs(url));
                if (response.status !== 200)
                    return response;
                const encodings = await response.text();
                const serverTime = _$gt(encodings);
                try {
                    let info = __TTVAB_STATE__.StreamInfos[playbackContext.MediaKey];
                    const isNewInfo = !info?.EncodingsM3U8;
                    if (isNewInfo) {
                        _$ps();
                        info = __TTVAB_STATE__.StreamInfos[playbackContext.MediaKey] =
                            _createStreamInfo(playbackContext);
                    }
                    else {
                        info.MediaType = playbackContext.MediaType;
                        info.MediaKey = playbackContext.MediaKey;
                        info.ChannelName = playbackContext.ChannelName;
                        info.VodID = playbackContext.VodID;
                    }
                    _$si(info, encodings, url);
                    info.LastActivityAt = Date.now();
                    if (isNewInfo) {
                        _$l(`Stream initialized: ${logTarget}`, "success");
                    }
                    const playlist = info.IsUsingModifiedM3U8
                        ? info.ModifiedM3U8
                        : info.EncodingsM3U8;
                    return new Response(_$rt(playlist, serverTime), responseInit(response));
                }
                catch (err) {
                    _$l(`Master playlist processing failed for ${logTarget}: ${err?.message ?? String(err)}`, "error");
                    return new Response(encodings, responseInit(response));
                }
            }
            if (/\.m3u8(?:$|\?)/.test(url)) {
                const response = await realFetch.apply(this, getFetchArgs(url));
                if (response.status === 200) {
                    const text = await response.text();
                    try {
                        return new Response(await _$pm(url, text, realFetch), responseInit(response));
                    }
                    catch (err) {
                        if (err?.name !== "AbortError") {
                            _$l(`Media playlist processing failed for ${url}: ${err?.message ?? String(err)}`, "error");
                        }
                        return new Response(text, responseInit(response));
                    }
                }
                return response;
            }
            return await realFetch.apply(this, args);
        }
        catch (e) {
            const safeUrl = typeof requestUrl === "string" ? requestUrl.trimEnd() : null;
            const isPlaybackRequest = Boolean((safeUrl && _getPlaybackContextFromUsherUrl(safeUrl)?.MediaKey) ||
                (safeUrl && /\.m3u8(?:$|\?)/.test(safeUrl)));
            const errorMessage = typeof e?.message === "string" ? e.message : String(e);
            const isExpectedCancellation = e?.name === "AbortError" ||
                /request cancel(?:ed|led)|cancel(?:ed|led)/i.test(errorMessage);
            if (isPlaybackRequest && !isExpectedCancellation) {
                _$l(`Worker fetch wrapper failed for ${safeUrl}: ${errorMessage}`, "error");
            }
            throw e;
        }
    };
}
function _$sd() {
    try {
        const deviceId = localStorage.getItem("unique_id");
        if (typeof deviceId === "string" &&
            deviceId &&
            /^[a-f0-9]{8,64}$/i.test(deviceId)) {
            __TTVAB_STATE__.GQLDeviceID = deviceId;
            return deviceId;
        }
        if (typeof deviceId === "string" && deviceId) {
            _$l("Rejected invalid unique_id format", "debug");
        }
    }
    catch (e) {
        _$l(`Device ID sync error: ${e.message}`, "warning");
    }
    return null;
}
function _hookRevokeObjectURL() {
    if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
        const originalRevoke = URL.revokeObjectURL;
        URL.revokeObjectURL = function (url) {
            if (typeof url === "string" &&
                url.startsWith("blob:") &&
                _trackedExtensionBlobUrls.has(url)) {
                _trackedExtensionBlobUrls.delete(url);
                setTimeout(() => {
                    try {
                        originalRevoke.call(this, url);
                    }
                    catch { }
                }, 3500);
            }
            else {
                originalRevoke.call(this, url);
            }
        };
    }
}
const HW_MAX_RESTART = 3;
const HW_WATCHDOG_INTERVAL_MS = 5000;
const HW_PONG_TIMEOUT_MS = 15000;
const HW_RECOVERY_COOLDOWN_MS = 30000;
let _lastWorkerRecoveryReloadAt = 0;
const pruneTrackedWorkers = (excludedWorkers = []) => {
    const excluded = new Set(excludedWorkers.filter(Boolean));
    const aliveWorkers = [];
    const seenWorkers = new Set();
    for (const worker of _$s.workers) {
        if (!worker || excluded.has(worker) || seenWorkers.has(worker)) {
            continue;
        }
        if (worker.__TTVABIntentionallyTerminated || worker.__TTVABCrashed) {
            continue;
        }
        aliveWorkers.push(worker);
        seenWorkers.add(worker);
    }
    _$s.workers = aliveWorkers;
};
function _isPlaybackContextMismatch(expectedContext, currentContext) {
    const normalizedExpectedContext = _normalizePlaybackContext(expectedContext);
    const normalizedCurrentContext = _normalizePlaybackContext(currentContext);
    if (normalizedExpectedContext.MediaKey) {
        return (normalizedCurrentContext.MediaKey !== normalizedExpectedContext.MediaKey);
    }
    if (normalizedExpectedContext.ChannelName) {
        return (normalizedCurrentContext.ChannelName !==
            normalizedExpectedContext.ChannelName);
    }
    return false;
}
function _attemptWorkerRestart(worker, pagePlaybackContext) {
    if (!worker || worker.__TTVABIntentionallyTerminated)
        return;
    if (worker.__TTVABRestartAttempts >= HW_MAX_RESTART) {
        _$l("Worker restart limit reached", "error");
        return;
    }
    worker.__TTVABRestartAttempts++;
    const delay = 2 ** worker.__TTVABRestartAttempts * 500;
    _$l("Recovering worker in " +
        delay / 1000 +
        "s (attempt " +
        worker.__TTVABRestartAttempts +
        "/" +
        HW_MAX_RESTART +
        ")", "warning");
    setTimeout(() => {
        if (worker.__TTVABIntentionallyTerminated)
            return;
        const currentContext = _getPlaybackContextFromUrl(window.location.href);
        if (_isPlaybackContextMismatch(pagePlaybackContext, currentContext)) {
            _$l("Skipping stale worker recovery after navigation", "info");
            return;
        }
        if (typeof _$dpt !== "function") {
            _$l("Worker recovery unavailable (no player task)", "error");
            return;
        }
        const now = Date.now();
        if (now - _lastWorkerRecoveryReloadAt < HW_RECOVERY_COOLDOWN_MS) {
            _$l("Skipping worker recovery reload (cooldown)", "info");
            return;
        }
        _lastWorkerRecoveryReloadAt = now;
        try {
            _$dpt(false, true, {
                reason: "worker-recovery",
                refreshAccessToken: true,
                newMediaPlayerInstance: true,
            });
            _$l("Player reloaded to recover crashed worker", "success");
        }
        catch (recoveryErr) {
            _$l(`Worker recovery failed: ${recoveryErr.message}`, "error");
        }
    }, delay);
}
let _workerWatchdogID = null;
function _startWorkerWatchdog() {
    if (_workerWatchdogID !== null)
        return;
    _workerWatchdogID = setInterval(() => {
        const now = Date.now();
        for (const worker of _$s.workers) {
            if (!worker || worker.__TTVABIntentionallyTerminated)
                continue;
            if (worker.__TTVABCrashed)
                continue;
            const lastSeen = worker.__TTVABLastPongAt || worker.__TTVABCreatedAt || now;
            if (now - lastSeen > HW_PONG_TIMEOUT_MS) {
                worker.__TTVABCrashed = true;
                _$l("Worker unresponsive (no pong)", "warning");
                pruneTrackedWorkers([worker]);
                _attemptWorkerRestart(worker, {
                    MediaType: __TTVAB_STATE__?.PageMediaType || "channel",
                    ChannelName: __TTVAB_STATE__?.PageChannel || "",
                    VodID: __TTVAB_STATE__?.PageVodID || "",
                    MediaKey: __TTVAB_STATE__?.PageMediaKey || "",
                });
                continue;
            }
            try {
                _postWorkerBridgeMessage(worker, { key: "Ping", value: null });
            }
            catch { }
        }
    }, HW_WATCHDOG_INTERVAL_MS);
    _$l("Worker watchdog started", "info");
}
function _installPageSideM3U8Override() {
    if (window.__TTVAB_M3U8_FALLBACK_ACTIVE)
        return;
    window.__TTVAB_M3U8_FALLBACK_ACTIVE = true;
    _$l("Installing page-side M3U8 fetch override (degraded mode)", "warning");
    const realFetch = window.fetch;
    if (!window.__TTVAB_REAL_FETCH__) {
        window.__TTVAB_REAL_FETCH__ = realFetch;
    }
    window.fetch = async function (...args) {
        const [urlOrRequest] = args;
        const urlStr = urlOrRequest instanceof Request
            ? urlOrRequest.url
            : String(urlOrRequest || "");
        const isM3U8 = /\.m3u8(?:$|\?)/.test(urlStr) &&
            (urlStr.includes("twitch") ||
                urlStr.includes("ttvnw.net") ||
                urlStr.includes("twitchcdn.net"));
        if (!isM3U8) {
            return realFetch.apply(this, args);
        }
        try {
            const response = await realFetch.apply(this, args);
            if (response.status !== 200)
                return response;
            const cloned = response.clone();
            const text = await cloned.text();
            if (!_hasTwitchAdMetadata(text))
                return response;
            const stripped = _stripM3U8Ads(text);
            if (stripped === text)
                return response;
            _$l("Page-side fallback: stripped ads from M3U8", "info");
            return new Response(stripped, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            });
        }
        catch {
            return realFetch.apply(this, args);
        }
    };
}
function _hasTwitchAdMetadata(text) {
    return text.includes("stitched-ad");
}
function _stripM3U8Ads(text) {
    const lines = text.split("\n");
    const out = [];
    let inAd = false;
    let discontinuityCount = 0;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#EXT-X-DATERANGE") &&
            trimmed.includes("stitched-ad")) {
            inAd = true;
            discontinuityCount = 0;
            continue;
        }
        if (trimmed.startsWith("#EXT-X-DISCONTINUITY")) {
            if (inAd) {
                discontinuityCount++;
                if (discontinuityCount >= 2) {
                    inAd = false;
                }
                continue;
            }
        }
        if (inAd) {
            continue;
        }
        out.push(line);
    }
    return out.join("\n");
}
function _$hw() {
    _$sd();
    if (typeof window?.Worker !== "function") {
        return;
    }
    const isAllowedWorkerHost = (hostname) => {
        const host = String(hostname || "").toLowerCase();
        return (host === "twitch.tv" ||
            host.endsWith(".twitch.tv") ||
            host === "ttvnw.net" ||
            host.endsWith(".ttvnw.net") ||
            host === "twitchcdn.net" ||
            host.endsWith(".twitchcdn.net"));
    };
    const normalizeWorkerUrl = (url) => {
        if (url instanceof URL)
            return url.href;
        return new URL(String(url), window.location.href).href;
    };
    const isTwitchWorkerUrl = (workerUrl) => {
        const parsed = new URL(workerUrl);
        if (isAllowedWorkerHost(parsed.hostname)) {
            return true;
        }
        if (parsed.protocol === "blob:") {
            const pageHost = window.location.hostname;
            return (isAllowedWorkerHost(pageHost) &&
                parsed.origin === window.location.origin);
        }
        return false;
    };
    const createHookedWorkerConstructor = (BaseWorker) => {
        const reinsertNames = _$gr(BaseWorker);
        const HookedWorker = class Worker extends _$cw(BaseWorker) {
            constructor(url, opts) {
                let isTwitch = false;
                let workerSourceUrl = null;
                try {
                    workerSourceUrl = normalizeWorkerUrl(url);
                    isTwitch = isTwitchWorkerUrl(workerSourceUrl);
                }
                catch {
                    isTwitch = false;
                }
                if (!isTwitch) {
                    super(url, opts);
                    return;
                }
                const pagePlaybackContext = _syncPagePlaybackContext({
                    broadcast: false,
                });
                const injectedCode = `
            (function() {
                ${_$wj.toString()}
                const wasmSource = _$wj(${JSON.stringify(workerSourceUrl)});
                const _$c = ${JSON.stringify(_$c)};
                const _$s = ${JSON.stringify(_$s)};
                const _$ar = ${_$ar.toString()};
                const _$amr = ${_$amr.toString()};
                ${_$l.toString()}
                ${_createWorkerBridgeMessage.toString()}
                ${_getWorkerBridgeMessage.toString()}
                ${_postWorkerBridgeMessage.toString()}
                ${_$ds.toString()}
                ${_getPageScopedPlaybackEventContext.toString()}
                ${_createPageScopedWorkerEvent.toString()}
                ${_$ab.toString()}
                ${_normalizeChannelName.toString()}
                ${_normalizeVodID.toString()}
                ${_buildMediaKey.toString()}
                ${_normalizeMediaKey.toString()}
                ${_normalizePlaybackContext.toString()}
                ${_getPlaybackContextFromUrl.toString()}
                ${_getPlaybackContextFromUsherUrl.toString()}
                ${_$pa.toString()}
                ${_$gt.toString()}
                ${_$rt.toString()}
                ${_$hem.toString()}
                ${_isExplicitKnownAdSegmentUrl.toString()}
                ${_$kas.toString()}
                ${_getTaggedPlaylistUri.toString()}
                ${_isMediaPartLine.toString()}
                ${_isPartPreloadHintLine.toString()}
                ${_$plka.toString()}
                ${_$pka.toString()}
                ${_absolutizePlaylistUrl.toString()}
                ${_absolutizeMediaPlaylistUrls.toString()}
                ${_$sa.toString()}
                ${_extractPlaylistHeaders.toString()}
                ${_$sv.toString()}
                ${_replaceOrAppendStreamInfAttribute.toString()}
                ${_$su.toString()}
                ${_getSortedResolutionList.toString()}
                ${_getResolutionByQualityGroup.toString()}
                ${_$gfr.toString()}
                ${_getPlaylistUrlAliases.toString()}
                ${_collectPlaybackAccessTokenSources.toString()}
                ${_summarizePlaybackAccessTokenPayload.toString()}
                ${_getPlaybackAccessTokenErrors.toString()}
                ${_extractPlaybackAccessToken.toString()}
                ${_isWorkerContext.toString()}
                ${_createFetchRelayResponse.toString()}
                ${_fetchViaWorkerBridge.toString()}
                ${_$tk.toString()}
                ${_notifyAdComplete.toString()}
                ${_getResolvedAdEndMinCleanPlaylists.toString()}
                ${_getResolvedAdEndGraceMs.toString()}
                ${_getResolvedAdEndMaxWaitMs.toString()}
                ${_getResolvedAdEndBackupHoldMaxMs.toString()}
                ${_getResolvedSilentBackupHoldMaxMs.toString()}
                ${_getPostAdReentryContinuationMs.toString()}
                ${_rememberLastAdEnd.toString()}
                ${_doesPlaybackContextMatchInfo.toString()}
                ${_isRecentPostAdReentry.toString()}
                ${_getBackupPlayerRetryCooldownMs.toString()}
                ${_forceClearBackupCooldownsIfStale.toString()}
                ${_markBackupPlayerRetryCooldown.toString()}
                ${_clearBackupPlayerRetryCooldown.toString()}
                ${_isBackupPlayerRetryCoolingDown.toString()}
                ${_getPinnedBackupPlayerTypeForInfo.toString()}
                ${_getOrderedBackupPlayerTypes.toString()}
                ${_resolvePlaybackResolutionForUrl.toString()}
                ${_isAdEndStable.toString()}
                ${_resetNativeRecoveryReadyState.toString()}
                ${_markNativeRecoveryProbeFailed.toString()}
                ${_markNativeRecoveryReady.toString()}
                ${_$rsa.toString()}
                ${_shouldReloadNativePlayerAfterAdReset.toString()}
                ${_$gsi.toString()}
                ${_getSyntheticPlaybackContextForPlaylist.toString()}
                ${_createStreamInfo.toString()}
                ${_createSyntheticStreamInfo.toString()}
                ${_buildUsherPlaybackUrl.toString()}
                ${_$hpa.toString()}
                ${_playlistHasMediaSegments.toString()}
                ${_$im.toString()}
                ${_parsePlaylistFirstMediaSequence.toString()}
                ${_parsePlaylistDiscontinuitySequence.toString()}
                ${_setPlaylistDiscontinuitySequence.toString()}
                ${_insertBoundaryDiscontinuity.toString()}
                ${_applyBackupSpliceBridge.toString()}
                ${_getNativeRecoveryProbePlayerType.toString()}
                ${_canReloadNativePlayerAfterAd.toString()}
                ${_getFallbackPromotionPolicy.toString()}
                ${_fetchWithTimeout.toString()}
                ${_processM3U8Core.toString()}
                ${_$pm.toString()}
                ${_getResolvedLqHqHoldMinMs.toString()}
                ${_shouldTryAutoplayFirst.toString()}
                ${_$fb.toString()}
                ${_$wf.toString()}
                
                const _$gu = '${_$gu}';
                _$ds(self);
                __TTVAB_STATE__.GQLDeviceID = ${JSON.stringify(__TTVAB_STATE__.GQLDeviceID)};
                __TTVAB_STATE__.AuthorizationHeader = ${JSON.stringify(__TTVAB_STATE__.AuthorizationHeader)};
                __TTVAB_STATE__.ClientIntegrityHeader = ${JSON.stringify(__TTVAB_STATE__.ClientIntegrityHeader)};
                __TTVAB_STATE__.ClientVersion = ${JSON.stringify(__TTVAB_STATE__.ClientVersion)};
                __TTVAB_STATE__.ClientSession = ${JSON.stringify(__TTVAB_STATE__.ClientSession)};
                __TTVAB_STATE__.PlaybackAccessTokenHash = ${JSON.stringify(__TTVAB_STATE__.PlaybackAccessTokenHash)};
                __TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType = ${JSON.stringify(__TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType)};
                __TTVAB_STATE__.CurrentAdChannel = ${JSON.stringify(__TTVAB_STATE__.CurrentAdChannel)};
                __TTVAB_STATE__.CurrentAdMediaKey = ${JSON.stringify(__TTVAB_STATE__.CurrentAdMediaKey)};
                __TTVAB_STATE__.LastAdEndedAt = ${JSON.stringify(__TTVAB_STATE__.LastAdEndedAt)};
                __TTVAB_STATE__.LastAdEndedChannel = ${JSON.stringify(__TTVAB_STATE__.LastAdEndedChannel)};
                __TTVAB_STATE__.LastAdEndedMediaKey = ${JSON.stringify(__TTVAB_STATE__.LastAdEndedMediaKey)};
                __TTVAB_STATE__.PinnedBackupPlayerType = ${JSON.stringify(__TTVAB_STATE__.PinnedBackupPlayerType)};
                __TTVAB_STATE__.LastPinnedBackupPlayerType = ${JSON.stringify(__TTVAB_STATE__.LastPinnedBackupPlayerType)};
                __TTVAB_STATE__.PinnedBackupPlayerChannel = ${JSON.stringify(__TTVAB_STATE__.PinnedBackupPlayerChannel)};
                __TTVAB_STATE__.PinnedBackupPlayerMediaKey = ${JSON.stringify(__TTVAB_STATE__.PinnedBackupPlayerMediaKey)};
                __TTVAB_STATE__.IsAdStrippingEnabled = ${JSON.stringify(__TTVAB_STATE__.IsAdStrippingEnabled)};
                __TTVAB_STATE__.DisableAdSpoofing = ${JSON.stringify(__TTVAB_STATE__.DisableAdSpoofing)};
                __TTVAB_STATE__.DisableAutoplayBackup = ${JSON.stringify(__TTVAB_STATE__.DisableAutoplayBackup)};
                __TTVAB_STATE__.PageMediaType = ${JSON.stringify(pagePlaybackContext.MediaType)};
                __TTVAB_STATE__.PageChannel = ${JSON.stringify(pagePlaybackContext.ChannelName)};
                __TTVAB_STATE__.PageVodID = ${JSON.stringify(pagePlaybackContext.VodID)};
                __TTVAB_STATE__.PageMediaKey = ${JSON.stringify(pagePlaybackContext.MediaKey)};
                __TTVAB_STATE__.PreferredQualityGroup = ${JSON.stringify(__TTVAB_STATE__.PreferredQualityGroup)};
                __TTVAB_STATE__.PlayerHasPlayedOnce = ${JSON.stringify(__TTVAB_STATE__.PlayerHasPlayedOnce)};
                __TTVAB_STATE__.PlayerIsPlaying = ${JSON.stringify(__TTVAB_STATE__.PlayerIsPlaying)};

                self.addEventListener('message', function(e) {
                    const data = _getWorkerBridgeMessage(e.data);
                    if (!data) return;
                    e.stopImmediatePropagation?.();
                    switch (data.key) {
                        case 'UpdateClientVersion': __TTVAB_STATE__.ClientVersion = data.value; break;
                        case 'UpdateClientSession': __TTVAB_STATE__.ClientSession = data.value; break;
                        case 'UpdateDeviceId': __TTVAB_STATE__.GQLDeviceID = data.value; break;
                        case 'UpdateClientIntegrityHeader': __TTVAB_STATE__.ClientIntegrityHeader = data.value; break;
                        case 'UpdateAuthorizationHeader': __TTVAB_STATE__.AuthorizationHeader = data.value; break;
                        case 'UpdateToggleState': __TTVAB_STATE__.IsAdStrippingEnabled = data.value; break;
                        case 'UpdateAdSpoofingState': __TTVAB_STATE__.DisableAdSpoofing = data.value === true; break;
                        case 'UpdateAutoplayBackupState': __TTVAB_STATE__.DisableAutoplayBackup = data.value === true; break;
                        case 'UpdateAdsBlocked': _$s.adsBlocked = data.value; break;
                        case 'UpdateGQLHash': __TTVAB_STATE__.PlaybackAccessTokenHash = data.value; break;
                        case 'UpdateLastNativePlaybackAccessTokenPlayerType': __TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType = data.value; break;
                        case 'UpdatePlayerHasPlayedOnce': __TTVAB_STATE__.PlayerHasPlayedOnce = data.value === true; break;
                        case 'UpdatePlayerIsPlaying': __TTVAB_STATE__.PlayerIsPlaying = data.value === true; break;
                        case 'Ping': _postWorkerBridgeMessage(self, { key: 'Pong', value: null }); break;
                        case 'UpdatePageContext':
                            {
                                const nextPageContext = _normalizePlaybackContext(data.value);
                                __TTVAB_STATE__.PageMediaType = nextPageContext.MediaType;
                                __TTVAB_STATE__.PageChannel = nextPageContext.ChannelName;
                                __TTVAB_STATE__.PageVodID = nextPageContext.VodID;
                                __TTVAB_STATE__.PageMediaKey = nextPageContext.MediaKey;
                                const pendingReloadMediaKey = _normalizeMediaKey(
                                    __TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey,
                                );
                                const pendingReloadChannel = _normalizeChannelName(
                                    __TTVAB_STATE__.PendingTriggeredPlayerReloadChannel,
                                );
                                if (
                                    (pendingReloadMediaKey &&
                                        pendingReloadMediaKey !== nextPageContext.MediaKey) ||
                                    (!pendingReloadMediaKey &&
                                        pendingReloadChannel &&
                                        pendingReloadChannel !== nextPageContext.ChannelName)
                                ) {
                                    __TTVAB_STATE__.HasTriggeredPlayerReload = false;
                                    __TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
                                    __TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
                                    __TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
                                }
                            }
                            break;
                        case 'UpdatePreferredQualityGroup':
                            __TTVAB_STATE__.PreferredQualityGroup = data.value || null;
                            break;
                        case 'UpdateCurrentAdContext':
                            {
                                const nextAdContext = _normalizePlaybackContext(data.value);
                                __TTVAB_STATE__.CurrentAdChannel = nextAdContext.ChannelName;
                                __TTVAB_STATE__.CurrentAdMediaKey = nextAdContext.MediaKey;
                            }
                            break;
                        case 'UpdateLastAdEndContext':
                            {
                                const lastEndContext = _normalizePlaybackContext(data.value);
                                __TTVAB_STATE__.LastAdEndedAt = Math.max(0, Number(data.value?.endedAt) || 0);
                                __TTVAB_STATE__.LastAdEndedChannel = lastEndContext.ChannelName;
                                __TTVAB_STATE__.LastAdEndedMediaKey = lastEndContext.MediaKey;
                            }
                            break;
                        case 'UpdateCurrentAdChannel':
                            __TTVAB_STATE__.CurrentAdChannel = data.value || null;
                            __TTVAB_STATE__.CurrentAdMediaKey =
                                _buildMediaKey('live', data.value || null, null);
                            break;
                        case 'UpdatePinnedBackupPlayerType':
                            __TTVAB_STATE__.PinnedBackupPlayerType = data.value || null;
                            if (data.value) __TTVAB_STATE__.LastPinnedBackupPlayerType = data.value;
                            __TTVAB_STATE__.PinnedBackupPlayerChannel = data.channel || null;
                            __TTVAB_STATE__.PinnedBackupPlayerMediaKey =
                                _buildMediaKey('live', data.channel || null, null);
                            break;
                        case 'UpdatePinnedBackupPlayerContext':
                            {
                                const nextPinnedContext = _normalizePlaybackContext(data.value);
                                __TTVAB_STATE__.PinnedBackupPlayerType = data.value?.type || null;
                                if (data.value?.type) __TTVAB_STATE__.LastPinnedBackupPlayerType = data.value.type;
                                __TTVAB_STATE__.PinnedBackupPlayerChannel = nextPinnedContext.ChannelName;
                                __TTVAB_STATE__.PinnedBackupPlayerMediaKey = nextPinnedContext.MediaKey;
                            }
                            break;
                        case 'UpdateBackupSearchForceRefresh':
                            __TTVAB_STATE__.BackupSearchForceRefreshAt = Number(data.value) || 0;
                            break;
                        case 'ResetPlaybackRecoveryState':
                            __TTVAB_STATE__.HasTriggeredPlayerReload = false;
                            __TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
                            __TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
                            __TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
                            __TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
                            __TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
                            __TTVAB_STATE__.ShouldResumeAfterAd = false;
                            __TTVAB_STATE__.ShouldResumeAfterAdChannel = null;
                            __TTVAB_STATE__.ShouldResumeAfterAdMediaKey = null;
                            __TTVAB_STATE__.ShouldResumeAfterAdUntil = 0;
                            if (data.value?.clearAdContext) {
                                __TTVAB_STATE__.CurrentAdChannel = null;
                                __TTVAB_STATE__.CurrentAdMediaKey = null;
                                __TTVAB_STATE__.PinnedBackupPlayerType = null;
                                __TTVAB_STATE__.PinnedBackupPlayerChannel = null;
                                __TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
                                __TTVAB_STATE__.LastAdEndedAt = 0;
                                __TTVAB_STATE__.LastAdEndedChannel = null;
                                __TTVAB_STATE__.LastAdEndedMediaKey = null;
                            }
                            const prevMediaKey = data.value?.previousMediaKey || null;
                            if (prevMediaKey && typeof __TTVAB_STATE__.StreamInfos === "object") {
                                delete __TTVAB_STATE__.StreamInfos[prevMediaKey];
                            }
                            if (prevMediaKey && typeof __TTVAB_STATE__.StreamInfosByUrl === "object") {
                                for (const u in __TTVAB_STATE__.StreamInfosByUrl) {
                                    if (__TTVAB_STATE__.StreamInfosByUrl[u]?.MediaKey === prevMediaKey) {
                                        delete __TTVAB_STATE__.StreamInfosByUrl[u];
                                    }
                                }
                            }
                            break;
                        case 'FetchResponse':
                            {
                                const responseData = data.value;
                                const requestId = responseData?.id || null;
                                const pendingRequests = __TTVAB_STATE__.PendingFetchRequests;
                                if (!requestId || !pendingRequests?.has(requestId)) break;
                                const pendingRequest = pendingRequests.get(requestId);
                                pendingRequests.delete(requestId);
                                if (responseData?.error) {
                                    pendingRequest.reject(responseData.error);
                                } else {
                                    pendingRequest.resolve(responseData);
                                }
                            }
                            break;
                        case 'TriggeredPlayerReload':
                            {
                                const reloadContext = _normalizePlaybackContext(
                                    data.value || {
                                        mediaType: __TTVAB_STATE__.PageMediaType,
                                        channelName: __TTVAB_STATE__.PageChannel,
                                        vodID: __TTVAB_STATE__.PageVodID,
                                        mediaKey: __TTVAB_STATE__.PageMediaKey,
                                    },
                                );
                                __TTVAB_STATE__.HasTriggeredPlayerReload = true;
                                __TTVAB_STATE__.PendingTriggeredPlayerReloadChannel =
                                    reloadContext.ChannelName;
                                __TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey =
                                    reloadContext.MediaKey;
                                __TTVAB_STATE__.PendingTriggeredPlayerReloadAt = Date.now();
                            }
                            break;
                        default:
                            break;
                    }
                });
                
                _$wf();
                eval(wasmSource);
            })();
            `;
                const blobUrl = URL.createObjectURL(new Blob([injectedCode], { type: "text/javascript" }));
                _trackedExtensionBlobUrls.add(blobUrl);
                super(blobUrl, opts);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
                const _hbTimeout = setTimeout(() => {
                    if (this.__TTVABCrashed || this.__TTVABIntentionallyTerminated)
                        return;
                    _$l("Worker heartbeat missed — blob: injection likely failed; installing page-side M3U8 fallback", "warning");
                    try {
                        this.terminate();
                        this.__TTVABIntentionallyTerminated = true;
                    }
                    catch { }
                    pruneTrackedWorkers();
                    _installPageSideM3U8Override();
                }, 8000);
                this.addEventListener("message", (e) => {
                    const data = _getWorkerBridgeMessage(e.data);
                    if (data?.key === "Pong") {
                        clearTimeout(_hbTimeout);
                    }
                });
                try {
                    _postWorkerBridgeMessage(this, { key: "Ping", value: null });
                }
                catch { }
                const getCurrentPageContext = () => _getPlaybackContextFromUrl(window.location.href);
                const normalizeMessagePlaybackContext = (message) => _normalizePlaybackContext({
                    MediaKey: message?.mediaKey || message?.pageMediaKey || null,
                    ChannelName: message?.channel || message?.pageChannel || null,
                    VodID: message?.vodID || null,
                });
                const isPlaybackContextMismatch = (expectedContext, currentContext) => {
                    const normalizedExpectedContext = _normalizePlaybackContext(expectedContext);
                    const normalizedCurrentContext = _normalizePlaybackContext(currentContext);
                    if (normalizedExpectedContext.MediaKey) {
                        return (normalizedCurrentContext.MediaKey !==
                            normalizedExpectedContext.MediaKey);
                    }
                    if (normalizedExpectedContext.ChannelName) {
                        return (normalizedCurrentContext.ChannelName !==
                            normalizedExpectedContext.ChannelName);
                    }
                    return false;
                };
                const isStalePlaybackEvent = (message) => {
                    return isPlaybackContextMismatch(normalizeMessagePlaybackContext(message), getCurrentPageContext());
                };
                const handleWorkerFetchRequest = async (fetchRequest) => {
                    const rawFetch = window.__TTVAB_REAL_FETCH__ || window.fetch;
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000);
                    try {
                        const response = await rawFetch(fetchRequest?.url, {
                            ...(fetchRequest?.options || {}),
                            signal: controller.signal,
                        });
                        clearTimeout(timeoutId);
                        const body = await response.text();
                        return {
                            id: fetchRequest?.id || null,
                            status: response.status,
                            statusText: response.statusText,
                            ok: response.ok,
                            redirected: response.redirected,
                            type: response.type,
                            url: response.url,
                            headers: Object.fromEntries(response.headers.entries()),
                            body,
                        };
                    }
                    catch (error) {
                        clearTimeout(timeoutId);
                        return {
                            id: fetchRequest?.id || null,
                            error: error?.name === "AbortError"
                                ? "fetch relay timeout"
                                : error?.message || String(error),
                        };
                    }
                };
                this.addEventListener("message", (e) => {
                    const data = _getWorkerBridgeMessage(e.data);
                    if (!data)
                        return;
                    e.stopImmediatePropagation?.();
                    switch (data.key) {
                        case "FetchRequest":
                            void handleWorkerFetchRequest(data.value).then((responseData) => {
                                try {
                                    _postWorkerBridgeMessage(this, {
                                        key: "FetchResponse",
                                        value: responseData,
                                    });
                                }
                                catch { }
                            });
                            break;
                        case "Pong":
                            this.__TTVABLastPongAt = Date.now();
                            break;
                        case "AdBlocked":
                            if (isStalePlaybackEvent(data)) {
                                _$l(`Ignoring stale AdBlocked event for ${data.mediaKey || data.channel}`, "info");
                                break;
                            }
                            {
                                const reportedCount = Number.isFinite(data.count)
                                    ? Math.max(0, Math.trunc(data.count))
                                    : 0;
                                const reportedDelta = Number.isFinite(data.delta)
                                    ? Math.max(1, Math.trunc(data.delta))
                                    : 1;
                                const currentCount = Number.isFinite(_$s.adsBlocked)
                                    ? Math.max(0, Math.trunc(_$s.adsBlocked))
                                    : 0;
                                const nextCount = reportedCount > currentCount
                                    ? reportedCount
                                    : currentCount + reportedDelta;
                                _$s.adsBlocked = nextCount;
                            }
                            {
                                const detail = {
                                    count: _$s.adsBlocked,
                                    delta: Number.isFinite(data.delta)
                                        ? Math.max(1, Math.trunc(data.delta))
                                        : 1,
                                    channel: data.channel || null,
                                    mediaKey: data.mediaKey || null,
                                    pageChannel: data.pageChannel || null,
                                    pageMediaKey: data.pageMediaKey || null,
                                };
                                _emitInternalMessage("ttvab-ad-blocked", detail);
                                _sendBridgeMessage("ttvab-ad-blocked", detail);
                            }
                            _$l(`Ad blocked! Total: ${_$s.adsBlocked}`, "success");
                            break;
                        case "AdDetected":
                            if (isStalePlaybackEvent(data)) {
                                _$l(`Ignoring stale AdDetected event for ${data.mediaKey || data.channel}`, "info");
                                break;
                            }
                            {
                                const now = Date.now();
                                const isContinuation = data.continued === true;
                                const detectedContext = _normalizePlaybackContext({
                                    MediaType: __TTVAB_STATE__.PageMediaType,
                                    ChannelName: data.channel || __TTVAB_STATE__.CurrentAdChannel || null,
                                    VodID: __TTVAB_STATE__.PageVodID,
                                    MediaKey: data.mediaKey ||
                                        __TTVAB_STATE__.CurrentAdMediaKey ||
                                        __TTVAB_STATE__.PageMediaKey,
                                });
                                const channel = detectedContext.ChannelName;
                                const mediaKey = detectedContext.MediaKey;
                                const shouldStartNewCycle = isContinuation
                                    ? false
                                    : !__TTVAB_STATE__.CurrentAdMediaKey ||
                                        __TTVAB_STATE__.CurrentAdMediaKey !== mediaKey ||
                                        now - (__TTVAB_STATE__.LastAdDetectedAt || 0) >
                                            __TTVAB_STATE__.AdCycleStaleMs;
                                if (shouldStartNewCycle) {
                                    if (typeof _clearPlaybackRecoveryTimeouts === "function") {
                                        _clearPlaybackRecoveryTimeouts();
                                    }
                                    __TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
                                    __TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
                                    if (typeof _$rpfa === "function") {
                                        _$rpfa(channel, mediaKey);
                                    }
                                }
                                else if (isContinuation &&
                                    typeof _$rpfa === "function") {
                                    const cooldownMs = __TTVAB_STATE__?.AdRecoveryReloadCooldownMs || 10000;
                                    const lastReload = Math.max(0, Number(__TTVAB_STATE__?.LastAdRecoveryReloadAt) || 0);
                                    if (lastReload <= 0 || now - lastReload >= cooldownMs) {
                                        _$rpfa(channel, mediaKey);
                                    }
                                }
                                __TTVAB_STATE__.CurrentAdChannel = channel;
                                __TTVAB_STATE__.CurrentAdMediaKey = mediaKey;
                                __TTVAB_STATE__.LastAdDetectedAt = now;
                            }
                            _$bw({
                                key: "UpdateCurrentAdContext",
                                value: {
                                    channelName: __TTVAB_STATE__.CurrentAdChannel,
                                    mediaKey: __TTVAB_STATE__.CurrentAdMediaKey,
                                },
                            });
                            if (typeof _ensurePlaybackMonitorsRunning === "function") {
                                _ensurePlaybackMonitorsRunning(true);
                            }
                            _$l(data.continued === true
                                ? "Ad recovery continuing after native reload"
                                : "Ad detected, blocking...", "warning");
                            break;
                        case "BackupPlayerTypeSelected": {
                            if (isStalePlaybackEvent(data)) {
                                _$l(`Ignoring stale backup selection for ${data.mediaKey || data.channel}`, "info");
                                break;
                            }
                            const nextPinnedType = data.value || null;
                            const nextPinnedContext = _normalizePlaybackContext({
                                MediaType: __TTVAB_STATE__.PageMediaType,
                                ChannelName: data.channel || __TTVAB_STATE__.CurrentAdChannel || null,
                                VodID: __TTVAB_STATE__.PageVodID,
                                MediaKey: data.mediaKey ||
                                    __TTVAB_STATE__.CurrentAdMediaKey ||
                                    __TTVAB_STATE__.PageMediaKey,
                            });
                            if (__TTVAB_STATE__.PinnedBackupPlayerType === nextPinnedType &&
                                __TTVAB_STATE__.PinnedBackupPlayerChannel ===
                                    nextPinnedContext.ChannelName &&
                                __TTVAB_STATE__.PinnedBackupPlayerMediaKey ===
                                    nextPinnedContext.MediaKey) {
                                break;
                            }
                            if (nextPinnedType && nextPinnedType !== "autoplay") {
                                __TTVAB_STATE__.PinnedBackupPlayerType = nextPinnedType;
                                __TTVAB_STATE__.LastPinnedBackupPlayerType = nextPinnedType;
                            }
                            __TTVAB_STATE__.PinnedBackupPlayerChannel =
                                nextPinnedContext.ChannelName;
                            __TTVAB_STATE__.PinnedBackupPlayerMediaKey =
                                nextPinnedContext.MediaKey;
                            if (typeof _suppressPauseIntent === "function") {
                                _suppressPauseIntent(nextPinnedContext.ChannelName, nextPinnedContext.MediaKey, 3000);
                            }
                            if (typeof _suppressCompetingMediaDuringAd === "function") {
                                _suppressCompetingMediaDuringAd(nextPinnedContext.ChannelName, nextPinnedContext.MediaKey);
                                _schedulePlaybackRecoveryTimeout(() => _suppressCompetingMediaDuringAd(nextPinnedContext.ChannelName, nextPinnedContext.MediaKey), 120, nextPinnedContext.ChannelName, nextPinnedContext.MediaKey);
                            }
                            if (typeof _resumeActivePlayerIfPaused === "function") {
                                _schedulePlaybackRecoveryTimeout(() => _resumeActivePlayerIfPaused(nextPinnedContext.ChannelName, nextPinnedContext.MediaKey), 180, nextPinnedContext.ChannelName, nextPinnedContext.MediaKey);
                                _schedulePlaybackRecoveryTimeout(() => _resumeActivePlayerIfPaused(nextPinnedContext.ChannelName, nextPinnedContext.MediaKey), 650, nextPinnedContext.ChannelName, nextPinnedContext.MediaKey);
                            }
                            _$bw({
                                key: "UpdatePinnedBackupPlayerContext",
                                value: {
                                    type: __TTVAB_STATE__.PinnedBackupPlayerType,
                                    channelName: __TTVAB_STATE__.PinnedBackupPlayerChannel,
                                    mediaKey: __TTVAB_STATE__.PinnedBackupPlayerMediaKey,
                                },
                            });
                            _$l(`Pinned backup type: ${data.value}`, "info");
                            break;
                        }
                        case "AdEnded":
                            if (isStalePlaybackEvent(data)) {
                                _$l(`Ignoring stale AdEnded event for ${data.mediaKey || data.channel}`, "info");
                                break;
                            }
                            {
                                const channel = data.channel || __TTVAB_STATE__.CurrentAdChannel || null;
                                const mediaKey = data.mediaKey || __TTVAB_STATE__.CurrentAdMediaKey || null;
                                const endedAt = Math.max(0, Number(data.endedAt) || Date.now());
                                const endedContext = _normalizePlaybackContext({
                                    MediaType: __TTVAB_STATE__.PageMediaType,
                                    ChannelName: channel,
                                    VodID: __TTVAB_STATE__.PageVodID,
                                    MediaKey: mediaKey,
                                });
                                __TTVAB_STATE__.LastAdEndedAt = endedAt;
                                __TTVAB_STATE__.LastAdEndedChannel = endedContext.ChannelName;
                                __TTVAB_STATE__.LastAdEndedMediaKey = endedContext.MediaKey;
                                __TTVAB_STATE__.CurrentAdChannel = null;
                                __TTVAB_STATE__.CurrentAdMediaKey = null;
                                __TTVAB_STATE__.PinnedBackupPlayerType = null;
                                __TTVAB_STATE__.PinnedBackupPlayerChannel = null;
                                __TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
                                if (typeof _clearPlaybackRecoveryTimeouts === "function") {
                                    _clearPlaybackRecoveryTimeouts();
                                }
                                _$bw({
                                    key: "UpdateCurrentAdContext",
                                    value: null,
                                });
                                _$bw({
                                    key: "UpdatePinnedBackupPlayerContext",
                                    value: null,
                                });
                                _$bw({
                                    key: "UpdateLastAdEndContext",
                                    value: {
                                        mediaType: endedContext.MediaType,
                                        channelName: endedContext.ChannelName,
                                        vodID: endedContext.VodID,
                                        mediaKey: endedContext.MediaKey,
                                        endedAt,
                                    },
                                });
                                if (typeof _resetPlayerBufferMonitorState === "function") {
                                    _resetPlayerBufferMonitorState();
                                }
                                if (typeof _$cari === "function") {
                                    _$cari();
                                }
                                __TTVAB_STATE__._AdRecoveryConsecutiveFailures = 0;
                                _$l("Ad ended", "success");
                                const isHoldingBackup = data.holdingBackup === true;
                                if (!isHoldingBackup &&
                                    typeof _restoreSuppressedMediaAfterAd === "function") {
                                    _restoreSuppressedMediaAfterAd(channel, mediaKey);
                                }
                                _schedulePostAdArtifactCleanup(channel, mediaKey);
                            }
                            break;
                        case "NativePlaybackRestored":
                            if (isStalePlaybackEvent(data)) {
                                _$l(`Ignoring stale native restore event for ${data.mediaKey || data.channel}`, "info");
                                break;
                            }
                            {
                                const channel = data.channel || __TTVAB_STATE__.LastAdEndedChannel || null;
                                const mediaKey = data.mediaKey || __TTVAB_STATE__.LastAdEndedMediaKey || null;
                                const requiresReload = data.requiresReload === true;
                                _$l(requiresReload
                                    ? "Native playback restored after backup hold; reloading player"
                                    : "Native playback restored after backup hold", "success");
                                if (typeof _restoreSuppressedMediaAfterAd === "function") {
                                    _restoreSuppressedMediaAfterAd(channel, mediaKey);
                                }
                                if (typeof _$dpt === "function") {
                                    if (requiresReload) {
                                        _$dpt(false, true, {
                                            reason: "post-ad-native-restore",
                                            refreshAccessToken: true,
                                            newMediaPlayerInstance: true,
                                        });
                                    }
                                    else {
                                        _$dpt(true, false, {
                                            reason: "post-ad-native-restore",
                                        });
                                    }
                                }
                                _schedulePostAdArtifactCleanup(channel, mediaKey);
                            }
                            break;
                        case "PauseResumePlayer":
                            _$l("Resuming player", "info");
                            if (typeof _$dpt === "function") {
                                _$dpt(true, false);
                            }
                            break;
                        case "ReloadPlayer":
                            if (isStalePlaybackEvent(data)) {
                                _$l(`Ignoring stale ReloadPlayer event for ${data.mediaKey || data.channel}`, "info");
                                break;
                            }
                            _$l("Reloading player", "info");
                            if (typeof _clearPlaybackRecoveryTimeouts === "function") {
                                _clearPlaybackRecoveryTimeouts();
                            }
                            if (typeof _$cari === "function") {
                                _$cari();
                            }
                            if (typeof _$dpt === "function") {
                                const reloadReason = typeof data.reason === "string" && data.reason
                                    ? data.reason
                                    : "ad-recovery";
                                _$dpt(false, true, {
                                    reason: reloadReason,
                                    refreshAccessToken: data.refreshAccessToken !== false,
                                    newMediaPlayerInstance: data.newMediaPlayerInstance !== false,
                                });
                            }
                            break;
                        default:
                            break;
                    }
                });
                const _workerUrl = url;
                const workerOpts = opts;
                this.__TTVABWorkerUrl = _workerUrl;
                this.__TTVABWorkerOpts = workerOpts;
                this.addEventListener("error", (e) => {
                    if (this.__TTVABIntentionallyTerminated)
                        return;
                    if (this.__TTVABCrashed)
                        return;
                    this.__TTVABCrashed = true;
                    _$l(`Worker crashed: ${e.message || "Unknown error"}`, "error");
                    pruneTrackedWorkers([this]);
                    _attemptWorkerRestart(this, pagePlaybackContext);
                });
                this.__TTVABCreatedAt = Date.now();
                this.__TTVABLastPongAt = Date.now();
                this.__TTVABRestartAttempts = 0;
                this.__TTVABPageMediaKey = pagePlaybackContext.MediaKey || null;
                pruneTrackedWorkers();
                _$s.workers.push(this);
                try {
                    _postWorkerBridgeMessage(this, {
                        key: "UpdateToggleState",
                        value: __TTVAB_STATE__.IsAdStrippingEnabled,
                    });
                    _postWorkerBridgeMessage(this, {
                        key: "UpdateAdsBlocked",
                        value: _$s.adsBlocked,
                    });
                    _postWorkerBridgeMessage(this, {
                        key: "UpdatePlayerHasPlayedOnce",
                        value: __TTVAB_STATE__.PlayerHasPlayedOnce,
                    });
                    _postWorkerBridgeMessage(this, {
                        key: "UpdatePlayerIsPlaying",
                        value: __TTVAB_STATE__.PlayerIsPlaying,
                    });
                    _postWorkerBridgeMessage(this, {
                        key: "UpdatePageContext",
                        value: {
                            mediaType: __TTVAB_STATE__.PageMediaType,
                            channelName: __TTVAB_STATE__.PageChannel,
                            vodID: __TTVAB_STATE__.PageVodID,
                            mediaKey: __TTVAB_STATE__.PageMediaKey,
                        },
                    });
                    _postWorkerBridgeMessage(this, {
                        key: "UpdateCurrentAdContext",
                        value: {
                            channelName: __TTVAB_STATE__.CurrentAdChannel,
                            mediaKey: __TTVAB_STATE__.CurrentAdMediaKey,
                        },
                    });
                    _postWorkerBridgeMessage(this, {
                        key: "UpdatePinnedBackupPlayerContext",
                        value: {
                            type: __TTVAB_STATE__.PinnedBackupPlayerType,
                            channelName: __TTVAB_STATE__.PinnedBackupPlayerChannel,
                            mediaKey: __TTVAB_STATE__.PinnedBackupPlayerMediaKey,
                        },
                    });
                }
                catch { }
            }
            terminate() {
                this.__TTVABIntentionallyTerminated = true;
                pruneTrackedWorkers();
                return super.terminate();
            }
        };
        return _$re(HookedWorker, reinsertNames);
    };
    const originalWorkerDescriptor = Object.getOwnPropertyDescriptor(window, "Worker");
    let rawWorkerInstance = window.Worker;
    let workerInstance = createHookedWorkerConstructor(rawWorkerInstance);
    Object.defineProperty(window, "Worker", {
        configurable: true,
        enumerable: originalWorkerDescriptor?.enumerable ?? false,
        get: () => workerInstance,
        set: (v) => {
            if (!_$iv(v) || v === workerInstance || v === rawWorkerInstance) {
                return;
            }
            rawWorkerInstance = v;
            workerInstance = createHookedWorkerConstructor(rawWorkerInstance);
        },
    });
    _startWorkerWatchdog();
}
function _$mf() {
    const realFetch = window.fetch;
    window.__TTVAB_REAL_FETCH__ = realFetch;
    const isGqlEndpointUrl = (urlStr) => {
        try {
            return new URL(urlStr).hostname === "gql.twitch.tv";
        }
        catch {
            return false;
        }
    };
    const updateWorkers = (updates) => {
        if (Array.isArray(updates)) {
            for (const msg of updates) {
                _$bw(msg);
            }
        }
        else {
            _$bw(updates);
        }
    };
    const rewritePlaybackAccessTokenBody = (bodyText) => {
        if (typeof bodyText !== "string" || !bodyText) {
            return { bodyText, changed: false };
        }
        try {
            const forceType = __TTVAB_STATE__.ForceAccessTokenPlayerType || "autoplay";
            if (!forceType ||
                __TTVAB_STATE__.RewriteNativePlaybackAccessToken !== true) {
                return { bodyText, changed: false };
            }
            const parsed = JSON.parse(bodyText);
            const operations = Array.isArray(parsed) ? parsed : [parsed];
            let changed = false;
            let previousPlayerType = null;
            for (const op of operations) {
                if (op?.operationName !== "PlaybackAccessToken")
                    continue;
                if (!op.variables || typeof op.variables !== "object")
                    continue;
                if (typeof op.variables.playerType === "string") {
                    if (op.variables.playerType !== forceType) {
                        previousPlayerType = previousPlayerType || op.variables.playerType;
                        op.variables.playerType = forceType;
                        changed = true;
                    }
                    const expectedPlatform = forceType === "autoplay" ? "android" : "web";
                    if (op.variables.platform !== expectedPlatform) {
                        op.variables.platform = expectedPlatform;
                        changed = true;
                    }
                }
            }
            if (changed) {
                _$l(`Replaced native PlaybackAccessToken player type '${previousPlayerType}' with '${forceType}'`, "info");
                return {
                    bodyText: JSON.stringify(parsed),
                    changed: true,
                };
            }
        }
        catch { }
        return { bodyText, changed: false };
    };
    const isPictureInPicturePlaybackAccessTokenBody = (bodyText) => {
        if (typeof bodyText !== "string" ||
            !bodyText ||
            !bodyText.includes("PlaybackAccessToken")) {
            return false;
        }
        try {
            const parsed = JSON.parse(bodyText);
            const operations = Array.isArray(parsed) ? parsed : [parsed];
            return operations.some((op) => {
                if (op?.operationName !== "PlaybackAccessToken")
                    return false;
                const playerType = op?.variables?.playerType;
                return (typeof playerType === "string" &&
                    playerType.toLowerCase().includes("picture-by-picture"));
            });
        }
        catch {
            return bodyText.toLowerCase().includes("picture-by-picture");
        }
    };
    const updatePlaybackAccessTokenHash = (hash) => {
        if (!hash || __TTVAB_STATE__.PlaybackAccessTokenHash === hash)
            return;
        __TTVAB_STATE__.PlaybackAccessTokenHash = hash;
        updateWorkers([{ key: "UpdateGQLHash", value: hash }]);
    };
    const updateNativePlaybackAccessTokenPlayerType = (playerType) => {
        if (!playerType ||
            __TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType === playerType) {
            return;
        }
        __TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType = playerType;
        updateWorkers([
            {
                key: "UpdateLastNativePlaybackAccessTokenPlayerType",
                value: playerType,
            },
        ]);
    };
    const processGqlBody = (bodyText) => {
        if (typeof bodyText !== "string" || !bodyText)
            return;
        try {
            const data = JSON.parse(bodyText);
            const operations = Array.isArray(data) ? data : [data];
            for (const op of operations) {
                if (op?.operationName === "PlaybackAccessToken" &&
                    op.extensions?.persistedQuery?.sha256Hash) {
                    updatePlaybackAccessTokenHash(op.extensions.persistedQuery.sha256Hash);
                }
            }
        }
        catch { }
    };
    const processGqlResponse = async (response) => {
        if (!response || response.status !== 200)
            return;
        try {
            const payload = await response.clone().json();
            const operations = Array.isArray(payload) ? payload : [payload];
            for (const op of operations) {
                const extractedToken = _extractPlaybackAccessToken(op);
                const tokenValue = extractedToken?.value || null;
                if (typeof tokenValue !== "string" || !tokenValue)
                    continue;
                try {
                    const tokenPayload = JSON.parse(tokenValue);
                    const effectivePlayerType = tokenPayload?.playerType || tokenPayload?.player_type || null;
                    if (typeof effectivePlayerType === "string") {
                        updateNativePlaybackAccessTokenPlayerType(effectivePlayerType);
                    }
                }
                catch { }
            }
        }
        catch { }
    };
    window.fetch = async function (...args) {
        const [url, opts] = args;
        if (url) {
            const urlStr = url instanceof Request ? url.url : url.toString();
            if (isGqlEndpointUrl(urlStr)) {
                _$sd();
                let nextArgs = args;
                let headers = opts?.headers;
                let shouldSkipPlaybackAccessTokenState = false;
                if (url instanceof Request) {
                    let effectiveRequest = url;
                    try {
                        if (opts && Object.keys(opts).length > 0) {
                            effectiveRequest = new Request(url, opts);
                        }
                        headers = effectiveRequest.headers;
                        const text = await effectiveRequest.clone().text();
                        shouldSkipPlaybackAccessTokenState =
                            isPictureInPicturePlaybackAccessTokenBody(text);
                        if (!shouldSkipPlaybackAccessTokenState) {
                            const rewritten = rewritePlaybackAccessTokenBody(text);
                            processGqlBody(rewritten.bodyText);
                            if (rewritten.changed) {
                                nextArgs = [
                                    new Request(effectiveRequest, {
                                        body: rewritten.bodyText,
                                    }),
                                ];
                            }
                            else if (effectiveRequest !== url || args.length !== 1) {
                                nextArgs = [effectiveRequest];
                            }
                        }
                        else if (effectiveRequest !== url || args.length !== 1) {
                            nextArgs = [effectiveRequest];
                        }
                    }
                    catch (_e) { }
                }
                else if (typeof opts?.body === "string") {
                    shouldSkipPlaybackAccessTokenState =
                        isPictureInPicturePlaybackAccessTokenBody(opts.body);
                    if (!shouldSkipPlaybackAccessTokenState) {
                        const rewritten = rewritePlaybackAccessTokenBody(opts.body);
                        processGqlBody(rewritten.bodyText);
                        if (rewritten.changed) {
                            nextArgs = [url, { ...(opts || {}), body: rewritten.bodyText }];
                        }
                    }
                }
                if (headers) {
                    const getHeader = (key) => {
                        if (headers instanceof Headers) {
                            return headers.get(key) || headers.get(key.toLowerCase());
                        }
                        if (Array.isArray(headers)) {
                            const target = key.toLowerCase();
                            const entry = headers.find((header) => Array.isArray(header) &&
                                String(header[0] || "").toLowerCase() === target);
                            return entry?.[1];
                        }
                        return headers[key] || headers[key.toLowerCase()];
                    };
                    const updates = [];
                    const integrity = getHeader("Client-Integrity");
                    const auth = getHeader("Authorization");
                    const version = getHeader("Client-Version");
                    const session = getHeader("Client-Session-Id");
                    const device = getHeader("X-Device-Id");
                    if (integrity &&
                        __TTVAB_STATE__.ClientIntegrityHeader !== integrity) {
                        __TTVAB_STATE__.ClientIntegrityHeader = integrity;
                        updates.push({
                            key: "UpdateClientIntegrityHeader",
                            value: __TTVAB_STATE__.ClientIntegrityHeader,
                        });
                    }
                    if (auth && __TTVAB_STATE__.AuthorizationHeader !== auth) {
                        __TTVAB_STATE__.AuthorizationHeader = auth;
                        updates.push({
                            key: "UpdateAuthorizationHeader",
                            value: __TTVAB_STATE__.AuthorizationHeader,
                        });
                    }
                    if (version && __TTVAB_STATE__.ClientVersion !== version) {
                        __TTVAB_STATE__.ClientVersion = version;
                        updates.push({
                            key: "UpdateClientVersion",
                            value: __TTVAB_STATE__.ClientVersion,
                        });
                    }
                    if (session && __TTVAB_STATE__.ClientSession !== session) {
                        __TTVAB_STATE__.ClientSession = session;
                        updates.push({
                            key: "UpdateClientSession",
                            value: __TTVAB_STATE__.ClientSession,
                        });
                    }
                    if (device && __TTVAB_STATE__.GQLDeviceID !== device) {
                        __TTVAB_STATE__.GQLDeviceID = device;
                        updates.push({
                            key: "UpdateDeviceId",
                            value: __TTVAB_STATE__.GQLDeviceID,
                        });
                    }
                    updateWorkers(updates);
                }
                const response = await realFetch.apply(this, nextArgs);
                if (!shouldSkipPlaybackAccessTokenState) {
                    await processGqlResponse(response);
                }
                return response;
            }
        }
        return realFetch.apply(this, args);
    };
}

"use strict";

const _$pbs = {
    position: 0,
    bufferedPosition: 0,
    bufferDuration: 0,
    numSame: 0,
    lastFixTime: 0,
    fixAttempts: 0,
    liveEdgeStarveCount: 0,
    postAdUnhealthyCount: 0,
    postAdRecoveryStartedAt: 0,
    postAdLastCurrentTime: 0,
    postAdStallTicks: 0,
    postAdSoftReloadAttempted: false,
    postAdGraceUntil: 0,
    postAdGraceLastCurrentTime: 0,
    postAdGraceStallTicks: 0,
    postAdGracePauseResumeAt: 0,
    postAdGraceReloadAttempted: false,
};
let _$cpr = null;
let _cachedPlayerRefMediaKey = null;
let _cachedReactRootNode = null;
let _cachedReactContainerKey = null;
const _AdAudioSuppressionState = {
    suppressedMedia: new Map(),
    activeMediaKey: null,
    lastSuppressedCount: 0,
};
const _PlaybackIntentState = {
    observedMedia: null,
    pauseListener: null,
    playListener: null,
    userPausedMediaKey: null,
    userPausedAt: 0,
    userPausedHadExplicitInteraction: false,
    userPausedDuringAd: false,
    lastProgrammaticPauseAt: 0,
    lastProgrammaticPlayAt: 0,
    suppressedPauseMediaKey: null,
    suppressedPauseUntil: 0,
    lastPlaybackControlInteractionAt: 0,
    lastPlaybackControlInteractionMediaKey: null,
    interactionMonitorInitialized: false,
    secondaryPlayerLaunchMonitorInitialized: false,
    secondaryPlayerHandoffKind: null,
    secondaryPlayerHandoffChannel: null,
    secondaryPlayerHandoffMediaKey: null,
    secondaryPlayerHandoffUntil: 0,
    secondaryPlayerHandoffSourceWasPlaying: false,
};
let _playbackIntentMonitorStarted = false;
let _playerBufferMonitorStarted = false;
let _playbackIntentMonitorTimer = null;
let _playerBufferMonitorTimer = null;
const _PlaybackRecoveryTimeoutState = {
    timeouts: new Set(),
};
const _PlayerPreferenceRestoreState = {
    timeoutId: null,
    channel: null,
    mediaKey: null,
};
const _PLAYBACK_INTENT_MONITOR_DELAY_MS = 500;
const _PLAYBACK_INTENT_IDLE_SYNC_DELAY_MS = 1500;
const _PLAYBACK_INTENT_NO_MEDIA_ROUTE_DELAY_MS = 3000;
const _USER_PAUSE_INTERACTION_WINDOW_MS = 1200;
const _AD_RESUME_INTENT_WINDOW_MS = 15000;
const _AD_TRANSIENT_PAUSE_CLEAR_WINDOW_MS = 1750;
const _PLAYER_BUFFER_LIVE_EDGE_EPSILON = 0.35;
const _PLAYER_BUFFER_LIVE_EDGE_RELOAD_COUNT = 12;
const _PLAYER_BUFFER_STEADY_DELAY_MS = 900;
const _POST_AD_UNHEALTHY_RELOAD_COUNT = 3;
const _POST_AD_RECOVERY_RELOAD_COOLDOWN_MS = 1800;
const _POST_AD_SOFT_RELOAD_DELAY_MS = 10000;
const _POST_AD_PAUSE_RESUME_RETRY_MS = 2500;
const _POST_AD_GRACE_WINDOW_MS = 90000;
const _POST_AD_GRACE_STALL_TICKS_REQUIRED = 2;
const _POST_AD_GRACE_PAUSE_RESUME_COOLDOWN_MS = 1500;
const _VISIBILITY_RESUME_RETRY_DELAYS_MS = [80, 250, 700, 1500];
const _HIDDEN_VISIBILITY_RESUME_RETRY_DELAYS_MS = [120, 500, 1500, 3000];
const _SECONDARY_PLAYER_HANDOFF_WINDOW_MS = 2700000;
const _PinnedBackupStallState = {
    firstObservedAt: 0,
    lastCurrentTime: 0,
    lastBufferedEnd: 0,
    lastForceRefreshAt: 0,
    lastPinnedType: null,
    forceRefreshCount: 0,
    exhaustedLogged: false,
};
const _SECONDARY_PLAYER_HANDOFF_PAUSE_DELAYS_MS = [0, 120, 450, 1000];
const _PLAYER_CONTROL_INTERACTION_SELECTOR = [
    '[data-a-target="player-play-pause-button"]',
    '[data-a-target="player-overlay-play-button"]',
    '[data-a-target="player-overlay-click-handler"]',
    '[data-a-target="video-player"]',
    "video",
].join(", ");
const _$ppk = [
    "video-quality",
    "lowLatencyModeEnabled",
    "persistenceEnabled",
];
function _readConfiguredQualityGroup() {
    try {
        const raw = localStorage.getItem("video-quality");
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.default === "string" && parsed.default.trim()) {
            return parsed.default.trim();
        }
        if (typeof parsed === "string" && parsed.trim()) {
            return parsed.trim();
        }
    }
    catch { }
    return null;
}
function _syncPreferredQualityGroup(playerCore = null) {
    if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__)
        return false;
    const nextQualityGroup = (typeof playerCore?.state?.quality?.group === "string" &&
        playerCore.state.quality.group.trim()
        ? playerCore.state.quality.group.trim()
        : null) || _readConfiguredQualityGroup();
    if (!nextQualityGroup)
        return false;
    if (__TTVAB_STATE__.PreferredQualityGroup === nextQualityGroup) {
        return false;
    }
    __TTVAB_STATE__.PreferredQualityGroup = nextQualityGroup;
    _$bw({
        key: "UpdatePreferredQualityGroup",
        value: nextQualityGroup,
    });
    return true;
}
function _isLowLatencyEnabled(playerCore = null) {
    try {
        if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__)
            return false;
        const playerState = typeof playerCore?.state?.lowLatencyModeEnabled === "boolean"
            ? playerCore.state.lowLatencyModeEnabled
            : null;
        if (typeof playerState === "boolean")
            return playerState;
        const stored = localStorage.getItem("lowLatencyModeEnabled");
        if (stored === "true")
            return true;
        if (stored === "false")
            return false;
    }
    catch { }
    return false;
}
function _getLowLatencySafeEpsilon() {
    return _isLowLatencyEnabled() ? 0.08 : _PLAYER_BUFFER_LIVE_EDGE_EPSILON;
}
function _getLowLatencyDangerZone() {
    return _isLowLatencyEnabled()
        ? 0.3
        : Number(__TTVAB_STATE__?.PlayerBufferingDangerZone) || 1;
}
function _getLowLatencyMinRepeatDelay() {
    return _isLowLatencyEnabled()
        ? 2000
        : Number(__TTVAB_STATE__?.PlayerBufferingMinRepeatDelay) || 8000;
}
function _$gpc(player) {
    return player?.playerInstance?.core || player?.core || null;
}
let _loggedReactRootSearchFailure = false;
function _$rr() {
    let rootNode = _cachedReactRootNode;
    if (!rootNode?.isConnected) {
        rootNode = document.querySelector("#root");
        if (!rootNode) {
            _cachedReactRootNode = null;
            _cachedReactContainerKey = null;
            if (_$dl && !_loggedReactRootSearchFailure) {
                _loggedReactRootSearchFailure = true;
                _$l("React root node #root not found in DOM — player features unavailable", "debug");
            }
            return null;
        }
        _cachedReactRootNode = rootNode;
        _cachedReactContainerKey = null;
    }
    if (rootNode._reactRootContainer?._internalRoot?.current) {
        _loggedReactRootSearchFailure = false;
        return rootNode._reactRootContainer._internalRoot.current;
    }
    let containerName = _cachedReactContainerKey;
    if (!containerName || !(containerName in rootNode)) {
        containerName =
            Object.keys(rootNode).find((x) => x.startsWith("__reactContainer")) ||
                null;
        _cachedReactContainerKey = containerName;
    }
    if (containerName) {
        _loggedReactRootSearchFailure = false;
        return rootNode[containerName];
    }
    if (_$dl && !_loggedReactRootSearchFailure) {
        _loggedReactRootSearchFailure = true;
        _$l("React fiber root not found on #root — possible React upgrade", "debug");
    }
    return null;
}
function _$rnbc(root, constraints) {
    const found = new Array(constraints.length).fill(null);
    if (!root)
        return found;
    let remaining = constraints.length;
    function visit(node) {
        const stateNode = node.stateNode;
        if (stateNode) {
            for (let i = 0; i < constraints.length; i++) {
                if (found[i] === null && constraints[i](stateNode)) {
                    found[i] = stateNode;
                    remaining--;
                    if (remaining === 0)
                        return true;
                }
            }
        }
        let child = node.child;
        while (child) {
            if (visit(child))
                return true;
            child = child.sibling;
        }
        return false;
    }
    visit(root);
    return found;
}
function _$gps() {
    const reactRoot = _$rr();
    if (!reactRoot)
        return { player: null, state: null };
    const [playerWrapper, directState, fallbackStateWrapper] = _$rnbc(reactRoot, [
        (node) => node.setPlayerActive && node.props?.mediaPlayerInstance,
        (node) => node.setSrc && node.setInitialPlaybackSettings,
        (node) => node.state?.videoPlayerInstance &&
            node.state.videoPlayerInstance.playerMode !== undefined,
    ]);
    const player = playerWrapper?.props?.mediaPlayerInstance || null;
    let playerState = directState;
    if (!playerState) {
        playerState = fallbackStateWrapper?.state?.videoPlayerInstance || null;
    }
    return { player, state: playerState };
}
function _resetPlayerBufferMonitorState(cooldownMs = 0) {
    const minRepeatDelay = typeof __TTVAB_STATE__ !== "undefined" && __TTVAB_STATE__
        ? Number(_getLowLatencyMinRepeatDelay()) || 0
        : 0;
    const requestedCooldownMs = Number.isFinite(cooldownMs)
        ? Math.max(0, cooldownMs)
        : 0;
    const appliedCooldownMs = minRepeatDelay > 0
        ? Math.min(requestedCooldownMs, minRepeatDelay)
        : requestedCooldownMs;
    _$pbs.position = 0;
    _$pbs.bufferedPosition = 0;
    _$pbs.bufferDuration = 0;
    _$pbs.numSame = 0;
    _$pbs.fixAttempts = 0;
    _$pbs.liveEdgeStarveCount = 0;
    _$pbs.postAdUnhealthyCount = 0;
    _$pbs.postAdRecoveryStartedAt = 0;
    _$pbs.postAdLastCurrentTime = 0;
    _$pbs.postAdStallTicks = 0;
    _$pbs.postAdSoftReloadAttempted = false;
    _resetPostAdGrace();
    _$pbs.lastFixTime =
        minRepeatDelay > 0
            ? Date.now() - Math.max(0, minRepeatDelay - appliedCooldownMs)
            : 0;
}
function _clearCachedPlayerRef(resetBufferState = true, cooldownMs = 0) {
    _$cpr = null;
    _cachedPlayerRefMediaKey = null;
    if (resetBufferState) {
        _resetPlayerBufferMonitorState(cooldownMs);
    }
}
function _readPlayerBufferTelemetry(player, playerCore = null) {
    const video = player?.getHTMLVideoElement?.() || null;
    const position = Number(playerCore?.state?.position) || 0;
    const bufferedPosition = Number(playerCore?.state?.bufferedPosition) || 0;
    const bufferDuration = Number(player?.getBufferDuration?.()) || 0;
    const videoCurrentTime = Number(video?.currentTime);
    let liveEdge = bufferedPosition;
    if (video?.buffered?.length > 0) {
        try {
            liveEdge = video.buffered.end(video.buffered.length - 1);
        }
        catch { }
    }
    const currentTime = Number.isFinite(videoCurrentTime)
        ? videoCurrentTime
        : position;
    const liveEdgeDistance = Math.max(0, liveEdge - currentTime);
    const readyState = Number(video?.readyState) || 0;
    const hasFutureData = bufferDuration > _getLowLatencySafeEpsilon() ||
        liveEdgeDistance > _getLowLatencySafeEpsilon() ||
        readyState >= 3;
    return {
        video,
        position,
        bufferedPosition,
        bufferDuration,
        currentTime,
        liveEdge,
        liveEdgeDistance,
        readyState,
        hasFutureData,
    };
}
function _isPlayerPaused(player, playerCore = null, video = null) {
    const resolvedVideo = video || player?.getHTMLVideoElement?.() || null;
    return Boolean(player?.isPaused?.() || playerCore?.paused || resolvedVideo?.paused);
}
function _isPlaybackHealthyAfterAd(player, playerCore = null, video = null) {
    const resolvedVideo = video || player?.getHTMLVideoElement?.() || null;
    if (!(resolvedVideo instanceof HTMLMediaElement) || resolvedVideo.ended) {
        return false;
    }
    if (_isPlayerPaused(player, playerCore, resolvedVideo)) {
        return false;
    }
    if (Number(resolvedVideo.readyState) < 2) {
        return false;
    }
    if (resolvedVideo instanceof HTMLVideoElement &&
        Number(resolvedVideo.videoWidth) <= 0) {
        return false;
    }
    const telemetry = _readPlayerBufferTelemetry(player, playerCore);
    return (telemetry.bufferDuration > _PLAYER_BUFFER_LIVE_EDGE_EPSILON ||
        telemetry.liveEdgeDistance > _PLAYER_BUFFER_LIVE_EDGE_EPSILON);
}
function _isNativeDocumentHidden() {
    const nativeVisibility = window.__TTVAB_NATIVE_VISIBILITY__;
    try {
        if (typeof nativeVisibility?.hidden === "function") {
            return nativeVisibility.hidden.call(document) === true;
        }
        if (typeof nativeVisibility?.webkitHidden === "function") {
            return nativeVisibility.webkitHidden.call(document) === true;
        }
        if (typeof nativeVisibility?.mozHidden === "function") {
            return nativeVisibility.mozHidden.call(document) === true;
        }
    }
    catch { }
    return document.hidden === true;
}
function _normalizePlayerChannel(channel = null) {
    if (typeof channel !== "string")
        return null;
    const trimmed = channel.trim().toLowerCase();
    return trimmed || null;
}
function _resolvePlayerMediaKey(channel = null, mediaKey = null) {
    return (_normalizeMediaKey(mediaKey) ||
        _normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) ||
        _normalizeMediaKey(__TTVAB_STATE__?.PageMediaKey) ||
        _buildMediaKey("live", channel, null) ||
        _buildMediaKey("live", __TTVAB_STATE__?.CurrentAdChannel, null) ||
        _buildMediaKey("live", __TTVAB_STATE__?.PageChannel, null) ||
        null);
}
function _getCurrentPlaybackRecoveryContext() {
    const routeContext = _normalizePlaybackContext(_getPlaybackContextFromUrl(globalThis?.location?.href || ""));
    return {
        channel: _normalizePlayerChannel(routeContext.ChannelName) || null,
        mediaKey: _normalizeMediaKey(routeContext.MediaKey) || null,
    };
}
function _isPlaybackRecoveryContextCurrent(channel = null, mediaKey = null) {
    const targetMediaKey = _normalizeMediaKey(mediaKey);
    const targetChannel = _normalizePlayerChannel(channel);
    const currentContext = _getCurrentPlaybackRecoveryContext();
    if (targetMediaKey) {
        if (!currentContext.mediaKey)
            return false;
        return currentContext.mediaKey === targetMediaKey;
    }
    if (targetChannel) {
        if (!currentContext.channel)
            return false;
        return currentContext.channel === targetChannel;
    }
    return true;
}
function _clearPlaybackRecoveryTimeouts() {
    for (const entry of _PlaybackRecoveryTimeoutState.timeouts) {
        clearTimeout(entry.id);
    }
    _PlaybackRecoveryTimeoutState.timeouts.clear();
}
function _clearPendingPlayerPreferenceRestore() {
    if (_PlayerPreferenceRestoreState.timeoutId) {
        clearTimeout(_PlayerPreferenceRestoreState.timeoutId);
    }
    _PlayerPreferenceRestoreState.timeoutId = null;
    _PlayerPreferenceRestoreState.channel = null;
    _PlayerPreferenceRestoreState.mediaKey = null;
}
function _schedulePlaybackRecoveryTimeout(callback, delay = 0, channel = null, mediaKey = null) {
    if (typeof callback !== "function")
        return null;
    const entry = {
        id: 0,
        channel: _normalizePlayerChannel(channel),
        mediaKey: _resolvePlayerMediaKey(channel, mediaKey),
    };
    entry.id = setTimeout(() => {
        _PlaybackRecoveryTimeoutState.timeouts.delete(entry);
        if (!_isPlaybackRecoveryContextCurrent(entry.channel, entry.mediaKey)) {
            return;
        }
        try {
            callback();
        }
        catch { }
    }, Math.max(0, delay));
    _PlaybackRecoveryTimeoutState.timeouts.add(entry);
    return entry.id;
}
function _markProgrammaticPause() {
    _PlaybackIntentState.lastProgrammaticPauseAt = Date.now();
}
function _markProgrammaticPlay() {
    _PlaybackIntentState.lastProgrammaticPlayAt = Date.now();
}
function _clearRecordedUserPauseIntent() {
    _PlaybackIntentState.userPausedMediaKey = null;
    _PlaybackIntentState.userPausedAt = 0;
    _PlaybackIntentState.userPausedHadExplicitInteraction = false;
    _PlaybackIntentState.userPausedDuringAd = false;
}
function _clearSecondaryPlayerHandoff() {
    _PlaybackIntentState.secondaryPlayerHandoffKind = null;
    _PlaybackIntentState.secondaryPlayerHandoffChannel = null;
    _PlaybackIntentState.secondaryPlayerHandoffMediaKey = null;
    _PlaybackIntentState.secondaryPlayerHandoffUntil = 0;
    _PlaybackIntentState.secondaryPlayerHandoffSourceWasPlaying = false;
}
function _clearRecentPlaybackControlInteraction() {
    _PlaybackIntentState.lastPlaybackControlInteractionAt = 0;
    _PlaybackIntentState.lastPlaybackControlInteractionMediaKey = null;
}
function _rememberRecentPlaybackControlInteraction(channel = null, mediaKey = null) {
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    _PlaybackIntentState.lastPlaybackControlInteractionAt = Date.now();
    _PlaybackIntentState.lastPlaybackControlInteractionMediaKey = safeMediaKey;
}
function _hasRecentPlaybackControlInteraction(channel = null, mediaKey = null) {
    const lastInteractionAt = Number(_PlaybackIntentState.lastPlaybackControlInteractionAt) || 0;
    if (lastInteractionAt <= 0 ||
        Date.now() - lastInteractionAt > _USER_PAUSE_INTERACTION_WINDOW_MS) {
        return false;
    }
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    const interactionMediaKey = _normalizeMediaKey(_PlaybackIntentState.lastPlaybackControlInteractionMediaKey);
    return (!safeMediaKey ||
        !interactionMediaKey ||
        safeMediaKey === interactionMediaKey);
}
function _wasRecentProgrammaticPlaybackAction(kind) {
    const now = Date.now();
    if (kind === "pause") {
        return now - (_PlaybackIntentState.lastProgrammaticPauseAt || 0) < 1500;
    }
    if (kind === "play") {
        return now - (_PlaybackIntentState.lastProgrammaticPlayAt || 0) < 1500;
    }
    return false;
}
function _clearUserPauseIntent(channel = null, mediaKey = null) {
    if (!_PlaybackIntentState.userPausedMediaKey)
        return false;
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    if (safeMediaKey &&
        _PlaybackIntentState.userPausedMediaKey !== safeMediaKey) {
        return false;
    }
    _clearRecordedUserPauseIntent();
    return true;
}
function _resetPlaybackIntentForNavigation(channel = null, mediaKey = null, durationMs = 2500) {
    _clearRecordedUserPauseIntent();
    _clearRecentPlaybackControlInteraction();
    _clearSecondaryPlayerHandoff();
    _suppressPauseIntent(channel, mediaKey, durationMs);
}
function _hasUserPauseIntent(channel = null, mediaKey = null) {
    if (!_PlaybackIntentState.userPausedMediaKey)
        return false;
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    if (!safeMediaKey)
        return false;
    return _PlaybackIntentState.userPausedMediaKey === safeMediaKey;
}
function _suppressPauseIntent(channel = null, mediaKey = null, durationMs = 3000) {
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    if (!safeMediaKey || !Number.isFinite(durationMs) || durationMs <= 0) {
        return false;
    }
    _PlaybackIntentState.suppressedPauseMediaKey = safeMediaKey;
    _PlaybackIntentState.suppressedPauseUntil = Date.now() + durationMs;
    return true;
}
function _isPauseIntentSuppressed(channel = null, mediaKey = null) {
    const until = _PlaybackIntentState.suppressedPauseUntil || 0;
    if (until <= Date.now()) {
        _PlaybackIntentState.suppressedPauseMediaKey = null;
        _PlaybackIntentState.suppressedPauseUntil = 0;
        return false;
    }
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    if (!safeMediaKey)
        return true;
    return _PlaybackIntentState.suppressedPauseMediaKey === safeMediaKey;
}
function _matchesPlaybackTargetContext(expectedChannel = null, expectedMediaKey = null, channel = null, mediaKey = null) {
    const safeChannel = _normalizePlayerChannel(channel);
    const safeMediaKey = _normalizeMediaKey(mediaKey);
    const normalizedExpectedChannel = _normalizePlayerChannel(expectedChannel);
    const normalizedExpectedMediaKey = _normalizeMediaKey(expectedMediaKey);
    return ((!safeMediaKey ||
        !normalizedExpectedMediaKey ||
        safeMediaKey === normalizedExpectedMediaKey) &&
        (!safeChannel ||
            !normalizedExpectedChannel ||
            safeChannel === normalizedExpectedChannel));
}
function _hasActiveSecondaryPlayerHandoff(channel = null, mediaKey = null) {
    const until = Number(_PlaybackIntentState.secondaryPlayerHandoffUntil) || 0;
    if (until <= Date.now()) {
        _clearSecondaryPlayerHandoff();
        return false;
    }
    return _matchesPlaybackTargetContext(_PlaybackIntentState.secondaryPlayerHandoffChannel, _PlaybackIntentState.secondaryPlayerHandoffMediaKey, channel, mediaKey);
}
function _shouldSuppressAutomaticPlaybackResume(channel = null, mediaKey = null) {
    return _hasActiveSecondaryPlayerHandoff(channel, mediaKey);
}
function _isPrimaryPlaybackCurrentlyActive() {
    const { player } = _$gps();
    const playerCore = _$gpc(player);
    const playerVideo = player?.getHTMLVideoElement?.() || null;
    if (player &&
        !_isPlayerPaused(player, playerCore, playerVideo) &&
        !(playerVideo instanceof HTMLMediaElement && playerVideo.ended)) {
        return true;
    }
    const primaryMedia = _getPrimaryMediaElement();
    return Boolean(primaryMedia instanceof HTMLMediaElement &&
        primaryMedia.isConnected &&
        !primaryMedia.paused &&
        !primaryMedia.ended);
}
function _setPlayerIsPlaying(isPlaying) {
    const nextValue = isPlaying === true;
    if (__TTVAB_STATE__.PlayerIsPlaying === nextValue)
        return;
    __TTVAB_STATE__.PlayerIsPlaying = nextValue;
    _$bw({
        key: "UpdatePlayerIsPlaying",
        value: nextValue,
    });
}
function _markPlayerHasPlayedOnce() {
    if (__TTVAB_STATE__.PlayerHasPlayedOnce)
        return;
    __TTVAB_STATE__.PlayerHasPlayedOnce = true;
    _$bw({
        key: "UpdatePlayerHasPlayedOnce",
        value: true,
    });
}
function _markSecondaryPlayerHandoff(kind = "popout", channel = null, mediaKey = null, durationMs = _SECONDARY_PLAYER_HANDOFF_WINDOW_MS, sourceWasPlaying = _isPrimaryPlaybackCurrentlyActive()) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return false;
    }
    const safeChannel = _normalizePlayerChannel(channel) ||
        _normalizePlayerChannel(__TTVAB_STATE__.PageChannel) ||
        null;
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    _PlaybackIntentState.secondaryPlayerHandoffKind = kind;
    _PlaybackIntentState.secondaryPlayerHandoffChannel = safeChannel;
    _PlaybackIntentState.secondaryPlayerHandoffMediaKey = safeMediaKey;
    _PlaybackIntentState.secondaryPlayerHandoffUntil = Date.now() + durationMs;
    _PlaybackIntentState.secondaryPlayerHandoffSourceWasPlaying =
        sourceWasPlaying === true;
    return true;
}
function _pausePrimaryPlaybackForSecondaryPlayerHandoff(channel = null, mediaKey = null) {
    if (!_hasActiveSecondaryPlayerHandoff(channel, mediaKey)) {
        return false;
    }
    let didPause = false;
    const { player } = _$gps();
    const playerCore = _$gpc(player);
    const playerVideo = player?.getHTMLVideoElement?.() || null;
    if (player && !_isPlayerPaused(player, playerCore, playerVideo)) {
        didPause = _pausePlaybackTarget(player) || didPause;
    }
    if (playerVideo instanceof HTMLMediaElement &&
        !playerVideo.paused &&
        !playerVideo.ended) {
        didPause = _pausePlaybackTarget(playerVideo) || didPause;
    }
    const primaryMedia = _getPrimaryMediaElement();
    if (primaryMedia instanceof HTMLMediaElement &&
        primaryMedia !== playerVideo &&
        !primaryMedia.paused &&
        !primaryMedia.ended) {
        didPause = _pausePlaybackTarget(primaryMedia) || didPause;
    }
    return didPause;
}
function _scheduleSecondaryPlayerHandoffPause(channel = null, mediaKey = null) {
    for (const delay of _SECONDARY_PLAYER_HANDOFF_PAUSE_DELAYS_MS) {
        _schedulePlaybackRecoveryTimeout(() => {
            _pausePrimaryPlaybackForSecondaryPlayerHandoff(channel, mediaKey);
        }, Math.max(0, Number(delay) || 0), channel, mediaKey);
    }
}
function _rollbackSecondaryPlayerHandoff(channel = null, mediaKey = null, sourceWasPlaying = false) {
    _clearSecondaryPlayerHandoff();
    if (sourceWasPlaying !== true) {
        return false;
    }
    for (const delay of [0, 120, 350]) {
        setTimeout(() => {
            _resumePrimaryPlaybackIfPaused(channel, mediaKey);
        }, delay);
    }
    return true;
}
function _getSecondaryPlayerLaunchDescriptorFromUrl(rawUrl) {
    let parsedUrl = null;
    try {
        const baseUrl = typeof globalThis?.location?.href === "string"
            ? globalThis.location.href
            : "https://www.twitch.tv/";
        parsedUrl = new URL(String(rawUrl || ""), baseUrl);
    }
    catch {
        return null;
    }
    const hostname = String(parsedUrl.hostname || "").toLowerCase();
    const pathname = String(parsedUrl.pathname || "").toLowerCase();
    let kind = null;
    let context = _normalizePlaybackContext(_getPlaybackContextFromUrl(parsedUrl.href));
    if (hostname === "player.twitch.tv") {
        const playerParam = String(parsedUrl.searchParams.get("player") || "").toLowerCase();
        const queryChannel = _normalizeChannelName(parsedUrl.searchParams.get("channel"));
        const queryVideo = _normalizeVodID(parsedUrl.searchParams.get("video") || parsedUrl.searchParams.get("vod"));
        if (playerParam === "popout" || queryChannel || queryVideo) {
            kind = "popout";
            if (queryChannel) {
                context = _normalizePlaybackContext({
                    MediaType: "live",
                    ChannelName: queryChannel,
                });
            }
            else if (queryVideo) {
                context = _normalizePlaybackContext({
                    MediaType: "vod",
                    VodID: queryVideo,
                });
            }
        }
    }
    else if (pathname.includes("/popout/")) {
        kind = "popout";
    }
    if (!kind) {
        return null;
    }
    return {
        kind,
        channel: _normalizePlayerChannel(context.ChannelName) ||
            _normalizePlayerChannel(__TTVAB_STATE__.PageChannel) ||
            null,
        mediaKey: _normalizeMediaKey(context.MediaKey) ||
            _resolvePlayerMediaKey(context.ChannelName, context.MediaKey),
    };
}
function _getSecondaryPlayerLaunchDescriptorFromTarget(target) {
    if (!(target instanceof Element)) {
        return null;
    }
    const anchor = target.closest?.("a[href]");
    const fromAnchorUrl = _getSecondaryPlayerLaunchDescriptorFromUrl(anchor?.getAttribute?.("href") || "");
    if (fromAnchorUrl) {
        return fromAnchorUrl;
    }
    const controlTarget = target.closest?.('button, [role="button"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [aria-label], [data-a-target]') || target;
    const label = [
        controlTarget?.getAttribute?.("aria-label") || "",
        controlTarget?.getAttribute?.("data-a-target") || "",
        controlTarget?.textContent || "",
    ]
        .join(" ")
        .toLowerCase();
    const isPipControl = label.includes("picture-in-picture") ||
        label.includes("picture in picture") ||
        /\bpip\b/.test(label) ||
        label.includes("mini player");
    if (!isPipControl) {
        return null;
    }
    return {
        kind: "pip",
        channel: _normalizePlayerChannel(__TTVAB_STATE__.PageChannel) || null,
        mediaKey: _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey) ||
            _resolvePlayerMediaKey(__TTVAB_STATE__.PageChannel, null),
    };
}
function _beginSecondaryPlayerHandoff(descriptor, options = {}) {
    if (!descriptor || typeof descriptor !== "object") {
        return false;
    }
    const shouldPauseSource = options.pauseSource !== false && String(descriptor.kind || "") !== "pip";
    const sourceWasPlaying = typeof options.sourceWasPlaying === "boolean"
        ? options.sourceWasPlaying
        : _isPrimaryPlaybackCurrentlyActive();
    const didMark = _markSecondaryPlayerHandoff(String(descriptor.kind || "popout"), descriptor.channel || null, descriptor.mediaKey || null, _SECONDARY_PLAYER_HANDOFF_WINDOW_MS, sourceWasPlaying);
    if (!didMark) {
        return false;
    }
    _$cari();
    if (shouldPauseSource) {
        _scheduleSecondaryPlayerHandoffPause(descriptor.channel || null, descriptor.mediaKey || null);
    }
    _$l(shouldPauseSource
        ? `Detected ${descriptor.kind || "secondary"} player handoff; pausing original player`
        : `Detected ${descriptor.kind || "secondary"} player handoff`, "info");
    return true;
}
function _doesActiveAdTargetPlayback(channel = null, mediaKey = null) {
    const expectedChannel = _normalizePlayerChannel(__TTVAB_STATE__.CurrentAdChannel);
    const expectedMediaKey = _normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey);
    if (!expectedChannel && !expectedMediaKey) {
        return false;
    }
    return _matchesPlaybackTargetContext(expectedChannel, expectedMediaKey, channel, mediaKey);
}
function _doesResumeIntentTargetPlayback(channel = null, mediaKey = null) {
    if (__TTVAB_STATE__.ShouldResumeAfterAd !== true) {
        return false;
    }
    const expectedChannel = _normalizePlayerChannel(__TTVAB_STATE__.ShouldResumeAfterAdChannel);
    const expectedMediaKey = _normalizeMediaKey(__TTVAB_STATE__.ShouldResumeAfterAdMediaKey);
    if (!expectedChannel && !expectedMediaKey) {
        return false;
    }
    return _matchesPlaybackTargetContext(expectedChannel, expectedMediaKey, channel, mediaKey);
}
function _isAdOwnedPauseContext(channel = null, mediaKey = null) {
    return (_isPauseIntentSuppressed(channel, mediaKey) ||
        _doesActiveAdTargetPlayback(channel, mediaKey) ||
        _doesResumeIntentTargetPlayback(channel, mediaKey));
}
function _pausePlaybackTarget(target) {
    _markProgrammaticPause();
    try {
        target?.pause?.();
        return true;
    }
    catch {
        return false;
    }
}
function _playPlaybackTarget(target, channel = null, mediaKey = null) {
    if (_hasUserPauseIntent(channel, mediaKey)) {
        return false;
    }
    _markProgrammaticPlay();
    try {
        const playResult = target?.play?.();
        if (typeof playResult?.catch === "function") {
            playResult.catch(() => { });
        }
        return true;
    }
    catch {
        return false;
    }
}
function _isEditablePlaybackInteractionTarget(target) {
    if (!(target instanceof Element))
        return false;
    if (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement) {
        return true;
    }
    if (target instanceof HTMLElement && target.isContentEditable) {
        return true;
    }
    return Boolean(target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
}
function _hasPlaybackControlAriaLabel(node) {
    if (!(node instanceof Element))
        return false;
    const ariaLabel = node.getAttribute?.("aria-label")?.toLowerCase() || "";
    return (ariaLabel.includes("pause") ||
        ariaLabel.includes("play") ||
        ariaLabel.includes("resume"));
}
function _isPlaybackControlInteractionNode(node) {
    if (!(node instanceof Element))
        return false;
    return (node.matches?.(_PLAYER_CONTROL_INTERACTION_SELECTOR) ||
        _hasPlaybackControlAriaLabel(node));
}
function _isLikelyPlaybackControlInteraction(event) {
    if (!event || typeof event !== "object")
        return false;
    if (event.type === "keydown") {
        if (_isEditablePlaybackInteractionTarget(event.target)) {
            return false;
        }
        const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
        const code = typeof event.code === "string" ? event.code : "";
        return (code === "Space" ||
            code === "KeyK" ||
            key === " " ||
            key === "spacebar" ||
            key === "k" ||
            key === "mediaplaypause");
    }
    if (typeof event.button === "number" &&
        event.button !== 0 &&
        event.pointerType !== "touch" &&
        event.pointerType !== "pen") {
        return false;
    }
    const target = event.target;
    if (!(target instanceof Element))
        return false;
    if (_isEditablePlaybackInteractionTarget(target)) {
        return false;
    }
    if (target.closest?.(_PLAYER_CONTROL_INTERACTION_SELECTOR)) {
        return true;
    }
    const controlTarget = target.closest?.("button, [role='button']");
    if (_hasPlaybackControlAriaLabel(controlTarget)) {
        return true;
    }
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const node of path) {
        if (_isPlaybackControlInteractionNode(node)) {
            return true;
        }
    }
    return false;
}
function _initPlaybackControlInteractionMonitor() {
    if (_PlaybackIntentState.interactionMonitorInitialized ||
        typeof window === "undefined") {
        return;
    }
    const rememberInteraction = (event) => {
        if (!_isLikelyPlaybackControlInteraction(event)) {
            return;
        }
        _clearSecondaryPlayerHandoff();
        _rememberRecentPlaybackControlInteraction(null, _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey));
    };
    window.addEventListener("pointerdown", rememberInteraction, true);
    window.addEventListener("keydown", rememberInteraction, true);
    _PlaybackIntentState.interactionMonitorInitialized = true;
}
function _syncPrimaryMediaPlaybackIntent() {
    const media = _getPrimaryMediaElement();
    if (media === _PlaybackIntentState.observedMedia)
        return;
    _clearObservedPlaybackIntentMedia();
    if (!(media instanceof HTMLMediaElement))
        return;
    const isPlaying = !media.paused && !media.ended;
    _setPlayerIsPlaying(isPlaying);
    if (isPlaying) {
        _markPlayerHasPlayedOnce();
    }
    const handlePause = () => {
        _setPlayerIsPlaying(false);
        if (_wasRecentProgrammaticPlaybackAction("pause"))
            return;
        if (media.ended)
            return;
        if (!media.isConnected)
            return;
        const currentPrimaryMedia = _getPrimaryMediaElement();
        if (currentPrimaryMedia instanceof HTMLMediaElement &&
            currentPrimaryMedia !== media) {
            return;
        }
        const mediaKey = _resolvePlayerMediaKey(null, __TTVAB_STATE__.PageMediaKey);
        if (!mediaKey)
            return;
        const hadExplicitInteraction = _hasRecentPlaybackControlInteraction(null, mediaKey);
        const wasDuringAd = _isAdOwnedPauseContext(null, mediaKey);
        if (wasDuringAd && !hadExplicitInteraction) {
            return;
        }
        _PlaybackIntentState.userPausedMediaKey = mediaKey;
        _PlaybackIntentState.userPausedAt = Date.now();
        _PlaybackIntentState.userPausedHadExplicitInteraction =
            hadExplicitInteraction;
        _PlaybackIntentState.userPausedDuringAd = wasDuringAd;
    };
    const handlePlay = () => {
        _setPlayerIsPlaying(true);
        _markPlayerHasPlayedOnce();
        if (_wasRecentProgrammaticPlaybackAction("play"))
            return;
        _clearSecondaryPlayerHandoff();
        _clearUserPauseIntent(null, __TTVAB_STATE__.PageMediaKey);
    };
    media.addEventListener("pause", handlePause, true);
    media.addEventListener("play", handlePlay, true);
    _PlaybackIntentState.observedMedia = media;
    _PlaybackIntentState.pauseListener = handlePause;
    _PlaybackIntentState.playListener = handlePlay;
}
function _clearObservedPlaybackIntentMedia() {
    if (_PlaybackIntentState.observedMedia) {
        if (_PlaybackIntentState.pauseListener) {
            _PlaybackIntentState.observedMedia.removeEventListener("pause", _PlaybackIntentState.pauseListener, true);
        }
        if (_PlaybackIntentState.playListener) {
            _PlaybackIntentState.observedMedia.removeEventListener("play", _PlaybackIntentState.playListener, true);
        }
    }
    _PlaybackIntentState.observedMedia = null;
    _PlaybackIntentState.pauseListener = null;
    _PlaybackIntentState.playListener = null;
}
function _stopPlaybackIntentMonitor(detachObservedMedia = false) {
    if (_playbackIntentMonitorTimer) {
        clearTimeout(_playbackIntentMonitorTimer);
        _playbackIntentMonitorTimer = null;
    }
    if (detachObservedMedia) {
        _clearObservedPlaybackIntentMedia();
    }
    _playbackIntentMonitorStarted = false;
}
function _monitorPlaybackIntent() {
    let lastSyncedMediaKey = null;
    let lastSyncAttemptAt = 0;
    _initPlaybackControlInteractionMonitor();
    function check() {
        _playbackIntentMonitorTimer = null;
        let nextDelay = _PLAYBACK_INTENT_MONITOR_DELAY_MS;
        try {
            const hasRelevantContext = _hasPlaybackIntentMonitorRelevantContext();
            const currentMediaKey = _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey);
            const observedMedia = _PlaybackIntentState.observedMedia;
            const didLoseObservedMedia = Boolean(observedMedia && !observedMedia.isConnected);
            const idleSyncDelay = currentMediaKey
                ? _PLAYBACK_INTENT_IDLE_SYNC_DELAY_MS
                : _PLAYBACK_INTENT_NO_MEDIA_ROUTE_DELAY_MS;
            const isHidden = _isNativeDocumentHidden();
            const hiddenSyncDelay = Math.max(idleSyncDelay, 5000);
            const syncDelay = isHidden ? hiddenSyncDelay : idleSyncDelay;
            const now = Date.now();
            if (!hasRelevantContext) {
                _syncPrimaryMediaPlaybackIntent();
                nextDelay = syncDelay;
            }
            if (currentMediaKey !== lastSyncedMediaKey ||
                didLoseObservedMedia ||
                (!observedMedia?.isConnected && now - lastSyncAttemptAt >= syncDelay)) {
                lastSyncAttemptAt = now;
                _syncPrimaryMediaPlaybackIntent();
                lastSyncedMediaKey = currentMediaKey;
            }
            nextDelay = _PlaybackIntentState.observedMedia?.isConnected
                ? isHidden
                    ? hiddenSyncDelay
                    : _PLAYBACK_INTENT_MONITOR_DELAY_MS
                : syncDelay;
            if (currentMediaKey &&
                _PlaybackIntentState.userPausedMediaKey &&
                _PlaybackIntentState.userPausedMediaKey !== currentMediaKey) {
                _clearRecordedUserPauseIntent();
            }
            if (_PlaybackIntentState.suppressedPauseMediaKey &&
                currentMediaKey &&
                _PlaybackIntentState.suppressedPauseMediaKey !== currentMediaKey) {
                _PlaybackIntentState.suppressedPauseMediaKey = null;
                _PlaybackIntentState.suppressedPauseUntil = 0;
            }
        }
        catch (err) {
            _$l(`Playback intent monitor error: ${err.message}`, "warning");
        }
        _playbackIntentMonitorTimer = setTimeout(check, nextDelay);
    }
    check();
    _$l("Playback intent monitor active", "info");
}
function _hasLikelyPlaybackSurface() {
    const primaryMedia = _getPrimaryMediaElement();
    if (primaryMedia instanceof HTMLMediaElement && primaryMedia.isConnected) {
        return true;
    }
    const { player } = _$gps();
    const playerVideo = player?.getHTMLVideoElement?.() || null;
    return playerVideo instanceof HTMLMediaElement && playerVideo.isConnected;
}
function _hasPlaybackIntentMonitorRelevantContext() {
    if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__) {
        return false;
    }
    const currentMediaKey = _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey);
    const hasLiveOrVodContext = (__TTVAB_STATE__.PageMediaType === "live" ||
        __TTVAB_STATE__.PageMediaType === "vod") &&
        Boolean(currentMediaKey);
    const hasActiveAdContext = Boolean(__TTVAB_STATE__.CurrentAdMediaKey || __TTVAB_STATE__.CurrentAdChannel);
    const hasPendingPostAdRecovery = _hasPendingAdResumeIntent(__TTVAB_STATE__.PageChannel, currentMediaKey);
    const hasSecondaryPlayerHandoff = _hasActiveSecondaryPlayerHandoff(__TTVAB_STATE__.PageChannel, currentMediaKey);
    return (hasLiveOrVodContext ||
        hasActiveAdContext ||
        hasPendingPostAdRecovery ||
        hasSecondaryPlayerHandoff ||
        _hasLikelyPlaybackSurface());
}
function _hasPlayerBufferMonitorRelevantContext() {
    if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__) {
        return false;
    }
    const currentMediaKey = _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey);
    const hasLivePlaybackContext = __TTVAB_STATE__.PageMediaType === "live" && Boolean(currentMediaKey);
    const hasActiveAdContext = Boolean(__TTVAB_STATE__.CurrentAdMediaKey || __TTVAB_STATE__.CurrentAdChannel);
    const hasPendingPostAdRecovery = _hasPendingAdResumeIntent(__TTVAB_STATE__.PageChannel, currentMediaKey);
    const hasSecondaryPlayerHandoff = _hasActiveSecondaryPlayerHandoff(__TTVAB_STATE__.PageChannel, currentMediaKey);
    return (hasLivePlaybackContext ||
        hasActiveAdContext ||
        hasPendingPostAdRecovery ||
        hasSecondaryPlayerHandoff);
}
function _stopPlayerBufferMonitor(resetBufferState = true) {
    if (_playerBufferMonitorTimer) {
        clearTimeout(_playerBufferMonitorTimer);
        _playerBufferMonitorTimer = null;
    }
    _playerBufferMonitorStarted = false;
    _clearCachedPlayerRef();
    if (resetBufferState) {
        _resetPlayerBufferMonitorState();
        _$pbs.postAdUnhealthyCount = 0;
        _$pbs.postAdRecoveryStartedAt = 0;
    }
}
function _ensurePlaybackMonitorsRunning(forceStart = false) {
    let didStart = false;
    if (!_playbackIntentMonitorStarted &&
        (forceStart || _hasPlaybackIntentMonitorRelevantContext())) {
        _playbackIntentMonitorStarted = true;
        _monitorPlaybackIntent();
        didStart = true;
    }
    if (!_playerBufferMonitorStarted &&
        _$c.BUFFERING_FIX &&
        (forceStart ||
            (__TTVAB_STATE__.IsBufferFixEnabled === true &&
                _hasPlayerBufferMonitorRelevantContext()))) {
        _playerBufferMonitorStarted = true;
        _$mpb();
        didStart = true;
    }
    return didStart;
}
function _hookSecondaryPlayerHandoffDetection() {
    if (_PlaybackIntentState.secondaryPlayerLaunchMonitorInitialized ||
        typeof window === "undefined") {
        return;
    }
    if (!window.__TTVAB_WINDOW_OPEN_PATCHED__) {
        const nativeOpen = window.open;
        try {
            window.open = function patchedWindowOpen(...args) {
                let descriptor = null;
                let sourceWasPlaying = false;
                try {
                    descriptor = _getSecondaryPlayerLaunchDescriptorFromUrl(args[0]);
                    sourceWasPlaying = descriptor
                        ? _isPrimaryPlaybackCurrentlyActive()
                        : false;
                }
                catch { }
                const openedWindow = nativeOpen.apply(this, args);
                try {
                    if (descriptor) {
                        if (openedWindow) {
                            _beginSecondaryPlayerHandoff(descriptor, {
                                sourceWasPlaying,
                                pauseSource: descriptor.kind !== "pip",
                            });
                        }
                        else {
                            _rollbackSecondaryPlayerHandoff(descriptor.channel || null, descriptor.mediaKey || null, false);
                        }
                    }
                }
                catch { }
                return openedWindow;
            };
            window.__TTVAB_WINDOW_OPEN_PATCHED__ = true;
        }
        catch { }
    }
    if (!window.__TTVAB_REQUEST_PIP_PATCHED__) {
        const nativeRequestPictureInPicture = HTMLVideoElement?.prototype?.requestPictureInPicture;
        if (typeof nativeRequestPictureInPicture === "function") {
            try {
                HTMLVideoElement.prototype.requestPictureInPicture =
                    function patchedRequestPictureInPicture(...args) {
                        const result = nativeRequestPictureInPicture.apply(this, args);
                        if (typeof result?.then === "function") {
                            return result.then((value) => {
                                try {
                                    const descriptor = {
                                        kind: "pip",
                                        channel: _normalizePlayerChannel(__TTVAB_STATE__.PageChannel) ||
                                            null,
                                        mediaKey: _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey) ||
                                            _resolvePlayerMediaKey(__TTVAB_STATE__.PageChannel, null),
                                    };
                                    _beginSecondaryPlayerHandoff(descriptor, {
                                        pauseSource: false,
                                        sourceWasPlaying: _isPrimaryPlaybackCurrentlyActive(),
                                    });
                                    this.addEventListener("leavepictureinpicture", () => {
                                        if (_PlaybackIntentState.secondaryPlayerHandoffKind ===
                                            "pip") {
                                            _clearSecondaryPlayerHandoff();
                                        }
                                    }, { once: true, capture: true });
                                }
                                catch { }
                                return value;
                            });
                        }
                        return result;
                    };
                window.__TTVAB_REQUEST_PIP_PATCHED__ = true;
            }
            catch { }
        }
    }
    document.addEventListener("enterpictureinpicture", () => {
        _beginSecondaryPlayerHandoff({
            kind: "pip",
            channel: _normalizePlayerChannel(__TTVAB_STATE__.PageChannel) || null,
            mediaKey: _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey) ||
                _resolvePlayerMediaKey(__TTVAB_STATE__.PageChannel, null),
        }, {
            pauseSource: false,
            sourceWasPlaying: _isPrimaryPlaybackCurrentlyActive(),
        });
    }, true);
    document.addEventListener("leavepictureinpicture", () => {
        if (_PlaybackIntentState.secondaryPlayerHandoffKind === "pip") {
            _clearSecondaryPlayerHandoff();
        }
    }, true);
    _PlaybackIntentState.secondaryPlayerLaunchMonitorInitialized = true;
}
function _resumeActivePlayerIfPaused(channel = null, mediaKey = null) {
    const safeChannel = _normalizePlayerChannel(channel);
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    if (_hasUserPauseIntent(safeChannel, safeMediaKey)) {
        return false;
    }
    if (_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey)) {
        return false;
    }
    const { player, state: playerState } = _$gps();
    if (!player || !playerState?.props?.content) {
        return false;
    }
    const playerCore = _$gpc(player);
    const video = player.getHTMLVideoElement?.() || null;
    if (video?.ended)
        return false;
    const isPaused = _isPlayerPaused(player, playerCore, video);
    if (!isPaused)
        return false;
    return _playPlaybackTarget(player, safeChannel, safeMediaKey);
}
function _resumePrimaryPlaybackIfPaused(channel = null, mediaKey = null) {
    const safeChannel = _normalizePlayerChannel(channel);
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    if (_hasUserPauseIntent(safeChannel, safeMediaKey)) {
        return false;
    }
    if (_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey)) {
        return false;
    }
    if (_resumeActivePlayerIfPaused(safeChannel, safeMediaKey)) {
        return true;
    }
    const media = _getPrimaryMediaElement();
    if (!(media instanceof HTMLMediaElement) ||
        !media.isConnected ||
        media.ended ||
        !media.paused) {
        return false;
    }
    return _playPlaybackTarget(media, safeChannel, safeMediaKey);
}
function _guardPlaybackAcrossVisibilityTransition(channel = null, mediaKey = null) {
    const safeChannel = _normalizePlayerChannel(channel);
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    if (_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey)) {
        return;
    }
    const retryDelays = _isNativeDocumentHidden()
        ? _HIDDEN_VISIBILITY_RESUME_RETRY_DELAYS_MS
        : _VISIBILITY_RESUME_RETRY_DELAYS_MS;
    _resumePrimaryPlaybackIfPaused(safeChannel, safeMediaKey);
    for (const delay of retryDelays) {
        _schedulePlaybackRecoveryTimeout(() => {
            _resumePrimaryPlaybackIfPaused(safeChannel, safeMediaKey);
        }, delay, safeChannel, safeMediaKey);
    }
}
function _scheduleResumeRetries(channel = null, mediaKey = null, delays = [120, 350, 900], options = {}) {
    if (!Array.isArray(delays) || delays.length === 0)
        return;
    for (const delay of delays) {
        if (!Number.isFinite(delay) || delay < 0)
            continue;
        _schedulePlaybackRecoveryTimeout(() => {
            if (options.requireAdResumeIntent &&
                !_canAttemptAdResume(channel, mediaKey)) {
                return;
            }
            _resumeActivePlayerIfPaused(channel, mediaKey);
        }, delay, channel, mediaKey);
    }
}
function _getFallbackPrimaryVideoElement() {
    const videos = Array.from(document.querySelectorAll("video"));
    let bestVideo = null;
    let bestArea = 0;
    for (const video of videos) {
        if (!(video instanceof HTMLMediaElement))
            continue;
        const rect = video.getBoundingClientRect();
        const area = Math.max(0, rect.width) * Math.max(0, rect.height);
        if (area <= 0)
            continue;
        if (area > bestArea) {
            bestArea = area;
            bestVideo = video;
        }
    }
    return bestVideo;
}
let _cachedPrimaryMediaElement = null;
let _cachedPrimaryMediaElementKey = null;
let _cachedPrimaryMediaElementSearchedAt = 0;
function _getPrimaryMediaElement() {
    const currentMediaKey = typeof __TTVAB_STATE__ !== "undefined" && __TTVAB_STATE__
        ? __TTVAB_STATE__.PageMediaKey
        : null;
    const now = Date.now();
    if (_cachedPrimaryMediaElementKey === currentMediaKey) {
        if (_cachedPrimaryMediaElement?.isConnected) {
            return _cachedPrimaryMediaElement;
        }
        if (_cachedPrimaryMediaElement === null &&
            now - _cachedPrimaryMediaElementSearchedAt <
                _PLAYBACK_INTENT_IDLE_SYNC_DELAY_MS) {
            return null;
        }
    }
    const { player } = _$gps();
    const playerVideo = player?.getHTMLVideoElement?.() || null;
    const media = playerVideo instanceof HTMLMediaElement && playerVideo.isConnected
        ? playerVideo
        : _getFallbackPrimaryVideoElement();
    _cachedPrimaryMediaElement =
        media instanceof HTMLMediaElement && media.isConnected ? media : null;
    _cachedPrimaryMediaElementKey = currentMediaKey;
    _cachedPrimaryMediaElementSearchedAt = now;
    return media;
}
function _restoreSuppressedMediaElement(media, state) {
    if (!(media instanceof HTMLMediaElement))
        return false;
    try {
        media.defaultMuted = Boolean(state?.defaultMuted);
        media.muted = Boolean(state?.muted);
        if (Number.isFinite(state?.volume)) {
            media.volume = Math.min(1, Math.max(0, state.volume));
        }
        media.removeAttribute("data-ttvab-audio-suppressed");
        return true;
    }
    catch {
        return false;
    }
}
function _pruneDisconnectedSuppressedMedia() {
    let prunedCount = 0;
    for (const [media] of _AdAudioSuppressionState.suppressedMedia.entries()) {
        if (media instanceof HTMLMediaElement && media.isConnected)
            continue;
        _AdAudioSuppressionState.suppressedMedia.delete(media);
        prunedCount += 1;
    }
    if (_AdAudioSuppressionState.suppressedMedia.size === 0) {
        _AdAudioSuppressionState.activeMediaKey = null;
        _AdAudioSuppressionState.lastSuppressedCount = 0;
    }
    else if (prunedCount > 0) {
        _AdAudioSuppressionState.lastSuppressedCount = Math.max(0, _AdAudioSuppressionState.suppressedMedia.size);
    }
    return prunedCount;
}
function _clearSuppressedMediaTracking(options = {}) {
    const { restoreConnected = false } = options;
    let restoredCount = 0;
    for (const [media, state,] of _AdAudioSuppressionState.suppressedMedia.entries()) {
        if (restoreConnected &&
            media instanceof HTMLMediaElement &&
            media.isConnected &&
            _restoreSuppressedMediaElement(media, state)) {
            restoredCount += 1;
        }
    }
    _AdAudioSuppressionState.suppressedMedia.clear();
    _AdAudioSuppressionState.activeMediaKey = null;
    _AdAudioSuppressionState.lastSuppressedCount = 0;
    return restoredCount;
}
function _suppressCompetingMediaDuringAd(channel = null, mediaKey = null) {
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    const primaryMedia = _getPrimaryMediaElement();
    let suppressedCount = 0;
    _pruneDisconnectedSuppressedMedia();
    for (const media of document.querySelectorAll("video, audio")) {
        if (!(media instanceof HTMLMediaElement))
            continue;
        if (!media.isConnected || media.ended)
            continue;
        if (primaryMedia && media === primaryMedia)
            continue;
        if (media.paused && (media.muted || Number(media.volume ?? 1) === 0)) {
            continue;
        }
        if (!_AdAudioSuppressionState.suppressedMedia.has(media)) {
            _AdAudioSuppressionState.suppressedMedia.set(media, {
                muted: media.muted,
                defaultMuted: media.defaultMuted,
                volume: Number.isFinite(media.volume) ? media.volume : 1,
            });
        }
        try {
            media.defaultMuted = true;
            media.muted = true;
            media.volume = 0;
            media.setAttribute("data-ttvab-audio-suppressed", "true");
            suppressedCount += 1;
        }
        catch { }
    }
    _AdAudioSuppressionState.activeMediaKey = safeMediaKey;
    _AdAudioSuppressionState.lastSuppressedCount = suppressedCount;
    if (suppressedCount > 0) {
        _$l(`Suppressed ${suppressedCount} competing media element${suppressedCount === 1 ? "" : "s"} during ad recovery`, "info");
    }
    return suppressedCount;
}
function _restoreSuppressedMediaAfterAd(channel = null, mediaKey = null) {
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    const activeMediaKey = _AdAudioSuppressionState.activeMediaKey;
    _pruneDisconnectedSuppressedMedia();
    if (safeMediaKey && activeMediaKey && safeMediaKey !== activeMediaKey) {
        return 0;
    }
    let restoredCount = 0;
    for (const [media, state,] of _AdAudioSuppressionState.suppressedMedia.entries()) {
        if (_restoreSuppressedMediaElement(media, state)) {
            restoredCount += 1;
        }
    }
    _AdAudioSuppressionState.suppressedMedia.clear();
    _AdAudioSuppressionState.activeMediaKey = null;
    _AdAudioSuppressionState.lastSuppressedCount = 0;
    if (restoredCount > 0) {
        _$l(`Restored ${restoredCount} suppressed media element${restoredCount === 1 ? "" : "s"} after ad`, "info");
    }
    return restoredCount;
}
function _$cari() {
    __TTVAB_STATE__.ShouldResumeAfterAd = false;
    __TTVAB_STATE__.ShouldResumeAfterAdChannel = null;
    __TTVAB_STATE__.ShouldResumeAfterAdMediaKey = null;
    __TTVAB_STATE__.ShouldResumeAfterAdUntil = 0;
}
function _isCurrentAdCycleMatchingResumeIntent() {
    const expectedChannel = _normalizePlayerChannel(__TTVAB_STATE__.ShouldResumeAfterAdChannel);
    const expectedMediaKey = _normalizeMediaKey(__TTVAB_STATE__.ShouldResumeAfterAdMediaKey);
    const activeAdChannel = _normalizePlayerChannel(__TTVAB_STATE__.CurrentAdChannel);
    const activeAdMediaKey = _normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey);
    if (expectedMediaKey && activeAdMediaKey) {
        return expectedMediaKey === activeAdMediaKey;
    }
    if (expectedChannel && activeAdChannel) {
        return expectedChannel === activeAdChannel;
    }
    return false;
}
function _extendAdResumeIntentWindow() {
    if (__TTVAB_STATE__.ShouldResumeAfterAd !== true) {
        return false;
    }
    __TTVAB_STATE__.ShouldResumeAfterAdUntil =
        Date.now() + _AD_RESUME_INTENT_WINDOW_MS;
    return true;
}
function _maybeClearTransientPauseIntentAfterAd(channel = null, mediaKey = null) {
    const safeChannel = _normalizePlayerChannel(channel);
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    if (!_hasUserPauseIntent(safeChannel, safeMediaKey))
        return false;
    if (!_hasPendingAdResumeIntent(safeChannel, safeMediaKey))
        return false;
    const pauseAt = Number(_PlaybackIntentState.userPausedAt) || 0;
    const pauseWasDuringAdWithoutInteraction = _PlaybackIntentState.userPausedDuringAd === true &&
        _PlaybackIntentState.userPausedHadExplicitInteraction !== true;
    const lastAdDetectedAt = Number(__TTVAB_STATE__.LastAdDetectedAt) || 0;
    const pauseWasNearAdStart = lastAdDetectedAt > 0 &&
        pauseAt > 0 &&
        pauseAt <= lastAdDetectedAt + _AD_TRANSIENT_PAUSE_CLEAR_WINDOW_MS &&
        _PlaybackIntentState.userPausedHadExplicitInteraction !== true;
    const wasLikelyTransient = pauseWasDuringAdWithoutInteraction || pauseWasNearAdStart;
    if (!wasLikelyTransient)
        return false;
    return _clearUserPauseIntent(safeChannel, safeMediaKey);
}
function _canAttemptAdResume(channel = null, mediaKey = null) {
    const safeChannel = _normalizePlayerChannel(channel);
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    if (_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey)) {
        _$cari();
        return false;
    }
    if (!_hasPendingAdResumeIntent(safeChannel, safeMediaKey))
        return false;
    _maybeClearTransientPauseIntentAfterAd(safeChannel, safeMediaKey);
    return !_hasUserPauseIntent(safeChannel, safeMediaKey);
}
function _hasPendingAdResumeIntent(channel = null, mediaKey = null) {
    const until = Number(__TTVAB_STATE__.ShouldResumeAfterAdUntil) || 0;
    if (__TTVAB_STATE__.ShouldResumeAfterAd !== true) {
        return false;
    }
    if (until <= Date.now()) {
        if (!_isCurrentAdCycleMatchingResumeIntent()) {
            _$cari();
            return false;
        }
        _extendAdResumeIntentWindow();
    }
    const safeChannel = _normalizePlayerChannel(channel);
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    const expectedChannel = __TTVAB_STATE__.ShouldResumeAfterAdChannel || null;
    const expectedMediaKey = __TTVAB_STATE__.ShouldResumeAfterAdMediaKey || null;
    return _matchesPlaybackTargetContext(expectedChannel, expectedMediaKey, safeChannel, safeMediaKey);
}
function _$rpfa(channel = null, mediaKey = null) {
    const safeChannel = _normalizePlayerChannel(channel) ||
        _normalizePlayerChannel(__TTVAB_STATE__.CurrentAdChannel) ||
        _normalizePlayerChannel(__TTVAB_STATE__.PageChannel);
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    const { player, state: playerState } = _$gps();
    if (safeMediaKey &&
        _PlaybackIntentState.userPausedMediaKey === safeMediaKey &&
        _PlaybackIntentState.userPausedHadExplicitInteraction !== true &&
        Date.now() - (Number(_PlaybackIntentState.userPausedAt) || 0) <=
            _AD_TRANSIENT_PAUSE_CLEAR_WINDOW_MS) {
        _clearUserPauseIntent(safeChannel, safeMediaKey);
    }
    let shouldResumeAfterAd = !_hasUserPauseIntent(safeChannel, safeMediaKey) &&
        !_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey);
    if (player && playerState?.props?.content) {
        const video = player.getHTMLVideoElement?.() || null;
        const contentType = typeof playerState?.props?.content?.type === "string"
            ? playerState.props.content.type
            : null;
        const allowEndedReplayRecovery = typeof contentType === "string" && contentType !== "live";
        shouldResumeAfterAd =
            shouldResumeAfterAd && (!video?.ended || allowEndedReplayRecovery);
    }
    __TTVAB_STATE__.ShouldResumeAfterAd = shouldResumeAfterAd;
    __TTVAB_STATE__.ShouldResumeAfterAdChannel = shouldResumeAfterAd
        ? safeChannel
        : null;
    __TTVAB_STATE__.ShouldResumeAfterAdMediaKey = shouldResumeAfterAd
        ? safeMediaKey
        : null;
    __TTVAB_STATE__.ShouldResumeAfterAdUntil = shouldResumeAfterAd
        ? Date.now() + _AD_RESUME_INTENT_WINDOW_MS
        : 0;
}
function _resumeActivePlayerAfterAd(channel = null, mediaKey = null) {
    if (!_canAttemptAdResume(channel, mediaKey))
        return false;
    return _resumeActivePlayerIfPaused(channel, mediaKey);
}
function _$rpa(channel = null, mediaKey = null) {
    const safeChannel = _normalizePlayerChannel(channel);
    const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
    if (_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey)) {
        _$cari();
        return false;
    }
    if (!_hasPendingAdResumeIntent(safeChannel, safeMediaKey))
        return false;
    const { player, state: playerState } = _$gps();
    if (!player || !playerState?.props?.content) {
        return false;
    }
    const playerCore = _$gpc(player);
    const video = player.getHTMLVideoElement?.() || null;
    if (video?.ended) {
        _$l("Player ended after ad; deferring recovery to buffer monitor", "info");
        return false;
    }
    _maybeClearTransientPauseIntentAfterAd(safeChannel, safeMediaKey);
    if (_hasUserPauseIntent(safeChannel, safeMediaKey)) {
        _$cari();
        return false;
    }
    if (_isPlaybackHealthyAfterAd(player, playerCore, video)) {
        _armPostAdGraceWindow(Number(video?.currentTime) || 0);
        _$cari();
        return false;
    }
    const isPaused = _isPlayerPaused(player, playerCore, video);
    if (!isPaused) {
        return false;
    }
    const now = Date.now();
    if (__TTVAB_STATE__.LastAdRecoveryResumeAt &&
        now - __TTVAB_STATE__.LastAdRecoveryResumeAt < 1500) {
        _$l("Suppressing duplicate programmatic resume", "warning");
        return false;
    }
    __TTVAB_STATE__.LastAdRecoveryResumeAt = now;
    const didResume = _playPlaybackTarget(player, safeChannel, safeMediaKey);
    if (!didResume) {
        if (_hasUserPauseIntent(safeChannel, safeMediaKey)) {
            _$cari();
            _$l("Skipping post-ad resume because playback is user-paused", "info");
        }
        return false;
    }
    _schedulePlaybackRecoveryTimeout(() => {
        if (!_hasPendingAdResumeIntent(safeChannel, safeMediaKey))
            return;
        const { player: confirmPlayer } = _$gps();
        const confirmCore = _$gpc(confirmPlayer);
        const confirmVideo = confirmPlayer?.getHTMLVideoElement?.() || null;
        if (_isPlaybackHealthyAfterAd(confirmPlayer, confirmCore, confirmVideo)) {
            _armPostAdGraceWindow(Number(confirmVideo?.currentTime) || 0);
            _$cari();
        }
    }, 900, safeChannel, safeMediaKey);
    _$l("Resuming player after ad", "info");
    return true;
}
function _retryPostAdPauseResume(channel = null, mediaKey = null) {
    const now = Date.now();
    if (__TTVAB_STATE__.LastAdRecoveryResumeAt &&
        now - __TTVAB_STATE__.LastAdRecoveryResumeAt <
            _POST_AD_PAUSE_RESUME_RETRY_MS) {
        return false;
    }
    __TTVAB_STATE__.LastAdRecoveryResumeAt = now;
    const didRetry = _$dpt(true, false, { reason: "ad-recovery" });
    if (didRetry) {
        _scheduleResumeRetries(channel, mediaKey, [250, 700, 1400]);
    }
    return Boolean(didRetry);
}
function _resetPostAdGrace() {
    _$pbs.postAdGraceUntil = 0;
    _$pbs.postAdGraceLastCurrentTime = 0;
    _$pbs.postAdGraceStallTicks = 0;
    _$pbs.postAdGracePauseResumeAt = 0;
    _$pbs.postAdGraceReloadAttempted = false;
}
function _armPostAdGraceWindow(currentTime = 0) {
    _$pbs.postAdGraceUntil = Date.now() + _POST_AD_GRACE_WINDOW_MS;
    _$pbs.postAdGraceLastCurrentTime = Number(currentTime) || 0;
    _$pbs.postAdGraceStallTicks = 0;
    _$pbs.postAdGracePauseResumeAt = 0;
    _$pbs.postAdGraceReloadAttempted = false;
}
function _handlePostAdGraceWatch(player, playerCore = null, video = null, channel = null, mediaKey = null, contentType = null) {
    const now = Date.now();
    if (_$pbs.postAdGraceUntil <= 0 ||
        now > _$pbs.postAdGraceUntil) {
        if (_$pbs.postAdGraceUntil > 0)
            _resetPostAdGrace();
        return false;
    }
    if (_shouldSuppressAutomaticPlaybackResume(channel, mediaKey)) {
        _resetPostAdGrace();
        return false;
    }
    const liveVideo = video || player?.getHTMLVideoElement?.() || null;
    if (!liveVideo)
        return false;
    if (liveVideo.ended) {
        _resetPostAdGrace();
        return false;
    }
    if (_isPlayerPaused(player, playerCore, liveVideo)) {
        _$pbs.postAdGraceLastCurrentTime =
            Number(liveVideo.currentTime) || 0;
        _$pbs.postAdGraceStallTicks = 0;
        return false;
    }
    const liveCurrentTime = Number(liveVideo.currentTime) || 0;
    const liveVideoWidth = Number(liveVideo.videoWidth) || 0;
    const advanced = liveCurrentTime > _$pbs.postAdGraceLastCurrentTime + 0.05;
    if (advanced) {
        _$pbs.postAdGraceStallTicks = 0;
    }
    else {
        _$pbs.postAdGraceStallTicks++;
    }
    _$pbs.postAdGraceLastCurrentTime = liveCurrentTime;
    const isStalled = liveVideoWidth <= 0 ||
        _$pbs.postAdGraceStallTicks >=
            _POST_AD_GRACE_STALL_TICKS_REQUIRED;
    if (!isStalled)
        return false;
    if (now - _$pbs.postAdGracePauseResumeAt >=
        _POST_AD_GRACE_PAUSE_RESUME_COOLDOWN_MS) {
        _$pbs.postAdGracePauseResumeAt = now;
        _$pbs.postAdGraceStallTicks = 0;
        _$l("Post-ad stall detected. Nudging player with pause/play...", "warning");
        _$dpt(true, false, { reason: "ad-recovery" });
        _scheduleResumeRetries(channel, mediaKey, [250, 700, 1400]);
        return true;
    }
    if (_$pbs.lastFixTime >
        now - _POST_AD_RECOVERY_RELOAD_COOLDOWN_MS) {
        return false;
    }
    const escalateToNewInstance = _$pbs.postAdGraceReloadAttempted;
    _$l(contentType && contentType !== "live"
        ? escalateToNewInstance
            ? "Replay/VOD player still stalling in post-ad window. Rebuilding native player..."
            : "Replay/VOD player still stalling in post-ad window. Reloading native player..."
        : escalateToNewInstance
            ? "Player still stalling in post-ad window. Rebuilding native player..."
            : "Player still stalling in post-ad window. Reloading native player...", "warning");
    _$dpt(false, true, {
        reason: "ad-recovery",
        refreshAccessToken: true,
        newMediaPlayerInstance: escalateToNewInstance,
    });
    _$pbs.lastFixTime = now;
    if (escalateToNewInstance) {
        _resetPostAdGrace();
    }
    else {
        _$pbs.postAdGraceReloadAttempted = true;
        _$pbs.postAdGraceStallTicks = 0;
    }
    return true;
}
function _handlePendingPostAdRecovery(player, playerCore = null, video = null, channel = null, mediaKey = null, contentType = null) {
    if (_shouldSuppressAutomaticPlaybackResume(channel, mediaKey)) {
        _$cari();
        _$pbs.postAdUnhealthyCount = 0;
        _$pbs.postAdRecoveryStartedAt = 0;
        _$pbs.postAdLastCurrentTime = 0;
        _$pbs.postAdStallTicks = 0;
        _$pbs.postAdSoftReloadAttempted = false;
        return false;
    }
    const now = Date.now();
    const isCycleStart = !_$pbs.postAdRecoveryStartedAt;
    if (isCycleStart) {
        _$pbs.postAdRecoveryStartedAt = now;
        _$pbs.postAdLastCurrentTime = 0;
        _$pbs.postAdStallTicks = 0;
        _$pbs.postAdSoftReloadAttempted = false;
    }
    const recoveryAge = now - _$pbs.postAdRecoveryStartedAt;
    const canSoftReload = recoveryAge >= _POST_AD_SOFT_RELOAD_DELAY_MS;
    const liveVideo = video || player?.getHTMLVideoElement?.() || null;
    const liveCurrentTime = Number(liveVideo?.currentTime) || 0;
    const liveVideoWidth = Number(liveVideo?.videoWidth) || 0;
    const isLivePaused = _isPlayerPaused(player, playerCore, liveVideo);
    const advanced = !isCycleStart &&
        liveCurrentTime > _$pbs.postAdLastCurrentTime + 0.05;
    if (!isLivePaused && !isCycleStart && !advanced) {
        _$pbs.postAdStallTicks++;
    }
    else if (advanced) {
        _$pbs.postAdStallTicks = 0;
    }
    _$pbs.postAdLastCurrentTime = liveCurrentTime;
    const isDeadFrame = !isLivePaused &&
        !liveVideo?.ended &&
        (liveVideoWidth <= 0 || _$pbs.postAdStallTicks >= 2);
    if (_isPlaybackHealthyAfterAd(player, playerCore, video)) {
        _armPostAdGraceWindow(liveCurrentTime);
        _$cari();
        _$pbs.postAdUnhealthyCount = 0;
        _$pbs.postAdRecoveryStartedAt = 0;
        _$pbs.postAdLastCurrentTime = 0;
        _$pbs.postAdStallTicks = 0;
        _$pbs.postAdSoftReloadAttempted = false;
        return true;
    }
    if (isDeadFrame &&
        _$pbs.lastFixTime <= now - _POST_AD_RECOVERY_RELOAD_COOLDOWN_MS) {
        _$l("Player frozen after ad (no advancing frames). Rebuilding native player...", "warning");
        _$dpt(false, true, {
            reason: "ad-recovery",
            refreshAccessToken: true,
            newMediaPlayerInstance: true,
        });
        _$cari();
        _$pbs.lastFixTime = Date.now();
        _$pbs.postAdUnhealthyCount = 0;
        _$pbs.postAdRecoveryStartedAt = 0;
        _$pbs.postAdLastCurrentTime = 0;
        _$pbs.postAdStallTicks = 0;
        _$pbs.postAdSoftReloadAttempted = true;
        return true;
    }
    if (video?.ended) {
        if (!canSoftReload) {
            _$pbs.postAdUnhealthyCount++;
            _retryPostAdPauseResume(channel, mediaKey);
            return true;
        }
        _$l(contentType && contentType !== "live"
            ? "Replay/VOD player ended after ad. Reloading native player..."
            : "Player hit end of stream after ad. Reloading native player...", "warning");
        _$dpt(false, true, {
            reason: "ad-recovery",
            refreshAccessToken: true,
            newMediaPlayerInstance: false,
        });
        _$cari();
        _$pbs.lastFixTime = Date.now();
        _$pbs.postAdUnhealthyCount = 0;
        _$pbs.postAdRecoveryStartedAt = 0;
        return true;
    }
    if (_isPlayerPaused(player, playerCore, video) &&
        (!__TTVAB_STATE__.LastAdRecoveryResumeAt ||
            Date.now() - __TTVAB_STATE__.LastAdRecoveryResumeAt >= 1500) &&
        _$rpa(channel, mediaKey)) {
        _$pbs.postAdUnhealthyCount++;
        return true;
    }
    _$pbs.postAdUnhealthyCount++;
    if (_$pbs.postAdUnhealthyCount >=
        _POST_AD_UNHEALTHY_RELOAD_COUNT &&
        _$pbs.lastFixTime <= now - _POST_AD_RECOVERY_RELOAD_COOLDOWN_MS) {
        if (!canSoftReload) {
            if (_retryPostAdPauseResume(channel, mediaKey)) {
                _$pbs.lastFixTime = now;
            }
            return true;
        }
        const escalateToNewInstance = _$pbs.postAdSoftReloadAttempted;
        _$l(contentType && contentType !== "live"
            ? escalateToNewInstance
                ? "Replay/VOD player still stalling after ad. Rebuilding native player..."
                : "Replay/VOD player still stalling after ad. Reloading native player..."
            : escalateToNewInstance
                ? "Player still stalling after ad. Rebuilding native player..."
                : "Player still stalling after ad. Reloading native player...", "warning");
        _$dpt(false, true, {
            reason: "ad-recovery",
            refreshAccessToken: true,
            newMediaPlayerInstance: escalateToNewInstance,
        });
        _$cari();
        _$pbs.lastFixTime = Date.now();
        _$pbs.postAdUnhealthyCount = 0;
        _$pbs.postAdRecoveryStartedAt = 0;
        _$pbs.postAdLastCurrentTime = 0;
        _$pbs.postAdStallTicks = 0;
        _$pbs.postAdSoftReloadAttempted = true;
        return true;
    }
    return false;
}
function _$cps(playerCore = null, media = null, context = {}) {
    const snapshot = Object.create(null);
    try {
        for (const key of _$ppk) {
            snapshot[key] = localStorage.getItem(key);
        }
        if (playerCore?.state?.quality?.group) {
            snapshot["video-quality"] = JSON.stringify({
                default: playerCore.state.quality.group,
            });
        }
        const sourceMedia = media instanceof HTMLMediaElement ? media : _getPrimaryMediaElement();
        const volume = Number(sourceMedia?.volume ?? playerCore?.state?.volume);
        snapshot.__mediaState = {
            defaultMuted: Boolean(sourceMedia?.defaultMuted),
            muted: Boolean(sourceMedia?.muted ?? playerCore?.state?.muted),
            volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : null,
        };
        snapshot.__playbackContext = {
            channel: _normalizePlayerChannel(context.channel),
            mediaKey: _normalizeMediaKey(context.mediaKey),
        };
    }
    catch (err) {
        _$l(`Preference snapshot failed: ${err.message}`, "warning");
        return null;
    }
    return snapshot;
}
function _restorePlayerMediaPreferenceSnapshot(mediaState, options = {}) {
    if (!mediaState || typeof mediaState !== "object")
        return false;
    const safeChannel = _normalizePlayerChannel(options.channel);
    const safeMediaKey = _normalizeMediaKey(options.mediaKey);
    if ((safeChannel || safeMediaKey) &&
        !_isPlaybackRecoveryContextCurrent(safeChannel, safeMediaKey)) {
        return false;
    }
    const { player } = _$gps();
    const media = player?.getHTMLVideoElement?.() || _getPrimaryMediaElement();
    if (!(media instanceof HTMLMediaElement) || !media.isConnected) {
        return false;
    }
    try {
        media.defaultMuted = Boolean(mediaState.defaultMuted);
        media.muted = Boolean(mediaState.muted);
        if (Number.isFinite(mediaState.volume)) {
            media.volume = Math.min(1, Math.max(0, Number(mediaState.volume)));
        }
        return true;
    }
    catch {
        return false;
    }
}
function _$rps2(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== "object")
        return false;
    const safeChannel = _normalizePlayerChannel(options.channel);
    const safeMediaKey = _normalizeMediaKey(options.mediaKey);
    if ((safeChannel || safeMediaKey) &&
        !_isPlaybackRecoveryContextCurrent(safeChannel, safeMediaKey)) {
        return false;
    }
    try {
        for (const key of _$ppk) {
            if (!Object.hasOwn(snapshot, key))
                continue;
            const value = snapshot[key];
            if (value === null || typeof value === "undefined") {
                localStorage.removeItem(key);
                continue;
            }
            localStorage.setItem(key, String(value));
        }
        _restorePlayerMediaPreferenceSnapshot(snapshot.__mediaState, options);
    }
    catch (err) {
        _$l(`Preference restore failed: ${err.message}`, "warning");
        return false;
    }
    return true;
}
function _schedulePlayerMediaPreferenceRestores(snapshot, channel = null, mediaKey = null, delays = [120, 500, 1500, 3000]) {
    if (!snapshot?.__mediaState)
        return false;
    for (const delay of delays) {
        _schedulePlaybackRecoveryTimeout(() => {
            _restorePlayerMediaPreferenceSnapshot(snapshot.__mediaState, {
                channel,
                mediaKey,
            });
        }, delay, channel, mediaKey);
    }
    return true;
}
function _schedulePlayerPreferenceRestore(snapshot, channel = null, mediaKey = null, delay = 3000) {
    if (!snapshot || typeof snapshot !== "object") {
        return false;
    }
    const safeChannel = _normalizePlayerChannel(channel);
    const safeMediaKey = _normalizeMediaKey(mediaKey);
    _clearPendingPlayerPreferenceRestore();
    _PlayerPreferenceRestoreState.channel = safeChannel;
    _PlayerPreferenceRestoreState.mediaKey = safeMediaKey;
    _PlayerPreferenceRestoreState.timeoutId = setTimeout(() => {
        const restoreChannel = _PlayerPreferenceRestoreState.channel;
        const restoreMediaKey = _PlayerPreferenceRestoreState.mediaKey;
        _clearPendingPlayerPreferenceRestore();
        _$rps2(snapshot, {
            channel: restoreChannel,
            mediaKey: restoreMediaKey,
        });
    }, Math.max(0, delay));
    return true;
}
function _$dpt(isPausePlay, isReload, options = {}) {
    const { player, state: playerState } = _$gps();
    if (!player) {
        _$l("Could not find player", "warning");
        return;
    }
    if (!playerState && isReload) {
        _$l("Could not find player state for reload", "warning");
        return;
    }
    const playerCore = _$gpc(player);
    const reason = options.reason || "manual";
    if (isReload) {
        const needsRealReload = options.refreshAccessToken === true ||
            options.newMediaPlayerInstance === true;
        if (document.pictureInPictureElement) {
            if (needsRealReload) {
                _$l("Forcing real reload despite PiP for HEVC handoff", "info");
            }
            else {
                _pausePlaybackTarget(player);
                setTimeout(() => {
                    const { player: freshPlayer } = _$gps();
                    _playPlaybackTarget(freshPlayer || player, __TTVAB_STATE__.PageChannel, __TTVAB_STATE__.PageMediaKey);
                }, 50);
                _$l("Downgraded reload to pause/play to preserve PiP", "info");
                return true;
            }
        }
    }
    const shouldSuppressAutomaticTask = reason !== "manual" &&
        _shouldSuppressAutomaticPlaybackResume(__TTVAB_STATE__.PageChannel, __TTVAB_STATE__.PageMediaKey);
    if (shouldSuppressAutomaticTask) {
        if (reason === "ad-recovery" || reason === "buffer-recovery") {
            _$cari();
        }
        return false;
    }
    if (isPausePlay) {
        if (_isPlayerPaused(player, playerCore)) {
            return false;
        }
        _pausePlaybackTarget(player);
        setTimeout(() => {
            const { player: freshPlayer } = _$gps();
            const resumeTarget = freshPlayer || player;
            _playPlaybackTarget(resumeTarget, __TTVAB_STATE__.PageChannel, __TTVAB_STATE__.PageMediaKey);
        }, 50);
        return true;
    }
    if (isReload) {
        const isAdRecoveryReload = reason === "ad-recovery";
        const isPlaybackRecoveryReload = isAdRecoveryReload || reason === "buffer-recovery";
        const now = Date.now();
        const lastPlayerReloadAt = __TTVAB_STATE__?.LastPlayerReloadAt || 0;
        if (lastPlayerReloadAt &&
            now - lastPlayerReloadAt < __TTVAB_STATE__.PlayerReloadDebounceMs) {
            _$l(`Suppressing duplicate reload (${reason})`, "warning");
            return false;
        }
        if (isAdRecoveryReload && __TTVAB_STATE__.LastAdRecoveryReloadAt) {
            const consecutiveFailures = Math.max(0, Number(__TTVAB_STATE__._AdRecoveryConsecutiveFailures) || 0);
            const baseCooldown = __TTVAB_STATE__.AdRecoveryReloadCooldownMs || 10000;
            const backoffCooldown = Math.min(60000, baseCooldown * 2 ** Math.min(consecutiveFailures, 3));
            if (now - __TTVAB_STATE__.LastAdRecoveryReloadAt < backoffCooldown) {
                if (consecutiveFailures > 0) {
                    _$l(`Suppressing ad recovery reload — downgrading to pause/resume (backoff ${Math.round(backoffCooldown / 1000)}s, attempt #${consecutiveFailures + 1})`, "warning");
                }
                isPausePlay = true;
                isReload = false;
            }
        }
        __TTVAB_STATE__.LastPlayerReloadAt = now;
        if (isAdRecoveryReload) {
            __TTVAB_STATE__.LastAdRecoveryReloadAt = now;
            __TTVAB_STATE__._AdRecoveryConsecutiveFailures =
                (Number(__TTVAB_STATE__._AdRecoveryConsecutiveFailures) || 0) + 1;
        }
        if (reason !== "manual") {
            _suppressPauseIntent(__TTVAB_STATE__.PageChannel, __TTVAB_STATE__.PageMediaKey, 3000);
        }
        _clearCachedPlayerRef(true, __TTVAB_STATE__.PlayerReloadDebounceMs || 0);
        const preferenceSnapshot = _$cps(playerCore, player?.getHTMLVideoElement?.() || null, {
            channel: __TTVAB_STATE__.PageChannel,
            mediaKey: __TTVAB_STATE__.PageMediaKey,
        });
        if (reason === "manual") {
            _$l("Reloading player", "info");
        }
        playerState.setSrc({
            isNewMediaPlayerInstance: options.newMediaPlayerInstance !== false,
            refreshAccessToken: options.refreshAccessToken !== false,
        });
        _$bw({
            key: "TriggeredPlayerReload",
            value: {
                mediaType: __TTVAB_STATE__?.PageMediaType ?? null,
                channelName: __TTVAB_STATE__?.PageChannel ?? null,
                vodID: __TTVAB_STATE__?.PageVodID ?? null,
                mediaKey: __TTVAB_STATE__?.PageMediaKey ?? null,
            },
        });
        _playPlaybackTarget(player, __TTVAB_STATE__.PageChannel, __TTVAB_STATE__.PageMediaKey);
        _scheduleResumeRetries(__TTVAB_STATE__.PageChannel, __TTVAB_STATE__.PageMediaKey, [180, 500, 1100]);
        if (isPlaybackRecoveryReload) {
            _schedulePlaybackRecoveryTimeout(() => {
                try {
                    const { player: livePlayer, state: liveState } = _$gps();
                    const confirmType = liveState?.props?.content?.type;
                    if ((confirmType === "live" || confirmType === "rerun") &&
                        livePlayer) {
                        const liveCore = _$gpc(livePlayer);
                        const liveVideo = livePlayer.getHTMLVideoElement?.();
                        if (liveVideo &&
                            !liveVideo.ended &&
                            liveVideo.buffered?.length > 0) {
                            const liveEdge = liveVideo.buffered.end(liveVideo.buffered.length - 1);
                            const videoCurrentPos = Number(liveVideo.currentTime);
                            const currentPos = Number.isFinite(videoCurrentPos)
                                ? videoCurrentPos
                                : Number(liveCore?.state?.position) || 0;
                            if (liveEdge - currentPos > 2) {
                                liveVideo.currentTime = Math.max(0, liveEdge - 0.5);
                                _$l(`Post-ad live edge seek (drift=${(liveEdge - currentPos).toFixed(1)}s)`, "info");
                            }
                        }
                    }
                }
                catch { }
            }, 1500, __TTVAB_STATE__.PageChannel, __TTVAB_STATE__.PageMediaKey);
        }
        if (preferenceSnapshot) {
            _schedulePlayerMediaPreferenceRestores(preferenceSnapshot, __TTVAB_STATE__.PageChannel, __TTVAB_STATE__.PageMediaKey);
            _schedulePlayerPreferenceRestore(preferenceSnapshot, __TTVAB_STATE__.PageChannel, __TTVAB_STATE__.PageMediaKey, 3000);
        }
        return true;
    }
    return false;
}
function _checkPinnedBackupStall(player) {
    const _resetStallState = () => {
        _PinnedBackupStallState.firstObservedAt = 0;
        _PinnedBackupStallState.lastCurrentTime = 0;
        _PinnedBackupStallState.lastBufferedEnd = 0;
        _PinnedBackupStallState.lastPinnedType = null;
        _PinnedBackupStallState.forceRefreshCount = 0;
        _PinnedBackupStallState.exhaustedLogged = false;
    };
    if (!__TTVAB_STATE__?.IsBufferFixEnabled) {
        _resetStallState();
        return;
    }
    const pinnedType = __TTVAB_STATE__.PinnedBackupPlayerType;
    if (!pinnedType) {
        _resetStallState();
        return;
    }
    if (_PinnedBackupStallState.lastPinnedType !== pinnedType) {
        _resetStallState();
        _PinnedBackupStallState.lastPinnedType = pinnedType;
    }
    const video = player?.getHTMLVideoElement?.() || null;
    if (!(video instanceof HTMLMediaElement) ||
        video.ended ||
        Number(video.readyState) < 1) {
        _PinnedBackupStallState.firstObservedAt = 0;
        _PinnedBackupStallState.lastCurrentTime = 0;
        _PinnedBackupStallState.lastBufferedEnd = 0;
        return;
    }
    const currentTime = Number(video.currentTime) || 0;
    const bufferedEnd = video.buffered && video.buffered.length > 0
        ? video.buffered.end(video.buffered.length - 1)
        : 0;
    const now = Date.now();
    const stallThresholdMs = Math.max(500, Number(__TTVAB_STATE__.PinnedBackupStallDetectionMs) || 3000);
    const rearmCooldownMs = Math.max(stallThresholdMs * 2, Number(__TTVAB_STATE__.PinnedBackupStallDetectionMs) || 3000 * 2);
    const bufferAdvanced = _PinnedBackupStallState.lastBufferedEnd > 0 &&
        bufferedEnd > _PinnedBackupStallState.lastBufferedEnd + 0.1;
    const playbackHasStarted = currentTime > 0 || bufferedEnd > 0;
    if (bufferAdvanced) {
        _PinnedBackupStallState.firstObservedAt = 0;
        _PinnedBackupStallState.lastCurrentTime = currentTime;
        _PinnedBackupStallState.lastBufferedEnd = bufferedEnd;
        return;
    }
    if (!playbackHasStarted) {
        _PinnedBackupStallState.firstObservedAt = 0;
        _PinnedBackupStallState.lastCurrentTime = 0;
        _PinnedBackupStallState.lastBufferedEnd = 0;
        return;
    }
    if (_PinnedBackupStallState.firstObservedAt === 0) {
        _PinnedBackupStallState.firstObservedAt = now;
        _PinnedBackupStallState.lastCurrentTime = currentTime;
        _PinnedBackupStallState.lastBufferedEnd = bufferedEnd;
        return;
    }
    if (now - _PinnedBackupStallState.firstObservedAt > rearmCooldownMs * 4) {
        _PinnedBackupStallState.firstObservedAt = 0;
        _PinnedBackupStallState.lastCurrentTime = currentTime;
        _PinnedBackupStallState.lastBufferedEnd = bufferedEnd;
        return;
    }
    if (now - _PinnedBackupStallState.lastForceRefreshAt < rearmCooldownMs ||
        __TTVAB_STATE__.BackupSearchForceRefreshAt > now - rearmCooldownMs) {
        return;
    }
    if (now - _PinnedBackupStallState.firstObservedAt < stallThresholdMs) {
        return;
    }
    _PinnedBackupStallState.lastForceRefreshAt = now;
    _PinnedBackupStallState.forceRefreshCount =
        (_PinnedBackupStallState.forceRefreshCount || 0) + 1;
    if (_PinnedBackupStallState.forceRefreshCount >= 3) {
        if (!_PinnedBackupStallState.exhaustedLogged) {
            _PinnedBackupStallState.exhaustedLogged = true;
            _$l(`Pinned backup stalled (${pinnedType}): currentTime=${currentTime.toFixed(2)}s, bufferEnd=${bufferedEnd.toFixed(2)}s, buffer not growing for ${Math.round((now - _PinnedBackupStallState.firstObservedAt) / 100) / 10}s — re-searches exhausted (3 attempts), leaving stream as-is`, "warning");
        }
        return;
    }
    __TTVAB_STATE__.BackupSearchForceRefreshAt = now;
    __TTVAB_STATE__.LastPinnedBackupStallDetectedAt = now;
    _$bw({ key: "UpdateBackupSearchForceRefresh", value: now });
    _$l(`Pinned backup stalled (${pinnedType}): currentTime=${currentTime.toFixed(2)}s, bufferEnd=${bufferedEnd.toFixed(2)}s, buffer not growing for ${Math.round((now - _PinnedBackupStallState.firstObservedAt) / 100) / 10}s — forcing backup re-search`, "warning");
}
function _$mpb() {
    function check() {
        _playerBufferMonitorTimer = null;
        const currentMediaKey = _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey);
        const hasActiveAdContext = Boolean(__TTVAB_STATE__.CurrentAdMediaKey || __TTVAB_STATE__.CurrentAdChannel);
        const hasPendingPostAdRecovery = _hasPendingAdResumeIntent(__TTVAB_STATE__.PageChannel, currentMediaKey);
        if (!hasPendingPostAdRecovery) {
            _$pbs.postAdUnhealthyCount = 0;
            _$pbs.postAdRecoveryStartedAt = 0;
            _$pbs.postAdLastCurrentTime = 0;
            _$pbs.postAdStallTicks = 0;
            _$pbs.postAdSoftReloadAttempted = false;
        }
        const isHidden = _isNativeDocumentHidden();
        const hiddenDelay = Math.max(__TTVAB_STATE__.PlayerBufferingDelay * 8, 5000);
        const nextDelay = isHidden
            ? hiddenDelay
            : __TTVAB_STATE__.PlayerBufferingDelay;
        const idleDelay = isHidden
            ? hiddenDelay
            : Math.max(__TTVAB_STATE__.PlayerBufferingDelay * 5, 3000);
        if (!_hasPlayerBufferMonitorRelevantContext()) {
            _resetPlayerBufferMonitorState();
            _playerBufferMonitorTimer = setTimeout(check, idleDelay);
            return;
        }
        if (_shouldSuppressAutomaticPlaybackResume(__TTVAB_STATE__.PageChannel, currentMediaKey)) {
            _$cari();
            _$pbs.numSame = 0;
            _$pbs.fixAttempts = 0;
            _$pbs.liveEdgeStarveCount = 0;
            _$pbs.postAdUnhealthyCount = 0;
            _$pbs.postAdRecoveryStartedAt = 0;
            _resetPostAdGrace();
            _playerBufferMonitorTimer = setTimeout(check, idleDelay);
            return;
        }
        if (!__TTVAB_STATE__.IsBufferFixEnabled) {
            _resetPlayerBufferMonitorState();
            _playerBufferMonitorTimer = setTimeout(check, idleDelay);
            return;
        }
        const hasLivePlaybackContext = __TTVAB_STATE__.PageMediaType === "live" && Boolean(currentMediaKey);
        if (!hasLivePlaybackContext) {
            _resetPlayerBufferMonitorState();
            _playerBufferMonitorTimer = setTimeout(check, idleDelay);
            return;
        }
        if (hasActiveAdContext) {
            if (__TTVAB_STATE__.PinnedBackupPlayerType &&
                Number(__TTVAB_STATE__.PinnedBackupStallPollMs) > 0) {
                let pinPlayer = _$cpr?.player || null;
                if (!pinPlayer) {
                    const fresh = _$gps();
                    if (fresh.player && fresh.state) {
                        pinPlayer = fresh.player;
                    }
                }
                if (pinPlayer) {
                    _checkPinnedBackupStall(pinPlayer);
                }
            }
            else {
                _PinnedBackupStallState.firstObservedAt = 0;
                _PinnedBackupStallState.lastCurrentTime = 0;
                _PinnedBackupStallState.lastBufferedEnd = 0;
            }
            _resetPlayerBufferMonitorState();
            _playerBufferMonitorTimer = setTimeout(check, nextDelay);
            return;
        }
        if (isHidden) {
            _clearCachedPlayerRef(false);
            _playerBufferMonitorTimer = setTimeout(check, nextDelay);
            return;
        }
        if (_cachedPlayerRefMediaKey !== currentMediaKey) {
            _clearCachedPlayerRef();
        }
        if (_$cpr) {
            try {
                const player = _$cpr.player;
                const state = _$cpr.state;
                const playerCore = _$gpc(player);
                _syncPreferredQualityGroup(playerCore);
                const playerContentType = typeof state?.props?.content?.type === "string"
                    ? state.props.content.type
                    : null;
                if (!playerCore) {
                    _clearCachedPlayerRef();
                }
                else if (playerContentType &&
                    playerContentType !== "live" &&
                    playerContentType !== "rerun") {
                    _clearCachedPlayerRef();
                }
                else if (playerContentType === "live" &&
                    player.getHTMLVideoElement()?.ended &&
                    __TTVAB_STATE__.IsBufferFixEnabled) {
                    _$l("Player hit end of stream during live playback. Recovering...", "warning");
                    _$dpt(false, true, { reason: "buffer-recovery" });
                    _$pbs.lastFixTime = Date.now();
                }
                else if (hasPendingPostAdRecovery) {
                    _handlePendingPostAdRecovery(player, playerCore, player.getHTMLVideoElement?.() || null, __TTVAB_STATE__.PageChannel, currentMediaKey, playerContentType);
                }
                else if (_$pbs.postAdGraceUntil > 0 &&
                    (playerContentType === "live" || playerContentType === "rerun") &&
                    _handlePostAdGraceWatch(player, playerCore, player.getHTMLVideoElement?.() || null, __TTVAB_STATE__.PageChannel, currentMediaKey, playerContentType)) {
                    _$pbs.numSame = 0;
                    _$pbs.liveEdgeStarveCount = 0;
                    _$pbs.fixAttempts = 0;
                }
                else if (__TTVAB_STATE__.IsBufferFixEnabled &&
                    (playerContentType === "live" || playerContentType === "rerun") &&
                    !_isPlayerPaused(player, playerCore) &&
                    !player.getHTMLVideoElement()?.ended &&
                    _$pbs.lastFixTime <=
                        Date.now() - _getLowLatencyMinRepeatDelay()) {
                    const { video, position, bufferedPosition, bufferDuration, currentTime, liveEdgeDistance, readyState, hasFutureData, } = _readPlayerBufferTelemetry(player, playerCore);
                    const isStablePosition = _$pbs.position === position;
                    const isStableBufferedPosition = _$pbs.bufferedPosition === bufferedPosition;
                    const isBufferRegressing = _$pbs.bufferDuration >= bufferDuration;
                    const hasPlaybackState = position !== 0 || bufferedPosition !== 0 || bufferDuration !== 0;
                    const isLikelyLiveEdgeStarvation = hasPlaybackState &&
                        bufferDuration < _getLowLatencyDangerZone() &&
                        isStablePosition &&
                        isStableBufferedPosition &&
                        isBufferRegressing &&
                        !hasFutureData;
                    if ((!__TTVAB_STATE__.PlayerBufferingPrerollCheckEnabled ||
                        position > __TTVAB_STATE__.PlayerBufferingPrerollCheckOffset) &&
                        isLikelyLiveEdgeStarvation) {
                        _$pbs.liveEdgeStarveCount++;
                        _$pbs.numSame = 0;
                        _$pbs.fixAttempts = 0;
                        if (_$pbs.liveEdgeStarveCount ===
                            __TTVAB_STATE__.PlayerBufferingSameStateCount) {
                            _$l(`Live edge temporarily empty; skipping pause/play (pos=${position}, edge=${liveEdgeDistance.toFixed(3)}s, readyState=${readyState})`, "info");
                        }
                        if (_$pbs.liveEdgeStarveCount >=
                            _PLAYER_BUFFER_LIVE_EDGE_RELOAD_COUNT) {
                            _$l(`Persistent live-edge starvation detected; reloading player (pos=${position}, edge=${liveEdgeDistance.toFixed(3)}s, readyState=${readyState})`, "warning");
                            _$dpt(false, true, {
                                reason: "buffer-recovery",
                            });
                            _$pbs.lastFixTime = Date.now();
                            _$pbs.liveEdgeStarveCount = 0;
                        }
                    }
                    else if ((!__TTVAB_STATE__.PlayerBufferingPrerollCheckEnabled ||
                        position > __TTVAB_STATE__.PlayerBufferingPrerollCheckOffset) &&
                        hasPlaybackState &&
                        isStablePosition &&
                        isStableBufferedPosition &&
                        isBufferRegressing) {
                        _$pbs.liveEdgeStarveCount = 0;
                        _$pbs.numSame++;
                        if (_$pbs.numSame ===
                            __TTVAB_STATE__.PlayerBufferingSameStateCount) {
                            _$l(`Attempting buffer fix (pos=${position}, edge=${liveEdgeDistance.toFixed(3)}s, readyState=${readyState})`, "warning");
                            _$pbs.fixAttempts++;
                            if (!_isLowLatencyEnabled() &&
                                video &&
                                video.buffered.length > 1) {
                                for (let bi = 0; bi < video.buffered.length; bi++) {
                                    if (video.buffered.start(bi) > video.currentTime + 0.5) {
                                        _$l(`Seeking past ${(video.buffered.start(bi) - video.currentTime).toFixed(1)}s buffer gap`, "warning");
                                        video.currentTime = video.buffered.start(bi);
                                        _$pbs.lastFixTime = Date.now();
                                        _$pbs.numSame = 0;
                                        break;
                                    }
                                }
                            }
                            if (_$pbs.numSame !== 0) {
                                if (__TTVAB_STATE__.PlayerBufferingDoPlayerReload ||
                                    _$pbs.fixAttempts >= 3) {
                                    _$dpt(false, true, {
                                        reason: "buffer-recovery",
                                    });
                                }
                                else {
                                    _$dpt(true, false);
                                }
                                _$pbs.lastFixTime = Date.now();
                                _$pbs.numSame = 0;
                            }
                        }
                    }
                    else {
                        _$pbs.liveEdgeStarveCount = 0;
                        _$pbs.numSame = 0;
                        _$pbs.fixAttempts = 0;
                    }
                    _$pbs.position = position;
                    _$pbs.bufferedPosition = bufferedPosition;
                    _$pbs.bufferDuration = bufferDuration;
                    const driftVideo = video;
                    if (driftVideo &&
                        !driftVideo.ended &&
                        driftVideo.buffered?.length > 0) {
                        const driftLiveEdge = driftVideo.buffered.end(driftVideo.buffered.length - 1);
                        const driftAmount = driftLiveEdge - currentTime;
                        if (driftAmount > 4 &&
                            isStablePosition &&
                            hasFutureData &&
                            readyState >= 3) {
                            driftVideo.currentTime = Math.max(0, driftLiveEdge - 0.5);
                            _$l(`A/V desync corrected (drift=${driftAmount.toFixed(1)}s)`, "warning");
                            _$pbs.lastFixTime = Date.now();
                        }
                    }
                }
            }
            catch (err) {
                _$l(`Buffer monitor error: ${err.message}`, "error");
                _clearCachedPlayerRef();
            }
        }
        if (!_$cpr) {
            const playerAndState = _$gps();
            if (playerAndState.player && playerAndState.state) {
                _syncPreferredQualityGroup(_$gpc(playerAndState.player));
                _$cpr = playerAndState;
                _cachedPlayerRefMediaKey = currentMediaKey;
            }
        }
        const inSteadyState = !hasPendingPostAdRecovery &&
            _$pbs.numSame === 0 &&
            _$pbs.liveEdgeStarveCount === 0 &&
            _$pbs.fixAttempts === 0 &&
            _$pbs.postAdGraceUntil === 0 &&
            _$cpr !== null;
        const scheduledDelay = inSteadyState && nextDelay < _PLAYER_BUFFER_STEADY_DELAY_MS
            ? _PLAYER_BUFFER_STEADY_DELAY_MS
            : nextDelay;
        _playerBufferMonitorTimer = setTimeout(check, scheduledDelay);
    }
    check();
    _$l("Buffer monitor active", "info");
}
function _$hvs() {
    if (!window.__TTVAB_NATIVE_VISIBILITY__) {
        window.__TTVAB_NATIVE_VISIBILITY__ = {
            hidden: document.__lookupGetter__?.("hidden") || null,
            webkitHidden: document.__lookupGetter__?.("webkitHidden") || null,
            mozHidden: document.__lookupGetter__?.("mozHidden") || null,
            visibilityState: document.__lookupGetter__?.("visibilityState") || null,
        };
    }
    if (!window.__TTVAB_VISIBILITY_HARDENED__) {
        const queueVisibilityPlaybackGuard = () => {
            _guardPlaybackAcrossVisibilityTransition(__TTVAB_STATE__.PageChannel, __TTVAB_STATE__.PageMediaKey);
        };
        for (const eventName of [
            "visibilitychange",
            "webkitvisibilitychange",
            "mozvisibilitychange",
        ]) {
            document.addEventListener(eventName, queueVisibilityPlaybackGuard);
        }
        window.addEventListener("blur", queueVisibilityPlaybackGuard);
        window.addEventListener("pagehide", () => {
            for (const eventName of [
                "visibilitychange",
                "webkitvisibilitychange",
                "mozvisibilitychange",
            ]) {
                document.removeEventListener(eventName, queueVisibilityPlaybackGuard);
            }
            window.removeEventListener("blur", queueVisibilityPlaybackGuard);
        });
        window.__TTVAB_VISIBILITY_HARDENED__ = true;
    }
    _$l("Visibility tracking active", "info");
}

"use strict";

const _$rk = "ttvab_last_reminder";
const _$ri2 = 1209600000;
const _$fr = "ttvab_first_run_shown";
const _UI_FLAGS_KEY = "__TTVAB_UI_FLAGS__";
function _getUiStorageItem(key) {
    try {
        return localStorage.getItem(key);
    }
    catch (e) {
        _$l(`UI storage read error for ${key}: ${e.message}`, "error");
        return null;
    }
}
function _setUiStorageItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    }
    catch (e) {
        _$l(`UI storage write error for ${key}: ${e.message}`, "error");
        return false;
    }
}
function _getUiFlags() {
    const existing = window[_UI_FLAGS_KEY];
    if (existing && typeof existing === "object") {
        return existing;
    }
    const flags = {
        achievementListenerInitialized: false,
        welcomeScheduled: false,
        donationScheduled: false,
        donationDelayTimer: null,
        donationDismissTimer: null,
        welcomeDelayTimer: null,
        welcomeDismissTimer: null,
        achievementDismissTimer: null,
        achievementRemoveTimer: null,
    };
    window[_UI_FLAGS_KEY] = flags;
    return flags;
}
function _$dn() {
    try {
        const uiFlags = _getUiFlags();
        if (uiFlags.donationScheduled)
            return;
        const lastReminder = _getUiStorageItem(_$rk);
        const now = Date.now();
        if (!lastReminder) {
            _setUiStorageItem(_$rk, now.toString());
            return;
        }
        const lastReminderMs = Number.parseInt(lastReminder, 10);
        if (!Number.isFinite(lastReminderMs) || lastReminderMs > now) {
            _setUiStorageItem(_$rk, now.toString());
            return;
        }
        if (now - lastReminderMs < _$ri2)
            return;
        uiFlags.donationScheduled = true;
        if (uiFlags.donationDelayTimer)
            clearTimeout(uiFlags.donationDelayTimer);
        uiFlags.donationDelayTimer = setTimeout(() => {
            uiFlags.donationDelayTimer = null;
            uiFlags.donationScheduled = false;
            if (document.getElementById("ttvab-reminder") || !document.body)
                return;
            const toast = document.createElement("div");
            toast.id = "ttvab-reminder";
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
            _setUiStorageItem(_$rk, now.toString());
            const reminderClose = toast.querySelector("#ttvab-reminder-close");
            if (reminderClose) {
                reminderClose.onclick = () => toast.remove();
            }
            const reminderButton = toast.querySelector("#ttvab-reminder-btn");
            if (reminderButton) {
                reminderButton.onclick = () => {
                    window.open("https://ko-fi.com/gosudrm", "_blank", "noopener,noreferrer");
                    if (toast.isConnected) {
                        toast.remove();
                    }
                };
            }
            if (uiFlags.donationDismissTimer)
                clearTimeout(uiFlags.donationDismissTimer);
            uiFlags.donationDismissTimer = setTimeout(() => {
                uiFlags.donationDismissTimer = null;
                if (toast.isConnected) {
                    toast.style.animation = "ttvab-slide .3s ease reverse";
                    setTimeout(() => toast.remove(), 300);
                }
            }, 15000);
        }, 5000);
    }
    catch (e) {
        _$l(`Donation reminder error: ${e.message}`, "error");
    }
}
function _$wc() {
    try {
        const uiFlags = _getUiFlags();
        if (uiFlags.welcomeScheduled || _getUiStorageItem(_$fr))
            return;
        uiFlags.welcomeScheduled = true;
        _setUiStorageItem(_$fr, "true");
        if (uiFlags.welcomeDelayTimer)
            clearTimeout(uiFlags.welcomeDelayTimer);
        uiFlags.welcomeDelayTimer = setTimeout(() => {
            uiFlags.welcomeDelayTimer = null;
            uiFlags.welcomeScheduled = false;
            if (document.getElementById("ttvab-welcome") || !document.body)
                return;
            const toast = document.createElement("div");
            toast.id = "ttvab-welcome";
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
            const closeHandler = () => {
                toast.style.animation = "ttvab-welcome .3s ease reverse";
                setTimeout(() => toast.remove(), 300);
            };
            const welcomeClose = toast.querySelector("#ttvab-welcome-close");
            if (welcomeClose) {
                welcomeClose.onclick = closeHandler;
            }
            if (uiFlags.welcomeDismissTimer)
                clearTimeout(uiFlags.welcomeDismissTimer);
            uiFlags.welcomeDismissTimer = setTimeout(() => {
                uiFlags.welcomeDismissTimer = null;
                if (toast.isConnected)
                    closeHandler();
            }, 10000);
        }, 2000);
    }
    catch (e) {
        _$l(`Welcome message error: ${e.message}`, "error");
    }
}
const _$ai = {
    first_block: { name: "Ad Slayer", icon: "⚔️", desc: "Blocked your first ad!" },
    block_10: { name: "Blocker", icon: "🛡️", desc: "Blocked 10 ads!" },
    block_100: { name: "Guardian", icon: "🔰", desc: "Blocked 100 ads!" },
    block_500: { name: "Sentinel", icon: "🏰", desc: "Blocked 500 ads!" },
    block_1000: { name: "Legend", icon: "🏆", desc: "Blocked 1000 ads!" },
    block_5000: { name: "Mythic", icon: "👑", desc: "Blocked 5000 ads!" },
    time_1h: { name: "Hour Saver", icon: "⏱️", desc: "Saved 1 hour from ads!" },
    time_10h: {
        name: "Time Master",
        icon: "⏰",
        desc: "Saved 10 hours from ads!",
    },
    channels_5: {
        name: "Explorer",
        icon: "📺",
        desc: "Blocked ads on 5 channels!",
    },
    channels_20: {
        name: "Adventurer",
        icon: "🌍",
        desc: "Blocked ads on 20 channels!",
    },
    block_10000: {
        name: "Diamond",
        icon: "💎",
        desc: "Blocked 10,000 ads!",
    },
    channels_50: {
        name: "Globetrotter",
        icon: "🗺️",
        desc: "Blocked ads on 50 channels!",
    },
};
function _ensureAchievementToastStyles() {
    if (document.getElementById("ttvab-achievement-style"))
        return;
    const style = document.createElement("style");
    style.id = "ttvab-achievement-style";
    style.textContent =
        "#ttvab-achievement{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:#fff;padding:16px 24px;border-radius:16px;font-family:'Segoe UI',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5),0 0 20px rgba(145,70,255,.3);z-index:9999999;animation:ttvab-ach-pop .5s cubic-bezier(0.34,1.56,0.64,1);border:2px solid rgba(145,70,255,.5);display:flex;align-items:center;gap:16px}" +
            "@keyframes ttvab-ach-pop{from{opacity:0;transform:translateX(-50%) scale(.5) translateY(-20px)}to{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}}" +
            "@keyframes ttvab-ach-shine{0%{background-position:-200% center}100%{background-position:200% center}}" +
            "#ttvab-achievement .ach-icon{font-size:40px;animation:ttvab-ach-bounce 1s ease infinite}" +
            "@keyframes ttvab-ach-bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}" +
            "#ttvab-achievement .ach-content{display:flex;flex-direction:column;gap:2px}" +
            "#ttvab-achievement .ach-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#9146FF;font-weight:600}" +
            "#ttvab-achievement .ach-name{font-size:18px;font-weight:700;background:linear-gradient(90deg,#fff 0%,#9146FF 50%,#fff 100%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:ttvab-ach-shine 2s linear infinite}" +
            "#ttvab-achievement .ach-desc{font-size:12px;color:#aaa;margin-top:2px}";
    document.head?.appendChild(style);
}
function _$au(achievementId) {
    try {
        const uiFlags = _getUiFlags();
        const ach = _$ai[achievementId];
        if (!ach)
            return;
        if (!document.body)
            return;
        _ensureAchievementToastStyles();
        const existing = document.getElementById("ttvab-achievement");
        if (existing)
            existing.remove();
        const toast = document.createElement("div");
        toast.id = "ttvab-achievement";
        const icon = document.createElement("div");
        icon.className = "ach-icon";
        icon.textContent = String(ach.icon ?? "");
        const content = document.createElement("div");
        content.className = "ach-content";
        const label = document.createElement("div");
        label.className = "ach-label";
        label.textContent = "Achievement Unlocked!";
        const name = document.createElement("div");
        name.className = "ach-name";
        name.textContent = String(ach.name ?? "");
        const desc = document.createElement("div");
        desc.className = "ach-desc";
        desc.textContent = String(ach.desc ?? "");
        content.append(label, name, desc);
        toast.append(icon, content);
        document.body.appendChild(toast);
        _$l(`Achievement unlocked: ${ach.name}`, "success");
        if (uiFlags.achievementDismissTimer)
            clearTimeout(uiFlags.achievementDismissTimer);
        uiFlags.achievementDismissTimer = setTimeout(() => {
            uiFlags.achievementDismissTimer = null;
            if (toast.isConnected) {
                toast.style.animation = "ttvab-ach-pop .5s ease reverse";
                if (uiFlags.achievementRemoveTimer)
                    clearTimeout(uiFlags.achievementRemoveTimer);
                uiFlags.achievementRemoveTimer = setTimeout(() => {
                    uiFlags.achievementRemoveTimer = null;
                    toast.remove();
                }, 500);
            }
        }, 5000);
    }
    catch (e) {
        _$l(`Achievement error: ${e.message}`, "error");
    }
}
function _$al() {
    const uiFlags = _getUiFlags();
    if (uiFlags.achievementListenerInitialized)
        return;
    uiFlags.achievementListenerInitialized = true;
    _onInternalMessage("ttvab-achievement-unlocked", (detail) => {
        const safeDetail = detail && typeof detail === "object" && !Array.isArray(detail)
            ? detail
            : null;
        if (typeof safeDetail?.id !== "string")
            return;
        _$au(safeDetail.id);
    });
}

"use strict";

function _isClipEditorContext() {
    const host = String(window.location?.hostname || "").toLowerCase();
    if (host === "clips.twitch.tv")
        return true;
    const path = String(window.location?.pathname || "").toLowerCase();
    return /^\/[^/]+\/clip\/[^/]+/.test(path);
}
function _$bs() {
    if (_isClipEditorContext()) {
        _$l("Skipping - clip editor page", "warning");
        return false;
    }
    if (typeof window.ttvabVersion !== "undefined" &&
        window.ttvabVersion >= _$c.INTERNAL_VERSION) {
        _$l("Skipping - another script is active", "warning");
        return false;
    }
    window.ttvabVersion = _$c.INTERNAL_VERSION;
    _$l(`v${_$c.VERSION} loaded`, "info");
    return true;
}
function _getTrustedBridgeMessageDetail(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value;
}
function _bindBridgePort() {
    _bindBridgePortHandshake();
}
function _$tl() {
    _onInternalMessage("ttvab-toggle", (detail) => {
        const safeDetail = _getTrustedBridgeMessageDetail(detail);
        if (typeof safeDetail?.enabled !== "boolean")
            return;
        const enabled = safeDetail.enabled;
        __TTVAB_STATE__.HasResolvedToggleState = true;
        if (__TTVAB_STATE__.IsAdStrippingEnabled === enabled)
            return;
        __TTVAB_STATE__.IsAdStrippingEnabled = enabled;
        if (!enabled) {
            __TTVAB_STATE__.CurrentAdChannel = null;
            __TTVAB_STATE__.CurrentAdMediaKey = null;
            __TTVAB_STATE__.PinnedBackupPlayerType = null;
            __TTVAB_STATE__.PinnedBackupPlayerChannel = null;
            __TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
            __TTVAB_STATE__.HasTriggeredPlayerReload = false;
            __TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
            __TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
            __TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
            __TTVAB_STATE__.LastPlayerReloadAt = 0;
            __TTVAB_STATE__.LastAdEndedAt = 0;
            __TTVAB_STATE__.LastAdEndedChannel = null;
            __TTVAB_STATE__.LastAdEndedMediaKey = null;
            __TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
            __TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
            __TTVAB_STATE__._AdRecoveryConsecutiveFailures = 0;
            if (typeof _$cari === "function") {
                _$cari();
            }
            if (typeof _clearSuppressedMediaTracking === "function") {
                _clearSuppressedMediaTracking({ restoreConnected: true });
            }
            if (typeof _clearPlaybackRecoveryTimeouts === "function") {
                _clearPlaybackRecoveryTimeouts();
            }
            if (typeof _clearCachedPlayerRef === "function") {
                _clearCachedPlayerRef(true);
            }
            if (typeof _clearPendingPlayerPreferenceRestore === "function") {
                _clearPendingPlayerPreferenceRestore();
            }
            _$bw({
                key: "ResetPlaybackRecoveryState",
                value: { clearAdContext: true },
            });
            _$bw({
                key: "UpdateCurrentAdContext",
                value: null,
            });
            _$bw({
                key: "UpdatePinnedBackupPlayerContext",
                value: null,
            });
        }
        _$bw({ key: "UpdateToggleState", value: enabled });
        _$l(`Ad blocking ${enabled ? "enabled" : "disabled"}`, enabled ? "success" : "warning");
    });
    _onInternalMessage("ttvab-toggle-buffer-fix", (detail) => {
        const safeDetail = _getTrustedBridgeMessageDetail(detail);
        if (typeof safeDetail?.enabled !== "boolean")
            return;
        const enabled = safeDetail.enabled;
        if (__TTVAB_STATE__.IsBufferFixEnabled === enabled)
            return;
        __TTVAB_STATE__.IsBufferFixEnabled = enabled;
        if (!enabled && typeof _resetPlayerBufferMonitorState === "function") {
            _resetPlayerBufferMonitorState();
        }
        if (enabled && typeof _ensurePlaybackMonitorsRunning === "function") {
            _ensurePlaybackMonitorsRunning(true);
        }
        _$l(`Buffer fix ${enabled ? "enabled" : "disabled"}`, enabled ? "success" : "warning");
    });
    _onInternalMessage("ttvab-toggle-ad-spoofing", (detail) => {
        const safeDetail = _getTrustedBridgeMessageDetail(detail);
        if (typeof safeDetail?.enabled !== "boolean")
            return;
        const enabled = safeDetail.enabled;
        const shouldDisable = !enabled;
        if (__TTVAB_STATE__.DisableAdSpoofing === shouldDisable)
            return;
        __TTVAB_STATE__.DisableAdSpoofing = shouldDisable;
        _$bw({ key: "UpdateAdSpoofingState", value: shouldDisable });
        _$l(`Ad spoofing ${enabled ? "enabled" : "disabled"}`, enabled ? "success" : "warning");
    });
    _onInternalMessage("ttvab-toggle-autoplay-backup", (detail) => {
        const safeDetail = _getTrustedBridgeMessageDetail(detail);
        if (typeof safeDetail?.enabled !== "boolean")
            return;
        const enabled = safeDetail.enabled;
        const shouldDisable = !enabled;
        if (__TTVAB_STATE__.DisableAutoplayBackup === shouldDisable)
            return;
        __TTVAB_STATE__.DisableAutoplayBackup = shouldDisable;
        _$bw({
            key: "UpdateAutoplayBackupState",
            value: shouldDisable,
        });
        _$l(`Low quality fallback ${enabled ? "enabled" : "disabled"}`, enabled ? "success" : "warning");
        if (shouldDisable &&
            __TTVAB_STATE__.PlayerHasPlayedOnce &&
            typeof _$dpt === "function") {
            _$l("Disabling low quality fallback; reloading player to restore native high quality stream.", "info");
            _$dpt(false, true, { reason: "manual" });
        }
    });
    _onInternalMessage("ttvab-toggle-debug", (detail) => {
        const safeDetail = _getTrustedBridgeMessageDetail(detail);
        if (typeof safeDetail?.enabled !== "boolean")
            return;
        if (safeDetail.enabled && typeof _$edl === "function") {
            _$edl();
        }
    });
}
function _hookSpaNavigation() {
    const sync = () => _syncPagePlaybackContext({ broadcast: true });
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
        const result = originalPushState.apply(this, args);
        sync();
        return result;
    };
    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
        const result = originalReplaceState.apply(this, args);
        sync();
        return result;
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("pagehide", () => {
        window.removeEventListener("popstate", sync);
        history.pushState = originalPushState;
        history.replaceState = originalReplaceState;
    });
}
function _$in() {
    if (!_$bs())
        return;
    _bindBridgePort();
    _$ds(window);
    _syncPagePlaybackContext({ broadcast: false });
    _onInternalMessage("ttvab-init-count", (detail) => {
        const safeDetail = _getTrustedBridgeMessageDetail(detail);
        if (!Number.isFinite(safeDetail?.count))
            return;
        const pendingInitialAdsBlockedDelta = __TTVAB_STATE__.HasResolvedAdsCountState === true
            ? 0
            : _normalizeCount(__TTVAB_STATE__.PendingInitialAdsBlockedDelta);
        __TTVAB_STATE__.HasResolvedAdsCountState = true;
        __TTVAB_STATE__.PendingInitialAdsBlockedDelta = 0;
        const restoredCount = _normalizeCount(safeDetail.count) + pendingInitialAdsBlockedDelta;
        if (_$s.adsBlocked === restoredCount)
            return;
        _$s.adsBlocked = restoredCount;
        _$bw({ key: "UpdateAdsBlocked", value: _$s.adsBlocked });
        _$l(`Restored ads count: ${_$s.adsBlocked}`, "info");
    });
    _$sd();
    if (typeof _hookRevokeObjectURL === "function") {
        _hookRevokeObjectURL();
    }
    _$hw();
    _$mf();
    _$tl();
    _sendBridgeMessage("ttvab-request-state");
    _$al();
    _hookSpaNavigation();
    _$hvs();
    if (typeof _hookSecondaryPlayerHandoffDetection === "function") {
        _hookSecondaryPlayerHandoffDetection();
    }
    if (typeof _ensurePlaybackMonitorsRunning === "function") {
        _ensurePlaybackMonitorsRunning(true);
    }
    _$wc();
    _$dn();
    _$l("Initialized successfully", "success");
}

_$in();
})();