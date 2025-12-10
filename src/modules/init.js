/**
 * TTV AB - Init Module
 * Bootstrap and initialization
 * @private
 */
function _bootstrap() {
    if (typeof window.ttvabVersion !== 'undefined' && window.ttvabVersion >= _C.INTERNAL_VERSION) {
        _log('Skipping - another script is active', 'warning');
        return false;
    }
    window.ttvabVersion = _C.INTERNAL_VERSION;
    _log('v' + _C.VERSION + ' loaded', 'info');
    return true;
}

function _initToggleListener() {
    window.addEventListener('ttvab-toggle', function (e) {
        const enabled = e.detail?.enabled ?? true;
        IsAdStrippingEnabled = enabled;
        _log('Ad blocking ' + (enabled ? 'enabled' : 'disabled'), enabled ? 'success' : 'warning');
    });
}

function _init() {
    if (!_bootstrap()) return;
    _declareState(window);
    _hookStorage();
    _hookWorker();
    _hookMainFetch();
    _initToggleListener();
    _initCrashMonitor();
    _showWelcome();
    _showDonation();
    _log('Initialized successfully', 'success');
}
