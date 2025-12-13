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
    window.addEventListener('message', function (e) {
        if (e.source !== window) return;
        if (e.data?.type === 'ttvab-toggle') {
            const enabled = e.data.detail?.enabled ?? true;
            IsAdStrippingEnabled = enabled;
            // Broadcast to workers
            for (const worker of _S.workers) {
                worker.postMessage({ key: 'UpdateToggleState', value: enabled });
            }
            _log('Ad blocking ' + (enabled ? 'enabled' : 'disabled'), enabled ? 'success' : 'warning');
        }
    });
}

/**
 * Block anti-adblock popups using aggressive DOM detection
 * Uses multiple strategies for maximum effectiveness
 */
function _blockAntiAdblockPopup() {
    // Track if we've already blocked a popup recently (avoid duplicate logs)
    let lastBlockTime = 0;

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

        // Inject CSS for proactive blocking
        if (!document.getElementById('ttvab-popup-style')) {
            const style = document.createElement('style');
            style.id = 'ttvab-popup-style';
            style.textContent = `
                div[data-test-selector="ad-banner"],
                div[data-a-target="consent-banner"] {
                    display: none !important;
                    visibility: hidden !important;
                }
            `;
            document.head.appendChild(style);
        }

        /**
         * Increment popup blocked counter and dispatch event
         */
        function _incrementPopupsBlocked() {
            const now = Date.now();
            if (now - lastBlockTime < 1000) return; // Debounce 1 second
            lastBlockTime = now;

            _S.popupsBlocked++;
            // Use window.postMessage to cross MAIN→ISOLATED world boundary
            window.postMessage({
                type: 'ttvab-popup-blocked',
                detail: { count: _S.popupsBlocked }
            }, '*');
            _log('Popup blocked! Total: ' + _S.popupsBlocked, 'success');
        }

        /**
         * Check if element or its children contain anti-adblock text
         */
        function _hasAdblockText(el) {
            const text = (el.textContent || '').toLowerCase();
            return (
                text.includes('allow twitch ads') ||
                text.includes('try turbo') ||
                text.includes('commercials') ||
                text.includes('whitelist') ||
                text.includes('ad blocker') ||
                (text.includes('support') && (text.includes('ads') || text.includes('ad block'))) ||
                (text.includes('disable') && (text.includes('extension') || text.includes('ad block'))) ||
                (text.includes('viewers watch ads') && text.includes('turbo'))
            );
        }

        /**
         * Safelist: Elements matching these selectors should NEVER be hidden
         * This protects chat, video player, and main layout components
         */
        const SAFELIST_SELECTORS = [
            '[data-a-target="chat-scroller"]',
            '[data-a-target="right-column-chat-bar"]',
            '[data-test-selector="chat-room-component"]',
            '[class*="chat-room"]',
            '[class*="chat-shell"]',
            '[class*="right-column"]',
            '[class*="RightColumn"]',
            '[class*="ChatShell"]',
            '[class*="ChatRoom"]',
            '[class*="video-player"]',
            '[class*="VideoPlayer"]',
            '[data-a-target="video-player"]',
            'video'
        ];

        /**
         * Check if element or any ancestor matches safelist
         */
        function _isSafeElement(el) {
            if (!el) return false;
            for (const selector of SAFELIST_SELECTORS) {
                try {
                    // Check if element itself matches
                    if (el.matches && el.matches(selector)) return true;
                    // Check if element contains any safelisted elements
                    if (el.querySelector && el.querySelector(selector)) return true;
                } catch { /* Invalid selector */ }
            }
            return false;
        }

        /**
         * Find and remove the popup by looking for specific patterns
         */
        function _scanAndRemove() {
            // Strategy 1: Find buttons AND headers with adblock text
            // Twitch sometimes uses divs or anchors as buttons
            const detectionNodes = document.querySelectorAll('button, [role="button"], a, div[class*="Button"], h1, h2, h3, h4, div[class*="Header"], p, span');

            for (const node of detectionNodes) {
                // Optimization: Skip small elements unless they are buttons
                if (node.tagName === 'SPAN' && node.textContent.length < 10) continue;

                // SKIP: Element is already hidden or processed
                if (node.offsetParent === null || node.hasAttribute('data-ttvab-blocked')) continue;

                // SKIP: Element is inside a safelisted component (e.g., chat)
                if (_isSafeElement(node) || node.closest('[class*="chat"]') || node.closest('[class*="Chat"]')) continue;

                if (_hasAdblockText(node)) {
                    const nodeText = (node.textContent || '').trim().substring(0, 50);
                    _log('Found adblock text in <' + node.tagName + '>: "' + nodeText + '"', 'warning');

                    // Mark this node as processed so we don't scan it again
                    node.setAttribute('data-ttvab-blocked', 'true');

                    // Walk up the DOM to find the popup container
                    let popup = node.parentElement;
                    let attempts = 0;

                    // Walk up max 20 levels to find a suitable container
                    while (popup && attempts < 20) {
                        // SAFETY CHECK: Stop if we hit a safelisted element
                        if (_isSafeElement(popup)) {
                            _log('Skipping - hit safelisted element: ' + (popup.className || popup.tagName), 'info');
                            break;
                        }

                        // Check if this element looks like a popup
                        const style = window.getComputedStyle(popup);
                        const isOverlay = style.position === 'fixed' || style.position === 'absolute';
                        const hasBackground = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
                        const isLarge = popup.offsetWidth > 200 && popup.offsetHeight > 100;
                        const hasZIndex = parseInt(style.zIndex) > 100;
                        
                        // More specific popup class detection - require stronger signals
                        // 'Layer' and 'Overlay' alone are too broad (used by chat sidebar)
                        const className = (popup.className && typeof popup.className === 'string') ? popup.className : '';
                        const isPopupClass = (
                            (className.includes('ScAttach') && className.includes('Balloon')) ||
                            className.includes('Modal') ||
                            className.includes('consent') ||
                            className.includes('Consent') ||
                            (className.includes('Overlay') && !className.includes('Column') && !className.includes('Chat')) ||
                            (className.includes('Layer') && className.includes('Balloon'))
                        );

                        // If this looks like a popup container, hide it (don't remove!)
                        if ((isOverlay || hasZIndex || isPopupClass) && (hasBackground || isLarge)) {
                            // Verify it's not the player itself
                            if (popup.querySelector('video')) {
                                popup = popup.parentElement;
                                attempts++;
                                continue;
                            }

                            // FINAL SAFETY: Don't hide if this would affect chat/player
                            if (_isSafeElement(popup)) {
                                _log('Skipping potential popup - contains safelisted content', 'warning');
                                break;
                            }

                            _log('Hiding popup container: ' + (popup.className || popup.tagName), 'success');
                            popup.style.display = 'none';
                            popup.style.visibility = 'hidden';
                            popup.setAttribute('style', (popup.getAttribute('style') || '') + '; display: none !important; visibility: hidden !important;');
                            popup.setAttribute('data-ttvab-blocked', 'true');

                            _incrementPopupsBlocked();
                            return true;
                        }

                        popup = popup.parentElement;
                        attempts++;
                    }

                    // Fallback: Only hide immediate parent with specific popup-like class
                    // Much more conservative than before
                    const fallback = node.closest('div[class*="Balloon"], div[class*="consent"], div[class*="Modal"]');
                    if (fallback && !_isSafeElement(fallback)) {
                        _log('Hiding popup (fallback logic): ' + fallback.className, 'warning');
                        fallback.style.display = 'none';
                        fallback.setAttribute('style', (fallback.getAttribute('style') || '') + '; display: none !important;');
                        fallback.setAttribute('data-ttvab-blocked', 'true');
                        _incrementPopupsBlocked();
                        return true;
                    }
                }
            }

            // Strategy 2: Scan for known Twitch popup class patterns
            const popupSelectors = [
                'div[class*="ScAttach"][class*="ScBalloon"]',
                'div[class*="tw-balloon"]',
                'div[class*="consent"]',
                'div[data-a-target="consent-banner"]',
                'div[data-test-selector="ad-banner"]',
                'div[class*="Layout"][class*="Overlay"]'
            ];

            for (const selector of popupSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        if (_hasAdblockText(el)) {
                            _log('Hiding popup by selector: ' + selector, 'success');
                            el.style.display = 'none';
                            el.setAttribute('style', (el.getAttribute('style') || '') + '; display: none !important;');
                            _incrementPopupsBlocked();
                            return true;
                        }
                    }
                } catch {
                    // Invalid selector, skip
                }
            }

            // Strategy 3: Find fixed/absolute positioned elements with adblock text
            const overlays = document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"], div[style*="z-index"]');
            for (const el of overlays) {
                if (_hasAdblockText(el) && el.offsetWidth > 200 && el.offsetHeight > 100) {
                    // Safety check: don't hide player
                    if (el.querySelector('video')) continue;

                    _log('Hiding popup overlay', 'success');
                    el.style.display = 'none';
                    el.setAttribute('style', (el.getAttribute('style') || '') + '; display: none !important;');
                    _incrementPopupsBlocked();
                    return true;
                }
            }

            return false;
        }

        // Initial scan
        if (_scanAndRemove()) {
            _log('Popup removed on initial scan', 'success');
        }

        // Watch for new popups - scan on any DOM change
        let debounceTimer = null;
        const observer = new MutationObserver(function (mutations) {
            // Quick check if any added nodes might be a popup
            let shouldScan = false;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) { // Element node
                        shouldScan = true;
                        break;
                    }
                }
                if (shouldScan) break;
            }

            if (!shouldScan) return;

            // Debounce scan to reduce CPU usage
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                _scanAndRemove();
                debounceTimer = null;
            }, 500);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Periodic scan as backup (every 500ms when visible, 2s when hidden)
        function _scheduleIdleScan() {
            const delay = document.hidden ? 2000 : 500;
            setTimeout(() => {
                if (!document.hidden) {
                    _scanAndRemove();
                }
                _scheduleIdleScan();
            }, delay);
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

    // Listen for initial accumulated count from bridge via window.postMessage
    window.addEventListener('message', function (e) {
        if (e.source !== window) return;
        if (!e.data?.type?.startsWith('ttvab-init-')) return;

        if (e.data.type === 'ttvab-init-count' && typeof e.data.detail?.count === 'number') {
            _S.adsBlocked = e.data.detail.count;
            // Sync to workers to prevent race condition reset
            for (const worker of _S.workers) {
                worker.postMessage({ key: 'UpdateAdsBlocked', value: _S.adsBlocked });
            }
            _log('Restored ads blocked count: ' + _S.adsBlocked, 'info');
        }

        if (e.data.type === 'ttvab-init-popups-count' && typeof e.data.detail?.count === 'number') {
            _S.popupsBlocked = e.data.detail.count;
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

    // Enhanced player features
    _hookVisibilityState();
    _hookLocalStoragePreservation();
    if (_C.BUFFERING_FIX) {
        _monitorPlayerBuffering();
    }

    _showWelcome();
    _showDonation();

    // Request state sync from bridge (Handshake)
    window.postMessage({ type: 'ttvab-request-state' }, '*');

    _log('Initialized successfully', 'success');
}
