# TTV AB

![Version](https://img.shields.io/badge/version-9.1.0-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Tests](https://github.com/GosuDRM/TTV-AB/actions/workflows/ci.yml/badge.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Firefox](https://img.shields.io/amo/v/ttv-ab-twitch-ad-blocker?label=firefox&color=orange)
![Chrome](https://img.shields.io/badge/chrome-9.0.7-yellow)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks Twitch ads on live streams and VODs while keeping playback stable.

## 📥 Install

| Store | Link | Status |
|-------|------|--------|
| Firefox Add-ons | [TTV AB - Twitch Ad Blocker](https://addons.mozilla.org/en-GB/firefox/addon/ttv-ab-twitch-ad-blocker/) | Active |
| Chrome Web Store | [TTV AB - Lightweight, powerful ad blocker](https://chromewebstore.google.com/detail/ttv-ab-lightweight-powerf/mlifbfmeoafhcccmppaolojdglcbkdkg) | Pending approval |


<p align="center">
  <img src="assets/popup-screenshot.png" alt="Popup Screenshot" width="300">
  <img src="assets/popup-screenshot2.png" alt="Stats Screenshot" width="300">
</p>

## ✨ Features

- ✅ Blocks preroll and midroll ads on live streams and VODs
- ✅ Supports both live playback and Twitch `/videos/<id>` archives
- ✅ Cleans up stale Twitch ad UI after recovery
- ✅ Avoids purple-screen playback interruptions
- ✅ Restores your chosen quality after ad recovery
- ✅ Manifest V3 compatible
- ✅ Simple enable/disable toggle
- ✅ Accessible popup controls and live-updating stats
- ✅ Persistent "Ads Blocked" statistics
- ✅ **Statistics Dashboard** with time saved, weekly charts, and achievements
- ✅ **12 Achievement Badges** to unlock as you block ads
- ✅ **Language Selector** - 11 languages supported (EN, ES, FR, DE, PT, IT, JA, KO, ZH-CN, ZH-TW, RU)
- ✅ Per-channel ad blocking breakdown
- ✅ Modern, animated UI (Cyberpunk/Neon aesthetic)
- ✅ Lightweight and fast

## 🚀 Usage

1. Install the extension from your browser's add-on store
2. Navigate to [twitch.tv](https://twitch.tv) and open any live stream or VOD
3. Ads are blocked automatically — no configuration needed
4. Click the extension icon to view stats, toggle ad blocking on/off, or toggle the Buffer Fix
5. Change language via the dropdown in the popup footer

## ⚙️ How It Works

TTV AB intercepts Twitch's HLS video playlists at the network level. When Twitch injects ad-marked segments or forces the player onto an ad-only path, the extension:

- Strips ad segments from M3U8 media playlists in real time
- Fetches clean backup streams using alternative player types when the native stream is ad-locked
- Serves a valid empty video segment in place of blocked ad content to keep the decoder stable
- Monitors playback health and automatically recovers from stalls after ad breaks
- Restores your original quality and volume settings once native playback resumes

During ad recovery, Twitch may briefly serve a lower-quality backup stream (e.g. 360p) while the extension keeps playback alive. Your chosen quality is restored automatically once the ad window ends.

## 🔔 What's New

### v9.1.0 — 2026-05-27
- **Real-Time UI controls:** Settings toggles automatically grey out and disable when Ad Blocking is OFF, while preserving descriptive help popup interactions — ([#27](https://github.com/GosuDRM/TTV-AB/issues/27)).
- **Auto Player Soft-Reload:** Toggling Low Quality Fallback OFF during active backup playback now programmatically triggers a non-disruptive, soft reload of the Twitch player, instantly returning you to native source-tier quality — ([#26](https://github.com/GosuDRM/TTV-AB/issues/26)).
- **Audited 11-Locale Translations:** Perfected translation phrasing line-by-line in German (`de`), Spanish (`es`), Portuguese (`pt`), Italian (`it`), Japanese (`ja`), Korean (`ko`), and Russian (`ru`).
- **Critical Fixes:** Fixed the info modal Got It button click toggling settings off, and resolved the popup TDZ crash on declaration — ([#25](https://github.com/GosuDRM/TTV-AB/issues/25)).
- **UI & Modal Layout Fixes:** Relocated modals to prevent border-radius layout clipping, and fixed a load crash due to missing elements — ([#27](https://github.com/GosuDRM/TTV-AB/issues/27)).

### v9.0.9 — 2026-05-27
- Force player reload with fresh MediaSource when restoring native from autoplay (360p) backup — prevents AVC decoder corruption and audio desync after ad breaks on channels where all source-tier backups are ad-marked

### v9.0.8 — 2026-05-23
- Fix consecutive midroll backup contamination: BackupVariantUrls whitelist no longer cleared on ad-end reset, and cached encodings re-populate variant URLs — prevents backup media playlists contaminating native snapshot across ad breaks

### v9.0.7 — 2026-05-21
- Buffer monitor throttles to 900ms during steady-state playback — ~33% fewer ticks on healthy streams, stall detection latency unchanged in practice
- Cached React fiber root, container key, and player reference across transient skip ticks — eliminates fiber-tree re-walks after every ad break and idle interval
- HLS strip path: single combined regex for ad metadata, no redundant `text.split`, single-pass output build, hoisted per-line scan

### v9.0.6 — 2026-05-21
- Worker-hook coexistence with TwitchNoSub — run TTV-AB alongside TwitchNoSub simultaneously ([#19](https://github.com/GosuDRM/TTV-AB/issues/19))

### v9.0.5 — 2026-05-21
- Eliminated preroll ad flash — first poll now waits for clean backup before returning, no stopgap leakage ([#20](https://github.com/GosuDRM/TTV-AB/issues/20))

### v9.0.1 — 2026-05-21
- Ad-blocking now runs inside embedded Twitch player iframes — adds support for multistream viewers like [twitchtheater.tv](https://twitchtheater.tv/) ([#16](https://github.com/GosuDRM/TTV-AB/issues/16))
- Content scripts inject into all frames matching `*.twitch.tv` (no new host permissions)

### v9.0.0 — 2026-05-21
- Restored stable ad-blocking pipeline with zero decoder corruption
- Fixed persistent buffering and slideshow playback during ad breaks ([#18](https://github.com/GosuDRM/TTV-AB/issues/18))
- Added CSAI fast path for all-live ad breaks — strips tracking URLs, no stream switch
- Backup search now covers all 5 player types including 360p autoplay
- Eliminated brief black screen when first loading a channel during ad blocking
- Fixed empty playlist fallback to prevent player stalls
- Improved ad segment handling for Firefox compatibility

_See [CHANGELOG.md](CHANGELOG.md) for the complete list of changes._

## 🛠️ Development

```sh
git clone https://github.com/GosuDRM/TTV-AB.git
cd TTV-AB
npm install
npm run build          # compiles TypeScript, minifies, and bundles
npm run package:chrome # creates Chrome Web Store upload archive
npm run lint           # runs Biome linter
npm run knip           # checks for unused exports
```

The build outputs to `dist/`. Load the unpacked extension from `dist/manifest.json` in your browser's developer mode after building.

The source tree under `src/` is organized by concern — `modules/` for core ad-blocking logic (processor, parser, player, hooks, worker, state, API), `scripts/` for the bridge and background service worker, and `popup/` for the extension UI.

## 💬 Support

- Found a bug? [Open an issue](https://github.com/GosuDRM/TTV-AB/issues)
- Want to contribute? Pull requests are welcome
- If TTV AB saves you from ads, consider supporting development:

[![Donate](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B.svg)](https://ko-fi.com/gosudrm)

## 🔒 Privacy

TTV AB operates entirely on your device. No data is ever sent to external servers — not your browsing history, not your Twitch activity, not your ad-block statistics. All counters and settings are stored in your browser's local storage. See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## 📄 License

MIT License with Attribution — See [LICENSE](LICENSE) for details.
