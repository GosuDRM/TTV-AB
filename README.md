# TTV AB

![Version](https://img.shields.io/badge/version-4.2.5-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight Chromium-based browser extension that blocks ads on Twitch.tv streams.

## Install

- Chrome Web Store: [TTV AB - Lightweight, powerful ad blocker](https://chromewebstore.google.com/detail/ttv-ab-lightweight-powerf/mlifbfmeoafhcccmppaolojdglcbkdkg) `(Latest)`
- Firefox Add-ons: [TTV AB - Twitch Ad Blocker](https://addons.mozilla.org/en-GB/firefox/addon/ttv-ab-twitch-ad-blocker/) `(Latest)`

<p align="center">
  <img src="assets/popup-screenshot.png" alt="Popup Screenshot" width="300">
  <img src="assets/popup-screenshot2.png" alt="Stats Screenshot" width="300">
</p>


## ✨ Features

- ✅ Blocks preroll and midroll ads
- ✅ **Blocks anti-adblock popups** ("Support streamer by disabling ad block")
- ✅ No purple screen errors
- ✅ Works with all stream qualities
- ✅ Manifest V3 compatible
- ✅ Simple enable/disable toggle
- ✅ Auto-refresh on player crash
- ✅ Persistent "Ads Blocked" & "Popups Blocked" statistics
- ✅ **Statistics Dashboard** with time saved, weekly charts, and achievements
- ✅ **12 Achievement Badges** to unlock as you block ads
- ✅ **Language Selector** - 11 languages supported (EN, ES, FR, DE, PT, IT, JA, KO, ZH-CN, ZH-TW, RU)
- ✅ Per-channel ad blocking breakdown
- ✅ Modern, animated UI (Cyberpunk/Neon aesthetic)
- ✅ Lightweight and fast

## 📖 Usage

1. Navigate to [twitch.tv](https://twitch.tv)
2. Open any live stream
3. Ads will be automatically blocked
4. Click the extension icon and use the toggle to enable/disable
5. Change language via the dropdown in the footer

## ⚙️ How It Works

The extension intercepts Twitch's HLS video playlists and:
- Strips ad segments from M3U8 playlists
- Fetches backup ad-free streams when ads are detected
- Caches ad segments to prevent playback

## ✨ What's New

### v4.2.5
- **Worker Crash Loop Fixes** - Hardened worker/bootstrap message handling and playlist parsing so malformed frontpage, home, and outstream worker contexts are less likely to crash and restart continuously.
- **Worker State Sync** - New and restarted workers now receive current toggle, counter, ad-cycle, and pinned backup state immediately.
- **Toggle / Startup Sync Fixes** - Removed duplicate toggle propagation paths and reduced redundant startup state replay.
- **Stats & Storage Hardening** - Added stronger popup/bridge storage guards and safer stats retry behavior to reduce lost counts, stale stats, and achievement drift.
- **Recovery / Stability Fixes** - Improved hidden-tab crash recovery, stale ad-cycle cleanup, paused-player recovery, and stale-channel handling during restore/ad-end flows.

### v4.2.4
- **Display Ad Detection Tightening** - Refined stream-display and PIP shell detection to require stronger visible ad signals before counting or collapsing anything.
- **Ad Label Gating** - Visible `Ad` labels near the player are no longer enough on their own; DOM-side cleanup now also requires a matching shell, PIP, or layout-state signal.
- **Offline Page Ad Handling** - Dedicated offline channel-page promo ad detection so Twitch's non-live "watch after this break" cards can be hidden and counted correctly.
- **False-Positive Ad Count Fixes** - Clean channels are less likely to increment `Ads Blocked` from leftover layout classes, label-only false positives, or geometry-only shell inference.
- **Black Screen With Audio Fix** - Fixed a regression where overly broad display-ad cleanup could leave the player visually black while audio kept playing.
- **30+ Bug Fixes** - Includes fixes for backup cache data structure, minify name collision, tab visibility auto-resume, popup chart average reset, worker header updates, cross-tab counter races, and more.

### v4.2.3
- **Ad Recovery Stability** - Reworked backup stream recovery so Twitch token, playlist, and reload handling stay synchronized more reliably during preroll and midroll transitions.
- **Display Ad Shell Handling** - Expanded DOM-side cleanup for Twitch's newer stream-display / PIP ad layouts.
- **Worker and Playlist Hardening** - Strengthened worker bootstrap, playlist parsing, and fallback validation for more robust recovery.
- **Reload and Buffer Loop Fixes** - Reduced duplicate ad-recovery reloads, false-positive refreshes, and unstable fallback transitions.
- **Cross-Tab Bug Fixes** - Fixed cross-tab counter races, stats clobber, health check false positives, and toggle state propagation across all open tabs.

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## ❤️ Support

If you enjoy TTV AB, consider buying me a coffee! ☕ Your support helps keep this project alive!

[![Donate](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B.svg)](https://ko-fi.com/gosudrm)

## 🔒 Privacy
This extension operates entirely locally and does not collect any user data. See [PRIVACY.md](PRIVACY.md) for details.

## 📄 License

MIT License with Attribution - See [LICENSE](LICENSE) for details.

