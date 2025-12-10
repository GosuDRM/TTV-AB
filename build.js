#!/usr/bin/env node
/**
 * TTV AB - Build Script
 * Concatenates modules and assembles manifest from config parts
 */
const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, 'src', 'modules');
const CONFIG_DIR = path.join(__dirname, 'config');
const OUTPUT_FILE = path.join(__dirname, 'src', 'scripts', 'content.js');
const MANIFEST_FILE = path.join(__dirname, 'manifest.json');

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

// Config files to merge into manifest
const CONFIG_FILES = [
    'metadata.json',
    'permissions.json',
    'scripts.json',
    'ui.json'
];

const HEADER = `/**
 * TTV AB - Content Script
 * Blocks ads on Twitch.tv live streams by intercepting
 * HLS playlists and stripping ad segments.
 * 
 * @author GosuDRM
 * @version 3.0.5
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

function buildManifest() {
    console.log('📦 Building manifest.json...');

    // Read version from constants.js
    const constantsPath = path.join(MODULES_DIR, 'constants.js');
    const constantsContent = fs.readFileSync(constantsPath, 'utf8');
    const versionMatch = constantsContent.match(/VERSION:\s*['"]([^'"]+)['"]/);
    const version = versionMatch ? versionMatch[1] : '3.0.0';

    // Base manifest structure
    const manifest = {
        manifest_version: 3,
        version: version
    };

    // Merge config files
    for (const configFile of CONFIG_FILES) {
        const configPath = path.join(CONFIG_DIR, configFile);
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            Object.assign(manifest, config);
            console.log(`  ✓ ${configFile}`);
        } else {
            console.error(`  ✗ Missing: ${configFile}`);
        }
    }

    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 4));
    console.log(`  → manifest.json (v${version})\n`);
}

function buildContent() {
    console.log('🔨 Building content.js...');

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
    console.log(`\n✅ Build complete!`);
    console.log(`   Content: ${(content.length / 1024).toFixed(2)} KB`);
}

// Run build
buildManifest();
buildContent();
