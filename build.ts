// TTV AB - Build Script
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const SOURCE_ROOT = fs.existsSync(path.join(__dirname, "package.json"))
	? __dirname
	: path.resolve(__dirname, "..");
const DIST_DIR = path.join(SOURCE_ROOT, "dist");
const MODULES_DIR = path.join(DIST_DIR, "src", "modules");
const OUTPUT_FILE = path.join(DIST_DIR, "src", "scripts", "content.js");
type TranslationLocale = Record<string, unknown> & {
	achievementsMap?: Record<
		string,
		{
			name?: string;
			desc?: string;
		}
	>;
};
const RUNTIME_TSCONFIGS = ["tsconfig.modules.json", "tsconfig.runtime.json"];
const STATIC_ROOT_FILES = [
	"manifest.json",
	"CHANGELOG.md",
	"LICENSE",
	"PRIVACY.md",
	"README.md",
];
const STATIC_ROOT_DIRECTORIES = ["assets", "_locales"];

const MODULE_ORDER = [
	"constants.js",
	"state.js",
	"logger.js",
	"parser.js",
	"api.js",
	"processor.js",
	"worker.js",
	"hooks.js",
	"player.js",
	"ui.js",
	"init.js",
];

const MINIFY_MAP = {
	_C: "_$c",
	_S: "_$s",
	_log: "_$l",
	_declareState: "_$ds",
	_broadcastWorkers: "_$bw",
	_incrementAdsBlocked: "_$ab",
	_parseAttrs: "_$pa",
	_getServerTime: "_$gt",
	_replaceServerTime: "_$rt",
	_stripAds: "_$sa",
	_getStreamVariantInfo: "_$sv",
	_getStreamUrl: "_$su",
	_getToken: "_$tk",
	_processM3U8: "_$pm",
	_findBackupStream: "_$fb",
	_getWasmJs: "_$wj",
	_hookWorkerFetch: "_$wf",
	_syncStoredDeviceId: "_$sd",
	_hookWorker: "_$hw",
	_hookStorage: "_$hs",
	_hookMainFetch: "_$mf",
	_cleanWorker: "_$cw",
	_getReinsert: "_$gr",
	_reinsert: "_$re",
	_isValid: "_$iv",
	_showDonation: "_$dn",
	_showWelcome: "_$wc",
	_showAchievementUnlocked: "_$au",
	_initAchievementListener: "_$al",

	_bootstrap: "_$bs",
	_initToggleListener: "_$tl",
	_init: "_$in",
	_ATTR_REGEX: "_$ar",
	_REMINDER_KEY: "_$rk",
	_REMINDER_INTERVAL: "_$ri2",
	_FIRST_RUN_KEY: "_$fr",
	_ACHIEVEMENT_INFO: "_$ai",
	_GQL_URL: "_$gu",
	_pruneStreamInfos: "_$ps",
	_PlayerBufferState: "_$pbs",
	_cachedPlayerRef: "_$cpr",
	_getPlayerCore: "_$gpc",
	_findReactRoot: "_$rr",
	_findReactNode: "_$rn",
	_getPlayerAndState: "_$gps",
	_clearAdResumeIntent: "_$cari",
	_rememberPlayerPlaybackForAd: "_$rpfa",
	_resumePlayerAfterAdIfNeeded: "_$rpa",
	_capturePlayerPreferenceSnapshot: "_$cps",
	_restorePlayerPreferenceSnapshot: "_$rps2",
	_doPlayerTask: "_$dpt",
	_monitorPlayerBuffering: "_$mpb",
	_hookVisibilityState: "_$hvs",
	_hookLocalStoragePreservation: "_$hlp",
	_PLAYER_PREFERENCE_KEYS: "_$ppk",
	_hasPlaylistAdMarkers: "_$hpa",
	_syncStreamInfo: "_$si",
	_resetStreamAdState: "_$rsa",
	_getStreamInfoForPlaylist: "_$gsi",
	_getFallbackResolution: "_$gfr",
	_hasExplicitAdMetadata: "_$hem",
	_isKnownAdSegmentUrl: "_$kas",
	_playlistHasKnownAdSegments: "_$pka",
};

function readVersionSources() {
	const constantsPath = path.join(MODULES_DIR, "constants.js");
	const constantsContent = fs.readFileSync(constantsPath, "utf8");
	const constantsMatch = constantsContent.match(/VERSION:\s*['"]([^'"]+)['"]/);
	let packageVersion = "0.0.0";
	let manifestVersion = "0.0.0";

	try {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(SOURCE_ROOT, "package.json"), "utf8"),
		);
		packageVersion = packageJson.version || packageVersion;
	} catch {}

	try {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(SOURCE_ROOT, "manifest.json"), "utf8"),
		);
		manifestVersion = manifest.version || manifestVersion;
	} catch {}

	return {
		constantsVersion: constantsMatch?.[1] || null,
		packageVersion,
		manifestVersion,
	};
}

function getVersion() {
	const { constantsVersion, packageVersion } = readVersionSources();
	return constantsVersion || packageVersion || "0.0.0";
}

function extractLiteral(source, startToken, openChar, closeChar) {
	const start = source.indexOf(startToken);
	if (start === -1) return null;
	const openIndex = source.indexOf(openChar, start);
	if (openIndex === -1) return null;
	let depth = 0;
	for (let i = openIndex; i < source.length; i++) {
		if (source[i] === openChar) depth++;
		else if (source[i] === closeChar) {
			depth--;
			if (depth === 0) {
				return source.slice(openIndex, i + 1);
			}
		}
	}
	return null;
}

function normalizeCodeSnippet(code) {
	return String(code || "")
		.replace(/\/\/.*$/gm, "")
		.replace(/\s+/g, " ")
		.trim();
}

function copyFileToDist(relativePath) {
	const sourcePath = path.join(SOURCE_ROOT, relativePath);
	const destinationPath = path.join(DIST_DIR, relativePath);
	fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
	fs.copyFileSync(sourcePath, destinationPath);
}

function copyDirectoryToDist(relativePath) {
	const sourcePath = path.join(SOURCE_ROOT, relativePath);
	const destinationPath = path.join(DIST_DIR, relativePath);
	fs.cpSync(sourcePath, destinationPath, { recursive: true });
}

function prepareDistStaticFiles() {
	for (const relativePath of STATIC_ROOT_FILES) {
		copyFileToDist(relativePath);
	}
	for (const relativePath of STATIC_ROOT_DIRECTORIES) {
		copyDirectoryToDist(relativePath);
	}
}

