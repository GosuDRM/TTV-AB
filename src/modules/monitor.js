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

    /**
     * Detect crash patterns in page content
     * @returns {string|null} Matched error pattern or null
     */
    function detectCrash() {
        // Optimized: Removed full body innerText check.
        // 1. innerText triggers expensive Layout Reflow (bad for battery/perf)
        // 2. Body check causes false positives if error text appears in chat
        // We rely solely on specific error element selectors below.

        // Check specific error elements (efficient)
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

        _log('Player crash detected: ' + error, 'error');
        _log('Auto-refreshing in ' + (_C.REFRESH_DELAY / 1000) + 's...', 'warning');

        // Show notification banner
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

    /**
     * Start monitoring
     */
    function start() {
        if (!document.body) {
            setTimeout(start, 100);
            return;
        }

        // MutationObserver for real-time detection
        let lastCheck = 0;
        const observer = new MutationObserver(() => {
            try {
                // PERF: Throttle checks to max once per 2 seconds to save battery
                const now = Date.now();
                if (now - lastCheck < 2000) return;
                lastCheck = now;

                const error = detectCrash();
                if (error) {
                    handleCrash(error);
                    observer.disconnect();
                    if (checkInterval) clearInterval(checkInterval);
                }
            } catch (e) { /* Ignore */ }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Fallback interval check
        checkInterval = setInterval(() => {
            if (document.hidden) return;
            try {
                const error = detectCrash();
                if (error) {
                    handleCrash(error);
                    observer.disconnect();
                    clearInterval(checkInterval);
                }
            } catch (e) {
                // Ignore monitor errors to keep extension alive
            }
        }, 5000);

        _log('Player crash monitor active', 'info');
    }

    start();
}
