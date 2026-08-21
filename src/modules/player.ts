// TTV AB - Player

const _PlayerBufferState = {
	position: 0,
	bufferedPosition: 0,
	bufferDuration: 0,
	numSame: 0,
	lastFixTime: 0,
	fixAttempts: 0,
	liveEdgeStarveCount: 0,
	gapJumpLastPosition: -1,
	gapJumpStuckTicks: 0,
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

let _cachedPlayerRef = null;
let _cachedPlayerRefMediaKey = null;
let _cachedReactRootNode = null;
let _cachedReactContainerKey = null;
const _AdAudioSuppressionState = {
	suppressedMedia: new Map(),
	detachedMediaStates: new WeakMap(),
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
	secondaryPlayerWindows: new Map<
		Window,
		{
			channel: string | null;
			mediaKey: string | null;
			sourceWasPlaying: boolean;
		}
	>(),
	secondaryPlayerCloseMonitorId: null as ReturnType<typeof setInterval> | null,
	pictureInPictureElement: null as HTMLVideoElement | null,
	pictureInPictureMediaType: null as string | null,
	pictureInPictureChannel: null as string | null,
	pictureInPictureVodID: null as string | null,
	pictureInPictureMediaKey: null as string | null,
	pictureInPicturePauseListener: null as (() => void) | null,
	pictureInPicturePlayListener: null as (() => void) | null,
};
let _playbackIntentMonitorStarted = false;
let _playerBufferMonitorStarted = false;
let _playbackIntentMonitorTimer: ReturnType<typeof setTimeout> | null = null;
let _playerBufferMonitorTimer: ReturnType<typeof setTimeout> | null = null;
const _PlaybackRecoveryTimeoutState = {
	timeouts: new Set<{
		id: ReturnType<typeof setTimeout>;
		channel: string | null;
		mediaKey: string | null;
		cycleStartedAt: number;
	}>(),
};
const _PlayerPreferenceRestoreState = {
	timeoutId: null as ReturnType<typeof setTimeout> | null,
	channel: null as string | null,
	mediaKey: null as string | null,
	cycleStartedAt: 0,
};
const _PlayerPreferenceStorageState = {
	initialized: false,
	versions: new Map<string, number>(),
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
const _POST_AD_RECOVERY_MAX_RELOAD_REQUESTS = 4;
const _POST_AD_RECOVERY_MAX_ACCEPTED_RELOADS = 2;
const _POST_AD_RECOVERY_TRANSACTION_TIMEOUT_MS = 30000;
const _POST_AD_RECOVERY_TERMINAL_SETTLE_MS = 10000;
const _IN_AD_FREEZE_DETECT_MS = 5000;
const _IN_AD_FREEZE_ACTION_REPEAT_MS = 5000;
const _IN_AD_FREEZE_RELOAD_AFTER_ATTEMPTS = 2;
const _VISIBILITY_RESUME_RETRY_DELAYS_MS = [80, 250, 700, 1500];
const _HIDDEN_VISIBILITY_RESUME_RETRY_DELAYS_MS = [120, 500, 1500, 3000];
const _SECONDARY_PLAYER_HANDOFF_WINDOW_MS = 2700000;
const _SECONDARY_PLAYER_CLOSE_POLL_MS = 500;
const _HIDDEN_CLEAN_LIVE_STALL_DETECT_MS = 15000;
const _HIDDEN_CLEAN_LIVE_STALL_REPEAT_MS = 30000;
const _UNREADY_AD_MEDIA_RECOVERY_MS = 12000;
type PlayerTaskOptions = {
	reason?: string;
	handoffId?: string | null;
	refreshAccessToken?: boolean;
	newMediaPlayerInstance?: boolean;
	replaceCodecHandoff?: boolean;
	channel?: string | null;
	mediaKey?: string | null;
	cycleStartedAt?: number | null;
};
const _PostAdRecoveryTransactionState = {
	channel: null as string | null,
	mediaKey: null as string | null,
	cycleStartedAt: 0,
	video: null as HTMLMediaElement | null,
	observedAt: 0,
	lastCurrentTime: 0,
	stallTicks: 0,
	reloadRequestCount: 0,
	acceptedReloadCount: 0,
	lastReloadRequestAt: 0,
	expiresAt: 0,
	lastCheckedAt: 0,
	suspendedAt: 0,
	requiresReplacement: false,
	requiredReplacementVideo: null as WeakRef<HTMLMediaElement> | null,
	pendingOperation: null as {
		isPausePlay: boolean;
		isReload: boolean;
		options: PlayerTaskOptions;
	} | null,
	pendingOperationReadyAt: 0,
	initialOperationCompleted: false,
	terminalNudgeAttempted: false,
	passive: false,
};
const _PinnedBackupTimelineRestoreState = {
	mediaKey: null as string | null,
	cycleStartedAt: 0,
};
const _PinnedBackupStallState = {
	mediaKey: null as string | null,
	firstObservedAt: 0,
	lastCurrentTime: 0,
	lastBufferedEnd: 0,
	lastForceRefreshAt: 0,
	lastPinnedType: null,
	forceRefreshCount: 0,
	exhaustedLogged: false,
};
const _InAdFreezeState = {
	mediaKey: null as string | null,
	firstFrozenAt: 0,
	lastCurrentTime: -1,
	lastActionAt: 0,
	actionCount: 0,
};
const _HiddenCleanLiveStallState = {
	mediaKey: null as string | null,
	video: null as HTMLMediaElement | null,
	firstFrozenAt: 0,
	lastCurrentTime: -1,
	lastActionAt: 0,
};
const _FatalAdMediaRecoveryState = {
	video: null as HTMLMediaElement | null,
	mediaKey: null as string | null,
	recoveryId: null as string | null,
	recoveryKind: null as "media-error" | "unready" | null,
	pinnedType: null as string | null,
	cycleStartedAt: 0,
	unreadyStartedAt: 0,
	requestedAt: 0,
	committed: false,
};
function _resetInAdFreezeState(mediaKey = null) {
	_InAdFreezeState.mediaKey = _normalizeMediaKey(mediaKey);
	_InAdFreezeState.firstFrozenAt = 0;
	_InAdFreezeState.lastCurrentTime = -1;
	_InAdFreezeState.lastActionAt = 0;
	_InAdFreezeState.actionCount = 0;
}
function _resetHiddenCleanLiveStallState(mediaKey = null) {
	_HiddenCleanLiveStallState.mediaKey = _normalizeMediaKey(mediaKey);
	_HiddenCleanLiveStallState.video = null;
	_HiddenCleanLiveStallState.firstFrozenAt = 0;
	_HiddenCleanLiveStallState.lastCurrentTime = -1;
	_HiddenCleanLiveStallState.lastActionAt = 0;
}
function _resetFatalAdMediaRecoveryState(recoveryId = null) {
	if (recoveryId && _FatalAdMediaRecoveryState.recoveryId !== recoveryId) {
		return false;
	}
	_FatalAdMediaRecoveryState.video = null;
	_FatalAdMediaRecoveryState.mediaKey = null;
	_FatalAdMediaRecoveryState.recoveryId = null;
	_FatalAdMediaRecoveryState.recoveryKind = null;
	_FatalAdMediaRecoveryState.pinnedType = null;
	_FatalAdMediaRecoveryState.cycleStartedAt = 0;
	_FatalAdMediaRecoveryState.unreadyStartedAt = 0;
	_FatalAdMediaRecoveryState.requestedAt = 0;
	_FatalAdMediaRecoveryState.committed = false;
	return true;
}
function _getFatalAdMediaErrorCode(video) {
	const code = Number(video?.error?.code) || 0;
	return code >= 2 && code <= 4 ? code : 0;
}
function _createFatalAdMediaRecoveryId(mediaKey) {
	const cycleStartedAt = _getCurrentAdBreakStartedAt(mediaKey);
	let nonce = "";
	try {
		nonce = globalThis.crypto?.randomUUID?.() || "";
	} catch {}
	if (!nonce) {
		nonce = `${Math.random().toString(36).slice(2)}${Math.random()
			.toString(36)
			.slice(2)}`;
	}
	return `${mediaKey}:${cycleStartedAt}:${Date.now()}:fatal-media:${nonce}`;
}
function _isOwnedUnreadyAdMedia(video, pageMediaKey, cycleStartedAt) {
	const pinnedType =
		typeof __TTVAB_STATE__?.PinnedBackupPlayerType === "string" &&
		__TTVAB_STATE__.PinnedBackupPlayerType
			? __TTVAB_STATE__.PinnedBackupPlayerType
			: null;
	const pinnedMediaKey = _normalizeMediaKey(
		__TTVAB_STATE__?.PinnedBackupPlayerMediaKey,
	);
	const pageChannel = _normalizePlayerChannel(__TTVAB_STATE__?.PageChannel);
	let bufferedLength = 0;
	try {
		bufferedLength = Math.max(0, Number(video?.buffered?.length) || 0);
	} catch {
		return false;
	}
	return Boolean(
		video instanceof HTMLMediaElement &&
			video.isConnected &&
			!video.ended &&
			!video.error &&
			pageMediaKey &&
			_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) === pageMediaKey &&
			_getCurrentAdBreakStartedAt(pageMediaKey) === cycleStartedAt &&
			pinnedType &&
			pinnedMediaKey === pageMediaKey &&
			__TTVAB_STATE__?.PlayerHasPlayedOnce === true &&
			!_isNativeDocumentHidden() &&
			Number(video.readyState) === 0 &&
			Number(video.networkState) === 0 &&
			(Number(video.currentTime) || 0) === 0 &&
			bufferedLength === 0 &&
			_hasPendingAdResumeIntent(pageChannel, pageMediaKey) &&
			!_hasUserPauseIntent(pageChannel, pageMediaKey) &&
			!_shouldSuppressAutomaticPlaybackResume(pageChannel, pageMediaKey),
	);
}
function _checkFatalAdMediaRecovery(player) {
	const video = player?.getHTMLVideoElement?.() || null;
	const pageMediaKey = _normalizeMediaKey(__TTVAB_STATE__?.PageMediaKey);
	const adMediaKey = _normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey);
	const errorCode = _getFatalAdMediaErrorCode(video);
	const cycleStartedAt = _getCurrentAdBreakStartedAt(pageMediaKey);
	const isOwnedUnready =
		!errorCode && _isOwnedUnreadyAdMedia(video, pageMediaKey, cycleStartedAt);
	if (
		!(video instanceof HTMLMediaElement) ||
		video.ended ||
		!pageMediaKey ||
		adMediaKey !== pageMediaKey ||
		cycleStartedAt <= 0 ||
		(!errorCode && !isOwnedUnready)
	) {
		_resetFatalAdMediaRecoveryState();
		return false;
	}

	const now = Date.now();
	const recoveryKind = errorCode ? "media-error" : "unready";
	const pinnedType = isOwnedUnready
		? __TTVAB_STATE__.PinnedBackupPlayerType
		: null;
	const observationMatches = Boolean(
		_FatalAdMediaRecoveryState.video === video &&
			_FatalAdMediaRecoveryState.mediaKey === pageMediaKey &&
			_FatalAdMediaRecoveryState.cycleStartedAt === cycleStartedAt &&
			_FatalAdMediaRecoveryState.recoveryKind === recoveryKind &&
			(recoveryKind !== "unready" ||
				_FatalAdMediaRecoveryState.pinnedType === pinnedType),
	);
	if (!observationMatches) {
		_resetFatalAdMediaRecoveryState();
		_FatalAdMediaRecoveryState.video = video;
		_FatalAdMediaRecoveryState.mediaKey = pageMediaKey;
		_FatalAdMediaRecoveryState.recoveryKind = recoveryKind;
		_FatalAdMediaRecoveryState.pinnedType = pinnedType;
		_FatalAdMediaRecoveryState.cycleStartedAt = cycleStartedAt;
		_FatalAdMediaRecoveryState.unreadyStartedAt =
			recoveryKind === "unready" ? now : 0;
	}
	if (
		recoveryKind === "unready" &&
		now - _FatalAdMediaRecoveryState.unreadyStartedAt <
			_UNREADY_AD_MEDIA_RECOVERY_MS
	) {
		return false;
	}
	if (
		_FatalAdMediaRecoveryState.recoveryId &&
		(now - _FatalAdMediaRecoveryState.requestedAt < 30000 ||
			_FatalAdMediaRecoveryState.committed)
	) {
		return false;
	}

	const recoveryId = _createFatalAdMediaRecoveryId(pageMediaKey);
	if (_getCodecHandoffCycleStartedAt(recoveryId) !== cycleStartedAt) {
		return false;
	}
	_FatalAdMediaRecoveryState.video = video;
	_FatalAdMediaRecoveryState.mediaKey = pageMediaKey;
	_FatalAdMediaRecoveryState.recoveryId = recoveryId;
	_FatalAdMediaRecoveryState.recoveryKind = recoveryKind;
	_FatalAdMediaRecoveryState.pinnedType = pinnedType;
	_FatalAdMediaRecoveryState.cycleStartedAt = cycleStartedAt;
	_FatalAdMediaRecoveryState.requestedAt = now;
	_FatalAdMediaRecoveryState.committed = false;
	_broadcastWorkers({
		key: "PrepareFatalMediaRecovery",
		targetMediaKey: pageMediaKey,
		value: {
			recoveryId,
			recoveryKind,
			requestedAt: now,
			cycleStartedAt,
			channelName: __TTVAB_STATE__?.PageChannel || null,
			mediaKey: pageMediaKey,
		},
	});
	_log(
		errorCode
			? `Fatal media error ${errorCode} during ad recovery; verifying a fresh clean AVC backup`
			: "Ad recovery media remained unready for 12s; verifying a fresh clean AVC backup",
		"warning",
	);
	return true;
}
function _acceptFatalAdMediaRecoveryReady(data) {
	const recoveryId =
		typeof data?.recoveryId === "string" && data.recoveryId
			? data.recoveryId
			: null;
	const mediaKey = _normalizeMediaKey(data?.mediaKey);
	const pageMediaKey = _normalizeMediaKey(__TTVAB_STATE__?.PageMediaKey);
	const adMediaKey = _normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey);
	const eventCycleStartedAt = Math.max(0, Number(data?.cycleStartedAt) || 0);
	const requiresCodecHandoff = data?.requiresCodecHandoff !== false;
	const clearCodecHandoff = () => {
		if (!requiresCodecHandoff || !mediaKey) return;
		_broadcastWorkers({
			key: "UpdateCodecHandoffContext",
			targetMediaKey: mediaKey,
			value: {
				clearHandoffId: recoveryId,
				channelName: __TTVAB_STATE__?.PageChannel || null,
				mediaKey,
			},
		});
	};
	if (!recoveryId) return false;
	if (_FatalAdMediaRecoveryState.recoveryId !== recoveryId) {
		if (mediaKey && mediaKey === pageMediaKey && mediaKey === adMediaKey) {
			clearCodecHandoff();
		}
		return false;
	}
	if (_FatalAdMediaRecoveryState.committed) return false;
	const verifiedAt = Math.max(0, Number(data?.verifiedAt) || 0);
	const { player } = _getPlayerAndState();
	const video = player?.getHTMLVideoElement?.() || null;
	const recoveryKind = _FatalAdMediaRecoveryState.recoveryKind;
	const recoveryConditionStillActive =
		recoveryKind === "media-error"
			? Boolean(_getFatalAdMediaErrorCode(video))
			: recoveryKind === "unready"
				? _isOwnedUnreadyAdMedia(video, pageMediaKey, eventCycleStartedAt) &&
					_FatalAdMediaRecoveryState.pinnedType ===
						__TTVAB_STATE__?.PinnedBackupPlayerType
				: false;
	if (
		!mediaKey ||
		mediaKey !== _FatalAdMediaRecoveryState.mediaKey ||
		mediaKey !== pageMediaKey ||
		mediaKey !== adMediaKey ||
		eventCycleStartedAt <= 0 ||
		eventCycleStartedAt !== _FatalAdMediaRecoveryState.cycleStartedAt ||
		_getCodecHandoffCycleStartedAt(recoveryId) !== eventCycleStartedAt ||
		!_isCodecHandoffCycleCurrent(mediaKey, eventCycleStartedAt) ||
		video !== _FatalAdMediaRecoveryState.video ||
		!recoveryConditionStillActive
	) {
		if (mediaKey === _FatalAdMediaRecoveryState.mediaKey) {
			clearCodecHandoff();
			_resetFatalAdMediaRecoveryState(recoveryId);
		}
		return false;
	}
	if (verifiedAt < _FatalAdMediaRecoveryState.requestedAt) {
		return false;
	}

	_FatalAdMediaRecoveryState.committed = true;
	try {
		const didReload = _doPlayerTask(false, true, {
			reason: requiresCodecHandoff ? "codec-handoff" : "ad-recovery",
			...(requiresCodecHandoff
				? { handoffId: recoveryId, replaceCodecHandoff: true }
				: {}),
			cycleStartedAt: eventCycleStartedAt,
			refreshAccessToken: true,
			newMediaPlayerInstance: true,
			channel:
				typeof data?.channel === "string"
					? data.channel
					: __TTVAB_STATE__?.PageChannel || null,
			mediaKey,
		});
		if (didReload !== true) {
			throw new Error("player reload was not accepted");
		}
		_log(
			recoveryKind === "unready"
				? "Fresh clean AVC backup verified; rebuilding the unready ad recovery player"
				: requiresCodecHandoff
					? "Fresh clean AVC backup verified; reloading the failed enhanced decoder"
					: "Fresh clean AVC backup verified; rebuilding the failed ad recovery player",
			"info",
		);
		return true;
	} catch (error) {
		clearCodecHandoff();
		_resetFatalAdMediaRecoveryState(recoveryId);
		_log(
			`Fatal media recovery reload failed: ${error?.message ?? String(error)}`,
			"warning",
		);
		return false;
	}
}
const _POST_BREAK_WEDGE_EVAL_BUDGET = 40;
const _POST_BREAK_WEDGE_MIN_TICK_ADVANCE_S = 0.3;
const _POST_BREAK_WEDGE_FRAME_EPS = 1;
const _POST_BREAK_WEDGE_EVIDENCE_TO_ACT = 6;
const _POST_BREAK_WEDGE_HEALTHY_FRAMES = 5;
const _POST_BREAK_WEDGE_HEALTHY_TO_DISARM = 3;
const _POST_BREAK_WEDGE_MAX_ACTIONS = 2;
const _PostBreakWedgeState = {
	mediaKey: null as string | null,
	remainingEvals: 0,
	lastCurrentTime: -1,
	lastTotalFrames: -1,
	evidenceCount: 0,
	healthyCount: 0,
	actionCount: 0,
	prevAdContext: false,
	prevAdMediaKey: null as string | null,
};
function _armPostBreakWedgeWatch(mediaKey = null) {
	_PostBreakWedgeState.mediaKey = _normalizeMediaKey(mediaKey);
	_PostBreakWedgeState.remainingEvals = _POST_BREAK_WEDGE_EVAL_BUDGET;
	_PostBreakWedgeState.lastCurrentTime = -1;
	_PostBreakWedgeState.lastTotalFrames = -1;
	_PostBreakWedgeState.evidenceCount = 0;
	_PostBreakWedgeState.healthyCount = 0;
	_PostBreakWedgeState.actionCount = 0;
}
function _disarmPostBreakWedgeWatch() {
	_PostBreakWedgeState.mediaKey = null;
	_PostBreakWedgeState.remainingEvals = 0;
}
function _clearPinnedBackupTimelineRestore(
	mediaKey = null,
	cycleStartedAt = 0,
) {
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	const safeCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	if (
		safeMediaKey &&
		_PinnedBackupTimelineRestoreState.mediaKey !== safeMediaKey
	) {
		return false;
	}
	if (
		safeCycleStartedAt > 0 &&
		_PinnedBackupTimelineRestoreState.cycleStartedAt !== safeCycleStartedAt
	) {
		return false;
	}
	_PinnedBackupTimelineRestoreState.mediaKey = null;
	_PinnedBackupTimelineRestoreState.cycleStartedAt = 0;
	return true;
}
function _markPinnedBackupTimelineRestore(mediaKey, cycleStartedAt) {
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	const safeCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	if (!safeMediaKey || safeCycleStartedAt <= 0) return false;
	_PinnedBackupTimelineRestoreState.mediaKey = safeMediaKey;
	_PinnedBackupTimelineRestoreState.cycleStartedAt = safeCycleStartedAt;
	return true;
}
function _consumePinnedBackupTimelineRestore(mediaKey, cycleStartedAt) {
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	const safeCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	const matches = Boolean(
		safeMediaKey &&
			safeCycleStartedAt > 0 &&
			_PinnedBackupTimelineRestoreState.mediaKey === safeMediaKey &&
			_PinnedBackupTimelineRestoreState.cycleStartedAt === safeCycleStartedAt,
	);
	if (matches) {
		_clearPinnedBackupTimelineRestore();
	}
	return matches;
}
function _resetPinnedBackupStallState() {
	_PinnedBackupStallState.mediaKey = null;
	_PinnedBackupStallState.firstObservedAt = 0;
	_PinnedBackupStallState.lastCurrentTime = 0;
	_PinnedBackupStallState.lastBufferedEnd = 0;
	_PinnedBackupStallState.lastForceRefreshAt = 0;
	_PinnedBackupStallState.lastPinnedType = null;
	_PinnedBackupStallState.forceRefreshCount = 0;
	_PinnedBackupStallState.exhaustedLogged = false;
}
const _SECONDARY_PLAYER_HANDOFF_PAUSE_DELAYS_MS = [0, 120, 450, 1000];
const _PLAYER_CONTROL_INTERACTION_SELECTOR = [
	'[data-a-target="player-play-pause-button"]',
	'[data-a-target="player-overlay-play-button"]',
	'[data-a-target="player-overlay-click-handler"]',
	'[data-a-target="video-player"]',
	"video",
].join(", ");
const _PLAYER_PREFERENCE_KEYS = [
	"video-quality",
	"lowLatencyModeEnabled",
	"persistenceEnabled",
];

function _readConfiguredQualityGroup() {
	try {
		const raw = localStorage.getItem("video-quality");
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (typeof parsed?.default === "string" && parsed.default.trim()) {
			return parsed.default.trim();
		}
		if (typeof parsed === "string" && parsed.trim()) {
			return parsed.trim();
		}
	} catch {}

	return null;
}

let _lastQualityGroupSyncAt = 0;

function _syncPreferredQualityGroupThrottled() {
	const now = Date.now();
	if (now - _lastQualityGroupSyncAt < 5000) return false;
	_lastQualityGroupSyncAt = now;
	return _syncPreferredQualityGroup();
}

function _syncPreferredQualityGroup() {
	if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__) return false;
	const nextQualityGroup = _readConfiguredQualityGroup();
	if (!nextQualityGroup) return false;
	if (__TTVAB_STATE__.PreferredQualityGroup === nextQualityGroup) {
		return false;
	}

	__TTVAB_STATE__.PreferredQualityGroup = nextQualityGroup;
	_broadcastWorkers({
		key: "UpdatePreferredQualityGroup",
		value: nextQualityGroup,
	});
	return true;
}

function _isLowLatencyEnabled(playerCore = null) {
	try {
		if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__)
			return false;
		const playerState =
			typeof playerCore?.state?.lowLatencyModeEnabled === "boolean"
				? playerCore.state.lowLatencyModeEnabled
				: null;
		if (typeof playerState === "boolean") return playerState;
		const stored = localStorage.getItem("lowLatencyModeEnabled");
		if (stored === "true") return true;
		if (stored === "false") return false;
	} catch {}
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

function _getPlayerCore(player) {
	return player?.playerInstance?.core || player?.core || null;
}

let _loggedReactRootSearchFailure = false;

