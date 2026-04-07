// TTV AB - Player

const _PlayerBufferState = {
	position: 0,
	bufferedPosition: 0,
	bufferDuration: 0,
	numSame: 0,
	lastFixTime: 0,
	fixAttempts: 0,
	liveEdgeStarveCount: 0,
	postAdUnhealthyCount: 0,
	postAdRecoveryStartedAt: 0,
};

let _cachedPlayerRef = null;
let _cachedPlayerRefMediaKey = null;
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
};
const _PlaybackRecoveryTimeoutState = {
	timeouts: new Set<{
		id: ReturnType<typeof setTimeout>;
		channel: string | null;
		mediaKey: string | null;
	}>(),
};
const _PlayerPreferenceRestoreState = {
	timeoutId: null as ReturnType<typeof setTimeout> | null,
	channel: null as string | null,
	mediaKey: null as string | null,
};
const _PLAYBACK_INTENT_MONITOR_DELAY_MS = 500;
const _PLAYBACK_INTENT_IDLE_SYNC_DELAY_MS = 1500;
const _PLAYBACK_INTENT_NO_MEDIA_ROUTE_DELAY_MS = 3000;
const _USER_PAUSE_INTERACTION_WINDOW_MS = 1200;
const _AD_RESUME_INTENT_WINDOW_MS = 15000;
const _AD_TRANSIENT_PAUSE_CLEAR_WINDOW_MS = 1750;
const _PLAYER_BUFFER_LIVE_EDGE_EPSILON = 0.35;
const _PLAYER_BUFFER_LIVE_EDGE_RELOAD_COUNT = 12;
const _POST_AD_UNHEALTHY_RELOAD_COUNT = 3;
const _POST_AD_RECOVERY_RELOAD_COOLDOWN_MS = 1800;
const _POST_AD_SOFT_RELOAD_DELAY_MS = 10000;
const _POST_AD_PAUSE_RESUME_RETRY_MS = 2500;
const _PLAYER_CONTROL_INTERACTION_SELECTOR = [
	'[data-a-target="player-play-pause-button"]',
	'[data-a-target="player-overlay-play-button"]',
	'[data-a-target="player-overlay-click-handler"]',
	'[data-a-target="video-player"]',
	"video",
].join(", ");
const _PLAYER_PREFERENCE_KEYS = [
	"video-quality",
	"video-muted",
	"volume",
	"lowLatencyModeEnabled",
	"persistenceEnabled",
];

function _getPlayerCore(player) {
	return player?.playerInstance?.core || player?.core || null;
}

function _findReactRoot() {
	const rootNode = document.querySelector("#root");
	if (!rootNode) return null;

	if (rootNode._reactRootContainer?._internalRoot?.current) {
		return rootNode._reactRootContainer._internalRoot.current;
	}

	const containerName = Object.keys(rootNode).find((x) =>
		x.startsWith("__reactContainer"),
	);
	if (containerName) {
		return rootNode[containerName];
	}

	return null;
}

function _findReactNode(root, constraint) {
	if (!root) return null;

	if (root.stateNode && constraint(root.stateNode)) {
		return root.stateNode;
	}

	let node = root.child;
	while (node) {
		const result = _findReactNode(node, constraint);
		if (result) return result;
		node = node.sibling;
	}

	return null;
}

function _getPlayerAndState() {
	const reactRoot = _findReactRoot();
	if (!reactRoot) return { player: null, state: null };

	let player = _findReactNode(
		reactRoot,
		(node) => node.setPlayerActive && node.props?.mediaPlayerInstance,
	);
	player = player?.props?.mediaPlayerInstance || null;

	let playerState = _findReactNode(
		reactRoot,
		(node) => node.setSrc && node.setInitialPlaybackSettings,
	);

	if (!playerState) {
		const fallbackState = _findReactNode(
			reactRoot,
			(node) =>
				node.state &&
				node.state.videoPlayerInstance &&
				node.state.videoPlayerInstance.playerMode !== undefined,
		);
		playerState = fallbackState?.state?.videoPlayerInstance || null;
	}

	return { player, state: playerState };
}

function _resetPlayerBufferMonitorState(cooldownMs = 0) {
	const minRepeatDelay =
		typeof __TTVAB_STATE__ !== "undefined" && __TTVAB_STATE__
			? Number(__TTVAB_STATE__.PlayerBufferingMinRepeatDelay) || 0
			: 0;
	const requestedCooldownMs = Number.isFinite(cooldownMs)
		? Math.max(0, cooldownMs)
		: 0;
	const appliedCooldownMs =
		minRepeatDelay > 0
			? Math.min(requestedCooldownMs, minRepeatDelay)
			: requestedCooldownMs;

	_PlayerBufferState.position = 0;
	_PlayerBufferState.bufferedPosition = 0;
	_PlayerBufferState.bufferDuration = 0;
	_PlayerBufferState.numSame = 0;
	_PlayerBufferState.fixAttempts = 0;
	_PlayerBufferState.liveEdgeStarveCount = 0;
	_PlayerBufferState.postAdUnhealthyCount = 0;
	_PlayerBufferState.postAdRecoveryStartedAt = 0;
	_PlayerBufferState.lastFixTime =
		minRepeatDelay > 0
			? Date.now() - Math.max(0, minRepeatDelay - appliedCooldownMs)
			: 0;
}

function _clearCachedPlayerRef(resetBufferState = true, cooldownMs = 0) {
	_cachedPlayerRef = null;
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
		} catch {}
	}

	const currentTime = Number.isFinite(videoCurrentTime)
		? videoCurrentTime
		: position;
	const liveEdgeDistance = Math.max(0, liveEdge - currentTime);
	const readyState = Number(video?.readyState) || 0;
	const hasFutureData =
		bufferDuration > _PLAYER_BUFFER_LIVE_EDGE_EPSILON ||
		liveEdgeDistance > _PLAYER_BUFFER_LIVE_EDGE_EPSILON ||
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
	return Boolean(
		player?.isPaused?.() || playerCore?.paused || resolvedVideo?.paused,
	);
}

function _isPlaybackHealthyAfterAd(player, playerCore = null, video = null) {
	const resolvedVideo = video || player?.getHTMLVideoElement?.() || null;
	if (!(resolvedVideo instanceof HTMLMediaElement) || resolvedVideo.ended) {
		return false;
	}
	if (_isPlayerPaused(player, playerCore, resolvedVideo)) {
		return false;
	}

	const telemetry = _readPlayerBufferTelemetry(player, playerCore);
	return (
		telemetry.bufferDuration > _PLAYER_BUFFER_LIVE_EDGE_EPSILON ||
		telemetry.liveEdgeDistance > _PLAYER_BUFFER_LIVE_EDGE_EPSILON
	);
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
	} catch {}
	return document.hidden === true;
}

