# TTV AB

![Version](https://img.shields.io/badge/version-23.0.1-purple)
![License](https://img.shields.io/badge/license-MIT--based%20with%20attribution-green)
![Tests](https://github.com/GosuDRM/TTV-AB/actions/workflows/ci.yml/badge.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Firefox](https://img.shields.io/amo/v/ttv-ab-twitch-ad-blocker?label=firefox&color=orange)
![Chrome](https://img.shields.io/badge/chrome-23.0.1-yellow)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks Twitch ads on live streams and VODs while keeping playback stable.

## 📥 Install

> **⚠️ Supported browsers: Firefox and Chromium-based desktop browsers only.** TTV AB can't run on WebKit-based browsers like Orion, or on anything on iOS/iPadOS (every iOS browser is WebKit under the hood). The ad-blocker can't load there and the player goes to a black screen, so please use Firefox or a Chromium-based browser on a computer.

| Store | Link | Status |
|-------|------|--------|
| Firefox Add-ons | [TTV AB - Twitch Ad Blocker](https://addons.mozilla.org/en-GB/firefox/addon/ttv-ab-twitch-ad-blocker/) | Stable |
| Chrome Web Store | [TTV AB - Lightweight, powerful ad blocker](https://chromewebstore.google.com/detail/ttv-ab-lightweight-powerf/mlifbfmeoafhcccmppaolojdglcbkdkg) | Stable |


<p align="center">
  <img src="assets/popup2.png" alt="Retro Theme" width="300">
  <img src="assets/popup3.png" alt="Channel Stats Card" width="300">
</p>

## ✨ Features

- ✅ Blocks preroll and midroll ads on live streams and Twitch VODs
- ✅ Keeps a clean backup stream playing during ad breaks to reduce black screens, purple screens, and stalls
- ✅ Returns to native video quality and audio after recovery, including enhanced HEVC and AV1 qualities when available
- ✅ Keeps recovery working in background tabs and Picture-in-Picture
- ✅ Removes stale Twitch ad overlays after playback returns
- ✅ Independent, live-updating controls for Ad Blocking, Ad Spoofing, and Low Quality Fallback
- ✅ Optional Ad Spoofing to reduce anti-adblock detection
- ✅ Optional Low Quality Fallback for faster recovery; disabling it prioritizes normal-quality sources, with a temporary clean low-quality bridge available during prerolls and midrolls
- ✅ Optional Ad Break Timer in the stream's top-right corner, disabled by default
- ✅ Optional Turbo Mode that pauses new statistics and achievements while preserving existing history and all ad-blocking controls
- ✅ Persistent, live-updating Ads Blocked and Time Saved totals
- ✅ Statistics dashboard with weekly charts, detailed per-channel history, and **12 Achievement Badges**
- ✅ Language selector, with 12 languages supported (EN, ES, FR, DE, PT, IT, JA, KO, ZH-CN, ZH-TW, RU, UK)
- ✅ Built-in Generate Log tool that creates a local, privacy-filtered diagnostic file for bug reports
- ✅ Accessible Manifest V3 popup with Retro and Neon themes
- ✅ Supports Firefox and Chromium-based desktop browsers

## 🚀 Usage

1. Install the extension from your browser's add-on store
2. Navigate to [twitch.tv](https://twitch.tv) and open any live stream or VOD
3. Ads are blocked automatically, no configuration needed
4. Click the extension icon to view stats or toggle Ad Blocking, Ad Spoofing, Low Quality Fallback, and Ad Break Timer
5. Change language via the dropdown in the popup footer

## ⚙️ How It Works

TTV AB checks Twitch's HLS playlists before playback and blocks recognized client-side ad requests on VODs.

<p align="center">
  <img src="assets/pipeline.svg" alt="Animated ad-blocking pipeline: the Twitch player worker passes clean playlists through unchanged, rejects ad-marked media, keeps a verified clean backup live, and restores native playback only after repeated clean checks." width="860">
</p>

- Checks alternative Twitch sources one at a time, using a fresh clean native playlist or a compatible silent hold while searching
- Plays only verified, playable, ad-free backups, refreshes them during the break, and rotates stalled sources
- Continues each switch between sources, including the return to native, from the point the live stream reached, so playback does not jump back
- Returns to native playback after repeated clean checks for the same stream and break, then restores quality and audio settings
- Keeps recovery tied to the current player across background tabs and Picture-in-Picture, respecting explicit pauses

**Low Quality Fallback** is on by default, allowing a clean 360p bridge sooner while higher-quality sources are checked. Turning it off prioritizes normal-quality sources; prerolls and midrolls may still use a temporary clean low-quality bridge if those sources fail. Other sources may still offer lower qualities.

**Ad Spoofing** sends Twitch progress and completion signals for blocked ads and, outside midrolls, requests the blocked ad's segments in the background. Turning it off stops both and leaves ad blocking active.

The optional **Ad Break Timer** is off by default and can be switched on in the popup. It tracks the current break until it ends; it does not predict when your selected quality will return.

## 🔔 What's New

### v23.0.0 - 2026-10-15

- **Midroll Rewind** - Continue the backup stream from exactly where the live stream left off when a midroll starts, instead of jumping back a few seconds and replaying them with Twitch Low Latency on. Switching to another backup during the break and returning to the live stream afterwards continue the same way.
- **Midroll Start** - Switch to the backup stream as soon as it is ready when a midroll starts, instead of waiting a few seconds for its next segment or showing a short black screen. Switching to HD during the break and returning to the live stream afterwards no longer wait for the next segment either.
- **Slow Connections** - Wait twice as long before each repeated reload when the player keeps running out of video, so a slow connection that needs a few seconds per segment is no longer stuck reloading every few seconds. A truly stuck player is still reloaded, and the shorter wait returns after five minutes without such a reload.
- **Ad Spoofing Toggle** - Stop downloading ad segments for Twitch while Ad Spoofing is off, download them one at a time instead of cancelling the previous one, and stop downloading them for the rest of a midroll once it is identified, so a slow connection keeps more bandwidth for the stream when it starts on an ad.
- **Ad Completion Reports** - Count a report that Twitch answers with an error as failed instead of sent, and stop a replacement player started during an ad break from reporting the same ads again.
- **Previews for Twitch Quality** - Follow the player quality set by the Previews for Twitch extension, and ask it to re-apply that quality after the player reloads, so the stream no longer drops to Twitch's saved quality after an ad break.
- **Midroll Start Diagnostics** - Log one line per midroll that starts without ad segments, showing what the stream offered and whether playback waited for a backup, reused the last clean playlist, or showed the silent hold. Also log when the player cancels a request that is waiting for a backup and when a background backup search fails.
- **Ad Break Type Diagnostics** - Name the ad break type, preroll or midroll, in each ad break summary, and log when the type cannot be recorded because the page is on other media.
- **Ad Spoofing Diagnostics** - Say in the log that ad completion reports were sent rather than completed, show which stream is playing at the time, and warn once per ad break, instead of once per session, when Twitch's ad markers cannot be reported.

### v22.0.3 - 2026-10-14

- **Ended Stream Reloads** - Stop reloading the player every couple of seconds when a live stream ends, and space out end-of-stream recovery like the other playback fixes.
- **Offline Playback** - Pause the stall fixes while the browser is offline instead of pausing and reloading the player during a connection drop, so playback resumes from its buffer once the connection is back.
- **Quieter Background Logs** - Log a hidden tab's late worker heartbeat once per step instead of repeating it past the limit while waiting before recovery.
- **Smoother Return From HD Backups** - Return to Twitch's own stream without rebuilding the player when it trails the HD backup by less than a segment, by waiting a moment for the next segment instead of reloading for several seconds.
- **Diagnostic Saves** - Save the crash diagnostics snapshot only when the log has changed, or at most once a minute, instead of every 15 seconds.
- **Buffer Gap Diagnostics** - Show the player's buffered ranges and the active backup in the log when playback jumps over a gap in its buffer, to help trace short freezes at the start of a break.

### v22.0.2 - 2026-10-14

- **Playback While Away** - Stop the check for frozen video after an ad break from pausing or reloading the stream while the tab is hidden, since browsers stop drawing video in background tabs on purpose.
- **Media Keys** - Keep a pause from keyboard media keys, headset buttons, or system media controls while Twitch is out of focus, instead of resuming the stream on its own.
- **Background Resume** - Retry restarting playback a few times after a quick pause in a hidden tab, so the stream no longer stays paused until you return.
- **HD Switch With Several Sources** - Keep each HD source's clean time while sources take turns falling slightly behind the 360p backup, so long breaks can still switch to HD instead of staying at 360p.

_See [CHANGELOG.md](CHANGELOG.md) for the complete list of changes._

## 🛠️ Development

Use the `main` branch for Chrome or `firefox` for Firefox. With Node.js 22 and Python 3 installed, `npm ci` installs dependencies and `npm run build` creates `dist/` and the browser packages.

Edit the TypeScript source, never `dist/`:

- `src/modules/`: stream handling, ad blocking, and playback recovery
- `src/scripts/`: background script and page bridge
- `src/popup/`: popup, themes, and translations
- `tests/`: regression tests

Tests read `dist/`, so build before running the checks:

```sh
npm run build && npm test && npm run test:shuffle && npm run lint && npm run typecheck && npm run knip
```

To try a build, [load `dist/` unpacked](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) in Chrome, or [load `dist/manifest.json` as a temporary add-on](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) in Firefox. After each rebuild, reload the extension and refresh the Twitch tab.

Keep pull requests focused, add a regression test for each bug fix, check playback changes on Twitch, and list what you tested and what you could not.

<details>
<summary>Build and release notes</summary>

- **Firefox popup files:** The `firefox` branch tracks compiled `src/popup/popup.js` and `translations.js`. If the build reports them out of sync, copy both from `dist/src/popup/` and rebuild.
- **Packages:** The manifest decides which archives the build creates. Packaging errors stop the build.
- **Releases:** Annotated release tags include `Firefox-Commit: <full SHA>`, and the release workflow builds Firefox from that commit.

</details>

## 💬 Support

- Found a bug? [Open an issue](https://github.com/GosuDRM/TTV-AB/issues)
- For playback repeats or gaps, use **Generate Log** in the affected tab after the issue occurs. `[Continuity]` entries record accepted transitions, rejected windows, and timestamp gaps or overlaps, with numbered sources instead of signed URLs. Repeated matching events are summarized at most once every five seconds. These playlist timestamps do not prove what was played or whether audio stayed in sync; include when you noticed the issue.
- Want to contribute? Pull requests are welcome
- If TTV AB saves you from ads, consider supporting development:

[![Donate](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B.svg)](https://ko-fi.com/gosudrm)

## 🔒 Privacy

TTV AB operates entirely on your device. No data is ever sent to external servers: not your browsing history, not your Twitch activity, not your ad-block statistics. All counters and settings are stored in your browser's local storage. See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## 📄 License

This project uses an MIT-based license with a repository attribution requirement. See [LICENSE](LICENSE) for details.
