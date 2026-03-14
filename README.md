# TTV AB

![Version](https://img.shields.io/badge/version-4.2.9-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Short Name](https://img.shields.io/badge/short_name-TTV%20AB-blueviolet)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks ads on Twitch.tv streams.

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

### v4.2.9
- **Firefox Counter Sync Fix** - Cross-realm bridge messages are now normalized before storage updates, so `Ads Blocked` and `DOM Ads Blocked` persist correctly in Firefox instead of getting dropped by strict object-shape checks.
- **Firefox DOM Cleanup Counter Fix** - Repeated stale display-shell cleanup now increments `DOM Ads Blocked` once per unique residual ad-shell artifact, so Firefox cleanup activity is reflected instead of silently staying at `0`.
- **Firefox Silent Native Avoid Counting** - When Firefox preemptively reroutes an ad-capable native `PlaybackAccessToken` request from `site` to the forced recovery player type, the extension now confirms and counts that avoided ad once with an explicit console log instead of leaving `Ads Blocked` unchanged.

### v4.2.8
- **Display Ad Flash Fix** - Display ad overlays (banners, labels, countdown timers) are no longer briefly visible before being hidden. Expanded CSS coverage and optimized detection timing.
- **Faster Display Ad Cleanup** - Explicit ad signals now trigger immediate DOM cleanup with no confirmation delay. Inferred signals use a shorter 150ms window, down from 350ms.

### v4.2.7
- **Post-Ad Reload Loop Fix** - Ad recovery no longer falls back into a native post-ad reload path that could immediately restart the same ad sequence.
- **Player Resume Gating** - Post-ad playback restoration now respects whether the viewer was already playing instead of blindly nudging the player after every ad cycle.
- **Blocked Counter Stability** - Worker-side ad-end handling now ignores transient clean playlists and waits for confirmed clean media playlists before closing an ad cycle, preventing repeated counter inflation on the same ad pod.
- **Display Shell Cleanup Dedupe** - Stale display-shell cleanup now dedupes repeated cleanup passes on the same residual shell artifacts so layout resets and DOM cleanup counting do not keep retriggering on leftover player shells.
- **Worker Restart Now Works** - Worker crash recovery was attempting restarts with an already-revoked blob URL, causing all three recovery attempts to fail silently. Restarts now correctly create a fresh blob from the stored injected code.
- **Cross-Channel Reload Guard** - Background-tab workers can no longer trigger a player reload on the foreground channel when their own ad cycle ends.
- **ReloadAfterAd Default Corrected** - The `ReloadAfterAd` runtime flag fallback is now `false`, matching the feature's intended off-by-default setting.

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
