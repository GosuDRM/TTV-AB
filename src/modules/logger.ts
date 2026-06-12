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
	if (type === "error") {
		console.error(`%cTTV AB%c ${text}`, _C.LOG_STYLES.prefix, style);
	} else if (type === "warning") {
		console.warn(`%cTTV AB%c ${text}`, _C.LOG_STYLES.prefix, style);
	} else {
		console.log(`%cTTV AB%c ${text}`, _C.LOG_STYLES.prefix, style);
	}
}
