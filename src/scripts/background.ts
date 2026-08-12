// TTV AB - Background Service Worker
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

const BADGE_BACKGROUND_COLOR = "#E0245E";
const BADGE_TEXT_COLOR = "#FFFFFF";
const BADGE_UNITS = [
	{ value: 1e12, suffix: "T" },
	{ value: 1e9, suffix: "B" },
	{ value: 1e6, suffix: "M" },
	{ value: 1e3, suffix: "K" },
];

function formatBadgeCount(value) {
	const count = normalizeCount(value);
	if (count < 1000) return String(count);
	for (const unit of BADGE_UNITS) {
		if (count < unit.value) continue;
		const scaled = count / unit.value;
		if (scaled < 10) {
			const floored = Math.floor(scaled * 10) / 10;
			const text = Number.isInteger(floored)
				? String(floored)
				: floored.toFixed(1);
			return `${text}${unit.suffix}`;
		}
		return `${Math.floor(scaled)}${unit.suffix}`;
	}
	return String(count);
}

function dispatchBadgeCall(method, arg) {
	try {
		const result = method(arg);
		if (result && typeof result.then === "function") {
			result.then(undefined, () => {});
		}
	} catch {}
}

function applyBadgeCount(value) {
	if (typeof chrome === "undefined" || !chrome.action) return;
	const count = normalizeCount(value);
	const text = count > 0 ? formatBadgeCount(count) : "";
	if (typeof chrome.action.setBadgeText === "function") {
		dispatchBadgeCall((arg) => chrome.action.setBadgeText(arg), { text });
	}
	if (typeof chrome.action.setBadgeBackgroundColor === "function") {
		dispatchBadgeCall((arg) => chrome.action.setBadgeBackgroundColor(arg), {
			color: BADGE_BACKGROUND_COLOR,
		});
	}
	if (typeof chrome.action.setBadgeTextColor === "function") {
		dispatchBadgeCall((arg) => chrome.action.setBadgeTextColor(arg), {
			color: BADGE_TEXT_COLOR,
		});
	}
}

function normalizeChannelName(value) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim().toLowerCase();
	return /^[a-z0-9_]{1,25}$/.test(trimmed) ? trimmed : null;
}

function normalizeMediaKey(value) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim().toLowerCase();
	if (trimmed.startsWith("live:")) {
		const channel = normalizeChannelName(trimmed.slice(5));
		return channel ? `live:${channel}` : null;
	}
	if (trimmed.startsWith("vod:")) {
		const vodID = trimmed.slice(4);
		return /^\d+$/.test(vodID) ? `vod:${vodID}` : null;
	}
	return null;
}

