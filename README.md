# TTV AB

![Version](https://img.shields.io/badge/version-24.0.2-purple)
![License](https://img.shields.io/badge/license-MIT--based%20with%20attribution-green)
![Tests](https://github.com/GosuDRM/TTV-AB/actions/workflows/ci.yml/badge.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Firefox](https://img.shields.io/amo/v/ttv-ab-twitch-ad-blocker?label=firefox&color=orange)
![Chrome](https://img.shields.io/badge/chrome-24.0.2-yellow)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks Twitch ads on live streams and VODs while keeping playback stable.

## 📥 Install

> **⚠️ Supported browsers: Firefox 142 or newer and Chromium-based desktop browsers built on Chromium 111 or newer only.** TTV AB can't run on WebKit-based browsers like Orion, or on anything on iOS/iPadOS (every iOS browser is WebKit under the hood). The ad-blocker can't load there and the player goes to a black screen, so please use Firefox or a Chromium-based browser on a computer.

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
- ✅ Statistics dashboard with a 7-day chart, detailed per-channel history, JSON export, reset, and **12 Achievement Badges**
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

### v24.0.2 - 2026-10-22

- **Older Chromium Browsers** - Block installation in Chrome, Edge, and other Chromium-based browsers older than version 111, where ads cannot be blocked. It used to install there and look like it was working.
- **Yandex Browser in Reports** - Name Yandex Browser in debug logs and new bug reports instead of listing it as Chromium.
- **Pop-ups in Embedded Players** - Show the welcome message and achievement pop-ups only on Twitch itself, not inside Twitch players embedded on other websites, where they covered most of the video.
- **Refresh Notice in Fullscreen** - Show the refresh notice over the fullscreen player and start its 3-second countdown only once you can see it. Before, it stayed hidden behind fullscreen video and could disappear unseen.
- **Log Export Tab Message** - Stop showing "Could not open the log export tab" when the tab did open, in browsers where it has to be opened without the extension tabs API.
- **Language on Twitch** - Show the refresh notice and pop-ups on Twitch in the language you picked in the popup, instead of your browser's website language. In Auto mode they now pick the same language as the popup.
- **Simplified Chinese in Hong Kong and Macau** - Use Simplified Chinese when your browser asks for it with a Hong Kong or Macau region, instead of switching to Traditional Chinese.
- **Local Number Formats** - Show Time Saved, watch time, and channel share with your language's units and number style, for example "1 мин 30 с" instead of "1m 30s".
- **Ad Count in Turbo Mode** - Keep pop-ups on Twitch from showing how many ads were blocked while Turbo Mode is on, so your statistics stay paused and out of view.
- **Smoother Ad Break Timer** - Count the Ad Break Timer up exactly once per second, hide it within a second of the break ending, and update it right away when you return to the tab or switch fullscreen. It also stays visible while the stream is partly scrolled out of view.
- **Translation Wording** - Fix awkward or inconsistent wording in Chinese, French, German, Italian, Japanese, Korean, Portuguese, Russian, Spanish, and Ukrainian, including the store descriptions in French, German, Russian, and Ukrainian, and use the terms Twitch uses in Taiwan for Traditional Chinese.
- **Smaller Download** - Leave the readme, changelog, and documentation images out of the extension package, cutting its download size roughly in half.
- **Release Safety Checks** - Stop a release build when store text is too long, the popup points at missing files, page code could insert unsafe HTML or open links without isolation, or the package would include stray or system files, so these mistakes cannot reach a published version. The Firefox source archive now contains only files tracked in the repository.
- **Translated Pop-ups** - Translate the welcome message, achievement pop-ups, and Ad Break Timer into all 12 supported languages, using the same achievement names as the popup.
- **Clearer Language Menu** - Show which language Auto picked, and show the Brazilian flag for Portuguese to match its Brazilian translation.
- **Turbo Mode Explanation** - Add an info button next to Turbo Mode that explains what it pauses and that ad blocking keeps working.

### v24.0.1 - 2026-10-22

- **Background Tab CPU Usage** - Stop Twitch tabs opened in the background from using a full CPU core while Brave Shields blocks trackers and ads. Playback the browser has held back is no longer started early, which kept Twitch's player in a rapid play and pause loop until you viewed the tab. ([#94](https://github.com/GosuDRM/TTV-AB/issues/94))
- **Unopened Tabs Under Brave** - Treat Twitch tabs you have not opened yet as background tabs even when Brave Shields reports them as visible, so they are checked less often.
- **Black Screen at Ad Breaks** - Shorten the black screen at the start of ad breaks on streams whose timestamps run ahead of real time, and stop skipping or replaying part of the stream when switching to and from the backup. ([#92](https://github.com/GosuDRM/TTV-AB/issues/92))
- **Timestamp Diagnostics** - Show in debug logs how far the timing was shifted to line up two Twitch sources whose timestamps disagree.

### v24.0.0 - 2026-10-21

- **Side and Chat Video Ads** - Hide and mute Twitch's updated side and chat video ads even when they use a different video host or a custom label. ([#93](https://github.com/GosuDRM/TTV-AB/issues/93))
- **Leftover Ad Panels** - Collapse the surrounding panel and timer after a side or chat video ad is hidden, so an empty black panel does not cover the stream or chat.
- **Low Quality Fallback Logging** - Log disabling Low Quality Fallback as a setting change, so it no longer creates a misleading warning on the browser's extension Errors page.
- **Player Crash Recovery** - Attempt one automatic reload through a crashed player to restore the stream. If the player remains crashed, show the refresh notice without repeatedly reloading it.
- **Smaller Extension** - Remove code that never ran, including an unused player-type override that inspected every Twitch request, so pages load less code and Twitch requests skip a needless check.

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
