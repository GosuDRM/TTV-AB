// TTV AB - Bridge Script
// https://github.com/GosuDRM/TTV-AB | MIT License

function getDateKey(date = new Date()) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function getTodayKey() {
	return getDateKey(new Date());
}

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

function createDailyStatsMap() {
	return Object.create(null);
}

function isValidDateKey(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
		return false;
	}
	const [year, month, day] = String(value)
		.split("-")
		.map((part) => Number.parseInt(part, 10));
	if (
		!Number.isFinite(year) ||
		!Number.isFinite(month) ||
		!Number.isFinite(day)
	) {
		return false;
	}
	const date = new Date(year, month - 1, day);
	return (
		!Number.isNaN(date.getTime()) &&
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day
	);
}

function normalizeChannelsMap(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return createChannelsMap();
	}
	const normalized = createChannelsMap();
	for (const [channelName, count] of Object.entries(value)) {
		const safeChannel = normalizeChannelName(channelName);
		if (!safeChannel) continue;
		normalized[safeChannel] =
			normalizeCount(normalized[safeChannel]) + normalizeCount(count);
	}
	return normalized;
}

function normalizeDailyStatsMap(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return createDailyStatsMap();
	}
	const normalized = createDailyStatsMap();
	for (const [dateKey, entry] of Object.entries(value)) {
		if (!isValidDateKey(dateKey)) continue;
		const safeEntry = isPlainObject(entry) ? entry : {};
		normalized[dateKey] = {
			ads: normalizeCount(safeEntry.ads),
			domAds: normalizeCount(safeEntry.domAds),
		};
	}
	return normalized;
}

const ACHIEVEMENTS = [
	{ id: "first_block", threshold: 1, type: "ads" },
	{ id: "block_10", threshold: 10, type: "ads" },
	{ id: "block_100", threshold: 100, type: "ads" },
	{ id: "block_500", threshold: 500, type: "ads" },
	{ id: "block_1000", threshold: 1000, type: "ads" },
	{ id: "block_5000", threshold: 5000, type: "ads" },
	{ id: "popup_10", threshold: 10, type: "domAds" },
	{ id: "popup_50", threshold: 50, type: "domAds" },
	{ id: "time_1h", threshold: 3600, type: "time" },
	{ id: "time_10h", threshold: 36000, type: "time" },
	{ id: "channels_5", threshold: 5, type: "channels" },
	{ id: "channels_20", threshold: 20, type: "channels" },
];

const AVG_AD_DURATION = 22;
const MAX_CHANNELS = 100;
const bridgeState = {
	enabled: true,
	storedAdsCount: 0,
	storedDomAdsCount: 0,
};

const StorageQueue = {
	_chain: Promise.resolve(),
	add(task) {
		const withRetry = async () => {
			const maxRetries = 3;
			for (let i = 0; i < maxRetries; i++) {
				try {
					return await task();
				} catch (err) {
					if (i === maxRetries - 1) throw err;
					await new Promise((r) => setTimeout(r, 2 ** i * 200));
				}
			}
		};

		this._chain = this._chain.then(withRetry).catch((err) => {
			console.error("[TTV AB] Storage queue error:", err);
		});
	},
};

