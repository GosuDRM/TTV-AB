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

function normalizeCounterEventId(value) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return /^[a-z0-9:_-]{1,200}$/i.test(trimmed) ? trimmed : null;
}

function isPlainObject(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function coerceMessageObject(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	if (isPlainObject(value)) {
		return value;
	}
	try {
		const cloned = JSON.parse(JSON.stringify(value));
		return isPlainObject(cloned) ? cloned : null;
	} catch {}
	try {
		const cloned = Object.create(null);
		for (const [key, entryValue] of Object.entries(value)) {
			cloned[key] = entryValue;
		}
		return cloned;
	} catch {}
	return null;
}

function isTrustedWindowSource(source) {
	if (!source) return false;
	if (source === window) return true;
	try {
		if (typeof window.wrappedJSObject !== "undefined") {
			return source === window.wrappedJSObject;
		}
	} catch {}
	return false;
}

function getBridgeMessageData(value) {
	return coerceMessageObject(value);
}

function getBridgeMessageDetail(value) {
	const safeValue = coerceMessageObject(value);
	if (!safeValue) return null;
	const count = safeValue.count;
	const delta = safeValue.delta;
	const kind = safeValue.kind;
	const channel = safeValue.channel;
	const eventId = safeValue.eventId;
	const source = safeValue.source;
	const mediaKey = safeValue.mediaKey;
	const pageChannel = safeValue.pageChannel;
	const pageMediaKey = safeValue.pageMediaKey;
	return {
		count:
			typeof count === "string" && count.trim() !== "" ? Number(count) : count,
		delta:
			typeof delta === "string" && delta.trim() !== "" ? Number(delta) : delta,
		kind: typeof kind === "string" ? kind : null,
		channel: typeof channel === "string" ? channel : null,
		eventId: typeof eventId === "string" ? eventId : null,
		source: typeof source === "string" ? source : null,
		mediaKey: typeof mediaKey === "string" ? mediaKey : null,
		pageChannel: typeof pageChannel === "string" ? pageChannel : null,
		pageMediaKey: typeof pageMediaKey === "string" ? pageMediaKey : null,
	};
}

function getCounterSnapshot(value) {
	const safeValue = coerceMessageObject(value);
	if (!safeValue) return null;
	const ads = safeValue.ads;
	const domAds = safeValue.domAds;
	return {
		ads: typeof ads === "string" && ads.trim() !== "" ? Number(ads) : ads,
		domAds:
			typeof domAds === "string" && domAds.trim() !== ""
				? Number(domAds)
				: domAds,
	};
}

function createChannelsMap() {
	return Object.create(null);
}

function mergeChannelDeltaMaps(target, source) {
	const safeSource = coerceMessageObject(source);
	if (!safeSource) return target;
	for (const [channelName, count] of Object.entries(safeSource)) {
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
		"overlay-ad",
		"promoted-card",
	]);
}

function getCurrentChannelName() {
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
	const normalizedCandidate = normalizeChannelName(candidate);
	return normalizedCandidate && !reserved.has(normalizedCandidate)
		? normalizedCandidate
		: null;
}

function postAchievementUnlock(id) {
	if (typeof id !== "string" || !id) return;
	window.postMessage(
		{ type: "ttvab-achievement-unlocked", detail: { id } },
		"*",
	);
}

const bridgeState = {
	enabled: true,
	storedAdsCount: 0,
	storedDomAdsCount: 0,
};

const KNOWN_DOM_CLEANUP_KINDS = createKnownCleanupKinds();
const MAX_MESSAGE_DELTA = 50;
const MAX_SEEN_COUNTER_EVENTS = 2000;
const COUNTER_EVENT_TTL_MS = 15 * 60 * 1000;
const ADS_PREVIEW_KEY = "ttvAdsBlockedPreview";
const DOM_ADS_PREVIEW_KEY = "ttvDomAdsBlockedPreview";

const seenCounterEvents = new Map();

let pendingAdsDelta = 0;
let pendingDomAdsDelta = 0;
let pendingAdChannels = createChannelsMap();
let flushTimeout = null;
let flushRetryCount = 0;

