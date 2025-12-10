/**
 * TTV AB - Worker Module
 * Web Worker management and prototype manipulation
 * @private
 */
function _getWasmJs(url) {
    const x = new XMLHttpRequest();
    x.open('GET', url, false);
    x.overrideMimeType("text/javascript");
    x.send();
    return x.responseText;
}

function _cleanWorker(w) {
    let root = null, parent = null, proto = w;
    while (proto) {
        const s = proto.toString();
        if (_S.conflicts.some(x => s.includes(x))) {
            if (parent !== null) Object.setPrototypeOf(parent, Object.getPrototypeOf(proto));
        } else {
            if (root === null) root = proto;
            parent = proto;
        }
        proto = Object.getPrototypeOf(proto);
    }
    return root;
}

function _getReinsert(w) {
    const r = [];
    let p = w;
    while (p) {
        const s = p.toString();
        if (_S.reinsertPatterns.some(x => s.includes(x))) r.push(p);
        p = Object.getPrototypeOf(p);
    }
    return r;
}

function _reinsert(w, r) {
    let p = w;
    for (let i = 0; i < r.length; i++) { Object.setPrototypeOf(r[i], p); p = r[i]; }
    return p;
}

function _isValid(w) {
    const s = w.toString();
    return !_S.conflicts.some(x => s.includes(x)) || _S.reinsertPatterns.some(x => s.includes(x));
}
