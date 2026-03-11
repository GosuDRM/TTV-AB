// TTV AB - Monitor

function _initCrashMonitor() {
	let checkInterval = null;
	let lastDeferredCrashAt = 0;

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

	function handleCrash(error) {
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
					`Player error during ad recovery for ${activeAdChannel}; waiting before in-player recovery`,
					"warning",
				);
				lastDeferredCrashAt = now;
			}
			return false;
		}
		if (now - lastDeferredCrashAt > 5000) {
			_log(
				`Player crash detected (${error}) but whole-page refresh is disabled`,
				"error",
			);
			lastDeferredCrashAt = now;
		}
		return false;
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
