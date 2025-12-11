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
    // Wait for DOM to be ready before setting up observers
    function _initPopupBlocker() {
        if (!document.body) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', _initPopupBlocker, { once: true });
            } else {
                setTimeout(_initPopupBlocker, 50);
            }
            return;
        }

        /**
         * Increment popup blocked counter and dispatch event
         */
        function _incrementPopupsBlocked() {
            _S.popupsBlocked++;
            // Use window.postMessage to cross MAIN→ISOLATED world boundary
            window.postMessage({
                type: 'ttvab-popup-blocked',
                detail: { count: _S.popupsBlocked }
            }, '*');
            _log('Popup blocked! Count: ' + _S.popupsBlocked, 'success');
        }

        /**
         * Find and remove the popup by looking for specific button text
         * This is the most reliable method - find buttons, walk up to popup container
         */
        function _scanAndRemove() {
            // Strategy 1: Find buttons with exact anti-adblock text
            const allButtons = document.querySelectorAll('button');
            for (const btn of allButtons) {
                const btnText = (btn.textContent || '').trim().toLowerCase();

                // Check for the exact popup buttons
                if (btnText === 'allow twitch ads' || btnText === 'try turbo') {
                    _log('Found anti-adblock button: "' + btnText + '"', 'warning');

                    // Walk up the DOM to find the popup container
                    let popup = btn.parentElement;
                    let attempts = 0;

                    // Walk up max 10 levels to find a suitable container
                    while (popup && attempts < 10) {
                        const style = window.getComputedStyle(popup);
                        const isOverlay = style.position === 'fixed' || style.position === 'absolute';
                        const hasBackground = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
                        const isLarge = popup.offsetWidth > 200 && popup.offsetHeight > 100;

                        // If this looks like a popup container, remove it
                        if ((isOverlay || hasBackground) && isLarge) {
                            _log('Removing popup container: ' + popup.className, 'success');
                            popup.remove();
                            _incrementPopupsBlocked();
                            return; // Stop after removing
                        }

                        popup = popup.parentElement;
                        attempts++;
                    }

                    // Fallback: if we couldn't find a good container, just hide the button's closest parent
                    const fallback = btn.closest('div[class]');
                    if (fallback) {
                        _log('Removing popup (fallback)', 'warning');
                        fallback.remove();
                        _incrementPopupsBlocked();
                    }
                }
            }

            // Strategy 2: Find any element with anti-adblock text content
            const textPatterns = [
                'support',
                'by disabling ad block',
                'viewers watch ads',
                'go ad-free'
            ];

            // Check divs that might be popup overlays
            const overlayDivs = document.querySelectorAll('div[class*="ScAttach"], div[class*="Layer"], div[class*="Overlay"], div[style*="position: fixed"], div[style*="position:fixed"]');
            for (const div of overlayDivs) {
                const text = (div.textContent || '').toLowerCase();

                // Check if this div contains multiple anti-adblock keywords
                let matches = 0;
                for (const pattern of textPatterns) {
                    if (text.includes(pattern)) matches++;
                }

                // If 2+ patterns match and has the buttons, it's the popup
                if (matches >= 2 && (text.includes('allow twitch ads') || text.includes('try turbo'))) {
                    _log('Removing popup by text match', 'success');
                    div.remove();
                    _incrementPopupsBlocked();
                    return;
                }
            }
        }

        // Initial scan
        _scanAndRemove();

        // Watch for new popups - scan on any DOM change
        let scanTimeout = null;
        const observer = new MutationObserver(function () {
            if (scanTimeout) return;
            scanTimeout = setTimeout(() => {
                _scanAndRemove();
                scanTimeout = null;
            }, 300); // Fast: 300ms
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Aggressive periodic scan
        function _scheduleIdleScan() {
            if (document.hidden) {
                setTimeout(_scheduleIdleScan, 3000);
                return;
            }

            _scanAndRemove();
            setTimeout(_scheduleIdleScan, 2000); // Every 2 seconds
        }
        setTimeout(_scheduleIdleScan, 1000); // Start after 1s

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
