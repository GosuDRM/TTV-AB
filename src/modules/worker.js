/**
 * TTV AB - Worker Module
 * Web Worker manipulation utilities
 * @module worker
 * @private
 */

/**
 * Fetch and extract WASM JavaScript from worker URL
 * @param {string} url - Worker URL
 * @returns {string} JavaScript source
 */
function _getWasmJs(url) {
    const req = new XMLHttpRequest();
    req.open('GET', url, false);
    req.send();
    return req.responseText;
}

/**
 * Create clean Worker class without conflicts
 * @param {Function} W - Original Worker constructor
 * @returns {Function} Cleaned Worker class
 */
function _cleanWorker(W) {
    const proto = W.prototype;
    for (const key of _S.conflicts) {
        if (proto[key]) proto[key] = undefined;
    }
    return W;
}

/**
 * Get reinsert function names from Worker
 * @param {Function} W - Worker constructor
 * @returns {string[]} Function names to reinsert
 */
function _getReinsert(W) {
    const src = W.toString();
    const result = [];
    for (const pattern of _S.reinsertPatterns) {
        if (src.includes(pattern)) result.push(pattern);
    }
    return result;
}

/**
 * Reinsert functions into Worker class
 * @param {Function} W - Worker constructor
 * @param {string[]} names - Function names
 * @returns {Function} Modified Worker
 */
function _reinsert(W, names) {
    for (const name of names) {
        if (typeof window[name] === 'function') {
            W.prototype[name] = window[name];
        }
    }
    return W;
}

/**
 * Validate Worker replacement
 * @param {*} v - Value to check
 * @returns {boolean} Is valid replacement
 */
function _isValid(v) {
    if (typeof v !== 'function') return false;
    const src = v.toString();
    // Valid if no conflicts AND no reinsert patterns (both must be clean)
    return !_S.conflicts.some(c => src.includes(c)) && !_S.reinsertPatterns.some(p => src.includes(p));
}
