// TTV AB - UI

const _REMINDER_KEY = "ttvab_last_reminder";
const _REMINDER_NEXT_KEY = "ttvab_next_reminder";
const _REMINDER_CADENCE_KEY = "ttvab_reminder_cadence";
const _REMINDER_MIN_INTERVAL = 604800000;
const _REMINDER_MAX_INTERVAL = 1209600000;
const _FIRST_RUN_KEY = "ttvab_first_run_shown";
const _UI_ICON_SRC =
	"data:image/png;base64,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";
const _UI_FLAGS_KEY = "__TTVAB_UI_FLAGS__";
type UiFlags = {
	achievementListenerInitialized: boolean;
	welcomeScheduled: boolean;
	donationScheduled: boolean;
	donationDelayTimer: ReturnType<typeof setTimeout> | null;
	donationDismissTimer: ReturnType<typeof setTimeout> | null;
	welcomeDelayTimer: ReturnType<typeof setTimeout> | null;
	welcomeDismissTimer: ReturnType<typeof setTimeout> | null;
	achievementDismissTimer: ReturnType<typeof setTimeout> | null;
	achievementRemoveTimer: ReturnType<typeof setTimeout> | null;
};

function _getUiStorageItem(key) {
	try {
		return localStorage.getItem(key);
	} catch (e) {
		_log(`UI storage read error for ${key}: ${e.message}`, "error");
		return null;
	}
}

function _setUiStorageItem(key, value) {
	try {
		localStorage.setItem(key, value);
		return true;
	} catch (e) {
		_log(`UI storage write error for ${key}: ${e.message}`, "error");
		return false;
	}
}

function _getUiFlags(): UiFlags {
	const existing = window[_UI_FLAGS_KEY];
	if (existing && typeof existing === "object") {
		return existing as UiFlags;
	}
	const flags: UiFlags = {
		achievementListenerInitialized: false,
		welcomeScheduled: false,
		donationScheduled: false,
		donationDelayTimer: null,
		donationDismissTimer: null,
		welcomeDelayTimer: null,
		welcomeDismissTimer: null,
		achievementDismissTimer: null,
		achievementRemoveTimer: null,
	};
	window[_UI_FLAGS_KEY] = flags;
	return flags;
}

function _getNextReminderDelayMs() {
	if (_getUiStorageItem(_REMINDER_CADENCE_KEY) === "steady") {
		return _REMINDER_MAX_INTERVAL;
	}
	return Math.round(
		_REMINDER_MIN_INTERVAL +
			Math.random() * (_REMINDER_MAX_INTERVAL - _REMINDER_MIN_INTERVAL),
	);
}

