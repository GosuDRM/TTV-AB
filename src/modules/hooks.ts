// TTV AB - Hooks

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
const _POST_AD_REMOVABLE_SELECTOR_GROUP =
	_POST_AD_REMOVABLE_SELECTORS.join(", ");
const _POST_AD_RESET_SELECTOR_GROUP = _POST_AD_RESET_ONLY_SELECTORS.join(", ");
let _pendingPostAdArtifactCleanup = null;
const _pageSideEmptyHoldInfoByUrl = new Map();
const _pageSideVariantCodecByUrl = new Map();
const _pageSidePlaybackOwnerByUrl = new Map();
const _pageAdCycleControlByMediaKey = new Map();
const _trackedExtensionBlobUrls = new Set<string>();
const _CRASHED_WORKER_RECOVERY_MESSAGE_KEYS = new Set([
	"FetchRequest",
	"LogEntry",
	"AdBlocked",
	"AdSecondsBlocked",
	"AdDetected",
	"AdPodProgress",
	"BackupPlayerTypeSelected",
	"FatalMediaRecoveryReady",
	"AdEnded",
	"NativePlaybackRestored",
	"PauseResumePlayer",
	"ReloadPlayer",
]);

function _claimPageAdCycleControl(
	mediaKey,
	cycleStartedAt,
	workerGeneration,
	eventAt,
	allowConfirmedTerminalTakeover = false,
	terminalWorker = null,
) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	const normalizedCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	const normalizedWorkerGeneration = Math.max(0, Number(workerGeneration) || 0);
	const normalizedEventAt = Math.max(0, Number(eventAt) || 0);
	if (
		!normalizedMediaKey ||
		normalizedCycleStartedAt <= 0 ||
		normalizedWorkerGeneration <= 0 ||
		normalizedEventAt <= 0 ||
		!Number.isFinite(normalizedCycleStartedAt) ||
		!Number.isFinite(normalizedWorkerGeneration) ||
		!Number.isFinite(normalizedEventAt)
	) {
		return false;
	}
	const previous =
		_pageAdCycleControlByMediaKey.get(normalizedMediaKey) || null;
	const previousCycleStartedAt = Math.max(
		0,
		Number(previous?.cycleStartedAt) || 0,
	);
	const canTakeOverProvisionalTerminalControl = Boolean(
		allowConfirmedTerminalTakeover === true &&
			_isConfirmedPlaybackOwnerFinishingProvisionalAdCycle(
				normalizedMediaKey,
				normalizedCycleStartedAt,
				terminalWorker,
			),
	);
	if (
		previous &&
		(previousCycleStartedAt > normalizedCycleStartedAt ||
			(previousCycleStartedAt === normalizedCycleStartedAt &&
				(Math.max(0, Number(previous.latestEventAt) || 0) > normalizedEventAt ||
					(!canTakeOverProvisionalTerminalControl &&
						Math.max(0, Number(previous.workerGeneration) || 0) >
							normalizedWorkerGeneration))))
	) {
		return false;
	}
	_pageAdCycleControlByMediaKey.delete(normalizedMediaKey);
	_pageAdCycleControlByMediaKey.set(normalizedMediaKey, {
		cycleStartedAt: normalizedCycleStartedAt,
		workerGeneration: normalizedWorkerGeneration,
		latestEventAt: normalizedEventAt,
	});
	while (_pageAdCycleControlByMediaKey.size > 32) {
		const oldestMediaKey = _pageAdCycleControlByMediaKey.keys().next().value;
		if (oldestMediaKey === undefined) break;
		_pageAdCycleControlByMediaKey.delete(oldestMediaKey);
	}
	return true;
}

function _isConfirmedPlaybackOwnerFinishingProvisionalAdCycle(
	mediaKey,
	cycleStartedAt,
	worker,
	now = Date.now(),
) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	const normalizedCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	const normalizedWorkerGeneration = Math.max(
		0,
		Number(worker?.__TTVABGeneration) || 0,
	);
	const normalizedNow = Math.max(0, Number(now) || 0);
	const control = normalizedMediaKey
		? _pageAdCycleControlByMediaKey.get(normalizedMediaKey) || null
		: null;
	const controlWorkerGeneration = Math.max(
		0,
		Number(control?.workerGeneration) || 0,
	);
	const playbackContext = { MediaKey: normalizedMediaKey };
	const confirmedPlaybackOwnerGeneration =
		_getConfirmedWorkerPlaybackOwnerGeneration(normalizedMediaKey);
	const healthyPlaybackOwner = _getHealthyObservedPlaybackWorker(
		playbackContext,
		null,
		normalizedNow,
		0,
		true,
	);
	const matchingConfirmedWorkers = Array.isArray(_S?.workers)
		? _S.workers.filter(
				(candidate) =>
					candidate &&
					Math.max(0, Number(candidate.__TTVABGeneration) || 0) ===
						confirmedPlaybackOwnerGeneration &&
					_getWorkerRecoveryContextKey(_getWorkerPlaybackContext(candidate)) ===
						_getWorkerRecoveryContextKey(playbackContext),
			)
		: [];
	const recoveryState = _getWorkerRecoveryState(playbackContext, false);
	const retiredThroughGeneration = Math.max(
		0,
		Number(recoveryState?.retiredThroughGeneration) || 0,
	);
	return Boolean(
		normalizedMediaKey &&
			normalizedCycleStartedAt > 0 &&
			normalizedWorkerGeneration > 0 &&
			normalizedNow > 0 &&
			Math.max(0, Number(control?.cycleStartedAt) || 0) ===
				normalizedCycleStartedAt &&
			controlWorkerGeneration > normalizedWorkerGeneration &&
			confirmedPlaybackOwnerGeneration === normalizedWorkerGeneration &&
			matchingConfirmedWorkers.length === 1 &&
			matchingConfirmedWorkers[0] === worker &&
			healthyPlaybackOwner === worker &&
			retiredThroughGeneration < normalizedWorkerGeneration &&
			!_isWorkerGenerationRetired(worker, playbackContext),
	);
}

function _isPageAdCycleControlEventCurrent(
	mediaKey,
	cycleStartedAt,
	workerGeneration,
	eventAt,
	terminalWorker = null,
) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	if (!normalizedMediaKey) return false;
	const normalizedCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	const normalizedWorkerGeneration = Math.max(0, Number(workerGeneration) || 0);
	const normalizedEventAt = Math.max(0, Number(eventAt) || 0);
	if (
		normalizedCycleStartedAt <= 0 ||
		normalizedWorkerGeneration <= 0 ||
		normalizedEventAt <= 0 ||
		!Number.isFinite(normalizedCycleStartedAt) ||
		!Number.isFinite(normalizedWorkerGeneration) ||
		!Number.isFinite(normalizedEventAt)
	) {
		return false;
	}
	const control = _pageAdCycleControlByMediaKey.get(normalizedMediaKey) || null;
	if (!control) return true;
	const controlCycleStartedAt = Math.max(
		0,
		Number(control.cycleStartedAt) || 0,
	);
	if (normalizedCycleStartedAt > controlCycleStartedAt) return true;
	if (
		normalizedCycleStartedAt !== controlCycleStartedAt ||
		normalizedEventAt < Math.max(0, Number(control.latestEventAt) || 0)
	) {
		return false;
	}
	const controlWorkerGeneration = Math.max(
		0,
		Number(control.workerGeneration) || 0,
	);
	if (normalizedWorkerGeneration === controlWorkerGeneration) return true;
	if (
		_isConfirmedPlaybackOwnerFinishingProvisionalAdCycle(
			normalizedMediaKey,
			normalizedCycleStartedAt,
			terminalWorker,
		)
	) {
		return true;
	}
	const playbackOwnerGeneration =
		_getConfirmedWorkerPlaybackOwnerGeneration(normalizedMediaKey);
	return Boolean(
		normalizedWorkerGeneration > controlWorkerGeneration &&
			playbackOwnerGeneration >= normalizedWorkerGeneration,
	);
}

function _getConfirmedWorkerPlaybackOwnerGeneration(mediaKey) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	if (!normalizedMediaKey) return 0;
	return Math.max(
		0,
		Number(
			_WorkerPlaybackOwnerGenerationByContext.get(
				_getWorkerRecoveryContextKey({ MediaKey: normalizedMediaKey }),
			),
		) || 0,
	);
}

function _reassignPageAdCycleControlAfterWorkerRetirement(
	mediaKey,
	retiredWorkerGeneration,
	retiredWorker,
	now = Date.now(),
) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	const normalizedFailedGeneration = Math.max(
		0,
		Number(retiredWorkerGeneration) || 0,
	);
	const control = normalizedMediaKey
		? _pageAdCycleControlByMediaKey.get(normalizedMediaKey) || null
		: null;
	const playbackOwnerGeneration =
		_getConfirmedWorkerPlaybackOwnerGeneration(normalizedMediaKey);
	const healthyPlaybackOwner = normalizedMediaKey
		? _getHealthyObservedPlaybackWorker(
				{ MediaKey: normalizedMediaKey },
				retiredWorker,
				now,
				0,
				true,
			)
		: null;
	const healthyOwnerGeneration = Math.max(
		0,
		Number(healthyPlaybackOwner?.__TTVABGeneration) || 0,
	);
	if (
		!control ||
		normalizedFailedGeneration <= 0 ||
		playbackOwnerGeneration <= 0 ||
		playbackOwnerGeneration >= normalizedFailedGeneration ||
		healthyOwnerGeneration !== playbackOwnerGeneration ||
		Math.max(0, Number(control.workerGeneration) || 0) !==
			normalizedFailedGeneration
	) {
		return false;
	}
	control.workerGeneration = playbackOwnerGeneration;
	return true;
}

function _rememberPageSidePlaybackOwner(
	mediaKey,
	playlistUrl,
	codec = null,
	adCycleStartedAt = 0,
	ownership = null,
) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	const codecFamily = _getVideoCodecFamily(codec);
	if (!normalizedMediaKey || typeof playlistUrl !== "string" || !playlistUrl) {
		return false;
	}
	const observedAt = Date.now();
	const normalizedCycleStartedAt = Math.max(0, Number(adCycleStartedAt) || 0);
	const exactPlaylistUrl = _getExactPlaylistUrlKey(playlistUrl);
	if (!exactPlaylistUrl) return false;
	const previous = _pageSidePlaybackOwnerByUrl.get(exactPlaylistUrl) || null;
	const hasSamePreviousOwner =
		_normalizeMediaKey(previous?.mediaKey) === normalizedMediaKey;
	const isConfirmedPlayback = ownership?.confirmedPlayback === true;
	const isAdMarked = ownership?.adMarked === true;
	const previousCycleStartedAt = hasSamePreviousOwner
		? Math.max(0, Number(previous?.adCycleStartedAt) || 0)
		: 0;
	const confirmedPlaybackAt = isConfirmedPlayback
		? observedAt
		: hasSamePreviousOwner
			? Math.max(0, Number(previous?.confirmedPlaybackAt) || 0)
			: 0;
	_pageSidePlaybackOwnerByUrl.delete(exactPlaylistUrl);
	_pageSidePlaybackOwnerByUrl.set(exactPlaylistUrl, {
		mediaKey: normalizedMediaKey,
		codecFamily: isConfirmedPlayback
			? codecFamily || null
			: (hasSamePreviousOwner ? previous?.codecFamily : null) || null,
		observedAt,
		confirmedPlaybackAt,
		workerGeneration: isConfirmedPlayback
			? Math.max(0, Number(ownership?.workerGeneration) || 0)
			: hasSamePreviousOwner
				? Math.max(0, Number(previous?.workerGeneration) || 0)
				: 0,
		handoffId: isConfirmedPlayback
			? typeof ownership?.handoffId === "string" && ownership.handoffId
				? ownership.handoffId
				: null
			: hasSamePreviousOwner
				? previous?.handoffId || null
				: null,
		decoderCodecFamily: isConfirmedPlayback
			? _getVideoCodecFamily(ownership?.decoderCodec)
			: hasSamePreviousOwner
				? previous?.decoderCodecFamily || null
				: null,
		lastAdMarkedAt: isAdMarked
			? observedAt
			: hasSamePreviousOwner
				? Math.max(0, Number(previous?.lastAdMarkedAt) || 0)
				: 0,
		adCycleStartedAt: Math.max(
			previousCycleStartedAt,
			normalizedCycleStartedAt,
		),
	});
	let remembered = true;
	for (const alias of _getPlaylistUrlAliases(playlistUrl)) {
		if (!alias) continue;
		if (isConfirmedPlayback && codecFamily) {
			_pageSideVariantCodecByUrl.delete(alias);
			_pageSideVariantCodecByUrl.set(alias, codecFamily);
		} else if (isConfirmedPlayback || !hasSamePreviousOwner) {
			_pageSideVariantCodecByUrl.delete(alias);
		}
		remembered = true;
	}
	while (_pageSidePlaybackOwnerByUrl.size > 40) {
		const oldest = _pageSidePlaybackOwnerByUrl.keys().next().value;
		if (oldest === undefined) break;
		_pageSidePlaybackOwnerByUrl.delete(oldest);
	}
	while (_pageSideVariantCodecByUrl.size > 40) {
		const oldest = _pageSideVariantCodecByUrl.keys().next().value;
		if (oldest === undefined) break;
		_pageSideVariantCodecByUrl.delete(oldest);
	}
	return remembered;
}

function _getTrustedPageSidePlaybackOwner(url, mediaKey, cycleStartedAt = 0) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	const normalizedCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	if (!normalizedMediaKey) return null;
	const exactOwner = _pageSidePlaybackOwnerByUrl.get(
		_getExactPlaylistUrlKey(url),
	);
	if (
		_normalizeMediaKey(exactOwner?.mediaKey) !== normalizedMediaKey ||
		Math.max(0, Number(exactOwner?.confirmedPlaybackAt) || 0) <= 0 ||
		(normalizedCycleStartedAt > 0 &&
			Math.max(0, Number(exactOwner?.adCycleStartedAt) || 0) !==
				normalizedCycleStartedAt)
	) {
		return null;
	}
	const recoveryState = _getWorkerRecoveryState(
		{ MediaKey: normalizedMediaKey },
		false,
	);
	const playbackOwnerGeneration = Math.max(
		0,
		Number(
			_WorkerPlaybackOwnerGenerationByContext.get(
				_getWorkerRecoveryContextKey({ MediaKey: normalizedMediaKey }),
			),
		) || 0,
	);
	const exactOwnerGeneration = Math.max(
		0,
		Number(exactOwner.workerGeneration) || 0,
	);
	const relevantReloadAt = _getPlayerReloadAtForMediaKey(normalizedMediaKey);
	if (
		exactOwnerGeneration <= 0 ||
		playbackOwnerGeneration <= 0 ||
		exactOwnerGeneration !== playbackOwnerGeneration ||
		(Math.max(0, Number(recoveryState?.retiredThroughGeneration) || 0) > 0 &&
			exactOwnerGeneration <=
				Math.max(0, Number(recoveryState.retiredThroughGeneration) || 0)) ||
		Math.max(0, Number(exactOwner.confirmedPlaybackAt) || 0) <= relevantReloadAt
	) {
		return null;
	}
	if (
		_normalizeMediaKey(__TTVAB_STATE__?.ActiveCodecHandoffMediaKey) ===
			normalizedMediaKey &&
		__TTVAB_STATE__?.ActiveCodecHandoffId
	) {
		return null;
	}
	if (exactOwner.handoffId) return null;
	const codecFamily = _getVideoCodecFamily(exactOwner.codecFamily);
	const decoderCodecFamily = _getVideoCodecFamily(
		exactOwner.decoderCodecFamily,
	);
	if (
		!codecFamily ||
		(decoderCodecFamily && decoderCodecFamily !== codecFamily)
	) {
		return null;
	}
	return exactOwner;
}

function _canServePageSideAvcHold(url, mediaKey, cycleStartedAt) {
	return Boolean(
		_getVideoCodecFamily(
			_getTrustedPageSidePlaybackOwner(url, mediaKey, cycleStartedAt)
				?.codecFamily,
		) === "avc",
	);
}

function _resetWorkerAdCycleState(value) {
	const resetContext = _normalizePlaybackContext(value);
	const mediaKey = resetContext.MediaKey;
	const cycleStartedAt = Math.max(0, Number(value?.cycleStartedAt) || 0);
	if (!mediaKey || cycleStartedAt <= 0) return false;
	const progress = __TTVAB_STATE__?.AdPodProgressByMediaKey?.[mediaKey] || null;
	const progressCycleStartedAt = Math.max(
		0,
		Number(progress?.cycleStartedAt) || 0,
	);
	const streamInfos = Object.values(
		__TTVAB_STATE__?.StreamInfos || {},
	) as Array<{ MediaKey?: string | null; VisibleAdStartedAt?: number }>;
	const matchingInfos = streamInfos.filter(
		(info) => _normalizeMediaKey(info?.MediaKey) === mediaKey,
	);
	const newestInfoCycleStartedAt = matchingInfos.reduce(
		(newest, info) =>
			Math.max(newest, Math.max(0, Number(info?.VisibleAdStartedAt) || 0)),
		0,
	);
	if (
		progressCycleStartedAt > cycleStartedAt ||
		newestInfoCycleStartedAt > cycleStartedAt
	) {
		return false;
	}
	const ownsCurrentAd =
		_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) === mediaKey;
	let didReset = false;
	for (const info of matchingInfos) {
		const infoCycleStartedAt = Math.max(
			0,
			Number(info?.VisibleAdStartedAt) || 0,
		);
		if (infoCycleStartedAt > cycleStartedAt) {
			continue;
		}
		_resetStreamAdState(info);
		didReset = true;
	}
	if (progressCycleStartedAt === cycleStartedAt) {
		_clearAdPodProgress(mediaKey);
		didReset = true;
	}
	if (!didReset && !ownsCurrentAd) return false;
	if (ownsCurrentAd) {
		__TTVAB_STATE__.CurrentAdChannel = null;
		__TTVAB_STATE__.CurrentAdMediaKey = null;
	}
	if (
		_normalizeMediaKey(__TTVAB_STATE__?.PinnedBackupPlayerMediaKey) === mediaKey
	) {
		__TTVAB_STATE__.PinnedBackupPlayerType = null;
		__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
		__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
	}
	return true;
}

function _hidePostAdArtifact(el) {
	if (!(el instanceof Element)) return;
	el.style.setProperty("display", "none", "important");
	el.style.setProperty("visibility", "hidden", "important");
	el.style.setProperty("pointer-events", "none", "important");
	el.setAttribute("data-ttvab-post-ad-hidden", "true");
}

function _isPostAdPlayerLayoutWrapper(el) {
	if (!(el instanceof Element)) return false;
	return Boolean(
		el.querySelector?.("video") ||
			el.matches?.('[data-a-target="video-player"]') ||
			el.matches?.('[class*="video-player"]'),
	);
}

function _resetPostAdDisplayArtifact(el) {
	if (!(el instanceof Element)) return;

	if (
		typeof el.className === "string" &&
		el.className.includes("stream-display-ad")
	) {
		el.className = el.className
			.split(/\s+/)
			.filter(
				(className) => className && !className.includes("stream-display-ad"),
			)
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
		for (const el of document.querySelectorAll(
			_POST_AD_REMOVABLE_SELECTOR_GROUP,
		)) {
			_resetPostAdDisplayArtifact(el);
		}

		for (const el of document.querySelectorAll(_POST_AD_RESET_SELECTOR_GROUP)) {
			_resetPostAdDisplayArtifact(el);
		}
	} catch (_e) {}
}

function _runPostAdPlayerTask(isPausePlay, isReload, options, attempt = 0) {
	if (typeof _doPlayerTask !== "function") return false;
	const channel = options?.channel || null;
	const mediaKey = options?.mediaKey || null;
	if (
		(typeof _hasPendingAdResumeIntent === "function" &&
			!_hasPendingAdResumeIntent(channel, mediaKey)) ||
		(typeof _hasUserPauseIntent === "function" &&
			_hasUserPauseIntent(channel, mediaKey)) ||
		(typeof _shouldSuppressAutomaticPlaybackResume === "function" &&
			_shouldSuppressAutomaticPlaybackResume(channel, mediaKey))
	) {
		return false;
	}
	let didRun = false;
	try {
		didRun = _doPlayerTask(isPausePlay, isReload, options) === true;
	} catch (error) {
		_log(
			`Post-ad player task failed (${options?.reason || "ad-recovery"}): ${error?.message ?? String(error)}`,
			"warning",
		);
	}
	if (didRun) return true;

	const retryDelays = [80, 250, 700];
	if (
		attempt >= retryDelays.length ||
		typeof _schedulePlaybackRecoveryTimeout !== "function"
	) {
		_log(
			`Post-ad player task remained unavailable (${options?.reason || "ad-recovery"})`,
			"warning",
		);
		return false;
	}

	_schedulePlaybackRecoveryTimeout(
		() => _runPostAdPlayerTask(isPausePlay, isReload, options, attempt + 1),
		retryDelays[attempt],
		options?.channel || null,
		options?.mediaKey || null,
		Math.max(0, Number(options?.cycleStartedAt) || 0),
	);
	return false;
}

function _schedulePostAdArtifactCleanup(
	channel = null,
	mediaKey = null,
	cycleStartedAt = 0,
) {
	if (_pendingPostAdArtifactCleanup?.id) {
		clearTimeout(_pendingPostAdArtifactCleanup.id);
	}

	const entry = {
		id: 0,
		channel,
		mediaKey,
		cycleStartedAt: Math.max(0, Number(cycleStartedAt) || 0),
	};
	entry.id = setTimeout(() => {
		if (_pendingPostAdArtifactCleanup !== entry) {
			return;
		}
		_pendingPostAdArtifactCleanup = null;
		if (
			typeof _isPlaybackRecoveryContextCurrent === "function" &&
			!_isPlaybackRecoveryContextCurrent(entry.channel, entry.mediaKey)
		) {
			return;
		}
		if (!_isPageLifecycleCycleCurrent(entry.mediaKey, entry.cycleStartedAt)) {
			return;
		}
		_runPostAdArtifactCleanup();
	}, 80);

	_pendingPostAdArtifactCleanup = entry;
	return entry.id;
}

function _isPageLifecycleCycleCurrent(mediaKey, cycleStartedAt) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	const expectedCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	if (!normalizedMediaKey || expectedCycleStartedAt <= 0) return false;
	if (_isCodecHandoffCycleCurrent(normalizedMediaKey, expectedCycleStartedAt)) {
		return true;
	}
	if (_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey)) {
		return false;
	}
	return Boolean(
		_normalizeMediaKey(__TTVAB_STATE__?.LastAdEndedMediaKey) ===
			normalizedMediaKey &&
			Math.max(0, Number(__TTVAB_STATE__?.LastAdEndedCycleStartedAt) || 0) ===
				expectedCycleStartedAt &&
			Date.now() - Math.max(0, Number(__TTVAB_STATE__?.LastAdEndedAt) || 0) <
				30000,
	);
}

