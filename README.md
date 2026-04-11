# TTV AB

![Version](https://img.shields.io/badge/version-6.2.3-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Short Name](https://img.shields.io/badge/short_name-TTV%20AB-blueviolet)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks Twitch ads on live streams and VODs while keeping playback stable.

## Install

- Chrome Web Store: [TTV AB - Lightweight, powerful ad blocker](https://chromewebstore.google.com/detail/ttv-ab-lightweight-powerf/mlifbfmeoafhcccmppaolojdglcbkdkg) `(Waiting for approval)`
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
- Suppresses injected direct video ads on live and VOD pages and returns playback to the real stream
- Caches known ad segments to reduce repeated playback disruption

During active ad recovery, Twitch may temporarily fall back to a lower-quality backup stream, such as `360p`, while the extension keeps playback alive. Once the ad window ends and the player returns to native playback, your chosen quality is restored.

## What's New

### v6.2.3
- **Faster post-ad return** - Native playback recovery now validates much more aggressively after an ad break, with a shorter clean-playlist confirmation window, fewer native recovery probes, and a hard wait budget that prevents Twitch from keeping the player stuck on backup playback for too long.
- **More reliable native reloads** - In-place stripped-ad recovery now follows the same post-ad reload path as backup and fallback playback, so the player returns to the native stream more consistently instead of lingering on a temporary recovery path.
- **Stronger native token pinning** - Native `PlaybackAccessToken` requests are now kept on the forced recovery player type during validation, reducing cases where Twitch drifts back onto an ad-marked native path in the middle of post-ad recovery.
- **Safer backup stream selection** - Minimal-request fallback no longer accepts ad-marked backup playlists just because they are technically playable, closing an edge case where an ad path could still be selected under degraded recovery conditions.
- **Tighter clean-playlist reuse** - The recovery cache now expires stale clean playlists much sooner, which lowers the chance of getting stuck on an older low-quality backup state after the ad cycle ends.
- **More durable bridge stats** - Pending `Ads Blocked` and `DOM Ads Blocked` updates are now coalesced and trimmed more safely during temporary bridge disconnects, so counter deltas are less likely to be dropped while still keeping the queue bounded.
- **Cleaner worker shutdowns** - Intentionally terminated workers are now pruned immediately, which reduces stale backup tracking during heavy player churn, navigation, and repeated recovery cycles.

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
