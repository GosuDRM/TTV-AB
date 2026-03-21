// TTV AB - Background Script
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

function getMessageData(value) {
	return coerceMessageObject(value);
}

function getMessageDetail(value) {
	return coerceMessageObject(value);
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
	const channelEntries = Object.entries(normalized);
	if (channelEntries.length <= MAX_CHANNELS) {
		return normalized;
	}
	channelEntries.sort((a, b) => {
		const countDiff = normalizeCount(b[1]) - normalizeCount(a[1]);
		return countDiff !== 0 ? countDiff : a[0].localeCompare(b[0]);
	});
	const trimmed = createChannelsMap();
	for (const [channelName, count] of channelEntries.slice(0, MAX_CHANNELS)) {
		trimmed[channelName] = normalizeCount(count);
	}
	return trimmed;
}

function normalizeDailyStatsMap(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return createDailyStatsMap();
	}
	const normalized = createDailyStatsMap();
	const todayKey = getTodayKey();
	for (const [dateKey, entry] of Object.entries(value)) {
		if (!isValidDateKey(dateKey) || dateKey > todayKey) continue;
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
const ACHIEVEMENT_IDS = new Set(
	ACHIEVEMENTS.map((achievement) => achievement.id),
);

const AVG_AD_DURATION = 22;
const MAX_CHANNELS = 100;

let persistChain = Promise.resolve();
const liveCounterState = {
	ads: 0,
	domAds: 0,
	hydrated: false,
};

function storageLocalGet(keys) {
	return new Promise((resolve, reject) => {
		chrome.storage.local.get(keys, (result) => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}
			resolve(result || {});
		});
	});
}

function storageLocalSet(value) {
	return new Promise((resolve, reject) => {
		chrome.storage.local.set(value, () => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}
			resolve();
		});
	});
}

function broadcastPopupCounterPreview(adsCount, domAdsCount) {
	try {
		chrome.runtime.sendMessage({
			type: "ttvab-popup-counter-preview",
			detail: {
				adsCount: normalizeCount(adsCount),
				domAdsCount: normalizeCount(domAdsCount),
			},
		});
	} catch {}
}

async function ensureLiveCounterState() {
	if (liveCounterState.hydrated) {
		return {
			ads: normalizeCount(liveCounterState.ads),
			domAds: normalizeCount(liveCounterState.domAds),
		};
	}

	const stored = await storageLocalGet(["ttvAdsBlocked", "ttvDomAdsBlocked"]);
	liveCounterState.ads = normalizeCount(stored.ttvAdsBlocked);
	liveCounterState.domAds = normalizeCount(stored.ttvDomAdsBlocked);
	liveCounterState.hydrated = true;
	return {
		ads: liveCounterState.ads,
		domAds: liveCounterState.domAds,
	};
}

async function getLiveCounterState() {
	return ensureLiveCounterState();
}

async function applyLiveCounterPreview(detail) {
	const safeDetail = getMessageDetail(detail);
	const previewAds = normalizeCount(safeDetail?.adsCount);
	const previewDomAds = normalizeCount(safeDetail?.domAdsCount);
	const current = await ensureLiveCounterState();

	liveCounterState.ads = Math.max(current.ads, previewAds);
	liveCounterState.domAds = Math.max(current.domAds, previewDomAds);

	broadcastPopupCounterPreview(liveCounterState.ads, liveCounterState.domAds);

	return {
		ads: liveCounterState.ads,
		domAds: liveCounterState.domAds,
	};
}

function normalizeAchievementList(value) {
	return Array.isArray(value)
		? [
				...new Set(
					value.filter(
						(id) => typeof id === "string" && ACHIEVEMENT_IDS.has(id),
					),
				),
			]
		: [];
}

function normalizeStatsState(value) {
	const safeStats = isPlainObject(value) ? value : {};
	return {
		daily: normalizeDailyStatsMap(safeStats.daily),
		channels: normalizeChannelsMap(safeStats.channels),
		achievements: normalizeAchievementList(safeStats.achievements),
	};
}

function normalizeChannelDeltaMap(value, maxTotal) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return createChannelsMap();
	}
	let remaining = normalizeCount(maxTotal);
	const sortedEntries = Object.entries(value)
		.map(([channelName, count]) => [
			normalizeChannelName(channelName),
			normalizeCount(count),
		])
		.filter(([channelName, count]) => channelName && count > 0)
		.sort((a, b) => {
			const countDiff = normalizeCount(b[1]) - normalizeCount(a[1]);
			return countDiff !== 0 ? countDiff : a[0].localeCompare(b[0]);
		});
	const normalized = createChannelsMap();
	for (const [channelName, count] of sortedEntries) {
		if (remaining <= 0) break;
		const acceptedCount = Math.min(remaining, normalizeCount(count));
		if (acceptedCount <= 0) continue;
		normalized[channelName] = acceptedCount;
		remaining -= acceptedCount;
	}
	return normalized;
}

