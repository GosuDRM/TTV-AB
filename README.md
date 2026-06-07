# TTV AB

![Version](https://img.shields.io/badge/version-9.3.1-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Tests](https://github.com/GosuDRM/TTV-AB/actions/workflows/ci.yml/badge.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Firefox](https://img.shields.io/amo/v/ttv-ab-twitch-ad-blocker?label=firefox&color=orange)
![Chrome](https://img.shields.io/badge/chrome-9.3.1-yellow)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks Twitch ads on live streams and VODs while keeping playback stable.

## 📥 Install

| Store | Link | Status |
|-------|------|--------|
| Firefox Add-ons | [TTV AB - Twitch Ad Blocker](https://addons.mozilla.org/en-GB/firefox/addon/ttv-ab-twitch-ad-blocker/) | Active |
| Chrome Web Store | [TTV AB - Lightweight, powerful ad blocker](https://chromewebstore.google.com/detail/ttv-ab-lightweight-powerf/mlifbfmeoafhcccmppaolojdglcbkdkg) | Pending approval |


<p align="center">
  <img src="assets/popup1.png" alt="Popup Screenshot" width="300">
</p>

## ✨ Features

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

## 🚀 Usage

1. Install the extension from your browser's add-on store
2. Navigate to [twitch.tv](https://twitch.tv) and open any live stream or VOD
3. Ads are blocked automatically — no configuration needed
4. Click the extension icon to view stats, toggle ad blocking on/off, or toggle the Buffer Fix
5. Change language via the dropdown in the popup footer

## ⚙️ How It Works

TTV AB intercepts Twitch's HLS video playlists at the network level. When Twitch injects ad-marked segments or forces the player onto an ad-only path, the extension:

- Strips ad segments from M3U8 media playlists in real time
- Fetches clean backup streams using alternative player types when the native stream is ad-locked
- Serves a valid empty video segment in place of blocked ad content to keep the decoder stable
- Monitors playback health and automatically recovers from stalls after ad breaks
- Restores your original quality and volume settings once native playback resumes

During ad recovery, Twitch may briefly serve a lower-quality backup stream (e.g. 360p) while the extension keeps playback alive. Your chosen quality is restored automatically once the ad window ends.

## 🔔 What's New

### v9.3.1 — 2026-06-07
- **No more flash-freeze during the LQ→HQ quality upgrade.** During an ad, you briefly get a 360p (LQ) backup stream so playback starts almost instantly; the moment a clean HQ source is found, the extension switches you over. Previously the upgrade could fire after only a few seconds, before the LQ stream's buffer was full — so the source swap emptied the buffer and the player stalled for a fraction of a second while it rebuilt from the live edge. The LQ stream is now held for at least 8 seconds before the upgrade is allowed, which is plenty of time for the buffer to fill. The upgrade still happens the instant a clean HQ stream is available, you just no longer see the freeze.

### v9.3.0 — 2026-06-07
- **Near-instant video when you open a channel that's on an ad:** a preroll used to leave the player black for ten seconds or more while the extension worked through every player type looking for a clean stream. It now goes straight to the most reliable ad-free source first, so video starts in about two seconds instead — beginning at 360p and upgrading to your normal quality automatically and seamlessly once the ad ends. The same quick path now also applies to mid-stream ads.

### v9.2.3 — 2026-06-06
- **Worker injection hardened against blob: failures ([#32](https://github.com/GosuDRM/TTV-AB/issues/32)):** The blob: Worker had no MIME type and a 0ms revocation timeout — the blob was destroyed before the Worker loaded. Now has explicit `text/javascript` type, 30s revocation, and an 8s heartbeat with page-side M3U8 fallback if the Worker fails.

### v9.2.2 — 2026-06-06
- **Crashed playback workers now actually recover:** the watchdog could never detect a hung worker (posting to a dead worker never fails), and "restarts" spawned an orphan worker Twitch never used — so a dead worker stayed dead. Workers now reply to a liveness ping, the watchdog acts only when a pong is missed for 15s, and recovery reloads the player so Twitch creates a fresh, fully-wired worker (with a 30s cooldown to avoid reload loops).
- **"Ads Blocked" no longer overshoots after a connection blip:** queued counter updates were summed without a cap while the messaging bridge was down; the merged increment is now clamped to the real total.
- **The active stream is no longer evicted from the worker cache:** the URL→stream table now drops least-recently-used entries instead of oldest-inserted, preventing brief moments where ads slipped through on the stream you're watching.
- **Hardened against stat tampering:** the background worker now only accepts counter messages from the extension itself.
- **Popout / Picture-in-Picture hooks fail safe:** they can no longer throw into Twitch's own code and break login popups, clip sharing, or PiP.
- **Recovery timers respect channel switches:** post-ad and handoff timers no longer pause or seek the wrong stream after a fast channel change.

### v9.2.1 — 2026-06-02
- **Seamless LQ→HQ hold works even with "Low quality fallback" disabled:** The 9.2.0 emergency autoplay injection relied on a check that ran before the main loop, so it never fired on the first call. The injection is now unconditional when the toggle is off — autoplay is appended to the backup-search order as a last-resort type. When all configured types are contaminated, the loop reaches autoplay, finds a clean 360p stream, and the existing seamless-hold path transitions cleanly back to HQ native playback when the ad cycle ends. Same UX as when the toggle is enabled, with no ad flash and no black screen.

### v9.2.0 — 2026-06-02
- **Emergency LQ autoplay fallback when toggle is off:** With "Low quality fallback" disabled, the extension now still tries the 360p autoplay stream as a last-resort fallback when all primary types (embed/popout/site) are ad-marked. During ads, the LQ stream plays; when the ad ends, the existing seamless-hold mechanism switches you back to HQ native. Logs an explicit override message so the behavior is visible.
- **No more ad-flash loop when all backups are contaminated:** Ad-marked fallbacks are no longer cached as "clean", so the seamless-hold → native-restoration path engages only with truly clean sources. Previously, a poisoned cache caused the empty-playlist recovery to return the original ad-filled playlist, looping until the ad ended naturally.

### v9.1.5 — 2026-06-02
- Fix Low Quality Fallback and Ad Spoofing toggles silently re-enabling after a player reload or page navigation — feature-disable flags are now seeded into freshly-created Twitch workers, not just patched on already-running ones, so the setting persists

_See [CHANGELOG.md](CHANGELOG.md) for the complete list of changes._

## 🛠️ Development

```sh
git clone https://github.com/GosuDRM/TTV-AB.git
cd TTV-AB
npm install
npm run build          # compiles TypeScript, minifies, and bundles
npm run package:chrome # creates Chrome Web Store upload archive
npm run lint           # runs Biome linter
npm run knip           # checks for unused exports
```

The build outputs to `dist/`. Load the unpacked extension from `dist/manifest.json` in your browser's developer mode after building.

The source tree under `src/` is organized by concern — `modules/` for core ad-blocking logic (processor, parser, player, hooks, worker, state, API), `scripts/` for the bridge and background service worker, and `popup/` for the extension UI.

## 💬 Support

- Found a bug? [Open an issue](https://github.com/GosuDRM/TTV-AB/issues)
- Want to contribute? Pull requests are welcome
- If TTV AB saves you from ads, consider supporting development:

[![Donate](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B.svg)](https://ko-fi.com/gosudrm)

## 🔒 Privacy

TTV AB operates entirely on your device. No data is ever sent to external servers — not your browsing history, not your Twitch activity, not your ad-block statistics. All counters and settings are stored in your browser's local storage. See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## 📄 License

MIT License with Attribution — See [LICENSE](LICENSE) for details.