function _findReactRoot() {
	let rootNode = _cachedReactRootNode;
	if (!rootNode?.isConnected) {
		rootNode = document.querySelector("#root");
		if (!rootNode) {
			_cachedReactRootNode = null;
			_cachedReactContainerKey = null;
			if (_debugLogging && !_loggedReactRootSearchFailure) {
				_loggedReactRootSearchFailure = true;
				_log(
					"React root node #root not found in DOM — player features unavailable",
					"debug",
				);
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

	if (_debugLogging && !_loggedReactRootSearchFailure) {
		_loggedReactRootSearchFailure = true;
		_log(
			"React fiber root not found on #root — possible React upgrade",
			"debug",
		);
	}
	return null;
}

function _findReactNodesByConstraints(root, constraints) {
	const found = new Array(constraints.length).fill(null);
	if (!root) return found;
	let remaining = constraints.length;

	function visit(node) {
		const stateNode = node.stateNode;
		if (stateNode) {
			for (let i = 0; i < constraints.length; i++) {
				if (found[i] === null && constraints[i](stateNode)) {
					found[i] = stateNode;
					remaining--;
					if (remaining === 0) return true;
				}
			}
		}
		let child = node.child;
		while (child) {
			if (visit(child)) return true;
			child = child.sibling;
		}
		return false;
	}

	visit(root);
	return found;
}

function _getPlayerAndState() {
	const reactRoot = _findReactRoot();
	if (!reactRoot) return { player: null, state: null };

	const [playerWrapper, directState, fallbackStateWrapper] =
		_findReactNodesByConstraints(reactRoot, [
			(node) => node.setPlayerActive && node.props?.mediaPlayerInstance,
			(node) => node.setSrc && node.setInitialPlaybackSettings,
			(node) =>
				node.state?.videoPlayerInstance &&
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
	const minRepeatDelay =
		typeof __TTVAB_STATE__ !== "undefined" && __TTVAB_STATE__
			? Number(_getLowLatencyMinRepeatDelay()) || 0
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
	_PlayerBufferState.gapJumpLastPosition = -1;
	_PlayerBufferState.gapJumpStuckTicks = 0;
	_PlayerBufferState.postAdUnhealthyCount = 0;
	_PlayerBufferState.postAdRecoveryStartedAt = 0;
	_PlayerBufferState.postAdLastCurrentTime = 0;
	_PlayerBufferState.postAdStallTicks = 0;
	_PlayerBufferState.postAdSoftReloadAttempted = false;
	_resetPostAdGrace();
	_resetHiddenCleanLiveStallState();
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
		bufferDuration > _getLowLatencySafeEpsilon() ||
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
	if (Number(resolvedVideo.readyState) < 2) {
		return false;
	}
	if (
		resolvedVideo instanceof HTMLVideoElement &&
		Number(resolvedVideo.videoWidth) <= 0
	) {
		return false;
	}

	const telemetry = _readPlayerBufferTelemetry(player, playerCore);
	return (
		telemetry.bufferDuration > _PLAYER_BUFFER_LIVE_EDGE_EPSILON ||
		telemetry.liveEdgeDistance > _PLAYER_BUFFER_LIVE_EDGE_EPSILON
	);
}

function _isNativeDocumentHidden() {
	try {
		if (document.pictureInPictureElement) {
			return false;
		}
	} catch {}
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

function _isPlaybackPageUnfocused() {
	if (_getActivePictureInPicturePlaybackContext()) return false;
	if (_isNativeDocumentHidden()) return true;
	try {
		return typeof document.hasFocus === "function" && !document.hasFocus();
	} catch {}
	return false;
}

function _isUnfocusedPlaybackEnvironment() {
	return _isPlaybackPageUnfocused();
}

function _normalizePlayerChannel(channel = null) {
	if (typeof channel !== "string") return null;
	const trimmed = channel.trim().toLowerCase();
	return trimmed || null;
}

function _resolvePlayerMediaKey(channel = null, mediaKey = null) {
	return (
		_normalizeMediaKey(mediaKey) ||
		_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) ||
		_normalizeMediaKey(__TTVAB_STATE__?.PageMediaKey) ||
		_buildMediaKey("live", channel, null) ||
		_buildMediaKey("live", __TTVAB_STATE__?.CurrentAdChannel, null) ||
		_buildMediaKey("live", __TTVAB_STATE__?.PageChannel, null) ||
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

function _setActivePictureInPicturePlaybackContext(
	element = null,
	context = null,
) {
	if (!(element instanceof HTMLVideoElement)) return null;
	const normalizedContext = _normalizePlaybackContext(
		context || {
			MediaType: __TTVAB_STATE__?.PageMediaType,
			ChannelName: __TTVAB_STATE__?.PageChannel,
			VodID: __TTVAB_STATE__?.PageVodID,
			MediaKey: __TTVAB_STATE__?.PageMediaKey,
		},
	);
	if (!normalizedContext.MediaKey && !normalizedContext.ChannelName)
		return null;
	_clearActivePictureInPicturePlaybackListeners();
	_PlaybackIntentState.pictureInPictureElement = element;
	_PlaybackIntentState.pictureInPictureMediaType = normalizedContext.MediaType;
	_PlaybackIntentState.pictureInPictureChannel = normalizedContext.ChannelName;
	_PlaybackIntentState.pictureInPictureVodID = normalizedContext.VodID;
	_PlaybackIntentState.pictureInPictureMediaKey = normalizedContext.MediaKey;
	const handlePause = () => {
		if (_wasRecentProgrammaticPlaybackAction("pause") || element.ended) return;
		if (_PlaybackIntentState.pictureInPictureElement !== element) return;
		const mediaKey = normalizedContext.MediaKey;
		if (!mediaKey) return;
		const hadExplicitInteraction = _hasRecentPlaybackControlInteraction(
			normalizedContext.ChannelName,
			mediaKey,
		);
		const wasDuringAd = _isAdOwnedPauseContext(
			normalizedContext.ChannelName,
			mediaKey,
		);
		if (wasDuringAd && !hadExplicitInteraction) return;
		_PlaybackIntentState.userPausedMediaKey = mediaKey;
		_PlaybackIntentState.userPausedAt = Date.now();
		_PlaybackIntentState.userPausedHadExplicitInteraction =
			hadExplicitInteraction;
		_PlaybackIntentState.userPausedDuringAd = wasDuringAd;
	};
	const handlePlay = () => {
		if (_wasRecentProgrammaticPlaybackAction("play")) return;
		_clearUserPauseIntent(
			normalizedContext.ChannelName,
			normalizedContext.MediaKey,
		);
	};
	element.addEventListener("pause", handlePause, true);
	element.addEventListener("play", handlePlay, true);
	_PlaybackIntentState.pictureInPicturePauseListener = handlePause;
	_PlaybackIntentState.pictureInPicturePlayListener = handlePlay;
	return { ...normalizedContext, element };
}

function _clearActivePictureInPicturePlaybackListeners() {
	const element = _PlaybackIntentState.pictureInPictureElement;
	if (element instanceof HTMLVideoElement) {
		if (_PlaybackIntentState.pictureInPicturePauseListener) {
			element.removeEventListener(
				"pause",
				_PlaybackIntentState.pictureInPicturePauseListener,
				true,
			);
		}
		if (_PlaybackIntentState.pictureInPicturePlayListener) {
			element.removeEventListener(
				"play",
				_PlaybackIntentState.pictureInPicturePlayListener,
				true,
			);
		}
	}
	_PlaybackIntentState.pictureInPicturePauseListener = null;
	_PlaybackIntentState.pictureInPicturePlayListener = null;
}

function _getActivePictureInPicturePlaybackContext() {
	const element = _PlaybackIntentState.pictureInPictureElement;
	if (!(element instanceof HTMLVideoElement)) return null;
	const normalizedContext = _normalizePlaybackContext({
		MediaType: _PlaybackIntentState.pictureInPictureMediaType,
		ChannelName: _PlaybackIntentState.pictureInPictureChannel,
		VodID: _PlaybackIntentState.pictureInPictureVodID,
		MediaKey: _PlaybackIntentState.pictureInPictureMediaKey,
	});
	if (!normalizedContext.MediaKey && !normalizedContext.ChannelName)
		return null;
	return { ...normalizedContext, element };
}

function _isActivePictureInPicturePlaybackContext(context) {
	const activeContext = _getActivePictureInPicturePlaybackContext();
	if (!activeContext) return false;
	const normalizedContext = _normalizePlaybackContext(context);
	if (normalizedContext.MediaKey) {
		return normalizedContext.MediaKey === activeContext.MediaKey;
	}
	if (normalizedContext.ChannelName) {
		return normalizedContext.ChannelName === activeContext.ChannelName;
	}
	return false;
}

function _clearActivePictureInPicturePlaybackContext(element = null) {
	const activeContext = _getActivePictureInPicturePlaybackContext();
	if (
		element instanceof HTMLVideoElement &&
		activeContext?.element !== element
	) {
		return null;
	}
	_clearActivePictureInPicturePlaybackListeners();
	_PlaybackIntentState.pictureInPictureElement = null;
	_PlaybackIntentState.pictureInPictureMediaType = null;
	_PlaybackIntentState.pictureInPictureChannel = null;
	_PlaybackIntentState.pictureInPictureVodID = null;
	_PlaybackIntentState.pictureInPictureMediaKey = null;
	return activeContext;
}

function _isPlaybackRecoveryContextCurrent(channel = null, mediaKey = null) {
	const targetMediaKey = _normalizeMediaKey(mediaKey);
	const targetChannel = _normalizePlayerChannel(channel);
	if (
		_isActivePictureInPicturePlaybackContext({
			MediaKey: targetMediaKey,
			ChannelName: targetChannel,
		})
	) {
		return true;
	}
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

function _getPlayerLifecycleCycleStartedAt(mediaKey) {
	const normalizedMediaKey = _normalizeMediaKey(mediaKey);
	if (!normalizedMediaKey) return 0;
	const currentAdMediaKey = _normalizeMediaKey(
		__TTVAB_STATE__?.CurrentAdMediaKey,
	);
	if (currentAdMediaKey) {
		if (currentAdMediaKey !== normalizedMediaKey) return 0;
		const info = __TTVAB_STATE__?.StreamInfos?.[normalizedMediaKey] || null;
		const podCycleStartedAt = Math.max(
			0,
			Number(
				__TTVAB_STATE__?.AdPodProgressByMediaKey?.[normalizedMediaKey]
					?.cycleStartedAt,
			) || 0,
		);
		const infoCycleStartedAt = Math.max(
			0,
			Number(info?.VisibleAdStartedAt) || 0,
		);
		return Math.max(podCycleStartedAt, infoCycleStartedAt);
	}
	if (
		_normalizeMediaKey(__TTVAB_STATE__?.LastAdEndedMediaKey) ===
			normalizedMediaKey &&
		Date.now() - Math.max(0, Number(__TTVAB_STATE__?.LastAdEndedAt) || 0) <
			30000
	) {
		return Math.max(0, Number(__TTVAB_STATE__?.LastAdEndedCycleStartedAt) || 0);
	}
	return 0;
}

function _isPlayerLifecycleCycleCurrent(mediaKey, cycleStartedAt) {
	const expectedCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	return Boolean(
		expectedCycleStartedAt > 0 &&
			_getPlayerLifecycleCycleStartedAt(mediaKey) === expectedCycleStartedAt,
	);
}

function _clearPlaybackRecoveryTimeouts(preservedMediaKey = null) {
	const safePreservedMediaKey = _normalizeMediaKey(preservedMediaKey);
	for (const entry of _PlaybackRecoveryTimeoutState.timeouts) {
		if (
			safePreservedMediaKey &&
			_normalizeMediaKey(entry.mediaKey) === safePreservedMediaKey
		) {
			continue;
		}
		clearTimeout(entry.id);
		_PlaybackRecoveryTimeoutState.timeouts.delete(entry);
	}
}

function _clearPlaybackRecoveryTimeoutsForContext(mediaKey = null) {
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	if (!safeMediaKey) return;
	for (const entry of _PlaybackRecoveryTimeoutState.timeouts) {
		if (_normalizeMediaKey(entry.mediaKey) !== safeMediaKey) continue;
		clearTimeout(entry.id);
		_PlaybackRecoveryTimeoutState.timeouts.delete(entry);
	}
}

function _clearPendingPlayerPreferenceRestore() {
	if (_PlayerPreferenceRestoreState.timeoutId) {
		clearTimeout(_PlayerPreferenceRestoreState.timeoutId);
	}
	_PlayerPreferenceRestoreState.timeoutId = null;
	_PlayerPreferenceRestoreState.channel = null;
	_PlayerPreferenceRestoreState.mediaKey = null;
	_PlayerPreferenceRestoreState.cycleStartedAt = 0;
}

function _schedulePlaybackRecoveryTimeout(
	callback,
	delay = 0,
	channel = null,
	mediaKey = null,
	cycleStartedAt = 0,
) {
	if (typeof callback !== "function") return null;

	const entry = {
		id: 0 as ReturnType<typeof setTimeout>,
		channel: _normalizePlayerChannel(channel),
		mediaKey: _resolvePlayerMediaKey(channel, mediaKey),
		cycleStartedAt: Math.max(0, Number(cycleStartedAt) || 0),
	};

	entry.id = setTimeout(
		() => {
			_PlaybackRecoveryTimeoutState.timeouts.delete(entry);
			if (!_isPlaybackRecoveryContextCurrent(entry.channel, entry.mediaKey)) {
				return;
			}
			if (
				entry.cycleStartedAt > 0 &&
				!_isPlayerLifecycleCycleCurrent(entry.mediaKey, entry.cycleStartedAt)
			) {
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

function _clearSecondaryPlayerCloseMonitor() {
	if (_PlaybackIntentState.secondaryPlayerCloseMonitorId) {
		clearInterval(_PlaybackIntentState.secondaryPlayerCloseMonitorId);
	}
	_PlaybackIntentState.secondaryPlayerCloseMonitorId = null;
	_PlaybackIntentState.secondaryPlayerWindows.clear();
}

function _clearSecondaryPlayerHandoff() {
	_clearSecondaryPlayerCloseMonitor();
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

function _hookMediaSessionPlaybackIntent() {
	if (window.__TTVAB_MEDIA_SESSION_PLAYBACK_INTENT_PATCHED__) return true;
	let mediaSession = null;
	try {
		mediaSession = navigator.mediaSession;
	} catch {}
	if (!mediaSession || typeof mediaSession.setActionHandler !== "function") {
		return false;
	}

	const nativeSetActionHandler = mediaSession.setActionHandler;
	try {
		mediaSession.setActionHandler = function patchedSetActionHandler(
			action,
			handler,
		) {
			const tracksPlaybackIntent =
				action === "play" || action === "pause" || action === "stop";
			const wrappedHandler =
				tracksPlaybackIntent && typeof handler === "function"
					? function trackedMediaSessionAction(details) {
							const pipContext = _getActivePictureInPicturePlaybackContext();
							const channel =
								pipContext?.ChannelName || __TTVAB_STATE__?.PageChannel;
							const mediaKey =
								pipContext?.MediaKey || __TTVAB_STATE__?.PageMediaKey;
							_rememberRecentPlaybackControlInteraction(channel, mediaKey);
							const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
							if (action === "play") {
								_clearUserPauseIntent(channel, safeMediaKey);
							} else if (safeMediaKey) {
								_PlaybackIntentState.userPausedMediaKey = safeMediaKey;
								_PlaybackIntentState.userPausedAt = Date.now();
								_PlaybackIntentState.userPausedHadExplicitInteraction = true;
								_PlaybackIntentState.userPausedDuringAd =
									_isAdOwnedPauseContext(channel, safeMediaKey);
							}
							return handler.call(this, details);
						}
					: handler;
			return nativeSetActionHandler.call(this, action, wrappedHandler);
		};
	} catch {
		return false;
	}
	window.__TTVAB_MEDIA_SESSION_PLAYBACK_INTENT_PATCHED__ = true;
	return true;
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
	preservedMediaKey = null,
) {
	const safePreservedMediaKey = _normalizeMediaKey(preservedMediaKey);
	if (
		!safePreservedMediaKey ||
		_normalizeMediaKey(_PlaybackIntentState.userPausedMediaKey) !==
			safePreservedMediaKey
	) {
		_clearRecordedUserPauseIntent();
	}
	if (
		!safePreservedMediaKey ||
		_normalizeMediaKey(
			_PlaybackIntentState.lastPlaybackControlInteractionMediaKey,
		) !== safePreservedMediaKey
	) {
		_clearRecentPlaybackControlInteraction();
	}
	if (
		!safePreservedMediaKey ||
		_normalizeMediaKey(_PlaybackIntentState.secondaryPlayerHandoffMediaKey) !==
			safePreservedMediaKey
	) {
		_clearSecondaryPlayerHandoff();
	}
	_resetPostAdRecoveryTransaction();
	_clearPinnedBackupTimelineRestore();
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

function _hasActiveSecondaryPlayerHandoff(channel = null, mediaKey = null) {
	const until = Number(_PlaybackIntentState.secondaryPlayerHandoffUntil) || 0;
	if (until <= Date.now()) {
		const hasTrackedPopout =
			_PlaybackIntentState.secondaryPlayerHandoffKind === "popout" &&
			_PlaybackIntentState.secondaryPlayerWindows.size > 0;
		if (!hasTrackedPopout) {
			_clearSecondaryPlayerHandoff();
			return false;
		}
		_PlaybackIntentState.secondaryPlayerHandoffUntil =
			Date.now() + _SECONDARY_PLAYER_HANDOFF_WINDOW_MS;
	}

	return _matchesPlaybackTargetContext(
		_PlaybackIntentState.secondaryPlayerHandoffChannel,
		_PlaybackIntentState.secondaryPlayerHandoffMediaKey,
		channel,
		mediaKey,
	);
}

function _shouldSuppressAutomaticPlaybackResume(
	channel = null,
	mediaKey = null,
) {
	if (!_hasActiveSecondaryPlayerHandoff(channel, mediaKey)) {
		return false;
	}
	return _PlaybackIntentState.secondaryPlayerHandoffKind !== "pip";
}

function _isPrimaryPlaybackCurrentlyActive() {
	const { player } = _getPlayerAndState();
	const playerCore = _getPlayerCore(player);
	const playerVideo = player?.getHTMLVideoElement?.() || null;
	if (
		player &&
		!_isPlayerPaused(player, playerCore, playerVideo) &&
		!(playerVideo instanceof HTMLMediaElement && playerVideo.ended)
	) {
		return true;
	}

	const primaryMedia = _getPrimaryMediaElement();
	return Boolean(
		primaryMedia instanceof HTMLMediaElement &&
			primaryMedia.isConnected &&
			!primaryMedia.paused &&
			!primaryMedia.ended,
	);
}

function _setPlayerIsPlaying(isPlaying) {
	const nextValue = isPlaying === true;
	if (__TTVAB_STATE__.PlayerIsPlaying === nextValue) return;
	__TTVAB_STATE__.PlayerIsPlaying = nextValue;
	_broadcastWorkers({
		key: "UpdatePlayerIsPlaying",
		value: nextValue,
	});
}

function _markPlayerHasPlayedOnce() {
	if (__TTVAB_STATE__.PlayerHasPlayedOnce) return;
	__TTVAB_STATE__.PlayerHasPlayedOnce = true;
	_broadcastWorkers({
		key: "UpdatePlayerHasPlayedOnce",
		value: true,
	});
}

function _markSecondaryPlayerHandoff(
	kind = "popout",
	channel = null,
	mediaKey = null,
	durationMs = _SECONDARY_PLAYER_HANDOFF_WINDOW_MS,
	sourceWasPlaying = _isPrimaryPlaybackCurrentlyActive(),
) {
	if (!Number.isFinite(durationMs) || durationMs <= 0) {
		return false;
	}

	const safeChannel =
		_normalizePlayerChannel(channel) ||
		_normalizePlayerChannel(__TTVAB_STATE__.PageChannel) ||
		null;
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	const canExtendTrackedPopouts =
		kind === "popout" &&
		_PlaybackIntentState.secondaryPlayerWindows.size > 0 &&
		[..._PlaybackIntentState.secondaryPlayerWindows.values()].every((entry) =>
			_matchesPlaybackTargetContext(
				entry.channel,
				entry.mediaKey,
				safeChannel,
				safeMediaKey,
			),
		);
	const trackedSourceWasPlaying = canExtendTrackedPopouts
		? _PlaybackIntentState.secondaryPlayerHandoffSourceWasPlaying === true
		: false;
	if (!canExtendTrackedPopouts) {
		_clearSecondaryPlayerCloseMonitor();
	}
	_PlaybackIntentState.secondaryPlayerHandoffKind = kind;
	_PlaybackIntentState.secondaryPlayerHandoffChannel = safeChannel;
	_PlaybackIntentState.secondaryPlayerHandoffMediaKey = safeMediaKey;
	_PlaybackIntentState.secondaryPlayerHandoffUntil = Date.now() + durationMs;
	_PlaybackIntentState.secondaryPlayerHandoffSourceWasPlaying =
		sourceWasPlaying === true || trackedSourceWasPlaying;
	return true;
}

function _pausePrimaryPlaybackForSecondaryPlayerHandoff(
	channel = null,
	mediaKey = null,
) {
	if (!_hasActiveSecondaryPlayerHandoff(channel, mediaKey)) {
		return false;
	}

	let didPause = false;
	const { player } = _getPlayerAndState();
	const playerCore = _getPlayerCore(player);
	const playerVideo = player?.getHTMLVideoElement?.() || null;
	if (player && !_isPlayerPaused(player, playerCore, playerVideo)) {
		didPause = _pausePlaybackTarget(player) || didPause;
	}
	if (
		playerVideo instanceof HTMLMediaElement &&
		!playerVideo.paused &&
		!playerVideo.ended
	) {
		didPause = _pausePlaybackTarget(playerVideo) || didPause;
	}

	const primaryMedia = _getPrimaryMediaElement();
	if (
		primaryMedia instanceof HTMLMediaElement &&
		primaryMedia !== playerVideo &&
		!primaryMedia.paused &&
		!primaryMedia.ended
	) {
		didPause = _pausePlaybackTarget(primaryMedia) || didPause;
	}

	return didPause;
}

function _scheduleSecondaryPlayerHandoffPause(channel = null, mediaKey = null) {
	for (const delay of _SECONDARY_PLAYER_HANDOFF_PAUSE_DELAYS_MS) {
		_schedulePlaybackRecoveryTimeout(
			() => {
				_pausePrimaryPlaybackForSecondaryPlayerHandoff(channel, mediaKey);
			},
			Math.max(0, Number(delay) || 0),
			channel,
			mediaKey,
		);
	}
}

function _rollbackSecondaryPlayerHandoff(
	channel = null,
	mediaKey = null,
	sourceWasPlaying = false,
) {
	_clearSecondaryPlayerHandoff();
	if (sourceWasPlaying !== true || _hasUserPauseIntent(channel, mediaKey)) {
		return false;
	}

	for (const delay of [0, 120, 350]) {
		_schedulePlaybackRecoveryTimeout(
			() => {
				_resumePrimaryPlaybackIfPaused(channel, mediaKey);
			},
			delay,
			channel,
			mediaKey,
		);
	}
	return true;
}

function _monitorSecondaryPlayerWindowClose(
	openedWindow,
	descriptor,
	sourceWasPlaying = false,
) {
	if (
		!openedWindow ||
		!descriptor ||
		String(descriptor.kind || "") !== "popout"
	) {
		return false;
	}

	const channel = _normalizePlayerChannel(descriptor.channel);
	const mediaKey = _normalizeMediaKey(descriptor.mediaKey);
	_PlaybackIntentState.secondaryPlayerWindows.set(openedWindow, {
		channel,
		mediaKey,
		sourceWasPlaying: sourceWasPlaying === true,
	});
	_PlaybackIntentState.secondaryPlayerHandoffSourceWasPlaying =
		_PlaybackIntentState.secondaryPlayerHandoffSourceWasPlaying === true ||
		sourceWasPlaying === true;
	if (_PlaybackIntentState.secondaryPlayerCloseMonitorId) return true;

	const checkClosed = () => {
		if (_PlaybackIntentState.secondaryPlayerWindows.size === 0) {
			return;
		}
		let lastClosedEntry = null;
		for (const [trackedWindow, entry] of [
			..._PlaybackIntentState.secondaryPlayerWindows.entries(),
		]) {
			let isClosed = false;
			try {
				isClosed = trackedWindow.closed === true;
			} catch {}
			if (!isClosed) continue;
			_PlaybackIntentState.secondaryPlayerWindows.delete(trackedWindow);
			lastClosedEntry = entry;
		}
		if (
			!lastClosedEntry ||
			_PlaybackIntentState.secondaryPlayerWindows.size > 0
		) {
			_PlaybackIntentState.secondaryPlayerHandoffUntil =
				Date.now() + _SECONDARY_PLAYER_HANDOFF_WINDOW_MS;
			return;
		}
		_rollbackSecondaryPlayerHandoff(
			lastClosedEntry.channel,
			lastClosedEntry.mediaKey,
			_PlaybackIntentState.secondaryPlayerHandoffSourceWasPlaying === true,
		);
	};
	_PlaybackIntentState.secondaryPlayerCloseMonitorId = setInterval(
		checkClosed,
		_SECONDARY_PLAYER_CLOSE_POLL_MS,
	);
	return true;
}

function _getSecondaryPlayerLaunchDescriptorFromUrl(rawUrl) {
	let parsedUrl = null;
	try {
		const baseUrl =
			typeof globalThis?.location?.href === "string"
				? globalThis.location.href
				: "https://www.twitch.tv/";
		parsedUrl = new URL(String(rawUrl || ""), baseUrl);
	} catch {
		return null;
	}

	const hostname = String(parsedUrl.hostname || "").toLowerCase();
	const pathname = String(parsedUrl.pathname || "").toLowerCase();
	let kind = null;
	let context = _normalizePlaybackContext(
		_getPlaybackContextFromUrl(parsedUrl.href),
	);

	if (hostname === "player.twitch.tv") {
		const playerParam = String(
			parsedUrl.searchParams.get("player") || "",
		).toLowerCase();
		const queryChannel = _normalizeChannelName(
			parsedUrl.searchParams.get("channel"),
		);
		const queryVideo = _normalizeVodID(
			parsedUrl.searchParams.get("video") || parsedUrl.searchParams.get("vod"),
		);
		if (playerParam === "popout" || queryChannel || queryVideo) {
			kind = "popout";
			if (queryChannel) {
				context = _normalizePlaybackContext({
					MediaType: "live",
					ChannelName: queryChannel,
				});
			} else if (queryVideo) {
				context = _normalizePlaybackContext({
					MediaType: "vod",
					VodID: queryVideo,
				});
			}
		}
	} else if (pathname.includes("/popout/")) {
		kind = "popout";
	}

	if (!kind) {
		return null;
	}

	return {
		kind,
		channel:
			_normalizePlayerChannel(context.ChannelName) ||
			_normalizePlayerChannel(__TTVAB_STATE__.PageChannel) ||
			null,
		mediaKey:
			_normalizeMediaKey(context.MediaKey) ||
			_resolvePlayerMediaKey(context.ChannelName, context.MediaKey),
	};
}

function _getSecondaryPlayerLaunchDescriptorFromTarget(target) {
	if (!(target instanceof Element)) {
		return null;
	}

	const anchor = target.closest?.("a[href]");
	const fromAnchorUrl = _getSecondaryPlayerLaunchDescriptorFromUrl(
		anchor?.getAttribute?.("href") || "",
	);
	if (fromAnchorUrl) {
		return fromAnchorUrl;
	}

	const controlTarget =
		target.closest?.(
			'button, [role="button"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [aria-label], [data-a-target]',
		) || target;
	const label = [
		controlTarget?.getAttribute?.("aria-label") || "",
		controlTarget?.getAttribute?.("data-a-target") || "",
		controlTarget?.textContent || "",
	]
		.join(" ")
		.toLowerCase();
	const isPipControl =
		label.includes("picture-in-picture") ||
		label.includes("picture in picture") ||
		/\bpip\b/.test(label) ||
		label.includes("mini player");
	if (!isPipControl) {
		return null;
	}

	return {
		kind: "pip",
		channel: _normalizePlayerChannel(__TTVAB_STATE__.PageChannel) || null,
		mediaKey:
			_normalizeMediaKey(__TTVAB_STATE__.PageMediaKey) ||
			_resolvePlayerMediaKey(__TTVAB_STATE__.PageChannel, null),
	};
}

function _beginSecondaryPlayerHandoff(
	descriptor,
	options: { pauseSource?: boolean; sourceWasPlaying?: boolean } = {},
) {
	if (!descriptor || typeof descriptor !== "object") {
		return false;
	}

	const shouldPauseSource =
		options.pauseSource !== false && String(descriptor.kind || "") !== "pip";
	const sourceWasPlaying =
		typeof options.sourceWasPlaying === "boolean"
			? options.sourceWasPlaying
			: _isPrimaryPlaybackCurrentlyActive();
	const didMark = _markSecondaryPlayerHandoff(
		String(descriptor.kind || "popout"),
		descriptor.channel || null,
		descriptor.mediaKey || null,
		_SECONDARY_PLAYER_HANDOFF_WINDOW_MS,
		sourceWasPlaying,
	);
	if (!didMark) {
		return false;
	}

	_clearAdResumeIntent();
	if (shouldPauseSource) {
		_scheduleSecondaryPlayerHandoffPause(
			descriptor.channel || null,
			descriptor.mediaKey || null,
		);
	}
	_log(
		shouldPauseSource
			? `Detected ${descriptor.kind || "secondary"} player handoff; pausing original player`
			: `Detected ${descriptor.kind || "secondary"} player handoff`,
		"info",
	);
	return true;
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
	_hookMediaSessionPlaybackIntent();
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
		_clearSecondaryPlayerHandoff();
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

	_clearObservedPlaybackIntentMedia();

	if (!(media instanceof HTMLMediaElement)) return;
	const isPlaying = !media.paused && !media.ended;
	_setPlayerIsPlaying(isPlaying);
	if (isPlaying) {
		_markPlayerHasPlayedOnce();
	}

	const handlePause = () => {
		_setPlayerIsPlaying(false);
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
			if (_isUnfocusedPlaybackEnvironment()) {
				_resumeActivePlayerAfterAd(__TTVAB_STATE__.PageChannel, mediaKey);
			}
			return;
		}
		if (!hadExplicitInteraction && _isUnfocusedPlaybackEnvironment()) {
			_resumePrimaryPlaybackIfPaused(__TTVAB_STATE__.PageChannel, mediaKey);
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
		if (_wasRecentProgrammaticPlaybackAction("play")) return;
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
			if (!hasRelevantContext) {
				_syncPrimaryMediaPlaybackIntent();
				nextDelay = syncDelay;
			}
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

		_playbackIntentMonitorTimer = setTimeout(check, nextDelay);
	}

	check();
	_log("Playback intent monitor active", "info");
}

function _hasLikelyPlaybackSurface() {
	const primaryMedia = _getPrimaryMediaElement();
	if (primaryMedia instanceof HTMLMediaElement && primaryMedia.isConnected) {
		return true;
	}

	const { player } = _getPlayerAndState();
	const playerVideo = player?.getHTMLVideoElement?.() || null;
	return playerVideo instanceof HTMLMediaElement && playerVideo.isConnected;
}

function _hasPlaybackIntentMonitorRelevantContext() {
	if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__) {
		return false;
	}

	const currentMediaKey = _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey);
	const hasLiveOrVodContext =
		(__TTVAB_STATE__.PageMediaType === "live" ||
			__TTVAB_STATE__.PageMediaType === "vod") &&
		Boolean(currentMediaKey);
	const hasActiveAdContext = Boolean(
		__TTVAB_STATE__.CurrentAdMediaKey || __TTVAB_STATE__.CurrentAdChannel,
	);
	const hasPendingPostAdRecovery = _hasPendingAdResumeIntent(
		__TTVAB_STATE__.PageChannel,
		currentMediaKey,
	);
	const hasSecondaryPlayerHandoff = _hasActiveSecondaryPlayerHandoff(
		__TTVAB_STATE__.PageChannel,
		currentMediaKey,
	);

	return (
		hasLiveOrVodContext ||
		hasActiveAdContext ||
		hasPendingPostAdRecovery ||
		hasSecondaryPlayerHandoff ||
		_hasLikelyPlaybackSurface()
	);
}

function _hasPlayerBufferMonitorRelevantContext() {
	if (typeof __TTVAB_STATE__ === "undefined" || !__TTVAB_STATE__) {
		return false;
	}

	const currentMediaKey = _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey);
	const hasLivePlaybackContext =
		__TTVAB_STATE__.PageMediaType === "live" && Boolean(currentMediaKey);
	const hasActiveAdContext = Boolean(
		__TTVAB_STATE__.CurrentAdMediaKey || __TTVAB_STATE__.CurrentAdChannel,
	);
	const hasPendingPostAdRecovery = _hasPendingAdResumeIntent(
		__TTVAB_STATE__.PageChannel,
		currentMediaKey,
	);
	const hasSecondaryPlayerHandoff = _hasActiveSecondaryPlayerHandoff(
		__TTVAB_STATE__.PageChannel,
		currentMediaKey,
	);

	return (
		hasLivePlaybackContext ||
		hasActiveAdContext ||
		hasPendingPostAdRecovery ||
		hasSecondaryPlayerHandoff
	);
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
		_PlayerBufferState.postAdUnhealthyCount = 0;
		_PlayerBufferState.postAdRecoveryStartedAt = 0;
	}
}

function _ensurePlaybackMonitorsRunning(forceStart = false) {
	let didStart = false;

	if (
		!_playbackIntentMonitorStarted &&
		(forceStart || _hasPlaybackIntentMonitorRelevantContext())
	) {
		_playbackIntentMonitorStarted = true;
		_monitorPlaybackIntent();
		didStart = true;
	}

	if (
		!_playerBufferMonitorStarted &&
		_C.BUFFERING_FIX &&
		(forceStart ||
			(__TTVAB_STATE__.IsBufferFixEnabled === true &&
				_hasPlayerBufferMonitorRelevantContext()))
	) {
		_playerBufferMonitorStarted = true;
		_monitorPlayerBuffering();
		didStart = true;
	}

	return didStart;
}

const _INDEPENDENT_VIDEO_AD_SELECTOR = "video";
const _INDEPENDENT_VIDEO_AD_LABEL = "video advertisement";
const _INDEPENDENT_VIDEO_AD_LABEL_PREFIX = "this advertisement";
const _INDEPENDENT_VIDEO_AD_STYLE_ID = "ttvab-independent-video-ad-style";
const _INDEPENDENT_VIDEO_AD_SUPPRESSED_ATTRIBUTE =
	"data-ttvab-independent-ad-suppressed";
const _INDEPENDENT_VIDEO_AD_CONTAINER_ATTRIBUTE =
	"data-ttvab-independent-ad-container";
const _INDEPENDENT_VIDEO_AD_CONTAINER_MAX_DEPTH = 4;
const _INDEPENDENT_VIDEO_AD_CONTAINER_BOUNDARY_SELECTOR = [
	"main",
	"#root",
	".chat-shell",
	".stream-chat",
	".channel-root",
	".persistent-player",
	".video-player",
	".stream-display-ad__wrapper",
	'[data-a-target="video-player"]',
	'[data-a-target="chat-scroller"]',
	'[data-a-target="chat-input"]',
	'[data-a-target="side-nav-bar"]',
	'[data-test-selector="chat-scrollable-area__message-container"]',
].join(",");
const _INDEPENDENT_VIDEO_AD_LOG_DESCRIPTOR_LIMIT = 3500;
const _INDEPENDENT_VIDEO_AD_LOG_VALUE_LIMIT = 256;
const _INDEPENDENT_VIDEO_AD_LOG_SOURCE_LIMIT = 512;
const _INDEPENDENT_VIDEO_AD_LOG_CHILD_SOURCE_LIMIT = 4;
const _INDEPENDENT_VIDEO_AD_LOG_ATTRIBUTES = [
	"aria-label",
	"role",
	"data-a-target",
	"data-test-selector",
	"type",
];
const _INDEPENDENT_VIDEO_AD_DETACHED_GRACE_MS = 10000;
const _IndependentVideoAdSuppressionState = {
	observer: null as MutationObserver | null,
	pruneTimeoutId: null as ReturnType<typeof setTimeout> | null,
	suppressedMedia: new Map<
		HTMLVideoElement,
		{
			display: { value: string; priority: string };
			visibility: { value: string; priority: string };
			pointerEvents: { value: string; priority: string };
			defaultMuted: boolean;
			muted: boolean;
			volume: number;
			detachedAt: number | null;
			container: HTMLElement | null;
		}
	>(),
	suppressedContainers: new Map<
		HTMLElement,
		{ display: { value: string; priority: string } }
	>(),
};

function _isIndependentVideoAdGuardEnabled() {
	return __TTVAB_STATE__?.IsAdStrippingEnabled === true;
}

function _ensureIndependentVideoAdStyle() {
	if (typeof document === "undefined") return false;
	if (document.getElementById(_INDEPENDENT_VIDEO_AD_STYLE_ID)) return true;
	if (!document.head) return false;
	const style = document.createElement("style");
	style.id = _INDEPENDENT_VIDEO_AD_STYLE_ID;
	style.textContent = [
		'video[data-ttvab-independent-ad-suppressed="true"]{display:none!important;visibility:hidden!important;pointer-events:none!important}',
		'[data-ttvab-independent-ad-container="true"]{display:none!important}',
		'.stream-display-ad__wrapper + div > div[style^="position:"] > div[class^="Layout-sc-"]:has(video[src^="https://m.media-amazon.com"]){display:none!important}',
		'.chat-shell > div[class^="Layout-sc-"] > div[style^="transition:"]:has(video[src^="https://m.media-amazon.com"]){display:none!important}',
	].join("");
	document.head.appendChild(style);
	return true;
}

function _getPrimaryPlayerVideoMatch(media) {
	if (
		!(media instanceof HTMLVideoElement) ||
		typeof _getPlayerAndState !== "function"
	) {
		return null;
	}
	try {
		const { player } = _getPlayerAndState();
		const primaryMedia = player?.getHTMLVideoElement?.();
		if (!(primaryMedia instanceof HTMLVideoElement)) return null;
		return primaryMedia === media;
	} catch {
		return null;
	}
}

function _hasKnownIndependentVideoAdSource(media) {
	if (!(media instanceof HTMLVideoElement)) return false;
	const sources = [
		media.currentSrc,
		media.getAttribute("src"),
		...Array.from(media.querySelectorAll("source[src]"), (source) =>
			source.getAttribute("src"),
		),
	];
	for (const source of sources) {
		if (!source) continue;
		try {
			const hostname = new URL(
				source,
				globalThis.location?.href || "https://www.twitch.tv/",
			).hostname.toLowerCase();
			if (
				hostname === "media-amazon.com" ||
				hostname.endsWith(".media-amazon.com")
			) {
				return true;
			}
		} catch {}
	}
	return false;
}

function _hasIndependentVideoAdLabel(media) {
	if (!(media instanceof HTMLVideoElement)) return false;
	const label = media.getAttribute("aria-label")?.trim().toLowerCase();
	if (!label) return false;
	return (
		label === _INDEPENDENT_VIDEO_AD_LABEL ||
		label.startsWith(_INDEPENDENT_VIDEO_AD_LABEL_PREFIX)
	);
}

function _hasBlobMediaSource(media) {
	if (!(media instanceof HTMLVideoElement)) return false;
	const source = media.currentSrc || media.getAttribute("src") || "";
	return source.startsWith("blob:");
}

function _limitIndependentVideoAdDiagnostic(value, maxLength) {
	const text = typeof value === "string" ? value : String(value || "");
	if (text.length <= maxLength) return text;
	if (maxLength <= 3) return text.slice(0, maxLength);
	return `${text.slice(0, maxLength - 3)}...`;
}

function _normalizeIndependentVideoAdDiagnosticValue(
	value,
	maxLength = _INDEPENDENT_VIDEO_AD_LOG_VALUE_LIMIT,
) {
	const source = (
		typeof value === "string" ? value : String(value || "")
	).slice(0, Math.max(0, Number(maxLength) || 0) * 2);
	let controlled = "";
	for (const character of source) {
		const codePoint = character.codePointAt(0) || 0;
		const isControl =
			codePoint <= 0x1f ||
			(codePoint >= 0x7f && codePoint <= 0x9f) ||
			(codePoint >= 0x200b && codePoint <= 0x200f) ||
			(codePoint >= 0x2028 && codePoint <= 0x202e) ||
			(codePoint >= 0x2060 && codePoint <= 0x206f) ||
			codePoint === 0xfeff;
		controlled += isControl ? " " : character;
	}
	const normalized = controlled
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e");
	return _limitIndependentVideoAdDiagnostic(normalized, maxLength);
}

function _sanitizeIndependentVideoAdDiagnosticSource(value) {
	const rawSource = typeof value === "string" ? value.trim() : "";
	if (!rawSource) return "";
	try {
		if (/^blob:/i.test(rawSource)) {
			const blobTarget = new URL(rawSource.slice(rawSource.indexOf(":") + 1));
			if (blobTarget.origin && blobTarget.origin !== "null") {
				return _normalizeIndependentVideoAdDiagnosticValue(
					`blob:${blobTarget.origin}/[redacted]`,
					_INDEPENDENT_VIDEO_AD_LOG_SOURCE_LIMIT,
				);
			}
			return "blob:[redacted]";
		}
		const pageHref = String(globalThis.location?.href || "");
		const baseUrl = /^https?:/i.test(pageHref)
			? pageHref
			: "https://www.twitch.tv/";
		const parsed = new URL(rawSource, baseUrl);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return "[redacted]";
		}
		return _normalizeIndependentVideoAdDiagnosticValue(
			`${parsed.protocol}//${parsed.host}${parsed.pathname || "/"}`,
			_INDEPENDENT_VIDEO_AD_LOG_SOURCE_LIMIT,
		);
	} catch {
		return "[redacted]";
	}
}

function _describeIndependentVideoAdElement(element) {
	if (!(element instanceof Element)) return "";
	try {
		const tagName = element.tagName.toLowerCase();
		const parts = [`<${tagName}`];
		for (const attributeName of _INDEPENDENT_VIDEO_AD_LOG_ATTRIBUTES) {
			const attributeValue = element.getAttribute(attributeName);
			if (attributeValue === null) continue;
			parts.push(
				` ${attributeName}="${_normalizeIndependentVideoAdDiagnosticValue(attributeValue)}"`,
			);
		}

		const source = _sanitizeIndependentVideoAdDiagnosticSource(
			element.getAttribute("src"),
		);
		if (source) parts.push(` src="${source}"`);

		if (element instanceof HTMLMediaElement) {
			const currentSource = _sanitizeIndependentVideoAdDiagnosticSource(
				element.currentSrc,
			);
			if (currentSource && currentSource !== source) {
				parts.push(` current-src="${currentSource}"`);
			}
			parts.push(
				` muted="${element.muted === true}"`,
				` default-muted="${element.defaultMuted === true}"`,
				` paused="${element.paused === true}"`,
				` ended="${element.ended === true}"`,
				` volume="${Number.isFinite(element.volume) ? element.volume : "unknown"}"`,
				` ready-state="${Math.max(0, Math.trunc(Number(element.readyState) || 0))}"`,
				` network-state="${Math.max(0, Math.trunc(Number(element.networkState) || 0))}"`,
			);
		}

		parts.push(">");
		return _limitIndependentVideoAdDiagnostic(
			parts.join(""),
			_INDEPENDENT_VIDEO_AD_LOG_DESCRIPTOR_LIMIT,
		);
	} catch {
		return "<element>";
	}
}

function _serializeIndependentVideoAdElement(media) {
	if (!(media instanceof HTMLVideoElement)) return "";
	const description = _describeIndependentVideoAdElement(media);
	try {
		const sourceElements = media.querySelectorAll("source[src]");
		if (sourceElements.length === 0) return description;
		const describedSources = [];
		const sourceCount = Math.min(
			_INDEPENDENT_VIDEO_AD_LOG_CHILD_SOURCE_LIMIT,
			sourceElements.length,
		);
		for (let index = 0; index < sourceCount; index += 1) {
			describedSources.push(
				_describeIndependentVideoAdElement(sourceElements[index]),
			);
		}
		if (sourceElements.length > describedSources.length) {
			describedSources.push(
				`+${sourceElements.length - describedSources.length} more`,
			);
		}
		return _limitIndependentVideoAdDiagnostic(
			`${description} sources=[${describedSources.join(", ")}]`,
			_INDEPENDENT_VIDEO_AD_LOG_DESCRIPTOR_LIMIT,
		);
	} catch {
		return description;
	}
}

function _serializeIndependentVideoAdAncestry(media) {
	if (!(media instanceof HTMLVideoElement)) return "";
	const chain = [];
	let element = media.parentElement;
	for (
		let depth = 0;
		element && depth <= _INDEPENDENT_VIDEO_AD_CONTAINER_MAX_DEPTH;
		depth += 1
	) {
		chain.push(_describeIndependentVideoAdElement(element));
		element = element.parentElement;
	}
	return _limitIndependentVideoAdDiagnostic(
		chain.join(" < "),
		_INDEPENDENT_VIDEO_AD_LOG_DESCRIPTOR_LIMIT,
	);
}

function _isIndependentVideoAdDiagnosticCandidate(media) {
	return (
		media instanceof HTMLVideoElement &&
		(_hasKnownIndependentVideoAdSource(media) ||
			_hasIndependentVideoAdLabel(media) ||
			media.hasAttribute(_INDEPENDENT_VIDEO_AD_SUPPRESSED_ATTRIBUTE))
	);
}

function _captureIndependentVideoAdDiagnostics() {
	if (typeof document === "undefined") return 0;
	let capturedCount = 0;
	for (const media of document.querySelectorAll("video")) {
		if (!_isIndependentVideoAdDiagnosticCandidate(media)) continue;
		_log(
			`Independent video advertisement log snapshot: ${_serializeIndependentVideoAdElement(media)}`,
			"info",
		);
		_log(
			`Independent video advertisement ancestry: ${_serializeIndependentVideoAdAncestry(media)}`,
			"info",
		);
		capturedCount += 1;
	}
	if (capturedCount === 0) {
		_log("Independent video advertisement log snapshot: none present", "info");
	}
	return capturedCount;
}

function _isIndependentVideoAd(media) {
	if (
		!_isIndependentVideoAdGuardEnabled() ||
		!(media instanceof HTMLVideoElement)
	) {
		return false;
	}
	if (_hasKnownIndependentVideoAdSource(media)) return true;
	const primaryMatch = _getPrimaryPlayerVideoMatch(media);
	if (primaryMatch === true) return false;
	return (
		primaryMatch === false &&
		!_hasBlobMediaSource(media) &&
		_hasIndependentVideoAdLabel(media)
	);
}

function _isIndependentVideoAdContainerBoundary(element, media) {
	if (!(element instanceof HTMLElement)) return true;
	if (
		element === document.body ||
		element === document.documentElement ||
		!element.parentElement
	) {
		return true;
	}
	try {
		if (
			element.matches(_INDEPENDENT_VIDEO_AD_CONTAINER_BOUNDARY_SELECTOR) ||
			element.querySelector(_INDEPENDENT_VIDEO_AD_CONTAINER_BOUNDARY_SELECTOR)
		) {
			return true;
		}
		for (const candidate of element.querySelectorAll("video")) {
			if (
				candidate !== media &&
				!candidate.hasAttribute(_INDEPENDENT_VIDEO_AD_SUPPRESSED_ATTRIBUTE)
			) {
				return true;
			}
		}
	} catch {
		return true;
	}
	return false;
}

function _findIndependentVideoAdContainer(media) {
	if (!(media instanceof HTMLVideoElement)) return null;
	let container = media.parentElement;
	if (_isIndependentVideoAdContainerBoundary(container, media)) return null;
	for (
		let depth = 1;
		depth < _INDEPENDENT_VIDEO_AD_CONTAINER_MAX_DEPTH;
		depth += 1
	) {
		const parent = container.parentElement;
		if (
			parent?.childElementCount !== 1 ||
			_isIndependentVideoAdContainerBoundary(parent, media)
		) {
			break;
		}
		container = parent;
	}
	return container;
}

function _isIndependentVideoAdContainerReferenced(container, ignoredMedia) {
	for (const [
		media,
		state,
	] of _IndependentVideoAdSuppressionState.suppressedMedia) {
		if (media !== ignoredMedia && state.container === container) return true;
	}
	return false;
}

function _suppressIndependentVideoAdContainer(container) {
	if (!(container instanceof HTMLElement)) return false;
	if (_IndependentVideoAdSuppressionState.suppressedContainers.has(container)) {
		if (
			container.getAttribute(_INDEPENDENT_VIDEO_AD_CONTAINER_ATTRIBUTE) !==
			"true"
		) {
			container.setAttribute(_INDEPENDENT_VIDEO_AD_CONTAINER_ATTRIBUTE, "true");
		}
		container.style.setProperty("display", "none", "important");
		return true;
	}
	_IndependentVideoAdSuppressionState.suppressedContainers.set(container, {
		display: {
			value: container.style.getPropertyValue("display"),
			priority: container.style.getPropertyPriority("display"),
		},
	});
	container.style.setProperty("display", "none", "important");
	container.setAttribute(_INDEPENDENT_VIDEO_AD_CONTAINER_ATTRIBUTE, "true");
	_log(
		`Collapsed independent video advertisement container: ${_describeIndependentVideoAdElement(container)}`,
		"info",
	);
	return true;
}

function _releaseIndependentVideoAdContainer(container, ignoredMedia) {
	if (!(container instanceof HTMLElement)) return false;
	const state =
		_IndependentVideoAdSuppressionState.suppressedContainers.get(container);
	if (!state) return false;
	if (_isIndependentVideoAdContainerReferenced(container, ignoredMedia)) {
		return false;
	}
	_restoreIndependentVideoAdStyle(container, "display", state.display);
	container.removeAttribute(_INDEPENDENT_VIDEO_AD_CONTAINER_ATTRIBUTE);
	_IndependentVideoAdSuppressionState.suppressedContainers.delete(container);
	return true;
}

function _syncIndependentVideoAdContainer(media, state) {
	let container = state.container;
	if (!container?.isConnected || !container.contains(media)) {
		container = _findIndependentVideoAdContainer(media);
		if (state.container && state.container !== container) {
			_releaseIndependentVideoAdContainer(state.container, media);
		}
		state.container = container;
	}
	if (container) _suppressIndependentVideoAdContainer(container);
	return container;
}

function _restoreIndependentVideoAdStyle(media, property, state) {
	if (state.value) {
		media.style.setProperty(property, state.value, state.priority);
	} else {
		media.style.removeProperty(property);
	}
}

function _restoreIndependentVideoAd(media) {
	if (!(media instanceof HTMLVideoElement)) return false;
	const state = _IndependentVideoAdSuppressionState.suppressedMedia.get(media);
	if (!state) return false;
	try {
		_restoreIndependentVideoAdStyle(media, "display", state.display);
		_restoreIndependentVideoAdStyle(media, "visibility", state.visibility);
		_restoreIndependentVideoAdStyle(
			media,
			"pointer-events",
			state.pointerEvents,
		);
		media.defaultMuted = state.defaultMuted;
		media.muted = state.muted;
		media.volume = state.volume;
		media.removeAttribute(_INDEPENDENT_VIDEO_AD_SUPPRESSED_ATTRIBUTE);
		_IndependentVideoAdSuppressionState.suppressedMedia.delete(media);
		if (state.container) {
			_releaseIndependentVideoAdContainer(state.container, media);
		}
		_log("Restored independent video element after advertisement", "info");
		return true;
	} catch {
		return false;
	}
}

function _suppressIndependentVideoAd(media) {
	if (!_isIndependentVideoAd(media)) {
		_restoreIndependentVideoAd(media);
		return false;
	}
	try {
		const alreadySuppressed =
			_IndependentVideoAdSuppressionState.suppressedMedia.has(media);
		const elementDiagnostic = alreadySuppressed
			? ""
			: _serializeIndependentVideoAdElement(media);
		if (!alreadySuppressed) {
			_IndependentVideoAdSuppressionState.suppressedMedia.set(media, {
				display: {
					value: media.style.getPropertyValue("display"),
					priority: media.style.getPropertyPriority("display"),
				},
				visibility: {
					value: media.style.getPropertyValue("visibility"),
					priority: media.style.getPropertyPriority("visibility"),
				},
				pointerEvents: {
					value: media.style.getPropertyValue("pointer-events"),
					priority: media.style.getPropertyPriority("pointer-events"),
				},
				defaultMuted: media.defaultMuted,
				muted: media.muted,
				volume: media.volume,
				detachedAt: null,
				container: null,
			});
		}
		const isNewSuppression =
			!alreadySuppressed &&
			!media.hasAttribute(_INDEPENDENT_VIDEO_AD_SUPPRESSED_ATTRIBUTE);
		media.style.setProperty("display", "none", "important");
		media.style.setProperty("visibility", "hidden", "important");
		media.style.setProperty("pointer-events", "none", "important");
		if (!media.defaultMuted) media.defaultMuted = true;
		if (!media.muted) media.muted = true;
		if (media.volume !== 0) media.volume = 0;
		media.setAttribute(_INDEPENDENT_VIDEO_AD_SUPPRESSED_ATTRIBUTE, "true");
		_syncIndependentVideoAdContainer(
			media,
			_IndependentVideoAdSuppressionState.suppressedMedia.get(media),
		);
		if (isNewSuppression && typeof _incrementAdsBlocked === "function") {
			_incrementAdsBlocked(__TTVAB_STATE__?.PageChannel || null);
		}
		if (!alreadySuppressed) {
			_log(
				`Suppressed independent video advertisement: ${elementDiagnostic}`,
				"info",
			);
		}
		return true;
	} catch {
		_restoreIndependentVideoAd(media);
		return false;
	}
}

function _suppressIndependentVideoAdsInDocument(root: ParentNode = document) {
	if (!root?.querySelectorAll) return 0;
	let suppressedCount = 0;
	for (const media of root.querySelectorAll(_INDEPENDENT_VIDEO_AD_SELECTOR)) {
		if (_suppressIndependentVideoAd(media)) {
			suppressedCount += 1;
		}
	}
	return suppressedCount;
}

function _restoreIndependentVideoAds() {
	_clearIndependentVideoAdPruneTimer();
	let restoredCount = 0;
	for (const media of [
		..._IndependentVideoAdSuppressionState.suppressedMedia.keys(),
	]) {
		if (!media.isConnected) {
			try {
				media.pause();
			} catch {}
		}
		if (_restoreIndependentVideoAd(media)) restoredCount += 1;
	}
	for (const container of [
		..._IndependentVideoAdSuppressionState.suppressedContainers.keys(),
	]) {
		_releaseIndependentVideoAdContainer(container, null);
	}
	return restoredCount;
}

function _clearIndependentVideoAdPruneTimer() {
	if (_IndependentVideoAdSuppressionState.pruneTimeoutId) {
		clearTimeout(_IndependentVideoAdSuppressionState.pruneTimeoutId);
	}
	_IndependentVideoAdSuppressionState.pruneTimeoutId = null;
}

function _scheduleIndependentVideoAdPrune(delay) {
	_clearIndependentVideoAdPruneTimer();
	_IndependentVideoAdSuppressionState.pruneTimeoutId = setTimeout(
		() => {
			_IndependentVideoAdSuppressionState.pruneTimeoutId = null;
			_pruneIndependentVideoAdSuppressions();
		},
		Math.max(0, delay),
	);
}

function _pruneIndependentVideoAdSuppressions() {
	let prunedCount = 0;
	const now = Date.now();
	let nextPruneDelay = null;
	for (const [media, state] of [
		..._IndependentVideoAdSuppressionState.suppressedMedia.entries(),
	]) {
		if (media.isConnected) {
			state.detachedAt = null;
			continue;
		}
		if (typeof state.detachedAt !== "number") {
			state.detachedAt = now;
		}
		const remainingGrace =
			_INDEPENDENT_VIDEO_AD_DETACHED_GRACE_MS - (now - state.detachedAt);
		if (remainingGrace > 0) {
			nextPruneDelay =
				nextPruneDelay === null
					? remainingGrace
					: Math.min(nextPruneDelay, remainingGrace);
			continue;
		}
		try {
			media.pause();
		} catch {}
		_IndependentVideoAdSuppressionState.suppressedMedia.delete(media);
		if (state.container) {
			_releaseIndependentVideoAdContainer(state.container, media);
		}
		prunedCount += 1;
	}
	_clearIndependentVideoAdPruneTimer();
	if (nextPruneDelay !== null) {
		_scheduleIndependentVideoAdPrune(nextPruneDelay);
	}
	return prunedCount;
}

function _setIndependentVideoAdGuardEnabled(enabled) {
	if (typeof document === "undefined") return false;
	if (!enabled) {
		document.getElementById(_INDEPENDENT_VIDEO_AD_STYLE_ID)?.remove();
		_restoreIndependentVideoAds();
		return true;
	}
	const didInstallStyle = _ensureIndependentVideoAdStyle();
	_suppressIndependentVideoAdsInDocument();
	return didInstallStyle;
}

function _handleIndependentVideoAdMediaEvent(event) {
	_suppressIndependentVideoAd(event.target);
}

function _suppressIndependentVideoAdsForNode(node) {
	if (node instanceof HTMLVideoElement) {
		return _suppressIndependentVideoAd(node) ? 1 : 0;
	}
	if (!(node instanceof Element)) return 0;
	let suppressedCount = 0;
	const parentMedia = node.closest("video");
	if (
		parentMedia instanceof HTMLVideoElement &&
		_suppressIndependentVideoAd(parentMedia)
	) {
		suppressedCount += 1;
	}
	return suppressedCount + _suppressIndependentVideoAdsInDocument(node);
}

function _handleIndependentVideoAdMutations(records) {
	for (const record of records) {
		if (record.type === "attributes") {
			_suppressIndependentVideoAdsForNode(record.target);
			continue;
		}
		for (const node of record.addedNodes) {
			_suppressIndependentVideoAdsForNode(node);
		}
	}
	_pruneIndependentVideoAdSuppressions();
}

function _installIndependentVideoAdObserver() {
	if (_IndependentVideoAdSuppressionState.observer) return true;
	if (typeof MutationObserver !== "function") return false;
	const observer = new MutationObserver(_handleIndependentVideoAdMutations);
	observer.observe(document, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: [
			"aria-label",
			"src",
			_INDEPENDENT_VIDEO_AD_CONTAINER_ATTRIBUTE,
		],
	});
	_IndependentVideoAdSuppressionState.observer = observer;
	_log("Independent video advertisement observer installed", "debug");
	return true;
}

function _hookIndependentVideoAdGuard() {
	if (
		typeof document === "undefined" ||
		typeof window === "undefined" ||
		window.__TTVAB_INDEPENDENT_VIDEO_AD_GUARD__
	) {
		return;
	}

	if (
		!_setIndependentVideoAdGuardEnabled(_isIndependentVideoAdGuardEnabled()) &&
		document.readyState === "loading"
	) {
		document.addEventListener(
			"DOMContentLoaded",
			() => {
				_setIndependentVideoAdGuardEnabled(_isIndependentVideoAdGuardEnabled());
			},
			{ once: true },
		);
	}

	for (const eventName of ["play", "playing", "volumechange"]) {
		document.addEventListener(
			eventName,
			_handleIndependentVideoAdMediaEvent,
			true,
		);
	}
	_installIndependentVideoAdObserver();

	window.__TTVAB_INDEPENDENT_VIDEO_AD_GUARD__ = true;
}

function _hookSecondaryPlayerHandoffDetection() {
	if (
		_PlaybackIntentState.secondaryPlayerLaunchMonitorInitialized ||
		typeof window === "undefined"
	) {
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
				} catch {}
				const openedWindow = nativeOpen.apply(this, args);
				try {
					if (descriptor) {
						if (openedWindow) {
							const didBegin = _beginSecondaryPlayerHandoff(descriptor, {
								sourceWasPlaying,
								pauseSource: descriptor.kind !== "pip",
							});
							if (didBegin) {
								_monitorSecondaryPlayerWindowClose(
									openedWindow,
									descriptor,
									sourceWasPlaying,
								);
							}
						} else {
							_rollbackSecondaryPlayerHandoff(
								descriptor.channel || null,
								descriptor.mediaKey || null,
								false,
							);
						}
					}
				} catch {}
				return openedWindow;
			};
			window.__TTVAB_WINDOW_OPEN_PATCHED__ = true;
		} catch {}
	}

	if (!window.__TTVAB_REQUEST_PIP_PATCHED__) {
		const nativeRequestPictureInPicture =
			HTMLVideoElement?.prototype?.requestPictureInPicture;
		if (typeof nativeRequestPictureInPicture === "function") {
			try {
				HTMLVideoElement.prototype.requestPictureInPicture =
					function patchedRequestPictureInPicture(...args) {
						const result = nativeRequestPictureInPicture.apply(this, args);
						if (typeof result?.then === "function") {
							return result.then((value) => {
								try {
									_setActivePictureInPicturePlaybackContext(this);
									const descriptor = {
										kind: "pip",
										channel:
											_normalizePlayerChannel(__TTVAB_STATE__.PageChannel) ||
											null,
										mediaKey:
											_normalizeMediaKey(__TTVAB_STATE__.PageMediaKey) ||
											_resolvePlayerMediaKey(__TTVAB_STATE__.PageChannel, null),
									};
									_beginSecondaryPlayerHandoff(descriptor, {
										pauseSource: false,
										sourceWasPlaying: _isPrimaryPlaybackCurrentlyActive(),
									});
								} catch {}
								return value;
							});
						}
						return result;
					};
				window.__TTVAB_REQUEST_PIP_PATCHED__ = true;
			} catch {}
		}
	}

	document.addEventListener(
		"enterpictureinpicture",
		(event) => {
			_setActivePictureInPicturePlaybackContext(event.target);
			_beginSecondaryPlayerHandoff(
				{
					kind: "pip",
					channel: _normalizePlayerChannel(__TTVAB_STATE__.PageChannel) || null,
					mediaKey:
						_normalizeMediaKey(__TTVAB_STATE__.PageMediaKey) ||
						_resolvePlayerMediaKey(__TTVAB_STATE__.PageChannel, null),
				},
				{
					pauseSource: false,
					sourceWasPlaying: _isPrimaryPlaybackCurrentlyActive(),
				},
			);
		},
		true,
	);
	document.addEventListener(
		"leavepictureinpicture",
		(event) => {
			const releasedContext = _clearActivePictureInPicturePlaybackContext(
				event.target,
			);
			if (_PlaybackIntentState.secondaryPlayerHandoffKind === "pip") {
				_clearSecondaryPlayerHandoff();
			}
			if (
				releasedContext?.MediaKey &&
				releasedContext.MediaKey !==
					_normalizeMediaKey(__TTVAB_STATE__?.PageMediaKey) &&
				typeof _releasePlaybackContext === "function"
			) {
				_releasePlaybackContext(releasedContext);
			}
		},
		true,
	);
	window.addEventListener("pagehide", _clearSecondaryPlayerHandoff);
	_setActivePictureInPicturePlaybackContext(document.pictureInPictureElement);

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
	const pipContext = _getActivePictureInPicturePlaybackContext();
	if (
		pipContext &&
		_isActivePictureInPicturePlaybackContext({
			ChannelName: safeChannel,
			MediaKey: safeMediaKey,
		})
	) {
		if (pipContext.element.ended || !pipContext.element.paused) return false;
		return _playPlaybackTarget(
			pipContext.element,
			pipContext.ChannelName,
			pipContext.MediaKey,
		);
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
	if (
		!(media instanceof HTMLMediaElement) ||
		!media.isConnected ||
		media.ended ||
		!media.paused
	) {
		return false;
	}

	return _playPlaybackTarget(media, safeChannel, safeMediaKey);
}

function _guardPlaybackAcrossVisibilityTransition(
	channel = null,
	mediaKey = null,
) {
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	if (!safeMediaKey) {
		return;
	}
	if (_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey)) {
		return;
	}
	const retryDelays = _isNativeDocumentHidden()
		? _HIDDEN_VISIBILITY_RESUME_RETRY_DELAYS_MS
		: _VISIBILITY_RESUME_RETRY_DELAYS_MS;

	_resumePrimaryPlaybackIfPaused(safeChannel, safeMediaKey);
	for (const delay of retryDelays) {
		_schedulePlaybackRecoveryTimeout(
			() => {
				_resumePrimaryPlaybackIfPaused(safeChannel, safeMediaKey);
			},
			delay,
			safeChannel,
			safeMediaKey,
		);
	}
}

function _scheduleResumeRetries(
	channel = null,
	mediaKey = null,
	delays = [120, 350, 900],
	options: {
		requireAdResumeIntent?: boolean;
		cycleStartedAt?: number | null;
	} = {},
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
			Math.max(0, Number(options.cycleStartedAt) || 0),
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

function _clearCachedPrimaryMediaElement() {
	_cachedPrimaryMediaElement = null;
	_cachedPrimaryMediaElementKey = null;
	_cachedPrimaryMediaElementSearchedAt = 0;
}

function _getPrimaryMediaElement() {
	const currentMediaKey =
		typeof __TTVAB_STATE__ !== "undefined" && __TTVAB_STATE__
			? __TTVAB_STATE__.PageMediaKey
			: null;
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

function _getPlaybackMediaElementForContext(channel = null, mediaKey = null) {
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	if (!safeMediaKey) return null;

	const pipContext = _getActivePictureInPicturePlaybackContext();
	const pipMediaKey = _normalizeMediaKey(pipContext?.MediaKey);
	if (
		pipMediaKey === safeMediaKey &&
		pipContext?.element instanceof HTMLMediaElement
	) {
		return pipContext.element;
	}

	if (_normalizeMediaKey(__TTVAB_STATE__?.PageMediaKey) !== safeMediaKey) {
		return null;
	}

	const primaryMedia = _getPrimaryMediaElement();
	if (!(primaryMedia instanceof HTMLMediaElement)) return null;
	if (primaryMedia === pipContext?.element && pipMediaKey !== safeMediaKey) {
		return null;
	}
	return primaryMedia;
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

function _silenceSuppressedMediaElement(media) {
	if (!(media instanceof HTMLMediaElement)) return false;
	try {
		media.defaultMuted = true;
		media.muted = true;
		media.volume = 0;
		media.removeAttribute("data-ttvab-audio-suppressed");
		return true;
	} catch {
		return false;
	}
}

function _pruneDisconnectedSuppressedMedia() {
	let prunedCount = 0;
	for (const [
		media,
		state,
	] of _AdAudioSuppressionState.suppressedMedia.entries()) {
		if (media instanceof HTMLMediaElement && media.isConnected) continue;
		_silenceSuppressedMediaElement(media);
		if (media instanceof HTMLMediaElement) {
			_AdAudioSuppressionState.detachedMediaStates.set(media, state);
		}
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
	options: {
		restoreConnected?: boolean;
		preserveMediaKey?: string | null;
		onlyMediaKey?: string | null;
	} = {},
) {
	const {
		restoreConnected = false,
		preserveMediaKey = null,
		onlyMediaKey = null,
	} = options;
	if (
		_normalizeMediaKey(onlyMediaKey) &&
		_normalizeMediaKey(_AdAudioSuppressionState.activeMediaKey) !==
			_normalizeMediaKey(onlyMediaKey)
	) {
		return 0;
	}
	if (
		_normalizeMediaKey(preserveMediaKey) &&
		_normalizeMediaKey(_AdAudioSuppressionState.activeMediaKey) ===
			_normalizeMediaKey(preserveMediaKey)
	) {
		return 0;
	}
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
		} else if (media instanceof HTMLMediaElement) {
			_silenceSuppressedMediaElement(media);
			_AdAudioSuppressionState.detachedMediaStates.set(media, state);
		}
	}

	_AdAudioSuppressionState.suppressedMedia.clear();
	_AdAudioSuppressionState.activeMediaKey = null;
	_AdAudioSuppressionState.lastSuppressedCount = 0;
	return restoredCount;
}

function _suppressCompetingMediaDuringAd(channel = null, mediaKey = null) {
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	const primaryMedia = _getPlaybackMediaElementForContext(
		channel,
		safeMediaKey,
	);
	let suppressedCount = 0;

	_pruneDisconnectedSuppressedMedia();

	if (!(primaryMedia instanceof HTMLMediaElement)) {
		return 0;
	}
	if (
		safeMediaKey &&
		_AdAudioSuppressionState.activeMediaKey &&
		_AdAudioSuppressionState.activeMediaKey !== safeMediaKey
	) {
		_clearSuppressedMediaTracking({ restoreConnected: true });
	} else {
		const primarySuppression =
			_AdAudioSuppressionState.suppressedMedia.get(primaryMedia) ||
			_AdAudioSuppressionState.detachedMediaStates.get(primaryMedia);
		if (
			primarySuppression &&
			_restoreSuppressedMediaElement(primaryMedia, primarySuppression)
		) {
			_AdAudioSuppressionState.suppressedMedia.delete(primaryMedia);
			_AdAudioSuppressionState.detachedMediaStates.delete(primaryMedia);
		}
	}

	for (const media of document.querySelectorAll("video, audio")) {
		if (!(media instanceof HTMLMediaElement)) continue;
		if (!media.isConnected || media.ended) continue;
		if (primaryMedia && media === primaryMedia) continue;
		if (media.paused && (media.muted || Number(media.volume ?? 1) === 0)) {
			continue;
		}

		const detachedSuppression =
			_AdAudioSuppressionState.detachedMediaStates.get(media);
		if (
			detachedSuppression &&
			!_AdAudioSuppressionState.suppressedMedia.has(media)
		) {
			_AdAudioSuppressionState.suppressedMedia.set(media, detachedSuppression);
			_AdAudioSuppressionState.detachedMediaStates.delete(media);
		}
		const alreadySuppressed =
			_AdAudioSuppressionState.suppressedMedia.has(media);
		if (!alreadySuppressed) {
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
			if (!alreadySuppressed) {
				suppressedCount += 1;
			}
		} catch {}
	}

	_AdAudioSuppressionState.activeMediaKey = safeMediaKey;
	_AdAudioSuppressionState.lastSuppressedCount =
		_AdAudioSuppressionState.suppressedMedia.size;
	if (suppressedCount > 0) {
		_log(
			`Suppressed ${suppressedCount} competing media element${suppressedCount === 1 ? "" : "s"} during ad recovery`,
			"info",
		);
	}
	return suppressedCount;
}

function _restoreReattachedSuppressedPrimaryMedia() {
	const primaryMedia = _getPrimaryMediaElement();
	const pipMedia =
		typeof _getPictureInPictureVideo === "function"
			? _getPictureInPictureVideo()
			: null;
	let restoredCount = 0;
	for (const media of new Set([primaryMedia, pipMedia])) {
		if (!(media instanceof HTMLMediaElement) || !media.isConnected) continue;
		const state = _AdAudioSuppressionState.detachedMediaStates.get(media);
		if (!state || !_restoreSuppressedMediaElement(media, state)) continue;
		_AdAudioSuppressionState.detachedMediaStates.delete(media);
		restoredCount += 1;
	}
	if (restoredCount > 0) {
		_log(
			`Restored ${restoredCount} reattached media element${restoredCount === 1 ? "" : "s"} after ad`,
			"info",
		);
	}
	return restoredCount;
}

function _restoreSuppressedMediaAfterAd(channel = null, mediaKey = null) {
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	const activeMediaKey = _AdAudioSuppressionState.activeMediaKey;
	if (safeMediaKey && activeMediaKey && safeMediaKey !== activeMediaKey) {
		const suppressedAdStillActive =
			_normalizeMediaKey(__TTVAB_STATE__?.CurrentAdMediaKey) === activeMediaKey;
		if (suppressedAdStillActive) {
			return 0;
		}
	}

	let restoredCount = 0;
	_clearCachedPrimaryMediaElement();
	const primaryMedia = _getPrimaryMediaElement();
	const pipMedia =
		typeof _getPictureInPictureVideo === "function"
			? _getPictureInPictureVideo()
			: null;
	for (const [
		media,
		state,
	] of _AdAudioSuppressionState.suppressedMedia.entries()) {
		if (media.isConnected && (media === primaryMedia || media === pipMedia)) {
			if (_restoreSuppressedMediaElement(media, state)) {
				restoredCount += 1;
			}
		} else {
			_silenceSuppressedMediaElement(media);
			_AdAudioSuppressionState.detachedMediaStates.set(media, state);
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
	if (_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey)) {
		_clearAdResumeIntent();
		return false;
	}
	if (!_hasPendingAdResumeIntent(safeChannel, safeMediaKey)) return false;
	_maybeClearTransientPauseIntentAfterAd(safeChannel, safeMediaKey);
	return !_hasUserPauseIntent(safeChannel, safeMediaKey);
}

function _hasPendingAdResumeIntent(channel = null, mediaKey = null) {
	const until = Number(__TTVAB_STATE__.ShouldResumeAfterAdUntil) || 0;
	if (__TTVAB_STATE__.ShouldResumeAfterAd !== true) {
		return false;
	}
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _resolvePlayerMediaKey(channel, mediaKey);
	const expectedChannel = __TTVAB_STATE__.ShouldResumeAfterAdChannel || null;
	const expectedMediaKey = __TTVAB_STATE__.ShouldResumeAfterAdMediaKey || null;
	if (until <= Date.now()) {
		const transactionOwnsResumeIntent = Boolean(
			_PostAdRecoveryTransactionState.mediaKey &&
				_isPostAdRecoveryCycleCurrent(
					_PostAdRecoveryTransactionState.mediaKey,
					_PostAdRecoveryTransactionState.cycleStartedAt,
				) &&
				_matchesPlaybackTargetContext(
					expectedChannel,
					expectedMediaKey,
					safeChannel,
					safeMediaKey,
				),
		);
		if (
			!_isCurrentAdCycleMatchingResumeIntent() &&
			!transactionOwnsResumeIntent
		) {
			_clearAdResumeIntent();
			return false;
		}
		_extendAdResumeIntentWindow();
	}

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

	let shouldResumeAfterAd =
		!_hasUserPauseIntent(safeChannel, safeMediaKey) &&
		!_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey);
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
	if (_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey)) {
		_clearAdResumeIntent();
		return false;
	}
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
		_armPostAdGraceWindow(Number(video?.currentTime) || 0);
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
				_armPostAdGraceWindow(Number(confirmVideo?.currentTime) || 0);
				_clearAdResumeIntent();
			}
		},
		900,
		safeChannel,
		safeMediaKey,
		_getPlayerLifecycleCycleStartedAt(safeMediaKey),
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
	const cycleStartedAt = _getPlayerLifecycleCycleStartedAt(mediaKey);
	const didRetry = _doPlayerTask(true, false, {
		reason: "ad-recovery",
		channel,
		mediaKey,
		cycleStartedAt,
	});
	if (didRetry) {
		_scheduleResumeRetries(channel, mediaKey, [250, 700, 1400], {
			cycleStartedAt,
		});
	}
	return Boolean(didRetry);
}

function _getContiguousBufferedEnd(video, currentTime) {
	const buffered = video?.buffered;
	if (!buffered || !(buffered.length > 0)) return 0;
	for (let bi = 0; bi < buffered.length; bi++) {
		let start = 0;
		let end = 0;
		try {
			start = buffered.start(bi);
			end = buffered.end(bi);
		} catch {
			continue;
		}
		if (currentTime >= start - 0.1 && currentTime <= end + 0.1) {
			return end;
		}
	}
	return 0;
}

function _seekPastBufferedGap(video, currentTime) {
	if (!video || !(video.buffered?.length > 1)) return 0;
	for (let bi = 0; bi < video.buffered.length; bi++) {
		let gapStart = 0;
		try {
			gapStart = video.buffered.start(bi);
		} catch {
			continue;
		}
		if (gapStart > currentTime + 0.25) {
			try {
				video.currentTime = gapStart + 0.05;
			} catch {
				return 0;
			}
			return gapStart - currentTime;
		}
	}
	return 0;
}

function _trySeekPastFrozenBufferGap(video, currentTime, readyState) {
	const lastPosition = _PlayerBufferState.gapJumpLastPosition;
	const advanced = lastPosition >= 0 && currentTime > lastPosition + 0.2;
	if (advanced || lastPosition < 0 || currentTime < lastPosition) {
		_PlayerBufferState.gapJumpStuckTicks = 0;
	} else {
		_PlayerBufferState.gapJumpStuckTicks++;
	}
	_PlayerBufferState.gapJumpLastPosition = currentTime;

	if (
		_PlayerBufferState.gapJumpStuckTicks < 3 ||
		readyState >= 3 ||
		!video ||
		!(video.buffered?.length > 1)
	) {
		return false;
	}

	const jumped = _seekPastBufferedGap(video, currentTime);
	if (jumped > 0) {
		_log(
			`Frozen playhead at ${currentTime.toFixed(3)}s with buffered gap; seeking ${jumped.toFixed(2)}s past it`,
			"warning",
		);
		_PlayerBufferState.gapJumpStuckTicks = 0;
		_PlayerBufferState.gapJumpLastPosition = -1;
		_PlayerBufferState.lastFixTime = Date.now();
		_PlayerBufferState.numSame = 0;
		return true;
	}
	_PlayerBufferState.gapJumpStuckTicks = 0;
	return false;
}

function _resetPostAdGrace() {
	_PlayerBufferState.postAdGraceUntil = 0;
	_PlayerBufferState.postAdGraceLastCurrentTime = 0;
	_PlayerBufferState.postAdGraceStallTicks = 0;
	_PlayerBufferState.postAdGracePauseResumeAt = 0;
	_PlayerBufferState.postAdGraceReloadAttempted = false;
}

function _armPostAdGraceWindow(currentTime = 0) {
	_PlayerBufferState.postAdGraceUntil = Date.now() + _POST_AD_GRACE_WINDOW_MS;
	_PlayerBufferState.postAdGraceLastCurrentTime = Number(currentTime) || 0;
	_PlayerBufferState.postAdGraceStallTicks = 0;
	_PlayerBufferState.postAdGracePauseResumeAt = 0;
	_PlayerBufferState.postAdGraceReloadAttempted = false;
}

function _handlePostAdGraceWatch(
	player,
	playerCore = null,
	video = null,
	channel = null,
	mediaKey = null,
	contentType = null,
) {
	const now = Date.now();
	if (
		_PlayerBufferState.postAdGraceUntil <= 0 ||
		now > _PlayerBufferState.postAdGraceUntil
	) {
		if (_PlayerBufferState.postAdGraceUntil > 0) _resetPostAdGrace();
		return false;
	}

	if (_shouldSuppressAutomaticPlaybackResume(channel, mediaKey)) {
		_resetPostAdGrace();
		return false;
	}

	const liveVideo = video || player?.getHTMLVideoElement?.() || null;
	if (!liveVideo) return false;
	if (liveVideo.ended) {
		_resetPostAdGrace();
		return false;
	}

	if (_isPlayerPaused(player, playerCore, liveVideo)) {
		_PlayerBufferState.postAdGraceLastCurrentTime =
			Number(liveVideo.currentTime) || 0;
		_PlayerBufferState.postAdGraceStallTicks = 0;
		return false;
	}

	const liveCurrentTime = Number(liveVideo.currentTime) || 0;
	const liveVideoWidth = Number(liveVideo.videoWidth) || 0;
	const advanced =
		liveCurrentTime > _PlayerBufferState.postAdGraceLastCurrentTime + 0.05;
	if (advanced) {
		_PlayerBufferState.postAdGraceStallTicks = 0;
	} else {
		_PlayerBufferState.postAdGraceStallTicks++;
	}
	_PlayerBufferState.postAdGraceLastCurrentTime = liveCurrentTime;

	const isStalled =
		liveVideoWidth <= 0 ||
		_PlayerBufferState.postAdGraceStallTicks >=
			_POST_AD_GRACE_STALL_TICKS_REQUIRED;
	if (!isStalled) return false;

	if (
		now - _PlayerBufferState.postAdGracePauseResumeAt >=
		_POST_AD_GRACE_PAUSE_RESUME_COOLDOWN_MS
	) {
		_PlayerBufferState.postAdGracePauseResumeAt = now;
		_PlayerBufferState.postAdGraceStallTicks = 0;
		_log(
			"Post-ad stall detected. Nudging player with pause/play...",
			"warning",
		);
		const cycleStartedAt = _getPlayerLifecycleCycleStartedAt(mediaKey);
		_doPlayerTask(true, false, {
			reason: "buffer-recovery",
			channel,
			mediaKey,
			cycleStartedAt,
		});
		_scheduleResumeRetries(channel, mediaKey, [250, 700, 1400], {
			cycleStartedAt,
		});
		return true;
	}

	if (
		_PlayerBufferState.lastFixTime >
		now - _POST_AD_RECOVERY_RELOAD_COOLDOWN_MS
	) {
		return false;
	}

	const escalateToNewInstance = _PlayerBufferState.postAdGraceReloadAttempted;
	_log(
		contentType && contentType !== "live"
			? escalateToNewInstance
				? "Replay/VOD player still stalling in post-ad window. Rebuilding native player..."
				: "Replay/VOD player still stalling in post-ad window. Reloading native player..."
			: escalateToNewInstance
				? "Player still stalling in post-ad window. Rebuilding native player..."
				: "Player still stalling in post-ad window. Reloading native player...",
		"warning",
	);
	_doPlayerTask(false, true, {
		reason: "buffer-recovery",
		refreshAccessToken: true,
		newMediaPlayerInstance: escalateToNewInstance,
	});
	_PlayerBufferState.lastFixTime = now;
	if (escalateToNewInstance) {
		_resetPostAdGrace();
	} else {
		_PlayerBufferState.postAdGraceReloadAttempted = true;
		_PlayerBufferState.postAdGraceStallTicks = 0;
	}
	return true;
}

function _resetPostAdRecoveryTransaction() {
	_PostAdRecoveryTransactionState.channel = null;
	_PostAdRecoveryTransactionState.mediaKey = null;
	_PostAdRecoveryTransactionState.cycleStartedAt = 0;
	_PostAdRecoveryTransactionState.video = null;
	_PostAdRecoveryTransactionState.observedAt = 0;
	_PostAdRecoveryTransactionState.lastCurrentTime = 0;
	_PostAdRecoveryTransactionState.stallTicks = 0;
	_PostAdRecoveryTransactionState.reloadRequestCount = 0;
	_PostAdRecoveryTransactionState.acceptedReloadCount = 0;
	_PostAdRecoveryTransactionState.lastReloadRequestAt = 0;
	_PostAdRecoveryTransactionState.expiresAt = 0;
	_PostAdRecoveryTransactionState.lastCheckedAt = 0;
	_PostAdRecoveryTransactionState.suspendedAt = 0;
	_PostAdRecoveryTransactionState.requiresReplacement = false;
	_PostAdRecoveryTransactionState.requiredReplacementVideo = null;
	_PostAdRecoveryTransactionState.pendingOperation = null;
	_PostAdRecoveryTransactionState.pendingOperationReadyAt = 0;
	_PostAdRecoveryTransactionState.initialOperationCompleted = false;
	_PostAdRecoveryTransactionState.terminalNudgeAttempted = false;
	_PostAdRecoveryTransactionState.passive = false;
}

function _resetPostAdRecoveryMonitorSamples() {
	_PlayerBufferState.postAdUnhealthyCount = 0;
	_PlayerBufferState.postAdRecoveryStartedAt = 0;
	_PlayerBufferState.postAdLastCurrentTime = 0;
	_PlayerBufferState.postAdStallTicks = 0;
	_PlayerBufferState.postAdSoftReloadAttempted = false;
}

function _isPostAdRecoveryCycleCurrent(mediaKey, cycleStartedAt) {
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	const safeCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	return Boolean(
		safeMediaKey &&
			safeCycleStartedAt > 0 &&
			!__TTVAB_STATE__?.CurrentAdMediaKey &&
			!__TTVAB_STATE__?.CurrentAdChannel &&
			_normalizeMediaKey(__TTVAB_STATE__?.PageMediaKey) === safeMediaKey &&
			_normalizeMediaKey(__TTVAB_STATE__?.LastAdEndedMediaKey) ===
				safeMediaKey &&
			Math.max(0, Number(__TTVAB_STATE__?.LastAdEndedCycleStartedAt) || 0) ===
				safeCycleStartedAt,
	);
}

function _isPostAdRecoveryTransactionCurrent(channel = null, mediaKey = null) {
	const transactionMediaKey = _normalizeMediaKey(
		_PostAdRecoveryTransactionState.mediaKey,
	);
	if (!transactionMediaKey) return false;
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	const safeChannel = _normalizePlayerChannel(channel);
	const transactionChannel = _normalizePlayerChannel(
		_PostAdRecoveryTransactionState.channel,
	);
	const isCurrent = Boolean(
		(!safeMediaKey || safeMediaKey === transactionMediaKey) &&
			(!safeChannel ||
				!transactionChannel ||
				safeChannel === transactionChannel) &&
			_isPostAdRecoveryCycleCurrent(
				transactionMediaKey,
				_PostAdRecoveryTransactionState.cycleStartedAt,
			) &&
			_isPlaybackRecoveryContextCurrent(
				transactionChannel,
				transactionMediaKey,
			),
	);
	if (!isCurrent) {
		_resetPostAdRecoveryTransaction();
	}
	return isCurrent;
}

function _startPostAdRecoveryTransaction(
	channel = null,
	mediaKey = null,
	cycleStartedAt = 0,
) {
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	const safeCycleStartedAt = Math.max(0, Number(cycleStartedAt) || 0);
	if (
		!safeMediaKey ||
		!_isPostAdRecoveryCycleCurrent(safeMediaKey, safeCycleStartedAt) ||
		!_isPlaybackRecoveryContextCurrent(safeChannel, safeMediaKey) ||
		!_hasPendingAdResumeIntent(safeChannel, safeMediaKey) ||
		_hasUserPauseIntent(safeChannel, safeMediaKey) ||
		_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey)
	) {
		return false;
	}
	if (
		_PostAdRecoveryTransactionState.mediaKey === safeMediaKey &&
		_PostAdRecoveryTransactionState.cycleStartedAt === safeCycleStartedAt
	) {
		return true;
	}

	_resetPostAdRecoveryTransaction();
	_PostAdRecoveryTransactionState.channel = safeChannel;
	_PostAdRecoveryTransactionState.mediaKey = safeMediaKey;
	_PostAdRecoveryTransactionState.cycleStartedAt = safeCycleStartedAt;
	const startedAt = Date.now();
	_PostAdRecoveryTransactionState.expiresAt =
		startedAt + _POST_AD_RECOVERY_TRANSACTION_TIMEOUT_MS;
	_PostAdRecoveryTransactionState.lastCheckedAt = startedAt;
	return true;
}

function _finishPostAdRecoveryTransaction(currentTime = 0) {
	_resetPostAdRecoveryTransaction();
	_resetPostAdRecoveryMonitorSamples();
	_armPostAdGraceWindow(currentTime);
	_clearAdResumeIntent();
	__TTVAB_STATE__._AdRecoveryConsecutiveFailures = 0;
}

function _cancelPostAdRecoveryTransaction(clearResumeIntent = true) {
	_resetPostAdRecoveryTransaction();
	_resetPostAdRecoveryMonitorSamples();
	if (clearResumeIntent) {
		_clearAdResumeIntent();
	}
}

function _rememberPendingPostAdRecoveryOperation(
	isPausePlay,
	isReload,
	options: PlayerTaskOptions,
) {
	if (!_PostAdRecoveryTransactionState.mediaKey) return false;
	_PostAdRecoveryTransactionState.pendingOperation = {
		isPausePlay: isPausePlay === true,
		isReload: isReload === true,
		options: { ...options },
	};
	_PostAdRecoveryTransactionState.pendingOperationReadyAt = Date.now() + 1500;
	if (isReload && options.newMediaPlayerInstance !== false) {
		_PostAdRecoveryTransactionState.requiresReplacement = true;
	}
	return true;
}

function _completePendingPostAdRecoveryOperation() {
	_PostAdRecoveryTransactionState.pendingOperation = null;
	_PostAdRecoveryTransactionState.pendingOperationReadyAt = 0;
	_PostAdRecoveryTransactionState.initialOperationCompleted = true;
}

function _requestPostAdRecoveryReload(
	channel,
	mediaKey,
	cycleStartedAt,
	message,
) {
	const now = Date.now();
	if (
		_PostAdRecoveryTransactionState.passive ||
		_PostAdRecoveryTransactionState.acceptedReloadCount >=
			_POST_AD_RECOVERY_MAX_ACCEPTED_RELOADS ||
		_PostAdRecoveryTransactionState.reloadRequestCount >=
			_POST_AD_RECOVERY_MAX_RELOAD_REQUESTS ||
		(_PostAdRecoveryTransactionState.lastReloadRequestAt > 0 &&
			now - _PostAdRecoveryTransactionState.lastReloadRequestAt <
				_POST_AD_RECOVERY_RELOAD_COOLDOWN_MS)
	) {
		return false;
	}

	_PostAdRecoveryTransactionState.reloadRequestCount++;
	_PostAdRecoveryTransactionState.lastReloadRequestAt = now;
	const reloadAtBefore = _getPlayerReloadAtForMediaKey(mediaKey);
	let taskAccepted = false;
	_log(message, "warning");
	try {
		taskAccepted =
			_doPlayerTask(false, true, {
				reason: "ad-recovery",
				refreshAccessToken: true,
				newMediaPlayerInstance: true,
				channel,
				mediaKey,
				cycleStartedAt,
			}) === true;
	} catch (error) {
		_log(
			`Post-ad recovery reload failed: ${error?.message ?? String(error)}`,
			"warning",
		);
	}
	const reloadAtAfter = _getPlayerReloadAtForMediaKey(mediaKey);
	const reloadAccepted = Boolean(
		taskAccepted && reloadAtAfter > reloadAtBefore,
	);
	_PlayerBufferState.lastFixTime = now;
	_PlayerBufferState.postAdSoftReloadAttempted = reloadAccepted;
	if (reloadAccepted) {
		_PostAdRecoveryTransactionState.acceptedReloadCount++;
		_PostAdRecoveryTransactionState.video = null;
		_PostAdRecoveryTransactionState.observedAt = 0;
		_PostAdRecoveryTransactionState.lastCurrentTime = 0;
		_PostAdRecoveryTransactionState.stallTicks = 0;
		if (
			_PostAdRecoveryTransactionState.acceptedReloadCount >=
			_POST_AD_RECOVERY_MAX_ACCEPTED_RELOADS
		) {
			_PostAdRecoveryTransactionState.expiresAt = Math.min(
				_PostAdRecoveryTransactionState.expiresAt || Number.POSITIVE_INFINITY,
				now + _POST_AD_RECOVERY_TERMINAL_SETTLE_MS,
			);
		}
	} else {
		_log(
			"Post-ad recovery reload was not accepted; keeping recovery active",
			"warning",
		);
		if (
			_PostAdRecoveryTransactionState.reloadRequestCount >=
			_POST_AD_RECOVERY_MAX_RELOAD_REQUESTS
		) {
			_PostAdRecoveryTransactionState.expiresAt = Math.min(
				_PostAdRecoveryTransactionState.expiresAt || Number.POSITIVE_INFINITY,
				now + _POST_AD_RECOVERY_TERMINAL_SETTLE_MS,
			);
		}
	}
	return true;
}

function _maintainPostAdRecoveryTransactionLifetime() {
	if (!_PostAdRecoveryTransactionState.mediaKey) return false;
	const now = Date.now();
	const isSuspended = Boolean(
		_isNativeDocumentHidden() || _getActivePictureInPicturePlaybackContext(),
	);
	if (isSuspended) {
		if (!_PostAdRecoveryTransactionState.suspendedAt) {
			_PostAdRecoveryTransactionState.suspendedAt =
				_PostAdRecoveryTransactionState.lastCheckedAt || now;
		}
		_PostAdRecoveryTransactionState.video = null;
		_PostAdRecoveryTransactionState.observedAt = 0;
		_PostAdRecoveryTransactionState.lastCurrentTime = 0;
		_PostAdRecoveryTransactionState.stallTicks = 0;
		_PostAdRecoveryTransactionState.lastCheckedAt = now;
		return true;
	}
	if (_PostAdRecoveryTransactionState.suspendedAt > 0) {
		_PostAdRecoveryTransactionState.expiresAt += Math.max(
			0,
			now - _PostAdRecoveryTransactionState.suspendedAt,
		);
		_PostAdRecoveryTransactionState.suspendedAt = 0;
	} else if (
		_PostAdRecoveryTransactionState.lastCheckedAt > 0 &&
		now - _PostAdRecoveryTransactionState.lastCheckedAt > 5000
	) {
		_PostAdRecoveryTransactionState.expiresAt +=
			now - _PostAdRecoveryTransactionState.lastCheckedAt;
	}
	_PostAdRecoveryTransactionState.lastCheckedAt = now;
	if (
		_PostAdRecoveryTransactionState.expiresAt <= 0 ||
		now < _PostAdRecoveryTransactionState.expiresAt
	) {
		return true;
	}
	_PostAdRecoveryTransactionState.passive = true;
	_PostAdRecoveryTransactionState.expiresAt = 0;
	_log(
		"Post-ad recovery reached its automation limit; keeping passive recovery ownership",
		"warning",
	);
	return true;
}

function _handlePendingPostAdRecovery(
	player,
	playerCore = null,
	video = null,
	channel = null,
	mediaKey = null,
	contentType = null,
) {
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	if (!_isPostAdRecoveryTransactionCurrent(safeChannel, safeMediaKey)) {
		_cancelPostAdRecoveryTransaction(true);
		return false;
	}
	if (
		_hasUserPauseIntent(safeChannel, safeMediaKey) ||
		_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey)
	) {
		_cancelPostAdRecoveryTransaction(true);
		return false;
	}
	if (!_maintainPostAdRecoveryTransactionLifetime()) return false;
	if (
		_isNativeDocumentHidden() ||
		_getActivePictureInPicturePlaybackContext()
	) {
		return false;
	}
	const now = Date.now();
	const liveVideo = video || player?.getHTMLVideoElement?.() || null;
	const { player: currentPlayer } = _getPlayerAndState();
	if (
		!(liveVideo instanceof HTMLVideoElement) ||
		!liveVideo.isConnected ||
		currentPlayer !== player ||
		currentPlayer?.getHTMLVideoElement?.() !== liveVideo
	) {
		return false;
	}
	const pendingOperation = _PostAdRecoveryTransactionState.pendingOperation;
	if (
		pendingOperation &&
		now >= _PostAdRecoveryTransactionState.pendingOperationReadyAt
	) {
		const didRun = _doPlayerTask(
			pendingOperation.isPausePlay,
			pendingOperation.isReload,
			pendingOperation.options,
		);
		if (didRun === true) {
			_completePendingPostAdRecoveryOperation();
			return true;
		}
		_PostAdRecoveryTransactionState.pendingOperationReadyAt = now + 1500;
	}

	const liveCurrentTime = Number(liveVideo.currentTime) || 0;
	const isNewObservation =
		_PostAdRecoveryTransactionState.video !== liveVideo ||
		!_PostAdRecoveryTransactionState.observedAt;
	if (isNewObservation) {
		_PostAdRecoveryTransactionState.video = liveVideo;
		_PostAdRecoveryTransactionState.observedAt = now;
		_PostAdRecoveryTransactionState.lastCurrentTime = liveCurrentTime;
		_PostAdRecoveryTransactionState.stallTicks = 0;
	}
	const recoveryAge = now - _PostAdRecoveryTransactionState.observedAt;
	const canSoftReload = recoveryAge >= _POST_AD_SOFT_RELOAD_DELAY_MS;
	const liveVideoWidth = Number(liveVideo.videoWidth) || 0;
	const isLivePaused = _isPlayerPaused(player, playerCore, liveVideo);
	const advanced =
		!isNewObservation &&
		liveCurrentTime > _PostAdRecoveryTransactionState.lastCurrentTime + 0.05;
	if (!isLivePaused && !isNewObservation && !advanced) {
		_PostAdRecoveryTransactionState.stallTicks++;
	} else if (advanced) {
		_PostAdRecoveryTransactionState.stallTicks = 0;
	}
	_PostAdRecoveryTransactionState.lastCurrentTime = liveCurrentTime;
	_PlayerBufferState.postAdRecoveryStartedAt =
		_PostAdRecoveryTransactionState.observedAt;
	_PlayerBufferState.postAdLastCurrentTime = liveCurrentTime;
	_PlayerBufferState.postAdStallTicks =
		_PostAdRecoveryTransactionState.stallTicks;
	const isDeadFrame =
		!isLivePaused &&
		!liveVideo.ended &&
		recoveryAge >= _POST_AD_RECOVERY_RELOAD_COOLDOWN_MS &&
		(liveVideoWidth <= 0 || _PostAdRecoveryTransactionState.stallTicks >= 2);

	const replacementIsReady = Boolean(
		!_PostAdRecoveryTransactionState.requiresReplacement ||
			(_PostAdRecoveryTransactionState.initialOperationCompleted &&
				_PostAdRecoveryTransactionState.requiredReplacementVideo?.deref() !==
					liveVideo),
	);
	if (
		advanced &&
		replacementIsReady &&
		_isPlaybackHealthyAfterAd(player, playerCore, liveVideo)
	) {
		_finishPostAdRecoveryTransaction(liveCurrentTime);
		return true;
	}

	if (
		isDeadFrame &&
		_requestPostAdRecoveryReload(
			safeChannel,
			safeMediaKey,
			_PostAdRecoveryTransactionState.cycleStartedAt,
			"Player frozen after ad (no advancing frames). Rebuilding native player...",
		)
	) {
		_PlayerBufferState.postAdUnhealthyCount = 0;
		return true;
	}
	const recoveryIsCapped = Boolean(
		_PostAdRecoveryTransactionState.passive ||
			_PostAdRecoveryTransactionState.acceptedReloadCount >=
				_POST_AD_RECOVERY_MAX_ACCEPTED_RELOADS ||
			_PostAdRecoveryTransactionState.reloadRequestCount >=
				_POST_AD_RECOVERY_MAX_RELOAD_REQUESTS,
	);
	if (recoveryIsCapped) {
		if (!_PostAdRecoveryTransactionState.passive) {
			return false;
		}
		if (
			!_PostAdRecoveryTransactionState.terminalNudgeAttempted &&
			_retryPostAdPauseResume(safeChannel, safeMediaKey)
		) {
			_PostAdRecoveryTransactionState.terminalNudgeAttempted = true;
			_log(
				"Post-ad rebuild limit reached; applying one final pause/play recovery",
				"warning",
			);
			return true;
		}
		return false;
	}
	if (
		_PostAdRecoveryTransactionState.lastReloadRequestAt > 0 &&
		now - _PostAdRecoveryTransactionState.lastReloadRequestAt <
			_POST_AD_RECOVERY_RELOAD_COOLDOWN_MS
	) {
		return false;
	}

	if (liveVideo.ended) {
		if (!canSoftReload) {
			_PlayerBufferState.postAdUnhealthyCount++;
			_retryPostAdPauseResume(safeChannel, safeMediaKey);
			return true;
		}

		if (
			_requestPostAdRecoveryReload(
				safeChannel,
				safeMediaKey,
				_PostAdRecoveryTransactionState.cycleStartedAt,
				contentType && contentType !== "live"
					? "Replay/VOD player ended after ad. Reloading native player..."
					: "Player hit end of stream after ad. Reloading native player...",
			)
		) {
			_PlayerBufferState.postAdUnhealthyCount = 0;
			return true;
		}
	}

	if (
		_isPlayerPaused(player, playerCore, liveVideo) &&
		(!__TTVAB_STATE__.LastAdRecoveryResumeAt ||
			Date.now() - __TTVAB_STATE__.LastAdRecoveryResumeAt >= 1500) &&
		_resumePlayerAfterAdIfNeeded(safeChannel, safeMediaKey)
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
			if (_retryPostAdPauseResume(safeChannel, safeMediaKey)) {
				_PlayerBufferState.lastFixTime = now;
			}
			return true;
		}

		if (
			_requestPostAdRecoveryReload(
				safeChannel,
				safeMediaKey,
				_PostAdRecoveryTransactionState.cycleStartedAt,
				contentType && contentType !== "live"
					? "Replay/VOD player still stalling after ad. Rebuilding native player..."
					: "Player still stalling after ad. Rebuilding native player...",
			)
		) {
			_PlayerBufferState.postAdUnhealthyCount = 0;
			return true;
		}
	}

	return false;
}

function _capturePlayerPreferenceSnapshot(
	playerCore = null,
	media = null,
	context: { channel?: string | null; mediaKey?: string | null } = {},
) {
	const snapshot = Object.create(null);

	try {
		_ensurePlayerPreferenceStorageMonitor();
		snapshot.__storageVersions = Object.create(null);
		for (const key of _PLAYER_PREFERENCE_KEYS) {
			snapshot[key] = localStorage.getItem(key);
			snapshot.__storageVersions[key] =
				_PlayerPreferenceStorageState.versions.get(key) || 0;
		}

		const configuredQualityGroup = _readConfiguredQualityGroup();
		if (
			playerCore?.state?.quality?.group &&
			configuredQualityGroup &&
			configuredQualityGroup.toLowerCase() !== "auto"
		) {
			snapshot["video-quality"] = JSON.stringify({
				default: playerCore.state.quality.group,
			});
		}

		const sourceMedia =
			media instanceof HTMLMediaElement ? media : _getPrimaryMediaElement();
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
	} catch (err) {
		_log(`Preference snapshot failed: ${err.message}`, "warning");
		return null;
	}

	return snapshot;
}

function _ensurePlayerPreferenceStorageMonitor() {
	if (_PlayerPreferenceStorageState.initialized) return true;
	if (typeof window === "undefined") return false;

	window.addEventListener("storage", (event) => {
		try {
			if (event.storageArea && event.storageArea !== localStorage) return;
		} catch {}
		const changedKeys = event.key
			? _PLAYER_PREFERENCE_KEYS.includes(event.key)
				? [event.key]
				: []
			: _PLAYER_PREFERENCE_KEYS;
		for (const key of changedKeys) {
			_PlayerPreferenceStorageState.versions.set(
				key,
				(_PlayerPreferenceStorageState.versions.get(key) || 0) + 1,
			);
		}
	});
	_PlayerPreferenceStorageState.initialized = true;
	return true;
}

function _restorePlayerMediaPreferenceSnapshot(
	mediaState,
	options: { channel?: string | null; mediaKey?: string | null } = {},
) {
	if (!mediaState || typeof mediaState !== "object") return false;

	const safeChannel = _normalizePlayerChannel(options.channel);
	const safeMediaKey = _normalizeMediaKey(options.mediaKey);
	if (
		(safeChannel || safeMediaKey) &&
		!_isPlaybackRecoveryContextCurrent(safeChannel, safeMediaKey)
	) {
		return false;
	}

	const { player } = _getPlayerAndState();
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
	} catch {
		return false;
	}
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
			if (
				snapshot.__storageVersions &&
				Object.hasOwn(snapshot.__storageVersions, key) &&
				Number(snapshot.__storageVersions[key]) !==
					(_PlayerPreferenceStorageState.versions.get(key) || 0)
			) {
				continue;
			}
			const value = snapshot[key];
			if (value === null || typeof value === "undefined") {
				localStorage.removeItem(key);
				continue;
			}
			localStorage.setItem(key, String(value));
		}
		_restorePlayerMediaPreferenceSnapshot(snapshot.__mediaState, options);
	} catch (err) {
		_log(`Preference restore failed: ${err.message}`, "warning");
		return false;
	}

	return true;
}

