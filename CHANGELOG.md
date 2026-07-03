# Changelog

All notable changes to TTV AB will be documented in this file.

## [11.0.3] - 2026-07-04

### Fixed
- Backup streams no longer jump to the maximum resolution in the rare moment the extension has no quality information yet, such as an ad on the very first playlist. Slamming straight to the highest quality could stall playback on slower connections; the backup now starts at a safe resolution (at least 360p) and climbs to your usual quality, which is also gentler on limited bandwidth.
- During fast channel switches, a stream could briefly be matched to the wrong channel while the page was still updating. The extension now favors the most recently active stream in that moment, reducing the chance of a mismatch.

## [11.0.0] - 2026-07-03

### Changed
- During ad breaks, a freshly found higher-quality ad-free stream must now stay clean through a second check (about 2 seconds) before the player switches to it. Twitch often injects ads into brand-new streams a few seconds after they start, which made the extension hop between several different streams during long ad breaks; each hop was a cut in the video that could leave it stuck. You keep watching the current clean stream during the check, and any new stream that turns out to carry ads is discarded before it ever reaches the screen.

## [10.0.9] - 2026-07-03

### Fixed
- Frozen video with running audio during ad breaks now recovers automatically. When the video decoder got stuck at a stream splice while plenty of data was already buffered, the built-in freeze recovery never engaged: it required the buffer to be empty, and the stuck decoder still crept the clock forward just enough to reset detection every few seconds. Recovery now engages within about 5 seconds whenever playback stops moving, applies the same pause/play fix that worked manually, and reloads the player if nudging does not help.
- Stopped switching backup streams when stream data is healthy and only the player is stuck. Those switches could not fix a stuck decoder, wasted re-search attempts, and each one added another splice that made recovery harder. Backup switching still happens normally when the stream itself stops delivering data.

## [10.0.8] - 2026-07-02

### Fixed
- Background tabs now detect and recover from Twitch video worker crashes. Crash checks were previously paused while a tab was hidden, so a stream that died in the background stayed frozen, and switching back still took about half a minute to recover. Hidden tabs now keep collecting evidence with stricter thresholds, recover on their own when playback is truly dead, and recover within seconds after you switch back.

## [10.0.7] - 2026-07-02

### Fixed
- Fixed frozen video with running audio during ad breaks on 1440p streams. The ad-free backup stream could be served in a video format (HEVC) the player was not set up to decode; backup selection now sticks to formats the player can actually play, stepping down to 1080p when needed.

## [10.0.6] - 2026-07-02

### Fixed
- Fixed a short playback freeze a few seconds into ad breaks. While TTV AB quietly checked other Twitch player types for a higher-quality ad-free stream, the active backup stream stopped receiving updates and the player could run out of buffer. That check now runs in the background and the backup stream keeps refreshing the whole time.
- The same freeze could also appear shortly after an ad ended while the extension was still holding the backup stream; background checking fixes that case too.

## [10.0.5] - 2026-06-29

### Fixed
- Long sessions recover cleanly when Twitch's video worker crashes, preventing the player from getting stuck on the loading spinner after an ad hold.

## [10.0.4] - 2026-06-28

### Fixed
- Long ad breaks can now climb from a healthy low-res backup toward the user's sustained native quality sooner, while still keeping ad-marked native playlists blocked.

## [10.0.3] - 2026-06-28

### Fixed
- During long ad breaks the video could stutter, get stuck at 360p, or freeze because the extension kept switching backup streams even when playback was healthy but running at a low live-edge buffer. The backup now holds steady while playback keeps advancing and only switches when it actually stalls.

## [10.0.2] - 2026-06-26

### Fixed
- Long ad recoveries now force the player back onto native playback after the backup hold finishes, preventing frozen video with live audio.

## [10.0.1] - 2026-06-26

### Fixed
- Low Quality Fallback now starts from the quick clean backup as soon as an ad break begins, reducing black/loading stalls on stubborn ad pods.

## [10.0.0] - 2026-06-26

### Fixed
- Stale Twitch media elements stay muted after ad recovery, preventing old audio from mixing with the restored live stream.

## [9.9.9] - 2026-06-20

### Changed
- "Low Quality Fallback" toggle now defaults to **enabled**. Previously off by default, it now ships enabled so every user gets faster ad recovery out of the box — the extension starts on a quick 360p stream during ads and climbs back to native quality automatically. Existing users who never touched the toggle will see it enabled on update; anyone who explicitly disabled it keeps their preference.
- Info modal text for "Low Quality Fallback" updated across all 11 locales to reflect the new default and describe actual behavior in both states.

## [9.9.8] - 2026-06-13

### Added
- The channel card now shows a live-status monitor beside the channel name — an animated green heartbeat when the channel is live and a red one when it's offline, checked anonymously from Twitch each time you open the card.

### Changed
- Polished the French, Spanish, and Portuguese popup wording so it reads more naturally.

### Fixed
- Long channel names are no longer cut off in the channel card.
- The channel card's close button stays reliably clickable when moving the cursor over it.

## [9.9.7] - 2026-06-12

### Changed
- Time Saved is now measured instead of estimated: each blocked ad's real duration (declared by Twitch in the playlist) is recorded through the same crash-safe pipeline as the ads counter, with per-channel attribution. Existing totals keep the historical 22-second estimate per break and blend with measured values from now on, so the stat only gets more accurate; the time-based achievements use the same blended total.

### Fixed
- Channels you only watched (no ads blocked yet) no longer appear in Top Channels or inflate the channel-rank totals; their watch time still counts and surfaces once their first ad is blocked.

## [9.9.6] - 2026-06-12

### Added
- The channel card now shows the channel's real profile photo, fetched anonymously from Twitch's own API and cached locally for a day; only Twitch CDN images are ever displayed, and the gradient monogram remains as the instant fallback when offline or while loading.
- An animated hint above the Top Channels list points out that channel rows are clickable.

## [9.9.5] - 2026-06-12

### Added
- Channels in the Top Channels list are now clickable and open an animated channel card with per-channel stats: ads blocked, real watch time, estimated time saved, ad breaks survived, share of all blocks, blocking-since and last-ad dates, plus a Visit Channel button.
- Per-channel watch-time tracking: time only counts while the tab is visible (or the video is in picture-in-picture) and the player is actually playing, accumulates locally, and persists through the same crash-safe pipeline as the ads counter. Existing stats migrate automatically.

## [9.9.4] - 2026-06-12

### Added
- The "Report a bug" button now offers to save a TTV AB log file before opening GitHub: it gathers the extension's own console lines (page and worker) from your open Twitch tabs into a timestamped text file via the browser's standard download. Everything stays local — nothing is uploaded — and the dialog is translated in all 11 supported languages.

## [9.9.3] - 2026-06-12

### Added
- The toolbar icon now shows a red badge with your total ads-blocked count, compacted to fit (1,500 shows as 1.5K, 1,000,000 as 1M, and so on) and updating live as ads are blocked.

## [9.9.2] - 2026-06-12

### Changed
- Hot-path housekeeping got cheaper: disabled debug log calls no longer pay message formatting, repeated playlist-URL alias parsing is memoized per poll, the player's quality preference is re-read from storage at most every five seconds instead of every monitor tick, and the toast icon ships once instead of twice for a slightly smaller bundle.

## [9.9.1] - 2026-06-12

### Changed
- The backup stream search now starts the instant an ad break is detected, overlapping the brief clean-native bridge window instead of waiting for it to expire, and the bridge hands off as soon as a clean backup is ready. This trims roughly a second off the switch to the backup stream on typical breaks — and more on breaks where every source variant is ad-marked — with no extra requests and no change to live-edge latency.

## [9.9.0] - 2026-06-12

### Fixed
- Channels whose login contains the ad signifier (for example "stitched") no longer have their master playlist swallowed by the ad-segment interception; playlist URLs are now excluded from the explicit ad-segment predicate while segment blocking is unchanged.
- Disabling and re-enabling the extension with a Twitch tab open now reconnects that tab automatically: the content script announces itself once its state is ready and the page re-broadcasts its session token for a stale port, so counters and popup toggles no longer go silently dead until a reload.
- Landing directly on a clip link no longer leaves the extension inert for the whole tab session; a lightweight route watcher initializes the extension as soon as the SPA leaves the clip page, reloading the player once if Twitch already mounted it.
- Exhausted playback-token fetches now return a real network-error response instead of throwing from the Response constructor in real browsers, so callers log them as token failures instead of misattributed backup or probe errors.
- Firefox: a failed fetch of Twitch's original worker source now fails loudly during bootstrap and routes into crash recovery, instead of leaving a zombie worker that answers heartbeats with no video pipeline inside.
- Worker wrapper validation no longer throws on constructors whose source cannot be read (revoked proxies); they are rejected gracefully.
- Removed a latent double-count trap in the CSAI fast path: its unreachable inner ad-cycle start carried an unguarded ads-blocked increment, and a source-level test now pins the counter to a single guarded call site.

### Changed
- Redesigned the first-run welcome and donation reminder toasts in the popup's retro synthwave style, with proper exit animations, reduced-motion support, and an auto-dismiss progress bar; the reminder now appears on a randomized 7-14 day cadence persisted across restarts.
- Internal cleanup: removed the unreachable in-search fallback promotion, the vestigial -CACHED player-type handling, dead strip bookkeeping, and write-only state keys; seeded two previously undeclared tunables; the LQ emergency-append trace now logs once per ad break instead of every poll.

## [9.8.4] - 2026-06-11

### Fixed
- Picture-in-picture on Chromium now really keeps the in-ad protections running: entering PiP marks a secondary-player handoff, and the automatic-playback suppression idled the buffer monitor for the whole PiP session, so pinned-backup stall rotation, in-ad freeze recovery, the competing-media re-sweep, and post-ad recovery never ran. PiP is now exempt from that suppression; popout handoffs still suppress, and PiP-preserving reload downgrades and user pause intent still apply.
- Recovery reloads no longer convert an auto-quality player into a pinned quality. The preference snapshot overwrote the stored setting with the live quality group — the adaptive rung on auto players — and the post-reload restore persisted it as an explicit choice. The override now only applies when an explicit non-auto quality is already stored.
- The in-ad competing-media mute sweep now skips entirely when no primary player can be identified; previously a lookup race at channel-open prerolls could mute the main player itself for the rest of the break.
- The buffer monitor tick now always reschedules itself through an error-handling wrapper, so one unexpected exception can no longer silently kill every stall, freeze, and mute protection for the rest of the session.
- A fresh post-ad recovery cycle now gives the player time to decode its first frame before the no-frame dead-player rebuild can fire, removing a spurious rebuild attempt right after post-ad reloads.

### Changed
- The in-ad monitor branch validates and reuses the cached player reference instead of walking the React tree every tick during a cache-less ad break, superseded deferred-PiP-reload listeners are removed instead of left neutralized, and secondary-handoff rollback resumes go through the context-guarded recovery scheduler.

## [9.8.3] - 2026-06-11

### Fixed
- The blocked-ad replacement segment now has a single validated source. The worker fetch hook carried its own copy of the empty MP4 segment while a structurally corrupt copy sat unused at module level; the corrupt copy was repaired to the valid bytes, the hook now reads it via the worker bootstrap, and a test validates the MP4 box structure so it cannot drift or truncate again.
- A pause/resume request from a previous stream's worker arriving just after channel navigation is now ignored like every other stale worker event, instead of briefly pause/playing the new channel's player.

### Changed
- New ad-blocking workers no longer embed the page's tracked-worker list in their bootstrap source, the backup-selection handler's function guards now cover every function they call, and a duplicate pong handler was removed.

## [9.8.2] - 2026-06-11

### Fixed
- The internal script-takeover version is now derived from the release version and enforced by the build and tests. Versions 9.7.4 through 9.8.1 shipped with the 9.7.3 takeover version, so a content script injected into an already-open Twitch tab after an extension update refused to take over from the previous version until the tab was manually reloaded.

### Changed
- Removed the unread ReloadAfterAd state field (the RELOAD_AFTER_AD constant itself remains the live kill switch for post-ad reloads) and aligned the state seeding fallback defaults with the tuned constants.

## [9.8.1] - 2026-06-11

### Fixed
- An active picture-in-picture session now counts as a visible tab, so playback monitors run at full cadence, watchdog heartbeats stay enforced, and worker recovery is not deferred while watching in PiP.
- In-ad protections (pinned-backup stall rotation, frozen-playhead recovery, competing-media muting) now also run while the tab is hidden, covering ad breaks in background tabs and Firefox PiP at the slower hidden polling rate.
- Automatic post-ad and recovery reloads no longer close the picture-in-picture window; the reload downgrades to pause/play and the real reload runs once PiP exits, guarded against navigation, staleness, and active ad cycles. Manual reloads and worker-crash recovery still reload immediately.
- A crashed worker with dead playback now recovers while the tab is hidden instead of deferring until focus; healthy background playback is still left uninterrupted.

## [9.8.0] - 2026-06-11

### Fixed
- Switching to another stream during an ad break now restores any media elements that were muted for ad recovery; previously they could stay silenced and tracked until a full page reload.
- Backup stream searches for the same stream now share a single in-flight run instead of racing each other, removing duplicate token requests and a backup-type flap when playlist polls overlapped a slow search.
- Reloading the player after a stitched VOD ad break returns to the saved playhead position instead of relying on Twitch's periodic resume point, which could jump the VOD back or restart it.
- VOD ad breaks now run the same pinned-backup stall detection, frozen-playhead recovery, and competing-media muting that live breaks get; previously every in-ad safety net was skipped on VOD pages.

### Changed
- Worker-injected helpers are hardened against page-only globals (reserved route segments are now serialized into the worker, and the debug-log flag check tolerates worker contexts), and two unused legacy ad-context worker messages were removed.

## [9.7.6] - 2026-06-11

