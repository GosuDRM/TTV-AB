# TTV AB

![Version](https://img.shields.io/badge/version-9.3.7-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Tests](https://github.com/GosuDRM/TTV-AB/actions/workflows/ci.yml/badge.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Firefox](https://img.shields.io/amo/v/ttv-ab-twitch-ad-blocker?label=firefox&color=orange)
![Chrome](https://img.shields.io/badge/chrome-9.3.7-yellow)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks Twitch ads on live streams and VODs while keeping playback stable.

## 📥 Install

| Store | Link | Status |
|-------|------|--------|
| Firefox Add-ons | [TTV AB - Twitch Ad Blocker](https://addons.mozilla.org/en-GB/firefox/addon/ttv-ab-twitch-ad-blocker/) | Active |
| Chrome Web Store | [TTV AB - Lightweight, powerful ad blocker](https://chromewebstore.google.com/detail/ttv-ab-lightweight-powerf/mlifbfmeoafhcccmppaolojdglcbkdkg) | Pending approval |


<p align="center">
  <img src="assets/popup1.png" alt="Popup Screenshot" width="300">
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

### v9.3.7 — 2026-06-07
- **Low-quality fallback no longer drains while searching for high quality.** Once the clean 360p fallback wins during an ad, the extension keeps refreshing that same live fallback for the rest of the ad cycle instead of blocking the playlist response while probing source-tier backups.
- **Low quality → high quality recovery is smoother.** High-quality restoration now waits for the normal ad-end recovery path, avoiding the mid-ad source splice that could cause a short stall or decoder hitch.
- **Build validation now covers the new worker helper.** The package build fails loudly if the autoplay-hold helper is referenced by backup search but not injected into Twitch's worker hook.

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
