// TTV AB - Init

function _isClipEditorContext() {
	const host = String(window.location?.hostname || "").toLowerCase();
	if (host === "clips.twitch.tv") return true;
	const path = String(window.location?.pathname || "").toLowerCase();
	return /^\/[^/]+\/clip\/[^/]+/.test(path);
}

function _deferInitUntilClipContextLeft() {
	const host = String(window.location?.hostname || "").toLowerCase();
	if (host === "clips.twitch.tv") return;
	const intervalId = setInterval(() => {
		if (_isClipEditorContext()) return;
		clearInterval(intervalId);
		_log("Left clip context; initializing", "info");
		_init();
		setTimeout(() => {
			try {
				if (
					typeof _getPlayerAndState !== "function" ||
					typeof _doPlayerTask !== "function"
				) {
					return;
				}
				const { player } = _getPlayerAndState();
				if (!player) return;
				_log(
					"Reloading player to attach worker hooks after deferred init",
					"info",
				);
				_doPlayerTask(false, true, {
					reason: "worker-recovery",
					refreshAccessToken: true,
					newMediaPlayerInstance: true,
				});
			} catch {}
		}, 500);
	}, 250);
}

function _bootstrap() {
	if (_isClipEditorContext()) {
		_log("Skipping - clip editor page", "warning");
		_deferInitUntilClipContextLeft();
		return false;
	}

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
			__TTVAB_STATE__.LastAdEndedAt = 0;
			__TTVAB_STATE__.LastAdEndedChannel = null;
			__TTVAB_STATE__.LastAdEndedMediaKey = null;
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

	_onInternalMessage("ttvab-toggle-ad-spoofing", (detail) => {
		const safeDetail = _getTrustedBridgeMessageDetail(detail);
		if (typeof safeDetail?.enabled !== "boolean") return;
		const enabled = safeDetail.enabled;
		const shouldDisable = !enabled;
		if (__TTVAB_STATE__.DisableAdSpoofing === shouldDisable) return;
		__TTVAB_STATE__.DisableAdSpoofing = shouldDisable;
		_broadcastWorkers({ key: "UpdateAdSpoofingState", value: shouldDisable });
		_log(
			`Ad spoofing ${enabled ? "enabled" : "disabled"}`,
			enabled ? "success" : "warning",
		);
	});

	_onInternalMessage("ttvab-toggle-autoplay-backup", (detail) => {
		const safeDetail = _getTrustedBridgeMessageDetail(detail);
		if (typeof safeDetail?.enabled !== "boolean") return;
		const enabled = safeDetail.enabled;
		const shouldDisable = !enabled;
		if (__TTVAB_STATE__.DisableAutoplayBackup === shouldDisable) return;
		__TTVAB_STATE__.DisableAutoplayBackup = shouldDisable;
		_broadcastWorkers({
			key: "UpdateAutoplayBackupState",
			value: shouldDisable,
		});
		_log(
			`Low quality fallback ${enabled ? "enabled" : "disabled"}`,
			enabled ? "success" : "warning",
		);

		if (
			shouldDisable &&
			__TTVAB_STATE__.PlayerHasPlayedOnce &&
			typeof _doPlayerTask === "function"
		) {
			_log(
				"Disabling low quality fallback; reloading player to restore native high quality stream.",
				"info",
			);
			_doPlayerTask(false, true, { reason: "manual" });
		}
	});

	_onInternalMessage("ttvab-toggle-debug", (detail) => {
		const safeDetail = _getTrustedBridgeMessageDetail(detail);
		if (typeof safeDetail?.enabled !== "boolean") return;
		if (safeDetail.enabled && typeof _enableDebugLogging === "function") {
			_enableDebugLogging();
		}
	});

	_onInternalMessage("ttvab-collect-logs", (detail) => {
		const safeDetail = _getTrustedBridgeMessageDetail(detail);
		const requestId =
			typeof safeDetail?.requestId === "string" ? safeDetail.requestId : null;
		if (!requestId) return;
		const buffer = Array.isArray(globalThis.__TTVAB_LOGS__)
			? (globalThis.__TTVAB_LOGS__ as PlainObject[])
			: [];
		_sendBridgeMessage("ttvab-logs", {
			requestId,
			entries: buffer.slice(-1000),
		});
	});
}

function _hookSpaNavigation() {
	const sync = () => _syncPagePlaybackContext({ broadcast: true });
	const originalPushState = history.pushState;
	const hookedPushState = function (...args) {
		const result = originalPushState.apply(this, args);
		sync();
		return result;
	};
	const originalReplaceState = history.replaceState;
	const hookedReplaceState = function (...args) {
		const result = originalReplaceState.apply(this, args);
		sync();
		return result;
	};
	let isHooked = false;
	const install = () => {
		if (isHooked) return;
		history.pushState = hookedPushState;
		history.replaceState = hookedReplaceState;
		window.addEventListener("popstate", sync);
		isHooked = true;
	};
	const uninstall = () => {
		if (!isHooked) return;
		window.removeEventListener("popstate", sync);
		history.pushState = originalPushState;
		history.replaceState = originalReplaceState;
		isHooked = false;
	};
	install();
	window.addEventListener("pagehide", uninstall);
	window.addEventListener("pageshow", () => {
		install();
		sync();
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
				: _normalizeCount(__TTVAB_STATE__.PendingInitialAdsBlockedDelta);
		__TTVAB_STATE__.HasResolvedAdsCountState = true;
		__TTVAB_STATE__.PendingInitialAdsBlockedDelta = 0;
		const restoredCount =
			_normalizeCount(safeDetail.count) + pendingInitialAdsBlockedDelta;
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
	_hookSpaNavigation();

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
