# Changelog

All notable changes to TTV AB will be documented in this file.

## [6.2.9] - 2026-04-12

### Added
- **New Achievements** - Added "Diamond" (block 10,000 ads) and "Globetrotter" (block ads on 50 channels) achievement badges, bringing the total to 12. Fully translated across all 11 supported languages.

### Fixed
- **Post-Ad Re-Entry Loop** - The main ad detection in `_processM3U8` now uses only the primary ad signifier (`stitched`) and explicit known ad segment URLs instead of the broad `_hasPlaylistAdMarkers` check. Residual metadata tags (`X-TV-TWITCH-AD`, `SCTE35-OUT`, etc.) that Twitch's CDN can briefly serve after the actual ad ends no longer trigger a false new ad cycle. A 5-second grace window after ad-end reloads provides additional protection against re-entry from stale playlist data.
- **Ad Recovery Backoff Stability** - The exponential backoff counter for ad recovery reloads (`_AdRecoveryConsecutiveFailures`) now resets on channel navigation, ad cycle completion, and when ad blocking is toggled off. Previously the counter could grow indefinitely across ad cycles, causing increasingly long delays before recovery attempts.
- **Midroll Detection False Positives** - `_hasExplicitAdMetadata` now matches quoted `"MIDROLL"` and `"midroll"` JSON values instead of bare substrings, preventing false-positive ad detection on URLs or text that coincidentally contain "midroll" as a path component.
- **Player Startup Crash Guard** - `_getPrimaryMediaElement` now guards against `__TTVAB_STATE__` being undefined during early page load, preventing a reference error before the extension state is initialized.
- **Initial State Declaration** - `_AdRecoveryConsecutiveFailures` is now declared in the initial state object, ensuring the field exists from bootstrap rather than being implicitly created on first use.
- **Route Segment Consistency** - Added the missing `"video"` entry to the parser's `_RESERVED_ROUTE_SEGMENTS` set, aligning it with the bridge module and preventing VOD routes from being misidentified.

## [6.2.8] - 2026-04-12

### Fixed
- **Firefox Midroll Recovery Fix** - Native `PlaybackAccessToken` requests now stay pinned to the forced recovery player type whenever token rewriting is enabled, preventing midroll refreshes from slipping back onto Twitch's ad-marked path before ad recovery takes over.

## [6.2.7] - 2026-04-12

### Changed
- **DOM Cleanup Scope Reduction** - Removed the broad anti-popup / overlay DOM cleanup runtime because it was interfering with Firefox ad blocking. The extension now relies on playlist interception, playback recovery, and the narrower post-ad display-artifact cleanup that remains in the hook layer.
- **Build Validation Cleanup** - Removed obsolete minify aliases for the deleted DOM cleanup helpers and dropped the stale `init` route-context validation that only existed for that path.
- **Streamlined Popup UI** - Removed the separate DOM Ads Blocked counter for a cleaner popup layout; all ad blocking activity is now reflected in the main Ads Blocked counter.
- **Achievements Update** - Reduced achievement count from 12 to 10 for a tighter set of milestones.

## [6.2.6] - 2026-04-12

### Fixed
- **Ad Recovery Loop Fix** - The DOM-driven player recovery no longer loops indefinitely when all backup player types return ad-marked streams. Recovery attempts are now capped per ad cycle with exponential backoff (15s → 30s → 60s), preventing rapid-fire reloads that disrupted playback.
- **Fallback Stream Promotion** - Ad-marked but playable backup streams are now kept as fallback candidates for ad stripping, ensuring the worker always has a stream to clean instead of returning nothing when every backup player type serves ads.
- **Emergency Playlist Fallback** - When no fresh backup stream is available, the processor now falls back to the last known clean backup or native playlist, keeping playback alive during difficult ad windows.
- **Ad Recovery Backoff Reset** - The exponential backoff counter now resets when an ad cycle ends, so the next ad cycle starts with a fresh recovery budget.
- **Turbo Lower-Third Shell Cleanup** - Hidden Turbo and lower-third display-ad seeds are now still mapped back to their player wrappers, so stale shell layouts collapse even after Twitch hides the inner ad node.
- **Faster Visible Turbo UI Suppression** - Strong visible in-player Turbo and display-ad signals now bypass the old shell-confirmation delay and force an earlier cleanup pass, reducing brief visible flashes before the shell is collapsed.
- **Shell-Only UI Recovery** - UI-only recovery once again responds to real player-shell ad states even when Twitch does not expose visible CTA or banner copy, closing a path where the player could stay on the ad shell.
- **DOM Fast-Path Hardening** - Forced mutation scans now ignore hidden residue and already-collapsed extension-owned artifacts, reducing repeated DOM churn after cleanup.
- **DOM Cleanup Counter Stability** - The immediate-shell path is now limited to strong visible ad UI signals, reducing cases where stale layout residue after navigation could be counted as a fresh DOM cleanup.
- **DOM Counter Consistency** - `DOM Ads Blocked` now only counts persisted cleanup kinds, so recovery-only player reload signals no longer drift away from popup and stored totals.
- **SDA Iframe Cleanup** - Stream display ad iframes are now detected by their ad host URLs, so video-based SDA overlays collapse even when Twitch embeds them outside the lower-third shell.
- **Selector Indentation Fix** - Fixed display ad selector constants that had incorrect scope indentation.

## [6.2.4] - 2026-04-11

### Fixed
- **Post-Ad UI Recovery Loop** - Firefox now collapses stale in-player display ad shells before escalating into UI-driven player recovery, preventing the player from immediately re-entering ad recovery after an ad ends.
- **Scoped Native Token Rewrite** - Native `PlaybackAccessToken` requests are now rewritten only while an ad is active or during the immediate post-ad recovery window, reducing brief ad flashes before blocking fully takes over and preventing the player from staying pinned to the forced recovery type.

## [6.2.3] - 2026-04-11

### Fixed
- **Playback Monitor Resiliency** - Playback-intent and live-buffer monitors now idle instead of stopping on transient context loss, and automatically restart on ad-detection, toggling, and route resyncs to prevent the player from stalling.
- **Route-Less Player Surface Recovery** - DOM cleanup now stays active whenever Twitch still exposes a real player surface, even if the URL no longer carries a normal playback route, so cleanup and recovery logic do not go cold on route-less player views.
- **Bridge Counter Queue Hardening** - Pending ads-blocked and DOM-cleanup stat updates are now coalesced and retained more safely during temporary bridge outages, reducing dropped counter deltas without letting the queue grow unbounded.
- **Post-Ad Recovery Speed** - Reduced the native-recovery confirmation window to a single clean probe with a shorter cooldown, removing a bottleneck that delayed the return to native playback.
- **Continuous Post-Ad Reloads** - Treats in-place stripped-ad recovery the same as backup/fallback recovery so the player reliably reloads at the end of an ad cycle.
- **Playlist Cache Tightening** - Shortened the reuse window for stale clean-playlists, drastically reducing the chance of the player getting stuck on a lower-quality backup state after an ad cycle.
- **Minimal Requests Ad Leak** - Fixed an edge case where an ad-marked backup playlist could still be selected during minimal requests fallback.

## [6.2.2] - 2026-04-11

### Fixed
- **Popout / PiP Playback Handoff** - Opening Twitch's popout player now pauses the original page player and suppresses automatic visibility, ad-recovery, direct-player recovery, and buffer-recovery restarts on the source tab, while Picture-in-Picture and failed popout launches no longer leave the main player in a broken or duplicated playback state.
- **Popout Playback Context Recovery** - `player.twitch.tv` popout windows now resolve their playback context from query parameters, so popout playback opened during active ad blocking can finish recovery and return from the backup stream normally.

## [6.2.1] - 2026-04-11

### Fixed
- **Low-Latency Playback Regression Fixes** - Fixed the worker bootstrap so the new low-latency playlist helpers are available at runtime, added clean recovery for part-only stripped playlists, shortened stale reuse windows for part-only cached playlists, and extended the ad-entry warm-up path to cover low-latency media entries.

## [6.2.0] - 2026-04-11

### Fixed
- **Low-Latency Ad Entry Hardening** - The worker now detects and strips ad-marked `#EXT-X-PART` and `#EXT-X-PRELOAD-HINT` playlist entries, reducing brief ad flashes that could happen before the backup path fully took over.

## [6.1.9] - 2026-04-11

### Fixed
- **Prefetch Ad-Hint Hardening** - Once the worker enters an ad-stripping path, it now removes Twitch low-latency prefetch hints as well, reducing intermittent cases where ad media could still be prefetched and leak into playback.

## [6.1.7] - 2026-04-11

### Fixed
- **Tab-Switch Pause Regression** - Visibility and focus hardening now actively guards playback across tab changes, so Twitch is less likely to pause the player when the tab loses focus.
- **Faster Post-Ad Native Reload** - Reduced the ad-end grace window and native recovery probe spacing so validated backup/fallback ad exits return to the native player about 50% faster without removing the existing clean-playlist and clean-probe safety gates.
- **Hidden-Tab Resume Retry Parity** - Background-tab playback guards now retry through the same primary-media resume path used by the immediate visibility handler, reducing cases where a hidden tab stayed paused until it became visible again.
- **Firefox Native Recovery Path Parity** - Firefox now validates the same forced native `PlaybackAccessToken` player type that it reloads into after an ad break, so ad-end recovery no longer wastes probe cycles checking Twitch's ad-marked `site` path before switching back to `popout`.
- **Tighter Ad-End Timing** - Tightened Firefox's ad-end confirmation window to one clean playlist plus two quick native recovery probes, making post-ad returns noticeably faster while still keeping a minimal guard against false-positive reloads.
- **Backup Playlist URI Normalization** - Firefox backup media playlists now absolutize segment, key, map, and prefetch URLs before returning them to Twitch, fixing black-screen / spinner cases where a clean backup playlist was selected but its media URIs were invalid in the active request context.

## [6.1.6] - 2026-04-10

### Fixed
- **UI-Driven Midroll Recovery** - When Twitch shows clear in-player ad UI but does not expose a suppressible Amazon MP4 node, the extension now forces ad-recovery player reloads instead of letting the main player sit on the ad path.
- **Safer Live Ad Recovery** - The worker no longer short-circuits ad-marked live playlists through the CSAI fast path, so live midrolls still get full backup-stream recovery instead of being misclassified as metadata-only ads.
- **Broader Player Ad Copy Detection** - Player overlay detection now recognizes additional Twitch copy such as `Subscribe for ad-free viewing`, improving live ad signal detection before and during recovery.

## [6.1.5] - 2026-04-10

### Fixed
- **Turbo Direct-Ad Video Detection** - The player-side ad detector now recognizes more Twitch Turbo promo copy, so Amazon-hosted direct ad videos are less likely to slip through when Twitch changes the CTA text around the player.
- **Direct-Media Ad Corroboration** - Direct media suppression now accepts active worker ad state as a second signal instead of relying only on the older player CTA/banner checks, which makes live direct-ad cleanup more resilient.
- **CSAI Fast Path** - Metadata-only CSAI playlists now skip unnecessary backup stream searches when all segments are still marked live, reducing pointless player switching and long rebuffer gaps.

## [6.1.4] - 2026-04-10

### Fixed
- **Midroll Empty-Playlist Leak Fix** - When every backup route is ad-marked, the worker no longer restores stripped ad segments back into an empty playlist, preventing ad-only midroll playlists from leaking back into playback.
- **Clean Playlist Recovery Cache** - The runtime now remembers recent clean native and backup playlists and reuses those during empty-playlist recovery, keeping playback alive without replaying stripped ad segments.
- **Native Token Rewrite Hardening** - Firefox now keeps native `PlaybackAccessToken` requests pinned to the forced recovery player type so later midroll cycles are less likely to drift back onto Twitch's ad-marked site path after a clean ad-end reload.

## [6.1.3] - 2026-04-10

### Fixed
- **Live Direct-Ad Video Cleanup** - Direct player ad videos served from Twitch's Amazon media path are now suppressed on live streams too instead of only VOD pages.
- **Picture-in-Picture Token Isolation** - Picture-in-Picture and mini-player playback token requests no longer overwrite the stored native recovery player type used by normal stream recovery.
- **Background Playback Hardening** - Visibility state is now hardened so ad recovery is less likely to pause or stall when Twitch is running in a background tab.
- **Stable Ad-End Detection** - Ad recovery now waits for a stable clean native stream window before ending the block cycle, preventing immediate re-entry during shaky post-ad handoff.
- **Pinned Backup Cooldown** - The worker now retries the last good backup path first and temporarily cools down rejected backup player types, reducing repeated backup-path thrash during the same ad break.
- **Post-Ad Resume Intent Tracking** - The page now snapshots whether playback should resume when the ad cycle starts, preventing post-ad native recovery from losing the stream's pre-ad play state.
- **Post-Ad Recovery Watchdog Wiring** - The existing post-ad recovery handler is now actually driven by the live buffer monitor instead of having its counters reset every tick, allowing stalled native returns to recover through pause/play and guarded reload escalation.
- **Less Disruptive Native Recovery Reload** - The first ad-end native return now reuses the existing player instance before escalating to heavier recovery, reducing black-screen and immediate post-ad stall cases during the backup-to-native transition.

## [6.1.1] - 2026-04-09

