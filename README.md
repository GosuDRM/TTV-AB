# TTV AB

![Version](https://img.shields.io/badge/version-6.5.1-purple)
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

### v6.5.1
- **Post-Ad Stall Grace Window** - Adds a 90-second post-ad grace watcher that nudges the player with a programmatic pause/play when `currentTime` stops advancing or `videoWidth` drops to 0 after the ad-resume intent has cleared, escalating to a soft reload and finally a fresh media player instance if the stall persists. Catches the residual black-screen stalls that hit 10-30 seconds after quality restoration on stream with frequent ads. ([#7](https://github.com/GosuDRM/TTV-AB/issues/7))

### v6.5.0
- **BetterTTV Compatibility** - Stopped spoofing `document.hidden`/`visibilityState` and swallowing `visibilitychange` events so BetterTTV's "Mute Invisible Player" (and other visibility-driven extensions) work again. The extension still resumes playback if Twitch pauses on tab hide. ([#9](https://github.com/GosuDRM/TTV-AB/issues/9))

### v6.4.9
- **Clip Editor Compatibility** - The extension no longer activates on Twitch clip editor pages, so dragging the clip selection range plays back normally instead of freezing the preview. ([#8](https://github.com/GosuDRM/TTV-AB/issues/8))
- **Post-Ad Black Screen Recovery** - Detects frozen frames (no advancing `currentTime`, zero `videoWidth`, or `readyState < 2`) right after ad recovery and rebuilds the player instance instead of waiting out the 10s soft-reload window, so streams no longer go black a couple of seconds after quality restoration. ([#7](https://github.com/GosuDRM/TTV-AB/issues/7))
- **Reload Escalation** - If the first post-ad reload doesn't restore playback, the next reload swaps the media player instance instead of reusing the same stuck pipeline. ([#7](https://github.com/GosuDRM/TTV-AB/issues/7))

### v6.4.8
- **Two-Probe Native Recovery** - The extension now waits for two clean native recovery probes before ending an ad cycle, reducing false post-ad reloads during Twitch's pre-roll handoff.
- **Pre-Roll Handoff Stability** - Same-stream ad markers that arrive immediately after an ad-end reload stay tied to the active recovery cycle until playback settles.

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
