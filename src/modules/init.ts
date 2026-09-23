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
		_log(
			"Skipping duplicate TTV AB initialization in this document",
			"warning",
		);
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

const _PAGE_LOG_EXPORT_MAX_ENTRIES = 1000;
const _PAGE_LOG_EXPORT_MAX_BYTES = 2 * 1024 * 1024;
const _PREVIEW_FAILURE_LOG_MAX_ENTRIES = 64;
const _PAGE_LOG_TEXT_ENCODER =
	typeof TextEncoder === "function" ? new TextEncoder() : null;
const _workerFailureDiagnostics: PlainObject[] = [];
let _lastDiagnosticCheckpointAt = 0;

function _recordWorkerFailureDiagnostic(
	worker,
	context,
	message,
	error = null,
) {
	try {
		const generation = _getSafePageLogNumber(worker?.__TTVABGeneration);
		const pageGeneration = _getSafePageLogNumber(
			__TTVAB_STATE__?.PagePlaybackContextGeneration,
		);
		const now = Date.now();
		const previous = _workerFailureDiagnostics.find(
			(entry) =>
				entry.generation === generation &&
				entry.pageGeneration === pageGeneration &&
				now - Number(entry.failedAt) < 2000,
		);
		const rawStack = error?.error?.stack || error?.stack;
		const stack = typeof rawStack === "string" ? rawStack.slice(0, 4000) : "";
		let isCurrentPlayerWorker = null;
		try {
			if (
				typeof _getPlayerAndState === "function" &&
				typeof _getPlayerCore === "function"
			) {
				const currentWorker = _getPlayerCore(
					_getPlayerAndState().player,
				)?.worker;
				if (currentWorker) isCurrentPlayerWorker = currentWorker === worker;
			}
		} catch {}
		const detail = {
			generation,
			mediaKey: _getSafePageLogString(context?.MediaKey, 160),
			observedMediaKey: _getSafePageLogString(
				worker?.__TTVABPlaybackPageContext?.mediaKey,
				160,
			),
			pageMediaKey: _getSafePageLogString(__TTVAB_STATE__?.PageMediaKey, 160),
			pageGeneration,
			observedPageMediaKey: _getSafePageLogString(
				worker?.__TTVABPlaybackPageContext?.pageMediaKey,
				160,
			),
			observedPageGeneration: _getSafePageLogNumber(
				worker?.__TTVABPlaybackPageContext?.pageContextGeneration,
			),
			cycleStartedAt: _getSafePageLogNumber(
				__TTVAB_STATE__?.AdPodProgressByMediaKey?.[context?.MediaKey]
					?.cycleStartedAt,
			),
			isCurrentPlayerWorker,
			failedAt: previous?.failedAt || now,
			lastPongAt: _getSafePageLogNumber(worker?.__TTVABLastPongAt),
			message: _getSafePageLogString(message, 1000),
			source:
				_getSafePageLogString(error?.filename, 512) || previous?.source || "",
			line: _getSafePageLogNumber(error?.lineno) || previous?.line || 0,
			column: _getSafePageLogNumber(error?.colno) || previous?.column || 0,
			stack: _getSafePageLogString(stack, 2000) || previous?.stack || "",
			wasmFrames:
				stack.match(/wasm-function\[\d+\](?::0x[0-9a-f]+)?/gi)?.slice(0, 16) ||
				previous?.wasmFrames ||
				[],
		};
		if (previous) Object.assign(previous, detail);
		else _workerFailureDiagnostics.push(detail);
		if (_workerFailureDiagnostics.length > 8) _workerFailureDiagnostics.shift();
		_checkpointPageDiagnostics(true);
	} catch {}
}

function _checkpointPageDiagnostics(force = false) {
	try {
		if (
			window.top !== window ||
			typeof _bridgePort === "undefined" ||
			!_bridgePort
		) {
			return false;
		}
		const now = Date.now();
		if (!force && now - _lastDiagnosticCheckpointAt < 15000) return false;
		_lastDiagnosticCheckpointAt = now;
		const collected = _collectPageLogEntries(64, 24 * 1024, false, true);
		return _sendBridgeMessage("ttvab-diagnostic-checkpoint", {
			capturedAt: now,
			entries: collected.entries,
			context: _collectPageLogContext(),
			truncatedEntries: collected.truncatedEntries,
		});
	} catch {
		return false;
	}
}

