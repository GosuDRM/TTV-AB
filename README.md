# TTV AB

![Version](https://img.shields.io/badge/version-4.3.6-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Short Name](https://img.shields.io/badge/short_name-TTV%20AB-blueviolet)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks ads on Twitch.tv streams.

Note: The current extension icon is just a placeholder and will probably get replaced in a future update if I stop being lazy.

## Install

- Chrome Web Store: [TTV AB - Lightweight, powerful ad blocker](https://chromewebstore.google.com/detail/ttv-ab-lightweight-powerf/mlifbfmeoafhcccmppaolojdglcbkdkg) `(Latest)`
- Firefox Add-ons: [TTV AB - Twitch Ad Blocker](https://addons.mozilla.org/en-GB/firefox/addon/ttv-ab-twitch-ad-blocker/) `(Latest)`

<p align="center">
  <img src="assets/popup-screenshot.png" alt="Popup Screenshot" width="300">
  <img src="assets/popup-screenshot2.png" alt="Stats Screenshot" width="300">
</p>

## Features

- ✅ Blocks preroll and midroll ads
- ✅ **Blocks anti-adblock popups** ("Support streamer by disabling ad block")
- ✅ No purple screen errors
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
2. Open any live stream
3. Ads will be automatically blocked
4. Click the extension icon and use the toggle to enable/disable
5. Change language via the dropdown in the footer

## How It Works

The extension intercepts Twitch's HLS video playlists and:
- Strips ad segments from M3U8 playlists
- Fetches backup ad-free streams when ads are detected
- Caches ad segments to prevent playback
- Suppresses competing media elements during ad recovery so duplicate audio does not overlap the active player

During active ad recovery, Twitch may temporarily fall back to a lower-quality backup stream, such as `360p`, while the extension keeps playback alive. Once the ad window ends and the player returns to native playback, your chosen quality is restored.

## What's New

### v4.3.6
- **Serialized Counter Persistence** - Firefox now persists `Ads Blocked`, `DOM Ads Blocked`, daily stats, channels, and achievements through a dedicated background script instead of per-tab storage read/modify/write loops, so tabs no longer clobber each other.
- **Backup Stream Policy Fix** - Backup and fallback promotion no longer bypass clean-playback policy in minimal or fallback paths, so ad-marked playlists are not promoted back into playback after reload-driven recovery.
- **Token Relay Recovery** - Backup token fetches now fall back cleanly after relay timeouts instead of reusing an already-aborted request signal.
- **Tooling / Packaging Sync** - Firefox now ships the new background script in source packages, and the repo is updated to the current `biome` and `knip` release line.

### v4.3.3
- **Immediate Counter Updates** - `Ads Blocked` now increments on the first confirmed `AdDetected` cycle start, so the popup reflects a blocked ad as soon as recovery begins instead of waiting for a later cleanup path.
- **Counter Pipeline Rework** - `Ads Blocked` and `DOM Ads Blocked` now flow through explicit counter events with event IDs and deltas instead of relying on inferred total jumps, which removes a whole class of silent drift and replay bugs.
- **Duplicate Audio Suppression** - Active ad recovery now suppresses competing Twitch media elements and restores them after `AdEnded`, preventing the double-audio playback that could happen when backup playback starts.
- **Firefox Packaging Fix** - Firefox package builds now emit real ZIP/XPI archives with extension-safe forward-slash paths, so temporary installs and packaged loads work correctly.


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
