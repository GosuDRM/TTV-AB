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

const ACHIEVEMENTS = [
	{ id: "first_block", threshold: 1, type: "ads" },
	{ id: "block_10", threshold: 10, type: "ads" },
	{ id: "block_100", threshold: 100, type: "ads" },
	{ id: "block_500", threshold: 500, type: "ads" },
	{ id: "block_1000", threshold: 1000, type: "ads" },
	{ id: "block_5000", threshold: 5000, type: "ads" },
	{ id: "popup_10", threshold: 10, type: "popups" },
	{ id: "popup_50", threshold: 50, type: "popups" },
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
	storedPopupsCount: 0,
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

function updateStats(type, channel, totalAdsBlocked, totalPopupsBlocked) {
	return new Promise((resolve) => {
		chrome.storage.local.get(["ttvStats"], (result) => {
			if (chrome.runtime.lastError) {
				console.error(
					"[TTV AB] Stats read error:",
					chrome.runtime.lastError.message,
				);
				resolve();
				return;
			}
			const safeResult = result || {};
			const stats = safeResult.ttvStats || {};
			stats.daily = stats.daily || {};
			stats.channels = stats.channels || {};
			stats.achievements = Array.isArray(stats.achievements)
				? stats.achievements
				: [];
			const today = getTodayKey();

			if (!stats.daily[today]) {
				stats.daily[today] = { ads: 0, popups: 0 };
			}
			stats.daily[today][type]++;
			stats.lastBlockedAt = Date.now();
			if (!stats.firstBlockedAt) {
				stats.firstBlockedAt = Date.now();
			}

			const cutoff = new Date();
			cutoff.setDate(cutoff.getDate() - 30);
			const cutoffKey = getDateKey(cutoff);
			for (const key in stats.daily) {
				if (key < cutoffKey) {
					delete stats.daily[key];
				}
			}

			if (type === "ads" && channel) {
				if (!stats.channels[channel]) {
					stats.channels[channel] = 0;
				}
				stats.channels[channel]++;

				const channelEntries = Object.entries(stats.channels);
				if (channelEntries.length > MAX_CHANNELS) {
					channelEntries.sort((a, b) => b[1] - a[1]);
					stats.channels = Object.fromEntries(
						channelEntries.slice(0, MAX_CHANNELS),
					);
				}
			}

			const unlocked = stats.achievements || [];
			const timeSaved = totalAdsBlocked * AVG_AD_DURATION;
			const channelCount = Object.keys(stats.channels).length;
			const newUnlocks = [];

			for (const ach of ACHIEVEMENTS) {
				if (unlocked.includes(ach.id)) continue;

				let value = 0;
				switch (ach.type) {
					case "ads":
						value = totalAdsBlocked;
						break;
					case "popups":
						value = totalPopupsBlocked;
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
					StorageQueue.add(
						() =>
							new Promise((retryResolve) => {
								chrome.storage.local.set({ ttvStats: stats }, () => {
									if (chrome.runtime.lastError) {
										console.error(
											"[TTV AB] Stats retry write error:",
											chrome.runtime.lastError.message,
										);
									} else {
										for (const id of newUnlocks) {
											window.postMessage(
												{ type: "ttvab-achievement-unlocked", detail: { id: id } },
												"*",
											);
										}
									}
									retryResolve();
								});
							}),
					);
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
	["ttvAdblockEnabled", "ttvAdsBlocked", "ttvPopupsBlocked"],
	(result) => {
		if (chrome.runtime.lastError) {
			console.error(
				"[TTV AB] Init read error:",
				chrome.runtime.lastError.message,
			);
		}
		const safeResult = result || {};
		bridgeState.enabled = safeResult.ttvAdblockEnabled !== false;
		bridgeState.storedAdsCount = safeResult.ttvAdsBlocked || 0;
		bridgeState.storedPopupsCount = safeResult.ttvPopupsBlocked || 0;

		function broadcastState() {
			window.postMessage(
				{ type: "ttvab-toggle", detail: { enabled: bridgeState.enabled } },
				"*",
			);
			window.postMessage(
				{
					type: "ttvab-init-count",
					detail: { count: bridgeState.storedAdsCount },
				},
				"*",
			);
			window.postMessage(
				{
					type: "ttvab-init-popups-count",
					detail: { count: bridgeState.storedPopupsCount },
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
				bridgeState.storedAdsCount = changes.ttvAdsBlocked.newValue || 0;
			}
			if (changes.ttvPopupsBlocked) {
				bridgeState.storedPopupsCount = changes.ttvPopupsBlocked.newValue || 0;
			}
		});
	},
);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.action === "toggle") {
		const nextEnabled = message.enabled !== false;
		chrome.storage.local.set({ ttvAdblockEnabled: nextEnabled }, () => {
			if (chrome.runtime.lastError) {
				console.error(
					"[TTV AB] Toggle write error:",
					chrome.runtime.lastError.message,
				);
				sendResponse({
					success: false,
					error: chrome.runtime.lastError.message,
				});
				return;
			}
			sendResponse({ success: true });
		});
		return true;
	} else if (message.action === "getAdsBlocked") {
		chrome.storage.local.get(["ttvAdsBlocked"], (result) => {
			if (chrome.runtime.lastError) {
				console.error(
					"[TTV AB] Ads count read error:",
					chrome.runtime.lastError.message,
				);
				sendResponse({ count: 0, error: chrome.runtime.lastError.message });
				return;
			}
			const safeResult = result || {};
			sendResponse({ count: safeResult.ttvAdsBlocked || 0 });
		});
		return true;
	}
});

let pendingAdsDelta = 0;
let pendingPopupsDelta = 0;
let pendingAdChannels = [];
let flushTimeout = null;

function scheduleFlush() {
	if (flushTimeout) return;
	flushTimeout = setTimeout(() => {
		flushTimeout = null;
		flushCounters();
	}, 200);
}

function flushCounters() {
	const adsDelta = pendingAdsDelta;
	const popupsDelta = pendingPopupsDelta;
	const channels = pendingAdChannels.slice();
	pendingAdsDelta = 0;
	pendingPopupsDelta = 0;
	pendingAdChannels = [];

	if (adsDelta === 0 && popupsDelta === 0) return;

	StorageQueue.add(() => {
		return new Promise((resolve) => {
			chrome.storage.local.get(
				["ttvAdsBlocked", "ttvPopupsBlocked"],
				(result) => {
					if (chrome.runtime.lastError) {
						console.error(
							"[TTV AB] Storage read error:",
							chrome.runtime.lastError.message,
						);
						pendingAdsDelta += adsDelta;
						pendingPopupsDelta += popupsDelta;
						pendingAdChannels.push(...channels);
						scheduleFlush();
						resolve();
						return;
					}

					const safeResult = result || {};
					const updates = {};
					const newAds = (safeResult.ttvAdsBlocked || 0) + adsDelta;
					const newPopups = (safeResult.ttvPopupsBlocked || 0) + popupsDelta;
					if (adsDelta > 0) updates.ttvAdsBlocked = newAds;
					if (popupsDelta > 0) updates.ttvPopupsBlocked = newPopups;

					chrome.storage.local.set(updates, async () => {
						if (chrome.runtime.lastError) {
							console.error(
								"[TTV AB] Storage write error:",
								chrome.runtime.lastError.message,
							);
							pendingAdsDelta += adsDelta;
							pendingPopupsDelta += popupsDelta;
							pendingAdChannels.push(...channels);
							scheduleFlush();
							resolve();
							return;
						}

						try {
							for (const ch of channels) {
								await updateStats("ads", ch, newAds, newPopups);
							}
							if (popupsDelta > 0) {
								for (let i = 0; i < popupsDelta; i++) {
									await updateStats("popups", null, newAds, newPopups);
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

	if (e.data.type === "ttvab-ad-blocked") {
		const channel = e.data.detail?.channel || null;
		pendingAdsDelta++;
		if (channel) pendingAdChannels.push(channel);
		scheduleFlush();
	}

	if (e.data.type === "ttvab-popup-blocked") {
		pendingPopupsDelta++;
		scheduleFlush();
	}
});