function _schedulePlayerMediaPreferenceRestores(
	snapshot,
	channel = null,
	mediaKey = null,
	delays = [120, 500, 1500, 3000],
	cycleStartedAt = 0,
) {
	if (!snapshot?.__mediaState) return false;

	for (const delay of delays) {
		_schedulePlaybackRecoveryTimeout(
			() => {
				_restorePlayerMediaPreferenceSnapshot(snapshot.__mediaState, {
					channel,
					mediaKey,
				});
			},
			delay,
			channel,
			mediaKey,
			cycleStartedAt,
		);
	}
	return true;
}

function _schedulePlayerPreferenceRestore(
	snapshot,
	channel = null,
	mediaKey = null,
	delay = 3000,
	cycleStartedAt = 0,
) {
	if (!snapshot || typeof snapshot !== "object") {
		return false;
	}

	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	_clearPendingPlayerPreferenceRestore();
	_PlayerPreferenceRestoreState.channel = safeChannel;
	_PlayerPreferenceRestoreState.mediaKey = safeMediaKey;
	_PlayerPreferenceRestoreState.cycleStartedAt = Math.max(
		0,
		Number(cycleStartedAt) || 0,
	);
	_PlayerPreferenceRestoreState.timeoutId = setTimeout(
		() => {
			const restoreChannel = _PlayerPreferenceRestoreState.channel;
			const restoreMediaKey = _PlayerPreferenceRestoreState.mediaKey;
			const restoreCycleStartedAt =
				_PlayerPreferenceRestoreState.cycleStartedAt;
			_clearPendingPlayerPreferenceRestore();
			if (
				restoreCycleStartedAt > 0 &&
				!_isPlayerLifecycleCycleCurrent(restoreMediaKey, restoreCycleStartedAt)
			) {
				return;
			}
			_restorePlayerPreferenceSnapshot(snapshot, {
				channel: restoreChannel,
				mediaKey: restoreMediaKey,
			});
		},
		Math.max(0, delay),
	);
	return true;
}