function _getSafePageLogString(value, maxLength) {
	if (typeof value !== "string") return "";
	try {
		const limit = Math.max(0, Number(maxLength) || 0);
		let bounded = value.slice(0, limit * 2);
		try {
			bounded = _formatLogText(bounded);
		} catch {}
		let sanitized = "";
		for (const character of bounded.replace(/\r\n?/g, "\n")) {
			const code = character.charCodeAt(0);
			if (code === 10 || (code >= 32 && code !== 127)) {
				sanitized += character;
			}
			if (sanitized.length >= limit) break;
		}
		return sanitized;
	} catch {
		return "";
	}
}

function _getSafePageLogNumber(value, fallback = 0) {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function _getPageLogEntryByteLength(entry) {
	try {
		if (!_PAGE_LOG_TEXT_ENCODER) throw new Error("TextEncoder unavailable");
		return _PAGE_LOG_TEXT_ENCODER.encode(JSON.stringify(entry)).byteLength + 1;
	} catch {
		try {
			return JSON.stringify(entry).length * 4 + 1;
		} catch {
			return _PAGE_LOG_EXPORT_MAX_BYTES + 1;
		}
	}
}

function _collectPageLogEntries(
	maxEntries = _PAGE_LOG_EXPORT_MAX_ENTRIES,
	maxBytes = _PAGE_LOG_EXPORT_MAX_BYTES,
	captureMediaDiagnostics = true,
	retainRecoveryMilestones = false,
) {
	try {
		if (
			captureMediaDiagnostics &&
			typeof _captureIndependentVideoAdDiagnostics === "function"
		) {
			_captureIndependentVideoAdDiagnostics();
		}
	} catch {
		_log("Independent video diagnostic snapshot failed", "warning");
	}

	let buffer: PlainObject[] = [];
	try {
		if (Array.isArray(globalThis.__TTVAB_LOGS__)) {
			buffer = globalThis.__TTVAB_LOGS__ as PlainObject[];
		}
	} catch {}

	let length = 0;
	try {
		const observedLength = buffer.length;
		if (
			typeof observedLength === "number" &&
			Number.isSafeInteger(observedLength) &&
			observedLength >= 0
		) {
			length = observedLength;
		}
	} catch {}
	const entries: PlainObject[] = [];
	const milestones = new Set<PlainObject>();
	let usedBytes = 2;
	const oldestIndex = Math.max(0, length - 1200);
	for (let index = length - 1; index >= oldestIndex; index -= 1) {
		if (entries.length >= maxEntries && !retainRecoveryMilestones) break;
		try {
			const source = buffer[index];
			if (!source || typeof source !== "object" || Array.isArray(source)) {
				continue;
			}
			const isMilestone = Boolean(
				retainRecoveryMilestones &&
					milestones.size < 12 &&
					typeof source.m === "string" &&
					/Ad blocked!|Ad detected, blocking|Using backup:|Native playlist (?:verified clean|ready)|Native playback restored|Post-ad recovery reached|Player still stalling after ad|Player source reload failed/.test(
						source.m.slice(0, 4000),
					),
			);
			if (entries.length >= maxEntries && !isMilestone) continue;
			const rawTimestamp = _getSafePageLogNumber(source.t, 0);
			const timestamp =
				rawTimestamp >= 0 && rawTimestamp <= 8640000000000000
					? Math.trunc(rawTimestamp)
					: 0;
			const rawLevel =
				typeof source.l === "string"
					? _getSafePageLogString(source.l, 16).toLowerCase()
					: "info";
			const level = ["debug", "info", "success", "warning", "error"].includes(
				rawLevel,
			)
				? rawLevel
				: "info";
			const message =
				typeof source.m === "string"
					? _getSafePageLogString(source.m, 4000)
					: "[Invalid log message]";
			const entry: PlainObject = { t: timestamp, l: level, m: message };
			if (source.w === true) {
				entry.w = true;
				const generation = Math.max(
					0,
					Math.min(1000000, Math.trunc(_getSafePageLogNumber(source.g, 0))),
				);
				if (generation > 0) entry.g = generation;
				const mediaKey =
					typeof source.k === "string"
						? _getSafePageLogString(source.k, 160).replace(/\n/g, "")
						: "";
				if (mediaKey) entry.k = mediaKey;
			}
			const entryBytes = _getPageLogEntryByteLength(entry);
			if (retainRecoveryMilestones && entryBytes + 2 > maxBytes) continue;
			if (retainRecoveryMilestones && isMilestone) {
				while (
					entries.length >= maxEntries ||
					usedBytes + entryBytes > maxBytes
				) {
					let removableIndex = entries.length - 1;
					while (removableIndex > 0 && milestones.has(entries[removableIndex]))
						removableIndex--;
					if (removableIndex <= 0) break;
					const [removed] = entries.splice(removableIndex, 1);
					usedBytes -= _getPageLogEntryByteLength(removed);
				}
			}
			if (entries.length > 0 && usedBytes + entryBytes > maxBytes) {
				if (retainRecoveryMilestones) continue;
				break;
			}
			if (
				retainRecoveryMilestones &&
				(entries.length >= maxEntries || usedBytes + entryBytes > maxBytes)
			)
				continue;
			entries.push(entry);
			if (isMilestone) milestones.add(entry);
			usedBytes += entryBytes;
		} catch {}
	}
	entries.reverse();

	return {
		entries,
		truncatedEntries: Math.max(0, length - entries.length),
	};
}

function _getSafePageLogUrl() {
	try {
		const url = new URL(String(window.location?.href || ""));
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
		return `${url.origin}${url.pathname || "/"}`.slice(0, 2048);
	} catch {
		return null;
	}
}

function _collectPageLogMediaState(state) {
	let media = null;
	let activeMediaKey = null;
	let pageMediaKey = null;
	try {
		pageMediaKey = state?.PageMediaKey || null;
		activeMediaKey = state?.CurrentAdMediaKey || pageMediaKey;
		const activeChannel = state?.CurrentAdChannel || state?.PageChannel || null;
		if (
			activeMediaKey &&
			typeof _getPlaybackMediaElementForContext === "function"
		) {
			media = _getPlaybackMediaElementForContext(activeChannel, activeMediaKey);
		}
	} catch {}
	const canUsePageFallback = !activeMediaKey || activeMediaKey === pageMediaKey;
	if (!media && canUsePageFallback) {
		try {
			if (typeof _getPrimaryMediaElement === "function") {
				media = _getPrimaryMediaElement();
			}
		} catch {}
	}
	if (!media && canUsePageFallback) {
		try {
			if (typeof _getFallbackPrimaryVideoElement === "function") {
				media = _getFallbackPrimaryVideoElement();
			}
		} catch {}
	}
	if (!media || typeof media !== "object") return null;

	try {
		const buffered = [];
		const rangeCount = Math.min(
			4,
			Math.max(0, Math.trunc(_getSafePageLogNumber(media.buffered?.length, 0))),
		);
		for (let index = 0; index < rangeCount; index += 1) {
			try {
				const start = _getSafePageLogNumber(media.buffered.start(index), -1);
				const end = _getSafePageLogNumber(media.buffered.end(index), -1);
				if (start >= 0 && end >= start) buffered.push({ start, end });
			} catch {}
		}
		const duration = _getSafePageLogNumber(media.duration, -1);
		let totalVideoFrames = -1;
		try {
			totalVideoFrames = _getSafePageLogNumber(
				media.getVideoPlaybackQuality?.()?.totalVideoFrames,
				-1,
			);
		} catch {}
		return {
			tag: _getSafePageLogString(media.localName || "media", 16).replace(
				/\n/g,
				"",
			),
			currentTime: Math.max(0, _getSafePageLogNumber(media.currentTime, 0)),
			duration: duration >= 0 ? duration : null,
			paused: media.paused === true,
			ended: media.ended === true,
			errorCode: Math.min(
				4,
				Math.max(0, Math.trunc(_getSafePageLogNumber(media.error?.code, 0))),
			),
			readyState: Math.max(
				0,
				Math.trunc(_getSafePageLogNumber(media.readyState, 0)),
			),
			networkState: Math.max(
				0,
				Math.trunc(_getSafePageLogNumber(media.networkState, 0)),
			),
			playbackRate: _getSafePageLogNumber(media.playbackRate, 1),
			muted: media.muted === true,
			volume: Math.min(1, Math.max(0, _getSafePageLogNumber(media.volume, 0))),
			width: Math.max(
				0,
				Math.trunc(
					_getSafePageLogNumber(media.videoWidth || media.clientWidth, 0),
				),
			),
			height: Math.max(
				0,
				Math.trunc(
					_getSafePageLogNumber(media.videoHeight || media.clientHeight, 0),
				),
			),
			buffered,
			totalVideoFrames,
		};
	} catch {
		return null;
	}
}

function _collectPageLogContext() {
	try {
		const state =
			typeof __TTVAB_STATE__ !== "undefined" && __TTVAB_STATE__
				? __TTVAB_STATE__
				: null;
		const currentAdMediaKey = _getSafePageLogString(
			state?.CurrentAdMediaKey,
			160,
		).replace(/\n/g, "");
		const progress = currentAdMediaKey
			? state?.AdPodProgressByMediaKey?.[currentAdMediaKey]
			: null;
		const workers = [];
		let currentWorker = null;
		try {
			currentWorker =
				_getPlayerCore(_getPlayerAndState().player)?.worker || null;
		} catch {}
		const workerList = Array.isArray(_S?.workers) ? _S.workers : [];
		for (
			let index = Math.max(0, workerList.length - 12);
			index < workerList.length;
			index += 1
		) {
			try {
				const worker = workerList[index];
				workers.push({
					generation: Math.max(
						0,
						Math.min(
							1000000,
							Math.trunc(_getSafePageLogNumber(worker?.__TTVABGeneration, 0)),
						),
					),
					mediaKey:
						_getSafePageLogString(worker?.__TTVABPageMediaKey, 160).replace(
							/\n/g,
							"",
						) || null,
					crashed: worker?.__TTVABCrashed === true,
					terminated: worker?.__TTVABIntentionallyTerminated === true,
					lastPongAt: Math.max(
						0,
						Math.trunc(_getSafePageLogNumber(worker?.__TTVABLastPongAt, 0)),
					),
					isCurrentPlayerWorker: currentWorker
						? worker === currentWorker
						: null,
				});
			} catch {}
		}
		return {
			pageUrl: _getSafePageLogUrl(),
			pageVersion: typeof _C !== "undefined" ? _C.VERSION : "",
			pageGeneration: _getSafePageLogNumber(
				state?.PagePlaybackContextGeneration,
			),
			workerFailures: _workerFailureDiagnostics.map((entry) => ({ ...entry })),
			unhookedPlayer: Boolean(
				typeof _canRefreshUnhookedPlayer === "function" &&
					_canRefreshUnhookedPlayer(state?.PageMediaKey),
			),
			pageMediaKey:
				_getSafePageLogString(state?.PageMediaKey, 160).replace(/\n/g, "") ||
				null,
			pageChannel:
				_getSafePageLogString(state?.PageChannel, 80).replace(/\n/g, "") ||
				null,
			visibility: _getSafePageLogString(
				typeof _getNativeDocumentVisibilityState === "function"
					? _getNativeDocumentVisibilityState()
					: document.visibilityState,
				24,
			).replace(/\n/g, ""),
			focused:
				typeof _isNativeDocumentFocused === "function"
					? _isNativeDocumentFocused()
					: document.hasFocus?.() === true,
			enabled: state?.IsAdStrippingEnabled === true,
			adSpoofingEnabled: state?.DisableAdSpoofing !== true,
			autoplayBackupEnabled: state?.DisableAutoplayBackup !== true,
			currentAdMediaKey: currentAdMediaKey || null,
			activeCycleStartedAt: Math.max(
				0,
				Math.trunc(_getSafePageLogNumber(progress?.cycleStartedAt, 0)),
			),
			lastEndedCycleStartedAt: _getSafePageLogNumber(
				state?.LastAdEndedCycleStartedAt,
			),
			preferredQuality: _getSafePageLogString(state?.PreferredQualityGroup, 64),
			recovery: _collectPostAdRecoveryDiagnostics(),
			pinnedBackupPlayerType:
				_getSafePageLogString(state?.PinnedBackupPlayerType, 40).replace(
					/\n/g,
					"",
				) || null,
			pinnedBackupMediaKey:
				_getSafePageLogString(state?.PinnedBackupPlayerMediaKey, 160).replace(
					/\n/g,
					"",
				) || null,
			workers,
			media: _collectPageLogMediaState(state),
		};
	} catch {
		return null;
	}
}

function _collectPostAdRecoveryDiagnostics() {
	if (
		typeof _PostAdRecoveryDiagnostics === "undefined" ||
		_PostAdRecoveryDiagnostics.mediaKey !== __TTVAB_STATE__?.PageMediaKey ||
		_PostAdRecoveryDiagnostics.pageGeneration !==
			Number(__TTVAB_STATE__.PagePlaybackContextGeneration || 0)
	)
		return null;
	const transaction = _PostAdRecoveryTransactionState;
	return {
		..._PostAdRecoveryDiagnostics,
		...(transaction.mediaKey === _PostAdRecoveryDiagnostics.mediaKey &&
		transaction.cycleStartedAt === _PostAdRecoveryDiagnostics.cycleStartedAt
			? {
					reloadRequestCount: transaction.reloadRequestCount,
					acceptedReloadCount: transaction.acceptedReloadCount,
					reloadAt: transaction.requiredNativeReloadAt,
					nativeReadyAt: transaction.nativeReloadConfirmedAt,
					expiresAt: transaction.expiresAt,
					currentTime: transaction.lastCurrentTime,
					totalVideoFrames: transaction.lastTotalFrames,
					suspended: transaction.suspendedAt > 0,
				}
			: {}),
	};
}

function _forwardPreviewFailureDiagnostics(value) {
	try {
		const detail = _getTrustedBridgeMessageDetail(value);
		const pageMediaKey = _normalizeMediaKey(__TTVAB_STATE__?.PageMediaKey);
		const mediaKey = _normalizeMediaKey(detail?.mediaKey);
		if (
			!detail ||
			!mediaKey ||
			mediaKey !== pageMediaKey ||
			typeof _isPreviewsPlayerUrl !== "function" ||
			!_isPreviewsPlayerUrl(globalThis.location?.href || "")
		) {
			return false;
		}

		const collected = _collectPageLogEntries();
		const entries = collected.entries.slice(-_PREVIEW_FAILURE_LOG_MAX_ENTRIES);
		const omittedEntries = Math.max(
			0,
			collected.entries.length - entries.length,
		);
		const rawReportedAt = _getSafePageLogNumber(detail.reportedAt, Date.now());
		const reportedAt =
			rawReportedAt >= 0 && rawReportedAt <= 8640000000000000
				? Math.trunc(rawReportedAt)
				: 0;
		const rawStatus = _getSafePageLogNumber(detail.status, 0);
		const status =
			rawStatus >= 100 && rawStatus <= 599 ? Math.trunc(rawStatus) : 0;
		_sendBridgeMessage("ttvab-preview-failure-diagnostic", {
			mediaKey,
			reason: _getSafePageLogString(detail.reason, 48).replace(/\n/g, ""),
			reportedAt,
			status,
			entries,
			context: _collectPageLogContext(),
			truncatedEntries: Math.min(
				1000000,
				Math.max(0, collected.truncatedEntries) + omittedEntries,
			),
		});
		return true;
	} catch {
		return false;
	}
}

function _bindBridgePort() {
	_bindBridgePortHandshake();
}

function _initToggleListener() {
	_onInternalMessage("ttvab-toggle", (detail) => {
		const safeDetail = _getTrustedBridgeMessageDetail(detail);
		if (typeof safeDetail?.enabled !== "boolean") return;
		const enabled = safeDetail.enabled;
		if (__TTVAB_STATE__.IsAdStrippingEnabled === enabled) {
			if (typeof _setIndependentVideoAdGuardEnabled === "function") {
				_setIndependentVideoAdGuardEnabled(enabled);
			}
			return;
		}
		__TTVAB_STATE__.IsAdStrippingEnabled = enabled;
		if (!enabled) _clearAdTimerOverlay();
		if (typeof _setIndependentVideoAdGuardEnabled === "function") {
			_setIndependentVideoAdGuardEnabled(enabled);
		}
		if (!enabled) {
			for (const mediaKey of Object.keys(
				__TTVAB_STATE__.AdPodProgressByMediaKey || {},
			)) {
				_clearAdPodProgress(mediaKey);
			}
			__TTVAB_STATE__.AdPodProgressByMediaKey = Object.create(null);
			_pageAdCycleControlByMediaKey.clear();
			_pageSideEmptyHoldInfoByUrl.clear();
			__TTVAB_STATE__.CurrentAdChannel = null;
			__TTVAB_STATE__.CurrentAdMediaKey = null;
			__TTVAB_STATE__.PinnedBackupPlayerType = null;
			__TTVAB_STATE__.PinnedBackupPlayerChannel = null;
			__TTVAB_STATE__.PinnedBackupPlayerMediaKey = null;
			__TTVAB_STATE__.ActiveCodecHandoffId = null;
			__TTVAB_STATE__.ActiveCodecHandoffChannel = null;
			__TTVAB_STATE__.ActiveCodecHandoffMediaKey = null;
			__TTVAB_STATE__.HasTriggeredPlayerReload = false;
			__TTVAB_STATE__.PendingTriggeredPlayerReloadChannel = null;
			__TTVAB_STATE__.PendingTriggeredPlayerReloadMediaKey = null;
			__TTVAB_STATE__.PendingTriggeredPlayerReloadAt = 0;
			__TTVAB_STATE__.PendingTriggeredPlayerReloadCycleStartedAt = 0;
			__TTVAB_STATE__.LastPlayerReloadAt = 0;
			__TTVAB_STATE__.LastAdEndedAt = 0;
			__TTVAB_STATE__.LastAdEndedChannel = null;
			__TTVAB_STATE__.LastAdEndedMediaKey = null;
			__TTVAB_STATE__.LastAdEndedCycleStartedAt = 0;
			__TTVAB_STATE__.LastAdDetectedAt = 0;
			__TTVAB_STATE__.LastAdRecoveryReloadAt = 0;
			__TTVAB_STATE__.LastAdRecoveryResumeAt = 0;
			__TTVAB_STATE__.BackupSearchForceRefreshAt = 0;
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
		}
		_broadcastWorkers({ key: "UpdateToggleState", value: enabled });
		if (!enabled) {
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
	});

	_onInternalMessage("ttvab-toggle-ad-timer", (detail) => {
		const safeDetail = _getTrustedBridgeMessageDetail(detail);
		if (typeof safeDetail?.enabled !== "boolean") return;
		_setAdTimerEnabled(safeDetail.enabled);
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
		const collected = _collectPageLogEntries();
		_sendBridgeMessage("ttvab-logs", {
			requestId,
			entries: collected.entries,
			context: _collectPageLogContext(),
			truncatedEntries: collected.truncatedEntries,
		});
	});
}

function _hookSpaNavigation() {
	const sync = () => {
		_syncPagePlaybackContext({ broadcast: true });
		_clearAdTimerOverlay();
	};
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
		_clearAdTimerOverlay();
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
	_hookVisibilityState();
	_syncPagePlaybackVisibilityState();

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

	if (typeof _hookIndependentVideoAdGuard === "function") {
		_hookIndependentVideoAdGuard();
	}
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