### Fixed
- The quality-group sync no longer treats the live adaptive rung as the user's preference, so an auto-quality player that restarted on its lowest rung moments before an ad break no longer pins the backup to 360p; the sustained-quality tracker drives backup quality unless an explicit player quality is set, and switching back to auto clears a stale explicit choice.
- An ad pod that outlasts the silent backup hold no longer counts a second "ad blocked" on re-entry; the hold exit is recorded as an ad-end moment so the immediate re-detection is treated as a continuation of the same break.

## [9.7.5] - 2026-06-11

### Fixed
- A client-side ad break whose markers lingered could trap the extension into serving a frozen backup snapshot for up to 90 seconds with the purple "commercial break" slate on top; the held backup now keeps refreshing live through the whole bounce window, and a failed refresh rotates to a fresh backup search instead of starving the buffer.
- A playhead frozen at a buffer gap during an ad break is detected even when data sits buffered past the gap, and is seeked across within seconds instead of waiting out the break.
- Twitch's separate client-side ad player element is muted as soon as it appears, not only at the moment a backup is first selected, so a late-attaching ad element no longer plays unsuppressed through the break.

## [9.7.4] - 2026-06-11

### Fixed
- Midroll breaks no longer thrash through repeated false "ad ended" cycles; the end of a break is confirmed against the player's own playlist with a window that widens after each marker bounce.
- Ad-break backups play at your sustained quality instead of dropping to 360p for the whole break when the player had just rebooted onto a low rung.
- The sustained-quality tracker ignores ad-break playback, so a long break can no longer drag the tracked quality down to 360p for later breaks.
- A frozen playhead with a buffered gap ahead (the post-ad audio-hole freeze) is skipped past within a few seconds instead of stalling for ~30 seconds.
- Media elements muted during ad recovery are always unmuted afterwards, even when Twitch detached them mid-break.
- Native-recovery probes no longer overlap or count stale results after a break ends.
- The same stitched ad is no longer spoofed twice when markers bounce, and pod-complete accounting heals across the bounce.
- Startup no longer logs XML parsing errors for wrapped worker scripts.

### Performance
- Held backup playlists refresh just under the segment cadence, removing the per-segment micro-stalls at the backup live edge.

## [9.7.3] - 2026-06-11

### Fixed
- **Post-ad reloads re-evaluate once a midroll chain settles.** When a quick midroll chain taught the extension that reloading the player after a backup escape was counterproductive, it stayed in pause/resume mode for the rest of the session and never tried a reload again. It now clears that state once the chain has ended, so a later isolated ad break can reload normally again while still avoiding reloads during an active chain.
- **Ad-completion spoofing no longer sends pod-complete more than once per pod.** When Twitch omitted the pod-length attribute, the once-per-pod completion signal could be sent on several polls. It is now sent once when the pod size is known and skipped entirely when it is not.

## [9.7.2] - 2026-06-11

### Fixed
- **Backup stalls during quick consecutive midrolls now rotate to another player type.** When a stall was flagged mid-burst, the continuation path stepped aside but nothing consumed the flag or cooled down the stalled type, so the follow-up search re-picked the same type and the stuck flag kept the fast path disabled afterwards. The flag is now consumed and the stalled type cools down, so the search genuinely rotates.

### Performance
- **Fewer network round trips during ad bursts.** The continuation path now serves the cached clean backup directly when it is under 2 seconds old, matching the other backup paths, instead of refetching on every playlist poll. This mainly helps low-latency streams, where polls arrive faster than once per second.

## [9.7.1] - 2026-06-10

### Fixed
- **Ad-recovery reload backoff now actually downgrades to pause/resume.** It logged the downgrade but still hard-reloaded the player, so repeated recovery failures could reload every couple of seconds. The downgrade now performs the pause/resume and skips the reload.
- **The CSAI fast path now fires on every ad break.** Its per-break marker was never cleared, so only the first CSAI-only break per stream got the instant response; later breaks waited on a full backup search.
- **The backup search recovers when every backup type is cooling down at once.** The stale-cooldown reset existed but was never called; it now runs at the start of every backup search.
- **The worker fetch relay no longer throws on bodyless HTTP statuses.** Responses with status 101, 204, 205, or 304 are now rebuilt without a body.

### Changed
- `parent_domains` is only stripped from playlist requests when the access-token player-type rewrite is enabled.
- Twitch GQL responses are returned to the page immediately; token-state inspection runs in the background.

### Internal
- Removed the unused `_incrementPlaylistMediaSequence` helper.

## [9.7.0] - 2026-06-10

### Performance
- **Smoother playback during back-to-back midrolls.** When ads arrive in quick succession (a burst of short midrolls), the extension holds one continuous clean backup across them — but every poll during that window re-ran the *full* backup search (iterate player types → fetch → clean-verify) instead of the lightweight refresh, and that per-poll latency could let the player drain to the buffer edge and stutter briefly. During post-ad continuation it now refreshes the already-active backup directly first, falling back to the full search only if that backup goes stale or a stall is flagged. Result: fewer buffer-edge stalls across consecutive midrolls.

### Safety
- The fast refresh re-runs the exact same clean-playlist verification as the full search (rejecting any ad-marked / ad-metadata / known-ad-segment playlist) before serving, so it cannot serve an ad — it changes only how quickly the already-verified-clean stream reaches the player, not what is served. If a backup stall is flagged (the 9.6.6 force-refresh signal) it skips the shortcut and lets the full search rotate to another type. No change to ad detection or stripping.

### Diagnostics
- A trace reports each continuation fast-refresh and its latency (e.g. `Continuation fast-refresh: site (14ms)`), so the effect on consecutive-midroll smoothness is visible in the console.

## [9.6.9] - 2026-06-10

### Fixed
- **Long ad-break backups no longer get stuck at the wrong quality.** During an extended ad — a long midroll pod, or any break that outlasts the visible ad cycle and enters a silent backup hold — the backup stream's quality was pinned to whatever resolution the player happened to be requesting when the hold began, then re-read repeatedly as the player adapted *down* to the low backup it was being fed. With no upward pressure while held, that target decayed and stuck low (e.g. 360p) for the entire break even though higher variants were available. (A channel-open preroll escaped this only incidentally: its cold-start player ramps *upward*, pulling the backup up with it.) The silent backup hold now targets the quality your connection has actually been sustaining on native playback — tracked as a recent high-water mark — or your explicitly chosen quality when one is set, so a held backup matches what you were really watching instead of collapsing to a low rung.

### Bandwidth-aware
- The hold targets *sustained* quality, never the top variant by default — so a viewer who was watching at 360p holds at 360p instead of being forced up to a 1080p stream their connection can't carry, while a viewer sustaining 1080p holds at 1080p. The tracked quality follows real adaptive bitrate up and down (with a short recency window, so a degraded connection is reflected within about a minute), is floored at 360p, and honors a manual quality selection. Scoped to the silent backup hold; the visible ad-recovery path and the Low Quality Fallback first-frame hold still track the live player. The existing stall-rotation recovery remains the safety net, and there's no effect on ad detection or stripping.

### Diagnostics
- A trace fires whenever the tracked sustained native quality changes (e.g. `Sustained native quality: 640x360 -> 1920x1080`), so the quality a hold will target is visible in the console. Backup selection traces continue to report the resolution served (e.g. `Selected: site @ 640x360`).

## [9.6.8] - 2026-06-10

### Fixed
- **Backup streams no longer cold-start below 360p on prerolls.** The backup is fetched at the resolution of whatever native variant the player was requesting when the ad hit. On a channel-open preroll the player is still ramping up from its lowest adaptive rung (160p), so the backup faithfully matched 160p — visibly sub-360p video during the break. This was a second, distinct cause from the 9.6.7 fix (which only covered an unparseable target resolution); here the target was a valid-but-too-low resolution. A 360p quality floor now applies to backup selection: a sub-360p target is raised to the lowest available variant at or above 360p. Targets already at or above 360p, deliberate fixed-quality selections, and the unparseable-target path (which still serves the highest variant) are all unchanged.

### Safety
- The floor only raises the temporary ad-replacement backup and never lowers a target, so it cannot reduce quality; it has no effect on ad detection or stripping. When no variant at or above 360p is offered, the original target is kept. For a viewer on genuinely low bandwidth the brief backup may attempt 360p during the ad, with the existing stall-rotation recovery as a safety net.

### Diagnostics
- Backup selection traces now report the resolution the backup is served at (e.g. `Selected: site @ 640x360`), and a separate trace fires when the 360p floor raises a sub-360p target, making the served quality visible in the console for troubleshooting.

## [9.6.7] - 2026-06-10

### Fixed
- **Backup streams no longer drop below 360p when the target quality can't be matched.** The variant picker chose the stream closest to the player's target resolution, but when the target had no usable numeric resolution — only a quality name (e.g. your selected `1080p60`) that didn't exist in that backup playlist's ladder, or no target yet on a channel-open preroll — the "closest pixel area" math collapsed to zero and selected the *smallest* variant (160p) instead of the largest. It now serves the highest-quality variant whenever the target is unknown or unmatched, instead of the lowest.

### Safety
- Selection with a valid target resolution is unchanged (exact match, else nearest by area); only the no-usable-target path changed, and it now favors the best available quality. No effect on ad detection, stripping, or the deliberate low-quality first-frame hold during recovery.

## [9.6.6] - 2026-06-10

### Fixed
- **Stalled backup during a silent hold now rotates to another stream type.** When the native stream stayed ad-marked long enough to enter a silent backup hold and the pinned backup (e.g. `site`) then dried up — buffer drained to the edge with a frozen playhead — the page's stall detector set a force-refresh flag, but the silent-hold serving path ignored it and kept retrying the same ad-locked type every 2s, falling back to the stale cached window until it froze. The hold path now honors that signal: it cools down the stalled backup type and rotates `_findBackupStream` to a different one (`embed`/`popout`), giving playback a clean, advancing stream to land on instead of freezing on a drained cache.

### Safety
- Rotation only ever serves a backup that passes the existing clean-playlist checks, so no ad content can leak; if every type is ad-locked it still falls back to the cached backup exactly as before. The change is scoped to the silent-hold path and mirrors the force-refresh handling the active backup-search path already used.

## [9.6.5] - 2026-06-10

### Fixed
- **Single-ad midroll breaks no longer get doubled by the post-escape reload.** After a CSAI backup escape, the extension soft-reloads the player to correct audio desync — but on some channels Twitch treats that reload as a new session and immediately serves another ad, so every midroll cost a player restart plus a second backup cycle. The extension now detects this: when a post-escape reload is followed within 30s by another ad break, it marks post-escape reloads counterproductive for that stream and downgrades them to a lightweight pause/resume resync (no new player instance, so Twitch does not serve a fresh ad). The full reload is still used until the pattern is observed, and verified-clean escapes that do not bounce keep the desync-correcting reload.
- **Duplicate "Suppressed N competing media element" log entries removed.** Re-running ad-recovery suppression re-counted and re-logged elements it was already muting, because the skip guard only matched paused elements. Already-suppressed elements are now re-muted defensively but counted and logged only once; the saved volume/mute state and single restore are unchanged.
- **Contradictory native-recovery trace clarified.** A clean recovery probe that had not yet reached the required consecutive-clean count was reported as "still ad-marked after max wait," contradicting the "Native recovery ready N/3" line logged the same instant. The hold log now reads "verifying clean; holding clean backup stream" when probes are coming back clean, and only says "still ad-marked" when they actually are.

### Safety
- All changes are recovery-bookkeeping and log-clarity refinements; ad detection, stripping, backup selection, and the spoof payloads are untouched, so no ad content can leak through.
- The post-escape reload downgrade only takes effect after observing a reload-triggered ad on that stream, and pause/resume still resyncs audio — the audio-desync protection the reload was added for is preserved.

## [9.6.4] - 2026-06-10

### Fixed
- **Background-tab ad breaks no longer trigger player reloads.** The in-ad stall and frozen-playhead checks ran before the buffer monitor's hidden-tab guard, so a throttled background tab could misread a suspended decoder as a stall and reload the player — the same destructive hidden-tab restart the watchdog fix already removed elsewhere. These checks are now skipped while hidden, and their detection state is reset so a tab returning to the foreground cannot fire a false recovery on the first visible tick.
- **Pinned-backup stall recovery no longer exhausts itself for the rest of the session.** The 3-attempt re-search budget only reset when the backup type changed, so after three lifetime stalls on the same type the recovery silently stopped helping on every later ad break. The budget now resets once playback recovers and whenever the ad context clears, making the cap per stall episode instead of per session.
- **Ad-end marker bounce kept backup playback intact.** When ad markers briefly flickered back during recovery, the debounced backup-serving path returned a cached backup playlist without marking backup state, which dropped the seamless splice bridge and could serve a stale prior-break playlist. It now flags backup playback and only reuses the cached backup when it is fresh.
- **Multi-ad pods without a declared pod length now spoof every ad.** When Twitch omits `X-TV-TWITCH-AD-POD-LENGTH`, the per-poll ad count was mistaken for the whole pod size, so the completion-spoof early-out bailed after the first ad and left later ads in the pod unspoofed. The early-out is now gated on an explicit pod length.
- **Triggered player reloads are consumed by the correct stream.** A pending post-reload hint is now applied only to the stream it was issued for, preventing a second concurrent playlist (multi-stream pages) from absorbing it.

### Safety
- All changes remove false-positive recovery actions and tighten backup bookkeeping; ad detection, stripping, and the spoof payloads themselves are unchanged, so no ad content can leak through.
- Genuine stalls in a visible tab are still detected and recovered, and a real multi-ad pod is still fully spoofed when its pod length is present.

## [9.6.3] - 2026-06-10