function _showDonation() {
	try {
		const uiFlags = _getUiFlags();
		if (uiFlags.donationScheduled) return;
		const now = Date.now();

		const storedNextAt = Number.parseInt(
			_getUiStorageItem(_REMINDER_NEXT_KEY) || "",
			10,
		);
		let nextAt = Number.isFinite(storedNextAt) ? storedNextAt : null;

		if (nextAt === null) {
			const legacyLastReminder = Number.parseInt(
				_getUiStorageItem(_REMINDER_KEY) || "",
				10,
			);
			nextAt =
				Number.isFinite(legacyLastReminder) && legacyLastReminder <= now
					? legacyLastReminder + _getNextReminderDelayMs()
					: now + _getNextReminderDelayMs();
			_setUiStorageItem(_REMINDER_NEXT_KEY, String(nextAt));
		}

		if (nextAt > now + _REMINDER_MAX_INTERVAL) {
			_setUiStorageItem(
				_REMINDER_NEXT_KEY,
				String(now + _getNextReminderDelayMs()),
			);
			return;
		}

		if (now < nextAt) return;

		uiFlags.donationScheduled = true;
		if (uiFlags.donationDelayTimer) clearTimeout(uiFlags.donationDelayTimer);
		uiFlags.donationDelayTimer = setTimeout(() => {
			uiFlags.donationDelayTimer = null;
			uiFlags.donationScheduled = false;
			if (document.getElementById("ttvab-reminder") || !document.body) return;
			const toast = document.createElement("div");
			toast.id = "ttvab-reminder";
			toast.innerHTML = `
                <style>
                    #ttvab-reminder{position:fixed;bottom:20px;right:20px;z-index:999999;width:320px;max-width:calc(100vw - 40px);padding:16px 18px 18px;border-radius:14px;border:1px solid transparent;background:linear-gradient(165deg,#170734 0%,#0d0220 55%,#130534 100%) padding-box,linear-gradient(120deg,#ff3db4 0%,#9146FF 45%,#2ff0e6 100%) border-box;color:#f1e9ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;box-shadow:0 14px 44px rgba(13,2,32,.65),0 0 26px rgba(145,70,255,.28);overflow:hidden;animation:ttvab-reminder-in .45s cubic-bezier(.21,1.02,.55,1)}
                    @keyframes ttvab-reminder-in{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
                    @keyframes ttvab-reminder-out{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(12px) scale(.97)}}
                    #ttvab-reminder .brand{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-right:24px}
                    #ttvab-reminder .mark{width:22px;height:22px;border-radius:6px;object-fit:cover;display:block;box-shadow:0 0 12px rgba(145,70,255,.55)}
                    #ttvab-reminder .name{font-size:12px;font-weight:800;letter-spacing:.14em;background:linear-gradient(90deg,#ff3db4,#2ff0e6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
                    #ttvab-reminder .pill{margin-left:auto;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#ff3db4;border:1px solid rgba(255,61,180,.45);border-radius:999px;padding:2px 8px;background:rgba(255,61,180,.08)}
                    #ttvab-reminder-close{position:absolute;top:10px;right:12px;background:none;border:none;color:#b7a6e6;font-size:18px;cursor:pointer;padding:2px;line-height:1;transition:color .15s ease}
                    #ttvab-reminder-close:hover{color:#fff}
                    #ttvab-reminder .title{margin:0 0 4px;font-size:16px;font-weight:700;color:#fff}
                    #ttvab-reminder .sub{margin:0 0 14px;color:#b7a6e6;font-size:13px}
                    #ttvab-reminder-btn{display:block;width:100%;padding:10px 16px;background:linear-gradient(120deg,#ff3db4 0%,#9146FF 60%,#772CE8 100%);color:#fff;border:none;border-radius:9px;font-weight:700;cursor:pointer;font-size:13px;letter-spacing:.02em;box-shadow:0 4px 16px rgba(145,70,255,.4);transition:transform .15s ease,box-shadow .15s ease}
                    #ttvab-reminder-btn:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(255,61,180,.45)}
                    #ttvab-reminder .progress{position:absolute;left:0;right:0;bottom:0;height:2px;transform-origin:left;background:linear-gradient(90deg,#ff3db4,#9146FF,#2ff0e6);animation:ttvab-reminder-bar 15s linear forwards}
                    @keyframes ttvab-reminder-bar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
                    @media (prefers-reduced-motion:reduce){#ttvab-reminder{animation:none}#ttvab-reminder .progress{animation:none;transform:scaleX(1)}#ttvab-reminder-btn{transition:none}}
                </style>
                <button id="ttvab-reminder-close" aria-label="Dismiss">×</button>
                <div class="brand">
                    <img class="mark" alt="" />
                    <div class="name">TTV&nbsp;AB</div>
                    <div class="pill">💜 Free</div>
                </div>
                <div class="title">Enjoying ad-free Twitch?</div>
                <p class="sub">TTV AB is free and built by one person. If it keeps the ads away, consider fueling development with a coffee.</p>
                <button id="ttvab-reminder-btn">☕ Support the Developer</button>
                <div class="progress"></div>
            `;

			const markImage = toast.querySelector("img.mark");
			if (markImage instanceof HTMLImageElement) {
				markImage.src = _UI_ICON_SRC;
			}

			document.body.appendChild(toast);
			_setUiStorageItem(_REMINDER_KEY, now.toString());
			_setUiStorageItem(
				_REMINDER_NEXT_KEY,
				String(Date.now() + _getNextReminderDelayMs()),
			);

			const reminderClose = toast.querySelector("#ttvab-reminder-close");
			if (reminderClose) {
				reminderClose.onclick = () => toast.remove();
			}
			const reminderButton = toast.querySelector("#ttvab-reminder-btn");
			if (reminderButton) {
				reminderButton.onclick = () => {
					_setUiStorageItem(_REMINDER_CADENCE_KEY, "steady");
					_setUiStorageItem(
						_REMINDER_NEXT_KEY,
						String(Date.now() + _REMINDER_MAX_INTERVAL),
					);
					window.open(
						"https://ko-fi.com/gosudrm",
						"_blank",
						"noopener,noreferrer",
					);
					if (toast.isConnected) {
						toast.remove();
					}
				};
			}

			if (uiFlags.donationDismissTimer)
				clearTimeout(uiFlags.donationDismissTimer);
			uiFlags.donationDismissTimer = setTimeout(() => {
				uiFlags.donationDismissTimer = null;
				if (toast.isConnected) {
					toast.style.animation = "ttvab-reminder-out .3s ease forwards";
					setTimeout(() => toast.remove(), 300);
				}
			}, 15000);
		}, 5000);
	} catch (e) {
		_log(`Donation reminder error: ${e.message}`, "error");
	}
}

