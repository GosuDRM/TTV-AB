// TTV AB - Popup Script

document.addEventListener("DOMContentLoaded", () => {
	const toggle = document.getElementById("enableToggle");
	const statusDot = document.getElementById("statusDot");
	const statusText = document.getElementById("statusText");
	const adsBlockedCount = document.getElementById("adsBlockedCount");
	const domAdsBlockedCount = document.getElementById("domAdsBlockedCount");
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
	const donateButton = document.getElementById("donateBtn");
	const repoLink = document.getElementById("repoLink");
	const authorLink = document.getElementById("authorLink");
	const requiredElements = {
		toggle,
		statusDot,
		statusText,
		adsBlockedCount,
		domAdsBlockedCount,
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
		donateButton,
		repoLink,
		authorLink,
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
		if (!candidate || candidate.toLowerCase() === "auto") return "en";
		const normalizedCandidate = candidate.replace(/-/g, "_");
		if (TRANSLATIONS[normalizedCandidate]) {
			return normalizedCandidate;
		}
		const lowerCandidate = candidate.toLowerCase();
		if (lowerCandidate.startsWith("zh")) {
			const normalized =
				lowerCandidate.includes("tw") || lowerCandidate.includes("hant")
					? "zh_TW"
					: "zh_CN";
			return TRANSLATIONS[normalized] ? normalized : "en";
		}
		const base = lowerCandidate.split(/[-_]/)[0];
		return TRANSLATIONS[base] ? base : "en";
	}

	function getLang() {
		const saved = getStoredLanguage();
		if (saved && saved !== "auto") {
			return normalizeLanguage(saved);
		}
		return normalizeLanguage(navigator.language);
	}

	function getLocaleTag() {
		const lang = getLang();
		return lang === "auto"
			? normalizeLanguage(navigator.language).replace("_", "-")
			: lang.replace("_", "-");
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
		document.querySelectorAll("[data-i18n]").forEach((el) => {
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
		versionText.setAttribute(
			"aria-label",
			formatTemplate(String(t.versionLabel ?? "Version {version}"), {
				version: versionText.textContent,
			}),
		);
		statsToggle.setAttribute(
			"aria-label",
			String(t.statistics ?? "Statistics"),
		);
		toggle.setAttribute("aria-label", String(t.adBlocking ?? "Ad Blocking"));
		achievementsTitle.textContent = `🏆 ${String(t.achievements ?? "Achievements")}`;
		footerText.textContent = String(t.footerBy ?? " — by ");
		const repoLabel = String(t.repoLinkLabel ?? "Open TTV AB on GitHub");
		repoLink.title = repoLabel;
		repoLink.setAttribute("aria-label", repoLabel);
		const authorLabel = String(t.authorLinkLabel ?? "Open GosuDRM on GitHub");
		authorLink.title = authorLabel;
		authorLink.setAttribute("aria-label", authorLabel);
	}

	const savedLang = getStoredLanguage();
	const normalizedSavedLang =
		savedLang && savedLang !== "auto"
			? normalizeLanguage(savedLang)
			: savedLang;
	const hasValidSavedLang =
		normalizedSavedLang === "auto" ||
		!normalizedSavedLang ||
		TRANSLATIONS[normalizedSavedLang];
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
			lang === "auto" ? normalizeLanguage(navigator.language) : lang;
		applyTranslations(effectiveLang);
		loadStatistics();
		updateStatus(toggle.checked);
	});

	const AVG_AD_DURATION = 22;

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
			id: "popup_10",
			icon: "💥",
			threshold: 10,
			type: "domAds",
		},
		{
			id: "popup_50",
			icon: "🔥",
			threshold: 50,
			type: "domAds",
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
	];

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
		return trimmed !== "" ? trimmed : null;
	}

	function isPlainObject(value) {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			return false;
		}
		const prototype = Object.getPrototypeOf(value);
		return prototype === Object.prototype || prototype === null;
	}

	function createChannelsMap() {
		return Object.create(null);
	}

	function createDailyStatsMap() {
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
		return normalized;
	}

	function normalizeDailyStatsMap(value) {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			return createDailyStatsMap();
		}
		const normalized = createDailyStatsMap();
		for (const [dateKey, entry] of Object.entries(value)) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) continue;
			const safeEntry = isPlainObject(entry) ? entry : {};
			normalized[dateKey] = {
				ads: normalizeCount(safeEntry.ads),
				domAds: normalizeCount(safeEntry.domAds),
			};
		}
		return normalized;
	}

	function updateTimeSaved(adsCount) {
		const seconds = normalizeCount(adsCount) * AVG_AD_DURATION;
		timeSaved.textContent = formatTimeSaved(seconds);
	}

	function getLast7Days() {
		const days = [];
		for (let i = 6; i >= 0; i--) {
			const d = new Date();
			d.setDate(d.getDate() - i);
			days.push(getDateKey(d));
		}
		return days;
	}

	function renderChart(dailyData) {
		const safeDailyData =
			dailyData && typeof dailyData === "object" && !Array.isArray(dailyData)
				? dailyData
				: {};
		const t = getTranslations();
		const days = getLast7Days();
		const parsedDays = days.map((dayKey) => parseDateKey(dayKey));
		const values = days.map((d) => {
			const ads = normalizeCount(safeDailyData[d]?.ads);
			const domAds = normalizeCount(safeDailyData[d]?.domAds);
			return ads + domAds;
		});
		const max = Math.max(...values, 1);
		const avg = Math.round(values.reduce((a, b) => a + b, 0) / 7);
		const formatter = new Intl.DateTimeFormat(getLocaleTag(), {
			weekday: "short",
		});

		weeklyChart.replaceChildren();
		for (const [index, value] of values.entries()) {
			const height = Math.max((value / max) * 100, 8);
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
		const entries = Object.entries(channelsData || {}).map(
			([channel, count]) => [channel, normalizeCount(count)],
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

	function renderAchievements(
		unlocked,
		adsBlocked,
		domAdsBlocked,
		channelCount,
	) {
		const safeUnlocked = Array.isArray(unlocked)
			? [...new Set(unlocked.filter((id) => typeof id === "string"))]
			: [];
		const safeAdsBlocked = normalizeCount(adsBlocked);
		const safeDomAdsBlocked = normalizeCount(domAdsBlocked);
		const safeChannelCount = normalizeCount(channelCount);
		const badges = achievementsGrid.querySelectorAll(".achievement-badge");
		const timeSavedSecs = safeAdsBlocked * AVG_AD_DURATION;
		const t = getTranslations();
		let unlockedCount = 0;
		let nextAch = null;

		ACHIEVEMENTS.forEach((ach, i) => {
			if (!badges[i]) return;
			const achievementText = getAchievementTranslation(ach.id);
			const isUnlocked = safeUnlocked.includes(ach.id);
			const badgeLabel = `${achievementText.name} - ${achievementText.desc}`;
			badges[i].title = badgeLabel;
			badges[i].setAttribute("aria-label", badgeLabel);
			badges[i].setAttribute("aria-pressed", String(isUnlocked));
			if (isUnlocked) {
				badges[i].classList.add("unlocked");
				unlockedCount++;
			} else {
				badges[i].classList.remove("unlocked");
				if (!nextAch) {
					let value = 0;
					switch (ach.type) {
						case "ads":
							value = safeAdsBlocked;
							break;
						case "domAds":
							value = safeDomAdsBlocked;
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
		chrome.storage.local.get(
			["ttvStats", "ttvAdsBlocked", "ttvDomAdsBlocked"],
			(result) => {
				if (chrome.runtime.lastError) {
					console.error(
						"[TTV AB] Popup stats read error:",
						chrome.runtime.lastError.message,
					);
				}
				const safeResult = result || {};
				const stats = isPlainObject(safeResult.ttvStats)
					? safeResult.ttvStats
					: {};
				const daily = normalizeDailyStatsMap(stats.daily);
				const channels = normalizeChannelsMap(stats.channels);
				const achievements = Array.isArray(stats.achievements)
					? [
							...new Set(
								stats.achievements.filter((id) => typeof id === "string"),
							),
						]
					: [];
				const adsCount = normalizeCount(safeResult.ttvAdsBlocked);
				const domAdsCount = normalizeCount(safeResult.ttvDomAdsBlocked);
				const channelCount = Object.keys(channels).length;

				renderChart(daily);
				renderChannels(channels);
				renderAchievements(achievements, adsCount, domAdsCount, channelCount);
				syncExpandedStatsPanelHeight();
			},
		);
	}

	chrome.storage.local.get(
		["ttvAdblockEnabled", "ttvAdsBlocked", "ttvDomAdsBlocked"],
		(result) => {
			if (chrome.runtime.lastError) {
				console.error(
					"[TTV AB] Popup init read error:",
					chrome.runtime.lastError.message,
				);
			}
			const safeResult = result || {};
			const enabled = safeResult.ttvAdblockEnabled !== false;
			toggle.checked = enabled;
			updateStatus(enabled, false);

			const adsCount = normalizeCount(safeResult.ttvAdsBlocked);
			const domAdsCount = normalizeCount(safeResult.ttvDomAdsBlocked);
			adsBlockedCount.textContent = formatNumber(adsCount);
			domAdsBlockedCount.textContent = formatNumber(domAdsCount);
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
		}
		if (changes.ttvAdsBlocked) {
			const newCount = normalizeCount(changes.ttvAdsBlocked.newValue);
			animateCounter(adsBlockedCount, newCount);
			updateTimeSaved(newCount);
		}
		if (changes.ttvDomAdsBlocked) {
			const newDomAdsCount = normalizeCount(changes.ttvDomAdsBlocked.newValue);
			animateCounter(domAdsBlockedCount, newDomAdsCount);
		}
		if (changes.ttvStats) {
			loadStatistics();
		}
	});

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
				return;
			}
			updateStatus(enabled, true);
		});
	});

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
		let collapseFallbackTimeout = setTimeout(() => {
			finalizeCollapse();
		}, 250);
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

	function updateStatus(enabled, showTransientMessage = false) {
		const t = getTranslations();

		if (statusTimeout) {
			clearTimeout(statusTimeout);
			statusTimeout = null;
		}
		infoText.style.transition = "color 0.3s ease";
		if (!showTransientMessage) {
			statusDot.classList.toggle("disabled", !enabled);
			statusText.textContent = enabled ? t.active : t.inactive;
			infoText.textContent = t.changesInstantly;
			infoText.style.color = "#666";
			return;
		}

		if (enabled) {
			statusDot.classList.remove("disabled");
			statusText.textContent = t.active;
			infoText.textContent = `${t.adBlocking}: ${t.active}`;
			infoText.style.color = "#4CAF50";
		} else {
			statusDot.classList.add("disabled");
			statusText.textContent = t.inactive;
			infoText.textContent = `${t.adBlocking}: ${t.inactive}`;
			infoText.style.color = "#f44336";
		}

		statusTimeout = setTimeout(() => {
			infoText.textContent = t.changesInstantly;
			infoText.style.color = "#666";
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