### Fixed
- **Background tabs no longer falsely declare the player worker crashed.** The worker heartbeat watchdog measured staleness from the last pong while browser timer throttling froze the page's ping schedule, so a backgrounded or just-refocused tab could hit the two-strike limit within seconds and hard-restart a healthy player. The watchdog now skips strike accrual entirely while the tab is hidden (it keeps pinging so a pong is ready on refocus) and only counts a strike when a concrete ping has gone unanswered for the full timeout while visible.
- **Worker-recovery player reloads now wait for the tab to become visible.** Reloading a player in a hidden tab left it half-initialized because throttled resume retries and autoplay restrictions prevented playback from sticking — the visible "player crash" after tab switches. Recovery still installs the degraded page-side fallback immediately; only the player restart is deferred.
- **Blob-injection failure detection no longer fires while hidden.** The initial heartbeat timeout reschedules itself until the tab is visible instead of declaring a throttled worker dead before it had a chance to answer.

### Safety
- Ad blocking is unaffected: playlist processing, fallback installation, and recovery attempt caps are unchanged — only the false-positive crash verdicts and hidden-tab player restarts are removed.
- A genuinely dead worker in a visible tab is still detected and recovered within roughly 30 seconds via the same two-strike escalation.

## [9.6.2] - 2026-06-10

### Fixed
- **Removed a pointless player restart when an ad cycle ends into a silent backup hold.** When native recovery probes stayed ad-marked and the worker ended the visible ad cycle while keeping the clean backup stream playing, the CSAI post-escape path still reloaded the player. The reload dumped a cleanly playing buffer and showed a loading spinner only to resume on the exact same held backup playlist. Silent-hold ends now skip that reload, matching the extended-hold path that already kept playback untouched.

### Safety
- Playlist content served during and after holds is unchanged — the held backup keeps playing until the native playlist is verified clean, so no ad content can leak through this change.
- Verified-clean CSAI escapes still perform the post-escape soft reload that prevents audio desync after backup playback, and autoplay/HEVC holds still reload at restore time via the existing `NativePlaybackRestored` path.

## [9.6.1] - 2026-06-09

### Fixed
- Known ad segment URLs are now stripped even when a fallback/native recovery path skips automatic full-playlist stripping, preventing explicit ad media lines from surviving in modified playlists.
- Token, backup and native-recovery fetches now keep their timeout active through response-body reads, so a response that hangs after headers cannot stall recovery indefinitely.
- The MAIN-world popup bridge now accepts only the session token generated by the extension page context, closing the race where an arbitrary page message could claim the bridge first.
- The TypeScript popup translation source now matches the shipped shortened "Report a bug." labels.

## [9.6.0] - 2026-06-09

### Added
- **Retro synthwave theme with a popup theme picker.** Two clickable color circles in the popup header switch between the new default Retro theme and the original Neon theme. Retro uses a cohesive magenta/cyan palette on deep indigo with soft neon glows, a subtle grid, and CRT scanlines and blocky animated controls. The selected theme is persisted in local storage.
- **Chromatic aberration glitch animation on the Retro title.** The "TTV AB" title in Retro theme now has a subtle color-separation glitch effect — magenta shifts left, cyan shifts right — using compositor-only `text-shadow` animation that fires every 1.7s.

### Changed
- **Retro motion now runs smoother at native refresh rate.** Scanline flicker, status-dot pulse, and donate-button pulse animations now favor compositor-friendly properties (`opacity`/`transform`) with `will-change` hints for GPU promotion. The Retro title keeps its chromatic aberration glitch effect.
- **"Report a bug." translations shortened across all 11 locales.** Natural, concise equivalents replace the longer "Found a Bug? Report it" phrasing so the button fits on one line in all languages (es: "Reportar un error", fr: "Signaler un bug", de: "Fehler melden", pt: "Relatar um bug", it: "Segnala un bug", ja: "バグを報告する", ko: "버그 신고하기", zh-CN: "报告 Bug", zh-TW: "回報錯誤", ru: "Сообщить об ошибке").
- Retro animations honor `prefers-reduced-motion`, and the picker dots scale/glow on hover and selection. Retro is now the default popup theme for new installs; the original Neon theme remains selectable.

## [9.5.0] - 2026-06-09

### Fixed
- **Brief first-frame black screen on consecutive ad breaks.** Backup search now prefers a recently verified clean non-autoplay backup type for the same stream before cold source candidates, so repeated breaks can avoid wasting seconds on source types that just returned ad-marked playlists.

### Safety
- The remembered backup type is still re-fetched and checked for playable, ad-free media before it can be selected.
- `autoplay` is never preferred by this fast path, preventing the previous autoplay-first stall tradeoff from returning.
- Stale, cooling-down, or currently ad-marked backup types are skipped.

## [9.4.4] - 2026-06-09

### Fixed
- **Pinned autoplay recovery now rotates during the LQ dwell window.** When pinned-stall recovery cools down `autoplay`, the worker releases the autoplay-only hold so the next backup search can move to another clean source instead of reusing the same starving fallback.
- **Degraded page-side fallback catches more Twitch ad markers.** The worker-crash fallback now uses the broader parser ad-marker detection and can exit cue-out ad blocks on `#EXT-X-CUE-IN`, covering more ad playlists when the worker is unavailable.

### Changed
- Added regression tests for stalled autoplay dwell release and degraded fallback marker stripping.

## [9.4.3] - 2026-06-08

### Fixed
- **Pinned autoplay fallback recovers from thin-buffer starvation.** The pinned-backup stall monitor now requires safe buffer headroom before treating buffer or playhead progress as healthy, so a clean `autoplay` backup that advances at the live edge still triggers backup rotation instead of repeatedly stalling.

### Changed
- Added a regression test for the Twitch `Playhead stalling` shape where the playhead and buffer edge both advance but the buffer remains drained.

## [9.4.2] - 2026-06-08

### Fixed
- **Native recovery probes can no longer hang playlist delivery.** The worker now bounds the native usher and stream probes with the existing timeout wrapper, so a stalled Twitch recovery request fails fast instead of holding the intercepted M3U8 response.
- **SPA navigation hooks survive Firefox BFCache restores.** After `pagehide` unhooks history methods, `pageshow` now reinstalls the SPA navigation bridge and resyncs page context so workers keep receiving current channel/VOD state.
- **Instant worker crashes now recover automatically.** Explicit worker errors, missed startup heartbeats, and watchdog failures now share the same crash recovery path, install the page-side M3U8 fallback immediately, and defer reload recovery until the cooldown expires instead of dropping replacement-worker crashes.
- **Worker injection validation now covers the native recovery helper chain.** Build guards now fail loudly if a direct helper used by native recovery is removed from the injected worker bundle.

### Changed
- Added regression tests for bounded native recovery probes, BFCache SPA navigation rehooking, instant worker crash fallback, and cooldown-delayed worker recovery.

## [9.4.1] - 2026-06-08

### Fixed
- **Ad spoof accounting now caps at the declared pod length.** If Twitch exposes more unique stitched-ad DATERANGEs than the playlist's `X-TV-TWITCH-AD-POD-LENGTH`, the worker stops spoofing once the pod is complete instead of sending or logging impossible totals such as `5/2 pod`.
- **Pinned backup stall detection now treats safe playback progress as healthy.** A backup stream with an advancing playhead and safe buffer headroom no longer forces a backup re-search only because the buffer edge has not moved.

### Changed
- Added focused regression tests for ad-spoof pod capping and pinned-backup stall progress detection.

## [9.4.0] - 2026-06-08

