# TTV AB

![Version](https://img.shields.io/badge/version-4.2.2-purple)
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

The current UI is a placeholder for now. The focus has been on making ad blocking stable first; visual polish will come later.

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

### v4.2.2
- **Live Stream Mapping Refresh** - Master playlist refreshes now rebuild per-stream URL and resolution mappings, preventing stale usher data from blocking backup stream selection after Twitch rotates playlist URLs.
- **Relative Playlist Resilience** - Variant playlist mappings now keep both raw and fully resolved URLs, so backup selection survives relative HLS entries and Twitch URL rotation more reliably.
- **Fallback Resolution Recovery** - Ad processing now falls back to the best known stream resolution when the current playlist URL is not mapped, avoiding hard failures during backup lookup.
- **GQL Hash Capture Hardening** - The main fetch hook now captures `PlaybackAccessToken` hashes from both `fetch(Request)` and `fetch(url, opts)` calls, keeping backup token generation aligned with Twitch.
- **Forced Native Token Alignment** - Native page `PlaybackAccessToken` requests are now rewritten to the configured forced player type and matching platform parameters, so the main player starts from the intended recovery path instead of drifting back to Twitch's default token flow.
- **Worker Hook Compatibility** - Worker interception now supports relative URLs and `URL` objects safely, while keeping native `Worker.prototype` untouched.
- **Worker Bootstrap Crash Fix** - Injected worker bootstraps now include the helper functions required by the current parser and processor runtime, fixing `MediaPlaylist` crashes such as `_getStreamInfoForPlaylist is not defined`.
- **Worker Broadcast Cleanup** - Worker state updates now prune dead workers automatically, reducing stale sync state after worker crashes or restarts.
- **Safer Playlist Stripping** - Media playlists now strip only explicit ad metadata and known ad-segment URL patterns instead of broadly classifying non-`,live` segments as ads.
- **False-Positive Ad Detection Fix** - The ad gate now requires explicit Twitch ad markers instead of triggering on generic `stitched` text alone, reducing cases where normal playback is misclassified as an ad break and forced into recovery.
- **Segment-Level Ad Detection Recovery** - Ad handling now also checks known ad segment URLs directly, so real ad playlists still enter blocking mode even when top-level playlist markers are sparse.
- **Fallback Ad Leak Fix** - Fallback playlist selection and playlist stripping now use the same ad-signal checks, so a backup playlist that is still ad-marked can no longer be accepted as "clean" and then leak visible ads during recovery.
- **Metadata-Driven Segment Stripping** - When Twitch serves an ad-marked fallback playlist without easily identifiable ad segment URLs, the stripper now force-removes those media segments instead of letting the ad render through fallback mode.
- **Recovery Buffer Improvement** - Empty-playlist recovery now restores up to 6 recent segments instead of 3, reducing post-ad buffering loops and spinner stalls.
- **Adaptive Backup Selection** - Backup stream recovery now remembers the last native `PlaybackAccessToken` player type Twitch used successfully and prioritizes that path first during ad recovery, reducing wasted retries before playback stabilizes.
- **Ad-Cycle Backup Pinning** - Once a backup player type is selected for an active ad break, the runtime now pins that choice across worker restarts instead of restarting backup selection from scratch on every reload.
- **Duplicate Reload Suppression** - Player reload requests are now debounced and rate-limited during ad recovery, reducing repeated reload loops and visible playback churn during a single ad cycle.
- **Crash Recovery Grace Window** - The crash monitor now waits briefly before refreshing on `Error #2000` during active ad recovery, giving the player time to stabilize instead of force-refreshing on the first transient error.
- **Minimal Recovery Hardening** - Post-reload minimal recovery no longer accepts ad-bearing backup playlists just to keep playback moving, preferring correctness over briefly showing ads.
- **Backup Cache Reuse Fix** - Backup master playlists are now kept cached across successful attempts and only invalidated on real failures or ad-bearing results, cutting unnecessary token churn during ad recovery.
- **Toggle State Sync** - Bridge state rebroadcasts now stay in sync with storage updates so popup toggles and `ttvab-request-state` cannot drift apart.
- **Local-Day Statistics** - Daily blocking statistics and weekly charts now use the user's local calendar day instead of UTC day boundaries, preventing day rollover glitches around midnight in non-UTC timezones.
- **Hidden-Tab Popup Scan Fix** - The popup blocker now respects Twitch's preserved native visibility getters, so hidden tabs stop doing visible-tab idle scan work after visibility spoofing is enabled.
- **Token Timeout Cleanup** - Backup token requests now always clear their abort timer, including failed requests.

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## ❤️ Support

If you enjoy TTV AB, consider buying me a coffee! ☕ Your support helps keep this project alive!

[![Donate](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B.svg)](https://ko-fi.com/gosudrm)

## 🔒 Privacy
This extension operates entirely locally and does not collect any user data. See [PRIVACY.md](PRIVACY.md) for details.

## 📄 License

MIT License with Attribution - See [LICENSE](LICENSE) for details.

