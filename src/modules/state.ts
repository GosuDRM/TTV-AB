// TTV AB - State

const _S = {
	workers: [],
	conflicts: ["twitch", "isVariantA"],
	reinsertPatterns: ["isVariantA", "besuper/", "${patch_url}"],
	adsBlocked: 0,
	domAdsBlocked: 0,
};
const _BRIDGE_PORT_INIT_MESSAGE = "ttvab-bridge-port-init";
const _internalMessageTarget = new EventTarget();
const _pendingBridgeMessages: PlainObject[] = [];
let _bridgePort: MessagePort | null = null;
let _bridgePortHandshakeBound = false;

function _getStructuredMessageData(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value;
}

function _emitInternalMessage(type, detail = null) {
	if (typeof type !== "string" || !type) return;
	_internalMessageTarget.dispatchEvent(
		new CustomEvent(type, {
			detail,
		}),
	);
}

function _onInternalMessage(type, handler) {
	_internalMessageTarget.addEventListener(type, (event) => {
		const detail =
			event instanceof CustomEvent
				? event.detail
				: (event as PlainObject).detail;
		handler(detail);
	});
}

function _flushBridgeMessageQueue() {
	if (!_bridgePort) return;
	while (_pendingBridgeMessages.length > 0) {
		const nextMessage = _pendingBridgeMessages[0];
		try {
			_bridgePort.postMessage(nextMessage);
			_pendingBridgeMessages.shift();
		} catch {
			break;
		}
	}
}

function _attachBridgePort(port) {
	if (!port || typeof port.postMessage !== "function") return false;
	if (_bridgePort === port) return true;
	if (_bridgePort) {
		try {
			_bridgePort.close();
		} catch {}
	}
	_bridgePort = port;
	_bridgePort.addEventListener("message", (event) => {
		const message = _getStructuredMessageData(event.data);
		if (typeof message?.type !== "string") return;
		_emitInternalMessage(message.type, message.detail ?? null);
	});
	_bridgePort.start?.();
	_flushBridgeMessageQueue();
	return true;
}

function _bindBridgePortHandshake() {
	if (_bridgePortHandshakeBound || typeof window === "undefined") return;
	_bridgePortHandshakeBound = true;
	const handleBridgePortInit = (event) => {
		if (event.source !== window) return;
		const message = _getStructuredMessageData(event.data);
		if (
			message?.type !== _BRIDGE_PORT_INIT_MESSAGE ||
			!Array.isArray(event.ports) ||
			event.ports.length !== 1
		) {
			return;
		}
		if (!_attachBridgePort(event.ports[0])) return;
		window.removeEventListener("message", handleBridgePortInit, true);
		event.stopImmediatePropagation?.();
		_sendBridgeMessage("ttvab-bridge-ready");
	};
	window.addEventListener("message", handleBridgePortInit, true);
}

function _sendBridgeMessage(type, detail = null) {
	if (typeof type !== "string" || !type) return false;
	const message = { type, detail };
	if (_bridgePort) {
		try {
			_bridgePort.postMessage(message);
			return true;
		} catch {}
	}
	_pendingBridgeMessages.push(message);
	return false;
}

function _broadcastWorkers(messages) {
	const queue = Array.isArray(messages) ? messages : [messages];
	if (queue.length === 0 || _S.workers.length === 0) return;

	const aliveWorkers = [];
	for (const worker of _S.workers) {
		let isAlive = true;
		for (const message of queue) {
			try {
				worker.postMessage(message);
			} catch {
				isAlive = false;
				break;
			}
		}
		if (isAlive) {
			aliveWorkers.push(worker);
		}
	}

	_S.workers = aliveWorkers;
}

function _setPagePlaybackContext(
	context,
	options: { broadcast?: boolean } = {},
) {
	if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__) {
		return _normalizePlaybackContext(context);
	}

	const normalizedContext = _normalizePlaybackContext(context);
	const previousMediaKey = __TTVAB_STATE__.PageMediaKey || null;
	let didResetAdScopedState = false;
	const hasChanged =
		__TTVAB_STATE__.PageMediaType !== normalizedContext.MediaType ||
		__TTVAB_STATE__.PageChannel !== normalizedContext.ChannelName ||
		__TTVAB_STATE__.PageVodID !== normalizedContext.VodID ||
		previousMediaKey !== normalizedContext.MediaKey;

	__TTVAB_STATE__.PageMediaType = normalizedContext.MediaType;
	__TTVAB_STATE__.PageChannel = normalizedContext.ChannelName;
	__TTVAB_STATE__.PageVodID = normalizedContext.VodID;
	__TTVAB_STATE__.PageMediaKey = normalizedContext.MediaKey;

	if (
		hasChanged &&
		previousMediaKey &&
		previousMediaKey !== normalizedContext.MediaKey &&
		(__TTVAB_STATE__.CurrentAdMediaKey === previousMediaKey ||
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey === previousMediaKey)
	) {
		__TTVAB_STATE__.CurrentAdChannel = null;
		__TTVAB_STATE__.CurrentAdMediaKey = null;
		__TTVAB_STATE__.PinnedBackupPlayerType = null;
		__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
		__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
		__TTVAB_STATE__.ShouldResumeAfterAd = false;
		__TTVAB_STATE__.ShouldResumeAfterAdChannel = null;
		__TTVAB_STATE__.ShouldResumeAfterAdMediaKey = null;
		__TTVAB_STATE__.ShouldResumeAfterAdUntil = 0;
		__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
		__TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
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
		_broadcastWorkers(messages);
	}

	return normalizedContext;
}