### Fixed
- **Firefox Runtime Parity** - Rebased the Firefox build onto the current main-branch ad-blocking runtime so Firefox no longer ships the stale forked playback, parser, processor, and state logic that had fallen behind Chrome.
- **Picture-in-Picture Recovery** - Included the merged [PR #4](https://github.com/GosuDRM/TTV-AB/pull/4) (`Support PiP mode`) change so player recovery downgrades reloads to the existing pause/play path while Picture-in-Picture is active, instead of creating a new player instance and forcing PiP to close. Thanks [@ryanbr](https://github.com/ryanbr).

## [6.1.0] - 2026-04-08

### Fixed
- **React-Safe Display-Ad Cleanup** - Post-ad cleanup now hides and resets Twitch-managed display-ad nodes instead of removing them from the DOM, preventing Twitch's React teardown from collapsing the player into the big `?` placeholder during live and VOD navigation.
- **SDA Teardown Compatibility** - Stale display-ad shell cleanup now keeps Twitch-owned nodes attached under `#root` until Twitch unmounts them itself, avoiding `SDAContextManager` `Node.removeChild` exceptions after ad recovery.

## [6.0.9] - 2026-04-08

### Fixed
- **Console Log Noise** - Silenced the repetitive `Fetch intercepted exception: NetworkError` logs that could flood the browser console during certain network conditions.
- **Debug Logging** - Updated the global logger to suppress all `debug` level messages by default, ensuring a cleaner development console.

## [6.0.7] - 2026-04-08

### Fixed
- **Post-Ad Native 360p Lock** - Ad recovery no longer explicitly rewrites the native `PlaybackAccessToken` to `autoplay` during the recovery window, which previously locked the player's resolution menu down to 360p indefinitely after an ad block completed.
- **Pre-roll Recovery Loops** - Implemented background simulated ad-impression tracking by headless fetching of blocked ad segments. This actively clears Twitch's backend pre-roll state, putting an end to infinite looping reload cycles caused by continuously receiving ad markers upon Native Player reload.

## [6.0.6] - 2026-04-08

### Fixed
- **Broader Stitched Ad Variant Coverage** - Worker-side ad detection now matches broader stitched Twitch playlist markers again, reducing cases where recent stitched ad-break variants could slip through to native playback.
- **Turbo Break Overlay Cleanup Loop** - Full-page Twitch Turbo / ad-break promo surfaces now route through stronger popup and promoted-page detection, and repeated cleanup of the same surface is signature-deduped so `DOM ad cleanup (overlay-ad)` no longer counts the same break screen indefinitely.

## [6.0.5] - 2026-04-08

### Fixed
- **Post-Ad Native Quality Recovery** - Recovery reloads now prefer the forced native `PlaybackAccessToken` player type before any remembered backup type, preventing post-ad reloads from getting stuck on the reduced-quality `autoplay` ladder.
- **Delayed Native Return After Backup Ads** - Backup-stream ad exits now trigger the native player reload and access-token refresh path immediately instead of waiting for the later stall watchdog, reducing prolonged fallback playback and helping the normal quality ladder return sooner.

## [6.0.0] - 2026-04-07

### Fixed
- **Exit-Time Counter Flush Durability** - Bridge-side ad and DOM-ad counter flushes now persist each pending batch before unload-time delivery and replay them safely, preventing valid totals from being dropped when Twitch tabs close or MV3/runtime delivery is late.
- **Cross-Tab Counter Replay Queue Race** - Pending bridge counter flushes are no longer stored in a single shared `localStorage` array; each flush now persists under its own key so simultaneous Twitch tabs cannot overwrite or resurrect each other's replay batches.
- **Single-Slot Retry Starvation** - Counter persistence retries now track each failed flush independently instead of keeping only one in-memory retry payload, so transient runtime failures no longer strand older batches until the next page reload.
- **DOM Counter Startup / Toggle Drift** - Page-side `DOM Ads Blocked` counting now waits for the resolved toggle state and stored DOM count before incrementing, and it no longer keeps counting while ad blocking is disabled.
- **DOM Counter Route Debounce Suppression** - DOM cleanup debounce is now scoped to the current playback route/media instead of only the cleanup kind, so the next stream or page does not lose a legitimate same-kind DOM cleanup count during fast Twitch SPA navigation.
- **Worker Eviction Regression** - Worker tracking no longer hard-caps active Twitch workers at two, preventing legitimate player, mini-player, or preview workers from being terminated during normal site use.
- **Reload Preference Restore Race** - Delayed native-player preference restoration is now scoped to the originating playback context, so channel or VOD navigation cannot restore stale quality, mute, or volume settings onto the next route.
- **Long Ad Resume Expiry** - Post-ad resume intent now stays armed across longer Twitch ad pods instead of expiring after the original short window and leaving playback paused or stalled at ad exit.
- **Ad-Ended Cleanup Recovery Jank** - Post-ad artifact cleanup no longer does a large synchronous DOM sweep directly inside the `AdEnded` recovery task; cleanup is now deferred and grouped so playback resume and media restore stay responsive.
- **DOM Display-Ad Signal Coverage** - Display-shell detection now uses bounded near-player preflight signals and includes CTA-only and banner-text-only Twitch variants, so newer player-surface display ads reach the existing collapse path reliably.
- **Popup Cleanup Starvation** - Anti-adblock / Turbo popup cleanup now runs even when the same scan already suppressed another DOM ad path, preventing overlays from surviving just because display-shell or direct-media cleanup matched first.
- **Popup Fallback Scan Gating** - The broad anti-popup fallback sweep now only runs on forced scans, recent popup-like mutations, recent popup cleanup, or a low-frequency background interval, reducing steady-state whole-page scan cost during normal playback.
- **Turbo Popup Copy Detection** - Popup detection now recognizes newer Twitch anti-adblock wording such as `Consider Turbo`, `ad-free viewing`, and `fully enjoy Twitch`, improving cleanup against current Twitch copy changes.
- **Channel Subpage Playback Context Leak** - Twitch channel subpages such as `/channel/videos`, `/channel/about`, and similar non-player routes no longer inherit the live playback context just because the first path segment matches a channel name.
- **SPA Recovery Timeout Staleness** - Playback recovery timers now validate against the current URL-derived route context immediately instead of waiting for delayed page-state sync, preventing stale resume or reload callbacks from firing after Twitch SPA navigation.
- **Stale Worker Navigation Leakage** - Worker `AdDetected`, `AdEnded`, and `ReloadPlayer` events now validate against the event's own stream context before accepting the rebased page context, preventing old workers from mutating the next Twitch route after SPA navigation.
- **Per-Stream Reload Marker Scoping** - Player reload markers now carry explicit playback context and are consumed only by the matching playlist stream, preventing multi-context workers from applying reload hints to the wrong stream.
- **Worker Bridge Protocol Collisions** - Hooked worker control messages now travel through a private TTV AB bridge envelope, so unrelated worker traffic is no longer swallowed just because another script or Twitch uses a generic `{ key: ... }` message shape.
- **Early-Ad User Pause Override** - The player now tracks recent explicit playback interactions so a real user pause during Twitch's early ad-start and backup-player suppression windows is preserved instead of being treated as extension-owned and auto-resumed after the ad.
- **Late Ad-Pause Recovery Suppression** - Pauses caused by Twitch during an active ad or pending post-ad recovery are now treated as ad-owned unless they were paired with an explicit user interaction, so long ad pods no longer disable the post-ad resume and reload path.
- **Replay-On-Live Post-Ad Loading Stall** - When a live channel temporarily exposes replay/VOD-style player content, post-ad recovery no longer drops that player from the recovery path; the resume intent now stays armed and the watchdog can escalate into the guarded native-player reload instead of leaving the player stuck loading after `AdEnded`.
- **Startup Ads Counter Restore Drift** - Page-side `Ads Blocked` restore now merges any blocked-ad deltas captured before the initial stored count sync, preventing startup prerolls from being undercounted if they land during extension initialization.
- **Worker Bootstrap Main-Thread Stall** - Hooked worker startup no longer clones the original Twitch worker source through a synchronous page-thread `XMLHttpRequest`; it now boots the original script with `importScripts(...)` or `await import(...)` inside the worker itself, reducing jank during worker creation and crash recovery.
- **Post-Ad Backup Recovery Loop Guard** - Backup-stream ad exits now avoid the immediate native-player reload and pause/play pulse that could trigger a fresh Twitch ad request right after `AdEnded`, preventing the blocker from restarting the ad cycle unnecessarily.
- **Playlist Lifecycle Scoping** - Unknown backup playlists no longer inherit the active ad lifecycle, and stale cached ad segments are no longer treated as proof that an ad is still active, reducing stuck-loading and repeated backup-selection loops after ad recovery.
- **Obfuscated React Tree Recovery** - Fallback structural discovery was added for the Twitch internal player state component after it was obscured from the standard DOM node lookup hook, ensuring that the post-ad recovery sequence is no longer permanently suppressed by a failed component validation during the pause/play routine.
- **Post-Ad Recovery Bypass Loop Guard** - Post-ad recovery now dynamically memorizes the specific ad-free backup stream type that circumvented Twitch pre-rolls. This prevents the extension from blindly falling back to default ad-bearing proxy tokens which recently triggered post-ad stalling and artificial ad loop cycles.

## [5.1.4] - 2026-04-05

### Fixed
- **Counter Persistence On Navigation / Close** - Bridge-side ad and DOM-ad counter deltas now survive Twitch SPA route changes and flush on tab close, preventing valid blocked-ad totals from being lost during channel switches or page unloads.
- **Reserved Twitch Route Parsing** - Playback-context parsing now recognizes Twitch popout, embed, and moderator routes correctly instead of treating reserved path segments as live channel names.
- **Bridge Session Rebind Hardening** - The page bridge now binds to a per-session token and rejects unrelated later port swaps, reducing spoofable page-side event injection into counter and toggle state.
- **Buffer Recovery Pause-State Guard** - Buffer-fix recovery now checks the player wrapper, core state, and media element together before attempting pause/play or reload recovery, avoiding false interventions on already-paused playback.
- **Media-Clock Drift Correction** - Live-edge drift repair now uses the actual HTML media clock instead of stale core position snapshots, preventing unnecessary seek jumps during healthy live playback.
- **Backup Playlist Playability Gate** - Ad recovery no longer promotes non-empty but unplayable backup playlists; candidate backups must contain real media segments before they can replace the current stream.
- **Playlist URL Alias Matching** - Worker-side stream-info and resolution lookup now normalize playlist URL aliases so token/query churn and current-live VOD transport mismatches do not break backup recovery routing.
- **Metadata-Only Strip Empty-Playlist Recovery** - When Twitch marks an ad playlist only with metadata tags, the strip path now restores stripped segments rather than returning an empty playlist if no clean backup is available.
- **Post-Ad Spinner Recovery** - Post-ad recovery intent now survives Twitch's false "not paused" loading state, fallback/backup ad exits now escalate into one guarded native-player reload when playback remains unhealthy, and ad-start intent is preserved even if the player instance is still being rebuilt.
- **Hidden-Tab Monitor Backoff** - Playback-intent and live-buffer watchdog loops now consult Twitch's native visibility state and back off sharply in hidden tabs, reducing background CPU work when several Twitch tabs are open.
- **Popup Fallback Scan Scope** - Anti-popup cleanup no longer walks every button, link, heading, paragraph, and span in the document; it now inspects bounded popup-root candidates and only searches text inside those overlays.
- **MutationObserver Hot-Path Trimming** - DOM mutation prefiltering no longer does subtree-wide `querySelector(...)` checks inside the synchronous observer callback, and hidden tabs now defer rescan bursts until the page is visible again.
- **Cross-Tab Counter Fanout Reduction** - Storage-driven `Ads Blocked` restores no longer rebroadcast absolute count updates into every worker in each open tab; worker-side totals now reconcile from the reported event delta instead.

## [5.1.3] - 2026-04-04

### Fixed
- **Post-Ad Recovery Without Buffer Fix** - Fixed a regression where disabling the Buffer Fix toggle could leave live playback stuck on a loading spinner after ads because the post-ad recovery path exited before it could resume or reload the player.
- **Ad-Recovery / Buffer-Fix Separation** - Kept the Buffer Fix toggle scoped to normal live-buffer interventions only, while preserving the dedicated post-ad resume and reload safety net so ad blocking still recovers cleanly when Twitch ends playback at ad exit.
- **Less Aggressive Buffer Fix** - Tightened live stall detection so the buffer fix no longer fires just because Twitch is intentionally running a low-buffer catch-up window with future data still available.
- **Safer Live-Edge Drift Correction** - Limited automatic live-edge seeks to cases where the media element still reports future-ready playback data, avoiding forced jumps during active rebuffers.

## [5.1.2] - 2026-04-03

### Added
- **Buffer Fix Toggle** - Added a new "Buffer Fix" toggle to the popup UI, allowing users to enable or disable the experimental player buffer recovery behavior dynamically without needing to reload the page or extension.
- **Toggle UI Redesign** - Compacted the popup layout into a sleek dual-toggle container, giving both Ad Blocking and Buffer Fix controls equal prominence without expanding the popup's spatial footprint.

### Fixed
- **Ad Cleanup Zero-Width Obfuscation** - Hardened internal DOM ad detection against zero-width Unicode characters (`\u200B`, `\u200C`, etc.) which Twitch was using to obfuscate "Ad" labels and bypass cleanup.
- **Ad Cleanup Pipeline Optimization** - Refactored the DOM ad and shell cleanup routines so direct media stripping, display shell flattening, and promoted page collapsing all execute in a single sweep rather than short-circuiting on the first match.
- **Buffer Recovery Stability** - Changed the buffer fix recovery chain to explicitly re-fetch the live Twitch player instance before applying unpause intent, preventing the script from crashing or operating on a recycled React fragment.
- **Cross-World Bridge Plumbing** - Added full isolated-bridge protocol support for the new buffer toggle, ensuring real-time toggle changes serialize reliably into the page context.
- **VS Code Type Resolution** - Refactored `tsconfig.json` into a proper Solution Project configuration separating global module contexts from module-scoped runtime contexts to fix IDE type-checking collisions.

## [5.1.1] - 2026-04-01

### Fixed
- **Post-Ad Pause Intent Preservation** - Ad end cleanup no longer clears a real user pause, and the delayed resume path now only runs when the stream was actually playing before the ad cycle started.
- **Buffer Lifecycle Reset Hardening** - Buffer-fix counters, cached player references, and recovery cooldown state now reset on reloads, route changes, and disable transitions so fresh playback sessions do not inherit stale recovery state.
- **Live-Edge Buffer Guard** - The buffer monitor now distinguishes a true frozen player from a temporary empty live edge, skipping the old pause/play recovery in that state and only escalating to a reload if live-edge starvation persists.
- **Toggle-Off Recovery Cleanup** - Disabling ad blocking now immediately clears page and worker ad-recovery state, restores suppressed media, and stops stale post-ad resume behavior without waiting for another playlist transition.
- **Stream State Isolation** - Stream-info fallback now prefers the active media key, and per-stream reset no longer clears the shared ad-segment quarantine cache for unrelated playback contexts.

## [5.1.0] - 2026-04-01

### Fixed
- **Infinite Buffer Fix Loop** - Resolved a race condition where the extension's buffer recovery logic (which rapidly pauses and plays the stream) could be ignored by Twitch's React player causing the stream to stick in a paused state and spam `EventEmitter` memory leak warnings.
- **Buffer Fix Reload Failsafe** - If the stream buffer stalls and the lightweight recovery fix fails 3 consecutive times, the extension will now automatically escalate to a full playlist reload to force the stream to recover.

## [5.0.9] - 2026-04-01

### Fixed
- **Buffer Fix Pause Freeze** - Fixed a race condition where the extension's programmatic playback pause during a buffer recovery attempt could be misinterpreted as a user-initiated pause, which would permanently block subsequent resume attempts and leave the player stuck in a paused state.

## [5.0.8] - 2026-04-01

### Fixed
- **Post-Ad Player Pause Fix** - Widened the programmatic-pause detection guard window and made pause-intent suppression null-safe so Twitch's native ad-transition pause events are no longer misinterpreted as user intent, which previously could leave the player stuck paused after ad recovery.
- **Post-Ad Audio/Video Desync Fix** - After an ad-recovery player reload on a live stream, playback now explicitly seeks to the live buffer edge when the video position drifts more than 2 seconds behind, preventing the audio-ahead / video-behind desync that could persist after ad breaks.
- **Live Playback A/V Drift Correction** - The buffer monitor now continuously checks for audio/video sync drift during live playback and auto-corrects by seeking to the live edge when the video position falls more than 4 seconds behind the buffered head, catching desync that develops gradually after ad transitions.

## [5.0.7] - 2026-03-27

### Fixed
- **Queued Counter Delta Preservation** - Persisted ad counters now preserve queued local deltas when another Twitch tab updates storage first, preventing valid ad and DOM-ad counts plus per-channel attribution from being dropped before the background flush completes.
- **Bridge Handshake Reconnects** - Page-side bridge handshakes can now bind again after a port disconnect, allowing the isolated bridge channel to recover cleanly instead of retrying forever against a one-time listener.
- **Exact Backup Variant Framerate Matching** - Backup stream selection now compares parsed frame rates numerically, so same-resolution `30fps` and `60fps` variants pick the correct clean fallback instead of the first resolution match.
- **Playback Context Recovery Reset** - Route and media-context changes now clear stale reload and recovery cooldown state, preventing the previous stream's recovery markers from suppressing a required reload on the next stream.
- **Removal-Triggered Stale Shell Cleanup** - DOM ad cleanup now reacts to ad-node removals as well as additions, so lingering display-shell wrappers collapse immediately when Twitch tears the ad DOM out of the player.
- **Bridge Reconnect State Replay** - Reconnected page-side bridge ports now immediately replay the current toggle and counter state, preventing stale enabled status or ad counts after a transient port drop.
- **Stale Navigation Event Rejection** - Worker, bridge, and rescan paths now reject playback events as soon as Twitch navigation leaves the originating media context, preventing old-stream counters, reloads, and cleanup work from leaking into later routes.
- **Popup Transition Timing** - The popup statistics panel now derives its collapse fallback from the actual computed transition timing, preventing the close animation from snapping shut before the CSS transition finishes.

## [5.0.6] - 2026-03-26

### Fixed
- **Lingering Display Shell Layout Flattening** - Stale display-shell roots now stay flattened until Twitch clears leftover shell classes, preventing black L-shaped layout artifacts from lingering beside the live player after ad cleanup.
- **Lower-Third Layout Wrapper Collapse** - Lower-third display-ad wrappers near the player are now promoted into the layout-reset path, preventing bottom black bars from staying behind after the ad iframe is hidden.
- **Right-Side Inset Wrapper Collapse** - Explicit display-shell ads now also probe inferred side-inset player wrappers even without an ad label, preventing right-edge black columns from lingering after the DOM ad is hidden.
- **Ad Recovery Resume Hardening** - Post-ad resume intent now survives transient player pauses and keeps retrying through the live buffer monitor until playback actually resumes, reducing cases where ad recovery leaves the stream paused.
- **Stale Side Inset Collapse Hardening** - Previously reset player-shell wrappers now stay collapsed until the residual right/bottom inset actually clears, preventing paused ad-recovery transitions from reintroducing the side black bar.

## [5.0.5] - 2026-03-25

### Fixed
- **Navigation Cleanup Hardening** - Twitch SPA route changes now clear stale competing-media suppression state so old media elements do not stay retained or muted across long channel-hopping sessions.
- **Stale Recovery Timeout Cancellation** - Ad-detected, backup-selection, and ad-ended playback recovery retries are now tracked against the active media context and canceled on navigation, preventing old-channel resume/reload work from waking up after a route change.
- **Idle DOM Scan Backoff** - The page-side DOM cleanup watchdog now backs off its idle polling during stable clean playback and ramps back up on relevant ad or route activity, cutting periodic whole-page scan work during long sessions.
- **Playback Intent Heartbeat Backoff** - The 500ms playback intent monitor now slows down during no-media gaps and caches empty primary-media lookups, reducing repeated React/player discovery on non-playback pages and during Twitch SPA transition windows.
- **Live Buffer Monitor Scoping** - The live buffer watchdog now sleeps off non-live routes and drops cached player references when the active media key changes, preventing stale player polling after channel navigation.
- **MutationObserver Hot-Path Cleanup** - The observer prefilter now stays layout-free before it schedules a deferred scan, avoiding near-player detection and size reads inside the synchronous callback.
- **Stale Display Shell Cleanup Scoping** - Residual display-shell cleanup now only trusts recent real display-ad activity or extension-owned markers, reducing repeated stale cleanup passes and log noise without changing blocked-ad or DOM cleanup counting behavior.
- **Lingering Display Shell Layout Flattening** - Stale display-shell roots now stay flattened until Twitch clears the leftover shell classes, preventing black L-shaped layout artifacts from lingering beside the live player after ad cleanup.

## [5.0.4] - 2026-03-25

### Fixed
- **Performance Audit & Fixes** - Fixed 9 distinct hot-path performance bugs in the ad-scanning and player monitoring pipelines.
- **Cache Hit Restoration** - Fixed broken `undefined` cache guards in player and overlay bounding-box lookups (which recently broke after migrating to `null` sentinels), restoring zero-cost cache hits on every scan cycle.
- **Layout Thrashing Removed** - Removed expensive per-node `getBoundingClientRect()` and `getComputedStyle()` calls from the visible element checks, replacing them with cheap `offsetWidth`/`offsetHeight` fast paths.
- **Set Deduplication** - Replaced O(n) array lookups in the overlay bounding-box aggregator with O(1) Set tracking.
- **MutationObserver Calm Down** - Avoided triggering synchronous layout flushes inside the MutationObserver callback (which could run dozens of times per second during heavy chat).
- **Scan Pipeline Early Returns** - Added early-return shortcuts to the display-ad cleanup scan, bypassing 20+ heavy DOM queries on every cycle during clean native playback.
- **Player Monitor Stabilized** - The 500ms playback intent monitor now caches the active React/fiber tree lookup and skips the traversal entirely when the stream's media key hasn't changed.
- **Counter Route Hardening** - Worker `Ads Blocked` persistence now accepts the page-scoped media key in addition to the stream media key, so current-live VOD pages no longer drop valid ad counts when Twitch serves `/videos/<id>` playback through the live channel transport.
- **DOM Cleanup Counter Scope** - The DOM cleanup debounce now applies per cleanup kind instead of globally, preventing one overlay/display cleanup from suppressing a different cleanup that lands within the same second without changing scan cadence or adding new hot-path work.

## [5.0.3] - 2026-03-24
- **JavaScript-to-TypeScript Repo Conversion** - The repo was converted from checked-in JavaScript source files to a TypeScript-based layout, `npm run build` now compiles the TypeScript build runner before execution for wider Node compatibility, unpacked-extension loading now targets `dist/manifest.json`, and Chrome store packaging can be generated locally with `npm run package:chrome`.

### Fixed
- **Spoofable Bridge Messages** - Sensitive page-to-extension state sync no longer relies on raw `window.postMessage` traffic for toggles, counter restores, achievements, and ad-count persistence events. A dedicated `MessagePort` bridge now carries those messages through a private channel instead.
- **Counter / Worker Event Hardening** - Bridge-side stat persistence no longer stops retrying after a couple of transient runtime failures, DOM cleanup kinds now stay aligned with emitted runtime events, explicit per-event deltas are preserved through the bridge pipeline, VOD/live route filtering now uses media keys instead of only live-channel names, and stale worker restarts are skipped after Twitch SPA navigation.
- **DOM Scan / Navigation Hot Path** - Player-side popup, display-ad, and direct-media detection no longer repeat the same full-document selector passes and O(nÂ²) dedupe patterns on every scan. The runtime now reuses Set-based selector dedupe, combines visible/near-player checks, filters mutation noise with grouped selectors, tries the cheaper targeted popup selectors before the broad fallback sweep, defers route-change rescans into a short settled burst, and keeps fewer stale Twitch workers alive during SPA channel navigation.

## [5.0.2] - 2026-03-23

### Fixed
- **Twitch Page Stutter** - Reduced the popup/display-ad cleanup hot path that could make Twitch pages hitch or briefly freeze when ad UI appeared, especially during prerolls, display ads, or popup detection.
- **Player Overlay Search Scope** - CTA, banner, and ad-label detection now searches near the active player instead of repeatedly sweeping the full document, cutting unnecessary layout and selector work during normal playback.
- **Mutation Scan Noise** - Generic button and link churn no longer counts as an ad-scan trigger, so routine Twitch UI updates do not keep scheduling extra rescans.

## [5.0.1] - 2026-03-21

### Highlights
- **Channel Navigation Pause Fix** - SPA channel switches now clear stale pause intent from the previous player instance and ignore disconnected/non-primary media pause events, preventing the next stream from inheriting a paused state.
- **Post-Ad Resume Hardening** - Ad-end and buffer-fix recovery now suppress false pause intent and run guarded resume retries so playback is less likely to remain paused until a manual click after ads.

## [5.0.0] - 2026-03-21

### Highlights
- **VOD Ad Blocking Support** - Added `/videos/<id>` playback-context detection plus VOD usher and token handling so Twitch VODs run through the same ad-strip and backup-stream recovery flow as live streams.
- **Playback Context Isolation** - Worker state, stale-event checks, and post-ad cleanup now track a shared media key, preventing live and VOD routes from leaking ad or recovery events into the wrong player.
- **Current-Live VOD Event Routing** - When Twitch serves an active livestream's VOD page through the live channel transport, worker ad and reload events now keep the page's media key so recovery is not rejected as stale.
- **Live-to-VOD SPA Player Recovery** - Route changes from a live stream into its VOD now trigger a guarded player resync when Twitch leaves the old live player attached, preventing the large static `?` placeholder until a manual refresh.
- **DOM Scan Performance Hardening** - Popup and display-ad cleanup now coalesces repeated rescans, ignores noisy chat-only DOM mutations, and backs off idle polling so the extension does not keep hammering full-page scans during normal playback.
- **VOD Display-Ad Overlay Detection** - Player-side display-ad cleanup now recognizes generic `Learn More` CTA overlays and the `right after this ad break` banner shell, improving cleanup on current-live VOD pages.
- **Direct Amazon MP4 VOD Ads** - VOD cleanup now detects standalone `m.media-amazon.com` ad video playback near the main player, suppresses that injected media element, nudges playback back onto the actual archive stream, and now requires matching player-ad UI signals so live/VOD transition media is not treated as a standalone ad.
- **New Lower-Third SDA Banner Variant** - Added explicit handling for Twitch's `data-test-selector="sda-frame"` / `#stream-lowerthird` lower-third subscription-display banner so the newer DOM variant is hidden like the older iframe-based SDA banners.

## [4.4.0] - 2026-03-21

### Fixed
- **Display Ad Feedback Button Artifacts** - Player-side display-ad cleanup now upgrades matched `Ad` labels to their enclosing feedback-button wrapper when Twitch renders the `Leave feedback for this Ad` overlay, so the full lingering control is hidden instead of only the inner text node.

## [4.3.9] - 2026-03-21

### Fixed
- **Lingering Display Ad Labels** - Display-ad cleanup now gathers matching player-side ad label elements and hides them directly, removing leftover `Ad` / countdown-style badges that could remain visible near the stream player.

## [4.3.8] - 2026-03-19

### Fixed
- **Auto Locale Resolution** - The popup's `Auto` language mode now prefers Chrome's UI locale plus the browser's preferred-language list instead of only `navigator.language`, and it correctly treats Traditional Chinese variants like `zh-HK` and `zh-MO` as `zh_TW`.

### Changed
- **Locale Polish** - Refined shipped non-English popup strings and manifest locale metadata so labels, descriptions, and helper text read more naturally across the supported locales.

## [4.3.7] - 2026-03-19

### Fixed
- **Lower-Third Display Ad Iframes** - The DOM blocker now treats Twitch `sda-iframe-*` / `Stream Display Ad` lower-third iframes as explicit display-ad signals, so Amazon-backed `srcdoc` lower-third banners are hidden and cleaned up reliably during and after ad recovery.

## [4.3.6] - 2026-03-19

### Fixed
- **Cross-Tab Counter / Stats Races** - Persisted counters and statistics now update through a dedicated extension background worker, eliminating the per-tab read/modify/write races that could lose totals, daily buckets, per-channel stats, and achievement unlocks.
- **Backup Policy Bypass** - Backup stream selection no longer promotes fallback or minimal-mode playlists after the clean-playback policy rejected them, preventing ad-marked backups from slipping back into playback.
- **Token Relay Fallback** - Backup token requests now create a fresh abort controller for direct-fetch fallback after a relay timeout, so relay failures do not poison the retry path with an already-aborted signal.
- **Bridge Event Validation** - The bridge now ignores cross-channel and malformed DOM cleanup events before they reach persisted counters, reducing bad state from stale or invalid page-side events.

## [4.3.5] - 2026-03-19

### Fixed
- **Post-Ad Audio Delay** - During ad recovery the page now suppresses competing `video` and `audio` elements, then restores their original mute/volume state when the ad ends so stale backup-player audio cannot linger behind native playback.
- **Ad-End Channel Matching** - Worker ad events now normalize observed channel names before stale-channel checks, preventing valid `AdEnded` cleanup from being skipped because of casing or route-format differences.

## [4.3.4] - 2026-03-18

### Fixed
- **Worker Crash Recovery** - Worker restarts now recreate the original Twitch worker instead of attempting to relaunch from a stale injected blob URL.
- **Player Preference Preservation** - Player quality, mute, volume, and related preferences are now preserved through explicit snapshot/restore during reloads instead of a global `localStorage` monkey patch.
- **Route-Change Handling** - Popup-blocker route resets no longer monkey-patch `history.pushState` / `history.replaceState`; URL changes are now handled through native events and the existing DOM observers.
- **Device ID Capture** - Twitch `unique_id` synchronization no longer overrides `localStorage.getItem`; the runtime now syncs the device ID directly during initialization, worker bootstrapping, and GQL interception.

### Changed
- **Tooling Updates** - Updated Biome to `2.4.7` and Knip to `6.0.0-1`, including the corresponding schema metadata refresh.

## [4.3.1] - 2026-03-17

### Fixed
- **DOM Counter Race Condition** - Persisted DOM deduplication state across route changes so stale picture-in-picture shells are only counted once.
- **Post-Ad Player Resume** - Added state-gating to player resumes after ads so it respects the user's manual pause choice.
- **Transient Ad-End Resets** - Debounced ad-end evaluations in the processor to prevent premature test resets from spurious clean playlists.
- **Worker Initialization Guards** - Guarded worker blob instantiation to prevent SecurityErrors on revoked URLs during crash recovery, and strictly checked worker reloads against current channel contexts.
- **Unused Variables** - Removed unused variables in the worker hooks to resolve Biome linter warnings.

## [4.2.7] - 2026-03-13

### Fixed
- **Post-Ad Reload Loops** - Ad recovery no longer drops back into a native reload path right after `AdEnded`, preventing the player from immediately restarting the same ad cycle.
- **Post-Ad Resume Safety** - Player resume intent is now tracked across ad cycles so playback is only resumed when the viewer had actually been watching before Twitch interrupted the stream.
- **Blocked Counter Inflation** - Worker ad-end detection now waits for confirmed clean media playlists instead of treating a transient clean-looking playlist as the end of the ad, which stops repeated `AdBlocked` increments during a single ad pod.
- **Stale Display Shell Cleanup Churn** - Residual display-shell and mini-player artifacts are now signature-deduped during stale cleanup, preventing repeated DOM cleanup counting and redundant layout-reset passes on the same leftover shell.
- **Duplicate Worker Helper Injection** - `_getStreamVariantInfo` was being serialised into the worker blob twice, doubling that code path in every spawned worker and risking a redeclaration error in strict-mode contexts. The duplicate injection has been removed.
- **Worker Restart Failure** - Worker auto-restart was calling `new Worker(blobUrl)` with a URL that had already been revoked via `URL.revokeObjectURL`, causing all restart attempts to silently fail with a `SecurityError`. The injected code is now stored so each restart creates a fresh blob URL.
- **Cross-Channel Player Reload** - `ReloadPlayer` messages from the worker carried no channel identifier, allowing a background tab's worker completing an ad cycle to trigger a player reload on a different foreground channel. The message now carries the channel name and the handler applies stale-channel gating consistent with other worker events.
- **ReloadAfterAd Default** - The `ReloadAfterAd` state flag used `?? true` as its undefined-fallback, which would silently enable post-ad player reloads if the constant was ever absent. The fallback is now `?? false`, matching the constant's intended default.


## [4.2.6] - 2026-03-11

### Fixed
- **Popup Safety Guards** - The popup now exits safely when required UI nodes are missing, guards startup/toggle/statistics storage failures, normalizes malformed persisted counters/stats, and recovers invalid saved locale values instead of breaking the UI.
- **Popup Accessibility / Interaction Polish** - Improved keyboard and focus behavior for the stats toggle and achievement badges, restored native button/label semantics, stabilized helper status messaging, added chart/list semantics, localized live labels, and preserved reduced-motion behavior.
- **Footer / Version Label Cleanup** - Footer link hover text and aria labels were tightened to shorter, more natural wording across locales, and the version badge now keeps both its static fallback text and localized accessibility label in sync.
- **Achievement Rendering Hardening** - Popup achievement labels, progress, and next-achievement messaging now fall back safely when locale data is missing or malformed, while runtime toast rendering escapes dynamic text and avoids body/null timing crashes.
- **Channel / Counter Normalization** - Popup and bridge logic now normalize channel names, channel totals, daily buckets, achievement lists, numeric-string counters, finite event counts, and malformed stats maps so persisted data is rendered consistently.
- **Stats Write Reliability** - Repeated ad and DOM-ad increments are now batched more safely, retry paths are bounded, fresh storage state is re-read after failures, and queued deltas are dropped when stored totals reset so stale writes do not clobber good data.
- **Bridge / Message Validation** - Bridge and page message handlers now require same-window trusted payload shapes, finite counts, boolean toggle state, and string achievement ids before mutating runtime or popup state.
- **UI Toast Safety** - Welcome, donation, and achievement toasts now avoid duplicate scheduling/listeners, guard localStorage access, reuse existing nodes more safely, skip rendering when `document.body` is unavailable, and use opener-safe external links.
- **Popup Stats Presentation** - Weekly chart bars now keep localized number formatting and explicit aria labels, collapse transitions are more stable, the panel resizes to content, and top-channel rows render through safe DOM APIs instead of string HTML.
- **Locale Polish** - Popup copy and extension metadata across all shipped locales were reviewed and updated so phrasing, labels, and descriptions read more naturally.

### Changed
- **Build Validation Expansion** - `build.js` now validates popup element/link wiring, translation coverage and placeholders, shared counter/date/achievement definitions, locale-directory parity, canonical repo/homepage metadata, safe external-link behavior, and docs wording around privacy/storage metrics.
- **Manifest / Metadata Sync** - The manifest now keeps localized action titles plus canonical homepage/short-name metadata, while package/package-lock/README/changelog/generated bundle metadata are enforced in sync for the 4.2.6 release line.
- **Docs Refresh** - README and changelog release notes were expanded to better reflect the full 4.2.6 popup, stats, localization, and validation hardening work.

## [4.2.5] - 2026-03-11

### Fixed
- **Worker Crash Loops** - Hardened worker/bootstrap message handling and playlist parsing to prevent restart loops caused by malformed or non-standard frontpage, home, and outstream worker contexts.
- **Worker Runtime State Sync** - Newly created or restarted workers now receive current toggle state, blocked-ad counts, current ad channel, and pinned backup player state immediately instead of waiting for later rebroadcasts.
- **Intentional Worker Eviction** - Workers intentionally terminated during worker-cap cleanup are no longer misclassified as crashes and restarted unnecessarily.
- **Paused-Player Recovery** - Recovery reloads are no longer suppressed just because Twitch reports the player as paused.
- **Ad-End Channel Handling** - Worker `AdEnded` events now carry channel context so stale-channel protection can correctly reject old ad-end events.
- **Native-Restore Cleanup** - Disabling ad blocking during an active ad cycle now clears stale ad-cycle and page-side recovery state more reliably when returning to native playback.
- **Playback Token Parsing** - `_extractPlaybackAccessToken` now unwraps nested, batched, and array GraphQL payloads more defensively and preserves payload/error diagnostics when Twitch returns unexpected response shapes.
- **Worker Backup Token Requests** - Backup `PlaybackAccessToken` fetches now relay through the page fetch context instead of depending on direct worker request behavior that could return unusable `server error` responses.
- **Backup Switch Recovery** - Selecting a usable backup player type now triggers a guarded player reload and tracks backup-stream state so the player actually leaves Twitch's static ad shell instead of getting stuck with ad audio still playing.
- **Post-Ad Freeze Recovery** - Added a direct ad-end reload path so the player is less likely to remain frozen or visually stale after Twitch hands playback back to the native stream.
- **Fallback Candidate Tightening** - Reduced dead-end fallback churn by removing weaker backup candidates and tightening minimal-request fallback selection around the more reliable recovery paths.

### Sync / State / Toggle
- **Duplicate Toggle Propagation** - Removed overlapping popup and bridge rebroadcast paths so toggle changes are applied once through the canonical storage-sync flow.
- **Toggle State Ordering** - Bridge toggle handling now lets storage changes drive canonical runtime state updates, avoiding out-of-order bridge-state mutation.
- **Duplicate Startup Replay** - Startup count/toggle replay now ignores identical restores instead of reapplying duplicate state or rebroadcasting redundant worker updates.
- **Duplicate Backup Selection Churn** - Repeated same-value backup selection events no longer reapply pinned backup state or rebroadcast unnecessary worker updates.

### Statistics / Achievements
- **Storage Failure Hardening** - Added guards for popup and bridge storage read/write failure paths so toggle state, counters, and popup statistics fail safely instead of silently drifting or throwing.
- **Counter Persistence Reliability** - Counter deltas are now requeued after storage write failures instead of being silently dropped.
- **Stats Retry Safety** - Stats updates now retry from fresh storage state after write failures, avoiding stale snapshot overwrites and reducing lost achievement/stat updates.
- **Stats Read Guards** - Hardened `getAdsBlocked`, `updateStats`, `flushCounters`, popup init, and popup statistics reads against empty or failed storage results.
- **Stats Schema Hardening** - Popup and bridge now normalize malformed stats shapes, finite counts, per-channel totals, chart data, and achievement lists before rendering or writing.
- **Finite Count Validation** - Runtime message restores and popup/bridge counter paths now reject `NaN` and other non-finite values instead of treating any JavaScript `number` as valid state.
- **Retry Loop Bounding** - Bridge counter flushes and stats refreshes now cap retry chaining on persistent storage failures instead of requeuing forever.

### Runtime / Build Integrity
- **Worker Helper Injection Guard** - Build-time validation now fails if worker-injected helpers like `_getFallbackPromotionPolicy` or `_extractPlaybackAccessToken` are referenced without being bundled.
- **Worker Helper Dependency Coverage** - Build validation now also checks the helper dependency chain used by playback-token parsing so worker bundles cannot reference newly introduced token helpers without injecting them too.
- **Shared Definition Parity Checks** - Build-time guards now keep popup, bridge, UI, locales, README, changelog, and manifest metadata synchronized for achievements, translations, routes, versions, and documented counts.
- **Localized Manifest Guardrails** - `build.js` now fails if `manifest.json` stops using `__MSG_extName__` / `__MSG_extDesc__`, protecting locale-backed extension naming from accidental plain-string drift.
- **Popup Status Message Tuning** - Opening the popup or receiving remote state syncs now keeps the helper text stable on `Changes take effect instantly`; the temporary green/red status flash is reserved for user-initiated toggle changes.
- **Native Player-Type Truth Source** - Native player-type state is now learned from token responses instead of request bodies, so observational `site` requests no longer overwrite the effective `popout` state.
- **Message Payload Validation** - Page-side message listeners now require trusted same-window sources plus well-typed payloads for toggles, counts, channels, and achievement ids before mutating runtime state.
- **Removed-Path Lockouts** - Build-time guards now fail if removed reload-after-ads, dead backup-tracking, stale stats, or dead worker-message identifiers reappear in live source.
- **Removed-Feature Residue Cleanup** - Deleted the last leftover bridge cleanup wiring for the removed reload-after-ads setting so the feature is fully gone instead of being lazily migrated forever.
- **Intentional Sharp-Edge Isolation** - Build-time checks now keep the worker bootstrap `eval(wasmSource)` and synchronous worker-source XHR isolated to their known bootstrap path instead of silently spreading.

### Popup / UI Hardening
- **Safer External Opens** - Popup footer, donate buttons, and runtime UI reminder opens now use `noopener,noreferrer`, and build validation now enforces that `_blank` opens keep that opener-safe pattern.
- **DOM-Safe Rendering** - Popup next-achievement rendering and runtime achievement toasts now avoid or escape dynamic HTML content instead of trusting interpolated strings.
- **Popup State Recovery** - Popup language, counters, channels, charts, and achievements now normalize malformed persisted values before rendering so corrupted local state does not break the popup.

### Stability
- **Hidden-Tab Crash Recovery** - Hidden-tab crash recovery now has a fallback refresh path and avoids duplicate refresh triggers when the tab becomes visible before the timer fires.
- **Wrong-Route Rescan Safety** - Channel-tagged ad-blocked rescans are now ignored on the wrong route instead of triggering follow-up cleanup outside the active channel context.

### Tooling
- **Biome Cleanup** - Resolved remaining Biome formatting and lint violations so the repo stays clean under the current lint baseline.
- **Knip 6 Readiness** - Updated the `knip` dependency and schema to `6.0.0-0` and reverified the production scan with the new analyzer baseline.

## [4.2.4] - 2026-03-10

### Changed
- **Display Ad Detection Tightening** - Refined stream-display and picture-in-picture shell detection so DOM-side cleanup now requires stronger visible ad signals near the main player before it counts or collapses anything.
- **Ad Label Gating** - Visible `Ad` labels near the player are no longer treated as enough on their own; DOM-side display-ad cleanup now also requires a matching shell, PIP, or layout-state signal before it counts as a blocked ad.
- **Explicit vs Inferred Display Shell Handling** - DOM-side stream-display cleanup now separates explicit ad evidence from inferred shell geometry. Explicit player-ad nodes or promo CTAs can count as blocked ads, while geometry-only shell inference is limited to silent layout cleanup.
- **Player Surface Safety** - Limited display-ad cleanup to explicit ad nodes and layout reset paths, reducing cases where broad player overlay removal could blank the video surface or mis-handle stale ad events.
- **Offline Page Ad Handling** - Added dedicated offline channel-page promo ad detection so Twitch's non-live "watch after this break" cards can be hidden and counted without relying on live player ad flow.

### Fixed
- **False-Positive Ad Counts** - Clean channels are less likely to increment `Ads Blocked` from leftover stream-display layout classes or unrelated page elements.
- **Label-Only False Positives** - Fixed cases where ordinary player UI or transient `Ad` labels could increment `Ads Blocked` even though no real worker-side ad cycle or display-ad shell was present.
- **Geometry-Only Shell False Positives** - Fixed cases where inferred stream-display wrappers on normal layouts could still fire `ttvab-ad-blocked` and achievements even though only silent shell cleanup should have run.
- **Black Screen With Audio** - Fixed a regression where overly broad display-ad cleanup could leave the player visually black while audio kept playing.
- **Stale Cross-Channel Ad Events** - DOM-side ad handling now ignores stale `ttvab-ad-blocked` events from other channels instead of applying cleanup to the wrong tab.
- **Warning Log Level** - Warning messages were silently routed to `console.info` instead of `console.warn`, making them invisible when filtering by console level.
- **Backup Cache Data Structure** - `BackupEncodingsM3U8Cache` was initialized as an `Array` but used with string keys, causing silent data loss if the cache was ever serialized.
- **Minify Name Collision** - `_reinsert` minified to `_$ri` which was a substring of `_REMINDER_INTERVAL`'s `_$ri2`, risking interference across replacement passes.
- **Tab Visibility Auto-Resume** - Auto-resume after visibility change required the video to be muted, preventing unmuted streams from resuming on tab refocus.
- **Playlist Parser Out-of-Bounds** - The final ad-strip loop computed `lines[i+1]` outside the bounds guard, performing unnecessary work on the last line.
- **Null TextContent Guard** - Popup scan could throw on nodes with null `textContent` during span-length checks.
- **Health-Check False Alarms** - The bridge counter health-check could false-alarm when the `StorageQueue` hadn't finished flushing yet.
- **Popup Chart Average Reset** - `applyTranslations` reset the weekly chart average display to 0 on every language change instead of preserving the real value.
- **Worker Blob URL Timing** - `URL.revokeObjectURL` was called synchronously after worker creation, risking revocation before the browser loaded the blob.
- **Missing Reserved Routes** - `_getCurrentChannelName` in the popup blocker was missing `"jobs"` and `"wallet"` from its reserved-routes set, differing from the equivalent check in the worker hook.
- **Incomplete Minify Map** - 8 internal function names (`_hasPlaylistAdMarkers`, `_syncStreamInfo`, `_resetStreamAdState`, `_getStreamInfoForPlaylist`, `_getFallbackResolution`, `_hasExplicitAdMetadata`, `_isKnownAdSegmentUrl`, `_playlistHasKnownAdSegments`) were missing from the build minification map.
- **DOM/Worker Double-Count** - Display-ad shell and promoted-page ad detection on the DOM side could both fire `_incrementAdsBlocked` while the worker's HLS ad detection already counted the same ad, inflating the Ads Blocked counter.
- **localStorage Hook Chaining** - `_hookLocalStoragePreservation` was initialized after `_hookStorage`, causing the preservation hook to capture the already-wrapped `getItem` instead of the real one. Reordered to preserve the native reference.
- **Perpetual Backup Skip** - `LastPlayerReload` was set on every master playlist refresh, not just actual player reloads. This kept the minimal-requests window perpetually active, permanently skipping early backup player types during ad recovery.
- **Buffer Fix Counter** - After the buffering fix triggered a pause/play or reload, `numSame` was not reset to 0, preventing re-triggering if the same stall persisted after the fix attempt.
- **Crash Monitor Death** - The crash monitor's MutationObserver and interval were disconnected even when `handleCrash` returned early (during `Error #2000` ad-recovery grace period), permanently killing crash detection.
- **Backup Cache Wipe During Ads** - `_syncStreamInfo` cleared `BackupEncodingsM3U8Cache` on every master playlist refresh, forcing expensive token and usher re-fetches during active ad breaks instead of reusing cached backups.
- **Next-Achievement Overwrite** - `applyTranslations` in the popup unconditionally reset the next-achievement hint to the first achievement ("Ad Slayer") on every language change, ignoring the user's actual progress.
- **Stats Silent Failure** - `updateStats` in the bridge script did not check `chrome.runtime.lastError`, causing silent data loss and false achievement notifications when storage operations failed.
- **Achievement Persistence** - The `stats.achievements` array was only written to storage when new achievements unlocked, leaving it uninitialized (`undefined`) until the first unlock.
- **Request-State Source Check** - The `ttvab-request-state` message handler in the bridge was missing an `e.source === window` guard, allowing iframes to trigger state broadcasts.
- **Achievement Progress Denominator** - The popup showed a hardcoded `/12` achievement count instead of using the actual `ACHIEVEMENTS.length`.
- **Achievement Badge Guard** - `renderAchievements` could throw on `badges[i]` if the popup HTML had fewer badge elements than the `ACHIEVEMENTS` array.
- **Worker Header Updates Dropped** - `_hookMainFetch` sent batched header updates (Client-Integrity, Authorization, Client-Version, etc.) to workers as a single array message, but the worker's message handler expected individual `{key, value}` messages. All header updates were silently dropped for the entire session.
- **Stream Info Fallback Sort** - `_getStreamInfoForPlaylist`'s fallback sort used `LastPlayerReload` as tiebreaker, which was `0` for most streams. Now uses a new `LastActivityAt` field set on every master playlist poll.
- **Stale Stream Check Flooding** - The liveness check for existing stream info fetched a variant URL on every master playlist poll (15-30 extra requests/minute). Now throttled to once every 10 seconds.
- **Hook Chaining Order** - Restored `_hookStorage()` before `_hookLocalStoragePreservation()` so that `unique_id` reads through the preservation hook's fallback path still go through the device ID capture hook.
- **Missing Minify Entry** - `_broadcastWorkers` was missing from the build minification map, leaving it unminified in the output.
- **Cross-Tab Counter Race** - Each tab's bridge did a non-atomic read-increment-write on `ttvAdsBlocked`, causing lost counts when multiple tabs blocked ads simultaneously. Replaced with debounced delta-based flush that reads fresh values at write time.
- **Cross-Tab Stats Clobber** - The `ttvStats` object suffered the same cross-tab race, with concurrent writes from different tabs overwriting each other's channel/daily data. Now batched via the same debounced flush.
- **Health Check False Positives** - The counter health check produced false alarms in multi-tab scenarios because it didn't account for cross-tab increments. Removed in favor of the self-correcting delta-based approach.
- **Toggle State Not Propagated** - The `chrome.storage.onChanged` listener updated `bridgeState.enabled` but never posted `ttvab-toggle` to the content script, causing stale toggle state when the popup's `sendMessage` failed to reach a tab.

## [4.2.3] - 2026-03-10

### Changed
- **Ad Recovery Stability** - Reworked backup stream recovery so Twitch token, playlist, and reload handling stay synchronized more reliably during preroll and midroll transitions.
- **Native Token Control** - Tightened native `PlaybackAccessToken` handling so the player follows the intended recovery path more consistently instead of drifting back to Twitch's default token flow.
- **Display Ad Shell Handling** - Expanded DOM-side cleanup for Twitch's newer stream-display / picture-in-picture ad layouts, including direct shell selectors, layout-state resets, and post-block rescans when the player leaves white `L`-shaped ad framing behind.
- **Worker and Playlist Hardening** - Strengthened worker bootstrap, playlist parsing, and fallback validation so recovery is less likely to stall, misclassify playback, or accept ad-bearing backup content.
- **Popup, Stats, and Localization Polish** - Consolidated the popup, local-day stats, and localization fixes shipped during the 4.2.2 cycle into the current release baseline.

### Fixed
- **Visible Ad Shells After Blocked Ads** - Stream-display ad shells that could survive after `ttvab-ad-blocked` now get explicit DOM collapse and player-layout reset handling, reducing cases where the ad video is blocked but the visual shell stays on screen.
- **Reload and Buffer Loops** - Reduced duplicate ad-recovery reloads, false-positive refreshes, and unstable fallback transitions that could bounce the player during ad windows.
- **Fallback Ad Leaks** - Closed several cases where ad-marked or metadata-only fallback playlists could still slip through as apparently clean playback.
- **Worker Runtime Regressions** - Fixed helper injection, worker sync drift, and compatibility issues that could break recovery or crash the player after Twitch updates.

## [4.2.2] - 2026-03-09

### Changed
- **Stream Mapping Refresh** - Master playlist refreshes now rebuild `StreamInfosByUrl`, resolution lists, usher params, and related backup caches on every successful usher fetch. This keeps backup selection aligned with Twitch's latest rotated playlist URLs instead of reusing stale stream metadata.
- **Relative Variant URL Mapping** - Stream metadata now stores both raw and resolved variant URLs from master playlists, improving compatibility with Twitch manifests that return relative playlist paths.
- **Fallback Resolution Recovery** - Ad processing now falls back to the best known resolution entry when the current media playlist URL is missing from the active stream map, instead of immediately giving up on backup selection.
- **GraphQL Hash Sync** - The main-page fetch hook now extracts `PlaybackAccessToken` persisted-query hashes from both `fetch(Request)` and `fetch(url, opts)` traffic, so backup token requests stay synchronized with Twitch hash rotations across both request styles.
- **Forced Native Token Alignment** - Native page `PlaybackAccessToken` requests are now rewritten to the configured forced player type and matching platform, keeping the main player on the intended recovery path instead of falling back to Twitch's default token flow during ad handling.
- **Worker URL Compatibility** - Worker interception now normalizes relative worker URLs and `URL` objects before Twitch-origin checks and injected worker bootstrap loading.
- **Conservative Playlist Stripping** - Media playlist stripping now relies on explicit ad metadata and known ad-segment URL patterns instead of treating broad classes of non-`,live` segments as ads. This reduces false-positive stripping on current Twitch playlists.
- **Explicit Ad Marker Detection** - Ad detection now requires concrete Twitch ad markers instead of treating generic `stitched` text as an ad signal, reducing false-positive recovery and refresh loops during normal playback.
- **Segment-Level Ad Detection** - Recovery now also detects ad playlists from known ad segment URLs, restoring real ad blocking for playlists that no longer expose strong top-level ad markers.
- **Fallback Ad Validation Alignment** - Fallback selection now uses the same explicit metadata and segment-level ad checks as playlist stripping, preventing ad-bearing backup playlists from being treated as clean candidates.
- **Adaptive Backup Selection** - Backup recovery now tracks the last native `PlaybackAccessToken` player type Twitch used and prioritizes that player type first during ad recovery, reducing wasted retries before a usable backup path is found.
- **Ad-Cycle Backup Pinning** - Once a backup player type is selected for an active ad cycle, that choice now stays pinned across worker restarts so recovery does not restart from a cold state on every reload.
- **Duplicate Recovery Reload Suppression** - Player reload requests are now debounced globally and rate-limited during ad recovery, reducing repeated reload loops inside the same ad window.
- **Minimal Recovery Hardening** - Post-reload minimal recovery no longer accepts ad-bearing backup playlists just to reduce request count, preferring reliable ad blocking over unsafe fast-path playback.
- **Local-Date Statistics** - Daily stats and the popup's weekly chart now bucket events by the user's local day instead of UTC, preventing day rollover drift and mislabeled chart points in non-UTC timezones.
- **Build Banner Preservation** - Generated bundles now keep a top-of-file banner comment so `src/scripts/content.js` starts with an identifiable header instead of a blank line or raw wrapper line.
- **Popup Localization Coverage** - The popup now localizes its remaining static and dynamic UI copy, including the header description, footer text, chart labels, achievement labels/tooltips, and next-achievement text instead of mixing translated and hardcoded English strings.

### Fixed
- **Worker Prototype Mutation** - `_cleanWorker()` no longer mutates the native `Worker.prototype` globally; it now sanitizes a derived worker class so the page's original worker implementation remains intact.
- **Worker Broadcast Drift** - Shared worker update broadcasts now automatically drop dead workers after postMessage failures, keeping runtime state sync cleaner after worker crashes or reloads.
- **Worker Bootstrap Helper Sync** - Injected worker bootstraps now include all parser/processor helpers required by the current runtime, fixing player crashes such as `MediaPlaylist ... _getStreamInfoForPlaylist is not defined`.
- **Bridge Toggle Desync** - The isolated bridge now keeps its cached enabled state and startup counters synchronized with `chrome.storage.onChanged`, preventing stale `ttvab-request-state` rebroadcasts after popup toggles.
- **Immediate Toggle Re-Broadcast** - The bridge now updates its in-memory toggle state before rebroadcasting, removing the short stale-state window immediately after popup toggles.
- **Backup Cache Invalidation** - Successful backup master playlist caches are no longer discarded after every attempt; caches now survive until a real fetch failure or ad-bearing candidate requires invalidation.
- **Token Timeout Cleanup** - Backup token fetches now always clear their abort timeout in a `finally` block, preventing orphaned timers after failed or aborted requests.
- **Toggle Recovery State** - Disabling ad blocking during an active ad cycle now clears fallback and modified-playlist runtime state immediately instead of leaving the player stuck on rewritten manifests until a later transition.
- **Hidden-Tab Crash Guard** - Crash monitoring now reads preserved native visibility getters, so hidden Twitch tabs stay protected from unwanted auto-refresh even while visibility spoofing is active.
- **Hidden-Tab Popup Scan** - Idle popup scans now also use preserved native visibility getters, reducing unnecessary hidden-tab DOM scanning after visibility spoofing is active.
- **Ad Recovery Crash Grace** - `Error #2000` crashes that occur immediately during an active ad recovery window now get a short grace period before auto-refresh, reducing false-positive page reloads while the player is still stabilizing.
- **HEVC Fallback Playlist URIs** - HEVC-to-AVC fallback master playlists now emit valid replacement variant URLs without trailing whitespace, preventing malformed playlist entries during codec fallback.
- **Metadata-Only Fallback Ads** - Ad-marked fallback playlists now force-strip their media segments even when Twitch does not expose easily matchable ad segment URLs, closing a visible ad leak in fallback mode.
- **Empty Playlist Buffering Loop** - When stripping would otherwise empty a playlist, recovery now restores up to 6 recent segments instead of 3, giving the player more runway to stabilize after ad transitions.
- **Popup Localization Drift** - Popup status text now stays localized after toggles, storage updates, and language changes instead of reverting parts of the UI back to English.
- **Translation Quality Pass** - Improved weaker popup wording in German, Russian, and Simplified Chinese so toggle states and counter labels read more naturally.

## [4.2.1] - 2026-03-06

### Changed
- **Playback Token Parity** - Playback token requests now include session and language headers captured from Twitch while only sending `Client-Integrity` when a real value is available.
- **Worker Fetch Compatibility** - Hardened worker fetch interception to support `Request`-based playlist requests, preserve response metadata, and keep ad-segment replacement behavior consistent across HLS fetch paths.
- **Worker State Sync** - Worker bootstrap state injection now uses safe JSON serialization and propagates additional runtime flags needed by the main script.

### Fixed
- **Backup Retry Loop** - Backup player types that already fail to return a usable token, or already resolve to ad-marked playlists, are now skipped on later retries during the same ad cycle. This reduces wasted backup attempts and accelerates fallback selection.

## [4.2.0] - 2026-02-28

### Changed
- **Ad-Block Update** - Synchronized internal ad-block logic settings for improved streamer support and ad bypassing.
- **Player Reload Action** - Sends an immediate reload message to the player upon HEVC codec swaps and ad boundaries to improve stability.
- **Minimal Requests Optimization** - Limits backup stream fetch connections shortly after player reloads, preventing excessive requests.
- **HEVC Stream Stability Fix** - Enforces precise segment stripping boundaries for mixed-codec HEVC payloads directly within the parsing logic.
- **Buffering Logic Optimization** - Transitioned player buffer tracking constants into the state configuration, ensuring accurate pre-roll limit boundaries and minimal repeat delays.
- **Code Quality Pass** - Performed an extensive dead code audit checking for usage across all decoupled modules. Integrated Biome formatting/linting and resolved all syntax warnings resulting in a robust and completely lint-free bundle.

## [4.1.9] - 2026-02-12
### Fixed
- **Twitch Player Structure Compatibility** - Added compatibility handling for Twitch's player object change where `core` can now be nested under `player.playerInstance.core` (while preserving support for `player.core`).
- **Player State Reads** - Updated pause, volume, quality, and buffering state checks to use the compatibility resolver so reload and buffering logic continue to work across both player structures.

## [4.1.8] - 2026-02-04

### Fixed
- **Buffering Fix** - Implemented a forced player reload when buffering loops are detected, replacing the previous pause/play release mechanism. This effectively breaks "endless buffering" cycles caused by ad insertion logic.
- **Ad Transition Stability** - Enabled automatic player reload when ads are detected (`ALWAYS_RELOAD_PLAYER_ON_AD`), preventing the player from getting stuck in a buffering state during ad breaks.

## [4.1.7] - 2025-12-25

### Fixed
- **Endless Buffering Fix** - Increased segment recovery threshold from 1 to 3 segments when all segments are stripped. This gives the player adequate buffer runway to prevent endless buffering/spinning during ad breaks.
- **Smart Prefetch Preservation** - Prefetch entries (`#EXT-X-TWITCH-PREFETCH`) are now only stripped if they point to known ad segments. Previously ALL prefetch entries were removed during ad detection, preventing the player from buffering ahead on live content.

## [4.1.6] - 2025-12-24

### Changed
- **Backup Player Type Priority** - Reordered backup player types from `['embed', 'autoplay', 'site', 'picture-by-picture-CACHED']` to `['embed', 'popout', 'autoplay']`. The `popout` player type now replaces `site` as the secondary backup.
- **Force Player Type Update** - Changed `ForceAccessTokenPlayerType` from `'embed'` to `'popout'` to reduce preroll ads.
- **Player Reload Index** - Changed `PlayerReloadMinimalRequestsPlayerIndex` from `0` (embed) to `2` (autoplay) for improved stability.

### Fixed
- **Preroll Buffer Fix** - Relaxed buffer position check from `position > 0` to `position > 5` to prevent issues with preroll ads causing player stalls.

## [4.1.5] - 2025-12-19

### Fixed
- **Ad Fallback Processing Errors** - Fixed an issue where the extension was serving "processing" (404) segments during ad fallback mode, causing the player to throw "Failed to fetch" errors. The parser now correctly detects and strips these placeholder segments, ensuring smoother playback.
- **Empty Playlist Black Screen** - Fixed a critical issue where stripping ALL ad segments would create an empty playlist, causing the player to crash with a black screen. Now keeps at least one segment when all would otherwise be stripped, preventing player crashes while still blocking ads.

## [4.1.4] - 2025-12-18

### Fixed
- **Dead Code Check** - Fixed bug in `processor.js` where `IsUsingModifiedM3U8` was checked after being reset to `false`, making the check always return false. Now correctly saves the value before reset to determine post-ad player behavior.

### Cleaned
- **Unused Parameter** - Removed unused `_isBackup` parameter from `_stripAds()` function in `parser.js`.
- **Header Handling** - Refactored Authorization header in `api.js` to only include when set (avoids undefined values in headers).
- **Popup Detection Logging** - Changed popup detection log from `warning` to `info` so it doesn't appear in DevTools Errors panel.

## [4.1.3] - 2025-12-18

### Fixed
- **Dynamic GraphQL Hash** - Implemented dynamic capture of the `PlaybackAccessToken` GraphQL hash. The extension now intercepts the hash from legitimate player requests instead of using a hardcoded value, ensuring continued functionality even when Twitch rotates their API security hashes.

## [4.1.2] - 2025-12-18

### Fixed

- **Global Namespace Pollution** - Refactored internal state management to namespace all global variables (e.g., `AdSignifier`, `ClientID`) under `window.__TTVAB_STATE__`, preventing potential conflicts with Twitch's own code or other extensions.
- **Storage Reliability** - Added retry logic (3 attempts with exponential backoff) to `StorageQueue`, preventing statistic updates (ads blocked count) from being lost during high-load periods or storage quota limits.
- **Memory Leak Prevention** - Fixed a race condition in `AdSegmentCache` pruning where cache cleanup relied on stream info objects that could be recreated. Pruning now uses a robust global throttle to ensure old ad segments are reliably cleared from memory every minute.

## [4.1.1] - 2025-12-18

### Fixed
- **RELOAD_AFTER_AD Bug** - Fixed bug where `RELOAD_AFTER_AD: false` was being ignored due to `|| true` fallback logic. Changed to nullish coalescing (`??`) so the `false` value is now properly respected. Player reload after ads is now correctly disabled, preventing reload loops.

### Changed
- **Crash Refresh Delay** - Reduced auto-refresh delay after crash detection from 1000ms to 500ms for faster recovery.
- **Donation Reminder Interval** - Increased donation reminder interval from 24 hours to 72 hours for less intrusive experience.
- **Welcome Toast Duration** - Reduced first-install welcome toast auto-hide from 20 seconds to 10 seconds.

### Cleaned
- **Comment Cleanup** - Removed redundant instructional comments from module files.

## [4.1.0] - 2025-12-16

### Fixed
- **Cross-Tab Interference** - Auto-refresh on player crash now only triggers when the Twitch tab is in the foreground. Previously, refreshing a background Twitch tab would cause browser resource contention that could crash video players in other tabs (e.g., Viu, Netflix). Now, if the tab is hidden when a crash is detected, the refresh is queued and will occur when the user switches back to the Twitch tab."

## [4.0.9] - 2025-12-15

### Fixed
- **Player Reload Loop** - Disabled automatic player reload after ads end (`RELOAD_AFTER_AD: false`). This was causing a continuous reload cycle where the player would constantly refresh during ad breaks, disrupting viewing experience.

### Cleaned
- **Dead Code Removal** - Removed unused `liveSegmentCount` variable from `parser.js` (was counted but never read).

### Changed
- **Backup Player Priority** - Reordered backup player types to `['embed', 'autoplay', 'site', 'picture-by-picture-CACHED']` with `embed` as the primary backup. The `embed` player type typically has fewer ads and doesn't trigger reload loops.
- **Fallback/Force Type** - Changed from `site` to `embed` for more stable ad-free streams.
- **Reload Cooldown** - Increased minimum time between player reloads from 1500ms to 2000ms for stability.

## [4.0.8] - 2025-12-13

### Cleaned
- **Dead Code Removal** - Removed 7 unused code items to reduce bundle size by ~2.6 KB:
  - Removed `GQL_URL`, `AVG_AD_DURATION`, `ACHIEVEMENTS` from `constants.js` (duplicates exist locally in popup.js/bridge.js)
  - Removed unused `_gqlReq()` function from `api.js` (was injected but never called)
  - Removed `isLive` from `_PlayerBufferState` in `player.js` (set but never read)
  - Removed `currentChannel` and `isActivelyStripping` from `_S` state in `state.js` (set but never read)

### Fixed
- **Version Sync** - Fixed popup.html showing outdated version (was stuck at v4.0.3)

## [4.0.7] - 2025-12-13

### Fixed
- **Pre-emptive Prefetch Blocking** - Now removes `#EXT-X-TWITCH-PREFETCH` entries FIRST before any stripping. This prevents the player from pre-downloading ad segments before they can be removed.
- **Aggressive Ad Stripping** - Now strips ads even when ALL segments are ads (previously would let them play to avoid empty playlists). Brief buffering is preferable to showing ads.
- **Ad Slot Consumption** - Pre-fetches ad `.ts` segments to "consume" ad slots on Twitch's side, making backup streams cleaner and less likely to contain ads.

## [4.0.6] - 2025-12-13

### Added
- **HEVC/4K Stream Support** - Added codec swapping logic for streams with HEVC (4K) qualities. When ads are detected on HEVC streams, the extension now generates a fallback M3U8 that swaps HEVC resolutions to their closest AVC equivalents, preventing Chrome playback errors during ad transitions.

## [4.0.5] - 2025-12-13

### Improved
- **Instant Popup Blocking** - Reduced popup detection delay from 500ms to near-instant (~50ms). Added immediate scan on DOM mutation plus a fast 50ms follow-up scan, ensuring anti-adblock popups are hidden before they become visible to users.

## [4.0.4] - 2025-12-13

### Fixed
- **Chat Sidebar Destruction** - Fixed popup blocker accidentally hiding the Twitch chat sidebar. The issue was overly broad class name matching (`'Layer'`, `'Overlay'`) that would match chat layout components. Added safelist for chat/player/column elements and made popup class detection more specific.

## [4.0.3] - 2025-12-12

### Fixed
- **Popup Counter Loop** - Fixed a bug where the anti-adblock detection would repeatedly find and count the same hidden elements, causing the "Popups Blocked" counter to inflate massively. Detection now correctly ignores already-processed or hidden elements.

## [4.0.2] - 2025-12-12

### Fixed
- **Persistent Anti-Adblock** - Further refined popup detection to handle non-button elements (divs, spans, headers) that contain ad-blocking warnings. Added proactive CSS injection for known ad-banner data attributes (`data-test-selector="ad-banner"`).

## [4.0.1] - 2025-12-12

### Fixed
- **Popup Blocker Logic** - Fixed brittle anti-adblock detection that relied on exact button text ("Allow Twitch Ads"). Now uses robust fuzzy text matching with expanded keywords (commercials, whitelist, disable extension, etc.) and enhanced CSS selectors to catch more variations of the popup.

## [4.0.0] - 2025-12-12

### Fixed
- **CRITICAL: Removed Forced 480p** - Backup streams now use the same resolution as your main stream instead of being forced to 480p. This prevents resolution-related ad targeting issues and maintains video quality during ad transitions.

### Changed
- `_findBackupStream` now accepts and uses the current resolution info
- Version bump to 4.0.0

## [3.9.9] - 2025-12-12

### Added
- **Player Buffering Fix** - Monitors player state and automatically triggers pause/play when the player gets stuck buffering, preventing infinite spinners
- **Visibility State Protection** - Prevents Twitch from pausing the player when switching tabs during ad breaks, ensuring continuous stream playback
- **LocalStorage Preservation** - Preserves video quality, volume, and low latency settings when the player reloads during ad transitions
- **React Player Integration** - Direct integration with Twitch's React player components for more reliable player control

### Fixed
- **Smoother Ad Transitions** - Player now automatically reloads or pause/plays after ads end for cleaner stream recovery
- **Player State Tracking** - Added active stripping state tracking for better UI feedback

### Changed
- Enhanced player module architecture with modular React-based controls
- Version bump to 3.9.9

## [3.9.8] - 2025-12-12

### Added
- **Force 480p Backup Streams** - When ads are detected, backup streams now specifically request 480p resolution. Lower resolutions often don't have embedded ads, giving users a better chance of ad-free viewing.
- **Aggressive Ad Stripping** - In fallback mode, now uses `stripAll=true` to remove ALL non-live segments, ensuring no ads slip through.

### Fixed
- **Stream Freeze During Ads** - Fixed overly aggressive ad stripping that was removing ALL segments (including live content) when no ad signifier was present. Now uses two-pass logic to count live vs ad segments before deciding whether to strip.
- **Build System** - Added missing `_findBackupStream` to minification map, fixing runtime errors in worker injection.
- **Version Sync** - Fixed version mismatch in popup.html (was showing v3.8.3, now correctly shows v3.9.8).
- **ESLint Warnings** - Fixed `let` â†’ `const` in api.js and renamed unused parameter in parser.js.

## [3.9.7] - 2025-12-12

### Fixed
- **CRITICAL: Ad Segment Detection** - Fixed ad detection that was not working for fallback streams. The v3.9.5 fix was looking for wrong markers (`stitched-ad` in URLs) instead of using the correct heuristic. Ad segments are identified by NOT having `,live` in the `#EXTINF` line - now using this proven method for all streams.

## [3.9.6] - 2025-12-12

### Fixed
- **CRITICAL: Break infinite backup stream loop** - When using a fallback stream with ad stripping, subsequent playlist refreshes no longer restart the backup search. Added `IsUsingFallbackStream` flag to track fallback mode and skip redundant searches, preventing CPU-intensive infinite loops.

### Changed
- `_findBackupStream` now returns `isFallback` flag to indicate when a fallback (ad-laden) stream is being used
- `_processM3U8` enters fallback mode and stays there until ads end, avoiding repeated backup searches

## [3.9.5] - 2025-12-12

### Fixed
- **CRITICAL: Ad Stripping on Fallback Streams** - Fixed bug where ad segments were NOT being stripped from fallback/backup streams. The previous logic `!line.includes(',live') && !isBackup` always returned `false` when `isBackup=true`, completely disabling ad removal. Now backup streams use explicit ad marker detection (`stitched-ad`, `/adsquared/`, `AdSignifier`) instead of the heuristic check.

## [3.9.3] - 2025-12-12

### Fixed
- **Backup Stream Playback (Major Fix)** - Removed legacy "force player type" logic that was incorrectly overriding `autoplay` requests with `site`. This prevented the `android` platform parameter from being sent, causing all backup stream tokens to fail. `autoplay` will now correctly request `platform: 'android'`.

## [3.9.2] - 2025-12-12

### Fixed
- **Backup Stream Playback** - Fixed persistent "No signature found" error by updating the internal GraphQL hash for `PlaybackAccessToken` and ensuring the correct `platform` parameter is sent (e.g., 'android' for autoplay). This restores ad-free backup stream functionality.

## [3.9.1] - 2025-12-12

### Fixed
- **Critical Fix** - Fixed `realFetch` reference error in token generation that caused backup streams to fail.

## [3.9.0] - 2025-12-12

### Added
- **Backup Player Types** - Added `thunderdome` to backup player types.
- **Improved Priority** - Reordered backup priority to try `480p` and `thunderdome` earlier, before retrying `site` or `autoplay`.
- **timeout protection** - Added timeout to token fetching to prevent hangs on slow network/responses.

### Fixed
- **Hang Fix** - Fixed potential hang in backup stream search by adding timeouts to internal API calls.

## [3.8.9] - 2025-12-12

### Added
- **New Backup Option** - Added `480p` as a backup player type. This provides a robust fallback for situations where `embed` tokens fail due to missing integrity headers or other network issues. `480p` streams are often ad-free and reliable.

### Fixed
- **Backup Token Handling** - Excluded `480p` from forced `site` token generation to ensure it receives its specific, valid token.

The format is based on [Keep a Changelog](https://keepachangelog.com), and this project adheres to [Semantic Versioning](https://semver.org).

## [3.8.8] - 2025-12-12

### Fixed
- **Backup Stream Availability** - Fixed an issue where all backup streams were failing to load or containing ads. This was caused by an aggressive token forcing logic that was causing `embed` and other backup types to fetch the same ad-filled `site` stream. `embed` requests are now correctly exempted from this forcing.

## [3.8.7] - 2025-12-12

### Fixed
- **Ad Blocking Logic** - Fixed a critical bug where the extension would accept a backup stream even if it contained ads, specifically when the stream was "cached" or was the last available option. The extension now enforces a strict ad-free check for all backup streams.

## [3.8.6] - 2025-12-12

### Fixed
- **Backup Stream Availability** - Generalized the token retrieval fix to apply to all backup player types. This resolves issues where `autoplay` and `picture-by-picture` streams were failing to load due to missing token signatures.
- **Stability Improvement** - Fixed a potential reference error in the stream processing logic (removed leftover legacy fallback code).

## [3.8.5] - 2025-12-12

### Fixed
- **Authentication Token Strategy** - Updated method for retrieving stream access tokens to prevent ad-blocked `embed` tokens from being served. The extension now intelligently requests `site` type tokens while maintaining `embed` compatibility for the player, ensuring consistent ad-free stream access.

## [3.8.4] - 2025-12-12

### Removed
- **Emergency Fallback** - Removed the fallback mechanism that would allow streams with ads to play if no ad-free backup was found. This ensures users do not see ads, even if it results in a black screen (user preference).

## [3.8.3] - 2025-12-12

### Fixed
- **Emergency Fallback** - Implemented a safety mechanism to use *any* working stream (even one with ads) as a last resort if all ad-free backup candidates fail. This prevents the "black screen of death" when Twitch blocks specific players like `embed`.
- **Diagnostics** - Added specific logging for "missing signature" errors in authentication tokens, helping identify if Twitch has changed their API response format for certain player types.

## [3.8.2] - 2025-12-12

### Changed
- **Stream Processing** - Added filtering to exclude "processing" streams (which return 403/Forbidden) from backup selection, fixing an issue where the extension would try to play a non-existent stream.
- **Diagnostics** - Added full trace logging to the backup stream selection logic to help pinpoint exactly why streams are being rejected/failed.

## [3.8.1] - 2025-12-12

### Changed
- **Debug Logging** - Added detailed logging for backup stream fetching failures (Token/Usher/Stream) to diagnose persistent black screen issues. Warning logs will now clearly indicate if the `Client-Integrity` header is missing or if specific fetch stages fail.

## [3.8.0] - 2025-12-12

### Fixed
- **Integrity Token Capture** - Completely overhauled the network interception hook to support the `Request` object interface used by modern Twitch players. This is a critical fix for the "Integrity Check Failed" errors that were blocking backup stream playback.

## [3.7.9] - 2025-12-12

### Fixed
- **Integrity Check Failure** - Fixed a critical issue where the `Client-Integrity` token was not being captured correctly because the Fetch API was using `Headers` objects instead of plain objects. This prevented backup streams from loading.

## [3.7.8] - 2025-12-12

### Fixed
- **Backup Stream Playback** - Fixed a critical issue where valid content segments in the backup stream (480p) were being incorrectly identified as ads and stripped, causing the player to crash or spin indefinitely. The ad-stripping logic is now safer for backup streams.

## [3.7.7] - 2025-12-12

### Removed
- **Proxy Backup System** - Removed the external proxy backup (TTV LOL) integration entirely. The instability of the proxy service and complexity of CORS bypasses were causing more issues than they solved. The extension now relies solely on robust internal player type switching (`embed`, `site`, `autoplay`) which is more stable.

## [3.7.6] - 2025-12-12

### Fixed
- **Proxy Fetch Hardening** - Updated the background service worker to use robust fetch options (`no-referrer`, `omit credentials`, `no-store`) when communicating with the proxy. This reduces the likelihood of `Failed to fetch` errors caused by browser privacy settings or strict server firewalls.

## [3.7.5] - 2025-12-12

### Fixed
- **Proxy URL Malformation** - Fixed a critical typo in the proxy URL construction where the query string separator `?` was incorrectly encoded as `%3F`, causing 404 errors from the proxy server. This, combined with the earlier CORS fixes, should fully resolve the proxy backup functionality.

## [3.7.4] - 2025-12-12

### Fixed
- **Debug Logging** - Added detailed logging for the proxy fetch relay chain (`Worker` -> `Main` -> `Bridge` -> `Background`) to help diagnose why some users are still experiencing issues with the proxy backup. Check the developer console for `[TTV AB] Proxy:` logs.

## [3.7.3] - 2025-12-12

### Fixed
- **Proxy Redirect Handling** - Added broader host permissions (`<all_urls>`) to the extension manifest. This allows the background service worker to follow redirects from the proxy service to any CDN content server (e.g., `clipr.xyz`) without being blocked by browser CORS policies.

## [3.7.2] - 2025-12-12

### Fixed
- **Proxy Backup CORS Error (Revised)** - Moved proxy fetch logic to a **Background Service Worker**. Manifest V3 content scripts are restricted by the host page's CORS policy, so requests are now delegated to the background worker which has full cross-origin privileges.

## [3.7.1] - 2025-12-12

### Fixed
- **Proxy Backup CORS Error** - Fixed an issue where the new proxy backup strategy was blocked by browser CORS policies. Implemented a secure message relay system (`Worker` -> `Main` -> `Isolated` -> `Fetch`) to route requests through the extension's privileged context, ensuring ad-free streams can be fetched reliably.

## [3.7.0] - 2025-12-12

### Security
- **Hardened Cross-World Communication** - Added strict origin checks (`event.source === window`) to all internal message listeners. This prevents potential interference from iframes or other sources, ensuring that the extension only processes messages from its own trusted contexts.

### Changed
- **Monitor Optimization** - Reduced observer overhead by removing text content monitoring (`characterData`), focusing only on structural changes for crash detection.

## [3.6.9] - 2025-12-12

### Changed
- **Performance Optimization** - Added debouncing to the popup blocker's `MutationObserver`. Previous versions scanned the page on every single DOM update (60fps), which could cause high CPU usage during fast chat or dynamic content updates. Now scans are debounced to run at most twice per second during heavy activity.

## [3.6.8] - 2025-12-12

### Added
- **Feature: External Proxy Backup** - Added a robust backup player type using an obfuscated external proxy source. This serves as a reliable fallback when standard low-latency or local backups fail, ensuring ads are blocked without stalling the player.

## [3.6.7] - 2025-12-12

### Fixed
- **CRITICAL: Infinite Spinner Fix (Strict Mode)** - Fixed an issue where the player would get stuck on an infinite loading spinner during ad breaks if no backup stream was available. The extension now uses a strict "Manifest Splicing" strategy: ad segments are completely removed from the playlist file itself, ensuring the player skips the ad break entirely instead of stalling on empty video segments.

## [3.6.6] - 2025-12-12

### Fixed
- **CRITICAL: Extension Initialization** - Fixed broken handshake between extension and content script. Previously, the extension often failed to restore the "Ads Blocked" counter or apply toggle state changes due to using `document.dispatchEvent` (which cannot cross world boundaries). Switched to `window.postMessage` to ensure reliable communication.

## [3.6.5] - 2025-12-12

### Fixed
- **CRITICAL: Player Crash Fix** - Changed popup blocker to use `display: none` instead of removing elements from the DOM. This fix prevents the Twitch player from crashing (showing a "ï¼Ÿ" error) when a popup is blocked, as removing elements was breaking the player's internal state.

## [3.6.4] - 2025-12-12

### Fixed
- **CRITICAL: Statistics/Achievements** - Fixed achievement unlock notifications not working. Changed `document.dispatchEvent` to `window.postMessage` to correctly cross the ISOLATEDâ†’MAIN world boundary, ensuring users get notified when achievements are unlocked.

## [3.6.3] - 2025-12-12

### Fixed
- **Popup Blocker Compatibility** - Removed CSS `:has()` selectors that caused compatibility issues in some browser contexts
- **Popup Detection** - Improved DOM tree walking (20 levels) with class name pattern matching for Twitch popup elements
- **Counter Debouncing** - Added 1-second debounce to prevent duplicate popup blocked counts

### Improved
- **Popup Detection Speed** - Reduced periodic scan interval from 1s to 500ms
- **MutationObserver** - Now only scans when element nodes are added (faster filtering)
- **Popup Class Detection** - Added checks for ScAttach, Balloon, Layer, Modal, Overlay class patterns

## [3.6.2] - 2025-12-12

### Fixed
- **CRITICAL: Cross-World Communication** - Fixed counter updates not working because `document.dispatchEvent()` doesn't cross MAINâ†’ISOLATED content script worlds. Changed to `window.postMessage()` which correctly crosses the boundary.

### Improved
- **Popup Blocker v2** - Complete rewrite with multi-strategy approach:
  - Strategy 1: CSS injection for instant hiding (works before JS runs)
  - Strategy 2: Button text detection with DOM tree walking (15 levels)
  - Strategy 3: Text pattern matching on overlay elements
  - Faster scanning via `requestAnimationFrame` instead of setTimeout
  - Added z-index detection for popup containers
  - More selector patterns: Balloon, Modal, subscribe buttons

## [3.6.1] - 2025-12-12

### Improved
- **Code Quality Audit** - Comprehensive codebase audit confirming no memory leaks, no race conditions, and Chrome Web Store compliance

### Fixed
- **ESLint Configuration** - Added missing `_findBackupStream` global to suppress false positive error
- **Const Correctness** - Changed `let` to `const` for `playerTypes` in processor.js (never reassigned)
- **Dead Code Cleanup** - Removed unused `newWorker` variable in worker restart logic

## [3.6.0] - 2025-12-12

### Fixed
- **CRITICAL: Cross-World Communication** - Fixed ad/popup counters not updating due to document events not crossing the MAINâ†’ISOLATED content script world boundary. Now uses `window.postMessage()` which correctly crosses worlds.

### Changed
- Consolidated event listeners in bridge.js into single message handler
- Removed emoji from all error log messages

## [3.5.1] - 2025-12-12

### Changed
- **Console Logging** - Removed emoji from console logs, now uses clean styled "[TTV AB]" prefix consistently

## [3.5.0] - 2025-12-12

### Changed
- **MAJOR: Popup Detection Rewrite** - Complete rewrite of anti-adblock popup detection:
  - Now scans ALL buttons on page for "Allow Twitch Ads" / "Try Turbo" exact text
  - Walks up DOM tree to find popup container using computed styles (position, background)
  - Fallback strategy using text pattern matching on overlay elements
  - Faster scanning: 300ms throttle, 2 second periodic check
  - Debug logging shows exact button text found

## [3.4.9] - 2025-12-12

### Fixed
- **Popup Detection Timing** - Fixed popup blocker starting before DOM is ready by adding proper DOM-ready wait
- **Popup Detection Coverage** - Added 4 new selectors and 4 new text patterns to catch more Twitch popup variants
- **Popup Detection Speed** - Reduced scan throttle from 1s to 500ms for faster popup removal

### Added
- **Debug Logging** - Added visible console.log statements to confirm extension loads

## [3.4.8] - 2025-12-12

### Added
- **Counter Diagnostics** - Added comprehensive error logging when the ads blocked counter fails to update, including storage read/write errors, count verification, and a periodic health check that alerts if ad block events are being lost

## [3.4.7] - 2025-12-12

### Added
- **Worker Auto-Restart** - When a worker crashes or encounters an error, the extension now automatically attempts to restart it up to 3 times with exponential backoff (1s, 2s, 4s delays), improving reliability without requiring a page refresh

## [3.4.6] - 2025-12-12

### Cleaned
- **Dead Code Removal** - Removed unused `_removePopup` function, duplicate comments, unused function parameters, and trailing whitespace

## [3.4.5] - 2025-12-12

### Fixed
- **Critical Worker Crash** - Fixed missing `_findBackupStream` function injection into worker, which caused ad blocking to fail completely
- **Critical Worker Crash** - Removed invalid `_pruneStreamInfos` reference that pointed to a function inside another function's scope, causing ReferenceError on worker creation

## [3.4.4] - 2025-12-12

### Improved
- **DOM Performance** - Optimized anti-adblock button scanning to only target popup containers, avoiding checks on hundreds of unrelated buttons (like chat interactions)

## [3.4.3] - 2025-12-11

### Fixed
- **Worker Crash** - Fixed a crash in the worker thread caused by a missing function definition (`_pruneStreamInfos`) after the previous memory optimization

### Improved
- **Background Efficiency** - Throttled the player crash monitor to pause completely when the tab is hidden, further reducing CPU usage

## [3.4.2] - 2025-12-11

### Improved
- **Memory Usage** - Removed duplicate code and optimized the intercepted worker payload, reducing the memory footprint for every Twitch player instance spawned

## [3.4.1] - 2025-12-11

### Improved
- **CPU Optimization** - Pre-compiled regex patterns for anti-adblock detection and added valid-word pre-checks, reducing processing time during DOM scans by ~40%

## [3.4.0] - 2025-12-11

### Fixed
- **Critical Crash** - Fixed a `ReferenceError` that would cause the player to crash immediately upon detecting an ad

### Improved
- **Smart Network Use** - Implemented "sticky" backup stream selection: the extension now remembers which backup player worked last and tries it first, saving 1-2 network requests every 2 seconds during ad breaks

## [3.3.9] - 2025-12-11

### Improved
- **Battery Life** - Reduced background popup scanning frequency from 2s to 10s and disabled it completely (5s check) when the tab is hidden

## [3.3.8] - 2025-12-11

### Improved
- **Network Efficiency** - Removed wasteful pre-fetching of ad video segments, saving bandwidth and battery
- **Rendering Performance** - Removed expensive full-page text scanning from crash monitor, preventing layout thrashing and false positives from chat messages

## [3.3.7] - 2025-12-11

### Improved
- **CPU Usage** - Optimized anti-adblock detection to use a throttled scanner instead of inspecting every DOM element, eliminating lag during high-volume chat activity

## [3.3.6] - 2025-12-11

### Improved
- **Laptop Performance** - Throttled the crash detection system to run at most once every 2 seconds, significantly reducing CPU usage during heavy chat activity

## [3.3.5] - 2025-12-11

### Improved
- **Codebase Safety** - Added robust error handling to API requests and crash monitoring to prevent silent failures during network issues or edge-case DOM states

## [3.3.4] - 2025-12-11

### Improved
- **Counter Reliability** - Decoupled ad block counting from the logging system to ensure adds are counted even if the console or logging fails

## [3.3.3] - 2025-12-11

### Fixed
- **Counter Race Condition** - Implemented a `StorageQueue` system in the bridge script to serialize ad/popup block events, ensuring no counts are lost when multiple events occur simultaneously across tabs

## [3.3.2] - 2025-12-11

### Fixed
- **Startup Sync** - Implemented a handshake mechanism between content script and bridge to prevent race conditions where stats would show as 0 on heavy browser restarts

## [3.3.1] - 2025-12-11

### Performance
- **Cache Optimization** - Throttled `AdSegmentCache` pruning to run once per minute instead of on every segment, reducing CPU usage

### Refactor
- **Code Cleanup** - Extracted backup stream finding logic into a dedicated helper function in `processor.js` for better maintainability

## [3.3.0] - 2025-12-11

### Fixed
- **Worker-Main Event Relay** - Fixed `ttvab-ad-blocked` event using `window` instead of `document` in worker message handler, ensuring ads blocked inside workers are correctly counted

## [3.2.9] - 2025-12-11

### Improved
- **Logger Robustness** - Improved console logging to safely handle non-string objects and utilize browser's native error/warning levels for better DevTools filtering

## [3.2.8] - 2025-12-11

### Fixed
- **Critical Performance Issue** - Optimized crash detection to prevent UI stutter/lag during high-activity chat (removed expensive body text checks during mutations)
- **Cross-Context Communication** - Fixed "Ads Blocked" counter not updating by switching from window to document events for Main/Isolated world communication
- **Metadata Consistency** - Added missing version fields to package.json


## [3.2.7] - 2025-12-11

### Added
- **Language Selector** - Choose from 11 languages in popup footer (EN, ES, FR, DE, PT, IT, JA, KO, ZH-CN, ZH-TW, RU)
- Dynamic UI translation with instant language switching

## [3.2.6] - 2025-12-11

### Fixed
- **Multi-tab counter sync** - Counters now use atomic increment instead of overwriting, preventing count loss when multiple tabs block ads simultaneously

## [3.2.5] - 2025-12-11

### Fixed
- **Worker validation logic** - Fixed `_isValid` function using OR instead of AND, could allow invalid workers to bypass validation

## [3.2.4] - 2025-12-11

### Improved
- **Toggle syncs across all tabs** - Toggling ad blocking now updates ALL open Twitch tabs, not just the active one

## [3.2.3] - 2025-12-11

### Fixed
- **Per-channel statistics not working** - Channel name was not being forwarded from worker to bridge, causing all channel stats to be null

## [3.2.2] - 2025-12-11

### Security
- **XSS protection** - Added HTML escaping for channel names in popup to prevent potential injection attacks

## [3.2.1] - 2025-12-11

### Fixed
- **Race condition in stats storage** - Consolidated three separate storage update functions into single atomic operation to prevent data overwrites during rapid ad blocking
- **Unbounded channel storage** - Added pruning to keep only top 100 channels by ad count, preventing storage bloat over time

### Changed
- Moved achievement definitions to module-level constant in bridge.js
- Achievement notifications now dispatch after storage write completes

## [3.2.0] - 2025-12-11

### Added
- **Statistics Dashboard** - Collapsible panel showing detailed ad blocking metrics
- **Time Saved Display** - Estimated time saved from blocked ads (calculated at ~22s per ad)
- **Weekly Chart** - Visual CSS sparkline showing last 7 days of blocking activity
- **Top Channels** - Per-channel breakdown displaying top 5 channels by ads blocked
- **12 Achievement Badges** - Gamification system with unlockable badges:
  - Ad Slayer, Blocker, Guardian, Sentinel, Legend, Mythic (ad milestones)
  - Popup Crusher, Popup Destroyer (popup milestones)
  - Hour Saver, Time Master (time saved milestones)
  - Explorer, Adventurer (channel diversity milestones)
- Per-channel ad tracking with persistent storage
- Daily stats tracking with automatic 30-day pruning
- Achievements progress counter and "Next achievement" hint

### Changed
- Popup UI expanded with new statistics section
- Bridge script enhanced for statistics sync

## [3.1.0] - 2025-12-11

### Added
- **Anti-adblock popup blocker** - Automatically detects and removes Twitch's "Support [streamer] by disabling ad block" popups
- New "Popups Blocked" counter in popup UI to track removed popups
- MutationObserver for real-time popup detection
- Periodic scan as backup for dynamically modified popups
- Console log "Anti-adblocking enabled" on initialization

### Fixed
- Race condition for popups blocked counter (stored count now restored on init)

### Performance
- Use `requestIdleCallback` for anti-adblock popup scan (lighter CPU usage during idle time)
- Reduce crash detection auto-refresh delay from 1.5s to 1s for faster recovery

## [3.0.9] - 2025-12-10

### Fixed
- **Ad detection logs now appear in main DevTools console** (previously hidden in Worker console)
- Worker now sends AdDetected/AdEnded events to main window for proper logging
- Version mismatch in popup UI (was showing v3.0.8)
- Duplicate `@keyframes shimmer` animation definition in popup CSS
- Duplicate JSDoc comment block for `updateStatus` function
- Global `window.statusTimeout` pollution replaced with closure variable
- Empty catch blocks now have proper error handling/comments
- Build header comment placeholder text corrected

## [3.0.8] - 2025-12-10

### Added
- Detailed code documentation header for Chrome Web Store review process
- Source code architecture breakdown with module descriptions
- Safety clarifications and GitHub source links for transparency

### Fixed
- Version display in popup now correctly shows v3.0.8 (was showing v3.0.7)
- Removed duplicate `_getWasmJs` function injection in worker code
- Fixed potential memory leak: old workers are now properly terminated when cleanup occurs

## [3.0.7] - 2025-12-10

### Fixed
- Ads blocked counter now properly persists across sessions
- Counter no longer resets to 0 on page refresh or navigation
- Bridge script now sends stored count to content script on load
- Toggle Enable/Disable now works instantly for active streams without refresh
- Fixed memory leak in stream info cache during long viewing sessions

### Added
- New `ttvab-init-count` event for counter synchronization
- `_$ic()` function to initialize counter from stored value
- Console log showing restored counter value on page load
- Cyberpunk "Glitch" animation effect for extension title
- Metallic shimmer animation for version text
- Elastic bounce animation for toggle switch
- Dynamic status message when toggling protection
- Pulsing green light indicator for active status
- Added animated description text to popup UI

## [3.0.6] - 2025-12-10

### Changed
- Complete codebase refactoring with clean architecture
- Added JSDoc documentation to all functions
- Optimized loops and variable caching for performance
- Improved module organization with clear separation
- Build script now minifies and obfuscates output
- Reduced bundle size from 37KB to 32KB

### Performance
- Cached regex patterns for faster parsing
- Used Object.create(null) for faster lookups
- Optimized M3U8 parsing with early returns
- Batched worker message updates

## [3.0.5] - 2025-12-10

### Changed
- Use i18n localization for manifest name/description
- Add _locales/en/messages.json for extension metadata
- Manifest now uses __MSG_extName__ and __MSG_extDesc__ placeholders

### Fixed
- Ad counter now works correctly in worker context

## [3.0.4] - 2025-12-10

### Added
- Real-time "Ads Blocked" counter in popup
- Subtle pulse animation when counter updates
- Counter persists across sessions via chrome.storage
- Bridge script sync for popup-to-content communication

## [3.0.3] - 2025-12-10

### Changed
- Refactored codebase into modular architecture (11 modules)
- Added build.js script to compile modules into content.js
- Minified internal variable/function names for obfuscation
- Updated documentation with new file structure

## [3.0.2] - 2025-12-10

### Added
- Auto-refresh on player crash detection (Error #2000, #1000, etc.)
- MutationObserver for real-time crash detection
- Visual notification banner when crash is detected
- 1.5 second delay before automatic page refresh

## [3.0.1] - 2025-12-10

### Added
- Instant toggle without page refresh
- Bridge script for popup-to-content communication
- Colored console logs with styled prefix badge

### Fixed
- RegExp global flag error in `replaceAll()` calls
- Null check for access token to prevent runtime errors

## [3.0.0] - 2025-12-10

### Added
- Initial public release
- Ad blocking for Twitch.tv live streams
- Blocks preroll and midroll ads
- Worker hooking for M3U8 playlist interception
- Backup stream fetching when ads are detected
- Popup UI with enable/disable toggle
- Pulsating heart donate button (PayPal)
- Manifest V3 support for Chromium browsers

### Features
- No purple screen errors
- Works with all stream qualities
- Lightweight and fast
- Simple toggle functionality

## Future Plans
- Firefox support
- Additional ad blocking methods
- Statistics tracking

