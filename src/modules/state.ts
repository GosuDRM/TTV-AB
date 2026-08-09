// TTV AB - State

const _S = {
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
const _BRIDGE_TOKEN_REQUEST_MESSAGE = "ttvab-bridge-token-request";
const _BRIDGE_ANNOUNCE_MESSAGE = "ttvab-bridge-announce";
const _internalMessageTarget = new EventTarget();
const _pendingBridgeMessages: PlainObject[] = [];
const _MAX_PENDING_BRIDGE_MESSAGES = 64;
const _MAX_PENDING_BRIDGE_COUNTER_MESSAGES = 256;
let _bridgePort: MessagePort | null = null;
let _bridgePortHandshakeBound = false;
let _bridgeSessionToken: string | null = null;
let _bridgeTokenRequestTimer: ReturnType<typeof setTimeout> | null = null;
let _bridgeTokenRequestCount = 0;
let _bridgePortAttachedAt = 0;

function _createBridgeSessionToken() {
	const values = new Uint8Array(24);
	if (globalThis.crypto?.getRandomValues) {
		globalThis.crypto.getRandomValues(values);
		return Array.from(values, (value) =>
			value.toString(16).padStart(2, "0"),
		).join("");
	}
	return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

function _getBridgeSessionToken() {
	if (
		typeof _bridgeSessionToken === "string" &&
		_bridgeSessionToken.length >= 16
	) {
		return _bridgeSessionToken;
	}
	_bridgeSessionToken = _createBridgeSessionToken();
	return _bridgeSessionToken;
}

function _clearBridgeTokenRequestTimer() {
	if (_bridgeTokenRequestTimer === null) return;
	clearTimeout(_bridgeTokenRequestTimer);
	_bridgeTokenRequestTimer = null;
}

function _postBridgeTokenRequest() {
	if (_bridgePort || typeof window === "undefined") return;
	_clearBridgeTokenRequestTimer();
	const token = _getBridgeSessionToken();
	try {
		window.postMessage(
			{
				type: _BRIDGE_TOKEN_REQUEST_MESSAGE,
				detail: { token },
			},
			window.location.origin,
		);
	} catch {}
	_bridgeTokenRequestCount++;
	const retryDelay = _bridgeTokenRequestCount <= 20 ? 75 : 30000;
	_bridgeTokenRequestTimer = setTimeout(_postBridgeTokenRequest, retryDelay);
}

function _bridgePortMessageHandler(event: MessageEvent) {
	const message = _getStructuredMessageData(event.data);
	if (typeof message?.type !== "string") return;
	_emitInternalMessage(message.type, message.detail ?? null);
}

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

function _normalizeCount(value) {
	const numericValue =
		typeof value === "string" && value.trim() !== "" ? Number(value) : value;
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
	if (!detail) return null;

	const type = String(message.type);
	const safeChannel = typeof detail.channel === "string" ? detail.channel : "";
	const safeMediaKey =
		typeof detail.mediaKey === "string" ? detail.mediaKey : "";
	const safePageChannel =
		typeof detail.pageChannel === "string" ? detail.pageChannel : "";
	const safePageMediaKey =
		typeof detail.pageMediaKey === "string" ? detail.pageMediaKey : "";

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
	if (!targetDetail || !incomingDetail) return false;

	const mergedCount = Math.max(
		_normalizeCount(targetDetail.count),
		_normalizeCount(incomingDetail.count),
	);
	target.detail = {
		...targetDetail,
		...incomingDetail,
		count: mergedCount,
		delta: Math.min(
			_normalizeCount(targetDetail.delta) +
				_normalizeCount(incomingDetail.delta),
			mergedCount,
		),
	};
	return true;
}

function _coalescePendingBridgeCounterMessage(message) {
	const identity = _getPendingBridgeCounterIdentity(message);
	if (!identity) return false;

	for (let i = _pendingBridgeMessages.length - 1; i >= 0; i--) {
		if (
			_getPendingBridgeCounterIdentity(_pendingBridgeMessages[i]) !== identity
		) {
			continue;
		}
		return _mergePendingBridgeCounterMessages(
			_pendingBridgeMessages[i],
			message,
		);
	}

	return false;
}

function _dropOldestNonCounterPendingBridgeMessage() {
	for (let i = 0; i < _pendingBridgeMessages.length; i++) {
		if (_getPendingBridgeCounterIdentity(_pendingBridgeMessages[i])) continue;
		_pendingBridgeMessages.splice(i, 1);
		return true;
	}
	return false;
}

function _collapseOldestPendingCounterMessage() {
	for (let i = 0; i < _pendingBridgeMessages.length; i++) {
		const identity = _getPendingBridgeCounterIdentity(
			_pendingBridgeMessages[i],
		);
		if (!identity) continue;

		for (let j = _pendingBridgeMessages.length - 1; j > i; j--) {
			if (
				_getPendingBridgeCounterIdentity(_pendingBridgeMessages[j]) !== identity
			) {
				continue;
			}
			if (
				_mergePendingBridgeCounterMessages(
					_pendingBridgeMessages[j],
					_pendingBridgeMessages[i],
				)
			) {
				_pendingBridgeMessages.splice(i, 1);
				return true;
			}
		}
	}

	return false;
}

function _trimPendingBridgeMessages() {
	while (_pendingBridgeMessages.length > _MAX_PENDING_BRIDGE_MESSAGES) {
		if (_dropOldestNonCounterPendingBridgeMessage()) continue;
		if (_pendingBridgeMessages.length <= _MAX_PENDING_BRIDGE_COUNTER_MESSAGES) {
			break;
		}
		if (_collapseOldestPendingCounterMessage()) continue;
		_pendingBridgeMessages.shift();
	}
}

function _flushBridgeMessageQueue() {
	if (!_bridgePort) return;
	while (_pendingBridgeMessages.length > 0) {
		const nextMessage = _pendingBridgeMessages[0];
		try {
			_bridgePort.postMessage(nextMessage);
			_pendingBridgeMessages.shift();
		} catch {
			_pendingBridgeMessages.shift();
		}
	}
}

function _attachBridgePort(port, sessionToken = null) {
	if (
		!port ||
		typeof port.postMessage !== "function" ||
		typeof sessionToken !== "string" ||
		sessionToken.length < 16
	) {
		return false;
	}
	if (!_bridgeSessionToken || sessionToken !== _bridgeSessionToken) {
		return false;
	}
	if (_bridgePort === port && _bridgeSessionToken === sessionToken) return true;
	if (_bridgePort) {
		try {
			_bridgePort.removeEventListener("message", _bridgePortMessageHandler);
			_bridgePort.close();
		} catch {}
	}
	_bridgePort = port;
	_bridgeSessionToken = sessionToken;
	_bridgePortAttachedAt = Date.now();
	_bridgePort.addEventListener("message", _bridgePortMessageHandler);
	_bridgePort.start?.();
	_clearBridgeTokenRequestTimer();
	_flushBridgeMessageQueue();
	return true;
}

function _bindBridgePortHandshake() {
	if (_bridgePortHandshakeBound || typeof window === "undefined") return;
	_bridgePortHandshakeBound = true;
	const handleBridgePortInit = (event) => {
		if (event.source !== window) return;
		const message = _getStructuredMessageData(event.data);
		const sessionToken =
			typeof message?.detail?.token === "string"
				? String(message.detail.token)
				: null;
		if (
			message?.type !== _BRIDGE_PORT_INIT_MESSAGE ||
			typeof sessionToken !== "string" ||
			sessionToken.length < 16 ||
			sessionToken !== _bridgeSessionToken ||
			!Array.isArray(event.ports) ||
			event.ports.length !== 1
		) {
			return;
		}
		if (!_attachBridgePort(event.ports[0], sessionToken)) return;
		event.stopImmediatePropagation?.();
		_sendBridgeMessage(_BRIDGE_READY_MESSAGE, {
			token: sessionToken,
		});
	};
	const handleBridgeAnnounce = (event) => {
		if (event.source !== window) return;
		const message = _getStructuredMessageData(event.data);
		if (message?.type !== _BRIDGE_ANNOUNCE_MESSAGE) return;
		if (!_bridgePort) return;
		if (Date.now() - _bridgePortAttachedAt < 2000) return;
		const token = _getBridgeSessionToken();
		for (const delay of [0, 500, 1000]) {
			setTimeout(() => {
				if (Date.now() - _bridgePortAttachedAt < 2000) return;
				try {
					window.postMessage(
						{
							type: _BRIDGE_TOKEN_REQUEST_MESSAGE,
							detail: { token },
						},
						window.location.origin,
					);
				} catch {}
			}, delay);
		}
	};
	window.addEventListener("message", handleBridgePortInit, true);
	window.addEventListener("message", handleBridgeAnnounce, true);
	_postBridgeTokenRequest();
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
	const key = (message as { key?: unknown }).key;
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

	const envelope = value as {
		__ttvabWorkerBridge?: unknown;
		message?: unknown;
	};
	if (envelope.__ttvabWorkerBridge !== true) {
		return null;
	}

	const message = envelope.message as PlainObject | null;
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
	if (!envelope) return false;
	target.postMessage(envelope);
	return true;
}

function _broadcastWorkers(messages) {
	const queue = Array.isArray(messages) ? messages : [messages];
	if (queue.length === 0 || _S.workers.length === 0) return;

	const aliveWorkers = [];
	for (const worker of _S.workers) {
		let isAlive = true;
		for (const message of queue) {
			try {
				const targetMediaKey = _normalizeMediaKey(message?.targetMediaKey);
				const workerPlaybackContext =
					typeof _getWorkerPlaybackContext === "function"
						? _getWorkerPlaybackContext(worker)
						: null;
				if (
					targetMediaKey &&
					workerPlaybackContext?.MediaKey &&
					workerPlaybackContext.MediaKey !== targetMediaKey
				) {
					continue;
				}
				if (
					message?.key === "UpdatePageContext" &&
					typeof _rememberWorkerPageContext === "function"
				) {
					const preservedMediaKey = _normalizeMediaKey(
						message.value?.preservedMediaKey,
					);
					const workerMediaKey =
						workerPlaybackContext?.MediaKey ||
						_normalizeMediaKey(worker?.__TTVABPageMediaKey);
					if (!preservedMediaKey || workerMediaKey !== preservedMediaKey) {
						_rememberWorkerPageContext(worker, message.value);
					}
				}
				if (!_postWorkerBridgeMessage(worker, message)) {
					isAlive = false;
					break;
				}
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
	const activePipContext =
		typeof _getActivePictureInPicturePlaybackContext === "function"
			? _getActivePictureInPicturePlaybackContext()
			: null;
	const preservedMediaKey = _normalizeMediaKey(activePipContext?.MediaKey);
	let didResetAdScopedState = false;
	const hasChanged =
		__TTVAB_STATE__.PageMediaType !== normalizedContext.MediaType ||
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
			_resetPlaybackIntentForNavigation(
				normalizedContext.ChannelName,
				normalizedContext.MediaKey,
				2500,
				preservedMediaKey,
			);
		}
		if (typeof _clearSuppressedMediaTracking === "function") {
			_clearSuppressedMediaTracking({
				restoreConnected: true,
				preserveMediaKey: preservedMediaKey,
			});
		}
		if (typeof _clearPlaybackRecoveryTimeouts === "function") {
			_clearPlaybackRecoveryTimeouts(preservedMediaKey);
		}
		__TTVAB_STATE__.HasTriggeredPlayerReload = false;
		__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
		__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
		__TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
		__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt = 0;
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
		__TTVAB_STATE__.LastAdEndedCycleStartedAt = 0;
		__TTVAB_STATE__._AdRecoveryConsecutiveFailures = 0;

		if (previousMediaKey && previousMediaKey !== preservedMediaKey) {
			delete __TTVAB_STATE__.StreamInfos[previousMediaKey];
			delete __TTVAB_STATE__.AdPodProgressByMediaKey?.[previousMediaKey];
			for (const url in __TTVAB_STATE__.StreamInfosByUrl) {
				if (
					__TTVAB_STATE__.StreamInfosByUrl[url]?.MediaKey === previousMediaKey
				) {
					delete __TTVAB_STATE__.StreamInfosByUrl[url];
				}
			}
		}

		__TTVAB_STATE__.CurrentAdChannel = null;
		__TTVAB_STATE__.CurrentAdMediaKey = null;
		__TTVAB_STATE__.PinnedBackupPlayerType = null;
		__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
		__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
		__TTVAB_STATE__.ActiveCodecHandoffId = null;
		__TTVAB_STATE__.ActiveCodecHandoffChannel = null;
		__TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
		didResetAdScopedState = true;
	}

	if (options.broadcast !== false && hasChanged) {
		const messages: Array<{ key: string; value: unknown }> = [
			{
				key: "UpdatePageContext",
				value: {
					mediaType: normalizedContext.MediaType,
					channelName: normalizedContext.ChannelName,
					vodID: normalizedContext.VodID,
					mediaKey: normalizedContext.MediaKey,
					preservedMediaKey,
				},
			},
		];
		if (didMediaKeyChange) {
			messages.push({
				key: "ResetPlaybackRecoveryState",
				value: {
					clearAdContext: didResetAdScopedState,
					previousMediaKey: previousMediaKey || null,
					preservedMediaKey,
				},
			});
		}
		if (didResetAdScopedState && !preservedMediaKey) {
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

function _releasePlaybackContext(context) {
	if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__) return false;
	const releasedContext = _normalizePlaybackContext(context);
	const releasedMediaKey = releasedContext.MediaKey;
	if (!releasedMediaKey) return false;

	delete __TTVAB_STATE__.StreamInfos[releasedMediaKey];
	delete __TTVAB_STATE__.AdPodProgressByMediaKey?.[releasedMediaKey];
	for (const url in __TTVAB_STATE__.StreamInfosByUrl) {
		if (__TTVAB_STATE__.StreamInfosByUrl[url]?.MediaKey === releasedMediaKey) {
			delete __TTVAB_STATE__.StreamInfosByUrl[url];
		}
	}
	if (
		_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) === releasedMediaKey
	) {
		__TTVAB_STATE__.CurrentAdChannel = null;
		__TTVAB_STATE__.CurrentAdMediaKey = null;
	}
	if (
		_normalizeMediaKey(__TTVAB_STATE__.PinnedBackupPlayerMediaKey) ===
		releasedMediaKey
	) {
		__TTVAB_STATE__.PinnedBackupPlayerType = null;
		__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
		__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
	}
	if (
		_normalizeMediaKey(__TTVAB_STATE__.ActiveCodecHandoffMediaKey) ===
		releasedMediaKey
	) {
		__TTVAB_STATE__.ActiveCodecHandoffId = null;
		__TTVAB_STATE__.ActiveCodecHandoffChannel = null;
		__TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
	}
	if (
		_normalizeMediaKey(__TTVAB_STATE__.LastAdEndedMediaKey) === releasedMediaKey
	) {
		__TTVAB_STATE__.LastAdEndedAt = 0;
		__TTVAB_STATE__.LastAdEndedChannel = null;
		__TTVAB_STATE__.LastAdEndedMediaKey = null;
		__TTVAB_STATE__.LastAdEndedCycleStartedAt = 0;
	}
	if (
		_normalizeMediaKey(__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey) ===
		releasedMediaKey
	) {
		__TTVAB_STATE__.HasTriggeredPlayerReload = false;
		__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
		__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
		__TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
		__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt = 0;
	}
	if (
		_normalizeMediaKey(__TTVAB_STATE__.ShouldResumeAfterAdMediaKey) ===
		releasedMediaKey
	) {
		__TTVAB_STATE__.ShouldResumeAfterAd = false;
		__TTVAB_STATE__.ShouldResumeAfterAdChannel = null;
		__TTVAB_STATE__.ShouldResumeAfterAdMediaKey = null;
		__TTVAB_STATE__.ShouldResumeAfterAdUntil = 0;
	}
	if (typeof _clearPlaybackRecoveryTimeoutsForContext === "function") {
		_clearPlaybackRecoveryTimeoutsForContext(releasedMediaKey);
	}
	if (typeof _clearSuppressedMediaTracking === "function") {
		_clearSuppressedMediaTracking({
			restoreConnected: true,
			onlyMediaKey: releasedMediaKey,
		});
	}
	_broadcastWorkers({
		key: "ReleasePlaybackContext",
		targetMediaKey: releasedMediaKey,
		value: {
			mediaType: releasedContext.MediaType,
			channelName: releasedContext.ChannelName,
			vodID: releasedContext.VodID,
			mediaKey: releasedMediaKey,
		},
	});
	return true;
}

function _getPlayerReloadAtForMediaKey(mediaKey) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	if (!normalizedMediaKey) return 0;
	return Math.max(
		0,
		Number(
			__TTVAB_STATE__?.LastPlayerReloadAtByMediaKey?.[normalizedMediaKey],
		) || 0,
	);
}

function _recordPlayerReloadAt(mediaKey, at = Date.now()) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	const normalizedAt = Math.max(0, Number(at) || 0);
	if (!normalizedMediaKey || normalizedAt <= 0) return 0;
	if (
		!__TTVAB_STATE__.LastPlayerReloadAtByMediaKey ||
		typeof __TTVAB_STATE__.LastPlayerReloadAtByMediaKey !== "object"
	) {
		__TTVAB_STATE__.LastPlayerReloadAtByMediaKey = Object.create(null);
	}
	delete __TTVAB_STATE__.LastPlayerReloadAtByMediaKey[normalizedMediaKey];
	__TTVAB_STATE__.LastPlayerReloadAtByMediaKey[normalizedMediaKey] =
		normalizedAt;
	return normalizedAt;
}

function _syncPagePlaybackContext(options = {}) {
	return _setPagePlaybackContext(
		_getPlaybackContextFromUrl(globalThis?.location?.href || ""),
		options,
	);
}

function _invalidateAdCycleAsyncWork(info) {
	if (!info) return false;
	info.BackupSearchEpoch = Math.max(0, Number(info.BackupSearchEpoch) || 0) + 1;
	info._BackupSearchPromises?.clear?.();
	info._BackupSearchPromise = null;
	info._BackupSearchKey = null;
	info._BackupSearchStartedAt = 0;
	info._BackupSearchStartToken = null;
	info._LastBackupSearchCompletedAt = 0;
	info._BackupProbation = null;
	info.BackupPlaylistMetadata?.clear?.();
	info.LastCleanBackupM3U8 = null;
	info.LastCleanBackupAt = 0;
	info._IncompletePodCleanStartedAt = 0;
	info._IncompletePodCleanPlaylistCount = 0;
	info._IncompletePodLastMediaSequence = null;
	info._IncompletePodCandidateUrl = null;
	info.NativeRecoveryProbeEpoch =
		Math.max(0, Number(info.NativeRecoveryProbeEpoch) || 0) + 1;
	info._NativeRecoveryProbeInFlight = false;
	info._NativeRecoveryProbeToken = null;
	info.LastNativeRecoveryProbeAt = 0;
	info.LastNativeRecoveryReadyPlayerType = null;
	info.NativeRecoveryCleanCount = 0;
	info.NativeRecoveryProbeStreamUrl = null;
	info.NativeRecoveryProbeMediaKey = null;
	info.NativeRecoveryProbePlayerType = null;
	info.NativeRecoveryProbeCycleStartedAt = 0;
	info.NativeRecoveryProbeLastMediaSequence = null;
	info.NativeRecoveryProbeLastAdvancedAt = 0;
	info.NativeRecoveryAdPlaylistUrls?.clear?.();
	info.NativeRecoveryAdMediaKey = null;
	info.NativeRecoveryAdStartedAt = 0;
	info.NativeRecoveryCandidateUrl = null;
	info.NativeRecoveryCandidateMediaKey = null;
	info.NativeRecoveryCandidateCycleStartedAt = 0;
	info.NativeRecoveryCandidateStage = null;
	info.NativeRecoveryCandidateStartedAt = 0;
	info.NativeRecoveryCandidateCleanCount = 0;
	info.NativeRecoveryCandidateLastMediaSequence = null;
	info.ConsecutiveFailedNativeProbes = 0;
	info._FatalMediaRecoveryRequestId = null;
	info.RequestedAds?.clear?.();
	if (info._AdRequestController) {
		info._AdRequestController.abort?.();
		info._AdRequestController = null;
	}
	return true;
}

function _mergeAdPodProgress(value) {
	const context = _normalizePlaybackContext(value);
	const mediaKey = context.MediaKey;
	if (!mediaKey) return null;
	if (
		!__TTVAB_STATE__.AdPodProgressByMediaKey ||
		typeof __TTVAB_STATE__.AdPodProgressByMediaKey !== "object"
	) {
		__TTVAB_STATE__.AdPodProgressByMediaKey = Object.create(null);
	}
	const incomingCycleStartedAt = Math.max(
		0,
		Number(value?.cycleStartedAt) || 0,
	);
	const current = __TTVAB_STATE__.AdPodProgressByMediaKey[mediaKey] || null;
	const currentCycleStartedAt = Math.max(
		0,
		Number(current?.cycleStartedAt) || 0,
	);
	if (
		current &&
		incomingCycleStartedAt > 0 &&
		currentCycleStartedAt > incomingCycleStartedAt
	) {
		return current;
	}
	if (current && currentCycleStartedAt > 0 && incomingCycleStartedAt <= 0) {
		return current;
	}
	const shouldReplace =
		!current ||
		(incomingCycleStartedAt > 0 &&
			incomingCycleStartedAt > currentCycleStartedAt);
	const adIds = new Set(
		shouldReplace ? [] : Array.isArray(current?.adIds) ? current.adIds : [],
	);
	if (Array.isArray(value?.adIds)) {
		for (const adId of value.adIds) {
			if (typeof adId === "string" && adId) adIds.add(adId);
		}
	}
	const entry = {
		adIds: Array.from(adIds).slice(-50),
		expectedPodLength: Math.max(
			shouldReplace ? 0 : Math.max(0, Number(current?.expectedPodLength) || 0),
			Math.max(0, Number(value?.expectedPodLength) || 0),
		),
		maxAdPodPosition: Math.max(
			shouldReplace ? 0 : Math.max(0, Number(current?.maxAdPodPosition) || 0),
			Math.max(0, Number(value?.maxAdPodPosition) || 0),
		),
		observedZeroAdPodPosition: Boolean(
			(!shouldReplace && current?.observedZeroAdPodPosition === true) ||
				value?.observedZeroAdPodPosition === true,
		),
		cycleStartedAt: shouldReplace
			? incomingCycleStartedAt || currentCycleStartedAt || Date.now()
			: currentCycleStartedAt || incomingCycleStartedAt || Date.now(),
		updatedAt: Date.now(),
	};
	__TTVAB_STATE__.AdPodProgressByMediaKey[mediaKey] = entry;
	return entry;
}

function _applyAdPodProgressToInfo(info, value) {
	if (!info) return null;
	const entry = _mergeAdPodProgress({
		...value,
		mediaType: info.MediaType,
		channelName: info.ChannelName,
		vodID: info.VodID,
		mediaKey: info.MediaKey,
	});
	if (!entry) return null;
	const previousCycleStartedAt = Math.max(
		0,
		Number(info.VisibleAdStartedAt) || 0,
	);
	const nextCycleStartedAt = Math.max(0, Number(entry.cycleStartedAt) || 0);
	if (nextCycleStartedAt > 0 && nextCycleStartedAt !== previousCycleStartedAt) {
		_invalidateAdCycleAsyncWork(info);
	}
	if (!(info.ObservedAdPodIds instanceof Set)) {
		info.ObservedAdPodIds = new Set();
	}
	for (const adId of entry.adIds) {
		info.ObservedAdPodIds.add(adId);
	}
	info.ExpectedAdPodLength = Math.max(
		Math.max(0, Number(info.ExpectedAdPodLength) || 0),
		Math.max(0, Number(entry.expectedPodLength) || 0),
	);
	info.MaxObservedAdPodPosition = Math.max(
		Math.max(0, Number(info.MaxObservedAdPodPosition) || 0),
		Math.max(0, Number(entry.maxAdPodPosition) || 0),
	);
	info.ObservedZeroAdPodPosition = Boolean(
		info.ObservedZeroAdPodPosition === true ||
			entry.observedZeroAdPodPosition === true,
	);
	info.LastAdPodProgressAt = Math.max(0, Number(entry.updatedAt) || 0);
	info._IncompletePodCleanStartedAt = 0;
	info._IncompletePodCleanPlaylistCount = 0;
	info._IncompletePodLastMediaSequence = null;
	info._IncompletePodCandidateUrl = null;
	info.NativeRecoveryCandidateUrl = null;
	info.NativeRecoveryCandidateMediaKey = null;
	info.NativeRecoveryCandidateCycleStartedAt = 0;
	info.NativeRecoveryCandidateStage = null;
	info.NativeRecoveryCandidateStartedAt = 0;
	info.NativeRecoveryCandidateCleanCount = 0;
	info.NativeRecoveryCandidateLastMediaSequence = null;
	if (nextCycleStartedAt > 0) {
		info.VisibleAdStartedAt = nextCycleStartedAt;
	}
	return entry;
}

function _clearAdPodProgress(mediaKey) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	if (!normalizedMediaKey) return false;
	let didClear = false;
	if (__TTVAB_STATE__.AdPodProgressByMediaKey?.[normalizedMediaKey]) {
		delete __TTVAB_STATE__.AdPodProgressByMediaKey[normalizedMediaKey];
		didClear = true;
	}
	const streamInfos = Object.values(
		__TTVAB_STATE__.StreamInfos || {},
	) as Array<{
		MediaKey?: string | null;
		ObservedAdPodIds?: Set<string>;
		ExpectedAdPodLength?: number;
		MaxObservedAdPodPosition?: number;
		ObservedZeroAdPodPosition?: boolean;
		LastAdPodProgressAt?: number;
		_IncompletePodCleanStartedAt?: number;
		_IncompletePodCleanPlaylistCount?: number;
		_IncompletePodLastMediaSequence?: number | null;
		_IncompletePodCandidateUrl?: string | null;
		NativeRecoveryCandidateUrl?: string | null;
		NativeRecoveryCandidateMediaKey?: string | null;
		NativeRecoveryCandidateCycleStartedAt?: number;
		NativeRecoveryCandidateStage?: string | null;
		NativeRecoveryCandidateStartedAt?: number;
		NativeRecoveryCandidateCleanCount?: number;
		NativeRecoveryCandidateLastMediaSequence?: number | null;
		NativeRecoveryAdPlaylistUrls?: Set<string>;
		NativeRecoveryAdMediaKey?: string | null;
		NativeRecoveryAdStartedAt?: number;
		VisibleAdStartedAt?: number;
	}>;
	for (const info of streamInfos) {
		if (_normalizeMediaKey(info?.MediaKey) !== normalizedMediaKey) continue;
		if (Math.max(0, Number(info.VisibleAdStartedAt) || 0) > 0) {
			_invalidateAdCycleAsyncWork(info);
		}
		info.ObservedAdPodIds?.clear?.();
		info.ExpectedAdPodLength = 0;
		info.MaxObservedAdPodPosition = 0;
		info.ObservedZeroAdPodPosition = false;
		info.LastAdPodProgressAt = 0;
		info._IncompletePodCleanStartedAt = 0;
		info._IncompletePodCleanPlaylistCount = 0;
		info._IncompletePodLastMediaSequence = null;
		info._IncompletePodCandidateUrl = null;
		info.NativeRecoveryCandidateUrl = null;
		info.NativeRecoveryCandidateMediaKey = null;
		info.NativeRecoveryCandidateCycleStartedAt = 0;
		info.NativeRecoveryCandidateStage = null;
		info.NativeRecoveryCandidateStartedAt = 0;
		info.NativeRecoveryCandidateCleanCount = 0;
		info.NativeRecoveryCandidateLastMediaSequence = null;
		info.NativeRecoveryAdPlaylistUrls?.clear?.();
		info.NativeRecoveryAdMediaKey = null;
		info.NativeRecoveryAdStartedAt = 0;
		info.VisibleAdStartedAt = 0;
		didClear = true;
	}
	return didClear;
}

function _declareState(scope) {
	scope.__TTVAB_STATE__ = {
		AdSignifier: _C.AD_SIGNIFIER,
		BackupPlayerTypes: [..._C.PLAYER_TYPES],
		FallbackPlayerType: _C.FALLBACK_TYPE,
		ForceAccessTokenPlayerType: _C.FORCE_TYPE,
		RewriteNativePlaybackAccessToken:
			_C.REWRITE_NATIVE_PLAYBACK_ACCESS_TOKEN ?? false,
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
		AdEndGraceMs: _C.AD_END_GRACE_MS ?? 500,
		AdEndMaxWaitMs: _C.AD_END_MAX_WAIT_MS ?? 4000,
		AdEndBackupHoldMaxMs: _C.AD_END_BACKUP_HOLD_MAX_MS ?? 90000,
		AdEndBounceDebounceMs: 3000,
		SilentBackupHoldMaxMs: 120000,
		AdEndMinCleanPlaylists: _C.AD_END_MIN_CLEAN_PLAYLISTS ?? 3,
		AdEndMinNativeRecoveryProbes: _C.AD_END_MIN_NATIVE_RECOVERY_PROBES ?? 3,
		AdEndNativeRecoveryProbeCooldownMs:
			_C.AD_END_NATIVE_RECOVERY_PROBE_COOLDOWN_MS ?? 500,
		AdEndMaxFailedNativeProbes: _C.AD_END_MAX_FAILED_NATIVE_PROBES ?? 6,
		AdRecoveryReloadCooldownMs: _C.AD_RECOVERY_RELOAD_COOLDOWN_MS ?? 30000,
		PinnedBackupStallDetectionMs: _C.PINNED_BACKUP_STALL_DETECTION_MS ?? 3000,
		PinnedBackupStallPollMs: _C.PINNED_BACKUP_STALL_POLL_MS ?? 1500,
		BackupSearchForceRefreshAt: 0,
		LastPinnedBackupStallDetectedAt: 0,
		LqHqHoldMinMs: _C.LQ_HQ_HOLD_MIN_MS ?? 8000,
		HasTriggeredPlayerReload: false,
		PendingTriggeredPlayerReloadChannel: null,
		PendingTriggeredPlayerReloadMediaKey: null,
		PendingTriggeredPlayerReloadAt: 0,
		PendingTriggeredPlayerReloadCycleStartedAt: 0,
		LastPlayerReloadAt: 0,
		LastPlayerReloadAtByMediaKey: Object.create(null),
		LastAdDetectedAt: 0,
		LastAdEndedAt: 0,
		LastAdEndedChannel: null,
		LastAdEndedMediaKey: null,
		LastAdEndedCycleStartedAt: 0,
		LastAdRecoveryReloadAt: 0,
		LastAdRecoveryResumeAt: 0,
		CurrentAdChannel: null,
		CurrentAdMediaKey: null,
		PinnedBackupPlayerType: null,
		PinnedBackupPlayerChannel: null,
		PinnedBackupPlayerMediaKey: null,
		ActiveCodecHandoffId: null,
		ActiveCodecHandoffChannel: null,
		ActiveCodecHandoffMediaKey: null,
		AdPodProgressByMediaKey: Object.create(null),
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
		IsBufferFixEnabled: _C.BUFFERING_FIX,
		AdSegmentCache: new Map(),
		SegmentCodecOwners: new Map(),
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
		PlayerHasPlayedOnce: false,
		PlayerIsPlaying: false,
		PendingInitialAdsBlockedDelta: 0,
		PendingFetchRequests: new Map(),
		FetchRequestSeq: 0,
		_AdRecoveryConsecutiveFailures: 0,
		DisableAdSpoofing: false,
		DisableAutoplayBackup: false,
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

function _incrementAdsBlocked(channel, mediaKey = null) {
	_S.adsBlocked++;
	const count = Number.isFinite(_S.adsBlocked)
		? Math.max(0, Math.trunc(_S.adsBlocked))
		: 0;
	_S.adsBlocked = count;
	if (
		typeof window !== "undefined" &&
		typeof __TTVAB_STATE__ !== "undefined" &&
		__TTVAB_STATE__ &&
		__TTVAB_STATE__.HasResolvedAdsCountState !== true
	) {
		__TTVAB_STATE__.PendingInitialAdsBlockedDelta = Math.max(
			0,
			Math.trunc(Number(__TTVAB_STATE__.PendingInitialAdsBlockedDelta) || 0) +
				1,
		);
	}
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
		_postWorkerBridgeMessage(self, {
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
