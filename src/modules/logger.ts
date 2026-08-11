// TTV AB - Logger

let _debugLogging = false;

function _formatLogText(value) {
	let text = "[Unserializable log value]";
	try {
		if (typeof value === "string") {
			text = value;
		} else if (value && typeof value === "object") {
			const seen = new WeakSet();
			let remainingNodes = 96;
			const normalize = (nestedValue, depth) => {
				if (nestedValue === null) return null;
				if (typeof nestedValue === "string") {
					return nestedValue.slice(0, 1000);
				}
				if (
					typeof nestedValue === "number" ||
					typeof nestedValue === "boolean"
				) {
					return nestedValue;
				}
				if (typeof nestedValue === "bigint") {
					return `${String(nestedValue)}n`;
				}
				if (typeof nestedValue === "undefined") return "[Undefined]";
				if (typeof nestedValue === "symbol") return "[Symbol]";
				if (typeof nestedValue === "function") return "[Function]";
				if (depth >= 4 || remainingNodes <= 0) return "[Truncated]";
				remainingNodes -= 1;
				if (seen.has(nestedValue)) return "[Circular]";
				seen.add(nestedValue);
				let isArray = false;
				try {
					isArray = Array.isArray(nestedValue);
				} catch {
					return "[Unserializable log value]";
				}
				if (isArray) {
					let length = 0;
					try {
						const observedLength = nestedValue.length;
						if (
							typeof observedLength === "number" &&
							Number.isSafeInteger(observedLength) &&
							observedLength >= 0
						) {
							length = observedLength;
						}
					} catch {}
					const itemCount = Math.min(24, length);
					const result = [];
					for (let index = 0; index < itemCount; index += 1) {
						try {
							result.push(normalize(nestedValue[index], depth + 1));
						} catch {
							result.push("[Unserializable log value]");
						}
					}
					if (length > itemCount) {
						result.push(`[${length - itemCount} more items]`);
					}
					return result;
				}
				const result = Object.create(null);
				let propertyCount = 0;
				try {
					for (const rawKey in nestedValue) {
						if (propertyCount >= 24) {
							result["[Truncated]"] = "Additional properties omitted";
							break;
						}
						if (!Object.hasOwn(nestedValue, rawKey)) {
							continue;
						}
						const key = String(rawKey).slice(0, 120);
						try {
							result[key] = normalize(nestedValue[rawKey], depth + 1);
						} catch {
							result[key] = "[Unserializable log value]";
						}
						propertyCount += 1;
					}
				} catch {
					if (propertyCount === 0) return "[Unserializable log value]";
					result["[Truncated]"] = "Property enumeration failed";
				}
				return result;
			};
			const normalized = normalize(value, 0);
			const serialized =
				normalized === "[Unserializable log value]"
					? normalized
					: JSON.stringify(normalized);
			text = typeof serialized === "string" ? serialized : String(value);
		} else {
			text = String(value);
		}
	} catch {
		try {
			text = String(value);
		} catch {}
	}

	try {
		text = String(text).slice(0, 4000);
		text = text
			.replace(
				/([?&](?:auth(?:orization)?|bearer|client[-_]?integrity|client[-_]?session(?:[-_]?id)?|cookie|device[-_]?id|integrity|nauth(?:sig)?|oauth(?:_token)?|session(?:[-_]?id)?|sig(?:nature)?|token|unique[-_]?id|x[-_]?auth[-_]?token|x[-_]?csrf[-_]?token|x[-_]?device[-_]?id)=)[^&#\s"'<>]*/gi,
				"$1[redacted]",
			)
			.replace(
				/(\b(?:cookie|set[-_ ]?cookie)\b["']?\s*:\s*["']?)[^\r\n"']+/gi,
				"$1[redacted]",
			)
			.replace(
				/(\b(?:auth(?:orization)?|client[-_ ]?integrity|client[-_ ]?session(?:[-_ ]?id)?|device[-_ ]?id|integrity|nauth(?:sig)?|oauth(?:_token)?|session(?:[-_ ]?id)?|sig(?:nature)?|token|unique[-_ ]?id|x[-_ ]?auth[-_ ]?token|x[-_ ]?csrf[-_ ]?token|x[-_ ]?device[-_ ]?id)\b["']?\s*[:=]\s*["']?)(?:basic\s+|bearer\s+|oauth\s+)?[^,&\s}"']+/gi,
				"$1[redacted]",
			)
			.replace(/\b(basic|bearer|oauth)\s+[a-z0-9._~+/=-]+/gi, "$1 [redacted]")
			.slice(0, 4000);
	} catch {
		text = "[Unserializable log value]";
	}
	return text;
}

function _enableDebugLogging() {
	_debugLogging = true;
	_log("Debug logging enabled", "debug");
}

function _log(msg, type = "info") {
	let level = "info";
	try {
		const normalizedLevel = String(type);
		if (normalizedLevel) level = normalizedLevel.slice(0, 16);
	} catch {}
	const debugEnabled =
		typeof _debugLogging !== "undefined" && _debugLogging === true;
	let text = "[Unserializable log value]";
	try {
		text = _formatLogText(msg);
	} catch {}
	let prefix = "";
	let style = "";
	try {
		prefix = _C.LOG_STYLES.prefix || "";
		style = _C.LOG_STYLES[level] || _C.LOG_STYLES.info || "";
	} catch {}

	try {
		let timestamp = 0;
		try {
			const observedAt = Date.now();
			if (
				Number.isFinite(observedAt) &&
				observedAt >= 0 &&
				observedAt <= 8640000000000000
			) {
				timestamp = Math.trunc(observedAt);
			}
		} catch {}
		const entry = { t: timestamp, l: level, m: text.slice(0, 4000) };
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
	if (level === "debug" && !debugEnabled) return;
	try {
		if (typeof console === "undefined") return;
		if (level === "error") {
			console.error(`%cTTV AB%c ${text}`, prefix, style);
		} else if (level === "warning") {
			console.warn(`%cTTV AB%c ${text}`, prefix, style);
		} else {
			console.log(`%cTTV AB%c ${text}`, prefix, style);
		}
	} catch {}
}
