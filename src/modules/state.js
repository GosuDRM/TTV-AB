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
		CurrentAdChannel: null,
		PinnedBackupPlayerType: null,
		PinnedBackupPlayerChannel: null,
		ShouldResumeAfterAd: false,
		ShouldResumeAfterAdChannel: null,
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
		PageChannel: null,
		PendingFetchRequests: new Map(),
		FetchRequestSeq: 0,
	};
}

function _incrementAdsBlocked(channel) {
	_S.adsBlocked++;
	const count = Number.isFinite(_S.adsBlocked)
		? Math.max(0, Math.trunc(_S.adsBlocked))
		: 0;
	_S.adsBlocked = count;
	if (typeof _broadcastWorkers === "function") {
		_broadcastWorkers({ key: "UpdateAdsBlocked", value: _S.adsBlocked });
	}
	const safeChannel = typeof channel === "string" ? channel : null;
	if (typeof window !== "undefined") {
		window.postMessage(
			{
				type: "ttvab-ad-blocked",
				detail: { count, channel: safeChannel },
			},
			"*",
		);
	} else if (typeof self !== "undefined" && self.postMessage) {
		self.postMessage({
			key: "AdBlocked",
			count: _S.adsBlocked,
			channel: safeChannel,
		});
	}
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
