# TTV AB

![Version](https://img.shields.io/badge/version-23.0.0-purple)
![License](https://img.shields.io/badge/license-MIT--based%20with%20attribution-green)
![Tests](https://github.com/GosuDRM/TTV-AB/actions/workflows/ci.yml/badge.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Firefox](https://img.shields.io/amo/v/ttv-ab-twitch-ad-blocker?label=firefox&color=orange)
![Chrome](https://img.shields.io/badge/chrome-23.0.0-yellow)
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
- Returns to native playback after repeated clean checks for the same stream and break, then restores quality and audio settings
- Keeps recovery tied to the current player across background tabs and Picture-in-Picture, respecting explicit pauses

**Low Quality Fallback** is on by default, allowing a clean 360p bridge sooner while higher-quality sources are checked. Turning it off prioritizes normal-quality sources; prerolls and midrolls may still use a temporary clean low-quality bridge if those sources fail. Other sources may still offer lower qualities.

**Ad Spoofing** sends Twitch progress and completion signals for blocked ads. Turning it off leaves ad blocking active.

The optional **Ad Break Timer** is off by default and can be switched on in the popup. It tracks the current break until it ends; it does not predict when your selected quality will return.

## 🔔 What's New

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

### v22.0.1 - 2026-10-13

- **Faster Return After Long Breaks** - Return to Twitch's own stream about 8 seconds sooner after a break whose ads have all played, when ad markers did not come back during it. Breaks where ads came back or the ad count is unknown keep the full checks.
- **Midroll Black Screen** - Wait a few seconds for the clean backup to catch up at the start of a midroll instead of playing several seconds of black video, so the stream continues from where it left off.
- **HD Backups During Long Breaks** - Keep checking a new HD source when an older session of the same source just showed ads, and stop counting HD sources that were never played toward the retry limit, so long breaks no longer stay at 360p.
- **Fewer Quality Jumps** - Switch from the 360p backup to HD only after the HD source has stayed clean for 6 seconds, so sources that start showing ads moments later no longer bounce the video between HD and 360p.

_See [CHANGELOG.md](CHANGELOG.md) for the complete list of changes._

## 🛠️ Development

Clone the repository or your fork, using `main` for Chrome or `firefox` for Firefox. Install Node.js 22 and Python 3, then run these commands from the repository folder:

```sh
npm ci
npm run build
```

Make changes in the TypeScript source:

- `src/modules/`: stream handling, ad blocking, and playback recovery
- `src/scripts/`: background tasks and communication with the page
- `src/popup/`: popup controls, themes, and translations
- `tests/`: regression tests

Keep changes focused and add a regression test when fixing a bug. The build generates `dist/`; edit the source files rather than the compiled output. After source edits, run the checks in this order because tests read `dist/`:

```sh
npm run build
npm test
npm run test:shuffle
npm run lint
npm run typecheck
npm run knip
```

Load your build to try it locally:

- **Chrome:** Open `chrome://extensions`, enable Developer mode, then [Load unpacked](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) and select `dist/`.
- **Firefox:** Open `about:debugging`, select This Firefox, then [Load Temporary Add-on](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) and select `dist/manifest.json`.

After rebuilding, reload the extension from that page and refresh your Twitch tab. For playback changes, check the affected scenario on Twitch too. In your pull request, explain the change, the checks you ran, and anything you could not verify.

<details>
<summary>Build and release notes</summary>

- **Firefox popup files:** If the build reports that tracked popup files are out of sync, copy `popup.js` and `translations.js` from `dist/src/popup/` into `src/popup/`, then rerun the build and checks.
- **Packages:** The manifest determines which browser archives the build creates alongside `dist/`. Packaging errors stop the build.
- **Releases:** Annotated release tags must include `Firefox-Commit: <full SHA>` for the validated Firefox commit. The release workflow builds Firefox from that exact commit.

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