### Fixed
- **Disabled low-quality fallback no longer leaks ads when every source backup is ad-marked ([#32](https://github.com/GosuDRM/TTV-AB/issues/32)).** Source-tier backups are still tried first, but `autoplay` is restored as an emergency last-resort candidate so the popup contract remains true without bringing back autoplay-first stalls.
- **Ad-marked backup playlists are no longer promoted as fallback.** If a backup playlist still contains Twitch ad markers, it is cooled down instead of being treated as a usable fallback that can leak when stripping has no clean cache.
- **Empty stripped playlists now serve an empty hold segment instead of the original ad playlist.** When no clean backup or native playlist is cached, the worker keeps ads out of playback while the next backup search/recovery poll runs.
- **Autoplay backup holds now release after the LQ dwell window.** When autoplay is explicitly enabled and wins a clean backup, it is no longer held until native ad-end detection succeeds. After the short dwell window, source-tier backups can be tried again so playback does not sit on a stalled autoplay playlist.
- **Autoplay backups participate in pinned-stall recovery.** Autoplay is now pinned like other backup types, and a stalled autoplay selection can be cooled down and rotated away from instead of being invisible to the monitor.
- **Worker heartbeat recovery is less trigger-happy.** Startup heartbeat timeout now matches the watchdog timeout, and a late worker gets one retry before being marked crashed and reloading the player.

### Changed
- Build validation now guards the newly direct worker-injected autoplay/hold dependencies, and tests cover emergency autoplay, ad-marked fallback rejection, empty-playlist hold recovery, dwell-window release, and heartbeat miss reset.

## [9.3.8] - 2026-06-07

### Fixed
- **Worker crash recovery now has a real lifecycle.** Recovery attempts are counted per playback context instead of per Worker object, so repeated replacement workers cannot reset the cap and loop player reloads indefinitely.
- **Missed worker heartbeats recover through the same player-reload path.** A worker that never replies is quarantined, the page-side M3U8 fallback is installed, and a context-checked recovery reload is scheduled so Twitch can create a fresh connected worker.
- **SPA navigation no longer leaves crash recovery tied to an old channel.** Page context updates are mirrored onto tracked worker objects, and late messages from crashed workers are ignored.

### Changed
- The worker recovery cap now resets only after the replacement worker stays healthy for 60s, and tests cover the cap, stable reset, and page-context tracking behavior.

## [9.3.7] - 2026-06-07

### Fixed
- **Low-quality fallback no longer stalls while high-quality backups are probed.** After the clean `autoplay` fallback won during an ad, the next playlist polls could still spend several seconds checking source-tier backups before returning a fresh playlist. On a thin live buffer, that delay let the playhead catch the buffer end and Twitch logged `Playhead stalling`. The active ad-cycle now holds `autoplay` as the only backup candidate and refreshes it directly until the ad ends.
- **Low quality → high quality recovery avoids mid-ad source hitches.** The extension now defers high-quality restoration to the existing ad-end recovery path instead of swapping from the low-quality fallback to a source-tier backup while the ad cycle is still active.

### Changed
- Build validation now tracks the new autoplay-hold helper so worker injection fails loudly if the helper is omitted from `hooks.ts`.

## [9.3.6] - 2026-06-07

### Fixed
- **Occasional loading circle during ad breaks is gone.** When the extension swapped to a clean backup stream, it captured that backup's media playlist once and replayed the exact same bytes on every subsequent playlist poll for up to 15s (and 4s/20s in the silent-hold and ad-end-wait paths). A live HLS media playlist has to keep advancing — new segments, a higher `#EXT-X-MEDIA-SEQUENCE` — roughly every target-duration (~2s); a frozen snapshot let the player buffer only the ~4s of segments it contained and then starve, leaving the playhead stuck (Twitch's own player logged `Playhead stalling at 3.95, buffer end 3.97` for tens of seconds). The active backup variant's media playlist is now re-fetched on the live cadence (`_BACKUP_MEDIA_REFRESH_MS`, 2s) in all three substitution paths, so the buffer keeps growing the way it would on a real live stream.
- **A stalled backup now rotates to a working type instead of looping on the broken one.** When the playhead-stall watcher fired, the forced re-search re-ordered the stalled type to the front and re-selected it; after 3 attempts it logged "re-searches exhausted, leaving stream as-is" and stopped, so the stream only recovered ~40s later when an unrelated ad-marked cooldown happened to free the type. The stall force-refresh now puts the stalled type on a short cooldown (`"stalled"`, 10s) so the very next search skips it and advances to the next type (e.g. `site` → `embed`).

### Changed
- **Playback recovery now runs during ad breaks, not only between them ([#33](https://github.com/GosuDRM/TTV-AB/issues/33)).** All of the video-element recovery (pause/play nudge, live-edge reload) lived behind a guard that returned early whenever an ad was active, so a frozen backup mid-ad had no element-level recovery at all — the only in-ad action was a source re-search. A new in-ad watchdog samples the video element during ad cycles; if the playhead stays frozen on a drained buffer (buffer end within the live-edge danger zone) for ~5s it issues a pause/play nudge, repeats once, then reloads the player at ~15s — regardless of ad state. Worst-case recovery drops from ~40s to ~15s, and most stalls are now avoided entirely by the live playlist refresh above.

## [9.3.4] - 2026-06-07

### Fixed
- **No more 5-12s loading circle on preroll.** The cold-start autoplay-first strategy (pin autoplay as the first backup on a fresh ad cycle for a fast first-frame) was the source of the silent autoplay-gate stalls that froze the playhead at ~3.97s while Twitch's "Autoplay is only allowed when approved by the user…" UI sat in the background. Autoplay is now appended as last-resort on a fresh ad cycle, so Source-tier backups (site, embed, popout, mobile_web) are tried first. The LQ→HQ dwell window still uses autoplay-first (continuation case where autoplay is already pinned and we don't want to flicker back to HQ), but that path doesn't re-hit the autoplay-gate. Trade-off: ~500ms slower first clean frame in the rare case autoplay would have been the cleanest backup; gain: 5-12s loading circle eliminated on every preroll that hits the gate.

## [9.3.3] - 2026-06-07

### Fixed
- **Long ad sessions ended faster.** The native-playlist recovery loop used to wait up to 90s for Twitch to serve a clean playlist, even when every probe came back ad-marked. A new per-cycle counter caps the wait at 6 failed probes (~24s on the typical 4s poll cadence); the cycle then ends the same way it would have at 90s.
- **Less probing during a clean-pinned hold.** The clean-backup cache windows (3s post-ad-start, 1.5s in the ad-end wait loop) were shorter than Twitch's playlist poll cadence, so every poll triggered a fresh backup search. Raised to 15s and 20s — non-pinned types no longer burn token/usher requests on each poll while a pinned backup is still serving.

### Changed
- Trace log noise reduced. `Cooling down: <type>` and `Whitelisted variants for <type>` now log at most once per (type, ad-cycle) pair instead of on every poll.
- **Pinned backup stalls switch backups within ~3s.** A new playhead-watcher in the buffer monitor samples the video element every 1.5s during active ad cycles. If the pinned backup's buffer stops growing for 3s (the symptom Twitch reports as "Playhead stalling"), the watcher forces a fresh backup search via a new `UpdateBackupSearchForceRefresh` bridge message. Previously the 15s post-ad-start cache window hid this stall for the full window.
- **No more runaway re-searches on a broken stream.** When the watcher fires and a re-search picks the same broken backup, it caps at 3 attempts per pinned type. The 3rd attempt logs a one-time "re-searches exhausted, leaving stream as-is" warning and goes silent, avoiding worker load and log spam when no clean fallback is available.

## [9.3.2] - 2026-06-07

### Fixed
- **Brief "Playhead stalling" freeze when the stream switches to the ad-free backup.** To block an ad, the extension swaps the player's playlist over to a clean backup stream without reloading the player. That backup comes from a different Twitch encoder, so its video segments carry their own internal timestamps that don't line up with the stream you were just watching — and the playlist never told the player that the timeline jumps at the swap point. Without that signal, the player couldn't place the incoming segments next to what it had already buffered, so it drained the buffer and rebuilt from scratch; for a fraction of a second there was nothing to play and Twitch's own player logged `Playhead stalling at X, buffer end X+0.04s`. The swapped-in playlist now carries the standard HLS discontinuity marker (`#EXT-X-DISCONTINUITY`) at the exact splice point, and that marker is kept consistent as the playlist refreshes during the ad. The player now resets its timing at the boundary and appends the backup stream right after the current buffer, so the source swap no longer empties it — the switch is seamless. This is the underlying swap-time stall that the 9.3.1 buffer-dwell change reduced but did not fully eliminate.

## [9.3.1] - 2026-06-07

### Fixed
- **Brief "Playhead stalling" freeze during the LQ→HQ quality upgrade.** During an ad, the extension first plays a low-quality 360p backup stream (so you get a clean picture instantly) and then upgrades to high quality once a clean HQ source is available. The upgrade was happening the moment any HQ candidate was found — but at that point the LQ stream had only been buffering for a few seconds, so the player's buffer was thin. Switching sources emptied the buffer, the player started rebuilding the new HQ source from the live edge, and for a moment there was nothing to play: Twitch's own player reported `Playhead stalling at X, buffer end X+0.04s` and the screen froze for a fraction of a second. The extension now holds the LQ stream for at least 8 seconds before allowing the upgrade. By that time the buffer is comfortably full (5–10 seconds of pre-rolled video), so the source swap no longer drains it. The upgrade itself still happens the moment a clean HQ stream is found — you just don't see the freeze.

## [9.3.0] - 2026-06-07

### Changed
- **Near-instant clean video when you open a channel that's showing an ad.** Opening a channel mid-preroll could leave you staring at a black screen for ten seconds or more before any video appeared. Here's why: to get an ad-free stream, the extension requests the broadcast as one of several different Twitch "player types," and during a preroll every one of the standard types is ad-marked — so it tried them one at a time (each needing its own token and playlist fetch) and only reached the single reliably-clean source last. It now goes to that reliable clean source **first** whenever it doesn't already have a fresh ad-free stream to show, which brings the first frame down from roughly ten seconds to about two. Playback starts at a lower quality (360p) and then upgrades to your normal quality automatically and seamlessly the instant the ad window clears — no player reload and no flash of an ad. The same fast path now kicks in for mid-stream ads too, so recovery between ad breaks is quicker.

## [9.2.3] - 2026-06-06

### Fixed
- **Firefox ad breakthrough during full-pod ad breaks ([#32](https://github.com/GosuDRM/TTV-AB/issues/32)).** When Twitch serves ads on every player variant simultaneously (site, embed, popout, mobile_web), the extension switches to a clean backup stream — but on Firefox, the injected Worker occasionally failed to load because the blob: URL was created without an explicit MIME type (defaulting to `text/plain`), causing Firefox to attempt XML parsing and throw a SecurityError. Additionally, the blob URL was revoked after only 500ms — sometimes before the Worker finished loading its ~100KB of injected code. Now: the blob is created with `type: "text/javascript"`, revocation is delayed to 30 seconds, and a 3-second heartbeat check detects if the Worker never initialized. If the heartbeat is missed, the Worker is terminated and a page-side M3U8 fetch override is installed as degraded ad-blocking — it strips `stitched-ad` segments directly from playlist responses without needing the Worker at all.

## [9.2.2] - 2026-06-06

This is a reliability and correctness release focused on the worker layer and player recovery. No changes to how ads are detected or stripped.

### Fixed
- **Crashed playback workers now actually recover.** Twitch runs ad-blocking inside a Web Worker, and the extension watches that worker for crashes — but the watchdog was effectively broken in two ways. It "pinged" the worker by posting a message, but posting to a dead or frozen worker never fails, so the check always passed and a hung worker was never noticed. And when a worker did crash, recovery spawned a brand-new worker that Twitch had no idea about — Twitch kept talking to the dead one — so playback stayed broken while the logs claimed success. Now: workers reply to a liveness ping with a pong, the watchdog only flags a worker once no pong has come back for 15 seconds, and recovery reloads the player (the one action that makes Twitch spin up a fresh, fully-connected worker). A 30-second cooldown keeps a persistently broken stream from looping reloads.
- **The "Ads Blocked" total no longer overshoots after a brief disconnect.** When the in-page messaging bridge dropped for a moment, queued counter updates were merged by adding their increments together with no ceiling, so when the bridge reconnected the displayed total could jump well past the real number. The merged increment is now capped to the true running total.
- **The stream you're watching is no longer evicted from the worker's cache.** The worker keeps a URL→stream lookup table; when it filled up it discarded the oldest *inserted* entries, which could include the currently-playing stream and cause brief moments where ads slipped through. It now discards the least-recently-used entries instead, so the active stream always stays cached.
- **Hardened the statistics counter against tampering.** The background service worker accepted "add to my blocked-ad count" messages without checking who sent them, so in principle any script running on a Twitch page could inflate your counter or unlock achievements. It now only accepts those messages from the extension itself.
- **The popout and Picture-in-Picture hooks can no longer break Twitch's own interface.** The extension wraps `window.open` and Picture-in-Picture to track when playback hands off to a second window. If one of its internal checks ever threw, the error could bubble up into Twitch's code and break things like login popups, clip sharing, or entering PiP. Both hooks now fail safe and always fall back to the browser's native behavior.
- **Recovery timers now respect channel switches.** A few post-ad and player-handoff timers acted on whatever stream happened to be loaded when they fired, so switching channels quickly could pause or seek the *new* stream by mistake. These timers now cancel themselves the moment you navigate away.
- **Closed a rare popup race** where the "are you sure you want to disable Low Quality Fallback?" confirmation could be skipped on a later toggle.

### Changed
- Removed unused "Buffer Fix" interface text (4 strings across all 11 languages) that no longer corresponds to anything in the UI.

## [9.2.1] - 2026-06-02

### Changed
- "Low quality fallback" toggle now defaults to **disabled**. The previous default (enabled) caused a proactive 360p switch for every ad, which most users found jarring on channels where high quality was available. With the last-resort autoplay injection (below), the system already falls back to 360p automatically when every primary source is ad-marked, so disabling the toggle by default gives a cleaner native-first experience while still preventing black screens. Enable the toggle to opt back into proactive 360p switching during ads.

### Fixed
- Info modal text for "Low quality fallback" was stale: the warning claimed disabling "may cause a black screen or frozen video during ads", but the last-resort autoplay injection (below) already prevents that. The description and warning are rewritten across all 11 locales to reflect the new default and the actual behavior in both states.
- Ads leaking through during preroll when "Low quality fallback" is disabled: the 9.2.0 emergency autoplay injection relied on `LoggedBackupAdsByType` being populated (all primary types ad-marked), but the check ran before the main loop, so on the first call it never fired. The injection is now unconditional when the toggle is off — autoplay is appended to the backup-search order as a last-resort type, after the configured types. When all configured types are contaminated, the loop reaches autoplay, finds a clean LQ stream, and the existing seamless-hold path (`IsHoldingBackupAfterAd` → `NativePlaybackRestored`) transitions cleanly back to HQ native playback when the ad cycle ends — same UX as when the toggle is enabled, with no ad flash and no black screen.

## [9.2.0] - 2026-06-02

### Fixed
- Ads leaking through when "Low quality fallback" is disabled: the emergency autoplay injection (gated on `!DisableAutoplayBackup`) never fired with the toggle off, so when all primary types (embed/popout/site) were ad-marked the system promoted an ad-marked `embed` fallback. The injection now triggers whenever all primary types are contaminated, regardless of the toggle, and logs the override. The injected LQ stream serves as the seamless-hold source until the ad ends.
- Seamless LQ→HQ hold corrupted by ad-marked fallback cache: `_findBackupStream` stored any candidate promoted to the fallback slot in `LastCleanBackupM3U8` regardless of whether the type was in `LoggedBackupAdsByType`. This poisoned the parser's empty-playlist recovery (which falls back to the original playlist to "prevent stall"), causing the exact ad-flash loop visible in the log spam `[Recovery] Empty playlist after stripping ads; falling back to original playlist to prevent stall`. Fallbacks are now only cached as "clean" when their player type is not known to be ad-marked, so the seamless-hold → `NativePlaybackRestored` path engages only with truly clean sources.

## [9.1.5] - 2026-06-02

### Fixed
- Low Quality Fallback and Ad Spoofing toggles no longer silently re-enable in freshly-spawned Twitch workers: the worker state seed in `_hookWorker` set `IsAdStrippingEnabled` but omitted `DisableAutoplayBackup` and `DisableAdSpoofing`, so any worker created after the toggle was set (player reload, SPA navigation, or initial page load with the toggle already off) reverted to the default and re-enabled the feature. Both flags are now seeded at worker creation alongside `IsAdStrippingEnabled`; the `UpdateAutoplayBackupState`/`UpdateAdSpoofingState` messages continue to patch already-running workers.

## [9.1.4] - 2026-05-28

### Fixed
- Synced 6 accidental hooks.ts divergences from main: deviceId hex validation, proper gql.twitch.tv URL parser, missing worker function injections (_forceClearBackupCooldownsIfStale, _incrementPlaylistMediaSequence, _fetchWithTimeout), previousMediaKey cleanup with object-type guards
- Removed stale zip:chrome and package:chrome scripts from Firefox package.json

### Changed
- Removed debug console.log statements from autoplay backup toggle flow in popup.ts

## [9.1.3] - 2026-05-28

### Fixed
- Consecutive ad stale stream: when a second ad arrives within the 8-second post-ad continuation window, the "buffer drain prevention" path and the 3-second backup search cooldown both served stale cached playlists from the previous ad cycle, causing the user to watch past stream content. Both paths now skip cached returns during post-ad re-entry so a fresh backup search runs immediately.

## [9.1.2] - 2026-05-27

### Fixed
- Low quality fallback toggle now correctly filters autoplay from backup search when disabled
- Reload trigger on fallback disable no longer blocked by unreachable pinned-type guard

## [9.1.0] - 2026-05-27

### Added
- Real-time sub-toggle locking: Ad Spoofing and Low Quality Fallback settings now automatically grey out and disable when the master Ad Blocking switch is turned OFF, ensuring clean UI state tracking. Help/information `i` icons remain fully active and clickable under all states — ([#27](https://github.com/GosuDRM/TTV-AB/issues/27)).
- Automatic player soft-reload: Disabling the Low Quality Fallback toggle while the stream is actively playing on a 360p backup now immediately triggers a non-disruptive, soft reload of the Twitch player under the hood to return you to your native high-quality stream instantly — ([#26](https://github.com/GosuDRM/TTV-AB/issues/26)).

### Fixed
- Fixed a bug where clicking "Got it" in the Low Quality Fallback information tooltip would inadvertently turn the feature toggle OFF. The modal context is now fully distinguished between informational reading and disabling warnings — ([#25](https://github.com/GosuDRM/TTV-AB/issues/25)).
- Fixed a crash during popup initialization caused by a Temporal Dead Zone (TDZ) reference order mismatch on the backup toggle variable declaration — ([#25](https://github.com/GosuDRM/TTV-AB/issues/25)).
- Fixed a crash during popup load caused by a missing translation container element by restoring `<div id="infoText">` back to the DOM and hiding it cleanly via CSS — ([#27](https://github.com/GosuDRM/TTV-AB/issues/27)).
- Relocated popup modals to the root of `<body>` to stop rounded-corner container border clipping under modern browser layouts — ([#27](https://github.com/GosuDRM/TTV-AB/issues/27)).

### Changed
- Comprehensive line-by-line translation audit of all 11 supported locales.
- Polished and refined translation flows in German (`de`), Spanish (`es`), Portuguese (`pt`), Italian (`it`), Japanese (`ja`), Korean (`ko`), and Russian (`ru`) to use precise, highly natural tech and adblocking phrases (e.g. `"Qualitäts-Fallback"`, `"Werbe-Spoofing"`, and unified modal confirmations).

## [9.0.9] - 2026-05-27

### Fixed
- Backup hold recovery no longer causes A/V desync when autoplay (360p) was the active backup — `HevcReloadPendingAfterHold` now set when backup player type is autoplay, triggering a hard reload with fresh MediaSource on native restoration instead of an in-place stream swap that corrupts the WASM AVC decoder
- `NativePlaybackRestored` handler passes `newMediaPlayerInstance: true` during autoplay recovery reload, ensuring the WASM worker is torn down and re-initialized on the native source-quality stream

## [9.0.8] - 2026-05-23

### Fixed
- `_resetStreamAdState` no longer clears `BackupVariantUrls` whitelist on ad-end reset — prevents cached encodings from leaking backup variant URLs and causing backup media playlists to be misidentified as native
- `_findBackupStream` re-populates `BackupVariantUrls` from cached encodings when reusing a previously fetched master playlist — ensures backup media playlists pass through the `isBackupUrl` gate on consecutive ad breaks
- Consecutive midroll backup search no longer contaminates `LastCleanNativeM3U8` with backup stream content, fixing stream position corruption on post-reload ad detections

## [9.0.7] - 2026-05-21

### Changed
- Buffer monitor now throttles to 900ms during steady-state playback (zero stall signals, valid cached player, no post-ad recovery). Drops back to the configured 600ms cadence on the first stall signal. ~33% fewer monitor ticks on healthy streams; worst-case stall detection moves from 3.0s to 3.3s.
- Preserve the cached React player reference across transient buffer-monitor skip ticks (idle context, buffer fix disabled, non-live, ad-active). Counters still reset; only the cache lifetime changed. Eliminates fiber-tree re-walks after every ad break and idle interval.

### Fixed
- `_findReactRoot` caches the `#root` DOM node and React fiber container key at module scope, re-validating via `isConnected`. Removes a `document.querySelector('#root')` and an `Object.keys()` scan on every `_getPlayerAndState` call.
- `_getPlayerAndState` collapses three independent React fiber DFS walks (player wrapper, direct state, fallback state) into a single multi-constraint walk with short-circuit termination when all predicates are satisfied.
- `_hasExplicitAdMetadata` now uses a single compiled regex alternation in place of eight sequential `String.prototype.includes` calls. Hot path: runs on every M3U8 response and was previously also invoked per line inside `_stripAds`.
- `_stripAds` skips the per-line ad-metadata scan entirely when the whole-text check found nothing, and only tests tag lines (charCode 35 = `#`) when it does run. Drops up to N regex tests per playlist refresh to zero on clean streams.
- `_stripAds` no longer splits the playlist text twice — the redundant `text.split('\n')` inside `_playlistHasKnownAdSegments(text)` was reusing the same input the strip loop had already split. New `_playlistLinesHaveKnownAdSegments(lines, options)` accepts pre-split lines.
- `_stripAds` builds its output via a single forward pass instead of `lines.filter(...).some(...).join(...)`. One fewer intermediate array allocation per playlist; same return shape.
- `_getPlaylistUrlAliases` returns at most 4 strings — dropped the `Set` plus spread copy in favour of an array with `indexOf` dedupe.

## [9.0.6] - 2026-05-21

### Added
- Worker-hook coexistence with [TwitchNoSub](https://github.com/besuper/TwitchNoSub) — `_isValid` now accepts wrappers matching an AND-combined signature whitelist, allowing TwitchNoSub to chain on top of TTV-AB's `window.Worker` hook so users can run both extensions simultaneously ([#19](https://github.com/GosuDRM/TTV-AB/issues/19))

## [9.0.5] - 2026-05-21

### Fixed
- First poll now awaits backup search synchronously instead of fire-and-forget + stopgap — eliminates all ad-flash leakage paths on prerolls. Player sees loading spinner until clean backup arrives, then plays clean stream directly.

### Fixed
- `_extractPlaylistHeaders` now returns minimal `#EXTM3U\n` fallback instead of null when no headers found — prevents original ad-marked playlist from leaking through when LL-HLS PART-only or malformed playlists have no headers before segments ([#20](https://github.com/GosuDRM/TTV-AB/issues/20))

## [9.0.3] - 2026-05-21

### Fixed
- Stopgap during backup search now returns headers-only playlist instead of ad-marked text on both first request and all subsequent refresh requests

## [9.0.1] - 2026-05-21

### Added
- Embedded-player support: content scripts now inject into all frames matching `*.twitch.tv`, enabling ad-blocking on multistream viewers (e.g. [twitchtheater.tv](https://twitchtheater.tv/)) that embed the official `player.twitch.tv` iframe ([#16](https://github.com/GosuDRM/TTV-AB/issues/16))
- `all_frames: true` declared on both MAIN and ISOLATED content scripts; build-time manifest validator updated to match

## [9.0.0] - 2026-05-21

### Fixed
- Ad-blocking pipeline restored to stable working version — zero decoder corruption
- Fixed persistent buffering and slideshow playback during ad breaks on certain streams ([#18](https://github.com/GosuDRM/TTV-AB/issues/18))
- Empty playlist fallback returns original content instead of header-only to prevent player stalls
- Backup search now checks all 5 player types (including autoplay 360p) for clean streams
- Eliminated brief black screen when first loading a channel — backup search now starts immediately with stripped native as stopgap (~100% faster channel load)

### Added
- CSAI fast path for all-live ad breaks — strips tracking URLs from native and returns directly with no stream switch
- Ad segment caching preserves playlist structure for stable playback

## [8.8.3] - 2026-05-20

### Fixed
- CSAI Fast Path sticky loop: properly reset the CSAI flag when exiting early due to empty or too short playlists, preventing player buffer freezes.
- Fallback backup stream searching: reset the fallback filler count whenever a stripped playlist contains valid segments, preventing infinite token re-fetch loop locks.
- Midroll ad leakage: require refreshed backup stream playlists to be clean and verified, successfully blocking late-entering midrolls on stream switches.
- Vitest configuration type safety: standardized the mock AdSegmentCache in setup files to Map matching the production environment.

### Changed
- Playlist parsing performance: optimized HLS segment cache validation by passing pre-split arrays directly to avoid redundant split overhead on large VOD files.

## [8.8.1] - 2026-05-20

### Fixed
- Stripped playlists now pass through even when identical to source — removes an unnecessary identity guard that rejected valid stripped results
- Live-segment lockout cleared when stripping produces empty playlist — allows next poll to retry instead of getting stuck
- Fallback backup streams no longer mark the stream as using backup — prevents recovery confusion

## [8.8.0] - 2026-05-19

### Fixed
- Ad leak during backup search — cached clean playlists served with incremented media sequences while worker searches for backup
- Worker hangs — 3500ms fetch timeouts on all Twitch Usher, GQL, and stream requests
- Duplicate backup searches — guard prevents redundant searches when multiple m3u8 requests arrive simultaneously
- Empty segments now created in-memory (Blob URL) instead of network fetch, eliminating round-trip delay during ad replacement
- Stripped ad segments insert alternating DISCONTINUITY markers to help the video decoder handle segment gaps
- Silent filler format changed from 2 long segments to 6 short 1-second segments with DISCONTINUITY for smoother recovery
- Backup search retry loop removed, fresh-token fetch cap added to prevent excessive API calls

### Changed
- Ad spoofing now enabled by default — sends fake ad-watch beacons to reduce anti-adblock fingerprinting
- Build process auto-generates .xpi and source .zip during packaging
- Native recovery probe cooldown increased (250→500ms min, 750→1500ms default)
- Fast-fallback promotion policy default fixed, autoplay player type properly flagged for downstream recovery
- Low-latency recovery min clean playlists reduced (12→6) for faster post-ad resume
- Verbose token error payloads removed from backup search logs

## [8.7.1]

### Added
- "autoplay" (360p) player type as last-resort backup when all Source types are ad-marked
- Fallback filler cycle cap (5 cycles) — triggers player reload instead of Error #2000 crash

### Fixed
- CSAI ad leaks: fallback path force-strips segments, serves silent filler on empty result
- Empty playlists after stripping serve silent video segments instead of bare HLS headers
- Stripped playlists padded with duplicate segments to prevent buffer underrun
- Misleading "Token relay error" log renamed to "Spoof relay error"
- GQL ad spoofing timeout increased 1500ms→5000ms

### Changed
- Removed parallel backup preload, reverted to serial search

## [8.6.1] - 2026-05-19

### Fixed
- Fallback stripping now preserves segments — only ad metadata removed when all Source types exhausted
- Force-add autoplay removed from backup rotation

### Changed
- Autoplay removed from main rotation and pre-fetch

## [8.5.9] - 2026-05-19

### Fixed
- Fallback mode now returns unstripped backup stream when stripping produces empty — prevents ad leak from original playlist
- Removed autoplay escape hatch — caused 44s hangs

## [8.5.8] - 2026-05-19

### Fixed
- Worker crash: debug-logging variable now declared in worker scope
- Worker fetch error handler hardened: falls back to ad-strip on processing failure
- CSAI fast path now preloads backup in parallel to prevent loading-circle stall
- Ad-end false positive during midroll pods — enforces 8s minimum ad duration

### Changed
- Autoplay removed from main backup rotation, added as conditional escape hatch
- Ad spoofing now defaults to off
- Reload cooldown increased from 15s to 30s
- Ad-recovery backoff counter persists across continuation cycles
- Worker injection code memoized — function bodies built once per session
- Debug logging added to critical silent catch blocks and React fiber diagnostics
- StreamInfo stale TTL eviction (30-minute inactivity)
- Worker watchdog interval cleared on pagehide

## [8.5.7] - 2026-05-19

### Changed
- Rolled back to v8.4.7 codebase due to regressions in 8.5.x series

## [8.5.6] - 2026-05-19

### Fixed
- Restored autoplay as last-resort backup — removing it caused fallback-to-original when all 4 Source types were ad-marked, playing real ads

## [8.5.5] - 2026-05-19

### Fixed
- Autoplay was still being force-added to backup player types despite being removed from PLAYER_TYPES — caused loading circle hangs when Source types were exhausted

## [8.5.4] - 2026-05-19

### Changed
- Reload cooldown increased from 15s to 30s to reduce reload frequency during multi-ad midroll pods
- Removed autoplay (360p) from backup player types — prevented loading circles and failed transitions
- Ad-recovery backoff counter now persists across continuation cycles instead of resetting on every ad-end

## [8.5.3] - 2026-05-19

### Changed
- Ad spoofing now defaults to off — GQL ad-completion beacons no longer fire by default (user must opt in via popup toggle)

## [8.5.2] - 2026-05-19

### Fixed
- Ad-end false positive during midroll pods — enforces 8s minimum ad duration before candidate ad end, preventing premature reload loop when backup playlists are briefly clean at break start

## [8.5.1] - 2026-05-19

### Fixed
- CSAI fast path now preloads backup in parallel — prevents 25s loading-circle stall when stripped playlist runs out of segments

## [8.5.0] - 2026-05-19

### Added
- Low latency mode compatibility — buffer monitor, ad-end detection, and fix attempts now latency-aware

### Changed
- Buffer starvation thresholds relaxed in low latency: epsilon 0.35→0.08s, danger zone 1.0→0.3s
- Ad-end minimum clean playlists scaled 4× in low latency (3→12) to compensate for faster polling
- Seek-based buffer fixes suppressed in low latency (disrupts LL-HLS playback path)
- Recovery segment injection now collects and replays partial segments
- Fix repeat delay reduced from 8s to 2s in low latency mode
- Recovery segment buffer expanded from 6 to 12 for shorter LL-HLS segments

## [8.4.8] - 2026-05-19

### Fixed
- CSAI sticky path recovery loop: `_UsedRecoveryFallback` flag now set on recovery segment injection, CSAI path falls through to backup search when recovery was needed
- Backup search now skips re-fetching tokens for ad-marked types (parallel pre-fetched results already cache the outcome)
- Firefox: restored `_getWasmJs`+`eval(wasmSource)` worker loading (only approach compatible with Firefox blob workers)

## [8.4.7] - 2026-05-18

### Fixed
- Worker `ResetPlaybackRecoveryState` handler now cleans up `StreamInfos` and `StreamInfosByUrl` for the previous channel on navigation — prevents stale cached backup playlists from surviving across channel visits
- `_processM3U8` skips stale in-flight playlist fetches when synthetic info channel doesn't match current page context

## [8.4.6] - 2026-05-18

### Fixed
- `_hasExplicitAdMetadata` now uses catch-all `EXT-X-DATERANGE:CLASS="twitch-` prefix instead of explicit `twitch-trigger`/`twitch-maf-ad` checks — covers any future Twitch DATERANGE ad marker formats

## [8.4.5] - 2026-05-18

### Fixed
- CSAI sticky flag now cleared when playlist has no ads, preventing subsequent non-CSAI breaks from bypassing backup search
- CSAI fast path now increments ad-blocked counter and fires AdDetected on activation
- Empty CSAI strip result falls through to backup search instead of returning original ad-laden playlist

## [8.4.4] - 2026-05-18

### Fixed
- Processed playlist Response objects now preserve original URL for compatibility with callers that inspect `response.url`
- `_stripAds` recovery path now records fallback source on `info._UsedRecoveryFallback` for diagnostics

## [8.4.3] - 2026-05-18

### Fixed
- Page-exit counter flush no longer creates empty localStorage entries when `pendingAdsDelta` is zero
- Removed dead `navigator.sendBeacon` fallback on page exit — primary persistence handled by `chrome.runtime.sendMessage`

## [8.4.2] - 2026-05-18

### Fixed
- Worker fetch relay now uses `self.fetch` instead of `window` — `window` is undefined in web workers, so the bridge relay was silently broken
- GQL endpoint check uses exact hostname match instead of substring, preventing spoofed URL matching
- Concurrent `_processM3U8` invocations on same stream are serialized to prevent backup state corruption during initial variant loading
- Visibility event listeners cleaned up on `pagehide` to prevent stale listener accumulation
- `_cleanWorker` logs a debug warning when Worker prototype properties are non-configurable instead of failing silently
- Empty `updateWorkers` broadcasts skipped to avoid unnecessary worker message overhead

### Added
- Processor helper test suite — 15 tests for `_resetStreamAdState`, `_rememberLastAdEnd`, `_doesPlaybackContextMatchInfo`, `_getBackupPlayerRetryCooldownMs`, `_getFallbackPromotionPolicy`
- Debug logging infrastructure — `_enableDebugLogging()` toggle via bridge message, gated debug log level

### Changed
- `_normalizeCounterValue` / `_normalizeBridgeCounterValue` consolidated into single `_normalizeCount` in state module
- `unique_id` localStorage read now validates format (`/^[a-f0-9]{8,64}$/i`) before accepting as GQL device ID
- Test setup loads `_C` constants from built `constants.js` instead of hardcoding — eliminates version drift

## [8.4.0] - 2026-05-18

### Added
- CSAI fast path — skips backup search when all segments are live, strips ads
  inline from native playlist at full quality
- Recovery segment injection with MEDIA-SEQUENCE — cached live segments
  injected when stripping produces empty playlists
- `site` and `mobile_web` backup player types

### Changed
- Non-live segments now stripped when ad metadata is present in playlist,
  preventing unrecognized SSAI ad segments from slipping through
- `autoplay` (360p) moved to end of backup rotation — Source-tier types
  tried first, autoplay only when all are contaminated


## [8.3.7] - 2026-05-18

### Changed
- Rolled back CSAI sticky path, ad-stripped promotion, and recovery segment
  injection changes from v8.2.x–v8.3.x
- Kept parallel backup token+master pre-fetch from v8.1.0 — tokens fire
  simultaneously across all player types eliminating sequential RTT delays

## [8.0.0] - 2026-05-18

### Added
- Ad Spoofing toggle in popup UI — control anti-adblock fingerprinting beacons independently
- Ad Spoofing info modal explaining the feature
- Translations for Ad Spoofing in all 11 supported locales

### Changed
- Backup ad-marked retry cooldown reduced from 15s to 5s — prevents stale playlist serving during contaminated backup cascades
- Initial backup search runs as background fire-and-forget when cached content is available, eliminating buffer drain during mid-roll ad detection
- Buffer Fix toggle hidden from popup UI (always-on internally)
- Ad Spoofing defaults to off — users who want anti-fingerprinting coverage can enable it from the popup

### Fixed
- Backup playlist staleness: force-clears all backup cooldowns when cached playlist exceeds 8s, preventing expired-segment looping
- Stream freezing/audio lag during ad transitions caused by blocked synchronous backup search and cooldown deadlock
- Ad-completion spoofing beacons made user-controllable via popup toggle
## [7.7.5] - 2026-05-17

### Fixed
- Brief loading circle during silent backup hold caused by 10s backup refresh letting HLS segments expire

## [7.7.4] - 2026-05-17

### Fixed
- Critical: `_getResolvedSilentBackupHoldMaxMs` not injected into worker context, causing all playlist processing to fail and ads to leak through

## [7.7.3] - 2026-05-17

### Added
- Ad-completion spoofing: mimics Twitch telemetry (impression, quartile, pod-complete beacons) to reduce anti-adblock fingerprinting (thanks [@ryanbr](https://github.com/ryanbr))

## [7.7.2] - 2026-05-17

### Fixed
- Silent backup hold now capped at 2 minutes to prevent indefinite low-res playback
- Ad recovery cascade after player reload: suppressed rapid backup type bouncing

### Improved
- Backup refresh during silent hold slowed from 1.5s to 10s to reduce network pressure

## [7.7.1] - 2026-05-17

### Fixed
- Loading circle freeze during ad recovery: stale clean backup now served during search instead of falling through to ad-marked content

### Improved
- Faster stall detection and recovery: post-ad grace stall threshold reduced from 3 to 2 ticks, retry cooldown from 4s to 1.5s

## [7.7.0] - 2026-05-17

### Fixed
- Memory leak: stream URL cache now prunes old entries during long sessions
- Removed dead `ALWAYS_RELOAD_PLAYER_ON_AD` constant

### Improved
- Backup search now tracks success/failure/fallback counters for easier debugging
- TypeScript: stricter unused-variable and catch-variable checks enabled

## [7.6.9] - 2026-05-17

### Fixed
- CSAI poll wait returns cached clean backup or native playlist instead of ad-marked content

## [7.6.8] - 2026-05-17

### Reverted
- csai cold-start fallback removed — returning ad-marked playlist caused longer ad flash instead of preventing it

## [7.6.7] - 2026-05-17

### Fixed
- CSAI cold-start ad flash: background backup search launched immediately on first CSAI detection

## [7.6.6] - 2026-05-17

### Fixed
- CSAI background backup search now applies to metadata-only playlists; poll-wait strip logic moved out of dead-code block

## [7.6.5] - 2026-05-17

### Fixed
- Ad-blocking pipeline: csai poll-wait leak, cache iteration safety, token fetch retry, abort controller for ad fetches

## [7.6.2] - 2026-05-16

### Fixed
- Ad recovery now properly refreshes the access token to escape the ad window without rebuilding the player

## [7.6.0] - 2026-05-16

### Fixed
- Audio no longer desyncs after ad recovery — player rebuild replaced with soft reload

## [7.5.9] - 2026-05-16

### Fixed
- Removed rapid pause and resume cycling during consecutive midroll breaks

## [7.5.8] - 2026-05-16

### Fixed
- Ad detection now covers more marker types for broader protection

## [7.5.7] - 2026-05-16

### Fixed
- Ad blocking stays active when ads are embedded directly in the stream — playback now switches to a clean backup immediately instead of waiting

## [7.5.6] - 2026-05-15

### Fixed
- Stream no longer shows as offline after ads end when Twitch returns an empty playlist
- Playback no longer stalls when ad tracking strips all segments — falls back to original playlist
- Ads no longer leak through during marker bounce — backup returned silently without triggering reload
- Backup stream no longer cycles rapidly during consecutive midrolls
- Consecutive midroll reload suppression extended to 30 seconds
- Backup refresh now only triggers for current ad cycle, preventing cross-cycle backup search
- All prefetch hints now stripped when ad metadata is present
- Inline ad stripping removed — every ad break now finds a clean backup stream to prevent metadata from reaching the player

## [7.4.1] - 2026-05-14

### Fixed
- Channel no longer shows offline when Twitch returns an empty playlist during an active ad break — the backup stream is now preserved

## [7.4.0] - 2026-05-14

### Fixed
- First ad detection no longer blocks the playlist response during backup search, eliminating the buffer gap on fresh streams
- Duplicate backup searches prevented when background search is already running
- When all media segments are live, tracking URLs are stripped inline without switching to a backup stream

## [7.3.3] - 2026-05-14

### Fixed
- Backup variant URL tracking now resets between ad breaks, preventing stale URLs from interfering with new break detection

## [7.3.2] - 2026-05-14

### Fixed
- Autoplay no longer gets pinned as preferred backup type in the main thread, keeping it available as a last-resort fallback

## [7.3.1] - 2026-05-14

### Fixed
- Autoplay no longer gets pinned as the preferred backup type, keeping it available as a last-resort fallback when all Source-quality types come back contaminated
- Ad recovery reloads are now properly suppressed on consecutive midroll channels, preventing the reload-expose-next-ad cascade

## [7.3.0] - 2026-05-14

### Fixed
- Backup player cycling no longer hammers the same failing type repeatedly on channels where all backup types are ad-marked. Rejected types are deprioritized during the break and retried less aggressively
- Autoplay (360p) is now a reliable last-resort backup when all Source-quality types come back contaminated, preventing endless token refresh loops
- Autoplay is excluded from backup type pinning so it stays in the fallback position

### Changed
- Ad-marked backup retry cooldown increased from 3 seconds to 15 seconds to reduce unnecessary GQL token requests

## [7.2.1] - 2026-05-13

### Fixed
- Back-to-back midroll ads no longer leak through after recovery — the extension no longer reloads the player when no ad segments were stripped, avoiding the fresh token fetch that was re-exposing the next ad in the chain
- When a backup stream was used during an ad break, playback now properly recovers instead of freezing after the break ends ([#12](https://github.com/GosuDRM/TTV-AB/issues/12))

### Changed
- Ad segment URL cache stays under 1000 entries, with oldest entries cleaned up automatically
- Buffer gaps are now skipped smoothly before resorting to pause/play or reload

## [7.1.0] - 2026-05-12

### Fixed
- **Consecutive Midroll Handling** — Player reload after ad end is now suppressed when consecutive midrolls are detected (previous ad within 15 seconds), preventing fresh token fetches from re-exposing the next ad break. Pause/resume still nudges playback to refresh when reload is skipped, avoiding player hangs. HEVC quality recovery reloads are unaffected.

## [7.0.7] - 2026-05-12

### Fixed (Critical)
- **Post-Ad Recovery** — Native stream restoration after ad recovery now properly resets the grace window, preventing brief re-blocks when Twitch transitions back from backup streaming. ([#10](https://github.com/GosuDRM/TTV-AB/issues/10))

## [7.0.6] - 2026-05-11

### Fixed
- **Ad-End Bounce Loop** — Rapid marker oscillation during ad-end detection no longer traps the blocker in a reset loop. A 3-second debounce on the bounce handler prevents quality-fluctuation ping-pong and excessive API calls while still allowing genuine new ads through immediately after a completed cycle.

## [7.0.5] - 2026-05-10

### Fixed
- **Chrome "Video Not Available" Flash** — First-ad backup search no longer blocks the media playlist response. Clean native content continues streaming while backup tokens load in the background, eliminating the brief error screen that appeared on Chrome when ads first started.
- **Faster Token Fallback** — Direct fetch timeout for GQL token requests reduced from 5 seconds to 3 seconds, speeding up backup recovery when the bridge relay is unavailable.
- **Ad Signifier Guard** — Segment URL ad detection now safely handles empty AdSignifier values instead of silently failing.
- **Stale State Cleanup** — Modified master playlist flag now properly resets on every master playlist refresh, preventing stale HEVC handoff state from carrying over between refreshes.

## [7.0.4] - 2026-05-10

### Fixed
- **PiP HEVC Recovery** — `_doPlayerTask` now checks `needsRealReload` before the `shouldSuppressAutomaticTask` suppression gate. Real reloads with `refreshAccessToken` or `newMediaPlayerInstance` now bypass PiP protection entirely, fixing 1440p HEVC quality permanently lost after ads in Picture-in-Picture mode.
- **SPA Navigation Cleanup** — `_setPagePlaybackContext` now calls `_resetPlaybackIntentForNavigation` on media key change, clearing user pause intent, playback control interaction state, and secondary player handoff state. Workers now receive `previousMediaKey` in `ResetPlaybackRecoveryState` and clean up stale `StreamInfos` entries.
- **Slow VPN Resilience** — Bridge relay timeout in `_getToken` reduced from 5000ms to 1500ms, halving backup search latency on slow or VPN connections where the local MessageChannel bridge is sluggish.
- **Buffer Fix Info** — Added an "i" icon next to Buffer Fix in the popup explaining what it detects and when to disable it. Translated to all 10 supported locales.
- **Worker Watchdog** — Periodic health ping (every 5s) detects silently-dead workers and restarts them. Extracted shared restart logic for both error-event and watchdog-triggered recovery.

## [7.0.3] - 2026-05-10

### Fixed
- **Twitch DATERANGE Ad Marker** — Added `EXT-X-DATERANGE:CLASS="twitch-trigger"` to `_hasExplicitAdMetadata` for broader ad detection coverage. Thanks [@ryanbr](https://github.com/ryanbr) ([#11](https://github.com/GosuDRM/TTV-AB/pull/11)).

## [7.0.2] - 2026-05-10

### Fixed
- **Overly Broad Ad Detection** — Removed `processing` substring from `_isExplicitKnownAdSegmentUrl` which incorrectly matched any URL containing that substring. Removed redundant `stitched` and `stitched-ad` URL checks already covered by the configurable `AdSignifier`.
- **Backup Cache Thrashing** — `_syncStreamInfo` no longer resets `BackupEncodingsM3U8Cache` on every master playlist refresh. Previously this forced all 3 backup player types to fetch fresh tokens and usher/playlist URLs on every ad start (~9 round trips of latency).
- **Brittle Variant URL Filter** — `_getStreamUrl` no longer skips variant URLs lacking `.m3u8` or `://`, surviving Twitch CDN format changes that would otherwise break backup stream selection.
- **Empty Attribute Crash Guard** — `_parseAttrs` now guards against empty string attribute values that could trigger undefined index access.
- **Dead Code** — `AdEndBounceCount` removed from `_createStreamInfo`, `_resetStreamAdState`, `_isAdEndStable`, and the bounce-detection block in `_processM3U8`. The counter was incremented but never used for any decision path.
- **Shared Worker Restart Counter** — `hwRestartAttempts` was a single closure variable shared across all hooked Worker instances. Once any worker crashed 3 times, every future worker restart was permanently blocked. Moved to per-instance `__TTVABRestartAttempts` so each worker gets its own 3-attempt budget.

## [7.0.0] - 2026-05-05

### Fixed
- **HEVC Fallback State Accuracy** - The HEVC-to-AVC backup handoff path no longer sets `IsUsingModifiedM3U8` unless a clean native playlist is actually being returned. Previously this flag was set unconditionally, causing unnecessary player reloads at ad end even when the original unmodified stream was served.
- **Unbounded Bridge Message Queue** - The bridge message queue now drops the oldest counter message when coalescing fails, preventing unbounded memory growth during long sessions with many distinct ad-block events.
- **Bridge Flush Message Recovery** - When a single bridge message fails to serialize, the flush loop now removes the problematic message and continues processing the remaining queue instead of silently discarding everything.
- **Worker Hook Crash Resilience** - Worker prototype cleanup (`_cleanWorker`) and function reinsertion (`_reinsert`) now wrap their operations in try-catch, preventing the entire Worker constructor hook from breaking if another extension or page script has set non-configurable properties on Worker.prototype.
- **WASM Fetcher Crash Guard** - The synchronous XHR used to retrieve the WASM bootstrap script now runs inside try-catch, returning an empty string on failure instead of throwing and silently crashing the injected worker.
- **Missing State Guards** - Added existence checks for `__TTVAB_STATE__` in `_syncPreferredQualityGroup`, `_resolvePlayerMediaKey`, `_pruneStreamInfos`, and `_getStreamInfoForPlaylist`, preventing crashes when these functions are called before state initialization.
- **Optional Chaining on State Access** - `_resolvePlayerMediaKey`, `_doPlayerTask` (`LastPlayerReloadAt`), and `_broadcastWorkers` (`TriggeredPlayerReload` context) now use optional chaining on `__TTVAB_STATE__` fields, matching the guard pattern used elsewhere.
- **BackupVariantUrls Eviction Strategy** - The backup variant URL whitelist now evicts the oldest single entry when exceeding 200 instead of clearing the entire set. This prevents a legitimate backup URL from being unrecognized mid-cycle and accidentally triggering ad processing on a backup stream.
- **Bridge Port Listener Lifecycle** - The bridge port message event listener is now a named handler that gets removed before the old port is closed, preventing minor memory retention from orphaned listener references.
- **Bridge Handshake Race** - The bridge handshake now starts inside the `chrome.storage.local` initialization callback instead of at top-level execution, ensuring the initial state broadcast carries real stored values rather than stale defaults.
- **Page Exit Counter Delivery** - Counter flushes on page exit now attempt a `navigator.sendBeacon` fallback alongside the existing localStorage replay mechanism, adding a second delivery path for ad-block statistics during tab close.
- **Persist Chain Error Recovery** - The background service worker persist chain now explicitly returns `undefined` from its error handler, ensuring that a permanent storage failure does not silently leave the chain in a resolved-then-failed state.
- **Surgical Prefetch Handling** - Both blanket `#EXT-X-TWITCH-PREFETCH` clearing passes have been removed. Prefetch lines are now only blanked when their URL matches a known ad segment, preserving legitimate content prefetch hints at midroll transitions.
- **Cancellable UI Timers** - All six auto-dismiss and animation timers in the donation, welcome, and achievement toasts now store their timer IDs and clear any previous timer before setting a new one, preventing timer accumulation.
- **SPA Listener Cleanup** - The popstate listener and history method overrides from `_hookSpaNavigation` are now cleaned up on pagehide, restoring the original `history.pushState` and `history.replaceState`.
- **Build Minification String Safety** - The minification step now checks whether a matched identifier falls inside a string literal before replacing it, preventing accidental mangling of underscore-prefixed identifiers that appear in message strings.
- **Scoped Blob URL Revocation** - The extended blob URL revocation delay (3500ms) now only applies to extension-owned blob URLs tracked in a dedicated set. All other page scripts' blob URLs are revoked immediately as normal.

## [6.8.1] - 2026-05-01

### Fixed
- **VOD URL v-Prefix** - `_getPlaybackContextFromUrl` now strips the `v` prefix from VOD IDs in path-based URLs (`/videos/v123456`), matching the existing query-param handling for `player.twitch.tv`.
- **Worker Blob URL Revocation** - Increased blob URL revocation delay from 0ms to 500ms to prevent premature revocation before the Worker constructor finishes loading the injected source.
- **Stream Info Pruning Safety** - `_pruneStreamInfos` now collects URL keys before deleting them, avoiding spec-undefined `for...in` with `delete` behavior.
- **Bridge Handshake Recovery** - After exhausting 20 fast handshake retries, the bridge now resets its counter and schedules a 30-second recovery attempt instead of permanently disabling.
- **Buffer State on Hidden** - The buffer monitor no longer resets counter state when the page is hidden, preserving stall detection progress when the tab regains focus.
- **Token Fetch Error Response** - `_getToken` now returns a proper `Response` object on errors instead of a plain object that lacked `clone()` and other Response methods.
- **Welcome Toast Timing** - The first-run welcome localStorage key is now written immediately instead of inside a `setTimeout`, preventing repeated toasts on rapid page reloads.
- **Post-Ad State Cleanup** - The post-ad recovery state reset now also clears `postAdLastCurrentTime`, `postAdStallTicks`, and `postAdSoftReloadAttempted`.
- **Deduplicated Reset Blocks** - Merged the two redundant `if (didMediaKeyChange)` blocks in `_setPagePlaybackContext` into one.

## [6.8.0] - 2026-05-01

### Fixed
- **Worker `eval` Crash Guard** - The injected `eval(wasmSource)` now runs inside try-catch so a failed synchronous XHR that returns non-JavaScript content does not silently crash the entire worker bootstrap, leaving it without message handlers or fetch hooks.
- **Crash-Restart Navigation Safety** - The `_getPlaybackContextFromUrl(window.location.href)` call and context mismatch check inside the worker restart timeout are now inside the try-catch block, preventing an uncaught throw from a destroyed browsing context during navigation from aborting the restart permanently.
- **Tracked Worker Pruning** - `pruneTrackedWorkers` now checks both `__TTVABIntentionallyTerminated` and `__TTVABCrashed` so zombie crashed workers are properly evicted from `_S.workers` instead of persisting as dead references.
- **Worker State Injection** - The injected `_S` object now carries only `adsBlocked` instead of the full serialized page-level `_S` (which included non-serializable `Worker` instances as empty objects).
- **Reinserted Function Binding** - `_reinsert` now binds reinserted window functions to `window` so any function that uses `this` keeps the correct context when called on the Worker prototype.
- **Fetch Relay Abort** - The page-side fetch relay now wraps requests with a 10-second `AbortController` so abandoned worker token requests do not keep running indefinitely.
- **Message Switch Defaults** - Both the worker-side and page-side worker message switches now include a `default` case instead of silently dropping unknown message types.

## [6.7.9] - 2026-05-01

### Fixed
- **PiP Token Isolation Reverted** - The v6.7.8 PiP isolation change incorrectly replaced the `picture-by-picture` string with `picture-in-picture`. Twitch's actual PiP playerType identifier is `picture-by-picture`, so the v6.7.8 change broke isolation completely. Reverted to the original correct string.
- **BackupVariantUrls Unbounded Growth** - The backup variant URL whitelist Set now clears when exceeding 200 entries, preventing unbounded memory accumulation during long sessions with frequent backup token requests.

## [6.7.8] - 2026-05-01

### Fixed
- **PiP Token Isolation** - Fixed a typo (`picture-by-picture` → `picture-in-picture`) in `isPictureInPicturePlaybackAccessTokenBody` that prevented PiP playback token requests from being isolated. PiP tokens no longer overwrite `LastNativePlaybackAccessTokenPlayerType`, keeping native recovery probes on the correct player type.
- **Resolution Fallback Codec Awareness** - `_getFallbackResolution` now prefers non-HEVC variants when `ModifiedM3U8` is active, preventing the fallback from returning HEVC resolution info for AVC backup variants during ad recovery.
- **Bridge Handshake Retry Cap** - `startBridgeHandshake` now stops after 20 retries instead of retrying indefinitely every 75ms.
- **Bridge Queue Overflow Logging** - Dropped bridge messages now emit a console warning with the message type instead of silently vanishing.

### Changed
- **Removed Dead Code** - Removed unused `_escapeUiText` helper from `ui.ts`.

## [6.7.7] - 2026-05-01

### Fixed
- **Post-Ad HEVC Reload Loop** - When an ad cycle ended and `_resetStreamAdState` cleared `IsUsingModifiedM3U8`, post-ad continuation markers arriving within 8 seconds could trigger a redundant second HEVC player reload because the condition only checked `!info.IsUsingModifiedM3U8`. The reload now also gates on `!_isRecentPostAdReentry(info)`, so post-ad markers fall through to the backup stream path instead of causing an unnecessary player teardown/rebuild cycle.

## [6.7.6] - 2026-05-01

### Fixed
- **Preroll HEVC Deferral Black Screen** - The HEVC ad-block deferral in `_processM3U8` could re-trigger after an HEVC player reload during preroll, returning raw ad-marked playlists to a newly-created paused player and producing a black screen. The deferral now gates on `!info.IsShowingAd` so it only activates when no ad cycle is already in progress, letting the backup stream path take over correctly after the reload.

## [6.7.5] - 2026-04-30

### Fixed
- **1440p/HEVC Post-Ad Black Screen and Audio Desync** - During an ad cycle on a 1440p (HEVC-only) stream, the worker swaps the master playlist's HEVC variants with the closest non-HEVC URLs (`info.ModifiedM3U8`) and serves an AVC backup. When 6.7.2's silent backup hold ends, native playback was restored with only a pause/play, leaving the MSE source buffer initialized for AVC while the player resumed an HEVC variant - producing either a black screen (codec switch refused) or audio out of sync (different `EXT-X-MEDIA AUDIO` group). The worker now tracks `HevcReloadPendingAfterHold` whenever the ad cycle used the modified M3U8, forwards `requiresReload` on the `NativePlaybackRestored` event, and the page handler reloads the player with a refreshed access token instead of pause/play. Regular HEVC post-ad exits now use the same fresh-token/new-media-player reload instead of the older soft reload. AVC streams keep the 6.7.2 no-flicker handoff unchanged.
- **1440p/HEVC Ad-Start Black Screen on Cold or Paused Playback** - When a 1440p HEVC stream was opened in a fresh tab or Twitch requested pause ads while playback was paused, the HEVC ad-start path could tear down the player to switch the MSE codec from HEVC to AVC at the same moment an ad was detected. The worker now tracks page-side `PlayerHasPlayedOnce` and `PlayerIsPlaying` signals, seeds them into newly hooked workers, and keeps Twitch's native 1440p master during normal playback. During active HEVC ad recovery only, the worker holds the last clean native media playlist for the current HEVC request while arming a fallback master that keeps the original quality-facing resolution/frame-rate entry visible and borrows fallback `CODECS`, `AUDIO`, `VIDEO`, and `SUBTITLES` fields so the fallback video URL keeps matching media groups. AVC streams are unaffected.

### Changed
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.7.5 Firefox branch release.

## [6.7.3] - 2026-04-30

### Changed
- **Shared Stream-Info Factory** - Extracted the duplicated stream-info object literal in `hooks.ts` and `processor.ts` into a single `_createStreamInfo` factory. Behavior is unchanged.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.7.3 Firefox branch release.

## [6.7.2] - 2026-04-29

### Fixed
- **Early Long-Ad Visible Cycle Cutoff** - Ends the visible ad-blocking state after the backup-hold limit while continuing to serve the clean backup stream until Twitch's native playlist is ready.
- **Native Restore Timing Preserved** - Keeps media restore tied to the native playback restore signal, so the audio-loop recovery remains intact while the visible progress indicator clears earlier.

### Changed
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.7.2 Firefox branch release.

## [6.7.1] - 2026-04-29

### Fixed
- **Post-Ad Audio Loop Recovery** - Keeps suppressed media muted during silent backup hold and waits for the native playback restore signal before running media recovery.
- **Native Backup-Hold Handoff Timing** - Sends `NativePlaybackRestored` only after the native playlist is clean, keeping cleanup and recovery aligned with the actual handoff.

### Changed
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.7.1 Firefox branch release.

## [6.6.9] - 2026-04-29

### Fixed
- **Long Ad-Blocking Progress Guard** - Ends the visible ad cycle after the backup recovery limit while keeping the clean backup stream active until native playback is safe.
- **Silent Backup Hold Recovery** - Tracks silent backup hold internally so long native ad markers do not restart the same ad cycle or force an ad-marked native reload.

### Changed
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.6.9 Firefox branch release.

## [6.6.7] - 2026-04-29

### Fixed
- **Long Ad-Blocking on Bouncing Stitched Ads** - Preserves candidate ad-end timing through short ad-marker bounces so the slow-path native recovery probe can still fire.
- **Ad-End Re-Entry Stability** - Requires three clean native probes with longer grace and cooldown windows before declaring an ad ended.
- **`Media playlist processing failed` Error Loop** - Handles transient post-ad stabilization and backup-refresh errors inside playlist processing.
- **Decoupled Slow-Path Recovery from Clean-Count** - Lets the max-wait recovery gate run even when marker bouncing keeps the clean playlist count low.

### Changed
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.6.7 Firefox branch release.

## [6.6.6] - 2026-04-29

### Fixed
- **Tab-Local Volume Recovery** - Automatic reload and buffer recovery now stop restoring Twitch's shared `volume` / `video-muted` localStorage keys. The extension snapshots the current tab's media element mute and volume state before reloads and reapplies it directly to that tab after recovery, reducing volume jumps when another Twitch tab is playing at a different level.

### Changed
- **Rollback to 6.6.3 Runtime Behavior** - Restored the runtime ad-recovery modules to the last working 6.6.3 path after newer post-ad recovery experiments could emit `Ad ended` while the worker was still serving backup recovery playlists, leaving the Twitch player stuck on a spinner.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.6.6 Firefox branch release.

## [6.6.4] - 2026-04-29

### Fixed
- **Post-Ad Recovery Watchdog Carryover** - Post-ad `AdEnded` and `ReloadPlayer` handling now preserves the matching ad-resume intent instead of clearing it before the returned native player can be observed. The watchdog remains armed through the post-ad reload, treats `post-ad` reloads as guarded ad-recovery reloads, and can apply the pause/play nudge that users reported as the manual workaround for black/loading playback.
- **Two-Tab Volume Bleed** - Automatic post-ad and buffer recovery reloads no longer restore Twitch's shared `volume` / `video-muted` localStorage keys. The extension now snapshots the tab's own media element volume/mute state at ad start and reapplies it directly to that tab after recovery, avoiding volume jumps when another Twitch tab is playing at a different level.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.6.4 Firefox branch release.

## [6.6.3] - 2026-04-28

### Changed
- **Rollback to 6.5.3 Baseline** - Reverted the source tree to commit `b48e544` (v6.5.3) after regressions were identified in the 6.5.4 through 6.6.2 post-ad recovery and ad-handoff changes. All modules (`hooks.ts`, `player.ts`, `processor.ts`, `state.ts`, `build.ts`, popup, README, assets) are restored to their 6.5.3 state. Version metadata bumped to 6.6.3 so users on 6.6.x receive the rollback as a normal update.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.6.3 Firefox branch release.

## [6.5.3] - 2026-04-27

### Changed
- **Refreshed Extension Icon** - Replaced the 16/48/128 px PNG icons under `assets/icons/` with a new design used by the toolbar action and the Firefox/Chrome add-on listings. No code or behavior changes.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.5.3 Firefox branch release.

## [6.5.2] - 2026-04-27

### Added
- **Report a Bug Button** - Added a "Found a Bug? Report it" button in the extension popup that links directly to the GitHub Issues page (`https://github.com/GosuDRM/TTV-AB/issues`). The button sits between the info notice and the footer, uses a red-tinted icon-and-label style, and opens in a new tab.
- **Report Bug Translations** - Added a `reportBugLabel` translation key for all 11 supported locales (en, es, fr, de, pt, it, ja, ko, zh_CN, zh_TW, ru), wired through `data-i18n` on the visible label and applied programmatically to the `title`/`aria-label` attributes in `popup.ts`.

### Changed
- **Translation Naturalness Pass** - Audited every locale and replaced strings that read as literal calques with native phrasing. Japanese `allUnlocked` now uses `達成済み` (achieved) instead of the incorrect `解除済み` (released). Russian `timeSaved` drops the clunky leading `Примерно` adverb, and `next` switches from `Следующее` to the standard UI-convention `Далее`. Simplified Chinese `reportBugLabel` changes from the literal `发现错误？报告它` to the more conversational `发现 Bug？告诉我们`. Korean `reportBugLabel` switches the trailing gerund `신고하기` to the politeness-consistent `신고해 주세요`. Portuguese `channels_50` localizes the borrowed `Globetrotter` to `Viajante mundial`. German `bufferFix` swaps the stiff `Puffer-Korrektur` for the more idiomatic `Puffer-Fix`.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.5.2 Firefox branch release.

## [6.5.1] - 2026-04-27

### Fixed
- **Post-Ad Stall Grace Window** - Added a 90-second post-ad grace watcher that arms once `_isPlaybackHealthyAfterAd` clears the ad-resume intent. While armed, it ticks alongside the existing buffer monitor and watches `currentTime` advancement plus `videoWidth`. On stall, it first nudges the player with a programmatic pause/play (matching the manual workaround users reported), escalates to a token-refresh soft reload, then to a fresh media player instance if the stall persists. This catches the residual black-screen stalls that arrive 10-30 seconds after quality restoration on streams with frequent ads, where the existing dead-frame detector had already disarmed.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.5.1 Firefox branch release.

## [6.5.0] - 2026-04-27

### Fixed
- **BetterTTV "Mute Invisible Player" Compatibility** - Removed the spoofed `document.hidden`/`visibilityState`/`hasFocus` getters and the capture-stage `visibilitychange`/`blur` event swallow so other extensions and page scripts now receive real visibility signals. The player still resumes if Twitch pauses on tab hide, but BetterTTV's "Mute Invisible Player" (and any visibility-driven page script) works again. ([#9](https://github.com/GosuDRM/TTV-AB/issues/9))
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.5.0 Firefox branch release.

## [6.4.9] - 2026-04-26

### Fixed
- **Clip Editor Playback** - The extension now skips initialization on Twitch clip editor pages (`clips.twitch.tv` and `/<channel>/clip/<slug>` routes), so moving the clip selection range no longer freezes the preview video. ([#8](https://github.com/GosuDRM/TTV-AB/issues/8))
- **Post-Ad Black Screen Recovery** - The post-ad health check now treats a player with `readyState < 2`, `videoWidth = 0`, or a non-advancing `currentTime` as unhealthy. When those dead-frame conditions are detected, the extension bypasses the 10s soft-reload gate and rebuilds the underlying media player instance instead of just refreshing the access token, so streams that previously went black ~2s after quality restoration recover automatically.
- **Ad-Recovery Reload Escalation** - If a soft post-ad reload (token refresh on the existing media player) fails to restore playback, the next reload escalates to a fresh media player instance instead of reusing the stuck MSE/SourceBuffer state.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.4.9 Firefox branch release.

## [6.4.8] - 2026-04-24

### Fixed
- **Native Recovery Probe Stability** - Firefox now requires two clean native recovery probes before ending an ad cycle, reducing false post-ad reloads when Twitch briefly serves a clean playlist before returning ad markers.
- **Pre-Roll Handoff Stability** - Pre-roll recovery keeps the same ad cycle alive longer during Twitch's native-player handoff, reducing duplicate `Ad ended`/reload phases.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.4.8 Firefox branch release.

## [6.4.6] - 2026-04-24

### Fixed
- **Native Recovery End Stability** - Native recovery now keeps serving the clean backup stream after the max wait when Twitch's native playlist is still ad-marked, preventing a false `AdEnded`/reload loop during pre-roll handoff.
- **Post-Ad Handoff Guard** - Same-stream ad markers that arrive immediately after an ad-end reload now stay tied to the previous ad cycle, preventing duplicate blocking progress before playback settles.
- **Worker Reload Sync** - Fresh playback workers now inherit the last ad-end context so recovery state remains consistent across Twitch player reloads.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.4.6 release.

## [6.4.5] - 2026-04-23

### Fixed
- **Ad-End Recovery Timeout** - Fixed a critical issue where the ad-end stabilization logic could hold indefinitely when native recovery kept reporting ad-marked playlists, causing streams to appear offline or stuck in a non-playable state. The stabilization now forces the ad cycle to end after the maximum wait period (`AD_END_MAX_WAIT_MS`) instead of holding forever.
- **Post-Ad Re-Entry Continuation** - Immediate same-stream ad markers after `AdEnded` are now treated as continuation of the previous ad cycle, preventing the blocker from restarting ad-blocking progress/counts during Twitch's shaky post-ad handoff.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.4.5 release.

## [6.4.4] - 2026-04-17

### Fixed
- **Backup Hold Recovery** - Keep serving and refreshing the last clean backup playlist while native recovery still reports ad-marked playlists, preventing Twitch from looping directly back into ad blocking after an ad window.
- **Forced Native Reload Removal** - Removed the timed ad-end reload fallback that could reload the player into Twitch's `edge.ads.twitch.tv` ad path before native recovery was actually clean.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.4.4 release.

## [6.4.3] - 2026-04-17

### Fixed
- **Ad-Cycle Recovery Fix** - Reset pending ad-end detection when Twitch returns real ad markers during recovery, preventing premature ad completion and repeated re-entry into ad blocking.
- **Soft Post-Ad Reloads** - Post-ad reloads now reuse the current playback token and media player instance where possible, reducing immediate ad re-entry after an ad break.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.4.3 release.

## [6.4.2] - 2026-04-17

### Fixed
- **Midroll Ad-End Stabilization** - Preserves pending ad-end detection through brief Twitch ad-marker bounce during active ads, allowing midroll recovery to reach native reload instead of resetting forever.
- **Version Metadata Sync** - Updated package, manifest, runtime, popup, README, and changelog metadata for the 6.4.2 release.

## [6.3.9] - 2026-04-17

### Fixed
- **Post-Ad Player Reload** - Restored post-ad recovery so once ad blocking finishes, the extension reloads the Twitch player with a fresh access token and a new media player instance.
- **Removed Backup Hold Regression** - Reverted the backup-hold behavior from v6.3.8 so recovery reloads the native player instead of staying pinned to the backup stream.

## [6.3.8] - 2026-04-17

### Fixed
- **Backup Hold Fix** - When native recovery is still ad-marked after an ad break, the extension now keeps serving and refreshing the backup stream instead of forcing a native reload back into Twitch's ad path.
- **Ad-End Wait Stability** - The worker keeps the active ad cycle alive until native recovery is actually clean, reducing post-ad stalls and IVS worker crashes during long midroll windows.

## [6.3.7] - 2026-04-17

### Fixed
- **Post-Ad Restart Loop** - Restored worker-side ad-end stabilization so an ad cycle only ends after multiple clean playlists and a native recovery check instead of ending on the first transient clean playlist Twitch serves during ad transitions.
- **Backup Stream Exit Re-Entry** - Backup and fallback stream ad exits no longer force an immediate native player reload or pause/play pulse unless explicitly required, preventing the blocker from re-entering Twitch's ad-marked path right after `AdEnded`.
- **Continuation Detection** - Same-context ad detections after a guarded recovery reload are now treated as continuations of the active ad cycle instead of a fresh blocked-ad event.

## [6.3.6] - 2026-04-15

### Fixed
- **Twitch Channel Switching Bug** - Fixed a critical issue where navigating between channels in Twitch's SPA could cause the ad-blocker to serve a backup stream from the previous channel. Implemented robust SPA navigation hooks for `history.pushState`, `history.replaceState`, and `popstate` to ensure playback context synchronization. Improved state eviction logic to reliably clear stale stream information and ad contexts on channel change.
- **Stream Selection Fallback Leaks** - Tightened the stream selection logic to prevent cross-channel fallback leaks when URL lookup fails, ensuring only streams belonging to the current channel are used for ad recovery.

## [6.3.5] - 2026-04-14

### Fixed
- **Ad-Recovery Infinite Preroll Loop** - Fixed an issue where the extension would become stuck in a never-ending ad-blocking loop, rapidly toggling between backup streams and reloading the player. Twich often serves momentary empty `.m3u8` payloads during ad transitions; the extension now requires multiple consecutive clean playlists to declare an ad "over." Additionally, the experimental `REWRITE_NATIVE_PLAYBACK_ACCESS_TOKEN` is now disabled by default, and ad-recovery reloads no longer forcefully refresh access tokens, preventing immediate pre-roll triggering on re-entry.
- **Fetch Response Property Synchronization** - Fabricated `Response` objects generated within the worker bridge were missing native `url`, `ok`, `redirected`, and `type` attributes. This caused Amazon's WASM binary (`amazon-ivs-wasmworker`) to fail when validating tracking (Spade) and media requests, triggering internal `NetworkError` exceptions that halted playback. The extension now synchronizes the full response state across the worker bridge to ensure WASM compatibility.

## [6.3.4] - 2026-04-14

### Fixed
- **Worker Crash Recovery** - A dying IVS WASM worker fires multiple `RuntimeError: index out of bounds` error events from a single crash. Each error event was incrementing the restart counter, exhausting all 3 restart attempts before any scheduled restart could actually fire. The worker instance is now marked as crashed on the first error event, and subsequent error events from the same instance are ignored. This ensures each real crash consumes exactly one restart attempt, giving the restart mechanism a chance to recover playback.

## [6.3.3] - 2026-04-14

### Fixed
- **Ad Flash After Ad Break** - The ad-end recovery path was clearing `BackupEncodingsM3U8Cache`, `BackupVariantUrls`, and `LastCleanBackupM3U8` via `_resetStreamAdState`. When the playlist still carried residual ad markers after the post-ad reload, the extension re-entered ad mode with an empty cache and had to re-probe all player types from scratch — a multi-second window where raw ad content reached the player. These caches are now preserved across ad-end resets so re-entry uses the known-good backup instantly.
- **Simplified Ad-End Recovery** - Removed the `_isAdEndStable` native recovery probing path that fetched a fresh token + usher + stream playlist to verify the native stream was ad-free before ending an ad break. This added 2-4 seconds of latency during which the backup stream continued playing unnecessarily. Ad breaks now end immediately on the first clean playlist, matching upstream behavior.

### Removed
- **Grace Window Suppression** - Removed the `FORCED_AD_END_REENTRY_WINDOW_MS` grace window and `_isForcedAdEndReloadContinuation` logic. These were bandaids for the native recovery probing latency — with instant ad-end and preserved backup caches, re-entry is handled seamlessly without suppression.

## [6.3.1] - 2026-04-13

### Fixed
- **V2 API Ad Blocking** - Twitch's v2 API returns variant URLs without `.m3u8` extensions (raw CDN URLs). The extension was silently skipping these during master playlist parsing, leaving the variant URL registry empty. All subsequent media playlist lookups failed, causing mid-roll ads to pass through completely undetected. Variant URL detection now accepts any absolute URL alongside `.m3u8` URLs across all three affected paths: `_syncStreamInfo`, `_getStreamUrl`, and backup variant whitelisting.
- **Stream Info Lookup Fallback** - When the variant URL registry misses (e.g. due to CDN URL format changes), the extension now falls back to hostname matching and then to the most recently active stream, instead of silently passing through ad-marked playlists.
- **Critical: Worker Resolution Crash** - `_getResolutionByQualityGroup` and `_getSortedResolutionList` were never injected into the worker, causing `_processM3U8` to crash with "is not defined" during ad processing. The catch block then returned the unmodified ad-containing playlist to the player, letting full ads play through.
- **Ad Flash from Prefetch Hints** - All `#EXT-X-TWITCH-PREFETCH` hints are now stripped unconditionally during ads. Previously, only prefetch hints for cached ad segment URLs were stripped — on the first ad playlist, uncached ad segment prefetch hints survived and the player pre-fetched ad content before the extension could block it.
- **Empty Segment MP4** - Replaced the minimal empty segment with a complete valid fragmented MP4 containing proper `ftyp`, `moov`, `trak`, and `mvex` boxes, preventing WASM decoder crashes.

### Changed
- **Channel Switch Speed** - Removed a blocking network request that validated cached M3U8 URLs on every channel switch, eliminating 1-3 seconds of unnecessary latency. The fresh usher response already provides authoritative stream data.

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
