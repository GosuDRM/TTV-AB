#!/usr/bin/env node
// TTV AB - Build Script
const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, 'src', 'modules');
const OUTPUT_FILE = path.join(__dirname, 'src', 'scripts', 'content.js');

const MODULE_ORDER = [
    'constants.js',
    'state.js',
    'logger.js',
    'parser.js',
    'api.js',
    'processor.js',
    'worker.js',
    'hooks.js',
    'player.js',
    'ui.js',
    'monitor.js',
    'init.js'
];

const MINIFY_MAP = {
    '_C': '_$c',
    '_S': '_$s',
    '_log': '_$l',
    '_declareState': '_$ds',
    '_incrementAdsBlocked': '_$ab',
    '_parseAttrs': '_$pa',
    '_getServerTime': '_$gt',
    '_replaceServerTime': '_$rt',
    '_stripAds': '_$sa',
    '_getStreamUrl': '_$su',
    '_getToken': '_$tk',
    '_processM3U8': '_$pm',
    '_findBackupStream': '_$fb',
    '_getWasmJs': '_$wj',
    '_hookWorkerFetch': '_$wf',
    '_hookWorker': '_$hw',
    '_hookStorage': '_$hs',
    '_hookMainFetch': '_$mf',
    '_cleanWorker': '_$cw',
    '_getReinsert': '_$gr',
    '_reinsert': '_$ri',
    '_isValid': '_$iv',
    '_showDonation': '_$dn',
    '_showWelcome': '_$wc',
    '_showAchievementUnlocked': '_$au',
    '_initAchievementListener': '_$al',
    '_blockAntiAdblockPopup': '_$bp',
    '_initCrashMonitor': '_$cm',
    '_bootstrap': '_$bs',
    '_initToggleListener': '_$tl',
    '_init': '_$in',
    '_ATTR_REGEX': '_$ar',
    '_REMINDER_KEY': '_$rk',
    '_REMINDER_INTERVAL': '_$ri2',
    '_FIRST_RUN_KEY': '_$fr',
    '_ACHIEVEMENT_INFO': '_$ai',
    '_GQL_URL': '_$gu',
    '_incrementPopupsBlocked': '_$pb',
    '_scanAndRemove': '_$sr',
    '_scheduleIdleScan': '_$is',
    '_initPopupBlocker': '_$ipb',
    '_pruneStreamInfos': '_$ps',
    '_PlayerBufferState': '_$pbs',
    '_cachedPlayerRef': '_$cpr',
    '_findReactRoot': '_$rr',
    '_findReactNode': '_$rn',
    '_getPlayerAndState': '_$gps',
    '_doPlayerTask': '_$dpt',
    '_monitorPlayerBuffering': '_$mpb',
    '_hookVisibilityState': '_$hvs',
    '_hookLocalStoragePreservation': '_$hlp'
};

function getVersion() {
    const constantsPath = path.join(MODULES_DIR, 'constants.js');
    const content = fs.readFileSync(constantsPath, 'utf8');
    const match = content.match(/VERSION:\s*['"]([^'"]+)['"]/);
    return match ? match[1] : '3.0.0';
}

function minifyCode(code) {
    let result = code;
    for (const [original, minified] of Object.entries(MINIFY_MAP)) {
        result = result.replace(new RegExp(`\\b${original}\\b`, 'g'), minified);
    }

    result = result.replace(/\/\*\*[\s\S]*?\*\//g, (match, offset) => {
        return offset < 50 ? match : '';
    });

    result = result.replace(/^\s*\/\/.*$/gm, '');
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n');
    result = result.replace(/\s*\/\/ ═+\n\s*\/\/ MODULE:.*\n\s*\/\/ ═+\n/g, '\n');

    return result;
}

function build() {
    console.log('🔨 Building TTV AB...\n');

    const version = getVersion();

    const HEADER = `// TTV AB v${version} - Twitch Ad Blocker
// https://github.com/GosuDRM/TTV-AB | MIT License
(function(){
'use strict';
`;

    const FOOTER = `
_$in();
})();
`;

    try {
        let content = HEADER;
        let moduleCount = 0;

        for (const mod of MODULE_ORDER) {
            const modPath = path.join(MODULES_DIR, mod);
            if (fs.existsSync(modPath)) {
                let modContent = fs.readFileSync(modPath, 'utf8');
                modContent = modContent.replace(/^\/\*\*[\s\S]*?\*\/\n/m, '');
                content += modContent + '\n';
                moduleCount++;
                console.log(`  ✓ ${mod}`);
            } else {
                throw new Error(`Critical: Missing module ${mod}`);
            }
        }

        content += FOOTER;

        console.log('\n🔧 Minifying...');
        content = minifyCode(content);

        fs.writeFileSync(OUTPUT_FILE, content);

        const stats = fs.statSync(OUTPUT_FILE);
        const buildTime = new Date().toLocaleTimeString();

        console.log(`\n✅ Build complete at ${buildTime}!`);
        console.log(`   Version: ${version}`);
        console.log(`   Modules: ${moduleCount}`);
        console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);

    } catch (err) {
        console.error('\n❌ Build Failed:');
        console.error(`   ${err.message}`);
        process.exit(1);
    }
}

build();
