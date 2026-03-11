// TTV AB - Monitor

function _initCrashMonitor() {
	let isRefreshing = false;
	let checkInterval = null;
	let lastDeferredCrashAt = 0;
	let lastPlayerRecoveryAt = 0;
	let recoveryWindowStartedAt = 0;
	let recoveryAttempts = 0;
	let pendingPlayerRecoveryTimer = null;
	const PLAYER_RECOVERY_COOLDOWN_MS = 8000;
	const PLAYER_RECOVERY_WINDOW_MS = 45000;
	const MAX_PLAYER_RECOVERY_ATTEMPTS = 2;

	function isDocumentHidden() {
		const nativeVisibility = window.__TTVAB_NATIVE_VISIBILITY__;
		try {
			if (typeof nativeVisibility?.hidden === "function") {
				return nativeVisibility.hidden.call(document) === true;
			}
			if (typeof nativeVisibility?.webkitHidden === "function") {
				return nativeVisibility.webkitHidden.call(document) === true;
			}
			if (typeof nativeVisibility?.mozHidden === "function") {
				return nativeVisibility.mozHidden.call(document) === true;
			}
		} catch {}
		return document.hidden;
	}

	function detectCrash() {
		const errorElements = document.querySelectorAll(
			'[data-a-target="player-overlay-content-gate"],' +
				'[data-a-target="player-error-modal"],' +
				".content-overlay-gate," +
				".player-error",
		);

		for (const el of errorElements) {
			const text = (el.innerText || "").toLowerCase();
			const patterns = _C.CRASH_PATTERNS;
			for (let i = 0, len = patterns.length; i < len; i++) {
				if (text.includes(patterns[i].toLowerCase())) return patterns[i];
			}
		}

		return null;
	}

	function attemptPlayerRecovery(error, now) {
		if (typeof _doPlayerTask !== "function") {
			return false;
		}
		if (
			lastPlayerRecoveryAt &&
			now - lastPlayerRecoveryAt < PLAYER_RECOVERY_COOLDOWN_MS
		) {
			return false;
		}
		if (
			!recoveryWindowStartedAt ||
			now - recoveryWindowStartedAt > PLAYER_RECOVERY_WINDOW_MS
		) {
			recoveryWindowStartedAt = now;
			recoveryAttempts = 0;
		}
		if (recoveryAttempts >= MAX_PLAYER_RECOVERY_ATTEMPTS) {
			return false;
		}
		const didReload = _doPlayerTask(false, true, { reason: "player-crash" });
		if (!didReload) {
			return false;
		}
		recoveryAttempts++;
		lastPlayerRecoveryAt = now;
		_log(
			`Recovered player crash (${error}) with in-player reload (${recoveryAttempts}/${MAX_PLAYER_RECOVERY_ATTEMPTS})`,
			"warning",
		);
		if (pendingPlayerRecoveryTimer) {
			clearTimeout(pendingPlayerRecoveryTimer);
		}
		pendingPlayerRecoveryTimer = setTimeout(() => {
			const activeError = detectCrash();
			if (!activeError) {
				recoveryAttempts = 0;
				recoveryWindowStartedAt = 0;
			}
			pendingPlayerRecoveryTimer = null;
		}, 6000);
		return true;
	}

	function handleCrash(error) {
		if (isRefreshing) return;

		const now = Date.now();
		const activeAdChannel = __TTVAB_STATE__.CurrentAdChannel;
		const lastRecoveryActivity = Math.max(
			__TTVAB_STATE__.LastAdRecoveryReloadAt || 0,
			__TTVAB_STATE__.LastAdDetectedAt || 0,
		);
		if (
			error === "Error #2000" &&
			activeAdChannel &&
			lastRecoveryActivity &&
			now - lastRecoveryActivity < __TTVAB_STATE__.AdRecoveryCrashGracePeriodMs
		) {
			if (now - lastDeferredCrashAt > 2000) {
				_log(
					`Player error during ad recovery for ${activeAdChannel}; waiting before refresh`,
					"warning",
				);
				lastDeferredCrashAt = now;
			}
			return false;
		}
		if (attemptPlayerRecovery(error, now)) {
			return false;
		}

		isRefreshing = true;

		_log(`Player crash: ${error}`, "error");

		if (isDocumentHidden()) {
			_log("Tab hidden, will refresh when visible", "warning");

			const refreshTimer = setTimeout(
				() => window.location.reload(),
				_C.REFRESH_DELAY,
			);
			document.addEventListener("visibilitychange", function onVisible() {
				if (!isDocumentHidden()) {
					document.removeEventListener("visibilitychange", onVisible);
					clearTimeout(refreshTimer);
					_log("Tab visible, refreshing...", "warning");
					window.location.reload();
				}
			});
		} else {
			_log("Auto-refreshing...", "warning");

			const banner = document.createElement("div");
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

		return true;
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
				if (error && handleCrash(error)) {
					observer.disconnect();
					if (checkInterval) clearInterval(checkInterval);
				}
			} catch {}
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
		});

		checkInterval = setInterval(() => {
			if (isDocumentHidden()) return;
			try {
				const error = detectCrash();
				if (error && handleCrash(error)) {
					observer.disconnect();
					clearInterval(checkInterval);
				}
			} catch {}
		}, 5000);

		_log("Crash monitor active", "info");
	}

	start();
}
