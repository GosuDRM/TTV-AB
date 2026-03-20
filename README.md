# TTV AB

![Version](https://img.shields.io/badge/version-4.3.9-purple)
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

During active ad recovery, Twitch may temporarily fall back to a lower-quality backup stream, such as `360p`, while the extension keeps playback alive. Once the ad window ends and the player returns to native playback, your chosen quality is restored.

## What's New

### v4.3.9
- **Display Ad Label Cleanup** - The DOM blocker now collects and hides lingering player-side ad labels directly, removing leftover `Ad` / countdown-style badges that could remain visible after display-ad cleanup.

### v4.3.8
- **Auto Locale Selection Fix** - `Auto` now resolves from Chrome's UI locale and preferred-language list instead of only `navigator.language`, and it correctly maps Traditional Chinese variants like `zh-HK` and `zh-MO`.
- **Locale Copy Polish** - Updated shipped non-English popup and manifest strings to read more naturally, reducing awkward direct translations and grammar issues.

### v4.3.7
- **Lower-Third Display Ad Detection** - DOM cleanup now treats Twitch's `sda-iframe-*` / `Stream Display Ad` lower-third iframes as explicit display-ad signals, so Amazon-backed lower-third banners are collapsed reliably.

### v4.3.6
- **Serialized Counter Persistence** - Counter and stats writes now run through a dedicated extension background worker instead of per-tab storage read/modify/write loops, preventing tabs from clobbering totals, daily stats, channels, and achievements.
- **Backup Stream Policy Fix** - Backup and fallback selection no longer bypass clean-playback policy in minimal or fallback paths, so rejected ad-marked playlists are not promoted back into playback.
- **Token Relay Recovery** - Backup token fetches now fall back cleanly after relay timeouts instead of reusing an already-aborted request signal.

### v4.3.5
- **Post-Ad Audio Recovery** - The page now suppresses competing `video` and `audio` elements during ad recovery and restores their exact audio state after `AdEnded`, preventing delayed or doubled audio from lingering backup players.
- **Ad Event Channel Normalization** - Worker ad events now normalize observed channel names before stale-channel checks so post-ad cleanup runs reliably across Twitch route casing/format differences.

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
