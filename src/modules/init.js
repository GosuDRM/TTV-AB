/**
 * TTV AB - Init Module
 * Bootstrap and initialization
 * @module init
 * @private
 */

/**
 * Check for conflicts and set up version tracking
 * @returns {boolean} True if initialization should continue
 */
function _bootstrap() {
    // Debug: Confirm extension is running (visible even if styling fails)
    console.log('[TTV AB] 🚀 Extension starting...');

    // Skip if newer version is already running
    if (typeof window.ttvabVersion !== 'undefined' && window.ttvabVersion >= _C.INTERNAL_VERSION) {
        console.log('[TTV AB] ⚠️ Skipping - another script is active');
        _log('Skipping - another script is active', 'warning');
        return false;
    }

    window.ttvabVersion = _C.INTERNAL_VERSION;
    console.log('[TTV AB] ✅ v' + _C.VERSION + ' loaded successfully');
    _log('v' + _C.VERSION + ' loaded', 'info');
    return true;
}

/**
 * Set up toggle listener for enable/disable
 */
function _initToggleListener() {
    document.addEventListener('ttvab-toggle', function (e) {
        const enabled = e.detail?.enabled ?? true;
        IsAdStrippingEnabled = enabled;
        // Broadcast to workers
        for (const worker of _S.workers) {
            worker.postMessage({ key: 'UpdateToggleState', value: enabled });
        }
        _log('Ad blocking ' + (enabled ? 'enabled' : 'disabled'), enabled ? 'success' : 'warning');
    });
}

/**
 * Block anti-adblock popups using MutationObserver
 * Watches for and removes the "Support [streamer] by disabling ad block" popup
 */
