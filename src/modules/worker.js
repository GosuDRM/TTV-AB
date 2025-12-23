// TTV AB - Worker Utils

function _getWasmJs(url) {
    const req = new XMLHttpRequest();
    req.open('GET', url, false);
    req.send();
    return req.responseText;
}

function _cleanWorker(W) {
    const proto = W.prototype;
    for (const key of _S.conflicts) {
        if (proto[key]) proto[key] = undefined;
    }
    return W;
}

function _getReinsert(W) {
    const src = W.toString();
    const result = [];
    for (const pattern of _S.reinsertPatterns) {
        if (src.includes(pattern)) result.push(pattern);
    }
    return result;
}

function _reinsert(W, names) {
    for (const name of names) {
        if (typeof window[name] === 'function') {
            W.prototype[name] = window[name];
        }
    }
    return W;
}

function _isValid(v) {
    if (typeof v !== 'function') return false;
    const src = v.toString();
    return !_S.conflicts.some(c => src.includes(c)) && !_S.reinsertPatterns.some(p => src.includes(p));
}
