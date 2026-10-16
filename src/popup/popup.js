// TTV AB - Popup Script
const _LOG_QUERY_TABS_TIMEOUT_MS = 2500;
const _LOG_COLLECT_TAB_TIMEOUT_MS = 8000;
const _LOG_EXPORT_MAX_TABS = 16;
const _LOG_EXPORT_BATCH_SIZE = 4;
const _LOG_EXPORT_MAX_CHARACTERS = 2 * 1024 * 1024;
const _LOG_EXPORT_UNKNOWN_TIMESTAMP = "????-??-??T??:??:??.???Z";
const _LOG_EXPORT_PAGE_PARAMETER = "ttvab-log-export";
const _LOG_EXPORT_LEVELS = new Set([
    "debug",
    "info",
    "success",
    "warning",
    "error",
]);
let _activeLogExportUrl = null;
function _isLogExportPage(search = window.location.search) {
    return new URLSearchParams(search).get(_LOG_EXPORT_PAGE_PARAMETER) === "1";
}
function _getLogExportPageUrl() {
    let pageUrl = "";
    try {
        pageUrl = chrome.runtime?.getURL?.("src/popup/popup.html") || "";
    }
    catch { }
    if (!pageUrl) {
        pageUrl = `${window.location.origin}${window.location.pathname}`;
    }
    return `${pageUrl}?${_LOG_EXPORT_PAGE_PARAMETER}=1`;
}
function _openLogExportPage() {
    const url = _getLogExportPageUrl();
    try {
        if (chrome?.tabs?.create) {
            chrome.tabs.create({ url, active: true });
            return true;
        }
    }
    catch { }
    return window.open(url, "_blank", "noopener,noreferrer") !== null;
}
function _releaseLogExportUrl() {
    if (!_activeLogExportUrl)
        return;
    URL.revokeObjectURL(_activeLogExportUrl);
    _activeLogExportUrl = null;
}
window.addEventListener("pagehide", _releaseLogExportUrl);
function _sanitizeLogExportText(value, maxLength = 4000) {
    const text = typeof value === "string" ? value : "";
    const limit = Math.max(0, maxLength);
    let sanitized = "";
    for (const character of text.replace(/\r\n?/g, "\n")) {
        const code = character.charCodeAt(0);
        if (code === 10 || (code >= 32 && code !== 127)) {
            sanitized += character;
        }
        if (sanitized.length >= limit)
            break;
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
    }
    catch {
        return "https://www.twitch.tv/";
    }
}
function _formatLogExportTimestamp(value) {
    let numericValue = Number.NaN;
    try {
        numericValue = Number(value);
    }
    catch { }
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return _LOG_EXPORT_UNKNOWN_TIMESTAMP;
    }
    const date = new Date(numericValue);
    if (!Number.isFinite(date.getTime()))
        return _LOG_EXPORT_UNKNOWN_TIMESTAMP;
    try {
        return date.toISOString();
    }
    catch {
        return _LOG_EXPORT_UNKNOWN_TIMESTAMP;
    }
}
function _stringifyLogExportValue(value, maxLength = 16000) {
    try {
        return _sanitizeLogExportText(JSON.stringify(value), maxLength).replace(/\n/g, " ");
    }
    catch {
        return "{}";
    }
}
function _formatLogEntryLine(entry) {
    const timestamp = _formatLogExportTimestamp(entry?.t);
    const generation = typeof entry?.g === "number" && Number.isFinite(entry.g)
        ? Math.max(0, Math.trunc(entry.g))
        : 0;
    const context = entry?.w === true
        ? `worker${generation > 0 ? `#g${generation}` : ""}`
        : "page";
    const rawLevel = typeof entry?.l === "string" ? entry.l.toLowerCase() : "info";
    const level = _LOG_EXPORT_LEVELS.has(rawLevel) ? rawLevel : "info";
    const mediaKey = _sanitizeLogExportText(entry?.k, 160).replace(/\n/g, "");
    const ownership = mediaKey ? ` media=${mediaKey}` : "";
    const messageLines = _sanitizeLogExportText(entry?.m).split("\n");
    const prefix = `${timestamp} [${context}:${level}]${ownership}`;
    return messageLines
        .map((line, index) => `${prefix}${index === 0 ? " " : " | "}${line}`)
        .join("\n");
}
function _getLogExportBrowser(navigatorInfo = navigator) {
    try {
        const userAgent = _sanitizeLogExportText(navigatorInfo.userAgent, 1024);
        const browsers = [
            ["Microsoft Edge", /(?:Edg|Edge)\/([\d.]+)/],
            ["Opera", /OPR\/([\d.]+)/],
            ["Vivaldi", /Vivaldi\/([\d.]+)/],
            ["Brave", /Brave\/([\d.]+)/],
            ["Firefox", /Firefox\/([\d.]+)/],
        ];
        for (const [name, pattern] of browsers) {
            const match = userAgent.match(pattern);
            if (match)
                return `${name} ${match[1].slice(0, 64)}`;
        }
        const chromiumVersion = userAgent.match(/(?:Chrome|Chromium)\/([\d.]+)/)?.[1];
        const brands = navigatorInfo.userAgentData?.brands;
        if (Array.isArray(brands)) {
            for (const name of [
                "Microsoft Edge",
                "Opera",
                "Vivaldi",
                "Brave",
                "Google Chrome",
                "Chromium",
            ]) {
                const brand = brands
                    .slice(0, 16)
                    .find((entry) => entry?.brand === name);
                if (!brand || !/^\d+(?:\.\d+){0,5}$/.test(brand.version))
                    continue;
                const version = (name === "Google Chrome" || name === "Chromium") && chromiumVersion
                    ? chromiumVersion
                    : brand.version;
                return `${name} ${version.slice(0, 64)}`;
            }
        }
        if (chromiumVersion)
            return `Chrome/Chromium ${chromiumVersion.slice(0, 64)}`;
    }
    catch { }
    return "unknown";
}
function _awaitLogExportValue(promise, timeoutMs, fallback) {
    let timer = null;
    return Promise.race([
        promise.catch(() => fallback),
        new Promise((resolve) => {
            timer = setTimeout(() => resolve(fallback), Math.max(0, timeoutMs));
        }),
    ]).finally(() => {
        if (timer !== null)
            clearTimeout(timer);
    });
}
function _getLogExportOsFromUserAgent(userAgent) {
    if (/Android/i.test(userAgent))
        return "Android";
    if (/CrOS/.test(userAgent))
        return "ChromeOS";
    if (/iPhone|iPad|iPod/.test(userAgent))
        return "iOS";
    if (/Windows NT 10\.0/.test(userAgent))
        return "Windows 10 or 11";
    if (/Windows/.test(userAgent))
        return "Windows";
    if (/Macintosh|Mac OS X/.test(userAgent))
        return "macOS";
    if (/Linux/.test(userAgent))
        return "Linux";
    return "unknown";
}
async function _getLogExportOperatingSystem(navigatorInfo = navigator, timeoutMs = 1000) {
    let fallback = "unknown";
    try {
        fallback = _getLogExportOsFromUserAgent(_sanitizeLogExportText(navigatorInfo?.userAgent, 1024));
        const userAgentData = navigatorInfo?.userAgentData;
        if (typeof userAgentData?.getHighEntropyValues !== "function") {
            return fallback;
        }
        const values = await _awaitLogExportValue(Promise.resolve(userAgentData.getHighEntropyValues([
            "platformVersion",
            "architecture",
            "bitness",
        ])), timeoutMs, null);
        const pick = (value, pattern) => typeof value === "string" && pattern.test(value) ? value : "";
        const platform = pick(values?.platform ?? userAgentData.platform, /^[A-Za-z][A-Za-z ]{0,23}$/);
        if (!platform)
            return fallback;
        const version = pick(values?.platformVersion, /^\d{1,4}(?:\.\d{1,6}){0,3}$/);
        const architecture = pick(values?.architecture, /^[a-z0-9_]{1,16}$/i);
        const bitness = pick(values?.bitness, /^\d{2}$/);
        const windowsMajor = Number.parseInt(version, 10);
        const name = platform === "Windows" && version
            ? windowsMajor >= 13
                ? "Windows 11"
                : windowsMajor >= 1
                    ? "Windows 10"
                    : "Windows 8.1 or earlier"
            : `${platform}${version ? ` ${version}` : ""}`;
        return architecture
            ? `${name} (${architecture}${bitness ? ` ${bitness}-bit` : ""})`
            : name;
    }
    catch {
        return fallback;
    }
}
const _LOG_EXPORT_DECODER_PROBES = [
    ["AVC", 'video/mp4; codecs="avc1.64002A"'],
    ["HEVC", 'video/mp4; codecs="hev1.1.6.L150.90"'],
    ["AV1", 'video/mp4; codecs="av01.0.12M.10"'],
];
async function _getLogExportDecoderSupport(environment = {
    mediaSource: typeof MediaSource === "function" ? MediaSource : null,
    mediaCapabilities: typeof navigator !== "undefined" ? navigator.mediaCapabilities : null,
}, timeoutMs = 1000) {
    const results = await Promise.all(_LOG_EXPORT_DECODER_PROBES.map(async ([name, contentType]) => {
        let support = "unknown";
        try {
            if (typeof environment.mediaSource?.isTypeSupported === "function") {
                support = environment.mediaSource.isTypeSupported(contentType)
                    ? "yes"
                    : "no";
            }
        }
        catch { }
        try {
            if (typeof environment.mediaCapabilities?.decodingInfo === "function") {
                const info = await _awaitLogExportValue(Promise.resolve(environment.mediaCapabilities.decodingInfo({
                    type: "media-source",
                    video: {
                        contentType,
                        width: 1920,
                        height: 1080,
                        bitrate: 6000000,
                        framerate: 60,
                    },
                })), timeoutMs, null);
                if (info && typeof info.supported === "boolean") {
                    support = !info.supported
                        ? "no"
                        : info.powerEfficient === true
                            ? "yes (power efficient)"
                            : "yes";
                }
            }
        }
        catch { }
        return `${name} ${support}`;
    }));
    return results.join(" | ");
}
function _formatLogExportLocalTime(date = new Date()) {
    if (!Number.isFinite(date.getTime()))
        return "unknown";
    const pad = (value) => String(value).padStart(2, "0");
    const offsetMinutes = -date.getTimezoneOffset();
    const absoluteOffset = Math.abs(offsetMinutes);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} UTC${offsetMinutes < 0 ? "-" : "+"}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
}
function _readLogExportExtensionSettings(timeoutMs = 1000) {
    const unavailable = "unavailable";
    if (typeof chrome?.storage?.local?.get !== "function") {
        return Promise.resolve(unavailable);
    }
    return _awaitLogExportValue(new Promise((resolve) => {
        try {
            chrome.storage.local.get(["ttvAdTimerEnabled", "ttvTurboMode"], (result) => {
                if (chrome.runtime.lastError || !result) {
                    resolve(unavailable);
                    return;
                }
                resolve(`Ad Break Timer ${result.ttvAdTimerEnabled === true ? "enabled" : "disabled"} | Turbo ${result.ttvTurboMode === true ? "enabled" : "disabled"}`);
            });
        }
        catch {
            resolve(unavailable);
        }
    }), timeoutMs, unavailable);
}
function _hasTwitchSiteAccess(timeoutMs = 1000) {
    if (typeof chrome?.permissions?.contains !== "function") {
        return Promise.resolve(null);
    }
    return _awaitLogExportValue(new Promise((resolve) => {
        try {
            chrome.permissions.contains({ origins: ["*://*.twitch.tv/*"] }, (granted) => {
                resolve(chrome.runtime.lastError || typeof granted !== "boolean"
                    ? null
                    : granted);
            });
        }
        catch {
            resolve(null);
        }
    }), timeoutMs, null);
}
function _getLogExportTabHint(tab, error) {
    const tabState = tab;
    if (tabState.discarded === true) {
        return "The browser unloaded this tab to save memory. Reload it, reproduce the issue, and export again.";
    }
    if (tabState.frozen === true) {
        return "The browser froze this background tab. Switch to it, then export again.";
    }
    if (error === "content-script-unavailable" ||
        error === "page-bridge-unavailable") {
        return "Refresh this tab, reproduce the issue, and export again. This happens when TTV AB was updated or reloaded after the tab opened, or when the browser paused the tab.";
    }
    return null;
}
function _getBugReportUrl(baseUrl, version, browser, os) {
    let url;
    try {
        url = new URL(baseUrl);
    }
    catch {
        url = new URL("https://github.com/GosuDRM/TTV-AB/issues/new");
    }
    if (url.origin !== "https://github.com" || !url.pathname.endsWith("/new")) {
        return url.href;
    }
    url.searchParams.set("template", "bug_report.yml");
    for (const [field, value, maxLength] of [
        ["version", version, 32],
        ["browser", browser, 96],
        ["os", os, 96],
    ]) {
        const safeValue = _sanitizeLogExportText(value, maxLength)
            .replace(/\n/g, " ")
            .trim();
        if (safeValue && safeValue !== "unknown") {
            url.searchParams.set(field, safeValue);
        }
    }
    return url.href;
}
function _formatLogContextLines(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return [];
    const context = value;
    const pageState = {
        pageVersion: _sanitizeLogExportText(context.pageVersion, 32),
        pageGeneration: Number(context.pageGeneration) || 0,
        unhookedPlayer: context.unhookedPlayer === true,
        lastEndedCycleStartedAt: Number(context.lastEndedCycleStartedAt) || 0,
        preferredQuality: _sanitizeLogExportText(context.preferredQuality, 64),
        mediaKey: typeof context.pageMediaKey === "string"
            ? _sanitizeLogExportText(context.pageMediaKey, 160).replace(/\n/g, "")
            : null,
        channel: typeof context.pageChannel === "string"
            ? _sanitizeLogExportText(context.pageChannel, 80).replace(/\n/g, "")
            : null,
        visibility: typeof context.visibility === "string"
            ? _sanitizeLogExportText(context.visibility, 24).replace(/\n/g, "")
            : "unknown",
        focused: context.focused === true,
        enabled: context.enabled === true,
        adSpoofingEnabled: context.adSpoofingEnabled === true,
        autoplayBackupEnabled: context.autoplayBackupEnabled === true,
        currentAdMediaKey: typeof context.currentAdMediaKey === "string"
            ? _sanitizeLogExportText(context.currentAdMediaKey, 160).replace(/\n/g, "")
            : null,
        activeCycleStartedAt: typeof context.activeCycleStartedAt === "number" &&
            Number.isFinite(context.activeCycleStartedAt)
            ? context.activeCycleStartedAt
            : 0,
        pinnedBackupPlayerType: typeof context.pinnedBackupPlayerType === "string"
            ? _sanitizeLogExportText(context.pinnedBackupPlayerType, 40).replace(/\n/g, "")
            : null,
        pinnedBackupMediaKey: typeof context.pinnedBackupMediaKey === "string"
            ? _sanitizeLogExportText(context.pinnedBackupMediaKey, 160).replace(/\n/g, "")
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
    const media = context.media;
    const selectedQuality = _sanitizeLogExportText(media?.selectedQuality, 96).replace(/\n/g, " ") ||
        "unknown";
    const qualitySource = media?.qualitySource === "player" ||
        media?.qualitySource === "saved preference"
        ? ` (${media.qualitySource})`
        : "";
    const currentQuality = _sanitizeLogExportText(media?.currentQuality, 96).replace(/\n/g, " ") ||
        "unknown";
    const width = Number(media?.width);
    const height = Number(media?.height);
    const resolution = Number.isInteger(width) &&
        width > 0 &&
        width <= 16384 &&
        Number.isInteger(height) &&
        height > 0 &&
        height <= 16384
        ? `${width}x${height}`
        : "unknown";
    const lowLatency = media?.lowLatencyEnabled === true
        ? "enabled"
        : media?.lowLatencyEnabled === false
            ? "disabled"
            : "unknown";
    const lowLatencySource = media?.lowLatencySource === "player" ||
        media?.lowLatencySource === "saved preference"
        ? ` (${media.lowLatencySource})`
        : "";
    lines.push(`Selected video quality: ${selectedQuality}${qualitySource}`, `Playing video quality: ${currentQuality} | Resolution: ${resolution}`, `Twitch Low Latency: ${lowLatency}${lowLatencySource}`);
    const workerRecovery = context.workerRecovery;
    if (workerRecovery && typeof workerRecovery === "object") {
        const phase = typeof workerRecovery.phase === "string" &&
            /^[a-z-]{1,24}$/.test(workerRecovery.phase)
            ? workerRecovery.phase
            : "unknown";
        const attempts = Math.max(0, Math.min(10, Math.trunc(Number(workerRecovery.attempts) || 0)));
        lines.push(`Worker recovery: ${phase}, ${attempts}/3 reloads used | Degraded page-side fallback: ${workerRecovery.degradedFallback === true ? "on" : "off"}`);
    }
    if (Array.isArray(context.workers)) {
        lines.push(`Workers: ${_stringifyLogExportValue(context.workers)}`);
    }
    if (Array.isArray(context.workerFailures) &&
        context.workerFailures.length > 0) {
        lines.push(`Worker failures: ${_stringifyLogExportValue(context.workerFailures, 32000)}`);
    }
    if (context.media && typeof context.media === "object") {
        lines.push(`Media state: ${_stringifyLogExportValue(context.media)}`);
    }
    if (context.recovery && typeof context.recovery === "object") {
        lines.push(`Post-ad recovery: ${_stringifyLogExportValue(context.recovery)}`);
    }
    return lines;
}
function _describeLogCollectionError(value) {
    const labels = {
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
function _queryTwitchTabs(timeoutMs = _LOG_QUERY_TABS_TIMEOUT_MS) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (tabs, error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve({ tabs, error });
        };
        const timer = setTimeout(() => finish([], "tab-query-timeout"), Math.max(0, timeoutMs));
        try {
            chrome.tabs.query({ url: "*://*.twitch.tv/*" }, (tabs) => {
                if (chrome.runtime.lastError || !Array.isArray(tabs)) {
                    finish([], "tab-query-failed");
                    return;
                }
                finish(tabs, null);
            });
        }
        catch {
            finish([], "tab-query-failed");
        }
    });
}
function _getTabDiagnosticCheckpoint(tabId, pageUrl) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        };
        const timer = setTimeout(() => finish(null), 1500);
        try {
            chrome.runtime.sendMessage({ type: "ttvab-get-diagnostic-checkpoint", detail: { tabId, pageUrl } }, (response) => {
                const checkpoint = response?.checkpoint;
                if (chrome.runtime.lastError ||
                    response?.ok !== true ||
                    !checkpoint ||
                    typeof checkpoint !== "object" ||
                    !Number.isFinite(checkpoint.capturedAt) ||
                    checkpoint.capturedAt <= 0 ||
                    checkpoint.capturedAt > Date.now() ||
                    Date.now() - checkpoint.capturedAt > 30 * 60 * 1000 ||
                    _sanitizeLogExportTabUrl(checkpoint.context?.pageUrl) !==
                        _sanitizeLogExportTabUrl(pageUrl)) {
                    finish(null);
                    return;
                }
                finish(checkpoint);
            });
        }
        catch {
            finish(null);
        }
    });
}
function _collectTabLogEntries(tabId, timeoutMs = _LOG_COLLECT_TAB_TIMEOUT_MS, pageUrl = null) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };
        const fail = async (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            const checkpoint = pageUrl
                ? await _getTabDiagnosticCheckpoint(tabId, pageUrl)
                : null;
            resolve(checkpoint
                ? {
                    entries: Array.isArray(checkpoint.entries)
                        ? checkpoint.entries.slice(-64)
                        : [],
                    context: checkpoint.context,
                    error,
                    truncatedEntries: Number(checkpoint.truncatedEntries) || 0,
                    cachedAt: Number(checkpoint.capturedAt),
                }
                : { entries: [], context: null, error, truncatedEntries: 0 });
        };
        const timer = setTimeout(() => fail("extension-response-timeout"), Math.max(0, timeoutMs));
        try {
            chrome.tabs.sendMessage(tabId, { type: "ttvab-collect-logs" }, { frameId: 0 }, (response) => {
                if (chrome.runtime.lastError) {
                    fail("content-script-unavailable");
                    return;
                }
                const data = response;
                if (data?.ok !== true) {
                    fail(typeof data?.error === "string"
                        ? data.error
                        : "collection-failed");
                    return;
                }
                finish({
                    entries: Array.isArray(data?.entries) ? data.entries : [],
                    context: data?.context &&
                        typeof data.context === "object" &&
                        !Array.isArray(data.context)
                        ? data.context
                        : null,
                    error: null,
                    truncatedEntries: typeof data?.truncatedEntries === "number" &&
                        Number.isFinite(data.truncatedEntries)
                        ? Math.max(0, Math.trunc(data.truncatedEntries))
                        : 0,
                });
            });
        }
        catch {
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
        if (activeDelta !== 0)
            return activeDelta;
        return (Number(b.lastAccessed) || 0) - (Number(a.lastAccessed) || 0);
    });
    const safeMaxTabs = Math.max(1, Math.trunc(Number(maxTabs) || 1));
    return {
        tabs: withIds.slice(0, safeMaxTabs),
        omittedTabs: Math.max(0, withIds.length - safeMaxTabs),
    };
}
function _buildTabLogSection(tab, index, result, maxCharacters) {
    const collectedPageUrl = typeof result.context?.pageUrl === "string"
        ? result.context.pageUrl
        : tab.url;
    const lines = [
        `==== Tab ${index + 1}: ${_sanitizeLogExportTabUrl(collectedPageUrl)} ====`,
        ...(result.cachedAt
            ? [
                `Last recorded snapshot: ${_formatLogExportTimestamp(result.cachedAt)} (cached before collection; not live state)`,
            ]
            : []),
        ..._formatLogContextLines(result.context),
    ];
    if (!result.context && !result.error) {
        lines.push("(page state snapshot unavailable)");
    }
    if (result.error) {
        lines.push(`(collection failed: ${_describeLogCollectionError(result.error)})`);
    }
    const tabHint = _getLogExportTabHint(tab, result.error);
    if (tabHint)
        lines.push(`(${tabHint})`);
    if (result.entries.length === 0 && !result.error) {
        lines.push("(no TTV AB log entries captured in this tab)");
    }
    const safeMax = Math.max(0, Math.trunc(Number(maxCharacters) || 0));
    const marker = "\n...(tab section truncated by the export size limit)...\n";
    const header = `${lines.join("\n")}\n`;
    if (header.length > safeMax) {
        return {
            text: safeMax <= marker.length
                ? marker.slice(0, safeMax)
                : `${header.slice(0, safeMax - marker.length)}${marker}`,
            truncated: true,
        };
    }
    const omissionNote = (count) => count > 0
        ? `(${count} older log entries omitted by the export size limit)\n`
        : "";
    const previousOmissions = Math.max(0, Math.trunc(result.truncatedEntries) || 0);
    const entryLines = [];
    let usedCharacters = header.length;
    let omitted = previousOmissions;
    let truncated = false;
    let newestLine = "";
    let footer = omissionNote(previousOmissions);
    for (let index = result.entries.length - 1; index >= 0; index--) {
        const line = _formatLogEntryLine(result.entries[index]);
        if (index === result.entries.length - 1)
            newestLine = line;
        if (usedCharacters + line.length + 1 + footer.length > safeMax) {
            truncated = true;
            omitted = previousOmissions + index + 1;
            break;
        }
        entryLines.push(line);
        usedCharacters += line.length + 1;
    }
    if (truncated) {
        footer = omissionNote(omitted) + marker;
        while (entryLines.length > 0 && usedCharacters + footer.length > safeMax) {
            usedCharacters -= entryLines[entryLines.length - 1].length + 1;
            entryLines.pop();
            omitted++;
            footer = omissionNote(omitted) + marker;
        }
        if (entryLines.length === 0 && newestLine) {
            const partialFooter = omissionNote(omitted - 1) + marker;
            const available = safeMax - usedCharacters - partialFooter.length - 1;
            if (available > 0) {
                entryLines.push(newestLine.slice(0, available));
                footer = partialFooter;
            }
        }
    }
    const text = header +
        (entryLines.length > 0 ? `${entryLines.reverse().join("\n")}\n` : "") +
        footer;
    return {
        text: text.length <= safeMax
            ? text
            : `${text.slice(0, safeMax - marker.length)}${marker}`,
        truncated: truncated || text.length > safeMax,
    };
}
async function _buildLogExport(isCancelled = () => false) {
    const manifestVersion = chrome.runtime.getManifest?.()?.version || "?";
    const exportedAt = new Date();
    const [operatingSystem, decoderSupport, extensionSettings, siteAccess] = await Promise.all([
        _getLogExportOperatingSystem(),
        _getLogExportDecoderSupport(),
        _readLogExportExtensionSettings(),
        _hasTwitchSiteAccess(),
    ]);
    if (isCancelled())
        return "";
    const headerLines = [
        "TTV AB debug log",
        `Version: ${manifestVersion}`,
        `Browser: ${_getLogExportBrowser()}`,
        `OS: ${operatingSystem}`,
        `Decoder support: ${decoderSupport}`,
        `Extension settings: ${extensionSettings}`,
        `Site access: ${siteAccess === true ? "granted" : siteAccess === false ? "not granted" : "unknown"}`,
        `Exported: ${exportedAt.toISOString()}`,
        `Local time: ${_formatLogExportLocalTime(exportedAt)}`,
        "",
    ];
    if (siteAccess === false) {
        headerLines.push("TTV AB is not allowed to run on twitch.tv, so it cannot block ads or collect logs there.", "Allow site access for twitch.tv in the browser's extension settings, reload Twitch, then export again.", "");
    }
    const queryResult = await _queryTwitchTabs();
    if (isCancelled())
        return "";
    if (queryResult.error) {
        headerLines.push(`Log collection status: ${_describeLogCollectionError(queryResult.error)}.`);
        return headerLines.join("\n");
    }
    const selected = _selectLogExportTabs(queryResult.tabs);
    if (selected.tabs.length === 0) {
        headerLines.push("No open Twitch tabs were found, so no runtime log entries were captured.", "Open a twitch.tv stream, let the issue happen, then export again.");
        return headerLines.join("\n");
    }
    if (selected.omittedTabs > 0) {
        headerLines.push(`${selected.omittedTabs} older Twitch tabs were omitted to keep the export bounded.`, "");
    }
    const parts = [headerLines.join("\n")];
    let usedCharacters = parts[0].length;
    let stoppedAt = selected.tabs.length;
    for (let batchStart = 0; batchStart < selected.tabs.length; batchStart += _LOG_EXPORT_BATCH_SIZE) {
        if (isCancelled())
            break;
        const batch = selected.tabs.slice(batchStart, batchStart + _LOG_EXPORT_BATCH_SIZE);
        const results = await Promise.all(batch.map((tab) => _collectTabLogEntries(tab.id, _LOG_COLLECT_TAB_TIMEOUT_MS, tab.url)));
        if (isCancelled())
            break;
        for (let offset = 0; offset < batch.length; offset += 1) {
            const remaining = _LOG_EXPORT_MAX_CHARACTERS - usedCharacters - 1;
            if (remaining <= 0) {
                stoppedAt = batchStart + offset;
                break;
            }
            const section = _buildTabLogSection(batch[offset], batchStart + offset, results[offset], remaining);
            parts.push(section.text);
            usedCharacters += section.text.length + 1;
            if (section.truncated) {
                stoppedAt = batchStart + offset + 1;
                break;
            }
        }
        if (stoppedAt < selected.tabs.length)
            break;
    }
    const omittedBySize = selected.tabs.length - stoppedAt;
    if (omittedBySize > 0 && usedCharacters < _LOG_EXPORT_MAX_CHARACTERS) {
        const note = `${omittedBySize} additional Twitch tabs were omitted because the export reached its size limit.`;
        const remaining = _LOG_EXPORT_MAX_CHARACTERS - usedCharacters - 1;
        if (remaining > 0)
            parts.push(note.slice(0, remaining));
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
    const picker = window.showSaveFilePicker;
    if (typeof picker !== "function")
        return null;
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
async function _writeLogExportFile(handle, text) {
    const writable = await handle.createWritable();
    try {
        await writable.write(text);
        await writable.close();
        return true;
    }
    catch (error) {
        try {
            await writable.abort?.();
        }
        catch { }
        throw error;
    }
}
function _isLogExportCancellation(error) {
    return Boolean(error &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "AbortError");
}
function _downloadLogExport(text) {
    _releaseLogExportUrl();
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
        _activeLogExportUrl = url;
        return true;
    }
    finally {
        anchor.remove();
        if (!clicked) {
            URL.revokeObjectURL(url);
        }
    }
}
const _POPUP_TOGGLE_NAMES = [
    "adblock",
    "adSpoofing",
    "autoplayBackup",
    "adTimer",
    "turbo",
];
const _POPUP_TOGGLE_STORAGE_KEYS = {
    adblock: "ttvAdblockEnabled",
    adSpoofing: "ttvAdSpoofingEnabled",
    autoplayBackup: "ttvAutoplayBackupEnabled",
    adTimer: "ttvAdTimerEnabled",
    turbo: "ttvTurboMode",
};
const _POPUP_TOGGLE_READ_RETRY_DELAYS = [100, 300, 1000];
const _POPUP_TOGGLE_READ_SLOW_RETRY_MS = 30000;
const _POPUP_TOGGLE_READ_TIMEOUT_MS = 1000;
const _POPUP_TOGGLE_WRITE_TIMEOUT_MS = 1000;
function _createPopupToggleController(options) {
    const values = {
        adblock: true,
        adSpoofing: true,
        autoplayBackup: true,
        adTimer: false,
        turbo: false,
    };
    const revisions = {
        adblock: 0,
        adSpoofing: 0,
        autoplayBackup: 0,
        adTimer: 0,
        turbo: 0,
    };
    const writeSequences = {
        adblock: 0,
        adSpoofing: 0,
        autoplayBackup: 0,
        adTimer: 0,
        turbo: 0,
    };
    const pending = {
        adblock: false,
        adSpoofing: false,
        autoplayBackup: false,
        adTimer: false,
        turbo: false,
    };
    const writeTimeoutTimers = {
        adblock: null,
        adSpoofing: null,
        autoplayBackup: null,
        adTimer: null,
        turbo: null,
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
                adSpoofing: ready && values.adblock && !pending.adblock && !pending.adSpoofing,
                autoplayBackup: ready &&
                    values.adblock &&
                    !pending.adblock &&
                    !pending.autoplayBackup,
                adTimer: ready && values.adblock && !pending.adblock && !pending.adTimer,
                turbo: ready && !pending.turbo,
            },
        };
    }
    function normalizeValue(name, value) {
        return name === "turbo" || name === "adTimer"
            ? value === true
            : value !== false;
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
        if (writeTimeoutTimers[name] === null)
            return;
        cancel(writeTimeoutTimers[name]);
        writeTimeoutTimers[name] = null;
    }
    function scheduleReadRetry() {
        if (ready || readInFlight || readRetryTimer !== null)
            return;
        const retryDelay = _POPUP_TOGGLE_READ_RETRY_DELAYS[readFailureCount - 1] ??
            _POPUP_TOGGLE_READ_SLOW_RETRY_MS;
        readRetryTimer = schedule(() => {
            readRetryTimer = null;
            beginRead();
        }, retryDelay);
    }
    function beginRead(resetFailures = false) {
        if (readInFlight)
            return false;
        if (resetFailures)
            readFailureCount = 0;
        clearReadRetryTimer();
        ready = false;
        render();
        readInFlight = true;
        const sequence = ++readSequence;
        const readRevisions = { ...revisions };
        let settled = false;
        const finish = (result, error) => {
            if (settled || sequence !== readSequence)
                return;
            settled = true;
            clearReadTimeoutTimer();
            readInFlight = false;
            const readError = error ||
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
                if (revisions[name] !== readRevisions[name])
                    continue;
                values[name] = normalizeValue(name, result[_POPUP_TOGGLE_STORAGE_KEYS[name]]);
            }
            readFailureCount = 0;
            ready = true;
            render();
        };
        readTimeoutTimer = schedule(() => finish(null, "Settings read timed out"), _POPUP_TOGGLE_READ_TIMEOUT_MS);
        try {
            options.read(Object.values(_POPUP_TOGGLE_STORAGE_KEYS), finish);
        }
        catch (error) {
            finish(null, error instanceof Error ? error.message : String(error));
        }
        return true;
    }
    function applyStorageChanges(changes) {
        if (!changes || typeof changes !== "object")
            return false;
        let changed = false;
        for (const name of _POPUP_TOGGLE_NAMES) {
            const storageKey = _POPUP_TOGGLE_STORAGE_KEYS[name];
            if (!Object.hasOwn(changes, storageKey))
                continue;
            revisions[name]++;
            values[name] = normalizeValue(name, changes[storageKey]?.newValue);
            if (pending[name]) {
                writeSequences[name]++;
                pending[name] = false;
                clearWriteTimeout(name);
            }
            changed = true;
        }
        if (changed)
            render();
        return changed;
    }
    function write(name, enabled) {
        if (!_POPUP_TOGGLE_NAMES.includes(name))
            return false;
        const requiresAdblock = name === "adSpoofing" || name === "autoplayBackup" || name === "adTimer";
        if (!ready || pending[name] || (requiresAdblock && !values.adblock)) {
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
            if (settled || sequence !== writeSequences[name])
                return;
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
        writeTimeoutTimers[name] = schedule(() => finish("Settings write timed out"), _POPUP_TOGGLE_WRITE_TIMEOUT_MS);
        try {
            options.write(_POPUP_TOGGLE_STORAGE_KEYS[name], normalizedEnabled, finish);
        }
        catch (error) {
            finish(error instanceof Error ? error.message : String(error));
        }
        return true;
    }
    function start() {
        if (started)
            return false;
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
function _createInfoModal(icon, overlay, closeButton, onClose = null) {
    let returnFocusTo = icon;
    const setVisible = (visible, confirmed = false) => {
        overlay.hidden = !visible;
        overlay.classList.toggle("visible", visible);
        icon.setAttribute("aria-expanded", String(visible));
        if (visible) {
            closeButton.focus();
            return;
        }
        onClose?.(confirmed);
        returnFocusTo.focus();
    };
    const open = (opener = icon) => {
        returnFocusTo = opener;
        setVisible(true);
    };
    icon.addEventListener("click", (event) => {
        event.stopPropagation();
        if (overlay.hidden)
            open();
        else
            setVisible(false);
    });
    closeButton.addEventListener("click", () => setVisible(false, true));
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay)
            setVisible(false);
    });
    overlay.addEventListener("keydown", (event) => {
        if (event.key !== "Tab")
            return;
        event.preventDefault();
        closeButton.focus();
    });
    return {
        open,
        close: () => setVisible(false),
        isOpen: () => !overlay.hidden,
    };
}
document.addEventListener("DOMContentLoaded", () => {
    const isLogExportPage = _isLogExportPage();
    document.documentElement.classList.toggle("log-export-page", isLogExportPage);
    const THEME_KEY = "ttvab_theme";
    const VALID_THEMES = ["default", "retro"];
    function getStoredTheme() {
        try {
            const value = localStorage.getItem(THEME_KEY);
            return value && VALID_THEMES.includes(value) ? value : null;
        }
        catch (error) {
            console.error("[TTV AB] Popup theme read error:", error);
            return null;
        }
    }
    function setStoredTheme(theme) {
        try {
            localStorage.setItem(THEME_KEY, theme);
            return true;
        }
        catch (error) {
            console.error("[TTV AB] Popup theme write error:", error);
            return false;
        }
    }
    const initialTheme = getStoredTheme() || "retro";
    document.documentElement.setAttribute("data-theme", initialTheme);
    const toggle = document.getElementById("enableToggle");
    const statusDot = document.getElementById("statusDot");
    const statusText = document.getElementById("statusText");
    const adsBlockedCount = document.getElementById("adsBlockedCount");
    const timeSaved = document.getElementById("timeSaved");
    const statsToggle = document.getElementById("statsToggle");
    const statsPanel = document.getElementById("statsPanel");
    const weeklyChart = document.getElementById("weeklyChart");
    const chartAvg = document.getElementById("chartAvg");
    const channelList = document.getElementById("channelList");
    const achievementsGrid = document.getElementById("achievementsGrid");
    const achievementsProgress = document.getElementById("achievementsProgress");
    const nextAchievement = document.getElementById("nextAchievement");
    const langSelector = document.getElementById("langSelector");
    const langAutoOption = document.getElementById("langAutoOption");
    const descriptionText = document.getElementById("descriptionText");
    const versionText = document.getElementById("versionText");
    const achievementsTitle = document.getElementById("achievementsTitle");
    const footerText = document.getElementById("footerText");
    const infoText = document.getElementById("infoText");
    const adSpoofingToggle = document.getElementById("adSpoofingToggle");
    const autoplayBackupToggle = document.getElementById("autoplayBackupToggle");
    const adTimerToggle = document.getElementById("adTimerToggle");
    const adTimerInfoIcon = document.getElementById("adTimerInfoIcon");
    const adTimerTooltip = document.getElementById("adTimerTooltip");
    const adTimerModalClose = document.getElementById("adTimerModalClose");
    const adSpoofingInfoIcon = document.getElementById("adSpoofingInfoIcon");
    const adSpoofingTooltip = document.getElementById("adSpoofingTooltip");
    const adSpoofingModalClose = document.getElementById("adSpoofingModalClose");
    const autoplayBackupInfoIcon = document.getElementById("autoplayBackupInfoIcon");
    const autoplayBackupTooltip = document.getElementById("autoplayBackupTooltip");
    const autoplayBackupModalClose = document.getElementById("autoplayBackupModalClose");
    const turboModeToggle = document.getElementById("turboModeToggle");
    const turboModeDescription = document.getElementById("turboModeDescription");
    const statusCounters = document.getElementById("statusCounters");
    const turboStatsShell = document.getElementById("turboStatsShell");
    const donateButton = document.getElementById("donateBtn");
    const repoLink = document.getElementById("repoLink");
    const authorLink = document.getElementById("authorLink");
    const reportBugLink = document.getElementById("reportBugLink");
    const reportBugText = document.getElementById("reportBugText");
    const logDialogOverlay = document.getElementById("logDialogOverlay");
    const logDialog = document.getElementById("logDialog");
    const logDialogTitle = document.getElementById("logDialogTitle");
    const logDialogGenerate = document.getElementById("logDialogGenerate");
    const logDialogSkip = document.getElementById("logDialogSkip");
    const logDialogClose = document.getElementById("logDialogClose");
    const logDialogText = document.getElementById("logDialogText");
    const channelModalOverlay = document.getElementById("channelModalOverlay");
    const channelModalClose = document.getElementById("channelModalClose");
    const channelModalVisit = document.getElementById("channelModalVisit");
    const channelModalMonogram = document.getElementById("channelModalMonogram");
    const channelModalAvatar = document.getElementById("channelModalAvatar");
    const channelModalName = document.getElementById("channelModalName");
    const channelModalRank = document.getElementById("channelModalRank");
    const channelModalAds = document.getElementById("channelModalAds");
    const channelModalWatch = document.getElementById("channelModalWatch");
    const channelModalSaved = document.getElementById("channelModalSaved");
    const channelModalBreaks = document.getElementById("channelModalBreaks");
    const channelModalShareBar = document.getElementById("channelModalShareBar");
    const channelModalSharePct = document.getElementById("channelModalSharePct");
    const channelModalSince = document.getElementById("channelModalSince");
    const channelModalLast = document.getElementById("channelModalLast");
    const channelModalPulse = document.getElementById("channelModalPulse");
    const statsExportButton = document.getElementById("statsExportButton");
    const statsResetButton = document.getElementById("statsResetButton");
    const resetStatsOverlay = document.getElementById("resetStatsOverlay");
    const resetStatsText = document.getElementById("resetStatsText");
    const resetStatsConfirm = document.getElementById("resetStatsConfirm");
    const resetStatsCancel = document.getElementById("resetStatsCancel");
    const resetStatsClose = document.getElementById("resetStatsClose");
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
        adTimerToggle,
        adTimerInfoIcon,
        adTimerTooltip,
        adTimerModalClose,
        adSpoofingInfoIcon,
        adSpoofingTooltip,
        adSpoofingModalClose,
        autoplayBackupInfoIcon,
        autoplayBackupTooltip,
        autoplayBackupModalClose,
        turboModeToggle,
        turboModeDescription,
        statusCounters,
        turboStatsShell,
        donateButton,
        repoLink,
        authorLink,
        reportBugLink,
        reportBugText,
        logDialogOverlay,
        logDialog,
        logDialogTitle,
        logDialogGenerate,
        logDialogSkip,
        logDialogClose,
        logDialogText,
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
        statsExportButton,
        statsResetButton,
        resetStatsOverlay,
        resetStatsText,
        resetStatsConfirm,
        resetStatsCancel,
        resetStatsClose,
    };
    for (const [name, element] of Object.entries(requiredElements)) {
        if (element)
            continue;
        console.error(`[TTV AB] Popup missing required element: ${name}`);
        return;
    }
    let turboModeEnabled = false;
    let turboModeReady = false;
    let statisticsReadGeneration = 0;
    let turboLayoutGeneration = 0;
    function settleTurboLayout(generation) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (generation !== turboLayoutGeneration ||
                    !turboModeReady ||
                    !turboModeEnabled) {
                    return;
                }
                document.documentElement.classList.add("turbo-layout-collapsed");
            });
        });
    }
    turboStatsShell.addEventListener("transitionend", (event) => {
        if (event.target !== turboStatsShell ||
            event.propertyName !== "grid-template-rows" ||
            !turboModeReady ||
            !turboModeEnabled) {
            return;
        }
        settleTurboLayout(turboLayoutGeneration);
    });
    const LANG_KEY = "ttvab_lang";
    function getStoredLanguage() {
        try {
            return localStorage.getItem(LANG_KEY);
        }
        catch (error) {
            console.error("[TTV AB] Popup language read error:", error);
            return null;
        }
    }
    function setStoredLanguage(language) {
        try {
            localStorage.setItem(LANG_KEY, language);
            return true;
        }
        catch (error) {
            console.error("[TTV AB] Popup language write error:", error);
            return false;
        }
    }
    function normalizeLanguage(language) {
        const candidate = String(language || "").trim();
        if (!candidate || candidate.toLowerCase() === "auto")
            return null;
        const normalizedCandidate = candidate.replace(/-/g, "_");
        if (TRANSLATIONS[normalizedCandidate]) {
            return normalizedCandidate;
        }
        const lowerCandidate = candidate.toLowerCase();
        if (lowerCandidate.startsWith("zh")) {
            const normalized = lowerCandidate.includes("tw") ||
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
        if (!candidate)
            return "";
        return candidate.replace(/_/g, "-");
    }
    function getAutoLanguageCandidates() {
        const candidates = [];
        try {
            const uiLanguage = chrome.i18n?.getUILanguage?.();
            if (uiLanguage) {
                candidates.push(uiLanguage);
            }
        }
        catch (error) {
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
            if (!normalizedLanguage)
                continue;
            return {
                language: normalizedLanguage,
                localeTag: normalizeLocaleTag(candidate) ||
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
        if (!Number.isFinite(year) ||
            !Number.isFinite(month) ||
            !Number.isFinite(day)) {
            return null;
        }
        const date = new Date(year, month - 1, day);
        if (Number.isNaN(date.getTime()))
            return null;
        if (date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day) {
            return null;
        }
        return date;
    }
    function getTranslations() {
        return TRANSLATIONS[getLang()] || TRANSLATIONS.en;
    }
    function getAchievementTranslation(id) {
        const t = getTranslations();
        return (t.achievementsMap?.[id] ||
            TRANSLATIONS.en.achievementsMap[id] || {
            name: String(id || "Achievement"),
            desc: "",
        });
    }
    function updateTurboCopy(translations = getTranslations()) {
        const turboLabel = String(translations.turboMode ?? "Turbo Mode");
        const turboDescription = String(turboModeEnabled
            ? (translations.turboModeEnabled ??
                "Statistics and achievements are paused.")
            : (translations.turboModeDisabled ??
                "Statistics and achievements are active."));
        const reportLabel = String(translations.reportBugLabel ?? "Report a bug.");
        turboModeToggle.setAttribute("aria-label", turboLabel);
        turboModeDescription.textContent = turboDescription;
        reportBugText.textContent = reportLabel;
        reportBugLink.title = reportLabel;
        reportBugLink.setAttribute("aria-label", reportLabel);
    }
    function applyTranslations(lang) {
        const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
        document.documentElement.lang = String((lang || "en").replace("_", "-"));
        channelList.setAttribute("aria-label", String(t.topChannels ?? "Top Channels"));
        document.querySelectorAll("[data-i18n]").forEach((el) => {
            const key = el.dataset.i18n;
            if (typeof key === "string" && Object.hasOwn(t, key)) {
                el.textContent = String(t[key]);
            }
        });
        descriptionText.textContent = String(t.descriptionText ?? "");
        donateButton.title = String(t.supportDeveloper ?? "Support GosuDRM");
        donateButton.setAttribute("aria-label", String(t.supportDeveloper ?? "Support GosuDRM"));
        langSelector.title = String(t.language ?? "Language");
        langSelector.setAttribute("aria-label", String(t.language ?? "Language"));
        langSelector.setAttribute("aria-describedby", "descriptionText");
        langAutoOption.textContent = `🌐 ${String(t.autoLanguage ?? "Auto")}`;
        const accessibleVersion = String(versionText.textContent || "")
            .replace(/^v/i, "")
            .trim();
        versionText.setAttribute("aria-label", formatTemplate(String(t.versionLabel ?? "Version {version}"), {
            version: accessibleVersion,
        }));
        statsToggle.setAttribute("aria-label", String(t.statistics ?? "Statistics"));
        toggle.setAttribute("aria-label", String(t.adBlocking ?? "Ad Blocking"));
        adSpoofingToggle.setAttribute("aria-label", String(t.adSpoofing ?? "Ad Spoofing"));
        autoplayBackupToggle.setAttribute("aria-label", String(t.autoplayBackup ?? "Low Quality Fallback"));
        adTimerToggle.setAttribute("aria-label", String(t.adTimer ?? "Ad Break Timer"));
        adTimerToggle.title = String(t.adTimerDesc ??
            "Shows how long the ad break has been running over the stream.");
        for (const [infoIcon, label] of [
            [adTimerInfoIcon, t.adTimerInfoLabel ?? "About Ad Break Timer"],
            [adSpoofingInfoIcon, t.adSpoofingInfoLabel ?? "About Ad Spoofing"],
            [
                autoplayBackupInfoIcon,
                t.autoplayBackupInfoLabel ?? "About Low Quality Fallback",
            ],
        ]) {
            infoIcon.title = String(label);
            infoIcon.setAttribute("aria-label", String(label));
        }
        achievementsTitle.textContent = `🏆 ${String(t.achievements ?? "Achievements")}`;
        footerText.textContent = String(t.footerBy ?? " — by ");
        const repoLabel = String(t.repoLinkLabel ?? "Open TTV AB on GitHub");
        repoLink.title = repoLabel;
        repoLink.setAttribute("aria-label", repoLabel);
        const authorLabel = String(t.authorLinkLabel ?? "Open GosuDRM on GitHub");
        authorLink.title = authorLabel;
        authorLink.setAttribute("aria-label", authorLabel);
        const exportLabel = String(t.exportStatsLabel ?? "Export statistics as a JSON file");
        statsExportButton.title = exportLabel;
        statsExportButton.setAttribute("aria-label", exportLabel);
        const resetLabel = String(t.resetStatsConfirm ?? "Reset statistics");
        statsResetButton.title = resetLabel;
        statsResetButton.setAttribute("aria-label", resetLabel);
        updateTurboCopy(t);
    }
    let issueEnvironment = {
        browser: _getLogExportBrowser(),
        os: _getLogExportOsFromUserAgent(_sanitizeLogExportText(navigator.userAgent, 1024)),
    };
    void _getLogExportOperatingSystem().then((os) => {
        issueEnvironment = { ...issueEnvironment, os };
    });
    function openIssuesPage() {
        const issuesUrl = _getBugReportUrl(reportBugLink.href, chrome.runtime.getManifest?.()?.version || "", issueEnvironment.browser, issueEnvironment.os);
        if (isLogExportPage) {
            window.location.assign(issuesUrl);
            return;
        }
        try {
            if (chrome?.tabs?.create) {
                chrome.tabs.create({ url: issuesUrl });
                return;
            }
        }
        catch { }
        window.open(issuesUrl, "_blank", "noopener,noreferrer");
    }
    function openChangelogPage() {
        const changelogUrl = "https://github.com/GosuDRM/TTV-AB/blob/main/CHANGELOG.md";
        try {
            if (chrome?.tabs?.create) {
                chrome.tabs.create({ url: changelogUrl });
                return;
            }
        }
        catch { }
        window.open(changelogUrl, "_blank", "noopener,noreferrer");
    }
    let logExportInProgress = false;
    let logExportGeneration = 0;
    let preparedLogExportText = null;
    function getLogExportPageText(key, fallbackKey, fallback) {
        const translations = getTranslations();
        const localizedFallback = fallbackKey ? translations[fallbackKey] : null;
        return String(translations[key] ??
            localizedFallback ??
            TRANSLATIONS.en[key] ??
            fallback);
    }
    function applyLogExportPageState(state) {
        if (!isLogExportPage)
            return;
        logDialogGenerate.hidden = false;
        logDialogSkip.classList.remove("primary");
        logDialogSkip.textContent = getLogExportPageText("logExportContinue", "logDialogSkip", "Continue to GitHub without a log");
        if (state === "preparing") {
            logDialogTitle.textContent = getLogExportPageText("logExportPreparingTitle", "logDialogGenerate", "Preparing your debug log");
            logDialogText.textContent = String(getTranslations().logDialogText ??
                "The file includes recent extension events and limited playback and page context from your open Twitch tabs. Nothing is uploaded.");
            logDialogGenerate.textContent = getLogExportPageText("logExportPreparingAction", "logDialogGenerate", "Preparing...");
            return;
        }
        if (state === "ready") {
            logDialogTitle.textContent = getLogExportPageText("logExportReadyTitle", "logDialogGenerate", "Debug log ready");
            logDialogText.textContent = getLogExportPageText("logExportReadyText", "logDialogText", "Save the file, then attach it to your GitHub issue. Nothing is uploaded automatically.");
            logDialogGenerate.textContent = getLogExportPageText("logExportSave", "logDialogGenerate", "Save log file");
            return;
        }
        if (state === "failed") {
            logDialogTitle.textContent = getLogExportPageText("logExportFailedTitle", "logDialogTitle", "Could not prepare the debug log");
            logDialogGenerate.textContent = getLogExportPageText("logExportRetry", "logDialogGenerate", "Try again");
            return;
        }
        if (state === "downloaded") {
            logDialogTitle.textContent = getLogExportPageText("logExportDownloadedTitle", "logExportSavedTitle", "Debug log downloaded");
            logDialogText.textContent = getLogExportPageText("logExportDownloadedText", "logExportSavedText", "Find the file in your Downloads folder and attach it to your GitHub issue, then continue to GitHub.");
            logDialogGenerate.textContent = getLogExportPageText("logExportSaveAgain", "logExportSave", "Save again");
        }
        else {
            logDialogTitle.textContent = getLogExportPageText("logExportSavedTitle", "reportBugLabel", "Debug log saved");
            logDialogText.textContent = getLogExportPageText("logExportSavedText", "logDialogText", "Attach the saved file to your GitHub issue, then continue to GitHub.");
            logDialogGenerate.hidden = true;
        }
        logDialogSkip.classList.add("primary");
        logDialogSkip.textContent = getLogExportPageText("logExportOpenIssue", "reportBugLabel", "Continue to GitHub");
    }
    function setLogExportFailure(error, localizedMessage = null) {
        const rawMessage = error instanceof Error ? error.message : String(error || "");
        const message = _sanitizeLogExportText(rawMessage, 240)
            .replace(/\n/g, " ")
            .trim();
        applyLogExportPageState("failed");
        logDialogText.textContent =
            localizedMessage ||
                (message
                    ? getLogExportPageText("logExportFailedDetail", null, "Log export failed: {error}").replace("{error}", message)
                    : getLogExportPageText("logExportFailedText", null, "Log export failed. Try again."));
    }
    function prepareLogExport() {
        if (logExportInProgress)
            return;
        logExportInProgress = true;
        preparedLogExportText = null;
        const generation = ++logExportGeneration;
        logDialogOverlay.hidden = false;
        logDialogOverlay.setAttribute("aria-busy", "true");
        logDialogGenerate.disabled = true;
        logDialogSkip.disabled = false;
        applyLogExportPageState("preparing");
        _buildLogExport(() => generation !== logExportGeneration)
            .then((text) => {
            if (generation !== logExportGeneration)
                return;
            preparedLogExportText = text;
            applyLogExportPageState("ready");
            logDialogGenerate.disabled = false;
            logDialogGenerate.focus();
        })
            .catch((error) => {
            if (generation !== logExportGeneration)
                return;
            console.error("[TTV AB] Log export failed:", error);
            setLogExportFailure(error);
            logDialogGenerate.disabled = false;
        })
            .finally(() => {
            if (generation !== logExportGeneration)
                return;
            logExportInProgress = false;
            logDialogOverlay.removeAttribute("aria-busy");
        });
    }
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
        if (event.key !== "Enter" && event.key !== " ")
            return;
        event.preventDefault();
        openChangelogPage();
    });
    logDialogSkip.addEventListener("click", () => {
        hideLogDialog();
        openIssuesPage();
    });
    logDialogClose.addEventListener("click", () => {
        if (isLogExportPage)
            return;
        hideLogDialog(true);
    });
    logDialogOverlay.addEventListener("click", (event) => {
        if (!isLogExportPage && event.target === logDialogOverlay) {
            hideLogDialog(true);
        }
    });
    window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape")
            return;
        for (const modal of infoModals) {
            if (modal.isOpen())
                modal.close();
        }
        if (!isLogExportPage && !logDialogOverlay.hidden) {
            hideLogDialog(true);
        }
        if (!channelModalOverlay.hidden) {
            hideChannelModal();
        }
        hideResetStatsDialog();
    });
    logDialogGenerate.addEventListener("click", () => {
        if (logDialogGenerate.disabled || logExportInProgress)
            return;
        if (!isLogExportPage) {
            if (!_openLogExportPage()) {
                setLogExportFailure(null, getLogExportPageText("logExportOpenFailed", null, "Could not open the log export tab."));
            }
            else {
                hideLogDialog(true);
                window.close();
            }
            return;
        }
        if (!preparedLogExportText) {
            prepareLogExport();
            return;
        }
        logExportInProgress = true;
        const generation = ++logExportGeneration;
        logDialogGenerate.disabled = true;
        logDialogSkip.disabled = true;
        const text = preparedLogExportText;
        let destination;
        try {
            destination = _requestLogExportFile();
        }
        catch (error) {
            destination = Promise.reject(error);
        }
        Promise.resolve(destination)
            .then(async (handle) => {
            if (handle) {
                await _writeLogExportFile(handle, text);
            }
            else {
                _downloadLogExport(text);
            }
            if (generation !== logExportGeneration)
                return;
            applyLogExportPageState(handle ? "saved" : "downloaded");
            logDialogSkip.focus();
        })
            .catch((error) => {
            if (generation !== logExportGeneration)
                return;
            if (_isLogExportCancellation(error)) {
                applyLogExportPageState("ready");
                logDialogOverlay.hidden = false;
                return;
            }
            console.error("[TTV AB] Log export failed:", error);
            setLogExportFailure(error);
            logDialogOverlay.hidden = false;
        })
            .finally(() => {
            logExportInProgress = false;
            logDialogGenerate.disabled = false;
            logDialogSkip.disabled = false;
        });
    });
    let latestChannelStats = Object.create(null);
    let latestAdsTotal = 0;
    let latestMeasuredMilliseconds = 0;
    let openChannelModalName = null;
    function prefersReducedMotion() {
        try {
            return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        }
        catch {
            return false;
        }
    }
    function animateStatValue(element, targetValue, formatter) {
        const target = normalizeCount(targetValue);
        const format = typeof formatter === "function" ? formatter : (value) => String(value);
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
            if (progress < 1)
                requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }
    function formatChannelDate(timestamp) {
        const safeTimestamp = normalizeTimestamp(timestamp);
        if (safeTimestamp <= 0)
            return "—";
        try {
            return new Intl.DateTimeFormat(getLocaleTag(), {
                month: "short",
                day: "numeric",
                year: "numeric",
            }).format(new Date(safeTimestamp));
        }
        catch {
            return new Date(safeTimestamp).toLocaleDateString();
        }
    }
    function formatRelativeTime(timestamp) {
        const safeTimestamp = normalizeTimestamp(timestamp);
        if (safeTimestamp <= 0)
            return "—";
        const elapsedMs = Math.max(0, Date.now() - safeTimestamp);
        const units = [
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
        }
        catch {
            return formatChannelDate(safeTimestamp);
        }
    }
    function formatWatchTime(seconds) {
        const safeSeconds = normalizeCount(seconds);
        if (safeSeconds < 60)
            return `${safeSeconds}s`;
        const hours = Math.floor(safeSeconds / 3600);
        const minutes = Math.floor((safeSeconds % 3600) / 60);
        if (hours > 0)
            return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }
    const AVATAR_CACHE_KEY = "ttvChannelAvatars";
    const AVATAR_TTL_MS = 24 * 60 * 60 * 1000;
    const AVATAR_CACHE_MAX_ENTRIES = 100;
    const AVATAR_FETCH_TIMEOUT_MS = 4000;
    const TWITCH_GQL_URL = "https://gql.twitch.tv/gql";
    const TWITCH_PUBLIC_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
    const AVATAR_CDN_PREFIX = "https://static-cdn.jtvnw.net/";
    const avatarMemoryCache = new Map();
    function sanitizeAvatarUrl(value) {
        return typeof value === "string" && value.startsWith(AVATAR_CDN_PREFIX)
            ? value
            : null;
    }
    function readAvatarCache() {
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
            }
            catch {
                resolve({});
            }
        });
    }
    function writeAvatarCache(cache) {
        const entries = Object.entries(cache)
            .filter(([, entry]) => isPlainObject(entry))
            .sort((a, b) => normalizeCount(b[1].fetchedAt) -
            normalizeCount(a[1].fetchedAt))
            .slice(0, AVATAR_CACHE_MAX_ENTRIES);
        try {
            chrome.storage.local.set({ [AVATAR_CACHE_KEY]: Object.fromEntries(entries) }, () => {
                void chrome.runtime.lastError;
            });
        }
        catch { }
    }
    function fetchAvatarFromTwitch(channelName) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), AVATAR_FETCH_TIMEOUT_MS);
        return fetch(TWITCH_GQL_URL, {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Client-ID": TWITCH_PUBLIC_CLIENT_ID,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: "query($login: String!) { user(login: $login) { profileImageURL(width: 150) } }",
                variables: { login: channelName },
            }),
        })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
            const data = payload;
            const user = data?.data?.user;
            return sanitizeAvatarUrl(user?.profileImageURL);
        })
            .catch(() => null)
            .finally(() => clearTimeout(timeoutId));
    }
    async function getChannelAvatarUrl(channelName) {
        if (avatarMemoryCache.has(channelName)) {
            return avatarMemoryCache.get(channelName) ?? null;
        }
        const cache = await readAvatarCache();
        const cached = isPlainObject(cache[channelName])
            ? cache[channelName]
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
            if (!url || openChannelModalName !== channelName)
                return;
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
            .catch(() => { });
    }
    function fetchChannelLiveStatus(channelName) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), AVATAR_FETCH_TIMEOUT_MS);
        return fetch(TWITCH_GQL_URL, {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Client-ID": TWITCH_PUBLIC_CLIENT_ID,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query: "query($login: String!) { user(login: $login) { stream { id } } }",
                variables: { login: channelName },
            }),
        })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
            const data = payload;
            const user = data?.data?.user;
            if (!user)
                return null;
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
        }
        else if (state === "offline") {
            channelModalPulse.classList.add("is-offline");
        }
    }
    function applyChannelLiveStatus(channelName) {
        setChannelPulseState("loading");
        fetchChannelLiveStatus(channelName)
            .then((isLive) => {
            if (openChannelModalName !== channelName || isLive === null)
                return;
            setChannelPulseState(isLive ? "live" : "offline");
        })
            .catch(() => { });
    }
    function fillChannelModal(channelName) {
        const entry = normalizeChannelEntry(latestChannelStats[channelName]);
        const rankedEntries = Object.entries(latestChannelStats)
            .filter(([, candidate]) => normalizeCount(normalizeChannelEntry(candidate).ads) > 0)
            .sort((a, b) => {
            const countDiff = normalizeCount(normalizeChannelEntry(b[1]).ads) -
                normalizeCount(normalizeChannelEntry(a[1]).ads);
            return countDiff !== 0 ? countDiff : a[0].localeCompare(b[0]);
        });
        const rank = rankedEntries.findIndex(([name]) => name === channelName) + 1;
        const t = getTranslations();
        channelModalMonogram.textContent = channelName.charAt(0).toUpperCase();
        channelModalName.textContent = channelName;
        channelModalName.title = channelName;
        channelModalRank.textContent = formatTemplate(String(t.channelModalRank ?? "#{rank} of {total}"), {
            rank: formatNumber(Math.max(1, rank)),
            total: formatNumber(Math.max(1, rankedEntries.length)),
        });
        animateStatValue(channelModalAds, entry.measuredAds, (value) => formatNumber(value));
        animateStatValue(channelModalWatch, entry.watchSeconds, (value) => formatWatchTime(value));
        animateStatValue(channelModalSaved, entry.adMilliseconds, (value) => formatTimeSaved(value));
        animateStatValue(channelModalBreaks, entry.ads, (value) => formatNumber(value));
        const sharePercent = latestAdsTotal > 0
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
        if (!safeChannel)
            return;
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
        if (!openChannelModalName || channelModalOverlay.hidden)
            return;
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
        if (!channelName)
            return;
        const channelUrl = `https://www.twitch.tv/${channelName}`;
        try {
            if (chrome?.tabs?.create) {
                chrome.tabs.create({ url: channelUrl });
                return;
            }
        }
        catch { }
        window.open(channelUrl, "_blank", "noopener,noreferrer");
    });
    const savedLang = getStoredLanguage();
    const normalizedSavedLang = savedLang && savedLang !== "auto"
        ? normalizeLanguage(savedLang)
        : savedLang;
    const hasExplicitSavedLang = typeof savedLang === "string" && savedLang.trim() !== "";
    const hasValidSavedLang = !hasExplicitSavedLang ||
        normalizedSavedLang === "auto" ||
        Boolean(normalizedSavedLang && TRANSLATIONS[normalizedSavedLang]);
    const currentLang = hasValidSavedLang
        ? normalizedSavedLang || "auto"
        : "auto";
    if (!hasValidSavedLang) {
        setStoredLanguage("auto");
    }
    else if (normalizedSavedLang &&
        normalizedSavedLang !== savedLang &&
        normalizedSavedLang !== "auto") {
        setStoredLanguage(normalizedSavedLang);
    }
    langSelector.value = currentLang;
    let selectedLanguage = currentLang;
    applyTranslations(getLang());
    try {
        const manifest = chrome.runtime?.getManifest?.();
        if (manifest?.version && versionText) {
            versionText.textContent = `v${manifest.version}`;
            versionText.setAttribute("aria-label", formatTemplate(String(getTranslations().versionLabel ?? "Version {version}"), {
                version: manifest.version,
            }));
        }
    }
    catch (error) {
        console.error("[TTV AB] Popup manifest read error:", error);
    }
    if (isLogExportPage) {
        document.title = "TTV AB - Debug log";
        logDialogClose.hidden = true;
        logDialog.setAttribute("role", "main");
        logDialog.removeAttribute("aria-modal");
        prepareLogExport();
        return;
    }
    langSelector.addEventListener("change", (e) => {
        const nextSelector = e.currentTarget;
        if (!(nextSelector instanceof HTMLSelectElement))
            return;
        const lang = nextSelector.value;
        if (!setStoredLanguage(lang)) {
            nextSelector.value = selectedLanguage;
            return;
        }
        selectedLanguage = lang;
        const effectiveLang = lang === "auto" ? getAutoLanguageState().language : lang;
        applyTranslations(effectiveLang);
        loadStatistics();
        updateStatus(toggle.checked);
    });
    const themeToggle = document.getElementById("themeToggle");
    function applyTheme(theme) {
        const safeTheme = VALID_THEMES.includes(theme) ? theme : "retro";
        document.documentElement.setAttribute("data-theme", safeTheme);
        if (!themeToggle)
            return;
        themeToggle
            .querySelectorAll(".theme-dot")
            .forEach((dot) => {
            const isActive = dot.dataset.themeValue === safeTheme;
            dot.classList.toggle("active", isActive);
            dot.setAttribute("aria-pressed", String(isActive));
        });
    }
    applyTheme(initialTheme);
    if (themeToggle) {
        themeToggle
            .querySelectorAll(".theme-dot")
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
    const TOP_CHANNEL_COUNT = 5;
    const MAX_FUTURE_TIMESTAMP_MS = 2 * 24 * 60 * 60 * 1000;
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
    const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));
    function normalizeAchievementList(value, measuredMilliseconds = 0) {
        if (!Array.isArray(value))
            return [];
        const safeMeasuredMilliseconds = normalizeCount(measuredMilliseconds);
        return [
            ...new Set(value.filter((id) => {
                if (typeof id !== "string" || !ACHIEVEMENT_IDS.has(id)) {
                    return false;
                }
                const achievement = ACHIEVEMENTS.find((entry) => entry.id === id);
                return (achievement?.type !== "time" ||
                    safeMeasuredMilliseconds >= achievement.threshold);
            })),
        ];
    }
    function formatTimeSaved(milliseconds) {
        const totalSeconds = Math.floor(normalizeCount(milliseconds) / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (days > 0)
            return `${days}d ${hours}h ${minutes}m ${seconds}s`;
        if (hours > 0)
            return `${hours}h ${minutes}m ${seconds}s`;
        if (minutes > 0)
            return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    }
    function normalizeCount(value) {
        const numericValue = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
        return Number.isFinite(numericValue)
            ? Math.max(0, Math.trunc(numericValue))
            : 0;
    }
    function normalizeChannelName(value) {
        if (typeof value !== "string")
            return null;
        const trimmed = value.trim().toLowerCase();
        return /^[a-z0-9_]{1,25}$/.test(trimmed) ? trimmed : null;
    }
    function isPlainObject(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return false;
        }
        const prototype = Object.getPrototypeOf(value);
        if (prototype === null) {
            return true;
        }
        return (Object.prototype.toString.call(value) === "[object Object]" &&
            Object.getPrototypeOf(prototype) === null);
    }
    function createChannelsMap() {
        return Object.create(null);
    }
    function createDailyStatsMap() {
        return Object.create(null);
    }
    function normalizeTimestamp(value) {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue) || numericValue <= 0)
            return 0;
        const timestamp = Math.trunc(numericValue);
        return timestamp > Date.now() + MAX_FUTURE_TIMESTAMP_MS ? 0 : timestamp;
    }
    function normalizeChannelEntry(value) {
        if (typeof value === "number" || typeof value === "string") {
            return {
                ads: normalizeCount(value),
                measuredAds: 0,
                firstSeen: 0,
                lastSeen: 0,
                lastActive: 0,
                watchSeconds: 0,
                adMilliseconds: 0,
            };
        }
        const safeValue = isPlainObject(value) ? value : {};
        const adMilliseconds = Object.hasOwn(safeValue, "adMilliseconds")
            ? normalizeCount(safeValue.adMilliseconds)
            : normalizeCount(safeValue.adSeconds) * 1000;
        return {
            ads: normalizeCount(safeValue.ads),
            measuredAds: normalizeCount(safeValue.measuredAds),
            firstSeen: normalizeTimestamp(safeValue.firstSeen),
            lastSeen: normalizeTimestamp(safeValue.lastSeen),
            lastActive: normalizeTimestamp(safeValue.lastActive),
            watchSeconds: normalizeCount(safeValue.watchSeconds),
            adMilliseconds,
        };
    }
    function mergeChannelEntries(target, incoming) {
        const firstSeenCandidates = [target.firstSeen, incoming.firstSeen].filter((timestamp) => timestamp > 0);
        return {
            ads: target.ads + incoming.ads,
            measuredAds: target.measuredAds + incoming.measuredAds,
            firstSeen: firstSeenCandidates.length > 0 ? Math.min(...firstSeenCandidates) : 0,
            lastSeen: Math.max(target.lastSeen, incoming.lastSeen),
            lastActive: Math.max(target.lastActive, incoming.lastActive),
            watchSeconds: target.watchSeconds + incoming.watchSeconds,
            adMilliseconds: target.adMilliseconds + incoming.adMilliseconds,
        };
    }
    function getChannelActivityAt(entry) {
        return Math.max(entry.lastActive, entry.lastSeen, entry.firstSeen);
    }
    function normalizeChannelsMap(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return createChannelsMap();
        }
        const normalized = createChannelsMap();
        for (const [channelName, entry] of Object.entries(value)) {
            const safeChannel = normalizeChannelName(channelName);
            if (!safeChannel)
                continue;
            const safeEntry = normalizeChannelEntry(entry);
            normalized[safeChannel] = normalized[safeChannel]
                ? mergeChannelEntries(normalized[safeChannel], safeEntry)
                : safeEntry;
        }
        const channelEntries = Object.entries(normalized);
        if (channelEntries.length <= MAX_CHANNELS) {
            return normalized;
        }
        const keptChannels = new Set(channelEntries
            .filter(([, entry]) => entry.ads > 0)
            .sort((a, b) => b[1].ads - a[1].ads || a[0].localeCompare(b[0]))
            .slice(0, TOP_CHANNEL_COUNT)
            .map(([channelName]) => channelName));
        const recentChannels = channelEntries
            .filter(([channelName]) => !keptChannels.has(channelName))
            .sort((a, b) => getChannelActivityAt(b[1]) - getChannelActivityAt(a[1]) ||
            b[1].ads - a[1].ads ||
            b[1].watchSeconds - a[1].watchSeconds ||
            a[0].localeCompare(b[0]));
        for (const [channelName] of recentChannels.slice(0, MAX_CHANNELS - keptChannels.size)) {
            keptChannels.add(channelName);
        }
        const trimmed = createChannelsMap();
        for (const [channelName, entry] of channelEntries) {
            if (keptChannels.has(channelName))
                trimmed[channelName] = entry;
        }
        return trimmed;
    }
    function normalizeDailyStatsMap(value) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            return createDailyStatsMap();
        }
        const normalized = createDailyStatsMap();
        const latestDateKey = getDateKey(new Date(Date.now() + MAX_FUTURE_TIMESTAMP_MS));
        for (const [dateKey, entry] of Object.entries(value)) {
            if (!parseDateKey(dateKey) || dateKey > latestDateKey)
                continue;
            const safeEntry = isPlainObject(entry) ? entry : {};
            normalized[dateKey] = {
                ads: normalizeCount(safeEntry.ads),
                measuredAds: normalizeCount(safeEntry.measuredAds),
                adMilliseconds: normalizeCount(safeEntry.adMilliseconds),
                watchSeconds: normalizeCount(safeEntry.watchSeconds),
            };
        }
        return normalized;
    }
    function updateTimeSaved() {
        timeSaved.textContent = formatTimeSaved(latestMeasuredMilliseconds);
    }
    function getLast7Days() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = [];
        for (let offset = 6; offset >= 0; offset--) {
            const day = new Date(today);
            day.setDate(today.getDate() - offset);
            days.push(getDateKey(day));
        }
        return days;
    }
    function renderChart(dailyData) {
        const safeDailyData = dailyData && typeof dailyData === "object" && !Array.isArray(dailyData)
            ? dailyData
            : {};
        const t = getTranslations();
        const days = getLast7Days();
        const entries = days.map((dayKey) => safeDailyData[dayKey]);
        const values = entries.map((entry) => normalizeCount(entry?.ads));
        const max = Math.max(...values, 1);
        const completedDayValues = values.slice(0, -1);
        const avg = Math.round(completedDayValues.reduce((a, b) => a + b, 0) / completedDayValues.length);
        const formatter = new Intl.DateTimeFormat(getLocaleTag(), {
            weekday: "short",
        });
        weeklyChart.replaceChildren();
        for (const [index, dayKey] of days.entries()) {
            const value = values[index];
            const entry = entries[index];
            const height = value > 0 ? Math.max((value / max) * 100, 8) : 0;
            const parsedDay = parseDateKey(dayKey);
            const dayName = parsedDay ? formatter.format(parsedDay) : "?";
            const details = [
                `${String(t.chartBreaks ?? "Ad breaks")}: ${formatNumber(value)}`,
                `${String(t.chartAds ?? "Ads")}: ${formatNumber(entry?.measuredAds)}`,
                `${String(t.timeSaved ?? "Time Saved")}: ${formatTimeSaved(entry?.adMilliseconds)}`,
                `${String(t.channelModalWatch ?? "Watch time")}: ${formatWatchTime(entry?.watchSeconds)}`,
            ];
            const bar = document.createElement("div");
            bar.className = "chart-bar";
            bar.style.height = `${height}%`;
            bar.title = [dayName, ...details].join("\n");
            bar.setAttribute("role", "img");
            bar.setAttribute("aria-label", `${dayName}: ${details.join(", ")}`);
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
        const entries = Object.entries(channelsData || {}).filter(([, entry]) => normalizeCount(entry?.ads) > 0);
        channelList.replaceChildren();
        if (entries.length === 0) {
            const t = TRANSLATIONS[getLang()] || TRANSLATIONS.en;
            channelList.append(createChannelItem("-", String(t.noDataYet ?? ""), "-"));
            return;
        }
        entries.sort((a, b) => {
            const countDiff = normalizeCount(b[1].ads) - normalizeCount(a[1].ads);
            return countDiff !== 0 ? countDiff : a[0].localeCompare(b[0]);
        });
        for (const [index, entry] of entries
            .slice(0, TOP_CHANNEL_COUNT)
            .entries()) {
            channelList.append(createChannelItem(`${index + 1}.`, entry[0], formatNumber(normalizeCount(entry[1].ads)), entry[0]));
        }
    }
    function renderAchievements(unlocked, adsBlocked, channelCount) {
        const safeUnlocked = Array.isArray(unlocked)
            ? [
                ...new Set(unlocked.filter((id) => typeof id === "string" && ACHIEVEMENT_IDS.has(id))),
            ]
            : [];
        const safeAdsBlocked = normalizeCount(adsBlocked);
        const safeChannelCount = normalizeCount(channelCount);
        const badges = achievementsGrid.querySelectorAll(".achievement-badge");
        const timeSavedMilliseconds = latestMeasuredMilliseconds;
        const t = getTranslations();
        let unlockedCount = 0;
        let nextAch = null;
        ACHIEVEMENTS.forEach((ach, i) => {
            const badge = badges[i];
            if (!badge)
                return;
            const achievementText = getAchievementTranslation(ach.id);
            const isUnlocked = safeUnlocked.includes(ach.id);
            const badgeLabel = `${achievementText.name} - ${achievementText.desc}`;
            badge.title = badgeLabel;
            badge.setAttribute("aria-label", badgeLabel);
            badge.setAttribute("aria-pressed", String(isUnlocked));
            if (isUnlocked) {
                badge.classList.add("unlocked");
                unlockedCount++;
            }
            else {
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
        }
        else {
            nextAchievementName.textContent = `🎉 ${String(t.allUnlocked ?? "")}`;
            nextAchievement.append(nextAchievementName);
        }
    }
    function applyTurboPresentation(enabled, ready) {
        const wasReady = turboModeReady;
        const wasEnabled = turboModeEnabled;
        turboModeEnabled = enabled === true;
        turboModeReady = ready === true;
        const isActive = turboModeReady && turboModeEnabled;
        const popupRoot = document.documentElement;
        const wasVisuallyActive = popupRoot.classList.contains("turbo-mode");
        if (isActive && !wasVisuallyActive) {
            turboLayoutGeneration++;
            popupRoot.classList.remove("turbo-layout-collapsed");
            const collapseGeneration = turboLayoutGeneration;
            const collapseDelay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? 0
                : 440;
            window.setTimeout(() => settleTurboLayout(collapseGeneration), collapseDelay);
        }
        if (!isActive && wasVisuallyActive) {
            turboLayoutGeneration++;
            popupRoot.classList.remove("turbo-layout-collapsed");
            turboStatsShell.getBoundingClientRect();
        }
        popupRoot.classList.toggle("turbo-mode", isActive);
        statusCounters.setAttribute("aria-hidden", String(isActive));
        turboStatsShell.setAttribute("aria-hidden", String(isActive));
        statusCounters.inert = isActive;
        turboStatsShell.inert = isActive;
        if (isActive) {
            statisticsReadGeneration++;
            if (turboStatsShell.contains(document.activeElement)) {
                turboModeToggle.focus();
            }
            if (statsPanel.classList.contains("expanded")) {
                setStatsPanelExpanded(false);
            }
            if (!channelModalOverlay.hidden) {
                hideChannelModal();
            }
            resetStatsOverlay.hidden = true;
        }
        updateTurboCopy();
        if (turboModeReady && !turboModeEnabled && (!wasReady || wasEnabled)) {
            loadStatistics();
        }
    }
    function readStatisticsSnapshot(result) {
        const safeResult = (result || {});
        const stats = isPlainObject(safeResult.ttvStats)
            ? safeResult.ttvStats
            : {};
        const adMillisecondsSaved = Object.hasOwn(stats, "adMillisecondsSaved")
            ? normalizeCount(stats.adMillisecondsSaved)
            : normalizeCount(stats.adSecondsSaved) * 1000;
        return {
            ttvAdsBlocked: normalizeCount(safeResult.ttvAdsBlocked),
            ttvStats: {
                daily: normalizeDailyStatsMap(stats.daily),
                channels: normalizeChannelsMap(stats.channels),
                achievements: normalizeAchievementList(stats.achievements, adMillisecondsSaved),
                adMillisecondsSaved,
                measuredAds: normalizeCount(stats.measuredAds),
            },
        };
    }
    function loadStatistics() {
        if (!turboModeReady || turboModeEnabled)
            return false;
        const generation = ++statisticsReadGeneration;
        chrome.storage.local.get(["ttvStats", "ttvAdsBlocked"], (result) => {
            if (generation !== statisticsReadGeneration || turboModeEnabled)
                return;
            if (chrome.runtime.lastError) {
                console.error("[TTV AB] Popup stats read error:", chrome.runtime.lastError.message);
            }
            const snapshot = readStatisticsSnapshot(result);
            const { daily, channels, achievements, adMillisecondsSaved: measuredMilliseconds, } = snapshot.ttvStats;
            const adsCount = snapshot.ttvAdsBlocked;
            let channelCount = 0;
            for (const entry of Object.values(channels)) {
                if (normalizeCount(entry?.ads) > 0)
                    channelCount++;
            }
            latestChannelStats = channels;
            latestAdsTotal = adsCount;
            latestMeasuredMilliseconds = measuredMilliseconds;
            adsBlockedCount.textContent = formatNumber(adsCount);
            updateTimeSaved();
            refreshOpenChannelModal();
            renderChart(daily);
            renderChannels(channels);
            renderAchievements(achievements, adsCount, channelCount);
            syncExpandedStatsPanelHeight();
        });
        return true;
    }
    function getStatisticsExportFilename() {
        const stamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .replace("T", "_")
            .slice(0, 19);
        return `ttv-ab-statistics-${stamp}.json`;
    }
    function exportStatistics() {
        if (!turboModeReady || turboModeEnabled)
            return;
        chrome.storage.local.get(["ttvStats", "ttvAdsBlocked"], (result) => {
            if (chrome.runtime.lastError) {
                console.error("[TTV AB] Statistics export read error:", chrome.runtime.lastError.message);
                return;
            }
            let version = null;
            try {
                version = chrome.runtime?.getManifest?.()?.version || null;
            }
            catch { }
            const exportText = JSON.stringify({
                exportedAt: new Date().toISOString(),
                version,
                ...readStatisticsSnapshot(result),
            }, null, 2);
            const anchor = document.createElement("a");
            anchor.href = `data:application/json;charset=utf-8,${encodeURIComponent(exportText)}`;
            anchor.download = getStatisticsExportFilename();
            document.body.appendChild(anchor);
            try {
                anchor.click();
            }
            finally {
                anchor.remove();
            }
        });
    }
    let resetStatisticsInProgress = false;
    function openResetStatsDialog() {
        if (!turboModeReady || turboModeEnabled)
            return;
        resetStatsText.textContent = String(getTranslations().resetStatsText ?? "");
        resetStatsConfirm.disabled = resetStatisticsInProgress;
        resetStatsOverlay.hidden = false;
        resetStatsCancel.focus();
    }
    function hideResetStatsDialog() {
        if (resetStatsOverlay.hidden)
            return;
        resetStatsOverlay.hidden = true;
        if (!statsResetButton.closest("[inert]"))
            statsResetButton.focus();
    }
    function resetStatistics() {
        if (resetStatisticsInProgress)
            return;
        resetStatisticsInProgress = true;
        resetStatsConfirm.disabled = true;
        chrome.runtime.sendMessage({ type: "ttvab-reset-statistics" }, (response) => {
            resetStatisticsInProgress = false;
            resetStatsConfirm.disabled = false;
            const errorMessage = chrome.runtime.lastError?.message ||
                (isPlainObject(response) && response.ok === true
                    ? null
                    : String(response?.error || "no response"));
            if (!errorMessage) {
                hideResetStatsDialog();
                return;
            }
            console.error("[TTV AB] Statistics reset failed:", errorMessage);
            resetStatsText.textContent = String(getTranslations().resetStatsFailed ?? "");
        });
    }
    statsExportButton.addEventListener("click", exportStatistics);
    statsResetButton.addEventListener("click", openResetStatsDialog);
    resetStatsConfirm.addEventListener("click", resetStatistics);
    resetStatsCancel.addEventListener("click", hideResetStatsDialog);
    resetStatsClose.addEventListener("click", hideResetStatsDialog);
    resetStatsOverlay.addEventListener("click", (event) => {
        if (event.target === resetStatsOverlay)
            hideResetStatsDialog();
    });
    function setToggleRowOpacity(element, enabled) {
        const opacity = enabled ? "1" : "0.4";
        const row = element.closest(".toggle-row");
        const label = row?.querySelector(".toggle-label");
        const slider = row?.querySelector(".slider");
        if (label)
            label.style.opacity = opacity;
        if (slider)
            slider.style.opacity = opacity;
    }
    let toggleStatusReady = false;
    function renderPopupToggleState(snapshot) {
        toggle.checked = snapshot.values.adblock;
        adSpoofingToggle.checked = snapshot.values.adSpoofing;
        autoplayBackupToggle.checked = snapshot.values.autoplayBackup;
        adTimerToggle.checked = snapshot.values.adTimer;
        turboModeToggle.checked = snapshot.values.turbo;
        toggle.disabled = !snapshot.available.adblock;
        adSpoofingToggle.disabled = !snapshot.available.adSpoofing;
        autoplayBackupToggle.disabled = !snapshot.available.autoplayBackup;
        adTimerToggle.disabled = !snapshot.available.adTimer;
        turboModeToggle.disabled = !snapshot.available.turbo;
        setToggleRowOpacity(adSpoofingToggle, snapshot.available.adSpoofing);
        setToggleRowOpacity(adTimerToggle, snapshot.available.adTimer);
        setToggleRowOpacity(autoplayBackupToggle, snapshot.available.autoplayBackup);
        if (snapshot.ready && toggleStatusReady) {
            updateStatus(snapshot.values.adblock, false);
        }
        applyTurboPresentation(snapshot.values.turbo, snapshot.ready);
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
            console.error(`[TTV AB] Popup settings read error (attempt ${attempt}):`, error);
        },
        onWriteError(name, error) {
            console.error(`[TTV AB] Popup ${name} toggle write error:`, error);
        },
        onWriteSuccess(name, enabled) {
            if (name === "turbo")
                return;
            updateStatus(enabled, true, name);
        },
    });
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== "local")
            return;
        popupToggleController.applyStorageChanges(changes);
        if (!turboModeReady || turboModeEnabled)
            return;
        if (changes.ttvAdsBlocked) {
            const newCount = normalizeCount(changes.ttvAdsBlocked.newValue);
            animateCounter(adsBlockedCount, newCount);
        }
        if (changes.ttvStats) {
            loadStatistics();
        }
    });
    toggle.addEventListener("change", () => {
        popupToggleController.write("adblock", toggle.checked);
    });
    turboModeToggle.addEventListener("change", () => {
        popupToggleController.write("turbo", turboModeToggle.checked);
    });
    adTimerToggle.addEventListener("change", () => {
        popupToggleController.write("adTimer", adTimerToggle.checked);
    });
    const adTimerModal = _createInfoModal(adTimerInfoIcon, adTimerTooltip, adTimerModalClose);
    const adSpoofingModal = _createInfoModal(adSpoofingInfoIcon, adSpoofingTooltip, adSpoofingModalClose);
    adSpoofingToggle.addEventListener("change", () => {
        popupToggleController.write("adSpoofing", adSpoofingToggle.checked);
    });
    let isAutoplayBackupWarningContext = false;
    const autoplayBackupModal = _createInfoModal(autoplayBackupInfoIcon, autoplayBackupTooltip, autoplayBackupModalClose, (confirmed) => {
        const disableConfirmed = confirmed &&
            isAutoplayBackupWarningContext &&
            autoplayBackupToggle.checked;
        isAutoplayBackupWarningContext = false;
        if (!disableConfirmed)
            return;
        autoplayBackupToggle.checked = false;
        popupToggleController.write("autoplayBackup", false);
    });
    const infoModals = [adTimerModal, adSpoofingModal, autoplayBackupModal];
    autoplayBackupInfoIcon.addEventListener("click", () => {
        isAutoplayBackupWarningContext = false;
    });
    autoplayBackupToggle.addEventListener("change", () => {
        if (!autoplayBackupToggle.checked) {
            autoplayBackupToggle.checked = true;
            isAutoplayBackupWarningContext = true;
            autoplayBackupModal.open(autoplayBackupToggle);
            return;
        }
        popupToggleController.write("autoplayBackup", true);
    });
    function parseTransitionTimeToMs(value) {
        const trimmedValue = String(value || "").trim();
        if (!trimmedValue)
            return 0;
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
        const transitionCount = Math.max(transitionProperties.length, transitionDurations.length, transitionDelays.length);
        let matchedTimeoutMs = 0;
        let maxTimeoutMs = 0;
        for (let index = 0; index < transitionCount; index++) {
            const property = transitionProperties[index % Math.max(transitionProperties.length, 1)] || "";
            const duration = transitionDurations[index % Math.max(transitionDurations.length, 1)] ||
                0;
            const delay = transitionDelays[index % Math.max(transitionDelays.length, 1)] || 0;
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
        if (statsPanel.hidden || !statsPanel.classList.contains("expanded"))
            return;
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
        const collapseFallbackDelayMs = getTransitionTimeoutMs(statsPanel, "max-height", window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
            ? 0
            : 450);
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
        }
        else if (transientStatusType === "autoplayBackup") {
            label = translations.autoplayBackup;
        }
        else if (transientStatusType === "adTimer") {
            label = translations.adTimer;
        }
        else {
            label = translations.adBlocking;
        }
        infoText.textContent = `${label}: ${transientStatusState ? translations.active : translations.inactive}`;
        infoText.style.color = transientStatusState ? "#4CAF50" : "#f44336";
    }
    function updateStatus(enabled, showTransientMessage = false, toggleType = "adblock") {
        const t = getTranslations();
        const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
        infoText.style.transition = prefersReducedMotion
            ? "none"
            : "color 0.3s ease";
        if (toggleType === "adblock") {
            statusDot.classList.toggle("disabled", !enabled);
            statusText.classList.toggle("disabled", !enabled);
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
    popupToggleController.start();
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
