# TTV AB

![Version](https://img.shields.io/badge/version-5.0.7-purple)
![License](https://img.shields.io/badge/license-MIT-green)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![Short Name](https://img.shields.io/badge/short_name-TTV%20AB-blueviolet)
[![GitHub](https://img.shields.io/badge/GitHub-TTV--AB-black?logo=github)](https://github.com/GosuDRM/TTV-AB)

A lightweight browser extension that blocks Twitch ads on live streams and VODs while keeping playback stable.

## Install

- Chrome Web Store: [TTV AB - Lightweight, powerful ad blocker](https://chromewebstore.google.com/detail/ttv-ab-lightweight-powerf/mlifbfmeoafhcccmppaolojdglcbkdkg) `(Latest)`
- Firefox Add-ons: [TTV AB - Twitch Ad Blocker](https://addons.mozilla.org/en-GB/firefox/addon/ttv-ab-twitch-ad-blocker/) `(Latest)`

<p align="center">
  <img src="assets/popup-screenshot.png" alt="Popup Screenshot" width="300">
  <img src="assets/popup-screenshot2.png" alt="Stats Screenshot" width="300">
</p>

## Features

- ✅ Blocks preroll and midroll ads on live streams and VODs
- ✅ Supports both live playback and Twitch `/videos/<id>` archives
- ✅ **Blocks anti-adblock popups** ("Support streamer by disabling ad block")
- ✅ Avoids purple-screen playback interruptions
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
2. Open any live stream or VOD
3. Ads will be automatically blocked
4. Click the extension icon and use the toggle to enable/disable
5. Change language via the dropdown in the footer

## How It Works

The extension intercepts Twitch's live and VOD HLS video playlists and:
- Strips ad-marked segments from M3U8 playlists when Twitch injects them
- Fetches backup ad-free streams when Twitch forces playback onto an ad path
- Collapses player-side display-ad shells and overlay banners
- Suppresses injected direct video ads on VOD pages and returns playback to the real archive stream
- Caches known ad segments to reduce repeated playback disruption

`Ads Blocked` tracks confirmed worker-side playlist ad detections plus a few page-side fallback recoveries when Twitch injects direct media or explicit player-shell ads. `DOM Ads Blocked` tracks separate player-side cleanup events such as overlays, display shells, and popup removal. Both counters persist through the background worker using page-scoped media keys so live routes and `/videos/<id>` playback stay aligned without adding extra DOM scans or observers.

During active ad recovery, Twitch may temporarily fall back to a lower-quality backup stream, such as `360p`, while the extension keeps playback alive. Once the ad window ends and the player returns to native playback, your chosen quality is restored.

## What's New

### v5.0.7
- **Queued Counter Delta Preservation** - Persisted ad counters now preserve queued local deltas when another Twitch tab updates storage first, preventing valid ad and DOM-ad counts plus per-channel attribution from being dropped before the background flush completes.
- **Bridge Handshake Reconnects** - Page-side bridge handshakes can now bind again after a port disconnect, allowing the isolated bridge channel to recover cleanly instead of retrying forever against a one-time listener.
- **Exact Backup Variant Framerate Matching** - Backup stream selection now compares parsed frame rates numerically, so same-resolution `30fps` and `60fps` variants pick the correct clean fallback instead of the first resolution match.
- **Playback Context Recovery Reset** - Route and media-context changes now clear stale reload and recovery cooldown state, preventing the previous stream's recovery markers from suppressing a required reload on the next stream.
- **Removal-Triggered Stale Shell Cleanup** - DOM ad cleanup now reacts to ad-node removals as well as additions, so lingering display-shell wrappers collapse immediately when Twitch tears the ad DOM out of the player.
- **Bridge Reconnect State Replay** - Reconnected page-side bridge ports now immediately replay the current toggle and counter state, preventing stale enabled status or ad counts after a transient port drop.
- **Stale Navigation Event Rejection** - Worker, bridge, and rescan paths now reject playback events as soon as Twitch navigation leaves the originating media context, preventing old-stream counters, reloads, and cleanup work from leaking into later routes.
- **Popup Transition Timing** - The popup statistics panel now derives its collapse fallback from the actual computed transition timing, preventing the close animation from snapping shut before the CSS transition finishes.

### v5.0.6
- **Lingering Display Shell Layout Flattening** - Stale display-shell roots now stay flattened until Twitch clears leftover shell classes, preventing black L-shaped layout artifacts from lingering beside the live player after ad cleanup.
- **Lower-Third Layout Wrapper Collapse** - Lower-third display-ad wrappers near the player are now promoted into the layout-reset path, preventing bottom black bars from staying behind after the ad iframe is hidden.
- **Right-Side Inset Wrapper Collapse** - Explicit display-shell ads now also probe inferred side-inset player wrappers even without an ad label, preventing right-edge black columns from lingering after the DOM ad is hidden.
- **Ad Recovery Resume Hardening** - Post-ad resume intent now survives transient player pauses and keeps retrying through the live buffer monitor until playback actually resumes, reducing cases where ad recovery leaves the stream paused.
- **Stale Side Inset Collapse Hardening** - Previously reset player-shell wrappers now stay collapsed until the residual right/bottom inset actually clears, preventing paused ad-recovery transitions from reintroducing the side black bar.

### v5.0.5
- **Navigation Cleanup Hardening** - Twitch SPA channel and live/VOD route changes now clear stale competing-media suppression state so old media elements do not stay retained or muted across long sessions.
- **Stale Recovery Timeout Cancellation** - Ad-detected and ad-ended player recovery retries are now tracked against the active media context and canceled on navigation, preventing old-channel resume/reload work from firing after a route switch.
- **Idle Scan Backoff** - The DOM cleanup watchdog now backs off its idle polling during stable clean playback and ramps back up only after relevant mutations, ad events, or route changes, reducing periodic whole-page scan cost during long watches.
- **Playback Intent Heartbeat Backoff** - The 500ms playback intent monitor now slows down during no-media gaps and caches empty primary-media lookups, reducing repeated React/player discovery on non-playback pages and Twitch SPA transition windows.
- **Live Buffer Monitor Scoping** - The live buffer watchdog now sleeps off non-live routes and drops cached player references when the active media key changes, preventing stale player polling after channel navigation.
- **MutationObserver Hot-Path Cleanup** - The observer prefilter now stays layout-free before it schedules a deferred scan, avoiding near-player detection and size reads inside the synchronous callback.
- **Stale Display Shell Cleanup Scoping** - Residual display-shell cleanup now only trusts recent real display-ad activity or extension-owned markers, reducing repeated stale cleanup passes and log noise without changing blocked-ad or DOM cleanup counting behavior.
- **Lingering Display Shell Layout Flattening** - Stale display-shell roots now stay flattened until Twitch clears the leftover shell classes, preventing black L-shaped layout artifacts from lingering beside the live player after ad cleanup.

### v5.0.4
- **Performance Audit & Fixes** - Fixed 9 distinct hot-path performance bugs in the ad-scanning and player monitoring pipelines.
- **Cache Hit Restoration** - Fixed broken `undefined` cache guards in player and overlay bounding-box lookups (which recently broke after migrating to `null` sentinels), restoring zero-cost cache hits on every scan cycle.
- **Layout Thrashing Removed** - Removed expensive per-node `getBoundingClientRect()` and `getComputedStyle()` calls from the visible element checks, replacing them with cheap `offsetWidth`/`offsetHeight` fast paths.
- **Set Deduplication** - Replaced O(n) array lookups in the overlay bounding-box aggregator with O(1) Set tracking.
- **MutationObserver Calm Down** - Avoided triggering synchronous layout flushes inside the MutationObserver callback (which could run dozens of times per second during heavy chat).
- **Scan Pipeline Early Returns** - Added early-return shortcuts to the display-ad cleanup scan, bypassing 20+ heavy DOM queries on every cycle during clean native playback.
- **Player Monitor Stabilized** - The 500ms playback intent monitor now caches the active React/fiber tree lookup and skips the traversal entirely when the stream's media key hasn't changed.
- **Counter Route Hardening** - Worker `Ads Blocked` events now persist against the page-scoped media key as well as the stream media key, so current-live VOD pages no longer lose valid counts when Twitch serves `/videos/<id>` playback through live-channel transport.
- **DOM Cleanup Counter Scope** - The `DOM Ads Blocked` debounce now applies per cleanup kind instead of globally, preventing one overlay/display cleanup from suppressing a different cleanup that happens in the same second while keeping the same constant-time event cost.

### v5.0.3
- **JavaScript-to-TypeScript Repo Conversion** - The repo was converted from checked-in JavaScript source files to a TypeScript-based layout, `npm run build` now compiles the TypeScript build runner before execution for wider Node compatibility, unpacked extension loading now targets `dist/manifest.json`, and Chrome store packaging can be generated locally with `npm run package:chrome`.
- **Private Bridge Channel** - Sensitive page-to-extension state sync now uses a dedicated `MessagePort` instead of raw page-visible `window.postMessage` traffic, reducing spoofing risk for toggles, counters, and achievement events.
- **Stats / Worker Hardening** - Background counter persistence now retries with backoff instead of giving up after transient failures, the bridge keeps DOM cleanup kinds and route-aware media keys aligned across live and VOD navigation, and stale worker restarts are skipped after Twitch SPA route changes.
- **Performance Tuning** - The player-side DOM scanner now does less duplicate selector work during popup, display-ad, and direct-media checks by using Set-based dedupe, grouped mutation noise filtering, cheaper targeted popup detection before broad fallback sweeps, and more settled rescan scheduling during Twitch SPA channel navigation.

### v5.0.2
- **Twitch Page Stutter Fix** - Reduced the player-side DOM cleanup hot path that could make Twitch pages hitch or briefly freeze when ad UI appeared, especially during prerolls, display ads, or popup detection.
- **Overlay Scan Scope Reduction** - Player CTA, banner, and ad-label detection now searches near the active player instead of repeatedly sweeping the full page, cutting expensive layout work during normal playback.
- **Mutation Noise Filtering** - Generic button and link churn no longer counts as an ad-scan trigger, so routine Twitch UI updates do not keep scheduling unnecessary rescans.

### v5.0.1
- **Channel Navigation Pause Fix** - Switching between Twitch channels now clears stale pause intent from the previous player instance so the next stream is less likely to load in a paused state during SPA navigation.
- **Post-Ad Resume Hardening** - Ad-end and buffer-fix recovery now recheck paused playback and issue guarded resume retries, reducing cases where the player stayed paused until a manual click after ads.

### v5.0.0
- **VOD Ad Blocking Support** - Added VOD route, playlist, and playback-token handling so Twitch `/videos/<id>` playback uses the same ad-strip and recovery pipeline as live streams.
- **Playback Context Hardening** - Stream state, worker messages, route changes, and post-ad recovery now track a shared media key, preventing stale live/VOD events from crossing into the wrong player.
- **Current-Live VOD Recovery** - Active livestream VOD pages now keep page-scoped ad and reload events even when Twitch serves playback through the live channel transport, fixing ads that could still slip through on the current stream archive.
- **Live-to-VOD Player Resync** - Navigating from a live stream to its VOD in Twitch's SPA flow now triggers a guarded player resync when the old live player state lingers, preventing the large static `?` placeholder that previously required a manual refresh.
- **DOM Scan Performance Hardening** - Player-side popup and display-ad cleanup now coalesces rescans, ignores noisy chat-only mutations, and backs off idle polling, reducing the periodic buffering and whole-browser lag that could appear from overly aggressive full-page DOM scans.
- **Player Overlay Cleanup** - Display-ad cleanup now recognizes the newer player-side `Learn More` CTA and `right after this ad break` banner shell, collapsing VOD ad overlays more reliably.
- **Direct VOD Video-Ad Suppression** - VOD pages now detect Twitch's injected Amazon MP4 ad media and force playback back to the real archive stream instead of letting the standalone ad video run to completion, while requiring matching ad-UI signals so live/VOD route transitions are not misclassified as standalone ads.
- **Lower-Third Banner Coverage** - Added support for Twitch's newer `sda-frame` / `stream-lowerthird` lower-third subscription and display-ad banner variant so it is treated as an explicit DOM ad target.


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

`npm run knip` is expected to pass cleanly with the current `knip` 6.0.3 configuration.

## Support

If you enjoy TTV AB, consider buying me a coffee! Your support helps keep this project alive.

[![Donate](https://img.shields.io/badge/Donate-Ko--fi-FF5E5B.svg)](https://ko-fi.com/gosudrm)

## Privacy

This extension operates entirely locally and does not send any browsing or usage data off your device. See [PRIVACY.md](PRIVACY.md) for details.

## License

MIT License with Attribution - See [LICENSE](LICENSE) for details.
