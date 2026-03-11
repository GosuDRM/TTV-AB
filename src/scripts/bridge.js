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
	return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
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
			console.error("TTV AB Storage Error:", err);
		});
	},
};

function updateStats(
	type,
	channel,
	totalAdsBlocked,
	totalDomAdsBlocked,
	retryDepth = 0,
) {
	if (!["ads", "domAds"].includes(type)) {
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
							retryDepth + 1,
						),
					);
				}
				resolve();
				return;
			}
			const safeResult = result || {};
			const stats =
				safeResult.ttvStats && typeof safeResult.ttvStats === "object"
					? safeResult.ttvStats
					: {};
			stats.daily =
				stats.daily &&
				typeof stats.daily === "object" &&
				!Array.isArray(stats.daily)
					? stats.daily
					: {};
			stats.channels =
				stats.channels &&
				typeof stats.channels === "object" &&
				!Array.isArray(stats.channels)
					? stats.channels
					: {};
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
			stats.daily[today][type]++;

			const cutoff = new Date();
			cutoff.setDate(cutoff.getDate() - 30);
			const cutoffKey = getDateKey(cutoff);
			for (const key in stats.daily) {
				if (key < cutoffKey) {
					delete stats.daily[key];
				}
			}

			if (type === "ads" && channel) {
				stats.channels[channel] = normalizeCount(stats.channels[channel]);
				stats.channels[channel]++;

				const channelEntries = Object.entries(stats.channels).map(
					([channelName, count]) => [channelName, normalizeCount(count)],
				);
				if (channelEntries.length > MAX_CHANNELS) {
					channelEntries.sort((a, b) => b[1] - a[1]);
					stats.channels = Object.fromEntries(
						channelEntries.slice(0, MAX_CHANNELS),
					);
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
			if (e.data?.type === "ttvab-request-state") {
				broadcastState();
			}
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
				bridgeState.storedAdsCount = normalizeCount(
					changes.ttvAdsBlocked.newValue,
				);
			}
			if (changes.ttvDomAdsBlocked) {
				bridgeState.storedDomAdsCount = normalizeCount(
					changes.ttvDomAdsBlocked.newValue,
				);
			}
		});
	},
);

let pendingAdsDelta = 0;
let pendingDomAdsDelta = 0;
let pendingAdChannels = [];
let flushTimeout = null;
let flushRetryCount = 0;

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
							for (const ch of channels) {
								await updateStats("ads", ch, newAds, newDomAds);
							}
							if (domAdsDelta > 0) {
								for (let i = 0; i < domAdsDelta; i++) {
									await updateStats("domAds", null, newAds, newDomAds);
								}
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
	if (!e.data?.type?.startsWith("ttvab-")) return;

	if (
		e.data.type === "ttvab-ad-blocked" &&
		Number.isFinite(e.data.detail?.count)
	) {
		const channel =
			typeof e.data.detail?.channel === "string" ? e.data.detail.channel : null;
		pendingAdsDelta++;
		if (channel) pendingAdChannels.push(channel);
		scheduleFlush();
	}

	if (
		e.data.type === "ttvab-dom-ad-cleanup" &&
		Number.isFinite(e.data.detail?.count)
	) {
		pendingDomAdsDelta++;
		scheduleFlush();
	}
});
