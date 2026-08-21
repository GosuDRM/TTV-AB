// TTV AB - Popup Script

const _LOG_QUERY_TABS_TIMEOUT_MS = 2500;
const _LOG_COLLECT_TAB_TIMEOUT_MS = 8000;
const _LOG_EXPORT_MAX_TABS = 16;
const _LOG_EXPORT_BATCH_SIZE = 4;
const _LOG_EXPORT_MAX_CHARACTERS = 2 * 1024 * 1024;
const _LOG_EXPORT_UNKNOWN_TIMESTAMP = "????-??-??T??:??:??.???Z";
const _LOG_EXPORT_LEVELS = new Set([
	"debug",
	"info",
	"success",
	"warning",
	"error",
]);

type LogCollectionResult = {
	entries: PlainObject[];
	context: PlainObject | null;
	error: string | null;
	truncatedEntries: number;
};

type LogExportWritable = {
	write: (data: string) => Promise<void>;
	close: () => Promise<void>;
	abort?: () => Promise<void>;
};

type LogExportFileHandle = {
	createWritable: () => Promise<LogExportWritable>;
};

function _sanitizeLogExportText(value, maxLength = 4000) {
	const text = typeof value === "string" ? value : "";
	const limit = Math.max(0, maxLength);
	let sanitized = "";
	for (const character of text.replace(/\r\n?/g, "\n")) {
		const code = character.charCodeAt(0);
		if (code === 10 || (code >= 32 && code !== 127)) {
			sanitized += character;
		}
		if (sanitized.length >= limit) break;
	}
	return sanitized;
}

function _sanitizeLogExportTabUrl(value) {
	try {
		const url = new URL(String(value || ""));
		if (url.protocol !== "https:" && url.protocol !== "http:") {
			return "https://www.twitch.tv/";
		}
		url.username = "";
		url.password = "";
		url.search = "";
		url.hash = "";
		return `${url.origin}${url.pathname || "/"}`.slice(0, 2048);
	} catch {
		return "https://www.twitch.tv/";
	}
}

function _formatLogExportTimestamp(value) {
	let numericValue = Number.NaN;
	try {
		numericValue = Number(value);
	} catch {}
	if (!Number.isFinite(numericValue) || numericValue <= 0) {
		return _LOG_EXPORT_UNKNOWN_TIMESTAMP;
	}
	const date = new Date(numericValue);
	if (!Number.isFinite(date.getTime())) return _LOG_EXPORT_UNKNOWN_TIMESTAMP;
	try {
		return date.toISOString();
	} catch {
		return _LOG_EXPORT_UNKNOWN_TIMESTAMP;
	}
}

function _stringifyLogExportValue(value, maxLength = 16000) {
	try {
		return _sanitizeLogExportText(JSON.stringify(value), maxLength).replace(
			/\n/g,
			" ",
		);
	} catch {
		return "{}";
	}
}

function _formatLogEntryLine(entry: PlainObject): string {
	const timestamp = _formatLogExportTimestamp(entry?.t);
	const generation =
		typeof entry?.g === "number" && Number.isFinite(entry.g)
			? Math.max(0, Math.trunc(entry.g))
			: 0;
	const context =
		entry?.w === true
			? `worker${generation > 0 ? `#g${generation}` : ""}`
			: "page";
	const rawLevel =
		typeof entry?.l === "string" ? entry.l.toLowerCase() : "info";
	const level = _LOG_EXPORT_LEVELS.has(rawLevel) ? rawLevel : "info";
	const mediaKey = _sanitizeLogExportText(entry?.k, 160).replace(/\n/g, "");
	const ownership = mediaKey ? ` media=${mediaKey}` : "";
	const messageLines = _sanitizeLogExportText(entry?.m).split("\n");
	const prefix = `${timestamp} [${context}:${level}]${ownership}`;
	return messageLines
		.map((line, index) => `${prefix}${index === 0 ? " " : " | "}${line}`)
		.join("\n");
}

function _formatLogContextLines(value): string[] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return [];
	const context = value as PlainObject;
	const pageState = {
		mediaKey:
			typeof context.pageMediaKey === "string"
				? _sanitizeLogExportText(context.pageMediaKey, 160).replace(/\n/g, "")
				: null,
		channel:
			typeof context.pageChannel === "string"
				? _sanitizeLogExportText(context.pageChannel, 80).replace(/\n/g, "")
				: null,
		visibility:
			typeof context.visibility === "string"
				? _sanitizeLogExportText(context.visibility, 24).replace(/\n/g, "")
				: "unknown",
		focused: context.focused === true,
		enabled: context.enabled === true,
		adSpoofingEnabled: context.adSpoofingEnabled === true,
		autoplayBackupEnabled: context.autoplayBackupEnabled === true,
		currentAdMediaKey:
			typeof context.currentAdMediaKey === "string"
				? _sanitizeLogExportText(context.currentAdMediaKey, 160).replace(
						/\n/g,
						"",
					)
				: null,
		activeCycleStartedAt:
			typeof context.activeCycleStartedAt === "number" &&
			Number.isFinite(context.activeCycleStartedAt)
				? context.activeCycleStartedAt
				: 0,
		pinnedBackupPlayerType:
			typeof context.pinnedBackupPlayerType === "string"
				? _sanitizeLogExportText(context.pinnedBackupPlayerType, 40).replace(
						/\n/g,
						"",
					)
				: null,
		pinnedBackupMediaKey:
			typeof context.pinnedBackupMediaKey === "string"
				? _sanitizeLogExportText(context.pinnedBackupMediaKey, 160).replace(
						/\n/g,
						"",
					)
				: null,
	};
	const settings = [
		`Ad Blocking ${pageState.enabled ? "enabled" : "disabled"}`,
		`Ad Spoofing ${pageState.adSpoofingEnabled ? "enabled" : "disabled"}`,
		`Low Quality Fallback ${pageState.autoplayBackupEnabled ? "enabled" : "disabled"}`,
	].join(" | ");
	const lines = [
		`Settings: ${settings}`,
		`Page state: ${_stringifyLogExportValue(pageState)}`,
	];
	if (Array.isArray(context.workers)) {
		lines.push(`Workers: ${_stringifyLogExportValue(context.workers)}`);
	}
	if (context.media && typeof context.media === "object") {
		lines.push(`Media state: ${_stringifyLogExportValue(context.media)}`);
	}
	return lines;
}

function _describeLogCollectionError(value) {
	const labels: Record<string, string> = {
		"tab-query-timeout": "Twitch tab query timed out",
		"tab-query-failed": "Twitch tab query failed",
		"content-script-unavailable": "extension bridge is unavailable in this tab",
		"extension-response-timeout": "extension response timed out",
		"page-bridge-unavailable": "page bridge is not connected",
		"page-response-timeout": "page log response timed out",
		"page-message-failed": "page log request failed",
		"collection-failed": "log collection failed",
	};
	return labels[String(value || "")] || labels["collection-failed"];
}

function _queryTwitchTabs(
	timeoutMs = _LOG_QUERY_TABS_TIMEOUT_MS,
): Promise<{ tabs: chrome.tabs.Tab[]; error: string | null }> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (tabs: chrome.tabs.Tab[], error: string | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({ tabs, error });
		};
		const timer = setTimeout(
			() => finish([], "tab-query-timeout"),
			Math.max(0, timeoutMs),
		);
		try {
			chrome.tabs.query({ url: "*://*.twitch.tv/*" }, (tabs) => {
				if (chrome.runtime.lastError || !Array.isArray(tabs)) {
					finish([], "tab-query-failed");
					return;
				}
				finish(tabs, null);
			});
		} catch {
			finish([], "tab-query-failed");
		}
	});
}

function _collectTabLogEntries(
	tabId: number,
	timeoutMs = _LOG_COLLECT_TAB_TIMEOUT_MS,
): Promise<LogCollectionResult> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (result: LogCollectionResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(result);
		};
		const fail = (error: string) =>
			finish({ entries: [], context: null, error, truncatedEntries: 0 });
		const timer = setTimeout(
			() => fail("extension-response-timeout"),
			Math.max(0, timeoutMs),
		);
		try {
			chrome.tabs.sendMessage(
				tabId,
				{ type: "ttvab-collect-logs" },
				{ frameId: 0 },
				(response) => {
					if (chrome.runtime.lastError) {
						fail("content-script-unavailable");
						return;
					}
					const data = response as PlainObject | undefined;
					if (data?.ok !== true) {
						fail(
							typeof data?.error === "string"
								? data.error
								: "collection-failed",
						);
						return;
					}
					finish({
						entries: Array.isArray(data?.entries) ? data.entries : [],
						context:
							data?.context &&
							typeof data.context === "object" &&
							!Array.isArray(data.context)
								? (data.context as PlainObject)
								: null,
						error: null,
						truncatedEntries:
							typeof data?.truncatedEntries === "number" &&
							Number.isFinite(data.truncatedEntries)
								? Math.max(0, Math.trunc(data.truncatedEntries))
								: 0,
					});
				},
			);
		} catch {
			fail("content-script-unavailable");
		}
	});
}

function _selectLogExportTabs(tabs, maxTabs = _LOG_EXPORT_MAX_TABS) {
	const withIds = Array.isArray(tabs)
		? tabs.filter((tab) => typeof tab?.id === "number")
		: [];
	withIds.sort((a, b) => {
		const activeDelta = Number(b.active === true) - Number(a.active === true);
		if (activeDelta !== 0) return activeDelta;
		return (Number(b.lastAccessed) || 0) - (Number(a.lastAccessed) || 0);
	});
	const safeMaxTabs = Math.max(1, Math.trunc(Number(maxTabs) || 1));
	return {
		tabs: withIds.slice(0, safeMaxTabs),
		omittedTabs: Math.max(0, withIds.length - safeMaxTabs),
	};
}