function syncPopupHtmlFallbacks() {
	const popupHtmlPath = path.join(SOURCE_ROOT, "src", "popup", "popup.html");
	const translationsPath = path.join(
		DIST_DIR,
		"src",
		"popup",
		"translations.js",
	);
	const outputPopupHtmlPath = path.join(DIST_DIR, "src", "popup", "popup.html");
	const popupHtmlSource = fs.readFileSync(popupHtmlPath, "utf8");
	const translationsSource = fs.readFileSync(translationsPath, "utf8");
	const translations = Function(
		`${translationsSource}; return TRANSLATIONS;`,
	)();
	const english = translations.en || {};
	const chartTitle = String(english.last7Days || "This Week");
	const chartAverage = String(english.avgPerDay || "avg: {avg}/day").replace(
		"{avg}",
		"0",
	);
	const chartBars = Array.from(
		{ length: 7 },
		() =>
			'                    <div class="chart-bar" style="height: 0%;"></div>',
	).join("\n");
	const eol = popupHtmlSource.includes("\r\n") ? "\r\n" : "\n";
	const expectedChartSection =
		`            <div class="stats-section">\n                <div class="stats-section-title">📈 <span data-i18n="last7Days">${chartTitle}</span></div>\n                <div class="chart-container" id="weeklyChart">\n${chartBars}\n                </div>\n                <div class="chart-avg" id="chartAvg">${chartAverage}</div>\n            </div>`.replaceAll(
			"\n",
			eol,
		);
	const syncedPopupHtmlSource = popupHtmlSource.replace(
		/ {12}<div class="stats-section">\r?\n {16}<div class="stats-section-title">📈 <span data-i18n="last7Days">[\s\S]*?<\/div>\r?\n {16}<div class="chart-avg" id="chartAvg">[\s\S]*?<\/div>\r?\n {12}<\/div>/,
		expectedChartSection,
	);
	fs.mkdirSync(path.dirname(outputPopupHtmlPath), { recursive: true });
	fs.writeFileSync(outputPopupHtmlPath, syncedPopupHtmlSource);
}