function _hookWorkerFetch() {
	_log("Worker fetch hooked", "info");
	const realFetch = fetch;
	const observedPlaybackMediaKeys = new Map();
	const requestedMediaBootstrapRecoveryCycles = new Set();
	const reportPlaybackWorkerObserved = (
		context,
		playlistUrl = null,
		codec = null,
	) => {
		const observedContext = _normalizePlaybackContext(context);
		if (!observedContext.MediaKey) return false;
		const observedPlaylistUrl =
			typeof playlistUrl === "string" && playlistUrl
				? _getExactPlaylistUrlKey(playlistUrl)
				: null;
		const observedCodec =
			_getVideoCodecIdentity(codec) || _getVideoCodecFamily(codec) || null;
		const observedDecoderCodec =
			_getVideoCodecIdentity(context?.EnhancedDecoderCodec) ||
			_getVideoCodecFamily(context?.EnhancedDecoderCodecFamily) ||
			null;
		const observedHandoffId = _getActiveCodecHandoffIdForInfo(context);
		const observationKey = `${observedContext.MediaKey}|${observedPlaylistUrl || "context"}|${observedCodec || "unknown"}|${observedDecoderCodec || "native"}|${observedHandoffId || "settled"}`;
		const now = Date.now();
		const lastObservedAt = Math.max(
			0,
			Number(observedPlaybackMediaKeys.get(observationKey)) || 0,
		);
		if (
			observedPlaybackMediaKeys.has(observationKey) &&
			now - lastObservedAt < 5000
		) {
			return false;
		}
		if (typeof self !== "undefined" && self.postMessage) {
			try {
				_postWorkerBridgeMessage(self, {
					key: "PlaybackWorkerObserved",
					mediaType: observedContext.MediaType,
					channel: observedContext.ChannelName,
					vodID: observedContext.VodID,
					mediaKey: observedContext.MediaKey,
					playlistUrl: observedPlaylistUrl,
					codec: observedCodec,
					decoderCodec: observedDecoderCodec,
					handoffId: observedHandoffId,
				});
				observedPlaybackMediaKeys.delete(observationKey);
				observedPlaybackMediaKeys.set(observationKey, now);
				while (observedPlaybackMediaKeys.size > 16) {
					const oldestObservation = observedPlaybackMediaKeys
						.keys()
						.next().value;
					if (oldestObservation === undefined) break;
					observedPlaybackMediaKeys.delete(oldestObservation);
				}
			} catch {
				return false;
			}
		}
		return true;
	};
	const reportPlaybackWorkerBootstrapObserved = (context) => {
		const observedContext = _normalizePlaybackContext(context);
		if (!observedContext.MediaKey) return false;
		if (typeof self !== "undefined" && self.postMessage) {
			try {
				_postWorkerBridgeMessage(self, {
					key: "PlaybackWorkerBootstrapObserved",
					mediaType: observedContext.MediaType,
					channel: observedContext.ChannelName,
					vodID: observedContext.VodID,
					mediaKey: observedContext.MediaKey,
				});
				return true;
			} catch {}
		}
		return false;
	};
	__TTVAB_STATE__.RequestMediaBootstrapRecovery = (context, cycleStartedAt) => {
		const recoveryContext = _normalizePlaybackContext(context);
		const normalizedCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
		if (
			!recoveryContext.MediaKey ||
			normalizedCycleStartedAt <= 0 ||
			_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) !==
				recoveryContext.MediaKey ||
			Math.max(
				0,
				Number(
					__TTVAB_STATE__.AdPodProgressByMediaKey?.[recoveryContext.MediaKey]
						?.cycleStartedAt,
				) || 0,
			) !== normalizedCycleStartedAt
		) {
			return false;
		}
		const recoveryKey = `${recoveryContext.MediaKey}|${normalizedCycleStartedAt}`;
		if (requestedMediaBootstrapRecoveryCycles.has(recoveryKey)) return false;
		if (typeof self === "undefined" || !self.postMessage) return false;
		try {
			_postWorkerBridgeMessage(
				self,
				_createPageScopedWorkerEvent({
					key: "MediaBootstrapRecoveryNeeded",
					mediaType: recoveryContext.MediaType,
					channel: recoveryContext.ChannelName,
					vodID: recoveryContext.VodID,
					mediaKey: recoveryContext.MediaKey,
					cycleStartedAt: normalizedCycleStartedAt,
				}),
			);
			requestedMediaBootstrapRecoveryCycles.add(recoveryKey);
			while (requestedMediaBootstrapRecoveryCycles.size > 8) {
				const oldestRecoveryKey = requestedMediaBootstrapRecoveryCycles
					.values()
					.next().value;
				if (oldestRecoveryKey === undefined) break;
				requestedMediaBootstrapRecoveryCycles.delete(oldestRecoveryKey);
			}
			return true;
		} catch {
			return false;
		}
	};
	__TTVAB_STATE__.PrepareFatalMediaRecovery = (request) => {
		const recoveryContext = _normalizePlaybackContext(request);
		const info = recoveryContext.MediaKey
			? __TTVAB_STATE__.StreamInfos[recoveryContext.MediaKey] || null
			: null;
		return _prepareFatalMediaRecovery(info, realFetch, request);
	};

	function _pruneStreamInfos() {
		if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__) return;
		const keys = Object.keys(__TTVAB_STATE__.StreamInfos);
		if (keys.length > 5) {
			const oldKey = keys.sort(
				(a, b) =>
					(__TTVAB_STATE__.StreamInfos[a]?.LastActivityAt || 0) -
					(__TTVAB_STATE__.StreamInfos[b]?.LastActivityAt || 0),
			)[0];
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
			byUrlKeys.sort(
				(a, b) =>
					(__TTVAB_STATE__.StreamInfosByUrl[a]?.LastActivityAt || 0) -
					(__TTVAB_STATE__.StreamInfosByUrl[b]?.LastActivityAt || 0),
			);
			for (let i = 0; i < 50 && i < byUrlKeys.length; i++) {
				delete __TTVAB_STATE__.StreamInfosByUrl[byUrlKeys[i]];
			}
		}
	}

	function _syncStreamInfo(info, encodings, usherUrl) {
		const wasUsingModifiedM3U8 = Boolean(info.IsUsingModifiedM3U8);
		const previousUsherUrl = _getExactPlaylistUrlKey(info.UsherBaseUrl);
		const nextUsherUrl = _getExactPlaylistUrlKey(usherUrl);
		if (previousUsherUrl && nextUsherUrl && previousUsherUrl !== nextUsherUrl) {
			_invalidateNativeRecoveryAfterPlayerReload(info, true);
		}
		info.EncodingsM3U8 = encodings;
		info.UsherBaseUrl = usherUrl;
		info.UsherParams = new URL(usherUrl).search;
		info.Urls = Object.create(null);
		info.ResolutionList = [];
		info.ModifiedM3U8 = null;
		info.IsUsingModifiedM3U8 = false;
		if (!(info.EnhancedVariantUrls instanceof Set)) {
			info.EnhancedVariantUrls = new Set();
		}

		for (const variantUrl in __TTVAB_STATE__.StreamInfosByUrl) {
			if (__TTVAB_STATE__.StreamInfosByUrl[variantUrl] === info) {
				delete __TTVAB_STATE__.StreamInfosByUrl[variantUrl];
			}
		}

		const lines = encodings.split("\n");
		for (let i = 0, len = lines.length; i < len - 1; i++) {
			const nextLine = lines[i + 1]?.trim();
			if (
				lines[i]?.startsWith("#EXT-X-STREAM-INF") &&
				nextLine &&
				!nextLine.startsWith("#") &&
				(nextLine.includes(".m3u8") || nextLine.includes("://"))
			) {
				const attrs = _parseAttrs(lines[i]);
				const resolution = attrs.RESOLUTION;
				let variantUrl = lines[i + 1];
				try {
					variantUrl = new URL(variantUrl, usherUrl).href;
				} catch {}
				if (resolution) {
					const resInfo = _getStreamVariantInfo(
						attrs,
						lines[i + 1],
						variantUrl,
					);
					if (_isEnhancedCodecString(resInfo?.Codecs)) {
						const enhancedVariantUrl = _getExactPlaylistUrlKey(
							variantUrl,
							usherUrl,
						);
						if (enhancedVariantUrl) {
							info.EnhancedVariantUrls.add(enhancedVariantUrl);
						}
					}
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
		while (info.EnhancedVariantUrls.size > 100) {
			const oldest = info.EnhancedVariantUrls.values().next().value;
			if (oldest === undefined) break;
			info.EnhancedVariantUrls.delete(oldest);
		}
		for (const enhancedVariantUrl of info.EnhancedVariantUrls) {
			__TTVAB_STATE__.StreamInfosByUrl[enhancedVariantUrl] = info;
		}

		const avcList = info.ResolutionList.filter((r) =>
			r.Codecs?.startsWith("avc"),
		);
		const hasEnhanced = info.ResolutionList.some((r) =>
			_isEnhancedCodecString(r.Codecs),
		);

		if (hasEnhanced && avcList.length > 0) {
			info.ModifiedM3U8 = _dropEnhancedVariantLines(lines).kept.join("\n");
			const activeCodecHandoffId =
				typeof __TTVAB_STATE__.ActiveCodecHandoffId === "string" &&
				__TTVAB_STATE__.ActiveCodecHandoffId
					? __TTVAB_STATE__.ActiveCodecHandoffId
					: null;
			const activeCodecHandoffCycleStartedAt =
				_getCodecHandoffCycleStartedAt(activeCodecHandoffId);
			const activeCodecHandoffMatches = Boolean(
				activeCodecHandoffId &&
					_normalizeMediaKey(__TTVAB_STATE__.ActiveCodecHandoffMediaKey) ===
						_normalizeMediaKey(info.MediaKey) &&
					_isCodecHandoffCycleCurrent(
						info.MediaKey,
						activeCodecHandoffCycleStartedAt,
						info,
					),
			);
			const activeAdMediaMatches = Boolean(
				_normalizeMediaKey(info.MediaKey) &&
					_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) ===
						_normalizeMediaKey(info.MediaKey),
			);
			if (activeCodecHandoffMatches) {
				info._CodecHandoffPendingId = activeCodecHandoffId;
				info.EnhancedDecoderCodecFamily = null;
				info.EnhancedDecoderCodec = null;
			}
			const hasAcknowledgedCodecHandoff = Boolean(
				info._CodecHandoffPendingId &&
					info._CodecHandoffAcknowledgedId === info._CodecHandoffPendingId &&
					_isCodecHandoffCycleCurrent(
						info.MediaKey,
						_getCodecHandoffCycleStartedAt(info._CodecHandoffPendingId),
						info,
					),
			);
			info.IsUsingModifiedM3U8 =
				activeAdMediaMatches &&
				(activeCodecHandoffMatches || hasAcknowledgedCodecHandoff) &&
				__TTVAB_STATE__.IsAdStrippingEnabled === true;
			_log(
				"HEVC/AV1 stream detected, prepared quality-preserving AVC fallback master",
				"info",
			);
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

			const shouldBlockAdSegments =
				__TTVAB_STATE__.IsAdStrippingEnabled === true;
			const shouldBlockCachedAdSegments = Boolean(
				shouldBlockAdSegments &&
					(__TTVAB_STATE__.CurrentAdMediaKey ||
						__TTVAB_STATE__.CurrentAdChannel ||
						__TTVAB_STATE__.SimulatedAdsDepth > 0),
			);
			if (
				shouldBlockAdSegments &&
				typeof _isEmptyAdHoldSegmentUrl === "function" &&
				_isEmptyAdHoldSegmentUrl(url)
			) {
				let emptyHoldMediaKey = null;
				try {
					emptyHoldMediaKey = _normalizeMediaKey(
						new URL(url).searchParams.get("media"),
					);
				} catch {}
				const emptyHoldInfo =
					(emptyHoldMediaKey &&
						__TTVAB_STATE__.StreamInfos?.[emptyHoldMediaKey]) ||
					null;
				const emptyHoldDecoderFamily = _getVideoCodecFamily(
					emptyHoldInfo?.EnhancedDecoderCodec ||
						emptyHoldInfo?.EnhancedDecoderCodecFamily,
				);
				if (
					emptyHoldDecoderFamily === "hevc" ||
					emptyHoldDecoderFamily === "av1"
				) {
					const emptyHoldRequestSignal =
						opts?.signal ||
						(typeof Request !== "undefined" && resource instanceof Request
							? resource.signal
							: null);
					throw _createCodecHandoffAbortError(emptyHoldRequestSignal);
				}
				return await realFetch(_EMPTY_SEGMENT_URL);
			}
			const segmentOwner = __TTVAB_STATE__.SegmentCodecOwners?.get?.(
				_getExactPlaylistUrlKey(url),
			);
			const segmentMediaKey = _normalizeMediaKey(segmentOwner?.mediaKey);
			const segmentInfo =
				(segmentMediaKey && __TTVAB_STATE__.StreamInfos?.[segmentMediaKey]) ||
				null;
			if (
				shouldBlockAdSegments &&
				typeof _isKnownAdSegmentUrl === "function" &&
				_isKnownAdSegmentUrl(url, {
					includeCached: shouldBlockCachedAdSegments,
				})
			) {
				const segmentDecoderFamily = _getVideoCodecFamily(
					segmentInfo?.EnhancedDecoderCodec ||
						segmentInfo?.EnhancedDecoderCodecFamily,
				);
				if (
					segmentOwner?.codecFamily === "avc" &&
					segmentDecoderFamily !== "hevc" &&
					segmentDecoderFamily !== "av1"
				) {
					const response = await realFetch(_EMPTY_SEGMENT_URL);
					if (response?.ok && segmentInfo?.MediaKey) {
						reportPlaybackWorkerObserved(segmentInfo);
					}
					return response;
				}
				const segmentRequestSignal =
					opts?.signal ||
					(typeof Request !== "undefined" && resource instanceof Request
						? resource.signal
						: null);
				throw _createCodecHandoffAbortError(segmentRequestSignal);
			}

			const playbackContext = _getPlaybackContextFromUsherUrl(url);
			if (playbackContext?.MediaKey) {
				__TTVAB_STATE__.V2API =
					url.includes("/api/v2/") || url.includes("/vod/v2/");
				const logTarget =
					playbackContext.MediaType === "vod"
						? `vod ${playbackContext.VodID}`
						: playbackContext.ChannelName;

				if (
					__TTVAB_STATE__.RewriteNativePlaybackAccessToken === true &&
					__TTVAB_STATE__.ForceAccessTokenPlayerType
				) {
					const urlObj = new URL(url);
					urlObj.searchParams.delete("parent_domains");
					url = urlObj.toString();
				}

				const response = await realFetch.apply(this, getFetchArgs(url));
				if (response.status !== 200) return response;

				const encodings = await response.text();
				const serverTime = _getServerTime(encodings);
				let info = __TTVAB_STATE__.StreamInfos[playbackContext.MediaKey];
				const previousModifiedM3U8 =
					typeof info?.ModifiedM3U8 === "string" && info.ModifiedM3U8
						? info.ModifiedM3U8
						: null;
				try {
					const isNewInfo = !info?.EncodingsM3U8;
					if (isNewInfo) {
						_pruneStreamInfos();
						info = __TTVAB_STATE__.StreamInfos[playbackContext.MediaKey] =
							_createStreamInfo(playbackContext);
					} else {
						info.MediaType = playbackContext.MediaType;
						info.MediaKey = playbackContext.MediaKey;
						info.ChannelName = playbackContext.ChannelName;
						info.VodID = playbackContext.VodID;
					}

					_syncStreamInfo(info, encodings, url);
					info.LastActivityAt = Date.now();

					if (isNewInfo) {
						_log(`Stream initialized: ${logTarget}`, "success");
					}

					const playlist = info.IsUsingModifiedM3U8
						? info.ModifiedM3U8
						: info.EncodingsM3U8;
					reportPlaybackWorkerBootstrapObserved(playbackContext);
					return new Response(
						_replaceServerTime(playlist, serverTime),
						responseInit(response),
					);
				} catch (err) {
					_log(
						`Master playlist processing failed for ${logTarget}: ${
							err?.message ?? String(err)
						}`,
						"error",
					);
					const activeHandoffId = info
						? _getActiveCodecHandoffIdForInfo(info)
						: null;
					if (
						activeHandoffId &&
						__TTVAB_STATE__.IsAdStrippingEnabled === true
					) {
						const filteredMaster =
							previousModifiedM3U8 ||
							_dropEnhancedVariantLines(encodings.split("\n")).kept.join("\n");
						if (
							filteredMaster &&
							filteredMaster !== encodings &&
							filteredMaster.includes("#EXT-X-STREAM-INF")
						) {
							reportPlaybackWorkerBootstrapObserved(playbackContext);
							return new Response(
								_replaceServerTime(filteredMaster, serverTime),
								responseInit(response),
							);
						}
						const masterRequestSignal =
							opts?.signal ||
							(typeof Request !== "undefined" && resource instanceof Request
								? resource.signal
								: null);
						throw _createCodecHandoffAbortError(masterRequestSignal);
					}
					reportPlaybackWorkerBootstrapObserved(playbackContext);
					return new Response(encodings, responseInit(response));
				}
			}

			if (/\.m3u8(?:$|\?)/.test(url)) {
				const requestStartInfo = _getStreamInfoForPlaylist(url);
				const requestStartMediaKey = _normalizeMediaKey(
					requestStartInfo?.MediaKey,
				);
				const requestStartDecoderCodec =
					requestStartInfo?.EnhancedDecoderCodec ||
					requestStartInfo?.EnhancedDecoderCodecFamily;
				const requestStartDecoderCodecFamily = _getVideoCodecFamily(
					requestStartDecoderCodec,
				);
				const requestStartDecoderCodecIdentity = _getVideoCodecIdentity(
					requestStartDecoderCodec,
				);
				const requestStartCodecs =
					_getDirectPlaybackResolutionForUrl(requestStartInfo, url)?.Codecs ||
					_getPlaylistUrlAliases(url)
						.map((alias) => _pageSideVariantCodecByUrl.get(alias))
						.find(Boolean) ||
					null;
				const requestStartCodecFamily =
					_getVideoCodecFamily(requestStartCodecs);
				const requestStartCodecIdentity =
					_getVideoCodecIdentity(requestStartCodecs);
				const requestStartCodecMatchesDecoder = requestStartDecoderCodecIdentity
					? requestStartCodecIdentity === requestStartDecoderCodecIdentity
					: Boolean(
							requestStartDecoderCodecFamily &&
								requestStartCodecFamily === requestStartDecoderCodecFamily,
						);
				const requestStartMayUseCachedAdSegments = Boolean(
					requestStartInfo &&
						requestStartMediaKey &&
						_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) ===
							requestStartMediaKey,
				);
				const requestStartCycleStartedAt = requestStartMayUseCachedAdSegments
					? Math.max(
							0,
							Number(requestStartInfo?.VisibleAdStartedAt) || 0,
							Number(
								__TTVAB_STATE__.AdPodProgressByMediaKey?.[requestStartMediaKey]
									?.cycleStartedAt,
							) || 0,
						)
					: 0;
				const requestStartContext = {
					mediaKey: requestStartMediaKey,
					loaderEpoch: Math.max(
						0,
						Number(requestStartInfo?.NativeRecoveryLoaderEpoch) || 0,
					),
					backupSearchEpoch: Math.max(
						0,
						Number(requestStartInfo?.BackupSearchEpoch) || 0,
					),
					cycleStartedAt: requestStartCycleStartedAt,
					enhancedDecoderCodec: requestStartDecoderCodec || null,
					requestCodec: requestStartCodecs,
					includeCachedAdSegments: requestStartMayUseCachedAdSegments,
				};
				const requestStartHasEnhancedDecoderOwner = Boolean(
					requestStartDecoderCodecFamily === "hevc" ||
						requestStartDecoderCodecFamily === "av1",
				);
				const mediaRequestSignal =
					opts?.signal ||
					(typeof Request !== "undefined" && resource instanceof Request
						? resource.signal
						: null);
				const response = await realFetch.apply(this, getFetchArgs(url));
				if (__TTVAB_STATE__.IsAdStrippingEnabled !== true) {
					return response;
				}
				if (response.status === 200) {
					const text = await response.text();
					const responseInfo =
						requestStartInfo || _getStreamInfoForPlaylist(url);
					const reportSuccessfulMediaResponse = () => {
						const successfulInfo =
							responseInfo || _getStreamInfoForPlaylist(url);
						if (successfulInfo?.MediaKey) {
							const successfulCodecs =
								_getDirectPlaybackResolutionForUrl(successfulInfo, url)
									?.Codecs || requestStartCodecs;
							reportPlaybackWorkerObserved(
								successfulInfo,
								url,
								successfulCodecs,
							);
						}
					};
					const returnNativeMediaResponse = () => {
						reportSuccessfulMediaResponse();
						return new Response(text, responseInit(response));
					};
					if (__TTVAB_STATE__.IsAdStrippingEnabled !== true) {
						return returnNativeMediaResponse();
					}
					const responseMediaKey = _normalizeMediaKey(responseInfo?.MediaKey);
					const responseHasExactActiveAdContext = Boolean(
						responseInfo &&
							responseMediaKey &&
							_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) ===
								responseMediaKey,
					);
					const responseDecoderCodec =
						responseInfo?.EnhancedDecoderCodec ||
						responseInfo?.EnhancedDecoderCodecFamily;
					const responseDecoderCodecFamily =
						_getVideoCodecFamily(responseDecoderCodec);
					const responseDecoderCodecIdentity =
						_getVideoCodecIdentity(responseDecoderCodec);
					const responseHasEnhancedDecoderOwner = Boolean(
						responseDecoderCodecFamily === "hevc" ||
							responseDecoderCodecFamily === "av1",
					);
					const responseCodecMatchesDecoder = responseDecoderCodecIdentity
						? requestStartCodecIdentity === responseDecoderCodecIdentity
						: Boolean(
								responseDecoderCodecFamily &&
									requestStartCodecFamily === responseDecoderCodecFamily,
							);
					const responseOwnerActivatedDuringRequest = Boolean(
						!requestStartHasEnhancedDecoderOwner &&
							responseHasEnhancedDecoderOwner,
					);
					const responseActivatedCodecIsolation = Boolean(
						responseHasExactActiveAdContext &&
							(!requestStartMayUseCachedAdSegments ||
								responseOwnerActivatedDuringRequest) &&
							((requestStartHasEnhancedDecoderOwner &&
								!requestStartCodecMatchesDecoder) ||
								(responseHasEnhancedDecoderOwner &&
									!responseCodecMatchesDecoder)),
					);
					try {
						if (responseActivatedCodecIsolation) {
							const activatedRequestSignal =
								opts?.signal ||
								(typeof Request !== "undefined" && resource instanceof Request
									? resource.signal
									: null);
							throw _createCodecHandoffAbortError(activatedRequestSignal);
						}
						const processedText = await _processM3U8(
							url,
							text,
							realFetch,
							mediaRequestSignal,
							requestStartContext,
						);
						if (__TTVAB_STATE__.IsAdStrippingEnabled !== true) {
							return returnNativeMediaResponse();
						}
						reportSuccessfulMediaResponse();
						return new Response(processedText, responseInit(response));
					} catch (err) {
						if (
							__TTVAB_STATE__.IsAdStrippingEnabled !== true &&
							mediaRequestSignal?.aborted !== true
						) {
							return returnNativeMediaResponse();
						}
						if (err?.name === "AbortError") {
							throw err;
						}
						_log(
							`Media playlist processing failed for ${url}: ${
								err?.message ?? String(err)
							}`,
							"error",
						);
						const failedInfo =
							requestStartInfo || _getStreamInfoForPlaylist(url);
						const failedMediaKey = _normalizeMediaKey(failedInfo?.MediaKey);
						const mayUseCachedAdSegments = Boolean(
							requestStartMayUseCachedAdSegments ||
								(failedInfo &&
									failedMediaKey &&
									_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) ===
										failedMediaKey),
						);
						const requestWasAdMarked =
							_hasPlaylistAdMarkers(text) ||
							_hasExplicitAdMetadata(text) ||
							_playlistHasKnownAdSegments(text, {
								includeCached: mayUseCachedAdSegments,
							});
						const failedDecoderCodec =
							failedInfo?.EnhancedDecoderCodec ||
							failedInfo?.EnhancedDecoderCodecFamily;
						const failedDecoderCodecFamily =
							_getVideoCodecFamily(failedDecoderCodec);
						const failedDecoderCodecIdentity =
							_getVideoCodecIdentity(failedDecoderCodec);
						const failedHasEnhancedDecoderOwner = Boolean(
							failedDecoderCodecFamily === "hevc" ||
								failedDecoderCodecFamily === "av1",
						);
						const failedCodecMatchesDecoder = failedDecoderCodecIdentity
							? requestStartCodecIdentity === failedDecoderCodecIdentity
							: Boolean(
									failedDecoderCodecFamily &&
										requestStartCodecFamily === failedDecoderCodecFamily,
								);
						const failedNeedsCodecIsolation = Boolean(
							mayUseCachedAdSegments &&
								((requestStartHasEnhancedDecoderOwner &&
									!requestStartCodecMatchesDecoder) ||
									(failedHasEnhancedDecoderOwner &&
										!failedCodecMatchesDecoder)),
						);
						if (!requestWasAdMarked) {
							if (failedNeedsCodecIsolation) {
								const failedRequestSignal =
									opts?.signal ||
									(typeof Request !== "undefined" && resource instanceof Request
										? resource.signal
										: null);
								throw _createCodecHandoffAbortError(failedRequestSignal);
							}
							reportSuccessfulMediaResponse();
							return new Response(text, responseInit(response));
						}
						const failedRequestIsEnhanced = Boolean(
							_isEnhancedCodecString(
								_getDirectPlaybackResolutionForUrl(failedInfo, url)?.Codecs,
							) ||
								requestStartDecoderCodecFamily === "hevc" ||
								requestStartDecoderCodecFamily === "av1" ||
								failedDecoderCodecFamily === "hevc" ||
								failedDecoderCodecFamily === "av1" ||
								_getPlaylistUrlAliases(url).some(
									(alias) =>
										failedInfo?.EnhancedVariantUrls?.has(alias) ||
										failedInfo?.EnhancedBackupVariantUrls?.has(alias),
								),
						);
						if (failedRequestIsEnhanced) {
							const failedRequestSignal =
								opts?.signal ||
								(typeof Request !== "undefined" && resource instanceof Request
									? resource.signal
									: null);
							throw _createCodecHandoffAbortError(failedRequestSignal);
						}
						if (!failedInfo) {
							const failedRequestSignal =
								opts?.signal ||
								(typeof Request !== "undefined" && resource instanceof Request
									? resource.signal
									: null);
							throw _createCodecHandoffAbortError(failedRequestSignal);
						}
						const failedRequestCodecFamily =
							requestStartCodecFamily ||
							_getVideoCodecFamily(
								_getDirectPlaybackResolutionForUrl(failedInfo, url)?.Codecs,
							);
						if (failedRequestCodecFamily !== "avc") {
							const failedRequestSignal =
								opts?.signal ||
								(typeof Request !== "undefined" && resource instanceof Request
									? resource.signal
									: null);
							throw _createCodecHandoffAbortError(failedRequestSignal);
						}
						const failClosedPlaylist = _stripAds(text, true, failedInfo);
						reportSuccessfulMediaResponse();
						return new Response(failClosedPlaylist, responseInit(response));
					}
				}
				return response;
			}

			const response = await realFetch.apply(this, args);
			if (response?.ok && segmentInfo?.MediaKey) {
				reportPlaybackWorkerObserved(segmentInfo);
			}
			return response;
		} catch (e) {
			const safeUrl =
				typeof requestUrl === "string" ? requestUrl.trimEnd() : null;
			const isPlaybackRequest = Boolean(
				(safeUrl && _getPlaybackContextFromUsherUrl(safeUrl)?.MediaKey) ||
					(safeUrl && /\.m3u8(?:$|\?)/.test(safeUrl)),
			);
			const errorMessage =
				typeof e?.message === "string" ? e.message : String(e);
			const isExpectedCancellation =
				e?.name === "AbortError" ||
				/request cancel(?:ed|led)|cancel(?:ed|led)/i.test(errorMessage);
			if (isPlaybackRequest && !isExpectedCancellation) {
				_log(
					`Worker fetch wrapper failed for ${safeUrl}: ${errorMessage}`,
					"error",
				);
			}
			throw e;
		}
	};
}

function _syncStoredDeviceId() {
	try {
		const deviceId = localStorage.getItem("unique_id");
		if (
			typeof deviceId === "string" &&
			deviceId &&
			/^[a-f0-9]{8,64}$/i.test(deviceId)
		) {
			__TTVAB_STATE__.GQLDeviceID = deviceId;
			return deviceId;
		}
		if (typeof deviceId === "string" && deviceId) {
			_log("Rejected invalid unique_id format", "debug");
		}
	} catch (e) {
		_log(`Device ID sync error: ${e.message}`, "warning");
	}
	return null;
}

function _readBlobUrlSync(blobUrl) {
	try {
		if (typeof XMLHttpRequest !== "function") return null;
		const xhr = new XMLHttpRequest();
		xhr.open("GET", blobUrl, false);
		xhr.send(null);
		return typeof xhr.responseText === "string" && xhr.responseText
			? xhr.responseText
			: null;
	} catch (e) {
		_log(`Could not inline worker source: ${e.message || e}`, "warning");
		return null;
	}
}

function _hookRevokeObjectURL() {
	if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
		const originalRevoke = URL.revokeObjectURL;
		URL.revokeObjectURL = function (url) {
			if (
				typeof url === "string" &&
				url.startsWith("blob:") &&
				_trackedExtensionBlobUrls.has(url)
			) {
				_trackedExtensionBlobUrls.delete(url);
				setTimeout(() => {
					try {
						originalRevoke.call(this, url);
					} catch {}
				}, 3500);
			} else {
				originalRevoke.call(this, url);
			}
		};
	}
}

const HW_MAX_RESTART = 3;
const HW_WATCHDOG_INTERVAL_MS = 5000;
const HW_PONG_TIMEOUT_MS = 15000;
const HW_INITIAL_PONG_TIMEOUT_MS = 15000;
const HW_MAX_MISSED_PONGS = 2;
const HW_MAX_MISSED_PONGS_HIDDEN = 6;
const HW_HIDDEN_STALE_MIN_MS = 90000;
const HW_RECOVERY_COOLDOWN_MS = 30000;
const HW_RECOVERY_STABLE_MS = 60000;
let _workerGeneration = 0;
let _workerRecoveryEpoch = 0;
const _WorkerRecoveryStates = new Map();
const _WorkerPlaybackOwnerGenerationByContext = new Map();

function _isWorkerLifecycleThrottled() {
	if (typeof _isPlaybackPageUnfocused === "function") {
		return _isPlaybackPageUnfocused() === true;
	}
	return Boolean(
		typeof _isNativeDocumentHidden === "function" &&
			_isNativeDocumentHidden() === true,
	);
}

function _getWorkerRecoveryContextKey(context) {
	const normalizedContext = _normalizePlaybackContext(context);
	if (normalizedContext.MediaKey) return normalizedContext.MediaKey;
	if (normalizedContext.ChannelName) {
		return `channel:${normalizedContext.ChannelName}`;
	}
	return "unknown";
}

function _rememberWorkerPageContext(worker, context) {
	if (!worker) return _normalizePlaybackContext(context);
	const normalizedContext = _normalizePlaybackContext(context);
	const previousMediaKey = _normalizeMediaKey(worker.__TTVABPageMediaKey);
	if (
		previousMediaKey &&
		previousMediaKey !== _normalizeMediaKey(normalizedContext.MediaKey)
	) {
		worker.__TTVABPlaybackObservedAtByMediaKey?.delete?.(previousMediaKey);
		worker.__TTVABPlaybackBootstrapObservedAtByMediaKey?.delete?.(
			previousMediaKey,
		);
	}
	worker.__TTVABPageMediaType = normalizedContext.MediaType || null;
	worker.__TTVABPageChannel = normalizedContext.ChannelName || null;
	worker.__TTVABPageVodID = normalizedContext.VodID || null;
	worker.__TTVABPageMediaKey = normalizedContext.MediaKey || null;
	return normalizedContext;
}

function _getWorkerPlaybackContext(worker, fallbackContext = null) {
	return _normalizePlaybackContext({
		MediaType:
			worker?.__TTVABPageMediaType ||
			fallbackContext?.MediaType ||
			__TTVAB_STATE__?.PageMediaType ||
			null,
		ChannelName:
			worker?.__TTVABPageChannel ||
			fallbackContext?.ChannelName ||
			__TTVAB_STATE__?.PageChannel ||
			null,
		VodID:
			worker?.__TTVABPageVodID ||
			fallbackContext?.VodID ||
			__TTVAB_STATE__?.PageVodID ||
			null,
		MediaKey:
			worker?.__TTVABPageMediaKey ||
			fallbackContext?.MediaKey ||
			__TTVAB_STATE__?.PageMediaKey ||
			null,
	});
}

function _getWorkerRecoveryState(context, create = true) {
	const contextKey = _getWorkerRecoveryContextKey(context);
	let state = _WorkerRecoveryStates.get(contextKey) || null;
	if (!state && create) {
		state = {
			contextKey,
			context: _normalizePlaybackContext(context),
			attempts: 0,
			lastAttemptAt: 0,
			limitLogged: false,
			activeEpoch: 0,
			failedGeneration: 0,
			crashedAt: 0,
			bootstrapDeadlineAt: 0,
			pipWaitDeadlineAt: 0,
			retiredThroughGeneration: 0,
			expectedAfterGeneration: 0,
			reloadDispatchedAt: 0,
			lastReloadAt: 0,
			successorDeadlineAt: 0,
			stableGeneration: 0,
			stableSince: 0,
			terminalRearmCycleStartedAt: 0,
			terminalRearmAttemptedAt: 0,
			hiddenLastMediaTime: -1,
			timerID: null,
			phase: "idle",
		};
		_WorkerRecoveryStates.set(contextKey, state);
		while (_WorkerRecoveryStates.size > 32) {
			const removable = Array.from(_WorkerRecoveryStates.entries()).find(
				([key, entry]) => key !== contextKey && !entry?.activeEpoch,
			);
			if (!removable) break;
			_WorkerRecoveryStates.delete(removable[0]);
		}
	}
	return state;
}

function _recordWorkerRecoveryAttempt(context, now = Date.now()) {
	const state = _getWorkerRecoveryState(context);
	if (!state || state.attempts >= HW_MAX_RESTART) return false;
	state.attempts++;
	state.lastAttemptAt = now;
	state.limitLogged = false;
	return true;
}

function _resetWorkerRecoveryStateIfStable(worker, context, now = Date.now()) {
	const state = _getWorkerRecoveryState(context, false);
	if (!state) return;
	const workerGeneration = Math.max(0, Number(worker?.__TTVABGeneration) || 0);
	const observationAt = _getWorkerPlaybackObservationAt(worker, context);
	const observationFreshnessMs = _isWorkerLifecycleThrottled()
		? HW_HIDDEN_STALE_MIN_MS
		: HW_PONG_TIMEOUT_MS;
	if (
		state.attempts <= 0 ||
		state.phase !== "stabilizing" ||
		state.stableGeneration !== workerGeneration ||
		state.stableSince <= 0 ||
		now - state.stableSince < HW_RECOVERY_STABLE_MS ||
		!_isWorkerHeartbeatHealthy(worker, now) ||
		observationAt < state.stableSince ||
		now - observationAt > observationFreshnessMs
	) {
		return;
	}
	state.attempts = 0;
	state.lastAttemptAt = 0;
	state.lastReloadAt = 0;
	state.limitLogged = false;
	state.stableGeneration = 0;
	state.stableSince = 0;
	state.terminalRearmCycleStartedAt = 0;
	state.terminalRearmAttemptedAt = 0;
	state.phase = "idle";
}

