// TTV AB - Logger

// biome-ignore lint/style/useConst: tests and local debugging reassign this flag to print debug lines
let _debugLogging = false;

function _formatLogText(value) {
	const controlCharacters =
		// biome-ignore lint/suspicious/noControlCharactersInRegex: Strip control characters before credential matching.
		/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;
	const sensitiveKey =
		/^(?:auth(?:orization)?|bearer|clientid|clientintegrity|clientsession(?:id)?|cookie|setcookie|deviceid|did|integrity|nauth(?:sig)?|oauth(?:token)?|accesstoken|refreshtoken|session(?:id)?|sig(?:nature)?|token|uniqueid|userid|uid|xauthtoken|xcsrftoken|xdeviceid)$/i;
	const redact = (source) =>
		source
			.slice(0, 4000)
			.replace(controlCharacters, "")
			.replace(/(?:blob:)?https?:\/\/[^\s<>"']+/gi, (rawUrl) => {
				if (!rawUrl.includes("@")) return rawUrl;
				try {
					const blob = rawUrl.toLowerCase().startsWith("blob:");
					const url = new URL(blob ? rawUrl.slice(5) : rawUrl);
					if (!url.username && !url.password) return rawUrl;
					url.username = "";
					url.password = "";
					return `${blob ? "blob:" : ""}${url.href}`;
				} catch {
					return "[redacted-url]";
				}
			})
			.replace(
				/([?&#])([^=&#\s"'<>]+)=([^&#\s"'<>]*)/g,
				(match, separator, key) => {
					try {
						return sensitiveKey.test(
							decodeURIComponent(key)
								.replace(controlCharacters, "")
								.replace(/[-_\s]/g, ""),
						)
							? `${separator}${key}=[redacted]`
							: match;
					} catch {
						return `${separator}${key}=[redacted]`;
					}
				},
			)
			.replace(
				/(\b(?:cookie|set[-_ ]?cookie)\b["']?\s*:\s*["']?)[^\r\n"']+/gi,
				"$1[redacted]",
			)
			.replace(
				/(\b(?:auth(?:orization)?|client[-_ ]?id|client[-_ ]?integrity|client[-_ ]?session(?:[-_ ]?id)?|device[-_ ]?id|did|integrity|nauth(?:sig)?|oauth(?:[-_ ]?token)?|access[-_ ]?token|refresh[-_ ]?token|session(?:[-_ ]?id)?|sig(?:nature)?|token|unique[-_ ]?id|user[-_ ]?id|uid|x[-_ ]?auth[-_ ]?token|x[-_ ]?csrf[-_ ]?token|x[-_ ]?device[-_ ]?id)\b["']?\s*[:=]\s*)("(?:\\.|[^"\\])*(?:"|$)|'(?:\\.|[^'\\])*(?:'|$)|(?:basic\s+|bearer\s+|oauth\s+)?[^,&\s}"']+)/gi,
				(_match, prefix, credential) => {
					const quote = credential[0];
					return `${prefix}${quote === '"' || quote === "'" ? `${quote}[redacted]${quote}` : "[redacted]"}`;
				},
			)
			.replace(/\b(basic|bearer|oauth)\s+[a-z0-9._~+/=-]+/gi, "$1 [redacted]")
			.slice(0, 4000);
	let text = "[Unserializable log value]";
	try {
		if (
			typeof value === "string" &&
			value.length <= 4000 &&
			/^\s*(?:\{|\[\s*[[{"\d-])/.test(value)
		) {
			try {
				value = JSON.parse(value);
			} catch {}
		}
		if (typeof value === "string") {
			text = value;
		} else if (value && typeof value === "object") {
			const seen = new WeakSet();
			let remainingNodes = 96;
			let remainingCharacters = 4000;
			const normalize = (nestedValue, depth) => {
				if (remainingCharacters <= 0) return "[Truncated]";
				if (nestedValue === null) return null;
				if (typeof nestedValue === "string") {
					const bounded = nestedValue.slice(
						0,
						Math.min(1000, remainingCharacters),
					);
					remainingCharacters -= bounded.length;
					return redact(bounded);
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
						if (remainingCharacters <= 0) {
							result.push("[Truncated]");
							break;
						}
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
				const appendProperty = (rawKey) => {
					const key = redact(String(rawKey).slice(0, 120));
					propertyCount += 1;
					if (Object.hasOwn(result, key)) return;
					remainingCharacters -= key.length;
					if (
						sensitiveKey.test(
							key.replace(controlCharacters, "").replace(/[-_\s]/g, ""),
						)
					) {
						result[key] = "[redacted]";
					} else {
						try {
							result[key] = normalize(nestedValue[rawKey], depth + 1);
						} catch {
							result[key] = "[Unserializable log value]";
						}
					}
				};
				try {
					const tag = Object.prototype.toString.call(nestedValue);
					if (tag === "[object Error]" || tag === "[object DOMException]") {
						for (const key of ["name", "message", "stack", "cause"]) {
							if (remainingCharacters <= 0) break;
							if (key in nestedValue) appendProperty(key);
						}
					}
				} catch {}
				try {
					for (const rawKey in nestedValue) {
						if (propertyCount >= 24 || remainingCharacters <= 0) {
							result["[Truncated]"] = "Additional properties omitted";
							break;
						}
						if (!Object.hasOwn(nestedValue, rawKey)) {
							continue;
						}
						appendProperty(rawKey);
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
			if (typeof serialized === "string") return serialized.slice(0, 4000);
			text = String(value);
		} else {
			text = String(value);
		}
	} catch {
		try {
			text = String(value);
		} catch {}
	}

	try {
		text = redact(String(text));
	} catch {
		text = "[Unserializable log value]";
	}
	return text;
}

const _PAGE_LOG_MILESTONE_PATTERN =
	/\bv\d+\.\d+\.\d+ loaded|Stream initialized:|Ad detected, blocking|Ad blocked!|\[Break\] (?:ended|superseded)|Native playback restored|Post-ad recovery reached|Worker #g\d+ error|Worker restart limit reached|Worker recovery timed out/;

function _isPageLogMilestone(entry) {
	return Boolean(
		entry?.l === "error" ||
			(typeof entry?.m === "string" &&
				_PAGE_LOG_MILESTONE_PATTERN.test(entry.m.slice(0, 300))),
	);
}

function _appendPageLogEntry(entry) {
	if (!Array.isArray(globalThis.__TTVAB_LOGS__)) {
		globalThis.__TTVAB_LOGS__ = [];
	}
	const buffer = globalThis.__TTVAB_LOGS__;
	buffer.push(entry);
	if (buffer.length <= 3600) return;
	const trimmed = buffer.splice(0, buffer.length - 3000);
	globalThis.__TTVAB_LOGS_DROPPED__ =
		Math.max(0, Number(globalThis.__TTVAB_LOGS_DROPPED__) || 0) +
		trimmed.length;
	if (!Array.isArray(globalThis.__TTVAB_LOG_MILESTONES__)) {
		globalThis.__TTVAB_LOG_MILESTONES__ = [];
	}
	const milestones = globalThis.__TTVAB_LOG_MILESTONES__;
	for (const trimmedEntry of trimmed) {
		if (_isPageLogMilestone(trimmedEntry)) milestones.push(trimmedEntry);
	}
	if (milestones.length > 40) milestones.splice(0, milestones.length - 40);
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
				message: { key: "LogEntry", value: entry } satisfies TTVABWorkerEvent,
			});
		} else {
			_appendPageLogEntry(entry);
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
