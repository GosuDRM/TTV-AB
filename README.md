# TTV AB

![Version](https://img.shields.io/badge/version-5.0.9-purple)
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

`Ads Blocked` tracks confirmed worker-side playlist ad detections plus a few page-side fallback recoveries when Twitch injects direct media or explicit player-shell ads. `DOM Ads Blocked` tracks separate player-side cleanup events such as overlays, display shells, and popup removal. Both counters persist through the background worker using page-scoped media keys so live routes and `/videos/<id>` playback stay aligned without adding extra DOM scans or observers.

During active ad recovery, Twitch may temporarily fall back to a lower-quality backup stream, such as `360p`, while the extension keeps playback alive. Once the ad window ends and the player returns to native playback, your chosen quality is restored.

## What's New

### v5.0.9
- **Buffer Fix Pause Freeze** - Fixed a race condition where the extension's programmatic playback pause during a buffer recovery attempt could be misinterpreted as a user-initiated pause, which would permanently block subsequent resume attempts and leave the player stuck in a paused state.

### v5.0.8
- **Post-Ad Player Pause Fix** - Widened the programmatic-pause detection guard window and made pause-intent suppression null-safe so Twitch's native ad-transition pause events are no longer misinterpreted as user intent, which previously could leave the player stuck paused after ad recovery.
- **Post-Ad Audio/Video Desync Fix** - After an ad-recovery player reload on a live stream, playback now explicitly seeks to the live buffer edge when the video position drifts more than 2 seconds behind, preventing the audio-ahead / video-behind desync that could persist after ad breaks.
- **Live Playback A/V Drift Correction** - The buffer monitor now continuously checks for audio/video sync drift during live playback and auto-corrects by seeking to the live edge when the video position falls more than 4 seconds behind the buffered head, catching desync that develops gradually after ad transitions.

### v5.0.7
- **Queued Counter Delta Preservation** - Persisted ad counters now preserve queued local deltas when another Twitch tab updates storage first, preventing valid ad and DOM-ad counts plus per-channel attribution from being dropped before the background flush completes.
- **Bridge Handshake Reconnects** - Page-side bridge handshakes can now bind again after a port disconnect, allowing the isolated bridge channel to recover cleanly instead of retrying forever against a one-time listener.
- **Exact Backup Variant Framerate Matching** - Backup stream selection now compares parsed frame rates numerically, so same-resolution `30fps` and `60fps` variants pick the correct clean fallback instead of the first resolution match.
- **Playback Context Recovery Reset** - Route and media-context changes now clear stale reload and recovery cooldown state, preventing the previous stream's recovery markers from suppressing a required reload on the next stream.
- **Removal-Triggered Stale Shell Cleanup** - DOM ad cleanup now reacts to ad-node removals as well as additions, so lingering display-shell wrappers collapse immediately when Twitch tears the ad DOM out of the player.
- **Bridge Reconnect State Replay** - Reconnected page-side bridge ports now immediately replay the current toggle and counter state, preventing stale enabled status or ad counts after a transient port drop.
- **Stale Navigation Event Rejection** - Worker, bridge, and rescan paths now reject playback events as soon as Twitch navigation leaves the originating media context, preventing old-stream counters, reloads, and cleanup work from leaking into later routes.
- **Popup Transition Timing** - The popup statistics panel now derives its collapse fallback from the actual computed transition timing, preventing the close animation from snapping shut before the CSS transition finishes.

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

`npm run knip` is expected to pass cleanly with the current `knip` 6.0.3 configuration.

## Support

If you enjoy TTV AB, consider buying me a coffee! Your support helps keep this project alive.

[![Donate](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B.svg)](https://ko-fi.com/gosudrm)

## Privacy

This extension operates entirely locally and does not send any browsing or usage data off your device. See [PRIVACY.md](PRIVACY.md) for details.

## License

MIT License with Attribution - See [LICENSE](LICENSE) for details.
