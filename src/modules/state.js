// TTV AB - State

const _S = {
	workers: [],
	conflicts: ["twitch", "isVariantA"],
	reinsertPatterns: ["isVariantA", "besuper/", "${patch_url}"],
	adsBlocked: 0,
	domAdsBlocked: 0,
};

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

function _setPagePlaybackContext(context, options = {}) {
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
	if (typeof window !== "undefined") {
		window.postMessage(
			{
				type: "ttvab-ad-blocked",
				detail: {
					count,
					channel: safeChannel,
					mediaKey: safeMediaKey,
					pageChannel: pageEventContext.pageChannel,
					pageMediaKey: pageEventContext.pageMediaKey,
				},
			},
			"*",
		);
	} else if (typeof self !== "undefined" && self.postMessage) {
		self.postMessage({
			key: "AdBlocked",
			count: _S.adsBlocked,
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
		window.postMessage(
			{
				type: "ttvab-dom-ad-cleanup",
				detail: {
					count,
					kind: safeKind,
					channel: safeChannel,
				},
			},
			"*",
		);
	}
}