function _normalizePlayerChannel(channel = null) {
	if (typeof channel !== "string") return null;
	const trimmed = channel.trim().toLowerCase();
	return trimmed || null;
}

function _resolvePlayerMediaKey(channel = null, mediaKey = null) {
	return (
		_normalizeMediaKey(mediaKey) ||
		_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) ||
		_normalizeMediaKey(__TTVAB_STATE__.PageMediaKey) ||
		_buildMediaKey("live", channel, null) ||
		_buildMediaKey("live", __TTVAB_STATE__.CurrentAdChannel, null) ||
		_buildMediaKey("live", __TTVAB_STATE__.PageChannel, null) ||
		null
	);
}

function _getCurrentPlaybackRecoveryContext() {
	const routeContext = _normalizePlaybackContext(
		_getPlaybackContextFromUrl(globalThis?.location?.href || ""),
	);

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
		if (!currentContext.mediaKey) return false;
		return currentContext.mediaKey === targetMediaKey;
	}

	if (targetChannel) {
		if (!currentContext.channel) return false;
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

function _schedulePlaybackRecoveryTimeout(
	callback,
	delay = 0,
	channel = null,
	mediaKey = null,
) {
	if (typeof callback !== "function") return null;

	const entry = {
		id: 0 as ReturnType<typeof setTimeout>,
		channel: _normalizePlayerChannel(channel),
		mediaKey: _resolvePlayerMediaKey(channel, mediaKey),
	};

	entry.id = setTimeout(
		() => {
			_PlaybackRecoveryTimeoutState.timeouts.delete(entry);
			if (!_isPlaybackRecoveryContextCurrent(entry.channel, entry.mediaKey)) {
				return;
			}
			try {
				callback();
			} catch {}
		},
		Math.max(0, delay),
	);

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

function _clearRecentPlaybackControlInteraction() {
	_PlaybackIntentState.lastPlaybackControlInteractionAt = 0;
	_PlaybackIntentState.lastPlaybackControlInteractionMediaKey = null;
}

function _rememberRecentPlaybackControlInteraction(
	channel = null,
	mediaKey = null,
) {
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	_PlaybackIntentState.lastPlaybackControlInteractionAt = Date.now();
	_PlaybackIntentState.lastPlaybackControlInteractionMediaKey = safeMediaKey;
}

function _hasRecentPlaybackControlInteraction(channel = null, mediaKey = null) {
	const lastInteractionAt =
		Number(_PlaybackIntentState.lastPlaybackControlInteractionAt) || 0;
	if (
		lastInteractionAt <= 0 ||
		Date.now() - lastInteractionAt > _USER_PAUSE_INTERACTION_WINDOW_MS
	) {
		return false;
	}

	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	const interactionMediaKey = _normalizeMediaKey(
		_PlaybackIntentState.lastPlaybackControlInteractionMediaKey,
	);
	return (
		!safeMediaKey ||
		!interactionMediaKey ||
		safeMediaKey === interactionMediaKey
	);
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
	if (!_PlaybackIntentState.userPausedMediaKey) return false;

	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	if (
		safeMediaKey &&
		_PlaybackIntentState.userPausedMediaKey !== safeMediaKey
	) {
		return false;
	}

	_clearRecordedUserPauseIntent();
	return true;
}

function _resetPlaybackIntentForNavigation(
	channel = null,
	mediaKey = null,
	durationMs = 2500,
) {
	_clearRecordedUserPauseIntent();
	_clearRecentPlaybackControlInteraction();
	_suppressPauseIntent(channel, mediaKey, durationMs);
}

function _hasUserPauseIntent(channel = null, mediaKey = null) {
	if (!_PlaybackIntentState.userPausedMediaKey) return false;

	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	if (!safeMediaKey) return false;
	return _PlaybackIntentState.userPausedMediaKey === safeMediaKey;
}

function _suppressPauseIntent(
	channel = null,
	mediaKey = null,
	durationMs = 3000,
) {
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
	if (!safeMediaKey) return true;
	return _PlaybackIntentState.suppressedPauseMediaKey === safeMediaKey;
}

function _matchesPlaybackTargetContext(
	expectedChannel = null,
	expectedMediaKey = null,
	channel = null,
	mediaKey = null,
) {
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	const normalizedExpectedChannel = _normalizePlayerChannel(expectedChannel);
	const normalizedExpectedMediaKey = _normalizeMediaKey(expectedMediaKey);

	return (
		(!safeMediaKey ||
			!normalizedExpectedMediaKey ||
			safeMediaKey === normalizedExpectedMediaKey) &&
		(!safeChannel ||
			!normalizedExpectedChannel ||
			safeChannel === normalizedExpectedChannel)
	);
}

function _doesActiveAdTargetPlayback(channel = null, mediaKey = null) {
	const expectedChannel = _normalizePlayerChannel(
		__TTVAB_STATE__.CurrentAdChannel,
	);
	const expectedMediaKey = _normalizeMediaKey(
		__TTVAB_STATE__.CurrentAdMediaKey,
	);
	if (!expectedChannel && !expectedMediaKey) {
		return false;
	}

	return _matchesPlaybackTargetContext(
		expectedChannel,
		expectedMediaKey,
		channel,
		mediaKey,
	);
}

function _doesResumeIntentTargetPlayback(channel = null, mediaKey = null) {
	if (__TTVAB_STATE__.ShouldResumeAfterAd !== true) {
		return false;
	}

	const expectedChannel = _normalizePlayerChannel(
		__TTVAB_STATE__.ShouldResumeAfterAdChannel,
	);
	const expectedMediaKey = _normalizeMediaKey(
		__TTVAB_STATE__.ShouldResumeAfterAdMediaKey,
	);
	if (!expectedChannel && !expectedMediaKey) {
		return false;
	}

	return _matchesPlaybackTargetContext(
		expectedChannel,
		expectedMediaKey,
		channel,
		mediaKey,
	);
}

function _isAdOwnedPauseContext(channel = null, mediaKey = null) {
	return (
		_isPauseIntentSuppressed(channel, mediaKey) ||
		_doesActiveAdTargetPlayback(channel, mediaKey) ||
		_doesResumeIntentTargetPlayback(channel, mediaKey)
	);
}

function _pausePlaybackTarget(target) {
	_markProgrammaticPause();
	try {
		target?.pause?.();
		return true;
	} catch {
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
			playResult.catch(() => {});
		}
		return true;
	} catch {
		return false;
	}
}

function _isEditablePlaybackInteractionTarget(target) {
	if (!(target instanceof Element)) return false;
	if (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement
	) {
		return true;
	}
	if (target instanceof HTMLElement && target.isContentEditable) {
		return true;
	}
	return Boolean(
		target.closest?.(
			'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
		),
	);
}

function _hasPlaybackControlAriaLabel(node) {
	if (!(node instanceof Element)) return false;
	const ariaLabel = node.getAttribute?.("aria-label")?.toLowerCase() || "";
	return (
		ariaLabel.includes("pause") ||
		ariaLabel.includes("play") ||
		ariaLabel.includes("resume")
	);
}

function _isPlaybackControlInteractionNode(node) {
	if (!(node instanceof Element)) return false;
	return (
		node.matches?.(_PLAYER_CONTROL_INTERACTION_SELECTOR) ||
		_hasPlaybackControlAriaLabel(node)
	);
}

function _isLikelyPlaybackControlInteraction(event) {
	if (!event || typeof event !== "object") return false;

	if (event.type === "keydown") {
		if (_isEditablePlaybackInteractionTarget(event.target)) {
			return false;
		}

		const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
		const code = typeof event.code === "string" ? event.code : "";
		return (
			code === "Space" ||
			code === "KeyK" ||
			key === " " ||
			key === "spacebar" ||
			key === "k" ||
			key === "mediaplaypause"
		);
	}

	if (
		typeof event.button === "number" &&
		event.button !== 0 &&
		event.pointerType !== "touch" &&
		event.pointerType !== "pen"
	) {
		return false;
	}

	const target = event.target;
	if (!(target instanceof Element)) return false;
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

	const path =
		typeof event.composedPath === "function" ? event.composedPath() : [];
	for (const node of path) {
		if (_isPlaybackControlInteractionNode(node)) {
			return true;
		}
	}

	return false;
}

function _initPlaybackControlInteractionMonitor() {
	if (
		_PlaybackIntentState.interactionMonitorInitialized ||
		typeof window === "undefined"
	) {
		return;
	}

	const rememberInteraction = (event) => {
		if (!_isLikelyPlaybackControlInteraction(event)) {
			return;
		}
		_rememberRecentPlaybackControlInteraction(
			null,
			_normalizeMediaKey(__TTVAB_STATE__.PageMediaKey),
		);
	};

	window.addEventListener("pointerdown", rememberInteraction, true);
	window.addEventListener("keydown", rememberInteraction, true);
	_PlaybackIntentState.interactionMonitorInitialized = true;
}

function _syncPrimaryMediaPlaybackIntent() {
	const media = _getPrimaryMediaElement();
	if (media === _PlaybackIntentState.observedMedia) return;

	if (_PlaybackIntentState.observedMedia) {
		if (_PlaybackIntentState.pauseListener) {
			_PlaybackIntentState.observedMedia.removeEventListener(
				"pause",
				_PlaybackIntentState.pauseListener,
				true,
			);
		}
		if (_PlaybackIntentState.playListener) {
			_PlaybackIntentState.observedMedia.removeEventListener(
				"play",
				_PlaybackIntentState.playListener,
				true,
			);
		}
	}

	_PlaybackIntentState.observedMedia = null;
	_PlaybackIntentState.pauseListener = null;
	_PlaybackIntentState.playListener = null;

	if (!(media instanceof HTMLMediaElement)) return;

	const handlePause = () => {
		if (_wasRecentProgrammaticPlaybackAction("pause")) return;
		if (media.ended) return;
		if (!media.isConnected) return;

		const currentPrimaryMedia = _getPrimaryMediaElement();
		if (
			currentPrimaryMedia instanceof HTMLMediaElement &&
			currentPrimaryMedia !== media
		) {
			return;
		}

		const mediaKey = _resolvePlayerMediaKey(null, __TTVAB_STATE__.PageMediaKey);
		if (!mediaKey) return;
		const hadExplicitInteraction = _hasRecentPlaybackControlInteraction(
			null,
			mediaKey,
		);
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
		if (_wasRecentProgrammaticPlaybackAction("play")) return;
		_clearUserPauseIntent(null, __TTVAB_STATE__.PageMediaKey);
	};

	media.addEventListener("pause", handlePause, true);
	media.addEventListener("play", handlePlay, true);
	_PlaybackIntentState.observedMedia = media;
	_PlaybackIntentState.pauseListener = handlePause;
	_PlaybackIntentState.playListener = handlePlay;
}

function _monitorPlaybackIntent() {
	let lastSyncedMediaKey = null;
	let lastSyncAttemptAt = 0;
	_initPlaybackControlInteractionMonitor();

	function check() {
		let nextDelay = _PLAYBACK_INTENT_MONITOR_DELAY_MS;
		try {
			const currentMediaKey = _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey);
			const observedMedia = _PlaybackIntentState.observedMedia;
			const didLoseObservedMedia = Boolean(
				observedMedia && !observedMedia.isConnected,
			);
			const idleSyncDelay = currentMediaKey
				? _PLAYBACK_INTENT_IDLE_SYNC_DELAY_MS
				: _PLAYBACK_INTENT_NO_MEDIA_ROUTE_DELAY_MS;
			const isHidden = _isNativeDocumentHidden();
			const hiddenSyncDelay = Math.max(idleSyncDelay, 5000);
			const syncDelay = isHidden ? hiddenSyncDelay : idleSyncDelay;
			const now = Date.now();
			if (
				currentMediaKey !== lastSyncedMediaKey ||
				didLoseObservedMedia ||
				(!observedMedia?.isConnected && now - lastSyncAttemptAt >= syncDelay)
			) {
				lastSyncAttemptAt = now;
				_syncPrimaryMediaPlaybackIntent();
				lastSyncedMediaKey = currentMediaKey;
			}
			nextDelay = _PlaybackIntentState.observedMedia?.isConnected
				? isHidden
					? hiddenSyncDelay
					: _PLAYBACK_INTENT_MONITOR_DELAY_MS
				: syncDelay;

			if (
				currentMediaKey &&
				_PlaybackIntentState.userPausedMediaKey &&
				_PlaybackIntentState.userPausedMediaKey !== currentMediaKey
			) {
				_clearRecordedUserPauseIntent();
			}
			if (
				_PlaybackIntentState.suppressedPauseMediaKey &&
				currentMediaKey &&
				_PlaybackIntentState.suppressedPauseMediaKey !== currentMediaKey
			) {
				_PlaybackIntentState.suppressedPauseMediaKey = null;
				_PlaybackIntentState.suppressedPauseUntil = 0;
			}
		} catch (err) {
			_log(`Playback intent monitor error: ${err.message}`, "warning");
		}

		setTimeout(check, nextDelay);
	}

	check();
	_log("Playback intent monitor active", "info");
}

