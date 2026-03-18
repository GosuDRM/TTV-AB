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

function isPlainObject(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
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

let pendingAdsDelta = 0;
let pendingDomAdsDelta = 0;
let pendingAdChannels = createChannelsMap();
let flushTimeout = null;
let flushRetryCount = 0;

function broadcastState() {
	window.postMessage(
		{
			type: "ttvab-toggle",
			detail: { enabled: Boolean(bridgeState.enabled) },
		},
		"*",
	);
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

		broadcastState();

		window.addEventListener("message", (e) => {
			if (e.source !== window) return;
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
	if (e.source !== window) return;
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
		const delta = queueTotalDelta("ads", detail.count);
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
		const cleanupChannel = normalizeChannelName(detail.channel);
		if (cleanupChannel && currentChannel && cleanupChannel !== currentChannel) {
			return;
		}
		const delta = queueTotalDelta("domAds", detail.count);
		if (delta > 0) {
			scheduleFlush();
		}
	}
});