let _PipDeferredReloadEntry = null;

function _registerPipDeferredReload(
	options: {
		reason?: string;
		handoffId?: string | null;
		refreshAccessToken?: boolean;
		newMediaPlayerInstance?: boolean;
		replaceCodecHandoff?: boolean;
		channel?: string | null;
		mediaKey?: string | null;
		cycleStartedAt?: number | null;
	} = {},
) {
	const pipElement = document.pictureInPictureElement;
	if (!(pipElement instanceof HTMLMediaElement)) return false;
	const previousEntry = _PipDeferredReloadEntry;
	if (previousEntry?.element && previousEntry.listener) {
		try {
			previousEntry.element.removeEventListener(
				"leavepictureinpicture",
				previousEntry.listener,
			);
		} catch {}
	}
	const entry = {
		options: { ...options },
		channel:
			_normalizePlayerChannel(options.channel) ||
			_normalizePlayerChannel(__TTVAB_STATE__.PageChannel),
		mediaKey:
			_normalizeMediaKey(options.mediaKey) ||
			_normalizeMediaKey(__TTVAB_STATE__.PageMediaKey),
		deferredAt: Date.now(),
		element: pipElement,
		listener: null,
	};
	entry.listener = () => {
		if (_PipDeferredReloadEntry !== entry) return;
		_PipDeferredReloadEntry = null;
		_clearActivePictureInPicturePlaybackContext(entry.element);
		if (Date.now() - entry.deferredAt > 120000) return;
		if (!_isPlaybackRecoveryContextCurrent(entry.channel, entry.mediaKey)) {
			return;
		}
		if (__TTVAB_STATE__.CurrentAdMediaKey || __TTVAB_STATE__.CurrentAdChannel) {
			return;
		}
		const deferredCycleStartedAt = Math.max(
			0,
			Number(entry.options.cycleStartedAt) || 0,
		);
		if (
			deferredCycleStartedAt > 0 &&
			!_isPlayerLifecycleCycleCurrent(entry.mediaKey, deferredCycleStartedAt)
		) {
			return;
		}
		_log("Running player reload deferred during PiP", "info");
		_doPlayerTask(false, true, entry.options);
	};
	_PipDeferredReloadEntry = entry;
	pipElement.addEventListener("leavepictureinpicture", entry.listener, {
		once: true,
	});
	return true;
}