function _getWorkerPlaybackObservationAt(worker, context) {
	const mediaKey = _normalizeMediaKey(
		_normalizePlaybackContext(context).MediaKey,
	);
	if (!mediaKey) return 0;
	return Math.max(
		0,
		Number(worker?.__TTVABPlaybackObservedAtByMediaKey?.get?.(mediaKey)) || 0,
	);
}

function _isWorkerHeartbeatHealthy(worker, now = Date.now()) {
	if (
		!worker ||
		worker.__TTVABCrashed ||
		worker.__TTVABIntentionallyTerminated
	) {
		return false;
	}
	const firstPongAt = Math.max(0, Number(worker.__TTVABFirstPongAt) || 0);
	const lastPongAt = Math.max(0, Number(worker.__TTVABLastPongAt) || 0);
	const heartbeatTimeoutMs = _isWorkerLifecycleThrottled()
		? HW_HIDDEN_STALE_MIN_MS
		: HW_PONG_TIMEOUT_MS;
	return (
		firstPongAt > 0 && lastPongAt > 0 && now - lastPongAt <= heartbeatTimeoutMs
	);
}

function _promoteWorkerPlaybackOwner(
	worker,
	now = Date.now(),
	playbackContext = null,
) {
	if (!_isWorkerHeartbeatHealthy(worker, now)) return false;
	const generation = Math.max(0, Number(worker.__TTVABGeneration) || 0);
	if (generation <= 0) return false;
	const context = _normalizePlaybackContext(
		playbackContext || _getWorkerPlaybackContext(worker),
	);
	const mediaKey = _normalizeMediaKey(context.MediaKey);
	if (!mediaKey || _getWorkerPlaybackObservationAt(worker, context) <= 0) {
		return false;
	}
	const contextKey = _getWorkerRecoveryContextKey(context);
	const currentGeneration = Math.max(
		0,
		Number(_WorkerPlaybackOwnerGenerationByContext.get(contextKey)) || 0,
	);
	const didPromote = generation >= currentGeneration;
	if (didPromote) {
		_WorkerPlaybackOwnerGenerationByContext.delete(contextKey);
		_WorkerPlaybackOwnerGenerationByContext.set(contextKey, generation);
	}
	while (_WorkerPlaybackOwnerGenerationByContext.size > 32) {
		const oldestContextKey = _WorkerPlaybackOwnerGenerationByContext
			.keys()
			.next().value;
		if (oldestContextKey === undefined || oldestContextKey === contextKey)
			break;
		_WorkerPlaybackOwnerGenerationByContext.delete(oldestContextKey);
	}
	return didPromote;
}

function _beginExhaustedWorkerRecoveryStabilization(
	worker,
	context,
	now = Date.now(),
) {
	const recoveryState = _getWorkerRecoveryState(context, false);
	const priorPhase = recoveryState?.phase || null;
	if (
		priorPhase !== "exhausted" &&
		priorPhase !== "cancelled" &&
		priorPhase !== "degraded-pip"
	) {
		return false;
	}
	const workerContext = _getWorkerPlaybackContext(worker);
	if (_isPlaybackContextMismatch(workerContext, context)) return false;
	const workerGeneration = Math.max(0, Number(worker?.__TTVABGeneration) || 0);
	const observationAt = _getWorkerPlaybackObservationAt(worker, context);
	const playbackOwnerGeneration = Math.max(
		0,
		Number(
			_WorkerPlaybackOwnerGenerationByContext.get(
				_getWorkerRecoveryContextKey(context),
			),
		) || 0,
	);
	if (
		workerGeneration <=
			Math.max(0, Number(recoveryState.failedGeneration) || 0) ||
		observationAt <= Math.max(0, Number(recoveryState.crashedAt) || 0) ||
		workerGeneration < playbackOwnerGeneration ||
		!_isWorkerHeartbeatHealthy(worker, now)
	) {
		return false;
	}
	recoveryState.retiredThroughGeneration = Math.max(
		0,
		Number(recoveryState.retiredThroughGeneration) || 0,
		Number(recoveryState.failedGeneration) || 0,
	);
	recoveryState.stableGeneration = workerGeneration;
	recoveryState.stableSince = now;
	recoveryState.activeEpoch = 0;
	recoveryState.phase = "stabilizing";
	_promoteWorkerPlaybackOwner(worker, now, context);
	_log(
		priorPhase === "exhausted"
			? "Healthy playback worker appeared after recovery retries were exhausted"
			: "Healthy playback worker appeared after deferred recovery ended",
		"success",
	);
	return true;
}

function _markWorkerPong(worker, now = Date.now()) {
	if (
		!worker ||
		worker.__TTVABIntentionallyTerminated ||
		worker.__TTVABCrashed
	) {
		return;
	}
	worker.__TTVABLastPongAt = now;
	if (!worker.__TTVABFirstPongAt) worker.__TTVABFirstPongAt = now;
	worker.__TTVABMissedPongs = 0;
	const workerContext = _getWorkerPlaybackContext(worker);
	if (
		_promoteWorkerPlaybackOwner(worker, now) &&
		_getWorkerPlaybackObservationAt(worker, workerContext) > 0
	) {
		_beginExhaustedWorkerRecoveryStabilization(worker, workerContext, now);
		_resetWorkerRecoveryStateIfStable(worker, workerContext, now);
	}
}

const pruneTrackedWorkers = (excludedWorkers = []) => {
	const excluded = new Set(excludedWorkers.filter(Boolean));
	const aliveWorkers = [];
	const seenWorkers = new Set();

	for (const worker of _S.workers) {
		if (!worker || excluded.has(worker) || seenWorkers.has(worker)) {
			continue;
		}
		if (worker.__TTVABIntentionallyTerminated || worker.__TTVABCrashed) {
			continue;
		}
		aliveWorkers.push(worker);
		seenWorkers.add(worker);
	}

	_S.workers = aliveWorkers;
};

function _isPlaybackContextMismatch(expectedContext, currentContext) {
	const normalizedExpectedContext = _normalizePlaybackContext(expectedContext);
	const normalizedCurrentContext = _normalizePlaybackContext(currentContext);
	if (normalizedExpectedContext.MediaKey) {
		return (
			normalizedCurrentContext.MediaKey !== normalizedExpectedContext.MediaKey
		);
	}
	if (normalizedExpectedContext.ChannelName) {
		return (
			normalizedCurrentContext.ChannelName !==
			normalizedExpectedContext.ChannelName
		);
	}
	return false;
}

function _getHighestWorkerGenerationForPlaybackContext(playbackContext) {
	const contextKey = _getWorkerRecoveryContextKey(playbackContext);
	let highestGeneration = 0;
	for (const candidate of _S.workers) {
		if (
			!candidate ||
			_getWorkerRecoveryContextKey(_getWorkerPlaybackContext(candidate)) !==
				contextKey
		) {
			continue;
		}
		highestGeneration = Math.max(
			highestGeneration,
			0,
			Number(candidate.__TTVABGeneration) || 0,
		);
	}
	return highestGeneration;
}

function _getQualifiedReplacementWorker(
	worker,
	playbackContext,
	boundaryAt,
	minimumGeneration,
	now = Date.now(),
	requireCreatedAfterBoundary = true,
) {
	const contextKey = _getWorkerRecoveryContextKey(playbackContext);
	const normalizedBoundaryAt = Math.max(0, Number(boundaryAt) || 0);
	const normalizedMinimumGeneration = Math.max(
		0,
		Number(minimumGeneration) || 0,
	);
	let replacement = null;
	let replacementGeneration = 0;
	for (const candidate of _S.workers) {
		if (
			!candidate ||
			candidate === worker ||
			_getWorkerRecoveryContextKey(_getWorkerPlaybackContext(candidate)) !==
				contextKey ||
			!_isWorkerHeartbeatHealthy(candidate, now)
		) {
			continue;
		}
		const candidateGeneration = Math.max(
			0,
			Number(candidate.__TTVABGeneration) || 0,
		);
		const candidateCreatedAt = Math.max(
			0,
			Number(candidate.__TTVABCreatedAt) || 0,
		);
		const observedAt = _getWorkerPlaybackObservationAt(
			candidate,
			playbackContext,
		);
		if (
			candidateGeneration <= normalizedMinimumGeneration ||
			candidateCreatedAt <= 0 ||
			(requireCreatedAfterBoundary &&
				candidateCreatedAt < normalizedBoundaryAt) ||
			observedAt <= 0 ||
			observedAt < normalizedBoundaryAt ||
			candidateGeneration <= replacementGeneration
		) {
			continue;
		}
		replacement = candidate;
		replacementGeneration = candidateGeneration;
	}
	return replacement;
}

function _hasStartingReplacementWorker(
	worker,
	playbackContext,
	minimumGeneration,
	bootstrapDeadlineAt,
	now = Date.now(),
) {
	const contextKey = _getWorkerRecoveryContextKey(playbackContext);
	const normalizedMinimumGeneration = Math.max(
		0,
		Number(minimumGeneration) || 0,
	);
	const normalizedBootstrapDeadlineAt = Math.max(
		0,
		Number(bootstrapDeadlineAt) || 0,
	);
	if (
		normalizedBootstrapDeadlineAt <= 0 ||
		now >= normalizedBootstrapDeadlineAt
	) {
		return false;
	}
	return _S.workers.some((candidate) => {
		if (
			!candidate ||
			candidate === worker ||
			candidate.__TTVABCrashed ||
			candidate.__TTVABIntentionallyTerminated ||
			_getWorkerRecoveryContextKey(_getWorkerPlaybackContext(candidate)) !==
				contextKey
		) {
			return false;
		}
		const candidateGeneration = Math.max(
			0,
			Number(candidate.__TTVABGeneration) || 0,
		);
		return candidateGeneration > normalizedMinimumGeneration;
	});
}

function _getHealthyObservedPlaybackWorker(
	playbackContext,
	excludedWorker = null,
	now = Date.now(),
	observedAfter = 0,
	requireFreshObservation = true,
) {
	const contextKey = _getWorkerRecoveryContextKey(playbackContext);
	const minimumObservedAt = Math.max(0, Number(observedAfter) || 0);
	const observationFreshnessMs = _isWorkerLifecycleThrottled()
		? HW_HIDDEN_STALE_MIN_MS
		: HW_PONG_TIMEOUT_MS;
	let playbackOwner = null;
	let playbackOwnerGeneration = 0;
	for (const candidate of _S.workers) {
		if (
			!candidate ||
			candidate === excludedWorker ||
			_getWorkerRecoveryContextKey(_getWorkerPlaybackContext(candidate)) !==
				contextKey ||
			!_isWorkerHeartbeatHealthy(candidate, now)
		) {
			continue;
		}
		const observedAt = _getWorkerPlaybackObservationAt(
			candidate,
			playbackContext,
		);
		const candidateGeneration = Math.max(
			0,
			Number(candidate.__TTVABGeneration) || 0,
		);
		if (
			observedAt <= 0 ||
			observedAt < minimumObservedAt ||
			(requireFreshObservation && now - observedAt > observationFreshnessMs) ||
			candidateGeneration <= playbackOwnerGeneration
		) {
			continue;
		}
		playbackOwner = candidate;
		playbackOwnerGeneration = candidateGeneration;
	}
	return playbackOwner;
}

function _handleMediaBootstrapRecoveryRequest(
	worker,
	data,
	pagePlaybackContext,
	currentPageContext,
) {
	const recoveryContext = _normalizePlaybackContext({
		MediaType: data?.mediaType,
		ChannelName: data?.channel,
		VodID: data?.vodID,
		MediaKey: data?.mediaKey,
	});
	const cycleStartedAt = Math.max(0, Number(data?.cycleStartedAt) || 0);
	const workerContext = _getWorkerPlaybackContext(worker, pagePlaybackContext);
	const contextIsCurrent = !_isPlaybackContextMismatch(
		recoveryContext,
		currentPageContext,
	);
	const contextIsPip = Boolean(
		typeof _isActivePictureInPicturePlaybackContext === "function" &&
			_isActivePictureInPicturePlaybackContext(recoveryContext),
	);
	if (
		!recoveryContext.MediaKey ||
		cycleStartedAt <= 0 ||
		_isPlaybackContextMismatch(workerContext, recoveryContext) ||
		(!contextIsCurrent && !contextIsPip) ||
		_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) !==
			recoveryContext.MediaKey ||
		Math.max(
			0,
			Number(
				__TTVAB_STATE__?.AdPodProgressByMediaKey?.[recoveryContext.MediaKey]
					?.cycleStartedAt,
			) || 0,
		) !== cycleStartedAt
	) {
		return false;
	}
	return _recoverCrashedWorker(
		worker,
		recoveryContext,
		"Playback worker received media before stream bootstrap",
		"warning",
	);
}

function _canHandleCrashedWorkerMessage(
	data,
	worker,
	pagePlaybackContext,
	currentPageContext,
) {
	const key = typeof data?.key === "string" ? data.key : null;
	if (!key || !_CRASHED_WORKER_RECOVERY_MESSAGE_KEYS.has(key)) return false;
	const workerContext = _getWorkerPlaybackContext(worker, pagePlaybackContext);
	const contextIsCurrent =
		!_isPlaybackContextMismatch(workerContext, currentPageContext) ||
		(typeof _isActivePictureInPicturePlaybackContext === "function" &&
			_isActivePictureInPicturePlaybackContext(workerContext));
	if (!contextIsCurrent) return false;
	const contextKey = _getWorkerRecoveryContextKey(workerContext);
	const recoveryState = _getWorkerRecoveryState(workerContext, false);
	const explicitlyRetiredThroughGeneration = Math.max(
		0,
		Number(recoveryState?.retiredThroughGeneration) || 0,
	);
	const playbackOwnerGeneration = Math.max(
		0,
		Number(_WorkerPlaybackOwnerGenerationByContext.get(contextKey)) || 0,
	);
	const workerGeneration = Math.max(0, Number(worker?.__TTVABGeneration) || 0);
	if (key === "AdDetected" || key === "AdPodProgress") {
		return Boolean(
			recoveryState?.activeEpoch > 0 &&
				workerGeneration > explicitlyRetiredThroughGeneration &&
				workerGeneration === recoveryState.failedGeneration,
		);
	}
	return Boolean(
		(explicitlyRetiredThroughGeneration <= 0 ||
			workerGeneration > explicitlyRetiredThroughGeneration) &&
			(playbackOwnerGeneration <= 0 ||
				workerGeneration >= playbackOwnerGeneration),
	);
}

function _isWorkerGenerationRetired(worker, pagePlaybackContext = null) {
	const workerGeneration = Math.max(0, Number(worker?.__TTVABGeneration) || 0);
	if (workerGeneration <= 0) return false;
	const workerContext = _getWorkerPlaybackContext(worker, pagePlaybackContext);
	const playbackOwnerGeneration = Math.max(
		0,
		Number(
			_WorkerPlaybackOwnerGenerationByContext.get(
				_getWorkerRecoveryContextKey(workerContext),
			),
		) || 0,
	);
	return playbackOwnerGeneration > workerGeneration;
}

function _scheduleTerminatedPlaybackWorkerRecovery(
	worker,
	pagePlaybackContext,
) {
	if (
		!worker ||
		worker.__TTVABCrashed ||
		Math.max(0, Number(worker.__TTVABTerminatedAt) || 0) > 0 ||
		worker.__TTVABTerminationRecoveryTimer != null
	) {
		return false;
	}
	const recoveryContext = _getWorkerPlaybackContext(
		worker,
		pagePlaybackContext,
	);
	const terminatedWorkerObservedPlayback =
		_getWorkerPlaybackObservationAt(worker, recoveryContext) > 0;
	const terminatedWorkerObservedBootstrap =
		Math.max(
			0,
			Number(
				worker?.__TTVABPlaybackBootstrapObservedAtByMediaKey?.get?.(
					recoveryContext.MediaKey,
				),
			) || 0,
		) > 0;
	if (!recoveryContext.MediaKey) return false;
	const currentContext = _getPlaybackContextFromUrl(window.location.href);
	const contextIsCurrent = !_isPlaybackContextMismatch(
		recoveryContext,
		currentContext,
	);
	const contextIsPip = Boolean(
		typeof _isActivePictureInPicturePlaybackContext === "function" &&
			_isActivePictureInPicturePlaybackContext(recoveryContext),
	);
	if (!contextIsCurrent && !contextIsPip) return false;
	const now = Date.now();
	const terminatedGeneration = Math.max(
		0,
		Number(worker.__TTVABGeneration) || 0,
	);
	const healthyPlaybackOwner = _getHealthyObservedPlaybackWorker(
		recoveryContext,
		worker,
		now,
		terminatedWorkerObservedPlayback
			? Math.max(0, Number(worker.__TTVABCreatedAt) || 0)
			: 0,
		terminatedWorkerObservedPlayback,
	);
	if (healthyPlaybackOwner) {
		const healthyOwnerGeneration = Math.max(
			0,
			Number(healthyPlaybackOwner.__TTVABGeneration) || 0,
		);
		if (
			(!terminatedWorkerObservedPlayback ||
				healthyOwnerGeneration > terminatedGeneration) &&
			_promoteWorkerPlaybackOwner(healthyPlaybackOwner, now, recoveryContext)
		) {
			return false;
		}
	}
	if (!terminatedWorkerObservedPlayback && !terminatedWorkerObservedBootstrap) {
		let pageFallbackInstalled = false;
		if (contextIsCurrent) {
			_installPageSideM3U8Override();
			pageFallbackInstalled = true;
		}
		const terminatedAt = now;
		let startupDeadlineAt = terminatedAt + HW_HIDDEN_STALE_MIN_MS * 2;
		let hasPlaybackSample = false;
		let lastMedia = null;
		let lastMediaTime = -1;
		let stalledSince = 0;
		let mediaTimeByElement = new WeakMap();
		worker.__TTVABTerminatedAt = terminatedAt;
		const scheduleMonitor = (callback, delayMs) => {
			const timerID = setTimeout(() => {
				if (worker.__TTVABTerminationRecoveryTimer !== timerID) return;
				worker.__TTVABTerminationRecoveryTimer = null;
				callback();
			}, delayMs);
			worker.__TTVABTerminationRecoveryTimer = timerID;
		};
		const monitorUnobservedTermination = () => {
			const checkedAt = Date.now();
			const latestContext = _getPlaybackContextFromUrl(window.location.href);
			const contextStillCurrent = !_isPlaybackContextMismatch(
				recoveryContext,
				latestContext,
			);
			const contextStillPip = Boolean(
				typeof _isActivePictureInPicturePlaybackContext === "function" &&
					_isActivePictureInPicturePlaybackContext(recoveryContext),
			);
			if (!contextStillCurrent && !contextStillPip) return;
			if (contextStillCurrent && !pageFallbackInstalled) {
				_installPageSideM3U8Override();
				pageFallbackInstalled = true;
			}
			const replacement = _getHealthyObservedPlaybackWorker(
				recoveryContext,
				worker,
				checkedAt,
				terminatedAt,
				true,
			);
			if (
				Math.max(0, Number(replacement?.__TTVABGeneration) || 0) >
					terminatedGeneration &&
				_promoteWorkerPlaybackOwner(replacement, checkedAt, recoveryContext)
			) {
				_log(
					"Playback worker replacement confirmed after early termination",
					"info",
				);
				return;
			}
			const hasUserPauseIntent = Boolean(
				typeof _hasUserPauseIntent === "function" &&
					_hasUserPauseIntent(
						recoveryContext.ChannelName,
						recoveryContext.MediaKey,
					),
			);
			if (hasUserPauseIntent) {
				startupDeadlineAt = Math.max(
					startupDeadlineAt,
					checkedAt + HW_HIDDEN_STALE_MIN_MS,
				);
				hasPlaybackSample = false;
				lastMedia = null;
				lastMediaTime = -1;
				stalledSince = 0;
				mediaTimeByElement = new WeakMap();
				scheduleMonitor(monitorUnobservedTermination, HW_WATCHDOG_INTERVAL_MS);
				return;
			}
			const activePipContext = contextStillPip
				? typeof _getActivePictureInPicturePlaybackContext === "function"
					? _getActivePictureInPicturePlaybackContext()
					: null
				: null;
			const media =
				activePipContext?.element instanceof HTMLMediaElement
					? activePipContext.element
					: typeof _getPrimaryMediaElement === "function"
						? _getPrimaryMediaElement()
						: null;
			const mediaTime =
				media instanceof HTMLMediaElement ? Number(media.currentTime) || 0 : -1;
			if (
				media instanceof HTMLMediaElement &&
				media.ended &&
				recoveryContext.MediaType === "vod"
			) {
				return;
			}
			const playbackExpected = Boolean(
				(contextStillCurrent &&
					(__TTVAB_STATE__?.PlayerIsPlaying === true ||
						__TTVAB_STATE__?.PlayerHasPlayedOnce === true)) ||
					(media instanceof HTMLMediaElement &&
						(media.paused === false ||
							mediaTime > 0 ||
							(media.ended && recoveryContext.MediaType !== "vod"))),
			);
			if (!playbackExpected) {
				hasPlaybackSample = false;
				lastMedia = null;
				lastMediaTime = -1;
				stalledSince = 0;
				mediaTimeByElement = new WeakMap();
				if (checkedAt >= startupDeadlineAt) {
					_recoverCrashedWorker(
						worker,
						recoveryContext,
						"Playback worker terminated before playback initialized",
						"warning",
						true,
					);
					return;
				}
				scheduleMonitor(monitorUnobservedTermination, HW_WATCHDOG_INTERVAL_MS);
				return;
			}
			const previousMediaTime =
				media instanceof HTMLMediaElement
					? mediaTimeByElement.get(media)
					: media === lastMedia
						? lastMediaTime
						: null;
			if (media instanceof HTMLMediaElement) {
				mediaTimeByElement.set(media, mediaTime);
			}
			if (!hasPlaybackSample) {
				hasPlaybackSample = true;
				lastMedia = media;
				lastMediaTime = mediaTime;
				stalledSince = checkedAt;
				scheduleMonitor(monitorUnobservedTermination, HW_WATCHDOG_INTERVAL_MS);
				return;
			}
			lastMedia = media;
			lastMediaTime = mediaTime;
			if (
				typeof previousMediaTime === "number" &&
				mediaTime > previousMediaTime + 0.2
			) {
				stalledSince = checkedAt;
				if (checkedAt >= startupDeadlineAt) {
					_log(
						"Playback remained healthy after an auxiliary worker terminated",
						"info",
					);
					return;
				}
				scheduleMonitor(monitorUnobservedTermination, HW_WATCHDOG_INTERVAL_MS);
				return;
			}
			const requiredStallMs = _isWorkerLifecycleThrottled()
				? HW_HIDDEN_STALE_MIN_MS
				: HW_INITIAL_PONG_TIMEOUT_MS;
			if (stalledSince <= 0 || checkedAt - stalledSince < requiredStallMs) {
				scheduleMonitor(monitorUnobservedTermination, HW_WATCHDOG_INTERVAL_MS);
				return;
			}
			_recoverCrashedWorker(
				worker,
				recoveryContext,
				"Playback stopped after its worker terminated before initialization",
				"warning",
				true,
			);
		};
		scheduleMonitor(monitorUnobservedTermination, HW_WATCHDOG_INTERVAL_MS);
		return true;
	}
	const terminatedAt = now;
	worker.__TTVABTerminatedAt = terminatedAt;
	if (contextIsCurrent) {
		_installPageSideM3U8Override();
	}
	const timerID = setTimeout(() => {
		if (worker.__TTVABTerminationRecoveryTimer === timerID) {
			worker.__TTVABTerminationRecoveryTimer = null;
		}
		const latestContext = _getPlaybackContextFromUrl(window.location.href);
		const contextStillCurrent = !_isPlaybackContextMismatch(
			recoveryContext,
			latestContext,
		);
		const contextStillPip = Boolean(
			typeof _isActivePictureInPicturePlaybackContext === "function" &&
				_isActivePictureInPicturePlaybackContext(recoveryContext),
		);
		if (!contextStillCurrent && !contextStillPip) return;
		const replacement = _getQualifiedReplacementWorker(
			worker,
			recoveryContext,
			terminatedAt,
			terminatedGeneration,
			Date.now(),
			false,
		);
		if (
			replacement &&
			_promoteWorkerPlaybackOwner(replacement, Date.now(), recoveryContext)
		) {
			_log("Playback worker replacement confirmed after termination", "info");
			return;
		}
		_recoverCrashedWorker(
			worker,
			recoveryContext,
			"Playback worker terminated without a healthy replacement",
			"warning",
			true,
		);
	}, HW_INITIAL_PONG_TIMEOUT_MS);
	worker.__TTVABTerminationRecoveryTimer = timerID;
	return true;
}

function _recoverCrashedWorker(
	worker,
	pagePlaybackContext,
	message,
	level = "warning",
	allowIntentionalTermination = false,
) {
	if (
		!worker ||
		(worker.__TTVABIntentionallyTerminated && !allowIntentionalTermination) ||
		worker.__TTVABCrashed
	) {
		return false;
	}
	const recoveryContext = _getWorkerPlaybackContext(
		worker,
		pagePlaybackContext,
	);
	const currentContext = _getPlaybackContextFromUrl(window.location.href);
	const recoveryContextIsCurrent = !_isPlaybackContextMismatch(
		recoveryContext,
		currentContext,
	);
	const crashedWorkerObservedPlayback =
		_getWorkerPlaybackObservationAt(worker, recoveryContext) > 0;
	const crashedWorkerObservedBootstrap =
		Math.max(
			0,
			Number(
				worker?.__TTVABPlaybackBootstrapObservedAtByMediaKey?.get?.(
					recoveryContext.MediaKey,
				),
			) || 0,
		) > 0;
	const crashedWorkerMayOwnPlayback = Boolean(
		crashedWorkerObservedPlayback || crashedWorkerObservedBootstrap,
	);
	const healthyPlaybackOwner = _getHealthyObservedPlaybackWorker(
		recoveryContext,
		worker,
		Date.now(),
		crashedWorkerMayOwnPlayback
			? Math.max(0, Number(worker.__TTVABCreatedAt) || 0)
			: 0,
		crashedWorkerMayOwnPlayback,
	);
	const crashedWorkerGeneration = Math.max(
		0,
		Number(worker.__TTVABGeneration) || 0,
	);
	const healthyOwnerGeneration = Math.max(
		0,
		Number(healthyPlaybackOwner?.__TTVABGeneration) || 0,
	);
	const crashedAt = Date.now();
	worker.__TTVABCrashed = true;
	worker.__TTVABCrashedAt = crashedAt;
	_reassignPageAdCycleControlAfterWorkerRetirement(
		recoveryContext.MediaKey,
		crashedWorkerGeneration,
		worker,
		crashedAt,
	);
	_log(message, level);
	pruneTrackedWorkers([worker]);
	if (!recoveryContext.MediaKey) {
		_installPageSideM3U8Override();
		_log(
			"Skipping worker recovery reload without an exact playback context",
			"warning",
		);
		return true;
	}
	if (
		healthyPlaybackOwner &&
		(!crashedWorkerMayOwnPlayback ||
			healthyOwnerGeneration > crashedWorkerGeneration) &&
		_promoteWorkerPlaybackOwner(
			healthyPlaybackOwner,
			crashedAt,
			recoveryContext,
		)
	) {
		_log(
			"Ignoring non-playback worker crash while the playback worker is healthy",
			"info",
		);
		return true;
	}
	const recoveryState = _getWorkerRecoveryState(recoveryContext);
	if (recoveryState.timerID !== null) {
		clearTimeout(recoveryState.timerID);
		recoveryState.timerID = null;
	}
	recoveryState.context = recoveryContext;
	recoveryState.activeEpoch = ++_workerRecoveryEpoch;
	recoveryState.failedGeneration = Math.max(
		0,
		Number(recoveryState.failedGeneration) || 0,
		Number(worker.__TTVABGeneration) || 0,
	);
	recoveryState.crashedAt = crashedAt;
	recoveryState.bootstrapDeadlineAt = crashedAt + HW_INITIAL_PONG_TIMEOUT_MS;
	recoveryState.pipWaitDeadlineAt = crashedAt + HW_HIDDEN_STALE_MIN_MS;
	recoveryState.expectedAfterGeneration = recoveryState.failedGeneration;
	recoveryState.reloadDispatchedAt = 0;
	recoveryState.successorDeadlineAt = 0;
	recoveryState.hiddenLastMediaTime = -1;
	recoveryState.phase = "scheduled";
	worker.__TTVABRecoveryEpoch = recoveryState.activeEpoch;
	if (recoveryContextIsCurrent) {
		_installPageSideM3U8Override();
	}
	_attemptWorkerRestart(worker, recoveryContext);
	return true;
}

