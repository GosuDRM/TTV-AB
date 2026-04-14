// TTV AB - Init

function _bootstrap() {
	if (
		typeof window.ttvabVersion !== "undefined" &&
		window.ttvabVersion >= _C.INTERNAL_VERSION
	) {
		_log("Skipping - another script is active", "warning");
		return false;
	}

	window.ttvabVersion = _C.INTERNAL_VERSION;
	_log(`v${_C.VERSION} loaded`, "info");
	return true;
}

function _normalizeCounterValue(value) {
	const numericValue =
		typeof value === "string" && value.trim() !== "" ? Number(value) : value;
	return Number.isFinite(numericValue)
		? Math.max(0, Math.trunc(numericValue))
		: 0;
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

function _initToggleListener() {
	_onInternalMessage("ttvab-toggle", (detail) => {
		const safeDetail = _getTrustedBridgeMessageDetail(detail);
		if (typeof safeDetail?.enabled !== "boolean") return;
		const enabled = safeDetail.enabled;
		__TTVAB_STATE__.HasResolvedToggleState = true;
		if (__TTVAB_STATE__.IsAdStrippingEnabled === enabled) return;
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
			__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
			__TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
			__TTVAB_STATE__._AdRecoveryConsecutiveFailures = 0;
			if (typeof _clearAdResumeIntent === "function") {
				_clearAdResumeIntent();
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
			_broadcastWorkers({
				key: "ResetPlaybackRecoveryState",
				value: { clearAdContext: true },
			});
			_broadcastWorkers({
				key: "UpdateCurrentAdContext",
				value: null,
			});
			_broadcastWorkers({
				key: "UpdatePinnedBackupPlayerContext",
				value: null,
			});
		}
		_broadcastWorkers({ key: "UpdateToggleState", value: enabled });
		_log(
			`Ad blocking ${enabled ? "enabled" : "disabled"}`,
			enabled ? "success" : "warning",
		);
	});

	_onInternalMessage("ttvab-toggle-buffer-fix", (detail) => {
		const safeDetail = _getTrustedBridgeMessageDetail(detail);
		if (typeof safeDetail?.enabled !== "boolean") return;
		const enabled = safeDetail.enabled;
		if (__TTVAB_STATE__.IsBufferFixEnabled === enabled) return;
		__TTVAB_STATE__.IsBufferFixEnabled = enabled;
		if (!enabled && typeof _resetPlayerBufferMonitorState === "function") {
			_resetPlayerBufferMonitorState();
		}
		if (enabled && typeof _ensurePlaybackMonitorsRunning === "function") {
			_ensurePlaybackMonitorsRunning(true);
		}
		_log(
			`Buffer fix ${enabled ? "enabled" : "disabled"}`,
			enabled ? "success" : "warning",
		);
	});
}

function _init() {
	if (!_bootstrap()) return;

	_bindBridgePort();
	_declareState(window);
	_syncPagePlaybackContext({ broadcast: false });

	_onInternalMessage("ttvab-init-count", (detail) => {
		const safeDetail = _getTrustedBridgeMessageDetail(detail);
		if (!Number.isFinite(safeDetail?.count)) return;
		const pendingInitialAdsBlockedDelta =
			__TTVAB_STATE__.HasResolvedAdsCountState === true
				? 0
				: _normalizeCounterValue(__TTVAB_STATE__.PendingInitialAdsBlockedDelta);
		__TTVAB_STATE__.HasResolvedAdsCountState = true;
		__TTVAB_STATE__.PendingInitialAdsBlockedDelta = 0;
		const restoredCount =
			_normalizeCounterValue(safeDetail.count) + pendingInitialAdsBlockedDelta;
		if (_S.adsBlocked === restoredCount) return;
		_S.adsBlocked = restoredCount;
		_broadcastWorkers({ key: "UpdateAdsBlocked", value: _S.adsBlocked });
		_log(`Restored ads count: ${_S.adsBlocked}`, "info");
	});

	_syncStoredDeviceId();
	if (typeof _hookRevokeObjectURL === "function") {
		_hookRevokeObjectURL();
	}
	_hookWorker();
	_hookMainFetch();
	_initToggleListener();
	_sendBridgeMessage("ttvab-request-state");
	_initAchievementListener();

	_hookVisibilityState();
	if (typeof _hookSecondaryPlayerHandoffDetection === "function") {
		_hookSecondaryPlayerHandoffDetection();
	}
	if (typeof _ensurePlaybackMonitorsRunning === "function") {
		_ensurePlaybackMonitorsRunning(true);
	}

	_showWelcome();
	_showDonation();

	_log("Initialized successfully", "success");
}