function isPlainObject(value: unknown): value is PlainObject {
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

function getMessageData(value) {
	return isPlainObject(value) ? value : null;
}

function getMessageDetail(value) {
	return isPlainObject(value) ? value : null;
}

function createChannelsMap(): TTVABChannelMap {
	return Object.create(null);
}

function createChannelDeltaMap(): TTVABChannelDeltaMap {
	return Object.create(null);
}

function createDailyStatsMap(): TTVABDailyStatsMap {
	return Object.create(null);
}

const MAX_WATCH_DELTA_SECONDS = 7200;
const MAX_AD_MILLISECONDS_PER_FLUSH = 14400000;
const MAX_AD_MEASUREMENTS_PER_FLUSH = 50;
const MAX_RECENT_AD_MEASUREMENTS = 1000;
const RECENT_AD_MEASUREMENT_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function normalizeTimestamp(value) {
	const numericValue = Number(value);
	if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
	const timestamp = Math.trunc(numericValue);
	return timestamp > Date.now() + 5 * 60 * 1000 ? 0 : timestamp;
}

function normalizeChannelEntry(value): TTVABChannelEntry {
	if (typeof value === "number" || typeof value === "string") {
		return {
			ads: normalizeCount(value),
			firstSeen: 0,
			lastSeen: 0,
			watchSeconds: 0,
			adMilliseconds: 0,
		};
	}
	const safeValue: PlainObject = isPlainObject(value) ? value : {};
	const adMilliseconds = Object.hasOwn(safeValue, "adMilliseconds")
		? normalizeCount(safeValue.adMilliseconds)
		: normalizeCount(safeValue.adSeconds) * 1000;
	return {
		ads: normalizeCount(safeValue.ads),
		firstSeen: normalizeTimestamp(safeValue.firstSeen),
		lastSeen: normalizeTimestamp(safeValue.lastSeen),
		watchSeconds: normalizeCount(safeValue.watchSeconds),
		adMilliseconds,
	};
}

function mergeChannelEntries(
	target: TTVABChannelEntry,
	incoming: TTVABChannelEntry,
): TTVABChannelEntry {
	const firstSeenCandidates = [target.firstSeen, incoming.firstSeen].filter(
		(timestamp) => timestamp > 0,
	);
	return {
		ads: target.ads + incoming.ads,
		firstSeen:
			firstSeenCandidates.length > 0 ? Math.min(...firstSeenCandidates) : 0,
		lastSeen: Math.max(target.lastSeen, incoming.lastSeen),
		watchSeconds: target.watchSeconds + incoming.watchSeconds,
		adMilliseconds: target.adMilliseconds + incoming.adMilliseconds,
	};
}

function countAdBlockedChannels(channels: TTVABChannelMap) {
	let count = 0;
	for (const entry of Object.values(channels)) {
		if (normalizeCount(entry?.ads) > 0) count++;
	}
	return count;
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
	for (const [channelName, entry] of Object.entries(value)) {
		const safeChannel = normalizeChannelName(channelName);
		if (!safeChannel) continue;
		const safeEntry = normalizeChannelEntry(entry);
		normalized[safeChannel] = normalized[safeChannel]
			? mergeChannelEntries(normalized[safeChannel], safeEntry)
			: safeEntry;
	}
	const channelEntries = Object.entries(normalized);
	if (channelEntries.length <= MAX_CHANNELS) {
		return normalized;
	}
	channelEntries.sort((a, b) => {
		const countDiff = normalizeCount(b[1].ads) - normalizeCount(a[1].ads);
		if (countDiff !== 0) return countDiff;
		const watchDiff =
			normalizeCount(b[1].watchSeconds) - normalizeCount(a[1].watchSeconds);
		return watchDiff !== 0 ? watchDiff : a[0].localeCompare(b[0]);
	});
	const trimmed = createChannelsMap();
	for (const [channelName, entry] of channelEntries.slice(0, MAX_CHANNELS)) {
		trimmed[channelName] = entry;
	}
	return trimmed;
}

function normalizeWatchDeltaMap(value): TTVABChannelDeltaMap {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return createChannelDeltaMap();
	}
	const normalized = createChannelDeltaMap();
	for (const [channelName, seconds] of Object.entries(value)) {
		const safeChannel = normalizeChannelName(channelName);
		if (!safeChannel) continue;
		const safeSeconds = Math.min(
			normalizeCount(seconds),
			MAX_WATCH_DELTA_SECONDS,
		);
		if (safeSeconds <= 0) continue;
		normalized[safeChannel] = Math.min(
			normalizeCount(normalized[safeChannel]) + safeSeconds,
			MAX_WATCH_DELTA_SECONDS,
		);
	}
	return normalized;
}

