/**
 * TTV AB - UI Module
 * Toast notifications and user interface
 * @module ui
 * @private
 */

/** @type {string} Storage key for donation reminder */
const _REMINDER_KEY = 'ttvab_last_reminder';
/** @type {number} Reminder interval (24 hours) */
const _REMINDER_INTERVAL = 86400000;
/** @type {string} Storage key for first run */
const _FIRST_RUN_KEY = 'ttvab_first_run_shown';

/**
 * Show donation reminder toast
 */
function _showDonation() {
    try {
        const lastReminder = localStorage.getItem(_REMINDER_KEY);
        const now = Date.now();

        if (lastReminder && (now - parseInt(lastReminder, 10)) < _REMINDER_INTERVAL) return;

        setTimeout(() => {
            const toast = document.createElement('div');
            toast.id = 'ttvab-reminder';
            toast.innerHTML = `
                <style>
                    #ttvab-reminder{position:fixed;bottom:20px;right:20px;background:linear-gradient(135deg,#9146FF 0%,#772CE8 100%);color:#fff;padding:16px 20px;border-radius:12px;font-family:'Segoe UI',sans-serif;font-size:14px;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:999999;animation:ttvab-slide .3s ease}
                    @keyframes ttvab-slide{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
                    #ttvab-reminder-close{position:absolute;top:8px;right:10px;background:none;border:none;color:rgba(255,255,255,.7);font-size:18px;cursor:pointer;padding:0;line-height:1}
                    #ttvab-reminder-close:hover{color:#fff}
                    #ttvab-reminder-btn{display:inline-block;margin-top:10px;padding:8px 16px;background:#fff;color:#772CE8;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px}
                    #ttvab-reminder-btn:hover{background:#f0f0f0}
                </style>
                <button id="ttvab-reminder-close">×</button>
                <div style="margin-bottom:4px;font-weight:600">💜 Enjoying TTV AB?</div>
                <div style="opacity:.9">If this extension saves you from ads, consider buying me a coffee!</div>
                <button id="ttvab-reminder-btn">Support the Developer</button>
            `;

            document.body.appendChild(toast);
            localStorage.setItem(_REMINDER_KEY, now.toString());

            document.getElementById('ttvab-reminder-close').onclick = () => toast.remove();
            document.getElementById('ttvab-reminder-btn').onclick = () => {
                window.open('https://paypal.me/GosuDRM', '_blank');
                toast.remove();
            };

            // Auto-hide after 15 seconds
            setTimeout(() => {
                if (document.getElementById('ttvab-reminder')) {
                    toast.style.animation = 'ttvab-slide .3s ease reverse';
                    setTimeout(() => toast.remove(), 300);
                }
            }, 15000);
        }, 5000);
    } catch (e) {
        _log('Donation reminder error: ' + e.message, 'error');
    }
}

/**
 * Show welcome message on first install
 */
function _showWelcome() {
    try {
        if (localStorage.getItem(_FIRST_RUN_KEY)) return;

        setTimeout(() => {
            const toast = document.createElement('div');
            toast.id = 'ttvab-welcome';
            toast.innerHTML = `
                <style>
                    #ttvab-welcome{position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#9146FF 0%,#772CE8 100%);color:#fff;padding:20px 24px;border-radius:16px;font-family:'Segoe UI',sans-serif;font-size:14px;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,.4);z-index:999999;animation:ttvab-welcome .4s ease}
                    @keyframes ttvab-welcome{from{opacity:0;transform:translateY(-20px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
                    #ttvab-welcome-close{position:absolute;top:10px;right:12px;background:none;border:none;color:rgba(255,255,255,.7);font-size:20px;cursor:pointer;padding:0;line-height:1}
                    #ttvab-welcome-close:hover{color:#fff}
                    #ttvab-welcome h3{margin:0 0 8px;font-size:18px}
                    #ttvab-welcome p{margin:0 0 12px;opacity:.9;line-height:1.4}
                    #ttvab-welcome .pin-tip{background:rgba(255,255,255,.15);padding:10px 12px;border-radius:8px;font-size:13px}
                    #ttvab-welcome .pin-tip strong{color:#fff}
                </style>
                <button id="ttvab-welcome-close">×</button>
                <h3>🎉 TTV AB Installed!</h3>
                <p>Ads will now be blocked automatically on Twitch streams.</p>
                <div class="pin-tip">
                    <strong>💡 Tip:</strong> Pin this extension for easy access!<br>
                    Click 🧩 → Find TTV AB → Click 📌
                </div>
            `;

            document.body.appendChild(toast);
            localStorage.setItem(_FIRST_RUN_KEY, 'true');

            const closeHandler = () => {
                toast.style.animation = 'ttvab-welcome .3s ease reverse';
                setTimeout(() => toast.remove(), 300);
            };

            document.getElementById('ttvab-welcome-close').onclick = closeHandler;

            // Auto-hide after 20 seconds
            setTimeout(() => {
                if (document.getElementById('ttvab-welcome')) closeHandler();
            }, 20000);
        }, 2000);
    } catch (e) {
        _log('Welcome message error: ' + e.message, 'error');
    }
}