function _showWelcome() {
	try {
		const uiFlags = _getUiFlags();
		if (uiFlags.welcomeScheduled || _getUiStorageItem(_FIRST_RUN_KEY)) return;

		uiFlags.welcomeScheduled = true;
		_setUiStorageItem(_FIRST_RUN_KEY, "true");
		if (uiFlags.welcomeDelayTimer) clearTimeout(uiFlags.welcomeDelayTimer);
		uiFlags.welcomeDelayTimer = setTimeout(() => {
			uiFlags.welcomeDelayTimer = null;
			uiFlags.welcomeScheduled = false;
			if (document.getElementById("ttvab-welcome") || !document.body) return;
			const toast = document.createElement("div");
			toast.id = "ttvab-welcome";
			toast.innerHTML = `
                <style>
                    #ttvab-welcome{position:fixed;top:20px;right:20px;z-index:999999;width:340px;max-width:calc(100vw - 40px);padding:16px 18px 18px;border-radius:14px;border:1px solid transparent;background:linear-gradient(165deg,#170734 0%,#0d0220 55%,#130534 100%) padding-box,linear-gradient(120deg,#ff3db4 0%,#9146FF 45%,#2ff0e6 100%) border-box;color:#f1e9ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;box-shadow:0 14px 44px rgba(13,2,32,.65),0 0 26px rgba(145,70,255,.28);overflow:hidden;animation:ttvab-welcome-in .45s cubic-bezier(.21,1.02,.55,1)}
                    @keyframes ttvab-welcome-in{from{opacity:0;transform:translateY(-14px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
                    @keyframes ttvab-welcome-out{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-10px) scale(.97)}}
                    #ttvab-welcome .brand{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-right:24px}
                    #ttvab-welcome .mark{width:22px;height:22px;border-radius:6px;object-fit:cover;display:block;box-shadow:0 0 12px rgba(145,70,255,.55)}
                    #ttvab-welcome .name{font-size:12px;font-weight:800;letter-spacing:.14em;background:linear-gradient(90deg,#ff3db4,#2ff0e6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
                    #ttvab-welcome .pill{margin-left:auto;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#2ff0e6;border:1px solid rgba(47,240,230,.45);border-radius:999px;padding:2px 8px;background:rgba(47,240,230,.08)}
                    #ttvab-welcome-close{position:absolute;top:10px;right:12px;background:none;border:none;color:#b7a6e6;font-size:18px;cursor:pointer;padding:2px;line-height:1;transition:color .15s ease}
                    #ttvab-welcome-close:hover{color:#fff}
                    #ttvab-welcome .title{margin:0 0 4px;font-size:17px;font-weight:700;color:#fff}
                    #ttvab-welcome .sub{margin:0 0 12px;color:#b7a6e6}
                    #ttvab-welcome .pin-tip{display:flex;align-items:flex-start;gap:10px;background:rgba(46,18,84,.5);border:1px solid rgba(145,70,255,.35);border-radius:10px;padding:10px 12px;font-size:12.5px;color:#d9ccff}
                    #ttvab-welcome .pin-tip .tip-icon{font-size:15px;line-height:1.3}
                    #ttvab-welcome .pin-tip strong{display:block;color:#fff;margin-bottom:1px}
                    #ttvab-welcome .progress{position:absolute;left:0;right:0;bottom:0;height:2px;transform-origin:left;background:linear-gradient(90deg,#ff3db4,#9146FF,#2ff0e6);animation:ttvab-welcome-bar 10s linear forwards}
                    @keyframes ttvab-welcome-bar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
                    @media (prefers-reduced-motion:reduce){#ttvab-welcome{animation:none}#ttvab-welcome .progress{animation:none;transform:scaleX(1)}}
                </style>
                <button id="ttvab-welcome-close" aria-label="Dismiss">×</button>
                <div class="brand">
                    <img class="mark" alt="" />
                    <div class="name">TTV&nbsp;AB</div>
                    <div class="pill">Active</div>
                </div>
                <div class="title">You're all set</div>
                <p class="sub">Ads on Twitch streams and VODs are now blocked automatically — nothing to configure.</p>
                <div class="pin-tip">
                    <span class="tip-icon">📌</span>
                    <span><strong>Pin for quick access</strong>Click the 🧩 toolbar menu, find TTV&nbsp;AB, then hit the pin.</span>
                </div>
                <div class="progress"></div>
            `;

			const markImage = toast.querySelector("img.mark");
			if (markImage instanceof HTMLImageElement) {
				markImage.src = _UI_ICON_SRC;
			}

			document.body.appendChild(toast);

			const closeHandler = () => {
				toast.style.animation = "ttvab-welcome-out .3s ease forwards";
				setTimeout(() => toast.remove(), 300);
			};

			const welcomeClose = toast.querySelector("#ttvab-welcome-close");
			if (welcomeClose) {
				welcomeClose.onclick = closeHandler;
			}

			if (uiFlags.welcomeDismissTimer)
				clearTimeout(uiFlags.welcomeDismissTimer);
			uiFlags.welcomeDismissTimer = setTimeout(() => {
				uiFlags.welcomeDismissTimer = null;
				if (toast.isConnected) closeHandler();
			}, 10000);
		}, 2000);
	} catch (e) {
		_log(`Welcome message error: ${e.message}`, "error");
	}
}