function normalizeDailyStatsMap(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return createDailyStatsMap();
	}
	const normalized = createDailyStatsMap();
	const todayKey = getTodayKey();
	for (const [dateKey, entry] of Object.entries(value)) {
		if (!isValidDateKey(dateKey) || dateKey > todayKey) continue;
		const safeEntry: PlainObject = isPlainObject(entry) ? entry : {};
		normalized[dateKey] = {
			ads: normalizeCount(safeEntry.ads),
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
	{ id: "time_1h", threshold: 3600000, type: "time" },
	{ id: "time_10h", threshold: 36000000, type: "time" },
	{ id: "channels_5", threshold: 5, type: "channels" },
	{ id: "channels_20", threshold: 20, type: "channels" },
	{ id: "block_10000", threshold: 10000, type: "ads" },
	{ id: "channels_50", threshold: 50, type: "channels" },
];
const ACHIEVEMENT_IDS = new Set(
	ACHIEVEMENTS.map((achievement) => achievement.id),
);

const MAX_CHANNELS = 100;
const PROCESSED_FLUSH_STORAGE_KEY = "ttvProcessedCounterFlushes";
const UNCONFIRMED_FLUSH_STORAGE_KEY = "ttvUnconfirmedCounterFlushes";
const RECENT_AD_MEASUREMENTS_STORAGE_KEY = "ttvRecentAdMeasurements";
const MAX_PROCESSED_FLUSHES = 256;
const PROCESSED_FLUSH_TTL_MS = 3 * 24 * 60 * 60 * 1000;

let persistChain: Promise<unknown> = Promise.resolve();

function normalizeFlushId(value) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return /^[a-z0-9][a-z0-9:_-]{7,127}$/i.test(trimmed) ? trimmed : null;
}

function createProcessedFlushMap() {
	return Object.create(null);
}

function normalizeProcessedFlushMap(value, maxEntries = MAX_PROCESSED_FLUSHES) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return createProcessedFlushMap();
	}

	const now = Date.now();
	const minTimestamp = now - PROCESSED_FLUSH_TTL_MS;
	const maxTimestamp = now + 5 * 60 * 1000;
	const normalizedEntries = [];

	for (const [flushId, processedAt] of Object.entries(value)) {
		const safeFlushId = normalizeFlushId(flushId);
		const safeProcessedAt = Number(processedAt);
		if (!safeFlushId || !Number.isFinite(safeProcessedAt)) continue;
		const timestamp = Math.trunc(safeProcessedAt);
		if (timestamp < minTimestamp || timestamp > maxTimestamp) continue;
		normalizedEntries.push([safeFlushId, timestamp] as [string, number]);
	}

	normalizedEntries.sort((a, b) => b[1] - a[1]);

	const normalized = createProcessedFlushMap();
	for (const [flushId, processedAt] of normalizedEntries.slice(0, maxEntries)) {
		normalized[flushId] = processedAt;
	}
	return normalized;
}

function normalizeUnconfirmedFlushMap(value) {
	return normalizeProcessedFlushMap(value, Number.POSITIVE_INFINITY);
}

function recordProcessedFlush(processedFlushes, flushId) {
	const safeFlushId = normalizeFlushId(flushId);
	if (!safeFlushId) {
		return normalizeProcessedFlushMap(processedFlushes);
	}

	const nextProcessedFlushes = normalizeProcessedFlushMap(processedFlushes);
	delete nextProcessedFlushes[safeFlushId];
	const existingEntries = Object.entries(nextProcessedFlushes);
	if (existingEntries.length >= MAX_PROCESSED_FLUSHES) {
		existingEntries.sort((a, b) => Number(a[1]) - Number(b[1]));
		delete nextProcessedFlushes[existingEntries[0][0]];
	}
	nextProcessedFlushes[safeFlushId] = Date.now();
	return nextProcessedFlushes;
}

function recordUnconfirmedFlush(
	unconfirmedFlushes,
	flushId,
	createdAt: unknown = 0,
) {
	const safeFlushId = normalizeFlushId(flushId);
	if (!safeFlushId) {
		return normalizeUnconfirmedFlushMap(unconfirmedFlushes);
	}

	const nextUnconfirmedFlushes =
		normalizeUnconfirmedFlushMap(unconfirmedFlushes);
	const now = Date.now();
	const createdAtValue = Number(createdAt);
	const safeCreatedAt = Number.isFinite(createdAtValue)
		? Math.min(Math.trunc(createdAtValue), now + 5 * 60 * 1000)
		: now;
	nextUnconfirmedFlushes[safeFlushId] = Math.max(now, safeCreatedAt);
	return normalizeUnconfirmedFlushMap(nextUnconfirmedFlushes);
}

