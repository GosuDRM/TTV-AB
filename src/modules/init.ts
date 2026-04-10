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
		_log(
			`Buffer fix ${enabled ? "enabled" : "disabled"}`,
			enabled ? "success" : "warning",
		);
	});
}

function _blockAntiAdblockPopup() {
	const lastDomCleanupAtByKind = Object.create(null) as Record<string, number>;
	const lastDomCleanupAtBySignature = Object.create(null) as Record<string, number>;
	let isDisplayAdShellActive = false;
	let isPromotedPageAdActive = false;
	let didCountCurrentDisplayAdShellCleanup = false;
	let didCountCurrentDisplayAdShellAd = false;
	let pendingDisplayAdShellSince = 0;
	let pendingDisplayAdShellSignature = null;
	let lastStaleDisplayArtifactSignature = null;
	let lastStaleDisplayArtifactCleanupAt = 0;
	let lastDisplayAdShellSignalAt = 0;
	let lastRouteUrl = window.location.href;
	let activeDirectPlayerAdMediaSignature = null;
	let didCountCurrentDirectPlayerAdMedia = false;
	let lastPlaybackContextChangeAt = 0;
	let pendingRoutePlayerResyncTimer = null;
	let pendingRouteScanTimers: ReturnType<typeof setTimeout>[] = [];
	let scheduledScanTimer = null;
	let scheduledScanForce = false;
	let lastScanAt = 0;
	let lastRelevantScanTriggerAt = Date.now();
	let consecutiveCleanIdleScans = 0;
	let cachedMainPlayerElement: Element | null = null;
	let cachedMainPlayerRect: DOMRect | null = null;
	let cachedPlayerOverlayRoots: Element[] | null = null;
	let lastPopupSignalAt = 0;
	let lastPopupCleanupAt = 0;
	let lastPopupFallbackScanAt = 0;
	const VISIBLE_IDLE_SCAN_DELAYS = [2000, 4000, 8000, 15000];
	const POPUP_SCAN_SIGNAL_WINDOW_MS = 5000;
	const POPUP_RECENT_CLEANUP_WINDOW_MS = 8000;
	const POPUP_BACKGROUND_SCAN_INTERVAL_MS = 30000;
	const DOM_CLEANUP_KIND_DEBOUNCE_MS = 1000;
	const DOM_CLEANUP_SAME_SIGNATURE_COOLDOWN_MS = 30000;
	const STALE_DISPLAY_ARTIFACT_RECENT_SIGNAL_MS = 15000;
	const STALE_DISPLAY_ARTIFACT_SAME_SIGNATURE_COOLDOWN_MS = 10000;
	const PLAYER_SURFACE_AD_MARKER_SELECTOR =
		'[data-ttvab-player-ad-banner="true"]';
	const DISPLAY_AD_LABEL_SELECTORS = [
		'[data-a-target="video-ad-label"]',
		'[data-test-selector="ad-label"]',
		'[class*="ad-countdown"]',
		'[aria-label="Ad"]',
	];
	const DISPLAY_AD_LABEL_SELECTOR_GROUP = DISPLAY_AD_LABEL_SELECTORS.join(", ");
	const LOWER_THIRD_DISPLAY_AD_SELECTORS = [
		'iframe[data-test-selector^="sda-iframe-"]',
		'iframe[title="Stream Display Ad"]',
		'iframe[class*="stream-display-ad__iframe_lower-third"]',
		'[data-test-selector="sda-frame"]',
		"#stream-lowerthird",
		'[class*="stream-display-ad__frame_lower-third"]',
	];
	const EXPLICIT_DISPLAY_AD_SELECTORS = [
		'[data-test-selector="ad-banner"]',
		'[data-test-selector="display-ad"]',
		'[data-a-target="ads-banner"]',
		...LOWER_THIRD_DISPLAY_AD_SELECTORS,
		PLAYER_SURFACE_AD_MARKER_SELECTOR,
	];
	const DISPLAY_AD_SHELL_SELECTORS = [
		".stream-display-ad",
		'[class*="stream-display-ad"]',
	];
	const PIP_SELECTORS = [
		'[data-a-target="video-player-pip-container"]',
		'[data-a-target="video-player-mini-player"]',
		".video-player__pip-container",
		".video-player__mini-player",
		".mini-player",
		'[class*="mini-player"]',
		'[class*="pip-container"]',
	];
	const STREAM_DISPLAY_LAYOUT_SELECTORS = [
		".video-player--stream-display-ad",
		'[class*="video-player--stream-display-ad"]',
	];
	const OFFLINE_PAGE_SIGNAL_SELECTORS = [
		'[data-a-target="stream-offline-status"]',
		'[data-test-selector*="offline"]',
		'[class*="offline-status"]',
		'[class*="offline-page"]',
	];
	const PROMOTED_PAGE_CTA_PATTERN =
		/^(learn more|shop(?: now| on amazon)?|watch now|play now|install|download|get offer|see more|try turbo|get turbo|click here for turbo)$/i;
	const PLAYER_AD_CTA_PATTERN =
		/^(learn more|shop(?: now| on amazon)?|watch now|play now|get offer|see more|see details|install|download|consider turbo|try turbo|get turbo|click here for turbo)$/i;
	const PLAYER_AD_OVERLAY_TEXT_PATTERN =
		/\bright after this ad break\b|\bstick around to support the (?:channel|stream)\b|\btaking an ad break\b|\bconsider turbo\b|\bad-free viewing\b|\bfully enjoy twitch\b|\bviewers watch ads\b/i;
	const DIRECT_PLAYER_AD_MEDIA_URL_PATTERN =
		/^https:\/\/m\.media-amazon\.com\/.*\.mp4(?:$|\?)/i;
	const DISPLAY_AD_FEEDBACK_BUTTON_PATTERN = /\bleave feedback\b.*\bad\b/i;
	const MUTATION_NOISE_SELECTORS = [
		'[data-a-target="chat-scroller"]',
		'[data-a-target="right-column-chat-bar"]',
		'[data-test-selector="chat-room-component"]',
		'[class*="chat-room"]',
		'[class*="chat-shell"]',
		'[class*="right-column"]',
		'[class*="RightColumn"]',
		'[class*="ChatShell"]',
		'[class*="ChatRoom"]',
	];
	const MUTATION_NOISE_SELECTOR_GROUP = MUTATION_NOISE_SELECTORS.join(", ");
	const RELEVANT_MUTATION_SELECTOR = [
		"video",
		"audio",
		"iframe",
		'[data-test-selector*="ad"]',
		'[data-a-target*="ad"]',
		'[class*="display-ad"]',
		'[class*="stream-display-ad"]',
		'[class*="video-player"]',
		'[class*="VideoPlayer"]',
		'[data-a-target="video-player"]',
	].join(", ");
	const MUTATION_PLAYER_CONTAINER_SELECTOR_GROUP = [
		'[data-a-target="video-player"]',
		'[class*="video-player"]',
		'[class*="VideoPlayer"]',
	].join(", ");
	const MUTATION_OVERLAY_CLASS_PATTERN =
		/(?:Overlay|Balloon|Modal|Consent|consent|display-ad|stream-display-ad)/i;
	const MUTATION_AD_SIGNAL_PATTERN =
		/\bad\b|\bpromo\b|learn more|support the (?:channel|stream)|right after this ad break|taking an ad break|consider turbo|try turbo|click here for turbo|ad-free viewing|fully enjoy twitch|viewers watch ads/i;

	function _initPopupBlocker() {
		if (!document.body) {
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", _initPopupBlocker, {
					once: true,
				});
			} else {
				setTimeout(_initPopupBlocker, 50);
			}
			return;
		}

		if (!document.getElementById("ttvab-popup-style")) {
			const styleMount = document.head || document.documentElement;
			if (!styleMount) {
				setTimeout(_initPopupBlocker, 50);
				return;
			}
			const style = document.createElement("style");
			style.id = "ttvab-popup-style";
			style.textContent = `
                [data-test-selector="ad-banner"],
                [data-test-selector="display-ad"],
                [data-a-target="ads-banner"],
                [data-a-target="consent-banner"],
                ${LOWER_THIRD_DISPLAY_AD_SELECTORS.join(",\n                ")},
                ${PLAYER_SURFACE_AD_MARKER_SELECTOR} {
                    display: none !important;
                    visibility: hidden !important;
                }
            `;
			styleMount.appendChild(style);
		}

		function _hasResolvedDomCleanupState() {
			return (
				__TTVAB_STATE__.HasResolvedToggleState === true &&
				__TTVAB_STATE__.HasResolvedDomAdsCountState === true
			);
		}

		function _isDomCleanupEnabled() {
			return (
				_hasResolvedDomCleanupState() &&
				__TTVAB_STATE__.IsAdStrippingEnabled === true
			);
		}

		function _resetDomCleanupDebounce() {
			for (const key of Object.keys(lastDomCleanupAtByKind)) {
				delete lastDomCleanupAtByKind[key];
			}
			for (const key of Object.keys(lastDomCleanupAtBySignature)) {
				delete lastDomCleanupAtBySignature[key];
			}
		}

		function _getDomCleanupDebounceKey(kind) {
			const safeKind =
				typeof kind === "string" && kind.trim() ? kind.trim() : "generic";
			const context = _getPlaybackContextFromUrl(window.location.href);
			const scopeKey =
				context.MediaKey ||
				context.ChannelName ||
				window.location.pathname ||
				window.location.href;
			return `${safeKind}:${scopeKey}`;
		}

		function _normalizeDomCleanupSignatureText(value) {
			return String(value || "")
				.replace(/\u200B|\u200C|\u200D|\uFEFF|\u00AD/g, "")
				.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, "")
				.replace(/\b\d+\b/g, "#")
				.replace(/\s+/g, " ")
				.trim()
				.toLowerCase();
		}

		function _getDomCleanupSignatureKey(kind, el) {
			if (!(el instanceof HTMLElement)) return null;

			const safeKind =
				typeof kind === "string" && kind.trim() ? kind.trim() : "generic";
			const context = _getPlaybackContextFromUrl(window.location.href);
			const scopeKey =
				context.MediaKey ||
				context.ChannelName ||
				window.location.pathname ||
				window.location.href;

			let sizeKey = "0x0";
			try {
				const rect = el.getBoundingClientRect();
				sizeKey = `${Math.round(rect.width / 64)}x${Math.round(rect.height / 64)}`;
			} catch {}

			const dataSignal = String(
				el.getAttribute("data-a-target") ||
					el.getAttribute("data-test-selector") ||
					el.getAttribute("role") ||
					"",
			)
				.replace(/\s+/g, " ")
				.trim()
				.toLowerCase();
			const textSample = _normalizeDomCleanupSignatureText(
				el.textContent || el.getAttribute("aria-label") || "",
			).slice(0, 160);

			if (!dataSignal && !textSample && sizeKey === "0x0") {
				return null;
			}

			return `${safeKind}:${scopeKey}:${el.tagName.toLowerCase()}:${dataSignal}:${sizeKey}:${textSample}`;
		}

		function _shouldDebounceDomCleanup(kind, el = null) {
			const debounceKey = _getDomCleanupDebounceKey(kind);
			const now = Date.now();
			const lastCleanupAt = Number(lastDomCleanupAtByKind[debounceKey]) || 0;
			if (now - lastCleanupAt < DOM_CLEANUP_KIND_DEBOUNCE_MS) {
				return true;
			}

			const signatureKey = _getDomCleanupSignatureKey(kind, el);
			if (signatureKey) {
				const lastSignatureCleanupAt =
					Number(lastDomCleanupAtBySignature[signatureKey]) || 0;
				if (
					now - lastSignatureCleanupAt <
					DOM_CLEANUP_SAME_SIGNATURE_COOLDOWN_MS
				) {
					lastDomCleanupAtByKind[debounceKey] = now;
					return true;
				}
				lastDomCleanupAtBySignature[signatureKey] = now;
			}

			lastDomCleanupAtByKind[debounceKey] = now;
			return false;
		}

		function _incrementDomCleanup(kind, el = null) {
			if (!_isDomCleanupEnabled()) return;
			if (_shouldDebounceDomCleanup(kind, el)) return false;

			const channel = _getCurrentChannelName();
			_incrementDomAdsBlocked(kind, channel);
			_log(`DOM ad cleanup (${kind}) total: ${_S.domAdsBlocked}`, "success");
			return true;
		}

		function _getCurrentChannelName() {
			return _getPlaybackContextFromUrl(window.location.href).ChannelName;
		}

		function _hideElement(el) {
			if (!el) return;
			el.style.setProperty("display", "none", "important");
			el.style.setProperty("visibility", "hidden", "important");
			el.setAttribute("data-ttvab-blocked", "true");
		}

		function _safelyDetachCleanupElement(el) {
			if (!(el instanceof HTMLElement)) return false;
			const appRoot = document.getElementById("root");
			if (appRoot && appRoot.contains(el)) {
				_hideElement(el);
				return false;
			}
			el.remove();
			return true;
		}

		function _resetStreamDisplayLayout(el) {
			if (!el) return;

			if (
				typeof el.className === "string" &&
				el.className.includes("stream-display-ad")
			) {
				el.className = el.className
					.split(/\s+/)
					.filter(
						(className) =>
							className && !className.includes("stream-display-ad"),
					)
					.join(" ");
			}

			el.style.setProperty("padding", "0", "important");
			el.style.setProperty("margin", "0", "important");
			el.style.setProperty("background", "transparent", "important");
			el.style.setProperty("background-color", "transparent", "important");
			el.style.setProperty("width", "100%", "important");
			el.style.setProperty("height", "100%", "important");
			el.style.setProperty("min-width", "0", "important");
			el.style.setProperty("min-height", "0", "important");
			el.style.setProperty("max-width", "100%", "important");
			el.style.setProperty("max-height", "100%", "important");
			el.style.setProperty("inset", "0", "important");
			el.style.setProperty(
				"grid-template-columns",
				"minmax(0, 1fr)",
				"important",
			);
			el.style.setProperty("grid-template-rows", "minmax(0, 1fr)", "important");
			el.style.setProperty("grid-template-areas", "none", "important");
			el.style.setProperty("grid-auto-columns", "minmax(0, 1fr)", "important");
			el.style.setProperty("grid-auto-rows", "minmax(0, 1fr)", "important");
			el.style.setProperty("grid-auto-flow", "row", "important");
			el.style.setProperty("column-gap", "0", "important");
			el.style.setProperty("row-gap", "0", "important");
			el.style.setProperty("gap", "0", "important");
			el.style.setProperty("justify-content", "stretch", "important");
			el.style.setProperty("justify-items", "stretch", "important");
			el.style.setProperty("align-content", "stretch", "important");
			el.style.setProperty("align-items", "stretch", "important");
			el.style.setProperty("flex", "1 1 auto", "important");
			el.style.setProperty("flex-basis", "auto", "important");
			el.style.setProperty("overflow", "hidden", "important");
			el.setAttribute("data-ttvab-display-shell-reset", "true");
		}

		function _restoreStreamDisplayLayout(el) {
			if (!el) return;

			if (
				typeof el.className === "string" &&
				el.className.includes("stream-display-ad")
			) {
				el.className = el.className
					.split(/\s+/)
					.filter(
						(className) =>
							className && !className.includes("stream-display-ad"),
					)
					.join(" ");
			}

			[
				"display",
				"visibility",
				"padding",
				"margin",
				"background",
				"background-color",
				"width",
				"height",
				"min-width",
				"min-height",
				"max-width",
				"max-height",
				"inset",
				"left",
				"right",
				"top",
				"bottom",
				"grid-template-columns",
				"grid-template-rows",
				"grid-template-areas",
				"grid-auto-columns",
				"grid-auto-rows",
				"grid-auto-flow",
				"column-gap",
				"row-gap",
				"gap",
				"justify-content",
				"justify-items",
				"align-content",
				"align-items",
				"flex",
				"flex-basis",
				"overflow",
			].forEach((property) => {
				el.style.removeProperty(property);
			});

			el.removeAttribute("data-ttvab-display-shell-reset");
			el.removeAttribute("data-ttvab-blocked");
		}

		function _resetStaleDisplayArtifactCleanupDeduper() {
			lastStaleDisplayArtifactSignature = null;
			lastStaleDisplayArtifactCleanupAt = 0;
		}

		function _hasDisplayAdShellArtifactClass(el) {
			const className = typeof el?.className === "string" ? el.className : "";
			return (
				className.includes("stream-display-ad") ||
				className.includes("video-player--stream-display-ad")
			);
		}

		function _isDisplayAdShellArtifact(
			el,
			options: { allowClassArtifacts?: boolean } = {},
		) {
			const { allowClassArtifacts = false } = options;
			if (!el) return false;
			if (
				el.hasAttribute?.("data-ttvab-blocked") ||
				el.hasAttribute?.("data-ttvab-display-shell-reset") ||
				el.getAttribute?.("data-ttvab-player-ad-banner") === "true"
			) {
				return true;
			}

			return allowClassArtifacts && _hasDisplayAdShellArtifactClass(el);
		}

		function _getDisplayAdArtifactSignature(el) {
			if (!el) return "";
			const className =
				typeof el.className === "string"
					? el.className.split(/\s+/).filter(Boolean).sort().join(".")
					: "";
			return [
				el.tagName || "",
				el.id || "",
				el.getAttribute?.("data-a-target") || "",
				el.getAttribute?.("data-test-selector") || "",
				className,
				el.hasAttribute?.("data-ttvab-blocked") ? "blocked" : "",
				el.hasAttribute?.("data-ttvab-display-shell-reset") ? "reset" : "",
			].join(":");
		}

		function _shouldKeepDisplayAdLayoutCollapsed(el, playerRect = null) {
			if (!el) return false;
			if (_hasDisplayAdShellArtifactClass(el)) return true;
			if (!el.hasAttribute?.("data-ttvab-display-shell-reset")) return false;

			const isPlayerLayoutWrapper = Boolean(
				el.querySelector?.("video") ||
					el.matches?.('[data-a-target="video-player"]') ||
					el.matches?.('[class*="video-player"]'),
			);
			if (!isPlayerLayoutWrapper) return false;

			const resolvedPlayerRect = playerRect || _getMainPlayerRect();
			if (!resolvedPlayerRect) return true;

			const rect = el.getBoundingClientRect();
			const extraTop = Math.max(0, resolvedPlayerRect.top - rect.top);
			const extraLeft = Math.max(0, resolvedPlayerRect.left - rect.left);
			const extraRight = Math.max(0, rect.right - resolvedPlayerRect.right);
			const extraBottom = Math.max(0, rect.bottom - resolvedPlayerRect.bottom);
			const className = typeof el.className === "string" ? el.className : "";
			const hasResidualInset =
				extraTop > 24 ||
				extraLeft > 24 ||
				extraRight > 24 ||
				extraBottom > 10 ||
				rect.width > resolvedPlayerRect.width + 24 ||
				rect.height > resolvedPlayerRect.height + 12;
			const hasResidualLayoutMarker =
				el.id === "stream-lowerthird" ||
				el.getAttribute?.("data-test-selector") === "sda-frame" ||
				className.includes("lower-third") ||
				className.includes("display-ad") ||
				className.includes("stream-display-ad") ||
				className.includes("video-player--stream-display-ad");
			const style = window.getComputedStyle(el);
			const hasStructuredLayout =
				style.display === "grid" ||
				style.display === "flex" ||
				style.position === "relative" ||
				style.position === "absolute";
			const hasResidualGap =
				style.columnGap !== "0px" ||
				style.rowGap !== "0px" ||
				style.gap !== "0px";

			return (
				hasResidualLayoutMarker ||
				(hasResidualInset && (hasStructuredLayout || hasResidualGap))
			);
		}

		function _cleanupStaleDisplayAdShell(
			displayShellNodes,
			pipContainers,
			layoutRoots,
			inferredLayoutWrappers = [],
			options: { allowClassArtifacts?: boolean } = {},
		) {
			const { allowClassArtifacts = false } = options;
			const staleNodes = _filterUniqueElements(
				[
					...displayShellNodes,
					...layoutRoots,
					...inferredLayoutWrappers,
					...Array.from(
						document.querySelectorAll(PLAYER_SURFACE_AD_MARKER_SELECTOR),
					),
					...Array.from(
						document.querySelectorAll(
							'[data-ttvab-display-shell-reset="true"]',
						),
					),
				],
				(el) => _isDisplayAdShellArtifact(el, { allowClassArtifacts }),
			);
			const stalePipContainers = _filterUniqueElements(
				pipContainers,
				(el) =>
					el.hasAttribute?.("data-ttvab-blocked") ||
					el.hasAttribute?.("data-ttvab-display-shell-reset"),
			);

			if (staleNodes.length === 0 && stalePipContainers.length === 0) {
				_resetStaleDisplayArtifactCleanupDeduper();
				return false;
			}

			const staleSignature = [...staleNodes, ...stalePipContainers]
				.map(_getDisplayAdArtifactSignature)
				.sort()
				.join("|");
			const now = Date.now();
			if (
				staleSignature &&
				staleSignature === lastStaleDisplayArtifactSignature &&
				now - lastStaleDisplayArtifactCleanupAt <
					STALE_DISPLAY_ARTIFACT_SAME_SIGNATURE_COOLDOWN_MS
			) {
				return false;
			}
			lastStaleDisplayArtifactSignature = staleSignature;
			lastStaleDisplayArtifactCleanupAt = now;
			const activePlayerRect = _getMainPlayerRect();

			_log(
				"Display ad shell stale: cleaning up residual shell/layout artifacts",
				"info",
			);

			staleNodes.forEach((el) => {
				if (_shouldKeepDisplayAdLayoutCollapsed(el, activePlayerRect)) {
					_resetStreamDisplayLayout(el);
					return;
				}
				if (
					el.querySelector?.("video") ||
					el.matches?.('[data-a-target="video-player"]') ||
					el.matches?.('[class*="video-player"]')
				) {
					_restoreStreamDisplayLayout(el);
					return;
				}

				if (
					el.hasAttribute("data-ttvab-blocked") ||
					el.hasAttribute("data-ttvab-display-shell-reset")
				) {
					_safelyDetachCleanupElement(el);
					return;
				}
				el.style.removeProperty("display");
				el.style.removeProperty("visibility");
			});

			stalePipContainers.forEach((el) => {
				if (el.querySelector?.("video")) {
					_restoreStreamDisplayLayout(el);
					return;
				}

				if (el.hasAttribute("data-ttvab-blocked")) {
					_safelyDetachCleanupElement(el);
					return;
				}
				el.style.removeProperty("display");
				el.style.removeProperty("visibility");
			});

			return true;
		}

		function _resetDisplayAdShellState() {
			isDisplayAdShellActive = false;
			isPromotedPageAdActive = false;
			pendingDisplayAdShellSince = 0;
			pendingDisplayAdShellSignature = null;
			lastDisplayAdShellSignalAt = 0;
			_resetDirectPlayerAdMediaState();
		}

		function _resetDirectPlayerAdMediaState() {
			activeDirectPlayerAdMediaSignature = null;
			didCountCurrentDirectPlayerAdMedia = false;
		}

		function _queryUniqueElements(selectors) {
			const matches = [];
			const seen = new Set();
			for (const selector of selectors) {
				try {
					for (const node of document.querySelectorAll(selector)) {
						if (!seen.has(node)) {
							seen.add(node);
							matches.push(node);
						}
					}
				} catch {}
			}
			return matches;
		}

		function _filterUniqueElements(elements, predicate = null) {
			const matches = [];
			const seen = new Set();
			for (const el of elements) {
				if (!el || seen.has(el)) continue;
				seen.add(el);
				if (!predicate || predicate(el)) {
					matches.push(el);
				}
			}
			return matches;
		}

		function _resetPlayerDetectionCaches() {
			cachedMainPlayerElement = null;
			cachedMainPlayerRect = null;
			cachedPlayerOverlayRoots = null;
		}

		function _markIdleScanInterest() {
			lastRelevantScanTriggerAt = Date.now();
			consecutiveCleanIdleScans = 0;
		}

		function _markPopupScanInterest() {
			lastPopupSignalAt = Date.now();
		}

		function _recordPopupCleanup() {
			const now = Date.now();
			lastPopupCleanupAt = now;
			lastPopupSignalAt = now;
		}

		function _shouldRunPopupFallback(force = false) {
			const now = Date.now();
			if (force) return true;
			if (now - lastPopupSignalAt < POPUP_SCAN_SIGNAL_WINDOW_MS) {
				return true;
			}
			if (now - lastPopupCleanupAt < POPUP_RECENT_CLEANUP_WINDOW_MS) {
				return true;
			}
			return now - lastPopupFallbackScanAt >= POPUP_BACKGROUND_SCAN_INTERVAL_MS;
		}

		function _recordIdleScanResult(didWork) {
			if (didWork) {
				_markIdleScanInterest();
				return;
			}
			consecutiveCleanIdleScans = Math.min(
				consecutiveCleanIdleScans + 1,
				VISIBLE_IDLE_SCAN_DELAYS.length - 1,
			);
		}

		function _getIdleScanDelay() {
			if (_isDocumentHidden()) return 5000;
			if (Date.now() - lastRelevantScanTriggerAt < 4000) {
				return VISIBLE_IDLE_SCAN_DELAYS[0];
			}
			return VISIBLE_IDLE_SCAN_DELAYS[
				Math.min(consecutiveCleanIdleScans, VISIBLE_IDLE_SCAN_DELAYS.length - 1)
			];
		}

		function _pushUniqueElement(list, el, seen = null) {
			if (!el) return;
			if (seen ? seen.has(el) : list.includes(el)) return;
			if (seen) seen.add(el);
			list.push(el);
		}

		function _queryWithinRoots(roots, selector) {
			const matches = [];
			const seen = new Set();
			for (const root of roots) {
				if (!(root instanceof Element)) continue;
				try {
					if (root.matches?.(selector) && !seen.has(root)) {
						seen.add(root);
						matches.push(root);
					}
				} catch {}
				try {
					for (const node of root.querySelectorAll(selector)) {
						if (!seen.has(node)) {
							seen.add(node);
							matches.push(node);
						}
					}
				} catch {}
			}
			return matches;
		}

		function _queryVisibleNearPlayerWithinRoots(
			roots,
			selectors,
			playerRect = null,
		) {
			const resolvedPlayerRect = playerRect || _getMainPlayerRect();
			if (
				!resolvedPlayerRect ||
				!Array.isArray(roots) ||
				roots.length === 0 ||
				!Array.isArray(selectors) ||
				selectors.length === 0
			) {
				return [];
			}

			return _filterUniqueElements(
				_queryWithinRoots(roots, selectors.join(", ")),
				(el) => _isVisibleNearPlayerElement(el, resolvedPlayerRect),
			);
		}

		function _getPlayerOverlaySearchRoots() {
			if (cachedPlayerOverlayRoots !== null) {
				return cachedPlayerOverlayRoots;
			}

			const player = _getMainPlayerElement();
			const playerRect = _getMainPlayerRect();
			if (!(player instanceof Element) || !playerRect) {
				cachedPlayerOverlayRoots = [];
				return cachedPlayerOverlayRoots;
			}

			const roots = [];
			const seen = new Set();
			let current =
				player.closest?.('[data-a-target="video-player"]') ||
				player.parentElement ||
				player;
			const maxWidth = Math.min(
				window.innerWidth * 0.9,
				playerRect.width + 520,
			);
			const maxHeight = Math.min(
				window.innerHeight * 0.9,
				playerRect.height + 380,
			);

			for (let depth = 0; depth < 5 && current; depth += 1) {
				const rect = current.getBoundingClientRect();
				const overlapsPlayer =
					_getRectOverlap(
						rect.left,
						rect.right,
						playerRect.left,
						playerRect.right,
					) > 0 &&
					_getRectOverlap(
						rect.top,
						rect.bottom,
						playerRect.top,
						playerRect.bottom,
					) > 0;

				if (overlapsPlayer && rect.width > 0 && rect.height > 0) {
					_pushUniqueElement(roots, current, seen);
				}

				if (
					rect.width > maxWidth ||
					rect.height > maxHeight ||
					(depth > 0 && _isSafeElement(current))
				) {
					break;
				}

				current = current.parentElement;
			}

			if (roots.length === 0) {
				_pushUniqueElement(roots, player, seen);
			}

			cachedPlayerOverlayRoots = roots;
			return cachedPlayerOverlayRoots;
		}

		function _cleanupAllKnownDisplayArtifacts(
			options: { allowClassArtifacts?: boolean } = {},
		) {
			const { allowClassArtifacts = false } = options;
			const displayShellNodes = _queryUniqueElements(
				DISPLAY_AD_SHELL_SELECTORS,
			);
			const pipContainers = _queryUniqueElements(PIP_SELECTORS);
			const layoutRoots = _queryUniqueElements(STREAM_DISPLAY_LAYOUT_SELECTORS);
			const explicitDisplayNodes = _queryUniqueElements(
				EXPLICIT_DISPLAY_AD_SELECTORS,
			);
			_cleanupStaleDisplayAdShell(
				displayShellNodes,
				pipContainers,
				layoutRoots,
				_getInferredDisplayAdLayoutWrappers(),
				{ allowClassArtifacts },
			);

			explicitDisplayNodes.forEach((el) => {
				if (el.hasAttribute("data-ttvab-blocked")) {
					_safelyDetachCleanupElement(el);
					return;
				}
				el.style.removeProperty("display");
				el.style.removeProperty("visibility");
			});
		}

		function _clearPendingRoutePlayerResync() {
			if (!pendingRoutePlayerResyncTimer) return;
			clearTimeout(pendingRoutePlayerResyncTimer);
			pendingRoutePlayerResyncTimer = null;
		}

		function _clearPendingRouteScans() {
			if (pendingRouteScanTimers.length === 0) return;
			for (const timer of pendingRouteScanTimers) {
				clearTimeout(timer);
			}
			pendingRouteScanTimers = [];
		}

		function _scheduleRouteChangeScans() {
			_clearPendingRouteScans();
			const delays = _isDocumentHidden() ? [180, 700] : [60, 220, 550];
			for (const delay of delays) {
				const timer = setTimeout(() => {
					pendingRouteScanTimers = pendingRouteScanTimers.filter(
						(value) => value !== timer,
					);
					_queueScan(0, true);
				}, delay);
				pendingRouteScanTimers.push(timer);
			}
		}

		function _scheduleRoutePlayerResync(previousContext, currentContext) {
			const previousMediaKey = _normalizeMediaKey(previousContext?.MediaKey);
			const currentMediaKey = _normalizeMediaKey(currentContext?.MediaKey);
			if (
				!previousMediaKey ||
				!currentMediaKey ||
				previousMediaKey === currentMediaKey
			) {
				_clearPendingRoutePlayerResync();
				return;
			}

			_clearPendingRoutePlayerResync();

			let attempts = 0;
			const tryResync = () => {
				attempts += 1;

				const playerState =
					typeof _getPlayerAndState === "function"
						? _getPlayerAndState()
						: { player: null, state: null };
				const player = playerState?.player || null;
				const state = playerState?.state || null;
				const primaryMedia =
					typeof _getPrimaryMediaElement === "function"
						? _getPrimaryMediaElement()
						: null;
				const primarySrc = _getMediaSourceUrl(primaryMedia);
				const playerContentType =
					state?.props?.content?.type === "live" ||
					state?.props?.content?.type === "vod"
						? state.props.content.type
						: null;
				const hasPrimaryMedia = primaryMedia instanceof HTMLMediaElement;
				const shouldReload =
					DIRECT_PLAYER_AD_MEDIA_URL_PATTERN.test(primarySrc) ||
					(currentContext.MediaType &&
						playerContentType &&
						playerContentType !== currentContext.MediaType) ||
					(attempts >= 4 && player && !hasPrimaryMedia);

				if (shouldReload && typeof _doPlayerTask === "function") {
					_log(
						`Reloading player after route change (${previousMediaKey} -> ${currentMediaKey})`,
						"warning",
					);
					_doPlayerTask(false, true, { reason: "route-change" });
					pendingRoutePlayerResyncTimer = null;
					return;
				}

				if (attempts >= 6) {
					pendingRoutePlayerResyncTimer = null;
					return;
				}

				pendingRoutePlayerResyncTimer = setTimeout(tryResync, 250);
			};

			pendingRoutePlayerResyncTimer = setTimeout(tryResync, 150);
		}

		function _handleRouteChange(force = false) {
			const routeUrl = window.location.href;
			const shouldForce = force === true;
			if (!shouldForce && routeUrl === lastRouteUrl) return false;
			lastRouteUrl = routeUrl;
			_resetDomCleanupDebounce();
			_markIdleScanInterest();
			_resetPlayerDetectionCaches();
			const previousContext = _normalizePlaybackContext({
				MediaType: __TTVAB_STATE__.PageMediaType,
				ChannelName: __TTVAB_STATE__.PageChannel,
				VodID: __TTVAB_STATE__.PageVodID,
				MediaKey: __TTVAB_STATE__.PageMediaKey,
			});
			const currentContext = _syncPagePlaybackContext();
			const didMediaKeyChange =
				previousContext.MediaKey !== currentContext.MediaKey;
			if (didMediaKeyChange) {
				lastPlaybackContextChangeAt = Date.now();
				if (typeof _resetPlaybackIntentForNavigation === "function") {
					_resetPlaybackIntentForNavigation(
						currentContext.ChannelName,
						currentContext.MediaKey,
						3000,
					);
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
				_resetDirectPlayerAdMediaState();
				_scheduleRoutePlayerResync(previousContext, currentContext);
			}
			const allowRouteClassArtifactCleanup =
				isDisplayAdShellActive ||
				(lastDisplayAdShellSignalAt > 0 &&
					Date.now() - lastDisplayAdShellSignalAt <
						STALE_DISPLAY_ARTIFACT_RECENT_SIGNAL_MS);
			_resetDisplayAdShellState();
			_resetStaleDisplayArtifactCleanupDeduper();

			const hasExplicitAdSignals = _queryUniqueElements([
				...EXPLICIT_DISPLAY_AD_SELECTORS,
				...DISPLAY_AD_SHELL_SELECTORS,
			]).some((el) => _isVisibleElement(el));
			if (!hasExplicitAdSignals) {
				didCountCurrentDisplayAdShellCleanup = false;
				didCountCurrentDisplayAdShellAd = false;
			}

			_cleanupAllKnownDisplayArtifacts({
				allowClassArtifacts: allowRouteClassArtifactCleanup,
			});
			_scheduleRouteChangeScans();
			return true;
		}

		function _pushUniqueDisplayAdLabel(labels, seen, el) {
			if (!el || seen.has(el)) return;
			labels.push(el);
			seen.add(el);
		}

		function _isDisplayAdFeedbackButton(el) {
			const ariaLabel = String(el?.getAttribute?.("aria-label") || "")
				.replace(/\s+/g, " ")
				.trim();
			return DISPLAY_AD_FEEDBACK_BUTTON_PATTERN.test(ariaLabel);
		}

		function _getDisplayAdLabelTarget(node, rootRect = null) {
			if (!node) return null;
			let target =
				node.closest?.('button[aria-label], [role="button"][aria-label]') ||
				node;
			if (
				target !== node &&
				(!_isDisplayAdFeedbackButton(target) || !_isVisibleElement(target))
			) {
				target = node;
			}

			for (let depth = 0; depth < 4 && target; depth += 1) {
				const parent = target.parentElement;
				if (!parent || _isSafeElement(parent) || !_isVisibleElement(parent)) {
					break;
				}
				const rect = parent.getBoundingClientRect();
				const isCompactPlayerOverlay =
					rect.width > 0 &&
					rect.height > 0 &&
					rect.width <= 280 &&
					rect.height <= 80 &&
					(rootRect
						? rect.top < rootRect.top + 160 &&
							rect.right > rootRect.right - 320 &&
							rect.left > rootRect.left - 40 &&
							rect.bottom > rootRect.top - 20
						: _isNearMainPlayer(parent));
				if (!isCompactPlayerOverlay) break;
				target = parent;
			}

			return target;
		}

		function _getDisplayAdLabels() {
			const labels = [];
			const seen = new Set();
			const playerRect = _getMainPlayerRect();
			const searchRoots = _getPlayerOverlaySearchRoots();
			if (!playerRect || searchRoots.length === 0) {
				return labels;
			}

			const directLabels = _queryWithinRoots(
				searchRoots,
				DISPLAY_AD_LABEL_SELECTOR_GROUP,
			);
			for (const directLabel of directLabels) {
				const text =
					directLabel.getAttribute?.("aria-label") ||
					directLabel.textContent ||
					"";
				if (
					!_isVisibleNearPlayerElement(directLabel, playerRect) ||
					!_looksLikeAdLabel(text)
				) {
					continue;
				}
				_pushUniqueDisplayAdLabel(
					labels,
					seen,
					_getDisplayAdLabelTarget(directLabel),
				);
			}

			const playerRoots = _queryWithinRoots(
				searchRoots,
				'[data-a-target="video-player"], [class*="video-player"], video',
			);

			for (const root of playerRoots) {
				if (!_isVisibleElement(root)) continue;
				const nodes = root.querySelectorAll(
					'span, p, [aria-label="Ad"], button[aria-label], [role="button"][aria-label]',
				);
				const rootRect = root.getBoundingClientRect();
				if (rootRect.width < 320 || rootRect.height < 180) continue;
				for (const node of nodes) {
					const text =
						node.getAttribute?.("aria-label") || node.textContent || "";
					if (
						!text ||
						text.length > 48 ||
						(!_looksLikeAdLabel(text) && !_isDisplayAdFeedbackButton(node))
					) {
						continue;
					}
					if (!_isVisibleElement(node)) continue;
					const rect = node.getBoundingClientRect();
					if (
						rect.width > 0 &&
						rect.height > 0 &&
						rect.top < rootRect.top + 140 &&
						rect.right > rootRect.right - 260
					) {
						_pushUniqueDisplayAdLabel(
							labels,
							seen,
							_getDisplayAdLabelTarget(node, rootRect),
						);
					}
				}
			}

			return labels;
		}

		function _isVisibleElement(el) {
			if (!el) return false;
			if (
				(el as HTMLElement).offsetWidth <= 0 ||
				(el as HTMLElement).offsetHeight <= 0
			)
				return false;
			const style = window.getComputedStyle(el);
			return style.display !== "none" && style.visibility !== "hidden";
		}

		function _getMainPlayerElement() {
			if (cachedMainPlayerElement !== null) {
				return cachedMainPlayerElement;
			}

			const candidates = document.querySelectorAll(
				'video, [data-a-target="video-player"]',
			);
			let bestElement = null;
			let bestArea = 0;

			for (const candidate of candidates) {
				if (!_isVisibleElement(candidate)) continue;
				const rect = candidate.getBoundingClientRect();
				const area = rect.width * rect.height;
				if (rect.width < 320 || rect.height < 180) continue;
				if (area > bestArea) {
					bestArea = area;
					bestElement = candidate;
				}
			}

			cachedMainPlayerElement = bestElement;
			return cachedMainPlayerElement;
		}

		function _getMainPlayerRect() {
			if (cachedMainPlayerRect !== null) {
				return cachedMainPlayerRect;
			}

			const player = _getMainPlayerElement();
			cachedMainPlayerRect = player ? player.getBoundingClientRect() : null;
			return cachedMainPlayerRect;
		}

		function _getMediaSourceUrl(media) {
			return String(media?.currentSrc || media?.src || "").trim();
		}

		function _getRectOverlap(startA, endA, startB, endB) {
			return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
		}

		function _isLikelyPlayerOverlayRect(
			rect,
			playerRect,
			{ allowTopBand = false } = {},
		) {
			if (!rect || !playerRect) return false;
			if (rect.width < (allowTopBand ? 140 : 80) || rect.height < 24) {
				return false;
			}
			if (rect.width > Math.max(playerRect.width * 1.08, 960)) return false;
			if (rect.height > Math.max(220, playerRect.height * 0.45)) return false;

			const horizontalOverlap = _getRectOverlap(
				rect.left,
				rect.right,
				playerRect.left,
				playerRect.right,
			);
			if (horizontalOverlap < Math.min(rect.width, playerRect.width) * 0.35) {
				return false;
			}

			const verticalOverlap = _getRectOverlap(
				rect.top,
				rect.bottom,
				playerRect.top,
				playerRect.bottom,
			);
			if (verticalOverlap <= 0) return false;

			if (allowTopBand) {
				return (
					rect.top < playerRect.top + Math.max(160, playerRect.height * 0.28) &&
					rect.bottom < playerRect.top + Math.max(220, playerRect.height * 0.42)
				);
			}

			return rect.bottom > playerRect.top + playerRect.height * 0.45;
		}

		function _markPlayerAdBannerContainer(seed, options = {}) {
			if (!seed) return null;
			const playerRect = _getMainPlayerRect();
			if (!playerRect) return null;

			let current = seed;
			for (let depth = 0; depth < 6 && current; depth += 1) {
				if (_isVisibleElement(current)) {
					const rect = current.getBoundingClientRect();
					if (_isLikelyPlayerOverlayRect(rect, playerRect, options)) {
						current.setAttribute("data-ttvab-player-ad-banner", "true");
						return current;
					}
				}

				if (depth > 0 && _isSafeElement(current)) break;
				current = current.parentElement;
			}

			return null;
		}

		function _getPlayerAdCallToActionNodes() {
			const nodes = [];
			const playerRect = _getMainPlayerRect();
			if (!playerRect) return nodes;

			const ctas = _queryWithinRoots(
				_getPlayerOverlaySearchRoots(),
				"a, button, [role='button']",
			);

			for (const cta of ctas) {
				if (!_isVisibleNearPlayerElement(cta, playerRect)) {
					continue;
				}
				const text = [
					cta.textContent || "",
					cta.getAttribute("aria-label") || "",
					cta.getAttribute("title") || "",
				]
					.join(" ")
					.replace(/\s+/g, " ")
					.trim();
				if (!PLAYER_AD_CTA_PATTERN.test(text) && !_hasAdblockText(cta)) {
					continue;
				}

				const container = _markPlayerAdBannerContainer(cta);
				if (container) {
					nodes.push(container);
				}
			}

			return _filterUniqueElements(nodes);
		}

		function _getPlayerAdBannerTextNodes() {
			const nodes = [];
			const playerRect = _getMainPlayerRect();
			if (!playerRect) return nodes;

			const candidates = _queryWithinRoots(
				_getPlayerOverlaySearchRoots(),
				"span, p, div, h1, h2, h3, [role='heading']",
			);
			for (const node of candidates) {
				if (!_isVisibleNearPlayerElement(node, playerRect)) {
					continue;
				}
				const text = (node.textContent || "").replace(/\s+/g, " ").trim();
				const hasKnownAdblockText = _hasAdblockText(node);
				if (
					text.length > 180 ||
					(!hasKnownAdblockText && text.length < 24) ||
					(!hasKnownAdblockText &&
						!PLAYER_AD_OVERLAY_TEXT_PATTERN.test(text))
				) {
					continue;
				}

				const container = _markPlayerAdBannerContainer(node, {
					allowTopBand: true,
				});
				if (container) {
					nodes.push(container);
					continue;
				}

				const rect = node.getBoundingClientRect();
				if (
					rect.width >= 220 &&
					rect.top < playerRect.top + Math.max(160, playerRect.height * 0.28) &&
					rect.bottom < playerRect.top + Math.max(220, playerRect.height * 0.42)
				) {
					node.setAttribute("data-ttvab-player-ad-banner", "true");
					nodes.push(node);
				}
			}

			return _filterUniqueElements(nodes);
		}

		function _getInferredDisplayAdLayoutWrappers() {
			const player = _getMainPlayerElement();
			const playerRect = player?.getBoundingClientRect();
			if (!player || !playerRect) return [];

			const wrappers = [];
			let current = player.parentElement;
			for (let depth = 0; depth < 6 && current; depth += 1) {
				if (_isSafeElement(current)) break;
				if (!_isVisibleElement(current)) {
					current = current.parentElement;
					continue;
				}

				const rect = current.getBoundingClientRect();
				const extraTop = Math.max(0, playerRect.top - rect.top);
				const extraLeft = Math.max(0, playerRect.left - rect.left);
				const extraRight = Math.max(0, rect.right - playerRect.right);
				const extraBottom = Math.max(0, rect.bottom - playerRect.bottom);
				const hasLargeInset =
					extraTop > 24 ||
					extraLeft > 24 ||
					extraRight > 72 ||
					extraBottom > 24;
				if (!hasLargeInset) {
					current = current.parentElement;
					continue;
				}

				if (
					rect.width > window.innerWidth * 0.92 ||
					rect.height > window.innerHeight * 0.92
				) {
					current = current.parentElement;
					continue;
				}

				const style = window.getComputedStyle(current);
				const hasBackground =
					style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
					style.backgroundColor !== "transparent";
				const hasStructuredLayout =
					style.display === "grid" ||
					style.display === "flex" ||
					style.position === "relative";
				if (!hasBackground && !hasStructuredLayout) {
					current = current.parentElement;
					continue;
				}

				wrappers.push(current);
				current = current.parentElement;
			}

			return _filterUniqueElements(wrappers);
		}

		function _getLowerThirdDisplayAdLayoutWrappers(nodes, playerRect = null) {
			const resolvedPlayerRect = playerRect || _getMainPlayerRect();
			if (!resolvedPlayerRect || !Array.isArray(nodes) || nodes.length === 0) {
				return [];
			}

			const wrappers = [];
			const seen = new Set();
			for (const seed of nodes) {
				if (!(seed instanceof Element)) continue;

				let current = seed.parentElement;
				for (let depth = 0; depth < 6 && current; depth += 1) {
					if (_isSafeElement(current)) break;
					if (!_isVisibleNearPlayerElement(current, resolvedPlayerRect)) {
						current = current.parentElement;
						continue;
					}

					const rect = current.getBoundingClientRect();
					const extraTop = Math.max(0, resolvedPlayerRect.top - rect.top);
					const extraLeft = Math.max(0, resolvedPlayerRect.left - rect.left);
					const extraRight = Math.max(0, rect.right - resolvedPlayerRect.right);
					const extraBottom = Math.max(
						0,
						rect.bottom - resolvedPlayerRect.bottom,
					);
					const hasBottomBand =
						extraBottom > 10 || rect.height > resolvedPlayerRect.height + 16;
					const hasSideInset =
						extraLeft > 24 || extraRight > 24 || extraTop > 24;
					const className =
						typeof current.className === "string" ? current.className : "";
					const hasLowerThirdMarker =
						current.id === "stream-lowerthird" ||
						current.getAttribute?.("data-test-selector") === "sda-frame" ||
						className.includes("lower-third") ||
						className.includes("stream-display-ad");
					if (!hasBottomBand && !hasSideInset && !hasLowerThirdMarker) {
						current = current.parentElement;
						continue;
					}

					if (
						rect.width >
							Math.min(
								window.innerWidth * 0.96,
								resolvedPlayerRect.width + 260,
							) ||
						rect.height >
							Math.min(
								window.innerHeight * 0.92,
								resolvedPlayerRect.height + 180,
							)
					) {
						current = current.parentElement;
						continue;
					}

					const style = window.getComputedStyle(current);
					const hasStructuredLayout =
						style.display === "grid" ||
						style.display === "flex" ||
						style.position === "relative" ||
						style.position === "absolute";
					if (!hasStructuredLayout && !hasLowerThirdMarker) {
						current = current.parentElement;
						continue;
					}

					_pushUniqueElement(wrappers, current, seen);
					current = current.parentElement;
				}
			}

			return wrappers;
		}

		function _isNearPlayerRect(el, playerRect) {
			if (!el || !playerRect) return false;

			const rect = el.getBoundingClientRect();
			const horizontalMargin = Math.max(
				120,
				Math.min(260, playerRect.width * 0.2),
			);
			const verticalMargin = Math.max(
				80,
				Math.min(180, playerRect.height * 0.2),
			);

			return !(
				rect.right < playerRect.left - horizontalMargin ||
				rect.left > playerRect.right + horizontalMargin ||
				rect.bottom < playerRect.top - verticalMargin ||
				rect.top > playerRect.bottom + verticalMargin
			);
		}

		function _isVisibleNearPlayerElement(el, playerRect = null) {
			const resolvedPlayerRect = playerRect || _getMainPlayerRect();
			return (
				Boolean(resolvedPlayerRect) &&
				_isVisibleElement(el) &&
				_isNearPlayerRect(el, resolvedPlayerRect)
			);
		}

		function _isNearMainPlayer(el, playerRect = null) {
			return _isVisibleNearPlayerElement(el, playerRect);
		}

		function _hasDirectPlayerAdUiSignal() {
			const playerRect = _getMainPlayerRect();
			if (!playerRect) return false;

			return (
				_filterUniqueElements(
					[
						..._getDisplayAdLabels(),
						..._getPlayerAdCallToActionNodes(),
						..._getPlayerAdBannerTextNodes(),
						..._queryUniqueElements(DISPLAY_AD_SHELL_SELECTORS),
						..._queryUniqueElements(LOWER_THIRD_DISPLAY_AD_SELECTORS),
					],
					(el) => _isVisibleNearPlayerElement(el, playerRect),
				).length > 0
			);
		}

		function _isDirectPlayerAdMedia(media, playerRect = null) {
			if (!(media instanceof HTMLMediaElement)) return false;
			if (!media.isConnected || media.ended) return false;

			const src = _getMediaSourceUrl(media);
			if (!DIRECT_PLAYER_AD_MEDIA_URL_PATTERN.test(src)) return false;

			return _isVisibleNearPlayerElement(
				media,
				playerRect || _getMainPlayerRect(),
			);
		}

		function _suppressDirectPlayerAdMedia(media) {
			if (!_isDirectPlayerAdMedia(media)) return false;

			try {
				if (typeof _pausePlaybackTarget === "function") {
					_pausePlaybackTarget(media);
				} else {
					media.pause();
				}
				media.defaultMuted = true;
				media.muted = true;
				media.volume = 0;
				if (Number.isFinite(media.duration) && media.duration > 0) {
					media.currentTime = media.duration;
				}
			} catch {}

			_hideElement(media);
			media.setAttribute("data-ttvab-player-ad-media", "true");
			return true;
		}

		function _resumePlaybackAfterDirectPlayerAd() {
			const currentContext = _getPlaybackContextFromUrl(window.location.href);
			const primaryMedia =
				typeof _getPrimaryMediaElement === "function"
					? _getPrimaryMediaElement()
					: null;
			const playerState =
				typeof _getPlayerAndState === "function"
					? _getPlayerAndState()
					: { player: null };
			const player = playerState?.player || null;
			const shouldReloadPrimary =
				primaryMedia instanceof HTMLMediaElement &&
				DIRECT_PLAYER_AD_MEDIA_URL_PATTERN.test(
					_getMediaSourceUrl(primaryMedia),
				);
			const didRecentlyChangePlaybackContext =
				lastPlaybackContextChangeAt > 0 &&
				Date.now() - lastPlaybackContextChangeAt < 1500;

			if (shouldReloadPrimary && typeof _doPlayerTask === "function") {
				_schedulePlaybackRecoveryTimeout(
					() => {
						_doPlayerTask(false, true, {
							reason: didRecentlyChangePlaybackContext
								? "route-change"
								: "ad-recovery",
						});
					},
					didRecentlyChangePlaybackContext ? 150 : 0,
					currentContext.ChannelName,
					currentContext.MediaKey,
				);
				return;
			}

			const resume = () => {
				if (typeof _playPlaybackTarget === "function") {
					_playPlaybackTarget(
						primaryMedia,
						currentContext.ChannelName,
						currentContext.MediaKey,
					);
					_playPlaybackTarget(
						player,
						currentContext.ChannelName,
						currentContext.MediaKey,
					);
					return;
				}
				try {
					primaryMedia?.play?.();
				} catch {}
				try {
					player?.play?.();
				} catch {}
			};

			_schedulePlaybackRecoveryTimeout(
				resume,
				0,
				currentContext.ChannelName,
				currentContext.MediaKey,
			);
			_schedulePlaybackRecoveryTimeout(
				resume,
				120,
				currentContext.ChannelName,
				currentContext.MediaKey,
			);
			_schedulePlaybackRecoveryTimeout(
				resume,
				350,
				currentContext.ChannelName,
				currentContext.MediaKey,
			);
		}

		function _collapseDirectPlayerAdMedia() {
			const currentContext = _getPlaybackContextFromUrl(window.location.href);
			if (
				currentContext.MediaType !== "vod" &&
				currentContext.MediaType !== "live"
			) {
				_resetDirectPlayerAdMediaState();
				return false;
			}

			const playerRect = _getMainPlayerRect();
			if (!playerRect) {
				_resetDirectPlayerAdMediaState();
				return false;
			}

			const adMediaNodes = [];
			for (const media of document.querySelectorAll("video, audio")) {
				if (_isDirectPlayerAdMedia(media, playerRect)) {
					adMediaNodes.push(media);
				}
			}
			if (adMediaNodes.length === 0) {
				_resetDirectPlayerAdMediaState();
				return false;
			}

			const hasUiSignal = _hasDirectPlayerAdUiSignal();
			const hasWorkerAdState = Boolean(
				__TTVAB_STATE__.CurrentAdChannel || __TTVAB_STATE__.CurrentAdMediaKey,
			);
			if (!hasUiSignal && !hasWorkerAdState) {
				_resetDirectPlayerAdMediaState();
				return false;
			}

			const signature = adMediaNodes
				.map((media) => _getMediaSourceUrl(media))
				.sort()
				.join("|");
			if (signature !== activeDirectPlayerAdMediaSignature) {
				activeDirectPlayerAdMediaSignature = signature;
				didCountCurrentDirectPlayerAdMedia = false;
			}

			const didSuppressAny = adMediaNodes.some(_suppressDirectPlayerAdMedia);
			if (!didSuppressAny) return false;

			if (!didCountCurrentDirectPlayerAdMedia) {
				didCountCurrentDirectPlayerAdMedia = true;
				if (
					!__TTVAB_STATE__.CurrentAdChannel &&
					!__TTVAB_STATE__.CurrentAdMediaKey
				) {
					_incrementAdsBlocked(
						currentContext.ChannelName,
						currentContext.MediaKey,
					);
				}
				_incrementDomCleanup("direct-media-ad");
				_log(
					"Direct Amazon MP4 ad detected near the player, suppressing injected media",
					"warning",
				);
			}

			_resumePlaybackAfterDirectPlayerAd();
			return true;
		}

		function _looksLikeAdLabel(text) {
			const normalized = String(text || "")
				.replace(/\u200B|\u200C|\u200D|\uFEFF|\u00AD/g, "")
				.replace(/\s+/g, " ")
				.trim()
				.toLowerCase();
			return (
				normalized === "ad" ||
				normalized === "ad 0" ||
				/^ad\s+[0-9:]+(?:\s+of\s+\d+)?(?:\s*ⓘ)?$/.test(normalized) ||
				/^ad\s*ⓘ$/.test(normalized)
			);
		}

		function _hasOfflinePageSignal() {
			for (const selector of OFFLINE_PAGE_SIGNAL_SELECTORS) {
				const el = document.querySelector(selector);
				if (el && _isVisibleElement(el)) {
					return true;
				}
			}

			let checked = 0;
			const nodes = document.querySelectorAll("span, p");
			for (const node of nodes) {
				if (checked++ > 120) break;
				if (node.childElementCount > 0) continue;
				const text = (node.textContent || "").trim();
				if (!text || text.length > 12) continue;
				if (text.toUpperCase() !== "OFFLINE") continue;
				if (!_isVisibleElement(node)) continue;
				const rect = node.getBoundingClientRect();
				if (rect.top < window.innerHeight * 0.6) {
					return true;
				}
			}

			return false;
		}

		function _collapsePromotedPageAd() {
			const hasPromotedPageSignal =
				_hasOfflinePageSignal() ||
				Array.from(document.querySelectorAll("h1, h2, p, span, a, button"))
					.slice(0, 180)
					.some((node) => {
						if (!(node instanceof HTMLElement)) return false;
						if (!_isVisibleElement(node)) return false;
						const text = _normalizeDomCleanupSignatureText(
							node.textContent || "",
						);
						return (
							text.includes("taking an ad break") ||
							text.includes("stick around to support the stream") ||
							text.includes("stick around to support the channel") ||
							text.includes("click here for turbo") ||
							(text.includes("all of the streams") && text.includes("turbo")) ||
							(text.includes("turbo") && text.includes("ad-free viewing"))
						);
					});
			if (!hasPromotedPageSignal) {
				isPromotedPageAdActive = false;
				return false;
			}

			const ctas = document.querySelectorAll("a, button");
			for (const cta of ctas) {
				if (!_isVisibleElement(cta)) continue;
				const text = (cta.textContent || "").replace(/\s+/g, " ").trim();
				if (!PROMOTED_PAGE_CTA_PATTERN.test(text)) continue;

				let card = cta;
				for (let depth = 0; depth < 6 && card; depth += 1) {
					card = card.parentElement;
					if (!card || _isSafeElement(card)) break;

					const rect = card.getBoundingClientRect();
					if (
						rect.width < 180 ||
						rect.height < 100 ||
						rect.width > window.innerWidth * 0.98 ||
						rect.height > window.innerHeight * 0.98
					) {
						continue;
					}

					const hasAdLabel = Array.from(
						card.querySelectorAll("span, p, div"),
					).some((node) => {
						if (!_isVisibleElement(node)) return false;
						return _looksLikeAdLabel(node.textContent || "");
					});

					const normalizedCardText = _normalizeDomCleanupSignatureText(
						card.textContent || "",
					);
					const hasTurboBreakText =
						normalizedCardText.includes("taking an ad break") ||
						normalizedCardText.includes("stick around to support the stream") ||
						normalizedCardText.includes("stick around to support the channel") ||
						normalizedCardText.includes("click here for turbo") ||
						(normalizedCardText.includes("all of the streams") &&
							normalizedCardText.includes("turbo")) ||
						(normalizedCardText.includes("turbo") &&
							normalizedCardText.includes("ad-free viewing"));

					if (!hasAdLabel && !hasTurboBreakText) continue;

					if (!isPromotedPageAdActive) {
						isPromotedPageAdActive = true;
						if (
							!__TTVAB_STATE__.CurrentAdChannel &&
							!__TTVAB_STATE__.CurrentAdMediaKey
						) {
							const currentContext = _getPlaybackContextFromUrl(
								window.location.href,
							);
							_incrementAdsBlocked(
								currentContext.ChannelName,
								currentContext.MediaKey,
							);
						}
						_log("Offline/promoted page ad detected, hiding card", "warning");
					}

					_hideElement(card);
					_incrementDomCleanup("promoted-card", card);
					return true;
				}
			}

			isPromotedPageAdActive = false;
			return false;
		}

		function _collapseDisplayAdShell() {
			const playerRect = _getMainPlayerRect();
			if (!playerRect) return false;
			const searchRoots = _getPlayerOverlaySearchRoots();
			const isVisibleNearPlayer = (el) =>
				_isVisibleNearPlayerElement(el, playerRect);
			const adBanners = _queryVisibleNearPlayerWithinRoots(
				searchRoots,
				['[data-test-selector="ad-banner"]'],
				playerRect,
			);
			const explicitDisplaySelectorNodes = _queryVisibleNearPlayerWithinRoots(
				searchRoots,
				EXPLICIT_DISPLAY_AD_SELECTORS,
				playerRect,
			);
			const lowerThirdDisplayAdNodes = _queryVisibleNearPlayerWithinRoots(
				searchRoots,
				LOWER_THIRD_DISPLAY_AD_SELECTORS,
				playerRect,
			);
			const displayShellNodes = _queryVisibleNearPlayerWithinRoots(
				searchRoots,
				DISPLAY_AD_SHELL_SELECTORS,
				playerRect,
			);
			const pipContainers = _queryVisibleNearPlayerWithinRoots(
				searchRoots,
				PIP_SELECTORS,
				playerRect,
			);
			const layoutRoots = _queryVisibleNearPlayerWithinRoots(
				searchRoots,
				STREAM_DISPLAY_LAYOUT_SELECTORS,
				playerRect,
			);
			let playerAdCallToActionNodes = [];
			let playerAdBannerTextNodes = [];
			let adLabels = [];

			if (!isDisplayAdShellActive) {
				const hasSelectorPreflightSignal =
					adBanners.length > 0 ||
					explicitDisplaySelectorNodes.length > 0 ||
					lowerThirdDisplayAdNodes.length > 0 ||
					displayShellNodes.length > 0 ||
					pipContainers.length > 0 ||
					layoutRoots.length > 0;
				if (!hasSelectorPreflightSignal) {
					playerAdCallToActionNodes = _getPlayerAdCallToActionNodes();
					playerAdBannerTextNodes = _getPlayerAdBannerTextNodes();
					adLabels = _getDisplayAdLabels();
					if (
						playerAdCallToActionNodes.length === 0 &&
						playerAdBannerTextNodes.length === 0 &&
						adLabels.length === 0
					) {
						return false;
					}
				}
			}

			if (playerAdCallToActionNodes.length === 0) {
				playerAdCallToActionNodes = _getPlayerAdCallToActionNodes();
			}
			if (playerAdBannerTextNodes.length === 0) {
				playerAdBannerTextNodes = _getPlayerAdBannerTextNodes();
			}
			const explicitDisplayAdNodes = _filterUniqueElements(
				[
					...explicitDisplaySelectorNodes,
					...playerAdCallToActionNodes,
					...playerAdBannerTextNodes,
				],
				isVisibleNearPlayer,
			);
			if (adLabels.length === 0) {
				adLabels = _getDisplayAdLabels();
			}
			const hasAdLabel = adLabels.length > 0;
			const hasDisplayAdCta = playerAdCallToActionNodes.length > 0;
			const hasOverlayBanner = playerAdBannerTextNodes.length > 0;
			const lowerThirdLayoutWrappers = _getLowerThirdDisplayAdLayoutWrappers(
				lowerThirdDisplayAdNodes,
				playerRect,
			);
			const shouldProbeInferredLayoutWrappers =
				hasAdLabel ||
				hasDisplayAdCta ||
				hasOverlayBanner ||
				adBanners.length > 0 ||
				explicitDisplayAdNodes.length > 0 ||
				displayShellNodes.length > 0 ||
				lowerThirdDisplayAdNodes.length > 0;
			const inferredLayoutWrappers = shouldProbeInferredLayoutWrappers
				? _getInferredDisplayAdLayoutWrappers()
				: [];
			const hasExplicitShellLayoutSignal =
				displayShellNodes.length > 0 ||
				pipContainers.length > 0 ||
				layoutRoots.length > 0;
			const hasInferredDisplayAdSignal =
				hasAdLabel &&
				(hasExplicitShellLayoutSignal || inferredLayoutWrappers.length > 0);
			const hasExplicitDisplayAdSignal =
				adBanners.length > 0 ||
				explicitDisplayAdNodes.length > 0 ||
				(hasDisplayAdCta && hasInferredDisplayAdSignal);
			const hasDisplayAdSignal =
				hasExplicitDisplayAdSignal || hasInferredDisplayAdSignal;

			adLabels.forEach((el) => {
				_hideElement(el);
			});

			const now = Date.now();
			if (hasDisplayAdSignal) {
				lastDisplayAdShellSignalAt = now;
			}

			if (!hasDisplayAdSignal) {
				const allowRecentClassArtifactCleanup =
					isDisplayAdShellActive ||
					(now - lastDisplayAdShellSignalAt <
						STALE_DISPLAY_ARTIFACT_RECENT_SIGNAL_MS &&
						lastDisplayAdShellSignalAt > 0);
				_cleanupStaleDisplayAdShell(
					displayShellNodes,
					pipContainers,
					layoutRoots,
					[],
					{ allowClassArtifacts: allowRecentClassArtifactCleanup },
				);
				isDisplayAdShellActive = false;
				didCountCurrentDisplayAdShellCleanup = false;
				didCountCurrentDisplayAdShellAd = false;
				pendingDisplayAdShellSince = 0;
				pendingDisplayAdShellSignature = null;
				return false;
			}
			_resetStaleDisplayArtifactCleanupDeduper();

			const signalSignature = [
				adBanners.length,
				explicitDisplayAdNodes.length,
				displayShellNodes.length,
				pipContainers.length,
				layoutRoots.length,
				lowerThirdLayoutWrappers.length,
				hasDisplayAdCta ? 1 : 0,
				hasOverlayBanner ? 1 : 0,
				hasExplicitDisplayAdSignal ? inferredLayoutWrappers.length : 0,
				hasInferredDisplayAdSignal ? 1 : 0,
				hasAdLabel ? 1 : 0,
			].join(":");
			if (!isDisplayAdShellActive) {
				if (pendingDisplayAdShellSignature !== signalSignature) {
					pendingDisplayAdShellSignature = signalSignature;
					pendingDisplayAdShellSince = now;
					return false;
				}

				if (now - pendingDisplayAdShellSince < 350) {
					return false;
				}
			}

			if (!isDisplayAdShellActive) {
				isDisplayAdShellActive = true;
				didCountCurrentDisplayAdShellCleanup = false;
				didCountCurrentDisplayAdShellAd = false;
				pendingDisplayAdShellSince = 0;
				pendingDisplayAdShellSignature = null;
				if (!hasExplicitDisplayAdSignal) {
					_incrementDomCleanup("display-shell-inferred");
					didCountCurrentDisplayAdShellCleanup = true;
					_log(
						"Display ad shell inferred: counting DOM cleanup and resetting layout",
						"info",
					);
				}
			}

			if (hasExplicitDisplayAdSignal && !didCountCurrentDisplayAdShellCleanup) {
				_incrementDomCleanup("display-shell");
				didCountCurrentDisplayAdShellCleanup = true;
			}

			if (hasExplicitDisplayAdSignal && !didCountCurrentDisplayAdShellAd) {
				didCountCurrentDisplayAdShellAd = true;
				if (
					!__TTVAB_STATE__.CurrentAdChannel &&
					!__TTVAB_STATE__.CurrentAdMediaKey
				) {
					const currentContext = _getPlaybackContextFromUrl(
						window.location.href,
					);
					_incrementAdsBlocked(
						currentContext.ChannelName,
						currentContext.MediaKey,
					);
				}
				_log(
					"Display ad shell confirmed: counting blocked ad and collapsing shell",
					"warning",
				);
			}

			for (const shellNode of [
				...explicitDisplayAdNodes,
				...displayShellNodes,
			]) {
				if (shellNode.querySelector?.("video")) {
					_resetStreamDisplayLayout(shellNode);
				} else {
					_hideElement(shellNode);
				}
			}

			layoutRoots.forEach((el) => {
				_resetStreamDisplayLayout(el);
			});
			lowerThirdLayoutWrappers.forEach((el) => {
				_resetStreamDisplayLayout(el);
			});
			inferredLayoutWrappers.forEach((el) => {
				_resetStreamDisplayLayout(el);
			});
			pipContainers.forEach((el) => {
				_hideElement(el);
			});

			return true;
		}

		function _hasAdblockText(el) {
			const text = (el.textContent || "").toLowerCase();
			return (
				text.includes("allow twitch ads") ||
				text.includes("consider turbo") ||
				text.includes("try turbo") ||
				text.includes("click here for turbo") ||
				text.includes("taking an ad break") ||
				text.includes("stick around to support the stream") ||
				text.includes("commercials") ||
				text.includes("whitelist") ||
				(text.includes("turbo") && text.includes("ad-free viewing")) ||
				(text.includes("all of the streams") && text.includes("turbo")) ||
				text.includes("ad blocker") ||
				(text.includes("fully enjoy twitch") &&
					(text.includes("ad block") || text.includes("ad blocker"))) ||
				(text.includes("support") &&
					(text.includes("ads") || text.includes("ad block"))) ||
				(text.includes("disable") &&
					(text.includes("extension") || text.includes("ad block"))) ||
				(text.includes("viewers watch ads") && text.includes("turbo"))
			);
		}

		const SAFELIST_SELECTORS = [
			'[data-a-target="chat-scroller"]',
			'[data-a-target="right-column-chat-bar"]',
			'[data-test-selector="chat-room-component"]',
			'[class*="chat-room"]',
			'[class*="chat-shell"]',
			'[class*="right-column"]',
			'[class*="RightColumn"]',
			'[class*="ChatShell"]',
			'[class*="ChatRoom"]',
			'[class*="video-player"]',
			'[class*="VideoPlayer"]',
			'[data-a-target="video-player"]',
			"video",
		];
		const SAFELIST_SELECTOR_GROUP = SAFELIST_SELECTORS.join(", ");
		const POPUP_SCAN_SELECTORS = [
			'div[class*="ScAttach"][class*="ScBalloon"]',
			'div[class*="tw-balloon"]',
			'div[class*="consent"]',
			'[data-a-target="consent-banner"]',
			'[data-test-selector="ad-banner"]',
			'div[class*="Layout"][class*="Overlay"]',
		];
		const POPUP_ROOT_SELECTORS = [
			...POPUP_SCAN_SELECTORS,
			'div[style*="position: fixed"]',
			'div[style*="position:fixed"]',
			'div[style*="z-index"]',
			'div[role="dialog"]',
			'[aria-modal="true"]',
			'div[class*="Modal"]',
			'div[class*="consent"]',
			'div[class*="Consent"]',
			'div[class*="Overlay"]',
			'div[class*="Balloon"]',
		];
		const POPUP_SCAN_SELECTOR_GROUP = POPUP_SCAN_SELECTORS.join(", ");
		const POPUP_MUTATION_SIGNAL_SELECTOR_GROUP = [
			POPUP_SCAN_SELECTOR_GROUP,
			'[role="dialog"]',
			'[aria-modal="true"]',
		].join(", ");
		const POPUP_TEXT_NODE_SELECTOR =
			'button, [role="button"], a, div[class*="Button"], h1, h2, h3, h4, div[class*="Header"], p, span';

		function _isSafeElement(el) {
			if (!el) return false;
			try {
				if (el.matches?.(SAFELIST_SELECTOR_GROUP)) return true;
			} catch {}
			return false;
		}

		function _isCandidatePopupRoot(el) {
			if (!(el instanceof HTMLElement) || _isSafeElement(el)) return false;
			if (el.hasAttribute("data-ttvab-blocked")) return false;
			if (el.closest?.('[class*="chat"]') || el.closest?.('[class*="Chat"]')) {
				return false;
			}
			if (el.querySelector("video")) return false;

			try {
				const style = window.getComputedStyle(el);
				const position = String(style.position || "").toLowerCase();
				const backgroundColor = String(style.backgroundColor || "");
				const zIndex = Number.parseInt(style.zIndex, 10);
				const className = typeof el.className === "string" ? el.className : "";
				const isOverlay = position === "fixed" || position === "absolute";
				const hasBackground =
					backgroundColor !== "rgba(0, 0, 0, 0)" &&
					backgroundColor !== "transparent";
				const isLarge = el.offsetWidth > 200 && el.offsetHeight > 100;
				const hasZIndex = Number.isFinite(zIndex) && zIndex > 100;
				const isPopupClass =
					(className.includes("ScAttach") && className.includes("Balloon")) ||
					className.includes("Modal") ||
					className.includes("consent") ||
					className.includes("Consent") ||
					(className.includes("Overlay") &&
						!className.includes("Column") &&
						!className.includes("Chat")) ||
					(className.includes("Layer") && className.includes("Balloon"));

				return (
					(isOverlay || hasZIndex || isPopupClass) && (hasBackground || isLarge)
				);
			} catch {}

			return false;
		}

		function _hasPopupMutationSignal(node) {
			if (!(node instanceof Element) || _isSafeElement(node)) return false;

			try {
				if (node.matches?.(POPUP_MUTATION_SIGNAL_SELECTOR_GROUP)) {
					return true;
				}
				if (
					node.childElementCount > 0 &&
					node.querySelector?.(POPUP_MUTATION_SIGNAL_SELECTOR_GROUP)
				) {
					return true;
				}
			} catch {}

			try {
				const className =
					typeof node.className === "string" ? node.className : "";
				if (
					className.includes("Modal") ||
					className.includes("consent") ||
					className.includes("Consent") ||
					((className.includes("Overlay") || className.includes("Balloon")) &&
						!className.includes("Chat"))
				) {
					return true;
				}

				const dataTarget = String(
					node.getAttribute?.("data-a-target") ||
						node.getAttribute?.("data-test-selector") ||
						"",
				).toLowerCase();
				if (
					dataTarget.includes("consent") ||
					dataTarget.includes("ad-banner") ||
					dataTarget.includes("display-ad")
				) {
					return true;
				}

				const role = String(node.getAttribute?.("role") || "").toLowerCase();
				const ariaModal = String(
					node.getAttribute?.("aria-modal") || "",
				).toLowerCase();
				return role === "dialog" || ariaModal === "true";
			} catch {}

			return false;
		}

		function _getPopupRootCandidates() {
			const seen = new Set<HTMLElement>();
			const candidates = [];

			for (const selector of POPUP_ROOT_SELECTORS) {
				try {
					const elements = document.querySelectorAll(selector);
					for (const el of elements) {
						if (!(el instanceof HTMLElement)) continue;
						if (seen.has(el) || !_isCandidatePopupRoot(el)) continue;
						seen.add(el);
						candidates.push(el);
					}
				} catch {}
			}

			return candidates;
		}

		function _rootContainsAdblockText(root) {
			if (!root || _isSafeElement(root)) return false;
			if (_hasAdblockText(root)) return true;

			try {
				const detectionNodes = root.querySelectorAll(POPUP_TEXT_NODE_SELECTOR);
				for (const node of detectionNodes) {
					if (!(node instanceof HTMLElement)) continue;
					if (node.tagName === "SPAN" && (node.textContent || "").length < 10) {
						continue;
					}
					if (
						node.hasAttribute("data-ttvab-blocked") ||
						_isSafeElement(node) ||
						node.closest('[class*="chat"]') ||
						node.closest('[class*="Chat"]')
					) {
						continue;
					}
					if (_hasAdblockText(node)) return true;
				}
			} catch {}

			return false;
		}

		function _resolvePopupHideRoot(root) {
			if (!(root instanceof HTMLElement)) return null;
			if (root.hasAttribute("data-ttvab-blocked")) return null;

			let candidate = _isCandidatePopupRoot(root) ? root : null;
			let current = root;
			for (let depth = 0; depth < 8 && current; depth += 1) {
				if (_isSafeElement(current)) break;
				if (current.hasAttribute("data-ttvab-blocked")) return null;
				if (_isCandidatePopupRoot(current)) {
					candidate = current;
				}
				current = current.parentElement;
			}

			return candidate || root;
		}

		function _hidePopupRoot(root, logMessage = "Hiding popup overlay") {
			const hideRoot = _resolvePopupHideRoot(root);
			if (!hideRoot || _isSafeElement(hideRoot)) return false;
			const didCount = _incrementDomCleanup("overlay-ad", hideRoot);
			if (didCount) {
				_log(logMessage, "success");
			}
			_hideElement(hideRoot);
			_recordPopupCleanup();
			return true;
		}

		function _collapseAdblockPopup(options: { force?: boolean } = {}) {
			const force = options.force === true;
			if (!_shouldRunPopupFallback(force)) {
				return false;
			}
			lastPopupFallbackScanAt = Date.now();

			for (const selector of POPUP_SCAN_SELECTORS) {
				try {
					const elements = document.querySelectorAll(selector);
					for (const el of elements) {
						if (_hasAdblockText(el)) {
							return _hidePopupRoot(el, "Hiding popup by selector");
						}
					}
				} catch {}
			}

			for (const popupRoot of _getPopupRootCandidates()) {
				if (!_rootContainsAdblockText(popupRoot)) continue;
				return _hidePopupRoot(
					popupRoot,
					`Hiding popup: ${popupRoot.className || popupRoot.tagName}`,
				);
			}

			return false;
		}

		function _scanAndRemove(options: { force?: boolean } = {}) {
			const force = options.force === true;
			if (!_isDomCleanupEnabled()) {
				return false;
			}

			let didCleanup = false;

			if (_collapseDirectPlayerAdMedia()) {
				didCleanup = true;
			}

			if (_collapseDisplayAdShell()) {
				didCleanup = true;
			}

			if (_collapsePromotedPageAd()) {
				didCleanup = true;
			}

			if (_collapseAdblockPopup({ force })) {
				didCleanup = true;
			}

			return didCleanup;
		}

		function _isDocumentHidden() {
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
			return document.hidden;
		}

		function _runScan(force = false) {
			_resetPlayerDetectionCaches();
			const now = Date.now();
			if (!force && now - lastScanAt < 250) {
				return false;
			}
			lastScanAt = now;
			return _scanAndRemove({ force });
		}

		function _queueScan(delay = 0, force = false) {
			scheduledScanForce = scheduledScanForce || force;
			if (scheduledScanTimer) return;

			scheduledScanTimer = setTimeout(
				() => {
					scheduledScanTimer = null;
					const nextForce = scheduledScanForce;
					scheduledScanForce = false;
					const waitMs = Math.max(0, 250 - (Date.now() - lastScanAt));
					if (!nextForce && waitMs > 0) {
						_queueScan(waitMs, false);
						return;
					}
					_runScan(nextForce);
				},
				Math.max(0, delay),
			);
		}

		function _shouldScanForMutationNode(node) {
			if (!(node instanceof Element)) return false;

			try {
				if (node.closest?.(MUTATION_NOISE_SELECTOR_GROUP)) return false;
			} catch {}

			try {
				if (node.matches?.(RELEVANT_MUTATION_SELECTOR)) {
					return true;
				}
				if (
					node instanceof HTMLMediaElement ||
					node instanceof HTMLIFrameElement
				) {
					return true;
				}
				if (
					node.childElementCount > 0 &&
					node.closest?.(MUTATION_PLAYER_CONTAINER_SELECTOR_GROUP)
				) {
					return true;
				}
			} catch {}

			try {
				const className =
					typeof node.className === "string" ? node.className : "";
				const ariaLabel = String(node.getAttribute?.("aria-label") || "")
					.replace(/\s+/g, " ")
					.trim();
				const dataSignal = String(
					node.getAttribute?.("data-a-target") ||
						node.getAttribute?.("data-test-selector") ||
						"",
				);
				const inlinePosition = String(
					(node as HTMLElement).style?.position || "",
				).toLowerCase();
				if (
					MUTATION_OVERLAY_CLASS_PATTERN.test(className) ||
					MUTATION_AD_SIGNAL_PATTERN.test(ariaLabel) ||
					MUTATION_AD_SIGNAL_PATTERN.test(dataSignal)
				) {
					return true;
				}
				if (
					(inlinePosition === "fixed" || inlinePosition === "absolute") &&
					node.closest?.(MUTATION_PLAYER_CONTAINER_SELECTOR_GROUP)
				) {
					return true;
				}
			} catch {}

			return false;
		}

		_cleanupAllKnownDisplayArtifacts();
		if (_runScan(true)) {
			_log("Popup removed on initial scan", "success");
		}

		_onInternalMessage("ttvab-toggle", (detail) => {
			const safeDetail = _getTrustedBridgeMessageDetail(detail);
			if (typeof safeDetail?.enabled !== "boolean") return;
			if (!safeDetail.enabled) {
				_resetDomCleanupDebounce();
				_resetDisplayAdShellState();
				_resetStaleDisplayArtifactCleanupDeduper();
				_clearPendingRoutePlayerResync();
				_clearPendingRouteScans();
				return;
			}
			if (_isDomCleanupEnabled()) {
				_queueScan(0, true);
			}
		});

		_onInternalMessage("ttvab-init-dom-ads-count", () => {
			if (_isDomCleanupEnabled()) {
				_queueScan(0, true);
			}
		});

		_onInternalMessage("ttvab-ad-blocked", (detail) => {
			const safeDetail = _getTrustedBridgeMessageDetail(detail);
			if (!Number.isFinite(safeDetail?.count)) return;
			const currentContext = _getPlaybackContextFromUrl(window.location.href);
			const eventContext = _normalizePlaybackContext({
				MediaKey: safeDetail.pageMediaKey || safeDetail.mediaKey || null,
				ChannelName: safeDetail.pageChannel || safeDetail.channel || null,
				VodID: safeDetail.vodID || null,
			});
			if (eventContext.MediaKey) {
				if (eventContext.MediaKey !== currentContext.MediaKey) {
					return;
				}
			} else if (
				eventContext.ChannelName &&
				eventContext.ChannelName !== currentContext.ChannelName
			) {
				return;
			}
			_markIdleScanInterest();
			if (_isDocumentHidden()) {
				return;
			}
			_runScan(true);
			setTimeout(() => _queueScan(0, true), 120);
			setTimeout(() => _queueScan(0, true), 300);
		});

		window.addEventListener("popstate", () => _handleRouteChange(), true);
		window.addEventListener("hashchange", () => _handleRouteChange(), true);

		let debounceTimer = null;
		let lastImmediateScan = 0;
		const observer = new MutationObserver((mutations) => {
			_resetPlayerDetectionCaches();
			let shouldScan = false;
			let shouldRunPopupScan = false;
			const considerMutationNode = (node) => {
				if (_hasPopupMutationSignal(node)) {
					shouldRunPopupScan = true;
				}
				if (_shouldScanForMutationNode(node)) {
					shouldScan = true;
					return true;
				}
				return false;
			};
			for (const mutation of mutations) {
				if (considerMutationNode(mutation.target)) {
					break;
				}
				for (const nodes of [mutation.addedNodes, mutation.removedNodes]) {
					for (const node of nodes) {
						if (considerMutationNode(node)) {
							break;
						}
					}
					if (shouldScan) break;
				}
				if (shouldScan) break;
			}

			if (shouldRunPopupScan) {
				_markPopupScanInterest();
				shouldScan = true;
			}
			if (!shouldScan) return;
			_markIdleScanInterest();

			if (_isDocumentHidden()) {
				if (_handleRouteChange()) {
					if (debounceTimer) {
						clearTimeout(debounceTimer);
						debounceTimer = null;
					}
					lastImmediateScan = Date.now();
					return;
				}

				if (debounceTimer) clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					if (!_isDocumentHidden()) {
						_queueScan(0);
					}
					debounceTimer = null;
				}, 750);
				return;
			}

			if (_handleRouteChange()) {
				if (debounceTimer) {
					clearTimeout(debounceTimer);
					debounceTimer = null;
				}
				lastImmediateScan = Date.now();
				return;
			}

			const now = Date.now();
			if (now - lastImmediateScan > 250) {
				lastImmediateScan = now;
				_queueScan(0);
			}

			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				_queueScan(0);
				debounceTimer = null;
			}, 120);
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
		});

		function _scheduleIdleScan() {
			const delay = _getIdleScanDelay();
			setTimeout(() => {
				const didRouteChange = _handleRouteChange();
				if (!didRouteChange && !_isDocumentHidden() && !scheduledScanTimer) {
					_recordIdleScanResult(_runScan(false));
				}
				_scheduleIdleScan();
			}, delay);
		}
		_scheduleIdleScan();

		_log("Popup blocker active", "success");
	}

	_initPopupBlocker();
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

	_onInternalMessage("ttvab-init-dom-ads-count", (detail) => {
		const safeDetail = _getTrustedBridgeMessageDetail(detail);
		if (!Number.isFinite(safeDetail?.count)) return;
		__TTVAB_STATE__.HasResolvedDomAdsCountState = true;
		const restoredCount = _normalizeCounterValue(safeDetail.count);
		if (_S.domAdsBlocked === restoredCount) return;
		_S.domAdsBlocked = restoredCount;
		_log(`Restored DOM cleanup count: ${_S.domAdsBlocked}`, "info");
	});

	_syncStoredDeviceId();
	if (typeof _hookRevokeObjectURL === "function") {
		_hookRevokeObjectURL();
	}
	_hookWorker();
	_hookMainFetch();
	_initToggleListener();
	_sendBridgeMessage("ttvab-request-state");
	_blockAntiAdblockPopup();
	_initAchievementListener();

	_hookVisibilityState();
	_monitorPlaybackIntent();
	if (_C.BUFFERING_FIX) {
		_monitorPlayerBuffering();
	}

	_showWelcome();
	_showDonation();

	_log("Initialized successfully", "success");
}
