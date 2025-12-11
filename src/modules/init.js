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
    // Skip if newer version is already running
    if (typeof window.ttvabVersion !== 'undefined' && window.ttvabVersion >= _C.INTERNAL_VERSION) {
        _log('Skipping - another script is active', 'warning');
        return false;
    }

    window.ttvabVersion = _C.INTERNAL_VERSION;
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
    // Selectors that match the anti-adblock popup elements
    const POPUP_SELECTORS = [
        '[data-a-target="player-overlay-click-handler"] + div[class*="ScAttach"]',
        '[class*="consent-banner"]',
        '[class*="AdblockModal"]',
        '[aria-label*="ad block"]',
        '[aria-label*="adblock"]'
    ];

    // Text patterns that indicate anti-adblock content
    // Text patterns that indicate anti-adblock content (pre-compiled for perf)
    const POPUP_REGEXES = [
        /disabling ad block/i,
        /disable ad block/i,
        /allow twitch ads/i,
        /support.*by disabling/i,
        /ad-free with turbo/i,
        /viewers watch ads/i
    ];

    /**
     * Check if element contains anti-adblock content
     * @param {Element} el - Element to check
     * @returns {boolean}
     */
    function _isAntiAdblockElement(el) {
        const text = el.textContent || '';
        if (!text) return false;
        // Optimization: Check includes first for common words before regex
        if (!text.includes('ad') && !text.includes('Ad') && !text.includes('Turbo')) return false;

        return POPUP_REGEXES.some(regex => regex.test(text));
    }

    /**
     * Increment popup blocked counter and dispatch event
     */
    function _incrementPopupsBlocked() {
        _S.popupsBlocked++;
        document.dispatchEvent(new CustomEvent('ttvab-popup-blocked', { detail: { count: _S.popupsBlocked } }));
    }

    /**
     * Remove anti-adblock popup if found
     * @param {Element} el - Element to check and remove
     */
    function _removePopup(el) {
        // Check for modal/overlay containers
        const parent = el.closest('[class*="ScAttach"], [class*="modal"], [class*="overlay"], [role="dialog"]');
        if (parent && _isAntiAdblockElement(parent)) {
            parent.remove();
            _incrementPopupsBlocked();
            _log('Anti-adblock popup removed (Total: ' + _S.popupsBlocked + ')', 'success');
            return true;
        }
        if (_isAntiAdblockElement(el)) {
            el.remove();
            _incrementPopupsBlocked();
            _log('Anti-adblock popup removed (Total: ' + _S.popupsBlocked + ')', 'success');
            return true;
        }
        return false;
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

        // Check buttons with anti-adblock text
        // Optimization: Only check buttons inside potential modal/overlay containers
        const buttons = document.querySelectorAll(
            '[class*="modal"] button, [class*="overlay"] button, [role="dialog"] button, [class*="ScAttach"] button'
        );
        for (const btn of buttons) {
            const text = btn.textContent || '';
            if (!text) continue;

            // Fast check for keywords
            if (text.includes('Twitch') || text.includes('Turbo') || text.includes('ads')) {
                if (/allow twitch ads|try turbo/i.test(text)) {
                    // Find and remove the parent modal/overlay
                    const modal = btn.closest('[class*="ScAttach"], [class*="modal"], [role="dialog"], [class*="Layout"]');
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

    // Watch for new popups
    // Watch for new popups
    // Optimize: Use throttled scan instead of checking every added node (heavy CPU)
    let scanTimeout = null;
    const observer = new MutationObserver(function () {
        if (scanTimeout) return;
        scanTimeout = setTimeout(() => {
            _scanAndRemove();
            scanTimeout = null;
        }, 1000); // Check at most once per second
    });

    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });

    // Periodic scan as backup using requestIdleCallback for minimal CPU impact
    // Falls back to setTimeout if requestIdleCallback is not available
    function _scheduleIdleScan() {
        if (document.hidden) {
            setTimeout(_scheduleIdleScan, 5000); // Check visibility again in 5s
            return;
        }

        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(function () {
                _scanAndRemove();
                setTimeout(_scheduleIdleScan, 10000); // Check every 10s (was 2s)
            }, { timeout: 3000 });
        } else {
            setTimeout(function () {
                _scanAndRemove();
                _scheduleIdleScan();
            }, 10000);
        }
    }
    _scheduleIdleScan();

    _log('Anti-adblocking enabled', 'success');
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
