#!/usr/bin/env node
/**
 * TTV AB - Build Script
 * Compiles modules into an optimized, minified content script
 * 
 * @author GosuDRM
 * @license MIT
 */
const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, 'src', 'modules');
const OUTPUT_FILE = path.join(__dirname, 'src', 'scripts', 'content.js');

// Module load order (dependencies first)
const MODULE_ORDER = [
    'constants.js',
    'state.js',
    'logger.js',
    'parser.js',
    'api.js',
    'processor.js',
    'worker.js',
    'hooks.js',
    'ui.js',
    'monitor.js',
    'init.js'
];

// Minification mappings for obfuscation
const MINIFY_MAP = {
    // Constants
    '_C': '_$c',
    '_S': '_$s',
    // Functions (keep some readable for debugging)
    '_log': '_$l',
    '_declareState': '_$ds',
    '_incrementAdsBlocked': '_$ab',
    '_parseAttrs': '_$pa',
    '_getServerTime': '_$gt',
    '_replaceServerTime': '_$rt',
    '_stripAds': '_$sa',
    '_getStreamUrl': '_$su',
    '_gqlReq': '_$gq',
    '_getToken': '_$tk',
    '_processM3U8': '_$pm',
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
    '_initCrashMonitor': '_$cm',
    '_bootstrap': '_$bs',
    '_initToggleListener': '_$tl',
    '_init': '_$in'
};

function getVersion() {
    const constantsPath = path.join(MODULES_DIR, 'constants.js');
    const content = fs.readFileSync(constantsPath, 'utf8');
    const match = content.match(/VERSION:\s*['"]([^'"]+)['"]/);
    return match ? match[1] : '3.0.0';
}

function minifyCode(code) {
    // Apply name replacements
    let result = code;
    for (const [original, minified] of Object.entries(MINIFY_MAP)) {
        result = result.replace(new RegExp(`\\b${original}\\b`, 'g'), minified);
    }

    // Remove multi-line comments (but keep JSDoc for header)
    result = result.replace(/\/\*\*[\s\S]*?\*\//g, (match, offset) => {
        // Keep only the first JSDoc (header)
        return offset < 50 ? match : '';
    });

    // Remove single-line comments
    result = result.replace(/^\s*\/\/.*$/gm, '');

    // Remove empty lines
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n');

    // Remove module separator comments
    result = result.replace(/\s*\/\/ ═+\n\s*\/\/ MODULE:.*\n\s*\/\/ ═+\n/g, '\n');

    return result;
}

function build() {
    console.log('🔨 Building TTV AB...\n');

    const version = getVersion();

    const HEADER = `/**
 * TTV AB v${version}
 * @author GosuDRM
 * @license MIT
 * @see https://github.com/GosuDRM/TTV-AB
 */
(function(){
'use strict';
`;

    const FOOTER = `
_$in();
})();
`;

    let content = HEADER;
    let moduleCount = 0;

    for (const mod of MODULE_ORDER) {
        const modPath = path.join(MODULES_DIR, mod);
        if (fs.existsSync(modPath)) {
            let modContent = fs.readFileSync(modPath, 'utf8');

            // Remove module-level JSDoc comments
            modContent = modContent.replace(/^\/\*\*[\s\S]*?\*\/\n/m, '');

            content += modContent + '\n';
            moduleCount++;
            console.log(`  ✓ ${mod}`);
        } else {
            console.error(`  ✗ Missing: ${mod}`);
        }
    }

    content += FOOTER;

    // Minify
    console.log('\n🔧 Minifying...');
    content = minifyCode(content);

    fs.writeFileSync(OUTPUT_FILE, content);

    const stats = fs.statSync(OUTPUT_FILE);
    console.log(`\n✅ Build complete!`);
    console.log(`   Version: ${version}`);
    console.log(`   Modules: ${moduleCount}`);
    console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
}

build();