function updateStats(
	type,
	channel,
	totalAdsBlocked,
	totalDomAdsBlocked,
	countDelta = 1,
	retryDepth = 0,
) {
	if (!["ads", "domAds"].includes(type)) {
		return Promise.resolve();
	}
	const safeDelta = normalizeCount(countDelta);
	if (safeDelta <= 0) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		chrome.storage.local.get(["ttvStats"], (result) => {
			if (chrome.runtime.lastError) {
				console.error(
					"[TTV AB] Stats read error:",
					chrome.runtime.lastError.message,
				);
				if (retryDepth < 2) {
					StorageQueue.add(() =>
						updateStats(
							type,
							channel,
							totalAdsBlocked,
							totalDomAdsBlocked,
							safeDelta,
							retryDepth + 1,
						),
					);
				}
				resolve();
				return;
			}
			const safeResult = result || {};
			const stats = isPlainObject(safeResult.ttvStats)
				? safeResult.ttvStats
				: {};
			stats.daily = normalizeDailyStatsMap(stats.daily);
			stats.channels = normalizeChannelsMap(stats.channels);
			stats.achievements = Array.isArray(stats.achievements)
				? [
						...new Set(
							stats.achievements.filter((id) => typeof id === "string"),
						),
					]
				: [];
			const today = getTodayKey();

			if (
				!stats.daily[today] ||
				typeof stats.daily[today] !== "object" ||
				Array.isArray(stats.daily[today])
			) {
				stats.daily[today] = { ads: 0, domAds: 0 };
			}
			stats.daily[today].ads = normalizeCount(stats.daily[today].ads);
			stats.daily[today].domAds = normalizeCount(stats.daily[today].domAds);
			stats.daily[today][type] = normalizeCount(stats.daily[today][type]);
			stats.daily[today][type] += safeDelta;

			const cutoff = new Date();
			cutoff.setDate(cutoff.getDate() - 30);
			const cutoffKey = getDateKey(cutoff);
			for (const key of Object.keys(stats.daily)) {
				if (key < cutoffKey) {
					delete stats.daily[key];
				}
			}

			const safeChannel = normalizeChannelName(channel);
			if (type === "ads" && safeChannel) {
				stats.channels[safeChannel] = normalizeCount(
					stats.channels[safeChannel],
				);
				stats.channels[safeChannel] += safeDelta;

				const channelEntries = Object.entries(stats.channels).map(
					([channelName, count]) => [channelName, normalizeCount(count)],
				);
				if (channelEntries.length > MAX_CHANNELS) {
					channelEntries.sort((a, b) => b[1] - a[1]);
					const trimmedChannels = createChannelsMap();
					for (const [channelName, count] of channelEntries.slice(
						0,
						MAX_CHANNELS,
					)) {
						trimmedChannels[channelName] = count;
					}
					stats.channels = trimmedChannels;
				}
			}

			const unlocked = stats.achievements || [];
			const timeSaved = totalAdsBlocked * AVG_AD_DURATION;
			const channelCount = normalizeCount(Object.keys(stats.channels).length);
			const newUnlocks = [];

			for (const ach of ACHIEVEMENTS) {
				if (unlocked.includes(ach.id)) continue;

				let value = 0;
				switch (ach.type) {
					case "ads":
						value = totalAdsBlocked;
						break;
					case "domAds":
						value = totalDomAdsBlocked;
						break;
					case "time":
						value = timeSaved;
						break;
					case "channels":
						value = channelCount;
						break;
				}

				if (value >= ach.threshold) {
					unlocked.push(ach.id);
					newUnlocks.push(ach.id);
				}
			}

			stats.achievements = unlocked;

			chrome.storage.local.set({ ttvStats: stats }, () => {
				if (chrome.runtime.lastError) {
					console.error(
						"[TTV AB] Stats write error:",
						chrome.runtime.lastError.message,
					);
					if (retryDepth < 2) {
						StorageQueue.add(() =>
							updateStats(
								type,
								channel,
								totalAdsBlocked,
								totalDomAdsBlocked,
								safeDelta,
								retryDepth + 1,
							),
						);
					}
					resolve();
					return;
				}
				for (const id of newUnlocks) {
					window.postMessage(
						{ type: "ttvab-achievement-unlocked", detail: { id: id } },
						"*",
					);
				}
				resolve();
			});
		});
	});
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

let pendingAdsDelta = 0;
let pendingDomAdsDelta = 0;
let pendingAdChannels = [];
let flushTimeout = null;
let flushRetryCount = 0;