function _attemptWorkerRestart(worker, pagePlaybackContext) {
	if (
		!worker ||
		(worker.__TTVABIntentionallyTerminated && !worker.__TTVABCrashed)
	) {
		return;
	}
	const recoveryContext = _getWorkerPlaybackContext(
		worker,
		pagePlaybackContext,
	);
	const recoveryState = _getWorkerRecoveryState(recoveryContext);
	if (!worker.__TTVABRecoveryEpoch) {
		recoveryState.activeEpoch = ++_workerRecoveryEpoch;
		recoveryState.failedGeneration = Math.max(
			0,
			Number(recoveryState.failedGeneration) || 0,
			Number(worker.__TTVABGeneration) || 0,
		);
		recoveryState.crashedAt =
			Math.max(0, Number(worker.__TTVABCrashedAt) || 0) || Date.now();
		recoveryState.bootstrapDeadlineAt =
			recoveryState.crashedAt + HW_INITIAL_PONG_TIMEOUT_MS;
		recoveryState.pipWaitDeadlineAt =
			recoveryState.crashedAt + HW_HIDDEN_STALE_MIN_MS;
		recoveryState.expectedAfterGeneration = recoveryState.failedGeneration;
		recoveryState.hiddenLastMediaTime = -1;
		recoveryState.phase = "scheduled";
		worker.__TTVABRecoveryEpoch = recoveryState.activeEpoch;
	}
	const recoveryEpoch = Math.max(0, Number(worker.__TTVABRecoveryEpoch) || 0);
	if (
		recoveryEpoch <= 0 ||
		recoveryState.activeEpoch !== recoveryEpoch ||
		recoveryState.timerID !== null
	) {
		return;
	}
	if (recoveryState.attempts >= HW_MAX_RESTART) {
		recoveryState.activeEpoch = 0;
		recoveryState.phase = "exhausted";
		worker.__TTVABRecoveryEpoch = 0;
		if (!recoveryState.limitLogged) {
			recoveryState.limitLogged = true;
			_log(
				"Worker restart limit reached; using degraded page-side M3U8 fallback",
				"error",
			);
		}
		_installPageSideM3U8Override();
		return;
	}
	const attemptNumber = recoveryState.attempts + 1;
	const delay = 2 ** attemptNumber * 500;
	_log(
		"Recovering worker in " +
			delay / 1000 +
			"s (attempt " +
			attemptNumber +
			"/" +
			HW_MAX_RESTART +
			")",
		"warning",
	);

	const recoveryIsCurrent = () =>
		recoveryState.activeEpoch === recoveryEpoch &&
		worker.__TTVABRecoveryEpoch === recoveryEpoch;
	const scheduleRecovery = (callback, waitMs) => {
		if (!recoveryIsCurrent() || recoveryState.timerID !== null) return false;
		const timerID = setTimeout(
			() => {
				if (recoveryState.timerID === timerID) {
					recoveryState.timerID = null;
				}
				if (recoveryIsCurrent()) callback();
			},
			Math.max(0, Number(waitMs) || 0),
		);
		recoveryState.timerID = timerID;
		return true;
	};
	const retryRecovery = () => {
		if (!recoveryIsCurrent()) return;
		recoveryState.phase = "scheduled";
		_attemptWorkerRestart(worker, recoveryContext);
	};
	const confirmReplacement = () => {
		const currentContext = _getPlaybackContextFromUrl(window.location.href);
		const contextIsCurrent = !_isPlaybackContextMismatch(
			recoveryContext,
			currentContext,
		);
		const contextIsPip = Boolean(
			typeof _isActivePictureInPicturePlaybackContext === "function" &&
				_isActivePictureInPicturePlaybackContext(recoveryContext),
		);
		if (!contextIsCurrent && !contextIsPip) {
			recoveryState.activeEpoch = 0;
			recoveryState.phase = "cancelled";
			_log("Skipping stale worker recovery after navigation", "info");
			return;
		}
		const replacement = _getQualifiedReplacementWorker(
			worker,
			recoveryContext,
			recoveryState.reloadDispatchedAt,
			recoveryState.expectedAfterGeneration,
		);
		if (
			replacement &&
			_promoteWorkerPlaybackOwner(replacement, Date.now(), recoveryContext)
		) {
			const replacementGeneration = Math.max(
				0,
				Number(replacement.__TTVABGeneration) || 0,
			);
			recoveryState.retiredThroughGeneration = Math.max(
				0,
				Number(recoveryState.retiredThroughGeneration) || 0,
				recoveryState.expectedAfterGeneration,
			);
			recoveryState.stableGeneration = replacementGeneration;
			recoveryState.stableSince = Date.now();
			recoveryState.activeEpoch = 0;
			recoveryState.phase = "stabilizing";
			_log("Replacement worker confirmed after player reload", "success");
			return;
		}
		if (Date.now() >= recoveryState.successorDeadlineAt) {
			_log("Player reload did not produce a healthy playback worker", "error");
			retryRecovery();
			return;
		}
		scheduleRecovery(confirmReplacement, 1000);
	};
	const runRecovery = () => {
		if (worker.__TTVABIntentionallyTerminated && !worker.__TTVABCrashed) {
			recoveryState.activeEpoch = 0;
			recoveryState.phase = "cancelled";
			return;
		}
		const currentContext = _getPlaybackContextFromUrl(window.location.href);
		const contextIsCurrent = !_isPlaybackContextMismatch(
			recoveryContext,
			currentContext,
		);
		const contextIsPip = Boolean(
			typeof _isActivePictureInPicturePlaybackContext === "function" &&
				_isActivePictureInPicturePlaybackContext(recoveryContext),
		);
		if (!contextIsCurrent && !contextIsPip) {
			recoveryState.activeEpoch = 0;
			recoveryState.phase = "cancelled";
			_log("Skipping stale worker recovery after navigation", "info");
			return;
		}
		if (
			contextIsCurrent &&
			(recoveryState.phase === "waiting-pip" ||
				recoveryState.phase === "degraded-pip") &&
			typeof _installPageSideM3U8Override === "function"
		) {
			_installPageSideM3U8Override();
		}
		const automaticReplacement = _getQualifiedReplacementWorker(
			worker,
			recoveryContext,
			recoveryState.crashedAt,
			recoveryState.failedGeneration,
			Date.now(),
			false,
		);
		if (
			automaticReplacement &&
			_promoteWorkerPlaybackOwner(
				automaticReplacement,
				Date.now(),
				recoveryContext,
			)
		) {
			const replacementGeneration = Math.max(
				0,
				Number(automaticReplacement.__TTVABGeneration) || 0,
			);
			recoveryState.retiredThroughGeneration = Math.max(
				0,
				Number(recoveryState.retiredThroughGeneration) || 0,
				recoveryState.failedGeneration,
			);
			recoveryState.stableGeneration = replacementGeneration;
			recoveryState.stableSince = Date.now();
			recoveryState.activeEpoch = 0;
			recoveryState.phase = "stabilizing";
			_log("Healthy playback worker replaced the crashed worker", "success");
			return;
		}
		if (
			typeof _hasUserPauseIntent === "function" &&
			_hasUserPauseIntent(recoveryContext.ChannelName, recoveryContext.MediaKey)
		) {
			recoveryState.pipWaitDeadlineAt = Math.max(
				Number(recoveryState.pipWaitDeadlineAt) || 0,
				Date.now() + HW_HIDDEN_STALE_MIN_MS,
			);
			recoveryState.phase = "waiting-user-pause";
			_log(
				"Deferring worker recovery while playback is manually paused",
				"info",
			);
			scheduleRecovery(runRecovery, HW_WATCHDOG_INTERVAL_MS);
			return;
		}
		if (!contextIsCurrent && contextIsPip) {
			if (Date.now() >= recoveryState.pipWaitDeadlineAt) {
				const wasDegradedPip = recoveryState.phase === "degraded-pip";
				recoveryState.phase = "degraded-pip";
				if (!wasDegradedPip) {
					_log(
						"Picture-in-Picture worker recovery timed out without reloading another stream",
						"error",
					);
				}
				scheduleRecovery(runRecovery, HW_INITIAL_PONG_TIMEOUT_MS);
				return;
			}
			if (recoveryState.phase !== "waiting-pip") {
				_log(
					"Waiting to recover a crashed Picture-in-Picture worker without reloading another stream",
					"warning",
				);
			}
			recoveryState.phase = "waiting-pip";
			scheduleRecovery(runRecovery, HW_WATCHDOG_INTERVAL_MS);
			return;
		}
		let playbackDead = false;
		if (_isWorkerLifecycleThrottled()) {
			const hiddenMedia =
				typeof _getPrimaryMediaElement === "function"
					? _getPrimaryMediaElement()
					: null;
			const hasHiddenMedia = hiddenMedia instanceof HTMLMediaElement;
			const hiddenMediaTime = hasHiddenMedia
				? Number(hiddenMedia.currentTime) || 0
				: -1;
			playbackDead = hasHiddenMedia
				? recoveryState.hiddenLastMediaTime >= 0 &&
					hiddenMediaTime <= recoveryState.hiddenLastMediaTime + 0.2
				: recoveryState.hiddenLastMediaTime === -2;
			recoveryState.hiddenLastMediaTime = hasHiddenMedia ? hiddenMediaTime : -2;
			if (!playbackDead) {
				_log("Deferring worker recovery reload until tab is visible", "info");
				scheduleRecovery(runRecovery, HW_WATCHDOG_INTERVAL_MS);
				return;
			}
			_log(
				"Proceeding with worker recovery while hidden — playback is not advancing",
				"warning",
			);
		}
		if (
			!playbackDead &&
			_hasStartingReplacementWorker(
				worker,
				recoveryContext,
				recoveryState.failedGeneration,
				recoveryState.bootstrapDeadlineAt,
			)
		) {
			recoveryState.phase = "waiting-worker";
			_log("Waiting for replacement worker playback confirmation", "info");
			scheduleRecovery(runRecovery, HW_WATCHDOG_INTERVAL_MS);
			return;
		}
		const now = Date.now();
		const lastRecoveryReloadAt = Math.max(
			0,
			Number(recoveryState.lastReloadAt) || 0,
		);
		if (now - lastRecoveryReloadAt < HW_RECOVERY_COOLDOWN_MS) {
			const remainingCooldown = Math.max(
				0,
				HW_RECOVERY_COOLDOWN_MS - (now - lastRecoveryReloadAt),
			);
			_log("Deferring worker recovery reload (cooldown)", "info");
			scheduleRecovery(runRecovery, remainingCooldown);
			return;
		}
		if (!_recordWorkerRecoveryAttempt(recoveryContext, now)) {
			retryRecovery();
			return;
		}
		worker.__TTVABRestartAttempts = recoveryState.attempts;
		recoveryState.phase = "dispatching";
		const generationBeforeReload = Math.max(
			recoveryState.failedGeneration,
			_getHighestWorkerGenerationForPlaybackContext(recoveryContext),
		);
		const reloadMarkerBefore = _getPlayerReloadAtForMediaKey(
			recoveryContext.MediaKey,
		);
		const dispatchStartedAt = Date.now();
		try {
			const accepted =
				typeof _doPlayerTask === "function" &&
				_doPlayerTask(false, true, {
					reason: "worker-recovery",
					refreshAccessToken: true,
					newMediaPlayerInstance: true,
					channel: recoveryContext.ChannelName,
					mediaKey: recoveryContext.MediaKey,
				}) === true;
			const reloadDispatchedAt = _getPlayerReloadAtForMediaKey(
				recoveryContext.MediaKey,
			);
			const didDispatchReload = Boolean(
				accepted &&
					reloadDispatchedAt > reloadMarkerBefore &&
					reloadDispatchedAt >= dispatchStartedAt,
			);
			if (!didDispatchReload) {
				_log("Worker recovery did not reload the player; retrying", "warning");
				retryRecovery();
				return;
			}
			recoveryState.lastReloadAt = reloadDispatchedAt;
			recoveryState.retiredThroughGeneration = Math.max(
				0,
				Number(recoveryState.retiredThroughGeneration) || 0,
				generationBeforeReload,
			);
			recoveryState.expectedAfterGeneration = generationBeforeReload;
			recoveryState.reloadDispatchedAt = reloadDispatchedAt;
			recoveryState.successorDeadlineAt =
				reloadDispatchedAt + HW_INITIAL_PONG_TIMEOUT_MS;
			recoveryState.phase = "awaiting-successor";
			_log("Player reload requested for crashed worker recovery", "info");
			scheduleRecovery(confirmReplacement, 1000);
		} catch (recoveryErr) {
			_log(
				`Worker recovery failed: ${recoveryErr?.message ?? String(recoveryErr)}`,
				"error",
			);
			retryRecovery();
		}
	};

	scheduleRecovery(runRecovery, delay);
}

let _workerWatchdogID: ReturnType<typeof setInterval> | null = null;

function _startWorkerWatchdog() {
	if (_workerWatchdogID !== null) return;
	_workerWatchdogID = setInterval(() => {
		const now = Date.now();
		const isHidden = _isWorkerLifecycleThrottled();
		for (const worker of _S.workers) {
			if (!worker || worker.__TTVABIntentionallyTerminated) continue;
			if (worker.__TTVABCrashed) continue;
			const workerContext = _getWorkerPlaybackContext(worker, {
				MediaType: __TTVAB_STATE__?.PageMediaType || "channel",
				ChannelName: __TTVAB_STATE__?.PageChannel || "",
				VodID: __TTVAB_STATE__?.PageVodID || "",
				MediaKey: __TTVAB_STATE__?.PageMediaKey || "",
			});
			const lastSeen =
				worker.__TTVABLastPongAt || worker.__TTVABCreatedAt || now;
			const lastPingSentAt = Math.max(
				0,
				Number(worker.__TTVABLastPingSentAt) || 0,
			);
			const hasUnansweredPing = lastPingSentAt > lastSeen;
			if (!hasUnansweredPing) {
				worker.__TTVABLastPingSentAt = now;
			}
			let hiddenPlaybackStopped = false;
			const workerContextIsCurrent = !_isPlaybackContextMismatch(
				workerContext,
				_getPlaybackContextFromUrl(window.location.href),
			);
			const workerContextIsActivePip = Boolean(
				typeof _isActivePictureInPicturePlaybackContext === "function" &&
					_isActivePictureInPicturePlaybackContext(workerContext),
			);
			const hiddenHeartbeatIsStale = Boolean(
				isHidden &&
					hasUnansweredPing &&
					now - lastSeen >= HW_PONG_TIMEOUT_MS &&
					(workerContextIsCurrent || workerContextIsActivePip),
			);
			const hasUserPauseIntent =
				hiddenHeartbeatIsStale &&
				typeof _hasUserPauseIntent === "function" &&
				_hasUserPauseIntent(workerContext.ChannelName, workerContext.MediaKey);
			if (hiddenHeartbeatIsStale && hasUserPauseIntent) {
				worker.__TTVABMissedPongs = 0;
				try {
					_postWorkerBridgeMessage(worker, { key: "Ping", value: null });
				} catch {}
				continue;
			}
			if (hiddenHeartbeatIsStale && !hasUserPauseIntent) {
				const hiddenMedia =
					typeof _getPrimaryMediaElement === "function"
						? _getPrimaryMediaElement()
						: null;
				if (hiddenMedia instanceof HTMLMediaElement) {
					const mediaTime = Number(hiddenMedia.currentTime) || 0;
					hiddenPlaybackStopped = Boolean(
						worker.__TTVABHiddenHeartbeatMediaTime >= 0 &&
							mediaTime <= worker.__TTVABHiddenHeartbeatMediaTime + 0.2,
					);
					worker.__TTVABHiddenHeartbeatMediaTime = mediaTime;
					worker.__TTVABHiddenHeartbeatMissingSamples = 0;
				} else {
					worker.__TTVABHiddenHeartbeatMediaTime = -1;
					worker.__TTVABHiddenHeartbeatMissingSamples =
						Math.max(
							0,
							Number(worker.__TTVABHiddenHeartbeatMissingSamples) || 0,
						) + 1;
					hiddenPlaybackStopped =
						worker.__TTVABHiddenHeartbeatMissingSamples >= 2;
				}
			} else {
				worker.__TTVABHiddenHeartbeatMediaTime = -1;
				worker.__TTVABHiddenHeartbeatMissingSamples = 0;
			}
			if (hiddenPlaybackStopped) {
				_recoverCrashedWorker(
					worker,
					workerContext,
					"Worker unresponsive while hidden playback stopped advancing",
					"warning",
				);
				continue;
			}
			if (
				now - lastSeen > HW_PONG_TIMEOUT_MS &&
				hasUnansweredPing &&
				now - lastPingSentAt > HW_PONG_TIMEOUT_MS
			) {
				const missedPongs =
					Math.max(0, Number(worker.__TTVABMissedPongs) || 0) + 1;
				worker.__TTVABMissedPongs = missedPongs;
				const missedPongLimit = isHidden
					? HW_MAX_MISSED_PONGS_HIDDEN
					: HW_MAX_MISSED_PONGS;
				const hiddenStaleSatisfied =
					!isHidden || now - lastSeen > HW_HIDDEN_STALE_MIN_MS;
				if (missedPongs < missedPongLimit || !hiddenStaleSatisfied) {
					_log(
						`Worker heartbeat late (${missedPongs}/${missedPongLimit}); pinging again`,
						"info",
					);
					try {
						_postWorkerBridgeMessage(worker, { key: "Ping", value: null });
					} catch {}
					continue;
				}
				_recoverCrashedWorker(
					worker,
					workerContext,
					"Worker unresponsive (no pong)",
					"warning",
				);
				continue;
			}
			try {
				_postWorkerBridgeMessage(worker, { key: "Ping", value: null });
			} catch {}
		}
	}, HW_WATCHDOG_INTERVAL_MS);
	_log("Worker watchdog started", "info");
}

function _attemptPageSideFallbackTerminalRearm(
	url,
	mediaKey,
	cycleStartedAt,
	priorAdOwner,
) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	const normalizedCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	const recoveryContext = {
		MediaType: __TTVAB_STATE__?.PageMediaType,
		ChannelName: __TTVAB_STATE__?.PageChannel,
		VodID: __TTVAB_STATE__?.PageVodID,
		MediaKey: normalizedMediaKey,
	};
	const recoveryState = _getWorkerRecoveryState(recoveryContext, false);
	const ownerGeneration = Math.max(
		0,
		Number(priorAdOwner?.workerGeneration) || 0,
	);
	const ownerConfirmedAt = Math.max(
		0,
		Number(priorAdOwner?.confirmedPlaybackAt) || 0,
	);
	const retiredThroughGeneration = Math.max(
		0,
		Number(recoveryState?.retiredThroughGeneration) || 0,
		Number(recoveryState?.failedGeneration) || 0,
	);
	const currentContext = _getPlaybackContextFromUrl(window.location.href);
	const reloadAt = _getPlayerReloadAtForMediaKey(normalizedMediaKey);
	const ownerHandoffId =
		typeof priorAdOwner?.handoffId === "string" && priorAdOwner.handoffId
			? priorAdOwner.handoffId
			: null;
	const activeHandoffId =
		_normalizeMediaKey(__TTVAB_STATE__?.ActiveCodecHandoffMediaKey) ===
		normalizedMediaKey
			? __TTVAB_STATE__?.ActiveCodecHandoffId || null
			: null;
	if (
		!normalizedMediaKey ||
		normalizedCycleStartedAt <= 0 ||
		recoveryState?.phase !== "exhausted" ||
		_normalizeMediaKey(__TTVAB_STATE__?.PageMediaKey) !== normalizedMediaKey ||
		_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) !==
			normalizedMediaKey ||
		_isPlaybackContextMismatch(recoveryContext, currentContext) ||
		!_isPageLifecycleCycleCurrent(
			normalizedMediaKey,
			normalizedCycleStartedAt,
		) ||
		_pageSidePlaybackOwnerByUrl.get(_getExactPlaylistUrlKey(url)) !==
			priorAdOwner ||
		_normalizeMediaKey(priorAdOwner?.mediaKey) !== normalizedMediaKey ||
		Math.max(0, Number(priorAdOwner?.adCycleStartedAt) || 0) !==
			normalizedCycleStartedAt ||
		ownerGeneration <= 0 ||
		ownerConfirmedAt <= 0 ||
		ownerGeneration > retiredThroughGeneration ||
		reloadAt <= ownerConfirmedAt ||
		Math.max(0, Number(recoveryState.terminalRearmCycleStartedAt) || 0) ===
			normalizedCycleStartedAt ||
		(typeof _hasUserPauseIntent === "function" &&
			_hasUserPauseIntent(recoveryContext.ChannelName, normalizedMediaKey))
	) {
		return false;
	}
	const attemptedAt = Date.now();
	const previousAttemptedAt = Math.max(
		0,
		Number(recoveryState.terminalRearmAttemptedAt) || 0,
	);
	if (
		previousAttemptedAt > 0 &&
		attemptedAt - previousAttemptedAt < HW_RECOVERY_COOLDOWN_MS
	) {
		return false;
	}
	for (const handoffId of new Set([ownerHandoffId, activeHandoffId])) {
		if (!handoffId) continue;
		const handoffParts = handoffId.split(":");
		const handoffCreatedAt = Math.max(
			0,
			Number(handoffParts[handoffParts.length - 3]) || 0,
		);
		if (
			_getCodecHandoffCycleStartedAt(handoffId) !== normalizedCycleStartedAt ||
			(handoffCreatedAt > 0 && reloadAt < handoffCreatedAt)
		) {
			return false;
		}
	}
	if (ownerHandoffId) {
		priorAdOwner.handoffId = null;
	}
	if (activeHandoffId) {
		__TTVAB_STATE__.ActiveCodecHandoffId = null;
		__TTVAB_STATE__.ActiveCodecHandoffChannel = null;
		__TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
		_broadcastWorkers({
			key: "UpdateCodecHandoffContext",
			targetMediaKey: normalizedMediaKey,
			value: {
				clearHandoffId: activeHandoffId,
				channelName: recoveryContext.ChannelName,
				mediaKey: normalizedMediaKey,
			},
		});
	}
	recoveryState.terminalRearmAttemptedAt = attemptedAt;
	const reloadBefore = _getPlayerReloadAtForMediaKey(normalizedMediaKey);
	const accepted = Boolean(
		typeof _doPlayerTask === "function" &&
			_doPlayerTask(false, true, {
				reason: "worker-recovery",
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
				channel: recoveryContext.ChannelName,
				mediaKey: normalizedMediaKey,
				cycleStartedAt: normalizedCycleStartedAt,
			}) === true,
	);
	const reloadAfter = _getPlayerReloadAtForMediaKey(normalizedMediaKey);
	if (!accepted || reloadAfter <= reloadBefore || reloadAfter < attemptedAt) {
		_log("Terminal worker recovery rearm could not reload the player", "error");
		return false;
	}
	recoveryState.terminalRearmCycleStartedAt = normalizedCycleStartedAt;
	_log("Terminal worker recovery rearm requested", "warning");
	return true;
}

function _isPageSideFallbackRecoveryReady(url, text, info, mediaKey) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	const podProgress =
		__TTVAB_STATE__?.AdPodProgressByMediaKey?.[normalizedMediaKey] || null;
	const cycleStartedAt = Math.max(0, Number(podProgress?.cycleStartedAt) || 0);
	if (!normalizedMediaKey || cycleStartedAt <= 0 || !info) return false;
	const expectedPodLength = Math.max(
		0,
		Math.trunc(Number(podProgress?.expectedPodLength) || 0),
	);
	const observedPodLength = Array.isArray(podProgress?.adIds)
		? new Set(podProgress.adIds.filter(Boolean)).size
		: 0;
	const maxAdPodPosition = Math.max(
		0,
		Math.trunc(Number(podProgress?.maxAdPodPosition) || 0),
	);
	const observedTerminalPodPosition = Boolean(
		expectedPodLength > 0 &&
			(podProgress?.observedZeroAdPodPosition === true
				? maxAdPodPosition + 1 >= expectedPodLength
				: maxAdPodPosition >= expectedPodLength),
	);
	const declaredPodIncomplete = Boolean(
		expectedPodLength > 0 &&
			observedPodLength < expectedPodLength &&
			!observedTerminalPodPosition,
	);
	const recoveryState = _getWorkerRecoveryState(
		{
			MediaType: __TTVAB_STATE__?.PageMediaType,
			ChannelName: __TTVAB_STATE__?.PageChannel,
			VodID: __TTVAB_STATE__?.PageVodID,
			MediaKey: normalizedMediaKey,
		},
		false,
	);
	if (
		recoveryState?.phase !== "exhausted" &&
		recoveryState?.phase !== "stabilizing"
	) {
		return false;
	}
	const priorAdOwner = _pageSidePlaybackOwnerByUrl.get(
		_getExactPlaylistUrlKey(url),
	);
	if (
		_normalizeMediaKey(priorAdOwner?.mediaKey) !== normalizedMediaKey ||
		Math.max(0, Number(priorAdOwner?.adCycleStartedAt) || 0) !== cycleStartedAt
	) {
		return false;
	}
	const lastMarkedProgressAt = Math.max(
		0,
		Number(priorAdOwner?.lastAdMarkedAt) || 0,
		Number(podProgress?.updatedAt) || 0,
	);
	if (
		Math.max(0, Number(info._PageFallbackCycleStartedAt) || 0) !==
		cycleStartedAt
	) {
		info._PageFallbackCycleStartedAt = cycleStartedAt;
		info._PageFallbackCleanStartedAt = 0;
		info._PageFallbackCleanPlaylistCount = 0;
		info._PageFallbackLastMediaSequence = null;
	}
	const now = Date.now();
	if (
		Math.max(0, Number(info._PageFallbackCleanStartedAt) || 0) > 0 &&
		Math.max(0, Number(info._PageFallbackCleanStartedAt) || 0) <=
			lastMarkedProgressAt
	) {
		info._PageFallbackCleanStartedAt = 0;
		info._PageFallbackCleanPlaylistCount = 0;
		info._PageFallbackLastMediaSequence = null;
	}
	const mediaSequence = _parsePlaylistFirstMediaSequence(text);
	const previousMediaSequence =
		typeof info._PageFallbackLastMediaSequence === "number" &&
		Number.isFinite(info._PageFallbackLastMediaSequence)
			? info._PageFallbackLastMediaSequence
			: null;
	const isVod = normalizedMediaKey.startsWith("vod:");
	if (isVod && !text.includes("#EXT-X-ENDLIST")) return false;
	if (
		!isVod &&
		previousMediaSequence !== null &&
		mediaSequence !== null &&
		mediaSequence <= previousMediaSequence
	) {
		if (mediaSequence < previousMediaSequence) {
			info._PageFallbackCleanStartedAt = now;
			info._PageFallbackCleanPlaylistCount = 1;
			info._PageFallbackLastMediaSequence = mediaSequence;
		}
		return false;
	}
	if (!isVod && mediaSequence === null) return false;
	if (!info._PageFallbackCleanStartedAt) {
		info._PageFallbackCleanStartedAt = now;
	}
	info._PageFallbackCleanPlaylistCount =
		Math.max(0, Number(info._PageFallbackCleanPlaylistCount) || 0) + 1;
	info._PageFallbackLastMediaSequence = mediaSequence;
	const escalation = 4;
	const minCleanPlaylists =
		Math.max(1, Number(__TTVAB_STATE__?.AdEndMinCleanPlaylists) || 1) +
		escalation;
	const graceMs =
		Math.max(0, Number(__TTVAB_STATE__?.AdEndGraceMs) || 0) + escalation * 2500;
	const hasEscalatedCleanProof = Boolean(
		info._PageFallbackCleanPlaylistCount >= minCleanPlaylists &&
			now - info._PageFallbackCleanStartedAt >= graceMs,
	);
	if (!hasEscalatedCleanProof) return false;
	if (declaredPodIncomplete) {
		const terminalEscapeMs = Math.max(
			90000,
			Number(__TTVAB_STATE__?.AdEndBackupHoldMaxMs) || 0,
		);
		if (
			lastMarkedProgressAt <= 0 ||
			now - lastMarkedProgressAt < terminalEscapeMs ||
			(isVod && !text.includes("#EXT-X-ENDLIST"))
		) {
			return false;
		}
	}
	if (
		_getTrustedPageSidePlaybackOwner(url, normalizedMediaKey, cycleStartedAt)
	) {
		return true;
	}
	_attemptPageSideFallbackTerminalRearm(
		url,
		normalizedMediaKey,
		cycleStartedAt,
		priorAdOwner,
	);
	return false;
}

