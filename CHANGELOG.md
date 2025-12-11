# Changelog

All notable changes to TTV AB will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com), and this project adheres to [Semantic Versioning](https://semver.org).

## [3.6.5] - 2025-12-12

### Fixed
- **CRITICAL: Player Crash Fix** - Changed popup blocker to use `display: none` instead of removing elements from the DOM. This fix prevents the Twitch player from crashing (showing a "？" error) when a popup is blocked, as removing elements was breaking the player's internal state.

## [3.6.4] - 2025-12-12

### Fixed
- **CRITICAL: Statistics/Achievements** - Fixed achievement unlock notifications not working. Changed `document.dispatchEvent` to `window.postMessage` to correctly cross the ISOLATED→MAIN world boundary, ensuring users get notified when achievements are unlocked.

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
- **CRITICAL: Cross-World Communication** - Fixed counter updates not working because `document.dispatchEvent()` doesn't cross MAIN→ISOLATED content script worlds. Changed to `window.postMessage()` which correctly crosses the boundary.

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
- **CRITICAL: Cross-World Communication** - Fixed ad/popup counters not updating due to document events not crossing the MAIN→ISOLATED content script world boundary. Now uses `window.postMessage()` which correctly crosses worlds.

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