function _buildTabLogSection(
	tab: chrome.tabs.Tab,
	index: number,
	result: LogCollectionResult,
	maxCharacters: number,
) {
	const collectedPageUrl =
		typeof result.context?.pageUrl === "string"
			? result.context.pageUrl
			: tab.url;
	const lines = [
		`==== Tab ${index + 1}: ${_sanitizeLogExportTabUrl(collectedPageUrl)} ====`,
		..._formatLogContextLines(result.context),
	];
	if (!result.context && !result.error) {
		lines.push("(page state snapshot unavailable)");
	}
	if (result.error) {
		lines.push(
			`(collection failed: ${_describeLogCollectionError(result.error)})`,
		);
	} else if (result.entries.length === 0) {
		lines.push("(no TTV AB log entries captured in this tab)");
	} else {
		for (const entry of result.entries) {
			lines.push(_formatLogEntryLine(entry));
		}
	}
	if (result.truncatedEntries > 0) {
		lines.push(
			`(${result.truncatedEntries} older log entries omitted by the export size limit)`,
		);
	}
	lines.push("");
	const text = lines.join("\n");
	const safeMax = Math.max(0, Math.trunc(Number(maxCharacters) || 0));
	if (text.length <= safeMax) return { text, truncated: false };
	const marker = "\n...(tab section truncated by the export size limit)...\n";
	if (safeMax <= marker.length) {
		return { text: marker.slice(0, safeMax), truncated: true };
	}
	return {
		text: `${text.slice(0, safeMax - marker.length)}${marker}`,
		truncated: true,
	};
}

async function _buildLogExport(
	isCancelled: () => boolean = () => false,
): Promise<string> {
	const manifestVersion = chrome.runtime.getManifest?.()?.version || "?";
	const headerLines = [
		"TTV AB debug log",
		`Version: ${manifestVersion}`,
		`Exported: ${new Date().toISOString()}`,
		"",
	];
	const queryResult = await _queryTwitchTabs();
	if (isCancelled()) return "";
	if (queryResult.error) {
		headerLines.push(
			`Log collection status: ${_describeLogCollectionError(queryResult.error)}.`,
		);
		return headerLines.join("\n");
	}
	const selected = _selectLogExportTabs(queryResult.tabs);
	if (selected.tabs.length === 0) {
		headerLines.push(
			"No open Twitch tabs were found, so no runtime log entries were captured.",
			"Open a twitch.tv stream, let the issue happen, then export again.",
		);
		return headerLines.join("\n");
	}
	if (selected.omittedTabs > 0) {
		headerLines.push(
			`${selected.omittedTabs} older Twitch tabs were omitted to keep the export bounded.`,
			"",
		);
	}

	const parts = [headerLines.join("\n")];
	let usedCharacters = parts[0].length;
	let stoppedAt = selected.tabs.length;
	for (
		let batchStart = 0;
		batchStart < selected.tabs.length;
		batchStart += _LOG_EXPORT_BATCH_SIZE
	) {
		if (isCancelled()) break;
		const batch = selected.tabs.slice(
			batchStart,
			batchStart + _LOG_EXPORT_BATCH_SIZE,
		);
		const results = await Promise.all(
			batch.map((tab) => _collectTabLogEntries(tab.id as number)),
		);
		if (isCancelled()) break;
		for (let offset = 0; offset < batch.length; offset += 1) {
			const remaining = _LOG_EXPORT_MAX_CHARACTERS - usedCharacters - 1;
			if (remaining <= 0) {
				stoppedAt = batchStart + offset;
				break;
			}
			const section = _buildTabLogSection(
				batch[offset],
				batchStart + offset,
				results[offset],
				remaining,
			);
			parts.push(section.text);
			usedCharacters += section.text.length + 1;
			if (section.truncated) {
				stoppedAt = batchStart + offset + 1;
				break;
			}
		}
		if (stoppedAt < selected.tabs.length) break;
	}
	const omittedBySize = selected.tabs.length - stoppedAt;
	if (omittedBySize > 0 && usedCharacters < _LOG_EXPORT_MAX_CHARACTERS) {
		const note = `${omittedBySize} additional Twitch tabs were omitted because the export reached its size limit.`;
		const remaining = _LOG_EXPORT_MAX_CHARACTERS - usedCharacters - 1;
		if (remaining > 0) parts.push(note.slice(0, remaining));
	}
	return parts.join("\n").slice(0, _LOG_EXPORT_MAX_CHARACTERS);
}

function _getLogExportFilename() {
	const stamp = new Date()
		.toISOString()
		.replace(/[:.]/g, "-")
		.replace("T", "_")
		.slice(0, 19);
	return `ttv-ab-logs-${stamp}.txt`;
}

function _requestLogExportFile() {
	const picker = (
		window as typeof window & {
			showSaveFilePicker?: (
				options: PlainObject,
			) => Promise<LogExportFileHandle>;
		}
	).showSaveFilePicker;
	if (typeof picker !== "function") return null;
	return picker.call(window, {
		id: "ttv-ab-log-export",
		suggestedName: _getLogExportFilename(),
		startIn: "downloads",
		types: [
			{
				description: "Text file",
				accept: { "text/plain": [".txt"] },
			},
		],
	});
}

async function _writeLogExportFile(handle: LogExportFileHandle, text: string) {
	const writable = await handle.createWritable();
	try {
		await writable.write(text);
		await writable.close();
		return true;
	} catch (error) {
		try {
			await writable.abort?.();
		} catch {}
		throw error;
	}
}

function _isLogExportCancellation(error) {
	return Boolean(
		error &&
			typeof error === "object" &&
			"name" in error &&
			error.name === "AbortError",
	);
}