function validateSharedDefinitions() {
	const { constantsVersion, packageVersion, manifestVersion } =
		readVersionSources();
	const manifest = JSON.parse(
		fs.readFileSync(path.join(DIST_DIR, "manifest.json"), "utf8"),
	);
	const packageJson = JSON.parse(
		fs.readFileSync(path.join(SOURCE_ROOT, "package.json"), "utf8"),
	);
	const packageLock = JSON.parse(
		fs.readFileSync(path.join(SOURCE_ROOT, "package-lock.json"), "utf8"),
	);
	const canonicalRepoUrl = "https://github.com/GosuDRM/TTV-AB";
	if (
		manifest.default_locale &&
		!fs.existsSync(path.join(DIST_DIR, "_locales", manifest.default_locale))
	) {
		throw new Error(
			`Manifest default_locale directory is missing: ${manifest.default_locale}`,
		);
	}
	for (const contentScript of manifest.content_scripts || []) {
		for (const file of contentScript.js || []) {
			if (!fs.existsSync(path.join(DIST_DIR, file))) {
				throw new Error(`Manifest content script is missing: ${file}`);
			}
		}
	}
	if (manifest.action?.default_popup) {
		if (!fs.existsSync(path.join(DIST_DIR, manifest.action.default_popup))) {
			throw new Error(
				`Manifest default_popup is missing: ${manifest.action.default_popup}`,
			);
		}
	}
	const expectedBackgroundScripts = ["src/scripts/background.js"];
	const comparableBackgroundScripts = Array.isArray(
		manifest.background?.scripts,
	)
		? manifest.background.scripts.map((file) =>
				String(file).replaceAll("\\", "/"),
			)
		: [];
	if (
		JSON.stringify(comparableBackgroundScripts) !==
		JSON.stringify(expectedBackgroundScripts)
	) {
		throw new Error(
			`Manifest background.scripts drift detected: ${JSON.stringify(comparableBackgroundScripts)}`,
		);
	}
	for (const backgroundScript of comparableBackgroundScripts) {
		if (!fs.existsSync(path.join(DIST_DIR, backgroundScript))) {
			throw new Error(
				`Manifest background script is missing: ${backgroundScript}`,
			);
		}
	}
	const geckoSettings = manifest.browser_specific_settings?.gecko;
	if (!geckoSettings || typeof geckoSettings !== "object") {
		throw new Error(
			"Manifest browser_specific_settings.gecko must remain defined for Firefox packaging",
		);
	}
	if (geckoSettings.id !== "{71e91189-9cd2-4e46-895d-bcc38f0053c4}") {
		throw new Error(
			`Manifest gecko id drift detected: ${geckoSettings.id || "missing"}`,
		);
	}
	if (geckoSettings.strict_min_version !== "142.0") {
		throw new Error(
			`Manifest gecko strict_min_version drift detected: ${geckoSettings.strict_min_version || "missing"}`,
		);
	}
	const dataCollectionPermissions = geckoSettings.data_collection_permissions;
	if (
		!dataCollectionPermissions ||
		JSON.stringify(dataCollectionPermissions.required || []) !==
			JSON.stringify(["none"]) ||
		JSON.stringify(dataCollectionPermissions.optional || []) !==
			JSON.stringify([])
	) {
		throw new Error(
			"Manifest gecko data_collection_permissions must remain { required: ['none'], optional: [] }",
		);
	}
	if (manifest.action?.default_title !== "__MSG_extName__") {
		throw new Error(
			`Manifest action.default_title must remain localized via __MSG_extName__: ${manifest.action?.default_title || "missing"}`,
		);
	}
	for (const iconGroup of [
		manifest.icons || {},
		manifest.action?.default_icon || {},
	]) {
		for (const iconPath of Object.values(iconGroup)) {
			if (!fs.existsSync(path.join(DIST_DIR, iconPath))) {
				throw new Error(`Manifest icon is missing: ${iconPath}`);
			}
		}
	}
	if (manifest.homepage_url !== canonicalRepoUrl) {
		throw new Error(
			`Manifest homepage_url must match the canonical repository: ${manifest.homepage_url || "missing"}`,
		);
	}
	if (manifest.name !== "__MSG_extName__") {
		throw new Error(
			`Manifest name must remain localized via __MSG_extName__: ${manifest.name || "missing"}`,
		);
	}
	if (manifest.description !== "__MSG_extDesc__") {
		throw new Error(
			`Manifest description must remain localized via __MSG_extDesc__: ${manifest.description || "missing"}`,
		);
	}
	if (manifest.short_name !== "TTV AB") {
		throw new Error(
			`Manifest short_name must match the canonical short name: ${manifest.short_name || "missing"}`,
		);
	}
	const expectedPermissions = ["storage"];
	if (
		JSON.stringify([...(manifest.permissions || [])].sort()) !==
		JSON.stringify(expectedPermissions)
	) {
		throw new Error(
			`Manifest permissions must remain limited to ${expectedPermissions.join(", ")}: ${JSON.stringify(manifest.permissions || [])}`,
		);
	}
	const expectedHostPermissions = ["*://*.twitch.tv/*"];
	if (
		JSON.stringify([...(manifest.host_permissions || [])].sort()) !==
		JSON.stringify(expectedHostPermissions)
	) {
		throw new Error(
			`Manifest host_permissions must remain limited to ${expectedHostPermissions.join(", ")}: ${JSON.stringify(manifest.host_permissions || [])}`,
		);
	}
	const expectedContentScripts = [
		{
			matches: ["*://*.twitch.tv/*"],
			js: ["src/scripts/content.js"],
			run_at: "document_start",
			world: "MAIN",
		},
		{
			matches: ["*://*.twitch.tv/*"],
			js: ["src/scripts/bridge.js"],
			run_at: "document_start",
			world: "ISOLATED",
		},
	];
	const comparableContentScripts = (manifest.content_scripts || []).map(
		({ matches = [], js = [], run_at = null, world = null }) => ({
			matches: [...matches],
			js: [...js],
			run_at,
			world,
		}),
	);
	if (
		JSON.stringify(comparableContentScripts) !==
		JSON.stringify(expectedContentScripts)
	) {
		throw new Error(
			`Manifest content_scripts drift detected: ${JSON.stringify(comparableContentScripts)}`,
		);
	}
	if (
		!constantsVersion ||
		constantsVersion !== packageVersion ||
		constantsVersion !== manifestVersion
	) {
		throw new Error(
			`Version mismatch: constants=${constantsVersion || "missing"}, package=${packageVersion}, manifest=${manifestVersion}`,
		);
	}
	if (packageJson.homepage !== canonicalRepoUrl) {
		throw new Error(
			`package homepage must match the canonical repository: ${packageJson.homepage || "missing"}`,
		);
	}
	if (packageJson.repository?.type !== "git") {
		throw new Error(
			`package repository.type must be git: ${packageJson.repository?.type || "missing"}`,
		);
	}
	if (
		packageJson.repository?.url !== `${canonicalRepoUrl}.git` &&
		packageJson.repository?.url !== `git+${canonicalRepoUrl}.git`
	) {
		throw new Error(
			`package repository.url must match the canonical repository: ${packageJson.repository?.url || "missing"}`,
		);
	}
	if (packageJson.bugs?.url !== `${canonicalRepoUrl}/issues`) {
		throw new Error(
			`package bugs.url must match the canonical issue tracker: ${packageJson.bugs?.url || "missing"}`,
		);
	}
	if (packageJson.license !== "MIT") {
		throw new Error(
			`package license must remain MIT: ${packageJson.license || "missing"}`,
		);
	}
	if (packageLock.name !== packageJson.name) {
		throw new Error(
			`package-lock name mismatch: package=${packageJson.name || "missing"}, lock=${packageLock.name || "missing"}`,
		);
	}
	if (
		packageLock.version !== packageVersion ||
		packageLock.packages?.[""]?.version !== packageVersion
	) {
		throw new Error(
			`package-lock version mismatch: package=${packageVersion}, lock=${packageLock.version || "missing"}, root=${packageLock.packages?.[""]?.version || "missing"}`,
		);
	}
	const readmePath = path.join(SOURCE_ROOT, "README.md");
	const privacyPath = path.join(SOURCE_ROOT, "PRIVACY.md");
	const changelogPath = path.join(SOURCE_ROOT, "CHANGELOG.md");
	const localesPath = path.join(SOURCE_ROOT, "_locales");
	const popupPath = path.join(DIST_DIR, "src", "popup", "popup.js");
	const bridgePath = path.join(DIST_DIR, "src", "scripts", "bridge.js");
	const backgroundPath = path.join(DIST_DIR, "src", "scripts", "background.js");
	const uiPath = path.join(DIST_DIR, "src", "modules", "ui.js");
	const translationsPath = path.join(
		DIST_DIR,
		"src",
		"popup",
		"translations.js",
	);
	const initPath = path.join(DIST_DIR, "src", "modules", "init.js");
	const hooksPath = path.join(DIST_DIR, "src", "modules", "hooks.js");
	const statePath = path.join(DIST_DIR, "src", "modules", "state.js");
	const workerPath = path.join(DIST_DIR, "src", "modules", "worker.js");
	const processorPath = path.join(DIST_DIR, "src", "modules", "processor.js");
	const apiPath = path.join(DIST_DIR, "src", "modules", "api.js");
	const constantsPath = path.join(DIST_DIR, "src", "modules", "constants.js");
	const readmeSource = fs.readFileSync(readmePath, "utf8");
	const privacySource = fs.readFileSync(privacyPath, "utf8");
	const changelogSource = fs.readFileSync(changelogPath, "utf8");
	const localeDirectories = fs.readdirSync(localesPath).sort();
	for (const localeDir of localeDirectories) {
		const messages = JSON.parse(
			fs.readFileSync(
				path.join(localesPath, localeDir, "messages.json"),
				"utf8",
			),
		);
		if (!messages.extName?.message || !messages.extDesc?.message) {
			throw new Error(
				`Locale ${localeDir} is missing extName or extDesc in messages.json`,
			);
		}
	}
	if (!readmeSource.includes(canonicalRepoUrl)) {
		throw new Error("README is missing the canonical repository URL");
	}
	if (!privacySource.includes(canonicalRepoUrl)) {
		throw new Error("PRIVACY is missing the canonical repository URL");
	}
	if (
		!readmeSource.includes(`version-${constantsVersion}-`) ||
		!readmeSource.includes(`### v${constantsVersion}`)
	) {
		throw new Error(
			`README version markers are out of sync with ${constantsVersion}`,
		);
	}
	if (!changelogSource.includes(`## [${constantsVersion}]`)) {
		throw new Error(
			`CHANGELOG top version markers are out of sync with ${constantsVersion}`,
		);
	}
	for (const requiredPrivacyPhrase of [
		"enable/disable toggle",
		'"Ads Blocked" counter',
		"selected language",
		"welcome/donation reminder dismissal timing",
		"stays on your device",
	]) {
		if (!privacySource.includes(requiredPrivacyPhrase)) {
			throw new Error(
				`PRIVACY is missing required storage disclosure text: ${requiredPrivacyPhrase}`,
			);
		}
	}
	const popupSource = fs.readFileSync(popupPath, "utf8");
	const popupHtmlSource = fs.readFileSync(
		path.join(DIST_DIR, "src", "popup", "popup.html"),
		"utf8",
	);
	if (!popupHtmlSource.includes(`href="${canonicalRepoUrl}"`)) {
		throw new Error(
			"Popup HTML repo link must target the canonical repository URL",
		);
	}
	if (!popupHtmlSource.includes('href="https://github.com/GosuDRM"')) {
		throw new Error(
			"Popup HTML author link must target the GosuDRM GitHub profile",
		);
	}
	if (!popupHtmlSource.includes('href="https://ko-fi.com/gosudrm"')) {
		throw new Error(
			"Popup HTML donate link must target the canonical Ko-fi URL",
		);
	}
	for (const [elementId, title] of [
		["donateBtn", "Support GosuDRM"],
		["channelList", "Top Channels"],
		["statsToggle", "Statistics"],
		["enableToggle", "Ad Blocking"],
		["langSelector", "Language"],
	]) {
		if (!popupHtmlSource.includes(`id="${elementId}"`)) continue;
		if (
			!popupHtmlSource.includes(`title="${title}"`) &&
			!popupHtmlSource.includes(`aria-label="${title}"`)
		) {
			throw new Error(
				`Popup HTML ${elementId} must preserve the fallback accessibility label: ${title}`,
			);
		}
	}
	for (const requiredPopupLinkAttr of [
		'target="_blank"',
		'rel="noopener noreferrer"',
	]) {
		if (!popupHtmlSource.includes(requiredPopupLinkAttr)) {
			throw new Error(
				`Popup HTML footer links are missing ${requiredPopupLinkAttr}`,
			);
		}
	}
	for (const [linkId, title] of [
		["repoLink", "Open TTV AB on GitHub"],
		["authorLink", "Open GosuDRM on GitHub"],
	]) {
		if (!popupHtmlSource.includes(`id="${linkId}"`)) continue;
		if (!popupHtmlSource.includes(`title="${title}"`)) {
			throw new Error(
				`Popup HTML ${linkId} link must preserve the hover title: ${title}`,
			);
		}
	}
	if (!popupHtmlSource.includes('<button type="button" class="stats-toggle"')) {
		throw new Error(
			"Popup statistics toggle must remain a native button element",
		);
	}
	if (!popupHtmlSource.includes('id="statsPanel" hidden aria-hidden="true"')) {
		throw new Error(
			"Popup statistics panel must start hidden with matching aria-hidden state",
		);
	}
	const expectedPopupVersionMarkup = `id="versionText" aria-label="Version ${constantsVersion}">v${constantsVersion}</div>`;
	if (!popupHtmlSource.includes(expectedPopupVersionMarkup)) {
		throw new Error(
			`Popup version badge must ship with a static synced fallback label/value: ${expectedPopupVersionMarkup}`,
		);
	}
	for (const requiredPopupId of [
		"enableToggle",
		"statusDot",
		"statusText",
		"adsBlockedCount",
		"timeSaved",
		"statsToggle",
		"statsPanel",
		"weeklyChart",
		"chartAvg",
		"channelList",
		"achievementsGrid",
		"achievementsProgress",
		"nextAchievement",
		"langSelector",
		"langAutoOption",
		"descriptionText",
		"versionText",
		"achievementsTitle",
		"footerText",
		"infoText",
		"donateBtn",
		"repoLink",
		"authorLink",
	]) {
		if (!popupHtmlSource.includes(`id="${requiredPopupId}"`)) {
			throw new Error(`Popup HTML is missing required id: ${requiredPopupId}`);
		}
	}
	const bridgeSource = fs.readFileSync(bridgePath, "utf8");
	const backgroundSource = fs.readFileSync(backgroundPath, "utf8");
	const uiSource = fs.readFileSync(uiPath, "utf8");
	const translationsSource = fs.readFileSync(translationsPath, "utf8");
	const translationsContext: {
		TRANSLATIONS?: Record<string, TranslationLocale>;
	} = {};
	Function(
		"context",
		`${translationsSource}; context.TRANSLATIONS = TRANSLATIONS;`,
	)(translationsContext);
	const translationEntries = Object.entries(
		translationsContext.TRANSLATIONS || {},
	);
	const flattenTranslationKeys = (value, prefix = "") => {
		let keys = [];
		for (const [key, nested] of Object.entries(value || {})) {
			const nextPrefix = prefix ? `${prefix}.${key}` : key;
			if (nested && typeof nested === "object" && !Array.isArray(nested)) {
				keys = keys.concat(flattenTranslationKeys(nested, nextPrefix));
			} else {
				keys.push(nextPrefix);
			}
		}
		return keys;
	};
	const baseTranslations = translationsContext.TRANSLATIONS?.en || {};
	const baseTranslationKeys = new Set(flattenTranslationKeys(baseTranslations));
	const placeholderPattern = /\{(\w+)\}/g;
	const getPlaceholders = (value) => {
		return [
			...new Set(
				Array.from(
					String(value || "").matchAll(placeholderPattern),
					(match) => match[1],
				),
			),
		].sort();
	};
	const getNestedTranslationValue = (value, keyPath) => {
		return keyPath
			.split(".")
			.reduce((currentValue, key) => currentValue?.[key], value);
	};
	for (const [localeName, localeTranslations] of translationEntries) {
		const localeKeys = new Set(flattenTranslationKeys(localeTranslations));
		const missingKeys = [...baseTranslationKeys].filter(
			(key) => !localeKeys.has(key),
		);
		if (missingKeys.length > 0) {
			throw new Error(
				`Popup translations for ${localeName} are missing keys: ${missingKeys.join(", ")}`,
			);
		}
		for (const keyPath of baseTranslationKeys) {
			const basePlaceholders = getPlaceholders(
				getNestedTranslationValue(baseTranslations, keyPath),
			);
			const localePlaceholders = getPlaceholders(
				getNestedTranslationValue(localeTranslations, keyPath),
			);
			if (
				JSON.stringify(basePlaceholders) !== JSON.stringify(localePlaceholders)
			) {
				throw new Error(
					`Popup translations for ${localeName} have placeholder drift at ${keyPath}: expected ${basePlaceholders.join(", ") || "none"}, got ${localePlaceholders.join(", ") || "none"}`,
				);
			}
		}
	}
	const initSource = fs.readFileSync(initPath, "utf8");
	const hooksSource = fs.readFileSync(hooksPath, "utf8");
	const stateSource = fs.readFileSync(statePath, "utf8");
	const workerSource = fs.readFileSync(workerPath, "utf8");
	const parserSource = fs.readFileSync(
		path.join(DIST_DIR, "src", "modules", "parser.js"),
		"utf8",
	);
	const processorSource = fs.readFileSync(processorPath, "utf8");
	const apiSource = fs.readFileSync(apiPath, "utf8");
	const constantsSource = fs.readFileSync(constantsPath, "utf8");
	const reloadAfterAdMatch = constantsSource.match(
		/RELOAD_AFTER_AD:\s*(true|false)/,
	);
	if (reloadAfterAdMatch?.[1] !== "true") {
		throw new Error(
			"RELOAD_AFTER_AD must remain true to match vaft post-ad recovery",
		);
	}

	const backgroundGetDateKeyLiteral = extractLiteral(
		backgroundSource,
		"function getDateKey(",
		"{",
		"}",
	);
	const popupGetDateKeyLiteral = extractLiteral(
		popupSource,
		"function getDateKey(",
		"{",
		"}",
	);
	const popupAvgAdDurationMatch = popupSource.match(
		/const AVG_AD_DURATION = (\d+);/,
	);
	const backgroundAvgAdDurationMatch = backgroundSource.match(
		/const AVG_AD_DURATION = (\d+);/,
	);
	const popupAchievementsLiteral = extractLiteral(
		popupSource,
		"const ACHIEVEMENTS =",
		"[",
		"]",
	);
	const backgroundAchievementsLiteral = extractLiteral(
		backgroundSource,
		"const ACHIEVEMENTS =",
		"[",
		"]",
	);
	const uiAchievementInfoLiteral = extractLiteral(
		uiSource,
		"const _ACHIEVEMENT_INFO =",
		"{",
		"}",
	);

	if (
		!backgroundGetDateKeyLiteral ||
		!popupGetDateKeyLiteral ||
		!popupAvgAdDurationMatch ||
		!backgroundAvgAdDurationMatch ||
		!popupAchievementsLiteral ||
		!backgroundAchievementsLiteral ||
		!uiAchievementInfoLiteral
	) {
		throw new Error("Failed to parse shared popup/background definitions");
	}

	if (
		normalizeCodeSnippet(popupGetDateKeyLiteral) !==
		normalizeCodeSnippet(backgroundGetDateKeyLiteral)
	) {
		throw new Error(
			"Popup and background getDateKey implementations are out of sync",
		);
	}

	const popupAvgAdDuration = Number.parseInt(popupAvgAdDurationMatch[1], 10);
	const backgroundAvgAdDuration = Number.parseInt(
		backgroundAvgAdDurationMatch[1],
		10,
	);
	if (popupAvgAdDuration !== backgroundAvgAdDuration) {
		throw new Error("Popup and background AVG_AD_DURATION are out of sync");
	}

	const popupAchievements = Function(`return (${popupAchievementsLiteral});`)();
	const backgroundAchievements = Function(
		`return (${backgroundAchievementsLiteral});`,
	)();
	const uiAchievementInfo = Function(`return (${uiAchievementInfoLiteral});`)();
	const translations = Function(
		`${translationsSource}; return TRANSLATIONS;`,
	)() as Record<string, TranslationLocale>;

	const popupComparable = popupAchievements.map(({ id, threshold, type }) => ({
		id,
		threshold,
		type,
	}));
	const backgroundComparable = backgroundAchievements.map(
		({ id, threshold, type }) => ({
			id,
			threshold,
			type,
		}),
	);

	if (
		JSON.stringify(popupComparable) !== JSON.stringify(backgroundComparable)
	) {
		throw new Error(
			"Popup and background achievement definitions are out of sync",
		);
	}

	const popupIds = popupAchievements
		.map((achievement) => achievement.id)
		.sort();
	const uiIds = Object.keys(uiAchievementInfo).sort();
	if (JSON.stringify(popupIds) !== JSON.stringify(uiIds)) {
		throw new Error(
			"UI achievement metadata is out of sync with popup achievements",
		);
	}

	for (const achievement of popupAchievements) {
		if (uiAchievementInfo[achievement.id]?.icon !== achievement.icon) {
			throw new Error(`UI achievement icon mismatch for ${achievement.id}`);
		}
	}

	const popupBadgeCount = (
		popupHtmlSource.match(/class="achievement-badge"/g) || []
	).length;
	if (popupBadgeCount !== popupAchievements.length) {
		throw new Error(
			`Popup achievement badge count mismatch: html=${popupBadgeCount}, config=${popupAchievements.length}`,
		);
	}
	const popupAchievementButtonCount = (
		popupHtmlSource.match(/<button type="button" class="achievement-badge"/g) ||
		[]
	).length;
	if (popupAchievementButtonCount !== popupAchievements.length) {
		throw new Error(
			`Popup achievement badges must remain native buttons: buttons=${popupAchievementButtonCount}, config=${popupAchievements.length}`,
		);
	}
	const popupAchievementFallbackLabels = [
		...popupHtmlSource.matchAll(
			/<button type="button" class="achievement-badge"[^>]*title="([^"]+)"[^>]*aria-label="([^"]+)"/g,
		),
	].map((match) => ({ title: match[1], label: match[2] }));
	if (popupAchievementFallbackLabels.length !== popupAchievements.length) {
		throw new Error(
			`Popup achievement badges must keep static aria-label fallbacks: labels=${popupAchievementFallbackLabels.length}, config=${popupAchievements.length}`,
		);
	}
	for (const { title, label } of popupAchievementFallbackLabels) {
		if (title !== label) {
			throw new Error(
				`Popup achievement badge fallback aria-label must match title: ${title} !== ${label}`,
			);
		}
	}
	const englishAchievementFallbackLabels = popupAchievements.map(
		(achievement) => {
			const text = translations.en?.achievementsMap?.[achievement.id];
			return `${text?.name || achievement.id} - ${text?.desc || ""}`;
		},
	);
	if (
		JSON.stringify(popupAchievementFallbackLabels.map(({ title }) => title)) !==
		JSON.stringify(englishAchievementFallbackLabels)
	) {
		throw new Error(
			"Popup achievement badge fallback labels are out of sync with English translations",
		);
	}

	const firstAchievement = popupAchievements[0] || null;
	const firstAchievementFallback = firstAchievement
		? `${firstAchievement.icon} ${translations.en?.achievementsMap?.[firstAchievement.id]?.name || firstAchievement.id}`
		: null;
	const expectedAchievementsProgressMarkup = `id="achievementsProgress" aria-live="polite" aria-atomic="true">0/${popupAchievements.length}</span>`;
	if (!popupHtmlSource.includes(expectedAchievementsProgressMarkup)) {
		throw new Error(
			`Popup achievements fallback progress must default to 0/${popupAchievements.length}`,
		);
	}
	if (firstAchievementFallback) {
		const expectedNextAchievementMarkup = `id="nextAchievement" aria-live="polite" aria-atomic="true">Next: <span class="next-achievement-name">${firstAchievementFallback}</span></div>`;
		if (!popupHtmlSource.includes(expectedNextAchievementMarkup)) {
			throw new Error(
				"Popup next-achievement fallback is out of sync with the first configured achievement",
			);
		}
	}

	const popupNormalizeCount = extractLiteral(
		popupSource,
		"function normalizeCount(",
		"{",
		"}",
	);
	const popupFormatNumber = extractLiteral(
		popupSource,
		"function formatNumber(",
		"{",
		"}",
	);
	const popupUpdateTimeSaved = extractLiteral(
		popupSource,
		"function updateTimeSaved(",
		"{",
		"}",
	);
	const backgroundNormalizeCount = extractLiteral(
		backgroundSource,
		"function normalizeCount(",
		"{",
		"}",
	);
	const initNormalizeCount = extractLiteral(
		initSource,
		"function _normalizeCounterValue(",
		"{",
		"}",
	);
	if (
		!popupNormalizeCount ||
		!popupFormatNumber ||
		!popupUpdateTimeSaved ||
		!backgroundNormalizeCount ||
		!initNormalizeCount ||
		normalizeCodeSnippet(popupNormalizeCount) !==
			normalizeCodeSnippet(backgroundNormalizeCount) ||
		normalizeCodeSnippet(popupNormalizeCount).replace(
			"function normalizeCount(value)",
			"function _normalizeCounterValue(value)",
		) !== normalizeCodeSnippet(initNormalizeCount) ||
		!popupFormatNumber.includes("normalizeCount(num)") ||
		!popupUpdateTimeSaved.includes("normalizeCount(adsCount)")
	) {
		throw new Error(
			"Popup, background, and init counter normalizers are out of sync",
		);
	}

	for (const source of [popupSource, uiSource]) {
		for (const match of source.matchAll(/window\.open\(([\s\S]*?)\);/g)) {
			if (
				match[1].includes('"_blank"') &&
				!match[1].includes("noopener,noreferrer")
			) {
				throw new Error(
					"Found unsafe window.open call without noopener,noreferrer",
				);
			}
		}
	}
	const dynamicPopupInnerHtmlCount = (
		popupSource.match(/innerHTML\s*=\s*`[^`]*\$\{/g) || []
	).length;
	const dynamicUiInnerHtmlCount = (
		uiSource.match(/innerHTML\s*=\s*`[^`]*\$\{/g) || []
	).length;
	const dynamicPopupTitleAttrCount = (popupSource.match(/title="\$\{/g) || [])
		.length;
	if (
		dynamicPopupInnerHtmlCount !== 0 ||
		dynamicUiInnerHtmlCount !== 0 ||
		dynamicPopupTitleAttrCount !== 0
	) {
		throw new Error(
			`Unexpected dynamic HTML footprint: popupInner=${dynamicPopupInnerHtmlCount}, uiInner=${dynamicUiInnerHtmlCount}, popupTitle=${dynamicPopupTitleAttrCount}`,
		);
	}
	for (const [name, source] of [
		["init.js", initSource],
		["ui.js", uiSource],
		["bridge.js", bridgeSource],
	]) {
		const messageListenerCount = (
			source.match(/window\.addEventListener\("message"/g) || []
		).length;
		const sourceGuardCount = (
			source.match(/source !== window|source === window/g) || []
		).length;
		if (messageListenerCount !== sourceGuardCount) {
			throw new Error(
				`${name} has ${messageListenerCount} message listeners but ${sourceGuardCount} source guards`,
			);
		}
	}
	for (const [name, source] of [
		["popup.js", popupSource],
		["bridge.js", bridgeSource],
	]) {
		const storageListenerCount = (
			source.match(/chrome\.storage\.onChanged\.addListener/g) || []
		).length;
		const localScopeGuardCount = (source.match(/namespace !== "local"/g) || [])
			.length;
		if (storageListenerCount !== localScopeGuardCount) {
			throw new Error(
				`${name} has ${storageListenerCount} storage listeners but ${localScopeGuardCount} local-area guards`,
			);
		}
	}

	const popupDomIds = new Set(
		[...popupSource.matchAll(/getElementById\("([^"]+)"\)/g)].map(
			(match) => match[1],
		),
	);
	for (const domId of popupDomIds) {
		if (!popupHtmlSource.includes(`id="${domId}"`)) {
			throw new Error(`Popup HTML is missing required element id ${domId}`);
		}
	}
	const popupSetupSource = popupSource.split("const requiredElements =", 1)[0];
	const popupElementBindings = [
		...popupSetupSource.matchAll(
			/const\s+(\w+)\s*=\s*document\.getElementById\("([^"]+)"\);/g,
		),
	];
	const popupBoundDomIds = new Set(
		popupElementBindings.map(([, , domId]) => domId),
	);
	const requiredElementsLiteral = extractLiteral(
		popupSource,
		"const requiredElements =",
		"{",
		"}",
	);
	if (!requiredElementsLiteral) {
		throw new Error("Popup script is missing the requiredElements guard map");
	}
	const requiredElementNames = new Set(
		Array.from(
			requiredElementsLiteral.matchAll(/\b(\w+)\s*,?/g),
			(match) => match[1],
		),
	);
	for (const [_, variableName, domId] of popupElementBindings) {
		if (!requiredElementNames.has(variableName)) {
			throw new Error(
				`Popup element binding ${variableName} (${domId}) is missing from requiredElements`,
			);
		}
	}
	for (const requiredPopupId of [
		"enableToggle",
		"statusDot",
		"statusText",
		"adsBlockedCount",
		"timeSaved",
		"statsToggle",
		"statsPanel",
		"weeklyChart",
		"chartAvg",
		"channelList",
		"achievementsGrid",
		"achievementsProgress",
		"nextAchievement",
		"langSelector",
		"langAutoOption",
		"descriptionText",
		"versionText",
		"achievementsTitle",
		"footerText",
		"infoText",
		"donateBtn",
		"repoLink",
		"authorLink",
	]) {
		if (!popupBoundDomIds.has(requiredPopupId)) {
			throw new Error(
				`Popup startup guard is missing a top-level binding for ${requiredPopupId}`,
			);
		}
	}

	if (!popupHtmlSource.includes('<option value="auto" id="langAutoOption">')) {
		throw new Error(
			'Popup language selector must include a dedicated auto option with id="langAutoOption"',
		);
	}
	const popupLanguageOptions = [
		...popupHtmlSource.matchAll(/<option value="([^"]+)"/g),
	]
		.map((match) => match[1])
		.filter((value) => value !== "auto")
		.sort();
	const translationLanguages = Object.keys(translations).sort();
	if (
		JSON.stringify(popupLanguageOptions) !==
		JSON.stringify(translationLanguages)
	) {
		throw new Error(
			"Popup language selector options are out of sync with translations",
		);
	}
	if (
		JSON.stringify(localeDirectories) !== JSON.stringify(translationLanguages)
	) {
		throw new Error(
			"_locales directories are out of sync with popup translations",
		);
	}
	if (
		manifest.default_locale &&
		!translationLanguages.includes(manifest.default_locale)
	) {
		throw new Error(
			`Manifest default_locale is missing from popup translations: ${manifest.default_locale}`,
		);
	}
	if (
		!readmeSource.includes(`${translationLanguages.length} languages supported`)
	) {
		throw new Error(
			`README language count is out of sync with ${translationLanguages.length} supported locales`,
		);
	}
	if (
		!readmeSource.includes(`**${popupAchievements.length} Achievement Badges**`)
	) {
		throw new Error(
			`README achievement count is out of sync with ${popupAchievements.length} configured achievements`,
		);
	}

	const sharedReservedRoutesLiteral = extractLiteral(
		parserSource,
		"const _RESERVED_ROUTE_SEGMENTS = new Set([",
		"[",
		"]",
	);
	if (!sharedReservedRoutesLiteral) {
		throw new Error("Shared reserved route list is missing from parser.js");
	}
	if (
		initSource.includes("const reserved = new Set([") ||
		hooksSource.includes("const reserved = new Set([")
	) {
		throw new Error(
			"Reserved route lists must be sourced from the shared parser helper",
		);
	}
	if (!hooksSource.includes("_getPlaybackContextFromUrl(window.location.href)")) {
		throw new Error(
			"Hooks must resolve route context through _getPlaybackContextFromUrl",
		);
	}

	const injectedHelpers = new Set(
		[...hooksSource.matchAll(/\$\{(_[A-Za-z0-9]+)\.toString\(\)\}/g)].map(
			(match) => match[1],
		),
	);
	for (const requiredParserSnippet of [
		'Resolution: String(attrs.RESOLUTION || "0x0")',
		"FrameRate: Number.isFinite(frameRate) ? frameRate : 0",
		"Bandwidth: Number.isFinite(bandwidth) ? Math.max(0, bandwidth) : 0",
		'Codecs: String(attrs.CODECS || "")',
		'Name: String(attrs.VIDEO || "")',
	]) {
		if (!parserSource.includes(requiredParserSnippet)) {
			throw new Error(
				`Missing normalized parser metadata snippet: ${requiredParserSnippet}`,
			);
		}
	}
	if (!hooksSource.includes("eval(wasmSource);")) {
		throw new Error(
			"Firefox hooks.js must eval the synchronously fetched worker source",
		);
	}
	if (!hooksSource.includes("const wasmSource = _getWasmJs(")) {
		throw new Error(
			"Firefox hooks.js must hydrate worker source via _getWasmJs(...)",
		);
	}
	if (!workerSource.includes("new XMLHttpRequest()")) {
		throw new Error(
			"Firefox worker bootstrap must retain synchronous XMLHttpRequest loading",
		);
	}
	for (const forbidden of [
		"ttvReloadAfterAdsEnabled",
		"ReloadPlayerAfterAd",
		"ttvab-reload-after-ads-toggle",
		"RejectedBackupPlayerTypes",
		"LastPlaylistUrl",
		"AdCycleStartedAt",
		"UpdateClientId",
		"_incrementPopupsBlocked",
		"_initCrashMonitor",
		"firstBlockedAt",
		"lastBlockedAt",
		"ClientID:",
	]) {
		if (
			popupSource.includes(forbidden) ||
			bridgeSource.includes(forbidden) ||
			initSource.includes(forbidden) ||
			processorSource.includes(forbidden)
		) {
			throw new Error(
				`Removed reload-after-ads feature residue found: ${forbidden}`,
			);
		}
	}

	const requiredInjectedPairs = [
		{
			consumer: "_processM3U8",
			helper: "_playlistHasMediaSegments",
			source: processorSource,
		},
		{
			consumer: "_findBackupStream",
			helper: "_getFallbackPromotionPolicy",
			source: processorSource,
		},
		{
			consumer: "_getToken",
			helper: "_extractPlaybackAccessToken",
			source: apiSource,
		},
		{
			consumer: "_getToken",
			helper: "_fetchViaWorkerBridge",
			source: apiSource,
		},
		{
			consumer: "_fetchViaWorkerBridge",
			helper: "_isWorkerContext",
			source: apiSource,
		},
		{
			consumer: "_fetchViaWorkerBridge",
			helper: "_createFetchRelayResponse",
			source: apiSource,
		},
		{
			consumer: "_fetchViaWorkerBridge",
			helper: "_postWorkerBridgeMessage",
			source: apiSource,
		},
		{
			consumer: "_extractPlaybackAccessToken",
			helper: "_collectPlaybackAccessTokenSources",
			source: apiSource,
		},
		{
			consumer: "_extractPlaybackAccessToken",
			helper: "_summarizePlaybackAccessTokenPayload",
			source: apiSource,
		},
		{
			consumer: "_extractPlaybackAccessToken",
			helper: "_getPlaybackAccessTokenErrors",
			source: apiSource,
		},
		{
			consumer: "_incrementAdsBlocked",
			helper: "_postWorkerBridgeMessage",
			source: stateSource,
		},
		{
			consumer: "_postWorkerBridgeMessage",
			helper: "_createWorkerBridgeMessage",
			source: stateSource,
		},
	];
	for (const { consumer, helper, source } of requiredInjectedPairs) {
		const consumerBody = extractLiteral(
			source,
			`function ${consumer}(`,
			"{",
			"}",
		);
		if (consumerBody?.includes(helper) && !injectedHelpers.has(helper)) {
			throw new Error(
				`${consumer} depends on ${helper}, but ${helper} is not injected into the worker bundle`,
			);
		}
	}

	const requiredTranslationKeys = [
		"adBlocking",
		"descriptionText",
		"changesInstantly",
		"achievements",
		"next",
		"allUnlocked",
		"noDataYet",
		"avgPerDay",
		"autoLanguage",
		"repoLinkLabel",
		"authorLinkLabel",
		"versionLabel",
	];
	for (const [lang, locale] of Object.entries(translations)) {
		for (const key of requiredTranslationKeys) {
			if (!(key in locale)) {
				throw new Error(`Missing translation key ${key} for locale ${lang}`);
			}
		}
		for (const achievementId of popupIds) {
			if (!locale.achievementsMap?.[achievementId]) {
				throw new Error(
					`Missing achievement translation ${achievementId} for locale ${lang}`,
				);
			}
		}
	}
}

function minifyCode(code) {
	let result = code;
	const leadingCommentBlock = result.match(/^(?:\/\/.*\r?\n)+/)?.[0] || "";
	result = result.slice(leadingCommentBlock.length);

	for (const [original, minified] of Object.entries(MINIFY_MAP)) {
		result = result.replace(new RegExp(`\\b${original}\\b`, "g"), minified);
	}

	result = result.replace(/\/\*\*[\s\S]*?\*\//g, (match, offset) => {
		return offset < 50 ? match : "";
	});

	result = result.replace(/^\s*\/\/.*$/gm, "");
	result = result.replace(/\n\s*\n\s*\n/g, "\n\n");
	result = `${leadingCommentBlock}${result}`;

	return result;
}

