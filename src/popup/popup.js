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
	const descriptionText = document.getElementById("descriptionText");
	const versionText = document.getElementById("versionText");
	const achievementsTitle = document.getElementById("achievementsTitle");
	const footerText = document.getElementById("footerText");
	const repoLink = document.getElementById("repoLink");

	const LANG_KEY = "ttvab_lang";

	function getLang() {
		const saved = localStorage.getItem(LANG_KEY);
		if (saved && saved !== "auto" && TRANSLATIONS[saved]) return saved;
		const browserLang = navigator.language;
		if (browserLang.startsWith("zh")) {
			return browserLang.includes("TW") || browserLang.includes("Hant")
				? "zh_TW"
				: "zh_CN";
		}
		return browserLang.split("-")[0];
	}

	function getLocaleTag() {
		const lang = getLang();
		return lang === "auto" ? navigator.language : lang.replace("_", "-");
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
		return t.achievementsMap?.[id] || TRANSLATIONS.en.achievementsMap[id];
	}

	function applyTranslations(lang) {
		const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
		document.querySelectorAll("[data-i18n]").forEach((el) => {
			const key = el.dataset.i18n;
			if (t[key]) el.textContent = t[key];
		});
		descriptionText.textContent = t.descriptionText;
		const donateButton = document.getElementById("donateBtn");
		if (donateButton) donateButton.title = t.supportDeveloper;
		langSelector.title = t.language;
		achievementsTitle.textContent = `🏆 ${t.achievements}`;
		footerText.textContent = t.footerBy;
	}

	const savedLang = localStorage.getItem(LANG_KEY);
	const hasValidSavedLang =
		savedLang === "auto" || !savedLang || TRANSLATIONS[savedLang];
	const currentLang = hasValidSavedLang ? savedLang || "auto" : "auto";
	if (!hasValidSavedLang) {
		localStorage.setItem(LANG_KEY, "auto");
	}
	langSelector.value = currentLang;
	applyTranslations(getLang());

	try {
		const manifest = chrome.runtime?.getManifest?.();
		if (manifest?.version && versionText) {
			versionText.textContent = `v${manifest.version}`;
		}
	} catch {}

	langSelector.addEventListener("change", (e) => {
		const lang = e.target.value;
		localStorage.setItem(LANG_KEY, lang);
		const effectiveLang =
			lang === "auto"
				? (() => {
						const browserLang = navigator.language;
						if (browserLang.startsWith("zh")) {
							return browserLang.includes("TW") || browserLang.includes("Hant")
								? "zh_TW"
								: "zh_CN";
						}
						return browserLang.split("-")[0];
					})()
				: lang;
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
		if (seconds < 60) return `~${seconds}s`;
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;
		if (hours > 0) return `~${hours}h ${minutes}m`;
		return `~${minutes}m ${secs}s`;
	}

	function normalizeCount(value) {
		return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
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
		const t = getTranslations();
		const days = getLast7Days();
		const parsedDays = days.map((dayKey) => parseDateKey(dayKey));
		const values = days.map((d) => {
			const ads = normalizeCount(dailyData[d]?.ads);
			const domAds = normalizeCount(dailyData[d]?.domAds);
			return ads + domAds;
		});
		const max = Math.max(...values, 1);
		const avg = Math.round(values.reduce((a, b) => a + b, 0) / 7);
		const formatter = new Intl.DateTimeFormat(getLocaleTag(), {
			weekday: "short",
		});

		weeklyChart.innerHTML = values
			.map((v, i) => {
				const height = Math.max((v / max) * 100, 8);
				const dayName = parsedDays[i] ? formatter.format(parsedDays[i]) : "?";
				const safeDayName = escapeHtml(dayName);
				return `<div class="chart-bar" style="height: ${height}%;" title="${safeDayName}: ${v}"></div>`;
			})
			.join("");

		chartAvg.textContent = formatTemplate(String(t.avgPerDay ?? ""), { avg });
	}

	function escapeHtml(str) {
		const div = document.createElement("div");
		div.textContent = str;
		return div.innerHTML;
	}

	function renderChannels(channelsData) {
		const entries = Object.entries(channelsData || {}).map(
			([channel, count]) => [channel, normalizeCount(count)],
		);
		if (entries.length === 0) {
			const t = TRANSLATIONS[getLang()] || TRANSLATIONS.en;
			channelList.innerHTML = `
                <div class="channel-item">
                    <span><span class="channel-rank">-</span><span class="channel-name">${escapeHtml(String(t.noDataYet ?? ""))}</span></span>
                    <span class="channel-count">-</span>
                </div>
            `;
			return;
		}

		entries.sort((a, b) => b[1] - a[1]);
		const top5 = entries.slice(0, 5);

		channelList.innerHTML = top5
			.map(
				(entry, i) => `
            <div class="channel-item">
                <span><span class="channel-rank">${i + 1}.</span><span class="channel-name">${escapeHtml(entry[0])}</span></span>
                <span class="channel-count">${entry[1].toLocaleString()}</span>
            </div>
        `,
			)
			.join("");
	}

	function renderAchievements(
		unlocked,
		adsBlocked,
		domAdsBlocked,
		channelCount,
	) {
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
			const isUnlocked = unlocked.includes(ach.id);
			badges[i].title = `${achievementText.name} - ${achievementText.desc}`;
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
				const stats =
					safeResult.ttvStats && typeof safeResult.ttvStats === "object"
						? safeResult.ttvStats
						: {};
				const daily =
					stats.daily &&
					typeof stats.daily === "object" &&
					!Array.isArray(stats.daily)
						? stats.daily
						: {};
				const channels =
					stats.channels &&
					typeof stats.channels === "object" &&
					!Array.isArray(stats.channels)
						? stats.channels
						: {};
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
			const enabled = safeResult.ttvAdblockEnabled === false ? false : true;
			toggle.checked = enabled;
			updateStatus(enabled);

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
			const enabled =
				changes.ttvAdblockEnabled.newValue === false ? false : true;
			toggle.checked = enabled;
			updateStatus(enabled);
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

	toggle.addEventListener("change", () => {
		const enabled = toggle.checked;
		const previousEnabled = !enabled;
		chrome.storage.local.set({ ttvAdblockEnabled: enabled }, () => {
			if (chrome.runtime.lastError) {
				console.error(
					"[TTV AB] Popup toggle write error:",
					chrome.runtime.lastError.message,
				);
				toggle.checked = previousEnabled;
				updateStatus(previousEnabled);
				return;
			}
			updateStatus(enabled);
		});
	});

	statsToggle.addEventListener("click", () => {
		statsToggle.classList.toggle("expanded");
		statsPanel.classList.toggle("expanded");
	});

	let statusTimeout = null;

	function updateStatus(enabled) {
		const info = document.querySelector(".info");
		const t = getTranslations();

		if (enabled) {
			statusDot.classList.remove("disabled");
			statusText.textContent = t.active;
			info.textContent = `${t.adBlocking}: ${t.active}`;
			info.style.color = "#4CAF50";
		} else {
			statusDot.classList.add("disabled");
			statusText.textContent = t.inactive;
			info.textContent = `${t.adBlocking}: ${t.inactive}`;
			info.style.color = "#f44336";
		}

		info.style.transition = "color 0.3s ease";
		if (statusTimeout) clearTimeout(statusTimeout);
		statusTimeout = setTimeout(() => {
			info.textContent = t.changesInstantly;
			info.style.color = "#666";
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

	const donateBtn = document.getElementById("donateBtn");
	if (donateBtn) {
		donateBtn.addEventListener("click", () => {
			window.open("https://ko-fi.com/gosudrm", "_blank", "noopener,noreferrer");
		});
	}

	if (repoLink) {
		repoLink.addEventListener("click", (e) => {
			e.preventDefault();
			window.open(
				"https://github.com/GosuDRM/TTV-AB",
				"_blank",
				"noopener,noreferrer",
			);
		});
	}

	const authorLink = document.getElementById("authorLink");
	if (authorLink) {
		authorLink.addEventListener("click", (e) => {
			e.preventDefault();
			window.open(
				"https://github.com/GosuDRM",
				"_blank",
				"noopener,noreferrer",
			);
		});
	}
});