function storageLocalGet(keys): Promise<PlainObject> {
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

function storageLocalSet(value): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		chrome.storage.local.set(value, () => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
				return;
			}
			resolve();
		});
	});
}

function normalizeAchievementList(value, measuredMilliseconds = 0) {
	if (!Array.isArray(value)) return [];
	const safeMeasuredMilliseconds = normalizeCount(measuredMilliseconds);
	return [
		...new Set(
			value.filter((id) => {
				if (typeof id !== "string" || !ACHIEVEMENT_IDS.has(id)) {
					return false;
				}
				const achievement = ACHIEVEMENTS.find((entry) => entry.id === id);
				return (
					achievement?.type !== "time" ||
					safeMeasuredMilliseconds >= achievement.threshold
				);
			}),
		),
	];
}

function normalizeAdMeasurementId(value) {
	return typeof value === "string" &&
		value.startsWith("stitched-ad-") &&
		value.length <= 256 &&
		!/\p{Cc}/u.test(value)
		? value
		: null;
}

function normalizeAdMeasurement(value) {
	const safeValue = getMessageDetail(value);
	const id = normalizeAdMeasurementId(safeValue?.id);
	const durationMilliseconds = Math.min(
		normalizeCount(safeValue?.durationMilliseconds),
		600000,
	);
	const rawStartDateMilliseconds = Number(safeValue?.startDateMilliseconds);
	const startDateMilliseconds = Number.isSafeInteger(rawStartDateMilliseconds)
		? Math.max(0, rawStartDateMilliseconds)
		: 0;
	const mediaKey = normalizeMediaKey(safeValue?.mediaKey);
	const channel = mediaKey?.startsWith("live:")
		? mediaKey.slice(5)
		: normalizeChannelName(safeValue?.channel);
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

function getAdMeasurementScope(sourceTabId) {
	const numericTabId = Number(sourceTabId);
	return Number.isSafeInteger(numericTabId) && numericTabId >= 0
		? `tab:${numericTabId}`
		: "unknown";
}

function getScopedAdMeasurementKey(measurement, sourceTabId = null) {
	const measurementKey = getAdMeasurementKey(measurement);
	return measurementKey
		? `${getAdMeasurementScope(sourceTabId)}\n${measurementKey}`
		: null;
}

function normalizeAdMeasurements(
	value,
	maxEntries = MAX_AD_MEASUREMENTS_PER_FLUSH,
) {
	if (!Array.isArray(value)) return [];
	const normalized = [];
	const seenKeys = new Set();
	let totalMilliseconds = 0;
	for (const entry of value) {
		const measurement = normalizeAdMeasurement(entry);
		const measurementKey = getAdMeasurementKey(measurement);
		if (!measurement || !measurementKey || seenKeys.has(measurementKey)) {
			continue;
		}
		if (
			totalMilliseconds + measurement.durationMilliseconds >
			MAX_AD_MILLISECONDS_PER_FLUSH
		) {
			continue;
		}
		seenKeys.add(measurementKey);
		normalized.push(measurement);
		totalMilliseconds += measurement.durationMilliseconds;
		if (normalized.length >= Math.max(0, normalizeCount(maxEntries))) break;
	}
	return normalized;
}

function normalizeRecentAdMeasurements(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return Object.create(null);
	}
	const now = Date.now();
	const minTimestamp = now - RECENT_AD_MEASUREMENT_TTL_MS;
	const maxTimestamp = now + 5 * 60 * 1000;
	const entries = [];
	for (const [measurementKey, measuredAt] of Object.entries(value)) {
		const keyParts = measurementKey.split("\n");
		if (keyParts.length !== 3 && keyParts.length !== 4) continue;
		const scope =
			keyParts[0] === "unknown" || /^tab:\d+$/.test(keyParts[0])
				? keyParts[0]
				: null;
		const mediaKey = normalizeMediaKey(keyParts[1]);
		const id = normalizeAdMeasurementId(keyParts[2]);
		const rawStartDateMilliseconds =
			keyParts.length === 4 ? Number(keyParts[3]) : 0;
		const startDateMilliseconds = Number.isSafeInteger(rawStartDateMilliseconds)
			? Math.max(0, rawStartDateMilliseconds)
			: null;
		const timestamp = Number(measuredAt);
		if (
			!scope ||
			!mediaKey ||
			!id ||
			startDateMilliseconds === null ||
			!Number.isFinite(timestamp) ||
			timestamp < minTimestamp ||
			timestamp > maxTimestamp
		) {
			continue;
		}
		entries.push([
			`${scope}\n${mediaKey}\n${id}\n${startDateMilliseconds}`,
			Math.trunc(timestamp),
		]);
	}
	entries.sort((a, b) => a[1] - b[1]);
	const normalized = Object.create(null);
	for (const [measurementKey, measuredAt] of entries.slice(
		-MAX_RECENT_AD_MEASUREMENTS,
	)) {
		normalized[measurementKey] = measuredAt;
	}
	return normalized;
}