function postCountMessages() {
	window.postMessage(
		{
			type: "ttvab-init-count",
			detail: { count: normalizeCount(bridgeState.storedAdsCount) },
		},
		"*",
	);
	window.postMessage(
		{
			type: "ttvab-init-dom-ads-count",
			detail: { count: normalizeCount(bridgeState.storedDomAdsCount) },
		},
		"*",
	);
}

function notifyPopupCounterPreview(_adsCount, _domAdsCount) {}

function notifyBackgroundCounterPreview(adsCount, domAdsCount) {
	try {
		chrome.runtime.sendMessage({
			type: "ttvab-preview-counters",
			detail: {
				adsCount: normalizeCount(adsCount),
				domAdsCount: normalizeCount(domAdsCount),
			},
		});
	} catch {}
}

function writeCounterPreview(adsCount, domAdsCount) {
	try {
		chrome.storage.local.set({
			[ADS_PREVIEW_KEY]: normalizeCount(adsCount),
			[DOM_ADS_PREVIEW_KEY]: normalizeCount(domAdsCount),
		});
	} catch {}
}

function broadcastState() {
	window.postMessage(
		{
			type: "ttvab-toggle",
			detail: { enabled: Boolean(bridgeState.enabled) },
		},
		"*",
	);
	postCountMessages();
}

function reconcilePendingDelta(kind, nextStoredCount) {
	const safeStoredCount = normalizeCount(nextStoredCount);
	if (kind === "ads") {
		const queuedTotal =
			normalizeCount(bridgeState.storedAdsCount) +
			normalizeCount(pendingAdsDelta);
		if (safeStoredCount !== queuedTotal) {
			pendingAdsDelta = 0;
			pendingAdChannels = createChannelsMap();
			flushRetryCount = 0;
		}
		bridgeState.storedAdsCount = safeStoredCount;
		return;
	}
	if (kind === "domAds") {
		const queuedTotal =
			normalizeCount(bridgeState.storedDomAdsCount) +
			normalizeCount(pendingDomAdsDelta);
		if (safeStoredCount !== queuedTotal) {
			pendingDomAdsDelta = 0;
			flushRetryCount = 0;
		}
		bridgeState.storedDomAdsCount = safeStoredCount;
	}
}

function pruneSeenCounterEvents(now = Date.now()) {
	for (const [eventId, seenAt] of seenCounterEvents.entries()) {
		if (now - seenAt <= COUNTER_EVENT_TTL_MS) continue;
		seenCounterEvents.delete(eventId);
	}
	while (seenCounterEvents.size > MAX_SEEN_COUNTER_EVENTS) {
		const oldestEventId = seenCounterEvents.keys().next().value;
		if (!oldestEventId) break;
		seenCounterEvents.delete(oldestEventId);
	}
}

function rememberCounterEvent(eventId, now = Date.now()) {
	const safeEventId = normalizeCounterEventId(eventId);
	if (!safeEventId) return false;
	pruneSeenCounterEvents(now);
	if (seenCounterEvents.has(safeEventId)) {
		return false;
	}
	seenCounterEvents.set(safeEventId, now);
	pruneSeenCounterEvents(now);
	return true;
}