const _ACHIEVEMENT_INFO = {
	first_block: { name: "Ad Slayer", icon: "⚔️", desc: "Blocked your first ad!" },
	block_10: { name: "Blocker", icon: "🛡️", desc: "Blocked 10 ads!" },
	block_100: { name: "Guardian", icon: "🔰", desc: "Blocked 100 ads!" },
	block_500: { name: "Sentinel", icon: "🏰", desc: "Blocked 500 ads!" },
	block_1000: { name: "Legend", icon: "🏆", desc: "Blocked 1000 ads!" },
	block_5000: { name: "Mythic", icon: "👑", desc: "Blocked 5000 ads!" },
	time_1h: { name: "Hour Saver", icon: "⏱️", desc: "Saved 1 hour from ads!" },
	time_10h: {
		name: "Time Master",
		icon: "⏰",
		desc: "Saved 10 hours from ads!",
	},
	channels_5: {
		name: "Explorer",
		icon: "📺",
		desc: "Blocked ads on 5 channels!",
	},
	channels_20: {
		name: "Adventurer",
		icon: "🌍",
		desc: "Blocked ads on 20 channels!",
	},
	block_10000: {
		name: "Diamond",
		icon: "💎",
		desc: "Blocked 10,000 ads!",
	},
	channels_50: {
		name: "Globetrotter",
		icon: "🗺️",
		desc: "Blocked ads on 50 channels!",
	},
};

