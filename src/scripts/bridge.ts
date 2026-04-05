// TTV AB - Bridge Script
// https://github.com/GosuDRM/TTV-AB | MIT License

function normalizeCount(value) {
	const numericValue =
		typeof value === "string" && value.trim() !== "" ? Number(value) : value;
	return Number.isFinite(numericValue)
		? Math.max(0, Math.trunc(numericValue))
		: 0;
}

function normalizeChannelName(value) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim().toLowerCase();
	return /^[a-z0-9_]{1,25}$/.test(trimmed) ? trimmed : null;
}

function normalizeVodID(value) {
	if (typeof value === "number" && Number.isFinite(value)) {
		value = String(Math.trunc(value));
	}
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return /^\d+$/.test(trimmed) ? trimmed : null;
}

function buildMediaKey(mediaType, channelName = null, vodID = null) {
	if (mediaType === "vod") {
		const safeVodID = normalizeVodID(vodID);
		return safeVodID ? `vod:${safeVodID}` : null;
	}

	const safeChannel = normalizeChannelName(channelName);
	return safeChannel ? `live:${safeChannel}` : null;
}

function normalizeMediaKey(value) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim().toLowerCase();
	if (trimmed.startsWith("live:")) {
		return buildMediaKey("live", trimmed.slice(5), null);
	}
	if (trimmed.startsWith("vod:")) {
		return buildMediaKey("vod", null, trimmed.slice(4));
	}
	return null;
}

const RESERVED_ROUTE_SEGMENTS = new Set([
	"browse",
	"clip",
	"clips",
	"collections",
	"dashboard",
	"directory",
	"downloads",
	"drops",
	"embed",
	"event",
	"following",
	"friends",
	"inventory",
	"jobs",
	"manager",
	"messages",
	"moderator",
	"p",
	"player",
	"popout",
	"prime",
	"products",
	"search",
	"settings",
	"store",
	"subscriptions",
	"team",
	"turbo",
	"u",
	"user",
	"video",
	"videos",
	"wallet",
]);

function isPlainObject(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype === null) {
		return true;
	}
	// Bridge messages cross execution realms, so prototype identity checks
	// against the local Object.prototype are too strict here.
	return (
		Object.prototype.toString.call(value) === "[object Object]" &&
		Object.getPrototypeOf(prototype) === null
	);
}

function getBridgeMessageData(value) {
	return isPlainObject(value) ? value : null;
}

function getBridgeMessageDetail(value) {
	return isPlainObject(value) ? value : null;
}

function createChannelsMap() {
	return Object.create(null);
}

function mergeChannelDeltaMaps(target, source) {
	if (!isPlainObject(source)) return target;
	for (const [channelName, count] of Object.entries(source)) {
		const safeChannel = normalizeChannelName(channelName);
		const safeCount = normalizeCount(count);
		if (!safeChannel || safeCount <= 0) continue;
		target[safeChannel] =
			normalizeCount(target[safeChannel]) + normalizeCount(safeCount);
	}
	return target;
}

function createKnownCleanupKinds() {
	return new Set([
		"direct-media-ad",
		"display-shell",
		"display-shell-inferred",
		"generic",
		"overlay-ad",
		"promoted-card",
	]);
}

function getCurrentPlaybackContext() {
	const segments = window.location.pathname.split("/").filter(Boolean);
	const firstSegment = segments[0] || null;
	const lowerFirstSegment = String(firstSegment || "").toLowerCase();
	if (lowerFirstSegment === "videos" || lowerFirstSegment === "video") {
		const vodID = normalizeVodID(segments[1] || null);
		return {
			channelName: null,
			mediaKey: buildMediaKey("vod", null, vodID),
		};
	}

	if (lowerFirstSegment === "popout") {
		const channelName = normalizeChannelName(segments[1] || null);
		const isPlayerRoute = String(segments[2] || "").toLowerCase() === "player";
		return {
			channelName: channelName && isPlayerRoute ? channelName : null,
			mediaKey:
				channelName && isPlayerRoute
					? buildMediaKey("live", channelName, null)
					: null,
		};
	}

	if (lowerFirstSegment === "embed" || lowerFirstSegment === "moderator") {
		const channelName = normalizeChannelName(segments[1] || null);
		return {
			channelName,
			mediaKey: buildMediaKey("live", channelName, null),
		};
	}

	const normalizedCandidate = normalizeChannelName(firstSegment);
	const channelName =
		normalizedCandidate && !RESERVED_ROUTE_SEGMENTS.has(normalizedCandidate)
			? normalizedCandidate
			: null;
	return {
		channelName,
		mediaKey: buildMediaKey("live", channelName, null),
	};
}

