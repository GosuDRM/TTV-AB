#!/usr/bin/env node
/**
 * TTV AB - Build Script
 * Concatenates modules into a single content script
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

const HEADER = `/**
 * TTV AB - Content Script
 * Blocks ads on Twitch.tv live streams by intercepting
 * HLS playlists and stripping ad segments.
 * 
 * @author GosuDRM
 * @version 3.0.2
 * @license MIT
 * @see https://github.com/GosuDRM/TTV-AB
 * @generated DO NOT EDIT - Built from src/modules/
 */
(function() {
    'use strict';

`;

const FOOTER = `
    // Initialize
    _init();
})();
`;

function build() {
    console.log('🔨 Building TTV AB...');

    let content = HEADER;

    for (const mod of MODULE_ORDER) {
        const modPath = path.join(MODULES_DIR, mod);
        if (fs.existsSync(modPath)) {
            const modContent = fs.readFileSync(modPath, 'utf8');
            // Indent module content
            const indented = modContent.split('\n').map(line => '    ' + line).join('\n');
            content += `    // ═══════════════════════════════════════════════════\n`;
            content += `    // MODULE: ${mod.replace('.js', '').toUpperCase()}\n`;
            content += `    // ═══════════════════════════════════════════════════\n\n`;
            content += indented + '\n\n';
            console.log(`  ✓ ${mod}`);
        } else {
            console.error(`  ✗ Missing: ${mod}`);
        }
    }

    content += FOOTER;

    fs.writeFileSync(OUTPUT_FILE, content);
    console.log(`\n✅ Built to ${OUTPUT_FILE}`);
    console.log(`   Size: ${(content.length / 1024).toFixed(2)} KB`);
}

build();