function _resumeActivePlayerIfPaused(channel = null, mediaKey = null) {
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	if (_hasUserPauseIntent(safeChannel, safeMediaKey)) {
		return false;
	}

	const { player, state: playerState } = _getPlayerAndState();
	if (!player || !playerState?.props?.content) {
		return false;
	}

	const playerCore = _getPlayerCore(player);
	const video = player.getHTMLVideoElement?.() || null;
	if (video?.ended) return false;

	const isPaused = _isPlayerPaused(player, playerCore, video);
	if (!isPaused) return false;

	return _playPlaybackTarget(player, safeChannel, safeMediaKey);
}

function _scheduleResumeRetries(
	channel = null,
	mediaKey = null,
	delays = [120, 350, 900],
	options: { requireAdResumeIntent?: boolean } = {},
) {
	if (!Array.isArray(delays) || delays.length === 0) return;

	for (const delay of delays) {
		if (!Number.isFinite(delay) || delay < 0) continue;
		_schedulePlaybackRecoveryTimeout(
			() => {
				if (
					options.requireAdResumeIntent &&
					!_canAttemptAdResume(channel, mediaKey)
				) {
					return;
				}
				_resumeActivePlayerIfPaused(channel, mediaKey);
			},
			delay,
			channel,
			mediaKey,
		);
	}
}

