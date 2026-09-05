// TTV AB - Bridge Script
// https://github.com/GosuDRM/TTV-AB | See LICENSE for terms

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

function getExactPreviewsPlayerFrameContext(value) {
	try {
		const parsed = new URL(String(value || ""));
		const channel = normalizeChannelName(parsed.searchParams.get("channel"));
		const previewType = parsed.searchParams.get("tp_prev");
		if (
			parsed.protocol !== "https:" ||
			parsed.hostname.toLowerCase() !== "player.twitch.tv" ||
			!channel ||
			(previewType !== "s" && previewType !== "d")
		) {
			return null;
		}
		return {
			channel,
			mediaKey: buildMediaKey("live", channel),
			previewType,
		};
	} catch {
		return null;
	}
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
const BRIDGE_TOKEN_REQUEST_MESSAGE = "ttvab-bridge-token-request";
const BRIDGE_ANNOUNCE_MESSAGE = "ttvab-bridge-announce";
const PREVIEW_FAILURE_DIAGNOSTIC_MESSAGE = "ttvab-preview-failure-diagnostic";
const PREVIEW_FAILURE_DIAGNOSTIC_FORWARD_MESSAGE =
	"ttvab-preview-failure-diagnostic-forward";
const BRIDGE_HANDSHAKE_RETRY_MS = 75;
const FLUSH_DELAY_MS = 200;
const MAX_FLUSH_RETRY_DELAY_MS = 2000;
const INITIAL_STORAGE_READ_TIMEOUT_MS = 1000;
const INITIAL_STORAGE_FAST_RETRY_MS = 250;
const INITIAL_STORAGE_SLOW_RETRY_MS = 30000;
const MAX_INITIAL_STORAGE_FAST_RETRIES = 3;
const MAX_FLUSH_RETRY_ATTEMPTS = 6;
const MAX_RETRY_FLUSH_ENTRIES = 64;
const PERSISTED_FLUSH_RECOVERY_BASE_DELAY_MS = 30000;
const PERSISTED_FLUSH_RECOVERY_MAX_DELAY_MS = 5 * 60 * 1000;
const pendingPageMessages = [];
const MAX_PENDING_PAGE_MESSAGES = 64;
let pageBridgePort = null;
let pageBridgeConnected = false;
let handshakeRetryTimeout = null;
let bridgeSessionToken = null;
let bridgeStateReady = false;

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

function getBridgeSessionToken() {
	if (
		typeof bridgeSessionToken === "string" &&
		bridgeSessionToken.length >= 16
	) {
		return bridgeSessionToken;
	}
	return null;
}

function setBridgeSessionToken(value) {
	if (typeof value !== "string" || value.length < 16) return false;
	if (bridgeSessionToken && bridgeSessionToken !== value) return false;
	bridgeSessionToken = value;
	return true;
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
	const boundPort = port;
	boundPort.addEventListener("message", (event) => {
		if (pageBridgePort !== boundPort) return;
		handlePageBridgeMessage(event.data);
	});
	boundPort.start?.();
	return true;
}

const MAX_HANDSHAKE_RETRIES = 20;
let handshakeRetryCount = 0;

function startBridgeHandshake() {
	const sessionToken = getBridgeSessionToken();
	if (!sessionToken || !bridgeStateReady) return;
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
				token: sessionToken,
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

function handleBridgeTokenRequest(event) {
	if (event.source !== window) return;
	const message = getBridgeMessageData(event.data);
	if (message?.type !== BRIDGE_TOKEN_REQUEST_MESSAGE) return;
	const detail = getBridgeMessageDetail(message.detail);
	if (!setBridgeSessionToken(detail?.token)) return;
	event.stopImmediatePropagation?.();
	startBridgeHandshake();
}

window.addEventListener("message", handleBridgeTokenRequest, true);

function postAchievementUnlock(id) {
	if (typeof id !== "string" || !id) return;
	sendToPage("ttvab-achievement-unlocked", { id });
}

const bridgeState = {
	enabled: true,
	adSpoofingEnabled: true,
	autoplayBackupEnabled: true,
	turboMode: false,
	storedAdsCount: 0,
};
const storageChangeVersions = {
	ttvAdblockEnabled: 0,
	ttvAdSpoofingEnabled: 0,
	ttvAutoplayBackupEnabled: 0,
	ttvTurboMode: 0,
	ttvAdsBlocked: 0,
};
const INITIAL_STORAGE_KEYS = [
	"ttvAdblockEnabled",
	"ttvAdSpoofingEnabled",
	"ttvAutoplayBackupEnabled",
	"ttvTurboMode",
	"ttvAdsBlocked",
];
let initialStorageReadGeneration = 0;
let initialStorageReadFastRetries = 0;
let initialStorageReadInFlight = false;
let initialStorageReadTimer = null;
const MAX_MESSAGE_DELTA = 50;
const LEGACY_PERSISTED_COUNTER_FLUSHES_KEY = "ttvab_pending_counter_flushes";
const PERSISTED_COUNTER_FLUSH_KEY_PREFIX = "ttvab_pending_counter_flush:";
const MAX_PERSISTED_COUNTER_FLUSHES = 256;
const PERSISTED_COUNTER_FLUSH_TTL_MS = 3 * 24 * 60 * 60 * 1000;

const MAX_WATCH_MESSAGE_SECONDS = 600;
const MAX_PENDING_WATCH_SECONDS = 7200;
const WATCH_FLUSH_DELAY_MS = 5000;

const MAX_AD_SECONDS_MESSAGE = 3600;
const MAX_PENDING_AD_SECONDS = 14400;
const MAX_AD_MEASUREMENTS_MESSAGE = 50;
const MAX_PENDING_AD_MEASUREMENTS = 50;

let pendingAdsDelta = 0;
let pendingAdChannels = createChannelsMap();
let pendingWatchSeconds = createChannelsMap();
let pendingAdSeconds = 0;
let pendingChannelAdSeconds = createChannelsMap();
let pendingAdMeasurements = new Map();
let flushTimeout = null;
let didMigrateLegacyPersistedCounterFlushes = false;
const retryFlushEntries = new Map();
const MAX_IN_FLIGHT_PERSIST_REQUESTS = 64;
const inFlightPersistRequests = new Set<string | symbol>();
let persistWorkGeneration = 0;
let persistedFlushRecoveryTimeout = null;
let persistedFlushRecoveryAttempt = 0;

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

function normalizeAdMeasurement(value, fallbackContext = null) {
	const safeValue = getBridgeMessageDetail(value);
	const safeFallback = getBridgeMessageDetail(fallbackContext);
	const id =
		typeof safeValue?.id === "string" &&
		safeValue.id.startsWith("stitched-ad-") &&
		safeValue.id.length <= 256 &&
		!/\p{Cc}/u.test(safeValue.id)
			? safeValue.id
			: null;
	const durationMilliseconds = Math.min(
		normalizeCount(safeValue?.durationMilliseconds),
		600000,
	);
	const rawStartDateMilliseconds = Number(safeValue?.startDateMilliseconds);
	const startDateMilliseconds = Number.isSafeInteger(rawStartDateMilliseconds)
		? Math.max(0, rawStartDateMilliseconds)
		: 0;
	const mediaKey = normalizeMediaKey(
		safeValue?.mediaKey || safeFallback?.mediaKey,
	);
	const channel =
		normalizeChannelName(safeValue?.channel || safeFallback?.channel) ||
		(mediaKey?.startsWith("live:") ? mediaKey.slice(5) : null);
	if (!id || !mediaKey || durationMilliseconds <= 0) return null;
	return {
		id,
		durationMilliseconds,
		mediaKey,
		channel,
		...(startDateMilliseconds ? { startDateMilliseconds } : {}),
	};
}

function getAdMeasurementKey(measurement) {
	const safeMeasurement = normalizeAdMeasurement(measurement);
	return safeMeasurement
		? `${safeMeasurement.mediaKey}\n${safeMeasurement.id}\n${normalizeCount(
				safeMeasurement.startDateMilliseconds,
			)}`
		: null;
}

function normalizeAdMeasurements(
	value,
	fallbackContext = null,
	maxEntries = 50,
) {
	if (!Array.isArray(value)) return [];
	const normalized = [];
	const seenKeys = new Set();
	for (const entry of value) {
		const measurement = normalizeAdMeasurement(entry, fallbackContext);
		const measurementKey = getAdMeasurementKey(measurement);
		if (!measurement || !measurementKey || seenKeys.has(measurementKey)) {
			continue;
		}
		seenKeys.add(measurementKey);
		normalized.push(measurement);
		if (normalized.length >= Math.max(0, normalizeCount(maxEntries))) break;
	}
	return normalized;
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
	const watchDeltas = mergeChannelDeltaMaps(
		createChannelsMap(),
		safeValue?.watchDeltas,
	);
	const hasWatchDeltas = Object.keys(watchDeltas).length > 0;
	const adSecondsDelta = Math.min(
		normalizeCount(safeValue?.adSecondsDelta),
		MAX_PENDING_AD_SECONDS,
	);
	const channelAdSecondsDeltas = mergeChannelDeltaMaps(
		createChannelsMap(),
		safeValue?.channelAdSecondsDeltas,
	);
	const adMeasurements = normalizeAdMeasurements(
		safeValue?.adMeasurements,
		null,
		MAX_PENDING_AD_MEASUREMENTS,
	);

	if (
		!flushId ||
		(adsDelta <= 0 &&
			!hasWatchDeltas &&
			adSecondsDelta <= 0 &&
			adMeasurements.length === 0)
	) {
		return null;
	}

	const entry: PlainObject & { flushId: string; createdAt: number } = {
		flushId,
		adsDelta,
		channelDeltas,
		watchDeltas,
		createdAt,
	};
	if (adSecondsDelta > 0) {
		entry.adSecondsDelta = adSecondsDelta;
		entry.channelAdSecondsDeltas = channelAdSecondsDeltas;
	}
	if (adMeasurements.length > 0) {
		entry.adMeasurements = adMeasurements;
	}
	return entry;
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
		return readPersistedCounterFlushes();
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

function confirmCounterFlush(flushId) {
	const safeFlushId = normalizeFlushId(flushId);
	if (!safeFlushId) return false;
	sendPersistPayload(
		{
			type: "ttvab-confirm-counter-flush",
			detail: { flushId: safeFlushId },
		},
		undefined,
		() => {},
	);
	return true;
}

function handlePersistSuccess(response, flushId = null) {
	const safeFlushId = normalizeFlushId(flushId);
	if (safeFlushId && clearPersistedCounterFlush(safeFlushId)) {
		confirmCounterFlush(safeFlushId);
		if (
			readPersistedCounterFlushes().length === 0 &&
			retryFlushEntries.size === 0
		) {
			clearPersistedFlushRecovery();
		} else {
			schedulePersistedFlushRecovery();
		}
	}

	const newUnlocks =
		!bridgeState.turboMode && Array.isArray(response?.newUnlocks)
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

function clearPersistedFlushRecovery() {
	if (persistedFlushRecoveryTimeout) {
		clearTimeout(persistedFlushRecoveryTimeout);
	}
	persistedFlushRecoveryTimeout = null;
	persistedFlushRecoveryAttempt = 0;
}

function schedulePersistedFlushRecovery(hasPersistedWork = false) {
	if (persistedFlushRecoveryTimeout) return false;
	const hasExhaustedMemoryRetry = Array.from(retryFlushEntries.values()).some(
		(entry) => !entry.timeoutId,
	);
	if (
		!hasPersistedWork &&
		readPersistedCounterFlushes().length === 0 &&
		!hasExhaustedMemoryRetry
	) {
		persistedFlushRecoveryAttempt = 0;
		return false;
	}
	const delay = Math.min(
		PERSISTED_FLUSH_RECOVERY_MAX_DELAY_MS,
		PERSISTED_FLUSH_RECOVERY_BASE_DELAY_MS *
			2 ** Math.min(persistedFlushRecoveryAttempt, 4),
	);
	persistedFlushRecoveryTimeout = setTimeout(() => {
		persistedFlushRecoveryTimeout = null;
		persistedFlushRecoveryAttempt += 1;
		replayPersistedCounterFlushes();
	}, delay);
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
	if (retryCount > MAX_FLUSH_RETRY_ATTEMPTS) {
		retryFlushEntries.delete(safeFlushId);
		retryFlushEntries.set(safeFlushId, {
			payload,
			retryCount: MAX_FLUSH_RETRY_ATTEMPTS,
			timeoutId: null,
		});
		while (retryFlushEntries.size > MAX_RETRY_FLUSH_ENTRIES) {
			const oldestFlushId = retryFlushEntries.keys().next().value;
			if (oldestFlushId === undefined) break;
			clearScheduledRetryFlush(oldestFlushId);
		}
		schedulePersistedFlushRecovery();
		return false;
	}
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
			currentEntry.timeoutId = null;
			dispatchPersistPayload(currentEntry.payload, { retryOnFailure: true });
		},
		Math.max(0, nextDelay),
	);
	retryFlushEntries.delete(safeFlushId);
	retryFlushEntries.set(safeFlushId, nextEntry);
	while (retryFlushEntries.size > MAX_RETRY_FLUSH_ENTRIES) {
		const oldestFlushId = retryFlushEntries.keys().next().value;
		if (oldestFlushId === undefined) break;
		clearScheduledRetryFlush(oldestFlushId);
	}
	return true;
}

function sendPersistPayload(payload, onSuccess, onFailure) {
	const flushId = normalizeFlushId(
		getBridgeMessageDetail(payload?.detail)?.flushId,
	);
	const requestKey = flushId ? `${payload.type}:${flushId}` : Symbol();
	if (inFlightPersistRequests.has(requestKey)) return false;
	if (inFlightPersistRequests.size >= MAX_IN_FLIGHT_PERSIST_REQUESTS) {
		onFailure?.("Counter persistence busy");
		return false;
	}
	inFlightPersistRequests.add(requestKey);
	try {
		chrome.runtime.sendMessage(payload, (response) => {
			inFlightPersistRequests.delete(requestKey);
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
		inFlightPersistRequests.delete(requestKey);
		onFailure?.(error instanceof Error ? error.message : String(error));
		return false;
	}
	return true;
}

function dispatchPersistPayload(
	payload,
	options: { retryOnFailure?: boolean } = {},
) {
	const retryOnFailure = options.retryOnFailure === true;
	const safeDetail = getBridgeMessageDetail(payload?.detail);
	const flushId = normalizeFlushId(safeDetail?.flushId);
	if (bridgeState.turboMode) {
		clearScheduledRetryFlush(flushId);
		if (flushId) clearPersistedCounterFlush(flushId);
		return false;
	}
	const workGeneration = persistWorkGeneration;
	if (flushId) {
		const persistedFlushes = persistCounterFlushForReplay(safeDetail);
		if (persistedFlushes) {
			schedulePersistedFlushRecovery(persistedFlushes.length > 0);
		}
	}

	sendPersistPayload(
		payload,
		(response) => {
			if (workGeneration !== persistWorkGeneration) return;
			clearScheduledRetryFlush(flushId);
			handlePersistSuccess(response, flushId);
			if (hasPendingCounters()) {
				scheduleFlush();
			}
		},
		(errorMessage) => {
			if (!retryOnFailure || workGeneration !== persistWorkGeneration) {
				return;
			}

			console.error("[TTV AB] Counter persist error:", errorMessage);
			scheduleRetryFlush(payload, flushId);
		},
	);
	return true;
}

function replayPersistedCounterFlushes() {
	if (bridgeState.turboMode) {
		discardCounterWorkForTurboMode();
		return;
	}
	const pendingFlushes = readPersistedCounterFlushes();
	const persistedFlushIds = new Set();
	for (const pendingFlush of pendingFlushes) {
		persistedFlushIds.add(pendingFlush.flushId);
		dispatchPersistPayload(
			{
				type: "ttvab-persist-counters",
				detail: pendingFlush,
			},
			{ retryOnFailure: false },
		);
	}
	for (const [flushId, retryEntry] of retryFlushEntries) {
		if (retryEntry.timeoutId || persistedFlushIds.has(flushId)) continue;
		dispatchPersistPayload(retryEntry.payload, { retryOnFailure: false });
	}
	if (pendingFlushes.length > 0 || retryFlushEntries.size > 0) {
		schedulePersistedFlushRecovery();
	} else {
		clearPersistedFlushRecovery();
	}
}

function clearScheduledFlush() {
	if (!flushTimeout) return;
	clearTimeout(flushTimeout);
	flushTimeout = null;
}

function resetPendingCounters() {
	pendingAdsDelta = 0;
	pendingAdChannels = createChannelsMap();
	pendingWatchSeconds = createChannelsMap();
	pendingAdSeconds = 0;
	pendingChannelAdSeconds = createChannelsMap();
	pendingAdMeasurements = new Map();
}

function discardCounterWorkForTurboMode() {
	persistWorkGeneration++;
	clearScheduledFlush();
	resetPendingCounters();
	clearScheduledRetryFlush();
	clearPersistedFlushRecovery();
	for (const entry of readPersistedCounterFlushes()) {
		clearPersistedCounterFlush(entry.flushId);
	}
}

function broadcastState() {
	sendToPage("ttvab-toggle", {
		enabled: Boolean(bridgeState.enabled),
	});
	sendToPage("ttvab-toggle-buffer-fix", {
		enabled: true,
	});
	sendToPage("ttvab-toggle-ad-spoofing", {
		enabled: Boolean(bridgeState.adSpoofingEnabled),
	});
	sendToPage("ttvab-toggle-autoplay-backup", {
		enabled: Boolean(bridgeState.autoplayBackupEnabled),
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
			pendingAdSeconds = 0;
			pendingChannelAdSeconds = createChannelsMap();
			pendingAdMeasurements = new Map();
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
	if (bridgeState.turboMode) {
		discardCounterWorkForTurboMode();
		return;
	}
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
	if (bridgeState.turboMode) {
		discardCounterWorkForTurboMode();
		return;
	}
	const fireAndForget = options.fireAndForget === true;
	clearScheduledFlush();
	const adsDelta = pendingAdsDelta;
	const channelDeltas = pendingAdChannels;
	const watchDeltas = pendingWatchSeconds;
	const adSecondsDelta = pendingAdSeconds;
	const channelAdSecondsDeltas = pendingChannelAdSeconds;
	const adMeasurements = Array.from(pendingAdMeasurements.values());

	resetPendingCounters();

	const hasWatchDeltas = Object.keys(watchDeltas).length > 0;
	if (
		adsDelta === 0 &&
		!hasWatchDeltas &&
		adSecondsDelta === 0 &&
		adMeasurements.length === 0
	) {
		return;
	}

	const detail: PlainObject = {
		adsDelta,
		channelDeltas,
		flushId: createCounterFlushId(),
		createdAt: Date.now(),
	};
	if (hasWatchDeltas) {
		detail.watchDeltas = watchDeltas;
	}
	if (adSecondsDelta > 0) {
		detail.adSecondsDelta = adSecondsDelta;
		detail.channelAdSecondsDeltas = channelAdSecondsDeltas;
	}
	if (adMeasurements.length > 0) {
		detail.adMeasurements = adMeasurements;
	}
	const payload = {
		type: "ttvab-persist-counters",
		detail,
	};

	dispatchPersistPayload(payload, { retryOnFailure: !fireAndForget });
}

function hasPendingCounters() {
	return (
		pendingAdsDelta > 0 ||
		pendingAdSeconds > 0 ||
		pendingAdMeasurements.size > 0 ||
		Object.keys(pendingWatchSeconds).length > 0
	);
}

function flushPendingCountersOnPageExit() {
	if (!hasPendingCounters()) return;
	flushCounters({ fireAndForget: true });
}

function normalizeDefaultEnabled(value) {
	return value !== false;
}

function handleStorageChanges(changes, namespace) {
	if (namespace !== "local") return;
	if (changes.ttvAdblockEnabled) {
		storageChangeVersions.ttvAdblockEnabled += 1;
		const wasEnabled = bridgeState.enabled;
		bridgeState.enabled = normalizeDefaultEnabled(
			changes.ttvAdblockEnabled.newValue,
		);
		if (bridgeStateReady && bridgeState.enabled !== wasEnabled) {
			sendToPage("ttvab-toggle", {
				enabled: bridgeState.enabled,
			});
		}
	}
	if (changes.ttvAdSpoofingEnabled) {
		storageChangeVersions.ttvAdSpoofingEnabled += 1;
		const wasAdSpoofingEnabled = bridgeState.adSpoofingEnabled;
		bridgeState.adSpoofingEnabled = normalizeDefaultEnabled(
			changes.ttvAdSpoofingEnabled.newValue,
		);
		if (
			bridgeStateReady &&
			bridgeState.adSpoofingEnabled !== wasAdSpoofingEnabled
		) {
			sendToPage("ttvab-toggle-ad-spoofing", {
				enabled: bridgeState.adSpoofingEnabled,
			});
		}
	}
	if (changes.ttvAutoplayBackupEnabled) {
		storageChangeVersions.ttvAutoplayBackupEnabled += 1;
		const wasAutoplayBackupEnabled = bridgeState.autoplayBackupEnabled;
		bridgeState.autoplayBackupEnabled = normalizeDefaultEnabled(
			changes.ttvAutoplayBackupEnabled.newValue,
		);
		if (
			bridgeStateReady &&
			bridgeState.autoplayBackupEnabled !== wasAutoplayBackupEnabled
		) {
			sendToPage("ttvab-toggle-autoplay-backup", {
				enabled: bridgeState.autoplayBackupEnabled,
			});
		}
	}
	if (changes.ttvTurboMode) {
		storageChangeVersions.ttvTurboMode += 1;
		const wasTurboMode = bridgeState.turboMode;
		bridgeState.turboMode = changes.ttvTurboMode.newValue === true;
		if (bridgeState.turboMode && !wasTurboMode) {
			discardCounterWorkForTurboMode();
		} else if (bridgeStateReady && wasTurboMode && !bridgeState.turboMode) {
			sendToPage("ttvab-init-count", {
				count: normalizeCount(bridgeState.storedAdsCount),
			});
		}
	}
	if (changes.ttvAdsBlocked) {
		storageChangeVersions.ttvAdsBlocked += 1;
		const nextAdsCount = normalizeCount(changes.ttvAdsBlocked.newValue);
		const previousAdsCount = bridgeState.storedAdsCount;
		bridgeState.storedAdsCount = nextAdsCount;
		if (bridgeState.turboMode) return;
		reconcilePendingDelta("ads", nextAdsCount);
		if (bridgeStateReady && nextAdsCount !== previousAdsCount) {
			sendToPage("ttvab-init-count", {
				count: nextAdsCount,
			});
		}
	}
}

function clearInitialStorageReadTimer() {
	if (initialStorageReadTimer) {
		clearTimeout(initialStorageReadTimer);
	}
	initialStorageReadTimer = null;
}

function scheduleInitialStorageReadRetry() {
	if (
		bridgeStateReady ||
		initialStorageReadInFlight ||
		initialStorageReadTimer
	) {
		return;
	}
	const useFastRetry =
		initialStorageReadFastRetries < MAX_INITIAL_STORAGE_FAST_RETRIES;
	if (useFastRetry) {
		initialStorageReadFastRetries += 1;
	}
	initialStorageReadTimer = setTimeout(
		() => {
			initialStorageReadTimer = null;
			readInitialStorageState();
		},
		useFastRetry
			? INITIAL_STORAGE_FAST_RETRY_MS
			: INITIAL_STORAGE_SLOW_RETRY_MS,
	);
}

function failInitialStorageRead(generation, errorMessage) {
	if (
		bridgeStateReady ||
		generation !== initialStorageReadGeneration ||
		!initialStorageReadInFlight
	) {
		return;
	}
	clearInitialStorageReadTimer();
	initialStorageReadInFlight = false;
	console.error("[TTV AB] Init read error:", errorMessage);
	scheduleInitialStorageReadRetry();
}

function readInitialStorageState() {
	if (
		bridgeStateReady ||
		initialStorageReadInFlight ||
		initialStorageReadTimer
	) {
		return;
	}
	initialStorageReadInFlight = true;
	const generation = ++initialStorageReadGeneration;
	const readVersions = { ...storageChangeVersions };
	initialStorageReadTimer = setTimeout(() => {
		if (generation !== initialStorageReadGeneration) return;
		initialStorageReadTimer = null;
		failInitialStorageRead(generation, "Storage read timed out");
	}, INITIAL_STORAGE_READ_TIMEOUT_MS);
	try {
		chrome.storage.local.get(INITIAL_STORAGE_KEYS, (result) => {
			const readError = chrome.runtime.lastError;
			if (
				bridgeStateReady ||
				generation !== initialStorageReadGeneration ||
				!initialStorageReadInFlight
			) {
				return;
			}
			if (readError || !isPlainObject(result)) {
				failInitialStorageRead(
					generation,
					readError?.message || "Storage returned no settings",
				);
				return;
			}
			clearInitialStorageReadTimer();
			initialStorageReadInFlight = false;

			if (
				storageChangeVersions.ttvAdblockEnabled ===
				readVersions.ttvAdblockEnabled
			) {
				bridgeState.enabled = normalizeDefaultEnabled(result.ttvAdblockEnabled);
			}
			if (
				storageChangeVersions.ttvAdSpoofingEnabled ===
				readVersions.ttvAdSpoofingEnabled
			) {
				bridgeState.adSpoofingEnabled = normalizeDefaultEnabled(
					result.ttvAdSpoofingEnabled,
				);
			}
			if (
				storageChangeVersions.ttvAutoplayBackupEnabled ===
				readVersions.ttvAutoplayBackupEnabled
			) {
				bridgeState.autoplayBackupEnabled = normalizeDefaultEnabled(
					result.ttvAutoplayBackupEnabled,
				);
			}
			if (storageChangeVersions.ttvTurboMode === readVersions.ttvTurboMode) {
				bridgeState.turboMode = result.ttvTurboMode === true;
			}
			if (storageChangeVersions.ttvAdsBlocked === readVersions.ttvAdsBlocked) {
				bridgeState.storedAdsCount = normalizeCount(result.ttvAdsBlocked);
			}
			bridgeStateReady = true;

			broadcastState();
			startBridgeHandshake();

			try {
				window.postMessage(
					{ type: BRIDGE_ANNOUNCE_MESSAGE },
					window.location.origin,
				);
			} catch {}

			if (bridgeState.turboMode) {
				discardCounterWorkForTurboMode();
			} else {
				replayPersistedCounterFlushes();
			}
		});
	} catch (error) {
		failInitialStorageRead(
			generation,
			error instanceof Error ? error.message : String(error),
		);
	}
}

chrome.storage.onChanged.addListener(handleStorageChanges);
readInitialStorageState();

function handlePageBridgeMessage(rawMessage) {
	const message = getBridgeMessageData(rawMessage);
	if (!message) return;
	if (message.type === BRIDGE_READY_MESSAGE) {
		const detail = getBridgeMessageDetail(message.detail);
		if (detail?.token !== getBridgeSessionToken()) {
			return;
		}
		pageBridgeConnected = true;
		handshakeRetryCount = 0;
		clearHandshakeRetryTimeout();
		flushPageMessages();
		broadcastState();
		return;
	}
	if (message.type === "ttvab-request-state") {
		broadcastState();
		return;
	}
	if (message.type === PREVIEW_FAILURE_DIAGNOSTIC_MESSAGE) {
		forwardPreviewFailureDiagnostic(message.detail);
		return;
	}
	if (message.type === "ttvab-persist-counter-flush") {
		if (bridgeState.turboMode) {
			discardCounterWorkForTurboMode();
			return;
		}
		const persistedFlush = normalizePersistedCounterFlushEntry(message.detail);
		if (!persistedFlush) return;
		dispatchPersistPayload(
			{
				type: "ttvab-persist-counters",
				detail: persistedFlush,
			},
			{ retryOnFailure: false },
		);
		return;
	}
	if (message.type === "ttvab-flush-counters") {
		if (bridgeState.turboMode) {
			discardCounterWorkForTurboMode();
			return;
		}
		flushPendingCountersOnPageExit();
		return;
	}

	const detail = getBridgeMessageDetail(message.detail);
	if (
		bridgeState.turboMode &&
		(message.type === "ttvab-ad-blocked" ||
			message.type === "ttvab-ad-seconds" ||
			message.type === "ttvab-watch-time")
	) {
		return;
	}
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
	if (message.type === "ttvab-ad-seconds") {
		const eventPlaybackContext = getMessagePlaybackContext(detail);
		const measurementContext = {
			mediaKey:
				normalizeMediaKey(detail?.mediaKey) || eventPlaybackContext.mediaKey,
			channel:
				normalizeChannelName(detail?.channel) ||
				eventPlaybackContext.channelName,
		};
		const measurements = normalizeAdMeasurements(
			detail?.measurements,
			measurementContext,
			MAX_AD_MEASUREMENTS_MESSAGE,
		);
		if (measurements.length > 0 && pendingAdSeconds > 0) {
			flushCounters();
		}
		for (const measurement of measurements) {
			const measurementKey = getAdMeasurementKey(measurement);
			if (!measurementKey || pendingAdMeasurements.has(measurementKey)) {
				continue;
			}
			pendingAdMeasurements.set(measurementKey, measurement);
			while (pendingAdMeasurements.size > MAX_PENDING_AD_MEASUREMENTS) {
				const oldestKey = pendingAdMeasurements.keys().next().value;
				if (oldestKey === undefined) break;
				pendingAdMeasurements.delete(oldestKey);
			}
		}
		const measuredSeconds =
			measurements.length > 0
				? 0
				: Math.min(normalizeCount(detail?.seconds), MAX_AD_SECONDS_MESSAGE);
		if (measuredSeconds > 0) {
			if (pendingAdMeasurements.size > 0) {
				flushCounters();
			}
			pendingAdSeconds = Math.min(
				pendingAdSeconds + measuredSeconds,
				MAX_PENDING_AD_SECONDS,
			);
			const measuredChannel = normalizeChannelName(detail?.channel);
			if (measuredChannel) {
				pendingChannelAdSeconds[measuredChannel] = Math.min(
					normalizeCount(pendingChannelAdSeconds[measuredChannel]) +
						measuredSeconds,
					MAX_PENDING_AD_SECONDS,
				);
			}
		}
		if (measurements.length > 0 || measuredSeconds > 0) {
			scheduleFlush();
		}
		return;
	}
	if (message.type === "ttvab-watch-time") {
		const watchChannel = normalizeChannelName(detail?.channel);
		const watchSeconds = Math.min(
			normalizeCount(detail?.seconds),
			MAX_WATCH_MESSAGE_SECONDS,
		);
		if (!watchChannel || watchSeconds <= 0) return;
		pendingWatchSeconds[watchChannel] = Math.min(
			normalizeCount(pendingWatchSeconds[watchChannel]) + watchSeconds,
			MAX_PENDING_WATCH_SECONDS,
		);
		scheduleFlush(WATCH_FLUSH_DELAY_MS);
		return;
	}
	if (message.type === "ttvab-logs") {
		const requestId =
			typeof detail?.requestId === "string" ? detail.requestId : null;
		const pending = requestId
			? pendingLogCollections.get(requestId)
			: undefined;
		if (!pending) return;
		pendingLogCollections.delete(requestId as string);
		clearTimeout(pending.timer);
		const sanitized = sanitizeLogEntries(detail?.entries);
		const merged = mergePreviewFailureDiagnostics(
			sanitized.entries,
			addTruncatedLogEntryCounts(
				sanitized.truncatedEntries,
				detail?.truncatedEntries,
			),
		);
		respondToLogCollection(pending.respond, {
			ok: true,
			entries: merged.entries,
			context: sanitizeLogContext(detail?.context),
			truncatedEntries: merged.truncatedEntries,
		});
		return;
	}
}

type PendingLogCollection = {
	respond: (response: unknown) => void;
	timer: ReturnType<typeof setTimeout>;
};
const pendingLogCollections = new Map<string, PendingLogCollection>();
const LOG_COLLECT_TIMEOUT_MS = 5000;
const MAX_LOG_EXPORT_ENTRIES = 1000;
const MAX_LOG_EXPORT_BYTES = 2 * 1024 * 1024;
const LOG_TEXT_ENCODER =
	typeof TextEncoder === "function" ? new TextEncoder() : null;
const MAX_LOG_MESSAGE_CHARS = 4000;
const MAX_LOG_TRUNCATED_ENTRIES = 1000000;
const MAX_LOG_TIMESTAMP_MS = 8640000000000000;
const MAX_LOG_CONTEXT_WORKERS = 12;
const MAX_LOG_CONTEXT_BUFFERED_RANGES = 4;
const MAX_PREVIEW_FAILURE_DIAGNOSTICS = 4;
const MAX_PREVIEW_FAILURE_LOG_ENTRIES = 64;
const LOG_LEVELS = new Set(["debug", "info", "success", "warning", "error"]);
const PREVIEW_FAILURE_REASONS = new Set([
	"retry-failed",
	"clean-fallback-unavailable",
	"fallback-validation-failed",
	"http-status",
]);
type PreviewFailureDiagnostic = {
	channel: string;
	mediaKey: string;
	previewType: "s" | "d";
	reason: string;
	reportedAt: number;
	status: number;
	entries: PlainObject[];
	context: PlainObject | null;
	truncatedEntries: number;
};
const previewFailureDiagnostics: PreviewFailureDiagnostic[] = [];
let droppedPreviewFailureLogEntries = 0;
let logCollectionSequence = 0;

function sanitizeLogTimestamp(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	if (value < 0 || value > MAX_LOG_TIMESTAMP_MS) return 0;
	return Math.trunc(value);
}

function sanitizeLogGeneration(value) {
	if (typeof value !== "number" || !Number.isFinite(value)) return 0;
	return Math.min(1000000, Math.max(0, Math.trunc(value)));
}

function sanitizeLogString(value, maxLength) {
	if (typeof value !== "string") return "";
	const limit = Math.max(0, maxLength);
	let sanitized = "";
	for (const character of value.slice(0, limit * 2)) {
		const code = character.charCodeAt(0);
		sanitized += code <= 31 || code === 127 ? " " : character;
		if (sanitized.length >= limit) break;
	}
	return sanitized.slice(0, limit);
}

function redactLogUrl(value) {
	try {
		const rawValue = String(value);
		const isBlob = rawValue.toLowerCase().startsWith("blob:");
		const parsed = new URL(isBlob ? rawValue.slice(5) : rawValue);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return "[redacted-url]";
		}
		if (isBlob) return `blob:${parsed.origin}/[redacted]`;
		return `${parsed.origin}${parsed.pathname}${parsed.search ? "?[redacted]" : ""}${parsed.hash ? "#[redacted]" : ""}`;
	} catch {
		return "[redacted-url]";
	}
}

function sanitizeLogMessage(value) {
	if (typeof value !== "string") return "";
	let bounded = "";
	for (const character of value.slice(0, MAX_LOG_MESSAGE_CHARS * 2)) {
		const code = character.charCodeAt(0);
		if (
			code <= 9 ||
			code === 11 ||
			code === 12 ||
			(code >= 14 && code <= 31) ||
			code === 127 ||
			(code >= 0x200b && code <= 0x200f) ||
			(code >= 0x202a && code <= 0x202e) ||
			(code >= 0x2060 && code <= 0x206f) ||
			code === 0xfeff
		) {
			continue;
		}
		bounded += character;
	}
	const withoutCookieHeaders = bounded.replace(
		/\b(cookie|set-cookie)\s*:\s*[^\r\n]*/gi,
		"$1: [redacted]",
	);
	const withoutSensitiveAssignments = withoutCookieHeaders.replace(
		/(["']?)(authorization|client-integrity|client_integrity|client-id|client_id|cookie|set-cookie|oauth|access-token|access_token|refresh-token|refresh_token|token|sig|signature|auth|x-device-id|x_device_id|device-id|device_id|did|session-id|session_id|session|user-id|user_id|uid)\1(\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:basic|bearer|oauth)\s+[^\s,;&]+|[^\s,;&]+)/gi,
		(_match, quote, key, separator) =>
			`${quote}${key}${quote}${separator}[redacted]`,
	);
	const withoutSensitiveUrls = withoutSensitiveAssignments.replace(
		/(?:blob:)?https?:\/\/[^\s<>"']+/gi,
		redactLogUrl,
	);
	return sanitizeLogString(withoutSensitiveUrls, MAX_LOG_MESSAGE_CHARS);
}

function getLogEntryByteLength(entry) {
	try {
		if (!LOG_TEXT_ENCODER) throw new Error("TextEncoder unavailable");
		return LOG_TEXT_ENCODER.encode(JSON.stringify(entry)).byteLength;
	} catch {
		return MAX_LOG_EXPORT_BYTES + 1;
	}
}

function sanitizeLogEntry(value) {
	if (!isPlainObject(value)) return null;
	const level =
		typeof value.l === "string" && LOG_LEVELS.has(value.l.toLowerCase())
			? value.l.toLowerCase()
			: "info";
	const entry: PlainObject = {
		t: sanitizeLogTimestamp(value.t),
		l: level,
		m: sanitizeLogMessage(value.m),
		w: value.w === true,
	};
	if (entry.w === true) {
		entry.g = sanitizeLogGeneration(value.g);
		entry.k = normalizeMediaKey(value.k);
	}
	return entry;
}

function sanitizeLogEntries(value) {
	if (!Array.isArray(value)) {
		return { entries: [], truncatedEntries: 0 };
	}
	const entries: PlainObject[] = [];
	let totalBytes = 2;
	const minimumIndex = Math.max(0, value.length - MAX_LOG_EXPORT_ENTRIES);
	let truncatedEntries = minimumIndex;
	for (let index = value.length - 1; index >= minimumIndex; index--) {
		if (entries.length >= MAX_LOG_EXPORT_ENTRIES) {
			truncatedEntries += index - minimumIndex + 1;
			break;
		}
		const entry = sanitizeLogEntry(value[index]);
		if (!entry) {
			truncatedEntries++;
			continue;
		}
		const entryBytes =
			getLogEntryByteLength(entry) + (entries.length > 0 ? 1 : 0);
		if (totalBytes + entryBytes > MAX_LOG_EXPORT_BYTES) {
			truncatedEntries += index - minimumIndex + 1;
			break;
		}
		entries.push(entry);
		totalBytes += entryBytes;
	}
	entries.reverse();
	return {
		entries,
		truncatedEntries: Math.min(MAX_LOG_TRUNCATED_ENTRIES, truncatedEntries),
	};
}

function addTruncatedLogEntryCounts(first, second) {
	const normalize = (value) =>
		typeof value === "number" && Number.isFinite(value)
			? Math.max(0, Math.trunc(value))
			: 0;
	return Math.min(
		MAX_LOG_TRUNCATED_ENTRIES,
		normalize(first) + normalize(second),
	);
}

function sanitizeLogContextString(value, maxLength = 256) {
	const sanitized = sanitizeLogMessage(
		typeof value === "string" ? value : "",
	).slice(0, maxLength);
	return sanitized || null;
}

function sanitizeLogContextUrl(value) {
	if (typeof value !== "string") return "";
	try {
		const parsed = new URL(value);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
		return sanitizeLogString(`${parsed.origin}${parsed.pathname}`, 2048);
	} catch {
		return "";
	}
}

function sanitizeLogContextNumber(value, minimum, maximum, fallback = 0) {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.min(maximum, Math.max(minimum, value));
}

function sanitizeLogContextWorker(value) {
	if (!isPlainObject(value)) return null;
	return {
		generation: sanitizeLogGeneration(value.generation),
		mediaKey: normalizeMediaKey(value.mediaKey),
		crashed: value.crashed === true,
		terminated: value.terminated === true,
		lastPongAt: sanitizeLogTimestamp(value.lastPongAt),
	};
}

function sanitizeLogContextMedia(value) {
	if (!isPlainObject(value)) return null;
	const buffered = [];
	if (Array.isArray(value.buffered)) {
		for (
			let index = 0;
			index < Math.min(value.buffered.length, MAX_LOG_CONTEXT_BUFFERED_RANGES);
			index++
		) {
			const range = value.buffered[index];
			if (!isPlainObject(range)) continue;
			const start = sanitizeLogContextNumber(range.start, 0, 1000000000, -1);
			const end = sanitizeLogContextNumber(range.end, 0, 1000000000, -1);
			if (start < 0 || end < start) continue;
			buffered.push({ start, end });
		}
	}
	const duration = sanitizeLogContextNumber(value.duration, 0, 1000000000, -1);
	return {
		tag: sanitizeLogString(value.tag, 16).toLowerCase(),
		currentTime: sanitizeLogContextNumber(value.currentTime, 0, 1000000000),
		duration: duration >= 0 ? duration : null,
		paused: value.paused === true,
		ended: value.ended === true,
		errorCode: Math.trunc(sanitizeLogContextNumber(value.errorCode, 0, 4)),
		readyState: Math.trunc(sanitizeLogContextNumber(value.readyState, 0, 4)),
		networkState: Math.trunc(
			sanitizeLogContextNumber(value.networkState, 0, 3),
		),
		playbackRate: sanitizeLogContextNumber(value.playbackRate, 0, 16, 1),
		muted: value.muted === true,
		volume: sanitizeLogContextNumber(value.volume, 0, 1, 1),
		width: Math.trunc(sanitizeLogContextNumber(value.width, 0, 16384)),
		height: Math.trunc(sanitizeLogContextNumber(value.height, 0, 16384)),
		buffered,
	};
}

function sanitizeLogContext(value) {
	if (!isPlainObject(value)) return null;
	const context = value;
	const workers = [];
	if (Array.isArray(context.workers)) {
		for (
			let index = 0;
			index < Math.min(context.workers.length, MAX_LOG_CONTEXT_WORKERS);
			index++
		) {
			const worker = context.workers[index];
			const sanitized = sanitizeLogContextWorker(worker);
			if (sanitized) workers.push(sanitized);
		}
	}
	const visibility =
		context.visibility === "visible" || context.visibility === "hidden"
			? context.visibility
			: "unknown";
	return {
		pageUrl: sanitizeLogContextUrl(context.pageUrl),
		pageMediaKey: normalizeMediaKey(context.pageMediaKey),
		pageChannel: normalizeChannelName(context.pageChannel),
		visibility,
		focused: context.focused === true,
		enabled: context.enabled === true,
		adSpoofingEnabled: context.adSpoofingEnabled === true,
		autoplayBackupEnabled: context.autoplayBackupEnabled === true,
		currentAdMediaKey: normalizeMediaKey(context.currentAdMediaKey),
		activeCycleStartedAt: sanitizeLogTimestamp(context.activeCycleStartedAt),
		pinnedBackupPlayerType: sanitizeLogContextString(
			context.pinnedBackupPlayerType,
			32,
		),
		pinnedBackupMediaKey: normalizeMediaKey(context.pinnedBackupMediaKey),
		workers,
		media: sanitizeLogContextMedia(context.media),
	};
}

function sanitizePreviewFailureDiagnostic(value, frameContext) {
	if (!isPlainObject(value) || !isPlainObject(frameContext)) return null;
	const channel = normalizeChannelName(frameContext.channel);
	const mediaKey = normalizeMediaKey(frameContext.mediaKey);
	const previewType =
		frameContext.previewType === "s" || frameContext.previewType === "d"
			? frameContext.previewType
			: null;
	if (!channel || mediaKey !== buildMediaKey("live", channel) || !previewType) {
		return null;
	}
	const context = sanitizeLogContext(value.context);
	if (
		normalizeMediaKey(value.mediaKey) !== mediaKey ||
		normalizeMediaKey(context?.pageMediaKey) !== mediaKey
	) {
		return null;
	}
	const rawEntries = Array.isArray(value.entries) ? value.entries : [];
	const minimumIndex = Math.max(
		0,
		rawEntries.length - MAX_PREVIEW_FAILURE_LOG_ENTRIES,
	);
	const sanitized = sanitizeLogEntries(rawEntries.slice(minimumIndex));
	const reason =
		typeof value.reason === "string" &&
		PREVIEW_FAILURE_REASONS.has(value.reason)
			? value.reason
			: "retry-failed";
	const rawStatus = Number(value.status);
	const status =
		Number.isFinite(rawStatus) && rawStatus >= 100 && rawStatus <= 599
			? Math.trunc(rawStatus)
			: 0;
	return {
		channel,
		mediaKey,
		previewType,
		reason,
		reportedAt: sanitizeLogTimestamp(value.reportedAt),
		status,
		entries: sanitized.entries,
		context,
		truncatedEntries: addTruncatedLogEntryCounts(
			minimumIndex + sanitized.truncatedEntries,
			value.truncatedEntries,
		),
	};
}

function forwardPreviewFailureDiagnostic(value) {
	if (window.top === window) return false;
	const frameContext = getExactPreviewsPlayerFrameContext(
		globalThis.location?.href,
	);
	const diagnostic = sanitizePreviewFailureDiagnostic(value, frameContext);
	if (!diagnostic) return false;
	try {
		chrome.runtime.sendMessage(
			{
				type: PREVIEW_FAILURE_DIAGNOSTIC_MESSAGE,
				detail: diagnostic,
			},
			() => {
				void chrome.runtime.lastError;
			},
		);
		return true;
	} catch {
		return false;
	}
}

function retainPreviewFailureDiagnostic(value) {
	if (window.top !== window || !isPlainObject(value)) return false;
	const frameContext = {
		channel: value.channel,
		mediaKey: value.mediaKey,
		previewType: value.previewType,
	};
	const diagnostic = sanitizePreviewFailureDiagnostic(value, frameContext);
	if (!diagnostic) return false;
	previewFailureDiagnostics.push(diagnostic as PreviewFailureDiagnostic);
	while (previewFailureDiagnostics.length > MAX_PREVIEW_FAILURE_DIAGNOSTICS) {
		const dropped = previewFailureDiagnostics.shift();
		const droppedMedia: PlainObject | null = isPlainObject(
			dropped?.context?.media,
		)
			? (dropped?.context?.media as PlainObject)
			: null;
		droppedPreviewFailureLogEntries = addTruncatedLogEntryCounts(
			droppedPreviewFailureLogEntries,
			1 +
				(Array.isArray(dropped?.entries) ? dropped.entries.length : 0) +
				(droppedMedia ? 1 : 0) +
				Number(dropped?.truncatedEntries || 0),
		);
	}
	return true;
}

function mergePreviewFailureDiagnostics(entries, truncatedEntries = 0) {
	const mergedEntries = Array.isArray(entries) ? [...entries] : [];
	let previewTruncatedEntries = droppedPreviewFailureLogEntries;
	for (const diagnostic of previewFailureDiagnostics) {
		const label = `Hover preview ${diagnostic.channel}`;
		mergedEntries.push({
			t: diagnostic.reportedAt,
			l: "warning",
			m: `${label} master failed: type=${diagnostic.previewType} reason=${diagnostic.reason}${diagnostic.status ? ` status=${diagnostic.status}` : ""}`,
			w: false,
		});
		const media: PlainObject | null = isPlainObject(diagnostic.context?.media)
			? (diagnostic.context?.media as PlainObject)
			: null;
		if (media) {
			const buffered = Array.isArray(media.buffered)
				? media.buffered.map((range) => `${range.start}-${range.end}`).join(",")
				: "";
			mergedEntries.push({
				t: diagnostic.reportedAt,
				l: "info",
				m: `${label} state: error=${media.errorCode} ready=${media.readyState} network=${media.networkState} paused=${media.paused} time=${media.currentTime} buffered=${buffered || "none"}`,
				w: false,
			});
		}
		for (const entry of diagnostic.entries) {
			mergedEntries.push({
				...entry,
				m: `[${label}] ${entry.m}`,
			});
		}
		previewTruncatedEntries = addTruncatedLogEntryCounts(
			previewTruncatedEntries,
			diagnostic.truncatedEntries,
		);
	}
	mergedEntries.sort(
		(first, second) =>
			sanitizeLogTimestamp(first?.t) - sanitizeLogTimestamp(second?.t),
	);
	const sanitized = sanitizeLogEntries(mergedEntries);
	return {
		entries: sanitized.entries,
		truncatedEntries: addTruncatedLogEntryCounts(
			addTruncatedLogEntryCounts(truncatedEntries, previewTruncatedEntries),
			sanitized.truncatedEntries,
		),
	};
}

function respondToLogCollection(respond, response) {
	try {
		respond(response);
	} catch {}
}

function failPendingLogCollections(error) {
	for (const pending of pendingLogCollections.values()) {
		clearTimeout(pending.timer);
		respondToLogCollection(pending.respond, { ok: false, error });
	}
	pendingLogCollections.clear();
}

function invalidatePageBridgeAfterLogFailure(error) {
	const stalePort = pageBridgePort;
	pageBridgeConnected = false;
	pageBridgePort = null;
	try {
		stalePort?.close?.();
	} catch {}
	failPendingLogCollections(error);
	startBridgeHandshake();
}

function handleBridgePageExit() {
	flushPendingCountersOnPageExit();
	failPendingLogCollections("page-message-failed");
}

chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
	if (sender?.id !== chrome.runtime.id) {
		return undefined;
	}
	const message = getBridgeMessageData(rawMessage);
	if (message?.type === PREVIEW_FAILURE_DIAGNOSTIC_FORWARD_MESSAGE) {
		if (!sender?.tab) {
			retainPreviewFailureDiagnostic(message.detail);
		}
		return undefined;
	}
	if (message?.type !== "ttvab-collect-logs") {
		return undefined;
	}
	if (!pageBridgeConnected || !pageBridgePort) {
		respondToLogCollection(sendResponse, {
			ok: false,
			error: "page-bridge-unavailable",
		});
		startBridgeHandshake();
		return undefined;
	}
	logCollectionSequence = (logCollectionSequence + 1) % 1000000;
	const requestId = `logs-${Date.now()}-${logCollectionSequence}-${Math.random().toString(36).slice(2, 10)}`;
	const timer = setTimeout(() => {
		if (!pendingLogCollections.has(requestId)) return;
		invalidatePageBridgeAfterLogFailure("page-response-timeout");
	}, LOG_COLLECT_TIMEOUT_MS);
	pendingLogCollections.set(requestId, { respond: sendResponse, timer });
	try {
		pageBridgePort.postMessage({
			type: "ttvab-collect-logs",
			detail: { requestId },
		});
	} catch {
		invalidatePageBridgeAfterLogFailure("page-message-failed");
	}
	return true;
});

window.addEventListener("pagehide", handleBridgePageExit, true);
window.addEventListener("beforeunload", handleBridgePageExit, true);