function compileTypeScriptSources() {
	console.log("Compiling TypeScript...\n");
	const tscBinPath = require.resolve("typescript/bin/tsc");
	fs.rmSync(DIST_DIR, { recursive: true, force: true });

	for (const configPath of RUNTIME_TSCONFIGS) {
		execFileSync(process.execPath, [tscBinPath, "-p", configPath], {
			cwd: SOURCE_ROOT,
			stdio: "inherit",
		});
		console.log(`  OK ${configPath}`);
	}

	console.log("");
}

function createZipArchive(sourceDir, outputFile) {
	const entries = fs.readdirSync(sourceDir);
	if (entries.length === 0) {
		throw new Error(`Cannot package empty directory: ${sourceDir}`);
	}

	try {
		execFileSync("zip", ["-qr", outputFile, ...entries], {
			cwd: sourceDir,
			stdio: "inherit",
		});
		return;
	} catch (error) {
		if (error?.code !== "ENOENT") {
			throw error;
		}
	}

	const pythonScript = `
import os
import sys
import zipfile

source_dir = sys.argv[1]
output_file = sys.argv[2]

with zipfile.ZipFile(output_file, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for root, dirnames, filenames in os.walk(source_dir):
        dirnames.sort()
        filenames.sort()
        for filename in filenames:
            file_path = os.path.join(root, filename)
            arcname = os.path.relpath(file_path, source_dir).replace(os.sep, "/")
            archive.write(file_path, arcname)
`.trim();

	let lastError = null;
	for (const [pythonCommand, prefixArgs] of [
		["python", []],
		["python3", []],
		["py", ["-3"]],
	]) {
		try {
			execFileSync(
				pythonCommand,
				[...prefixArgs, "-c", pythonScript, sourceDir, outputFile],
				{ stdio: "inherit" },
			);
			return;
		} catch (error) {
			if (error?.code === "ENOENT") {
				lastError = error;
				continue;
			}
			throw error;
		}
	}

	throw new Error(
		`Could not find a ZIP writer. Install 'zip' or a Python runtime. Last error: ${lastError?.message || "none"}`,
	);
}

