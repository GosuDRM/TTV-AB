# TTV AB

![Version](https://img.shields.io/badge/version-6.0.0-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Short Name](https://img.shields.io/badge/short_name-TTV%20AB-blueviolet)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks Twitch ads on live streams and VODs while keeping playback stable.

## Install

- Chrome Web Store: [TTV AB - Lightweight, powerful ad blocker](https://chromewebstore.google.com/detail/ttv-ab-lightweight-powerf/mlifbfmeoafhcccmppaolojdglcbkdkg) `(Latest)`
- Firefox Add-ons: [TTV AB - Twitch Ad Blocker](https://addons.mozilla.org/en-GB/firefox/addon/ttv-ab-twitch-ad-blocker/) `(Latest)`

<p align="center">
  <img src="assets/popup-screenshot.png" alt="Popup Screenshot" width="300">
  <img src="assets/popup-screenshot2.png" alt="Stats Screenshot" width="300">
</p>

## Features

- ✅ Blocks preroll and midroll ads on live streams and VODs
- ✅ Supports both live playback and Twitch `/videos/<id>` archives
- ✅ **Blocks anti-adblock popups** ("Support streamer by disabling ad block")
- ✅ Avoids purple-screen playback interruptions
- ✅ Restores your chosen quality after ad recovery
- ✅ Manifest V3 compatible
- ✅ Simple enable/disable toggle
- ✅ Accessible popup controls and live-updating stats
- ✅ Persistent "Ads Blocked" & "DOM Ads Blocked" statistics
- ✅ **Statistics Dashboard** with time saved, weekly charts, and achievements
- ✅ **12 Achievement Badges** to unlock as you block ads
- ✅ **Language Selector** - 11 languages supported (EN, ES, FR, DE, PT, IT, JA, KO, ZH-CN, ZH-TW, RU)
- ✅ Per-channel ad blocking breakdown
- ✅ Modern, animated UI (Cyberpunk/Neon aesthetic)
- ✅ Lightweight and fast

## Usage

1. Navigate to [twitch.tv](https://twitch.tv)
2. Open any live stream or VOD
3. Ads will be automatically blocked
4. Click the extension icon and use the toggle to enable/disable
5. Change language via the dropdown in the footer

## How It Works

The extension intercepts Twitch's live and VOD HLS video playlists and:
- Strips ad-marked segments from M3U8 playlists when Twitch injects them
- Fetches backup ad-free streams when Twitch forces playback onto an ad path
- Collapses player-side display-ad shells and overlay banners
- Suppresses injected direct video ads on VOD pages and returns playback to the real archive stream
- Caches known ad segments to reduce repeated playback disruption

During active ad recovery, Twitch may temporarily fall back to a lower-quality backup stream, such as `360p`, while the extension keeps playback alive. Once the ad window ends and the player returns to native playback, your chosen quality is restored.

## What's New

### v6.0.0
- **Counter Flush Durability Hardening** - Exit-time blocked-ad and DOM-ad counter flushes now persist and replay safely, with per-flush storage plus independent retries so route changes, tab closes, and transient MV3/runtime failures do not strand valid totals.
- **Counter Accuracy Hardening** - `DOM Ads Blocked` now waits for the real toggle/count state before counting, stays inactive while ad blocking is disabled, and debounces per route/media so fast Twitch navigation does not suppress valid new cleanups; `Ads Blocked` startup restore also preserves early preroll blocks that happen before the first stored total sync lands.
- **DOM Ad Blocking Refresh** - Display-shell cleanup now evaluates bounded near-player CTA, banner-text, lower-third, and layout signals together, fixing missed Twitch display-ad variants without falling back to broader whole-page scans.
- **Turbo / Anti-Adblock Popup Cleanup** - Popup cleanup now runs in the same scan even when another DOM ad path already matched, recognizes newer Twitch Turbo wording such as `Consider Turbo`, `ad-free viewing`, and `fully enjoy Twitch`, and only escalates into the broader fallback sweep when real popup signals or recent popup activity justify it.
- **Playback / Navigation / Worker State Fixes** - Reload preference restore is now route-scoped, long ad breaks keep post-ad resume intent alive through the full ad cycle, worker tracking no longer evicts unrelated active Twitch workers, stale worker lifecycle events are rejected after SPA navigation, and reload markers now stay scoped to the stream that actually reloaded.
- **Worker Bridge Isolation** - Hooked-worker control traffic now uses a private namespaced bridge envelope, so unrelated worker messages are no longer intercepted just because they also carry a generic `key` field.
- **Replay-On-Live Post-Ad Recovery** - Live channels that temporarily switch the player into replay/VOD-style content no longer get stuck on a loading spinner after ads end; post-ad recovery now stays armed for that content type and escalates into the guarded native-player reload path when Twitch leaves the player unhealthy.
- **Player Pause-Intent Hardening** - Explicit user pauses during Twitch's early ad-start and backup-player suppression windows are now preserved, while Twitch-owned pauses during the same ad cycle no longer disable post-ad resume or reload recovery.
- **Recovery / Worker De-Janking** - Hooked Twitch workers now bootstrap with `importScripts(...)` / `await import(...)` inside the worker instead of cloning the original script through a synchronous page-thread `XMLHttpRequest`, and post-ad artifact cleanup no longer runs as a heavy synchronous DOM sweep directly on the `AdEnded` recovery path.
- **Post-Ad Backup Recovery Loop Guard** - Backup-stream ad exits now avoid the immediate native-player reload and pause/play pulse that could trigger a fresh Twitch ad request right after `AdEnded`, preventing the blocker from restarting the ad cycle unnecessarily.
- **Playlist Lifecycle Scoping** - Unknown backup playlists no longer inherit the active ad lifecycle, and stale cached ad segments are no longer treated as proof that an ad is still active, reducing stuck-loading and repeated backup-selection loops after ad recovery.
- **Obfuscated React Tree Recovery** - Fallback structural discovery was added for the Twitch internal player state component after it was obscured from the standard DOM node lookup hook, ensuring that the post-ad recovery sequence is no longer permanently suppressed by a failed component validation during the pause/play routine.
- **Post-Ad Recovery Bypass Loop Guard** - Post-ad recovery now dynamically memorizes the specific ad-free backup stream type that circumvented Twitch pre-rolls. This prevents the extension from blindly falling back to default ad-bearing proxy tokens which recently triggered post-ad stalling and artificial ad loop cycles.

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## Development

```sh
npm install
npm run build
npm run package:chrome
npm run lint
npm run knip
```

Load the unpacked extension from `dist/manifest.json` after `npm run build`.
Create a Chrome Web Store upload archive with `npm run package:chrome`; it writes `ttv-ab-<version>-chrome-store.zip` at the repo root.

`npm run knip` is expected to pass cleanly with the current `knip` 6.1.1 configuration.

## Support

If you enjoy TTV AB, consider buying me a coffee! Your support helps keep this project alive.

[![Donate](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B.svg)](https://ko-fi.com/gosudrm)

## Privacy

This extension operates entirely locally and does not send any browsing or usage data off your device. See [PRIVACY.md](PRIVACY.md) for details.

## License

MIT License with Attribution - See [LICENSE](LICENSE) for details.