function _completePageSideFallbackAdRecovery(mediaKey) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	const activeMediaKey = _normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey);
	const cycleStartedAt = Math.max(
		0,
		Number(
			__TTVAB_STATE__?.AdPodProgressByMediaKey?.[normalizedMediaKey]
				?.cycleStartedAt,
		) || 0,
	);
	if (
		!normalizedMediaKey ||
		activeMediaKey !== normalizedMediaKey ||
		cycleStartedAt <= 0
	) {
		return false;
	}
	const recoveryState = _getWorkerRecoveryState(
		{
			MediaType: __TTVAB_STATE__?.PageMediaType,
			ChannelName: __TTVAB_STATE__?.PageChannel,
			VodID: __TTVAB_STATE__?.PageVodID,
			MediaKey: normalizedMediaKey,
		},
		false,
	);
	if (recoveryState?.phase === "exhausted") {
		recoveryState.retiredThroughGeneration = Math.max(
			0,
			Number(recoveryState.retiredThroughGeneration) || 0,
			Number(recoveryState.failedGeneration) || 0,
		);
	}
	const endedAt = Date.now();
	const channel =
		__TTVAB_STATE__?.CurrentAdChannel || __TTVAB_STATE__?.PageChannel || null;
	const handoffId =
		_normalizeMediaKey(__TTVAB_STATE__?.ActiveCodecHandoffMediaKey) ===
		normalizedMediaKey
			? __TTVAB_STATE__?.ActiveCodecHandoffId || null
			: null;
	for (const streamInfo of Object.values(
		__TTVAB_STATE__?.StreamInfos || {},
	) as Array<{ MediaKey?: string | null }>) {
		if (_normalizeMediaKey(streamInfo?.MediaKey) !== normalizedMediaKey)
			continue;
		_resetStreamAdState(streamInfo);
	}
	__TTVAB_STATE__.LastAdEndedAt = endedAt;
	__TTVAB_STATE__.LastAdEndedChannel = channel;
	__TTVAB_STATE__.LastAdEndedMediaKey = normalizedMediaKey;
	__TTVAB_STATE__.LastAdEndedCycleStartedAt = cycleStartedAt;
	__TTVAB_STATE__.CurrentAdChannel = null;
	__TTVAB_STATE__.CurrentAdMediaKey = null;
	if (
		_normalizeMediaKey(__TTVAB_STATE__?.PinnedBackupPlayerMediaKey) ===
		normalizedMediaKey
	) {
		__TTVAB_STATE__.PinnedBackupPlayerType = null;
		__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
		__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
	}
	if (handoffId) {
		__TTVAB_STATE__.ActiveCodecHandoffId = null;
		__TTVAB_STATE__.ActiveCodecHandoffChannel = null;
		__TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
	}
	__TTVAB_STATE__._AdRecoveryConsecutiveFailures = 0;
	const messages: Array<Record<string, unknown>> = [
		{
			key: "ResetAdCycleState",
			targetMediaKey: normalizedMediaKey,
			value: {
				mediaType: __TTVAB_STATE__?.PageMediaType,
				channelName: channel,
				vodID: __TTVAB_STATE__?.PageVodID,
				mediaKey: normalizedMediaKey,
				cycleStartedAt,
			},
		},
		{
			key: "UpdateLastAdEndContext",
			targetMediaKey: normalizedMediaKey,
			value: {
				mediaType: __TTVAB_STATE__?.PageMediaType,
				channelName: channel,
				vodID: __TTVAB_STATE__?.PageVodID,
				mediaKey: normalizedMediaKey,
				endedAt,
				cycleStartedAt,
			},
		},
	];
	if (handoffId) {
		messages.push({
			key: "UpdateCodecHandoffContext",
			targetMediaKey: normalizedMediaKey,
			value: {
				clearHandoffId: handoffId,
				channelName: channel,
				mediaKey: normalizedMediaKey,
			},
		});
	}
	_broadcastWorkers(messages);
	_clearAdPodProgress(normalizedMediaKey);
	if (typeof _clearPlaybackRecoveryTimeoutsForContext === "function") {
		_clearPlaybackRecoveryTimeoutsForContext(normalizedMediaKey);
	}
	if (typeof _resetPlayerBufferMonitorState === "function") {
		_resetPlayerBufferMonitorState();
	}
	if (typeof _clearAdResumeIntent === "function") {
		_clearAdResumeIntent();
	}
	if (typeof _restoreSuppressedMediaAfterAd === "function") {
		_restoreSuppressedMediaAfterAd(channel, normalizedMediaKey);
	}
	_schedulePostAdArtifactCleanup(channel, normalizedMediaKey, cycleStartedAt);
	_log(
		"Page-side fallback verified sustained clean native playback after worker recovery exhausted",
		"success",
	);
	return true;
}

function _ensurePageSideFallbackAdCycle(url, _codec = null, playlistText = "") {
	if (__TTVAB_STATE__?.IsAdStrippingEnabled !== true) return 0;
	const context = _normalizePlaybackContext({
		MediaType: __TTVAB_STATE__?.PageMediaType,
		ChannelName: __TTVAB_STATE__?.PageChannel,
		VodID: __TTVAB_STATE__?.PageVodID,
		MediaKey: __TTVAB_STATE__?.PageMediaKey,
	});
	if (!context.MediaKey) return 0;
	const observedAdIds = [];
	let expectedPodLength = 0;
	let maxAdPodPosition = 0;
	let observedZeroAdPodPosition = false;
	for (const line of String(playlistText || "").split("\n")) {
		if (!line.startsWith("#EXT-X-DATERANGE:")) continue;
		const attrs = _parseAttrs(line.slice("#EXT-X-DATERANGE:".length));
		const adId = typeof attrs.ID === "string" ? attrs.ID : null;
		if (adId?.startsWith("stitched-ad-")) observedAdIds.push(adId);
		expectedPodLength = Math.max(
			expectedPodLength,
			Math.max(0, Number(attrs["X-TV-TWITCH-AD-POD-LENGTH"]) || 0),
		);
		maxAdPodPosition = Math.max(
			maxAdPodPosition,
			Math.max(0, Number(attrs["X-TV-TWITCH-AD-POD-POSITION"]) || 0),
		);
		if (
			Object.hasOwn(attrs, "X-TV-TWITCH-AD-POD-POSITION") &&
			Number(attrs["X-TV-TWITCH-AD-POD-POSITION"]) === 0
		) {
			observedZeroAdPodPosition = true;
		}
	}
	const now = Date.now();
	const activeMediaKey = _normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey);
	const activeCycleStartedAt = Math.max(
		0,
		Number(
			__TTVAB_STATE__?.AdPodProgressByMediaKey?.[context.MediaKey]
				?.cycleStartedAt,
		) || 0,
	);
	const exactOwner = _pageSidePlaybackOwnerByUrl.get(
		_getExactPlaylistUrlKey(url),
	);
	if (activeMediaKey === context.MediaKey && activeCycleStartedAt > 0) {
		if (
			_normalizeMediaKey(exactOwner?.mediaKey) !== context.MediaKey ||
			Math.max(0, Number(exactOwner?.adCycleStartedAt) || 0) !==
				activeCycleStartedAt
		) {
			return 0;
		}
		const progress = _mergeAdPodProgress({
			mediaType: context.MediaType,
			channelName: context.ChannelName,
			vodID: context.VodID,
			mediaKey: context.MediaKey,
			adIds: observedAdIds,
			expectedPodLength,
			maxAdPodPosition,
			observedZeroAdPodPosition,
			cycleStartedAt: activeCycleStartedAt,
		});
		_rememberPageSidePlaybackOwner(
			context.MediaKey,
			url,
			null,
			activeCycleStartedAt,
			{ confirmedPlayback: false, adMarked: true },
		);
		if (progress) {
			_broadcastWorkers({
				key: "UpdateAdPodProgress",
				targetMediaKey: context.MediaKey,
				value: {
					mediaType: context.MediaType,
					channelName: context.ChannelName,
					vodID: context.VodID,
					mediaKey: context.MediaKey,
					...progress,
				},
			});
		}
		return activeCycleStartedAt;
	}
	if (!_getTrustedPageSidePlaybackOwner(url, context.MediaKey)) {
		return 0;
	}
	const lastEndedCycleStartedAt =
		_normalizeMediaKey(__TTVAB_STATE__?.LastAdEndedMediaKey) ===
		context.MediaKey
			? Math.max(0, Number(__TTVAB_STATE__?.LastAdEndedCycleStartedAt) || 0)
			: 0;
	const isRecentContinuation = Boolean(
		lastEndedCycleStartedAt > 0 &&
			now - Math.max(0, Number(__TTVAB_STATE__?.LastAdEndedAt) || 0) <=
				_getPostAdReentryContinuationMs(),
	);
	const cycleStartedAt = isRecentContinuation ? lastEndedCycleStartedAt : now;
	if (!isRecentContinuation) {
		_clearAdPodProgress(context.MediaKey);
		if (typeof _clearPlaybackRecoveryTimeoutsForContext === "function") {
			_clearPlaybackRecoveryTimeoutsForContext(context.MediaKey);
		}
	}
	const progress = _mergeAdPodProgress({
		mediaType: context.MediaType,
		channelName: context.ChannelName,
		vodID: context.VodID,
		mediaKey: context.MediaKey,
		adIds: observedAdIds,
		expectedPodLength,
		maxAdPodPosition,
		observedZeroAdPodPosition,
		cycleStartedAt,
	});
	__TTVAB_STATE__.CurrentAdChannel = context.ChannelName;
	__TTVAB_STATE__.CurrentAdMediaKey = context.MediaKey;
	__TTVAB_STATE__.LastAdDetectedAt = now;
	__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
	__TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
	_rememberPageSidePlaybackOwner(context.MediaKey, url, null, cycleStartedAt, {
		confirmedPlayback: false,
		adMarked: true,
	});
	_broadcastWorkers([
		{
			key: "UpdateCurrentAdContext",
			targetMediaKey: context.MediaKey,
			value: {
				channelName: context.ChannelName,
				mediaKey: context.MediaKey,
			},
		},
		{
			key: "UpdateAdPodProgress",
			targetMediaKey: context.MediaKey,
			value: {
				mediaType: context.MediaType,
				channelName: context.ChannelName,
				vodID: context.VodID,
				mediaKey: context.MediaKey,
				...progress,
			},
		},
	]);
	if (!isRecentContinuation) {
		_incrementAdsBlocked(context.ChannelName, context.MediaKey);
	}
	if (typeof _rememberPlayerPlaybackForAd === "function") {
		_rememberPlayerPlaybackForAd(context.ChannelName, context.MediaKey);
	}
	if (typeof _ensurePlaybackMonitorsRunning === "function") {
		_ensurePlaybackMonitorsRunning(true);
	}
	_log(
		isRecentContinuation
			? "Page-side fallback continuing the active ad cycle"
			: "Page-side fallback detected and blocked an ad",
		"warning",
	);
	return cycleStartedAt;
}

function _installPageSideM3U8Override() {
	if (window.__TTVAB_M3U8_FALLBACK_ACTIVE) return;
	window.__TTVAB_M3U8_FALLBACK_ACTIVE = true;
	_log("Installing page-side M3U8 fetch override (degraded mode)", "warning");

	const realFetch = window.fetch;
	if (!window.__TTVAB_REAL_FETCH__) {
		window.__TTVAB_REAL_FETCH__ = realFetch;
	}
	let fallbackWasEnabled = __TTVAB_STATE__?.IsAdStrippingEnabled === true;
	const shouldPassThrough = () => {
		const enabled = __TTVAB_STATE__?.IsAdStrippingEnabled === true;
		if (!enabled && fallbackWasEnabled) {
			_pageSideEmptyHoldInfoByUrl.clear();
		}
		fallbackWasEnabled = enabled;
		return !enabled;
	};

	window.fetch = async function (...args) {
		if (shouldPassThrough()) {
			return realFetch.apply(this, args);
		}
		const [urlOrRequest] = args;
		const urlStr =
			urlOrRequest instanceof Request
				? urlOrRequest.url
				: String(urlOrRequest || "");
		const isM3U8 =
			/\.m3u8(?:$|\?)/.test(urlStr) &&
			(urlStr.includes("twitch") ||
				urlStr.includes("ttvnw.net") ||
				urlStr.includes("twitchcdn.net"));
		const fallbackRequestSignal =
			args[1]?.signal ||
			(urlOrRequest instanceof Request ? urlOrRequest.signal : null);
		const shouldBlockCachedAdSegments = Boolean(
			__TTVAB_STATE__?.CurrentAdMediaKey ||
				__TTVAB_STATE__?.CurrentAdChannel ||
				__TTVAB_STATE__?.SimulatedAdsDepth > 0,
		);
		if (!(__TTVAB_STATE__.AdSegmentCache instanceof Map)) {
			__TTVAB_STATE__.AdSegmentCache = new Map();
		}

		if (!isM3U8) {
			if (_isEmptyAdHoldSegmentUrl(urlStr)) {
				return realFetch(_EMPTY_SEGMENT_URL);
			}
			if (
				_isKnownAdSegmentUrl(urlStr, {
					includeCached: shouldBlockCachedAdSegments,
				})
			) {
				throw _createCodecHandoffAbortError(fallbackRequestSignal);
			}
			return realFetch.apply(this, args);
		}

		try {
			const response = await realFetch.apply(this, args);
			if (shouldPassThrough()) return response;
			if (response.status !== 200) return response;

			const cloned = response.clone();
			const text = await cloned.text();
			if (shouldPassThrough()) return response;
			_rememberPageSideVariantCodecs(text, urlStr);
			const getEmptyHoldInfo = () => {
				let emptyHoldInfo = _pageSideEmptyHoldInfoByUrl.get(urlStr) || null;
				if (!emptyHoldInfo) {
					emptyHoldInfo = {
						MediaKey: __TTVAB_STATE__?.PageMediaKey || urlStr,
						_EmptyAdHoldMediaSequence: 0,
						NumStrippedAdSegments: 0,
						IsStrippingAdSegments: false,
					};
					_pageSideEmptyHoldInfoByUrl.set(urlStr, emptyHoldInfo);
					while (_pageSideEmptyHoldInfoByUrl.size > 20) {
						const oldest = _pageSideEmptyHoldInfoByUrl.keys().next().value;
						if (oldest === undefined) break;
						_pageSideEmptyHoldInfoByUrl.delete(oldest);
					}
				}
				return emptyHoldInfo;
			};
			const fallbackCodecFamily = _getPlaylistUrlAliases(urlStr)
				.map((alias) => _pageSideVariantCodecByUrl.get(alias))
				.find(Boolean);
			let activeAdMediaKey = _normalizeMediaKey(
				__TTVAB_STATE__?.CurrentAdMediaKey,
			);
			const pageMediaKey = _normalizeMediaKey(__TTVAB_STATE__?.PageMediaKey);
			let ownsActiveAdCycle = Boolean(
				activeAdMediaKey && activeAdMediaKey === pageMediaKey,
			);
			const hasKnownAdMedia =
				typeof _playlistHasKnownAdSegments === "function" &&
				_playlistHasKnownAdSegments(text, {
					includeCached: shouldBlockCachedAdSegments,
				});
			if (!_hasTwitchAdMetadata(text) && !hasKnownAdMedia) {
				if (!ownsActiveAdCycle || text.includes("#EXT-X-STREAM-INF")) {
					return response;
				}
				const emptyHoldInfo = getEmptyHoldInfo();
				if (
					_isPageSideFallbackRecoveryReady(
						urlStr,
						text,
						emptyHoldInfo,
						pageMediaKey,
					) &&
					_completePageSideFallbackAdRecovery(pageMediaKey)
				) {
					return response;
				}
				if (
					!_canServePageSideAvcHold(
						urlStr,
						pageMediaKey,
						__TTVAB_STATE__?.AdPodProgressByMediaKey?.[pageMediaKey]
							?.cycleStartedAt,
					)
				) {
					throw _createCodecHandoffAbortError(fallbackRequestSignal);
				}
				const hold = _createEmptyAdHoldPlaylist(text, emptyHoldInfo);
				_log(
					"Page-side fallback: holding transiently clean native media during active ad",
					"warning",
				);
				return new Response(hold, {
					status: response.status,
					statusText: response.statusText,
					headers: response.headers,
				});
			}
			if (pageMediaKey && !text.includes("#EXT-X-STREAM-INF")) {
				const cycleStartedAt = _ensurePageSideFallbackAdCycle(
					urlStr,
					fallbackCodecFamily,
					text,
				);
				activeAdMediaKey = _normalizeMediaKey(
					__TTVAB_STATE__?.CurrentAdMediaKey,
				);
				ownsActiveAdCycle = Boolean(
					cycleStartedAt > 0 && activeAdMediaKey === pageMediaKey,
				);
				const emptyHoldInfo = getEmptyHoldInfo();
				emptyHoldInfo._PageFallbackCycleStartedAt = cycleStartedAt;
				emptyHoldInfo._PageFallbackCleanStartedAt = 0;
				emptyHoldInfo._PageFallbackCleanPlaylistCount = 0;
				emptyHoldInfo._PageFallbackLastMediaSequence = null;
			}

			const stripped = _stripM3U8Ads(text, getEmptyHoldInfo());
			if (
				stripped.includes(
					"https://www.twitch.tv/__ttvab_empty_hold_segment.mp4",
				) &&
				!_canServePageSideAvcHold(
					urlStr,
					pageMediaKey,
					__TTVAB_STATE__?.AdPodProgressByMediaKey?.[pageMediaKey]
						?.cycleStartedAt,
				)
			) {
				throw _createCodecHandoffAbortError(fallbackRequestSignal);
			}
			if (stripped === text) return response;

			_log("Page-side fallback: stripped ads from M3U8", "info");
			return new Response(stripped, {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
			});
		} catch (error) {
			_log(
				`Page-side M3U8 inspection failed for ${urlStr}: ${error?.message ?? String(error)}`,
				"error",
			);
			throw error;
		}
	};
}

function _rememberPageSideVariantCodecs(text, baseUrl) {
	if (typeof text !== "string" || !text.includes("#EXT-X-STREAM-INF")) {
		return false;
	}
	const lines = text.split("\n");
	let remembered = false;
	for (let i = 0; i < lines.length - 1; i++) {
		if (!lines[i]?.startsWith("#EXT-X-STREAM-INF")) continue;
		const rawUrl = lines[i + 1]?.trim();
		if (!rawUrl || rawUrl.startsWith("#")) continue;
		const codecFamily = _getVideoCodecFamily(_parseAttrs(lines[i]).CODECS);
		if (!codecFamily) continue;
		let variantUrl = rawUrl;
		try {
			variantUrl = new URL(rawUrl, baseUrl).href;
		} catch {}
		for (const alias of _getPlaylistUrlAliases(variantUrl, baseUrl)) {
			_pageSideVariantCodecByUrl.set(alias, codecFamily);
			remembered = true;
		}
	}
	while (_pageSideVariantCodecByUrl.size > 200) {
		const oldest = _pageSideVariantCodecByUrl.keys().next().value;
		if (oldest === undefined) break;
		_pageSideVariantCodecByUrl.delete(oldest);
	}
	return remembered;
}

function _hasTwitchAdMetadata(text) {
	return typeof _hasExplicitAdMetadata === "function"
		? _hasExplicitAdMetadata(text)
		: typeof text === "string" && text.includes("stitched-ad");
}

function _stripM3U8Ads(text, emptyHoldInfo = null) {
	if (!(__TTVAB_STATE__.AdSegmentCache instanceof Map)) {
		__TTVAB_STATE__.AdSegmentCache = new Map();
	}
	const info = emptyHoldInfo || {
		MediaKey: __TTVAB_STATE__?.PageMediaKey || "degraded-page-fallback",
		_EmptyAdHoldMediaSequence: 0,
		NumStrippedAdSegments: 0,
		IsStrippingAdSegments: false,
	};
	return _stripAds(text, false, info);
}