function _syncPagePlaybackContext(options = {}) {
	return _setPagePlaybackContext(
		_getPlaybackContextFromUrl(globalThis?.location?.href || ""),
		options,
	);
}

function _declareState(scope) {
	scope.__TTVAB_STATE__ = {
		AdSignifier: _C.AD_SIGNIFIER,
		BackupPlayerTypes: [..._C.PLAYER_TYPES],
		FallbackPlayerType: _C.FALLBACK_TYPE,
		ForceAccessTokenPlayerType: _C.FORCE_TYPE,
		SkipPlayerReloadOnHevc: false,
		ReloadAfterAd: _C.RELOAD_AFTER_AD ?? false,
		PlayerBufferingDoPlayerReload:
			_C.PLAYER_BUFFERING_DO_PLAYER_RELOAD ?? false,
		PlayerReloadMinimalRequestsTime: _C.RELOAD_TIME,
		PlayerReloadMinimalRequestsPlayerIndex: Math.max(
			0,
			_C.PLAYER_TYPES.indexOf("autoplay") > -1
				? _C.PLAYER_TYPES.indexOf("autoplay")
				: _C.PLAYER_TYPES.indexOf(_C.FALLBACK_TYPE),
		),
		PlayerReloadDebounceMs: _C.PLAYER_RELOAD_DEBOUNCE_MS ?? 1500,
		AdCycleStaleMs: _C.AD_CYCLE_STALE_MS ?? 30000,
		AdEndGraceMs: _C.AD_END_GRACE_MS ?? 2500,
		AdEndMinCleanPlaylists: _C.AD_END_MIN_CLEAN_PLAYLISTS ?? 2,
		AdRecoveryReloadCooldownMs: _C.AD_RECOVERY_RELOAD_COOLDOWN_MS ?? 10000,
		HasTriggeredPlayerReload: false,
		LastPlayerReloadAt: 0,
		LastAdDetectedAt: 0,
		LastAdRecoveryReloadAt: 0,
		LastAdRecoveryResumeAt: 0,
		CurrentAdChannel: null,
		CurrentAdMediaKey: null,
		PinnedBackupPlayerType: null,
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
		AdSegmentCache: new Map(),
		PlayerBufferingDelay: 600,
		PlayerBufferingSameStateCount: 3,
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
		PendingFetchRequests: new Map(),
		FetchRequestSeq: 0,
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

function _incrementAdsBlocked(channel, mediaKey = null) {
	_S.adsBlocked++;
	const count = Number.isFinite(_S.adsBlocked)
		? Math.max(0, Math.trunc(_S.adsBlocked))
		: 0;
	_S.adsBlocked = count;
	const safeChannel = typeof channel === "string" ? channel : null;
	const safeMediaKey =
		_normalizeMediaKey(mediaKey) ||
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
	} else if (typeof self !== "undefined" && self.postMessage) {
		self.postMessage({
			key: "AdBlocked",
			count: _S.adsBlocked,
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

function _incrementDomAdsBlocked(kind = "generic", channel = null) {
	_S.domAdsBlocked++;
	const count = Number.isFinite(_S.domAdsBlocked)
		? Math.max(0, Math.trunc(_S.domAdsBlocked))
		: 0;
	const safeKind = typeof kind === "string" ? kind : "generic";
	const safeChannel = typeof channel === "string" ? channel : null;
	_S.domAdsBlocked = count;
	if (typeof window !== "undefined") {
		const pageEventContext = _getPageScopedPlaybackEventContext();
		const detail = {
			count,
			delta: 1,
			kind: safeKind,
			channel: safeChannel,
			pageChannel: pageEventContext.pageChannel,
			pageMediaKey: pageEventContext.pageMediaKey,
		};
		_emitInternalMessage("ttvab-dom-ad-cleanup", detail);
		_sendBridgeMessage("ttvab-dom-ad-cleanup", detail);
	}
}
