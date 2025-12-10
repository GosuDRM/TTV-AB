/**
 * TTV AB - Monitor Module
 * Player crash detection and auto-refresh
 * @private
 */
function _initCrashMonitor() {
    let refreshing = false, interval = null;

    function detect() {
        const text = document.body?.innerText || '';
        for (const p of _C.CRASH_PATTERNS) {
            if (text.toLowerCase().includes(p.toLowerCase())) return p;
        }
        const els = document.querySelectorAll('[data-a-target="player-overlay-content-gate"],[data-a-target="player-error-modal"],.content-overlay-gate,.player-error');
        for (const el of els) {
            const t = el.innerText || '';
            for (const p of _C.CRASH_PATTERNS) {
                if (t.toLowerCase().includes(p.toLowerCase())) return p;
            }
        }
        return null;
    }

    function handle(err) {
        if (refreshing) return;
        refreshing = true;
        _log('Player crash detected: ' + err, 'error');
        _log('Auto-refreshing in ' + (_C.REFRESH_DELAY / 1000) + 's...', 'warning');
        const t = document.createElement('div');
        t.innerHTML = `<style>#ttvab-refresh-notice{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#f44336 0%,#d32f2f 100%);color:#fff;padding:12px 24px;border-radius:8px;font-family:'Segoe UI',sans-serif;font-size:14px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:9999999;animation:ttvab-p 1s ease infinite}@keyframes ttvab-p{0%,100%{opacity:1}50%{opacity:.7}}</style><div id="ttvab-refresh-notice">⚠️ Player crashed - Refreshing automatically...</div>`;
        document.body.appendChild(t);
        setTimeout(() => window.location.reload(), _C.REFRESH_DELAY);
    }

    const obs = new MutationObserver(() => {
        const e = detect();
        if (e) { handle(e); obs.disconnect(); if (interval) clearInterval(interval); }
    });

    function start() {
        if (document.body) {
            obs.observe(document.body, { childList: true, subtree: true, characterData: true });
            interval = setInterval(() => {
                const e = detect();
                if (e) { handle(e); obs.disconnect(); clearInterval(interval); }
            }, 5000);
            _log('Player crash monitor active', 'info');
        } else {
            setTimeout(start, 100);
        }
    }
    start();
}
