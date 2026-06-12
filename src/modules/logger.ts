// TTV AB - Logger

let _debugLogging = false;

function _enableDebugLogging() {
	_debugLogging = true;
	_log("Debug logging enabled", "debug");
}

function _log(msg, type = "info") {
	const debugEnabled =
		typeof _debugLogging !== "undefined" && _debugLogging === true;
	if (type === "debug" && !debugEnabled) return;

	const text = typeof msg === "object" ? JSON.stringify(msg) : String(msg);
	const style = _C.LOG_STYLES[type] || _C.LOG_STYLES.info;

	try {
		const entry = { t: Date.now(), l: String(type), m: text };
		if (
			typeof window === "undefined" &&
			typeof self !== "undefined" &&
			typeof self.postMessage === "function"
		) {
			self.postMessage({
				__ttvabWorkerBridge: true,
				message: { key: "LogEntry", value: entry },
			});
		} else {
			if (!Array.isArray(globalThis.__TTVAB_LOGS__)) {
				globalThis.__TTVAB_LOGS__ = [];
			}
			const buffer = globalThis.__TTVAB_LOGS__;
			buffer.push(entry);
			if (buffer.length > 1200) {
				buffer.splice(0, buffer.length - 1000);
			}
		}
	} catch {}
	if (type === "error") {
		console.error(`%cTTV AB%c ${text}`, _C.LOG_STYLES.prefix, style);
	} else if (type === "warning") {
		console.warn(`%cTTV AB%c ${text}`, _C.LOG_STYLES.prefix, style);
	} else {
		console.log(`%cTTV AB%c ${text}`, _C.LOG_STYLES.prefix, style);
	}
}