function packageFirefox(version) {
	const stageDir = path.join(DIST_DIR, "firefox-package");
	const outputFile = path.join(DIST_DIR, `TTV-AB-v${version}-firefox.xpi`);
	const zipOutputFile = path.join(DIST_DIR, `TTV-AB-v${version}-firefox.zip`);
	const includedPaths = [
		...STATIC_ROOT_FILES,
		...STATIC_ROOT_DIRECTORIES,
		"src",
	];

	fs.rmSync(stageDir, { recursive: true, force: true });
	fs.rmSync(outputFile, { force: true });
	fs.rmSync(zipOutputFile, { force: true });
	fs.mkdirSync(stageDir, { recursive: true });

	for (const relativePath of includedPaths) {
		const sourcePath = path.join(DIST_DIR, relativePath);
		const targetPath = path.join(stageDir, relativePath);
		const stat = fs.statSync(sourcePath);
		if (stat.isDirectory()) {
			fs.cpSync(sourcePath, targetPath, { recursive: true });
		} else {
			fs.mkdirSync(path.dirname(targetPath), { recursive: true });
			fs.copyFileSync(sourcePath, targetPath);
		}
	}

	createZipArchive(stageDir, zipOutputFile);
	fs.copyFileSync(zipOutputFile, outputFile);

	console.log(`  ZIP: ${path.relative(SOURCE_ROOT, zipOutputFile)}`);
	console.log(`  XPI: ${path.relative(SOURCE_ROOT, outputFile)}`);
}

