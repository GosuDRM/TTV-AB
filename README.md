# TTV AB

![Version](https://img.shields.io/badge/version-5.0.3-purple)
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

### v5.0.3
- **JavaScript-to-TypeScript Repo Conversion** - The Firefox repo was converted from checked-in JavaScript source files to a TypeScript-based layout, `npm run build` now compiles the TypeScript build runner before execution, unpacked-extension loading targets `dist/manifest.json`, and Firefox package/source archives are generated from the built `dist/` output.
- **Firefox Bridge / Counter Hardening** - The Firefox build now carries the newer page-to-bridge counter pipeline, route-aware live/VOD media-key filtering, retrying counter persistence, stale-worker restart guards, and cross-realm-safe payload handling so `Ads Blocked` and `DOM Ads Blocked` remain in sync across Twitch SPA navigation.
- **Performance Tuning** - The player-side DOM scanner now does less duplicate selector work during popup, display-ad, and direct-media checks by using Set-based dedupe, grouped mutation noise filtering, cheaper targeted popup detection before broad fallback sweeps, and more settled rescan scheduling during Twitch SPA channel navigation.

### v5.0.1
- **Firefox Stutter Fix** - Reduced the player-side DOM cleanup hot path that could make Twitch pages hitch or briefly freeze in Firefox when ad UI appeared, especially around prerolls, display ads, or popup detection.
- **Overlay Scan Scope Reduction** - Player CTA, banner, and ad-label detection now searches near the active player instead of repeatedly sweeping the full page, cutting expensive layout work during normal playback.
- **Mutation Noise Filtering** - Generic button and link churn no longer counts as an ad-scan trigger, so routine Twitch UI updates do not keep scheduling unnecessary rescans.

### v5.0.0
- **VOD Ad Blocking Support** - Added VOD route, playlist, and playback-token handling so Twitch `/videos/<id>` playback uses the same ad-strip and recovery pipeline as live streams.
- **Playback Context Hardening** - Stream state, worker messages, route changes, and post-ad recovery now track a shared media key, preventing stale live/VOD events from crossing into the wrong player.
- **Current-Live VOD Recovery** - Active livestream VOD pages now keep page-scoped ad and reload events even when Twitch serves playback through the live channel transport, fixing ads that could still slip through on the current stream archive.
- **Live-to-VOD Player Resync** - Navigating from a live stream to its VOD in Twitch's SPA flow now triggers a guarded player resync when the old live player state lingers, preventing the large static `?` placeholder that previously required a manual refresh.
- **Firefox Counter Sync Hardening** - Hardened the Firefox `MAIN` / `ISOLATED` / background / popup message pipeline so `Ads Blocked` and `DOM Ads Blocked` update immediately when ad blocking starts instead of getting dropped or snapped back to zero.
- **Firefox Post-Ad Resume Hardening** - Firefox ad-end, buffer-fix, and route-change recovery now suppress false pause intent and retry guarded resumes so Twitch is less likely to leave the player stuck paused after ads or SPA channel navigation.
- **DOM Scan Performance Hardening** - Player-side popup and display-ad cleanup now coalesces rescans, ignores noisy chat-only mutations, and backs off idle polling, reducing the periodic buffering and whole-browser lag that could appear from overly aggressive full-page DOM scans.
- **Player Overlay Cleanup** - Display-ad cleanup now recognizes the newer player-side `Learn More` CTA and `right after this ad break` banner shell, collapsing VOD ad overlays more reliably.
- **Direct VOD Video-Ad Suppression** - VOD pages now detect Twitch's injected Amazon MP4 ad media and force playback back to the real archive stream instead of letting the standalone ad video run to completion, while requiring matching ad-UI signals so live/VOD route transitions are not misclassified as standalone ads.
- **Lower-Third Banner Coverage** - Added support for Twitch's newer `sda-frame` / `stream-lowerthird` lower-third subscription and display-ad banner variant so it is treated as an explicit DOM ad target.

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## Development

```sh
npm install
npm run build
npm run build:firefox
npm run build:firefox-source
npm run typecheck
npm run lint
npm run knip
```

Load the unpacked Firefox extension from `dist/manifest.json` after `npm run build`.

`npm run build:firefox` writes the signed-upload package pair to `dist/TTV-AB-v<version>-firefox.zip` and `dist/TTV-AB-v<version>-firefox.xpi`.
`npm run build:firefox-source` writes the Firefox source bundle to `dist/TTV-AB-v<version>-firefox-source.zip`.

`npm run knip` is expected to pass cleanly with the current `knip` 6.0.3 configuration.

## Support

If you enjoy TTV AB, consider buying me a coffee! Your support helps keep this project alive.

[![Donate](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B.svg)](https://ko-fi.com/gosudrm)

## Privacy

This extension operates entirely locally and does not send any browsing or usage data off your device. See [PRIVACY.md](PRIVACY.md) for details.

## License

MIT License with Attribution - See [LICENSE](LICENSE) for details.
