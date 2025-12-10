/**
 * TTV AB - UI Module
 * Toast notifications and user interface components
 * @private
 */
function _showDonation() {
    const K = 'ttvab_last_reminder', D = 86400000;
    try {
        const last = localStorage.getItem(K), now = Date.now();
        if (last && (now - parseInt(last)) < D) return;
        setTimeout(() => {
            const t = document.createElement('div');
            t.id = 'ttvab-reminder';
            t.innerHTML = `<style>#ttvab-reminder{position:fixed;bottom:20px;right:20px;background:linear-gradient(135deg,#9146FF 0%,#772CE8 100%);color:#fff;padding:16px 20px;border-radius:12px;font-family:'Segoe UI',sans-serif;font-size:14px;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:999999;animation:ttvab-slide .3s ease}@keyframes ttvab-slide{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}#ttvab-reminder-close{position:absolute;top:8px;right:10px;background:none;border:none;color:rgba(255,255,255,.7);font-size:18px;cursor:pointer;padding:0;line-height:1}#ttvab-reminder-close:hover{color:#fff}#ttvab-reminder-btn{display:inline-block;margin-top:10px;padding:8px 16px;background:#fff;color:#772CE8;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px}#ttvab-reminder-btn:hover{background:#f0f0f0}</style><button id="ttvab-reminder-close">×</button><div style="margin-bottom:4px;font-weight:600">💜 Enjoying TTV AB?</div><div style="opacity:.9">If this extension saves you from ads, consider buying me a coffee!</div><button id="ttvab-reminder-btn">Support the Developer</button>`;
            document.body.appendChild(t);
            localStorage.setItem(K, now.toString());
            document.getElementById('ttvab-reminder-close').onclick = () => t.remove();
            document.getElementById('ttvab-reminder-btn').onclick = () => { window.open('https://paypal.me/GosuDRM', '_blank'); t.remove(); };
            setTimeout(() => { if (document.getElementById('ttvab-reminder')) { t.style.animation = 'ttvab-slide .3s ease reverse'; setTimeout(() => t.remove(), 300); } }, 15000);
        }, 5000);
    } catch (e) { }
}

function _showWelcome() {
    const K = 'ttvab_first_run_shown';
    try {
        if (localStorage.getItem(K)) return;
        setTimeout(() => {
            const t = document.createElement('div');
            t.id = 'ttvab-welcome';
            t.innerHTML = `<style>#ttvab-welcome{position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#9146FF 0%,#772CE8 100%);color:#fff;padding:20px 24px;border-radius:16px;font-family:'Segoe UI',sans-serif;font-size:14px;max-width:340px;box-shadow:0 8px 32px rgba(0,0,0,.4);z-index:999999;animation:ttvab-w .4s ease}@keyframes ttvab-w{from{opacity:0;transform:translateY(-20px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}#ttvab-welcome-close{position:absolute;top:10px;right:12px;background:none;border:none;color:rgba(255,255,255,.7);font-size:20px;cursor:pointer;padding:0;line-height:1}#ttvab-welcome-close:hover{color:#fff}#ttvab-welcome h3{margin:0 0 8px;font-size:18px}#ttvab-welcome p{margin:0 0 12px;opacity:.9;line-height:1.4}#ttvab-welcome .pin-tip{background:rgba(255,255,255,.15);padding:10px 12px;border-radius:8px;font-size:13px}#ttvab-welcome .pin-tip strong{color:#fff}</style><button id="ttvab-welcome-close">×</button><h3>🎉 TTV AB Installed!</h3><p>Ads will now be blocked automatically on Twitch streams.</p><div class="pin-tip"><strong>💡 Tip:</strong> Pin this extension for easy access!<br>Click 🧩 → Find TTV AB → Click 📌</div>`;
            document.body.appendChild(t);
            localStorage.setItem(K, 'true');
            document.getElementById('ttvab-welcome-close').onclick = () => { t.style.animation = 'ttvab-w .3s ease reverse'; setTimeout(() => t.remove(), 300); };
            setTimeout(() => { if (document.getElementById('ttvab-welcome')) { t.style.animation = 'ttvab-w .3s ease reverse'; setTimeout(() => t.remove(), 300); } }, 20000);
        }, 2000);
    } catch (e) { }
}