function _blockAntiAdblockPopup() {
    // Wait for DOM to be ready before setting up observers
    function _initPopupBlocker() {
        if (!document.body) {
            // DOM not ready, wait and retry
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', _initPopupBlocker, { once: true });
            } else {
                setTimeout(_initPopupBlocker, 50);
            }
            return;
        }

        // Selectors that match the anti-adblock popup elements (expanded)
        const POPUP_SELECTORS = [
            '[data-a-target="player-overlay-click-handler"] + div[class*="ScAttach"]',
            '[class*="consent-banner"]',
            '[class*="AdblockModal"]',
            '[aria-label*="ad block"]',
            '[aria-label*="adblock"]',
            // Additional selectors for broader coverage
            '[class*="ScLayersManager"] > div[class*="ScAttach"]',
            '[data-a-target*="ad-banner"]',
            '[class*="player-ad-overlay"]',
            '[class*="video-player__overlay"] div[class*="ScAttach"]'
        ];

        // Text patterns that indicate anti-adblock content (pre-compiled for perf)
        const POPUP_REGEXES = [
            /disabling ad block/i,
            /disable ad block/i,
            /allow twitch ads/i,
            /support.*by disabling/i,
            /ad-free with turbo/i,
            /viewers watch ads/i,
            // Additional patterns
            /subscribe.*ad.?free/i,
            /watching.*ads/i,
            /blocking ads/i,
            /detect.*ad.?block/i
        ];

        /**
         * Check if element contains anti-adblock content
         * @param {Element} el - Element to check
         * @returns {boolean}
         */
        function _isAntiAdblockElement(el) {
            const text = el.textContent || '';
            if (!text) return false;
            // Expanded pre-check keywords
            if (!text.includes('ad') && !text.includes('Ad') &&
                !text.includes('Turbo') && !text.includes('block') &&
                !text.includes('Block') && !text.includes('support')) return false;

            return POPUP_REGEXES.some(regex => regex.test(text));
        }

        /**
         * Increment popup blocked counter and dispatch event
         */
        function _incrementPopupsBlocked() {
            _S.popupsBlocked++;
            document.dispatchEvent(new CustomEvent('ttvab-popup-blocked', { detail: { count: _S.popupsBlocked } }));
            _log('📊 Popup blocked event dispatched, count: ' + _S.popupsBlocked, 'info');
        }

        /**
         * Scan for and remove existing popups
         */
        function _scanAndRemove() {
            // Check by selectors
            for (const selector of POPUP_SELECTORS) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        if (_isAntiAdblockElement(el)) {
                            el.remove();
                            _incrementPopupsBlocked();
                            _log('Anti-adblock popup removed (Total: ' + _S.popupsBlocked + ')', 'success');
                        }
                    }
                } catch { /* Selector may fail */ }
            }

            // Check buttons with anti-adblock text (expanded scope)
            const buttons = document.querySelectorAll(
                '[class*="modal"] button, [class*="overlay"] button, [role="dialog"] button, [class*="ScAttach"] button, [class*="Layout"] button'
            );
            for (const btn of buttons) {
                const text = btn.textContent || '';
                if (!text) continue;

                // Expanded fast check for keywords
                if (text.includes('Twitch') || text.includes('Turbo') || text.includes('ads') || text.includes('Ads') || text.includes('block')) {
                    if (/allow twitch ads|try turbo|disable.*block|subscribe/i.test(text)) {
                        // Find and remove the parent modal/overlay
                        const modal = btn.closest('[class*="ScAttach"], [class*="modal"], [role="dialog"], [class*="Layout"], [class*="overlay"]');
                        if (modal && _isAntiAdblockElement(modal)) {
                            modal.remove();
                            _incrementPopupsBlocked();
                            _log('Anti-adblock popup removed via button detection (Total: ' + _S.popupsBlocked + ')', 'success');
                        }
                    }
                }
            }
        }

        // Initial scan
        _scanAndRemove();

        // Watch for new popups (Throttled scan instead of checking every added node)
        let scanTimeout = null;
        const observer = new MutationObserver(function () {
            if (scanTimeout) return;
            scanTimeout = setTimeout(() => {
                _scanAndRemove();
                scanTimeout = null;
            }, 500); // Reduced to 500ms for faster popup detection
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Periodic scan as backup using requestIdleCallback for minimal CPU impact
        function _scheduleIdleScan() {
            if (document.hidden) {
                setTimeout(_scheduleIdleScan, 5000);
                return;
            }

            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(function () {
                    _scanAndRemove();
                    setTimeout(_scheduleIdleScan, 5000); // More frequent: every 5s
                }, { timeout: 2000 });
            } else {
                setTimeout(function () {
                    _scanAndRemove();
                    _scheduleIdleScan();
                }, 5000);
            }
        }
        _scheduleIdleScan();

        _log('Anti-adblock popup blocker active', 'success');
    }

    // Start initialization
    _initPopupBlocker();
}

/**
 * Main initialization function
 */
function _init() {
    if (!_bootstrap()) return;

    _declareState(window);

    // Listen for initial accumulated count from bridge
    document.addEventListener('ttvab-init-count', function (e) {
        if (e.detail && typeof e.detail.count === 'number') {
            _S.adsBlocked = e.detail.count;
            // Sync to workers to prevent race condition reset
            for (const worker of _S.workers) {
                worker.postMessage({ key: 'UpdateAdsBlocked', value: _S.adsBlocked });
            }
            _log('Restored ads blocked count: ' + _S.adsBlocked, 'info');
        }
    });

    // Listen for initial popups count from bridge
    document.addEventListener('ttvab-init-popups-count', function (e) {
        if (e.detail && typeof e.detail.count === 'number') {
            _S.popupsBlocked = e.detail.count;
            _log('Restored popups blocked count: ' + _S.popupsBlocked, 'info');
        }
    });

    _hookStorage();
    _hookWorker();
    _hookMainFetch();
    _initToggleListener();
    _initCrashMonitor();
    _blockAntiAdblockPopup();
    _initAchievementListener();
    _showWelcome();
    _showDonation();

    // Request state sync from bridge (Handshake)
    document.dispatchEvent(new CustomEvent('ttvab-request-state'));

    _log('Initialized successfully', 'success');
}
