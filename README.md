# TTV AB

![Version](https://img.shields.io/badge/version-17.5.6-purple)
![License](https://img.shields.io/badge/license-MIT--based%20with%20attribution-green)
![Tests](https://github.com/GosuDRM/TTV-AB/actions/workflows/ci.yml/badge.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Firefox](https://img.shields.io/amo/v/ttv-ab-twitch-ad-blocker?label=firefox&color=orange)
![Chrome](https://img.shields.io/badge/chrome-17.5.6-yellow)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks Twitch ads on live streams and VODs while keeping playback stable.

## 📥 Install

> **⚠️ Supported browsers: Firefox and Chromium-based desktop browsers only.** TTV AB can't run on WebKit-based browsers like Orion, or on anything on iOS/iPadOS (every iOS browser is WebKit under the hood). The ad-blocker can't load there and the player goes to a black screen, so please use Firefox or a Chromium-based browser on a computer.

| Store | Link | Status |
|-------|------|--------|
| Firefox Add-ons | [TTV AB - Twitch Ad Blocker](https://addons.mozilla.org/en-GB/firefox/addon/ttv-ab-twitch-ad-blocker/) | Stable |
| Chrome Web Store | [TTV AB - Lightweight, powerful ad blocker](https://chromewebstore.google.com/detail/ttv-ab-lightweight-powerf/mlifbfmeoafhcccmppaolojdglcbkdkg) | Stable |


<p align="center">
  <img src="assets/popup2.png" alt="Retro Theme" width="300">
  <img src="assets/popup3.png" alt="Channel Stats Card" width="300">
</p>

## ✨ Features

- ✅ Blocks preroll and midroll ads on live streams and Twitch VODs
- ✅ Keeps a clean backup stream playing during ad breaks to reduce black screens, purple screens, and stalls
- ✅ Returns to native video quality and audio after recovery, including enhanced HEVC and AV1 qualities when available
- ✅ Keeps recovery working in background tabs and Picture-in-Picture
- ✅ Removes stale Twitch ad overlays after playback returns
- ✅ Independent, live-updating controls for Ad Blocking, Ad Spoofing, and Low Quality Fallback
- ✅ Optional Ad Spoofing to reduce anti-adblock detection
- ✅ Optional Low Quality Fallback for faster recovery; disabling it prioritizes normal-quality sources, but lower quality may still be used as a last resort
- ✅ Optional Turbo Mode that pauses new statistics and achievements while preserving existing history and all ad-blocking controls
- ✅ Persistent, live-updating Ads Blocked and Time Saved totals
- ✅ Statistics dashboard with weekly charts, detailed per-channel history, and **12 Achievement Badges**
- ✅ Language selector, with 12 languages supported (EN, ES, FR, DE, PT, IT, JA, KO, ZH-CN, ZH-TW, RU, UK)
- ✅ Built-in Generate Log tool that creates a local, privacy-filtered diagnostic file for bug reports
- ✅ Accessible Manifest V3 popup with Retro and Neon themes
- ✅ Supports Firefox and Chromium-based desktop browsers

## 🚀 Usage

1. Install the extension from your browser's add-on store
2. Navigate to [twitch.tv](https://twitch.tv) and open any live stream or VOD
3. Ads are blocked automatically, no configuration needed
4. Click the extension icon to view stats or toggle Ad Blocking, Ad Spoofing, and Low Quality Fallback
5. Change language via the dropdown in the popup footer

## ⚙️ How It Works

TTV AB inspects Twitch's HLS playlists inside the browser before the video player uses them. Clean playlists pass through unchanged. On VOD pages, it also blocks the narrowly scoped client-side ad requests used by Twitch.

<p align="center">
  <img src="assets/pipeline.svg" alt="Animated ad-blocking pipeline: the Twitch player worker passes clean playlists through unchanged, rejects ad-marked media, keeps a verified clean backup live, and restores native playback only after repeated clean checks." width="860">
</p>

- Keeps the last clean native playlist flowing, when available, while checking alternative Twitch player sources one at a time
- Accepts only playable, ad-free backups and refreshes the active backup at the live edge so it does not freeze
- Uses a small local hold segment only when removing ads would otherwise leave the decoder with no media
- Monitors backup health and rotates to another verified source if the active backup stalls
- Keeps recovery tied to the current player across background tabs and Picture-in-Picture while respecting explicit pauses
- Returns to native playback only after repeated clean checks for the same stream and ad cycle, then restores the saved quality and audio state

With **Low Quality Fallback** enabled, a clean 360p autoplay source can start sooner while normal-quality backups are checked. With it disabled, new autoplay backups are skipped and normal-quality sources are tried first. The transition can take longer, and a lower-quality rendition may still be used as a last resort when necessary to keep the ad blocked.

When **Ad Spoofing** is enabled, the extension sends Twitch the ad-progress and completion signals expected for the blocked break. This setting is separate from playlist blocking and can be turned off without disabling core ad blocking.

## 🔔 What's New

### v17.5.5 - 2026-09-10

- **Post-Ad Quality Recovery** - Improved recovery from streams staying at 360p after ads or losing the 1440p option, while preserving the selected quality when Twitch still offers it ([#74](https://github.com/GosuDRM/TTV-AB/issues/74)).

### v17.5.4 - 2026-09-09

- **Faster Backup Recovery** - Added earlier checks for clean backups to help playback resume sooner when Low Quality Fallback is disabled.
- **Backup Playback** - Improved playback continuity when leaving the silent hold, switching backups, and returning to native quality.
- **Audio Sync** - Improved audio and video timing during backup refreshes and quality changes.
- **Low Quality Fallback** - Fixed a cached 360p autoplay backup being selected while Low Quality Fallback is disabled. A clean backup already playing can continue until normal quality is ready.
- **Turbo Watch Time** - Prevented watch time collected during Turbo Mode from being added after it is disabled, including delayed updates recovered after closing a tab.

### v17.4.0 - 2026-09-06

- **Preview Playback** - Fixed a worker startup race that could interrupt valid Team-page streams, channel banners, and Previews hover players with Error #2000. Navigation now retires outdated Team-page requests while preserving the exact active Picture-in-Picture worker ([#73](https://github.com/GosuDRM/TTV-AB/issues/73)).
- **Worker Startup Cleanup** - Released temporary worker data when a player worker cannot be created.
- **Background Worker Cleanup** - Stopped background startup checks from keeping unused player workers in memory. The cause of the original crash and high-memory report in [#71](https://github.com/GosuDRM/TTV-AB/issues/71) remains unconfirmed.
- **Paused Playback Cleanup** - Prevented repeated early worker shutdowns from accumulating recovery checks while paused, while preserving recovery deadlines and Picture-in-Picture ownership.
- **Statistics Recovery** - Bounded pending statistics requests during storage delays, avoided duplicate replay requests, and preserved recovery when storage resumes. Discarded updates no longer return after toggling Turbo Mode.

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

The source tree under `src/` is organized by concern: `modules/` for core ad-blocking logic (processor, parser, player, hooks, worker, state, API), `scripts/` for the bridge and background service worker, and `popup/` for the extension UI.

## 💬 Support

- Found a bug? [Open an issue](https://github.com/GosuDRM/TTV-AB/issues)
- Want to contribute? Pull requests are welcome
- If TTV AB saves you from ads, consider supporting development:

[![Donate](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B.svg)](https://ko-fi.com/gosudrm)

## 🔒 Privacy

TTV AB operates entirely on your device. No data is ever sent to external servers: not your browsing history, not your Twitch activity, not your ad-block statistics. All counters and settings are stored in your browser's local storage. See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## 📄 License

This project uses an MIT-based license with a repository attribution requirement. See [LICENSE](LICENSE) for details.