function pruneDailyStats(stats) {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - 30);
	const cutoffKey = getDateKey(cutoff);
	for (const key of Object.keys(stats.daily)) {
		if (key < cutoffKey) {
			delete stats.daily[key];
		}
	}
}

function applyAchievementUnlocks(stats, totalAdsBlocked, totalDomAdsBlocked) {
	const unlocked = stats.achievements;
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
	return newUnlocks;
}

async function persistCounterDelta(detail) {
	const safeDetail = getMessageDetail(detail);
	const adsDelta = normalizeCount(safeDetail?.adsDelta);
	const domAdsDelta = normalizeCount(safeDetail?.domAdsDelta);
	const channelDeltas =
		adsDelta > 0
			? normalizeChannelDeltaMap(safeDetail?.channelDeltas, adsDelta)
			: createChannelsMap();

	if (adsDelta <= 0 && domAdsDelta <= 0) {
		return { ok: true, counts: null, newUnlocks: [] };
	}

	const stored = await storageLocalGet([
		"ttvAdsBlocked",
		"ttvDomAdsBlocked",
		"ttvStats",
	]);
	const baseAds = normalizeCount(stored.ttvAdsBlocked);
	const baseDomAds = normalizeCount(stored.ttvDomAdsBlocked);
	const nextAds = baseAds + adsDelta;
	const nextDomAds = baseDomAds + domAdsDelta;
	const stats = normalizeStatsState(stored.ttvStats);
	const today = getTodayKey();

	if (!stats.daily[today]) {
		stats.daily[today] = { ads: 0, domAds: 0 };
	}
	stats.daily[today].ads = normalizeCount(stats.daily[today].ads) + adsDelta;
	stats.daily[today].domAds =
		normalizeCount(stats.daily[today].domAds) + domAdsDelta;
	pruneDailyStats(stats);

	for (const [channelName, channelDelta] of Object.entries(channelDeltas)) {
		stats.channels[channelName] =
			normalizeCount(stats.channels[channelName]) +
			normalizeCount(channelDelta);
	}
	stats.channels = normalizeChannelsMap(stats.channels);

	const newUnlocks = applyAchievementUnlocks(stats, nextAds, nextDomAds);

	await storageLocalSet({
		ttvAdsBlocked: nextAds,
		ttvDomAdsBlocked: nextDomAds,
		ttvStats: stats,
	});

	liveCounterState.ads = nextAds;
	liveCounterState.domAds = nextDomAds;
	liveCounterState.hydrated = true;

	broadcastPopupCounterPreview(nextAds, nextDomAds);

	return {
		ok: true,
		counts: {
			ads: nextAds,
			domAds: nextDomAds,
		},
		newUnlocks,
	};
}

function enqueuePersist(task) {
	const nextTask = persistChain.then(task, task);
	persistChain = nextTask.catch((error) => {
		console.error("[TTV AB] Background persist error:", error);
	});
	return nextTask;
}

chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
	const message = getMessageData(rawMessage);
	if (!message) {
		return undefined;
	}

	if (message.type === "ttvab-get-counters") {
		enqueuePersist(async () => {
			try {
				const counts = await getLiveCounterState();
				return { ok: true, counts };
			} catch (error) {
				return {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		})
			.then((response) => {
				sendResponse(response);
			})
			.catch((error) => {
				sendResponse({
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				});
			});

		return true;
	}

	if (message.type === "ttvab-preview-counters") {
		enqueuePersist(async () => {
			try {
				const counts = await applyLiveCounterPreview(message.detail);
				return { ok: true, counts };
			} catch (error) {
				return {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		})
			.then((response) => {
				sendResponse(response);
			})
			.catch((error) => {
				sendResponse({
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				});
			});

		return true;
	}

	if (message.type !== "ttvab-persist-counters") {
		return undefined;
	}

	enqueuePersist(async () => {
		try {
			return await persistCounterDelta(message.detail);
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	})
		.then((response) => {
			sendResponse(response);
		})
		.catch((error) => {
			sendResponse({
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		});

	return true;
});