function _ensureAchievementToastStyles() {
	if (document.getElementById("ttvab-achievement-style")) return;
	const style = document.createElement("style");
	style.id = "ttvab-achievement-style";
	style.textContent =
		"#ttvab-achievement{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:#fff;padding:16px 24px;border-radius:16px;font-family:'Segoe UI',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5),0 0 20px rgba(145,70,255,.3);z-index:9999999;animation:ttvab-ach-pop .5s cubic-bezier(0.34,1.56,0.64,1);border:2px solid rgba(145,70,255,.5);display:flex;align-items:center;gap:16px}" +
		"@keyframes ttvab-ach-pop{from{opacity:0;transform:translateX(-50%) scale(.5) translateY(-20px)}to{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}}" +
		"@keyframes ttvab-ach-shine{0%{background-position:-200% center}100%{background-position:200% center}}" +
		"#ttvab-achievement .ach-icon{font-size:40px;animation:ttvab-ach-bounce 1s ease infinite}" +
		"@keyframes ttvab-ach-bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}" +
		"#ttvab-achievement .ach-content{display:flex;flex-direction:column;gap:2px}" +
		"#ttvab-achievement .ach-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#9146FF;font-weight:600}" +
		"#ttvab-achievement .ach-name{font-size:18px;font-weight:700;background:linear-gradient(90deg,#fff 0%,#9146FF 50%,#fff 100%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:ttvab-ach-shine 2s linear infinite}" +
		"#ttvab-achievement .ach-desc{font-size:12px;color:#aaa;margin-top:2px}";
	document.head?.appendChild(style);
}

function _showAchievementUnlocked(achievementId) {
	try {
		const uiFlags = _getUiFlags();
		const ach = _ACHIEVEMENT_INFO[achievementId];
		if (!ach) return;

		if (!document.body) return;
		_ensureAchievementToastStyles();
		const existing = document.getElementById("ttvab-achievement");
		if (existing) existing.remove();

		const toast = document.createElement("div");
		toast.id = "ttvab-achievement";
		const icon = document.createElement("div");
		icon.className = "ach-icon";
		icon.textContent = String(ach.icon ?? "");

		const content = document.createElement("div");
		content.className = "ach-content";

		const label = document.createElement("div");
		label.className = "ach-label";
		label.textContent = "Achievement Unlocked!";

		const name = document.createElement("div");
		name.className = "ach-name";
		name.textContent = String(ach.name ?? "");

		const desc = document.createElement("div");
		desc.className = "ach-desc";
		desc.textContent = String(ach.desc ?? "");

		content.append(label, name, desc);
		toast.append(icon, content);

		document.body.appendChild(toast);
		_log(`Achievement unlocked: ${ach.name}`, "success");

		if (uiFlags.achievementDismissTimer)
			clearTimeout(uiFlags.achievementDismissTimer);
		uiFlags.achievementDismissTimer = setTimeout(() => {
			uiFlags.achievementDismissTimer = null;
			if (toast.isConnected) {
				toast.style.animation = "ttvab-ach-pop .5s ease reverse";
				if (uiFlags.achievementRemoveTimer)
					clearTimeout(uiFlags.achievementRemoveTimer);
				uiFlags.achievementRemoveTimer = setTimeout(() => {
					uiFlags.achievementRemoveTimer = null;
					toast.remove();
				}, 500);
			}
		}, 5000);
	} catch (e) {
		_log(`Achievement error: ${e.message}`, "error");
	}
}

function _initAchievementListener() {
	const uiFlags = _getUiFlags();
	if (uiFlags.achievementListenerInitialized) return;
	uiFlags.achievementListenerInitialized = true;
	_onInternalMessage("ttvab-achievement-unlocked", (detail) => {
		const safeDetail =
			detail && typeof detail === "object" && !Array.isArray(detail)
				? detail
				: null;
		if (typeof safeDetail?.id !== "string") return;
		_showAchievementUnlocked(safeDetail.id);
	});
}
