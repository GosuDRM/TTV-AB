# TTV AB

![Version](https://img.shields.io/badge/version-22.0.1-purple)
![License](https://img.shields.io/badge/license-MIT--based%20with%20attribution-green)
![Tests](https://github.com/GosuDRM/TTV-AB/actions/workflows/ci.yml/badge.svg)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Firefox](https://img.shields.io/amo/v/ttv-ab-twitch-ad-blocker?label=firefox&color=orange)
![Chrome](https://img.shields.io/badge/chrome-22.0.1-yellow)
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

### v22.0.1 - 2026-10-13

- **Faster Return After Long Breaks** - Return to Twitch's own stream about 8 seconds sooner after a break whose ads have all played, when ad markers did not come back during it. Breaks where ads came back or the ad count is unknown keep the full checks.
- **Midroll Black Screen** - Wait a few seconds for the clean backup to catch up at the start of a midroll instead of playing several seconds of black video, so the stream continues from where it left off.
- **HD Backups During Long Breaks** - Keep checking a new HD source when an older session of the same source just showed ads, and stop counting HD sources that were never played toward the retry limit, so long breaks no longer stay at 360p.
- **Fewer Quality Jumps** - Switch from the 360p backup to HD only after the HD source has stayed clean for 6 seconds, so sources that start showing ads moments later no longer bounce the video between HD and 360p.

### v22.0.0 - 2026-10-13

- **Faster Return After Ads** - Return to Twitch's own stream about 15 seconds sooner after a break whose ads have all played, by reusing the clean checks already made instead of repeating them while the backup is held. Breaks with an unknown or unfinished ad count keep the full checks.
- **Stream Return Checks** - Stop counting clean checks of Twitch's own stream as failures while they wait for confirmation, which could keep playback on the backup stream after the break had ended and log it as still showing ads.
- **Log Privacy** - Hide more types of private values, such as access tokens, from the console and from exported logs.
- **Error Details** - Preserve error types, messages, stack traces, and causes in diagnostic logs, with privacy filtering and size limits.
- **Recent Debug Logs** - Keep the newest failure messages when a tab's export reaches the size limit, with an explicit count of omitted entries.
- **Log History** - Keep errors and ad break summaries in Generate Log after a long session pushes older entries out, and show how many older entries were trimmed.
- **Token Request Logs** - Report how many backup token attempts were actually made, and name relay failures correctly instead of calling them spoofing errors.
- **Ad Pod Tracking After Recovery** - Keep counting ads per pod when a replacement player takes over or the backup recovery mode is active, so a preroll before a midroll no longer makes the midroll look finished early.
- **Picture-in-Picture Channel Changes** - Follow a raid or channel change inside an open Picture-in-Picture window, so watch time, ad handling and reloads apply to the channel actually playing.
- **Recovery Cleanup** - Switch off the backup recovery mode once a replacement player has stayed healthy, instead of keeping it for the rest of the page.
- **Ended Streams** - Stop treating a live stream that has ended as a player crash, so the extension no longer reloads the player up to three times or shows the Refresh tab notice when a streamer goes offline.
- **Ad Break Timer** - Stop the ad break timer from flickering when Twitch updates the page address without changing the stream.
- **Ad Completion Reports** - Keep reporting rejected ad completion reports every 10 minutes with a running count, and report the best known ad count when Twitch does not say how many ads a break has.
- **Logging Efficiency** - Stop reading object values and formatting older log entries once their size limits are reached.
- **Quieter Console** - Show routine successful backup token requests only in debug output and Generate Log, while failures and unusual responses still appear in the console.
- **Fewer Backup Requests** - Wait longer before checking a backup source again when it keeps showing ads in the same break, cutting repeated requests during long breaks.
- **Quieter Ad Break Logs** - Log repeated ad break states and returning ad markers only when they change, with a running count, and move per-source search lines to debug output.
- **Page Efficiency** - Skip page changes that cannot contain an ad video and reuse the known player during ad breaks, reducing work in busy chats.

### v21.3.0 - 2026-10-13

- **HD Backup Quality** - Keep the selected HD backup during an ad break instead of dropping it to 360p every few seconds while Twitch's quality list is still the low one from a preroll.
- **Ad Pod Tracking** - Track each ad pod in a break separately, so when a preroll is followed by a midroll the last midroll ad is still reported as watched and the clean backup is kept until that pod has really finished.
- **Worker Stability** - Keep an error in the extension's own player message handling from being treated as a player crash, which could restart the player and use up recovery attempts.
- **Recovery Logs** - Log each worker recovery wait once instead of every 5 seconds, so a long wait in a background or paused tab no longer pushes earlier diagnostics out of Generate Log.
- **Worker Watchdog** - Keep checking every player's heartbeat when another watchdog check fails, so one error can no longer stop crash detection.
- **Navigation Safety** - Keep Twitch's page navigation working if the extension's own navigation tracking hits an error, and stop removing other extensions' navigation hooks when the page is hidden.
- **Ad Break Summaries** - Show how playback returned to the stream in the log summary for ad breaks that end normally, not only after a silent backup hold.
- **Code Cleanup** - Remove an unused player helper left over from an older version.
- **Monitor Efficiency** - Check the page's player once per playback monitor pass instead of twice on pages without a stream.

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