function queueExplicitDelta(kind, delta) {
	const safeDelta = normalizeCount(delta);
	if (safeDelta <= 0) {
		return 0;
	}
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

function requeueFlushWork(adsDelta, domAdsDelta, channelDeltas) {
	pendingAdsDelta += normalizeCount(adsDelta);
	pendingDomAdsDelta += normalizeCount(domAdsDelta);
	pendingAdChannels = mergeChannelDeltaMaps(pendingAdChannels, channelDeltas);
	if (flushRetryCount < 2) {
		flushRetryCount++;
		scheduleFlush();
	}
}

function scheduleFlush() {
	if (flushTimeout) return;
	flushTimeout = setTimeout(() => {
		flushTimeout = null;
		flushCounters();
	}, 200);
}

function flushCounters() {
	const adsDelta = pendingAdsDelta;
	const domAdsDelta = pendingDomAdsDelta;
	const channelDeltas = pendingAdChannels;

	pendingAdsDelta = 0;
	pendingDomAdsDelta = 0;
	pendingAdChannels = createChannelsMap();

	if (adsDelta === 0 && domAdsDelta === 0) return;

	chrome.runtime.sendMessage(
		{
			type: "ttvab-persist-counters",
			detail: {
				adsDelta,
				domAdsDelta,
				channelDeltas,
			},
		},
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
			const safeCounts = getCounterSnapshot(safeResponse.counts);
			if (safeCounts) {
				bridgeState.storedAdsCount = normalizeCount(safeCounts.ads);
				bridgeState.storedDomAdsCount = normalizeCount(safeCounts.domAds);
				postCountMessages();
				notifyPopupCounterPreview(
					bridgeState.storedAdsCount,
					bridgeState.storedDomAdsCount,
				);
				notifyBackgroundCounterPreview(
					bridgeState.storedAdsCount,
					bridgeState.storedDomAdsCount,
				);
				writeCounterPreview(
					bridgeState.storedAdsCount,
					bridgeState.storedDomAdsCount,
				);
			}

			const newUnlocks = Array.isArray(safeResponse.newUnlocks)
				? safeResponse.newUnlocks
				: [];
			for (const id of newUnlocks) {
				postAchievementUnlock(id);
			}
		},
	);
}

chrome.storage.local.get(
	["ttvAdblockEnabled", "ttvAdsBlocked", "ttvDomAdsBlocked"],
	(result) => {
		if (chrome.runtime.lastError) {
			console.error(
				"[TTV AB] Init read error:",
				chrome.runtime.lastError.message,
			);
		}
		const safeResult = result || {};
		bridgeState.enabled = safeResult.ttvAdblockEnabled !== false;
		bridgeState.storedAdsCount = normalizeCount(safeResult.ttvAdsBlocked);
		bridgeState.storedDomAdsCount = normalizeCount(safeResult.ttvDomAdsBlocked);
		writeCounterPreview(
			bridgeState.storedAdsCount,
			bridgeState.storedDomAdsCount,
		);
		notifyBackgroundCounterPreview(
			bridgeState.storedAdsCount,
			bridgeState.storedDomAdsCount,
		);

		broadcastState();

		window.addEventListener("message", (e) => {
			if (!isTrustedWindowSource(e.source)) return;
			const message = getBridgeMessageData(e.data);
			if (!message || message.type !== "ttvab-request-state") return;
			broadcastState();
		});

		chrome.storage.onChanged.addListener((changes, namespace) => {
			if (namespace !== "local") return;
			if (changes.ttvAdblockEnabled) {
				const wasEnabled = bridgeState.enabled;
				bridgeState.enabled = changes.ttvAdblockEnabled.newValue !== false;
				if (bridgeState.enabled !== wasEnabled) {
					window.postMessage(
						{
							type: "ttvab-toggle",
							detail: { enabled: bridgeState.enabled },
						},
						"*",
					);
				}
			}
			if (changes.ttvAdsBlocked) {
				const nextAdsCount = normalizeCount(changes.ttvAdsBlocked.newValue);
				const previousAdsCount = bridgeState.storedAdsCount;
				reconcilePendingDelta("ads", nextAdsCount);
				if (nextAdsCount !== previousAdsCount) {
					writeCounterPreview(nextAdsCount, bridgeState.storedDomAdsCount);
					notifyBackgroundCounterPreview(
						nextAdsCount,
						bridgeState.storedDomAdsCount,
					);
					window.postMessage(
						{
							type: "ttvab-init-count",
							detail: { count: nextAdsCount },
						},
						"*",
					);
				}
			}
			if (changes.ttvDomAdsBlocked) {
				const nextDomAdsCount = normalizeCount(
					changes.ttvDomAdsBlocked.newValue,
				);
				const previousDomAdsCount = bridgeState.storedDomAdsCount;
				reconcilePendingDelta("domAds", nextDomAdsCount);
				if (nextDomAdsCount !== previousDomAdsCount) {
					writeCounterPreview(bridgeState.storedAdsCount, nextDomAdsCount);
					notifyBackgroundCounterPreview(
						bridgeState.storedAdsCount,
						nextDomAdsCount,
					);
					window.postMessage(
						{
							type: "ttvab-init-dom-ads-count",
							detail: { count: nextDomAdsCount },
						},
						"*",
					);
				}
			}
		});
	},
);