function _getFallbackPrimaryVideoElement() {
	const videos = Array.from(document.querySelectorAll("video"));
	let bestVideo = null;
	let bestArea = 0;

	for (const video of videos) {
		if (!(video instanceof HTMLMediaElement)) continue;
		const rect = video.getBoundingClientRect();
		const area = Math.max(0, rect.width) * Math.max(0, rect.height);
		if (area <= 0) continue;
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
	const currentMediaKey = __TTVAB_STATE__.PageMediaKey;
	const now = Date.now();
	if (_cachedPrimaryMediaElementKey === currentMediaKey) {
		if (_cachedPrimaryMediaElement?.isConnected) {
			return _cachedPrimaryMediaElement;
		}
		if (
			_cachedPrimaryMediaElement === null &&
			now - _cachedPrimaryMediaElementSearchedAt <
				_PLAYBACK_INTENT_IDLE_SYNC_DELAY_MS
		) {
			return null;
		}
	}

	const { player } = _getPlayerAndState();
	const playerVideo = player?.getHTMLVideoElement?.() || null;
	const media =
		playerVideo instanceof HTMLMediaElement && playerVideo.isConnected
			? playerVideo
			: _getFallbackPrimaryVideoElement();

	_cachedPrimaryMediaElement =
		media instanceof HTMLMediaElement && media.isConnected ? media : null;
	_cachedPrimaryMediaElementKey = currentMediaKey;
	_cachedPrimaryMediaElementSearchedAt = now;
	return media;
}

function _restoreSuppressedMediaElement(media, state) {
	if (!(media instanceof HTMLMediaElement)) return false;
	try {
		media.defaultMuted = Boolean(state?.defaultMuted);
		media.muted = Boolean(state?.muted);
		if (Number.isFinite(state?.volume)) {
			media.volume = Math.min(1, Math.max(0, state.volume));
		}
		media.removeAttribute("data-ttvab-audio-suppressed");
		return true;
	} catch {
		return false;
	}
}

function _pruneDisconnectedSuppressedMedia() {
	let prunedCount = 0;
	for (const [media] of _AdAudioSuppressionState.suppressedMedia.entries()) {
		if (media instanceof HTMLMediaElement && media.isConnected) continue;
		_AdAudioSuppressionState.suppressedMedia.delete(media);
		prunedCount += 1;
	}

	if (_AdAudioSuppressionState.suppressedMedia.size === 0) {
		_AdAudioSuppressionState.activeMediaKey = null;
		_AdAudioSuppressionState.lastSuppressedCount = 0;
	} else if (prunedCount > 0) {
		_AdAudioSuppressionState.lastSuppressedCount = Math.max(
			0,
			_AdAudioSuppressionState.suppressedMedia.size,
		);
	}

	return prunedCount;
}

function _clearSuppressedMediaTracking(
	options: { restoreConnected?: boolean } = {},
) {
	const { restoreConnected = false } = options;
	let restoredCount = 0;

	for (const [
		media,
		state,
	] of _AdAudioSuppressionState.suppressedMedia.entries()) {
		if (
			restoreConnected &&
			media instanceof HTMLMediaElement &&
			media.isConnected &&
			_restoreSuppressedMediaElement(media, state)
		) {
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
		if (!(media instanceof HTMLMediaElement)) continue;
		if (!media.isConnected || media.ended) continue;
		if (primaryMedia && media === primaryMedia) continue;
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
		} catch {}
	}

	_AdAudioSuppressionState.activeMediaKey = safeMediaKey;
	_AdAudioSuppressionState.lastSuppressedCount = suppressedCount;
	if (suppressedCount > 0) {
		_log(
			`Suppressed ${suppressedCount} competing media element${suppressedCount === 1 ? "" : "s"} during ad recovery`,
			"info",
		);
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
	for (const [
		media,
		state,
	] of _AdAudioSuppressionState.suppressedMedia.entries()) {
		if (_restoreSuppressedMediaElement(media, state)) {
			restoredCount += 1;
		}
	}

	_AdAudioSuppressionState.suppressedMedia.clear();
	_AdAudioSuppressionState.activeMediaKey = null;
	_AdAudioSuppressionState.lastSuppressedCount = 0;
	if (restoredCount > 0) {
		_log(
			`Restored ${restoredCount} suppressed media element${restoredCount === 1 ? "" : "s"} after ad`,
			"info",
		);
	}
	return restoredCount;
}

function _clearAdResumeIntent() {
	__TTVAB_STATE__.ShouldResumeAfterAd = false;
	__TTVAB_STATE__.ShouldResumeAfterAdChannel = null;
	__TTVAB_STATE__.ShouldResumeAfterAdMediaKey = null;
	__TTVAB_STATE__.ShouldResumeAfterAdUntil = 0;
}

function _isCurrentAdCycleMatchingResumeIntent() {
	const expectedChannel = _normalizePlayerChannel(
		__TTVAB_STATE__.ShouldResumeAfterAdChannel,
	);
	const expectedMediaKey = _normalizeMediaKey(
		__TTVAB_STATE__.ShouldResumeAfterAdMediaKey,
	);
	const activeAdChannel = _normalizePlayerChannel(
		__TTVAB_STATE__.CurrentAdChannel,
	);
	const activeAdMediaKey = _normalizeMediaKey(
		__TTVAB_STATE__.CurrentAdMediaKey,
	);

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

function _maybeClearTransientPauseIntentAfterAd(
	channel = null,
	mediaKey = null,
) {
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	if (!_hasUserPauseIntent(safeChannel, safeMediaKey)) return false;
	if (!_hasPendingAdResumeIntent(safeChannel, safeMediaKey)) return false;

	const pauseAt = Number(_PlaybackIntentState.userPausedAt) || 0;
	const pauseWasDuringAdWithoutInteraction =
		_PlaybackIntentState.userPausedDuringAd === true &&
		_PlaybackIntentState.userPausedHadExplicitInteraction !== true;
	const lastAdDetectedAt = Number(__TTVAB_STATE__.LastAdDetectedAt) || 0;
	const pauseWasNearAdStart =
		lastAdDetectedAt > 0 &&
		pauseAt > 0 &&
		pauseAt <= lastAdDetectedAt + _AD_TRANSIENT_PAUSE_CLEAR_WINDOW_MS &&
		_PlaybackIntentState.userPausedHadExplicitInteraction !== true;
	const wasLikelyTransient =
		pauseWasDuringAdWithoutInteraction || pauseWasNearAdStart;

	if (!wasLikelyTransient) return false;
	return _clearUserPauseIntent(safeChannel, safeMediaKey);
}

function _canAttemptAdResume(channel = null, mediaKey = null) {
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	if (!_hasPendingAdResumeIntent(safeChannel, safeMediaKey)) return false;
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
			_clearAdResumeIntent();
			return false;
		}
		_extendAdResumeIntentWindow();
	}

	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	const expectedChannel = __TTVAB_STATE__.ShouldResumeAfterAdChannel || null;
	const expectedMediaKey = __TTVAB_STATE__.ShouldResumeAfterAdMediaKey || null;
	return _matchesPlaybackTargetContext(
		expectedChannel,
		expectedMediaKey,
		safeChannel,
		safeMediaKey,
	);
}

function _rememberPlayerPlaybackForAd(channel = null, mediaKey = null) {
	const safeChannel =
		_normalizePlayerChannel(channel) ||
		_normalizePlayerChannel(__TTVAB_STATE__.CurrentAdChannel) ||
		_normalizePlayerChannel(__TTVAB_STATE__.PageChannel);
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	const { player, state: playerState } = _getPlayerAndState();

	if (
		safeMediaKey &&
		_PlaybackIntentState.userPausedMediaKey === safeMediaKey &&
		_PlaybackIntentState.userPausedHadExplicitInteraction !== true &&
		Date.now() - (Number(_PlaybackIntentState.userPausedAt) || 0) <=
			_AD_TRANSIENT_PAUSE_CLEAR_WINDOW_MS
	) {
		_clearUserPauseIntent(safeChannel, safeMediaKey);
	}

	let shouldResumeAfterAd = !_hasUserPauseIntent(safeChannel, safeMediaKey);
	if (player && playerState?.props?.content) {
		const video = player.getHTMLVideoElement?.() || null;
		const contentType =
			typeof playerState?.props?.content?.type === "string"
				? playerState.props.content.type
				: null;
		const allowEndedReplayRecovery =
			typeof contentType === "string" && contentType !== "live";
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
	if (!_canAttemptAdResume(channel, mediaKey)) return false;
	return _resumeActivePlayerIfPaused(channel, mediaKey);
}

function _resumePlayerAfterAdIfNeeded(channel = null, mediaKey = null) {
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	if (!_hasPendingAdResumeIntent(safeChannel, safeMediaKey)) return false;

	const { player, state: playerState } = _getPlayerAndState();
	if (!player || !playerState?.props?.content) {
		return false;
	}

	const playerCore = _getPlayerCore(player);
	const video = player.getHTMLVideoElement?.() || null;
	if (video?.ended) {
		_log("Player ended after ad; deferring recovery to buffer monitor", "info");
		return false;
	}

	_maybeClearTransientPauseIntentAfterAd(safeChannel, safeMediaKey);
	if (_hasUserPauseIntent(safeChannel, safeMediaKey)) {
		_clearAdResumeIntent();
		return false;
	}

	if (_isPlaybackHealthyAfterAd(player, playerCore, video)) {
		_clearAdResumeIntent();
		return false;
	}

	const isPaused = _isPlayerPaused(player, playerCore, video);
	if (!isPaused) {
		return false;
	}

	const now = Date.now();
	if (
		__TTVAB_STATE__.LastAdRecoveryResumeAt &&
		now - __TTVAB_STATE__.LastAdRecoveryResumeAt < 1500
	) {
		_log("Suppressing duplicate programmatic resume", "warning");
		return false;
	}
	__TTVAB_STATE__.LastAdRecoveryResumeAt = now;

	const didResume = _playPlaybackTarget(player, safeChannel, safeMediaKey);
	if (!didResume) {
		if (_hasUserPauseIntent(safeChannel, safeMediaKey)) {
			_clearAdResumeIntent();
			_log("Skipping post-ad resume because playback is user-paused", "info");
		}
		return false;
	}

	_schedulePlaybackRecoveryTimeout(
		() => {
			if (!_hasPendingAdResumeIntent(safeChannel, safeMediaKey)) return;
			const { player: confirmPlayer } = _getPlayerAndState();
			const confirmCore = _getPlayerCore(confirmPlayer);
			const confirmVideo = confirmPlayer?.getHTMLVideoElement?.() || null;
			if (_isPlaybackHealthyAfterAd(confirmPlayer, confirmCore, confirmVideo)) {
				_clearAdResumeIntent();
			}
		},
		900,
		safeChannel,
		safeMediaKey,
	);

	_log("Resuming player after ad", "info");
	return true;
}

function _retryPostAdPauseResume(channel = null, mediaKey = null) {
	const now = Date.now();
	if (
		__TTVAB_STATE__.LastAdRecoveryResumeAt &&
		now - __TTVAB_STATE__.LastAdRecoveryResumeAt <
			_POST_AD_PAUSE_RESUME_RETRY_MS
	) {
		return false;
	}

	__TTVAB_STATE__.LastAdRecoveryResumeAt = now;
	const didRetry = _doPlayerTask(true, false, { reason: "ad-recovery" });
	if (didRetry) {
		_scheduleResumeRetries(channel, mediaKey, [250, 700, 1400]);
	}
	return Boolean(didRetry);
}

function _handlePendingPostAdRecovery(
	player,
	playerCore = null,
	video = null,
	channel = null,
	mediaKey = null,
	contentType = null,
) {
	const now = Date.now();
	if (!_PlayerBufferState.postAdRecoveryStartedAt) {
		_PlayerBufferState.postAdRecoveryStartedAt = now;
	}
	const recoveryAge = now - _PlayerBufferState.postAdRecoveryStartedAt;
	const canSoftReload = recoveryAge >= _POST_AD_SOFT_RELOAD_DELAY_MS;

	if (_isPlaybackHealthyAfterAd(player, playerCore, video)) {
		_clearAdResumeIntent();
		_PlayerBufferState.postAdUnhealthyCount = 0;
		_PlayerBufferState.postAdRecoveryStartedAt = 0;
		return true;
	}

	if (video?.ended) {
		if (!canSoftReload) {
			_PlayerBufferState.postAdUnhealthyCount++;
			_retryPostAdPauseResume(channel, mediaKey);
			return true;
		}

		_log(
			contentType && contentType !== "live"
				? "Replay/VOD player ended after ad. Reloading native player..."
				: "Player hit end of stream after ad. Reloading native player...",
			"warning",
		);
		_doPlayerTask(false, true, {
			reason: "ad-recovery",
			refreshAccessToken: true,
			newMediaPlayerInstance: false,
		});
		_clearAdResumeIntent();
		_PlayerBufferState.lastFixTime = Date.now();
		_PlayerBufferState.postAdUnhealthyCount = 0;
		_PlayerBufferState.postAdRecoveryStartedAt = 0;
		return true;
	}

	if (
		_isPlayerPaused(player, playerCore, video) &&
		(!__TTVAB_STATE__.LastAdRecoveryResumeAt ||
			Date.now() - __TTVAB_STATE__.LastAdRecoveryResumeAt >= 1500) &&
		_resumePlayerAfterAdIfNeeded(channel, mediaKey)
	) {
		_PlayerBufferState.postAdUnhealthyCount++;
		return true;
	}

	_PlayerBufferState.postAdUnhealthyCount++;
	if (
		_PlayerBufferState.postAdUnhealthyCount >=
			_POST_AD_UNHEALTHY_RELOAD_COUNT &&
		_PlayerBufferState.lastFixTime <= now - _POST_AD_RECOVERY_RELOAD_COOLDOWN_MS
	) {
		if (!canSoftReload) {
			if (_retryPostAdPauseResume(channel, mediaKey)) {
				_PlayerBufferState.lastFixTime = now;
			}
			return true;
		}

		_log(
			contentType && contentType !== "live"
				? "Replay/VOD player still stalling after ad. Reloading native player..."
				: "Player still stalling after ad. Reloading native player...",
			"warning",
		);
		_doPlayerTask(false, true, {
			reason: "ad-recovery",
			refreshAccessToken: true,
			newMediaPlayerInstance: false,
		});
		_clearAdResumeIntent();
		_PlayerBufferState.lastFixTime = Date.now();
		_PlayerBufferState.postAdUnhealthyCount = 0;
		_PlayerBufferState.postAdRecoveryStartedAt = 0;
		return true;
	}

	return false;
}

function _capturePlayerPreferenceSnapshot(playerCore = null) {
	const snapshot = Object.create(null);

	try {
		for (const key of _PLAYER_PREFERENCE_KEYS) {
			snapshot[key] = localStorage.getItem(key);
		}

		if (playerCore?.state) {
			snapshot["video-muted"] = JSON.stringify({
				default: Boolean(playerCore.state.muted),
			});
			snapshot.volume = String(playerCore.state.volume);
		}

		if (playerCore?.state?.quality?.group) {
			snapshot["video-quality"] = JSON.stringify({
				default: playerCore.state.quality.group,
			});
		}
	} catch (err) {
		_log(`Preference snapshot failed: ${err.message}`, "warning");
		return null;
	}

	return snapshot;
}

function _restorePlayerPreferenceSnapshot(
	snapshot,
	options: { channel?: string | null; mediaKey?: string | null } = {},
) {
	if (!snapshot || typeof snapshot !== "object") return false;

	const safeChannel = _normalizePlayerChannel(options.channel);
	const safeMediaKey = _normalizeMediaKey(options.mediaKey);
	if (
		(safeChannel || safeMediaKey) &&
		!_isPlaybackRecoveryContextCurrent(safeChannel, safeMediaKey)
	) {
		return false;
	}

	try {
		for (const key of _PLAYER_PREFERENCE_KEYS) {
			if (!Object.hasOwn(snapshot, key)) continue;
			const value = snapshot[key];
			if (value === null || typeof value === "undefined") {
				localStorage.removeItem(key);
				continue;
			}
			localStorage.setItem(key, String(value));
		}
	} catch (err) {
		_log(`Preference restore failed: ${err.message}`, "warning");
		return false;
	}

	return true;
}

function _schedulePlayerPreferenceRestore(
	snapshot,
	channel = null,
	mediaKey = null,
	delay = 3000,
) {
	if (!snapshot || typeof snapshot !== "object") {
		return false;
	}

	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	_clearPendingPlayerPreferenceRestore();
	_PlayerPreferenceRestoreState.channel = safeChannel;
	_PlayerPreferenceRestoreState.mediaKey = safeMediaKey;
	_PlayerPreferenceRestoreState.timeoutId = setTimeout(
		() => {
			const restoreChannel = _PlayerPreferenceRestoreState.channel;
			const restoreMediaKey = _PlayerPreferenceRestoreState.mediaKey;
			_clearPendingPlayerPreferenceRestore();
			_restorePlayerPreferenceSnapshot(snapshot, {
				channel: restoreChannel,
				mediaKey: restoreMediaKey,
			});
		},
		Math.max(0, delay),
	);
	return true;
}

function _doPlayerTask(
	isPausePlay,
	isReload,
	options: {
		reason?: string;
		refreshAccessToken?: boolean;
		newMediaPlayerInstance?: boolean;
	} = {},
) {
	const { player, state: playerState } = _getPlayerAndState();

	if (!player) {
		_log("Could not find player", "warning");
		return;
	}

	if (!playerState && isReload) {
		_log("Could not find player state for reload", "warning");
		return;
	}

	const playerCore = _getPlayerCore(player);

	if (isPausePlay) {
		if (_isPlayerPaused(player, playerCore)) {
			const didResume = _playPlaybackTarget(
				player,
				__TTVAB_STATE__.PageChannel,
				__TTVAB_STATE__.PageMediaKey,
			);
			if (didResume) {
				_scheduleResumeRetries(
					__TTVAB_STATE__.PageChannel,
					__TTVAB_STATE__.PageMediaKey,
					[80, 220, 500],
				);
			}
			return didResume;
		}
		_suppressPauseIntent(
			__TTVAB_STATE__.PageChannel,
			__TTVAB_STATE__.PageMediaKey,
			3000,
		);
		_pausePlaybackTarget(player);
		setTimeout(() => {
			const { player: freshPlayer } = _getPlayerAndState();
			const resumeTarget = freshPlayer || player;
			_playPlaybackTarget(
				resumeTarget,
				__TTVAB_STATE__.PageChannel,
				__TTVAB_STATE__.PageMediaKey,
			);
			_scheduleResumeRetries(
				__TTVAB_STATE__.PageChannel,
				__TTVAB_STATE__.PageMediaKey,
				[150, 400, 800],
			);
		}, 60);
		return true;
	}

	if (isReload) {
		const reason = options.reason || "manual";
		const isAdRecoveryReload = reason === "ad-recovery";
		const isPlaybackRecoveryReload =
			isAdRecoveryReload || reason === "buffer-recovery";
		const now = Date.now();
		const lastPlayerReloadAt = __TTVAB_STATE__.LastPlayerReloadAt || 0;
		if (
			lastPlayerReloadAt &&
			now - lastPlayerReloadAt < __TTVAB_STATE__.PlayerReloadDebounceMs
		) {
			_log(`Suppressing duplicate reload (${reason})`, "warning");
			return false;
		}

		if (
			isAdRecoveryReload &&
			(__TTVAB_STATE__.CurrentAdMediaKey || __TTVAB_STATE__.CurrentAdChannel) &&
			__TTVAB_STATE__.LastAdRecoveryReloadAt &&
			now - __TTVAB_STATE__.LastAdRecoveryReloadAt <
				__TTVAB_STATE__.AdRecoveryReloadCooldownMs
		) {
			_log(
				`Suppressing duplicate ad recovery reload for ${__TTVAB_STATE__.CurrentAdMediaKey || __TTVAB_STATE__.CurrentAdChannel}`,
				"warning",
			);
			return false;
		}

		__TTVAB_STATE__.LastPlayerReloadAt = now;
		if (isAdRecoveryReload) {
			__TTVAB_STATE__.LastAdRecoveryReloadAt = now;
		}
		if (reason !== "manual") {
			_suppressPauseIntent(
				__TTVAB_STATE__.PageChannel,
				__TTVAB_STATE__.PageMediaKey,
				3000,
			);
		}
		_clearCachedPlayerRef(true, __TTVAB_STATE__.PlayerReloadDebounceMs || 0);
		const preferenceSnapshot = _capturePlayerPreferenceSnapshot(playerCore);

		if (reason === "manual") {
			_log("Reloading player", "info");
		}
		playerState.setSrc({
			isNewMediaPlayerInstance: options.newMediaPlayerInstance !== false,
			refreshAccessToken: options.refreshAccessToken !== false,
		});

		_broadcastWorkers({
			key: "TriggeredPlayerReload",
			value: {
				mediaType: __TTVAB_STATE__.PageMediaType,
				channelName: __TTVAB_STATE__.PageChannel,
				vodID: __TTVAB_STATE__.PageVodID,
				mediaKey: __TTVAB_STATE__.PageMediaKey,
			},
		});

		_playPlaybackTarget(
			player,
			__TTVAB_STATE__.PageChannel,
			__TTVAB_STATE__.PageMediaKey,
		);
		_scheduleResumeRetries(
			__TTVAB_STATE__.PageChannel,
			__TTVAB_STATE__.PageMediaKey,
			[180, 500, 1100],
		);

		if (isPlaybackRecoveryReload) {
			setTimeout(() => {
				try {
					const { player: livePlayer, state: liveState } = _getPlayerAndState();
					const confirmType = liveState?.props?.content?.type;
					if (
						(confirmType === "live" || confirmType === "rerun") &&
						livePlayer
					) {
						const liveCore = _getPlayerCore(livePlayer);
						const liveVideo = livePlayer.getHTMLVideoElement?.();
						if (
							liveVideo &&
							!liveVideo.ended &&
							liveVideo.buffered?.length > 0
						) {
							const liveEdge = liveVideo.buffered.end(
								liveVideo.buffered.length - 1,
							);
							const videoCurrentPos = Number(liveVideo.currentTime);
							const currentPos = Number.isFinite(videoCurrentPos)
								? videoCurrentPos
								: Number(liveCore?.state?.position) || 0;
							if (liveEdge - currentPos > 2) {
								liveVideo.currentTime = Math.max(0, liveEdge - 0.5);
								_log(
									`Post-ad live edge seek (drift=${(liveEdge - currentPos).toFixed(1)}s)`,
									"info",
								);
							}
						}
					}
				} catch {}
			}, 1500);
		}

		if (preferenceSnapshot) {
			_schedulePlayerPreferenceRestore(
				preferenceSnapshot,
				__TTVAB_STATE__.PageChannel,
				__TTVAB_STATE__.PageMediaKey,
				3000,
			);
		}

		return true;
	}

	return false;
}

function _monitorPlayerBuffering() {
	function check() {
		const currentMediaKey = _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey);
		const hasActiveAdContext = Boolean(
			__TTVAB_STATE__.CurrentAdMediaKey || __TTVAB_STATE__.CurrentAdChannel,
		);
		const hasPendingPostAdResume =
			!hasActiveAdContext &&
			(_hasPendingAdResumeIntent(
				__TTVAB_STATE__.PageChannel,
				currentMediaKey,
			) ||
				_hasPendingAdResumeIntent(
					__TTVAB_STATE__.CurrentAdChannel,
					__TTVAB_STATE__.CurrentAdMediaKey,
				));
		const hasAdRecoveryContext = Boolean(
			hasActiveAdContext || hasPendingPostAdResume,
		);
		if (!hasPendingPostAdResume) {
			_PlayerBufferState.postAdUnhealthyCount = 0;
			_PlayerBufferState.postAdRecoveryStartedAt = 0;
		}
		const isHidden = _isNativeDocumentHidden();
		const hiddenDelay = Math.max(
			__TTVAB_STATE__.PlayerBufferingDelay * 8,
			5000,
		);
		const nextDelay = isHidden
			? hiddenDelay
			: __TTVAB_STATE__.PlayerBufferingDelay;
		const idleDelay = isHidden
			? hiddenDelay
			: Math.max(__TTVAB_STATE__.PlayerBufferingDelay * 5, 3000);
		if (!__TTVAB_STATE__.IsBufferFixEnabled && !hasAdRecoveryContext) {
			setTimeout(check, idleDelay);
			return;
		}
		const hasLivePlaybackContext =
			__TTVAB_STATE__.PageMediaType === "live" && Boolean(currentMediaKey);
		if (!hasLivePlaybackContext) {
			_clearCachedPlayerRef();
			setTimeout(check, idleDelay);
			return;
		}

		if (isHidden && !hasAdRecoveryContext) {
			_clearCachedPlayerRef();
			setTimeout(check, nextDelay);
			return;
		}

		if (_cachedPlayerRefMediaKey !== currentMediaKey) {
			_clearCachedPlayerRef();
		}

		if (_cachedPlayerRef) {
			try {
				const player = _cachedPlayerRef.player;
				const state = _cachedPlayerRef.state;
				const playerCore = _getPlayerCore(player);
				const playerContentType =
					typeof state?.props?.content?.type === "string"
						? state.props.content.type
						: null;

				if (!playerCore) {
					_clearCachedPlayerRef();
				} else if (hasPendingPostAdResume) {
					const video = player.getHTMLVideoElement?.() || null;
					_handlePendingPostAdRecovery(
						player,
						playerCore,
						video,
						__TTVAB_STATE__.PageChannel,
						currentMediaKey,
						playerContentType,
					);
					if (
						playerContentType &&
						playerContentType !== "live" &&
						playerContentType !== "rerun"
					) {
						if (
							!_hasPendingAdResumeIntent(
								__TTVAB_STATE__.PageChannel,
								currentMediaKey,
							)
						) {
							_clearCachedPlayerRef(false);
						}
					}
				} else if (
					playerContentType &&
					playerContentType !== "live" &&
					playerContentType !== "rerun"
				) {
					_clearCachedPlayerRef();
				} else if (
					playerContentType === "live" &&
					player.getHTMLVideoElement()?.ended &&
					(__TTVAB_STATE__.IsBufferFixEnabled || hasAdRecoveryContext)
				) {
					const recoveryReason =
						__TTVAB_STATE__.CurrentAdMediaKey ||
						__TTVAB_STATE__.CurrentAdChannel
							? "ad-recovery"
							: "buffer-recovery";
					_log(
						"Player hit end of stream during live playback. Recovering...",
						"warning",
					);
					_doPlayerTask(false, true, { reason: recoveryReason });
					_PlayerBufferState.lastFixTime = Date.now();
				} else if (
					__TTVAB_STATE__.IsBufferFixEnabled &&
					(playerContentType === "live" || playerContentType === "rerun") &&
					!_isPlayerPaused(player, playerCore) &&
					!player.getHTMLVideoElement()?.ended &&
					_PlayerBufferState.lastFixTime <=
						Date.now() - __TTVAB_STATE__.PlayerBufferingMinRepeatDelay
				) {
					const recoveryReason =
						__TTVAB_STATE__.CurrentAdMediaKey ||
						__TTVAB_STATE__.CurrentAdChannel
							? "ad-recovery"
							: "buffer-recovery";
					const {
						video,
						position,
						bufferedPosition,
						bufferDuration,
						currentTime,
						liveEdgeDistance,
						readyState,
						hasFutureData,
					} = _readPlayerBufferTelemetry(player, playerCore);
					const isStablePosition = _PlayerBufferState.position === position;
					const isStableBufferedPosition =
						_PlayerBufferState.bufferedPosition === bufferedPosition;
					const isBufferRegressing =
						_PlayerBufferState.bufferDuration >= bufferDuration;
					const hasPlaybackState =
						position !== 0 || bufferedPosition !== 0 || bufferDuration !== 0;
					const isLikelyLiveEdgeStarvation =
						hasPlaybackState &&
						bufferDuration < __TTVAB_STATE__.PlayerBufferingDangerZone &&
						isStablePosition &&
						isStableBufferedPosition &&
						isBufferRegressing &&
						!hasFutureData;

					if (
						(!__TTVAB_STATE__.PlayerBufferingPrerollCheckEnabled ||
							position > __TTVAB_STATE__.PlayerBufferingPrerollCheckOffset) &&
						isLikelyLiveEdgeStarvation
					) {
						_PlayerBufferState.liveEdgeStarveCount++;
						_PlayerBufferState.numSame = 0;
						_PlayerBufferState.fixAttempts = 0;

						if (
							_PlayerBufferState.liveEdgeStarveCount ===
							__TTVAB_STATE__.PlayerBufferingSameStateCount
						) {
							_log(
								`Live edge temporarily empty; skipping pause/play (pos=${position}, edge=${liveEdgeDistance.toFixed(3)}s, readyState=${readyState})`,
								"info",
							);
						}

						if (
							_PlayerBufferState.liveEdgeStarveCount >=
							_PLAYER_BUFFER_LIVE_EDGE_RELOAD_COUNT
						) {
							_log(
								`Persistent live-edge starvation detected; reloading player (pos=${position}, edge=${liveEdgeDistance.toFixed(3)}s, readyState=${readyState})`,
								"warning",
							);
							_doPlayerTask(false, true, {
								reason: recoveryReason,
							});
							_PlayerBufferState.lastFixTime = Date.now();
							_PlayerBufferState.liveEdgeStarveCount = 0;
						}
					} else if (
						(!__TTVAB_STATE__.PlayerBufferingPrerollCheckEnabled ||
							position > __TTVAB_STATE__.PlayerBufferingPrerollCheckOffset) &&
						hasPlaybackState &&
						isStablePosition &&
						isStableBufferedPosition &&
						isBufferRegressing
					) {
						_PlayerBufferState.liveEdgeStarveCount = 0;
						_PlayerBufferState.numSame++;

						if (
							_PlayerBufferState.numSame ===
							__TTVAB_STATE__.PlayerBufferingSameStateCount
						) {
							_log(
								`Attempting buffer fix (pos=${position}, edge=${liveEdgeDistance.toFixed(3)}s, readyState=${readyState})`,
								"warning",
							);
							_PlayerBufferState.fixAttempts++;
							if (
								__TTVAB_STATE__.PlayerBufferingDoPlayerReload ||
								_PlayerBufferState.fixAttempts >= 3
							) {
								_doPlayerTask(false, true, {
									reason: recoveryReason,
								});
							} else {
								_doPlayerTask(true, false);
							}
							_PlayerBufferState.lastFixTime = Date.now();
							_PlayerBufferState.numSame = 0;
						}
					} else {
						_PlayerBufferState.liveEdgeStarveCount = 0;
						_PlayerBufferState.numSame = 0;
						_PlayerBufferState.fixAttempts = 0;
					}

					_PlayerBufferState.position = position;
					_PlayerBufferState.bufferedPosition = bufferedPosition;
					_PlayerBufferState.bufferDuration = bufferDuration;

					const driftVideo = video;
					if (
						driftVideo &&
						!driftVideo.ended &&
						driftVideo.buffered?.length > 0
					) {
						const driftLiveEdge = driftVideo.buffered.end(
							driftVideo.buffered.length - 1,
						);
						const driftAmount = driftLiveEdge - currentTime;
						if (
							driftAmount > 4 &&
							isStablePosition &&
							hasFutureData &&
							readyState >= 3
						) {
							driftVideo.currentTime = Math.max(0, driftLiveEdge - 0.5);
							_log(
								`A/V desync corrected (drift=${driftAmount.toFixed(1)}s)`,
								"warning",
							);
							_PlayerBufferState.lastFixTime = Date.now();
						}
					}
				}
			} catch (err) {
				_log(`Buffer monitor error: ${err.message}`, "error");
				_clearCachedPlayerRef();
			}
		}

		if (!_cachedPlayerRef) {
			const playerAndState = _getPlayerAndState();
			if (playerAndState.player && playerAndState.state) {
				_cachedPlayerRef = playerAndState;
				_cachedPlayerRefMediaKey = currentMediaKey;
			}
		}

		setTimeout(check, nextDelay);
	}

	check();
	_log("Buffer monitor active", "info");
}

function _hookVisibilityState() {
	if (!window.__TTVAB_NATIVE_VISIBILITY__) {
		window.__TTVAB_NATIVE_VISIBILITY__ = {
			hidden: document.__lookupGetter__?.("hidden") || null,
			webkitHidden: document.__lookupGetter__?.("webkitHidden") || null,
			mozHidden: document.__lookupGetter__?.("mozHidden") || null,
			visibilityState: document.__lookupGetter__?.("visibilityState") || null,
		};
	}

	_log("Visibility tracking active", "info");
}
