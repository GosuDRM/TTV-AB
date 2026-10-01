# TTV AB

![Version](https://img.shields.io/badge/version-19.0.3-purple)
![License](https://img.shields.io/badge/license-MIT--based%20with%20attribution-green)
![Tests](https://github.com/GosuDRM/TTV-AB/actions/workflows/ci.yml/badge.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Firefox](https://img.shields.io/amo/v/ttv-ab-twitch-ad-blocker?label=firefox&color=orange)
![Chrome](https://img.shields.io/badge/chrome-19.0.3-yellow)
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
- ✅ Optional Low Quality Fallback for faster recovery; disabling it prioritizes normal-quality sources, with a temporary low-quality bridge available during prerolls
- ✅ Optional Ad Break Timer in the stream's top-right corner, enabled by default
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
4. Click the extension icon to view stats or toggle Ad Blocking, Ad Spoofing, Low Quality Fallback, and Ad Break Timer
5. Change language via the dropdown in the popup footer

## ⚙️ How It Works

TTV AB checks Twitch's HLS playlists before playback and blocks recognized client-side ad requests on VODs.

<p align="center">
  <img src="assets/pipeline.svg" alt="Animated ad-blocking pipeline: the Twitch player worker passes clean playlists through unchanged, rejects ad-marked media, keeps a verified clean backup live, and restores native playback only after repeated clean checks." width="860">
</p>

- Checks alternative Twitch sources one at a time, using a fresh clean native playlist or a compatible silent hold while searching
- Plays only verified, playable, ad-free backups, refreshes them during the break, and rotates stalled sources
- Returns to native playback after repeated clean checks for the same stream and break, then restores quality and audio settings
- Keeps recovery tied to the current player across background tabs and Picture-in-Picture, respecting explicit pauses

**Low Quality Fallback** is off by default, prioritizing normal-quality sources. Prerolls may still use a temporary clean low-quality bridge if those sources fail. Midrolls skip new autoplay backups and may recover more slowly. Enabling the setting allows a clean 360p bridge sooner while higher-quality sources are checked. Other sources may still offer lower qualities.

**Ad Spoofing** sends Twitch progress and completion signals for blocked ads. Turning it off leaves ad blocking active.

The optional **Ad Break Timer** is on by default and can be switched off in the popup. It tracks the current break until it ends; it does not predict when your selected quality will return.

## 🔔 What's New

### v19.0.3 - 2026-10-02

- **Playback Handoffs** - Keep clean segments when stream timestamps overlap by up to 50 ms, avoiding unnecessary skips when switching backups or returning to native playback.
- **Small Buffer Gaps** - Recover across small gaps after playback freezes, avoiding unnecessary pause/play nudges or player reloads.
- **Backup Recovery Attempts** - Allow all three backup searches before reporting that recovery attempts are exhausted.
- **Playback Diagnostics** - Include browser details, selected and playing video quality, Twitch Low Latency status, handoff timing, and retained segment counts in Generate Log without exposing private stream links.
- **Default Settings** - Start with Low Quality Fallback off and Ad Break Timer on. Apply these settings once when updating, then preserve later user choices.
- **Ad Break Timer** - Show a simpler timer label, such as "Ad break · 1:23".

### v19.0.2 - 2026-10-01

- **Empty Player Recovery** - Attempt one player rebuild when previously advancing live playback stays empty, while respecting user pauses and current playback ownership.
- **Playback Controls After Player Replacement** - Follow the current video when Twitch replaces the player, preventing events from retired videos from changing pause or resume intent.

### v19.0.1 - 2026-09-29

- **Backup Stall Detection** - Require fresh stall evidence when Twitch replaces the video element, avoiding premature backup switches and keeping recovery attempts bounded.

_See [CHANGELOG.md](CHANGELOG.md) for the complete list of changes._

## 🛠️ Development

Use Node.js 22 and Python 3.

```sh
npm ci
npm run build
npm test
npm run lint
npm run typecheck
npm run knip
```

The build creates `dist/` and versioned archives. Tests read `dist/`, so rebuild after source edits.

- **Chrome:** Open `chrome://extensions`, enable Developer mode, then [Load unpacked](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) and select `dist/`.
- **Firefox:** Open `about:debugging`, select This Firefox, then [Load Temporary Add-on](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) and select `dist/manifest.json`.

After Firefox popup edits, if the build reports stale generated files, copy `popup.js` and `translations.js` from `dist/src/popup/` into `src/popup/` and rebuild.

## 💬 Support

- Found a bug? [Open an issue](https://github.com/GosuDRM/TTV-AB/issues)
- Want to contribute? Pull requests are welcome
- If TTV AB saves you from ads, consider supporting development:

[![Donate](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B.svg)](https://ko-fi.com/gosudrm)

## 🔒 Privacy

TTV AB operates entirely on your device. No data is ever sent to external servers: not your browsing history, not your Twitch activity, not your ad-block statistics. All counters and settings are stored in your browser's local storage. See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## 📄 License

This project uses an MIT-based license with a repository attribution requirement. See [LICENSE](LICENSE) for details.