function normalizeStatsState(value): TTVABStatsState {
	const safeStats = isPlainObject(value) ? value : {};
	const adMillisecondsSaved = Object.hasOwn(safeStats, "adMillisecondsSaved")
		? normalizeCount(safeStats.adMillisecondsSaved)
		: normalizeCount(safeStats.adSecondsSaved) * 1000;
	return {
		daily: normalizeDailyStatsMap(safeStats.daily),
		channels: normalizeChannelsMap(safeStats.channels),
		achievements: normalizeAchievementList(
			safeStats.achievements,
			adMillisecondsSaved,
		),
		adMillisecondsSaved,
	};
}

function normalizeChannelDeltaMap(value, maxTotal): TTVABChannelDeltaMap {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return createChannelDeltaMap();
	}
	let remaining = normalizeCount(maxTotal);
	const sortedEntries = (Object.entries(value) as Array<[string, unknown]>)
		.map(
			([channelName, count]) =>
				[normalizeChannelName(channelName), normalizeCount(count)] as [
					string | null,
					number,
				],
		)
		.filter(([channelName, count]) => Boolean(channelName) && count > 0)
		/** biome-ignore lint/style/noNonNullAssertion: filtered above */
		.map(([channelName, count]) => [channelName!, count] as [string, number])
		.sort((a, b) => {
			const countDiff = normalizeCount(b[1]) - normalizeCount(a[1]);
			return countDiff !== 0 ? countDiff : a[0].localeCompare(b[0]);
		});
	const normalized = createChannelDeltaMap();
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

function computeMeasuredTimeSaved(stats) {
	return normalizeCount(stats?.adMillisecondsSaved);
}

