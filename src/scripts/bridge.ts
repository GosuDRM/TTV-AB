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

function _getCurrentPlaybackContext() {
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

	if (segments.length !== 1) {
		return {
			channelName: null,
			mediaKey: null,
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

function _playbackContextsMatch(
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
const MAX_PENDING_PAGE_MESSAGES = 64;
let pageBridgePort = null;
let pageBridgeConnected = false;
let handshakeRetryTimeout = null;
let bridgeSessionToken = null;

function queuePendingPageMessage(message, prioritize = false) {
	if (!message || typeof message !== "object") return;
	if (prioritize) {
		pendingPageMessages.unshift(message);
	} else {
		pendingPageMessages.push(message);
	}
	while (pendingPageMessages.length > MAX_PENDING_PAGE_MESSAGES) {
		if (prioritize) {
			const dropped = pendingPageMessages.pop();
			if (dropped?.type) {
				console.warn(
					"[TTV AB] Bridge queue full, dropped message:",
					dropped.type,
				);
			}
		} else {
			const dropped = pendingPageMessages.shift();
			if (dropped?.type) {
				console.warn(
					"[TTV AB] Bridge queue full, dropped message:",
					dropped.type,
				);
			}
		}
	}
}

function createBridgeSessionToken() {
	const values = new Uint8Array(24);
	if (globalThis.crypto?.getRandomValues) {
		globalThis.crypto.getRandomValues(values);
		return Array.from(values, (value) =>
			value.toString(16).padStart(2, "0"),
		).join("");
	}
	return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

function getBridgeSessionToken() {
	if (
		typeof bridgeSessionToken === "string" &&
		bridgeSessionToken.length >= 16
	) {
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
		queuePendingPageMessage(message);
		return false;
	}
	try {
		pageBridgePort.postMessage(message);
		return true;
	} catch {
		pageBridgeConnected = false;
		queuePendingPageMessage(message, true);
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

const MAX_HANDSHAKE_RETRIES = 20;
let handshakeRetryCount = 0;

function startBridgeHandshake() {
	if (pageBridgeConnected && pageBridgePort) {
		handshakeRetryCount = 0;
		return;
	}
	if (handshakeRetryCount >= MAX_HANDSHAKE_RETRIES) {
		handshakeRetryCount = 0;
		handshakeRetryTimeout = setTimeout(() => {
			startBridgeHandshake();
		}, 30000);
		return;
	}
	clearHandshakeRetryTimeout();
	pageBridgeConnected = false;
	handshakeRetryCount++;
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
};
const MAX_MESSAGE_DELTA = 50;
const LEGACY_PERSISTED_COUNTER_FLUSHES_KEY = "ttvab_pending_counter_flushes";
const PERSISTED_COUNTER_FLUSH_KEY_PREFIX = "ttvab_pending_counter_flush:";
const MAX_PERSISTED_COUNTER_FLUSHES = 256;
const PERSISTED_COUNTER_FLUSH_TTL_MS = 3 * 24 * 60 * 60 * 1000;

let pendingAdsDelta = 0;
let pendingAdChannels = createChannelsMap();
let flushTimeout = null;
let didMigrateLegacyPersistedCounterFlushes = false;
const retryFlushEntries = new Map();

function normalizeFlushId(value) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return /^[a-z0-9][a-z0-9:_-]{7,127}$/i.test(trimmed) ? trimmed : null;
}

function createCounterFlushId() {
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

function normalizePersistedCounterFlushEntry(value) {
	const safeValue = getBridgeMessageDetail(value);
	const flushId = normalizeFlushId(safeValue?.flushId);
	const adsDelta = normalizeCount(safeValue?.adsDelta);
	const createdAtValue = Number(safeValue?.createdAt);
	const createdAt = Number.isFinite(createdAtValue)
		? Math.trunc(createdAtValue)
		: Date.now();
	const channelDeltas =
		adsDelta > 0
			? mergeChannelDeltaMaps(createChannelsMap(), safeValue?.channelDeltas)
			: createChannelsMap();

	if (!flushId || adsDelta <= 0) {
		return null;
	}

	return {
		flushId,
		adsDelta,
		channelDeltas,
		createdAt,
	};
}

function getPersistedCounterFlushStorageKey(flushId) {
	const safeFlushId = normalizeFlushId(flushId);
	return safeFlushId
		? `${PERSISTED_COUNTER_FLUSH_KEY_PREFIX}${safeFlushId}`
		: null;
}

function migrateLegacyPersistedCounterFlushes() {
	if (
		didMigrateLegacyPersistedCounterFlushes ||
		typeof localStorage === "undefined"
	) {
		return;
	}
	didMigrateLegacyPersistedCounterFlushes = true;

	let legacyEntries = [];
	try {
		const rawValue = localStorage.getItem(LEGACY_PERSISTED_COUNTER_FLUSHES_KEY);
		if (!rawValue) {
			return;
		}
		const parsed = JSON.parse(rawValue);
		if (Array.isArray(parsed)) {
			legacyEntries = parsed;
		}
	} catch {}

	for (const entry of legacyEntries) {
		const safeEntry = normalizePersistedCounterFlushEntry(entry);
		const storageKey = getPersistedCounterFlushStorageKey(safeEntry?.flushId);
		if (!safeEntry || !storageKey) continue;
		try {
			localStorage.setItem(storageKey, JSON.stringify(safeEntry));
		} catch {}
	}

	try {
		localStorage.removeItem(LEGACY_PERSISTED_COUNTER_FLUSHES_KEY);
	} catch {}
}

function readPersistedCounterFlushes() {
	if (typeof localStorage === "undefined") {
		return [];
	}

	migrateLegacyPersistedCounterFlushes();

	const now = Date.now();
	const minCreatedAt = now - PERSISTED_COUNTER_FLUSH_TTL_MS;
	const maxCreatedAt = now + 5 * 60 * 1000;
	const seenFlushIds = new Set();
	const storageKeys = [];

	try {
		for (let index = 0; index < localStorage.length; index++) {
			const storageKey = localStorage.key(index);
			if (
				typeof storageKey === "string" &&
				storageKey.startsWith(PERSISTED_COUNTER_FLUSH_KEY_PREFIX)
			) {
				storageKeys.push(storageKey);
			}
		}

		const normalized = [];
		for (const storageKey of storageKeys) {
			const rawValue = localStorage.getItem(storageKey);
			if (!rawValue) {
				continue;
			}

			let parsed = null;
			try {
				parsed = JSON.parse(rawValue);
			} catch {
				localStorage.removeItem(storageKey);
				continue;
			}

			const safeEntry = normalizePersistedCounterFlushEntry(parsed);
			const expectedStorageKey = getPersistedCounterFlushStorageKey(
				safeEntry?.flushId,
			);
			if (
				!safeEntry ||
				!expectedStorageKey ||
				seenFlushIds.has(safeEntry.flushId)
			) {
				localStorage.removeItem(storageKey);
				continue;
			}
			if (
				safeEntry.createdAt < minCreatedAt ||
				safeEntry.createdAt > maxCreatedAt
			) {
				localStorage.removeItem(storageKey);
				continue;
			}
			if (storageKey !== expectedStorageKey) {
				localStorage.removeItem(storageKey);
				try {
					localStorage.setItem(expectedStorageKey, JSON.stringify(safeEntry));
				} catch {}
			}
			normalized.push(safeEntry);
			seenFlushIds.add(safeEntry.flushId);
		}

		normalized.sort((a, b) => a.createdAt - b.createdAt);
		const overflowCount = Math.max(
			0,
			normalized.length - MAX_PERSISTED_COUNTER_FLUSHES,
		);
		if (overflowCount > 0) {
			for (const overflowEntry of normalized.slice(0, overflowCount)) {
				localStorage.removeItem(
					getPersistedCounterFlushStorageKey(overflowEntry.flushId),
				);
			}
		}

		return normalized.slice(-MAX_PERSISTED_COUNTER_FLUSHES);
	} catch {
		return [];
	}
}

function persistCounterFlushForReplay(entry) {
	const safeEntry = normalizePersistedCounterFlushEntry(entry);
	if (!safeEntry) return false;
	const storageKey = getPersistedCounterFlushStorageKey(safeEntry.flushId);
	if (!storageKey || typeof localStorage === "undefined") {
		return false;
	}

	try {
		localStorage.setItem(storageKey, JSON.stringify(safeEntry));
		readPersistedCounterFlushes();
		return true;
	} catch {
		return false;
	}
}

function clearPersistedCounterFlush(flushId) {
	const safeFlushId = normalizeFlushId(flushId);
	const storageKey = getPersistedCounterFlushStorageKey(safeFlushId);
	if (!storageKey || typeof localStorage === "undefined") return false;
	try {
		localStorage.removeItem(storageKey);
		return true;
	} catch {
		return false;
	}
}

function handlePersistSuccess(response, flushId = null) {
	const safeFlushId = normalizeFlushId(flushId);
	if (safeFlushId) {
		clearPersistedCounterFlush(safeFlushId);
	}

	const newUnlocks = Array.isArray(response?.newUnlocks)
		? response.newUnlocks
		: [];
	for (const id of newUnlocks) {
		postAchievementUnlock(id);
	}
}

function clearScheduledRetryFlush(flushId = null) {
	const safeFlushId = normalizeFlushId(flushId);
	if (safeFlushId) {
		const retryEntry = retryFlushEntries.get(safeFlushId);
		if (!retryEntry) {
			return false;
		}
		if (retryEntry.timeoutId) {
			clearTimeout(retryEntry.timeoutId);
		}
		retryFlushEntries.delete(safeFlushId);
		return true;
	}

	if (retryFlushEntries.size === 0) {
		return false;
	}

	for (const retryEntry of retryFlushEntries.values()) {
		if (retryEntry.timeoutId) {
			clearTimeout(retryEntry.timeoutId);
		}
	}
	retryFlushEntries.clear();
	return true;
}

function scheduleRetryFlush(payload, flushId) {
	const safeFlushId = normalizeFlushId(flushId);
	if (!safeFlushId) return false;

	const previousEntry = retryFlushEntries.get(safeFlushId);
	if (previousEntry?.timeoutId) {
		clearTimeout(previousEntry.timeoutId);
	}

	const retryCount = Number(previousEntry?.retryCount || 0) + 1;
	const nextDelay = Math.min(
		MAX_FLUSH_RETRY_DELAY_MS,
		FLUSH_DELAY_MS * 2 ** Math.min(retryCount, 4),
	);
	const nextEntry = {
		payload,
		retryCount,
		timeoutId: null,
	};
	nextEntry.timeoutId = setTimeout(
		() => {
			const currentEntry = retryFlushEntries.get(safeFlushId);
			if (!currentEntry) {
				return;
			}
			retryFlushEntries.delete(safeFlushId);
			dispatchPersistPayload(currentEntry.payload, { retryOnFailure: true });
		},
		Math.max(0, nextDelay),
	);
	retryFlushEntries.set(safeFlushId, nextEntry);
	return true;
}

function sendPersistPayload(payload, onSuccess, onFailure) {
	try {
		chrome.runtime.sendMessage(payload, (response) => {
			if (chrome.runtime.lastError) {
				onFailure?.(chrome.runtime.lastError.message);
				return;
			}

			const safeResponse = getBridgeMessageData(response);
			if (!safeResponse?.ok) {
				onFailure?.(safeResponse?.error || "unknown error");
				return;
			}

			onSuccess?.(safeResponse);
		});
	} catch (error) {
		onFailure?.(error instanceof Error ? error.message : String(error));
	}
}

function dispatchPersistPayload(
	payload,
	options: { retryOnFailure?: boolean } = {},
) {
	const retryOnFailure = options.retryOnFailure === true;
	const safeDetail = getBridgeMessageDetail(payload?.detail);
	const flushId = normalizeFlushId(safeDetail?.flushId);
	if (flushId) {
		persistCounterFlushForReplay(safeDetail);
	}

	sendPersistPayload(
		payload,
		(response) => {
			clearScheduledRetryFlush(flushId);
			handlePersistSuccess(response, flushId);
			if (pendingAdsDelta > 0) {
				scheduleFlush();
			}
		},
		(errorMessage) => {
			if (!retryOnFailure) {
				return;
			}

			console.error("[TTV AB] Counter persist error:", errorMessage);
			scheduleRetryFlush(payload, flushId);
		},
	);
}

function replayPersistedCounterFlushes() {
	for (const pendingFlush of readPersistedCounterFlushes()) {
		dispatchPersistPayload(
			{
				type: "ttvab-persist-counters",
				detail: pendingFlush,
			},
			{ retryOnFailure: false },
		);
	}
}

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
}

function reconcilePendingDelta(kind, nextStoredCount) {
	const safeStoredCount = normalizeCount(nextStoredCount);
	if (kind === "ads") {
		const previousStoredCount = normalizeCount(bridgeState.storedAdsCount);
		if (safeStoredCount < previousStoredCount) {
			pendingAdsDelta = 0;
			pendingAdChannels = createChannelsMap();
		}
		bridgeState.storedAdsCount = safeStoredCount;
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
	return 0;
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
	const channelDeltas = pendingAdChannels;

	pendingAdsDelta = 0;
	pendingAdChannels = createChannelsMap();

	if (adsDelta === 0) return;

	const payload = {
		type: "ttvab-persist-counters",
		detail: {
			adsDelta,
			channelDeltas,
			flushId: createCounterFlushId(),
			createdAt: Date.now(),
		},
	};

	dispatchPersistPayload(payload, { retryOnFailure: !fireAndForget });
}

function flushPendingCountersOnPageExit() {
	flushCounters({ fireAndForget: true });
}

chrome.storage.local.get(
	["ttvAdblockEnabled", "ttvBufferFixEnabled", "ttvAdsBlocked"],
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
				bridgeState.bufferFixEnabled =
					changes.ttvBufferFixEnabled.newValue !== false;
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
		});

		replayPersistedCounterFlushes();
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
}

window.addEventListener("pagehide", flushPendingCountersOnPageExit, true);
window.addEventListener("beforeunload", flushPendingCountersOnPageExit, true);

startBridgeHandshake();