function packageFirefoxSource(version) {
	const stageDir = path.join(DIST_DIR, "firefox-source-package");
	const outputFile = path.join(
		DIST_DIR,
		`TTV-AB-v${version}-firefox-source.zip`,
	);
	const includedPaths = [
		".gitignore",
		"biome.json",
		"build.ts",
		"CHANGELOG.md",
		"knip.json",
		"LICENSE",
		"manifest.json",
		"package-lock.json",
		"package.json",
		"PRIVACY.md",
		"README.md",
		"_locales",
		"assets",
		path.join("src", "modules"),
		path.join("src", "popup"),
		path.join("src", "scripts", "background.ts"),
		path.join("src", "scripts", "bridge.ts"),
		path.join("src", "types"),
		"tsconfig.base.json",
		"tsconfig.build.json",
		"tsconfig.json",
		"tsconfig.modules.json",
		"tsconfig.runtime.json",
	];

	fs.rmSync(stageDir, { recursive: true, force: true });
	fs.rmSync(outputFile, { force: true });
	fs.mkdirSync(stageDir, { recursive: true });

	for (const relativePath of includedPaths) {
		const sourcePath = path.join(SOURCE_ROOT, relativePath);
		const targetPath = path.join(stageDir, relativePath);
		const stat = fs.statSync(sourcePath);
		if (stat.isDirectory()) {
			fs.cpSync(sourcePath, targetPath, { recursive: true });
		} else {
			fs.mkdirSync(path.dirname(targetPath), { recursive: true });
			fs.copyFileSync(sourcePath, targetPath);
		}
	}

	createZipArchive(stageDir, outputFile);

	console.log(`  Source ZIP: ${path.relative(SOURCE_ROOT, outputFile)}`);
}