function getMessagePlaybackContext(detail) {
	const safeDetail = getBridgeMessageDetail(detail);
	const channelName = normalizeChannelName(
		safeDetail?.pageChannel || safeDetail?.channel,
	);
	return {
		channelName,
		mediaKey:
			normalizeMediaKey(safeDetail?.pageMediaKey || safeDetail?.mediaKey) ||
			buildMediaKey("live", channelName, null),
	};
}

function playbackContextsMatch(
	expectedPlaybackContext,
	currentPlaybackContext,
) {
	if (expectedPlaybackContext?.mediaKey) {
		return currentPlaybackContext.mediaKey === expectedPlaybackContext.mediaKey;
	}
	if (expectedPlaybackContext?.channelName) {
		return (
			currentPlaybackContext.channelName === expectedPlaybackContext.channelName
		);
	}
	return true;
}

const BRIDGE_PORT_INIT_MESSAGE = "ttvab-bridge-port-init";
const BRIDGE_READY_MESSAGE = "ttvab-bridge-ready";
const BRIDGE_HANDSHAKE_RETRY_MS = 75;
const FLUSH_DELAY_MS = 200;
const MAX_FLUSH_RETRY_DELAY_MS = 2000;
const pendingPageMessages = [];
let pageBridgePort = null;
let pageBridgeConnected = false;
let handshakeRetryTimeout = null;
let bridgeSessionToken = null;

