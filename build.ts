// TTV AB - Build Script

import ts from "typescript";
import {
	buildWorkerBundle,
	embedWorkerBundle,
	minifyJavaScript,
} from "./tools/build-worker";

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
const DIST_STATIC_FILES = ["manifest.json", "LICENSE", "PRIVACY.md"];
const DIST_STATIC_DIRECTORIES = ["assets/icons", "_locales"];
const SOURCE_ARCHIVE_ENTRIES = [
	"manifest.json",
	"CHANGELOG.md",
	"LICENSE",
	"PRIVACY.md",
	"README.md",
	"assets",
	"_locales",
	"src",
	"tests",
	"tools",
	"package.json",
	"package-lock.json",
	"tsconfig.json",
	"tsconfig.base.json",
	"tsconfig.build.json",
	"tsconfig.modules.json",
	"tsconfig.runtime.json",
	"build.ts",
	"biome.json",
	"vitest.config.mts",
	"knip.json",
	".gitignore",
	".editorconfig",
];
const UNBUNDLED_MODULES = ["worker-entry.js", "playback-worker.js"];
const PAGE_SCRIPT_PATHS = [
	"src/scripts/bridge.js",
	"src/scripts/background.js",
	"src/popup/popup.js",
];
const ALLOWED_MANIFEST_KEYS = [
	"action",
	"background",
	"browser_specific_settings",
	"content_scripts",
	"default_locale",
	"description",
	"homepage_url",
	"host_permissions",
	"icons",
	"manifest_version",
	"minimum_chrome_version",
	"name",
	"permissions",
	"short_name",
	"version",
];
const GECKO_ID = "{71e91189-9cd2-4e46-895d-bcc38f0053c4}";
const MIN_FIREFOX_MAIN_WORLD_VERSION = 128;
const MAX_LOCALE_NAME_LENGTH = 75;
const MAX_LOCALE_DESCRIPTION_LENGTH = 132;
const RELEASE_DATE_PATTERN = "\\d{4}-\\d{2}-\\d{2}";
const REQUIRED_POPUP_IDS = [
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
];
const PYTHON =
	process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

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

function readVersionSources() {
	const constantsPath = path.join(MODULES_DIR, "constants.js");
	const constantsContent = fs.readFileSync(constantsPath, "utf8");
	const constantsMatch = constantsContent.match(
		/\bVERSION:\s*['"]([^'"]+)['"]/,
	);
	const internalMatch = constantsContent.match(/INTERNAL_VERSION:\s*(\d+)/);
	const packageVersion = readPackageVersion();
	const manifestVersion =
		JSON.parse(fs.readFileSync(path.join(SOURCE_ROOT, "manifest.json"), "utf8"))
			.version || "0.0.0";

	return {
		constantsVersion: constantsMatch?.[1] || null,
		internalVersion: internalMatch ? Number(internalMatch[1]) : null,
		packageVersion,
		manifestVersion,
	};
}

function readPackageVersion() {
	return (
		JSON.parse(fs.readFileSync(path.join(SOURCE_ROOT, "package.json"), "utf8"))
			.version || "0.0.0"
	);
}

function getPackageOutputs(version) {
	return [
		path.join(SOURCE_ROOT, `ttv-ab-${version}-chrome-store.zip`),
		path.join(SOURCE_ROOT, `ttv-ab-${version}.xpi`),
		path.join(SOURCE_ROOT, `ttv-ab-${version}-source.zip`),
	];
}

function deriveInternalVersion(version) {
	const parts = String(version || "").match(/^(\d+)\.(\d+)\.(\d+)$/);
	if (!parts) return null;
	return Number(parts[1]) * 10000 + Number(parts[2]) * 100 + Number(parts[3]);
}

function getVersion() {
	const { constantsVersion, packageVersion } = readVersionSources();
	return constantsVersion || packageVersion || "0.0.0";
}

