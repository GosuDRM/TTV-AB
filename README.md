# TTV AB

![Version](https://img.shields.io/badge/version-6.1.3-purple)
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

### v6.1.3
- **Live Direct-Ad Video Cleanup** - Direct player ad videos served from Twitch's Amazon media path are now suppressed on live streams too instead of only VOD pages.
- **Picture-in-Picture Token Isolation** - Picture-in-Picture and mini-player playback token requests no longer overwrite the stored native recovery player type used by normal stream recovery.
- **Background Playback Hardening** - Visibility state is now hardened so ad recovery is less likely to pause or stall when Twitch is running in a background tab.
- **Stable Ad-End Detection** - Ad recovery now waits for a stable clean native stream window before ending the block cycle, which prevents the blocker from immediately re-arming during shaky post-ad transitions.
- **Pinned Backup Cooldown** - The worker now reuses the last good backup path first and cools down recently rejected backup player types, which cuts down repeated embed/popout/autoplay churn during long ad pods.
- **Post-Ad Resume Intent Tracking** - The page now records whether the stream was actively playing when the ad cycle started, so ad-end recovery can correctly resume playback instead of dropping into a stalled paused state.
- **Post-Ad Stall Watchdog** - The post-ad recovery watchdog is now fully wired into the live buffer monitor, allowing Twitch's native return path to escalate through pause/play and guarded reload recovery instead of hanging after `AdEnded`.
- **Softer Native Return Reload** - The first native player return after an ad now reuses the existing player instance instead of forcing a brand-new one immediately, reducing black-screen and post-ad stall cases during the backup-to-native handoff.

### v6.1.1
- **Firefox Runtime Parity** - Firefox now uses the current main-branch ad-blocking runtime instead of the stale forked Firefox logic, keeping only the browser-specific packaging and worker bootstrap differences.
- **Picture-in-Picture Recovery** - Included the merged [PR #4](https://github.com/GosuDRM/TTV-AB/pull/4) (`Support PiP mode`) fix so reload recovery downgrades to the existing pause/play path while Picture-in-Picture is active, instead of creating a new player instance and forcing PiP to close. Thanks [@ryanbr](https://github.com/ryanbr).

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
