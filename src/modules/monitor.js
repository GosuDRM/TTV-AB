// TTV AB - Monitor

function _initCrashMonitor() {
    let isRefreshing = false;
    let checkInterval = null;

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

    function handleCrash(error) {
        if (isRefreshing) return;
        isRefreshing = true;

        _log('Player crash: ' + error, 'error');

        if (document.hidden) {
            _log('Tab hidden, will refresh when visible', 'warning');

            document.addEventListener('visibilitychange', function onVisible() {
                if (!document.hidden) {
                    document.removeEventListener('visibilitychange', onVisible);
                    _log('Tab visible, refreshing...', 'warning');
                    window.location.reload();
                }
            });
        } else {
            _log('Auto-refreshing...', 'warning');

            const banner = document.createElement('div');
            banner.innerHTML = `
                <style>
                    #ttvab-refresh-notice{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#f44336 0%,#d32f2f 100%);color:#fff;padding:12px 24px;border-radius:8px;font-family:'Segoe UI',sans-serif;font-size:14px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:9999999;animation:ttvab-pulse 1s ease infinite}
                    @keyframes ttvab-pulse{0%,100%{opacity:1}50%{opacity:.7}}
                </style>
                <div id="ttvab-refresh-notice">⚠️ Player crashed - Refreshing...</div>
            `;
            document.body.appendChild(banner);

            setTimeout(() => window.location.reload(), _C.REFRESH_DELAY);
        }
    }

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
                    observer.disconnect();
                    if (checkInterval) clearInterval(checkInterval);
                }
            } catch { }
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
                    observer.disconnect();
                    clearInterval(checkInterval);
                }
            } catch { }
        }, 5000);

        _log('Crash monitor active', 'info');
    }

    start();
}