function _hookWorker() {
	_syncStoredDeviceId();
	if (typeof window?.Worker !== "function") {
		return;
	}
	const isAllowedWorkerHost = (hostname) => {
		const host = String(hostname || "").toLowerCase();
		return (
			host === "twitch.tv" ||
			host.endsWith(".twitch.tv") ||
			host === "ttvnw.net" ||
			host.endsWith(".ttvnw.net") ||
			host === "twitchcdn.net" ||
			host.endsWith(".twitchcdn.net")
		);
	};
	const normalizeWorkerUrl = (url) => {
		if (url instanceof URL) return url.href;
		return new URL(String(url), window.location.href).href;
	};
	const isTwitchWorkerUrl = (workerUrl) => {
		const parsed = new URL(workerUrl);
		if (isAllowedWorkerHost(parsed.hostname)) {
			return true;
		}

		if (parsed.protocol === "blob:") {
			const pageHost = window.location.hostname;
			return (
				isAllowedWorkerHost(pageHost) &&
				parsed.origin === window.location.origin
			);
		}

		return false;
	};
	const createHookedWorkerConstructor = (BaseWorker) => {
		const reinsertNames = _getReinsert(BaseWorker);
		const HookedWorker = class Worker extends _cleanWorker(BaseWorker) {
			constructor(url, opts) {
				let isTwitch = false;
				let workerSourceUrl = null;
				try {
					workerSourceUrl = normalizeWorkerUrl(url);
					isTwitch = isTwitchWorkerUrl(workerSourceUrl);
				} catch {
					isTwitch = false;
				}

				if (workerSourceUrl && _trackedExtensionBlobUrls.has(workerSourceUrl)) {
					_log(
						"[Trace] Compatible worker wrapper retained the existing playback hook",
						"info",
					);
					super(url, opts);
					return;
				}

				if (!isTwitch) {
					super(url, opts);
					return;
				}

				const pagePlaybackContext = _syncPagePlaybackContext({
					broadcast: false,
				});
				const seedCurrentAdContext =
					pagePlaybackContext.MediaKey &&
					_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) ===
						pagePlaybackContext.MediaKey;
				const seedLastAdEndContext =
					pagePlaybackContext.MediaKey &&
					_normalizeMediaKey(__TTVAB_STATE__.LastAdEndedMediaKey) ===
						pagePlaybackContext.MediaKey;
				const seedPostAdNativeReloadContext =
					typeof _getPendingPostAdNativeReloadContext === "function"
						? _getPendingPostAdNativeReloadContext(pagePlaybackContext.MediaKey)
						: null;
				const seedPinnedBackupContext =
					pagePlaybackContext.MediaKey &&
					_normalizeMediaKey(__TTVAB_STATE__.PinnedBackupPlayerMediaKey) ===
						pagePlaybackContext.MediaKey;
				const seedAdPodProgress =
					seedCurrentAdContext &&
					pagePlaybackContext.MediaKey &&
					__TTVAB_STATE__.AdPodProgressByMediaKey?.[
						pagePlaybackContext.MediaKey
					]
						? __TTVAB_STATE__.AdPodProgressByMediaKey[
								pagePlaybackContext.MediaKey
							]
						: null;
				const seedCycleStartedAt = Math.max(
					0,
					Number(seedAdPodProgress?.cycleStartedAt) || 0,
				);
				const seedCodecHandoffId =
					typeof __TTVAB_STATE__.ActiveCodecHandoffId === "string"
						? __TTVAB_STATE__.ActiveCodecHandoffId
						: null;
				const seedCodecHandoffContext = Boolean(
					seedCurrentAdContext &&
						pagePlaybackContext.MediaKey &&
						_normalizeMediaKey(__TTVAB_STATE__.ActiveCodecHandoffMediaKey) ===
							pagePlaybackContext.MediaKey &&
						seedCycleStartedAt > 0 &&
						_getCodecHandoffCycleStartedAt(seedCodecHandoffId) ===
							seedCycleStartedAt,
				);
				const seedPlaybackCodecEntries = Array.from(
					_pageSideVariantCodecByUrl.entries(),
				)
					.filter(
						([playlistUrl, codec]) =>
							typeof playlistUrl === "string" &&
							playlistUrl &&
							_getVideoCodecFamily(codec),
					)
					.slice(-40);

				const inlinedWorkerSource =
					opts?.type !== "module" && workerSourceUrl.startsWith("blob:")
						? _readBlobUrlSync(workerSourceUrl)
						: null;

				const originalWorkerLoadCode =
					inlinedWorkerSource ||
					(opts?.type === "module"
						? `await import(${JSON.stringify(workerSourceUrl)});`
						: `importScripts(${JSON.stringify(workerSourceUrl)});`);

				const injectedCode = `
            (function() {
                const _C = ${JSON.stringify(_C)};
                const _S = ${JSON.stringify({ ..._S, workers: [] })};
                const _ATTR_REGEX = ${_ATTR_REGEX.toString()};
                const _AD_METADATA_RE = ${_AD_METADATA_RE.toString()};
                const _EMPTY_SEGMENT_URL = ${JSON.stringify(_EMPTY_SEGMENT_URL)};
                const _RESERVED_ROUTE_SEGMENTS = new Set(${JSON.stringify(Array.from(_RESERVED_ROUTE_SEGMENTS))});
                const _pageSideVariantCodecByUrl = new Map(${JSON.stringify(seedPlaybackCodecEntries)});
				${_formatLogText.toString()}
                ${_log.toString()}
                ${_createWorkerBridgeMessage.toString()}
                ${_getWorkerBridgeMessage.toString()}
                ${_postWorkerBridgeMessage.toString()}
                ${_declareState.toString()}
                ${_mergeAdPodProgress.toString()}
                ${_invalidateAdCycleAsyncWork.toString()}
                ${_applyAdPodProgressToInfo.toString()}
                ${_clearAdPodProgress.toString()}
                ${_getPageScopedPlaybackEventContext.toString()}
                ${_createPageScopedWorkerEvent.toString()}
                ${_incrementAdsBlocked.toString()}
                ${_normalizeChannelName.toString()}
                ${_normalizeVodID.toString()}
                ${_buildMediaKey.toString()}
                ${_normalizeMediaKey.toString()}
                ${_normalizePlaybackContext.toString()}
                ${_getPlaybackContextFromUrl.toString()}
                ${_getPlaybackContextFromUsherUrl.toString()}
                ${_parseAttrs.toString()}
                ${_getServerTime.toString()}
                ${_replaceServerTime.toString()}
                ${_hasExplicitAdMetadata.toString()}
                ${_isExplicitKnownAdSegmentUrl.toString()}
                ${_isKnownAdSegmentUrl.toString()}
                ${_getTaggedPlaylistUri.toString()}
                ${_isMediaPartLine.toString()}
                ${_isPartPreloadHintLine.toString()}
                ${_playlistLinesHaveKnownAdSegments.toString()}
                ${_playlistHasKnownAdSegments.toString()}
                ${_absolutizePlaylistUrl.toString()}
                ${_absolutizeMediaPlaylistUrls.toString()}
                ${_createEmptyAdHoldPlaylist.toString()}
                ${_isEmptyAdHoldSegmentUrl.toString()}
                ${_stripAds.toString()}
                ${_extractPlaylistHeaders.toString()}
                ${_getStreamVariantInfo.toString()}
                ${_getStreamUrl.toString()}
                ${_getSortedResolutionList.toString()}
                ${_getResolutionByQualityGroup.toString()}
                ${_getFallbackResolution.toString()}
                ${_applyBackupResolutionFloor.toString()}
                ${_isHevcCodecString.toString()}
                ${_isEnhancedCodecString.toString()}
                ${_degradeToDecodableResolution.toString()}
                ${_shouldAvoidHevcBackupVariants.toString()}
                ${_dropEnhancedVariantLines.toString()}
                ${_stripHevcBackupVariants.toString()}
                ${_resolvePreferredBackupResolution.toString()}
                ${_getPlaylistUrlAliases.toString()}
                ${_getExactPlaylistUrlKey.toString()}
                ${_getDirectPlaybackResolutionForUrl.toString()}
                ${_getVideoCodecFamily.toString()}
                ${_getVideoCodecIdentity.toString()}
                ${_getBackupVariantCodecFamily.toString()}
                ${_getBackupVariantCodecIdentity.toString()}
                ${_getBackupVariantResolution.toString()}
                ${_setBackupVariantResolution.toString()}
                ${_rememberBackupPlaylistMetadata.toString()}
                ${_rememberSegmentCodecOwnership.toString()}
                ${_isLastCleanNativeForRequest.toString()}
                ${_getSameRequestCleanNative.toString()}
                ${_collectPlaybackAccessTokenSources.toString()}
                ${_summarizePlaybackAccessTokenPayload.toString()}
                ${_getPlaybackAccessTokenErrors.toString()}
                ${_extractPlaybackAccessToken.toString()}
                ${_isWorkerContext.toString()}
                ${_createFetchRelayResponse.toString()}
                ${_fetchViaWorkerBridge.toString()}
                ${_getToken.toString()}
                ${_notifyAdComplete.toString()}
                ${_recordAdDurations.toString()}
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
                ${_getRecentCleanBackupPlayerTypeForInfo.toString()}
                ${_getOrderedBackupPlayerTypes.toString()}
                ${_resolvePlaybackResolutionForUrl.toString()}
                ${_resolveAdBackupTargetResolution.toString()}
				${_getPendingForegroundQualityProbeAt.toString()}
				${_startForegroundQualityProbe.toString()}
				${_recordSustainedNativeResolution.toString()}
					${_resetNativeRecoveryCandidateState.toString()}
					${_isExactNativeRecoveryCandidateOwned.toString()}
					${_advanceExactNativeRecoveryCandidate.toString()}
				${_isAdEndStable.toString()}
				${_serveBounceDebouncedPlaylist.toString()}
				${_resetNativeRecoveryReadyState.toString()}
				${_invalidateNativeRecoveryAfterPlayerReload.toString()}
                ${_markNativeRecoveryProbeFailed.toString()}
                ${_markNativeRecoveryReady.toString()}
                ${_clearCodecHandoffState.toString()}
                ${_markCodecHandoffReloadFailed.toString()}
				${_getActiveCodecHandoffIdForInfo.toString()}
				${_resetStreamAdState.toString()}
				${_resetWorkerAdCycleState.toString()}
				${_shouldReloadNativePlayerAfterAdReset.toString()}
                ${_getStreamInfoForPlaylist.toString()}
                ${_getSyntheticPlaybackContextForPlaylist.toString()}
                ${_createStreamInfo.toString()}
                ${_createSyntheticStreamInfo.toString()}
                ${_buildUsherPlaybackUrl.toString()}
                ${_createCodecHandoffId.toString()}
                ${_getCodecHandoffCycleStartedAt.toString()}
                ${_getCurrentAdBreakStartedAt.toString()}
                ${_isCodecHandoffCycleCurrent.toString()}
                ${_isPageLifecycleCycleCurrent.toString()}
                ${_isCodecHandoffAdRecoveryActive.toString()}
                ${_requestCodecHandoffReload.toString()}
                ${_prepareFatalMediaRecovery.toString()}
                ${_createCodecHandoffAbortError.toString()}
                ${_assertM3U8RequestContextCurrent.toString()}
                ${_awaitM3U8RequestContext.toString()}
                ${_waitForAbortableDelay.toString()}
                ${_awaitWithRequestSignal.toString()}
                ${_holdRetiringCodecRequest.toString()}
                ${_hasPlaylistAdMarkers.toString()}
                ${_playlistHasMediaSegments.toString()}
                ${_parsePlaylistFirstMediaSequence.toString()}
                ${_parsePlaylistDiscontinuitySequence.toString()}
                ${_setPlaylistDiscontinuitySequence.toString()}
                ${_insertBoundaryDiscontinuity.toString()}
                ${_applyBackupSpliceBridge.toString()}
                ${_getNativeRecoveryProbePlayerType.toString()}
                ${_canReloadNativePlayerAfterAd.toString()}
                ${_getFallbackPromotionPolicy.toString()}
                ${_fetchWithTimeout.toString()}
                ${_awaitBackupProbeBeforeDeadline.toString()}
                ${_isBackupSearchContextCurrent.toString()}
                ${_processM3U8Core.toString()}
                ${_processM3U8.toString()}
                ${_getResolvedLqHqHoldMinMs.toString()}
                ${_shouldTryAutoplayFirst.toString()}
                ${_shouldHoldAutoplayBackupDuringAd.toString()}
                ${_shouldBridgeHeldAutoplayDuringSearch.toString()}
                ${_getBackupBridgeMaxVariantHeight.toString()}
                ${_shouldHoldBridgeInsteadOfRotating.toString()}
                ${_refreshHeldAutoplayBackupPlaylist.toString()}
                ${_refreshActiveBackupMediaPlaylist.toString()}
                ${_searchBackupStream.toString()}
                ${_findBackupStream.toString()}
                ${_hookWorkerFetch.toString()}
                
                const _GQL_URL = '${_GQL_URL}';
                _declareState(self);
                __TTVAB_STATE__.GQLDeviceID = ${JSON.stringify(__TTVAB_STATE__.GQLDeviceID)};
                __TTVAB_STATE__.AuthorizationHeader = ${JSON.stringify(__TTVAB_STATE__.AuthorizationHeader)};
                __TTVAB_STATE__.ClientIntegrityHeader = ${JSON.stringify(__TTVAB_STATE__.ClientIntegrityHeader)};
                __TTVAB_STATE__.ClientVersion = ${JSON.stringify(__TTVAB_STATE__.ClientVersion)};
                __TTVAB_STATE__.ClientSession = ${JSON.stringify(__TTVAB_STATE__.ClientSession)};
                __TTVAB_STATE__.PlaybackAccessTokenHash = ${JSON.stringify(__TTVAB_STATE__.PlaybackAccessTokenHash)};
                __TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType = ${JSON.stringify(__TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType)};
                __TTVAB_STATE__.CurrentAdChannel = ${JSON.stringify(seedCurrentAdContext ? __TTVAB_STATE__.CurrentAdChannel : null)};
                __TTVAB_STATE__.CurrentAdMediaKey = ${JSON.stringify(seedCurrentAdContext ? __TTVAB_STATE__.CurrentAdMediaKey : null)};
                __TTVAB_STATE__.AdPodProgressByMediaKey = ${JSON.stringify(seedAdPodProgress && pagePlaybackContext.MediaKey ? { [pagePlaybackContext.MediaKey]: seedAdPodProgress } : {})};
                __TTVAB_STATE__.LastAdEndedAt = ${JSON.stringify(seedLastAdEndContext ? __TTVAB_STATE__.LastAdEndedAt : 0)};
                __TTVAB_STATE__.LastAdEndedChannel = ${JSON.stringify(seedLastAdEndContext ? __TTVAB_STATE__.LastAdEndedChannel : null)};
                __TTVAB_STATE__.LastAdEndedMediaKey = ${JSON.stringify(seedLastAdEndContext ? __TTVAB_STATE__.LastAdEndedMediaKey : null)};
                __TTVAB_STATE__.LastAdEndedCycleStartedAt = ${JSON.stringify(seedLastAdEndContext ? __TTVAB_STATE__.LastAdEndedCycleStartedAt : 0)};
                __TTVAB_STATE__.PinnedBackupPlayerType = ${JSON.stringify(seedPinnedBackupContext ? __TTVAB_STATE__.PinnedBackupPlayerType : null)};
                __TTVAB_STATE__.PinnedBackupPlayerChannel = ${JSON.stringify(seedPinnedBackupContext ? __TTVAB_STATE__.PinnedBackupPlayerChannel : null)};
                __TTVAB_STATE__.PinnedBackupPlayerMediaKey = ${JSON.stringify(seedPinnedBackupContext ? __TTVAB_STATE__.PinnedBackupPlayerMediaKey : null)};
                __TTVAB_STATE__.ActiveCodecHandoffId = ${JSON.stringify(seedCodecHandoffContext ? __TTVAB_STATE__.ActiveCodecHandoffId : null)};
                __TTVAB_STATE__.ActiveCodecHandoffChannel = ${JSON.stringify(seedCodecHandoffContext ? __TTVAB_STATE__.ActiveCodecHandoffChannel : null)};
                __TTVAB_STATE__.ActiveCodecHandoffMediaKey = ${JSON.stringify(seedCodecHandoffContext ? __TTVAB_STATE__.ActiveCodecHandoffMediaKey : null)};
                __TTVAB_STATE__.IsAdStrippingEnabled = ${JSON.stringify(__TTVAB_STATE__.IsAdStrippingEnabled)};
                __TTVAB_STATE__.DisableAdSpoofing = ${JSON.stringify(__TTVAB_STATE__.DisableAdSpoofing)};
                __TTVAB_STATE__.DisableAutoplayBackup = ${JSON.stringify(__TTVAB_STATE__.DisableAutoplayBackup)};
                __TTVAB_STATE__.PageMediaType = ${JSON.stringify(pagePlaybackContext.MediaType)};
                __TTVAB_STATE__.PageChannel = ${JSON.stringify(pagePlaybackContext.ChannelName)};
                __TTVAB_STATE__.PageVodID = ${JSON.stringify(pagePlaybackContext.VodID)};
                __TTVAB_STATE__.PageMediaKey = ${JSON.stringify(pagePlaybackContext.MediaKey)};
                __TTVAB_STATE__.PagePlaybackVisibleSinceAt = ${JSON.stringify(__TTVAB_STATE__.PagePlaybackVisibleSinceAt)};
                __TTVAB_STATE__.PreferredQualityGroup = ${JSON.stringify(__TTVAB_STATE__.PreferredQualityGroup)};
                __TTVAB_STATE__.PlayerHasPlayedOnce = ${JSON.stringify(__TTVAB_STATE__.PlayerHasPlayedOnce)};
                __TTVAB_STATE__.PlayerIsPlaying = ${JSON.stringify(__TTVAB_STATE__.PlayerIsPlaying)};
				__TTVAB_STATE__.HasTriggeredPlayerReload = ${JSON.stringify(Boolean(seedPostAdNativeReloadContext))};
				__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = ${JSON.stringify(seedPostAdNativeReloadContext?.channelName || null)};
				__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = ${JSON.stringify(seedPostAdNativeReloadContext?.mediaKey || null)};
				__TTVAB_STATE__.PendingTriggeredPlayerReloadAt = ${JSON.stringify(Math.max(0, Number(seedPostAdNativeReloadContext?.reloadAt) || 0))};
				__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt = ${JSON.stringify(Math.max(0, Number(seedPostAdNativeReloadContext?.cycleStartedAt) || 0))};

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
                        case 'UpdateToggleState':
                            {
                                const enabled = data.value === true;
                                if (!enabled) {
                                    for (const streamInfo of Object.values(__TTVAB_STATE__.StreamInfos)) {
                                        _resetStreamAdState(streamInfo);
                                    }
                                    __TTVAB_STATE__.CurrentAdChannel = null;
                                    __TTVAB_STATE__.CurrentAdMediaKey = null;
                                    __TTVAB_STATE__.PinnedBackupPlayerType = null;
                                    __TTVAB_STATE__.PinnedBackupPlayerChannel = null;
                                    __TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
                                    __TTVAB_STATE__.ActiveCodecHandoffId = null;
                                    __TTVAB_STATE__.ActiveCodecHandoffChannel = null;
                                    __TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
                                    __TTVAB_STATE__.AdPodProgressByMediaKey = Object.create(null);
                                    __TTVAB_STATE__.LastAdEndedAt = 0;
                                    __TTVAB_STATE__.LastAdEndedChannel = null;
                                    __TTVAB_STATE__.LastAdEndedMediaKey = null;
                                    __TTVAB_STATE__.LastAdEndedCycleStartedAt = 0;
									__TTVAB_STATE__.HasTriggeredPlayerReload = false;
									__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
									__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
									__TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
									__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt = 0;
                                }
                                __TTVAB_STATE__.IsAdStrippingEnabled = enabled;
                            }
                            break;
                        case 'UpdateAdSpoofingState': __TTVAB_STATE__.DisableAdSpoofing = data.value === true; break;
                        case 'UpdateAutoplayBackupState':
                            {
                                const shouldDisableAutoplayBackup = data.value === true;
                                if (__TTVAB_STATE__.DisableAutoplayBackup === shouldDisableAutoplayBackup) {
                                    break;
                                }
                                __TTVAB_STATE__.DisableAutoplayBackup = shouldDisableAutoplayBackup;
                                for (const streamInfo of Object.values(__TTVAB_STATE__.StreamInfos)) {
                                    streamInfo._LastBackupSearchCompletedAt = 0;
                                }
                            }
                            break;
                        case 'UpdateAdsBlocked': _S.adsBlocked = data.value; break;
                        case 'UpdateGQLHash': __TTVAB_STATE__.PlaybackAccessTokenHash = data.value; break;
                        case 'UpdateLastNativePlaybackAccessTokenPlayerType': __TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType = data.value; break;
                        case 'UpdatePlayerHasPlayedOnce': __TTVAB_STATE__.PlayerHasPlayedOnce = data.value === true; break;
                        case 'UpdatePlayerIsPlaying': __TTVAB_STATE__.PlayerIsPlaying = data.value === true; break;
                        case 'Ping': _postWorkerBridgeMessage(self, { key: 'Pong', value: null }); break;
                        case 'UpdatePageContext':
                            {
                                const nextPageContext = _normalizePlaybackContext(data.value);
                                const preservedMediaKey = _normalizeMediaKey(data.value?.preservedMediaKey);
                                if (!preservedMediaKey || __TTVAB_STATE__.PageMediaKey !== preservedMediaKey) {
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
										__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt = 0;
                                    }
                                }
                            }
                            break;
                        case 'UpdatePreferredQualityGroup':
                            __TTVAB_STATE__.PreferredQualityGroup = data.value || null;
                            break;
                        case 'UpdatePagePlaybackVisibleSinceAt':
                            __TTVAB_STATE__.PagePlaybackVisibleSinceAt = Math.max(
                                0,
                                Number(data.value) || 0,
                            );
                            break;
                        case 'UpdateCurrentAdContext':
                            {
                                const nextAdContext = _normalizePlaybackContext(data.value);
                                if (
                                    __TTVAB_STATE__.IsAdStrippingEnabled !== true &&
                                    nextAdContext.MediaKey
                                ) {
                                    break;
                                }
                                __TTVAB_STATE__.CurrentAdChannel = nextAdContext.ChannelName;
                                __TTVAB_STATE__.CurrentAdMediaKey = nextAdContext.MediaKey;
                            }
                            break;
                        case 'UpdateLastAdEndContext':
                            {
                                const lastEndContext = _normalizePlaybackContext(data.value);
                                if (
                                    __TTVAB_STATE__.IsAdStrippingEnabled !== true &&
                                    (lastEndContext.MediaKey || Number(data.value?.endedAt) > 0)
                                ) {
                                    break;
                                }
                                __TTVAB_STATE__.LastAdEndedAt = Math.max(0, Number(data.value?.endedAt) || 0);
                                __TTVAB_STATE__.LastAdEndedChannel = lastEndContext.ChannelName;
                                __TTVAB_STATE__.LastAdEndedMediaKey = lastEndContext.MediaKey;
                                __TTVAB_STATE__.LastAdEndedCycleStartedAt = Math.max(
                                    0,
                                    Number(data.value?.cycleStartedAt) || 0,
                                );
                            }
                            break;
                        case 'UpdateAdPodProgress':
                            {
                                if (__TTVAB_STATE__.IsAdStrippingEnabled !== true) {
                                    break;
                                }
                                const progressContext = _normalizePlaybackContext(data.value);
                                const progressInfo =
                                    (progressContext.MediaKey &&
                                        __TTVAB_STATE__.StreamInfos[progressContext.MediaKey]) ||
                                    null;
                                if (progressInfo) {
                                    _applyAdPodProgressToInfo(progressInfo, data.value);
                                } else {
                                    _mergeAdPodProgress(data.value);
                                }
                            }
                            break;
                        case 'ClearAdPodProgress':
                            _clearAdPodProgress(data.value?.mediaKey);
                            break;
						case 'ResetAdCycleState':
							_resetWorkerAdCycleState(data.value);
							break;
                        case 'UpdatePinnedBackupPlayerContext':
                            {
                                const nextPinnedContext = _normalizePlaybackContext(data.value);
                                const nextPinnedType = data.value?.type || null;
                                if (
                                    __TTVAB_STATE__.IsAdStrippingEnabled !== true &&
                                    (nextPinnedType || nextPinnedContext.MediaKey)
                                ) {
                                    break;
                                }
                                const nextPinnedCycleStartedAt = Math.max(
                                    0,
                                    Number(data.value?.cycleStartedAt) || 0,
                                );
                                const nextPinnedInfo =
                                    (nextPinnedContext.MediaKey &&
                                        __TTVAB_STATE__.StreamInfos[
                                            nextPinnedContext.MediaKey
                                        ]) ||
                                    null;
                                if (
                                    nextPinnedType &&
                                    (
                                        !nextPinnedInfo ||
                                        !_isCodecHandoffCycleCurrent(
                                            nextPinnedContext.MediaKey,
                                            nextPinnedCycleStartedAt,
                                            nextPinnedInfo,
                                        )
                                    )
                                ) {
                                    break;
                                }
                                __TTVAB_STATE__.PinnedBackupPlayerType = nextPinnedType;
                                __TTVAB_STATE__.PinnedBackupPlayerChannel = nextPinnedContext.ChannelName;
                                __TTVAB_STATE__.PinnedBackupPlayerMediaKey = nextPinnedContext.MediaKey;
                            }
                            break;
                        case 'PrepareFatalMediaRecovery':
                            if (__TTVAB_STATE__.IsAdStrippingEnabled !== true) {
                                break;
                            }
                            if (
                                typeof __TTVAB_STATE__.PrepareFatalMediaRecovery === "function"
                            ) {
                                void __TTVAB_STATE__.PrepareFatalMediaRecovery(data.value);
                            }
                            break;
                        case 'UpdateCodecHandoffContext':
                            {
                                const nextCodecHandoffContext = _normalizePlaybackContext(data.value);
                                const nextHandoffId =
                                    typeof data.value?.handoffId === "string" &&
                                    data.value.handoffId
                                        ? data.value.handoffId
                                        : null;
                                if (
                                    __TTVAB_STATE__.IsAdStrippingEnabled !== true &&
                                    nextHandoffId
                                ) {
                                    break;
                                }
                                const clearHandoffId =
                                    typeof data.value?.clearHandoffId === "string" &&
                                    data.value.clearHandoffId
                                        ? data.value.clearHandoffId
                                        : null;
                                if (clearHandoffId) {
                                    for (const streamInfo of Object.values(__TTVAB_STATE__.StreamInfos)) {
                                        if (
                                            nextCodecHandoffContext.MediaKey &&
                                            _normalizeMediaKey(streamInfo?.MediaKey) !==
                                                nextCodecHandoffContext.MediaKey
                                        ) {
                                            continue;
                                        }
                                        _clearCodecHandoffState(streamInfo, clearHandoffId);
                                    }
                                    if (__TTVAB_STATE__.ActiveCodecHandoffId === clearHandoffId) {
                                        __TTVAB_STATE__.ActiveCodecHandoffId = null;
                                        __TTVAB_STATE__.ActiveCodecHandoffChannel = null;
                                        __TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
                                    }
                                    break;
                                }
                                if (!nextHandoffId) {
                                    break;
                                }
                                const nextCycleStartedAt = Math.max(
                                    0,
                                    Number(data.value?.cycleStartedAt) || 0,
                                );
                                const encodedCycleStartedAt =
                                    _getCodecHandoffCycleStartedAt(nextHandoffId);
                                const currentAdMediaKey = _normalizeMediaKey(
                                    __TTVAB_STATE__.CurrentAdMediaKey
                                );
                                const currentAdChannel = _normalizeChannelName(
                                    __TTVAB_STATE__.CurrentAdChannel
                                );
                                if (
                                    !nextCodecHandoffContext.MediaKey ||
                                    nextCycleStartedAt <= 0 ||
                                    encodedCycleStartedAt !== nextCycleStartedAt ||
                                    currentAdMediaKey !== nextCodecHandoffContext.MediaKey ||
                                    (
                                        currentAdChannel &&
                                        nextCodecHandoffContext.ChannelName &&
                                        currentAdChannel !== nextCodecHandoffContext.ChannelName
                                    )
                                ) {
                                    break;
                                }
                                const nextHandoffInfo =
                                    __TTVAB_STATE__.StreamInfos[
                                        nextCodecHandoffContext.MediaKey
                                    ] || null;
                                if (
                                    !nextHandoffInfo ||
                                    !_isCodecHandoffCycleCurrent(
                                        nextCodecHandoffContext.MediaKey,
                                        nextCycleStartedAt,
                                        nextHandoffInfo,
                                    )
                                ) {
                                    break;
                                }
                                for (const streamInfo of Object.values(__TTVAB_STATE__.StreamInfos)) {
                                    if (
                                        nextCodecHandoffContext.MediaKey &&
                                        _normalizeMediaKey(streamInfo?.MediaKey) !==
                                            nextCodecHandoffContext.MediaKey
                                    ) {
                                        continue;
                                    }
                                    if (
                                        !nextCodecHandoffContext.MediaKey &&
                                        nextCodecHandoffContext.ChannelName &&
                                        _normalizeChannelName(streamInfo?.ChannelName) !==
                                            nextCodecHandoffContext.ChannelName
                                    ) {
                                        continue;
                                    }
                                    if (
                                        !_isCodecHandoffCycleCurrent(
                                            streamInfo.MediaKey,
                                            nextCycleStartedAt,
                                            streamInfo,
                                        )
                                    ) {
                                        continue;
                                    }
                                    if (streamInfo._CodecHandoffPendingId !== nextHandoffId) {
                                        streamInfo._CodecHandoffPendingId = nextHandoffId;
                                        streamInfo._CodecHandoffAcknowledgedId = null;
                                        streamInfo._CodecHandoffFailedId = null;
                                    }
                                    if (
                                        streamInfo.ModifiedM3U8 &&
                                        __TTVAB_STATE__.IsAdStrippingEnabled === true
                                    ) {
                                        streamInfo.IsUsingModifiedM3U8 = true;
                                    }
                                }
                                __TTVAB_STATE__.ActiveCodecHandoffId = nextHandoffId;
                                __TTVAB_STATE__.ActiveCodecHandoffChannel =
                                    nextCodecHandoffContext.ChannelName;
                                __TTVAB_STATE__.ActiveCodecHandoffMediaKey =
                                    nextCodecHandoffContext.MediaKey;
                            }
                            break;
                        case 'CodecHandoffReloadFailed':
                            {
                                const failedHandoffId =
                                    typeof data.value?.handoffId === "string"
                                        ? data.value.handoffId
                                        : null;
                                if (!failedHandoffId) break;
                                const failedContext = _normalizePlaybackContext(data.value);
                                const failedInfo =
                                    (failedContext.MediaKey &&
                                        __TTVAB_STATE__.StreamInfos[failedContext.MediaKey]) ||
                                    null;
                                _markCodecHandoffReloadFailed(failedInfo, failedHandoffId);
                                if (__TTVAB_STATE__.ActiveCodecHandoffId === failedHandoffId) {
                                    __TTVAB_STATE__.ActiveCodecHandoffId = null;
                                    __TTVAB_STATE__.ActiveCodecHandoffChannel = null;
                                    __TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
                                }
                            }
                            break;
                        case 'UpdateBackupSearchForceRefresh':
                            __TTVAB_STATE__.BackupSearchForceRefreshAt =
                                __TTVAB_STATE__.IsAdStrippingEnabled === true
                                    ? Number(data.value) || 0
                                    : 0;
                            break;
                        case 'ResetPlaybackRecoveryState':
                            {
                                const preservedMediaKey = _normalizeMediaKey(data.value?.preservedMediaKey);
                                const isPreservedContext = preservedMediaKey && __TTVAB_STATE__.PageMediaKey === preservedMediaKey;
                                if (!isPreservedContext) {
                                    __TTVAB_STATE__.HasTriggeredPlayerReload = false;
                                    __TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
                                    __TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
                                    __TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
									__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt = 0;
                                    __TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
                                    __TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
                                    __TTVAB_STATE__.ShouldResumeAfterAd = false;
                                    __TTVAB_STATE__.ShouldResumeAfterAdChannel = null;
                                    __TTVAB_STATE__.ShouldResumeAfterAdMediaKey = null;
                                    __TTVAB_STATE__.ShouldResumeAfterAdUntil = 0;
                                    if (data.value?.clearAdContext) {
                                        for (const streamInfo of Object.values(__TTVAB_STATE__.StreamInfos)) {
                                            _clearCodecHandoffState(streamInfo);
                                        }
                                        __TTVAB_STATE__.CurrentAdChannel = null;
                                        __TTVAB_STATE__.CurrentAdMediaKey = null;
                                        __TTVAB_STATE__.PinnedBackupPlayerType = null;
                                        __TTVAB_STATE__.PinnedBackupPlayerChannel = null;
                                        __TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
                                        __TTVAB_STATE__.ActiveCodecHandoffId = null;
                                        __TTVAB_STATE__.ActiveCodecHandoffChannel = null;
                                        __TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
                                        __TTVAB_STATE__.LastAdEndedAt = 0;
                                        __TTVAB_STATE__.LastAdEndedChannel = null;
                                        __TTVAB_STATE__.LastAdEndedMediaKey = null;
                                        __TTVAB_STATE__.LastAdEndedCycleStartedAt = 0;
                                    }
                                }
                                const prevMediaKey = data.value?.previousMediaKey || null;
                                if (prevMediaKey && prevMediaKey !== preservedMediaKey) {
                                    _clearAdPodProgress(prevMediaKey);
                                }
                                if (prevMediaKey && prevMediaKey !== preservedMediaKey && typeof __TTVAB_STATE__.StreamInfos === "object") {
                                    delete __TTVAB_STATE__.StreamInfos[prevMediaKey];
                                }
                                if (prevMediaKey && prevMediaKey !== preservedMediaKey && typeof __TTVAB_STATE__.StreamInfosByUrl === "object") {
                                    for (const u in __TTVAB_STATE__.StreamInfosByUrl) {
                                        if (__TTVAB_STATE__.StreamInfosByUrl[u]?.MediaKey === prevMediaKey) {
                                            delete __TTVAB_STATE__.StreamInfosByUrl[u];
                                        }
                                    }
                                }
                            }
                            break;
                        case 'ReleasePlaybackContext':
                            {
                                const releasedContext = _normalizePlaybackContext(data.value);
                                const releasedMediaKey = releasedContext.MediaKey;
                                _clearAdPodProgress(releasedMediaKey);
                                if (releasedMediaKey && typeof __TTVAB_STATE__.StreamInfos === "object") {
                                    delete __TTVAB_STATE__.StreamInfos[releasedMediaKey];
                                }
                                if (releasedMediaKey && typeof __TTVAB_STATE__.StreamInfosByUrl === "object") {
                                    for (const u in __TTVAB_STATE__.StreamInfosByUrl) {
                                        if (__TTVAB_STATE__.StreamInfosByUrl[u]?.MediaKey === releasedMediaKey) {
                                            delete __TTVAB_STATE__.StreamInfosByUrl[u];
                                        }
                                    }
                                }
                                if (__TTVAB_STATE__.PageMediaKey === releasedMediaKey) {
                                    __TTVAB_STATE__.PageMediaType = null;
                                    __TTVAB_STATE__.PageChannel = null;
                                    __TTVAB_STATE__.PageVodID = null;
                                    __TTVAB_STATE__.PageMediaKey = null;
                                    __TTVAB_STATE__.CurrentAdChannel = null;
                                    __TTVAB_STATE__.CurrentAdMediaKey = null;
                                    __TTVAB_STATE__.PinnedBackupPlayerType = null;
                                    __TTVAB_STATE__.PinnedBackupPlayerChannel = null;
                                    __TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
                                    __TTVAB_STATE__.ActiveCodecHandoffId = null;
                                    __TTVAB_STATE__.ActiveCodecHandoffChannel = null;
                                    __TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
                                    __TTVAB_STATE__.ShouldResumeAfterAd = false;
                                    __TTVAB_STATE__.ShouldResumeAfterAdChannel = null;
                                    __TTVAB_STATE__.ShouldResumeAfterAdMediaKey = null;
                                    __TTVAB_STATE__.ShouldResumeAfterAdUntil = 0;
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
								const handoffId =
									data.value?.reason === "codec-handoff" &&
									typeof data.value?.handoffId === "string"
										? data.value.handoffId
										: null;
								const handoffCycleStartedAt = Math.max(
									0,
									Number(data.value?.cycleStartedAt) || 0,
								);
								const reloadAt = Math.max(
									0,
									Number(data.value?.reloadAt) || 0,
								);
								const handoffInfo =
									(reloadContext.MediaKey &&
										__TTVAB_STATE__.StreamInfos[reloadContext.MediaKey]) ||
                                    Object.values(__TTVAB_STATE__.StreamInfos).find(
                                        (entry) =>
                                            entry?.MediaKey === reloadContext.MediaKey ||
                                            (!reloadContext.MediaKey &&
                                                entry?.ChannelName === reloadContext.ChannelName),
                                    ) ||
                                    null;
								const handoffOwnsCurrentAd = Boolean(
									handoffId &&
										handoffCycleStartedAt > 0 &&
										_getCodecHandoffCycleStartedAt(handoffId) ===
											handoffCycleStartedAt &&
										reloadContext.MediaKey &&
										handoffInfo &&
										_isCodecHandoffCycleCurrent(
											reloadContext.MediaKey,
											handoffCycleStartedAt,
											handoffInfo,
										) &&
										(!_normalizeChannelName(
											__TTVAB_STATE__.CurrentAdChannel,
										) ||
											!reloadContext.ChannelName ||
											_normalizeChannelName(
												__TTVAB_STATE__.CurrentAdChannel,
											) === reloadContext.ChannelName),
								);
								if (handoffId && !handoffOwnsCurrentAd) {
									break;
								}
								if (
									!handoffId &&
									handoffCycleStartedAt > 0 &&
									!_isPageLifecycleCycleCurrent(
										reloadContext.MediaKey,
										handoffCycleStartedAt,
									)
								) {
									break;
								}
								if (handoffOwnsCurrentAd) {
									__TTVAB_STATE__.ActiveCodecHandoffId = handoffId;
									__TTVAB_STATE__.ActiveCodecHandoffChannel =
										reloadContext.ChannelName;
									__TTVAB_STATE__.ActiveCodecHandoffMediaKey =
										reloadContext.MediaKey;
								}
									if (
										handoffOwnsCurrentAd &&
									handoffInfo?._CodecHandoffPendingId === handoffId
								) {
										handoffInfo._CodecHandoffAcknowledgedId = handoffId;
									}
									const repeatsPendingReload = Boolean(
										reloadAt > 0 &&
											_normalizeMediaKey(
												__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey,
											) === reloadContext.MediaKey &&
											Math.max(
												0,
												Number(
													__TTVAB_STATE__.PendingTriggeredPlayerReloadAt,
												) || 0,
											) === reloadAt &&
											Math.max(
												0,
												Number(
													__TTVAB_STATE__
														.PendingTriggeredPlayerReloadCycleStartedAt,
												) || 0,
											) === handoffCycleStartedAt,
									);
									if (handoffInfo && !repeatsPendingReload) {
										_invalidateNativeRecoveryAfterPlayerReload(
											handoffInfo,
											true,
										);
									}
									__TTVAB_STATE__.HasTriggeredPlayerReload = true;
                                __TTVAB_STATE__.PendingTriggeredPlayerReloadChannel =
                                    reloadContext.ChannelName;
                                __TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey =
                                    reloadContext.MediaKey;
								__TTVAB_STATE__.PendingTriggeredPlayerReloadAt =
									reloadAt || Date.now();
								__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt =
									handoffCycleStartedAt;
                            }
                            break;
                        default:
                            break;
                    }
                });
                
                _hookWorkerFetch();
            })();

            ${originalWorkerLoadCode}
            `;

				const blobUrl = URL.createObjectURL(
					new Blob([injectedCode], { type: "text/javascript" }),
				);
				_trackedExtensionBlobUrls.add(blobUrl);
				super(blobUrl, opts);
				setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);

				let _hbTimeout: ReturnType<typeof setTimeout> | null = null;
				const _hbCheck = () => {
					_hbTimeout = null;
					if (this.__TTVABCrashed || this.__TTVABIntentionallyTerminated)
						return;
					if (this.__TTVABFirstPongAt) return;
					_installPageSideM3U8Override();
					if (_isWorkerLifecycleThrottled()) {
						_hbTimeout = setTimeout(_hbCheck, HW_INITIAL_PONG_TIMEOUT_MS);
						return;
					}
					_recoverCrashedWorker(
						this,
						pagePlaybackContext,
						"Worker heartbeat missed — blob: injection likely failed; installing page-side M3U8 fallback",
						"warning",
					);
				};
				_hbTimeout = setTimeout(_hbCheck, HW_INITIAL_PONG_TIMEOUT_MS);
				this.addEventListener("message", (e) => {
					const data = _getWorkerBridgeMessage(e.data);
					if (data?.key === "Pong") {
						if (_hbTimeout !== null) {
							clearTimeout(_hbTimeout);
							_hbTimeout = null;
						}
						_markWorkerPong(this);
					}
				});
				try {
					_postWorkerBridgeMessage(this, { key: "Ping", value: null });
				} catch {}

				const getCurrentPageContext = () =>
					_getPlaybackContextFromUrl(window.location.href);
				const normalizeMessagePlaybackContext = (message) =>
					_normalizePlaybackContext({
						MediaKey: message?.mediaKey || message?.pageMediaKey || null,
						ChannelName: message?.channel || message?.pageChannel || null,
						VodID: message?.vodID || null,
					});
				const isPlaybackContextMismatch = (expectedContext, currentContext) => {
					const normalizedExpectedContext =
						_normalizePlaybackContext(expectedContext);
					const normalizedCurrentContext =
						_normalizePlaybackContext(currentContext);
					if (normalizedExpectedContext.MediaKey) {
						return (
							normalizedCurrentContext.MediaKey !==
							normalizedExpectedContext.MediaKey
						);
					}
					if (normalizedExpectedContext.ChannelName) {
						return (
							normalizedCurrentContext.ChannelName !==
							normalizedExpectedContext.ChannelName
						);
					}
					return false;
				};
				const isStalePlaybackEvent = (message) => {
					const messageContext = normalizeMessagePlaybackContext(message);
					if (
						typeof _isActivePictureInPicturePlaybackContext === "function" &&
						_isActivePictureInPicturePlaybackContext(messageContext)
					) {
						return false;
					}
					return isPlaybackContextMismatch(
						messageContext,
						getCurrentPageContext(),
					);
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
						const body = await response.text();
						clearTimeout(timeoutId);
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
					} catch (error) {
						clearTimeout(timeoutId);
						return {
							id: fetchRequest?.id || null,
							error:
								error?.name === "AbortError"
									? "fetch relay timeout"
									: error?.message || String(error),
						};
					}
				};

				this.addEventListener("message", (e) => {
					const data = _getWorkerBridgeMessage(e.data);
					if (!data) return;
					e.stopImmediatePropagation?.();
					if (this.__TTVABIntentionallyTerminated && !this.__TTVABCrashed) {
						return;
					}
					if (_isWorkerGenerationRetired(this, pagePlaybackContext)) {
						return;
					}
					if (
						this.__TTVABCrashed &&
						!_canHandleCrashedWorkerMessage(
							data,
							this,
							pagePlaybackContext,
							getCurrentPageContext(),
						)
					) {
						return;
					}
					if (__TTVAB_STATE__.IsAdStrippingEnabled !== true) {
						if (
							data.key === "AdEnded" ||
							data.key === "NativePlaybackRestored"
						) {
							_clearAdPodProgress(data.mediaKey);
							if (
								typeof _clearPlaybackRecoveryTimeoutsForContext === "function"
							) {
								_clearPlaybackRecoveryTimeoutsForContext(data.mediaKey);
							}
							if (typeof _clearAdResumeIntent === "function") {
								_clearAdResumeIntent();
							}
							if (typeof _clearSuppressedMediaTracking === "function") {
								_clearSuppressedMediaTracking({ restoreConnected: true });
							}
							return;
						}
						if (
							data.key === "MediaBootstrapRecoveryNeeded" ||
							data.key === "AdDetected" ||
							data.key === "AdPodProgress" ||
							data.key === "BackupPlayerTypeSelected" ||
							data.key === "FatalMediaRecoveryReady" ||
							data.key === "PostAdNativeReloadReady" ||
							data.key === "PauseResumePlayer" ||
							data.key === "ReloadPlayer"
						) {
							return;
						}
					}

					switch (data.key) {
						case "MediaBootstrapRecoveryNeeded":
							_handleMediaBootstrapRecoveryRequest(
								this,
								data,
								pagePlaybackContext,
								getCurrentPageContext(),
							);
							break;
						case "PlaybackWorkerObserved": {
							const observedContext = _normalizePlaybackContext({
								MediaType: data.mediaType,
								ChannelName: data.channel,
								VodID: data.vodID,
								MediaKey: data.mediaKey,
							});
							const workerContext = _getWorkerPlaybackContext(
								this,
								pagePlaybackContext,
							);
							const observationMatchesWorkerContext = Boolean(
								observedContext.MediaKey &&
									!_isPlaybackContextMismatch(workerContext, observedContext),
							);
							const observationMatchesActivePip = Boolean(
								observedContext.MediaKey &&
									typeof _isActivePictureInPicturePlaybackContext ===
										"function" &&
									_isActivePictureInPicturePlaybackContext(observedContext),
							);
							if (
								!observationMatchesWorkerContext &&
								!observationMatchesActivePip
							) {
								break;
							}
							_rememberPageSidePlaybackOwner(
								observedContext.MediaKey,
								data.playlistUrl,
								data.codec,
								0,
								{
									confirmedPlayback: true,
									workerGeneration: this.__TTVABGeneration,
									handoffId: data.handoffId,
									decoderCodec: data.decoderCodec,
								},
							);
							if (!(this.__TTVABPlaybackObservedAtByMediaKey instanceof Map)) {
								this.__TTVABPlaybackObservedAtByMediaKey = new Map();
							}
							this.__TTVABPlaybackObservedAtByMediaKey.delete(
								observedContext.MediaKey,
							);
							this.__TTVABPlaybackObservedAtByMediaKey.set(
								observedContext.MediaKey,
								Date.now(),
							);
							while (this.__TTVABPlaybackObservedAtByMediaKey.size > 8) {
								const oldestMediaKey = this.__TTVABPlaybackObservedAtByMediaKey
									.keys()
									.next().value;
								if (oldestMediaKey === undefined) break;
								this.__TTVABPlaybackObservedAtByMediaKey.delete(oldestMediaKey);
							}
							if (observationMatchesWorkerContext || !workerContext.MediaKey) {
								_rememberWorkerPageContext(this, observedContext);
							}
							_promoteWorkerPlaybackOwner(this, Date.now(), observedContext);
							_beginExhaustedWorkerRecoveryStabilization(this, observedContext);
							break;
						}
						case "PostAdNativeReloadReady": {
							if (isStalePlaybackEvent(data)) {
								break;
							}
							const reloadContext = _normalizePlaybackContext({
								MediaType: data.mediaType,
								ChannelName: data.channel,
								VodID: data.vodID,
								MediaKey: data.mediaKey,
							});
							const workerContext = _getWorkerPlaybackContext(
								this,
								pagePlaybackContext,
							);
							if (
								!reloadContext.MediaKey ||
								_isPlaybackContextMismatch(workerContext, reloadContext) ||
								typeof _confirmPostAdNativeReload !== "function"
							) {
								break;
							}
							_confirmPostAdNativeReload({
								channel: reloadContext.ChannelName,
								mediaKey: reloadContext.MediaKey,
								cycleStartedAt: data.cycleStartedAt,
								reloadAt: data.reloadAt,
								confirmedAt: data.confirmedAt,
							});
							break;
						}
						case "PlaybackWorkerBootstrapObserved": {
							const observedContext = _normalizePlaybackContext({
								MediaType: data.mediaType,
								ChannelName: data.channel,
								VodID: data.vodID,
								MediaKey: data.mediaKey,
							});
							const workerContext = _getWorkerPlaybackContext(
								this,
								pagePlaybackContext,
							);
							if (
								!observedContext.MediaKey ||
								_isPlaybackContextMismatch(workerContext, observedContext)
							) {
								break;
							}
							if (
								!(
									this.__TTVABPlaybackBootstrapObservedAtByMediaKey instanceof
									Map
								)
							) {
								this.__TTVABPlaybackBootstrapObservedAtByMediaKey = new Map();
							}
							this.__TTVABPlaybackBootstrapObservedAtByMediaKey.delete(
								observedContext.MediaKey,
							);
							this.__TTVABPlaybackBootstrapObservedAtByMediaKey.set(
								observedContext.MediaKey,
								Date.now(),
							);
							while (
								this.__TTVABPlaybackBootstrapObservedAtByMediaKey.size > 8
							) {
								const oldestMediaKey =
									this.__TTVABPlaybackBootstrapObservedAtByMediaKey
										.keys()
										.next().value;
								if (oldestMediaKey === undefined) break;
								this.__TTVABPlaybackBootstrapObservedAtByMediaKey.delete(
									oldestMediaKey,
								);
							}
							_rememberWorkerPageContext(this, observedContext);
							break;
						}
						case "FetchRequest":
							void handleWorkerFetchRequest(data.value).then((responseData) => {
								try {
									_postWorkerBridgeMessage(this, {
										key: "FetchResponse",
										value: responseData,
									});
								} catch {}
							});
							break;
						case "LogEntry": {
							try {
								const entry = data.value as PlainObject | null;
								if (
									entry &&
									typeof entry === "object" &&
									!Array.isArray(entry)
								) {
									if (!Array.isArray(globalThis.__TTVAB_LOGS__)) {
										globalThis.__TTVAB_LOGS__ = [];
									}
									const rawTimestamp =
										typeof entry.t === "number" ? entry.t : Number.NaN;
									const timestamp =
										Number.isFinite(rawTimestamp) &&
										rawTimestamp >= 0 &&
										rawTimestamp <= 8640000000000000
											? Math.trunc(rawTimestamp)
											: Date.now();
									const rawGeneration =
										typeof this.__TTVABGeneration === "number"
											? this.__TTVABGeneration
											: 0;
									const workerGeneration = Number.isFinite(rawGeneration)
										? Math.min(1000000, Math.max(0, Math.trunc(rawGeneration)))
										: 0;
									const buffer = globalThis.__TTVAB_LOGS__ as PlainObject[];
									buffer.push({
										t: timestamp,
										l:
											typeof entry.l === "string"
												? entry.l.slice(0, 16)
												: "info",
										m:
											typeof entry.m === "string"
												? _formatLogText(entry.m)
												: "[Invalid worker log message]",
										w: true,
										g: workerGeneration,
										k: _normalizeMediaKey(this.__TTVABPageMediaKey),
									});
									if (buffer.length > 1200) {
										buffer.splice(0, buffer.length - 1000);
									}
								}
							} catch {}
							break;
						}
						case "AdBlocked":
							if (isStalePlaybackEvent(data)) {
								_log(
									`Ignoring stale AdBlocked event for ${data.mediaKey || data.channel}`,
									"info",
								);
								break;
							}
							{
								const reportedCount = Number.isFinite(data.count as number)
									? Math.max(0, Math.trunc(data.count as number))
									: 0;
								const reportedDelta = Number.isFinite(data.delta as number)
									? Math.max(1, Math.trunc(data.delta as number))
									: 1;
								const currentCount = Number.isFinite(_S.adsBlocked)
									? Math.max(0, Math.trunc(_S.adsBlocked))
									: 0;
								const nextCount =
									reportedCount > currentCount
										? reportedCount
										: currentCount + reportedDelta;
								_S.adsBlocked = nextCount;
							}
							{
								const detail = {
									count: _S.adsBlocked,
									delta: Number.isFinite(data.delta as number)
										? Math.max(1, Math.trunc(data.delta as number))
										: 1,
									channel:
										typeof data.channel === "string" ? data.channel : null,
									mediaKey:
										typeof data.mediaKey === "string" ? data.mediaKey : null,
									pageChannel: data.pageChannel || null,
									pageMediaKey: data.pageMediaKey || null,
								};
								_emitInternalMessage("ttvab-ad-blocked", detail);
								_sendBridgeMessage("ttvab-ad-blocked", detail);
							}
							_log(`Ad blocked! Total: ${_S.adsBlocked}`, "success");
							break;
						case "AdSecondsBlocked": {
							if (isStalePlaybackEvent(data)) {
								break;
							}
							const measurements = Array.isArray(data.measurements)
								? data.measurements
										.slice(0, 50)
										.map((measurement) => {
											const id =
												typeof measurement?.id === "string" &&
												measurement.id.startsWith("stitched-ad-") &&
												measurement.id.length <= 256
													? measurement.id
													: null;
											const durationMilliseconds = Number.isFinite(
												measurement?.durationMilliseconds,
											)
												? Math.max(
														0,
														Math.trunc(measurement.durationMilliseconds),
													)
												: 0;
											const startDateMilliseconds = Number.isSafeInteger(
												measurement?.startDateMilliseconds,
											)
												? Math.max(0, measurement.startDateMilliseconds)
												: 0;
											return id &&
												durationMilliseconds > 0 &&
												durationMilliseconds <= 600000
												? {
														id,
														durationMilliseconds,
														...(startDateMilliseconds
															? { startDateMilliseconds }
															: {}),
													}
												: null;
										})
										.filter(Boolean)
								: [];
							if (measurements.length > 0) {
								_sendBridgeMessage("ttvab-ad-seconds", {
									measurements,
									cycleStartedAt: Math.max(0, Number(data.cycleStartedAt) || 0),
									channel: data.channel || null,
									mediaKey: data.mediaKey || null,
									pageChannel: data.pageChannel || null,
									pageMediaKey: data.pageMediaKey || null,
								});
								break;
							}
							const measuredSeconds = Number.isFinite(data.seconds as number)
								? Math.max(0, Math.trunc(data.seconds as number))
								: 0;
							if (measuredSeconds > 0) {
								_sendBridgeMessage("ttvab-ad-seconds", {
									seconds: measuredSeconds,
									channel: data.channel || null,
									mediaKey: data.mediaKey || null,
									pageChannel: data.pageChannel || null,
									pageMediaKey: data.pageMediaKey || null,
								});
							}
							break;
						}
						case "AdDetected":
							if (isStalePlaybackEvent(data)) {
								_log(
									`Ignoring stale AdDetected event for ${data.mediaKey || data.channel}`,
									"info",
								);
								break;
							}
							{
								const now = Date.now();
								const sourceWorkerGeneration = Math.max(
									0,
									Number(this.__TTVABGeneration) || 0,
								);
								const isContinuation = data.continued === true;
								const detectedContext = _normalizePlaybackContext({
									MediaType: __TTVAB_STATE__.PageMediaType,
									ChannelName:
										data.channel || __TTVAB_STATE__.CurrentAdChannel || null,
									VodID: __TTVAB_STATE__.PageVodID,
									MediaKey:
										data.mediaKey ||
										__TTVAB_STATE__.CurrentAdMediaKey ||
										__TTVAB_STATE__.PageMediaKey,
								});
								const channel = detectedContext.ChannelName;
								const mediaKey = detectedContext.MediaKey;
								const detectedCycleStartedAt = Math.max(
									0,
									Number(data.cycleStartedAt) || 0,
								);
								const activeCycleStartedAt = Math.max(
									0,
									Number(
										__TTVAB_STATE__.AdPodProgressByMediaKey?.[mediaKey]
											?.cycleStartedAt,
									) || 0,
								);
								const lastEndedCycleStartedAt =
									_normalizeMediaKey(__TTVAB_STATE__.LastAdEndedMediaKey) ===
									mediaKey
										? Math.max(
												0,
												Number(__TTVAB_STATE__.LastAdEndedCycleStartedAt) || 0,
											)
										: 0;
								const lastEndedAt = Math.max(
									0,
									Number(__TTVAB_STATE__.LastAdEndedAt) || 0,
								);
								const continuationDetectedAt = Math.max(
									0,
									Number(data.detectedAt) || 0,
								);
								const confirmedPlaybackOwnerGeneration =
									_getConfirmedWorkerPlaybackOwnerGeneration(mediaKey);
								const healthyPlaybackOwner = this.__TTVABCrashed
									? _getHealthyObservedPlaybackWorker(
											detectedContext,
											this,
											now,
											0,
											true,
										)
									: null;
								const healthyOwnerGeneration = Math.max(
									0,
									Number(healthyPlaybackOwner?.__TTVABGeneration) || 0,
								);
								const controlWorkerGeneration =
									this.__TTVABCrashed &&
									confirmedPlaybackOwnerGeneration > 0 &&
									confirmedPlaybackOwnerGeneration < sourceWorkerGeneration &&
									healthyOwnerGeneration === confirmedPlaybackOwnerGeneration
										? confirmedPlaybackOwnerGeneration
										: sourceWorkerGeneration;
								const endedCycleAge = continuationDetectedAt - lastEndedAt;
								const isRapidSameEndedCycleContinuation = Boolean(
									isContinuation &&
										!_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) &&
										mediaKey &&
										detectedCycleStartedAt > 0 &&
										lastEndedCycleStartedAt === detectedCycleStartedAt &&
										(activeCycleStartedAt === 0 ||
											activeCycleStartedAt === detectedCycleStartedAt) &&
										lastEndedAt > 0 &&
										continuationDetectedAt <= now &&
										endedCycleAge >= 0 &&
										endedCycleAge <= _getPostAdReentryContinuationMs(),
								);
								if (
									!mediaKey ||
									detectedCycleStartedAt <= 0 ||
									detectedCycleStartedAt <
										Math.max(activeCycleStartedAt, lastEndedCycleStartedAt) ||
									(!__TTVAB_STATE__.CurrentAdMediaKey &&
										lastEndedCycleStartedAt >= detectedCycleStartedAt &&
										!isRapidSameEndedCycleContinuation) ||
									!_claimPageAdCycleControl(
										mediaKey,
										detectedCycleStartedAt,
										controlWorkerGeneration,
										continuationDetectedAt,
									)
								) {
									_log(
										`Ignoring stale ad cycle for ${mediaKey || channel}`,
										"info",
									);
									break;
								}
								_rememberPageSidePlaybackOwner(
									mediaKey,
									data.playlistUrl,
									null,
									detectedCycleStartedAt,
									{
										confirmedPlayback: false,
										adMarked: true,
									},
								);
								const shouldStartNewCycle =
									!__TTVAB_STATE__.CurrentAdMediaKey ||
									__TTVAB_STATE__.CurrentAdMediaKey !== mediaKey ||
									detectedCycleStartedAt > activeCycleStartedAt ||
									(!isContinuation &&
										now - (__TTVAB_STATE__.LastAdDetectedAt || 0) >
											__TTVAB_STATE__.AdCycleStaleMs);
								const shouldReuseCanonicalCycle = Boolean(
									detectedCycleStartedAt > 0 &&
										(activeCycleStartedAt === detectedCycleStartedAt ||
											isRapidSameEndedCycleContinuation),
								);
								if (shouldStartNewCycle) {
									if (!shouldReuseCanonicalCycle) {
										_clearAdPodProgress(mediaKey);
										_mergeAdPodProgress({
											mediaType: detectedContext.MediaType,
											channelName: channel,
											vodID: detectedContext.VodID,
											mediaKey,
											adIds: [],
											expectedPodLength: 0,
											cycleStartedAt: detectedCycleStartedAt || now,
										});
										_broadcastWorkers({
											key: "ClearAdPodProgress",
											targetMediaKey: mediaKey,
											value: { mediaKey },
										});
									}
									if (
										typeof _clearPlaybackRecoveryTimeoutsForContext ===
										"function"
									) {
										_clearPlaybackRecoveryTimeoutsForContext(mediaKey);
									}
									__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
									__TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
									if (typeof _rememberPlayerPlaybackForAd === "function") {
										_rememberPlayerPlaybackForAd(channel, mediaKey);
									}
								} else if (
									isContinuation &&
									typeof _rememberPlayerPlaybackForAd === "function"
								) {
									const cooldownMs =
										__TTVAB_STATE__?.AdRecoveryReloadCooldownMs || 10000;
									const lastReload = Math.max(
										0,
										Number(__TTVAB_STATE__?.LastAdRecoveryReloadAt) || 0,
									);
									if (lastReload <= 0 || now - lastReload >= cooldownMs) {
										_rememberPlayerPlaybackForAd(channel, mediaKey);
									}
								}
								if (
									mediaKey &&
									!__TTVAB_STATE__.AdPodProgressByMediaKey?.[mediaKey]
								) {
									_mergeAdPodProgress({
										mediaType: detectedContext.MediaType,
										channelName: channel,
										vodID: detectedContext.VodID,
										mediaKey,
										adIds: [],
										expectedPodLength: 0,
										cycleStartedAt: detectedCycleStartedAt || now,
									});
								}
								__TTVAB_STATE__.CurrentAdChannel = channel;
								__TTVAB_STATE__.CurrentAdMediaKey = mediaKey;
								__TTVAB_STATE__.LastAdDetectedAt = now;
								_broadcastWorkers({
									key: "UpdateCurrentAdContext",
									targetMediaKey: __TTVAB_STATE__.CurrentAdMediaKey,
									value: {
										channelName: __TTVAB_STATE__.CurrentAdChannel,
										mediaKey: __TTVAB_STATE__.CurrentAdMediaKey,
									},
								});
								const canonicalPodProgress =
									mediaKey &&
									__TTVAB_STATE__.AdPodProgressByMediaKey?.[mediaKey];
								if (canonicalPodProgress) {
									_broadcastWorkers({
										key: "UpdateAdPodProgress",
										targetMediaKey: mediaKey,
										value: {
											mediaType: detectedContext.MediaType,
											channelName: channel,
											vodID: detectedContext.VodID,
											mediaKey,
											...canonicalPodProgress,
										},
									});
								}
							}
							if (typeof _ensurePlaybackMonitorsRunning === "function") {
								_ensurePlaybackMonitorsRunning(true);
							}
							_log(
								data.continued === true
									? "Ad recovery continuing after native reload"
									: "Ad detected, blocking...",
								"warning",
							);
							break;
						case "AdPodProgress": {
							if (isStalePlaybackEvent(data)) {
								break;
							}
							const progress = _mergeAdPodProgress({
								mediaType: __TTVAB_STATE__.PageMediaType,
								channelName: data.channel || null,
								vodID: __TTVAB_STATE__.PageVodID,
								mediaKey: data.mediaKey || null,
								adIds: data.adIds,
								expectedPodLength: data.expectedPodLength,
								maxAdPodPosition: data.maxAdPodPosition,
								observedZeroAdPodPosition: data.observedZeroAdPodPosition,
								cycleStartedAt: data.cycleStartedAt,
							});
							if (!progress || !data.mediaKey) {
								break;
							}
							_broadcastWorkers({
								key: "UpdateAdPodProgress",
								targetMediaKey: data.mediaKey,
								value: {
									mediaType: __TTVAB_STATE__.PageMediaType,
									channelName: data.channel || null,
									vodID: __TTVAB_STATE__.PageVodID,
									mediaKey: data.mediaKey,
									...progress,
								},
							});
							break;
						}
						case "BackupPlayerTypeSelected": {
							const selectedMediaKey = _normalizeMediaKey(data.mediaKey);
							const selectedCycleStartedAt = Math.max(
								0,
								Number(data.cycleStartedAt) || 0,
							);
							if (
								isStalePlaybackEvent(data) ||
								!selectedMediaKey ||
								!_isCodecHandoffCycleCurrent(
									selectedMediaKey,
									selectedCycleStartedAt,
								)
							) {
								_log(
									`Ignoring stale backup selection for ${selectedMediaKey || data.channel}`,
									"info",
								);
								break;
							}
							const nextPinnedType = data.value || null;
							const nextPinnedContext = _normalizePlaybackContext({
								MediaType: __TTVAB_STATE__.PageMediaType,
								ChannelName:
									data.channel || __TTVAB_STATE__.CurrentAdChannel || null,
								VodID: __TTVAB_STATE__.PageVodID,
								MediaKey: selectedMediaKey,
							});
							if (
								__TTVAB_STATE__.PinnedBackupPlayerType === nextPinnedType &&
								__TTVAB_STATE__.PinnedBackupPlayerChannel ===
									nextPinnedContext.ChannelName &&
								__TTVAB_STATE__.PinnedBackupPlayerMediaKey ===
									nextPinnedContext.MediaKey
							) {
								break;
							}
							if (nextPinnedType) {
								__TTVAB_STATE__.PinnedBackupPlayerType = nextPinnedType;
							}
							__TTVAB_STATE__.PinnedBackupPlayerChannel =
								nextPinnedContext.ChannelName;
							__TTVAB_STATE__.PinnedBackupPlayerMediaKey =
								nextPinnedContext.MediaKey;
							if (typeof _suppressPauseIntent === "function") {
								_suppressPauseIntent(
									nextPinnedContext.ChannelName,
									nextPinnedContext.MediaKey,
									3000,
								);
							}
							if (
								typeof _suppressCompetingMediaDuringAd === "function" &&
								typeof _schedulePlaybackRecoveryTimeout === "function"
							) {
								_suppressCompetingMediaDuringAd(
									nextPinnedContext.ChannelName,
									nextPinnedContext.MediaKey,
								);
								_schedulePlaybackRecoveryTimeout(
									() =>
										_suppressCompetingMediaDuringAd(
											nextPinnedContext.ChannelName,
											nextPinnedContext.MediaKey,
										),
									120,
									nextPinnedContext.ChannelName,
									nextPinnedContext.MediaKey,
									selectedCycleStartedAt,
								);
							}
							if (
								typeof _resumeActivePlayerIfPaused === "function" &&
								typeof _schedulePlaybackRecoveryTimeout === "function"
							) {
								_schedulePlaybackRecoveryTimeout(
									() =>
										_resumeActivePlayerIfPaused(
											nextPinnedContext.ChannelName,
											nextPinnedContext.MediaKey,
										),
									180,
									nextPinnedContext.ChannelName,
									nextPinnedContext.MediaKey,
									selectedCycleStartedAt,
								);
								_schedulePlaybackRecoveryTimeout(
									() =>
										_resumeActivePlayerIfPaused(
											nextPinnedContext.ChannelName,
											nextPinnedContext.MediaKey,
										),
									650,
									nextPinnedContext.ChannelName,
									nextPinnedContext.MediaKey,
									selectedCycleStartedAt,
								);
							}
							_broadcastWorkers({
								key: "UpdatePinnedBackupPlayerContext",
								targetMediaKey: nextPinnedContext.MediaKey,
								value: {
									type: __TTVAB_STATE__.PinnedBackupPlayerType,
									channelName: __TTVAB_STATE__.PinnedBackupPlayerChannel,
									mediaKey: __TTVAB_STATE__.PinnedBackupPlayerMediaKey,
									cycleStartedAt: selectedCycleStartedAt,
								},
							});
							_log(`Pinned backup type: ${data.value}`, "info");
							break;
						}
						case "FatalMediaRecoveryReady":
							if (isStalePlaybackEvent(data)) {
								_log(
									`Ignoring stale fatal media recovery for ${data.mediaKey || data.channel}`,
									"info",
								);
								break;
							}
							if (typeof _acceptFatalAdMediaRecoveryReady === "function") {
								_acceptFatalAdMediaRecoveryReady(data);
							}
							break;
						case "AdEnded":
							if (isStalePlaybackEvent(data)) {
								_log(
									`Ignoring stale AdEnded event for ${data.mediaKey || data.channel}`,
									"info",
								);
								break;
							}
							{
								const channel =
									data.channel || __TTVAB_STATE__.CurrentAdChannel || null;
								const mediaKey =
									data.mediaKey || __TTVAB_STATE__.CurrentAdMediaKey || null;
								const sourceWorkerGeneration = Math.max(
									0,
									Number(this.__TTVABGeneration) || 0,
								);
								const reportedEndedAt = Math.max(0, Number(data.endedAt) || 0);
								const endedAt = reportedEndedAt || Date.now();
								const endedContext = _normalizePlaybackContext({
									MediaType: __TTVAB_STATE__.PageMediaType,
									ChannelName: channel,
									VodID: __TTVAB_STATE__.PageVodID,
									MediaKey: mediaKey,
								});
								const endedCodecHandoffId =
									typeof data.handoffId === "string" && data.handoffId
										? data.handoffId
										: null;
								const endedCycleStartedAt = Math.max(
									0,
									Number(data.cycleStartedAt) || 0,
								);
								const isHoldingBackup = data.holdingBackup === true;
								if (
									!mediaKey ||
									!_isCodecHandoffCycleCurrent(mediaKey, endedCycleStartedAt) ||
									!_isPageAdCycleControlEventCurrent(
										mediaKey,
										endedCycleStartedAt,
										sourceWorkerGeneration,
										reportedEndedAt,
										this,
									)
								) {
									_log(
										`Ignoring stale AdEnded cycle for ${mediaKey || channel}`,
										"info",
									);
									break;
								}
								if (
									endedCodecHandoffId &&
									__TTVAB_STATE__.ActiveCodecHandoffId &&
									__TTVAB_STATE__.ActiveCodecHandoffId !== endedCodecHandoffId
								) {
									_broadcastWorkers({
										key: "UpdateCodecHandoffContext",
										targetMediaKey: mediaKey,
										value: {
											clearHandoffId: endedCodecHandoffId,
											channelName: endedContext.ChannelName,
											mediaKey: endedContext.MediaKey,
										},
									});
									_log(
										`Ignoring superseded AdEnded handoff ${endedCodecHandoffId}`,
										"info",
									);
									break;
								}
								_claimPageAdCycleControl(
									mediaKey,
									endedCycleStartedAt,
									sourceWorkerGeneration,
									endedAt,
									true,
									this,
								);
								__TTVAB_STATE__.LastAdEndedAt = endedAt;
								__TTVAB_STATE__.LastAdEndedChannel = endedContext.ChannelName;
								__TTVAB_STATE__.LastAdEndedMediaKey = endedContext.MediaKey;
								__TTVAB_STATE__.LastAdEndedCycleStartedAt = endedCycleStartedAt;
								if (
									!isHoldingBackup &&
									_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) ===
										mediaKey
								) {
									__TTVAB_STATE__.CurrentAdChannel = null;
									__TTVAB_STATE__.CurrentAdMediaKey = null;
								}
								if (
									!isHoldingBackup &&
									_normalizeMediaKey(
										__TTVAB_STATE__.PinnedBackupPlayerMediaKey,
									) === mediaKey
								) {
									__TTVAB_STATE__.PinnedBackupPlayerType = null;
									__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
									__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
								}
								if (
									!isHoldingBackup &&
									endedCodecHandoffId &&
									__TTVAB_STATE__.ActiveCodecHandoffId === endedCodecHandoffId
								) {
									__TTVAB_STATE__.ActiveCodecHandoffId = null;
									__TTVAB_STATE__.ActiveCodecHandoffChannel = null;
									__TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
								}
								if (
									!isHoldingBackup &&
									typeof _clearPlaybackRecoveryTimeoutsForContext === "function"
								) {
									_clearPlaybackRecoveryTimeoutsForContext(mediaKey);
								}
								if (!isHoldingBackup) {
									_broadcastWorkers({
										key: "UpdateCurrentAdContext",
										targetMediaKey: mediaKey,
										value: null,
									});
									_broadcastWorkers({
										key: "UpdatePinnedBackupPlayerContext",
										targetMediaKey: mediaKey,
										value: null,
									});
									if (endedCodecHandoffId) {
										_broadcastWorkers({
											key: "UpdateCodecHandoffContext",
											targetMediaKey: mediaKey,
											value: {
												clearHandoffId: endedCodecHandoffId,
												channelName: endedContext.ChannelName,
												mediaKey: endedContext.MediaKey,
											},
										});
									}
								}
								_broadcastWorkers({
									key: "UpdateLastAdEndContext",
									targetMediaKey: mediaKey,
									value: {
										mediaType: endedContext.MediaType,
										channelName: endedContext.ChannelName,
										vodID: endedContext.VodID,
										mediaKey: endedContext.MediaKey,
										endedAt,
										cycleStartedAt: endedCycleStartedAt,
									},
								});
								if (
									!isHoldingBackup &&
									typeof _resetPlayerBufferMonitorState === "function"
								) {
									_resetPlayerBufferMonitorState();
								}
								__TTVAB_STATE__._AdRecoveryConsecutiveFailures = 0;
								if (!isHoldingBackup) {
									_clearAdPodProgress(mediaKey);
									_broadcastWorkers({
										key: "ClearAdPodProgress",
										targetMediaKey: mediaKey,
										value: { mediaKey },
									});
								}
								_log(
									isHoldingBackup
										? "Visible ad cycle ended; holding clean backup"
										: "Ad ended",
									"success",
								);
								if (
									!isHoldingBackup &&
									typeof _restoreSuppressedMediaAfterAd === "function"
								) {
									_restoreSuppressedMediaAfterAd(channel, mediaKey);
								}
								_schedulePostAdArtifactCleanup(
									channel,
									mediaKey,
									endedCycleStartedAt,
								);
							}
							break;
						case "NativePlaybackRestored":
							if (isStalePlaybackEvent(data)) {
								_log(
									`Ignoring stale native restore event for ${data.mediaKey || data.channel}`,
									"info",
								);
								break;
							}
							{
								const channel =
									data.channel || __TTVAB_STATE__.LastAdEndedChannel || null;
								const mediaKey =
									data.mediaKey || __TTVAB_STATE__.LastAdEndedMediaKey || null;
								const sourceWorkerGeneration = Math.max(
									0,
									Number(this.__TTVABGeneration) || 0,
								);
								const restoredCycleStartedAt = Math.max(
									0,
									Number(data.cycleStartedAt) || 0,
								);
								const reportedRestoredAt = Math.max(
									0,
									Number(data.restoredAt) || 0,
								);
								if (
									!mediaKey ||
									!_isCodecHandoffCycleCurrent(
										mediaKey,
										restoredCycleStartedAt,
									) ||
									!_isPageAdCycleControlEventCurrent(
										mediaKey,
										restoredCycleStartedAt,
										sourceWorkerGeneration,
										reportedRestoredAt,
										this,
									)
								) {
									_log(
										`Ignoring stale native restore cycle for ${mediaKey || channel}`,
										"info",
									);
									break;
								}
								if (reportedRestoredAt > 0) {
									_claimPageAdCycleControl(
										mediaKey,
										restoredCycleStartedAt,
										sourceWorkerGeneration,
										reportedRestoredAt,
										true,
										this,
									);
								}
								if (
									typeof _hasPendingAdResumeIntent === "function" &&
									!(
										typeof _hasUserPauseIntent === "function" &&
										_hasUserPauseIntent(channel, mediaKey)
									) &&
									!(
										typeof _shouldSuppressAutomaticPlaybackResume ===
											"function" &&
										_shouldSuppressAutomaticPlaybackResume(channel, mediaKey)
									)
								) {
									_hasPendingAdResumeIntent(channel, mediaKey);
								}
								const requiresTimelineRestoreReload = Boolean(
									typeof _consumePinnedBackupTimelineRestore === "function" &&
										_consumePinnedBackupTimelineRestore(
											mediaKey,
											restoredCycleStartedAt,
										),
								);
								const requiresReload = Boolean(
									data.requiresReload === true || requiresTimelineRestoreReload,
								);
								const restoredHandoffId =
									_normalizeMediaKey(
										__TTVAB_STATE__.ActiveCodecHandoffMediaKey,
									) === mediaKey
										? __TTVAB_STATE__.ActiveCodecHandoffId
										: null;
								if (
									_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) ===
									mediaKey
								) {
									__TTVAB_STATE__.CurrentAdChannel = null;
									__TTVAB_STATE__.CurrentAdMediaKey = null;
								}
								if (
									_normalizeMediaKey(
										__TTVAB_STATE__.PinnedBackupPlayerMediaKey,
									) === mediaKey
								) {
									__TTVAB_STATE__.PinnedBackupPlayerType = null;
									__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
									__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
								}
								if (restoredHandoffId) {
									__TTVAB_STATE__.ActiveCodecHandoffId = null;
									__TTVAB_STATE__.ActiveCodecHandoffChannel = null;
									__TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
								}
								__TTVAB_STATE__.LastAdEndedAt = Math.max(
									0,
									reportedRestoredAt || Date.now(),
								);
								__TTVAB_STATE__.LastAdEndedChannel = channel;
								__TTVAB_STATE__.LastAdEndedMediaKey = mediaKey;
								__TTVAB_STATE__.LastAdEndedCycleStartedAt =
									restoredCycleStartedAt;
								_broadcastWorkers([
									{
										key: "UpdateCurrentAdContext",
										targetMediaKey: mediaKey,
										value: null,
									},
									{
										key: "UpdatePinnedBackupPlayerContext",
										targetMediaKey: mediaKey,
										value: null,
									},
									...(restoredHandoffId
										? [
												{
													key: "UpdateCodecHandoffContext",
													targetMediaKey: mediaKey,
													value: {
														clearHandoffId: restoredHandoffId,
														channelName: channel,
														mediaKey,
													},
												},
											]
										: []),
									{
										key: "UpdateLastAdEndContext",
										targetMediaKey: mediaKey,
										value: {
											mediaType: __TTVAB_STATE__.PageMediaType,
											channelName: channel,
											vodID: __TTVAB_STATE__.PageVodID,
											mediaKey,
											endedAt: __TTVAB_STATE__.LastAdEndedAt,
											cycleStartedAt: restoredCycleStartedAt,
										},
									},
									{
										key: "ClearAdPodProgress",
										targetMediaKey: mediaKey,
										value: { mediaKey },
									},
								]);
								_clearAdPodProgress(mediaKey);
								if (typeof _resetFatalAdMediaRecoveryState === "function") {
									_resetFatalAdMediaRecoveryState();
								}
								_log(
									requiresReload
										? "Native playback restored after backup hold; reloading player"
										: "Native playback restored after backup hold",
									"success",
								);
								if (typeof _restoreSuppressedMediaAfterAd === "function") {
									_restoreSuppressedMediaAfterAd(channel, mediaKey);
								}
								_runPostAdPlayerTask(!requiresReload, requiresReload, {
									reason: "post-ad-native-restore",
									...(requiresReload
										? {
												refreshAccessToken: data.refreshAccessToken !== false,
												newMediaPlayerInstance: true,
											}
										: {}),
									channel,
									mediaKey,
									cycleStartedAt: restoredCycleStartedAt,
								});
								_schedulePostAdArtifactCleanup(
									channel,
									mediaKey,
									restoredCycleStartedAt,
								);
							}
							break;
						case "PauseResumePlayer":
							if (isStalePlaybackEvent(data)) {
								_log(
									`Ignoring stale PauseResumePlayer event for ${data.mediaKey || data.channel}`,
									"info",
								);
								break;
							}
							if (
								!_isPageLifecycleCycleCurrent(
									data.mediaKey,
									data.cycleStartedAt,
								)
							) {
								_log(
									`Ignoring stale PauseResumePlayer cycle for ${data.mediaKey || data.channel}`,
									"info",
								);
								break;
							}
							_log("Resuming player", "info");
							if (typeof _doPlayerTask === "function") {
								_runPostAdPlayerTask(true, false, {
									reason: "ad-recovery",
									channel:
										typeof data.channel === "string" ? data.channel : null,
									mediaKey:
										typeof data.mediaKey === "string" ? data.mediaKey : null,
									cycleStartedAt: Math.max(0, Number(data.cycleStartedAt) || 0),
								});
							}
							break;
						case "ReloadPlayer": {
							if (isStalePlaybackEvent(data)) {
								if (
									data.reason === "codec-handoff" &&
									typeof data.handoffId === "string" &&
									data.handoffId
								) {
									_broadcastWorkers({
										key: "CodecHandoffReloadFailed",
										targetMediaKey:
											typeof data.mediaKey === "string" ? data.mediaKey : null,
										value: {
											handoffId: data.handoffId,
											cycleStartedAt: Math.max(
												0,
												Number(data.cycleStartedAt) || 0,
											),
											channelName:
												typeof data.channel === "string" ? data.channel : null,
											mediaKey:
												typeof data.mediaKey === "string"
													? data.mediaKey
													: null,
										},
									});
								}
								_log(
									`Ignoring stale ReloadPlayer event for ${data.mediaKey || data.channel}`,
									"info",
								);
								break;
							}
							const eventIsCodecHandoff =
								data.reason === "codec-handoff" &&
								typeof data.handoffId === "string" &&
								data.handoffId;
							const eventCycleStartedAt = Math.max(
								0,
								Number(data.cycleStartedAt) || 0,
							);
							const eventMediaKey =
								typeof data.mediaKey === "string" ? data.mediaKey : null;
							if (
								eventIsCodecHandoff &&
								(_getCodecHandoffCycleStartedAt(data.handoffId) !==
									eventCycleStartedAt ||
									!_isCodecHandoffCycleCurrent(
										eventMediaKey,
										eventCycleStartedAt,
									))
							) {
								_broadcastWorkers({
									key: "CodecHandoffReloadFailed",
									targetMediaKey: eventMediaKey,
									value: {
										handoffId: data.handoffId,
										cycleStartedAt: eventCycleStartedAt,
										channelName:
											typeof data.channel === "string" ? data.channel : null,
										mediaKey: eventMediaKey,
									},
								});
								_log(
									`Ignoring stale codec handoff cycle for ${eventMediaKey || data.channel}`,
									"info",
								);
								break;
							}
							if (
								!eventIsCodecHandoff &&
								!_isPageLifecycleCycleCurrent(
									eventMediaKey,
									eventCycleStartedAt,
								)
							) {
								_log(
									`Ignoring stale ReloadPlayer cycle for ${eventMediaKey || data.channel}`,
									"info",
								);
								break;
							}
							_log("Reloading player", "info");
							if (
								typeof _clearPlaybackRecoveryTimeoutsForContext === "function"
							) {
								_clearPlaybackRecoveryTimeoutsForContext(data.mediaKey || null);
							}
							if (
								eventIsCodecHandoff &&
								typeof _clearAdResumeIntent === "function"
							) {
								_clearAdResumeIntent();
							}
							if (typeof _doPlayerTask === "function") {
								const reloadReason =
									typeof data.reason === "string" && data.reason
										? data.reason
										: "ad-recovery";
								const handoffId =
									reloadReason === "codec-handoff" &&
									typeof data.handoffId === "string"
										? data.handoffId
										: null;
								const reloadOptions = {
									reason: reloadReason,
									handoffId,
									cycleStartedAt: eventCycleStartedAt,
									refreshAccessToken: data.refreshAccessToken !== false,
									newMediaPlayerInstance: data.newMediaPlayerInstance !== false,
									channel:
										typeof data.channel === "string" ? data.channel : null,
									mediaKey:
										typeof data.mediaKey === "string" ? data.mediaKey : null,
								};
								const rejectCodecHandoff = () => {
									_broadcastWorkers({
										key: "CodecHandoffReloadFailed",
										targetMediaKey: reloadOptions.mediaKey,
										value: {
											handoffId,
											cycleStartedAt: reloadOptions.cycleStartedAt,
											channelName: reloadOptions.channel,
											mediaKey: reloadOptions.mediaKey,
										},
									});
								};
								if (reloadReason !== "codec-handoff") {
									_runPostAdPlayerTask(false, true, reloadOptions);
									break;
								}
								const runReload = (attempt = 0) => {
									if (
										attempt > 0 &&
										(isStalePlaybackEvent(data) ||
											(reloadReason === "codec-handoff"
												? !_isCodecHandoffCycleCurrent(
														reloadOptions.mediaKey,
														reloadOptions.cycleStartedAt,
													)
												: !_isPageLifecycleCycleCurrent(
														reloadOptions.mediaKey,
														reloadOptions.cycleStartedAt,
													)))
									) {
										rejectCodecHandoff();
										return;
									}
									let didReload = false;
									try {
										didReload =
											_doPlayerTask(false, true, reloadOptions) === true;
									} catch (error) {
										_log(
											`Player reload failed (${reloadReason}): ${error?.message ?? String(error)}`,
											"warning",
										);
									}
									if (didReload) return;
									const retryDelays = [50, 180, 500, 1100];
									if (attempt < retryDelays.length) {
										setTimeout(
											() => runReload(attempt + 1),
											retryDelays[attempt],
										);
										return;
									}
									rejectCodecHandoff();
								};
								runReload();
							}
							break;
						}
						default:
							break;
					}
				});

				const _workerUrl = url;
				const workerOpts = opts;
				this.__TTVABWorkerUrl = _workerUrl;
				this.__TTVABWorkerOpts = workerOpts;

				this.addEventListener("error", (e) => {
					_recoverCrashedWorker(
						this,
						pagePlaybackContext,
						`Worker crashed loading ${workerSourceUrl}: ${e.message || "Unknown error"}`,
						"error",
					);
				});

				this.__TTVABCreatedAt = Date.now();
				this.__TTVABLastPongAt = Date.now();
				this.__TTVABFirstPongAt = 0;
				this.__TTVABGeneration = ++_workerGeneration;
				this.__TTVABRestartAttempts = 0;
				this.__TTVABMissedPongs = 0;
				this.__TTVABLastPingSentAt = 0;
				_rememberWorkerPageContext(this, pagePlaybackContext);
				pruneTrackedWorkers();
				_S.workers.push(this);
				try {
					_postWorkerBridgeMessage(this, {
						key: "UpdateToggleState",
						value: __TTVAB_STATE__.IsAdStrippingEnabled,
					});
					_postWorkerBridgeMessage(this, {
						key: "UpdateAdsBlocked",
						value: _S.adsBlocked,
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
							channelName: seedCurrentAdContext
								? __TTVAB_STATE__.CurrentAdChannel
								: null,
							mediaKey: seedCurrentAdContext
								? __TTVAB_STATE__.CurrentAdMediaKey
								: null,
						},
					});
					_postWorkerBridgeMessage(this, {
						key: "UpdatePinnedBackupPlayerContext",
						value: {
							type: seedPinnedBackupContext
								? __TTVAB_STATE__.PinnedBackupPlayerType
								: null,
							channelName: seedPinnedBackupContext
								? __TTVAB_STATE__.PinnedBackupPlayerChannel
								: null,
							mediaKey: seedPinnedBackupContext
								? __TTVAB_STATE__.PinnedBackupPlayerMediaKey
								: null,
						},
					});
					if (seedCodecHandoffContext) {
						_postWorkerBridgeMessage(this, {
							key: "UpdateCodecHandoffContext",
							value: {
								handoffId: __TTVAB_STATE__.ActiveCodecHandoffId,
								channelName: __TTVAB_STATE__.ActiveCodecHandoffChannel,
								mediaKey: __TTVAB_STATE__.ActiveCodecHandoffMediaKey,
								cycleStartedAt: seedCycleStartedAt,
							},
						});
					}
					if (seedAdPodProgress) {
						_postWorkerBridgeMessage(this, {
							key: "UpdateAdPodProgress",
							value: {
								mediaType: pagePlaybackContext.MediaType,
								channelName: pagePlaybackContext.ChannelName,
								vodID: pagePlaybackContext.VodID,
								mediaKey: pagePlaybackContext.MediaKey,
								...seedAdPodProgress,
							},
						});
					}
				} catch {}
			}

			terminate() {
				this.__TTVABIntentionallyTerminated = true;
				try {
					const terminationContext = _getWorkerPlaybackContext(this);
					_reassignPageAdCycleControlAfterWorkerRetirement(
						terminationContext.MediaKey,
						this.__TTVABGeneration,
						this,
					);
					pruneTrackedWorkers();
					_scheduleTerminatedPlaybackWorkerRecovery(this, terminationContext);
				} catch {}
				return super.terminate();
			}
		};

		return _reinsert(HookedWorker, reinsertNames);
	};

	const originalWorkerDescriptor = Object.getOwnPropertyDescriptor(
		window,
		"Worker",
	);
	let rawWorkerInstance = window.Worker;
	let workerInstance = createHookedWorkerConstructor(rawWorkerInstance);
	Object.defineProperty(window, "Worker", {
		configurable: true,
		enumerable: originalWorkerDescriptor?.enumerable ?? false,
		get: () => workerInstance,
		set: (v) => {
			if (!_isValid(v) || v === workerInstance || v === rawWorkerInstance) {
				return;
			}
			rawWorkerInstance = v;
			workerInstance = createHookedWorkerConstructor(rawWorkerInstance);
		},
	});

	_startWorkerWatchdog();
}

