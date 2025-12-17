/**
 * TTV AB - UI Module
 * Toast notifications and user interface
 * @module ui
 * @private
 */

/** @type {string} Storage key for donation reminder */
const _REMINDER_KEY = 'ttvab_last_reminder';
/** @type {number} Reminder interval (72 hours) */
const _REMINDER_INTERVAL = 259200000;
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

            setTimeout(() => {
                if (document.getElementById('ttvab-welcome')) closeHandler();
            }, 10000);
        }, 2000);
    } catch (e) {
        _log('Welcome message error: ' + e.message, 'error');
    }
}

/**
 * Achievement definitions for notification display
 * @type {Object}
 */
const _ACHIEVEMENT_INFO = {
    'first_block': { name: 'Ad Slayer', icon: '⚔️', desc: 'Blocked your first ad!' },
    'block_10': { name: 'Blocker', icon: '🛡️', desc: 'Blocked 10 ads!' },
    'block_100': { name: 'Guardian', icon: '🔰', desc: 'Blocked 100 ads!' },
    'block_500': { name: 'Sentinel', icon: '🏰', desc: 'Blocked 500 ads!' },
    'block_1000': { name: 'Legend', icon: '🏆', desc: 'Blocked 1000 ads!' },
    'block_5000': { name: 'Mythic', icon: '👑', desc: 'Blocked 5000 ads!' },
    'popup_10': { name: 'Popup Crusher', icon: '💥', desc: 'Blocked 10 popups!' },
    'popup_50': { name: 'Popup Destroyer', icon: '🔥', desc: 'Blocked 50 popups!' },
    'time_1h': { name: 'Hour Saver', icon: '⏱️', desc: 'Saved 1 hour from ads!' },
    'time_10h': { name: 'Time Master', icon: '⏰', desc: 'Saved 10 hours from ads!' },
    'channels_5': { name: 'Explorer', icon: '📺', desc: 'Blocked ads on 5 channels!' },
    'channels_20': { name: 'Adventurer', icon: '🌍', desc: 'Blocked ads on 20 channels!' }
};

/**
 * Show achievement unlocked notification
 * @param {string} achievementId - The achievement ID that was unlocked
 */
function _showAchievementUnlocked(achievementId) {
    try {
        const ach = _ACHIEVEMENT_INFO[achievementId];
        if (!ach) return;

        const existing = document.getElementById('ttvab-achievement');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'ttvab-achievement';
        toast.innerHTML = `
            <style>
                #ttvab-achievement{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:#fff;padding:16px 24px;border-radius:16px;font-family:'Segoe UI',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5),0 0 20px rgba(145,70,255,.3);z-index:9999999;animation:ttvab-ach-pop .5s cubic-bezier(0.34,1.56,0.64,1);border:2px solid rgba(145,70,255,.5);display:flex;align-items:center;gap:16px}
                @keyframes ttvab-ach-pop{from{opacity:0;transform:translateX(-50%) scale(.5) translateY(-20px)}to{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}}
                @keyframes ttvab-ach-glow{0%,100%{box-shadow:0 0 10px rgba(145,70,255,.3)}50%{box-shadow:0 0 25px rgba(145,70,255,.6)}}
                @keyframes ttvab-ach-shine{0%{background-position:-200% center}100%{background-position:200% center}}
                #ttvab-achievement .ach-icon{font-size:40px;animation:ttvab-ach-bounce 1s ease infinite}
                @keyframes ttvab-ach-bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
                #ttvab-achievement .ach-content{display:flex;flex-direction:column;gap:2px}
                #ttvab-achievement .ach-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#9146FF;font-weight:600}
                #ttvab-achievement .ach-name{font-size:18px;font-weight:700;background:linear-gradient(90deg,#fff 0%,#9146FF 50%,#fff 100%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:ttvab-ach-shine 2s linear infinite}
                #ttvab-achievement .ach-desc{font-size:12px;color:#aaa;margin-top:2px}
            </style>
            <div class="ach-icon">${ach.icon}</div>
            <div class="ach-content">
                <div class="ach-label">🏆 Achievement Unlocked!</div>
                <div class="ach-name">${ach.name}</div>
                <div class="ach-desc">${ach.desc}</div>
            </div>
        `;

        document.body.appendChild(toast);
        _log('Achievement unlocked: ' + ach.name, 'success');

        setTimeout(() => {
            if (document.getElementById('ttvab-achievement')) {
                toast.style.animation = 'ttvab-ach-pop .3s ease reverse';
                setTimeout(() => toast.remove(), 300);
            }
        }, 4000);
    } catch (e) {
        _log('Achievement notification error: ' + e.message, 'error');
    }
}

/**
 * Initialize achievement unlock listener
 * Uses window.addEventListener('message') to receive from ISOLATED world
 */
function _initAchievementListener() {
    window.addEventListener('message', function (e) {
        if (e.data?.type === 'ttvab-achievement-unlocked' && e.data.detail?.id) {
            _showAchievementUnlocked(e.data.detail.id);
        }
    });
}
