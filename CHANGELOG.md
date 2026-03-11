# Changelog

All notable changes to TTV AB will be documented in this file.

## [4.2.6] - 2026-03-11

### Fixed
- **Popup Startup Guards** - The popup now exits safely with a clear console error if required UI elements are missing instead of throwing null-access errors.
- **Achievement Translation Fallbacks** - Popup achievement rendering now falls back safely when a locale entry is missing or malformed.

### Changed
- **Popup Build Validation** - Build-time validation now checks that all popup element IDs required by `popup.js` still exist in `popup.html`.
- **Release Metadata Sync** - Synchronized version references across package, manifest, constants, README, changelog, and generated build output for 4.2.6.

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

<!-- test push noop -->
