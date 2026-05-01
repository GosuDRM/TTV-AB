# TTV AB

![Version](https://img.shields.io/badge/version-6.7.8-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Short Name](https://img.shields.io/badge/short_name-TTV%20AB-blueviolet)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks Twitch ads on live streams and VODs while keeping playback stable.

## Install

- Chrome Web Store: [TTV AB - Lightweight, powerful ad blocker](https://chromewebstore.google.com/detail/ttv-ab-lightweight-powerf/mlifbfmeoafhcccmppaolojdglcbkdkg) `(Waiting for approval)`
- Firefox Add-ons: [TTV AB - Twitch Ad Blocker](https://addons.mozilla.org/en-GB/firefox/addon/ttv-ab-twitch-ad-blocker/) `(Stable)`

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

1. Navigate to [twitch.tv](https://twitch.tv)
2. Open any live stream or VOD
3. Ads will be automatically blocked
4. Click the extension icon and use the toggle to enable/disable
5. Change language via the dropdown in the footer

## How It Works

The extension intercepts Twitch's live and VOD HLS video playlists and:
- Strips ad-marked segments from M3U8 playlists when Twitch injects them
- Fetches backup ad-free streams when Twitch forces playback onto an ad path
- Cleans up stale Twitch ad UI after recovery
- Suppresses competing media during ad recovery and returns playback to the real stream
- Caches known ad segments to reduce repeated playback disruption

During active ad recovery, Twitch may temporarily fall back to a lower-quality backup stream, such as `360p`, while the extension keeps playback alive. Once the ad window ends and the player returns to native playback, your chosen quality is restored.

## What's New

### v6.7.8
- **PiP Token Isolation Fix** - Picture-in-Picture playback token requests were not being isolated due to a typo, overwriting the native recovery player type. PiP tokens are now correctly detected and skipped.
- **Resolution Fallback Fix** - When ModifiedM3U8 is active during HEVC ad recovery, the fallback resolution picker now prefers non-HEVC variants to avoid misidentifying AVC backup streams as HEVC.
- **Bridge Stability** - Added max retry limit to bridge handshake and warning logs when the bridge message queue overflows.

### v6.7.7
- **Post-Ad HEVC Reload Loop Fix** - Fixed a black-screen regression where post-ad continuation markers could trigger a redundant second HEVC player reload right after the first post-ad reload, causing an unnecessary teardown/rebuild cycle. The HEVC reload now skips when the ad markers are from a recent post-ad re-entry, falling through to backup stream search instead.

### v6.7.6
- **Preroll HEVC Deferral Guard** - Fixed a black-screen regression where the HEVC ad-block deferral could re-trigger after a player reload during preroll, serving raw ad-marked playlists to a paused player. The deferral now only activates when no ad cycle is already in progress, allowing the backup stream path to take over correctly.

### v6.7.5
- **HEVC Post-Ad Handoff** - 1440p/HEVC streams now reload with a fresh token and media player instance after modified-M3U8 ad recovery, including silent backup hold exits, fixing the black screen and audio desync that happened when the AVC-substituted backup buffer met the original HEVC native playlist.
- **HEVC Ad-Start Guard** - 1440p/HEVC streams keep Twitch's native 1440p master during normal playback, then hold the last clean native media playlist while arming a quality-preserving non-HEVC fallback master during active HEVC ad recovery so Chrome avoids both a visible ad flash and a mismatched AVC handoff.

### v6.7.3
- **Shared Stream-Info Factory** - Refactored the duplicated stream-info construction in the worker fetch hook and the playlist processor into a single shared factory. Behavior unchanged.

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