function applyAchievementUnlocks(stats, totalAdsBlocked) {
	const unlocked = stats.achievements;
	const timeSaved = computeMeasuredTimeSaved(stats);
	const channelCount = countAdBlockedChannels(stats.channels);
	const newUnlocks = [];

	for (const ach of ACHIEVEMENTS) {
		if (unlocked.includes(ach.id)) continue;

		let value = 0;
		switch (ach.type) {
			case "ads":
				value = totalAdsBlocked;
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

async function persistCounterDelta(detail, sourceTabId = null) {
	const safeDetail = getMessageDetail(detail);
	const flushId = normalizeFlushId(safeDetail?.flushId);
	const adsDelta = normalizeCount(safeDetail?.adsDelta);
	const channelDeltas =
		adsDelta > 0
			? normalizeChannelDeltaMap(safeDetail?.channelDeltas, adsDelta)
			: createChannelDeltaMap();
	const watchDeltas = normalizeWatchDeltaMap(safeDetail?.watchDeltas);
	const hasWatchDeltas = Object.keys(watchDeltas).length > 0;
	const adMeasurements = normalizeAdMeasurements(
		safeDetail?.adMeasurements,
		MAX_AD_MEASUREMENTS_PER_FLUSH,
	);
	const legacyAdMillisecondsDelta =
		adMeasurements.length > 0
			? 0
			: Math.min(
					normalizeCount(safeDetail?.adSecondsDelta) * 1000,
					MAX_AD_MILLISECONDS_PER_FLUSH,
				);
	const legacyChannelAdSecondsDeltas =
		legacyAdMillisecondsDelta > 0
			? normalizeWatchDeltaMap(safeDetail?.channelAdSecondsDeltas)
			: createChannelDeltaMap();

	if (
		adsDelta <= 0 &&
		!hasWatchDeltas &&
		legacyAdMillisecondsDelta <= 0 &&
		adMeasurements.length === 0
	) {
		return { ok: true, counts: null, newUnlocks: [] };
	}

	const stored = await storageLocalGet([
		"ttvAdsBlocked",
		"ttvStats",
		PROCESSED_FLUSH_STORAGE_KEY,
		UNCONFIRMED_FLUSH_STORAGE_KEY,
		RECENT_AD_MEASUREMENTS_STORAGE_KEY,
	]);
	const baseAds = normalizeCount(stored.ttvAdsBlocked);
	const processedFlushes = normalizeProcessedFlushMap(
		stored[PROCESSED_FLUSH_STORAGE_KEY],
	);
	const unconfirmedFlushes = normalizeUnconfirmedFlushMap(
		stored[UNCONFIRMED_FLUSH_STORAGE_KEY],
	);
	if (
		flushId &&
		(Object.hasOwn(processedFlushes, flushId) ||
			Object.hasOwn(unconfirmedFlushes, flushId))
	) {
		return {
			ok: true,
			counts: {
				ads: baseAds,
			},
			newUnlocks: [],
		};
	}
	const nextAds = baseAds + adsDelta;
	const stats = normalizeStatsState(stored.ttvStats);
	let recentAdMeasurements = normalizeRecentAdMeasurements(
		stored[RECENT_AD_MEASUREMENTS_STORAGE_KEY],
	);
	const now = Date.now();
	const today = getTodayKey();

	if (adsDelta > 0) {
		if (!stats.daily[today]) {
			stats.daily[today] = { ads: 0 };
		}
		stats.daily[today].ads = normalizeCount(stats.daily[today].ads) + adsDelta;
	}
	pruneDailyStats(stats);

	for (const [channelName, channelDelta] of Object.entries(channelDeltas)) {
		const entry = normalizeChannelEntry(stats.channels[channelName]);
		entry.ads += normalizeCount(channelDelta);
		if (entry.firstSeen <= 0) {
			entry.firstSeen = now;
		}
		entry.lastSeen = now;
		stats.channels[channelName] = entry;
	}
	for (const [channelName, watchDelta] of Object.entries(watchDeltas)) {
		const entry = normalizeChannelEntry(stats.channels[channelName]);
		entry.watchSeconds += normalizeCount(watchDelta);
		stats.channels[channelName] = entry;
	}
	let adMillisecondsDelta = legacyAdMillisecondsDelta;
	const channelAdMillisecondsDeltas = createChannelDeltaMap();
	for (const [channelName, secondsDelta] of Object.entries(
		legacyChannelAdSecondsDeltas,
	)) {
		channelAdMillisecondsDeltas[channelName] =
			normalizeCount(secondsDelta) * 1000;
	}
	for (const measurement of adMeasurements) {
		const measurementKey = getScopedAdMeasurementKey(measurement, sourceTabId);
		if (!measurementKey) continue;
		if (Object.hasOwn(recentAdMeasurements, measurementKey)) {
			recentAdMeasurements[measurementKey] = now;
			continue;
		}
		if (
			adMillisecondsDelta + measurement.durationMilliseconds >
			MAX_AD_MILLISECONDS_PER_FLUSH
		) {
			continue;
		}
		recentAdMeasurements[measurementKey] = now;
		adMillisecondsDelta += measurement.durationMilliseconds;
		if (measurement.channel) {
			channelAdMillisecondsDeltas[measurement.channel] =
				normalizeCount(channelAdMillisecondsDeltas[measurement.channel]) +
				measurement.durationMilliseconds;
		}
	}
	recentAdMeasurements = normalizeRecentAdMeasurements(recentAdMeasurements);
	if (adMillisecondsDelta > 0) {
		stats.adMillisecondsSaved =
			normalizeCount(stats.adMillisecondsSaved) + adMillisecondsDelta;
		for (const [channelName, millisecondsDelta] of Object.entries(
			channelAdMillisecondsDeltas,
		)) {
			const entry = normalizeChannelEntry(stats.channels[channelName]);
			entry.adMilliseconds += normalizeCount(millisecondsDelta);
			stats.channels[channelName] = entry;
		}
	}
	stats.channels = normalizeChannelsMap(stats.channels);

	const newUnlocks = applyAchievementUnlocks(stats, nextAds);
	const nextUnconfirmedFlushes = flushId
		? recordUnconfirmedFlush(unconfirmedFlushes, flushId, safeDetail?.createdAt)
		: unconfirmedFlushes;

	await storageLocalSet({
		ttvAdsBlocked: nextAds,
		ttvStats: stats,
		[PROCESSED_FLUSH_STORAGE_KEY]: processedFlushes,
		[UNCONFIRMED_FLUSH_STORAGE_KEY]: nextUnconfirmedFlushes,
		[RECENT_AD_MEASUREMENTS_STORAGE_KEY]: recentAdMeasurements,
	});

	return {
		ok: true,
		counts: {
			ads: nextAds,
		},
		newUnlocks,
	};
}

async function confirmCounterFlush(detail) {
	const safeDetail = getMessageDetail(detail);
	const flushId = normalizeFlushId(safeDetail?.flushId);
	if (!flushId) return { ok: false, error: "invalid flush id" };

	const stored = await storageLocalGet([
		PROCESSED_FLUSH_STORAGE_KEY,
		UNCONFIRMED_FLUSH_STORAGE_KEY,
	]);
	const processedFlushes = normalizeProcessedFlushMap(
		stored[PROCESSED_FLUSH_STORAGE_KEY],
	);
	const unconfirmedFlushes = normalizeUnconfirmedFlushMap(
		stored[UNCONFIRMED_FLUSH_STORAGE_KEY],
	);
	if (!Object.hasOwn(unconfirmedFlushes, flushId)) {
		return { ok: true };
	}

	delete unconfirmedFlushes[flushId];
	await storageLocalSet({
		[PROCESSED_FLUSH_STORAGE_KEY]: recordProcessedFlush(
			processedFlushes,
			flushId,
		),
		[UNCONFIRMED_FLUSH_STORAGE_KEY]: unconfirmedFlushes,
	});
	return { ok: true };
}

function enqueuePersist(task) {
	const nextTask = persistChain.then(task, task);
	persistChain = nextTask.catch((error) => {
		console.error("[TTV AB] Background persist error:", error);
		return undefined;
	});
	return nextTask;
}

chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
	if (sender?.id !== chrome.runtime.id) {
		return undefined;
	}
	const message = getMessageData(rawMessage);
	if (
		message?.type !== "ttvab-persist-counters" &&
		message?.type !== "ttvab-confirm-counter-flush"
	) {
		return undefined;
	}

	enqueuePersist(async () => {
		try {
			return message.type === "ttvab-confirm-counter-flush"
				? await confirmCounterFlush(message.detail)
				: await persistCounterDelta(message.detail, sender?.tab?.id);
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

function refreshBadgeFromStorage() {
	storageLocalGet(["ttvAdsBlocked"])
		.then((stored) => {
			applyBadgeCount(stored.ttvAdsBlocked);
		})
		.catch(() => {});
}

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
	chrome.storage.onChanged.addListener((changes, namespace) => {
		if (namespace !== "local") return;
		if (!changes.ttvAdsBlocked) return;
		applyBadgeCount(changes.ttvAdsBlocked.newValue);
	});
}

refreshBadgeFromStorage();
