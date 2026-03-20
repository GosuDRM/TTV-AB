# TTV AB

![Version](https://img.shields.io/badge/version-5.0.0-purple)
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

### v5.0.0
- **VOD Ad Blocking Support** - Added VOD route, playlist, and playback-token handling so Twitch `/videos/<id>` playback uses the same ad-strip and recovery pipeline as live streams.
- **Playback Context Hardening** - Stream state, worker messages, route changes, and post-ad recovery now track a shared media key, preventing stale live/VOD events from crossing into the wrong player.
- **Current-Live VOD Recovery** - Active livestream VOD pages now keep page-scoped ad and reload events even when Twitch serves playback through the live channel transport, fixing ads that could still slip through on the current stream archive.
- **Live-to-VOD Player Resync** - Navigating from a live stream to its VOD in Twitch's SPA flow now triggers a guarded player resync when the old live player state lingers, preventing the large static `?` placeholder that previously required a manual refresh.
- **DOM Scan Performance Hardening** - Player-side popup and display-ad cleanup now coalesces rescans, ignores noisy chat-only mutations, and backs off idle polling, reducing the periodic buffering and whole-browser lag that could appear from overly aggressive full-page DOM scans.
- **Player Overlay Cleanup** - Display-ad cleanup now recognizes the newer player-side `Learn More` CTA and `right after this ad break` banner shell, collapsing VOD ad overlays more reliably.
- **Direct VOD Video-Ad Suppression** - VOD pages now detect Twitch's injected Amazon MP4 ad media and force playback back to the real archive stream instead of letting the standalone ad video run to completion, while requiring matching ad-UI signals so live/VOD route transitions are not misclassified as standalone ads.
- **Lower-Third Banner Coverage** - Added support for Twitch's newer `sda-frame` / `stream-lowerthird` lower-third subscription and display-ad banner variant so it is treated as an explicit DOM ad target.

### v4.4.0
- **Display Ad Feedback Overlay Cleanup** - Player-side display-ad cleanup now targets Twitch's feedback button wrapper as well as the tiny `Ad` label itself, removing leftover `Leave feedback for this Ad` overlays that could remain near the stream player.

### v4.3.9
- **Display Ad Label Cleanup** - The DOM blocker now collects and hides lingering player-side ad labels directly, removing leftover `Ad` / countdown-style badges that could remain visible after display-ad cleanup.

### v4.3.8
- **Auto Locale Selection Fix** - `Auto` now resolves from Chrome's UI locale and preferred-language list instead of only `navigator.language`, and it correctly maps Traditional Chinese variants like `zh-HK` and `zh-MO`.
- **Locale Copy Polish** - Updated shipped non-English popup and manifest strings to read more naturally, reducing awkward direct translations and grammar issues.

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## Development

```sh
npm install
npm run build
npm run lint
npm run knip
```

`npm run knip` is expected to pass cleanly with the current `knip` 6 prerelease configuration.

## Support

If you enjoy TTV AB, consider buying me a coffee! Your support helps keep this project alive.

[![Donate](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B.svg)](https://ko-fi.com/gosudrm)

## Privacy

This extension operates entirely locally and does not send any browsing or usage data off your device. See [PRIVACY.md](PRIVACY.md) for details.

## License

MIT License with Attribution - See [LICENSE](LICENSE) for details.