function reconcilePendingDelta(kind, nextStoredCount) {
	const safeStoredCount = normalizeCount(nextStoredCount);
	if (kind === "ads") {
		const queuedTotal =
			normalizeCount(bridgeState.storedAdsCount) +
			normalizeCount(pendingAdsDelta);
		if (safeStoredCount !== queuedTotal) {
			pendingAdsDelta = 0;
			pendingAdChannels = [];
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
	const maxMessageDelta = 50;
	if (kind === "ads") {
		const queuedTotal =
			normalizeCount(bridgeState.storedAdsCount) +
			normalizeCount(pendingAdsDelta);
		const delta = safeNextTotal - queuedTotal;
		const safeDelta = Math.min(Math.max(delta, 0), maxMessageDelta);
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
		const safeDelta = Math.min(Math.max(delta, 0), maxMessageDelta);
		if (safeDelta > 0) {
			pendingDomAdsDelta += safeDelta;
		}
		return safeDelta;
	}
	return 0;
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
	const channels = pendingAdChannels.slice();
	pendingAdsDelta = 0;
	pendingDomAdsDelta = 0;
	pendingAdChannels = [];

	if (adsDelta === 0 && domAdsDelta === 0) return;

	StorageQueue.add(() => {
		return new Promise((resolve) => {
			chrome.storage.local.get(
				["ttvAdsBlocked", "ttvDomAdsBlocked"],
				(result) => {
					if (chrome.runtime.lastError) {
						console.error(
							"[TTV AB] Storage read error:",
							chrome.runtime.lastError.message,
						);
						pendingAdsDelta += adsDelta;
						pendingDomAdsDelta += domAdsDelta;
						pendingAdChannels.push(...channels);
						if (flushRetryCount < 2) {
							flushRetryCount++;
							scheduleFlush();
						}
						resolve();
						return;
					}

					const safeResult = result || {};
					const updates = {};
					const baseAds = normalizeCount(safeResult.ttvAdsBlocked);
					const baseDomAds = normalizeCount(safeResult.ttvDomAdsBlocked);
					const newAds = baseAds + adsDelta;
					const newDomAds = baseDomAds + domAdsDelta;
					if (adsDelta > 0) updates.ttvAdsBlocked = newAds;
					if (domAdsDelta > 0) updates.ttvDomAdsBlocked = newDomAds;

					chrome.storage.local.set(updates, async () => {
						if (chrome.runtime.lastError) {
							console.error(
								"[TTV AB] Storage write error:",
								chrome.runtime.lastError.message,
							);
							pendingAdsDelta += adsDelta;
							pendingDomAdsDelta += domAdsDelta;
							pendingAdChannels.push(...channels);
							if (flushRetryCount < 2) {
								flushRetryCount++;
								scheduleFlush();
							}
							resolve();
							return;
						}

						flushRetryCount = 0;
						try {
							const channelTotals = createChannelsMap();
							for (const ch of channels) {
								channelTotals[ch] = normalizeCount(channelTotals[ch]) + 1;
							}
							let scopedAdsDelta = 0;
							for (const [channelName, channelDelta] of Object.entries(
								channelTotals,
							)) {
								scopedAdsDelta += normalizeCount(channelDelta);
								await updateStats(
									"ads",
									channelName,
									newAds,
									newDomAds,
									channelDelta,
								);
							}
							const unscopedAdsDelta = Math.max(0, adsDelta - scopedAdsDelta);
							if (unscopedAdsDelta > 0) {
								await updateStats(
									"ads",
									null,
									newAds,
									newDomAds,
									unscopedAdsDelta,
								);
							}
							if (domAdsDelta > 0) {
								await updateStats(
									"domAds",
									null,
									newAds,
									newDomAds,
									domAdsDelta,
								);
							}
						} catch (statsErr) {
							console.error("[TTV AB] Stats error:", statsErr.message);
						}
						resolve();
					});
				},
			);
		});
	});
}

window.addEventListener("message", (e) => {
	if (e.source !== window) return;
	const message = getBridgeMessageData(e.data);
	if (!message) return;
	const detail = getBridgeMessageDetail(message.detail);

	if (message.type === "ttvab-ad-blocked") {
		if (!detail || !Number.isFinite(detail.count)) return;
		const channel = normalizeChannelName(detail.channel);
		const delta = queueTotalDelta("ads", detail.count);
		if (channel && delta > 0) {
			for (let i = 0; i < delta; i++) {
				pendingAdChannels.push(channel);
			}
		}
		if (delta > 0) {
			scheduleFlush();
		}
		return;
	}

	if (message.type === "ttvab-dom-ad-cleanup") {
		if (!detail || !Number.isFinite(detail.count)) return;
		const delta = queueTotalDelta("domAds", detail.count);
		if (delta > 0) {
			scheduleFlush();
		}
	}
});
