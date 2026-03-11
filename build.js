// TTV AB - Build Script
const fs = require("node:fs");
const path = require("node:path");

const MODULES_DIR = path.join(__dirname, "src", "modules");
const OUTPUT_FILE = path.join(__dirname, "src", "scripts", "content.js");

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
	"monitor.js",
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
	_getStreamUrl: "_$su",
	_getToken: "_$tk",
	_processM3U8: "_$pm",
	_findBackupStream: "_$fb",
	_getWasmJs: "_$wj",
	_hookWorkerFetch: "_$wf",
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
	_blockAntiAdblockPopup: "_$bp",
	_initCrashMonitor: "_$cm",
	_bootstrap: "_$bs",
	_initToggleListener: "_$tl",
	_init: "_$in",
	_ATTR_REGEX: "_$ar",
	_REMINDER_KEY: "_$rk",
	_REMINDER_INTERVAL: "_$ri2",
	_FIRST_RUN_KEY: "_$fr",
	_ACHIEVEMENT_INFO: "_$ai",
	_GQL_URL: "_$gu",
	_scanAndRemove: "_$sr",
	_scheduleIdleScan: "_$is",
	_initPopupBlocker: "_$ipb",
	_pruneStreamInfos: "_$ps",
	_PlayerBufferState: "_$pbs",
	_cachedPlayerRef: "_$cpr",
	_getPlayerCore: "_$gpc",
	_findReactRoot: "_$rr",
	_findReactNode: "_$rn",
	_getPlayerAndState: "_$gps",
	_doPlayerTask: "_$dpt",
	_monitorPlayerBuffering: "_$mpb",
	_hookVisibilityState: "_$hvs",
	_hookLocalStoragePreservation: "_$hlp",
	_hasPlaylistAdMarkers: "_$hpa",
	_syncStreamInfo: "_$si",
	_resetStreamAdState: "_$rsa",
	_getStreamInfoForPlaylist: "_$gsi",
	_getFallbackResolution: "_$gfr",
	_hasExplicitAdMetadata: "_$hem",
	_isKnownAdSegmentUrl: "_$kas",
	_playlistHasKnownAdSegments: "_$pka",
};

function getVersion() {
	const constantsPath = path.join(MODULES_DIR, "constants.js");
	const content = fs.readFileSync(constantsPath, "utf8");
	const match = content.match(/VERSION:\s*['"]([^'"]+)['"]/);
	if (match) return match[1];

	try {
		const packageJson = JSON.parse(
			fs.readFileSync(path.join(__dirname, "package.json"), "utf8"),
		);
		return packageJson.version || "0.0.0";
	} catch {
		return "0.0.0";
	}
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

function validateSharedDefinitions() {
	const popupPath = path.join(__dirname, "src", "popup", "popup.js");
	const bridgePath = path.join(__dirname, "src", "scripts", "bridge.js");
	const uiPath = path.join(__dirname, "src", "modules", "ui.js");
	const translationsPath = path.join(
		__dirname,
		"src",
		"popup",
		"translations.js",
	);
	const hooksPath = path.join(__dirname, "src", "modules", "hooks.js");
	const processorPath = path.join(__dirname, "src", "modules", "processor.js");
	const apiPath = path.join(__dirname, "src", "modules", "api.js");
	const popupSource = fs.readFileSync(popupPath, "utf8");
	const bridgeSource = fs.readFileSync(bridgePath, "utf8");
	const uiSource = fs.readFileSync(uiPath, "utf8");
	const translationsSource = fs.readFileSync(translationsPath, "utf8");
	const hooksSource = fs.readFileSync(hooksPath, "utf8");
	const processorSource = fs.readFileSync(processorPath, "utf8");
	const apiSource = fs.readFileSync(apiPath, "utf8");

	const bridgeGetDateKeyLiteral = extractLiteral(
		bridgeSource,
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
	const bridgeAvgAdDurationMatch = bridgeSource.match(
		/const AVG_AD_DURATION = (\d+);/,
	);
	const popupAchievementsLiteral = extractLiteral(
		popupSource,
		"const ACHIEVEMENTS =",
		"[",
		"]",
	);
	const bridgeAchievementsLiteral = extractLiteral(
		bridgeSource,
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
		!bridgeGetDateKeyLiteral ||
		!popupGetDateKeyLiteral ||
		!popupAvgAdDurationMatch ||
		!bridgeAvgAdDurationMatch ||
		!popupAchievementsLiteral ||
		!bridgeAchievementsLiteral ||
		!uiAchievementInfoLiteral
	) {
		throw new Error("Failed to parse shared popup/bridge definitions");
	}

	if (
		normalizeCodeSnippet(popupGetDateKeyLiteral) !==
		normalizeCodeSnippet(bridgeGetDateKeyLiteral)
	) {
		throw new Error(
			"Popup and bridge getDateKey implementations are out of sync",
		);
	}

	const popupAvgAdDuration = Number.parseInt(popupAvgAdDurationMatch[1], 10);
	const bridgeAvgAdDuration = Number.parseInt(bridgeAvgAdDurationMatch[1], 10);
	if (popupAvgAdDuration !== bridgeAvgAdDuration) {
		throw new Error("Popup and bridge AVG_AD_DURATION are out of sync");
	}

	const popupAchievements = Function(`return (${popupAchievementsLiteral});`)();
	const bridgeAchievements = Function(
		`return (${bridgeAchievementsLiteral});`,
	)();
	const uiAchievementInfo = Function(`return (${uiAchievementInfoLiteral});`)();
	const translations = Function(
		`${translationsSource}; return TRANSLATIONS;`,
	)();

	const popupComparable = popupAchievements.map(({ id, threshold, type }) => ({
		id,
		threshold,
		type,
	}));
	const bridgeComparable = bridgeAchievements.map(
		({ id, threshold, type }) => ({
			id,
			threshold,
			type,
		}),
	);

	if (JSON.stringify(popupComparable) !== JSON.stringify(bridgeComparable)) {
		throw new Error("Popup and bridge achievement definitions are out of sync");
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

	const injectedHelpers = new Set(
		[...hooksSource.matchAll(/\$\{(_[A-Za-z0-9]+)\.toString\(\)\}/g)].map(
			(match) => match[1],
		),
	);
	const requiredInjectedPairs = [
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
		"domAdsBlocked",
		"descriptionText",
		"changesInstantly",
		"achievements",
		"next",
		"allUnlocked",
		"noDataYet",
		"avgPerDay",
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

function build() {
	console.log("Building TTV AB...\n");

	validateSharedDefinitions();
	const version = getVersion();

	const HEADER = `// TTV AB v${version} - Twitch Ad Blocker
// Built file: src/scripts/content.js
(function(){
'use strict';
`;

	const FOOTER = `
_$in();
})();`;

	try {
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

		fs.writeFileSync(OUTPUT_FILE, content);

		const stats = fs.statSync(OUTPUT_FILE);
		const buildTime = new Date().toLocaleTimeString();

		console.log(`\nBuild complete at ${buildTime}`);
		console.log(`  Version: ${version}`);
		console.log(`  Modules: ${moduleCount}`);
		console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB`);
	} catch (err) {
		console.error("\nBuild failed:");
		console.error(`  ${err.message}`);
		process.exit(1);
	}
}

build();