function findDeclarationText(source, name) {
	const sourceFile = ts.createSourceFile(
		"source.js",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);
	let text = null;
	const visit = (node) => {
		if (text !== null) return;
		if (
			ts.isFunctionDeclaration(node) &&
			node.name?.text === name &&
			node.body
		) {
			text = node.body.getText(sourceFile);
			return;
		}
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === name &&
			node.initializer
		) {
			text = node.initializer.getText(sourceFile);
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return text;
}

function normalizeCodeSnippet(code) {
	return String(code || "")
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
	for (const relativePath of DIST_STATIC_FILES) {
		copyFileToDist(relativePath);
	}
	for (const relativePath of DIST_STATIC_DIRECTORIES) {
		copyDirectoryToDist(relativePath);
	}
}

function loadPopupTranslations(): Record<string, TranslationLocale> {
	const translationsSource = fs.readFileSync(
		path.join(DIST_DIR, "src", "popup", "translations.js"),
		"utf8",
	);
	return Function(`${translationsSource}; return TRANSLATIONS;`)();
}

function assertModulesBundled() {
	const unbundled = fs
		.readdirSync(MODULES_DIR)
		.filter(
			(file) =>
				file.endsWith(".js") &&
				!MODULE_ORDER.includes(file) &&
				!UNBUNDLED_MODULES.includes(file),
		);
	if (unbundled.length > 0) {
		throw new Error(
			`Compiled modules missing from MODULE_ORDER: ${unbundled.join(", ")}`,
		);
	}
}

function getReleaseSection(source, headingPrefix) {
	const start = source.indexOf(headingPrefix);
	if (start === -1) return "";
	const next = source.indexOf(headingPrefix, start + headingPrefix.length);
	return source.slice(start, next === -1 ? source.length : next);
}

function findDisallowedReleaseWording(text) {
	if (text.includes("\u2014")) return "em dash";
	if (/picture/i.test(text.replace(/picture-(?:in|by)-picture/gi, ""))) {
		return '"picture" for the video';
	}
	return null;
}

function findUnsafeHtmlSinks(source) {
	const sinks = [];
	for (const match of source.matchAll(
		/\b(outerHTML\s*\+?=|insertAdjacentHTML\s*\(|document\.write(?:ln)?\s*\()/g,
	)) {
		sinks.push(match[1]);
	}
	for (const match of source.matchAll(/\binnerHTML\s*(\+?=)(?!=)\s*/g)) {
		const valueStart = match.index + match[0].length;
		const valueEnd =
			source[valueStart] === "`" ? source.indexOf("`", valueStart + 1) : -1;
		const value = valueEnd === -1 ? "" : source.slice(valueStart, valueEnd);
		if (match[1] !== "=" || valueEnd === -1 || value.includes("${")) {
			sinks.push(
				`innerHTML ${match[1]} ${source.slice(valueStart, valueStart + 40)}`,
			);
		}
	}
	return sinks;
}

function findMissingPopupReferences(popupHtmlSource) {
	const popupDir = path.join(DIST_DIR, "src", "popup");
	const references = [
		...popupHtmlSource.matchAll(/\b(?:src|href)="([^"]+)"/g),
		...popupHtmlSource.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g),
	].map((match) => match[1].trim());
	return references.filter(
		(reference) =>
			!/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(reference) &&
			!fs.existsSync(path.resolve(popupDir, reference.split(/[?#]/)[0])),
	);
}

function syncPopupHtmlFallbacks() {
	const popupHtmlPath = path.join(SOURCE_ROOT, "src", "popup", "popup.html");
	const outputPopupHtmlPath = path.join(DIST_DIR, "src", "popup", "popup.html");
	const popupHtmlSource = fs.readFileSync(popupHtmlPath, "utf8");
	const english = loadPopupTranslations().en || {};
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
	const chartSectionPattern =
		/ {12}<div class="stats-section">\r?\n {16}<div class="stats-section-title">📈 <span data-i18n="last7Days">[\s\S]*?<\/div>\r?\n {16}<div class="chart-avg" id="chartAvg">[\s\S]*?<\/div>\r?\n {12}<\/div>/;
	if (!chartSectionPattern.test(popupHtmlSource)) {
		throw new Error(
			"Popup weekly chart fallback markup changed; update syncPopupHtmlFallbacks",
		);
	}
	const syncedPopupHtmlSource = popupHtmlSource.replace(
		chartSectionPattern,
		expectedChartSection,
	);
	fs.mkdirSync(path.dirname(outputPopupHtmlPath), { recursive: true });
	fs.writeFileSync(outputPopupHtmlPath, syncedPopupHtmlSource);
}

function validateSharedDefinitions() {
	const { constantsVersion, internalVersion, packageVersion, manifestVersion } =
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
	const unexpectedManifestKeys = Object.keys(manifest).filter(
		(key) => !ALLOWED_MANIFEST_KEYS.includes(key),
	);
	if (unexpectedManifestKeys.length > 0) {
		throw new Error(
			`Manifest has unreviewed keys: ${unexpectedManifestKeys.join(", ")}`,
		);
	}
	const gecko = manifest.browser_specific_settings?.gecko;
	if (gecko?.id !== GECKO_ID) {
		throw new Error(
			`Manifest gecko id must stay ${GECKO_ID} so Firefox users keep receiving updates: ${gecko?.id || "missing"}`,
		);
	}
	if (
		!(
			Number.parseInt(gecko.strict_min_version, 10) >=
			MIN_FIREFOX_MAIN_WORLD_VERSION
		)
	) {
		throw new Error(
			`Manifest gecko strict_min_version must be at least ${MIN_FIREFOX_MAIN_WORLD_VERSION} for MAIN-world content scripts: ${gecko.strict_min_version || "missing"}`,
		);
	}
	if (!Array.isArray(gecko.data_collection_permissions?.required)) {
		throw new Error(
			"Manifest gecko data_collection_permissions.required must be declared",
		);
	}
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
	const backgroundScript =
		manifest.background?.service_worker ||
		manifest.background?.scripts?.[0] ||
		null;
	if (backgroundScript !== "src/scripts/background.js") {
		throw new Error(
			`Manifest background script must remain src/scripts/background.js: ${backgroundScript || "missing"}`,
		);
	}
	if (!fs.existsSync(path.join(DIST_DIR, backgroundScript))) {
		throw new Error(
			`Manifest background script is missing: ${backgroundScript}`,
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
			all_frames: true,
		},
		{
			matches: ["*://*.twitch.tv/*"],
			js: ["src/scripts/bridge.js"],
			run_at: "document_start",
			world: "ISOLATED",
			all_frames: true,
		},
	];
	const canonicalJson = (value) =>
		JSON.stringify(value, (_key, nested) =>
			nested && typeof nested === "object" && !Array.isArray(nested)
				? Object.fromEntries(
						Object.entries(nested).sort(([a], [b]) => a.localeCompare(b)),
					)
				: nested,
		);
	if (
		canonicalJson(manifest.content_scripts || []) !==
		canonicalJson(expectedContentScripts)
	) {
		throw new Error(
			`Manifest content_scripts drift detected: ${JSON.stringify(manifest.content_scripts || [])}`,
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
	const expectedInternalVersion = deriveInternalVersion(constantsVersion);
	if (!expectedInternalVersion || internalVersion !== expectedInternalVersion) {
		throw new Error(
			`INTERNAL_VERSION must be derived from VERSION (${constantsVersion} -> ${expectedInternalVersion || "underivable"}); constants has ${internalVersion ?? "missing"}`,
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
	if (packageJson.license !== "SEE LICENSE IN LICENSE") {
		throw new Error(
			`package license must reference LICENSE: ${packageJson.license || "missing"}`,
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
	const trackedPopupPath = path.join(SOURCE_ROOT, "src", "popup", "popup.js");
	const bridgePath = path.join(DIST_DIR, "src", "scripts", "bridge.js");
	const backgroundPath = path.join(DIST_DIR, "src", "scripts", "background.js");
	const uiPath = path.join(DIST_DIR, "src", "modules", "ui.js");
	const translationsPath = path.join(
		DIST_DIR,
		"src",
		"popup",
		"translations.js",
	);
	const trackedTranslationsPath = path.join(
		SOURCE_ROOT,
		"src",
		"popup",
		"translations.js",
	);
	const translationsTsPath = path.join(
		SOURCE_ROOT,
		"src",
		"popup",
		"translations.ts",
	);
	const initPath = path.join(DIST_DIR, "src", "modules", "init.js");
	const hooksPath = path.join(DIST_DIR, "src", "modules", "hooks.js");
	const statePath = path.join(DIST_DIR, "src", "modules", "state.js");
	const workerPath = path.join(DIST_DIR, "src", "modules", "worker.js");
	const processorPath = path.join(DIST_DIR, "src", "modules", "processor.js");
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
		if (
			messages.extName.message.length > MAX_LOCALE_NAME_LENGTH ||
			messages.extDesc.message.length > MAX_LOCALE_DESCRIPTION_LENGTH
		) {
			throw new Error(
				`Locale ${localeDir} extName/extDesc exceed the store limits of ${MAX_LOCALE_NAME_LENGTH}/${MAX_LOCALE_DESCRIPTION_LENGTH} characters`,
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
		!readmeSource.includes(`chrome-${constantsVersion}-`)
	) {
		throw new Error(
			`README version badges are out of sync with ${constantsVersion}`,
		);
	}
	const whatsNewStart = readmeSource.indexOf("## 🔔 What's New");
	const whatsNewEnd = readmeSource.indexOf("\n## ", whatsNewStart + 1);
	const readmeWhatsNew =
		whatsNewStart === -1
			? ""
			: readmeSource.slice(
					whatsNewStart,
					whatsNewEnd === -1 ? readmeSource.length : whatsNewEnd,
				);
	const readmeReleaseHeadings = [...readmeWhatsNew.matchAll(/^### v.*$/gm)].map(
		(match) => match[0],
	);
	if (
		readmeReleaseHeadings.length !== 3 ||
		!new RegExp(
			`^### v${constantsVersion.replaceAll(".", "\\.")} - ${RELEASE_DATE_PATTERN}$`,
		).test(readmeReleaseHeadings[0])
	) {
		throw new Error(
			`README What's New must list exactly the three latest releases, starting with ### v${constantsVersion} - YYYY-MM-DD: ${readmeReleaseHeadings.join(" | ") || "none"}`,
		);
	}
	const changelogTopHeading = changelogSource.match(/^## \[.*$/m)?.[0] || "";
	if (
		!new RegExp(
			`^## \\[${constantsVersion.replaceAll(".", "\\.")}\\] - ${RELEASE_DATE_PATTERN}$`,
		).test(changelogTopHeading)
	) {
		throw new Error(
			`CHANGELOG must start with ## [${constantsVersion}] - YYYY-MM-DD: ${changelogTopHeading || "missing"}`,
		);
	}
	for (const [name, text] of [
		["README.md", readmeSource],
		["CHANGELOG.md latest release", getReleaseSection(changelogSource, "## [")],
	]) {
		const wording = findDisallowedReleaseWording(text);
		if (wording) {
			throw new Error(`${name} must not use ${wording}`);
		}
	}
	if (
		!readmeSource.includes("Ads Blocked") ||
		!privacySource.includes("Ads Blocked")
	) {
		throw new Error(
			"README or PRIVACY metric wording is out of sync with Ads Blocked",
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
	const trackedPopupSource = fs.readFileSync(trackedPopupPath, "utf8");
	if (
		normalizeCodeSnippet(trackedPopupSource) !==
		normalizeCodeSnippet(popupSource)
	) {
		throw new Error(
			"Tracked src/popup/popup.js is out of sync with compiled popup.ts output",
		);
	}
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
	const missingPopupReferences = findMissingPopupReferences(popupHtmlSource);
	if (missingPopupReferences.length > 0) {
		throw new Error(
			`Popup HTML references missing files: ${missingPopupReferences.join(", ")}`,
		);
	}
	for (const requiredPopupId of REQUIRED_POPUP_IDS) {
		if (!popupHtmlSource.includes(`id="${requiredPopupId}"`)) {
			throw new Error(`Popup HTML is missing required id: ${requiredPopupId}`);
		}
	}
	const bridgeSource = fs.readFileSync(bridgePath, "utf8");
	const backgroundSource = fs.readFileSync(backgroundPath, "utf8");
	const uiSource = fs.readFileSync(uiPath, "utf8");
	const translationsSource = fs.readFileSync(translationsPath, "utf8");
	const trackedTranslationsSource = fs.readFileSync(
		trackedTranslationsPath,
		"utf8",
	);
	if (
		normalizeCodeSnippet(trackedTranslationsSource) !==
		normalizeCodeSnippet(translationsSource)
	) {
		throw new Error(
			"Tracked src/popup/translations.js is out of sync with compiled translations.ts output",
		);
	}
	const translationsTsSource = fs.readFileSync(translationsTsPath, "utf8");
	const translations = loadPopupTranslations();
	const translationEntries = Object.entries(translations);
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
	const baseTranslations = translations.en || {};
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
		const reportBugLabel = localeTranslations.reportBugLabel;
		if (
			typeof reportBugLabel === "string" &&
			!translationsTsSource.includes(
				`reportBugLabel: ${JSON.stringify(reportBugLabel)}`,
			)
		) {
			throw new Error(
				`Popup translations.ts reportBugLabel is out of sync for ${localeName}`,
			);
		}
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
	const constantsSource = fs.readFileSync(constantsPath, "utf8");
	const reloadAfterAdMatch = constantsSource.match(
		/RELOAD_AFTER_AD:\s*(true|false)/,
	);
	if (reloadAfterAdMatch?.[1] !== "true") {
		throw new Error(
			"RELOAD_AFTER_AD must remain true to keep post-ad player recovery active",
		);
	}

	const backgroundGetDateKeyLiteral = findDeclarationText(
		backgroundSource,
		"getDateKey",
	);
	const popupGetDateKeyLiteral = findDeclarationText(popupSource, "getDateKey");
	const popupAchievementsLiteral = findDeclarationText(
		popupSource,
		"ACHIEVEMENTS",
	);
	const backgroundAchievementsLiteral = findDeclarationText(
		backgroundSource,
		"ACHIEVEMENTS",
	);
	const uiAchievementInfoLiteral = findDeclarationText(
		uiSource,
		"_ACHIEVEMENT_INFO",
	);

	if (
		!backgroundGetDateKeyLiteral ||
		!popupGetDateKeyLiteral ||
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

	const popupAchievements = Function(`return (${popupAchievementsLiteral});`)();
	const backgroundAchievements = Function(
		`return (${backgroundAchievementsLiteral});`,
	)();
	const uiAchievementInfo = Function(`return (${uiAchievementInfoLiteral});`)();

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

	const pageTextLiteral = findDeclarationText(uiSource, "_PAGE_TEXT");
	const pageAchievementTextLiteral = findDeclarationText(
		uiSource,
		"_PAGE_ACHIEVEMENT_TEXT",
	);
	if (!pageTextLiteral || !pageAchievementTextLiteral) {
		throw new Error("ui.js is missing _PAGE_TEXT or _PAGE_ACHIEVEMENT_TEXT");
	}
	const pageText = Function(`return (${pageTextLiteral});`)();
	const pageAchievementText = Function(
		`return (${pageAchievementTextLiteral});`,
	)();
	const popupLanguages = Object.keys(translations).sort();
	for (const [name, table] of [
		["_PAGE_TEXT", pageText],
		["_PAGE_ACHIEVEMENT_TEXT", pageAchievementText],
	]) {
		if (
			JSON.stringify(Object.keys(table).sort()) !==
			JSON.stringify(popupLanguages)
		) {
			throw new Error(
				`ui.js ${name} languages are out of sync with popup translations`,
			);
		}
	}
	const pageTextKeys = Object.keys(pageText.en).sort();
	for (const [language, strings] of Object.entries(pageText)) {
		if (
			JSON.stringify(Object.keys(strings).sort()) !==
			JSON.stringify(pageTextKeys)
		) {
			throw new Error(
				`ui.js _PAGE_TEXT ${language} keys are out of sync with en`,
			);
		}
		for (const key of pageTextKeys) {
			const placeholders = (value) =>
				JSON.stringify(
					[...String(value).matchAll(/\{(\w+)\}/g)]
						.map((match) => match[1])
						.sort(),
				);
			if (placeholders(strings[key]) !== placeholders(pageText.en[key])) {
				throw new Error(
					`ui.js _PAGE_TEXT ${language}.${key} placeholders differ from en`,
				);
			}
		}
		if (
			JSON.stringify(pageAchievementText[language]) !==
			JSON.stringify(translations[language].achievementsMap)
		) {
			throw new Error(
				`ui.js _PAGE_ACHIEVEMENT_TEXT ${language} is out of sync with popup achievement translations`,
			);
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

	const popupNormalizeCount = findDeclarationText(
		popupSource,
		"normalizeCount",
	);
	const popupFormatNumber = findDeclarationText(popupSource, "formatNumber");
	const popupUpdateTimeSaved = findDeclarationText(
		popupSource,
		"updateTimeSaved",
	);
	const backgroundNormalizeCount = findDeclarationText(
		backgroundSource,
		"normalizeCount",
	);
	const stateNormalizeCount = findDeclarationText(
		stateSource,
		"_normalizeCount",
	);
	if (
		!popupNormalizeCount ||
		!popupFormatNumber ||
		!popupUpdateTimeSaved ||
		!backgroundNormalizeCount ||
		!stateNormalizeCount ||
		normalizeCodeSnippet(popupNormalizeCount) !==
			normalizeCodeSnippet(backgroundNormalizeCount) ||
		normalizeCodeSnippet(popupNormalizeCount) !==
			normalizeCodeSnippet(stateNormalizeCount) ||
		!popupFormatNumber.includes("normalizeCount(num)") ||
		!popupUpdateTimeSaved.includes("latestMeasuredMilliseconds")
	) {
		throw new Error(
			"Popup, background, and state counter normalizers are out of sync",
		);
	}

	const pageSideSources = [
		...fs
			.readdirSync(MODULES_DIR)
			.filter((file) => file.endsWith(".js") && file !== "playback-worker.js")
			.map((file) => [
				`src/modules/${file}`,
				fs.readFileSync(path.join(MODULES_DIR, file), "utf8"),
			]),
		...PAGE_SCRIPT_PATHS.map((relativePath) => [
			relativePath,
			fs.readFileSync(path.join(DIST_DIR, relativePath), "utf8"),
		]),
	];
	for (const [name, source] of pageSideSources) {
		for (const match of source.matchAll(/window\.open\(([\s\S]*?)\);/g)) {
			if (
				match[1].includes('"_blank"') &&
				!match[1].includes("noopener,noreferrer")
			) {
				throw new Error(
					`${name} has a window.open call without noopener,noreferrer`,
				);
			}
		}
		const unsafeHtmlSinks = findUnsafeHtmlSinks(source);
		if (unsafeHtmlSinks.length > 0) {
			throw new Error(
				`${name} writes dynamic HTML: ${unsafeHtmlSinks.join(" | ")}`,
			);
		}
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
	const dynamicPopupTitleAttrCount = (popupSource.match(/title="\$\{/g) || [])
		.length;
	if (dynamicPopupTitleAttrCount !== 0) {
		throw new Error(
			`Popup builds ${dynamicPopupTitleAttrCount} title attributes from dynamic HTML`,
		);
	}
	const contentSource = fs.readFileSync(OUTPUT_FILE, "utf8");
	for (const forbidden of [
		/\b(?:chrome|browser)\s*\??\.\s*(?:runtime|storage|tabs|action|i18n|scripting|permissions)\b/,
		/\b(?:chrome|moz)-extension:\/\//,
	]) {
		if (forbidden.test(contentSource)) {
			throw new Error(
				`MAIN-world content.js must not use extension APIs or URLs: ${forbidden}`,
			);
		}
	}
	for (const [name, source] of [
		["popup.js", popupSource],
		["bridge.js", bridgeSource],
		["background.js", backgroundSource],
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
	const requiredElementsLiteral = findDeclarationText(
		popupSource,
		"requiredElements",
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
	for (const requiredPopupId of REQUIRED_POPUP_IDS) {
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
	const langSelectorMatch = popupHtmlSource.match(
		/<select[^>]*id="langSelector"[\s\S]*?<\/select>/,
	);
	if (!langSelectorMatch) {
		throw new Error("Popup is missing the language selector element");
	}
	const popupLanguageOptions = [
		...langSelectorMatch[0].matchAll(/<option value="([^"]+)"/g),
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

	const sharedReservedRoutesLiteral = findDeclarationText(
		parserSource,
		"_RESERVED_ROUTE_SEGMENTS",
	);
	if (!sharedReservedRoutesLiteral?.startsWith("new Set([")) {
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
	if (
		!hooksSource.includes("_getPlaybackContextFromUrl(window.location.href)")
	) {
		throw new Error(
			"Hooks must resolve route context through _getPlaybackContextFromUrl",
		);
	}

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
	if (hooksSource.includes("eval(wasmSource)")) {
		throw new Error(
			"hooks.js must not eval synchronously fetched worker source",
		);
	}
	if (
		!hooksSource.includes(
			"await import(${JSON.stringify(workerSourceUrl)});",
		) ||
		!hooksSource.includes("importScripts(${JSON.stringify(workerSourceUrl)});")
	) {
		throw new Error("Unexpected worker bootstrap loader usage in hooks.js");
	}
	if (workerSource.includes("new XMLHttpRequest()")) {
		throw new Error(
			"worker.js must not use synchronous XMLHttpRequest bootstrap loading",
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

function build() {
	console.log("Building TTV AB...\n");

	try {
		for (const output of getPackageOutputs(readPackageVersion())) {
			fs.rmSync(output, { force: true });
		}
		if (fs.existsSync(path.join(SOURCE_ROOT, "src", "scripts", "content.js"))) {
			throw new Error(
				"src/scripts/content.js must not exist; content.js is generated in dist",
			);
		}
		compileTypeScriptSources();
		assertModulesBundled();
		const workerBundle = buildWorkerBundle(MODULES_DIR, MODULE_ORDER);
		fs.writeFileSync(
			path.join(MODULES_DIR, "playback-worker.js"),
			workerBundle.source,
		);
		const hooksPath = path.join(MODULES_DIR, "hooks.js");
		fs.writeFileSync(
			hooksPath,
			embedWorkerBundle(fs.readFileSync(hooksPath, "utf8"), workerBundle.code),
		);
		prepareDistStaticFiles();
		syncPopupHtmlFallbacks();
		const version = getVersion();

		const HEADER = `// TTV AB v${version} - Twitch Ad Blocker
// Built file: src/scripts/content.js
(function(){
'use strict';
`;

		const FOOTER = `
_init();
})();`;

		let content = HEADER;
		let moduleCount = 0;

		for (const mod of MODULE_ORDER) {
			const modPath = path.join(MODULES_DIR, mod);
			if (fs.existsSync(modPath)) {
				const modContent = fs.readFileSync(modPath, "utf8");
				content += `${modContent}\n`;
				moduleCount++;
				console.log(`  OK ${mod}`);
			} else {
				throw new Error(`Critical: Missing module ${mod}`);
			}
		}

		content += FOOTER;

		console.log("\nMinifying...");
		content = `// TTV AB v${version} - Twitch Ad Blocker\n${minifyJavaScript(content)}`;

		fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
		fs.writeFileSync(OUTPUT_FILE, content);
		validateSharedDefinitions();

		const stats = fs.statSync(OUTPUT_FILE);
		const buildTime = new Date().toLocaleTimeString();

		console.log(`\nBuild complete at ${buildTime}`);
		console.log(`  Version: ${version}`);
		console.log(`  Modules: ${moduleCount}`);
		console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB`);

		console.log("\nPackaging...");
		const manifest = JSON.parse(
			fs.readFileSync(path.join(DIST_DIR, "manifest.json"), "utf8"),
		);
		const isFirefox = Array.isArray(manifest.background?.scripts);
		if (
			isFirefox ===
			(typeof manifest.background?.service_worker === "string")
		) {
			throw new Error("Manifest must identify exactly one browser background");
		}
		const outputs = getPackageOutputs(version);
		const [chromeZip, xpiFile, sourceZip] = outputs;
		for (const output of outputs) fs.rmSync(output, { force: true });
		try {
			execFileSync(PYTHON, ["tools/package_chrome.py"], {
				cwd: SOURCE_ROOT,
				stdio: "inherit",
			});
			if (!fs.existsSync(chromeZip) || fs.statSync(chromeZip).size === 0) {
				throw new Error("Extension packaging did not create an archive");
			}
			if (isFirefox) {
				fs.renameSync(chromeZip, xpiFile);
				console.log(`  Created ${path.basename(xpiFile)}`);
				execFileSync(
					PYTHON,
					[
						"tools/package_source.py",
						path.basename(sourceZip),
						...SOURCE_ARCHIVE_ENTRIES,
					],
					{ cwd: SOURCE_ROOT, stdio: "inherit" },
				);
				if (!fs.existsSync(sourceZip) || fs.statSync(sourceZip).size === 0) {
					throw new Error("Source packaging did not create an archive");
				}
				console.log(`  Created ${path.basename(sourceZip)}`);
			}
		} catch (err) {
			for (const output of outputs) fs.rmSync(output, { force: true });
			throw err;
		}
	} catch (err) {
		console.error("\nBuild failed:");
		console.error(`  ${err.message}`);
		if (err?.name !== "Error" && err?.stack) console.error(err.stack);
		process.exit(1);
	}
}

build();
