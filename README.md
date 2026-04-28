# TTV AB

![Version](https://img.shields.io/badge/version-6.5.9-purple)
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
- ✅ Cleans up stale Twitch ad UI during and after recovery
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

### v6.5.9
- **More Stable Ad-End Handoff** - Clean playlist candidates now need to stay clean longer before the player reloads, reducing immediate post-ad recovery restarts when Twitch briefly serves clean playlists and then returns ad markers.
- **Faster Backup Selection** - Backup selection now tries the autoplay path first before falling back to the other player paths, trimming the initial recovery startup delay.

### v6.5.8
- **Simplified Ad-End Recovery** - Removed the background native-token probe loop from ad-end detection. Recovery now ends after a short run of clean playlist observations, then reloads the player normally, reducing hidden state and long-running ad-blocking progress.
- **Simpler Backup Selection State** - Removed backup retry cooldown state and the separate backup-playback event path so backup selection follows the direct configured-player fallback order again.

### v6.5.7
- **Faster Backup Progress Recovery** - Clean backup playback now clears stale Twitch ad/progress UI as soon as the backup stream is active, while native recovery continues in the background until the real stream is safe to reload.
- **Lower Backup Polling Churn** - Very fresh clean backup playlists are reused instead of being rechecked immediately, and the previous clean backup type is preferred for the same stream to reduce repeated token and playlist requests during long ad windows.

### v6.5.6
- **Post-Ad Re-Entry Guard** - Same-stream ad markers that arrive shortly after a post-ad reload now stay attached to the previous recovery cycle for up to 15 seconds, preventing duplicate ad-blocking progress when Twitch's handoff is slow.
- **Duplicate Ad-End Suppression** - Ad-end completion now ignores stale async recovery probes from an already-reset ad session, preventing double `Ad ended` events and duplicate post-ad reload attempts.

### v6.5.5
- **Faster Ad-End Exit** - Once the extension is past `AdEndMaxWaitMs` and already holding a clean backup stream, a single clean native probe is enough to declare the ad ended, skipping the extra backup-poll cycle that used to be needed for the second probe. Trims roughly 2-3 seconds off the post-content tail on streams where Twitch's native playlist clears the ad markers slowly. ([#7](https://github.com/GosuDRM/TTV-AB/issues/7))

### v6.5.4
- **Post-Ad Recovery With Buffer Fix Off** - The buffer monitor no longer skips post-ad recovery when the Buffer Fix toggle is off, so users who keep that toggle disabled get the same dead-frame and grace-window recovery as everyone else. ([#7](https://github.com/GosuDRM/TTV-AB/issues/7))
- **Faster Dead-Frame Recovery** - The grace watcher now skips its programmatic pause/play step on `videoWidth = 0` stalls (where pause/play can't help) and goes straight to the soft reload, cutting the visible black-screen duration on frequent-ad streams. ([#7](https://github.com/GosuDRM/TTV-AB/issues/7))
- **Cross-Tab Volume Fix** - Preference snapshot now restores to `localStorage` before the media player rebuilds, so the new player no longer initializes at another tab's volume and "jumpscares" you after an ad ends.

### v6.5.3
- **Refreshed Extension Icon** - New 16/48/128 px icon set across the toolbar action and add-on listing for a cleaner, more recognizable mark.

### v6.5.2
- **Report a Bug Button** - Added a one-click "Found a Bug? Report it" button in the popup that opens the GitHub Issues page in a new tab, making it easier to send bug reports without hunting for the repo link.
- **Localized Report Bug Label** - The new button text and tooltip are translated across all 11 supported locales (English, Spanish, French, German, Portuguese, Italian, Japanese, Korean, Simplified Chinese, Traditional Chinese, Russian).
- **Translation Naturalness Pass** - Cleaned up several strings to read more natively: Japanese `allUnlocked` (`解除済み` → `達成済み`), Russian `timeSaved` (dropped awkward "Примерно" prefix), Russian `next` (`Следующее` → `Далее`), Simplified Chinese `reportBugLabel` (less literal phrasing), Korean `reportBugLabel` (consistent honorific tone), Portuguese `channels_50` (localized `Globetrotter` → `Viajante mundial`), and German `bufferFix` (`Puffer-Korrektur` → `Puffer-Fix`).

### v6.5.1
- **Post-Ad Stall Grace Window** - Adds a 90-second post-ad grace watcher that nudges the player with a programmatic pause/play when `currentTime` stops advancing or `videoWidth` drops to 0 after the ad-resume intent has cleared, escalating to a soft reload and finally a fresh media player instance if the stall persists. Catches the residual black-screen stalls that hit 10-30 seconds after quality restoration on stream with frequent ads. ([#7](https://github.com/GosuDRM/TTV-AB/issues/7))

### v6.5.0
- **BetterTTV Compatibility** - Stopped spoofing `document.hidden`/`visibilityState` and swallowing `visibilitychange` events so BetterTTV's "Mute Invisible Player" (and other visibility-driven extensions) work again. The extension still resumes playback if Twitch pauses on tab hide. ([#9](https://github.com/GosuDRM/TTV-AB/issues/9))

### v6.4.9
- **Clip Editor Compatibility** - The extension no longer activates on Twitch clip editor pages, so dragging the clip selection range plays back normally instead of freezing the preview. ([#8](https://github.com/GosuDRM/TTV-AB/issues/8))
- **Post-Ad Black Screen Recovery** - Detects frozen frames (no advancing `currentTime`, zero `videoWidth`, or `readyState < 2`) right after ad recovery and rebuilds the player instance instead of waiting out the 10s soft-reload window, so streams no longer go black a couple of seconds after quality restoration. ([#7](https://github.com/GosuDRM/TTV-AB/issues/7))
- **Reload Escalation** - If the first post-ad reload doesn't restore playback, the next reload swaps the media player instance instead of reusing the same stuck pipeline. ([#7](https://github.com/GosuDRM/TTV-AB/issues/7))

### v6.4.8
- **Two-Probe Native Recovery** - Firefox now waits for two clean native recovery probes before ending an ad cycle, reducing false post-ad reloads during Twitch's pre-roll handoff.
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
