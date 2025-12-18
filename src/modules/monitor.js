/**
 * TTV AB - Monitor Module
 * Player crash detection and auto-refresh
 * @module monitor
 * @private
 */

/**
 * Initialize player crash monitoring
 */
function _initCrashMonitor() {
    let isRefreshing = false;
    let checkInterval = null;
    let reloadAttempts = 0;

    /**
     * Detect crash patterns in page content
     * @returns {string|null} Matched error pattern or null
     */
    function detectCrash() {
        const errorElements = document.querySelectorAll(
            '[data-a-target="player-overlay-content-gate"],' +
            '[data-a-target="player-error-modal"],' +
            '.content-overlay-gate,' +
            '.player-error'
        );

        for (const el of errorElements) {
            const text = (el.innerText || '').toLowerCase();
            const patterns = _C.CRASH_PATTERNS;
            for (let i = 0, len = patterns.length; i < len; i++) {
                if (text.includes(patterns[i].toLowerCase())) return patterns[i];
            }
        }

        return null;
    }

    /**
     * Handle detected crash
     * @param {string} error - Error message
     */
    function handleCrash(error) {
        if (isRefreshing) return;
        isRefreshing = true;

        // Try soft reload first (up to 3 times)
        if (reloadAttempts < 3) {
            reloadAttempts++;
            _log('Player crash detected (' + error + '). Attempting soft reload ' + reloadAttempts + '/3...', 'warning');

            // Show a temporary toast for feedback
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:4px;z-index:99999;font-family:sans-serif;font-size:12px;pointer-events:none;transition:opacity 0.5s';
            toast.textContent = 'TTV AB: Fixing player... (' + reloadAttempts + ')';
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 2000);

            if (typeof _doPlayerTask === 'function') {
                _doPlayerTask(false, true);
            }

            // Reset refreshing flag after delay to allow recovery
            setTimeout(() => {
                isRefreshing = false;
            }, 3000);
            return;
        }

        // Full Page Reload (Fallback)
        _log('Player crash detected: ' + error, 'error');

        if (document.hidden) {
            _log('Tab is hidden, will refresh when tab becomes visible...', 'warning');

            document.addEventListener('visibilitychange', function onVisible() {
                if (!document.hidden) {
                    document.removeEventListener('visibilitychange', onVisible);
                    _log('Tab now visible, refreshing...', 'warning');
                    window.location.reload();
                }
            });
        } else {
            _log('Auto-refreshing in ' + (_C.REFRESH_DELAY / 1000) + 's...', 'warning');

            const banner = document.createElement('div');
            banner.innerHTML = `
                <style>
                    #ttvab-refresh-notice{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#f44336 0%,#d32f2f 100%);color:#fff;padding:12px 24px;border-radius:8px;font-family:'Segoe UI',sans-serif;font-size:14px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:9999999;animation:ttvab-pulse 1s ease infinite}
                    @keyframes ttvab-pulse{0%,100%{opacity:1}50%{opacity:.7}}
                </style>
                <div id="ttvab-refresh-notice">⚠️ Player crashed - Refreshing automatically...</div>
            `;
            document.body.appendChild(banner);

            setTimeout(() => window.location.reload(), _C.REFRESH_DELAY);
        }
    }


    /**
     * Start monitoring
     */
    function start() {
        if (!document.body) {
            setTimeout(start, 100);
            return;
        }

        let lastCheck = 0;
        const observer = new MutationObserver(() => {
            try {
                const now = Date.now();
                if (now - lastCheck < 2000) return;
                lastCheck = now;

                const error = detectCrash();
                if (error) {
                    handleCrash(error);
                    // Only disconnect if we are doing a full page reload (exhausted attempts)
                    if (reloadAttempts >= 3) {
                        observer.disconnect();
                        if (checkInterval) clearInterval(checkInterval);
                    }
                } else {
                    // Healthy state, reset attempts
                    if (reloadAttempts > 0) reloadAttempts = 0;
                }
            } catch { /* Ignore */ }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        checkInterval = setInterval(() => {
            if (document.hidden) return;
            try {
                const error = detectCrash();
                if (error) {
                    handleCrash(error);
                    if (reloadAttempts >= 3) {
                        observer.disconnect();
                        clearInterval(checkInterval);
                    }
                } else {
                    if (reloadAttempts > 0) reloadAttempts = 0;
                }
            } catch {
                // Ignore monitor errors to keep extension alive
            }
        }, 5000);

        _log('Player crash monitor active', 'info');
    }

    start();
}
