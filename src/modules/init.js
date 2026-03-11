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

function _getTrustedBridgeMessageData(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value;
}

function _getTrustedBridgeMessageDetail(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value;
}

function _initToggleListener() {
	window.addEventListener("message", (e) => {
		if (e.source !== window) return;
		const message = _getTrustedBridgeMessageData(e.data);
		const detail = _getTrustedBridgeMessageDetail(message?.detail);
		if (
			message?.type !== "ttvab-toggle" ||
			typeof detail?.enabled !== "boolean"
		) {
			return;
		}
		const enabled = detail.enabled;
		if (__TTVAB_STATE__.IsAdStrippingEnabled === enabled) return;
		__TTVAB_STATE__.IsAdStrippingEnabled = enabled;
		_broadcastWorkers({ key: "UpdateToggleState", value: enabled });
		_log(
			`Ad blocking ${enabled ? "enabled" : "disabled"}`,
			enabled ? "success" : "warning",
		);
	});
}

function _blockAntiAdblockPopup() {
	let lastBlockTime = 0;
	let isDisplayAdShellActive = false;
	let isPromotedPageAdActive = false;
	let didCountCurrentDisplayAdShell = false;
	let pendingDisplayAdShellSince = 0;
	let pendingDisplayAdShellSignature = null;
	let lastPathname = window.location.pathname;
	const EXPLICIT_DISPLAY_AD_SELECTORS = [
		'div[data-test-selector="ad-banner"]',
		'div[data-test-selector="display-ad"]',
		'[data-a-target="ads-banner"]',
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
		/^(learn more|shop now|watch now|play now|install|download|get offer|see more)$/i;
	const PLAYER_AD_CTA_PATTERN =
		/^(learn more|shop now|watch now|play now|get offer|see more|see details|install|download)$/i;

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
                div[data-test-selector="ad-banner"],
                div[data-test-selector="display-ad"],
                div[data-a-target="ads-banner"],
                div[data-a-target="consent-banner"] {
                    display: none !important;
                    visibility: hidden !important;
                }
            `;
			styleMount.appendChild(style);
		}

		function _incrementDomCleanup(kind) {
			const now = Date.now();
			if (now - lastBlockTime < 1000) return;
			lastBlockTime = now;

			const channel = _getCurrentChannelName();
			_incrementDomAdsBlocked(kind, channel);
			_log(`DOM ad cleanup (${kind}) total: ${_S.domAdsBlocked}`, "success");
		}

		function _getCurrentChannelName() {
			const match = window.location.pathname.match(/^\/([^/?#]+)/);
			const candidate = match?.[1] || null;
			if (!candidate) return null;
			const reserved = new Set([
				"browse",
				"directory",
				"downloads",
				"drops",
				"following",
				"friends",
				"inventory",
				"jobs",
				"messages",
				"search",
				"settings",
				"subscriptions",
				"turbo",
				"videos",
				"wallet",
			]);
			return reserved.has(candidate.toLowerCase()) ? null : candidate;
		}

		function _hideElement(el) {
			if (!el) return;
			el.style.setProperty("display", "none", "important");
			el.style.setProperty("visibility", "hidden", "important");
			el.setAttribute("data-ttvab-blocked", "true");
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
			el.style.setProperty("max-width", "100%", "important");
			el.style.setProperty("max-height", "100%", "important");
			el.style.setProperty("inset", "0", "important");
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
				"max-width",
				"max-height",
				"inset",
				"left",
				"right",
				"top",
				"bottom",
				"grid-template-columns",
				"grid-template-areas",
				"grid-auto-columns",
				"grid-auto-flow",
				"column-gap",
				"gap",
				"justify-content",
				"align-items",
				"flex",
				"flex-basis",
			].forEach((property) => {
				el.style.removeProperty(property);
			});

			el.removeAttribute("data-ttvab-display-shell-reset");
			el.removeAttribute("data-ttvab-blocked");
		}

		function _cleanupStaleDisplayAdShell(
			displayShellNodes,
			pipContainers,
			layoutRoots,
			inferredLayoutWrappers = [],
		) {
			const staleNodes = [
				...displayShellNodes,
				...layoutRoots,
				...inferredLayoutWrappers,
				...Array.from(
					document.querySelectorAll('[data-ttvab-display-shell-reset="true"]'),
				),
			].filter((el, index, list) => el && list.indexOf(el) === index);

			if (staleNodes.length === 0 && pipContainers.length === 0) {
				return false;
			}

			_log(
				"Display ad shell stale: cleaning up residual shell/layout artifacts",
				"info",
			);

			staleNodes.forEach((el) => {
				if (
					el.querySelector?.("video") ||
					el.matches?.('[data-a-target="video-player"]') ||
					el.matches?.('[class*="video-player"]')
				) {
					_restoreStreamDisplayLayout(el);
					return;
				}

				el.style.removeProperty("display");
				el.style.removeProperty("visibility");
				if (
					el.hasAttribute("data-ttvab-blocked") ||
					el.hasAttribute("data-ttvab-display-shell-reset")
				) {
					el.remove();
				}
			});

			pipContainers.forEach((el) => {
				if (el.querySelector?.("video")) {
					_restoreStreamDisplayLayout(el);
					return;
				}

				el.style.removeProperty("display");
				el.style.removeProperty("visibility");
				if (el.hasAttribute("data-ttvab-blocked")) {
					el.remove();
				}
			});

			return true;
		}

		function _resetDisplayAdShellState() {
			isDisplayAdShellActive = false;
			isPromotedPageAdActive = false;
			didCountCurrentDisplayAdShell = false;
			pendingDisplayAdShellSince = 0;
			pendingDisplayAdShellSignature = null;
		}

		function _queryUniqueElements(selectors) {
			return selectors
				.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
				.filter((el, index, list) => el && list.indexOf(el) === index);
		}

		function _cleanupAllKnownDisplayArtifacts() {
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
			);

			explicitDisplayNodes.forEach((el) => {
				el.style.removeProperty("display");
				el.style.removeProperty("visibility");
				if (el.hasAttribute("data-ttvab-blocked")) {
					el.remove();
				}
			});
		}

		function _handleRouteChange() {
			const pathname = window.location.pathname;
			if (pathname === lastPathname) return;
			lastPathname = pathname;
			_resetDisplayAdShellState();
			_cleanupAllKnownDisplayArtifacts();
			_scanAndRemove();
		}

		function _hasDisplayAdLabel() {
			const directLabel = document.querySelector(
				'[data-a-target="video-ad-label"], [data-test-selector="ad-label"], [class*="ad-countdown"]',
			);
			if (
				directLabel &&
				_isVisibleElement(directLabel) &&
				_isNearMainPlayer(directLabel) &&
				_looksLikeAdLabel(directLabel.textContent || "")
			) {
				return true;
			}

			const playerRoots = document.querySelectorAll(
				'[data-a-target="video-player"], [class*="video-player"], video',
			);
			const adLabelPattern = /^ad(?:\s+\d+(?::\d+)?(?:\s+of\s+\d+)?)?$/i;

			for (const root of playerRoots) {
				if (!_isVisibleElement(root)) continue;
				const nodes = root.querySelectorAll("span, p");
				const rootRect = root.getBoundingClientRect();
				if (rootRect.width < 320 || rootRect.height < 180) continue;
				for (const node of nodes) {
					const text = (node.textContent || "").trim();
					if (!text || text.length > 18 || !adLabelPattern.test(text)) continue;
					if (!_isVisibleElement(node)) continue;
					const rect = node.getBoundingClientRect();
					if (
						rect.width > 0 &&
						rect.height > 0 &&
						rect.top < rootRect.top + 140 &&
						rect.right > rootRect.right - 260
					) {
						return true;
					}
				}
			}

			return false;
		}

		function _isVisibleElement(el) {
			if (!el) return false;
			const rect = el.getBoundingClientRect();
			const style = window.getComputedStyle(el);
			return (
				rect.width > 0 &&
				rect.height > 0 &&
				style.display !== "none" &&
				style.visibility !== "hidden"
			);
		}

		function _getMainPlayerElement() {
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

			return bestElement;
		}

		function _getMainPlayerRect() {
			const player = _getMainPlayerElement();
			return player ? player.getBoundingClientRect() : null;
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

			return wrappers.filter(
				(el, index, list) => el && list.indexOf(el) === index,
			);
		}

		function _isNearMainPlayer(el) {
			if (!el || !_isVisibleElement(el)) return false;
			const playerRect = _getMainPlayerRect();
			if (!playerRect) return false;

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

		function _looksLikeAdLabel(text) {
			const normalized = String(text || "")
				.replace(/\s+/g, " ")
				.trim()
				.toLowerCase();
			return (
				normalized === "ad" ||
				normalized === "ad 0" ||
				/^ad\s+[0-9:]+(?:\s+of\s+\d+)?$/.test(normalized) ||
				/^ad\s*ⓘ$/.test(normalized)
			);
		}

		function _hasDisplayAdCtaNearPlayer() {
			const ctas = document.querySelectorAll("a, button");
			for (const cta of ctas) {
				if (!_isVisibleElement(cta) || !_isNearMainPlayer(cta)) continue;
				const text = (cta.textContent || "").replace(/\s+/g, " ").trim();
				if (!PLAYER_AD_CTA_PATTERN.test(text)) continue;

				const rect = cta.getBoundingClientRect();
				if (rect.width < 40 || rect.height < 20) continue;
				return true;
			}
			return false;
		}

		function _hasOfflinePageSignal() {
			for (const selector of OFFLINE_PAGE_SIGNAL_SELECTORS) {
				const el = document.querySelector(selector);
				if (el && _isVisibleElement(el)) {
					return true;
				}
			}

			let checked = 0;
			const nodes = document.querySelectorAll("span, p, div");
			for (const node of nodes) {
				if (checked++ > 200) break;
				if (!_isVisibleElement(node)) continue;
				const text = (node.textContent || "").trim();
				if (!text || text.length > 12) continue;
				if (text.toUpperCase() !== "OFFLINE") continue;
				const rect = node.getBoundingClientRect();
				if (rect.top < window.innerHeight * 0.6) {
					return true;
				}
			}

			return false;
		}

		function _collapsePromotedPageAd() {
			if (!_hasOfflinePageSignal()) {
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
						rect.width > window.innerWidth * 0.75 ||
						rect.height > window.innerHeight * 0.85
					) {
						continue;
					}

					const hasAdLabel = Array.from(
						card.querySelectorAll("span, p, div"),
					).some((node) => {
						if (!_isVisibleElement(node)) return false;
						return _looksLikeAdLabel(node.textContent || "");
					});

					if (!hasAdLabel) continue;

					if (!isPromotedPageAdActive) {
						isPromotedPageAdActive = true;
						if (!__TTVAB_STATE__.CurrentAdChannel) {
							_incrementAdsBlocked(_getCurrentChannelName());
						}
						_log("Offline/promoted page ad detected, hiding card", "warning");
					}

					_hideElement(card);
					_incrementDomCleanup("promoted-card");
					return true;
				}
			}

			isPromotedPageAdActive = false;
			return false;
		}

		function _collapseDisplayAdShell() {
			const adBanners = Array.from(
				document.querySelectorAll('div[data-test-selector="ad-banner"]'),
			).filter((el) => _isVisibleElement(el) && _isNearMainPlayer(el));
			const explicitDisplayAdNodes = EXPLICIT_DISPLAY_AD_SELECTORS.flatMap(
				(selector) => Array.from(document.querySelectorAll(selector)),
			).filter(
				(el, index, list) =>
					_isVisibleElement(el) &&
					_isNearMainPlayer(el) &&
					list.indexOf(el) === index,
			);
			const displayShellNodes = DISPLAY_AD_SHELL_SELECTORS.flatMap((selector) =>
				Array.from(document.querySelectorAll(selector)),
			).filter(
				(el, index, list) =>
					_isVisibleElement(el) &&
					_isNearMainPlayer(el) &&
					list.indexOf(el) === index,
			);
			const pipContainers = PIP_SELECTORS.flatMap((selector) =>
				Array.from(document.querySelectorAll(selector)),
			).filter(
				(el, index, list) =>
					_isVisibleElement(el) &&
					_isNearMainPlayer(el) &&
					list.indexOf(el) === index,
			);
			const layoutRoots = STREAM_DISPLAY_LAYOUT_SELECTORS.flatMap((selector) =>
				Array.from(document.querySelectorAll(selector)),
			).filter(
				(el, index, list) =>
					_isVisibleElement(el) &&
					_isNearMainPlayer(el) &&
					list.indexOf(el) === index,
			);
			const hasAdLabel = _hasDisplayAdLabel();
			const hasDisplayAdCta = _hasDisplayAdCtaNearPlayer();
			const inferredLayoutWrappers = hasAdLabel
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

			if (!hasDisplayAdSignal) {
				_cleanupStaleDisplayAdShell(
					displayShellNodes,
					pipContainers,
					layoutRoots,
				);
				isDisplayAdShellActive = false;
				didCountCurrentDisplayAdShell = false;
				pendingDisplayAdShellSince = 0;
				pendingDisplayAdShellSignature = null;
				return false;
			}

			const signalSignature = [
				adBanners.length,
				explicitDisplayAdNodes.length,
				displayShellNodes.length,
				pipContainers.length,
				layoutRoots.length,
				hasDisplayAdCta ? 1 : 0,
				hasExplicitDisplayAdSignal ? inferredLayoutWrappers.length : 0,
				hasInferredDisplayAdSignal ? 1 : 0,
				hasAdLabel ? 1 : 0,
			].join(":");
			const now = Date.now();

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
				didCountCurrentDisplayAdShell = false;
				pendingDisplayAdShellSince = 0;
				pendingDisplayAdShellSignature = null;
			}

			if (!didCountCurrentDisplayAdShell) {
				didCountCurrentDisplayAdShell = true;
				_incrementDomCleanup("display-shell");
				if (!__TTVAB_STATE__.CurrentAdChannel) {
					_incrementAdsBlocked(_getCurrentChannelName());
				}
				const logType = hasExplicitDisplayAdSignal ? "confirmed" : "inferred";
				_log(
					`Display ad shell ${logType}: counting blocked ad and collapsing shell`,
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
				text.includes("try turbo") ||
				text.includes("commercials") ||
				text.includes("whitelist") ||
				text.includes("ad blocker") ||
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

		function _isSafeElement(el) {
			if (!el) return false;
			for (const selector of SAFELIST_SELECTORS) {
				try {
					if (el.matches?.(selector)) return true;
					if (el.querySelector?.(selector)) return true;
				} catch {}
			}
			return false;
		}

		function _scanAndRemove() {
			if (_collapseDisplayAdShell()) {
				return true;
			}

			if (_collapsePromotedPageAd()) {
				return true;
			}

			const detectionNodes = document.querySelectorAll(
				'button, [role="button"], a, div[class*="Button"], h1, h2, h3, h4, div[class*="Header"], p, span',
			);

			for (const node of detectionNodes) {
				if (node.tagName === "SPAN" && (node.textContent || "").length < 10)
					continue;
				if (
					node.offsetParent === null ||
					node.hasAttribute("data-ttvab-blocked")
				)
					continue;
				if (
					_isSafeElement(node) ||
					node.closest('[class*="chat"]') ||
					node.closest('[class*="Chat"]')
				)
					continue;

				if (_hasAdblockText(node)) {
					node.setAttribute("data-ttvab-blocked", "true");

					let popup = node.parentElement;
					let attempts = 0;

					while (popup && attempts < 20) {
						if (_isSafeElement(popup)) break;

						const style = window.getComputedStyle(popup);
						const isOverlay =
							style.position === "fixed" || style.position === "absolute";
						const hasBackground =
							style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
							style.backgroundColor !== "transparent";
						const isLarge = popup.offsetWidth > 200 && popup.offsetHeight > 100;
						const zIndex = Number.parseInt(style.zIndex, 10);
						const hasZIndex = Number.isFinite(zIndex) && zIndex > 100;

						const className =
							popup.className && typeof popup.className === "string"
								? popup.className
								: "";
						const isPopupClass =
							(className.includes("ScAttach") &&
								className.includes("Balloon")) ||
							className.includes("Modal") ||
							className.includes("consent") ||
							className.includes("Consent") ||
							(className.includes("Overlay") &&
								!className.includes("Column") &&
								!className.includes("Chat")) ||
							(className.includes("Layer") && className.includes("Balloon"));

						if (
							(isOverlay || hasZIndex || isPopupClass) &&
							(hasBackground || isLarge)
						) {
							if (popup.querySelector("video")) {
								popup = popup.parentElement;
								attempts++;
								continue;
							}

							if (_isSafeElement(popup)) break;

							_log(
								`Hiding popup: ${popup.className || popup.tagName}`,
								"success",
							);
							popup.setAttribute(
								"style",
								(popup.getAttribute("style") || "") +
									"; display: none !important; visibility: hidden !important;",
							);
							popup.setAttribute("data-ttvab-blocked", "true");

							_incrementDomCleanup("overlay-ad");
							return true;
						}

						popup = popup.parentElement;
						attempts++;
					}

					const fallback = node.closest(
						'div[class*="Balloon"], div[class*="consent"], div[class*="Modal"]',
					);
					if (fallback && !_isSafeElement(fallback)) {
						_log("Hiding popup (fallback)", "warning");
						fallback.style.display = "none";
						fallback.setAttribute(
							"style",
							(fallback.getAttribute("style") || "") +
								"; display: none !important;",
						);
						fallback.setAttribute("data-ttvab-blocked", "true");
						_incrementDomCleanup("overlay-ad");
						return true;
					}
				}
			}

			const popupSelectors = [
				'div[class*="ScAttach"][class*="ScBalloon"]',
				'div[class*="tw-balloon"]',
				'div[class*="consent"]',
				'div[data-a-target="consent-banner"]',
				'div[data-test-selector="ad-banner"]',
				'div[class*="Layout"][class*="Overlay"]',
			];

			for (const selector of popupSelectors) {
				try {
					const elements = document.querySelectorAll(selector);
					for (const el of elements) {
						if (_hasAdblockText(el)) {
							_log("Hiding popup by selector", "success");
							el.style.display = "none";
							el.setAttribute(
								"style",
								(el.getAttribute("style") || "") +
									"; display: none !important;",
							);
							_incrementDomCleanup("overlay-ad");
							return true;
						}
					}
				} catch {}
			}

			const overlays = document.querySelectorAll(
				'div[style*="position: fixed"], div[style*="position:fixed"], div[style*="z-index"]',
			);
			for (const el of overlays) {
				if (
					_hasAdblockText(el) &&
					el.offsetWidth > 200 &&
					el.offsetHeight > 100
				) {
					if (el.querySelector("video")) continue;

					_log("Hiding popup overlay", "success");
					el.style.display = "none";
					el.setAttribute(
						"style",
						`${el.getAttribute("style") || ""}; display: none !important;`,
					);
					_incrementDomCleanup("overlay-ad");
					return true;
				}
			}

			return false;
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

		if (_scanAndRemove()) {
			_log("Popup removed on initial scan", "success");
		}

		window.addEventListener("message", (event) => {
			if (event.source !== window) return;
			const message = _getTrustedBridgeMessageData(event.data);
			const detail = _getTrustedBridgeMessageDetail(message?.detail);
			if (
				message?.type !== "ttvab-ad-blocked" ||
				!Number.isFinite(detail?.count)
			) {
				return;
			}
			const currentChannel = _getCurrentChannelName();
			const blockedChannel =
				typeof detail.channel === "string" ? detail.channel : null;
			if (blockedChannel && blockedChannel !== currentChannel) {
				return;
			}
			_scanAndRemove();
			setTimeout(_scanAndRemove, 50);
			setTimeout(_scanAndRemove, 250);
		});

		window.addEventListener("popstate", _handleRouteChange, true);

		const originalPushState = history.pushState;
		const originalReplaceState = history.replaceState;
		history.pushState = function (...args) {
			const result = originalPushState.apply(this, args);
			_handleRouteChange();
			return result;
		};
		history.replaceState = function (...args) {
			const result = originalReplaceState.apply(this, args);
			_handleRouteChange();
			return result;
		};

		let debounceTimer = null;
		let lastImmediateScan = 0;
		const observer = new MutationObserver((mutations) => {
			let shouldScan = false;
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (node.nodeType === 1) {
						shouldScan = true;
						break;
					}
				}
				if (shouldScan) break;
			}

			if (!shouldScan) return;

			_handleRouteChange();

			const now = Date.now();
			if (now - lastImmediateScan > 100) {
				lastImmediateScan = now;
				_scanAndRemove();
			}

			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				_scanAndRemove();
				debounceTimer = null;
			}, 50);
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
		});

		function _scheduleIdleScan() {
			const delay = _isDocumentHidden() ? 2000 : 500;
			setTimeout(() => {
				_handleRouteChange();
				if (!_isDocumentHidden()) {
					_scanAndRemove();
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

	_declareState(window);

	window.addEventListener("message", (e) => {
		if (e.source !== window) return;
		const message = _getTrustedBridgeMessageData(e.data);
		const detail = _getTrustedBridgeMessageDetail(message?.detail);
		if (!message || !detail) return;

		if (message.type === "ttvab-init-count" && Number.isFinite(detail.count)) {
			const restoredCount = _normalizeCounterValue(detail.count);
			if (_S.adsBlocked === restoredCount) return;
			_S.adsBlocked = restoredCount;
			_broadcastWorkers({ key: "UpdateAdsBlocked", value: _S.adsBlocked });
			_log(`Restored ads count: ${_S.adsBlocked}`, "info");
			return;
		}

		if (
			message.type === "ttvab-init-dom-ads-count" &&
			Number.isFinite(detail.count)
		) {
			const restoredCount = _normalizeCounterValue(detail.count);
			if (_S.domAdsBlocked === restoredCount) return;
			_S.domAdsBlocked = restoredCount;
			_log(`Restored DOM cleanup count: ${_S.domAdsBlocked}`, "info");
		}
	});

	_hookStorage();
	_hookWorker();
	_hookMainFetch();
	_initToggleListener();
	_blockAntiAdblockPopup();
	_initAchievementListener();

	_hookVisibilityState();
	_hookLocalStoragePreservation();
	if (_C.BUFFERING_FIX) {
		_monitorPlayerBuffering();
	}

	_showWelcome();
	_showDonation();

	window.postMessage({ type: "ttvab-request-state" }, "*");

	_log("Initialized successfully", "success");
}
