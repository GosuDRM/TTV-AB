# TTV AB

![Version](https://img.shields.io/badge/version-4.3.1-purple)
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

### v4.3.1
- **DOM Ad Cleanup Improvements** - Hardened the DOM ad counter logic against route-change race conditions.
- **Post-Ad Player Resume** - The extension now tracks pausing intent and preserves paused states after ad interruptions.
- **Ad-End Stability** - Ad-end checks are now debounced to survive brief buffering or clean playlist flashes without resetting.
- **Worker Crash Recovery** - Fixed blob URL lifecycle issues to ensure workers can successfully restart after crashing, and scoped ad-reload messages safely.

### v4.2.7
- **Post-Ad Reload Loop Fix** - Ad recovery no longer falls back into a native post-ad reload path that could immediately restart the same ad sequence.
- **Player Resume Gating** - Post-ad playback restoration now respects whether the viewer was already playing instead of blindly nudging the player after every ad cycle.
- **Blocked Counter Stability** - Worker-side ad-end handling now ignores transient clean playlists and waits for confirmed clean media playlists before closing an ad cycle, preventing repeated counter inflation on the same ad pod.
- **Display Shell Cleanup Dedupe** - Stale display-shell cleanup now dedupes repeated cleanup passes on the same residual shell artifacts so layout resets and DOM cleanup counting do not keep retriggering on leftover player shells.
- **Duplicate Worker Injection Removed** - A helper function was being injected into every worker blob twice, bloating each worker and risking a redeclaration error in strict environments.
- **Worker Restart Now Works** - Worker crash recovery was attempting restarts with an already-revoked blob URL, causing all three recovery attempts to fail silently. Restarts now correctly create a fresh blob from the stored injected code.
- **Cross-Channel Reload Guard** - Background-tab workers can no longer trigger a player reload on the foreground channel when their own ad cycle ends. The `ReloadPlayer` worker event now carries channel context and is gated by the same stale-channel check used by all other worker events.
- **ReloadAfterAd Default Corrected** - The `ReloadAfterAd` runtime flag fell back to `true` when the constant was undefined, which could silently enable post-ad reloads. The fallback is now `false`, matching the feature's intended off-by-default setting.

### v4.2.6
- **Popup Hardening Pass** - The popup now guards required UI nodes, storage failures, malformed saved stats, invalid locale values, and missing translation entries so it fails safely instead of breaking the UI.
- **Accessibility & UX Polish** - Improved keyboard/focus handling, native button semantics, live-region announcements, chart labels, helper text stability, reduced-motion behavior, and clearer footer/version accessibility labels.
- **Stats Reliability & Normalization** - Channel names, counters, daily buckets, achievement lists, and malformed persisted stats are now normalized more defensively; repeated stat writes are batched to reduce storage churn.
- **UI Toast Safety** - Welcome, donation, and achievement toasts now avoid duplicate scheduling/listeners, guard storage access and missing `document.body`, and keep external opens opener-safe.
- **Localization Cleanup** - Popup copy, footer hover labels, version labels, auto-language text, and locale metadata were polished so all shipped languages read more naturally.
- **Build / Release Guardrails** - `build.js` now enforces popup element/link wiring, locale parity, manifest/package metadata sync, docs wording, achievement parity, and other release-integrity checks for 4.2.6.

### v4.2.5
- **Worker Crash Loop Fixes** - Hardened worker/bootstrap message handling and playlist parsing so malformed frontpage, home, and outstream worker contexts are less likely to crash and restart continuously.
- **Worker State Sync** - New and restarted workers now receive current toggle, counter, ad-cycle, and pinned backup state immediately.
- **Backup Recovery Hardening** - Tightened playback token parsing, backup token request routing, and fallback selection so Twitch's newer GraphQL and worker behaviors are handled more reliably during ads.
- **Player Recovery Fixes** - Added guarded reloads when backup playback is selected and when ads end to reduce frozen, static, or audio-only recovery failures.
- **Toggle / Startup Sync Fixes** - Removed duplicate toggle propagation paths and reduced redundant startup state replay.
- **Stats & Storage Hardening** - Added stronger popup/bridge storage guards and safer stats retry behavior to reduce lost counts, stale stats, and achievement drift.
- **Recovery / Stability Fixes** - Improved hidden-tab crash recovery, stale ad-cycle cleanup, paused-player recovery, stale-channel handling during restore/ad-end flows, and post-ad player restore behavior.
- **Tooling Maintenance** - Build validation, Biome cleanup, and `knip` checks were tightened so worker helper mismatches and dead-code drift are caught earlier.

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