function createBridgeSessionToken() {
	const values = new Uint8Array(24);
	if (globalThis.crypto?.getRandomValues) {
		globalThis.crypto.getRandomValues(values);
		return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join(
			"",
		);
	}
	return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

function getBridgeSessionToken() {
	if (typeof bridgeSessionToken === "string" && bridgeSessionToken.length >= 16) {
		return bridgeSessionToken;
	}
	bridgeSessionToken = createBridgeSessionToken();
	return bridgeSessionToken;
}

function flushPageMessages() {
	if (!pageBridgeConnected || !pageBridgePort) return;
	while (pendingPageMessages.length > 0) {
		const nextMessage = pendingPageMessages[0];
		try {
			pageBridgePort.postMessage(nextMessage);
			pendingPageMessages.shift();
		} catch {
			pageBridgeConnected = false;
			startBridgeHandshake();
			return;
		}
	}
}

function sendToPage(type, detail = null) {
	if (typeof type !== "string" || !type) return false;
	const message = { type, detail };
	if (!pageBridgeConnected || !pageBridgePort) {
		pendingPageMessages.push(message);
		return false;
	}
	try {
		pageBridgePort.postMessage(message);
		return true;
	} catch {
		pageBridgeConnected = false;
		pendingPageMessages.unshift(message);
		startBridgeHandshake();
		return false;
	}
}

function clearHandshakeRetryTimeout() {
	if (!handshakeRetryTimeout) return;
	clearTimeout(handshakeRetryTimeout);
	handshakeRetryTimeout = null;
}

function bindPageBridgePort(port) {
	if (!port || typeof port.postMessage !== "function") return false;
	if (pageBridgePort === port) return true;
	if (pageBridgeConnected && pageBridgePort) return false;
	if (pageBridgePort) {
		try {
			pageBridgePort.close();
		} catch {}
	}
	pageBridgePort = port;
	pageBridgePort.addEventListener("message", (event) => {
		handlePageBridgeMessage(event.data);
	});
	pageBridgePort.start?.();
	return true;
}

function startBridgeHandshake() {
	if (pageBridgeConnected && pageBridgePort) return;
	clearHandshakeRetryTimeout();
	pageBridgeConnected = false;
	const channel = new MessageChannel();
	bindPageBridgePort(channel.port1);
	window.postMessage(
		{
			type: BRIDGE_PORT_INIT_MESSAGE,
			detail: {
				token: getBridgeSessionToken(),
			},
		},
		window.location.origin,
		[channel.port2],
	);
	handshakeRetryTimeout = setTimeout(() => {
		if (!pageBridgeConnected) {
			startBridgeHandshake();
		}
	}, BRIDGE_HANDSHAKE_RETRY_MS);
}

function postAchievementUnlock(id) {
	if (typeof id !== "string" || !id) return;
	sendToPage("ttvab-achievement-unlocked", { id });
}

const bridgeState = {
	enabled: true,
	bufferFixEnabled: true,
	storedAdsCount: 0,
	storedDomAdsCount: 0,
};

const KNOWN_DOM_CLEANUP_KINDS = createKnownCleanupKinds();
const MAX_MESSAGE_DELTA = 50;

let pendingAdsDelta = 0;
let pendingDomAdsDelta = 0;
let pendingAdChannels = createChannelsMap();
let flushTimeout = null;
let flushRetryCount = 0;

function clearScheduledFlush() {
	if (!flushTimeout) return;
	clearTimeout(flushTimeout);
	flushTimeout = null;
}

function broadcastState() {
	sendToPage("ttvab-toggle", {
		enabled: Boolean(bridgeState.enabled),
	});
	sendToPage("ttvab-toggle-buffer-fix", {
		enabled: Boolean(bridgeState.bufferFixEnabled),
	});
	sendToPage("ttvab-init-count", {
		count: normalizeCount(bridgeState.storedAdsCount),
	});
	sendToPage("ttvab-init-dom-ads-count", {
		count: normalizeCount(bridgeState.storedDomAdsCount),
	});
}

function reconcilePendingDelta(kind, nextStoredCount) {
	const safeStoredCount = normalizeCount(nextStoredCount);
	if (kind === "ads") {
		const previousStoredCount = normalizeCount(bridgeState.storedAdsCount);
		if (safeStoredCount < previousStoredCount) {
			pendingAdsDelta = 0;
			pendingAdChannels = createChannelsMap();
			flushRetryCount = 0;
		}
		bridgeState.storedAdsCount = safeStoredCount;
		return;
	}
	if (kind === "domAds") {
		const previousStoredCount = normalizeCount(bridgeState.storedDomAdsCount);
		if (safeStoredCount < previousStoredCount) {
			pendingDomAdsDelta = 0;
			flushRetryCount = 0;
		}
		bridgeState.storedDomAdsCount = safeStoredCount;
	}
}

function queueTotalDelta(kind, nextTotal) {
	const safeNextTotal = normalizeCount(nextTotal);
	if (kind === "ads") {
		const queuedTotal =
			normalizeCount(bridgeState.storedAdsCount) +
			normalizeCount(pendingAdsDelta);
		const delta = safeNextTotal - queuedTotal;
		const safeDelta = Math.min(Math.max(delta, 0), MAX_MESSAGE_DELTA);
		if (safeDelta > 0) {
			pendingAdsDelta += safeDelta;
		}
		return safeDelta;
	}
	if (kind === "domAds") {
		const queuedTotal =
			normalizeCount(bridgeState.storedDomAdsCount) +
			normalizeCount(pendingDomAdsDelta);
		const delta = safeNextTotal - queuedTotal;
		const safeDelta = Math.min(Math.max(delta, 0), MAX_MESSAGE_DELTA);
		if (safeDelta > 0) {
			pendingDomAdsDelta += safeDelta;
		}
		return safeDelta;
	}
	return 0;
}

function queueExplicitDelta(kind, delta) {
	const safeDelta = Math.min(
		Math.max(normalizeCount(delta), 0),
		MAX_MESSAGE_DELTA,
	);
	if (safeDelta <= 0) return 0;
	if (kind === "ads") {
		pendingAdsDelta += safeDelta;
		return safeDelta;
	}
	if (kind === "domAds") {
		pendingDomAdsDelta += safeDelta;
		return safeDelta;
	}
	return 0;
}

function requeueFlushWork(adsDelta, domAdsDelta, channelDeltas) {
	pendingAdsDelta += normalizeCount(adsDelta);
	pendingDomAdsDelta += normalizeCount(domAdsDelta);
	pendingAdChannels = mergeChannelDeltaMaps(pendingAdChannels, channelDeltas);
	flushRetryCount++;
	const nextDelay = Math.min(
		MAX_FLUSH_RETRY_DELAY_MS,
		FLUSH_DELAY_MS * 2 ** Math.min(flushRetryCount, 4),
	);
	scheduleFlush(nextDelay);
}

function scheduleFlush(delay = FLUSH_DELAY_MS) {
	if (flushTimeout) return;
	flushTimeout = setTimeout(
		() => {
			flushTimeout = null;
			flushCounters();
		},
		Math.max(0, delay),
	);
}

function flushCounters(options: { fireAndForget?: boolean } = {}) {
	const fireAndForget = options.fireAndForget === true;
	clearScheduledFlush();
	const adsDelta = pendingAdsDelta;
	const domAdsDelta = pendingDomAdsDelta;
	const channelDeltas = pendingAdChannels;

	pendingAdsDelta = 0;
	pendingDomAdsDelta = 0;
	pendingAdChannels = createChannelsMap();

	if (adsDelta === 0 && domAdsDelta === 0) return;

	const payload = {
		type: "ttvab-persist-counters",
		detail: {
			adsDelta,
			domAdsDelta,
			channelDeltas,
		},
	};

	if (fireAndForget) {
		try {
			chrome.runtime.sendMessage(payload, () => {
				void chrome.runtime.lastError;
			});
		} catch {}
		return;
	}

	chrome.runtime.sendMessage(
		payload,
		(response) => {
			if (chrome.runtime.lastError) {
				console.error(
					"[TTV AB] Counter persist error:",
					chrome.runtime.lastError.message,
				);
				requeueFlushWork(adsDelta, domAdsDelta, channelDeltas);
				return;
			}

			const safeResponse = getBridgeMessageData(response);
			if (!safeResponse?.ok) {
				console.error(
					"[TTV AB] Counter persist rejected:",
					safeResponse?.error || "unknown error",
				);
				requeueFlushWork(adsDelta, domAdsDelta, channelDeltas);
				return;
			}

			flushRetryCount = 0;

			const newUnlocks = Array.isArray(safeResponse.newUnlocks)
				? safeResponse.newUnlocks
				: [];
			for (const id of newUnlocks) {
				postAchievementUnlock(id);
			}
		},
	);
}

function flushPendingCountersOnPageExit() {
	flushCounters({ fireAndForget: true });
}

chrome.storage.local.get(
	["ttvAdblockEnabled", "ttvBufferFixEnabled", "ttvAdsBlocked", "ttvDomAdsBlocked"],
	(result) => {
		if (chrome.runtime.lastError) {
			console.error(
				"[TTV AB] Init read error:",
				chrome.runtime.lastError.message,
			);
		}
		const safeResult = result || {};
		bridgeState.enabled = safeResult.ttvAdblockEnabled !== false;
		bridgeState.bufferFixEnabled = safeResult.ttvBufferFixEnabled !== false;
		bridgeState.storedAdsCount = normalizeCount(safeResult.ttvAdsBlocked);
		bridgeState.storedDomAdsCount = normalizeCount(safeResult.ttvDomAdsBlocked);

		broadcastState();

		chrome.storage.onChanged.addListener((changes, namespace) => {
			if (namespace !== "local") return;
			if (changes.ttvAdblockEnabled) {
				const wasEnabled = bridgeState.enabled;
				bridgeState.enabled = changes.ttvAdblockEnabled.newValue !== false;
				if (bridgeState.enabled !== wasEnabled) {
					sendToPage("ttvab-toggle", {
						enabled: bridgeState.enabled,
					});
				}
			}
			if (changes.ttvBufferFixEnabled) {
				const wasBufferFixEnabled = bridgeState.bufferFixEnabled;
				bridgeState.bufferFixEnabled = changes.ttvBufferFixEnabled.newValue !== false;
				if (bridgeState.bufferFixEnabled !== wasBufferFixEnabled) {
					sendToPage("ttvab-toggle-buffer-fix", {
						enabled: bridgeState.bufferFixEnabled,
					});
				}
			}
			if (changes.ttvAdsBlocked) {
				const nextAdsCount = normalizeCount(changes.ttvAdsBlocked.newValue);
				const previousAdsCount = bridgeState.storedAdsCount;
				reconcilePendingDelta("ads", nextAdsCount);
				if (nextAdsCount !== previousAdsCount) {
					sendToPage("ttvab-init-count", {
						count: nextAdsCount,
					});
				}
			}
			if (changes.ttvDomAdsBlocked) {
				const nextDomAdsCount = normalizeCount(
					changes.ttvDomAdsBlocked.newValue,
				);
				const previousDomAdsCount = bridgeState.storedDomAdsCount;
				reconcilePendingDelta("domAds", nextDomAdsCount);
				if (nextDomAdsCount !== previousDomAdsCount) {
					sendToPage("ttvab-init-dom-ads-count", {
						count: nextDomAdsCount,
					});
				}
			}
		});
	},
);

function handlePageBridgeMessage(rawMessage) {
	const message = getBridgeMessageData(rawMessage);
	if (!message) return;
	if (message.type === BRIDGE_READY_MESSAGE) {
		const detail = getBridgeMessageDetail(message.detail);
		if (detail?.token !== getBridgeSessionToken()) {
			return;
		}
		pageBridgeConnected = true;
		clearHandshakeRetryTimeout();
		flushPageMessages();
		broadcastState();
		return;
	}
	if (message.type === "ttvab-request-state") {
		broadcastState();
		return;
	}

	const detail = getBridgeMessageDetail(message.detail);
	if (message.type === "ttvab-ad-blocked") {
		if (!detail || !Number.isFinite(detail.count)) return;
		const eventPlaybackContext = getMessagePlaybackContext(detail);
		const blockedChannel = normalizeChannelName(
			detail.channel || eventPlaybackContext.channelName,
		);
		const delta =
			Number.isFinite(detail.delta) && normalizeCount(detail.delta) > 0
				? queueExplicitDelta("ads", detail.delta)
				: queueTotalDelta("ads", detail.count);
		if (blockedChannel && delta > 0) {
			pendingAdChannels[blockedChannel] =
				normalizeCount(pendingAdChannels[blockedChannel]) + delta;
		}
		if (delta > 0) {
			scheduleFlush();
		}
		return;
	}

	if (message.type === "ttvab-dom-ad-cleanup") {
		if (!detail || !Number.isFinite(detail.count)) return;
		const cleanupKind =
			typeof detail.kind === "string" ? detail.kind.trim().toLowerCase() : "";
		if (!KNOWN_DOM_CLEANUP_KINDS.has(cleanupKind)) return;
		const delta =
			Number.isFinite(detail.delta) && normalizeCount(detail.delta) > 0
				? queueExplicitDelta("domAds", detail.delta)
				: queueTotalDelta("domAds", detail.count);
		if (delta > 0) {
			scheduleFlush();
		}
	}
}

window.addEventListener("pagehide", flushPendingCountersOnPageExit, true);
window.addEventListener("beforeunload", flushPendingCountersOnPageExit, true);

startBridgeHandshake();
