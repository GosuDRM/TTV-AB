# TTV AB

![Version](https://img.shields.io/badge/version-9.8.2-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Tests](https://github.com/GosuDRM/TTV-AB/actions/workflows/ci.yml/badge.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Firefox](https://img.shields.io/amo/v/ttv-ab-twitch-ad-blocker?label=firefox&color=orange)
![Chrome](https://img.shields.io/badge/chrome-9.8.2-yellow)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks Twitch ads on live streams and VODs while keeping playback stable.

## 📥 Install

| Store | Link | Status |
|-------|------|--------|
| Firefox Add-ons | [TTV AB - Twitch Ad Blocker](https://addons.mozilla.org/en-GB/firefox/addon/ttv-ab-twitch-ad-blocker/) | Stable |
| Chrome Web Store | [TTV AB - Lightweight, powerful ad blocker](https://chromewebstore.google.com/detail/ttv-ab-lightweight-powerf/mlifbfmeoafhcccmppaolojdglcbkdkg) | Stable |


<p align="center">
  <img src="assets/popup1.png" alt="Default Theme" width="300">
  <img src="assets/popup2.png" alt="Retro Theme" width="300">
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
- ✅ Modern, animated UI (Retro/Neon aesthetic)
- ✅ **Theme Picker** - switch between the default Retro synthwave theme and the original Neon theme via two color circles in the popup
- ✅ Lightweight and fast

## 🚀 Usage

1. Install the extension from your browser's add-on store
2. Navigate to [twitch.tv](https://twitch.tv) and open any live stream or VOD
3. Ads are blocked automatically — no configuration needed
4. Click the extension icon to view stats or toggle Ad Blocking, Ad Spoofing, and Low Quality Fallback
5. Change language via the dropdown in the popup footer

## ⚙️ How It Works

TTV AB intercepts Twitch's HLS video playlists at the network level. When Twitch injects ad-marked segments or forces the player onto an ad-only path, the extension:

- Strips ad segments from M3U8 media playlists in real time
- Fetches clean backup streams using alternative player types when the native stream is ad-locked
- Serves a valid empty video segment in place of blocked ad content to keep the decoder stable
- Monitors playback health and automatically recovers from stalls after ad breaks
- Restores your original quality and volume settings once native playback resumes

When a channel opens during an ad — or an ad starts mid-stream — the extension switches to a clean backup stream within a couple of seconds so video starts playing right away. The backup targets the quality your connection has been sustaining — even if the player had just restarted on a low rung when the ad hit — with a 360p floor so a channel-open preroll (the player is still ramping up from its lowest quality at that point) never starts blurrier than 360p. Your full native quality and audio are restored automatically and seamlessly once the ad window ends. The optional **Low Quality Fallback** toggle trades some quality for an even faster first frame, starting on a quick low-resolution stream and climbing back up as the break ends.

## 🔔 What's New

### v9.8.2 — 2026-06-11
- **Updates take effect in open tabs again.** Installing an extension update with Twitch tabs open now hands those pages over to the new version correctly; since 9.7.4 an internal version marker had stopped being bumped, leaving already-open tabs running the old script until a manual reload. The marker is now derived from the release version and enforced by the build so it can never drift again.

### v9.8.1 — 2026-06-11
- **Picture-in-picture and background tabs are first-class now.** Watching in PiP counts as actively watching, so playback monitors run at full speed; ad-break stall and freeze recovery keeps working in background tabs and PiP; a post-ad reload no longer closes your PiP window (it waits until you exit PiP); and a dead stream in a hidden tab recovers on its own instead of waiting for focus.

### v9.8.0 — 2026-06-11
- **Smoother channel switching and first-class VOD ad handling.** Switching channels mid-ad-break no longer leaves muted players behind, backup searches share one in-flight run instead of racing each other, VODs return to the right playhead position after a post-ad reload, and VOD ad breaks now get the same stall, freeze, and mute protections as live streams.

### v9.7.6 — 2026-06-11
- **Backups keep your real quality after a player hiccup.** When the player restarted itself on auto quality moments before an ad, the backup could pin to the temporary 360p ramp-up rung for the whole break; backups now follow your actual sustained quality, and only an explicitly chosen quality overrides it. Extra-long ad pods also no longer bump the "Ads Blocked" counter a second time mid-break.

### v9.7.5 — 2026-06-11
- **No more purple-screen freezes on client-side ad breaks.** A midroll whose ad markers lingered could freeze the backup stream for up to 90 seconds behind Twitch's purple "commercial break" slate. The backup now keeps refreshing live through the entire break, a playhead stuck at a buffer gap seeks past it within seconds even mid-ad, and Twitch's separate ad player element is muted the moment it appears.

### v9.7.4 — 2026-06-11
- **Stable, full-quality ad breaks.** A midroll now resolves in one clean cycle instead of repeatedly flickering between backup and native, the backup plays at the quality you were actually watching instead of dropping to 360p, and a post-ad freeze that could stall playback for ~30 seconds is now skipped past within a few seconds. Also smooths out micro-stutters on the backup stream and quiets duplicate ad spoofing.

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