function _downloadLogExport(text: string) {
	const blob = new Blob([text], { type: "text/plain" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	let clicked = false;
	try {
		anchor.href = url;
		anchor.download = _getLogExportFilename();
		document.body.appendChild(anchor);
		anchor.click();
		clicked = true;
		return true;
	} finally {
		anchor.remove();
		if (clicked) {
			setTimeout(() => URL.revokeObjectURL(url), 30000);
		} else {
			URL.revokeObjectURL(url);
		}
	}
}

const _POPUP_TOGGLE_NAMES = [
	"adblock",
	"adSpoofing",
	"autoplayBackup",
] as const;
const _POPUP_TOGGLE_STORAGE_KEYS = {
	adblock: "ttvAdblockEnabled",
	adSpoofing: "ttvAdSpoofingEnabled",
	autoplayBackup: "ttvAutoplayBackupEnabled",
} as const;
const _POPUP_TOGGLE_READ_RETRY_DELAYS = [100, 300, 1000];
const _POPUP_TOGGLE_READ_SLOW_RETRY_MS = 30000;
const _POPUP_TOGGLE_READ_TIMEOUT_MS = 1000;
const _POPUP_TOGGLE_WRITE_TIMEOUT_MS = 1000;

function _createPopupToggleController(options) {
	const values = {
		adblock: true,
		adSpoofing: true,
		autoplayBackup: true,
	};
	const revisions = {
		adblock: 0,
		adSpoofing: 0,
		autoplayBackup: 0,
	};
	const writeSequences = {
		adblock: 0,
		adSpoofing: 0,
		autoplayBackup: 0,
	};
	const pending = {
		adblock: false,
		adSpoofing: false,
		autoplayBackup: false,
	};
	const writeTimeoutTimers = {
		adblock: null,
		adSpoofing: null,
		autoplayBackup: null,
	};
	const schedule = options.schedule || setTimeout;
	const cancel = options.cancel || clearTimeout;
	let ready = false;
	let started = false;
	let readSequence = 0;
	let readFailureCount = 0;
	let readInFlight = false;
	let readRetryTimer = null;
	let readTimeoutTimer = null;

	function snapshot() {
		return {
			ready,
			values: { ...values },
			pending: { ...pending },
			available: {
				adblock: ready && !pending.adblock,
				adSpoofing:
					ready && values.adblock && !pending.adblock && !pending.adSpoofing,
				autoplayBackup:
					ready &&
					values.adblock &&
					!pending.adblock &&
					!pending.autoplayBackup,
			},
		};
	}

	function render() {
		options.render(snapshot());
	}

	function clearReadRetryTimer() {
		if (readRetryTimer !== null) {
			cancel(readRetryTimer);
			readRetryTimer = null;
		}
	}

	function clearReadTimeoutTimer() {
		if (readTimeoutTimer !== null) {
			cancel(readTimeoutTimer);
			readTimeoutTimer = null;
		}
	}

	function clearWriteTimeout(name) {
		if (writeTimeoutTimers[name] === null) return;
		cancel(writeTimeoutTimers[name]);
		writeTimeoutTimers[name] = null;
	}

	function scheduleReadRetry() {
		if (ready || readInFlight || readRetryTimer !== null) return;
		const retryDelay =
			_POPUP_TOGGLE_READ_RETRY_DELAYS[readFailureCount - 1] ??
			_POPUP_TOGGLE_READ_SLOW_RETRY_MS;
		readRetryTimer = schedule(() => {
			readRetryTimer = null;
			beginRead();
		}, retryDelay);
	}

	function beginRead(resetFailures = false) {
		if (readInFlight) return false;
		if (resetFailures) readFailureCount = 0;
		clearReadRetryTimer();
		ready = false;
		render();
		readInFlight = true;
		const sequence = ++readSequence;
		const readRevisions = { ...revisions };
		let settled = false;
		const finish = (result, error) => {
			if (settled || sequence !== readSequence) return;
			settled = true;
			clearReadTimeoutTimer();
			readInFlight = false;
			const readError =
				error ||
				(!result || typeof result !== "object" || Array.isArray(result)
					? "Storage returned no settings"
					: null);
			if (readError) {
				readFailureCount++;
				options.onReadError?.(readError, readFailureCount);
				scheduleReadRetry();
				render();
				return;
			}
			for (const name of _POPUP_TOGGLE_NAMES) {
				if (revisions[name] !== readRevisions[name]) continue;
				values[name] = result[_POPUP_TOGGLE_STORAGE_KEYS[name]] !== false;
			}
			readFailureCount = 0;
			ready = true;
			render();
		};
		readTimeoutTimer = schedule(
			() => finish(null, "Settings read timed out"),
			_POPUP_TOGGLE_READ_TIMEOUT_MS,
		);
		try {
			options.read(Object.values(_POPUP_TOGGLE_STORAGE_KEYS), finish);
		} catch (error) {
			finish(null, error instanceof Error ? error.message : String(error));
		}
		return true;
	}

	function applyStorageChanges(changes) {
		if (!changes || typeof changes !== "object") return false;
		let changed = false;
		for (const name of _POPUP_TOGGLE_NAMES) {
			const storageKey = _POPUP_TOGGLE_STORAGE_KEYS[name];
			if (!Object.hasOwn(changes, storageKey)) continue;
			revisions[name]++;
			values[name] = changes[storageKey]?.newValue !== false;
			if (pending[name]) {
				writeSequences[name]++;
				pending[name] = false;
				clearWriteTimeout(name);
			}
			changed = true;
		}
		if (changed) render();
		return changed;
	}

	function write(name, enabled) {
		if (!_POPUP_TOGGLE_NAMES.includes(name)) return false;
		if (!ready || pending[name] || (name !== "adblock" && !values.adblock)) {
			render();
			return false;
		}
		const normalizedEnabled = enabled === true;
		const sequence = ++writeSequences[name];
		values[name] = normalizedEnabled;
		pending[name] = true;
		render();
		let settled = false;
		const finish = (error) => {
			if (settled || sequence !== writeSequences[name]) return;
			settled = true;
			clearWriteTimeout(name);
			pending[name] = false;
			if (error) {
				options.onWriteError?.(name, error);
				beginRead(true);
				return;
			}
			render();
			if (values[name] === normalizedEnabled) {
				options.onWriteSuccess?.(name, normalizedEnabled);
			}
		};
		writeTimeoutTimers[name] = schedule(
			() => finish("Settings write timed out"),
			_POPUP_TOGGLE_WRITE_TIMEOUT_MS,
		);
		try {
			options.write(
				_POPUP_TOGGLE_STORAGE_KEYS[name],
				normalizedEnabled,
				finish,
			);
		} catch (error) {
			finish(error instanceof Error ? error.message : String(error));
		}
		return true;
	}

	function start() {
		if (started) return false;
		started = true;
		beginRead(true);
		return true;
	}

	return {
		applyStorageChanges,
		getSnapshot: snapshot,
		refresh: () => beginRead(true),
		start,
		write,
	};
}

document.addEventListener("DOMContentLoaded", () => {
	const THEME_KEY = "ttvab_theme";
	const VALID_THEMES = ["default", "retro"];

	function getStoredTheme() {
		try {
			const value = localStorage.getItem(THEME_KEY);
			return value && VALID_THEMES.includes(value) ? value : null;
		} catch (error) {
			console.error("[TTV AB] Popup theme read error:", error);
			return null;
		}
	}

	function setStoredTheme(theme) {
		try {
			localStorage.setItem(THEME_KEY, theme);
			return true;
		} catch (error) {
			console.error("[TTV AB] Popup theme write error:", error);
			return false;
		}
	}

	const initialTheme = getStoredTheme() || "retro";
	document.documentElement.setAttribute("data-theme", initialTheme);

	const toggle = document.getElementById(
		"enableToggle",
	) as HTMLInputElement | null;
	const statusDot = document.getElementById("statusDot") as HTMLElement | null;
	const statusText = document.getElementById(
		"statusText",
	) as HTMLElement | null;
	const adsBlockedCount = document.getElementById(
		"adsBlockedCount",
	) as HTMLElement | null;
	const timeSaved = document.getElementById("timeSaved") as HTMLElement | null;
	const statsToggle = document.getElementById(
		"statsToggle",
	) as HTMLButtonElement | null;
	const statsPanel = document.getElementById(
		"statsPanel",
	) as HTMLElement | null;
	const weeklyChart = document.getElementById(
		"weeklyChart",
	) as HTMLElement | null;
	const chartAvg = document.getElementById("chartAvg") as HTMLElement | null;
	const channelList = document.getElementById(
		"channelList",
	) as HTMLElement | null;
	const achievementsGrid = document.getElementById(
		"achievementsGrid",
	) as HTMLElement | null;
	const achievementsProgress = document.getElementById(
		"achievementsProgress",
	) as HTMLElement | null;
	const nextAchievement = document.getElementById(
		"nextAchievement",
	) as HTMLElement | null;
	const langSelector = document.getElementById(
		"langSelector",
	) as HTMLSelectElement | null;
	const langAutoOption = document.getElementById(
		"langAutoOption",
	) as HTMLOptionElement | null;
	const descriptionText = document.getElementById(
		"descriptionText",
	) as HTMLElement | null;
	const versionText = document.getElementById(
		"versionText",
	) as HTMLElement | null;
	const achievementsTitle = document.getElementById(
		"achievementsTitle",
	) as HTMLElement | null;
	const footerText = document.getElementById(
		"footerText",
	) as HTMLElement | null;
	const infoText = document.getElementById("infoText") as HTMLElement | null;
	const adSpoofingToggle = document.getElementById(
		"adSpoofingToggle",
	) as HTMLInputElement | null;
	const autoplayBackupToggle = document.getElementById(
		"autoplayBackupToggle",
	) as HTMLInputElement | null;
	const donateButton = document.getElementById(
		"donateBtn",
	) as HTMLAnchorElement | null;
	const repoLink = document.getElementById(
		"repoLink",
	) as HTMLAnchorElement | null;
	const authorLink = document.getElementById(
		"authorLink",
	) as HTMLAnchorElement | null;
	const reportBugLink = document.getElementById(
		"reportBugLink",
	) as HTMLAnchorElement | null;
	const logDialogOverlay = document.getElementById(
		"logDialogOverlay",
	) as HTMLDivElement | null;
	const logDialogGenerate = document.getElementById(
		"logDialogGenerate",
	) as HTMLButtonElement | null;
	const logDialogSkip = document.getElementById(
		"logDialogSkip",
	) as HTMLButtonElement | null;
	const logDialogClose = document.getElementById(
		"logDialogClose",
	) as HTMLButtonElement | null;
	const channelModalOverlay = document.getElementById(
		"channelModalOverlay",
	) as HTMLDivElement | null;
	const channelModalClose = document.getElementById(
		"channelModalClose",
	) as HTMLButtonElement | null;
	const channelModalVisit = document.getElementById(
		"channelModalVisit",
	) as HTMLButtonElement | null;
	const channelModalMonogram = document.getElementById(
		"channelModalMonogram",
	) as HTMLElement | null;
	const channelModalAvatar = document.getElementById(
		"channelModalAvatar",
	) as HTMLImageElement | null;
	const channelModalName = document.getElementById(
		"channelModalName",
	) as HTMLElement | null;
	const channelModalRank = document.getElementById(
		"channelModalRank",
	) as HTMLElement | null;
	const channelModalAds = document.getElementById(
		"channelModalAds",
	) as HTMLElement | null;
	const channelModalWatch = document.getElementById(
		"channelModalWatch",
	) as HTMLElement | null;
	const channelModalSaved = document.getElementById(
		"channelModalSaved",
	) as HTMLElement | null;
	const channelModalBreaks = document.getElementById(
		"channelModalBreaks",
	) as HTMLElement | null;
	const channelModalShareBar = document.getElementById(
		"channelModalShareBar",
	) as HTMLElement | null;
	const channelModalSharePct = document.getElementById(
		"channelModalSharePct",
	) as HTMLElement | null;
	const channelModalSince = document.getElementById(
		"channelModalSince",
	) as HTMLElement | null;
	const channelModalLast = document.getElementById(
		"channelModalLast",
	) as HTMLElement | null;
	const channelModalPulse = document.getElementById(
		"channelModalPulse",
	) as HTMLElement | null;
	const requiredElements = {
		toggle,
		statusDot,
		statusText,
		adsBlockedCount,
		timeSaved,
		statsToggle,
		statsPanel,
		weeklyChart,
		chartAvg,
		channelList,
		achievementsGrid,
		achievementsProgress,
		nextAchievement,
		langSelector,
		langAutoOption,
		descriptionText,
		versionText,
		achievementsTitle,
		footerText,
		infoText,
		adSpoofingToggle,
		autoplayBackupToggle,
		donateButton,
		repoLink,
		authorLink,
		reportBugLink,
		logDialogOverlay,
		logDialogGenerate,
		logDialogSkip,
		logDialogClose,
		channelModalOverlay,
		channelModalClose,
		channelModalVisit,
		channelModalMonogram,
		channelModalAvatar,
		channelModalName,
		channelModalRank,
		channelModalAds,
		channelModalWatch,
		channelModalSaved,
		channelModalBreaks,
		channelModalShareBar,
		channelModalSharePct,
		channelModalSince,
		channelModalLast,
		channelModalPulse,
	};
	for (const [name, element] of Object.entries(requiredElements)) {
		if (element) continue;
		console.error(`[TTV AB] Popup missing required element: ${name}`);
		return;
	}

	const LANG_KEY = "ttvab_lang";

	function getStoredLanguage() {
		try {
			return localStorage.getItem(LANG_KEY);
		} catch (error) {
			console.error("[TTV AB] Popup language read error:", error);
			return null;
		}
	}

	function setStoredLanguage(language) {
		try {
			localStorage.setItem(LANG_KEY, language);
			return true;
		} catch (error) {
			console.error("[TTV AB] Popup language write error:", error);
			return false;
		}
	}

	function normalizeLanguage(language) {
		const candidate = String(language || "").trim();
		if (!candidate || candidate.toLowerCase() === "auto") return null;
		const normalizedCandidate = candidate.replace(/-/g, "_");
		if (TRANSLATIONS[normalizedCandidate]) {
			return normalizedCandidate;
		}
		const lowerCandidate = candidate.toLowerCase();
		if (lowerCandidate.startsWith("zh")) {
			const normalized =
				lowerCandidate.includes("tw") ||
				lowerCandidate.includes("hk") ||
				lowerCandidate.includes("mo") ||
				lowerCandidate.includes("hant")
					? "zh_TW"
					: "zh_CN";
			return TRANSLATIONS[normalized] ? normalized : null;
		}
		const base = lowerCandidate.split(/[-_]/)[0];
		return TRANSLATIONS[base] ? base : null;
	}

	function normalizeLocaleTag(language) {
		const candidate = String(language || "").trim();
		if (!candidate) return "";
		return candidate.replace(/_/g, "-");
	}

	function getAutoLanguageCandidates() {
		const candidates = [];
		try {
			const uiLanguage = chrome.i18n?.getUILanguage?.();
			if (uiLanguage) {
				candidates.push(uiLanguage);
			}
		} catch (error) {
			console.error("[TTV AB] Popup UI language read error:", error);
		}
		if (Array.isArray(navigator.languages)) {
			candidates.push(...navigator.languages);
		}
		if (navigator.language) {
			candidates.push(navigator.language);
		}
		return [
			...new Set(candidates.map((value) => String(value || "").trim())),
		].filter(Boolean);
	}

	function getAutoLanguageState() {
		for (const candidate of getAutoLanguageCandidates()) {
			const normalizedLanguage = normalizeLanguage(candidate);
			if (!normalizedLanguage) continue;
			return {
				language: normalizedLanguage,
				localeTag:
					normalizeLocaleTag(candidate) ||
					normalizedLanguage.replace(/_/g, "-"),
			};
		}
		return {
			language: "en",
			localeTag: "en",
		};
	}

	function getLang() {
		const saved = getStoredLanguage();
		if (saved && saved !== "auto") {
			return normalizeLanguage(saved) || "en";
		}
		return getAutoLanguageState().language;
	}

	function getLocaleTag() {
		const saved = getStoredLanguage();
		if (saved && saved !== "auto") {
			return normalizeLocaleTag(saved) || getLang().replace(/_/g, "-");
		}
		return getAutoLanguageState().localeTag;
	}

	function formatTemplate(template, values) {
		return String(template || "").replace(/\{(\w+)\}/g, (_match, key) => {
			return values[key] ?? "";
		});
	}

	function getDateKey(date = new Date()) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	function parseDateKey(dateKey) {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) {
			return null;
		}
		const [year, month, day] = String(dateKey)
			.split("-")
			.map((value) => Number.parseInt(value, 10));
		if (
			!Number.isFinite(year) ||
			!Number.isFinite(month) ||
			!Number.isFinite(day)
		) {
			return null;
		}
		const date = new Date(year, month - 1, day);
		if (Number.isNaN(date.getTime())) return null;
		if (
			date.getFullYear() !== year ||
			date.getMonth() !== month - 1 ||
			date.getDate() !== day
		) {
			return null;
		}
		return date;
	}

	function getTranslations() {
		return TRANSLATIONS[getLang()] || TRANSLATIONS.en;
	}

	function getAchievementTranslation(id) {
		const t = getTranslations();
		return (
			t.achievementsMap?.[id] ||
			TRANSLATIONS.en.achievementsMap[id] || {
				name: String(id || "Achievement"),
				desc: "",
			}
		);
	}

	function applyTranslations(lang) {
		const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
		document.documentElement.lang = String((lang || "en").replace("_", "-"));
		channelList.setAttribute(
			"aria-label",
			String(t.topChannels ?? "Top Channels"),
		);
		document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
			const key = el.dataset.i18n;
			if (typeof key === "string" && Object.hasOwn(t, key)) {
				el.textContent = String(t[key]);
			}
		});
		descriptionText.textContent = String(t.descriptionText ?? "");
		donateButton.title = String(t.supportDeveloper ?? "Support GosuDRM");
		donateButton.setAttribute(
			"aria-label",
			String(t.supportDeveloper ?? "Support GosuDRM"),
		);
		langSelector.title = String(t.language ?? "Language");
		langSelector.setAttribute("aria-label", String(t.language ?? "Language"));
		langSelector.setAttribute("aria-describedby", "descriptionText");
		langAutoOption.textContent = `🌐 ${String(t.autoLanguage ?? "Auto")}`;
		const accessibleVersion = String(versionText.textContent || "")
			.replace(/^v/i, "")
			.trim();
		versionText.setAttribute(
			"aria-label",
			formatTemplate(String(t.versionLabel ?? "Version {version}"), {
				version: accessibleVersion,
			}),
		);
		statsToggle.setAttribute(
			"aria-label",
			String(t.statistics ?? "Statistics"),
		);
		toggle.setAttribute("aria-label", String(t.adBlocking ?? "Ad Blocking"));
		adSpoofingToggle.setAttribute(
			"aria-label",
			String(t.adSpoofing ?? "Ad Spoofing"),
		);
		autoplayBackupToggle.setAttribute(
			"aria-label",
			String(t.autoplayBackup ?? "Low Quality Fallback"),
		);
		achievementsTitle.textContent = `🏆 ${String(t.achievements ?? "Achievements")}`;
		footerText.textContent = String(t.footerBy ?? " — by ");
		const repoLabel = String(t.repoLinkLabel ?? "Open TTV AB on GitHub");
		repoLink.title = repoLabel;
		repoLink.setAttribute("aria-label", repoLabel);
		const authorLabel = String(t.authorLinkLabel ?? "Open GosuDRM on GitHub");
		authorLink.title = authorLabel;
		authorLink.setAttribute("aria-label", authorLabel);
		const reportBugLabel = String(t.reportBugLabel ?? "Found a Bug? Report it");
		reportBugLink.title = reportBugLabel;
		reportBugLink.setAttribute("aria-label", reportBugLabel);
	}

	function openIssuesPage() {
		const issuesUrl =
			reportBugLink.href || "https://github.com/GosuDRM/TTV-AB/issues";
		try {
			if (chrome?.tabs?.create) {
				chrome.tabs.create({ url: issuesUrl });
				return;
			}
		} catch {}
		window.open(issuesUrl, "_blank", "noopener,noreferrer");
	}

	function openChangelogPage() {
		const changelogUrl =
			"https://github.com/GosuDRM/TTV-AB/blob/main/CHANGELOG.md";
		try {
			if (chrome?.tabs?.create) {
				chrome.tabs.create({ url: changelogUrl });
				return;
			}
		} catch {}
		window.open(changelogUrl, "_blank", "noopener,noreferrer");
	}

	let logExportInProgress = false;
	let logExportGeneration = 0;

	function hideLogDialog(invalidateExport = false) {
		if (invalidateExport && logExportInProgress) {
			logExportGeneration += 1;
		}
		logDialogOverlay.hidden = true;
		logDialogGenerate.disabled = logExportInProgress;
		logDialogSkip.disabled = logExportInProgress;
	}

	reportBugLink.addEventListener("click", (event) => {
		event.preventDefault();
		logDialogOverlay.hidden = false;
		logDialogGenerate.disabled = logExportInProgress;
		logDialogSkip.disabled = logExportInProgress;
		(logExportInProgress ? logDialogClose : logDialogGenerate).focus();
	});

	versionText.addEventListener("click", () => {
		openChangelogPage();
	});

	versionText.addEventListener("keydown", (event) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		openChangelogPage();
	});

	logDialogSkip.addEventListener("click", () => {
		hideLogDialog();
		openIssuesPage();
	});

	logDialogClose.addEventListener("click", () => {
		hideLogDialog(true);
	});

	logDialogOverlay.addEventListener("click", (event) => {
		if (event.target === logDialogOverlay) {
			hideLogDialog(true);
		}
	});

	window.addEventListener("keydown", (event) => {
		if (event.key !== "Escape") return;
		if (!logDialogOverlay.hidden) {
			hideLogDialog(true);
		}
		if (!channelModalOverlay.hidden) {
			hideChannelModal();
		}
	});

	logDialogGenerate.addEventListener("click", () => {
		if (logDialogGenerate.disabled || logExportInProgress) return;
		logExportInProgress = true;
		const generation = ++logExportGeneration;
		logDialogGenerate.disabled = true;
		logDialogSkip.disabled = true;
		let destination: Promise<LogExportFileHandle> | null;
		try {
			destination = _requestLogExportFile();
		} catch (error) {
			destination = Promise.reject(error);
		}
		Promise.resolve(destination)
			.then(async (handle) => {
				const text = await _buildLogExport(
					() => generation !== logExportGeneration,
				);
				if (generation !== logExportGeneration) return;
				if (handle) {
					await _writeLogExportFile(handle, text);
				} else {
					_downloadLogExport(text);
				}
				if (generation !== logExportGeneration) return;
				hideLogDialog();
				openIssuesPage();
			})
			.catch((error) => {
				if (generation !== logExportGeneration) return;
				if (_isLogExportCancellation(error)) {
					logDialogOverlay.hidden = false;
					return;
				}
				console.error("[TTV AB] Log export failed:", error);
				logDialogOverlay.hidden = false;
			})
			.finally(() => {
				logExportInProgress = false;
				logDialogGenerate.disabled = false;
				logDialogSkip.disabled = false;
			});
	});

	let latestChannelStats: TTVABChannelMap = Object.create(null);
	let latestAdsTotal = 0;
	let latestMeasuredMilliseconds = 0;
	let openChannelModalName: string | null = null;

	function prefersReducedMotion() {
		try {
			return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		} catch {
			return false;
		}
	}

	function animateStatValue(element, targetValue, formatter) {
		const target = normalizeCount(targetValue);
		const format =
			typeof formatter === "function" ? formatter : (value) => String(value);
		if (prefersReducedMotion() || target <= 0) {
			element.textContent = format(target);
			return;
		}
		const durationMs = 550;
		const startedAt = performance.now();
		const step = (now) => {
			const progress = Math.min(1, (now - startedAt) / durationMs);
			const eased = 1 - (1 - progress) ** 3;
			element.textContent = format(Math.round(target * eased));
			if (progress < 1) requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	}

	function formatChannelDate(timestamp) {
		const safeTimestamp = normalizeTimestamp(timestamp);
		if (safeTimestamp <= 0) return "—";
		try {
			return new Intl.DateTimeFormat(getLocaleTag(), {
				month: "short",
				day: "numeric",
				year: "numeric",
			}).format(new Date(safeTimestamp));
		} catch {
			return new Date(safeTimestamp).toLocaleDateString();
		}
	}

	function formatRelativeTime(timestamp) {
		const safeTimestamp = normalizeTimestamp(timestamp);
		if (safeTimestamp <= 0) return "—";
		const elapsedMs = Math.max(0, Date.now() - safeTimestamp);
		const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
			[86400000, "day"],
			[3600000, "hour"],
			[60000, "minute"],
		];
		try {
			const formatter = new Intl.RelativeTimeFormat(getLocaleTag(), {
				numeric: "auto",
			});
			for (const [unitMs, unit] of units) {
				if (elapsedMs >= unitMs) {
					return formatter.format(-Math.floor(elapsedMs / unitMs), unit);
				}
			}
			return formatter.format(0, "minute");
		} catch {
			return formatChannelDate(safeTimestamp);
		}
	}

	function formatWatchTime(seconds) {
		const safeSeconds = normalizeCount(seconds);
		if (safeSeconds < 60) return `${safeSeconds}s`;
		const hours = Math.floor(safeSeconds / 3600);
		const minutes = Math.floor((safeSeconds % 3600) / 60);
		if (hours > 0) return `${hours}h ${minutes}m`;
		return `${minutes}m`;
	}

	const AVATAR_CACHE_KEY = "ttvChannelAvatars";
	const AVATAR_TTL_MS = 24 * 60 * 60 * 1000;
	const AVATAR_CACHE_MAX_ENTRIES = 100;
	const AVATAR_FETCH_TIMEOUT_MS = 4000;
	const TWITCH_GQL_URL = "https://gql.twitch.tv/gql";
	const TWITCH_PUBLIC_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
	const AVATAR_CDN_PREFIX = "https://static-cdn.jtvnw.net/";
	const avatarMemoryCache = new Map<string, string | null>();

	function sanitizeAvatarUrl(value): string | null {
		return typeof value === "string" && value.startsWith(AVATAR_CDN_PREFIX)
			? value
			: null;
	}

	function readAvatarCache(): Promise<PlainObject> {
		return new Promise((resolve) => {
			try {
				chrome.storage.local.get([AVATAR_CACHE_KEY], (result) => {
					if (chrome.runtime.lastError) {
						resolve({});
						return;
					}
					const cache = result?.[AVATAR_CACHE_KEY];
					resolve(isPlainObject(cache) ? cache : {});
				});
			} catch {
				resolve({});
			}
		});
	}

	function writeAvatarCache(cache: PlainObject) {
		const entries = Object.entries(cache)
			.filter(([, entry]) => isPlainObject(entry))
			.sort(
				(a, b) =>
					normalizeCount((b[1] as PlainObject).fetchedAt) -
					normalizeCount((a[1] as PlainObject).fetchedAt),
			)
			.slice(0, AVATAR_CACHE_MAX_ENTRIES);
		try {
			chrome.storage.local.set(
				{ [AVATAR_CACHE_KEY]: Object.fromEntries(entries) },
				() => {
					void chrome.runtime.lastError;
				},
			);
		} catch {}
	}

	function fetchAvatarFromTwitch(channelName): Promise<string | null> {
		const controller = new AbortController();
		const timeoutId = setTimeout(
			() => controller.abort(),
			AVATAR_FETCH_TIMEOUT_MS,
		);
		return fetch(TWITCH_GQL_URL, {
			method: "POST",
			signal: controller.signal,
			headers: {
				"Client-ID": TWITCH_PUBLIC_CLIENT_ID,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query:
					"query($login: String!) { user(login: $login) { profileImageURL(width: 150) } }",
				variables: { login: channelName },
			}),
		})
			.then((response) => (response.ok ? response.json() : null))
			.then((payload) => {
				const data = payload as PlainObject | null;
				const user = (data?.data as PlainObject | undefined)?.user as
					| PlainObject
					| undefined;
				return sanitizeAvatarUrl(user?.profileImageURL);
			})
			.catch(() => null)
			.finally(() => clearTimeout(timeoutId));
	}

	async function getChannelAvatarUrl(channelName): Promise<string | null> {
		if (avatarMemoryCache.has(channelName)) {
			return avatarMemoryCache.get(channelName) ?? null;
		}
		const cache = await readAvatarCache();
		const cached = isPlainObject(cache[channelName])
			? (cache[channelName] as PlainObject)
			: null;
		const cachedUrl = sanitizeAvatarUrl(cached?.url);
		const cachedAt = normalizeCount(cached?.fetchedAt);
		if (cachedUrl && Date.now() - cachedAt < AVATAR_TTL_MS) {
			avatarMemoryCache.set(channelName, cachedUrl);
			return cachedUrl;
		}
		const fetchedUrl = await fetchAvatarFromTwitch(channelName);
		avatarMemoryCache.set(channelName, fetchedUrl);
		if (fetchedUrl) {
			cache[channelName] = { url: fetchedUrl, fetchedAt: Date.now() };
			writeAvatarCache(cache);
		}
		return fetchedUrl;
	}

	function applyChannelAvatar(channelName) {
		channelModalAvatar.hidden = true;
		channelModalAvatar.removeAttribute("src");
		getChannelAvatarUrl(channelName)
			.then((url) => {
				if (!url || openChannelModalName !== channelName) return;
				channelModalAvatar.onload = () => {
					if (openChannelModalName === channelName) {
						channelModalAvatar.hidden = false;
					}
				};
				channelModalAvatar.onerror = () => {
					channelModalAvatar.hidden = true;
				};
				channelModalAvatar.src = url;
			})
			.catch(() => {});
	}

	function fetchChannelLiveStatus(channelName): Promise<boolean | null> {
		const controller = new AbortController();
		const timeoutId = setTimeout(
			() => controller.abort(),
			AVATAR_FETCH_TIMEOUT_MS,
		);
		return fetch(TWITCH_GQL_URL, {
			method: "POST",
			signal: controller.signal,
			headers: {
				"Client-ID": TWITCH_PUBLIC_CLIENT_ID,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query:
					"query($login: String!) { user(login: $login) { stream { id } } }",
				variables: { login: channelName },
			}),
		})
			.then((response) => (response.ok ? response.json() : null))
			.then((payload) => {
				const data = payload as PlainObject | null;
				const user = (data?.data as PlainObject | undefined)?.user as
					| PlainObject
					| undefined;
				if (!user) return null;
				const stream = user.stream;
				return stream != null && typeof stream === "object";
			})
			.catch(() => null)
			.finally(() => clearTimeout(timeoutId));
	}

	function setChannelPulseState(state) {
		channelModalPulse.classList.remove("is-live", "is-offline");
		if (state === "live") {
			channelModalPulse.classList.add("is-live");
		} else if (state === "offline") {
			channelModalPulse.classList.add("is-offline");
		}
	}

	function applyChannelLiveStatus(channelName) {
		setChannelPulseState("loading");
		fetchChannelLiveStatus(channelName)
			.then((isLive) => {
				if (openChannelModalName !== channelName || isLive === null) return;
				setChannelPulseState(isLive ? "live" : "offline");
			})
			.catch(() => {});
	}

	function fillChannelModal(channelName) {
		const entry = normalizeChannelEntry(latestChannelStats[channelName]);
		const rankedEntries = Object.entries(latestChannelStats)
			.filter(
				([, candidate]) =>
					normalizeCount(normalizeChannelEntry(candidate).ads) > 0,
			)
			.sort((a, b) => {
				const countDiff =
					normalizeCount(normalizeChannelEntry(b[1]).ads) -
					normalizeCount(normalizeChannelEntry(a[1]).ads);
				return countDiff !== 0 ? countDiff : a[0].localeCompare(b[0]);
			});
		const rank = rankedEntries.findIndex(([name]) => name === channelName) + 1;
		const t = getTranslations();

		channelModalMonogram.textContent = channelName.charAt(0).toUpperCase();
		channelModalName.textContent = channelName;
		channelModalName.title = channelName;
		channelModalRank.textContent = formatTemplate(
			String(t.channelModalRank ?? "#{rank} of {total}"),
			{
				rank: formatNumber(Math.max(1, rank)),
				total: formatNumber(Math.max(1, rankedEntries.length)),
			},
		);

		animateStatValue(channelModalAds, entry.ads, (value) =>
			formatNumber(value),
		);
		animateStatValue(channelModalWatch, entry.watchSeconds, (value) =>
			formatWatchTime(value),
		);
		animateStatValue(channelModalSaved, entry.adMilliseconds, (value) =>
			formatTimeSaved(value),
		);
		animateStatValue(channelModalBreaks, Math.ceil(entry.ads / 3), (value) =>
			formatNumber(value),
		);

		const sharePercent =
			latestAdsTotal > 0
				? Math.min(100, Math.round((entry.ads / latestAdsTotal) * 100))
				: 0;
		channelModalSharePct.textContent = `${sharePercent}%`;
		channelModalShareBar.style.width = "0%";
		requestAnimationFrame(() => {
			channelModalShareBar.style.width = `${Math.max(sharePercent, entry.ads > 0 ? 2 : 0)}%`;
		});

		channelModalSince.textContent = formatChannelDate(entry.firstSeen);
		channelModalLast.textContent = formatRelativeTime(entry.lastSeen);
	}

	function openChannelModal(channelName) {
		const safeChannel = normalizeChannelName(channelName);
		if (!safeChannel) return;
		openChannelModalName = safeChannel;
		fillChannelModal(safeChannel);
		applyChannelAvatar(safeChannel);
		applyChannelLiveStatus(safeChannel);
		channelModalOverlay.hidden = false;
		channelModalClose.focus();
	}

	function hideChannelModal() {
		openChannelModalName = null;
		channelModalOverlay.hidden = true;
		setChannelPulseState("loading");
	}

	function refreshOpenChannelModal() {
		if (!openChannelModalName || channelModalOverlay.hidden) return;
		fillChannelModal(openChannelModalName);
	}

	channelModalClose.addEventListener("click", () => {
		hideChannelModal();
	});

	channelModalOverlay.addEventListener("click", (event) => {
		if (event.target === channelModalOverlay) {
			hideChannelModal();
		}
	});

	channelModalVisit.addEventListener("click", () => {
		const channelName = openChannelModalName;
		if (!channelName) return;
		const channelUrl = `https://www.twitch.tv/${channelName}`;
		try {
			if (chrome?.tabs?.create) {
				chrome.tabs.create({ url: channelUrl });
				return;
			}
		} catch {}
		window.open(channelUrl, "_blank", "noopener,noreferrer");
	});

	const savedLang = getStoredLanguage();
	const normalizedSavedLang =
		savedLang && savedLang !== "auto"
			? normalizeLanguage(savedLang)
			: savedLang;
	const hasExplicitSavedLang =
		typeof savedLang === "string" && savedLang.trim() !== "";
	const hasValidSavedLang =
		!hasExplicitSavedLang ||
		normalizedSavedLang === "auto" ||
		Boolean(normalizedSavedLang && TRANSLATIONS[normalizedSavedLang]);
	const currentLang = hasValidSavedLang
		? normalizedSavedLang || "auto"
		: "auto";
	if (!hasValidSavedLang) {
		setStoredLanguage("auto");
	} else if (
		normalizedSavedLang &&
		normalizedSavedLang !== savedLang &&
		normalizedSavedLang !== "auto"
	) {
		setStoredLanguage(normalizedSavedLang);
	}
	langSelector.value = currentLang;
	let selectedLanguage = currentLang;
	applyTranslations(getLang());

	try {
		const manifest = chrome.runtime?.getManifest?.();
		if (manifest?.version && versionText) {
			versionText.textContent = `v${manifest.version}`;
			versionText.setAttribute(
				"aria-label",
				formatTemplate(
					String(getTranslations().versionLabel ?? "Version {version}"),
					{
						version: manifest.version,
					},
				),
			);
		}
	} catch (error) {
		console.error("[TTV AB] Popup manifest read error:", error);
	}

	langSelector.addEventListener("change", (e) => {
		const nextSelector = e.currentTarget;
		if (!(nextSelector instanceof HTMLSelectElement)) return;
		const lang = nextSelector.value;
		if (!setStoredLanguage(lang)) {
			nextSelector.value = selectedLanguage;
			return;
		}
		selectedLanguage = lang;
		const effectiveLang =
			lang === "auto" ? getAutoLanguageState().language : lang;
		applyTranslations(effectiveLang);
		loadStatistics();
		updateStatus(toggle.checked);
	});

	const themeToggle = document.getElementById("themeToggle");

	function applyTheme(theme) {
		const safeTheme = VALID_THEMES.includes(theme) ? theme : "retro";
		document.documentElement.setAttribute("data-theme", safeTheme);
		if (!themeToggle) return;
		themeToggle
			.querySelectorAll<HTMLButtonElement>(".theme-dot")
			.forEach((dot) => {
				const isActive = dot.dataset.themeValue === safeTheme;
				dot.classList.toggle("active", isActive);
				dot.setAttribute("aria-pressed", String(isActive));
			});
	}

	applyTheme(initialTheme);

	if (themeToggle) {
		themeToggle
			.querySelectorAll<HTMLButtonElement>(".theme-dot")
			.forEach((dot) => {
				dot.addEventListener("click", () => {
					const theme = dot.dataset.themeValue || "retro";
					if (setStoredTheme(theme)) {
						applyTheme(theme);
					}
				});
			});
	}

	const MAX_CHANNELS = 100;

	const ACHIEVEMENTS = [
		{
			id: "first_block",
			icon: "⚔️",
			threshold: 1,
			type: "ads",
		},
		{ id: "block_10", icon: "🛡️", threshold: 10, type: "ads" },
		{
			id: "block_100",
			icon: "🔰",
			threshold: 100,
			type: "ads",
		},
		{
			id: "block_500",
			icon: "🏰",
			threshold: 500,
			type: "ads",
		},
		{
			id: "block_1000",
			icon: "🏆",
			threshold: 1000,
			type: "ads",
		},
		{
			id: "block_5000",
			icon: "👑",
			threshold: 5000,
			type: "ads",
		},
		{
			id: "time_1h",
			icon: "⏱️",
			threshold: 3600000,
			type: "time",
		},
		{
			id: "time_10h",
			icon: "⏰",
			threshold: 36000000,
			type: "time",
		},
		{
			id: "channels_5",
			icon: "📺",
			threshold: 5,
			type: "channels",
		},
		{
			id: "channels_20",
			icon: "🌍",
			threshold: 20,
			type: "channels",
		},
		{
			id: "block_10000",
			icon: "💎",
			threshold: 10000,
			type: "ads",
		},
		{
			id: "channels_50",
			icon: "🗺️",
			threshold: 50,
			type: "channels",
		},
	];
	const ACHIEVEMENT_IDS = new Set(
		ACHIEVEMENTS.map((achievement) => achievement.id),
	);

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

	function formatTimeSaved(milliseconds) {
		const safeMilliseconds = normalizeCount(milliseconds);
		const hours = Math.floor(safeMilliseconds / 3600000);
		const minutes = Math.floor((safeMilliseconds % 3600000) / 60000);
		const secondsWithinMinute = (safeMilliseconds % 60000) / 1000;
		const secondsText = Number.isInteger(secondsWithinMinute)
			? String(secondsWithinMinute)
			: secondsWithinMinute.toFixed(3).replace(/0+$/, "");
		if (hours > 0) return `${hours}h ${minutes}m ${secondsText}s`;
		if (minutes > 0) return `${minutes}m ${secondsText}s`;
		return `${secondsText}s`;
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

	function createChannelsMap(): TTVABChannelMap {
		return Object.create(null);
	}

	function createDailyStatsMap(): TTVABDailyStatsMap {
		return Object.create(null);
	}

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

	function normalizeDailyStatsMap(value) {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			return createDailyStatsMap();
		}
		const normalized = createDailyStatsMap();
		const todayKey = getDateKey();
		for (const [dateKey, entry] of Object.entries(value)) {
			if (!parseDateKey(dateKey) || dateKey > todayKey) continue;
			const safeEntry = isPlainObject(entry) ? entry : {};
			normalized[dateKey] = {
				ads: normalizeCount(safeEntry.ads),
			};
		}
		return normalized;
	}

	function updateTimeSaved() {
		timeSaved.textContent = formatTimeSaved(latestMeasuredMilliseconds);
	}

	function getLast7Days() {
		const startOfWeek = new Date();
		startOfWeek.setHours(0, 0, 0, 0);
		const dayOfWeek = startOfWeek.getDay();
		const daysSinceMonday = (dayOfWeek + 6) % 7;
		startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);
		const days = [];
		for (let i = 0; i < 7; i++) {
			const d = new Date(startOfWeek);
			d.setDate(startOfWeek.getDate() + i);
			days.push(getDateKey(d));
		}
		return days;
	}

	function renderChart(dailyData) {
		const safeDailyData =
			dailyData && typeof dailyData === "object" && !Array.isArray(dailyData)
				? dailyData
				: ({} as TTVABDailyStatsMap);
		const t = getTranslations();
		const days = getLast7Days();
		const todayKey = getDateKey();
		const parsedDays = days.map((dayKey) => parseDateKey(dayKey));
		const values = days.map((d) => {
			if (d > todayKey) return 0;
			return normalizeCount(safeDailyData[d]?.ads);
		});
		const max = Math.max(...values, 1);
		const completedDayCount = Math.max(
			1,
			days.filter((dayKey) => dayKey <= todayKey).length,
		);
		const avg = Math.round(
			values.reduce((a, b) => a + b, 0) / completedDayCount,
		);
		const formatter = new Intl.DateTimeFormat(getLocaleTag(), {
			weekday: "short",
		});

		weeklyChart.replaceChildren();
		for (const [index, value] of values.entries()) {
			const height = value > 0 ? Math.max((value / max) * 100, 8) : 0;
			const dayName = parsedDays[index]
				? formatter.format(parsedDays[index])
				: "?";
			const bar = document.createElement("div");
			bar.className = "chart-bar";
			bar.style.height = `${height}%`;
			const summary = `${dayName}: ${formatNumber(value)}`;
			bar.title = summary;
			bar.setAttribute("role", "img");
			bar.setAttribute("aria-label", summary);
			weeklyChart.append(bar);
		}

		chartAvg.textContent = formatTemplate(String(t.avgPerDay ?? ""), {
			avg: formatNumber(avg),
		});
	}

	function createChannelItem(rank, name, countText, channelKey = null) {
		const item = document.createElement("div");
		item.className = "channel-item";
		item.setAttribute("role", "listitem");
		item.setAttribute("aria-label", `${rank} ${name}: ${countText}`.trim());

		const left = document.createElement("span");
		const rankSpan = document.createElement("span");
		rankSpan.className = "channel-rank";
		rankSpan.textContent = rank;
		const nameSpan = document.createElement("span");
		nameSpan.className = "channel-name";
		nameSpan.textContent = name;
		nameSpan.title = name;
		nameSpan.setAttribute("aria-label", name);
		left.append(rankSpan, nameSpan);

		const count = document.createElement("span");
		count.className = "channel-count";
		count.textContent = countText;

		item.append(left, count);
		if (channelKey) {
			item.classList.add("channel-item-clickable");
			item.setAttribute("role", "button");
			item.setAttribute("tabindex", "0");
			item.addEventListener("click", () => {
				openChannelModal(channelKey);
			});
			item.addEventListener("keydown", (event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					openChannelModal(channelKey);
				}
			});
		}
		return item;
	}

	function renderChannels(channelsData) {
		const entries = (
			Object.entries(channelsData || {}) as Array<[string, TTVABChannelEntry]>
		).filter(([, entry]) => normalizeCount(entry?.ads) > 0);
		channelList.replaceChildren();
		if (entries.length === 0) {
			const t = TRANSLATIONS[getLang()] || TRANSLATIONS.en;
			channelList.append(
				createChannelItem("-", String(t.noDataYet ?? ""), "-"),
			);
			return;
		}

		entries.sort((a, b) => {
			const countDiff = normalizeCount(b[1].ads) - normalizeCount(a[1].ads);
			return countDiff !== 0 ? countDiff : a[0].localeCompare(b[0]);
		});
		const top5 = entries.slice(0, 5);
		for (const [index, entry] of top5.entries()) {
			channelList.append(
				createChannelItem(
					`${index + 1}.`,
					entry[0],
					formatNumber(normalizeCount(entry[1].ads)),
					entry[0],
				),
			);
		}
	}

	function renderAchievements(unlocked, adsBlocked, channelCount) {
		const safeUnlocked = Array.isArray(unlocked)
			? [
					...new Set(
						unlocked.filter(
							(id) => typeof id === "string" && ACHIEVEMENT_IDS.has(id),
						),
					),
				]
			: [];
		const safeAdsBlocked = normalizeCount(adsBlocked);
		const safeChannelCount = normalizeCount(channelCount);
		const badges =
			achievementsGrid.querySelectorAll<HTMLButtonElement>(
				".achievement-badge",
			);
		const timeSavedMilliseconds = latestMeasuredMilliseconds;
		const t = getTranslations();
		let unlockedCount = 0;
		let nextAch = null;

		ACHIEVEMENTS.forEach((ach, i) => {
			const badge = badges[i];
			if (!badge) return;
			const achievementText = getAchievementTranslation(ach.id);
			const isUnlocked = safeUnlocked.includes(ach.id);
			const badgeLabel = `${achievementText.name} - ${achievementText.desc}`;
			badge.title = badgeLabel;
			badge.setAttribute("aria-label", badgeLabel);
			badge.setAttribute("aria-pressed", String(isUnlocked));
			if (isUnlocked) {
				badge.classList.add("unlocked");
				unlockedCount++;
			} else {
				badge.classList.remove("unlocked");
				if (!nextAch) {
					let value = 0;
					switch (ach.type) {
						case "ads":
							value = safeAdsBlocked;
							break;
						case "time":
							value = timeSavedMilliseconds;
							break;
						case "channels":
							value = safeChannelCount;
							break;
					}
					if (value < ach.threshold) {
						nextAch = ach;
					}
				}
			}
		});

		achievementsProgress.textContent = `${unlockedCount}/${ACHIEVEMENTS.length}`;

		nextAchievement.textContent = "";
		const nextAchievementName = document.createElement("span");
		nextAchievementName.className = "next-achievement-name";
		if (nextAch) {
			const achievementText = getAchievementTranslation(nextAch.id);
			nextAchievement.append(`${String(t.next ?? "")}: `);
			nextAchievementName.textContent = `${nextAch.icon} ${achievementText.name}`;
			nextAchievement.append(nextAchievementName);
		} else {
			nextAchievementName.textContent = `🎉 ${String(t.allUnlocked ?? "")}`;
			nextAchievement.append(nextAchievementName);
		}
	}

	function loadStatistics() {
		chrome.storage.local.get(["ttvStats", "ttvAdsBlocked"], (result) => {
			if (chrome.runtime.lastError) {
				console.error(
					"[TTV AB] Popup stats read error:",
					chrome.runtime.lastError.message,
				);
			}
			const safeResult = (result || {}) as PlainObject;
			const stats = isPlainObject(safeResult.ttvStats)
				? safeResult.ttvStats
				: ({} as PlainObject);
			const daily = normalizeDailyStatsMap(stats.daily);
			const channels = normalizeChannelsMap(stats.channels);
			const measuredMilliseconds = Object.hasOwn(stats, "adMillisecondsSaved")
				? normalizeCount(stats.adMillisecondsSaved)
				: normalizeCount(stats.adSecondsSaved) * 1000;
			const achievements = normalizeAchievementList(
				stats.achievements,
				measuredMilliseconds,
			);
			const adsCount = normalizeCount(safeResult.ttvAdsBlocked);
			let channelCount = 0;
			for (const entry of Object.values(channels)) {
				if (normalizeCount(entry?.ads) > 0) channelCount++;
			}

			latestChannelStats = channels;
			latestAdsTotal = adsCount;
			latestMeasuredMilliseconds = measuredMilliseconds;
			updateTimeSaved();
			refreshOpenChannelModal();

			renderChart(daily);
			renderChannels(channels);
			renderAchievements(achievements, adsCount, channelCount);
			syncExpandedStatsPanelHeight();
		});
	}

	function setToggleRowOpacity(element, enabled) {
		const opacity = enabled ? "1" : "0.4";
		const row = element.closest(".toggle-row");
		const label = row?.querySelector(".toggle-label");
		const slider = row?.querySelector(".slider");
		if (label) (label as HTMLElement).style.opacity = opacity;
		if (slider) (slider as HTMLElement).style.opacity = opacity;
	}

	let toggleStatusReady = false;

	function renderPopupToggleState(snapshot) {
		toggle.checked = snapshot.values.adblock;
		adSpoofingToggle.checked = snapshot.values.adSpoofing;
		autoplayBackupToggle.checked = snapshot.values.autoplayBackup;
		toggle.disabled = !snapshot.available.adblock;
		adSpoofingToggle.disabled = !snapshot.available.adSpoofing;
		autoplayBackupToggle.disabled = !snapshot.available.autoplayBackup;
		setToggleRowOpacity(adSpoofingToggle, snapshot.available.adSpoofing);
		setToggleRowOpacity(
			autoplayBackupToggle,
			snapshot.available.autoplayBackup,
		);
		if (snapshot.ready && toggleStatusReady) {
			updateStatus(snapshot.values.adblock, false);
		}
	}

	const popupToggleController = _createPopupToggleController({
		read(keys, finish) {
			chrome.storage.local.get(keys, (result) => {
				const error = chrome.runtime.lastError?.message || null;
				finish(result, error);
			});
		},
		write(storageKey, enabled, finish) {
			chrome.storage.local.set({ [storageKey]: enabled }, () => {
				finish(chrome.runtime.lastError?.message || null);
			});
		},
		render: renderPopupToggleState,
		onReadError(error, attempt) {
			console.error(
				`[TTV AB] Popup settings read error (attempt ${attempt}):`,
				error,
			);
		},
		onWriteError(name, error) {
			console.error(`[TTV AB] Popup ${name} toggle write error:`, error);
		},
		onWriteSuccess(name, enabled) {
			updateStatus(enabled, true, name);
		},
	});

	chrome.storage.onChanged.addListener((changes, namespace) => {
		if (namespace !== "local") return;
		popupToggleController.applyStorageChanges(changes);
		if (changes.ttvAdsBlocked) {
			const newCount = normalizeCount(changes.ttvAdsBlocked.newValue);
			animateCounter(adsBlockedCount, newCount);
		}
		if (changes.ttvStats) {
			loadStatistics();
		}
	});

	popupToggleController.start();

	chrome.storage.local.get(["ttvAdsBlocked"], (result) => {
		if (chrome.runtime.lastError) {
			console.error(
				"[TTV AB] Popup count read error:",
				chrome.runtime.lastError.message,
			);
			return;
		}
		const safeResult = (result || {}) as PlainObject;
		adsBlockedCount.textContent = formatNumber(
			normalizeCount(safeResult.ttvAdsBlocked),
		);
	});

	loadStatistics();

	toggle.addEventListener("change", () => {
		popupToggleController.write("adblock", toggle.checked);
	});

	const adSpoofingInfoIcon = document.getElementById("adSpoofingInfoIcon");
	const adSpoofingTooltip = document.getElementById("adSpoofingTooltip");
	if (adSpoofingInfoIcon && adSpoofingTooltip) {
		adSpoofingInfoIcon.addEventListener("click", (e) => {
			e.stopPropagation();
			const isVisible = adSpoofingTooltip.classList.contains("visible");
			if (isVisible) {
				adSpoofingTooltip.hidden = true;
				adSpoofingTooltip.classList.remove("visible");
			} else {
				adSpoofingTooltip.hidden = false;
				adSpoofingTooltip.classList.add("visible");
			}
		});
		adSpoofingTooltip.addEventListener("click", (e) => {
			if (e.target === adSpoofingTooltip) {
				adSpoofingTooltip.hidden = true;
				adSpoofingTooltip.classList.remove("visible");
			}
		});
		const modalClose = document.getElementById("adSpoofingModalClose");
		if (modalClose) {
			modalClose.addEventListener("click", () => {
				adSpoofingTooltip.hidden = true;
				adSpoofingTooltip.classList.remove("visible");
			});
		}
	}

	adSpoofingToggle.addEventListener("change", () => {
		popupToggleController.write("adSpoofing", adSpoofingToggle.checked);
	});

	let bypassAutoplayBackupWarning = false;
	let isAutoplayBackupWarningContext = false;

	const autoplayBackupInfoIcon = document.getElementById(
		"autoplayBackupInfoIcon",
	);
	const autoplayBackupTooltip = document.getElementById(
		"autoplayBackupTooltip",
	);
	if (autoplayBackupInfoIcon && autoplayBackupTooltip) {
		autoplayBackupInfoIcon.addEventListener("click", (e) => {
			e.stopPropagation();
			const isVisible = autoplayBackupTooltip.classList.contains("visible");
			if (isVisible) {
				autoplayBackupTooltip.hidden = true;
				autoplayBackupTooltip.classList.remove("visible");
			} else {
				isAutoplayBackupWarningContext = false;
				autoplayBackupTooltip.hidden = false;
				autoplayBackupTooltip.classList.add("visible");
			}
		});
		autoplayBackupTooltip.addEventListener("click", (e) => {
			if (e.target === autoplayBackupTooltip) {
				autoplayBackupTooltip.hidden = true;
				autoplayBackupTooltip.classList.remove("visible");
			}
		});
	}

	if (autoplayBackupToggle) {
		autoplayBackupToggle.addEventListener("change", () => {
			const disabling = !autoplayBackupToggle.checked;
			if (disabling && !bypassAutoplayBackupWarning) {
				autoplayBackupToggle.checked = true;
				if (autoplayBackupTooltip) {
					isAutoplayBackupWarningContext = true;
					autoplayBackupTooltip.hidden = false;
					autoplayBackupTooltip.classList.add("visible");
				} else {
					console.error(
						"[TTV AB] Autoplay backup tooltip modal element not found in DOM",
					);
				}
				return;
			}
			bypassAutoplayBackupWarning = false;
			popupToggleController.write(
				"autoplayBackup",
				autoplayBackupToggle.checked,
			);
		});

		const autoplayBackupModalClose = document.getElementById(
			"autoplayBackupModalClose",
		);
		if (autoplayBackupModalClose && autoplayBackupTooltip) {
			autoplayBackupModalClose.addEventListener("click", () => {
				autoplayBackupTooltip.hidden = true;
				autoplayBackupTooltip.classList.remove("visible");
				if (isAutoplayBackupWarningContext && autoplayBackupToggle.checked) {
					bypassAutoplayBackupWarning = true;
					autoplayBackupToggle.checked = false;
					autoplayBackupToggle.dispatchEvent(new Event("change"));
				}
				isAutoplayBackupWarningContext = false;
			});
		}
	}

	function parseTransitionTimeToMs(value) {
		const trimmedValue = String(value || "").trim();
		if (!trimmedValue) return 0;
		if (trimmedValue.endsWith("ms")) {
			return Math.max(0, Number.parseFloat(trimmedValue) || 0);
		}
		if (trimmedValue.endsWith("s")) {
			return Math.max(0, (Number.parseFloat(trimmedValue) || 0) * 1000);
		}
		return Math.max(0, Number.parseFloat(trimmedValue) || 0);
	}

	function getTransitionTimeoutMs(element, propertyName, fallbackMs = 0) {
		const computedStyle = window.getComputedStyle(element);
		const transitionProperties = computedStyle.transitionProperty
			.split(",")
			.map((value) => value.trim());
		const transitionDurations = computedStyle.transitionDuration
			.split(",")
			.map(parseTransitionTimeToMs);
		const transitionDelays = computedStyle.transitionDelay
			.split(",")
			.map(parseTransitionTimeToMs);
		const transitionCount = Math.max(
			transitionProperties.length,
			transitionDurations.length,
			transitionDelays.length,
		);
		let matchedTimeoutMs = 0;
		let maxTimeoutMs = 0;

		for (let index = 0; index < transitionCount; index++) {
			const property =
				transitionProperties[
					index % Math.max(transitionProperties.length, 1)
				] || "";
			const duration =
				transitionDurations[index % Math.max(transitionDurations.length, 1)] ||
				0;
			const delay =
				transitionDelays[index % Math.max(transitionDelays.length, 1)] || 0;
			const totalMs = duration + delay;
			maxTimeoutMs = Math.max(maxTimeoutMs, totalMs);
			if (property === propertyName || property === "all") {
				matchedTimeoutMs = Math.max(matchedTimeoutMs, totalMs);
			}
		}

		const resolvedTimeoutMs = matchedTimeoutMs || maxTimeoutMs || fallbackMs;
		return resolvedTimeoutMs > 0 ? Math.ceil(resolvedTimeoutMs + 50) : 0;
	}

	let statsTransitionCleanup = null;

	function syncExpandedStatsPanelHeight() {
		if (statsPanel.hidden || !statsPanel.classList.contains("expanded")) return;
		statsPanel.style.maxHeight = `${statsPanel.scrollHeight}px`;
	}

	function setStatsPanelExpanded(isExpanded) {
		if (typeof statsTransitionCleanup === "function") {
			statsTransitionCleanup();
			statsTransitionCleanup = null;
		}
		if (isExpanded) {
			statsPanel.hidden = false;
			statsPanel.style.maxHeight = "0px";
			statsPanel.classList.add("expanded");
			statsPanel.setAttribute("aria-hidden", "false");
			statsToggle.classList.add("expanded");
			statsToggle.setAttribute("aria-expanded", "true");
			requestAnimationFrame(() => {
				syncExpandedStatsPanelHeight();
			});
			return;
		}
		statsPanel.style.maxHeight = `${statsPanel.scrollHeight}px`;
		statsPanel.classList.remove("expanded");
		statsPanel.setAttribute("aria-hidden", "true");
		statsToggle.classList.remove("expanded");
		statsToggle.setAttribute("aria-expanded", "false");
		if (statsPanel.contains(document.activeElement)) {
			statsToggle.focus();
		}
		requestAnimationFrame(() => {
			statsPanel.style.maxHeight = "0px";
		});
		const finalizeCollapse = () => {
			statsPanel.hidden = true;
			statsPanel.removeEventListener("transitionend", handleTransitionEnd);
			if (collapseFallbackTimeout) {
				clearTimeout(collapseFallbackTimeout);
				collapseFallbackTimeout = null;
			}
			statsTransitionCleanup = null;
		};
		const handleTransitionEnd = (event) => {
			if (event.target !== statsPanel || event.propertyName !== "max-height") {
				return;
			}
			finalizeCollapse();
		};
		const collapseFallbackDelayMs = getTransitionTimeoutMs(
			statsPanel,
			"max-height",
			window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
				? 0
				: 450,
		);
		let collapseFallbackTimeout = setTimeout(() => {
			finalizeCollapse();
		}, collapseFallbackDelayMs);
		statsTransitionCleanup = () => {
			statsPanel.removeEventListener("transitionend", handleTransitionEnd);
			if (collapseFallbackTimeout) {
				clearTimeout(collapseFallbackTimeout);
				collapseFallbackTimeout = null;
			}
		};
		statsPanel.addEventListener("transitionend", handleTransitionEnd);
	}

	function toggleStatsPanel() {
		const isExpanded = !statsPanel.classList.contains("expanded");
		setStatsPanelExpanded(isExpanded);
	}

	statsToggle.addEventListener("click", () => {
		toggleStatsPanel();
	});

	let statusTimeout = null;
	let transientStatusState = null;
	let transientStatusType = null;

	function renderStatusHelperText(translations) {
		if (transientStatusState === null || transientStatusType === null) {
			infoText.textContent = translations.changesInstantly;
			infoText.style.color = "#666";
			return;
		}
		let label = "";
		if (transientStatusType === "adSpoofing") {
			label = translations.adSpoofing;
		} else if (transientStatusType === "autoplayBackup") {
			label = translations.autoplayBackup;
		} else {
			label = translations.adBlocking;
		}
		infoText.textContent = `${label}: ${transientStatusState ? translations.active : translations.inactive}`;
		infoText.style.color = transientStatusState ? "#4CAF50" : "#f44336";
	}

	function updateStatus(
		enabled,
		showTransientMessage = false,
		toggleType = "adblock",
	) {
		const t = getTranslations();
		const prefersReducedMotion =
			window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
		infoText.style.transition = prefersReducedMotion
			? "none"
			: "color 0.3s ease";
		if (toggleType === "adblock") {
			statusDot.classList.toggle("disabled", !enabled);
			statusText.textContent = String(enabled ? t.active : t.inactive);
		}
		if (!showTransientMessage) {
			renderStatusHelperText(t);
			return;
		}

		if (statusTimeout) {
			clearTimeout(statusTimeout);
			statusTimeout = null;
		}
		transientStatusState = enabled;
		transientStatusType = toggleType;
		renderStatusHelperText(t);
		statusTimeout = setTimeout(() => {
			transientStatusState = null;
			transientStatusType = null;
			renderStatusHelperText(getTranslations());
			statusTimeout = null;
		}, 1500);
	}

	toggleStatusReady = true;
	const initialToggleSnapshot = popupToggleController.getSnapshot();
	if (initialToggleSnapshot.ready) {
		updateStatus(initialToggleSnapshot.values.adblock, false);
	}

	function formatNumber(num) {
		return new Intl.NumberFormat(getLocaleTag()).format(normalizeCount(num));
	}

	function animateCounter(element, newValue) {
		element.textContent = formatNumber(normalizeCount(newValue));
		element.classList.add("pulse");
		setTimeout(() => element.classList.remove("pulse"), 200);
	}
});
