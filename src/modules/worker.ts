// TTV AB - Worker Utils

type WorkerConstructor = new (...args: unknown[]) => Worker;

function _cleanWorker(W: WorkerConstructor): WorkerConstructor {
	const CleanWorker = class extends W {};
	const proto = CleanWorker.prototype;
	for (const key of _S.conflicts) {
		if (key in proto) {
			try {
				Object.defineProperty(proto, key, {
					configurable: true,
					writable: true,
					value: undefined,
				});
			} catch {
				_log(
					`Worker property "${key}" is non-configurable, cleanup skipped`,
					"debug",
				);
			}
		}
	}
	return CleanWorker as WorkerConstructor;
}

function _getReinsert(W) {
	const src = W.toString();
	const result = [];
	for (const pattern of _S.reinsertPatterns) {
		const isIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(pattern);
		const matched = isIdentifier
			? new RegExp(`\\b${pattern}\\b`).test(src)
			: src.includes(pattern);
		if (matched) result.push(pattern);
	}
	return result;
}

function _reinsert(W, names) {
	for (const name of names) {
		if (typeof window[name] === "function") {
			try {
				W.prototype[name] = window[name];
			} catch {}
		}
	}
	return W;
}

function _isValid(v) {
	if (typeof v !== "function") return false;
	const src = v.toString();
	if (
		_S.toleratedWorkerWrappers.some((ext) =>
			ext.signatures.every((sig) => src.includes(sig)),
		)
	) {
		return true;
	}
	return (
		!_S.conflicts.some((c) => src.includes(c)) &&
		!_S.reinsertPatterns.some((p) => src.includes(p))
	);
}
