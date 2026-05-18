# TTV AB

![Version](https://img.shields.io/badge/version-8.4.5-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Tests](https://github.com/GosuDRM/TTV-AB/actions/workflows/ci.yml/badge.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Firefox](https://img.shields.io/amo/v/ttv-ab-twitch-ad-blocker?label=firefox&color=orange)
![Chrome](https://img.shields.io/badge/chrome-8.4.5-yellow)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks Twitch ads on live streams and VODs while keeping playback stable.

## Install

| Store | Link | Status |
|-------|------|--------|
| Firefox Add-ons | [TTV AB - Twitch Ad Blocker](https://addons.mozilla.org/en-GB/firefox/addon/ttv-ab-twitch-ad-blocker/) | Active |
| Chrome Web Store | [TTV AB - Lightweight, powerful ad blocker](https://chromewebstore.google.com/detail/ttv-ab-lightweight-powerf/mlifbfmeoafhcccmppaolojdglcbkdkg) | Pending approval |


<p align="center">
  <img src="assets/popup-screenshot.png" alt="Popup Screenshot" width="300">
  <img src="assets/popup-screenshot2.png" alt="Stats Screenshot" width="300">
</p>

## Features

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

## Usage

1. Install the extension from your browser's add-on store
2. Navigate to [twitch.tv](https://twitch.tv) and open any live stream or VOD
3. Ads are blocked automatically — no configuration needed
4. Click the extension icon to view stats, toggle ad blocking on/off, or toggle the Buffer Fix
5. Change language via the dropdown in the popup footer

## How It Works

TTV AB intercepts Twitch's HLS video playlists at the network level. When Twitch injects ad-marked segments or forces the player onto an ad-only path, the extension:

- Strips ad segments from M3U8 media playlists in real time
- Fetches clean backup streams using alternative player types when the native stream is ad-locked
- Serves a valid empty video segment in place of blocked ad content to keep the decoder stable
- Monitors playback health and automatically recovers from stalls after ad breaks
- Restores your original quality and volume settings once native playback resumes

During ad recovery, Twitch may briefly serve a lower-quality backup stream (e.g. 360p) while the extension keeps playback alive. Your chosen quality is restored automatically once the ad window ends.

## What's New

### v8.4.5
- **CSAI ad leak fixes** — sticky flag cleared between breaks, counter increments on CSAI ads, empty strip falls through to backup search instead of returning original text

### v8.4.4
- **Recovery tracking** — `_stripAds` records which recovery source was used for diagnostics
- **Response URL preservation** — processed playlist responses retain original URL for compatibility

### v8.4.3
- **Page-exit counter flush** — no longer creates empty flush entries on navigation; removed dead `sendBeacon` fallback

### v8.4.2
- **Worker fetch relay fix** — worker-to-main fetch relay now uses `self.fetch` instead of broken `window` reference
- **GQL endpoint hardening** — URL hostname checked explicitly instead of substring match
- **Concurrency guard** — concurrent playlist processing on same stream serialized to prevent backup state interleaving
- **Visibility listener cleanup** — stale event listeners removed on page navigation
- **Processor test suite** — 15 new tests covering ad state reset, backup cooldowns, and fallback promotion policy

### v8.4.0
- **CSAI fast path** — skips backup search when all segments are live, stripping ads inline at full quality
- **Recovery segment injection** — cached live segments with MEDIA-SEQUENCE prevent black-screens when all segments are stripped
- **Non-live SSAI stripping** — unrecognized ad segments caught and stripped when ad metadata present
- **Source-tier priority** — `site`, `embed`, `popout`, `mobile_web` tried first with parallel pre-fetch; `autoplay` (360p) only as absolute last resort

### v8.0.0
- **Ad Spoofing toggle** — opt-in anti-adblock fingerprinting from the popup
- **Reduced ad-induced stalling** — faster backup retries (5s cooldown), max-staleness guard (8s), and non-blocking initial backup search
- Fixed stream freeze/audio lag and 3–5s looping during ad transitions

### v7.7.5
- Fixed brief loading circle during silent backup hold from stale HLS segments

_See [CHANGELOG.md](CHANGELOG.md) for the complete list of changes._


## Development

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

## Support

- Found a bug? [Open an issue](https://github.com/GosuDRM/TTV-AB/issues)
- Want to contribute? Pull requests are welcome
- If TTV AB saves you from ads, consider supporting development:

[![Donate](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B.svg)](https://ko-fi.com/gosudrm)

## Privacy

TTV AB operates entirely on your device. No data is ever sent to external servers — not your browsing history, not your Twitch activity, not your ad-block statistics. All counters and settings are stored in your browser's local storage. See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## License

MIT License with Attribution — See [LICENSE](LICENSE) for details.
