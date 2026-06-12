// TTV AB - Popup Script

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

	const LOG_COLLECT_TAB_TIMEOUT_MS = 2500;

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

	function hideLogDialog() {
		logDialogOverlay.hidden = true;
		logDialogGenerate.disabled = false;
		logDialogSkip.disabled = false;
	}

	function queryTwitchTabs(): Promise<chrome.tabs.Tab[]> {
		return new Promise((resolve) => {
			try {
				chrome.tabs.query({ url: "*://*.twitch.tv/*" }, (tabs) => {
					if (chrome.runtime.lastError || !Array.isArray(tabs)) {
						resolve([]);
						return;
					}
					resolve(tabs);
				});
			} catch {
				resolve([]);
			}
		});
	}

	function collectTabLogEntries(tabId: number): Promise<PlainObject[]> {
		return new Promise((resolve) => {
			let settled = false;
			const finish = (entries: PlainObject[]) => {
				if (settled) return;
				settled = true;
				resolve(entries);
			};
			const timer = setTimeout(() => finish([]), LOG_COLLECT_TAB_TIMEOUT_MS);
			try {
				chrome.tabs.sendMessage(
					tabId,
					{ type: "ttvab-collect-logs" },
					{ frameId: 0 },
					(response) => {
						clearTimeout(timer);
						if (chrome.runtime.lastError) {
							finish([]);
							return;
						}
						const data = response as PlainObject | undefined;
						finish(Array.isArray(data?.entries) ? data.entries : []);
					},
				);
			} catch {
				clearTimeout(timer);
				finish([]);
			}
		});
	}

	function formatLogEntryLine(entry: PlainObject): string {
		const timestamp = Number.isFinite(Number(entry.t))
			? new Date(Number(entry.t)).toISOString()
			: "????-??-??T??:??:??.???Z";
		const context = entry.w === true ? "worker" : "page";
		const level = typeof entry.l === "string" && entry.l ? entry.l : "info";
		const message = typeof entry.m === "string" ? entry.m : "";
		return `${timestamp} [${context}:${level}] ${message}`;
	}

	async function buildLogExport(): Promise<string> {
		const manifestVersion = chrome.runtime.getManifest?.()?.version || "?";
		const lines = [
			"TTV AB debug log",
			`Version: ${manifestVersion}`,
			`Exported: ${new Date().toISOString()}`,
			`Browser: ${navigator.userAgent}`,
			"",
		];
		const tabs = await queryTwitchTabs();
		const tabsWithIds = tabs.filter((tab) => typeof tab.id === "number");
		if (tabsWithIds.length === 0) {
			lines.push(
				"No open Twitch tabs were found, so no runtime log entries were captured.",
				"Open a twitch.tv stream, let the issue happen, then export again.",
			);
			return lines.join("\n");
		}
		const sections = await Promise.all(
			tabsWithIds.map(async (tab, index) => {
				const entries = await collectTabLogEntries(tab.id as number);
				const sectionLines = [
					`==== Tab ${index + 1}: ${tab.url || "twitch.tv"} ====`,
				];
				if (entries.length === 0) {
					sectionLines.push("(no TTV AB log entries captured in this tab)");
				} else {
					for (const entry of entries) {
						sectionLines.push(formatLogEntryLine(entry));
					}
				}
				sectionLines.push("");
				return sectionLines;
			}),
		);
		for (const sectionLines of sections) {
			lines.push(...sectionLines);
		}
		return lines.join("\n");
	}

	function downloadLogExport(text: string) {
		const stamp = new Date()
			.toISOString()
			.replace(/[:.]/g, "-")
			.replace("T", "_")
			.slice(0, 19);
		const blob = new Blob([text], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `ttv-ab-logs-${stamp}.txt`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		setTimeout(() => URL.revokeObjectURL(url), 30000);
	}

	reportBugLink.addEventListener("click", (event) => {
		event.preventDefault();
		logDialogOverlay.hidden = false;
		logDialogGenerate.focus();
	});

	logDialogSkip.addEventListener("click", () => {
		hideLogDialog();
		openIssuesPage();
	});

	logDialogClose.addEventListener("click", () => {
		hideLogDialog();
	});

	logDialogOverlay.addEventListener("click", (event) => {
		if (event.target === logDialogOverlay) {
			hideLogDialog();
		}
	});

	window.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && !logDialogOverlay.hidden) {
			hideLogDialog();
		}
	});

	logDialogGenerate.addEventListener("click", () => {
		if (logDialogGenerate.disabled) return;
		logDialogGenerate.disabled = true;
		logDialogSkip.disabled = true;
		buildLogExport()
			.then((text) => {
				downloadLogExport(text);
			})
			.catch(() => {})
			.then(() => {
				hideLogDialog();
				openIssuesPage();
			});
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
		setStoredLanguage(lang);
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
					setStoredTheme(theme);
					applyTheme(theme);
				});
			});
	}

	const AVG_AD_DURATION = 22;
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
			threshold: 3600,
			type: "time",
		},
		{
			id: "time_10h",
			icon: "⏰",
			threshold: 36000,
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

	function formatTimeSaved(seconds) {
		const safeSeconds = normalizeCount(seconds);
		if (safeSeconds < 60) return `~${safeSeconds}s`;
		const hours = Math.floor(safeSeconds / 3600);
		const minutes = Math.floor((safeSeconds % 3600) / 60);
		const secs = safeSeconds % 60;
		if (hours > 0) return `~${hours}h ${minutes}m`;
		return `~${minutes}m ${secs}s`;
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

	function updateTimeSaved(adsCount) {
		const seconds = normalizeCount(adsCount) * AVG_AD_DURATION;
		timeSaved.textContent = formatTimeSaved(seconds);
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

	function createChannelItem(rank, name, countText) {
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
		return item;
	}

	function renderChannels(channelsData) {
		const entries = (
			Object.entries(channelsData || {}) as Array<[string, unknown]>
		).map(
			([channel, count]) =>
				[channel, normalizeCount(count)] as [string, number],
		);
		channelList.replaceChildren();
		if (entries.length === 0) {
			const t = TRANSLATIONS[getLang()] || TRANSLATIONS.en;
			channelList.append(
				createChannelItem("-", String(t.noDataYet ?? ""), "-"),
			);
			return;
		}

		entries.sort((a, b) => {
			const countDiff = b[1] - a[1];
			return countDiff !== 0 ? countDiff : a[0].localeCompare(b[0]);
		});
		const top5 = entries.slice(0, 5);
		for (const [index, entry] of top5.entries()) {
			channelList.append(
				createChannelItem(`${index + 1}.`, entry[0], formatNumber(entry[1])),
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
		const timeSavedSecs = safeAdsBlocked * AVG_AD_DURATION;
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
							value = timeSavedSecs;
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
			const achievements = Array.isArray(stats.achievements)
				? [
						...new Set(
							stats.achievements.filter(
								(id) => typeof id === "string" && ACHIEVEMENT_IDS.has(id),
							),
						),
					]
				: [];
			const adsCount = normalizeCount(safeResult.ttvAdsBlocked);
			const channelCount = Object.keys(channels).length;

			renderChart(daily);
			renderChannels(channels);
			renderAchievements(achievements, adsCount, channelCount);
			syncExpandedStatsPanelHeight();
		});
	}

	chrome.storage.local.get(
		[
			"ttvAdblockEnabled",
			"ttvAdSpoofingEnabled",
			"ttvAutoplayBackupEnabled",
			"ttvAdsBlocked",
		],
		(result) => {
			if (chrome.runtime.lastError) {
				console.error(
					"[TTV AB] Popup init read error:",
					chrome.runtime.lastError.message,
				);
			}
			const safeResult = (result || {}) as PlainObject;
			const enabled = safeResult.ttvAdblockEnabled !== false;
			const adSpoofingEnabled = safeResult.ttvAdSpoofingEnabled !== false;
			const autoplayBackupEnabled =
				safeResult.ttvAutoplayBackupEnabled === true;
			toggle.checked = enabled;
			adSpoofingToggle.checked = adSpoofingEnabled;
			autoplayBackupToggle.checked = autoplayBackupEnabled;
			updateStatus(enabled, false);
			syncSubTogglesState(enabled);

			const adsCount = normalizeCount(safeResult.ttvAdsBlocked);
			adsBlockedCount.textContent = formatNumber(adsCount);
			updateTimeSaved(adsCount);
		},
	);

	loadStatistics();

	chrome.storage.onChanged.addListener((changes, namespace) => {
		if (namespace !== "local") return;
		if (changes.ttvAdblockEnabled) {
			const enabled = changes.ttvAdblockEnabled.newValue !== false;
			toggle.checked = enabled;
			updateStatus(enabled, false);
			syncSubTogglesState(enabled);
		}
		if (changes.ttvAdSpoofingEnabled) {
			const adSpoofingEnabled = changes.ttvAdSpoofingEnabled.newValue !== false;
			adSpoofingToggle.checked = adSpoofingEnabled;
		}
		if (changes.ttvAutoplayBackupEnabled) {
			const autoplayBackupEnabled =
				changes.ttvAutoplayBackupEnabled.newValue === true;
			autoplayBackupToggle.checked = autoplayBackupEnabled;
		}
		if (changes.ttvAdsBlocked) {
			const newCount = normalizeCount(changes.ttvAdsBlocked.newValue);
			animateCounter(adsBlockedCount, newCount);
			updateTimeSaved(newCount);
		}
		if (changes.ttvStats) {
			loadStatistics();
		}
	});

	function syncSubTogglesState(adblockEnabled: boolean) {
		if (adSpoofingToggle) {
			adSpoofingToggle.disabled = !adblockEnabled;
			const label = adSpoofingToggle
				.closest(".toggle-row")
				?.querySelector(".toggle-label");
			const slider = adSpoofingToggle
				.closest(".toggle-row")
				?.querySelector(".slider");
			if (label)
				(label as HTMLElement).style.opacity = adblockEnabled ? "1" : "0.4";
			if (slider)
				(slider as HTMLElement).style.opacity = adblockEnabled ? "1" : "0.4";
		}
		if (autoplayBackupToggle) {
			autoplayBackupToggle.disabled = !adblockEnabled;
			const label = autoplayBackupToggle
				.closest(".toggle-row")
				?.querySelector(".toggle-label");
			const slider = autoplayBackupToggle
				.closest(".toggle-row")
				?.querySelector(".slider");
			if (label)
				(label as HTMLElement).style.opacity = adblockEnabled ? "1" : "0.4";
			if (slider)
				(slider as HTMLElement).style.opacity = adblockEnabled ? "1" : "0.4";
		}
	}

	let toggleWriteInFlight = false;

	toggle.addEventListener("change", () => {
		if (toggleWriteInFlight) return;
		toggleWriteInFlight = true;
		toggle.disabled = true;
		const enabled = toggle.checked;
		const previousEnabled = !enabled;
		chrome.storage.local.set({ ttvAdblockEnabled: enabled }, () => {
			toggleWriteInFlight = false;
			toggle.disabled = false;
			if (chrome.runtime.lastError) {
				console.error(
					"[TTV AB] Popup toggle write error:",
					chrome.runtime.lastError.message,
				);
				toggle.checked = previousEnabled;
				updateStatus(previousEnabled);
				syncSubTogglesState(previousEnabled);
				return;
			}
			updateStatus(enabled, true);
			syncSubTogglesState(enabled);
		});
	});

	let adSpoofingWriteInFlight = false;

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
		if (adSpoofingWriteInFlight) return;
		adSpoofingWriteInFlight = true;
		adSpoofingToggle.disabled = true;
		const enabled = adSpoofingToggle.checked;
		const previousEnabled = !enabled;
		chrome.storage.local.set({ ttvAdSpoofingEnabled: enabled }, () => {
			adSpoofingWriteInFlight = false;
			adSpoofingToggle.disabled = false;
			if (chrome.runtime.lastError) {
				console.error(
					"[TTV AB] Popup ad spoofing toggle write error:",
					chrome.runtime.lastError.message,
				);
				adSpoofingToggle.checked = previousEnabled;
				updateStatus(previousEnabled, false, "adSpoofing");
				return;
			}
			updateStatus(enabled, true, "adSpoofing");
		});
	});

	let autoplayBackupWriteInFlight = false;
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
			if (autoplayBackupWriteInFlight) {
				bypassAutoplayBackupWarning = false;
				return;
			}
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
			autoplayBackupWriteInFlight = true;
			autoplayBackupToggle.disabled = true;
			const enabled = autoplayBackupToggle.checked;
			const previousEnabled = !enabled;
			chrome.storage.local.set({ ttvAutoplayBackupEnabled: enabled }, () => {
				autoplayBackupWriteInFlight = false;
				autoplayBackupToggle.disabled = false;
				if (chrome.runtime.lastError) {
					console.error(
						"[TTV AB] Popup autoplay backup toggle write error:",
						chrome.runtime.lastError.message,
					);
					autoplayBackupToggle.checked = previousEnabled;
					updateStatus(previousEnabled, false, "autoplayBackup");
					return;
				}
				updateStatus(enabled, true, "autoplayBackup");
			});
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

	function formatNumber(num) {
		return new Intl.NumberFormat(getLocaleTag()).format(normalizeCount(num));
	}

	function animateCounter(element, newValue) {
		element.textContent = formatNumber(normalizeCount(newValue));
		element.classList.add("pulse");
		setTimeout(() => element.classList.remove("pulse"), 200);
	}
});