function _hookMainFetch() {
	const realFetch = window.fetch;
	window.__TTVAB_REAL_FETCH__ = realFetch;
	const isGqlEndpointUrl = (urlStr) => {
		try {
			return new URL(urlStr).hostname === "gql.twitch.tv";
		} catch {
			return false;
		}
	};
	const getBlockedVodAdRequest = (urlStr) => {
		if (
			__TTVAB_STATE__.IsAdStrippingEnabled !== true ||
			__TTVAB_STATE__.PageMediaType !== "vod"
		) {
			return null;
		}
		const mediaKey = _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey);
		if (!mediaKey?.startsWith("vod:")) return null;
		try {
			const parsedUrl = new URL(urlStr);
			const isKnownAdOrigin =
				parsedUrl.origin === "https://edge.ads.twitch.tv" ||
				parsedUrl.origin === "https://vaes.amazon-adsystem.com";
			const isKnownAdPath =
				parsedUrl.pathname === "/2018-01-01/3p/ads" ||
				parsedUrl.pathname === "/ads" ||
				parsedUrl.pathname === "/ads/format";
			if (!isKnownAdOrigin || !isKnownAdPath) {
				return null;
			}
			const sessionID = parsedUrl.searchParams.get("sid") || null;
			return {
				mediaKey,
				countKey: `${mediaKey}\n${sessionID || "no-session"}`,
				countTtlMs: sessionID ? 1800000 : 120000,
			};
		} catch {
			return null;
		}
	};
	const blockedVodAdCountExpirations = new Map();
	const recordBlockedVodAdRequest = (request) => {
		const now = Date.now();
		for (const [key, expiresAt] of blockedVodAdCountExpirations) {
			if (expiresAt <= now) blockedVodAdCountExpirations.delete(key);
		}
		const shouldIncrement = !blockedVodAdCountExpirations.has(request.countKey);
		blockedVodAdCountExpirations.delete(request.countKey);
		blockedVodAdCountExpirations.set(
			request.countKey,
			now + request.countTtlMs,
		);
		while (blockedVodAdCountExpirations.size > 100) {
			const oldestKey = blockedVodAdCountExpirations.keys().next().value;
			if (oldestKey === undefined) break;
			blockedVodAdCountExpirations.delete(oldestKey);
		}
		if (shouldIncrement && typeof _incrementAdsBlocked === "function") {
			_incrementAdsBlocked(null, request.mediaKey);
		}
		_log("Blocked client-side VOD ad request", "success");
	};
	if (typeof window.XMLHttpRequest === "function") {
		const realXhrOpen = window.XMLHttpRequest.prototype.open;
		const emptyVastResponseUrl =
			"data:application/xml,%3CVAST%20version%3D%223.0%22%3E%3C%2FVAST%3E";
		window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
			const blockedRequest =
				String(method || "")
					.trim()
					.toUpperCase() === "GET"
					? getBlockedVodAdRequest(url)
					: null;
			if (blockedRequest) {
				recordBlockedVodAdRequest(blockedRequest);
				return realXhrOpen.call(this, method, emptyVastResponseUrl, ...rest);
			}
			return realXhrOpen.call(this, method, url, ...rest);
		};
	}
	const updateWorkers = (updates) => {
		if (Array.isArray(updates)) {
			for (const msg of updates) {
				_broadcastWorkers(msg);
			}
		} else {
			_broadcastWorkers(updates);
		}
	};
	const rewritePlaybackAccessTokenBody = (bodyText) => {
		if (typeof bodyText !== "string" || !bodyText) {
			return { bodyText, changed: false };
		}

		try {
			const forceType =
				__TTVAB_STATE__.ForceAccessTokenPlayerType || "autoplay";
			if (
				!forceType ||
				__TTVAB_STATE__.RewriteNativePlaybackAccessToken !== true
			) {
				return { bodyText, changed: false };
			}

			const parsed = JSON.parse(bodyText);
			const operations = Array.isArray(parsed) ? parsed : [parsed];
			let changed = false;
			let previousPlayerType = null;

			for (const op of operations) {
				if (op?.operationName !== "PlaybackAccessToken") continue;
				if (!op.variables || typeof op.variables !== "object") continue;
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
				_log(
					`Replaced native PlaybackAccessToken player type '${previousPlayerType}' with '${forceType}'`,
					"info",
				);
				return {
					bodyText: JSON.stringify(parsed),
					changed: true,
				};
			}
		} catch {}

		return { bodyText, changed: false };
	};
	const isPictureInPicturePlaybackAccessTokenBody = (bodyText) => {
		if (
			typeof bodyText !== "string" ||
			!bodyText ||
			!bodyText.includes("PlaybackAccessToken")
		) {
			return false;
		}

		try {
			const parsed = JSON.parse(bodyText);
			const operations = Array.isArray(parsed) ? parsed : [parsed];
			return operations.some((op) => {
				if (op?.operationName !== "PlaybackAccessToken") return false;
				const playerType = op?.variables?.playerType;
				return (
					typeof playerType === "string" &&
					playerType.toLowerCase().includes("picture-by-picture")
				);
			});
		} catch {
			return bodyText.toLowerCase().includes("picture-by-picture");
		}
	};
	const updatePlaybackAccessTokenHash = (hash) => {
		if (!hash || __TTVAB_STATE__.PlaybackAccessTokenHash === hash) return;
		__TTVAB_STATE__.PlaybackAccessTokenHash = hash;
		updateWorkers([{ key: "UpdateGQLHash", value: hash }]);
	};
	const updateNativePlaybackAccessTokenPlayerType = (playerType) => {
		if (
			!playerType ||
			__TTVAB_STATE__.LastNativePlaybackAccessTokenPlayerType === playerType
		) {
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
		if (typeof bodyText !== "string" || !bodyText) return;
		try {
			const data = JSON.parse(bodyText);
			const operations = Array.isArray(data) ? data : [data];
			for (const op of operations) {
				if (
					op?.operationName === "PlaybackAccessToken" &&
					op.extensions?.persistedQuery?.sha256Hash
				) {
					updatePlaybackAccessTokenHash(
						op.extensions.persistedQuery.sha256Hash,
					);
				}
			}
		} catch {}
	};
	const processGqlResponse = async (response) => {
		if (response?.status !== 200) return;
		try {
			const payload = await response.clone().json();
			const operations = Array.isArray(payload) ? payload : [payload];
			for (const op of operations) {
				const extractedToken = _extractPlaybackAccessToken(op);
				const tokenValue = extractedToken?.value || null;
				if (typeof tokenValue !== "string" || !tokenValue) continue;
				try {
					const tokenPayload = JSON.parse(tokenValue);
					const effectivePlayerType =
						tokenPayload?.playerType || tokenPayload?.player_type || null;
					if (typeof effectivePlayerType === "string") {
						updateNativePlaybackAccessTokenPlayerType(effectivePlayerType);
					}
				} catch {}
			}
		} catch {}
	};

	window.fetch = async function (...args) {
		const [url, opts] = args;
		if (url) {
			const urlStr = url instanceof Request ? url.url : url.toString();
			const requestMethod =
				typeof opts?.method === "string" && opts.method
					? opts.method
					: url instanceof Request
						? url.method
						: "GET";
			const blockedVodAdRequest =
				requestMethod.trim().toUpperCase() === "GET"
					? getBlockedVodAdRequest(urlStr)
					: null;
			if (blockedVodAdRequest) {
				recordBlockedVodAdRequest(blockedVodAdRequest);
				return new Response(null, {
					status: 204,
					statusText: "No Content",
				});
			}
			if (isGqlEndpointUrl(urlStr)) {
				_syncStoredDeviceId();
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
							} else if (effectiveRequest !== url || args.length !== 1) {
								nextArgs = [effectiveRequest];
							}
						} else if (effectiveRequest !== url || args.length !== 1) {
							nextArgs = [effectiveRequest];
						}
					} catch (_e) {}
				} else if (typeof opts?.body === "string") {
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
							const entry = headers.find(
								(header) =>
									Array.isArray(header) &&
									String(header[0] || "").toLowerCase() === target,
							);
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

					if (
						integrity &&
						__TTVAB_STATE__.ClientIntegrityHeader !== integrity
					) {
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
					void processGqlResponse(response);
				}
				return response;
			}
		}
		return realFetch.apply(this, args);
	};
}
