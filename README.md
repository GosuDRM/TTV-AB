# TTV AB

![Version](https://img.shields.io/badge/version-5.1.4-purple)
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

### v5.1.4
- **Counter / Route Hardening** - Ad and DOM-ad counters now survive Twitch SPA route changes and tab closes, and reserved Twitch routes such as `/popout/<channel>/player` no longer get misclassified as ordinary channel pages.
- **Bridge Session Tightening** - The isolated page bridge now rejects unsolicited session rebinds, reducing the chance of forged page-side counter or toggle events replacing the active extension port.
- **Safer Buffer Recovery** - Buffer-fix recovery now honors the real paused state and uses the media element clock for live-edge drift correction, preventing false pause/play or seek interventions during healthy playback.
- **Ad-Blocking Recovery Safety** - Backup streams are only promoted when they contain real media segments, playlist URL matching now survives token/query churn, and metadata-only strip paths no longer hand Twitch an empty playlist if backup recovery is unavailable.
- **Post-Ad Spinner Recovery** - Post-ad recovery now stays armed until Twitch playback is actually healthy again, and a stuck loading spinner after backup/fallback playback now escalates into one guarded native-player reload instead of spinning indefinitely.
- **Background Tab Backoff** - Playback-intent sync and buffer monitoring now use Twitch's native visibility state and slow down aggressively in hidden tabs, reducing background CPU churn when multiple Twitch tabs are open.
- **Popup / Mutation Scan Optimization** - Popup cleanup now searches bounded overlay roots instead of walking the whole document, and the MutationObserver no longer runs subtree-wide selector scans before deciding whether a deferred cleanup is needed.
- **Multi-Tab Counter Fanout Reduction** - Cross-tab ad-count restores no longer rebroadcast into every worker in every open tab, cutting unnecessary message traffic while keeping totals in sync.

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
