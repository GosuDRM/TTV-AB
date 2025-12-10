/**
 * TTV AB - Init Module
 * Bootstrap and initialization
 * @module init
 * @private
 */

/**
 * Check for conflicts and set up version tracking
 * @returns {boolean} True if initialization should continue
 */
function _bootstrap() {
    // Skip if newer version is already running
    if (typeof window.ttvabVersion !== 'undefined' && window.ttvabVersion >= _C.INTERNAL_VERSION) {
        _log('Skipping - another script is active', 'warning');
        return false;
    }

    window.ttvabVersion = _C.INTERNAL_VERSION;
    _log('v' + _C.VERSION + ' loaded', 'info');
    return true;
}

/**
 * Set up toggle listener for enable/disable
 */
function _initToggleListener() {
    window.addEventListener('ttvab-toggle', function (e) {
        const enabled = e.detail?.enabled ?? true;
        IsAdStrippingEnabled = enabled;
        // Broadcast to workers
        for (const worker of _S.workers) {
            worker.postMessage({ key: 'UpdateToggleState', value: enabled });
        }
        _log('Ad blocking ' + (enabled ? 'enabled' : 'disabled'), enabled ? 'success' : 'warning');
    });
}

/**
 * Main initialization function
 */
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