window.addEventListener("message", (e) => {
	if (!isTrustedWindowSource(e.source)) return;
	const message = getBridgeMessageData(e.data);
	if (!message) return;
	const detail = getBridgeMessageDetail(message.detail);
	const currentChannel = getCurrentChannelName();

	if (message.type === "ttvab-ad-blocked") {
		if (!detail || !Number.isFinite(detail.count)) return;
		const blockedChannel = normalizeChannelName(detail.channel);
		if (blockedChannel && currentChannel && blockedChannel !== currentChannel) {
			return;
		}
		const eventId = normalizeCounterEventId(detail.eventId);
		let delta = 0;
		if (eventId) {
			const explicitDelta = normalizeCount(detail.delta);
			if (explicitDelta <= 0) {
				console.warn(
					"[TTV AB] Ignoring ad-blocked event with invalid delta:",
					eventId,
				);
				return;
			}
			if (!rememberCounterEvent(eventId)) {
				return;
			}
			delta = queueExplicitDelta("ads", explicitDelta);
		} else {
			delta = queueTotalDelta("ads", detail.count);
		}
		if (blockedChannel && delta > 0) {
			pendingAdChannels[blockedChannel] =
				normalizeCount(pendingAdChannels[blockedChannel]) + delta;
		}
		if (delta > 0) {
			const nextAdsCount =
				normalizeCount(bridgeState.storedAdsCount) +
				normalizeCount(pendingAdsDelta);
			const nextDomAdsCount =
				normalizeCount(bridgeState.storedDomAdsCount) +
				normalizeCount(pendingDomAdsDelta);
			notifyPopupCounterPreview(nextAdsCount, nextDomAdsCount);
			notifyBackgroundCounterPreview(nextAdsCount, nextDomAdsCount);
			writeCounterPreview(nextAdsCount, nextDomAdsCount);
			scheduleFlush();
		}
		return;
	}

	if (message.type === "ttvab-dom-ad-cleanup") {
		if (!detail || !Number.isFinite(detail.count)) return;
		const cleanupKind =
			typeof detail.kind === "string" ? detail.kind.trim().toLowerCase() : "";
		if (!KNOWN_DOM_CLEANUP_KINDS.has(cleanupKind)) return;
		const cleanupChannel = normalizeChannelName(detail.channel);
		if (cleanupChannel && currentChannel && cleanupChannel !== currentChannel) {
			return;
		}
		const eventId = normalizeCounterEventId(detail.eventId);
		let delta = 0;
		if (eventId) {
			const explicitDelta = normalizeCount(detail.delta);
			if (explicitDelta <= 0) {
				console.warn(
					"[TTV AB] Ignoring dom-ad event with invalid delta:",
					eventId,
				);
				return;
			}
			if (!rememberCounterEvent(eventId)) {
				return;
			}
			delta = queueExplicitDelta("domAds", explicitDelta);
		} else {
			delta = queueTotalDelta("domAds", detail.count);
		}
		if (delta > 0) {
			const nextAdsCount =
				normalizeCount(bridgeState.storedAdsCount) +
				normalizeCount(pendingAdsDelta);
			const nextDomAdsCount =
				normalizeCount(bridgeState.storedDomAdsCount) +
				normalizeCount(pendingDomAdsDelta);
			notifyPopupCounterPreview(nextAdsCount, nextDomAdsCount);
			notifyBackgroundCounterPreview(nextAdsCount, nextDomAdsCount);
			writeCounterPreview(nextAdsCount, nextDomAdsCount);
			scheduleFlush();
		}
	}
});