function _doPlayerTask(isPausePlay, isReload, options: PlayerTaskOptions = {}) {
	const requestedChannel = _normalizePlayerChannel(options.channel);
	const requestedMediaKey = _normalizeMediaKey(options.mediaKey);
	const taskChannel =
		requestedChannel || _normalizePlayerChannel(__TTVAB_STATE__.PageChannel);
	const taskMediaKey =
		requestedMediaKey || _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey);
	const pipContext = _getActivePictureInPicturePlaybackContext();
	const isPipTask =
		pipContext !== null &&
		_isActivePictureInPicturePlaybackContext({
			ChannelName: taskChannel,
			MediaKey: taskMediaKey,
		});
	const reason = options.reason || "manual";
	const requestedCycleStartedAt = Math.max(
		0,
		Number(options.cycleStartedAt) ||
			(reason === "ad-recovery" || reason === "post-ad-native-restore"
				? _getPlayerLifecycleCycleStartedAt(taskMediaKey)
				: 0),
	);
	const isTerminalPostAdTask = Boolean(
		reason === "post-ad-native-restore" ||
			(reason === "ad-recovery" &&
				!__TTVAB_STATE__?.CurrentAdMediaKey &&
				!__TTVAB_STATE__?.CurrentAdChannel),
	);
	if (
		isTerminalPostAdTask &&
		!_startPostAdRecoveryTransaction(
			taskChannel,
			taskMediaKey,
			requestedCycleStartedAt,
		)
	) {
		return false;
	}
	if (
		isTerminalPostAdTask &&
		isReload &&
		options.newMediaPlayerInstance !== false
	) {
		_PostAdRecoveryTransactionState.requiresReplacement = true;
	}
	const { player, state: playerState } = _getPlayerAndState();

	if (!player && !isPipTask) {
		if (isTerminalPostAdTask) {
			_rememberPendingPostAdRecoveryOperation(isPausePlay, isReload, options);
		}
		_log("Could not find player", "warning");
		return false;
	}

	if (!playerState && isReload && !isPipTask) {
		if (isTerminalPostAdTask) {
			_rememberPendingPostAdRecoveryOperation(isPausePlay, isReload, options);
		}
		_log("Could not find player state for reload", "warning");
		return false;
	}

	const playerCore = _getPlayerCore(player);
	const handoffId =
		reason === "codec-handoff" &&
		typeof options.handoffId === "string" &&
		options.handoffId
			? options.handoffId
			: null;
	if (reason === "codec-handoff" && !handoffId) return false;
	const handoffIdCycleStartedAt = handoffId
		? _getCodecHandoffCycleStartedAt(handoffId)
		: 0;
	if (reason === "codec-handoff") {
		const currentAdChannel = _normalizePlayerChannel(
			__TTVAB_STATE__?.CurrentAdChannel,
		);
		const currentAdMediaKey = _normalizeMediaKey(
			__TTVAB_STATE__?.CurrentAdMediaKey,
		);
		const hasExactAdContext = Boolean(
			requestedMediaKey &&
				currentAdMediaKey === requestedMediaKey &&
				requestedCycleStartedAt > 0 &&
				handoffIdCycleStartedAt === requestedCycleStartedAt &&
				_isCodecHandoffCycleCurrent(
					requestedMediaKey,
					requestedCycleStartedAt,
				) &&
				(!requestedChannel ||
					!currentAdChannel ||
					requestedChannel === currentAdChannel),
		);
		if (!hasExactAdContext) {
			_log("Suppressing codec handoff without an active ad context", "warning");
			return false;
		}
	}
	const activeCodecHandoffId =
		typeof __TTVAB_STATE__.ActiveCodecHandoffId === "string" &&
		__TTVAB_STATE__.ActiveCodecHandoffId
			? __TTVAB_STATE__.ActiveCodecHandoffId
			: null;
	const activeCodecHandoffMatches = Boolean(
		handoffId &&
			activeCodecHandoffId &&
			_getCodecHandoffCycleStartedAt(activeCodecHandoffId) ===
				requestedCycleStartedAt &&
			_matchesPlaybackTargetContext(
				__TTVAB_STATE__.ActiveCodecHandoffChannel,
				__TTVAB_STATE__.ActiveCodecHandoffMediaKey,
				taskChannel,
				taskMediaKey,
			),
	);
	if (activeCodecHandoffMatches && options.replaceCodecHandoff !== true) {
		const codecHandoffContext = {
			mediaType: __TTVAB_STATE__?.PageMediaType ?? null,
			channelName: taskChannel,
			vodID: __TTVAB_STATE__?.PageVodID ?? null,
			mediaKey: taskMediaKey,
			reason,
			handoffId: activeCodecHandoffId,
			cycleStartedAt: requestedCycleStartedAt,
		};
		_broadcastWorkers([
			{
				key: "UpdateCodecHandoffContext",
				targetMediaKey: taskMediaKey,
				value: codecHandoffContext,
			},
			{
				key: "TriggeredPlayerReload",
				targetMediaKey: taskMediaKey,
				value: codecHandoffContext,
			},
		]);
		return true;
	}

	if (isReload) {
		const needsRealReload =
			options.refreshAccessToken === true ||
			options.newMediaPlayerInstance === true;
		if (isPipTask && pipContext) {
			const currentContext = _getCurrentPlaybackRecoveryContext();
			const isTaskRouteCurrent = _matchesPlaybackTargetContext(
				currentContext.channel,
				currentContext.mediaKey,
				taskChannel,
				taskMediaKey,
			);
			const allowPipBreakingReload =
				reason === "manual" ||
				(reason === "codec-handoff" &&
					isTaskRouteCurrent &&
					Boolean(playerState)) ||
				(reason === "worker-recovery" && isTaskRouteCurrent);
			if (allowPipBreakingReload) {
				_log(`Forcing real reload despite PiP (${reason})`, "info");
			} else {
				if (needsRealReload && reason !== "codec-handoff") {
					_registerPipDeferredReload({
						...options,
						channel: taskChannel,
						mediaKey: taskMediaKey,
						cycleStartedAt: requestedCycleStartedAt,
					});
				}
				if (_hasUserPauseIntent(taskChannel, taskMediaKey)) return false;
				_pausePlaybackTarget(pipContext.element);
				_scheduleResumeRetries(
					taskChannel,
					taskMediaKey,
					[50, 180, 500, 1100],
					{ cycleStartedAt: requestedCycleStartedAt },
				);
				_log(
					needsRealReload
						? "Downgraded reload to pause/play to preserve PiP; real reload deferred to PiP exit"
						: "Downgraded reload to pause/play to preserve PiP",
					"info",
				);
				return reason !== "codec-handoff";
			}
		}
	}

	const shouldSuppressAutomaticTask =
		reason !== "manual" &&
		reason !== "codec-handoff" &&
		_shouldSuppressAutomaticPlaybackResume(taskChannel, taskMediaKey);
	if (shouldSuppressAutomaticTask) {
		if (reason === "ad-recovery" || reason === "buffer-recovery") {
			_clearAdResumeIntent();
		}
		return false;
	}

	if (isPausePlay) {
		if (isPipTask && pipContext) {
			if (pipContext.element.paused || pipContext.element.ended) return false;
			_pausePlaybackTarget(pipContext.element);
			_scheduleResumeRetries(taskChannel, taskMediaKey, [50, 180, 500], {
				cycleStartedAt: requestedCycleStartedAt,
			});
			if (isTerminalPostAdTask) {
				_completePendingPostAdRecoveryOperation();
			}
			return true;
		}
		if (_isPlayerPaused(player, playerCore)) {
			return false;
		}
		_pausePlaybackTarget(player);
		const resumePausedPlayer = () => {
			if (!_isPlaybackRecoveryContextCurrent(taskChannel, taskMediaKey)) {
				return;
			}
			if (
				requestedCycleStartedAt > 0 &&
				!_isPlayerLifecycleCycleCurrent(taskMediaKey, requestedCycleStartedAt)
			) {
				return;
			}
			const { player: freshPlayer } = _getPlayerAndState();
			const resumeTarget = freshPlayer || player;
			_playPlaybackTarget(resumeTarget, taskChannel, taskMediaKey);
		};
		if (_isNativeDocumentHidden()) {
			queueMicrotask(resumePausedPlayer);
		} else {
			_schedulePlaybackRecoveryTimeout(
				resumePausedPlayer,
				50,
				taskChannel,
				taskMediaKey,
				requestedCycleStartedAt,
			);
		}
		if (isTerminalPostAdTask) {
			_completePendingPostAdRecoveryOperation();
		}
		return true;
	}

	if (isReload) {
		const isAdRecoveryReload = reason === "ad-recovery";
		const isPlaybackRecoveryReload =
			isAdRecoveryReload || reason === "buffer-recovery";
		const now = Date.now();
		const lastPlayerReloadAt = __TTVAB_STATE__?.LastPlayerReloadAt || 0;
		if (
			reason !== "codec-handoff" &&
			lastPlayerReloadAt &&
			now - lastPlayerReloadAt < __TTVAB_STATE__.PlayerReloadDebounceMs
		) {
			_log(`Suppressing duplicate reload (${reason})`, "warning");
			return false;
		}

		if (isAdRecoveryReload && __TTVAB_STATE__.LastAdRecoveryReloadAt) {
			const consecutiveFailures = Math.max(
				0,
				Number(__TTVAB_STATE__._AdRecoveryConsecutiveFailures) || 0,
			);
			const baseCooldown = __TTVAB_STATE__.AdRecoveryReloadCooldownMs || 10000;
			const backoffCooldown = Math.min(
				60000,
				baseCooldown * 2 ** Math.min(consecutiveFailures, 3),
			);
			if (now - __TTVAB_STATE__.LastAdRecoveryReloadAt < backoffCooldown) {
				if (consecutiveFailures > 0) {
					_log(
						`Suppressing ad recovery reload — downgrading to pause/resume (backoff ${Math.round(backoffCooldown / 1000)}s, attempt #${consecutiveFailures + 1})`,
						"warning",
					);
				}
				return _doPlayerTask(true, false, options);
			}
		}

		__TTVAB_STATE__.LastPlayerReloadAt = now;
		_recordPlayerReloadAt(taskMediaKey, now);
		if (isAdRecoveryReload) {
			__TTVAB_STATE__.LastAdRecoveryReloadAt = now;
			__TTVAB_STATE__._AdRecoveryConsecutiveFailures =
				(Number(__TTVAB_STATE__._AdRecoveryConsecutiveFailures) || 0) + 1;
		}
		if (reason !== "manual") {
			_suppressPauseIntent(
				__TTVAB_STATE__.PageChannel,
				__TTVAB_STATE__.PageMediaKey,
				3000,
			);
		}
		_clearCachedPlayerRef(true, __TTVAB_STATE__.PlayerReloadDebounceMs || 0);
		const reloadContentType =
			typeof playerState?.props?.content?.type === "string"
				? playerState.props.content.type
				: null;
		const reloadVideo = player?.getHTMLVideoElement?.() || null;
		const replacementBaselineVideo =
			isTerminalPostAdTask && options.newMediaPlayerInstance !== false
				? reloadVideo
				: null;
		const vodResumePosition =
			reloadContentType === "vod" &&
			Number.isFinite(Number(reloadVideo?.currentTime)) &&
			Number(reloadVideo.currentTime) > 1
				? Number(reloadVideo.currentTime)
				: null;
		const preferenceSnapshot = _capturePlayerPreferenceSnapshot(
			playerCore,
			reloadVideo,
			{
				channel: __TTVAB_STATE__.PageChannel,
				mediaKey: __TTVAB_STATE__.PageMediaKey,
			},
		);

		if (reason === "manual") {
			_log("Reloading player", "info");
		}
		const previousCodecHandoff = {
			id: __TTVAB_STATE__.ActiveCodecHandoffId,
			channel: __TTVAB_STATE__.ActiveCodecHandoffChannel,
			mediaKey: __TTVAB_STATE__.ActiveCodecHandoffMediaKey,
		};
		if (handoffId) {
			__TTVAB_STATE__.ActiveCodecHandoffId = handoffId;
			__TTVAB_STATE__.ActiveCodecHandoffChannel = taskChannel;
			__TTVAB_STATE__.ActiveCodecHandoffMediaKey = taskMediaKey;
			_broadcastWorkers({
				key: "UpdateCodecHandoffContext",
				targetMediaKey: taskMediaKey,
				value: {
					handoffId,
					channelName: taskChannel,
					mediaKey: taskMediaKey,
					cycleStartedAt: requestedCycleStartedAt,
				},
			});
		}
		try {
			playerState.setSrc({
				isNewMediaPlayerInstance: options.newMediaPlayerInstance !== false,
				refreshAccessToken: options.refreshAccessToken !== false,
			});
		} catch (error) {
			if (handoffId) {
				if (
					__TTVAB_STATE__.ActiveCodecHandoffId === handoffId &&
					_matchesPlaybackTargetContext(
						__TTVAB_STATE__.ActiveCodecHandoffChannel,
						__TTVAB_STATE__.ActiveCodecHandoffMediaKey,
						taskChannel,
						taskMediaKey,
					)
				) {
					const previousCycleStartedAt = _getCodecHandoffCycleStartedAt(
						previousCodecHandoff.id,
					);
					const previousHandoffIsCurrent = Boolean(
						previousCodecHandoff.id &&
							previousCodecHandoff.mediaKey &&
							_isCodecHandoffCycleCurrent(
								previousCodecHandoff.mediaKey,
								previousCycleStartedAt,
							),
					);
					__TTVAB_STATE__.ActiveCodecHandoffId = previousHandoffIsCurrent
						? previousCodecHandoff.id
						: null;
					__TTVAB_STATE__.ActiveCodecHandoffChannel = previousHandoffIsCurrent
						? previousCodecHandoff.channel
						: null;
					__TTVAB_STATE__.ActiveCodecHandoffMediaKey = previousHandoffIsCurrent
						? previousCodecHandoff.mediaKey
						: null;
				}
				_broadcastWorkers({
					key: "UpdateCodecHandoffContext",
					targetMediaKey: taskMediaKey,
					value: {
						clearHandoffId: handoffId,
						channelName: taskChannel,
						mediaKey: taskMediaKey,
						cycleStartedAt: requestedCycleStartedAt,
					},
				});
				const previousCycleStartedAt = _getCodecHandoffCycleStartedAt(
					previousCodecHandoff.id,
				);
				if (
					options.replaceCodecHandoff === true &&
					previousCodecHandoff.id &&
					previousCodecHandoff.mediaKey &&
					_isCodecHandoffCycleCurrent(
						previousCodecHandoff.mediaKey,
						previousCycleStartedAt,
					) &&
					_matchesPlaybackTargetContext(
						previousCodecHandoff.channel,
						previousCodecHandoff.mediaKey,
						taskChannel,
						taskMediaKey,
					)
				) {
					_broadcastWorkers({
						key: "UpdateCodecHandoffContext",
						targetMediaKey: taskMediaKey,
						value: {
							handoffId: previousCodecHandoff.id,
							channelName: previousCodecHandoff.channel,
							mediaKey: previousCodecHandoff.mediaKey,
							cycleStartedAt: previousCycleStartedAt,
						},
					});
				}
			}
			throw error;
		}
		if (replacementBaselineVideo instanceof HTMLMediaElement) {
			_PostAdRecoveryTransactionState.requiresReplacement = true;
			_PostAdRecoveryTransactionState.requiredReplacementVideo = new WeakRef(
				replacementBaselineVideo,
			);
			_PostAdRecoveryTransactionState.video = null;
			_PostAdRecoveryTransactionState.observedAt = 0;
			_PostAdRecoveryTransactionState.lastCurrentTime = 0;
			_PostAdRecoveryTransactionState.stallTicks = 0;
		}
		if (
			isTerminalPostAdTask &&
			reason === "post-ad-native-restore" &&
			!_PostAdRecoveryTransactionState.initialOperationCompleted
		) {
			_PostAdRecoveryTransactionState.acceptedReloadCount++;
		}
		if (isTerminalPostAdTask) {
			_completePendingPostAdRecoveryOperation();
		}

		_broadcastWorkers({
			key: "TriggeredPlayerReload",
			value: {
				mediaType: __TTVAB_STATE__?.PageMediaType ?? null,
				channelName: taskChannel,
				vodID: __TTVAB_STATE__?.PageVodID ?? null,
				mediaKey: taskMediaKey,
				reason,
				handoffId,
				cycleStartedAt: requestedCycleStartedAt,
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
			{ cycleStartedAt: requestedCycleStartedAt },
		);

		if (vodResumePosition !== null) {
			for (const restoreDelay of [1200, 3000]) {
				_schedulePlaybackRecoveryTimeout(
					() => {
						try {
							const { player: vodPlayer } = _getPlayerAndState();
							const vodVideo = vodPlayer?.getHTMLVideoElement?.() || null;
							if (!vodVideo || vodVideo.ended) return;
							const currentPos = Number(vodVideo.currentTime) || 0;
							if (Math.abs(currentPos - vodResumePosition) <= 2) return;
							if (typeof vodPlayer?.seekTo === "function") {
								vodPlayer.seekTo(vodResumePosition);
							} else {
								vodVideo.currentTime = vodResumePosition;
							}
							_log(
								`Restored VOD position to ${Math.round(vodResumePosition)}s after reload`,
								"info",
							);
						} catch {}
					},
					restoreDelay,
					__TTVAB_STATE__.PageChannel,
					__TTVAB_STATE__.PageMediaKey,
					requestedCycleStartedAt,
				);
			}
		}

		if (isPlaybackRecoveryReload) {
			_schedulePlaybackRecoveryTimeout(
				() => {
					try {
						const { player: livePlayer, state: liveState } =
							_getPlayerAndState();
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
				},
				1500,
				__TTVAB_STATE__.PageChannel,
				__TTVAB_STATE__.PageMediaKey,
				requestedCycleStartedAt,
			);
		}

		if (preferenceSnapshot) {
			_schedulePlayerMediaPreferenceRestores(
				preferenceSnapshot,
				__TTVAB_STATE__.PageChannel,
				__TTVAB_STATE__.PageMediaKey,
				undefined,
				requestedCycleStartedAt,
			);
			_schedulePlayerPreferenceRestore(
				preferenceSnapshot,
				__TTVAB_STATE__.PageChannel,
				__TTVAB_STATE__.PageMediaKey,
				3000,
				requestedCycleStartedAt,
			);
		}

		return true;
	}

	return false;
}

function _checkPinnedBackupStall(player, channel = null, mediaKey = null) {
	if (!__TTVAB_STATE__?.IsBufferFixEnabled) {
		_resetPinnedBackupStallState();
		return;
	}
	const pinnedType = __TTVAB_STATE__.PinnedBackupPlayerType;
	if (!pinnedType) {
		_resetPinnedBackupStallState();
		return;
	}
	const safeMediaKey =
		_normalizeMediaKey(mediaKey) ||
		_normalizeMediaKey(__TTVAB_STATE__.PinnedBackupPlayerMediaKey) ||
		_resolvePlayerMediaKey(channel, mediaKey);
	const safeChannel =
		_normalizePlayerChannel(channel) ||
		_normalizePlayerChannel(__TTVAB_STATE__.PinnedBackupPlayerChannel);
	if (
		_PinnedBackupStallState.lastPinnedType !== pinnedType ||
		_PinnedBackupStallState.mediaKey !== safeMediaKey
	) {
		_resetPinnedBackupStallState();
		_PinnedBackupStallState.lastPinnedType = pinnedType;
		_PinnedBackupStallState.mediaKey = safeMediaKey;
	}
	const video = player?.getHTMLVideoElement?.() || null;
	if (
		!(video instanceof HTMLMediaElement) ||
		video.ended ||
		Number(video.readyState) < 1
	) {
		_PinnedBackupStallState.firstObservedAt = 0;
		_PinnedBackupStallState.lastCurrentTime = 0;
		_PinnedBackupStallState.lastBufferedEnd = 0;
		return;
	}
	const currentTime = Number(video.currentTime) || 0;
	const bufferedEnd =
		video.buffered && video.buffered.length > 0
			? video.buffered.end(video.buffered.length - 1)
			: 0;
	let bufferedStart = 0;
	try {
		bufferedStart =
			video.buffered && video.buffered.length > 0
				? Number(video.buffered.start(video.buffered.length - 1)) || 0
				: 0;
	} catch {}
	const now = Date.now();
	const stallThresholdMs = Math.max(
		500,
		Number(__TTVAB_STATE__.PinnedBackupStallDetectionMs) || 3000,
	);
	const rearmCooldownMs = Math.max(
		stallThresholdMs * 2,
		(Number(__TTVAB_STATE__.PinnedBackupStallDetectionMs) || 3000) * 2,
	);

	const bufferAdvanced =
		_PinnedBackupStallState.lastBufferedEnd > 0 &&
		bufferedEnd > _PinnedBackupStallState.lastBufferedEnd + 0.1;
	const currentTimeAdvanced =
		_PinnedBackupStallState.lastCurrentTime > 0 &&
		currentTime > _PinnedBackupStallState.lastCurrentTime + 0.25;
	const bufferHeadroom = bufferedEnd - currentTime;
	const bufferSafe = bufferHeadroom > _getLowLatencyDangerZone();
	const playbackHasStarted = currentTime > 0 || bufferedEnd > 0;
	const playheadOutsidePinnedTimeline = Boolean(
		currentTime > bufferedEnd + _getLowLatencyDangerZone() ||
			(bufferedStart > 0 &&
				currentTime < bufferedStart - _getLowLatencyDangerZone()),
	);
	const canRealignPinnedLiveBackup = Boolean(
		safeMediaKey?.startsWith("live:") &&
			_normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) === safeMediaKey &&
			_normalizeMediaKey(__TTVAB_STATE__.PinnedBackupPlayerMediaKey) ===
				safeMediaKey &&
			!currentTimeAdvanced &&
			playheadOutsidePinnedTimeline &&
			_getFatalAdMediaErrorCode(video) === 0 &&
			!_hasUserPauseIntent(safeChannel, safeMediaKey) &&
			!_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey) &&
			_getPlaybackMediaElementForContext(safeChannel, safeMediaKey) === video,
	);
	const firstOwnedBufferObservation = Boolean(
		canRealignPinnedLiveBackup &&
			_PinnedBackupStallState.firstObservedAt > 0 &&
			_PinnedBackupStallState.lastBufferedEnd <= 0 &&
			bufferedEnd > 0,
	);

	if (firstOwnedBufferObservation) {
		_PinnedBackupStallState.lastCurrentTime = currentTime;
		_PinnedBackupStallState.lastBufferedEnd = bufferedEnd;
		return;
	}

	const ownsAdvancingLiveBackup = Boolean(
		canRealignPinnedLiveBackup &&
			_PinnedBackupStallState.firstObservedAt > 0 &&
			now - _PinnedBackupStallState.firstObservedAt >= stallThresholdMs &&
			bufferAdvanced,
	);

	if (ownsAdvancingLiveBackup) {
		let timelineRealigned = false;
		try {
			if (Number.isFinite(bufferedStart) && bufferedStart <= bufferedEnd) {
				video.currentTime = Math.max(bufferedStart, bufferedEnd - 0.5);
				timelineRealigned = true;
			}
		} catch {}
		if (timelineRealigned) {
			const cycleStartedAt = _getPlayerLifecycleCycleStartedAt(safeMediaKey);
			_markPinnedBackupTimelineRestore(safeMediaKey, cycleStartedAt);
			_resetPinnedBackupStallState();
			_log(
				`Pinned backup timeline realigned (${pinnedType}): currentTime=${currentTime.toFixed(2)}s, liveEdge=${bufferedEnd.toFixed(2)}s`,
				"warning",
			);
			_resumeActivePlayerIfPaused(safeChannel, safeMediaKey);
			_scheduleResumeRetries(safeChannel, safeMediaKey, [180, 650], {
				cycleStartedAt,
			});
			return;
		}
	}

	if (
		currentTimeAdvanced ||
		(!canRealignPinnedLiveBackup && bufferSafe && bufferAdvanced)
	) {
		_PinnedBackupStallState.firstObservedAt = 0;
		_PinnedBackupStallState.forceRefreshCount = 0;
		_PinnedBackupStallState.lastForceRefreshAt = 0;
		_PinnedBackupStallState.exhaustedLogged = false;
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

	if (
		now - _PinnedBackupStallState.lastForceRefreshAt < rearmCooldownMs ||
		__TTVAB_STATE__.BackupSearchForceRefreshAt > now - rearmCooldownMs
	) {
		return;
	}

	if (now - _PinnedBackupStallState.firstObservedAt < stallThresholdMs) {
		return;
	}

	if (bufferSafe) {
		_PinnedBackupStallState.lastForceRefreshAt = now;
		_log(
			`Pinned backup playhead frozen with ${bufferHeadroom.toFixed(2)}s buffered (${pinnedType}); deferring to in-ad freeze recovery instead of re-search`,
			"warning",
		);
		return;
	}

	_PinnedBackupStallState.lastForceRefreshAt = now;
	_PinnedBackupStallState.forceRefreshCount =
		(_PinnedBackupStallState.forceRefreshCount || 0) + 1;
	if (_PinnedBackupStallState.forceRefreshCount >= 3) {
		if (!_PinnedBackupStallState.exhaustedLogged) {
			_PinnedBackupStallState.exhaustedLogged = true;
			_log(
				`Pinned backup stalled (${pinnedType}): currentTime=${currentTime.toFixed(2)}s, bufferEnd=${bufferedEnd.toFixed(2)}s, bufferHeadroom=${bufferHeadroom.toFixed(2)}s, unsafe buffer for ${Math.round((now - _PinnedBackupStallState.firstObservedAt) / 100) / 10}s — re-searches exhausted (3 attempts), leaving stream as-is`,
				"warning",
			);
		}
		return;
	}
	__TTVAB_STATE__.BackupSearchForceRefreshAt = now;
	__TTVAB_STATE__.LastPinnedBackupStallDetectedAt = now;
	_broadcastWorkers({
		key: "UpdateBackupSearchForceRefresh",
		...(safeMediaKey ? { targetMediaKey: safeMediaKey } : {}),
		value: now,
	});
	_log(
		`Pinned backup stalled (${pinnedType}): currentTime=${currentTime.toFixed(2)}s, bufferEnd=${bufferedEnd.toFixed(2)}s, bufferHeadroom=${bufferHeadroom.toFixed(2)}s, unsafe buffer for ${Math.round((now - _PinnedBackupStallState.firstObservedAt) / 100) / 10}s — forcing backup re-search`,
		"warning",
	);
}

function _checkInAdPlayheadFreeze(player, channel = null, mediaKey = null) {
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	if (_InAdFreezeState.mediaKey !== safeMediaKey) {
		_resetInAdFreezeState(safeMediaKey);
	}
	const video = player?.getHTMLVideoElement?.() || null;
	if (
		!(video instanceof HTMLMediaElement) ||
		video.ended ||
		Number(video.readyState) < 1
	) {
		_resetInAdFreezeState(safeMediaKey);
		return;
	}
	const currentTime = Number(video.currentTime) || 0;
	const bufferedEnd =
		video.buffered && video.buffered.length > 0
			? video.buffered.end(video.buffered.length - 1)
			: 0;
	const playbackHasStarted = currentTime > 0 || bufferedEnd > 0;
	const advanced =
		_InAdFreezeState.lastCurrentTime >= 0 &&
		currentTime > _InAdFreezeState.lastCurrentTime + 0.25;
	if (!playbackHasStarted || video.paused || advanced) {
		_resetInAdFreezeState(safeMediaKey);
		_InAdFreezeState.lastCurrentTime = currentTime;
		return;
	}
	const now = Date.now();
	if (_InAdFreezeState.firstFrozenAt === 0) {
		_InAdFreezeState.firstFrozenAt = now;
		_InAdFreezeState.lastCurrentTime = currentTime;
		return;
	}
	if (
		now - _InAdFreezeState.firstFrozenAt < _IN_AD_FREEZE_DETECT_MS ||
		now - _InAdFreezeState.lastActionAt < _IN_AD_FREEZE_ACTION_REPEAT_MS
	) {
		return;
	}
	_InAdFreezeState.lastActionAt = now;
	_InAdFreezeState.actionCount++;
	const frozenSeconds =
		Math.round((now - _InAdFreezeState.firstFrozenAt) / 100) / 10;
	const contiguousEnd = _getContiguousBufferedEnd(video, currentTime);
	const bufferDrained =
		contiguousEnd - currentTime < _getLowLatencyDangerZone();
	const gapJumped = bufferDrained
		? _seekPastBufferedGap(video, currentTime)
		: 0;
	if (gapJumped > 0) {
		_log(
			`In-ad playhead frozen ${frozenSeconds}s at ${currentTime.toFixed(2)}s; seeking ${gapJumped.toFixed(2)}s past buffered gap`,
			"warning",
		);
		_resetInAdFreezeState(safeMediaKey);
		return;
	}
	const shouldReload =
		_InAdFreezeState.actionCount > _IN_AD_FREEZE_RELOAD_AFTER_ATTEMPTS &&
		!_isNativeDocumentHidden();
	if (shouldReload) {
		_log(
			`In-ad playhead frozen ${frozenSeconds}s at ${currentTime.toFixed(2)}s (bufferEnd=${bufferedEnd.toFixed(2)}s); reloading player`,
			"warning",
		);
		_doPlayerTask(false, true, {
			reason: "buffer-recovery",
			...(safeChannel ? { channel: safeChannel } : {}),
			...(safeMediaKey ? { mediaKey: safeMediaKey } : {}),
		});
		_InAdFreezeState.actionCount = 0;
		return;
	}
	if (_InAdFreezeState.actionCount > _IN_AD_FREEZE_RELOAD_AFTER_ATTEMPTS) {
		_InAdFreezeState.actionCount = 0;
	}
	_log(
		`In-ad playhead frozen ${frozenSeconds}s at ${currentTime.toFixed(2)}s (bufferEnd=${bufferedEnd.toFixed(2)}s); pause/play nudge`,
		"warning",
	);
	_doPlayerTask(true, false, {
		reason: "buffer-recovery",
		...(safeChannel ? { channel: safeChannel } : {}),
		...(safeMediaKey ? { mediaKey: safeMediaKey } : {}),
	});
}

function _checkHiddenCleanLiveStall(player, channel = null, mediaKey = null) {
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	if (
		!safeMediaKey ||
		!_isNativeDocumentHidden() ||
		__TTVAB_STATE__?.PageMediaType !== "live" ||
		__TTVAB_STATE__?.CurrentAdMediaKey ||
		__TTVAB_STATE__?.CurrentAdChannel ||
		_hasUserPauseIntent(safeChannel, safeMediaKey) ||
		_shouldSuppressAutomaticPlaybackResume(safeChannel, safeMediaKey)
	) {
		_resetHiddenCleanLiveStallState();
		return false;
	}
	if (_HiddenCleanLiveStallState.mediaKey !== safeMediaKey) {
		_resetHiddenCleanLiveStallState(safeMediaKey);
	}

	const playerCore = _getPlayerCore(player);
	const video = player?.getHTMLVideoElement?.() || null;
	if (
		!(video instanceof HTMLMediaElement) ||
		video.ended ||
		Number(video.readyState) < 1
	) {
		_resetHiddenCleanLiveStallState(safeMediaKey);
		return false;
	}

	const currentTime = Number(video.currentTime) || 0;
	const now = Date.now();
	const videoChanged = _HiddenCleanLiveStallState.video !== video;
	if (videoChanged) {
		_HiddenCleanLiveStallState.video = video;
		_HiddenCleanLiveStallState.lastCurrentTime = currentTime;
		if (_HiddenCleanLiveStallState.firstFrozenAt === 0) {
			_HiddenCleanLiveStallState.firstFrozenAt = now;
		}
	}
	if (_isPlayerPaused(player, playerCore, video)) {
		return false;
	}
	let bufferedEnd = 0;
	try {
		if (video.buffered?.length > 0) {
			bufferedEnd = video.buffered.end(video.buffered.length - 1);
		}
	} catch {}
	const playbackHasStarted = currentTime > 0 || bufferedEnd > 0;
	const advanced =
		!videoChanged &&
		_HiddenCleanLiveStallState.lastCurrentTime >= 0 &&
		currentTime > _HiddenCleanLiveStallState.lastCurrentTime + 0.25;
	if (!playbackHasStarted || advanced) {
		_HiddenCleanLiveStallState.firstFrozenAt = 0;
		_HiddenCleanLiveStallState.lastCurrentTime = currentTime;
		return false;
	}

	if (_HiddenCleanLiveStallState.firstFrozenAt === 0) {
		_HiddenCleanLiveStallState.firstFrozenAt = now;
		_HiddenCleanLiveStallState.lastCurrentTime = currentTime;
		return false;
	}
	if (
		now - _HiddenCleanLiveStallState.firstFrozenAt <
			_HIDDEN_CLEAN_LIVE_STALL_DETECT_MS ||
		now - _HiddenCleanLiveStallState.lastActionAt <
			_HIDDEN_CLEAN_LIVE_STALL_REPEAT_MS
	) {
		return false;
	}

	_HiddenCleanLiveStallState.firstFrozenAt = now;
	_HiddenCleanLiveStallState.lastCurrentTime = currentTime;
	_HiddenCleanLiveStallState.lastActionAt = now;
	_log(
		`Hidden clean-live playhead frozen at ${currentTime.toFixed(2)}s; pause/play nudge`,
		"warning",
	);
	return (
		_doPlayerTask(true, false, {
			reason: "buffer-recovery",
			channel: safeChannel,
			mediaKey: safeMediaKey,
		}) === true
	);
}

function _checkPostBreakWedge(
	video,
	currentTime,
	channel = null,
	mediaKey = null,
) {
	if (_PostBreakWedgeState.remainingEvals <= 0) return false;
	const safeChannel = _normalizePlayerChannel(channel);
	const safeMediaKey = _normalizeMediaKey(mediaKey);
	if (
		_PostBreakWedgeState.mediaKey &&
		_PostBreakWedgeState.mediaKey !== safeMediaKey
	) {
		_disarmPostBreakWedgeWatch();
		return false;
	}
	if (
		!(video instanceof HTMLVideoElement) ||
		video.ended ||
		video.paused ||
		!(Number(video.videoWidth) > 0) ||
		Number(video.readyState) < 2
	) {
		return false;
	}
	if (typeof video.getVideoPlaybackQuality !== "function") {
		_disarmPostBreakWedgeWatch();
		return false;
	}
	let totalFrames = -1;
	try {
		totalFrames = Number(video.getVideoPlaybackQuality()?.totalVideoFrames);
	} catch {
		_disarmPostBreakWedgeWatch();
		return false;
	}
	if (!Number.isFinite(totalFrames) || totalFrames < 0) {
		_disarmPostBreakWedgeWatch();
		return false;
	}
	const time = Number(currentTime) || 0;
	const prevTime = _PostBreakWedgeState.lastCurrentTime;
	const prevFrames = _PostBreakWedgeState.lastTotalFrames;
	_PostBreakWedgeState.lastCurrentTime = time;
	_PostBreakWedgeState.lastTotalFrames = totalFrames;
	if (prevTime < 0 || prevFrames < 0) return false;
	if (time <= prevTime + _POST_BREAK_WEDGE_MIN_TICK_ADVANCE_S) return false;
	_PostBreakWedgeState.remainingEvals--;
	const framesDelta = totalFrames - prevFrames;
	if (framesDelta >= _POST_BREAK_WEDGE_HEALTHY_FRAMES) {
		_PostBreakWedgeState.evidenceCount = 0;
		_PostBreakWedgeState.healthyCount++;
		if (
			_PostBreakWedgeState.healthyCount >= _POST_BREAK_WEDGE_HEALTHY_TO_DISARM
		) {
			_disarmPostBreakWedgeWatch();
		}
		return false;
	}
	_PostBreakWedgeState.healthyCount = 0;
	if (framesDelta > _POST_BREAK_WEDGE_FRAME_EPS) return false;
	_PostBreakWedgeState.evidenceCount++;
	if (_PostBreakWedgeState.evidenceCount < _POST_BREAK_WEDGE_EVIDENCE_TO_ACT) {
		return false;
	}
	_PostBreakWedgeState.evidenceCount = 0;
	_PostBreakWedgeState.actionCount++;
	const useReload =
		_PostBreakWedgeState.actionCount >= _POST_BREAK_WEDGE_MAX_ACTIONS;
	_log(
		`Post-break video wedge detected (playhead advancing with ${Math.max(0, framesDelta)} decoded frames); ${useReload ? "reloading player" : "pause/play nudge"}`,
		"warning",
	);
	if (useReload) {
		_disarmPostBreakWedgeWatch();
		_doPlayerTask(false, true, {
			reason: "buffer-recovery",
			...(safeChannel ? { channel: safeChannel } : {}),
			...(safeMediaKey ? { mediaKey: safeMediaKey } : {}),
		});
	} else {
		_doPlayerTask(true, false, {
			reason: "buffer-recovery",
			...(safeChannel ? { channel: safeChannel } : {}),
			...(safeMediaKey ? { mediaKey: safeMediaKey } : {}),
		});
	}
	_PlayerBufferState.lastFixTime = Date.now();
	return true;
}

const _WatchTimeState = {
	channel: null as string | null,
	pendingMs: 0,
	lastTickAt: 0,
};
const _WATCH_TICK_MAX_GAP_MS = 5000;
const _WATCH_FLUSH_THRESHOLD_MS = 15000;
const _WATCH_COUNTER_FLUSH_STORAGE_KEY_PREFIX = "ttvab_pending_counter_flush:";

function _flushWatchTime(force = false) {
	if (!force && _WatchTimeState.pendingMs < _WATCH_FLUSH_THRESHOLD_MS) {
		return;
	}
	const seconds = Math.floor(_WatchTimeState.pendingMs / 1000);
	if (seconds <= 0 || !_WatchTimeState.channel) {
		if (force) _WatchTimeState.pendingMs = 0;
		return;
	}
	_WatchTimeState.pendingMs -= seconds * 1000;
	if (typeof _sendBridgeMessage === "function") {
		_sendBridgeMessage("ttvab-watch-time", {
			channel: _WatchTimeState.channel,
			seconds,
		});
	}
}

function _createWatchTimeCounterFlushId() {
	const values = new Uint8Array(12);
	if (globalThis.crypto?.getRandomValues) {
		globalThis.crypto.getRandomValues(values);
		const randomHex = Array.from(values, (value) =>
			value.toString(16).padStart(2, "0"),
		).join("");
		return `flush:${Date.now().toString(16)}:${randomHex}`;
	}
	return `flush:${Date.now().toString(16)}:${Math.random().toString(16).slice(2)}`;
}

function _getWatchTimePlaybackElement(channel = null) {
	const safeChannel = _normalizePlayerChannel(channel);
	if (!safeChannel) return null;
	const pipContext = _getActivePictureInPicturePlaybackContext();
	if (
		_normalizePlayerChannel(pipContext?.ChannelName) === safeChannel &&
		pipContext?.element instanceof HTMLMediaElement
	) {
		return pipContext.element;
	}
	if (_normalizePlayerChannel(__TTVAB_STATE__?.PageChannel) !== safeChannel) {
		return null;
	}
	try {
		const primaryMedia = _getPrimaryMediaElement();
		return primaryMedia instanceof HTMLMediaElement ? primaryMedia : null;
	} catch {
		return null;
	}
}

function _flushWatchTimeOnPageExit() {
	const channel = _WatchTimeState.channel;
	if (_WatchTimeState.lastTickAt > 0 && channel) {
		const media = _getWatchTimePlaybackElement(channel);
		if (
			media &&
			!media.paused &&
			!media.ended &&
			Number(media.readyState) >= 2
		) {
			_WatchTimeState.pendingMs += Math.min(
				Math.max(0, Date.now() - _WatchTimeState.lastTickAt),
				_WATCH_TICK_MAX_GAP_MS,
			);
		}
	}
	const seconds = Math.floor(_WatchTimeState.pendingMs / 1000);
	_WatchTimeState.pendingMs = 0;
	_WatchTimeState.lastTickAt = 0;

	if (seconds > 0 && channel) {
		const flushId = _createWatchTimeCounterFlushId();
		const detail = {
			flushId,
			createdAt: Date.now(),
			adsDelta: 0,
			channelDeltas: {},
			watchDeltas: { [channel]: seconds },
		};
		let journaled = false;
		try {
			localStorage.setItem(
				`${_WATCH_COUNTER_FLUSH_STORAGE_KEY_PREFIX}${flushId}`,
				JSON.stringify(detail),
			);
			journaled = true;
		} catch {}

		if (typeof _sendBridgeMessage === "function") {
			if (journaled) {
				_sendBridgeMessage("ttvab-persist-counter-flush", detail);
			} else {
				_sendBridgeMessage("ttvab-watch-time", { channel, seconds });
			}
		}
	}

	if (typeof _sendBridgeMessage === "function") {
		_sendBridgeMessage("ttvab-flush-counters");
	}
}

function _getPictureInPictureVideo(): HTMLVideoElement | null {
	try {
		const pipElement = document.pictureInPictureElement;
		if (pipElement instanceof HTMLVideoElement && pipElement.isConnected) {
			return pipElement;
		}
	} catch {}
	return null;
}

function _trackChannelWatchTime(isHidden) {
	const now = Date.now();
	const pipContext = _getActivePictureInPicturePlaybackContext();
	const mediaType = pipContext?.MediaType || __TTVAB_STATE__?.PageMediaType;
	const channel =
		typeof (pipContext?.ChannelName || __TTVAB_STATE__?.PageChannel) ===
			"string" &&
		(pipContext?.ChannelName || __TTVAB_STATE__.PageChannel) &&
		(mediaType === "live" || mediaType === "vod")
			? pipContext?.ChannelName || __TTVAB_STATE__.PageChannel
			: null;

	if (channel !== _WatchTimeState.channel) {
		_flushWatchTime(true);
		_WatchTimeState.channel = channel;
		_WatchTimeState.pendingMs = 0;
		_WatchTimeState.lastTickAt = 0;
	}
	if (!channel) return;

	const pipVideo = pipContext?.element || _getPictureInPictureVideo();
	let video: HTMLVideoElement | null = pipVideo;
	if (!video) {
		try {
			const primaryMedia = _getPrimaryMediaElement();
			if (primaryMedia instanceof HTMLVideoElement) {
				video = primaryMedia;
			}
		} catch {}
	}

	const isWatchable =
		video !== null &&
		!video.paused &&
		!video.ended &&
		video.readyState >= 2 &&
		(!isHidden || video === pipVideo);

	if (!isWatchable) {
		_WatchTimeState.lastTickAt = 0;
		_flushWatchTime();
		return;
	}

	if (_WatchTimeState.lastTickAt > 0) {
		_WatchTimeState.pendingMs += Math.min(
			Math.max(0, now - _WatchTimeState.lastTickAt),
			_WATCH_TICK_MAX_GAP_MS,
		);
	}
	_WatchTimeState.lastTickAt = now;
	_flushWatchTime();
}

function _monitorPlayerBuffering() {
	function check() {
		_playerBufferMonitorTimer = null;
		let scheduledDelay = Number(__TTVAB_STATE__?.PlayerBufferingDelay) || 600;
		try {
			scheduledDelay = runCheck();
		} catch (err) {
			_log(`Buffer monitor tick failed: ${err.message}`, "error");
			_clearCachedPlayerRef();
			scheduledDelay = Math.max(scheduledDelay * 5, 3000);
		}
		_playerBufferMonitorTimer = setTimeout(check, scheduledDelay);
	}

	function runCheck() {
		const currentMediaKey = _normalizeMediaKey(__TTVAB_STATE__.PageMediaKey);
		const hasActiveAdContext = Boolean(
			__TTVAB_STATE__.CurrentAdMediaKey || __TTVAB_STATE__.CurrentAdChannel,
		);
		const activeAdChannel = hasActiveAdContext
			? _normalizePlayerChannel(__TTVAB_STATE__.CurrentAdChannel) ||
				_normalizePlayerChannel(__TTVAB_STATE__.PinnedBackupPlayerChannel) ||
				_normalizePlayerChannel(__TTVAB_STATE__.PageChannel)
			: null;
		const activeAdMediaKey = hasActiveAdContext
			? _normalizeMediaKey(__TTVAB_STATE__.CurrentAdMediaKey) ||
				_normalizeMediaKey(__TTVAB_STATE__.PinnedBackupPlayerMediaKey) ||
				_buildMediaKey("live", __TTVAB_STATE__.CurrentAdChannel, null) ||
				currentMediaKey
			: null;
		if (_PostBreakWedgeState.prevAdContext && !hasActiveAdContext) {
			if (
				_PostBreakWedgeState.prevAdMediaKey &&
				_PostBreakWedgeState.prevAdMediaKey === currentMediaKey
			) {
				_armPostBreakWedgeWatch(_PostBreakWedgeState.prevAdMediaKey);
			} else {
				_disarmPostBreakWedgeWatch();
			}
		}
		_PostBreakWedgeState.prevAdContext = hasActiveAdContext;
		_PostBreakWedgeState.prevAdMediaKey = hasActiveAdContext
			? activeAdMediaKey
			: null;
		let hasPendingPostAdRecovery =
			_isPostAdRecoveryTransactionCurrent(
				__TTVAB_STATE__.PageChannel,
				currentMediaKey,
			) ||
			_hasPendingAdResumeIntent(__TTVAB_STATE__.PageChannel, currentMediaKey);
		if (_PostAdRecoveryTransactionState.mediaKey) {
			if (_hasUserPauseIntent(__TTVAB_STATE__.PageChannel, currentMediaKey)) {
				_cancelPostAdRecoveryTransaction(true);
				hasPendingPostAdRecovery = false;
			}
		}
		if (!hasPendingPostAdRecovery) {
			_resetPostAdRecoveryMonitorSamples();
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
		try {
			_trackChannelWatchTime(isHidden);
		} catch {}
		if (!hasActiveAdContext && currentMediaKey) {
			_restoreReattachedSuppressedPrimaryMedia();
		}
		if (!_hasPlayerBufferMonitorRelevantContext()) {
			_resetPlayerBufferMonitorState();
			return idleDelay;
		}
		if (
			_shouldSuppressAutomaticPlaybackResume(
				activeAdChannel || __TTVAB_STATE__.PageChannel,
				activeAdMediaKey || currentMediaKey,
			)
		) {
			_cancelPostAdRecoveryTransaction(true);
			_PlayerBufferState.numSame = 0;
			_PlayerBufferState.fixAttempts = 0;
			_PlayerBufferState.liveEdgeStarveCount = 0;
			_PlayerBufferState.postAdUnhealthyCount = 0;
			_PlayerBufferState.postAdRecoveryStartedAt = 0;
			_resetPostAdGrace();
			return idleDelay;
		}
		if (!__TTVAB_STATE__.IsBufferFixEnabled) {
			_cancelPostAdRecoveryTransaction(true);
			_resetPlayerBufferMonitorState();
			return idleDelay;
		}
		const hasLivePlaybackContext =
			__TTVAB_STATE__.PageMediaType === "live" && Boolean(currentMediaKey);
		const hasAdCapablePlaybackContext =
			(Boolean(currentMediaKey) &&
				(__TTVAB_STATE__.PageMediaType === "live" ||
					__TTVAB_STATE__.PageMediaType === "vod")) ||
			Boolean(activeAdMediaKey);
		if (!hasAdCapablePlaybackContext) {
			_cancelPostAdRecoveryTransaction(true);
			_resetPlayerBufferMonitorState();
			return idleDelay;
		}

		if (hasActiveAdContext) {
			_resetPostAdRecoveryTransaction();
			_resetHiddenCleanLiveStallState();
			const pipContext = _getActivePictureInPicturePlaybackContext();
			const targetsPictureInPicture = Boolean(
				activeAdMediaKey &&
					_normalizeMediaKey(pipContext?.MediaKey) === activeAdMediaKey,
			);
			const targetsPage = Boolean(
				activeAdMediaKey && activeAdMediaKey === currentMediaKey,
			);
			let pinPlayer = null;
			let fatalRecoveryTargetsPage = false;
			if (targetsPage) {
				if (_cachedPlayerRef && _cachedPlayerRefMediaKey !== currentMediaKey) {
					_clearCachedPlayerRef();
				}
				pinPlayer = _cachedPlayerRef?.player || null;
				if (!pinPlayer) {
					const fresh = _getPlayerAndState();
					if (fresh.player && fresh.state) {
						pinPlayer = fresh.player;
						_cachedPlayerRef = fresh;
						_cachedPlayerRefMediaKey = currentMediaKey;
					}
				}
				fatalRecoveryTargetsPage = Boolean(pinPlayer);
			} else if (
				targetsPictureInPicture &&
				pipContext?.element instanceof HTMLMediaElement
			) {
				pinPlayer = {
					getHTMLVideoElement: () => pipContext.element,
				};
			}
			_suppressCompetingMediaDuringAd(activeAdChannel, activeAdMediaKey);
			if (fatalRecoveryTargetsPage) {
				_checkFatalAdMediaRecovery(pinPlayer);
			} else {
				_resetFatalAdMediaRecoveryState();
			}
			if (
				pinPlayer &&
				__TTVAB_STATE__.PinnedBackupPlayerType &&
				Number(__TTVAB_STATE__.PinnedBackupStallPollMs) > 0
			) {
				_checkPinnedBackupStall(pinPlayer, activeAdChannel, activeAdMediaKey);
			} else {
				_resetPinnedBackupStallState();
			}
			if (pinPlayer) {
				_checkInAdPlayheadFreeze(pinPlayer, activeAdChannel, activeAdMediaKey);
			} else {
				_resetInAdFreezeState();
			}
			_resetPlayerBufferMonitorState();
			return nextDelay;
		}

		_resetPinnedBackupStallState();
		_resetFatalAdMediaRecoveryState();
		_resetInAdFreezeState();

		if (!hasLivePlaybackContext) {
			_resetPlayerBufferMonitorState();
			return idleDelay;
		}

		if (isHidden) {
			if (_cachedPlayerRefMediaKey !== currentMediaKey) {
				_clearCachedPlayerRef(false);
			}
			let hiddenPlayer = _cachedPlayerRef?.player || null;
			if (!hiddenPlayer) {
				const fresh = _getPlayerAndState();
				if (fresh.player && fresh.state) {
					hiddenPlayer = fresh.player;
				}
			}
			if (hiddenPlayer) {
				_checkHiddenCleanLiveStall(
					hiddenPlayer,
					__TTVAB_STATE__.PageChannel,
					currentMediaKey,
				);
			} else {
				_resetHiddenCleanLiveStallState(currentMediaKey);
			}
			_clearCachedPlayerRef(false);
			return nextDelay;
		}
		_resetHiddenCleanLiveStallState();

		if (_cachedPlayerRefMediaKey !== currentMediaKey) {
			_clearCachedPlayerRef();
		}

		if (_cachedPlayerRef) {
			try {
				const player = _cachedPlayerRef.player;
				const state = _cachedPlayerRef.state;
				const playerCore = _getPlayerCore(player);
				_syncPreferredQualityGroupThrottled();
				const playerContentType =
					typeof state?.props?.content?.type === "string"
						? state.props.content.type
						: null;

				if (!playerCore) {
					_clearCachedPlayerRef();
				} else if (
					playerContentType &&
					playerContentType !== "live" &&
					playerContentType !== "rerun"
				) {
					_clearCachedPlayerRef();
				} else if (hasPendingPostAdRecovery) {
					_handlePendingPostAdRecovery(
						player,
						playerCore,
						player.getHTMLVideoElement?.() || null,
						__TTVAB_STATE__.PageChannel,
						currentMediaKey,
						playerContentType,
					);
				} else if (
					playerContentType === "live" &&
					player.getHTMLVideoElement()?.ended &&
					__TTVAB_STATE__.IsBufferFixEnabled
				) {
					_log(
						"Player hit end of stream during live playback. Recovering...",
						"warning",
					);
					_doPlayerTask(false, true, { reason: "buffer-recovery" });
					_PlayerBufferState.lastFixTime = Date.now();
				} else if (
					_PlayerBufferState.postAdGraceUntil > 0 &&
					(playerContentType === "live" || playerContentType === "rerun") &&
					_handlePostAdGraceWatch(
						player,
						playerCore,
						player.getHTMLVideoElement?.() || null,
						__TTVAB_STATE__.PageChannel,
						currentMediaKey,
						playerContentType,
					)
				) {
					_PlayerBufferState.numSame = 0;
					_PlayerBufferState.liveEdgeStarveCount = 0;
					_PlayerBufferState.fixAttempts = 0;
				} else if (
					__TTVAB_STATE__.IsBufferFixEnabled &&
					(playerContentType === "live" || playerContentType === "rerun") &&
					!_isPlayerPaused(player, playerCore) &&
					!player.getHTMLVideoElement()?.ended &&
					_PlayerBufferState.lastFixTime <=
						Date.now() - _getLowLatencyMinRepeatDelay()
				) {
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
					if (
						_checkPostBreakWedge(
							video,
							currentTime,
							__TTVAB_STATE__.PageChannel,
							currentMediaKey,
						)
					) {
						_PlayerBufferState.position = position;
						_PlayerBufferState.bufferedPosition = bufferedPosition;
						_PlayerBufferState.bufferDuration = bufferDuration;
						return nextDelay;
					}
					if (_trySeekPastFrozenBufferGap(video, currentTime, readyState)) {
						_PlayerBufferState.position = position;
						_PlayerBufferState.bufferedPosition = bufferedPosition;
						_PlayerBufferState.bufferDuration = bufferDuration;
						return nextDelay;
					}
					const isStablePosition = _PlayerBufferState.position === position;
					const isStableBufferedPosition =
						_PlayerBufferState.bufferedPosition === bufferedPosition;
					const isBufferRegressing =
						_PlayerBufferState.bufferDuration >= bufferDuration;
					const hasPlaybackState =
						position !== 0 || bufferedPosition !== 0 || bufferDuration !== 0;
					const isLikelyLiveEdgeStarvation =
						hasPlaybackState &&
						bufferDuration < _getLowLatencyDangerZone() &&
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
								reason: "buffer-recovery",
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
							if (video && video.buffered.length > 1) {
								for (let bi = 0; bi < video.buffered.length; bi++) {
									if (video.buffered.start(bi) > video.currentTime + 0.5) {
										_log(
											`Seeking past ${(video.buffered.start(bi) - video.currentTime).toFixed(1)}s buffer gap`,
											"warning",
										);
										video.currentTime = video.buffered.start(bi);
										_PlayerBufferState.lastFixTime = Date.now();
										_PlayerBufferState.numSame = 0;
										break;
									}
								}
							}
							if (_PlayerBufferState.numSame !== 0) {
								if (
									__TTVAB_STATE__.PlayerBufferingDoPlayerReload ||
									_PlayerBufferState.fixAttempts >= 3
								) {
									_doPlayerTask(false, true, {
										reason: "buffer-recovery",
									});
								} else {
									_doPlayerTask(true, false);
								}
								_PlayerBufferState.lastFixTime = Date.now();
								_PlayerBufferState.numSame = 0;
							}
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
				_syncPreferredQualityGroupThrottled();
				_cachedPlayerRef = playerAndState;
				_cachedPlayerRefMediaKey = currentMediaKey;
			} else if (_PostAdRecoveryTransactionState.mediaKey) {
				_PostAdRecoveryTransactionState.video = null;
				_PostAdRecoveryTransactionState.observedAt = 0;
				_PostAdRecoveryTransactionState.lastCurrentTime = 0;
				_PostAdRecoveryTransactionState.stallTicks = 0;
			}
		}

		const inSteadyState =
			!hasPendingPostAdRecovery &&
			_PlayerBufferState.numSame === 0 &&
			_PlayerBufferState.liveEdgeStarveCount === 0 &&
			_PlayerBufferState.fixAttempts === 0 &&
			_PlayerBufferState.postAdGraceUntil === 0 &&
			_cachedPlayerRef !== null;
		return inSteadyState && nextDelay < _PLAYER_BUFFER_STEADY_DELAY_MS
			? _PLAYER_BUFFER_STEADY_DELAY_MS
			: nextDelay;
	}

	window.addEventListener("pagehide", _flushWatchTimeOnPageExit);

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

	if (!window.__TTVAB_VISIBILITY_HARDENED__) {
		const queueVisibilityPlaybackGuard = () => {
			_guardPlaybackAcrossVisibilityTransition(
				__TTVAB_STATE__.PageChannel,
				__TTVAB_STATE__.PageMediaKey,
			);
		};
		let isInstalled = false;
		const install = () => {
			if (isInstalled) return;
			for (const eventName of [
				"visibilitychange",
				"webkitvisibilitychange",
				"mozvisibilitychange",
			]) {
				document.addEventListener(eventName, queueVisibilityPlaybackGuard);
			}
			window.addEventListener("blur", queueVisibilityPlaybackGuard);
			window.addEventListener("focus", queueVisibilityPlaybackGuard);
			isInstalled = true;
		};
		const uninstall = () => {
			if (!isInstalled) return;
			for (const eventName of [
				"visibilitychange",
				"webkitvisibilitychange",
				"mozvisibilitychange",
			]) {
				document.removeEventListener(eventName, queueVisibilityPlaybackGuard);
			}
			window.removeEventListener("blur", queueVisibilityPlaybackGuard);
			window.removeEventListener("focus", queueVisibilityPlaybackGuard);
			isInstalled = false;
		};

		install();
		window.addEventListener("pagehide", uninstall);
		window.addEventListener("pageshow", () => {
			install();
			queueVisibilityPlaybackGuard();
		});

		window.__TTVAB_VISIBILITY_HARDENED__ = true;
	}

	_log("Visibility tracking active", "info");
}