function build() {
	console.log("Building TTV AB...\n");

	try {
		compileTypeScriptSources();
		prepareDistStaticFiles();
		syncPopupHtmlFallbacks();
		const version = getVersion();
		const shouldPackageFirefox = process.argv.includes("--firefox-package");
		const shouldPackageFirefoxSource = process.argv.includes(
			"--firefox-source-package",
		);

		const HEADER = `// TTV AB v${version} - Twitch Ad Blocker
// Built file: src/scripts/content.js
(function(){
'use strict';
`;

		const FOOTER = `
_$in();
})();`;

		let content = HEADER;
		let moduleCount = 0;

		for (const mod of MODULE_ORDER) {
			const modPath = path.join(MODULES_DIR, mod);
			if (fs.existsSync(modPath)) {
				let modContent = fs.readFileSync(modPath, "utf8");
				modContent = modContent.replace(/^\/\*\*[\s\S]*?\*\/\n/m, "");
				content += `${modContent}\n`;
				moduleCount++;
				console.log(`  OK ${mod}`);
			} else {
				throw new Error(`Critical: Missing module ${mod}`);
			}
		}

		content += FOOTER;

		console.log("\nMinifying...");
		content = minifyCode(content).trimStart();

		fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
		fs.writeFileSync(OUTPUT_FILE, content);
		validateSharedDefinitions();
		fs.rmSync(path.join(DIST_DIR, "src", "modules"), {
			recursive: true,
			force: true,
		});

		const stats = fs.statSync(OUTPUT_FILE);
		const buildTime = new Date().toLocaleTimeString();

		console.log(`\nBuild complete at ${buildTime}`);
		console.log(`  Version: ${version}`);
		console.log(`  Modules: ${moduleCount}`);
		console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB`);

		if (shouldPackageFirefox) {
			packageFirefox(version);
		}
		if (shouldPackageFirefoxSource) {
			packageFirefoxSource(version);
		}
	} catch (err) {
		console.error("\nBuild failed:");
		console.error(`  ${err.message}`);
		process.exit(1);
	}
}

build();
